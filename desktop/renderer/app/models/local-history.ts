import type { RecentChatMessage } from '../../../shared/types';

/** The chat document owns IndexedDB; the shell must read through its checked bridge. */
export class LocalHistoryReader {
  private pending = new Map<string, { source: string; endpoint: string; finish(rows?: RecentChatMessage[]): void }>();
  constructor(private source: () => string, private post: (data: Record<string, unknown>) => void) {}

  read(endpoint: string, signal?: AbortSignal): Promise<RecentChatMessage[]> {
    const source = this.source();
    if (!source || new URL(source).searchParams.get('history_scope') !== endpoint || signal?.aborted)
      return Promise.reject(new Error('本地对话尚未就绪'));
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const abort = () => finish();
      const finish = (rows?: RecentChatMessage[]) => {
        clearTimeout(timer); signal?.removeEventListener('abort', abort); this.pending.delete(id);
        if (rows && this.source() === source) resolve(rows);
        else reject(new Error('本地对话读取失败，请重试。'));
      };
      const timer = setTimeout(abort, 5000);
      signal?.addEventListener('abort', abort, { once: true });
      this.pending.set(id, { source, endpoint, finish });
      this.post({ type: 'beings:local-history-request', id, endpoint, revision: new URL(source).searchParams.get('revision') });
    });
  }

  receive(message: Record<string, any>): boolean {
    if (message.type !== 'beings:local-history-result') return false;
    const request = this.pending.get(message.id);
    if (!request || request.source !== this.source() || message.endpoint !== request.endpoint ||
        message.revision !== new URL(request.source).searchParams.get('revision')) return true;
    const rows = message.rows;
    if (message.ok !== true || !Array.isArray(rows) || rows.length > 100 || !rows.every(row => row &&
        Number.isSafeInteger(row.seq) && row.seq > 0 && row.role === 'user' &&
        typeof row.content === 'string' && row.content.length <= 64000 &&
        ['at', 'scene_id', 'scene_label'].every(key => typeof row[key] === 'string' && row[key].length <= 512))) request.finish();
    else request.finish(rows);
    return true;
  }

  clear() { for (const request of this.pending.values()) request.finish(); }
}
