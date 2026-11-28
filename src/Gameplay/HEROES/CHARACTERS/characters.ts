// Gameplay / HEROES / CHARACTERS — внешность и базовые данные персонажей.
// Каждый персонаж: вес, рост, хп (см. PibsPhy6/WeightPhysic), цвет HUD,
// ссылка на портрет головы. Пиксельная одежда рисуется в движке по skin-ключу.

export type SkinKey = 'jane' | 'negan' | 'homelander' | 'walt' | 'saul' | 'chester' | 'tubtrooper';

export const SKINS: SkinKey[] = ['jane', 'negan', 'homelander', 'walt', 'saul', 'chester', 'tubtrooper'];

export const SKIN_META: Record<SkinKey, { label: string; color: string }> = {
  jane:       { label: 'ПАТРИК ДЖЕЙН', color: '#68717E' },
  negan:      { label: 'НИГАН', color: '#A7252D' },
  homelander: { label: 'ХОУМЛЕНДЕР', color: '#31527D' },
  walt:       { label: 'УОЛТЕР', color: '#718D55' },
  saul:       { label: 'СОЛ', color: '#D94B8D' },
  chester:    { label: 'ЧЕСТЕР', color: '#BD2536' },
  tubtrooper: { label: 'ТАБТРУПЕР', color: '#E95338' },
};

export const HEAD_URL: Record<SkinKey, string> = {
  jane: '/faces/patrick.png',
  negan: '/faces/negan.png',
  homelander: '/faces/homelander.png',
  walt: '/faces/walt.png',
  saul: '/faces/saul.png',
  chester: '/faces/chester.png',
  tubtrooper: '/faces/stormtrooper.png',
};
