import type { ThemeMeta } from '../types';

export const PALETTE = ['#ff8c42', '#2ec4b6', '#ffd23f', '#e63946', '#7bd389', '#8e5ccf'];

/** Everything the UI needs before the scene module itself is loaded. */
export const meta: ThemeMeta = {
  id: 'tiki',
  order: 7,
  name: 'Tiki Island',
  emoji: '🌴',
  tagline: 'Sunset beach, tiki torches and a coconut cannon',
  ui: { accent: '#ff8c42', accent2: '#2ec4b6', accent3: '#ffd23f' },
  palette: PALETTE,
  font: { family: 'Lilita One', weight: 400 },
};
