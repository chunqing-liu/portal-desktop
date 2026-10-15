export interface AttachmentPart {
  type: 'attachment'; attachment_id: string; name: string; mime: string; size: number;
  parse_status: string; job_id?: string; parse_result_id?: string;
  progress?: {stage: string; completed: number; total?: number; unit?: string; report?: {artifact_id: string}};
}
export interface AttachmentMessage {
  version: 1; message_id: string; channel: string; scene_id: string; scene_label?: string;
  created_at: number; delivery_status: string; parts: ({type: 'text'; text: string} | AttachmentPart)[];
}
const messageID = /^msg_[a-f0-9]{64}$/;
export function messageMarker(id: string) {
  if (!messageID.test(id)) throw new Error('无效的附件消息 ID');
  return `[attachment-message:v1:${id}]`;
}
export function messageReferences(text: string): string[] {
  const matches = [...text.matchAll(/^\[attachment-message:v1:(msg_[a-f0-9]{64}(?:,msg_[a-f0-9]{64})*)\]\r?$/gm)];
  return [...new Set(matches.at(-1)?.[1].split(',') || [])];
}
export function validateMessage(value: any, expected?: string): AttachmentMessage {
  if (!value || value.version !== 1 || !messageID.test(value.message_id) || (expected && value.message_id !== expected) ||
      typeof value.scene_id !== 'string' || typeof value.channel !== 'string' || !Number.isFinite(value.created_at) ||
      !['pending','sending','accepted','unknown','failed','cancelled'].includes(value.delivery_status) ||
      !Array.isArray(value.parts) || value.parts.length > 201 || !value.parts.every((part: any) =>
        part.type === 'text' ? typeof part.text === 'string' : part.type === 'attachment' &&
        /^[a-zA-Z0-9_-]{1,160}$/.test(part.attachment_id) && typeof part.name === 'string' && typeof part.mime === 'string' && Number.isSafeInteger(part.size) && part.size >= 0)) throw new Error('附件消息响应无效');
  return value;
}
export type AttachmentRequest = (path: string, init?: RequestInit) => Promise<Response>;
export async function attachmentJSON(request: AttachmentRequest, path: string, init?: RequestInit) {
  const response = await request(path, init);
  const value = await response.json();
  if (!response.ok) {
    const code = typeof value.error === 'object' ? value.error?.code : '';
    const friendly: Record<string, string> = {FILE_TOO_LARGE:'文件超过当前 Gateway 配置的大小上限',MULTIMODAL_DISABLED:'附件服务尚未开启', MULTIMODAL_NOT_ENABLED:'当前 Being 尚未开通附件功能'};
    throw new Error(friendly[code] || (typeof value.error === 'string' ? value.error : `附件请求失败 (${response.status}${code ? ': ' + code : ''})`));
  }
  return value;
}
export class AttachmentMessages {
  cache = new Map<string, AttachmentMessage>();
  private pending = new Map<string, Promise<AttachmentMessage>>();
  constructor(private request: AttachmentRequest) {}
  async get(id: string, refresh = false) {
    if (!messageID.test(id)) throw new Error('无效附件消息 ID');
    if (!refresh && this.cache.has(id)) return this.cache.get(id)!;
    let promise = this.pending.get(id);
    if (!promise) {
      promise = attachmentJSON(this.request, `/api/attachment-messages/${id}`).then(value => {
        const view = validateMessage(value, id); this.cache.set(id, view); return view;
      }).finally(() => this.pending.delete(id));
      this.pending.set(id, promise);
    }
    return promise;
  }
  async create(key: string, body: unknown) {
    const value = validateMessage(await attachmentJSON(this.request, '/api/attachment-messages', {method:'POST', headers:{'Content-Type':'application/json','Idempotency-Key':key}, body:JSON.stringify(body)}));
    this.cache.set(value.message_id, value); return value;
  }
  async update(id: string, body: unknown) {
    if (!messageID.test(id)) throw new Error('无效附件消息 ID');
    const value = validateMessage(await attachmentJSON(this.request, `/api/attachment-messages/${id}`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)}), id);
    this.cache.set(id, value); return value;
  }
  async list() {
    const result: AttachmentMessage[] = [], cursors = new Set<string>(); let cursor: string | null = null;
    do {
      const page = await attachmentJSON(this.request, '/api/attachment-messages?limit=100' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
      if (!Array.isArray(page.messages)) throw new Error('无效的附件消息列表');
      for (const row of page.messages) { const view = validateMessage(row); this.cache.set(view.message_id, view); result.push(view); }
      cursor = page.next_cursor;
      if (cursor) { if (typeof cursor !== 'string' || cursors.has(cursor)) throw new Error('附件消息分页重复'); cursors.add(cursor); }
    } while (cursor);
    return result;
  }
}
