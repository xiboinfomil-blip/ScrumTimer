import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strToU8, zipSync } from 'fflate';
import { extractMoodTitles } from '../src/lib/mood/mood-titles.ts';

const shape = (title: string, left: number, top: number) => `<p:sp><p:spPr><a:xfrm><a:off x="${left}" y="${top}"/><a:ext cx="300" cy="180"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:rPr sz="2400"/><a:t>${title}</a:t></a:r></a:p><a:p><a:r><a:t>A definition, not the title.</a:t></a:r></a:p></p:txBody></p:sp>`;
const presentation = strToU8('<p:presentation xmlns:p="p"><p:sldSz cx="960" cy="540"/></p:presentation>');
const deck = (content: string) => zipSync({ 'ppt/presentation.xml': presentation, 'ppt/slides/slide2.xml': strToU8(`<p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree>${content}</p:spTree></p:cSld></p:sld>`) });

test('second-slide titles follow mood quadrants, not shape order, and omit definitions', () => {
  assert.deepEqual(extractMoodTitles(deck(shape('Cheerful', 560, 20) + shape('Secure', 560, 300) + shape('Angry &amp; anxious', 60, 20) + shape('Tired', 60, 300))), ['Angry & anxious', 'Tired', 'Secure', 'Cheerful']);
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