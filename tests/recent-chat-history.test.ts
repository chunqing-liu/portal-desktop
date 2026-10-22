import { describe, expect, it, vi } from 'vitest';
import { RecentChatHistory } from '../desktop/main/chat/recent-history';
import { ChatProxy } from '../desktop/main/chat/proxy';
import { parseConnection } from '../desktop/main/chat/connection';
import { recentMessagePreview, recentQuestionGroups } from '../desktop/renderer/app/models/recent-history';
import { isHistoryQuestion } from '../desktop/shared/chat-history';

const endpoint = 'https://fixture.test/being';
const row = (seq: number) => ({ seq, role: 'user', content: `question ${seq}`, scene_id: seq % 2 ? 'remote' : 'local', scene_meta: { scene_label: '场景' } });
const fixture = (rows: any[], pageSize = 500) => {
  const identity = { endpoint };
  const handle = vi.fn(async (request: Request) => {
    const url = new URL(request.url);
    expect(url.pathname).toBe('/api/history');
    expect(url.searchParams.get('limit')).toBe('500');
    expect(request.headers.has('X-Portal-Scene-Id')).toBe(false);
    expect(request.headers.get('X-Portal-Being-Endpoint')).toBe(endpoint);
    return Response.json({ messages: rows.filter(row => row.seq > Number(url.searchParams.get('after'))).slice(0, pageSize) });
  });
  return { handle, reader: new RecentChatHistory({ handle }, () => identity) };
};

describe('recent scene questions', () => {
  it('finds the latest 100 questions even when the latest 500 records are autonomous replies', async () => {
    const rows = [...Array.from({ length: 120 }, (_, i) => row(i + 1)),
      ...Array.from({ length: 500 }, (_, i) => ({ ...row(i + 121), role: 'being' })),
      { ...row(621), content: '[breath yielded to human]', from: 'system', type: 'marker' }];
    const { reader, handle } = fixture(rows);
    const messages = await reader.read(endpoint);
    expect(messages).toHaveLength(100);
    expect(messages[0].seq).toBe(120);
    expect(messages.at(-1)?.seq).toBe(21);
    expect(messages.some(row => row.scene_id === 'remote')).toBe(true);
    expect(handle.mock.calls.map(([request]) => new URL(request.url).searchParams.get('after'))).toEqual(['0', '500', '621']);
    rows.push(row(622));
    const updated = await reader.read(endpoint);
    expect(updated).toHaveLength(100);
    expect(updated[0].seq).toBe(622);
    expect(handle.mock.calls.slice(3).map(([request]) => new URL(request.url).searchParams.get('after'))).toEqual(['621', '622']);
  });
  it('keeps remote and unbound questions through the real proxy regardless of current local scene', async () => {
    const connection = parseConnection(endpoint + '?token=fixture');
    const upstream = vi.fn(async (url: string | URL | Request) => {
      const request = new URL(String(url));
      expect(request.searchParams.has('scene_id')).toBe(false);
      return Response.json({ messages: request.searchParams.get('after') === '0' ? [row(1), { ...row(2), scene_id: undefined }] : [] });
    });
    const proxy = new ChatProxy(() => connection, upstream as typeof fetch, { scene_id: 'unrelated-local-scene', scene_meta: { client: 'fixture', scene_label: '本机场景' } });
    const messages = await new RecentChatHistory(proxy, () => connection).read(endpoint);
    expect(messages.map(message => message.scene_id)).toEqual(['', 'remote']);
  });
  it('continues through short pages and caps content sent through IPC', async () => {
    const { reader, handle } = fixture([{ ...row(1), content: 'x'.repeat(70000) }, row(2)], 1);
    const messages = await reader.read(endpoint);
    expect(messages.map(row => row.seq)).toEqual([2, 1]);
    expect(messages[1].content).toHaveLength(64000);
    expect(handle).toHaveBeenCalledTimes(3);
  });
  it('rejects stale identity before starting and after reading, including reconnection to the same endpoint', async () => {
    let identity = { endpoint: endpoint + '-other' };
    const handle = vi.fn(async (_request: Request) => { identity = { endpoint }; return Response.json({ messages: [row(1)] }); });
    const reader = new RecentChatHistory({ handle }, () => identity);
    await expect(reader.read(endpoint)).rejects.toThrow('连接已切换');
    expect(handle).not.toHaveBeenCalled();
    identity = { endpoint };
    await expect(reader.read(endpoint)).rejects.toThrow('连接已切换');
  });
  it('shares concurrent refreshes and retries from the last successful page after a failure', async () => {
    const identity = { endpoint };
    let fail = true;
    const handle = vi.fn(async (request: Request) => {
      const after = new URL(request.url).searchParams.get('after');
      if (after === '0') return Response.json({ messages: [row(1)] });
      if (fail) return new Response('failed', { status: 503 });
      return Response.json({ messages: [] });
    });
    const reader = new RecentChatHistory({ handle }, () => identity);
    const results = await Promise.allSettled([reader.read(endpoint), reader.read(endpoint)]);
    expect(results.every(result => result.status === 'rejected')).toBe(true);
    expect(handle).toHaveBeenCalledTimes(2);
    fail = false;
    expect((await reader.read(endpoint)).map(row => row.seq)).toEqual([1]);
    expect(new URL(handle.mock.calls[2][0].url).searchParams.get('after')).toBe('1');
  });
  it.each([new Response('error', { status: 503 }), Response.json({}), Response.json(null)])('rejects unavailable or invalid history', async response => {
    const identity = { endpoint };
    await expect(new RecentChatHistory({ handle: async () => response }, () => identity).read(endpoint)).rejects.toThrow();
  });
  it('rejects a non-advancing cursor instead of looping', async () => {
    const identity = { endpoint };
    await expect(new RecentChatHistory({ handle: async () => Response.json({ messages: [row(1)] }) }, () => identity).read(endpoint)).rejects.toThrow('分页未前进');
  });
  it('cancels oversized streams', async () => {
    const identity = { endpoint }, cancel = vi.fn();
    const response = new Response(new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(17 * 1024 * 1024)); }, cancel }));
    await expect(new RecentChatHistory({ handle: async () => response }, () => identity).read(endpoint)).rejects.toThrow('内容过大');
    expect(cancel).toHaveBeenCalled();
  });
});

it('excludes internal markers, system records and empty content, while retaining ordinary questions', () => {
  for (const content of ['[breath yielded to human]', '[breath interrupted]', '[breath superseded by newer work]', '  '])
    expect(isHistoryQuestion({ role: 'user', content })).toBe(false);
  expect(isHistoryQuestion({ role: 'user', content: 'internal', from: 'system' })).toBe(false);
  expect(isHistoryQuestion({ role: 'user', content: 'internal', type: 'marker' })).toBe(false);
  expect(isHistoryQuestion({ role: 'user', content: '解释 [breath yielded to human] 的含义' })).toBe(true);
});

it('shows a compact, plain preview without wire instructions or code payloads', () => {
  expect(recentMessagePreview('【新消息来自 scene「场景」】\n\n# **你好**\n[文档](https://example.test) ![猫](https://example.test/cat)\n\n[客户端本地文件预览]\nsecret\n[/客户端本地文件预览]')).toBe('你好 文档 [图片：猫]');
  expect(recentMessagePreview('结果\n```json\n{"payload":"large"}\n```')).toBe('结果 [代码或界面]');
  expect(recentMessagePreview('a'.repeat(1000))).toHaveLength(180);
  expect(recentMessagePreview('')).toBe('（无文字内容）');
});


it('groups only user questions by local calendar date, newest first', () => {
  const message = (seq: number, role: 'user' | 'being', at: string) => ({ seq, role, at, content: `question ${seq}`, scene_id: 'local', scene_label: '' });
  const today = new Date(2026, 9, 22, 9, 0).toISOString();
  const yesterday = new Date(2026, 9, 21, 16, 24).toISOString();
  const rows = [message(1, 'user', yesterday), message(4, 'being', today), message(3, 'user', today), message(2, 'user', yesterday), message(0, 'user', 'invalid')];
  const groups = recentQuestionGroups(rows);
  expect(groups.map(group => group.day)).toEqual(['2026-10-22', '2026-10-21', 'unknown']);
  expect(groups[0].questions.map(question => question.message.seq)).toEqual([3]);
  expect(groups[0].questions[0].time).toBe('09:00');
  expect(groups[1].questions.map(question => question.message.seq)).toEqual([2, 1]);
  expect(groups[2].questions[0].time).toBe('');
  expect(rows.map(row => row.seq)).toEqual([1, 4, 3, 2, 0]);
});

it('unions cache-only, remote-only and overlapping questions while preserving local scene navigation metadata', async () => {
  const { mergeRecentQuestions } = await import('../desktop/renderer/app/models/recent-history');
  const make = (seq: number, extra = {}) => ({ seq, role: 'user' as const, content: '相同提问', at: '2026-10-22T01:00:00Z', scene_id: 'local', scene_label: '本地场景', ...extra });
  const merged = mergeRecentQuestions([make(1), make(3), make(2)], [make(3, { scene_id: '', scene_label: '', at: '', content: '接口摘要' }), make(4, { scene_id: 'remote' })]);
  expect(merged.map(row => row.seq)).toEqual([4, 3, 2, 1]);
  expect(merged[1]).toMatchObject({ scene_id: 'local', scene_label: '本地场景', at: '2026-10-22T01:00:00Z', content: '接口摘要' });
  expect(mergeRecentQuestions([make(1)], [])).toEqual([make(1)]);
  expect(mergeRecentQuestions([], [make(4, { scene_id: 'remote' })])[0].scene_id).toBe('remote');
  expect(mergeRecentQuestions(Array.from({length:100},(_,i)=>make(i+1)), Array.from({length:100},(_,i)=>make(i+51))).map(row=>row.seq))
    .toEqual(Array.from({length:100},(_,i)=>150-i));
});
