// @ts-nocheck
// Side-view manual wheelchair. Its coordinates are world coordinates, not a
// decoration attached to the body: after a fall it can roll separately.
const TAU = Math.PI * 2;

function line(g, color, width, ...points) {
  g.strokeStyle = color; g.lineWidth = width; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) g.lineTo(points[i], points[i + 1]);
  g.stroke();
}
function wheel(g, x, y, radius, angle, small = false) {
  g.save(); g.translate(x, y);
  g.fillStyle = '#101216'; g.beginPath(); g.arc(0, 0, radius, 0, TAU); g.fill();
  g.fillStyle = '#343a3c'; g.beginPath(); g.arc(0, 0, radius - (small ? 3 : 5), 0, TAU); g.fill();
  g.strokeStyle = '#9aacae'; g.lineWidth = small ? 1.5 : 2.4;
  g.beginPath(); g.arc(0, 0, radius - (small ? 3 : 6), 0, TAU); g.stroke();
  g.rotate(angle);
  const spokes = small ? 4 : 12;
  for (let i = 0; i < spokes; i++) {
    const a = i * TAU / spokes, r = radius - (small ? 4 : 7);
    line(g, i % 2 ? '#9aa9a8' : '#c3ccca', small ? 1 : 1.5, 0, 0, Math.cos(a) * r, Math.sin(a) * r);
  }
  g.fillStyle = '#e1ded0'; g.beginPath(); g.arc(0, 0, small ? 2 : 4, 0, TAU); g.fill();
  g.fillStyle = '#535a59'; g.beginPath(); g.arc(0, 0, small ? 1 : 2, 0, TAU); g.fill();
  g.restore();
}
function local(g, chair, draw) {
  if (!chair || !Number.isFinite(chair.x) || !Number.isFinite(chair.y)) return;
  g.save(); g.translate(chair.x, chair.y); g.scale(chair.dir || 1, 1); draw(); g.restore();
}
export function drawWheelchairBack(g, chair) {
  local(g, chair, () => {
    // Push handles, black upholstered back and a separate padded seat.
    line(g, '#14171a', 7, -32, -62, -34, -116, -43, -121);
    line(g, '#a0aaaa', 3, -32, -62, -34, -116, -42, -120);
    line(g, '#17191c', 5, -45, -121, -34, -121);
    g.fillStyle = '#111416'; g.fillRect(-33, -111, 13, 47);
    g.fillStyle = '#343837'; g.fillRect(-30, -107, 7, 37);
    g.fillStyle = '#1a1c1d'; g.fillRect(-27, -66, 49, 10);
    g.fillStyle = '#4a4c49'; g.fillRect(-25, -67, 44, 3);
    // Opposite hand rim and tubular X frame behind the seated figure.
    wheel(g, -17, -39, 36, chair.angle * (chair.dir || 1));
    line(g, '#202527', 7, -27, -62, 25, -10, 42, -10);
    line(g, '#9da9a7', 3, -27, -62, 25, -10, 42, -10);
    line(g, '#859290', 3, -18, -8, 19, -59, 39, -59, 48, -15);
  });
}
export function drawWheelchairFront(g, chair) {
  local(g, chair, () => {
    // A narrow outer hand rim leaves the clothes and bent knees readable.
    g.strokeStyle = '#d2d7d0'; g.lineWidth = 2.2; g.beginPath();
    g.arc(-17, -39, 31, 0, TAU); g.stroke();
    line(g, '#21272a', 6, -29, -78, 12, -78, 18, -68);
    line(g, '#9ca8a4', 3, -28, -76, 12, -76, 20, -61, 38, -54, 47, -17);
    g.fillStyle = '#111619'; g.fillRect(-31, -82, 45, 6);
    g.fillStyle = '#5e6662'; g.fillRect(-28, -82, 36, 2);
    line(g, '#c4ceca', 3, -17, -39, 11, -14, 41, -14);
    wheel(g, 47, -11, 10, chair.angle * (chair.dir || 1) * 2, true);
    line(g, '#d4d8d0', 4, 25, -14, 58, -14);
    g.fillStyle = '#262c2d'; g.fillRect(37, -17, 22, 4);
    // The familiar little brass call bell on the armrest.
    g.fillStyle = '#553a11'; g.fillRect(5, -88, 12, 6);
    g.fillStyle = '#bd8f32'; g.fillRect(6, -91, 10, 6);
    g.fillStyle = '#f1d17c'; g.fillRect(8, -93, 5, 3); g.fillRect(8, -90, 4, 2);
    g.fillStyle = '#e7d49d'; g.fillRect(10, -95, 2, 2);
  });
}
