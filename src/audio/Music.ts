import { dlog } from '../debug';
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

type Kind = 'spin' | 'win';

/** An uploaded audio file for this wheel. */
export interface CustomFile {
  id: string;
  name?: string;
  blob: Blob;
}

/** Something playable: a generated track URL or an uploaded file. */
interface Source {
  key: string;
  /** For the debug log: `synthwave/spin-3.mp3` or `upload “my song.mp3”`. */
  label: string;
  load(): Promise<ArrayBuffer>;
}

interface Prepared {
  key: string;
  label: string;
  promise: Promise<AudioBuffer | null>;
  /** Set once decoding settles (undefined = still working). */
  buffer?: AudioBuffer | null;
}

/** Decoded tracks kept in memory (20 s of stereo audio is ~7 MB decoded). */
const CACHE_SIZE = 6;

/**
 * Where the audible part of a track starts and ends. MP3 files carry encoder
 * padding (near-silence) at both ends, which turns into a gap or click every
 * time a loop wraps around; looping only the audible part avoids that.
 */
function audibleRange(buffer: AudioBuffer): { start: number; end: number } {
  const threshold = 0.004;
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  const loud = (i: number) => channels.some((d) => Math.abs(d[i]) > threshold);
  const limit = Math.min(buffer.length, Math.floor(buffer.sampleRate * 0.5)); // trim at most 0.5 s per side
  let first = 0;
  while (first < limit && !loud(first)) first++;
  let last = buffer.length - 1;
  while (last > buffer.length - 1 - limit && !loud(last)) last--;
  if (last <= first) return { start: 0, end: buffer.duration };
  return { start: first / buffer.sampleRate, end: (last + 1) / buffer.sampleRate };
}

/**
 * Spin music and win stings, wheelofnames-style.
 *
 * Sources, in priority order: the wheel's uploaded files, then generated tracks
 * in `public/music/<scene>/` (this scene's, or every scene's spin songs when
 * `mixAll` is on), then the scene's procedural chiptune — so the app sounds
 * right before any audio has been generated.
 *
 * Rather than decoding everything up front (dozens of tracks would cost
 * hundreds of MB), the player always keeps the *next* random pick decoded and
 * ready, so a spin or a win starts instantly.
 */
export class Music {
  enabled = true;
  private mixAll = false;
  private synth: ChipSynth;
  private themeId = '';
  private song: ChipSong | null = null;
  private custom: Record<Kind, Source[]> = { spin: [], win: [] };
  private missing = new Set<string>();
  private cache = new Map<string, AudioBuffer>();
  private next: Record<Kind, Prepared | null> = { spin: null, win: null };
  private last: Record<Kind, string> = { spin: '', win: '' };
  private lastVariant = -1;
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private winding = false;
  private spinToken = 0;

  constructor(
    private bus: AudioBus,
    private manifests: Record<string, ThemeMusic>,
  ) {
    this.synth = new ChipSynth(bus);
  }

  setTheme(id: string, song: ChipSong) {
    this.stop(0.3);
    this.themeId = id;
    this.song = song;
    this.refresh();
  }

  /** Spin songs from every scene instead of only the current one. */
  setMixAll(on: boolean) {
    if (this.mixAll === on) return;
    this.mixAll = on;
    this.refresh('spin');
  }

  /** The wheel's uploaded files; they replace the scene's music while present. */
  setCustom(spin: CustomFile[], win: CustomFile[]) {
    const wrap = (f: CustomFile): Source => ({ key: `upload:${f.id}`, label: `upload “${f.name ?? f.id}”`, load: () => f.blob.arrayBuffer() });
    this.custom = { spin: spin.map(wrap), win: win.map(wrap) };
    this.refresh();
  }

  // ------------------------------------------------------------------ choosing & decoding

  private trackUrl(theme: string, t: TrackSpec) {
    return `${import.meta.env.BASE_URL}music/${theme}/${t.file}`;
  }

  private pool(kind: Kind): Source[] {
    if (this.custom[kind].length) return this.custom[kind];
    const themes = kind === 'spin' && this.mixAll ? Object.keys(this.manifests) : [this.themeId];
    return themes
      .flatMap((theme) => (this.manifests[theme]?.[kind] ?? []).map((t) => this.trackUrl(theme, t)))
      .filter((url) => !this.missing.has(url))
      .map((url) => ({
        key: url,
        label: url.split('/music/')[1] ?? url,
        load: async () => {
          const res = await fetch(url);
          // dev servers answer missing files with index.html
          if (!res.ok || (res.headers.get('content-type') ?? '').includes('text/html')) throw new Error('missing');
          return res.arrayBuffer();
        },
      }));
  }

  private async decode(src: Source): Promise<AudioBuffer | null> {
    const hit = this.cache.get(src.key);
    if (hit) return hit;
    try {
      const buffer = await this.bus.ctx!.decodeAudioData(await src.load());
      this.cache.set(src.key, buffer);
      if (this.cache.size > CACHE_SIZE) this.cache.delete(this.cache.keys().next().value!);
      return buffer;
    } catch {
      if (!src.key.startsWith('upload:')) this.missing.add(src.key);
      return null;
    }
  }

  /** Pick and decode the next track of a kind (never the same as last time when there's a choice). */
  private prepare(kind: Kind): Prepared | null {
    if (!this.bus.ctx) return null;
    const pool = this.pool(kind);
    if (!pool.length) return (this.next[kind] = null);
    const choices = pool.length > 1 ? pool.filter((s) => s.key !== this.last[kind]) : pool;
    const src = choices[Math.floor(Math.random() * choices.length)];
    const prepared: Prepared = {
      key: src.key,
      label: src.label,
      promise: this.decode(src).then((buffer) => {
        prepared.buffer = buffer;
        // a missing/broken file: quietly try another one
        if (!buffer && this.next[kind] === prepared) this.prepare(kind);
        return buffer;
      }),
    };
    this.next[kind] = prepared;
    return prepared;
  }

  /** Sources changed: drop stale picks and prepare fresh ones once audio is available. */
  private refresh(kind?: Kind) {
    for (const k of kind ? [kind] : (['spin', 'win'] as const)) {
      this.next[k] = null;
      this.bus.onReady(() => {
        if (!this.next[k]) this.prepare(k);
      });
    }
  }

  // ------------------------------------------------------------------ playback

  /** Start a random spin song. */
  startSpin() {
    if (!this.enabled || !this.bus.ctx) return;
    this.stop(0.08);
    this.winding = false;
    const token = ++this.spinToken;
    const prepared = this.next.spin ?? this.prepare('spin');
    this.next.spin = null;
    const go = (buffer: AudioBuffer | null) => {
      if (token !== this.spinToken || this.winding) return;
      if (buffer && prepared) {
        this.last.spin = prepared.key;
        this.play(buffer);
        dlog('🎵 music', 'spin song:', prepared.label);
      } else {
        this.playChiptune();
        const why = !prepared ? 'no tracks for this scene' : prepared.buffer === null ? `${prepared.label} failed to load` : `${prepared.label} still decoding`;
        dlog('🎵 music', `spin song: built-in synth (${why})`);
      }
      this.prepare('spin'); // get the following one ready
    };
    if (!prepared) return go(null);
    if (prepared.buffer !== undefined) return go(prepared.buffer);
    // the click that unlocks audio also starts the spin: give the first decode a moment
    void Promise.race([prepared.promise, new Promise<null>((r) => setTimeout(() => r(null), 1500))]).then(go);
  }

  private loops = new WeakMap<AudioBuffer, { start: number; end: number }>();

  private play(buffer: AudioBuffer) {
    const ctx = this.bus.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    let range = this.loops.get(buffer);
    if (!range) this.loops.set(buffer, (range = audibleRange(buffer)));
    src.loopStart = range.start;
    src.loopEnd = range.end;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 0.25);
    src.connect(g).connect(this.bus.music);
    src.start(0, range.start);
    this.source = src;
    this.gain = g;
  }

  private playChiptune() {
    if (!this.song) return;
    const variants = this.song.progressions.length;
    let v = Math.floor(Math.random() * variants);
    if (variants > 1 && v === this.lastVariant) v = (v + 1) % variants;
    this.lastVariant = v;
    this.synth.start(this.song, v);
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
      this.source.stop(t + seconds + 0.05);
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

  /** Play a random win sting if one is ready. Returns false so the caller can fall back. */
  win(): boolean {
    const ctx = this.bus.ctx;
    if (!this.enabled || !ctx) return false;
    const prepared = this.next.win ?? this.prepare('win');
    const buffer = prepared?.buffer;
    if (!prepared || !buffer) {
      // not decoded yet (or none): synth fanfare this time
      dlog('🎺 music', `win sound: synth fanfare (${!prepared ? 'no win sounds for this scene' : prepared.buffer === null ? `${prepared.label} failed to load` : `${prepared.label} still decoding`})`);
      return false;
    }
    dlog('🎺 music', 'win sound:', prepared.label);
    this.last.win = prepared.key;
    this.next.win = null;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.bus.music);
    src.start();
    this.prepare('win');
    return true;
  }
}
