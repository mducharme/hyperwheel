import type { ThemeMeta } from '../types';

export const PALETTE = ['#f4a6b8', '#7fb7a4', '#e9d7c0', '#c8553d', '#8e7cc3', '#4f6d5a'];

/** Everything the UI needs before the scene module itself is loaded. */
export const meta: ThemeMeta = {
  id: 'zen',
  order: 14,
  name: 'Zen Garden',
  emoji: '🌸',
  tagline: 'Raked sand, koi and falling blossoms',
  ui: { accent: '#f4a6b8', accent2: '#7fb7a4', accent3: '#ffd6a5' },
  palette: PALETTE,
  font: { family: 'Kaushan Script', weight: 400 },
};
