// PibsPhy6 / ClothPhysic — физика одежды: сумки, лямки, галстуки, плащи.
// Правила применяются к основной части одежды. Реализация — цепочки Верле:
// галстук Сола (6 сегментов) и плащ Хоумлендера (7 сегментов, флаг США).

export const TIE_N = 6;
export const TIE_SEG = 9;
export const CAPE_N = 7;
export const CAPE_SEG = 19;

// Галстук: лёгкий, быстро реагирует на ускорение и ветер.
export const TIE_PHYSIC = {
  damping: 0.965,
  gravity: 900,
  iterations: 5,
  flutterAmp: 2400,
} as const;

// Плащ: тяжёлый, при быстром движении поднимается и тянется назад.
export const CAPE_PHYSIC = {
  damping: 0.945,
  gravitySlow: 380,
  gravityFast: 1180,
  iterations: 5,
} as const;
