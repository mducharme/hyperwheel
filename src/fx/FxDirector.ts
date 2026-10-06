import * as THREE from 'three/webgpu';
import type { Stage } from '../engine/Stage';
import type { CameraRig } from '../engine/CameraRig';
import type { Sfx } from '../audio/Sfx';
import { Particles, type ParticleOptions } from './Particles';
import { Shockwave, type ShockwaveOptions } from './Shockwave';
import type { StuntKind, Stunts } from './Stunts';

/** Anything an effect or theme adds that needs per-frame time and cleanup. */
export interface FxItem {
  object: THREE.Object3D;
  update(time: number, dt: number): void;
  dispose(): void;
}

/**
 * The toolbox celebrations are written against. Effects are created up front
 * (so their shaders compile while the theme loads) and fired later.
 * Everything created here is torn down when the theme changes.
 */
export class FxDirector {
  time = 0;
  readonly center: THREE.Vector3;
  private items: FxItem[] = [];
  private timers: { at: number; fn: () => void }[] = [];

  constructor(
    private scene: THREE.Scene,
    private stage: Stage,
    private cam: CameraRig,
    private stunts: Stunts,
    readonly sfx: Sfx,
    center: THREE.Vector3,
  ) {
    this.center = center.clone();
  }

  add<T extends FxItem>(item: T): T {
    this.items.push(item);
    this.scene.add(item.object);
    return item;
  }

  particles(opts: ParticleOptions) {
    const p = new Particles(opts);
    return this.add({ object: p.object, update: (t) => p.update(t), dispose: () => p.dispose(), fire: () => p.fire() });
  }

  shockwave(opts: ShockwaveOptions) {
    const s = new Shockwave(opts);
    return this.add({
      object: s.object,
      update: (t) => s.update(t),
      dispose: () => s.dispose(),
      fire: (at: THREE.Vector3, facing: 'floor' | 'camera' = 'camera') => s.fire(at, facing),
    });
  }

  ripple(strength = 1, duration = 1.2, at: THREE.Vector3 = this.center) {
    this.stage.triggerRipple(at, strength, duration);
  }
  flash(color: THREE.ColorRepresentation = '#ffffff', peak = 0.8, duration = 0.5) {
    this.stage.triggerFlash(color, peak, duration);
  }
  aberration(amount = 0.8) {
    this.stage.kickAberration(amount);
  }
  shake(amount = 1, dur = 0.6) {
    this.cam.shake(amount, dur);
  }
  orbit(amount = 0.6, dur = 2.4) {
    this.cam.orbit(amount, dur);
  }
  zoom(amount = 0.2, dur = 1.6) {
    this.cam.zoom(amount, dur);
  }
  stunt(kind: StuntKind, dur?: number) {
    this.stunts.play(kind, dur);
  }

  /** Run `fn` after a delay (in effect time, so it pauses with the app). */
  after(seconds: number, fn: () => void) {
    this.timers.push({ at: this.time + seconds, fn });
  }

  /** Position relative to the wheel centre. */
  at(x: number, y: number, z = 0) {
    return new THREE.Vector3(x, y, z).add(this.center);
  }

  update(dt: number, time: number) {
    this.time = time;
    for (const item of this.items) item.update(time, dt);
    const due = this.timers.filter((t) => t.at <= time);
    this.timers = this.timers.filter((t) => t.at > time);
    due.forEach((t) => t.fn());
  }

  dispose() {
    for (const item of this.items) {
      this.scene.remove(item.object);
      item.dispose();
    }
    this.items = [];
    this.timers = [];
  }
}
