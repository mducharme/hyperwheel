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
import { makeAtlas, shapes, type Sprite } from '../../fx/atlas';
import { starField } from '../../fx/nodes';
import { Particles } from '../../fx/Particles';
import type { FxDirector, FxItem } from '../../fx/FxDirector';
import { uSpeed, uWin } from '../../engine/globals';
import { SCALES } from '../../audio/ChipSynth';
import { meta, PALETTE } from './meta';


// ------------------------------------------------------------------ sprites

const wrappedCandy: Sprite = (ctx, r) => {
  ctx.fillStyle = '#fff';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * r * 0.45, 0);
    ctx.lineTo(s * r, -r * 0.45);
    ctx.lineTo(s * r, r * 0.45);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.55, r * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = r * 0.08;
  for (const x of [-0.2, 0.1, 0.4]) {
    ctx.beginPath();
    ctx.moveTo(r * (x - 0.15), -r * 0.35);
    ctx.lineTo(r * (x + 0.05), r * 0.35);
    ctx.stroke();
  }
};

const peppermint: Sprite = (ctx, r) => {
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r * 0.85, (i / 8) * Math.PI * 2, ((i + 1) / 8) * Math.PI * 2);
    ctx.fillStyle = i % 2 ? '#fff' : '#ff3b5c';
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.arc(-r * 0.3, -r * 0.3, r * 0.15, 0, Math.PI * 2);
  ctx.fill();
};

const donut: Sprite = (ctx, r) => {
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2);
  ctx.arc(0, 0, r * 0.32, 0, Math.PI * 2, true);
  ctx.fillStyle = '#fff';
  ctx.fill('evenodd');
  const sprinkle = ['#ff3b5c', '#3bc9ff', '#ffe03b', '#5cff8a'];
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = r * (0.45 + Math.random() * 0.3);
    ctx.save();
    ctx.translate(Math.cos(a) * d, Math.sin(a) * d);
    ctx.rotate(Math.random() * Math.PI);
    ctx.fillStyle = sprinkle[i % 4];
    ctx.fillRect(-r * 0.08, -r * 0.025, r * 0.16, r * 0.05);
    ctx.restore();
  }
};

const atlas = () =>
  makeAtlas([
    shapes.strip(0.28),
    shapes.heart(),
    shapes.star(5, 0.5),
    wrappedCandy,
    donut,
    shapes.circle(),
    peppermint,
    shapes.sparkle(),
  ]);

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
  }
  return mesh;
}

interface CandyScene extends ThemeScene {
  lollipops: THREE.Group[];
}

// ------------------------------------------------------------------ gumball cannon (CPU physics)

/** Real bouncing gumballs: few enough objects that a tiny CPU sim is the simplest option. */
class Gumballs implements FxItem {
  readonly object: THREE.InstancedMesh;
  private balls: { p: THREE.Vector3; v: THREE.Vector3; spawn: number }[] = [];
  private start = -1e4;
  private m = new THREE.Matrix4();
  private lastPop = 0;

  constructor(
    private fx: FxDirector,
    private count = 70,
  ) {
    const mat = new THREE.MeshPhysicalNodeMaterial({ roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03 });
    this.object = new THREE.InstancedMesh(new THREE.SphereGeometry(0.3, 24, 16), mat, count);
    this.object.frustumCulled = false;
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      this.object.setColorAt(i, c.set(PALETTE[i % PALETTE.length]));
      this.balls.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), spawn: 0 });
    }
    this.hideAll();
  }

  private hideAll() {
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < this.count; i++) this.object.setMatrixAt(i, this.m);
    this.object.instanceMatrix.needsUpdate = true;
  }

  fire() {
    this.start = this.fx.time;
    this.balls.forEach((b, i) => {
      const side = i % 2 ? 1 : -1;
      b.spawn = (i / this.count) * 1.4;
      b.p.set(side * 4.2, 0.6, 1.2);
      b.v.set(-side * (1.5 + Math.random() * 3.5), 9 + Math.random() * 5, 1 + Math.random() * 3);
    });
  }

  update(time: number, dt: number) {
    const age = time - this.start;
    if (age > 7) {
      if (age < 7.2) this.hideAll();
      return;
    }
    const R = 0.3;
    for (let i = 0; i < this.count; i++) {
      const b = this.balls[i];
      if (age < b.spawn) {
        this.m.makeScale(0, 0, 0);
      } else {
        b.v.y -= 16 * dt;
        b.p.addScaledVector(b.v, dt);
        if (b.p.y < R) {
          b.p.y = R;
          if (b.v.y < -3 && time - this.lastPop > 0.05) {
            this.fx.sfx.pop(0, 0.7 + Math.random() * 0.8);
            this.lastPop = time;
          }
          b.v.y = -b.v.y * 0.62;
          b.v.x *= 0.92;
          b.v.z *= 0.92;
        }
        const s = Math.min(1, (age - b.spawn) * 8) * (1 - THREE.MathUtils.smoothstep(age, 6, 7));
        this.m.makeScale(s, s, s).setPosition(b.p);
      }
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

// ------------------------------------------------------------------ theme

export const candy: Theme<CandyScene> = {
  ...meta,
  wheel: {
    palette: PALETTE,
    font: '"Fredoka"',
    fontWeight: 700,
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

  createScene({ scene, center }) {
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
      group.add(l);
      return l;
    });

    group.add(makeGumdrops(46));

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

    const boost = makeLights(group, ['#fff6e8', 1.2], [
      ['#ff8fc8', 10, [-6, 5, 4]],
      ['#7dffe0', 10, [6, 5, 4]],
    ]);

    return {
      group,
      lollipops,
      update(f) {
        boost(f.speed, f.win);
        sparkles.update(f.time);
        for (const l of lollipops) l.rotation.z = Math.sin(f.time * 0.8 + l.userData.phase) * 0.03 * (1 + f.win * 6);
      },
    };
  },

  celebrations: () => {
    const sprites = atlas();
    return [
      {
        name: 'Sprinkle Storm',
        setup(fx) {
          const rain = fx.particles({
            count: 1500,
            atlas: sprites,
            cells: [0, 0, 0, 0, 1, 2],
            colors: PALETTE,
            aspect: 0.5,
            emitters: [{ at: [0, 10.5, 0], box: [11, 1, 4], dir: [0, -1, 0], spread: 0.3, speed: [3, 6], delay: [0, 1.4] }],
            size: [0.16, 0.26],
            gravity: [0, -6, 0],
            drag: 1.2,
            life: [4, 5],
            mirror: false,
          });
          return () => {
            rain.fire();
            fx.stunt('boing');
            for (let i = 0; i < 6; i++) fx.sfx.pop(i * 0.09, 0.8 + i * 0.15);
          };
        },
      },
      {
        name: 'Gumball Cannon',
        setup(fx) {
          const balls = fx.add(new Gumballs(fx));
          return () => {
            balls.fire();
            fx.flash('#ff8fc8', 0.2, 0.4);
            fx.zoom(-0.08, 2.4);
            fx.sfx.boom(0, 1.6);
          };
        },
      },
      {
        name: 'Jelly Wobble',
        setup(fx) {
          const hearts = fx.particles({
            count: 280,
            atlas: sprites,
            cells: [1],
            colors: ['#ff3b8b', '#ff8fab', '#ff6fb5', '#ffffff'],
            mode: 'face',
            emitters: [{ at: [0, 3.9, 0.8], dir: [0, 1, 0.4], spread: 0.8, speed: [4, 9] }],
            size: [0.25, 0.45],
            gravity: [0, -3, 0],
            drag: 1.6,
            life: [2.5, 3.5],
            spin: 1.5,
          });
          return () => {
            fx.stunt('jelly');
            fx.zoom(0.12, 1.6);
            hearts.fire();
            fx.sfx.pop(0, 0.6);
            fx.sfx.pop(0.12, 0.9);
          };
        },
      },
      {
        name: 'Sugar Flip',
        setup(fx) {
          const cannons = fx.particles({
            count: 700,
            atlas: sprites,
            cells: [3, 4, 6, 5],
            colors: PALETTE,
            tint: 0.6,
            emitters: [
              { at: [-4.6, 0.4, 1.6], dir: [0.35, 1, 0.25], spread: 0.3, speed: [8, 14] },
              { at: [4.6, 0.4, 1.6], dir: [-0.35, 1, 0.25], spread: 0.3, speed: [8, 14] },
            ],
            size: [0.3, 0.45],
            gravity: [0, -7, 0],
            drag: 1.1,
          });
          return () => {
            fx.stunt('hop');
            fx.after(0.25, () => fx.stunt('flipX'));
            cannons.fire();
            fx.sfx.boom(0, 1.3);
          };
        },
      },
    ];
  },
};
