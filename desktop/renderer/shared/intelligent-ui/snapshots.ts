/** Per-scene artifacts; passive renders never steal an explicitly selected target. */
export class UISnapshotStore {
  private scenes = new Map<string, { selected: string; explicit: boolean; artifacts: Map<string, string> }>();
  record(scene: string, text: string, active = false): string | undefined {
    let id: string;
    try {
      const value = JSON.parse(text);
      if (typeof value.surfaceId !== 'string' || !value.surfaceId || !Number.isInteger(value.revision) || value.revision < 1) return this.current(scene);
      id = value.surfaceId;
    } catch { return this.current(scene); }
    let entry = this.scenes.get(scene);
    if (!entry) { entry = { selected: id, explicit: false, artifacts: new Map() }; this.scenes.set(scene, entry); }
    const fresh = !entry.artifacts.has(id);
    entry.artifacts.set(id, text);
    if (active || (!entry.explicit && fresh)) entry.selected = id;
    if (active) entry.explicit = true;
    return entry.artifacts.get(entry.selected);
  }
  current(scene: string): string | undefined {
    const entry = this.scenes.get(scene);
    return entry?.artifacts.get(entry.selected);
  }
}
