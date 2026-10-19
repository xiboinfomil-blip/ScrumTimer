import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);

test('Material icon imports resolve with exact production package filenames', () => {
  const root = dirname(require.resolve('@mui/icons-material'));
  const names = new Set(readdirSync(join(root, 'esm')));
  const sources = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? sources(join(directory, entry.name)) : /\.tsx?$/.test(entry.name) ? [join(directory, entry.name)] : []);
  let count = 0;
  for (const file of sources('src')) {
    for (const match of readFileSync(file, 'utf8').matchAll(/['"](@mui\/icons-material\/([^'"]+))['"]/g)) {
      assert.ok(names.has(`${match[2]}.js`), `${file}: missing case-sensitive ESM icon ${match[2]}`);
      assert.ok(require.resolve(match[1]), `${file}: unresolved icon ${match[1]}`);
      count++;
    }
  }
  assert.ok(count > 0, 'The application must use the installed Material icon library');
});