// Gameplay / ARENAS — арены. Сейчас одна: «DUMMY FURY» (тёмный зал,
// кирпичная стена, пол с перспективой, прожекторы). Каждая арена —
// отдельный файл с фоном, границами (minX/maxX), полом и стенами.

export const ARENA = {
  name: 'DUMMY FURY',
  width: 960, // базовая ширина мира (адаптируется под экран)
  height: 540,
  groundY: 468, // пол
  wallLeft: 34,
  wallRight: 926,
  minX: 70,
  maxX: 890,
} as const;
