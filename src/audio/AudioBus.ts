/**
 * One AudioContext for the whole app, with separate gain buses so music and
 * sound effects can be toggled independently.
 */
export class AudioBus {
  ctx: AudioContext | null = null;
  sfx!: GainNode;
  music!: GainNode;
  noise!: AudioBuffer;
  private listeners: (() => void)[] = [];

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
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** Run `fn` once the context exists (immediately if it already does). */
  onReady(fn: () => void) {
    if (this.ctx) fn();
    else this.listeners.push(fn);
  }
}
