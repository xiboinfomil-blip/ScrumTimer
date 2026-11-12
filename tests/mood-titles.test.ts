import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strToU8, zipSync } from 'fflate';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { extractMoodText, extractMoodTitles } from '../src/lib/mood/mood-titles.ts';

const shape = (title: string, left: number, top: number) => `<p:sp><p:spPr><a:xfrm><a:off x="${left}" y="${top}"/><a:ext cx="300" cy="180"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:rPr sz="2400"/><a:t>${title}</a:t></a:r></a:p><a:p><a:r><a:t>A definition, not the title.</a:t></a:r></a:p></p:txBody></p:sp>`;
const presentation = strToU8('<p:presentation xmlns:p="p"><p:sldSz cx="960" cy="540"/></p:presentation>');
const deck = (content: string) => zipSync({ 'ppt/presentation.xml': presentation, 'ppt/slides/slide2.xml': strToU8(`<p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree>${content}</p:spTree></p:cSld></p:sld>`) });

test('second-slide titles follow mood quadrants, not shape order, and omit definitions', () => {
  const source = deck(shape('Cheerful', 560, 20) + shape('Secure', 560, 300) + shape('Angry &amp; anxious', 60, 20) + shape('Tired', 60, 300));
  assert.deepEqual(extractMoodTitles(source), ['Angry & anxious', 'Tired', 'Secure', 'Cheerful']);
  assert.deepEqual(extractMoodText(source), {
    titles: ['Angry & anxious', 'Tired', 'Secure', 'Cheerful'],
    subtitles: Array(4).fill('A definition, not the title.'),
  });
});

test('missing slide, unsupported declarations and oversized text fail safely', () => {
  assert.deepEqual(extractMoodTitles(zipSync({ 'ppt/presentation.xml': presentation })), [null, null, null, null]);
  assert.throws(() => extractMoodTitles(zipSync({ 'ppt/slides/slide2.xml': strToU8('<!DOCTYPE x><x/>') })), /declarations/);
  assert.throws(() => extractMoodTitles(deck('x'.repeat(1024 * 1024))), /too large/);
});

test('group coordinate transforms and split title runs are respected', () => {
  const grouped = `<p:grpSp><p:grpSpPr><a:xfrm><a:off x="480" y="0"/><a:ext cx="480" cy="270"/><a:chOff x="0" y="0"/><a:chExt cx="960" cy="540"/></a:xfrm></p:grpSpPr>${shape('Very cheerful', 60, 20).replace('<a:t>Very cheerful</a:t>', '<a:t>Very </a:t></a:r><a:r><a:t>cheerful</a:t>')}</p:grpSp>`;
  assert.deepEqual(extractMoodTitles(deck(grouped)), [null, null, null, 'Very cheerful']);
});

test('title route resolves live-only presentations, caches extraction and rejects unknown IDs', async () => {
  const liveId = 'deck-11111111111111111111';
  const bundled = JSON.parse(readFileSync(new URL('../src/lib/mood/remote-mood-catalog.json', import.meta.url), 'utf8'));
  assert.ok(!bundled.some((item: { id: string }) => item.id === liveId));
  let lookups = 0, downloads = 0;
  const exports: { GET?: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response> } = {};
  const source = readFileSync(new URL('../src/app/api/mood-meters/decks/[id]/titles/route.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(compiled, { exports, Response, require(name: string) {
    if (name === '@/lib/mood/remote-mood-cache') return { cachedMoodPresentation: async (id: string) => {
      lookups++;
      return id === liveId ? { google_id: 'trustedLiveGoogleId' } : undefined;
    } };
    if (name === '@/lib/mood/google-slides') return { fetchGooglePowerPoint: async (id: string) => {
      downloads++;
      assert.equal(id, 'trustedLiveGoogleId');
      return deck(shape('Live title', 60, 20));
    } };
    if (name === '@/lib/mood/mood-titles') return { extractMoodText };
    throw new Error(`Unexpected dependency: ${name}`);
  } });
  const get = (id: string) => exports.GET!(new Request('http://localhost'), { params: Promise.resolve({ id }) });
  assert.equal((await get('../invalid')).status, 404);
  assert.equal(lookups, 0);
  assert.equal((await get('deck-22222222222222222222')).status, 404);
  assert.equal(downloads, 0);
  const response = await get(liveId);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'private, max-age=300');
  assert.equal((await response.json()).titles[0], 'Live title');
  assert.equal((await get(liveId)).status, 200);
  assert.equal(downloads, 1);
});