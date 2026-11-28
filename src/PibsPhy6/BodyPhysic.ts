// PibsPhy6 / BodyPhysic — физика тела: тряска конечностей, физика волос,
// реалистичный регдолл (верле-кости, лимиты суставов, коллизии сегментов).
// Регдолл-кости: голова, шея, таз, локти/запястья, колени/щиколотки.
// Невидимый внутренний скелет (кости, а не риг) см. DAMAGES/GORE.

export const RK = ['head', 'neck', 'pel', 'eN', 'wN', 'eF', 'wF', 'kN', 'aN', 'kF', 'aF'] as const;

export const RAD_R: Record<string, number> = {
  head: 12, neck: 5, pel: 8.5, eN: 4.5, wN: 5, eF: 4.5, wF: 5, kN: 6.5, aN: 7.5, kF: 6.5, aF: 7.5,
};

// Длины костей (px): голова-шея, торс, плечи, предплечья, бёдра, голени.
export const BONE_LEN: Record<string, number> = {
  head_neck: 20, neck_pel: 62, upperArm: 35.5, forearm: 31, thigh: 51, shin: 49,
};

// Регдолл: гравитация, демпфирование, шаг симуляции.
export const RAGDOLL = {
  gravity: 1900,
  damping: 0.986,
  step: 1 / 120,
  maxSpeed: 8.5,
} as const;
