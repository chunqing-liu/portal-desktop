import {useEffect,useState} from 'react';
export function AttachmentImageUpload({blob,name,percent,complete}:{blob:Blob;name:string;percent:number;complete:boolean}) {
  const [src,setSrc]=useState('');
  useEffect(()=>{const url=URL.createObjectURL(blob);setSrc(url);return()=>URL.revokeObjectURL(url);},[blob]);
  return <section className="attachment-image-card attachment-image-upload" aria-label={name}>
    {src && <img src={src} alt={name}/>}
    <div role="status">{complete ? '上传完成' : `正在上传 · ${percent}%`}<progress aria-label={`${name} 上传进度`} max={100} value={percent}/></div>
  </section>;
}
