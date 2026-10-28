/** Poll outside the mutation queue; discard observations overtaken by a mutation. */
export class BackgroundPoll<T> {
  private busy = false;
  private next = 0;
  private failures = 0;
  constructor(private options: {
    revision: () => unknown;
    allowed: () => boolean;
    read: () => Promise<T>;
    publish: (value: T) => void;
    error: (error: unknown) => void;
    now?: () => number;
  }) {}
  async tick() {
    const now = this.options.now || Date.now;
    if (this.busy || now() < this.next || !this.options.allowed()) return;
    this.busy = true;
    const revision = this.options.revision();
    try {
      const value = await this.options.read();
      if (revision === this.options.revision() && this.options.allowed()) this.options.publish(value);
      this.failures = 0;
    } catch (error) {
      this.failures = Math.min(4, this.failures + 1);
      if (revision === this.options.revision() && this.options.allowed()) this.options.error(error);
    } finally {
      this.next = now() + Math.min(120_000, 15_000 * 2 ** this.failures);
      this.busy = false;
    }
  }
}
