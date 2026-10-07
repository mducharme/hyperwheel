import type { ThemeMeta } from '../types';

export const PALETTE = ['#ff8fab', '#ffd166', '#06d6a0', '#4cc9f0', '#b388ff', '#ff9e5e'];

/** Everything the UI needs before the scene module itself is loaded. */
export const meta: ThemeMeta = {
  id: 'candy',
  order: 2,
  name: 'Sugar Rush',
  emoji: '🍭',
  tagline: 'Cotton-candy skies and a gumball cannon',
  ui: { accent: '#ff6fb5', accent2: '#5ee6c8', accent3: '#ffd166' },
  palette: PALETTE,
  font: { family: 'Fredoka', weight: 700 },
};
