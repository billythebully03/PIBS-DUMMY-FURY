# DUMMY FURY

Клонайновый кулачный бой: React + Vite, отрисовка на Canvas 2D, процедурный звук на WebAudio.
Готово к деплою на Vercel.

## Структура

```
src/
  main.jsx                точка входа
  App.jsx                 машина экранов: boot → loading → menu → modes → select → game
  ui/
    screens/              по одному файлу на экран
      BootScreen.jsx      чёрный экран «MADE BY PIBS» + предзагрузка loading.png
      LoadingScreen.jsx   полноэкранная картинка public/loading.png + колёсико
      MainMenu.jsx        меню с живой витриной бойца
      ModeSelect.jsx      выбор режима (доступна только дуэль)
      CharacterSelect.jsx выбор бойца (открыт TEST DUMMY, остальные силуэты)
      GameScreen.jsx      бой: HUD, геймпад, пауза, результат
    components/           мелкие UI-компоненты (Spinner)
  characters/             профили бойцов (dummy.js + общий roster.js)
  game/                   движок, разбитый по модулям
    utils, poses, rig     математика, позы, скелет/FK/IK
    animations            все ключевые кадры ударов и способностей
    wounds, draw          раны и отрисовка тела
    fx                    дым, кровь, искры, декали
    ragdoll               физика падения при нокауте
    fighter, ai           боец и соперник
    input, audio          ввод и синтез звука
    background            арена
    showcase              витрина для меню/выбора
    game                  матч, раунды, HUD
  styles/global.css       вся стилистика
public/
  loading.png             полноэкранная картинка загрузки (заменяется своей)
test/
  smoke.mjs               headless-прогон движка (node test/smoke.mjs)
  react-smoke.mjs         прогон интерфейса в jsdom
```

## Команды

```bash
npm install
npm run dev       # локальная разработка
npm run build     # продакшн-сборка в dist/
npm run preview   # посмотреть сборку локально
npm test          # прогон движка без браузера
```

## Загрузка

1. Чёрный экран с логотипом «MADE BY PIBS» (~3.6 с), картинка `public/loading.png`
   в это время предзагружается.
2. Резко — полноэкранная `public/loading.png` (растягивается на весь экран),
   в правом нижнем углу крутящееся колёсико цвета `#6652FB` с переливом
   в холодный/розовый.
3. Плавный быстрый fade в главное меню.

## Персонажей

Каждый боец — отдельный файл в `src/characters/`: имя, описание способностей,
палитра шортов. Открытый пока один (`TEST DUMMY`), остальные слоты в
`roster.js` показаны силуэтами с замочком.
