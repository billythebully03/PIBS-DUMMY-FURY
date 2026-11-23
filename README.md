# PIBS-DUMMY-FURY

React/Vite перенос игры **DUMMY FURY · Test Dummy Edition**.

## Запуск

```bash
npm install
npm run dev
```

Продакшен-сборка для Vercel:

```bash
npm run build
```

Vercel автоматически определит Vite-проект. Используются стандартные настройки: build command `npm run build`, output directory `dist`.

## Структура

- `src/App.jsx` — экраны, интерфейс и переходы React.
- `src/styles.css` — визуальная часть приложения.
- `src/game/engine.js` — canvas-рендер, физика, бойцы, AI, звук и эффекты.
- `src/main.jsx` — точка входа.
