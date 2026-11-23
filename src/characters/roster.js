// Реестр бойцов: открытые и ещё закрытые (силуэты с замочком).
import dummy from './dummy.js';

const LOCKED_NAMES = [
  'ГРОМ', 'ШТОРМ', 'ПЕПЕЛ', 'КОБРА', 'БАРОН', 'МОЛОТ',
  'ТИНА', 'КУВАЛДА', 'РВАЧ', 'СЕРП', 'ОСКАЛ', 'ГНЕВ',
];

export const roster = [
  dummy,
  ...LOCKED_NAMES.slice(0, 11).map((n, i) => ({
    id: 'locked-' + (i + 1),
    name: n,
    tagline: 'Ещё не открыт',
    unlocked: false,
    locked: true,
    abilities: [],
  })),
];

export default roster;
