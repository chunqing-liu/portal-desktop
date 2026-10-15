import {displayTranscript} from '../services/audio-transcript';
import {useEffect,useState} from 'react';
import type {AttachmentPart} from '../services/attachment-messages';
import {parsedPage} from '../services/attachment-view';
export function AttachmentTranscript({part,endpoint}:{part:AttachmentPart;endpoint:string}) {
  const [text,setText]=useState(''),[error,setError]=useState(false),[attempt,setAttempt]=useState(0),[expanded,setExpanded]=useState(false);
  useEffect(()=>{
    if(!part.parse_result_id || part.parse_status!=='ready')return;
    const controller=new AbortController();setText('');setError(false);
    void (async()=>{
      let cursor:string|null=null;const seen=new Set<string>();const segments:string[]=[];
      do {
        const page=await parsedPage(endpoint,part.attachment_id,part.parse_result_id!,cursor,controller.signal);
        segments.push(...page.segments.map((segment:{text:string})=>segment.text));
        cursor=page.next_cursor || null;
        if(cursor && seen.has(cursor))throw new Error('重复分页');
        if(cursor)seen.add(cursor);
        if(seen.size>200)throw new Error('转写过长');
      }while(cursor);
      if(!controller.signal.aborted)setText(displayTranscript(segments.join('\n')));
    })().catch(()=>{if(!controller.signal.aborted)setError(true);});
    return ()=>controller.abort();
  },[endpoint,part.attachment_id,part.parse_result_id,part.parse_status,attempt]);
  if(!text)return error ? <div className="attachment-transcript-error">语音文字加载失败 <button onClick={()=>setAttempt(attempt+1)}>重试</button></div> : null;
  return <div className="attachment-transcript" aria-label={`${part.name} 语音文字`}><p>{expanded ? text : text.slice(0,1200)}</p>{text.length>1200 && <button type="button" onClick={()=>setExpanded(!expanded)}>{expanded ? '收起' : '展开全文'}</button>}</div>;
}
