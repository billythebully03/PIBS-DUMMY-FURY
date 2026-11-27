// Gameplay / HEROES / CHARACTERS — внешность и базовые данные персонажей.
// Каждый персонаж: вес, рост, хп (см. PibsPhy6/WeightPhysic), цвет HUD,
// ссылка на портрет головы. Пиксельная одежда рисуется в движке по skin-ключу.

export type SkinKey = 'jane' | 'negan' | 'homelander' | 'walt' | 'saul';

export const SKINS: SkinKey[] = ['jane', 'negan', 'homelander', 'walt', 'saul'];

export const SKIN_META: Record<SkinKey, { label: string; color: string }> = {
  jane:       { label: 'ПАТРИК ДЖЕЙН', color: '#68717E' },
  negan:      { label: 'НИГАН', color: '#A7252D' },
  homelander: { label: 'ХОУМЛЕНДЕР', color: '#31527D' },
  walt:       { label: 'УОЛТЕР', color: '#718D55' },
  saul:       { label: 'СОЛ', color: '#D94B8D' },
};

export const HEAD_URL: Record<SkinKey, string> = {
  jane: 'https://i.ibb.co/NnNTL5KG/IMG-4282.png',
  negan: 'https://i.ibb.co/ZRGCwwQT/IMG-4289.png',
  homelander: 'https://i.ibb.co/bjQK83QV/IMG-4290.png',
  walt: 'https://i.ibb.co/KxpN1fp4/IMG-4298.png',
  saul: 'https://i.ibb.co/nHFz7pG/IMG-4297.png',
};
