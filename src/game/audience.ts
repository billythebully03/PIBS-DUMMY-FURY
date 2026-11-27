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

export class Audience {
  constructor(width, ground, seed = seedNow()) {
    this.width = width; this.ground = ground; this.state = (seed >>> 0) || 1;
    this.time = 0; this.cheerLeft = 0; this.cheerCount = 0;
    this.people = [];
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
  cheer() { this.cheerLeft = 2.6; this.cheerCount++; }
  startWalker() {
    const options = this.people.filter(p => p.row === 1 && !p.walkLeft);
    if (!options.length) return false;
    const p = options[Math.floor(this.random() * options.length)];
    p.walkDir = p.x < 40 ? 1 : p.x > this.width - 40 ? -1 : (this.random() < .5 ? -1 : 1);
    p.walkSpeed = this.range(8, 16); p.walkLeft = this.range(1.8, 3.8);
    return true;
  }
  update(dt) {
    this.time += dt; this.cheerLeft = Math.max(0, this.cheerLeft - dt);
    this.walkTimer -= dt;
    for (const p of this.people) if (p.walkLeft > 0) {
      p.walkLeft = Math.max(0, p.walkLeft - dt);
      p.x = clamp(p.x + p.walkDir * p.walkSpeed * dt, 12, this.width - 12);
      p.walkPhase += dt * 8;
    }
    if (this.walkTimer <= 0) {
      this.walkTimer = this.range(3.5, 8);
      if (this.people.filter(p => p.walkLeft > 0).length < 2 && this.random() < .72) this.startWalker();
    }
  }
  draw(g) {
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
  }
}
