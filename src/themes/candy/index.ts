import * as THREE from 'three/webgpu';
import {
  atan,
  float,
  floor,
  fract,
  hash,
  length,
  mix,
  mx_fractal_noise_float,
  positionLocal,
  screenSize,
  screenUV,
  sin,
  smoothstep,
  step,
  time,
  vec2,
  vec3,
} from 'three/tsl';
import type { Theme, ThemeScene } from '../types';
import { makeFloor, makeLights, makeStand, rgb } from '../shared';
import { starField } from '../../fx/nodes';
import { Particles } from '../../fx/Particles';
import { uSpeed, uWin } from '../../engine/globals';
import { SCALES } from '../../audio/ChipSynth';
import { meta, PALETTE } from './meta';
import { atlas } from './sprites';
import { idleMoments, pickInView } from '../../fx/ambient';
import { celebrations } from './celebrations';

// ------------------------------------------------------------------ world

function sky() {
  const uvS = screenUV;
  const aspect = screenSize.x.div(screenSize.y);
  const p = vec2(uvS.x.mul(aspect), uvS.y);
  let col: any = mix(rgb('#7ccfff'), rgb('#ffc2e2'), smoothstep(0.05, 0.75, uvS.y));
  const n = mx_fractal_noise_float(vec3(p.mul(vec2(1.4, 2.6)).add(vec2(time.mul(0.012), 0)), 0), 5, 2.0, 0.5);
  const clouds = smoothstep(0.05, 0.45, n).mul(float(1).sub(smoothstep(0.55, 0.8, uvS.y)));
  col = mix(col, mix(rgb('#ffffff'), rgb('#ffd6ec'), smoothstep(0.2, 0.6, n)), clouds.mul(0.85));
  return col.add(vec3(starField(0.998, 3, 0.8)));
}

function makeLollipop(radius: number, stick: number, a: string, b: string) {
  const g = new THREE.Group();
  const stickMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.07, radius * 0.07, stick, 16),
    new THREE.MeshStandardNodeMaterial({ color: '#ffffff', roughness: 0.4 }),
  );
  stickMesh.position.y = stick / 2;
  g.add(stickMesh);

  const mat = new THREE.MeshPhysicalNodeMaterial({ roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 });
  const p = positionLocal.xy;
  const ang = atan(p.y, p.x).div(Math.PI * 2);
  const spiral = step(0.5, fract(ang.mul(2).add(length(p).div(radius).mul(2.5)).sub(time.mul(0.08))));
  mat.colorNode = mix(rgb(a), rgb(b), spiral);
  mat.emissiveNode = mix(rgb(a), rgb(b), spiral).mul(uWin.mul(0.6).add(0.05));
  const candy = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, radius * 0.28, 64).rotateX(Math.PI / 2), mat);
  candy.position.y = stick + radius * 0.9;
  g.add(candy);
  return g;
}

function makeGumdrops(count: number) {
  const geo = new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2);
  const mat = new THREE.MeshPhysicalNodeMaterial({ roughness: 0.55, sheen: 1, sheenRoughness: 0.3, sheenColor: new THREE.Color('#ffffff') });
  // sugar-crystal glints
  const glint = step(0.985, hash(floor(positionLocal.mul(40)).dot(vec3(1, 57, 113))));
  mat.emissiveNode = vec3(glint.mul(0.8));
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  const bases: THREE.Matrix4[] = [];
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 5 + Math.random() * 16;
    const s = 0.3 + Math.random() * 0.7;
    m.compose(
      new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d - 4),
      new THREE.Quaternion(),
      new THREE.Vector3(s, s * 1.1, s),
    );
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c.set(PALETTE[i % PALETTE.length]));
    bases.push(m.clone());
  }
  mesh.userData.bases = bases;
  return mesh;
}

interface CandyScene extends ThemeScene {
  lollipops: THREE.Group[];
}

// ------------------------------------------------------------------ theme

export const candy: Theme<CandyScene> = {
  ...meta,
  wheel: {
    palette: PALETTE,
    font: `"${meta.font.family}"`,
    fontWeight: meta.font.weight,
    rim: ['#ff6fb5', '#ffffff'],
    holo: 0.2,
    flapper: '#ff3d8b',
    leds: ['#ffd166', '#ff8fab'],
    hub: ['#ff6fb5', '#5ee6c8'],
    pegs: '#ffffff',
    frame: '#ffb3d1',
  },
  post: { bloom: [0.25, 0.4, 1.25], exposure: 0.92, aberration: 0.6, vignette: 0.35 },
  character: { spot: [0, 0.22, 1.6], entrance: 'pop' },
  tick: 'pop',
  song: {
    bpm: 132,
    root: 60,
    scale: SCALES.major,
    progressions: [
      [0, 3, 4, 4],
      [0, 5, 3, 4],
      [0, 4, 5, 3],
    ],
    lead: 'square',
    bass: 'triangle',
    drums: 'shuffle',
    density: 0.6,
    arp: true,
    brightness: 5000,
  },

  createScene({ scene, center, camera }) {
    const group = new THREE.Group();
    scene.backgroundNode = sky();
    scene.environmentIntensity = 0.45;

    group.add(
      makeFloor({
        base: vec3(0),
        reflect: 0.22,
        fade: [16, 38],
        pattern: (xz) => {
          const check = step(0.5, fract(floor(xz.x.div(2)).add(floor(xz.y.div(2))).mul(0.5)));
          return mix(rgb('#ffb8d9'), rgb('#fff0f7'), check).mul(0.55);
        },
      }),
    );

    // candy-cane stand on a frosted cake plinth
    const cane = new THREE.MeshStandardNodeMaterial({ roughness: 0.25 });
    const stripe = step(0.5, fract(positionLocal.y.mul(2.2).add(atan(positionLocal.z, positionLocal.x).div(Math.PI * 2))));
    cane.colorNode = mix(rgb('#ff3b5c'), rgb('#ffffff'), stripe);
    const cake = new THREE.MeshStandardNodeMaterial({ roughness: 0.6 });
    const speck = step(0.93, hash(floor(positionLocal.mul(18)).dot(vec3(1, 57, 113))));
    cake.colorNode = mix(rgb('#ffc4dc'), rgb('#5ee6c8'), speck);
    group.add(
      makeStand(center, {
        legs: cane,
        plinth: cake,
        neon: rgb('#ffffff').mul(float(1.4).add(uSpeed.mul(0.05)).add(uWin.mul(2))),
      }),
    );

    const lollipops = (
      [
        [-9, -8, 2.2, 4, '#ff3b8b', '#ffffff'],
        [10, -12, 2.6, 5, '#5ee6c8', '#ffffff'],
        [-16, -20, 3.2, 7, '#ffd166', '#ff6fb5'],
        [17, -22, 3, 6, '#b388ff', '#ffffff'],
        [-4, -28, 3.6, 8, '#4cc9f0', '#ffd166'],
        [6, -34, 4, 9, '#ff9e5e', '#ffffff'],
      ] as const
    ).map(([x, z, r, h, a, b]) => {
      const l = makeLollipop(r, h, a, b);
      l.position.set(x, 0, z);
      l.rotation.y = Math.random() * 0.6 - 0.3;
      l.userData.phase = Math.random() * 6;
      l.userData.baseY = l.rotation.y;
      group.add(l);
      return l;
    });

    const gumdrops = makeGumdrops(46);
    group.add(gumdrops);

    // floating sugar sparkles
    const sparkles = new Particles({
      count: 160,
      atlas: atlas(),
      cells: [7],
      loop: true,
      mode: 'face',
      blend: 'additive',
      intensity: 1.2,
      emitters: [{ at: [0, 3, -4], box: [16, 4, 10], dir: [0, 1, 0], spread: 0.3, speed: [0.1, 0.4] }],
      size: [0.15, 0.35],
      gravity: [0, 0.05, 0],
      drag: 0.4,
      life: [5, 9],
      wobble: 0.4,
      colors: ['#ffffff', '#ffe3f1'],
    });
    group.add(sparkles.object);

    // idle moments: a gumdrop hops, a lollipop twirls
    const moments = idleMoments();
    const bases: THREE.Matrix4[] = gumdrops.userData.bases;
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), hopM = new THREE.Matrix4();
    let hop: { i: number; t: number } | null = null;
    let twirl: { l: THREE.Object3D; t: number } | null = null;
    // pick ones the camera can see (desktop and phone framing differ a lot)
    const all = bases.map((_, i) => i);
    moments.add(() => {
      const i = pickInView(camera, all, (i, out) => out.setFromMatrixPosition(bases[i]));
      if (i !== null) hop = { i, t: 0 };
    });
    moments.add(() => {
      const l = pickInView(camera, lollipops, (l, out) => l.getWorldPosition(out).setY(l.userData.top ?? 3));
      if (l) twirl = { l, t: 0 };
    });
    const animateMoments = (dt: number) => {
      if (hop) {
        hop.t = Math.min(1, hop.t + dt / 0.9);
        const u = hop.t;
        bases[hop.i].decompose(p, q, sc);
        // squash on take-off and landing, stretch in the air
        const k = (1 - 0.3 * (Math.exp(-((u / 0.07) ** 2)) + Math.exp(-(((u - 1) / 0.07) ** 2)))) * (1 + 0.15 * Math.sin(Math.PI * u));
        p.y += 4.4 * sc.y * u * (1 - u);
        gumdrops.setMatrixAt(hop.i, hopM.compose(p, q, sc.set(sc.x / Math.sqrt(k), sc.y * k, sc.z / Math.sqrt(k))));
        gumdrops.instanceMatrix.needsUpdate = true;
        if (u >= 1) hop = null;
      }
      if (twirl) {
        twirl.t = Math.min(1, twirl.t + dt / 1.6);
        const u = twirl.t;
        const ease = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
        twirl.l.rotation.y = twirl.l.userData.baseY + ease * Math.PI * 2;
        if (u >= 1) twirl = null;
      }
    };

    const boost = makeLights(group, ['#fff6e8', 1.2], [
      ['#ff8fc8', 10, [-6, 5, 4]],
      ['#7dffe0', 10, [6, 5, 4]],
    ]);

    return {
      group,
      moments,
      lollipops,
      update(f) {
        boost(f.speed, f.win);
        moments.update(f);
        animateMoments(f.dt);
        sparkles.update(f.time);
        for (const l of lollipops) l.rotation.z = Math.sin(f.time * 0.8 + l.userData.phase) * 0.03 * (1 + f.win * 6);
      },
    };
  },

  celebrations,
};
