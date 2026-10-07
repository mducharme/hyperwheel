import type { ThemeMeta } from '../types';

export const PALETTE = ['#9b2226', '#1d3557', '#e9c46a', '#2a9d8f', '#e76f51', '#f1e3c6'];

/** Everything the UI needs before the scene module itself is loaded. */
export const meta: ThemeMeta = {
  id: 'pirates',
  order: 10,
  name: 'Pirate Cove',
  emoji: '🏴‍☠️',
  tagline: "Take the helm: cannons, treasure and a kraken",
  ui: { accent: '#e9c46a', accent2: '#e76f51', accent3: '#2a9d8f' },
  palette: PALETTE,
  font: { family: 'Pirata One', weight: 400 },
};
