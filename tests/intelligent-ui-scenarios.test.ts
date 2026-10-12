import vm from 'node:vm';
import { expect, it } from 'vitest';
import { templates } from '../desktop/renderer/shared/intelligent-ui/templates';
import { compileUI, type UIDocument, type UINode } from '../desktop/renderer/shared/intelligent-ui/runtime';

function run(name: keyof typeof templates) {
  let doc: UIDocument;
  const context = vm.createContext({ ui: { state: {}, render: (next: unknown) => { doc = compileUI(JSON.stringify(next)); }, save: () => {}, onEvent: (fn: unknown) => { context.event = fn; }, onTick: (fn: unknown) => { context.tick = fn; } } });
  vm.runInContext(templates[name].body[0].code!, context, { timeout: 1000 });
  return { doc: () => doc, event(key: string, value?: unknown) { context.input = { key, value }; vm.runInContext('event(input)', context, { timeout: 1000 }); }, tick() { vm.runInContext('tick(1);tick(1.1)', context, { timeout: 1000 }); } };
}

it('every new local algorithm emits a valid initial document and handles its primary action', () => {
  for (const [name, action] of [['retirement', 'years'], ['clt', 'sample'], ['monty', 'simulate'], ['photography', 'fov'], ['itemizedBill', 'add'], ['arcade', 'left']] as const) {
    const app = run(name);
    expect(app.doc().body.length).toBeGreaterThan(0);
    app.event(action, name === 'retirement' ? 30 : 60);
    expect(app.doc().body.length).toBeGreaterThan(0);
    if (name === 'arcade') app.tick();
  }
});

it('retirement handles zero rate and zero contributions without invalid values', () => {
  const app = run('retirement');
  app.event('rate', 0);
  expect(app.doc().body[0].value).toBe(500 * 25 * 12);
  app.event('monthly', 0);
  expect(app.doc().body[0].value).toBe(0);
});

it('probability experiments preserve totals and reset samples when sample size changes', () => {
  const app = run('clt'); app.event('sample');
  expect(app.doc().body.find(n => n.id === 'count')!.value).toBe(100);
  expect(app.doc().body.find(n => n.id === 'distribution')!.rows!.reduce((sum, row) => sum + Number(row[1]), 0)).toBe(100);
  app.event('n', 10);
  expect(app.doc().body.find(n => n.id === 'count')!.value).toBe(0);
  const game = run('monty'); game.event('simulate');
  const rows = game.doc().body.find(n => n.id === 'stats')!.rows!;
  expect(Number(rows[1][1]) + Number(rows[2][1])).toBe(1000);
});

it('itemized bills conserve cents, expose unassigned amounts and bound dynamic forms', () => {
  const app = run('itemizedBill');
  app.event('cost0', .01); app.event('cost1', 0); app.event('tax', .02);
  const rows = app.doc().body.find(n => n.id === 'results')!.rows!;
  const total = rows.reduce((sum, row) => sum + Math.round(Number(String(row[1]).slice(2)) * 100), 0);
  expect(total).toBe(3);
  for (let i = 0; i < 10; i++) app.event('add');
  expect(app.doc().body.filter(n => n.type === 'card')).toHaveLength(8);
  expect(Object.keys(app.doc().state).length).toBeLessThanOrEqual(50);
  for (let i = 0; i < 3; i++) app.event(`who0-${i}`, false);
  expect(app.doc().body.some(n => n.id === 'warning')).toBe(true);
});

it('rejects map components and validates tab selection', () => {
  const compile = (node: UINode, state: Record<string, string>) => compileUI(JSON.stringify({ version: 1, title: 'test', state, body: [node] }));
  expect(() => compile({ id: 'route', type: 'route' } as unknown as UINode, { selected: 'a' })).toThrow();
  expect(() => compile({ id: 'tabs', type: 'tabs', bind: 'selected', children: [{ id: 'a', type: 'section', label: 'A' }] }, { selected: 'missing' })).toThrow();
});
