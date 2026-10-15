import {createHash} from 'node:crypto';
import {createReadStream, openAsBlob} from 'node:fs';
import {mkdtemp, open, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';

/** Hash while writing bounded chunks: no whole-file Buffer or Base64 copy. */
export async function stageAttachment(body: ReadableStream<Uint8Array> | null, limit: number, signal: AbortSignal) {
  signal.throwIfAborted();
  const directory = await mkdtemp(path.join(tmpdir(), 'portal-attachment-'));
  const filename = path.join(directory, 'content');
  const cleanup = () => rm(directory, {recursive:true, force:true});
  const reader = body?.getReader();
  const abort = () => { void reader?.cancel(signal.reason).catch(() => {}); };
  signal.addEventListener('abort', abort, {once:true});
  let file;
  let size = 0;
  const sha256 = createHash('sha256'), md5 = createHash('md5');
  try {
    file = await open(filename, 'wx', 0o600);
    for (;;) {
      signal.throwIfAborted();
      const chunk = await reader?.read();
      signal.throwIfAborted();
      if (!chunk || chunk.done) break;
      size += chunk.value.length;
      if (size > limit) throw new Error('附件超过允许大小');
      sha256.update(chunk.value); md5.update(chunk.value);
      await file.writeFile(chunk.value);
    }
    await file.close(); file = undefined;
    return {
      size, sha256:sha256.digest('hex'), md5:md5.digest('base64'), cleanup,
      blob: (type: string) => openAsBlob(filename, {type}),
      stream() {
        const stream = createReadStream(filename, {signal});
        stream.once('close', () => { void cleanup().catch(() => {}); });
        return Readable.toWeb(stream) as ReadableStream<Uint8Array>;
      },
    };
  } catch (error) {
    await file?.close().catch(() => {});
    await cleanup();
    throw error;
  } finally {
    signal.removeEventListener('abort', abort);
    await reader?.cancel().catch(() => {});
  }
}
