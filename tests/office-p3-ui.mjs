import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const browser = await chromium.connectOverCDP('http://127.0.0.1:9224');
const page = browser.contexts().flatMap(context => context.pages()).find(candidate => candidate.url().includes('5174'));
assert(page, 'P3 isolated renderer must use 9224 / 5174');
const results = [], prefix = 'p3-' + Date.now(), ids = ['a', 'b', 'c', 'd'].map(id => prefix + '-' + id);
const record = name => { results.push(name); console.log('PASS ' + name); };
let event = 0, heartbeat;
const online = new Set(ids);
const send = async (beingId, fields) => {
  const input = { beingId, runId: prefix, eventId: prefix + '-event-' + ++event, ...fields };
  const receipt = await page.evaluate(input => window.beings.officeReport(input), input);
  assert(receipt.accepted, JSON.stringify(receipt)); return input;
};
const phase = value => page.waitForFunction(value => document.querySelector('[data-meeting-phase]')?.getAttribute('data-meeting-phase') === value, value, { timeout: 90000 });
const clean = () => page.waitForFunction(() => window.__officeP3.runtime.snapshot().resources.every(resource => !resource.holders.length), undefined, { timeout: 90000 });
try {
  const existing = await page.evaluate(() => window.beings.officeSnapshot());
  for (const entry of existing.entries.filter(entry => !entry.identity.demo)) {
    const runOrder = Date.now();
    const receipt = await page.evaluate(input => window.beings.officeTestInject(input), { type: 'unregister', beingId: entry.identity.id, runId: 'cleanup-' + runOrder, runOrder, eventOrder: 1, eventId: prefix + '-cleanup-' + entry.identity.id });
    assert(receipt.accepted, JSON.stringify(receipt));
  }
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.evaluate(() => { localStorage.removeItem('beings:star-map:v4'); localStorage.setItem('starmap-office-open', 'true'); });
  await page.reload();
  await page.evaluate(async () => {
    const loaded = modulePath => performance.getEntriesByType('resource').find(entry => new URL(entry.name).pathname === modulePath)?.name || modulePath;
    const { OfficeRuntime } = await import(loaded('/pipeline/office/vendor/runtime/OfficeRuntime.ts'));
    const { StarmapScene } = await import(loaded('/pipeline/office/scene.ts'));
    const { actorPixels } = await import('/pipeline/office/vendor/scene/gridProjection.ts');
    window.__officeP3 = { ticks: 0, renders: 0, maxJump: 0, activeBeforeArrival: false, runtimes: [], tickSamples: [] };
    const metrics = window.__officeP3;
    const originalTick = OfficeRuntime.prototype.tick;
    OfficeRuntime.prototype.tick = function(dt) {
      metrics.runtime = this; metrics.ticks++;
      const before = this.readActors(); const started = performance.now();
      originalTick.call(this, dt);
      const duration = performance.now() - started;
      metrics.maxTickMs = Math.max(metrics.maxTickMs || 0, duration);
      metrics.tickSamples.push(duration); if (metrics.tickSamples.length > 4096) metrics.tickSamples.shift();
      this.readActors().forEach(actor => {
        const prior = before.find(item => item.id === actor.id); if (!prior) return;
        const previous = actorPixels(prior), current = actorPixels(actor);
        metrics.maxJump = Math.max(metrics.maxJump, Math.hypot(current.x - previous.x, current.y - previous.y));
      });
      const view = document.querySelector('[data-meeting-phase]');
      if (view?.getAttribute('data-meeting-phase') === 'active' && [...view.querySelectorAll('[data-meeting-member]')].filter(item => !['left', 'failed', 'leaving', 'returning'].includes(item.getAttribute('data-member-state'))).some(item => item.getAttribute('data-member-state') !== 'present')) metrics.activeBeforeArrival = true;
    };
    const observed = new WeakSet();
    const capture = scene => {
      metrics.scene = scene; metrics.runtime = scene.runtime;
      if (!scene.app || observed.has(scene.app)) return;
      observed.add(scene.app);
      const render = scene.app.renderer.render.bind(scene.app.renderer);
      scene.app.renderer.render = (...args) => { metrics.renders++; return render(...args); };
    };
    const changed = StarmapScene.prototype.changed;
    StarmapScene.prototype.changed = function() { capture(this); return changed.call(this); };
    const originalMount = StarmapScene.prototype.mount;
    StarmapScene.prototype.mount = async function(element) {
      await originalMount.call(this, element); capture(this);
    };
    const replaceRuntime = StarmapScene.prototype.replaceRuntime;
    StarmapScene.prototype.replaceRuntime = function(runtime) { metrics.runtimes.push(this.runtime); const result = replaceRuntime.call(this, runtime); capture(this); return result; };
  });
  await page.locator('#options-home button').filter({ hasText: '小镇' }).evaluate(button => button.click());
  await page.locator('.place-switcher button').filter({ hasText: '星图' }).click();
  for (const id of ids) { await send(id, { type: 'register', identity: { id, name: '白板伙伴 ' + id.slice(-1), owners: [id], assignedUsers: [], color: 0x7799aa, demo: false } }); await send(id, { type: 'presence', status: 'working', lastSeen: Date.now(), summary: '协作中' }); }
  await page.waitForFunction(ids => window.__officeP3.runtime && ids.every(id => window.__officeP3.runtime.readActors().some(actor => actor.id === id)), ids);
  heartbeat = setInterval(() => { void (async () => { for (const id of online) await send(id, { type: 'presence', status: 'working', lastSeen: Date.now() }); })().catch(error => console.error(error)); }, 8000);
  const baseline = await page.evaluate(() => localStorage.getItem('beings:star-map:v4'));
  const sessionId = prefix + '-session';
  const subscriptions = await page.evaluate(() => window.__officeP3.runtime.listeners.size);
  const startEvent = await send(ids[0], { type: 'meeting-start', sessionId, participantIds: ids.slice(0, 3), summary: '授权讨论摘要' });
  await phase('arriving');
  assert.equal(await page.evaluate(() => window.__officeP3.runtime.readWorld().props.find(prop => prop.id === 'collab-board').state.title), '白板协作');
  await phase('active');
  assert.equal(await page.locator('[data-member-state=present]').count(), 3);
  assert.equal(await page.evaluate(() => window.__officeP3.activeBeforeArrival), false);
  record('2–4 person discussion becomes active only after every current participant arrives');
  await send(ids[3], { type: 'meeting-join', sessionId }); await phase('arriving'); await phase('active');
  assert.equal(await page.locator('[data-member-state=present]').count(), 4);
  await send(ids[0], { type: 'cancel', targetEventId: startEvent.eventId });
  await page.waitForFunction(id => document.querySelector('[data-meeting-member="' + id + '"]')?.getAttribute('data-member-state') === 'left', ids[0], { timeout: 90000 });
  assert.equal(await page.locator('[data-member-state=present]').count(), 3);
  assert.equal(await page.locator('[data-meeting-phase]').getAttribute('data-meeting-phase'), 'active');
  online.delete(ids[2]);
  await send(ids[2], { type: 'presence', status: 'offline', lastSeen: Date.now() });
  await page.waitForFunction(id => document.querySelector('[data-meeting-member="' + id + '"]')?.getAttribute('data-member-state') === 'left', ids[2], { timeout: 90000 });
  assert.equal(await page.locator('[data-member-state=present]').count(), 2);
  assert.equal(await page.locator('[data-meeting-phase]').getAttribute('data-meeting-phase'), 'active');
  online.add(ids[2]); await send(ids[2], { type: 'presence', status: 'working', lastSeen: Date.now() });
  record('initiator cancellation and participant offline leave survivors active; joining uses an independent whiteboard slot');
  await send(ids[1], { type: 'meeting-end', sessionId }); await phase('ended'); await clean();
  assert((await page.evaluate(() => window.__officeP3.maxJump)) < 35, 'no coordinate jump across a render tick');
  record('path movement and return-home remain continuous without teleporting');
  assert.equal(await page.evaluate(() => localStorage.getItem('beings:star-map:v4')), baseline);
  record('meeting start/join/leave/end never writes pipeline task data');

  for (const stage of ['waiting', 'rising', 'walking', 'active', 'returning']) {
    const currentSession = prefix + '-' + stage;
    await send(ids[0], { type: 'meeting-start', sessionId: currentSession, participantIds: ids.slice(0, 2), summary: stage + '取消验证' });
    if (stage === 'rising') await page.waitForFunction(id => Boolean(window.__officeP3.runtime.readActors().find(actor => actor.id === id)?.seatTransition), ids[0]);
    if (stage === 'walking') await page.waitForFunction(id => Boolean(window.__officeP3.runtime.readActors().find(actor => actor.id === id)?.step), ids[0]);
    if (stage === 'active' || stage === 'returning') await phase('active');
    if (stage === 'returning') { await send(ids[0], { type: 'meeting-end', sessionId: currentSession }); await page.waitForFunction(() => Boolean(document.querySelector('[data-member-state=returning]'))); }
    const toggle = page.locator('.office-heading > button').first();
    await toggle.click();
    if (stage !== 'returning') { await phase('paused'); await send(ids[0], { type: 'meeting-end', sessionId: currentSession }); }
    await clean();
    assert.equal(await page.evaluate(() => window.__officeP3.scene.app.ticker.started), false);
    const counts = await page.evaluate(() => ({ ticks: window.__officeP3.ticks, renders: window.__officeP3.renders }));
    await page.waitForTimeout(350);
    assert.deepEqual(await page.evaluate(() => ({ ticks: window.__officeP3.ticks, renders: window.__officeP3.renders })), counts);
    await toggle.click();
  }
  record('cancelling queued/rising/walking/active/returning stages eventually releases all resources');
  record('hidden office stops Pixi ticker and performs no continuous rendering after finite settlement');

  await page.locator('.office-reduced input').check();
  const reducedSession = prefix + '-reduced';
  await send(ids[0], { type: 'meeting-start', sessionId: reducedSession, participantIds: ids.slice(0, 2), summary: '减少动态仍保留真实路径' });
  await phase('active'); await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => window.__officeP3.scene.app.ticker.started), false);
  const count = await page.evaluate(() => window.__officeP3.renders); await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => window.__officeP3.renders), count);
  await send(ids[0], { type: 'meeting-end', sessionId: reducedSession }); await phase('ended'); await clean();
  record('reduced motion suppresses decorative frames but retains real arrival and return paths');
  await page.locator('.office-reduced input').uncheck();
  await page.locator('.place-switcher button').filter({ hasText: '篝火' }).click();
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.__officeP3.scene.app.ticker.started), false);
  const hiddenRenders = await page.evaluate(() => window.__officeP3.renders); await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.__officeP3.renders), hiddenRenders);
  record('switching views disables rendering just like folding the office');
  assert.equal(await page.evaluate(() => window.__officeP3.runtime.listeners.size), subscriptions);
  assert((await page.evaluate(() => window.__officeP3.runtimes.map(runtime => runtime.listeners.size))).every(count => count === 0));
  console.log('METRICS ' + JSON.stringify(await page.evaluate(() => ({ maxStepPixels: window.__officeP3.maxJump, maxTickMs: window.__officeP3.maxTickMs, p95TickMs: [...window.__officeP3.tickSamples].sort((left, right) => left - right)[Math.floor(window.__officeP3.tickSamples.length * .95)], retiredRuntimeListeners: window.__officeP3.runtimes.map(runtime => runtime.listeners.size) }))));
  console.log('SUMMARY ' + results.length + '/' + results.length + ' PASS');
} finally { clearInterval(heartbeat); await browser.close(); }
