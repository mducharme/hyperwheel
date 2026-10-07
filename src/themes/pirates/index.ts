import * as THREE from 'three/webgpu';
import {
  abs,
  float,
  floor,
  fog,
  fract,
  Fn,
  hash,
  length,
  mix,
  mx_fractal_noise_float,
  mx_noise_float,
  positionLocal,
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
import { atlas } from './sprites';
import { flyby, idleMoments } from '../../fx/ambient';
import { CANNONS, CHEST } from './layout';
import { celebrations } from './celebrations';

type N = any;

const SUN = new THREE.Vector3(-26, 7, -110);
const SEA_Y = -2.2;
/** Inside faces of the side rails, and the stern rail behind the mast. */
const RAIL_X = 7.6;
const STERN_Z = -15;
const MAST = new THREE.Vector3(0, 0, -7);
/** The yard with the furled sail, just above the frame on phones. */
const YARD_Y = 14.5;
const WOOD = '#7a4a26';

const woodMat = (color = WOOD, roughness = 0.75) => {
  const m = new THREE.MeshStandardNodeMaterial({ roughness });
  const grain = mx_noise_float(positionLocal.mul(vec3(0.6, 9, 0.6))).mul(0.12);
  m.colorNode = rgb(color).mul(float(0.92).add(grain));
  return m;
};

/** A thin cylinder from a to b (ropes, spars). */
function beam(a: THREE.Vector3, b: THREE.Vector3, r: number) {
  const len = a.distanceTo(b);
  return new THREE.CylinderGeometry(r, r, len, 6)
    .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()))
    .translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
}

// ------------------------------------------------------------------ sky & sea

function sky() {
  const glow = (uvS: N) => smoothstep(0.15, 0.62, uvS.y); // screenUV.y grows downward
  const clouds = Fn(() => {
    const uvS = screenUV;
    const p = vec2(uvS.x.mul(screenSize.x.div(screenSize.y)), uvS.y);
    let col: N = mix(rgb('#2f5f8f'), rgb('#f2b27a'), glow(uvS));
    col = mix(col, rgb('#ffe2a8'), smoothstep(0.5, 0.66, uvS.y));
    const n = mx_fractal_noise_float(vec3(p.mul(vec2(1.4, 5)).add(vec2(time.mul(0.006), 0)), 0), 4, 2, 0.5);
    // clouds lit pink-gold from below by the low sun
    const lit = mix(rgb('#ffd1a1'), rgb('#ff9f8a'), glow(uvS));
    col = mix(col, lit, smoothstep(0.1, 0.5, n).mul(smoothstep(0.05, 0.3, uvS.y)).mul(float(1).sub(smoothstep(0.45, 0.6, uvS.y))).mul(0.7));
    return vec4(col, 1);
  });
  return lowRes(clouds()).rgb;
}

function makeSun() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicNodeMaterial({ fog: false });
  mat.colorNode = rgb('#fff1c4').mul(1.8);
  g.add(new THREE.Mesh(new THREE.CircleGeometry(7, 48), mat));
  const halo = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const d = length(uv().sub(0.5)).mul(2);
  halo.colorNode = rgb('#ffb36b').mul(pow(float(1).sub(smoothstep(0.15, 1, d)), 2.5)).mul(0.45);
  const h = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), halo);
  h.position.z = -0.2;
  g.add(h);
  g.position.copy(SUN);
  return g;
}

function makeOcean() {
  const mat = new THREE.MeshBasicNodeMaterial();
  const xz = positionWorld.xz;
  const waves = mx_fractal_noise_float(vec3(xz.mul(vec2(0.18, 0.45)).add(vec2(time.mul(0.12), time.mul(0.3))), time.mul(0.08)), 3, 2, 0.5).mul(0.5).add(0.5);
  let col: N = mix(rgb('#0e3a55'), rgb('#2d6f86'), waves);
  col = mix(col, rgb('#f0a97a'), smoothstep(-40, -150, xz.y).mul(0.45)); // the sky mirrored far out
  // a path of glitter from the sun to the ship
  const pathX = float(SUN.x).mul(xz.y.div(SUN.z));
  const width = mix(float(1.5), float(9), smoothstep(0, SUN.z, xz.y));
  const path = float(1).sub(smoothstep(0, 1, abs(xz.x.sub(pathX)).div(width)));
  const glitter = pow(mx_noise_float(vec3(xz.mul(vec2(2, 5)), time.mul(1.2))).mul(0.5).add(0.5), 6);
  col = col.add(rgb('#ffd59a').mul(path.mul(glitter).mul(4)));
  // whitecaps
  col = mix(col, rgb('#e8f4f6'), smoothstep(0.82, 0.9, waves).mul(0.5));
  mat.colorNode = col;
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(420, 240), mat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, SEA_Y, -110);
  return sea;
}

/** A small island on the horizon with a couple of palms, in silhouette. */
function makeIsland() {
  const g = new THREE.Group();
  const land = new THREE.MeshStandardNodeMaterial({ color: '#3d4a3a', roughness: 1 });
  const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), land);
  hill.scale.set(16, 4.5, 7);
  g.add(hill);
  const trunkMat = new THREE.MeshStandardNodeMaterial({ color: '#2f2a24', roughness: 1 });
  const leafMat = new THREE.MeshStandardNodeMaterial({ color: '#2e3d2c', roughness: 1, side: THREE.DoubleSide });
  for (const [x, h, lean] of [
    [-3, 7, 0.25],
    [2, 6, -0.3],
  ] as const) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, h, 6).translate(0, h / 2, 0), trunkMat);
    trunk.position.set(x, 3.6, 0);
    trunk.rotation.z = lean;
    g.add(trunk);
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.5, 3.4, 4).translate(0, 1.7, 0), leafMat);
      leaf.position.set(x - Math.sin(lean) * h, 3.6 + Math.cos(lean) * h, 0);
      leaf.rotation.set(0, (i / 6) * Math.PI * 2, 1.9);
      leaf.rotation.order = 'YZX';
      g.add(leaf);
    }
  }
  g.position.set(40, SEA_Y, -100);
  return g;
}

/** A distant sailing ship for the horizon, sails catching the sunset. */
function makeShip() {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(8, 1.6, 2.2), new THREE.MeshStandardNodeMaterial({ color: '#3b2716', roughness: 0.9 }));
  hull.position.y = 0.6;
  g.add(hull);
  const sailMat = new THREE.MeshStandardNodeMaterial({ color: '#efe1c4', roughness: 0.9, side: THREE.DoubleSide });
  for (const [x, h] of [
    [-2, 7],
    [1.5, 8.5],
  ]) {
    g.add(new THREE.Mesh(beam(new THREE.Vector3(x, 1, 0), new THREE.Vector3(x, h, 0), 0.08), hull.material));
    for (const [y, w] of [
      [h * 0.45, 3.4],
      [h * 0.75, 2.6],
    ]) {
      const sail = new THREE.Mesh(new THREE.PlaneGeometry(w, h * 0.26), sailMat);
      sail.position.set(x, y, 0.1);
      sail.rotation.y = Math.PI / 2 - 0.35;
      g.add(sail);
    }
  }
  g.scale.setScalar(1.6);
  return g;
}

// ------------------------------------------------------------------ the deck

function makeDeck() {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.8 });
  const p = positionWorld.xz;
  const plank = floor(p.x.div(0.55));
  const butt = floor(p.y.div(3.2).add(hash(plank).mul(4)));
  const tone = hash(plank.add(butt.mul(31))).mul(0.18);
  const seam = step(0.94, fract(p.x.div(0.55))).max(step(0.985, fract(p.y.div(3.2).add(hash(plank).mul(4)))));
  const grain = mx_noise_float(vec3(p.x.mul(6), p.y.mul(0.5), 0)).mul(0.08);
  mat.colorNode = mix(rgb('#a8713f').mul(float(0.85).add(tone).add(grain)), rgb('#3b2414'), seam.mul(0.8));
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(RAIL_X * 2, 26), mat);
  deck.rotation.x = -Math.PI / 2;
  deck.position.z = -4.5;
  return deck;
}

function makeRails() {
  const wall = woodMat('#6e4022');
  const cap = woodMat('#4f2e17', 0.6);
  const parts: THREE.BufferGeometry[] = [];
  const caps: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    parts.push(new THREE.BoxGeometry(0.3, 1.1, 22).translate(s * (RAIL_X + 0.15), 0.55, -4.5));
    caps.push(new THREE.BoxGeometry(0.5, 0.14, 22.2).translate(s * (RAIL_X + 0.15), 1.17, -4.5));
    // posts
    for (let z = 5; z > STERN_Z; z -= 2.2) parts.push(new THREE.BoxGeometry(0.36, 1.25, 0.24).translate(s * (RAIL_X + 0.15), 0.62, z));
  }
  parts.push(new THREE.BoxGeometry(RAIL_X * 2 + 0.6, 1.1, 0.3).translate(0, 0.55, STERN_Z - 0.15));
  caps.push(new THREE.BoxGeometry(RAIL_X * 2 + 0.8, 0.14, 0.5).translate(0, 1.17, STERN_Z - 0.15));
  const g = new THREE.Group();
  g.add(new THREE.Mesh(mergeGeometries(parts)!, wall), new THREE.Mesh(mergeGeometries(caps)!, cap));
  return g;
}

/** Mast, yard with a furled sail, and rigging down to the rails. */
function makeMast() {
  const g = new THREE.Group();
  const mast = woodMat('#5c3a1e', 0.7);
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 24, 16).translate(MAST.x, 12, MAST.z), mast));
  g.add(new THREE.Mesh(beam(new THREE.Vector3(-7.5, YARD_Y, MAST.z + 0.4), new THREE.Vector3(7.5, YARD_Y, MAST.z + 0.4), 0.16), mast));
  const sail = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 });
  sail.colorNode = rgb('#efe1c4').mul(float(0.9).add(sin(positionLocal.y.mul(40)).mul(0.05)));
  const furl = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 13.6, 4, 12).rotateZ(Math.PI / 2), sail);
  furl.position.set(0, YARD_Y - 0.45, MAST.z + 0.55);
  g.add(furl);
  const ropes: THREE.BufferGeometry[] = [];
  const top = new THREE.Vector3(MAST.x, 18, MAST.z);
  for (const s of [-1, 1]) {
    for (const z of [-0.5, -4, -10, -13.5]) ropes.push(beam(new THREE.Vector3(s * (RAIL_X + 0.1), 1.2, z), top, 0.035));
    ropes.push(beam(new THREE.Vector3(s * 7.4, YARD_Y, MAST.z + 0.4), new THREE.Vector3(s * (RAIL_X + 0.1), 1.2, MAST.z + 2.5), 0.03));
  }
  g.add(new THREE.Mesh(mergeGeometries(ropes)!, new THREE.MeshStandardNodeMaterial({ color: '#3a2c1c', roughness: 1 })));
  return g;
}

function makeCannon(side: number) {
  const g = new THREE.Group();
  const iron = new THREE.MeshStandardNodeMaterial({ color: '#22252a', metalness: 0.8, roughness: 0.45 });
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 2, 16).rotateZ(-Math.PI / 2).translate(0.5, 0, 0), iron);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.06, 8, 16).rotateY(Math.PI / 2).translate(1.5, 0, 0), iron);
  const barrelGroup = new THREE.Group();
  barrelGroup.add(barrel, lip);
  barrelGroup.position.y = 0.72;
  g.add(barrelGroup);
  const carriage = woodMat('#5a3418');
  g.add(new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.45, 0.8).translate(0, 0.38, 0), carriage));
  for (const x of [-0.45, 0.45]) {
    for (const z of [-0.45, 0.45]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 12).rotateX(Math.PI / 2).translate(x, 0.2, z), carriage);
      g.add(w);
    }
  }
  g.scale.setScalar(0.9);
  if (side < 0) g.rotation.y = Math.PI; // barrels point out to sea
  return { group: g, barrel: barrelGroup };
}

function makeBarrel() {
  const profile = [
    [0, 0],
    [0.42, 0],
    [0.5, 0.35],
    [0.53, 0.6],
    [0.5, 0.85],
    [0.42, 1.2],
    [0, 1.2],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const m = woodMat('#8a5a2e');
  // iron hoops
  const hoop = step(0.92, fract(positionLocal.y.mul(2.6).add(0.2)));
  m.colorNode = mix(m.colorNode as N, rgb('#2b2b2e'), hoop);
  return new THREE.Mesh(new THREE.LatheGeometry(profile, 18), m);
}

/** A treasure chest with a hinged lid; `open` 0..1. */
function makeChest(uOpen: N) {
  const g = new THREE.Group();
  const wood = woodMat('#6b3d1d');
  const gold = new THREE.MeshStandardNodeMaterial({ color: '#d9a33a', metalness: 0.9, roughness: 0.3 });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.7, 0.85).translate(0, 0.35, 0), wood));
  for (const x of [-0.5, 0.5]) g.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.74, 0.89).translate(x, 0.36, 0), gold));
  // glowing gold heap inside, seen when the lid lifts
  const heap = new THREE.MeshBasicNodeMaterial();
  heap.colorNode = rgb('#ffcf5a').mul(float(0.6).add(uOpen.mul(1.8)));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.05, 0.7).translate(0, 0.68, 0), heap));
  const lid = new THREE.Group();
  lid.add(new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 1.3, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).translate(0, 0, 0.425), wood));
  lid.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.46, 0.89).translate(-0.5, 0.22, 0.425), gold));
  lid.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.46, 0.89).translate(0.5, 0.22, 0.425), gold));
  lid.position.set(0, 0.7, -0.425); // hinge along the back edge
  g.add(lid);
  g.userData.lid = lid;
  g.position.copy(CHEST);
  g.rotation.y = 0.35;
  return g;
}

/** Hanging lanterns with flickering warm light. */
function makeLanterns() {
  const g = new THREE.Group();
  const lights: THREE.PointLight[] = [];
  const frame = new THREE.MeshStandardNodeMaterial({ color: '#2a2622', metalness: 0.7, roughness: 0.5 });
  const flame = new THREE.MeshBasicNodeMaterial();
  flame.colorNode = rgb('#ffc46b').mul(float(2.2).add(sin(time.mul(17)).mul(0.25)));
  for (const s of [-1, 1]) {
    const x = s * (RAIL_X - 0.2);
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 6).translate(x, 2.0, 0.8), frame));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.34).translate(x, 2.9, 0.8), frame));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.38, 0.26).translate(x, 2.9, 0.8), flame));
    const l = new THREE.PointLight('#ffb35c', 6, 12, 1.6);
    l.position.set(x, 2.9, 1.2);
    lights.push(l);
    g.add(l);
  }
  return { group: g, lights };
}

/** A Jolly Roger on a staff at the stern, rippling (harder while `uWave` is up). */
function makeFlag(uWave: N) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 6, 8).translate(0, 3, 0), new THREE.MeshStandardNodeMaterial({ color: '#4f2e17', roughness: 0.7 })));
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 160;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#121212';
  ctx.fillRect(0, 0, 256, 160);
  ctx.translate(128, 80);
  ctx.strokeStyle = '#f4f1e8';
  ctx.lineCap = 'round';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(-55, 45);
  ctx.lineTo(55, 0);
  ctx.moveTo(55, 45);
  ctx.lineTo(-55, 0);
  ctx.stroke();
  ctx.fillStyle = '#f4f1e8';
  ctx.beginPath();
  ctx.arc(0, -18, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#121212';
  for (const x of [-13, 13]) {
    ctx.beginPath();
    ctx.arc(x, -20, 9, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardNodeMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.9 });
  const u = uv();
  const ripple = sin(u.x.mul(7).sub(time.mul(float(5).add(uWave.mul(6))))).mul(float(0.12).add(uWave.mul(0.25))).mul(u.x);
  mat.positionNode = positionLocal.add(vec3(0, ripple.mul(0.4), ripple));
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4, 20, 6).translate(1.1, 0, 0), mat);
  flag.position.y = 5.2;
  g.add(flag);
  return g;
}

/** A tapered, curling tentacle (suckers are drawn by its material). */
const tentacleGeometry = () =>
  taperedTube(
    [
      new THREE.Vector3(0, -2, 0),
      new THREE.Vector3(0.5, 2.5, 0),
      new THREE.Vector3(0.2, 6, 0.3),
      new THREE.Vector3(1.4, 8.8, 0.5),
      new THREE.Vector3(3.1, 9.6, 0.3),
      new THREE.Vector3(4.1, 8.5, 0),
      new THREE.Vector3(3.6, 7.4, -0.2),
    ],
    (t) => 0.95 * Math.pow(1 - t, 0.85) + 0.05,
    70,
  );

function makeKraken() {
  const geo = tentacleGeometry();
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.35, side: THREE.DoubleSide });
  const u = uv();
  // rows of suckers along one side
  const cell = fract(vec2(u.x.mul(46), u.y.mul(12))).sub(0.5);
  const sucker = step(length(cell), 0.32).mul(smoothstep(0.32, 0.4, u.y).mul(float(1).sub(smoothstep(0.6, 0.68, u.y))));
  const skin = mix(rgb('#5d1f57'), rgb('#9b3a6e'), mx_noise_float(vec3(u.mul(vec2(20, 4)), 0)).mul(0.5).add(0.5));
  mat.colorNode = mix(skin, rgb('#f0b6c4'), sucker);
  const arms = [
    { x: -9.6, z: -12, flip: false },
    { x: 9.6, z: -10, flip: true },
  ].map(({ x, z, flip }) => {
    const pivot = new THREE.Group();
    const arm = new THREE.Mesh(geo, mat);
    if (flip) arm.scale.x = -1; // curl toward the ship from both sides
    pivot.add(arm);
    pivot.position.set(x, SEA_Y - 14, z);
    return pivot;
  });
  return arms;
}

export interface PirateScene extends ThemeScene {
  openChest(): void;
  /** The kraken's arms rise from the sea for `seconds`. */
  kraken(seconds: number): void;
  /** Cannons recoil, in a ripple from bow to stern. */
  fireCannons(): void;
  /** The Jolly Roger whips in the wind. */
  wave(seconds: number): void;
}

// ------------------------------------------------------------------ theme

export const pirates: Theme<PirateScene> = {
  ...meta,
  wheel: {
    palette: PALETTE,
    font: `"${meta.font.family}"`,
    fontWeight: meta.font.weight,
    rim: ['#6b4226', '#8b5a2b'],
    holo: 0,
    flapper: '#d9a33a',
    leds: ['#ffcf7a', '#ffffff'],
    hub: ['#d9a33a', '#6b4226'],
    pegs: '#e0b252',
    frame: '#3b2414',
    helm: { handles: 8, wood: '#8b5a2b' },
  },
  post: { bloom: [0.3, 0.4, 0.92], exposure: 0.92, aberration: 0.7, vignette: 0.5 },
  character: { spot: [0, 0.22, 1.6], entrance: 'pop' },
  tick: 'knock',
  song: {
    bpm: 116,
    root: 50,
    scale: SCALES.dorian,
    progressions: [
      [0, 6, 5, 4],
      [0, 3, 4, 0],
      [5, 6, 0, 0],
    ],
    lead: 'square',
    bass: 'triangle',
    drums: 'shuffle',
    density: 0.6,
    arp: false,
    brightness: 3000,
  },

  createScene({ scene, center }) {
    const group = new THREE.Group();
    scene.backgroundNode = sky();
    scene.fogNode = fog(rgb('#e9b98a'), rangeFogFactor(60, 210));
    scene.environmentIntensity = 0.4;

    const uOpen = uniform(0);
    const uWave = uniform(0);

    // the sea, horizon and sun rock gently; the deck (and the wheel) stay put
    const sea = new THREE.Group();
    const ship = makeShip();
    ship.position.set(-90, SEA_Y, -85);
    ship.visible = false;
    sea.add(makeOcean(), makeSun(), makeIsland(), ship);
    group.add(sea);

    group.add(makeDeck(), makeRails(), makeMast());
    const cannons = CANNONS.map(([side, z]) => {
      const c = makeCannon(side);
      c.group.position.set(side * (RAIL_X - 1.1), 0, z);
      group.add(c.group);
      return c;
    });
    for (const [x, z, s] of [
      [-5.9, 2.6, 1],
      [-6.6, 1.5, 0.9],
      [6.2, 2.2, 1],
    ] as const) {
      const b = makeBarrel();
      b.position.set(x, 0, z);
      b.scale.setScalar(s);
      group.add(b);
    }
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1, 0.9, 1).translate(0, 0.45, 0), woodMat('#9b6b3a'));
    crate.position.set(6.5, 0, 0.6);
    crate.rotation.y = 0.4;
    group.add(crate);
    const chest = makeChest(uOpen);
    group.add(chest);
    const lanterns = makeLanterns();
    group.add(lanterns.group);
    const flag = makeFlag(uWave);
    flag.position.set(-RAIL_X + 0.6, 1.2, STERN_Z + 0.4);
    group.add(flag);
    const kraken = makeKraken();
    group.add(...kraken);

    // brass-trimmed wooden stand
    const legs = woodMat('#5c3a1e', 0.6);
    group.add(
      makeStand(center, {
        legs,
        plinth: woodMat('#7a4a26', 0.7),
        neon: rgb('#ffcf7a').mul(float(1.2).add(uSpeed.mul(0.06)).add(uWin.mul(2.2))),
      }),
    );

    // ------------------------------------------------ animation state
    let chestOpen = 0; // seconds left open
    let krakenLeft = 0;
    let krakenUp = 0; // eased 0..1
    let waveLeft = 0;
    let volleyT = -1;
    let shipX = -1;
    const lid: THREE.Object3D = chest.userData.lid;

    // idle moments: gulls, a ship sailing past on the horizon, a whale blowing
    const sprites = atlas();
    const moments = idleMoments();
    const gulls = moments.track(
      flyby({ atlas: sprites, cells: [4], count: 4, from: [-34, 9.5, -30], box: [2, 1.5, 3], speed: [5, 6.5], life: 12, size: [0.9, 1.2], wobble: 0.6, stagger: 1.4, fog: false }),
    );
    const spout = moments.track(
      new Particles({
        count: 90,
        atlas: sprites,
        cells: [5],
        mode: 'face',
        tint: 1,
        intensity: 1.2,
        colors: ['#ffffff', '#dff4ff'],
        emitters: [{ at: [24, SEA_Y + 0.3, -42], box: [0.3, 0, 0.3], dir: [0, 1, 0], spread: 0.15, speed: [6, 9], delay: [0, 0.6] }],
        size: [0.25, 0.6],
        gravity: [0, -7, 0],
        drag: 0.6,
        life: [1.4, 2],
      }),
    );
    group.add(gulls.object, spout.object);
    moments.add(() => gulls.fire());
    moments.add(() => spout.fire());
    moments.add(() => {
      if (shipX < 0) shipX = 0;
    });

    const boost = makeLights(group, ['#ffd3a1', 2.1], []);
    group.add(new THREE.HemisphereLight('#a9c8ef', '#5a3c22', 0.6));

    return {
      group,
      moments,
      openChest() {
        chestOpen = 4;
      },
      kraken(seconds) {
        krakenLeft = Math.max(krakenLeft, seconds);
      },
      fireCannons() {
        volleyT = 0;
      },
      wave(seconds) {
        waveLeft = Math.max(waveLeft, seconds);
      },
      update(f) {
        boost(f.speed, f.win);
        moments.update(f);
        // the ship rolls: the horizon and sea tilt a little, slowly
        sea.rotation.z = Math.sin(f.time * 0.45) * 0.022;
        sea.position.y = Math.sin(f.time * 0.6) * 0.28;
        for (const l of lanterns.lights) l.intensity = 6 * (0.85 + Math.random() * 0.3);

        chestOpen = Math.max(0, chestOpen - f.dt);
        const target = chestOpen > 0 ? 1 : 0;
        uOpen.value += (target - uOpen.value) * (1 - Math.exp(-f.dt * (target ? 9 : 2.5)));
        lid.rotation.x = -uOpen.value * 1.9;

        krakenLeft = Math.max(0, krakenLeft - f.dt);
        krakenUp += ((krakenLeft > 0 ? 1 : 0) - krakenUp) * (1 - Math.exp(-f.dt * (krakenLeft > 0 ? 2.2 : 1.4)));
        kraken.forEach((k, i) => {
          k.position.y = SEA_Y - 14 + krakenUp * 14;
          k.rotation.z = Math.sin(f.time * 1.6 + i * 2) * 0.12 * krakenUp;
          k.rotation.x = Math.sin(f.time * 1.1 + i) * 0.08;
          k.visible = krakenUp > 0.01;
        });

        if (volleyT >= 0) {
          volleyT += f.dt;
          cannons.forEach((c, i) => {
            const t = volleyT - i * 0.25;
            c.barrel.position.x = t > 0 && t < 0.8 ? -0.45 * Math.exp(-t * 6) * Math.sin(Math.min(1, t * 12) * Math.PI * 0.5) : 0;
          });
          if (volleyT > 2) volleyT = -1;
        }

        waveLeft = Math.max(0, waveLeft - f.dt);
        uWave.value += ((waveLeft > 0 || f.speed > 6 ? 1 : 0) - uWave.value) * (1 - Math.exp(-f.dt * 3));

        if (shipX >= 0) {
          shipX += f.dt / 45;
          ship.visible = shipX < 1;
          ship.position.x = -90 + shipX * 180;
          if (shipX >= 1) shipX = -1;
        }
      },
    };
  },

  celebrations,
};
