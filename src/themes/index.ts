import type { Theme, ThemeMeta } from './types';
import type { ThemeMusic } from '../audio/Music';
import { meta as synthwave } from './synthwave/meta';
import { meta as candy } from './candy/meta';
import { meta as abyss } from './abyss/meta';
import { meta as cosmos } from './cosmos/meta';
import { meta as haunted } from './haunted/meta';
import { meta as winter } from './winter/meta';
import { meta as tiki } from './tiki/meta';
import music from './music.json';

export interface ThemeEntry extends ThemeMeta {
  /** Load the scene module (cached; the first call downloads it). */
  load(): Promise<Theme<any>>;
}

const once = <T>(fn: () => Promise<T>) => {
  let p: Promise<T> | null = null;
  return () => (p ??= fn());
};

/**
 * Theme registry. Only metadata is in the main bundle; each scene's code is
 * its own chunk, fetched when the scene is first shown (and prefetched when idle).
 *
 * To add a scene: create `themes/<id>/meta.ts` + `themes/<id>/index.ts`
 * exporting a `Theme`, list it here, and optionally add tracks to `music.json`.
 */
export const THEMES: ThemeEntry[] = [
  { ...synthwave, load: once(() => import('./synthwave').then((m) => m.synthwave)) },
  { ...candy, load: once(() => import('./candy').then((m) => m.candy)) },
  { ...abyss, load: once(() => import('./abyss').then((m) => m.abyss)) },
  { ...cosmos, load: once(() => import('./cosmos').then((m) => m.cosmos)) },
  { ...haunted, load: once(() => import('./haunted').then((m) => m.haunted)) },
  { ...winter, load: once(() => import('./winter').then((m) => m.winter)) },
  { ...tiki, load: once(() => import('./tiki').then((m) => m.tiki)) },
];

export const getTheme = (id: string): ThemeEntry => THEMES.find((t) => t.id === id) ?? THEMES[0];

/** Fetch every scene in the background so switching is instant. */
export const prefetchThemes = () => THEMES.forEach((t) => void t.load());

export const MUSIC = music as Record<string, ThemeMusic>;
