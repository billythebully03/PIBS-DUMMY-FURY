import { useState } from "react";
import type { CSSProperties } from "react";
import type { SkinKey } from "../Gameplay/HEROES/CHARACTERS/characters";

export const CHARACTER_LIST: { key: SkinKey; label: string; color: string; portrait: string }[] = [
  { key: "walt", label: "Уолт", color: "#718D55", portrait: "/faces/walt.png" },
  { key: "homelander", label: "Патриот", color: "#31527D", portrait: "/faces/homelander.png" },
  { key: "saul", label: "Сол", color: "#D94B8D", portrait: "/faces/saul.png" },
  // The supplied stormtrooper.png is opaque; use its transparent companion
  // helmet in the picker, as the game does for its current portrait.
  { key: "tubtrooper", label: "Табтрупер", color: "#E95338", portrait: "/faces/trooper.png" },
  { key: "negan", label: "Ниган", color: "#A7252D", portrait: "/faces/negan.png" },
  { key: "jane", label: "Патрик", color: "#68717E", portrait: "/faces/patrick.png" },
  { key: "chester", label: "Честер", color: "#BD2536", portrait: "/faces/chester.png" },
];

interface Props {
  onPick: (skin: SkinKey) => void;
  onOpenChange: (open: boolean) => void;
}

export default function SpawnMenu({ onPick, onOpenChange }: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<SkinKey | null>(null);

  function changeOpen(next: boolean) {
    setOpen(next);
    onOpenChange(next);
  }

  return (
    <div className={"characterPicker" + (open ? " is-open" : "")}>
      <button
        className="pickerToggle"
        type="button"
        aria-label={open ? "Закрыть меню персонажей" : "Открыть меню персонажей"}
        aria-expanded={open}
        aria-controls="characterMenu"
        onClick={() => changeOpen(!open)}
      >
        <img src={open ? "/icons/close.png" : "/icons/menu.png"} alt="" />
      </button>
      <div id="characterMenu" className="characterMenu" aria-label="Выбор персонажа" aria-hidden={!open} inert={!open}>
        <div className="characterGrid">
          {CHARACTER_LIST.map((character) => (
            <button
              key={character.key}
              type="button"
              className="characterCard"
              style={{ "--accent": character.color } as CSSProperties}
              aria-pressed={selected === character.key}
              onClick={() => {
                setSelected(character.key);
                onPick(character.key);
                changeOpen(false);
              }}
            >
              <span className="characterPortrait"><img src={character.portrait} alt="" draggable={false} /></span>
              <span className="characterName">{character.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
