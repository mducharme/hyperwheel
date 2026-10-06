import type { AudioBus } from './AudioBus';
import { ChipSynth, type ChipSong } from './ChipSynth';

export interface TrackSpec {
  file: string;
  seconds?: number;
  prompt?: string;
}
export interface ThemeMusic {
  spin: TrackSpec[];
  win: TrackSpec[];
}

/**
 * Spin music, wheelofnames-style. Uses generated tracks from
 * `public/music/<theme>/` when they exist and falls back to the theme's
 * procedural chiptune otherwise — so the app sounds right before any audio
 * files have been generated.
 */
export class Music {
  enabled = true;
  private synth: ChipSynth;
  private buffers = new Map<string, AudioBuffer | null>(); // null = missing
  private loading = new Map<string, Promise<void>>();
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private themeId = '';
  private manifest: ThemeMusic = { spin: [], win: [] };
  private song: ChipSong | null = null;
  private lastSpin = -1;
  private winding = false;
  /** The wheel's own uploaded audio, preferred over the scene's when present. */
  private custom: { spin: AudioBuffer[]; win: AudioBuffer | null } = { spin: [], win: null };

  constructor(private bus: AudioBus) {
    this.synth = new ChipSynth(bus);
  }

  setTheme(id: string, manifest: ThemeMusic | undefined, song: ChipSong) {
    this.stop(0.3);
    this.themeId = id;
    this.manifest = manifest ?? { spin: [], win: [] };
    this.song = song;
    this.lastSpin = -1;
    // decode in the background as soon as audio is allowed
    this.bus.onReady(() => {
      if (this.themeId !== id) return;
      for (const t of [...this.manifest.spin, ...this.manifest.win]) void this.load(this.url(t));
    });
  }

  private url(t: TrackSpec) {
    return `${import.meta.env.BASE_URL}music/${this.themeId}/${t.file}`;
  }

  private load(url: string): Promise<void> {
    const ctx = this.bus.ctx;
    if (!ctx) return Promise.resolve();
    if (this.buffers.has(url)) return Promise.resolve();
    let p = this.loading.get(url);
    if (!p) {
      p = (async () => {
        try {
          const res = await fetch(url);
          // dev servers answer missing files with index.html
          const type = res.headers.get('content-type') ?? '';
          if (!res.ok || type.includes('text/html')) throw new Error('missing');
          this.buffers.set(url, await ctx.decodeAudioData(await res.arrayBuffer()));
        } catch {
          this.buffers.set(url, null);
        }
      })();
      this.loading.set(url, p);
    }
    return p;
  }

  /** Decode the wheel's uploaded files (blobs) once audio is unlocked. */
  setCustom(spin: Blob[], win: Blob | null) {
    const token = {};
    this.customToken = token;
    this.custom = { spin: [], win: null };
    if (!spin.length && !win) {
      this.customPending = null;
      return;
    }
    this.customPending = new Promise((resolve) =>
      this.bus.onReady(async () => {
        const ctx = this.bus.ctx!;
        const decode = (b: Blob) => b.arrayBuffer().then((buf) => ctx.decodeAudioData(buf)).catch(() => null);
        const [tracks, sting] = await Promise.all([Promise.all(spin.map(decode)), win ? decode(win) : Promise.resolve(null)]);
        if (this.customToken === token) {
          this.custom = { spin: tracks.filter((t): t is AudioBuffer => !!t), win: sting };
          this.customPending = null;
        }
        resolve();
      }),
    );
  }
  private customToken = {};
  /** Set while uploaded files are still decoding (the first spin after load waits for it). */
  private customPending: Promise<void> | null = null;
  private spinToken = 0;

  private available(list: TrackSpec[]) {
    return list.map((t) => this.buffers.get(this.url(t))).filter((b): b is AudioBuffer => !!b);
  }

  /** Start a random spin track (never the same one twice in a row). */
  startSpin() {
    if (!this.enabled || !this.bus.ctx) return;
    this.stop(0.08);
    this.winding = false;
    const token = ++this.spinToken;
    const go = () => {
      if (token === this.spinToken && !this.winding) this.playSpin();
    };
    // the click that unlocks audio also starts the spin: give uploads a moment to decode
    if (this.customPending) void Promise.race([this.customPending, new Promise((r) => setTimeout(r, 1500))]).then(go);
    else go();
  }

  private playSpin() {
    const ctx = this.bus.ctx!;
    const tracks = this.custom.spin.length ? this.custom.spin : this.available(this.manifest.spin);
    const pool = tracks.length || 3;
    let pick = Math.floor(Math.random() * pool);
    if (pool > 1 && pick === this.lastSpin) pick = (pick + 1) % pool;
    this.lastSpin = pick;

    if (tracks.length) {
      const src = ctx.createBufferSource();
      src.buffer = tracks[pick];
      src.loop = true;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 0.25);
      src.connect(g).connect(this.bus.music);
      src.start();
      this.source = src;
      this.gain = g;
    } else if (this.song) {
      this.synth.start(this.song, pick);
    }
  }

  /** Turntable power-down as the wheel creeps to a halt. */
  windDown(seconds: number) {
    const ctx = this.bus.ctx;
    if (this.winding || !ctx) return;
    this.winding = true;
    this.spinToken++;
    const t = ctx.currentTime;
    if (this.source && this.gain) {
      this.source.playbackRate.setValueAtTime(1, t);
      this.source.playbackRate.linearRampToValueAtTime(0.45, t + seconds);
      this.gain.gain.setValueAtTime(1, t);
      this.gain.gain.linearRampToValueAtTime(0.0001, t + seconds);
      const src = this.source;
      src.stop(t + seconds + 0.05);
      this.source = null;
      this.gain = null;
    } else {
      this.synth.stop(seconds);
    }
  }

  stop(fade = 0.3) {
    this.spinToken++;
    const ctx = this.bus.ctx;
    if (ctx && this.source && this.gain) {
      const t = ctx.currentTime;
      this.gain.gain.cancelScheduledValues(t);
      this.gain.gain.setValueAtTime(Math.max(0.0001, this.gain.gain.value), t);
      this.gain.gain.exponentialRampToValueAtTime(0.0001, t + fade);
      this.source.stop(t + fade + 0.05);
    }
    this.source = null;
    this.gain = null;
    if (this.synth.playing) this.synth.stop(fade);
  }

  /** Play a win sting if the theme has one. Returns false so the caller can fall back. */
  win(): boolean {
    const ctx = this.bus.ctx;
    if (!this.enabled || !ctx) return false;
    const stings = this.custom.win ? [this.custom.win] : this.available(this.manifest.win);
    if (!stings.length) return false;
    const src = ctx.createBufferSource();
    src.buffer = stings[Math.floor(Math.random() * stings.length)];
    src.connect(this.bus.music);
    src.start();
    return true;
  }
}
