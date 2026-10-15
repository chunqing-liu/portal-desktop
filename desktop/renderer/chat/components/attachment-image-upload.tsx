export function AttachmentImageUpload({src,name,percent,complete,phase}:{src:string;name:string;percent:number;complete:boolean;phase?:string}) {
  return <section className="attachment-image-card attachment-image-upload" aria-label={name}>
    {src && <img src={src} alt={name}/>}
    {!complete && <div role="status">{phase==='uploading' ? '正在上传' : phase==='confirming' ? '正在确认上传' : phase ? '正在准备上传' : '等待上传'} · {percent}%<progress aria-label={`${name} 上传进度`} max={100} value={percent}/></div>}
  </section>;
}
