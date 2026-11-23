// ИИ соперника: дистанции, страх, наказание за промахи, уклонения.
import { rnd } from './utils.js';

export class AI {
  constructor(f) {
    this.f = f;
    this.reset();
  }

  reset() {
    this.mode = 'hold';
    this.modeT = 0.6;
    this.fear = 0;
    this.punches = 0;
    this.lastHp = 100;
    this.seen = 0;
    this.pend = 0;
    this.bold = rnd(0.35, 0.65);
    this.react = 0.45;
  }

  update(dt, o, G) {
    const f = this.f;
    const c = f.ctrl;
    c.mx = 0;
    if (f.hp < this.lastHp) {
      this.fear += (this.lastHp - f.hp) * 0.03;
      this.punches = 0;
    }
    this.lastHp = f.hp;
    this.fear = Math.max(0, this.fear - dt * 0.1);
    const fear = clampNum(
      0.08 +
        (1 - f.hp / 100) * 0.45 +
        (o.hp > f.hp + 25 ? 0.12 : 0) -
        (o.hp < 30 ? 0.3 : 0) -
        this.bold * 0.12 +
        this.fear,
      0,
      1,
    );
    const dx = o.x - f.x;
    const dist = Math.abs(dx);
    const tw = dx >= 0 ? 1 : -1;
    const cornered =
      (-tw > 0 && f.x > f.maxX - 110) || (-tw < 0 && f.x < f.minX + 110);
    const idle = f.state === 'idle';
    // цепочка ударов
    if (this.punches > 0) {
      if (f.state === 'attack') {
        if (f.ak < 3 && f.st >= f.atk.cancel - 0.04) {
          if (this.cs !== f.atkStamp) {
            this.cs = f.atkStamp;
            c.punch = true;
            this.punches--;
          }
        } else if (f.st > f.atk.he + 0.03 && !f.connected) {
          this.punches = 0;
        }
      } else if (idle && dist < 122) {
        c.punch = true;
        this.punches--;
      } else if (f.state === 'hit' || f.state === 'ragdoll') {
        this.punches = 0;
      }
    }
    // реакции на удар соперника
    if (o.atkStamp !== this.seen) {
      this.seen = o.atkStamp;
      if (o.state === 'attack' && idle && dist < o.atk.reach + 50 && Math.random() < this.react) {
        const r = Math.random();
        if (f.dashCD <= 0 && r < 0.55) this.pend = -tw;
        else if (r < 0.8) {
          this.mode = 'retreat';
          this.modeT = rnd(0.3, 0.6);
        } else if (dist < 105) {
          this.punches = 1;
        }
      }
    }
    // наказание за промахи
    if (
      idle &&
      this.punches === 0 &&
      o.state === 'attack' &&
      o.st > o.atk.he + 0.04 &&
      dist < 118 &&
      Math.random() < dt * 7
    ) {
      this.punches = Math.random() < 0.5 ? 4 : Math.floor(rnd(2, 4));
    }
    // уклонение от ударной волны
    for (const p of G.proj) {
      if (
        p.owner !== f &&
        Math.sign(f.x - p.x) === p.dir &&
        Math.abs(p.x - f.x) < 250 &&
        idle &&
        Math.random() < dt * 5
      ) {
        c.jump = true;
        break;
      }
    }
    // анти-эйр
    if (idle && o.y > 40 && dist < 100 && Math.random() < dt * 4) c.punch = true;
    this.modeT -= dt;
    if (this.modeT <= 0 && idle && this.punches === 0) {
      this.pick(f, o, dist, tw, fear, cornered);
    }
    if (idle) {
      let usedPend = false;
      if (this.pend) {
        c.mx = this.pend;
        c.jump = true;
        this.pend = 0;
        usedPend = true;
      } else if (this.punches > 0) {
        c.mx = dist > 100 ? tw : 0;
      } else if (this.mode === 'approach') {
        c.mx = dist > 98 ? tw : 0;
      } else if (this.mode === 'retreat') {
        c.mx = cornered ? 0 : -tw;
        if (cornered) {
          this.mode = 'hold';
          this.modeT = 0.2;
        }
      } else if (this.mode === 'hold') {
        c.mx = Math.sin(f.t * 2.3 + f.seed) > 0.75 ? -tw : 0;
      }
      if (c.jump && !usedPend) c.mx = 0;
    } else if (f.state === 'air') {
      c.mx = dist > 90 ? tw : 0;
      if (dist < 110 && Math.random() < dt * 6) c.punch = true;
    }
  }

  pick(f, o, dist, tw, fear, cornered) {
    const c = f.ctrl;
    const r = Math.random();
    const down = o.state === 'ragdoll' || o.state === 'getup' || o.state === 'spawn';
    if (down) {
      if (dist > 125) {
        this.mode = 'approach';
        this.modeT = 0.3;
      } else {
        this.mode = 'hold';
        this.modeT = 0.35;
      }
      return;
    }
    if (fear > 0.5 && r < 0.7 && !cornered) {
      this.mode = 'retreat';
      this.modeT = rnd(0.5, 1.1);
      if (f.dashCD <= 0 && Math.random() < 0.3 && dist < 160) this.pend = -tw;
      return;
    }
    if (dist > 340) {
      if (f.cd1 <= 0 && dist < 470 && r < 0.4 && fear < 0.6) {
        c.a1 = true;
        this.modeT = 1;
        return;
      }
      if (f.dashCD <= 0 && r < 0.55) {
        this.pend = tw;
        this.modeT = 0.4;
        return;
      }
      this.mode = 'approach';
      this.modeT = rnd(0.3, 0.6);
      return;
    }
    if (dist > 170) {
      if (f.cd2 <= 0 && o.y < 5 && r < 0.28 && fear < 0.7) {
        c.a2 = true;
        this.modeT = 1;
        return;
      }
      if (f.cd1 <= 0 && dist < 420 && r < 0.5 && fear < 0.6) {
        c.a1 = true;
        this.modeT = 1;
        return;
      }
      if (r < 0.75) {
        this.mode = 'approach';
        this.modeT = rnd(0.2, 0.45);
      } else if (r < 0.88) {
        this.mode = 'hold';
        this.modeT = rnd(0.2, 0.5);
      } else {
        this.mode = 'retreat';
        this.modeT = rnd(0.25, 0.5);
      }
      return;
    }
    if (dist < 135) {
      if (r < 0.6 + (1 - fear) * 0.25 || o.hp < 35) {
        this.punches = Math.random() < 0.45 ? 4 : Math.floor(rnd(2, 4.99));
        this.mode = 'approach';
        this.modeT = 0.5;
      } else if (r < 0.8) {
        this.mode = 'retreat';
        this.modeT = rnd(0.3, 0.6);
        if (f.dashCD <= 0 && Math.random() < 0.4) this.pend = -tw;
      } else if (r < 0.9) {
        c.jump = true;
        this.modeT = 0.8;
      } else {
        this.mode = 'hold';
        this.modeT = 0.3;
      }
    } else {
      this.mode = 'approach';
      this.modeT = 0.2;
    }
  }
}

function clampNum(v, a, b) {
  return v < a ? a : v > b ? b : v;
}
