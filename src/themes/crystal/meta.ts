import type { ThemeMeta } from '../types';

/** Gem colours the crystals glow in. */
export const GEMS = ['#b06cff', '#3d8bff', '#19e3a8', '#ff4f7b', '#ffc94d', '#4ff3ff'];

export const PALETTE = ['#9b5de5', '#3a86ff', '#06d6a0', '#ef476f', '#ffd166', '#5e548e'];

/** Everything the UI needs before the scene module itself is loaded. */
export const meta: ThemeMeta = {
  id: 'crystal',
  order: 11,
  name: 'Crystal Caverns',
  emoji: '💎',
  tagline: 'Glowing geodes, a gem shower and a runaway mine cart',
  ui: { accent: '#b38cff', accent2: '#3de0ff', accent3: '#ff6fa8' },
  palette: PALETTE,
  font: { family: 'Cinzel', weight: 700 },
};
