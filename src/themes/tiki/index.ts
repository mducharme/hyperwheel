import * as THREE from 'three/webgpu';
import {
  abs,
  float,
  fog,
  fract,
  length,
  max,
  mix,
  mx_fractal_noise_float,
  mx_noise_float,
  positionGeometry,
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
} from 'three/tsl';
import type { Theme, ThemeScene } from '../types';
import { makeLights, makeStand, rgb } from '../shared';
import { starField } from '../../fx/nodes';
import { Particles } from '../../fx/Particles';
import { uSpeed, uWin } from '../../engine/globals';
import { SCALES } from '../../audio/ChipSynth';
import { meta, PALETTE } from './meta';
import { rand } from '../../fx/util';
import { atlas, gull } from './sprites';
import { flyby, idleMoments } from '../../fx/ambient';
import { makeAtlas } from '../../fx/atlas';
import { celebrations } from './celebrations';

const HAZE = '#6b3f63';
const SUN = new THREE.Vector3(14, 5, -80);
const SHORE_Z = -9;
const VOLCANO = new THREE.Vector3(-30, 0, -70);
/** Crater height (the cone below is 11 units tall). */
const CRATER = 11;

/** A palm frond texture: a central rib with angled leaflets (alpha-tested). */
function frondTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.strokeStyle = '#fff';
  ctx.lineCap = 'round';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(64, 512);
  ctx.lineTo(64, 10);
  ctx.stroke();
  for (let y = 40; y < 500; y += 14) {
    const len = 52 * Math.sin(((y - 20) / 500) * Math.PI) + 6;
    ctx.lineWidth = 5;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(64, y);
      ctx.lineTo(64 + s * len, y - 22);
      ctx.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------ world

function sky(uGlow: any) {
  const uvS = screenUV; // y grows downward
  const aspect = screenSize.x.div(screenSize.y);
  const p = vec2(uvS.x.mul(aspect), uvS.y);
  let col: any = mix(rgb('#1b1240'), rgb('#7a2f6b'), smoothstep(0.0, 0.45, uvS.y));
  col = mix(col, rgb('#ff7a45'), smoothstep(0.35, 0.62, uvS.y));
  col = mix(col, rgb('#ffc36b'), smoothstep(0.55, 0.7, uvS.y));
  // pink-lit cloud streaks
  const clouds = mx_fractal_noise_float(vec3(p.mul(vec2(1.2, 6)).add(vec2(time.mul(0.008), 0)), 0), 4, 2, 0.5);
  const band = smoothstep(0.15, 0.5, uvS.y).mul(float(1).sub(smoothstep(0.5, 0.62, uvS.y)));
  col = mix(col, rgb('#ff8fb1'), smoothstep(0.1, 0.45, clouds).mul(band).mul(0.55));
  col = col.add(vec3(starField(0.997, 2.5, 1)).mul(float(1).sub(smoothstep(0.05, 0.3, uvS.y))));
  return col.add(rgb('#ff6a00').mul(uGlow.mul(0.15)));
}

function makeSun() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicNodeMaterial({ fog: false });
  mat.colorNode = mix(rgb('#ff7a2e'), rgb('#fff1b0'), smoothstep(0.1, 0.8, uv().y)).mul(1.6);
  g.add(new THREE.Mesh(new THREE.CircleGeometry(9, 64), mat));
  const halo = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const d = length(uv().sub(0.5)).mul(2);
  halo.colorNode = rgb('#ff9a4d').mul(pow(float(1).sub(smoothstep(0.2, 1, d)), 2.5)).mul(0.4);
  const h = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), halo);
  h.position.z = -0.2;
  g.add(h);
  g.position.copy(SUN);
  return g;
}

function makeOcean() {
  const mat = new THREE.MeshBasicNodeMaterial({ fog: true });
  const xz = positionWorld.xz;
  const waves = mx_fractal_noise_float(vec3(xz.mul(vec2(0.25, 0.6)).add(vec2(0, time.mul(0.25))), time.mul(0.1)), 3, 2, 0.5).mul(0.5).add(0.5);
  let col: any = mix(rgb('#0d4a5c'), rgb('#2a8a8c'), waves);
  col = mix(col, rgb('#ff8a5c'), smoothstep(-20, -80, xz.y).mul(0.35)); // sky reflection far out
  // shimmering path of sunlight running from the sun toward the beach
  const pathX = float(SUN.x).mul(xz.y.sub(SHORE_Z).div(SUN.z - SHORE_Z));
  const width = mix(float(0.6), float(7), smoothstep(SHORE_Z, SUN.z, xz.y));
  const glitterPath = float(1).sub(smoothstep(0, 1, abs(xz.x.sub(pathX)).div(width)));
  const sparkle = pow(mx_noise_float(vec3(xz.mul(vec2(2.5, 6)), time.mul(1.4))).mul(0.5).add(0.5), 6);
  col = col.add(rgb('#ffd48a').mul(glitterPath.mul(sparkle).mul(4)));
  // rolling foam at the shoreline
  const shore = xz.y.sub(SHORE_Z).negate();
  const surge = sin(time.mul(0.8)).mul(0.5).add(0.5).mul(0.9);
  const foamEdge = float(1).sub(smoothstep(0, 0.9, abs(shore.sub(surge.mul(1.2)).sub(mx_noise_float(vec3(xz.x.mul(0.6), time.mul(0.3), 0)).mul(0.5)))));
  col = mix(col, rgb('#f4fbff'), foamEdge.mul(0.85));
  mat.colorNode = col;
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(260, 140), mat);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, 0.03, SHORE_Z - 70);
  return ocean;
}

function makeSand() {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 });
  const xz = positionWorld.xz;
  const ripples = sin(xz.x.mul(1.4).add(mx_noise_float(vec3(xz.mul(0.4), 0)).mul(5))).mul(0.5).add(0.5);
  const dry = mix(rgb('#e8c38f'), rgb('#f5dcae'), ripples.mul(0.6));
  const wet = smoothstep(SHORE_Z + 2.5, SHORE_Z, xz.y.add(mx_noise_float(vec3(xz.x.mul(0.5), 0, 1)).mul(0.6)));
  mat.colorNode = mix(dry, rgb('#a9875e'), wet);
  mat.roughnessNode = mix(float(0.95), float(0.35), wet);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(200, 40), mat);
  sand.rotation.x = -Math.PI / 2;
  sand.position.z = SHORE_Z + 20 - 0.5;
  return sand;
}

/** A leaning palm: ringed trunk, alpha-tested fronds, a cluster of coconuts. Returns its crown for swaying. */
function makePalm(height: number, lean: number, frondTex: THREE.Texture) {
  const g = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(lean * 0.25, height * 0.35, 0),
    new THREE.Vector3(lean * 0.7, height * 0.7, 0),
    new THREE.Vector3(lean, height, 0),
  ]);
  const trunkMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.9 });
  const rings = step(0.5, fract(uv().x.mul(height * 3.2)));
  trunkMat.colorNode = mix(rgb('#6b4a2e'), rgb('#8a6440'), rings);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.17, 8), trunkMat));

  const crown = new THREE.Group();
  crown.position.set(lean, height, 0);
  const frondMat = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, alphaTest: 0.5, roughness: 0.7 });
  const leafTex = texture(frondTex, uv());
  frondMat.colorNode = mix(rgb('#1f5e2b'), rgb('#5fa83a'), uv().y).mul(leafTex.r);
  frondMat.opacityNode = leafTex.a;
  const frondGeo = new THREE.PlaneGeometry(1.2, 3.4, 1, 12).translate(0, 1.7, 0);
  // droop each frond along its length
  const pos = frondGeo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    pos.setZ(i, -(y * y) * 0.16);
  }
  frondGeo.computeVertexNormals();
  for (let i = 0; i < 9; i++) {
    const f = new THREE.Mesh(frondGeo, frondMat);
    f.rotation.set(-0.5 + rand(-0.15, 0.15), (i / 9) * Math.PI * 2, 0, 'YXZ');
    crown.add(f);
  }
  const nutMat = new THREE.MeshStandardNodeMaterial({ color: '#5a3b1f', roughness: 0.8 });
  for (let i = 0; i < 4; i++) {
    const nut = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), nutMat);
    const a = (i / 4) * Math.PI * 2;
    nut.position.set(Math.cos(a) * 0.2, -0.22, Math.sin(a) * 0.2);
    crown.add(nut);
  }
  g.add(crown);
  return { group: g, crown };
}

/** An original stylised tiki totem: painted carved grooves for brows, eyes, nose and a toothy grin. */
function makeTiki(uGlow: any) {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.85 });
  const p = positionGeometry;
  const grain = mx_noise_float(vec3(p.x.mul(2), p.y.mul(14), p.z.mul(2))).mul(0.5).add(0.5);
  const wood = mix(rgb('#5a3820'), rgb('#7b5132'), grain);
  const front = smoothstep(0.1, 0.35, p.z);
  const box = (cx: number, cy: number, hw: number, hh: number) =>
    step(abs(p.x.sub(cx)), float(hw)).mul(step(abs(p.y.sub(cy)), float(hh)));
  const eyes = max(box(-0.2, 0.62, 0.13, 0.09), box(0.2, 0.62, 0.13, 0.09));
  const pupils = max(box(-0.2, 0.62, 0.05, 0.05), box(0.2, 0.62, 0.05, 0.05));
  const brow = box(0, 0.8, 0.38, 0.04);
  const nose = box(0, 0.4, 0.07, 0.12);
  const mouth = box(0, 0.08, 0.32, 0.11);
  const teeth = mouth.mul(step(0.5, fract(p.x.mul(9)))).mul(step(abs(p.y.sub(0.08)), float(0.06)));
  const groove = max(max(max(eyes, brow), max(nose, mouth)), float(0)).mul(front);
  let col: any = mix(wood, rgb('#24150b'), groove);
  col = mix(col, rgb('#f2e2c0'), teeth.mul(front));
  col = mix(col, rgb('#ffb347'), pupils.mul(front));
  // horizontal carved bands down the body
  col = mix(col, rgb('#3a2414'), step(0.8, fract(p.y.mul(2.2))).mul(step(p.y, -0.3)));
  mat.colorNode = col;
  mat.emissiveNode = rgb('#ff7a1a').mul(pupils.mul(front).mul(float(0.6).add(uGlow.mul(3)).add(uWin.mul(2))));
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 2.4, 14).translate(0, 0, 0), mat);
  body.position.y = 1.2;
  const g = new THREE.Group();
  g.add(body);
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.45, 0.25, 14),
    new THREE.MeshStandardNodeMaterial({ color: '#3a2414', roughness: 0.9 }),
  );
  cap.position.y = 2.5;
  g.add(cap);
  return g;
}

/** A bamboo torch pole. The flames themselves are a shared looping particle system. */
function makeTorch() {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.6 });
  mat.colorNode = mix(rgb('#b8934a'), rgb('#7a5a2a'), step(0.9, fract(uv().y.mul(5))));
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.4, 8), mat);
  pole.position.y = 1.2;
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.1, 0.3, 10), new THREE.MeshStandardNodeMaterial({ color: '#4a3020', roughness: 0.9 }));
  cup.position.y = 2.45;
  g.add(pole, cup);
  return g;
}

function makeVolcano(uGlow: any) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 1, flatShading: true });
  const h = uv().y;
  const rivers = smoothstep(0.55, 0.9, mx_noise_float(vec3(uv().x.mul(18), h.mul(4), 0)).mul(0.5).add(0.5)).mul(smoothstep(0.55, 1, h));
  mat.colorNode = mix(rgb('#2a1d22'), rgb('#4a3038'), mx_noise_float(vec3(uv().mul(10), 0)).mul(0.5).add(0.5));
  mat.emissiveNode = rgb('#ff5a1a').mul(rivers.mul(float(1.2).add(uGlow.mul(4))).add(smoothstep(0.93, 1, h).mul(float(2).add(uGlow.mul(6)))));
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 15, CRATER, 28, 6), mat);
  cone.position.y = CRATER / 2;
  g.add(cone);
  g.position.copy(VOLCANO);
  return g;
}

export interface TikiScene extends ThemeScene {
  /** Torches flare and the tiki eyes blaze. */
  flare(amount: number): void;
  /** The volcano glows white-hot. */
  erupt(amount: number): void;
  torchTops: THREE.Vector3[];
  /** Top of the volcano's crater (world space). */
  crater: THREE.Vector3;
}

// ------------------------------------------------------------------ theme

export const tiki: Theme<TikiScene> = {
  ...meta,
  wheel: {
    palette: PALETTE,
    font: `"${meta.font.family}"`,
    fontWeight: meta.font.weight,
    rim: ['#c79a5a', '#2ec4b6'],
    holo: 0.2,
    flapper: '#ff8c42',
    leds: ['#ffd23f', '#ff8c42'],
    hub: ['#2ec4b6', '#ff8c42'],
    pegs: '#f5dcae',
    frame: '#3a2414',
  },
  post: { bloom: [0.45, 0.5, 0.92], exposure: 0.86, aberration: 0.8, vignette: 0.55 },
  character: { spot: [0, 0.22, 1.6], entrance: 'beam' },
  tick: 'marimba',
  song: {
    bpm: 120,
    root: 60,
    scale: SCALES.pentatonic,
    progressions: [
      [0, 3, 4, 0],
      [0, 4, 3, 4],
      [3, 4, 0, 0],
    ],
    lead: 'triangle',
    bass: 'sine',
    drums: 'shuffle',
    density: 0.6,
    arp: true,
    brightness: 3600,
  },

  createScene({ scene, center }) {
    const group = new THREE.Group();
    const uFlare = uniform(0);
    const uErupt = uniform(0);
    scene.backgroundNode = sky(uErupt);
    scene.fogNode = fog(rgb(HAZE), rangeFogFactor(30, 120));
    scene.environmentIntensity = 0.3;

    group.add(makeSun(), makeOcean(), makeSand(), makeVolcano(uErupt));

    const frondTex = frondTexture();
    const crowns: THREE.Object3D[] = [];
    for (const [x, z, h, lean] of [
      [-7, -2.5, 5.6, 1.2],
      [-10, -5.5, 6.6, 0.7],
      [7.5, -3, 5.8, -1.3],
      [10.5, -6, 6.8, -0.8],
      [-14, -3.5, 6.2, 1],
      [14.5, -2, 5.4, -1],
    ] as const) {
      const palm = makePalm(h, lean, frondTex);
      palm.group.position.set(x, 0, z);
      palm.group.rotation.y = rand(-0.4, 0.4);
      crowns.push(palm.crown);
      group.add(palm.group);
    }

    for (const [x, z, ry, s] of [
      [-5.2, -0.5, 0.35, 1],
      [5.4, -1.2, -0.4, 1.15],
      [-3.8, -4.5, 0.2, 0.85],
    ] as const) {
      const t = makeTiki(uFlare);
      t.position.set(x, 0, z);
      t.rotation.y = ry;
      t.scale.setScalar(s);
      group.add(t);
    }

    const torchSpots: [number, number][] = [
      [-3.2, 2.6],
      [3.3, 2.4],
      [-6.8, 1.2],
      [7, 0.6],
    ];
    const torchTops = torchSpots.map(([x, z]) => {
      const t = makeTorch();
      t.position.set(x, 0, z);
      group.add(t);
      return new THREE.Vector3(x, 2.65, z);
    });

    const bamboo = new THREE.MeshStandardNodeMaterial({ roughness: 0.55 });
    bamboo.colorNode = mix(rgb('#c9a35a'), rgb('#8a6a2e'), step(0.92, fract(uv().y.mul(4))));
    const plinth = new THREE.MeshStandardNodeMaterial({ roughness: 0.85 });
    plinth.colorNode = mix(rgb('#6b4a2e'), rgb('#8a6440'), step(0.5, fract(positionGeometry.x.mul(3))));
    group.add(
      makeStand(center, {
        legs: bamboo,
        plinth,
        neon: rgb('#ffb347').mul(sin(time.mul(1.3)).mul(0.3).add(1.4).add(uSpeed.mul(0.06)).add(uWin.mul(2.5))),
      }),
    );

    const sprites = atlas();
    // torch flames and drifting embers
    const flames = new Particles({
      count: 260,
      atlas: sprites,
      cells: [5],
      loop: true,
      mode: 'face',
      blend: 'additive',
      intensity: 2.4,
      emitters: torchTops.map((p) => ({ at: [p.x, p.y + 0.05, p.z] as [number, number, number], box: [0.07, 0, 0.07] as [number, number, number], speed: [0.6, 1.4] as [number, number], spread: 0.3 })),
      size: [0.18, 0.34],
      gravity: [0, 1.2, 0],
      drag: 2,
      life: [0.35, 0.6],
      colors: ['#ffb347', '#ff7a1a', '#ffd23f'],
    });
    const embers = new Particles({
      count: 90,
      atlas: sprites,
      cells: [5],
      loop: true,
      mode: 'face',
      blend: 'additive',
      intensity: 2,
      emitters: torchTops.map((p) => ({ at: [p.x, p.y + 0.3, p.z] as [number, number, number], speed: [0.3, 0.9] as [number, number], spread: 0.8 })),
      size: [0.03, 0.06],
      gravity: [0.2, 0.5, 0],
      drag: 0.8,
      life: [2, 3.5],
      wobble: 0.3,
      colors: ['#ffb347', '#ff7a1a'],
    });
    const smoke = new Particles({
      count: 40,
      atlas: sprites,
      cells: [5],
      loop: true,
      mode: 'face',
      lit: false,
      tint: 1,
      intensity: 0.5,
      emitters: [{ at: [VOLCANO.x, CRATER, VOLCANO.z], box: [1, 0, 1], speed: [1, 2], spread: 0.3 }],
      size: [5, 10],
      gravity: [1.2, 0.6, 0],
      drag: 0.5,
      life: [8, 12],
      wobble: 1,
      colors: ['#5a4a58'],
    });
    group.add(flames.object, embers.object, smoke.object);

    // idle moments: seagulls crossing the sunset, the volcano rumbles and glows
    const moments = idleMoments();
    const gulls = moments.track(
      flyby({ atlas: makeAtlas([gull]), cells: [0], count: 5, from: [-34, 9.5, -32], box: [2, 1.5, 3], speed: [5, 6.5], life: 12, size: [0.9, 1.2], wobble: 0.6, stagger: 1.5, fog: false }),
    );
    group.add(gulls.object);
    moments.add(() => gulls.fire());
    moments.add(() => (uErupt.value = Math.max(uErupt.value, 0.4)));

    const boost = makeLights(group, ['#ffb27a', 1.1], [
      ['#ff8a3d', 12, [torchTops[0].x, 3, torchTops[0].z + 0.5]],
      ['#ff8a3d', 12, [torchTops[1].x, 3, torchTops[1].z + 0.5]],
    ]);
    const torchLights = group.children.filter((o): o is THREE.PointLight => (o as THREE.PointLight).isPointLight);

    return {
      group,
      moments,
      torchTops,
      crater: new THREE.Vector3(VOLCANO.x, CRATER, VOLCANO.z),
      flare(amount) {
        uFlare.value = Math.max(uFlare.value, amount);
      },
      erupt(amount) {
        uErupt.value = Math.max(uErupt.value, amount);
      },
      update(f) {
        boost(f.speed, f.win);
        moments.update(f);
        for (const l of torchLights) l.intensity *= (0.85 + Math.random() * 0.3) * (1 + uFlare.value * 2);
        flames.update(f.time);
        embers.update(f.time);
        smoke.update(f.time);
        crowns.forEach((c, i) => {
          c.rotation.z = Math.sin(f.time * 0.9 + i) * 0.06;
          c.rotation.x = Math.sin(f.time * 0.7 + i * 2) * 0.05;
        });
        uFlare.value *= Math.exp(-f.dt * 0.9);
        uErupt.value *= Math.exp(-f.dt * 0.5);
      },
    };
  },

  celebrations,
};
