import type { Theme } from './types';
import type { ThemeMusic } from '../audio/Music';
import { synthwave } from './synthwave';
import { candy } from './candy';
import { abyss } from './abyss';
import { cosmos } from './cosmos';
import music from './music.json';

/**
 * Theme registry. To add a scene: create `themes/<id>/index.ts` exporting a
 * `Theme`, add it here, and (optionally) add tracks for it in `music.json`.
 */
export const THEMES: Theme<any>[] = [synthwave, candy, abyss, cosmos];

export const getTheme = (id: string): Theme<any> => THEMES.find((t) => t.id === id) ?? THEMES[0];

export const MUSIC = music as Record<string, ThemeMusic>;
