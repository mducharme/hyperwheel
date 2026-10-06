import type { ThemeMeta } from '../types';

export const PALETTE = ['#8a7dff', '#ffb347', '#3d2a8a', '#ff6b6b', '#64ffda', '#e0d4ff'];

/** Everything the UI needs before the scene module itself is loaded. */
export const meta: ThemeMeta = {
  id: 'cosmos',
  name: 'Event Horizon',
  emoji: '🪐',
  tagline: 'Black holes, warp speed and zero-g',
  ui: { accent: '#ffb347', accent2: '#8a7dff', accent3: '#64ffda' },
  palette: PALETTE,
};
