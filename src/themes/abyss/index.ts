import * as THREE from 'three/webgpu';
import {
  float,
  fog,
  mix,
  mx_fractal_noise_float,
  mx_noise_float,
  mx_worley_noise_float,
  positionLocal,
  positionWorld,
  pow,
  rangeFogFactor,
  screenSize,
  screenUV,
  sin,
  smoothstep,
  time,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import type { Theme } from '../types';
import { makeLights, makeStand, rgb } from '../shared';
import { Particles } from '../../fx/Particles';
import { uSpeed, uWin } from '../../engine/globals';
import { SCALES } from '../../audio/ChipSynth';
import { meta, PALETTE } from './meta';
import { rand, inst } from '../../fx/util';
import { atlas } from './sprites';
import { flyby, idleMoments } from '../../fx/ambient';
import { celebrations } from './celebrations';

const WATER = '#06243f';

// ------------------------------------------------------------------ world

function sky() {
  const uvS = screenUV;
  const aspect = screenSize.x.div(screenSize.y);
  const p = vec2(uvS.x.mul(aspect), uvS.y);
  let col: any = mix(rgb('#1a8fb5'), rgb(WATER), smoothstep(0.0, 0.42, uvS.y));
  // god rays fanning down from the surface
  const rays = pow(mx_noise_float(vec3(p.x.mul(5).add(uvS.y.mul(1.6)), time.mul(0.12), 0)).mul(0.5).add(0.5), 4);
  col = col.add(rgb('#7fe8ff').mul(rays).mul(float(1).sub(smoothstep(0.0, 0.75, uvS.y))).mul(0.5));
  const shimmer = mx_fractal_noise_float(vec3(p.mul(vec2(3, 14)), time.mul(0.4)), 3, 2, 0.5);
  col = col.add(vec3(smoothstep(0.3, 0.7, shimmer).mul(float(1).sub(smoothstep(0, 0.12, uvS.y))).mul(0.35)));
  return col;
}

function makeSand() {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 });
  const xz = positionWorld.xz;
  const ripples = sin(xz.x.mul(1.3).add(mx_noise_float(vec3(xz.mul(0.3), 0)).mul(4))).mul(0.5).add(0.5);
  mat.colorNode = mix(rgb('#3a3324'), rgb('#6e5f43'), ripples.mul(0.5).add(0.25));
  // two drifting Worley layers make the dancing caustic web
  const ca = mx_worley_noise_float(vec3(xz.mul(0.55), time.mul(0.45)));
  const cb = mx_worley_noise_float(vec3(xz.mul(0.55).add(3.7), time.mul(0.37).add(10)));
  const caustics = pow(ca.mul(cb), 1.6).mul(3.2);
  mat.emissiveNode = rgb('#7fffe8').mul(caustics).mul(float(1).add(uWin.mul(1.5)));
  const m = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), mat);
  m.rotation.x = -Math.PI / 2;
  return m;
}

function makeKelp(count: number) {
  const geo = new THREE.PlaneGeometry(0.55, 1, 1, 16).translate(0, 0.5, 0);
  const phases = new Float32Array(count);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.6 }), count);
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    let x = 0;
    let z = 0;
    do {
      x = rand(-24, 24);
      z = rand(-32, -3);
    } while (Math.abs(x) < 5 && z > -9);
    m.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand(-0.6, 0.6)), new THREE.Vector3(rand(0.8, 1.4), rand(4, 11), 1));
    mesh.setMatrixAt(i, m);
    phases[i] = Math.random() * 6.28;
  }
  const phase = inst(phases, 1, 'float');
  const mat = mesh.material as THREE.MeshStandardNodeMaterial;
  // positionLocal already includes the instance transform, so drive the sway
  // from the blade's own 0..1 height (uv.y) and offset in world units
  const y = uv().y;
  const sway = sin(time.mul(1.1).add(phase).add(y.mul(3))).mul(y.mul(y)).mul(0.9);
  mat.positionNode = positionLocal.add(vec3(sway, 0, sway.mul(0.4)));
  const g = uv().y;
  mat.colorNode = mix(rgb('#0f3d1f'), rgb('#6f8f2a'), g);
  mat.emissiveNode = rgb('#1de9b6').mul(pow(g, 6).mul(0.15));
  return mesh;
}

function makeShafts() {
  const group = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    const flicker = mx_noise_float(vec3(uv().x.mul(6), time.mul(0.3).add(i * 3), 0)).mul(0.5).add(0.5);
    mat.colorNode = rgb('#7fe8ff').mul(pow(uv().y, 2)).mul(flicker).mul(0.12);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(3.5, 30, 24, 1, true).rotateX(Math.PI), mat);
    cone.position.set(-12 + i * 6 + rand(-1, 1), 15, -6 - rand(0, 14));
    cone.rotation.z = rand(-0.25, 0.25);
    group.add(cone);
  }
  return group;
}

function makeRocks() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, flatShading: true });
  mat.colorNode = mix(rgb('#1d2b3a'), rgb('#3d4f5f'), mx_noise_float(positionLocal.mul(3)).mul(0.5).add(0.5));
  for (let i = 0; i < 14; i++) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.5, 1.8), 0), mat);
    const a = rand(0, Math.PI * 2);
    const d = rand(5, 18);
    rock.position.set(Math.cos(a) * d, 0, Math.sin(a) * d - 5);
    rock.scale.y = rand(0.4, 0.8);
    rock.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    group.add(rock);
  }
  return group;
}

// ------------------------------------------------------------------ theme

export const abyss: Theme = {
  ...meta,
  wheel: {
    palette: PALETTE,
    font: '"Bungee"',
    fontWeight: 400,
    rim: ['#c08a3e', '#2fffd6'],
    holo: 0.3,
    flapper: '#ff7a59',
    leds: ['#2fffd6', '#8a5cff'],
    hub: ['#2fffd6', '#2979ff'],
    pegs: '#ffd166',
    frame: '#0d2236',
  },
  post: { bloom: [0.6, 0.6, 0.75], exposure: 1.1, aberration: 0.7, vignette: 0.7 },
  character: { spot: [0, 0.22, 1.6], entrance: 'rise' },
  tick: 'bubble',
  song: {
    bpm: 100,
    root: 57,
    scale: SCALES.dorian,
    progressions: [
      [0, 3, 0, 4],
      [0, 5, 3, 4],
      [0, 2, 3, 4],
    ],
    lead: 'sine',
    bass: 'triangle',
    drums: 'half',
    density: 0.4,
    arp: true,
    brightness: 1800,
  },

  createScene({ scene, center }) {
    const group = new THREE.Group();
    scene.backgroundNode = sky();
    scene.fogNode = fog(rgb(WATER), rangeFogFactor(10, 48));
    scene.environmentIntensity = 0.35;

    group.add(makeSand(), makeKelp(80), makeShafts(), makeRocks());

    const bronze = new THREE.MeshStandardNodeMaterial({ color: '#8a5a2b', metalness: 1, roughness: 0.45 });
    const rock = new THREE.MeshStandardNodeMaterial({ roughness: 0.9 });
    rock.colorNode = mix(rgb('#22303d'), rgb('#415565'), mx_noise_float(positionLocal.mul(4)).mul(0.5).add(0.5));
    group.add(
      makeStand(center, {
        legs: bronze,
        plinth: rock,
        neon: rgb('#2fffd6').mul(sin(time.mul(2)).mul(0.4).add(1.4).add(uSpeed.mul(0.08)).add(uWin.mul(2.5))),
      }),
    );

    const sprites = atlas();
    const snow = new Particles({
      count: 320,
      atlas: sprites,
      cells: [5],
      loop: true,
      mode: 'face',
      blend: 'additive',
      intensity: 0.7,
      emitters: [{ at: [0, 6, -4], box: [16, 6, 10], dir: [0, -1, 0], spread: 0.3, speed: [0.05, 0.2] }],
      size: [0.04, 0.09],
      gravity: [0, -0.12, 0],
      drag: 1,
      life: [6, 12],
      wobble: 0.3,
      colors: ['#cffcff'],
    });
    const vents = new Particles({
      count: 90,
      atlas: sprites,
      cells: [0],
      loop: true,
      mode: 'face',
      lit: false,
      tint: 0.3,
      intensity: 1.3,
      emitters: [
        { at: [-6, 0.1, -5], box: [0.3, 0, 0.3], speed: [0.5, 1] },
        { at: [7.5, 0.1, -8], box: [0.3, 0, 0.3], speed: [0.5, 1] },
        { at: [-3, 0.1, -14], box: [0.3, 0, 0.3], speed: [0.5, 1] },
      ],
      size: [0.08, 0.22],
      gravity: [0, 1.4, 0],
      drag: 1.2,
      life: [4, 6],
      wobble: 0.15,
      colors: ['#bff6ff'],
    });
    group.add(snow.object, vents.object);

    // idle life: a few fish always drifting through the background
    const moments = idleMoments();
    const school = moments.track(
      flyby({ atlas: sprites, cells: [1], count: 7, from: [-26, 5.5, -12], box: [2, 2.5, 4], speed: [2, 2.8], life: 22, size: [0.5, 0.8], wobble: 0.35, colors: ['#ffd166', '#ff8fab', '#9ff0ff'], tint: 0.8, loop: true }),
    );
    // moments: a stream of bubbles from the sea floor, a big fish swimming past up close
    const bubbles = moments.track(
      new Particles({
        count: 16,
        atlas: sprites,
        cells: [0],
        mode: 'face',
        tint: 0.35,
        intensity: 1.3,
        colors: ['#bff6ff', '#ffffff'],
        emitters: [{ at: [5.5, 0.3, -5], box: [0.4, 0, 0.4], dir: [0, 1, 0], spread: 0.2, speed: [1, 2], delay: [0, 1.6] }],
        size: [0.12, 0.3],
        gravity: [0, 1.6, 0],
        drag: 1.2,
        life: [3.5, 4.5],
        wobble: 0.25,
      }),
    );
    const bigFish = moments.track(
      flyby({ atlas: sprites, cells: [1], count: 1, from: [-22, 6.5, 2], speed: [4, 5], life: 11, size: [1.1, 1.3], wobble: 0.5, stagger: 0, colors: ['#ffb347'], tint: 0.85 }),
    );
    group.add(school.object, bubbles.object, bigFish.object);
    moments.add(() => bubbles.fire());
    moments.add(() => bigFish.fire());

    const boost = makeLights(group, ['#9fe8ff', 0.8], [
      ['#2fffd6', 12, [-6, 5, 4]],
      ['#8a5cff', 12, [6, 5, 4]],
    ]);

    return {
      group,
      moments,
      update(f) {
        boost(f.speed, f.win);
        moments.update(f);
        snow.update(f.time);
        vents.update(f.time);
      },
    };
  },

  celebrations,
};
