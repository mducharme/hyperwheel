import type * as THREE from 'three/webgpu';

export type StuntKind = 'flip' | 'flipX' | 'jelly' | 'hop' | 'shake' | 'tumble' | 'boing';

interface Active {
  kind: StuntKind;
  t: number;
  dur: number;
}

const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

/**
 * Whole-wheel acrobatics for celebrations, layered on top of the wheel's rest
 * pose (and an optional zero-g bob for floating themes). The spinner's angle is
 * never touched, so the winning slice stays under the pointer.
 */
export class Stunts {
  floating = false;
  private active: Active[] = [];

  constructor(
    private root: THREE.Object3D,
    private base: THREE.Vector3,
  ) {}

  play(kind: StuntKind, dur = defaultDuration[kind]) {
    this.active.push({ kind, t: 0, dur });
  }

  clear() {
    this.active = [];
  }

  update(dt: number, time: number) {
    const r = this.root;
    r.position.copy(this.base);
    r.rotation.set(0, 0, 0);
    r.scale.set(1, 1, 1);

    if (this.floating) {
      r.position.y += Math.sin(time * 0.9) * 0.18;
      r.rotation.x = Math.sin(time * 0.6) * 0.04;
      r.rotation.y = Math.sin(time * 0.45) * 0.06;
    }

    for (const s of this.active) {
      s.t += dt;
      const p = Math.min(1, s.t / s.dur);
      const e = easeInOut(p);
      switch (s.kind) {
        case 'flip':
          r.rotation.y += e * Math.PI * 2;
          r.position.y += Math.sin(Math.PI * p) * 0.6;
          break;
        case 'flipX':
          r.rotation.x += e * Math.PI * 2;
          r.position.z += Math.sin(Math.PI * p) * 1.2;
          break;
        case 'tumble':
          r.rotation.x += e * Math.PI * 2;
          r.rotation.y += e * Math.PI * 2;
          r.position.y += Math.sin(Math.PI * p) * 0.8;
          break;
        case 'jelly': {
          const w = Math.sin(s.t * 18) * Math.exp(-s.t * 2.8) * 0.18;
          r.scale.x *= 1 + w;
          r.scale.y *= 1 - w;
          r.scale.z *= 1 + w * 0.5;
          break;
        }
        case 'hop': {
          // two bounces with squash on landing
          const h = Math.abs(Math.sin(Math.PI * p * 2)) * (1 - p * 0.5) * 1.4;
          r.position.y += h;
          const squash = Math.max(0, 0.18 - h) * 0.5;
          r.scale.y *= 1 - squash;
          r.scale.x *= 1 + squash;
          break;
        }
        case 'boing': {
          const s2 = Math.sin(s.t * 14) * Math.exp(-s.t * 3) * 0.25;
          r.scale.multiplyScalar(1 + s2);
          break;
        }
        case 'shake':
          r.position.x += Math.sin(s.t * 60) * 0.12 * (1 - p);
          r.rotation.z += Math.sin(s.t * 47) * 0.03 * (1 - p);
          break;
      }
    }
    this.active = this.active.filter((s) => s.t < s.dur);
  }
}

const defaultDuration: Record<StuntKind, number> = {
  flip: 1.4,
  flipX: 1.5,
  tumble: 2,
  jelly: 1.8,
  hop: 1.4,
  boing: 1.4,
  shake: 0.8,
};
