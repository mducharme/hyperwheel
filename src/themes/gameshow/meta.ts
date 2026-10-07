import type { ThemeMeta } from '../types';

export const PALETTE = ['#ff3b5c', '#ffd23f', '#3b82ff', '#2ee59d', '#b14dff', '#ff8c2a'];

/** Everything the UI needs before the scene module itself is loaded. */
export const meta: ThemeMeta = {
  id: 'gameshow',
  order: 8,
  name: 'Prime Time',
  emoji: '🎙️',
  tagline: 'Spotlights, a live studio audience and a jackpot',
  ui: { accent: '#ffd23f', accent2: '#ff3b5c', accent3: '#3b82ff' },
  palette: PALETTE,
  font: { family: 'Righteous', weight: 400 },
};
