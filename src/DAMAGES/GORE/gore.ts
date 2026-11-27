// DAMAGES / GORE — системы повреждений: синяки, царапины, ссадины, раны,
// ожоги лазера, пятна крови. Невидимый внутренний скелет (кости человека,
// не риг) — точки привязки ран на сегментах тела.

export type WoundKind = 'bruise' | 'scratch' | 'abr' | 'scar';

export interface Wound {
  k: WoundKind;
  a: number; // угол
  old: boolean;
  v: number; // интенсивность 0..1
  r: number; // радиус
  x?: number; y?: number; // для головы/торса
  t?: number; s?: number; // для конечностей (вдоль/поперёк)
  spot?: string;
}

// Сегменты тела, на которых живут раны и ожоги (совпадают с BURN_SEGS движка).
export const BODY_SEGMENTS = [
  'torso', 'uF', 'fF', 'tF', 'sF', 'tN', 'sN', 'uN', 'fN', 'head',
] as const;

// Палитры разрывов одежды по персонажам (подложка под рваной тканью).
export const RIP: Record<string, { cloth: string; torso: string; arm: string; leg: string | null }> = {
  jane:       { cloth: '#343840', torso: '#DCE5EF', arm: '#DCE5EF', leg: '#B58C73' },
  negan:      { cloth: '#17191D', torso: '#CFCBC2', arm: '#CFCBC2', leg: '#B58C73' },
  homelander: { cloth: '#182943', torso: '#EFEFEF', arm: '#EFEFEF', leg: '#B58C73' },
  walt:       { cloth: '#526B3D', torso: '#E0A67F', arm: '#E0A67F', leg: null },
  saul:       { cloth: '#17191F', torso: '#EF5B9A', arm: '#EF5B9A', leg: '#B58C73' },
};
