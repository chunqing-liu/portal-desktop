import type { BrowserWindow } from 'electron';
import { OfficePresenceRegistry } from './registry';
import { OfficeOrders } from './orders';

export function registerOfficeIpc(handle: (channel: string, callback: (...args: any[]) => unknown) => void, window: () => BrowserWindow | undefined, allowTestInjection: boolean, orderFile?: string) {
  const registry = new OfficePresenceRegistry();
  handle('beings:office-snapshot', () => registry.snapshot());
  const orders = new OfficeOrders(orderFile);
  handle('beings:office-report', input => {
    try { return registry.accept(orders.assign(input)); }
    catch (error) { return { accepted: false, sequence: registry.snapshot().sequence, code: error instanceof Error && ['STALE_RUN', 'EVENT_CONFLICT', 'ORDER_EXHAUSTED', 'ORDER_CAPACITY'].includes(error.message) ? error.message : 'ORDER_PERSISTENCE_OR_INPUT_ERROR' }; }
  });
  handle('beings:office-test-inject', input => {
    if (!allowTestInjection) throw new Error('Office test injection is disabled');
    return registry.accept(input);
  });
  const unsubscribe = registry.subscribe(message => {
    const target = window();
    if (target && !target.isDestroyed()) target.webContents.send('beings:office-message', message);
  });
  const timer = setInterval(() => registry.expire(), 1000);
  timer.unref();
  return () => { clearInterval(timer); unsubscribe(); };
}
