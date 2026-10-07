import type { ThemeMeta } from '../types';

export const PALETTE = ['#ffd166', '#e63946', '#f4a261', '#2a9d8f', '#fff1d0', '#8d5524'];

/** Everything the UI needs before the scene module itself is loaded. */
export const meta: ThemeMeta = {
  id: 'pizza',
  order: 20,
  name: 'Pizza Party',
  emoji: '🍕',
  tagline: 'A wood-fired oven, flying dough and extra cheese',
  ui: { accent: '#ffd166', accent2: '#e63946', accent3: '#2a9d8f' },
  palette: PALETTE,
  font: { family: 'Chewy', weight: 400 },
};
