import type { ThemeMeta } from '../types';

export const PALETTE = ['#1f4e8c', '#e0b04a', '#2ab7a9', '#c4572a', '#e8d2a6', '#2b2440'];

/** Everything the UI needs before the scene module itself is loaded. */
export const meta: ThemeMeta = {
  id: 'pharaoh',
  order: 16,
  name: 'Desert Pharaoh',
  emoji: '🏺',
  tagline: 'Torchlit pyramids, scarabs and the Eye of Ra',
  ui: { accent: '#e0b04a', accent2: '#2ab7a9', accent3: '#5b8dd6' },
  palette: PALETTE,
  font: { family: 'Marcellus SC', weight: 400 },
};
