import {createHash,randomUUID} from 'node:crypto';
import {createReadStream,openAsBlob} from 'node:fs';
import {readFile,writeFile,mkdir,open,rename,rm} from 'node:fs/promises';
import path from 'node:path';
import type {ChatProxy} from './proxy';
interface SavedFile {path:string; sha256:string; size:number; source?:boolean}
interface DownloadSettings {directory?:string; files:Record<string,SavedFile>}
/** Only verified attachments can become local file handles; callers never supply a local path. */
export class AttachmentDownloads {
  private settings: DownloadSettings = {files:{}};
  private ready: Promise<void>;
  private sources = new Map<string, SavedFile>();
  private choosing?: Promise<string | undefined>;
  private saving = Promise.resolve();
  constructor(private profile: string, private choose: (current?:string) => Promise<string | undefined>, private openFile: (file:string) => Promise<string>, private revealFile: (file:string) => void = () => {}) {
    this.ready = readFile(path.join(profile,'attachment-downloads.json'),'utf8').then(raw => {this.settings=JSON.parse(raw);}).catch(() => {});
  }
  async registerSource(filename:string) {
    if(!filename || !path.isAbsolute(filename))return null;
    const hash=createHash('sha256');let size=0;
    for await(const chunk of createReadStream(filename)){size+=chunk.length;if(size>128*1024*1024)throw new Error('附件过大');hash.update(chunk);}
    const token=randomUUID();this.sources.set(token,{path:filename,size,sha256:hash.digest('hex'),source:true});return token;
  }
  async bindSource(token:string,endpoint:string,id:string,checksum:string) {
    await this.ready;const file=this.sources.get(token);
    if(file && file.sha256===checksum){this.settings.files[JSON.stringify([endpoint,id,null])]=file;await this.persist();this.sources.delete(token);}
  }
  private persist() {
    this.saving = this.saving.catch(() => {}).then(async () => {
      await mkdir(this.profile,{recursive:true});
      const file=path.join(this.profile,'attachment-downloads.json');
      await writeFile(file+'.tmp',JSON.stringify(this.settings),{mode:0o600}); await rename(file+'.tmp',file);
    });
    return this.saving;
  }
  private async verified(file?: SavedFile) {
    if (!file) return false;
    try {
      const hash=createHash('sha256'); let size=0;
      for await (const chunk of createReadStream(file.path)) {hash.update(chunk);size+=chunk.length;}
      return size===file.size && hash.digest('hex')===file.sha256;
    } catch { return false; }
  }
  async downloadDirectory(change=false) {
    await this.ready;
    return change ? await this.directory(true) : this.settings.directory;
  }
  private async directory(force=false) {
    if (!force && this.settings.directory) return this.settings.directory;
    this.choosing ||= this.choose(this.settings.directory).finally(() => {this.choosing=undefined;});
    const selected=await this.choosing;
    if(selected){this.settings.directory=selected;await this.persist();}
    return selected;
  }
  async handle(request:Request, proxy:ChatProxy) {
    await this.ready;
    const url=new URL(request.url), endpoint=url.searchParams.get('endpoint'), id=url.searchParams.get('id'), artifact=url.searchParams.get('artifact');
    if(!endpoint || !/^[a-zA-Z0-9_-]{1,160}$/.test(id || '') || artifact && !/^[a-zA-Z0-9_-]{1,160}$/.test(artifact)) return Response.json({error:'无效附件'},{status:400});
    const key=JSON.stringify([endpoint,id,artifact]); const file=this.settings.files[key];
    if(request.method==='GET' && url.searchParams.get('action')==='content') {
      if(!await this.verified(file))return Response.json({error:'本地文件已移动、删除或发生变化，请重新下载',downloaded:false},{status:409});
      return new Response(await openAsBlob(file.path),{headers:{'Content-Type':'application/octet-stream','Cache-Control':'no-store'}});
    }
    if(request.method==='GET') return Response.json({downloaded:await this.verified(file),source:file?.source===true,directory:this.settings.directory || ''});
    if(request.method!=='POST')return new Response(null,{status:405});
    const action=url.searchParams.get('action');
    if(action==='directory') {const directory=await this.directory(true);return Response.json({directory:directory || this.settings.directory || '',cancelled:!directory});}
    if(action==='open' || action==='reveal') {
      if(!await this.verified(file))return Response.json({error:'文件已移动、删除或校验失败，请重新下载',downloaded:false},{status:409});
      if(action==='reveal'){this.revealFile(file.path);return Response.json({opened:true});}
      const error=await this.openFile(file.path);return Response.json(error ? {error} : {opened:true},{status:error ? 500 : 200});
    }
    if(action!=='download')return new Response(null,{status:400});
    const directory=await this.directory(); if(!directory)return Response.json({cancelled:true});
    const controller=new AbortController(), signal=AbortSignal.any([request.signal,controller.signal]);
    const contentURL=`beings://chat/api/attachments/${id}${artifact ? '/artifacts/'+artifact : ''}/content?endpoint=${encodeURIComponent(endpoint)}`;
    const response=await proxy.handle(new Request(contentURL,{signal}));
    if(!response.ok)return response;
    const disposition=response.headers.get('Content-Disposition') || '';
    const filename=path.basename(decodeURIComponent(disposition.split("filename*=UTF-8''")[1] || 'attachment')).replace(/[\\/:*?"<>|\x00-\x1f]/g,'_');
    const suffix=path.extname(filename), basename=filename.slice(0,filename.length-suffix.length) || 'attachment';
    const destination=path.join(directory,basename+'-'+randomUUID().slice(0,8)+suffix);
    const temporary=destination+'.part'; const total=Number(response.headers.get('Content-Length')) || 0;
    let cancelled=false;
    return new Response(new ReadableStream({
      start: stream => {
        const emit=(value:unknown)=>{if(!cancelled)stream.enqueue(new TextEncoder().encode(JSON.stringify(value)+'\n'));};
        void (async()=>{
          let handle;const reader=response.body!.getReader();let loaded=0;const hash=createHash('sha256');
          try {
            handle=await open(temporary,'wx',0o600);
            for(;;){signal.throwIfAborted();const next=await reader.read();if(next.done)break;await handle.writeFile(next.value);hash.update(next.value);loaded+=next.value.byteLength;emit({type:'progress',loaded,total});}
            signal.throwIfAborted(); if(total && loaded!==total)throw new Error('下载不完整');
            await handle.sync();await handle.close();handle=undefined;
            const saved={path:destination,sha256:hash.digest('hex'),size:loaded};
            // Verify bytes from disk before exposing the Open action.
            if(!await this.verified({...saved,path:temporary}))throw new Error('下载文件校验失败');
            signal.throwIfAborted();await rename(temporary,destination);this.settings.files[key]=saved;await this.persist();emit({type:'complete',downloaded:true});
          }catch{emit({type:'error',error:signal.aborted ? '已取消下载' : '下载或文件校验失败，请重试'});}
          finally{await handle?.close().catch(()=>{});await reader.cancel().catch(()=>{});await rm(temporary,{force:true}).catch(()=>{});if(!cancelled)stream.close();}
        })();
      },
      cancel(){cancelled=true;controller.abort();},
    }),{headers:{'Content-Type':'application/x-ndjson','Cache-Control':'no-store'}});
  }
}
