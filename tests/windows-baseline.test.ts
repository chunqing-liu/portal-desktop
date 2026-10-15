import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { selectWindowsBaseline, verifyBaselineChecksum } from '../scripts/download-windows-baseline.mjs';

const release = (version: string) => ({ tag_name: `v${version}`, assets: [
  { name: `portal-desktop-${version}-windows-x64-Setup.exe` }, { name: 'SHA256SUMS.txt' },
] });
it('selects the newest older published release across patch/minor boundaries', () => {
  expect(selectWindowsBaseline([release('0.1.9'), release('0.1.10'), release('0.2.0'),
    { ...release('0.1.11'), draft: true }, { ...release('0.1.12'), prerelease: true }], '0.2.0').version).toBe('0.1.10');
});
it('fails closed instead of replacing missing historical coverage with a version fixture', () => {
  expect(() => selectWindowsBaseline([release('0.2.0')], '0.2.0')).toThrow('No published');
  expect(() => selectWindowsBaseline([release('0.1.8'), { ...release('0.1.9'), assets: [] }], '0.2.0')).toThrow('missing a unique');
});
it('requires exactly one matching checksum for the downloaded historical installer', () => {
  const bytes = Buffer.from('historical installer'), asset = release('0.1.9').assets[0].name;
  const row = createHash('sha256').update(bytes).digest('hex') + '  ' + asset;
  expect(() => verifyBaselineChecksum(bytes, row, asset)).not.toThrow();
  expect(() => verifyBaselineChecksum(Buffer.from('corrupted'), row, asset)).toThrow();
  expect(() => verifyBaselineChecksum(bytes, row + '\n' + row, asset)).toThrow();
});
