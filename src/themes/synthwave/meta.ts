import type { ThemeMeta } from '../types';

export const PALETTE = ['#ff2fd0', '#7b2fff', '#2fd8ff', '#ffcf2f', '#ff5a5f', '#2fffa8'];

/** Everything the UI needs before the scene module itself is loaded. */
export const meta: ThemeMeta = {
  id: 'synthwave',
  name: 'Neon Drive',
  emoji: '🌆',
  tagline: 'Retro sun, chrome grids, laser cannons',
  ui: { accent: '#ff3df2', accent2: '#3df5ff', accent3: '#ffe03d' },
  palette: PALETTE,
};
