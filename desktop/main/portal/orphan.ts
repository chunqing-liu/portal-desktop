import path from 'node:path';
import { command, windowsPowerShellScript, type Command } from './background';
import { parseConnection, type Connection } from '../chat/connection';
import { portalIdentity, type PortalConflict } from './external';
import macLaunch from './mac-launch.py?raw';
import windowsOrphan from './windows-orphan.ps1?raw';

export interface OrphanPortal { binary: string; proof: string }

/** Recover foreground children left behind by a crashed client. Native adapters
 * verify the OS user, original owner, launch identity and exact profile. */
export class OrphanPortalRecovery {
  constructor(private directory: string, private run: Command = command, private platform = process.platform) {}

  private windows(operation: 'inspect' | 'stop', proof = '') {
    const ps = (value: string) => "'" + value.replaceAll("'", "''") + "'";
    const source = windowsPowerShellScript(`$operation=${ps(operation)}; $portalProfile=${ps(this.directory)}; $expectedProof=${ps(proof)};\n` + windowsOrphan);
    return this.run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(source, 'utf16le').toString('base64')]);
  }

  async conflicts(connection: Connection): Promise<PortalConflict[]> {
    if (this.platform === 'win32') {
      const entry = JSON.parse(await this.windows('inspect'));
      if (!entry) return [];
      if (!Number.isSafeInteger(entry.pid) || entry.pid <= 0 || typeof entry.binary !== 'string' ||
          !path.win32.isAbsolute(entry.binary) || !/^[a-f0-9]{64}$/.test(entry.proof)) throw new Error('遗留 Portal 身份记录无效。');
      if (entry.identity !== portalIdentity(connection)) return [];
      return [{ id: entry.proof, root: this.directory, label: '客户端遗留 Portal', pid: entry.pid,
        orphan: { binary: entry.binary, proof: entry.proof } }];
    }
    if (this.platform !== 'darwin') return [];
    const listing = await this.run('/bin/ps', ['-axo', 'pid=,uid=,comm=']);
    const found: PortalConflict[] = [];
    for (const line of listing.split('\n')) {
      const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line);
      if (!match || Number(match[2]) !== process.getuid!() || path.basename(match[3]) !== 'heart-portal') continue;
      const pid = Number(match[1]), binary = match[3];
      let launch: { arguments: string[]; environment: Record<string, string>; cwd: string; proof: string };
      try {
        launch = JSON.parse(await this.run('/usr/bin/python3', ['-c', macLaunch, String(pid), binary, this.directory, 'inspect']));
        if (portalIdentity(parseConnection(launch.environment.PORTAL_CONNECT_LINK)) !== portalIdentity(connection)) continue;
        if (!/^[a-f0-9]{64}$/.test(launch.proof)) continue;
      } catch { continue; } // Active owners, other profiles and exited processes are not ours.
      found.push({ id: launch.proof, root: this.directory, label: '客户端遗留 Portal', pid,
        orphan: { binary, proof: launch.proof } });
    }
    return found;
  }

  async stop(target: PortalConflict) {
    if (!['darwin', 'win32'].includes(this.platform) || !target.orphan || !target.pid || target.root !== this.directory) {
      throw new Error('无法确认遗留 Portal 属于当前客户端。');
    }
    if (this.platform === 'win32') { await this.windows('stop', target.orphan.proof); return; }
    await this.run('/usr/bin/python3', ['-c', macLaunch, String(target.pid), target.orphan.binary,
      this.directory, 'stop', target.orphan.proof]);
  }
}
