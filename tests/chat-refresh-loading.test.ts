import { expect, it, vi } from 'vitest';
import { createSceneRuntime } from '../desktop/renderer/chat/services/scene-runtime';
it('keeps content loading until overlapping refreshes settle, including failures',async()=>{
 const pending: {resolve:()=>void;reject:(e:Error)=>void}[]=[];
 const state:any={currentScene:{sceneId:'a'},items:[],draft:'未发送草稿',sceneTasks:[],sceneNames:{},changed:vi.fn()};
 const runtime=createSceneRuntime(state,{},()=>({sceneActivity:()=>null,syncConnection:()=>{},dispose:()=>{},refreshHistory:()=>new Promise<void>((resolve,reject)=>pending.push({resolve,reject}))}));
 try {
   const first=runtime.refreshHistory(),second=runtime.refreshHistory();
   expect(state.historyRefreshing).toBe(true);
   pending[0].resolve();await first;
   expect(state.historyRefreshing).toBe(true);
   const failed=expect(second).rejects.toThrow('offline');pending[1].reject(new Error('offline'));await failed;
   expect(state.historyRefreshing).toBe(false);
   expect(state.draft).toBe('未发送草稿');
 } finally {runtime.dispose();}
});
