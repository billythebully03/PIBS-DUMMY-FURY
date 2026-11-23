// Портрет бойца для карточек в выборе персонажа.
// silhouette=true — тёмный силуэт с замочком для ещё не открытых бойцов.
import { COL_BLUE } from './palette.js';
import { TORSO, HEAD, HAIR, drawTorso, drawHead } from './draw.js';
import { newWounds } from './wounds.js';

export function drawBust(cv, { silhouette = false } = {}) {
  const x = cv.getContext('2d');
  const w = cv.width;
  const h = cv.height;
  const g = x.createRadialGradient(w * 0.5, h * 0.4, 5, w * 0.5, h * 0.5, w * 0.8);
  g.addColorStop(0, silhouette ? '#2a2033' : '#5a2a20');
  g.addColorStop(1, '#120c10');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);

  const s = w / 62;
  x.save();
  x.scale(s, s);
  if (silhouette) {
    x.fillStyle = '#0a0a10';
    x.fill(TORSO);
    x.fill(HEAD);
    x.fill(HAIR);
    x.strokeStyle = 'rgba(150,140,190,.3)';
    x.lineWidth = 0.7;
    x.stroke(TORSO);
    x.stroke(HEAD);
  } else {
    const f = { wounds: newWounds(), col: COL_BLUE };
    drawTorso(x, { dir: 1, neck: { x: 24, y: 50 }, pel: { x: 24, y: 104 }, sh: { x: 24, y: 54 } }, f);
    drawHead(x, { dir: 1, head: { x: 28, y: 29 }, neck: { x: 24, y: 50 }, mo: 0, ey: 0 }, f);
  }
  x.restore();

  const v = x.createLinearGradient(0, h * 0.6, 0, h);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,.65)');
  x.fillStyle = v;
  x.fillRect(0, 0, w, h);
}
