// Арена: кирпич, неон, толпа, клетка, лампы, пол.
import { TAU, rnd } from './utils.js';

export function makeBG(W, H, gy, S) {
  const c = document.createElement('canvas');
  c.width = Math.round(W * S);
  c.height = Math.round(H * S);
  const x = c.getContext('2d');
  x.scale(S, S);

  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0b0910');
  g.addColorStop(0.6, '#221620');
  g.addColorStop(1, '#150f14');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);

  x.strokeStyle = 'rgba(0,0,0,.35)';
  x.lineWidth = 1;
  for (let y = 0, r = 0; y < gy - 60; y += 22, r++) {
    const off = (r % 2) * 30;
    for (let xx = -off; xx < W; xx += 60) x.strokeRect(xx, y, 60, 22);
  }
  for (let i = 0; i < 300; i++) {
    x.fillStyle = `rgba(${rnd(60, 130) | 0},${rnd(25, 50) | 0},${rnd(25, 45) | 0},${rnd(0.03, 0.1)})`;
    x.fillRect(rnd(W), rnd(gy - 60), rnd(10, 60), rnd(6, 22));
  }

  // неон
  x.save();
  x.font = "900 56px 'Dela Gothic One','Russo One',sans-serif";
  x.textAlign = 'center';
  x.shadowColor = '#ff2a44';
  x.shadowBlur = 28;
  x.strokeStyle = '#ff4a5e';
  x.lineWidth = 3;
  x.strokeText('DUMMY FURY', W / 2, 110);
  x.fillStyle = 'rgba(255,120,130,.25)';
  x.fillText('DUMMY FURY', W / 2, 110);
  x.restore();

  // толпа
  for (let row = 0; row < 2; row++) {
    const by = gy - 118 + row * 14;
    for (let xx = -10; xx < W + 20; xx += 24 + rnd(8)) {
      const hh = rnd(0, 8);
      const shade = row ? '#0b0809' : '#150f14';
      x.fillStyle = shade;
      x.beginPath();
      x.ellipse(xx, by + 34 - hh * 0.3, 17, 24, 0, Math.PI, 0);
      x.fill();
      x.fillRect(xx - 17, by + 34 - hh * 0.3, 34, 40);
      x.beginPath();
      x.arc(xx, by + 6 - hh, 9, 0, TAU);
      x.fill();
      x.fillStyle = 'rgba(255,170,120,.07)';
      x.beginPath();
      x.arc(xx - 2, by + 4 - hh, 8, Math.PI, Math.PI * 1.7);
      x.fill();
      if (Math.random() < 0.12) {
        x.strokeStyle = shade;
        x.lineWidth = 5;
        x.lineCap = 'round';
        x.beginPath();
        x.moveTo(xx + 10, by + 24);
        x.lineTo(xx + 16, by - 14 - hh);
        x.stroke();
      }
    }
  }

  // клетка
  x.strokeStyle = 'rgba(180,190,210,.06)';
  x.lineWidth = 1;
  for (let i = -H; i < W + H; i += 22) {
    x.beginPath();
    x.moveTo(i, 20);
    x.lineTo(i + H, 20 + H);
    x.stroke();
    x.beginPath();
    x.moveTo(i + H, 20);
    x.lineTo(i, 20 + H);
    x.stroke();
  }

  // перила
  x.fillStyle = '#17151b';
  x.fillRect(0, gy - 62, W, 8);
  x.fillStyle = 'rgba(255,255,255,.12)';
  x.fillRect(0, gy - 62, W, 1.5);
  x.fillStyle = '#0f0d12';
  for (let xx = 20; xx < W; xx += 70) x.fillRect(xx, gy - 54, 5, 30);

  // стойки
  x.fillStyle = '#14121a';
  x.fillRect(22, 0, 10, gy - 24);
  x.fillRect(W - 32, 0, 10, gy - 24);

  // лампы
  for (const lx of [W * 0.2, W * 0.5, W * 0.8]) {
    x.strokeStyle = '#333';
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(lx, 0);
    x.lineTo(lx, 34);
    x.stroke();
    x.fillStyle = '#2a2a30';
    x.beginPath();
    x.moveTo(lx - 22, 52);
    x.lineTo(lx - 8, 34);
    x.lineTo(lx + 8, 34);
    x.lineTo(lx + 22, 52);
    x.closePath();
    x.fill();
    x.fillStyle = '#ffe0a0';
    x.beginPath();
    x.ellipse(lx, 52, 17, 3.5, 0, 0, TAU);
    x.fill();
  }

  // пол
  const ft = gy - 24;
  const fg = x.createLinearGradient(0, ft, 0, H);
  fg.addColorStop(0, '#2d2b33');
  fg.addColorStop(1, '#16151a');
  x.fillStyle = fg;
  x.fillRect(0, ft, W, H - ft);
  x.fillStyle = 'rgba(0,0,0,.5)';
  x.fillRect(0, ft, W, 3);
  x.strokeStyle = 'rgba(0,0,0,.35)';
  x.lineWidth = 1.2;
  for (let k = -14; k <= 14; k++) {
    x.beginPath();
    x.moveTo(W / 2 + k * 34, ft);
    x.lineTo(W / 2 + k * 120, H);
    x.stroke();
  }
  for (let i = 1; i < 6; i++) {
    const y = ft + (H - ft) * Math.pow(i / 6, 1.6);
    x.beginPath();
    x.moveTo(0, y);
    x.lineTo(W, y);
    x.stroke();
  }
  x.strokeStyle = 'rgba(255,200,60,.22)';
  x.lineWidth = 3;
  x.beginPath();
  x.ellipse(W / 2, gy + 24, Math.min(W * 0.4, 360), 52, 0, 0, TAU);
  x.stroke();
  for (let i = 0; i < 500; i++) {
    x.fillStyle = `rgba(255,255,255,${rnd(0.01, 0.04)})`;
    x.fillRect(rnd(W), rnd(ft, H), rnd(1, 3), 1);
  }
  return c;
}

export function makeVignette(W, H, S) {
  const c = document.createElement('canvas');
  c.width = Math.round(W * S);
  c.height = Math.round(H * S);
  const x = c.getContext('2d');
  const g = x.createRadialGradient(
    c.width / 2, c.height / 2, c.height * 0.35,
    c.width / 2, c.height / 2, c.width * 0.65,
  );
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,.65)');
  x.fillStyle = g;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}
