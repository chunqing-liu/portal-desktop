import {createHash} from 'node:crypto';
import { MAX_ATTACHMENT_BYTES } from '../../shared/attachment-limits';
import { stageAttachment } from './attachment-staging';
export { MAX_ATTACHMENT_BYTES } from '../../shared/attachment-limits';
import type { Connection } from './connection';
import type { ChatScene } from '../../shared/types';

const id = '[a-zA-Z0-9_-]{1,160}';
export function attachmentRoute(path: string, method: string) {
  if (path === '/api/attachments' || path === '/api/attachment-messages') return ['GET', 'POST'].includes(method);
  if (new RegExp(`^/api/attachment-messages/${id}$`).test(path)) return ['GET', 'POST'].includes(method);
  if (new RegExp(`^/api/media-jobs/${id}$`).test(path)) return method === 'GET';
  if (new RegExp(`^/api/attachments/${id}(?:/parsed|/content|/artifacts/${id}/content)?$`).test(path)) return method === 'GET';
  return method === 'POST' && new RegExp(`^/api/attachments/${id}/parse$`).test(path);
}
function base(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('附件服务必须配置 HTTPS origin');
  return url.origin;
}
function objectGrant(grant: any, method: string) {
  const url = new URL(grant?.url);
  const custom = (process.env.PORTAL_ATTACHMENT_OSS_ORIGINS || '').split(',').filter(Boolean).map(x => base(x.trim()));
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && !custom.includes(url.origin)) || grant.method !== method ||
      (!/^[a-z0-9-]+\.oss-[a-z0-9-]+\.aliyuncs\.com$/.test(url.hostname) && !custom.includes(url.origin))) throw new Error('附件存储地址不受信任');
  const headers = new Headers(grant.headers || {});
  for (const key of headers.keys()) if (!/^(content-type|content-md5|content-length|range|x-oss-[a-z0-9-]+)$/.test(key)) throw new Error('无效的对象存储请求头');
  return { url: url.href, headers };
}
async function bounded(response: Response, limit: number) {
  if (Number(response.headers.get('content-length')) > limit) throw new Error('附件超过客户端大小限制');
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = []; let length = 0;
  if (reader) try {
    for (;;) { const next = await reader.read(); if (next.done) break; length += next.value.length; if (length > limit) throw new Error('附件超过客户端大小限制'); chunks.push(next.value); }
  } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks, length);
}
/** Only this boundary ever sees Heart credentials or signed OSS URLs. */
export async function handleAttachment(request: Request, connection: Connection, scene: ChatScene | undefined, fetcher: typeof fetch, signal: AbortSignal, progress?: (value: {phase:string; loaded:number; total:number}) => void, uploadedSource?: (token:string, endpoint:string, id:string, checksum:string) => Promise<void>): Promise<Response> {
  const local = new URL(request.url);
  const gateway = base(process.env.PORTAL_ATTACHMENT_GATEWAY_URL || 'https://beings.town');
  const heart = base(process.env.PORTAL_ATTACHMENT_HEART_BASE_URL || 'https://echo.beings.town');
  if (new URL(connection.endpoint).origin !== heart || (heart !== 'https://echo.beings.town' && !process.env.PORTAL_ATTACHMENT_GATEWAY_URL))
    return Response.json({ error: '当前自建 Heart 未配置匹配的附件 Gateway。' }, { status: 409 });
  const expected = request.headers.get('X-Portal-Being-Endpoint') || local.searchParams.get('endpoint');
  if (!expected || expected !== connection.endpoint) return Response.json({error: 'Being 连接已切换，请刷新后重试。'}, {status: 409});
  const write = request.method === 'POST';
  if (write && (!scene || request.headers.get('X-Portal-Scene-Id') !== scene.scene_id)) return Response.json({error: '附件场景不可用。'}, {status: 409});
  async function gatewayRequest(path: string, method = 'GET', body?: unknown, key?: string) {
    const headers = new Headers({ Authorization: `Bearer ${connection.token}`, 'X-Being-Id': connection.being });
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    if (key) headers.set('Idempotency-Key', key);
    return fetcher(gateway + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal,
      credentials: 'omit', redirect: 'error', cache: 'no-store' });
  }
  async function json(response: Response) {
    if (!response.ok) throw new Error('附件服务请求失败');
    return JSON.parse((await bounded(response, 4 * 1024 * 1024)).toString());
  }
  if (local.pathname === '/api/attachments' && write) {
    const key = request.headers.get('Idempotency-Key');
    const filename = local.searchParams.get('filename');
    if (!key || key.length > 128 || !filename || filename.length > 1024 || /[\x00-\x1f]/.test(filename)) return Response.json({error: '缺少有效文件名或上传标识。'}, {status: 400});
    if (Number(request.headers.get('Content-Length')) > MAX_ATTACHMENT_BYTES) return Response.json({error:'每个附件最大 128 MiB。'}, {status:413});
    progress?.({phase:'preparing',loaded:0,total:Number(request.headers.get('Content-Length')) || 0});
    const staged = await stageAttachment(request.body, MAX_ATTACHMENT_BYTES, signal);
    try {
      if (!staged.size) return Response.json({error: '不能上传空文件。'}, {status: 400});
      const mime = request.headers.get('Content-Type') || 'application/octet-stream';
      const reserve = await gatewayRequest('/api/attachments/uploads?conversation_ref=' + encodeURIComponent(`portal:${scene!.scene_id}`), 'POST', {
        filename, mime, size: staged.size, sha256: staged.sha256, md5: staged.md5,
      }, key);
      if (!reserve.ok) return reserve;
      const reservation = await json(reserve);
      if (!new RegExp(`^${id}$`).test(reservation.attachment?.attachment_id)) throw new Error('无效的附件响应');
      if (reservation.upload) {
        const grant = objectGrant(reservation.upload, 'PUT');
        let loaded = 0;
        const blob = await staged.blob(mime);
        progress?.({phase:'uploading',loaded,total:staged.size});
        const body = progress ? blob.stream().pipeThrough(new TransformStream({transform(chunk, stream) {
          loaded += chunk.byteLength; progress({phase:'uploading',loaded,total:staged.size}); stream.enqueue(chunk);
        }})) : blob;
        grant.headers.set('Content-Length', String(staged.size));
        const uploaded = await fetcher(grant.url, {method: 'PUT', headers: grant.headers, body, signal, credentials: 'omit', redirect: 'error', duplex:'half'} as RequestInit);
        // An already-written staging object is verified by complete; never overwrite it.
        if (!uploaded.ok && uploaded.status !== 409 && uploaded.status !== 412) throw new Error(`对象存储拒绝上传 (HTTP ${uploaded.status})`);
        await uploaded.body?.cancel();
      }
      progress?.({phase:'confirming',loaded:staged.size,total:staged.size});
      const completed=await gatewayRequest(`/api/attachments/${reservation.attachment.attachment_id}/complete`, 'POST', {});
      const source=request.headers.get('X-Portal-Attachment-Source');
      if(completed.ok && source)await uploadedSource?.(source,connection.endpoint,reservation.attachment.attachment_id,staged.sha256);
      return completed;
    } finally { await staged.cleanup(); }
  }
  const query = new URLSearchParams();
  for (const key of ['limit', 'cursor', 'parse_result_id', 'conversation_ref']) {
    const value = local.searchParams.get(key); if (value !== null && value.length <= 4096) query.set(key, value);
  }
  let body: any;
  if (write) {
    body = JSON.parse((await bounded(new Response(request.body), 128 * 1024)).toString());
    if (local.pathname === '/api/attachment-messages') body = { text: body.text, attachment_ids: body.attachment_ids, scene_id: scene!.scene_id, scene_label: scene!.scene_meta?.scene_label || 'Portal' };
  }
  const response = await gatewayRequest(local.pathname + (query.size ? '?' + query : ''), request.method, body, request.headers.get('Idempotency-Key') || undefined);
  if (!local.pathname.endsWith('/content') || !response.ok) return new Response(await bounded(response, 4 * 1024 * 1024), {status:response.status, headers:{'Content-Type':'application/json', 'Cache-Control':'no-store'}});
  const metadata = await json(response);
  if (!Number.isSafeInteger(metadata.size) || metadata.size < 0 || metadata.size > MAX_ATTACHMENT_BYTES) throw new Error('附件超过客户端 128 MiB 限制');
  const grant = objectGrant(metadata.download, 'GET');
  const range = request.headers.get('Range');
  if (range && /^bytes=\d*-\d*$/.test(range)) grant.headers.set('Range', range);
  const content = await fetcher(grant.url, {headers: grant.headers, signal, redirect: 'error', credentials: 'omit', cache: 'no-store'});
  if (!content.ok) throw new Error('附件下载失败');
  const reader = content.body?.getReader();
  const hash = createHash('sha256'); let size = 0;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        signal.throwIfAborted();
        const chunk = await reader?.read();
        if (!chunk || chunk.done) {
          if (content.status !== 206 && (size !== metadata.size || hash.digest('hex') !== metadata.checksum)) throw new Error('附件完整性校验失败');
          controller.close(); return;
        }
        size += chunk.value.byteLength;
        if (size > metadata.size) throw new Error('附件超过声明大小');
        hash.update(chunk.value); controller.enqueue(chunk.value);
      } catch (error) { await reader?.cancel().catch(() => {}); controller.error(error); }
    },
    async cancel() { await reader?.cancel(); },
  });
  const inline = local.searchParams.get('inline') === 'true' && /^(image\/(png|jpeg|gif|webp)|audio\/(mpeg|mp4|wav|x-wav|ogg|webm|flac))$/.test(metadata.mime);
  const headers = new Headers({'Content-Type': inline ? metadata.mime : 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(metadata.filename || 'attachment')}`});
  for (const key of ['content-range', 'accept-ranges']) if (content.headers.has(key)) headers.set(key, content.headers.get(key)!);
  if (content.status !== 206) headers.set('Content-Length', String(metadata.size));
  else if (content.headers.has('content-length')) headers.set('Content-Length', content.headers.get('content-length')!);
  return new Response(stream, {status: content.status, headers});
}
