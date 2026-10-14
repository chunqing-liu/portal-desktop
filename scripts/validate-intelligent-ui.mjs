// Use the renderer's actual decoder; never substitute a built-in sample.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const args = process.argv.slice(2);
const baseIndex = args.indexOf('--base');
const baseFile = baseIndex >= 0 ? args[baseIndex + 1] : undefined;
if (baseIndex >= 0) {
  if (!baseFile) { console.error('--base requires a complete UI file'); process.exit(2); }
  args.splice(baseIndex, 2);
}
const files = args;
if (!files.length) {
  console.error('Usage: node scripts/validate-intelligent-ui.mjs [--base current.json] <file.jsonl|file.json|file.md> [...]');
  process.exit(2);
}
const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../desktop/renderer/shared/intelligent-ui/stream.ts', import.meta.url))],
  bundle: true, platform: 'node', format: 'esm', write: false,
});
const { UIStream } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
let base;
if (baseFile) {
  try {
    const result = new UIStream().update(await readFile(resolve(baseFile), 'utf8'), false);
    if (result.error || !result.doc) throw new Error(result.error || 'No base document');
    base = result.doc;
  } catch (error) { console.error(`FAIL base ${resolve(baseFile)}: ${error.message}`); process.exit(1); }
}
for (const file of files) {
  const path = resolve(file);
  try {
    const source = await readFile(path, 'utf8');
    const fenced = [...source.matchAll(/^```intelligent-ui\s*\r?\n([\s\S]*?)^```\s*$/gm)];
    const blocks = fenced.length ? fenced.map(match => match[1]) : [source];
    for (const [index, block] of blocks.entries()) {
      const result = new UIStream(base).update(block, false);
      if (result.error || !result.doc) {
        console.error(`FAIL ${path} [${index + 1}]: ${result.error || 'No complete UI document'}`);
        process.exitCode = 1;
      } else console.log(`PASS ${path} [${index + 1}]: client protocol validation (${result.doc.title})`);
    }
  } catch (error) {
    console.error(`FAIL ${path}: ${error.message}`);
    process.exitCode = 1;
  }
}
