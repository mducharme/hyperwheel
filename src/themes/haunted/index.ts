import * as THREE from 'three/webgpu';
import {
  abs,
  float,
  fog,
  instancedBufferAttribute,
  length,
  max,
  mix,
  mx_fractal_noise_float,
  mx_noise_float,
  positionGeometry,
  positionLocal,
  positionWorld,
  pow,
  rangeFogFactor,
  rotate,
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
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Theme, ThemeScene } from '../types';
import { makeLights, makeStand, rgb } from '../shared';
import { makeAtlas, shapes, type Sprite } from '../../fx/atlas';
import { fresnel, starField } from '../../fx/nodes';
import { Particles } from '../../fx/Particles';
import type { FxDirector, FxItem } from '../../fx/FxDirector';
import { uSpeed, uWin } from '../../engine/globals';
import { SCALES } from '../../audio/ChipSynth';
import { meta, PALETTE } from './meta';

const NIGHT = '#241a36';
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const inst = (data: Float32Array, size: number, type: string): any =>
  instancedBufferAttribute(new THREE.InstancedBufferAttribute(data, size), type);

// ------------------------------------------------------------------ sprites (original silhouettes)

const bat: Sprite = (ctx, r) => {
  ctx.fillStyle = '#241433';
  ctx.strokeStyle = '#7a4fb0';
  ctx.lineWidth = r * 0.05;
  ctx.beginPath();
  // body + scalloped wings
  ctx.moveTo(0, -r * 0.25);
  ctx.quadraticCurveTo(r * 0.35, -r * 0.55, r * 0.95, -r * 0.35);
  ctx.quadraticCurveTo(r * 0.8, -r * 0.05, r * 0.85, r * 0.15);
  ctx.quadraticCurveTo(r * 0.62, 0, r * 0.52, r * 0.18);
  ctx.quadraticCurveTo(r * 0.38, r * 0.02, r * 0.22, r * 0.25);
  ctx.quadraticCurveTo(r * 0.1, r * 0.1, 0, r * 0.35);
  ctx.quadraticCurveTo(-r * 0.1, r * 0.1, -r * 0.22, r * 0.25);
  ctx.quadraticCurveTo(-r * 0.38, r * 0.02, -r * 0.52, r * 0.18);
  ctx.quadraticCurveTo(-r * 0.62, 0, -r * 0.85, r * 0.15);
  ctx.quadraticCurveTo(-r * 0.8, -r * 0.05, -r * 0.95, -r * 0.35);
  ctx.quadraticCurveTo(-r * 0.35, -r * 0.55, 0, -r * 0.25);
  ctx.fill();
  ctx.stroke();
  // ears + glowing eyes
  ctx.beginPath();
  ctx.moveTo(-r * 0.12, -r * 0.2);
  ctx.lineTo(-r * 0.08, -r * 0.42);
  ctx.lineTo(-r * 0.02, -r * 0.22);
  ctx.moveTo(r * 0.12, -r * 0.2);
  ctx.lineTo(r * 0.08, -r * 0.42);
  ctx.lineTo(r * 0.02, -r * 0.22);
  ctx.fill();
  ctx.fillStyle = '#ffd23f';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(s * r * 0.06, -r * 0.12, r * 0.035, 0, Math.PI * 2);
    ctx.fill();
  }
};

const ghost: Sprite = (ctx, r) => {
  ctx.fillStyle = '#f4f1ff';
  ctx.beginPath();
  ctx.moveTo(-r * 0.55, r * 0.75);
  ctx.lineTo(-r * 0.55, -r * 0.2);
  ctx.arc(0, -r * 0.2, r * 0.55, Math.PI, 0);
  ctx.lineTo(r * 0.55, r * 0.75);
  for (let i = 0; i < 4; i++) {
    const x0 = r * 0.55 - (i * r * 1.1) / 4;
    ctx.quadraticCurveTo(x0 - r * 0.14, r * 0.95, x0 - r * 0.275, r * 0.75);
  }
  ctx.fill();
  ctx.fillStyle = '#20142e';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(s * r * 0.2, -r * 0.2, r * 0.08, r * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(0, r * 0.08, r * 0.1, r * 0.13, 0, 0, Math.PI * 2);
  ctx.fill();
};

const candyCorn: Sprite = (ctx, r) => {
  const tri = (y0: number, y1: number, color: string) => {
    const w = (y: number) => ((y + r * 0.85) / (r * 1.7)) * r * 0.7;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-w(y0), y0);
    ctx.lineTo(w(y0), y0);
    ctx.lineTo(w(y1), y1);
    ctx.lineTo(-w(y1), y1);
    ctx.closePath();
    ctx.fill();
  };
  tri(-r * 0.85, -r * 0.25, '#fff6e0');
  tri(-r * 0.25, r * 0.35, '#ff8a1f');
  tri(r * 0.35, r * 0.85, '#ffd23f');
};

const miniPumpkin: Sprite = (ctx, r) => {
  ctx.fillStyle = '#ff7a1a';
  for (const dx of [-0.32, 0.32, 0]) {
    ctx.beginPath();
    ctx.ellipse(dx * r, r * 0.08, r * (dx ? 0.42 : 0.48), r * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(120,40,0,0.45)';
  ctx.lineWidth = r * 0.05;
  for (const dx of [-0.2, 0.2]) {
    ctx.beginPath();
    ctx.ellipse(dx * r, r * 0.08, r * 0.12, r * 0.6, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#3d7a2a';
  ctx.fillRect(-r * 0.06, -r * 0.75, r * 0.12, r * 0.25);
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.moveTo(-r * 0.3, -r * 0.05);
  ctx.lineTo(-r * 0.15, -r * 0.2);
  ctx.lineTo(-r * 0.05, -r * 0.05);
  ctx.moveTo(r * 0.3, -r * 0.05);
  ctx.lineTo(r * 0.15, -r * 0.2);
  ctx.lineTo(r * 0.05, -r * 0.05);
  ctx.fill();
};

const wrapped: Sprite = (ctx, r) => {
  ctx.fillStyle = '#fff';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * r * 0.4, 0);
    ctx.lineTo(s * r * 0.95, -r * 0.4);
    ctx.lineTo(s * r * 0.95, r * 0.4);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.5, r * 0.36, 0, 0, Math.PI * 2);
  ctx.fill();
};

const atlas = () => makeAtlas([bat, ghost, candyCorn, miniPumpkin, wrapped, shapes.sparkle(), shapes.glow()]);

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

// ------------------------------------------------------------------ ghost parade

/** Sheet ghosts spiralling up around the wheel; orbit and hem flutter run on the GPU. */
class GhostParade implements FxItem {
  readonly object: THREE.InstancedMesh;
  private uTime = uniform(0);
  private uStart = uniform(-1e4);
  static DURATION = 6.5;

  constructor(center: THREE.Vector3, count = 22) {
    // dome head flaring into a sheet
    const profile: THREE.Vector2[] = [];
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * (Math.PI / 2);
      profile.push(new THREE.Vector2(Math.sin(a) * 0.5, 0.55 + Math.cos(a) * 0.5));
    }
    profile.reverse();
    profile.push(new THREE.Vector2(0.48, 0.15), new THREE.Vector2(0.52, -0.25), new THREE.Vector2(0.62, -0.62));
    const geo = new THREE.LatheGeometry(profile, 40);

    const orbit = new Float32Array(count * 4); // radius, phase, speed, height offset
    for (let i = 0; i < count; i++) orbit.set([rand(4.6, 6.6), rand(0, Math.PI * 2), rand(0.7, 1.15), rand(-3.5, 1)], i * 4);
    const aOrbit = inst(orbit, 4, 'vec4');

    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const t = this.uTime.sub(this.uStart);
    const D = GhostParade.DURATION;
    const alive = t.greaterThan(0).and(t.lessThan(D)).select(float(1), float(0));
    const env = smoothstep(0, 0.8, t).mul(float(1).sub(smoothstep(D - 1, D, t))).mul(alive);
    const lp = positionLocal;
    // fluttering hem
    const hem = float(1).sub(smoothstep(-0.6, 0.2, lp.y));
    const ang = lp.z.atan(lp.x);
    const wave = sin(ang.mul(7).add(this.uTime.mul(6)).add(aOrbit.y.mul(4)));
    const flutter = wave.mul(0.07).mul(hem);
    // scalloped, rippling hem
    const scallop = wave.mul(0.08).mul(float(1).sub(smoothstep(-0.62, -0.45, lp.y)));
    const local = vec3(lp.x.mul(float(1).add(flutter)), lp.y.add(scallop), lp.z.mul(float(1).add(flutter))).mul(env.mul(0.62));
    const a = aOrbit.y.add(aOrbit.z.mul(t));
    // face outward from the wheel, so the ones passing in front look at the camera
    const turned = rotate(local, vec3(0, a.add(Math.PI / 2), 0));
    const rise = t.mul(0.75).add(aOrbit.w);
    const bob = sin(t.mul(3).add(aOrbit.y)).mul(0.2);
    mat.positionNode = turned.add(vec3(a.cos().mul(aOrbit.x), rise.add(bob), a.sin().mul(aOrbit.x).negate()).add(vec3(center.x, center.y, center.z)));

    // two dark eyes and an "o" mouth on the front of the head
    // the face is painted in the ghost's own shape coordinates: positionLocal now
    // means the moved (orbiting) position, so use the untouched geometry instead
    const gp = positionGeometry;
    const eye = (x: number) => step(length(vec2(gp.x.sub(x), gp.y.sub(0.6)).mul(vec2(1, 0.7))), float(0.075));
    const front = step(0.25, gp.z);
    const mouth = step(length(vec2(gp.x, gp.y.sub(0.38)).mul(vec2(1, 0.8))), float(0.065));
    const face = max(max(eye(-0.16), eye(0.16)), mouth).mul(front);
    // soft glow, kept under the bloom threshold so ghosts stay readable
    const glow = fresnel(1.5).mul(0.35).add(0.55);
    mat.colorNode = mix(rgb('#e6e8ff').mul(glow), rgb('#1a1026'), face);
    mat.opacityNode = mix(float(0.72), float(1), face).mul(env);

    this.object = new THREE.InstancedMesh(geo, mat, count);
    this.object.frustumCulled = false;
    this.object.renderOrder = 2;
  }

  fire() {
    this.uStart.value = this.uTime.value;
  }
  update(time: number) {
    this.uTime.value = time;
  }
  dispose() {
    this.object.geometry.dispose();
    (this.object.material as THREE.Material).dispose();
  }
}

interface HauntedScene extends ThemeScene {
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

  celebrations: (world) => {
    const sprites = atlas();
    return [
      {
        name: 'Bat Swarm',
        setup(fx) {
          const bats = fx.particles({
            count: 240,
            atlas: sprites,
            cells: [0],
            tint: 0,
            mode: 'face',
            lit: false,
            intensity: 1.2,
            emitters: [{ at: [0, 3.9, -1.5], box: [2.5, 2.5, 0.5], dir: [0, 0.6, 1], spread: 1.2, speed: [6, 12] }],
            size: [0.45, 0.8],
            gravity: [0, 1.5, 0],
            drag: 1.1,
            life: [3, 4.2],
            spin: 2,
            wobble: 0.5,
          });
          return () => {
            bats.fire();
            fx.shake(0.5, 0.8);
            fx.sfx.whoosh();
            fx.after(0.25, () => fx.sfx.whoosh());
          };
        },
      },
      {
        name: 'Ghost Parade',
        setup(fx) {
          const ghosts = fx.add(new GhostParade(fx.center));
          return () => {
            ghosts.fire();
            fx.orbit(0.4, GhostParade.DURATION);
            fx.flash('#c9c2ff', 0.15, 1);
            fx.sfx.whoosh();
          };
        },
      },
      {
        name: 'Trick or Treat',
        setup(fx) {
          const treats = fx.particles({
            count: 600,
            atlas: sprites,
            cells: [2, 2, 3, 4],
            colors: ['#ff8a1f', '#9b5cff', '#7dff6a', '#ffd23f', '#ffffff'],
            tint: 0.5,
            emitters: [
              { at: [-4.6, 0.4, 1.6], dir: [0.35, 1, 0.25], spread: 0.3, speed: [8, 14] },
              { at: [4.6, 0.4, 1.6], dir: [-0.35, 1, 0.25], spread: 0.3, speed: [8, 14] },
            ],
            size: [0.24, 0.38],
            gravity: [0, -7, 0],
            drag: 1.1,
          });
          return () => {
            treats.fire();
            world.surge(1);
            fx.stunt('boing');
            fx.sfx.boom(0, 1.3);
            for (let i = 0; i < 5; i++) fx.sfx.pop(0.2 + i * 0.12, 0.7 + i * 0.1);
          };
        },
      },
      {
        name: 'Thunderstrike',
        setup(fx) {
          const wave = fx.shockwave({ color: '#9b5cff', radius: 16, width: 0.05, duration: 1.4 });
          const sparks = fx.particles({
            count: 500,
            atlas: sprites,
            cells: [5, 6],
            colors: ['#c9c2ff', '#7dff6a', '#ffffff'],
            blend: 'additive',
            intensity: 2.2,
            mode: 'stretch',
            stretch: 0.2,
            emitters: [{ at: [0, 3.9, 0.6], spread: 2, speed: [4, 10] }],
            size: [0.1, 0.18],
            gravity: [0, -2, 0],
            drag: 1.8,
            life: [1.2, 2],
          });
          return () => {
            world.lightning();
            fx.flash('#cfd8ff', 0.7, 0.25);
            fx.after(0.3, () => fx.flash('#cfd8ff', 0.55, 0.5));
            fx.after(0.3, () => {
              sparks.fire();
              wave.fire(new THREE.Vector3(0, 0.08, -0.6), 'floor');
              fx.shake(1.6, 0.9);
              fx.stunt('shake');
              fx.ripple(1, 1.2);
            });
            fx.sfx.boom(0.35, 0.5);
            fx.sfx.boom(0.6, 0.4);
          };
        },
      },
    ];
  },
};
