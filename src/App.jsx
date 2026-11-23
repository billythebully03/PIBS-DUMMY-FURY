import { useState } from 'react';
import { Smartphone } from 'lucide-react';
import BootScreen from './ui/screens/BootScreen.jsx';
import LoadingScreen from './ui/screens/LoadingScreen.jsx';
import MainMenu from './ui/screens/MainMenu.jsx';
import ModeSelect from './ui/screens/ModeSelect.jsx';
import CharacterSelect from './ui/screens/CharacterSelect.jsx';
import GameScreen from './ui/screens/GameScreen.jsx';

export default function App() {
  const [scene, setScene] = useState('boot');

  return (
    <div className="app">
      {scene === 'boot' && <BootScreen onDone={() => setScene('loading')} />}
      {scene === 'loading' && <LoadingScreen onDone={() => setScene('menu')} />}
      {scene === 'menu' && <MainMenu onPlay={() => setScene('modes')} />}
      {scene === 'modes' && (
        <ModeSelect onBack={() => setScene('menu')} onPlay={() => setScene('select')} />
      )}
      {scene === 'select' && (
        <CharacterSelect onBack={() => setScene('modes')} onFight={() => setScene('game')} />
      )}
      {scene === 'game' && <GameScreen onExit={() => setScene('menu')} />}

      <div className="rotateGate">
        <Smartphone size={70} />
        <div className="title" style={{ fontSize: 28 }}>
          ПОВЕРНИТЕ
          <br />
          УСТРОЙСТВО
        </div>
        <div className="sub">Игра в горизонтальном режиме</div>
      </div>
    </div>
  );
}
