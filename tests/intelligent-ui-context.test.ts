import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ChatState } from '../desktop/renderer/chat/models/chat';
import { createChatRuntime } from '../desktop/renderer/chat/services/runtime';
import { intelligentUIContext, stripIntelligentUIContext, withIntelligentUIContext } from '../desktop/renderer/shared/intelligent-ui/context';
import { compileStreamingUI } from '../desktop/renderer/shared/intelligent-ui/runtime';
import { demoSource } from '../desktop/renderer/shared/intelligent-ui/examples';
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('location', new URL('https://fixture.test/loom.html?scene_id=desktop-test'));
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('requestAnimationFrame', (fn: () => void) => setTimeout(fn, 16));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  const saved = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, v: string) => saved.set(key, v) });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it('defaults off and persists an explicit beta preference', () => {
  const state = new ChatState();
  expect(state.intelligentUIEnabled).toBe(false);
  state.setIntelligentUIEnabled(true);
  expect(new ChatState().intelligentUIEnabled).toBe(true);
  state.setIntelligentUIForMessage(true);
  expect(new ChatState().intelligentUIForMessage).toBe(false);
  state.setIntelligentUIEnabled(false);
  expect(new ChatState().intelligentUIEnabled).toBe(false);
  expect(state.intelligentUIForMessage).toBe(false);
});
it('attaches once and removes only the exact client suffix', () => {
  expect(withIntelligentUIContext('hello', false)).toBe('hello');
  const text = withIntelligentUIContext('hello', true);
  expect(withIntelligentUIContext(text, true)).toBe(text);
  expect(stripIntelligentUIContext(text)).toBe('hello');
  expect(stripIntelligentUIContext('hello [客户端 Intelligent UI Beta 上下文]')).toContain('[客户端');
});
it('shows complete streamed components without inventing unfinished values', () => {
  const cut = demoSource.indexOf('"id": "plan"');
  const doc = compileStreamingUI(demoSource.slice(0, cut));
  expect(doc.body.map(n => n.id)).toEqual(['intro', 'seats']);
  expect(compileStreamingUI(demoSource).body).toHaveLength(7);
  expect(() => compileStreamingUI('{"version":')).toThrow();
  expect(() => compileStreamingUI(demoSource.replace('"slider"', '"script"'))).toThrow();
});
it('injects on normal and live follow-up sends while keeping local and restored messages clean', async () => {
  const sends: string[] = [];
  const history: any[] = [];
  let stream: ReadableStreamDefaultController<Uint8Array> | undefined;
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    const route = new URL(input).pathname;
    if (route === '/api/history') return Response.json({ messages: history });
    if (route === '/api/stream/active') return new Response(null, { status: 204 });
    if (route === '/health') return new Response('OK fixture');
    if (route === '/api/chat/stream') {
      sends.push(JSON.parse(String(init?.body)).message);
      if (stream) return Response.json({ queued: true }, { status: 202 });
      return new Response(new ReadableStream({ start(controller) { stream = controller; } }));
    }
    return Response.json({ sbs_enabled: false });
  }));
  const state = new ChatState(), runtime = createChatRuntime(state);
  state.subagentReady = true;
  try {
    await runtime.start();
    state.setIntelligentUIEnabled(true);
    expect(state.intelligentUIForMessage).toBe(false);
    state.setIntelligentUIForMessage(true);
    await runtime.send('帮我做预算');
    await vi.advanceTimersByTimeAsync(20);
    expect(sends[0]).toBe('帮我做预算' + intelligentUIContext);
    expect(state.intelligentUIForMessage).toBe(false);
    state.setIntelligentUIForMessage(true);
    await runtime.send('增加一个滑块');
    await vi.advanceTimersByTimeAsync(20);
    expect(sends[1]).toBe('增加一个滑块' + intelligentUIContext);
    expect(state.intelligentUIForMessage).toBe(false);
    // Beta remains enabled, but the next message is ordinary.
    await runtime.send('现在普通回复');
    await vi.advanceTimersByTimeAsync(20);
    expect(sends[2]).toBe('现在普通回复');
    history.push({ seq: 10, role: 'user', content: '历史输入' + intelligentUIContext, scene_id: 'desktop-test' });
    await runtime.refreshHistory();
    const users = state.items.filter(item => item.kind === 'message' && item.role === 'user');
    expect(users.some(item => item.kind === 'message' && item.text === '帮我做预算')).toBe(true);
    expect(users.every(item => item.kind === 'message' && !item.text.includes('Beta 上下文'))).toBe(true);
  } finally { runtime.dispose(); try { stream?.close(); } catch {} }
});
