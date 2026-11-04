import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import postcss from 'postcss';

const colors = new Map<string, string>();
postcss.parse(readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8')).walkDecls(/^--color-/, declaration => {
  colors.set(declaration.prop.slice('--color-'.length), declaration.value);
});

function luminance(hex: string) {
  const channels = hex.slice(1).match(/.{2}/g)!.map(channel => {
    const value = Number.parseInt(channel, 16) / 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  });
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}

function contrast(foreground: string, background: string) {
  const light = luminance(foreground);
  const dark = luminance(background);
  return (Math.max(light, dark) + .05) / (Math.min(light, dark) + .05);
}

test('shared text, status colors and control boundaries meet their contrast thresholds', () => {
  for (const [foreground, background, minimum] of [
    ['ink', '#ffffff', 4.5], ['muted', '#ffffff', 4.5],
    ['muted', '#f1f5f9', 4.5], ['brand', '#ffffff', 4.5],
    ['danger', colors.get('danger-soft')!, 4.5],
    ['success', colors.get('success-soft')!, 4.5],
    ['control', '#ffffff', 3], ['control', '#f7f8fa', 3],
    ['brand-dark', '#ffffff', 3],
  ] as const) {
    const ratio = contrast(colors.get(foreground)!, background);
    assert.ok(ratio >= minimum, `${foreground} on ${background}: ${ratio.toFixed(2)} must reach ${minimum}`);
  }
});

test('screensaver clock text stays readable across all opaque backdrop colors', () => {
  for (const background of ['#f4f8fa', '#dcebf3', '#f5bd71', '#d3e8e3', '#b8d5e5', '#f2bf7b', '#a9d2c5', '#ffffff']) {
    assert.ok(contrast('#173c51', background) >= 4.5, background);
    assert.ok(contrast('#33485c', background) >= 4.5, `Toggle text on ${background}`);
  }
});