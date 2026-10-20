import type { ChatScene, PortalPhase } from './types';

const noticePattern = /^【客户端场景与 Portal：[^\r\n】]*】\r?\n\r?\n/;
const transitionPattern = /^【新消息来自 scene「[^」\r\n]{1,256}」】\r?\n\r?\n/;
const states: Record<PortalPhase, string> = {
  connected: '已连接', starting: '启动中', running: '本地运行，云端连接未确认',
  reconnecting: '重连中', stopping: '停止中', stopped: '已停止', external: '外部实例，未确认', error: '异常',
};
const label = (text: string) => text.replace(/[\r\n\x00-\x1f\x7f【】「」]/g, ' ').trim().slice(0, 128);

export function stripScenePortalNotice(text: string): string {
  return text.replace(noticePattern, '');
}

export function withScenePortalNotice(text: string, scene: ChatScene): string {
  const meta = scene.scene_meta;
  const portal = meta.portal_name ? label(meta.portal_name) : '未确认';
  const status = meta.portal_status ? states[meta.portal_status] : '未确认本机场景对应的实例';
  const notice = `【客户端场景与 Portal：${label(meta.scene_label)}；场景 ID：${label(scene.scene_id)}；本机 Portal：${portal}；状态：${status}】`;
  return `${notice}\n\n${stripScenePortalNotice(text).replace(transitionPattern, '')}`;
}
