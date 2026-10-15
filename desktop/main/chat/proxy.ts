import { ATTACHMENT_TRANSFER_TIMEOUT_MS } from '../../shared/attachment-limits';
import { attachmentRoute, handleAttachment } from './attachments';
import type { Connection } from './connection';
import type { ChatScene } from '../../shared/types';

const routes: Record<string, string[]> = {
  '/health': ['GET'], '/api/status': ['GET'], '/api/history': ['GET'],
  '/api/stream/active': ['GET'], '/api/chat/stream': ['POST'], '/api/stop': ['POST'],
  '/api/llm/config': ['GET', 'PATCH'],
  '/api/llm/routes': ['GET'], '/api/llm/models': ['GET'], '/api/llm/keys': ['POST'],
};
export function upstreamRequest(request: Request, connection: Connection) {
  const local = new URL(request.url);
  if (local.protocol !== 'beings:' || local.hostname !== 'chat' || !routes[local.pathname]?.includes(request.method)) {
    throw new Error('API route not allowed');
  }
  const url = new URL(connection.endpoint + local.pathname);
  for (const key of ['limit', 'after']) {
    const value = local.searchParams.get(key);
    if (value !== null && /^\d{1,16}$/.test(value)) url.searchParams.set(key, value);
  }
  if (local.pathname === '/api/llm/models') {
    const route = local.searchParams.get('route');
    if (route && route.length <= 256) url.searchParams.set('route', route);
  }
  url.searchParams.set('token', connection.token);
  const headers = new Headers();
  if (request.headers.has('content-type')) headers.set('content-type', request.headers.get('content-type')!);
  headers.set('accept', request.headers.get('accept') || '*/*');
  if (local.pathname.startsWith('/api/llm/')) headers.set('X-Relay-Secret', connection.relaySecret);
  return { url: url.href, headers };
}

export class ChatProxy {
  onAttachmentUploaded?: (token:string, endpoint:string, id:string, checksum:string) => Promise<void>;
  private requests = new Set<AbortController>();
  constructor(private getConnection: () => Connection | null, private fetchUpstream: typeof fetch, private scene?: ChatScene | (() => ChatScene | undefined), private resolveScene?: (id: string) => ChatScene | undefined) {}
  abortAll() { for (const controller of this.requests) controller.abort(); this.requests.clear(); }
  async handle(request: Request): Promise<Response> {
    const connection = this.getConnection();
    let scene = typeof this.scene === "function" ? this.scene() : this.scene;
    if (!connection) return Response.json({ error: '请先连接 Being。' }, { status: 401 });
    const expectedEndpoint = request.headers.get('X-Portal-Being-Endpoint');
    if (expectedEndpoint && expectedEndpoint !== connection.endpoint)
      return Response.json({ error: 'Being 连接已切换，请刷新对话后重试。' }, { status: 409 });
    const local = new URL(request.url);
    const attachment = local.protocol === 'beings:' && local.hostname === 'chat' && attachmentRoute(local.pathname, request.method);
    if (attachment) {
      const requestedScene = request.headers.get('X-Portal-Scene-Id');
      if (requestedScene && requestedScene !== scene?.scene_id) scene = this.resolveScene?.(requestedScene);
      const controller = new AbortController();
      this.requests.add(controller);
      const signal = AbortSignal.any([controller.signal, request.signal, AbortSignal.timeout((request.method === 'POST' && local.pathname === '/api/attachments') || local.pathname.endsWith('/content') ? ATTACHMENT_TRANSFER_TIMEOUT_MS : 60000)]);
      if (request.method === 'POST' && local.pathname === '/api/attachments' && request.headers.get('Accept') === 'application/x-ndjson') {
        const encoder = new TextEncoder();
        const cleanup = () => this.requests.delete(controller);
        let cancelled = false;
        return new Response(new ReadableStream({
          start: stream => {
            const emit = (value: unknown) => { if (!cancelled) stream.enqueue(encoder.encode(JSON.stringify(value) + '\n')); };
            void handleAttachment(request, connection, scene, this.fetchUpstream, signal, progress => emit({type:'progress',...progress}), this.onAttachmentUploaded)
              .then(async response => {
                const value = await response.json();
                emit(response.ok ? {type:'complete',attachment:value} : {type:'error',status:response.status,error:value.error});
              }).catch(() => emit({type:'error',error:'附件上传失败，请检查连接后重试'}))
              .finally(() => { cleanup(); if (!cancelled) stream.close(); });
          },
          cancel() { cancelled = true; controller.abort(); cleanup(); },
        }), {headers:{'Content-Type':'application/x-ndjson','Cache-Control':'no-store'}});
      }
      try {
        const response = await handleAttachment(request, connection, scene, this.fetchUpstream, signal, undefined, this.onAttachmentUploaded);
        if (!response.body) { this.requests.delete(controller); return response; }
        const reader = response.body.getReader();
        const cleanup = () => this.requests.delete(controller);
        return new Response(new ReadableStream({
          async pull(stream) {
            try {
              const chunk = await reader.read();
              if (chunk.done) { cleanup(); stream.close(); } else stream.enqueue(chunk.value);
            } catch (error) { cleanup(); stream.error(error); }
          },
          async cancel() { controller.abort(); cleanup(); await reader.cancel().catch(() => {}); },
        }), {status:response.status, headers:response.headers});
      } catch {
        this.requests.delete(controller);
        return Response.json({error: '附件请求失败，请检查连接、服务配置或文件大小后重试。'}, {status: 502});
      }
    }
    let upstream: ReturnType<typeof upstreamRequest>;
    try { upstream = upstreamRequest(request, connection); }
    catch { return new Response('Not found', { status: 404 }); }
    const isChatSend = request.method === 'POST' && new URL(request.url).pathname === '/api/chat/stream';
    if (isChatSend && !scene) {
      return Response.json({ error: '客户端场景不可用，暂时无法发送消息。请检查启动提示并重启客户端。' }, { status: 409 });
    }
    const expectedScene = request.headers.get('X-Portal-Scene-Id');
    if (isChatSend && expectedScene && expectedScene !== scene?.scene_id) scene = this.resolveScene?.(expectedScene);
    if (isChatSend && expectedScene && expectedScene !== scene?.scene_id)
      return Response.json({ error: '场景已切换，请在原场景中重试。' }, { status: 409 });
    const controller = new AbortController();
    this.requests.add(controller);
    const abort = () => controller.abort();
    request.signal.addEventListener('abort', abort, { once: true });
    if (request.signal.aborted) abort();
    const cleanup = () => { this.requests.delete(controller); request.signal.removeEventListener('abort', abort); };
    // Header timeout only. Long-running chat streams must remain open.
    const timeout = setTimeout(abort, 30_000);
    try {
      let body: ArrayBuffer | string | undefined = ['POST', 'PATCH'].includes(request.method) ? await request.arrayBuffer() : undefined;
      if (isChatSend) {
        let message;
        try {
          message = JSON.parse(new TextDecoder().decode(body as ArrayBuffer));
          if (!message || typeof message !== 'object' || Array.isArray(message)) throw new Error('Invalid chat body');
        } catch {
          clearTimeout(timeout); cleanup();
          return Response.json({ error: '无效的聊天请求。' }, { status: 400 });
        }
        // The main process owns send identity, regardless of the visible history
        // scope or any scene fields supplied by the renderer, splices or retries.
        // Scene protocol fields never become part of the user's message text.
        body = JSON.stringify({ ...message, ...scene });
        upstream.headers.set('content-type', 'application/json');
      }
      const response = await this.fetchUpstream(upstream.url, {
        method: request.method, headers: upstream.headers, redirect: 'error', credentials: 'omit', cache: 'no-store',
        body,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const headers = new Headers({ 'Cache-Control': 'no-store', 'Content-Type': response.headers.get('content-type') || 'application/json' });
      if (!response.body || response.status === 204 || response.status === 304) {
        cleanup(); return new Response(null, { status: response.status, headers });
      }
      const reader = response.body.getReader();
      return new Response(new ReadableStream({
        async pull(stream) {
          try {
            const result = await reader.read();
            if (result.done) { cleanup(); stream.close(); } else stream.enqueue(result.value);
          } catch (error) { cleanup(); stream.error(error); }
        },
        async cancel() { controller.abort(); cleanup(); await reader.cancel().catch(() => {}); },
      }), { status: response.status, headers });
    } catch {
      clearTimeout(timeout); cleanup();
      return Response.json({ error: '无法连接 Being，请检查网络、地址或凭据。' }, { status: 502 });
    }
  }
}
