import { useEffect, useRef, useState } from "react";
import { UserPlus, Swords, RefreshCw, Skull, DropletOff, Volume2, VolumeX, ChevronUp, ChevronDown, Home, Hand } from "lucide-react";
import { startGame } from "./game/engine";
import SpawnMenu, { type SkinKey } from "./GUI/SpawnMenu";

type GameApi = ReturnType<typeof startGame>;

export default function App() {
  const api = useRef<GameApi | null>(null);
  const [auto, setAuto] = useState(true);
  const [sound, setSound] = useState(true);
  const [cameraMode, setCameraMode] = useState(false);

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
          <div className="spawnWrap">
            <button
              className="sbtn primary"
              title="Заспавнить одного бойца в случайной точке"
              onClick={() => api.current?.spawnOne()}
            >
              <UserPlus />Спавн бойца
            </button>
            <SpawnMenu
              onPick={(skin: SkinKey) => api.current?.spawnSkin(skin)}
            />
          </div>
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
          <span className="shiftHint">· Shift: присесть первому бойцу</span>
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
      <div id="cameraControls" role="group" aria-label="Управление камерой">
        <span>КАМЕРА</span>
        <button
          className="camModeBtn"
          aria-label="Режим перемещения камеры"
          aria-pressed={cameraMode}
          title={cameraMode ? "Режим камеры включён: касания не создают бойцов" : "Включить режим камеры: перемещайте арену без спавна"}
          onClick={() => {
            const next = !cameraMode;
            api.current?.setCameraMode(next);
            setCameraMode(next);
          }}
        >
          <Hand aria-hidden="true" />
          <span>ДВИГАТЬ<br />{cameraMode ? "ВКЛ" : "ВЫКЛ"}</span>
        </button>
        <button className="camBtn" aria-label="Камера выше" title="Камера выше" onClick={() => api.current?.moveCamera(-300)}><ChevronUp /></button>
        <button className="camBtn" aria-label="Камера ниже" title="Камера ниже" onClick={() => api.current?.moveCamera(300)}><ChevronDown /></button>
        <button className="camBtn" aria-label="К полу" title="Вернуться к полу" onClick={() => api.current?.resetCamera()}><Home /></button>
      </div>
      <div id="rosterHud" />
    </section>
  );
}
