import type { ThemeMeta } from '../types';

export const PALETTE = ['#6a994e', '#f4a259', '#bc4b51', '#5b8e7d', '#f4e285', '#3d405b'];

/** Everything the UI needs before the scene module itself is loaded. */
export const meta: ThemeMeta = {
  id: 'dino',
  order: 12,
  name: 'Dino Valley',
  emoji: '🦖',
  tagline: 'Misty ferns, long necks and a T-rex roar',
  ui: { accent: '#9bd77c', accent2: '#f4a259', accent3: '#f4e285' },
  palette: PALETTE,
  font: { family: 'Luckiest Guy', weight: 400 },
};
