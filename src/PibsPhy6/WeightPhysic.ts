// PibsPhy6 / WeightPhysic — физика веса.
// Чем тяжелее персонаж, тем он медленнее и тем сложнее сбить его с ног.
// Чем легче — тем быстрее и проще сбить. Также отвечает за массу тела в регдолле,
// чтобы тело не летало по всей карте.

export type SkinKey = 'jane' | 'negan' | 'homelander' | 'walt' | 'saul' | 'chester' | 'tubtrooper' | 'hector';

export interface CharacterStats {
  weight: number; // кг
  height: number; // см
  hp: number;
  speedMul: number; // множитель скорости (легче = быстрее)
  knockResist: number; // 0..1 — сопротивление нокдауну (тяжелее = выше)
  ragMass: number; // масса в регдолле (влияет на импульс)
}

// Базовые характеристики персонажей. Вес/рост/хп задаются здесь,
// движок обращается к WeightPhysic за множителями.
export const CHARACTER_STATS: Record<SkinKey, CharacterStats> = {
  jane:       { weight: 75,  height: 180, hp: 100, speedMul: 1.02, knockResist: 0.35, ragMass: 1.0 },
  negan:      { weight: 90,  height: 185, hp: 110, speedMul: 0.95, knockResist: 0.55, ragMass: 1.2 },
  homelander: { weight: 105, height: 190, hp: 120, speedMul: 0.92, knockResist: 0.75, ragMass: 1.4 },
  walt:       { weight: 80,  height: 178, hp: 95,  speedMul: 1.0,  knockResist: 0.42, ragMass: 1.07 },
  saul:       { weight: 70,  height: 175, hp: 90,  speedMul: 1.06, knockResist: 0.28, ragMass: 0.93 },
  chester:    { weight: 74, height: 178, hp: 100, speedMul: 1.04, knockResist: 0.34, ragMass: 0.98 },
  tubtrooper: { weight: 84, height: 181, hp: 100, speedMul: 0.98, knockResist: 0.43, ragMass: 1.1 },
  hector:     { weight: 76, height: 172, hp: 100, speedMul: 0.82, knockResist: 0.30, ragMass: 1.0 },
};

export function statsFor(skin: string): CharacterStats {
  return CHARACTER_STATS[skin as SkinKey] || CHARACTER_STATS.jane;
}

// Скорость с учётом веса и текущего хп (низкое хп замедляет).
export function speedMulFor(skin: string, hp: number): number {
  const s = statsFor(skin);
  return s.speedMul * (hp < 30 ? 0.85 : 1);
}

// Масштаб отброса/импульса: тяжёлых швыряет слабее.
export function knockScaleFor(skin: string): number {
  const s = statsFor(skin);
  return 1 - s.knockResist * 0.55; // 0.59..0.85
}

// Порог нокдауна: launch-атака с pw ниже порога не роняет тяжёлого бойца в регдолл,
// а лишь отбрасывает. Лёгких роняет почти всё.
export function knockThresholdFor(skin: string): number {
  const s = statsFor(skin);
  return 0.25 + s.knockResist * 0.55; // 0.40..0.66
}

// Масса в регдолле: тяжёлое тело менее резкое, не «летает» по карте.
export function ragMassFor(skin: string): number {
  return statsFor(skin).ragMass;
}
