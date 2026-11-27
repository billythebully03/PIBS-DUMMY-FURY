import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, afterEach, beforeEach, test } from 'node:test';
import { transformWithEsbuild } from 'vite';

// Exercise the actual game engine without requiring a browser or exposing its
// internal classes in the production bundle. Canvas methods are instrumented so
// rendering exceptions and important draw calls remain observable.
function makeCanvas(width = 960, height = 540) {
  const canvas = { width, height, style: {} };
  const stats = { drawImage: 0, fillRect: 0, stroke: 0, arc: 0, colors: new Set(), texts: [] };
  let fillStyle = '#000';
  let strokeStyle = '#000';
  const ctx = {
    canvas, stats,
    get fillStyle() { return fillStyle; },
    set fillStyle(value) { fillStyle = value; stats.colors.add(value); },
    get strokeStyle() { return strokeStyle; },
    set strokeStyle(value) { strokeStyle = value; stats.colors.add(value); },
    save() {}, restore() {}, setTransform() {}, transform() {}, translate() {},
    rotate() {}, scale() {}, clearRect() {}, beginPath() {}, closePath() {},
    moveTo() {}, lineTo() {}, quadraticCurveTo() {}, bezierCurveTo() {},
    ellipse() {}, fill() {}, fillText(text, x, y) { stats.texts.push({ text, x, y, color: fillStyle, font: this.font }); },
    strokeText() {}, setLineDash() {},
    fillRect() { stats.fillRect++; }, strokeRect() { stats.stroke++; },
    stroke() { stats.stroke++; }, arc() { stats.arc++; },
    drawImage() { stats.drawImage++; },
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
  };
  canvas.getContext = () => ctx;
  return canvas;
}

const gameCanvas = makeCanvas();
globalThis.window = globalThis;
globalThis.Image = class { constructor() { this.complete = false; this.naturalWidth = 0; } };
globalThis.innerWidth = 1280;
globalThis.innerHeight = 720;
globalThis.devicePixelRatio = 1;
globalThis.requestAnimationFrame = () => 1;
globalThis.addEventListener = () => {};
globalThis.document = {
  createElement: (tag) => tag === 'canvas' ? makeCanvas(300, 150) : {
    style: {}, classList: { toggle() {}, add() {}, remove() {} },
    appendChild() {}, querySelector: () => ({ style: {} }), addEventListener() {},
  },
  querySelector: (selector) => selector === '#gameCv' ? gameCanvas : null,
  getElementById: () => null,
};

const source = await readFile(new URL('../src/game/engine.ts', import.meta.url), 'utf8');
const { code } = await transformWithEsbuild(`${source}\nexport { Game, Fighter };`, 'engine.ts', {
  loader: 'ts', format: 'esm', target: 'es2020',
});
const { Game } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const originalRandom = Math.random;
const originalWarn = console.warn;
let warnings = [];

function seedRandom(value) {
  let seed = value >>> 0;
  Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}

beforeEach(() => {
  seedRandom(12345);
  warnings = [];
  console.warn = (...args) => warnings.push(args.join(' '));
  Game.init();
  Game.autoSpawn = false;
  Game.fighters = [];
});
afterEach(() => assert.deepEqual(warnings, [], 'rendering must not recover from any exceptions'));
after(() => { Math.random = originalRandom; console.warn = originalWarn; });

function fighter(x, dir, skin = 'jane') {
  const f = Game.spawnFighter(x, dir, 0);
  f.skin = skin;
  f.reset(x, dir);
  f.update(1 / 60, null, [f]);
  return f;
}

// Let a ragdoll settle without advancing Fighter's automatic get-up timer, then
// translate it to the middle of the arena while removing residual velocities.
function groundedVictim(x = 500, skin = 'jane') {
  const v = fighter(x, -1, skin);
  v.toRagdoll(0, 180);
  for (let i = 0; i < 180; i++) v.rag.update(1 / 60);
  const dx = x - v.rag.p.pel.x;
  for (const p of Object.values(v.rag.p)) {
    p.x += dx;
    p.px = p.x;
    p.py = p.y;
  }
  v.x = x;
  v.rag.t = 0;
  v.rag.settle = 0;
  return v;
}

// Jane + a standing target at a valid mental-influence range.
function mentalPair(dir = 1, victimFirst = false, targetSkin = 'walt') {
  const a = fighter(dir === 1 ? 330 : 630, dir, 'jane');
  const v = fighter(a.x + dir * 220, -dir, targetSkin);
  a.mentalCD = 0;
  // Freeze only the autonomous decisions, not the actual fighter physics.
  a.autopilot.update = () => {};
  v.autopilot.update = () => {};
  Game.fighters = victimFirst ? [v, a] : [a, v];
  return { a, v };
}

function advanceUntil(predicate, maxFrames = 900, dt = 1 / 60) {
  for (let i = 0; i < maxFrames; i++) {
    if (predicate()) return i;
    Game.update(dt);
  }
  assert.fail(`condition not reached after ${maxFrames} frames`);
}

function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function kneeAngle(hip, knee, ankle) {
  const ux = hip.x - knee.x, uy = hip.y - knee.y;
  const vx = ankle.x - knee.x, vy = ankle.y - knee.y;
  return Math.acos(Math.max(-1, Math.min(1,
    (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy))
  ))) * 180 / Math.PI;
}
function kneeCross(rig, suffix) {
  const a = rig[`a${suffix}`], k = rig[`k${suffix}`], h = rig.pel;
  return ((a.x - h.x) * (k.y - h.y) - (a.y - h.y) * (k.x - h.x)) * rig.dir;
}

test('Negan renders Lucille in idle, walking, attack and living ragdoll states', () => {
  const f = fighter(360, 1, 'negan');
  const cases = [
    () => {},
    () => { f.ctrl.mx = 1; for (let i = 0; i < 10; i++) f.update(1 / 60, null, [f]); f.ctrl.mx = 0; },
    () => { f.startAttack(0); f.st = 0.22; f.buildRig(1 / 60); },
    () => { f.toRagdoll(-150, 220); f.update(1 / 60, null, [f]); },
  ];
  for (const prepare of cases) {
    prepare();
    const count = Game.batLayer.ctx.stats.drawImage;
    Game.render();
    assert.equal(Game.batLayer.ctx.stats.drawImage - count, 1, `bat missing in ${f.state}`);
  }
  f.hp = 0;
  const count = Game.batLayer.ctx.stats.drawImage;
  Game.render();
  assert.equal(Game.batLayer.ctx.stats.drawImage - count, 0, 'a dead fighter must not hold the bat');
});

test('burn marks remain drawn on their body layer', () => {
  const f = fighter(480, 1, 'jane');
  f.addBurn(f.rig.head.x, f.rig.head.y - 6);
  assert.equal(f.burns[0].layer, 'head');
  Game.render();
  assert.ok(Game.headLayer.ctx.stats.colors.has('#2b0b04'), 'head scorch should be painted');
});

test('Homelander glides with airborne feet and anatomically bent legs in both directions', () => {
  for (const dir of [1, -1]) {
    const f = fighter(dir === 1 ? 300 : 660, dir, 'homelander');
    f.state = 'run'; f.ctrl.mx = dir; f.ctrl.run = true;
    const dash = f.fx.dash.bind(f.fx), groundDust = [];
    f.fx.dash = (x, y, d) => { groundDust.push(y); dash(x, y, d); };
    for (let i = 0; i < 40; i++) f.update(1 / 60, null, [f]);
    f.fx.dash = dash;
    const r = f.rig;
    for (const suffix of ['N', 'F']) {
      const ankle = r[`a${suffix}`], knee = r[`k${suffix}`];
      assert.ok(distance(r.pel, ankle) > 90, `leg ${suffix} should be nearly straight`);
      assert.ok(kneeAngle(r.pel, knee, ankle) > 135, `leg ${suffix} should have a gentle bend`);
      assert.ok(kneeCross(r, suffix) < 0, `leg ${suffix} must bend forward at the knee`);
      assert.ok((ankle.x - r.pel.x) * dir < -20, `leg ${suffix} should trail behind`);
      assert.ok(ankle.y < f.gy - 22, `leg ${suffix} should be airborne`);
    }
    assert.ok((r.sh.x - r.pel.x) * dir > 15, 'shoulders should lean forward');
    assert.ok(groundDust.includes(f.gy), 'fast flight should leave ground-level dust');
    assert.equal(f.cape.length, 7);
  }
  for (const dir of [1, -1]) {
    const f = fighter(480, dir);
    assert.ok(kneeCross(f.rig, 'N') < 0, 'standing knees must also face forward');
  }
});

test('mental influence requires a minimum range and a large cooldown', () => {
  const { a, v } = mentalPair();
  // Too close: cannot cast.
  v.x = a.x + 40;
  assert.equal(a.canMental(v), false, 'too close to use mental influence');
  // Too far: cannot cast.
  v.x = a.x + 900;
  assert.equal(a.canMental(v), false, 'too far to use mental influence');
  // Correct range.
  v.x = a.x + 250;
  assert.equal(a.canMental(v), true);
  assert.equal(a.startMental(v), true);
  // Big cooldown, and it is consumed even on a successful cast.
  assert.ok(a.mentalCD >= 12 && a.mentalCD <= 18, `big cooldown expected, got ${a.mentalCD}`);
  assert.equal(a.canMental(v), false, 'cooldown blocks immediate recast');
});

test('mental influence runs the full cutscene: glow, clutch, run, wall slam, stun', () => {
  for (const dir of [1, -1]) {
    seedRandom(4321);
    Game.init(); Game.autoSpawn = false; Game.fighters = [];
    const { a, v } = mentalPair(dir, dir < 0);
    assert.equal(a.startMental(v), true);
    const phases = new Set();
    let glowSeen = false, slammed = false, stunned = false;
    const initialX = v.x;
    const wall = dir > 0 ? v.maxX : v.minX;
    for (let i = 0; i < Math.ceil(8 / (1 / 60)); i++) {
      Game.update(1 / 60);
      if (v.mentalPhase) phases.add(v.mentalPhase);
      if (v.mentalGlow > 0.3) glowSeen = true;
      if (v.mentalPhase === 'stun') {
        slammed = true;
        assert.ok(Math.abs(v.x - (wall - 8)) < 12, `victim should stop at the wall (dir=${dir})`);
      }
      if (v.mentalStunT > 0 && v.mentalPhase === 'stun') stunned = true;
      if (v.state === 'idle' && v.mentalPhase === 'idle') break;
    }
    const label = `dir=${dir}`;
    for (const p of ['clutch', 'turn', 'run', 'stun']) {
      assert.ok(phases.has(p), `${label}: missing victim phase ${p}`);
    }
    assert.ok(glowSeen, `${label}: purple outline must appear`);
    assert.ok(slammed, `${label}: victim must reach the wall`);
    assert.ok(stunned, `${label}: victim must be stunned at the wall`);
    assert.ok(v.x !== initialX, `${label}: victim must move toward the wall`);
    // Influence ends and the victim returns to idle.
    assert.equal(v.mentalInfluence, false);
    assert.equal(v.state, 'idle');
  }
});

test('the victim ignores hits at self: damage is taken but is not knocked down', () => {
  const { a, v } = mentalPair();
  assert.equal(a.startMental(v), true);
  advanceUntil(() => v.isMentalVictim());
  const hpBefore = v.hp;
  const enemy = fighter(230, 1, 'saul');
  enemy.autopilot.update = () => {};
  v.takeHit(enemy, { dmg: 8, zone: 'torso', pw: 0.9, stun: 0.4, kb: 200 });
  assert.equal(v.hp, hpBefore - 8, 'victim still takes damage');
  assert.equal(v.state, 'mental_influence', 'ordinary hit does not knock the victim down');
  assert.ok(v.mentalInfluence, 'influence survives ordinary damage');
  // A launching attack can still move the victim into ragdoll physics.
  v.takeHit(enemy, { dmg: 5, zone: 'torso', pw: 1, launch: true, lvx: 200, lvy: 420 });
  assert.equal(v.state, 'ragdoll', 'launching attacks can break the influence');
});

test('lasers, trips and KOs interrupt a cast and clear the victim influence', () => {
  for (const kind of ['laser', 'trip', 'ko']) {
    seedRandom(7788);
    Game.init(); Game.autoSpawn = false; Game.fighters = [];
    const { a, v } = mentalPair();
    assert.equal(a.startMental(v), true);
    advanceUntil(() => v.isMentalVictim());
    const enemy = fighter(190, 1, 'homelander');
    enemy.autopilot.update = () => {};
    if (kind === 'laser') a.takeLaser(enemy, a.rig.pel, true);
    if (kind === 'trip') enemy.trip(a);
    if (kind === 'ko') Game.ko(a, enemy, { lvx: 300, lvy: 400, pw: 1 });
    assert.notEqual(a.state, 'mental', kind);
    assert.ok(a.mentalCD > 0, kind);
    if (kind === 'laser') assert.ok(a.burns.length > 0, 'laser burn remains on Jane');
  }
});

test('the purple glow is drawn on the FX layer while under influence', () => {
  const { a, v } = mentalPair();
  assert.equal(a.startMental(v), true);
  advanceUntil(() => v.isMentalVictim());
  const stats = Game.fxLayer.ctx.stats;
  stats.colors.clear();
  stats.arc = 0;
  Game.render();
  assert.ok(stats.arc > 0, 'glow should draw arcs around body segments');
  assert.ok(stats.colors.has('rgba(168,85,247,1)') || [...stats.colors].some(c => typeof c === 'string' && c.includes('168,85,247')),
    'purple glow color should be painted');
});

test('mental text label and phrase are drawn and expire with the influence', () => {
  const { a, v } = mentalPair();
  assert.equal(a.startMental(v), true);
  advanceUntil(() => v.isMentalVictim());
  const textStats = Game.textLayer.ctx.stats;
  textStats.texts.length = 0;
  Game.render();
  assert.ok(textStats.texts.some(t => t.text === 'UNDER INFLUENCE'), 'victim label should be drawn');
  const castLabel = textStats.texts.find(t => t.text === 'MENTAL PUSH');
  assert.ok(castLabel, 'caster label should be drawn');
  // The phrase is spoken during the cast.
  advanceUntil(() => v.mentalPhase === 'stun');
  textStats.texts.length = 0;
  Game.render();
  // After the victim is stunned and influence fades, labels disappear.
  advanceUntil(() => v.state === 'idle');
  textStats.texts.length = 0;
  Game.render();
  assert.ok(!textStats.texts.some(t => t.text === 'UNDER INFLUENCE'));
  assert.ok(!textStats.texts.some(t => t.text === 'MENTAL PUSH'));
});

test('camera follows Jane and zooms during the mental cast, then eases back', () => {
  const { a, v } = mentalPair();
  a.x = 430; v.x = 650;
  a.buildRig(1 / 60); v.buildRig(1 / 60);
  assert.equal(a.startMental(v), true);
  for (let i = 0; i < 20; i++) Game.update(1 / 60);
  assert.ok(Game.camera.zoom > 1.05 && Game.camera.zoom < 1.2);
  assert.ok(Game.camera.vignette > 0.5);
  const oldCameraX = Game.camera.x;
  a.x += 45;
  for (let i = 0; i < 15; i++) Game.update(1 / 60);
  assert.ok(Game.camera.x > oldCameraX, 'camera should follow the caster');
  const interrupter = fighter(250, 1, 'saul');
  interrupter.autopilot.update = () => {};
  a.takeHit(interrupter, { dmg: 5, zone: 'head', pw: .4, stun: .3, kb: 80 });
  const zoom = Game.camera.zoom;
  Game.update(1 / 60);
  assert.ok(Game.camera.zoom < zoom, 'camera must ease out after interruption');
  for (let i = 0; i < 180; i++) Game.update(1 / 60);
  assert.ok(Math.abs(Game.camera.zoom - 1) < .001);
  assert.ok(Game.camera.vignette < .001);
});

test('interrupting before induction cancels the cast and consumes cooldown', () => {
  const { a, v } = mentalPair();
  assert.equal(a.startMental(v), true);
  for (let i = 0; i < 5; i++) Game.update(1 / 60);
  const enemy = fighter(200, 1, 'saul');
  a.takeHit(enemy, { dmg: 5, zone: 'head', pw: .4, stun: .3, kb: 80 });
  assert.equal(a.state, 'hit');
  assert.ok(a.mentalCD > 0, 'an interrupted attempt still consumes cooldown');
  assert.equal(v.mentalInfluence, false);
});

test('a launched victim under influence stays incapacitated until the stun ends', () => {
  const { a, v } = mentalPair();
  assert.equal(a.startMental(v), true);
  advanceUntil(() => v.isMentalVictim());
  const enemy = fighter(230, 1, 'saul'); enemy.autopilot.update = () => {};
  v.takeHit(enemy, { dmg: 8, zone: 'head', pw: 1, launch: true, lvx: 200, lvy: 420 });
  assert.equal(v.state, 'ragdoll');
  for (let i = 0; i < 120; i++) Game.update(1 / 60);
  assert.equal(v.state, 'ragdoll', 'launched victim cannot get up early');
  advanceUntil(() => v.state === 'getup' || v.state === 'idle');
});

test('spoken lines vary across casts without changing within one cast', () => {
  const phrases = new Set();
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    seedRandom(seed * 997);
    Game.init(); Game.autoSpawn = false; Game.fighters = [];
    const { a, v } = mentalPair();
    assert.equal(a.startMental(v), true);
    advanceUntil(() => v.isMentalVictim());
    assert.ok(a.mentalPhrase && a.mentalPhrase.length <= 24);
    phrases.add(a.mentalPhrase);
    const phrase = a.mentalPhrase;
    for (let i = 0; i < 10; i++) Game.update(1 / 60);
    assert.equal(a.mentalPhrase, phrase, 'the phrase must not cycle mid-cast');
  }
  assert.ok(phrases.size > 2, 'spoken lines should vary');
});

test('the AI uses mental influence with a cooldown at range', () => {
  const a = fighter(330, 1, 'jane'), v = fighter(550, -1, 'walt');
  Game.fighters = [a, v];
  a.mentalCD = 0;
  Math.random = () => .001;
  a.autopilot.update(1 / 60, a, v, [a, v]);
  assert.equal(a.state, 'mental');
  assert.ok(a.mentalCD >= 12 && a.mentalCD <= 18);
  // Cooldown blocks a second cast.
  a.state = 'idle';
  a.autopilot.update(1 / 60, a, v, [a, v]);
  assert.notEqual(a.state, 'mental', 'cooldown must block immediate recast');
});

test('portrait sizing keeps the entire arena and both fighters visible', () => {
  const oldWidth = innerWidth, oldHeight = innerHeight;
  try {
    globalThis.innerWidth = 390; globalThis.innerHeight = 844;
    Game.resize();
    assert.equal(Game.W, 800);
    assert.ok(parseFloat(Game.cv.style.width) <= innerWidth + 0.01);
    assert.ok(parseFloat(Game.cv.style.height) < innerHeight);
    assert.ok(parseFloat(Game.cv.style.top) > 0, 'letterboxed arena is vertically centered');
    const { a, v } = mentalPair();
    v.x = a.x + 350; v.buildRig(1 / 60);
    assert.equal(a.startMental(v), true);
    advanceUntil(() => v.isMentalVictim());
    const c = Game.camera;
    const screenX = worldX => (worldX - c.x) * c.zoom + Game.W / 2;
    assert.ok(screenX(a.x) > 0 && screenX(a.x) < Game.W);
    assert.ok(screenX(v.x) > 0 && screenX(v.x) < Game.W);
    assert.ok(Math.abs(Game.screenToWorldX(screenX(v.x)) - v.x) < 1e-8);
    const texts = Game.textLayer.ctx.stats.texts;
    texts.length = 0;
    Game.render();
    const label = texts.find(t => t.text === 'UNDER INFLUENCE');
    assert.ok(label, `label not found; texts=${JSON.stringify(texts.map(t => ({text:t.text,font:t.font})))}`);
    const fontWorld = Number(label.font.match(/(\d+(\.\d+)?)px/)[1]);
    assert.ok(fontWorld * Game.displayScale * c.zoom >= 10.9, 'phone text stays readable');
  } finally {
    globalThis.innerWidth = oldWidth; globalThis.innerHeight = oldHeight;
    Game.resize();
  }
});

test('removing the target before induction cancels the cast', () => {
  const { a, v } = mentalPair();
  assert.equal(a.startMental(v), true);
  Game.fighters = [a];
  Game.update(1 / 60);
  assert.equal(a.state, 'idle');
  assert.equal(v.mentalInfluence, false);
});

test('a seeded autonomous match actually induces mental influence', () => {
  seedRandom(3 * 982451653);
  Game.init();
  let sawCast = false, sawInfluence = false;
  for (let i = 0; i < 40 * 60; i++) {
    Game.update(1 / 60);
    if (Game.fighters.some(f => f.skin === 'jane' && f.state === 'mental')) sawCast = true;
    if (Game.fighters.some(f => f.isMentalVictim())) sawInfluence = true;
  }
  assert.ok(sawCast, 'Jane should choose the ability on her own');
  assert.ok(sawInfluence, 'the opposing AI should be put under influence');
});

test('autonomous matches maintain finite physics and valid mental state', () => {
  for (const seed of [11, 982451653]) {
    seedRandom(seed);
    Game.init();
    for (let frame = 0; frame < 5400; frame++) {
      Game.update(1 / 60);
      if (frame % 60 === 0) Game.render();
      for (const f of Game.fighters) {
        assert.ok(Number.isFinite(f.x) && Number.isFinite(f.y) && Number.isFinite(f.hp), `invalid fighter at frame ${frame}`);
        if (f.isMentalVictim()) {
          assert.equal(f.state, 'mental_influence');
        }
        if (f.rag) for (const p of Object.values(f.rag.p)) {
          assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `invalid ragdoll at frame ${frame}`);
        }
      }
    }
  }
});
