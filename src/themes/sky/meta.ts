import type { ThemeMeta } from '../types';

export const PALETTE = ['#ff6b6b', '#4ecdc4', '#ffe66d', '#5d9cec', '#ff9f43', '#a29bfe'];

/** Everything the UI needs before the scene module itself is loaded. */
export const meta: ThemeMeta = {
  id: 'sky',
  order: 17,
  name: 'Sky Islands',
  emoji: '🎈',
  tagline: 'Floating islands, waterfalls and hot-air balloons',
  ui: { accent: '#4ecdc4', accent2: '#ff6b6b', accent3: '#ffe66d' },
  palette: PALETTE,
  font: { family: 'Baloo 2', weight: 800 },
};
