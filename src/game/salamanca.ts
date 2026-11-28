// @ts-nocheck
// Pixel-art props and cutaway for Hector's one-shot call. Gameplay, timing and
// ally ownership live in the engine; these functions only paint actual state.
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mix = (a, b, t) => a + (b - a) * t;
const ease = t => t * t * (3 - 2 * t);
function poly(g, color, points) {
  g.fillStyle = color; g.beginPath(); g.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) g.lineTo(points[i], points[i + 1]);
  g.closePath(); g.fill();
}
function line(g, color, width, ...points) {
  g.strokeStyle = color; g.lineWidth = width; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) g.lineTo(points[i], points[i + 1]);
  g.stroke();
}
export function drawPhone(g, x, y, dir = 1, scale = 1) {
  g.save(); g.translate(x, y); g.scale((dir || 1) * scale, scale);
  // Palm-sized candy-bar phone: antenna, earpiece, screen and separate keys.
  g.fillStyle = '#080a0b'; g.fillRect(-5, -10, 10, 20); g.fillRect(2, -14, 2, 4);
  g.fillStyle = '#39403d'; g.fillRect(-4, -9, 8, 18);
  g.fillStyle = '#a4baad'; g.fillRect(-3, -7, 6, 5);
  g.fillStyle = '#d6e3cf'; g.fillRect(-2, -6, 4, 1);
  g.fillStyle = '#161c1b'; g.fillRect(-3, -1, 6, 2);
  g.fillStyle = '#c5c7ba';
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) g.fillRect(-3 + col * 2, 2 + row * 2, 1, 1);
  g.fillStyle = '#78827a'; g.fillRect(-4, 8, 8, 1); g.restore();
}
// Draw an entirely metallic axe in a coordinate system whose handle points +x.
export function drawAxeShape(g, blood = 0) {
  g.fillStyle = '#303c3f'; g.fillRect(0, -4, 66, 8);
  g.fillStyle = '#a7b6b7'; g.fillRect(1, -3, 64, 3);
  g.fillStyle = '#dae0d9'; g.fillRect(6, -2, 55, 1);
  g.fillStyle = '#6b7879'; g.fillRect(0, 2, 66, 2);
  // Broad polished head, bevel and cutting edge.
  poly(g, '#4f5c5c', [53,-6,66,-8,75,-19,83,-22,82,21,75,18,66,8,53,6]);
  poly(g, '#aab8b8', [58,-5,67,-7,75,-17,80,-19,79,18,75,15,67,7,58,5]);
  poly(g, '#e3e7de', [78,-18,82,-21,81,20,78,17]);
  g.fillStyle = '#d4d9d0'; g.fillRect(62, -5, 3, 10);
  if (blood > 0) {
    g.fillStyle = '#771019'; g.fillRect(72, -13, 5, 4); g.fillRect(75, -2, 4, 7);
    g.fillRect(68, 7, 5, 3); if (blood > .4) { g.fillRect(63, -2, 3, 5); g.fillRect(77, 9, 3, 5); }
    g.fillStyle = '#b42a2f'; g.fillRect(74, -12, 2, 2); g.fillRect(76, 0, 2, 2);
  }
}
export function drawHeldAxe(g, f, stowed = false) {
  const r = f.rig; if (!r) return;
  g.save();
  if (stowed) {
    const dx = r.pel.x - r.sh.x, dy = r.pel.y - r.sh.y;
    g.translate(r.sh.x - r.dir * 12, r.sh.y - 8); g.rotate(Math.atan2(dy, dx));
    if (r.dir < 0) g.scale(1, -1);
    drawAxeShape(g, f.axeBlood || 0);
  } else if (r.bd) {
    const v = r.bd; g.translate(r.wN.x - v.x * 16, r.wN.y - v.y * 16);
    g.rotate(Math.atan2(v.y, v.x)); if (v.x < 0) g.scale(1, -1);
    drawAxeShape(g, f.axeBlood || 0);
  }
  g.restore();
}
export function drawDroppedAxe(g, b) {
  g.save(); g.translate(b.x, b.y); g.rotate(b.ang); if (b.flip < 0) g.scale(1, -1);
  g.translate(-38, 0); drawAxeShape(g, b.blood || 0); g.restore();
}
function tumbleweed(g, x, y, radius, turn) {
  g.save(); g.translate(x, y); g.rotate(turn); g.strokeStyle = '#8b6938'; g.lineWidth = 2;
  g.beginPath(); g.arc(0, 0, radius, 0, TAU); g.stroke();
  for (let i = 0; i < 7; i++) {
    const a = i * TAU / 7; line(g, i % 2 ? '#a07b41' : '#6f542e', 1.5,
      Math.cos(a) * radius, Math.sin(a) * radius,
      Math.cos(a + 2) * radius * .25, Math.sin(a + 2) * radius * .25,
      Math.cos(a + 3.1) * radius * .85, Math.sin(a + 3.1) * radius * .85);
  }
  g.restore();
}
function desertTwin(g, x, y, scale, portrait, jacket, shirt, caller, hasAxe, time, phase) {
  const breath = Math.sin(time * 2.1 + phase);
  g.save(); g.translate(x, y + breath * scale * 1.2); g.scale(scale, scale); g.rotate(breath * .006);
  // Jacket and shirt are drawn to the waist, as in the supplied close-up.
  poly(g, '#111214', [-82,0,-56,-18,-29,-26,29,-26,56,-18,82,0,96,150,-96,150]);
  poly(g, jacket, [-75,2,-49,-16,-27,-22,-20,150,-91,150]);
  poly(g, jacket, [75,2,49,-16,27,-22,20,150,91,150]);
  poly(g, shirt, [-30,-24,0,5,30,-24,18,150,-18,150]);
  poly(g, '#1c2022', [-28,-23,-9,16,-26,49,-48,-13]);
  poly(g, '#1c2022', [28,-23,9,16,26,49,48,-13]);
  line(g, '#a6a5a0', 2, -45, -12, -26, 43, -18, 150);
  line(g, '#a6a5a0', 2, 45, -12, 26, 43, 18, 150);
  g.fillStyle = '#17191a'; g.fillRect(-5, 47, 10, 4); g.fillRect(-5, 87, 10, 4);
  // The user-provided matching portrait, with a neutral shape until loaded.
  if (portrait?.complete && portrait.naturalWidth) g.drawImage(portrait, -43, -155, 86, 132);
  else { g.fillStyle = '#a77b59'; g.fillRect(-39, -143, 78, 118); }
  const hand='#b7815e';
  if (caller) {
    const lift = ease(clamp(time / .65, 0, 1));
    const ex = mix(67, 72, lift), ey = mix(65, -48, lift);
    const wx = mix(48, 51, lift), wy = mix(105, -86, lift);
    line(g, '#171a1c', 29, 59, 4, ex, ey, wx, wy);
    line(g, jacket, 22, 59, 4, ex, ey, wx, wy);
    g.fillStyle = hand; g.fillRect(wx - 8, wy - 13, 19, 17);
    drawPhone(g, wx - 5, wy - 16, 1, 1.4);
  } else {
    line(g, '#171a1c', 30, 59, 5, 67, 65, 48, 105);
    line(g, jacket, 22, 59, 5, 67, 65, 48, 105);
    g.fillStyle = hand; g.fillRect(38, 99, 18, 17);
  }
  if (hasAxe) {
    g.save(); g.translate(-54, 100); g.rotate(-1.17); g.scale(1.15, 1.15); drawAxeShape(g, 0); g.restore();
    g.fillStyle = hand; g.fillRect(-64, 87, 18, 17);
  } else {
    line(g, '#171a1c', 30, -59, 5, -67, 67, -49, 105);
    line(g, jacket, 22, -59, 5, -67, 67, -49, 105);
    g.fillStyle = hand; g.fillRect(-58, 99, 18, 17);
  }
  g.restore();
}
export function drawFamilyDesert(g, W, H, portrait, special) {
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#ba8752'); sky.addColorStop(.55, '#e5b76f'); sky.addColorStop(1, '#c19353');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  poly(g, '#c99b60', [0,H*.64,W*.18,H*.52,W*.36,H*.61,W*.56,H*.49,W*.76,H*.62,W,H*.53,W,H,0,H]);
  poly(g, '#d5ac6d', [0,H*.78,W*.2,H*.69,W*.43,H*.78,W*.69,H*.64,W,H*.74,W,H,0,H]);
  tumbleweed(g, W*.11, H*.79, 14, special.t*.3);
  tumbleweed(g, W*.89, H*.76, 9, -special.t*.26);
  const scale = Math.min(W / 760, H / 430) * 1.08, y=H*.67;
  desertTwin(g, W*.31, y, scale, portrait, '#a6a8a5', '#882b39', special.caller===0, special.axeIndex===0, special.t, 0);
  desertTwin(g, W*.69, y, scale, portrait, '#414647', '#216c83', special.caller===1, special.axeIndex===1, special.t, 1.1);
}
export function drawMercedes(g, car) {
  g.save(); g.translate(car.x, car.y); g.scale(car.dir, 1);
  // Wheels sit below a four-door passenger car, about twice a person's height
  // in length, not a toy or a bus. Windows stay darkly tinted.
  for (const x of [-116, 113]) {
    g.fillStyle='#08090a'; g.beginPath(); g.arc(x,-23,25,0,TAU); g.fill();
    g.fillStyle='#687071'; g.beginPath(); g.arc(x,-23,15,0,TAU); g.fill();
    g.save();g.translate(x,-23);g.rotate(car.wheelAngle||0);
    for(let i=0;i<6;i++){const a=i*TAU/6;line(g,'#c1c8c5',2,0,0,Math.cos(a)*12,Math.sin(a)*12);}
    g.restore();g.fillStyle='#bfc7c5';g.beginPath();g.arc(x,-23,4,0,TAU);g.fill();
  }
  poly(g,'#07090a',[-187,-28,-182,-66,-160,-78,-115,-84,-67,-119,46,-124,103,-89,158,-79,183,-64,188,-31,175,-23,143,-24,136,-40,125,-48,101,-48,88,-40,84,-24,-88,-24,-93,-40,-105,-48,-128,-48,-142,-39,-147,-24,-180,-23]);
  poly(g,'#23292a',[-168,-72,-116,-79,-66,-115,43,-119,96,-87,151,-76,173,-64,167,-54,-162,-54]);
  poly(g,'#101a1e',[-106,-82,-61,-112,-11,-114,-11,-83]);
  poly(g,'#101a1e',[-5,-114,40,-115,84,-87,-5,-83]);
  poly(g,'#34454a',[-99,-84,-58,-109,-45,-110,-79,-84]);
  poly(g,'#34454a',[9,-111,36,-112,71,-90,49,-91]);
  line(g,'#727a78',2,-115,-81,95,-81,151,-72);
  line(g,'#454d4d',2,-10,-81,-10,-28);line(g,'#454d4d',2,84,-80,84,-28);
  line(g,'#555d5c',2,-161,-48,170,-48);line(g,'#66706d',2,-160,-31,168,-31);
  g.fillStyle='#aeb6b1';g.fillRect(-63,-62,18,3);g.fillRect(35,-62,18,3);
  // Headlight, tail lamp, chrome bumper, grille and three-pointed emblem.
  g.fillStyle='#efdba5';g.fillRect(159,-65,17,9);g.fillStyle='#9a1b1a';g.fillRect(-179,-62,10,10);
  g.fillStyle='#919c99';g.fillRect(169,-45,14,14);g.fillStyle='#313a3b';g.fillRect(172,-42,9,8);
  g.strokeStyle='#cbd2ce';g.lineWidth=1.4;g.beginPath();g.arc(176,-38,4,0,TAU);g.stroke();
  line(g,'#cbd2ce',1,176,-38,176,-42);line(g,'#cbd2ce',1,176,-38,173,-36);line(g,'#cbd2ce',1,176,-38,179,-36);
  if (car.doors > 0) {
    const d=clamp(car.doors,0,1);
    line(g,'#090c0d',7,-80,-77,-80-30*d,-72,-80-40*d,-34);
    line(g,'#586362',2,-80,-77,-80-30*d,-72,-80-40*d,-34);
    line(g,'#090c0d',7,54,-77,54+30*d,-72,54+40*d,-34);
    line(g,'#586362',2,54,-77,54+30*d,-72,54+40*d,-34);
  }
  g.restore();
}
