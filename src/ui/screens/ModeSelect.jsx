import { ArrowLeft, Lock, Swords } from 'lucide-react';
import { Snd } from '../../game/audio.js';

// Режимы: доступна только дуэль, остальные — «СКОРО».
const MODES = [
  { id: 'duel', name: 'ДУЭЛЬ', desc: '1х1', icon: Swords, playable: true },
  { id: 'soon-1', name: 'СКОРО', desc: 'Тут что-то будет', icon: Lock, playable: false },
  { id: 'soon-2', name: 'СКОРО', desc: 'В Процессе!', icon: Lock, playable: false },
];

export default function ModeSelect({ onBack, onPlay }) {
  const back = () => {
    Snd.init();
    Snd.ui();
    onBack();
  };

  return (
    <section className="screen modes active">
      <header className="screenHead">
        <button className="headBack" onClick={back}>
          <ArrowLeft /> НАЗАД
        </button>
        <div className="headCenter">
          <span className="headLine left" />
          <h2 className="headTitle">ВЫБЕРИ РЕЖИМ</h2>
          <span className="headLine right" />
        </div>
      </header>

      <div className="modeRow">
        {MODES.map((m) => {
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              className={'modeCard' + (m.playable ? ' sel' : ' locked')}
              onClick={() => {
                if (!m.playable) return;
                Snd.init();
                Snd.ui();
                onPlay();
              }}
              aria-disabled={!m.playable}
            >
              <span className="mIcon">
                <Icon />
              </span>
              <span className="mName">{m.name}</span>
              <span className="mDesc">{m.desc}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
