// One listener per attachment, even when history renders that attachment more than once.
const listeners=new Map<string,{count:number;receive:(event:MessageEvent)=>void}>();
export function registerDownloadBridge(endpoint:string,id:string) {
  const key=JSON.stringify([endpoint,id]);
  let entry=listeners.get(key);
  if(!entry){
    const receive=(event:MessageEvent)=>{
      const data=event.data,port=event.ports[0];
      if(event.source!==window.parent || !['beings://desktop','http://localhost:5173'].includes(event.origin) || data?.type!=='beings:image-download' || data.id!==id || data.endpoint!==endpoint || data.revision!==new URLSearchParams(location.search).get('revision') || !port || !['check','open','download','reveal'].includes(data.action))return;
      const controller=new AbortController();port.onmessage=e=>{if(e.data==='abort')controller.abort();};
      const query=new URLSearchParams({endpoint,id,...(data.action==='check'?{}:{action:data.action})});
      void fetch('/api/local-downloads?'+query,{method:data.action==='check'?'GET':'POST',signal:controller.signal}).then(response=>{
        const body=response.body;port.postMessage({status:response.status,headers:[...response.headers],body},body?[body]:[]);
      }).catch(()=>{try{port.postMessage({error:'文件操作失败，请重试'});}catch{/* The viewer already closed. */}});
    };
    entry={count:0,receive};listeners.set(key,entry);window.addEventListener('message',receive);
  }
  entry.count++;
  let released=false;
  return()=>{if(released)return;released=true;if(--entry!.count===0){window.removeEventListener('message',entry!.receive);listeners.delete(key);}};
}
