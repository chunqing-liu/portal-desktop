import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatState, type Run } from '../desktop/renderer/chat/models/chat';
import { ChatActivity } from '../desktop/renderer/chat/components/messages';
import { createChatRuntime } from '../desktop/renderer/chat/services/runtime';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('location', new URL('https://fixture.test/loom.html?scene_id=desktop-test'));
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('requestAnimationFrame', (fn: () => void) => setTimeout(fn, 16));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function fixture(initial: 'live' | 'queued' | 'empty' = 'live') {
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  let sends = 0;
  let historyRead: (() => Promise<Response>) | undefined;
  let activeRead: (() => Response) | undefined;
  const activity = vi.fn();
  const fetcher = vi.fn(async (input: string) => {
    const path = new URL(input).pathname;
    if (path === '/api/history') return historyRead ? historyRead() : Response.json({ messages: [] });
    if (path === '/api/stream/active') return activeRead ? activeRead() : new Response(null, {status: 204});
    if (path === '/health') return new Response('OK fixture');
    if (path === '/api/chat/stream') {
      if (++sends > 1 || initial === 'queued') return Response.json({queued: true}, {status: 202});
      if (initial === 'empty') return new Response('');
      return new Response(new ReadableStream({start(controller) { stream = controller; }}));
    }
    return Response.json({sbs_enabled: false});
  });
  vi.stubGlobal('fetch', fetcher);
  const state = new ChatState(), runtime = createChatRuntime(state, {onSceneActivity: activity});
  state.subagentReady = true;
  await runtime.start();
  await runtime.send('long task');
  await vi.advanceTimersByTimeAsync(20);
  return { state, runtime, activity, fetcher,
    runs: () => state.items.filter((i): i is Run => i.kind === 'run' && i.sceneId === 'desktop-test'),
    emit(event: string, data: object = {}, scene_id = 'desktop-test') {
      stream.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify({scene_id, ...data})}\n\n`));
    },
    setHistory(read: () => Promise<Response>) { historyRead = read; },
    setActive(read: () => Response) { activeRead = read; },
    close() { runtime.dispose(); try { stream?.close(); } catch {} },
  };
}

it('resumes a server-queued input and keeps a long task active, then waits afresh for its final reply', async () => {
  const f = await fixture();
  try {
    f.emit('reasoning', {text: 'started'});
    await vi.advanceTimersByTimeAsync(20);
    await f.runtime.send('follow-up accepted into the live stream');
    await vi.advanceTimersByTimeAsync(20);
    expect(f.runs()[0]).toMatchObject({status: 'queued', waitingForReply: true});
    expect(f.activity.mock.lastCall?.[0]['desktop-test']).toBe('queued');
    for (let i = 0; i < 22; i++) {
      f.emit('tool_use', {name: 'portal_exec', input: {command: 'fixture'}});
      await vi.advanceTimersByTimeAsync(20);
      expect(f.runs()[0].status).toBe('working');
      f.emit('tool_result', {is_error: i === 0, content: i === 0 ? 'failed command' : 'ok'});
      await vi.advanceTimersByTimeAsync(30000);
    }
    expect(f.runs()).toHaveLength(1);
    expect(f.runs()[0]).toMatchObject({status: 'thinking', waitingForReply: false});
    expect(f.runs()[0].end).toBeUndefined();
    f.emit('message_stop');
    await vi.advanceTimersByTimeAsync(20);
    expect(f.runs()[0]).toMatchObject({status: 'waiting', label: '等待最终回复'});
    await vi.advanceTimersByTimeAsync(240000);
    expect(f.runs()[0].end).toBeUndefined();
    f.emit('content_block_delta', {delta: {text: 'final answer'}});
    await vi.advanceTimersByTimeAsync(20);
    expect(f.runs()[0].status).toBe('replying');
    f.emit('message_stop');
    await vi.advanceTimersByTimeAsync(20);
    expect(f.runs()[0]).toMatchObject({status: 'done', outcome: 'done', label: '已回复'});
    expect(f.runs()[0].entries.filter(e => e.error)).toHaveLength(1);
  } finally { f.close(); }
});

it('ignores an overdue history check that completes after tool progress cancelled the wait', async () => {
  const f = await fixture();
  let finishRead: (() => void) | undefined;
  try {
    await f.runtime.send('queued follow-up');
    await vi.advanceTimersByTimeAsync(20);
    f.setHistory(() => new Promise(resolve => { finishRead = () => resolve(Response.json({messages: []})); }));
    await vi.advanceTimersByTimeAsync(2000);
    expect(finishRead).toBeTypeOf('function');
    await vi.advanceTimersByTimeAsync(298000);
    f.emit('tool_use', {name: 'portal_exec', input: {}});
    await vi.advanceTimersByTimeAsync(20);
    finishRead!();
    await vi.advanceTimersByTimeAsync(20);
    expect(f.runs()[0]).toMatchObject({status: 'working', waitingForReply: false});
    expect(f.runs()[0].end).toBeUndefined();
  } finally { finishRead?.(); f.close(); }
});

it.each(['queued', 'empty'] as const)('reports an unconfirmed result after a genuinely idle %s wait, without stopping the server', async initial => {
  const f = await fixture(initial);
  try {
    expect(f.runs()[0].status).toBe(initial === 'queued' ? 'queued' : 'waiting');
    await vi.advanceTimersByTimeAsync(300100);
    expect(f.runs()[0]).toMatchObject({status: 'timeout', outcome: 'timeout', label: '等待超时，结果待确认'});
    expect(f.activity.mock.lastCall?.[0]['desktop-test']).toBe('timeout');
    expect(f.fetcher.mock.calls.some(([url]) => new URL(url).pathname === '/api/stop')).toBe(false);
  } finally { f.close(); }
});

it('does not let another scene or empty deltas extend the current wait, and preserves unknown tool results', async () => {
  const f = await fixture();
  try {
    f.emit('tool_use', {name: 'portal_exec', input: {}});
    f.emit('message_stop');
    await vi.advanceTimersByTimeAsync(20);
    expect(f.runs()[0].entries.find(e => e.type === 'tool')?.done).not.toBe(true);
    for (let i = 0; i < 10; i++) {
      f.emit('content_block_delta', {delta: {text: ''}});
      f.emit('reasoning', {text: ''});
      f.emit('tool_use', {name: 'other_tool'}, 'other-scene');
      f.emit('tool_result', {is_error: false, content: 'ok'}, 'other-scene');
      await vi.advanceTimersByTimeAsync(30000);
    }
    expect(f.runs()[0].status).toBe('timeout');
    const html = renderToStaticMarkup(createElement(ChatActivity, {run: f.runs()[0]}));
    expect(html).toContain('1 次结果未确认');
    expect(html).toContain('<small>结果未确认</small>');
  } finally { f.close(); }
});

it('cancels the initial 202 wait when replay discovers progress and accepts a reply after five minutes', async () => {
  const f = await fixture('queued');
  let seq = 0;
  let events: object[] = [];
  try {
    f.setActive(() => Response.json({stream_id: 'queued-stream', scene_id: 'desktop-test', origin: 'human',
      finished: false, next_seq: seq += events.length, events: events.splice(0)}));
    events.push({event: 'tool_use', data: {scene_id: 'desktop-test', name: 'portal_exec', input: {}}});
    await f.runtime.refreshOnRegainedAttention();
    await vi.advanceTimersByTimeAsync(20);
    expect(f.runs()[0].status).toBe('working');
    for (let i = 0; i < 12; i++) {
      events.push({event: 'tool_result', data: {scene_id: 'desktop-test', is_error: false, content: 'ok'}},
        {event: 'tool_use', data: {scene_id: 'desktop-test', name: 'portal_exec', input: {}}});
      await vi.advanceTimersByTimeAsync(30000);
    }
    expect(f.runs()[0].end).toBeUndefined();
    events.push({event: 'content_block_delta', data: {scene_id: 'desktop-test', delta: {text: 'completed'}}},
      {event: 'message_stop', data: {scene_id: 'desktop-test'}});
    await vi.advanceTimersByTimeAsync(30000);
    expect(f.runs()[0]).toMatchObject({status: 'done', outcome: 'done'});
  } finally { f.close(); }
});

it('distinguishes waiting timeout from failed tools in the collapsed activity summary', () => {
  const run: Run = {kind: 'run', id: 'r', start: 1, end: 664001, status: 'timeout', outcome: 'timeout',
    label: '等待超时，结果待确认', hint: '后台任务可能仍在运行', arg: '',
    entries: [{type: 'tool', done: true}, {type: 'tool', done: true, error: true}, {type: 'tool'}]};
  const html = renderToStaticMarkup(createElement(ChatActivity, {run}));
  const summary = html.split('</summary>')[0];
  expect(summary).toContain('data-status="timeout"');
  expect(summary).toContain('总耗时');
  expect(summary).toContain('11 分 4 秒');
  expect(summary).toContain('3 次工具调用');
  expect(summary).toContain('1 次失败');
  expect(summary).toContain('1 次结果未确认');
  expect(summary).not.toContain('含失败项');
});
