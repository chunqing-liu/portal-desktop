import type { ChatScene, PortalState } from '../../shared/types';

/** Derive live routing metadata; never persist a runtime binding in the scene catalog. */
export function withScenePortal(scene: ChatScene | undefined, portal: PortalState, endpoint?: string): ChatScene | undefined {
  if (!scene) return;
  const { portal_name: _name, portal_status: _status, ...meta } = scene.scene_meta;
  if (endpoint && portal.beingEndpoint === endpoint && portal.portalName) {
    return { ...scene, scene_meta: { ...meta, portal_name: portal.portalName, portal_status: portal.phase } };
  }
  return { ...scene, scene_meta: meta };
}
