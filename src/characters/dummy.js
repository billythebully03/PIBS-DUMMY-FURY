// Единственный доступный боец. Новых персонажей добавляем так же — файлом в этой папке.
import { COL_BLUE } from '../game/palette.js';

export const dummy = {
  id: 'dummy',
  name: 'TEST DUMMY',
  tagline: 'Молодой · Стройный · Живой манекен',
  unlocked: true,
  col: COL_BLUE,
  abilities: [
    { icon: 'car', label: 'Краш-таран' },
    { icon: 'waves', label: 'Сейсмический топот' },
    { icon: 'fist', label: 'Л · П · Колено · Апперкот' },
  ],
};

export default dummy;
