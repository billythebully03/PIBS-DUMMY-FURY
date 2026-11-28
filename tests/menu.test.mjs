import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Render the real React menu. Interactive layout and controls are additionally
// exercised against the browser in a responsive smoke test.
const entry = fileURLToPath(new URL('../src/GUI/SpawnMenu.tsx', import.meta.url));
const { outputFiles } = await build({ entryPoints: [entry], bundle: true, write: false,
  platform: 'node', format: 'cjs', external: ['react'], logLevel: 'silent' });
const module = { exports: {} };
new Function('require', 'module', 'exports', outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { default: SpawnMenu, CHARACTER_LIST } = module.exports;

test('the Russian menu has eight portraits, three tabs and four cleanup actions', () => {
  assert.deepEqual(CHARACTER_LIST.map(c => [c.key, c.label]), [
    ['walt', 'Уолт'], ['homelander', 'Патриот'], ['saul', 'Сол'],
    ['tubtrooper', 'Табтрупер'], ['negan', 'Ниган'], ['jane', 'Патрик'], ['chester', 'Честер'], ['hector', 'Гектор'],
  ]);
  assert.ok(CHARACTER_LIST.every(c => /^#[0-9a-f]{6}$/i.test(c.color) && c.portrait.startsWith('/faces/')));
  assert.equal(CHARACTER_LIST.find(c => c.key === 'tubtrooper').portrait, '/faces/trooper-menu.png');
  const html = renderToStaticMarkup(createElement(SpawnMenu, { onPick() {}, onOpenChange() {}, onAction() {} }));
  assert.match(html, /aria-label="Открыть меню"/);
  assert.match(html, /aria-expanded="false"/); assert.match(html, /\/icons\/menu\.png/);
  assert.match(html, /id="characterMenu"[^>]*aria-hidden="true"[^>]*inert=""/);
  assert.equal((html.match(/class="characterCard(?: is-helmet)?"/g) || []).length, 8);
  assert.equal((html.match(/aria-pressed="false"/g) || []).length, 8);
  for (const c of CHARACTER_LIST) assert.ok(html.includes(c.label) && html.includes(c.portrait));
  for (const [label, icon] of [['Персонажи', 'chars'], ['Предметы', 'entities'], ['Настройки', 'settings']]) {
    assert.ok(html.includes(label)); assert.ok(html.includes(`/icons/${icon}.png`));
  }
  assert.equal((html.match(/role="tab"/g) || []).length, 3);
  assert.match(html, /id="panel-entities"[^>]*hidden=""[^>]*><\/div>/);
  assert.match(html, /id="panel-settings"[^>]*hidden=""[^>]*><\/div>/);
  for (const label of ['Очистить всё', 'Убрать тела', 'Очистить кровь', 'Восстановить карту']) assert.ok(html.includes(label));
  assert.equal((html.match(/class="menuAction"/g) || []).length, 4);
});

test('the left-docked menu, transparent portraits and borderless responsive actions use local resources', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const engine = await readFile(new URL('../src/game/engine.ts', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
  const menu = await readFile(entry, 'utf8');
  for (const obsolete of ['topBar', 'rosterHud', 'cameraControls', 'statTxt', 'drawSpeech', 'updateSpeech']) {
    assert.ok(!app.includes(obsolete) && !engine.includes(obsolete), `${obsolete} should be removed`);
  }
  for (const icon of ['close', 'chars', 'entities', 'settings']) assert.ok(menu.includes(`/icons/${icon}.png`));
  for (const icon of ['pause', 'play']) assert.ok(app.includes(`/icons/${icon}.png`));
  assert.match(css, /\.characterMenu\s*\{[^}]*left:\s*0/s);
  assert.match(css, /height:\s*100dvh/);
  assert.match(css, /\.characterPortrait\s*\{[^}]*background:\s*transparent/s);
  assert.match(css, /\.characterCard\s*\{[^}]*background:\s*transparent/s);
  assert.match(css, /\.characterCard\.is-helmet \.characterPortrait img/);
  assert.match(css, /\.menuActions\s*\{[^}]*repeat\(auto-fit/s);
  assert.match(css, /\.menuAction\s*\{[^}]*border:\s*0/s);
  assert.doesNotMatch(css, /box-shadow|drop-shadow/);
  assert.equal((css.match(/image-rendering:\s*pixelated/g) || []).length, 1, 'only the game canvas is pixelated');
  for (const icon of ['menu', 'close', 'chars', 'entities', 'settings', 'pause', 'play']) {
    const png = await readFile(new URL(`../public/icons/${icon}.png`, import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), 'PNG', `${icon} is a real local PNG`);
  }
  const helmet = await readFile(new URL('../public/faces/trooper.png', import.meta.url));
  const cropped = await readFile(new URL('../public/faces/trooper-menu.png', import.meta.url));
  assert.ok(cropped.length > 1000);
  assert.ok(cropped.readUInt32BE(16) < helmet.readUInt32BE(16) * .65, 'menu helmet has its broad transparent side margins cropped');
  assert.ok(cropped.readUInt32BE(20) > helmet.readUInt32BE(20) * .85, 'the helmet itself is retained');
  assert.match(await readFile(new URL('../index.html', import.meta.url), 'utf8'), /<html lang="ru">[\s\S]*<title>Dummy Fury — песочница<\/title>/);
  assert.ok((await readFile(new URL('../public/fonts/PressStart2P-Regular.ttf', import.meta.url))).length > 50000);
  assert.match(await readFile(new URL('../public/fonts/OFL-PressStart2P.txt', import.meta.url), 'utf8'), /SIL OPEN FONT LICENSE/i);
  assert.ok((await readFile(new URL('../public/fonts/RussoOne-Regular.ttf', import.meta.url))).length > 30000);
  assert.match(await readFile(new URL('../public/fonts/OFL-RussoOne.txt', import.meta.url), 'utf8'), /SIL OPEN FONT LICENSE/i);
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(index, /\/fonts\/RussoOne-Regular\.ttf/);
  assert.doesNotMatch(index, /fonts\.googleapis\.com/);
});
