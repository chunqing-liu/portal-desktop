import { OfficeBridge, type ActorPresentation } from './bridge';
import { createStarmapRuntime } from './world';
import { StarmapScene } from './scene';
import { HandoffController } from './handoff';
import type { OfficeIdentity } from './identities';
import type { OfficeInput, OfficePresence } from '../../../shared/office';

export class OfficeHost {
  runtime;
  bridge;
  readonly scene;
  handoffs;
  private identities: OfficeIdentity[];
  private pending?: OfficeIdentity[];
  private unsubscribe: () => void;
  private active = false;
  private disposed = false;
  private scheduled = false;
  private latest: ActorPresentation[] = [];
  private unavailable: string[] = [];
  constructor(identities: OfficeIdentity[], onActor: (id: string) => void, private onRoster = (_identities: OfficeIdentity[]) => {}, private onFeedback = (_feedback: HandoffController['feedback']) => {}) {
    this.identities = identities;
    this.runtime = createStarmapRuntime(identities);
    this.bridge = new OfficeBridge(this.runtime);
    this.scene = new StarmapScene(this.runtime, onActor);
    this.handoffs = new HandoffController(this.runtime, () => this.onFeedback([...this.handoffs.feedback]));
    this.unsubscribe = this.runtime.subscribe(() => this.maybeRebuild());
  }
  project(actors: ActorPresentation[]) { this.latest = actors; this.bridge.project(actors.filter(actor => this.identities.some(identity => identity.id === actor.id))); }
  roster(identities: OfficeIdentity[]) {
    if (JSON.stringify(identities) === JSON.stringify(this.pending || this.identities)) return;
    this.pending = identities;
    this.handoffs.stopForRoster();
    this.maybeRebuild();
  }
  private maybeRebuild() {
    if (!this.pending || !this.handoffs.settled || this.scheduled || this.disposed) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      if (!this.pending || !this.handoffs.settled || this.disposed) return;
      const previous = this.runtime.readWorld();
      this.unsubscribe(); this.handoffs.dispose(); this.bridge.dispose();
      this.runtime.dispose();
      this.identities = this.pending; this.pending = undefined;
      this.runtime = createStarmapRuntime(this.identities, previous);
      this.bridge = new OfficeBridge(this.runtime);
      this.handoffs = new HandoffController(this.runtime, () => this.onFeedback([...this.handoffs.feedback]));
      this.scene.replaceRuntime(this.runtime);
      this.unsubscribe = this.runtime.subscribe(() => this.maybeRebuild());
      this.handoffs.setUnavailable(this.unavailable);
      this.handoffs.setEnabled(this.active);
      this.project(this.latest);
      this.onRoster(this.identities);
    });
  }
  presence(entries: OfficePresence[]) { this.scene.setPresence(entries); this.unavailable = entries.filter(entry => entry.expired || entry.disconnected || entry.status === 'offline').map(entry => entry.identity.id); this.handoffs.setUnavailable(this.unavailable); }
  receive(input: OfficeInput) { this.handoffs.receive(input); }
  setActive(active: boolean) { this.active = active; this.scene.setActive(active); this.handoffs.setEnabled(active); }
  dispose() { this.disposed = true; this.unsubscribe(); this.handoffs.dispose(); this.bridge.dispose(); this.scene.dispose(); this.runtime.dispose(); }
}
