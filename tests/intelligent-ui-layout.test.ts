import { expect, it } from 'vitest';
import { compileUI, evaluate, reconcileState } from '../desktop/renderer/shared/intelligent-ui/runtime';
import { UIStream } from '../desktop/renderer/shared/intelligent-ui/stream';
import { templates } from '../desktop/renderer/shared/intelligent-ui/templates';

const compile = (body: unknown[], state = {}) => compileUI(JSON.stringify({ version: 1, title: '露营准备', state, body }));

it('composes an unseen task with streamed sections, grids and linked quantities', () => {
  const events = [
    { op: 'begin', version: 2, title: '露营准备' },
    { op: 'state', key: 'people', initial: 3 },
    { op: 'node', node: { id: 'gear', type: 'section', label: '装备' } },
    { op: 'node', parent: 'gear', node: { id: 'grid', type: 'grid', variant: 'two' } },
    { op: 'node', parent: 'grid', node: { id: 'tent', type: 'media', label: '帐篷', value: '按人数搭配' } },
    { op: 'node', node: { id: 'people', type: 'stepper', label: '人数', bind: 'people', min: 1, max: 10 } },
    { op: 'node', node: { id: 'water', type: 'facts', rows: [['饮用水', { op: 'mul', args: [{ state: 'people' }, 2] }]] } },
    { op: 'node', node: { id: 'tasks', type: 'checklist', items: [{ id: 'pack', time: '出发前', label: '清点装备' }] } },
    { op: 'commit' },
  ];
  const stream = new UIStream();
  let source = '';
  for (const event of events) {
    source += JSON.stringify(event) + '\n';
    expect(stream.update(source, event.op !== 'commit').error).toBe('');
  }
  const doc = stream.update(source, false).doc!;
  expect(doc.body[0].children![0].children![0].label).toBe('帐篷');
  expect(evaluate(doc.body[2].rows![0][1], { people: 5 })).toBe(10);
  expect(reconcileState(doc, { people: 100 }).people).toBe(10);
  expect(doc.body[3].items![0].bind).toMatch(/^check-/);
});

it('bounds new component inputs without weakening existing validation', () => {
  expect(() => compile([{ id: 'g', type: 'gallery', children: [{ id: 't', type: 'text', value: 'x' }] }])).toThrow();
  expect(() => compile([{ id: 'g', type: 'grid', variant: 'collage' }])).toThrow();
  expect(() => compile([{ id: 'm', type: 'media', src: 'javascript:alert(1)' }])).toThrow();
  expect(() => compile([{ id: 'f', type: 'facts', rows: [['x']] }])).toThrow();
  expect(() => compile([{ id: 'h', type: 'heading', label: 'x', level: 9 }])).toThrow();
  expect(() => compile([{ id: 'c', type: 'checklist', items: [{ id: 'x', label: 'x', time: {} }] }])).toThrow();
  const list = compile([{ id: 'l', type: 'list', items: [{ id: 'a', label: '要点' }] }]);
  expect(list.state).toEqual({});
});

it('keeps all local examples valid and canonical', () => {
  for (const template of Object.values(templates)) {
    const doc = compileUI(JSON.stringify(template));
    expect(compileUI(JSON.stringify(doc))).toEqual(doc);
  }
});
