import * as THREE from 'three/webgpu';
import {
  exp,
  float,
  floor,
  fog,
  fract,
  Fn,
  hash,
  length,
  mix,
  mx_fractal_noise_float,
  positionWorld,
  rangeFogFactor,
  screenSize,
  screenUV,
  sin,
  smoothstep,
  step,
  texture,
  time,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Theme, ThemeScene } from '../types';
import { makeFloor, makeLights, makeStand, rgb } from '../shared';
import { lowRes } from '../../fx/nodes';
import { Particles } from '../../fx/Particles';
import { uCalm, uSpeed, uWin } from '../../engine/globals';
import { SCALES } from '../../audio/ChipSynth';
import { meta, PALETTE } from './meta';
import { rand } from '../../fx/util';
import { atlas } from './sprites';
import { idleMoments } from '../../fx/ambient';
import { SIGNS } from './layout';
import { celebrations } from './celebrations';
import { motion, strike } from '../../engine/motion';

type N = any;

/** The roof's back edge; beyond it the city drops away. */
const EDGE_Z = -9;

// ------------------------------------------------------------------ sky & city

function sky(uLightning: N) {
  const night = Fn(() => {
    const uvS = screenUV; // y grows downward
    const p = vec2(uvS.x.mul(screenSize.x.div(screenSize.y)), uvS.y);
    let col: N = mix(rgb('#07061a'), rgb('#2a1240'), smoothstep(0.0, 0.5, uvS.y));
    col = mix(col, rgb('#a0306a'), smoothstep(0.4, 0.68, uvS.y).mul(0.55)); // the city's glow on low cloud
    const clouds = mx_fractal_noise_float(vec3(p.mul(vec2(1, 3)).add(vec2(time.mul(0.01), 0)), 0), 3, 2, 0.5).mul(0.5).add(0.5);
    col = col.add(rgb('#3a2a5e').mul(clouds.mul(0.35)));
    return vec4(col.add(rgb('#c9d6ff').mul(clouds.mul(uLightning).mul(1.4))), 1);
  });
  return lowRes(night()).rgb;
}

/** Towers all around, with lit windows and the odd neon crown. */
function makeSkyline(uLightning: N) {
  const mat = new THREE.MeshBasicNodeMaterial();
  const p = positionWorld;
  // windows on every face: a grid in (x+z, y), some lit warm, some cool, most dark
  const grid = vec2(p.x.add(p.z).mul(2.2), p.y.mul(1.7));
  const cell = floor(grid);
  const inWindow = step(0.3, fract(grid.x)).mul(step(0.35, fract(grid.y)));
  const h = hash(cell.dot(vec2(1, 57)));
  const lit = step(0.7, h);
  const windowCol = mix(rgb('#ffcf8a'), rgb('#9fd8ff'), step(0.85, h)).mul(lit).mul(inWindow).mul(0.9);
  // a neon band near the top of some towers
  const band = step(0.5, hash(floor(p.x.mul(0.05)).add(floor(p.z.mul(0.05)).mul(7)))).mul(smoothstep(0.4, 0, fract(p.y.mul(0.04)).sub(0.9).abs()));
  mat.colorNode = rgb('#0c0b1e').add(windowCol).add(mix(rgb('#ff2a6d'), rgb('#05d9e8'), hash(floor(p.x.mul(0.1)))).mul(band.mul(0.6))).add(vec3(uLightning.mul(0.15)));
  const count = 70;
  const towers = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), mat, count);
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const a = rand(-Math.PI * 0.95, -Math.PI * 0.05);
    const r = rand(32, 95);
    const w = rand(6, 14);
    const h2 = rand(18, 60);
    m.compose(new THREE.Vector3(Math.cos(a) * r, -30, Math.sin(a) * r - 5), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand(0, 0.5)), new THREE.Vector3(w, h2 + 30, rand(6, 14)));
    towers.setMatrixAt(i, m);
  }
  return towers;
}

/** A big holographic screen on a tower: scrolling bands of colour, flickering scan lines. */
function makeBillboard(uOverload: N) {
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const u = uv();
  const bands = sin(u.y.mul(10).sub(time.mul(1.6)).add(sin(u.x.mul(5).add(time)).mul(1.4))).mul(0.5).add(0.5);
  const scan = sin(u.y.mul(220)).mul(0.5).add(0.5).mul(0.35).add(0.65);
  const glitch = step(0.97, hash(floor(time.mul(8)))).mul(0.6);
  mat.colorNode = mix(rgb('#7b2cff'), rgb('#05d9e8'), bands).mul(scan).mul(float(1.2).add(glitch).add(uOverload.mul(2)));
  mat.opacityNode = float(0.9);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(14, 8), mat);
  screen.position.set(16, 10, -34);
  screen.rotation.y = -0.35;
  return screen;
}

// ------------------------------------------------------------------ rooftop

function signTexture(text: string, vertical: boolean) {
  const c = document.createElement('canvas');
  c.width = vertical ? 160 : 640;
  c.height = vertical ? 640 : 160;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.font = '700 110px "Audiowide", "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (vertical) [...text].forEach((ch, i, all) => ctx.fillText(ch, 80, ((i + 0.5) / all.length) * 640, 140));
  else ctx.fillText(text, 320, 86, 600);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The neon signs: glowing letters on dark boxes, each with its own flicker (uSigns[i] 0..1). */
function makeSigns(uSigns: N[], uOverload: N) {
  const g = new THREE.Group();
  const box = new THREE.MeshStandardNodeMaterial({ color: '#141225', metalness: 0.6, roughness: 0.4 });
  SIGNS.forEach(([x, y, z, w, h, text, color], i) => {
    const vertical = h > w;
    const glow = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const ink = texture(signTexture(text, vertical), uv()).a;
    // overload: the colours cycle and strobe
    // (a slow colour cycle instead when the viewer asked for reduced motion)
    const strobe = mix(step(0.5, fract(time.mul(9).add(i * 0.3))), sin(time.mul(1.5).add(i)).mul(0.5).add(0.5), uCalm);
    const tint = mix(rgb(color), mix(rgb('#ff2a6d'), rgb('#05d9e8'), strobe), uOverload);
    glow.colorNode = tint.mul(ink).mul(uSigns[i].mul(2.4).add(uOverload.mul(strobe).mul(2)));
    const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.25, h + 0.25, 0.25), box);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glow);
    face.position.z = 0.14;
    const sign = new THREE.Group();
    sign.add(back, face);
    sign.position.set(x, y, z);
    sign.lookAt(0, y, 14); // turned toward the stage and camera
    g.add(sign);
  });
  return g;
}

function makeRooftop() {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardNodeMaterial({ color: '#2b2b38', metalness: 0.7, roughness: 0.4 });
  // railing along the sides and the back edge
  const rails: THREE.BufferGeometry[] = [];
  for (let x = -9; x <= 9; x += 1.5) rails.push(new THREE.BoxGeometry(0.07, 1.1, 0.07).translate(x, 0.55, EDGE_Z));
  rails.push(new THREE.BoxGeometry(18.2, 0.07, 0.07).translate(0, 1.1, EDGE_Z), new THREE.BoxGeometry(18.2, 0.06, 0.06).translate(0, 0.6, EDGE_Z));
  for (const s of [-1, 1]) {
    for (let z = EDGE_Z; z <= 4; z += 1.5) rails.push(new THREE.BoxGeometry(0.07, 1.1, 0.07).translate(s * 9.1, 0.55, z));
    rails.push(new THREE.BoxGeometry(0.07, 0.07, 13.2).translate(s * 9.1, 1.1, EDGE_Z + 6.5));
  }
  g.add(new THREE.Mesh(mergeGeometries(rails)!, metal));
  // AC units with spinning fans
  const fans: THREE.Mesh[] = [];
  const unitMat = new THREE.MeshStandardNodeMaterial({ color: '#8a8f99', metalness: 0.5, roughness: 0.5 });
  for (const [x, z] of [
    [-6.4, -6.8],
    [6.6, -7.2],
    [7.6, 0.8],
  ]) {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1.6, 1, 1.2).translate(x, 0.5, z), unitMat));
    const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 6), new THREE.MeshStandardNodeMaterial({ color: '#2a2a33', metalness: 0.6, roughness: 0.4 }));
    fan.position.set(x, 1.03, z);
    g.add(fan);
    fans.push(fan);
  }
  // water tank on stilts
  for (const [x, z] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3, 6).translate(x * 0.9 - 7.2, 1.5, z * 0.9 - 6.2), metal));
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 2.2, 16).translate(-7.2, 4.1, -6.2), new THREE.MeshStandardNodeMaterial({ color: '#5a5f6a', metalness: 0.5, roughness: 0.6 })));
  return { group: g, fans };
}

export interface CityScene extends ThemeScene {
  /** All the signs strobe and cycle colours for a while. */
  overload(seconds: number): void;
  /** Lightning lights up the clouds and the towers. */
  lightning(strength?: number): void;
  /** Rain lashes down harder for a while (more ripples on the roof). */
  downpour(seconds: number): void;
}

// ------------------------------------------------------------------ theme

export const neotokyo: Theme<CityScene> = {
  ...meta,
  wheel: {
    palette: PALETTE,
    font: `"${meta.font.family}"`,
    fontWeight: meta.font.weight,
    rim: ['#ff2a6d', '#05d9e8'],
    holo: 0.3,
    flapper: '#ff2a6d',
    leds: ['#05d9e8', '#ff2a6d'],
    hub: ['#05d9e8', '#ff2a6d'],
    pegs: '#d1f7ff',
    frame: '#0d0b1a',
    neonRim: { a: '#ff2a6d', b: '#05d9e8' },
  },
  post: { bloom: [0.75, 0.5, 0.7], exposure: 1, aberration: 1.1, vignette: 0.7 },
  character: { spot: [0, 0.22, 1.6], entrance: 'teleport' },
  tick: 'blip',
  song: {
    bpm: 124,
    root: 57,
    scale: SCALES.minor,
    progressions: [
      [0, 5, 3, 6],
      [0, 3, 6, 4],
      [5, 6, 0, 0],
    ],
    lead: 'sawtooth',
    bass: 'square',
    drums: 'four',
    density: 0.6,
    arp: true,
    brightness: 4200,
  },

  createScene({ scene, center }) {
    const group = new THREE.Group();
    const uLightning = uniform(0);
    const uOverload = uniform(0);
    const uRain = uniform(1); // ripple density on the roof
    const uSigns = SIGNS.map(() => uniform(1));
    scene.backgroundNode = sky(uLightning);
    scene.fogNode = fog(rgb('#2a1838'), rangeFogFactor(35, 120));
    scene.environmentIntensity = 0.3;

    // the wet roof: a mirror for the neon, raindrops ringing all over it
    group.add(
      makeFloor({
        base: vec3(0.02, 0.02, 0.04),
        reflect: 0.5,
        fade: [20, 55],
        pattern: (xz: N) => {
          const g: N = fract(xz.mul(0.5));
          const edge = g.min(g.oneMinus()); // distance to the nearest tile seam
          const tile = smoothstep(0.03, 0.0, edge.x.min(edge.y)).mul(0.03);
          const cell: N = floor(xz.mul(1.6));
          const local: N = fract(xz.mul(1.6)).sub(0.5);
          const h = hash(cell.dot(vec2(1, 57)));
          const t = fract(time.mul(0.9).add(h.mul(7)));
          const ring = exp(length(local).sub(t.mul(0.45)).mul(28).pow(2).negate()).mul(float(1).sub(t)).mul(step(h, uRain.mul(0.35)));
          return vec3(tile).add(rgb('#9fb8ff').mul(ring.mul(0.5)));
        },
      }),
    );
    group.add(makeSkyline(uLightning), makeBillboard(uOverload), makeSigns(uSigns, uOverload));
    const roof = makeRooftop();
    group.add(roof.group);

    const steel = new THREE.MeshStandardNodeMaterial({ color: '#2a2838', metalness: 0.9, roughness: 0.25 });
    group.add(makeStand(center, { legs: steel, neon: mix(rgb('#ff2a6d'), rgb('#05d9e8'), sin(time.mul(1.3)).mul(0.5).add(0.5)).mul(float(2).add(uSpeed.mul(0.08)).add(uWin.mul(2.5))) }));

    const sprites = atlas();
    // rain, in long thin streaks
    const rain = new Particles({
      count: 900,
      atlas: sprites,
      cells: [0],
      loop: true,
      mode: 'stretch',
      stretch: 0.07,
      blend: 'additive',
      intensity: 0.55,
      colors: ['#bcd4ff', '#e6eeff'],
      emitters: [{ at: [0, 13, -3], box: [16, 1, 12], dir: [-0.12, -1, 0], spread: 0.02, speed: [16, 20] }],
      size: [0.025, 0.035],
      gravity: [0, -4, 0],
      drag: 0.01,
      life: [0.8, 1],
    });
    // flying cars: lanes of head- and tail-light trails across the skyline
    const traffic = new Particles({
      count: 60,
      atlas: sprites,
      cells: [0],
      loop: true,
      mode: 'stretch',
      stretch: 0.25,
      blend: 'additive',
      intensity: 2.2,
      colors: ['#ff4a5a', '#fff2d6', '#ff4a5a'],
      mirror: false,
      emitters: [
        { at: [-70, 9, -40], box: [2, 4, 8], dir: [1, 0, 0], spread: 0.02, speed: [22, 30], weight: 1 },
        { at: [70, 13, -55], box: [2, 4, 8], dir: [-1, 0, 0], spread: 0.02, speed: [22, 30], weight: 1 },
      ],
      size: [0.12, 0.18],
      gravity: [0, 0, 0],
      drag: 0.01,
      life: [5, 6],
    });
    // steam rising from a roof vent
    const steam = new Particles({
      count: 40,
      atlas: sprites,
      cells: [0],
      loop: true,
      mode: 'face',
      blend: 'additive',
      intensity: 0.35,
      colors: ['#c9b6e6'],
      emitters: [{ at: [6.6, 1.1, -7.2], box: [0.3, 0, 0.3], dir: [0, 1, 0], spread: 0.25, speed: [0.6, 1.2] }],
      size: [1, 2],
      gravity: [0.2, 0.3, 0],
      drag: 0.6,
      life: [3, 4.5],
      wobble: 0.4,
    });
    group.add(rain.object, traffic.object, steam.object);

    // ------------------------------------------------ animation state
    let overloadLeft = 0;
    let downpourLeft = 0;
    let flashT = -1;
    let flashAmp = 1;
    const glitches: number[] = SIGNS.map(() => -1);
    const lightning = (strength = 1) => {
      flashT = 0;
      flashAmp = strength;
    };

    // idle moments: a sign glitches out, distant silent lightning, a car flies right past
    const moments = idleMoments();
    const closePass = moments.track(
      new Particles({
        count: 2,
        atlas: sprites,
        cells: [0],
        mode: 'stretch',
        stretch: 0.35,
        blend: 'additive',
        intensity: 3,
        colors: ['#fff2d6', '#ff4a5a'],
        emitters: [{ at: [-30, 6.5, -12], box: [0.4, 0.15, 0.2], dir: [1, 0.02, 0], spread: 0.01, speed: [26, 28] }],
        size: [0.2, 0.26],
        gravity: [0, 0, 0],
        drag: 0.01,
        life: [2.4, 2.4],
      }),
    );
    group.add(closePass.object);
    moments.add(() => (glitches[Math.floor(Math.random() * glitches.length)] = 0));
    moments.add(() => lightning(0.45));
    moments.add(() => closePass.fire());

    const lights = makeLights(group, ['#8a8fff', 0.5], [
      ['#ff2a6d', 10, [-6.5, 4, -2]],
      ['#05d9e8', 10, [7, 3.5, -3]],
    ]);
    group.add(new THREE.HemisphereLight('#3a2a6e', '#120c1e', 0.6));

    return {
      group,
      moments,
      overload(seconds) {
        overloadLeft = Math.max(overloadLeft, seconds);
      },
      lightning,
      downpour(seconds) {
        downpourLeft = Math.max(downpourLeft, seconds);
      },
      update(f) {
        lights(f.speed, f.win);
        moments.update(f);
        rain.update(f.time);
        traffic.update(f.time);
        steam.update(f.time);
        for (const fan of roof.fans) fan.rotation.y += f.dt * 9;

        overloadLeft = Math.max(0, overloadLeft - f.dt);
        uOverload.value += ((overloadLeft > 0 ? 1 : 0) - uOverload.value) * (1 - Math.exp(-f.dt * 8));
        downpourLeft = Math.max(0, downpourLeft - f.dt);
        uRain.value += ((downpourLeft > 0 ? 2.6 : 1) - uRain.value) * (1 - Math.exp(-f.dt * 3));

        // signs: a constant faint buzz, and the odd glitch where one stutters off and back on
        SIGNS.forEach((_, i) => {
          let v = 0.92 + Math.sin(f.time * 50 + i * 2) * 0.04;
          if (glitches[i] >= 0) {
            glitches[i] += f.dt;
            const t = glitches[i];
            // a stuttering glitch, or (reduced motion) just a fade off and back on
            v *= t < 1.2 ? (motion.reduced ? 1 - t / 1.2 : Math.random() < 0.5 ? 0.05 : 1) : t < 2 ? 0.05 : 1;
            if (t > 2.3) glitches[i] = -1;
          }
          uSigns[i].value = v;
        });

        if (flashT >= 0) {
          flashT += f.dt;
          const t = flashT;
          uLightning.value = strike(t) * flashAmp;
          if (t > 1) {
            flashT = -1;
            uLightning.value = 0;
          }
        }
      },
    };
  },

  celebrations,
};
