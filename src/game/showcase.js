// Витрина: боец демонстрирует удары в меню и на экране выбора.
import { TAU, rnd } from './utils.js';
import { FX } from './fx.js';
import { Fighter } from './fighter.js';
import { drawFighter } from './draw.js';
import { COL_BLUE } from './palette.js';

export class Showcase {
  constructor(canvas, opt) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.opt = opt;
    this.fx = new FX();
    this.fx.floorY = 262;
    this.f = new Fighter({
      fx: this.fx,
      gy: 262,
      minX: -9999,
      maxX: 9999,
      spawnY: 340,
      col: COL_BLUE,
      x: 100,
      dir: opt.dir || 1,
    });
    this.f.visible = false;
    this.f.state = 'idle';
    this.f.onShake = (v) => {
      this.shake = Math.max(this.shake || 0, Math.min(8, v));
    };
    this.sh = 0;
    this.tm = 2;
    this.punches = 0;
    this.W = 300;
    this.s = 1;
    this.t = 0;
    this.on = false;
    this.parts = [];
    this.shake = 0;
    this.chain = 0;
    this.cs = 0;
    for (let i = 0; i < 40; i++) {
      this.parts.push({
        x: Math.random(), y: Math.random(),
        v: rnd(0.02, 0.07), r: rnd(0.6, 2), p: rnd(TAU),
      });
    }
  }

  resize() {
    const r = this.c.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.c.width = Math.max(2, Math.round(r.width * dpr));
    this.c.height = Math.max(2, Math.round(r.height * dpr));
    this.s = this.c.height / 300;
    this.W = this.c.width / this.s;
    this.home = this.W * (this.opt.cx || 0.5);
    if (this.f.state === 'idle' && !this.f.visible) this.f.x = this.home;
  }

  spawn(delay) {
    this.fx.sm.length = 0;
    this.f.reset(this.home, this.opt.dir || 1);
    this.f.x = this.home;
    this.f.spawn(delay || 0);
  }

  update(dt) {
    this.t += dt;
    const f = this.f;
    this.shake *= Math.exp(-dt * 8);
    if (f.visible && f.state === 'idle') {
      if (this.punches > 0) {
        f.ctrl.punch = true;
        this.punches--;
      }
      const dx = this.home - f.x;
      f.ctrl.mx = Math.abs(dx) > 4 ? (dx > 0 ? 1 : -1) : 0;
      this.tm -= dt;
      if (this.tm <= 0 && Math.abs(dx) < 6) {
        this.tm = rnd(2.2, 3.4);
        this.punches = 1;
        this.chain = Math.random() < 0.6 ? 4 : 3;
      }
    }
    if (
      f.state === 'attack' &&
      this.chain > 1 &&
      f.ak < 3 &&
      f.st >= f.atk.cancel - 0.03 &&
      this.cs !== f.atkStamp
    ) {
      this.cs = f.atkStamp;
      f.ctrl.punch = true;
      this.chain--;
    }
    if (f.state === 'idle' && this.punches === 0) this.chain = Math.max(this.chain || 0, 0);
    f.update(dt, null);
    this.fx.update(dt);
  }

  render() {
    const ctx = this.ctx;
    const w = this.c.width;
    const h = this.c.height;
    const s = this.s;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    let g = ctx.createRadialGradient(
      w * (this.opt.cx || 0.5), h * 0.45, 10,
      w * (this.opt.cx || 0.5), h * 0.5, h * 1.1,
    );
    g.addColorStop(0, this.opt.glow || '#3b1219');
    g.addColorStop(1, '#07070b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // лучи света
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const cx = w * (this.opt.cx || 0.5);
    const bg = ctx.createLinearGradient(0, 0, 0, h * 0.9);
    bg.addColorStop(0, 'rgba(255,220,160,.22)');
    bg.addColorStop(1, 'rgba(255,220,160,0)');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(cx - h * 0.05, 0);
    ctx.lineTo(cx + h * 0.05, 0);
    ctx.lineTo(cx + h * 0.5, h * 0.88);
    ctx.lineTo(cx - h * 0.5, h * 0.88);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // пол
    const fy = 262 * s;
    g = ctx.createLinearGradient(0, fy - 10, 0, h);
    g.addColorStop(0, '#26242b');
    g.addColorStop(1, '#0c0b0f');
    ctx.fillStyle = g;
    ctx.fillRect(0, fy - 4, w, h - fy + 4);
    ctx.strokeStyle = 'rgba(255,200,60,.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, fy + 14 * s, h * 0.55, 16 * s, 0, 0, TAU);
    ctx.stroke();
    // искры
    for (const p of this.parts) {
      p.y -= p.v * 0.016;
      p.x += Math.sin(this.t + p.p) * 0.0004;
      if (p.y < 0) {
        p.y = 1;
        p.x = Math.random();
      }
      ctx.fillStyle = `rgba(255,${120 + Math.sin(this.t * 3 + p.p) * 60 | 0},40,${0.5 + Math.sin(this.t * 4 + p.p) * 0.3})`;
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, p.r * s * 0.6, 0, TAU);
      ctx.fill();
    }
    ctx.setTransform(s, 0, 0, s, (Math.random() - 0.5) * this.shake * s, (Math.random() - 0.5) * this.shake * s);
    drawFighter(ctx, this.f);
    this.fx.draw(ctx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.4, w / 2, h / 2, w * 0.7);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,.6)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }
}
