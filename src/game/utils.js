// Базовые математические хелперы движка.
export const TAU = Math.PI * 2;

export const rad = (d) => (d * Math.PI) / 180;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const lerp = (a, b, t) => a + (b - a) * t;

export const rnd = (a, b) =>
  b === undefined ? Math.random() * a : a + Math.random() * (b - a);

export const ease = (t) => t * t * (3 - 2 * t);

// Поиск внутри конкретного экрана (не документа целиком).
export const $ = (sel, root = document) => root.querySelector(sel);
