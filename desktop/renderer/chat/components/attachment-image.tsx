import {imagePreviewSize,rememberImageSize} from '../services/image-preview-size';
import {useAttachmentDownloadBridge} from './use-attachment-download-bridge';
import {useState} from 'react';
import {AttachmentDownload} from './attachment-download';
import {ImageViewer} from '../../shared/components/image-viewer';

/** The modal lives in the browser top layer, outside the scrolling message list. */
export function AttachmentImage({src,name,endpoint,id,blob,onImageLoad}:{onImageLoad?:(image:HTMLImageElement)=>void;blob?:Blob;src:string;name:string;endpoint:string;id:string}) {
  const [open,setOpen]=useState(false);
  const [size,setSize]=useState(()=>imagePreviewSize(endpoint,id));
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
    {open && <ImageViewer src={src} name={name} onClose={()=>setOpen(false)} actions={<AttachmentDownload endpoint={endpoint} id={id} name={name}>下载原图</AttachmentDownload>}/>}
  </>;
}
