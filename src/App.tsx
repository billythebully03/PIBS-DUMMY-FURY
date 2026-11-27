import { useEffect, useRef, useState } from "react";
import { UserPlus, Swords, RefreshCw, Skull, DropletOff, Volume2, VolumeX } from "lucide-react";
import { startGame } from "./game/engine";

type GameApi = ReturnType<typeof startGame>;

export default function App() {
  const api = useRef<GameApi | null>(null);
  const [auto, setAuto] = useState(true);
  const [sound, setSound] = useState(true);

  useEffect(() => {
    api.current = startGame();
    return () => {
      api.current?.destroy();
      api.current = null;
    };
  }, []);

  return (
    <section id="game">
      <canvas id="gameCv" />
      <div id="topBar">
        <div className="ctrlGroup">
          <button className="sbtn primary" title="Заспавнить одного бойца в случайной точке" onClick={() => api.current?.spawnOne()}>
            <UserPlus />Спавн бойца
          </button>
          <button className="sbtn" title="Заспавнить двух бойцов напротив друг друга" onClick={() => api.current?.spawnPair()}>
            <Swords />Спавн пары
          </button>
          <button
            className={"sbtn" + (auto ? " activeToggle" : "")}
            title="Автоматически спавнить новых бойцов после нокаута"
            onClick={() => { const v = !auto; setAuto(v); api.current?.setAutoSpawn(v); }}
          >
            <RefreshCw />Авто-спавн: {auto ? "ВКЛ" : "ВЫКЛ"}
          </button>
        </div>
        <div className="hintBadge">
          <span className="dot" />
          <span id="statTxt" />
        </div>
        <div className="ctrlGroup">
          <button className="sbtn" title="Убрать нокаутированных бойцов" onClick={() => api.current?.clearBodies()}>
            <Skull />Убрать тела
          </button>
          <button className="sbtn" title="Очистить кровь с пола" onClick={() => api.current?.clearBlood()}>
            <DropletOff />Смыть кровь
          </button>
          <button
            className="sbtn"
            title="Звук"
            onClick={() => { const v = !sound; setSound(v); api.current?.setSound(v); }}
          >
            {sound ? <Volume2 /> : <VolumeX />}
          </button>
        </div>
      </div>
      <div id="rosterHud" />
    </section>
  );
}
