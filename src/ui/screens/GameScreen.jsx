import { useEffect, useRef } from 'react';
import {
  Car, ChevronLeft, ChevronRight, ChevronsUp, Hand,
  House, Pause, Play, RotateCcw, Waves,
} from 'lucide-react';
import { Game } from '../../game/game.js';
import { Input } from '../../game/input.js';

export default function GameScreen({ onExit }) {
  const rootRef = useRef(null);
  const canvasRef = useRef(null);
  const gameRef = useRef(null);

  useEffect(() => {
    const game = new Game(canvasRef.current, rootRef.current);
    gameRef.current = game;
    game.resize();
    const startT = setTimeout(() => game.start(), 80);

    Input.init({
      onEscape: () => {
        if (game.active && game.phase !== 'over') game.pause(true);
      },
    });

    let raf = 0;
    let last = performance.now();
    const loop = (ts) => {
      const dt = Math.min(0.033, (ts - last) / 1000);
      last = ts;
      if (dt > 0 && game.active) {
        if (!game.paused) game.update(dt);
        game.render();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onResize = () => game.resize();
    const onVis = () => {
      if (document.hidden && game.active && game.phase !== 'over') game.pause(true);
    };
    const onCtx = (e) => e.preventDefault();
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVis);
    document.addEventListener('contextmenu', onCtx);

    return () => {
      clearTimeout(startT);
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('contextmenu', onCtx);
      Input.destroy();
      game.active = false;
    };
  }, []);

  const exitToMenu = () => {
    const game = gameRef.current;
    if (game) {
      game.active = false;
      game.phase = 'none';
      game.paused = false;
    }
    onExit();
  };

  return (
    <section ref={rootRef} className="screen game active">
      <canvas ref={canvasRef} id="gameCv" />

      <div id="hud" className="pad">
        <div className="hp left">
          <div className="name">ТЫ · TEST DUMMY</div>
          <div className="bar">
            <div className="lag" id="lagL" />
            <div className="fill" id="hpL" />
          </div>
          <div className="pips" id="pipL">
            <i />
            <i />
          </div>
        </div>
        <div id="vs">VS</div>
        <div className="hp right">
          <div className="name">TEST DUMMY · ИИ</div>
          <div className="bar">
            <div className="lag" id="lagR" />
            <div className="fill" id="hpR" />
          </div>
          <div className="pips" id="pipR">
            <i />
            <i />
          </div>
        </div>
      </div>

      <button id="pauseBtn" onClick={() => gameRef.current?.pause(true)}>
        <Pause />
      </button>
      <div id="banner" />
      <div id="combo" />

      <div id="controls">
        <div id="dpad">
          <div className="dk" id="dkL">
            <ChevronLeft />
          </div>
          <div className="dk" id="dkR">
            <ChevronRight />
          </div>
        </div>
        <div id="acts">
          <button className="ab" id="bA2">
            <Waves />
            <div className="cd" />
          </button>
          <button className="ab" id="bA1">
            <Car />
            <div className="cd" />
          </button>
          <button className="ab" id="bJump">
            <ChevronsUp />
          </button>
          <button className="ab" id="bPunch">
            <Hand />
          </button>
        </div>
      </div>

      <div className="overlay" id="pauseOv">
        <h2 className="title">ПАУЗА</h2>
        <div className="row">
          <button className="btn" onClick={() => gameRef.current?.pause(false)}>
            <Play /> Продолжить
          </button>
          <button className="btn ghost" onClick={exitToMenu}>
            <House /> В меню
          </button>
        </div>
      </div>

      <div className="overlay" id="resultOv">
        <h2 className="title" id="resTitle">
          ПОБЕДА
        </h2>
        <div className="sub" id="resSub" />
        <div className="row">
          <button className="btn" onClick={() => gameRef.current?.start()}>
            <RotateCcw /> Реванш
          </button>
          <button className="btn ghost" onClick={exitToMenu}>
            <House /> В меню
          </button>
        </div>
      </div>
    </section>
  );
}
