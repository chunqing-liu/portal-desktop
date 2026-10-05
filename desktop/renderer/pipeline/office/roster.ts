import type { OfficeIdentity } from './identities';
import type { OfficeRuntime } from './vendor/runtime/OfficeRuntime';
import { createStarmapWorld } from './world';

export function appendOfficeIdentities(runtime: OfficeRuntime, identities: OfficeIdentity[]) {
  const current = runtime.readWorld();
  const added = identities.filter(identity => !current.actors.some(actor => actor.id === identity.id));
  if (!added.length) return;
  if (current.actors.length + added.length > 100) throw new Error('ROSTER_CAPACITY');
  const initial = createStarmapWorld(added);
  const boardY = current.props.find(prop => prop.id === 'collab-board')!.position.y;
  const occupied = new Set(current.props.map(prop => prop.position.x + ':' + prop.position.y));
  const desks = initial.props.filter(prop => prop.id !== 'collab-board').map(prop => {
    let slot = 0;
    while (occupied.has((2 + slot % 3 * 4) + ':' + (boardY + 5 + Math.floor(slot / 3) * 3))) slot++;
    const position = { x: 2 + slot % 3 * 4, y: boardY + 5 + Math.floor(slot / 3) * 3 };
    occupied.add(position.x + ':' + position.y);
    return { ...prop, position };
  });
  const actors = initial.actors.map((actor, index) => ({ ...actor, position: { x: desks[index].position.x, y: desks[index].position.y + 1 } }));
  runtime.appendOfficeRoster(actors, desks, Math.max(current.height, ...desks.map(desk => desk.position.y + 3)));
}
