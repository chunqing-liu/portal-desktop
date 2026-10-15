import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ChatState, type Message } from '../desktop/renderer/chat/models/chat';
import { createChatRuntime } from '../desktop/renderer/chat/services/runtime';
import { HistoryCache } from '../desktop/renderer/chat/services/history-cache';
import { SceneQueueStore } from '../desktop/renderer/chat/services/scene-queue';

const streams = vi.hoisted(() => [] as any[]);
vi.mock('../desktop/renderer/chat/services/scene-runtime', async importOriginal => {
  const original = await importOriginal<any>();
  return { ...original, createSceneRuntime: (state: any, options: any, factory: any) =>
    original.createSceneRuntime(state, options, (...args: any[]) => {
      const runtime = factory(...args); streams.push(runtime); return runtime;
    }) };
});

beforeEach(() => {
  streams.length = 0;
  vi.useFakeTimers();
  vi.stubGlobal('location', new URL('https://fixture.test/loom.html?scene_id=a'));
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('requestAnimationFrame', (fn: () => void) => setTimeout(fn, 16));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  vi.spyOn(HistoryCache.prototype, 'read').mockResolvedValue(null);
  vi.spyOn(HistoryCache.prototype, 'write').mockResolvedValue();
  vi.spyOn(HistoryCache.prototype, 'readScene').mockResolvedValue([]);
  vi.spyOn(SceneQueueStore.prototype, 'read').mockResolvedValue([]);
  vi.spyOn(SceneQueueStore.prototype, 'write').mockResolvedValue();
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it.each([['direct', 'network'], ['cross-scene', 'network'], ['direct', 'cache'], ['cross-scene', 'cache']])('keeps %s user bubbles through %s rebuilds, acceptance, streaming and history confirmation', async (mode, source) => {
  const text = '这条消息必须一直可见';
  const history: any[] = [{ seq: 1, role: 'user', scene_id: mode === 'direct' ? 'a' : 'b', content: text }];
  const controllers: ReadableStreamDefaultController<Uint8Array>[] = [];
  let accept!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = new URL(input);
    if (url.pathname === '/api/history') return Response.json({ messages: history.filter(m => m.seq > Number(url.searchParams.get('after') || 0)) });
    if (url.pathname === '/api/stream/active') return new Response(null, { status: 204 });
    if (url.pathname === '/health') return new Response('OK fixture');
    if (url.pathname === '/api/chat/stream') return new Promise<Response>(resolve => { accept = resolve; });
    return Response.json({ sbs_enabled: false });
  }));
  const state = new ChatState(), runtime = createChatRuntime(state);
  const users = () => state.items.filter((i): i is Message => i.kind === 'message' && i.role === 'user' && i.text === text && i.historySeq !== 1);
  const rebuild = async () => {
    const pending = streams[0].reconcileHistory({ full: true });
    await vi.advanceTimersByTimeAsync(100);
    await pending;
  };
  try {
    const starting = runtime.start();
    await vi.advanceTimersByTimeAsync(100);
    await starting;
    if (source === 'cache') vi.mocked(HistoryCache.prototype.read).mockImplementation(async () => ({ messages: [...history], lastSeq: history.at(-1).seq }));
    if (mode === 'cross-scene') {
      await runtime.send('另一个场景正在工作');
      await runtime.selectScene({ sceneId: 'b', strict: true });
    }
    await runtime.send(text);
    const bubble = users()[0];
    expect(bubble).toBeDefined();
    if (mode === 'cross-scene') {
      expect(bubble.queued).toBe(true);
      await rebuild();
      expect(users()).toEqual([bubble]);
      history.push({ seq: 2, role: 'assistant', scene_id: 'a', content: '完成' });
      accept(Response.json({ queued: true }, { status: 202 }));
      await vi.advanceTimersByTimeAsync(2500);
      await runtime.refreshHistory();
      await vi.advanceTimersByTimeAsync(2500);
      expect(bubble.queued).toBe(false);
    }
    // Observe every published state, not merely the final successful request.
    const snapshots: any[][] = [];
    state.subscribe(() => snapshots.push([...users()]));
    await rebuild(); // POST still pending; history does not contain this user.
    expect(users()).toEqual([bubble]);
    accept(new Response(new ReadableStream({ start(controller) { controllers.push(controller); } })));
    await vi.advanceTimersByTimeAsync(20);
    controllers[0].enqueue(new TextEncoder().encode(`event: content_block_delta\ndata: ${JSON.stringify({ scene_id: state.currentScene.sceneId, delta: { text: '正在处理' } })}\n\n`));
    await vi.advanceTimersByTimeAsync(20);
    await rebuild();
    expect(users()).toEqual([bubble]);
    history.push({ seq: 3, role: 'user', scene_id: state.currentScene.sceneId, content: text });
    await rebuild();
    expect(users()).toEqual([bubble]);
    expect(bubble.historySeq).toBe(3);
    await runtime.refreshHistory();
    expect(users()).toHaveLength(1);
    expect(snapshots.length).toBeGreaterThan(0);
    expect(snapshots.every(items => items.length === 1 && items[0] === bubble)).toBe(true);
  } finally { controllers.forEach(controller => controller.close()); runtime.dispose(); }
});


it.each(['network','cache'])('restores older assistant replies during an active scene %s rebuild',async source=>{
  const history=[{seq:1,role:'user',scene_id:'a',content:'old question'},{seq:2,role:'assistant',scene_id:'a',content:'old answer'}];
  vi.stubGlobal('fetch',vi.fn(async(input:string)=>{
    const url=new URL(input);
    if(url.pathname==='/api/history')return Response.json({messages:history.filter(m=>m.seq>Number(url.searchParams.get('after')||0))});
    if(url.pathname==='/api/stream/active')return new Response(null,{status:204});
    if(url.pathname==='/health')return new Response('OK fixture');
    if(url.pathname==='/api/chat/stream')return new Promise<Response>(()=>{});
    return Response.json({sbs_enabled:false});
  }));
  const state=new ChatState(),runtime=createChatRuntime(state);
  const replies=()=>state.items.filter((m:any)=>m.kind==='message'&&m.text==='old answer');
  try{
    const starting=runtime.start();await vi.advanceTimersByTimeAsync(100);await starting;
    expect(replies()).toHaveLength(1);
    if(source==='cache')vi.mocked(HistoryCache.prototype.read).mockResolvedValue({messages:history,lastSeq:2});
    await runtime.send('new question');
    for(let repeat=0;repeat<2;repeat++){
      const pending=streams[0].reconcileHistory({full:true});await vi.advanceTimersByTimeAsync(100);await pending;
      expect(replies()).toHaveLength(1);
      expect(replies()[0]).toMatchObject({historySeq:2,sceneId:'a'});
      const messages=state.items.filter((m:any)=>m.kind==='message');
      expect(messages.map((m:any)=>m.text)).toEqual(['old question','old answer','new question']);
    }
  }finally{runtime.dispose();}
});
