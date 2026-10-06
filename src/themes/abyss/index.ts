import * as THREE from 'three/webgpu';
import {
  float,
  fog,
  instancedBufferAttribute,
  mix,
  mx_fractal_noise_float,
  mx_noise_float,
  mx_worley_noise_float,
  positionLocal,
  positionWorld,
  pow,
  rangeFogFactor,
  rotate,
  screenSize,
  screenUV,
  sin,
  smoothstep,
  time,
  uniform,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Theme, ThemeScene } from '../types';
import { makeLights, makeStand, rgb } from '../shared';
import { makeAtlas, shapes, type Sprite } from '../../fx/atlas';
import { fresnel } from '../../fx/nodes';
import { Particles } from '../../fx/Particles';
import type { FxDirector, FxItem } from '../../fx/FxDirector';
import { uSpeed, uWin } from '../../engine/globals';
import { SCALES } from '../../audio/ChipSynth';
import { meta, PALETTE } from './meta';

const WATER = '#06243f';

const inst = (data: Float32Array, size: number, type: string): any =>
  instancedBufferAttribute(new THREE.InstancedBufferAttribute(data, size), type);
const rand = (a: number, b: number) => a + Math.random() * (b - a);

// ------------------------------------------------------------------ sprites

const bubble: Sprite = (ctx, r) => {
  const g = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 0.85);
  g.addColorStop(0, 'rgba(255,255,255,0.05)');
  g.addColorStop(1, 'rgba(255,255,255,0.8)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = r * 0.1;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.55, Math.PI * 1.1, Math.PI * 1.45);
  ctx.stroke();
};

const fish: Sprite = (ctx, r) => {
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(r * 0.1, 0, r * 0.6, r * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-r * 0.4, 0);
  ctx.lineTo(-r * 0.9, -r * 0.4);
  ctx.lineTo(-r * 0.9, r * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#123';
  ctx.beginPath();
  ctx.arc(r * 0.42, -r * 0.08, r * 0.08, 0, Math.PI * 2);
  ctx.fill();
};

const shell: Sprite = (ctx, r) => {
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(0, r * 0.7);
  ctx.arc(0, r * 0.7, r * 1.3, -Math.PI * 0.78, -Math.PI * 0.22);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = r * 0.06;
  for (let i = -3; i <= 3; i++) {
    const a = -Math.PI / 2 + i * 0.2;
    ctx.beginPath();
    ctx.moveTo(0, r * 0.7);
    ctx.lineTo(Math.cos(a) * r * 1.25, r * 0.7 + Math.sin(a) * r * 1.25);
    ctx.stroke();
  }
};

const atlas = () =>
  makeAtlas([bubble, fish, shapes.star(5, 0.42), shell, shapes.circle('#fff', true), shapes.glow(), shapes.sparkle()]);

// ------------------------------------------------------------------ world

function sky() {
  const uvS = screenUV;
  const aspect = screenSize.x.div(screenSize.y);
  const p = vec2(uvS.x.mul(aspect), uvS.y);
  let col: any = mix(rgb('#1a8fb5'), rgb(WATER), smoothstep(0.0, 0.42, uvS.y));
  // god rays fanning down from the surface
  const rays = pow(mx_noise_float(vec3(p.x.mul(5).add(uvS.y.mul(1.6)), time.mul(0.12), 0)).mul(0.5).add(0.5), 4);
  col = col.add(rgb('#7fe8ff').mul(rays).mul(float(1).sub(smoothstep(0.0, 0.75, uvS.y))).mul(0.5));
  const shimmer = mx_fractal_noise_float(vec3(p.mul(vec2(3, 14)), time.mul(0.4)), 3, 2, 0.5);
  col = col.add(vec3(smoothstep(0.3, 0.7, shimmer).mul(float(1).sub(smoothstep(0, 0.12, uvS.y))).mul(0.35)));
  return col;
}

function makeSand() {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 });
  const xz = positionWorld.xz;
  const ripples = sin(xz.x.mul(1.3).add(mx_noise_float(vec3(xz.mul(0.3), 0)).mul(4))).mul(0.5).add(0.5);
  mat.colorNode = mix(rgb('#3a3324'), rgb('#6e5f43'), ripples.mul(0.5).add(0.25));
  // two drifting Worley layers make the dancing caustic web
  const ca = mx_worley_noise_float(vec3(xz.mul(0.55), time.mul(0.45)));
  const cb = mx_worley_noise_float(vec3(xz.mul(0.55).add(3.7), time.mul(0.37).add(10)));
  const caustics = pow(ca.mul(cb), 1.6).mul(3.2);
  mat.emissiveNode = rgb('#7fffe8').mul(caustics).mul(float(1).add(uWin.mul(1.5)));
  const m = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), mat);
  m.rotation.x = -Math.PI / 2;
  return m;
}

function makeKelp(count: number) {
  const geo = new THREE.PlaneGeometry(0.55, 1, 1, 16).translate(0, 0.5, 0);
  const phases = new Float32Array(count);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.6 }), count);
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    let x = 0;
    let z = 0;
    do {
      x = rand(-24, 24);
      z = rand(-32, -3);
    } while (Math.abs(x) < 5 && z > -9);
    m.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand(-0.6, 0.6)), new THREE.Vector3(rand(0.8, 1.4), rand(4, 11), 1));
    mesh.setMatrixAt(i, m);
    phases[i] = Math.random() * 6.28;
  }
  const phase = inst(phases, 1, 'float');
  const mat = mesh.material as THREE.MeshStandardNodeMaterial;
  // positionLocal already includes the instance transform, so drive the sway
  // from the blade's own 0..1 height (uv.y) and offset in world units
  const y = uv().y;
  const sway = sin(time.mul(1.1).add(phase).add(y.mul(3))).mul(y.mul(y)).mul(0.9);
  mat.positionNode = positionLocal.add(vec3(sway, 0, sway.mul(0.4)));
  const g = uv().y;
  mat.colorNode = mix(rgb('#0f3d1f'), rgb('#6f8f2a'), g);
  mat.emissiveNode = rgb('#1de9b6').mul(pow(g, 6).mul(0.15));
  return mesh;
}

function makeShafts() {
  const group = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    const flicker = mx_noise_float(vec3(uv().x.mul(6), time.mul(0.3).add(i * 3), 0)).mul(0.5).add(0.5);
    mat.colorNode = rgb('#7fe8ff').mul(pow(uv().y, 2)).mul(flicker).mul(0.12);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(3.5, 30, 24, 1, true).rotateX(Math.PI), mat);
    cone.position.set(-12 + i * 6 + rand(-1, 1), 15, -6 - rand(0, 14));
    cone.rotation.z = rand(-0.25, 0.25);
    group.add(cone);
  }
  return group;
}

function makeRocks() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, flatShading: true });
  mat.colorNode = mix(rgb('#1d2b3a'), rgb('#3d4f5f'), mx_noise_float(positionLocal.mul(3)).mul(0.5).add(0.5));
  for (let i = 0; i < 14; i++) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.5, 1.8), 0), mat);
    const a = rand(0, Math.PI * 2);
    const d = rand(5, 18);
    rock.position.set(Math.cos(a) * d, 0, Math.sin(a) * d - 5);
    rock.scale.y = rand(0.4, 0.8);
    rock.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    group.add(rock);
  }
  return group;
}

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

// ------------------------------------------------------------------ theme

export const abyss: Theme = {
  ...meta,
  wheel: {
    palette: PALETTE,
    font: '"Bungee"',
    fontWeight: 400,
    rim: ['#c08a3e', '#2fffd6'],
    holo: 0.3,
    flapper: '#ff7a59',
    leds: ['#2fffd6', '#8a5cff'],
    hub: ['#2fffd6', '#2979ff'],
    pegs: '#ffd166',
    frame: '#0d2236',
  },
  post: { bloom: [0.6, 0.6, 0.75], exposure: 1.1, aberration: 0.7, vignette: 0.7 },
  character: { spot: [0, 0.22, 1.6], entrance: 'rise' },
  tick: 'bubble',
  song: {
    bpm: 100,
    root: 57,
    scale: SCALES.dorian,
    progressions: [
      [0, 3, 0, 4],
      [0, 5, 3, 4],
      [0, 2, 3, 4],
    ],
    lead: 'sine',
    bass: 'triangle',
    drums: 'half',
    density: 0.4,
    arp: true,
    brightness: 1800,
  },

  createScene({ scene, center }) {
    const group = new THREE.Group();
    scene.backgroundNode = sky();
    scene.fogNode = fog(rgb(WATER), rangeFogFactor(10, 48));
    scene.environmentIntensity = 0.35;

    group.add(makeSand(), makeKelp(80), makeShafts(), makeRocks());

    const bronze = new THREE.MeshStandardNodeMaterial({ color: '#8a5a2b', metalness: 1, roughness: 0.45 });
    const rock = new THREE.MeshStandardNodeMaterial({ roughness: 0.9 });
    rock.colorNode = mix(rgb('#22303d'), rgb('#415565'), mx_noise_float(positionLocal.mul(4)).mul(0.5).add(0.5));
    group.add(
      makeStand(center, {
        legs: bronze,
        plinth: rock,
        neon: rgb('#2fffd6').mul(sin(time.mul(2)).mul(0.4).add(1.4).add(uSpeed.mul(0.08)).add(uWin.mul(2.5))),
      }),
    );

    const sprites = atlas();
    const snow = new Particles({
      count: 320,
      atlas: sprites,
      cells: [5],
      loop: true,
      mode: 'face',
      blend: 'additive',
      intensity: 0.7,
      emitters: [{ at: [0, 6, -4], box: [16, 6, 10], dir: [0, -1, 0], spread: 0.3, speed: [0.05, 0.2] }],
      size: [0.04, 0.09],
      gravity: [0, -0.12, 0],
      drag: 1,
      life: [6, 12],
      wobble: 0.3,
      colors: ['#cffcff'],
    });
    const vents = new Particles({
      count: 90,
      atlas: sprites,
      cells: [0],
      loop: true,
      mode: 'face',
      lit: false,
      tint: 0.3,
      intensity: 1.3,
      emitters: [
        { at: [-6, 0.1, -5], box: [0.3, 0, 0.3], speed: [0.5, 1] },
        { at: [7.5, 0.1, -8], box: [0.3, 0, 0.3], speed: [0.5, 1] },
        { at: [-3, 0.1, -14], box: [0.3, 0, 0.3], speed: [0.5, 1] },
      ],
      size: [0.08, 0.22],
      gravity: [0, 1.4, 0],
      drag: 1.2,
      life: [4, 6],
      wobble: 0.15,
      colors: ['#bff6ff'],
    });
    group.add(snow.object, vents.object);

    const boost = makeLights(group, ['#9fe8ff', 0.8], [
      ['#2fffd6', 12, [-6, 5, 4]],
      ['#8a5cff', 12, [6, 5, 4]],
    ]);

    return {
      group,
      update(f) {
        boost(f.speed, f.win);
        snow.update(f.time);
        vents.update(f.time);
      },
    };
  },

  celebrations: () => {
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
  },
};
