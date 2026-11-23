// Синяки, порезы, ссадины и кровь на теле бойца.
import { TAU, rnd } from './utils.js';

export function newWounds() {
  const w = {
    head: [], torso: [], uN: [], uF: [], fN: [], fF: [],
    hN: [], hF: [], tN: [], tF: [], sN: [], sF: [],
  };
  const m = (k, o) => Object.assign({ k, a: rnd(TAU), old: false, v: 0.8, r: 3 }, o);
  w.head.push(
    m('scar', { x: 8.4, y: -6.2, r: 3.2, v: 0.8, a: -0.5 }),
    m('scar', { x: 10.6, y: 9.2, r: 2, v: 0.6, a: 1.4 }),
    m('bruise', { x: -1, y: 9, r: 3, v: 0.5, old: true, spot: 'old' }),
  );
  w.torso.push(
    m('bruise', { x: -3, y: 30, r: 5, v: 0.7, old: true }),
    m('scratch', { x: 2, y: 20, r: 6, v: 0.6 }),
    m('scar', { x: 7, y: 38, r: 4, v: 0.6 }),
  );
  w.uN.push(m('bruise', { t: 0.5, s: 0.2, r: 4, v: 0.6, old: true }));
  w.fN.push(
    m('scratch', { t: 0.45, s: 0, r: 6, v: 0.6 }),
    m('scratch', { t: 0.6, s: 0.3, r: 5, v: 0.5 }),
  );
  w.fF.push(m('scratch', { t: 0.5, s: -0.2, r: 5, v: 0.5 }));
  w.sN.push(
    m('bruise', { t: 0.4, s: 0.4, r: 4.5, v: 0.7, old: true }),
    m('abr', { t: 0.55, s: 0.2, r: 3.5, v: 0.5 }),
  );
  w.sF.push(m('scar', { t: 0.5, s: 0, r: 4, v: 0.6 }));
  w.tN.push(m('bruise', { t: 0.7, s: -0.3, r: 5, v: 0.5, old: true }));
  return w;
}

export function addW(f, part, o) {
  const L = f.wounds[part];
  L.push(Object.assign({ a: rnd(TAU), old: false, v: 0.8, r: 4 }, o));
  if (L.length > 11) {
    const i = L.findIndex((x) => x.k !== 'scar' && x.k !== 'lip' && x.k !== 'nose' && !x.old);
    L.splice(i < 0 ? 0 : i, 1);
  }
}

export function drawWound(ctx, w, x, y) {
  const r = w.r;
  const v = w.v;
  const c = Math.cos(w.a);
  const s = Math.sin(w.a);
  switch (w.k) {
    case 'bruise':
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = w.old
          ? `rgba(165,145,50,${(0.12 + i * 0.06) * v})`
          : `rgba(${i < 2 ? '92,32,96' : '135,52,112'},${(0.15 + i * 0.075) * v})`;
        ctx.beginPath();
        ctx.ellipse(x, y, r * (1.5 - i * 0.35), r * (1.2 - i * 0.3), w.a, 0, TAU);
        ctx.fill();
      }
      break;
    case 'blood':
      ctx.fillStyle = `rgba(125,8,12,${0.5 + 0.4 * v})`;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.7, w.a, 0, TAU);
      ctx.ellipse(x + c * r * 0.7, y + s * r * 0.5, r * 0.55, r * 0.4, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(60,0,4,.55)';
      ctx.beginPath();
      ctx.arc(x, y, r * 0.35, 0, TAU);
      ctx.fill();
      if (v > 0.5) {
        ctx.strokeStyle = 'rgba(125,8,12,.85)';
        ctx.lineWidth = 1.1;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 0.5, y + r * 1.8 * v);
        ctx.stroke();
      }
      break;
    case 'cut':
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(190,40,40,.3)';
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.moveTo(x - c * r, y - s * r);
      ctx.lineTo(x + c * r, y + s * r);
      ctx.stroke();
      ctx.strokeStyle = '#4d0508';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.strokeStyle = '#c4141c';
      ctx.lineWidth = 0.5;
      ctx.stroke();
      if (v > 0.5) {
        ctx.strokeStyle = 'rgba(150,10,16,.85)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 0.6, y + r * 2.2 * v);
        ctx.stroke();
      }
      break;
    case 'gash':
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(225,130,120,.7)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x - c * r, y - s * r);
      ctx.quadraticCurveTo(x + s * 1.5, y - c * 1.5, x + c * r, y + s * r);
      ctx.stroke();
      ctx.strokeStyle = '#2a0003';
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.strokeStyle = '#d01820';
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,200,200,.5)';
      ctx.lineWidth = 0.4;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(140,8,14,.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 1, y + r * 2.8);
      ctx.stroke();
      break;
    case 'scratch':
      ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(160,45,38,${0.5 + 0.3 * v})`;
      ctx.lineWidth = 0.6;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(x - c * r + s * i * 1.4, y - s * r - c * i * 1.4);
        ctx.lineTo(x + c * r + s * i * 1.4, y + s * r - c * i * 1.4);
        ctx.stroke();
      }
      break;
    case 'abr':
      ctx.fillStyle = 'rgba(190,70,60,.4)';
      ctx.beginPath();
      ctx.ellipse(x, y, r * 1.2, r * 0.8, w.a, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(130,20,20,.7)';
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(
          x + Math.sin(w.a * 7 + i * 2) * r * 0.8,
          y + Math.cos(w.a * 5 + i * 3) * r * 0.5,
          0.6,
          0,
          TAU,
        );
        ctx.fill();
      }
      break;
    case 'scar':
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,228,208,.6)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(x - c * r, y - s * r);
      ctx.lineTo(x + c * r, y + s * r);
      ctx.stroke();
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x - s * 1.2, y + c * 1.2);
      ctx.lineTo(x + s * 1.2, y - c * 1.2);
      ctx.stroke();
      break;
    case 'split':
      ctx.fillStyle = 'rgba(150,12,16,.85)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(50,0,4,.8)';
      ctx.beginPath();
      ctx.arc(x, y, r * 0.45, 0, TAU);
      ctx.fill();
      break;
    default:
      break;
  }
}

export function limbWounds(ctx, list, a, b, wd, dir, path) {
  if (!list || !list.length) return;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy) || 1;
  const nx = (dir * dy) / L;
  const ny = (-dir * dx) / L;
  ctx.save();
  ctx.clip(path);
  for (const w of list) {
    drawWound(ctx, w, a.x + dx * w.t + nx * w.s * wd, a.y + dy * w.t + ny * w.s * wd);
  }
  ctx.restore();
}

// Нанесение повреждений по зоне попадания.
export function injure(f, zone, pw) {
  const rr = Math.random;
  if (zone === 'head') {
    f.hits.head++;
    const spots = [
      ['eye', 6.2, -2.6, 4.6],
      ['cheek', 3.5, 5, 4.8],
      ['jaw', 5.5, 11, 4.2],
      ['brow', 8, -5.6, 3.2],
      ['forehead', 2, -9.5, 4],
    ];
    const s = spots[(rr() * spots.length) | 0];
    const ex = f.wounds.head.find((w) => w.k === 'bruise' && w.spot === s[0] && !w.old);
    if (ex) {
      ex.v = Math.min(1, ex.v + 0.22 + pw * 0.2);
      ex.r += 0.3;
    } else {
      addW(f, 'head', {
        k: 'bruise', x: s[1], y: s[2], r: s[3], v: 0.45 + pw * 0.3, spot: s[0],
      });
    }
    if ((f.hits.head >= 2 || pw > 0.6) && rr() < 0.5 + pw * 0.3) {
      const l = f.wounds.head.find((w) => w.k === 'lip');
      if (l) l.v = Math.min(1, l.v + 0.25);
      else addW(f, 'head', { k: 'lip', x: 10.5, y: 9.3, v: 0.35 + pw * 0.3 });
    }
    if (rr() < 0.25 + pw * 0.25) {
      const l = f.wounds.head.find((w) => w.k === 'nose');
      if (l) l.v = Math.min(1, l.v + 0.25);
      else addW(f, 'head', { k: 'nose', x: 12, y: 5.4, v: 0.4 + pw * 0.3 });
    }
    if (rr() < 0.25 + pw * 0.3) {
      addW(f, 'head', {
        k: 'cut', x: 8.2 + rr() * 0.5, y: -5.6 + rr() * 1.4, r: 2.6 + rr() * 1.6, v: 0.5 + rr() * 0.4,
      });
    }
    if (rr() < 0.4) {
      addW(f, 'head', { k: 'blood', x: rnd(0, 9), y: rnd(-4, 11), r: rnd(1.5, 3.4), v: rnd(0.3, 0.9) });
    }
    if (pw > 0.8 && f.hits.head > 3) {
      addW(f, 'head', { k: 'gash', x: rnd(1, 6), y: rnd(-9, -6), r: 3.4, v: 1 });
    }
  } else if (zone === 'torso') {
    f.hits.torso++;
    addW(f, 'torso', {
      k: 'bruise', x: rnd(0, 8), y: rnd(12, 42), r: rnd(3.5, 6), v: 0.5 + pw * 0.4,
    });
    if (pw > 0.5 && rr() < 0.6) {
      addW(f, 'torso', {
        k: rr() < 0.5 ? 'cut' : 'scratch', x: rnd(-2, 8), y: rnd(14, 40), r: rnd(3, 6), v: 0.7,
      });
    }
    if (f.hp < 70 && rr() < 0.6) {
      addW(f, 'torso', { k: 'blood', x: rnd(-2, 8), y: rnd(14, 40), r: rnd(2, 4.5), v: rnd(0.4, 1) });
    }
  } else {
    const s = rr() < 0.5 ? 'N' : 'F';
    addW(f, 's' + s, { k: 'bruise', t: rnd(0.2, 0.7), s: rnd(-0.4, 0.4), r: rnd(3, 5), v: 0.6 + pw * 0.3 });
    addW(f, 't' + s, { k: 'abr', t: rnd(0.7, 1), s: rnd(-0.4, 0.4), r: rnd(2.5, 4), v: 0.7 });
  }
}
