import { OfficeRuntime } from './vendor/runtime/OfficeRuntime';
import { builtinPlugins } from './vendor/runtime/builtin/officePack';
import { GridNavigation } from './vendor/runtime/navigation';
import type { Actor, World } from './vendor/runtime/model';
import { seatStepDurationMs } from './vendor/scene/gridProjection';
import { supportsOfficePose } from './vendor/contracts/characterPose';
import type { OfficeIdentity } from './identities';

export function createStarmapWorld(identities: OfficeIdentity[]): World {
  if (identities.length > 100 || new Set(identities.map(identity => identity.id)).size !== identities.length) throw new Error('名册过大或身份重复');
  const rows = Math.max(1, Math.ceil(identities.length / 3));
  const props = identities.map((identity, index) => ({ id: 'desk-' + identity.id, name: identity.name + '的工位', templateId: 'office.workstation', position: { x: 2 + index % 3 * 4, y: 2 + Math.floor(index / 3) * 3 }, state: {}, stateRevision: 0 }));
  const actors: Actor[] = identities.map((identity, index) => ({ id: identity.id, name: identity.name + (identity.demo ? ' · 演示' : ''), templateId: identity.id, color: identity.color, homeId: props[index].id, position: { x: props[index].position.x, y: props[index].position.y + 1 }, facing: 'back', posture: 'seated', using: { propId: props[index].id, interactionId: 'seat' }, presentation: { status: 'idle', title: '待命', sourceRevision: 0 } }));
  return { sceneId: 'starmap-office', unit: 'cell', width: 14, height: rows * 3 + 3, gridSize: 1, layoutRevision: 0, bounds: { left: 0, top: 0, right: 14, bottom: rows * 3 + 3 }, actors, props };
}

export function createStarmapRuntime(identities: OfficeIdentity[]) {
  return new OfficeRuntime({ world: createStarmapWorld(identities), plugins: builtinPlugins, createNavigation: templates => new GridNavigation(templates), seatStepDuration: seatStepDurationMs, supportsPose: supportsOfficePose });
}

