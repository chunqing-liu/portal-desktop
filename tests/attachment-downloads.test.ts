import {describe,it,expect,vi} from 'vitest';
import {mkdtemp,readFile,writeFile,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {AttachmentDownloads} from '../desktop/main/chat/downloads';
import type {ChatProxy} from '../desktop/main/chat/proxy';
const endpoint='https://echo.beings.town/alice';
const request=(action?:string,id='att_one')=>new Request('beings://chat/api/local-downloads?'+new URLSearchParams({endpoint,id,...(action ? {action} : {})}),{method:action ? 'POST' : 'GET'});
describe('verified local attachment files',()=>{
 it('chooses once, persists successful downloads, verifies before open and rejects changed files',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'town-download-test-'));
  const choose=vi.fn(async()=>directory),open=vi.fn(async()=>''),reveal=vi.fn();
  const proxy={handle:vi.fn(async()=>new Response('hello',{headers:{'Content-Length':'5','Content-Disposition':"attachment; filename*=UTF-8''hello.txt"}}))} as unknown as ChatProxy;
  try{
   const manager=new AttachmentDownloads(directory,choose,open,reveal);
   const events=(await (await manager.handle(request('download'),proxy)).text()).trim().split('\n').map(line=>JSON.parse(line));
   expect(events.at(-1)).toEqual({type:'complete',downloaded:true});expect(events[0]).toMatchObject({type:'progress',loaded:5,total:5});
   await (await manager.handle(request('download','att_two'),proxy)).text();expect(choose).toHaveBeenCalledTimes(1);
   expect(await manager.downloadDirectory()).toBe(directory);
   await manager.downloadDirectory(true);expect(choose).toHaveBeenCalledTimes(2);
   const restored=new AttachmentDownloads(directory,choose,open,reveal);
   expect(await (await restored.handle(request(),proxy)).json()).toMatchObject({downloaded:true,source:false});
   await restored.handle(request('open'),proxy);await restored.handle(request('reveal'),proxy);expect(open).toHaveBeenCalledTimes(1);expect(reveal).toHaveBeenCalledTimes(1);
   const saved=JSON.parse(await readFile(path.join(directory,'attachment-downloads.json'),'utf8'));
   const file=saved.files[JSON.stringify([endpoint,'att_one',null])].path;await writeFile(file,'changed');
   expect((await restored.handle(request('open'),proxy)).status).toBe(409);expect(open).toHaveBeenCalledTimes(1);
   expect(await (await restored.handle(request(),proxy)).json()).toMatchObject({downloaded:false});
  }finally{await rm(directory,{recursive:true,force:true});}
 });
 it('binds only matching uploaded bytes to a local source and never downloads them again',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'town-source-test-'));
  const file=path.join(directory,'source.txt');await writeFile(file,'source');const hash=createHash('sha256').update('source').digest('hex');
  const choose=vi.fn(),open=vi.fn(async()=>''),reveal=vi.fn(),proxy={handle:vi.fn()} as unknown as ChatProxy;
  try{
   const manager=new AttachmentDownloads(directory,choose,open,reveal);const token=await manager.registerSource(file);
   await manager.bindSource(token!,endpoint,'att_wrong','bad');expect(await (await manager.handle(request(undefined,'att_wrong'),proxy)).json()).toMatchObject({downloaded:false});
   await manager.bindSource(token!,endpoint,'att_one',hash);expect(await (await manager.handle(request(),proxy)).json()).toMatchObject({downloaded:true,source:true});
   const content=()=>new Request('beings://chat/api/local-downloads?'+new URLSearchParams({endpoint,id:'att_one',action:'content'}));
   expect(await (await manager.handle(content(),proxy)).text()).toBe('source');
   await manager.handle(request('open'),proxy);await manager.handle(request('reveal'),proxy);
   expect(open).toHaveBeenCalledWith(file);expect(reveal).toHaveBeenCalledWith(file);expect(choose).not.toHaveBeenCalled();expect(proxy.handle).not.toHaveBeenCalled();
   await writeFile(file,'modified');expect((await manager.handle(content(),proxy)).status).toBe(409);
  }finally{await rm(directory,{recursive:true,force:true});}
 });
 it('never publishes a partial file when the verified upstream stream fails',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'town-corrupt-test-'));
  let chunk=false;const proxy={handle:async()=>new Response(new ReadableStream({pull(controller){if(!chunk){chunk=true;controller.enqueue(new TextEncoder().encode('hello'));}else controller.error(new Error('checksum mismatch'));}}),{headers:{'Content-Length':'5'}})} as unknown as ChatProxy;
  try{
   const manager=new AttachmentDownloads(directory,async()=>directory,async()=>'');
   expect(await (await manager.handle(request('download'),proxy)).text()).toContain('"type":"error"');
   expect(await readdir(directory)).toEqual(['attachment-downloads.json']);
   expect(await (await manager.handle(request(),proxy)).json()).toMatchObject({downloaded:false});
  }finally{await rm(directory,{recursive:true,force:true});}
 });
});
