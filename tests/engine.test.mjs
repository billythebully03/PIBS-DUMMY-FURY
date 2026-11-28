import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, afterEach, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

// Exercise the actual game engine without requiring a browser or exposing its
// internal classes in the production bundle. Canvas methods are instrumented so
// rendering exceptions and important draw calls remain observable.
function makeCanvas(width = 960, height = 540) {
  const canvas = { width, height, style: {} };
  const stats = { drawImage: 0, fillRect: 0, rect: 0, fill: 0, stroke: 0, arc: 0, ellipse: 0, clip: 0, colors: new Set(), composites: new Set(), texts: [] };
  let fillStyle = '#000';
  let strokeStyle = '#000';
  let composite = 'source-over';
  const ctx = {
    canvas, stats,
    get fillStyle() { return fillStyle; },
    set fillStyle(value) { fillStyle = value; stats.colors.add(value); },
    get strokeStyle() { return strokeStyle; },
    set strokeStyle(value) { strokeStyle = value; stats.colors.add(value); },
    get globalCompositeOperation() { return composite; },
    set globalCompositeOperation(value) { composite = value; stats.composites.add(value); },
    save() {}, restore() {}, setTransform() {}, transform() {}, translate() {},
    rotate() {}, scale() {}, clearRect() {}, beginPath() {}, closePath() {}, rect() { stats.rect++; }, clip() { stats.clip++; },
    moveTo() {}, lineTo() {}, quadraticCurveTo() {}, bezierCurveTo() {},
    ellipse() { stats.ellipse++; }, fill() { stats.fill++; }, fillText(text, x, y) { stats.texts.push({ text, x, y, color: fillStyle, font: this.font }); },
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
// Bundle the small audience/blood modules with the real engine while keeping
// the test-only exports out of the production entry point.
const { outputFiles } = await build({
  stdin: {
    contents: `${source}\nexport { Game, Fighter, surfacePoint, locateSurface, stainedSkinSprite, addLaserRip, drawLimbRips, drawBeam, drawEyeGlow, drawSkinHead, skinHeads, Snd, BRIDGE_TACKLE_CHANCE, fighterStillFalling, SK_, Audience, BloodField, HEAD_URL, WORLD_TOP, BRIDGE_Y, laserCutGeometry, makeLaserPieces, updateGorePieces, goreSurfacePoint, gorePartCanvas, updateDucks, launchDuck };`,
    resolveDir: fileURLToPath(new URL('../src/game/', import.meta.url)), sourcefile: 'engine.ts', loader: 'ts',
  },
  bundle: true, write: false, platform: 'browser', format: 'esm', target: 'es2020',
});
const { startGame, Game, Fighter, surfacePoint, locateSurface, stainedSkinSprite, addLaserRip, drawLimbRips, drawBeam, drawEyeGlow, drawSkinHead, skinHeads, Snd, BRIDGE_TACKLE_CHANCE, fighterStillFalling, SK_, Audience, BloodField, HEAD_URL, WORLD_TOP, BRIDGE_Y, laserCutGeometry, makeLaserPieces, updateGorePieces, goreSurfacePoint, gorePartCanvas, updateDucks, launchDuck } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
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

test('the laser is red, and its varied rounded sparks fly outward and fade without adding blood', () => {
  const beam = makeCanvas().getContext('2d');
  drawBeam(beam, { sx: 120, sy: 190, ex: 430, ey: 300, surf: 'body', age: .15 });
  assert.ok(beam.stats.colors.has('#ff263e') && beam.stats.colors.has('rgba(255,12,42,.32)'));
  assert.equal(beam.stats.fillRect, 0, 'the impact flare is rounded, not a square');
  assert.equal(beam.stats.ellipse, 3);
  const shooter = fighter(250, 1, 'homelander');
  shooter.startAttack(3); shooter.st = .2;
  const glow = makeCanvas().getContext('2d'); drawEyeGlow(glow, shooter);
  assert.equal(glow.stats.fillRect, 0); assert.equal(glow.stats.ellipse, 3);

  const fx = Game.fx, random = Math.random, version = fx.bloodField.version;
  try {
    Math.random = () => { throw new Error('laser particles must not consume combat RNG'); };
    fx.laserSpark(400, Game.gy + 3, 30, 'floor');
    const particles = fx.laserSparks.map(p => ({ ...p }));
    assert.equal(particles.length, 30);
    assert.ok(particles.every(p => p.vy < 0 && p.radius >= 2.3 && p.radius <= 4.4 && p.aspect >= .75 && p.aspect <= 1.15));
    assert.ok(new Set(particles.map(p => p.radius)).size > 5, 'sizes and directions vary');
    fx.update(.08);
    assert.ok(fx.laserSparks.every((p, i) => p.y < particles[i].y && p.life < particles[i].life));
    const g = makeCanvas().getContext('2d'); fx.drawLaserSparks(g);
    assert.equal(g.stats.fillRect, 0, 'laser particles are not square');
    assert.equal(g.stats.ellipse, 30);
    assert.ok([...g.stats.colors].every(c => c.startsWith('rgba(255,')));
    assert.equal(Game.laserLayer.scale, Game.S, 'small ellipses are not reduced to a single square pixel');
    Game.render(); assert.ok(Game.laserLayer.ctx.stats.ellipse >= 30);
    fx.update(.5);
    assert.equal(fx.laserSparks.length, 0, 'all sparks disappear in flight');
    assert.equal(fx.bloodField.version, version, 'sparks never create blood deposits');
  } finally { Math.random = random; }
});

function spreadRig(dir = 1) {
  const points = {
    head: [500, 165], neck: [500, 200], sh: [500, 200], pel: [500, 270],
    eN: [565, 200], wN: [600, 220], eF: [435, 200], wF: [400, 220],
    kN: [540, 320], aN: [560, 380], kF: [460, 320], aF: [440, 380],
  };
  const rig = { dir, cN: 1, cF: 1, mo: 0, ey: 0, bd: null, fdN: { x: dir, y: 0 }, fdF: { x: dir, y: 0 } };
  for (const [name, [x, y]] of Object.entries(points)) rig[name] = { x: 500 + (x - 500) * dir, y };
  return rig;
}

test('real laser rays cut the struck sleeves and trouser segments, in both directions', () => {
  const rays = {
    uN: [535, 170], fN: [585, 170], uF: [465, 170], fF: [415, 170],
    tN: [524, 260], sN: [550, 330], tF: [476, 260], sF: [450, 330],
  };
  const random = Math.random;
  try {
    for (const skin of ['jane', 'negan', 'homelander', 'saul']) for (const dir of [1, -1])
      for (const [part, [rx, ry]] of Object.entries(rays)) {
        Game.fighters = [];
        const shooter = fighter(180, 1, 'homelander'), victim = fighter(500, dir, skin);
        disableAI(shooter, victim); victim.rig = spreadRig(dir);
        Math.random = () => .01;
        const hit = Game.castRay(500 + (rx - 500) * dir, ry, 0, 1, shooter);
        assert.equal(hit.f, victim, `${skin}/${dir}/${part}: the real ray must hit a body`);
        const surface = locateSurface(victim.rig, hit.x, hit.y);
        assert.equal(surface.seg, part, `${skin}/${dir}/${part}: the actual struck segment is identified`);
        victim.takeLaser(shooter, hit, true);
        const rip = victim.wounds.rips.find(r => r.laser && r.part === part);
        assert.ok(rip, `${skin}/${dir}/${part}: a laser can actually tear this garment`);
        assert.ok(victim.wounds[part].some(w => w.k === 'bruise'), 'injury is anchored to the struck segment');
        const layer = /^([uf])N$/.test(part) ? Game.frontLayer.ctx : Game.bodyLayer.ctx;
        const clips = layer.stats.clip;
        Game.render();
        assert.ok(layer.stats.clip > clips, `${part} is painted and clipped on its own limb`);
      }
  } finally { Math.random = random; }
});

test('continued laser contact can cut clothing, but bare legs are not invented trousers', () => {
  const shooter = fighter(180, 1, 'homelander'), victim = fighter(500, 1, 'jane');
  disableAI(shooter, victim); victim.rig = spreadRig();
  const hit = Game.castRay(535, 170, 0, 1, shooter), random = Math.random;
  try {
    Math.random = () => .99; victim.takeLaser(shooter, hit, true);
    assert.equal(victim.wounds.rips.length, 0, 'the first pulse does not always tear');
    Math.random = () => .01; victim.takeLaser(shooter, hit, false);
    assert.equal(victim.wounds.rips[0].part, 'uN', 'later pulses can tear the actual sleeve');
    const protectedFighter = fighter(500, 1, 'negan'); protectedFighter.rig = spreadRig(); protectedFighter.invT = .3;
    protectedFighter.takeLaser(shooter, hit, true);
    assert.equal(protectedFighter.hp, 100); assert.equal(protectedFighter.wounds.rips.length, 0, 'invulnerability prevents persistent tears');
    const walt = fighter(700, -1, 'walt');
    assert.equal(addLaserRip(walt, { seg: 'tN', t: .5, s: 0 }), false, 'bare thigh is not cloth');
    assert.equal(addLaserRip(walt, { seg: 'sF', t: .4, s: 0 }), false, 'bare shin is not cloth');
    assert.equal(addLaserRip(walt, { seg: 'tN', t: .12, s: 0 }), true, 'his actual shorts can tear');
    assert.equal(addLaserRip(walt, { seg: 'sF', t: .8, s: 0 }), true, 'his actual sock can tear');
    assert.ok(walt.wounds.rips.every(r => r.under === '#D89B72'));
  } finally { Math.random = random; }
});

test('laser holes have uneven edges and remain clipped and oriented with moving limbs', () => {
  const f = fighter(450, 1, 'jane');
  f.wounds.rips.push({ part: 'tN', t: .5, offset: 2, laser: true, size: 12,
    angle: .1, cloth: '#50555E', under: '#B58C73', phase: 1.7 });
  const g = makeCanvas().getContext('2d'), positions = [], rotations = [], lines = [];
  g.translate = (x, y) => positions.push([x, y]); g.rotate = a => rotations.push(a); g.lineTo = (x, y) => lines.push([x, y]);
  const a = { x: 400, y: 300 }, b = { x: 420, y: 340 };
  drawLimbRips(g, { dir: 1 }, f, 'tN', a, b, 10);
  assert.equal(g.stats.clip, 1); assert.ok(lines.length > 15, 'the hole has an irregular outline, not four rectangular edges');
  const first = positions[0], angle = rotations[0];
  positions.length = 0; rotations.length = 0;
  drawLimbRips(g, { dir: -1 }, f, 'tN', { x: 550, y: 270 }, { x: 510, y: 280 }, 10);
  assert.ok(distance({ x: first[0], y: first[1] }, { x: positions[0][0], y: positions[0][1] }) > 50);
  assert.ok(Math.abs(rotations[0] - angle) > .5, 'the tear rotates and flips with the segment');
});

test('a firing laser emits sparks at fighter, floor and wall impact points', () => {
  const shooter = fighter(230, 1, 'homelander'), victim = fighter(500, -1, 'jane');
  disableAI(shooter, victim); shooter.startAttack(3); shooter.st = .6;
  const fx = Game.fx, emitted = [], spark = fx.laserSpark.bind(fx), cast = Game.castRay;
  fx.laserSpark = (...args) => { emitted.push(args); spark(...args); };
  try {
    shooter.updateLaser(1 / 60, [shooter, victim], victim);
    assert.ok(emitted.length && emitted[0][3] === 'body', 'a real ray strikes the fighter');
    assert.ok(Math.hypot(emitted[0][0] - shooter.lz.ex, emitted[0][1] - shooter.lz.ey) < 1e-6);
    for (const surf of ['floor', 'wall']) {
      const point = surf === 'floor' ? { x: 620, y: Game.gy + 3 } : { x: Game.W - 34, y: 250 };
      Game.castRay = () => ({ ...point, surf, f: null }); shooter.lz = null;
      shooter.updateLaser(1 / 60, [shooter, victim], victim);
      const last = emitted.at(-1);
      assert.deepEqual([last[0], last[1], last[3]], [point.x, point.y, surf]);
      assert.ok(fx.marks.some(m => m.surf === surf), `${surf} also receives a scorch`);
    }
  } finally { fx.laserSpark = spark; Game.castRay = cast; }
});

test('Homelander glides in combat with airborne feet and anatomically bent legs in both directions', () => {
  for (const dir of [1, -1]) {
    const f = fighter(dir === 1 ? 300 : 660, dir, 'homelander');
    f.state = 'run'; f.ctrl.mx = dir; f.ctrl.run = true;
    const threat = { x: f.x + dir * 300 };
    const dash = f.fx.dash.bind(f.fx), groundDust = [];
    f.fx.dash = (x, y, d) => { groundDust.push(y); dash(x, y, d); };
    for (let i = 0; i < 40; i++) f.update(1 / 60, threat, [f]);
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

function disableAI(...fighters) {
  for (const f of fighters) f.autopilot.update = () => {};
}

function tick(seconds, dt = 1 / 60) {
  for (let i = 0; i < Math.round(seconds / dt); i++) Game.update(dt);
}

// Start with the missed puncher stumbling in front of the fighter who dodged.
// Their real flank animation must complete before the hold can be established.
function heldPair({ dir = 1, reverseOrder = false, dt = 1 / 60, holderSkin = 'jane', victimSkin = 'walt' } = {}) {
  const x = Game.W / 2;
  let victim, holder;
  if (reverseOrder) {
    holder = fighter(x + dir * 105, -dir, holderSkin);
    victim = fighter(x, dir, victimSkin);
  } else {
    victim = fighter(x, dir, victimSkin);
    holder = fighter(x + dir * 105, -dir, holderSkin);
  }
  disableAI(victim, holder);
  victim.startOverextend(holder);
  assert.equal(holder.startFlank(victim), true);
  advanceUntil(() => holder.state === 'choke', 120, dt);
  assert.equal(victim.state, 'choked');
  holder.chokeCounterAt = Infinity;
  holder.chokeReleaseAt = Infinity;
  holder.chokeDuration = 2.4;
  tick(.25, dt);
  return { holder, victim };
}

const punch = { dmg: 5, zone: 'head', pw: .4, stun: .34, kb: 95 };
const launchPunch = { dmg: 11, zone: 'head', pw: 1, launch: true, lvx: 285, lvy: 700 };

test('the NPC boxing combo uses opposite fists, a short gap and its own cooldown', () => {
  for (const skin of ['jane', 'negan', 'homelander']) {
    Game.fighters = [];
    const f = fighter(370, 1, skin), opponent = fighter(680, -1);
    disableAI(f, opponent);
    assert.equal(f.startBoxing(), true);
    assert.equal(f.atk.fist, 'N');
    const first = f.atk, firstStamp = f.atkStamp;
    let gapSeen = false, transition = -1;
    for (let i = 1; i <= 60; i++) {
      Game.update(1 / 60);
      if (f.ak === 0 && f.st >= first.dur) gapSeen = true;
      if (f.ak === 1 && f.state === 'attack') { transition = i / 60; break; }
    }
    assert.ok(gapSeen, `${skin} should visibly recover briefly between punches`);
    assert.ok(transition >= .47 && transition < .53, `second punch at ${transition}s`);
    assert.equal(f.atk.fist, 'F');
    assert.equal(f.atkStamp, firstStamp + 1);
    advanceUntil(() => f.state === 'idle', 60);
    assert.equal(f.startBoxing(), false, 'combo cooldown must prevent instant repetition');
    if (skin === 'negan') {
      const count = Game.batLayer.ctx.stats.drawImage;
      Game.render();
      assert.ok(Game.batLayer.ctx.stats.drawImage > count, 'Lucille remains visible after boxing');
      assert.equal(f.batLost, false);
    }
  }
});

test('a front guard absorbs ordinary punches; powerful or lethal blows cause a back-hop rather than ragdoll', () => {
  for (const dir of [1, -1]) {
    Game.fighters = [];
    const defender = fighter(480, dir), attacker = fighter(480 + dir * 85, -dir);
    disableAI(defender, attacker);
    assert.equal(defender.startGuard(attacker), true);
    tick(.12);
    for (const side of ['N', 'F']) {
      const r = defender.rig, wrist = r[`w${side}`], elbow = r[`e${side}`];
      assert.ok(distance(wrist, r.sh) > 40 && distance(wrist, r.sh) < 62, 'guard hands are extended but not locked');
      assert.ok(kneeAngle(r.sh, elbow, wrist) > 80 && kneeAngle(r.sh, elbow, wrist) < 150, 'guard elbows remain bent');
      assert.ok((wrist.x - r.head.x) * dir > 35, 'hands stay in front of the face');
    }
    const smoke = Game.fx.sm.length, blood = Game.fx.bl.length;
    defender.takeHit(attacker, punch);
    assert.equal(defender.hp, 100);
    assert.equal(defender.state, 'guard', 'an ordinary block should stay in guard');
    assert.ok(Game.fx.sm.length >= smoke + 4, 'blocked impact produces a little dust');
    assert.equal(Game.fx.bl.length, blood, 'blocked punch should not cause blood');
    defender.takeHit(attacker, launchPunch);
    assert.equal(defender.state, 'guard_recoil');
    assert.equal(defender.rag, null);
    assert.ok(defender.vx * dir < 0 && defender.vy > 0);
    assert.ok(defender.hp > 0 && defender.hp < 100);
    advanceUntil(() => defender.state === 'idle', 120);
    assert.equal(defender.startGuard(attacker), false, 'guard has a cooldown');

    defender.guardCD = 0; defender.hp = 3;
    assert.equal(defender.startGuard(attacker), true);
    defender.takeHit(attacker, punch);
    assert.equal(defender.state, 'guard_recoil');
    assert.ok(defender.hp >= 1, 'a blocked lethal punch must not cause an instant KO');
    assert.equal(Game.koCount, 0);
  }
});

test('guard only faces the incoming attacker: a punch from behind interrupts it', () => {
  for (const dir of [1, -1]) {
    Game.fighters = [];
    const defender = fighter(480, dir), front = fighter(480 + dir * 90, -dir);
    const rear = fighter(480 - dir * 80, dir);
    disableAI(defender, front, rear);
    defender.startGuard(front);
    defender.takeHit(rear, punch);
    assert.equal(defender.hp, 95);
    assert.equal(defender.state, 'hit');
  }
});

test('a held guard blocks a series for about two seconds and can be chosen before an attack', () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) for (const dir of [1, -1]) {
    Game.fighters = [];
    const defender = fighter(480, dir), attacker = fighter(480 + dir * 90, -dir);
    disableAI(defender, attacker);
    const random = Math.random;
    try { Math.random = () => .5; assert.equal(defender.startGuard(attacker), true); }
    finally { Math.random = random; }
    assert.ok(defender.guardDur >= 1.7 && defender.guardDur <= 2.4);
    assert.equal(defender.guardCD, 2.4, 'the existing guard cooldown range is unchanged');
    for (let hit = 0; hit < 3; hit++) {
      tick(.45, dt);
      defender.takeHit(attacker, punch);
      assert.equal(defender.state, 'guard');
      assert.equal(defender.hp, 100, `punch ${hit + 1} is blocked`);
    }
    advanceUntil(() => defender.state === 'idle', Math.ceil(2 / dt), dt);
  }
  {
    Game.fighters = [];
    const defender = fighter(480, 1), boxer = fighter(565, -1); disableAI(defender, boxer);
    let blocked = 0; const hit = defender.takeHit.bind(defender);
    defender.takeHit = (...args) => { if (defender.state === 'guard') blocked++; return hit(...args); };
    assert.equal(defender.startGuard(boxer), true);
    assert.equal(boxer.startBoxing(), true);
    advanceUntil(() => boxer.state === 'idle', 180);
    assert.equal(blocked, 2, 'the actual two-punch combo strikes the same held guard twice');
    assert.equal(defender.hp, 100); assert.equal(defender.state, 'guard');
  }
  {
    Game.fighters = [];
    const defender = fighter(400, 1), attacker = fighter(580, -1); disableAI(attacker);
    const ai = defender.autopilot;
    ai.lampCheck = ai.farCD = ai.attackWait = ai.hopCD = 100;
    const random = Math.random;
    try { Math.random = () => 0; ai.update(1 / 60, defender, attacker, Game.fighters); }
    finally { Math.random = random; }
    assert.equal(attacker.state, 'idle');
    assert.equal(defender.state, 'guard', 'guard may be raised before an attack starts');
  }
});

test('a shove winds both arms back, extends them together, and can end in balance or a fall', () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) for (const dir of [1, -1]) for (const falls of [false, true]) {
    Game.fighters = [];
    const attacker = fighter(480 - dir * 40, dir, 'negan'), victim = fighter(480 + dir * 40, -dir, 'walt');
    disableAI(attacker, victim);
    const random = Math.random, startX = victim.x;
    try {
      Math.random = () => falls ? 0 : .99;
      assert.equal(attacker.startShove(victim), true);
      tick(.1, dt);
      for (const side of ['N', 'F']) {
        const r = attacker.rig;
        assert.ok((r[`e${side}`].x - r.sh.x) * dir < -20, 'the bent elbow winds back');
        assert.ok(kneeAngle(r.sh, r[`e${side}`], r[`w${side}`]) < 100, 'the elbow is bent before the push');
      }
      advanceUntil(() => victim.state === 'push_stagger', Math.ceil(1 / dt), dt);
      for (const side of ['N', 'F']) {
        const r = attacker.rig;
        assert.ok((r[`w${side}`].x - r.sh.x) * dir > 55, 'the hand shoots forward');
        assert.ok(kneeAngle(r.sh, r[`e${side}`], r[`w${side}`]) > 160, 'the arm straightens at impact');
      }
      assert.equal(victim.hp, 100, 'a push is not a damaging punch');
      assert.equal(victim.shoveWillFall, falls);
    } finally { Math.random = random; }
    tick(.3, dt);
    assert.ok((victim.x - startX) * dir > 15, 'the victim stumbles away from the attacker');
    advanceUntil(() => victim.state === (falls ? 'ragdoll' : 'idle'), Math.ceil(3 / dt), dt);
    assert.equal(victim.hp, 100);
    assert.equal(attacker.startShove(victim), false, 'the new move cannot be spammed');
  }
});

test('all heroes can shove and be shoved in either direction without breaking their rigs', () => {
  const skins = ['jane', 'negan', 'homelander', 'walt', 'saul'];
  for (const dt of [1 / 30, 1 / 120]) for (const dir of [1, -1]) for (let i = 0; i < skins.length; i++) {
    Game.fighters = [];
    const attacker = fighter(480 - dir * 40, dir, skins[i]);
    const victim = fighter(480 + dir * 40, -dir, skins[(i + 1) % skins.length]);
    disableAI(attacker, victim);
    const random = Math.random;
    try {
      Math.random = () => i % 2 ? 0 : .99;
      assert.equal(attacker.startShove(victim), true);
      advanceUntil(() => victim.state === 'push_stagger', Math.ceil(1 / dt), dt);
    } finally { Math.random = random; }
    assert.equal(victim.staggerDir, dir);
    advanceUntil(() => ['idle', 'ragdoll'].includes(victim.state), Math.ceil(3 / dt), dt);
    for (const p of [attacker.rig.head, attacker.rig.wN, attacker.rig.wF, victim.rig.head, victim.rig.pel]) {
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
    }
    Game.render();
  }
});

test('a falling shove victim comes to rest on their back, away from the push', () => {
  for (const dir of [1, -1]) {
    Game.fighters = [];
    const attacker = fighter(480 - dir * 40, dir), victim = fighter(480 + dir * 40, -dir);
    disableAI(attacker, victim);
    const random = Math.random;
    try { Math.random = () => 0; victim.receiveShove(attacker); }
    finally { Math.random = random; }
    assert.equal(victim.shoveWillFall, true);
    advanceUntil(() => victim.state === 'ragdoll', 180);
    const rag = victim.rag;
    for (let i = 0; i < 150; i++) rag.update(1 / 60);
    assert.ok((rag.p.head.x - rag.p.pel.x) * dir > 20, 'the head falls behind the hips');
  }
});

test('a follow-up hit during either backward stagger immediately causes a ragdoll', () => {
  for (const kind of ['push_stagger', 'stagger_fall']) for (const dir of [1, -1]) {
    Game.fighters = [];
    const attacker = fighter(480 - dir * 40, dir), victim = fighter(480 + dir * 40, -dir);
    disableAI(attacker, victim);
    if (kind === 'push_stagger') {
      const random = Math.random;
      try { Math.random = () => .99; victim.receiveShove(attacker); }
      finally { Math.random = random; }
      assert.equal(victim.shoveWillFall, false, 'even a recoverable push becomes a fall when hit');
    } else victim.startStagger();
    tick(.2);
    victim.takeHit(attacker, punch);
    assert.equal(victim.state, 'ragdoll', kind);
    assert.equal(victim.hp, 95);
    assert.ok((victim.rag.p.pel.x - victim.rag.p.pel.px) * dir > 0);
  }
});

test('a shove respects a front guard, a missed target, and interruption', () => {
  {
    const attacker = fighter(400, 1), victim = fighter(480, -1); disableAI(attacker, victim);
    victim.startGuard(attacker);
    attacker.startShove(victim); tick(.4);
    assert.equal(victim.state, 'guard'); assert.equal(victim.hp, 100);
  }
  {
    Game.fighters = [];
    const attacker = fighter(400, 1), victim = fighter(480, -1); disableAI(attacker, victim);
    attacker.startShove(victim); victim.x = 650; tick(.4);
    assert.equal(victim.state, 'idle', 'moving out of reach avoids contact');
  }
  {
    Game.fighters = [];
    const attacker = fighter(400, 1), victim = fighter(480, -1), third = fighter(320, 1);
    disableAI(attacker, victim, third);
    attacker.startShove(victim); attacker.takeHit(third, punch); tick(.6);
    assert.equal(attacker.shoveTarget, null);
    assert.equal(victim.state, 'idle', 'an interrupted wind-up never lands');
  }
  {
    Game.fighters = [];
    const attacker = fighter(400, 1), victim = fighter(480, -1); disableAI(attacker, victim);
    attacker.startShove(victim); Game.fighters = Game.fighters.filter(f => f !== victim); tick(.6);
    assert.equal(attacker.shoveTarget, null);
    assert.equal(victim.state, 'idle', 'removing a target cannot leave a ghost shove');
  }
});

test('AI may follow a connected normal punch with a shove', () => {
  const attacker = fighter(400, 1), victim = fighter(480, -1); disableAI(victim);
  const ai = attacker.autopilot;
  ai.attackWait = ai.farCD = ai.lampCheck = ai.hopCD = 100;
  attacker.startAttack(0);
  advanceUntil(() => attacker.state === 'idle' && attacker.connected, 120);
  assert.equal(attacker.lastHitTarget, victim); assert.equal(victim.hp, 95);
  const random = Math.random;
  try {
    Math.random = () => 0;
    advanceUntil(() => attacker.state === 'shove', 100);
    assert.equal(attacker.shoveTarget, victim);
    advanceUntil(() => victim.state === 'push_stagger', 100);
  } finally { Math.random = random; }
  assert.equal(victim.hp, 95, 'the follow-up push does not replace the original punch');
});

test('interrupted attacks and airborne dives cannot leave a stale shove or dive queued', () => {
  {
    const attacker = fighter(400, 1), victim = fighter(480, -1), third = fighter(315, 1);
    disableAI(victim, third);
    const ai = attacker.autopilot; ai.attackWait = ai.farCD = ai.lampCheck = ai.hopCD = 100;
    attacker.startAttack(0);
    advanceUntil(() => attacker.connected && attacker.state === 'attack', 90);
    attacker.takeHit(third, punch);
    const random = Math.random;
    try {
      Math.random = () => 0;
      advanceUntil(() => attacker.state === 'idle', 180);
      ai.update(1 / 60, attacker, victim, Game.fighters);
    } finally { Math.random = random; }
    assert.equal(ai.pendingShove, null, 'a broken attack is not treated as a completed hit');
    assert.notEqual(attacker.state, 'shove');
  }
  {
    Game.fighters = [];
    const attacker = fighter(400, 1), victim = fighter(480, -1); disableAI(attacker, victim);
    victim.startDive();
    assert.equal(victim.receiveShove(attacker), true);
    assert.equal(victim.state, 'push_stagger');
    assert.equal(victim.dive, false, 'a push cancels the interrupted airborne attack');
  }
});

test('a dodged punch can overextend only on a miss, and the defender can autonomously flank it', () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
    for (const dir of [1, -1]) {
      Game.fighters = [];
      const attacker = fighter(480 - dir * 55, dir), dodger = fighter(480 + dir * 55, -dir);
      disableAI(attacker);
      dodger.autopilot.attackWait = 20;
      Math.random = () => 0; // choose overextension and the single flank decision
      attacker.startAttack(0);
      dodger.startHop();
      advanceUntil(() => attacker.state === 'overextend', 90, dt);
      assert.equal(attacker.connected, false);
      assert.equal(attacker.overextendFor, dodger);
      assert.ok(attacker.vx * dir > 0, 'the missed swing carries the attacker forward');
      advanceUntil(() => dodger.state === 'flank' || dodger.state === 'choke', 150, dt);
      if (dodger.state === 'flank') advanceUntil(() => dodger.state === 'choke', 90, dt);
      assert.equal(attacker.state, 'choked');
      assert.equal(dodger.chokeTarget, attacker);
      assert.ok((attacker.x - dodger.x) * dir > 0, 'holder is behind the stumbling fighter');
      assert.equal(dodger.dir, dir, 'holder turns to face the same way as the victim');
    }
  }
});

test('whiffs without a dodge, and swings that hit a different fighter, do not trigger a stumble', () => {
  Math.random = () => 0;
  let attacker = fighter(300, 1), target = fighter(650, -1);
  disableAI(attacker, target);
  attacker.startAttack(0); tick(.3);
  assert.notEqual(attacker.state, 'overextend');
  Game.fighters = [];
  attacker = fighter(380, 1);
  const bystander = fighter(455, -1), dodger = fighter(490, -1);
  disableAI(attacker, bystander, dodger);
  attacker.startAttack(0); dodger.startHop(); tick(.3);
  assert.equal(attacker.connected, true);
  assert.notEqual(attacker.state, 'overextend');
  assert.equal(bystander.hp, 95);
});

test('a choke keeps both hands around the lower, bent victim while allowing a small struggle and shuffle', () => {
  for (const dir of [1, -1]) for (const reverseOrder of [false, true]) {
    Game.fighters = [];
    const { holder, victim } = heldPair({ dir, reverseOrder });
    let min = holder.x, max = holder.x, handMotion = 0;
    const initialHand = { x: victim.rig.wN.x - victim.rig.neck.x, y: victim.rig.wN.y - victim.rig.neck.y };
    for (let i = 0; i < 45; i++) {
      Game.update(1 / 60);
      min = Math.min(min, holder.x); max = Math.max(max, holder.x);
      handMotion = Math.max(handMotion, distance(initialHand, { x: victim.rig.wN.x - victim.rig.neck.x, y: victim.rig.wN.y - victim.rig.neck.y }));
      assert.ok(Math.abs((victim.x - holder.x) * dir - 48) < .01, 'pair position should not depend on fighter update order');
      assert.ok(distance(holder.rig.wN, victim.rig.neck) < 17, 'near hand remains on neck');
      assert.ok(distance(holder.rig.wF, victim.rig.neck) < 17, 'far hand remains on neck');
    }
    assert.ok(max - min > 2 && max - min < 25, 'pair can shuffle slightly');
    assert.ok(handMotion > 2, 'victim hands visibly struggle');
    assert.ok(victim.rig.pel.y > holder.rig.pel.y + 12, 'victim is visibly lower');
    assert.ok((victim.rig.head.x - holder.rig.head.x) * dir > 20, 'both heads remain visible rather than overlapping');
    for (const suffix of ['N', 'F']) {
      assert.ok(kneeAngle(victim.rig.pel, victim.rig[`k${suffix}`], victim.rig[`a${suffix}`]) < 155, 'victim knees are bent');
      assert.ok(kneeCross(victim.rig, suffix) < 0, 'victim knees bend anatomically');
    }
    Game.render();
  }
});

test('a completed choke deals small passive damage and produces a longer temporary ragdoll', () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
    Game.fighters = [];
    const { holder, victim } = heldPair({ dt });
    const duration = holder.chokeDuration;
    advanceUntil(() => victim.state === 'ragdoll', Math.ceil(4 / dt), dt);
    assert.equal(holder.state, 'idle');
    assert.equal(holder.chokeTarget, null);
    assert.equal(victim.chokedBy, null);
    assert.equal(victim.rag.stunScale, 1.5);
    assert.ok(victim.hp > 93 && victim.hp < 96, `passive damage was ${100 - victim.hp}`);
    assert.ok(duration >= 2 && duration <= 3);
    const rag = victim.rag;
    advanceUntil(() => victim.state === 'getup', Math.ceil(8 / dt), dt);
    assert.ok(rag.t >= 1.35, 'the minimum ragdoll stun is 1.5 times the usual .9 seconds');
  }
});

test('voluntary release, punches, lasers and knockout all break both ends of a choke', () => {
  for (const cause of ['release', 'hit-holder', 'hit-victim', 'laser', 'ko-holder', 'ko-victim', 'removed-holder']) {
    Game.fighters = []; Game.koCount = 0;
    const { holder, victim } = heldPair();
    const third = fighter(280, 1, 'homelander');
    disableAI(third);
    if (cause === 'release') holder.releaseChoke(true);
    if (cause === 'hit-holder') holder.takeHit(third, punch);
    if (cause === 'hit-victim') victim.takeHit(third, punch);
    if (cause === 'laser') holder.takeLaser(third, holder.rig.head, true);
    if (cause === 'ko-holder') { holder.hp = 4; holder.takeHit(third, punch); }
    if (cause === 'ko-victim') { victim.hp = .01; Game.update(1 / 60); }
    if (cause === 'removed-holder') { Game.fighters = Game.fighters.filter(f => f !== holder); Game.update(1 / 60); }
    assert.equal(holder.chokeTarget, null, `${cause}: holder link`);
    assert.equal(victim.chokedBy, null, `${cause}: victim link`);
    assert.notEqual(holder.state, 'choke', `${cause}: holder state`);
    assert.notEqual(victim.state, 'choked', `${cause}: victim state`);
    if (cause.startsWith('ko-')) assert.equal(Game.koCount, 1);
  }
});

test('only the remaining cooldown after a choke is doubled, on completion or any interruption', () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) for (const cause of ['release', 'hit-holder', 'hit-victim', 'complete', 'counter']) {
    Game.fighters = [];
    const { holder, victim } = heldPair({ dt });
    const third = fighter(200, 1); disableAI(third);
    assert.equal(holder.chokeCooldownPending, true);
    const before = holder.chokeCD;
    if (cause === 'release') holder.releaseChoke();
    if (cause === 'hit-holder') holder.takeHit(third, punch);
    if (cause === 'hit-victim') victim.takeHit(third, punch);
    if (cause === 'complete') holder.chokeDuration = holder.st + .2;
    if (cause === 'counter') holder.beginCounter();
    if (cause === 'complete' || cause === 'counter') {
      let previous = before;
      for (let i = 0; i < Math.ceil(2 / dt) && holder.chokeCooldownPending; i++) {
        previous = holder.chokeCD;
        Game.update(dt);
      }
      assert.equal(holder.chokeCooldownPending, false, `${cause} finishes the cooldown once`);
      assert.ok(Math.abs(holder.chokeCD - 2 * previous) <= 2 * dt + 1e-6, `${cause} doubles the remaining time`);
    } else {
      assert.equal(holder.chokeCooldownPending, false);
      assert.ok(Math.abs(holder.chokeCD - 2 * before) < 1e-6, cause);
    }
    const remaining = holder.chokeCD;
    holder.finishChokeCooldown();
    assert.equal(holder.chokeCD, remaining, 'cleanup cannot double it a second time');
  }
  Game.fighters = [];
  const f = fighter(400, 1), o = fighter(600, -1); disableAI(f, o);
  const random = Math.random;
  try {
    Math.random = () => .5;
    assert.equal(f.startBoxing(), true); assert.equal(f.boxCD, 1.75);
    f.state = 'idle'; f.boxing = false;
    f.startDash(1); assert.equal(f.dashCD, .6);
  } finally { Math.random = random; }
});

test('a counterthrow carries the attacker over a shoulder, releases midway, and damages them only on landing', () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) for (const dir of [1, -1]) for (const reverseOrder of [false, true]) {
    Game.fighters = [];
    const { holder, victim } = heldPair({ dir, reverseOrder, dt });
    holder.beginCounter();
    assert.equal(holder.state, 'counter_carried');
    assert.equal(victim.state, 'counter_throw');
    const startY = holder.rig.pel.y;
    tick(.24, dt);
    assert.equal(holder.state, 'counter_carried');
    assert.ok(holder.rig.pel.y < startY - 35, 'attacker lifts over the shoulder');
    assert.ok(Math.abs(holder.x - holder.rig.pel.x) < 1, 'hit detection follows the carried body');
    assert.ok(distance(victim.rig.wN, holder.rig.pel) < 16, 'thrower grips the carried body');
    assert.ok(distance(victim.rig.wF, holder.rig.pel) < 16, 'both hands stay in contact before release');
    assert.equal(holder.hp, 100, 'no fall damage before release');
    advanceUntil(() => holder.state === 'ragdoll', Math.ceil(1 / dt), dt);
    assert.equal(victim.counterReleased, true);
    assert.equal(holder.chokeTarget, null);
    assert.equal(victim.chokedBy, null);
    const rag = holder.rag, px = rag.p.pel.x;
    assert.equal(holder.hp, 100);
    advanceUntil(() => holder.hp < 100, Math.ceil(4 / dt), dt);
    assert.equal(holder.hp, 92);
    assert.equal(holder.fallDamage, null);
    assert.ok(Math.abs(rag.p.pel.x - px) > 5, 'after release, the body moves under independent physics');
    tick(.6, dt);
    assert.equal(holder.hp, 92, 'fall damage is applied once');
  }
});

test('counterthrow fall damage can KO without replacing the airborne ragdoll', () => {
  const { holder, victim } = heldPair();
  holder.hp = 6;
  holder.beginCounter();
  advanceUntil(() => holder.state === 'ragdoll', 60);
  const rag = holder.rag;
  advanceUntil(() => holder.hp <= 0, 240);
  assert.equal(holder.rag, rag);
  assert.equal(Game.koCount, 1);
  assert.equal(victim.chokedBy, null);
});

test('a third fighter can interrupt a counter before release without leaving anyone pinned', () => {
  const { holder, victim } = heldPair();
  const third = fighter(300, 1);
  disableAI(third);
  holder.beginCounter();
  tick(.12);
  victim.takeHit(third, punch);
  assert.equal(holder.chokeTarget, null);
  assert.equal(victim.chokedBy, null);
  assert.notEqual(holder.state, 'counter_carried');
  assert.equal(victim.state, 'hit');
  assert.equal(holder.fallDamage, null);
  tick(.3);
  assert.notEqual(holder.state, 'counter_carried');
});

test('other fighters collide with but do not separate a held pair, including near a wall', () => {
  for (const dir of [1, -1]) {
    Game.fighters = [];
    const { holder, victim } = heldPair({ dir });
    // Put the restrained fighter at the edge and keep the pair together.
    victim.x = dir > 0 ? victim.maxX : victim.minX;
    holder.x = victim.x - dir * 48;
    const intruder = fighter(holder.x - dir * 12, dir);
    disableAI(intruder);
    for (let i = 0; i < 40; i++) {
      Game.update(1 / 60);
      assert.ok(Math.abs((victim.x - holder.x) * dir - 48) < .01);
      assert.ok(holder.x >= holder.minX && holder.x <= holder.maxX);
      assert.ok(victim.x >= victim.minX && victim.x <= victim.maxX);
    }
    assert.ok(Math.abs(intruder.x - holder.x) >= 40, 'third fighter is pushed away, not the attached pair');
  }
});

test('removed Jane hypnosis, pistol and grounded leg-grab code stay absent while Jane remains playable', () => {
  assert.doesNotMatch(source, /hypno|trance|mental|bullet|droppedgun|grab_prep|grab_throw|grabtarget|grabbedby/i);
  const jane = fighter(450, 1, 'jane');
  assert.equal(jane.skin, 'jane');
  assert.equal(jane.hp, 100);
  jane.startAttack(0);
  assert.equal(jane.atk.n, 'jab');
});

test('seeded autonomous fights actually use the new moves without leaving dangling holds', () => {
  const counts = { boxing: 0, guard: 0, guardHits: 0, stumble: 0, flank: 0, choke: 0, counter: 0, thrown: 0, completed: 0 };
  const methods = {
    startBoxing: 'boxing', startGuard: 'guard', startOverextend: 'stumble',
    startFlank: 'flank', startChoke: 'choke', beginCounter: 'counter', releaseCounter: 'thrown',
  };
  const originals = Object.fromEntries(Object.keys(methods).map(name => [name, Fighter.prototype[name]]));
  const originalHit = Fighter.prototype.takeHit;
  try {
    for (const [method, key] of Object.entries(methods)) {
      Fighter.prototype[method] = function (...args) {
        const before = this.state;
        const result = originals[method].apply(this, args);
        if (result === true || (result === undefined && this.state !== before)) counts[key]++;
        if (method === 'releaseCounter' && this.counterReleased) counts[key]++;
        return result;
      };
    }
    Fighter.prototype.takeHit = function (...args) {
      const guarded = this.state === 'guard';
      const result = originalHit.apply(this, args);
      if (guarded && (this.state === 'guard' || this.state === 'guard_recoil')) counts.guardHits++;
      return result;
    };
    for (const seed of [19, 31, 57, 83, 101, 133, 177, 251]) {
      seedRandom(seed);
      Game.init();
      const last = new Map();
      for (let frame = 0; frame < 120 * 60; frame++) {
        Game.update(1 / 60);
        for (const f of Game.fighters) {
          if (last.get(f.id) === 'choked' && f.state === 'ragdoll' && f.hp > 0) counts.completed++;
          last.set(f.id, f.state);
          assert.ok(Number.isFinite(f.x) && Number.isFinite(f.y) && f.hp >= 0);
          if (f.state === 'choke') {
            assert.equal(f.chokeTarget?.chokedBy, f);
            assert.equal(f.chokeTarget?.state, 'choked');
          }
          if (f.state === 'choked') {
            assert.equal(f.chokedBy?.chokeTarget, f);
            assert.equal(f.chokedBy?.state, 'choke');
          }
          if (f.state === 'counter_carried') {
            assert.equal(f.chokeTarget?.state, 'counter_throw');
            assert.equal(f.chokeTarget?.chokedBy, f);
          }
        }
        if (frame % 600 === 0) Game.render();
      }
    }
    console.log('autonomous combat events:', counts);
    for (const [key, count] of Object.entries(counts)) assert.ok(count > 0, `${key} did not occur in unattended fights`);
  } finally {
    for (const [name, original] of Object.entries(originals)) Fighter.prototype[name] = original;
    Fighter.prototype.takeHit = originalHit;
  }
});

test('an interrupted boxing combo never fires the queued second punch', () => {
  for (const lethal of [false, true]) {
    Game.fighters = []; Game.koCount = 0;
    const boxer = fighter(400, 1), opponent = fighter(520, -1);
    disableAI(boxer, opponent);
    assert.equal(boxer.startBoxing(), true);
    tick(.2);
    const stamp = boxer.atkStamp;
    if (lethal) boxer.hp = 3;
    boxer.takeHit(opponent, punch);
    assert.equal(boxer.boxing, false);
    if (lethal) assert.ok(['ragdoll', 'stagger_fall'].includes(boxer.state), 'lethal hits may stagger before falling');
    else assert.equal(boxer.state, 'hit');
    tick(1);
    assert.equal(boxer.atkStamp, stamp, 'interrupted second punch must not fire later');
    assert.equal(Game.koCount, lethal ? 1 : 0);
  }
});

test('an attacker can voluntarily release a choke before its full duration', () => {
  const { holder, victim } = heldPair();
  holder.chokeReleaseAt = holder.st + .2;
  const hp = victim.hp;
  tick(.3);
  assert.equal(holder.state, 'idle');
  assert.equal(holder.chokeTarget, null);
  assert.equal(victim.chokedBy, null);
  assert.notEqual(victim.state, 'ragdoll');
  assert.ok(victim.hp > hp - 1, 'early release should do only light passive damage');
});

test('simultaneous choke pairs stay independent when a third party interrupts only one', () => {
  const first = heldPair({ dir: 1 });
  first.holder.x -= 220; first.victim.x -= 220;
  first.victim.buildRig(0); first.holder.buildRig(0);
  const second = heldPair({ dir: -1, reverseOrder: true });
  tick(.25);
  assert.equal(first.holder.chokeTarget, first.victim);
  assert.equal(second.holder.chokeTarget, second.victim);
  assert.equal(first.victim.chokedBy, first.holder);
  assert.equal(second.victim.chokedBy, second.holder);
  const third = fighter(120, 1, 'saul'); disableAI(third);
  first.holder.takeHit(third, punch);
  assert.equal(first.holder.chokeTarget, null);
  assert.equal(first.victim.chokedBy, null);
  assert.equal(second.holder.chokeTarget, second.victim);
  assert.equal(second.victim.chokedBy, second.holder);
  tick(.25);
  assert.equal(second.holder.state, 'choke');
  assert.equal(second.victim.state, 'choked');
});

test('interrupting the carried fighter starts ragdoll at its current airborne position', () => {
  const { holder, victim } = heldPair();
  const third = fighter(250, 1, 'saul'); disableAI(third);
  holder.beginCounter(); tick(.24);
  const p = { ...holder.rig.pel };
  holder.takeHit(third, launchPunch);
  assert.equal(holder.state, 'ragdoll');
  assert.equal(holder.chokeTarget, null);
  assert.equal(victim.chokedBy, null);
  assert.notEqual(victim.state, 'counter_throw');
  assert.ok(distance(holder.rag.p.pel, p) < 1, 'no teleport to the pre-throw position');
  assert.equal(holder.fallDamage, null, 'an interrupted counter must not deal delayed fall damage');
});

test('portrait sizing keeps the full lower arena visible and vertically letterboxed', () => {
  const oldWidth = innerWidth, oldHeight = innerHeight;
  try {
    globalThis.innerWidth = 390; globalThis.innerHeight = 844;
    Game.resize();
    assert.equal(Game.W, 800);
    assert.ok(parseFloat(Game.cv.style.width) <= innerWidth + .01);
    assert.ok(parseFloat(Game.cv.style.height) < innerHeight);
    assert.ok(parseFloat(Game.cv.style.top) > 0);
    assert.ok(Math.abs(parseFloat(Game.cv.style.top) * 2 + parseFloat(Game.cv.style.height) - innerHeight) < .01);
    const a = fighter(80, 1), b = fighter(Game.W - 80, -1);
    assert.ok(a.x >= 70 && b.x <= Game.W - 70);
    Game.render();
  } finally {
    globalThis.innerWidth = oldWidth; globalThis.innerHeight = oldHeight;
    Game.resize();
  }
});

test('upstream character weight affects walking speed and ragdoll launch', () => {
  const light = fighter(350, 1, 'saul'), heavy = fighter(620, -1, 'homelander');
  disableAI(light, heavy);
  assert.ok(light.speedMul() > heavy.speedMul(), 'lighter fighter walks faster');
  // Equal impulses and random spin: the heavier body should move less.
  Math.random = () => .5;
  light.toRagdoll(400, 400); heavy.toRagdoll(400, 400);
  const lightImpulse = light.rag.p.pel.x - light.rag.p.pel.px;
  const heavyImpulse = heavy.rag.p.pel.x - heavy.rag.p.pel.px;
  assert.ok(lightImpulse > heavyImpulse, 'heavier fighter receives less ragdoll velocity');
});

test('body-attached blood marks survive movement and clear with blood', () => {
  const f = fighter(480, 1, 'negan'); disableAI(f);
  f.addBloodStain(f.rig.head.x, f.rig.head.y - 6);
  assert.equal(f.bloodStains.length, 1);
  assert.equal(f.bloodStains[0].layer, 'head');
  tick(.5);
  assert.ok(f.bloodStains[0].age > 0);
  Game.render();
  assert.ok([...Game.headLayer.ctx.stats.colors].some(c => typeof c === 'string' && c.startsWith('rgb(1')));
  Game.clearBlood();
  assert.equal(f.bloodStains.length, 0);
});

test('explicit character selection spawns the requested fighter', () => {
  for (const [skin, label] of [
    ['jane', 'ПАТРИК ДЖЕЙН'], ['negan', 'НИГАН'], ['homelander', 'ХОУМЛЕНДЕР'],
    ['walt', 'УОЛТЕР'], ['saul', 'СОЛ'],
  ]) {
    const selected = Game.spawnFighter(360, 1, 0, skin);
    assert.equal(selected.skin, skin);
    assert.ok(selected.name.includes(label));
    assert.equal(Game.fighters.at(-1), selected);
  }
});

// Settle the physics in isolation so the old automatic get-up timer does not
// remove the ragdoll before a test can inspect it.
function sleepingBody(f, vx = 0, dt = 1 / 60) {
  f.toRagdoll(vx, 220);
  const r = f.rag;
  for (let i = 0; i < 360 && !r.sleeping; i++) r.update(dt);
  assert.equal(r.sleeping, true, 'ragdoll must settle');
  f.buildRig(dt);
  return r;
}
function ragSnapshot(r) {
  return Object.fromEntries(Object.entries(r.p).map(([k, p]) => [k, [p.x, p.y, p.px, p.py]]));
}

test('ragdolls follow the impulse, come to rest, and do not drift or fly across the arena', () => {
  const zeroSides = new Set();
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) for (const dir of [1, -1]) {
    for (const vx of [-200, 0, 200]) for (const seed of [137, 274, 411, 548]) {
      seedRandom(seed);
      Game.fighters = [];
      const f = fighter(480, dir, 'jane'); disableAI(f);
      const random = Math.random;
      if (vx === 0) Math.random = () => seed % 2 ? .1 : .9;
      try { f.toRagdoll(vx, 220); } finally { Math.random = random; }
      const r = f.rag, start = r.p.pel.x;
      let x2 = start;
      for (let i = 0; i < Math.round(8 / dt); i++) {
        r.update(dt);
        if (i === Math.round(2 / dt) - 1) x2 = r.p.pel.x;
        for (const p of Object.values(r.p)) {
          assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
          assert.ok(p.y <= f.gy - p.r + 1e-6, 'joint must stay above the floor');
          assert.ok(Math.hypot(p.x - p.px, p.y - p.py) * 120 <= 541, 'solver velocity stays bounded');
        }
      }
      assert.equal(r.sleeping, true, `body should settle: ${dir}, ${vx}, ${dt}, ${seed}`);
      assert.ok(Math.abs(r.p.pel.x - x2) < 5, 'a settled body must not crawl across the floor');
      assert.ok(Math.abs(r.p.pel.x - start) < (vx ? 130 : 35), 'no spontaneous long-distance launch');
      const headOffset = r.p.head.x - r.p.pel.x;
      if (vx) assert.equal(Math.sign(headOffset), Math.sign(vx), 'head falls in the impulse direction');
      else zeroSides.add(Math.sign(headOffset));
    }
  }
  assert.deepEqual(zeroSides, new Set([-1, 1]), 'no-impulse falls can face either way');
});

test('a real laser hit wakes a sleeping ragdoll without reviving a corpse', () => {
  const v = fighter(460, 1), a = fighter(700, -1, 'homelander'); disableAI(v, a);
  const r = sleepingBody(v, -100);
  const old = ragSnapshot(r);
  v.takeLaser(a, { x: v.rig.head.x, y: v.rig.head.y - 6 }, false);
  assert.equal(r.sleeping, false);
  assert.notDeepEqual(ragSnapshot(r), old, 'a laser applies an actual impulse');
  assert.ok(v.hp < 100);
});

test('strong front hits sometimes stagger backward before a knockout or temporary ragdoll', () => {
  for (const lethal of [false, true]) for (const dir of [1, -1]) {
    Game.fighters = [];
    const v = fighter(480, dir), a = fighter(480 + dir * 90, -dir, 'negan'); disableAI(v, a);
    if (lethal) v.hp = 5;
    const x = v.x, rand = Math.random;
    try { Math.random = () => 0; v.takeHit(a, launchPunch); } finally { Math.random = rand; }
    assert.equal(v.state, 'stagger_fall');
    assert.equal(v.rag, null);
    assert.equal(v.hp <= 0, lethal);
    tick(.35);
    assert.ok((v.x - x) * dir < -8, 'the stagger steps away from the incoming hit');
    advanceUntil(() => v.state === 'ragdoll', 240);
    const r = v.rag;
    for (let i = 0; i < 150; i++) r.update(1 / 60);
    assert.ok((r.p.head.x - r.p.pel.x) * dir < -25, 'the delayed fall ends on the back');
  }
  Game.fighters = [];
  const v = fighter(480, 1), a = fighter(570, -1); disableAI(v, a);
  const rand = Math.random;
  try { Math.random = () => .99; v.takeHit(a, launchPunch); } finally { Math.random = rand; }
  assert.equal(v.state, 'ragdoll', 'the ordinary immediate fall remains possible');
});

test('the slightly higher stagger chance applies to knockdowns and some ordinary lethal front hits', () => {
  for (const lethal of [false, true]) for (const [roll, expected] of [[.35, 'stagger_fall'], [.41, 'ragdoll']]) {
    Game.fighters = [];
    const victim = fighter(480, 1), attacker = fighter(570, -1); disableAI(victim, attacker);
    if (lethal) victim.hp = 5;
    const random = Math.random;
    try { Math.random = () => roll; victim.takeHit(attacker, lethal ? punch : launchPunch); }
    finally { Math.random = random; }
    assert.equal(victim.state, expected, `${lethal ? 'lethal' : 'knockdown'} at ${roll}`);
    assert.equal(victim.hp <= 0, lethal);
  }
});

function hangingPair({ index = 1, dir = 1, skin = 'jane' } = {}) {
  Game.init(); Game.autoSpawn = false; Game.fighters = [];
  const lamp = Game.lamps[index];
  const f = fighter(lamp.x, dir, skin);
  const o = fighter(Math.max(80, Math.min(Game.W - 80, lamp.x + (dir > 0 ? 240 : -240))), -dir, 'walt');
  disableAI(f, o);
  assert.equal(f.startLampJump(lamp), true);
  advanceUntil(() => f.state === 'lamp_hang', 100);
  f.lampAction = 'hide'; f.lampStamina = 9; f.lampBreakAt = Infinity;
  tick(.15);
  return { f, o, lamp };
}

test('lamps are randomly high, have offscreen ropes, and survive resizing without resetting the map cap', () => {
  const heights = new Set();
  for (let i = 0; i < 5; i++) {
    seedRandom(1000 + i); Game.init(); Game.autoSpawn = false;
    assert.equal(Game.lamps.length, 3);
    for (const lamp of Game.lamps) {
      heights.add(Math.round(lamp.y));
      assert.ok(lamp.y > 0 && lamp.y <= Game.H / 2, 'attached lamp remains above mid-screen');
      assert.ok(lamp.anchorY < 0 && lamp.length > lamp.y, 'rope continues beyond the top edge');
    }
  }
  assert.ok(heights.size > 3, 'heights are not fixed decorations');
  const [a, b, c] = Game.lamps, oldWidth = innerWidth, oldHeight = innerHeight;
  assert.equal(Game.detachLamp(a), true);
  assert.equal(Game.detachLamp(b), true);
  assert.equal(Game.detachLamp(c), false, 'no more than two lamps can detach');
  try {
    globalThis.innerWidth = 390; globalThis.innerHeight = 844; Game.resize();
    assert.deepEqual(Game.lamps, [a, b, c]);
    assert.equal(Game.detachedLamps, 2);
    assert.equal(Game.detachLamp(c), false, 'resizing must not reset the cap');
    assert.ok(c.y <= Game.H / 2);
    Game.render();
    Game.init();
    assert.equal(Game.detachedLamps, 0, 'a new map gets its own cap');
    assert.equal(Game.lamps.filter(l => l.detached).length, 0);
  } finally {
    globalThis.innerWidth = oldWidth; globalThis.innerHeight = oldHeight; Game.resize();
  }
});

test('an undetached lamp swings as a damped pendulum and never falls below mid-screen', () => {
  const lamp = Game.lamps[1];
  lamp.theta = 0; lamp.omega = .8;
  const initial = lamp.omega ** 2, startX = lamp.x;
  let maxTravel = 0;
  for (let i = 0; i < 600; i++) {
    lamp.update(1 / 60, Game);
    maxTravel = Math.max(maxTravel, Math.abs(lamp.x - startX));
    assert.ok(lamp.y <= Game.H / 2);
  }
  const energy = lamp.omega ** 2 + 1800 / lamp.length * lamp.theta ** 2;
  assert.ok(maxTravel > 15, 'the lamp has visible inertia');
  assert.ok(energy < initial * .03, `swing should damp out: ${energy}`);
});

test('every hero holds the moving lamp naturally with both hands throughout a pull-up', () => {
  for (const skin of ['jane', 'negan', 'homelander', 'walt', 'saul']) for (const index of [0, 1, 2]) for (const dir of [1, -1]) {
    const { f, lamp } = hangingPair({ skin, index, dir });
    assert.equal(lamp.occupant, f);
    assert.ok(f.y > 0 && f.lampStamina > 0);
    f.lampAction = 'pullup'; f.lampDiveAt = Infinity; f.st = 0;
    let maxGap = -Infinity, minGap = Infinity;
    for (let frame = 0; frame < 85; frame++) {
      Game.update(1 / 60);
      const p = lamp.grip(), gap = f.rig.sh.y - p.y;
      maxGap = Math.max(maxGap, gap); minGap = Math.min(minGap, gap);
      for (const hand of ['wN', 'wF']) assert.ok(distance(f.rig[hand], p) < 6, `${skin} ${dir}: ${hand} keeps its grip`);
      if (f.st > .3) assert.ok((p.x - f.rig.head.x) * dir > 20, 'the face stays visible beside the rope');
    }
    assert.ok(maxGap - minGap > 15, `pull-up must raise the shoulders: ${skin} ${dir}`);
    assert.ok(Math.abs(lamp.theta) > .001 || Math.abs(lamp.omega) > .001, 'grabbing sets the lamp in motion');
    Game.render();
  }
});

test('grabbing the rope transitions smoothly without teleporting the upper body', () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) for (const dir of [1, -1]) {
    Game.init(); Game.autoSpawn = false; Game.fighters = [];
    const lamp = Game.lamps.reduce((a, b) => a.y < b.y ? a : b);
    const f = fighter(lamp.x, dir), o = fighter(lamp.x + dir * 240, -dir); disableAI(f, o);
    assert.equal(f.startLampJump(lamp), true);
    let transition = 0, next = 0;
    for (let i = 0; i < Math.ceil(2 / dt); i++) {
      const before = { ...f.rig.sh }, was = f.state;
      Game.update(dt);
      if (was === 'lamp_jump' && f.state === 'lamp_hang') {
        transition = distance(before, f.rig.sh);
        const first = { ...f.rig.sh }; Game.update(dt); next = distance(first, f.rig.sh);
        break;
      }
    }
    assert.equal(f.state, 'lamp_hang');
    assert.ok(transition < 35 && next < 22, `grab should be continuous at ${dt}: ${transition}, ${next}`);
  }
});

test('a small physical swing and pull-up lead to a jump, with finite stamina and the old dive still available', () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
    const { f, o, lamp } = hangingPair();
    f.lampAction = 'pullup'; f.lampDiveAt = 1.8; f.st = 0;
    const startX = lamp.x, random = Math.random;
    let travel = 0, bent = false;
    try {
      Math.random = () => .99; // choose an ordinary jump, not the optional dive
      while (f.state === 'lamp_hang') {
        Game.update(dt);
        travel = Math.max(travel, Math.abs(lamp.x - startX));
        if (f.state === 'lamp_hang' && f.st > .65 && f.st < 1) {
          bent ||= kneeAngle(f.rig.sh, f.rig.eN, f.rig.wN) < 90;
          assert.ok(distance(f.rig.wN, lamp.grip()) < 6 && distance(f.rig.wF, lamp.grip()) < 6);
        }
      }
    } finally { Math.random = random; }
    assert.ok(bent, 'both arms bend when the body is pulled up');
    assert.ok(travel > 5 && travel < 80, `the swing is visible but gentle: ${travel}`);
    assert.equal(f.state, 'air'); assert.equal(f.dive, false);
    assert.ok(f.vy > 0 && f.vx * f.dir > 0, 'release is an intentional jump');
    assert.equal(lamp.occupant, null);
    assert.ok(o.hp > 0);
  }
  {
    const { f, lamp } = hangingPair();
    f.lampAction = 'hide'; f.lampStamina = .05;
    tick(.2);
    assert.notEqual(f.state, 'lamp_hang', 'stamina cannot last forever');
    assert.equal(lamp.occupant, null);
  }
  {
    const { f, o, lamp } = hangingPair();
    o.x = f.x + 125; o.buildRig(1 / 60);
    f.lampAction = 'dive'; f.lampDiveAt = .1; f.st = 0;
    advanceUntil(() => f.state === 'air' && f.dive, 60);
    assert.equal(lamp.occupant, null);
    assert.ok(f.vx > 0, 'the fighter jumps toward the opponent');
    advanceUntil(() => o.hp < 100 || !f.dive, 120);
    assert.ok(o.hp < 100, 'a well-timed lamp dive can hit the opponent');
  }
});

test('the lamp shade and rope render on a dedicated pixel-resolution layer', () => {
  assert.equal(Game.lampLayer.scale, Game.S / 3);
  const before = Game.lampLayer.ctx.stats.fillRect;
  Game.render();
  assert.ok(Game.lampLayer.ctx.stats.fillRect - before >= Game.lamps.length * 10, 'the shade has stepped pixel detail');
  assert.ok(Game.lampLayer.ctx.stats.colors.has('#ffe0a0'));
  assert.ok(Game.lampLayer.ctx.stats.stroke >= Game.lamps.length, 'the suspension rope is rendered on the same layer');
  Game.detachLamp(Game.lamps[0]);
  Game.render();
  assert.ok(Game.lampLayer.ctx.stats.colors.has('#81735a'), 'detached lamps still render without their light');
});

test('a hit, laser or KO during a lamp jump or hang releases the rope and starts airborne ragdoll', () => {
  for (const phase of ['jump', 'hang']) for (const attack of ['punch', 'laser', 'ko']) {
    let f, o, lamp;
    if (phase === 'hang') ({ f, o, lamp } = hangingPair());
    else {
      Game.fighters = [];
      lamp = Game.lamps.reduce((a, b) => a.y < b.y ? a : b);
      f = fighter(lamp.x, 1); o = fighter(lamp.x + 100, -1, 'homelander'); disableAI(f, o);
      assert.equal(f.startLampJump(lamp), true);
      tick(1 / 60);
      assert.equal(f.state, 'lamp_jump');
    }
    const p = { ...f.rig.pel };
    if (attack === 'ko') f.hp = 1;
    if (attack === 'laser') f.takeLaser(o, { x: f.rig.head.x, y: f.rig.head.y - 6 }, true);
    else f.takeHit(o, punch);
    assert.equal(f.state, 'ragdoll', `${phase} ${attack}`);
    assert.equal(f.lampRef, null);
    assert.equal(f.lampGoal, null);
    assert.equal(lamp.occupant, null);
    assert.ok(distance(f.rag.p.pel, p) < 1, 'fall starts from the current airborne pose');
  }
});

test('another fighter can pull a hanging opponent down; interruption cancels the grab', () => {
  {
    const { f, o, lamp } = hangingPair();
    o.x = f.x + 65; o.buildRig(1 / 60);
    assert.equal(o.startLampPull(f), true);
    const initialOmega = lamp.omega;
    advanceUntil(() => f.state === 'ragdoll', 100);
    assert.equal(lamp.occupant, null);
    assert.equal(f.lampRef, null);
    assert.equal(f.fallDamage?.source, o);
    assert.ok(f.rag.p.pel.y - f.rag.p.pel.py > 0, 'the pull initially accelerates downward');
    assert.notEqual(lamp.omega, initialOmega, 'the tug adds swing to the freed lamp');
    advanceUntil(() => f.fallDamage === null, 180);
    assert.equal(f.hp, 97, 'landing applies the small pull-down damage once');
  }
  {
    const { f, o, lamp } = hangingPair();
    o.x = f.x + 65; o.buildRig(1 / 60);
    const third = fighter(o.x + 85, -1, 'saul'); disableAI(third);
    assert.equal(o.startLampPull(f), true);
    o.takeHit(third, punch);
    assert.equal(o.state, 'hit');
    assert.equal(o.lampPullTarget, null);
    tick(.6);
    assert.equal(f.state, 'lamp_hang');
    assert.equal(lamp.occupant, f);
  }
});

test('the AI can ignore, try to pull, or attempt to strike a hanging opponent', () => {
  for (const [roll, expected] of [[.1, 'ignore'], [.5, 'pull'], [.9, 'strike']]) {
    const { f, o } = hangingPair();
    o.x = f.x + 65; o.buildRig(1 / 60); o.guardCD = 99; o.boxCD = 99;
    // Restore the real autonomous decision function for this fighter.
    delete o.autopilot.update;
    const ai = o.autopilot;
    ai.attackWait = 0; ai.farCD = ai.lampCheck = 100;
    const rand = Math.random;
    try { Math.random = () => roll; ai.update(1 / 60, o, f, Game.fighters); } finally { Math.random = rand; }
    assert.equal(ai.hangResponse, expected);
    if (expected === 'ignore') assert.equal(o.ctrl.punch, false);
    if (expected === 'pull') assert.equal(o.state, 'lamp_pull');
    if (expected === 'strike') assert.equal(o.ctrl.punch, true);
  }
});

test('detaching an occupied lamp drops its rider and removing a lamp cannot leave a dangling reference', () => {
  {
    const { f, lamp } = hangingPair();
    assert.equal(Game.detachLamp(lamp), true);
    assert.equal(f.state, 'ragdoll');
    assert.equal(f.lampRef, null);
    assert.equal(lamp.occupant, null);
    assert.equal(Game.detachedLamps, 1);
  }
  {
    const { f, lamp } = hangingPair();
    Game.lamps.splice(Game.lamps.indexOf(lamp), 1);
    tick(.1);
    assert.notEqual(f.state, 'lamp_hang');
    assert.equal(f.lampRef, null);
    assert.equal(lamp.occupant, null);
  }
});

test('the AI rarely decides to approach and jump for an available lamp', () => {
  const lamp = Game.lamps[1], f = fighter(lamp.x - 65, 1), o = fighter(lamp.x + 260, -1);
  disableAI(o);
  const ai = f.autopilot;
  ai.attackWait = ai.farCD = 100; ai.lampCheck = 0;
  const rand = Math.random;
  try { Math.random = () => .9; ai.update(1 / 60, f, o, Game.fighters); } finally { Math.random = rand; }
  assert.equal(ai.mode, 'engage', 'choosing a lamp is not mandatory');
  ai.lampCheck = 0;
  try { Math.random = () => 0; ai.update(1 / 60, f, o, Game.fighters); } finally { Math.random = rand; }
  assert.equal(ai.mode, 'lamp_approach');
  assert.equal(ai.lampTarget, lamp);
  advanceUntil(() => f.state === 'lamp_hang', 240);
  assert.equal(lamp.occupant, f);
  assert.ok(ai.lampCheck > 10, 'the AI cannot immediately spam a new attempt');
});

test('lamp detachment is substantially rarer than grabbing', () => {
  const lamp = Game.lamps[1], f = fighter(lamp.x, 1);
  seedRandom(43210);
  let breakRolls = 0;
  for (let i = 0; i < 10000; i++) {
    f.state = 'lamp_jump'; f.lampGoal = lamp; f.vx = 0; lamp.occupant = null; lamp.omega = 0;
    assert.equal(f.grabLamp(lamp), true);
    if (Number.isFinite(f.lampBreakAt)) breakRolls++;
    f.clearLamp();
  }
  assert.ok(breakRolls > 145 && breakRolls < 255, `expected roughly 2%, got ${breakRolls}/10000`);
});

test('the previous get-up timing is restored for ordinary, stunned and fast knockdowns', () => {
  for (const scenario of [
    { t: .89, settle: .36, expected: 'ragdoll' },
    { t: .91, settle: .36, expected: 'getup' },
    { t: 1.34, settle: .36, scale: 1.5, expected: 'ragdoll' },
    { t: 1.36, settle: .36, scale: 1.5, expected: 'getup' },
    { t: 4.21, settle: 0, expected: 'getup' },
    { t: .36, settle: .09, fast: true, expected: 'getup' },
    { t: 1.21, settle: 0, fast: true, expected: 'getup' },
    { t: 10, settle: 0, fast: true, grounded: false, expected: 'ragdoll' },
  ]) {
    Game.fighters = [];
    const f = fighter(480, 1); disableAI(f);
    f.fastGetup = !!scenario.fast;
    f.toRagdoll(0, 220);
    const r = f.rag;
    r.t = scenario.t; r.settle = scenario.settle; r.stunScale = scenario.scale || 1;
    // Isolate the state machine from the physics step to test the thresholds.
    r.update = () => {};
    r.grounded = () => scenario.grounded !== false;
    f.update(1 / 60, null, [f]);
    assert.equal(f.state, scenario.expected, JSON.stringify(scenario));
  }
});

test('fighters use only the original get-up animation and do not strike while rising', () => {
  assert.doesNotMatch(source, /groundKick|ground_kick|GROUND_KICK|QUICK_PUSH|QUICK_KIP|quick_getup|quickGetup|bumpFromKip|scramble|tactical_retreat|retreatCheck/);
  assert.equal(typeof Fighter.prototype.startGroundKick, 'undefined');
  assert.equal(typeof Fighter.prototype.quickGetupKind, 'undefined');
  for (const skin of ['jane', 'negan', 'homelander', 'walt', 'saul']) {
    for (const vx of [-200, 200]) {
      Game.fighters = [];
      const f = fighter(480, 1, skin), nearby = fighter(555, -1, 'walt');
      disableAI(f, nearby);
      f.toRagdoll(vx, 220);
      const r = f.rag;
      advanceUntil(() => f.state === 'getup', 300);
      assert.ok(r.t >= .9, 'ordinary recovery keeps the original minimum stun');
      const hp = nearby.hp;
      tick(1);
      assert.equal(f.state, 'getup', 'the regular get-up does not become an escape run');
      assert.equal(nearby.hp, hp, 'getting up cannot damage the nearby opponent');
      advanceUntil(() => f.state === 'idle', 120);
      assert.equal(nearby.hp, hp);
    }
  }
});

test('the AI starts the previous ordinary attack sequence rather than forcing a new finisher', () => {
  for (const skin of ['jane', 'negan', 'homelander']) {
    Game.fighters = [];
    const f = fighter(400, 1, skin), o = fighter(510, -1, 'walt'); disableAI(o);
    const ai = f.autopilot;
    f.boxCD = 100; ai.attackWait = 0; ai.farCD = ai.lampCheck = ai.hopCD = 100;
    const random = Math.random;
    try { Math.random = () => 0; ai.update(1 / 60, f, o, Game.fighters); }
    finally { Math.random = random; }
    assert.equal(f.state, 'idle', 'AI should queue the usual attack instead of starting a finisher');
    assert.equal(f.ctrl.punch, true);
    f.update(1 / 60, o, Game.fighters);
    assert.equal(f.ak, 0);
    assert.equal(f.atk.n, skin === 'negan' ? 'swing' : 'jab');
  }
});

test('the former retreat and wait behavior returns when an opponent is down', () => {
  for (const dir of [1, -1]) for (const run of [false, true]) {
    Game.fighters = [];
    const center = Game.W / 2;
    const victim = fighter(center - dir * 100, dir, 'walt');
    const attacker = fighter(center + dir * 25, -dir, 'jane');
    disableAI(victim);
    victim.toRagdoll(0, 220); victim.rag.stunScale = 100;
    const ai = attacker.autopilot;
    ai.attackWait = ai.farCD = ai.lampCheck = 100;
    ai.hopCD = 100;
    const random = Math.random;
    let roll = 0;
    try { Math.random = () => roll++ === 0 ? 0 : (run ? 0 : .99); ai.update(1 / 60, attacker, victim, Game.fighters); }
    finally { Math.random = random; }
    assert.equal(ai.mode, 'retreat', 'the old downed-opponent retreat can be chosen');
    assert.equal(ai.goalX, dir > 0 ? Game.W - 120 : 120);
    assert.equal(ai.retRun, run);
    ai.update(1 / 60, attacker, victim, Game.fighters);
    assert.equal(attacker.ctrl.mx, dir);
    assert.equal(attacker.ctrl.run, run);
    assert.equal(attacker.ctrl.noFace, true);
    assert.equal(attacker.dir, dir, 'the old retreat turns toward the far end');
    attacker.x = ai.goalX;
    ai.update(1 / 60, attacker, victim, Game.fighters);
    assert.equal(ai.mode, 'wait');
    ai.update(.6, attacker, victim, Game.fighters);
    assert.equal(ai.mode, 'wait', 'the attacker waits for the opponent to rise');
    victim.state = 'idle'; victim.rag = null;
    ai.update(1 / 60, attacker, victim, Game.fighters);
    assert.ok(['engage', 'charge'].includes(ai.mode), 'combat resumes when the opponent is up');
  }
});

test('a downed opponent is not kicked, and the original airborne kick is retained', () => {
  const victim = fighter(400, 1, 'walt'), attacker = fighter(525, -1, 'jane');
  disableAI(victim);
  victim.toRagdoll(0, 220); victim.rag.stunScale = 100;
  const ai = attacker.autopilot;
  ai.attackWait = ai.farCD = ai.lampCheck = ai.hopCD = 100;
  const random = Math.random;
  try { Math.random = () => .99; ai.update(1 / 60, attacker, victim, Game.fighters); }
  finally { Math.random = random; }
  assert.equal(ai.mode, 'keep_distance', 'a fighter can choose to keep a safe distance instead of retreating');
  ai.update(1 / 60, attacker, victim, Game.fighters);
  assert.equal(attacker.ctrl.mx, 1, 'the fighter backs away rather than crowding a fallen opponent');
  for (let i = 0; i < 240; i++) {
    Game.update(1 / 60);
    assert.equal(victim.hp, 100, 'the grounded fighter is never kicked');
    assert.notEqual(attacker.state, 'ground_kick');
  }
  Game.fighters = [];
  const diver = fighter(340, 1, 'jane'), standing = fighter(450, -1, 'walt');
  disableAI(diver, standing);
  diver.startDive();
  advanceUntil(() => standing.hp < 100, 90);
  assert.equal(standing.hp, 90, 'the preexisting flying kick still lands');
});

test('a fighter can keep distance or crouch and creep while watching a downed opponent', () => {
  for (const mode of ['keep_distance', 'inspect_down']) for (const dir of [1, -1]) {
    Game.fighters = [];
    const victim = fighter(480, dir, 'walt'); disableAI(victim);
    const rag = sleepingBody(victim, 0); rag.stunScale = 100; victim.x = rag.p.pel.x;
    const initialDistance = mode === 'keep_distance' ? 75 : 235;
    const attacker = fighter(victim.x + dir * initialDistance, -dir, 'jane');
    const ai = attacker.autopilot;
    ai.retreatP = 0; ai.attackWait = ai.farCD = ai.lampCheck = ai.hopCD = 100;
    const standingPelvis = attacker.rig.pel.y, startX = attacker.x, random = Math.random;
    try { Math.random = () => mode === 'keep_distance' ? .99 : .4; ai.update(1 / 60, attacker, victim, Game.fighters); }
    finally { Math.random = random; }
    assert.equal(ai.mode, mode);
    tick(.5);
    assert.equal(attacker.ctrl.crouch, mode === 'inspect_down');
    assert.ok((attacker.x - startX) * dir * (mode === 'keep_distance' ? 1 : -1) > 10);
    if (mode === 'inspect_down') {
      assert.ok(attacker.rig.pel.y > standingPelvis + 15, 'the watching fighter is visibly crouched');
      assert.ok(Math.abs(attacker.vx) < 80, 'the approach is a careful creep, not a sprint');
    } else assert.ok(Math.abs(attacker.x - victim.x) > initialDistance + 30);
    assert.equal(victim.hp, 100, 'the downed opponent is inspected, never kicked');
    victim.startGetup();
    Game.update(1 / 60);
    assert.equal(attacker.ctrl.crouch, false, 'watching stops as the opponent rises');
    assert.equal(ai.mode, 'engage');
  }
});

test('a fighter backs up, runs and cleanly jumps across a safely prone body at 30, 60 and 120 FPS', () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) for (const side of [1, -1]) {
    Game.fighters = [];
    const body = fighter(480, side, 'walt'); disableAI(body);
    const rag = sleepingBody(body, 0, dt); body.x = rag.p.pel.x; body.hp = 0;
    const jumper = fighter(body.x + side * 90, -side, 'jane');
    const ai = jumper.autopilot; ai.attackWait = ai.farCD = ai.lampCheck = ai.hopCD = 100;
    const random = Math.random;
    try { Math.random = () => 0; Game.update(dt); } finally { Math.random = random; }
    assert.equal(ai.mode, 'vault_retreat', 'even a corpse excluded as a combat target can be chosen as an obstacle');
    let ran = false, jumped = false, crossed = false, maxAway = 0;
    for (let frame = 0; frame < Math.ceil(5 / dt); frame++) {
      Game.update(dt);
      maxAway = Math.max(maxAway, (jumper.x - body.x) * side);
      if (jumper.state === 'run') ran = true;
      if (jumper.bodyJump) {
        jumped = true; assert.equal(jumper.dive, false, 'the old flying kick is not used as a vault');
        if (!crossed && (jumper.x - body.x) * side < -10) {
          crossed = true;
          assert.ok(jumper.y > 35, `the jumper clears the body while airborne (height ${jumper.y})`);
        }
      }
      if (crossed && jumper.state === 'idle' && !jumper.bodyJump) break;
    }
    assert.ok(maxAway > 170 && ran && jumped && crossed, JSON.stringify({ dt, side, maxAway, ran, jumped, crossed, mode: ai.mode }));
    assert.equal(jumper.state, 'idle'); assert.equal(jumper.hp, 100); assert.equal(body.hp, 0);
    assert.equal(jumper.rag, null, 'a successful jump lands without a forced tumble');
  }
});

test('vault planning rejects a fighter who may rise, aborts on recovery, and avoids arena walls', () => {
  const body = fighter(480, 1, 'walt'); disableAI(body);
  const rag = sleepingBody(body); body.x = rag.p.pel.x;
  const jumper = fighter(body.x + 90, -1); const ai = jumper.autopilot;
  assert.equal(ai.planVault(jumper, body), false, 'a normally recovering ragdoll may stand up at any moment');
  rag.stunScale = 100; body.fastGetup = true;
  assert.equal(ai.planVault(jumper, body), false, 'fast recovery is also unsafe');
  body.fastGetup = false;
  assert.equal(ai.planVault(jumper, body), true, 'a long-stunned grounded fighter is safe to vault');
  body.startGetup();
  ai.update(1 / 60, jumper, body, Game.fighters);
  assert.equal(ai.mode, 'engage'); assert.equal(ai.vaultTarget, null);

  Game.fighters = [];
  const edge = fighter(100, 1); disableAI(edge);
  const edgeRag = sleepingBody(edge); edge.x = edgeRag.p.pel.x; edge.hp = 0;
  const nearEdge = fighter(edge.x + 90, -1);
  assert.equal(nearEdge.autopilot.planVault(nearEdge, edge), false, 'there must be room on both sides');

  Game.fighters = [];
  const removed = fighter(480, 1); disableAI(removed);
  const removedRag = sleepingBody(removed); removed.x = removedRag.p.pel.x; removed.hp = 0;
  const observer = fighter(removed.x + 90, -1);
  assert.equal(observer.autopilot.planVault(observer, removed), true);
  Game.clearBodies();
  observer.autopilot.update(1 / 60, observer, null, Game.fighters);
  assert.equal(observer.autopilot.mode, 'engage');
  assert.equal(observer.autopilot.vaultTarget, null, 'removing the body cancels the run-up');
});

test('restored retreat and wait do not prevent a response to a hanging opponent', () => {
  for (const mode of ['retreat', 'wait', 'charge']) {
    const { f, o } = hangingPair();
    o.x = f.x + 65; o.buildRig(1 / 60); o.boxCD = 100;
    delete o.autopilot.update;
    const ai = o.autopilot;
    ai.setMode(mode); ai.attackWait = 0; ai.farCD = ai.lampCheck = 100;
    const random = Math.random;
    try { Math.random = () => .9; ai.update(1 / 60, o, f, Game.fighters); }
    finally { Math.random = random; }
    assert.equal(ai.hangResponse, 'strike');
    assert.equal(ai.mode, 'engage');
    assert.equal(o.ctrl.punch, true, `${mode} must not suppress the lamp response`);
  }
});

test('shoves, holds and body clearing remain safe in a crowded autonomous brawl', () => {
  seedRandom(379); Game.init(); Game.autoSpawn = false; Game.fighters = [];
  for (const [i, skin] of ['jane', 'negan', 'homelander', 'walt', 'saul'].entries()) fighter(120 + i * 175, i < 2 ? 1 : -1, skin);
  let shoves = 0, previous = new Map();
  for (let frame = 0; frame < 90 * 60; frame++) {
    if (frame > 0 && frame % (15 * 60) === 0) Game.spawnFighter(150 + (frame / 60 * 17) % (Game.W - 300));
    if (frame > 0 && frame % (20 * 60) === 0) Game.clearBodies();
    Game.update(1 / 60);
    for (const f of Game.fighters) {
      assert.ok(Number.isFinite(f.x) && Number.isFinite(f.y) && f.hp >= 0);
      if (f.state === 'shove' && previous.get(f.id) !== 'shove') shoves++;
      if (f.state === 'choke') assert.equal(f.chokeTarget?.chokedBy, f);
      if (f.state === 'choked') assert.equal(f.chokedBy?.chokeTarget, f);
      if (f.state === 'lamp_hang') assert.ok(f.lampRef?.riders.has(f));
      if (f.bodyJump) assert.ok(f.state === 'air' && !f.dive);
      previous.set(f.id, f.state);
    }
    for (const lamp of Game.lamps) if (lamp.occupant) assert.ok(Game.fighters.includes(lamp.occupant));
    if (frame % 900 === 0) Game.render();
  }
  assert.ok(shoves > 0, 'close-range pushes also occur with several opponents');
});

test('autonomous fights remain stable and use the new behavior at 30, 60 and 120 FPS', () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
    const counts = { shove: 0, guard: 0, watch: 0, kos: 0 };
    for (const seed of [19, 31, 57, 83]) {
      seedRandom(seed); Game.init();
      const previousState = new Map(), previousMode = new Map();
      for (let frame = 0; frame < Math.round(120 / dt); frame++) {
        Game.update(dt);
        for (const f of Game.fighters) {
          assert.ok(Number.isFinite(f.x) && Number.isFinite(f.y) && f.y >= 0 && f.hp >= 0);
          assert.ok(f.x >= f.minX - .01 && f.x <= f.maxX + .01);
          if (f.state === 'shove' && previousState.get(f.id) !== 'shove') counts.shove++;
          if (f.state === 'guard' && previousState.get(f.id) !== 'guard') counts.guard++;
          if (['keep_distance', 'inspect_down'].includes(f.autopilot.mode) && previousMode.get(f.id) !== f.autopilot.mode) counts.watch++;
          if (f.bodyJump) assert.ok(f.state === 'air' && !f.dive, 'a vault cannot turn into the flying kick');
          if (f.state === 'push_stagger') assert.ok(f.st < f.staggerDur + dt, 'a shove reaction cannot get stuck');
          if (f.state === 'choke') assert.equal(f.chokeTarget?.chokedBy, f);
          if (f.state === 'choked') assert.equal(f.chokedBy?.chokeTarget, f);
          if (f.state === 'lamp_hang') {
            assert.ok(f.lampRef?.riders.has(f));
            if (f.st > .3) {
              const p = f.lampRef.point(30 + f.lampClimb);
              assert.ok(distance(f.rig.wN, p) < 7 && distance(f.rig.wF, p) < 7);
            }
          }
          if (f.rag) for (const p of Object.values(f.rag.p)) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
          previousState.set(f.id, f.state); previousMode.set(f.id, f.autopilot.mode);
        }
        for (const lamp of Game.lamps) if (lamp.occupant) assert.equal(lamp.occupant.lampRef, lamp);
        if (frame === 0 || frame === Math.round(60 / dt)) Game.render();
      }
      counts.kos += Game.koCount;
    }
    console.log(`${Math.round(1 / dt)} FPS autonomous events:`, counts);
    for (const [name, count] of Object.entries(counts)) assert.ok(count > 0, `${name} did not occur at ${1 / dt} FPS`);
  }
});

test('seeded unattended fights actually use the new actions while preserving existing mechanics', () => {
  const counts = {
    stagger: 0, staggerKO: 0, kos: 0, getup: 0, jump: 0, verticalChase: 0, grab: 0, pull: 0, dive: 0, lampLeap: 0,
    retreat: 0, wait: 0, keepDistance: 0, inspect: 0, vault: 0, vaultCross: 0,
    shove: 0, shoveAfterHit: 0, shoveContact: 0, shoveFall: 0, shoveRecover: 0, proactiveGuard: 0,
  };
  const names = ['startStagger', 'startGetup', 'startLampJump', 'grabLamp', 'startLampPull', 'releaseLamp',
    'startShove', 'receiveShove', 'startBodyJump', 'startGuard'];
  const original = Object.fromEntries(names.map(name => [name, Fighter.prototype[name]]));
  try {
    for (const name of names) Fighter.prototype[name] = function (...args) {
      const result = original[name].apply(this, args);
      if (name === 'startStagger' && this.state === 'stagger_fall') {
        counts.stagger++;
        if (this.hp <= 0) counts.staggerKO++;
      }
      if (name === 'startGetup' && this.state === 'getup') counts.getup++;
      if (name === 'startLampJump' && result) {
        counts.jump++;
        if (this.autopilot.mode === 'vertical_chase') counts.verticalChase++;
      }
      if (name === 'grabLamp' && result) counts.grab++;
      if (name === 'startLampPull' && result) counts.pull++;
      if (name === 'releaseLamp' && args[0] === 'dive') counts.dive++;
      if (name === 'releaseLamp' && args[0] === 'jump') counts.lampLeap++;
      if (name === 'startShove' && result) {
        counts.shove++;
        if (this.lastHitTarget === args[0] && this.t - this.lastAttackEnd < .8) counts.shoveAfterHit++;
      }
      if (name === 'receiveShove' && result && this.state === 'push_stagger') counts.shoveContact++;
      if (name === 'startBodyJump' && result) counts.vault++;
      if (name === 'startGuard' && result && args[0]?.state !== 'attack') counts.proactiveGuard++;
      return result;
    };
    for (const seed of [19, 31, 57, 83, 101, 133, 177, 251, 277, 301, 389, 491, 601, 701, 809, 907]) {
      seedRandom(seed); Game.init();
      const previousMode = new Map(), previousState = new Map(), vaults = new Map();
      for (let frame = 0; frame < 240 * 60; frame++) {
        Game.update(1 / 60);
        assert.ok(Game.detachedLamps <= 2);
        for (const f of Game.fighters) {
          assert.ok(Number.isFinite(f.x) && Number.isFinite(f.y) && Number.isFinite(f.hp));
          assert.ok(!['ground_kick', 'quick_getup', 'scramble'].includes(f.state));
          assert.notEqual(f.autopilot.mode, 'tactical_retreat');
          if (f.state === 'lamp_hang') {
            assert.ok(f.lampRef && Game.lamps.includes(f.lampRef));
            assert.ok(f.lampRef.riders.has(f));
          }
          if (f.rag) for (const p of Object.values(f.rag.p)) {
            assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
          }
          const previous = previousMode.get(f.id), mode = f.autopilot.mode;
          if (mode === 'retreat' && previous !== 'retreat') counts.retreat++;
          if (mode === 'wait' && previous !== 'wait') counts.wait++;
          if (mode === 'keep_distance' && previous !== mode) counts.keepDistance++;
          if (mode === 'inspect_down' && previous !== mode) counts.inspect++;
          if (previousState.get(f.id) === 'push_stagger' && f.state === 'ragdoll') counts.shoveFall++;
          if (previousState.get(f.id) === 'push_stagger' && f.state === 'idle') counts.shoveRecover++;
          if (f.bodyJump && f.autopilot.vaultTarget && !vaults.has(f.id)) {
            vaults.set(f.id, { body: f.autopilot.vaultTarget, side: f.autopilot.vaultSide, crossed: false });
          }
          const vault = vaults.get(f.id);
          if (vault && f.bodyJump && !vault.crossed && (f.x - vault.body.x) * vault.side < -10) {
            counts.vaultCross++; vault.crossed = true;
          }
          if (!f.bodyJump && vault) vaults.delete(f.id);
          previousMode.set(f.id, mode); previousState.set(f.id, f.state);
        }
        for (const lamp of Game.lamps) {
          if (!lamp.detached) assert.ok(lamp.y <= Game.H / 2);
          if (lamp.occupant) assert.equal(lamp.occupant.lampRef, lamp);
        }
      }
      counts.kos += Game.koCount;
    }
    console.log('autonomous combat and downed-opponent events:', counts);
    for (const [name, count] of Object.entries(counts)) assert.ok(count > 0, `${name} never happened autonomously`);
    // Pursuit of someone on the upper bridge is purposeful navigation, not a
    // random lamp stunt. Keep the rarity limit on optional same-level jumps.
    const optionalJumps = counts.jump - counts.verticalChase;
    assert.ok(optionalJumps < 35 && optionalJumps < counts.kos * .4,
      'optional lamp stunts stay rare while fighters can pursue up the bridge');
  } finally {
    for (const name of names) Fighter.prototype[name] = original[name];
  }
});

// Injury and the more mobile defensive behavior.
test('Shift commands the first living fighter to crouch, and Homelander lands before lowering', () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
    Game.fighters = [];
    const first = fighter(350, 1, 'homelander'), second = fighter(650, -1);
    disableAI(second);
    first.hoverY = 19;
    const standing = first.rig.pel.y;
    Game.shiftCrouch = true;
    Game.update(dt);
    assert.equal(first.ctrl.crouch, true);
    assert.equal(first.crouchActive, false, 'hovering Homelander does not squat in midair');
    assert.ok(first.hoverY > .7);
    advanceUntil(() => first.crouchActive, Math.ceil(.6 / dt), dt);
    assert.ok(first.hoverY <= .7, 'his hover is at the floor before the crouch begins');
    tick(.3, dt);
    assert.ok(first.rig.pel.y > standing + 18, 'the crouch visibly lowers the hips');
    assert.ok((first.rig.sh.x - first.rig.pel.x) * first.dir > 30, 'the torso leans forward');
    assert.equal(second.ctrl.crouch, false, 'only the first living fighter is controlled');
    Game.shiftCrouch = false;
    first.autopilot.update = () => { first.ctrl.crouch = false; };
    tick(.2, dt);
    assert.equal(first.crouchActive, false);
  }
});

test('a committed crouch ducks real bare-handed strikes but not a knee or bat', () => {
  for (const dir of [1, -1]) for (const attack of ['jab', 'cross', 'knee', 'bat']) {
    Game.fighters = [];
    const defender = fighter(440, dir), attacker = fighter(440 + dir * 90, -dir, attack === 'bat' ? 'negan' : 'jane');
    disableAI(defender, attacker);
    defender.ctrl.crouch = true; tick(.25);
    assert.equal(defender.crouchActive, true);
    const hp = defender.hp;
    assert.equal(attacker.startAttack(attack === 'cross' ? 1 : attack === 'knee' ? 2 : 0), true);
    tick(.31);
    if (attack === 'jab' || attack === 'cross') {
      assert.equal(defender.hp, hp, `${attack} should pass over the crouching fighter`);
      assert.equal(attacker.connected, false);
    } else assert.ok(defender.hp < hp, `${attack} is not a bare-handed punch`);
  }
});

test('both extended guard arms visibly wobble after impact and an NPC can shuffle in both directions', () => {
  const defender = fighter(410, 1), attacker = fighter(570, -1); disableAI(defender, attacker);
  assert.equal(defender.startGuard(attacker), true);
  defender.guardMoves = true; defender.guardPhase = 0; defender.guardDur = 2.3;
  tick(.12);
  const before = { N: { ...defender.rig.wN }, F: { ...defender.rig.wF } };
  defender.takeHit(attacker, punch);
  defender.buildRig(1 / 60);
  assert.ok(distance(before.N, defender.rig.wN) > 1, 'near fist reacts to the blocked hit');
  assert.ok(distance(before.F, defender.rig.wF) > 1, 'far fist reacts to the blocked hit');
  assert.ok(defender.guardShakeX >= 3.5 && defender.guardShakeY >= 3);
  Game.hs = 0;
  const positions = [];
  for (let i = 0; i < 100; i++) { Game.update(1 / 60); positions.push(defender.x); }
  const deltas = positions.slice(1).map((x, i) => x - positions[i]);
  assert.ok(deltas.some(d => d > .05) && deltas.some(d => d < -.05), 'guard shuffles forwards and backwards');
  assert.equal(defender.state, 'guard');
});

test('blocked punches and shoves make the torso rock lightly with the hands and then settle', () => {
  for (const dir of [1, -1]) for (const cause of ['punch', 'shove']) {
    Game.fighters = [];
    const defender = fighter(450, dir), attacker = fighter(450 + dir * 75, -dir); disableAI(defender, attacker);
    assert.equal(defender.startGuard(attacker), true);
    defender.guardMoves = false; tick(.2);
    defender.buildRig(0);
    const still = Object.fromEntries(['sh', 'head', 'pel', 'kN', 'kF', 'wN', 'wF'].map(k => [k, { ...defender.rig[k] }]));
    if (cause === 'punch') defender.takeHit(attacker, punch);
    else defender.receiveShove(attacker);
    defender.guardShakeX = 5;
    defender.guardShakePhase = Math.PI / 2 - defender.t * 42;
    defender.buildRig(0);
    const full = distance(still.sh, defender.rig.sh);
    assert.ok(full > 1 && full < 5, `${cause}/${dir}: a small upper-body reaction`);
    assert.ok(distance(still.head, defender.rig.head) > 1, 'head follows the rocking torso');
    assert.ok(distance(still.wN, defender.rig.wN) > 1 && distance(still.wF, defender.rig.wF) > 1);
    for (const k of ['pel', 'kN', 'kF']) assert.ok(distance(still[k], defender.rig[k]) < 1e-6, `${k} stays planted`);
    defender.guardFlinch = .1; defender.buildRig(0);
    assert.ok(distance(still.sh, defender.rig.sh) < full * .6, 'the wobble decays');
    defender.guardFlinch = 0; defender.buildRig(0);
    assert.ok(distance(still.sh, defender.rig.sh) < 1e-6, 'the original guard pose returns');
  }
});

test('a hit on a grounded runner slows them quickly without a fall; a jumping runner falls', () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) for (const a of [punch, launchPunch]) {
    Game.fighters = [];
    const runner = fighter(400, 1), attacker = fighter(600, -1); disableAI(runner, attacker);
    runner.state = 'run'; runner.vx = 480; runner.ctrl.run = true; runner.ctrl.mx = 1;
    runner.takeHit(attacker, a);
    assert.equal(runner.state, 'run_hit_stop'); assert.equal(runner.rag, null);
    const initial = Math.abs(runner.vx), x = runner.x;
    Game.hs = 0;
    tick(.3, dt);
    assert.ok(runner.x > x && Math.abs(runner.vx) < initial * .2, 'forward momentum decays smoothly');
    assert.notEqual(runner.state, 'ragdoll');
    advanceUntil(() => runner.state === 'idle', Math.ceil(1.5 / dt), dt);
    runner.y = .5; runner.vy = 770; runner.state = 'air';
    runner.takeHit(attacker, a);
    assert.equal(runner.state, 'ragdoll', 'even the beginning of a jump is airborne and falls');
    Game.fighters = [];
    const jumper = fighter(400, 1), striker = fighter(600, -1); disableAI(jumper, striker);
    jumper.y = 70; jumper.vy = 100; jumper.state = 'air';
    jumper.takeHit(striker, a);
    assert.equal(jumper.state, 'ragdoll', 'the same hit knocks an airborne fighter down');
  }
});

test('ground wrestling and the underarm lift are removed, while the rear choke remains', () => {
  assert.doesNotMatch(source, /takedown|ground_pin|ground_choke|pinned|lift_hold|lift_jump|lifted|grappleTarget|grappleBy|startLift|startTakedown|low_approach|lift_approach/i);
  for (const skin of ['jane', 'negan', 'homelander', 'walt', 'saul']) {
    Game.fighters = [];
    const f = fighter(400, 1, skin), opponent = fighter(470, -1); disableAI(f, opponent);
    for (const method of ['startTakedown', 'establishPin', 'startGroundChoke', 'startLift', 'releaseGrapple', 'breakGrapple'])
      assert.equal(typeof f[method], 'undefined', `${skin}: ${method} is removed`);
    assert.equal(typeof f.startChoke, 'function');
    assert.equal(typeof f.beginCounter, 'function');
    f.ctrl.crouch = true; tick(.5);
    assert.equal(f.state, 'idle', 'crouching by an opponent cannot start a removed hold');
    assert.equal(opponent.state, 'idle');
  }
});

test('only rare very strong impacts cause an attached, dark pixel wound that drips to the floor', () => {
  for (const [pw, roll, shouldBleed] of [[.4, 0, false], [1, .99, false], [1, 0, true]]) {
    Game.fighters = [];
    const victim = fighter(420, 1), attacker = fighter(510, -1); disableAI(victim, attacker);
    const random = Math.random;
    try { Math.random = () => roll; victim.takeHit(attacker, { ...punch, pw, noStagger: true }); }
    finally { Math.random = random; }
    assert.equal(!!victim.bleed, shouldBleed, `power ${pw}, roll ${roll}`);
  }
  Game.fighters = [];
  const victim = fighter(420, 1), attacker = fighter(620, -1); disableAI(victim, attacker);
  const start = { x: (victim.rig.sh.x + victim.rig.pel.x) / 2, y: (victim.rig.sh.y + victim.rig.pel.y) / 2 };
  assert.equal(victim.startBleeding(start.x, start.y, attacker), true);
  assert.equal(victim.startBleeding(start.x, start.y, attacker), false, 'a wound is not duplicated');
  assert.equal(victim.bleed.mark.seg, 'torso');
  const p = surfacePoint(victim.rig, victim.bleed.mark);
  victim.ctrl.mx = 1; tick(.3);
  const moved = surfacePoint(victim.rig, victim.bleed.mark);
  assert.ok(moved.x > p.x + 10, 'the wound follows its animated body segment');
  victim.ctrl.mx = 0; tick(.7);
  assert.ok(victim.bleed.flowTime >= .9 && victim.hp < 99, 'uncovered bleeding costs moderate health');
  Game.render();
  assert.ok(Game.bodyLayer.ctx.stats.colors.has('#690c1a'), 'dark pixels are drawn on the body layer');
  tick(.7);
  assert.ok(Game.fx.bloodField.cells.size > 0, 'small drops land and remain on the floor');
  Game.render();
  assert.ok(Game.bloodLayer.ctx.stats.colors.has('#5e0916'), 'floor drops are rendered as dark pixels');
  Game.clearBlood();
  assert.ok(victim.bleed, 'washing away stains does not silently heal an active wound');
});

test('pressing a reachable wound stops flow and damage, occupies one arm, and leaves the other arm usable', () => {
  for (const skin of ['jane', 'negan', 'homelander']) for (const dir of [1, -1]) {
    Game.fighters = [];
    const victim = fighter(400, dir, skin), attacker = fighter(650, -dir); disableAI(victim, attacker);
    const r = victim.rig, p = { x: (r.sh.x + r.pel.x) / 2, y: (r.sh.y + r.pel.y) / 2 };
    victim.startBleeding(p.x, p.y, attacker);
    assert.equal(victim.startPressure(), true); victim.bleed.pressT = 3;
    const hp = victim.hp, flow = victim.bleed.flowTime;
    tick(.4);
    const wp = surfacePoint(victim.rig, victim.bleed.mark);
    assert.ok(distance(victim.rig[`w${victim.bleed.arm}`], wp) < 8, 'the bent hand covers the wound');
    assert.equal(victim.hp, hp); assert.equal(victim.bleed.flowTime, flow);
    const blocked = victim.bleed.arm === 'N' ? 0 : 1;
    const free = victim.bleed.arm === 'N' ? 1 : 0;
    assert.equal(victim.startAttack(blocked), false, 'the pressing hand cannot attack');
    assert.equal(victim.startAttack(free), true, 'the free hand can still strike');
    assert.notEqual(victim.atk.fist, victim.bleed.arm);
    tick(.5);
    assert.equal(victim.hp, hp, 'pressure remains applied during a free-hand attack');
    victim.bleed.pressT = 0;
    tick(.5);
    assert.equal(victim.bleed.pressing, false);
    assert.ok(victim.hp < hp, 'bleeding resumes when pressure is released');
  }
});

test('blood loss weakens walking and running, ends in a slow collapse, and stops shortly after death', () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
    Game.fighters = []; Game.koCount = 0;
    const f = fighter(300, 1), sourceF = fighter(800, -1); disableAI(f, sourceF);
    const p = { x: (f.rig.sh.x + f.rig.pel.x) / 2, y: (f.rig.sh.y + f.rig.pel.y) / 2 };
    f.startBleeding(p.x, p.y, sourceF);
    const healthy = f.speedMul();
    f.bleed.lost = 25; f.hp = 20;
    assert.ok(f.speedMul() < healthy * .6, 'blood loss reduces walking speed');
    f.state = 'run'; f.ctrl.run = true; f.ctrl.mx = 1; f.vx = 0;
    tick(.6, dt);
    assert.ok(Math.abs(f.vx) < 320, 'the same weakness reduces running speed');
    f.state = 'idle'; f.ctrl.run = false; f.ctrl.mx = 0; f.vx = 0; f.hp = .6;
    const oldBloodParticles = Game.fx.bl.filter(b => !b.drip).length;
    advanceUntil(() => f.hp <= 0, Math.ceil(1 / dt), dt);
    assert.equal(f.state, 'bleed_collapse'); assert.equal(f.rag, null, 'death does not instantly launch a ragdoll');
    assert.equal(Game.koCount, 1); assert.equal(Game.tsT, 0, 'no impact hit-stop');
    assert.ok(Game.fx.bl.filter(b => !b.drip).length <= oldBloodParticles, 'no explosive KO blood spray');
    tick(.6, dt); assert.equal(f.state, 'bleed_collapse');
    advanceUntil(() => f.state === 'ragdoll', Math.ceil(2 / dt), dt);
    advanceUntil(() => f.bleed.stopped, Math.ceil(4 / dt), dt);
    const flow = f.bleed.flowTime;
    tick(1, dt);
    assert.equal(f.bleed.flowTime, flow, 'bleeding stops after death');
    assert.equal(Game.koCount, 1);
  }
});

test('unattended fights keep defensive moves and rear chokes without the removed holds', () => {
  const counts = { duck: 0, duckDodge: 0, space: 0, bleeding: 0, pressure: 0 };
  const forbiddenStates = ['takedown', 'ground_pin', 'ground_choke', 'pinned', 'lift_hold', 'lift_jump', 'lifted'];
  const forbiddenModes = ['low_approach', 'lift_approach'];
  const dodges = new Set();
  const names = ['startBleeding', 'startPressure', 'tryHit'];
  const originals = Object.fromEntries(names.map(name => [name, Fighter.prototype[name]]));
  try {
    for (const name of names) Fighter.prototype[name] = function (...args) {
      const result = originals[name].apply(this, args);
      if (name === 'tryHit' && this.dodgedBy?.crouchActive && args[0]?.fist) {
        const key = `${this.id}:${this.atkStamp}`;
        if (!dodges.has(key)) { dodges.add(key); counts.duckDodge++; }
      }
      if (name === 'startBleeding' && result) counts.bleeding++;
      if (name === 'startPressure' && result) counts.pressure++;
      return result;
    };
    for (const seed of [19, 31, 57, 83, 101, 133, 177, 251, 277, 301, 389, 491, 601, 701, 809, 907]) {
      seedRandom(seed); Game.init();
      const modes = new Map();
      for (let frame = 0; frame < 240 * 60; frame++) {
        Game.update(1 / 60);
        for (const f of Game.fighters) {
          const mode = f.autopilot.mode, prev = modes.get(f.id);
          if (prev !== mode) {
            if (mode === 'duck') counts.duck++;
            if (mode === 'space_out') counts.space++;
          }
          modes.set(f.id, mode);
          assert.ok(Number.isFinite(f.x) && Number.isFinite(f.y) && Number.isFinite(f.hp));
          assert.ok(!forbiddenStates.includes(f.state), `removed state: ${f.state}`);
          assert.ok(!forbiddenModes.includes(mode), `removed AI mode: ${mode}`);
          if (f.state === 'choke') assert.equal(f.chokeTarget?.chokedBy, f);
          if (f.state === 'choked') assert.equal(f.chokedBy?.chokeTarget, f);
        }
      }
    }
    console.log('defensive and injury events:', counts);
    for (const [key, count] of Object.entries(counts)) assert.ok(count > 0, `${key} never occurred autonomously`);
  } finally { for (const name of names) Fighter.prototype[name] = originals[name]; }
});

test('the audience breathes and walks without posters or combat randomness', () => {
  const saved = Math.random;
  try {
    Math.random = () => { throw new Error('cosmetic audience must not use combat RNG'); };
    const audience = new Audience(960, 468, 99);
    assert.equal(audience.signs, undefined);
    assert.equal(audience.createSign, undefined);
    const before = audience.people.map(p => p.x);
    assert.equal(audience.startWalker(), true);
    audience.update(.7);
    assert.ok(audience.people.some((p, i) => p.x !== before[i]), 'a few spectators change position');
    const g = makeCanvas().getContext('2d'), rects = [];
    g.fillRect = (...values) => rects.push(values);
    audience.draw(g); const first = JSON.stringify(rects);
    assert.ok(rects.every(([, , width, height]) => width <= 36 && height <= 27), 'no large sign-shaped rectangles');
    rects.length = 0; audience.time += 1.1; audience.draw(g);
    assert.notEqual(JSON.stringify(rects), first, 'subtle breathing changes the pixel silhouettes');
    const x = audience.people[3].x;
    audience.resize(800, 468);
    assert.ok(Math.abs(audience.people[3].x - x * 800 / 960) < .01);
    const timed = new Audience(960, 468, 1234);
    let sawWalker = false;
    for (let i = 0; i < 700; i++) {
      timed.update(.1);
      sawWalker ||= timed.people.some(p => p.walkLeft > 0);
      assert.equal(timed.signs, undefined, 'no signs appear over time');
    }
    assert.ok(sawWalker, 'ordinary updates occasionally start a walker');
  } finally { Math.random = saved; }
});

test('the crowd cheers only a final KO, settles, and also celebrates bleed-out KOs', () => {
  const a = fighter(350, 1, 'jane'), b = fighter(560, -1, 'walt'); disableAI(a, b);
  const crowd = Game.audience;
  b.toRagdoll(0, 0);
  tick(.2);
  assert.equal(crowd.cheerCount, 0, 'a recoverable knockdown does not make the crowd cheer');
  Game.ko(b, a, { preserveRagdoll: true, pw: .7 });
  assert.equal(crowd.cheerCount, 1); assert.ok(crowd.cheerLeft > 2);
  tick(3);
  assert.equal(crowd.cheerLeft, 0);
  const c = fighter(700, -1, 'saul'); disableAI(c);
  Game.ko(c, a, { bleedOut: true });
  assert.equal(crowd.cheerCount, 2, 'blood-loss KO also triggers a single celebration');
});

test('isolated drops grow and fuse into one connected, uniformly filled pool with a shared boundary', () => {
  const field = new BloodField(960, 468, 1234);
  const first = field.add(300, 480, 'drip');
  field.add(360, 480, 'drip');
  assert.equal(field.groups.size, 2); assert.equal(first.cells.size, 2);
  assert.equal(field.puddleAtFoot(300, 468), null, 'one drop is not a splashable puddle');
  const initial = field.cells.size;
  for (let i = 1; i <= 9; i++) field.add(300 + i * 6, 480 + (i % 2 ? 3 : 0), 'drip');
  assert.equal(field.groups.size, 1, 'nearby deposits must join both clusters');
  const pool = [...field.groups][0];
  assert.ok(pool.cells.size > initial + 30); assert.ok(field.isPuddle(pool));
  assert.equal(field.puddleAtFoot(325, 468), pool);
  // Every occupied pixel belongs to one four-connected component; no two
  // overlapping stamp borders or disconnected pieces hide in this pool.
  const todo = [pool.cells.values().next().value], visited = new Set(todo);
  while (todo.length) {
    const k = todo.pop();
    for (const n of [k - 1024, k + 1024, k - 1, k + 1])
      if (pool.cells.has(n) && !visited.has(n)) { visited.add(n); todo.push(n); }
  }
  assert.equal(visited.size, pool.cells.size);
  const g = makeCanvas().getContext('2d'); field.drawBase(g);
  assert.deepEqual([...g.stats.colors].sort(), ['#5e0916', '#790e1b'].sort(), 'only boundary and near-solid fill colors');
  field.add(700, 490, 'drip');
  assert.equal(field.groups.size, 2, 'distant droplets stay separate');
});

test('puddle reflections are clipped to substantial pools and follow moving fighters and lamps', () => {
  const field = Game.fx.bloodField, f = fighter(450, 1, 'jane'); disableAI(f);
  field.add(450, Game.gy + 10, 'drip');
  const mask = makeCanvas(), maskContext = mask.getContext('2d');
  field.drawReflectionMask(maskContext);
  assert.equal(maskContext.stats.rect, 0, 'isolated drops do not get a reflected scene');
  for (let i = 0; i < 12; i++) field.add(450 + Math.sin(i) * 3, Game.gy + 10, 'seep');
  assert.ok(field.hasPuddles()); field.drawReflectionMask(maskContext);
  assert.ok(maskContext.stats.rect > 0);
  const g = makeCanvas().getContext('2d');
  const paths = []; g.moveTo = (x, y) => paths.push([x, y]); g.lineTo = (x, y) => paths.push([x, y]);
  field.drawReflections(g, [f], Game.lamps, .5, mask);
  assert.ok(g.stats.composites.has('destination-in')); assert.ok(g.stats.stroke > 0);
  assert.ok(g.stats.colors.has('rgba(241,183,160,.16)'));
  assert.ok(g.stats.colors.has('rgba(255,218,170,.18)'));
  const before = JSON.stringify(paths); paths.length = 0;
  f.x += 35; f.buildRig(1 / 60);
  field.drawReflections(g, [f], Game.lamps, .7, mask);
  assert.notEqual(JSON.stringify(paths), before, 'the reflected pose moves with the fighter');
  Game.render(); const baseDraws = Game.bloodLayer.ctx.stats.rect;
  Game.render(); assert.equal(Game.bloodLayer.ctx.stats.rect, baseDraws, 'unchanged blood base is cached');
  field.add(700, Game.gy + 10, 'drip'); Game.render();
  assert.ok(Game.bloodLayer.ctx.stats.rect > baseDraws, 'new blood invalidates the cache');
});

test('real sprinting footfalls splash significant puddles in either direction at 30, 60 and 120 FPS', () => {
  const fx = Game.fx, originalSplash = fx.splash.bind(fx); let splashes = 0;
  fx.splash = (...args) => { splashes++; originalSplash(...args); };
  try {
    for (const dt of [1 / 30, 1 / 60, 1 / 120]) for (const dir of [1, -1]) {
      Game.fighters = []; fx.clearBlood(); splashes = 0;
      const start = dir === 1 ? 230 : Game.W - 230;
      const f = fighter(start, dir, 'jane'); disableAI(f);
      const center = start + dir * 100;
      for (let i = 0; i < 25; i++) fx.bloodField.add(center + Math.sin(i * 2) * 5, Game.gy + 9 + Math.cos(i) * 3, 'seep');
      f.state = 'run'; f.ctrl.mx = dir; f.ctrl.run = true; f.vx = dir * 430; f.walkPh = 0; f.lastSign = -1;
      const contacts = [], resolve = f.resolveBloodFootfall.bind(f);
      f.resolveBloodFootfall = (elapsed) => {
        const foot = f.bloodFootfall?.foot;
        if (foot) {
          const ankle = f.rig['a' + foot], fd = f.rig['fd' + foot];
          contacts.push({ x: ankle.x + fd.x * 7, y: ankle.y, body: f.x, foot });
        }
        resolve(elapsed);
      };
      for (let i = 0; i < Math.ceil(1.1 / dt) && !splashes; i++) Game.update(dt);
      assert.ok(splashes > 0, `${dt}s direction ${dir} should hit the pool; contacts ${JSON.stringify(contacts)}`);
      assert.ok(f.footBlood.N || f.footBlood.F);
      assert.ok(fx.bl.some(p => p.splash), 'small airborne splash particles are emitted');
    }
  } finally { fx.splash = originalSplash; }
});

test('small drops leave a faint stain without splashing; soft steps and hovering do not splash', () => {
  const f = fighter(420, 1, 'jane'); disableAI(f);
  const field = Game.fx.bloodField, x = f.rig.aN.x + f.rig.fdN.x * 7;
  let calls = 0; const splash = Game.fx.splash.bind(Game.fx);
  Game.fx.splash = (...args) => { calls++; splash(...args); };
  try {
    field.add(x, Game.gy + 9, 'drip');
    f.queueBloodFootfall('N', 1); f.resolveBloodFootfall();
    assert.equal(calls, 0); assert.ok(f.footBlood.N > 0 && f.footBlood.N < 1.5);
    for (let i = 0; i < 16; i++) field.add(x + Math.sin(i) * 3, Game.gy + 9, 'seep');
    f.onLand(300); f.update(1 / 60, null, [f]);
    assert.equal(calls, 0, 'soft landing');
    f.y = 40; f.queueBloodFootfall('N', 1); f.resolveBloodFootfall(); f.y = 0;
    f.hoverY = 19; f.queueBloodFootfall('N', 1); f.resolveBloodFootfall(); f.hoverY = 0;
    assert.equal(calls, 0, 'airborne and hovering feet are not in the puddle');
    f.onLand(700); f.update(1 / 60, null, [f]);
    assert.ok(calls > 0); assert.ok(f.footBlood.N > 0);
  } finally { Game.fx.splash = splash; }
});

test('puddle blood is masked into each skin shoe and lower leg, follows pose and clears without healing bleeding', () => {
  for (const skin of ['jane', 'negan', 'homelander', 'walt', 'saul']) for (const dir of [1, -1]) {
    Game.fighters = []; Game.fx.clearBlood();
    const f = fighter(480, dir, skin); disableAI(f);
    if (skin === 'homelander') { f.hoverY = 0; f.ctrl.crouch = true; f.update(1 / 60, null, [f]); }
    const x = f.rig.aN.x + f.rig.fdN.x * 7;
    for (let i = 0; i < 18; i++) Game.fx.bloodField.add(x + Math.sin(i) * 3, Game.gy + 9, 'seep');
    f.onLand(700); f.update(1 / 60, null, [f]);
    assert.ok(f.footBlood.N > 0, `${skin} ${dir} stains the actual contacting leg`);
    const shoe = stainedSkinSprite(SK_[skin].bootF, 'boot', f.footBlood.N);
    const trouser = stainedSkinSprite(SK_[skin].shinF, 'shin', f.footBlood.N);
    assert.notEqual(shoe, SK_[skin].bootF); assert.notEqual(trouser, SK_[skin].shinF);
    assert.ok(shoe.getContext('2d').stats.composites.has('source-atop'));
    assert.ok(trouser.getContext('2d').stats.composites.has('source-atop'));
    assert.ok(shoe.getContext('2d').stats.colors.has('#8c1724'));
    const seen = [], body = Game.bodyLayer.ctx, oldDraw = body.drawImage;
    body.drawImage = (...args) => { seen.push(args[0]); oldDraw(...args); };
    f.x += dir * 100; f.dir = -dir; f.buildRig(1 / 60); Game.render();
    assert.ok(seen.includes(shoe) && seen.includes(trouser), 'both stained sprites travel and flip with the fighter');
    seen.length = 0; f.toRagdoll(0, 0); f.update(1 / 60, null, [f]); Game.render();
    assert.ok(seen.includes(shoe) && seen.includes(trouser), 'stains also follow the ragdoll');
    body.drawImage = oldDraw;
    f.bleed = { mark: { layer: 'head', seg: 'head', lx: 0, ly: 0 }, stopped: true };
    Game.clearBlood();
    assert.deepEqual(f.footBlood, { N: 0, F: 0 });
    assert.equal(Game.fx.bloodField.cells.size, 0); assert.equal(Game.fx.bl.length, 0);
    assert.ok(f.bleed, 'washing blood does not heal the wound');
  }
});

test('each knee and elbow stains on real blood contact and follows its own two limb sprites', () => {
  const spec = {
    kN: ['thighF', 'knee-thigh', 'shinF', 'knee-shin'],
    kF: ['thighB', 'knee-thigh', 'shinB', 'knee-shin'],
    eN: ['uArmF', 'elbow-upper', 'lArmF', 'elbow-lower'],
    eF: ['uArmB', 'elbow-upper', 'lArmB', 'elbow-lower'],
  };
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) for (const skin of ['jane', 'negan', 'homelander', 'walt', 'saul'])
    for (const dir of [1, -1]) for (const joint of Object.keys(spec)) {
      Game.fighters = []; Game.fx.clearBlood();
      const f = fighter(480, dir, skin); disableAI(f);
      f.toRagdoll(0, 0, true); f.rag.frozen = true;
      for (const [i, k] of Object.keys(spec).entries()) {
        f.rag.p[k].x = 130 + i * 70; f.rag.p[k].y = Game.gy - 40;
      }
      const point = f.rag.p[joint]; point.x = 480; point.y = Game.gy - point.r;
      f.buildRig(0);
      const field = Game.fx.bloodField;
      field.add(480, Game.gy + 9, 'drip');
      f.resolveBloodJointContacts(dt);
      const faint = f.jointBlood[joint];
      assert.ok(faint > 0 && faint < .2, 'an isolated drop stains only faintly');
      for (let i = 0; i < 18; i++) field.add(480 + Math.sin(i) * 3, Game.gy + 9, 'seep');
      point.y -= 12; f.buildRig(0); f.resolveBloodJointContacts(dt);
      assert.equal(f.jointBlood[joint], faint, 'an airborne joint cannot pick up more blood');
      point.y += 12; f.update(dt, null, [f]);
      const level = f.jointBlood[joint];
      assert.ok(level > faint, `${skin}/${dir}/${joint}/${dt}: a pool stains more strongly`);
      for (const other of Object.keys(spec).filter(k => k !== joint)) assert.equal(f.jointBlood[other], 0);
      assert.ok(!Game.fx.bl.some(p => p.splash), 'resting a joint is not a strong footstep');
      const [a, pa, b, pb] = spec[joint], first = stainedSkinSprite(SK_[skin][a], pa, level), second = stainedSkinSprite(SK_[skin][b], pb, level);
      assert.notEqual(first, SK_[skin][a]); assert.notEqual(second, SK_[skin][b]);
      assert.ok(first.getContext('2d').stats.composites.has('source-atop'));
      assert.ok(second.getContext('2d').stats.composites.has('source-atop'));
      const seen = [], contexts = [Game.bodyLayer.ctx, Game.frontLayer.ctx], old = contexts.map(g => g.drawImage);
      contexts.forEach((g, i) => { g.drawImage = (...args) => { seen.push(args[0]); old[i](...args); }; });
      try {
        Game.render();
        assert.ok(seen.includes(first) && seen.includes(second), 'both sides of the joint are drawn while prone');
        seen.length = 0;
        f.state = 'idle'; f.rag = null; f.x += 75 * dir; f.dir = -dir; f.cur = null; f.buildRig(dt); Game.render();
        assert.ok(seen.includes(first) && seen.includes(second), 'the stains move, bend and flip with the same limbs');
      } finally { contexts.forEach((g, i) => { g.drawImage = old[i]; }); }
      f.bleed = { mark: { layer: 'head', seg: 'head', lx: 0, ly: 0 }, stopped: true };
      Game.clearBlood();
      assert.deepEqual(f.jointBlood, { kN: 0, kF: 0, eN: 0, eF: 0 });
      assert.ok(f.bleed, 'clearing the stains does not heal a wound');
    }
});

test('shoe and knee stains combine on the same leg and saturated joints stop rechecking pools', () => {
  const f = fighter(480, 1, 'jane'); disableAI(f);
  const field = Game.fx.bloodField, x = f.rig.aN.x + f.rig.fdN.x * 7;
  for (let i = 0; i < 20; i++) field.add(x + Math.sin(i) * 3, Game.gy + 9, 'seep');
  f.onLand(700); f.update(1 / 60, null, [f]);
  assert.ok(f.footBlood.N > 0);
  f.toRagdoll(0, 0, true); f.rag.frozen = true;
  const knee = f.rag.p.kN; knee.x = x; knee.y = Game.gy - knee.r;
  f.update(1 / 60, null, [f]);
  assert.ok(f.jointBlood.kN > 0);
  const foot = stainedSkinSprite(SK_.jane.shinF, 'shin', f.footBlood.N);
  const combined = stainedSkinSprite(foot, 'knee-shin', f.jointBlood.kN);
  assert.notEqual(combined, foot);
  assert.ok(combined.getContext('2d').stats.composites.has('source-atop'));
  const seen = [], g = Game.bodyLayer.ctx, oldDraw = g.drawImage;
  try {
    g.drawImage = (...args) => { seen.push(args[0]); oldDraw(...args); };
    Game.render(); assert.ok(seen.includes(combined), 'the same moving shin keeps both separate stains');
  } finally { g.drawImage = oldDraw; }
  f.jointBlood = { kN: 3, kF: 3, eN: 3, eF: 3 };
  let queries = 0; const contactAtFoot = field.contactAtFoot;
  try {
    field.contactAtFoot = (...args) => { queries++; return contactAtFoot.apply(field, args); };
    f.resolveBloodJointContacts(1 / 60);
    assert.equal(queries, 0, 'fully stained limbs avoid redundant puddle scans');
  } finally { field.contactAtFoot = contactAtFoot; }
  Game.clearBlood();
  assert.deepEqual(f.footBlood, { N: 0, F: 0 });
  assert.deepEqual(f.jointBlood, { kN: 0, kF: 0, eN: 0, eF: 0 });
});

test('naturally falling ragdolls pick up knee or elbow blood at 30, 60 and 120 FPS', () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) for (const dir of [1, -1]) {
    Game.fighters = []; Game.fx.clearBlood();
    const f = fighter(480, dir, 'jane'); disableAI(f);
    const field = Game.fx.bloodField;
    for (let x = 230; x <= 730; x += 9)
      for (let n = 0; n < 4; n++) field.add(x + n, Game.gy + 9, 'seep');
    f.toRagdoll(dir * 120, 240); f.rag.stunScale = 10;
    for (let i = 0; i < Math.ceil(3 / dt) && !Object.values(f.jointBlood).some(Boolean); i++) Game.update(dt);
    assert.ok(Object.values(f.jointBlood).some(Boolean), `natural ragdoll contact at ${dt}s, direction ${dir}`);
  }
});

test('blood and animated audience persist through responsive resizing and render behind the fence', () => {
  const f = fighter(400, 1, 'jane'); disableAI(f);
  const field = Game.fx.bloodField;
  for (let i = 0; i < 10; i++) field.add(400 + Math.sin(i) * 3, Game.gy + 8, 'seep');
  const cells = field.cells.size, audience = Game.audience;
  const width = globalThis.innerWidth, height = globalThis.innerHeight, oldDraw = Game.ctx.drawImage;
  const painted = [];
  try {
    globalThis.innerWidth = 390; globalThis.innerHeight = 844; Game.resize();
    Game.ctx.drawImage = (...args) => { painted.push(args[0]); oldDraw(...args); };
    Game.render();
    assert.equal(Game.audience, audience); assert.equal(field.cells.size, cells);
    assert.ok(field.puddleAtFoot(400, Game.gy));
    assert.ok(Game.audienceLayer.ctx.stats.fillRect > 0);
    assert.ok(Game.bloodLayer.ctx.stats.rect > 0);
    assert.ok(Game.puddleMaskLayer.ctx.stats.rect > 0);
    assert.ok(Game.reflectionLayer.ctx.stats.composites.has('destination-in'));
    const wall = painted.indexOf(Game.bg.back), crowd = painted.indexOf(Game.audienceLayer.canvas), fence = painted.indexOf(Game.bg.front);
    assert.ok(wall >= 0 && wall < crowd && crowd < fence, 'the chain-link foreground is painted over the spectators');
  } finally { Game.ctx.drawImage = oldDraw; globalThis.innerWidth = width; globalThis.innerHeight = height; Game.resize(); }
});

test('cosmetic splash droplets cannot create blood or make a large pool flood outward', () => {
  const field = new BloodField(960, 468, 27);
  for (let i = 0; i < 80; i++) field.add(300 + Math.sin(i) * 3, 480, 'seep');
  const pool = [...field.groups][0], mass = pool.mass, drops = pool.drops, before = field.cells.size;
  for (let i = 0; i < 200; i++) field.add(300 + Math.sin(i) * 3, 480, 'splash');
  assert.equal(pool.mass, mass); assert.equal(pool.drops, drops);
  assert.ok(field.cells.size <= before + 6, 'repeated splashes are not a new blood source');
  const right = Math.max(...[...pool.cells].map(k => Math.floor(k / 1024))) * 3;
  const oldSize = field.cells.size;
  field.add(right + 6, 480, 'hit', 3);
  assert.ok(field.cells.size - oldSize < 35, 'a single distant fleck does not inherit the whole pool volume');
});

test('a grounded Homelander can splash on a hard landing before his hover resumes at different frame rates', () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
    Game.fighters = []; Game.fx.clearBlood();
    const f = fighter(460, 1, 'homelander'); disableAI(f); f.hoverY = 0; f.buildRig(dt);
    // In his hover stance the far foot hangs lower than the near foot.
    const x = f.rig.aF.x + f.rig.fdF.x * 7;
    for (let i = 0; i < 20; i++) Game.fx.bloodField.add(x + Math.sin(i) * 3, Game.gy + 9, 'seep');
    f.onLand(700); f.update(dt, null, [f]);
    assert.ok(f.footBlood.F > 0, `landing at ${dt}s must use the real ground contact`);
    assert.ok(Game.fx.bl.some(p => p.splash));
  }
});

// Expanded arena, finishers and the new character.
test('new: local face names and Chester selection, guitar impacts, breakage cap and drop', async () => {
  assert.deepEqual(HEAD_URL, {
    jane: '/faces/patrick.png', negan: '/faces/negan.png', chester: '/faces/chester.png',
    homelander: '/faces/homelander.png', saul: '/faces/saul.png', walt: '/faces/walt.png',
    tubtrooper: '/faces/stormtrooper.png',
  });
  assert.match(await readFile(new URL('../public/faces/README.md', import.meta.url), 'utf8'), /chester\.png/);
  const selected = Game.spawnFighter(360, 1, 0, 'chester');
  assert.equal(selected.skin, 'chester'); assert.match(selected.name, /ЧЕСТЕР/);
  Game.fighters = [];
  const f = fighter(340, 1, 'chester'), v = fighter(420, -1, 'jane'); disableAI(f, v);
  assert.ok(SK_.chester.uArmF && SK_.chester.lArmF);
  assert.equal(f.startAttack(0), true); assert.equal(f.atk.guitar, true);
  for (let i = 0; i < 14; i++) {
    v.hp = 100; v.state = 'idle'; v.invT = 0; v.y = 0;
    assert.equal(f.tryHit(f.atk, [v]), true);
  }
  assert.equal(f.guitarDamage, 1, 'damage accumulates but is capped');
  assert.ok(f.guitarFlexVel > 0, 'actual impacts excite the flexible neck');
  f.buildRig(1 / 60); // the attack takes the stowed weapon into the hand
  Game.render();
  assert.ok(Game.batLayer.ctx.stats.colors.has('#c71b2d'), 'the red guitar is drawn');
  assert.ok(Game.batLayer.ctx.stats.colors.has('#190c0c'), 'the damaged neck has visible cracks');
  f.toRagdoll(40, 20); f.buildRig(0);
  assert.ok(f.rig.bd, 'the living ragdoll still holds its guitar');
  Game.ko(f, v, { pw: .5, noStagger: true });
  assert.ok(Game.droppedBats.some(b => b.kind === 'guitar' && b.damage === 1));
  Game.render();
});

test('new: a lethal Negan head blow winds up and breaks the head, spraying nearby fighters', () => {
  const negan = fighter(340, 1, 'negan'), victim = fighter(425, -1, 'jane');
  const nearby = fighter(510, -1, 'chester'), far = fighter(900, -1, 'walt');
  disableAI(negan, victim, nearby, far); victim.hp = 6;
  assert.equal(negan.startAttack(0), true);
  assert.equal(negan.atk.n, 'overhead-finisher');
  assert.ok(negan.atk.kf[1][1].bt > 180 && negan.atk.kf[2][1].gy < -30, 'backswing travels up over the head');
  advanceUntil(() => victim.hp <= 0, 150);
  assert.equal(victim.headDestroyed, true); assert.ok(Game.fx.gibs.length >= 20);
  assert.ok(negan.bloodStains.length >= 14 && nearby.bloodStains.length >= 14, 'both nearby people are heavily speckled');
  assert.equal(far.bloodStains.length, 0, 'distant bystanders are not magically stained');
  assert.ok(new Set(nearby.bloodStains.map(b => b.seg)).size > 4, 'uneven stains attach to several body segments');
  const mark = nearby.bloodStains.find(b => b.seg !== 'head'), p = surfacePoint(nearby.rig, mark);
  nearby.x += 55; nearby.buildRig(0); const q = surfacePoint(nearby.rig, mark);
  assert.ok(q.x > p.x + 40, 'the spray follows the moving body');
  Game.render(); Game.clearBlood();
  assert.equal(negan.bloodStains.length, 0); assert.equal(nearby.bloodStains.length, 0);
  Game.clearBodies(); assert.equal(Game.fx.gibs.length, 0);
});

test('new: a real lethal laser needs time to cut and separates into independently moving hot pieces', () => {
  const shooter = fighter(240, 1, 'homelander'), victim = fighter(510, -1, 'walt');
  disableAI(shooter, victim); victim.hp = 3;
  assert.equal(shooter.startAttack(3), true);
  advanceUntil(() => victim.hp <= 0, 180);
  assert.ok(victim.laserSlice && victim.laserSlice.progress < 1);
  assert.equal(victim.gorePieces, null, 'separation is not instantaneous');
  advanceUntil(() => victim.gorePieces !== null, 240);
  const pieceCount = victim.gorePieces.length;
  assert.ok(pieceCount >= 3, 'multiple severed pieces, including separated limbs, are possible');
  assert.ok(victim.gorePieces.flatMap(p => p.parts).filter(p => p.cutA || p.cutB)
    .every(p => p.canvas.getContext('2d').stats.colors.has('#ff8219')),
    'every severed segment has its own lasting orange cut');
  const positions = victim.gorePieces.map(p => [p.x, p.y]);
  tick(.5);
  assert.ok(victim.gorePieces.some((p, i) => Math.hypot(p.x - positions[i][0], p.y - positions[i][1]) > 10));
  assert.ok(new Set(victim.gorePieces.map(p => Math.round(p.vx))).size > 1, 'fragments are not linked');
  Game.render(); tick(5); Game.render();
  assert.equal(victim.burns.length, 0, 'ordinary burns cool quickly');
  assert.equal(victim.gorePieces.length, pieceCount, 'the cut and pieces persist after ordinary burns fade');
  Game.clearBodies(); assert.ok(!Game.fighters.includes(victim));
});

test('new: contact stain intensity is determined by local blood quantity, not a distant connected pool', () => {
  const field = Game.fx.bloodField;
  field.add(300, Game.gy + 9, 'drip');
  for (let i = 0; i < 24; i++) field.add(550 + Math.sin(i) * 4, Game.gy + 9, 'seep');
  const faint = field.contactAtFoot(300, Game.gy), heavy = field.contactAtFoot(550, Game.gy);
  assert.ok(faint && heavy && faint.intensity < heavy.intensity * .6);
  assert.equal(faint.splashable, false); assert.equal(heavy.splashable, true);
  const f = fighter(300, 1); disableAI(f);
  const footX = f.rig.aN.x + f.rig.fdN.x * 7;
  field.clear(); field.add(footX, Game.gy + 9, 'drip');
  for (let i = 0; i < 20; i++) { f.queueBloodFootfall('N', 1); f.resolveBloodFootfall(); }
  const faintLevel = f.footBlood.N;
  assert.ok(faintLevel > 0 && faintLevel < 1.5, 'one drop cannot saturate the shoe through repeated steps');
  for (let i = 0; i < 24; i++) field.add(footX + Math.sin(i) * 3, Game.gy + 9, 'seep');
  f.queueBloodFootfall('N', 1); f.resolveBloodFootfall();
  assert.ok(f.footBlood.N > faintLevel * 2);
});

test('new: the camera moves smoothly over a three-height arena and keeps bottom layers anchored', () => {
  assert.equal(540 - WORLD_TOP, 3 * 540);
  assert.ok(BRIDGE_Y < WORLD_TOP + 540 && BRIDGE_Y - WORLD_TOP > 200, 'bridge is in the upper third with standing headroom');
  Game.moveCamera(-5000); assert.equal(Game.camera.targetY, WORLD_TOP + 270);
  for (let i = 0; i < 180; i++) Game.updateCamera(1 / 60);
  assert.ok(Math.abs(Game.camera.y - (WORLD_TOP + 270)) < .01);
  Game.render();
  assert.ok(Math.abs(Game.bodyLayer.offsetY - WORLD_TOP) < .01);
  assert.equal(Game.audienceLayer.offsetY, 0, 'spectators do not extend into the upper wall');
  assert.equal(Game.bloodLayer.offsetY, 0, 'the floor puddles stay at the floor');
  assert.ok(Math.abs(Game.screenToWorldY(0) - WORLD_TOP) < .01);
  Game.resetCamera(); for (let i = 0; i < 180; i++) Game.updateCamera(1 / 60);
  assert.ok(Math.abs(Game.camera.y - 270) < .01);
  Game.moveCamera(1000); assert.equal(Game.camera.targetY, 270);
});

test('new: a fighter climbs a ceiling rope to the bridge and walks on the platform at 30, 60 and 120 FPS', () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
    Game.init(); Game.autoSpawn = false; Game.fighters = [];
    const lamp = Game.lamps[1], f = fighter(lamp.x, 1, 'chester'), ground = fighter(850, -1, 'walt');
    disableAI(f, ground); assert.equal(lamp.anchorY, WORLD_TOP + 18);
    assert.equal(f.startLampJump(lamp), true);
    advanceUntil(() => f.state === 'lamp_hang', Math.ceil(2 / dt), dt);
    f.lampAction = 'climb'; f.lampStamina = 12; f.lampBreakAt = Infinity; f.tackleCheck = Infinity;
    let highest = 0;
    for (let i = 0; i < Math.ceil(8 / dt) && !f.onBridge; i++) {
      Game.update(dt);
      if (f.state === 'lamp_hang') {
        const grip = lamp.point(30 + f.lampClimb);
        assert.ok(distance(f.rig.wN, grip) < 7 && distance(f.rig.wF, grip) < 7, `hands hold rope at ${dt}`);
        highest = Math.max(highest, f.y);
      }
    }
    assert.equal(f.onBridge, true, `climber reaches the bridge at ${dt}`);
    assert.ok(highest > 900); assert.equal(f.gy, BRIDGE_Y); assert.equal(f.y, 0);
    assert.ok(Math.abs(Math.max(f.rig.aN.y, f.rig.aF.y) - BRIDGE_Y) < 30);
    assert.ok(!lamp.riders.has(f));
    const x = f.x; f.ctrl.mx = 1; tick(.5, dt);
    assert.ok(f.x > x + 25 && f.onBridge, 'walking happens on the actual raised floor');
    Game.render();
  }
});

test('new: a second fighter can follow on the same rope and each rider is released on detachment', () => {
  const lamp = Game.lamps[1], first = fighter(lamp.x, 1, 'jane'); disableAI(first);
  assert.equal(first.startLampJump(lamp), true); advanceUntil(() => first.state === 'lamp_hang', 150);
  first.lampAction = 'climb'; first.lampStamina = 12; first.lampBreakAt = Infinity; first.tackleCheck = Infinity;
  advanceUntil(() => first.lampClimb > 160, 150);
  const second = fighter(lamp.x, -1, 'chester'); disableAI(second);
  assert.equal(second.startLampJump(lamp), true, 'occupied rope becomes reachable once the first rider climbs');
  advanceUntil(() => second.state === 'lamp_hang', 150);
  second.lampAction = 'climb'; second.lampStamina = 12; second.lampBreakAt = Infinity; second.tackleCheck = Infinity;
  assert.equal(lamp.riders.size, 2);
  tick(.6);
  assert.ok(first.lampClimb - second.lampClimb >= 89, 'riders do not overlap or pass through one another');
  assert.equal(Game.detachLamp(lamp), true);
  assert.equal(lamp.riders.size, 0); assert.equal(first.state, 'ragdoll'); assert.equal(second.state, 'ragdoll');
  assert.equal(first.lampRef, null); assert.equal(second.lampRef, null);
});

test('new: autonomous pursuit chooses a usable rope for a fighter above', () => {
  const target = fighter(720, -1, 'walt'); disableAI(target);
  target.onBridge = true; target.gy = BRIDGE_Y; target.buildRig(0);
  const pursuer = fighter(210, 1, 'jane');
  pursuer.autopilot.attackWait = pursuer.autopilot.farCD = 100;
  let sawClimb = false;
  for (let i = 0; i < 720; i++) {
    Game.update(1 / 60);
    if (pursuer.state === 'lamp_hang' && pursuer.lampAction === 'climb') sawClimb = true;
    if (pursuer.onBridge) break;
  }
  assert.ok(sawClimb, 'the AI pursues upward instead of attacking a distant floor');
  assert.ok(pursuer.onBridge, 'the autonomous chase actually reaches the bridge');
});

test('new: a high tackle is limited to reachable opponents and a long fall causes severe injury', () => {
  const attacker = fighter(400, 1, 'jane'), victim = fighter(530, -1, 'walt'), low = fighter(420, -1, 'saul');
  disableAI(attacker, victim, low);
  for (const f of [attacker, victim]) { f.onBridge = true; f.gy = BRIDGE_Y; f.cur = null; f.buildRig(0); }
  assert.equal(attacker.startHighTackle(low), false, 'do not leap for a fighter far below');
  assert.equal(attacker.startHighTackle(victim), true);
  advanceUntil(() => attacker.state === 'ragdoll' && victim.state === 'ragdoll', 180);
  assert.equal(attacker.gy, Game.gy); assert.equal(victim.gy, Game.gy);
  assert.ok(attacker.fallDamage?.severe && victim.fallDamage?.severe);
  advanceUntil(() => attacker.hp <= 60 && victim.hp <= 60, 900);
  assert.ok(attacker.hp <= 60 && victim.hp <= 60, 'a full-height fall is not harmless');
});

test('new: seeded autonomous matches can really reach the upper bridge and use finishers', () => {
  const counts = {climbs: 0, bridge: 0, head: 0, laser: 0, tackles: 0, multiRider: 0};
  const grab = Fighter.prototype.grabLamp, tackle = Fighter.prototype.startHighTackle, ko = Game.ko;
  try {
    Fighter.prototype.grabLamp = function (...args) {
      const result = grab.apply(this, args); if (result && this.lampAction === 'climb') counts.climbs++; return result;
    };
    Fighter.prototype.startHighTackle = function (...args) {
      const result = tackle.apply(this, args); if (result) counts.tackles++; return result;
    };
    Game.ko = function (v, ...args) {
      if (v.headDestroyed) counts.head++; if (v.laserSlice) counts.laser++;
      return ko.call(this, v, ...args);
    };
    for (const seed of [19,31,57,83,101,133,177,251,277,301,389,491,601,701,809,907]) {
      seedRandom(seed); Game.init(); const onBridge = new Set(), multi = new Set();
      for (let frame = 0; frame < 240 * 60; frame++) {
        Game.update(1 / 60);
        for (const f of Game.fighters) if (f.onBridge && !onBridge.has(f.id)) { onBridge.add(f.id); counts.bridge++; }
        for (const l of Game.lamps) if (l.riders.size > 1 && !multi.has(l)) { multi.add(l); counts.multiRider++; }
      }
    }
  } finally { Fighter.prototype.grabLamp = grab; Fighter.prototype.startHighTackle = tackle; Game.ko = ko; }
  console.log('new autonomous arena events:', counts);
  for (const [action, count] of Object.entries(counts)) assert.ok(count > 0, `${action} should occur in real autonomous combat`);
  assert.ok(counts.tackles < counts.bridge * .35, 'high tackles remain rare during seeded autonomous play');
});

test('new: the bridge deck blocks a laser ray between the two levels', () => {
  const shooter = fighter(480, 1, 'homelander'); disableAI(shooter);
  const down = Game.castRay(800, BRIDGE_Y - 150, 0, 1, shooter);
  const up = Game.castRay(800, BRIDGE_Y + 120, 0, -1, shooter);
  assert.equal(down.surf, 'bridge'); assert.equal(down.y, BRIDGE_Y);
  assert.equal(up.surf, 'bridge'); assert.equal(up.y, BRIDGE_Y + 18);
});

test('new: an interrupted high fall deals damage once and a later normal jump is safe', () => {
  const f = fighter(480, 1, 'jane'); disableAI(f);
  const random = Math.random;
  try {
    Math.random = () => .9; // no bleeding or incidental follow-up injury
    f.y = 600; f.state = 'air'; f.vy = 0; f.cur = null; f.buildRig(0);
    f.toRagdoll(0, 0, true);
    assert.ok(f.fallDamage?.severe);
    advanceUntil(() => f.hp < 100, 900);
    assert.ok(f.hp > 0 && f.hp < 70); assert.equal(f.fallDamage, null); assert.equal(f.fallPeak, 0);
    advanceUntil(() => f.state === 'getup', 900); tick(2.4);
    assert.equal(f.state, 'idle'); const hp = f.hp;
    f.startJump(); advanceUntil(() => f.state === 'idle', 240);
    assert.equal(f.hp, hp, 'an old fall cannot be charged again on the next ordinary landing');
  } finally { Math.random = random; }
});

test('new: runners avoid tripping over a prone or only just rising fighter', () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) for (const dir of [1, -1]) {
    Game.fighters = [];
    const body = fighter(480, -dir, 'walt'), runner = fighter(480 - dir * 70, dir, 'jane');
    disableAI(body, runner); body.state = 'getup'; body.st = .1; body.vx = 0;
    runner.state = 'run'; runner.ctrl.mx = dir; runner.ctrl.run = true; runner.vx = dir * 450;
    for (let i = 0; i < Math.ceil(.25 / dt); i++) Game.update(dt);
    assert.notEqual(runner.state, 'ragdoll', `runner avoids the still-prone body at ${dt}, direction ${dir}`);
  }
});

test('new: a fatal guitar hit does not trigger Negan\'s head-only finisher', () => {
  const attacker = fighter(380, 1, 'chester'), victim = fighter(465, -1, 'walt');
  disableAI(attacker, victim); victim.hp = 1; attacker.startAttack(0);
  assert.equal(attacker.tryHit(attacker.atk, [victim]), true);
  assert.equal(victim.hp, 0); assert.equal(victim.headDestroyed, false);
  assert.equal(Game.fx.gibs.length, 0);
});

test('sandbox mouse and touch gestures separate placement from panning without accidental spawns', () => {
  const listeners = new Map(), classes = new Set();
  const original = {
    add: gameCanvas.addEventListener, remove: gameCanvas.removeEventListener,
    rect: gameCanvas.getBoundingClientRect, capture: gameCanvas.setPointerCapture,
    classList: gameCanvas.classList, cancelFrame: globalThis.cancelAnimationFrame,
    removeWindow: globalThis.removeEventListener,
  };
  gameCanvas.addEventListener = (type, handler) => listeners.set(type, handler);
  gameCanvas.removeEventListener = (type, handler) => { if (listeners.get(type) === handler) listeners.delete(type); };
  gameCanvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 960, height: 540 });
  gameCanvas.setPointerCapture = () => {};
  gameCanvas.classList = { add: name => classes.add(name), remove: name => classes.delete(name) };
  globalThis.cancelAnimationFrame = () => {}; globalThis.removeEventListener = () => {};
  const send = (type, x, y, { button = 0, pointerType = 'mouse', id = 1 } = {}) =>
    listeners.get(type)?.({ button, pointerType, pointerId: id, clientX: x, clientY: y, preventDefault() {} });
  let api;
  try {
    api = startGame();
    assert.equal(Game.autoSpawn, false); assert.equal(Game.fighters.length, 0, 'the sandbox starts empty');
    send('pointerdown', 300, 100); send('pointerup', 300, 100);
    assert.equal(Game.fighters.length, 0, 'placing requires a selected character');
    api.selectSkin('chester'); api.setMenuOpen(true);
    send('pointerdown', 300, 100); send('pointerup', 300, 100);
    assert.equal(Game.fighters.length, 0, 'the open picker cannot spawn from the arena');
    api.setMenuOpen(false);
    send('pointerdown', 300, 100); send('pointerup', 300, 100);
    assert.equal(Game.fighters.length, 1); assert.equal(Game.fighters[0].skin, 'chester');

    const initial = Game.camera.targetY;
    send('pointerdown', 600, 100); send('pointermove', 600, 150); send('pointerup', 600, 150);
    assert.equal(Game.camera.targetY, initial, 'left dragging does not move the camera');
    assert.equal(Game.fighters.length, 1, 'a drag is not reinterpreted as a click');
    send('pointerdown', 600, 100, { button: 2 }); assert.ok(classes.has('panning'));
    send('pointermove', 600, 145, { button: 2 }); send('pointerup', 600, 145, { button: 2 });
    assert.ok(Game.camera.targetY < initial); assert.equal(Game.fighters.length, 1);
    assert.ok(!classes.has('panning'));
    send('pointerdown', 600, 100, { button: 2 }); send('pointerup', 600, 100, { button: 2 });
    assert.equal(Game.fighters.length, 1, 'right click never creates a fighter');
    let prevented = false, before = Game.camera.targetY;
    listeners.get('wheel')({ deltaY: -120, deltaMode: 0, preventDefault() { prevented = true; } });
    assert.ok(prevented && Game.camera.targetY < before, 'wheel pans vertically');

    const touch = { pointerType: 'touch', id: 11 };
    before = Game.camera.targetY;
    send('pointerdown', 750, 100, touch); send('pointermove', 750, 145, touch); send('pointerup', 750, 145, touch);
    assert.ok(Game.camera.targetY < before); assert.equal(Game.fighters.length, 1, 'a touch drag pans without placing');
    send('pointerdown', 750, 300, touch); send('pointerup', 750, 300, touch);
    assert.equal(Game.fighters.length, 2, 'a stationary touch places the selection');
    send('pointerdown', 500, 100, touch); send('pointerdown', 520, 105, { pointerType: 'touch', id: 12 });
    send('pointerup', 520, 105, { pointerType: 'touch', id: 12 }); send('pointerup', 500, 100, touch);
    assert.equal(Game.fighters.length, 2, 'a second finger suppresses placement even if it lifts first');
    send('pointerdown', 500, 300, touch); send('pointerup', 500, 300, touch);
    assert.equal(Game.fighters.length, 3, 'single touch works again after all fingers lift');
    send('pointerdown', 100, 300); send('lostpointercapture', 100, 300); send('pointerup', 100, 300);
    assert.equal(Game.fighters.length, 3, 'lost capture cancels the gesture');
    send('pointerdown', 100, 300); api.selectSkin('walt'); send('pointerup', 100, 300);
    assert.equal(Game.fighters.length, 3, 'changing selection cancels an in-flight press');
    send('pointerdown', 100, 300); send('pointerup', 100, 300);
    assert.equal(Game.fighters.length, 4); assert.equal(Game.fighters.at(-1).skin, 'walt');
    api.destroy(); api = null; assert.equal(listeners.size, 0); assert.equal(classes.size, 0);
  } finally {
    api?.destroy();
    gameCanvas.addEventListener = original.add; gameCanvas.removeEventListener = original.remove;
    gameCanvas.getBoundingClientRect = original.rect; gameCanvas.setPointerCapture = original.capture;
    gameCanvas.classList = original.classList; globalThis.cancelAnimationFrame = original.cancelFrame;
    globalThis.removeEventListener = original.removeWindow;
  }
});

test('tubtrooper has the requested helmet path, bare-skin sprite and normal punches', () => {
  const f = Game.spawnFighter(320, 1, 0, 'tubtrooper'); f.reset(320, 1); disableAI(f); f.buildRig(0);
  assert.match(f.name, /ТАБТРУПЕР/); assert.equal(HEAD_URL.tubtrooper, '/faces/stormtrooper.png');
  assert.ok(SK_.tubtrooper.chest && SK_.tubtrooper.uArmF && SK_.tubtrooper.thighF);
  assert.ok(f.startAttack(0)); assert.equal(f.atk.n, 'jab'); assert.equal(f.atk.fist, 'N');
  Game.render();
});

test('tubtrooper aims, holds the duck behind him, then throws a ballistic projectile at a distant opponent', () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) for (const dir of [1, -1]) {
    Game.init(); Game.autoSpawn = false; Game.fighters = [];
    const a = fighter(dir === 1 ? 220 : 780, dir, 'tubtrooper');
    const v = fighter(dir === 1 ? 700 : 300, -dir, 'jane'); disableAI(a, v);
    a.duckCD = 0; assert.equal(a.startDuckThrow(v), true);
    tick(.55, dt);
    assert.equal(a.state, 'duck_throw'); assert.equal(Game.ducks.length, 0, 'hold aim before throwing');
    assert.ok((a.rig.wN.x-a.rig.sh.x)*dir > 40 && a.rig.wN.y<a.rig.sh.y, 'front arm points upward and forward');
    assert.ok((a.rig.wF.x-a.rig.sh.x)*dir < -25, 'duck hand is behind the body');
    advanceUntil(() => Game.ducks.length === 1, Math.ceil(1 / dt), dt);
    const d = Game.ducks[0], target = { ...d.targetAtRelease };
    assert.equal(d.hits, 0); assert.ok(d.vx*dir > 0);
    advanceUntil(() => d.hits > 0, Math.ceil(2 / dt), dt);
    assert.ok(v.hp < 100, `duck hits at ${dt}, facing ${dir}`);
    assert.ok(d.vx*dir < 0, 'the duck rebounds away after impact');
    assert.deepEqual(d.targetAtRelease, target, 'the solved target is never updated in flight');
  }
});

test('duck impacts have a 50 percent knockdown decision and progressively weaker damage', () => {
  const a = fighter(220, 1, 'tubtrooper'), v = fighter(600, -1, 'jane'); disableAI(a, v);
  const d = { owner: a, x: 570, y: 350 };
  const random = Math.random;
  try {
    Math.random = () => .49; v.takeDuckHit(d, 8, 1, 800);
    assert.equal(v.state, 'ragdoll'); assert.equal(v.hp, 92);
    v.reset(600, -1); v.buildRig(0);
    Math.random = () => .51; v.takeDuckHit(d, 4, 1, 500);
    assert.equal(v.state, 'push_stagger'); assert.ok(v.vx > 0); assert.equal(v.hp, 96);
  } finally { Math.random = random; }
});

test('a dangerous high drop reacts in flight and keeps accelerating at 30, 60 and 120 FPS', () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
    Game.init(); Game.autoSpawn = false; Game.fighters = [];
    const f = fighter(480, 1, 'jane'); disableAI(f);
    f.y = 960; f.vy = -220; f.vx = 100; f.state = 'air'; f.cur = null; f.buildRig(0);
    advanceUntil(() => f.state === 'ragdoll', Math.ceil(.3 / dt), dt);
    assert.ok(f.rag.highFall && f.fallDamage?.severe);
    const start = f.rag.p.pel.y;
    tick(.45, dt);
    const distance = f.rag.p.pel.y - start;
    assert.ok(distance > 260, `fast airborne ragdoll should not glide at ${dt}: ${distance}`);
    advanceUntil(() => f.hp < 100, Math.ceil(1.8 / dt), dt);
    assert.ok(f.hp < 45, 'a full-height impact causes a severe injury or death');
  }
});

test('laser fragments preserve uncut joints and fall independently instead of freezing in the air', () => {
  for (const dt of [1/30, 1/60, 1/120]) {
    Game.init(); Game.autoSpawn = false; Game.fighters = [];
    const f = fighter(480, 1, 'chester'); disableAI(f);
    f.rig = {
      dir:1,head:{x:480,y:-500},neck:{x:480,y:-480},sh:{x:480,y:-475},pel:{x:480,y:-415},
      eN:{x:515,y:-466},wN:{x:545,y:-455},eF:{x:445,y:-466},wF:{x:415,y:-455},
      kN:{x:500,y:-365},aN:{x:500,y:-320},kF:{x:460,y:-365},aF:{x:460,y:-320},
      fdN:{x:1,y:0},fdF:{x:1,y:0},cN:0,cF:0,mo:0,ey:0,bd:null,
    };
    const pieces=makeLaserPieces(f,{slope:0,dir:1});
    assert.ok(pieces.length>=3);
    const upper=pieces.find(p=>p.parts.some(s=>s.name==='uN'&&s.t0===0&&s.t1===1));
    const u=upper.parts.find(s=>s.name==='uN'),fore=upper.parts.find(s=>s.name==='fN');
    assert.ok(fore && u.b===fore.a, 'an intact elbow joins upper arm and forearm in one ragdoll');
    const lower=pieces.find(p=>p.parts.some(s=>s.name==='sN'&&s.t0===0&&s.t1===1));
    const thigh=lower.parts.find(s=>s.name==='tN'&&s.t1===1),shin=lower.parts.find(s=>s.name==='sN');
    assert.ok(thigh && thigh.b===shin.a, 'the severed lower leg still has its knee joint');
    assert.notEqual(upper,lower, 'different fragments do not share the parent body');
    const start=pieces.map(p=>p.y);
    for(let i=0;i<Math.ceil(.45/dt);i++)updateGorePieces(pieces,dt,Game.W);
    for(let i=0;i<pieces.length;i++){
      assert.ok(!pieces[i].settled && pieces[i].y>start[i]+100, `piece ${i} falls at ${dt}`);
    }
    for(let i=0;i<Math.ceil(5/dt);i++)updateGorePieces(pieces,dt,Game.W);
    for(const p of pieces){
      assert.ok(p.nodes.some(n=>n.y>=p.floor-n.r-2), 'each piece reaches a solid floor');
      assert.ok(p.nodes.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)&&n.y<=p.floor-n.r+.1));
      for(const l of p.links)assert.ok(Math.abs(Math.hypot(l.b.x-l.a.x,l.b.y-l.a.y)-l.length)<5, 'joint constraints remain attached');
    }
  }
});

test('the duck leads a steadily moving target without steering in flight', () => {
  for(const dt of [1/30,1/60,1/120]) for(const dir of [1,-1]) {
    Game.init(); Game.autoSpawn=false; Game.fighters=[];
    const a=fighter(dir===1?150:810,dir,'tubtrooper'),v=fighter(dir===1?480:480,-dir,'jane');
    disableAI(a,v);v.vx=dir*170;v.buildRig(0);
    const d=launchDuck(Game,a,v,{x:a.x+dir*50,y:v.rig.pel.y-24});
    assert.ok((d.targetAtRelease.x-v.x)*dir>25, 'aim predicts where the opponent will be');
    const vx=d.vx;
    for(let i=0;i<Math.ceil(1.4/dt)&&!d.hits;i++){
      v.x+=dir*170*dt;v.buildRig(0);updateDucks(Game,dt,BRIDGE_Y,WORLD_TOP);
      if(!d.hits)assert.equal(d.vx,vx,'no in-flight homing or horizontal acceleration');
    }
    assert.equal(d.hits,1,`moving opponent hit at ${dt}, facing ${dir}`);
  }
});

test('the rubber duck bounces off fighters, wall, floor and bridge and loses damaging energy', () => {
  Game.init();Game.autoSpawn=false;Game.fighters=[];
  const a=fighter(130,1,'tubtrooper'),v1=fighter(480,-1,'jane'),v2=fighter(760,-1,'walt');disableAI(a,v1,v2);
  const d=launchDuck(Game,a,v1,{x:390,y:v1.rig.pel.y-25});
  d.vx=750;d.vy=0;d.age=1;
  const hp1=v1.hp;
  for(let i=0;i<30&&!d.hits;i++)updateDucks(Game,1/120,BRIDGE_Y,WORLD_TOP);
  const damage1=hp1-v1.hp;assert.ok(damage1>0);assert.ok(d.vx<0);assert.ok(d.power<1);
  // Drive the same, already rebounded duck into a second fighter at lower speed.
  d.x=670;d.y=v2.rig.pel.y-25;d.vx=600;d.vy=0;d.age+=.3;const hp2=v2.hp;
  for(let i=0;i<30&&d.hits<2;i++)updateDucks(Game,1/120,BRIDGE_Y,WORLD_TOP);
  assert.equal(d.hits,2);assert.ok(hp2-v2.hp<damage1,'later impacts deal less damage');
  Game.fighters=[];d.settled=false;d.x=Game.W-55;d.y=0;d.vx=700;d.vy=0;
  const p=d.power;updateDucks(Game,.04,BRIDGE_Y,WORLD_TOP);
  assert.ok(d.vx<0 && d.power<p,'the wall reflects and absorbs energy');
  d.x=Game.W/2;d.y=BRIDGE_Y-16;d.vx=50;d.vy=500;
  updateDucks(Game,.04,BRIDGE_Y,WORLD_TOP);
  assert.ok(d.vy<0 && d.y<BRIDGE_Y,'the duck bounces off the bridge deck');
  d.x=Game.W/2;d.y=Game.gy-16;d.vx=50;d.vy=500;d.floor=Game.gy;
  updateDucks(Game,.04,BRIDGE_Y,WORLD_TOP);
  assert.ok(d.vy<0 && d.y<Game.gy,'the floor reflects the duck');
  for(let i=0;i<1200&&!d.settled;i++)updateDucks(Game,1/120,BRIDGE_Y,WORLD_TOP);
  assert.equal(d.settled,true,'the rubber duck eventually comes to rest on a surface');
  assert.ok(Math.abs(d.y+13-d.floor)<1);
});

test('tubtrooper naturally chooses the ranged duck in autonomous combat', () => {
  let throws=0;
  for(let seed=1;seed<=20;seed++){
    seedRandom(seed);Game.init();Game.autoSpawn=false;Game.fighters=[];
    const a=fighter(210,1,'tubtrooper'),v=fighter(760,-1,'jane');disableAI(v);
    a.duckCD=0;a.autopilot.attackWait=0;a.autopilot.farCD=100;a.autopilot.lampCheck=100;
    for(let i=0;i<180;i++){
      Game.update(1/60);if(Game.ducks.length){throws++;break;}
    }
  }
  assert.ok(throws>=3,`ranged throws should occur without forcing the action, got ${throws}`);
});

test('a thrown duck can naturally rebound into another fighter with reduced damage', () => {
  const random = Math.random;
  try {
    for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
      Math.random = () => .8; // standing recoil makes the collision sequence repeatable
      Game.init(); Game.autoSpawn = false; Game.fighters = [];
      const owner = fighter(80, 1, 'tubtrooper');
      const first = fighter(700, -1, 'jane'), second = fighter(200, 1, 'walt');
      disableAI(owner, first, second);
      const duck = launchDuck(Game, owner, first, {x: 275, y: first.rig.pel.y - 80});
      const firstHP = first.hp, secondHP = second.hp;
      for (let i = 0; i < Math.ceil(3 / dt) && first.hp === firstHP; i++) Game.update(dt);
      assert.ok(first.hp < firstHP, `the outbound duck hits its intended target at ${dt}`);
      assert.equal(second.hp, secondHP, 'the fighter behind the launch point is not hit first');
      assert.ok(duck.vx < 0 && duck.power < 1, 'the first collision reflects and weakens it');
      for (let i = 0; i < Math.ceil(5 / dt) && second.hp === secondHP; i++) Game.update(dt);
      assert.ok(second.hp < secondHP, `the same duck naturally reaches the second fighter at ${dt}`);
      assert.ok(secondHP - second.hp < firstHP - first.hp, 'the later impact is weaker');
      assert.ok(duck.hits >= 2);
    }
  } finally { Math.random = random; }
});


test('the visible laser cut and articulated fragments agree for sideways and inverted bodies', () => {
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2, .73]) {
    Game.init(); Game.autoSpawn = false; Game.fighters = [];
    const f = fighter(480, 1, 'chester'); disableAI(f);
    const R = spreadRig(), origin = { ...R.neck }, c = Math.cos(angle), s = Math.sin(angle);
    for (const key of ['head','neck','sh','pel','eN','wN','eF','wF','kN','aN','kF','aF']) {
      const p = R[key], x = p.x - origin.x, y = p.y - origin.y;
      R[key] = { x: 480 + x * c - y * s, y: -400 + x * s + y * c };
    }
    f.rig = R;
    const job = { slope: .35, dir: 1 }, geometry = laserCutGeometry(R, job.slope);
    const pieces = makeLaserPieces(f, job), torso = pieces.flatMap(p => p.parts).filter(p => p.name === 'torso');
    assert.ok(torso.length >= 2, `the cut crosses the torso at ${angle} radians`);
    assert.ok(new Set(pieces.filter(p => p.parts.some(s => s.name === 'torso'))).size >= 2,
      'opposite sides of a cut do not share a physical body');
    const onCut = p => geometry.cuts.some(cut => Math.abs(geometry.project(p) - cut) < 1e-5);
    const exposed = pieces.flatMap(p => p.parts).filter(p => p.cutA || p.cutB);
    assert.ok(exposed.length >= 2);
    for (const part of exposed) {
      if (part.cutA) assert.ok(onCut(part.a), 'the visible cut edge begins on the swept plane');
      if (part.cutB) assert.ok(onCut(part.b), 'the visible cut edge ends on the swept plane');
    }
  }
});

test('a real high rope release triggers an airborne reaction instead of a slow standing fall', () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
    Game.init(); Game.autoSpawn = false; Game.fighters = [];
    const lamp = Game.lamps[1], f = fighter(lamp.x, 1, 'jane'); disableAI(f);
    assert.equal(f.startLampJump(lamp), true);
    advanceUntil(() => f.state === 'lamp_hang', Math.ceil(3 / dt), dt);
    f.lampAction = 'climb'; f.lampStamina = 12; f.lampBreakAt = Infinity; f.tackleCheck = Infinity;
    advanceUntil(() => f.y > 600, Math.ceil(7 / dt), dt);
    assert.equal(f.state, 'lamp_hang');
    f.releaseLamp('tired'); assert.equal(f.state, 'air');
    advanceUntil(() => f.state === 'ragdoll', Math.ceil(.4 / dt), dt);
    assert.ok(f.rag.highFall && f.fallDamage?.severe);
    assert.ok(f.rag.p.pel.y < Game.gy - 350, 'the reaction starts high above the floor');
    assert.ok(!lamp.riders.has(f), 'the released fighter is no longer attached to the rope');
  }
});

test('blood stains and reflections follow severed pieces and can still be washed away', () => {
  const f = fighter(480, 1, 'jane'); disableAI(f);
  f.rig = spreadRig(); f.hp = 0;
  f.gorePieces = makeLaserPieces(f, {slope: 0, dir: 1});
  const mark = {seg: 'uN', layer: 'front', t: .25, s: 2, kind: 'blood', age: 0, sz: .8};
  f.bloodStains = [mark]; f.jointBlood.eN = 3; f.footBlood.N = 2;
  const part = f.gorePieces.flatMap(p => p.parts).find(p => p.name === mark.seg && p.t0 <= mark.t && p.t1 >= mark.t);
  const before = goreSurfacePoint(f, mark);
  part.a.x += 70; part.b.x += 70;
  const after = goreSurfacePoint(f, mark);
  assert.ok(Math.abs(after.x - before.x - 70) < .01, 'the wound is anchored to its own fragment');
  Game.render();
  const markedTexture = gorePartCanvas(part, f, f.bloodStains);
  assert.notEqual(markedTexture, part.canvas);
  assert.ok(markedTexture.getContext('2d').stats.colors.has('#8c1724'), 'joint blood is drawn on a fragment');
  assert.equal(gorePartCanvas(part, f, f.bloodStains), markedTexture, 'unchanged fragment stains are cached');

  const field = Game.fx.bloodField;
  for (let i = 0; i < 16; i++) field.add(after.x, Game.gy + 9, 'seep');
  const paths = [], g = makeCanvas().getContext('2d');
  g.moveTo = (x, y) => paths.push(x); g.lineTo = (x, y) => paths.push(x);
  const oldRigX = f.rig.sh.x;
  field.drawReflections(g, [f], [], 0, makeCanvas());
  assert.ok(paths.some(x => Math.abs(x - part.a.x) < 2), 'a moving piece appears in the reflection');
  assert.ok(Math.abs(part.a.x - oldRigX) > 40, 'the tested piece moved away from the parent skeleton');

  Game.clearBlood(); Game.render();
  assert.equal(f.bloodStains.length, 0); assert.equal(f.jointBlood.eN, 0); assert.equal(f.footBlood.N, 0);
  assert.equal(gorePartCanvas(part, f, f.bloodStains), part.canvas, 'washed blood is not baked into a severed limb');
});

test('a laser-severed corpse deposits blood at landed fragments, not at an invisible parent body', () => {
  const shooter = fighter(220, 1, 'homelander'), victim = fighter(500, -1, 'walt');
  disableAI(shooter, victim); victim.hp = 1;
  victim.takeLaser(shooter, {x: victim.rig.pel.x, y: victim.rig.pel.y - 20}, true);
  advanceUntil(() => !!victim.gorePieces, 240);
  assert.ok(victim.rag.frozen, 'the hidden whole-body solver stops at the split');
  const oldPelvis = {x: victim.rag.p.pel.x, y: victim.rag.p.pel.y};
  const deposits = [], pool = Game.fx.pool.bind(Game.fx);
  Game.fx.pool = (x, y, size) => {
    const contacts = victim.gorePieces.flatMap(piece => piece.parts.flatMap(part => [
      ...(part.cutA ? [part.a] : []), ...(part.cutB ? [part.b] : []),
    ])).filter(n => n.y + n.r >= Game.gy - 3);
    deposits.push({x, nearest: Math.min(...contacts.map(n => Math.abs(n.x - x)))});
    pool(x, y, size);
  };
  tick(5);
  assert.deepEqual({x: victim.rag.p.pel.x, y: victim.rag.p.pel.y}, oldPelvis);
  assert.ok(deposits.length > 0, 'exposed pieces can feed the dynamic blood field');
  assert.ok(deposits.every(d => d.nearest < .01), 'blood comes from a real grounded cut');
});

test('the settled severed-body layer is cached and invalidated by movement, blood and camera changes', () => {
  const f = fighter(480, 1, 'walt'); disableAI(f); f.hp = 0; f.rig = spreadRig();
  f.gorePieces = makeLaserPieces(f, {slope: 0, dir: 1});
  for (const p of f.gorePieces) p.settled = true;
  f.bloodStains = [
    {seg:'torso', layer:'body', t:.3, s:0, kind:'blood', age:0, sz:.5},
    {seg:'head', layer:'head', lx:1, ly:-3, kind:'blood', age:0, sz:.5},
  ];
  Game.render();
  const ctx = Game.goreLayer.ctx, first = ctx.stats.drawImage;
  const head = f.gorePieces.flatMap(p => p.heads)[0];
  const headCtx = head.texture.getContext('2d'), headPaints = headCtx.stats.fillRect;
  assert.ok(first > 0);
  assert.ok(headCtx.stats.colors.has('rgb(168,23,38)'), 'the head stain is composited onto its own texture');
  assert.ok(!ctx.stats.composites.has('source-atop'), 'head stains cannot paint over neighbouring fragments');
  Game.render(); assert.equal(ctx.stats.drawImage, first, 'stationary fragments do not redraw every frame');
  assert.equal(headCtx.stats.fillRect, headPaints, 'unchanged head marks reuse the texture');
  Game.clearBlood(); Game.render();
  assert.ok(headCtx.stats.fillRect > headPaints, 'washing redraws the head texture');
  const afterWash = ctx.stats.drawImage;
  assert.ok(afterWash > first, 'washing blood invalidates the cached layer');
  f.gorePieces[0].settled = false; Game.render();
  const airborne = ctx.stats.drawImage; Game.render();
  assert.ok(ctx.stats.drawImage > airborne, 'moving fragments are redrawn each frame');
  f.gorePieces[0].settled = true; Game.render();
  const settled = ctx.stats.drawImage; Game.moveCamera(-200); Game.updateCamera(1 / 60); Game.render();
  assert.ok(ctx.stats.drawImage > settled, 'moving the camera redraws at the correct world height');
});

test('severed bodies of every character reach the ground at different frame rates', () => {
  const skins = ['jane', 'negan', 'homelander', 'walt', 'saul', 'chester', 'tubtrooper'];
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) for (const [index, skin] of skins.entries()) {
    seedRandom(1000 + index * 13 + Math.round(1 / dt));
    Game.init(); Game.autoSpawn = false; Game.fighters = [];
    const shooter = fighter(180, 1, 'homelander'), victim = fighter(500, index % 2 ? -1 : 1, skin);
    disableAI(shooter, victim);
    victim.y = 700; victim.vx = index % 2 ? -120 : 120; victim.vy = -250;
    victim.state = 'air'; victim.cur = null; victim.buildRig(0);
    victim.toRagdoll(victim.vx, victim.vy);
    for (let i = 0; i < Math.ceil((.08 + index * .025) / dt); i++) Game.update(dt);
    victim.hp = 1;
    victim.takeLaser(shooter, {x: victim.rig.pel.x, y: victim.rig.pel.y - 10}, true);
    advanceUntil(() => !!victim.gorePieces, Math.ceil(3 / dt), dt);
    const pieces = victim.gorePieces;
    assert.ok(pieces.length >= 3, `${skin} separates into physical bodies`);
    tick(6, dt);
    for (const p of pieces) {
      assert.ok(p.nodes.every(n => Number.isFinite(n.x) && Number.isFinite(n.y)), `${skin}: finite joints at ${dt}`);
      assert.ok(p.nodes.some(n => n.y + n.r >= p.floor - 2), `${skin}: no fragment hangs at ${dt}`);
      for (const link of p.links) {
        assert.ok(Math.abs(Math.hypot(link.b.x - link.a.x, link.b.y - link.a.y) - link.length) < 7,
          `${skin}: intact joints remain connected at ${dt}`);
      }
    }
  }
});

test('an interrupted duck wind-up cannot release a projectile later', () => {
  for (const impact of ['punch', 'laser']) {
    Game.init(); Game.autoSpawn = false; Game.fighters = [];
    const thrower = fighter(220, 1, 'tubtrooper'), attacker = fighter(700, -1, 'homelander');
    disableAI(thrower, attacker); thrower.duckCD = 0;
    assert.ok(thrower.startDuckThrow(attacker)); tick(.45);
    if (impact === 'punch') {
      assert.ok(attacker.startAttack(0)); thrower.takeHit(attacker, attacker.atk);
    } else {
      thrower.takeLaser(attacker, {x: thrower.rig.pel.x, y: thrower.rig.pel.y - 10}, true);
    }
    assert.notEqual(thrower.state, 'duck_throw', `${impact} interrupts the aim`);
    assert.equal(thrower.duckTarget, null, 'the old target is released');
    tick(2);
    assert.equal(Game.ducks.length, 0, `no duck appears after the ${impact} interruption`);
  }
});

test('head-impact blood splashes real severed fragments rather than the hidden original rig', () => {
  const attacker = fighter(180, 1, 'negan'), body = fighter(480, 1, 'jane');
  disableAI(attacker, body); body.hp = 0; body.rig = spreadRig();
  body.gorePieces = makeLaserPieces(body, {slope: 0, dir: 1});
  const oldHead = { ...body.rig.head };
  for (const piece of body.gorePieces) for (const node of piece.nodes) node.x += 1500;

  const distantExplosion = fighter(700, -1, 'walt'); disableAI(distantExplosion);
  distantExplosion.rig.head = oldHead;
  Game.explodeHead(distantExplosion, attacker, oldHead.x, oldHead.y);
  assert.equal(body.bloodStains.length, 0, 'the invisible original body cannot receive splashes');

  const part = body.gorePieces.flatMap(p => p.parts).find(p => p.name === 'torso');
  const nearbyExplosion = fighter(750, -1, 'saul'); disableAI(nearbyExplosion);
  nearbyExplosion.rig.head = {x: part.a.x, y: part.a.y};
  Game.explodeHead(nearbyExplosion, attacker, part.a.x, part.a.y);
  assert.ok(body.bloodStains.length > 0, 'nearby physical fragments receive blood');
  for (const mark of body.bloodStains) {
    const surface = goreSurfacePoint(body, mark);
    assert.ok(surface, 'each splash has a real fragment to follow');
    assert.ok(Math.hypot(surface.x - part.a.x, surface.y - part.a.y) < 280,
      'the splash stays in the vicinity of the impact');
  }
});

test('sandbox: placement uses the clicked world level and both falls land safely at 30, 60 and 120 FPS', () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
    Game.init({ sandbox: true });
    assert.equal(Game.fighters.length, 0); assert.equal(Game.autoSpawn, false);
    tick(2, dt); assert.equal(Game.fighters.length, 0, 'an empty sandbox does not auto-spawn');
    Game.camera.y = -700;
    const upperY = Game.screenToWorldY(100), middleY = Game.screenToWorldY(500);
    assert.ok(upperY < BRIDGE_Y && middleY > BRIDGE_Y, 'screen coordinates follow the moved camera');
    const upper = Game.spawnAt(220, upperY, 'tubtrooper');
    const middle = Game.spawnAt(480, middleY, 'walt');
    const lower = Game.spawnAt(720, 300, 'chester');
    assert.equal(upper.gy, BRIDGE_Y); assert.equal(upper.onBridge, true);
    assert.equal(middle.gy, Game.gy); assert.equal(middle.onBridge, false);
    assert.equal(lower.gy, Game.gy); assert.equal(lower.onBridge, false);
    assert.ok(upper.gy - upper.spawnY >= WORLD_TOP + 180, 'helmet stays under the ceiling');
    assert.ok(middle.gy - middle.spawnY >= BRIDGE_Y + 18 + 170, 'a lower spawn starts below the deck');
    assert.equal(Game.spawnAt(220, upperY, 'walt'), null, 'an occupied spawn point is rejected');
    assert.equal(Game.spawnAt(300, 100, 'not-a-skin'), null);
    disableAI(upper, middle, lower); tick(3, dt);
    for (const f of [upper, middle, lower]) {
      assert.equal(f.state, 'idle'); assert.equal(f.y, 0); assert.equal(f.hp, 100);
    }
    assert.equal(upper.onBridge, true); assert.equal(upper.gy, BRIDGE_Y);
    assert.equal(middle.onBridge, false); assert.equal(lower.onBridge, false);
    assert.equal(Game.fighters.length, 3, 'there is no automatic replacement');
  }
});

test('sandbox: the helmet is slightly larger than an ordinary head', () => {
  const previousHelmet = skinHeads.tubtrooper, previousHead = skinHeads.jane;
  const portrait = { complete: true, naturalWidth: 100 };
  try {
    skinHeads.tubtrooper = { img: portrait, aspect: .8, loaded: true };
    skinHeads.jane = { img: portrait, aspect: .8, loaded: true };
    const helmet = fighter(280, 1, 'tubtrooper'), person = fighter(680, 1, 'jane');
    const dimensions = [], g = makeCanvas().getContext('2d');
    g.drawImage = (...args) => dimensions.push({ width: args[3], height: args[4] });
    drawSkinHead(g, helmet.rig, helmet); drawSkinHead(g, person.rig, person);
    assert.equal(dimensions[0].height, 49); assert.equal(dimensions[1].height, 44);
    assert.ok(dimensions[0].width > dimensions[1].width);
  } finally {
    if (previousHelmet) skinHeads.tubtrooper = previousHelmet; else delete skinHeads.tubtrooper;
    if (previousHead) skinHeads.jane = previousHead; else delete skinHeads.jane;
  }
});

test('sandbox: a duck passes through its owner forever and through corpses, but still hits living opponents', () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
    for (const scenario of ['owner', 'corpse', 'living']) {
      Game.init({ sandbox: true });
      const owner = fighter(110, 1, 'tubtrooper');
      const body = scenario === 'owner' ? owner : fighter(480, -1, 'jane');
      if (scenario === 'owner') { owner.x = 480; owner.buildRig(0); }
      disableAI(owner, body);
      if (scenario === 'corpse') { body.toRagdoll(0, 0, true); body.hp = 0; body.buildRig(0); }
      Game.fighters = [body];
      const origin = { x: body.rig.pel.x - 90, y: body.rig.pel.y - 10 };
      const duck = launchDuck(Game, owner, body, origin);
      duck.age = 1; duck.vx = 600; duck.vy = -100; duck.power = 1;
      const hp = body.hp;
      for (let i = 0; i < Math.round(.24 / dt); i++) updateDucks(Game, dt, BRIDGE_Y, WORLD_TOP);
      if (scenario === 'living') {
        assert.ok(duck.hits > 0 && body.hp < hp, `living body must be hit at ${dt}`);
        assert.ok(duck.bounces > 0, 'a living collision still rebounds');
      } else {
        assert.equal(body.hp, hp); assert.equal(duck.hits, 0); assert.equal(duck.bounces, 0);
        assert.equal(duck.vx, 600, `${scenario} cannot slow or reflect the duck at ${dt}`);
        assert.ok(duck.x > body.rig.pel.x + 25, 'the duck continues through the whole body');
      }
    }
  }
});

test('sandbox: ducks render over settled bodies but behind bodies that are still falling', () => {
  Game.init({ sandbox: true });
  const grounded = fighter(310, 1, 'jane'), falling = fighter(650, -1, 'walt');
  grounded.toRagdoll(0, 0, true); grounded.hp = 0; grounded.rag.frozen = true; grounded.buildRig(0);
  falling.toRagdoll(0, 0, true); falling.hp = 0; falling.rag.grounded = () => false; falling.buildRig(0);
  assert.equal(fighterStillFalling(grounded), false); assert.equal(fighterStillFalling(falling), true);
  Game.ducks = [{ x: 480, y: 300, angle: 0, facing: 1 }];
  const events = [], ctx = Game.ctx, original = ctx.drawImage;
  ctx.drawImage = (...args) => {
    if (args[0] === Game.batLayer.canvas) events.push('bat');
    if (args[0] === Game.bodyLayer.canvas) events.push('body');
    original(...args);
  };
  try { Game.render(); } finally { ctx.drawImage = original; }
  assert.deepEqual(events, ['bat', 'body', 'bat', 'bat', 'body'],
    'settled body, duck, then the falling body (each body also has a shadow)');
});

test('sandbox: Tubtrooper makes room and may interrupt a charge to throw instead of diving', () => {
  for (const dir of [1, -1]) {
    Game.init({ sandbox: true });
    const trooper = fighter(dir === 1 ? 350 : 610, dir, 'tubtrooper');
    const enemy = fighter(trooper.x + dir * 230, -dir, 'jane'); disableAI(enemy);
    const ai = trooper.autopilot;
    ai.duckPlanTarget = enemy; ai.duckPlanT = 3; ai.duckMaintain = true; ai.duckIdeal = 380;
    ai.lampCheck = ai.spaceCD = ai.farCD = 100; ai.attackWait = 0; trooper.duckCD = 0;
    ai.update(1 / 60, trooper, enemy, Game.fighters);
    assert.equal(trooper.ctrl.mx, -dir, 'backs away while still facing the target');
    assert.equal(trooper.dir, dir); assert.equal(trooper.ctrl.noFace, true);

    trooper.x = dir === 1 ? 220 : 740; trooper.buildRig(0);
    enemy.x = trooper.x + dir * 400; enemy.buildRig(0);
    trooper.state = 'run'; trooper.vx = dir * 350; trooper.duckCD = 0;
    ai.startCharge(400); ai.attackWait = 0;
    const saved = Math.random;
    try {
      Math.random = () => .1; // exercise the optional charge-to-throw branch
      ai.update(1 / 60, trooper, enemy, Game.fighters);
      assert.equal(ai.mode, 'engage'); assert.equal(trooper.ctrl.run, false);
      trooper.update(1 / 60, enemy, Game.fighters);
      assert.equal(trooper.state, 'idle', 'he must plant his feet before the wind-up');
      ai.update(1 / 60, trooper, enemy, Game.fighters);
      assert.equal(trooper.state, 'duck_throw'); assert.equal(trooper.dive, false);
    } finally { Math.random = saved; }
  }
});

test('sandbox: peaceful fighters use a relaxed stance, bend arms to run/crouch, and stow weapons', () => {
  for (const skin of ['walt', 'homelander', 'saul', 'tubtrooper', 'negan', 'jane', 'chester']) {
    Game.init({ sandbox: true });
    const f = Game.spawnFighter(400, 1, 0, skin); f.reset(400, 1); disableAI(f);
    for (let i = 0; i < 45; i++) f.update(1 / 60, null, [f]);
    let p = f.targetPose();
    assert.equal(f.peaceful, true); assert.ok(Math.abs(p.tl) < 5, `${skin} stands upright`);
    assert.ok(Math.abs(p.a1) < 12 && p.e1 < 35 && p.e2 < 35, `${skin} has lowered, gently bent arms`);
    assert.equal(f.rig.bd, undefined, `${skin} is not holding a weapon in the neutral rig`);
    if (skin === 'homelander') assert.ok(f.hoverY < .1, 'he stands on the ground when peaceful');
    f.ctrl.mx = 1;
    for (let i = 0; i < 30; i++) f.update(1 / 60, null, [f]);
    p = f.targetPose(); assert.ok(Math.abs(p.a1) < 25 && p.e1 < 35, `${skin} walks relaxed`);
    f.ctrl.mx = 0; f.ctrl.crouch = true;
    for (let i = 0; i < 30; i++) f.update(1 / 60, null, [f]);
    assert.equal(f.crouchActive, true); assert.ok(f.targetPose().e1 >= 90, `${skin} bends arms to crouch`);
    f.ctrl.crouch = false; f.ctrl.mx = 1; f.ctrl.run = true;
    for (let i = 0; i < 30; i++) f.update(1 / 60, null, [f]);
    assert.equal(f.state, 'run'); assert.ok(f.targetPose().e1 >= 80, `${skin} bends arms to run`);
    if (skin === 'negan' || skin === 'chester') {
      assert.equal(f.rig.bd, undefined, 'the weapon remains stowed while peacefully running');
      const count = Game.batLayer.ctx.stats.drawImage, colors = new Set(Game.batLayer.ctx.stats.colors);
      Game.render();
      if (skin === 'negan') assert.ok(Game.batLayer.ctx.stats.drawImage > count, 'stowed bat is rendered');
      else assert.ok(Game.batLayer.ctx.stats.colors.has('#c71b2d') || colors.has('#c71b2d'), 'stowed guitar is rendered');
      f.ctrl.mx = 0; f.ctrl.run = false; f.state = 'idle';
      const enemy = fighter(700, -1, 'walt'); disableAI(enemy);
      f.update(1 / 60, enemy, [f, enemy]);
      assert.ok(f.rig.bd, 'the weapon can be drawn again for combat');
    }
  }
});

test('sandbox: solo AI can stand, walk, crouch, run and jump without treating the jump as an attack', () => {
  const cases = [
    [.10, 'stand'], [.50, 'walk'], [.75, 'crouch'], [.90, 'run'], [.99, 'jump'],
  ];
  for (const [roll, action] of cases) {
    Game.init({ sandbox: true });
    const f = fighter(480, 1, 'walt'), ai = f.autopilot;
    f.ambientRandom = () => roll; ai.wanderT = 0;
    ai.update(1 / 60, f, null, [f]);
    assert.equal(ai.wanderAction, action === 'jump' ? 'stand' : action);
    if (action === 'stand') assert.equal(f.ctrl.mx, 0);
    if (action === 'walk') assert.ok(f.ctrl.mx && !f.ctrl.run);
    if (action === 'crouch') assert.equal(f.ctrl.crouch, true);
    if (action === 'run') assert.ok(f.ctrl.mx && f.ctrl.run);
    if (action === 'jump') {
      assert.equal(f.ctrl.jump, true); assert.equal(f.ctrl.mx, 0);
      f.update(1 / 60, null, [f]); assert.equal(f.state, 'air'); assert.equal(f.dive, false);
    }
  }
});

test('sandbox: fighters have no speech or dialogue, including when knocked down', () => {
  Game.init({ sandbox: true });
  const f = fighter(400, 1, 'chester'); disableAI(f);
  const texts = gameCanvas.getContext('2d').stats.texts.length;
  tick(15); f.toRagdoll(0, 0, true); tick(2); Game.render();
  assert.equal('speech' in f, false);
  assert.equal(typeof f.speak, 'undefined');
  assert.equal(gameCanvas.getContext('2d').stats.texts.length, texts, 'no dialogue is drawn above fighters');
  for (const removed of ['drawSpeech', 'updateSpeech', 'CASUAL_LINES', 'DOWN_LINES', 'CHECK_LINES', 'CHESTER_HUMS'])
    assert.ok(!source.includes(removed), `${removed} should be removed from the engine`);
});

test('sandbox: wandering does not consume the combat random stream', () => {
  Game.init({ sandbox: true });
  const f = fighter(480, 1, 'jane'); f.autopilot.wanderT = 0;
  const saved = Math.random;
  try {
    Math.random = () => { throw new Error('ambient behaviour consumed combat RNG'); };
    f.autopilot.wander(1 / 60, f, 'idle');
  } finally { Math.random = saved; }
});

test('sandbox: a majority of independent Tubtrooper plans create distance without eliminating melee', () => {
  let retreat = 0, aggressive = 0;
  for (let seed = 1; seed <= 100; seed++) {
    seedRandom(seed * 7919); Game.init({ sandbox: true });
    const f = fighter(300, 1, 'tubtrooper'), enemy = fighter(530, -1, 'walt');
    disableAI(enemy); f.duckCD = 0; f.guardCD = 100;
    const ai = f.autopilot; ai.attackWait = 0; ai.lampCheck = ai.spaceCD = ai.farCD = 100;
    ai.update(1 / 60, f, enemy, Game.fighters);
    if (f.ctrl.mx < 0) retreat++;
    else if (!ai.duckMaintain) aggressive++;
  }
  assert.ok(retreat >= 65, `expected most plans to make space, got ${retreat}`);
  assert.ok(aggressive >= 8, `some plans should still choose close combat, got ${aggressive}`);
});

test('sandbox: each settled severed piece is behind the duck while falling pieces stay in front', () => {
  Game.init({ sandbox: true });
  const f = fighter(480, 1, 'walt'); f.hp = 0; f.rig = spreadRig();
  f.gorePieces = makeLaserPieces(f, { slope: 0, dir: 1 });
  assert.ok(f.gorePieces.length >= 2);
  for (const [index, piece] of f.gorePieces.entries()) piece.settled = index === 0;
  Game.ducks = [{ x: 480, y: 300, angle: 0, facing: 1 }];
  const events = [], ctx = Game.ctx, original = ctx.drawImage;
  ctx.drawImage = (...args) => {
    if (args[0] === Game.goreLayer.canvas) events.push('gore');
    if (args[0] === Game.batLayer.canvas) events.push('duck');
    original(...args);
  };
  try { Game.render(); } finally { ctx.drawImage = original; }
  assert.deepEqual(events, ['gore', 'duck', 'gore']);
});

test('bridge: an observer cannot target or react to anybody below the deck', () => {
  Game.init({ sandbox: true });
  const upper = fighter(600, -1, 'walt'), lower = fighter(720, -1, 'jane');
  disableAI(lower);
  upper.onBridge = true; upper.gy = BRIDGE_Y; upper.buildRig(0);
  upper.autopilot.wanderT = 10; upper.autopilot.wanderAction = 'stand';
  assert.equal(Game.findBestOpponent(upper), null);
  assert.equal(Game.findBestOpponent(lower), upper, 'pursuit from below remains possible');
  tick(1);
  assert.equal(upper.peaceful, true); assert.equal(upper.dir, -1, 'no facing or pursuit of the lower fighter');
  assert.notEqual(upper.state, 'attack');
  lower.y = Game.gy - (BRIDGE_Y + 70); lower.buildRig(0);
  assert.equal(Game.findBestOpponent(upper), null, 'even a nearby climber below the deck is hidden');
  lower.y = Game.gy - (BRIDGE_Y - 5); lower.buildRig(0);
  assert.equal(Game.findBestOpponent(upper), lower, 'a fighter who reaches bridge height can be seen');
});

test('bridge: the rare tackle is decided at a cooldown, not every frame', () => {
  assert.equal(BRIDGE_TACKLE_CHANCE, .04);
  const a = fighter(400, 1, 'jane'), b = fighter(530, -1, 'walt');
  for (const f of [a, b]) { f.onBridge = true; f.gy = BRIDGE_Y; f.cur = null; f.buildRig(0); }
  const ai = a.autopilot;
  ai.bridgeTackleCD = 0; ai.attackWait = ai.lampCheck = ai.spaceCD = ai.farCD = 100;
  const random = Math.random;
  try {
    Math.random = () => .9;
    ai.update(1 / 60, a, b, Game.fighters);
    assert.equal(a.onBridge, true, 'ordinary bridge combat does not force a fall');
    assert.ok(ai.bridgeTackleCD >= 4);
    Math.random = () => 0;
    ai.update(1 / 60, a, b, Game.fighters);
    assert.equal(a.onBridge, true, 'a failed roll cannot be repeated next frame');
    ai.bridgeTackleCD = 0;
    ai.update(1 / 60, a, b, Game.fighters);
    assert.equal(a.state, 'bridge_leap', 'a successful rare roll can still cause a fall');
    assert.equal(a.onBridge, false);
  } finally { Math.random = random; }
});

test('bridge: a lone fighter autonomously reaches a rope and descends safely at 30, 60 and 120 FPS', () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
    Game.init({ sandbox: true });
    const f = fighter(110, 1, 'walt');
    f.onBridge = true; f.gy = BRIDGE_Y; f.buildRig(0);
    f.autopilot.bridgeDescentWait = .1; f.autopilot.wanderT = 10;
    const hp = f.hp; let hanging = 0, previousFoot = BRIDGE_Y, landed = false;
    for (let i = 0; i < Math.ceil(20 / dt); i++) {
      Game.update(dt);
      if (f.state === 'lamp_hang' && f.lampAction === 'descend') {
        hanging++;
        const foot = f.gy - f.y, grip = f.lampRef.point(30 + f.lampClimb);
        assert.ok(Math.abs(foot - previousFoot) < 30, `no teleport during descent at ${dt}`);
        assert.ok(distance(f.rig.wN, grip) < 7 && distance(f.rig.wF, grip) < 7, `hands stay on the rope at ${dt}`);
        previousFoot = foot;
      }
      if (hanging && !f.onBridge && f.state === 'idle' && f.y === 0) { landed = true; break; }
    }
    assert.ok(hanging > 60, `a real sustained rope descent happened at ${dt}`);
    assert.ok(landed, `fighter lands on the lower floor at ${dt}`);
    assert.equal(f.hp, hp, 'controlled descent does not cause fall damage');
    assert.equal(f.gy, Game.gy); assert.equal(f.lampRef, null);
    assert.ok(Game.lamps.every(l => !l.riders.has(f)));
    Game.render();
  }
});

test('bridge: rope riders cannot collide head-on and multiple descending riders keep their distance', () => {
  Game.init({ sandbox: true });
  const lamp = Game.lamps[1], lower = fighter(lamp.x, 1, 'jane'); disableAI(lower);
  assert.equal(lower.startLampJump(lamp), true);
  advanceUntil(() => lower.state === 'lamp_hang', 180);
  lower.lampAction = 'climb'; lower.lampStamina = 20; lower.lampBreakAt = Infinity;
  const first = fighter(lamp.anchorX, 1, 'walt'); disableAI(first);
  first.onBridge = true; first.gy = BRIDGE_Y; first.buildRig(0);
  first.x = first.bridgeRopeApproach(lamp).x; first.buildRig(0);
  assert.equal(first.startLampDescent(lamp), false, 'do not descend into an ascending rider');
  lower.clearLamp(); lower.state = 'idle'; lower.y = 0; lower.gy = Game.gy;
  assert.equal(first.startLampDescent(lamp), true);
  assert.equal(lamp.canGrab(), false, 'a ground fighter cannot start an opposing climb');
  tick(1);
  const second = fighter(lamp.anchorX, 1, 'saul'); disableAI(second);
  second.onBridge = true; second.gy = BRIDGE_Y; second.buildRig(0);
  second.x = second.bridgeRopeApproach(lamp).x; second.buildRig(0);
  assert.equal(second.startLampDescent(lamp), true, 'a second person can follow from the top');
  for (let i = 0; i < 90; i++) {
    Game.update(1 / 60);
    assert.ok(second.lampClimb - first.lampClimb >= 89, 'riders cannot pass through each other');
  }
  assert.equal(lamp.riders.size, 2);
});

test('sandbox: cleanup actions are independent and restore broken map fixtures without ejecting riders', () => {
  Game.init({ sandbox: true });
  const live = fighter(220, 1, 'jane'), dead = fighter(780, -1, 'negan');
  disableAI(live, dead); dead.hp = 0; dead.toRagdoll(0, 0, true);
  Game.fx.gibs.push({ owner: dead.id }); Game.droppedBats.push({ kind: 'bat' });
  Game.ducks.push({ owner: live });
  Game.fx.bloodField.add(400, Game.gy + 8, 'seep'); Game.fx.bl.push({});
  live.bloodStains.push({ kind: 'blood' }); live.footBlood.N = 2;
  const broken = Game.lamps[0], kept = Game.lamps[1];
  assert.equal(Game.detachLamp(broken), true);
  Game.fx.marks.push({ surf: 'floor' });

  Game.clearBodies();
  assert.deepEqual(Game.fighters, [live]); assert.equal(Game.fx.gibs.length, 0);
  assert.equal(Game.droppedBats.length, 0); assert.equal(Game.ducks.length, 1);
  assert.ok(Game.fx.bloodField.cells.size > 0); assert.equal(broken.detached, true);

  Game.clearBlood();
  assert.equal(Game.fx.bl.length, 0); assert.equal(Game.fx.bloodField.cells.size, 0);
  assert.equal(live.bloodStains.length, 0); assert.equal(live.footBlood.N, 0);
  assert.equal(Game.fx.marks.length, 1, 'cleaning blood does not restore the map');
  assert.equal(Game.fighters.length, 1); assert.equal(Game.ducks.length, 1);

  // Set up an actual rider on an intact rope. The detached fixture is the
  // only one that should be rebuilt; blood, entities and riders survive.
  Game.ducks = []; live.x = kept.x; live.buildRig(0);
  assert.equal(live.startLampJump(kept), true);
  advanceUntil(() => live.state === 'lamp_hang', 180);
  live.lampBreakAt = Infinity; live.lampAction = 'climb'; live.lampStamina = 20;
  Game.ducks.push({ owner: live }); Game.fx.bloodField.add(420, Game.gy + 8, 'seep');
  let clears = 0; const clearRect = Game.dctx.clearRect;
  Game.dctx.clearRect = (...args) => { clears++; clearRect(...args); };
  Game.restoreMap(); Game.dctx.clearRect = clearRect;
  assert.ok(clears > 0, 'impact-crack canvas is cleared');
  assert.equal(broken.detached, false); assert.equal(Game.detachedLamps, 0);
  assert.equal(Game.fx.marks.length, 0); assert.equal(live.lampRef, kept); assert.ok(kept.riders.has(live));
  assert.equal(Game.fighters.length, 1); assert.equal(Game.ducks.length, 1);
  assert.ok(Game.fx.bloodField.cells.size > 0, 'map restoration does not clean blood');

  assert.equal(Game.detachLamp(broken), true);
  Game.fx.gibs.push({}); Game.droppedBats.push({}); Game.fx.sm.push({});
  Game.clearAll();
  assert.equal(Game.fighters.length, 0); assert.equal(Game.ducks.length, 0);
  assert.equal(Game.droppedBats.length, 0); assert.equal(Game.fx.gibs.length, 0);
  assert.equal(Game.fx.sm.length, 0); assert.equal(Game.fx.bloodField.cells.size, 0);
  assert.equal(kept.riders.size, 0); assert.equal(live.lampRef, null);
  assert.equal(broken.detached, true, 'clear all does not secretly repair the map');
  Game.update(1); assert.equal(Game.fighters.length, 0, 'clear all never auto-respawns fighters');
});

test('sandbox: pause freezes physics, visual clocks, sound and input; cleanup still redraws', () => {
  const listeners = new Map();
  const saved = {
    add: gameCanvas.addEventListener, remove: gameCanvas.removeEventListener,
    rect: gameCanvas.getBoundingClientRect, capture: gameCanvas.setPointerCapture,
    classList: gameCanvas.classList, raf: globalThis.requestAnimationFrame,
    cancel: globalThis.cancelAnimationFrame, removeWindow: globalThis.removeEventListener,
    audio: Snd.ac,
  };
  gameCanvas.addEventListener = (type, handler) => listeners.set(type, handler);
  gameCanvas.removeEventListener = (type, handler) => { if (listeners.get(type) === handler) listeners.delete(type); };
  gameCanvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 960, height: 540 });
  gameCanvas.setPointerCapture = () => {};
  gameCanvas.classList = { add() {}, remove() {} };
  let frame; globalThis.requestAnimationFrame = cb => { frame = cb; return 1; };
  globalThis.cancelAnimationFrame = () => {}; globalThis.removeEventListener = () => {};
  const audio = { state: 'running', calls: [], suspend() { this.calls.push('suspend'); this.state = 'suspended'; return Promise.resolve(); },
    resume() { this.calls.push('resume'); this.state = 'running'; return Promise.resolve(); } };
  let api;
  try {
    api = startGame(); Snd.ac = audio; api.selectSkin('jane');
    const f = fighter(400, 1, 'jane'); disableAI(f); f.ctrl.mx = 1;
    const base = performance.now(); frame(base + 20);
    api.setPaused(true);
    assert.equal(Game.paused, true); assert.deepEqual(audio.calls, ['suspend']);
    const snapshot = { x: f.x, t: f.t, time: Game.time, audience: Game.audience.time,
      theta: Game.lamps[1].theta, camera: Game.camera.y };
    const pixels = gameCanvas.getContext('2d').stats.drawImage;
    for (let i = 1; i <= 12; i++) frame(base + 20 + i * 100);
    Game.update(2);
    assert.deepEqual({ x: f.x, t: f.t, time: Game.time, audience: Game.audience.time,
      theta: Game.lamps[1].theta, camera: Game.camera.y }, snapshot);
    assert.equal(gameCanvas.getContext('2d').stats.drawImage, pixels, 'paused RAF does not repaint flickering frames');
    const event = { button: 0, pointerType: 'mouse', pointerId: 1, clientX: 650, clientY: 300, preventDefault() {} };
    listeners.get('pointerdown')(event); listeners.get('pointerup')(event);
    assert.equal(Game.fighters.length, 1, 'paused canvas does not add a fighter');
    const oldTarget = Game.camera.targetY;
    listeners.get('wheel')({ deltaY: -100, deltaMode: 0, preventDefault() {} });
    assert.equal(Game.camera.targetY, oldTarget, 'paused camera does not move');
    Game.fx.bloodField.add(400, Game.gy + 5, 'seep'); api.clearBlood();
    assert.equal(Game.fx.bloodField.cells.size, 0);
    assert.ok(gameCanvas.getContext('2d').stats.drawImage > pixels, 'an explicit cleanup redraws the paused frame');
    api.setPaused(false); assert.deepEqual(audio.calls, ['suspend', 'resume']);
    frame(base + 1240);
    assert.ok(f.t > snapshot.t && f.x > snapshot.x, 'simulation resumes without a large catch-up step');
    assert.ok(f.t - snapshot.t <= .034);
  } finally {
    api?.destroy(); Snd.ac = saved.audio;
    gameCanvas.addEventListener = saved.add; gameCanvas.removeEventListener = saved.remove;
    gameCanvas.getBoundingClientRect = saved.rect; gameCanvas.setPointerCapture = saved.capture;
    gameCanvas.classList = saved.classList; globalThis.requestAnimationFrame = saved.raf;
    globalThis.cancelAnimationFrame = saved.cancel; globalThis.removeEventListener = saved.removeWindow;
  }
});
