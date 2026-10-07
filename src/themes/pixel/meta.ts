import type { ThemeMeta } from '../types';

export const PALETTE = ['#ff4d4d', '#ffd23f', '#3ddc84', '#3fa9ff', '#c86bff', '#ff8c2e'];

/** Everything the UI needs before the scene module itself is loaded. */
export const meta: ThemeMeta = {
  id: 'pixel',
  order: 19,
  name: 'Pixel Arcade',
  emoji: '👾',
  tagline: 'Voxel hills, mystery blocks and spinning coins',
  ui: { accent: '#ffd23f', accent2: '#ff4d4d', accent3: '#3fa9ff' },
  palette: PALETTE,
  font: { family: 'Press Start 2P', weight: 400 },
};
