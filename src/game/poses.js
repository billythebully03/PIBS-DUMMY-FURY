// Позы и ключевые кадры: единый «скелет» параметров из 17 полей.
import { ease } from './utils.js';

export const PK = [
  'px', 'H', 'tl', 'hd', 'a1', 'e1', 'c1', 'a2', 'e2', 'c2',
  'f1x', 'f1h', 'fa1', 'f2x', 'f2h', 'fa2', 'mo', 'ey',
];

const D = {
  px: 0, H: 84, tl: 9, hd: 3,
  a1: 40, e1: 115, c1: 1,
  a2: 15, e2: 140, c2: 1,
  f1x: 24, f1h: 0, fa1: 0,
  f2x: -22, f2h: 0, fa2: 0,
  mo: 0, ey: 0,
};

export { D };

export const P = (o) => Object.assign({}, D, o);

export const KF = (a) => a.map(([t, o]) => [t, P(o)]);

export function mixPose(a, b, t) {
  const r = {};
  for (const k of PK) r[k] = a[k] + (b[k] - a[k]) * t;
  return r;
}

export function sampleKF(kf, t) {
  if (t <= kf[0][0]) return kf[0][1];
  for (let i = 1; i < kf.length; i++) {
    if (t <= kf[i][0]) {
      const a = kf[i - 1];
      const b = kf[i];
      return mixPose(a[1], b[1], ease((t - a[0]) / (b[0] - a[0])));
    }
  }
  return kf[kf.length - 1][1];
}
