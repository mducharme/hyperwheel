import * as THREE from 'three/webgpu';
import {
  abs,
  dot,
  exp,
  float,
  floor,
  fog,
  hash,
  length,
  mix,
  mx_noise_float,
  normalView,
  positionLocal,
  positionViewDirection,
  positionWorld,
  pow,
  rangeFogFactor,
  sin,
  smoothstep,
  step,
  time,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Theme, ThemeScene } from '../types';
import { makeLights, makeStand, rgb } from '../shared';
import { Particles } from '../../fx/Particles';
import { uSpeed, uWin } from '../../engine/globals';
import { SCALES } from '../../audio/ChipSynth';
import { GEMS, meta, PALETTE } from './meta';
import { inst, rand } from '../../fx/util';
import { atlas } from './sprites';
import { idleMoments } from '../../fx/ambient';
import { celebrations } from './celebrations';

type N = any;

/** The mine-cart track runs along x behind the wheel. */
const CART_Z = -8.5;
const CEILING = 16;

/** Ridged glowing veins running through the rock. */
const veins = (p: N, uRes: N) => {
  const v = float(1).sub(abs(mx_noise_float(p.mul(0.07).add(3.1))));
  const tint = mix(rgb('#4ff3ff'), rgb('#b06cff'), mx_noise_float(p.mul(0.03)).mul(0.5).add(0.5));
  return tint.mul(pow(v, 70).mul(float(0.9).add(uRes.mul(2))));
};

// ------------------------------------------------------------------ world

/** The cavern itself: a rough dome of dark stone, with veins of light. */
function makeDome(uRes: N) {
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, fog: false });
  const p = positionWorld;
  const n = mx_noise_float(p.mul(0.05)).mul(0.5).add(0.5);
  let col: N = mix(rgb('#09070e'), rgb('#231d31'), n);
  col = col.mul(smoothstep(-10, 30, p.y).mul(0.6).add(0.4)); // darker toward the floor horizon
  mat.colorNode = col.add(veins(p, uRes).mul(0.4));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(75, 48, 24), mat);
  dome.position.y = -6;
  return dome;
}

function rockMaterial(uRes: N) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.85 });
  const n = mx_noise_float(positionWorld.mul(0.5)).mul(0.5).add(0.5);
  m.colorNode = mix(rgb('#17141f'), rgb('#3b3448'), n);
  m.emissiveNode = veins(positionWorld.mul(4), uRes).mul(0.35);
  return m;
}

function makeFloor() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9 });
  const xz = positionWorld.xz;
  const n = mx_noise_float(vec3(xz.mul(0.3), 0)).mul(0.5).add(0.5);
  m.colorNode = mix(rgb('#141119'), rgb('#2e2838'), n);
  // a scatter of tiny crystal glints in the dirt
  const g = hash(floor(xz.mul(9)).dot(vec2(1, 57)));
  const twinkle = sin(time.mul(2).add(g.mul(40))).mul(0.5).add(0.5);
  m.emissiveNode = mix(rgb('#4ff3ff'), rgb('#ff4f7b'), hash(g.mul(7.1))).mul(step(0.996, g).mul(twinkle).mul(0.9));
  const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), m);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.z = -20;
  return floorMesh;
}

/** Lumpy boulders around the edge of the cave. */
function makeBoulders(mat: THREE.Material) {
  const base = new THREE.IcosahedronGeometry(1, 3);
  const pos = base.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const d = 1 + 0.14 * (Math.sin(v.x * 3.1) + Math.sin(v.y * 2.7 + 1) + Math.sin(v.z * 3.7 + 2));
    pos.setXYZ(i, v.x * d, v.y * d, v.z * d);
  }
  base.computeVertexNormals();
  const g = new THREE.Group();
  for (const [x, z, sx, sy, sz] of [
    [-9.5, -6, 3, 2.2, 2.5],
    [10, -7.5, 3.4, 2.6, 2.6],
    [-14, -13, 5, 4, 4],
    [15, -14, 5.5, 4.5, 4],
    [-4, -19, 4, 3, 3],
    [6, -21, 5, 3.6, 3.5],
  ]) {
    const b = new THREE.Mesh(base, mat);
    b.position.set(x, sy * 0.25, z);
    b.scale.set(sx, sy, sz);
    b.rotation.y = rand(0, Math.PI);
    g.add(b);
  }
  // stalagmites and stalactites
  const spike = new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0);
  const spikes: [number, number, number, boolean][] = [];
  for (let i = 0; i < 26; i++) spikes.push([rand(-20, 20), rand(-24, -4), rand(1.5, 4.5), false]);
  for (let i = 0; i < 30; i++) spikes.push([rand(-22, 22), rand(-26, 0), rand(2, 6), true]);
  const mesh = new THREE.InstancedMesh(spike, mat, spikes.length);
  const m = new THREE.Matrix4();
  spikes.forEach(([x, z, h, hang], i) => {
    if (!hang && Math.abs(x) < 6 && z > -10) x += Math.sign(x || 1) * 6; // keep the stage clear
    const w = h * rand(0.14, 0.22);
    m.compose(new THREE.Vector3(x, hang ? CEILING : 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(hang ? Math.PI : 0, 0, rand(-0.1, 0.1))), new THREE.Vector3(w, h, w));
    mesh.setMatrixAt(i, m);
  });
  g.add(mesh);
  return g;
}

/**
 * Every crystal in the cave as one instanced mesh: hexagonal prisms with
 * pointed tips, glowing from within, each in its own gem colour and rhythm.
 */
function makeCrystals(uRes: N, uFlare: N) {
  const prism = mergeGeometries([new THREE.CylinderGeometry(0.2, 0.24, 1, 6).translate(0, 0.5, 0), new THREE.ConeGeometry(0.2, 0.38, 6).translate(0, 1.19, 0)])!;
  // [x, z, size, count, hanging from the ceiling]
  const clusters: [number, number, number, number, boolean][] = [
    [-6.6, -1.4, 1.3, 9, false],
    [-8.8, -6.5, 2, 12, false],
    [6.9, -1.2, 1.3, 9, false],
    [9.2, -8, 2.2, 12, false],
    [-3, -14, 2.6, 12, false],
    [4.5, -16, 3, 14, false],
    [-12.5, -12, 3, 12, false],
    [13.5, -13, 3, 12, false],
    [-5.3, 2.5, 0.75, 6, false],
    [5.5, 2.3, 0.75, 6, false],
    [-6, -8, 2.4, 10, true],
    [5.5, -10, 2.6, 10, true],
    [0, -15, 3, 10, true],
  ];
  const total = clusters.reduce((n, c) => n + c[3], 0);
  const color = new Float32Array(total * 3);
  const phase = new Float32Array(total);
  const mesh = new THREE.InstancedMesh(prism, new THREE.MeshStandardNodeMaterial(), total);
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  let k = 0;
  clusters.forEach(([x, z, size, count, hang], ci) => {
    const hue = GEMS[ci % GEMS.length];
    for (let i = 0; i < count; i++, k++) {
      const h = size * rand(0.45, 1.35);
      const tilt = new THREE.Euler(rand(-0.55, 0.55), rand(0, Math.PI), rand(-0.55, 0.55));
      const q = new THREE.Quaternion().setFromEuler(tilt);
      if (hang) q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI));
      const r = size * 0.35;
      m.compose(new THREE.Vector3(x + rand(-r, r), hang ? CEILING : 0, z + rand(-r, r)), q, new THREE.Vector3(h * 1.2, h, h * 1.2));
      mesh.setMatrixAt(k, m);
      // mostly the cluster's own gem, with the odd stray colour
      c.set(Math.random() < 0.8 ? hue : GEMS[Math.floor(Math.random() * GEMS.length)]);
      color.set([c.r, c.g, c.b], k * 3);
      phase[k] = Math.random();
    }
  });
  const aCol = inst(color, 3, 'vec3');
  const aPhase = inst(phase, 1, 'float');
  const mat = mesh.material as THREE.MeshStandardNodeMaterial;
  mat.roughness = 0.12;
  mat.metalness = 0.1;
  const fres = pow(float(1).sub(abs(dot(normalView, positionViewDirection))), 2.5);
  // a ring of light travelling outward from the stage (uRes 0..1), plus a slow individual pulse
  const ring = exp(length(positionWorld.xz).sub(uRes.mul(36)).pow(2).mul(-0.12)).mul(step(0.001, uRes));
  const pulse = sin(time.mul(1.1).add(aPhase.mul(6.283))).mul(0.3).add(0.7);
  mat.colorNode = aCol.mul(0.25);
  mat.emissiveNode = aCol.mul(pulse.mul(0.65).add(fres.mul(0.8))).mul(float(1).add(uSpeed.mul(0.05)).add(uWin.mul(1.5)).add(ring.mul(3)).add(uFlare.mul(2.5)));
  mesh.frustumCulled = false;
  return mesh;
}

/** Rails on sleepers, and a mine cart full of glowing ore. */
function makeTrack() {
  const g = new THREE.Group();
  const iron = new THREE.MeshStandardNodeMaterial({ color: '#5a5f68', metalness: 0.8, roughness: 0.4 });
  for (const z of [-0.45, 0.45]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(90, 0.1, 0.08), iron);
    rail.position.set(0, 0.16, CART_Z + z);
    g.add(rail);
  }
  const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.1, 1.3), new THREE.MeshStandardNodeMaterial({ color: '#3b2a1c', roughness: 0.9 }), 110);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 110; i++) {
    m.makeTranslation(-44 + i * 0.8, 0.06, CART_Z);
    sleepers.setMatrixAt(i, m);
  }
  g.add(sleepers);
  return g;
}

function makeCart() {
  const g = new THREE.Group();
  const rust = new THREE.MeshStandardNodeMaterial({ roughness: 0.7, metalness: 0.5 });
  rust.colorNode = mix(rgb('#5a3a28'), rgb('#8a5a35'), mx_noise_float(positionLocal.mul(6)).mul(0.5).add(0.5));
  const walls = mergeGeometries([
    new THREE.BoxGeometry(1.8, 0.1, 1.1).translate(0, 0.45, 0),
    new THREE.BoxGeometry(1.8, 0.7, 0.08).translate(0, 0.8, 0.55),
    new THREE.BoxGeometry(1.8, 0.7, 0.08).translate(0, 0.8, -0.55),
    new THREE.BoxGeometry(0.08, 0.7, 1.1).translate(0.9, 0.8, 0),
    new THREE.BoxGeometry(0.08, 0.7, 1.1).translate(-0.9, 0.8, 0),
  ])!;
  g.add(new THREE.Mesh(walls, rust));
  const wheelMat = new THREE.MeshStandardNodeMaterial({ color: '#2b2d31', metalness: 0.8, roughness: 0.4 });
  for (const x of [-0.6, 0.6]) for (const z of [-0.45, 0.45]) g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.1, 14).rotateX(Math.PI / 2).translate(x, 0.27, z), wheelMat));
  const ore = new THREE.MeshStandardNodeMaterial({ roughness: 0.2 });
  ore.colorNode = rgb('#ffc94d').mul(0.3);
  ore.emissiveNode = rgb('#ffb347').mul(sin(time.mul(3)).mul(0.3).add(1.6));
  for (let i = 0; i < 7; i++) {
    const o = new THREE.Mesh(new THREE.OctahedronGeometry(rand(0.16, 0.26)), ore);
    o.position.set(rand(-0.6, 0.6), 1.12 + rand(0, 0.12), rand(-0.3, 0.3));
    o.rotation.set(rand(0, 3), rand(0, 3), 0);
    g.add(o);
  }
  g.position.set(-40, 0.16, CART_Z);
  return g;
}

export interface CaveScene extends ThemeScene {
  /** A ring of light ripples outward through every crystal. */
  resonate(): void;
  /** All crystals blaze for a while. */
  flare(seconds: number): void;
  /** Send the mine cart along the track (fast = runaway, with sparks). */
  cartRun(fast: boolean): void;
}

// ------------------------------------------------------------------ theme

export const crystal: Theme<CaveScene> = {
  ...meta,
  wheel: {
    palette: PALETTE,
    font: `"${meta.font.family}"`,
    fontWeight: meta.font.weight,
    rim: ['#b06cff', '#4ff3ff'],
    holo: 0.7,
    flapper: '#4ff3ff',
    leds: ['#b06cff', '#4ff3ff'],
    hub: ['#4ff3ff', '#b06cff'],
    pegs: '#e0fbfc',
    frame: '#151022',
  },
  post: { bloom: [0.75, 0.5, 0.72], exposure: 1, aberration: 0.9, vignette: 0.65 },
  character: { spot: [0, 0.22, 1.6], entrance: 'teleport' },
  tick: 'marimba',
  song: {
    bpm: 108,
    root: 62,
    scale: SCALES.lydian,
    progressions: [
      [0, 4, 5, 3],
      [0, 1, 4, 4],
      [5, 3, 1, 4],
    ],
    lead: 'triangle',
    bass: 'sine',
    drums: 'half',
    density: 0.5,
    arp: true,
    brightness: 5200,
  },

  createScene({ scene, center }) {
    const group = new THREE.Group();
    scene.fogNode = fog(rgb('#120e1c'), rangeFogFactor(28, 80));
    scene.environmentIntensity = 0.25;

    const uRes = uniform(0); // resonance ring progress, 0 = off
    const uFlare = uniform(0);
    const rock = rockMaterial(uRes);

    group.add(makeDome(uRes), makeFloor(), makeBoulders(rock), makeCrystals(uRes, uFlare), makeTrack());
    const cart = makeCart();
    group.add(cart);

    const metal = new THREE.MeshStandardNodeMaterial({ color: '#2a2438', metalness: 0.8, roughness: 0.35 });
    group.add(
      makeStand(center, {
        legs: metal,
        plinth: rock,
        neon: mix(rgb('#b06cff'), rgb('#4ff3ff'), sin(time.mul(1.2)).mul(0.5).add(0.5)).mul(float(1.8).add(uSpeed.mul(0.08)).add(uWin.mul(2.5))),
      }),
    );

    // glowing spores drifting through the air
    const sprites = atlas();
    const spores = new Particles({
      count: 220,
      atlas: sprites,
      cells: [3],
      loop: true,
      mode: 'face',
      blend: 'additive',
      intensity: 1.6,
      emitters: [{ at: [0, 3, -6], box: [16, 4, 10], dir: [0, 1, 0], spread: 1, speed: [0.05, 0.25] }],
      size: [0.06, 0.16],
      gravity: [0, 0.05, 0],
      drag: 0.6,
      life: [6, 10],
      wobble: 0.6,
      colors: ['#4ff3ff', '#b06cff', '#19e3a8'],
    });
    // sparks thrown off the cart's wheels when it runs away (they travel with the cart)
    const sparks = new Particles({
      count: 90,
      atlas: sprites,
      cells: [3],
      loop: true,
      mode: 'stretch',
      stretch: 0.25,
      blend: 'additive',
      intensity: 3,
      emitters: [
        { at: [-0.6, 0.1, 0.5], dir: [-1, 0.6, 0.2], spread: 0.5, speed: [3, 7] },
        { at: [-0.6, 0.1, -0.5], dir: [-1, 0.6, -0.2], spread: 0.5, speed: [3, 7] },
      ],
      size: [0.04, 0.07],
      gravity: [0, -9, 0],
      drag: 0.5,
      life: [0.25, 0.45],
      colors: ['#ffd27a', '#ff8a3d'],
      mirror: false,
    });
    sparks.object.visible = false;
    cart.add(sparks.object);
    group.add(spores.object);

    const lights = makeLights(group, ['#9fb0ff', 0.35], [
      ['#b06cff', 9, [-8, 3, -5]],
      ['#4ff3ff', 9, [8.5, 3, -6]],
      ['#19e3a8', 7, [-3, 4, -13]],
      ['#ff4f7b', 6, [5, 4, -15]],
    ]);

    // ------------------------------------------------ animation state
    let resT = -1;
    let flareLeft = 0;
    let cartT = -1;
    let cartFast = false;
    const resonate = () => (resT = 0);
    const cartRun = (fast: boolean) => {
      cartT = 0;
      cartFast = fast;
      sparks.object.visible = fast;
    };

    // idle moments: the cart trundles past, the crystals resonate, dust trickles from the ceiling
    const moments = idleMoments();
    const dust = moments.track(
      new Particles({
        count: 70,
        atlas: sprites,
        cells: [4],
        colors: ['#8a8196', '#5e5670'],
        tint: 1,
        mode: 'tumble',
        emitters: [{ at: [6.5, CEILING - 0.5, -6], box: [1.5, 0, 1.5], dir: [0, -1, 0], spread: 0.2, speed: [0.5, 2], delay: [0, 1.5] }],
        size: [0.06, 0.16],
        gravity: [0, -9, 0],
        drag: 0.3,
        life: [1.8, 2.4],
        spin: 6,
      }),
    );
    group.add(dust.object);
    moments.add(() => cartRun(false));
    moments.add(resonate);
    moments.add(() => dust.fire());

    return {
      group,
      moments,
      resonate,
      flare(seconds) {
        flareLeft = Math.max(flareLeft, seconds);
      },
      cartRun,
      update(f) {
        lights(f.speed, f.win);
        moments.update(f);
        spores.update(f.time);
        sparks.update(f.time);

        if (resT >= 0) {
          resT += f.dt / 2.6;
          uRes.value = resT >= 1 ? 0 : resT;
          if (resT >= 1) resT = -1;
        }
        flareLeft = Math.max(0, flareLeft - f.dt);
        uFlare.value += ((flareLeft > 0 ? 1 : 0) - uFlare.value) * (1 - Math.exp(-f.dt * (flareLeft > 0 ? 4 : 1.5)));

        if (cartT >= 0) {
          // a leisurely trundle, or a runaway in about two seconds
          cartT += f.dt / (cartFast ? 2.2 : 14);
          cart.position.x = -40 + cartT * 80;
          cart.rotation.z = Math.sin(f.time * (cartFast ? 40 : 14)) * (cartFast ? 0.03 : 0.012);
          if (cartT >= 1) {
            cartT = -1;
            sparks.object.visible = false;
            cart.position.x = -40;
          }
        }
      },
    };
  },

  celebrations,
};
