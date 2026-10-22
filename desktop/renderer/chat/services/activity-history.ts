import { isHistoryQuestion } from '../../../shared/chat-history';
import type { RecentChatMessage } from '../../../shared/types';
import type { ChatState } from '../models/chat';
import { HistoryCache, normalizeHistoryRows } from './history-cache';

/** Read all cached scenes, independently of the selected scene/visible window. */
export async function localActivityHistory(cache: HistoryCache, state: ChatState): Promise<RecentChatMessage[]> {
  const cached = await cache.readBefore(Infinity, 100, isHistoryQuestion);
  const loaded = state.items.flatMap(item => item.kind === 'message' && item.historySeq && item.role === 'user' ? [{
    seq: item.historySeq, role: item.role, content: item.text,
    scene_id: item.sceneId, scene_label: item.sceneLabel,
    at: Number.isFinite(item.createdAt) ? new Date(item.createdAt!).toISOString() : undefined,
  }] : []);
  return normalizeHistoryRows([...cached, ...loaded]).filter(isHistoryQuestion).slice(-100).reverse().map(row => ({
    seq: row.seq, role: 'user', content: row.content.slice(0, 64000), at: row.at || '',
    scene_id: row.scene_id || '', scene_label: row.scene_label || '',
  }));
}
