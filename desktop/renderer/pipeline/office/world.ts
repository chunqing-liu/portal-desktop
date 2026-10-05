import { starmapHandoff } from './handoff';
import { OfficeRuntime } from './vendor/runtime/OfficeRuntime';
import { builtinPlugins } from './vendor/runtime/builtin/officePack';
import { GridNavigation } from './vendor/runtime/navigation';
import type { Actor, World } from './vendor/runtime/model';
import { seatStepDurationMs } from './vendor/scene/gridProjection';
import { supportsOfficePose } from './vendor/contracts/characterPose';
import type { OfficeIdentity } from './identities';

export function createStarmapWorld(identities: OfficeIdentity[], previous?: World): World {
  if (identities.length > 100 || new Set(identities.map(identity => identity.id)).size !== identities.length) throw new Error('名册过大或身份重复');
  const retained = previous?.props.filter(prop => identities.some(identity => prop.id === 'desk-' + identity.id)) || [];
  const used = new Set(retained.map(prop => prop.position.x + ':' + prop.position.y));
  const positions = identities.map(identity => {
    const existing = retained.find(prop => prop.id === 'desk-' + identity.id);
    if (existing) return existing.position;
    let slot = 0;
    while (used.has((2 + slot % 3 * 4) + ':' + (2 + Math.floor(slot / 3) * 3))) slot++;
    const position = { x: 2 + slot % 3 * 4, y: 2 + Math.floor(slot / 3) * 3 };
    used.add(position.x + ':' + position.y);
    return position;
  });
  const rows = Math.max(1, ...positions.map(position => Math.floor((position.y - 2) / 3) + 1));
  const props = identities.map((identity, index) => ({ id: 'desk-' + identity.id, name: identity.name + '的工位', templateId: 'office.workstation', position: positions[index], state: {}, stateRevision: 0 }));
  const actors: Actor[] = identities.map((identity, index) => ({ id: identity.id, name: identity.name + (identity.demo ? ' · 演示' : ''), templateId: identity.id, color: identity.color, homeId: props[index].id, position: { x: props[index].position.x, y: props[index].position.y + 1 }, facing: 'back', posture: 'seated', using: { propId: props[index].id, interactionId: 'seat' }, presentation: { status: 'idle', title: '待命', sourceRevision: 0 } }));
  for (const actor of actors) {
    const existing = previous?.actors.find(item => item.id === actor.id);
    if (existing) Object.assign(actor, { position: existing.position, posture: existing.posture, facing: existing.facing, using: existing.using, presentation: { ...existing.presentation, sourceRevision: 0 } });
  }
  return { sceneId: 'starmap-office', unit: 'cell', width: 14, height: rows * 3 + 3, gridSize: 1, layoutRevision: 0, bounds: { left: 0, top: 0, right: 14, bottom: rows * 3 + 3 }, actors, props };
}

export function createStarmapRuntime(identities: OfficeIdentity[], previous?: World) {
  return new OfficeRuntime({ world: createStarmapWorld(identities, previous), plugins: [...builtinPlugins, starmapHandoff], createNavigation: templates => new GridNavigation(templates), seatStepDuration: seatStepDurationMs, supportsPose: supportsOfficePose });
}
