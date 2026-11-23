import { useState } from 'react';
import { ArrowLeft, Flame, Lock, Play, Swords, Trophy } from 'lucide-react';
import { Snd } from '../../game/audio.js';

const MODES = [
  {
    id: 'duel',
    name: 'ДУЭЛЬ 1×1',
    desc: 'Лучший из трёх раундов против умного соперника. Кровь, синяки и ничего лишнего.',
    icon: Swords,
    playable: true,
  },
  {
    id: 'tournament',
    name: 'ТУРНИР',
    desc: 'Серия боёв с растущей сложностью. Откроем позже.',
    icon: Trophy,
    playable: false,
  },
  {
    id: 'survival',
    name: 'ВЫЖИВАНИЕ',
    desc: 'Бесконечная череда соперников до первого поражения.',
    icon: Flame,
    playable: false,
  },
];

export default function ModeSelect({ onBack, onPlay }) {
  const [selected, setSelected] = useState('duel');

  const pick = (m) => {
    if (!m.playable) return;
    Snd.init();
    Snd.ui();
    setSelected(m.id);
  };

  return (
    <section className="screen modes active">
      <div className="pad modesWrap">
        <button
          className="btn ghost backBtn"
          onClick={() => {
            Snd.init();
            Snd.ui();
            onBack();
          }}
        >
          <ArrowLeft /> Назад
        </button>
        <div className="sub">Выберите режим</div>
        <div className="modeList">
          {MODES.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                className={`modeCard ${selected === m.id ? 'sel' : ''} ${m.playable ? '' : 'disabled'}`}
                onClick={() => pick(m)}
                aria-disabled={!m.playable}
              >
                <div className="ic">
                  <Icon />
                </div>
                <div className="modeBody">
                  <h3>{m.name}</h3>
                  <p>{m.desc}</p>
                </div>
                {!m.playable && (
                  <span className="soonBadge">
                    <Lock size={14} /> СКОРО
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <button
          className="btn"
          onClick={() => {
            Snd.init();
            Snd.ui();
            onPlay();
          }}
        >
          <Play /> Играть
        </button>
      </div>
    </section>
  );
}
