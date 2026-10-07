/**
 * Small touches of life for idle scenes: occasional "moments" (a shooting
 * star, bats flying past…) and the particle helpers they're built from.
 * Everything here is cheap — a single draw call per effect, animated on the GPU.
 */
import * as THREE from 'three/webgpu';
import { makeAtlas, shapes, type Atlas } from './atlas';
import { Particles, type ParticleOptions } from './Particles';
import { rand } from './util';
import type { FrameState } from '../themes/types';

type V3 = [number, number, number];

/**
 * Plays a random moment every so often, but only while nothing else is going
 * on (no spin, no celebration). Never the same moment twice in a row.
 */
export type IdleMoments = ReturnType<typeof idleMoments>;

export function idleMoments(every: [number, number] = [7, 15]) {
  const moments: (() => void)[] = [];
  const systems: Particles[] = [];
  let wait = rand(3, every[0]); // the first one comes a little sooner
  let last = -1;
  return {
    /** Register something to play now and then. */
    add(play: () => void) {
      moments.push(play);
    },
    get count() {
      return moments.length;
    },
    /** Play a specific moment now (previews, testing). */
    play(i: number) {
      moments[i % moments.length]?.();
    },
    /** Particle systems the moments use, kept ticking here. */
    track<T extends Particles>(p: T): T {
      systems.push(p);
      return p;
    },
    update(f: FrameState) {
      for (const s of systems) s.update(f.time);
      if (f.spinning || f.win > 0 || !moments.length) return;
      wait -= f.dt;
      if (wait > 0) return;
      wait = rand(every[0], every[1]);
      let i = Math.floor(Math.random() * moments.length);
      if (i === last && moments.length > 1) i = (i + 1) % moments.length;
      last = i;
      moments[i]();
    },
  };
}

/** A one-cell atlas with a soft glow, for sparks and streaks. */
export const glowAtlas = (): Atlas => makeAtlas([shapes.glow()]);

const _frustum = new THREE.Frustum();
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();

/**
 * Pick something the camera can currently see (framing differs a lot between
 * desktop and phones), or null if nothing is in view.
 */
export function pickInView<T>(camera: THREE.Camera, items: T[], position: (item: T, out: THREE.Vector3) => THREE.Vector3): T | null {
  camera.updateMatrixWorld();
  _frustum.setFromProjectionMatrix(_m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const visible = items.filter((it) => _frustum.containsPoint(position(it, _p)));
  return visible.length ? visible[Math.floor(Math.random() * visible.length)] : null;
}

/**
 * A streak across the upper sky. Call `fire()` to launch one.
 * Placement note: the wheel fills most of the frame, so there's little sky above
 * it; what shows is the gaps beside it. Things crossing at the wheel's height
 * read as passing behind it.
 */
export function shootingStar(o: { at?: V3; box?: V3; dir?: V3; colors?: string[]; intensity?: number } = {}) {
  return new Particles({
    count: 1,
    atlas: glowAtlas(),
    mode: 'stretch',
    stretch: 0.22,
    blend: 'additive',
    intensity: o.intensity ?? 2.2,
    fog: false,
    emitters: [{ at: o.at ?? [10, 14.5, -40], box: o.box ?? [6, 1, 2], dir: o.dir ?? [-1, -0.3, 0], spread: 0.05, speed: [28, 34] }],
    size: [0.6, 0.8],
    gravity: [0, 0, 0],
    drag: 0.01,
    life: [0.75, 0.95],
    colors: o.colors ?? ['#ffffff', '#dff4ff'],
  });
}

/**
 * Sprites travelling across the scene in a loose group (birds, bats, fish, a
 * UFO). Sprites should face +X; they turn to face the way they travel, and the
 * whole group starts from either side at random.
 */
export function flyby(o: {
  atlas: Atlas;
  cells: number[];
  count: number;
  /** Start of the path, off-screen on the left. */
  from: V3;
  box?: V3;
  dir?: V3;
  speed: [number, number];
  /** Seconds the crossing takes. */
  life: number;
  size: [number, number];
  wobble?: number;
  /** Seconds over which the group sets off. */
  stagger?: number;
  colors?: string[];
  tint?: number;
  blend?: ParticleOptions['blend'];
  intensity?: number;
  fog?: boolean;
  loop?: boolean;
}) {
  return new Particles({
    count: o.count,
    atlas: o.atlas,
    cells: o.cells,
    mode: 'face',
    upright: true,
    blend: o.blend ?? 'normal',
    intensity: o.intensity ?? 1,
    tint: o.tint ?? 0,
    colors: o.colors,
    fog: o.fog,
    loop: o.loop,
    emitters: [{ at: o.from, box: o.box ?? [1, 1, 1], dir: o.dir ?? [1, 0, 0], spread: 0.04, speed: o.speed, delay: [0, o.stagger ?? 1] }],
    size: o.size,
    gravity: [0, 0, 0],
    drag: 0.01,
    life: [o.life, o.life * 1.1],
    wobble: o.wobble ?? 0.3,
  });
}
