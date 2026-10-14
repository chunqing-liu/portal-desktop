import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { intelligentUIContext } from '../desktop/renderer/shared/intelligent-ui/context';
import { UIStream } from '../desktop/renderer/shared/intelligent-ui/stream';
import { compileUI, evaluate } from '../desktop/renderer/shared/intelligent-ui/runtime';

describe('model-facing protocol and wardrobe regressions', () => {
  it.each([1, 2])('pinpoints misplaced parent and accepts the corrected original output %s', attempt => {
    const source = readFileSync(new URL(`./fixtures/intelligent-ui-wardrobe-invalid-${attempt}.jsonl`, import.meta.url), 'utf8');
    const failed = new UIStream().update(source, false);
    expect(failed.error).toContain('c1');
    expect(failed.error).toContain('"parent"');
    expect(failed.error).toContain('与 op、node 同级');
    const records = source.trim().split('\n').map(line => JSON.parse(line));
    for (const record of records) {
      if (record.node?.parent) {
        record.parent = record.node.parent;
        delete record.node.parent;
      }
    }
    const corrected = records.map(record => JSON.stringify(record)).join('\n');
    const result = new UIStream().update(corrected, false);
    expect(result.error).toBe('');
    expect(result.doc?.body.map(node => node.id)).toEqual(['ov', 'week', 'prep']);
    expect(result.doc?.body[1].children).toHaveLength(7);
    expect(result.doc?.body[2].children?.[0].items).toHaveLength(5);
    if (attempt === 1) {
      expect(result.doc?.body[1].children?.[0].value).toBe('开局 · 会议日');
      expect(evaluate(result.doc?.body[0].children?.[0].value, { temp: 26 })).toBe('26°C');
    }
    // Streaming and complete-file validation must agree.
    const stream = new UIStream();
    for (let end = 37; end < corrected.length; end += 37) stream.update(corrected.slice(0, end), true);
    expect(stream.update(corrected, false)).toEqual(result);
  });

  it('validates the exact nested example supplied in the prompt and its live result', () => {
    const example = intelligentUIContext.split('\n').filter(line => line.startsWith('{"op":')).join('\n');
    const result = new UIStream().update(example, false);
    expect(result.error).toBe('');
    const children = result.doc!.body[0].children!;
    expect(children.map(node => node.id)).toEqual(['count', 'total']);
    expect(evaluate(children[1].value, { count: 8 })).toBe(232);
    expect(evaluate(children[1].value, { count: 10 })).toBe(290);
    const expression = JSON.parse(intelligentUIContext.match(/text\.value可用 (\{[^\n]+?\})。/)![1]);
    expect(evaluate(expression, { temp: 20 })).toBe('加一件薄外搭');
    expect(evaluate(expression, { temp: 26 })).toBe('单穿轻装');
  });

  it('identifies other unknown fields without weakening validation', () => {
    expect(() => compileUI(JSON.stringify({ version: 1, title: 'Bad field', state: {},
      body: [{ id: 'intro', type: 'text', value: 'hello', onclick: 'bad' }],
    }))).toThrow('组件「intro」（text）包含未知属性："onclick"');
  });
});
