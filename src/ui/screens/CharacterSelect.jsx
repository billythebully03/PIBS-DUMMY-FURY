import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, Car, Hand, Lock, Swords, Waves,
} from 'lucide-react';
import { Showcase } from '../../game/showcase.js';
import { drawBust } from '../../game/bust.js';
import { roster } from '../../characters/roster.js';
import { Snd } from '../../game/audio.js';

const ABILITY_ICONS = { car: Car, waves: Waves, fist: Hand };

export default function CharacterSelect({ onBack, onFight }) {
  const canvasRef = useRef(null);
  const showRef = useRef(null);
  const [selectedId, setSelectedId] = useState(null);
  const [shakeId, setShakeId] = useState(null);

  const selected = roster.find((c) => c.id === selectedId) || null;

  useEffect(() => {
    const show = new Showcase(canvasRef.current, {
      cx: 0.5,
      dir: 1,
      glow: '#2a1a10',
    });
    showRef.current = show;
    show.resize();

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
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const pick = (ch) => {
    Snd.init();
    if (!ch.unlocked) {
      setShakeId(ch.id);
      setTimeout(() => setShakeId((cur) => (cur === ch.id ? null : cur)), 350);
      return;
    }
    Snd.ui();
    setSelectedId(ch.id);
    if (showRef.current) showRef.current.spawn(0.15);
  };

  const back = () => {
    Snd.init();
    Snd.ui();
    onBack();
  };

  const fight = () => {
    Snd.init();
    Snd.ui();
    onFight();
  };

  return (
    <section className="screen select active">
      <div className="selLeft">
        <canvas ref={canvasRef} className="showCv selCv" />
        <div className="selTop pad">
          <button className="btn ghost" onClick={back}>
            <ArrowLeft /> Назад
          </button>
        </div>
        <div className="selInfo pad">
          <div className="tg">{selected ? selected.tagline : 'Выберите бойца справа'}</div>
          <h2 className="nm">{selected ? selected.name : '—'}</h2>
          <div className="abil">
            {selected &&
              selected.abilities.map((a) => {
                const Icon = ABILITY_ICONS[a.icon] || Hand;
                return (
                  <div key={a.label}>
                    <Icon /> {a.label}
                  </div>
                );
              })}
          </div>
        </div>
      </div>
      <aside className="selRight pad">
        <h4>БОЙЦЫ</h4>
        <div className="cards">
          {roster.map((ch) => (
            <button
              key={ch.id}
              className={
                'card' +
                (selectedId === ch.id ? ' sel' : '') +
                (ch.locked ? ' locked' : '') +
                (shakeId === ch.id ? ' shake' : '')
              }
              onClick={() => pick(ch)}
            >
              <canvas
                width="180"
                height="180"
                ref={(el) => {
                  if (el && !el.dataset.done) {
                    el.dataset.done = '1';
                    drawBust(el, { silhouette: !!ch.locked });
                  }
                }}
              />
              {ch.locked && (
                <span className="lockBadge">
                  <Lock size={26} />
                </span>
              )}
              <span className="cardName">{ch.name}</span>
            </button>
          ))}
        </div>
        <button className="btn" disabled={!selected} onClick={fight}>
          <Swords /> В бой
        </button>
      </aside>
    </section>
  );
}
