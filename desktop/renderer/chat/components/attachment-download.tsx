import {AttachmentAudioMenu} from './attachment-audio-menu';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {transferBytes} from '../services/attachment-transfer';
export function AttachmentDownload({endpoint, id, artifact, name, children, file, details, compact=false, apiBase='', request=fetch, onPreview}: {
  onPreview?:()=>void; request?:typeof fetch; apiBase?:string; endpoint: string; id: string; artifact?: string; name: string; children: string; file?:{size:number;mime:string}; details?:ReactNode; compact?:boolean;
}) {
  const [activeAction,setActiveAction]=useState(''),[error,setError]=useState(''),[downloaded,setDownloaded]=useState(false);
  const [checking,setChecking]=useState(true);
  const [status,setStatus]=useState(''),[progress,setProgress]=useState({loaded:0,total:0});
  const busy=!!activeAction, downloading=activeAction==='download';
  const controller=useRef<AbortController | null>(null);
  const url=apiBase+'/api/local-downloads?'+new URLSearchParams({endpoint,id,...(artifact ? {artifact} : {})});
  useEffect(()=>{
    const pending=new AbortController();
    setChecking(true);setDownloaded(false);setStatus('');setError('');
    const check=()=>{void request(url,{signal:pending.signal}).then(r=>r.json()).then(value=>{if(!pending.signal.aborted)setDownloaded(value.downloaded===true);}).catch(()=>{}).finally(()=>{if(!pending.signal.aborted)setChecking(false);});};
    check();window.addEventListener('focus',check);
    return ()=>{pending.abort();controller.current?.abort();window.removeEventListener('focus',check);};
  },[url,request]);
  async function action(kind:string) {
    if(busy)return;
    const pending=new AbortController();controller.current=pending;setActiveAction(kind);setError('');setProgress({loaded:0,total:0});
    setStatus(kind==='download' ? '正在准备下载…' : '');
    try {
      const response=await request(url+'&action='+kind,{method:'POST',signal:pending.signal});
      if(!response.headers.get('Content-Type')?.includes('application/x-ndjson')) {
        const value=await response.json();
        if(value.downloaded===false)setDownloaded(false);
        if(!response.ok)throw new Error(value.error || '操作失败');
        if(value.cancelled)setStatus('已取消');
        return;
      }
      const reader=response.body!.getReader(),decoder=new TextDecoder();let buffer='',complete=false;
      try {
        for(;;){
          const chunk=await reader.read();buffer+=decoder.decode(chunk.value,{stream:!chunk.done});let end;
          while((end=buffer.indexOf('\n'))>=0){
            const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line)continue;
            const event=JSON.parse(line);
            if(event.type==='error')throw new Error(event.error);
            if(event.type==='progress'){setProgress(event);setStatus(event.total && event.loaded>=event.total ? '正在校验下载文件…' : '正在下载');}
            if(event.type==='complete'){complete=true;setDownloaded(true);setStatus('已下载 · 校验通过');}
          }
          if(chunk.done)break;
        }
        if(!complete)throw new Error('下载中断，请重试');
      } finally {await reader.cancel().catch(()=>{});}
    } catch(e){setStatus(kind==='download' ? (pending.signal.aborted ? '已取消下载' : '下载失败') : '');if(!pending.signal.aborted)setError(e instanceof Error ? e.message : '操作失败');}
    finally{if(controller.current===pending){controller.current=null;setActiveAction('');}}
  }
  const extension=name.split('.').pop()?.toLowerCase() || '';
  const fileType=({docx:'Word',doc:'Word',txt:'Text',md:'Text'} as Record<string,string>)[extension] || extension.toUpperCase();
  const codeFile=['txt','md','csv','json'].includes(extension);
  const primary=downloaded ? '打开' : '下载';
  const canPreview=downloaded && !!onPreview;
  const cardAction=checking ? '正在检查本地文件' : canPreview ? '在右侧预览' : downloaded ? '使用系统应用打开' : '下载';
  return <div className="attachment-download">
    {compact ? <AttachmentAudioMenu name={name}>
      {details}
      <button type="button" disabled={busy || checking} onClick={()=>void action(downloaded ? 'open' : 'download')}><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7"><path d={downloaded ? 'M14 3h7v7m0-7L10 14M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5' : 'M12 3v12m-5-5 5 5 5-5M5 8H3v12h18V8h-2'}/></svg><span>{primary}</span></button>
      {downloaded && <button type="button" disabled={busy} onClick={()=>void action('reveal')}><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M3 6h7l2 3h9v11H3z"/></svg><span>打开所在位置</span></button>}
    </AttachmentAudioMenu> : file ? <div className="attachment-file-row">
      <button className="attachment-file-main" type="button" disabled={busy || checking} title={cardAction} aria-label={`${canPreview ? '预览' : primary} ${name}`} onClick={()=>canPreview ? onPreview!() : void action(downloaded ? 'open' : 'download')}>
        <span className="attachment-file-icon" aria-hidden="true">{codeFile ? <span className="attachment-code-icon">&lt;/&gt;</span> : <svg width="20" height="24" viewBox="0 0 24 28" fill="none"><rect x="4" y="2" width="16" height="24" rx="4" stroke="currentColor" strokeWidth="1.6"/><path d="M8 9h8M8 14h6M8 19h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>}</span>
        <span className="attachment-file-label"><strong>{name}</strong><small>{fileType}</small></span>
        <span className="attachment-file-action" aria-hidden="true">{checking ? '…' : downloaded ? '↗' : '↓'}</span>
      </button>
      <details className="attachment-menu"><summary aria-label={`${name} 文件操作`}>···</summary><div>
        <button type="button" disabled={busy} onClick={()=>void action(downloaded ? 'open' : 'download')}>{primary}</button>
        {downloaded && <button type="button" disabled={busy} onClick={()=>void action('reveal')}>打开所在位置</button>}
        {details}
      </div></details>
    </div> : <button type="button" disabled={busy || checking} onClick={()=>void action(downloaded ? 'open' : 'download')}>{checking ? '正在检查…' : downloaded ? '打开' : downloading ? '正在下载…' : children}</button>}
    {downloading && <button type="button" onClick={()=>controller.current?.abort()}>取消下载</button>}
    {status && <small role="status">{status}{downloading && progress.total ? ` · ${Math.min(99,Math.floor(progress.loaded / progress.total * 100))}% · ${transferBytes(progress.loaded)} / ${transferBytes(progress.total)}` : ''}</small>}
    {downloading && <progress aria-label={`${name} 下载进度`} max={progress.total || undefined} value={progress.total ? progress.loaded : undefined} />}
    {error && <p role="alert">{error}</p>}
  </div>;
}
