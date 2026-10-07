/**
 * Graphics quality: render resolution and bloom resolution, the two settings
 * that measurably dominate frame cost (scene effects and particles barely register).
 */
export type QualityLevel = 'high' | 'medium' | 'low';
export type QualityPref = 'auto' | QualityLevel;

export const LEVELS: QualityLevel[] = ['high', 'medium', 'low'];

export interface QualitySettings {
  /** Fraction of the (capped) device pixel ratio to render at. */
  resolution: number;
  /** Bloom buffer size relative to the canvas. */
  bloom: number;
}

const SETTINGS: Record<QualityLevel, QualitySettings> = {
  high: { resolution: 1, bloom: 0.5 },
  medium: { resolution: 0.75, bloom: 0.25 },
  low: { resolution: 0.5, bloom: 0.25 },
};

const MAX_PIXEL_RATIO = 2;
/** Below this, the wheel's names get too soft to read. */
const MIN_PIXEL_RATIO = 0.67;

export function qualitySettings(level: QualityLevel) {
  const s = SETTINGS[level];
  const pixelRatio = Math.max(MIN_PIXEL_RATIO, Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO) * s.resolution);
  return { ...s, pixelRatio };
}

/** Where Auto starts: phones and tablets get Medium, everything else High. */
export function initialAutoLevel(): QualityLevel {
  return matchMedia('(pointer: coarse)').matches ? 'medium' : 'high';
}

const STORAGE_KEY = 'locospin:quality';
/** After settling lower, wait this long before trying a higher level again. */
const RETRY_AFTER = 7 * 24 * 3600 * 1000;

interface Saved {
  level: QualityLevel;
  /** Earliest time (ms since epoch) Auto may try a higher level again. */
  retryAt: number;
}

function load(): Saved | null {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    return v && LEVELS.includes(v.level) && typeof v.retryAt === 'number' ? v : null;
  } catch {
    return null;
  }
}

/**
 * Auto quality, remembered per device.
 *
 * - Down: when frames stay slow while something is moving, step down one level.
 *   Slowness is judged against the display's real frame interval (measured while
 *   idle, when the GPU has almost nothing to do), so a browser that caps the frame
 *   rate on battery isn't mistaken for a slow GPU.
 * - Up: frame timing can't show spare capacity (a fast and a just-fast-enough
 *   device both hit the refresh rate), so after a smooth spin Auto *tries* one
 *   level higher, switching while idle. If the next spin holds up, it's kept; if
 *   not, it drops back and waits a week before trying again.
 */
export class AutoQuality {
  level: QualityLevel;
  private retryAt: number;
  /** Testing a level we just stepped up to. */
  private probing = false;

  private idleIntervals: number[] = [];
  private window: number[] = [];
  private slowWindows = 0;
  /** Ignore frames until this time (ms), e.g. while new shaders compile. */
  private quietUntil = 0;

  // since the last settle: did a spin happen, how many windows were measured, was any slow?
  private spun = false;
  private windows = 0;
  private sawSlow = false;

  constructor(private onChange: (level: QualityLevel) => void) {
    const saved = load();
    this.level = saved?.level ?? initialAutoLevel();
    this.retryAt = saved?.retryAt ?? 0;
  }

  /** Skip measurements for a while (scene switches, quality changes). */
  pause(ms: number, now = performance.now()) {
    this.quietUntil = Math.max(this.quietUntil, now + ms);
    this.window.length = 0;
    this.slowWindows = 0;
  }

  /** Called on every display frame while idle, rendered or not, with the time since the previous one. */
  idleTick(interval: number) {
    if (interval <= 0 || interval > 100) return;
    this.idleIntervals.push(interval);
    if (this.idleIntervals.length > 120) this.idleIntervals.shift();
  }

  /** A spin started: its frames (and its celebration's) decide whether to try higher. */
  spinStarted() {
    this.spun = true;
  }

  /** Called for each rendered frame while active (spinning, dragging, celebrating). */
  activeFrame(frameTime: number, now = performance.now()) {
    if (now < this.quietUntil || frameTime > 250) return; // tab switches, hitches from loading
    this.window.push(frameTime);
    if (this.window.length < 60) return;

    const avg = this.window.reduce((a, b) => a + b, 0) / this.window.length;
    this.window.length = 0;
    // ~45 fps on a 60 Hz screen; proportionally more slack when the browser caps the rate
    const slow = avg > Math.max(this.displayInterval() * 1.4, 22);
    this.windows++;
    if (slow) this.sawSlow = true;
    this.slowWindows = slow ? this.slowWindows + 1 : 0;
    // two slow windows in a row (~2 s) so a single loading hitch doesn't count
    if (this.slowWindows >= 2) this.stepDown(now);
  }

  /** The app went idle: if the spin that just ended was smooth, keep or try a higher level. */
  settled(now = performance.now()) {
    if (!this.spun) return;
    const measured = this.windows >= 2;
    const smooth = measured && !this.sawSlow;
    this.spun = false;
    this.windows = 0;
    this.sawSlow = false;
    // a level on trial gets no second chance: any slow stretch sends it back
    if (this.probing && measured && !smooth) return this.stepDown(now);
    if (!smooth) return;

    if (this.probing) {
      this.probing = false; // held up through a whole spin: keep it
      this.save();
      return;
    }
    const up = LEVELS[LEVELS.indexOf(this.level) - 1];
    if (up && Date.now() >= this.retryAt) {
      this.probing = true;
      this.set(up, now);
    }
  }

  private stepDown(now: number) {
    this.slowWindows = 0;
    this.probing = false;
    this.retryAt = Date.now() + RETRY_AFTER;
    const down = LEVELS[LEVELS.indexOf(this.level) + 1];
    if (down) this.set(down, now);
    else this.save();
  }

  private set(level: QualityLevel, now: number) {
    this.level = level;
    this.pause(3000, now);
    if (!this.probing) this.save(); // a level on trial is only remembered once it holds up
    this.onChange(level);
  }

  private save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ level: this.level, retryAt: this.retryAt } satisfies Saved));
    } catch {
      /* private mode etc. */
    }
  }

  /** Median idle frame interval: the screen's refresh (or the browser's cap). */
  private displayInterval() {
    if (this.idleIntervals.length < 20) return 1000 / 60;
    const sorted = [...this.idleIntervals].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }
}
