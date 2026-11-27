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
  const ctx = {
    canvas, stats,
    get fillStyle() { return fillStyle; },
    set fillStyle(value) { fillStyle = value; stats.colors.add(value); },
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
    assert.ok(distance(defender.rig.wN, defender.rig.head) < 24);
    assert.ok(distance(defender.rig.wF, defender.rig.head) < 24);
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
  assert.doesNotMatch(source, /hypno|trance|bullet|droppedgun|grab_prep|grab_throw|grabtarget|grabbedby/i);
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
