import * as THREE from 'three/webgpu';
import {
  abs,
  float,
  fog,
  fract,
  Fn,
  mix,
  mx_fractal_noise_float,
  mx_noise_float,
  positionGeometry,
  positionWorld,
  rangeFogFactor,
  screenSize,
  screenUV,
  sin,
  smoothstep,
  step,
  time,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Theme, ThemeScene } from '../types';
import { makeLights, makeStand, rgb } from '../shared';
import { lowRes } from '../../fx/nodes';
import { Particles } from '../../fx/Particles';
import { uSpeed, uWin } from '../../engine/globals';
import { SCALES } from '../../audio/ChipSynth';
import { meta, PALETTE } from './meta';
import { rand } from '../../fx/util';
import { atlas } from './sprites';
import { flyby, idleMoments } from '../../fx/ambient';
import { TNT } from './layout';
import { celebrations } from './celebrations';

type N = any;

/** The street runs away from the camera; buildings line both sides. */
const STREET_X = 8.6;

// ------------------------------------------------------------------ sky & land

function sky() {
  const day = Fn(() => {
    const uvS = screenUV; // y grows downward
    const p = vec2(uvS.x.mul(screenSize.x.div(screenSize.y)), uvS.y);
    let col: N = mix(rgb('#2a73c9'), rgb('#bfe0f2'), smoothstep(0.0, 0.62, uvS.y));
    const wisps = mx_fractal_noise_float(vec3(p.mul(vec2(0.9, 5)).add(vec2(time.mul(0.006), 0)), 0), 3, 2, 0.5);
    col = mix(col, rgb('#ffffff'), smoothstep(0.15, 0.6, wisps).mul(smoothstep(0.55, 0.15, uvS.y)).mul(0.6));
    return vec4(col, 1);
  });
  return lowRes(day()).rgb;
}

function makeGround() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 1 });
  const xz = positionWorld.xz;
  const n = mx_fractal_noise_float(vec3(xz.mul(0.2), 0), 2, 2, 0.5).mul(0.5).add(0.5);
  let col: N = mix(rgb('#c98a55'), rgb('#e0a96d'), n);
  // wagon ruts down the middle of the street
  const rut = (x: number) => smoothstep(0.25, 0.05, abs(xz.x.sub(x).add(mx_noise_float(vec3(xz.y.mul(0.2), 0, 0)).mul(0.3))));
  col = mix(col, rgb('#9c6a40'), rut(-1.3).max(rut(1.3)).mul(smoothstep(-2, -6, xz.y)).mul(0.55));
  // pebbles
  col = mix(col, rgb('#8d6a4e'), step(0.985, mx_noise_float(vec3(xz.mul(6), 0)).mul(0.5).add(0.5)));
  m.colorNode = col;
  const g = new THREE.Mesh(new THREE.PlaneGeometry(260, 180), m);
  g.rotation.x = -Math.PI / 2;
  g.position.z = -60;
  return g;
}

/** Red buttes on the horizon, with layered rock strata. */
function makeMesas() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 1, flatShading: true });
  const strata = sin(positionWorld.y.mul(2.2).add(mx_noise_float(positionWorld.mul(0.08)).mul(2))).mul(0.5).add(0.5);
  m.colorNode = mix(rgb('#a8452c'), rgb('#d27a4b'), strata);
  const g = new THREE.Group();
  for (const [x, z, w, h, d] of [
    [-55, -120, 30, 22, 14],
    [-20, -140, 18, 30, 12],
    [25, -125, 40, 18, 16],
    [70, -135, 22, 26, 12],
    [-90, -110, 26, 14, 12],
  ]) {
    const geo = new THREE.CylinderGeometry(w * 0.42, w * 0.55, h, 9, 3).scale(1, 1, d / w);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) < h / 2 - 0.1) pos.setX(i, pos.getX(i) * (1 + Math.sin(i * 1.7) * 0.06));
    geo.computeVertexNormals();
    const mesa = new THREE.Mesh(geo, m);
    mesa.position.set(x, h / 2, z);
    g.add(mesa);
  }
  return g;
}

/** Saguaro cacti: a ribbed trunk with an arm or two. */
function makeCacti() {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.8 });
  mat.colorNode = mix(rgb('#3f6b3a'), rgb('#5b8a4a'), sin(positionGeometry.x.mul(60).add(positionGeometry.z.mul(60))).mul(0.5).add(0.5));
  const g = new THREE.Group();
  const spots: [number, number][] = [
    [-11, -3],
    [12.5, -6],
    [-18, -16],
    [19, -18],
    [-26, -30],
    [30, -34],
    [-38, -50],
    [42, -46],
  ];
  for (const [x, z] of spots) {
    const h = rand(3.2, 5);
    const parts: THREE.BufferGeometry[] = [new THREE.CapsuleGeometry(0.35, h, 4, 10).translate(0, h / 2 + 0.3, 0)];
    for (const side of [-1, 1]) {
      if (Math.random() < 0.35) continue;
      const y = h * rand(0.35, 0.55);
      const up = rand(0.8, 1.6);
      parts.push(new THREE.CapsuleGeometry(0.22, 0.7, 4, 8).rotateZ(Math.PI / 2).translate(side * 0.6, y, 0));
      parts.push(new THREE.CapsuleGeometry(0.22, up, 4, 8).translate(side * 1.0, y + up / 2, 0));
    }
    const cactus = new THREE.Mesh(mergeGeometries(parts)!, mat);
    cactus.position.set(x, 0, z);
    cactus.rotation.y = rand(0, Math.PI);
    g.add(cactus);
  }
  return g;
}

// ------------------------------------------------------------------ the town

function signTexture(text: string, color: string) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f1e3c6';
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = '#3b2414';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 502, 118);
  ctx.fillStyle = color;
  ctx.font = '72px "Rye", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 70, 470);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A false-front clapboard building facing the street, with a porch and a painted sign. */
function makeBuilding(name: string, paint: string, side: number, z: number, width: number, height: number) {
  const g = new THREE.Group();
  const boards = new THREE.MeshStandardNodeMaterial({ roughness: 0.9 });
  // horizontal clapboards, weathered
  const plank = fract(positionWorld.y.mul(3.2));
  boards.colorNode = rgb(paint).mul(float(0.85).add(smoothstep(0.85, 1, plank).mul(-0.25)).add(mx_noise_float(positionWorld.mul(vec3(0.3, 3, 0.3))).mul(0.08)));
  const body = new THREE.Mesh(new THREE.BoxGeometry(5, height, width), boards);
  body.position.set(2.5, height / 2, 0);
  g.add(body);
  // the tall false front with its sign
  const front = new THREE.Mesh(new THREE.BoxGeometry(0.25, height + 1.6, width + 0.4), boards);
  front.position.set(0, (height + 1.6) / 2, 0);
  g.add(front);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.85, width * 0.21), new THREE.MeshStandardNodeMaterial({ map: signTexture(name, '#7a1f1f'), roughness: 0.8 }));
  sign.position.set(-0.14, height + 0.55, 0);
  sign.rotation.y = -Math.PI / 2;
  g.add(sign);
  // windows and a door
  const glass = new THREE.MeshStandardNodeMaterial({ color: '#1e2a33', roughness: 0.2, metalness: 0.3 });
  for (const wz of [-width * 0.28, width * 0.28]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.4), glass);
    win.position.set(-0.14, 2.2, wz);
    win.rotation.y = -Math.PI / 2;
    g.add(win);
  }
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.2), new THREE.MeshStandardNodeMaterial({ color: '#4a2c17', roughness: 0.8 }));
  door.position.set(-0.14, 1.1, 0);
  door.rotation.y = -Math.PI / 2;
  g.add(door);
  // porch roof on posts, and the boardwalk
  const wood = new THREE.MeshStandardNodeMaterial({ color: '#7a5233', roughness: 0.9 });
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2, 0.12, width + 0.4), wood);
  roof.position.set(-1, 3.3, 0);
  roof.rotation.z = 0.08;
  g.add(roof);
  for (const pz of [-width / 2, width / 2]) g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.3, 6).translate(-1.9, 1.65, pz), wood));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.2, width + 0.4).translate(-1, 0.1, 0), wood));
  g.position.set(side * STREET_X, 0, z);
  // built facing -X: turn the ones on the left around so every false front faces the street
  // (rotating rather than mirroring keeps the signs readable)
  g.rotation.y = side < 0 ? Math.PI : 0;
  return g;
}

function makeTown() {
  const g = new THREE.Group();
  const lots: [string, string, number, number, number, number][] = [
    ['SALOON', '#a8432f', -1, -4, 6, 4.2],
    ['GENERAL STORE', '#3e6e8a', 1, -3.5, 6.5, 3.8],
    ['SHERIFF', '#d9c08a', -1, -11, 5, 3.6],
    ['BANK', '#8a8f6b', 1, -11.5, 5.5, 4.4],
    ['HOTEL', '#7d4f6b', -1, -18, 6.5, 5.2],
    ['BARBER', '#c9a25a', 1, -19, 5, 3.4],
  ];
  for (const [name, paint, side, z, w, h] of lots) g.add(makeBuilding(name, paint, side, z, w, h));
  return g;
}

function makeWaterTower() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardNodeMaterial({ roughness: 0.9 });
  wood.colorNode = rgb('#8a6440').mul(float(0.9).add(step(0.9, fract(positionWorld.x.mul(2).add(positionWorld.z.mul(2)))).mul(-0.2)));
  for (const [x, z] of [
    [-1.4, -1.4],
    [1.4, -1.4],
    [-1.4, 1.4],
    [1.4, 1.4],
  ]) g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 6).translate(x, 3, z), wood));
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 3, 16).translate(0, 7.5, 0), wood));
  g.add(new THREE.Mesh(new THREE.ConeGeometry(2.5, 1.2, 16).translate(0, 9.6, 0), new THREE.MeshStandardNodeMaterial({ color: '#5a4a3a', roughness: 0.9 })));
  g.position.set(15, 0, -28);
  return g;
}

/** A wind pump: lattice tower and a wheel of blades that turns in the breeze. */
function makeWindmill() {
  const g = new THREE.Group();
  const iron = new THREE.MeshStandardNodeMaterial({ color: '#6a6660', metalness: 0.6, roughness: 0.5 });
  for (const [x, z] of [
    [-0.9, -0.9],
    [0.9, -0.9],
    [-0.9, 0.9],
    [0.9, 0.9],
  ]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 9.2, 5), iron);
    leg.position.set(x * 0.6, 4.5, z * 0.6);
    leg.rotation.set(z * -0.07, 0, x * 0.07);
    g.add(leg);
  }
  const rotor = new THREE.Group();
  const blades = mergeGeometries(Array.from({ length: 16 }, (_, i) => new THREE.BoxGeometry(0.28, 1.6, 0.04).translate(0, 1.3, 0).rotateZ((i / 16) * Math.PI * 2)))!;
  rotor.add(new THREE.Mesh(blades, new THREE.MeshStandardNodeMaterial({ color: '#c9c3b8', metalness: 0.4, roughness: 0.5 })));
  rotor.position.set(0, 9.4, 0.4);
  g.add(rotor);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1, 1.8).translate(0, 9.4, -1.4), iron);
  g.add(tail);
  g.position.set(-17, 0, -24);
  g.rotation.y = 0.5;
  return { group: g, rotor };
}

/** A bundle of dynamite on a crate by the stage (celebrations light it). */
function makeTnt() {
  const g = new THREE.Group();
  const crate = new THREE.Mesh(new THREE.BoxGeometry(1, 0.7, 0.8).translate(0, 0.35, 0), new THREE.MeshStandardNodeMaterial({ color: '#8a6440', roughness: 0.9 }));
  g.add(crate);
  const red = new THREE.MeshStandardNodeMaterial({ color: '#b3261e', roughness: 0.6 });
  for (const [x, z] of [
    [-0.12, 0],
    [0.12, 0],
    [0, 0.18],
  ]) g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.7, 10).translate(x, 1.05, z), red));
  g.add(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 6, 16).rotateX(Math.PI / 2).translate(0, 1.05, 0.06), new THREE.MeshStandardNodeMaterial({ color: '#2a2622' })));
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.3, 4).translate(0, 1.55, 0.06), new THREE.MeshStandardNodeMaterial({ color: '#3a3226' })));
  g.position.copy(TNT);
  g.rotation.y = -0.4;
  // everything but the crate goes up when it blows
  const sticks = g.children.slice(1);
  return { group: g, sticks };
}

/** Tumbleweeds: twiggy balls that bounce and roll across the street. */
function makeTumbleweeds(count: number) {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 1, side: THREE.DoubleSide, alphaTest: 0.5 });
  const twigs = mx_noise_float(positionGeometry.mul(9)).mul(0.5).add(0.5);
  mat.colorNode = mix(rgb('#8a6a3e'), rgb('#c9a46a'), twigs);
  mat.opacityNode = step(0.52, twigs).add(step(0.8, mx_noise_float(positionGeometry.mul(23)).mul(0.5).add(0.5)));
  const geo = new THREE.IcosahedronGeometry(0.6, 3);
  const weeds = Array.from({ length: count }, () => {
    const outer = new THREE.Mesh(geo, mat);
    const inner = new THREE.Mesh(geo, mat);
    inner.scale.setScalar(0.7);
    inner.rotation.set(1, 2, 3);
    const w = new THREE.Group();
    w.add(outer, inner);
    w.visible = false;
    return { mesh: w, x: 0, z: 0, speed: 0, delay: 0, size: 1, dir: 1, active: false };
  });
  return weeds;
}

export interface WestScene extends ThemeScene {
  /** Send `count` tumbleweeds rolling across the street. */
  tumbleweeds(count: number): void;
  /** Light the dynamite: it blows after `fuse` seconds (the crate stays). */
  dynamite(fuse: number): void;
}

// ------------------------------------------------------------------ theme

export const west: Theme<WestScene> = {
  ...meta,
  wheel: {
    palette: PALETTE,
    font: `"${meta.font.family}"`,
    fontWeight: meta.font.weight,
    rim: ['#6b4226', '#8b5a2b'],
    holo: 0,
    flapper: '#c9a25a',
    leds: ['#ffd27a', '#ffb347'],
    hub: ['#c9a25a', '#6b4226'],
    pegs: '#d9c9a8',
    frame: '#3b2414',
    rimFinish: 'wood',
    rivets: '#3a3a3e',
    pointer: 'horseshoe',
  },
  post: { bloom: [0.22, 0.4, 0.93], exposure: 0.92, aberration: 0.6, vignette: 0.45 },
  character: { spot: [0, 0.22, 1.6], entrance: 'pop' },
  tick: 'knock',
  song: {
    bpm: 128,
    root: 57,
    scale: SCALES.pentatonic,
    progressions: [
      [0, 3, 4, 0],
      [0, 0, 3, 4],
      [3, 0, 4, 0],
    ],
    lead: 'square',
    bass: 'triangle',
    drums: 'shuffle',
    density: 0.6,
    arp: false,
    brightness: 3600,
  },

  createScene({ scene, center }) {
    const group = new THREE.Group();
    scene.backgroundNode = sky();
    scene.fogNode = fog(rgb('#e9c9a0'), rangeFogFactor(60, 200));
    scene.environmentIntensity = 0.35;

    const tnt = makeTnt();
    group.add(makeGround(), makeMesas(), makeCacti(), makeTown(), makeWaterTower(), tnt.group);
    const windmill = makeWindmill();
    group.add(windmill.group);

    const weeds = makeTumbleweeds(10);
    for (const w of weeds) group.add(w.mesh);
    const tumbleweeds = (count: number) => {
      let n = 0;
      for (const w of weeds) {
        if (w.active || n >= count) continue;
        n++;
        w.active = true;
        w.dir = Math.random() < 0.5 ? 1 : -1;
        w.x = -w.dir * 20;
        // near ones roll in front of the stage, others along the street
        w.z = count === 1 ? rand(2.6, 3.6) : rand(-6, 4);
        w.speed = rand(4, 7);
        w.delay = count === 1 ? 0 : rand(0, 1.8);
        w.size = rand(0.7, 1.2);
        w.mesh.scale.setScalar(w.size);
      }
    };

    // weathered wooden stand on a round of planks
    const legs = new THREE.MeshStandardNodeMaterial({ color: '#5c3a1e', roughness: 0.8 });
    const planks = new THREE.MeshStandardNodeMaterial({ roughness: 0.85 });
    planks.colorNode = rgb('#8a6440').mul(float(0.85).add(step(0.92, fract(positionWorld.x.mul(2.2))).mul(-0.3)));
    group.add(makeStand(center, { legs, plinth: planks, neon: rgb('#ffcf7a').mul(float(1).add(uSpeed.mul(0.06)).add(uWin.mul(2.2))) }));

    // dust kicked up along the street
    const sprites = atlas();
    const dust = new Particles({
      count: 30,
      atlas: sprites,
      cells: [4],
      loop: true,
      mode: 'face',
      tint: 1,
      intensity: 0.8,
      colors: ['#e6c9a0'],
      emitters: [{ at: [0, 0.3, -12], box: [14, 0.2, 10], dir: [1, 0.3, 0], spread: 0.5, speed: [0.5, 1.5] }],
      size: [1, 2.4],
      gravity: [0.4, 0.15, 0],
      drag: 0.6,
      life: [4, 7],
      wobble: 0.6,
    });
    group.add(dust.object);

    // idle moments: a tumbleweed, a hawk gliding over, a gust that spins up the windmill
    const moments = idleMoments();
    const hawk = moments.track(flyby({ atlas: sprites, cells: [3], count: 1, from: [-30, 9.5, -26], speed: [5, 6], life: 12, size: [1.6, 1.6], wobble: 0.8, stagger: 0 }));
    group.add(hawk.object);
    let gust = 0;
    moments.add(() => tumbleweeds(1));
    moments.add(() => hawk.fire());
    moments.add(() => (gust = 4));

    let fuse = -1; // seconds until it blows
    let regrow = -1; // seconds until a fresh bundle appears
    const boost = makeLights(group, ['#fff1d6', 1.9], []);
    group.add(new THREE.HemisphereLight('#bfe0f2', '#b9784a', 0.7));

    return {
      group,
      moments,
      tumbleweeds,
      dynamite(seconds) {
        fuse = seconds;
      },
      update(f) {
        boost(f.speed, f.win);
        moments.update(f);
        dust.update(f.time);
        gust = Math.max(0, gust - f.dt);
        windmill.rotor.rotation.z -= f.dt * (0.8 + Math.min(gust, 1) * 4 + f.speed * 0.05);
        for (const w of weeds) {
          if (!w.active) continue;
          if (w.delay > 0) {
            w.delay -= f.dt;
            continue;
          }
          w.mesh.visible = true;
          w.x += w.dir * w.speed * f.dt;
          const hop = Math.abs(Math.sin(w.x * 0.9)) * 0.6;
          w.mesh.position.set(w.x, 0.6 * w.size + hop, w.z);
          w.mesh.rotation.z -= (w.dir * w.speed * f.dt) / (0.6 * w.size);
          if (Math.abs(w.x) > 21) {
            w.active = false;
            w.mesh.visible = false;
          }
        }
        if (fuse >= 0) {
          fuse -= f.dt;
          if (fuse < 0) {
            for (const s of tnt.sticks) s.visible = false;
            regrow = 5;
          }
        }
        if (regrow >= 0) {
          regrow -= f.dt;
          if (regrow < 0) for (const s of tnt.sticks) s.visible = true;
        }
      },
    };
  },

  celebrations,
};
