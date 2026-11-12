import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { tsImport } from 'tsx/esm/api';

const { TicketDescription } = await tsImport('../src/components/jira/ticket-description.tsx', import.meta.url) as {
  TicketDescription: ComponentType<{ description: string }>;
};
const render = (description: string) => renderToStaticMarkup(createElement(TicketDescription, { description }));

test('Jira descriptions render Markdown headings, lists, tables, code and safe links', () => {
  const html = render('## Résumé\n\n**Important** et *utile*, ~~ancien~~.\n\n- Une étape\n\n1. Vérifier\n\n> Citation\n\n`GET /api`\n\n```ts\nconst ready = true;\n```\n\n| État | Valeur |\n| --- | --- |\n| Prêt | Oui |\n\n[Documentation](https://example.atlassian.net/wiki)');
  for (const fragment of ['<h2>Résumé</h2>', '<strong>Important</strong>', '<em>utile</em>', '<del>ancien</del>', '<ul>', '<ol>', '<blockquote>', '<code>GET /api</code>', '<pre>', '<table>', '<th>État</th>', '<td>Oui</td>', 'href="https://example.atlassian.net/wiki"', 'target="_blank"', 'rel="noopener noreferrer"', 'referrerPolicy="no-referrer"']) {
    assert.ok(html.includes(fragment), fragment);
  }
  assert.doesNotMatch(html, /## Résumé|\*\*Important\*\*/);
});

test('Jira descriptions preserve plain text, line breaks and empty descriptions', () => {
  assert.ok(render('Première ligne\nDeuxième ligne').includes('<p>Première ligne\nDeuxième ligne</p>'));
  assert.ok(render('Paragraphe 1\n\nParagraphe 2').includes('<p>Paragraphe 1</p>\n<p>Paragraphe 2</p>'));
  assert.ok(render('').includes('Aucune description renseignée.'));
});

test('Jira descriptions cannot execute HTML, unsafe URLs or load embedded resources', () => {
  const html = render([
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)> reste du texte, jamais du HTML.',
    '<iframe src="https://evil.invalid/frame"></iframe>',
    '<svg onload="alert(1)"></svg>',
    '[Exécuter](javascript:alert%281%29)',
    '[Données](data:text/html;base64,PHNjcmlwdD4=)',
    '![Image](https://evil.invalid/image)',
    '- [x] Tâche terminée',
  ].join('\n\n'));
  assert.doesNotMatch(html, /<(?:script|img|iframe|svg|input|video|audio|object|embed|link|style)\b|\bhref="(?:javascript|data):/i);
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(html.includes('Exécuter'));
  assert.ok(html.includes('Tâche terminée'));
});