import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { build } from 'esbuild';
import os from 'node:os';
import path from 'node:path';
import { OrphanPortalRecovery } from '../desktop/main/portal/orphan';
import { parseConnection } from '../desktop/main/chat/connection';
import { command, windowsPowerShellScript, type Command } from '../desktop/main/portal/background';
import { foregroundRecordFile, saveForegroundRecord, type ForegroundRecord } from '../desktop/main/portal/foreground-record';
import { PortalSupervisor } from '../desktop/main/portal/supervisor';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });
const connection = parseConnection('http://127.0.0.1:1/windows-orphan/?token=fixture');
const proof = 'a'.repeat(64);
const entry = { pid: 123, binary: 'C:\\client\\heart-portal.exe', identity: '127.0.0.1:1/windows-orphan', proof };

it('routes verified Windows orphans through the same Being-scoped stop transaction without exposing credentials', async () => {
  const source: string[] = [];
  const run: Command = vi.fn(async (_file, args) => {
    const script = Buffer.from(args.at(-1)!, 'base64').toString('utf16le'); source.push(script);
    return script.includes("$operation='inspect'") ? JSON.stringify(entry) : '';
  });
  const recovery = new OrphanPortalRecovery("C:\\用户's profile", run, 'win32');
  const targets = await recovery.conflicts(connection);
  expect(targets).toHaveLength(1);
  await recovery.stop(targets[0]);
  expect(source[1]).toContain(`$expectedProof='${proof}'`);
  expect(source[1]).toContain("$portalProfile='C:\\用户''s profile'");
  expect(source.join('\n')).not.toContain(connection.link);
  expect(await recovery.conflicts(parseConnection('http://127.0.0.1:1/another/?token=fixture'))).toEqual([]);
  expect(await recovery.conflicts(parseConnection('http://127.0.0.1:1/windows-orphan/?token=rotated'))).toHaveLength(1);
  await expect(recovery.stop({ ...targets[0], root: 'C:\\another' })).rejects.toThrow('当前客户端');
});

it('does not fall back to killing unverified Windows processes when inspection fails', async () => {
  const absent = new OrphanPortalRecovery('C:\\profile', async () => 'null', 'win32');
  expect(await absent.conflicts(connection)).toEqual([]);
  const failure = new OrphanPortalRecovery('C:\\profile', async () => { throw new Error('access denied'); }, 'win32');
  await expect(failure.conflicts(connection)).rejects.toThrow('access denied');
  for (const invalid of [{ ...entry, pid: -1 }, { ...entry, proof: 'invalid' }, { ...entry, binary: 'relative.exe' }]) {
    await expect(new OrphanPortalRecovery('C:\\profile', async () => JSON.stringify(invalid), 'win32').conflicts(connection)).rejects.toThrow('身份记录无效');
  }
});

it.skipIf(process.platform !== 'win32')('recovers an actual Windows foreground engine after its client crashes and rejects stale identities', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "portal-orphan 中文 ' ")); roots.push(root);
  const binary = path.resolve('resources/heart-portal.exe');
  const library = path.join(root, 'supervisor.cjs');
  await build({ entryPoints: ['desktop/main/portal/supervisor.ts'], outfile: library, bundle: true, platform: 'node', format: 'cjs' });
  const settings = { endpoint: '', being: '', hasToken: true, portalName: 'windows-orphan', portalBinary: binary,
    workspace: root, autoStart: false, allowExec: false, kitsEnabled: false };
  const input = path.join(root, 'fixture.json');
  await writeFile(input, JSON.stringify({ root, settings, connection }));
  let parent: ChildProcess | undefined, engine: number | undefined;
  const replacement = new PortalSupervisor(root);
  try {
    parent = spawn(process.execPath, ['-e', `
      const {PortalSupervisor} = require(process.argv[1]);
      const f = require(process.argv[2]);
      const portal = new PortalSupervisor(f.root);
      (async () => { await portal.start(f.settings, f.connection); await portal.waitReady(); console.log(portal.state.pid); })()
        .catch(error => { console.error(error); process.exit(1); });
      setInterval(() => {}, 1000);
    `, library, input], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const [output] = await once(parent.stdout!, 'data');
    engine = Number(String(output).trim());
    expect(engine).toBeGreaterThan(0);
    const record = JSON.parse(await readFile(path.join(root, foregroundRecordFile), 'utf8')) as ForegroundRecord;
    expect(record).toMatchObject({ pid: engine, parentPid: parent.pid, identity: entry.identity });
    expect(JSON.stringify(record)).not.toContain('token=');
    const recovery = new OrphanPortalRecovery(root);
    expect(await recovery.conflicts(connection)).toEqual([]); // Live client owns it.
    const exited = once(parent, 'exit'); parent.kill('SIGKILL'); await exited;
    expect(await new OrphanPortalRecovery(path.join(root, 'other')).conflicts(connection)).toEqual([]);
    expect(await recovery.conflicts(parseConnection('http://127.0.0.1:1/other/?token=fixture'))).toEqual([]);
    const targets = await recovery.conflicts(connection);
    if (targets.length !== 1) {
      // Report only identity comparisons and clock values, never command lines,
      // connection links or the engine's environment.
      const source = windowsPowerShellScript(`
        $profilePath='${root.replaceAll("'", "''")}';
        $record=Get-Content -LiteralPath (Join-Path $profilePath 'portal-foreground.json') -Raw -Encoding UTF8 | ConvertFrom-Json;
        $item=Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$record.pid)";
        $ownerProcess=Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$record.parentPid)";
        $status=Get-Content -LiteralPath (Join-Path $profilePath '.portal-connection-status.json') -Raw -Encoding UTF8 | ConvertFrom-Json;
        $created=if($item){([DateTimeOffset]$item.CreationDate.ToUniversalTime()).ToUnixTimeMilliseconds()}else{0};
        $sameUser=if($item){(Invoke-CimMethod -InputObject $item -MethodName GetOwnerSid).Sid -eq [Security.Principal.WindowsIdentity]::GetCurrent().User.Value}else{$false};
        @{engineAlive=[bool]$item;binaryMatches=($item.ExecutablePath -eq $record.binary);parentMatches=($item.ParentProcessId -eq $record.parentPid);
          parentAlive=[bool]$ownerProcess;sameUser=$sameUser;before=$record.before;after=$record.after;created=$created;
          statusPidMatches=($status.pid -eq $record.pid);nonceMatches=($status.nonce -ceq $record.nonce)} | ConvertTo-Json -Compress
      `);
      const diagnostic = await command('powershell.exe', ['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(source,'utf16le').toString('base64')]);
      expect(targets, diagnostic).toHaveLength(1);
    }
    const statusFile = path.join(root, '.portal-connection-status.json');
    const status = await readFile(statusFile, 'utf8');
    await rm(statusFile);
    expect(await recovery.conflicts(connection)).toHaveLength(1); // Crash before first telemetry write.
    await writeFile(statusFile, status);
    // A PID recycled for a different creation time must not match the record.
    saveForegroundRecord(root, { ...record, before: 1, after: 2 });
    expect(await recovery.conflicts(connection)).toEqual([]);
    saveForegroundRecord(root, { ...record, nonce: 'wrong-launch' });
    expect(await recovery.conflicts(connection)).toEqual([]);
    saveForegroundRecord(root, record);
    await expect(recovery.stop({ ...targets[0], orphan: { ...targets[0].orphan!, proof: '0'.repeat(64) } })).rejects.toThrow('identity changed');
    expect(() => process.kill(engine!, 0)).not.toThrow();
    await recovery.stop(targets[0]);
    expect(() => process.kill(engine!, 0)).toThrow();
    engine = undefined;
    await replacement.start(settings, connection);
    await replacement.waitReady();
    expect(replacement.state).toMatchObject({ managed: true, conflict: false });
  } finally {
    await replacement.stop();
    if (parent && parent.exitCode === null && parent.signalCode === null) {
      const exited = once(parent, 'exit'); parent.kill('SIGKILL'); await exited;
    }
    if (engine) await command('taskkill.exe', ['/PID', String(engine), '/T', '/F']).catch(() => {});
  }
}, 120_000);
