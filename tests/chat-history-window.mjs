// Exercise the actual bundled React chat against a local protocol fixture.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const assets = new Map(await Promise.all(['loom.html', 'chat.js', 'chat.css', 'highlight.css'].map(async file => ['/' + file, await readFile('desktop/generated/' + file)])));
let seq = 1, heldResponse = null;
const history = [];
for (let i = 0; i < 100; i++) {
  for (const role of ['user', 'being']) history.push({ seq: seq++, role, content: `${role} 历史 ${i}\n\n第二段\n\n第三段`, scene_id: 'desktop-fixture', at: new Date().toISOString() });
}
const event = (response, name, data) => response.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const json = data => { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(data)); };
  if (url.pathname === '/api/history') return json({ messages: history });
  if (url.pathname === '/api/status') return json({ being_name: 'Willow' });
  if (url.pathname === '/api/llm/config') return json({ sbs_enabled: false });
  if (url.pathname === '/api/stream/active') { response.writeHead(204); response.end(); return; }
  if (url.pathname === '/api/chat/stream') {
    for await (const chunk of request) {} // Consume the request before holding the stream open.
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    heldResponse = response;
    event(response, 'meta', { stream_id: 'scroll-fixture' });
    event(response, 'thinking', { text: '思考中' });
    event(response, 'content_block_delta', { delta: { text: '开始回复。' } });
    return;
  }
  if (assets.has(url.pathname)) {
    response.setHeader('Content-Type', url.pathname.endsWith('.js') ? 'text/javascript' : url.pathname.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8');
    response.end(assets.get(url.pathname)); return;
  }
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.end(`<!doctype html><html><meta charset="utf-8"><style>body{margin:0}iframe{border:0;width:100vw;height:100vh}</style><iframe id="chat" src="/loom.html?revision=fixture&scene_id=desktop-fixture&scene_label=Desktop"></iframe><script>
    window.received=[];
    window.addEventListener('message', event => {
      if(event.source!==document.querySelector('iframe').contentWindow) return;
      window.received.push(event.data);
      if(event.data.type==='beings:scene-capture') event.source.postMessage({type:'beings:scene-captured',id:event.data.id},location.origin);
    });
  </script></html>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({headless:true,channel:'chrome'});
  const page = await browser.newPage({viewport:{width:1100,height:850}});
  page.setDefaultTimeout(15000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);
  const frame=page.frameLocator('#chat');
  await frame.getByText('being 历史 99',{exact:true}).waitFor();
  const count=()=>frame.locator('.message').count();
  assert.ok(await count()<=40, 'Initial history must render only the latest page');
  const messages=frame.locator('#messages');
  await messages.hover();
  await page.mouse.wheel(0,-100000);
  await page.waitForFunction(() => document.querySelector('#chat').contentDocument.querySelectorAll('.message').length > 40);
  await frame.locator('.history-page-loading').waitFor({state:'detached'});
  const anchor=await messages.evaluate(el=>{
    const top=el.getBoundingClientRect().top;
    const node=[...el.querySelectorAll('.message')].find(n=>n.getBoundingClientRect().bottom>top+2);
    return {id:node.dataset.messageId,offset:node.getBoundingClientRect().top-top};
  });
  const before=await count();
  await page.waitForTimeout(400);
  const offset=await messages.evaluate((el,id)=>el.querySelector(`[data-message-id="${id}"]`).getBoundingClientRect().top-el.getBoundingClientRect().top,anchor.id);
  assert.ok(Math.abs(offset-anchor.offset)<3,'Reading position must settle without jumping after prepend');
  assert.ok(before>40,'Scrolling to top loads older history');
  // Load more and keep the existing bubbles mounted throughout each page.
  const stable=await frame.locator('.message').last().getAttribute('data-message-id');
  for(let i=0;i<3;i++){
    const previousCount=await count();
    await messages.hover();await page.mouse.wheel(0,-100000);
    await page.waitForFunction(previous => document.querySelector('#chat').contentDocument.querySelectorAll('.message').length > previous,previousCount);
    await frame.locator('.history-page-loading').waitFor({state:'detached'});
    assert.equal(await frame.locator(`[data-message-id="${stable}"]`).count(),1);
  }
  assert.ok(await count()>before);
  await page.reload();
  await frame.getByText('being 历史 99',{exact:true}).waitFor();
  assert.ok(await count()<=60,'Cached reload must also bound initial history');
  assert.deepEqual(errors,[]);
  console.log('PASS: bounded initial/cache history, incremental prepend, stable reader and retained DOM.');
} finally {await browser?.close();heldResponse?.end();server.closeAllConnections();await new Promise(r=>server.close(r));}
