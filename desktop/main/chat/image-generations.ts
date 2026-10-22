import type { Connection } from './connection';
import { generationSnapshot } from '../../shared/image-generation';

const route = /^\/api\/image-generations\/(gen_[A-Za-z0-9_-]{1,124}|by-request\/[A-Za-z0-9_-]{1,128})$/;
export function imageGenerationRoute(path: string) { return path.startsWith('/api/image-generations'); }
function origin(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Invalid gateway');
  return url.origin;
}
async function readJSON(response: Response) {
  const limit = 1024 * 1024;
  if (Number(response.headers.get('content-length')) > limit) { await response.body?.cancel(); throw new Error('Response too large'); }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty response');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.length; if (size > limit) throw new Error('Response too large');
      chunks.push(chunk.value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
}
export async function handleImageGeneration(request: Request, connection: Connection, fetcher: typeof fetch, signal: AbortSignal): Promise<Response> {
  const local = new URL(request.url), match = route.exec(local.pathname);
  if (request.method !== 'GET') return Response.json({error:'生图查询只支持 GET。'}, {status:405});
  if (!match || local.search) return Response.json({error:'无效的生图查询。'}, {status:400});
  if (request.headers.get('X-Portal-Being-Endpoint') !== connection.endpoint || request.headers.get('X-Portal-Generation-Being') !== connection.being)
    return Response.json({error:'回执与当前 Being 连接不一致，请切回原连接。'}, {status:409});
  const gateway = origin(process.env.PORTAL_ATTACHMENT_GATEWAY_URL || 'https://beings.town');
  const heart = origin(process.env.PORTAL_ATTACHMENT_HEART_BASE_URL || 'https://echo.beings.town');
  if (new URL(connection.endpoint).origin !== heart || heart !== 'https://echo.beings.town' && !process.env.PORTAL_ATTACHMENT_GATEWAY_URL)
    return Response.json({error:'当前 Heart 未配置匹配的生图 Gateway。'}, {status:409});
  const response = await fetcher(`${gateway}/api/being-service/v1/generations/${match[1]}`, {
    method:'GET', headers:{Authorization:`Bearer ${connection.token}`, 'X-Being-Id':connection.being, Accept:'application/json'},
    signal, redirect:'error', credentials:'omit', cache:'no-store',
  });
  if (!response.ok) {
    await response.body?.cancel();
    const messages: Record<number,string> = {401:'连接凭据无效，请重新连接 Being。',403:'当前连接无权查询该任务。',404:'尚未找到该任务，请核对回执或稍后重新查询。',429:'查询过于频繁，稍后重试。'};
    return Response.json({error:messages[response.status] || '暂时无法查询生成状态，请稍后重试。'}, {status:response.status >= 400 && response.status <= 599 ? response.status : 502});
  }
  const snapshot = generationSnapshot(await readJSON(response), gateway);
  if (match[1].startsWith('by-request/') ? snapshot.client_request_id !== match[1].slice(11) : snapshot.id !== match[1]) throw new Error('Generation identity mismatch');
  return Response.json(snapshot, {headers:{'Cache-Control':'no-store'}});
}
