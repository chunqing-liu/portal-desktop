import type {ChatItem} from '../models/chat';
import {attachmentProgress} from './attachments';
export function AttachmentProcessing({items,name,thinking=false}:{items:ChatItem[];name:string;thinking?:boolean}) {
  const message=items.find(item=>item.kind==='message' && item.queued && !item.retry && (item.attachmentUploads?.length || item.attachmentViews?.length));
  if(!message || message.kind!=='message')return null;
  const current=message?.kind==='message' ? message : undefined;
  const parts=current?.attachmentViews?.flatMap(view=>view.parts.filter(part=>part.type==='attachment')) || [];
  const uploading=current?.attachmentUploads?.some(file=>file.progress?.phase!=='complete') && !parts.length;
  const parsing=!!current && (!parts.length && !uploading || parts.some(part=>!['ready','failed','unavailable'].includes(part.parse_status)));
  const active=parts.find(part=>!['ready','failed','unavailable'].includes(part.parse_status));
  if(!uploading && !parsing)return null;
  const label=uploading ? (current?.attachmentUploads?.some(file=>file.progress) ? '正在上传附件' : '等待发送') : parsing ? '正在解析附件' : '思考中';
  const uploads=current?.attachmentUploads || [];
  const total=parts.length || uploads.length;
  const completed=parts.length ? parts.filter(part=>part.parse_status==='ready').length : uploading ? uploads.filter(file=>file.progress?.phase==='complete').length : 0;
  const filename=active?.name || uploads.find(file=>file.progress?.phase!=='complete')?.name;
  return <div className="attachment-processing-status" role="status">
    <span className="attachment-status-spinner" aria-hidden="true" />
    <span>{label} · {completed} / {total}{filename ? ` · ${filename}` : ''}</span>
    {active && <small>{attachmentProgress(active)}</small>}
  </div>;
}
