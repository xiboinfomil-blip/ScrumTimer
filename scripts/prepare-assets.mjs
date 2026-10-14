import { mkdir, readdir, link, copyFile, readFile, writeFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nextEnv from '@next/env';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(root, 'public');
nextEnv.loadEnvConfig(root);

// Keep the PowerPoint toolchain untouched. Publish only browser assets, never sources.
async function publish(source, destination) {
  await mkdir(path.dirname(destination), { recursive: true });
  try {
    const [a, b] = await Promise.all([stat(source), stat(destination)]);
    if (a.ino === b.ino && a.dev === b.dev) return;
  } catch { /* Destination does not exist yet. */ }
  await rm(destination, { force: true });
  try { await link(source, destination); }
  catch { await copyFile(source, destination); }
}

async function syncDirectory(source, destination) {
  await mkdir(destination, { recursive: true });
  let entries;
  try { entries = await readdir(source, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') entries = []; else throw error; }
  const allowed = entries.filter(entry => entry.isDirectory() || /\.(png|jpe?g|gif|webp)$/i.test(entry.name));
  const names = new Set(allowed.map(entry => entry.name));
  for (const entry of await readdir(destination)) {
    if (!names.has(entry)) await rm(path.join(destination, entry), { recursive: true, force: true });
  }
  for (const entry of allowed) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) await syncDirectory(from, to);
    else await publish(from, to);
  }
}

await mkdir(publicRoot, { recursive: true });
for (const file of ['infomil-logo.svg', 'mood-meter.html']) {
  await publish(path.join(root, file), path.join(publicRoot, file));
}
const remote = process.env.MOOD_LOCAL_ASSETS !== '1';
const text = remote ? '[]' : await readFile(path.join(root, 'mood-meters/catalog.js'), 'utf8');
const json = text.replace(/^\uFEFF/, '').replace(/^\s*\/\/[^\n]*\n/, '').replace(/^\s*window\.MOOD_METER_DECKS\s*=\s*/, '').replace(/;\s*$/, '');
const catalog = JSON.parse(json);
if (!Array.isArray(catalog)) throw new Error('Invalid mood meter catalog');
await mkdir(path.join(publicRoot, 'mood-meters'), { recursive: true });
await writeFile(path.join(publicRoot, 'mood-meters/catalog.json'), JSON.stringify(remote ? { remote: true } : catalog));
if (remote) await rm(path.join(publicRoot, 'mood-meters/slides'), { recursive: true, force: true });
else await syncDirectory(path.join(root, 'mood-meters/slides'), path.join(publicRoot, 'mood-meters/slides'));
console.log(remote ? 'Remote Google SVG mode: local slide images excluded; no Office or API key required.' : `Published ${catalog.length} local mood meters (PowerPoints excluded).`);