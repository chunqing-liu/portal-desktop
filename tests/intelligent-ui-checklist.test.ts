import { expect, it } from 'vitest';
import { compileUI, reconcileState, type UIDocument } from '../desktop/renderer/shared/intelligent-ui/runtime';
import { UIStream } from '../desktop/renderer/shared/intelligent-ui/stream';
const doc: UIDocument = {version:1,title:'周末聚餐计划',state:{count:6},body:[{id:'plan',type:'timeline',label:'当天流程（可勾选核对）',items:[{id:'t1',label:'09:00 定菜单 · 发邀请',description:'确认人数和忌口'},{id:'t2',label:'10:30 集中采购'}]}]};
it('adds default checkbox state and preserves checks through reordering and repeated compilation',()=>{
 const first=compileUI(JSON.stringify(doc));
 const bind=first.body[0].items![0].bind!;
 expect(first.state[bind]).toBe(false);
 expect(compileUI(JSON.stringify(first))).toEqual(first);
 const updated=structuredClone(doc);updated.body[0].items!.reverse();
 const next=compileUI(JSON.stringify(updated));
 expect(next.body[0].items![1].bind).toBe(bind);
 expect(reconcileState(next,{...first.state,[bind]:true})[bind]).toBe(true);
});
it('supports read-only timelines and explicit boolean bindings',()=>{
 const raw=structuredClone(doc);raw.body[0].checkable=false;
 expect(compileUI(JSON.stringify(raw)).state).toEqual({count:6});
 raw.body[0].checkable=true;raw.state.done=true;raw.body[0].items![0].bind='done';
 expect(compileUI(JSON.stringify(raw)).state.done).toBe(true);
});
it('renders a streamed checklist without model-generated state declarations',()=>{
 const stream=new UIStream();
 const lines=[{op:'begin',version:2,title:doc.title},{op:'node',node:doc.body[0]},{op:'commit'}].map(v=>JSON.stringify(v)).join('\n');
 const result=stream.update(lines,false);
 expect(result.error).toBe('');
 expect(Object.keys(result.doc!.state)).toHaveLength(2);
});
