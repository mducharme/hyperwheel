import type { QualityPref } from '../engine/quality';
import { LIMITS } from '../library/limits';

const STORE_KEY = 'hyperwheel:v1';

export const MAX_ENTRIES = LIMITS.entries;
export const DEFAULT_NAMES = ['Ada', 'Grace', 'Linus', 'Margaret', 'Alan', 'Hedy', 'Tim', 'Katherine', 'Dennis', 'Barbara'];

/** Device-wide preferences. Wheels themselves (entries, settings, files) live in IndexedDB. */
export interface Prefs {
  sound: boolean;
  music: boolean;
  currentWheel: string | null;
  /** Enabled built-in character packs (null = the defaults). */
  packs: string[] | null;
  /** Last scene shown — a hint to start downloading it before the wheel document is read. */
  lastTheme: string | null;
  /** Graphics quality (resolution + bloom); Auto adapts to the device. */
  graphics: QualityPref;
  /** Debug mode: renderer/FPS badges and console logs (see src/debug.ts). */
  debug: boolean;
}

const defaults: Prefs = { sound: true, music: true, currentWheel: null, packs: null, lastTheme: null, graphics: 'auto', debug: false };

const raw: Partial<Prefs> | null = (() => {
  try {
    const s = localStorage.getItem(STORE_KEY);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
})();

export const store: Prefs = { ...defaults, ...(raw ?? {}) };
if (!['auto', 'high', 'medium', 'low'].includes(store.graphics)) store.graphics = 'auto';

export function persist() {
  try {
    const { sound, music, currentWheel, packs, lastTheme, graphics, debug } = store;
    localStorage.setItem(STORE_KEY, JSON.stringify({ sound, music, currentWheel, packs, lastTheme, graphics, debug }));
  } catch {
    /* private mode etc. */
  }
}

export const parseNames = (text: string) =>
  text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_ENTRIES);
