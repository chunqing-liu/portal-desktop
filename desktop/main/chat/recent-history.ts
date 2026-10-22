import type { RecentChatMessage } from '../../shared/types';
import { isHistoryQuestion } from '../../shared/chat-history';
import type { ChatProxy } from './proxy';

type Identity = { endpoint: string };
type HistoryState = { identity: Identity; cursor: number; questions: RecentChatMessage[]; pending?: Promise<RecentChatMessage[]> };

async function readPage(response: Response): Promise<Record<string, any>[]> {
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error('最近消息读取失败，请稍后重试。');
  }
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let text = '', bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 16 * 1024 * 1024) throw new Error('最近消息内容过大，请稍后重试。');
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.messages)) throw new Error('最近消息格式无效，请稍后重试。');
  return data.messages;
}

/** Scan all scenes once, then read only new records. Keep at most 100 questions. */
export class RecentChatHistory {
  private state?: HistoryState;
  constructor(private proxy: Pick<ChatProxy, 'handle'>, private currentIdentity: () => Identity | null | undefined) {}

  async read(endpoint: string): Promise<RecentChatMessage[]> {
    const identity = this.currentIdentity();
    if (typeof endpoint !== 'string' || !endpoint || !identity || identity.endpoint !== endpoint)
      throw new Error('Being 连接已切换，请重新读取动态。');
    if (this.state?.identity !== identity) this.state = { identity, cursor: 0, questions: [] };
    const state = this.state;
    if (state.pending) return state.pending;
    state.pending = this.sync(state).finally(() => { state.pending = undefined; });
    return state.pending;
  }

  private async sync(state: HistoryState): Promise<RecentChatMessage[]> {
    const signal = AbortSignal.timeout(60000);
    const check = () => {
      if (this.currentIdentity() !== state.identity) throw new Error('Being 连接已切换，请重新读取动态。');
      signal.throwIfAborted();
    };
    while (true) {
      check();
      // `after=0` starts at the beginning; omitting it only returns the latest raw
      // records, which may contain no human questions during autonomous activity.
      const response = await this.proxy.handle(new Request(`beings://chat/api/history?limit=500&after=${state.cursor}`, {
        headers: { 'X-Portal-Being-Endpoint': state.identity.endpoint },
        signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
      }));
      const page = await readPage(response);
      check();
      if (!page.length) return [...state.questions];
      const advanced = page.filter(row => row && Number.isSafeInteger(row.seq) && row.seq > state.cursor);
      if (!advanced.length) throw new Error('历史分页未前进，请稍后重试。');
      const questions: RecentChatMessage[] = advanced.filter(isHistoryQuestion).map(row => ({
        seq: row.seq, role: 'user', content: row.content.slice(0, 64000),
        at: typeof row.at === 'string' ? row.at : '',
        scene_id: typeof row.scene_id === 'string' ? row.scene_id : '',
        scene_label: typeof row.scene_label === 'string' ? row.scene_label : typeof row.scene_meta?.scene_label === 'string' ? row.scene_meta.scene_label : '',
      }));
      state.questions = [...new Map([...state.questions, ...questions].map(row => [row.seq, row])).values()]
        .sort((a, b) => b.seq - a.seq).slice(0, 100);
      // Advance across replies, tools and markers too; none consume a question slot.
      state.cursor = Math.max(...advanced.map(row => row.seq));
    }
  }
}
