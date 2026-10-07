import type { ThemeMeta } from '../types';

export const PALETTE = ['#ff2a6d', '#05d9e8', '#7b2cff', '#ff9f1c', '#1b1b3a', '#f9f871'];

/** Everything the UI needs before the scene module itself is loaded. */
export const meta: ThemeMeta = {
  id: 'neotokyo',
  order: 15,
  name: 'Neo Tokyo',
  emoji: '🌃',
  tagline: 'Rain, neon signs and flying cars',
  ui: { accent: '#ff2a6d', accent2: '#05d9e8', accent3: '#f9f871' },
  palette: PALETTE,
  font: { family: 'Audiowide', weight: 400 },
};
