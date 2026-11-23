// Дым, кровь, искры, ударные волны и декали на полу.
import { TAU, clamp, rnd } from './utils.js';

function makeSprite(rgb) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, `rgba(${rgb},.9)`);
  g.addColorStop(0.5, `rgba(${rgb},.45)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return c;
}

const SPR = [
  makeSprite('205,195,178'),
  makeSprite('150,150,158'),
  makeSprite('70,66,74'),
];

export class FX {
  constructor() {
    this.sm = [];
    this.bl = [];
    this.sp = [];
    this.fl = [];
    this.rg = [];
    this.decal = null;
    this.floorY = 468;
  }

  smoke(x, y, vx, vy, r, gr, life, a, spr) {
    if (this.sm.length > 200) this.sm.shift();
    this.sm.push({ x, y, vx, vy, r, gr, life, max: life, a, spr: spr || 0 });
  }

  landing(x, y, p) {
    p = p || 1;
    for (let i = 0; i < 9 * p; i++) {
      this.smoke(
        x + rnd(-16, 16), y - 2,
        (i % 2 ? 1 : -1) * rnd(40, 190) * p, -rnd(4, 26),
        rnd(7, 14), rnd(18, 38), rnd(0.5, 0.95), 0.55,
      );
    }
    this.rg.push({ x, y, r: 6, life: 0.35, max: 0.35, w: 90 * p });
  }

  step(x, y, dir) {
    for (let i = 0; i < 2; i++) {
      this.smoke(x, y - 1, -dir * rnd(10, 50), -rnd(4, 16), rnd(3.5, 6), rnd(12, 20), rnd(0.3, 0.5), 0.4);
    }
  }

  dash(x, y, dir) {
    this.smoke(x - dir * rnd(0, 16), y - 3, -dir * rnd(60, 190), -rnd(2, 20), rnd(6, 11), rnd(20, 34), rnd(0.35, 0.6), 0.5);
  }

  puff(x, y, n, s) {
    for (let i = 0; i < n; i++) {
      this.smoke(x + rnd(-6, 6), y + rnd(-6, 6), rnd(-40, 40), -rnd(10, 40), rnd(3, 6) * (s || 1), rnd(10, 20), rnd(0.4, 0.7), 0.45);
    }
  }

  blood(x, y, dir, n, pw) {
    for (let i = 0; i < n; i++) {
      const mist = Math.random() < 0.4;
      this.bl.push({
        x, y,
        vx: dir * rnd(60, 440) * (0.4 + pw) + rnd(-90, 90),
        vy: -rnd(20, 340),
        r: mist ? rnd(0.6, 1.2) : rnd(1.3, 3),
        fy: this.floorY + rnd(-8, 28),
        life: 2,
      });
    }
  }

  drip(x, y) {
    this.bl.push({
      x, y, vx: rnd(-12, 12), vy: rnd(0, 30),
      r: rnd(1.2, 2), fy: this.floorY + rnd(-4, 26), life: 2,
    });
  }

  teeth(x, y, dir) {
    for (let i = 0; i < 2; i++) {
      this.bl.push({
        x, y, vx: dir * rnd(100, 300), vy: -rnd(150, 350),
        r: 1.6, fy: this.floorY + rnd(0, 20), life: 2, tooth: true,
      });
    }
  }

  spark(x, y, n, col) {
    for (let i = 0; i < n; i++) {
      const a = rnd(TAU);
      const s = rnd(80, 380);
      this.sp.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: rnd(0.15, 0.35), col: col || '255,210,90',
      });
    }
  }

  impact(x, y, dir, pw) {
    this.fl.push({ x, y, life: 0.16, max: 0.16, r: 24 + pw * 30 });
    this.spark(x, y, (6 + pw * 8) | 0);
  }

  stamp(x, y, r) {
    const d = this.decal;
    if (!d) return;
    d.fillStyle = 'rgba(105,6,10,.55)';
    d.beginPath();
    d.ellipse(x, y, r * 1.8 + 1, r * 0.7 + 0.5, 0, 0, TAU);
    d.fill();
    if (r > 1.8) {
      d.fillStyle = 'rgba(70,0,4,.35)';
      d.beginPath();
      d.ellipse(x + r, y, r * 2.6, r * 0.5, 0, 0, TAU);
      d.fill();
    }
  }

  pool(x, y, r) {
    const d = this.decal;
    if (!d) return;
    d.fillStyle = 'rgba(100,5,8,.3)';
    d.beginPath();
    d.ellipse(x + rnd(-4, 4), y, r * 1.7, r * 0.55, 0, 0, TAU);
    d.fill();
  }

  crack(x, y, dir) {
    const d = this.decal;
    if (!d) return;
    d.strokeStyle = 'rgba(0,0,0,.65)';
    d.lineWidth = 1.3;
    for (let k = 0; k < 4; k++) {
      let cx = x;
      let cy = y;
      d.beginPath();
      d.moveTo(cx, cy);
      for (let i = 0; i < 7; i++) {
        cx += dir * (k < 2 ? 1 : -1) * rnd(8, 18);
        cy += rnd(-4, 4);
        d.lineTo(cx, cy);
      }
      d.stroke();
    }
  }

  update(dt) {
    for (const s of this.sm) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 0.96;
      s.vy *= 0.96;
      s.r += s.gr * dt;
      s.life -= dt;
    }
    this.sm = this.sm.filter((s) => s.life > 0);
    for (const b of this.bl) {
      b.vy += 1600 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.y >= b.fy) {
        if (!b.tooth) this.stamp(b.x, b.fy, b.r);
        b.dead = true;
      }
    }
    this.bl = this.bl.filter((b) => !b.dead && b.life > 0);
    for (const s of this.sp) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 500 * dt;
      s.life -= dt;
    }
    this.sp = this.sp.filter((s) => s.life > 0);
    for (const f of this.fl) f.life -= dt;
    this.fl = this.fl.filter((f) => f.life > 0);
    for (const r of this.rg) {
      r.life -= dt;
      r.r += (r.w * dt) / r.max;
    }
    this.rg = this.rg.filter((r) => r.life > 0);
  }

  draw(ctx) {
    for (const s of this.sm) {
      ctx.globalAlpha = Math.min(1, (s.life / s.max) * 1.6) * s.a;
      ctx.drawImage(SPR[s.spr], s.x - s.r, s.y - s.r, s.r * 2, s.r * 2);
    }
    ctx.globalAlpha = 1;
    for (const r of this.rg) {
      ctx.strokeStyle = `rgba(220,205,185,${(r.life / r.max) * 0.5})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, r.r, r.r * 0.16, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.lineCap = 'round';
    for (const b of this.bl) {
      ctx.strokeStyle = b.tooth ? '#f1ece0' : 'rgba(140,10,14,.95)';
      ctx.lineWidth = b.r * 1.6;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * 0.018, b.y - b.vy * 0.018);
      ctx.stroke();
    }
    for (const f of this.fl) {
      const k = f.life / f.max;
      const r = f.r * (1.3 - k * 0.5);
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
      g.addColorStop(0, `rgba(255,255,255,${k})`);
      g.addColorStop(0.4, `rgba(255,190,80,${k * 0.7})`);
      g.addColorStop(1, 'rgba(255,100,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(f.x, f.y, r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = `rgba(255,240,200,${k})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = i * 1.047 + f.x;
        ctx.moveTo(f.x + Math.cos(a) * r * 0.3, f.y + Math.sin(a) * r * 0.3);
        ctx.lineTo(f.x + Math.cos(a) * r * 1.1, f.y + Math.sin(a) * r * 1.1);
      }
      ctx.stroke();
    }
    for (const s of this.sp) {
      ctx.strokeStyle = `rgba(${s.col},${clamp(s.life * 5, 0, 1)})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * 0.03, s.y - s.vy * 0.03);
      ctx.stroke();
    }
  }
}
