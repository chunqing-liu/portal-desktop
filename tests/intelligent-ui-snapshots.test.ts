import { expect, it } from 'vitest';
import { UISnapshotStore } from '../desktop/renderer/shared/intelligent-ui/snapshots';
import { withIntelligentUIContext } from '../desktop/renderer/shared/intelligent-ui/context';
const snapshot = (surfaceId: string, n = 1) => JSON.stringify({surfaceId,revision:1,values:{n}});
it('background updates cannot replace an explicitly selected artifact', () => {
  const store = new UISnapshotStore();
  store.record('scene',snapshot('A'));store.record('scene',snapshot('B'));
  store.record('scene',snapshot('A',7),true);
  expect(store.record('scene',snapshot('B',2))).toBe(snapshot('A',7));
  expect(store.record('scene',snapshot('C'))).toBe(snapshot('A',7));
  expect(store.record('scene',snapshot('A',8))).toBe(snapshot('A',8));
  expect(store.record('scene',snapshot('B',3),true)).toBe(snapshot('B',3));
  store.record('other',snapshot('A',99),true);
  expect(store.current('scene')).toBe(snapshot('B',3));
  expect(store.record('scene','unfinished')).toBe(snapshot('B',3));
});
it('retains complete long JSON including later fields, and rejects oversized context', () => {
  const value = {surfaceId:'A',revision:3,values:{notes:'中'.repeat(5000),guests:8},apps:{simulation:{title:'示例',values:{choice:4}}}};
  const sent = withIntelligentUIContext('修改',true,JSON.stringify(value));
  const json = sent.split('[客户端当前界面选择]\n')[1].split('\n[/客户端当前界面选择]')[0];
  expect(JSON.parse(json)).toEqual(value);
  const large = JSON.stringify({...value,values:{notes:'x'.repeat(100001)}});
  expect(()=>withIntelligentUIContext('修改',true,large)).toThrow('内容过长，未发送');
  expect(withIntelligentUIContext('普通对话',false,large)).toBe('普通对话');
});
