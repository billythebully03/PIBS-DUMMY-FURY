// SFX / EFFECTS — визуальные эффекты: дым, кровь (пиксельные капли),
// искры, вспышки ударов, поджоги, трещины пола, осколки.
// Движок: класс FX в src/game/engine.ts (слой 3px).

export const FX_NAMES = [
  'smoke', 'blood', 'spark', 'impact', 'landing', 'burnSurface', 'crack', 'fragment',
] as const;

// Фиолетовый контур ментального воздействия (см. ABILITIES/janeMental.ts).
export const MENTAL_GLOW = '#a855f7';
