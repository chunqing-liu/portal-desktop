import type { Value } from './runtime';
type Values = Record<string, Value>;
const memory = new Map<string, Values>();
let database: Promise<IDBDatabase | null> | undefined;
function db() {
  return database ??= new Promise(resolve => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    const request = indexedDB.open('town-intelligent-ui', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}
export async function loadUIState(key: string): Promise<Values | undefined> {
  if (memory.has(key)) return memory.get(key);
  const database = await db();
  if (!database) return;
  return new Promise(resolve => {
    const request = database.transaction('state').objectStore('state').get(key);
    request.onsuccess = () => {
      const raw = request.result;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return resolve(undefined);
      const values: Values = {};
      for (const [name, value] of Object.entries(raw)) {
        if (!/^[A-Za-z][\w-]{0,63}$/.test(name) || ['constructor','prototype','__proto__'].includes(name)) continue;
        if (value === null || typeof value === 'boolean' || typeof value === 'string' && value.length <= 10000 || typeof value === 'number' && Number.isFinite(value)) values[name] = value;
      }
      resolve(values);
    };
    request.onerror = () => resolve(undefined);
  });
}
export function rememberUIState(key: string, values: Values) {
  memory.set(key, { ...values });
  if (memory.size > 200) memory.delete(memory.keys().next().value!);
}
export async function saveUIState(key: string, values: Values) {
  rememberUIState(key, values);
  const database = await db();
  if (!database) return;
  try { database.transaction('state', 'readwrite').objectStore('state').put(values, key); } catch { /* A denied store never blocks interaction. */ }
}
