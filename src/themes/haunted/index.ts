import * as THREE from 'three/webgpu';
import {
  abs,
  float,
  fog,
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
  texture,
  time,
  uniform,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Theme, ThemeScene } from '../types';
import { makeLights, makeStand, rgb } from '../shared';
import { starField } from '../../fx/nodes';
import { Particles } from '../../fx/Particles';
import { uSpeed, uWin } from '../../engine/globals';
import { SCALES } from '../../audio/ChipSynth';
import { meta, PALETTE } from './meta';
import { rand } from '../../fx/util';
import { atlas } from './sprites';
import { celebrations } from './celebrations';

const NIGHT = '#241a36';

// ------------------------------------------------------------------ world

function sky(uLightning: any) {
  const uvS = screenUV;
  const aspect = screenSize.x.div(screenSize.y);
  const p = vec2(uvS.x.mul(aspect), uvS.y);
  let col: any = mix(rgb('#07040f'), rgb('#2a1840'), smoothstep(0.0, 0.62, uvS.y));
  col = mix(col, rgb('#1c3232'), smoothstep(0.5, 0.8, uvS.y).mul(0.6)); // sickly horizon haze
  const clouds = mx_fractal_noise_float(vec3(p.mul(vec2(1.6, 3.2)).add(vec2(time.mul(0.015), 0)), time.mul(0.01)), 5, 2, 0.5);
  col = mix(col, rgb('#3a2a52'), smoothstep(0.05, 0.5, clouds).mul(0.45).mul(float(1).sub(smoothstep(0.55, 0.8, uvS.y))));
  col = col.add(vec3(starField(0.9975, 2.5, 1.1)).mul(float(1).sub(smoothstep(0.3, 0.6, uvS.y))));
  return col.add(rgb('#b8c8ff').mul(uLightning).mul(float(1.2).sub(uvS.y)));
}

function makeMoon() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicNodeMaterial({ fog: false });
  const craters = mx_noise_float(positionLocal.mul(0.6)).mul(0.5).add(0.5);
  mat.colorNode = mix(rgb('#d8d2b0'), rgb('#fff8dc'), craters).mul(1.6);
  g.add(new THREE.Mesh(new THREE.CircleGeometry(5, 64), mat));
  const halo = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const d = length(uv().sub(0.5)).mul(2);
  halo.colorNode = rgb('#c9c2ff').mul(pow(float(1).sub(smoothstep(0.25, 1, d)), 2)).mul(0.5);
  const haloMesh = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), halo);
  haloMesh.position.z = -0.1;
  g.add(haloMesh);
  // a ragged cloud band drifting across the moon
  const cloudMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false });
  const n = mx_fractal_noise_float(vec3(uv().mul(vec2(3, 1.2)).add(vec2(time.mul(0.02), 0)), 0), 4, 2, 0.5);
  cloudMat.colorNode = rgb('#1a1128');
  cloudMat.opacityNode = smoothstep(0.0, 0.35, n).mul(smoothstep(0.0, 0.3, uv().y)).mul(float(1).sub(smoothstep(0.7, 1, uv().y))).mul(0.85);
  const band = new THREE.Mesh(new THREE.PlaneGeometry(40, 12), cloudMat);
  band.position.set(0, -1.5, 0.5);
  g.add(band);
  g.position.set(-15, 17, -62);
  return g;
}

function makeGround() {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 1 });
  const xz = positionWorld.xz;
  const n = mx_fractal_noise_float(vec3(xz.mul(0.35), 0), 4, 2, 0.5).mul(0.5).add(0.5);
  mat.colorNode = mix(rgb('#141a12'), rgb('#2a2a1c'), n).mul(0.8);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), mat);
  ground.rotation.x = -Math.PI / 2;
  return ground;
}

/** Two drifting sheets of low fog hugging the ground. */
function makeGroundFog() {
  const g = new THREE.Group();
  for (const [y, speed, alpha] of [
    [0.35, 0.03, 0.4],
    [0.9, -0.02, 0.25],
  ] as const) {
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false });
    const xz = positionWorld.xz;
    const n = mx_fractal_noise_float(vec3(xz.mul(0.12).add(vec2(time.mul(speed), 0)), time.mul(0.02)), 4, 2, 0.5);
    const fade = float(1).sub(smoothstep(14, 34, length(xz)));
    mat.colorNode = rgb('#8e86b8');
    mat.opacityNode = smoothstep(-0.1, 0.5, n).mul(alpha).mul(fade).mul(float(1).add(uWin.mul(0.5)));
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), mat);
    sheet.rotation.x = -Math.PI / 2;
    sheet.position.y = y;
    sheet.renderOrder = 1;
    g.add(sheet);
  }
  return g;
}

function tombstoneGeometry(w: number, h: number) {
  const s = new THREE.Shape();
  s.moveTo(-w, 0);
  s.lineTo(-w, h - w);
  s.absarc(0, h - w, w, Math.PI, 0, true);
  s.lineTo(w, 0);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2, curveSegments: 16 });
}

function makeGraveyard() {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 });
  stone.colorNode = mix(rgb('#3d3a46'), rgb('#6c6878'), mx_noise_float(positionLocal.mul(4)).mul(0.5).add(0.5)).mul(
    mix(float(0.7), float(1), smoothstep(0, 1.2, positionLocal.y)), // grimy at the base
  );
  const geos = [tombstoneGeometry(0.45, 1.3), tombstoneGeometry(0.35, 1), tombstoneGeometry(0.55, 1.1)];
  const cross = mergeGeometries([new THREE.BoxGeometry(0.16, 1.4, 0.16).translate(0, 0.7, 0), new THREE.BoxGeometry(0.75, 0.16, 0.16).translate(0, 1.0, 0)])!;
  let placed = 0;
  while (placed < 22) {
    const x = rand(-20, 20);
    const z = rand(-26, 3);
    if (Math.abs(x) < 4.5 && z > -7) continue; // keep the stage clear
    const isCross = Math.random() < 0.25;
    const m = new THREE.Mesh(isCross ? cross : geos[placed % geos.length], stone);
    m.position.set(x, -0.05, z);
    m.rotation.set(rand(-0.12, 0.08), rand(-0.5, 0.5), rand(-0.12, 0.12));
    m.scale.setScalar(rand(0.8, 1.3));
    g.add(m);
    placed++;
  }
  return g;
}

/** A twisted dead tree: recursive branches merged into one mesh. */
function makeTree(height: number) {
  const parts: THREE.BufferGeometry[] = [];
  const grow = (base: THREE.Vector3, dir: THREE.Vector3, len: number, radius: number, depth: number) => {
    const end = base.clone().addScaledVector(dir, len);
    const geo = new THREE.CylinderGeometry(radius * 0.65, radius, len, 6, 1);
    geo.translate(0, len / 2, 0);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
    geo.translate(base.x, base.y, base.z);
    parts.push(geo.toNonIndexed());
    if (depth === 0) return;
    const kids = depth > 2 ? 2 : 3;
    for (let i = 0; i < kids; i++) {
      const d = dir
        .clone()
        .add(new THREE.Vector3(rand(-0.9, 0.9), rand(-0.1, 0.5), rand(-0.6, 0.6)))
        .normalize();
      grow(end, d, len * rand(0.55, 0.75), radius * 0.62, depth - 1);
    }
  };
  grow(new THREE.Vector3(), new THREE.Vector3(rand(-0.1, 0.1), 1, 0).normalize(), height * 0.38, height * 0.06, 4);
  parts.forEach((p) => p.deleteAttribute('uv'));
  const mat = new THREE.MeshStandardNodeMaterial({ color: '#1a120e', roughness: 1, flatShading: true });
  return new THREE.Mesh(mergeGeometries(parts)!, mat);
}

/** Carved face texture for the jack-o'-lanterns (original design). */
function faceTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = '#fff';
  // sphere UVs put +Z (the front) at u = 0.25
  const cx = 128;
  const tri = (pts: number[]) => {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();
    ctx.fill();
  };
  tri([cx - 46, 112, cx - 22, 82, cx - 12, 114]); // eyes
  tri([cx + 46, 112, cx + 22, 82, cx + 12, 114]);
  tri([cx, 118, cx - 9, 134, cx + 9, 134]); // nose
  ctx.beginPath(); // jagged grin
  ctx.moveTo(cx - 58, 146);
  const teeth = [cx - 40, 160, cx - 28, 150, cx - 14, 166, cx, 154, cx + 14, 166, cx + 28, 150, cx + 40, 160, cx + 58, 146];
  for (let i = 0; i < teeth.length; i += 2) ctx.lineTo(teeth[i], teeth[i + 1]);
  ctx.quadraticCurveTo(cx, 206, cx - 58, 146);
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makePumpkins(uGlow: any) {
  const geo = new THREE.SphereGeometry(1, 40, 24);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i);
    const a = Math.atan2(v.z, v.x);
    const rib = 1 - 0.07 * Math.abs(Math.cos(a * 5));
    pos.setXYZ(i, v.x * rib, v.y * 0.72, v.z * rib);
  }
  geo.computeVertexNormals();
  const face = faceTexture();
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.6 });
  const carved = texture(face, uv()).r;
  // candle flicker, different per pumpkin (seeded by its world position)
  const flicker = mx_noise_float(vec3(time.mul(7), positionWorld.x.mul(3), positionWorld.z.mul(3))).mul(0.25).add(0.85);
  mat.colorNode = mix(rgb('#d9600f'), rgb('#2a1206'), carved);
  mat.emissiveNode = rgb('#ffb02e').mul(carved.mul(flicker).mul(float(2.4).add(uGlow.mul(4)).add(uWin.mul(2))));
  const stem = new THREE.MeshStandardNodeMaterial({ color: '#3d5a1f', roughness: 0.8 });
  const stemGeo = new THREE.CylinderGeometry(0.06, 0.1, 0.35, 8).translate(0, 0.85, 0);

  const g = new THREE.Group();
  const spots: [number, number, number][] = [
    [-3.4, 0.55, 2.2], [3.5, 0.6, 2.0], [-2.6, 0.38, 3.4], [2.9, 0.42, 3.3],
    [-5.2, 0.7, -0.5], [5.6, 0.75, -1.2], [-8, 0.6, -6], [8.5, 0.65, -7], [-1.2, 0.3, 4.1],
  ];
  for (const [x, size, z] of spots) {
    const p = new THREE.Group();
    p.add(new THREE.Mesh(geo, mat), new THREE.Mesh(stemGeo, stem));
    p.scale.setScalar(size);
    p.position.set(x, size * 0.68, z);
    // turn the carved face toward the camera
    p.rotation.y = Math.atan2(-x, 20 - z) + rand(-0.25, 0.25);
    g.add(p);
  }
  return g;
}

export interface HauntedScene extends ThemeScene {
  /** Pumpkins flare up. */
  surge(amount: number): void;
  /** Sky and moonlight flash. */
  lightning(): void;
}

// ------------------------------------------------------------------ theme

export const haunted: Theme<HauntedScene> = {
  ...meta,
  wheel: {
    palette: PALETTE,
    font: '"Creepster"',
    fontWeight: 400,
    rim: ['#ff7a1a', '#5b2a86'],
    holo: 0.15,
    flapper: '#ff7a1a',
    leds: ['#ff8a1f', '#7dff6a'],
    hub: ['#ff7a1a', '#5b2a86'],
    pegs: '#c9c2a8',
    frame: '#1a1226',
  },
  post: { bloom: [0.6, 0.5, 0.72], exposure: 1.05, aberration: 0.9, vignette: 0.75 },
  character: { spot: [0, 0.22, 1.6], entrance: 'rise' },
  tick: 'knock',
  song: {
    bpm: 112,
    root: 57,
    scale: SCALES.spooky,
    progressions: [
      [0, 1, 0, 4],
      [0, 5, 1, 0],
      [0, 3, 1, 4],
    ],
    lead: 'square',
    bass: 'triangle',
    drums: 'shuffle',
    density: 0.5,
    arp: true,
    brightness: 2200,
  },

  createScene({ scene, center }) {
    const group = new THREE.Group();
    const uLightning = uniform(0);
    const uGlow = uniform(0);
    scene.backgroundNode = sky(uLightning);
    scene.fogNode = fog(rgb(NIGHT), rangeFogFactor(16, 75));
    scene.environmentIntensity = 0.25;

    group.add(makeMoon(), makeGround(), makeGroundFog(), makeGraveyard(), makePumpkins(uGlow));
    for (const [x, z, h] of [
      [-11, -8, 9],
      [12, -11, 11],
      [-17, -17, 13],
      [19, -20, 12],
      [-6, -24, 10],
    ] as const) {
      const tree = makeTree(h);
      tree.position.set(x, 0, z);
      tree.rotation.y = rand(0, Math.PI * 2);
      group.add(tree);
    }

    const wood = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 });
    wood.colorNode = mix(rgb('#2b1d14'), rgb('#4a3424'), abs(sin(positionLocal.y.mul(9).add(mx_noise_float(positionLocal.mul(3)).mul(3)))));
    const stone = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 });
    stone.colorNode = mix(rgb('#2e2b36'), rgb('#4a4654'), mx_noise_float(positionLocal.mul(5)).mul(0.5).add(0.5));
    group.add(
      makeStand(center, {
        legs: wood,
        plinth: stone,
        neon: rgb('#7dff6a').mul(sin(time.mul(1.7)).mul(0.4).add(1.3).add(uSpeed.mul(0.06)).add(uWin.mul(2.5))),
      }),
    );

    const sprites = atlas();
    const wisps = new Particles({
      count: 70,
      atlas: sprites,
      cells: [6],
      loop: true,
      mode: 'face',
      blend: 'additive',
      intensity: 1.6,
      emitters: [{ at: [0, 2.5, -4], box: [16, 2.5, 10], spread: 2, speed: [0.1, 0.4] }],
      size: [0.08, 0.2],
      gravity: [0, 0.08, 0],
      drag: 0.6,
      life: [5, 9],
      wobble: 0.6,
      colors: ['#7dff6a', '#b8ff9e', '#9b5cff'],
    });
    group.add(wisps.object);

    const boost = makeLights(group, ['#9fb4ff', 0.7], [
      ['#ff8a1f', 14, [-5, 3, 4]],
      ['#9b5cff', 12, [6, 5, 3]],
    ]);
    const lights = group.children.filter((o): o is THREE.Light => (o as THREE.Light).isLight);
    const moonlight = lights.find((l) => (l as THREE.DirectionalLight).isDirectionalLight)!;
    const candle = lights.find((l) => (l as THREE.PointLight).isPointLight)!;
    let flash = 0;
    let flashT = -1;

    return {
      group,
      surge(amount) {
        uGlow.value = Math.max(uGlow.value, amount);
      },
      lightning() {
        flashT = 0;
      },
      update(f) {
        boost(f.speed, f.win);
        wisps.update(f.time);
        // candle flicker on the pumpkin light
        candle.intensity *= 0.85 + Math.random() * 0.3;
        // double-strike lightning
        if (flashT >= 0) {
          flashT += f.dt;
          const t = flashT;
          flash = t < 0.12 ? 1 : t < 0.22 ? 0.15 : t < 0.32 ? 0.85 : Math.max(0, 0.85 - (t - 0.32) * 2.5);
          if (t > 1) flashT = -1;
        } else flash = 0;
        uLightning.value = flash * 0.6;
        moonlight.intensity = 0.7 + flash * 6;
        uGlow.value *= Math.exp(-f.dt * 1.2);
      },
    };
  },

  celebrations,
};
