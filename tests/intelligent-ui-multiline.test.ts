import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { UIStream } from '../desktop/renderer/shared/intelligent-ui/stream';
import { compileUI } from '../desktop/renderer/shared/intelligent-ui/runtime';
const source = readFileSync(new URL('./fixtures/intelligent-ui-motorcycle.jsonl', import.meta.url), 'utf8');
describe('generated multiline UI events', () => {
  it('renders the exact supplied motorcycle response, including rectangle shorthand', () => {
    const result = new UIStream().update(source, false);
    expect(result.error).toBe('');
    expect(result.doc?.title).toBe('摩托车结构原理');
    expect(result.doc?.body[0].parts).toHaveLength(14);
    expect(result.doc?.body[0].shapes?.find(s => s.type === 'rect')).toMatchObject({width:65,height:36});
  });
  it('accepts every character boundary without treating incomplete records as errors', () => {
    const stream = new UIStream();
    for (let i = 1; i <= source.length; i++) {
      const result = stream.update(source.slice(0, i), true);
      if (i >= source.indexOf('\n')) expect(result.error).toBe('');
    }
    expect(stream.update(source,false)).toEqual(new UIStream().update(source,false));
  });
  it('ignores braces and escaped quotes inside strings, and accepts adjacent events', () => {
    const records = [{op:'begin',version:2,title:'Escapes'}, {op:'node',node:{id:'text',type:'text',value:'引号 " 与括号 ]}} 以及换行\n和反斜杠 \\'}}, {op:'commit'}];
    const text = records.map(r=>JSON.stringify(r,null,2)).join('');
    const stream = new UIStream();
    for(let i=1;i<=text.length;i++) stream.update(text.slice(0,i),true);
    const result=stream.update(text,false);
    expect(result.error).toBe('');
    expect(result.doc?.body[0].value).toBe(records[1].node!.value);
  });
  it('retains completed nodes on truncation without inventing a partial diagram', () => {
    const result = new UIStream().update(source.slice(0, source.indexOf('],"shapes"') + 3), false);
    expect(result.error).toContain('未完成');
    expect(result.doc?.body).toEqual([]);
  });
  it('rejects conflicting or invalid rectangle shorthand', () => {
    const good = new UIStream().update(source,false).doc!;
    const rect = good.body[0].shapes!.find(s=>s.type==='rect')!;
    Object.assign(rect,{w:66});
    expect(()=>compileUI(JSON.stringify(good))).toThrow('冲突');
    Object.assign(rect,{w:'65',width:'65'});
    expect(()=>compileUI(JSON.stringify(good))).toThrow('坐标');
  });
});

it('isolates malformed generated retirement records without inventing financial results', () => {
  const text = readFileSync(new URL('./fixtures/intelligent-ui-retirement-invalid.jsonl', import.meta.url),'utf8');
  const stream = new UIStream();
  for(let i=1;i<=text.length;i++) stream.update(text.slice(0,i),true);
  const result = stream.update(text,false);
  expect(result.error).not.toBe('');
  expect(result.doc?.body.map(n=>n.id)).toEqual(['savings']);
  expect(result.doc?.body.some(n=>n.type==='metric')).toBe(false);
});
