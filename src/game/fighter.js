// Боец: состояние, удары, способности, получение урона, рэгдолл, подъём.
import { clamp, ease, lerp, rnd } from './utils.js';
import { D, sampleKF, mixPose } from './poses.js';
import { computeRig, blendRig } from './rig.js';
import { Ragdoll } from './ragdoll.js';
import {
  T_POSE, LAND, RISE, FALL, HITH, HITB, WIN,
  GETUP, GETUP_DUR, ATK, A1, A1H, A2H, AB1, AB2,
  DASHF, DASHB,
} from './animations.js';
import { newWounds, addW, injure } from './wounds.js';
import { Snd } from './audio.js';

export class Fighter {
  constructor(o) {
    Object.assign(
      this,
      {
        isAI: false,
        marker: false,
        col: null,
        fx: null,
        gy: 468,
        minX: 60,
        maxX: 900,
        spawnY: 620,
        name: 'TEST DUMMY',
        hooks: {},
      },
      o,
    );
    if (!this.col) this.col = { near: {}, far: {} };
    this.hooks = Object.assign({ hitFX() {}, ko() {}, wave() {} }, o.hooks);
    this.wounds = newWounds();
    this.hits = { head: 0, torso: 0 };
    this.seed = Math.random() * 10;
    this.ctrl = { mx: 0, jump: false, punch: false, a1: false, a2: false };
    this.reset(o.x || 300, o.dir || 1);
  }

  reset(x, dir) {
    Object.assign(this, {
      x, y: 0, vx: 0, vy: 0, dir, hp: 100,
      state: 'idle', st: 0, t: 0, walkPh: 0,
      comboStep: 0, comboT: 9,
      cd1: 0, cd2: 0, dashCD: 0,
      invT: 0, landT: 0, stunT: 0,
      cur: null, blend: 0, visible: true, rig: null,
      atk: null, ab: 0, ak: 0, atkStamp: 0,
      connected: false, bleedT: 0, lastSign: 1,
      rag: null, hitZone: 'head', poolT: 0,
      sp: 0, spT: 0, dashW: 0, dashF: true, dashT: 0,
      hitDone: false, queued: false, lungeDone: false, wh: false, sfx: false,
      dustT: 0,
    });
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

  canBeHit() {
    return (
      this.state !== 'ragdoll' &&
      this.state !== 'getup' &&
      this.state !== 'spawn' &&
      this.state !== 'win' &&
      this.invT <= 0
    );
  }

  faceOpp(o) {
    if (o && this.y < 2 && Math.abs(o.x - this.x) > 10) {
      this.dir = o.x > this.x ? 1 : -1;
    }
  }

  speedMul() {
    return this.hp < 30 ? 0.85 : 1;
  }

  startAttack(i) {
    this.state = 'attack';
    this.atk = ATK[i];
    this.ak = i;
    this.st = 0;
    this.hitDone = false;
    this.queued = false;
    this.lungeDone = false;
    this.connected = false;
    this.wh = false;
    this.atkStamp++;
  }

  startJump() {
    this.vy = 770;
    this.y = 0.5;
    this.state = 'air';
    this.st = 0;
    if (this.fx) this.fx.landing(this.x, this.gy, 0.5);
  }

  startDash(w) {
    // w: +1 вперёд, -1 назад относительно соперника
    this.state = 'dash';
    this.st = 0;
    this.dashF = w > 0;
    this.dashW = w * this.dir;
    this.dashT = w > 0 ? 0.24 : 0.27;
    this.dashCD = 0.6;
    this.dashDust = 0;
    if (w < 0) this.invT = 0.22;
    Snd.whoosh();
  }

  startAbility(n) {
    this.state = 'ability';
    this.ab = n;
    this.st = 0;
    this.hitDone = false;
    this.sfx = false;
    if (n === 1) this.cd1 = 7;
    else this.cd2 = 9;
  }

  onLand(impact) {
    this.landT = 0.12;
    this.vx *= 0.35;
    if (this.fx) this.fx.landing(this.x, this.gy, clamp(impact / 700, 0.5, 1.2));
    if (impact > 400) Snd.thud();
    if (
      this.state === 'air' ||
      this.state === 'dash' ||
      (this.state === 'attack' && this.atk.air)
    ) {
      this.state = 'idle';
      this.st = 0;
      this.comboT = 9;
    }
  }

  tryHit(a, o) {
    if (!o || !o.canBeHit()) return false;
    const dx = (o.x - this.x) * this.dir;
    if (dx < -20 || dx > a.reach + 14) return false;
    const lo = this.y + a.y[0];
    const hi = this.y + a.y[1];
    const ov = Math.min(hi, o.y + 185) - Math.max(lo, o.y + 55);
    if (ov < 20) return false;
    o.takeHit(this, a);
    return true;
  }

  takeHit(att, a) {
    this.hp = Math.max(0, this.hp - a.dmg);
    const px = this.x - att.dir * 10;
    const py = this.gy - this.y - (a.zone === 'head' ? 152 : a.zone === 'torso' ? 112 : 34);
    this.hooks.hitFX(att, this, a, px, py);
    injure(this, a.zone, a.pw);
    att.handDamage(a, this);
    if (this.hp <= 0) {
      this.hooks.ko(this, att, a);
      return;
    }
    if (a.launch || this.y > 8) {
      this.toRagdoll(att.dir * (a.lvx || 200), a.lvy || 420);
    } else {
      this.state = 'hit';
      this.st = 0;
      this.stunT = a.stun;
      this.hitZone = a.zone === 'head' ? 'head' : 'body';
      this.vx = att.dir * a.kb;
      this.invT = 0;
      if (a.pull) this.x = clamp(att.x + att.dir * a.pull, this.minX, this.maxX);
    }
  }

  handDamage(a, vic) {
    if (!a.fist) return;
    const s = a.fist;
    const bloody =
      vic.wounds.head.some((w) => w.k === 'lip' || w.k === 'nose') || Math.random() < 0.25;
    if (Math.random() < 0.4 * a.pw) {
      addW(this, 'h' + s, {
        k: 'split', x: 9.4, y: -1.6, r: 1.6 + Math.random(), v: 1,
      });
    }
    if (bloody && a.zone === 'head') {
      addW(this, 'h' + s, { k: 'blood', x: 6, y: 0, r: rnd(3, 4.5), v: rnd(0.5, 1) });
      if (Math.random() < 0.6) {
        addW(this, 'f' + s, {
          k: 'blood', t: rnd(0.5, 0.9), s: rnd(-0.5, 0.5), r: rnd(2.5, 4), v: rnd(0.4, 1),
        });
      }
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

  ragInjury(spd) {
    if (spd < 3.2) return;
    const parts = ['uN', 'fN', 'tN', 'sN', 'fF', 'sF', 'torso'];
    const p = parts[(Math.random() * parts.length) | 0];
    if (p === 'torso') {
      addW(this, 'torso', { k: 'abr', x: rnd(-6, 8), y: rnd(8, 40), r: rnd(3, 5), v: 0.7 });
    } else {
      addW(this, p, {
        k: Math.random() < 0.5 ? 'abr' : 'scratch',
        t: rnd(0.2, 0.9),
        s: rnd(-0.6, 0.6),
        r: rnd(3, 5),
        v: 0.7,
      });
    }
    if (this.hp < 60 && Math.random() < 0.5 && this.fx && this.rig) {
      const r = this.rig;
      this.fx.blood(r.pel.x, r.pel.y, this.dir, 4, 0.3);
    }
  }

  startGetup() {
    const R = this.rag.toRig(this);
    this.blendFrom = R;
    this.x = clamp(this.rag.p.pel.x, this.minX, this.maxX);
    this.rag = null;
    this.state = 'getup';
    this.st = 0;
    this.blend = 0.3;
    this.cur = null;
    this.dustT = 0;
  }

  update(dt, o) {
    this.t += dt;
    this.st += dt;
    const c = this.ctrl;
    this.cd1 = Math.max(0, this.cd1 - dt);
    this.cd2 = Math.max(0, this.cd2 - dt);
    this.dashCD = Math.max(0, this.dashCD - dt);
    if (this.invT > 0) this.invT -= dt;
    if (this.landT > 0) this.landT -= dt;
    if (this.blend > 0) this.blend -= dt;
    if (this.state !== 'attack') this.comboT += dt;
    if (
      this.state !== 'ragdoll' &&
      this.state !== 'spawn' &&
      (this.y > 0 || this.vy > 0)
    ) {
      this.vy -= 2200 * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        const im = -this.vy;
        this.y = 0;
        this.vy = 0;
        this.onLand(im);
      }
    }
    switch (this.state) {
      case 'spawn': {
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
          if (this.fx && Math.random() < 0.5 && this.rig) {
            this.fx.spark(this.rig.pel.x + rnd(-20, 20), this.rig.pel.y + rnd(-60, 60), 1, '120,200,255');
          }
          if (this.y <= 0) {
            this.y = 0;
            this.vy = 0;
            this.sp = 2;
            this.spT = 0.6;
            this.st = 0;
            if (this.fx) {
              this.fx.landing(this.x, this.gy, 1.9);
              for (let i = 0; i < 8; i++) {
                this.fx.smoke(
                  this.x + rnd(-20, 20),
                  this.gy - rnd(0, 20),
                  rnd(-60, 60),
                  -rnd(20, 90),
                  rnd(12, 22),
                  rnd(20, 40),
                  rnd(0.8, 1.4),
                  0.5,
                  1,
                );
              }
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
      }
      case 'idle': {
        this.faceOpp(o);
        const mv = c.mx;
        const toward = mv * this.dir;
        const spd = mv ? (toward > 0 ? 235 : 185) : 0;
        this.vx += (mv * spd * this.speedMul() - this.vx) * Math.min(1, dt * 14);
        if (Math.abs(this.vx) > 8) {
          this.walkPh += (this.vx * this.dir >= 0 ? 1 : -1) * Math.abs(this.vx) * dt * 0.08;
          const sg = Math.sin(this.walkPh) > 0 ? 1 : -1;
          if (sg !== this.lastSign) {
            this.lastSign = sg;
            if (Math.abs(this.vx) > 120 && this.fx) {
              this.fx.step(
                this.x - this.dir * 10,
                this.gy,
                this.dir * (this.vx * this.dir >= 0 ? 1 : -1),
              );
            }
          }
        }
        if (c.jump) {
          if (mv && this.dashCD <= 0) this.startDash(toward > 0 ? 1 : -1);
          else if (!mv) this.startJump();
        } else if (c.punch) {
          this.startAttack(this.comboT < 0.6 ? this.comboStep : 0);
        } else if (c.a1 && this.cd1 <= 0) {
          this.startAbility(1);
        } else if (c.a2 && this.cd2 <= 0) {
          this.startAbility(2);
        }
        break;
      }
      case 'air': {
        this.vx += (c.mx * 215 - this.vx) * Math.min(1, dt * 2.5);
        if (c.punch) this.startAttack(4);
        break;
      }
      case 'dash': {
        const k = 1 - (this.st / this.dashT) * 0.5;
        this.vx = this.dashW * (this.dashF ? 840 : 620) * k;
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
        const a = this.atk;
        if (c.punch && !a.air) this.queued = true;
        if (!this.lungeDone && this.st >= a.lt) {
          this.lungeDone = true;
          if (a.lunge) this.vx = this.dir * a.lunge;
        }
        if (!a.air || this.y <= 0) this.vx *= Math.exp(-dt * 9);
        if (!this.wh && this.st >= a.hs - 0.03) {
          this.wh = true;
          Snd.whoosh();
        }
        if (!this.hitDone && this.st >= a.hs && this.st <= a.he) {
          if (this.tryHit(a, o)) {
            this.hitDone = true;
            this.connected = true;
          }
        }
        if (this.st > a.he) this.hitDone = true;
        if (this.queued && this.st >= a.cancel && this.ak < 3 && !a.air) {
          this.startAttack(this.ak + 1);
          break;
        }
        if (this.st >= a.dur) {
          this.comboStep = this.ak < 3 && !a.air ? this.ak + 1 : 0;
          this.comboT = 0;
          this.state = this.y > 0 ? 'air' : 'idle';
          this.st = 0;
        }
        break;
      }
      case 'ability': {
        if (this.ab === 1) {
          if (this.st >= 0.28 && this.st < 0.64) {
            if (!this.sfx) {
              this.sfx = true;
              Snd.ram();
              if (this.onShake) this.onShake(4);
            }
            this.vx = this.dir * 820;
            if (this.fx && Math.random() < 0.7) this.fx.dash(this.x, this.gy, this.dir);
            if (!this.hitDone && this.tryHit(Object.assign({}, A1, A1H), o)) {
              this.hitDone = true;
              this.vx *= 0.2;
            }
          } else {
            this.vx *= Math.exp(-dt * 10);
          }
          if (this.st >= 1) {
            this.state = 'idle';
            this.st = 0;
            this.comboT = 9;
          }
        } else {
          this.vx *= Math.exp(-dt * 12);
          if (!this.hitDone && this.st >= 0.44) {
            this.hitDone = true;
            this.hooks.wave(this);
          }
          if (this.st >= 0.9) {
            this.state = 'idle';
            this.st = 0;
            this.comboT = 9;
          }
        }
        break;
      }
      case 'hit': {
        this.vx *= Math.exp(-dt * 8);
        if (this.st >= this.stunT) {
          this.state = 'idle';
          this.st = 0;
        }
        break;
      }
      case 'ragdoll': {
        const r = this.rag;
        r.update(dt);
        this.x = clamp(r.p.pel.x, this.minX, this.maxX);
        if (this.hp < 75 && r.settle > 0.1) {
          this.poolT -= dt;
          if (this.poolT <= 0 && this.fx) {
            this.poolT = 0.18;
            this.fx.pool(r.p.pel.x, this.gy + 2 + Math.random() * 10, clamp((75 - this.hp) / 10, 2, 9));
          }
        }
        if (this.hp > 0 && r.t > 0.9 && r.settle > 0.35) this.startGetup();
        else if (this.hp > 0 && r.t > 4.5) this.startGetup();
        break;
      }
      case 'getup': {
        this.vx = 0;
        if (this.st > 2.05 && this.st < 2.65) {
          this.dustT -= dt;
          if (this.dustT <= 0 && this.rig && this.fx) {
            this.dustT = 0.1;
            this.fx.puff(
              lerp(this.rig.sh.x, this.rig.pel.x, 0.4) + this.dir * 8,
              lerp(this.rig.sh.y, this.rig.pel.y, 0.4),
              2,
              0.9,
            );
          }
        }
        if (this.st >= GETUP_DUR) {
          this.state = 'idle';
          this.st = 0;
          this.invT = 0.45;
          this.comboT = 9;
        }
        break;
      }
      default:
        break;
    }
    if (this.state !== 'ragdoll') {
      this.x += this.vx * dt;
      this.x = clamp(this.x, this.minX, this.maxX);
    }
    c.jump = c.punch = c.a1 = c.a2 = false;
    if (this.hp < 55 && this.hp > 0 && this.fx && this.rig && this.state !== 'spawn') {
      this.bleedT -= dt;
      if (this.bleedT <= 0) {
        this.bleedT = rnd(0.3, 0.7) * (1 + this.hp / 55);
        const h = this.rig.head;
        this.fx.drip(h.x + this.dir * 8, h.y + 8);
      }
    }
    this.buildRig(dt);
  }

  targetPose() {
    const s = this.state;
    const t = this.t;
    switch (s) {
      case 'spawn': {
        if (this.sp < 3) {
          const p = Object.assign({}, T_POSE);
          if (this.sp === 2) {
            p.H += Math.sin(this.st * 38) * 1.2 * (this.spT / 0.6);
            p.tl += Math.sin(this.st * 30) * 2 * (this.spT / 0.6);
          }
          p.ey = 0;
          return p;
        }
        return mixPose(T_POSE, D, ease(1 - this.spT / 0.55));
      }
      case 'getup':
        return sampleKF(GETUP, this.st);
      case 'win': {
        const p = Object.assign({}, WIN);
        p.H += Math.sin(t * 5) * 1.5;
        p.a1 += Math.sin(t * 9) * 6;
        p.a2 += Math.sin(t * 9 + 1) * 6;
        return p;
      }
      case 'hit': {
        const p = Object.assign({}, this.hitZone === 'head' ? HITH : HITB);
        const sh = Math.sin(this.st * 55) * Math.max(0, 1 - this.st / this.stunT) * 5;
        p.tl += sh;
        p.hd += sh * 1.3;
        return p;
      }
      case 'air': {
        const p = mixPose(FALL, RISE, clamp(this.vy / 650 + 0.1, 0, 1));
        p.tl += clamp((this.vx * this.dir) / 60, -4, 6);
        return p;
      }
      case 'dash':
        return this.dashF ? DASHF : DASHB;
      case 'attack':
        return sampleKF(this.atk.kf, this.st);
      case 'ability': {
        if (this.ab === 1) {
          let p = sampleKF(AB1, this.st);
          if (this.st > 0.28 && this.st < 0.64) {
            p = Object.assign({}, p);
            const ph = this.st * 30;
            p.f1x = 12 + 34 * Math.cos(ph);
            p.f1h = Math.max(0, -Math.sin(ph)) * 20;
            p.f2x = -12 + 34 * Math.cos(ph + Math.PI);
            p.f2h = Math.max(0, -Math.sin(ph + Math.PI)) * 20;
          }
          return p;
        }
        return sampleKF(AB2, this.st);
      }
      default:
        break;
    }
    // idle / walk
    const p = Object.assign({}, D);
    const sp = Math.abs(this.vx);
    const w = clamp(sp / 140, 0, 1);
    const b = t * 5.6 + this.seed;
    p.H += Math.sin(b) * 1.7 * (1 - w);
    p.tl += Math.sin(b + 1) * 1.2 * (1 - w);
    p.a1 += Math.sin(b + 0.6) * 3 * (1 - w);
    p.a2 += Math.sin(b + 1.2) * 3 * (1 - w);
    p.f1x += Math.sin(t * 2.8) * 2 * (1 - w);
    p.f2x -= Math.sin(t * 2.8) * 2 * (1 - w);
    if (w > 0) {
      const fwd = this.vx * this.dir >= 0;
      const ph = this.walkPh;
      const A = fwd ? 21 : 14;
      const c1 = Math.cos(ph);
      const c2 = Math.cos(ph + Math.PI);
      const s1 = Math.sin(ph);
      const s2 = Math.sin(ph + Math.PI);
      p.f1x = lerp(p.f1x, D.f1x + (fwd ? 3 : -2) + A * c1, w);
      p.f2x = lerp(p.f2x, D.f2x + (fwd ? 3 : -2) + A * c2, w);
      p.f1h = Math.max(0, -s1) * (fwd ? 15 : 11) * w;
      p.f2h = Math.max(0, -s2) * (fwd ? 15 : 11) * w;
      p.H += (-2 + 3.2 * Math.abs(Math.sin(ph))) * w;
      p.tl += (fwd ? 7 : -6) * w;
      p.hd += (fwd ? 3 : -4) * w;
      p.px += (fwd ? 3 : -3) * w;
      p.a1 += Math.sin(ph * 2) * (fwd ? 8 : 4) * w;
      p.a2 += Math.sin(ph * 2 + 1.5) * (fwd ? 6 : 3) * w;
      if (!fwd) {
        p.e1 += 10 * w;
        p.e2 += 8 * w;
      }
    }
    if (this.landT > 0) return mixPose(p, LAND, clamp(this.landT / 0.12, 0, 1));
    if (this.hp < 30) {
      p.tl += 6;
      p.H -= 4;
      p.mo = 0.25 + 0.2 * Math.sin(t * 9);
      p.hd += 4;
    }
    return p;
  }

  buildRig(dt) {
    if (this.state === 'ragdoll') {
      this.rig = this.rag.toRig(this);
      return;
    }
    const tp = this.targetPose();
    const hard = this.state === 'getup' || this.state === 'spawn';
    const k = hard
      ? 1
      : this.state === 'attack' || this.state === 'ability' || this.state === 'hit'
        ? 1 - Math.exp(-dt * 45)
        : 1 - Math.exp(-dt * 24);
    this.cur = this.cur && !hard ? mixPose(this.cur, tp, k) : Object.assign({}, tp);
    let R = computeRig(this.cur, this.x, this.gy, this.y, this.dir);
    if (this.state === 'getup' && this.blend > 0 && this.blendFrom) {
      R = blendRig(this.blendFrom, R, ease(1 - this.blend / 0.3));
    }
    this.rig = R;
  }
}
