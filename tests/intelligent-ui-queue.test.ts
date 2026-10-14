import { expect, it, vi } from 'vitest';
import { createSceneRuntime } from '../desktop/renderer/chat/services/scene-runtime';
import { SceneQueueStore, type SavedSceneSend } from '../desktop/renderer/chat/services/scene-queue';

it('freezes UI selection in the outbox and restores it after a restart', async () => {
  vi.useFakeTimers();
  const rows = new Map<string, SavedSceneSend>();
  const read = vi.spyOn(SceneQueueStore.prototype, 'read').mockImplementation(async () => [...rows.values()].map(row => structuredClone(row)));
  const write = vi.spyOn(SceneQueueStore.prototype, 'write').mockImplementation(async row => {
    if (typeof row === 'string') rows.delete(row); else rows.set(row.id, structuredClone(row));
  });
  let busy = true;
  const sent = vi.fn();
  const create = () => {
    const state: any = {items:[],currentScene:{sceneId:'a'},sceneTasks:[],sceneNames:{},draft:'',changed:vi.fn(),intelligentUIEnabled:false,intelligentUISnapshots:{}};
    const runtime = createSceneRuntime(state, {}, (local: any) => ({
      isBusy: () => local.currentScene.sceneId === 'a' && busy,
      sceneActivity: () => null, syncConnection:()=>{}, waitForPendingFiles:async()=>{}, refreshHistory:async()=>{},
      request:async()=>new Response(null,{status:204}), send:sent, dispose:()=>{}, start:async()=>{},
      stageQueuedSend(text:string, files:any[] = [], sendOptions:any = {}) {
        const message:any={kind:'message',role:'user',text,queued:true,createdAt:Date.now(),...local.currentScene};
        local.items.push(message);return {text,files,message,sendOptions};
      },
    }));
    return runtime;
  };
  let runtime = create();
  try {
    await runtime.start();
    await runtime.selectScene({sceneId:'b',strict:true});
    const action = {surfaceId:'wardrobe',revision:2,title:'衣橱',action:'continue' as const,values:{temp:28}};
    const sending = runtime.send('按当前选择调整', [], {intelligentUI:true,uiAction:action});
    action.values.temp=19;
    await sending;
    expect([...rows.values()][0].sendOptions?.uiAction?.values.temp).toBe(28);
    runtime.dispose();
    runtime=create();
    await runtime.start();
    busy=false;
    runtime.updateSceneTasks([]);
    await vi.advanceTimersByTimeAsync(2100);
    expect(sent).toHaveBeenCalledWith('按当前选择调整', [], expect.objectContaining({uiAction:expect.objectContaining({surfaceId:'wardrobe',revision:2,values:{temp:28}})}));
    expect(rows.size).toBe(0);
  } finally {runtime.dispose();read.mockRestore();write.mockRestore();vi.useRealTimers();}
});
