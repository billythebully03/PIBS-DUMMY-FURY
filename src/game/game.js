// Ядро боя: раунды, фазы, снаряды, тряска, HUD и отрисовка сцены.
import { clamp, rnd, TAU } from './utils.js';
import { A2H } from './animations.js';
import { FX } from './fx.js';
import { Fighter } from './fighter.js';
import { AI } from './ai.js';
import { Input } from './input.js';
import { Snd } from './audio.js';
import { makeBG, makeVignette } from './background.js';
import { drawFighter } from './draw.js';
import { COL_BLUE, COL_RED } from './palette.js';

export class Game {
  constructor(canvas, root) {
    this.cv = canvas;
    this.root = root;
    this.ctx = canvas.getContext('2d');
    this.dc = document.createElement('canvas');
    this.dctx = this.dc.getContext('2d');
    this.$ = (s) => this.root.querySelector(s);
    this.active = false;
    this.paused = false;
    this.phase = 'none';
    this.W = 960;
    this.H = 540;
    this.gy = 468;
    this.S = 1;
    this.shake = 0;
    this.hs = 0;
    this.ts = 1;
    this.tsT = 0;
    this.proj = [];
    this.round = 1;
    this.score = [0, 0];
    this.phT = 0;
    this.lagL = 100;
    this.lagR = 100;
    this.comboN = 0;
    this.comboT = 0;
    this.fx = new FX();
  }

  resize() {
    const iw = window.innerWidth;
    const ih = window.innerHeight;
    if (!iw || !ih) return;
    const asp = iw / ih;
    this.W = clamp(asp * 540, 800, 1300);
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5, 810 / ih);
    this.S = (ratio * ih) / 540;
    this.cv.width = Math.round(this.W * this.S);
    this.cv.height = Math.round(540 * this.S);
    this.cv.style.height = ih + 'px';
    this.cv.style.width = (this.W * ih) / 540 + 'px';
    this.buildBG();
    if (this.P) {
      this.P.minX = this.E.minX = 70;
      this.P.maxX = this.E.maxX = this.W - 70;
    }
  }

  buildBG() {
    this.bg = makeBG(this.W, 540, this.gy, this.S);
    this.vig = makeVignette(this.W, 540, this.S);
    const keep = this.dc.width > 0 ? this.dc : null;
    const old = document.createElement('canvas');
    if (keep) {
      old.width = this.dc.width;
      old.height = this.dc.height;
      old.getContext('2d').drawImage(this.dc, 0, 0);
    }
    this.dc.width = Math.round(this.W);
    this.dc.height = 540;
    if (keep) this.dctx.drawImage(old, 0, 0, this.dc.width, this.dc.height);
  }

  start() {
    this.active = true;
    this.paused = false;
    this.score = [0, 0];
    this.round = 1;
    this.proj = [];
    this.dc.width = Math.round(this.W);
    this.dc.height = 540;
    this.fx = new FX();
    this.fx.decal = this.dctx;
    this.fx.floorY = this.gy;

    const hooks = {
      hitFX: (...a) => this.hitFX(...a),
      ko: (...a) => this.ko(...a),
      wave: (f) => this.wave(f),
    };
    const mk = (o) =>
      new Fighter(
        Object.assign(
          { fx: this.fx, gy: this.gy, minX: 70, maxX: this.W - 70, spawnY: 620, hooks },
          o,
        ),
      );

    this.P = mk({ marker: true, col: COL_BLUE, x: this.W * 0.33, dir: 1 });
    this.E = mk({ isAI: true, col: COL_RED, x: this.W * 0.67, dir: -1 });
    this.E.brain = new AI(this.E);
    for (const f of [this.P, this.E]) {
      f.onShake = (v) => {
        this.shake = Math.max(this.shake, Math.min(14, v));
      };
    }
    const ov = this.$('#resultOv');
    const pv = this.$('#pauseOv');
    if (ov) ov.classList.remove('show');
    if (pv) pv.classList.remove('show');
    this.newRound();
  }

  newRound() {
    this.phase = 'intro';
    this.phT = 0;
    this.proj = [];
    this.ts = 1;
    this.tsT = 0;
    this.comboN = 0;
    this.P.reset(this.W * 0.33, 1);
    this.E.reset(this.W * 0.67, -1);
    this.E.brain.reset();
    this.P.spawn(0.1);
    this.E.spawn(0.5);
    this.lagL = this.lagR = 100;
    this.banner('РАУНД ' + this.round);
    this.updPips();
  }

  updPips() {
    const L = this.$('#pipL');
    const R = this.$('#pipR');
    if (!L || !R) return;
    [...L.children].forEach((e, i) => e.classList.toggle('on', i < this.score[0]));
    [...R.children].forEach((e, i) => e.classList.toggle('on', i < this.score[1]));
  }

  banner(t) {
    const b = this.$('#banner');
    if (!b) return;
    b.textContent = t;
    b.classList.remove('pop');
    void b.offsetWidth;
    b.classList.add('pop');
  }

  pause(on) {
    if (this.phase === 'over') return;
    this.paused = on;
    const ov = this.$('#pauseOv');
    if (ov) ov.classList.toggle('show', on);
  }

  hitFX(att, vic, a, x, y) {
    this.fx.impact(x, y, att.dir, a.pw);
    this.fx.blood(x, y, att.dir, Math.floor(6 + a.pw * 16), a.pw);
    if (a.launch && a.zone === 'head') this.fx.teeth(x, y, att.dir);
    this.shake = Math.max(this.shake, 3 + a.pw * 7);
    this.hs = 0.04 + a.pw * 0.05;
    Snd.hit(0.6 + a.pw * 0.6);
    if (att === this.P) {
      this.comboN = this.comboT > 0 ? this.comboN + 1 : 1;
      this.comboT = 1.1;
      const el = this.$('#combo');
      if (this.comboN > 1 && el) {
        el.textContent = '×' + this.comboN + ' КОМБО';
        el.style.opacity = 1;
      }
    }
  }

  wave(f) {
    this.fx.landing(f.x + f.dir * 50, this.gy, 1.5);
    this.fx.crack(f.x + f.dir * 50, this.gy + 8, f.dir);
    this.fx.spark(f.x + f.dir * 50, this.gy - 6, 12, '255,160,40');
    this.shake = Math.max(this.shake, 12);
    Snd.stomp();
    this.proj.push({ x: f.x + f.dir * 60, dir: f.dir, owner: f, dist: 0, t: 0 });
  }

  ko(v, att, a) {
    if (this.phase === 'ko' || this.phase === 'over') return;
    v.hp = 0;
    this.phase = 'ko';
    this.phT = 0;
    this.winner = att;
    this.loser = v;
    this.score[att === this.P ? 0 : 1]++;
    v.toRagdoll(att.dir * (a.lvx || 320) * 1.1, (a.lvy || 520) + 140);
    this.fx.blood(v.x, v.gy - v.y - 120, att.dir, 34, 1.2);
    this.ts = 0.28;
    this.tsT = 1.2;
    this.banner('K.O.');
    Snd.ko();
    this.shake = 16;
    this.updPips();
  }

  update(dt) {
    if (!this.active || this.paused || !this.P) return;
    const rdt = dt;
    if (this.hs > 0) {
      this.hs -= rdt;
      dt *= 0.05;
    }
    if (this.tsT > 0) {
      this.tsT -= rdt;
      dt *= this.ts;
      if (this.tsT <= 0) this.ts = 1;
    }
    this.shake *= Math.exp(-rdt * 9);
    if (this.comboT > 0) {
      this.comboT -= rdt;
      if (this.comboT <= 0) {
        this.comboN = 0;
        const el = this.$('#combo');
        if (el) el.style.opacity = 0;
      }
    }
    const P = this.P;
    const E = this.E;
    this.phT += dt;
    if (this.phase === 'fight') {
      const c = P.ctrl;
      c.mx = Input.mx();
      if (Input.jump) c.jump = true;
      if (Input.punch) c.punch = true;
      if (Input.a1) c.a1 = true;
      if (Input.a2) c.a2 = true;
      E.brain.update(dt, P, this);
    } else {
      P.ctrl.mx = 0;
      E.ctrl.mx = 0;
    }
    Input.jump = Input.punch = Input.a1 = Input.a2 = false;
    P.update(dt, E);
    E.update(dt, P);

    // расталкивание
    if (
      P.y < 60 &&
      E.y < 60 &&
      P.state !== 'ragdoll' &&
      E.state !== 'ragdoll' &&
      P.state !== 'spawn' &&
      E.state !== 'spawn'
    ) {
      const dx = E.x - P.x;
      const m = 54;
      if (Math.abs(dx) < m) {
        const s = dx >= 0 ? 1 : -1;
        const push = (m - Math.abs(dx)) / 2;
        const ok1 = P.x - s * push >= P.minX && P.x - s * push <= P.maxX;
        const ok2 = E.x + s * push >= E.minX && E.x + s * push <= E.maxX;
        if (ok1 && ok2) {
          P.x -= s * push;
          E.x += s * push;
        } else if (ok1) {
          P.x -= s * push * 2;
        } else if (ok2) {
          E.x += s * push * 2;
        }
      }
    }

    // снаряды (ударная волна)
    for (const p of this.proj) {
      p.x += p.dir * 560 * dt;
      p.dist += 560 * dt;
      p.t += dt;
      if (Math.random() < 0.6) {
        this.fx.smoke(p.x, this.gy - 4, rnd(-30, 30), -rnd(5, 40), rnd(6, 11), rnd(16, 28), rnd(0.3, 0.5), 0.5);
      }
      const o = p.owner === P ? E : P;
      if (o.canBeHit() && o.y < 45 && Math.abs(o.x - p.x) < 34) {
        p.dead = true;
        o.takeHit(p.owner, A2H);
      }
      if (p.dist > 560 || p.x < 20 || p.x > this.W - 20) p.dead = true;
    }
    this.proj = this.proj.filter((p) => !p.dead);
    this.fx.update(dt);

    if (this.phase === 'intro') {
      if (this.phT > 1.3 && P.state === 'idle' && E.state === 'idle') {
        this.phase = 'fight';
        this.banner('БОЙ!');
        Snd.fight();
      }
    } else if (this.phase === 'ko') {
      const w = this.winner;
      if (this.phT > 1.4 && w.state === 'idle') {
        w.state = 'win';
        w.st = 0;
      }
      if (this.phT > 3.4) {
        if (this.score[0] >= 2 || this.score[1] >= 2) this.matchEnd();
        else {
          this.round++;
          this.newRound();
        }
      }
    }
    this.hud(rdt);
  }

  matchEnd() {
    this.phase = 'over';
    const win = this.score[0] >= 2;
    const t = this.$('#resTitle');
    const sub = this.$('#resSub');
    if (t) t.textContent = win ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ';
    if (sub) sub.textContent = 'Счёт ' + this.score[0] + ' : ' + this.score[1];
    const ov = this.$('#resultOv');
    if (ov) ov.classList.add('show');
  }

  hud(dt) {
    const P = this.P;
    const E = this.E;
    this.lagL = Math.max(P.hp, this.lagL - dt * 28);
    this.lagR = Math.max(E.hp, this.lagR - dt * 28);
    const set = (id, v) => {
      const el = this.$(id);
      if (el) el.style.width = v + '%';
    };
    set('#hpL', P.hp);
    set('#hpR', E.hp);
    set('#lagL', this.lagL);
    set('#lagR', this.lagR);
    const b1 = this.$('#bA1');
    const b2 = this.$('#bA2');
    if (b1) {
      b1.style.setProperty('--p', P.cd1 / 7);
      b1.classList.toggle('ready', P.cd1 <= 0);
    }
    if (b2) {
      b2.style.setProperty('--p', P.cd2 / 9);
      b2.classList.toggle('ready', P.cd2 <= 0);
    }
  }

  render() {
    const ctx = this.ctx;
    const S = this.S;
    const W = this.W;
    const H = 540;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.cv.width, this.cv.height);
    ctx.setTransform(S, 0, 0, S, 0, 0);
    if (this.shake > 0.3) {
      ctx.translate(rnd(-1, 1) * this.shake, rnd(-1, 1) * this.shake);
    }
    ctx.drawImage(this.bg, 0, 0, W, H);
    ctx.drawImage(this.dc, 0, 0, W, H);
    const P = this.P;
    const E = this.E;
    drawFighter(ctx, E);
    drawFighter(ctx, P);
    // ударные волны
    for (const p of this.proj) {
      const g = ctx.createRadialGradient(p.x, this.gy, 0, p.x, this.gy, 60);
      g.addColorStop(0, 'rgba(255,230,140,.9)');
      g.addColorStop(0.5, 'rgba(255,140,30,.5)');
      g.addColorStop(1, 'rgba(255,80,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(p.x, this.gy - 6, 50, 34, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,230,160,.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(p.x, this.gy - 6, 24, 32, 0, -1.2 * p.dir - 1.57, 1.2 * p.dir - 1.57);
      ctx.stroke();
    }
    this.fx.draw(ctx);
    // свет ламп
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const lx of [W * 0.2, W * 0.5, W * 0.8]) {
      const fl =
        0.85 + Math.sin(performance.now() / 90 + lx) * 0.05 + Math.random() * 0.04;
      const g = ctx.createRadialGradient(lx, 54, 4, lx, 54, 380);
      g.addColorStop(0, `rgba(255,215,150,${0.3 * fl})`);
      g.addColorStop(1, 'rgba(255,215,150,0)');
      ctx.fillStyle = g;
      ctx.fillRect(lx - 380, 0, 760, H);
    }
    ctx.restore();
    ctx.drawImage(this.vig, 0, 0, W, H);
  }
}
