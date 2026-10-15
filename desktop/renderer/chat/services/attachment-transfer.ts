import {attachmentJSON, type AttachmentRequest} from './attachment-messages';
export interface UploadProgress {phase:string; loaded:number; total:number}
export async function uploadAttachment(request: AttachmentRequest, path: string, init: RequestInit, progress: (value: UploadProgress) => void) {
  const response = await request(path, {...init, headers:{...init.headers, Accept:'application/x-ndjson'}});
  if (!response.headers.get('Content-Type')?.includes('application/x-ndjson')) return attachmentJSON(async () => response, path);
  const reader = response.body!.getReader(), decoder = new TextDecoder();
  let pending = '', attachment: any;
  try {
    for (;;) {
      const chunk = await reader.read();
      pending += decoder.decode(chunk.value, {stream:!chunk.done});
      let end: number;
      while ((end = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0,end); pending = pending.slice(end + 1);
        if (!line) continue;
        const event = JSON.parse(line);
        if (event.type === 'error') {
          await attachmentJSON(async () => Response.json({error:event.error}, {status:event.status || 502}), path);
        }
        if (event.type === 'progress') progress(event);
        if (event.type === 'complete') attachment = event.attachment;
      }
      if (chunk.done) break;
    }
    if (!attachment || pending.trim()) throw new Error('附件上传确认中断，请重试');
    return attachment;
  } finally { await reader.cancel().catch(() => {}); }
}
export function transferBytes(bytes: number) {
  return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KiB` : `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}
