// SFX / EFFECTS — визуальные эффекты: дым, кровь (пиксельные капли),
// искры, вспышки ударов, поджоги, трещины пола, осколки.
// Движок: класс FX в src/game/engine.ts (слой 3px).

export const FX_NAMES = [
  'smoke', 'blood', 'spark', 'impact', 'landing', 'burnSurface', 'crack', 'fragment',
  'bolt', 'wave', 'duck', 'gore',
] as const;
