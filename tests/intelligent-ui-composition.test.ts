import { expect, it } from 'vitest';
import { compileUI, applyUIChanges, evaluate } from '../desktop/renderer/shared/intelligent-ui/runtime';
import { UIStream } from '../desktop/renderer/shared/intelligent-ui/stream';
import { intelligentUIContext } from '../desktop/renderer/shared/intelligent-ui/context';
const compile = (body: unknown[], state = { count: 3, other: 8, selected: 'a', details: false }) => compileUI(JSON.stringify({ version: 1, title: '组合', state, body }));
it('streams nested split and box with design tokens and conditional content', () => {
  const records = [{op:'begin',version:2,title:'组合'}, {op:'state',key:'show',initial:true},
    {op:'node',node:{id:'split',type:'split',appearance:{ratio:'wide-left'}}},
    {op:'node',parent:'split',node:{id:'left',type:'box'}},
    {op:'node',parent:'left',node:{id:'body',type:'text',value:'正文',when:{state:'show'}}},
    {op:'node',parent:'split',node:{id:'aside',type:'badge',value:'状态'}},{op:'commit'}];
  const stream = new UIStream();
  for (let i=1;i<=records.length;i++) expect(stream.update(records.slice(0,i).map(record => JSON.stringify(record)).join('\n'),i<records.length).error).toBe('');
});
it('applies multi-state changes atomically from the old snapshot and clamps controls', () => {
  const doc = compile([{id:'count',type:'slider',bind:'count',min:0,max:10}]);
  expect(applyUIChanges(doc,doc.state,{count:{state:'other'},other:{state:'count'}})).toMatchObject({count:8,other:3});
  expect(applyUIChanges(doc,doc.state,{count:100}).count).toBe(10);
  expect(()=>applyUIChanges(doc,doc.state,{count:4,other:{op:'div',args:[1,0]}})).toThrow();
  expect(doc.state.count).toBe(3);
  expect(()=>applyUIChanges(doc,doc.state,{unknown:1})).toThrow();
});
it('validates choice, progress, conditions and bounded style properties', () => {
  const choice = {id:'choose',type:'choice',bind:'selected',items:[{id:'a',label:'A'},{id:'b',label:'B',description:'说明'}]};
  const doc = compile([choice,{id:'p',type:'progress',min:0,max:10,value:{state:'count'}}]);
  expect(applyUIChanges(doc,doc.state,{selected:'missing'}).selected).toBe('a');
  for (const node of [
    {...choice,items:[{id:'a',label:'A'},{id:'a',label:'重复'}]},
    {id:'p',type:'progress',min:0,max:10,value:'not a number'},
    {id:'t',type:'text',when:1},
    {id:'t',type:'box',appearance:{position:'fixed'}},
    {id:'t',type:'box',appearance:{surface:'rainbow'}},
    {id:'b',type:'button',action:'set',changes:{count:'wrong type'}},
    {id:'b',type:'button',action:'set'},
  ]) expect(()=>compile([node])).toThrow();
});
it('exposes composition and boolean operations without fixed task recipes', () => {
  expect(evaluate({op:'and',args:[true,{op:'not',args:[false]}]},{})).toBe(true);
  expect(evaluate({op:'or',args:[false,false]},{})).toBe(false);
  expect(intelligentUIContext).toContain('appearance.ratio');
  expect(intelligentUIContext).not.toContain('聚餐/露营/活动准备=');
});
