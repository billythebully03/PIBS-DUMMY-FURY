// Прогон React-интерфейса в jsdom: boot -> loading -> menu -> modes -> select -> game.
// Запуск: node test/react-smoke.mjs

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
globalThis.innerWidth = 1280;
globalThis.innerHeight = 720;
window.innerWidth = 1280;
window.innerHeight = 720;

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

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { default: App } = await import('../src/App.jsx');

const root = createRoot(document.getElementById('root'));
root.render(React.createElement(App));

await sleep(300);
if (document.querySelector('.boot')) ok('boot screen');
else fail('boot screen не найден');

await sleep(3600);
if (document.querySelector('.loadingImg')) ok('loading screen с картинкой');
else fail('loading screen не найден');

await sleep(2400);
const menu = document.querySelector('.menu');
if (!menu) fail('меню не найдено');
else {
  ok('меню');
  const play = [...menu.querySelectorAll('button')].find((b) => b.textContent.includes('Играть'));
  play.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
}

await sleep(200);
if (document.querySelector('.modes')) ok('экран режимов');
else fail('экран режимов не найден');

const duelCard = document.querySelector('.modeCard:not(.disabled)');
if (!duelCard) fail('дуэль должна быть доступна');
else ok('дуэль доступна');

const disabledCards = document.querySelectorAll('.modeCard.disabled');
if (disabledCards.length === 2) ok('два режима заблокированы');
else fail('ожидалось 2 заблocked режима, есть ' + disabledCards.length);

const modesPlay = [...document.querySelectorAll('.modes button')].find((b) =>
  b.textContent.includes('Играть'),
);
modesPlay.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

await sleep(200);
const select = document.querySelector('.select');
if (!select) fail('экран выбора не найден');
else {
  ok('экран выбора');
  const cards = select.querySelectorAll('.card');
  if (cards.length >= 12) ok('карточек бойцов: ' + cards.length);
  else fail('карточек мало: ' + cards.length);
  const locked = select.querySelectorAll('.card.locked').length;
  if (locked >= 11) ok('силуэтов с замочком: ' + locked);
  else fail('силуэтов мало: ' + locked);
  const fightBtn = [...select.querySelectorAll('button')].find((b) =>
    b.textContent.includes('В бой'),
  );
  if (fightBtn.disabled) ok('«В бой» заблокирован без выбора');
  cards[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(100);
  if (!fightBtn.disabled) ok('«В бой» доступен после выбора');
  fightBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
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
