/** candy: winner celebrations. Each `setup` runs once when the scene loads (so shaders compile up front) and returns the function that plays it. */
import * as THREE from 'three/webgpu';
import type { FxDirector, FxItem } from '../../fx/FxDirector';
import { PALETTE } from './meta';
import type { Celebration } from '../types';
import { atlas } from './sprites';

// ------------------------------------------------------------------ gumball cannon (CPU physics)

/** Real bouncing gumballs: few enough objects that a tiny CPU sim is the simplest option. */
class Gumballs implements FxItem {
  readonly object: THREE.InstancedMesh;
  private balls: { p: THREE.Vector3; v: THREE.Vector3; spawn: number }[] = [];
  private start = -1e4;
  private m = new THREE.Matrix4();
  private lastPop = 0;

  constructor(
    private fx: FxDirector,
    private count = 70,
  ) {
    const mat = new THREE.MeshPhysicalNodeMaterial({ roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03 });
    this.object = new THREE.InstancedMesh(new THREE.SphereGeometry(0.3, 24, 16), mat, count);
    this.object.frustumCulled = false;
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      this.object.setColorAt(i, c.set(PALETTE[i % PALETTE.length]));
      this.balls.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), spawn: 0 });
    }
    this.hideAll();
  }

  private hideAll() {
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < this.count; i++) this.object.setMatrixAt(i, this.m);
    this.object.instanceMatrix.needsUpdate = true;
  }

  fire() {
    this.start = this.fx.time;
    this.balls.forEach((b, i) => {
      const side = i % 2 ? 1 : -1;
      b.spawn = (i / this.count) * 1.4;
      b.p.set(side * 4.2, 0.6, 1.2);
      b.v.set(-side * (1.5 + Math.random() * 3.5), 9 + Math.random() * 5, 1 + Math.random() * 3);
    });
  }

  update(time: number, dt: number) {
    const age = time - this.start;
    if (age > 7) {
      if (age < 7.2) this.hideAll();
      return;
    }
    const R = 0.3;
    for (let i = 0; i < this.count; i++) {
      const b = this.balls[i];
      if (age < b.spawn) {
        this.m.makeScale(0, 0, 0);
      } else {
        b.v.y -= 16 * dt;
        b.p.addScaledVector(b.v, dt);
        if (b.p.y < R) {
          b.p.y = R;
          if (b.v.y < -3 && time - this.lastPop > 0.05) {
            this.fx.sfx.pop(0, 0.7 + Math.random() * 0.8);
            this.lastPop = time;
          }
          b.v.y = -b.v.y * 0.62;
          b.v.x *= 0.92;
          b.v.z *= 0.92;
        }
        const s = Math.min(1, (age - b.spawn) * 8) * (1 - THREE.MathUtils.smoothstep(age, 6, 7));
        this.m.makeScale(s, s, s).setPosition(b.p);
      }
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

export const celebrations = (): Celebration[] => {
  const sprites = atlas();
  return [
    {
      name: 'Sprinkle Storm',
      setup(fx) {
        const rain = fx.particles({
          count: 1500,
          atlas: sprites,
          cells: [0, 0, 0, 0, 1, 2],
          colors: PALETTE,
          aspect: 0.5,
          emitters: [{ at: [0, 10.5, 0], box: [11, 1, 4], dir: [0, -1, 0], spread: 0.3, speed: [3, 6], delay: [0, 1.4] }],
          size: [0.16, 0.26],
          gravity: [0, -6, 0],
          drag: 1.2,
          life: [4, 5],
          mirror: false,
        });
        return () => {
          rain.fire();
          fx.stunt('boing');
          for (let i = 0; i < 6; i++) fx.sfx.pop(i * 0.09, 0.8 + i * 0.15);
        };
      },
    },
    {
      name: 'Gumball Cannon',
      setup(fx) {
        const balls = fx.add(new Gumballs(fx));
        return () => {
          balls.fire();
          fx.flash('#ff8fc8', 0.2, 0.4);
          fx.zoom(-0.08, 2.4);
          fx.sfx.boom(0, 1.6);
        };
      },
    },
    {
      name: 'Jelly Wobble',
      setup(fx) {
        const hearts = fx.particles({
          count: 280,
          atlas: sprites,
          cells: [1],
          colors: ['#ff3b8b', '#ff8fab', '#ff6fb5', '#ffffff'],
          mode: 'face',
          emitters: [{ at: [0, 3.9, 0.8], dir: [0, 1, 0.4], spread: 0.8, speed: [4, 9] }],
          size: [0.25, 0.45],
          gravity: [0, -3, 0],
          drag: 1.6,
          life: [2.5, 3.5],
          spin: 1.5,
        });
        return () => {
          fx.stunt('jelly');
          fx.zoom(0.12, 1.6);
          hearts.fire();
          fx.sfx.pop(0, 0.6);
          fx.sfx.pop(0.12, 0.9);
        };
      },
    },
    {
      name: 'Sugar Flip',
      setup(fx) {
        const cannons = fx.particles({
          count: 700,
          atlas: sprites,
          cells: [3, 4, 6, 5],
          colors: PALETTE,
          tint: 0.6,
          emitters: [
            { at: [-4.6, 0.4, 1.6], dir: [0.35, 1, 0.25], spread: 0.3, speed: [8, 14] },
            { at: [4.6, 0.4, 1.6], dir: [-0.35, 1, 0.25], spread: 0.3, speed: [8, 14] },
          ],
          size: [0.3, 0.45],
          gravity: [0, -7, 0],
          drag: 1.1,
        });
        return () => {
          fx.stunt('hop');
          fx.after(0.25, () => fx.stunt('flipX'));
          cannons.fire();
          fx.sfx.boom(0, 1.3);
        };
      },
    },
  ];
};
