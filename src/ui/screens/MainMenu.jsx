import { useEffect, useRef } from 'react';
import { Showcase } from '../../game/showcase.js';
import { Snd } from '../../game/audio.js';
import { COL_BLUE, COL_RED } from '../../game/palette.js';

const GLOWS = ['#43121a', '#2a1a10', '#3b1219', '#241a2c'];

// Случайная кукла из доступных образцов (пока это TEST DUMMY в разных цветах).
function randomLook() {
  return {
    dir: Math.random() < 0.5 ? -1 : 1,
    glow: GLOWS[(Math.random() * GLOWS.length) | 0],
    col: Math.random() < 0.5 ? COL_BLUE : COL_RED,
  };
}

export default function MainMenu({ onPlay }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const look = randomLook();
    const show = new Showcase(canvasRef.current, {
      cx: 0.3,
      dir: look.dir,
      glow: look.glow,
      col: look.col,
    });
    show.resize();
    const spawnT = setTimeout(() => show.spawn(0.2), 300);

    let raf = 0;
    let last = performance.now();
    const loop = (ts) => {
      const dt = Math.min(0.033, (ts - last) / 1000);
      last = ts;
      if (dt > 0) {
        show.update(dt);
        show.render();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onResize = () => show.resize();
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(spawnT);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const play = () => {
    Snd.init();
    Snd.ui();
    onPlay();
  };

  return (
    <section className="screen menu active">
      <canvas ref={canvasRef} className="showCv" />
      <div className="menuPanel">
        <img className="menuLogo" src="/dummyfury.png" alt="DUMMY FURY" draggable="false" />
        <button className="btn btnPlay" onClick={play}>
          ИГРАТЬ
        </button>
        <button className="linkBtn" type="button">
          НАСТРОЙКИ
        </button>
      </div>
      <div className="verAlpha">АЛЬФА v0.0.5</div>
    </section>
  );
}
