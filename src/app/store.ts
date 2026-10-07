import { LIMITS } from '../library/limits';

const STORE_KEY = 'hyperwheel:v1';

export const MAX_ENTRIES = LIMITS.entries;
export const DEFAULT_NAMES = ['Ada', 'Grace', 'Linus', 'Margaret', 'Alan', 'Hedy', 'Tim', 'Katherine', 'Dennis', 'Barbara'];

/** Device-wide preferences. Wheels themselves (entries, settings, files) live in IndexedDB. */
export interface Prefs {
  sound: boolean;
  music: boolean;
  fx: boolean;
  characters: boolean;
  currentWheel: string | null;
  /** Enabled built-in character packs (null = the defaults). */
  packs: string[] | null;
  /** Last scene shown — a hint to start downloading it before the wheel document is read. */
  lastTheme: string | null;
  /** Spin songs from every scene instead of only the current one. */
  musicMix: boolean;
}

/** Fields from before wheels moved to IndexedDB, read once for migration. */
export interface LegacyState {
  text?: string;
  theme?: string;
  duration?: number;
  removeWinner?: boolean;
  autoremove?: boolean;
  autoSwitch?: boolean;
  switchMode?: 'next' | 'random';
  results?: { name: string; at: number }[];
}

const defaults: Prefs = { sound: true, music: true, fx: true, characters: true, currentWheel: null, packs: null, lastTheme: null, musicMix: false };

const raw: (Prefs & LegacyState) | null = (() => {
  try {
    const s = localStorage.getItem(STORE_KEY);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
})();

export const store: Prefs = { ...defaults, ...(raw ?? {}) };
store.lastTheme ??= raw?.theme ?? null;
export const legacy: LegacyState | null = raw && raw.text !== undefined ? raw : null;

export function persist() {
  try {
    const { sound, music, fx, characters, currentWheel, packs, lastTheme, musicMix } = store;
    localStorage.setItem(STORE_KEY, JSON.stringify({ sound, music, fx, characters, currentWheel, packs, lastTheme, musicMix }));
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
