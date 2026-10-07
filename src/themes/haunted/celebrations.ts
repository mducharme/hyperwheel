/** haunted: winner celebrations. Each `setup` runs once when the scene loads (so shaders compile up front) and returns the function that plays it. */
import * as THREE from 'three/webgpu';
import {
  float,
  length,
  max,
  mix,
  positionGeometry,
  positionLocal,
  rotate,
  sin,
  smoothstep,
  step,
  time,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';
import { rgb } from '../shared';
import { fresnel } from '../../fx/nodes';
import type { FxItem } from '../../fx/FxDirector';
import type { Celebration } from '../types';
import { rand, inst } from '../../fx/util';
import { atlas } from './sprites';
import type { HauntedScene } from '.';

// ------------------------------------------------------------------ ghost parade

/** Sheet ghosts spiralling up around the wheel; orbit and hem flutter run on the GPU. */
class GhostParade implements FxItem {
  readonly object: THREE.InstancedMesh;
  private uTime = uniform(0);
  private uStart = uniform(-1e4);
  static DURATION = 6.5;

  constructor(center: THREE.Vector3, count = 22) {
    // dome head flaring into a sheet
    const profile: THREE.Vector2[] = [];
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * (Math.PI / 2);
      profile.push(new THREE.Vector2(Math.sin(a) * 0.5, 0.55 + Math.cos(a) * 0.5));
    }
    profile.reverse();
    profile.push(new THREE.Vector2(0.48, 0.15), new THREE.Vector2(0.52, -0.25), new THREE.Vector2(0.62, -0.62));
    const geo = new THREE.LatheGeometry(profile, 40);

    const orbit = new Float32Array(count * 4); // radius, phase, speed, height offset
    for (let i = 0; i < count; i++) orbit.set([rand(4.6, 6.6), rand(0, Math.PI * 2), rand(0.7, 1.15), rand(-3.5, 1)], i * 4);
    const aOrbit = inst(orbit, 4, 'vec4');

    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const t = this.uTime.sub(this.uStart);
    const D = GhostParade.DURATION;
    const alive = t.greaterThan(0).and(t.lessThan(D)).select(float(1), float(0));
    const env = smoothstep(0, 0.8, t).mul(float(1).sub(smoothstep(D - 1, D, t))).mul(alive);
    const lp = positionLocal;
    // fluttering hem
    const hem = float(1).sub(smoothstep(-0.6, 0.2, lp.y));
    const ang = lp.z.atan(lp.x);
    const wave = sin(ang.mul(7).add(this.uTime.mul(6)).add(aOrbit.y.mul(4)));
    const flutter = wave.mul(0.07).mul(hem);
    // scalloped, rippling hem
    const scallop = wave.mul(0.08).mul(float(1).sub(smoothstep(-0.62, -0.45, lp.y)));
    const local = vec3(lp.x.mul(float(1).add(flutter)), lp.y.add(scallop), lp.z.mul(float(1).add(flutter))).mul(env.mul(0.62));
    const a = aOrbit.y.add(aOrbit.z.mul(t));
    // face outward from the wheel, so the ones passing in front look at the camera
    const turned = rotate(local, vec3(0, a.add(Math.PI / 2), 0));
    const rise = t.mul(0.75).add(aOrbit.w);
    const bob = sin(t.mul(3).add(aOrbit.y)).mul(0.2);
    mat.positionNode = turned.add(vec3(a.cos().mul(aOrbit.x), rise.add(bob), a.sin().mul(aOrbit.x).negate()).add(vec3(center.x, center.y, center.z)));

    // two dark eyes and an "o" mouth on the front of the head
    // the face is painted in the ghost's own shape coordinates: positionLocal now
    // means the moved (orbiting) position, so use the untouched geometry instead
    const gp = positionGeometry;
    const eye = (x: number) => step(length(vec2(gp.x.sub(x), gp.y.sub(0.6)).mul(vec2(1, 0.7))), float(0.075));
    const front = step(0.25, gp.z);
    const mouth = step(length(vec2(gp.x, gp.y.sub(0.38)).mul(vec2(1, 0.8))), float(0.065));
    const face = max(max(eye(-0.16), eye(0.16)), mouth).mul(front);
    // soft glow, kept under the bloom threshold so ghosts stay readable
    const glow = fresnel(1.5).mul(0.35).add(0.55);
    mat.colorNode = mix(rgb('#e6e8ff').mul(glow), rgb('#1a1026'), face);
    mat.opacityNode = mix(float(0.72), float(1), face).mul(env);

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

export const celebrations = (world: HauntedScene): Celebration[] => {
  const sprites = atlas();
  return [
    {
      name: 'Bat Swarm',
      setup(fx) {
        const bats = fx.particles({
          count: 240,
          atlas: sprites,
          cells: [0],
          tint: 0,
          mode: 'face',
          lit: false,
          intensity: 1.2,
          emitters: [{ at: [0, 3.9, -1.5], box: [2.5, 2.5, 0.5], dir: [0, 0.6, 1], spread: 1.2, speed: [6, 12] }],
          size: [0.45, 0.8],
          gravity: [0, 1.5, 0],
          drag: 1.1,
          life: [3, 4.2],
          spin: 2,
          wobble: 0.5,
        });
        return () => {
          bats.fire();
          fx.shake(0.5, 0.8);
          fx.sfx.whoosh();
          fx.after(0.25, () => fx.sfx.whoosh());
        };
      },
    },
    {
      name: 'Ghost Parade',
      setup(fx) {
        const ghosts = fx.add(new GhostParade(fx.center));
        return () => {
          ghosts.fire();
          fx.orbit(0.4, GhostParade.DURATION);
          fx.flash('#c9c2ff', 0.15, 1);
          fx.sfx.whoosh();
        };
      },
    },
    {
      name: 'Trick or Treat',
      setup(fx) {
        const treats = fx.particles({
          count: 600,
          atlas: sprites,
          cells: [2, 2, 3, 4],
          colors: ['#ff8a1f', '#9b5cff', '#7dff6a', '#ffd23f', '#ffffff'],
          tint: 0.5,
          emitters: [
            { at: [-4.6, 0.4, 1.6], dir: [0.35, 1, 0.25], spread: 0.3, speed: [8, 14] },
            { at: [4.6, 0.4, 1.6], dir: [-0.35, 1, 0.25], spread: 0.3, speed: [8, 14] },
          ],
          size: [0.24, 0.38],
          gravity: [0, -7, 0],
          drag: 1.1,
        });
        return () => {
          treats.fire();
          world.surge(1);
          fx.stunt('boing');
          fx.sfx.boom(0, 1.3);
          for (let i = 0; i < 5; i++) fx.sfx.pop(0.2 + i * 0.12, 0.7 + i * 0.1);
        };
      },
    },
    {
      name: 'Thunderstrike',
      setup(fx) {
        const wave = fx.shockwave({ color: '#9b5cff', radius: 16, width: 0.05, duration: 1.4 });
        const sparks = fx.particles({
          count: 500,
          atlas: sprites,
          cells: [5, 6],
          colors: ['#c9c2ff', '#7dff6a', '#ffffff'],
          blend: 'additive',
          intensity: 2.2,
          mode: 'stretch',
          stretch: 0.2,
          emitters: [{ at: [0, 3.9, 0.6], spread: 2, speed: [4, 10] }],
          size: [0.1, 0.18],
          gravity: [0, -2, 0],
          drag: 1.8,
          life: [1.2, 2],
        });
        return () => {
          world.lightning();
          fx.flash('#cfd8ff', 0.7, 0.25);
          fx.after(0.3, () => fx.flash('#cfd8ff', 0.55, 0.5));
          fx.after(0.3, () => {
            sparks.fire();
            wave.fire(new THREE.Vector3(0, 0.08, -0.6), 'floor');
            fx.shake(1.6, 0.9);
            fx.stunt('shake');
            fx.ripple(1, 1.2);
          });
          fx.sfx.boom(0.35, 0.5);
          fx.sfx.boom(0.6, 0.4);
        };
      },
    },
  ];
};
