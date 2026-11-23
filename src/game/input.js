// Ввод: экранный геймпад, клавиатура, свайпы на поле боя.
import { Snd } from './audio.js';

export const Input = {
  tl: false,
  tr: false,
  keys: {},
  punch: false,
  jump: false,
  a1: false,
  a2: false,
  _els: null,
  _dpm: new Map(),
  _escape: null,

  mx() {
    const l = this.tl || this.keys.l;
    const r = this.tr || this.keys.r;
    return (r ? 1 : 0) - (l ? 1 : 0);
  },

  init(opts = {}) {
    this.destroy();
    const dp = document.querySelector('#dpad');
    const dkL = document.querySelector('#dkL');
    const dkR = document.querySelector('#dkR');
    if (!dp || !dkL || !dkR) return false;
    const dpm = this._dpm;

    const sync = () => {
      let l = false;
      let r = false;
      for (const v of dpm.values()) {
        if (v === 'l') l = true;
        else r = true;
      }
      this.tl = l;
      this.tr = r;
      dkL.classList.toggle('down', l);
      dkR.classList.toggle('down', r);
    };
    const upd = (e) => {
      const rc = dp.getBoundingClientRect();
      dpm.set(e.pointerId, e.clientX - rc.left < rc.width / 2 ? 'l' : 'r');
      sync();
    };
    const onDown = (e) => {
      e.preventDefault();
      try {
        dp.setPointerCapture(e.pointerId);
      } catch (_) {
        /* noop */
      }
      upd(e);
      Snd.init();
    };
    const onMove = (e) => {
      if (dpm.has(e.pointerId)) upd(e);
    };
    const onEnd = (e) => {
      dpm.delete(e.pointerId);
      sync();
    };
    dp.addEventListener('pointerdown', onDown);
    dp.addEventListener('pointermove', onMove);
    dp.addEventListener('pointerup', onEnd);
    dp.addEventListener('pointercancel', onEnd);
    dp.addEventListener('lostpointercapture', onEnd);

    const bind = (id, k) => {
      const el = document.querySelector(id);
      if (!el) return null;
      const dn = (e) => {
        e.preventDefault();
        el.classList.add('down');
        this[k] = true;
        Snd.init();
      };
      const up = () => el.classList.remove('down');
      el.addEventListener('pointerdown', dn);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
      return { el, dn, up };
    };
    const binds = [
      bind('#bPunch', 'punch'),
      bind('#bJump', 'jump'),
      bind('#bA1', 'a1'),
      bind('#bA2', 'a2'),
    ].filter(Boolean);

    const km = { KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' };
    const onKeyDown = (e) => {
      if (km[e.code]) {
        this.keys[km[e.code]] = true;
        e.preventDefault();
      }
      if (e.repeat) return;
      if (['KeyW', 'ArrowUp', 'Space'].includes(e.code)) {
        this.jump = true;
        e.preventDefault();
      }
      if (['KeyJ', 'KeyZ', 'KeyF'].includes(e.code)) this.punch = true;
      if (e.code === 'KeyK' || e.code === 'KeyX') this.a1 = true;
      if (e.code === 'KeyL' || e.code === 'KeyC') this.a2 = true;
      if (e.code === 'Escape' && this._escape) this._escape();
    };
    const onKeyUp = (e) => {
      if (km[e.code]) this.keys[km[e.code]] = false;
    };
    const onBlur = () => {
      this.keys = {};
      dpm.clear();
      sync();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    this._els = { dp, dkL, dkR, onDown, onMove, onEnd, binds, onKeyDown, onKeyUp, onBlur };
    this._escape = opts.onEscape || null;
    return true;
  },

  destroy() {
    const E = this._els;
    if (!E) return;
    E.dp.removeEventListener('pointerdown', E.onDown);
    E.dp.removeEventListener('pointermove', E.onMove);
    E.dp.removeEventListener('pointerup', E.onEnd);
    E.dp.removeEventListener('pointercancel', E.onEnd);
    E.dp.removeEventListener('lostpointercapture', E.onEnd);
    for (const b of E.binds) {
      b.el.removeEventListener('pointerdown', b.dn);
      b.el.removeEventListener('pointerup', b.up);
      b.el.removeEventListener('pointercancel', b.up);
      b.el.removeEventListener('pointerleave', b.up);
    }
    document.removeEventListener('keydown', E.onKeyDown);
    document.removeEventListener('keyup', E.onKeyUp);
    window.removeEventListener('blur', E.onBlur);
    this._dpm.clear();
    this._els = null;
    this._escape = null;
    this.tl = this.tr = false;
    this.keys = {};
    this.punch = this.jump = this.a1 = this.a2 = false;
  },
};
