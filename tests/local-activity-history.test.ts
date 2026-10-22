import { afterEach, expect, it, vi } from 'vitest';
import { ChatState, type Message } from '../desktop/renderer/chat/models/chat';
import { localActivityHistory } from '../desktop/renderer/chat/services/activity-history';
import { HistoryCache } from '../desktop/renderer/chat/services/history-cache';
import { LocalHistoryReader } from '../desktop/renderer/app/models/local-history';

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it('reads recent questions across cached scenes and joins confirmed live rows without using the current scene filter', async () => {
  vi.stubGlobal('location', new URL('https://fixture.test/'));
  const cache = new HistoryCache('https://fixture.test');
  const read = vi.spyOn(cache, 'readBefore').mockResolvedValue([
    { seq: 1, role: 'user', content: '只在缓存', scene_id: 'old' },
    { seq: 2, role: 'user', content: '与内存重叠', scene_id: 'other' },
  ]);
  const state = new ChatState(); state.currentScene = { sceneId: 'current', strict: true };
  state.items = [
    { kind: 'message', role: 'user', historySeq: 2, text: '与内存重叠', sceneId: 'other' },
    { kind: 'message', role: 'user', historySeq: 3, text: '刚确认落库', sceneId: 'current' },
    { kind: 'message', role: 'being', historySeq: 4, text: '回复' },
  ] as Message[];
  const rows = await localActivityHistory(cache, state);
  expect(rows.map(row => [row.seq, row.scene_id])).toEqual([[3, 'current'], [2, 'other'], [1, 'old']]);
  const include = read.mock.calls[0][2]!;
  expect(include({ seq: 10, role: 'being', content: '回复' })).toBe(false);
  expect(include({ seq: 11, role: 'user', content: '[breath yielded to human]' })).toBe(false);
  expect(include({ seq: 12, role: 'user', content: '其他场景', scene_id: 'not-selected' })).toBe(true);
});

it('correlates local results with request, endpoint and frame revision, and rejects cancelled/stale reads', async () => {
  vi.useFakeTimers();
  let source = 'beings://chat/?history_scope=https%3A%2F%2Ffixture.test&revision=one';
  const post = vi.fn(), reader = new LocalHistoryReader(() => source, post);
  const waiting = reader.read('https://fixture.test');
  const request = post.mock.calls[0][0];
  reader.receive({ ...request, type: 'beings:local-history-result', revision: 'wrong', rows: [], ok: true });
  reader.receive({ ...request, type: 'beings:local-history-result', endpoint: 'https://other.test', rows: [], ok: true });
  reader.receive({ ...request, type: 'beings:local-history-result', rows: [], ok: true });
  await expect(waiting).resolves.toEqual([]);
  const stale = reader.read('https://fixture.test');
  const rejected = expect(stale).rejects.toThrow('本地对话读取失败');
  source += '-new'; reader.clear(); await rejected;
  const abort = new AbortController();
  const cancelled = reader.read('https://fixture.test', abort.signal);
  const cancelledResult = expect(cancelled).rejects.toThrow();
  abort.abort(); await cancelledResult;
  const timedOut = reader.read('https://fixture.test');
  const timeoutResult = expect(timedOut).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(5000); await timeoutResult;
});
