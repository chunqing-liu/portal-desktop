import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const assets = new Map(await Promise.all(['loom.html', 'chat.js', 'chat.css', 'highlight.css', 'iui-runtime.html'].map(async f => ['/' + f, await readFile('desktop/generated/' + f)])));
const policy = (await readFile('desktop/main/app/protocol.ts', 'utf8')).match(/const CHAT_CONTENT_SECURITY_POLICY = "([^"]+)"/)[1];
const source = JSON.stringify({ version: 1, title: '实时预算', state: { count: 8 }, body: [
  { id: 'count', type: 'slider', label: '人数', bind: 'count', min: 1, max: 50 },
  { id: 'total', type: 'metric', label: '费用', value: { op: 'mul', args: [{ state: 'count' }, 29] } },
  { id: 'specs', type: 'table', label: '车型规格', columns: ['车型', '参考价格'], rows: Array.from({ length: 28 }, (_, i) => ['车型 ' + (i + 1), 1000 + i * 200]) },
  { id: 'end', type: 'text', value: '界面底部：全部车型已展示' },
] });
const split = source.indexOf(',{"id":"total"');
const sends = [];
let pending;
const event = (name, data) => pending.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const json = value => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); };
  if (url.pathname === '/api/history') return json({ messages: [] });
  if (url.pathname === '/health') return res.end('OK fixture');
  if (url.pathname === '/api/stream/active') { res.writeHead(204); return res.end(); }
  if (url.pathname === '/api/chat/stream') {
    let body = ''; for await (const part of req) body += part;
    sends.push(JSON.parse(body)); pending = res;
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    event('content_block_delta', { delta: { text: '```intelligent-ui\n' + source.slice(0, split) + ',' } });
    return;
  }
  if (url.pathname === '/loom.html') res.setHeader('Content-Security-Policy', policy.replace('beings://chat/', `http://127.0.0.1:${server.address().port}/`));
  if (assets.has(url.pathname)) { res.setHeader('Content-Type', url.pathname.endsWith('.js') ? 'text/javascript' : url.pathname.endsWith('.css') ? 'text/css' : 'text/html'); return res.end(assets.get(url.pathname)); }
  return json({ sbs_enabled: false, being_name: 'Fixture', presets: [] });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/loom.html?scene_id=desktop-fixture`);
  await page.getByRole('button', { name: 'Intelligent UI Beta 设置' }).click();
  const toggle = page.getByRole('switch', { name: '启用智能 UI' });
  assert.equal(await toggle.isChecked(), false);
  await toggle.check();
  await page.reload();
  await page.getByRole('button', { name: 'Intelligent UI Beta 设置' }).click();
  assert.equal(await toggle.isChecked(), true);
  await page.getByText('体验本地交互示例', {exact:true}).click();
  await page.getByLabel('选择交互示例').selectOption('simulation');
  await page.locator('.iui-app svg').waitFor();
  assert.equal(await page.getByText('正在准备交互体验…', {exact:true}).count(), 0);
  await page.getByRole('button', {name:'暂停',exact:true}).click();
  await page.getByRole('button', {name:'播放',exact:true}).click();
  await page.getByRole('button', {name:'重新启动',exact:true}).click();
  await page.locator('.iui-app svg').waitFor();

  await page.locator('.iui-playground-actions').getByRole('button', { name: '关闭智能界面设置' }).click();
  // Filled drafts used to activate an older :has() rule that moved send onto the textarea.
  for (const web of [false, true]) {
    const webStyle = web ? await page.addStyleTag({ content: await readFile('web/chat.css', 'utf8') }) : null;
    for (const width of [1280, 375, 320]) {
      await page.setViewportSize({ width, height: 800 });
      for (const draft of ['', '给我一个实时预算', '第一行\n第二行\n较长的多行输入内容']) {
        await page.getByRole('textbox', { name: 'message input' }).fill(draft);
        const boxes = await page.evaluate(() => ['[aria-label="Intelligent UI Beta 设置"]', '[aria-label="添加附件"]', '#input', '#send-btn'].map(selector => {
          const r = document.querySelector(selector).getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width };
        }));
        // RichComposer places text above the action row; assert actual rectangle separation.
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], b = boxes[j];
          assert.ok(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top, `composer overlap: web=${web}, width=${width}, draft=${draft}`);
        }
        assert.ok(boxes[2].width > 50);
        assert.ok(boxes.at(-1).right <= width);
      }
    }
    await webStyle?.evaluate(el => el.remove());
  }
  await page.setViewportSize({ width: 375, height: 800 });
  await page.getByRole('textbox', { name: 'message input' }).fill('给我一个实时预算');
  await page.screenshot({ path: 'test-results/intelligent-ui-composer-fixed.png' });
  await page.getByRole('button', {name:'本条使用智能 UI',exact:true}).click();
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  assert.equal(await page.getByRole('button',{name:'本条使用智能 UI',exact:true}).getAttribute('aria-pressed'),'false');
  await page.getByRole('slider', { name: '人数' }).waitFor();
  assert.ok(sends[0].message.includes('[客户端 Intelligent UI Beta 上下文]'));
  assert.equal(await page.locator('.message.user .content').last().textContent(), '给我一个实时预算');
  await page.getByRole('slider', { name: '人数' }).fill('10');
  event('content_block_delta', { delta: { text: source.slice(split + 1) + '\n```' } });
  event('message_stop', {}); pending.end();
  await page.waitForFunction(() => document.querySelector('.iui-metric output')?.textContent === '290');
  await page.locator('#messages').hover();
  await page.mouse.wheel(0, -1500);
  await page.locator('#chat-jump-latest').click();
  await page.waitForFunction(() => { const el = document.querySelector('#messages'); return el.scrollHeight - el.scrollTop - el.clientHeight < 2; });
  assert.equal(await page.getByText('界面底部：全部车型已展示', { exact: true }).isVisible(), true);
  const bottom = await page.getByText('界面底部：全部车型已展示', { exact: true }).boundingBox();
  const composer = await page.locator('#input-area').boundingBox();
  assert.ok(bottom.y + bottom.height <= composer.y, 'The last UI element must be above the composer');
  await page.setViewportSize({ width: 375, height: 800 });
  await page.getByRole('button', { name: 'Intelligent UI Beta 设置' }).click();
  await page.screenshot({ path: 'test-results/intelligent-ui-beta.png' });
  await toggle.uncheck();
  assert.equal(await page.getByRole('slider').count(), 1); // Existing artifacts stay readable when generation is disabled.
  assert.deepEqual(errors, []);
  console.log('Chat Beta: default off, saved toggle, automatic context, clean user bubble, progressive stream, preserved input, disabled fallback passed.');
} finally { pending?.end(); await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
