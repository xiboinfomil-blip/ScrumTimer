import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { tsImport } from 'tsx/esm/api';
import { jiraTicketDetails } from '../src/lib/jira/jira.ts';

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

test('Jira rich text retains formatting through conversion and Markdown rendering', () => {
  const paragraph = (value: string) => ({ type: 'paragraph', content: [{ type: 'text', text: value }] });
  const description = { type: 'doc', content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Résumé' }] },
    { type: 'paragraph', content: [
      { type: 'text', text: 'Important', marks: [{ type: 'strong' }] },
      { type: 'text', text: ' utile', marks: [{ type: 'em' }] },
      { type: 'hardBreak' },
      { type: 'text', text: 'Documentation', marks: [{ type: 'link', attrs: { href: 'https://example.atlassian.net/wiki' } }] },
    ] },
    { type: 'orderedList', attrs: { order: 3 }, content: [{ type: 'listItem', content: [paragraph('Vérifier'), { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph('Sous-étape')] }] }] }] },
    { type: 'blockquote', content: [paragraph('Citation')] },
    { type: 'codeBlock', content: [{ type: 'text', text: 'const ready = `yes`;\n```' }] },
    { type: 'table', content: ['État', 'Prêt'].map(value => ({ type: 'tableRow', content: [{ type: 'tableCell', content: [paragraph(value)] }] })) },
    paragraph('<img src=x onerror=alert(1)> **littéral**'),
  ] };
  const issue = { id: '1', key: 'DEV-1', fields: { summary: 'Test', status: { name: 'En cours' }, description } };
  const markdown = jiraTicketDetails(issue, 'https://example.atlassian.net').description;
  const html = render(markdown);
  for (const fragment of ['<h2>Résumé</h2>', '<strong>Important</strong>', '<em>utile</em>', '<ol start="3">', '<ul>', '<blockquote>', '<pre><code>', '<table>', '<td>Prêt</td>', 'href="https://example.atlassian.net/wiki"', '&lt;img src=x onerror=alert(1)&gt; **littéral**']) assert.ok(html.includes(fragment), `${fragment}\n${html}`);
  assert.doesNotMatch(html, /<img\b/);
  assert.equal(jiraTicketDetails({ ...issue, fields: { ...issue.fields, description: '**Markdown direct**' } }, 'https://example.atlassian.net').description, '**Markdown direct**');
  assert.throws(() => jiraTicketDetails({ ...issue, fields: { ...issue.fields, description: { type: 'doc', content: Array.from({ length: 10 }, () => paragraph('x'.repeat(5000))) } } }, 'https://example.atlassian.net'), /longue/);
});