/** tiki: winner celebrations. Each `setup` runs once when the scene loads (so shaders compile up front) and returns the function that plays it. */
import * as THREE from 'three/webgpu';
import {
  mix,
  mx_noise_float,
  positionGeometry,
  smoothstep,
  time,
  vec3,
} from 'three/tsl';
import { rgb } from '../shared';
import type { FxDirector, FxItem } from '../../fx/FxDirector';
import type { Celebration } from '../types';
import { rand } from '../../fx/util';
import { atlas } from './sprites';
import type { TikiScene } from '.';

// ------------------------------------------------------------------ coconut cannon

/** Coconuts lobbed from both sides that bounce and roll down the beach (tiny CPU sim). */
class Coconuts implements FxItem {
  readonly object: THREE.InstancedMesh;
  private nuts: { p: THREE.Vector3; v: THREE.Vector3; delay: number; q: THREE.Quaternion; spin: THREE.Vector3 }[] = [];
  private start = -1e4;
  private m = new THREE.Matrix4();
  private lastThud = 0;

  constructor(
    private fx: FxDirector,
    private count = 40,
  ) {
    const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.85 });
    const p = positionGeometry;
    const fibres = mx_noise_float(vec3(p.x.mul(30), p.y.mul(4), p.z.mul(30))).mul(0.5).add(0.5);
    mat.colorNode = mix(rgb('#4a2e16'), rgb('#7a5230'), fibres);
    this.object = new THREE.InstancedMesh(new THREE.SphereGeometry(0.26, 16, 12).scale(1, 1.15, 1), mat, count);
    this.object.frustumCulled = false;
    for (let i = 0; i < count; i++) this.nuts.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), delay: 0, q: new THREE.Quaternion(), spin: new THREE.Vector3() });
    this.hide();
  }

  private hide() {
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < this.count; i++) this.object.setMatrixAt(i, this.m);
    this.object.instanceMatrix.needsUpdate = true;
  }

  fire() {
    this.start = this.fx.time;
    this.nuts.forEach((n, i) => {
      const side = i % 2 ? 1 : -1;
      n.p.set(side * 4.4, 0.6, 1.6);
      n.v.set(-side * rand(1, 4.5), rand(8, 13), rand(1.5, 4));
      n.delay = (i / this.count) * 1.3;
      n.q.identity();
      n.spin.set(rand(-6, 6), rand(-6, 6), rand(-6, 6));
    });
  }

  update(time: number, dt: number) {
    const age = time - this.start;
    if (age < 0 || age > 7) {
      if (age > 7 && age < 7.2) this.hide();
      return;
    }
    const dq = new THREE.Quaternion();
    for (let i = 0; i < this.count; i++) {
      const n = this.nuts[i];
      if (age < n.delay) {
        this.object.setMatrixAt(i, this.m.makeScale(0, 0, 0));
        continue;
      }
      n.v.y -= 16 * dt;
      n.p.addScaledVector(n.v, dt);
      if (n.p.y < 0.28) {
        n.p.y = 0.28;
        if (n.v.y < -4 && time - this.lastThud > 0.06) {
          this.fx.sfx.pop(0, 0.3 + Math.random() * 0.15);
          this.lastThud = time;
        }
        n.v.y = -n.v.y * 0.45;
        n.v.x *= 0.85;
        n.v.z *= 0.85;
      }
      dq.setFromEuler(new THREE.Euler(n.spin.x * dt, n.spin.y * dt, n.spin.z * dt));
      n.q.multiply(dq);
      const s = 1 - THREE.MathUtils.smoothstep(age, 6, 7);
      this.m.compose(n.p, n.q, new THREE.Vector3(s, s, s));
      this.object.setMatrixAt(i, this.m);
    }
    this.object.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.object.geometry.dispose();
    (this.object.material as THREE.Material).dispose();
    this.object.dispose();
  }
}

export const celebrations = (world: TikiScene): Celebration[] => {
  const sprites = atlas();
  return [
    {
      name: 'Coconut Cannon',
      setup(fx) {
        const nuts = fx.add(new Coconuts(fx));
        return () => {
          nuts.fire();
          fx.zoom(-0.08, 2.5);
          fx.sfx.boom(0, 1.4);
        };
      },
    },
    {
      name: 'Flower Lei Shower',
      setup(fx) {
        const petals = fx.particles({
          count: 900,
          atlas: sprites,
          cells: [0, 0, 1, 1, 2, 3],
          colors: ['#ffffff'],
          tint: 0,
          mode: 'tumble',
          lit: false,
          intensity: 1.1,
          mirror: false,
          emitters: [{ at: [0, 10.5, 0.5], box: [10, 1, 4], dir: [0, -1, 0], spread: 0.3, speed: [2, 4], delay: [0, 1.4] }],
          size: [0.3, 0.5],
          gravity: [0, -3, 0],
          drag: 1.4,
          life: [4, 5.5],
          spin: 2.5,
          wobble: 0.4,
        });
        return () => {
          petals.fire();
          fx.stunt('boing');
          fx.flash('#ff9fd0', 0.12, 0.8);
        };
      },
    },
    {
      name: 'Fire Dance',
      setup(fx) {
        const ring = fx.shockwave({ color: '#ff7a1a', radius: 14, width: 0.06, duration: 1.4 });
        const sparks = fx.particles({
          count: 900,
          atlas: sprites,
          cells: [4, 5],
          colors: ['#ffd23f', '#ff7a1a', '#ff4d1a'],
          blend: 'additive',
          intensity: 2.4,
          mode: 'stretch',
          stretch: 0.15,
          emitters: world.torchTops.map((p) => ({ at: [p.x, p.y, p.z] as [number, number, number], dir: [0, 1, 0] as [number, number, number], spread: 0.5, speed: [5, 10] as [number, number] })),
          size: [0.1, 0.2],
          gravity: [0, -3, 0],
          drag: 1.4,
          life: [1.5, 2.5],
          wobble: 0.6,
        });
        return () => {
          world.flare(1);
          sparks.fire();
          fx.after(0.2, () => ring.fire(new THREE.Vector3(0, 0.08, -0.6), 'floor'));
          fx.orbit(0.45, 2.8);
          fx.sfx.whoosh();
          fx.sfx.boom(0.2, 0.9);
        };
      },
    },
    {
      name: 'Volcano Eruption',
      setup(fx) {
        const lava = fx.particles({
          count: 700,
          atlas: sprites,
          cells: [5, 6],
          colors: ['#ff5a1a', '#ffb347', '#ff2a00'],
          blend: 'additive',
          intensity: 3,
          mirror: false,
          // a fountain that stays in open sky (not behind the logo in the corner)
          emitters: [{ at: [world.crater.x, world.crater.y + 0.5, world.crater.z], dir: [0.35, 1, 0.1], spread: 0.45, speed: [9, 16], delay: [0, 1.4] }],
          size: [2.2, 4.2],
          gravity: [0, -12, 0],
          drag: 0.4,
          life: [2.5, 3.5],
        });
        return () => {
          world.erupt(1);
          lava.fire();
          fx.flash('#ff7a1a', 0.35, 0.8);
          fx.shake(1.3, 1.6);
          fx.zoom(-0.12, 3); // pull back a little so the volcano stays in frame
          fx.sfx.boom(0, 0.4);
          fx.sfx.boom(0.35, 0.5);
          fx.after(0.4, () => fx.stunt('shake'));
        };
      },
    },
  ];
};
