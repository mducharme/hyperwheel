/**
 * Start-up links: `/<preset>` opens a bundled preset wheel (its file name
 * without `.locospin`), and `#<scene>` starts in that scene — together:
 * `/team-standup#pizza`. Share links (`#w=…`) are handled by the session.
 */
import { THEMES } from '../themes';

const BASE = import.meta.env.BASE_URL;
const SLUG = /^[\w-]+$/;

/** The preset named in the path, if any. */
export function routePreset(): string | undefined {
  const path = decodeURIComponent(location.pathname.slice(BASE.length)).replace(/\/+$/, '');
  return SLUG.test(path) ? path : undefined;
}

/** The scene named in the hash, if it's a real scene id. */
export function routeTheme(): string | undefined {
  const id = location.hash.slice(1);
  return THEMES.some((t) => t.id === id) ? id : undefined;
}

/** Keep the address bar in step with the open wheel: a preset's own path, otherwise the root. Drops the hash. */
export function showRoute(preset: string | undefined) {
  const path = BASE + (preset ? encodeURIComponent(preset) : '');
  if (location.pathname + location.hash !== path) history.replaceState(null, '', path + location.search);
}

/** The scene to start in: the one named in the hash, otherwise a random one. Picked once per page load. */
export const startTheme: string = routeTheme() ?? THEMES[Math.floor(Math.random() * THEMES.length)].id;

export const presetSlug = (file: string) => file.replace(/\.locospin$/, '');
