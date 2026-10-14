import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ChatState } from '../desktop/renderer/chat/models/chat';
import { createChatRuntime } from '../desktop/renderer/chat/services/runtime';
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

it.each([false,true])('rejects oversized UI context without clearing the draft or queueing (busy=%s)', async busy => {
  const sends: string[] = [];
  let stream: ReadableStreamDefaultController<Uint8Array> | undefined;
  vi.stubGlobal('fetch',vi.fn(async (url:string, init?:RequestInit)=>{
    const route=new URL(url).pathname;
    if(route==='/api/stream/active') return new Response(null,{status:204});
    if(route==='/api/history') return Response.json({messages:[]});
    if(route==='/health') return new Response('OK fixture');
    if(route==='/api/chat/stream') { sends.push(String(init?.body)); return new Response(new ReadableStream({start(c){stream=c;}})); }
    return Response.json({sbs_enabled:false});
  }));
  const state=new ChatState(), runtime=createChatRuntime(state);state.subagentReady=true;
  try {
    await runtime.start();
    if(busy) { await runtime.send('正在进行的对话'); await vi.advanceTimersByTimeAsync(20); }
    state.setIntelligentUIEnabled(true);state.setIntelligentUIForMessage(true);
    state.draft='保留我的草稿';
    state.intelligentUISnapshots['desktop-test']=JSON.stringify({surfaceId:'large',revision:1,values:{notes:'x'.repeat(100001)}});
    await runtime.send(state.draft);await vi.advanceTimersByTimeAsync(20);
    expect(sends).toHaveLength(busy?1:0);
    expect(state.draft).toBe('保留我的草稿');
    expect(state.intelligentUIForMessage).toBe(true);
    expect(state.items.some(item=>item.kind==='message' && item.role==='system' && item.text.includes('内容过长，未发送'))).toBe(true);
    expect(state.items.some(item=>item.kind==='message' && item.queued)).toBe(false);
  } finally {runtime.dispose();try{stream?.close();}catch{}}
});
