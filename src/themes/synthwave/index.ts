import * as THREE from 'three/webgpu';
import {
  abs,
  float,
  fract,
  fwidth,
  min,
  mix,
  mx_fractal_noise_float,
  positionWorld,
  pow,
  screenSize,
  screenUV,
  sin,
  smoothstep,
  step,
  time,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import type { Theme, ThemeScene } from '../types';
import { makeFloor, makeLights, makeStand, rgb } from '../shared';
import { makeAtlas, shapes } from '../../fx/atlas';
import { starField } from '../../fx/nodes';
import { uSpeed, uWin } from '../../engine/globals';
import { SCALES } from '../../audio/ChipSynth';
import { meta, PALETTE } from './meta';


/** Anti-aliased grid lines over a 2D coordinate. */
const gridLines = (p: any, cell: number) => {
  const c: any = p.div(cell);
  const g: any = abs(fract(c).sub(0.5)).div(fwidth(c).mul(1.2));
  return float(1).sub(min(min(g.x, g.y), 1.0));
};

function sky() {
  const uvS = screenUV;
  const aspect = screenSize.x.div(screenSize.y);
  const p = vec2(uvS.x.mul(aspect), uvS.y);
  const horizon = pow(smoothstep(0.1, 0.78, uvS.y), 2.2);
  let col: any = mix(vec3(0.012, 0.004, 0.035), vec3(0.12, 0.02, 0.22), smoothstep(0.0, 0.55, uvS.y));
  col = mix(col, vec3(0.9, 0.12, 0.55), horizon.mul(0.55));
  const n1 = mx_fractal_noise_float(vec3(p.mul(2.2), time.mul(0.02)), 5, 2.0, 0.5);
  const n2 = mx_fractal_noise_float(vec3(p.mul(4.0).add(7.3), time.mul(0.03)), 4, 2.0, 0.5);
  col = col.add(vec3(0.35, 0.05, 0.55).mul(smoothstep(0.0, 0.7, n1.add(0.15))).mul(0.35));
  col = col.add(vec3(0.0, 0.45, 0.6).mul(smoothstep(0.25, 0.8, n2)).mul(0.22).mul(float(1).sub(horizon)));
  return col.add(vec3(starField().mul(float(1).sub(horizon))));
}

/** Striped retro sun sinking into the horizon. */
function makeSun() {
  const mat = new THREE.MeshBasicNodeMaterial({ alphaTest: 0.5, fog: false });
  const y = uv().y;
  const stripes = fract(y.mul(14).sub(time.mul(0.35)));
  const gap = float(1).sub(smoothstep(0.0, 0.55, y)).mul(0.7); // thicker gaps toward the bottom
  mat.opacityNode = step(0.5, y).max(step(gap, stripes));
  const grad = mix(rgb('#ff2f7a'), rgb('#ffd23f'), smoothstep(0.1, 0.9, y));
  mat.colorNode = grad.mul(float(1.15).add(uWin.mul(1.2)));
  const sun = new THREE.Mesh(new THREE.CircleGeometry(13, 96), mat);
  sun.position.set(-4, 9, -70);
  return sun;
}

/** Wireframe mountain range flanking a flat valley. */
function makeMountains() {
  const geo = new THREE.PlaneGeometry(180, 50, 90, 25).rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const ridge = Math.abs(Math.sin(x * 0.11 + 1.3) * Math.cos(z * 0.17) + Math.sin(x * 0.27 + z * 0.13) * 0.5);
    const valley = THREE.MathUtils.smoothstep(Math.abs(x), 10, 34);
    pos.setY(i, ridge * valley * 11 * (0.6 + 0.4 * Math.sin(z * 0.09 + x * 0.03)));
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshBasicNodeMaterial();
  const lines = gridLines(uv().mul(vec2(90, 25)), 1);
  const height = smoothstep(0, 10, positionWorld.y);
  const lineCol = mix(rgb('#ff2fd0'), rgb('#2fd8ff'), height);
  mat.colorNode = vec3(0.02, 0.0, 0.05).add(lineCol.mul(lines).mul(height.mul(1.4).add(0.3)));
  const m = new THREE.Mesh(geo, mat);
  m.position.set(0, -0.1, -55);
  return m;
}

const atlas = () =>
  makeAtlas([
    shapes.triangle(true),
    shapes.ring(0.2),
    shapes.zigzag(),
    shapes.bolt(),
    shapes.star(5, 0.45),
    shapes.plus(),
    shapes.sparkle(),
    shapes.glow(),
  ]);

export const synthwave: Theme = {
  ...meta,
  wheel: {
    palette: PALETTE,
    font: '"Unbounded"',
    fontWeight: 800,
    rim: ['#ff2fd0', '#2fd8ff'],
    holo: 1,
    flapper: '#ff2fd0',
    leds: ['#ff2fd0', '#2fd8ff'],
    hub: ['#ff2fd0', '#7b2fff'],
    pegs: '#ffd76a',
    frame: '#1a1030',
  },
  post: { bloom: [0.5, 0.45, 0.82], exposure: 1, aberration: 1, vignette: 0.55 },
  character: { spot: [0, 0.22, 1.6], entrance: 'beam' },
  tick: 'click',
  song: {
    bpm: 118,
    root: 57,
    scale: SCALES.minor,
    progressions: [
      [0, 5, 3, 4],
      [0, 3, 5, 4],
      [5, 3, 0, 4],
    ],
    lead: 'sawtooth',
    bass: 'square',
    drums: 'four',
    density: 0.5,
    arp: true,
    brightness: 3200,
  },

  createScene({ scene, center }) {
    const group = new THREE.Group();
    scene.backgroundNode = sky();
    scene.environmentIntensity = 0.3;

    group.add(makeSun(), makeMountains());
    group.add(
      makeFloor({
        base: vec3(0.01, 0.0, 0.03),
        reflect: 0.55,
        pattern: (xz, dist) => {
          const pulse = sin(dist.mul(0.9).sub(time.mul(2.5).add(uSpeed.mul(0.4)))).mul(0.5).add(0.5);
          const c = mix(rgb('#ff26bf'), rgb('#26d9ff'), smoothstep(2, 22, positionWorld.z.negate()));
          return c
            .mul(gridLines(xz, 1.2))
            .mul(pulse.mul(0.9).add(0.35))
            .mul(float(1).sub(smoothstep(6, 34, dist)))
            .mul(float(1).add(uWin.mul(1.5)));
        },
      }),
    );

    const metal = new THREE.MeshStandardNodeMaterial({ color: '#1b1430', metalness: 1, roughness: 0.25 });
    group.add(
      makeStand(center, {
        legs: metal,
        neon: mix(rgb('#ff33d9'), rgb('#33e6ff'), sin(time.mul(1.5)).mul(0.5).add(0.5)).mul(
          float(2.2).add(uSpeed.mul(0.1)).add(uWin.mul(3)),
        ),
      }),
    );

    const boost = makeLights(group, ['#ffffff', 0.9], [
      ['#ff2fd0', 14, [-6, 5, 4]],
      ['#2fd8ff', 14, [6, 5, 4]],
    ]);
    const scn: ThemeScene = { group, update: (f) => boost(f.speed, f.win) };
    return scn;
  },

  celebrations: () => {
    const sprites = atlas();
    return [
      {
        name: 'Laser Cannons',
        setup(fx) {
          const p = fx.particles({
            count: 900,
            atlas: sprites,
            cells: [0, 1, 2, 3, 4, 5],
            colors: PALETTE,
            blend: 'normal',
            lit: false,
            intensity: 1.8,
            emitters: [
              { at: [-4.6, 0.4, 1.6], dir: [0.3, 1, 0.25], spread: 0.25, speed: [8, 15] },
              { at: [4.6, 0.4, 1.6], dir: [-0.3, 1, 0.25], spread: 0.25, speed: [8, 15] },
            ],
            size: [0.16, 0.26],
            gravity: [0, -6, 0],
            drag: 1.4,
            life: [3, 4.5],
          });
          return () => {
            p.fire();
            fx.ripple(0.8);
            fx.aberration(0.8);
            fx.sfx.boom(0, 1.2);
          };
        },
      },
      {
        name: 'Fireworks Finale',
        setup(fx) {
          const shells = 6;
          const p = fx.particles({
            count: 1800,
            atlas: sprites,
            cells: [6, 7],
            colors: PALETTE,
            blend: 'additive',
            intensity: 2.4,
            mode: 'stretch',
            stretch: 0.25,
            emitters: Array.from({ length: shells }, (_, i) => ({
              at: [(i % 2 ? 1 : -1) * (1 + Math.random() * 3.5), 4.5 + Math.random() * 3, 0.5 + Math.random() * 2] as [number, number, number],
              spread: 2,
              speed: [3, 6] as [number, number],
              delay: [i * 0.32, i * 0.32 + 0.03] as [number, number],
            })),
            size: [0.12, 0.2],
            gravity: [0, -2, 0],
            drag: 2.2,
            life: [1.4, 2.2],
          });
          return () => {
            p.fire();
            for (let i = 0; i < shells; i++) {
              fx.after(i * 0.32, () => fx.flash(PALETTE[i % PALETTE.length], 0.18, 0.3));
              fx.sfx.boom(i * 0.32, 0.8 + Math.random() * 0.5);
            }
            fx.orbit(0.25, 2.6);
          };
        },
      },
      {
        name: 'Grid Quake',
        setup(fx) {
          const waves = [0, 1, 2].map(() => fx.shockwave({ color: '#ff2fd0', radius: 18, width: 0.05, duration: 1.6 }));
          const fountain = fx.particles({
            count: 600,
            atlas: sprites,
            cells: [0, 1, 4, 5],
            colors: PALETTE,
            lit: false,
            intensity: 1.8,
            emitters: [{ at: [0, 7.6, 0.4], dir: [0, 1, 0.3], spread: 0.6, speed: [6, 10] }],
            size: [0.14, 0.24],
            gravity: [0, -7, 0],
            drag: 1.2,
          });
          return () => {
            fx.stunt('hop');
            waves.forEach((w, i) =>
              fx.after(0.35 + i * 0.22, () => {
                w.fire(new THREE.Vector3(0, 0.06, -0.6), 'floor');
                if (i === 0) {
                  fx.shake(1.6, 0.7);
                  fx.ripple(1.2, 1.4, new THREE.Vector3(0, 0.2, 0));
                }
              }),
            );
            fx.sfx.boom(0.35, 0.7);
            fx.after(0.2, () => fountain.fire());
          };
        },
      },
      {
        name: 'Outrun Flip',
        setup(fx) {
          const rain = fx.particles({
            count: 1000,
            atlas: sprites,
            cells: [0, 1, 2, 3, 4, 5],
            colors: PALETTE,
            lit: false,
            intensity: 1.6,
            emitters: [{ at: [0, 10.5, 0], box: [10, 1, 3], dir: [0, -1, 0], spread: 0.2, speed: [3, 6], delay: [0, 1.6] }],
            size: [0.14, 0.24],
            gravity: [0, -6, 0],
            drag: 1.2,
            life: [4, 5],
            mirror: false,
          });
          return () => {
            fx.stunt('flip');
            fx.orbit(0.5, 2.4);
            rain.fire();
            fx.flash('#ff2fd0', 0.25, 0.6);
          };
        },
      },
    ];
  },
};
