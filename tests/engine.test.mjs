import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, afterEach, beforeEach, test } from 'node:test';
import { transformWithEsbuild } from 'vite';

// Exercise the actual game engine without requiring a browser or exposing its
// internal classes in the production bundle. Canvas methods are instrumented so
// rendering exceptions and important draw calls remain observable.
function makeCanvas(width = 960, height = 540) {
  const canvas = { width, height, style: {} };
  const stats = { drawImage: 0, fillRect: 0, stroke: 0, arc: 0, colors: new Set() };
  let fillStyle = '#000';
  const ctx = {
    canvas, stats,
    get fillStyle() { return fillStyle; },
    set fillStyle(value) { fillStyle = value; stats.colors.add(value); },
    save() {}, restore() {}, setTransform() {}, transform() {}, translate() {},
    rotate() {}, scale() {}, clearRect() {}, beginPath() {}, closePath() {},
    moveTo() {}, lineTo() {}, quadraticCurveTo() {}, bezierCurveTo() {},
    ellipse() {}, fill() {}, fillText() {}, strokeText() {}, setLineDash() {},
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

function grabPair(skin = 'jane', dir = 1, victimFirst = false) {
  const a = fighter(500, dir, skin);
  const v = groundedVictim(500);
  a.reset(v.x - dir * 70, dir);
  a.update(1 / 60, null, [a, v]);
  Game.fighters = victimFirst ? [v, a] : [a, v];
  return { a, v };
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

test('grab preparation shows progress and is cancelled immediately by a hit', () => {
  const { a, v } = grabPair();
  assert.equal(a.startGrabPrep(v, 1), true);
  for (let i = 0; i < 30; i++) Game.update(1 / 60);
  assert.equal(a.state, 'grab_prep');
  const stats = Game.fxLayer.ctx.stats;
  stats.colors.clear();
  const arcs = stats.arc;
  Game.render();
  assert.ok(stats.arc - arcs >= 4 && stats.colors.has('#37d858'), 'progress circle must fill green');
  const attacker = fighter(300, 1, 'walt');
  a.takeHit(attacker, { dmg: 8, zone: 'torso', pw: 0.4, stun: 0.25, kb: 90 });
  assert.equal(a.state, 'hit');
  assert.equal(a.grabTarget, null);
  assert.equal(v.grabbedBy, null);
  assert.equal(v.rag.pin, null);
  assert.ok(a.grabCD >= 6, 'interruption should impose a cooldown');
  stats.colors.clear();
  Game.render();
  assert.ok(!stats.colors.has('#37d858'), 'progress circle must disappear when interrupted');
});

test('overhead grabs stay attached in either spawn order and at different frame rates', () => {
  for (const skin of ['jane', 'negan', 'homelander', 'walt', 'saul']) {
    for (const dir of [1, -1]) {
      for (const dt of [1 / 30, 1 / 60, 1 / 144]) {
        seedRandom(12345);
        Game.init(); Game.autoSpawn = false; Game.fighters = [];
        const { a, v } = grabPair(skin, dir, dir === -1);
        v.hp = 80;
        v.rag.t = 2.9; // A grabbed victim must not wake up while the indicator fills.
        assert.equal(a.startGrabPrep(v, dir), true);
        const strokes = Game.dctx.stats.stroke;
        let threw = false, turned = false, minHeadY = Infinity, maxNearError = 0, maxFarError = 0;
        let impactSide = null, abort = null;
        const initial = { attackerX: a.x, victimX: v.x, pelvisX: v.rag.p.pel.x };
        for (let i = 0; i < Math.ceil(5 / dt); i++) {
          Game.update(dt);
          if (!threw && a.state !== 'grab_prep' && a.state !== 'grab_throw') {
            abort = { step: i, attacker: a.state, attackerX: a.x, victim: v.state, victimX: v.x, pelvisX: v.rag?.p.pel.x };
            break;
          }
          if (a.state === 'grab_throw') {
            threw = true;
            if (a.dir === -dir) turned = true;
            minHeadY = Math.min(minHeadY, v.rag.p.head.y);
            if (a.grabHand && !a.grabSlammed) {
              const ankle = v.rag.p[a.grabAnkle];
              maxNearError = Math.max(maxNearError, distance(a.rig.wN, ankle));
              maxFarError = Math.max(maxFarError, distance(a.rig.wF, ankle));
            }
            if (a.grabSlammed && impactSide === null) impactSide = (v.x - a.x) * -dir;
          }
          if (threw && a.state === 'idle') break;
        }
        const label = `${skin}, dir=${dir}, dt=${dt}`;
        assert.ok(threw && turned, `${label}: throw must turn around: ${JSON.stringify({ initial, abort })}`);
        assert.ok(minHeadY < a.gy - 170, `${label}: victim should swing overhead`);
        assert.ok(maxNearError < 1 && maxFarError < 5, `${label}: hands detached (${maxNearError}, ${maxFarError})`);
        assert.equal(v.hp, 64, `${label}: slam must deal damage exactly once`);
        assert.ok(impactSide > 30, `${label}: victim should land on the opposite side`);
        assert.ok(Game.dctx.stats.stroke > strokes, `${label}: slam should crack the floor`);
        assert.equal(v.state, 'ragdoll', `${label}: victim should remain knocked down`);
        assert.ok(v.rag.t < 0.2 && v.dizzyAlpha > 0.2, `${label}: slam should extend stun`);
        assert.equal(v.grabbedBy, null);
        assert.equal(v.rag.pin, null);
        if (skin === 'negan') assert.ok(a.rig.bd && !a.batLost, 'Lucille should return after the slam');
      }
    }
  }
});

test('hits, lasers, trips and KOs release an active grab', () => {
  for (const kind of ['hit', 'laser', 'trip', 'ko', 'victim-ko']) {
    seedRandom(12345);
    Game.init(); Game.autoSpawn = false; Game.fighters = [];
    const { a, v } = grabPair('negan', 1, true);
    assert.equal(a.startGrabPrep(v, 1), true);
    for (let i = 0; i < 120 && !v.rag.pin; i++) Game.update(1 / 60);
    assert.ok(v.rag.pin, `${kind}: expected the victim to be held`);
    const enemy = fighter(280, 1, 'homelander');
    if (kind === 'hit') a.takeHit(enemy, { dmg: 8, zone: 'torso', pw: 0.4, stun: 0.25, kb: 90 });
    if (kind === 'laser') a.takeLaser(enemy, a.rig.pel, true);
    if (kind === 'trip') enemy.trip(a);
    if (kind === 'ko') Game.ko(a, enemy, { lvx: 300, lvy: 400, pw: 1 });
    if (kind === 'victim-ko') Game.ko(v, enemy, { lvx: 300, lvy: 400, pw: 1 });
    assert.equal(a.grabTarget, null, `${kind}: attacker must release target`);
    assert.equal(v.grabbedBy, null, `${kind}: victim must be unlocked`);
    assert.equal(v.rag.pin, null, `${kind}: ragdoll must be unpinned`);
    if (kind === 'ko' || kind === 'victim-ko') {
      Game.clearBodies();
      assert.ok(!Game.fighters.includes(kind === 'ko' ? a : v));
    }
  }
});

test('a lethal slam preserves the ragdoll, and the throw cannot be aimed into a wall', () => {
  const { a, v } = grabPair('negan', 1, true);
  v.hp = 10;
  const kills = Game.koCount;
  assert.equal(a.startGrabPrep(v, 1), true);
  for (let i = 0; i < 360; i++) {
    Game.update(1 / 60);
    if (v.hp <= 0 && a.state === 'idle') break;
  }
  assert.equal(v.hp, 0);
  assert.equal(v.state, 'ragdoll');
  assert.ok(v.rag && !v.rag.pin);
  assert.equal(Game.koCount, kills + 1);
  const wallVictim = groundedVictim(235);
  const wallAttacker = fighter(190, 1);
  assert.equal(wallAttacker.canThrowFromHere(wallVictim), false);
  assert.equal(wallAttacker.startGrabPrep(wallVictim, 1), false);
});

test('the autonomous fighter can choose and approach a grounded target', () => {
  const { a, v } = grabPair();
  v.rag.settle = 0.1;
  Math.random = () => 0.01;
  a.autopilot.update(1 / 60, a, v, [a, v]);
  assert.equal(a.autopilot.mode, 'grab_approach');
  for (let i = 0; i < 60 && a.state !== 'grab_prep'; i++) Game.update(1 / 60);
  assert.equal(a.state, 'grab_prep');
  assert.equal(v.grabbedBy, a);
});

test('the AI can reconsider a knockdown after moving into range', () => {
  const { a, v } = grabPair();
  Math.random = () => 0.01;
  a.x = v.x - 380;
  a.autopilot.update(1 / 60, a, v, [a, v]);
  assert.notEqual(a.autopilot.grabChecked, v.rag.id, 'out-of-range targets must not consume the decision');
  a.x = v.x - 70;
  a.autopilot.setMode('engage');
  a.autopilot.update(1 / 60, a, v, [a, v]);
  assert.equal(a.autopilot.mode, 'grab_approach');
  assert.equal(a.autopilot.grabChecked, v.rag.id);
});

test('autonomous matches maintain finite physics and valid grab ownership', () => {
  for (const seed of [11, 982451653]) {
    seedRandom(seed);
    Game.init();
    for (let frame = 0; frame < 5400; frame++) {
      Game.update(1 / 60);
      if (frame % 60 === 0) Game.render();
      for (const f of Game.fighters) {
        assert.ok(Number.isFinite(f.x) && Number.isFinite(f.y) && Number.isFinite(f.hp), `invalid fighter at frame ${frame}`);
        if (f.grabTarget) assert.equal(f.grabTarget.grabbedBy, f, `broken grab target at frame ${frame}`);
        if (f.grabbedBy) assert.equal(f.grabbedBy.grabTarget, f, `broken grab owner at frame ${frame}`);
        if (f.rag) for (const p of Object.values(f.rag.p)) {
          assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `invalid ragdoll at frame ${frame}`);
        }
      }
    }
  }
});
