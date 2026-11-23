// Расчёт «рельефа» тела: таз → шея → голова, руки по FK, ноги по IK.
import { clamp, lerp, rad } from './utils.js';

export const TORSO_L = 54;
export const THIGH = 46;
export const SHIN = 44;
export const UA = 31;
export const FA = 27;
export const NECKH = 21;
export const ANK = 7;

export const JN = [
  'pel', 'neck', 'sh', 'head', 'eN', 'wN', 'eF', 'wF',
  'kN', 'aN', 'kF', 'aF',
];

export const JR = {
  head: 13, pel: 8, wN: 6, wF: 6, kN: 6, kF: 6, aN: 7, aF: 7,
  eN: 4, eF: 4, neck: 3,
};

function legIK(J, s, fx, fh) {
  let dx = fx - J.pel.x;
  let dy = -(ANK + fh) - J.pel.y;
  let L = Math.hypot(dx, dy);
  const maxL = (THIGH + SHIN) * 0.998;
  const minL = Math.abs(THIGH - SHIN) + 3;
  if (L > maxL) {
    dx *= maxL / L;
    dy *= maxL / L;
    L = maxL;
  }
  if (L < minL) {
    if (L < 0.001) {
      dx = 1;
      dy = 0;
      L = 1;
    }
    dx *= minL / L;
    dy *= minL / L;
    L = minL;
  }
  const cosA = (THIGH * THIGH + L * L - SHIN * SHIN) / (2 * THIGH * L);
  const A = Math.acos(clamp(cosA, -1, 1));
  const base = Math.atan2(dy, dx);
  let best = null;
  let bs = -1e9;
  for (const sg of [1, -1]) {
    const ang = base + sg * A;
    const kx = J.pel.x + Math.cos(ang) * THIGH;
    const ky = J.pel.y + Math.sin(ang) * THIGH;
    const sc = kx - ky * 0.5;
    if (sc > bs) {
      bs = sc;
      best = { x: kx, y: ky };
    }
  }
  J['k' + s] = best;
  J['a' + s] = { x: J.pel.x + dx, y: J.pel.y + dy };
}

function armFK(J, s, a, e) {
  a = rad(a);
  const b = a + rad(e);
  const el = {
    x: J.sh.x + Math.sin(a) * UA,
    y: J.sh.y + Math.cos(a) * UA,
  };
  J['e' + s] = el;
  J['w' + s] = { x: el.x + Math.sin(b) * FA, y: el.y + Math.cos(b) * FA };
}

export function computeRig(p, x, gy, y, dir) {
  const J = {};
  J.pel = { x: p.px, y: -p.H };
  const tl = rad(p.tl);
  J.neck = {
    x: J.pel.x + Math.sin(tl) * TORSO_L,
    y: J.pel.y - Math.cos(tl) * TORSO_L,
  };
  J.sh = {
    x: lerp(J.pel.x, J.neck.x, 0.93),
    y: lerp(J.pel.y, J.neck.y, 0.93),
  };
  const hd = rad(p.hd);
  J.head = {
    x: J.neck.x + Math.sin(hd) * NECKH,
    y: J.neck.y - Math.cos(hd) * NECKH,
  };
  armFK(J, 'N', p.a1, p.e1);
  armFK(J, 'F', p.a2, p.e2);
  legIK(J, 'N', p.f1x, p.f1h);
  legIK(J, 'F', p.f2x, p.f2h);
  let low = 0;
  for (const k in JR) {
    const v = J[k].y + JR[k];
    if (v > low) low = v;
  }
  const R = { dir };
  for (const k of JN) R[k] = { x: x + J[k].x * dir, y: gy - y + J[k].y - low };
  R.fdN = { x: Math.cos(rad(p.fa1)) * dir, y: Math.sin(rad(p.fa1)) };
  R.fdF = { x: Math.cos(rad(p.fa2)) * dir, y: Math.sin(rad(p.fa2)) };
  R.cN = p.c1;
  R.cF = p.c2;
  R.mo = p.mo;
  R.ey = p.ey;
  return R;
}

export function blendRig(A, B, t) {
  const R = { dir: B.dir };
  for (const k of JN) R[k] = { x: lerp(A[k].x, B[k].x, t), y: lerp(A[k].y, B[k].y, t) };
  for (const k of ['fdN', 'fdF']) {
    let x = lerp(A[k].x, B[k].x, t);
    let y = lerp(A[k].y, B[k].y, t);
    const l = Math.hypot(x, y) || 1;
    R[k] = { x: x / l, y: y / l };
  }
  R.cN = lerp(A.cN, B.cN, t);
  R.cF = lerp(A.cF, B.cF, t);
  R.mo = lerp(A.mo, B.mo, t);
  R.ey = lerp(A.ey, B.ey, t);
  return R;
}

export function footDirRag(k, a, dir) {
  let sx = a.x - k.x;
  let sy = a.y - k.y;
  const L = Math.hypot(sx, sy) || 1;
  sx /= L;
  sy /= L;
  let fx = -sy;
  let fy = sx;
  if (Math.abs(fx) > 0.3) {
    if (fx * dir < 0) {
      fx = -fx;
      fy = -fy;
    }
  } else if (fy > 0) {
    fx = -fx;
    fy = -fy;
  }
  return { x: fx, y: fy };
}
