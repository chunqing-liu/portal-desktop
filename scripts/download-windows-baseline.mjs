import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const versionParts = value => {
  if (!/^v?\d+\.\d+\.\d+$/.test(value)) throw new Error('Invalid release version');
  return value.replace(/^v/, '').split('.').map(BigInt);
};
const compare = (a, b) => {
  const left = versionParts(a), right = versionParts(b);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  return 0;
};
export function selectWindowsBaseline(releases, current) {
  versionParts(current);
  const previous = releases.filter(release => !release.draft && !release.prerelease &&
    /^v\d+\.\d+\.\d+$/.test(release.tag_name) && compare(release.tag_name, current) < 0)
    .sort((a, b) => compare(b.tag_name, a.tag_name))[0];
  if (!previous) throw new Error('No published historical release; a generated baseline cannot validate a release upgrade.');
  const version = previous.tag_name.slice(1);
  const asset = `portal-desktop-${version}-windows-x64-Setup.exe`;
  for (const name of [asset, 'SHA256SUMS.txt']) {
    if (previous.assets?.filter(item => item.name === name).length !== 1) throw new Error(`Historical release ${previous.tag_name} is missing a unique ${name}`);
  }
  return { tag: previous.tag_name, version, asset };
}
export function verifyBaselineChecksum(bytes, manifest, asset) {
  const rows = manifest.split(/\r?\n/).map(line => /^([a-f0-9]{64})  (.+)$/.exec(line)).filter(row => row?.[2] === asset);
  if (rows.length !== 1 || rows[0][1] !== createHash('sha256').update(bytes).digest('hex')) throw new Error('Historical installer checksum mismatch');
}
async function main() {
  const repository = process.env.PORTAL_DESKTOP_UPDATE_REPOSITORY;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || '')) throw new Error('Missing trusted update repository');
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const gh = async args => (await execute('gh', args, { windowsHide: true, maxBuffer: 16 * 1024 * 1024, timeout: 180_000 })).stdout;
  const pages = JSON.parse(await gh(['api', `repos/${repository}/releases`, '--paginate', '--slurp']));
  const baseline = selectWindowsBaseline(pages.flat(), pkg.version);
  const directory = path.resolve(process.argv[2]);
  await mkdir(directory, { recursive: true });
  await gh(['release', 'download', baseline.tag, '--repo', repository, '--pattern', baseline.asset, '--pattern', 'SHA256SUMS.txt', '--dir', directory]);
  const setup = path.join(directory, baseline.asset);
  verifyBaselineChecksum(await readFile(setup), await readFile(path.join(directory, 'SHA256SUMS.txt'), 'utf8'), baseline.asset);
  if (!process.env.GITHUB_ENV) throw new Error('GITHUB_ENV is required to pass the verified baseline to the installer test');
  await appendFile(process.env.GITHUB_ENV, `PORTAL_DESKTOP_BASELINE_SETUP=${setup}\nPORTAL_DESKTOP_BASELINE_VERSION=${baseline.version}\n`);
  console.log(`Verified historical Windows baseline: ${baseline.tag}`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
