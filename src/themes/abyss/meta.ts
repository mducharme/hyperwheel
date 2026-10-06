import type { ThemeMeta } from '../types';

export const PALETTE = ['#00e5ff', '#1de9b6', '#2979ff', '#00b8d4', '#651fff', '#64ffda'];

/** Everything the UI needs before the scene module itself is loaded. */
export const meta: ThemeMeta = {
  id: 'abyss',
  name: 'Deep Sea',
  emoji: '🐙',
  tagline: 'Caustics, kelp forests and a fish tornado',
  ui: { accent: '#2fffd6', accent2: '#7b8cff', accent3: '#ffd166' },
  palette: PALETTE,
};
