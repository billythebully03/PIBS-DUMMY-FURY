// @ts-nocheck
/* The audience has its own random stream: decorations must never change combat rolls. */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const snap = v => Math.round(v / 3) * 3;
const seedNow = () => {
  if (globalThis.crypto?.getRandomValues) {
    const value = new Uint32Array(1); globalThis.crypto.getRandomValues(value); return value[0];
  }
  return (Date.now() ^ Math.floor((globalThis.performance?.now?.() || 0) * 1000)) >>> 0;
};

// A poster always contains one short name belonging to an actual fighter.
export const POSTER_LABELS = {
  jane: ['P.J', 'PATRICK', 'JANE'],
  negan: ['NEGAN', 'NEG', 'N.G'],
  homelander: ['HOME', 'H.L', 'HOMIE'],
  walt: ['W.W', 'WALTER', 'WALT'],
  saul: ['SAUL', 'S.G', 'GOODMAN'],
};

// Tiny hand-drawn bitmap font, rendered as pixels instead of browser text.
const GLYPHS = {
  A:['010','101','111','101','101'], B:['110','101','110','101','110'],
  C:['011','100','100','100','011'], D:['110','101','101','101','110'],
  E:['111','100','110','100','111'], F:['111','100','110','100','100'],
  G:['011','100','101','101','011'], H:['101','101','111','101','101'],
  I:['111','010','010','010','111'], J:['001','001','001','101','010'],
  K:['101','101','110','101','101'], L:['100','100','100','100','111'],
  M:['101','111','111','101','101'], N:['101','111','111','111','101'],
  O:['010','101','101','101','010'], P:['110','101','110','100','100'],
  Q:['010','101','101','111','011'], R:['110','101','110','101','101'],
  S:['011','100','010','001','110'], T:['111','010','010','010','010'],
  U:['101','101','101','101','111'], V:['101','101','101','101','010'],
  W:['101','101','111','111','101'], X:['101','101','010','101','101'],
  Y:['101','101','010','010','010'], Z:['111','001','010','100','111'],
  '.':['000','000','000','000','010'], ' ':['000','000','000','000','000'],
};
function drawPixelText(g, text, center, y) {
  const q = 3, start = snap(center - (text.length * 4 - 1) * q / 2);
  g.fillStyle = '#29201d';
  for (let i = 0; i < text.length; i++) {
    const glyph = GLYPHS[text[i]] || GLYPHS[' '];
    for (let row = 0; row < 5; row++) for (let col = 0; col < 3; col++) {
      if (glyph[row][col] === '1') g.fillRect(start + (i * 4 + col) * q, y + row * q, q, q);
    }
  }
}

export class Audience {
  constructor(width, ground, seed = seedNow()) {
    this.width = width; this.ground = ground; this.state = (seed >>> 0) || 1;
    this.time = 0; this.cheerLeft = 0; this.cheerCount = 0;
    this.people = []; this.signs = [];
    const count = Math.max(24, Math.ceil(width / 28));
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < count; i++) {
        const step = width / count;
        this.people.push({
          id: `${row}:${i}`, row, x: (i + .36 + row * .45) * step + this.range(-3, 3),
          headY: ground - 116 + row * 13 - this.range(0, 7),
          phase: this.range(0, TAU), rate: this.range(1.05, 1.75),
          shade: row === 0 ? ['#140e13', '#1b1116', '#160e12'][i % 3] : ['#0d090c', '#150d11', '#1a1014'][i % 3],
          highlight: row === 0 ? '#2a1b20' : '#201419',
          cheerful: this.random() < .42,
          walkLeft: 0, walkDir: 0, walkSpeed: 0, walkPhase: this.range(0, TAU),
        });
      }
    }
    this.signTimer = this.range(1.5, 5.5);
    this.walkTimer = this.range(2.5, 6);
  }
  random() {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state / 4294967296;
  }
  range(a, b) { return a + this.random() * (b - a); }
  resize(width, ground) {
    const ratio = width / (this.width || width), dy = ground - this.ground;
    for (const p of this.people) { p.x *= ratio; p.headY += dy; }
    this.width = width; this.ground = ground;
  }
  cheer() {
    this.cheerLeft = 2.6; this.cheerCount++;
  }
  startWalker() {
    const occupied = new Set(this.signs.flatMap(s => s.people));
    const options = this.people.filter(p => p.row === 1 && !p.walkLeft && !occupied.has(p));
    if (!options.length) return false;
    const p = options[Math.floor(this.random() * options.length)];
    p.walkDir = p.x < 40 ? 1 : p.x > this.width - 40 ? -1 : (this.random() < .5 ? -1 : 1);
    p.walkSpeed = this.range(8, 16); p.walkLeft = this.range(1.8, 3.8);
    return true;
  }
  createSign(fighters) {
    const contestants = fighters.filter(f => f && f.hp > 0 && POSTER_LABELS[f.skin]);
    const front = this.people.filter(p => p.row === 1);
    if (!contestants.length || front.length < 5 || this.signs.length >= (this.width > 1100 ? 3 : 2)) return false;
    for (let attempt = 0; attempt < 12; attempt++) {
      const n = 3 + Math.floor(this.random() * 3);
      const first = Math.floor(this.random() * (front.length - n + 1));
      const people = front.slice(first, first + n);
      if (people.some(p => p.walkLeft > 0 || this.signs.some(s => s.people.includes(p)))) continue;
      const left = people[0].x - 16, right = people[people.length - 1].x + 16;
      if (left < 5 || right > this.width - 5 || this.signs.some(s => {
        const a = s.people[0].x - 24, b = s.people[s.people.length - 1].x + 24;
        return left < b && right > a;
      })) continue;
      const fighter = contestants[Math.floor(this.random() * contestants.length)];
      const names = POSTER_LABELS[fighter.skin], label = names[Math.floor(this.random() * names.length)];
      this.signs.push({ people, fighterId: fighter.id, skin: fighter.skin, label,
        age: 0, duration: this.range(8, 15), phase: this.range(0, TAU) });
      return true;
    }
    return false;
  }
  update(dt, fighters) {
    this.time += dt; this.cheerLeft = Math.max(0, this.cheerLeft - dt);
    this.walkTimer -= dt; this.signTimer -= dt;
    for (const p of this.people) if (p.walkLeft > 0) {
      p.walkLeft = Math.max(0, p.walkLeft - dt);
      p.x = clamp(p.x + p.walkDir * p.walkSpeed * dt, 12, this.width - 12);
      p.walkPhase += dt * 8;
    }
    if (this.walkTimer <= 0) {
      this.walkTimer = this.range(3.5, 8);
      if (this.people.filter(p => p.walkLeft > 0).length < 2 && this.random() < .72) this.startWalker();
    }
    for (const s of this.signs) {
      s.age += dt;
      // A sign may continue to support a fallen fighter while their body is on
      // the map, but cannot advertise a fighter removed from the roster.
      if (!fighters.some(f => f.id === s.fighterId)) s.age = Math.max(s.age, s.duration - .6);
    }
    this.signs = this.signs.filter(s => s.age < s.duration);
    if (this.signTimer <= 0) {
      this.signTimer = this.range(5.5, 10);
      if (this.random() < .74) this.createSign(fighters);
    }
  }
  signPose(s) {
    const progress = Math.min(1, s.age / .8, (s.duration - s.age) / .8);
    const lift = clamp(progress, 0, 1);
    const left = s.people[0].x, right = s.people[s.people.length - 1].x;
    const width = Math.max(96, right - left + 30), cx = (left + right) / 2;
    const top = Math.min(...s.people.map(p => p.headY)) - 48 + (1 - lift) * 34;
    const cheer = this.cheerLeft > 0 ? Math.min(1, this.cheerLeft * 2) : 0;
    return { x: cx + Math.sin(this.time * 16 + s.phase) * 1.5 * cheer,
      y: top + Math.sin(this.time * 12 + s.phase) * 1.1 * cheer,
      width, height: 27, lift, angle: Math.sin(this.time * 15 + s.phase) * .016 * cheer };
  }
  draw(g) {
    const poses = new Map(this.signs.map(s => [s, this.signPose(s)]));
    for (const p of this.people) {
      const moving = p.walkLeft > 0;
      const cheer = this.cheerLeft > 0 && p.cheerful ? Math.min(1, this.cheerLeft * 2) : 0;
      const breath = Math.sin(this.time * p.rate + p.phase) * 1.5;
      const bob = moving ? Math.abs(Math.sin(p.walkPhase)) * 2 : 0;
      const joy = cheer * Math.abs(Math.sin(this.time * 7 + p.phase)) * 3;
      const x = snap(p.x), y = snap(p.headY + breath - bob - joy);
      g.fillStyle = p.shade;
      g.fillRect(x - 6, y, 12, 15); g.fillRect(x - 3, y - 3, 6, 3);
      g.fillRect(x - 12, y + 12, 24, 27); g.fillRect(x - 15, y + 21, 30, 24);
      g.fillRect(x - 18, y + 42, 36, 12);
      g.fillStyle = p.highlight; g.fillRect(x - 6, y + 3, 3, 6); g.fillRect(x - 9, y + 18, 3, 12);
      if (moving) {
        const swing = Math.sin(p.walkPhase) * 5;
        g.fillStyle = p.shade; g.fillRect(snap(x - 18 + swing), y + 24, 6, 18);
        g.fillRect(snap(x + 12 - swing), y + 24, 6, 18);
      }
      if (cheer) {
        g.fillStyle = p.shade;
        const wave = snap(Math.sin(this.time * 9 + p.phase) * 3);
        g.fillRect(x - 18, y + 6 + wave, 6, 24); g.fillRect(x + 12, y + 3 - wave, 6, 27);
      }
    }
    // Several neighboring spectators hold each broad sign overhead.
    for (const s of this.signs) {
      const pose = poses.get(s); if (pose.lift <= .05) continue;
      for (const p of s.people) {
        const x = snap(p.x), shoulder = snap(p.headY + 18), top = snap(pose.y + pose.height - 3);
        g.fillStyle = p.shade; g.fillRect(x - 9, top, 6, Math.max(3, shoulder - top));
        g.fillRect(x + 3, top, 6, Math.max(3, shoulder - top));
      }
      g.save(); g.translate(snap(pose.x), snap(pose.y)); g.rotate(pose.angle);
      const w = snap(pose.width), left = -w / 2;
      g.fillStyle = '#3b302d'; g.fillRect(left - 3, -3, w + 6, 33);
      // Pale cardboard, naturally muted in the dim stands rather than glowing.
      g.fillStyle = '#938878'; g.fillRect(left, 0, w, 27);
      g.fillStyle = '#a99d89'; g.fillRect(left + 3, 3, w - 6, 3);
      g.fillStyle = '#786d60'; g.fillRect(left + 3, 24, w - 6, 3);
      drawPixelText(g, s.label, 0, 6);
      g.restore();
    }
  }
}
