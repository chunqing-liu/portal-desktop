import {useLayoutEffect,useRef,useState} from 'react';
import type {ChatItem} from '../models/chat';
export const HISTORY_WINDOW_PAGE=40;
export function historyWindowStart(items:ChatItem[],firstId?:string) {
  const found=firstId?items.findIndex(item=>item.id===firstId):-1;
  return found>=0?found:Math.max(0,items.length-HISTORY_WINDOW_PAGE);
}
export function historyRevealStart(items:ChatItem[],firstId:string|undefined,id:string) {
  const index=items.findIndex(item=>item.id===id);
  return index<0?historyWindowStart(items,firstId):Math.min(historyWindowStart(items,firstId),Math.max(0,index-10));
}
/** Once exposed, the first row stays fixed as new live messages arrive. */
export function useHistoryWindow(items:ChatItem[],scope:string,loadOlder:()=>Promise<number>) {
  const [windows,setWindows]=useState<Record<string,string>>({});
  const [exhausted,setExhausted]=useState<Record<string,boolean>>({});
  const [loading,setLoading]=useState(false),pending=useRef(false);
  const boundary=useRef<{scope:string;id?:string}|null>(null);
  const latest=useRef(items);latest.current=items;
  const currentScope=useRef(scope);currentScope.current=scope;
  const start=historyWindowStart(items,windows[scope]);
  // Save a stable boundary without dropping the user's reading position as messages arrive.
  if(items.length && (!windows[scope] || !items.some(item=>item.id===windows[scope])))setWindows(old=>({...old,[scope]:items[start].id}));
  async function more() {
    if(pending.current || (start===0 && exhausted[scope]))return;
    pending.current=true;setLoading(true);
    try {
      // Paint the loading indicator before inserting even an already-cached page.
      await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
      if(currentScope.current!==scope)return;
      const previous=items[start]?.id;
      boundary.current={scope,id:previous};
      if(start===0){const count=await loadOlder();if(count===0)setExhausted(old=>({...old,[scope]:true}));}

    }finally{pending.current=false;setLoading(false);}
  }
  useLayoutEffect(()=>{
    if(loading || !boundary.current)return;
    const saved=boundary.current;boundary.current=null;
    if(saved.scope!==scope)return;
    const oldIndex=items.findIndex(item=>item.id===saved.id);
    const next=items[Math.max(0,oldIndex-HISTORY_WINDOW_PAGE)];
    if(next)setWindows(old=>({...old,[scope]:next.id}));
  },[items,loading,scope]);
  function reveal(id:string) {
    const index=latest.current.findIndex(item=>item.id===id);
    if(index>=0)setWindows(old=>({...old,[scope]:latest.current[historyRevealStart(latest.current,old[scope],id)].id}));
  }
  return {items:items.slice(start),more,reveal,loading,hasMore:start>0 || !exhausted[scope]};
}
