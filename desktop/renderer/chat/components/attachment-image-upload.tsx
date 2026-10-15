export function AttachmentImageUpload({src,name,percent,complete}:{src:string;name:string;percent:number;complete:boolean}) {
  return <section className="attachment-image-card attachment-image-upload" aria-label={name}>
    {src && <img src={src} alt={name}/>}
    {!complete && <div role="status">正在上传 · {percent}%<progress aria-label={`${name} 上传进度`} max={100} value={percent}/></div>}
  </section>;
}
