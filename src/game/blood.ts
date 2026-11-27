// @ts-nocheck
/*
 * Blood on the floor is a small, connected pixel field rather than a stack of
 * translucent stamps. Neighboring drops join into one shape, so a growing
 * puddle has one outline and a mostly uniform interior. Coordinates are world
 * coordinates; the same field is used for both rendering and foot contacts.
 */
const Q = 3;
const STRIDE = 1024;
const MAX_GROUPS = 260;
const MAX_CELLS = 12000;
const key = (x, y) => x * STRIDE + y;
const column = k => Math.floor(k / STRIDE);
const row = k => k - column(k) * STRIDE;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const seedNow = () => {
  if (globalThis.crypto?.getRandomValues) {
    const value = new Uint32Array(1); globalThis.crypto.getRandomValues(value); return value[0];
  }
  return (Date.now() ^ Math.floor((globalThis.performance?.now?.() || 0) * 1000)) >>> 0;
};

export class BloodField {
  constructor(width, ground, seed = seedNow()) {
    this.width = width; this.ground = ground; this.state = (seed >>> 0) || 1;
    this.cells = new Map(); this.groups = new Set(); this.sources = new Map(); this.version = 0;
  }
  random() {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state / 4294967296;
  }
  range(a, b) { return a + this.random() * (b - a); }
  resize(width, ground) { this.width = width; this.ground = ground; }
  clear() { this.cells.clear(); this.groups.clear(); this.sources.clear(); this.version++; }
  isPuddle(group) {
    // A couple of isolated flecks, even a large impact fleck, cannot splash.
    return !!group && group.drops >= 3 && group.cells.size >= 18;
  }
  hasPuddles() { for (const group of this.groups) if (this.isPuddle(group)) return true; return false; }
  merge(into, from) {
    if (!from || from === into || !this.groups.has(from)) return;
    for (const k of from.cells) { into.cells.add(k); this.cells.set(k, into); }
    into.drops += from.drops; into.mass += from.mass;
    this.groups.delete(from);
  }
  addCell(group, x, y) {
    if (y < 0 || y >= STRIDE) return;
    const k = key(x, y), existing = this.cells.get(k);
    if (existing && existing !== group) this.merge(group, existing);
    // Adjacent patches also become the same puddle, without an internal seam.
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const other = this.cells.get(key(x + dx, y + dy));
      if (other && other !== group) this.merge(group, other);
    }
    group.cells.add(k); this.cells.set(k, group);
  }
  bridge(group, ax, ay, bx, by) {
    // A one-cell-wide irregular neck makes nearby drops physically contiguous.
    let x = ax, y = ay; this.addCell(group, x, y);
    while (x !== bx || y !== by) {
      if (x !== bx) { x += Math.sign(bx - x); this.addCell(group, x, y); }
      if (y !== by) { y += Math.sign(by - y); this.addCell(group, x, y); }
    }
  }
  add(x, y, kind = 'drip', size = 1) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const cx = Math.round(clamp(x, 0, this.width) / Q);
    // Most blood reaches the foreground of the floor, not the back wall.
    const cy = Math.round(clamp(y, this.ground - 3, this.ground + 33) / Q);
    const small = kind === 'drip' || kind === 'splash' ? [[0,0],[1,0]] : [[-1,0],[0,0],[1,0],[0,1]];
    if (kind === 'hit' && size > 3) small.push([-1,1], [1,1]);

    // Look for near neighbors around the *new* drop, rather than merging all
    // puddles merely because their bounding boxes happen to overlap.
    const nearby = new Map();
    for (const [sx, sy] of small) for (let dx = -2; dx <= 2; dx++) for (let dy = -1; dy <= 1; dy++) {
      const owner = this.cells.get(key(cx + sx + dx, cy + sy + dy));
      if (!owner) continue;
      const d = Math.abs(dx) + Math.abs(dy);
      const old = nearby.get(owner);
      if (!old || d < old.d) nearby.set(owner, { d, ax: cx + sx, ay: cy + sy, bx: cx + sx + dx, by: cy + sy + dy });
    }
    const candidates = [...nearby.keys()].sort((a, b) => b.cells.size - a.cells.size);
    const group = candidates[0] || { cells: new Set(), drops: 0, mass: 0 };
    if (!candidates.length) this.groups.add(group);
    for (const other of candidates.slice(1)) this.merge(group, other);
    for (const link of nearby.values()) this.bridge(group, link.ax, link.ay, link.bx, link.by);
    for (const [dx, dy] of small) this.addCell(group, cx + dx, cy + dy);
    const amount = kind === 'splash' ? 0 : kind === 'hit' ? clamp(size / 2.5, 1, 1.8) : kind === 'seep' ? 1.15 : 1;
    if (amount) group.drops++;
    group.mass += amount;

    // Swelling is driven by deposits *near this location*, not by the total
    // mass of an already-connected pool. Otherwise every new fleck on a large
    // pool would expand the whole shoreline and rapidly flood the arena.
    const bx = Math.floor(cx / 4), by = Math.floor(cy / 3);
    if (amount) this.sources.set(key(bx, by), Math.min(100, (this.sources.get(key(bx, by)) || 0) + amount));
    let localMass = 0;
    if (amount) for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++)
      localMass += (this.sources.get(key(bx + dx, by + dy)) || 0) * (dx ? .5 : 1) * (dy ? .6 : 1);
    if (amount && group.drops >= 2 && localMass >= 1.5) {
      // Repeated local deposits spread liquid rather than stacking dark stamps.
      // The taper leaves an irregular, contiguous edge and a solid interior.
      const root = Math.sqrt(localMass);
      const rx = Math.min(12, Math.max(2, Math.round(1 + root * 1.05)));
      const ry = Math.min(4, Math.max(1, Math.floor(.65 + root * .42)));
      const phase = Math.floor(this.random() * 10000);
      for (let dy = -ry; dy <= ry; dy++) {
        const taper = Math.sqrt(Math.max(0, 1 - (dy / (ry + .65)) ** 2));
        const wiggle = (((Math.imul(dy + 19, 1103515245) + phase) >>> 8) % 3) - 1;
        const extent = Math.max(1, Math.round(rx * taper) + wiggle);
        const offset = dy === 0 ? 0 : (((phase + dy * 17) % 3 + 3) % 3) - 1;
        for (let dx = -extent + offset; dx <= extent + offset; dx++) this.addCell(group, cx + dx, cy + dy);
      }
    }
    this.trim();
    this.version++;
    return group;
  }
  trim() {
    // Bound memory and redraw cost in an unattended, indefinitely running game.
    let removed = false;
    while (this.groups.size > MAX_GROUPS || this.cells.size > MAX_CELLS) {
      const oldest = this.groups.values().next().value;
      if (!oldest) break;
      for (const k of oldest.cells) if (this.cells.get(k) === oldest) this.cells.delete(k);
      this.groups.delete(oldest); removed = true;
    }
    // Discard stale local concentrations when old floor blood is evicted.
    if (removed) this.sources.clear();
  }
  puddleAtFoot(x, ground = this.ground) {
    // Floor depth is flattened in this side view: a foot at ground level can
    // contact the nearby visible portion of a puddle a little farther forward.
    const cx = Math.round(x / Q);
    const top = Math.floor((ground - 3) / Q), bottom = Math.ceil((ground + 24) / Q);
    for (let dx = -2; dx <= 2; dx++) for (let y = top; y <= bottom; y++) {
      const group = this.cells.get(key(cx + dx, y));
      if (this.isPuddle(group)) return group;
    }
    return null;
  }
  isInterior(k) {
    const x = column(k), y = row(k);
    return this.cells.has(key(x - 1, y)) && this.cells.has(key(x + 1, y)) &&
      this.cells.has(key(x, y - 1)) && this.cells.has(key(x, y + 1));
  }
  drawBase(g) {
    // Fill the union in two paths rather than alpha-blending individual cells.
    // Fractional device scales otherwise produce a checkerboard of seams.
    g.fillStyle = '#5e0916'; g.beginPath();
    for (const group of this.groups) for (const k of group.cells)
      g.rect(column(k) * Q, row(k) * Q, Q, Q);
    g.fill();
    g.fillStyle = '#790e1b'; g.beginPath();
    for (const group of this.groups) for (const k of group.cells) if (this.isInterior(k))
      g.rect(column(k) * Q, row(k) * Q, Q, Q);
    g.fill();
  }
  drawReflectionMask(g) {
    // The mask changes only when the blood changes, so it can be cached; a
    // complex pixel clip does not need to be rebuilt on every animation frame.
    g.fillStyle = '#fff'; g.beginPath();
    for (const p of this.groups) if (this.isPuddle(p)) for (const k of p.cells) if (this.isInterior(k))
      g.rect(column(k) * Q, row(k) * Q, Q, Q);
    g.fill();
  }
  drawReflections(g, fighters, lamps, time, mask) {
    if (!mask || !this.hasPuddles()) return;
    g.save();
    // The compressed mirror follows the real animated joints and lamp
    // positions, then is masked to the inside of substantial puddles.
    const mirror = p => ({ x: p.x + Math.sin(time * 2 + p.y * .03) * 1.2,
      y: this.ground + 2 + Math.max(0, this.ground - p.y) * .14 });
    g.lineCap = 'butt'; g.lineWidth = 4;
    for (const f of fighters) {
      const R = f.rig;
      if (!R || !f.visible || (f.state === 'spawn' && f.sp === 0)) continue;
      g.strokeStyle = 'rgba(241,183,160,.16)'; g.beginPath();
      for (const [a, b] of [['sh','pel'],['pel','kN'],['kN','aN'],['pel','kF'],['kF','aF'],['sh','eN'],['eN','wN'],['sh','eF'],['eF','wF'],['sh','head']]) {
        if (!R[a] || !R[b]) continue;
        const p = mirror(R[a]), q = mirror(R[b]); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y);
      }
      g.stroke();
      if (f.lz?.on) {
        const p = mirror({ x: f.lz.sx, y: f.lz.sy }), q = mirror({ x: f.lz.ex, y: f.lz.ey });
        g.strokeStyle = 'rgba(255,100,60,.18)'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke();
      }
    }
    g.fillStyle = 'rgba(255,218,170,.18)';
    for (const lamp of lamps) if (!lamp.detached) {
      const x = Math.round((lamp.x + Math.sin(time * 1.6 + lamp.x) * 2) / Q) * Q;
      g.fillRect(x - Q, this.ground + 6, Q * 2, Q);
      g.fillRect(x + Q, this.ground + 12, Q * 2, Q);
      g.fillRect(x - Q * 2, this.ground + 18, Q, Q);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'destination-in'; g.drawImage(mask, 0, 0);
    g.restore();
  }
}
