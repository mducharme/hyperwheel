import type { Theme, ThemeMeta } from './types';
import type { ThemeMusic } from '../audio/Music';
import music from './music.json';

export interface ThemeEntry extends ThemeMeta {
  /** Load the scene module (cached; the first call downloads it). */
  load(): Promise<Theme<any>>;
}

const once = <T>(fn: () => Promise<T>) => {
  let p: Promise<T> | null = null;
  return () => (p ??= fn());
};

// Every folder with a meta.ts + index.ts is a scene. Metadata is bundled (menus,
// colours, fonts); each scene's code is its own chunk, fetched when first shown.
const metas = import.meta.glob<ThemeMeta>('./*/meta.ts', { eager: true, import: 'meta' });
const modules = import.meta.glob<Record<string, Theme<any>>>('./*/index.ts');

/**
 * Scene registry, built from the folders in src/themes.
 *
 * To add a scene: create `themes/<id>/meta.ts` (exporting `meta`, with `id`
 * matching the folder name) and `themes/<id>/index.ts` (exporting a `Theme`
 * named after the id), and optionally add tracks to `music.json`.
 */
export const THEMES: ThemeEntry[] = Object.entries(metas)
  .map(([path, meta]) => {
    const folder = path.split('/')[1];
    const load = modules[`./${folder}/index.ts`];
    if (meta.id !== folder) throw new Error(`themes/${folder}/meta.ts: id is "${meta.id}", expected "${folder}"`);
    if (!load) throw new Error(`themes/${folder} has a meta.ts but no index.ts`);
    return {
      ...meta,
      load: once(async () => {
        const theme = (await load())[folder];
        if (!theme) throw new Error(`themes/${folder}/index.ts must export a Theme named "${folder}"`);
        return theme;
      }),
    };
  })
  .sort((a, b) => a.order - b.order);

export const getTheme = (id: string): ThemeEntry => THEMES.find((t) => t.id === id) ?? THEMES[0];

/** Fetch every scene in the background so switching is instant. */
export const prefetchThemes = () => THEMES.forEach((t) => void t.load());

export const MUSIC = music as Record<string, ThemeMusic>;
