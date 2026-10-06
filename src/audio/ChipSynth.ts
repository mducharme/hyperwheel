import type { AudioBus } from './AudioBus';

/** Recipe for a procedurally generated loop. Each theme ships one. */
export interface ChipSong {
  bpm: number;
  /** MIDI note of the tonic. */
  root: number;
  /** Scale as semitone offsets from the root. */
  scale: number[];
  /** Chord progressions as scale degrees; one is picked per variant. */
  progressions: number[][];
  lead: OscillatorType;
  bass: OscillatorType;
  drums: 'four' | 'break' | 'half' | 'shuffle';
  /** 0..1: probability a lead step plays. */
  density: number;
  arp?: boolean;
  /** Lowpass cutoff (Hz) on the lead, for darker/brighter themes. */
  brightness?: number;
}

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  pentatonic: [0, 2, 4, 7, 9],
  minorPent: [0, 3, 5, 7, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
};

const STEPS_PER_BAR = 16;
const BARS = 4;

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

interface Pattern {
  lead: (number | null)[];
  bass: (number | null)[];
  arp: (number | null)[];
}

/**
 * A tiny look-ahead step sequencer. Same song + variant → same loop, so a theme
 * has a handful of recognisable tunes instead of random noodling.
 */
export class ChipSynth {
  private timer = 0;
  private step = 0;
  private nextTime = 0;
  private out: GainNode | null = null;
  private pattern: Pattern | null = null;
  private song: ChipSong | null = null;

  constructor(private bus: AudioBus) {}

  get playing() {
    return this.timer !== 0;
  }

  start(song: ChipSong, variant: number) {
    const ctx = this.bus.ctx;
    if (!ctx) return;
    this.stop(0.05);
    this.song = song;
    this.pattern = compose(song, variant);
    this.out = ctx.createGain();
    this.out.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.out.gain.exponentialRampToValueAtTime(0.9, ctx.currentTime + 0.15);
    this.out.connect(this.bus.music);
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.05;
    this.timer = window.setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  stop(fade = 0.4) {
    const ctx = this.bus.ctx;
    if (this.timer) window.clearInterval(this.timer);
    this.timer = 0;
    if (ctx && this.out) {
      const g = this.out.gain;
      const t = ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(Math.max(0.0001, g.value), t);
      g.exponentialRampToValueAtTime(0.0001, t + fade);
      const out = this.out;
      window.setTimeout(() => out.disconnect(), (fade + 0.2) * 1000);
    }
    this.out = null;
  }

  private schedule() {
    const ctx = this.bus.ctx;
    const song = this.song;
    const p = this.pattern;
    if (!ctx || !song || !p || !this.out) return;
    const stepDur = 60 / song.bpm / 4;
    while (this.nextTime < ctx.currentTime + 0.12) {
      const i = this.step % (STEPS_PER_BAR * BARS);
      const t = this.nextTime;
      const swing = song.drums === 'shuffle' && i % 2 === 1 ? stepDur * 0.33 : 0;
      this.playStep(ctx, song, p, i, t + swing, stepDur);
      this.nextTime += stepDur;
      this.step++;
    }
  }

  private playStep(ctx: AudioContext, song: ChipSong, p: Pattern, i: number, t: number, stepDur: number) {
    const out = this.out!;
    const s = i % STEPS_PER_BAR;
    // drums
    const kick =
      song.drums === 'four' ? s % 4 === 0 : song.drums === 'half' ? s === 0 || s === 10 : s === 0 || s === 7 || s === 10;
    const snare = song.drums === 'half' ? s === 8 : s === 4 || s === 12;
    const hat = song.drums === 'half' ? s % 4 === 2 : s % 2 === 0;
    if (kick) this.kick(ctx, t, out);
    if (snare) this.snare(ctx, t, out);
    if (hat) this.hat(ctx, t, out, s % 4 === 2 ? 0.08 : 0.04);

    const bass = p.bass[i];
    if (bass !== null) this.voice(ctx, song.bass, hz(bass), t, stepDur * 1.8, 0.16, out, 900);
    const lead = p.lead[i];
    if (lead !== null) this.voice(ctx, song.lead, hz(lead), t, stepDur * 1.6, 0.09, out, song.brightness ?? 4000);
    const arp = p.arp[i];
    if (arp !== null) this.voice(ctx, 'square', hz(arp), t, stepDur * 0.7, 0.025, out, 3000);
  }

  private voice(ctx: AudioContext, type: OscillatorType, f: number, t: number, dur: number, vol: number, out: AudioNode, cutoff: number) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp).connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private kick(ctx: AudioContext, t: number, out: AudioNode) {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.2);
  }

  private noiseHit(ctx: AudioContext, t: number, out: AudioNode, type: BiquadFilterType, freq: number, vol: number, dur: number) {
    const src = ctx.createBufferSource();
    src.buffer = this.bus.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 0.5, dur + 0.02);
  }

  private snare(ctx: AudioContext, t: number, out: AudioNode) {
    this.noiseHit(ctx, t, out, 'bandpass', 1800, 0.22, 0.14);
  }

  private hat(ctx: AudioContext, t: number, out: AudioNode, vol: number) {
    this.noiseHit(ctx, t, out, 'highpass', 7000, vol, 0.04);
  }
}

function compose(song: ChipSong, variant: number): Pattern {
  const r = rng(9973 * (variant + 1) + song.root * 31 + song.bpm);
  const prog = song.progressions[variant % song.progressions.length];
  const sc = song.scale;
  const note = (degree: number, octave: number) => {
    const d = ((degree % sc.length) + sc.length) % sc.length;
    const o = Math.floor(degree / sc.length);
    return song.root + sc[d] + 12 * (octave + o);
  };

  const total = STEPS_PER_BAR * BARS;
  const lead: (number | null)[] = new Array(total).fill(null);
  const bass: (number | null)[] = new Array(total).fill(null);
  const arp: (number | null)[] = new Array(total).fill(null);

  // A one-bar motif, varied per bar so the loop has a hook but isn't static
  const motif: (number | null)[] = [];
  let deg = 0;
  for (let s = 0; s < STEPS_PER_BAR; s++) {
    const strong = s % 4 === 0;
    if (r() < (strong ? Math.min(1, song.density + 0.3) : song.density)) {
      deg += Math.round((r() - 0.5) * 4);
      deg = Math.max(-2, Math.min(9, deg));
      motif.push(deg);
    } else motif.push(null);
  }

  for (let bar = 0; bar < BARS; bar++) {
    const chord = prog[bar % prog.length];
    for (let s = 0; s < STEPS_PER_BAR; s++) {
      const i = bar * STEPS_PER_BAR + s;
      const m = motif[s];
      // last bar: answer phrase resolving to the tonic
      if (m !== null) lead[i] = note(bar === BARS - 1 && s >= 12 ? (s === 12 ? chord + 2 : 0) : m + chord, 1);
      if (s % 2 === 0) bass[i] = note(chord + (s % 8 === 6 ? 4 : 0), -1);
      if (song.arp) arp[i] = note(chord + [0, 2, 4, 7][s % 4], 2);
    }
  }
  return { lead, bass, arp };
}
