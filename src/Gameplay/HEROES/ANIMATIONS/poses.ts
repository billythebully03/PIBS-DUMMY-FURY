// Gameplay / HEROES / ANIMATIONS — анимации персонажей (позы и кейфреймы).
// У каждого героя свои файлы/позы, порой уникальные:
// - Ниган: вставание с Люсиль в руке
// - Хоумлендер: парение, торможение, вставание с взлётом
// Позы движка: src/game/engine.ts (P(), KF(), sampleKF()).

export const ANIMATION_FILES = [
  'neganGetup', // вставание с битой
  'homelanderHover', // парение и торможение
  'common', // idle, бег, удары, нокдаун, победа
] as const;
