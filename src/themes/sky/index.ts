import * as THREE from 'three/webgpu';
import {
  abs,
  atan,
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
  pow,
  rangeFogFactor,
  screenSize,
  screenUV,
  smoothstep,
  step,
  time,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import type { Theme, ThemeScene } from '../types';
import { makeLights, makeStand, rgb } from '../shared';
import { lowRes } from '../../fx/nodes';
import { uSpeed, uWin } from '../../engine/globals';
import { SCALES } from '../../audio/ChipSynth';
import { meta, PALETTE } from './meta';
import { rand } from '../../fx/util';
import { Particles } from '../../fx/Particles';
import { atlas } from './sprites';
import { flyby, idleMoments } from '../../fx/ambient';
import { celebrations } from './celebrations';

type N = any;

const CLOUD_Y = -16;

// ------------------------------------------------------------------ sky & clouds

function skyBackground() {
  const aspect = screenSize.x.div(screenSize.y);
  const sunAt = vec2(aspect.mul(0.86), 0.3);
  const golden = Fn(() => {
    const uvS = screenUV; // y grows downward
    const p = vec2(uvS.x.mul(aspect), uvS.y);
    // golden hour: soft blue overhead warming to peach and gold toward the horizon
    let col: N = mix(rgb('#4f78c4'), rgb('#f7b98a'), smoothstep(0.0, 0.5, uvS.y));
    col = mix(col, rgb('#ffe1a8'), smoothstep(0.35, 0.62, uvS.y));
    // a wide warm halo around the low sun
    const toSun = length(p.sub(sunAt));
    col = col.add(rgb('#ffd38a').mul(pow(float(1).sub(toSun.min(1)), 3).mul(0.75)));
    // streaky clouds lit gold on their undersides
    const wisps = mx_fractal_noise_float(vec3(p.mul(vec2(1, 4)).add(vec2(time.mul(0.008), 0)), 0), 3, 2, 0.5);
    const cloudCol = mix(rgb('#f7c6d9'), rgb('#ffd59a'), smoothstep(0.1, 0.45, uvS.y));
    col = mix(col, cloudCol, smoothstep(0.2, 0.6, wisps).mul(smoothstep(0.55, 0.1, uvS.y)).mul(0.65));
    return vec4(col, 1);
  });
  const p = vec2(screenUV.x.mul(aspect), screenUV.y);
  const sun = smoothstep(0.07, 0.06, length(p.sub(sunAt)));
  return lowRes(golden()).rgb.add(rgb('#fff4d6').mul(sun.mul(2.2)));
}

/** An endless sea of cloud far below, drifting slowly. */
function makeCloudSea() {
  const m = new THREE.MeshBasicNodeMaterial();
  const xz = positionWorld.xz;
  const drift = vec2(time.mul(0.6), time.mul(0.25));
  const n = mx_fractal_noise_float(vec3(xz.mul(0.035).add(drift.mul(0.035)), time.mul(0.01)), 3, 2, 0.5).mul(0.5).add(0.5);
  // lavender in the hollows, gold on the tops
  m.colorNode = mix(rgb('#a99ac8'), rgb('#ffe6c2'), smoothstep(0.3, 0.75, n));
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(500, 400), m);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, CLOUD_Y, -120);
  return sea;
}

// ------------------------------------------------------------------ islands

const grassMat = () => {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9 });
  m.colorNode = mix(rgb('#7aa845'), rgb('#a8c25a'), mx_noise_float(positionWorld.mul(0.6)).mul(0.5).add(0.5));
  return m;
};
const rockMat = () => {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 1, flatShading: true });
  const strata = fract(positionWorld.y.mul(0.8).add(mx_noise_float(positionWorld.mul(0.3)).mul(0.6)));
  m.colorNode = mix(rgb('#8a6a4a'), rgb('#b08a62'), smoothstep(0.3, 0.7, strata));
  return m;
};

/** A floating island: a grassy top and a jagged rocky underside tapering to a point. */
function makeIsland(radius: number, depth: number, grass: THREE.Material, rock: THREE.Material) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.97, 0.7, 28).translate(0, -0.35, 0), grass));
  const under = new THREE.ConeGeometry(radius * 0.98, depth, 16, 4).rotateX(Math.PI).translate(0, -0.7 - depth / 2, 0);
  const p = under.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 1 + Math.sin(i * 2.7) * 0.12;
    p.setX(i, p.getX(i) * k);
    p.setZ(i, p.getZ(i) * k);
  }
  under.computeVertexNormals();
  g.add(new THREE.Mesh(under, rock));
  return g;
}

function makeTree(leaf: THREE.Material, trunk: THREE.Material, scale: number) {
  const t = new THREE.Group();
  t.add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.6, 6).translate(0, 0.8, 0), trunk));
  for (const [y, s] of [
    [1.9, 0.95],
    [2.6, 0.7],
  ]) {
    const c = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), leaf);
    c.position.y = y;
    t.add(c);
  }
  t.scale.setScalar(scale);
  return t;
}

/** A waterfall pouring off an island's edge and thinning into mist as it falls. */
function makeWaterfall(height: number) {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  const u = uv();
  const streak = fract(u.y.mul(3).add(time.mul(1.4)).add(mx_noise_float(vec3(u.x.mul(10), 0, 0)).mul(0.5)));
  m.colorNode = mix(rgb('#bfe6ff'), rgb('#ffffff'), smoothstep(0.5, 1, streak));
  m.opacityNode = float(0.75).mul(smoothstep(0, 0.2, u.x).mul(smoothstep(1, 0.8, u.x))).mul(smoothstep(0, 0.45, u.y));
  const fall = new THREE.Mesh(new THREE.PlaneGeometry(1.6, height), m);
  fall.position.y = -height / 2;
  return fall;
}

/** A hot-air balloon: striped envelope, ropes and a wicker basket. */
function makeBalloon(a: string, b: string) {
  const g = new THREE.Group();
  const env = new THREE.MeshStandardNodeMaterial({ roughness: 0.55 });
  const ang = atan(positionLocal.z, positionLocal.x);
  env.colorNode = mix(rgb(a), rgb(b), step(0.5, fract(ang.mul(10 / (Math.PI * 2)))));
  const shape = new THREE.LatheGeometry(
    [
      [0.25, -1.6],
      [0.9, -1.0],
      [1.5, 0],
      [1.55, 0.6],
      [1.2, 1.3],
      [0.6, 1.7],
      [0.001, 1.8],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    20,
  );
  g.add(new THREE.Mesh(shape, env));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5).translate(0, -2.5, 0), new THREE.MeshStandardNodeMaterial({ color: '#8a5a2b', roughness: 0.9 })));
  return g;
}

/** A fluffy sheep: a lumpy wool body, a dark face and four stubby legs. Facing +X. */
function makeSheep(wool: THREE.Material, dark: THREE.Material) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  for (const [x, y, z, r] of [
    [0, 0.75, 0, 0.5],
    [0.3, 0.8, 0.12, 0.38],
    [-0.3, 0.8, -0.1, 0.4],
    [0.05, 1.0, 0, 0.36],
    [-0.2, 0.72, 0.22, 0.34],
    [0.2, 0.7, -0.22, 0.34],
  ]) {
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), wool);
    puff.position.set(x, y, z);
    body.add(puff);
  }
  g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.3).translate(0.62, 0.88, 0), dark);
  g.add(head);
  for (const s of [-1, 1]) g.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.22).translate(0.58, 1.02, s * 0.2), dark));
  for (const [x, z] of [
    [0.28, 0.2],
    [0.28, -0.2],
    [-0.28, 0.2],
    [-0.28, -0.2],
  ]) g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.42, 6).translate(x, 0.21, z), dark));
  return { group: g, head };
}

/** A diamond kite with a ribbon tail, on a long string. */
function makeKite(a: string, b: string) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.6 });
  const u = uv();
  mat.colorNode = mix(rgb(a), rgb(b), step(0.5, u.x).add(step(0.5, u.y)).mod(2));
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.9);
  shape.lineTo(0.6, 0.15);
  shape.lineTo(0, -1);
  shape.lineTo(-0.6, 0.15);
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape);
  // planar UVs over the kite so the quadrants line up on the cross spars
  const p = geo.attributes.position;
  const uvs = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) uvs.setXY(i, p.getX(i) / 1.2 + 0.5, p.getY(i) > 0.15 ? 1 : 0);
  g.add(new THREE.Mesh(geo, mat));
  const bow = new THREE.MeshStandardNodeMaterial({ color: b, side: THREE.DoubleSide });
  const bows = Array.from({ length: 5 }, (_, i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.12), bow);
    m.position.y = -1.2 - i * 0.42;
    g.add(m);
    return m;
  });
  return { group: g, bows };
}

/** A goofy little airship: a round striped envelope, fins, a gondola and a spinning propeller. Facing +X. */
function makeAirship() {
  const g = new THREE.Group();
  const env = new THREE.MeshStandardNodeMaterial({ roughness: 0.5 });
  env.colorNode = mix(rgb('#e8402e'), rgb('#ffd23f'), step(0.5, fract(positionLocal.x.mul(0.9))));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16).scale(2.6, 1.15, 1.15), env));
  const fin = new THREE.MeshStandardNodeMaterial({ color: '#4ecdc4', roughness: 0.5, side: THREE.DoubleSide });
  for (const r of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(1, 0.9, 0.06).translate(-2.4, 0.75, 0), fin);
    f.rotation.x = r;
    g.add(f);
  }
  const wood = new THREE.MeshStandardNodeMaterial({ color: '#8a5a2b', roughness: 0.8 });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.45, 0.6).translate(0, -1.45, 0), wood));
  const prop = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 0.16), new THREE.MeshStandardNodeMaterial({ color: '#3a3a3e', metalness: 0.5 }));
  prop.position.set(-0.75, -1.45, 0);
  g.add(prop);
  return { group: g, prop };
}

/** A big gentle whale made of cloud, gliding far off. Facing +X. */
function makeCloudWhale() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 1, transparent: true, depthWrite: false });
  mat.colorNode = mix(rgb('#ffffff'), rgb('#ffe2c4'), mx_noise_float(positionLocal.mul(0.6)).mul(0.5).add(0.5));
  mat.emissiveNode = rgb('#ffd9b0').mul(0.35);
  mat.opacityNode = float(0.88);
  const body = new THREE.LatheGeometry(
    [
      [0.001, -6],
      [1.6, -5],
      [2.6, -2.5],
      [2.8, 0.5],
      [2.1, 3.5],
      [0.9, 6],
      [0.5, 7],
      [0.001, 7.2],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    20,
  ).rotateZ(-Math.PI / 2);
  g.add(new THREE.Mesh(body, mat));
  // tail flukes and side fins
  const fluke = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8).scale(1, 0.25, 2.2), mat);
  fluke.position.set(-7.5, 0.4, 0);
  g.add(fluke);
  for (const s of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6).scale(1.4, 0.2, 0.6), mat);
    fin.position.set(2.2, -1.4, s * 2.4);
    fin.rotation.y = s * 0.5;
    g.add(fin);
  }
  return { group: g, fluke };
}

export interface SkyScene extends ThemeScene {
  /** A rainbow arcs across the sky for a while. */
  rainbow(seconds: number): void;
}

// ------------------------------------------------------------------ theme

export const sky: Theme<SkyScene> = {
  ...meta,
  wheel: {
    palette: PALETTE,
    font: `"${meta.font.family}"`,
    fontWeight: meta.font.weight,
    rim: ['#b98a3f', '#e0c06a'],
    holo: 0.1,
    flapper: '#ff6b6b',
    leds: ['#fff1c4', '#9ff3ff'],
    hub: ['#ff6b6b', '#ffe66d'],
    pegs: '#e0c06a',
    frame: '#2b3a4a',
    rivets: '#c9a25a',
    pointer: 'balloon',
  },
  post: { bloom: [0.3, 0.4, 0.88], exposure: 0.9, aberration: 0.5, vignette: 0.45 },
  character: { spot: [0, 0.22, 1.6], entrance: 'pop' },
  tick: 'pop',
  song: {
    bpm: 120,
    root: 65,
    scale: SCALES.major,
    progressions: [
      [0, 4, 5, 3],
      [0, 3, 4, 4],
      [5, 3, 0, 4],
    ],
    lead: 'triangle',
    bass: 'sine',
    drums: 'four',
    density: 0.55,
    arp: true,
    brightness: 5200,
  },

  createScene({ scene, center }) {
    const group = new THREE.Group();
    scene.backgroundNode = skyBackground();
    scene.fogNode = fog(rgb('#f6d2b0'), rangeFogFactor(50, 200));
    scene.environmentIntensity = 0.35;

    const grass = grassMat();
    const rock = rockMat();
    const leaf = new THREE.MeshStandardNodeMaterial({ roughness: 0.8, flatShading: true });
    leaf.colorNode = mix(rgb('#3f8f3a'), rgb('#6bbf4e'), mx_noise_float(positionWorld.mul(0.8)).mul(0.5).add(0.5));
    const trunk = new THREE.MeshStandardNodeMaterial({ color: '#6b4a2e', roughness: 0.9 });

    group.add(makeCloudSea());
    // the island the stage stands on
    const home = makeIsland(10, 11, grass, rock);
    group.add(home);
    for (const [x, z, s] of [
      [-7.5, -3, 1.1],
      [7.8, -5, 1.25],
      [-6, -8.5, 0.9],
    ] as const) {
      const t = makeTree(leaf, trunk, s);
      t.position.set(x, 0, z);
      group.add(t);
    }

    // distant islands, two with waterfalls spilling off their edges
    const islands = [
      { x: -24, y: 3, z: -30, r: 6, d: 8, falls: true },
      { x: 25, y: -1, z: -36, r: 7, d: 9, falls: true },
      { x: -10, y: 8, z: -58, r: 5, d: 7, falls: false },
      { x: 16, y: 10, z: -72, r: 6, d: 8, falls: false },
      { x: -38, y: -4, z: -62, r: 8, d: 10, falls: false },
    ].map((o, i) => {
      const isl = makeIsland(o.r, o.d, grass, rock);
      isl.position.set(o.x, o.y, o.z);
      for (let k = 0; k < 3; k++) {
        const t = makeTree(leaf, trunk, rand(0.8, 1.3));
        t.position.set(rand(-o.r * 0.6, o.r * 0.6), 0, rand(-o.r * 0.6, o.r * 0.6));
        isl.add(t);
      }
      if (o.falls) {
        const fall = makeWaterfall(o.y - CLOUD_Y + 2);
        fall.position.x = (i % 2 ? -1 : 1) * o.r * 0.9;
        fall.position.z = o.r * 0.25;
        isl.add(fall);
      }
      group.add(isl);
      return { island: isl, baseY: o.y, phase: rand(0, 6) };
    });

    // hot-air balloons drifting across the sky
    const balloons = [
      { mesh: makeBalloon('#ff6b6b', '#ffe66d'), x: -30, y: 9, z: -26, speed: 0.6 },
      { mesh: makeBalloon('#4ecdc4', '#ffffff'), x: 12, y: 13, z: -44, speed: 0.45 },
      { mesh: makeBalloon('#a29bfe', '#ff9f43'), x: 40, y: 6, z: -60, speed: 0.5 },
    ];
    for (const b of balloons) group.add(b.mesh);

    // little rocks floating about
    const pebbles = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 0), rock, 24);
    const pm = new THREE.Matrix4();
    const pebbleSpots = Array.from({ length: 24 }, () => new THREE.Vector3(rand(-30, 30), rand(-6, 12), rand(-40, -12)));
    pebbleSpots.forEach((p, i) => {
      if (Math.abs(p.x) < 10 && p.y > -2) p.x += Math.sign(p.x || 1) * 10; // keep the view of the wheel clear
      const s = rand(0.3, 1.2);
      pebbles.setMatrixAt(i, pm.compose(p, new THREE.Quaternion().random(), new THREE.Vector3(s, s, s)));
    });
    group.add(pebbles);

    // a rainbow behind everything, for celebrations
    const uRainbow = uniform(0);
    const rbMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const ru = uv();
    const band = ru.y; // across the band
    const rainbowCol = mix(mix(mix(rgb('#ff4d4d'), rgb('#ffb347'), smoothstep(0.0, 0.25, band)), mix(rgb('#ffe66d'), rgb('#4ecb71'), smoothstep(0.35, 0.6, band)), smoothstep(0.2, 0.45, band)), rgb('#5d9cec'), smoothstep(0.65, 1, band));
    rbMat.colorNode = rainbowCol.mul(smoothstep(0, 0.12, band).mul(smoothstep(1, 0.88, band))).mul(uRainbow.mul(0.9));
    const rainbow = new THREE.Mesh(new THREE.RingGeometry(26, 32, 128, 1, 0, Math.PI), rbMat);
    // RingGeometry UVs are planar; remap so uv.y runs across the band
    const rp = rainbow.geometry.attributes.position;
    const ruv = rainbow.geometry.attributes.uv;
    for (let i = 0; i < rp.count; i++) ruv.setY(i, (Math.hypot(rp.getX(i), rp.getY(i)) - 26) / 6);
    rainbow.position.set(0, -6, -60);
    group.add(rainbow);

    // brass stand on the grass
    const brass = new THREE.MeshStandardNodeMaterial({ color: '#c9a25a', metalness: 0.7, roughness: 0.35 });
    const deck = new THREE.MeshStandardNodeMaterial({ roughness: 0.8 });
    deck.colorNode = rgb('#c49a6c').mul(float(0.9).add(step(0.92, fract(positionWorld.x.mul(2.2))).mul(-0.25)));
    group.add(makeStand(center, { legs: brass, plinth: deck, neon: rgb('#fff1c4').mul(float(1).add(uSpeed.mul(0.06)).add(uWin.mul(2.2))) }));

    // sheep grazing on the home island
    const wool = new THREE.MeshStandardNodeMaterial({ color: '#fff8ee', roughness: 1, flatShading: true });
    const face = new THREE.MeshStandardNodeMaterial({ color: '#2a2622', roughness: 0.8 });
    const sheep = [
      [-6.6, -1.2, 0.4],
      [6.2, -2.4, 2.6],
      [4.2, -8, -2.2],
      [-3.4, -7.4, 1],
    ].map(([x, z, ry], i) => {
      const s = makeSheep(wool, face);
      s.group.position.set(x, 0, z);
      s.group.rotation.y = ry;
      s.group.scale.setScalar(i === 3 ? 0.8 : 1);
      group.add(s.group);
      return { ...s, hop: 0, phase: rand(0, 6) };
    });

    // two kites tethered to the island, swaying on the breeze
    const kites = [
      { kite: makeKite('#ff6b6b', '#ffe66d'), anchor: new THREE.Vector3(-7.5, 1.2, -3), at: new THREE.Vector3(-8, 7.8, -9), phase: 0 },
      { kite: makeKite('#4ecdc4', '#a29bfe'), anchor: new THREE.Vector3(7.8, 1.2, -5), at: new THREE.Vector3(6.5, 9, -10), phase: 2 },
    ];
    const stringMat = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6 });
    for (const k of kites) {
      group.add(k.kite.group);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([k.anchor, k.at]), stringMat);
      group.add(line);
      Object.assign(k, { line });
    }

    // a goofy airship puttering around behind the islands
    const airship = makeAirship();
    airship.group.scale.setScalar(1.1);
    group.add(airship.group);
    let loopT = -1; // 0..1 while it does a loop-the-loop

    // a whale made of cloud, cruising slowly along the horizon
    const whale = makeCloudWhale();
    whale.group.scale.setScalar(1.3);
    group.add(whale.group);
    let whaleX = 12;

    // idle moments: birds, a sheep hops, the airship loops, the whale spouts
    const sprites = atlas();
    const moments = idleMoments();
    const birds = moments.track(flyby({ atlas: sprites, cells: [1], count: 4, from: [-30, 9.5, -24], box: [2, 1.2, 3], speed: [6, 7.5], life: 10, size: [0.8, 1.1], wobble: 0.5, stagger: 1.2, fog: false }));
    group.add(birds.object);
    const spout = new Particles({
      count: 40,
      atlas: sprites,
      cells: [2],
      colors: ['#ffffff'],
      tint: 1,
      mode: 'face',
      mirror: false,
      emitters: [{ at: [0, 0, 0], box: [0.6, 0, 0.6], dir: [0, 1, 0], spread: 0.35, speed: [5, 8] }],
      size: [1.2, 2],
      gravity: [0, -3, 0],
      drag: 1,
      life: [1.4, 2],
    });
    group.add(spout.object);
    let rainbowLeft = 0;
    moments.add(() => birds.fire());
    moments.add(() => (sheep[Math.floor(rand(0, sheep.length))].hop = 1));
    moments.add(() => (loopT = 0));
    moments.add(() => {
      spout.object.position.copy(whale.group.position).add(new THREE.Vector3(3.5, 4, 0));
      spout.fire();
    });

    // golden hour: a warm low key, a peach rim from the sun behind, and a soft lilac sky fill
    const lights = makeLights(group, ['#ffc98a', 1.5], []);
    const sunRim = new THREE.DirectionalLight('#ffb070', 1.6);
    sunRim.position.set(60, 18, -80);
    group.add(sunRim, new THREE.HemisphereLight('#b9a8e0', '#7a8a4a', 0.55));

    return {
      group,
      moments,
      rainbow(seconds) {
        rainbowLeft = Math.max(rainbowLeft, seconds);
      },
      update(f) {
        lights(f.speed, f.win);
        moments.update(f);
        for (const isl of islands) isl.island.position.y = isl.baseY + Math.sin(f.time * 0.4 + isl.phase) * 0.4;
        for (const b of balloons) {
          b.x += f.dt * b.speed;
          if (b.x > 45) b.x = -45;
          b.mesh.position.set(b.x, b.y + Math.sin(f.time * 0.5 + b.z) * 0.6, b.z);
        }
        spout.update(f.time);
        // sheep nibble the grass (heads bob down) and sometimes hop for joy
        for (const s of sheep) {
          s.head.rotation.z = Math.max(0, Math.sin(f.time * 0.7 + s.phase)) * -0.5;
          s.hop = Math.max(0, s.hop - f.dt * 1.6);
          s.group.position.y = Math.abs(Math.sin(s.hop * Math.PI * 3)) * 0.6 * Math.min(1, s.hop * 3);
        }
        for (const k of kites) {
          const sway = Math.sin(f.time * 0.9 + k.phase);
          const pos = k.at.clone().add(new THREE.Vector3(sway * 1.2, Math.sin(f.time * 1.3 + k.phase) * 0.5, 0));
          k.kite.group.position.copy(pos);
          k.kite.group.rotation.z = sway * 0.35;
          k.kite.bows.forEach((b, i) => (b.position.x = Math.sin(f.time * 3 + i * 0.8 + k.phase) * 0.12 * (i + 1)));
          const line = (k as typeof k & { line: THREE.Line }).line;
          line.geometry.attributes.position.setXYZ(1, pos.x, pos.y - 1, pos.z);
          line.geometry.attributes.position.needsUpdate = true;
        }
        // the airship circles; now and then it loops the loop
        const a = f.time * 0.09;
        const ax = -2 + Math.cos(a) * 11;
        const az = -22 + Math.sin(a) * 5;
        airship.group.position.set(ax, 9.5, az);
        airship.group.rotation.set(0, Math.atan2(-Math.cos(a) * 5, -Math.sin(a) * 11), 0);
        if (loopT >= 0) {
          loopT += f.dt / 3.2;
          const e = loopT < 1 ? 0.5 - Math.cos(loopT * Math.PI) / 2 : 1;
          airship.group.position.y += (1 - Math.cos(e * Math.PI * 2)) * 2.5;
          airship.group.rotateZ(e * Math.PI * 2);
          if (loopT >= 1) loopT = -1;
        }
        airship.prop.rotation.x += f.dt * (14 + f.speed);
        // the whale glides right to left across the far sky, then comes round again
        whaleX -= f.dt * 1.2;
        if (whaleX < -45) whaleX = 35;
        whale.group.position.set(whaleX, 9 + Math.sin(f.time * 0.3) * 1.2, -62);
        whale.group.rotation.set(0, Math.PI, Math.sin(f.time * 0.3) * 0.06);
        whale.fluke.rotation.z = Math.sin(f.time * 0.8) * 0.25;
        rainbowLeft = Math.max(0, rainbowLeft - f.dt);
        uRainbow.value += ((rainbowLeft > 0 ? 1 : 0) - uRainbow.value) * (1 - Math.exp(-f.dt * (rainbowLeft > 0 ? 1.5 : 0.8)));
      },
    };
  },

  celebrations,
};
