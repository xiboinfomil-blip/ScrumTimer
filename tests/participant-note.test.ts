import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { tsImport } from 'tsx/esm/api';
import type { ComponentType } from 'react';

const { ParticipantNote } = await tsImport('../src/components/ui/participant-note.tsx', import.meta.url) as {
  ParticipantNote: ComponentType<{ hint: string }>;
};
const render = (hint: string) => renderToStaticMarkup(createElement(ParticipantNote, { hint }));

test('participant notes render supported Markdown, paragraphs and LF without raw formatting markers', () => {
  const html = render('**Avancement**\n\n- API terminée\n- *Tests* en cours\n\n1. ~~Ancien~~\n2. Suite  \nDétail');
  for (const fragment of ['<strong>Avancement</strong>', '<em>Tests</em>', '<del>Ancien</del>', '<ul>', '<ol>', '<li>', '<br/>']) {
    assert.ok(html.includes(fragment), fragment);
  }
  assert.doesNotMatch(html, /\*\*Avancement\*\*|~~Ancien~~/);
  assert.ok(render('Première ligne\nDeuxième ligne').includes('<p>Première ligne\nDeuxième ligne</p>'));
  assert.ok(render('Paragraphe 1\n\nParagraphe 2').includes('<p>Paragraphe 1</p>\n<p>Paragraphe 2</p>'));
});

test('participant notes cannot render executable HTML, links, images or embedded resources', () => {
  const html = render([
    '<script>alert(1)</script>',
    '<img src="https://evil.invalid/image" onerror="alert(1)">',
    '<iframe src="https://evil.invalid/frame"></iframe>',
    '<svg onload="alert(1)"></svg>',
    '<a href="https://evil.invalid">HTML link</a>',
    '[Lien](https://evil.invalid/link)',
    '[Exécuter](javascript:alert%281%29)',
    '![Image](https://evil.invalid/markdown)',
    'https://evil.invalid/autolink',
    '- [x] Tâche',
  ].join('\n\n'));
  assert.doesNotMatch(html, /<(?:script|img|iframe|svg|a|input|video|audio|object|embed|link|style)\b|\b(?:src|href|onerror|onload)=/i);
  assert.ok(html.includes('Lien'));
  assert.ok(html.includes('Exécuter'));
});