import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Car,
  Hand,
  Home,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
  Waves,
} from 'lucide-react';
import { createGameRuntime } from './game/engine.js';

const LOADING_STEPS = [
  'Загрузка шрифтов…',
  'Сборка арены…',
  'Лепим Test Dummy…',
  'Синтез звука…',
  'Смываем кровь с пола…',
];

function App() {
  const [scene, setScene] = useState('brand');
  const [loadingStep, setLoadingStep] = useState(-1);
  const [loadingReady, setLoadingReady] = useState(false);
  const [selected, setSelected] = useState(false);
  const [paused, setPaused] = useState(false);
  const [result, setResult] = useState(null);
  const [banner, setBanner] = useState({ text: '', key: 0 });
  const [soundOn, setSoundOn] = useState(true);

  const sceneRef = useRef(scene);
  const runtimeRef = useRef(null);
  const gameCanvasRef = useRef(null);
  const menuCanvasRef = useRef(null);
  const selectCanvasRef = useRef(null);
  const bustCanvasRef = useRef(null);

  sceneRef.current = scene;

  useEffect(() => {
    const runtime = createGameRuntime({
      gameCanvas: gameCanvasRef.current,
      menuCanvas: menuCanvasRef.current,
      selectCanvas: selectCanvasRef.current,
      getScene: () => sceneRef.current,
      onBanner: (text) => setBanner({ text, key: Date.now() }),
      onPauseChange: (value) => setPaused(value),
      onResult: (value) => setResult(value),
    });
    runtimeRef.current = runtime;
    return () => {
      runtime.destroy();
      runtimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (scene !== 'brand') return undefined;
    const timer = window.setTimeout(() => setScene('loading'), 3000);
    return () => window.clearTimeout(timer);
  }, [scene]);

  useEffect(() => {
    if (scene !== 'loading') return undefined;
    let cancelled = false;
    let timer = 0;
    setLoadingReady(false);
    setLoadingStep(0);

    const runStep = (index) => {
      if (cancelled) return;
      setLoadingStep(index);
      if (index === 1) runtimeRef.current?.resizeForScene('game');
      if (index >= LOADING_STEPS.length - 1) {
        setLoadingReady(true);
        return;
      }
      timer = window.setTimeout(() => runStep(index + 1), 380);
    };

    // Let the browser begin loading the fallback fonts, without making the
    // splash screen wait indefinitely on a font provider.
    if (document.fonts?.load) {
      Promise.race([
        document.fonts.load("20px 'Russo One'"),
        new Promise((resolve) => window.setTimeout(resolve, 900)),
      ]).finally(() => runStep(0));
    } else {
      runStep(0);
    }

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [scene]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.resizeForScene(scene);
    if (scene === 'menu') {
      runtime.spawnMenu(0.2);
    }
    if (scene === 'select') {
      runtime.hideSelect();
      runtime.resizeForScene('select');
      if (bustCanvasRef.current) runtime.drawBust(bustCanvasRef.current);
    }
  }, [scene]);

  useEffect(() => {
    if (scene === 'select' && bustCanvasRef.current && runtimeRef.current) {
      runtimeRef.current.drawBust(bustCanvasRef.current);
    }
  }, [scene, selected]);

  const gesture = () => runtimeRef.current?.userGesture();

  const go = (nextScene) => {
    gesture();
    setPaused(false);
    setScene(nextScene);
  };

  const openMenu = () => {
    const runtime = runtimeRef.current;
    if (runtime) runtime.Game.active = false;
    setResult(null);
    setPaused(false);
    go('menu');
  };

  const openModes = () => go('modes');

  const openSelect = () => {
    gesture();
    setSelected(false);
    setResult(null);
    setPaused(false);
    go('select');
  };

  const chooseDummy = () => {
    if (selected) return;
    gesture();
    setSelected(true);
    runtimeRef.current?.spawnSelect(0.15);
  };

  const startFight = () => {
    if (!selected) return;
    const runtime = runtimeRef.current;
    gesture();
    if (runtime) runtime.Game.active = false;
    setResult(null);
    setPaused(false);
    setScene('game');
    window.setTimeout(() => {
      runtimeRef.current?.resizeForScene('game');
      runtimeRef.current?.Game.start();
    }, 80);
  };

  const resume = () => {
    gesture();
    runtimeRef.current?.Game.pause(false);
  };

  const pause = () => {
    gesture();
    runtimeRef.current?.Game.pause(true);
  };

  const rematch = () => {
    const runtime = runtimeRef.current;
    gesture();
    setResult(null);
    setPaused(false);
    if (runtime) {
      runtime.Game.active = true;
      runtime.resizeForScene('game');
      runtime.Game.start();
    }
  };

  const toggleSound = () => {
    const nextValue = runtimeRef.current?.toggleSound() ?? !soundOn;
    setSoundOn(nextValue);
  };

  const continueFromLoading = () => {
    if (!loadingReady) return;
    gesture();
    setScene('menu');
  };

  return (
    <main className="app" aria-label="DUMMY FURY">
      <section className={`screen brand-screen ${scene === 'brand' ? 'active' : ''}`} id="brand" aria-hidden={scene !== 'brand'}>
        <div className="brand-logo">
          <div className="brand-made">MADE BY</div>
          <div className="brand-pibs">PIBS</div>
        </div>
        <div className="brand-caption">Игра создана двумя людьми при ничьей поддержке</div>
      </section>

      <section
        className={`screen loading-screen ${scene === 'loading' ? 'active' : ''}`}
        id="loading"
        aria-hidden={scene !== 'loading'}
        onPointerDown={continueFromLoading}
      >
        <div className="loading-mark">DUMMY FURY</div>
        <div className="loading-subtitle">Test Dummy Edition</div>
        <div className="loader-wrap">
          <div className="loader-label">{loadingReady ? 'Нажмите, чтобы продолжить' : (LOADING_STEPS[loadingStep] || 'Загрузка…')}</div>
          <div className="loader-track"><div className="loader-bar" style={{ width: `${loadingReady ? 100 : Math.max(0, (loadingStep + 1) / LOADING_STEPS.length * 100)}%` }} /></div>
        </div>
        <div className="loading-version">v0.1 · TEST DUMMY</div>
      </section>

      <section className={`screen menu-screen ${scene === 'menu' ? 'active' : ''}`} id="menu" aria-hidden={scene !== 'menu'}>
        <canvas className="showcase-canvas" id="menuCv" ref={menuCanvasRef} />
        <div className="menu-overlay" />
        <div className="menu-copy">
          <div className="eyebrow">Кулачный бой · Дуэль</div>
          <h1>DUMMY FURY</h1>
          <p className="edition">TEST DUMMY EDITION</p>
          <button className="primary-button menu-play" id="btnPlay" type="button" onClick={openModes}>
            <Play size={20} fill="currentColor" /> Играть
          </button>
          <div className="menu-footer">
            <span>v0.1 · TEST DUMMY</span>
            <button className="icon-button" id="btnSnd" type="button" onClick={toggleSound} aria-label={soundOn ? 'Выключить звук' : 'Включить звук'}>
              {soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
          </div>
        </div>
      </section>

      <section className={`screen modes-screen ${scene === 'modes' ? 'active' : ''}`} id="modes" aria-hidden={scene !== 'modes'}>
        <div className="panel-topline">
          <button className="back-button" id="modeBack" type="button" onClick={() => go('menu')}><ArrowLeft size={17} /> Назад</button>
          <div className="mini-logo">DUMMY <span>FURY</span></div>
          <div className="top-spacer" />
        </div>
        <div className="mode-content">
          <p className="eyebrow">Кулачный бой · Дуэль</p>
          <h2>Выберите режим</h2>
          <button className="mode-card selected-mode" id="modePlay" type="button" onClick={openSelect}>
            <div className="mode-card-index">01</div>
            <div className="mode-card-body">
              <div className="mode-card-title">ДУЭЛЬ 1×1 <span className="mode-live">ДОСТУПНО</span></div>
              <p>Лучший из трёх раундов против умного соперника. Кровь, синяки и ничего лишнего.</p>
            </div>
            <span className="round-arrow">→</span>
          </button>
          <div className="modes-note"><span /> TEST DUMMY PROTOCOL · SOLO / AI</div>
        </div>
      </section>

      <section className={`screen select-screen ${scene === 'select' ? 'active' : ''}`} id="select" aria-hidden={scene !== 'select'}>
        <canvas className="select-showcase-canvas" id="selCv" ref={selectCanvasRef} />
        <div className="select-vignette" />
        <div className="panel-topline select-topline">
          <button className="back-button" id="selBack" type="button" onClick={() => go('modes')}><ArrowLeft size={17} /> Назад</button>
          <div className="mini-logo">БОЙЦЫ</div>
          <div className="top-spacer" />
        </div>
        <div className="select-layout">
          <div className="select-heading">
            <p className="eyebrow">Выберите бойца справа</p>
            <h2>{selected ? 'TEST DUMMY' : '—'}</h2>
            <p className="select-tag">{selected ? 'Молодой · Стройный · Живой манекен' : 'Готов к спаррингу'}</p>
            <div className="abilities" id="selAbil">
              {selected && <>
                <div><Car size={16} /> Краш-таран</div>
                <div><Waves size={16} /> Сейсмический топот</div>
                <div><Hand size={16} /> Л · П · Колено · Апперкот</div>
              </>}
            </div>
          </div>
          <button className={`fighter-card ${selected ? 'sel' : ''}`} type="button" onClick={chooseDummy}>
            <div className="fighter-card-glow" />
            <canvas ref={bustCanvasRef} width="180" height="180" />
            <span>TEST DUMMY</span>
            <small>01 · BLUE CORNER</small>
            {selected && <div className="fighter-check">✓</div>}
          </button>
          <div className="select-bottom">
            <div className="versus-line"><b>ТЫ</b><span>VS</span><b className="red-text">TEST DUMMY · ИИ</b></div>
            <button className="primary-button fight-button" id="fightBtn" type="button" disabled={!selected} onClick={startFight}>
              В бой <span>→</span>
            </button>
          </div>
        </div>
      </section>

      <section className={`screen game-screen ${scene === 'game' ? 'active' : ''}`} id="game" aria-hidden={scene !== 'game'}>
        <canvas id="gameCv" ref={gameCanvasRef} />
        <div className="game-hud">
          <div className="fighter-hud player-hud">
            <div className="hud-name"><span className="corner-dot blue-dot" /> ТЫ · TEST DUMMY</div>
            <div className="health-row"><div className="health-track"><div className="health-lag" id="lagL" /><div className="health-value blue-health" id="hpL" /></div><span>100</span></div>
            <div className="score-pips" id="pipL"><i /><i /><i /></div>
          </div>
          <div className="round-hud"><span>РАУНД</span><strong>BO3</strong></div>
          <div className="fighter-hud enemy-hud">
            <div className="hud-name">TEST DUMMY · ИИ <span className="corner-dot red-dot" /></div>
            <div className="health-row"><span>ИИ</span><div className="health-track"><div className="health-lag" id="lagR" /><div className="health-value red-health" id="hpR" /></div></div>
            <div className="score-pips right-pips" id="pipR"><i /><i /><i /></div>
          </div>
          <button className="pause-button" id="pauseBtn" type="button" onClick={pause} aria-label="Пауза"><Pause size={18} /></button>
          <div className="combo-counter" id="combo">×0 КОМБО</div>
          <div className={`round-banner ${banner.text ? 'pop' : ''}`} key={banner.key} id="banner">{banner.text}</div>
        </div>
        <div className="game-controls" aria-label="Управление">
          <div className="dpad" id="dpad"><button id="dkL" type="button" aria-label="Влево" /><button id="dkR" type="button" aria-label="Вправо" /></div>
          <div className="action-pad">
            <button className="action-button ability-two" id="bA2" type="button"><span>СТОП</span><small>L / C</small></button>
            <button className="action-button jump-button" id="bJump" type="button"><span>ПРЫЖОК</span><small>W / ↑</small></button>
            <button className="action-button ability-one" id="bA1" type="button"><span>ТАРАН</span><small>K / X</small></button>
            <button className="action-button punch-button" id="bPunch" type="button"><strong>УДАР</strong><small>J / Z</small></button>
          </div>
        </div>
        <div className={`game-overlay ${paused ? 'show' : ''}`} id="pauseOv">
          <div className="overlay-card"><p className="eyebrow">DUMMY FURY</p><h2>ПАУЗА</h2><div className="overlay-actions"><button className="primary-button" id="pResume" type="button" onClick={resume}><Play size={17} /> Продолжить</button><button className="ghost-button" id="pMenu" type="button" onClick={openMenu}><Home size={16} /> В меню</button></div></div>
        </div>
        <div className={`game-overlay result-overlay ${result ? 'show' : ''}`} id="resultOv">
          <div className="overlay-card result-card"><p className="eyebrow">MATCH COMPLETE</p><h2>{result?.win ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'}</h2><div className="result-score">{result ? `${result.score[0]} : ${result.score[1]}` : '—'}</div><div className="overlay-actions"><button className="primary-button" id="rAgain" type="button" onClick={rematch}><RotateCcw size={17} /> Реванш</button><button className="ghost-button" id="rMenu" type="button" onClick={openMenu}><Home size={16} /> В меню</button></div></div>
        </div>
        <div className="orientation-overlay"><strong>ПОВЕРНИТЕ УСТРОЙСТВО</strong><span>Игра в горизонтальном режиме</span></div>
      </section>
    </main>
  );
}

export default App;
