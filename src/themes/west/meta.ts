import type { ThemeMeta } from '../types';

export const PALETTE = ['#c0392b', '#2e86ab', '#f4d35e', '#7a5c3e', '#e9d8a6', '#3d5a40'];

/** Everything the UI needs before the scene module itself is loaded. */
export const meta: ThemeMeta = {
  id: 'west',
  order: 13,
  name: 'Wild West',
  emoji: '🤠',
  tagline: 'Saloons, tumbleweeds and a stick of dynamite',
  ui: { accent: '#f4a259', accent2: '#2e86ab', accent3: '#f4d35e' },
  palette: PALETTE,
  font: { family: 'Rye', weight: 400 },
};
