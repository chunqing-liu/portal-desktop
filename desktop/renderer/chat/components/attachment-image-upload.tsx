import { RemoteImage } from '../../shared/components/remote-image';

export function AttachmentImageUpload({src,name,blob,percent,complete,phase,error}:{src:string;name:string;blob?:Blob;percent:number;complete:boolean;phase?:string;error?:string}) {
  return <section className="attachment-image-card attachment-image-upload" aria-label={name}>
    {src && <RemoteImage src={src} name={name} blob={blob}/>}
    {phase==='failed' ? <div role="alert">上传失败：{error || '请重试'}</div> : !complete && <div role="status">{phase==='uploading' ? '正在上传' : phase==='confirming' ? '正在确认上传' : phase ? '正在准备上传' : '等待上传'} · {percent}%<progress aria-label={`${name} 上传进度`} max={100} value={percent}/></div>}
  </section>;
}
