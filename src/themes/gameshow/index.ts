import * as THREE from 'three/webgpu';
import {
  abs,
  atan,
  float,
  fract,
  fwidth,
  instancedBufferAttribute,
  length,
  max,
  min,
  mix,
  mx_noise_float,
  positionGeometry,
  positionLocal,
  pow,
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
} from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Theme, ThemeScene } from '../types';
import { makeFloor, makeLights, makeStand, rgb } from '../shared';
import { makeAtlas, shapes, type Sprite } from '../../fx/atlas';
import { iridescent } from '../../fx/nodes';
import type { FxDirector } from '../../fx/FxDirector';
import { uSpeed, uWin } from '../../engine/globals';
import { SCALES } from '../../audio/ChipSynth';
import { meta, PALETTE } from './meta';

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const inst = (data: Float32Array, size: number, type: string): any =>
  instancedBufferAttribute(new THREE.InstancedBufferAttribute(data, size), type);

const WALL_Z = -13;
const WALL_W = 26;
const WALL_H = 13;

// ------------------------------------------------------------------ sprites

const balloon: Sprite = (ctx, r) => {
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.2, r * 0.55, r * 0.68, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-r * 0.08, r * 0.48);
  ctx.lineTo(r * 0.08, r * 0.48);
  ctx.lineTo(0, r * 0.58);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = r * 0.03;
  ctx.beginPath();
  ctx.moveTo(0, r * 0.58);
  ctx.quadraticCurveTo(r * 0.12, r * 0.78, 0, r * 0.98);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.2, -r * 0.45, r * 0.1, r * 0.17, -0.4, 0, Math.PI * 2);
  ctx.fill();
};

const coin: Sprite = (ctx, r) => {
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = r * 0.1;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
  ctx.stroke();
  shapes.star(5, 0.45, 'rgba(0,0,0,0.22)')(ctx, r * 0.42);
};

const atlas = () =>
  makeAtlas([
    shapes.strip(0.16), // ticker tape
    shapes.strip(0.4), // confetti
    shapes.star(5, 0.45),
    balloon,
    coin,
    shapes.sparkle(),
    shapes.glow(),
  ]);

// ------------------------------------------------------------------ studio

function sky() {
  // a dark studio with a little stage haze
  const uvS = screenUV;
  const aspect = screenSize.x.div(screenSize.y);
  const haze = mx_noise_float(vec3(uvS.x.mul(aspect).mul(1.5), uvS.y.mul(2), time.mul(0.05))).mul(0.5).add(0.5);
  return mix(rgb('#05030c'), rgb('#140b26'), smoothstep(0.0, 0.9, uvS.y)).add(rgb('#2a1450').mul(haze.mul(0.15)));
}

/** The giant LED wall: animated sunburst rays and waves, rendered as a grid of LED pixels. */
function makeVideoWall(uJackpot: any) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicNodeMaterial();
  const p = uv().sub(0.5).mul(vec2(WALL_W / WALL_H, 1));
  const r = length(p);
  const a = atan(p.y, p.x);
  const speed = float(0.15).add(uJackpot.mul(1.2)).add(uSpeed.mul(0.01));
  const rays = step(0.5, fract(a.div(Math.PI * 2).mul(18).add(time.mul(speed))));
  const rings = sin(r.mul(26).sub(time.mul(float(2).add(uJackpot.mul(8))))).mul(0.5).add(0.5);
  const calm = mix(rgb('#2a0f6b'), rgb('#ff2e88'), rays.mul(smoothstep(0.05, 0.9, r)));
  const wild = iridescent(a.div(Math.PI * 2).add(r.mul(1.5)).sub(time.mul(0.6))).mul(rings.mul(0.6).add(0.6));
  let col: any = mix(calm, wild, uJackpot.min(1));
  // a golden halo ring around the centre
  col = mix(col, rgb('#ffd23f'), float(1).sub(smoothstep(0.0, 0.07, abs(r.sub(0.38)))).mul(0.6));
  // LED pixel grid
  const cell = uv().mul(vec2(WALL_W * 6, WALL_H * 6));
  const d = length(fract(cell).sub(0.5));
  const led = float(1).sub(smoothstep(0.32, 0.45, d));
  // a backdrop, not the star: kept dim so the wheel (and the spotlight beams) stand out
  mat.colorNode = col.mul(led.mul(0.85).add(0.06)).mul(float(0.5).add(uJackpot.mul(0.9)).add(uWin.mul(0.3)));
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(WALL_W, WALL_H), mat);
  wall.position.set(0, WALL_H / 2 + 1, WALL_Z);
  g.add(wall);

  // a dark frame with chasing marquee bulbs all the way round
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(WALL_W + 1.6, WALL_H + 1.6, 0.4),
    new THREE.MeshStandardNodeMaterial({ color: '#1a1424', metalness: 0.8, roughness: 0.35 }),
  );
  frame.position.set(0, WALL_H / 2 + 1, WALL_Z - 0.25);
  g.add(frame);

  const spots: number[] = [];
  const step0 = 0.85;
  const W = WALL_W / 2 + 0.45;
  const H = WALL_H / 2 + 0.45;
  for (let x = -W; x <= W; x += step0) spots.push(x, H, x, -H);
  for (let y = -H + step0; y < H; y += step0) spots.push(-W, y, W, y);
  const count = spots.length / 2;
  const phase = new Float32Array(count).map((_, i) => i / count);
  const bulbMat = new THREE.MeshBasicNodeMaterial();
  const aPhase = inst(phase, 1, 'float');
  const chase = fract(aPhase.mul(24).sub(time.mul(float(1.2).add(uJackpot.mul(5)))));
  const lit = smoothstep(0.5, 1, chase).add(step(0.5, fract(time.mul(8))).mul(uJackpot));
  bulbMat.colorNode = mix(rgb('#ffcf7a'), rgb('#ffffff'), uJackpot.min(1)).mul(lit.mul(2.6).add(0.35));
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 10, 8), bulbMat, count);
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) bulbs.setMatrixAt(i, m.makeTranslation(spots[i * 2], WALL_H / 2 + 1 + spots[i * 2 + 1], WALL_Z + 0.05));
  g.add(bulbs);
  return g;
}

/** Red velvet drapes with deep folds. */
function makeCurtains() {
  const g = new THREE.Group();
  const mat = new THREE.MeshPhysicalNodeMaterial({ roughness: 0.75, sheen: 1, sheenRoughness: 0.4, sheenColor: new THREE.Color('#ff6b8a') });
  mat.colorNode = rgb('#7a0f22').mul(mx_noise_float(positionGeometry.mul(vec3(0.5, 0.08, 0.5))).mul(0.15).add(0.9));
  for (const side of [-1, 1]) {
    const geo = new THREE.PlaneGeometry(7, 17, 60, 1);
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      // folds gather toward the top, flare toward the floor
      pos.setZ(i, Math.sin(x * 3.2) * (0.35 + (0.5 - y / 17) * 0.25));
    }
    geo.computeVertexNormals();
    const curtain = new THREE.Mesh(geo, mat);
    curtain.position.set(side * 15.5, 8.5, WALL_Z + 2);
    curtain.rotation.y = -side * 0.35;
    g.add(curtain);
  }
  const valance = new THREE.Mesh(new THREE.BoxGeometry(38, 1.6, 0.6), mat);
  valance.position.set(0, 16.3, WALL_Z + 1.5);
  g.add(valance);
  return g;
}

/** Moving-head spotlights: additive volumetric cones that sweep, or converge on a target. */
function makeSpotlights(uJackpot: any) {
  const heads: { pivot: THREE.Group; base: number }[] = [];
  const g = new THREE.Group();
  const colors = ['#ff3b5c', '#3b82ff', '#ffd23f', '#2ee59d', '#b14dff'];
  colors.forEach((c, i) => {
    const pivot = new THREE.Group();
    pivot.position.set(-12 + i * 6, 15.5, -3 + (i % 2) * 2);
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    const along = uv().y; // 1 at the lamp, 0 at the far end
    const flicker = step(0.5, fract(time.mul(10).add(i * 0.37))).mul(uJackpot).mul(0.8).add(1);
    mat.colorNode = rgb(c).mul(pow(along, 1.6).mul(0.3)).mul(flicker).mul(float(1).add(uWin.mul(0.8)));
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 2.8, 20, 32, 1, true).translate(0, -10, 0), mat);
    pivot.add(beam);
    const lamp = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.35, 0.8, 16),
      new THREE.MeshStandardNodeMaterial({ color: '#222', metalness: 0.9, roughness: 0.3 }),
    );
    pivot.add(lamp);
    g.add(pivot);
    heads.push({ pivot, base: i * 1.3 });
  });
  return { group: g, heads };
}

/** A studio audience: silhouettes on side risers that bob when they cheer, plus camera flashbulbs. */
function makeAudience(uCheer: any) {
  const head = new THREE.SphereGeometry(0.28, 12, 8).translate(0, 1.45, 0);
  const body = new THREE.CapsuleGeometry(0.34, 0.6, 4, 10).translate(0, 0.75, 0);
  head.deleteAttribute('uv');
  body.deleteAttribute('uv');
  const geo = mergeGeometries([head.toNonIndexed(), body.toNonIndexed()])!;
  const seats: THREE.Vector3[] = [];
  for (const side of [-1, 1]) {
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 9; k++) {
        const z = -4 + k * 1.1 + rand(-0.15, 0.15);
        seats.push(new THREE.Vector3(side * (11 + row * 1.4 + rand(-0.15, 0.15)), row * 0.8, z));
      }
    }
  }
  const phase = new Float32Array(seats.length).map(() => Math.random());
  const aPhase = inst(phase, 1, 'float');
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.8 });
  mat.colorNode = rgb('#1b1530');
  const bob = abs(sin(time.mul(9).add(aPhase.mul(20)))).mul(0.35).mul(uCheer);
  // positionLocal already includes the instance transform here, so this offset is in world units
  mat.positionNode = positionLocal.add((vec3 as any)(0, bob, 0));
  const crowd = new THREE.InstancedMesh(geo, mat, seats.length);
  const m = new THREE.Matrix4();
  seats.forEach((s, i) => {
    m.compose(s, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.x > 0 ? -1.2 : 1.2), new THREE.Vector3(1, rand(0.9, 1.1), 1));
    crowd.setMatrixAt(i, m);
  });

  // risers
  const g = new THREE.Group();
  const riserMat = new THREE.MeshStandardNodeMaterial({ color: '#120d1f', roughness: 0.6, metalness: 0.4 });
  for (const side of [-1, 1]) {
    for (let row = 0; row < 4; row++) {
      const step1 = new THREE.Mesh(new THREE.BoxGeometry(1.4, row * 0.8 + 0.01, 11), riserMat);
      step1.position.set(side * (11 + row * 1.4), (row * 0.8) / 2, 0.4);
      g.add(step1);
    }
  }

  // flashbulbs: tiny quads that pop at random, more often when the crowd cheers
  const flashCount = seats.length;
  const fPhase = new Float32Array(flashCount * 2);
  for (let i = 0; i < flashCount; i++) fPhase.set([Math.random(), rand(0.15, 0.45)], i * 2);
  const aFlash = inst(fPhase, 2, 'vec2');
  const flashMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const rate = aFlash.y.add(uCheer.mul(1.6));
  const pop = pow(fract(time.mul(rate).add(aFlash.x)), 60);
  const dot = float(1).sub(smoothstep(0.1, 0.5, length(uv().sub(0.5))));
  flashMat.colorNode = vec3(pop.mul(dot).mul(6));
  const flashes = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.7, 0.7), flashMat, flashCount);
  seats.forEach((s, i) => flashes.setMatrixAt(i, m.makeTranslation(s.x, s.y + 1.6, s.z + 0.3)));
  g.add(crowd, flashes);
  return g;
}

interface ShowScene extends ThemeScene {
  /** Marquee and LED wall go wild for a while. */
  jackpot(seconds: number): void;
  /** The audience cheers (bobbing + flashbulbs). */
  cheer(seconds: number): void;
  /** Spotlights swing onto the wheel. */
  converge(seconds: number): void;
}

// ------------------------------------------------------------------ theme

export const gameshow: Theme<ShowScene> = {
  ...meta,
  wheel: {
    palette: PALETTE,
    font: '"Righteous"',
    fontWeight: 400,
    rim: ['#ffd23f', '#ffffff'],
    holo: 0.25,
    flapper: '#ffd23f',
    leds: ['#ffcf7a', '#ffffff'],
    hub: ['#ffd23f', '#ff3b5c'],
    pegs: '#ffffff',
    frame: '#141022',
  },
  post: { bloom: [0.6, 0.5, 0.8], exposure: 1, aberration: 0.9, vignette: 0.65 },
  character: { spot: [0, 0.22, 1.6], entrance: 'beam' },
  tick: 'click',
  song: {
    bpm: 128,
    root: 60,
    scale: SCALES.major,
    progressions: [
      [0, 3, 4, 3],
      [0, 5, 3, 4],
      [3, 4, 0, 5],
    ],
    lead: 'square',
    bass: 'sawtooth',
    drums: 'four',
    density: 0.6,
    arp: true,
    brightness: 3800,
  },

  createScene({ scene, center }) {
    const group = new THREE.Group();
    const uJackpot = uniform(0);
    const uCheer = uniform(0);
    scene.backgroundNode = sky();
    scene.environmentIntensity = 0.35;

    // glossy black stage with animated LED tiles
    group.add(
      makeFloor({
        base: vec3(0.01, 0.008, 0.02),
        reflect: 0.5,
        fade: [26, 46],
        pattern: (xz: any, dist: any) => {
          const tile = xz.div(1.5);
          const id = tile.floor();
          const edge: any = abs(fract(tile).sub(0.5)).div(fwidth(tile).mul(1.5));
          const line = float(1).sub(min(min(edge.x, edge.y), 1));
          const chase = fract(id.x.mul(0.37).add(id.y.mul(0.61)).sub(time.mul(float(0.3).add(uJackpot.mul(2)))));
          const glow = smoothstep(0.85, 1, chase);
          const col = iridescent(id.x.mul(0.05).add(id.y.mul(0.07)).add(time.mul(0.05)));
          return col
            .mul(glow.mul(0.6).add(line.mul(0.25)))
            .mul(float(1).sub(smoothstep(4, 22, dist)))
            .mul(float(1).add(uJackpot.mul(1.5)).add(uWin));
        },
      }),
    );

    group.add(makeVideoWall(uJackpot), makeCurtains(), makeAudience(uCheer));
    const spots = makeSpotlights(uJackpot);
    group.add(spots.group);

    const chrome = new THREE.MeshStandardNodeMaterial({ color: '#d8d8e8', metalness: 1, roughness: 0.15 });
    const black = new THREE.MeshPhysicalNodeMaterial({ color: '#0d0b14', metalness: 0.4, roughness: 0.25, clearcoat: 1 });
    group.add(
      makeStand(center, {
        legs: chrome,
        plinth: black,
        neon: iridescent(time.mul(0.2)).mul(float(2).add(uSpeed.mul(0.08)).add(uWin.mul(3)).add(uJackpot.mul(2))),
      }),
    );

    const boost = makeLights(group, ['#ffffff', 0.9], [
      ['#ff3b5c', 12, [-7, 6, 4]],
      ['#3b82ff', 12, [7, 6, 4]],
    ]);

    let jackpotLeft = 0;
    let cheerLeft = 0;
    let convergeLeft = 0;
    const target = new THREE.Vector3(center.x, center.y, 0);
    const aim = new THREE.Quaternion();
    const sweep = new THREE.Quaternion();
    const down = new THREE.Vector3(0, -1, 0);
    return {
      group,
      jackpot(s) {
        jackpotLeft = Math.max(jackpotLeft, s);
      },
      cheer(s) {
        cheerLeft = Math.max(cheerLeft, s);
      },
      converge(s) {
        convergeLeft = Math.max(convergeLeft, s);
      },
      update(f) {
        boost(f.speed, f.win);
        jackpotLeft = Math.max(0, jackpotLeft - f.dt);
        cheerLeft = Math.max(0, cheerLeft - f.dt);
        convergeLeft = Math.max(0, convergeLeft - f.dt);
        const ease = (v: number, on: boolean, k: number) => v + ((on ? 1 : 0) - v) * (1 - Math.exp(-f.dt * k));
        uJackpot.value = ease(uJackpot.value, jackpotLeft > 0, 4);
        // the crowd gets a little restless while the wheel spins, and erupts on a win
        uCheer.value = ease(uCheer.value, cheerLeft > 0, 5) + Math.min(0.3, f.speed * 0.02);
        const focus = convergeLeft > 0 ? 1 : 0;
        spots.heads.forEach((h, i) => {
          const t = f.time * (0.45 + i * 0.05) + h.base;
          sweep.setFromEuler(new THREE.Euler(Math.sin(t) * 0.45 + 0.15, 0, Math.cos(t * 0.8) * 0.5));
          aim.setFromUnitVectors(down, target.clone().sub(h.pivot.position).normalize());
          const want = sweep.clone().slerp(aim, focus);
          h.pivot.quaternion.slerp(want, 1 - Math.exp(-f.dt * (focus ? 5 : 2)));
        });
      },
    };
  },

  celebrations: (world) => {
    const sprites = atlas();
    const metallic = ['#ffd23f', '#e8e8f4', '#ff3b5c', '#3b82ff', '#2ee59d'];
    return [
      {
        name: 'Ticker-Tape Finale',
        setup(fx) {
          const tape = fx.particles({
            count: 1200,
            atlas: sprites,
            cells: [0, 0, 1],
            colors: metallic,
            aspect: 0.5,
            mirror: false,
            emitters: [{ at: [0, 16, 0], box: [14, 0.5, 5], dir: [0, -1, 0], spread: 0.3, speed: [2, 5], delay: [0, 1.5] }],
            size: [0.3, 0.55],
            gravity: [0, -3.5, 0],
            drag: 1.3,
            life: [4.5, 6],
            spin: 4,
            wobble: 0.5,
          });
          return () => {
            tape.fire();
            world.converge(4);
            world.cheer(3.5);
            fx.sfx.applause(3.2);
            fx.zoom(0.08, 2.5);
          };
        },
      },
      {
        name: 'Confetti Cannons',
        setup(fx) {
          const cannons = fx.particles({
            count: 1000,
            atlas: sprites,
            cells: [1, 1, 2],
            colors: metallic,
            emitters: [
              { at: [-4.6, 0.4, 1.6], dir: [0.3, 1, 0.25], spread: 0.25, speed: [9, 16] },
              { at: [4.6, 0.4, 1.6], dir: [-0.3, 1, 0.25], spread: 0.25, speed: [9, 16] },
            ],
            size: [0.16, 0.28],
            gravity: [0, -6, 0],
            drag: 1.3,
            life: [3.5, 5],
          });
          return () => {
            cannons.fire();
            world.cheer(2.5);
            fx.sfx.boom(0, 1.2);
            fx.sfx.applause(2.4, 0.15);
            fx.ripple(0.7);
          };
        },
      },
      {
        name: 'Jackpot',
        setup(fx) {
          const coins = fx.particles({
            count: 700,
            atlas: sprites,
            cells: [4],
            colors: ['#ffd23f', '#ffcf2f', '#ffe68a'],
            tint: 1,
            mirror: false,
            emitters: [{ at: [0, 15, 0.5], box: [9, 0.5, 3], dir: [0, -1, 0], spread: 0.2, speed: [3, 6], delay: [0, 1.2] }],
            size: [0.3, 0.45],
            gravity: [0, -9, 0],
            drag: 0.8,
            life: [3, 4],
            spin: 6,
          });
          return () => {
            world.jackpot(3.5);
            coins.fire();
            fx.flash('#ffd23f', 0.3, 0.6);
            fx.stunt('boing');
            for (let i = 0; i < 12; i++) fx.sfx.pop(i * 0.08, 1.4 + (i % 4) * 0.25);
          };
        },
      },
      {
        name: 'Standing Ovation',
        setup(fx: FxDirector) {
          const balloons = fx.particles({
            count: 160,
            atlas: sprites,
            cells: [3],
            colors: PALETTE,
            mode: 'face',
            lit: false,
            intensity: 1.15,
            mirror: false,
            emitters: [{ at: [0, -1, 2], box: [12, 0.5, 3], dir: [0, 1, 0], spread: 0.15, speed: [1, 3], delay: [0, 1.6] }],
            size: [0.7, 1.1],
            gravity: [0, 2.2, 0],
            drag: 0.9,
            life: [5, 6.5],
            spin: 0.4,
            wobble: 0.6,
          });
          return () => {
            balloons.fire();
            world.cheer(4.5);
            world.converge(3);
            fx.sfx.applause(4);
            fx.orbit(0.35, 4);
          };
        },
      },
    ];
  },
};
