// Все ключевые кадры: стойка, удары, способности, падения, подъём.
import { P, KF } from './poses.js';

export const AIRL = { f1x: 24, f1h: 30, f2x: -12, f2h: 22 };

export const T_POSE = P({
  H: 92, tl: 0, hd: 0, a1: 90, e1: 0, c1: 0, a2: -90, e2: 0, c2: 0, f1x: 3, f2x: -3,
});

export const LAND = P({
  H: 60, tl: 30, px: 2, a1: 28, e1: 85, a2: 20, e2: 100, f1x: 30, f2x: -26, hd: 10,
});

export const RISE = P({
  H: 92, tl: 6, a1: 62, e1: 110, a2: 38, e2: 122, f1x: 22, f1h: 36, f2x: -12, f2h: 26, mo: 0.2,
});

export const FALL = P({
  H: 94, tl: 2, a1: 48, e1: 75, a2: 32, e2: 80, c1: 0, c2: 0, f1x: 18, f1h: 8, f2x: -16, f2h: 3,
});

export const DASHF = P({
  H: 66, tl: 44, hd: 22, px: 6, a1: -25, e1: 30, a2: -35, e2: 40,
  f1x: 46, f1h: 16, fa1: 20, f2x: -46, f2h: 18, fa2: 45, mo: 0.3,
});

export const DASHB = P({
  H: 86, tl: -16, hd: -8, px: -4, a1: 58, e1: 100, a2: 42, e2: 112,
  f1x: 28, f1h: 20, f2x: 10, f2h: 12, mo: 0.2,
});

export const HITH = P({
  tl: -12, hd: -26, H: 81, px: -6, a1: 12, e1: 60, c1: 0, a2: 5, e2: 70, c2: 0,
  f1x: 28, f2x: -26, ey: 1, mo: 0.85,
});

export const HITB = P({
  tl: 34, hd: 14, H: 72, px: 4, a1: 30, e1: 80, c1: 0, a2: 35, e2: 85, c2: 0,
  f1x: 22, f2x: -24, ey: 1, mo: 0.9,
});

export const WIN = P({
  H: 90, tl: -6, hd: -12, a1: 140, e1: 25, c1: 1, a2: 155, e2: 15, c2: 1, mo: 1,
});

export const LY = P({
  px: 0, H: 11, tl: -88, hd: -84, a1: 98, e1: 0, c1: 0, a2: 105, e2: 0, c2: 0,
  f1x: 56, f2x: 64, ey: 1, mo: 0.3,
});

export const GETUP = KF([
  [0, LY],
  [0.4, Object.assign({}, LY, { H: 12, tl: -86, mo: 0.5 })],
  [0.8, {
    H: 13, tl: -56, hd: -46, a1: -42, e1: -5, c1: 1, a2: -50, e2: -5, c2: 1,
    f1x: 62, f2x: 68, ey: 1, mo: 0.5,
  }],
  [1.05, {
    H: 13, tl: -10, hd: 6, a1: -34, e1: -6, c1: 1, a2: -40, e2: -4, c2: 1,
    f1x: 72, f2x: 78, ey: 0, mo: 0.6,
  }],
  [1.35, {
    H: 34, tl: 28, hd: 12, a1: 40, e1: 50, c1: 1, a2: 55, e2: 40, c2: 1,
    f1x: 26, f2x: 20, mo: 0.7,
  }],
  [1.65, {
    H: 66, tl: 38, hd: 10, a1: 28, e1: 8, c1: 1, a2: 30, e2: 8, c2: 1,
    f1x: 26, f2x: -14, mo: 0.7,
  }],
  [1.9, {
    H: 80, tl: 24, hd: 14, a1: 6, e1: 22, c1: 0, a2: 6, e2: 26, c2: 0, mo: 0.6,
  }],
  [2.1, {
    H: 82, tl: 14, hd: 6, a1: 58, e1: 95, c1: 0, a2: 12, e2: 30, c2: 0, mo: 0.4,
  }],
  [2.25, {
    H: 82, tl: 16, hd: -4, a1: 22, e1: 40, c1: 0, a2: 52, e2: 92, c2: 0, mo: 0.4,
  }],
  [2.4, {
    H: 82, tl: 14, hd: 5, a1: 60, e1: 90, c1: 0, a2: 18, e2: 36, c2: 0, mo: 0.3,
  }],
  [2.55, {
    H: 82, tl: 16, hd: -3, a1: 24, e1: 40, c1: 0, a2: 55, e2: 88, c2: 0, mo: 0.3,
  }],
  [2.8, {}],
]);

export const GETUP_DUR = 2.8;

const JAB_S = {
  tl: 22, px: 9, H: 80, a1: 88, e1: -4, a2: 35, e2: 135, f1x: 40, hd: 12, mo: 0.4,
};
const CRS_S = {
  tl: 30, px: 17, H: 78, a2: 92, e2: -6, a1: 34, e1: 132,
  f1x: 44, f2x: -12, f2h: 3, fa2: 35, hd: 14, mo: 0.5,
};
const KNE_S = {
  tl: 26, px: 8, hd: 20, a1: 62, e1: 42, c1: 0, a2: 58, e2: 48, c2: 0,
  f1x: 34, f1h: 48, fa1: 55, f2x: -16, mo: 0.6,
};
const UPR_S = {
  H: 90, tl: -8, px: 14, a2: 135, e2: 22, a1: 30, e1: 130,
  f1x: 30, f2x: -20, f2h: 8, fa2: 50, hd: -10, mo: 0.8,
};
const AIR_S = Object.assign({}, AIRL, {
  tl: 28, a1: 75, e1: -6, a2: 20, e2: 130, hd: 14, mo: 0.5,
});

export const ATK = [
  {
    n: 'jab', dur: 0.38, hs: 0.11, he: 0.2, cancel: 0.22, reach: 104, dmg: 4,
    zone: 'head', pw: 0.35, stun: 0.34, kb: 90, fist: 'N', lt: 0.07, lunge: 210,
    y: [88, 182],
    kf: KF([
      [0, {}],
      [0.07, { tl: 4, px: -5, a1: 22, e1: 135, f1x: 20 }],
      [0.12, JAB_S],
      [0.2, JAB_S],
      [0.38, {}],
    ]),
  },
  {
    n: 'cross', dur: 0.44, hs: 0.14, he: 0.23, cancel: 0.25, reach: 108, dmg: 5,
    zone: 'head', pw: 0.5, stun: 0.4, kb: 120, fist: 'F', lt: 0.09, lunge: 230,
    y: [88, 182],
    kf: KF([
      [0, {}],
      [0.08, { tl: 2, px: -8, a2: -8, e2: 100, a1: 42, e1: 112, f2x: -27, hd: 0 }],
      [0.15, CRS_S],
      [0.24, CRS_S],
      [0.44, {}],
    ]),
  },
  {
    n: 'knee', dur: 0.52, hs: 0.17, he: 0.27, cancel: 0.3, reach: 96, dmg: 6,
    zone: 'torso', pw: 0.6, stun: 0.5, kb: 30, pull: 62, fist: null, lt: 0.05, lunge: 260,
    y: [50, 140],
    kf: KF([
      [0, {}],
      [0.1, {
        tl: 12, px: -6, a1: 75, e1: 55, c1: 0, a2: 65, e2: 60, c2: 0,
        f1x: 20, f1h: 18, hd: 8,
      }],
      [0.19, KNE_S],
      [0.29, KNE_S],
      [0.52, {}],
    ]),
  },
  {
    n: 'upper', dur: 0.68, hs: 0.21, he: 0.32, cancel: 9, reach: 100, dmg: 9,
    zone: 'head', pw: 1, launch: true, lvx: 270, lvy: 680, fist: 'F', lt: 0.1, lunge: 200,
    y: [60, 205],
    kf: KF([
      [0, {}],
      [0.13, {
        H: 58, tl: 22, px: -6, a2: -28, e2: 30, a1: 45, e1: 110, f1x: 28, f2x: -32, hd: 12,
      }],
      [0.25, UPR_S],
      [0.36, UPR_S],
      [0.68, {}],
    ]),
  },
  {
    n: 'air', air: true, dur: 0.4, hs: 0.12, he: 0.26, cancel: 9, reach: 100, dmg: 5,
    zone: 'head', pw: 0.45, stun: 0.35, kb: 140, fist: 'N', lt: 0, lunge: 0,
    y: [20, 135],
    kf: KF([
      [0, AIRL],
      [0.08, Object.assign({}, AIRL, { tl: 12, a1: 30, e1: 110 })],
      [0.13, AIR_S],
      [0.26, AIR_S],
      [0.4, Object.assign({}, AIRL, { tl: 8 })],
    ]),
  },
];

export const A1 = { reach: 74, y: [20, 170] };
export const A1H = {
  dmg: 14, zone: 'torso', pw: 0.95, launch: true, lvx: 720, lvy: 420, fist: null,
};
export const A2H = {
  dmg: 12, zone: 'legs', pw: 0.7, launch: true, lvx: 140, lvy: 640, fist: null,
};

const RAMW = P({
  H: 62, tl: 42, hd: 22, px: -12, a1: -45, e1: 20, c1: 1, a2: -55, e2: 25, c2: 1,
  f1x: 32, f2x: -36, mo: 0.3,
});
const RAMC = P({
  H: 70, tl: 60, hd: 28, px: 18, a1: -55, e1: 10, c1: 1, a2: -65, e2: 10, c2: 1,
  f1x: 46, f1h: 14, f2x: -40, f2h: 20, mo: 0.9,
});

export const AB1 = KF([
  [0, {}],
  [0.28, RAMW],
  [0.34, RAMC],
  [0.64, RAMC],
  [0.72, {
    H: 76, tl: 34, hd: 26, px: 6, a1: 10, e1: 25, c1: 0, a2: 5, e2: 25, c2: 0,
    f1x: 30, f2x: -24, mo: 0.8,
  }],
  [1, { H: 80, tl: 20, c1: 0, c2: 0, a1: 20, e1: 60, a2: 15, e2: 60, mo: 0.5 }],
]);

const STP_W = P({
  H: 90, tl: -12, hd: -10, a1: 150, e1: 25, c1: 1, a2: 155, e2: 20, c2: 1,
  f1x: 20, f1h: 64, fa1: 35, f2x: -4, mo: 0.5,
});
const STP_S = P({
  H: 70, tl: 28, hd: 18, a1: 35, e1: 100, a2: 30, e2: 110, f1x: 32, f1h: 0, f2x: -26, mo: 1,
});

export const AB2 = KF([
  [0, {}],
  [0.25, STP_W],
  [0.4, STP_W],
  [0.46, STP_S],
  [0.6, STP_S],
  [0.9, {}],
]);
