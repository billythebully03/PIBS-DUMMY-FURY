// Отрисовка бойца: конечности, торс, голова и раны.
import { TAU, clamp, ease, lerp, rad } from './utils.js';
import { PAL } from './palette.js';
import { drawWound, limbWounds } from './wounds.js';

export function limbPath(a, b, w0, w1, bf, bb, dir) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L;
  const uy = dy / L;
  const nx = dir * uy;
  const ny = -dir * ux;
  const N = 7;
  const p = new Path2D();
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const sb = Math.pow(Math.sin(Math.PI * t), 0.8);
    const w = w0 + (w1 - w0) * t + bf * sb;
    const x = a.x + dx * t + nx * w;
    const y = a.y + dy * t + ny * w;
    if (i) p.lineTo(x, y);
    else p.moveTo(x, y);
  }
  const ang = Math.atan2(ny, nx);
  const cw = nx * uy - ny * ux > 0;
  p.arc(b.x, b.y, w1, ang, ang + (cw ? Math.PI : -Math.PI), !cw);
  for (let i = N; i >= 0; i--) {
    const t = i / N;
    const sb = Math.pow(Math.sin(Math.PI * t), 0.8);
    const w = w0 + (w1 - w0) * t + bb * sb;
    p.lineTo(a.x + dx * t - nx * w, a.y + dy * t - ny * w);
  }
  p.arc(a.x, a.y, w0, ang + Math.PI, ang + Math.PI + (cw ? Math.PI : -Math.PI), !cw);
  p.closePath();
  return p;
}

export function fillLimb(ctx, path, a, b, w, pal, dir) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy) || 1;
  const nx = (dir * dy) / L;
  const ny = (-dir * dx) / L;
  const g = ctx.createLinearGradient(mx + nx * w, my + ny * w, mx - nx * w, my - ny * w);
  g.addColorStop(0, pal.hi);
  g.addColorStop(0.5, pal.mid);
  g.addColorStop(1, pal.lo);
  ctx.fillStyle = g;
  ctx.fill(path);
  ctx.strokeStyle = pal.line;
  ctx.lineWidth = 0.9;
  ctx.stroke(path);
}

/* ---------- Торс и голова: статичные пути ---------- */
const TK = [
  [0, -5, 5], [6, -10, 7.5], [16, -12, 12.5], [28, -11, 10.5],
  [42, -9.5, 8.5], [54, -11, 9.5],
];

function tk(a, i) {
  for (let j = 1; j < TK.length; j++) {
    if (a <= TK[j][0]) {
      const A = TK[j - 1];
      const B = TK[j];
      return lerp(A[i], B[i], ease((a - A[0]) / (B[0] - A[0])));
    }
  }
  return TK[TK.length - 1][i];
}

export const TORSO = new Path2D();
for (let a = 0; a <= 54; a += 3) {
  if (a) TORSO.lineTo(tk(a, 2), a);
  else TORSO.moveTo(tk(a, 2), a);
}
for (let a = 54; a >= 0; a -= 3) TORSO.lineTo(tk(a, 1), a);
TORSO.closePath();

export const HEAD = new Path2D();
HEAD.moveTo(-9.5, -7);
HEAD.bezierCurveTo(-9, -15.5, 3, -16.5, 8.5, -10.5);
HEAD.bezierCurveTo(9.8, -8.5, 10.2, -6.5, 10.4, -4.6);
HEAD.lineTo(10.2, -2.6);
HEAD.quadraticCurveTo(12.5, 0.8, 14.6, 4);
HEAD.quadraticCurveTo(14.9, 5.6, 13, 6);
HEAD.lineTo(11.4, 6.1);
HEAD.lineTo(11, 8.2);
HEAD.quadraticCurveTo(11.9, 9.2, 11, 10.2);
HEAD.lineTo(10.2, 11.5);
HEAD.quadraticCurveTo(10.6, 13.4, 8.8, 14.6);
HEAD.bezierCurveTo(5, 15.8, -2, 14, -6.3, 8.4);
HEAD.bezierCurveTo(-9.6, 4, -11, -1.5, -9.5, -7);
HEAD.closePath();

export const HAIR = new Path2D();
HAIR.moveTo(-10.6, -1.5);
HAIR.bezierCurveTo(-12.5, -12, -3, -19, 5, -17.5);
HAIR.bezierCurveTo(9.5, -16.5, 11.2, -12.5, 10.6, -8.5);
HAIR.bezierCurveTo(9.5, -10.6, 7, -10.2, 5.5, -9.6);
HAIR.bezierCurveTo(3, -9.6, 0, -8, -2, -4.2);
HAIR.lineTo(-4.4, 1.6);
HAIR.lineTo(-6.2, 0.8);
HAIR.bezierCurveTo(-8.2, 3, -10.4, 2, -10.6, -1.5);
HAIR.closePath();

/* ---------- Ладонь и кулак ---------- */
const FING = [
  [5, 3.2, 2.6, 2.5],
  [5.4, 3.5, 2.7, 2.6],
  [5, 3.3, 2.5, 2.4],
  [4, 2.5, 2.2, 2.2],
];

export function drawHand(ctx, el, wr, curl, far, dir, wl) {
  let dx = wr.x - el.x;
  let dy = wr.y - el.y;
  const L = Math.hypot(dx, dy) || 1;
  dx /= L;
  dy /= L;
  let nx = -dy;
  let ny = dx;
  if (-0.6 * dir * nx + 0.8 * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  const pal = far ? PAL.far : PAL.near;
  const c = curl;
  ctx.save();
  ctx.transform(dx, dy, nx, ny, wr.x, wr.y);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const pp = new Path2D();
  pp.moveTo(-1, -3.2);
  pp.lineTo(7.5, -3.4);
  pp.quadraticCurveTo(10, -3, 10, -0.4);
  pp.lineTo(9.6, 2.6);
  pp.quadraticCurveTo(9, 4, 6, 4);
  pp.lineTo(-0.5, 3.4);
  pp.closePath();
  ctx.fillStyle = pal.mid;
  ctx.fill(pp);
  ctx.strokeStyle = pal.line;
  ctx.lineWidth = 0.8;
  ctx.stroke(pp);
  const chain = (bx, by, segs, angs, wid) => {
    let x = bx;
    let y = by;
    let a = 0;
    const pts = [[x, y]];
    for (let i = 0; i < segs.length; i++) {
      a += angs[i];
      x += Math.cos(a) * segs[i];
      y += Math.sin(a) * segs[i];
      pts.push([x, y]);
    }
    ctx.strokeStyle = pal.line;
    ctx.lineWidth = wid + 1;
    ctx.beginPath();
    pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
    ctx.stroke();
    ctx.strokeStyle = pal.mid;
    ctx.lineWidth = wid;
    ctx.stroke();
    ctx.strokeStyle = pal.hi;
    ctx.lineWidth = wid * 0.3;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    pts.forEach((q, i) =>
      i ? ctx.lineTo(q[0], q[1] - wid * 0.2) : ctx.moveTo(q[0], q[1] - wid * 0.2),
    );
    ctx.stroke();
    ctx.globalAlpha = 1;
  };
  for (let i = 3; i >= 0; i--) {
    const f = FING[i];
    const fan = (i - 1.5) * 0.05 * (1 - c);
    chain(
      8.8 - i * 0.1,
      -2.4 + i * 0.55,
      [f[0], f[1], f[2]],
      [rad(85 * c) + fan, rad(95 * c), rad(70 * c)],
      f[3],
    );
  }
  chain(2.5, 2.6, [3.8, 3], [rad(lerp(25, 55, c)), rad(lerp(5, 55, c))], 2.7);
  ctx.fillStyle = pal.hi;
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.arc(9.4, -2, 1.3, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
  if (wl) for (const w of wl) drawWound(ctx, w, w.x, w.y);
  ctx.restore();
}

export function drawFoot(ctx, an, F, dir, pal) {
  const ex = F.x;
  const ey = F.y;
  ctx.save();
  ctx.transform(ex, ey, dir * -ey, dir * ex, an.x, an.y);
  const p = new Path2D();
  p.moveTo(-4.2, -3.6);
  p.bezierCurveTo(-6.6, 0, -6.6, 5, -3, 6.6);
  p.lineTo(11.5, 6.8);
  p.quadraticCurveTo(15.8, 6.6, 15.6, 3.6);
  p.quadraticCurveTo(14, 2.2, 11, 2.6);
  p.quadraticCurveTo(6, -0.5, 4, -3.2);
  p.closePath();
  const g = ctx.createLinearGradient(0, -3, 0, 7);
  g.addColorStop(0, pal.hi);
  g.addColorStop(0.6, pal.mid);
  g.addColorStop(1, pal.lo);
  ctx.fillStyle = g;
  ctx.fill(p);
  ctx.strokeStyle = pal.line;
  ctx.lineWidth = 0.8;
  ctx.stroke(p);
  ctx.strokeStyle = pal.line;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  for (const x of [12.6, 13.9, 15]) {
    ctx.moveTo(x, 4.4);
    ctx.lineTo(x - 0.3, 6.7);
  }
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,235,220,.5)';
  ctx.beginPath();
  ctx.ellipse(14.6, 3.5, 0.9, 0.6, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

export function drawArm(ctx, R, s, f, far) {
  const pal = far ? PAL.far : PAL.near;
  const dir = R.dir;
  const sh = R.sh;
  const el = R['e' + s];
  const wr = R['w' + s];
  const W = f.wounds;
  const p1 = limbPath(sh, el, 5.5, 4.4, 1.4, 1.2, dir);
  fillLimb(ctx, p1, sh, el, 5, pal, dir);
  limbWounds(ctx, W['u' + s], sh, el, 5, dir, p1);
  const p2 = limbPath(el, wr, 4.4, 3.1, 0.8, 1, dir);
  fillLimb(ctx, p2, el, wr, 4, pal, dir);
  limbWounds(ctx, W['f' + s], el, wr, 4, dir, p2);
  const g = ctx.createRadialGradient(sh.x - 1, sh.y - 2, 1, sh.x, sh.y, 7);
  g.addColorStop(0, pal.hi);
  g.addColorStop(1, pal.mid);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(sh.x, sh.y, 5.8, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = pal.line;
  ctx.lineWidth = 0.7;
  ctx.stroke();
  drawHand(ctx, el, wr, R['c' + s], far, dir, W['h' + s]);
}

export function drawLeg(ctx, R, s, f, far) {
  const pal = far ? PAL.far : PAL.near;
  const sc = far ? f.col.far : f.col.near;
  const dir = R.dir;
  const hip = R.pel;
  const kn = R['k' + s];
  const an = R['a' + s];
  const W = f.wounds;
  const tp = limbPath(hip, kn, 9.6, 6.2, 1.8, 1.2, dir);
  fillLimb(ctx, tp, hip, kn, 8, pal, dir);
  limbWounds(ctx, W['t' + s], hip, kn, 8, dir, tp);
  const sp = limbPath(kn, an, 6, 3.6, 0.5, 2.4, dir);
  fillLimb(ctx, sp, kn, an, 5, pal, dir);
  limbWounds(ctx, W['s' + s], kn, an, 5, dir, sp);
  const kg = ctx.createRadialGradient(kn.x, kn.y, 0, kn.x, kn.y, 6);
  kg.addColorStop(0, pal.hi);
  kg.addColorStop(1, pal.mid);
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = kg;
  ctx.beginPath();
  ctx.arc(kn.x + R.dir * 1.2, kn.y, 5, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
  drawFoot(ctx, an, s === 'N' ? R.fdN : R.fdF, dir, pal);
  // шорты
  const mid = { x: lerp(hip.x, kn.x, 0.62), y: lerp(hip.y, kn.y, 0.62) };
  const shp = limbPath(hip, mid, 11, 9.8, 0.6, 0.6, dir);
  fillLimb(ctx, shp, hip, mid, 10, sc, dir);
  const dx = mid.x - hip.x;
  const dy = mid.y - hip.y;
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L;
  const uy = dy / L;
  ctx.strokeStyle = '#f2c230';
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(hip.x + ux * 6, hip.y + uy * 6);
  ctx.lineTo(mid.x - ux * 1.5, mid.y - uy * 1.5);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,.45)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(mid.x - uy * 10 * dir * -1, mid.y + ux * 10 * dir * -1);
  ctx.lineTo(mid.x + uy * 10 * dir * -1, mid.y - ux * 10 * dir * -1);
  ctx.stroke();
  if (!far) {
    const cx = lerp(hip.x, mid.x, 0.5) + ux * 2;
    const cy = lerp(hip.y, mid.y, 0.5) + uy * 2;
    const a0 = Math.atan2(uy, ux);
    ctx.fillStyle = '#f2c230';
    ctx.beginPath();
    ctx.arc(cx, cy, 4.3, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, 4.3, a0, a0 + Math.PI / 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, 4.3, a0 + Math.PI, a0 + Math.PI * 1.5);
    ctx.fill();
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(cx, cy, 4.3, 0, TAU);
    ctx.stroke();
  }
}

export function drawTorso(ctx, R, f) {
  const n = R.neck;
  const p = R.pel;
  const dir = R.dir;
  let ux = p.x - n.x;
  let uy = p.y - n.y;
  const L = Math.hypot(ux, uy) || 1;
  ux /= L;
  uy /= L;
  const k = L / 54;
  ctx.save();
  ctx.transform(dir * uy, -dir * ux, ux * k, uy * k, n.x, n.y);
  const g = ctx.createLinearGradient(-12, 0, 13, 0);
  g.addColorStop(0, '#a8694a');
  g.addColorStop(0.3, '#d49c78');
  g.addColorStop(0.75, '#efc4a2');
  g.addColorStop(1, '#d9a07b');
  ctx.fillStyle = g;
  ctx.fill(TORSO);
  ctx.strokeStyle = PAL.near.line;
  ctx.lineWidth = 0.9;
  ctx.stroke(TORSO);
  ctx.save();
  ctx.clip(TORSO);
  // анатомия
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(95,45,28,.38)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(4, 14, 8, 0.25, Math.PI * 0.78);
  ctx.stroke();
  ctx.fillStyle = 'rgba(120,60,45,.8)';
  ctx.beginPath();
  ctx.arc(10.6, 17.5, 1.2, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(95,45,28,.3)';
  ctx.lineWidth = 0.8;
  for (const y of [29, 35, 41]) {
    ctx.beginPath();
    ctx.moveTo(3, y);
    ctx.quadraticCurveTo(6.5, y + 1.2, 9.2, y);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(8.2, 24);
  ctx.lineTo(7.8, 46);
  ctx.stroke();
  for (const y of [22, 25.5]) {
    ctx.beginPath();
    ctx.moveTo(-1, y);
    ctx.lineTo(6, y + 1);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(110,55,35,.16)';
  ctx.beginPath();
  ctx.ellipse(-2, 32, 6, 14, 0.1, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,230,210,.18)';
  ctx.beginPath();
  ctx.ellipse(6, 13, 4, 3, 0.3, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(90,40,25,.3)';
  ctx.beginPath();
  ctx.moveTo(-9, 8);
  ctx.quadraticCurveTo(-5, 16, -8, 24);
  ctx.stroke();
  for (const w of f.wounds.torso) drawWound(ctx, w, w.x, w.y);
  ctx.restore();
  // пояс шортов
  const sc = f.col.near;
  const sg = ctx.createLinearGradient(-12, 0, 11, 0);
  sg.addColorStop(0, sc.lo);
  sg.addColorStop(0.6, sc.mid);
  sg.addColorStop(1, sc.hi);
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.moveTo(-11.8, 43);
  ctx.lineTo(9.8, 43);
  ctx.lineTo(10.8, 57);
  ctx.lineTo(6, 62);
  ctx.lineTo(-4, 62.5);
  ctx.lineTo(-12.5, 57);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = sc.line;
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.fillStyle = '#e9e2d2';
  ctx.fillRect(-11.6, 43, 21.2, 3);
  ctx.fillStyle = '#111';
  ctx.fillRect(-11.6, 46, 21.4, 1.2);
  ctx.restore();
}

export function drawHead(ctx, R, f) {
  const h = R.head;
  const n = R.neck;
  const dir = R.dir;
  let dx = n.x - h.x;
  let dy = n.y - h.y;
  const L = Math.hypot(dx, dy) || 1;
  dx /= L;
  dy /= L;
  const nb = { x: h.x + dx * 3, y: h.y + dy * 3 };
  const np = limbPath(n, nb, 5.8, 5.1, 0, 0, dir);
  fillLimb(ctx, np, n, nb, 5.4, PAL.near, dir);
  ctx.save();
  ctx.transform(dir * dy, -dir * dx, dx, dy, h.x, h.y);
  const g = ctx.createLinearGradient(-10, 0, 14, 0);
  g.addColorStop(0, '#c08560');
  g.addColorStop(0.35, '#e0aa86');
  g.addColorStop(0.8, '#f0c6a4');
  g.addColorStop(1, '#e2ac88');
  ctx.fillStyle = g;
  ctx.fill(HEAD);
  ctx.strokeStyle = PAL.near.line;
  ctx.lineWidth = 0.9;
  ctx.stroke(HEAD);
  // ухо
  ctx.fillStyle = '#d0966f';
  ctx.beginPath();
  ctx.ellipse(-3.2, 1.6, 2.6, 4.2, 0.12, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(80,35,20,.6)';
  ctx.lineWidth = 0.7;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(110,50,35,.5)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.arc(-3.4, 1.6, 1.4, -1.2, 1.9);
  ctx.stroke();
  ctx.save();
  ctx.clip(HEAD);
  ctx.fillStyle = 'rgba(120,60,40,.2)';
  ctx.beginPath();
  ctx.moveTo(-6, 8);
  ctx.quadraticCurveTo(2, 14, 9, 14);
  ctx.lineTo(9, 16);
  ctx.lineTo(-7, 16);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,225,205,.22)';
  ctx.beginPath();
  ctx.ellipse(5, 5, 3.6, 3, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(90,50,40,.1)';
  ctx.beginPath();
  ctx.ellipse(5, 11, 5, 3, 0, 0, TAU);
  ctx.fill();
  // глаз
  let swell = 0;
  for (const w of f.wounds.head) {
    if (w.k === 'bruise' && w.spot === 'eye' && !w.old) swell = Math.max(swell, w.v);
  }
  const open = clamp(1 - R.ey * 0.92 - swell * 0.55, 0, 1);
  ctx.fillStyle = 'rgba(100,55,45,.16)';
  ctx.beginPath();
  ctx.ellipse(6, -2.6, 4.4, 3.2, 0, 0, TAU);
  ctx.fill();
  if (open < 0.18) {
    ctx.strokeStyle = '#2a1710';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(3.8, -2.1);
    ctx.quadraticCurveTo(6.2, -0.7, 8.7, -2.2);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#f4f0ea';
    ctx.beginPath();
    ctx.ellipse(6.3, -2.2, 2.8, 1.7 * open, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#4a2c1a';
    ctx.beginPath();
    ctx.arc(7.3, -2.2, Math.min(1.35, 1.7 * open), 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#050505';
    ctx.beginPath();
    ctx.arc(7.5, -2.2, 0.65, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(7.1, -2.9 * open - 0.1, 0.55, 0.55);
    ctx.strokeStyle = '#2a1710';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.ellipse(6.3, -2.2, 2.9, 1.8 * open, 0, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
  }
  // бровь
  ctx.strokeStyle = '#241710';
  ctx.lineWidth = 1.7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(2.6, -5.4 + (R.mo > 0.7 ? 0.8 : 0));
  ctx.quadraticCurveTo(6, -7.2 + (R.mo > 0.7 ? 1 : 0), 9.9, -5.4);
  ctx.stroke();
  // ноздря
  ctx.strokeStyle = 'rgba(70,25,15,.7)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.arc(11.6, 5.3, 0.9, 2.6, 4.8);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(120,60,45,.35)';
  ctx.beginPath();
  ctx.moveTo(10.2, -1.6);
  ctx.quadraticCurveTo(11.5, 2, 12.2, 5);
  ctx.stroke();
  // щетина
  ctx.fillStyle = 'rgba(40,25,18,.08)';
  ctx.beginPath();
  ctx.ellipse(3, 10.5, 7, 3.5, 0, 0, TAU);
  ctx.fill();
  // рот
  const mo = R.mo;
  if (mo < 0.12) {
    ctx.strokeStyle = '#8a4b3f';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(7, 9.5);
    ctx.lineTo(11, 9.2);
    ctx.stroke();
    ctx.strokeStyle = '#c98878';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(8, 10.5);
    ctx.lineTo(10.5, 10.5);
    ctx.stroke();
  } else {
    const o = mo * 5.2;
    ctx.fillStyle = '#2b0d0d';
    ctx.beginPath();
    ctx.moveTo(7, 9.1);
    ctx.lineTo(11, 8.9);
    ctx.lineTo(10.4, 9.4 + o);
    ctx.quadraticCurveTo(8.8, 10.4 + o, 7.4, 9.6 + o);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f3eee4';
    ctx.fillRect(7.7, 9.1, 3, 1.5);
    ctx.fillStyle = '#8c2f33';
    ctx.beginPath();
    ctx.ellipse(8.8, 9 + o, 1.6, 0.8, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#a45a4e';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(6.8, 9);
    ctx.lineTo(11, 8.8);
    ctx.stroke();
    ctx.strokeStyle = '#c98878';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(7.2, 9.7 + o);
    ctx.quadraticCurveTo(9, 10.6 + o, 10.6, 9.5 + o);
    ctx.stroke();
  }
  // раны головы (внутри контура)
  for (const w of f.wounds.head) {
    if (w.k !== 'lip' && w.k !== 'nose') drawWound(ctx, w, w.x, w.y);
  }
  ctx.restore();
  // кровь из губ и носа (поверх контура)
  for (const w of f.wounds.head) {
    if (w.k === 'lip') {
      ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(160,18,26,${0.6 + 0.4 * w.v})`;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(8.4, 10.4);
      ctx.lineTo(10.6, 10.3);
      ctx.stroke();
      ctx.fillStyle = 'rgba(110,6,10,.9)';
      ctx.beginPath();
      ctx.ellipse(10, 10.4, 1.5, 0.9, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(125,8,12,.9)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(10, 11);
      ctx.lineTo(9.3, 11.4 + w.v * 14);
      ctx.stroke();
      ctx.fillStyle = 'rgba(125,8,12,.9)';
      ctx.beginPath();
      ctx.arc(9.3, 11.4 + w.v * 14, 1.1, 0, TAU);
      ctx.fill();
    } else if (w.k === 'nose') {
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(140,10,16,.9)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(11.8, 6);
      ctx.lineTo(11.2, 9);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(11.2, 9.2);
      ctx.lineTo(10.6, 10.5 + w.v * 8);
      ctx.stroke();
    }
  }
  // волосы
  const hg = ctx.createLinearGradient(-10, -18, 8, -4);
  hg.addColorStop(0, '#4d3526');
  hg.addColorStop(1, '#1c120c');
  ctx.fillStyle = hg;
  ctx.fill(HAIR);
  ctx.strokeStyle = 'rgba(0,0,0,.5)';
  ctx.lineWidth = 0.6;
  ctx.stroke(HAIR);
  ctx.strokeStyle = 'rgba(140,100,70,.35)';
  ctx.lineWidth = 0.6;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(-9 + i * 0.8, -4 - i * 1.3);
    ctx.quadraticCurveTo(-3 + i * 2, -16 + i * 0.5, 6 + i * 0.7, -15 + i * 1.1);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawFighter(ctx, f) {
  const R = f.rig;
  if (!R || !f.visible) return;
  const sx = (R.aN.x + R.aF.x + R.pel.x) / 3;
  const h = clamp(f.state === 'ragdoll' ? (f.gy - R.pel.y - 20) / 200 : f.y / 260, 0, 1);
  ctx.fillStyle = `rgba(0,0,0,${0.4 * (1 - h * 0.7)})`;
  ctx.beginPath();
  ctx.ellipse(sx, f.gy + 3, (f.state === 'ragdoll' ? 70 : 46) * (1 - h * 0.4), 8, 0, 0, TAU);
  ctx.fill();
  drawArm(ctx, R, 'F', f, true);
  drawLeg(ctx, R, 'F', f, true);
  drawTorso(ctx, R, f);
  drawLeg(ctx, R, 'N', f, false);
  drawHead(ctx, R, f);
  drawArm(ctx, R, 'N', f, false);
  if (f.marker && f.state !== 'ragdoll' && f.state !== 'getup') {
    const x = R.head.x;
    const y = R.head.y - 34 + Math.sin(f.t * 5) * 2;
    ctx.fillStyle = 'rgba(47,123,255,.9)';
    ctx.beginPath();
    ctx.moveTo(x - 6, y - 8);
    ctx.lineTo(x + 6, y - 8);
    ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
