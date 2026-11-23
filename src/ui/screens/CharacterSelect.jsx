import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Lock } from 'lucide-react';
import { drawBust } from '../../game/bust.js';
import { roster } from '../../characters/roster.js';
import { Snd } from '../../game/audio.js';

// Открыт только TEST DUMMY (всегда выбран), остальные 10 ячеек — «СКОРО…».
export default function CharacterSelect({ onBack, onFight }) {
  const heroRef = useRef(null);
  const [shakeId, setShakeId] = useState(null);

  const selected = roster[0];
  const lockedCells = roster.filter((c) => c.locked).slice(0, 10);

  useEffect(() => {
    if (heroRef.current) {
      drawBust(heroRef.current, { silhouette: false, backdrop: false });
    }
  }, []);

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
      <header className="screenHead centerOnly">
        <div className="headCenter">
          <span className="headLine left" />
          <h2 className="headTitle">ТЕПЕРЬ ВЫБЕРИ ПЕРСОНАЖА</h2>
          <span className="headLine right" />
        </div>
      </header>

      <div className="charStage">
        <div className="charHero">
          <canvas ref={heroRef} width="220" height="220" />
          <div className="charNamePlate">{selected.name}</div>
        </div>

        <div className="charGrid">
          {lockedCells.map((ch) => (
            <button
              key={ch.id}
              className={'charCell' + (shakeId === ch.id ? ' shake' : '')}
              onClick={() => {
                Snd.init();
                setShakeId(ch.id);
                setTimeout(() => setShakeId((cur) => (cur === ch.id ? null : cur)), 350);
              }}
            >
              <Lock />
              <span>СКОРО…</span>
            </button>
          ))}
        </div>
      </div>

      <div className="selectFooter">
        <button className="btn ghost" onClick={back}>
          <ArrowLeft /> НАЗАД
        </button>
        <button className="btn readyBtn" onClick={fight}>
          ГОТОВО
        </button>
      </div>
    </section>
  );
}
