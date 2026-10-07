import * as THREE from 'three/webgpu';
import {
  abs,
  atan,
  exp,
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
import { makeLights, makeStand, rgb } from '../shared';
import { lowRes, starField } from '../../fx/nodes';
import { Particles } from '../../fx/Particles';
import { uSpeed, uWin } from '../../engine/globals';
import { SCALES } from '../../audio/ChipSynth';
import { meta, PALETTE } from './meta';
import { atlas } from './sprites';
import { flyby, idleMoments } from '../../fx/ambient';
import { BRAZIERS } from './layout';
import { celebrations } from './celebrations';

type N = any;

const NIGHT = '#141633';
const MOON = new THREE.Vector3(-40, 42, -140);
/** Two more fire bowls further back, lighting the colonnade and the obelisk. */
const TORCHES = [new THREE.Vector3(-8.6, 0, -8.5), new THREE.Vector3(8.8, 0, -9.5)];

// ------------------------------------------------------------------ sky, moon, dunes

function sky() {
  const milky = Fn(() => {
    const uvS = screenUV; // y grows downward
    const p = vec2(uvS.x.mul(screenSize.x.div(screenSize.y)), uvS.y);
    let col: N = mix(rgb('#05061a'), rgb('#1d2350'), smoothstep(0.0, 0.62, uvS.y));
    col = mix(col, rgb('#4a3a5e'), smoothstep(0.5, 0.68, uvS.y).mul(0.5)); // a last warm haze at the horizon
    // the Milky Way: a soft diagonal band of dust
    const band = float(1).sub(smoothstep(0, 0.22, abs(p.y.sub(p.x.mul(0.45)).sub(0.05))));
    const dust = mx_fractal_noise_float(vec3(p.mul(4), 0), 4, 2, 0.55).mul(0.5).add(0.5);
    col = col.add(rgb('#8f86c9').mul(band.mul(dust).mul(0.22)));
    return vec4(col, 1);
  });
  return lowRes(milky()).rgb.add(vec3(starField(0.993, 2, 1.3)).mul(float(1).sub(smoothstep(0.45, 0.62, screenUV.y))));
}

/** A crescent moon: a lit disc with a shadow disc bitten out of it. */
function makeMoon() {
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false });
  const p = uv().sub(0.5).mul(2);
  const disc = smoothstep(0.62, 0.6, length(p));
  const bite = smoothstep(0.6, 0.58, length(p.sub(vec2(0.32, 0.12))));
  const halo = exp(length(p).mul(-3)).mul(0.25);
  mat.colorNode = rgb('#fff4d6').mul(disc.sub(bite).max(0).mul(1.6)).add(rgb('#8fa6ff').mul(halo));
  mat.opacityNode = max(disc.sub(bite), halo.mul(2));
  const moon = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), mat);
  moon.position.copy(MOON);
  return moon;
}

/** Rolling moonlit dunes, flattening out around the stage. */
function makeDunes() {
  const geo = new THREE.PlaneGeometry(260, 200, 160, 120);
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 1 });
  // the plane is rotated flat: local (x, -y) is world (x, z) and local z is height
  const wx = positionLocal.x;
  const wz = positionLocal.y.negate().sub(60);
  const away = smoothstep(9, 26, length(vec2(wx, wz.add(5))));
  const dunes = sin(wx.mul(0.07).add(wz.mul(0.035))).mul(sin(wz.mul(0.09).sub(wx.mul(0.02)))).mul(3.2).add(mx_noise_float(vec3(wx.mul(0.03), wz.mul(0.03), 0)).mul(2.5));
  const h = dunes.max(-0.4).mul(away);
  mat.positionNode = positionLocal.add(vec3(0, 0, h));
  const ripples = sin(wx.mul(2.2).add(mx_noise_float(vec3(wx.mul(0.2), wz.mul(0.2), 0)).mul(4))).mul(0.5).add(0.5);
  // moonlit sand: cool and silvery, the crests catching the light
  mat.colorNode = mix(rgb('#262a4a'), rgb('#9a8f94'), smoothstep(-0.5, 3, h)).mul(ripples.mul(0.12).add(0.88));
  const ground = new THREE.Mesh(geo, mat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = -60;
  return ground;
}

// ------------------------------------------------------------------ monuments

/**
 * Carved hieroglyphs: a grid of cells, each holding a glyph-like mark (bars,
 * rings, an eye, an ankh-ish cross) cut into the stone and glowing gold.
 * `uGlyph` brightens them all; `uWave` (0..1) sweeps a band of light across them.
 */
function glyphs(coord: N, uGlyph: N, uWave: N) {
  const c: N = floor(coord);
  const f: N = fract(coord).sub(0.5);
  const h = hash(c.dot(vec2(1, 57)));
  const pick = (lo: number, hi: number) => step(lo, h).mul(step(h, hi));
  const vbar = smoothstep(0.07, 0.05, abs(f.x)).mul(smoothstep(0.36, 0.34, abs(f.y)));
  const hbar = smoothstep(0.06, 0.04, abs(f.y)).mul(smoothstep(0.34, 0.32, abs(f.x)));
  const ring = smoothstep(0.05, 0.02, abs(length(f).sub(0.22)));
  const eye = smoothstep(0.05, 0.02, abs(length(f.mul(vec2(1, 2.2))).sub(0.28))).max(smoothstep(0.08, 0.05, length(f)));
  const ankh = smoothstep(0.04, 0.02, abs(length(f.sub(vec2(0, 0.18))).sub(0.1))).max(vbar.mul(step(f.y, 0.1))).max(hbar.mul(smoothstep(0.08, 0.04, abs(f.y))));
  const mark = vbar.mul(pick(0, 0.25)).max(hbar.mul(pick(0.25, 0.45))).max(ring.mul(pick(0.45, 0.65))).max(eye.mul(pick(0.65, 0.82))).max(ankh.mul(pick(0.82, 0.97)));
  const wave = exp(c.y.mul(0.08).add(c.x.mul(0.02)).sub(uWave.mul(6)).pow(2).mul(-3)).mul(step(0.001, uWave));
  return { mark, glow: mark.mul(float(0.6).add(uGlyph.mul(2.5)).add(wave.mul(2.5)).add(uWin.mul(0.8))) };
}

function stoneMat(uGlyph: N, uWave: N, coord: N) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9 });
  const g = glyphs(coord, uGlyph, uWave);
  const grain = mx_noise_float(positionWorld.mul(1.8)).mul(0.06);
  m.colorNode = rgb('#c9b28a').mul(float(0.95).add(grain)).mul(float(1).sub(g.mark.mul(0.35)));
  m.emissiveNode = rgb('#ffc56b').mul(g.glow);
  return m;
}

/** A row of columns carved with glyphs, with a lintel across the top. */
function makeColonnade(uGlyph: N, uWave: N) {
  const g = new THREE.Group();
  // coordinates around each column (angle × radius, height)
  const around = vec2(atan(positionLocal.z, positionLocal.x).mul(0.58 * 2.4), positionLocal.y.mul(2.4));
  const colMat = stoneMat(uGlyph, uWave, around);
  const plain = new THREE.MeshStandardNodeMaterial({ color: '#b8a07a', roughness: 0.95 });
  const xs = [-7.6, -10.4, -13.2];
  for (const x of xs) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 7, 18), colMat);
    col.position.set(x, 3.5, -7.5);
    g.add(col);
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 1.5).translate(x, 7.25, -7.5), plain));
  }
  g.add(new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.9, 1.4).translate(-10.4, 7.9, -7.5), plain));
  return g;
}

/** An obelisk with glyphs down its faces and a gold-capped tip. */
function makeObelisk(uGlyph: N, uWave: N) {
  const g = new THREE.Group();
  const coord = vec2(positionLocal.x.add(positionLocal.z).mul(2.6), positionLocal.y.mul(2.6));
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.7, 10, 4, 1).rotateY(Math.PI / 4), stoneMat(uGlyph, uWave, coord));
  shaft.position.y = 5;
  g.add(shaft);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1, 4).rotateY(Math.PI / 4), new THREE.MeshStandardNodeMaterial({ color: '#e0b04a', metalness: 0.7, roughness: 0.3, emissive: '#5a3a08' }));
  cap.position.y = 10.5;
  g.add(cap);
  g.position.set(9.5, 0, -9);
  return g;
}

function makePyramids() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 1, flatShading: true });
  // courses of stone blocks, catching the moonlight
  mat.colorNode = rgb('#c9a878').mul(float(0.85).add(step(0.85, fract(positionWorld.y.mul(0.7))).mul(-0.18)));
  const capMat = new THREE.MeshStandardNodeMaterial({ color: '#e0b04a', metalness: 0.7, roughness: 0.3 });
  capMat.emissiveNode = rgb('#ffcf6b').mul(sin(time.mul(0.8)).mul(0.2).add(0.6));
  for (const [x, z, s] of [
    [-38, -85, 34],
    [34, -100, 40],
    [6, -130, 26],
  ]) {
    const body = new THREE.Mesh(new THREE.ConeGeometry(s * 0.75, s * 0.62, 4).rotateY(Math.PI / 4), mat);
    body.position.set(x, s * 0.31, z);
    g.add(body);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(s * 0.06, s * 0.05, 4).rotateY(Math.PI / 4), capMat);
    cap.position.set(x, s * 0.62 - s * 0.02, z);
    g.add(cap);
  }
  return g;
}

/** A sphinx lying in the sand, in blocky silhouette. */
function makeSphinx() {
  const mat = new THREE.MeshStandardNodeMaterial({ color: '#a8906a', roughness: 1, flatShading: true });
  const geo = mergeGeometries([
    new THREE.BoxGeometry(9, 2.6, 3.4).translate(0, 1.3, 0),
    new THREE.BoxGeometry(3.4, 0.9, 1.1).translate(5.8, 0.45, -0.9),
    new THREE.BoxGeometry(3.4, 0.9, 1.1).translate(5.8, 0.45, 0.9),
    new THREE.BoxGeometry(2.2, 2.4, 2.2).translate(3.4, 3.6, 0),
    new THREE.ConeGeometry(1.9, 2.4, 4).rotateY(Math.PI / 4).translate(3.2, 4.2, 0),
  ])!;
  const sphinx = new THREE.Mesh(geo, mat);
  sphinx.position.set(-24, 0, -42);
  sphinx.rotation.y = 0.5;
  return sphinx;
}

/** A bronze fire bowl on a pillar. */
function makeBrazier(at: THREE.Vector3) {
  const g = new THREE.Group();
  const bronze = new THREE.MeshStandardNodeMaterial({ color: '#8a5a2b', metalness: 0.7, roughness: 0.4 });
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 1.5, 10).translate(0, 0.75, 0), bronze));
  const bowl = new THREE.LatheGeometry(
    [
      [0.12, 0],
      [0.45, 0.12],
      [0.62, 0.34],
      [0.66, 0.42],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    18,
  );
  g.add(new THREE.Mesh(bowl.translate(0, 1.5, 0), bronze));
  const coals = new THREE.MeshBasicNodeMaterial();
  coals.colorNode = rgb('#ff7a2a').mul(sin(time.mul(6).add(at.x)).mul(0.2).add(1.6));
  g.add(new THREE.Mesh(new THREE.CircleGeometry(0.55, 16).rotateX(-Math.PI / 2).translate(0, 1.86, 0), coals));
  g.position.copy(at);
  return g;
}

/** A shaft of golden light from the sky onto the stage (`uBeam` 0..1). */
function makeBeam(uBeam: N) {
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const v = uv();
  const shimmer = sin(v.x.mul(40).add(time.mul(3))).mul(0.15).add(0.85);
  mat.colorNode = rgb('#ffd27a').mul(pow(float(1).sub(abs(v.x.sub(0.5)).mul(2)), 3)).mul(shimmer).mul(uBeam.mul(1.4)).mul(smoothstep(0, 0.15, v.y));
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.2, 40, 32, 1, true), mat);
  beam.position.set(0, 20, -1);
  beam.renderOrder = 2;
  return beam;
}

export interface PharaohScene extends ThemeScene {
  /** The hieroglyphs blaze gold for a while. */
  glyphsBlaze(seconds: number): void;
  /** The Eye of Ra: a shaft of light descends on the stage. */
  beam(seconds: number): void;
  /** A sandstorm closes in. */
  storm(seconds: number): void;
}

// ------------------------------------------------------------------ theme

export const pharaoh: Theme<PharaohScene> = {
  ...meta,
  wheel: {
    palette: PALETTE,
    font: `"${meta.font.family}"`,
    fontWeight: meta.font.weight,
    rim: ['#e0b04a', '#f2d27a'],
    holo: 0.1,
    flapper: '#e0b04a',
    leds: ['#ffd27a', '#2ab7a9'],
    hub: ['#1f4e8c', '#e0b04a'],
    pegs: '#e0b04a',
    frame: '#1a1830',
    pointer: 'ankh',
  },
  post: { bloom: [0.55, 0.5, 0.78], exposure: 1, aberration: 0.8, vignette: 0.65 },
  character: { spot: [0, 0.22, 1.6], entrance: 'rise' },
  tick: 'knock',
  song: {
    bpm: 110,
    root: 50,
    scale: SCALES.spooky,
    progressions: [
      [0, 1, 0, 6],
      [0, 3, 1, 0],
      [4, 3, 1, 0],
    ],
    lead: 'square',
    bass: 'triangle',
    drums: 'break',
    density: 0.55,
    arp: true,
    brightness: 3400,
  },

  createScene({ scene, center }) {
    const group = new THREE.Group();
    const uGlyph = uniform(0);
    const uWave = uniform(0);
    const uBeam = uniform(0);
    const uStorm = uniform(0);
    scene.backgroundNode = sky();
    scene.fogNode = fog(mix(rgb(NIGHT), rgb('#b8946a'), uStorm), rangeFogFactor(mix(float(60), float(5), uStorm), mix(float(240), float(28), uStorm)));
    scene.environmentIntensity = 0.25;

    group.add(makeMoon(), makeDunes(), makePyramids(), makeSphinx(), makeColonnade(uGlyph, uWave), makeObelisk(uGlyph, uWave), makeBeam(uBeam));
    for (const b of [...BRAZIERS, ...TORCHES]) group.add(makeBrazier(b));

    // sandstone stand
    const sandstone = new THREE.MeshStandardNodeMaterial({ color: '#c9b28a', roughness: 0.9 });
    const gold = new THREE.MeshStandardNodeMaterial({ color: '#e0b04a', metalness: 0.7, roughness: 0.3 });
    group.add(makeStand(center, { legs: gold, plinth: sandstone, neon: rgb('#ffcf6b').mul(float(1.2).add(uSpeed.mul(0.06)).add(uWin.mul(2.4))) }));

    // fire in the braziers
    const sprites = atlas();
    const flames = new Particles({
      count: 120,
      atlas: sprites,
      cells: [4],
      loop: true,
      mode: 'face',
      blend: 'additive',
      intensity: 1.1,
      colors: ['#ff8a2a', '#ff5a1a', '#ffb347'],
      mirror: false,
      emitters: [...BRAZIERS, ...TORCHES].map((b) => ({ at: [b.x, 1.95, b.z] as [number, number, number], box: [0.3, 0.05, 0.3] as [number, number, number], dir: [0, 1, 0] as [number, number, number], spread: 0.25, speed: [0.8, 1.6] as [number, number] })),
      size: [0.22, 0.45],
      gravity: [0, 1.2, 0],
      drag: 0.8,
      life: [0.5, 0.9],
      wobble: 0.2,
    });
    const embers = new Particles({
      count: 50,
      atlas: sprites,
      cells: [4],
      loop: true,
      mode: 'face',
      blend: 'additive',
      intensity: 3,
      colors: ['#ffb347'],
      mirror: false,
      emitters: [...BRAZIERS, ...TORCHES].map((b) => ({ at: [b.x, 2.1, b.z] as [number, number, number], box: [0.2, 0.05, 0.2] as [number, number, number], dir: [0, 1, 0] as [number, number, number], spread: 0.4, speed: [1, 2.5] as [number, number] })),
      size: [0.04, 0.07],
      gravity: [0, 0.6, 0],
      drag: 0.6,
      life: [1.5, 2.5],
      wobble: 0.6,
    });
    group.add(flames.object, embers.object);

    // ------------------------------------------------ animation state
    let glyphLeft = 0;
    let beamLeft = 0;
    let stormLeft = 0;
    let waveT = -1;
    const ease = (u: { value: number }, on: boolean, k: number, dt: number) => (u.value += ((on ? 1 : 0) - u.value) * (1 - Math.exp(-dt * k)));

    // idle moments: a falcon overhead, a shimmer through the glyphs, the braziers flare
    const moments = idleMoments();
    const falcon = moments.track(flyby({ atlas: sprites, cells: [2], count: 1, from: [-32, 9.5, -26], speed: [5, 6], life: 12, size: [1.6, 1.6], wobble: 0.7, stagger: 0, fog: false }));
    group.add(falcon.object);
    let flare = 0;
    moments.add(() => falcon.fire());
    moments.add(() => (waveT = 0));
    moments.add(() => (flare = 1));

    // fire up close, cool moonlight raking across the monuments from the moon's side
    const lights = makeLights(group, ['#9fb4ff', 0.7], [
      ...[...BRAZIERS, ...TORCHES].map((b, i): [string, number, THREE.Vector3Tuple] => ['#ff9a3d', i < 2 ? 14 : 12, [b.x, 2.6, b.z + 0.4]]),
    ]);
    const moonLight = new THREE.DirectionalLight('#a8baff', 1.5);
    moonLight.position.copy(MOON);
    group.add(moonLight, new THREE.HemisphereLight('#3a4a8a', '#3a2a2a', 0.4));

    return {
      group,
      moments,
      glyphsBlaze(seconds) {
        glyphLeft = Math.max(glyphLeft, seconds);
      },
      beam(seconds) {
        beamLeft = Math.max(beamLeft, seconds);
      },
      storm(seconds) {
        stormLeft = Math.max(stormLeft, seconds);
      },
      update(f) {
        lights(f.speed, f.win + flare);
        moments.update(f);
        flames.update(f.time);
        embers.update(f.time);
        flare *= Math.exp(-f.dt * 1.5);
        glyphLeft = Math.max(0, glyphLeft - f.dt);
        beamLeft = Math.max(0, beamLeft - f.dt);
        stormLeft = Math.max(0, stormLeft - f.dt);
        ease(uGlyph, glyphLeft > 0, 3, f.dt);
        ease(uBeam, beamLeft > 0, beamLeft > 0 ? 2.5 : 1.2, f.dt);
        ease(uStorm, stormLeft > 0, stormLeft > 0 ? 2.5 : 0.8, f.dt);
        if (waveT >= 0) {
          waveT += f.dt / 3;
          uWave.value = waveT >= 1 ? 0 : waveT;
          if (waveT >= 1) waveT = -1;
        }
      },
    };
  },

  celebrations,
};
