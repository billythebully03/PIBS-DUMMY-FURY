// Headless-прогон движка без браузера: заглушки DOM/Canvas + кадры Game и Showcase.
// Запуск: node test/smoke.mjs

class FakeGradient {
  addColorStop() {}
}

class FakeCtx {
  constructor(canvas) {
    this.canvas = canvas;
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
  createPattern() {
    return {};
  }
  measureText() {
    return { width: 10 };
  }
}

class FakeCanvas {
  constructor() {
    this.width = 300;
    this.height = 150;
    this.style = {};
    this.dataset = {};
  }
  getContext() {
    if (!this._ctx) this._ctx = new FakeCtx(this);
    return this._ctx;
  }
  getBoundingClientRect() {
    return { width: 960, height: 540, left: 0, top: 0, right: 960, bottom: 540 };
  }
  addEventListener() {}
  removeEventListener() {}
  setPointerCapture() {}
  releasePointerCapture() {}
}

class FakeClassList {
  constructor() {
    this.set = new Set();
  }
  add(...c) {
    c.forEach((x) => this.set.add(x));
  }
  remove(...c) {
    c.forEach((x) => this.set.delete(x));
  }
  toggle(c, force) {
    const on = force === undefined ? !this.set.has(c) : !!force;
    if (on) this.set.add(c);
    else this.set.delete(c);
    return on;
  }
  contains(c) {
    return this.set.has(c);
  }
}

class FakeStyle {
  constructor() {
    this._props = {};
    this.width = '';
    this.opacity = '';
    this.setProperty = (k, v) => {
      this._props[k] = v;
    };
  }
}

class FakeEl {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.classList = new FakeClassList();
    this.style = new FakeStyle();
    this.dataset = {};
    this.children = [];
    this.textContent = '';
    this.innerHTML = '';
    this.offsetWidth = 0;
    this.disabled = false;
    this.className = '';
  }
  addEventListener() {}
  removeEventListener() {}
  querySelector() {
    return new FakeEl();
  }
  querySelectorAll() {
    return [];
  }
  appendChild(c) {
    this.children.push(c);
    return c;
  }
  getBoundingClientRect() {
    return { width: 960, height: 540, left: 0, top: 0, right: 960, bottom: 540 };
  }
  getContext() {
    if (!this._ctx) this._ctx = new FakeCtx(this);
    return this._ctx;
  }
}

class Path2DStub {
  constructor() {
    this.ops = [];
  }
  moveTo() {}
  lineTo() {}
  arc() {}
  ellipse() {}
  rect() {}
  bezierCurveTo() {}
  quadraticCurveTo() {}
  closePath() {}
}

globalThis.Path2D = Path2DStub;
globalThis.window = globalThis;
globalThis.devicePixelRatio = 1;
globalThis.innerWidth = 1280;
globalThis.innerHeight = 720;
globalThis.document = {
  createElement: (tag) => (tag === 'canvas' ? new FakeCanvas() : new FakeEl(tag)),
  querySelector: () => new FakeEl(),
  querySelectorAll: () => [],
  addEventListener() {},
  removeEventListener() {},
  hidden: false,
  fonts: null,
};
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};

const { Game } = await import('../src/game/game.js');
const { Showcase } = await import('../src/game/showcase.js');
const { ATK } = await import('../src/game/animations.js');

function step(name, fn) {
  try {
    fn();
    console.log('OK  ' + name);
  } catch (e) {
    console.error('FAIL ' + name);
    console.error(e);
    process.exitCode = 1;
  }
}

step('Game: init/start/resize', () => {
  const cv = new FakeCanvas();
  const root = new FakeEl('section');
  root.querySelector = () => new FakeEl();
  const game = new Game(cv, root);
  game.resize();
  game.start();
});

step('Game: 900 кадров боя', () => {
  const cv = new FakeCanvas();
  const root = new FakeEl('section');
  root.querySelector = () => new FakeEl();
  const game = new Game(cv, root);
  game.resize();
  game.start();
  for (let i = 0; i < 900; i++) {
    game.update(1 / 60);
    game.render();
  }
});

step('Game: удары, урон, нокаут, реванш', () => {
  const cv = new FakeCanvas();
  const root = new FakeEl('section');
  root.querySelector = () => new FakeEl();
  const game = new Game(cv, root);
  game.resize();
  game.start();
  // дождаться фазы боя
  for (let i = 0; i < 240; i++) game.update(1 / 60);
  if (game.phase !== 'fight') throw new Error('фаза не fight: ' + game.phase);
  game.P.x = game.E.x - 90;
  game.P.dir = 1;
  for (const a of [ATK[0], ATK[1], ATK[2], ATK[3], ATK[4]]) {
    game.P.x = game.E.x - 90;
    game.E.takeHit(game.P, a);
    for (let i = 0; i < 60; i++) {
      game.update(1 / 60);
      game.render();
    }
  }
  game.E.hp = 1;
  game.E.takeHit(game.P, ATK[3]);
  for (let i = 0; i < 600; i++) {
    game.update(1 / 60);
    game.render();
  }
  game.start();
  for (let i = 0; i < 120; i++) {
    game.update(1 / 60);
    game.render();
  }
});

step('Showcase: 600 кадров', () => {
  const cv = new FakeCanvas();
  const show = new Showcase(cv, { cx: 0.5, dir: 1, glow: '#2a1a10' });
  show.resize();
  show.spawn(0);
  for (let i = 0; i < 600; i++) {
    show.update(1 / 60);
    show.render();
  }
});
