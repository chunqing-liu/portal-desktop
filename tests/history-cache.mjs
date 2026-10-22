// Exercise production cache transactions in an isolated, real browser IndexedDB.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { chromium } from 'playwright';
const { outputFiles } = await build({ entryPoints: ['desktop/renderer/chat/services/history-cache.ts'], bundle: true, write: false, format: 'iife', globalName: 'HistoryCacheModule', platform: 'browser' });
const server = createServer((request, response) => { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Isolated cache test</title>'); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : { channel: 'chrome' }) });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.addScriptTag({ content: outputFiles[0].text });
  const result = await page.evaluate(async () => {
    const { HistoryCache } = HistoryCacheModule;
    let cache = new HistoryCache(location.origin);
    const rows = Array.from({ length: 260 }, (_, i) => ({ seq: i + 1, role: i % 2 ? 'being' : 'user', content: `message ${i + 1}`, scene_id: i < 220 ? 'old' : 'recent', at: '2026-10-01T00:00:00Z', scene_label: 'Known room' }));
    await cache.write(rows, 260);
    // Duplicate pages with absent/empty metadata must not remove scene indexing.
    await Promise.all([
      cache.write([{ seq: 2, role: 'being', content: 'updated reply' }, { seq: 2, role: 'being', content: 'updated reply', scene_id: '' }], 2),
      cache.write([{ seq: 1, role: 'user', content: 'updated question', scene_id: undefined }], 1),
      cache.write([], 0),
    ]);
    cache.close(); cache = new HistoryCache(location.origin);
    const all = await cache.read(), scene = await cache.readScene('old', 60);
    const loaded = [...scene];
    while (true) {
      const page = await cache.readBefore(loaded[0].seq, 40, row => row.scene_id === 'old');
      if (!page.length) break;
      loaded.unshift(...page);
    }
    // Missing history rows are retained, and another scene stays isolated.
    const recent = await cache.readScene('recent');
    const around = await cache.readAround(25,'old'), edge = await cache.readAround(1,'old'), missing = await cache.readAround(25,'missing');
    await cache.write([{seq:800,role:'user',content:'Target beyond sync cursor',scene_id:'old'}],0);
    cache.close(); cache = new HistoryCache(location.origin);
    const afterTarget = await cache.read(1);
    cache.close();
    cache = new HistoryCache(location.origin+'/target-only');
    await cache.write([{seq:800,role:'user',content:'First cache write is a target'}],0);
    cache.close(); cache = new HistoryCache(location.origin+'/target-only');
    const targetOnly = await cache.read(); cache.close();
    return { afterTarget, targetOnly, around:around.map(row=>row.seq), edge:edge.map(row=>row.seq), missing, count: all.messages.length, cursor: all.lastSeq, oldest: all.messages.slice(0, 2), visible: scene.length, loaded: loaded.map(row => row.seq), recent: recent.map(row => row.seq) };
  });
  assert.equal(result.afterTarget.messages[0].seq,800);
  assert.equal(result.afterTarget.lastSeq,260,'Targeted fetch must not skip unsynchronized rows after reload');
  assert.equal(result.targetOnly.lastSeq,0,'Target-only cache must start normal sync from zero');
  assert.deepEqual(result.around, Array.from({length:21},(_,i)=>i+15));
  assert.deepEqual(result.edge, Array.from({length:11},(_,i)=>i+1));
  assert.deepEqual(result.missing, []);
  assert.equal(result.count, 260);
  assert.equal(result.cursor, 260);
  assert.equal(result.visible, 60);
  assert.deepEqual(result.loaded, Array.from({ length: 220 }, (_, i) => i + 1));
  assert.deepEqual(result.recent, Array.from({ length: 40 }, (_, i) => i + 221));
  assert.deepEqual(result.oldest.map(row => [row.seq, row.content, row.scene_id, row.scene_label, row.at]), [
    [1, 'updated question', 'old', 'Known room', '2026-10-01T00:00:00Z'],
    [2, 'updated reply', 'old', 'Known room', '2026-10-01T00:00:00Z'],
  ]);
  console.log('PASS: real IndexedDB unions pages by seq, preserves scene metadata, retains 260 rows across reopen and loads all 220 old-scene rows.');
} finally { await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
