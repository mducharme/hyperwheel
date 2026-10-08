/**
 * Respect the OS "reduce motion" setting (it can change while the page is open).
 * When it's on: no camera shake or orbit, gentler zoom and sway, no strobes —
 * flashes are dim, slow and spaced out, lightning is one soft pulse.
 */
import { uCalm } from './globals';

const query = matchMedia('(prefers-reduced-motion: reduce)');

export const motion = { reduced: query.matches };

const sync = () => {
  motion.reduced = query.matches;
  uCalm.value = motion.reduced ? 1 : 0;
};
sync();
query.addEventListener('change', sync);

/**
 * Lightning brightness `t` seconds after a strike (0..1, done after 1 s):
 * a sharp double strike, or a single soft swell when motion is reduced.
 */
export function strike(t: number) {
  if (motion.reduced) return t < 1 ? Math.sin(t * Math.PI) * 0.35 : 0;
  return t < 0.12 ? 1 : t < 0.22 ? 0.15 : t < 0.32 ? 0.85 : Math.max(0, 0.85 - (t - 0.32) * 2.5);
}
