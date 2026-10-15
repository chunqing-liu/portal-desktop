import { attachmentJSON } from './attachment-messages';
export function attachmentContentURL(endpoint: string, id: string, inline = false, artifact?: string) {
  const path = `/api/attachments/${encodeURIComponent(id)}` + (artifact ? `/artifacts/${encodeURIComponent(artifact)}` : '') + '/content';
  return 'beings://chat' + path + '?endpoint=' + encodeURIComponent(endpoint) + (inline ? '&inline=true' : '');
}
export function viewRequest(endpoint: string, signal: AbortSignal) {
  return (path: string, init: RequestInit = {}) => fetch('beings://chat' + path, {...init,
    headers: {...Object.fromEntries(new Headers(init.headers)), 'X-Portal-Being-Endpoint':endpoint},
    signal: AbortSignal.any([signal, AbortSignal.timeout(60000)])});
}
export async function parsedPage(endpoint: string, id: string, result: string, cursor: string | null, signal: AbortSignal) {
  const page = await attachmentJSON(viewRequest(endpoint, signal), `/api/attachments/${encodeURIComponent(id)}/parsed?limit=20&parse_result_id=${encodeURIComponent(result)}` + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
  if (page.attachment_id !== id || page.parse_result_id !== result || !Array.isArray(page.segments) ||
      !page.segments.every((s: any) => typeof s.text === 'string')) throw new Error('解析内容版本不匹配');
  return page;
}
