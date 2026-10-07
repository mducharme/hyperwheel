import * as THREE from 'three/webgpu';
import {
  abs,
  atan,
  float,
  floor,
  fog,
  fract,
  Fn,
  hash,
  length,
  max,
  mix,
  dot,
  normalView,
  positionViewDirection,
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
import { makeLights, makeStand, rgb } from '../shared';
import { lowRes, starField } from '../../fx/nodes';
import { uSpeed, uWin } from '../../engine/globals';
import { SCALES } from '../../audio/ChipSynth';
import { meta, PALETTE } from './meta';
import { rand } from '../../fx/util';
import { atlas } from './sprites';
import { flyby, idleMoments } from '../../fx/ambient';
import { celebrations } from './celebrations';

type N = any;

// The circuit is an oval around the stage: x = A·cos s, z = ZC + B·sin s.
const A = 19;
const B = 7;
const ZC = -13;
/** Half the track width. */
const W = 1.9;
/** The start/finish line and its light gantry, on the far straight. */
const GANTRY_X = -9;
const FAR_Z = ZC - B;
const LIVERIES = ['#e10600', '#0057ff', '#00a19c', '#ff8000', '#ffd400'];

/** Signed distance (world units, roughly) from a ground point to the track's centre line. */
const trackDistance = (xz: N) => {
  const q = vec2(xz.x.div(A), xz.y.sub(ZC).div(B));
  const r = length(q);
  const grad = length(vec2(xz.x.div(A * A), xz.y.sub(ZC).div(B * B))).div(max(r, 1e-3));
  return r.sub(1).div(max(grad, 1e-4));
};

// ------------------------------------------------------------------ world

function sky() {
  const horizon = (uvS: N) => smoothstep(0.1, 0.6, uvS.y); // screenUV.y grows downward
  // a night sky over a city: deep blue, an orange glow along the horizon, thin clouds lit from below
  const clouds = Fn(() => {
    const uvS = screenUV;
    const p = vec2(uvS.x.mul(screenSize.x.div(screenSize.y)), uvS.y);
    const n = mx_fractal_noise_float(vec3(p.mul(vec2(1.6, 4)).add(vec2(time.mul(0.008), 0)), time.mul(0.004)), 4, 2, 0.5);
    let col: N = mix(rgb('#050816'), rgb('#1b2448'), horizon(uvS));
    col = col.add(rgb('#ff8a3d').mul(smoothstep(0.45, 0.62, uvS.y).mul(0.35)));
    col = mix(col, rgb('#3a3550'), smoothstep(0.1, 0.5, n).mul(horizon(uvS)).mul(0.6));
    return vec4(col, 1);
  });
  return lowRes(clouds()).rgb.add(vec3(starField(0.997, 2.5, 1).mul(float(1).sub(horizon(screenUV)))));
}

/** A floodlight mast: a pole, a bank of lamps aimed at `target`, and a soft beam of light in the haze. */
function makeFloodlight(at: THREE.Vector3, target: THREE.Vector3, uFlood: N) {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardNodeMaterial({ color: '#3a3f48', metalness: 0.7, roughness: 0.5 });
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.38, at.y, 8).translate(at.x, at.y / 2, at.z), steel));
  const head = new THREE.Group();
  head.position.copy(at);
  head.add(new THREE.Mesh(new THREE.BoxGeometry(3.6, 2, 0.3), steel));
  const lamp = new THREE.MeshBasicNodeMaterial();
  // a 6 × 3 grid of lamps, each a bright disc
  const disc = smoothstep(0.42, 0.3, length(fract(uv().mul(vec2(6, 3))).sub(0.5)));
  lamp.colorNode = mix(rgb('#1a1c22'), rgb('#fff6e0').mul(float(3.5).mul(uFlood)), disc);
  const lamps = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.8), lamp);
  lamps.position.z = 0.16;
  head.add(lamps);
  // the beam: an open cone with its tip at the lamps, opening toward the target and fading with distance
  const len = at.distanceTo(target) * 0.95;
  const beamMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  // cone uv.y is 1 at the tip; facing the camera it glows, edge-on it fades, so the silhouette stays soft
  const facing = pow(abs(dot(normalView, positionViewDirection)), 1.5);
  beamMat.colorNode = rgb('#fff1d6').mul(pow(uv().y, 2.4).mul(facing).mul(0.09).mul(uFlood));
  // ConeGeometry has its tip up +Y: drop it so the tip is at the origin, then swing it to open along +Z (where lookAt faces)
  const beamGeo = new THREE.ConeGeometry(3.6, len, 24, 1, true).translate(0, -len / 2, 0).rotateX(-Math.PI / 2);
  head.add(new THREE.Mesh(beamGeo, beamMat));
  head.lookAt(target);
  g.add(head);
  return g;
}

/** A fading ribbon of tail-light behind a car (positions sampled along its path). */
class Trail {
  readonly mesh: THREE.Mesh;
  private pts: THREE.Vector3[] = [];
  private pos: Float32Array;
  constructor(
    private n: number,
    color: string,
  ) {
    this.pos = new Float32Array(n * 2 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    const fade = new Float32Array(n * 2 * 2);
    for (let i = 0; i < n; i++) fade.set([i / (n - 1), 0, i / (n - 1), 1], i * 4);
    geo.setAttribute('uv', new THREE.BufferAttribute(fade, 2));
    const index: number[] = [];
    for (let i = 0; i < n - 1; i++) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    geo.setIndex(index);
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const u = uv();
    // bright at the car, fading out behind; soft top and bottom edges
    mat.colorNode = rgb(color).mul(pow(float(1).sub(u.x), 1.6).mul(smoothstep(0, 0.5, u.y).mul(smoothstep(1, 0.5, u.y))).mul(2.6));
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
  }

  push(p: THREE.Vector3) {
    const head = this.pts[0];
    // a new sample every 0.2 units; in between, the head just follows the car
    if (head && this.pts.length > 1 && head.distanceToSquared(this.pts[1]) < 0.04) head.copy(p);
    else {
      this.pts.unshift(p.clone());
      if (this.pts.length > this.n) this.pts.pop();
    }
    for (let i = 0; i < this.n; i++) {
      const q = this.pts[Math.min(i, this.pts.length - 1)];
      this.pos.set([q.x, 0.18, q.z, q.x, 0.62, q.z], i * 6);
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }
}

function makeGround() {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.9 });
  const xz = positionWorld.xz;
  const d = trackDistance(xz);
  const ad = abs(d);
  // mown grass
  const mow = step(0.5, fract(xz.x.mul(0.16).add(xz.y.mul(0.05))));
  const grassNoise = mx_noise_float(vec3(xz.mul(0.35), 0)).mul(0.06);
  let col: N = mix(rgb('#1f4d22'), rgb('#275c29'), mow).add(grassNoise.mul(0.5));
  // asphalt with a little grain
  const grain = hash(floor(xz.mul(14)).dot(vec2(1, 57))).mul(0.05);
  const onTrack = float(1).sub(smoothstep(W - 0.03, W + 0.03, ad));
  col = mix(col, rgb('#3a3d42').add(grain), onTrack);
  // white edge lines
  col = mix(col, rgb('#f2f2f2'), smoothstep(0.1, 0.0, abs(ad.sub(W - 0.22))).mul(onTrack));
  // red/white kerbs on the bends, just outside the track edges
  const angle = atan(xz.y.sub(ZC).div(B), xz.x.div(A));
  const stripes = step(0.5, fract(angle.mul(28 / Math.PI)));
  const kerbBand = smoothstep(W, W + 0.02, ad).mul(float(1).sub(smoothstep(W + 0.62, W + 0.66, ad)));
  const onBend = smoothstep(A * 0.55, A * 0.65, abs(xz.x));
  col = mix(col, mix(rgb('#e10600'), rgb('#f5f5f5'), stripes), kerbBand.mul(onBend));
  // chequered start/finish line
  const onLine = float(1).sub(smoothstep(0.45, 0.5, abs(xz.x.sub(GANTRY_X)))).mul(onTrack).mul(step(xz.y, ZC));
  const check = step(0.5, fract(floor(xz.x.mul(2.6)).add(floor(xz.y.mul(2.6))).mul(0.5)));
  col = mix(col, mix(rgb('#111111'), rgb('#f5f5f5'), check), onLine);
  mat.colorNode = col;
  // damp asphalt catches the floodlights; the grass stays matte
  mat.roughnessNode = mix(float(0.92), float(0.22).add(mx_noise_float(vec3(xz.mul(0.5), 3)).mul(0.15)), onTrack);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 160), mat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = -30;
  return ground;
}

/** A low-poly formula car facing +X; livery parts and black parts share two meshes. */
function makeCar(livery: string) {
  const box = (w: number, h: number, d: number, x: number, y: number, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const body = mergeGeometries([
    box(2.0, 0.28, 0.55, 0, 0.32), // chassis
    box(0.95, 0.17, 0.3, 1.38, 0.27), // nose
    box(0.95, 0.24, 1.0, -0.15, 0.3), // sidepods
    box(0.85, 0.3, 0.34, -0.62, 0.52), // engine cover
    box(0.26, 0.34, 1.12, -1.18, 0.66), // rear wing
  ])!;
  const dark = mergeGeometries([
    box(0.32, 0.06, 1.34, 1.78, 0.14), // front wing
    box(0.42, 0.12, 0.36, 0.2, 0.52), // cockpit
    ...[-0.85, 0.85].flatMap((x) => [-0.64, 0.64].map((z) => new THREE.CylinderGeometry(0.27, 0.27, 0.28, 16).rotateX(Math.PI / 2).translate(x, 0.27, z))),
  ])!;
  const paint = new THREE.MeshStandardNodeMaterial({ color: livery, roughness: 0.3, metalness: 0.4 });
  const rubber = new THREE.MeshStandardNodeMaterial({ color: '#16171a', roughness: 0.7 });
  const car = new THREE.Group();
  car.add(new THREE.Mesh(body, paint), new THREE.Mesh(dark, rubber));
  // soft contact shadow
  const shadowMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  shadowMat.colorNode = vec3(0);
  shadowMat.opacityNode = float(1).sub(smoothstep(0.2, 0.5, length(uv().sub(0.5)))).mul(0.45);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(4, 1.8).rotateX(-Math.PI / 2), shadowMat);
  shadow.position.y = 0.02;
  car.add(shadow);
  car.scale.setScalar(0.9);
  return car;
}

/** Start/finish gantry with a board of five pairs of start lights facing the stands. */
function makeGantry(uLit: N) {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardNodeMaterial({ color: '#2b2f36', metalness: 0.7, roughness: 0.4 });
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 6.6, 0.35), steel);
    post.position.set(0, 3.3, s * (W + 0.5));
    g.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, (W + 0.5) * 2 + 0.35), steel);
  beam.position.y = 6.5;
  g.add(beam);
  const board = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.15, 0.25), new THREE.MeshStandardNodeMaterial({ color: '#111', roughness: 0.5 }));
  board.position.set(0, 7.35, 0.2);
  g.add(board);
  // lamp i is lit while uLit > i
  const lampMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.3 });
  // which of the five columns this fragment belongs to (columns are 0.62 apart, centred on the board)
  const idx = positionWorld.x.sub(GANTRY_X - 1.24 - 0.31).div(0.62).floor();
  const on = step(idx.add(0.5), uLit);
  lampMat.colorNode = mix(rgb('#3a0b0b'), rgb('#ff2a1f'), on);
  lampMat.emissiveNode = rgb('#ff1a10').mul(on.mul(3.2));
  const lamps = mergeGeometries(
    [0, 1, 2, 3, 4].flatMap((i) => [-0.24, 0.24].map((y) => new THREE.CylinderGeometry(0.19, 0.19, 0.12, 20).rotateX(Math.PI / 2).translate(-1.24 + i * 0.62, y, 0))),
  )!;
  const lampMesh = new THREE.Mesh(lamps, lampMat);
  lampMesh.position.set(0, 7.35, 0.36);
  g.add(lampMesh);
  g.position.set(GANTRY_X, 0, FAR_Z);
  return g;
}

/** Tiered grandstand with a speckled crowd that ripples when it cheers. */
function makeGrandstand(uCheer: N) {
  const g = new THREE.Group();
  const crowd = new THREE.MeshStandardNodeMaterial({ roughness: 0.8 });
  const cell = floor(positionWorld.mul(vec3(3, 2.2, 3)));
  const h = hash(cell.dot(vec3(1, 57, 113)));
  const shirt = mix(mix(rgb('#e10600'), rgb('#ffd400'), step(0.33, h)), mix(rgb('#f2f2f2'), rgb('#0057ff'), step(0.8, h)), step(0.6, h));
  const seat = rgb('#4a5160');
  const occupied = step(0.25, hash(cell.dot(vec3(7, 13, 3))));
  // a Mexican wave running along the stand
  const wave = smoothstep(0.85, 1, sin(positionWorld.x.mul(0.35).sub(time.mul(4))).mul(0.5).add(0.5)).mul(uCheer);
  crowd.colorNode = mix(seat, shirt, occupied).mul(float(1).add(wave.mul(0.8)));
  // phone cameras flashing in the crowd, more of them while it cheers
  const flash = step(float(0.996).sub(uCheer.mul(0.02)), hash(cell.dot(vec3(3, 11, 29)).add(floor(time.mul(6)))));
  crowd.emissiveNode = vec3(flash.mul(occupied).mul(3)).add(rgb('#fff1d6').mul(wave.mul(0.4)));
  for (let i = 0; i < 5; i++) {
    const tier = new THREE.Mesh(new THREE.BoxGeometry(46, 0.9, 1.6), crowd);
    tier.position.set(0, 0.45 + i * 0.9, -i * 1.6);
    g.add(tier);
  }
  const roofMat = new THREE.MeshStandardNodeMaterial({ color: '#2a2e36', metalness: 0.3, roughness: 0.5 });
  const roof = new THREE.Mesh(new THREE.BoxGeometry(47, 0.25, 9), roofMat);
  roof.position.set(0, 6.6, -3.2);
  roof.rotation.x = -0.08;
  g.add(roof);
  // a strip of lights under the roof's front edge
  const strip = new THREE.Mesh(new THREE.BoxGeometry(46, 0.12, 0.12), new THREE.MeshBasicNodeMaterial({ color: new THREE.Color('#fff1d6').multiplyScalar(1.2) }));
  strip.position.set(0, 6.55, 1.2);
  g.add(strip);
  for (const x of [-22, -11, 0, 11, 22]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 6.6, 0.3), roofMat);
    post.position.set(x, 3.3, -6.8);
    g.add(post);
  }
  g.position.set(0, 0, FAR_Z - W - 4.5);
  return g;
}

/** Sponsor boards along the outside of the far straight. */
function makeBoards() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 192;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#e10600';
  ctx.fillRect(0, 0, 1024, 192);
  ctx.fillStyle = '#fff';
  ctx.font = 'italic 900 118px "Racing Sans One", "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('LOCOSPIN GP', 512, 100);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  // LED boards: they glow on their own at night
  const mat = new THREE.MeshBasicNodeMaterial();
  mat.colorNode = texture(tex).rgb.mul(1.6);
  const g = new THREE.Group();
  for (const x of [-14, 0, 14]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(7, 1.3, 0.15), mat);
    b.position.set(x, 0.85, FAR_Z - W - 1.2);
    g.add(b);
  }
  return g;
}

/** Stacks of old tyres marking the run-off beside the stage. */
function makeTyreStacks() {
  const geo = new THREE.TorusGeometry(0.42, 0.17, 10, 22).rotateX(Math.PI / 2);
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.75 }); // colours come per instance: painted top tyres
  const spots: [number, number][] = [
    [-6.4, -2.2],
    [-7.2, -1.2],
    [6.6, -2.4],
    [7.4, -1.4],
  ];
  const per = 5;
  const mesh = new THREE.InstancedMesh(geo, mat, spots.length * per);
  const m = new THREE.Matrix4();
  const colors = [new THREE.Color('#1b1c1f'), new THREE.Color('#e10600'), new THREE.Color('#f2f2f2')];
  spots.forEach(([x, z], s) => {
    for (let i = 0; i < per; i++) {
      m.makeTranslation(x, 0.17 + i * 0.33, z);
      mesh.setMatrixAt(s * per + i, m);
      mesh.setColorAt(s * per + i, i === per - 1 ? colors[1 + (s % 2)] : colors[0]);
    }
  });
  return mesh;
}

/** A chequered flag on a pole, rippling in the wind (harder while `uWave` is up). */
function makeFlag(uWave: N, phase: number) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 4.6, 10), new THREE.MeshStandardNodeMaterial({ color: '#d0d4da', metalness: 0.8, roughness: 0.3 }));
  pole.position.y = 2.3;
  g.add(pole);
  const mat = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.8 });
  const u = uv();
  const amp = float(0.1).add(uWave.mul(0.25));
  const ripple = sin(u.x.mul(7).sub(time.mul(float(6).add(uWave.mul(6)))).add(phase)).mul(amp).mul(u.x);
  mat.positionNode = positionLocal.add(vec3(0, ripple.mul(0.4), ripple));
  mat.colorNode = mix(rgb('#111111'), rgb('#f5f5f5'), step(0.5, fract(floor(u.x.mul(8)).add(floor(u.y.mul(5))).mul(0.5))));
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.05, 20, 6).translate(0.85, 0, 0), mat);
  flag.position.y = 4.0;
  g.add(flag);
  return g;
}

/** Simple round trees around the circuit for depth. */
function makeTrees() {
  const canopyGeo = new THREE.IcosahedronGeometry(1, 1);
  const trunkGeo = new THREE.CylinderGeometry(0.15, 0.22, 1.4, 6).translate(0, 0.7, 0);
  const canopyMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, flatShading: true });
  const trunkMat = new THREE.MeshStandardNodeMaterial({ color: '#5b3d26', roughness: 0.9 });
  const spots: [number, number, number][] = [];
  for (let i = 0; i < 70; i++) {
    const a = rand(0, Math.PI * 2);
    const r = rand(1.35, 2.1);
    const x = Math.cos(a) * A * r;
    const z = ZC + Math.sin(a) * B * r * 1.6;
    if (z > -4 || Math.abs(z - (FAR_Z - W - 7)) < 6) continue; // keep the stage and the grandstand clear
    spots.push([x, z, rand(1.1, 2)]);
  }
  const canopy = new THREE.InstancedMesh(canopyGeo, canopyMat, spots.length);
  const trunk = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  spots.forEach(([x, z, s], i) => {
    m.compose(new THREE.Vector3(x, 1.4 * s + s * 0.6, z), new THREE.Quaternion(), new THREE.Vector3(s, s * 1.15, s));
    canopy.setMatrixAt(i, m);
    canopy.setColorAt(i, c.set(i % 3 ? '#16331c' : '#1d4024'));
    m.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
    trunk.setMatrixAt(i, m);
  });
  const g = new THREE.Group();
  g.add(canopy, trunk);
  return g;
}

export interface RaceScene extends ThemeScene {
  /** All cars go `factor`× faster for a while (celebrations). */
  boost(factor: number, seconds: number): void;
  /** Flags whip in the wind. */
  wave(seconds: number): void;
  /** The grandstand does a Mexican wave. */
  cheer(seconds: number): void;
}

// ------------------------------------------------------------------ theme

export const grandprix: Theme<RaceScene> = {
  ...meta,
  wheel: {
    palette: PALETTE,
    font: `"${meta.font.family}"`,
    fontWeight: meta.font.weight,
    rim: ['#1a1a1d', '#e10600'],
    holo: 0.15,
    flapper: '#ffd400',
    leds: ['#ffffff', '#ff2a1f'],
    hub: ['#e10600', '#1a1a1d'],
    pegs: '#f2f2f2',
    frame: '#121214',
    tire: { text: 'LOCOSPIN  •  GRAND PRIX', color: '#ffd400' },
  },
  // night race: the floodlights, tail-lights and LED boards carry the bloom
  post: { bloom: [0.55, 0.4, 0.78], exposure: 1, aberration: 0.7, vignette: 0.55 },
  character: { spot: [0, 0.22, 1.6], entrance: 'rise' },
  tick: 'click',
  song: {
    bpm: 150,
    root: 57,
    scale: SCALES.minor,
    progressions: [
      [0, 5, 3, 4],
      [0, 3, 4, 4],
      [5, 3, 0, 4],
    ],
    lead: 'sawtooth',
    bass: 'square',
    drums: 'four',
    density: 0.65,
    arp: false,
    brightness: 4600,
  },

  createScene({ scene, center }) {
    const group = new THREE.Group();
    scene.backgroundNode = sky();
    scene.fogNode = fog(rgb('#0d1226'), rangeFogFactor(40, 120));
    scene.environmentIntensity = 0.18;

    const uLit = uniform(0); // start lights showing (0..5)
    const uWave = uniform(0);
    const uCheer = uniform(0);
    const uFlood = uniform(1);
    // floodlights on four masts around the circuit, all aimed into the oval
    const MASTS = [new THREE.Vector3(-27, 15, -6), new THREE.Vector3(27, 15, -6), new THREE.Vector3(-15, 17, -25), new THREE.Vector3(15, 17, -25)];
    for (const at of MASTS) group.add(makeFloodlight(at, new THREE.Vector3(at.x * 0.35, 0, ZC + 2), uFlood));

    group.add(makeGround(), makeGantry(uLit), makeGrandstand(uCheer), makeBoards(), makeTyreStacks(), makeTrees());
    for (const [x, phase] of [
      [-5.3, 0],
      [5.3, 1.7],
    ] as const) {
      const flag = makeFlag(uWave, phase);
      flag.position.set(x, 0, 0.6);
      if (x > 0) flag.rotation.y = Math.PI; // both fly inward, framing the wheel
      group.add(flag);
    }

    // chequered podium plinth on red legs
    const legs = new THREE.MeshStandardNodeMaterial({ color: '#e10600', metalness: 0.5, roughness: 0.35 });
    const podium = new THREE.MeshStandardNodeMaterial({ roughness: 0.5 });
    podium.colorNode = mix(rgb('#141416'), rgb('#f2f2f2'), step(0.5, fract(floor(positionLocal.x.mul(1.6)).add(floor(positionLocal.z.mul(1.6))).mul(0.5))));
    group.add(
      makeStand(center, {
        legs,
        plinth: podium,
        neon: mix(rgb('#ff2a1f'), rgb('#ffffff'), step(0.5, fract(time.mul(1.5)))).mul(float(1.6).add(uSpeed.mul(0.08)).add(uWin.mul(2.5))),
      }),
    );

    // the field: five cars lapping the oval, spread around it
    const cars = LIVERIES.map((livery, i) => {
      const car = makeCar(livery);
      group.add(car);
      const trail = new Trail(26, '#ff2a1f');
      group.add(trail.mesh);
      return { car, trail, s: (i / LIVERIES.length) * Math.PI * 2 + rand(-0.15, 0.15), lane: rand(-0.7, 0.7), pace: rand(0.92, 1.08), boost: 1, boostLeft: 0 };
    });
    let fieldBoost = 1;
    let fieldBoostLeft = 0;
    const tangent = new THREE.Vector2();
    const tail = new THREE.Vector3();
    const placeCars = (dt: number, speed: number) => {
      fieldBoostLeft = Math.max(0, fieldBoostLeft - dt);
      if (!fieldBoostLeft) fieldBoost += (1 - fieldBoost) * (1 - Math.exp(-dt * 1.5));
      for (const c of cars) {
        c.boostLeft = Math.max(0, c.boostLeft - dt);
        if (!c.boostLeft) c.boost += (1 - c.boost) * (1 - Math.exp(-dt * 1.2));
        tangent.set(-A * Math.sin(c.s), B * Math.cos(c.s));
        const v = 13 * c.pace * c.boost * fieldBoost * (1 + Math.min(1.5, speed * 0.12));
        c.s += (dt * v) / tangent.length();
        const n = tangent.clone().normalize(); // normal = tangent rotated a quarter turn
        const x = A * Math.cos(c.s) + n.y * c.lane;
        const z = ZC + B * Math.sin(c.s) - n.x * c.lane;
        c.car.position.set(x, 0, z);
        c.car.rotation.y = Math.atan2(-n.y, n.x);
        // the trail starts at the rear wing
        const tl = tangent.length();
        tail.set(x - (tangent.x / tl) * 1.1, 0, z - (tangent.y / tl) * 1.1);
        c.trail.push(tail);
      }
    };
    placeCars(0, 0);

    // start lights: a slow attract cycle while idle, "lights out" when a spin starts
    let lightsT = 0;
    let lightsOut = -1; // time since a spin launched (start sequence), <0 = idle cycle
    let wasSpinning = false;
    const runLights = (dt: number, spinning: boolean) => {
      if (spinning && !wasSpinning) lightsOut = 0;
      wasSpinning = spinning;
      if (lightsOut >= 0) {
        lightsOut += dt;
        // all five on in quick succession, then out: away we go
        uLit.value = lightsOut < 0.75 ? Math.min(5, Math.floor(lightsOut / 0.13) + 1) : 0;
        if (lightsOut > 2) lightsOut = -1;
        return;
      }
      lightsT = (lightsT + dt) % 9;
      uLit.value = lightsT < 5 ? Math.floor(lightsT) + 1 : lightsT < 6.5 ? 5 : 0;
    };

    let waveLeft = 0;
    let cheerLeft = 0;
    const ease = (u: { value: number }, on: boolean, k: number, dt: number) => (u.value += ((on ? 1 : 0) - u.value) * (1 - Math.exp(-dt * k)));

    // idle moments: the blimp drifts over, a car makes a move, the marshals wave the flags
    const sprites = atlas();
    const moments = idleMoments();
    const blimp = moments.track(
      flyby({ atlas: sprites, cells: [6], count: 1, from: [-38, 10, -34], dir: [1, 0.01, 0], speed: [4, 4.5], life: 19, size: [3.6, 3.6], wobble: 0.3, stagger: 0, fog: false }),
    );
    group.add(blimp.object);
    moments.add(() => blimp.fire());
    moments.add(() => {
      const c = cars[Math.floor(Math.random() * cars.length)];
      c.boost = 1.7;
      c.boostLeft = 2.5;
    });
    moments.add(() => (waveLeft = 2.5));

    // a cool TV-lighting key on the stage, warm floodlight pools on the track
    const boostLights = makeLights(
      group,
      ['#dfe8ff', 0.9],
      MASTS.map((m): [string, number, THREE.Vector3Tuple] => ['#fff1d6', 160, [m.x * 0.6, 9, m.z * 0.6 + ZC * 0.4]]),
    );
    group.add(new THREE.HemisphereLight('#3a4a80', '#10180f', 0.35));

    return {
      group,
      moments,
      boost(factor, seconds) {
        fieldBoost = Math.max(fieldBoost, factor);
        fieldBoostLeft = Math.max(fieldBoostLeft, seconds);
      },
      wave(seconds) {
        waveLeft = Math.max(waveLeft, seconds);
      },
      cheer(seconds) {
        cheerLeft = Math.max(cheerLeft, seconds);
      },
      update(f) {
        boostLights(f.speed, f.win);
        moments.update(f);
        placeCars(f.dt, f.speed);
        runLights(f.dt, f.spinning);
        waveLeft = Math.max(0, waveLeft - f.dt);
        cheerLeft = Math.max(0, cheerLeft - f.dt);
        ease(uWave, waveLeft > 0 || f.speed > 6, 3, f.dt);
        ease(uCheer, cheerLeft > 0, 3, f.dt);
      },
    };
  },

  celebrations,
};
