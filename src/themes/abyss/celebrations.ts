/** abyss: winner celebrations. Each `setup` runs once when the scene loads (so shaders compile up front) and returns the function that plays it. */
import * as THREE from 'three/webgpu';
import {
  float,
  positionLocal,
  rotate,
  sin,
  smoothstep,
  time,
  uniform,
  vec3,
} from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fresnel } from '../../fx/nodes';
import type { FxItem } from '../../fx/FxDirector';
import type { Celebration } from '../types';
import { rand, inst } from '../../fx/util';
import { atlas } from './sprites';

// ------------------------------------------------------------------ fish tornado

/** A school swirling around the wheel; orbit and tail wiggle are computed in the vertex shader. */
class FishSchool implements FxItem {
  readonly object: THREE.InstancedMesh;
  private uTime = uniform(0);
  private uStart = uniform(-1e4);
  static DURATION = 6.5;

  constructor(center: THREE.Vector3, count = 140) {
    const body = new THREE.SphereGeometry(0.3, 16, 10).scale(1.4, 0.65, 0.35);
    const tailShape = new THREE.Shape();
    tailShape.moveTo(0, 0);
    tailShape.lineTo(-0.35, 0.22);
    tailShape.lineTo(-0.35, -0.22);
    tailShape.closePath();
    const tail = new THREE.ShapeGeometry(tailShape).translate(-0.33, 0, 0);
    tail.deleteAttribute('uv');
    body.deleteAttribute('uv');
    const geo = mergeGeometries([body.toNonIndexed(), tail.toNonIndexed()])!;

    const orbit = new Float32Array(count * 4); // radius, height, speed, phase
    const look = new Float32Array(count * 4); // r, g, b, size
    const c = new THREE.Color();
    const colors = ['#ff9f43', '#ffd166', '#64ffda', '#ff6b9d', '#ffffff', '#00e5ff'];
    for (let i = 0; i < count; i++) {
      orbit.set([rand(4.6, 7.5), rand(-3.5, 4), rand(1.1, 1.9), rand(0, Math.PI * 2)], i * 4);
      c.set(colors[i % colors.length]);
      look.set([c.r, c.g, c.b, rand(0.5, 0.95)], i * 4);
    }
    const aOrbit = inst(orbit, 4, 'vec4');
    const aLook = inst(look, 4, 'vec4');

    const mat = new THREE.MeshStandardNodeMaterial({ metalness: 0.4, roughness: 0.3, side: THREE.DoubleSide });
    const t = this.uTime.sub(this.uStart);
    const D = FishSchool.DURATION;
    const env = smoothstep(0, 0.6, t).mul(float(1).sub(smoothstep(D - 0.8, D, t)));
    const alive = t.greaterThan(0).and(t.lessThan(D)).select(float(1), float(0));
    const angle = aOrbit.w.add(aOrbit.z.mul(t));
    const swimIn = float(1).sub(smoothstep(0, 1.4, t)).mul(14);
    const r = aOrbit.x.add(swimIn).add(sin(t.mul(0.9).add(aOrbit.w)).mul(0.6));

    // tail wiggle: bend the rear of the fish sideways
    const lp = positionLocal;
    const bend = sin(this.uTime.mul(14).add(aOrbit.w.mul(5)).add(lp.x.mul(5))).mul(float(1).sub(smoothstep(-0.7, 0.1, lp.x)).mul(0.12));
    const local = vec3(lp.x, lp.y, lp.z.add(bend)).mul(aLook.w.mul(env).mul(alive));
    const turned = rotate(local, vec3(0, angle.add(Math.PI / 2).negate(), 0));
    const pos = vec3(
      angle.cos().mul(r),
      aOrbit.y.add(sin(t.mul(1.3).add(aOrbit.w)).mul(0.5)),
      angle.sin().mul(r).negate(),
    ).add(vec3(center.x, center.y, center.z));
    mat.positionNode = turned.add(pos);
    mat.colorNode = aLook.xyz;
    mat.emissiveNode = aLook.xyz.mul(0.25);

    this.object = new THREE.InstancedMesh(geo, mat, count);
    this.object.frustumCulled = false;
  }

  fire() {
    this.uStart.value = this.uTime.value;
  }
  update(time: number) {
    this.uTime.value = time;
  }
  dispose() {
    this.object.geometry.dispose();
    (this.object.material as THREE.Material).dispose();
  }
}

// ------------------------------------------------------------------ jellyfish

/** Bioluminescent jellies pulsing upward. Bell pulse and tentacle sway happen on the GPU. */
class Jellies implements FxItem {
  readonly object: THREE.InstancedMesh;
  private uTime = uniform(0);
  private uStart = uniform(-1e4);

  constructor(center: THREE.Vector3, count = 18) {
    const bell = new THREE.SphereGeometry(0.55, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const parts: THREE.BufferGeometry[] = [bell.toNonIndexed()];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const len = rand(1.2, 2);
      parts.push(new THREE.CylinderGeometry(0.018, 0.008, len, 4, 8).translate(Math.cos(a) * 0.32, -len / 2, Math.sin(a) * 0.32).toNonIndexed());
    }
    parts.forEach((p) => p.deleteAttribute('uv'));
    const geo = mergeGeometries(parts)!;

    const data = new Float32Array(count * 4); // x, z, phase, size
    const tint = new Float32Array(count * 3);
    const c = new THREE.Color();
    const colors = ['#ff6bd6', '#64ffda', '#8a7dff', '#00e5ff'];
    for (let i = 0; i < count; i++) {
      data.set([rand(-7, 7), rand(-3, 2.5), rand(0, 6.28), rand(0.6, 1.3)], i * 4);
      c.set(colors[i % colors.length]);
      tint.set([c.r, c.g, c.b], i * 3);
    }
    const aData = inst(data, 4, 'vec4');
    const aTint = inst(tint, 3, 'vec3');

    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const t = this.uTime.sub(this.uStart);
    const alive = t.greaterThan(0).and(t.lessThan(7)).select(float(1), float(0));
    const pulse = sin(t.mul(4).add(aData.z));
    const lp = positionLocal;
    const isBell = smoothstep(-0.05, 0.05, lp.y);
    const squeeze = float(1).add(pulse.mul(0.15).mul(isBell));
    const sway = sin(t.mul(3).add(lp.y.mul(3)).add(aData.z)).mul(lp.y.negate().max(0)).mul(0.25);
    const local = vec3(lp.x.mul(squeeze).add(sway), lp.y.mul(float(1).sub(pulse.mul(0.08).mul(isBell))), lp.z.mul(squeeze));
    const rise = t.mul(1.1).add(pulse.mul(0.15)).sub(4.5);
    const fade = smoothstep(0, 0.8, t).mul(float(1).sub(smoothstep(5.8, 7, t))).mul(alive);
    mat.positionNode = local.mul(aData.w).mul(alive).add(vec3(aData.x, rise, aData.y).add(vec3(center.x, center.y, center.z)));
    mat.colorNode = aTint.mul(fresnel(1.5).mul(1.6).add(0.25)).mul(fade).mul(pulse.mul(0.3).add(1.2));

    this.object = new THREE.InstancedMesh(geo, mat, count);
    this.object.frustumCulled = false;
    this.object.renderOrder = 2;
  }

  fire() {
    this.uStart.value = this.uTime.value;
  }
  update(time: number) {
    this.uTime.value = time;
  }
  dispose() {
    this.object.geometry.dispose();
    (this.object.material as THREE.Material).dispose();
  }
}

export const celebrations = (): Celebration[] => {
  const sprites = atlas();
  return [
    {
      name: 'Bubble Geyser',
      setup(fx) {
        const bubbles = fx.particles({
          count: 900,
          atlas: sprites,
          cells: [0],
          mode: 'face',
          lit: false,
          tint: 0.35,
          intensity: 1.4,
          colors: ['#bff6ff', '#ffffff', '#9ff0ff'],
          emitters: [
            { at: [0, 0.2, 0.5], box: [4, 0, 1.5], dir: [0, 1, 0], spread: 0.25, speed: [2, 6], delay: [0, 1.4] },
          ],
          size: [0.12, 0.42],
          gravity: [0, 3, 0],
          drag: 1.5,
          life: [3, 4.5],
          wobble: 0.35,
          mirror: false,
        });
        return () => {
          bubbles.fire();
          fx.ripple(0.9, 1.6);
          fx.shake(0.6, 1.2);
          for (let i = 0; i < 10; i++) fx.sfx.pop(i * 0.11, 0.5 + Math.random());
        };
      },
    },
    {
      name: 'Fish Tornado',
      setup(fx) {
        const school = fx.add(new FishSchool(fx.center));
        return () => {
          school.fire();
          fx.orbit(0.35, FishSchool.DURATION);
          fx.stunt('boing');
        };
      },
    },
    {
      name: 'Jellyfish Bloom',
      setup(fx) {
        const jellies = fx.add(new Jellies(fx.center));
        return () => {
          jellies.fire();
          fx.flash('#64ffda', 0.15, 1.2);
          fx.zoom(-0.1, 3);
          for (let i = 0; i < 6; i++) fx.sfx.pop(0.2 + i * 0.3, 0.4 + i * 0.1);
        };
      },
    },
    {
      name: 'Treasure Burst',
      setup(fx) {
        const loot = fx.particles({
          count: 700,
          atlas: sprites,
          cells: [2, 3, 4, 4, 1],
          colors: ['#ffd166', '#ff9e9e', '#ffffff', '#ffb3e6', '#ff9f43'],
          tint: 0.85,
          emitters: [
            { at: [-4.6, 0.4, 1.6], dir: [0.35, 1, 0.25], spread: 0.3, speed: [7, 13] },
            { at: [4.6, 0.4, 1.6], dir: [-0.35, 1, 0.25], spread: 0.3, speed: [7, 13] },
          ],
          size: [0.22, 0.36],
          gravity: [0, -3.5, 0], // water slows everything down
          drag: 2,
          life: [4, 5],
          spin: 3,
        });
        return () => {
          loot.fire();
          fx.flash('#ffd166', 0.3, 0.7);
          fx.stunt('shake');
          fx.after(0.4, () => fx.stunt('jelly'));
          fx.sfx.boom(0, 0.6);
        };
      },
    },
  ];
};
