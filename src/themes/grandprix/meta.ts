import type { ThemeMeta } from '../types';

export const PALETTE = ['#e10600', '#ffd400', '#0057ff', '#00a19c', '#ff8000', '#1d1d22'];

/** Everything the UI needs before the scene module itself is loaded. */
export const meta: ThemeMeta = {
  id: 'grandprix',
  order: 9,
  name: 'Grand Prix',
  emoji: '🏁',
  tagline: 'Start lights, champagne and a victory lap',
  ui: { accent: '#ff2a1f', accent2: '#ffd400', accent3: '#00d2be' },
  palette: PALETTE,
  font: { family: 'Racing Sans One', weight: 400 },
};
