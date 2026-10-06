const STORE_KEY = 'hyperwheel:v1';
export const MAX_ENTRIES = 500;
export const DEFAULT_NAMES = ['Ada', 'Grace', 'Linus', 'Margaret', 'Alan', 'Hedy', 'Tim', 'Katherine', 'Dennis', 'Barbara'];

/** Device-wide preferences. Wheels themselves (entries, settings, files) live in IndexedDB. */
export interface Prefs {
  sound: boolean;
  music: boolean;
  fx: boolean;
  characters: boolean;
  currentWheel: string | null;
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

const defaults: Prefs = { sound: true, music: true, fx: true, characters: true, currentWheel: null };

const raw: (Prefs & LegacyState) | null = (() => {
  try {
    const s = localStorage.getItem(STORE_KEY);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
})();

export const store: Prefs = { ...defaults, ...(raw ?? {}) };
export const legacy: LegacyState | null = raw && raw.text !== undefined ? raw : null;

export function persist() {
  try {
    const { sound, music, fx, characters, currentWheel } = store;
    localStorage.setItem(STORE_KEY, JSON.stringify({ sound, music, fx, characters, currentWheel }));
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
