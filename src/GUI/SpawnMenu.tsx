import { useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import type { SkinKey } from "../Gameplay/HEROES/CHARACTERS/characters";

export const CHARACTER_LIST: { key: SkinKey; label: string; color: string; portrait: string }[] = [
  { key: "walt", label: "Уолт", color: "#718D55", portrait: "/faces/walt.png" },
  { key: "homelander", label: "Патриот", color: "#31527D", portrait: "/faces/homelander.png" },
  { key: "saul", label: "Сол", color: "#D94B8D", portrait: "/faces/saul.png" },
  // The original helmet has wide transparent margins. This menu-only crop
  // preserves the artwork while making the helmet as prominent as the heads.
  { key: "tubtrooper", label: "Табтрупер", color: "#E95338", portrait: "/faces/trooper-menu.png" },
  { key: "negan", label: "Ниган", color: "#A7252D", portrait: "/faces/negan.png" },
  { key: "jane", label: "Патрик", color: "#68717E", portrait: "/faces/patrick.png" },
  { key: "chester", label: "Честер", color: "#BD2536", portrait: "/faces/chester.png" },
  { key: "hector", label: "Гектор", color: "#B5A47D", portrait: "/faces/hector.png" },
];

const TABS = [
  { key: "characters", label: "Персонажи", icon: "/icons/chars.png" },
  { key: "entities", label: "Предметы", icon: "/icons/entities.png" },
  { key: "settings", label: "Настройки", icon: "/icons/settings.png" },
] as const;
type TabKey = (typeof TABS)[number]["key"];
export type MenuAction = "clearAll" | "clearBodies" | "clearBlood" | "restoreMap";
const ACTIONS: { key: MenuAction; label: string }[] = [
  { key: "clearAll", label: "Очистить всё" },
  { key: "clearBodies", label: "Убрать тела" },
  { key: "clearBlood", label: "Очистить кровь" },
  { key: "restoreMap", label: "Восстановить карту" },
];

interface Props {
  onPick: (skin: SkinKey) => void;
  onOpenChange: (open: boolean) => void;
  onAction: (action: MenuAction) => void;
}

export default function SpawnMenu({ onPick, onOpenChange, onAction }: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<SkinKey | null>(null);
  const [tab, setTab] = useState<TabKey>("characters");

  function changeOpen(next: boolean) {
    setOpen(next);
    onOpenChange(next);
  }

  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (index + TABS.length - 1) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    else return;
    event.preventDefault();
    setTab(TABS[next].key);
    document.getElementById(`tab-${TABS[next].key}`)?.focus();
  }

  return (
    <div className={"characterPicker" + (open ? " is-open" : "")}>
      <button
        className="pickerToggle"
        type="button"
        aria-label={open ? "Закрыть меню" : "Открыть меню"}
        aria-expanded={open}
        aria-controls="characterMenu"
        onClick={() => changeOpen(!open)}
      >
        <img src={open ? "/icons/close.png" : "/icons/menu.png"} alt="" />
      </button>
      <section id="characterMenu" className="characterMenu" aria-label="Меню песочницы" aria-hidden={!open} inert={!open}>
        <div className="menuHeader">Песочница</div>
        <div className="menuTabs" role="tablist" aria-label="Разделы меню">
          {TABS.map((item, index) => (
            <button
              key={item.key}
              id={`tab-${item.key}`}
              className="menuTab"
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              aria-controls={`panel-${item.key}`}
              tabIndex={tab === item.key ? 0 : -1}
              onClick={() => setTab(item.key)}
              onKeyDown={(event) => navigateTabs(event, index)}
            >
              <img src={item.icon} alt="" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
        <div className="menuBody">
          {TABS.map((item) => (
            <div key={item.key} id={`panel-${item.key}`} role="tabpanel" aria-labelledby={`tab-${item.key}`} hidden={tab !== item.key}>
              {item.key === "characters" && (
                <div className="characterGrid">
                  {CHARACTER_LIST.map((character) => (
                    <button
                      key={character.key}
                      type="button"
                      className={"characterCard" + (character.key === "tubtrooper" ? " is-helmet" : "")}
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
              )}
            </div>
          ))}
        </div>
        <div className="menuActions" role="group" aria-label="Очистка и восстановление">
          {ACTIONS.map((action) => (
            <button key={action.key} className="menuAction" type="button" onClick={() => onAction(action.key)}>
              {action.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
