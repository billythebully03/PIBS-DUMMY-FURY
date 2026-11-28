import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Render the real React picker without a browser; interaction/gestures are
// exercised separately by the engine tests and a browser smoke test.
const entry = fileURLToPath(new URL('../src/GUI/SpawnMenu.tsx', import.meta.url));
const { outputFiles } = await build({ entryPoints: [entry], bundle: true, write: false,
  platform: 'node', format: 'cjs', external: ['react'], logLevel: 'silent' });
const module = { exports: {} };
new Function('require', 'module', 'exports', outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { default: SpawnMenu, CHARACTER_LIST } = module.exports;

test('picker has the requested portraits, order, accents and a single closed menu handle', () => {
  assert.deepEqual(CHARACTER_LIST.map(c => [c.key, c.label]), [
    ['walt', 'Уолт'], ['homelander', 'Патриот'], ['saul', 'Сол'],
    ['tubtrooper', 'Табтрупер'], ['negan', 'Ниган'], ['jane', 'Патрик'], ['chester', 'Честер'],
  ]);
  assert.ok(CHARACTER_LIST.every(c => /^#[0-9a-f]{6}$/i.test(c.color) && c.portrait.startsWith('/faces/')));
  const html = renderToStaticMarkup(createElement(SpawnMenu, { onPick() {}, onOpenChange() {} }));
  assert.match(html, /aria-label="Открыть меню персонажей"/);
  assert.match(html, /aria-expanded="false"/); assert.match(html, /\/icons\/menu\.png/);
  assert.match(html, /id="characterMenu"[^>]*aria-hidden="true"[^>]*inert=""/);
  assert.equal((html.match(/class="characterCard"/g) || []).length, 7);
  assert.equal((html.match(/aria-pressed="false"/g) || []).length, 7);
  for (const c of CHARACTER_LIST) assert.ok(html.includes(c.label) && html.includes(c.portrait));
});

test('old HUD is absent and the sliding picker has square corners without pixelating its icon', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const engine = await readFile(new URL('../src/game/engine.ts', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
  const menu = await readFile(entry, 'utf8');
  for (const obsolete of ['topBar', 'rosterHud', 'cameraControls', 'statTxt']) {
    assert.ok(!app.includes(obsolete) && !engine.includes(obsolete), `${obsolete} should be removed`);
  }
  assert.match(menu, /\/icons\/close\.png/); assert.match(menu, /aria-pressed/);
  assert.match(css, /grid-template-columns:\s*repeat\(3/); assert.match(css, /grid-template-columns:\s*repeat\(2/);
  assert.match(css, /\.characterPicker\.is-open \.pickerToggle\s*\{\s*transform:/);
  assert.match(css, /\.characterCard\[aria-pressed="true"\]\s*\{\s*border-color:\s*var\(--accent\)/);
  assert.doesNotMatch(css, /box-shadow|drop-shadow/);
  const radii = [...css.matchAll(/border-radius:\s*([^;}]+)/g)].map(match => match[1].trim());
  assert.ok(radii.every(value => value === '0' || value === '0px'), 'all UI corners are square');
  assert.equal((css.match(/image-rendering:\s*pixelated/g) || []).length, 1, 'only the game canvas is pixelated');
  assert.ok((await readFile(new URL('../public/fonts/PressStart2P-Regular.ttf', import.meta.url))).length > 50000);
  assert.match(await readFile(new URL('../public/fonts/OFL-PressStart2P.txt', import.meta.url), 'utf8'), /SIL OPEN FONT LICENSE/i);
});
