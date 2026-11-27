// Gameplay / HEROES / ABILITIES — способность Патрика Джейна: «Ментальное воздействие».
// Маленькая кат-сцена: Патрик произносит фразу, противник начинает плавно
// подсвечиваться фиолетовым контуром, хватается за голову (игнорирует удары
// под себя — урон проходит, но с ног не сбивается), разворачивается от Патрика
// и с разбегу впрыгивает головой в стену, выходя из воздействия и находясь в оглушении.
// Используется только с расстояния и с большим кд.

export const MENTAL = {
  minRange: 150, // минимальная дистанция до цели (px)
  maxRange: 620, // максимальная дистанция (px)
  cooldownMin: 12, // большой кд, сек
  cooldownMax: 18,
  speakDur: 1.1, // Патрик говорит фразу
  clutchDur: 0.9, // цель хватается за голову, контур усиливается
  turnDur: 0.45, // разворот от Патрика
  runSpeed: 520, // скорость разбега к стене (RUN_SPD)
  stunDur: 2.8, // оглушение после удара о стену, сек
  glowColor: '#a855f7', // фиолетовый контур
  glowCore: '#e9d5ff',
} as const;

// Фразы Патрика Джейна (короткие, в стиле сериала).
export const MENTAL_LINES: string[] = [
  'Look at me.',
  'Breathe. Just breathe.',
  'Let the noise fade.',
  'You are safe here.',
  'Close your eyes.',
  'Rest for a moment.',
  'Drift away.',
  'There is only quiet.',
  'That is it... relax.',
  'Follow my voice.',
  'Nothing to worry about.',
  'Just one quiet thought.',
];

export function pickMentalLine(): string {
  return MENTAL_LINES[(Math.random() * MENTAL_LINES.length) | 0];
}
