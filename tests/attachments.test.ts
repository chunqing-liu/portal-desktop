import {stageAttachment} from '../desktop/main/chat/attachment-staging';
import {MAX_ATTACHMENT_BYTES} from '../desktop/shared/attachment-limits';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {createHash} from 'node:crypto';
import {ChatProxy} from '../desktop/main/chat/proxy';
import {parseConnection} from '../desktop/main/chat/connection';
import {readParsed, prepareAttachments} from '../desktop/renderer/chat/services/attachments';
import type {Attachment} from '../desktop/renderer/chat/models/chat';
const connection = parseConnection('https://echo.beings.town/alice/?token=secret');
const scene = {scene_id:'room',scene_meta:{client:'test',scene_label:'Room'}};
const msg = 'msg_' + 'a'.repeat(64);
const json = Response.json;
const headers = {'X-Portal-Being-Endpoint':connection.endpoint,'X-Portal-Scene-Id':'room','Idempotency-Key':'stable-key'};
afterEach(() => {vi.unstubAllEnvs();});
describe('attachment main-process boundary', () => {
  it('hashes and uploads bytes without forwarding Heart credentials to OSS', async () => {
    const calls: {url:string; init:RequestInit}[] = [];
    const fetcher = vi.fn(async (url: any, init: any) => {
      calls.push({url:String(url),init});
      if (String(url).includes('/uploads')) return json({attachment:{attachment_id:'att_one'},upload:{url:'https://bucket.oss-cn-shanghai.aliyuncs.com/object?signed=yes',method:'PUT',headers:{'Content-Type':'text/plain'}}});
      if (init.method === 'PUT') return new Response(null,{status:200});
      return json({attachment_id:'att_one',status:'ready'});
    });
    const proxy = new ChatProxy(() => connection, fetcher, scene);
    const result = await proxy.handle(new Request('beings://chat/api/attachments?filename=hello.txt',{method:'POST',headers:{...headers,'Content-Type':'text/plain'},body:'hello'}));
    expect(result.status).toBe(200); expect((await result.json()).status).toBe('ready');
    expect(calls[0].url).toContain('conversation_ref=portal%3Aroom');
    expect(JSON.parse(calls[0].init.body as string)).toMatchObject({size:5,sha256:createHash('sha256').update('hello').digest('hex'),md5:createHash('md5').update('hello').digest('base64')});
    expect(new Headers(calls[0].init.headers).get('Authorization')).toBe('Bearer secret');
    expect(new Headers(calls[1].init.headers).has('Authorization')).toBe(false);
    expect(new Headers(calls[1].init.headers).has('Cookie')).toBe(false);
    expect(calls[1].init.credentials).toBe('omit'); expect(calls[1].init.redirect).toBe('error');
    expect(calls[2].url).toMatch(/att_one\/complete$/);
  });
  it.each(['https://evil.test/object','http://bucket.oss-cn-shanghai.aliyuncs.com/object','https://bucket.oss-cn-shanghai.aliyuncs.com.evil.test/object'])('rejects untrusted grant %s', async url => {
    const fetcher = vi.fn(async () => json({attachment:{attachment_id:'att_one'},upload:{url,method:'PUT',headers:{}}}));
    const result = await new ChatProxy(() => connection,fetcher,scene).handle(new Request('beings://chat/api/attachments?filename=a',{method:'POST',headers,body:'a'}));
    expect(result.status).toBe(502); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not disclose a self-hosted Heart token to the public Gateway', async () => {
    const own = parseConnection('https://private.test/alice/?token=private'); const fetcher = vi.fn();
    const result = await new ChatProxy(() => own, fetcher, scene).handle(new Request('beings://chat/api/attachments',{headers:{'X-Portal-Being-Endpoint':own.endpoint}}));
    expect(result.status).toBe(409); expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects stale Being and unknown scene requests', async () => {
    const fetcher = vi.fn(); const proxy = new ChatProxy(() => connection,fetcher,scene);
    expect((await proxy.handle(new Request('beings://chat/api/attachments',{headers:{'X-Portal-Being-Endpoint':'https://echo.beings.town/bob'}}))).status).toBe(409);
    expect((await proxy.handle(new Request('beings://chat/api/attachments?filename=a',{method:'POST',headers:{...headers,'X-Portal-Scene-Id':'unknown'},body:'a'}))).status).toBe(409);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('pins view creation to a known scene and ignores renderer identity fields', async () => {
    const fetcher = vi.fn(async (_url:any, init:any) => json(JSON.parse(init.body)));
    const result = await new ChatProxy(() => connection,fetcher,scene).handle(new Request('beings://chat/api/attachment-messages',{method:'POST',headers,body:JSON.stringify({scene_id:'forged',text:'hi',attachment_ids:['att_one'],being_id:'bob'})}));
    expect(await result.json()).toEqual({scene_id:'room',scene_label:'Room',text:'hi',attachment_ids:['att_one']});
  });
  it('translates download grants to verified bytes and forwards audio ranges', async () => {
    const fetcher = vi.fn(async (url:any, init:any) => String(url).startsWith('https://beings.town')
      ? json({size:5,filename:'a.wav',mime:'audio/wav',checksum:createHash('sha256').update('hello').digest('hex'),download:{url:'https://bucket.oss-cn-shanghai.aliyuncs.com/a',method:'GET',headers:{}}})
      : new Response(new Headers(init.headers).has('Range') ? 'hel' : 'hello', {status:new Headers(init.headers).has('Range') ? 206 : 200,headers:{'content-range':'bytes 0-2/5'}}));
    const proxy = new ChatProxy(() => connection,fetcher,scene);
    const url = 'beings://chat/api/attachments/att_one/content?inline=true&endpoint=' + encodeURIComponent(connection.endpoint);
    const full = await proxy.handle(new Request(url)); expect(await full.text()).toBe('hello'); expect(full.headers.get('Content-Type')).toBe('audio/wav');
    const range = await proxy.handle(new Request(url,{headers:{Range:'bytes=0-2'}})); expect(range.status).toBe(206); expect(await range.text()).toBe('hel');
    expect(new Headers(fetcher.mock.calls[3][1].headers).get('Range')).toBe('bytes=0-2');
  });
});
describe('versioned parsing', () => {
  const page = {attachment_id:'att_one',parse_result_id:'result_one',complete:true,coverage:{complete:true},total_segments:2};
  it('traverses every page with pinned version, while labeling bounded context as excerpts', async () => {
    const request = vi.fn(async (url:string) => json({...page,segments:[{text:url.includes('cursor=')?'second':'first'}],next_cursor:url.includes('cursor=')?null:'next'}));
    const result = await readParsed(request,'att_one','result_one',5);
    expect(request).toHaveBeenCalledTimes(2); expect(request.mock.calls.every(([url]) => url.includes('parse_result_id=result_one'))).toBe(true);
    expect(result.truncated).toBe(true); expect(result.text.length).toBeLessThanOrEqual(5);
  });
  it.each([{complete:false},{parse_result_id:'changed'},{total_segments:3},{coverage:{complete:false}}])('rejects incomplete or inconsistent results %j', async change => {
    await expect(readParsed(async () => json({...page,segments:[{text:'x'},{text:'y'}],next_cursor:null,...change}),'att_one','result_one')).rejects.toThrow();
  });
  it('reuses upload and job IDs on restart and never forces inference', async () => {
    const file: Attachment = {name:'a.txt',type:'text/plain',size:1,base64:'',attachmentId:'att_one',jobId:'job_one',uploadKey:'stable'};
    const view = {version:1,message_id:msg,channel:'portal',scene_id:'room',created_at:1,delivery_status:'pending',parts:[{type:'attachment',attachment_id:'att_one',name:'a.txt',mime:'text/plain',size:1,parse_status:'ready'}]};
    const request = vi.fn(async (path:string) => {
      if(path.includes('/media-jobs/')) return json({job_id:'job_one',attachment_id:'att_one',status:'succeeded',result_id:'result_one'});
      if(path.includes('/parsed')) return json({...page,total_segments:1,segments:[{text:'parsed'}],next_cursor:null});
      return json(view);
    });
    const output = await prepareAttachments({key:'key',text:'',files:[file],sceneId:'room',transfer:{messageId:msg},request,signal:new AbortController().signal,save:async()=>{},show:()=>{}});
    expect(output).toContain('parsed'); expect(output).toContain(`[attachment-message:v1:${msg}]`);
    expect(request.mock.calls.some(([path]) => path.includes('/parse') && !path.includes('/parsed'))).toBe(false);
    expect(request.mock.calls.some(([path]) => path.includes('filename='))).toBe(false);
  });
});


describe('large attachment staging', () => {
  it('accepts the 128 MiB boundary using a chunked stream and a disk-backed Blob', async () => {
    const chunk = new Uint8Array(1024 * 1024).fill(120);
    let remaining = 128;
    const body = new ReadableStream<Uint8Array>({pull(controller) { if (remaining--) controller.enqueue(chunk); else controller.close(); }});
    const staged = await stageAttachment(body, MAX_ATTACHMENT_BYTES, new AbortController().signal);
    try {
      expect(staged.size).toBe(128 * 1024 * 1024);
      const blob = await staged.blob('application/octet-stream');
      expect(blob.size).toBe(staged.size);
      expect(await blob.slice(0, 3).text()).toBe('xxx');
      const hash = createHash('sha256'); for (let i = 0; i < 128; i++) hash.update(chunk);
      expect(staged.sha256).toBe(hash.digest('hex'));
    } finally { await staged.cleanup(); }
  });
  it('rejects a stream that exceeds its byte budget and cancels the source', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({pull(controller) { controller.enqueue(new Uint8Array(1024)); }, cancel});
    await expect(stageAttachment(body, 1023, new AbortController().signal)).rejects.toThrow('附件超过允许大小');
    expect(cancel).toHaveBeenCalled();
  });
  it('does not report success if a transfer is aborted while awaiting its body', async () => {
    const controller = new AbortController();
    const body = new ReadableStream<Uint8Array>({});
    const pending = stageAttachment(body, MAX_ATTACHMENT_BYTES, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow();
  });
});
