import { LIMITS } from './limits';
import type { WheelSettings } from './wheels';

/**
 * Turning untrusted data (an imported .hyperwheel file, later share links)
 * into wheel fields we can safely store and render. Everything is type-checked,
 * trimmed and clamped; anything unexpected is dropped rather than trusted.
 */

export interface CleanWheel {
  title: string;
  entries: { name: string; character?: string }[];
  settings: Partial<WheelSettings>;
  results: { name: string; at: number }[];
}

export const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export const array = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Strip control characters and clamp length. Returns '' for non-strings. */
export function cleanText(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, ' ').trim().slice(0, max);
}

/** Built-in character ids look like `builtin:<pack>/<name>`. */
const BUILTIN_ID = /^builtin:[a-z0-9-]{1,32}\/[a-z0-9_-]{1,64}$/;
/** Uploaded asset ids are SHA-256 hex digests. */
const ASSET_ID = /^[0-9a-f]{64}$/;
const THEME_ID = /^[a-z0-9-]{1,32}$/;

/**
 * @param input the raw `wheel` object from a manifest (or share link)
 * @param assets ids of uploaded models that actually exist (references to anything else are dropped)
 */
export function sanitizeWheel(input: unknown, assets: Set<string>): CleanWheel {
  const w = isObject(input) ? input : {};

  const entries: CleanWheel['entries'] = [];
  for (const raw of array(w.entries)) {
    if (entries.length >= LIMITS.entries) break;
    if (!isObject(raw)) continue;
    const name = cleanText(raw.name, LIMITS.nameLength);
    if (!name) continue;
    const c = raw.character;
    const character = typeof c === 'string' && (BUILTIN_ID.test(c) || (ASSET_ID.test(c) && assets.has(c))) ? c : undefined;
    entries.push(character ? { name, character } : { name });
  }

  const s = isObject(w.settings) ? w.settings : {};
  const settings: Partial<WheelSettings> = {};
  if (typeof s.theme === 'string' && THEME_ID.test(s.theme)) settings.theme = s.theme;
  if (typeof s.duration === 'number' && Number.isFinite(s.duration)) {
    settings.duration = Math.round(Math.min(LIMITS.duration.max, Math.max(LIMITS.duration.min, s.duration)));
  }
  if (typeof s.removeWinner === 'boolean') settings.removeWinner = s.removeWinner;

  const results: CleanWheel['results'] = [];
  for (const raw of array(w.results)) {
    if (results.length >= LIMITS.results) break;
    if (!isObject(raw)) continue;
    const name = cleanText(raw.name, LIMITS.nameLength);
    const at = typeof raw.at === 'number' && Number.isFinite(raw.at) ? raw.at : 0;
    if (name) results.push({ name, at });
  }

  return { title: cleanText(w.title, LIMITS.titleLength) || 'Imported wheel', entries, settings, results };
}
