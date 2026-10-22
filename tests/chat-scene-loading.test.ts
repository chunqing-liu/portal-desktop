import {expect,it,vi} from 'vitest';
import {createSceneRuntime} from '../desktop/renderer/chat/services/scene-runtime';
import {SceneQueueStore} from '../desktop/renderer/chat/services/scene-queue';

it('keeps loading through queued scene reads and releases it after failure without poisoning the next selection', async () => {
  const read=vi.spyOn(SceneQueueStore.prototype,'read').mockResolvedValue([]);
  const state:any={items:[],historyLoading:true,currentScene:{sceneId:'a',strict:true},draft:'',files:[],sceneTasks:[],sceneNames:{},changed:vi.fn()};
  let releaseStart!:()=>void,releaseFirst!:()=>void,rejectSecond!:(error:Error)=>void;
  const first=new Promise<void>(resolve=>{releaseFirst=resolve;});
  const second=new Promise<void>((_,reject)=>{rejectSecond=reject;});
  const start=vi.fn(()=>new Promise<void>(resolve=>{releaseStart=resolve;}));
  const refresh=vi.fn().mockImplementationOnce(()=>first).mockImplementationOnce(()=>second).mockResolvedValue(undefined);
  const runtime=createSceneRuntime(state,{},()=>({
    start,refreshHistory:refresh,restoreSceneHistory:async()=>{},waitForPendingFiles:async()=>{},
    isBusy:()=>false,sceneActivity:()=>null,syncConnection:()=>{},dispose:()=>{},
  }));
  try {
    const initial=runtime.start();
    await vi.waitFor(()=>expect(start).toHaveBeenCalledOnce());
    expect(state.historyLoading).toBe(true);
    releaseStart();await initial;expect(state.historyLoading).toBe(false);
    const b=runtime.selectScene({sceneId:'b'}),c=runtime.selectScene({sceneId:'c'});
    const rejected=expect(c).rejects.toThrow('offline');
    expect(state.historyLoading).toBe(true);
    await vi.waitFor(()=>expect(refresh).toHaveBeenCalledTimes(1));
    releaseFirst();await b;
    expect(state.historyLoading).toBe(true);
    await vi.waitFor(()=>expect(refresh).toHaveBeenCalledTimes(2));
    rejectSecond(new Error('offline'));await rejected;
    expect(state.historyLoading).toBe(false);
    await runtime.selectScene({sceneId:'a'});
    expect(state.currentScene.sceneId).toBe('a');
    expect(state.historyLoading).toBe(false);
  } finally {runtime.dispose();read.mockRestore();}
});
