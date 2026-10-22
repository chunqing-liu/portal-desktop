export const DEFAULT_CHAT_HISTORY_LIMIT = 100;
export const MAX_CHAT_HISTORY_LIMIT = 1000;
export const CHAT_HISTORY_LIMIT_KEY = 'beings:chat-history-limit';

/** History may label internal breath markers as user messages. */
export function isHistoryQuestion(row: { role?: unknown; content?: unknown; from?: unknown; type?: unknown }): boolean {
  return row.role === 'user' && row.from !== 'system' && row.type !== 'marker' &&
    typeof row.content === 'string' && !!row.content.trim() &&
    !/^\[breath (?:yielded|interrupted|superseded)\b[^\]\r\n]*\]$/i.test(row.content.trim());
}

export function validChatHistoryLimit(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_CHAT_HISTORY_LIMIT;
}

export function chatHistoryLimit(value: unknown): number {
  return validChatHistoryLimit(value) ? value : DEFAULT_CHAT_HISTORY_LIMIT;
}
