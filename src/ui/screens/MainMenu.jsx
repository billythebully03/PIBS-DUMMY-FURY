import { useEffect, useRef, useState } from 'react';
import { Play, Volume2, VolumeX } from 'lucide-react';
import { Showcase } from '../../game/showcase.js';
import { Snd } from '../../game/audio.js';

export default function MainMenu({ onPlay }) {
  const canvasRef = useRef(null);
  const [soundOn, setSoundOn] = useState(Snd.on);

  useEffect(() => {
    const show = new Showcase(canvasRef.current, {
      cx: 0.76,
      dir: -1,
      glow: '#43121a',
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

  const toggleSound = () => {
    Snd.init();
    Snd.on = !Snd.on;
    setSoundOn(Snd.on);
    if (Snd.on) Snd.ui();
  };

  return (
    <section className="screen menu active">
      <canvas ref={canvasRef} className="showCv menuCv" />
      <div className="menuUI pad">
        <div>
          <div className="sub">Кулачный бой · Дуэль</div>
          <h1 className="title">
            DUMMY
            <br />
            FURY
          </h1>
        </div>
        <div>
          <button className="btn" onClick={play}>
            <Play /> Играть
          </button>
        </div>
      </div>
      <button className="fab" onClick={toggleSound} aria-label="Звук">
        {soundOn ? <Volume2 /> : <VolumeX />}
      </button>
      <div className="ver">v0.1 · TEST DUMMY</div>
    </section>
  );
}
