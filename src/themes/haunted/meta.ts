import type { ThemeMeta } from '../types';

export const PALETTE = ['#ff7a1a', '#5b2a86', '#2fbf71', '#d9363e', '#f2c230', '#2a1f3d'];

/** Everything the UI needs before the scene module itself is loaded. */
export const meta: ThemeMeta = {
  id: 'haunted',
  name: 'Haunted',
  emoji: '🎃',
  tagline: 'Fog, jack-o’-lanterns and a bat swarm',
  ui: { accent: '#ff8a1f', accent2: '#9b5cff', accent3: '#7dff6a' },
  palette: PALETTE,
};
