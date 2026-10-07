import * as THREE from 'three/webgpu';
import {
  exp,
  float,
  fog,
  fract,
  Fn,
  length,
  mix,
  mx_fractal_noise_float,
  mx_noise_float,
  positionLocal,
  positionWorld,
  rangeFogFactor,
  screenSize,
  screenUV,
  sin,
  smoothstep,
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
import { makeLights, makeStand, rgb, taperedTube } from '../shared';
import { lowRes } from '../../fx/nodes';
import { Particles } from '../../fx/Particles';
import { uSpeed, uWin } from '../../engine/globals';
import { SCALES } from '../../audio/ChipSynth';
import { meta, PALETTE } from './meta';
import { rand } from '../../fx/util';
import { atlas } from './sprites';
import { flyby, idleMoments } from '../../fx/ambient';
import { NEST } from './layout';
import { celebrations } from './celebrations';

type N = any;

const MIST = '#cdd6b6';
const PUDDLE = new THREE.Vector3(4.7, 0.02, 2.3);
const WATERFALL = new THREE.Vector3(-17, 0, -30);

// ------------------------------------------------------------------ sky, ground, mist

function sky() {
  const haze = Fn(() => {
    const uvS = screenUV; // y grows downward
    const p = vec2(uvS.x.mul(screenSize.x.div(screenSize.y)), uvS.y);
    let col: N = mix(rgb('#8fb8c9'), rgb('#e8e3c4'), smoothstep(0.05, 0.6, uvS.y));
    col = mix(col, rgb('#f6dfa6'), smoothstep(0.45, 0.68, uvS.y).mul(0.6)); // dawn glow low down
    const n = mx_fractal_noise_float(vec3(p.mul(vec2(1.2, 3.5)).add(vec2(time.mul(0.005), 0)), 0), 3, 2, 0.5);
    col = mix(col, rgb('#f7f3e4'), smoothstep(0.0, 0.5, n).mul(0.45));
    return vec4(col, 1);
  });
  return lowRes(haze()).rgb;
}

function makeGround() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 });
  const xz = positionWorld.xz;
  const n = mx_fractal_noise_float(vec3(xz.mul(0.18), 0), 2, 2, 0.5).mul(0.5).add(0.5);
  const moss = mix(rgb('#4f7a2c'), rgb('#7aa33d'), n);
  // bare earth around the stage and along a trampled path
  const bare = smoothstep(4.5, 2.8, length(xz.sub(vec2(0, -0.6)))).max(smoothstep(1.6, 0.6, xz.x.add(xz.y.mul(0.25)).add(mx_noise_float(vec3(xz.mul(0.3), 1)).mul(1.2)).abs()).mul(smoothstep(-2, -14, xz.y)));
  m.colorNode = mix(moss, rgb('#7b6545'), bare.mul(0.85));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 160), m);
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = -50;
  return ground;
}

/** Soft banks of mist drifting between the layers of the valley. */
function makeMist() {
  const g = new THREE.Group();
  for (const [z, y, alpha, speed] of [
    [-22, 2.5, 0.42, 0.012],
    [-38, 4, 0.55, 0.008],
  ]) {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    const u = uv();
    const n = mx_noise_float(vec3(u.mul(vec2(6, 1.2)).add(vec2(time.mul(speed), 0)), z)).mul(0.5).add(0.5);
    m.colorNode = rgb(MIST);
    m.opacityNode = n.mul(alpha).mul(smoothstep(0, 0.35, u.y)).mul(float(1).sub(smoothstep(0.55, 1, u.y)));
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(200, 14), m);
    plane.position.set(0, y, z);
    plane.renderOrder = 1;
    g.add(plane);
  }
  return g;
}

// ------------------------------------------------------------------ plants

function frondTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  ctx.lineCap = 'round';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(64, 512);
  ctx.lineTo(64, 6);
  ctx.stroke();
  // pinnae: rounded leaflets, longest in the middle of the frond
  for (let y = 30; y < 500; y += 11) {
    const len = 54 * Math.sin(((y - 10) / 510) * Math.PI) + 4;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(64 + (s * len) / 2, y - 6, len / 2, 4.5, s * -0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A frond arching outward: a strip bent along +Z, base at the origin. */
function frondGeometry() {
  const geo = new THREE.PlaneGeometry(0.75, 2.6, 1, 10).translate(0, 1.3, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / 2.6;
    pos.setZ(i, t * t * 1.4);
    pos.setY(i, pos.getY(i) * (1 - 0.3 * t * t));
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Every fern frond in the valley as one instanced mesh: clumps on the ground
 * and crowns on top of tree ferns. They sway in the wind and tremble at a stomp.
 */
function makeFerns(uTremble: N, trunks: [number, number, number][]) {
  const fronds: THREE.Matrix4[] = [];
  const m = new THREE.Matrix4();
  const clump = (x: number, y: number, z: number, n: number, s: number, droop: number) => {
    for (let i = 0; i < n; i++) {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(droop + rand(-0.15, 0.15), (i / n) * Math.PI * 2 + rand(-0.2, 0.2), 0, 'YXZ'));
      fronds.push(m.clone().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s * rand(0.85, 1.15), s)));
    }
  };
  for (let i = 0; i < 46; i++) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const z = rand(-24, 3);
    const x = side * rand(z > -6 ? 5.2 : 3.5, 20);
    clump(x, 0, z, 7, rand(0.8, 1.7), rand(0.55, 0.9));
  }
  for (const [x, z, h] of trunks) clump(x, h, z, 9, 1.6, 0.9);
  const mat = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, alphaTest: 0.5, roughness: 0.8 });
  const tex = frondTexture();
  const along = uv().y;
  mat.colorNode = mix(rgb('#3f6b24'), rgb('#86b445'), along.mul(0.7).add(mx_noise_float(positionWorld.mul(0.5)).mul(0.2)));
  mat.opacityNode = texture(tex, uv()).a;
  // the wind (positionLocal includes the instance transform here, so this offset is in world units)
  const sway = sin(time.mul(1.4).add(positionWorld.x.mul(0.4)).add(positionWorld.z.mul(0.3))).mul(0.12).add(sin(time.mul(23)).mul(uTremble).mul(0.08));
  mat.positionNode = positionLocal.add((vec3 as any)(sway, 0, sway.mul(0.5)).mul(along.mul(along)));
  const mesh = new THREE.InstancedMesh(frondGeometry(), mat, fronds.length);
  fronds.forEach((f, i) => mesh.setMatrixAt(i, f));
  return mesh;
}

/** Shaggy tree-fern trunks (their crowns come from the fern mesh). */
function makeTreeFerns(trunks: [number, number, number][]) {
  const profile = [
    [0, 0],
    [0.45, 0],
    [0.38, 0.4],
    [0.32, 1],
    [0.3, 0.97],
    [0.36, 1],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 1 });
  m.colorNode = mix(rgb('#4a3424'), rgb('#6b4c30'), fract(positionWorld.y.mul(3)).mul(0.6).add(mx_noise_float(positionWorld.mul(4)).mul(0.3)));
  const g = new THREE.Group();
  for (const [x, z, h] of trunks) {
    const trunk = new THREE.Mesh(new THREE.LatheGeometry(profile, 10), m);
    trunk.scale.set(1, h, 1);
    trunk.position.set(x, 0, z);
    g.add(trunk);
  }
  return g;
}

/** Tall monkey-puzzle trees fading into the mist. */
function makeConifers() {
  const g = new THREE.Group();
  const bark = new THREE.MeshStandardNodeMaterial({ color: '#3d3226', roughness: 1 });
  const needles = new THREE.MeshStandardNodeMaterial({ color: '#2f4a2a', roughness: 1, flatShading: true });
  for (let i = 0; i < 16; i++) {
    const x = rand(-60, 60);
    const z = rand(-75, -30);
    if (Math.abs(x) < 8 && z > -40) continue;
    const h = rand(14, 24);
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.45, h, 7).translate(x, h / 2, z), bark));
    for (let k = 0; k < 3; k++) {
      const r = rand(2.2, 3.6) * (1 - k * 0.22);
      g.add(new THREE.Mesh(new THREE.ConeGeometry(r, 1.2, 9).translate(x, h - k * 1.5, z), needles));
    }
  }
  return g;
}

/** A mossy cliff with a waterfall and a mist of spray at its foot. */
function makeWaterfall() {
  const g = new THREE.Group();
  const rock = new THREE.MeshStandardNodeMaterial({ roughness: 1 });
  const n = mx_noise_float(positionWorld.mul(0.35)).mul(0.5).add(0.5);
  rock.colorNode = mix(mix(rgb('#5a5650'), rgb('#7a756c'), n), rgb('#5d7b33'), smoothstep(0.55, 0.9, n.add(positionWorld.y.mul(0.03))));
  const cliff = new THREE.Mesh(new THREE.BoxGeometry(12, 18, 7, 6, 8, 3), rock);
  const pos = cliff.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) + Math.sin(pos.getY(i) * 0.7 + pos.getZ(i)) * 0.6);
  cliff.geometry.computeVertexNormals();
  cliff.position.set(0, 9, -3.5);
  g.add(cliff);
  const water = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  const u = uv();
  const streak = fract(u.y.mul(2.5).add(time.mul(1.2)).add(mx_noise_float(vec3(u.x.mul(9), 0, 0)).mul(0.6)));
  water.colorNode = mix(rgb('#9fd3e6'), rgb('#ffffff'), smoothstep(0.55, 1, streak));
  water.opacityNode = float(0.55).add(smoothstep(0.6, 1, streak).mul(0.4)).mul(smoothstep(0, 0.15, u.x).mul(smoothstep(1, 0.85, u.x)));
  const fall = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 17.5), water);
  fall.position.set(1.2, 9, 0.05);
  g.add(fall);
  const pool = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  pool.colorNode = rgb('#e9f6fa');
  pool.opacityNode = float(0.6).mul(smoothstep(1, 0.3, length(uv().sub(0.5)).mul(2)));
  const foam = new THREE.Mesh(new THREE.CircleGeometry(2.6, 24).rotateX(-Math.PI / 2), pool);
  foam.position.set(1.2, 0.05, 1.5);
  g.add(foam);
  g.position.copy(WATERFALL);
  return g;
}

// ------------------------------------------------------------------ creatures

const skin = (base: string, dark: string) => {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.8 });
  m.colorNode = mix(rgb(base), rgb(dark), smoothstep(0.3, 0.7, mx_noise_float(positionLocal.mul(vec3(1.2, 2.5, 1.2))).mul(0.5).add(0.5)).mul(0.6));
  return m;
};

/** A long-necked sauropod, facing +X, with swinging legs. */
function makeSauropod() {
  const mat = skin('#5e6b52', '#434d3b');
  const g = new THREE.Group();
  const body = new THREE.SphereGeometry(1, 20, 14).scale(3.2, 1.8, 1.6).translate(0, 4.2, 0);
  const neck = taperedTube([new THREE.Vector3(2.2, 4.8, 0), new THREE.Vector3(4.2, 7.5, 0), new THREE.Vector3(5.2, 10.4, 0), new THREE.Vector3(6, 11.4, 0)], (t) => 0.85 - t * 0.5, 30, 10);
  const head = new THREE.SphereGeometry(1, 14, 10).scale(0.85, 0.5, 0.45).translate(6.5, 11.4, 0);
  const tail = taperedTube([new THREE.Vector3(-2.6, 4.4, 0), new THREE.Vector3(-5.5, 3.6, 0), new THREE.Vector3(-8.5, 2.4, 0), new THREE.Vector3(-11, 1.8, 0)], (t) => 0.95 * (1 - t) + 0.05, 30, 10);
  g.add(new THREE.Mesh(mergeGeometries([body, neck, head, tail])!, mat));
  const legs = [-1.7, 1.7].flatMap((x) =>
    [-0.75, 0.75].map((z) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, 3.6, z);
      pivot.add(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 3.6, 10).translate(0, -1.8, 0), mat));
      g.add(pivot);
      return pivot;
    }),
  );
  return { group: g, legs };
}

/** A T-rex facing +X with an opening jaw. */
function makeTrex() {
  const mat = skin('#6b7b3a', '#4a5528');
  const g = new THREE.Group();
  const body = new THREE.SphereGeometry(1, 20, 14).scale(2.4, 1.45, 1.25).rotateZ(-0.25).translate(0, 4.4, 0);
  const tail = taperedTube([new THREE.Vector3(-1.8, 4.7, 0), new THREE.Vector3(-4, 4.3, 0), new THREE.Vector3(-6.6, 3.4, 0)], (t) => 1.0 * (1 - t) + 0.06, 24, 10);
  const neck = taperedTube([new THREE.Vector3(1.6, 5, 0), new THREE.Vector3(2.4, 5.8, 0)], () => 0.75, 6, 10);
  const skull = new THREE.SphereGeometry(1, 16, 12).scale(1.35, 0.72, 0.62).translate(3.2, 6.0, 0);
  const arms = [-0.55, 0.55].map((z) => new THREE.CylinderGeometry(0.1, 0.08, 0.8, 6).rotateZ(-1.1).translate(1.9, 4.2, z));
  g.add(new THREE.Mesh(mergeGeometries([body, tail, neck, skull, ...arms])!, mat));
  // eye and teeth
  const white = new THREE.MeshStandardNodeMaterial({ color: '#f2ead8', roughness: 0.4 });
  for (const z of [-0.5, 0.5]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshStandardNodeMaterial({ color: '#ffcf3a', emissive: '#7a4a00', roughness: 0.3 }));
    eye.position.set(3.55, 6.3, z * 0.9);
    g.add(eye);
  }
  const jaw = new THREE.Group();
  jaw.position.set(2.3, 5.6, 0);
  jaw.add(new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10).scale(1.15, 0.28, 0.5).translate(1.0, -0.15, 0), mat));
  const teeth = mergeGeometries([0.4, 0.75, 1.1, 1.45].flatMap((x) => [-0.3, 0.3].map((z) => new THREE.ConeGeometry(0.06, 0.22, 5).translate(x, 0.12, z))))!;
  jaw.add(new THREE.Mesh(teeth, white));
  g.add(jaw);
  const legs = [-0.75, 0.75].map((z) => {
    const pivot = new THREE.Group();
    pivot.position.set(-0.2, 3.9, z);
    pivot.add(new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10).scale(0.75, 1.2, 0.5).translate(0, -0.8, 0), mat));
    pivot.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.25, 2.2, 8).translate(0.25, -2.6, 0), mat));
    pivot.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 0.5).translate(0.5, -3.75, 0), mat));
    g.add(pivot);
    return pivot;
  });
  g.visible = false;
  return { group: g, jaw, legs };
}

/** Three speckled eggs in a nest of twigs. */
function makeNest() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.22, 8, 20).rotateX(Math.PI / 2).translate(0, 0.18, 0), new THREE.MeshStandardNodeMaterial({ color: '#6b5236', roughness: 1 })));
  const shell = new THREE.MeshStandardNodeMaterial({ roughness: 0.6 });
  const spots = smoothstep(0.62, 0.66, mx_noise_float(positionLocal.mul(9)).mul(0.5).add(0.5));
  shell.colorNode = mix(rgb('#f3ead2'), rgb('#8a9a5b'), spots);
  const eggs = [
    [-0.28, -0.1, 0.2],
    [0.3, -0.05, -0.15],
    [0.02, 0.28, 0.05],
  ].map(([x, z, r]) => {
    const egg = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12).scale(1, 1.35, 1).translate(0, 0.4, 0), shell);
    egg.position.set(x, 0.05, z);
    egg.rotation.z = r;
    g.add(egg);
    return egg;
  });
  g.position.copy(NEST);
  return { group: g, eggs };
}

/** A muddy puddle that rings with ripples at every distant footstep. */
function makePuddle(uRip: N) {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true });
  const d = length(uv().sub(0.5)).mul(2);
  // three rings per stomp, travelling outward and fading
  const ring = (k: number) => {
    const t = uRip.sub(k * 0.18);
    return exp(d.sub(t.mul(1.1)).mul(18).pow(2).negate()).mul(exp(t.mul(-1.6))).mul(t.greaterThan(0).select(float(1), float(0)));
  };
  const rings = ring(0).add(ring(1)).add(ring(2));
  m.colorNode = mix(rgb('#6f8a8e'), rgb('#c9dde0'), rings.mul(0.9).add(d.mul(0.15)));
  m.opacityNode = smoothstep(1, 0.85, d).mul(0.85);
  const puddle = new THREE.Mesh(new THREE.CircleGeometry(1.15, 40).rotateX(-Math.PI / 2), m);
  puddle.scale.set(1.3, 1, 0.85);
  puddle.position.copy(PUDDLE);
  return puddle;
}

export interface DinoScene extends ThemeScene {
  /** A T-rex stomps in from the side, roars, and leaves. */
  roar(): void;
  /** The eggs wobble and hatch (they're back a little later). */
  hatch(): void;
  /** Heavy footsteps: the ferns tremble and the puddle ripples. */
  stomp(times: number): void;
}

// ------------------------------------------------------------------ theme

export const dino: Theme<DinoScene> = {
  ...meta,
  wheel: {
    palette: PALETTE,
    font: `"${meta.font.family}"`,
    fontWeight: meta.font.weight,
    rim: ['#e8dcc0', '#a8956f'],
    holo: 0.1,
    flapper: '#f4a259',
    leds: ['#ffe6a8', '#9bd77c'],
    hub: ['#f4a259', '#5b3a1e'],
    pegs: '#e8dcc0',
    frame: '#2e2a22',
  },
  post: { bloom: [0.22, 0.4, 0.93], exposure: 0.95, aberration: 0.7, vignette: 0.5 },
  character: { spot: [0, 0.22, 1.6], entrance: 'pop' },
  tick: 'pop',
  song: {
    bpm: 112,
    root: 52,
    scale: SCALES.minorPent,
    progressions: [
      [0, 2, 3, 1],
      [0, 3, 2, 0],
      [3, 2, 1, 4],
    ],
    lead: 'triangle',
    bass: 'sawtooth',
    drums: 'break',
    density: 0.55,
    arp: false,
    brightness: 3400,
  },

  createScene({ scene, center }) {
    const group = new THREE.Group();
    scene.backgroundNode = sky();
    scene.fogNode = fog(rgb(MIST), rangeFogFactor(28, 110));
    scene.environmentIntensity = 0.4;

    const uTremble = uniform(0);
    const uRip = uniform(-1);
    const trunks: [number, number, number][] = [
      [-8.5, -9, 3.2],
      [9.5, -11, 3.6],
      [-13, -17, 4.2],
      [14, -5, 2.8],
      [6, -22, 4.5],
    ];

    group.add(makeGround(), makeMist(), makeConifers(), makeWaterfall(), makeTreeFerns(trunks), makeFerns(uTremble, trunks), makePuddle(uRip));
    const nest = makeNest();
    group.add(nest.group);

    // two long-necks wandering through the mist, in opposite directions
    const herd = [
      { ...makeSauropod(), x: -30, z: -46, dir: 1, scale: 1 },
      { ...makeSauropod(), x: 34, z: -58, dir: -1, scale: 0.8 },
    ];
    for (const d of herd) {
      d.group.scale.setScalar(d.scale);
      d.group.position.set(d.x, 0, d.z);
      if (d.dir < 0) d.group.rotation.y = Math.PI;
      group.add(d.group);
    }
    const trex = makeTrex();
    trex.group.scale.setScalar(1.8); // big enough that its head rises above the wheel
    group.add(trex.group);

    // spray drifting off the foot of the waterfall
    const sprites = atlas();
    const spray = new Particles({
      count: 40,
      atlas: sprites,
      cells: [4],
      loop: true,
      mode: 'face',
      tint: 1,
      intensity: 0.9,
      colors: ['#f4fbfd'],
      emitters: [{ at: [WATERFALL.x + 1.2, 0.3, WATERFALL.z + 1.5], box: [1.4, 0.2, 0.6], dir: [0.3, 1, 0.4], spread: 0.6, speed: [0.5, 1.5] }],
      size: [1.2, 2.6],
      gravity: [0, 0.3, 0],
      drag: 0.8,
      life: [3, 5],
      wobble: 0.5,
    });
    group.add(spray.object);

    // stone-and-bone stand
    const bone = new THREE.MeshStandardNodeMaterial({ color: '#e8dcc0', roughness: 0.6 });
    const stone = new THREE.MeshStandardNodeMaterial({ roughness: 0.9 });
    stone.colorNode = mix(rgb('#6f6a60'), rgb('#8e897d'), mx_noise_float(positionWorld.mul(1.5)).mul(0.5).add(0.5));
    group.add(makeStand(center, { legs: bone, plinth: stone, neon: rgb('#f4a259').mul(float(1.1).add(uSpeed.mul(0.06)).add(uWin.mul(2.2))) }));

    // ------------------------------------------------ animation state
    let trexT = -1;
    let hatchT = -1;
    let stomps: number[] = []; // scheduled footstep times
    let tremble = 0;
    let walkClock = 0;

    // idle moments: pterodactyls glide past, distant footsteps, a giant dragonfly
    const moments = idleMoments();
    const pteros = moments.track(
      flyby({ atlas: sprites, cells: [0], count: 3, from: [-34, 9, -28], box: [2, 1.5, 3], speed: [5, 6], life: 12, size: [1.4, 1.8], wobble: 0.5, stagger: 1.6 }),
    );
    const dragonfly = moments.track(
      flyby({ atlas: sprites, cells: [5], count: 1, from: [-16, 3.4, 3.2], dir: [1, 0.05, -0.1], speed: [3, 3.6], life: 10, size: [0.9, 0.9], wobble: 0.9, stagger: 0 }),
    );
    group.add(pteros.object, dragonfly.object);
    const stomp = (times: number) => {
      const now = walkClock;
      stomps = Array.from({ length: times }, (_, i) => now + i * 0.75);
    };
    moments.add(() => pteros.fire());
    moments.add(() => stomp(3));
    moments.add(() => dragonfly.fire());

    const lights = makeLights(group, ['#ffe2b0', 1.7], []);
    group.add(new THREE.HemisphereLight('#d6e6d8', '#4a5a2a', 0.75));

    return {
      group,
      moments,
      roar() {
        trexT = 0;
        trex.group.visible = true;
      },
      hatch() {
        hatchT = 0;
      },
      stomp,
      update(f) {
        lights(f.speed, f.win);
        moments.update(f);
        spray.update(f.time);
        walkClock += f.dt;

        // the herd ambles on, wrapping around the valley
        for (const d of herd) {
          d.group.position.x += d.dir * f.dt * 0.9;
          if (Math.abs(d.group.position.x) > 62) d.group.position.x = -d.dir * 62;
          const step = walkClock * 1.8 + (d.dir > 0 ? 0 : 1.3);
          // diagonal pairs (back-left with front-right) move together
          d.legs.forEach((leg, i) => (leg.rotation.z = Math.sin(step + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.3));
          d.group.position.y = Math.abs(Math.sin(step)) * 0.12 * d.scale;
        }

        // footsteps: each one rings the puddle and shakes the ferns
        if (stomps.length && walkClock >= stomps[0]) {
          stomps.shift();
          uRip.value = 0;
          tremble = 1;
        }
        if (uRip.value >= 0) uRip.value = uRip.value > 2.5 ? -1 : uRip.value + f.dt;
        tremble *= Math.exp(-f.dt * 3);
        uTremble.value = tremble;

        if (trexT >= 0) {
          trexT += f.dt;
          const t = trexT;
          const g = trex.group;
          const walking = t < 1.6 || t > 3.6;
          if (t < 1.6) g.position.set(-32 + (t / 1.6) * 19, 0, -16);
          else if (t > 3.6) g.position.x = -13 - ((t - 3.6) / 2) * 20;
          g.rotation.y = t > 3.6 ? Math.PI : 0;
          const step = t * 5;
          trex.legs.forEach((leg, i) => (leg.rotation.z = walking ? Math.sin(step + i * Math.PI) * 0.4 : 0));
          g.position.y = walking ? Math.abs(Math.sin(step)) * 0.2 : 0;
          // the roar: jaw wide, body reared back
          const roar = t > 1.7 && t < 3.5 ? Math.min(1, (t - 1.7) * 4) * Math.min(1, (3.5 - t) * 4) : 0;
          trex.jaw.rotation.z = -roar * 0.75;
          g.rotation.z = roar * 0.12;
          if (t > 5.6) {
            trexT = -1;
            g.visible = false;
          }
        }

        if (hatchT >= 0) {
          hatchT += f.dt;
          const wobble = hatchT < 1.1 ? Math.sin(hatchT * 40) * 0.25 * (hatchT / 1.1) : 0;
          nest.eggs.forEach((e, i) => {
            e.rotation.x = wobble * (i % 2 ? 1 : -1);
            e.visible = hatchT < 1.1 || hatchT > 5;
          });
          if (hatchT > 5) hatchT = -1;
        }
      },
    };
  },

  celebrations,
};
