import { stripClientMessageContext } from '../../chat/services/local-file-context';
import { stripSceneTransition } from '../../chat/models/scenes';
import { isHistoryQuestion } from '../../../shared/chat-history';
import type { RecentChatMessage } from '../../../shared/types';

/** Union sources by durable identity; missing remote metadata cannot hide a local scene. */
export function mergeRecentQuestions(local: RecentChatMessage[], remote: RecentChatMessage[]): RecentChatMessage[] {
  const rows = new Map<number, RecentChatMessage>();
  for (const row of [...local, ...remote]) {
    if (!Number.isSafeInteger(row.seq) || row.seq <= 0 || !isHistoryQuestion(row)) continue;
    const previous = rows.get(row.seq);
    rows.set(row.seq, { ...row, scene_id: row.scene_id || previous?.scene_id || '',
      scene_label: row.scene_label || previous?.scene_label || '', at: row.at || previous?.at || '' });
  }
  return [...rows.values()].sort((a, b) => b.seq - a.seq).slice(0, 100);
}

export function recentQuestionGroups(rows: RecentChatMessage[]) {
  const groups = new Map<string, { day: string; label: string; questions: { message: RecentChatMessage; preview: string; time: string }[] }>();
  for (const message of [...rows].filter(isHistoryQuestion).sort((a, b) => b.seq - a.seq)) {
    const date = message.at && Number.isFinite(Date.parse(message.at)) ? new Date(message.at) : undefined;
    const day = date ? `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}` : 'unknown';
    let group = groups.get(day);
    if (!group) {
      group = { day, label: date ? date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }) : '时间未知', questions: [] };
      groups.set(day, group);
    }
    group.questions.push({ message, preview: recentMessagePreview(message.content), time: date ? date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }) : '' });
  }
  return [...groups.values()];
}

export function recentMessagePreview(content: string): string {
  const text = stripSceneTransition(stripClientMessageContext(content))
    .replace(/```[^\n]*\n[\s\S]*?(?:```|$)/g, ' [代码或界面] ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, ' [图片：$1] ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/(?:^|\n)\s{0,3}[#>]+\s*/g, ' ')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ').trim();
  return text.length > 180 ? text.slice(0, 179) + '…' : text || '（无文字内容）';
}
