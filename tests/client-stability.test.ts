import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BackgroundPoll } from '../desktop/main/app/background-poll';
import { ClientErrorLog } from '../desktop/main/app/error-log';
import { BackgroundPortal } from '../desktop/main/portal/background';
const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function temp() { const root = await mkdtemp(path.join(os.tmpdir(), 'client-stability-')); roots.push(root); return root; }

it('does not overlap polls or publish a result overtaken by a user operation', async () => {
  let revision = 0, resolve!: (value: string) => void;
  const read = vi.fn(() => new Promise<string>(done => { resolve = done; }));
  const publish = vi.fn();
  const poll = new BackgroundPoll({ revision: () => revision, allowed: () => true, read, publish, error: vi.fn() });
  const pending = poll.tick();
  await poll.tick();
  expect(read).toHaveBeenCalledTimes(1);
  revision++; // A user operation can proceed without waiting for read().
  resolve('stale'); await pending;
  expect(publish).not.toHaveBeenCalled();
});

it('backs off failures and returns to the normal interval after recovery', async () => {
  let now = 0, fail = true;
  const read = vi.fn(async () => { if (fail) throw new Error('timeout'); return 'ok'; });
  const poll = new BackgroundPoll({ revision: () => 0, allowed: () => true, read, publish: vi.fn(), error: vi.fn(), now: () => now });
  await poll.tick(); now = 29_999; await poll.tick(); expect(read).toHaveBeenCalledTimes(1);
  now = 30_000; await poll.tick(); now = 89_999; await poll.tick(); expect(read).toHaveBeenCalledTimes(2);
  fail = false; now = 90_000; await poll.tick(); now = 105_000; await poll.tick();
  expect(read).toHaveBeenCalledTimes(4);
});

it('bounds a synchronous log flood, reports omissions and resumes after draining', async () => {
  const log = new ClientErrorLog(await temp(), () => ['secret-value']);
  for (let i = 0; i < 10_000; i++) log.info('flood', 'secret-value' + 'x'.repeat(2000));
  await log.flush();
  const text = await readFile(log.runtimeFile, 'utf8');
  expect(Buffer.byteLength(text)).toBeLessThanOrEqual(1024 * 1024);
  expect(text).not.toContain('secret-value');
  expect(await readFile(log.file, 'utf8')).toContain('[log-overflow]');
  log.info('after', 'recovered'); await log.flush();
  expect(await readFile(log.runtimeFile, 'utf8')).toContain('recovered');
});

it('flush waits for existing records without waiting for future producers', async () => {
  const log = new ClientErrorLog(await temp());
  const writer = log as unknown as { writeBatch: (file: string, entry: string, limit: number) => Promise<void> };
  const original = writer.writeBatch.bind(log);
  let producing = true;
  vi.spyOn(writer, 'writeBatch').mockImplementation(async (...args) => {
    await original(...args);
    if (producing) log.info('future', 'next');
  });
  log.info('first', 'record');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([log.flush(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('flush starved')), 2000); })]);
  } finally {
    clearTimeout(timer); producing = false; await log.flush();
  }
  expect(await readFile(log.runtimeFile, 'utf8')).toContain('[first]');
});

it('expires unconfirmed recovery and isolates background observations until accepted', async () => {
  let now = 1000, running = false;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  const root = await temp();
  const background = new BackgroundPortal(root, async () => JSON.stringify({ enabled: true, running, pid: 123, loaded: true }), 'win32');
  await background.setService({ root, label: background.label, file: '', existing: false });
  expect((await background.portalState()).phase).toBe('reconnecting');
  now += 6 * 60_000;
  expect((await background.portalState()).phase).toBe('error');
  running = true;
  const observation = await background.observe();
  expect(background.state.running).toBe(false);
  background.acceptObservation(observation);
  expect(background.state.running).toBe(true);
  running = false;
  expect((await background.portalState()).phase).toBe('reconnecting');
  await writeFile(path.join(root, '.portal-start-failure'), 'crash-limit');
  expect((await background.portalState()).phase).toBe('error');
});
