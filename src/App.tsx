import { useEffect, useRef } from "react";
import { startGame } from "./game/engine";
import SpawnMenu from "./GUI/SpawnMenu";

export default function App() {
  const api = useRef<ReturnType<typeof startGame> | null>(null);

  useEffect(() => {
    api.current = startGame();
    return () => {
      api.current?.destroy();
      api.current = null;
    };
  }, []);

  return (
    <section id="game" aria-label="Песочница Dummy Fury">
      <canvas id="gameCv" aria-label="Игровая арена" />
      <SpawnMenu
        onPick={(skin) => api.current?.selectSkin(skin)}
        onOpenChange={(open) => api.current?.setMenuOpen(open)}
      />
    </section>
  );
}
