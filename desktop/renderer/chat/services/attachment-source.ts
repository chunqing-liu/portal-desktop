/** File is structured-cloned to the trusted shell; no renderer-supplied path is accepted. */
export function registerAttachmentSource(file:File):Promise<string | undefined> {
  if(!window.parent || window.parent===window)return Promise.resolve(undefined);
  const id=crypto.randomUUID(),revision=new URLSearchParams(location.search).get('revision');
  return new Promise(resolve=>{
    const finish=(token?:string)=>{clearTimeout(timer);window.removeEventListener('message',receive);resolve(token);};
    const receive=(event:MessageEvent)=>{
      if(event.source!==window.parent || !['beings://desktop','http://localhost:5173'].includes(event.origin))return;
      if(event.data?.type==='beings:attachment-source-result' && event.data.id===id && event.data.revision===revision)finish(typeof event.data.token==='string' ? event.data.token : undefined);
    };
    const timer=setTimeout(()=>finish(),15000);window.addEventListener('message',receive);
    window.parent.postMessage({type:'beings:attachment-source',id,revision,file},'*');
  });
}
