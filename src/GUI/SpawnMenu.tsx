import { useState } from "react";
import { ChevronDown } from "lucide-react";

export type SkinKey = "jane" | "negan" | "homelander" | "walt" | "saul";

export const CHARACTER_LIST: { key: SkinKey; label: string; color: string }[] = [
  { key: "jane", label: "ПАТРИК ДЖЕЙН", color: "#68717E" },
  { key: "negan", label: "НИГАН", color: "#A7252D" },
  { key: "homelander", label: "ХОУМЛЕНДЕР", color: "#31527D" },
  { key: "walt", label: "УОЛТЕР", color: "#718D55" },
  { key: "saul", label: "СОЛ", color: "#D94B8D" },
];

interface Props {
  onPick: (skin: SkinKey) => void;
}

// Стрелочка вниз рядом с кнопкой «Спавн бойца»: открывает меню выбора
// конкретного персонажа (а не случайного).
export default function SpawnMenu({ onPick }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="spawnMenuWrap">
      <button
        className={"sbtn spawnArrow" + (open ? " activeToggle" : "")}
        title="Выбрать конкретного персонажа"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronDown />
      </button>
      {open && (
        <div className="spawnMenu" role="menu">
          {CHARACTER_LIST.map((c) => (
            <button
              key={c.key}
              className="spawnMenuItem"
              role="menuitem"
              onClick={() => {
                onPick(c.key);
                setOpen(false);
              }}
            >
              <span className="spawnDot" style={{ background: c.color }} />
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
