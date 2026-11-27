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
const { Game, Fighter } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
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
    assert.equal(boxer.state, lethal ? 'ragdoll' : 'hit');
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

// Keep a living body on the ground while testing optional interactions; normal
// recovery is tested separately with the real AI and timer.
function sleepingBody(f, vx = 0, dt = 1 / 60) {
  f.toRagdoll(vx, 220);
  f.rag.recoverAt = 999;
  advanceUntil(() => f.rag && f.rag.sleeping, 360, dt);
  return f.rag;
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

test('ground kicks deal little damage, never move the sleeping victim, and stop at three until cooldown', () => {
  const v = fighter(480, 1, 'walt'); disableAI(v);
  const r = sleepingBody(v, -100), a = fighter(r.p.pel.x - 60, 1, 'jane'); disableAI(a);
  const before = ragSnapshot(r), hp = v.hp;
  for (let i = 0; i < 3; i++) {
    assert.equal(a.startGroundKick(v), true);
    let leanedBack = false, extended = false;
    for (let frame = 0; frame < 60 && a.state === 'ground_kick'; frame++) {
      Game.update(1 / 60);
      if (a.state === 'ground_kick' && a.st > .1 && a.st < .3) leanedBack ||= a.cur.tl < -5;
      if (a.state === 'ground_kick' && a.st >= .36) extended ||= a.cur.f1x > 45;
      assert.deepEqual(ragSnapshot(r), before, 'the kick must not displace any Verlet point');
    }
    assert.ok(leanedBack && extended, 'kick has a wind-up and a visible extension');
    assert.equal(v.hp, hp - 2 * (i + 1));
    tick(.34);
  }
  assert.ok(a.groundKickCD >= 6);
  assert.equal(a.startGroundKick(v), false, 'a fourth kick is prohibited');
  tick(11);
  assert.equal(a.groundKickCount, 0, 'the series resets after the cooldown');
  assert.equal(a.startGroundKick(v), true);
});

test('ground kicks can be chosen autonomously, but are optional and stop if interrupted', () => {
  const v = fighter(480, 1, 'walt'); disableAI(v);
  const r = sleepingBody(v, 80), a = fighter(r.p.pel.x - 64, 1, 'jane');
  const ai = a.autopilot;
  const rand = Math.random;
  try {
    Math.random = () => .9;
    ai.update(1 / 60, a, v, Game.fighters);
    assert.equal(ai.groundTarget, null, 'a fighter may choose not to kick');
    assert.equal(a.state, 'idle');
    ai.downDecided = false;
    Math.random = () => .1;
    ai.update(1 / 60, a, v, Game.fighters);
    assert.equal(a.state, 'ground_kick', 'the real controller can choose a kick');
  } finally { Math.random = rand; }
  const third = fighter(a.x - 85, 1, 'saul'); disableAI(a, v, third);
  const hp = v.hp;
  a.takeHit(third, punch);
  assert.equal(a.state, 'hit');
  assert.ok(a.groundKickCD > 0);
  tick(1);
  assert.equal(v.hp, hp, 'an interrupted wind-up cannot hit later');
  assert.equal(a.groundKickTarget, null);
});

test('a grounded kick that KOs preserves the exact resting body position', () => {
  const v = fighter(480, -1, 'negan'); disableAI(v);
  const r = sleepingBody(v, 100), a = fighter(r.p.pel.x - 65, 1); disableAI(a);
  v.hp = 2; const before = ragSnapshot(r);
  assert.equal(a.startGroundKick(v), true);
  advanceUntil(() => v.hp === 0, 90);
  assert.equal(v.state, 'ragdoll');
  assert.equal(v.rag, r);
  assert.deepEqual(ragSnapshot(r), before);
  assert.equal(Game.koCount, 1);
  assert.equal(v.batLost, true);
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

test('tactical retreat is a rare decision, faces the threat, blocks attacks and avoids a fighter behind', () => {
  const f = fighter(440, 1), o = fighter(600, -1); disableAI(o);
  const ai = f.autopilot;
  ai.attackWait = ai.farCD = ai.lampCheck = 1e6;
  let retreats = 0;
  seedRandom(7001);
  for (let i = 0; i < 5000; i++) {
    ai.setMode('engage'); ai.retreatCheck = 0;
    ai.update(.001, f, o, Game.fighters);
    if (ai.mode === 'tactical_retreat') retreats++;
  }
  assert.ok(retreats > 190 && retreats < 310, `expected roughly 5%, got ${retreats}/5000`);
  ai.setMode('tactical_retreat'); ai.dodgeP = 0; ai.hopCD = 100; f.guardCD = 0;
  const start = f.x;
  for (let i = 0; i < 20; i++) {
    ai.update(1 / 60, f, o, Game.fighters); f.update(1 / 60, o, Game.fighters);
    assert.equal(f.dir, 1, 'the backstep must not turn its back');
  }
  assert.ok(f.x < start - 10);
  o.x = f.x + 120; o.buildRig(1 / 60);
  o.startAttack(0); o.st = .02; ai.setMode('tactical_retreat');
  ai.update(1 / 60, f, o, Game.fighters);
  assert.equal(f.state, 'guard', 'an incoming blow can be actively blocked while retreating');
  f.state = 'idle'; f.guardCD = 0; o.state = 'idle';
  const behind = fighter(f.x - 80, 1); disableAI(behind);
  ai.setMode('tactical_retreat'); ai.update(1 / 60, f, o, Game.fighters);
  assert.equal(ai.mode, 'engage', 'do not retreat into another fighter');
  assert.equal(f.dir, 1);
});

test('face-down quick push-up can become a stumble-run halfway through recovery', () => {
  const f = fighter(470, 1), o = fighter(740, -1); disableAI(f, o);
  const r = sleepingBody(f, 200);
  assert.equal(f.quickGetupKind(), 'push');
  assert.ok(r.p.head.x > r.p.pel.x);
  f.startGetup('push', true, o);
  advanceUntil(() => f.state === 'scramble', 100);
  const start = f.x;
  assert.equal(f.dir, -1);
  tick(.35);
  assert.ok(f.x < start - 35, 'the halfway escape moves away from the opponent');
  assert.ok(f.cur.tl > 30, 'the escape remains hunched and awkward');
  advanceUntil(() => f.state === 'idle', 120);
});

test('a face-up kip-up needs a tucked leg and knocks over a nearby unguarded enemy', () => {
  for (const guarded of [false, true]) {
    Game.fighters = [];
    const f = fighter(480, 1); disableAI(f);
    const r = sleepingBody(f, -200);
    assert.equal(f.quickGetupKind(), 'kip');
    const o = fighter(r.p.pel.x + 70, -1, 'walt'); disableAI(o);
    if (guarded) assert.equal(o.startGuard(f), true);
    f.startGetup('kip', false, o);
    advanceUntil(() => f.quickBumpDone, 100);
    if (guarded) {
      assert.equal(o.hp, 100);
      assert.equal(o.state, 'guard');
    } else {
      assert.equal(o.hp, 97);
      assert.equal(o.state, 'ragdoll');
    }
    advanceUntil(() => f.state === 'idle', 120);
  }
});

test('the AI makes a single optional quick-recovery decision for each settled knockdown', () => {
  const f = fighter(480, 1), o = fighter(750, -1); disableAI(o);
  const ai = f.autopilot;
  sleepingBody(f, 200);
  assert.equal(f.quickGetupKind(), 'push');
  const rand = Math.random;
  try { Math.random = () => 0; ai.update(1 / 60, f, o, Game.fighters); } finally { Math.random = rand; }
  assert.equal(f.state, 'quick_getup');
  assert.equal(f.quickKind, 'push');
  assert.equal(f.quickEscape, true);
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

test('all heroes can jump to a reachable lamp and hold the moving rope with one or two hands', () => {
  for (const skin of ['jane', 'negan', 'homelander']) for (const dir of [1, -1]) {
    const { f, lamp } = hangingPair({ skin, dir });
    assert.equal(lamp.occupant, f);
    assert.ok(f.y > 0 && f.lampStamina > 0);
    for (const style of ['near', 'far', 'two', 'switch']) {
      f.lampGripStyle = style; tick(.05);
      const p = lamp.point(f.lampClimb);
      const dn = distance(f.rig.wN, p), df = distance(f.rig.wF, p);
      if (style === 'near' || style === 'two') assert.ok(dn < 6, `${skin} ${dir} ${style}: near hand`);
      if (style === 'far' || style === 'two') assert.ok(df < 6, `${skin} ${dir} ${style}: far hand`);
      if (style === 'switch') assert.ok(Math.min(dn, df) < 6, 'an alternating hand still grips the rope');
      Game.render();
    }
    assert.ok(Math.abs(lamp.theta) > .001 || Math.abs(lamp.omega) > .001, 'grabbing sets the lamp in motion');
  }
});

test('pull-up, rope climbing, finite stamina and a deliberate dive all use the live lamp position', () => {
  {
    const { f, lamp } = hangingPair();
    f.lampGripStyle = 'two'; f.lampAction = 'climb';
    tick(1.9);
    assert.ok(f.lampClimb > 30, 'the fighter can climb a short distance');
    assert.ok(distance(f.rig.wN, lamp.point(f.lampClimb)) < 6);
    f.lampAction = 'pullup'; f.st = .5; f.lampClimb = 0;
    tick(.1);
    const gap = f.rig.sh.y - lamp.point(f.lampClimb).y;
    assert.ok(gap < 46, `pull-up should bend the arms and lift the body, got ${gap}`);
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
    f.rag.recoverAt = 999;
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
    ai.attackWait = 0; ai.farCD = ai.lampCheck = ai.retreatCheck = 100;
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
  ai.attackWait = ai.farCD = ai.retreatCheck = 100; ai.lampCheck = 0;
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

test('seeded unattended fights use the optional actions and keep physics and lamp links valid', () => {
  const counts = { ground: 0, impact: 0, stagger: 0, push: 0, kip: 0, scramble: 0,
    jump: 0, grab: 0, pull: 0, dive: 0, retreat: 0 };
  const names = ['startGroundKick', 'hitGroundTarget', 'startStagger', 'startGetup',
    'startLampJump', 'grabLamp', 'startLampPull', 'releaseLamp'];
  const original = Object.fromEntries(names.map(name => [name, Fighter.prototype[name]]));
  try {
    for (const name of names) Fighter.prototype[name] = function (...args) {
      const hp = this.groundKickTarget?.hp;
      const result = original[name].apply(this, args);
      if (name === 'startGroundKick' && result) counts.ground++;
      if (name === 'hitGroundTarget' && this.groundKickTarget && this.groundKickTarget.hp < hp) counts.impact++;
      if (name === 'startStagger' && this.state === 'stagger_fall') counts.stagger++;
      if (name === 'startGetup' && (args[0] === 'push' || args[0] === 'kip')) counts[args[0]]++;
      if (name === 'startLampJump' && result) counts.jump++;
      if (name === 'grabLamp' && result) counts.grab++;
      if (name === 'startLampPull' && result) counts.pull++;
      if (name === 'releaseLamp' && args[0] === 'dive') counts.dive++;
      return result;
    };
    for (const seed of [19, 31, 57, 83, 101, 133, 177, 251]) {
      seedRandom(seed); Game.init();
      const previousState = new Map(), previousMode = new Map();
      for (let frame = 0; frame < 240 * 60; frame++) {
        Game.update(1 / 60);
        assert.ok(Game.detachedLamps <= 2);
        for (const f of Game.fighters) {
          assert.ok(Number.isFinite(f.x) && Number.isFinite(f.y) && Number.isFinite(f.hp));
          if (f.state === 'lamp_hang') {
            assert.ok(f.lampRef && Game.lamps.includes(f.lampRef));
            assert.equal(f.lampRef.occupant, f);
          }
          if (f.rag) for (const p of Object.values(f.rag.p)) {
            assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
          }
          if (f.state === 'scramble' && previousState.get(f.id) !== 'scramble') counts.scramble++;
          if (f.autopilot.mode === 'tactical_retreat' && previousMode.get(f.id) !== 'tactical_retreat') counts.retreat++;
          previousState.set(f.id, f.state); previousMode.set(f.id, f.autopilot.mode);
        }
        for (const lamp of Game.lamps) {
          if (!lamp.detached) assert.ok(lamp.y <= Game.H / 2);
          if (lamp.occupant) assert.equal(lamp.occupant.lampRef, lamp);
        }
      }
    }
    console.log('optional autonomous events:', counts);
    for (const [name, count] of Object.entries(counts)) assert.ok(count > 0, `${name} never happened autonomously`);
    assert.ok(counts.jump < 35, 'lamp attempts stay rare over many complete matches');
    assert.ok(counts.ground < 150, 'ground kicks are not the default behavior');
  } finally {
    for (const name of names) Fighter.prototype[name] = original[name];
  }
});

test('a fighter can run up to a distant downed opponent before choosing a grounded kick', () => {
  const v = fighter(500, -1, 'walt'); disableAI(v);
  const r = sleepingBody(v, 0), a = fighter(100, 1, 'jane');
  const ai = a.autopilot, start = a.x, random = Math.random;
  try { Math.random = () => .1; ai.update(1 / 60, a, v, Game.fighters); } finally { Math.random = random; }
  assert.equal(ai.groundTarget, v);
  let ran = false;
  for (let i = 0; i < 360 && a.state !== 'ground_kick'; i++) {
    Game.update(1 / 60); ran ||= a.state === 'run';
  }
  assert.ok(ran, 'the attacker chose to run while far away');
  assert.equal(a.state, 'ground_kick');
  assert.ok(a.x > start + 150 && Math.abs(a.x - r.p.pel.x) < 78);
});

test('a grounded kick misses cleanly if the victim starts getting up before impact', () => {
  const v = fighter(480, 1, 'walt'); disableAI(v);
  const r = sleepingBody(v, -100), a = fighter(r.p.pel.x - 60, 1); disableAI(a);
  assert.equal(a.startGroundKick(v), true);
  tick(.12);
  const hp = v.hp;
  v.startGetup();
  tick(.8);
  assert.equal(v.hp, hp);
  assert.equal(a.state, 'idle');
  assert.equal(a.groundKickTarget, null);
});
