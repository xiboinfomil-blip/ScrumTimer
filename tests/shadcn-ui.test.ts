import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import * as icons from 'lucide-react';

const require = createRequire(import.meta.url);
const sources = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? sources(join(directory, entry.name)) : /\.tsx?$/.test(entry.name) ? [join(directory, entry.name)] : []);
const files = ['src', 'apps/participants/src', 'packages/scrum-shared/src'].flatMap(sources);

test('both apps use shadcn controls without MUI or Emotion runtime imports', () => {
  for (const file of files) assert.doesNotMatch(readFileSync(file, 'utf8'), /from\s+['"]@(mui|emotion)\//, file);
  for (const primitive of ['button', 'input', 'textarea', 'label', 'native-select']) {
    assert.ok(require.resolve(`@infomil/scrum-shared/ui/${primitive}`));
    assert.match(readFileSync(`src/components/ui/${primitive}.tsx`, 'utf8'), /@infomil\/scrum-shared\/ui\//);
  }
});

test('every Lucide icon import resolves to an installed icon export', () => {
  let count = 0;
  for (const file of files) {
    for (const match of readFileSync(file, 'utf8').matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]/g)) {
      for (const specifier of match[1].split(',')) {
        if (specifier.trim().startsWith('type ')) continue;
        const name = specifier.trim().split(/\s+as\s+/)[0];
        assert.ok(name in icons, `${file}: missing Lucide export ${name}`);
        count++;
      }
    }
  }
  assert.ok(count > 0);
});