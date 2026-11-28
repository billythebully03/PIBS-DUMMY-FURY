// @ts-nocheck
// A rubber duck is a real ballistic object: aim is solved once at release,
// then gravity and collisions take over. Nothing steers it after the throw.
const GRAVITY = 1450, RADIUS = 13, AIM_SPEED = 850, HIT_SPEED = 180;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const mix = (a, b, t) => a + (b - a) * t;
export const DUCK_RELEASE = .96;
export const DUCK_THROW_DURATION = 1.36;

// Hand-drawn pixel sprite based on the rounded yellow bath duck reference.
// The small canvas is enlarged without smoothing in the same style as the
// rest of the game; the eye, bill, wing and base remain legible at game scale.
const DUCK_SPRITE = (() => {
  const c = document.createElement('canvas'); c.width = 23; c.height = 21;
  const g = c.getContext('2d');
  const px = (x, y, w, h, color) => { g.fillStyle = color; g.fillRect(x, y, w, h); };
  const edge = '#92600b', shadow = '#bd8508', gold = '#e8b819', light = '#ffd63c';
  // Flat base, big rounded body and raised tail.
  px(5,17,13,3,edge); px(6,18,11,2,shadow); px(7,18,9,1,gold);
  px(3,9,17,8,edge); px(1,11,20,4,edge); px(4,8,14,10,edge);
  px(2,7,5,5,edge); px(3,8,5,3,light);
  px(3,10,16,6,gold); px(2,11,18,3,gold); px(4,15,14,2,shadow);
  px(4,10,13,3,light); px(5,13,11,2,'#f2c52a');
  // Wing with a stepped silhouette and a soft lower shadow.
  px(5,11,7,4,'#d29c0f'); px(6,10,7,4,'#f8cd2d');
  px(7,10,5,1,'#ffe26a'); px(7,14,5,1,'#daa414');
  // Round head and neck sit clearly above the body.
  px(9,1,7,1,edge); px(7,2,10,7,edge); px(6,4,12,4,edge);
  px(8,1,8,1,shadow); px(8,2,8,7,gold); px(7,4,10,4,gold);
  px(9,2,5,2,light); px(8,4,3,3,light); px(10,8,7,3,gold);
  // Glossy black eye and a projecting orange bill.
  px(13,3,3,3,'#3d2b15'); px(14,3,2,3,'#090b0c'); px(14,3,1,1,'#fff5cf');
  px(16,6,6,3,'#a84809'); px(17,5,4,3,'#e56a0c'); px(18,5,3,1,'#ff9b22');
  px(18,8,4,1,'#bf500b');
  return c;
})();

export function drawDuck(g, x, y, angle = 0, facing = 1) {
  g.save(); g.imageSmoothingEnabled = false; g.translate(x, y); g.rotate(angle);
  if (facing < 0) g.scale(-1, 1);
  g.drawImage(DUCK_SPRITE, -17.25, -15.75, 34.5, 31.5);
  g.restore();
}

function targetPoint(target, t) {
  const R = target.rig;
  const x = mix(R.neck.x, R.pel.x, .52), y = mix(R.neck.y, R.pel.y, .52);
  const vx = clamp(target.vx || 0, -540, 540);
  // Grounded fighters keep their height. For someone in a jump, extrapolate
  // their ballistic vertical motion, but never predict them through the floor.
  let dy = 0;
  if (target.y > 4 && target.state !== 'lamp_hang') {
    dy = Math.min(target.y, -(target.vy || 0) * t + .5 * 2200 * t * t);
  }
  return { x: clamp(x + vx * t, target.minX, target.maxX), y: y + dy };
}

export function launchDuck(game, owner, target, origin) {
  if (!target?.rig || !origin) return null;
  let t = clamp(Math.abs(target.x - origin.x) / AIM_SPEED, .24, 1.12);
  // Recompute lead for an opponent already moving; this is not homing.
  for (let i = 0; i < 5; i++) {
    const p = targetPoint(target, t);
    t = clamp(Math.abs(p.x - origin.x) / AIM_SPEED, .24, 1.12);
  }
  const p = targetPoint(target, t);
  const duck = {
    x: origin.x, y: origin.y, vx: (p.x - origin.x) / t,
    vy: (p.y - origin.y - .5 * GRAVITY * t * t) / t,
    angle: 0, spin: owner.dir * 5, facing: owner.dir,
    owner, age: 0, power: 1, hits: 0, bounces: 0, settled: false,
    cooldowns: new Map(), floor: game.gy, targetAtRelease: { ...p, time: t },
  };
  game.ducks.push(duck);
  if (game.ducks.length > 16) game.ducks.shift();
  return duck;
}

function closestOnSegment(x, y, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
  const t = clamp(((x - a.x) * dx + (y - a.y) * dy) / l2, 0, 1);
  return { x: a.x + dx * t, y: a.y + dy * t };
}
const CAPSULES = [
  ['neck','pel',17], ['pel','kN',10], ['pel','kF',10], ['kN','aN',8], ['kF','aF',8],
  ['neck','eN',7], ['eN','wN',6], ['neck','eF',7], ['eF','wF',6],
];
function bodyContact(f, d) {
  const R = f.rig; if (!R || f.gorePieces || f.state === 'spawn' || !f.visible) return null;
  if (Math.abs(d.x - R.pel.x) > 180) return null;
  let best = null;
  const check = (p, radius) => {
    const dx = d.x - p.x, dy = d.y - p.y, dist = Math.hypot(dx, dy), depth = RADIUS + radius - dist;
    if (depth > 0 && (!best || depth > best.depth)) {
      const speed = Math.hypot(d.vx, d.vy) || 1;
      best = { nx: dist > .001 ? dx / dist : -d.vx / speed,
        ny: dist > .001 ? dy / dist : -d.vy / speed, depth };
    }
  };
  if (!f.headDestroyed) check({ x: R.head.x, y: R.head.y - 6 }, 16);
  for (const [a,b,r] of CAPSULES) check(closestOnSegment(d.x,d.y,R[a],R[b]), r);
  return best;
}

function bounce(d, nx, ny, restitution, friction = .96) {
  const normalSpeed = d.vx * nx + d.vy * ny;
  if (normalSpeed >= 0) return false;
  const tx = d.vx - normalSpeed * nx, ty = d.vy - normalSpeed * ny;
  d.vx = tx * friction - normalSpeed * restitution * nx;
  d.vy = ty * friction - normalSpeed * restitution * ny;
  if (-normalSpeed > 55) {
    d.power *= .78; d.bounces++;
    d.spin = clamp(d.spin * .74 + (tx * ny - ty * nx) * .018, -12, 12);
  }
  return true;
}

export function updateDucks(game, dt, bridgeY, worldTop) {
  for (const d of game.ducks) {
    d.age += dt;
    if (d.settled) continue;
    const steps = Math.max(1, Math.ceil((Math.hypot(d.vx, d.vy) * dt + GRAVITY * dt * dt) / 7));
    const h = dt / Math.min(steps, 64);
    for (let i = 0; i < Math.min(steps, 64); i++) {
      const oldY = d.y;
      d.x += d.vx * h; d.y += d.vy * h + .5 * GRAVITY * h * h; d.vy += GRAVITY * h;
      d.angle += d.spin * h; d.spin *= Math.exp(-.08 * h);
      if (d.x < 34 + RADIUS) { d.x = 34 + RADIUS; bounce(d,1,0,.63); }
      if (d.x > game.W - 34 - RADIUS) { d.x = game.W - 34 - RADIUS; bounce(d,-1,0,.63); }
      if (d.y < worldTop + 18 + RADIUS) { d.y = worldTop + 18 + RADIUS; bounce(d,0,1,.58); }
      if (oldY + RADIUS <= bridgeY && d.y + RADIUS >= bridgeY && d.vy > 0) {
        d.y = bridgeY - RADIUS; d.floor = bridgeY; bounce(d,0,-1,.58,.82);
      } else if (oldY - RADIUS >= bridgeY + 18 && d.y - RADIUS <= bridgeY + 18 && d.vy < 0) {
        d.y = bridgeY + 18 + RADIUS; bounce(d,0,1,.58);
      }
      if (d.y + RADIUS >= game.gy) {
        d.y = game.gy - RADIUS; d.floor = game.gy; bounce(d,0,-1,.58,.82);
      }
      for (const f of game.fighters) {
        // A throw never hurts or rebounds from its owner, even after bouncing
        // back, and passes through dead bodies instead of treating them as walls.
        if (f === d.owner || game.areAllies?.(f, d.owner) || f.hp <= 0) continue;
        if ((d.cooldowns.get(f.id) || 0) > d.age) continue;
        const contact = bodyContact(f, d); if (!contact) continue;
        const vn = d.vx * contact.nx + d.vy * contact.ny;
        if (vn >= 0) continue;
        const speed = Math.hypot(d.vx, d.vy), direction = d.vx >= 0 ? 1 : -1;
        d.x += contact.nx * (contact.depth + .5); d.y += contact.ny * (contact.depth + .5);
        d.cooldowns.set(f.id, d.age + .24);
        if (speed >= HIT_SPEED && f.hp > 0) {
          const damage = clamp((speed - HIT_SPEED) / 70 * d.power, 1, 9);
          f.takeDuckHit(d, damage, direction, speed); d.hits++;
        }
        bounce(d, contact.nx, contact.ny, .68, .94);
        break;
      }
      // At rest against a deck, suppress subpixel bouncing while retaining
      // horizontal roll and enough speed to hit someone until it slows down.
      const touching = Math.abs(d.y + RADIUS - d.floor) < 1;
      if (touching && Math.abs(d.vy) < 28) {
        d.vy = 0; d.vx *= Math.exp(-3.5 * h); d.spin *= Math.exp(-4 * h);
        if (Math.abs(d.vx) < 12 && Math.abs(d.spin) < .5) {
          d.vx = d.vy = d.spin = 0; d.angle = 0; d.settled = true; break;
        }
      }
    }
  }
  // Bound clutter and resources during long autonomous matches.
  game.ducks = game.ducks.filter(d => d.age < (d.settled ? 24 : 18));
}
