import { describe, expect, it } from 'vitest';
import { normalizeHistoryRows } from '../desktop/renderer/chat/services/history-cache';

describe('durable history rows', () => {
  it('orders by seq, preserves distinct equal text, and merges duplicate metadata', () => {
    expect(normalizeHistoryRows([
      { seq: 3, role: 'being', content: 'same' },
      { seq: 1, role: 'user', content: 'question', scene_id: 'room', scene_meta: { scene_label: 'Room' } },
      { seq: 2, role: 'being', content: 'same' },
      { seq: 1, role: 'user', content: 'question' },
    ])).toEqual([
      { seq: 1, role: 'user', content: 'question', scene_id: 'room', scene_label: 'Room' },
      { seq: 2, role: 'being', content: 'same' },
      { seq: 3, role: 'being', content: 'same' },
    ]);
  });
  it('accepts role-less protocol markers but rejects malformed rows before computing a cursor', () => {
    expect(normalizeHistoryRows([
      null, { seq: 9999, role: 'user' }, { seq: -1, role: 'being', content: 'invalid' },
      { seq: 5000, content: 'missing role' },
      { seq: 2, from: 'system', type: 'marker', content: '[breath yielded]' },
    ])).toEqual([{ seq: 2, role: 'system', from: 'system', type: 'marker', content: '[breath yielded]' }]);
  });
});
