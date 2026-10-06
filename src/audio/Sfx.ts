import type { AudioBus } from './AudioBus';

export type TickStyle = 'click' | 'pop' | 'bubble' | 'blip' | 'knock' | 'jingle' | 'marimba';

/** Synthesized sound effects — no asset files. Each theme picks a tick flavour. */
export class Sfx {
  enabled = true;
  tickStyle: TickStyle = 'click';
  private lastTick = 0;

  constructor(private bus: AudioBus) {}

  private get live() {
    return this.enabled && this.bus.ctx ? this.bus.ctx : null;
  }

  private env(ctx: AudioContext, t: number, peak: number, attack: number, decay: number) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(this.bus.sfx);
    return g;
  }

  private osc(ctx: AudioContext, type: OscillatorType, f0: number, f1: number, t: number, dur: number, out: AudioNode) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    o.connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(ctx: AudioContext, t: number, dur: number, filter: BiquadFilterType, freq: number, q: number, out: AudioNode) {
    const src = ctx.createBufferSource();
    src.buffer = this.bus.noise;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    f.Q.value = q;
    src.connect(f).connect(out);
    src.start(t, Math.random() * 0.5, dur + 0.05);
    return f;
  }

  /** Peg tick. `speed` (rad/s) softens and thins out rapid ticks. */
  tick(speed: number) {
    const ctx = this.live;
    if (!ctx) return;
    const t = ctx.currentTime;
    if (t - this.lastTick < 0.03) return;
    this.lastTick = t;
    const vol = Math.min(1, 0.35 + 3 / (1 + speed));
    const jitter = 1 + (Math.random() - 0.5) * 0.12;

    switch (this.tickStyle) {
      case 'click':
        this.noise(ctx, t, 0.04, 'bandpass', 2600 * jitter, 6, this.env(ctx, t, 0.5 * vol, 0.002, 0.04));
        this.osc(ctx, 'triangle', 1300 * jitter, 500, t, 0.03, this.env(ctx, t, 0.18 * vol, 0.002, 0.03));
        break;
      case 'pop':
        this.osc(ctx, 'sine', 900 * jitter, 2200 * jitter, t, 0.05, this.env(ctx, t, 0.35 * vol, 0.003, 0.05));
        break;
      case 'bubble':
        this.osc(ctx, 'sine', 380 * jitter, 1400 * jitter, t, 0.07, this.env(ctx, t, 0.35 * vol, 0.004, 0.07));
        break;
      case 'blip':
        this.osc(ctx, 'square', 1800 * jitter, 1200, t, 0.03, this.env(ctx, t, 0.08 * vol, 0.002, 0.035));
        break;
      case 'marimba': {
        // each peg plays a random note of a major pentatonic scale
        const notes = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];
        const f = notes[Math.floor(Math.random() * notes.length)];
        this.osc(ctx, 'sine', f, f, t, 0.18, this.env(ctx, t, 0.22 * vol, 0.002, 0.18));
        this.osc(ctx, 'triangle', f * 4, f * 4, t, 0.04, this.env(ctx, t, 0.03 * vol, 0.001, 0.04));
        break;
      }
      case 'jingle':
        // a little sleigh bell: two bright partials and a shimmer of noise
        this.osc(ctx, 'sine', 2600 * jitter, 2500 * jitter, t, 0.12, this.env(ctx, t, 0.12 * vol, 0.002, 0.12));
        this.osc(ctx, 'sine', 3900 * jitter, 3800 * jitter, t, 0.08, this.env(ctx, t, 0.06 * vol, 0.002, 0.08));
        this.noise(ctx, t, 0.05, 'highpass', 6000, 1, this.env(ctx, t, 0.08 * vol, 0.001, 0.05));
        break;
      case 'knock':
        // hollow wooden knock: a short pitched thunk plus a dull tap
        this.osc(ctx, 'triangle', 240 * jitter, 120, t, 0.06, this.env(ctx, t, 0.4 * vol, 0.002, 0.07));
        this.noise(ctx, t, 0.03, 'lowpass', 900, 1, this.env(ctx, t, 0.25 * vol, 0.001, 0.03));
        break;
    }
  }

  /** Rising whoosh when a spin launches. */
  whoosh() {
    const ctx = this.live;
    if (!ctx) return;
    const t = ctx.currentTime;
    const f = this.noise(ctx, t, 0.7, 'bandpass', 300, 1.2, this.env(ctx, t, 0.4, 0.12, 0.6));
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(3000, t + 0.5);
  }

  /** Low thump + crackle, for fireworks and shockwaves. */
  boom(delay = 0, size = 1) {
    const ctx = this.live;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    this.osc(ctx, 'sine', 120 * size, 35, t, 0.5, this.env(ctx, t, 0.6, 0.005, 0.5));
    this.noise(ctx, t, 0.6, 'lowpass', 1800, 0.7, this.env(ctx, t, 0.35, 0.005, 0.55));
    for (let i = 0; i < 6; i++) {
      const tc = t + 0.15 + Math.random() * 0.5;
      this.noise(ctx, tc, 0.03, 'highpass', 5000, 1, this.env(ctx, tc, 0.12, 0.001, 0.03));
    }
  }

  /** Cartoon pop — candy, bubbles, gumballs. */
  pop(delay = 0, pitch = 1) {
    const ctx = this.live;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    this.osc(ctx, 'sine', 500 * pitch, 1600 * pitch, t, 0.06, this.env(ctx, t, 0.3, 0.003, 0.07));
  }

  /** A studio audience applauding: dozens of randomised hand-claps over a crowd swell. */
  applause(duration = 2.6, delay = 0) {
    const ctx = this.live;
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const swell = this.env(ctx, t0, 0.12, 0.25, duration);
    this.noise(ctx, t0, duration + 0.3, 'bandpass', 1400, 0.6, swell);
    const claps = Math.round(duration * 38);
    for (let i = 0; i < claps; i++) {
      // denser at the start, thinning out toward the end
      const t = t0 + Math.pow(Math.random(), 1.4) * duration;
      const f = this.noise(ctx, t, 0.03, 'bandpass', 1200 + Math.random() * 1600, 2.5, this.env(ctx, t, 0.07 + Math.random() * 0.06, 0.001, 0.035));
      f.Q.value = 2 + Math.random() * 2;
    }
  }

  /** Sparkly major arpeggio — the fallback winner sting when a theme has no win track. */
  fanfare() {
    const ctx = this.live;
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568.0];
    notes.forEach((freq, i) => {
      const t = now + i * 0.075;
      this.osc(ctx, 'triangle', freq, freq, t, 1.4, this.env(ctx, t, 0.2, 0.015, 1.4));
      this.osc(ctx, 'sine', freq * 2, freq * 2, t, 1.4, this.env(ctx, t, 0.05, 0.015, 1.4));
    });
    const t = now + notes.length * 0.075;
    for (const freq of [523.25, 659.25, 783.99, 1046.5]) {
      this.osc(ctx, 'sawtooth', freq, freq, t, 2.2, this.env(ctx, t, 0.05, 0.05, 2.1));
    }
  }
}
