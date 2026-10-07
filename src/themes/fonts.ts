import type { ThemeMeta } from './types';

const loading = new Map<string, Promise<void>>();

/**
 * Load a scene's wheel font from Google Fonts on demand and wait until it can
 * be drawn. Never rejects, and gives up after a few seconds (blocked or offline):
 * the wheel then falls back to the default font.
 */
export function loadSceneFont({ family, weight }: ThemeMeta['font']): Promise<void> {
  const key = `${family}:${weight}`;
  let p = loading.get(key);
  if (!p) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@${weight}&display=swap`;
    const ready = new Promise<void>((resolve) => {
      link.onload = () => resolve();
      link.onerror = () => resolve();
    })
      .then(() => document.fonts.load(`${weight} 64px "${family}"`))
      .then(
        () => undefined,
        () => undefined,
      );
    document.head.append(link);
    p = Promise.race([ready, new Promise<void>((r) => setTimeout(r, 4000))]);
    loading.set(key, p);
  }
  return p;
}
