import * as THREE from 'three/webgpu';
import {
  abs,
  exp,
  float,
  floor,
  fog,
  hash,
  instancedBufferAttribute,
  length,
  max,
  mix,
  mx_fractal_noise_float,
  mx_noise_float,
  normalGeometry,
  positionGeometry,
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
  vec2,
  vec3,
} from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Theme, ThemeScene } from '../types';
import { makeLights, makeStand, rgb } from '../shared';
import { makeAtlas, shapes, type Sprite } from '../../fx/atlas';
import { starField } from '../../fx/nodes';
import { Particles } from '../../fx/Particles';
import type { FxDirector, FxItem } from '../../fx/FxDirector';
import { uSpeed, uWin } from '../../engine/globals';
import { SCALES } from '../../audio/ChipSynth';
import { meta, PALETTE } from './meta';

const HAZE = '#1d2c4d';
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const inst = (data: Float32Array, size: number, type: string): any =>
  instancedBufferAttribute(new THREE.InstancedBufferAttribute(data, size), type);

// ------------------------------------------------------------------ sprites

const snowflake: Sprite = (ctx, r) => {
  ctx.strokeStyle = '#fff';
  ctx.lineCap = 'round';
  ctx.lineWidth = r * 0.09;
  for (let i = 0; i < 6; i++) {
    ctx.save();
    ctx.rotate((i / 6) * Math.PI * 2);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -r * 0.85);
    for (const [y, w] of [
      [0.35, 0.22],
      [0.6, 0.16],
    ]) {
      ctx.moveTo(0, -r * y);
      ctx.lineTo(-r * w, -r * (y + w));
      ctx.moveTo(0, -r * y);
      ctx.lineTo(r * w, -r * (y + w));
    }
    ctx.stroke();
    ctx.restore();
  }
};

const present: Sprite = (ctx, r) => {
  ctx.fillStyle = '#fff';
  ctx.fillRect(-r * 0.65, -r * 0.45, r * 1.3, r * 1.15);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(-r * 0.12, -r * 0.45, r * 0.24, r * 1.15);
  ctx.fillRect(-r * 0.65, r * 0.0, r * 1.3, r * 0.2);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = r * 0.1;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(s * r * 0.22, -r * 0.6, r * 0.22, r * 0.13, s * 0.5, 0, Math.PI * 2);
    ctx.stroke();
  }
};

const atlas = () => makeAtlas([snowflake, shapes.star(5, 0.45), shapes.sparkle(), shapes.glow(), present, shapes.circle('#fff', true)]);

// ------------------------------------------------------------------ world

function sky(uAurora: any, uPhase: any) {
  const uvS = screenUV; // y grows downward
  const aspect = screenSize.x.div(screenSize.y);
  const p = vec2(uvS.x.mul(aspect), uvS.y);
  let col: any = mix(rgb('#02040d'), rgb('#0c1a3a'), smoothstep(0.0, 0.7, uvS.y));
  col = mix(col, rgb('#1d2c4d'), smoothstep(0.55, 0.85, uvS.y));
  col = col.add(vec3(starField(0.996, 2.5, 1.3)).mul(float(1).sub(smoothstep(0.35, 0.65, uvS.y))));

  // aurora: two wavering curtains with vertical streaks
  const curtain = (offset: number, height: number, tint: any) => {
    const wave = mx_noise_float(vec3(p.x.mul(0.9).add(offset), uPhase.mul(0.06), offset)).mul(0.13);
    const centre = float(height).add(wave);
    const band = exp(uvS.y.sub(centre).mul(7).pow(2).negate());
    // light hangs below the curtain's top edge
    const below = smoothstep(centre.sub(0.12), centre, uvS.y);
    const streaks = pow(mx_noise_float(vec3(p.x.mul(16), uPhase.mul(0.25), offset + 3)).mul(0.5).add(0.5), 2.5);
    return tint.mul(band.mul(below.mul(0.6).add(0.4))).mul(streaks.mul(1.5).add(0.25));
  };
  const hue = sin(p.x.mul(1.8).add(uPhase.mul(0.1))).mul(0.5).add(0.5);
  const green = mix(rgb('#29ff9a'), rgb('#2fe0ff'), hue);
  const fringe = mix(rgb('#b04dff'), rgb('#ff4dc4'), hue);
  const aurora = curtain(0, 0.24, green).add(curtain(4.2, 0.16, fringe).mul(0.6));
  return col.add(aurora.mul(float(0.55).add(uAurora.mul(1.6))));
}

function makeSnowField() {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.9 });
  const xz = positionWorld.xz;
  const dunes = mx_fractal_noise_float(vec3(xz.mul(0.25), 0), 3, 2, 0.5).mul(0.5).add(0.5);
  mat.colorNode = mix(rgb('#a9bde0'), rgb('#eef5ff'), dunes);
  // ice-crystal glints
  const cell = floor(xz.mul(22));
  const glint = step(0.993, hash(cell.x.add(cell.y.mul(733)))).mul(sin(time.mul(3).add(hash(cell.y.add(cell.x.mul(37))).mul(40))).mul(0.5).add(0.5));
  mat.emissiveNode = vec3(glint.mul(1.6)).mul(float(1).sub(smoothstep(8, 26, length(xz))));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), mat);
  ground.rotation.x = -Math.PI / 2;
  return ground;
}

function makeDrifts() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardNodeMaterial({ color: '#dfe9fb', roughness: 0.95 });
  for (let i = 0; i < 12; i++) {
    const drift = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    // keep drifts behind and beside the stage so nothing hides the snowmen
    const a = rand(Math.PI * 1.05, Math.PI * 1.95);
    const d = rand(13, 32);
    drift.position.set(Math.cos(a) * d, 0, Math.sin(a) * d - 4);
    drift.scale.set(rand(2, 6), rand(0.6, 1.8), rand(2, 5));
    g.add(drift);
  }
  return g;
}

/** Snow-dusted pines (instanced) with a few warm fairy lights on the nearer ones. */
function makePines(uTwinkle: any) {
  const tiers: THREE.BufferGeometry[] = [];
  for (const [y, r, h] of [
    [0.9, 1.3, 1.8],
    [1.9, 1.0, 1.5],
    [2.8, 0.7, 1.2],
  ] as const) {
    tiers.push(new THREE.ConeGeometry(r, h, 10, 1).translate(0, y + h / 2 - 0.2, 0).toNonIndexed());
  }
  const trunk = new THREE.CylinderGeometry(0.15, 0.2, 1, 8).translate(0, 0.5, 0).toNonIndexed();
  const all = [...tiers, trunk];
  all.forEach((g) => g.deleteAttribute('uv'));
  const geo = mergeGeometries(all)!;

  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, flatShading: true });
  // snow settles on upward-facing faces; the trunk stays bark-brown
  const snow = smoothstep(0.35, 0.65, normalGeometry.y.add(mx_noise_float(positionGeometry.mul(3)).mul(0.25)));
  const isTrunk = step(positionGeometry.y, 0.75);
  mat.colorNode = mix(mix(rgb('#1f4d3a'), rgb('#f2f6ff'), snow), rgb('#4a3020'), isTrunk);

  const spots: THREE.Vector3[] = [];
  while (spots.length < 34) {
    const x = rand(-26, 26);
    const z = rand(-34, 2);
    if (Math.abs(x) < 6 && z > -9) continue;
    spots.push(new THREE.Vector3(x, 0, z));
  }
  const pines = new THREE.InstancedMesh(geo, mat, spots.length);
  const m = new THREE.Matrix4();
  const lights: number[] = [];
  spots.forEach((p, i) => {
    const s = rand(0.9, 1.9);
    m.compose(p, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand(0, 6.28)), new THREE.Vector3(s, s * rand(0.9, 1.25), s));
    pines.setMatrixAt(i, m);
    if (p.z > -16) {
      // a spiral of bulbs around the nearer trees
      for (let k = 0; k < 10; k++) {
        const t = k / 10;
        const y = (0.9 + t * 2.6) * s;
        const r = (1.25 - t * 0.85) * s;
        const a = t * Math.PI * 5 + i;
        lights.push(p.x + Math.cos(a) * r, y, p.z + Math.sin(a) * r);
      }
    }
  });

  const count = lights.length / 3;
  const phase = new Float32Array(count).map(() => Math.random());
  const bulbMat = new THREE.MeshBasicNodeMaterial();
  const aPhase = inst(phase, 1, 'float');
  const twinkle = sin(time.mul(float(2).add(uTwinkle.mul(6))).add(aPhase.mul(40))).mul(0.5).add(0.5);
  const colour = mix(rgb('#ffb347'), rgb('#ff4d6d'), step(0.66, aPhase)).mul(step(aPhase, 0.9)).add(rgb('#7fdbff').mul(step(0.9, aPhase)));
  bulbMat.colorNode = colour.mul(twinkle.mul(2.5).add(0.6).add(uWin.mul(2)));
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 8, 6), bulbMat, count);
  for (let i = 0; i < count; i++) bulbs.setMatrixAt(i, m.makeTranslation(lights[i * 3], lights[i * 3 + 1], lights[i * 3 + 2]));

  const g = new THREE.Group();
  g.add(pines, bulbs);
  return g;
}

/** An original snowman: three snowballs, coal eyes and buttons, carrot nose, stick arms, scarf. */
function makeSnowman() {
  const g = new THREE.Group();
  const snow = new THREE.MeshStandardNodeMaterial({ color: '#f4f8ff', roughness: 0.9 });
  const coal = new THREE.MeshStandardNodeMaterial({ color: '#16161c', roughness: 0.6 });
  const carrot = new THREE.MeshStandardNodeMaterial({ color: '#ff7a1a', roughness: 0.6 });
  const wood = new THREE.MeshStandardNodeMaterial({ color: '#4a3020', roughness: 1 });
  const scarf = new THREE.MeshStandardNodeMaterial({ roughness: 0.8 });
  scarf.colorNode = mix(rgb('#d62839'), rgb('#f4f8ff'), step(0.5, abs(sin(positionGeometry.x.mul(30)))));
  const balls = [
    [0.75, 0.6],
    [0.55, 1.62],
    [0.4, 2.35],
  ] as const;
  for (const [r, y] of balls) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), snow);
    b.position.y = y;
    g.add(b);
  }
  for (const x of [-0.14, 0.14]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), coal);
    eye.position.set(x, 2.45, 0.34);
    g.add(eye);
  }
  for (const y of [1.45, 1.65, 1.85]) {
    const button = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), coal);
    button.position.set(0, y, 0.53);
    g.add(button);
  }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.38, 10).rotateX(Math.PI / 2), carrot);
  nose.position.set(0, 2.34, 0.55);
  g.add(nose);
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.1, 6), wood);
    arm.position.set(s * 0.9, 1.85, 0);
    arm.rotation.z = s * -1.0;
    g.add(arm);
  }
  const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.09, 8, 24).rotateX(Math.PI / 2), scarf);
  wrap.position.y = 2.05;
  g.add(wrap);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.06), scarf);
  tail.position.set(0.22, 1.8, 0.42);
  tail.rotation.z = 0.2;
  g.add(tail);
  return g;
}

// ------------------------------------------------------------------ snowball fight

/** Snowballs lobbed from both sides that splat on the wheel; the splats are a pre-aimed particle burst. */
class SnowballFight implements FxItem {
  readonly object: THREE.InstancedMesh;
  private balls: { from: THREE.Vector3; v: THREE.Vector3; delay: number; flight: number }[] = [];
  private start = -1e4;
  private m = new THREE.Matrix4();
  private puffs: ReturnType<FxDirector['particles']>;
  private hits = new Set<number>();

  constructor(
    private fx: FxDirector,
    sprites: ReturnType<typeof atlas>,
  ) {
    const C = fx.center;
    const g = -14;
    const targets: THREE.Vector3[] = [];
    for (let i = 0; i < 12; i++) {
      const a = rand(0, Math.PI * 2);
      const r = rand(0.6, 2.8);
      targets.push(new THREE.Vector3(C.x + Math.cos(a) * r, C.y + Math.sin(a) * r, 0.45));
    }
    targets.forEach((target, i) => {
      const side = i % 2 ? 1 : -1;
      const from = new THREE.Vector3(side * rand(9, 12), rand(1, 3), rand(3, 6));
      const flight = rand(0.7, 1.0);
      // v = (target - from - ½·g·t²) / t
      const v = target.clone().sub(from).sub(new THREE.Vector3(0, 0.5 * g * flight * flight, 0)).divideScalar(flight);
      this.balls.push({ from, v, delay: i * 0.18 + rand(0, 0.08), flight });
    });
    this.object = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.28, 16, 12),
      new THREE.MeshStandardNodeMaterial({ color: '#f4f8ff', roughness: 0.85 }),
      this.balls.length,
    );
    this.object.frustumCulled = false;
    this.hide();
    this.puffs = fx.particles({
      count: 600,
      atlas: sprites,
      cells: [5, 0],
      colors: ['#ffffff', '#e3eeff'],
      tint: 0.6,
      mode: 'face',
      lit: false,
      intensity: 1.3,
      mirror: false,
      emitters: targets.map((t, i) => ({
        at: [t.x, t.y, t.z + 0.1] as [number, number, number],
        dir: [0, 0.3, 1] as [number, number, number],
        spread: 1.3,
        speed: [2, 6] as [number, number],
        delay: [this.balls[i].delay + this.balls[i].flight, this.balls[i].delay + this.balls[i].flight + 0.02] as [number, number],
      })),
      size: [0.1, 0.24],
      gravity: [0, -6, 0],
      drag: 2.5,
      life: [0.7, 1.2],
      spin: 1,
    });
    this.g = g;
  }
  private g: number;

  private hide() {
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < this.balls.length; i++) this.object.setMatrixAt(i, this.m);
    this.object.instanceMatrix.needsUpdate = true;
  }

  fire() {
    this.start = this.fx.time;
    this.hits.clear();
    this.puffs.fire();
  }

  update(time: number) {
    const age = time - this.start;
    if (age < 0 || age > 4) return;
    const p = new THREE.Vector3();
    this.balls.forEach((b, i) => {
      const t = age - b.delay;
      if (t < 0 || t > b.flight) {
        if (t > b.flight && !this.hits.has(i)) {
          this.hits.add(i);
          this.fx.sfx.pop(0, 0.35 + Math.random() * 0.2);
        }
        this.m.makeScale(0, 0, 0);
      } else {
        p.copy(b.from).addScaledVector(b.v, t);
        p.y += 0.5 * this.g * t * t;
        this.m.makeTranslation(p.x, p.y, p.z);
      }
      this.object.setMatrixAt(i, this.m);
    });
    this.object.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.object.geometry.dispose();
    (this.object.material as THREE.Material).dispose();
    this.object.dispose();
  }
}

// ------------------------------------------------------------------ present drop

/** Wrapped gift boxes that tumble out of the sky and bounce in the snow (tiny CPU sim). */
class PresentDrop implements FxItem {
  readonly object: THREE.InstancedMesh;
  private boxes: { p: THREE.Vector3; v: THREE.Vector3; q: THREE.Quaternion; spin: THREE.Vector3; size: number; delay: number; landed: boolean }[] = [];
  private start = -1e4;
  private m = new THREE.Matrix4();

  constructor(
    private fx: FxDirector,
    private count = 26,
  ) {
    const colors = new Float32Array(count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      c.set(['#d62839', '#2a9d8f', '#4cc9f0', '#7b2fff', '#f4f8ff', '#ff7a1a'][i % 6]);
      colors.set([c.r, c.g, c.b], i * 3);
      this.boxes.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(), spin: new THREE.Vector3(), size: 1, delay: 0, landed: false });
    }
    const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.45 });
    // gold ribbon crossing every face of the unit box
    const gp = positionGeometry;
    const ribbon = max(step(abs(gp.x), 0.09), step(abs(gp.z), 0.09));
    mat.colorNode = mix(inst(colors, 3, 'vec3'), rgb('#ffd23f'), ribbon);
    mat.metalnessNode = ribbon.mul(0.6);
    this.object = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, count);
    this.object.frustumCulled = false;
    this.hide();
  }

  private hide() {
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < this.count; i++) this.object.setMatrixAt(i, this.m);
    this.object.instanceMatrix.needsUpdate = true;
  }

  fire() {
    this.start = this.fx.time;
    this.boxes.forEach((b, i) => {
      b.size = rand(0.35, 0.7);
      b.p.set(rand(-6, 6), rand(9, 13), rand(-1, 4));
      b.v.set(rand(-0.5, 0.5), rand(-2, 0), rand(-0.5, 0.5));
      b.q.setFromEuler(new THREE.Euler(rand(0, 3), rand(0, 3), rand(0, 3)));
      b.spin.set(rand(-3, 3), rand(-3, 3), rand(-3, 3));
      b.delay = (i / this.count) * 1.6;
      b.landed = false;
    });
  }

  update(time: number, dt: number) {
    const age = time - this.start;
    if (age < 0 || age > 7.5) {
      if (age > 7.5 && age < 7.7) this.hide();
      return;
    }
    const dq = new THREE.Quaternion();
    for (let i = 0; i < this.count; i++) {
      const b = this.boxes[i];
      if (age < b.delay) {
        this.object.setMatrixAt(i, this.m.makeScale(0, 0, 0));
        continue;
      }
      b.v.y -= 15 * dt;
      b.p.addScaledVector(b.v, dt);
      const floorY = b.size / 2;
      if (b.p.y < floorY) {
        b.p.y = floorY;
        if (!b.landed && b.v.y < -4) this.fx.sfx.pop(0, 0.3 + Math.random() * 0.15);
        b.landed = true;
        b.v.y = -b.v.y * 0.35;
        b.v.x *= 0.6;
        b.v.z *= 0.6;
        b.spin.multiplyScalar(0.5);
        // settle flat-ish once slow
        if (Math.abs(b.v.y) < 0.6) b.q.slerp(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), i), 0.2);
      }
      dq.setFromEuler(new THREE.Euler(b.spin.x * dt, b.spin.y * dt, b.spin.z * dt));
      b.q.multiply(dq);
      const fade = 1 - THREE.MathUtils.smoothstep(age, 6.5, 7.5);
      this.m.compose(b.p, b.q, new THREE.Vector3(b.size * fade, b.size * fade, b.size * fade));
      this.object.setMatrixAt(i, this.m);
    }
    this.object.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.object.geometry.dispose();
    (this.object.material as THREE.Material).dispose();
    this.object.dispose();
  }
}

interface WinterScene extends ThemeScene {
  /** The northern lights flare up and race. */
  aurora(amount: number): void;
  /** Whiteout: fog closes in for a few seconds. */
  storm(seconds: number): void;
}

// ------------------------------------------------------------------ theme

export const winter: Theme<WinterScene> = {
  ...meta,
  wheel: {
    palette: PALETTE,
    font: '"Mountains of Christmas"',
    fontWeight: 700,
    rim: ['#e8f4ff', '#4cc9f0'],
    holo: 0.35,
    flapper: '#d62839',
    leds: ['#ffb347', '#7fdbff'],
    hub: ['#7fdbff', '#e8f4ff'],
    pegs: '#ffd23f',
    frame: '#16233f',
  },
  post: { bloom: [0.5, 0.5, 0.9], exposure: 0.93, aberration: 0.8, vignette: 0.6 },
  character: { spot: [0, 0.22, 1.6], entrance: 'pop' },
  tick: 'jingle',
  song: {
    bpm: 126,
    root: 62,
    scale: SCALES.major,
    progressions: [
      [0, 4, 5, 3],
      [0, 3, 4, 0],
      [5, 3, 0, 4],
    ],
    lead: 'triangle',
    bass: 'sine',
    drums: 'shuffle',
    density: 0.55,
    arp: true,
    brightness: 4200,
  },

  createScene({ scene, center }) {
    const group = new THREE.Group();
    const uAurora = uniform(0);
    const uPhase = uniform(0);
    const uStorm = uniform(0);
    scene.backgroundNode = sky(uAurora, uPhase);
    // the whiteout pulls the fog in close and brightens it
    scene.fogNode = fog(mix(rgb(HAZE), rgb('#c9d8f0'), uStorm), rangeFogFactor(mix(float(18), float(2), uStorm), mix(float(85), float(22), uStorm)));
    scene.environmentIntensity = 0.35;

    group.add(makeSnowField(), makeDrifts(), makePines(uAurora));
    for (const [x, z, ry, s] of [
      [-4.4, 2.4, 0.45, 0.85],
      [4.7, 1.6, -0.5, 0.75],
    ] as const) {
      const snowman = makeSnowman();
      snowman.position.set(x, 0, z);
      snowman.rotation.y = ry;
      snowman.scale.setScalar(s);
      group.add(snowman);
    }

    const ice = new THREE.MeshPhysicalNodeMaterial({ color: '#bfe6ff', roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 });
    ice.emissiveNode = rgb('#4cc9f0').mul(float(0.15).add(uWin.mul(0.6)));
    const snowPlinth = new THREE.MeshStandardNodeMaterial({ color: '#eef5ff', roughness: 0.9 });
    group.add(
      makeStand(center, {
        legs: ice,
        plinth: snowPlinth,
        neon: rgb('#7fdbff').mul(sin(time.mul(1.4)).mul(0.4).add(1.5).add(uSpeed.mul(0.06)).add(uWin.mul(2.5))),
      }),
    );

    const sprites = atlas();
    const snowfall = new Particles({
      count: 450,
      atlas: sprites,
      cells: [3],
      loop: true,
      mode: 'face',
      blend: 'additive',
      intensity: 1.1,
      emitters: [{ at: [0, 9, -4], box: [18, 4, 12], dir: [0, -1, 0], spread: 0.2, speed: [0.2, 0.6] }],
      size: [0.05, 0.12],
      gravity: [0.15, -0.6, 0],
      drag: 1.2,
      life: [8, 12],
      wobble: 0.45,
      colors: ['#ffffff', '#e3eeff'],
    });
    group.add(snowfall.object);

    const boost = makeLights(group, ['#cfe3ff', 1.0], [
      ['#ffb36b', 10, [-6, 4, 4]],
      ['#7fdbff', 12, [6, 5, 3]],
    ]);

    let stormLeft = 0;
    return {
      group,
      aurora(amount) {
        uAurora.value = Math.max(uAurora.value, amount);
      },
      storm(seconds) {
        stormLeft = Math.max(stormLeft, seconds);
      },
      update(f) {
        boost(f.speed, f.win);
        snowfall.update(f.time);
        uPhase.value += f.dt * (1 + uAurora.value * 5 + f.speed * 0.05);
        uAurora.value *= Math.exp(-f.dt * 0.6);
        stormLeft = Math.max(0, stormLeft - f.dt);
        const target = stormLeft > 0 ? 1 : 0;
        uStorm.value += (target - uStorm.value) * (1 - Math.exp(-f.dt * (target ? 3 : 1.2)));
      },
    };
  },

  celebrations: (world) => {
    const sprites = atlas();
    return [
      {
        name: 'Snowball Fight',
        setup(fx) {
          const fight = fx.add(new SnowballFight(fx, sprites));
          return () => {
            fight.fire();
            fx.sfx.whoosh();
            fx.after(0.9, () => fx.stunt('boing'));
          };
        },
      },
      {
        name: 'Present Drop',
        setup(fx) {
          const gifts = fx.add(new PresentDrop(fx));
          return () => {
            gifts.fire();
            fx.zoom(-0.1, 3);
            fx.flash('#ffd23f', 0.15, 0.5);
          };
        },
      },
      {
        name: 'Blizzard',
        setup(fx) {
          const gust = fx.particles({
            count: 1600,
            atlas: sprites,
            cells: [3, 3, 0],
            colors: ['#ffffff', '#e3eeff'],
            mode: 'face',
            blend: 'additive',
            intensity: 1.4,
            mirror: false,
            emitters: [{ at: [14, 5, 0], box: [2, 6, 6], dir: [-1, -0.1, 0.15], spread: 0.25, speed: [10, 20], delay: [0, 2.2] }],
            size: [0.06, 0.18],
            gravity: [-3, -1.5, 0],
            drag: 0.4,
            life: [1.6, 2.4],
            wobble: 0.6,
          });
          return () => {
            gust.fire();
            world.storm(2.6);
            fx.shake(0.7, 2.6);
            fx.stunt('shake', 2);
            fx.sfx.whoosh();
            fx.after(0.7, () => fx.sfx.whoosh());
            fx.after(1.4, () => fx.sfx.whoosh());
          };
        },
      },
      {
        name: 'Aurora Surge',
        setup(fx) {
          const stars = fx.particles({
            count: 500,
            atlas: sprites,
            cells: [1, 2, 0],
            colors: ['#29ff9a', '#2fe0ff', '#b04dff', '#ffffff'],
            mode: 'face',
            blend: 'additive',
            intensity: 2,
            emitters: [{ at: [0, 3.9, 0.6], dir: [0, 1, 0.3], spread: 1, speed: [5, 10] }],
            size: [0.16, 0.32],
            gravity: [0, -3, 0],
            drag: 1.4,
            life: [2.2, 3.2],
            spin: 1.5,
          });
          return () => {
            world.aurora(1);
            stars.fire();
            fx.orbit(0.4, 3);
            fx.flash('#29ff9a', 0.12, 1.2);
          };
        },
      },
    ];
  },
};
