import {useCallback,useEffect,useRef,useState,type RefObject} from 'react';
import {createPortal} from 'react-dom';
import {AttachmentDownload} from '../../chat/components/attachment-download';

type Preview={src:string;name:string;id:string;endpoint:string};
export function AttachmentImageViewer({frame}:{frame:RefObject<HTMLIFrameElement|null>}) {
  const [preview,setPreview]=useState<Preview|null>(null);
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    let url='';
    const receive=(event:MessageEvent)=>{
      const target=frame.current, data=event.data;
      if(!target?.src || event.source!==target.contentWindow || event.origin!=='beings://chat' || data?.type!=='beings:image-preview')return;
      const source=new URL(target.src);
      if(data.revision!==source.searchParams.get('revision') || !(data.blob instanceof Blob) || !/^image\/(png|jpeg|gif|webp)$/.test(data.blob.type) || data.blob.size>128*1024*1024 || typeof data.name!=='string' || typeof data.id!=='string' || data.id.length>256)return;
      if(url)URL.revokeObjectURL(url);
      url=URL.createObjectURL(data.blob);
      setPreview({src:url,name:data.name.slice(0,512),id:data.id,endpoint:source.searchParams.get('history_scope') || ''});
    };
    window.addEventListener('message',receive);
    return()=>{window.removeEventListener('message',receive);if(url)URL.revokeObjectURL(url);};
  },[frame]);
  useEffect(()=>{if(preview)dialog.current?.showModal();},[preview]);
  const request=useCallback<typeof fetch>(async (input,init)=>{
    const target=frame.current;
    if(!target?.contentWindow || !preview)throw new Error('对话已关闭');
    const channel=new MessageChannel(),query=new URL(String(input),'https://local').searchParams;
    return new Promise<Response>((resolve,reject)=>{
      const abort=()=>{channel.port1.postMessage('abort');reject(new DOMException('Cancelled','AbortError'));};
      init?.signal?.addEventListener('abort',abort,{once:true});
      channel.port1.onmessage=event=>{
        const data=event.data;
        if(data.error){reject(new Error(data.error));channel.port1.close();return;}
        resolve(new Response(data.body,{status:data.status,headers:data.headers}));
      };
      target.contentWindow!.postMessage({type:'beings:image-download',revision:new URL(target.src).searchParams.get('revision'),id:preview.id,endpoint:preview.endpoint,action:query.get('action') || 'check'},'beings://chat',[channel.port2]);
    });
  },[frame,preview]);
  function close(){if(preview)URL.revokeObjectURL(preview.src);setPreview(null);frame.current?.focus();}
  return preview && createPortal(<dialog ref={dialog} className="client-image-viewer" aria-label={`图片预览：${preview.name}`} onClose={close} onClick={e=>{if(e.target===e.currentTarget)dialog.current?.close();}}>
    <div className="client-image-toolbar"><button autoFocus type="button" aria-label="关闭图片预览" onClick={()=>dialog.current?.close()}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button><AttachmentDownload key={JSON.stringify([preview.endpoint,preview.id])} request={request} endpoint={preview.endpoint} id={preview.id} name={preview.name}>下载原图</AttachmentDownload></div>
    <img src={preview.src} alt={preview.name}/>
  </dialog>,document.body);
}
