import type { ThemeMeta } from '../types';

export const PALETTE = ['#7cff4f', '#9b5cff', '#ff8c42', '#2ec4b6', '#2b2d42', '#ff5d8f'];

/** Everything the UI needs before the scene module itself is loaded. */
export const meta: ThemeMeta = {
  id: 'lab',
  order: 18,
  name: 'Mad Lab',
  emoji: '⚗️',
  tagline: "Tesla coils, bubbling potions and IT'S ALIVE!",
  ui: { accent: '#7cff4f', accent2: '#b07cff', accent3: '#ff8c42' },
  palette: PALETTE,
  font: { family: 'Bangers', weight: 400 },
};
