/*
 * DUMMY FURY game runtime.
 *
 * The browser-facing shell is React, while this file deliberately keeps the
 * real-time canvas simulation imperative. Canvas animation, verlet ragdolls,
 * hit detection and audio all live in one runtime so the original game feel is
 * not diluted by React re-renders.
 */

const TAU = Math.PI * 2;
const rad = (degrees) => degrees * Math.PI / 180;
const clamp = (value, min, max) => value < min ? min : value > max ? max : value;
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const ease = (t) => t * t * (3 - 2 * t);

export function createGameRuntime({
  gameCanvas,
  menuCanvas,
  selectCanvas,
  getScene,
  onBanner = () => {},
  onPauseChange = () => {},
  onResult = () => {},
}) {
  const $ = (selector) => document.querySelector(selector);

  /* ============================ AUDIO ============================ */
  const Snd = {
    ac: null,
    on: true,
    nb: null,
    init() {
      if (this.ac) {
        if (this.ac.state === 'suspended') this.ac.resume();
        return;
      }
      try {
        this.ac = new (window.AudioContext || window.webkitAudioContext)();
        const samples = this.ac.sampleRate;
        this.nb = this.ac.createBuffer(1, samples, samples);
        const data = this.nb.getChannelData(0);
        for (let i = 0; i < samples; i += 1) data[i] = Math.random() * 2 - 1;
      } catch (error) {
        this.ac = null;
      }
    },
    noise(duration, from, to, q, gain, type, delay) {
      if (!this.on || !this.ac) return;
      const ac = this.ac;
      const time = ac.currentTime + (delay || 0);
      const source = ac.createBufferSource();
      source.buffer = this.nb;
      source.loop = true;
      const filter = ac.createBiquadFilter();
      filter.type = type || 'bandpass';
      filter.frequency.setValueAtTime(from, time);
      filter.frequency.exponentialRampToValueAtTime(Math.max(30, to), time + duration);
      filter.Q.value = q;
      const gainNode = ac.createGain();
      gainNode.gain.setValueAtTime(gain, time);
      gainNode.gain.exponentialRampToValueAtTime(0.001, time + duration);
      source.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(ac.destination);
      source.start(time);
      source.stop(time + duration + 0.05);
    },
    tone(from, to, duration, gain, type, delay) {
      if (!this.on || !this.ac) return;
      const ac = this.ac;
      const time = ac.currentTime + (delay || 0);
      const oscillator = ac.createOscillator();
      oscillator.type = type || 'sine';
      oscillator.frequency.setValueAtTime(from, time);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), time + duration);
      const gainNode = ac.createGain();
      gainNode.gain.setValueAtTime(gain, time);
      gainNode.gain.exponentialRampToValueAtTime(0.001, time + duration);
      oscillator.connect(gainNode);
      gainNode.connect(ac.destination);
      oscillator.start(time);
      oscillator.stop(time + duration + 0.05);
    },
    hit(power = 1) {
      this.noise(0.14, 2200, 260, 0.8, 0.55 * power, 'lowpass');
      this.tone(160, 42, 0.18, 0.8 * power);
      this.noise(0.05, 4000, 1500, 2, 0.2 * power, 'highpass');
    },
    whoosh() { this.noise(0.2, 500, 2400, 1.2, 0.18, 'bandpass'); },
    thud() {
      this.tone(90, 35, 0.22, 0.7);
      this.noise(0.18, 500, 80, 0.7, 0.4, 'lowpass');
    },
    stomp() {
      this.tone(70, 25, 0.5, 1);
      this.noise(0.5, 900, 60, 0.6, 0.6, 'lowpass');
    },
    ram() {
      this.noise(0.45, 300, 1800, 0.8, 0.3);
      this.tone(80, 200, 0.4, 0.25, 'sawtooth');
    },
    ui() { this.tone(520, 820, 0.08, 0.18, 'square'); },
    ko() {
      this.tone(120, 30, 1, 0.9);
      this.noise(0.8, 1500, 80, 0.5, 0.6, 'lowpass');
    },
    spawn() {
      this.noise(0.3, 6000, 300, 0.6, 0.25, 'bandpass');
      this.tone(900, 100, 0.4, 0.2, 'sawtooth');
    },
    fight() {
      this.tone(220, 440, 0.25, 0.3, 'sawtooth');
      this.tone(330, 660, 0.25, 0.2, 'square', 0.12);
    },
  };

  /* ============================ POSES / FK ============================ */
  const PK = ['px', 'H', 'tl', 'hd', 'a1', 'e1', 'c1', 'a2', 'e2', 'c2', 'f1x', 'f1h', 'fa1', 'f2x', 'f2h', 'fa2', 'mo', 'ey'];
  const D = { px: 0, H: 84, tl: 9, hd: 3, a1: 40, e1: 115, c1: 1, a2: 15, e2: 140, c2: 1, f1x: 24, f1h: 0, fa1: 0, f2x: -22, f2h: 0, fa2: 0, mo: 0, ey: 0 };
  const P = (overrides) => Object.assign({}, D, overrides);
  const KF = (frames) => frames.map(([time, overrides]) => [time, P(overrides)]);
  function mix(a, b, t) {
    const result = {};
    for (const key of PK) result[key] = a[key] + (b[key] - a[key]) * t;
    return result;
  }
  function sampleKF(keyframes, time) {
    if (time <= keyframes[0][0]) return keyframes[0][1];
    for (let i = 1; i < keyframes.length; i += 1) {
      if (time <= keyframes[i][0]) {
        const a = keyframes[i - 1];
        const b = keyframes[i];
        return mix(a[1], b[1], ease((time - a[0]) / (b[0] - a[0])));
      }
    }
    return keyframes[keyframes.length - 1][1];
  }

  const TORSO_L = 54;
  const THIGH = 46;
  const SHIN = 44;
  const UA = 31;
  const FA = 27;
  const NECKH = 21;
  const ANK = 7;
  const JN = ['pel', 'neck', 'sh', 'head', 'eN', 'wN', 'eF', 'wF', 'kN', 'aN', 'kF', 'aF'];
  const JR = { head: 13, pel: 8, wN: 6, wF: 6, kN: 6, kF: 6, aN: 7, aF: 7, eN: 4, eF: 4, neck: 3 };

  function legIK(joints, side, footX, footHeight) {
    let dx = footX - joints.pel.x;
    let dy = -(ANK + footHeight) - joints.pel.y;
    let length = Math.hypot(dx, dy);
    const maxLength = (THIGH + SHIN) * 0.998;
    const minLength = Math.abs(THIGH - SHIN) + 3;
    if (length > maxLength) {
      dx *= maxLength / length;
      dy *= maxLength / length;
      length = maxLength;
    }
    if (length < minLength) {
      if (length < 0.001) {
        dx = 1;
        dy = 0;
        length = 1;
      }
      dx *= minLength / length;
      dy *= minLength / length;
      length = minLength;
    }
    const cosAngle = (THIGH * THIGH + length * length - SHIN * SHIN) / (2 * THIGH * length);
    const angle = Math.acos(clamp(cosAngle, -1, 1));
    const base = Math.atan2(dy, dx);
    let best = null;
    let bestScore = -1e9;
    for (const sign of [1, -1]) {
      const legAngle = base + sign * angle;
      const kneeX = joints.pel.x + Math.cos(legAngle) * THIGH;
      const kneeY = joints.pel.y + Math.sin(legAngle) * THIGH;
      const score = kneeX - kneeY * 0.5;
      if (score > bestScore) {
        bestScore = score;
        best = { x: kneeX, y: kneeY };
      }
    }
    joints[`k${side}`] = best;
    joints[`a${side}`] = { x: joints.pel.x + dx, y: joints.pel.y + dy };
  }

  function armFK(joints, side, shoulderAngle, elbowAngle) {
    const first = rad(shoulderAngle);
    const second = first + rad(elbowAngle);
    const elbow = { x: joints.sh.x + Math.sin(first) * UA, y: joints.sh.y + Math.cos(first) * UA };
    joints[`e${side}`] = elbow;
    joints[`w${side}`] = { x: elbow.x + Math.sin(second) * FA, y: elbow.y + Math.cos(second) * FA };
  }

  function computeRig(pose, x, groundY, height, direction) {
    const joints = {};
    joints.pel = { x: pose.px, y: -pose.H };
    const torsoLean = rad(pose.tl);
    joints.neck = { x: joints.pel.x + Math.sin(torsoLean) * TORSO_L, y: joints.pel.y - Math.cos(torsoLean) * TORSO_L };
    joints.sh = { x: lerp(joints.pel.x, joints.neck.x, 0.93), y: lerp(joints.pel.y, joints.neck.y, 0.93) };
    const headDirection = rad(pose.hd);
    joints.head = { x: joints.neck.x + Math.sin(headDirection) * NECKH, y: joints.neck.y - Math.cos(headDirection) * NECKH };
    armFK(joints, 'N', pose.a1, pose.e1);
    armFK(joints, 'F', pose.a2, pose.e2);
    legIK(joints, 'N', pose.f1x, pose.f1h);
    legIK(joints, 'F', pose.f2x, pose.f2h);
    let lowest = 0;
    for (const key in JR) lowest = Math.max(lowest, joints[key].y + JR[key]);
    const rig = { dir: direction };
    for (const key of JN) rig[key] = { x: x + joints[key].x * direction, y: groundY - height + joints[key].y - lowest };
    rig.fdN = { x: Math.cos(rad(pose.fa1)) * direction, y: Math.sin(rad(pose.fa1)) };
    rig.fdF = { x: Math.cos(rad(pose.fa2)) * direction, y: Math.sin(rad(pose.fa2)) };
    rig.cN = pose.c1;
    rig.cF = pose.c2;
    rig.mo = pose.mo;
    rig.ey = pose.ey;
    return rig;
  }

  function blendRig(from, to, t) {
    const rig = { dir: to.dir };
    for (const key of JN) rig[key] = { x: lerp(from[key].x, to[key].x, t), y: lerp(from[key].y, to[key].y, t) };
    for (const key of ['fdN', 'fdF']) {
      const x = lerp(from[key].x, to[key].x, t);
      const y = lerp(from[key].y, to[key].y, t);
      const length = Math.hypot(x, y) || 1;
      rig[key] = { x: x / length, y: y / length };
    }
    rig.cN = lerp(from.cN, to.cN, t);
    rig.cF = lerp(from.cF, to.cF, t);
    rig.mo = lerp(from.mo, to.mo, t);
    rig.ey = lerp(from.ey, to.ey, t);
    return rig;
  }

  /* poses */
  const AIRL = { f1x: 24, f1h: 30, f2x: -12, f2h: 22 };
  const T_POSE = P({ H: 92, tl: 0, hd: 0, a1: 90, e1: 0, c1: 0, a2: -90, e2: 0, c2: 0, f1x: 3, f2x: -3 });
  const LAND = P({ H: 60, tl: 30, px: 2, a1: 28, e1: 85, a2: 20, e2: 100, f1x: 30, f2x: -26, hd: 10 });
  const RISE = P({ H: 92, tl: 6, a1: 62, e1: 110, a2: 38, e2: 122, f1x: 22, f1h: 36, f2x: -12, f2h: 26, mo: 0.2 });
  const FALL = P({ H: 94, tl: 2, a1: 48, e1: 75, a2: 32, e2: 80, c1: 0, c2: 0, f1x: 18, f1h: 8, f2x: -16, f2h: 3 });
  const DASHF = P({ H: 66, tl: 44, hd: 22, px: 6, a1: -25, e1: 30, a2: -35, e2: 40, f1x: 46, f1h: 16, fa1: 20, f2x: -46, f2h: 18, fa2: 45, mo: 0.3 });
  const DASHB = P({ H: 86, tl: -16, hd: -8, px: -4, a1: 58, e1: 100, a2: 42, e2: 112, f1x: 28, f1h: 20, f2x: 10, f2h: 12, mo: 0.2 });
  const HITH = P({ tl: -12, hd: -26, H: 81, px: -6, a1: 12, e1: 60, c1: 0, a2: 5, e2: 70, c2: 0, f1x: 28, f2x: -26, ey: 1, mo: 0.85 });
  const HITB = P({ tl: 34, hd: 14, H: 72, px: 4, a1: 30, e1: 80, c1: 0, a2: 35, e2: 85, c2: 0, f1x: 22, f2x: -24, ey: 1, mo: 0.9 });
  const WIN = P({ H: 90, tl: -6, hd: -12, a1: 140, e1: 25, c1: 1, a2: 155, e2: 15, c2: 1, mo: 1 });
  const LY = { px: 0, H: 11, tl: -88, hd: -84, a1: 98, e1: 0, c1: 0, a2: 105, e2: 0, c2: 0, f1x: 56, f2x: 64, ey: 1, mo: 0.3 };
  const GETUP = KF([
    [0, LY],
    [0.4, Object.assign({}, LY, { H: 12, tl: -86, mo: 0.5 })],
    [0.8, { H: 13, tl: -56, hd: -46, a1: -42, e1: -5, c1: 1, a2: -50, e2: -5, c2: 1, f1x: 62, f2x: 68, ey: 1, mo: 0.5 }],
    [1.05, { H: 13, tl: -10, hd: 6, a1: -34, e1: -6, c1: 1, a2: -40, e2: -4, c2: 1, f1x: 72, f2x: 78, ey: 0, mo: 0.6 }],
    [1.35, { H: 34, tl: 28, hd: 12, a1: 40, e1: 50, c1: 1, a2: 55, e2: 40, c2: 1, f1x: 26, f2x: 20, mo: 0.7 }],
    [1.65, { H: 66, tl: 38, hd: 10, a1: 28, e1: 8, c1: 1, a2: 30, e2: 8, c2: 1, f1x: 26, f2x: -14, mo: 0.7 }],
    [1.9, { H: 80, tl: 24, hd: 14, a1: 6, e1: 22, c1: 0, a2: 6, e2: 26, c2: 0, mo: 0.6 }],
    [2.1, { H: 82, tl: 14, hd: 6, a1: 58, e1: 95, c1: 0, a2: 12, e2: 30, c2: 0, mo: 0.4 }],
    [2.25, { H: 82, tl: 16, hd: -4, a1: 22, e1: 40, c1: 0, a2: 52, e2: 92, c2: 0, mo: 0.4 }],
    [2.4, { H: 82, tl: 14, hd: 5, a1: 60, e1: 90, c1: 0, a2: 18, e2: 36, c2: 0, mo: 0.3 }],
    [2.55, { H: 82, tl: 16, hd: -3, a1: 24, e1: 40, c1: 0, a2: 55, e2: 88, c2: 0, mo: 0.3 }],
    [2.8, {}],
  ]);
  const GETUP_DUR = 2.8;

  const JAB_S = { tl: 22, px: 9, H: 80, a1: 88, e1: -4, a2: 35, e2: 135, f1x: 40, hd: 12, mo: 0.4 };
  const CRS_S = { tl: 30, px: 17, H: 78, a2: 92, e2: -6, a1: 34, e1: 132, f1x: 44, f2x: -12, f2h: 3, fa2: 35, hd: 14, mo: 0.5 };
  const KNE_S = { tl: 26, px: 8, hd: 20, a1: 62, e1: 42, c1: 0, a2: 58, e2: 48, c2: 0, f1x: 34, f1h: 48, fa1: 55, f2x: -16, mo: 0.6 };
  const UPR_S = { H: 90, tl: -8, px: 14, a2: 135, e2: 22, a1: 30, e1: 130, f1x: 30, f2x: -20, f2h: 8, fa2: 50, hd: -10, mo: 0.8 };
  const AIR_S = Object.assign({}, AIRL, { tl: 28, a1: 75, e1: -6, a2: 20, e2: 130, hd: 14, mo: 0.5 });
  const ATK = [
    { n: 'jab', dur: 0.38, hs: 0.11, he: 0.2, cancel: 0.22, reach: 104, dmg: 4, zone: 'head', pw: 0.35, stun: 0.34, kb: 90, fist: 'N', lt: 0.07, lunge: 210, y: [88, 182], kf: KF([[0, {}], [0.07, { tl: 4, px: -5, a1: 22, e1: 135, f1x: 20 }], [0.12, JAB_S], [0.2, JAB_S], [0.38, {}]]) },
    { n: 'cross', dur: 0.44, hs: 0.14, he: 0.23, cancel: 0.25, reach: 108, dmg: 5, zone: 'head', pw: 0.5, stun: 0.4, kb: 120, fist: 'F', lt: 0.09, lunge: 230, y: [88, 182], kf: KF([[0, {}], [0.08, { tl: 2, px: -8, a2: -8, e2: 100, a1: 42, e1: 112, f2x: -27, hd: 0 }], [0.15, CRS_S], [0.24, CRS_S], [0.44, {}]]) },
    { n: 'knee', dur: 0.52, hs: 0.17, he: 0.27, cancel: 0.3, reach: 96, dmg: 6, zone: 'torso', pw: 0.6, stun: 0.5, kb: 30, pull: 62, fist: null, lt: 0.05, lunge: 260, y: [50, 140], kf: KF([[0, {}], [0.1, { tl: 12, px: -6, a1: 75, e1: 55, c1: 0, a2: 65, e2: 60, c2: 0, f1x: 20, f1h: 18, hd: 8 }], [0.19, KNE_S], [0.29, KNE_S], [0.52, {}]]) },
    { n: 'upper', dur: 0.68, hs: 0.21, he: 0.32, cancel: 9, reach: 100, dmg: 9, zone: 'head', pw: 1, stun: 0.6, launch: true, lvx: 270, lvy: 680, fist: 'F', lt: 0.1, lunge: 200, y: [60, 205], kf: KF([[0, {}], [0.13, { H: 58, tl: 22, px: -6, a2: -28, e2: 30, a1: 45, e1: 110, f1x: 28, f2x: -32, hd: 12 }], [0.25, UPR_S], [0.36, UPR_S], [0.68, {}]]) },
    { n: 'air', air: true, dur: 0.4, hs: 0.12, he: 0.26, cancel: 9, reach: 100, dmg: 5, zone: 'head', pw: 0.45, stun: 0.35, kb: 140, fist: 'N', lt: 0, lunge: 0, y: [20, 135], kf: KF([[0, AIRL], [0.08, Object.assign({}, AIRL, { tl: 12, a1: 30, e1: 110 })], [0.13, AIR_S], [0.26, AIR_S], [0.4, Object.assign({}, AIRL, { tl: 8 })]]) },
  ];
  const A1 = { reach: 74, y: [20, 170] };
  const A1H = { dmg: 14, zone: 'torso', pw: 0.95, launch: true, lvx: 720, lvy: 420, fist: null };
  const A2H = { dmg: 12, zone: 'legs', pw: 0.7, launch: true, lvx: 140, lvy: 640, fist: null };
  const RAMW = { H: 62, tl: 42, hd: 22, px: -12, a1: -45, e1: 20, c1: 1, a2: -55, e2: 25, c2: 1, f1x: 32, f2x: -36, mo: 0.3 };
  const RAMC = { H: 70, tl: 60, hd: 28, px: 18, a1: -55, e1: 10, c1: 1, a2: -65, e2: 10, c2: 1, f1x: 46, f1h: 14, f2x: -40, f2h: 20, mo: 0.9 };
  const AB1 = KF([[0, {}], [0.28, RAMW], [0.34, RAMC], [0.64, RAMC], [0.72, { H: 76, tl: 34, hd: 26, px: 6, a1: 10, e1: 25, c1: 0, a2: 5, e2: 25, c2: 0, f1x: 30, f2x: -24, mo: 0.8 }], [1, { H: 80, tl: 20, c1: 0, c2: 0, a1: 20, e1: 60, a2: 15, e2: 60, mo: 0.5 }]]);
  const STP_W = { H: 90, tl: -12, hd: -10, a1: 150, e1: 25, c1: 1, a2: 155, e2: 20, c2: 1, f1x: 20, f1h: 64, fa1: 35, f2x: -4, mo: 0.5 };
  const STP_S = { H: 70, tl: 28, hd: 18, a1: 35, e1: 100, a2: 30, e2: 110, f1x: 32, f1h: 0, f2x: -26, mo: 1 };
  const AB2 = KF([[0, {}], [0.25, STP_W], [0.4, STP_W], [0.46, STP_S], [0.6, STP_S], [0.9, {}]]);

  /* ============================ SKIN / DRAW HELPERS ============================ */
  const PAL = {
    near: { hi: '#f2c9a8', mid: '#d9a07b', lo: '#a96b4c', line: 'rgba(70,30,18,.55)' },
    far: { hi: '#c9946f', mid: '#a8714f', lo: '#7d4c33', line: 'rgba(50,20,10,.55)' },
  };
  const COL_BLUE = { near: { hi: '#4a80e0', mid: '#2653b3', lo: '#18357a', line: 'rgba(5,10,30,.7)' }, far: { hi: '#2a4f9c', mid: '#1a3b80', lo: '#0f2556', line: 'rgba(0,0,20,.7)' } };
  const COL_RED = { near: { hi: '#e24a4a', mid: '#b32626', lo: '#7a1818', line: 'rgba(30,5,5,.7)' }, far: { hi: '#9c2a2a', mid: '#801a1a', lo: '#561010', line: 'rgba(20,0,0,.7)' } };

  function limbPath(a, b, width0, width1, bulgeFront, bulgeBack, direction) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length;
    const uy = dy / length;
    const nx = direction * uy;
    const ny = -direction * ux;
    const points = 7;
    const path = new Path2D();
    for (let i = 0; i <= points; i += 1) {
      const t = i / points;
      const sideBulge = Math.pow(Math.sin(Math.PI * t), 0.8);
      const width = width0 + (width1 - width0) * t + bulgeFront * sideBulge;
      const x = a.x + dx * t + nx * width;
      const y = a.y + dy * t + ny * width;
      if (i) path.lineTo(x, y); else path.moveTo(x, y);
    }
    const angle = Math.atan2(ny, nx);
    const clockwise = (nx * uy - ny * ux) > 0;
    path.arc(b.x, b.y, width1, angle, angle + (clockwise ? Math.PI : -Math.PI), !clockwise);
    for (let i = points; i >= 0; i -= 1) {
      const t = i / points;
      const sideBulge = Math.pow(Math.sin(Math.PI * t), 0.8);
      const width = width0 + (width1 - width0) * t + bulgeBack * sideBulge;
      path.lineTo(a.x + dx * t - nx * width, a.y + dy * t - ny * width);
    }
    path.arc(a.x, a.y, width0, angle + Math.PI, angle + Math.PI + (clockwise ? Math.PI : -Math.PI), !clockwise);
    path.closePath();
    return path;
  }

  function fillLimb(ctx, path, a, b, width, palette, direction) {
    const middleX = (a.x + b.x) / 2;
    const middleY = (a.y + b.y) / 2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = direction * dy / length;
    const ny = -direction * dx / length;
    const gradient = ctx.createLinearGradient(middleX + nx * width, middleY + ny * width, middleX - nx * width, middleY - ny * width);
    gradient.addColorStop(0, palette.hi);
    gradient.addColorStop(0.5, palette.mid);
    gradient.addColorStop(1, palette.lo);
    ctx.fillStyle = gradient;
    ctx.fill(path);
    ctx.strokeStyle = palette.line;
    ctx.lineWidth = 0.9;
    ctx.stroke(path);
  }

  const TK = [[0, -5, 5], [6, -10, 7.5], [16, -12, 12.5], [28, -11, 10.5], [42, -9.5, 8.5], [54, -11, 9.5]];
  function tk(a, index) {
    for (let j = 1; j < TK.length; j += 1) {
      if (a <= TK[j][0]) {
        const from = TK[j - 1];
        const to = TK[j];
        return lerp(from[index], to[index], ease((a - from[0]) / (to[0] - from[0])));
      }
    }
    return TK[TK.length - 1][index];
  }
  const TORSO = new Path2D();
  for (let a = 0; a <= 54; a += 3) {
    if (a) TORSO.lineTo(tk(a, 2), a); else TORSO.moveTo(tk(a, 2), a);
  }
  for (let a = 54; a >= 0; a -= 3) TORSO.lineTo(tk(a, 1), a);
  TORSO.closePath();
  const HEAD = new Path2D();
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
  const HAIR = new Path2D();
  HAIR.moveTo(-10.6, -1.5);
  HAIR.bezierCurveTo(-12.5, -12, -3, -19, 5, -17.5);
  HAIR.bezierCurveTo(9.5, -16.5, 11.2, -12.5, 10.6, -8.5);
  HAIR.bezierCurveTo(9.5, -10.6, 7, -10.2, 5.5, -9.6);
  HAIR.bezierCurveTo(3, -9.6, 0, -8, -2, -4.2);
  HAIR.lineTo(-4.4, 1.6);
  HAIR.lineTo(-6.2, 0.8);
  HAIR.bezierCurveTo(-8.2, 3, -10.4, 2, -10.6, -1.5);
  HAIR.closePath();

  /* wounds */
  function newWounds() {
    const wounds = { head: [], torso: [], uN: [], uF: [], fN: [], fF: [], hN: [], hF: [], tN: [], tF: [], sN: [], sF: [] };
    const wound = (kind, overrides) => Object.assign({ k: kind, a: rnd(TAU), old: false, v: 0.8, r: 3 }, overrides);
    wounds.head.push(wound('scar', { x: 8.4, y: -6.2, r: 3.2, v: 0.8, a: -0.5 }), wound('scar', { x: 10.6, y: 9.2, r: 2, v: 0.6, a: 1.4 }), wound('bruise', { x: -1, y: 9, r: 3, v: 0.5, old: true, spot: 'old' }));
    wounds.torso.push(wound('bruise', { x: -3, y: 30, r: 5, v: 0.7, old: true }), wound('scratch', { x: 2, y: 20, r: 6, v: 0.6 }), wound('scar', { x: 7, y: 38, r: 4, v: 0.6 }));
    wounds.uN.push(wound('bruise', { t: 0.5, s: 0.2, r: 4, v: 0.6, old: true }));
    wounds.fN.push(wound('scratch', { t: 0.45, s: 0, r: 6, v: 0.6 }), wound('scratch', { t: 0.6, s: 0.3, r: 5, v: 0.5 }));
    wounds.fF.push(wound('scratch', { t: 0.5, s: -0.2, r: 5, v: 0.5 }));
    wounds.sN.push(wound('bruise', { t: 0.4, s: 0.4, r: 4.5, v: 0.7, old: true }), wound('abr', { t: 0.55, s: 0.2, r: 3.5, v: 0.5 }));
    wounds.sF.push(wound('scar', { t: 0.5, s: 0, r: 4, v: 0.6 }));
    wounds.tN.push(wound('bruise', { t: 0.7, s: -0.3, r: 5, v: 0.5, old: true }));
    return wounds;
  }
  function addWound(fighter, part, overrides) {
    const list = fighter.wounds[part];
    list.push(Object.assign({ a: rnd(TAU), old: false, v: 0.8, r: 4 }, overrides));
    if (list.length > 11) {
      const index = list.findIndex((item) => item.k !== 'scar' && item.k !== 'lip' && item.k !== 'nose' && !item.old);
      list.splice(index < 0 ? 0 : index, 1);
    }
  }
  function drawWound(ctx, wound, x, y) {
    const { r, v } = wound;
    const c = Math.cos(wound.a);
    const s = Math.sin(wound.a);
    switch (wound.k) {
      case 'bruise':
        for (let i = 0; i < 3; i += 1) {
          ctx.fillStyle = wound.old ? `rgba(165,145,50,${(0.12 + i * 0.06) * v})` : `rgba(${i < 2 ? '92,32,96' : '135,52,112'},${(0.15 + i * 0.075) * v})`;
          ctx.beginPath();
          ctx.ellipse(x, y, r * (1.5 - i * 0.35), r * (1.2 - i * 0.3), wound.a, 0, TAU);
          ctx.fill();
        }
        break;
      case 'blood':
        ctx.fillStyle = `rgba(125,8,12,${0.5 + 0.4 * v})`;
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * 0.7, wound.a, 0, TAU);
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
        for (let i = -1; i <= 1; i += 1) {
          ctx.beginPath();
          ctx.moveTo(x - c * r + s * i * 1.4, y - s * r - c * i * 1.4);
          ctx.lineTo(x + c * r + s * i * 1.4, y + s * r - c * i * 1.4);
          ctx.stroke();
        }
        break;
      case 'abr':
        ctx.fillStyle = 'rgba(190,70,60,.4)';
        ctx.beginPath();
        ctx.ellipse(x, y, r * 1.2, r * 0.8, wound.a, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(130,20,20,.7)';
        for (let i = 0; i < 5; i += 1) {
          ctx.beginPath();
          ctx.arc(x + Math.sin(wound.a * 7 + i * 2) * r * 0.8, y + Math.cos(wound.a * 5 + i * 3) * r * 0.5, 0.6, 0, TAU);
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
  function limbWounds(ctx, list, a, b, width, direction, path) {
    if (!list || !list.length) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = direction * dy / length;
    const ny = -direction * dx / length;
    ctx.save();
    ctx.clip(path);
    for (const wound of list) drawWound(ctx, wound, a.x + dx * wound.t + nx * wound.s * width, a.y + dy * wound.t + ny * wound.s * width);
    ctx.restore();
  }
  function footDirectionRag(knee, ankle, direction) {
    let sx = ankle.x - knee.x;
    let sy = ankle.y - knee.y;
    const length = Math.hypot(sx, sy) || 1;
    sx /= length;
    sy /= length;
    let fx = -sy;
    let fy = sx;
    if (Math.abs(fx) > 0.3) {
      if (fx * direction < 0) {
        fx = -fx;
        fy = -fy;
      }
    } else if (fy > 0) {
      fx = -fx;
      fy = -fy;
    }
    return { x: fx, y: fy };
  }

  /* hand */
  const FING = [[5, 3.2, 2.6, 2.5], [5.4, 3.5, 2.7, 2.6], [5, 3.3, 2.5, 2.4], [4, 2.5, 2.2, 2.2]];
  function drawHand(ctx, elbow, wrist, curl, far, direction, woundList) {
    let dx = wrist.x - elbow.x;
    let dy = wrist.y - elbow.y;
    const length = Math.hypot(dx, dy) || 1;
    dx /= length;
    dy /= length;
    let nx = -dy;
    let ny = dx;
    if (-0.6 * direction * nx + 0.8 * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    const palette = far ? PAL.far : PAL.near;
    const c = curl;
    ctx.save();
    ctx.transform(dx, dy, nx, ny, wrist.x, wrist.y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const palm = new Path2D();
    palm.moveTo(-1, -3.2);
    palm.lineTo(7.5, -3.4);
    palm.quadraticCurveTo(10, -3, 10, -0.4);
    palm.lineTo(9.6, 2.6);
    palm.quadraticCurveTo(9, 4, 6, 4);
    palm.lineTo(-0.5, 3.4);
    palm.closePath();
    ctx.fillStyle = palette.mid;
    ctx.fill(palm);
    ctx.strokeStyle = palette.line;
    ctx.lineWidth = 0.8;
    ctx.stroke(palm);
    const chain = (baseX, baseY, segments, angles, width) => {
      let x = baseX;
      let y = baseY;
      let angle = 0;
      const points = [[x, y]];
      for (let i = 0; i < segments.length; i += 1) {
        angle += angles[i];
        x += Math.cos(angle) * segments[i];
        y += Math.sin(angle) * segments[i];
        points.push([x, y]);
      }
      ctx.strokeStyle = palette.line;
      ctx.lineWidth = width + 1;
      ctx.beginPath();
      points.forEach((point, index) => index ? ctx.lineTo(point[0], point[1]) : ctx.moveTo(point[0], point[1]));
      ctx.stroke();
      ctx.strokeStyle = palette.mid;
      ctx.lineWidth = width;
      ctx.stroke();
      ctx.strokeStyle = palette.hi;
      ctx.lineWidth = width * 0.3;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      points.forEach((point, index) => index ? ctx.lineTo(point[0], point[1] - width * 0.2) : ctx.moveTo(point[0], point[1] - width * 0.2));
      ctx.stroke();
      ctx.globalAlpha = 1;
    };
    for (let i = 3; i >= 0; i -= 1) {
      const finger = FING[i];
      const fan = (i - 1.5) * 0.05 * (1 - c);
      chain(8.8 - i * 0.1, -2.4 + i * 0.55, [finger[0], finger[1], finger[2]], [rad(85 * c) + fan, rad(95 * c), rad(70 * c)], finger[3]);
    }
    chain(2.5, 2.6, [3.8, 3], [rad(lerp(25, 55, c)), rad(lerp(5, 55, c))], 2.7);
    ctx.fillStyle = palette.hi;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.arc(9.4, -2, 1.3, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (woundList) for (const wound of woundList) drawWound(ctx, wound, wound.x, wound.y);
    ctx.restore();
  }
  function drawFoot(ctx, ankle, foot, direction, palette) {
    const ex = foot.x;
    const ey = foot.y;
    ctx.save();
    ctx.transform(ex, ey, direction * (-ey), direction * ex, ankle.x, ankle.y);
    const path = new Path2D();
    path.moveTo(-4.2, -3.6);
    path.bezierCurveTo(-6.6, 0, -6.6, 5, -3, 6.6);
    path.lineTo(11.5, 6.8);
    path.quadraticCurveTo(15.8, 6.6, 15.6, 3.6);
    path.quadraticCurveTo(14, 2.2, 11, 2.6);
    path.quadraticCurveTo(6, -0.5, 4, -3.2);
    path.closePath();
    const gradient = ctx.createLinearGradient(0, -3, 0, 7);
    gradient.addColorStop(0, palette.hi);
    gradient.addColorStop(0.6, palette.mid);
    gradient.addColorStop(1, palette.lo);
    ctx.fillStyle = gradient;
    ctx.fill(path);
    ctx.strokeStyle = palette.line;
    ctx.lineWidth = 0.8;
    ctx.stroke(path);
    ctx.strokeStyle = palette.line;
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
  function drawArm(ctx, rig, side, fighter, far) {
    const palette = far ? PAL.far : PAL.near;
    const direction = rig.dir;
    const shoulder = rig.sh;
    const elbow = rig[`e${side}`];
    const wrist = rig[`w${side}`];
    const wounds = fighter.wounds;
    const upperPath = limbPath(shoulder, elbow, 5.5, 4.4, 1.4, 1.2, direction);
    fillLimb(ctx, upperPath, shoulder, elbow, 5, palette, direction);
    limbWounds(ctx, wounds[`u${side}`], shoulder, elbow, 5, direction, upperPath);
    const forePath = limbPath(elbow, wrist, 4.4, 3.1, 0.8, 1, direction);
    fillLimb(ctx, forePath, elbow, wrist, 4, palette, direction);
    limbWounds(ctx, wounds[`f${side}`], elbow, wrist, 4, direction, forePath);
    const shoulderGradient = ctx.createRadialGradient(shoulder.x - 1, shoulder.y - 2, 1, shoulder.x, shoulder.y, 7);
    shoulderGradient.addColorStop(0, palette.hi);
    shoulderGradient.addColorStop(1, palette.mid);
    ctx.fillStyle = shoulderGradient;
    ctx.beginPath();
    ctx.arc(shoulder.x, shoulder.y, 5.8, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = palette.line;
    ctx.lineWidth = 0.7;
    ctx.stroke();
    drawHand(ctx, elbow, wrist, rig[`c${side}`], far, direction, wounds[`h${side}`]);
  }
  function drawLeg(ctx, rig, side, fighter, far) {
    const palette = far ? PAL.far : PAL.near;
    const shorts = far ? fighter.col.far : fighter.col.near;
    const direction = rig.dir;
    const hip = rig.pel;
    const knee = rig[`k${side}`];
    const ankle = rig[`a${side}`];
    const wounds = fighter.wounds;
    const thighPath = limbPath(hip, knee, 9.6, 6.2, 1.8, 1.2, direction);
    fillLimb(ctx, thighPath, hip, knee, 8, palette, direction);
    limbWounds(ctx, wounds[`t${side}`], hip, knee, 8, direction, thighPath);
    const shinPath = limbPath(knee, ankle, 6, 3.6, 0.5, 2.4, direction);
    fillLimb(ctx, shinPath, knee, ankle, 5, palette, direction);
    limbWounds(ctx, wounds[`s${side}`], knee, ankle, 5, direction, shinPath);
    const kneeGradient = ctx.createRadialGradient(knee.x, knee.y, 0, knee.x, knee.y, 6);
    kneeGradient.addColorStop(0, palette.hi);
    kneeGradient.addColorStop(1, palette.mid);
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = kneeGradient;
    ctx.beginPath();
    ctx.arc(knee.x + direction * 1.2, knee.y, 5, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    drawFoot(ctx, ankle, side === 'N' ? rig.fdN : rig.fdF, direction, palette);

    const middle = { x: lerp(hip.x, knee.x, 0.62), y: lerp(hip.y, knee.y, 0.62) };
    const shortsPath = limbPath(hip, middle, 11, 9.8, 0.6, 0.6, direction);
    fillLimb(ctx, shortsPath, hip, middle, 10, shorts, direction);
    const dx = middle.x - hip.x;
    const dy = middle.y - hip.y;
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length;
    const uy = dy / length;
    ctx.strokeStyle = '#f2c230';
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(hip.x + ux * 6, hip.y + uy * 6);
    ctx.lineTo(middle.x - ux * 1.5, middle.y - uy * 1.5);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,.45)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(middle.x - uy * 10 * direction * -1, middle.y + ux * 10 * direction * -1);
    ctx.lineTo(middle.x + uy * 10 * direction * -1, middle.y - ux * 10 * direction * -1);
    ctx.stroke();
    if (!far) {
      const centerX = lerp(hip.x, middle.x, 0.5) + ux * 2;
      const centerY = lerp(hip.y, middle.y, 0.5) + uy * 2;
      const angle = Math.atan2(uy, ux);
      ctx.fillStyle = '#f2c230';
      ctx.beginPath();
      ctx.arc(centerX, centerY, 4.3, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, 4.3, angle, angle + Math.PI / 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, 4.3, angle + Math.PI, angle + Math.PI * 1.5);
      ctx.fill();
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.arc(centerX, centerY, 4.3, 0, TAU);
      ctx.stroke();
    }
  }
  function drawTorso(ctx, rig, fighter) {
    const neck = rig.neck;
    const pelvis = rig.pel;
    const direction = rig.dir;
    let ux = pelvis.x - neck.x;
    let uy = pelvis.y - neck.y;
    const length = Math.hypot(ux, uy) || 1;
    ux /= length;
    uy /= length;
    const scale = length / 54;
    ctx.save();
    ctx.transform(direction * uy, -direction * ux, ux * scale, uy * scale, neck.x, neck.y);
    const gradient = ctx.createLinearGradient(-12, 0, 13, 0);
    gradient.addColorStop(0, '#a8694a');
    gradient.addColorStop(0.3, '#d49c78');
    gradient.addColorStop(0.75, '#efc4a2');
    gradient.addColorStop(1, '#d9a07b');
    ctx.fillStyle = gradient;
    ctx.fill(TORSO);
    ctx.strokeStyle = PAL.near.line;
    ctx.lineWidth = 0.9;
    ctx.stroke(TORSO);
    ctx.save();
    ctx.clip(TORSO);
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
    for (const wound of fighter.wounds.torso) drawWound(ctx, wound, wound.x, wound.y);
    ctx.restore();
    const shorts = fighter.col.near;
    const shortsGradient = ctx.createLinearGradient(-12, 0, 11, 0);
    shortsGradient.addColorStop(0, shorts.lo);
    shortsGradient.addColorStop(0.6, shorts.mid);
    shortsGradient.addColorStop(1, shorts.hi);
    ctx.fillStyle = shortsGradient;
    ctx.beginPath();
    ctx.moveTo(-11.8, 43);
    ctx.lineTo(9.8, 43);
    ctx.lineTo(10.8, 57);
    ctx.lineTo(6, 62);
    ctx.lineTo(-4, 62.5);
    ctx.lineTo(-12.5, 57);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = shorts.line;
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.fillStyle = '#e9e2d2';
    ctx.fillRect(-11.6, 43, 21.2, 3);
    ctx.fillStyle = '#111';
    ctx.fillRect(-11.6, 46, 21.4, 1.2);
    ctx.restore();
  }
  function drawHead(ctx, rig, fighter) {
    const head = rig.head;
    const neck = rig.neck;
    const direction = rig.dir;
    let dx = neck.x - head.x;
    let dy = neck.y - head.y;
    const length = Math.hypot(dx, dy) || 1;
    dx /= length;
    dy /= length;
    const neckBase = { x: head.x + dx * 3, y: head.y + dy * 3 };
    const neckPath = limbPath(neck, neckBase, 5.8, 5.1, 0, 0, direction);
    fillLimb(ctx, neckPath, neck, neckBase, 5.4, PAL.near, direction);
    ctx.save();
    ctx.transform(direction * dy, -direction * dx, dx, dy, head.x, head.y);
    const gradient = ctx.createLinearGradient(-10, 0, 14, 0);
    gradient.addColorStop(0, '#c08560');
    gradient.addColorStop(0.35, '#e0aa86');
    gradient.addColorStop(0.8, '#f0c6a4');
    gradient.addColorStop(1, '#e2ac88');
    ctx.fillStyle = gradient;
    ctx.fill(HEAD);
    ctx.strokeStyle = PAL.near.line;
    ctx.lineWidth = 0.9;
    ctx.stroke(HEAD);
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
    let swelling = 0;
    for (const wound of fighter.wounds.head) if (wound.k === 'bruise' && wound.spot === 'eye' && !wound.old) swelling = Math.max(swelling, wound.v);
    const eyeOpen = clamp(1 - rig.ey * 0.92 - swelling * 0.55, 0, 1);
    ctx.fillStyle = 'rgba(100,55,45,.16)';
    ctx.beginPath();
    ctx.ellipse(6, -2.6, 4.4, 3.2, 0, 0, TAU);
    ctx.fill();
    if (eyeOpen < 0.18) {
      ctx.strokeStyle = '#2a1710';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(3.8, -2.1);
      ctx.quadraticCurveTo(6.2, -0.7, 8.7, -2.2);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#f4f0ea';
      ctx.beginPath();
      ctx.ellipse(6.3, -2.2, 2.8, 1.7 * eyeOpen, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#4a2c1a';
      ctx.beginPath();
      ctx.arc(7.3, -2.2, Math.min(1.35, 1.7 * eyeOpen), 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#050505';
      ctx.beginPath();
      ctx.arc(7.5, -2.2, 0.65, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(7.1, -2.9 * eyeOpen - 0.1, 0.55, 0.55);
      ctx.strokeStyle = '#2a1710';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.ellipse(6.3, -2.2, 2.9, 1.8 * eyeOpen, 0, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
    }
    ctx.strokeStyle = '#241710';
    ctx.lineWidth = 1.7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(2.6, -5.4 + (rig.mo > 0.7 ? 0.8 : 0));
    ctx.quadraticCurveTo(6, -7.2 + (rig.mo > 0.7 ? 1 : 0), 9.9, -5.4);
    ctx.stroke();
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
    ctx.fillStyle = 'rgba(40,25,18,.08)';
    ctx.beginPath();
    ctx.ellipse(3, 10.5, 7, 3.5, 0, 0, TAU);
    ctx.fill();
    if (rig.mo < 0.12) {
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
      const opening = rig.mo * 5.2;
      ctx.fillStyle = '#2b0d0d';
      ctx.beginPath();
      ctx.moveTo(7, 9.1);
      ctx.lineTo(11, 8.9);
      ctx.lineTo(10.4, 9.4 + opening);
      ctx.quadraticCurveTo(8.8, 10.4 + opening, 7.4, 9.6 + opening);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#f3eee4';
      ctx.fillRect(7.7, 9.1, 3, 1.5);
      ctx.fillStyle = '#8c2f33';
      ctx.beginPath();
      ctx.ellipse(8.8, 9 + opening, 1.6, 0.8, 0, 0, TAU);
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
      ctx.moveTo(7.2, 9.7 + opening);
      ctx.quadraticCurveTo(9, 10.6 + opening, 10.6, 9.5 + opening);
      ctx.stroke();
    }
    for (const wound of fighter.wounds.head) if (wound.k !== 'lip' && wound.k !== 'nose') drawWound(ctx, wound, wound.x, wound.y);
    ctx.restore();
    for (const wound of fighter.wounds.head) {
      if (wound.k === 'lip') {
        ctx.lineCap = 'round';
        ctx.strokeStyle = `rgba(160,18,26,${0.6 + 0.4 * wound.v})`;
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
        ctx.lineTo(9.3, 11.4 + wound.v * 14);
        ctx.stroke();
        ctx.fillStyle = 'rgba(125,8,12,.9)';
        ctx.beginPath();
        ctx.arc(9.3, 11.4 + wound.v * 14, 1.1, 0, TAU);
        ctx.fill();
      } else if (wound.k === 'nose') {
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(140,10,16,.9)';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(11.8, 6);
        ctx.lineTo(11.2, 9);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(11.2, 9.2);
        ctx.lineTo(10.6, 10.5 + wound.v * 8);
        ctx.stroke();
      }
    }
    const hairGradient = ctx.createLinearGradient(-10, -18, 8, -4);
    hairGradient.addColorStop(0, '#4d3526');
    hairGradient.addColorStop(1, '#1c120c');
    ctx.fillStyle = hairGradient;
    ctx.fill(HAIR);
    ctx.strokeStyle = 'rgba(0,0,0,.5)';
    ctx.lineWidth = 0.6;
    ctx.stroke(HAIR);
    ctx.strokeStyle = 'rgba(140,100,70,.35)';
    ctx.lineWidth = 0.6;
    for (let i = 0; i < 6; i += 1) {
      ctx.beginPath();
      ctx.moveTo(-9 + i * 0.8, -4 - i * 1.3);
      ctx.quadraticCurveTo(-3 + i * 2, -16 + i * 0.5, 6 + i * 0.7, -15 + i * 1.1);
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawFighter(ctx, fighter) {
    const rig = fighter.rig;
    if (!rig || !fighter.visible) return;
    const shadowX = (rig.aN.x + rig.aF.x + rig.pel.x) / 3;
    const heightRatio = clamp(fighter.state === 'ragdoll' ? (fighter.gy - rig.pel.y - 20) / 200 : fighter.y / 260, 0, 1);
    ctx.fillStyle = `rgba(0,0,0,${0.4 * (1 - heightRatio * 0.7)})`;
    ctx.beginPath();
    ctx.ellipse(shadowX, fighter.gy + 3, (fighter.state === 'ragdoll' ? 70 : 46) * (1 - heightRatio * 0.4), 8, 0, 0, TAU);
    ctx.fill();
    drawArm(ctx, rig, 'F', fighter, true);
    drawLeg(ctx, rig, 'F', fighter, true);
    drawTorso(ctx, rig, fighter);
    drawLeg(ctx, rig, 'N', fighter, false);
    drawHead(ctx, rig, fighter);
    drawArm(ctx, rig, 'N', fighter, false);
    if (fighter.marker && fighter.state !== 'ragdoll' && fighter.state !== 'getup') {
      const x = rig.head.x;
      const y = rig.head.y - 34 + Math.sin(fighter.t * 5) * 2;
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

  /* ============================ INJURIES ============================ */
  function injure(fighter, zone, power) {
    const random = Math.random;
    if (zone === 'head') {
      fighter.hits.head += 1;
      const spots = [['eye', 6.2, -2.6, 4.6], ['cheek', 3.5, 5, 4.8], ['jaw', 5.5, 11, 4.2], ['brow', 8, -5.6, 3.2], ['forehead', 2, -9.5, 4]];
      const spot = spots[(random() * spots.length) | 0];
      const existing = fighter.wounds.head.find((wound) => wound.k === 'bruise' && wound.spot === spot[0] && !wound.old);
      if (existing) {
        existing.v = Math.min(1, existing.v + 0.22 + power * 0.2);
        existing.r += 0.3;
      } else addWound(fighter, 'head', { k: 'bruise', x: spot[1], y: spot[2], r: spot[3], v: 0.45 + power * 0.3, spot: spot[0] });
      if ((fighter.hits.head >= 2 || power > 0.6) && random() < 0.5 + power * 0.3) {
        const lip = fighter.wounds.head.find((wound) => wound.k === 'lip');
        if (lip) lip.v = Math.min(1, lip.v + 0.25); else addWound(fighter, 'head', { k: 'lip', x: 10.5, y: 9.3, v: 0.35 + power * 0.3 });
      }
      if (random() < 0.25 + power * 0.25) {
        const nose = fighter.wounds.head.find((wound) => wound.k === 'nose');
        if (nose) nose.v = Math.min(1, nose.v + 0.25); else addWound(fighter, 'head', { k: 'nose', x: 12, y: 5.4, v: 0.4 + power * 0.3 });
      }
      if (random() < 0.25 + power * 0.3) addWound(fighter, 'head', { k: 'cut', x: 8.2 + random() * 0.5, y: -5.6 + random() * 1.4, r: 2.6 + random() * 1.6, v: 0.5 + random() * 0.4 });
      if (random() < 0.4) addWound(fighter, 'head', { k: 'blood', x: rnd(0, 9), y: rnd(-4, 11), r: rnd(1.5, 3.4), v: rnd(0.3, 0.9) });
      if (power > 0.8 && fighter.hits.head > 3) addWound(fighter, 'head', { k: 'gash', x: rnd(1, 6), y: rnd(-9, -6), r: 3.4, v: 1 });
    } else if (zone === 'torso') {
      fighter.hits.torso += 1;
      addWound(fighter, 'torso', { k: 'bruise', x: rnd(0, 8), y: rnd(12, 42), r: rnd(3.5, 6), v: 0.5 + power * 0.4 });
      if (power > 0.5 && random() < 0.6) addWound(fighter, 'torso', { k: random() < 0.5 ? 'cut' : 'scratch', x: rnd(-2, 8), y: rnd(14, 40), r: rnd(3, 6), v: 0.7 });
      if (fighter.hp < 70 && random() < 0.6) addWound(fighter, 'torso', { k: 'blood', x: rnd(-2, 8), y: rnd(14, 40), r: rnd(2, 4.5), v: rnd(0.4, 1) });
    } else {
      const side = random() < 0.5 ? 'N' : 'F';
      addWound(fighter, `s${side}`, { k: 'bruise', t: rnd(0.2, 0.7), s: rnd(-0.4, 0.4), r: rnd(3, 5), v: 0.6 + power * 0.3 });
      addWound(fighter, `t${side}`, { k: 'abr', t: rnd(0.7, 1), s: rnd(-0.4, 0.4), r: rnd(2.5, 4), v: 0.7 });
    }
  }

  /* ============================ FX ============================ */
  function makeSprite(rgb) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 32);
    gradient.addColorStop(0, `rgba(${rgb},.9)`);
    gradient.addColorStop(0.5, `rgba(${rgb},.45)`);
    gradient.addColorStop(1, `rgba(${rgb},0)`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    return canvas;
  }
  const SPR = [makeSprite('205,195,178'), makeSprite('150,150,158'), makeSprite('70,66,74')];
  class FX {
    constructor() {
      this.sm = [];
      this.bl = [];
      this.sp = [];
      this.fl = [];
      this.rg = [];
      this.decal = null;
      this.floorY = 468;
    }
    smoke(x, y, vx, vy, r, growth, life, alpha, sprite) {
      if (this.sm.length > 200) this.sm.shift();
      this.sm.push({ x, y, vx, vy, r, gr: growth, life, max: life, a: alpha, spr: sprite || 0 });
    }
    landing(x, y, power = 1) {
      for (let i = 0; i < 9 * power; i += 1) this.smoke(x + rnd(-16, 16), y - 2, (i % 2 ? 1 : -1) * rnd(40, 190) * power, -rnd(4, 26), rnd(7, 14), rnd(18, 38), rnd(0.5, 0.95), 0.55);
      this.rg.push({ x, y, r: 6, life: 0.35, max: 0.35, w: 90 * power });
    }
    step(x, y, direction) {
      for (let i = 0; i < 2; i += 1) this.smoke(x, y - 1, -direction * rnd(10, 50), -rnd(4, 16), rnd(3.5, 6), rnd(12, 20), rnd(0.3, 0.5), 0.4);
    }
    dash(x, y, direction) {
      this.smoke(x - direction * rnd(0, 16), y - 3, -direction * rnd(60, 190), -rnd(2, 20), rnd(6, 11), rnd(20, 34), rnd(0.35, 0.6), 0.5);
    }
    puff(x, y, amount, scale) {
      for (let i = 0; i < amount; i += 1) this.smoke(x + rnd(-6, 6), y + rnd(-6, 6), rnd(-40, 40), -rnd(10, 40), rnd(3, 6) * (scale || 1), rnd(10, 20), rnd(0.4, 0.7), 0.45);
    }
    blood(x, y, direction, amount, power) {
      for (let i = 0; i < amount; i += 1) {
        const mist = Math.random() < 0.4;
        this.bl.push({ x, y, vx: direction * rnd(60, 440) * (0.4 + power) + rnd(-90, 90), vy: -rnd(20, 340), r: mist ? rnd(0.6, 1.2) : rnd(1.3, 3), fy: this.floorY + rnd(-8, 28), life: 2 });
      }
    }
    drip(x, y) { this.bl.push({ x, y, vx: rnd(-12, 12), vy: rnd(0, 30), r: rnd(1.2, 2), fy: this.floorY + rnd(-4, 26), life: 2 }); }
    teeth(x, y, direction) {
      for (let i = 0; i < 2; i += 1) this.bl.push({ x, y, vx: direction * rnd(100, 300), vy: -rnd(150, 350), r: 1.6, fy: this.floorY + rnd(0, 20), life: 2, tooth: true });
    }
    spark(x, y, amount, color) {
      for (let i = 0; i < amount; i += 1) {
        const angle = rnd(TAU);
        const speed = rnd(80, 380);
        this.sp.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: rnd(0.15, 0.35), col: color || '255,210,90' });
      }
    }
    impact(x, y, direction, power) {
      this.fl.push({ x, y, life: 0.16, max: 0.16, r: 24 + power * 30 });
      this.spark(x, y, 6 + (power * 8 | 0));
    }
    stamp(x, y, radius) {
      const decal = this.decal;
      if (!decal) return;
      decal.fillStyle = 'rgba(105,6,10,.55)';
      decal.beginPath();
      decal.ellipse(x, y, radius * 1.8 + 1, radius * 0.7 + 0.5, 0, 0, TAU);
      decal.fill();
      if (radius > 1.8) {
        decal.fillStyle = 'rgba(70,0,4,.35)';
        decal.beginPath();
        decal.ellipse(x + radius, y, radius * 2.6, radius * 0.5, 0, 0, TAU);
        decal.fill();
      }
    }
    pool(x, y, radius) {
      const decal = this.decal;
      if (!decal) return;
      decal.fillStyle = 'rgba(100,5,8,.3)';
      decal.beginPath();
      decal.ellipse(x + rnd(-4, 4), y, radius * 1.7, radius * 0.55, 0, 0, TAU);
      decal.fill();
    }
    crack(x, y, direction) {
      const decal = this.decal;
      if (!decal) return;
      decal.strokeStyle = 'rgba(0,0,0,.65)';
      decal.lineWidth = 1.3;
      for (let k = 0; k < 4; k += 1) {
        let currentX = x;
        let currentY = y;
        decal.beginPath();
        decal.moveTo(currentX, currentY);
        for (let i = 0; i < 7; i += 1) {
          currentX += (direction * (k < 2 ? 1 : -1)) * rnd(8, 18);
          currentY += rnd(-4, 4);
          decal.lineTo(currentX, currentY);
        }
        decal.stroke();
      }
    }
    update(dt) {
      for (const smoke of this.sm) {
        smoke.x += smoke.vx * dt;
        smoke.y += smoke.vy * dt;
        smoke.vx *= 0.96;
        smoke.vy *= 0.96;
        smoke.r += smoke.gr * dt;
        smoke.life -= dt;
      }
      this.sm = this.sm.filter((smoke) => smoke.life > 0);
      for (const blood of this.bl) {
        blood.vy += 1600 * dt;
        blood.x += blood.vx * dt;
        blood.y += blood.vy * dt;
        blood.life -= dt;
        if (blood.y >= blood.fy) {
          if (!blood.tooth) this.stamp(blood.x, blood.fy, blood.r);
          blood.dead = true;
        }
      }
      this.bl = this.bl.filter((blood) => !blood.dead && blood.life > 0);
      for (const spark of this.sp) {
        spark.x += spark.vx * dt;
        spark.y += spark.vy * dt;
        spark.vy += 500 * dt;
        spark.life -= dt;
      }
      this.sp = this.sp.filter((spark) => spark.life > 0);
      for (const flash of this.fl) flash.life -= dt;
      this.fl = this.fl.filter((flash) => flash.life > 0);
      for (const ring of this.rg) {
        ring.life -= dt;
        ring.r += ring.w * dt / ring.max;
      }
      this.rg = this.rg.filter((ring) => ring.life > 0);
    }
    draw(ctx) {
      for (const smoke of this.sm) {
        ctx.globalAlpha = Math.min(1, smoke.life / smoke.max * 1.6) * smoke.a;
        ctx.drawImage(SPR[smoke.spr], smoke.x - smoke.r, smoke.y - smoke.r, smoke.r * 2, smoke.r * 2);
      }
      ctx.globalAlpha = 1;
      for (const ring of this.rg) {
        ctx.strokeStyle = `rgba(220,205,185,${ring.life / ring.max * 0.5})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(ring.x, ring.y, ring.r, ring.r * 0.16, 0, 0, TAU);
        ctx.stroke();
      }
      ctx.lineCap = 'round';
      for (const blood of this.bl) {
        ctx.strokeStyle = blood.tooth ? '#f1ece0' : 'rgba(140,10,14,.95)';
        ctx.lineWidth = blood.r * 1.6;
        ctx.beginPath();
        ctx.moveTo(blood.x, blood.y);
        ctx.lineTo(blood.x - blood.vx * 0.018, blood.y - blood.vy * 0.018);
        ctx.stroke();
      }
      for (const flash of this.fl) {
        const k = flash.life / flash.max;
        const radius = flash.r * (1.3 - k * 0.5);
        const gradient = ctx.createRadialGradient(flash.x, flash.y, 0, flash.x, flash.y, radius);
        gradient.addColorStop(0, `rgba(255,255,255,${k})`);
        gradient.addColorStop(0.4, `rgba(255,190,80,${k * 0.7})`);
        gradient.addColorStop(1, 'rgba(255,100,0,0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(flash.x, flash.y, radius, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = `rgba(255,240,200,${k})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < 6; i += 1) {
          const angle = i * 1.047 + flash.x;
          ctx.moveTo(flash.x + Math.cos(angle) * radius * 0.3, flash.y + Math.sin(angle) * radius * 0.3);
          ctx.lineTo(flash.x + Math.cos(angle) * radius * 1.1, flash.y + Math.sin(angle) * radius * 1.1);
        }
        ctx.stroke();
      }
      for (const spark of this.sp) {
        ctx.strokeStyle = `rgba(${spark.col},${clamp(spark.life * 5, 0, 1)})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(spark.x, spark.y);
        ctx.lineTo(spark.x - spark.vx * 0.03, spark.y - spark.vy * 0.03);
        ctx.stroke();
      }
    }
  }

  /* ============================ RAGDOLL ============================ */
  const RK = ['head', 'neck', 'pel', 'eN', 'wN', 'eF', 'wF', 'kN', 'aN', 'kF', 'aF'];
  const RAD_R = { head: 12, neck: 5, pel: 8, eN: 4, wN: 5, eF: 4, wF: 5, kN: 6, aN: 7, kF: 6, aF: 7 };
  const DC = [['head', 'neck', NECKH], ['neck', 'pel', TORSO_L], ['eN', 'neck', UA], ['wN', 'eN', FA], ['eF', 'neck', UA], ['wF', 'eF', FA], ['kN', 'pel', THIGH], ['aN', 'kN', SHIN], ['kF', 'pel', THIGH], ['aF', 'kF', SHIN]];
  const DMIN = [['head', 'pel', 58, 76], ['aN', 'pel', 30, 92], ['aF', 'pel', 30, 92], ['wN', 'neck', 22, 60], ['wF', 'neck', 22, 60], ['kN', 'neck', 40, 200], ['kF', 'neck', 40, 200]];
  const SEGS = [['neck', 'pel', 10], ['pel', 'kN', 8.5], ['pel', 'kF', 8.5], ['kN', 'aN', 6], ['kF', 'aF', 6], ['neck', 'eN', 5.5], ['neck', 'eF', 5.5], ['eN', 'wN', 4.6], ['eF', 'wF', 4.6]];
  const PTS = [['head', 12], ['eN', 4.5], ['wN', 5], ['eF', 4.5], ['wF', 5], ['kN', 6], ['aN', 5.5], ['kF', 6], ['aF', 5.5]];
  const NEIGH = { head: ['neck'], eN: ['neck', 'wN'], wN: ['eN'], eF: ['neck', 'wF'], wF: ['eF'], kN: ['pel', 'aN'], aN: ['kN'], kF: ['pel', 'aF'], aF: ['kF'] };
  const HSTEP = 1 / 120;
  class Ragdoll {
    constructor(rig, fighter) {
      this.f = fighter;
      this.dir = fighter.dir;
      this.t = 0;
      this.acc = 0;
      this.settle = 0;
      this.imp = 0;
      this.points = {};
      for (const key of RK) this.points[key] = { x: rig[key].x, y: rig[key].y, px: rig[key].x, py: rig[key].y, r: RAD_R[key] };
    }
    launch(vx, vy) {
      const points = this.points;
      const direction = this.dir;
      const spin = -direction * rnd(2.5, 5) * (vy > 300 ? 1 : 0.5);
      for (const key of RK) {
        const point = points[key];
        const rx = point.x - points.pel.x;
        const ry = point.y - points.pel.y;
        const ax = vx - ry * spin + rnd(-60, 60);
        const ay = -vy + rx * spin + rnd(-60, 60);
        point.px = point.x - ax * HSTEP;
        point.py = point.y - ay * HSTEP;
      }
    }
    update(dt) {
      this.t += dt;
      this.imp -= dt;
      this.acc += dt;
      let steps = 0;
      while (this.acc >= HSTEP && steps < 6) {
        this.step();
        this.acc -= HSTEP;
        steps += 1;
      }
      if (steps >= 6) this.acc = 0;
      let speed = 0;
      for (const key of RK) {
        const point = this.points[key];
        speed += Math.abs(point.x - point.px) + Math.abs(point.y - point.py);
      }
      speed /= RK.length;
      if (speed < 0.28) this.settle += dt; else this.settle = 0;
    }
    step() {
      const points = this.points;
      const fighter = this.f;
      const gravity = 1900 * HSTEP * HSTEP;
      const groundY = fighter.gy;
      for (const key of RK) {
        const point = points[key];
        const vx = (point.x - point.px) * 0.9985;
        const vy = (point.y - point.py) * 0.9985;
        point.px = point.x;
        point.py = point.y;
        point.x += vx;
        point.y += vy + gravity;
      }
      for (let iteration = 0; iteration < 5; iteration += 1) {
        for (const [a, b, length] of DC) {
          const first = points[a];
          const second = points[b];
          const dx = second.x - first.x;
          const dy = second.y - first.y;
          const distance = Math.hypot(dx, dy) || 1e-4;
          const correction = (distance - length) / distance * 0.5;
          first.x += dx * correction;
          first.y += dy * correction;
          second.x -= dx * correction;
          second.y -= dy * correction;
        }
        for (const [a, b, min, max] of DMIN) {
          const first = points[a];
          const second = points[b];
          const dx = second.x - first.x;
          const dy = second.y - first.y;
          const distance = Math.hypot(dx, dy) || 1e-4;
          let target = 0;
          if (distance < min) target = min; else if (distance > max) target = max; else continue;
          const correction = (distance - target) / distance * 0.5;
          first.x += dx * correction;
          first.y += dy * correction;
          second.x -= dx * correction;
          second.y -= dy * correction;
        }
        this.limit(points.pel, points.kN, points.aN, this.dir);
        this.limit(points.pel, points.kF, points.aF, this.dir);
        this.limit(points.neck, points.eN, points.wN, -this.dir);
        this.limit(points.neck, points.eF, points.wF, -this.dir);
        for (const [pointName, pointRadius] of PTS) {
          const point = points[pointName];
          const neighbors = NEIGH[pointName];
          for (const [segmentA, segmentB, segmentRadius] of SEGS) {
            if (pointName === segmentA || pointName === segmentB) continue;
            const first = points[segmentA];
            const second = points[segmentB];
            const sx = second.x - first.x;
            const sy = second.y - first.y;
            const lengthSquared = sx * sx + sy * sy || 1;
            let t = clamp(((point.x - first.x) * sx + (point.y - first.y) * sy) / lengthSquared, 0, 1);
            if (neighbors.includes(segmentA) && t < 0.35) continue;
            if (neighbors.includes(segmentB) && t > 0.65) continue;
            const closestX = first.x + sx * t;
            const closestY = first.y + sy * t;
            const dx = point.x - closestX;
            const dy = point.y - closestY;
            const distance = Math.hypot(dx, dy) || 1e-4;
            const minimum = pointRadius + segmentRadius;
            if (distance < minimum) {
              const push = minimum - distance;
              const nx = dx / distance;
              const ny = dy / distance;
              point.x += nx * push * 0.6;
              point.y += ny * push * 0.6;
              first.x -= nx * push * 0.2 * (1 - t);
              first.y -= ny * push * 0.2 * (1 - t);
              second.x -= nx * push * 0.2 * t;
              second.y -= ny * push * 0.2 * t;
            }
          }
        }
        for (const [a, b, minimum] of [['wN', 'wF', 8], ['kN', 'kF', 10], ['aN', 'aF', 11], ['kN', 'aF', 9], ['kF', 'aN', 9], ['wN', 'head', 16], ['wF', 'head', 16]]) {
          const first = points[a];
          const second = points[b];
          const dx = second.x - first.x;
          const dy = second.y - first.y;
          const distance = Math.hypot(dx, dy) || 1e-4;
          if (distance < minimum) {
            const correction = (distance - minimum) / distance * 0.5;
            first.x += dx * correction;
            first.y += dy * correction;
            second.x -= dx * correction;
            second.y -= dy * correction;
          }
        }
        for (const key of RK) {
          const point = points[key];
          const limit = groundY - point.r;
          if (point.y > limit) {
            const velocityY = point.y - point.py;
            if (velocityY > 2.4 && this.imp <= 0) this.impact(point, velocityY);
            point.y = limit;
            point.py = point.y + velocityY * 0.22;
            point.px += (point.x - point.px) * 0.22;
          }
          if (point.x < fighter.minX - 30) {
            point.x = fighter.minX - 30;
            point.px = point.x;
          }
          if (point.x > fighter.maxX + 30) {
            point.x = fighter.maxX + 30;
            point.px = point.x;
          }
        }
      }
    }
    limit(a, b, c, sign) {
      const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      if (cross * sign < -3) {
        const ux = c.x - a.x;
        const uy = c.y - a.y;
        const length = Math.hypot(ux, uy) || 1;
        const nx = ux / length;
        const ny = uy / length;
        const vx = b.x - a.x;
        const vy = b.y - a.y;
        const projection = vx * nx + vy * ny;
        const reflectedX = a.x + 2 * projection * nx - vx;
        const reflectedY = a.y + 2 * projection * ny - vy;
        const dx = reflectedX - b.x;
        const dy = reflectedY - b.y;
        b.x = reflectedX;
        b.y = reflectedY;
        b.px += dx;
        b.py += dy;
      }
    }
    impact(point, velocityY) {
      this.imp = 0.14;
      const fighter = this.f;
      if (fighter.fx) fighter.fx.landing(point.x, fighter.gy, clamp(velocityY / 5, 0.5, 1.5));
      Snd.thud();
      if (fighter.onShake) fighter.onShake(velocityY * 1.5);
      fighter.ragInjury(velocityY);
    }
    toRig(fighter) {
      const points = this.points;
      const rig = { dir: fighter.dir };
      for (const key of RK) rig[key] = points[key];
      rig.sh = { x: lerp(points.neck.x, points.pel.x, 0.07), y: lerp(points.neck.y, points.pel.y, 0.07) };
      rig.fdN = footDirectionRag(points.kN, points.aN, fighter.dir);
      rig.fdF = footDirectionRag(points.kF, points.aF, fighter.dir);
      rig.cN = 0.35;
      rig.cF = 0.35;
      rig.mo = 0.5;
      rig.ey = fighter.hp <= 0 ? 1 : 0.75;
      return rig;
    }
  }

  /* ============================ FIGHTER ============================ */
  class Fighter {
    constructor(options) {
      Object.assign(this, { isAI: false, marker: false, col: COL_BLUE, fx: null, gy: 468, minX: 60, maxX: 900, spawnY: 620, name: 'TEST DUMMY' }, options);
      this.wounds = newWounds();
      this.hits = { head: 0, torso: 0 };
      this.seed = Math.random() * 10;
      this.ctrl = { mx: 0, jump: false, punch: false, a1: false, a2: false };
      this.reset(options.x || 300, options.dir || 1);
    }
    reset(x, direction) {
      Object.assign(this, { x, y: 0, vx: 0, vy: 0, dir: direction, hp: 100, state: 'idle', st: 0, t: 0, walkPh: 0, comboStep: 0, comboT: 9, cd1: 0, cd2: 0, dashCD: 0, invT: 0, landT: 0, stunT: 0, cur: null, blend: 0, visible: true, rig: null, atk: null, ab: 0, ak: 0, atkStamp: 0, connected: false, bleedT: 0, lastSign: 1, rag: null, hitZone: 'head', poolT: 0, sp: 0, spT: 0, dashW: 0, dashF: true, dashT: 0, hitDone: false, queued: false, lungeDone: false, wh: false, sfx: false, dustT: 0 });
    }
    spawn(delay) {
      this.state = 'spawn';
      this.sp = 0;
      this.spT = delay;
      this.visible = false;
      this.y = this.spawnY;
      this.vy = 0;
      this.vx = 0;
      this.st = 0;
      this.cur = null;
    }
    canBeHit() { return this.state !== 'ragdoll' && this.state !== 'getup' && this.state !== 'spawn' && this.state !== 'win' && this.invT <= 0; }
    faceOpp(opponent) { if (opponent && this.y < 2 && Math.abs(opponent.x - this.x) > 10) this.dir = opponent.x > this.x ? 1 : -1; }
    speedMul() { return this.hp < 30 ? 0.85 : 1; }
    startAttack(index) { this.state = 'attack'; this.atk = ATK[index]; this.ak = index; this.st = 0; this.hitDone = false; this.queued = false; this.lungeDone = false; this.connected = false; this.wh = false; this.atkStamp += 1; }
    startJump() { this.vy = 770; this.y = 0.5; this.state = 'air'; this.st = 0; if (this.fx) this.fx.landing(this.x, this.gy, 0.5); }
    startDash(weight) {
      this.state = 'dash';
      this.st = 0;
      this.dashF = weight > 0;
      this.dashW = weight * this.dir;
      this.dashT = weight > 0 ? 0.24 : 0.27;
      this.dashCD = 0.6;
      this.dashDust = 0;
      if (weight < 0) this.invT = 0.22;
      Snd.whoosh();
    }
    startAbility(number) { this.state = 'ability'; this.ab = number; this.st = 0; this.hitDone = false; this.sfx = false; if (number === 1) this.cd1 = 7; else this.cd2 = 9; }
    onLand(impact) {
      this.landT = 0.12;
      this.vx *= 0.35;
      if (this.fx) this.fx.landing(this.x, this.gy, clamp(impact / 700, 0.5, 1.2));
      if (impact > 400) Snd.thud();
      if (this.state === 'air' || this.state === 'dash' || (this.state === 'attack' && this.atk.air)) {
        this.state = 'idle';
        this.st = 0;
        this.comboT = 9;
      }
    }
    tryHit(attack, opponent) {
      if (!opponent || !opponent.canBeHit()) return false;
      const distance = (opponent.x - this.x) * this.dir;
      if (distance < -20 || distance > attack.reach + 14) return false;
      const low = this.y + attack.y[0];
      const high = this.y + attack.y[1];
      const overlap = Math.min(high, opponent.y + 185) - Math.max(low, opponent.y + 55);
      if (overlap < 20) return false;
      opponent.takeHit(this, attack);
      return true;
    }
    takeHit(attacker, attack) {
      this.hp = Math.max(0, this.hp - attack.dmg);
      const hitX = this.x - attacker.dir * 10;
      const hitY = this.gy - this.y - (attack.zone === 'head' ? 152 : attack.zone === 'torso' ? 112 : 34);
      Game.hitFX(attacker, this, attack, hitX, hitY);
      injure(this, attack.zone, attack.pw);
      attacker.handDamage(attack, this);
      if (this.hp <= 0) {
        Game.ko(this, attacker, attack);
        return;
      }
      if (attack.launch || this.y > 8) this.toRagdoll(attacker.dir * (attack.lvx || 200), attack.lvy || 420);
      else {
        this.state = 'hit';
        this.st = 0;
        this.stunT = attack.stun;
        this.hitZone = attack.zone === 'head' ? 'head' : 'body';
        this.vx = attacker.dir * attack.kb;
        this.invT = 0;
        if (attack.pull) this.x = clamp(attacker.x + attacker.dir * attack.pull, this.minX, this.maxX);
      }
    }
    handDamage(attack, victim) {
      if (!attack.fist) return;
      const side = attack.fist;
      const bloody = victim.wounds.head.some((wound) => wound.k === 'lip' || wound.k === 'nose') || Math.random() < 0.25;
      if (Math.random() < 0.4 * attack.pw) addWound(this, `h${side}`, { k: 'split', x: 9.4, y: -1.6, r: 1.6 + Math.random(), v: 1 });
      if (bloody && attack.zone === 'head') {
        addWound(this, `h${side}`, { k: 'blood', x: 6, y: 0, r: rnd(3, 4.5), v: rnd(0.5, 1) });
        if (Math.random() < 0.6) addWound(this, `f${side}`, { k: 'blood', t: rnd(0.5, 0.9), s: rnd(-0.5, 0.5), r: rnd(2.5, 4), v: rnd(0.4, 1) });
      }
    }
    toRagdoll(vx, vy) {
      if (!this.rig) return;
      this.rag = new Ragdoll(this.rig, this);
      this.rag.launch(vx, vy);
      this.state = 'ragdoll';
      this.st = 0;
      this.y = 0;
      this.vx = 0;
      this.vy = 0;
      this.invT = 0;
      if (this.fx) this.fx.landing(this.x, this.gy, 0.6);
    }
    ragInjury(speed) {
      if (speed < 3.2) return;
      const parts = ['uN', 'fN', 'tN', 'sN', 'fF', 'sF', 'torso'];
      const part = parts[(Math.random() * parts.length) | 0];
      if (part === 'torso') addWound(this, 'torso', { k: 'abr', x: rnd(-6, 8), y: rnd(8, 40), r: rnd(3, 5), v: 0.7 });
      else addWound(this, part, { k: Math.random() < 0.5 ? 'abr' : 'scratch', t: rnd(0.2, 0.9), s: rnd(-0.6, 0.6), r: rnd(3, 5), v: 0.7 });
      if (this.hp < 60 && Math.random() < 0.5 && this.fx) {
        const rig = this.rig;
        if (rig) this.fx.blood(rig.pel.x, rig.pel.y, this.dir, 4, 0.3);
      }
    }
    startGetup() {
      const rig = this.rag.toRig(this);
      this.blendFrom = rig;
      this.x = clamp(this.rag.points.pel.x, this.minX, this.maxX);
      this.rag = null;
      this.state = 'getup';
      this.st = 0;
      this.blend = 0.3;
      this.cur = null;
      this.dustT = 0;
    }
    update(dt, opponent) {
      this.t += dt;
      this.st += dt;
      const controls = this.ctrl;
      this.cd1 = Math.max(0, this.cd1 - dt);
      this.cd2 = Math.max(0, this.cd2 - dt);
      this.dashCD = Math.max(0, this.dashCD - dt);
      if (this.invT > 0) this.invT -= dt;
      if (this.landT > 0) this.landT -= dt;
      if (this.blend > 0) this.blend -= dt;
      if (this.state !== 'attack') this.comboT += dt;
      if (this.state !== 'ragdoll' && this.state !== 'spawn' && (this.y > 0 || this.vy > 0)) {
        this.vy -= 2200 * dt;
        this.y += this.vy * dt;
        if (this.y <= 0) {
          const impact = -this.vy;
          this.y = 0;
          this.vy = 0;
          this.onLand(impact);
        }
      }
      switch (this.state) {
        case 'spawn':
          this.spT -= dt;
          if (this.sp === 0) {
            if (this.spT <= 0) {
              this.sp = 1;
              this.visible = true;
              this.y = this.spawnY;
              this.vy = 0;
              Snd.spawn();
            }
          } else if (this.sp === 1) {
            this.vy -= 2600 * dt;
            this.y += this.vy * dt;
            if (this.fx && Math.random() < 0.5 && this.rig) this.fx.spark(this.rig.pel.x + rnd(-20, 20), this.rig.pel.y + rnd(-60, 60), 1, '120,200,255');
            if (this.y <= 0) {
              this.y = 0;
              this.vy = 0;
              this.sp = 2;
              this.spT = 0.6;
              this.st = 0;
              if (this.fx) {
                this.fx.landing(this.x, this.gy, 1.9);
                for (let i = 0; i < 8; i += 1) this.fx.smoke(this.x + rnd(-20, 20), this.gy - rnd(0, 20), rnd(-60, 60), -rnd(20, 90), rnd(12, 22), rnd(20, 40), rnd(0.8, 1.4), 0.5, 1);
                this.fx.crack(this.x, this.gy + 8, 1);
              }
              Snd.stomp();
              if (this.onShake) this.onShake(10);
            }
          } else if (this.sp === 2) {
            if (this.spT <= 0) {
              this.sp = 3;
              this.spT = 0.55;
            }
          } else if (this.spT <= 0) {
            this.state = 'idle';
            this.st = 0;
          }
          break;
        case 'idle': {
          this.faceOpp(opponent);
          const move = controls.mx;
          const toward = move * this.dir;
          const speed = move ? (toward > 0 ? 235 : 185) : 0;
          this.vx += (move * speed * this.speedMul() - this.vx) * Math.min(1, dt * 14);
          if (Math.abs(this.vx) > 8) {
            this.walkPh += (this.vx * this.dir >= 0 ? 1 : -1) * Math.abs(this.vx) * dt * 0.08;
            const sign = Math.sin(this.walkPh) > 0 ? 1 : -1;
            if (sign !== this.lastSign) {
              this.lastSign = sign;
              if (Math.abs(this.vx) > 120 && this.fx) this.fx.step(this.x - this.dir * 10, this.gy, this.dir * (this.vx * this.dir >= 0 ? 1 : -1));
            }
          }
          if (controls.jump) {
            if (move && this.dashCD <= 0) this.startDash(toward > 0 ? 1 : -1); else if (!move) this.startJump();
          } else if (controls.punch) this.startAttack(this.comboT < 0.6 ? this.comboStep : 0);
          else if (controls.a1 && this.cd1 <= 0) this.startAbility(1);
          else if (controls.a2 && this.cd2 <= 0) this.startAbility(2);
          break;
        }
        case 'air':
          this.vx += (controls.mx * 215 - this.vx) * Math.min(1, dt * 2.5);
          if (controls.punch) this.startAttack(4);
          break;
        case 'dash': {
          const factor = 1 - this.st / this.dashT * 0.5;
          this.vx = this.dashW * (this.dashF ? 840 : 620) * factor;
          this.dashDust -= dt;
          if (this.dashDust <= 0 && this.fx) {
            this.dashDust = 0.035;
            this.fx.dash(this.x, this.gy, this.dashW);
          }
          if (this.st >= this.dashT) {
            this.state = 'idle';
            this.st = 0;
            this.vx *= 0.3;
          }
          break;
        }
        case 'attack': {
          const attack = this.atk;
          if (controls.punch && !attack.air) this.queued = true;
          if (!this.lungeDone && this.st >= attack.lt) {
            this.lungeDone = true;
            if (attack.lunge) this.vx = this.dir * attack.lunge;
          }
          if (!attack.air || this.y <= 0) this.vx *= Math.exp(-dt * 9);
          if (!this.wh && this.st >= attack.hs - 0.03) {
            this.wh = true;
            Snd.whoosh();
          }
          if (!this.hitDone && this.st >= attack.hs && this.st <= attack.he) {
            if (this.tryHit(attack, opponent)) {
              this.hitDone = true;
              this.connected = true;
            }
          }
          if (this.st > attack.he) this.hitDone = true;
          if (this.queued && this.st >= attack.cancel && this.ak < 3 && !attack.air) {
            this.startAttack(this.ak + 1);
            break;
          }
          if (this.st >= attack.dur) {
            this.comboStep = this.ak < 3 && !attack.air ? this.ak + 1 : 0;
            this.comboT = 0;
            this.state = this.y > 0 ? 'air' : 'idle';
            this.st = 0;
          }
          break;
        }
        case 'ability':
          if (this.ab === 1) {
            if (this.st >= 0.28 && this.st < 0.64) {
              if (!this.sfx) {
                this.sfx = true;
                Snd.ram();
                if (this.onShake) this.onShake(4);
              }
              this.vx = this.dir * 820;
              if (this.fx && Math.random() < 0.7) this.fx.dash(this.x, this.gy, this.dir);
              if (!this.hitDone && this.tryHit(Object.assign({}, A1, A1H), opponent)) {
                this.hitDone = true;
                this.vx *= 0.2;
              }
            } else this.vx *= Math.exp(-dt * 10);
            if (this.st >= 1) {
              this.state = 'idle';
              this.st = 0;
              this.comboT = 9;
            }
          } else {
            this.vx *= Math.exp(-dt * 12);
            if (!this.hitDone && this.st >= 0.44) {
              this.hitDone = true;
              if (Game.wave) Game.wave(this);
            }
            if (this.st >= 0.9) {
              this.state = 'idle';
              this.st = 0;
              this.comboT = 9;
            }
          }
          break;
        case 'hit':
          this.vx *= Math.exp(-dt * 8);
          if (this.st >= this.stunT) {
            this.state = 'idle';
            this.st = 0;
          }
          break;
        case 'ragdoll': {
          const ragdoll = this.rag;
          ragdoll.update(dt);
          this.x = clamp(ragdoll.points.pel.x, this.minX, this.maxX);
          if (this.hp < 75 && ragdoll.settle > 0.1) {
            this.poolT -= dt;
            if (this.poolT <= 0 && this.fx) {
              this.poolT = 0.18;
              this.fx.pool(ragdoll.points.pel.x, this.gy + rnd(2, 12), clamp((75 - this.hp) / 10, 2, 9));
            }
          }
          if (this.hp > 0 && ragdoll.t > 0.9 && ragdoll.settle > 0.35) this.startGetup();
          else if (this.hp > 0 && ragdoll.t > 4.5) this.startGetup();
          break;
        }
        case 'getup':
          this.vx = 0;
          if (this.st > 2.05 && this.st < 2.65) {
            this.dustT -= dt;
            if (this.dustT <= 0 && this.rig && this.fx) {
              this.dustT = 0.1;
              this.fx.puff(lerp(this.rig.sh.x, this.rig.pel.x, 0.4) + this.dir * 8, lerp(this.rig.sh.y, this.rig.pel.y, 0.4), 2, 0.9);
            }
          }
          if (this.st >= GETUP_DUR) {
            this.state = 'idle';
            this.st = 0;
            this.invT = 0.45;
            this.comboT = 9;
          }
          break;
        default:
          break;
      }
      if (this.state !== 'ragdoll') {
        this.x += this.vx * dt;
        this.x = clamp(this.x, this.minX, this.maxX);
      }
      controls.jump = false;
      controls.punch = false;
      controls.a1 = false;
      controls.a2 = false;
      if (this.hp < 55 && this.hp > 0 && this.fx && this.rig && this.state !== 'spawn') {
        this.bleedT -= dt;
        if (this.bleedT <= 0) {
          this.bleedT = rnd(0.3, 0.7) * (1 + this.hp / 55);
          const head = this.rig.head;
          this.fx.drip(head.x + this.dir * 8, head.y + 8);
        }
      }
      this.buildRig(dt);
    }
    targetPose() {
      const state = this.state;
      const time = this.t;
      switch (state) {
        case 'spawn': {
          if (this.sp < 3) {
            const pose = Object.assign({}, T_POSE);
            if (this.sp === 2) {
              pose.H += Math.sin(this.st * 38) * 1.2 * (this.spT / 0.6);
              pose.tl += Math.sin(this.st * 30) * 2 * (this.spT / 0.6);
            }
            pose.ey = 0;
            return pose;
          }
          return mix(T_POSE, D, ease(1 - this.spT / 0.55));
        }
        case 'getup': return sampleKF(GETUP, this.st);
        case 'win': {
          const pose = Object.assign({}, WIN);
          pose.H += Math.sin(time * 5) * 1.5;
          pose.a1 += Math.sin(time * 9) * 6;
          pose.a2 += Math.sin(time * 9 + 1) * 6;
          return pose;
        }
        case 'hit': {
          const pose = Object.assign({}, this.hitZone === 'head' ? HITH : HITB);
          const shake = Math.sin(this.st * 55) * Math.max(0, 1 - this.st / this.stunT) * 5;
          pose.tl += shake;
          pose.hd += shake * 1.3;
          return pose;
        }
        case 'air': {
          const pose = mix(FALL, RISE, clamp(this.vy / 650 + 0.1, 0, 1));
          pose.tl += clamp(this.vx * this.dir / 60, -4, 6);
          return pose;
        }
        case 'dash': return this.dashF ? DASHF : DASHB;
        case 'attack': return sampleKF(this.atk.kf, this.st);
        case 'ability': {
          if (this.ab === 1) {
            let pose = sampleKF(AB1, this.st);
            if (this.st > 0.28 && this.st < 0.64) {
              pose = Object.assign({}, pose);
              const phase = this.st * 30;
              pose.f1x = 12 + 34 * Math.cos(phase);
              pose.f1h = Math.max(0, -Math.sin(phase)) * 20;
              pose.f2x = -12 + 34 * Math.cos(phase + Math.PI);
              pose.f2h = Math.max(0, -Math.sin(phase + Math.PI)) * 20;
            }
            return pose;
          }
          return sampleKF(AB2, this.st);
        }
        default:
          break;
      }
      const pose = Object.assign({}, D);
      const speed = Math.abs(this.vx);
      const walking = clamp(speed / 140, 0, 1);
      const beat = time * 5.6 + this.seed;
      pose.H += Math.sin(beat) * 1.7 * (1 - walking);
      pose.tl += Math.sin(beat + 1) * 1.2 * (1 - walking);
      pose.a1 += Math.sin(beat + 0.6) * 3 * (1 - walking);
      pose.a2 += Math.sin(beat + 1.2) * 3 * (1 - walking);
      pose.f1x += Math.sin(time * 2.8) * 2 * (1 - walking);
      pose.f2x -= Math.sin(time * 2.8) * 2 * (1 - walking);
      if (walking > 0) {
        const forward = this.vx * this.dir >= 0;
        const phase = this.walkPh;
        const amplitude = forward ? 21 : 14;
        const cosFirst = Math.cos(phase);
        const cosSecond = Math.cos(phase + Math.PI);
        const sinFirst = Math.sin(phase);
        const sinSecond = Math.sin(phase + Math.PI);
        pose.f1x = lerp(pose.f1x, D.f1x + (forward ? 3 : -2) + amplitude * cosFirst, walking);
        pose.f2x = lerp(pose.f2x, D.f2x + (forward ? 3 : -2) + amplitude * cosSecond, walking);
        pose.f1h = Math.max(0, -sinFirst) * (forward ? 15 : 11) * walking;
        pose.f2h = Math.max(0, -sinSecond) * (forward ? 15 : 11) * walking;
        pose.H += (-2 + 3.2 * Math.abs(Math.sin(phase))) * walking;
        pose.tl += (forward ? 7 : -6) * walking;
        pose.hd += (forward ? 3 : -4) * walking;
        pose.px += (forward ? 3 : -3) * walking;
        pose.a1 += Math.sin(phase * 2) * (forward ? 8 : 4) * walking;
        pose.a2 += Math.sin(phase * 2 + 1.5) * (forward ? 6 : 3) * walking;
        if (!forward) {
          pose.e1 += 10 * walking;
          pose.e2 += 8 * walking;
        }
      }
      if (this.landT > 0) return mix(pose, LAND, clamp(this.landT / 0.12, 0, 1));
      if (this.hp < 30) {
        pose.tl += 6;
        pose.H -= 4;
        pose.mo = 0.25 + 0.2 * Math.sin(time * 9);
        pose.hd += 4;
      }
      return pose;
    }
    buildRig(dt) {
      if (this.state === 'ragdoll') {
        this.rig = this.rag.toRig(this);
        return;
      }
      const target = this.targetPose();
      const hard = this.state === 'getup' || this.state === 'spawn';
      const blendSpeed = hard ? 1 : (this.state === 'attack' || this.state === 'ability' || this.state === 'hit') ? 1 - Math.exp(-dt * 45) : 1 - Math.exp(-dt * 24);
      this.cur = this.cur && !hard ? mix(this.cur, target, blendSpeed) : Object.assign({}, target);
      let rig = computeRig(this.cur, this.x, this.gy, this.y, this.dir);
      if (this.state === 'getup' && this.blend > 0 && this.blendFrom) rig = blendRig(this.blendFrom, rig, ease(1 - this.blend / 0.3));
      this.rig = rig;
    }
  }

  /* ============================ AI ============================ */
  class AI {
    constructor(fighter) { this.f = fighter; this.reset(); }
    reset() { this.mode = 'hold'; this.modeT = 0.6; this.fear = 0; this.punches = 0; this.lastHp = 100; this.seen = 0; this.pend = 0; this.bold = rnd(0.35, 0.65); this.react = 0.45; }
    update(dt, opponent, game) {
      const fighter = this.f;
      const controls = fighter.ctrl;
      controls.mx = 0;
      if (fighter.hp < this.lastHp) {
        this.fear += (this.lastHp - fighter.hp) * 0.03;
        this.punches = 0;
      }
      this.lastHp = fighter.hp;
      this.fear = Math.max(0, this.fear - dt * 0.1);
      const fear = clamp(0.08 + (1 - fighter.hp / 100) * 0.45 + (opponent.hp > fighter.hp + 25 ? 0.12 : 0) - (opponent.hp < 30 ? 0.3 : 0) - this.bold * 0.12 + this.fear, 0, 1);
      const distanceX = opponent.x - fighter.x;
      const distance = Math.abs(distanceX);
      const toward = distanceX >= 0 ? 1 : -1;
      const cornered = (-toward > 0 && fighter.x > fighter.maxX - 110) || (-toward < 0 && fighter.x < fighter.minX + 110);
      const idle = fighter.state === 'idle';
      if (this.punches > 0) {
        if (fighter.state === 'attack') {
          if (fighter.ak < 3 && fighter.st >= fighter.atk.cancel - 0.04) {
            if (this.cs !== fighter.atkStamp) {
              this.cs = fighter.atkStamp;
              controls.punch = true;
              this.punches -= 1;
            }
          } else if (fighter.st > fighter.atk.he + 0.03 && !fighter.connected) this.punches = 0;
        } else if (idle && distance < 122) {
          controls.punch = true;
          this.punches -= 1;
        } else if (fighter.state === 'hit' || fighter.state === 'ragdoll') this.punches = 0;
      }
      if (opponent.atkStamp !== this.seen) {
        this.seen = opponent.atkStamp;
        if (opponent.state === 'attack' && idle && distance < opponent.atk.reach + 50 && Math.random() < this.react) {
          const random = Math.random();
          if (fighter.dashCD <= 0 && random < 0.55) this.pend = -toward;
          else if (random < 0.8) { this.mode = 'retreat'; this.modeT = rnd(0.3, 0.6); }
          else if (distance < 105) this.punches = 1;
        }
      }
      if (idle && this.punches === 0 && opponent.state === 'attack' && opponent.st > opponent.atk.he + 0.04 && distance < 118 && Math.random() < dt * 7) this.punches = Math.random() < 0.5 ? 4 : Math.floor(rnd(2, 4));
      for (const projectile of game.proj) {
        if (projectile.owner !== fighter && Math.sign(fighter.x - projectile.x) === projectile.dir && Math.abs(projectile.x - fighter.x) < 250 && idle && Math.random() < dt * 5) {
          controls.jump = true;
          break;
        }
      }
      if (idle && opponent.y > 40 && distance < 100 && Math.random() < dt * 4) controls.punch = true;
      this.modeT -= dt;
      if (this.modeT <= 0 && idle && this.punches === 0) this.pick(fighter, opponent, distance, toward, fear, cornered);
      if (idle) {
        let usedPending = false;
        if (this.pend) {
          controls.mx = this.pend;
          controls.jump = true;
          this.pend = 0;
          usedPending = true;
        } else if (this.punches > 0) controls.mx = distance > 100 ? toward : 0;
        else if (this.mode === 'approach') controls.mx = distance > 98 ? toward : 0;
        else if (this.mode === 'retreat') {
          controls.mx = cornered ? 0 : -toward;
          if (cornered) { this.mode = 'hold'; this.modeT = 0.2; }
        } else if (this.mode === 'hold') controls.mx = Math.sin(fighter.t * 2.3 + fighter.seed) > 0.75 ? -toward : 0;
        if (controls.jump && !usedPending) controls.mx = 0;
      } else if (fighter.state === 'air') {
        controls.mx = distance > 90 ? toward : 0;
        if (distance < 110 && Math.random() < dt * 6) controls.punch = true;
      }
    }
    pick(fighter, opponent, distance, toward, fear, cornered) {
      const controls = fighter.ctrl;
      const random = Math.random();
      const opponentDown = opponent.state === 'ragdoll' || opponent.state === 'getup' || opponent.state === 'spawn';
      if (opponentDown) {
        if (distance > 125) { this.mode = 'approach'; this.modeT = 0.3; } else { this.mode = 'hold'; this.modeT = 0.35; }
        return;
      }
      if (fear > 0.5 && random < 0.7 && !cornered) {
        this.mode = 'retreat';
        this.modeT = rnd(0.5, 1.1);
        if (fighter.dashCD <= 0 && Math.random() < 0.3 && distance < 160) this.pend = -toward;
        return;
      }
      if (distance > 340) {
        if (fighter.cd1 <= 0 && distance < 470 && random < 0.4 && fear < 0.6) { controls.a1 = true; this.modeT = 1; return; }
        if (fighter.dashCD <= 0 && random < 0.55) { this.pend = toward; this.modeT = 0.4; return; }
        this.mode = 'approach';
        this.modeT = rnd(0.3, 0.6);
        return;
      }
      if (distance > 170) {
        if (fighter.cd2 <= 0 && opponent.y < 5 && random < 0.28 && fear < 0.7) { controls.a2 = true; this.modeT = 1; return; }
        if (fighter.cd1 <= 0 && distance < 420 && random < 0.5 && fear < 0.6) { controls.a1 = true; this.modeT = 1; return; }
        if (random < 0.75) { this.mode = 'approach'; this.modeT = rnd(0.2, 0.45); }
        else if (random < 0.88) { this.mode = 'hold'; this.modeT = rnd(0.2, 0.5); }
        else { this.mode = 'retreat'; this.modeT = rnd(0.25, 0.5); }
        return;
      }
      if (distance < 135) {
        if (random < 0.6 + (1 - fear) * 0.25 || opponent.hp < 35) { this.punches = Math.random() < 0.45 ? 4 : Math.floor(rnd(2, 4.99)); this.mode = 'approach'; this.modeT = 0.5; }
        else if (random < 0.8) { this.mode = 'retreat'; this.modeT = rnd(0.3, 0.6); if (fighter.dashCD <= 0 && Math.random() < 0.4) this.pend = -toward; }
        else if (random < 0.9) { controls.jump = true; this.modeT = 0.8; }
        else { this.mode = 'hold'; this.modeT = 0.3; }
      } else {
        this.mode = 'approach';
        this.modeT = 0.2;
      }
    }
  }

  /* ============================ INPUT ============================ */
  const Input = { left: false, right: false, keys: {}, punch: false, jump: false, a1: false, a2: false, tl: false, tr: false };
  const inputCleanups = [];
  const dpad = $('#dpad');
  const dpadLeft = $('#dkL');
  const dpadRight = $('#dkR');
  const dpadMap = new Map();
  function syncDpad() {
    let left = false;
    let right = false;
    for (const value of dpadMap.values()) {
      if (value === 'l') left = true; else right = true;
    }
    Input.tl = left;
    Input.tr = right;
    if (dpadLeft) dpadLeft.classList.toggle('down', left);
    if (dpadRight) dpadRight.classList.toggle('down', right);
  }
  if (dpad) {
    const updateDpad = (event) => {
      const rect = dpad.getBoundingClientRect();
      dpadMap.set(event.pointerId, (event.clientX - rect.left) < rect.width / 2 ? 'l' : 'r');
      syncDpad();
    };
    const endDpad = (event) => { dpadMap.delete(event.pointerId); syncDpad(); };
    const onDown = (event) => { event.preventDefault(); try { dpad.setPointerCapture(event.pointerId); } catch (_) {} updateDpad(event); Snd.init(); };
    dpad.addEventListener('pointerdown', onDown);
    dpad.addEventListener('pointermove', (event) => { if (dpadMap.has(event.pointerId)) updateDpad(event); });
    dpad.addEventListener('pointerup', endDpad);
    dpad.addEventListener('pointercancel', endDpad);
    dpad.addEventListener('lostpointercapture', endDpad);
    inputCleanups.push(() => {
      dpad.removeEventListener('pointerdown', onDown);
      dpadMap.clear();
    });
  }
  const bindControl = (id, key) => {
    const element = $(id);
    if (!element) return;
    const down = (event) => { event.preventDefault(); element.classList.add('down'); Input[key] = true; Snd.init(); };
    const up = () => element.classList.remove('down');
    element.addEventListener('pointerdown', down);
    element.addEventListener('pointerup', up);
    element.addEventListener('pointercancel', up);
    element.addEventListener('pointerleave', up);
    inputCleanups.push(() => {
      element.removeEventListener('pointerdown', down);
      element.removeEventListener('pointerup', up);
      element.removeEventListener('pointercancel', up);
      element.removeEventListener('pointerleave', up);
    });
  };
  bindControl('#bPunch', 'punch');
  bindControl('#bJump', 'jump');
  bindControl('#bA1', 'a1');
  bindControl('#bA2', 'a2');
  const keyMap = { KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' };
  const onKeyDown = (event) => {
    if (keyMap[event.code]) { Input.keys[keyMap[event.code]] = true; event.preventDefault(); }
    if (event.repeat) return;
    if (['KeyW', 'ArrowUp', 'Space'].includes(event.code)) { Input.jump = true; event.preventDefault(); }
    if (['KeyJ', 'KeyZ', 'KeyF'].includes(event.code)) Input.punch = true;
    if (event.code === 'KeyK' || event.code === 'KeyX') Input.a1 = true;
    if (event.code === 'KeyL' || event.code === 'KeyC') Input.a2 = true;
    if (event.code === 'Escape' && Game.active) Game.pause(true);
  };
  const onKeyUp = (event) => { if (keyMap[event.code]) Input.keys[keyMap[event.code]] = false; };
  const onBlur = () => { Input.keys = {}; dpadMap.clear(); syncDpad(); };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  inputCleanups.push(() => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
  });
  Input.mx = () => { const left = Input.tl || Input.keys.l; const right = Input.tr || Input.keys.r; return (right ? 1 : 0) - (left ? 1 : 0); };

  /* ============================ BACKGROUND ============================ */
  function makeBG(width, height, groundY, scale) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext('2d');
    context.scale(scale, scale);
    let gradient = context.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#0b0910');
    gradient.addColorStop(0.6, '#221620');
    gradient.addColorStop(1, '#150f14');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    context.strokeStyle = 'rgba(0,0,0,.35)';
    context.lineWidth = 1;
    for (let y = 0, row = 0; y < groundY - 60; y += 22, row += 1) {
      const offset = (row % 2) * 30;
      for (let x = -offset; x < width; x += 60) context.strokeRect(x, y, 60, 22);
    }
    for (let i = 0; i < 300; i += 1) {
      context.fillStyle = `rgba(${rnd(60, 130) | 0},${rnd(25, 50) | 0},${rnd(25, 45) | 0},${rnd(0.03, 0.1)})`;
      context.fillRect(rnd(width), rnd(groundY - 60), rnd(10, 60), rnd(6, 22));
    }
    context.save();
    context.font = "900 56px 'Russo One',Impact,sans-serif";
    context.textAlign = 'center';
    context.shadowColor = '#ff2a44';
    context.shadowBlur = 28;
    context.strokeStyle = '#ff4a5e';
    context.lineWidth = 3;
    context.strokeText('DUMMY FURY', width / 2, 110);
    context.fillStyle = 'rgba(255,120,130,.25)';
    context.fillText('DUMMY FURY', width / 2, 110);
    context.restore();
    for (let row = 0; row < 2; row += 1) {
      const baseY = groundY - 118 + row * 14;
      for (let x = -10; x < width + 20; x += 24 + rnd(8)) {
        const heightOffset = rnd(0, 8);
        const shade = row ? '#0b0809' : '#150f14';
        context.fillStyle = shade;
        context.beginPath();
        context.ellipse(x, baseY + 34 - heightOffset * 0.3, 17, 24, 0, Math.PI, 0);
        context.fill();
        context.fillRect(x - 17, baseY + 34 - heightOffset * 0.3, 34, 40);
        context.beginPath();
        context.arc(x, baseY + 6 - heightOffset, 9, 0, TAU);
        context.fill();
        context.fillStyle = 'rgba(255,170,120,.07)';
        context.beginPath();
        context.arc(x - 2, baseY + 4 - heightOffset, 8, Math.PI, Math.PI * 1.7);
        context.fill();
        if (Math.random() < 0.12) {
          context.strokeStyle = shade;
          context.lineWidth = 5;
          context.lineCap = 'round';
          context.beginPath();
          context.moveTo(x + 10, baseY + 24);
          context.lineTo(x + 16, baseY - 14 - heightOffset);
          context.stroke();
        }
      }
    }
    context.strokeStyle = 'rgba(180,190,210,.06)';
    context.lineWidth = 1;
    for (let i = -height; i < width + height; i += 22) {
      context.beginPath();
      context.moveTo(i, 20);
      context.lineTo(i + height, 20 + height);
      context.stroke();
      context.beginPath();
      context.moveTo(i + height, 20);
      context.lineTo(i, 20 + height);
      context.stroke();
    }
    context.fillStyle = '#17151b';
    context.fillRect(0, groundY - 62, width, 8);
    context.fillStyle = 'rgba(255,255,255,.12)';
    context.fillRect(0, groundY - 62, width, 1.5);
    context.fillStyle = '#0f0d12';
    for (let x = 20; x < width; x += 70) context.fillRect(x, groundY - 54, 5, 30);
    context.fillStyle = '#14121a';
    context.fillRect(22, 0, 10, groundY - 24);
    context.fillRect(width - 32, 0, 10, groundY - 24);
    for (const lightX of [width * 0.2, width * 0.5, width * 0.8]) {
      context.strokeStyle = '#333';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(lightX, 0);
      context.lineTo(lightX, 34);
      context.stroke();
      context.fillStyle = '#2a2a30';
      context.beginPath();
      context.moveTo(lightX - 22, 52);
      context.lineTo(lightX - 8, 34);
      context.lineTo(lightX + 8, 34);
      context.lineTo(lightX + 22, 52);
      context.closePath();
      context.fill();
      context.fillStyle = '#ffe0a0';
      context.beginPath();
      context.ellipse(lightX, 52, 17, 3.5, 0, 0, TAU);
      context.fill();
    }
    const floorTop = groundY - 24;
    gradient = context.createLinearGradient(0, floorTop, 0, height);
    gradient.addColorStop(0, '#2d2b33');
    gradient.addColorStop(1, '#16151a');
    context.fillStyle = gradient;
    context.fillRect(0, floorTop, width, height - floorTop);
    context.fillStyle = 'rgba(0,0,0,.5)';
    context.fillRect(0, floorTop, width, 3);
    context.strokeStyle = 'rgba(0,0,0,.35)';
    context.lineWidth = 1.2;
    for (let k = -14; k <= 14; k += 1) {
      context.beginPath();
      context.moveTo(width / 2 + k * 34, floorTop);
      context.lineTo(width / 2 + k * 120, height);
      context.stroke();
    }
    for (let i = 1; i < 6; i += 1) {
      const y = floorTop + (height - floorTop) * Math.pow(i / 6, 1.6);
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }
    context.strokeStyle = 'rgba(255,200,60,.22)';
    context.lineWidth = 3;
    context.beginPath();
    context.ellipse(width / 2, groundY + 24, Math.min(width * 0.4, 360), 52, 0, 0, TAU);
    context.stroke();
    for (let i = 0; i < 500; i += 1) {
      context.fillStyle = `rgba(255,255,255,${rnd(0.01, 0.04)})`;
      context.fillRect(rnd(width), rnd(floorTop, height), rnd(1, 3), 1);
    }
    return canvas;
  }
  function makeVignette(width, height, scale) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(canvas.width / 2, canvas.height / 2, canvas.height * 0.35, canvas.width / 2, canvas.height / 2, canvas.width * 0.65);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(0,0,0,.65)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas;
  }

  /* ============================ GAME ============================ */
  const Game = {
    active: false,
    paused: false,
    phase: 'none',
    W: 960,
    H: 540,
    gy: 468,
    S: 1,
    cv: gameCanvas,
    shake: 0,
    hs: 0,
    ts: 1,
    tsT: 0,
    proj: [],
    round: 1,
    score: [0, 0],
    phT: 0,
    lagL: 100,
    lagR: 100,
    comboN: 0,
    comboT: 0,
    fx: new FX(),
    init() {
      this.ctx = this.cv.getContext('2d');
      this.dc = document.createElement('canvas');
      this.dctx = this.dc.getContext('2d');
    },
    resize() {
      const width = window.innerWidth;
      const height = window.innerHeight;
      if (!width || !height) return;
      const aspect = width / height;
      this.W = clamp(aspect * 540, 800, 1300);
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5, 810 / height);
      this.S = ratio * height / 540;
      this.cv.width = Math.round(this.W * this.S);
      this.cv.height = Math.round(540 * this.S);
      this.cv.style.height = `${height}px`;
      this.cv.style.width = `${this.W * height / 540}px`;
      this.buildBG();
      if (this.P) {
        this.P.minX = this.E.minX = 70;
        this.P.maxX = this.E.maxX = this.W - 70;
      }
    },
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
    },
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
      const makeFighter = (options) => new Fighter(Object.assign({ fx: this.fx, gy: this.gy, minX: 70, maxX: this.W - 70, spawnY: 620 }, options));
      this.P = makeFighter({ marker: true, col: COL_BLUE, x: this.W * 0.33, dir: 1 });
      this.E = makeFighter({ isAI: true, col: COL_RED, x: this.W * 0.67, dir: -1 });
      this.E.brain = new AI(this.E);
      for (const fighter of [this.P, this.E]) fighter.onShake = (value) => { this.shake = Math.max(this.shake, Math.min(14, value)); };
      onPauseChange(false);
      onResult(null);
      this.newRound();
    },
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
      this.banner(`РАУНД ${this.round}`);
      this.updPips();
    },
    updPips() {
      const left = $('#pipL');
      const right = $('#pipR');
      if (left) [...left.children].forEach((element, index) => element.classList.toggle('on', index < this.score[0]));
      if (right) [...right.children].forEach((element, index) => element.classList.toggle('on', index < this.score[1]));
    },
    banner(text) { onBanner(text); },
    pause(on) {
      if (this.phase === 'over') return;
      this.paused = on;
      onPauseChange(on);
    },
    hitFX(attacker, victim, attack, x, y) {
      this.fx.impact(x, y, attacker.dir, attack.pw);
      this.fx.blood(x, y, attacker.dir, Math.floor(6 + attack.pw * 16), attack.pw);
      if (attack.launch && attack.zone === 'head') this.fx.teeth(x, y, attacker.dir);
      this.shake = Math.max(this.shake, 3 + attack.pw * 7);
      this.hs = 0.04 + attack.pw * 0.05;
      Snd.hit(0.6 + attack.pw * 0.6);
      if (attacker === this.P) {
        this.comboN = this.comboT > 0 ? this.comboN + 1 : 1;
        this.comboT = 1.1;
        const combo = $('#combo');
        if (combo) {
          if (this.comboN > 1) combo.textContent = `×${this.comboN} КОМБО`;
          combo.style.opacity = this.comboN > 1 ? '1' : '0';
        }
      }
    },
    wave(fighter) {
      this.fx.landing(fighter.x + fighter.dir * 50, this.gy, 1.5);
      this.fx.crack(fighter.x + fighter.dir * 50, this.gy + 8, fighter.dir);
      this.fx.spark(fighter.x + fighter.dir * 50, this.gy - 6, 12, '255,160,40');
      this.shake = Math.max(this.shake, 12);
      Snd.stomp();
      this.proj.push({ x: fighter.x + fighter.dir * 60, dir: fighter.dir, owner: fighter, dist: 0, t: 0 });
    },
    ko(victim, attacker, attack) {
      if (this.phase === 'ko' || this.phase === 'over') return;
      victim.hp = 0;
      this.phase = 'ko';
      this.phT = 0;
      this.winner = attacker;
      this.loser = victim;
      this.score[attacker === this.P ? 0 : 1] += 1;
      victim.toRagdoll(attacker.dir * (attack.lvx || 320) * 1.1, (attack.lvy || 520) + 140);
      this.fx.blood(victim.x, victim.gy - victim.y - 120, attacker.dir, 34, 1.2);
      this.ts = 0.28;
      this.tsT = 1.2;
      this.banner('K.O.');
      Snd.ko();
      this.shake = 16;
      this.updPips();
    },
    update(delta) {
      if (!this.active || this.paused || !this.P) return;
      const realDelta = delta;
      if (this.hs > 0) { this.hs -= realDelta; delta *= 0.05; }
      if (this.tsT > 0) {
        this.tsT -= realDelta;
        delta *= this.ts;
        if (this.tsT <= 0) this.ts = 1;
      }
      this.shake *= Math.exp(-realDelta * 9);
      if (this.comboT > 0) {
        this.comboT -= realDelta;
        if (this.comboT <= 0) {
          this.comboN = 0;
          const combo = $('#combo');
          if (combo) combo.style.opacity = '0';
        }
      }
      const player = this.P;
      const enemy = this.E;
      this.phT += delta;
      if (this.phase === 'fight') {
        const controls = player.ctrl;
        controls.mx = Input.mx();
        if (Input.jump) controls.jump = true;
        if (Input.punch) controls.punch = true;
        if (Input.a1) controls.a1 = true;
        if (Input.a2) controls.a2 = true;
        enemy.brain.update(delta, player, this);
      } else {
        player.ctrl.mx = 0;
        enemy.ctrl.mx = 0;
      }
      Input.jump = false;
      Input.punch = false;
      Input.a1 = false;
      Input.a2 = false;
      player.update(delta, enemy);
      enemy.update(delta, player);
      if (player.y < 60 && enemy.y < 60 && player.state !== 'ragdoll' && enemy.state !== 'ragdoll' && player.state !== 'spawn' && enemy.state !== 'spawn') {
        const distance = enemy.x - player.x;
        const minimum = 54;
        if (Math.abs(distance) < minimum) {
          const sign = distance >= 0 ? 1 : -1;
          const push = (minimum - Math.abs(distance)) / 2;
          const playerOkay = player.x - sign * push >= player.minX && player.x - sign * push <= player.maxX;
          const enemyOkay = enemy.x + sign * push >= enemy.minX && enemy.x + sign * push <= enemy.maxX;
          if (playerOkay && enemyOkay) { player.x -= sign * push; enemy.x += sign * push; }
          else if (playerOkay) player.x -= sign * push * 2;
          else if (enemyOkay) enemy.x += sign * push * 2;
        }
      }
      for (const projectile of this.proj) {
        projectile.x += projectile.dir * 560 * delta;
        projectile.dist += 560 * delta;
        projectile.t += delta;
        if (Math.random() < 0.6) this.fx.smoke(projectile.x, this.gy - 4, rnd(-30, 30), -rnd(5, 40), rnd(6, 11), rnd(16, 28), rnd(0.3, 0.5), 0.5);
        const opponent = projectile.owner === player ? enemy : player;
        if (opponent.canBeHit() && opponent.y < 45 && Math.abs(opponent.x - projectile.x) < 34) {
          projectile.dead = true;
          opponent.takeHit(projectile.owner, A2H);
        }
        if (projectile.dist > 560 || projectile.x < 20 || projectile.x > this.W - 20) projectile.dead = true;
      }
      this.proj = this.proj.filter((projectile) => !projectile.dead);
      this.fx.update(delta);
      if (this.phase === 'intro') {
        if (this.phT > 1.3 && player.state === 'idle' && enemy.state === 'idle') {
          this.phase = 'fight';
          this.banner('БОЙ!');
          Snd.fight();
        }
      } else if (this.phase === 'ko') {
        const winner = this.winner;
        if (this.phT > 1.4 && winner.state === 'idle') { winner.state = 'win'; winner.st = 0; }
        if (this.phT > 3.4) {
          if (this.score[0] >= 2 || this.score[1] >= 2) this.matchEnd();
          else { this.round += 1; this.newRound(); }
        }
      }
      this.hud(realDelta);
    },
    matchEnd() {
      this.phase = 'over';
      const win = this.score[0] >= 2;
      onResult({ win, score: [...this.score] });
    },
    hud(delta) {
      const player = this.P;
      const enemy = this.E;
      this.lagL = Math.max(player.hp, this.lagL - delta * 28);
      this.lagR = Math.max(enemy.hp, this.lagR - delta * 28);
      const hpL = $('#hpL');
      const hpR = $('#hpR');
      const lagL = $('#lagL');
      const lagR = $('#lagR');
      if (hpL) hpL.style.width = `${player.hp}%`;
      if (hpR) hpR.style.width = `${enemy.hp}%`;
      if (lagL) lagL.style.width = `${this.lagL}%`;
      if (lagR) lagR.style.width = `${this.lagR}%`;
      const abilityOne = $('#bA1');
      const abilityTwo = $('#bA2');
      if (abilityOne) {
        abilityOne.style.setProperty('--p', player.cd1 / 7);
        abilityOne.classList.toggle('ready', player.cd1 <= 0);
      }
      if (abilityTwo) {
        abilityTwo.style.setProperty('--p', player.cd2 / 9);
        abilityTwo.classList.toggle('ready', player.cd2 <= 0);
      }
    },
    render() {
      if (!this.bg || !this.vig || !this.P) return;
      const context = this.ctx;
      const scale = this.S;
      const width = this.W;
      const height = 540;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, this.cv.width, this.cv.height);
      context.setTransform(scale, 0, 0, scale, 0, 0);
      if (this.shake > 0.3) context.translate(rnd(-1, 1) * this.shake, rnd(-1, 1) * this.shake);
      context.drawImage(this.bg, 0, 0, width, height);
      context.drawImage(this.dc, 0, 0, width, height);
      drawFighter(context, this.E);
      drawFighter(context, this.P);
      for (const projectile of this.proj) {
        const gradient = context.createRadialGradient(projectile.x, this.gy, 0, projectile.x, this.gy, 60);
        gradient.addColorStop(0, 'rgba(255,230,140,.9)');
        gradient.addColorStop(0.5, 'rgba(255,140,30,.5)');
        gradient.addColorStop(1, 'rgba(255,80,0,0)');
        context.fillStyle = gradient;
        context.beginPath();
        context.ellipse(projectile.x, this.gy - 6, 50, 34, 0, 0, TAU);
        context.fill();
        context.strokeStyle = 'rgba(255,230,160,.9)';
        context.lineWidth = 3;
        context.beginPath();
        context.ellipse(projectile.x, this.gy - 6, 24, 32, 0, -1.2 * projectile.dir - 1.57, 1.2 * projectile.dir - 1.57);
        context.stroke();
      }
      this.fx.draw(context);
      context.save();
      context.globalCompositeOperation = 'lighter';
      for (const lightX of [width * 0.2, width * 0.5, width * 0.8]) {
        const flicker = 0.85 + Math.sin(performance.now() / 90 + lightX) * 0.05 + Math.random() * 0.04;
        const gradient = context.createRadialGradient(lightX, 54, 4, lightX, 54, 380);
        gradient.addColorStop(0, `rgba(255,215,150,${0.3 * flicker})`);
        gradient.addColorStop(1, 'rgba(255,215,150,0)');
        context.fillStyle = gradient;
        context.fillRect(lightX - 380, 0, 760, height);
      }
      context.restore();
      context.drawImage(this.vig, 0, 0, width, height);
    },
  };
  Game.init();

  /* ============================ SHOWCASE ============================ */
  class Showcase {
    constructor(canvas, options) {
      this.c = canvas;
      this.ctx = canvas.getContext('2d');
      this.opt = options;
      this.fx = new FX();
      this.fx.floorY = 262;
      this.f = new Fighter({ fx: this.fx, gy: 262, minX: -9999, maxX: 9999, spawnY: 340, col: COL_BLUE, x: 100, dir: options.dir || 1 });
      this.f.visible = false;
      this.f.state = 'idle';
      this.f.onShake = (value) => { this.shake = Math.max(this.shake || 0, Math.min(8, value)); };
      this.sh = 0;
      this.tm = 2;
      this.punches = 0;
      this.W = 300;
      this.s = 1;
      this.t = 0;
      this.parts = [];
      this.shake = 0;
      for (let i = 0; i < 40; i += 1) this.parts.push({ x: Math.random(), y: Math.random(), v: rnd(0.02, 0.07), r: rnd(0.6, 2), p: rnd(TAU) });
    }
    resize() {
      const rect = this.c.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      this.c.width = Math.max(2, Math.round(rect.width * dpr));
      this.c.height = Math.max(2, Math.round(rect.height * dpr));
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
      const fighter = this.f;
      this.shake *= Math.exp(-dt * 8);
      if (fighter.visible && fighter.state === 'idle') {
        if (this.punches > 0) {
          if (fighter.state === 'idle') {
            fighter.ctrl.punch = true;
            this.punches -= 1;
          }
        }
        const dx = this.home - fighter.x;
        fighter.ctrl.mx = Math.abs(dx) > 4 ? (dx > 0 ? 1 : -1) : 0;
        this.tm -= dt;
        if (this.tm <= 0 && Math.abs(dx) < 6) {
          this.tm = rnd(2.2, 3.4);
          this.punches = 1;
          this.chain = Math.random() < 0.6 ? 4 : 3;
        }
      }
      if (fighter.state === 'attack' && this.chain > 1 && fighter.ak < 3 && fighter.st >= fighter.atk.cancel - 0.03 && this.cs !== fighter.atkStamp) {
        this.cs = fighter.atkStamp;
        fighter.ctrl.punch = true;
        this.chain -= 1;
      }
      if (fighter.state === 'idle' && this.punches === 0) this.chain = Math.max(this.chain || 0, 0);
      fighter.update(dt, null);
      this.fx.update(dt);
    }
    render() {
      const context = this.ctx;
      const width = this.c.width;
      const height = this.c.height;
      const scale = this.s;
      context.setTransform(1, 0, 0, 1, 0, 0);
      let gradient = context.createRadialGradient(width * (this.opt.cx || 0.5), height * 0.45, 10, width * (this.opt.cx || 0.5), height * 0.5, height * 1.1);
      gradient.addColorStop(0, this.opt.glow || '#3b1219');
      gradient.addColorStop(1, '#07070b');
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
      context.save();
      context.globalCompositeOperation = 'lighter';
      const center = width * (this.opt.cx || 0.5);
      const beam = context.createLinearGradient(0, 0, 0, height * 0.9);
      beam.addColorStop(0, 'rgba(255,220,160,.22)');
      beam.addColorStop(1, 'rgba(255,220,160,0)');
      context.fillStyle = beam;
      context.beginPath();
      context.moveTo(center - height * 0.05, 0);
      context.lineTo(center + height * 0.05, 0);
      context.lineTo(center + height * 0.5, height * 0.88);
      context.lineTo(center - height * 0.5, height * 0.88);
      context.closePath();
      context.fill();
      context.restore();
      const floorY = 262 * scale;
      gradient = context.createLinearGradient(0, floorY - 10, 0, height);
      gradient.addColorStop(0, '#26242b');
      gradient.addColorStop(1, '#0c0b0f');
      context.fillStyle = gradient;
      context.fillRect(0, floorY - 4, width, height - floorY + 4);
      context.strokeStyle = 'rgba(255,200,60,.2)';
      context.lineWidth = 2;
      context.beginPath();
      context.ellipse(center, floorY + 14 * scale, height * 0.55, 16 * scale, 0, 0, TAU);
      context.stroke();
      for (const particle of this.parts) {
        particle.y -= particle.v * 0.016;
        particle.x += Math.sin(this.t + particle.p) * 0.0004;
        if (particle.y < 0) { particle.y = 1; particle.x = Math.random(); }
        context.fillStyle = `rgba(255,${120 + Math.sin(this.t * 3 + particle.p) * 60 | 0},40,${0.5 + Math.sin(this.t * 4 + particle.p) * 0.3})`;
        context.beginPath();
        context.arc(particle.x * width, particle.y * height, particle.r * scale * 0.6, 0, TAU);
        context.fill();
      }
      context.setTransform(scale, 0, 0, scale, (Math.random() - 0.5) * this.shake * scale, (Math.random() - 0.5) * this.shake * scale);
      drawFighter(context, this.f);
      this.fx.draw(context);
      context.setTransform(1, 0, 0, 1, 0, 0);
      const vignette = context.createRadialGradient(width / 2, height / 2, height * 0.4, width / 2, height / 2, width * 0.7);
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, 'rgba(0,0,0,.6)');
      context.fillStyle = vignette;
      context.fillRect(0, 0, width, height);
    }
  }
  const menuShow = new Showcase(menuCanvas, { cx: 0.76, dir: -1, glow: '#43121a' });
  const selectShow = new Showcase(selectCanvas, { cx: 0.5, dir: 1, glow: '#2a1a10' });
  menuShow.f.dir = -1;

  /* ---------- bust ---------- */
  function drawBust(canvas) {
    const context = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const gradient = context.createRadialGradient(width * 0.5, height * 0.4, 5, width * 0.5, height * 0.5, width * 0.8);
    gradient.addColorStop(0, '#5a2a20');
    gradient.addColorStop(1, '#120c10');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    const fighter = { wounds: newWounds(), col: COL_BLUE };
    const scale = width / 62;
    context.save();
    context.scale(scale, scale);
    drawTorso(context, { dir: 1, neck: { x: 24, y: 50 }, pel: { x: 24, y: 104 }, sh: { x: 24, y: 54 } }, fighter);
    drawHead(context, { dir: 1, head: { x: 28, y: 29 }, neck: { x: 24, y: 50 }, mo: 0, ey: 0 }, fighter);
    context.restore();
    const vignette = context.createLinearGradient(0, height * 0.6, 0, height);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,.65)');
    context.fillStyle = vignette;
    context.fillRect(0, 0, width, height);
  }

  let last = performance.now();
  let animationFrame = 0;
  let destroyed = false;
  function frame(timestamp) {
    if (destroyed) return;
    animationFrame = window.requestAnimationFrame(frame);
    let delta = Math.min(0.033, (timestamp - last) / 1000);
    last = timestamp;
    if (!(delta > 0)) return;
    if (window.innerHeight > window.innerWidth) return;
    const scene = getScene();
    if (scene === 'game' && Game.active) {
      Game.update(delta);
      Game.render();
    } else if (scene === 'menu') {
      menuShow.update(delta);
      menuShow.render();
    } else if (scene === 'select') {
      selectShow.update(delta);
      selectShow.render();
    }
  }
  animationFrame = window.requestAnimationFrame(frame);

  const onResize = () => {
    const scene = getScene();
    if (scene === 'game') Game.resize();
    if (scene === 'menu') menuShow.resize();
    if (scene === 'select') selectShow.resize();
  };
  window.addEventListener('resize', onResize);
  const onVisibilityChange = () => {
    if (document.hidden && Game.active && Game.phase !== 'over') Game.pause(true);
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
  document.addEventListener('contextmenu', preventContextMenu);
  function preventContextMenu(event) { event.preventDefault(); }

  return {
    Game,
    Snd,
    Input,
    drawBust,
    resizeForScene(scene) {
      if (scene === 'game') Game.resize();
      if (scene === 'menu') menuShow.resize();
      if (scene === 'select') selectShow.resize();
    },
    spawnMenu(delay) { menuShow.spawn(delay); },
    spawnSelect(delay) { selectShow.spawn(delay); },
    hideSelect() { selectShow.f.visible = false; selectShow.f.state = 'idle'; },
    userGesture() { Snd.init(); Snd.ui(); },
    toggleSound() {
      Snd.init();
      Snd.on = !Snd.on;
      if (Snd.on) Snd.ui();
      return Snd.on;
    },
    destroy() {
      destroyed = true;
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('contextmenu', preventContextMenu);
      inputCleanups.forEach((cleanup) => cleanup());
    },
  };
}
