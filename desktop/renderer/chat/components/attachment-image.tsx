import {imagePreviewSize,rememberImageSize} from '../services/image-preview-size';
import {useAttachmentDownloadBridge} from './use-attachment-download-bridge';
import {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {AttachmentDownload} from './attachment-download';

/** The modal lives in the browser top layer, outside the scrolling message list. */
export function AttachmentImage({src,name,endpoint,id,blob,onImageLoad}:{onImageLoad?:(image:HTMLImageElement)=>void;blob?:Blob;src:string;name:string;endpoint:string;id:string}) {
  const [open,setOpen]=useState(false);
  const [size,setSize]=useState(()=>imagePreviewSize(endpoint,id));
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(open)dialog.current?.showModal();},[open]);
  useAttachmentDownloadBridge(endpoint,id);
  async function show() {
    if(blob && window.parent!==window && location.protocol==='beings:') {
      try {
        window.parent.postMessage({type:'beings:image-preview',revision:new URLSearchParams(location.search).get('revision'),blob,name,id},'*');
        return;
      } catch { /* Standalone preview remains available if the local blob expired. */ }
    }
    setOpen(true);
  }
  return <>
    <button type="button" className="attachment-image-thumbnail" style={size} aria-label={`预览 ${name}`} onClick={()=>void show()}><img src={src} alt={name} draggable={false} onLoad={event=>{const img=event.currentTarget;rememberImageSize(endpoint,id,img.naturalWidth,img.naturalHeight);setSize(imagePreviewSize(endpoint,id));onImageLoad?.(img);}}/></button>
    {open && createPortal(<dialog ref={dialog} className="attachment-image-viewer" aria-label={`图片预览：${name}`} onClose={()=>setOpen(false)} onClick={event=>{if(event.target===event.currentTarget)dialog.current?.close();}}>
      <div className="attachment-image-toolbar"><button type="button" autoFocus aria-label="关闭图片预览" onClick={()=>dialog.current?.close()}>×</button><AttachmentDownload endpoint={endpoint} id={id} name={name}>下载原图</AttachmentDownload></div>
      <img src={src} alt={name}/>
    </dialog>,document.body)}
  </>;
}
