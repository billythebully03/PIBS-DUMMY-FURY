# DUMMY FURY

Кукольный кулачный бой: React + Vite, Canvas 2D, процедурный WebAudio-звук,
шрифт Dela Gothic One (локально, через Fontsource). Готово к Vercel.

## Структура

```
src/
  main.jsx                точка входа (подключает шрифт и стили)
  App.jsx                 машина экранов: boot → loading → menu → modes → select → game
  ui/
    screens/              по одному файлу на экран
      BootScreen.jsx      чёрный экран «MADE BY PIBS» + предзагрузка loading.png
      LoadingScreen.jsx   6 секунд: картинка public/loading.png по высоте + размытая подложка, колёсико
      MainMenu.jsx       слева кукла, справа логотип dummyfury.png, «ИГРАТЬ», «НАСТРОЙКИ», «АЛЬФА v0.0.5»
      ModeSelect.jsx      «ВЫБЕРИ РЕЖИМ»: дуэль доступна, две «СКОРО» закрыты
      CharacterSelect.jsx «ТЕПЕРЬ ВЫБЕРИ ПЕРСОНАЖА»: крупный бокс с дамми + сетка 2×5 «СКОРО…»
      GameScreen.jsx     бой: HUD, геймпад, пауза, результат
    components/           Spinner (колёсико загрузки)
  characters/             профили бойцов: dummy.js + roster.js (остальные силуэты)
  game/                   движок по модулям
    utils, poses, rig     математика, позы, скелет (FK/IK)
    animations            ключевые кадры ударов/способностей
    wounds, draw          раны и отрисовка тела
    fx                    дым, кровь, искры, декали
    ragdoll               физика нокаута
    fighter, ai           боец и соперник
    input, audio          ввод и синтез звука
    background, showcase  арена и витрина для меню
    bust                  портреты для карточек
    game                  матч, раунды, HUD
  styles/global.css       вся стилистика
public/
  loading.png             полноэкранная картинка загрузки (заменяется своей)
  dummyfury.png           логотип меню
test/
  smoke.mjs               headless-прогон движка: npm test
  react-smoke.mjs         прогон UI в jsdom
```

## Команды

```bash
npm install
npm run dev       # разработка
npm run build     # продакшн-сборка в dist/
npm run preview   # превью сборки
npm test          # движок без браузера
```

## Загрузка

1. Чёрный экран с логотипом «MADE BY PIBS» (~3.6 c), картинка `public/loading.png`
   предзагружается.
2. Резко — экран загрузки: картинка встаёт по высоте целиком, боковые полосы
   закрывает размытая копия той же картинки. Длится **минимум 6 секунд**.
   В правом нижнем углу колёсико `#6652FB` с переливом в розовый/холодный.
3. Быстрый fade в главное меню.

## Бойцы

Каждый боец — файл в `src/characters/` (имя, способности, палитра шортов).
Открыт TEST DUMMY; остальные слоты в `roster.js` показаны как «СКОРО…».
