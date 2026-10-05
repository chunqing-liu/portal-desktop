import type { BrowserWindow } from 'electron';
import { OfficePresenceRegistry } from './registry';

export function registerOfficeIpc(handle: (channel: string, callback: (...args: any[]) => unknown) => void, window: () => BrowserWindow | undefined, allowTestInjection: boolean) {
  const registry = new OfficePresenceRegistry();
  handle('beings:office-snapshot', () => registry.snapshot());
  handle('beings:office-report', input => registry.accept(input));
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

