import { GridNavigation } from './vendor/runtime/navigation';
import type { NavigationTemplates } from './vendor/runtime/navigationAdapter';
import type { Point, World } from './vendor/runtime/model';
import { cellCenter, seatPixels } from './vendor/scene/gridProjection';
import { sampleOfficeWalk } from './roster-motion';

export const LEISURE_ACTIVITIES = ['phone', 'coffee', 'wander', 'exercise', 'read'] as const;
export type LeisureActivity = typeof LEISURE_ACTIVITIES[number];
export type OfficeScreen = 'off' | 'working' | 'thinking' | 'done';
export const LEISURE_LABELS: Record<LeisureActivity, string> = { phone: '刷手机', coffee: '喝咖啡', wander: '散步', exercise: '伸展健身', read: '看书' };
export interface LeisurePose extends Point { activity?: LeisureActivity; facing: 'front' | 'back' | 'left' | 'right'; walking: boolean; returning: boolean }
interface LeisureVisit { activity: LeisureActivity; cell: Point; route: Point[]; started: number; nextAt: number; returning: boolean }

export function leisureTarget(world: World, index: number, activity: LeisureActivity): Point {
  const slots = Math.max(1, Math.floor((world.width - 3) / 2));
  const slot = index % slots;
  if (index >= slots) return { x: (index - slots) % 2 ? world.width - 2 : 1, y: 3 + Math.floor((index - slots) / 2) % Math.max(1, world.height - 5) };
  return { x: 2 + slot * 2, y: world.height - 2 - (activity === 'wander' ? 1 : 0) };
}

export function leisureRoute(world: World, templates: NavigationTemplates, from: Point, to: Point, homeId?: string): Point[] {
  const query = homeId ? { contact: { propId: homeId, interactionId: 'seat' } } : {};
  return [from, ...new GridNavigation(templates).path(world, from, to, query)].map(cellCenter);
}

export class OfficeLeisure {
  private visits = new Map<string, LeisureVisit>();
  get moving() { return [...this.visits.values()].some(visit => visit.route.length > 1); }
  clear() { this.visits.clear(); }
  forget(id: string) { this.visits.delete(id); }
  has(id: string) { return this.visits.has(id); }
  activity(id: string) { return this.visits.get(id)?.activity; }
  retain(ids: string[]) { for (const id of this.visits.keys()) if (!ids.includes(id)) this.visits.delete(id); }
  sample(id: string, index: number, world: World, templates: NavigationTemplates, homeId: string, home: Point, now: number, idle: boolean, reduced: boolean, departing = false): LeisurePose | undefined {
    let visit = this.visits.get(id);
    if (!visit && !idle) return;
    if (!visit) {
      const activity = LEISURE_ACTIVITIES[index % LEISURE_ACTIVITIES.length];
      const cell = leisureTarget(world, index, activity);
      const route = departing ? leisureRoute(world, templates, home, cell, homeId) : [cellCenter(cell)];
      if (departing) route[0] = seatPixels(home);
      visit = { activity, cell, route, started: now, nextAt: now + 18000 + index % 5 * 2300, returning: false };
      this.visits.set(id, visit);
    }
    if (!idle && !visit.returning) {
      const current = sampleOfficeWalk(visit.route, (now - visit.started) * .35);
      const currentCell = { x: Math.floor(current.x / 50), y: Math.floor(current.y / 50) };
      const route = leisureRoute(world, templates, currentCell, home, homeId);
      route[0] = { x: current.x, y: current.y };
      route[route.length - 1] = seatPixels(home);
      visit = { ...visit, route, started: now, returning: true };
      this.visits.set(id, visit);
    }
    if (idle && !reduced && !visit.returning && now >= visit.nextAt && visit.route.length === 1) {
      const activity = LEISURE_ACTIVITIES[(LEISURE_ACTIVITIES.indexOf(visit.activity) + 1) % LEISURE_ACTIVITIES.length];
      const cell = leisureTarget(world, index, activity);
      visit = { activity, cell, route: leisureRoute(world, templates, visit.cell, cell), started: now, nextAt: now + 23000 + index % 5 * 2300, returning: false };
      this.visits.set(id, visit);
    }
    const point = sampleOfficeWalk(visit.route, reduced ? Number.MAX_SAFE_INTEGER : (now - visit.started) * .35);
    if (point.done) {
      if (visit.returning) { this.visits.delete(id); return; }
      visit.route = [{ x: point.x, y: point.y }];
    }
    return { x: point.x, y: point.y, activity: point.done ? visit.activity : undefined, facing: point.done ? index % 3 === 1 ? 'left' : index % 3 === 2 ? 'right' : 'front' : point.facing, walking: !point.done, returning: visit.returning };
  }
}
