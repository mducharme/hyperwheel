import type { ThemeMeta } from '../types';

export const PALETTE = ['#4cc9f0', '#cfe2f3', '#d62839', '#2a9d8f', '#f2c230', '#274c77'];

/** Everything the UI needs before the scene module itself is loaded. */
export const meta: ThemeMeta = {
  id: 'winter',
  name: 'Winter',
  emoji: '❄️',
  tagline: 'Aurora skies, snowmen and a snowball fight',
  ui: { accent: '#7fdbff', accent2: '#ff4d6d', accent3: '#ffd23f' },
  palette: PALETTE,
};
