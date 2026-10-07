import * as THREE from 'three/webgpu';
import {
  float,
  floor,
  fog,
  fract,
  hash,
  mix,
  mx_noise_float,
  positionLocal,
  positionWorld,
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
import { meta, PALETTE } from './meta';
import { inst, rand } from '../../fx/util';
import { atlas } from './sprites';
import { idleMoments } from '../../fx/ambient';
import { COIL_TOPS, JAR, TANK } from './layout';
import { celebrations } from './celebrations';

type N = any;

const BACK_Z = -11;
const SIDE_X = 13;

// ------------------------------------------------------------------ the room

function makeFloor() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.55 });
  const xz = positionWorld.xz;
  const check = step(0.5, fract(floor(xz.x.div(1.2)).add(floor(xz.y.div(1.2))).mul(0.5)));
  const wear = mx_noise_float(vec3(xz.mul(0.5), 0)).mul(0.5).add(0.5);
  m.colorNode = mix(rgb('#1c1a22'), rgb('#cfc6b8'), check).mul(wear.mul(0.25).add(0.7));
  const f = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), m);
  f.rotation.x = -Math.PI / 2;
  f.position.z = -6;
  return f;
}

function brickMat(uFlicker: N) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 });
  // brick courses, every other row offset by half a brick, along whichever axis the wall runs
  const u = positionWorld.x.add(positionWorld.z);
  const row = floor(positionWorld.y.div(0.45));
  const col = floor(u.div(1).add(row.mul(0.5)));
  const mortar = step(0.93, fract(positionWorld.y.div(0.45))).max(step(0.95, fract(u.div(1).add(row.mul(0.5)))));
  const tone = hash(col.add(row.mul(57))).mul(0.25);
  m.colorNode = mix(rgb('#5a3a34').mul(float(0.75).add(tone)), rgb('#2a2426'), mortar).mul(float(1).add(uFlicker.mul(-0.4)));
  return m;
}

function makeWalls(uFlicker: N) {
  const mat = brickMat(uFlicker);
  const g = new THREE.Group();
  const back = new THREE.Mesh(new THREE.PlaneGeometry(SIDE_X * 2, 14), mat);
  back.position.set(0, 7, BACK_Z);
  g.add(back);
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(18, 14), mat);
    side.position.set(s * SIDE_X, 7, BACK_Z + 9);
    side.rotation.y = -s * Math.PI / 2;
    g.add(side);
  }
  return g;
}

function makeChalkboard() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 640;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#1f2e26';
  ctx.fillRect(0, 0, 1024, 640);
  ctx.strokeStyle = '#6b4a2e';
  ctx.lineWidth = 36;
  ctx.strokeRect(0, 0, 1024, 640);
  ctx.fillStyle = 'rgba(240,240,230,0.85)';
  ctx.font = '62px "Bangers", "Comic Sans MS", cursive';
  const lines = ['E = mc²  ·  ω → ∞', '∫ spin dθ = LUCK', 'Σ names / 2π', 'IT’S ALIVE!!!'];
  lines.forEach((t, i) => ctx.fillText(t, 70, 140 + i * 125, 880));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.75), new THREE.MeshStandardNodeMaterial({ map: tex, roughness: 0.9 }));
  board.position.set(-7.5, 5.5, BACK_Z + 0.05);
  return board;
}

/** Shelves of potion bottles, each glowing its own colour. */
function makeShelves() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardNodeMaterial({ color: '#4a3020', roughness: 0.9 });
  const bottles: [number, number, number][] = [];
  for (const y of [3.2, 5.0]) {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.15, 0.8).translate(5.8, y, BACK_Z + 0.4), wood));
    for (let i = 0; i < 9; i++) bottles.push([3 + i * 0.68 + rand(-0.1, 0.1), y + 0.08, BACK_Z + 0.45]);
  }
  const geo = new THREE.LatheGeometry(
    [
      [0.001, 0],
      [0.2, 0.02],
      [0.22, 0.3],
      [0.08, 0.45],
      [0.07, 0.62],
      [0.09, 0.66],
      [0.001, 0.66],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    12,
  );
  const colors = ['#7cff4f', '#b07cff', '#ff8c42', '#2ec4b6', '#ff5d8f'];
  const tint = new Float32Array(bottles.length * 3);
  const c = new THREE.Color();
  bottles.forEach((_, i) => tint.set(c.set(colors[i % colors.length]).toArray(), i * 3));
  const glass = new THREE.MeshStandardNodeMaterial({ roughness: 0.15, metalness: 0.1 });
  // each bottle glows its own colour, pulsing gently
  const aTint = inst(tint, 3, 'vec3');
  glass.colorNode = aTint.mul(0.3);
  glass.emissiveNode = aTint.mul(sin(time.mul(1.5).add(positionWorld.x.mul(3))).mul(0.25).add(0.75));
  const mesh = new THREE.InstancedMesh(geo, glass, bottles.length);
  const m = new THREE.Matrix4();
  bottles.forEach(([x, y, z], i) => mesh.setMatrixAt(i, m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(1, rand(0.8, 1.3), 1))));
  g.add(mesh);
  return g;
}

/** A Tesla coil: base, copper winding, chrome toroid on top. */
function makeCoil(top: THREE.Vector3) {
  const g = new THREE.Group();
  const base = new THREE.MeshStandardNodeMaterial({ color: '#2a2a33', metalness: 0.6, roughness: 0.4 });
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.7, 20).translate(0, 0.35, 0), base));
  const copper = new THREE.MeshStandardNodeMaterial({ metalness: 0.8, roughness: 0.35 });
  copper.colorNode = mix(rgb('#b8743a'), rgb('#e0a060'), step(0.5, fract(positionLocal.y.mul(18))));
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 3.4, 20).translate(0, 2.4, 0), copper));
  g.add(new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.28, 14, 30).rotateX(Math.PI / 2).translate(0, 4.4, 0), new THREE.MeshStandardNodeMaterial({ color: '#d9dde3', metalness: 0.95, roughness: 0.15 })));
  g.position.set(top.x, 0, top.z);
  return g;
}

/** A glass tank of glowing green fluid, bubbling. */
function makeTank(uFlicker: N) {
  const g = new THREE.Group();
  const fluid = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  fluid.colorNode = rgb('#7cff4f').mul(sin(time.mul(1.2)).mul(0.15).add(0.85).add(uFlicker.mul(0.6)));
  fluid.opacityNode = float(0.55);
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 4.5, 24).translate(0, 2.9, 0), fluid));
  const metal = new THREE.MeshStandardNodeMaterial({ color: '#3a3a44', metalness: 0.8, roughness: 0.35 });
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.55, 0.6, 24).translate(0, 0.3, 0), metal));
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.4, 0.4, 24).translate(0, 5.35, 0), metal));
  g.position.copy(TANK);
  return g;
}

/** A brain bobbing in a jar of green fluid (it twitches now and then). */
function makeBrainJar(uTwitch: N) {
  const g = new THREE.Group();
  const geo = new THREE.IcosahedronGeometry(0.42, 4);
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const folds = 1 + 0.07 * Math.sin(v.x * 24 + Math.sin(v.y * 20) * 2) * Math.cos(v.z * 22);
    p.setXYZ(i, v.x * folds * 1.15, v.y * folds * 0.85, v.z * folds);
  }
  geo.computeVertexNormals();
  const brainMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.5 });
  brainMat.colorNode = rgb('#e8a0a8');
  brainMat.emissiveNode = rgb('#7cff4f').mul(uTwitch.mul(0.8));
  const brain = new THREE.Mesh(geo, brainMat);
  brain.position.y = 0.75;
  g.add(brain);
  const fluid = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  fluid.colorNode = rgb('#9dff6a').mul(0.7);
  fluid.opacityNode = float(0.3);
  const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.5, 24, 1, true).translate(0, 0.75, 0), fluid);
  g.add(jar);
  const metal = new THREE.MeshStandardNodeMaterial({ color: '#3a3a44', metalness: 0.8, roughness: 0.35 });
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.76, 0.76, 0.14, 24).translate(0, 1.55, 0), metal));
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.76, 0.8, 0.14, 24).translate(0, 0.02, 0), metal));
  // on a little lab stool
  const wood = new THREE.MeshStandardNodeMaterial({ color: '#4a3020', roughness: 0.9 });
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.12, 20).translate(0, -0.06, 0), wood));
  for (const a of [0, 2.1, 4.2]) g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6).translate(Math.cos(a) * 0.6, -0.6, Math.sin(a) * 0.6), wood));
  g.position.copy(JAR);
  return { group: g, brain };
}

/** A lightning arc: a jagged ribbon of light between two points, re-rolled every few frames. */
class Arc {
  readonly mesh: THREE.Mesh;
  private pos: Float32Array;
  private readonly segments = 18;
  private a = new THREE.Vector3();
  private b = new THREE.Vector3();
  private width: number;

  constructor(color: string, width = 0.07) {
    this.width = width;
    const n = this.segments + 1;
    this.pos = new Float32Array(n * 2 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    const index: number[] = [];
    for (let i = 0; i < this.segments; i++) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    geo.setIndex(index);
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    mat.colorNode = mix(rgb(color), vec3(1, 1, 1), 0.45).mul(3);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 3;
  }

  /** Strike from a to b with a fresh jagged path. */
  strike(a: THREE.Vector3, b: THREE.Vector3) {
    this.a.copy(a);
    this.b.copy(b);
    const dir = b.clone().sub(a);
    const len = dir.length();
    const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 0, 1)).normalize();
    const up = new THREE.Vector3().crossVectors(dir, side).normalize();
    const p = new THREE.Vector3();
    for (let i = 0; i <= this.segments; i++) {
      const t = i / this.segments;
      const amp = Math.sin(Math.PI * t) * len * 0.12;
      p.copy(a).lerp(b, t).addScaledVector(side, (Math.random() - 0.5) * amp * 2).addScaledVector(up, (Math.random() - 0.5) * amp);
      const w = this.width * (1 - Math.abs(t - 0.5));
      this.pos.set([p.x - side.x * w, p.y - side.y * w, p.z - side.z * w, p.x + side.x * w, p.y + side.y * w, p.z + side.z * w], i * 6);
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.visible = true;
  }

  hide() {
    this.mesh.visible = false;
  }
}

export interface LabScene extends ThemeScene {
  /** Arcs leap from the coils (to each other, or onto the wheel's rim) for a while. */
  zap(seconds: number, toWheel: boolean): void;
  /** The lights flicker and the brain jolts. */
  alive(seconds: number): void;
}

// ------------------------------------------------------------------ theme

export const lab: Theme<LabScene> = {
  ...meta,
  wheel: {
    palette: PALETTE,
    font: `"${meta.font.family}"`,
    fontWeight: meta.font.weight,
    rim: ['#3a3a44', '#7cff4f'],
    holo: 0.2,
    flapper: '#ffe14d',
    leds: ['#9dff5c', '#b07cff'],
    hub: ['#7cff4f', '#9b5cff'],
    pegs: '#d9dde3',
    frame: '#15141c',
    arcs: '#b07cff',
    pointer: 'bolt',
  },
  post: { bloom: [0.7, 0.5, 0.72], exposure: 1, aberration: 1, vignette: 0.7 },
  character: { spot: [0, 0.22, 1.6], entrance: 'beam' },
  tick: 'blip',
  song: {
    bpm: 132,
    root: 52,
    scale: SCALES.spooky,
    progressions: [
      [0, 1, 4, 0],
      [0, 5, 4, 1],
      [3, 4, 0, 0],
    ],
    lead: 'sawtooth',
    bass: 'square',
    drums: 'four',
    density: 0.6,
    arp: true,
    brightness: 3800,
  },

  createScene({ scene, center }) {
    const group = new THREE.Group();
    const uFlicker = uniform(0);
    const uTwitch = uniform(0);
    scene.fogNode = fog(rgb('#120f18'), rangeFogFactor(20, 60));
    scene.environmentIntensity = 0.3;

    group.add(makeFloor(), makeWalls(uFlicker), makeChalkboard(), makeShelves(), makeTank(uFlicker));
    for (const top of COIL_TOPS) group.add(makeCoil(top));
    const jar = makeBrainJar(uTwitch);
    group.add(jar.group);

    const arcs = Array.from({ length: 5 }, (_, i) => new Arc(i % 2 ? '#7cff4f' : '#b07cff', i < 2 ? 0.09 : 0.06));
    for (const a of arcs) group.add(a.mesh);

    const steel = new THREE.MeshStandardNodeMaterial({ color: '#3a3a44', metalness: 0.8, roughness: 0.35 });
    group.add(makeStand(center, { legs: steel, neon: rgb('#7cff4f').mul(float(1.6).add(uSpeed.mul(0.08)).add(uWin.mul(2.5))) }));

    // bubbles rising in the tank and the jar
    const sprites = atlas();
    const bubbles = new Particles({
      count: 80,
      atlas: sprites,
      cells: [1],
      loop: true,
      mode: 'face',
      blend: 'additive',
      intensity: 1.2,
      colors: ['#c9ff9a'],
      mirror: false,
      emitters: [
        { at: [TANK.x, 1, TANK.z], box: [0.9, 0, 0.9], dir: [0, 1, 0], spread: 0.1, speed: [0.8, 1.6], weight: 3 },
        { at: [JAR.x, JAR.y + 0.15, JAR.z], box: [0.4, 0, 0.4], dir: [0, 1, 0], spread: 0.1, speed: [0.4, 0.8], weight: 1 },
      ],
      size: [0.06, 0.16],
      gravity: [0, 0.6, 0],
      drag: 0.6,
      life: [2, 3],
      wobble: 0.3,
    });
    group.add(bubbles.object);

    // ------------------------------------------------ animation state
    let zapLeft = 0;
    let zapToWheel = false;
    let reroll = 0;
    let aliveLeft = 0;
    const rim = (a: number) => new THREE.Vector3(center.x + Math.cos(a) * 3.3, center.y + Math.sin(a) * 3.3, 0.2);

    // idle moments: a crackle between the coils, the brain twitches, the lights stutter
    const moments = idleMoments();
    moments.add(() => {
      zapLeft = 0.8;
      zapToWheel = false;
    });
    moments.add(() => (uTwitch.value = 1));
    moments.add(() => (aliveLeft = 0.8));

    const lights = makeLights(group, ['#9fa0d6', 0.45], [
      ['#7cff4f', 9, [TANK.x - 1, 3, TANK.z + 2]],
      ['#b07cff', 9, [COIL_TOPS[0].x, 4.5, COIL_TOPS[0].z + 1.5]],
      ['#b07cff', 8, [COIL_TOPS[1].x, 4.5, COIL_TOPS[1].z + 1.5]],
    ]);
    group.add(new THREE.HemisphereLight('#4a4466', '#141018', 0.5));

    return {
      group,
      moments,
      zap(seconds, toWheel) {
        zapLeft = Math.max(zapLeft, seconds);
        zapToWheel = toWheel;
      },
      alive(seconds) {
        aliveLeft = Math.max(aliveLeft, seconds);
        uTwitch.value = 1;
      },
      update(f) {
        // a flickering supply: the lights dip and surge while things are coming alive
        aliveLeft = Math.max(0, aliveLeft - f.dt);
        const flicker = aliveLeft > 0 ? (Math.random() < 0.35 ? 1 : 0) : 0;
        uFlicker.value = flicker;
        lights(f.speed, f.win + (aliveLeft > 0 ? Math.random() * 2 : 0));
        moments.update(f);
        bubbles.update(f.time);

        zapLeft = Math.max(0, zapLeft - f.dt);
        reroll -= f.dt;
        if (zapLeft > 0 && reroll <= 0) {
          reroll = 0.06;
          arcs[0].strike(COIL_TOPS[0], COIL_TOPS[1]);
          if (zapToWheel) {
            arcs[1].strike(COIL_TOPS[0], rim(Math.PI * 0.75 + rand(-0.3, 0.3)));
            arcs[2].strike(COIL_TOPS[1], rim(Math.PI * 0.25 + rand(-0.3, 0.3)));
            arcs[3].strike(COIL_TOPS[0], new THREE.Vector3(COIL_TOPS[0].x + rand(-2, 2), 11, COIL_TOPS[0].z - 1));
            arcs[4].strike(COIL_TOPS[1], new THREE.Vector3(COIL_TOPS[1].x + rand(-2, 2), 11, COIL_TOPS[1].z - 1));
          }
        } else if (zapLeft <= 0) for (const a of arcs) a.hide();

        uTwitch.value *= Math.exp(-f.dt * 2.5);
        jar.brain.rotation.y += f.dt * 0.3;
        jar.brain.position.y = 0.75 + Math.sin(f.time * 1.3) * 0.05 + (uTwitch.value > 0.05 ? (Math.random() - 0.5) * 0.06 * uTwitch.value : 0);
      },
    };
  },

  celebrations,
};
