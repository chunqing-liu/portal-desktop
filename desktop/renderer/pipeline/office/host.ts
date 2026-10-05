import { OfficeBridge } from './bridge';
import { createStarmapRuntime } from './world';
import { StarmapScene } from './scene';
import type { OfficeIdentity } from './identities';

export class OfficeHost {
  readonly runtime;
  readonly bridge;
  readonly scene;
  constructor(identities: OfficeIdentity[], onActor: (id: string) => void) {
    this.runtime = createStarmapRuntime(identities);
    this.bridge = new OfficeBridge(this.runtime);
    this.scene = new StarmapScene(this.runtime, onActor);
  }
  dispose() { this.bridge.dispose(); this.scene.dispose(); this.runtime.dispose(); }
}

