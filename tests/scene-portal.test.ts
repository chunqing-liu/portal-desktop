import { describe, expect, it } from 'vitest';
import type { ChatScene, PortalState } from '../desktop/shared/types';
import { withScenePortal } from '../desktop/main/chat/scene-portal';
import { ChatProxy } from '../desktop/main/chat/proxy';
import { parseConnection } from '../desktop/main/chat/connection';
import { stripClientMessageContext } from '../desktop/renderer/chat/services/local-file-context';

describe('scene Portal identity', () => {
  const connection = parseConnection('https://fixture.test/alice/?token=fixture');
  const a: ChatScene = { scene_id: 'desktop-a', scene_meta: { client: 'test', scene_label: 'A' } };
  const b: ChatScene = { scene_id: 'desktop-b', scene_meta: { client: 'test', scene_label: 'B' } };
  const portal: PortalState = { portalName: 'laptop', beingEndpoint: connection.endpoint, phase: 'connected', message: '', logs: [] };

  it('uses the launched identity and status, drops stale bindings for another Being', () => {
    const bound = withScenePortal(a, portal, connection.endpoint)!;
    expect(bound.scene_meta).toMatchObject({ portal_name: 'laptop', portal_status: 'connected' });
    expect(withScenePortal(a, { ...portal, phase: 'stopped' }, connection.endpoint)?.scene_meta.portal_status).toBe('stopped');
    expect(withScenePortal(bound, portal, 'https://fixture.test/bob')).toEqual(a);
    expect(withScenePortal(bound, { phase: 'stopped', message: '', logs: [] }, connection.endpoint)).toEqual(a);
    expect(a.scene_meta).not.toHaveProperty('portal_name');
  });

  it('binds sends and old-scene followups to live Portal metadata without changing message text', async () => {
    let current = a;
    let runtime = portal;
    const proxy = new ChatProxy(() => connection,
      async (_url, init) => Response.json(await new Request('https://fixture.test', init).json()),
      () => withScenePortal(current, runtime, connection.endpoint),
      id => withScenePortal([a, b].find(scene => scene.scene_id === id), runtime, connection.endpoint));
    async function send(sceneId: string) {
      const result = await proxy.handle(new Request('beings://chat/api/chat/stream', {
        method: 'POST', headers: { 'X-Portal-Scene-Id': sceneId },
        body: JSON.stringify({ message: '生成一个 HTML', scene_meta: { portal_name: 'spoofed' } }),
      }));
      expect(result.status).toBe(200);
      return result.json();
    }
    expect(await send(a.scene_id)).toEqual({ message: '生成一个 HTML', ...withScenePortal(a, runtime, connection.endpoint) });
    current = b;
    runtime = { ...portal, portalName: 'new-laptop', phase: 'starting' };
    expect((await send(b.scene_id)).scene_meta).toMatchObject({ scene_label: 'B', portal_name: 'new-laptop', portal_status: 'starting' });
    expect((await send(a.scene_id)).scene_meta).toMatchObject({ scene_label: 'A', portal_name: 'new-laptop' });
  });

  it('announces first send, scene changes and Portal changes, retries failed announcements, and hides the cue in history', async () => {
    let current = a;
    let runtime = portal;
    let status = 200;
    const sent: any[] = [];
    const proxy = new ChatProxy(() => connection, async (_url, init) => {
      const body = await new Request('https://fixture.test', init).json();
      sent.push(body);
      return Response.json({}, { status });
    }, () => withScenePortal(current, runtime, connection.endpoint), undefined, true);
    const send = async (text = '继续') => {
      const response = await proxy.handle(new Request('beings://chat/api/chat/stream', {
        method: 'POST', body: JSON.stringify({ message: text }),
      }));
      await response.text();
      return sent.at(-1).message as string;
    };
    const first = await send();
    expect(first).toContain('场景 ID：desktop-a；本机 Portal：laptop；状态：已连接');
    expect(stripClientMessageContext(first)).toBe('继续');
    expect(await send()).toBe('继续');
    // A restart/reconnect can finish between sends with the same name/status.
    proxy.portalStateChanged();
    expect(await send()).toContain('本机 Portal：laptop');
    expect(await send()).toBe('继续');
    current = b;
    expect(await send()).toContain('场景 ID：desktop-b');
    runtime = { ...portal, portalName: 'new-laptop', phase: 'starting' };
    status = 503;
    expect(await send()).toContain('本机 Portal：new-laptop；状态：启动中');
    status = 202;
    expect(await send()).toContain('本机 Portal：new-laptop；状态：启动中');
    expect(await send()).toBe('继续');
    runtime = { ...runtime, phase: 'connected' };
    expect(await send()).toContain('状态：已连接');
    current = a;
    const transitioned = await send('【新消息来自 scene「A · ID: desktop-a」】\n\n继续');
    expect(transitioned).not.toContain('新消息来自');
    expect(stripClientMessageContext(transitioned)).toBe('继续');
    runtime = { phase: 'stopped', message: '', logs: [] };
    expect(await send()).toContain('本机 Portal：未确认');
    expect(await send(first)).toBe('继续');
  });
});
