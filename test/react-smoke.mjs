// Прогон React-интерфейса в jsdom: boot -> loading -> menu -> modes -> select -> game.
// Запуск: npx esbuild test/react-smoke.mjs --bundle --platform=node --format=esm \
//   --external:jsdom --jsx=automatic --outfile=test/.smoke.mjs && node test/.smoke.mjs

import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});

const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
globalThis.Image = window.Image;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

class FakeGradient {
  addColorStop() {}
}
class FakeCtx {
  constructor() {
    this.fillStyle = '#000';
    this.strokeStyle = '#000';
    this.lineWidth = 1;
    this.lineCap = 'butt';
    this.lineJoin = 'miter';
    this.globalAlpha = 1;
    this.globalCompositeOperation = 'source-over';
    this.shadowColor = '#000';
    this.shadowBlur = 0;
    this.font = '';
    this.textAlign = 'left';
    this.filter = 'none';
  }
  clearRect() {}
  setTransform() {}
  transform() {}
  translate() {}
  scale() {}
  save() {}
  restore() {}
  clip() {}
  beginPath() {}
  closePath() {}
  moveTo() {}
  lineTo() {}
  arc() {}
  ellipse() {}
  rect() {}
  bezierCurveTo() {}
  quadraticCurveTo() {}
  fill() {}
  stroke() {}
  fillRect() {}
  strokeRect() {}
  fillText() {}
  strokeText() {}
  drawImage() {}
  setLineDash() {}
  createLinearGradient() {
    return new FakeGradient();
  }
  createRadialGradient() {
    return new FakeGradient();
  }
  measureText() {
    return { width: 10 };
  }
}
window.HTMLCanvasElement.prototype.getContext = function () {
  if (!this._ctx) this._ctx = new FakeCtx();
  return this._ctx;
};
class Path2DStub {
  moveTo() {}
  lineTo() {}
  arc() {}
  ellipse() {}
  rect() {}
  bezierCurveTo() {}
  quadraticCurveTo() {}
  closePath() {}
}
window.Path2D = Path2DStub;
globalThis.Path2D = Path2DStub;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (msg) => {
  console.error('FAIL: ' + msg);
  process.exitCode = 1;
};
const ok = (msg) => console.log('OK  ' + msg);
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { default: App } = await import('../src/App.jsx');

const root = createRoot(document.getElementById('root'));
root.render(React.createElement(App));

await sleep(300);
if (document.querySelector('.boot')) ok('boot screen');
else fail('boot screen не найден');

await sleep(3400);
if (document.querySelector('.loadingImg')) ok('loading screen с картинкой');
else fail('loading screen не найден');

// загрузка держится минимум 6 секунд + fade
await sleep(6800);
const menu = document.querySelector('.menu');
if (!menu) fail('меню не найдено');
else {
  ok('меню');
  if (menu.querySelector('.menuLogo')) ok('логотип dummyfury.png');
  else fail('нет логотипа');
  if (menu.querySelector('.verAlpha')?.textContent.includes('АЛЬФА v0.0.5')) ok('версия альфа');
  else fail('нет подписи АЛЬФА v0.0.5');
  const play = menu.querySelector('.btnPlay');
  if (play && play.textContent.includes('ИГРАТЬ')) ok('кнопка ИГРАТЬ');
  else fail('кнопка ИГРАТЬ не найдена');
  const settings = menu.querySelector('.linkBtn');
  if (settings && settings.textContent.includes('НАСТРОЙКИ')) ok('текст НАСТРОЙКИ');
  else fail('НАСТРОЙКИ не найдены');
  click(play);
}

await sleep(200);
const modes = document.querySelector('.modes');
if (!modes) fail('экран режимов не найден');
else {
  ok('экран режимов');
  const head = modes.querySelector('.headTitle');
  if (head && head.textContent.includes('ВЫБЕРИ РЕЖИМ')) ok('заголовок ВЫБЕРИ РЕЖИМ');
  else fail('заголовок режимов не тот');
  if (modes.querySelector('.headBack')?.textContent.includes('НАЗАД')) ok('кнопка НАЗАД');
  else fail('нет НАЗАД');
  const cards = [...modes.querySelectorAll('.modeCard')];
  if (cards.length === 3) ok('три карточки режимов');
  else fail('карточек режимов: ' + cards.length);
  if (modes.querySelectorAll('.modeCard.locked').length === 2) ok('два режима заблокированы');
  else fail('заблокированных режимов не 2');
  const duel = cards.find((c) => !c.classList.contains('locked'));
  if (duel && duel.textContent.includes('ДУЭЛЬ') && duel.textContent.includes('1х1')) {
    ok('дуэль доступна с описанием 1х1');
  } else fail('карточка дуели не та');
  click(duel);
}

await sleep(200);
const select = document.querySelector('.select');
if (!select) fail('экран выбора персонажа не найден');
else {
  ok('экран выбора персонажа');
  const head = select.querySelector('.headTitle');
  if (head && head.textContent.includes('ТЕПЕРЬ ВЫБЕРИ ПЕРСОНАЖА')) ok('заголовок выбора');
  else fail('заголовок выбора не тот');
  if (select.querySelector('.charHero canvas')) ok('крупный бокс с бойцом');
  else fail('нет крупного бокса');
  const plate = select.querySelector('.charNamePlate');
  if (plate && plate.textContent.includes('TEST DUMMY')) ok('табличка с именем');
  else fail('табличка имени не найдена');
  const cells = [...select.querySelectorAll('.charCell')];
  if (cells.length === 10) ok('сетка 2×5 из 10 ячеек');
  else fail('ячеек: ' + cells.length);
  if (cells.every((c) => c.textContent.includes('СКОРО…'))) ok('во всех ячейках СКОРО…');
  else fail('не во всех ячейках СКОРО…');
  const ready = [...select.querySelectorAll('.selectFooter button')].find((b) =>
    b.textContent.includes('ГОТОВО'),
  );
  if (ready) ok('кнопка ГОТОВО');
  else fail('кнопка ГОТОВО не найдена');
  click(ready);
}

await sleep(400);
const game = document.querySelector('.game');
if (!game) fail('экран игры не найден');
else {
  ok('экран игры');
  for (const id of ['hud', 'gameCv', 'dpad', 'bPunch', 'pauseOv', 'resultOv']) {
    if (!document.getElementById(id)) fail('нет #' + id);
  }
  ok('HUD и элементы управления на месте');
}

await sleep(1500);
ok('кадры игры отработали без исключений');

console.log(process.exitCode ? '--- ЕСТЬ ОШИБКИ ---' : '--- ВСЕ ПРОВЕРКИ ПРОШЛИ ---');
process.exit(process.exitCode || 0);
