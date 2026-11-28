import { useEffect, useRef, useState } from "react";
import { startGame } from "./game/engine";
import SpawnMenu from "./GUI/SpawnMenu";

export default function App() {
  const api = useRef<ReturnType<typeof startGame> | null>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    api.current = startGame();
    return () => {
      api.current?.destroy();
      api.current = null;
    };
  }, []);

  function togglePause() {
    const next = !paused;
    api.current?.setPaused(next);
    setPaused(next);
  }

  return (
    <section id="game" aria-label="Песочница Dummy Fury">
      <canvas id="gameCv" aria-label="Игровая арена" />
      <SpawnMenu
        onPick={(skin) => api.current?.selectSkin(skin)}
        onOpenChange={(open) => api.current?.setMenuOpen(open)}
        onAction={(action) => api.current?.[action]()}
      />
      <button
        className="pauseToggle"
        type="button"
        aria-label={paused ? "Продолжить" : "Пауза"}
        aria-pressed={paused}
        onClick={togglePause}
      >
        <img src={paused ? "/icons/play.png" : "/icons/pause.png"} alt="" />
      </button>
    </section>
  );
}
