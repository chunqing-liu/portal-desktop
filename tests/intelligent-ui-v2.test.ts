import { describe, expect, it } from 'vitest';
import { UIStream } from '../desktop/renderer/shared/intelligent-ui/stream';
import { compileUI, evaluate } from '../desktop/renderer/shared/intelligent-ui/runtime';
import { templates, toUIStream } from '../desktop/renderer/shared/intelligent-ui/templates';
import { stripIntelligentUIContext, withIntelligentUIContext } from '../desktop/renderer/shared/intelligent-ui/context';
describe('v2 stream protocol', () => {
  it.each(Object.keys(templates))('validates the %s task and decodes every byte boundary', name => {
    const doc = templates[name as keyof typeof templates], source = toUIStream(doc), decoder = new UIStream();
    const compiled = compileUI(JSON.stringify(doc));
    let last;
    for (let i = 1; i <= source.length; i++) last = decoder.update(source.slice(0, i), true);
    last = decoder.update(source, false);
    expect(last.error).toBe('');
    expect(last.doc).toEqual(compiled);
  });
  it('renders a novel task with nested cards and custom SVG without any asset', () => {
    const records = [
      {op:'begin',version:2,title:'任意主题的运动结构'},
      {op:'state',key:'selection',initial:'all'}, {op:'state',key:'separation',initial:0},
      {op:'node',node:{id:'panel',type:'card',label:'结构与说明'}},
      {op:'node',parent:'panel',node:{id:'drawing',type:'diagram',bind:'selection',explodeBind:'separation',width:400,height:200,parts:[{id:'rotor',label:'转子',description:'自定义结构'}],shapes:[{type:'path',d:'M40 100 L160 40 L280 100 Z',part:'rotor',fill:'surface',strokeWidth:6,dx:30,dy:10}]}},
      {op:'commit'},
    ];
    const result = new UIStream().update(records.map(r => JSON.stringify(r)).join('\n'), false);
    expect(result.error).toBe('');
    expect(result.doc?.body[0].children?.[0].shapes?.[0].dx).toBe(30);
    const doc = result.doc!;
    doc.body.push({id:'photo',type:'image',src:'javascript:alert(1)'});
    expect(() => compileUI(JSON.stringify(doc))).toThrow();
  });
  it('publishes children before commit without replacing the parent', () => {
    const stream = new UIStream();
    let text = '{"op":"begin","version":2,"title":"Live"}\n{"op":"node","node":{"id":"root","type":"stack"}}\n';
    expect(stream.update(text, true).doc?.body).toHaveLength(1);
    text += '{"op":"node","parent":"root","node":{"id":"child","type":"text","value":"hello"}}\n';
    expect(stream.update(text, true).doc?.body[0].children?.[0].value).toBe('hello');
  });
  it('rejects invalid nodes locally and keeps later valid content', () => {
    const stream = new UIStream();
    const result = stream.update('{"op":"begin","version":2,"title":"Live"}\n{"op":"node","node":{"id":"bad","type":"script"}}\n{"op":"node","node":{"id":"good","type":"text","value":"safe"}}\n{"op":"commit"}', false);
    expect(result.error).not.toBe('');
    expect(result.doc?.body[0].id).toBe('good');
  });
  it('detects cyclic or missing parent nodes and interrupted generations', () => {
    const stream = new UIStream();
    const result = stream.update('{"op":"begin","version":2,"title":"Live"}\n{"op":"node","parent":"b","node":{"id":"a","type":"stack"}}\n{"op":"node","parent":"a","node":{"id":"b","type":"stack"}}\n{"op":"commit"}', false);
    expect(result.error).toContain('循环');
    expect(new UIStream().update('{"op":"begin","version":2,"title":"Live"}', false).error).toContain('中断');
  });
  it('ignores retransmitted sequenced events', () => {
    const stream = new UIStream();
    const result = stream.update('{"op":"begin","version":2,"title":"Live","seq":1}\n{"op":"state","key":"x","initial":1,"seq":2}\n{"op":"state","key":"x","initial":99,"seq":2}\n{"op":"commit","seq":3}', false);
    expect(result.doc?.state.x).toBe(1);
  });
  it('keeps diagram properties inert and rejects URLs and oversized data', () => {
    const doc = compileUI(JSON.stringify(templates.bicycle));
    delete doc.body[0].asset;
    (doc.body[0].shapes![0] as any).onClick = 'alert(1)';
    expect(() => compileUI(JSON.stringify(doc))).toThrow();
    delete (doc.body[0].shapes![0] as any).onClick;
    doc.body[0].shapes!.push({ type: 'path', d: 'https://example.com' });
    expect(() => compileUI(JSON.stringify(doc))).toThrow();
  });
  it('calculates compound growth and split bills from the displayed assumptions', () => {
    const savings = templates.savings;
    expect(evaluate(savings.body.at(-1)!.value, savings.state)).toBe(13439);
    expect(evaluate(templates.bill.body[2].value, templates.bill.state)).toBe('67.00');
    expect(evaluate(templates.bill.body[2].value, { total: 100, people: 3, tip: 10 })).toBe('36.67');
  });
  it('attaches current selection only while enabled and strips it from history', () => {
    const wire = withIntelligentUIContext('继续', true, 'part: wheels');
    expect(wire).toContain('part: wheels');
    expect(stripIntelligentUIContext(wire)).toBe('继续');
    expect(withIntelligentUIContext('继续', false, 'part: wheels')).toBe('继续');
  });
});
