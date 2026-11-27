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
    contents: `${source}\nexport { Game, Fighter, surfacePoint, locateSurface, stainedSkinSprite, addLaserRip, drawLimbRips, drawBeam, drawEyeGlow, SK_, Audience, BloodField };`,
    resolveDir: fileURLToPath(new URL('../src/game/', import.meta.url)), sourcefile: 'engine.ts', loader: 'ts',
  },
  bundle: true, write: false, platform: 'browser', format: 'esm', target: 'es2020',
});
const { Game, Fighter, surfacePoint, locateSurface, stainedSkinSprite, addLaserRip, drawLimbRips, drawBeam, drawEyeGlow, SK_, Audience, BloodField } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
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

test('portrait sizing keeps the full arena visible and vertically letterboxed', () => {
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
      if (f.state === 'lamp_hang') assert.equal(f.lampRef?.occupant, f);
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
            assert.equal(f.lampRef?.occupant, f);
            if (f.st > .3) {
              const p = f.lampRef.grip();
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
    stagger: 0, staggerKO: 0, kos: 0, getup: 0, jump: 0, grab: 0, pull: 0, dive: 0, lampLeap: 0,
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
      if (name === 'startLampJump' && result) counts.jump++;
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
            assert.equal(f.lampRef.occupant, f);
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
    assert.ok(counts.jump < 35, 'lamp attempts stay rare over many complete matches');
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

test('small drops, soft steps and hovering do not splash or stain; a strong landing does', () => {
  const f = fighter(420, 1, 'jane'); disableAI(f);
  const field = Game.fx.bloodField, x = f.rig.aN.x + f.rig.fdN.x * 7;
  let calls = 0; const splash = Game.fx.splash.bind(Game.fx);
  Game.fx.splash = (...args) => { calls++; splash(...args); };
  try {
    field.add(x, Game.gy + 9, 'drip');
    f.queueBloodFootfall('N', 1); f.resolveBloodFootfall();
    assert.equal(calls, 0); assert.deepEqual(f.footBlood, { N: 0, F: 0 });
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

test('each knee and elbow stains only on real puddle contact and follows its own two limb sprites', () => {
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
      assert.equal(f.jointBlood[joint], 0, 'an isolated drop is not a puddle');
      for (let i = 0; i < 18; i++) field.add(480 + Math.sin(i) * 3, Game.gy + 9, 'seep');
      point.y -= 12; f.buildRig(0); f.resolveBloodJointContacts(dt);
      assert.equal(f.jointBlood[joint], 0, 'the joint is still airborne');
      point.y += 12; f.update(dt, null, [f]);
      const level = f.jointBlood[joint];
      assert.ok(level > 0, `${skin}/${dir}/${joint}/${dt}: contact stained the joint`);
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
  let queries = 0; const puddleAtFoot = field.puddleAtFoot;
  try {
    field.puddleAtFoot = (...args) => { queries++; return puddleAtFoot.apply(field, args); };
    f.resolveBloodJointContacts(1 / 60);
    assert.equal(queries, 0, 'fully stained limbs avoid redundant puddle scans');
  } finally { field.puddleAtFoot = puddleAtFoot; }
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
