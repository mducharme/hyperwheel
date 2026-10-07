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
  mx_fractal_noise_float,
  mx_noise_float,
  positionLocal,
  positionWorld,
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
import { makeLights, makeStand, rgb } from '../shared';
import { lowRes } from '../../fx/nodes';
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
  const horizon = (uvS: N) => smoothstep(0.05, 0.62, uvS.y); // screenUV.y grows downward
  // soft drifting clouds: rendered at quarter resolution
  const clouds = Fn(() => {
    const uvS = screenUV;
    const p = vec2(uvS.x.mul(screenSize.x.div(screenSize.y)), uvS.y);
    const n = mx_fractal_noise_float(vec3(p.mul(vec2(1.6, 4)).add(vec2(time.mul(0.01), 0)), time.mul(0.004)), 4, 2, 0.5);
    let col: N = mix(rgb('#1f6fd1'), rgb('#bfe3ff'), horizon(uvS));
    col = mix(col, rgb('#ffffff'), smoothstep(0.05, 0.45, n).mul(float(1).sub(horizon(uvS).mul(0.6))).mul(0.85));
    return vec4(col, 1);
  });
  return lowRes(clouds()).rgb;
}

function makeGround() {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.9 });
  const xz = positionWorld.xz;
  const d = trackDistance(xz);
  const ad = abs(d);
  // mown grass
  const mow = step(0.5, fract(xz.x.mul(0.16).add(xz.y.mul(0.05))));
  const grassNoise = mx_noise_float(vec3(xz.mul(0.35), 0)).mul(0.06);
  let col: N = mix(rgb('#3f8f3a'), rgb('#4fa547'), mow).add(grassNoise);
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
  for (let i = 0; i < 5; i++) {
    const tier = new THREE.Mesh(new THREE.BoxGeometry(46, 0.9, 1.6), crowd);
    tier.position.set(0, 0.45 + i * 0.9, -i * 1.6);
    g.add(tier);
  }
  const roofMat = new THREE.MeshStandardNodeMaterial({ color: '#e9ecf1', metalness: 0.3, roughness: 0.5 });
  const roof = new THREE.Mesh(new THREE.BoxGeometry(47, 0.25, 9), roofMat);
  roof.position.set(0, 6.6, -3.2);
  roof.rotation.x = -0.08;
  g.add(roof);
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
  ctx.fillText('HYPERWHEEL GP', 512, 100);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardNodeMaterial({ map: tex, roughness: 0.6 });
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
    canopy.setColorAt(i, c.set(i % 3 ? '#2f7a34' : '#3d8f3c'));
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
    tire: { text: 'HYPERWHEEL  •  GRAND PRIX', color: '#ffd400' },
  },
  // daylight: keep bloom for the lamps and sparkles only, so the bright sky doesn't haze everything
  post: { bloom: [0.18, 0.3, 0.97], exposure: 0.86, aberration: 0.6, vignette: 0.4 },
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
    scene.fogNode = fog(rgb('#cfe7ff'), rangeFogFactor(45, 120));
    scene.environmentIntensity = 0.35;

    const uLit = uniform(0); // start lights showing (0..5)
    const uWave = uniform(0);
    const uCheer = uniform(0);

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
      return { car, s: (i / LIVERIES.length) * Math.PI * 2 + rand(-0.15, 0.15), lane: rand(-0.7, 0.7), pace: rand(0.92, 1.08), boost: 1, boostLeft: 0 };
    });
    let fieldBoost = 1;
    let fieldBoostLeft = 0;
    const tangent = new THREE.Vector2();
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

    const boostLights = makeLights(group, ['#fff4dc', 1.6], []);
    group.add(new THREE.HemisphereLight('#cfe7ff', '#4b8a3e', 0.55));

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
