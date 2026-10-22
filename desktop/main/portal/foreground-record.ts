import { renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** No credentials: birth bounds bind the record to its process, and the nonce
 * also verifies the engine's status file once it has published telemetry. */
export interface ForegroundRecord {
  schema: 1; pid: number; parentPid: number; binary: string; config: string;
  identity: string; nonce: string; before: number; after: number;
}
export const foregroundRecordFile = 'portal-foreground.json';
export function saveForegroundRecord(directory: string, record: ForegroundRecord) {
  const file = path.join(directory, foregroundRecordFile);
  // Keep spawn and persistence in the same event-loop turn. An asynchronous
  // writer could overwrite a newer launch after an exit/restart.
  writeFileSync(file + '.tmp', JSON.stringify(record), { mode: 0o600 });
  renameSync(file + '.tmp', file);
}
