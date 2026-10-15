import { expect, it } from 'vitest';
import { build } from 'esbuild';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { readdir, writeFile } from 'node:fs/promises';
import { stageInstaller, windowsInstallerScript } from '../desktop/main/updates/manual-installer';

it.skipIf(process.platform !== 'win32')('runs the Windows installer worker after its client parent exits', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "portal-handoff 中文 ' "));
  const entry = path.join(root, 'parent.cjs'), marker = path.join(root, 'worker-completed');
  try {
    await build({ stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
      import { stageInstaller } from './desktop/main/updates/manual-installer';
      import { createHash } from 'node:crypto';
      import { readdir, readFile, writeFile } from 'node:fs/promises';
      import path from 'node:path';
      (async () => {
        const root = process.argv[2], asset = 'portal-desktop-9.8.7-windows-x64-Setup.exe';
        const payload = Buffer.from('fixture payload');
        const sums = createHash('sha256').update(payload).digest('hex') + '  ' + asset;
        const handoff = await stageInstaller(root, '9.8.7', 'fixture/releases', process.execPath,
          async url => new Response(url.endsWith('SHA256SUMS.txt') ? sums : payload));
        const updates = path.join(root, 'client-updates');
        const script = path.join(updates, (await readdir(updates))[0], 'install.ps1');
        const quote = value => "'" + value.replaceAll("'", "''") + "'";
        // Only the installer body is a fixture. Production staging and worker
        // launch must execute it in a process that survives this parent.
        const worker = await readFile(script, 'utf8');
        await writeFile(script, worker.slice(0, worker.indexOf('  # Chromium')) +
          '[IO.File]::WriteAllText(' + quote(path.join(root, 'worker-completed')) + ', "survived"); Write-InstallState "completed"\\n' +
          '} catch { Write-InstallState "failed" $_.Exception.Message; exit 1 }');
        await handoff();
      })().catch(error => { console.error(error); process.exitCode = 1; });
    ` }, outfile: entry, bundle: true, platform: 'node', format: 'cjs', loader: { '.py': 'text' } });
    await promisify(execFile)(process.execPath, [entry, root], { windowsHide: true, timeout: 30_000 });
    const deadline = Date.now() + 10_000;
    let content = '';
    while (Date.now() < deadline) {
      content = await readFile(marker, 'utf8').catch(() => '');
      if (content) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    expect(content).toBe('survived');
  } finally {
    expect(path.dirname(root)).toBe(path.resolve(os.tmpdir()));
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  }
}, 45_000);

it.skipIf(process.platform !== 'win32')('rejects a worker that exits before readiness and retains its diagnostics', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'portal-handoff-failure-'));
  try {
    const payload = Buffer.from('fixture'), asset = 'portal-desktop-9.8.7-windows-x64-Setup.exe';
    const sums = createHash('sha256').update(payload).digest('hex') + '  ' + asset;
    const handoff = await stageInstaller(root, '9.8.7', 'fixture/releases', process.execPath,
      async url => new Response(String(url).endsWith('SHA256SUMS.txt') ? sums : payload));
    const updates = path.join(root, 'client-updates'), attempt = path.join(updates, (await readdir(updates))[0]);
    await writeFile(path.join(attempt, 'install.ps1'), '\ufeffexit 42');
    await expect(handoff()).rejects.toThrow('无法启动客户端安装助手');
    expect(await readFile(path.join(attempt, 'install-launch.log'), 'utf8')).toContain('42');
    expect((await readdir(attempt)).some(file => file.endsWith('.cancel'))).toBe(true);
  } finally {
    expect(path.dirname(root)).toBe(path.resolve(os.tmpdir()));
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  }
}, 35_000);

it.skipIf(process.platform !== 'win32')('records cancellation without launching Setup or a replacement client', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'portal-handoff-cancel-'));
  try {
    const script = path.join(root, 'worker.ps1'), cancel = path.join(root, 'cancel'), ready = path.join(root, 'ready'), status = path.join(root, 'state.json');
    await writeFile(script, '\ufeff' + windowsInstallerScript(process.pid, path.join(root, 'must-not-launch-setup.exe'), path.join(root, 'must-not-launch-client.exe')));
    await writeFile(cancel, 'cancelled');
    const result = await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', script, '-ReadyFile', ready, '-CancelFile', cancel, '-StatusFile', status], { windowsHide: true, timeout: 10_000 })
      .then(() => { throw new Error('Expected cancelled worker to fail'); }, error => error);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Installation handoff cancelled');
    expect(result.stderr).not.toContain('Client recovery failed');
    expect(JSON.parse(await readFile(status, 'utf8'))).toMatchObject({ stage: 'failed', detail: 'Installation handoff cancelled' });
    await expect(readFile(ready)).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    expect(path.dirname(root)).toBe(path.resolve(os.tmpdir()));
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  }
}, 15_000);
