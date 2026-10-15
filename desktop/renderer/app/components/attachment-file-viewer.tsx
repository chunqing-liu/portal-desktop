import {XlsxPreview} from './xlsx-preview';
import {PdfPreview} from './pdf-preview';
import {useEffect,useState,useCallback,type RefObject} from 'react';
import {PptxPreview} from './pptx-preview';
import {AttachmentDownload} from '../../chat/components/attachment-download';
import {Markdown} from '../../shared/components/markdown';
import {csvRows,validFilePreview} from './file-preview-data';
type FileView={id:string;name:string;extension:string;blob?:Blob;text?:string;segments?:{label:string;text:string}[];endpoint:string};
function JsonValue({value,label,depth=0}:{value:unknown;label?:string;depth?:number}) {
  if(depth>=12)return <pre>{label}: {JSON.stringify(value)}</pre>;
  if(value!==null && typeof value==='object')return <details open><summary>{label && `${label}: `}{Array.isArray(value)?`数组 (${value.length})`:`对象 (${Object.keys(value).length})`}</summary><div className="file-json-children">{Object.entries(value).slice(0,100).map(([key,v])=><JsonValue key={key} label={key} value={v} depth={depth+1}/>)}{Object.keys(value).length>100 && <p>仅显示前 100 项，请打开原件查看全部。</p>}</div></details>;
  return <div>{label && <strong>{label}: </strong>}<span>{JSON.stringify(value)}</span></div>;
}
function TextFile({extension,text}:{extension:string;text:string}) {
  if(extension==='md')return <Markdown content={text} intelligentUI={false}/>;
  if(extension==='json'){try{return <div className="file-json"><JsonValue value={JSON.parse(text)}/></div>;}catch{return <><p>JSON 格式不完整，以下显示原文。</p><pre>{text}</pre></>;}}
  if(extension==='csv'){const rows=csvRows(text);return <><table><tbody>{rows.slice(0,200).map((row,i)=><tr key={i}>{row.map((value,j)=>i===0?<th key={j}>{value}</th>:<td key={j}>{value}</td>)}</tr>)}</tbody></table>{rows.length>200 && <p>仅展示前 200 行，请打开原文件查看全部内容。</p>}</>;}
  return <pre>{text}</pre>;
}
export function AttachmentFileViewer({frame}:{frame:RefObject<HTMLIFrameElement|null>}) {
  const [file,setFile]=useState<FileView|null>(null),[maximized,setMaximized]=useState(false);
  const close=useCallback(()=>{setFile(null);frame.current?.focus();},[frame]);
  useEffect(()=>{
    const receive=(event:MessageEvent)=>{
      const target=frame.current,data=event.data;
      if(!target?.src || event.source!==target.contentWindow || event.origin!=='beings://chat' || data?.type!=='beings:file-preview')return;
      const source=new URL(target.src);
      if(data.revision!==source.searchParams.get('revision') || !validFilePreview(data))return;
      setFile({...data,endpoint:source.searchParams.get('history_scope') || ''});setMaximized(false);
    };
    window.addEventListener('message',receive);return()=>{window.removeEventListener('message',receive);};
  },[frame]);
  useEffect(()=>{if(!file)return;const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopImmediatePropagation();close();}};window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);},[file,close]);
  const request=useCallback<typeof fetch>(async(input,init)=>{
    const target=frame.current;if(!target?.contentWindow || !file)throw new Error('对话已关闭');
    const channel=new MessageChannel(),query=new URL(String(input),'https://local').searchParams;
    return new Promise<Response>((resolve,reject)=>{
      init?.signal?.addEventListener('abort',()=>{channel.port1.postMessage('abort');reject(new DOMException('Cancelled','AbortError'));},{once:true});
      channel.port1.onmessage=event=>{const data=event.data;if(data.error){reject(new Error(data.error));channel.port1.close();return;}resolve(new Response(data.body,{status:data.status,headers:data.headers}));};
      target.contentWindow!.postMessage({type:'beings:image-download',revision:new URL(target.src).searchParams.get('revision'),id:file.id,endpoint:file.endpoint,action:query.get('action')||'check'},'beings://chat',[channel.port2]);
    });
  },[frame,file]);
  return file && <aside className={`client-file-viewer${maximized?' maximized':''}`} aria-label={`文件预览：${file.name}`}>
    <header><button className="file-preview-layout-toggle" type="button" title={maximized?'恢复对话':'展开全部'} aria-label={maximized?'恢复对话':'展开全部'} aria-pressed={maximized} onClick={()=>setMaximized(value=>!value)}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="4"/><path d="M8 8v8" strokeWidth="3" strokeLinecap="round"/></svg></button><strong title={file.name}>{file.name}</strong><button type="button" aria-label="关闭文件预览" onClick={close}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header>
    <div className="client-file-actions"><span>{file.segments?'内容预览 · 不保留原版排版':'原文件预览'}</span><AttachmentDownload key={JSON.stringify([file.endpoint,file.id])} request={request} endpoint={file.endpoint} id={file.id} name={file.name}>下载原件</AttachmentDownload></div>
    {file.extension==='xlsx'?<XlsxPreview key={file.id} blob={file.blob!}/>:file.extension==='pptx'?<PptxPreview key={file.id} blob={file.blob!}/>:file.extension==='pdf'?<PdfPreview key={file.id} blob={file.blob!}/>:<div className="client-file-body">{file.segments?file.segments.map((s,i)=><section key={i}>{s.label && <h3>{s.label}</h3>}<Markdown content={s.text} intelligentUI={false}/></section>):<TextFile extension={file.extension} text={file.text || ''}/>}</div>}
  </aside>;
}
