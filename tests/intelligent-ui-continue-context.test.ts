import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { UIActions } from '../desktop/renderer/shared/intelligent-ui/view';
import { SurfaceArtifact, SurfaceContext } from '../desktop/renderer/shared/intelligent-ui/surface-view';
import { blockKey, type SurfaceBlock } from '../desktop/renderer/shared/intelligent-ui/surfaces';
import { UISnapshotStore } from '../desktop/renderer/shared/intelligent-ui/snapshots';
import { withIntelligentUIContext } from '../desktop/renderer/shared/intelligent-ui/context';

const captured = vi.hoisted(() => ({ actions: null as UIActions | null }));
vi.mock('../desktop/renderer/shared/intelligent-ui/view', () => ({
  IntelligentUI: (props: UIActions) => { captured.actions = props; return null; },
}));

describe('generated UI continuation context', () => {
  const doc = { version: 1 as const, title: '食谱', state: { people: 2 }, body: [
    { id: 'people', type: 'stepper' as const, label: '人数', bind: 'people', min: 1, max: 8 },
    { id: 'next', type: 'button' as const, label: '细化食谱', action: 'continue' as const, value: '细化食谱' },
  ] };
  function render(actions: UIActions, saved = true) {
    const blocks = new Map<string, SurfaceBlock>(saved ? [[blockKey('message', 'ui-0'), {
      owner: true, pending: false, error: '', surface: { id: 'recipe', scope: 'scene', owner: 'message', versions: [{ revision: 2, doc }] },
    }]] : []);
    renderToStaticMarkup(createElement(SurfaceContext.Provider, { value: { blocks } },
      createElement(SurfaceArtifact, { ...actions, messageId: 'message', blockId: 'ui-0', source: JSON.stringify(doc), streaming: false })));
    return captured.actions!;
  }

  it('selects the source document, revision and live app choices before enabling context and placing the draft', () => {
    const store = new UISnapshotStore();
    store.record('scene', JSON.stringify({ surfaceId: 'another-ui', revision: 1, values: {} }), true);
    let enabled = false, request = '';
    const onEdit = vi.fn(() => { enabled = true; });
    const ui = render({
      onSnapshot: (text, _values, _apps, active) => { store.record('scene', text, active); },
      onEdit,
      onContinue: text => { request = withIntelligentUIContext(text, enabled, store.current('scene')); },
    });
    const apps = { servings: { title: '配菜模拟', values: { selected: '清淡' } } };
    ui.onSnapshot?.('旧选择', { people: 3 }, {});
    ui.onSnapshot?.('当前选择', { people: 5 }, apps);
    expect(JSON.parse(store.current('scene')!).surfaceId).toBe('another-ui');
    ui.onContinue?.('按这些选择细化食谱');
    expect(onEdit).toHaveBeenCalledOnce();
    const sent = JSON.parse(request.split('[客户端当前界面选择]\n')[1].split('\n[/客户端当前界面选择]')[0]);
    expect(sent).toEqual({ surfaceId: 'recipe', revision: 2, title: '食谱', document: doc, values: { people: 5 }, apps });
    expect(request).toContain('按这些选择细化食谱');
  });

  it('keeps unsaved previews and other-scene actions from enabling edit mode', () => {
    const onEdit = vi.fn(), onContinue = vi.fn();
    const preview = render({ onEdit, onContinue }, false);
    expect(preview.onEdit).toBeUndefined();
    preview.onContinue?.('演示选择');
    const otherScene = render({ onContinue });
    otherScene.onSnapshot?.('选择', { people: 4 }, {});
    otherScene.onContinue?.('其他场景');
    expect(onEdit).not.toHaveBeenCalled();
    expect(onContinue.mock.calls).toEqual([['演示选择'], ['其他场景']]);
  });
});
