/**
 * One AudioContext for the whole app, with separate gain buses so music and
 * sound effects can be toggled independently.
 *
 * iOS needs three things before anything is heard:
 *  - the audio session declared as "playback", or the ring/silent switch mutes
 *    Web Audio entirely (Safari 16.4+);
 *  - the context created and resumed inside an event iOS accepts as a user
 *    gesture (a tap's touchend, click, keydown — not pointerdown);
 *  - a resume after interruptions (calls, other apps), which leave it "interrupted".
 */
/** Loudness of the win sound (recorded sting or synth fanfare) relative to the spin music: the stings are mastered hot. */
export const WIN_GAIN = 0.9;

export class AudioBus {
  ctx: AudioContext | null = null;
  sfx!: GainNode;
  music!: GainNode;
  noise!: AudioBuffer;
  private listeners: (() => void)[] = [];

  constructor() {
    // play like media, not like a ringtone-style "ambient" sound the silent switch mutes
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'playback';
    // the first qualifying gesture anywhere on the page unlocks audio (so the first spin's song is
    // already decoding), and later ones wake it after an interruption
    const wake = () => this.unlock();
    for (const type of ['touchend', 'click', 'keydown'] as const) window.addEventListener(type, wake, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && this.resume());
  }

  private resume() {
    // "interrupted" is Safari's state after a call or another app took the audio
    if (this.ctx && (this.ctx.state as string) !== 'running') void this.ctx.resume().catch(() => undefined);
  }

  get ready() {
    return this.ctx !== null;
  }

  /** Must be called from a user gesture before anything is audible. */
  unlock() {
    if (!this.ctx) {
      const ctx = new AudioContext();
      const master = ctx.createGain();
      master.gain.value = 0.7;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      master.connect(comp).connect(ctx.destination);

      this.sfx = ctx.createGain();
      this.sfx.gain.value = 0.8;
      this.sfx.connect(master);
      this.music = ctx.createGain();
      this.music.gain.value = 0.55;
      this.music.connect(master);

      const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noise = noise;
      this.ctx = ctx;
      this.listeners.forEach((fn) => fn());
      this.listeners = [];
    }
    this.resume();
  }

  /** Run `fn` once the context exists (immediately if it already does). */
  onReady(fn: () => void) {
    if (this.ctx) fn();
    else this.listeners.push(fn);
  }
}
