import * as THREE from 'three/webgpu';
import {
  abs,
  exp,
  float,
  floor,
  fog,
  hash,
  length,
  max,
  mix,
  mx_fractal_noise_float,
  mx_noise_float,
  normalGeometry,
  positionGeometry,
  positionWorld,
  pow,
  rangeFogFactor,
  screenSize,
  screenUV,
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
import { starField } from '../../fx/nodes';
import { Particles } from '../../fx/Particles';
import { uSpeed, uWin } from '../../engine/globals';
import { SCALES } from '../../audio/ChipSynth';
import { meta, PALETTE } from './meta';
import { rand, inst } from '../../fx/util';
import { atlas } from './sprites';
import { idleMoments, pickInView, shootingStar } from '../../fx/ambient';
import { celebrations } from './celebrations';

const HAZE = '#1d2c4d';

// ------------------------------------------------------------------ world

function sky(uAurora: any, uPhase: any) {
  const uvS = screenUV; // y grows downward
  const aspect = screenSize.x.div(screenSize.y);
  const p = vec2(uvS.x.mul(aspect), uvS.y);
  let col: any = mix(rgb('#02040d'), rgb('#0c1a3a'), smoothstep(0.0, 0.7, uvS.y));
  col = mix(col, rgb('#1d2c4d'), smoothstep(0.55, 0.85, uvS.y));
  col = col.add(vec3(starField(0.996, 2.5, 1.3)).mul(float(1).sub(smoothstep(0.35, 0.65, uvS.y))));

  // aurora: two wavering curtains with vertical streaks
  const curtain = (offset: number, height: number, tint: any) => {
    const wave = mx_noise_float(vec3(p.x.mul(0.9).add(offset), uPhase.mul(0.06), offset)).mul(0.13);
    const centre = float(height).add(wave);
    const band = exp(uvS.y.sub(centre).mul(7).pow(2).negate());
    // light hangs below the curtain's top edge
    const below = smoothstep(centre.sub(0.12), centre, uvS.y);
    const streaks = pow(mx_noise_float(vec3(p.x.mul(16), uPhase.mul(0.25), offset + 3)).mul(0.5).add(0.5), 2.5);
    return tint.mul(band.mul(below.mul(0.6).add(0.4))).mul(streaks.mul(1.5).add(0.25));
  };
  const hue = sin(p.x.mul(1.8).add(uPhase.mul(0.1))).mul(0.5).add(0.5);
  const green = mix(rgb('#29ff9a'), rgb('#2fe0ff'), hue);
  const fringe = mix(rgb('#b04dff'), rgb('#ff4dc4'), hue);
  const aurora = curtain(0, 0.24, green).add(curtain(4.2, 0.16, fringe).mul(0.6));
  return col.add(aurora.mul(float(0.55).add(uAurora.mul(1.6))));
}

function makeSnowField() {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.9 });
  const xz = positionWorld.xz;
  const dunes = mx_fractal_noise_float(vec3(xz.mul(0.25), 0), 3, 2, 0.5).mul(0.5).add(0.5);
  mat.colorNode = mix(rgb('#a9bde0'), rgb('#eef5ff'), dunes);
  // ice-crystal glints
  const cell = floor(xz.mul(22));
  const glint = step(0.993, hash(cell.x.add(cell.y.mul(733)))).mul(sin(time.mul(3).add(hash(cell.y.add(cell.x.mul(37))).mul(40))).mul(0.5).add(0.5));
  mat.emissiveNode = vec3(glint.mul(1.6)).mul(float(1).sub(smoothstep(8, 26, length(xz))));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), mat);
  ground.rotation.x = -Math.PI / 2;
  return ground;
}

function makeDrifts() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardNodeMaterial({ color: '#dfe9fb', roughness: 0.95 });
  for (let i = 0; i < 12; i++) {
    const drift = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    // keep drifts behind and beside the stage so nothing hides the snowmen
    const a = rand(Math.PI * 1.05, Math.PI * 1.95);
    const d = rand(13, 32);
    drift.position.set(Math.cos(a) * d, 0, Math.sin(a) * d - 4);
    drift.scale.set(rand(2, 6), rand(0.6, 1.8), rand(2, 5));
    g.add(drift);
  }
  return g;
}

/** Snow-dusted pines (instanced) with a few warm fairy lights on the nearer ones. */
function makePines(uTwinkle: any) {
  const tiers: THREE.BufferGeometry[] = [];
  for (const [y, r, h] of [
    [0.9, 1.3, 1.8],
    [1.9, 1.0, 1.5],
    [2.8, 0.7, 1.2],
  ] as const) {
    tiers.push(new THREE.ConeGeometry(r, h, 10, 1).translate(0, y + h / 2 - 0.2, 0).toNonIndexed());
  }
  const trunk = new THREE.CylinderGeometry(0.15, 0.2, 1, 8).translate(0, 0.5, 0).toNonIndexed();
  const all = [...tiers, trunk];
  all.forEach((g) => g.deleteAttribute('uv'));
  const geo = mergeGeometries(all)!;

  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, flatShading: true });
  // snow settles on upward-facing faces; the trunk stays bark-brown
  const snow = smoothstep(0.35, 0.65, normalGeometry.y.add(mx_noise_float(positionGeometry.mul(3)).mul(0.25)));
  const isTrunk = step(positionGeometry.y, 0.75);
  mat.colorNode = mix(mix(rgb('#1f4d3a'), rgb('#f2f6ff'), snow), rgb('#4a3020'), isTrunk);

  const spots: THREE.Vector3[] = [];
  while (spots.length < 34) {
    const x = rand(-26, 26);
    const z = rand(-34, 2);
    if (Math.abs(x) < 6 && z > -9) continue;
    spots.push(new THREE.Vector3(x, 0, z));
  }
  const pines = new THREE.InstancedMesh(geo, mat, spots.length);
  const m = new THREE.Matrix4();
  const lights: number[] = [];
  spots.forEach((p, i) => {
    const s = rand(0.9, 1.9);
    m.compose(p, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand(0, 6.28)), new THREE.Vector3(s, s * rand(0.9, 1.25), s));
    pines.setMatrixAt(i, m);
    if (p.z > -16) {
      // a spiral of bulbs around the nearer trees
      for (let k = 0; k < 10; k++) {
        const t = k / 10;
        const y = (0.9 + t * 2.6) * s;
        const r = (1.25 - t * 0.85) * s;
        const a = t * Math.PI * 5 + i;
        lights.push(p.x + Math.cos(a) * r, y, p.z + Math.sin(a) * r);
      }
    }
  });

  const count = lights.length / 3;
  const phase = new Float32Array(count).map(() => Math.random());
  const bulbMat = new THREE.MeshBasicNodeMaterial();
  const aPhase = inst(phase, 1, 'float');
  const twinkle = sin(time.mul(float(2).add(uTwinkle.mul(6))).add(aPhase.mul(40))).mul(0.5).add(0.5);
  const colour = mix(rgb('#ffb347'), rgb('#ff4d6d'), step(0.66, aPhase)).mul(step(aPhase, 0.9)).add(rgb('#7fdbff').mul(step(0.9, aPhase)));
  bulbMat.colorNode = colour.mul(twinkle.mul(2.5).add(0.6).add(uWin.mul(2)));
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 8, 6), bulbMat, count);
  for (let i = 0; i < count; i++) bulbs.setMatrixAt(i, m.makeTranslation(lights[i * 3], lights[i * 3 + 1], lights[i * 3 + 2]));

  const g = new THREE.Group();
  g.add(pines, bulbs);
  return g;
}

/** An original snowman: three snowballs, coal eyes and buttons, carrot nose, stick arms, scarf. */
function makeSnowman() {
  const g = new THREE.Group();
  const snow = new THREE.MeshStandardNodeMaterial({ color: '#f4f8ff', roughness: 0.9 });
  const coal = new THREE.MeshStandardNodeMaterial({ color: '#16161c', roughness: 0.6 });
  const carrot = new THREE.MeshStandardNodeMaterial({ color: '#ff7a1a', roughness: 0.6 });
  const wood = new THREE.MeshStandardNodeMaterial({ color: '#4a3020', roughness: 1 });
  const scarf = new THREE.MeshStandardNodeMaterial({ roughness: 0.8 });
  scarf.colorNode = mix(rgb('#d62839'), rgb('#f4f8ff'), step(0.5, abs(sin(positionGeometry.x.mul(30)))));
  const balls = [
    [0.75, 0.6],
    [0.55, 1.62],
    [0.4, 2.35],
  ] as const;
  for (const [r, y] of balls) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), snow);
    b.position.y = y;
    g.add(b);
  }
  for (const x of [-0.14, 0.14]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), coal);
    eye.position.set(x, 2.45, 0.34);
    g.add(eye);
  }
  for (const y of [1.45, 1.65, 1.85]) {
    const button = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), coal);
    button.position.set(0, y, 0.53);
    g.add(button);
  }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.38, 10).rotateX(Math.PI / 2), carrot);
  nose.position.set(0, 2.34, 0.55);
  g.add(nose);
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.1, 6), wood);
    arm.position.set(s * 0.9, 1.85, 0);
    arm.rotation.z = s * -1.0;
    g.add(arm);
  }
  const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.09, 8, 24).rotateX(Math.PI / 2), scarf);
  wrap.position.y = 2.05;
  g.add(wrap);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.06), scarf);
  tail.position.set(0.22, 1.8, 0.42);
  tail.rotation.z = 0.2;
  g.add(tail);
  return g;
}

export interface WinterScene extends ThemeScene {
  /** The northern lights flare up and race. */
  aurora(amount: number): void;
  /** Whiteout: fog closes in for a few seconds. */
  storm(seconds: number): void;
}

// ------------------------------------------------------------------ theme

export const winter: Theme<WinterScene> = {
  ...meta,
  wheel: {
    palette: PALETTE,
    font: `"${meta.font.family}"`,
    fontWeight: meta.font.weight,
    rim: ['#e8f4ff', '#4cc9f0'],
    holo: 0.35,
    flapper: '#d62839',
    leds: ['#ffb347', '#7fdbff'],
    hub: ['#7fdbff', '#e8f4ff'],
    pegs: '#ffd23f',
    frame: '#16233f',
    wreath: { berries: '#d62839' },
    stringLights: ['#ff3b3b', '#2ecc71', '#3b82ff', '#ffd23f', '#ff8c1a'],
    pins: 'baubles',
    pointer: 'icicle',
  },
  post: { bloom: [0.5, 0.5, 0.9], exposure: 0.93, aberration: 0.8, vignette: 0.6 },
  character: { spot: [0, 0.22, 1.6], entrance: 'pop' },
  tick: 'jingle',
  song: {
    bpm: 126,
    root: 62,
    scale: SCALES.major,
    progressions: [
      [0, 4, 5, 3],
      [0, 3, 4, 0],
      [5, 3, 0, 4],
    ],
    lead: 'triangle',
    bass: 'sine',
    drums: 'shuffle',
    density: 0.55,
    arp: true,
    brightness: 4200,
  },

  createScene({ scene, center, camera }) {
    const group = new THREE.Group();
    const uAurora = uniform(0);
    const uPhase = uniform(0);
    const uStorm = uniform(0);
    scene.backgroundNode = sky(uAurora, uPhase);
    // the whiteout pulls the fog in close and brightens it
    scene.fogNode = fog(mix(rgb(HAZE), rgb('#c9d8f0'), uStorm), rangeFogFactor(mix(float(18), float(2), uStorm), mix(float(85), float(22), uStorm)));
    scene.environmentIntensity = 0.35;

    group.add(makeSnowField(), makeDrifts(), makePines(uAurora));
    const snowmen: THREE.Object3D[] = [];
    for (const [x, z, ry, s] of [
      [-4.4, 2.4, 0.45, 0.85],
      [4.7, 1.6, -0.5, 0.75],
    ] as const) {
      const snowman = makeSnowman();
      snowman.position.set(x, 0, z);
      snowman.rotation.y = ry;
      snowman.scale.setScalar(s);
      group.add(snowman);
      snowmen.push(snowman);
    }

    const ice = new THREE.MeshPhysicalNodeMaterial({ color: '#bfe6ff', roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 });
    ice.emissiveNode = rgb('#4cc9f0').mul(float(0.15).add(uWin.mul(0.6)));
    const snowPlinth = new THREE.MeshStandardNodeMaterial({ color: '#eef5ff', roughness: 0.9 });
    group.add(
      makeStand(center, {
        legs: ice,
        plinth: snowPlinth,
        neon: rgb('#7fdbff').mul(sin(time.mul(1.4)).mul(0.4).add(1.5).add(uSpeed.mul(0.06)).add(uWin.mul(2.5))),
      }),
    );

    const sprites = atlas();
    const snowfall = new Particles({
      count: 450,
      atlas: sprites,
      cells: [3],
      loop: true,
      mode: 'face',
      blend: 'additive',
      intensity: 1.1,
      emitters: [{ at: [0, 9, -4], box: [18, 4, 12], dir: [0, -1, 0], spread: 0.2, speed: [0.2, 0.6] }],
      size: [0.05, 0.12],
      gravity: [0.15, -0.6, 0],
      drag: 1.2,
      life: [8, 12],
      wobble: 0.45,
      colors: ['#ffffff', '#e3eeff'],
    });
    group.add(snowfall.object);

    // idle moments: a shooting star over the aurora, a snowman wobbles, a gust of snow
    const moments = idleMoments();
    const star = moments.track(shootingStar({ colors: ['#ffffff', '#c9fff0'] }));
    const gust = moments.track(
      new Particles({
        count: 140,
        atlas: sprites,
        cells: [0],
        mode: 'face',
        blend: 'additive',
        intensity: 1.1,
        emitters: [{ at: [-16, 0.6, 3], box: [1, 0.5, 4], dir: [1, 0.12, 0], spread: 0.2, speed: [7, 11], delay: [0, 1.2] }],
        size: [0.04, 0.1],
        gravity: [0, -0.3, 0],
        drag: 0.3,
        life: [2, 3],
        wobble: 0.5,
        colors: ['#ffffff', '#e3eeff'],
      }),
    );
    group.add(star.object, gust.object);
    let wobble: { m: THREE.Object3D; t: number } | null = null;
    moments.add(() => star.fire());
    moments.add(() => gust.fire());
    moments.add(() => {
      const m = pickInView(camera, snowmen, (s, out) => s.getWorldPosition(out).setY(1));
      if (m) wobble = { m, t: 0 };
    });

    const boost = makeLights(group, ['#cfe3ff', 1.0], [
      ['#ffb36b', 10, [-6, 4, 4]],
      ['#7fdbff', 12, [6, 5, 3]],
    ]);

    let stormLeft = 0;
    return {
      group,
      moments,
      aurora(amount) {
        uAurora.value = Math.max(uAurora.value, amount);
      },
      storm(seconds) {
        stormLeft = Math.max(stormLeft, seconds);
      },
      update(f) {
        boost(f.speed, f.win);
        moments.update(f);
        if (wobble) {
          wobble.t = Math.min(1, wobble.t + f.dt / 1.4);
          wobble.m.rotation.z = Math.sin(wobble.t * 20) * 0.1 * (1 - wobble.t);
          if (wobble.t >= 1) wobble = null;
        }
        snowfall.update(f.time);
        uPhase.value += f.dt * (1 + uAurora.value * 5 + f.speed * 0.05);
        uAurora.value *= Math.exp(-f.dt * 0.6);
        stormLeft = Math.max(0, stormLeft - f.dt);
        const target = stormLeft > 0 ? 1 : 0;
        uStorm.value += (target - uStorm.value) * (1 - Math.exp(-f.dt * (target ? 3 : 1.2)));
      },
    };
  },

  celebrations,
};
