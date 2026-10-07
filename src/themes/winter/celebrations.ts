/** winter: winner celebrations. Each `setup` runs once when the scene loads (so shaders compile up front) and returns the function that plays it. */
import * as THREE from 'three/webgpu';
import {
  abs,
  length,
  max,
  mix,
  positionGeometry,
  sin,
  smoothstep,
  step,
  time,
} from 'three/tsl';
import { rgb } from '../shared';
import type { FxDirector, FxItem } from '../../fx/FxDirector';
import type { Celebration } from '../types';
import { rand, inst } from '../../fx/util';
import { atlas } from './sprites';
import type { WinterScene } from '.';

// ------------------------------------------------------------------ snowball fight

/** Snowballs lobbed from both sides that splat on the wheel; the splats are a pre-aimed particle burst. */
class SnowballFight implements FxItem {
  readonly object: THREE.InstancedMesh;
  private balls: { from: THREE.Vector3; v: THREE.Vector3; delay: number; flight: number }[] = [];
  private start = -1e4;
  private m = new THREE.Matrix4();
  private puffs: ReturnType<FxDirector['particles']>;
  private hits = new Set<number>();

  constructor(
    private fx: FxDirector,
    sprites: ReturnType<typeof atlas>,
  ) {
    const C = fx.center;
    const g = -14;
    const targets: THREE.Vector3[] = [];
    for (let i = 0; i < 12; i++) {
      const a = rand(0, Math.PI * 2);
      const r = rand(0.6, 2.8);
      targets.push(new THREE.Vector3(C.x + Math.cos(a) * r, C.y + Math.sin(a) * r, 0.45));
    }
    targets.forEach((target, i) => {
      const side = i % 2 ? 1 : -1;
      const from = new THREE.Vector3(side * rand(9, 12), rand(1, 3), rand(3, 6));
      const flight = rand(0.7, 1.0);
      // v = (target - from - ½·g·t²) / t
      const v = target.clone().sub(from).sub(new THREE.Vector3(0, 0.5 * g * flight * flight, 0)).divideScalar(flight);
      this.balls.push({ from, v, delay: i * 0.18 + rand(0, 0.08), flight });
    });
    this.object = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.28, 16, 12),
      new THREE.MeshStandardNodeMaterial({ color: '#f4f8ff', roughness: 0.85 }),
      this.balls.length,
    );
    this.object.frustumCulled = false;
    this.hide();
    this.puffs = fx.particles({
      count: 600,
      atlas: sprites,
      cells: [5, 0],
      colors: ['#ffffff', '#e3eeff'],
      tint: 0.6,
      mode: 'face',
      lit: false,
      intensity: 1.3,
      mirror: false,
      emitters: targets.map((t, i) => ({
        at: [t.x, t.y, t.z + 0.1] as [number, number, number],
        dir: [0, 0.3, 1] as [number, number, number],
        spread: 1.3,
        speed: [2, 6] as [number, number],
        delay: [this.balls[i].delay + this.balls[i].flight, this.balls[i].delay + this.balls[i].flight + 0.02] as [number, number],
      })),
      size: [0.1, 0.24],
      gravity: [0, -6, 0],
      drag: 2.5,
      life: [0.7, 1.2],
      spin: 1,
    });
    this.g = g;
  }
  private g: number;

  private hide() {
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < this.balls.length; i++) this.object.setMatrixAt(i, this.m);
    this.object.instanceMatrix.needsUpdate = true;
  }

  fire() {
    this.start = this.fx.time;
    this.hits.clear();
    this.puffs.fire();
  }

  update(time: number) {
    const age = time - this.start;
    if (age < 0 || age > 4) return;
    const p = new THREE.Vector3();
    this.balls.forEach((b, i) => {
      const t = age - b.delay;
      if (t < 0 || t > b.flight) {
        if (t > b.flight && !this.hits.has(i)) {
          this.hits.add(i);
          this.fx.sfx.pop(0, 0.35 + Math.random() * 0.2);
        }
        this.m.makeScale(0, 0, 0);
      } else {
        p.copy(b.from).addScaledVector(b.v, t);
        p.y += 0.5 * this.g * t * t;
        this.m.makeTranslation(p.x, p.y, p.z);
      }
      this.object.setMatrixAt(i, this.m);
    });
    this.object.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.object.geometry.dispose();
    (this.object.material as THREE.Material).dispose();
    this.object.dispose();
  }
}

// ------------------------------------------------------------------ present drop

/** Wrapped gift boxes that tumble out of the sky and bounce in the snow (tiny CPU sim). */
class PresentDrop implements FxItem {
  readonly object: THREE.InstancedMesh;
  private boxes: { p: THREE.Vector3; v: THREE.Vector3; q: THREE.Quaternion; spin: THREE.Vector3; size: number; delay: number; landed: boolean }[] = [];
  private start = -1e4;
  private m = new THREE.Matrix4();

  constructor(
    private fx: FxDirector,
    private count = 26,
  ) {
    const colors = new Float32Array(count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      c.set(['#d62839', '#2a9d8f', '#4cc9f0', '#7b2fff', '#f4f8ff', '#ff7a1a'][i % 6]);
      colors.set([c.r, c.g, c.b], i * 3);
      this.boxes.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(), spin: new THREE.Vector3(), size: 1, delay: 0, landed: false });
    }
    const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.45 });
    // gold ribbon crossing every face of the unit box
    const gp = positionGeometry;
    const ribbon = max(step(abs(gp.x), 0.09), step(abs(gp.z), 0.09));
    mat.colorNode = mix(inst(colors, 3, 'vec3'), rgb('#ffd23f'), ribbon);
    mat.metalnessNode = ribbon.mul(0.6);
    this.object = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, count);
    this.object.frustumCulled = false;
    this.hide();
  }

  private hide() {
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < this.count; i++) this.object.setMatrixAt(i, this.m);
    this.object.instanceMatrix.needsUpdate = true;
  }

  fire() {
    this.start = this.fx.time;
    this.boxes.forEach((b, i) => {
      b.size = rand(0.35, 0.7);
      b.p.set(rand(-6, 6), rand(9, 13), rand(-1, 4));
      b.v.set(rand(-0.5, 0.5), rand(-2, 0), rand(-0.5, 0.5));
      b.q.setFromEuler(new THREE.Euler(rand(0, 3), rand(0, 3), rand(0, 3)));
      b.spin.set(rand(-3, 3), rand(-3, 3), rand(-3, 3));
      b.delay = (i / this.count) * 1.6;
      b.landed = false;
    });
  }

  update(time: number, dt: number) {
    const age = time - this.start;
    if (age < 0 || age > 7.5) {
      if (age > 7.5 && age < 7.7) this.hide();
      return;
    }
    const dq = new THREE.Quaternion();
    for (let i = 0; i < this.count; i++) {
      const b = this.boxes[i];
      if (age < b.delay) {
        this.object.setMatrixAt(i, this.m.makeScale(0, 0, 0));
        continue;
      }
      b.v.y -= 15 * dt;
      b.p.addScaledVector(b.v, dt);
      const floorY = b.size / 2;
      if (b.p.y < floorY) {
        b.p.y = floorY;
        if (!b.landed && b.v.y < -4) this.fx.sfx.pop(0, 0.3 + Math.random() * 0.15);
        b.landed = true;
        b.v.y = -b.v.y * 0.35;
        b.v.x *= 0.6;
        b.v.z *= 0.6;
        b.spin.multiplyScalar(0.5);
        // settle flat-ish once slow
        if (Math.abs(b.v.y) < 0.6) b.q.slerp(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), i), 0.2);
      }
      dq.setFromEuler(new THREE.Euler(b.spin.x * dt, b.spin.y * dt, b.spin.z * dt));
      b.q.multiply(dq);
      const fade = 1 - THREE.MathUtils.smoothstep(age, 6.5, 7.5);
      this.m.compose(b.p, b.q, new THREE.Vector3(b.size * fade, b.size * fade, b.size * fade));
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

export const celebrations = (world: WinterScene): Celebration[] => {
  const sprites = atlas();
  return [
    {
      name: 'Snowball Fight',
      setup(fx) {
        const fight = fx.add(new SnowballFight(fx, sprites));
        return () => {
          fight.fire();
          fx.sfx.whoosh();
          fx.after(0.9, () => fx.stunt('boing'));
        };
      },
    },
    {
      name: 'Present Drop',
      setup(fx) {
        const gifts = fx.add(new PresentDrop(fx));
        return () => {
          gifts.fire();
          fx.zoom(-0.1, 3);
          fx.flash('#ffd23f', 0.15, 0.5);
        };
      },
    },
    {
      name: 'Blizzard',
      setup(fx) {
        const gust = fx.particles({
          count: 1600,
          atlas: sprites,
          cells: [3, 3, 0],
          colors: ['#ffffff', '#e3eeff'],
          mode: 'face',
          blend: 'additive',
          intensity: 1.4,
          mirror: false,
          emitters: [{ at: [14, 5, 0], box: [2, 6, 6], dir: [-1, -0.1, 0.15], spread: 0.25, speed: [10, 20], delay: [0, 2.2] }],
          size: [0.06, 0.18],
          gravity: [-3, -1.5, 0],
          drag: 0.4,
          life: [1.6, 2.4],
          wobble: 0.6,
        });
        return () => {
          gust.fire();
          world.storm(2.6);
          fx.shake(0.7, 2.6);
          fx.stunt('shake', 2);
          fx.sfx.whoosh();
          fx.after(0.7, () => fx.sfx.whoosh());
          fx.after(1.4, () => fx.sfx.whoosh());
        };
      },
    },
    {
      name: 'Aurora Surge',
      setup(fx) {
        const stars = fx.particles({
          count: 500,
          atlas: sprites,
          cells: [1, 2, 0],
          colors: ['#29ff9a', '#2fe0ff', '#b04dff', '#ffffff'],
          mode: 'face',
          blend: 'additive',
          intensity: 2,
          emitters: [{ at: [0, 3.9, 0.6], dir: [0, 1, 0.3], spread: 1, speed: [5, 10] }],
          size: [0.16, 0.32],
          gravity: [0, -3, 0],
          drag: 1.4,
          life: [2.2, 3.2],
          spin: 1.5,
        });
        return () => {
          world.aurora(1);
          stars.fire();
          fx.orbit(0.4, 3);
          fx.flash('#29ff9a', 0.12, 1.2);
        };
      },
    },
  ];
};
