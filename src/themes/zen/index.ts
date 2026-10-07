import * as THREE from 'three/webgpu';
import {
  abs,
  exp,
  float,
  fog,
  Fn,
  length,
  min,
  mix,
  mx_fractal_noise_float,
  mx_noise_float,
  normalWorld,
  positionGeometry,
  positionLocal,
  positionWorld,
  rangeFogFactor,
  screenSize,
  screenUV,
  sin,
  smoothstep,
  time,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Theme, ThemeScene } from '../types';
import { makeLights, makeStand, rgb, taperedTube } from '../shared';
import { lowRes } from '../../fx/nodes';
import { Particles } from '../../fx/Particles';
import { uSpeed, uWin } from '../../engine/globals';
import { SCALES } from '../../audio/ChipSynth';
import { meta, PALETTE } from './meta';
import { rand } from '../../fx/util';
import { atlas } from './sprites';
import { flyby, idleMoments } from '../../fx/ambient';
import { POND, POND_R } from './layout';
import { celebrations } from './celebrations';

type N = any;

/** Rocks in the sand (x, z, size): the rake lines ring around them. */
const ROCKS: [number, number, number][] = [
  [-5.8, -2.8, 1.1],
  [7.6, -8.5, 1.4],
  [-9.5, -11.5, 1.6],
];

// ------------------------------------------------------------------ sky & ground

function sky() {
  const dusk = Fn(() => {
    const uvS = screenUV; // y grows downward
    const p = vec2(uvS.x.mul(screenSize.x.div(screenSize.y)), uvS.y);
    let col: N = mix(rgb('#6f6aa8'), rgb('#f2b6c4'), smoothstep(0.0, 0.55, uvS.y));
    col = mix(col, rgb('#ffd8b8'), smoothstep(0.45, 0.66, uvS.y));
    const n = mx_fractal_noise_float(vec3(p.mul(vec2(1.1, 4.5)).add(vec2(time.mul(0.004), 0)), 0), 3, 2, 0.5);
    col = mix(col, rgb('#ffe4ec'), smoothstep(0.15, 0.55, n).mul(smoothstep(0.55, 0.2, uvS.y)).mul(0.45));
    return vec4(col, 1);
  });
  return lowRes(dusk()).rgb;
}

function makeGround() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 });
  const xz = positionWorld.xz;
  // distance to the nearest rock's edge; rake rings wrap around the rocks, straight lines elsewhere
  let d: N = float(99);
  for (const [x, z, s] of ROCKS) d = min(d, length(xz.sub(vec2(x, z))).sub(s));
  const near = smoothstep(2.4, 1.6, d);
  const lines = mix(sin(xz.y.mul(13)), sin(d.mul(13)), near);
  const groove = smoothstep(0.55, 1, lines).mul(0.14);
  const sand = rgb('#e8ddcb').mul(float(1).sub(groove)).add(mx_noise_float(vec3(xz.mul(3), 0)).mul(0.02));
  // the raked bed is a rectangle with soft moss all around it
  const bed = smoothstep(13, 12, abs(xz.x)).mul(smoothstep(-15, -14, xz.y)).mul(smoothstep(6, 5, xz.y));
  const moss = mix(rgb('#5e7d4a'), rgb('#7c9a5e'), mx_fractal_noise_float(vec3(xz.mul(0.4), 0), 2, 2, 0.5).mul(0.5).add(0.5));
  let col: N = mix(moss, sand, bed);
  // the pond floor: dark water seen from above
  const pond = smoothstep(POND_R + 0.05, POND_R - 0.1, length(xz.sub(vec2(POND.x, POND.z))));
  col = mix(col, rgb('#1d3b3f'), pond);
  m.colorNode = col;
  const g = new THREE.Mesh(new THREE.PlaneGeometry(220, 180), m);
  g.rotation.x = -Math.PI / 2;
  g.position.z = -50;
  return g;
}

function makeRocks() {
  const geo = new THREE.IcosahedronGeometry(1, 3);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const k = 1 + 0.16 * (Math.sin(v.x * 3.3) + Math.sin(v.y * 2.9 + 1) + Math.sin(v.z * 3.1 + 2));
    pos.setXYZ(i, v.x * k, v.y * k * 0.7, v.z * k);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.9 });
  const n = mx_noise_float(positionWorld.mul(1.4)).mul(0.5).add(0.5);
  mat.colorNode = mix(mix(rgb('#6d6a66'), rgb('#8f8a83'), n), rgb('#5f7f43'), smoothstep(0.55, 0.85, normalWorld.y).mul(smoothstep(0.35, 0.7, n)));
  const g = new THREE.Group();
  for (const [x, z, s] of ROCKS) {
    const r = new THREE.Mesh(geo, mat);
    r.position.set(x, s * 0.3, z);
    r.scale.setScalar(s);
    r.rotation.y = rand(0, Math.PI);
    g.add(r);
  }
  return g;
}

/** A still pond: dark water mirroring the sky, rings when something stirs it, and lily pads. */
function makePond(uRipple: N) {
  const g = new THREE.Group();
  const water = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  const d = length(uv().sub(0.5)).mul(2);
  // a few concentric rings per ripple (uRipple counts seconds since it began, <0 = calm)
  const ring = (k: number) => {
    const t = uRipple.sub(k * 0.25);
    return exp(d.sub(t.mul(0.55)).mul(20).pow(2).negate()).mul(exp(t.mul(-1.2))).mul(t.greaterThan(0).select(float(1), float(0)));
  };
  const sheen = mx_noise_float(vec3(uv().mul(5), time.mul(0.2))).mul(0.5).add(0.5);
  water.colorNode = mix(rgb('#2b5a5c'), rgb('#e9b9c8'), sheen.mul(0.3).add(d.mul(0.15))).add(vec3(ring(0).add(ring(1)).add(ring(2)).mul(0.5)));
  water.opacityNode = float(0.62);
  const surface = new THREE.Mesh(new THREE.CircleGeometry(POND_R, 48).rotateX(-Math.PI / 2), water);
  surface.position.set(POND.x, 0.07, POND.z);
  surface.renderOrder = 1;
  g.add(surface);
  // a border of rounded stones
  const stoneMat = new THREE.MeshStandardNodeMaterial({ color: '#8a8580', roughness: 0.8 });
  const stones = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 10, 8).scale(1, 0.6, 1), stoneMat, 26);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    m.compose(new THREE.Vector3(POND.x + Math.cos(a) * (POND_R + 0.12), 0.06, POND.z + Math.sin(a) * (POND_R + 0.12)), new THREE.Quaternion(), new THREE.Vector3(rand(0.8, 1.2), 1, rand(0.8, 1.2)));
    stones.setMatrixAt(i, m);
  }
  g.add(stones);
  // lily pads, one with a flower
  const padMat = new THREE.MeshStandardNodeMaterial({ color: '#4f8a46', roughness: 0.6 });
  for (const [x, z, s] of [
    [-0.8, -0.6, 0.32],
    [0.6, -0.9, 0.26],
    [-0.4, 0.9, 0.3],
  ]) {
    const pad = new THREE.Mesh(new THREE.CircleGeometry(s, 20, 0.3, Math.PI * 2 - 0.3).rotateX(-Math.PI / 2), padMat);
    pad.position.set(POND.x + x, 0.08, POND.z + z);
    pad.rotation.y = rand(0, Math.PI * 2);
    g.add(pad);
  }
  const flower = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.14, 8), new THREE.MeshStandardNodeMaterial({ color: '#f6b6c8', roughness: 0.5 }));
  flower.position.set(POND.x - 0.8, 0.15, POND.z - 0.6);
  g.add(flower);
  return g;
}

/** Koi swimming slow laps just under the surface (moved each frame). */
function makeKoi() {
  const geo = mergeGeometries([new THREE.SphereGeometry(0.16, 12, 8).scale(1.6, 0.45, 0.7), new THREE.ConeGeometry(0.11, 0.24, 6).rotateZ(Math.PI / 2).scale(1, 1, 0.3).translate(-0.34, 0, 0)])!;
  const colors = ['#ff6a2b', '#f4f1ea', '#ff8a3d', '#e8492f', '#f9d27a'];
  return colors.map((c, i) => {
    const fish = new THREE.Mesh(geo, new THREE.MeshStandardNodeMaterial({ color: c, roughness: 0.4 }));
    fish.position.y = 0.035;
    return { fish, r: 0.5 + i * 0.25, a: rand(0, Math.PI * 2), speed: rand(0.25, 0.45) * (i % 2 ? 1 : -1) };
  });
}

function makeTorii() {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardNodeMaterial({ color: '#c8402f', roughness: 0.6 });
  const black = new THREE.MeshStandardNodeMaterial({ color: '#1e1b1c', roughness: 0.6 });
  for (const x of [-2.3, 2.3]) g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 6.2, 12).translate(x, 3.1, 0), red));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.35, 0.4).translate(0, 4.9, 0), red)); // nuki
  // kasagi: the top beam, sweeping up at both ends
  const top = new THREE.BoxGeometry(7.4, 0.42, 0.6, 16, 1, 1);
  const p = top.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + Math.pow(Math.abs(p.getX(i)) / 3.7, 3) * 0.45);
  top.computeVertexNormals();
  g.add(new THREE.Mesh(top.translate(0, 6.3, 0), black));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.3, 0.5).translate(0, 5.9, 0), red));
  g.position.set(-9, 0, -17);
  g.rotation.y = 0.35;
  return g;
}

/** A cherry tree: a twisting trunk and branches, with clouds of blossom at their ends. */
function makeCherryTree(x: number, z: number, scale: number) {
  const g = new THREE.Group();
  const bark = new THREE.MeshStandardNodeMaterial({ color: '#4a3530', roughness: 0.9 });
  const tips: THREE.Vector3[] = [];
  const trunk = taperedTube([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.3, 1.6, 0.1), new THREE.Vector3(-0.2, 3.2, 0), new THREE.Vector3(0.1, 4.2, 0.2)], (t) => 0.38 * (1 - t) + 0.12, 20, 8);
  const parts: THREE.BufferGeometry[] = [trunk];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rand(-0.3, 0.3);
    const len = rand(1.6, 2.6);
    const start = new THREE.Vector3(0, rand(2.6, 4), 0);
    const end = start.clone().add(new THREE.Vector3(Math.cos(a) * len, rand(0.6, 1.6), Math.sin(a) * len));
    const mid = start.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 0.4, 0));
    parts.push(taperedTube([start, mid, end], (t) => 0.13 * (1 - t) + 0.04, 10, 6));
    tips.push(end);
  }
  tips.push(new THREE.Vector3(0.1, 4.6, 0.2));
  g.add(new THREE.Mesh(mergeGeometries(parts)!, bark));
  // blossom clouds: clusters of pink puffs around each branch tip
  const blossom = new THREE.MeshStandardNodeMaterial({ roughness: 0.8, flatShading: true });
  blossom.colorNode = mix(rgb('#f6b3c6'), rgb('#ffe1ea'), mx_noise_float(positionWorld.mul(2)).mul(0.5).add(0.5));
  blossom.emissiveNode = rgb('#ffb3c8').mul(0.12);
  const puffs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), blossom, tips.length * 7);
  const m = new THREE.Matrix4();
  let k = 0;
  for (const tip of tips) {
    for (let j = 0; j < 7; j++) {
      const s = rand(0.45, 0.8);
      m.compose(tip.clone().add(new THREE.Vector3(rand(-0.7, 0.7), rand(-0.3, 0.5), rand(-0.7, 0.7))), new THREE.Quaternion(), new THREE.Vector3(s, s * 0.85, s));
      puffs.setMatrixAt(k++, m);
    }
  }
  g.add(puffs);
  g.position.set(x, 0, z);
  g.scale.setScalar(scale);
  return g;
}

/** A stone lantern (tōrō) with a warm light glowing through its window. */
function makeStoneLantern(x: number, z: number) {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardNodeMaterial({ color: '#9a948b', roughness: 0.9 });
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.3, 8).translate(0, 0.15, 0), stone));
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.1, 8).translate(0, 0.85, 0), stone));
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.36, 0.18, 6).translate(0, 1.48, 0), stone));
  const glow = new THREE.MeshBasicNodeMaterial();
  glow.colorNode = rgb('#ffcf8a').mul(sin(time.mul(7).add(x)).mul(0.08).add(1.6));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.5).translate(0, 1.78, 0), glow));
  g.add(new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.42, 6).translate(0, 2.2, 0), stone));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6).translate(0, 2.45, 0), stone));
  const light = new THREE.PointLight('#ffb36b', 3, 7, 1.6);
  light.position.set(0, 1.8, 0.4);
  g.add(light);
  g.position.set(x, 0, z);
  return g;
}

/** A grove of bamboo swaying behind the garden (harder in a gust). */
function makeBamboo(uGust: N) {
  const count = 34;
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.6 });
  const h = positionGeometry.y; // 0..1 along the stalk
  const joint = smoothstep(0.04, 0.0, abs(h.mul(9).fract().sub(0.5)).sub(0.46));
  mat.colorNode = mix(rgb('#6f9a3e'), rgb('#9cbf5a'), mx_noise_float(positionWorld.mul(vec3(2, 0.2, 2))).mul(0.5).add(0.5)).mul(float(1).sub(joint.mul(0.4)));
  // sway: positionLocal includes the instance transform here, so this offset is in world units
  const sway = sin(time.mul(0.9).add(positionWorld.x.mul(0.6)).add(positionWorld.z.mul(0.4))).mul(float(0.35).add(uGust.mul(0.9)));
  mat.positionNode = positionLocal.add((vec3 as any)(sway.mul(h.mul(h)), 0, sway.mul(h.mul(h)).mul(0.4)));
  const stalks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.12, 1, 8).translate(0, 0.5, 0), mat, count);
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const height = rand(9, 15);
    m.compose(new THREE.Vector3(rand(10, 19), 0, rand(-26, -13)), new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(-0.05, 0.05), 0, rand(-0.06, 0.06))), new THREE.Vector3(1, height, 1));
    stalks.setMatrixAt(i, m);
  }
  return stalks;
}

export interface ZenScene extends ThemeScene {
  /** Rings spread across the pond. */
  ripple(): void;
  /** A gust: the bamboo bends and petals fly. */
  gust(seconds: number): void;
}

// ------------------------------------------------------------------ theme

export const zen: Theme<ZenScene> = {
  ...meta,
  wheel: {
    palette: PALETTE,
    font: `"${meta.font.family}"`,
    fontWeight: meta.font.weight,
    rim: ['#7fa34a', '#a8c46a'],
    holo: 0,
    flapper: '#7fa34a',
    leds: ['#ffe1b0', '#ffc6d6'],
    hub: ['#c8553d', '#e9d7c0'],
    pegs: '#a69c8c',
    frame: '#2e3b2f',
    rimFinish: 'bamboo',
    pins: 'pebbles',
    pointer: 'leaf',
  },
  post: { bloom: [0.3, 0.45, 0.9], exposure: 0.95, aberration: 0.5, vignette: 0.5 },
  character: { spot: [0, 0.22, 1.6], entrance: 'rise' },
  tick: 'marimba',
  song: {
    bpm: 84,
    root: 62,
    scale: SCALES.pentatonic,
    progressions: [
      [0, 2, 3, 1],
      [0, 3, 4, 2],
      [3, 2, 1, 0],
    ],
    lead: 'triangle',
    bass: 'sine',
    drums: 'half',
    density: 0.4,
    arp: true,
    brightness: 3200,
  },

  createScene({ scene, center }) {
    const group = new THREE.Group();
    scene.backgroundNode = sky();
    scene.fogNode = fog(rgb('#e8c6d0'), rangeFogFactor(30, 115));
    scene.environmentIntensity = 0.35;

    const uRipple = uniform(-1);
    const uGust = uniform(0);
    group.add(makeGround(), makeRocks(), makePond(uRipple), makeTorii(), makeBamboo(uGust));
    group.add(makeCherryTree(-12.5, -7, 1.1), makeCherryTree(12, -4.5, 1), makeCherryTree(4, -23, 1.3), makeCherryTree(-18, -24, 1.2));
    group.add(makeStoneLantern(-5.6, 1.4), makeStoneLantern(9.2, -3.5));
    const koi = makeKoi();
    for (const k of koi) group.add(k.fish);

    // a low stand of dark wood on a round of stone
    const wood = new THREE.MeshStandardNodeMaterial({ color: '#3b2a24', roughness: 0.7 });
    const stone = new THREE.MeshStandardNodeMaterial({ color: '#a9a39a', roughness: 0.9 });
    group.add(makeStand(center, { legs: wood, plinth: stone, neon: rgb('#ffc6d6').mul(float(0.9).add(uSpeed.mul(0.05)).add(uWin.mul(2))) }));

    // blossom drifting down all the time
    const sprites = atlas();
    const petals = new Particles({
      count: 200,
      atlas: sprites,
      cells: [0],
      loop: true,
      mode: 'tumble',
      tint: 1,
      colors: ['#f6b3c6', '#ffd6e0', '#ffffff'],
      emitters: [{ at: [0, 9, -6], box: [16, 2, 10], dir: [0.3, -1, 0], spread: 0.4, speed: [0.2, 0.6] }],
      size: [0.07, 0.12],
      gravity: [0.25, -0.35, 0],
      drag: 1.4,
      life: [9, 13],
      spin: 1.5,
      wobble: 0.8,
    });
    const flurry = new Particles({
      count: 260,
      atlas: sprites,
      cells: [0],
      mode: 'tumble',
      tint: 1,
      colors: ['#f6b3c6', '#ffd6e0', '#ffffff'],
      mirror: false,
      emitters: [{ at: [-14, 4, -4], box: [2, 3, 6], dir: [1, 0.15, 0.1], spread: 0.3, speed: [5, 8], delay: [0, 1.5] }],
      size: [0.08, 0.13],
      gravity: [0, -0.5, 0],
      drag: 0.5,
      life: [4, 5.5],
      spin: 3,
      wobble: 0.6,
    });
    group.add(petals.object, flurry.object);

    // idle moments: a heron glides over, a koi stirs the pond, a breeze through the bamboo
    const moments = idleMoments([8, 16]);
    const heron = moments.track(flyby({ atlas: sprites, cells: [3], count: 1, from: [-32, 9, -24], speed: [3.6, 4.2], life: 16, size: [1.8, 1.8], wobble: 0.6, stagger: 0 }));
    group.add(heron.object);
    let gustLeft = 0;
    const ripple = () => (uRipple.value = 0);
    const gust = (seconds: number) => {
      gustLeft = Math.max(gustLeft, seconds);
      flurry.fire();
    };
    moments.add(() => heron.fire());
    moments.add(ripple);
    moments.add(() => gust(3));

    const lights = makeLights(group, ['#ffd9cc', 1.4], []);
    group.add(new THREE.HemisphereLight('#c9c0ee', '#b9a98c', 0.75));

    return {
      group,
      moments,
      ripple,
      gust,
      update(f) {
        lights(f.speed, f.win);
        moments.update(f);
        petals.update(f.time);
        flurry.update(f.time);
        if (uRipple.value >= 0) uRipple.value = uRipple.value > 4 ? -1 : uRipple.value + f.dt;
        gustLeft = Math.max(0, gustLeft - f.dt);
        uGust.value += ((gustLeft > 0 ? 1 : 0) - uGust.value) * (1 - Math.exp(-f.dt * 1.5));
        for (const k of koi) {
          k.a += k.speed * f.dt * (1 + f.speed * 0.02);
          k.fish.position.set(POND.x + Math.cos(k.a) * k.r, 0.035, POND.z + Math.sin(k.a) * k.r * 0.85);
          // face the way it's swimming (the model points +X), with a lazy wag
          const dx = -Math.sin(k.a) * k.speed;
          const dz = Math.cos(k.a) * 0.85 * k.speed;
          k.fish.rotation.y = Math.atan2(-dz, dx) + Math.sin(f.time * 4 + k.r * 7) * 0.15;
        }
      },
    };
  },

  celebrations,
};
