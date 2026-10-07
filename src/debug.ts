/**
 * Debug mode: shows the renderer/FPS badges and logs what the app decides
 * (music tracks, celebrations, character animations) to the console.
 * Turn it on in Settings, or with `?debug` in the URL (`?debug=0` turns it off).
 */
export const debug = { enabled: false };

const STYLE = 'background:#2a1747;color:#ff9be8;padding:1px 6px;border-radius:4px;font-weight:600';

/** One-line debug log, e.g. `dlog('music', 'spin song', url)`. */
export function dlog(topic: string, ...args: unknown[]) {
  if (debug.enabled) console.log(`%c${topic}`, STYLE, ...args);
}

/** A collapsible group of debug lines; `lines` only runs when debug mode is on. */
export function dgroup(topic: string, title: string, lines: (log: (...args: unknown[]) => void) => void) {
  if (!debug.enabled) return;
  console.groupCollapsed(`%c${topic}`, STYLE, title);
  try {
    lines((...args) => console.log(...args));
  } finally {
    console.groupEnd();
  }
}
