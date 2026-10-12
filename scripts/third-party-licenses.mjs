import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Derive notices from bundled modules so new editor dependencies cannot be omitted.
export async function writeThirdPartyLicenses(destination, modules) {
  const roots = new Set(modules.flatMap(input => {
    const normalized = input.replaceAll('\\', '/').replace(/^\0/, '');
    const match = [...normalized.matchAll(/(?:^|\/)node_modules\/(?:@[^/]+\/)?[^/]+/g)].at(-1);
    return match ? [normalized.slice(0, match.index + match[0].length)] : [];
  }));
  const notices = [];
  for (const root of [...roots].sort()) {
    const metadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
    const license = (await readdir(root)).find(file => /^licen[sc]e(?:\.|$)/i.test(file));
    notices.push(`${metadata.name} ${metadata.version}\n${license ? await readFile(path.join(root, license), 'utf8') : metadata.license || 'License not specified'}`);
  }
  await writeFile(destination, notices.join('\n\n---\n\n'));
}

export function viteModules(result) {
  return (Array.isArray(result) ? result : [result]).flatMap(bundle =>
    bundle.output.flatMap(file => file.type === 'chunk' ? Object.keys(file.modules) : []));
}
