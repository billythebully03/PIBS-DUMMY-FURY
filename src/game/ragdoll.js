// Рэгдолл при нокауте: интеграция Верле + связи между суставов.
import { clamp, lerp, rnd } from './utils.js';
import {
  TORSO_L, THIGH, SHIN, UA, FA, NECKH, footDirRag,
} from './rig.js';
import { Snd } from './audio.js';

const RK = ['head', 'neck', 'pel', 'eN', 'wN', 'eF', 'wF', 'kN', 'aN', 'kF', 'aF'];
const RAD_R = {
  head: 12, neck: 5, pel: 8, eN: 4, wN: 5, eF: 4, wF: 5,
  kN: 6, aN: 7, kF: 6, aF: 7,
};
const DC = [
  ['head', 'neck', NECKH], ['neck', 'pel', TORSO_L],
  ['eN', 'neck', UA], ['wN', 'eN', FA],
  ['eF', 'neck', UA], ['wF', 'eF', FA],
  ['kN', 'pel', THIGH], ['aN', 'kN', SHIN],
  ['kF', 'pel', THIGH], ['aF', 'kF', SHIN],
];
const DMIN = [
  ['head', 'pel', 58, 76], ['aN', 'pel', 30, 92], ['aF', 'pel', 30, 92],
  ['wN', 'neck', 22, 60], ['wF', 'neck', 22, 60],
  ['kN', 'neck', 40, 200], ['kF', 'neck', 40, 200],
];
const SEGS = [
  ['neck', 'pel', 10], ['pel', 'kN', 8.5], ['pel', 'kF', 8.5],
  ['kN', 'aN', 6], ['kF', 'aF', 6],
  ['neck', 'eN', 5.5], ['neck', 'eF', 5.5],
  ['eN', 'wN', 4.6], ['eF', 'wF', 4.6],
];
const PTS = [
  ['head', 12], ['eN', 4.5], ['wN', 5], ['eF', 4.5], ['wF', 5],
  ['kN', 6], ['aN', 5.5], ['kF', 6], ['aF', 5.5],
];
const NEIGH = {
  head: ['neck'],
  eN: ['neck', 'wN'], wN: ['eN'],
  eF: ['neck', 'wF'], wF: ['eF'],
  kN: ['pel', 'aN'], aN: ['kN'],
  kF: ['pel', 'aF'], aF: ['kF'],
};
const HSTEP = 1 / 120;

export class Ragdoll {
  constructor(R, f) {
    this.f = f;
    this.dir = f.dir;
    this.t = 0;
    this.acc = 0;
    this.settle = 0;
    this.imp = 0;
    this.p = {};
    for (const k of RK) {
      this.p[k] = { x: R[k].x, y: R[k].y, px: R[k].x, py: R[k].y, r: RAD_R[k] };
    }
  }

  launch(vx, vy) {
    const P = this.p;
    const d = this.dir;
    const spin = -d * rnd(2.5, 5) * (vy > 300 ? 1 : 0.5);
    for (const k of RK) {
      const p = P[k];
      const rx = p.x - P.pel.x;
      const ry = p.y - P.pel.y;
      const ax = vx - ry * spin + rnd(-60, 60);
      const ay = -vy + rx * spin + rnd(-60, 60);
      p.px = p.x - ax * HSTEP;
      p.py = p.y - ay * HSTEP;
    }
  }

  update(dt) {
    this.t += dt;
    this.imp -= dt;
    this.acc += dt;
    let n = 0;
    while (this.acc >= HSTEP && n < 6) {
      this.step();
      this.acc -= HSTEP;
      n++;
    }
    if (n >= 6) this.acc = 0;
    let sp = 0;
    for (const k of RK) {
      const p = this.p[k];
      sp += Math.abs(p.x - p.px) + Math.abs(p.y - p.py);
    }
    sp /= RK.length;
    if (sp < 0.28) this.settle += dt;
    else this.settle = 0;
  }

  step() {
    const P = this.p;
    const f = this.f;
    const g = 1900 * HSTEP * HSTEP;
    const gy = f.gy;
    for (const k of RK) {
      const p = P[k];
      const vx = (p.x - p.px) * 0.9985;
      const vy = (p.y - p.py) * 0.9985;
      p.px = p.x;
      p.py = p.y;
      p.x += vx;
      p.y += vy + g;
    }
    for (let it = 0; it < 5; it++) {
      for (const [a, b, l] of DC) {
        const A = P[a];
        const B = P[b];
        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const d = Math.hypot(dx, dy) || 1e-4;
        const df = ((d - l) / d) * 0.5;
        A.x += dx * df;
        A.y += dy * df;
        B.x -= dx * df;
        B.y -= dy * df;
      }
      for (const [a, b, mn, mx] of DMIN) {
        const A = P[a];
        const B = P[b];
        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const d = Math.hypot(dx, dy) || 1e-4;
        let t = 0;
        if (d < mn) t = mn;
        else if (d > mx) t = mx;
        else continue;
        const df = ((d - t) / d) * 0.5;
        A.x += dx * df;
        A.y += dy * df;
        B.x -= dx * df;
        B.y -= dy * df;
      }
      // ограничения суставов
      this.lim(P.pel, P.kN, P.aN, this.dir);
      this.lim(P.pel, P.kF, P.aF, this.dir);
      this.lim(P.neck, P.eN, P.wN, -this.dir);
      this.lim(P.neck, P.eF, P.wF, -this.dir);
      // столкновения точек с сегментами
      for (const [pn, pr] of PTS) {
        const p = P[pn];
        const nb = NEIGH[pn];
        for (const [an, bn, sr] of SEGS) {
          if (pn === an || pn === bn) continue;
          const A = P[an];
          const B = P[bn];
          const sx = B.x - A.x;
          const sy = B.y - A.y;
          const l2 = sx * sx + sy * sy || 1;
          let t = clamp(((p.x - A.x) * sx + (p.y - A.y) * sy) / l2, 0, 1);
          if (nb.includes(an) && t < 0.35) continue;
          if (nb.includes(bn) && t > 0.65) continue;
          const cx = A.x + sx * t;
          const cy = A.y + sy * t;
          const dx = p.x - cx;
          const dy = p.y - cy;
          const d = Math.hypot(dx, dy) || 1e-4;
          const m = pr + sr;
          if (d < m) {
            const push = m - d;
            const nx = dx / d;
            const ny = dy / d;
            p.x += nx * push * 0.6;
            p.y += ny * push * 0.6;
            A.x -= nx * push * 0.2 * (1 - t);
            A.y -= ny * push * 0.2 * (1 - t);
            B.x -= nx * push * 0.2 * t;
            B.y -= ny * push * 0.2 * t;
          }
        }
      }
      // пары точек
      for (const [a, b, m] of [
        ['wN', 'wF', 8], ['kN', 'kF', 10], ['aN', 'aF', 11],
        ['kN', 'aF', 9], ['kF', 'aN', 9],
        ['wN', 'head', 16], ['wF', 'head', 16],
      ]) {
        const A = P[a];
        const B = P[b];
        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const d = Math.hypot(dx, dy) || 1e-4;
        if (d < m) {
          const df = ((d - m) / d) * 0.5;
          A.x += dx * df;
          A.y += dy * df;
          B.x -= dx * df;
          B.y -= dy * df;
        }
      }
      // пол и стены
      for (const k of RK) {
        const p = P[k];
        const lim = gy - p.r;
        if (p.y > lim) {
          const vy = p.y - p.py;
          if (vy > 2.4 && this.imp <= 0) this.impact(p, vy);
          p.y = lim;
          p.py = p.y + vy * 0.22;
          p.px += (p.x - p.px) * 0.22;
        }
        if (p.x < f.minX - 30) {
          p.x = f.minX - 30;
          p.px = p.x;
        }
        if (p.x > f.maxX + 30) {
          p.x = f.maxX + 30;
          p.px = p.x;
        }
      }
    }
  }

  lim(a, b, c, sign) {
    const cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cr * sign < -3) {
      const ux = c.x - a.x;
      const uy = c.y - a.y;
      const L = Math.hypot(ux, uy) || 1;
      const nx = ux / L;
      const ny = uy / L;
      const vx = b.x - a.x;
      const vy = b.y - a.y;
      const pr = vx * nx + vy * ny;
      const rx = a.x + 2 * pr * nx - vx;
      const ry = a.y + 2 * pr * ny - vy;
      const ddx = rx - b.x;
      const ddy = ry - b.y;
      b.x = rx;
      b.y = ry;
      b.px += ddx;
      b.py += ddy;
    }
  }

  impact(p, vy) {
    this.imp = 0.14;
    const f = this.f;
    if (f.fx) f.fx.landing(p.x, f.gy, clamp(vy / 5, 0.5, 1.5));
    Snd.thud();
    if (f.onShake) f.onShake(vy * 1.5);
    f.ragInjury(vy);
  }

  toRig(f) {
    const P = this.p;
    const R = { dir: f.dir };
    for (const k of RK) R[k] = P[k];
    R.sh = {
      x: lerp(P.neck.x, P.pel.x, 0.07),
      y: lerp(P.neck.y, P.pel.y, 0.07),
    };
    R.fdN = footDirRag(P.kN, P.aN, f.dir);
    R.fdF = footDirRag(P.kF, P.aF, f.dir);
    R.cN = 0.35;
    R.cF = 0.35;
    R.mo = 0.5;
    R.ey = f.hp <= 0 ? 1 : 0.75;
    return R;
  }
}
