import * as THREE from 'three/webgpu';
import {
  abs,
  atan,
  cos,
  float,
  fract,
  instancedBufferAttribute,
  length,
  mix,
  mx_fractal_noise_float,
  mx_noise_float,
  positionLocal,
  pow,
  rotate,
  screenSize,
  screenUV,
  sin,
  smoothstep,
  time,
  uniform,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import type { Theme, ThemeScene } from '../types';
import { makeLights, rgb } from '../shared';
import { makeAtlas, shapes, type Sprite } from '../../fx/atlas';
import { starField } from '../../fx/nodes';
import { Particles } from '../../fx/Particles';
import { uSpeed, uWin } from '../../engine/globals';
import { SCALES } from '../../audio/ChipSynth';
import { meta, PALETTE } from './meta';


const inst = (data: Float32Array, size: number, type: string): any =>
  instancedBufferAttribute(new THREE.InstancedBufferAttribute(data, size), type);
const rand = (a: number, b: number) => a + Math.random() * (b - a);

// ------------------------------------------------------------------ sprites

const ringedPlanet: Sprite = (ctx, r) => {
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = r * 0.1;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.95, r * 0.28, -0.35, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(-r * 0.5, -r * 0.08, r, r * 0.12);
};

const comet: Sprite = (ctx, r) => {
  const g = ctx.createLinearGradient(-r, 0, r * 0.6, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(255,255,255,0.9)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-r, -r * 0.05);
  ctx.lineTo(r * 0.55, -r * 0.3);
  ctx.lineTo(r * 0.55, r * 0.3);
  ctx.lineTo(-r, r * 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(r * 0.55, 0, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
};

const crescent: Sprite = (ctx, r) => {
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2);
  ctx.arc(r * 0.35, -r * 0.2, r * 0.65, 0, Math.PI * 2, true);
  ctx.fill('evenodd');
};

const saucer: Sprite = (ctx, r) => {
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.15, r * 0.35, r * 0.32, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.9, r * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  for (const x of [-0.5, 0, 0.5]) {
    ctx.beginPath();
    ctx.arc(x * r, r * 0.02, r * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }
};

const atlas = () => makeAtlas([shapes.sparkle(), shapes.star(5, 0.45), ringedPlanet, comet, crescent, saucer, shapes.glow()]);

// ------------------------------------------------------------------ world

function sky() {
  const uvS = screenUV;
  const aspect = screenSize.x.div(screenSize.y);
  const p = vec2(uvS.x.mul(aspect), uvS.y);
  // a diagonal galactic band
  const band = p.y.sub(p.x.mul(0.35)).sub(0.35);
  const bandMask = pow(float(1).sub(smoothstep(0, 0.35, abs(band))), 2);
  const dust = mx_fractal_noise_float(vec3(p.mul(3.2), time.mul(0.01)), 6, 2.0, 0.55);
  let col: any = vec3(0.004, 0.003, 0.014);
  col = col.add(mix(rgb('#3a1d6e'), rgb('#ff8a5c'), smoothstep(0.1, 0.6, dust)).mul(bandMask).mul(smoothstep(-0.2, 0.5, dust)).mul(0.5));
  col = col.add(rgb('#1f6fa8').mul(smoothstep(0.35, 0.8, mx_fractal_noise_float(vec3(p.mul(1.6).add(9), 0), 4, 2, 0.5))).mul(0.12));
  col = col.add(vec3(starField(0.993, 2, 1.4)).mul(bandMask.mul(1.5).add(0.6)));
  col = col.add(vec3(starField(0.9985, 4, 2.2, 7)));
  return col;
}

/** Shared accretion-disk shader: differential rotation, temperature gradient, Doppler beaming. */
function diskMaterial(inner: number, outer: number, uSurge: any, brightness = 2.6) {
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const p = positionLocal.xy;
  const r = length(p);
  const rn = r.sub(inner).div(outer - inner);
  const a = atan(p.y, p.x);
  // inner orbits faster than outer
  const spin = time.mul(float(0.9).add(uSurge.mul(3))).div(r.mul(0.25).add(0.3));
  const swirl = vec2(cos(a.sub(spin)), sin(a.sub(spin))).mul(r.mul(0.9));
  const n = mx_fractal_noise_float(vec3(swirl, r.mul(0.6)), 5, 2.0, 0.5).mul(0.5).add(0.5);
  const temp = mix(mix(rgb('#fff3d6'), rgb('#ff8a2a'), smoothstep(0, 0.35, rn)), rgb('#6a0f2a'), smoothstep(0.35, 1, rn));
  const doppler = cos(a.add(0.4)).mul(0.6).add(1);
  const edges = smoothstep(0, 0.08, rn).mul(float(1).sub(smoothstep(0.7, 1, rn)));
  mat.colorNode = temp
    .mul(pow(n, 1.6))
    .mul(edges)
    .mul(doppler)
    .mul(float(brightness).add(uSurge.mul(4)).add(uWin.mul(1.5)));
  return mat;
}

function makeBlackHole(uSurge: any) {
  const g = new THREE.Group();
  const horizon = new THREE.Mesh(new THREE.SphereGeometry(3, 48, 32), new THREE.MeshBasicNodeMaterial({ color: '#000000', fog: false }));
  g.add(horizon);

  const disk = new THREE.Mesh(new THREE.RingGeometry(3.6, 11, 160, 4), diskMaterial(3.6, 11, uSurge));
  disk.rotation.x = -1.32;
  g.add(disk);

  // the far side of the disk, lensed up and over the horizon
  const halo = new THREE.Mesh(new THREE.RingGeometry(3.05, 4.6, 160, 2), diskMaterial(3.05, 4.6, uSurge, 1.6));
  halo.position.z = -0.2;
  g.add(halo);

  const photonMat = new THREE.MeshBasicNodeMaterial({ fog: false });
  photonMat.colorNode = rgb('#ffcf8a').mul(float(3).add(uSurge.mul(5)));
  const photon = new THREE.Mesh(new THREE.TorusGeometry(3.05, 0.035, 8, 160), photonMat);
  g.add(photon);

  g.position.set(9, 10, -36);
  g.userData.disk = disk;
  return g;
}

function makePlanet() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.8 });
  const y = positionLocal.y.div(4);
  const turbulence = mx_noise_float(positionLocal.mul(0.8)).mul(0.6);
  const bands = sin(y.mul(18).add(turbulence.mul(4))).mul(0.5).add(0.5);
  mat.colorNode = mix(mix(rgb('#c9905a'), rgb('#f2dcb3'), bands), rgb('#8a4b3a'), smoothstep(0.6, 1, abs(y)));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(4, 64, 48), mat));

  const ringMat = new THREE.MeshStandardNodeMaterial({ transparent: true, side: THREE.DoubleSide, roughness: 0.9 });
  const rr = length(positionLocal.xy);
  const lanes = mx_noise_float(vec3(rr.mul(6), 0, 0)).mul(0.5).add(0.5);
  ringMat.colorNode = mix(rgb('#a88b6a'), rgb('#efe0c4'), lanes);
  ringMat.opacityNode = smoothstep(0.25, 0.7, lanes).mul(0.85);
  const ring = new THREE.Mesh(new THREE.RingGeometry(5, 8.5, 128, 2), ringMat);
  ring.rotation.set(-1.2, 0.3, 0);
  g.add(ring);
  g.position.set(-17, 9, -44);
  g.rotation.z = 0.3;
  return g;
}

/** Rocks orbiting the wheel; orbit and tumble are computed in the vertex shader. */
function makeAsteroids(center: THREE.Vector3, count: number) {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i);
    v.multiplyScalar(1 + Math.sin(v.x * 5.1) * 0.15 + Math.cos(v.y * 4.3 + v.z * 3.1) * 0.15);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  const orbit = new Float32Array(count * 4); // radius, phase, speed, height
  const shape = new Float32Array(count * 4); // size, spin x, spin y, shade
  for (let i = 0; i < count; i++) {
    orbit.set([rand(6.5, 10.5), rand(0, Math.PI * 2), rand(0.04, 0.12), rand(-0.5, 0.5)], i * 4);
    shape.set([Math.pow(Math.random(), 3) * 0.22 + 0.04, rand(-1, 1), rand(-1, 1), rand(0.5, 1)], i * 4);
  }
  const aOrbit = inst(orbit, 4, 'vec4');
  const aShape = inst(shape, 4, 'vec4');
  const uPhase = uniform(0);

  // flat shading derives normals from screen-space derivatives, so the
  // shader-rotated rocks still light correctly
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, flatShading: true });
  const a = aOrbit.y.add(uPhase.mul(aOrbit.z));
  const local = rotate(positionLocal.mul(aShape.x), vec3(aShape.y, aShape.z, 0).mul(time.mul(0.6)));
  const ring = (vec3 as any)(cos(a).mul(aOrbit.x), aOrbit.w, sin(a).mul(aOrbit.x));
  // tilt so the near side passes below the wheel instead of across the names
  mat.positionNode = rotate(local.add(ring), vec3(0.5, 0, 0)).add(vec3(center.x, center.y, center.z));
  mat.colorNode = mix(rgb('#3b3346'), rgb('#7d6f86'), aShape.w);

  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  return { mesh, uPhase };
}

/** Hover pad and tractor beam holding the wheel up. */
function makeHoverPad(center: THREE.Vector3) {
  const g = new THREE.Group();
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 1.8, 0.35, 48),
    new THREE.MeshStandardNodeMaterial({ color: '#1a1530', metalness: 1, roughness: 0.25 }),
  );
  g.add(pad);
  const ringMat = new THREE.MeshBasicNodeMaterial();
  ringMat.colorNode = mix(rgb('#8a7dff'), rgb('#64ffda'), sin(time.mul(2)).mul(0.5).add(0.5)).mul(float(2.5).add(uSpeed.mul(0.1)).add(uWin.mul(3)));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.04, 8, 96).rotateX(Math.PI / 2), ringMat);
  ring.position.y = 0.18;
  g.add(ring);

  const beamMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const v = uv().y;
  const scan = pow(fract(v.mul(5).sub(time.mul(1.2))), 3);
  beamMat.colorNode = rgb('#8a7dff').mul(scan.mul(0.6).add(0.25)).mul(float(1).sub(v)).mul(float(0.7).add(uWin));
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 1.4, 2.4, 48, 1, true), beamMat);
  beam.position.y = 1.35;
  g.add(beam);
  g.position.set(center.x, center.y - 5.3, -0.2);
  return g;
}

interface CosmosScene extends ThemeScene {
  surge(amount: number): void;
}

// ------------------------------------------------------------------ theme

export const cosmos: Theme<CosmosScene> = {
  ...meta,
  wheel: {
    palette: PALETTE,
    font: '"Orbitron"',
    fontWeight: 800,
    rim: ['#ffb347', '#8a7dff'],
    holo: 0.5,
    flapper: '#ffb347',
    leds: ['#ffb347', '#8a7dff'],
    hub: ['#ffb347', '#8a7dff'],
    pegs: '#e0d4ff',
    frame: '#120a24',
  },
  post: { bloom: [0.7, 0.5, 0.7], exposure: 1, aberration: 1.2, vignette: 0.6 },
  camera: { frame: 9.6, look: 0.6 },
  character: { spot: [0, -1.22, 0.5], entrance: 'teleport' },
  tick: 'blip',
  floating: true,
  song: {
    bpm: 120,
    root: 55,
    scale: SCALES.lydian,
    progressions: [
      [0, 1, 0, 4],
      [0, 5, 1, 4],
      [3, 4, 0, 0],
    ],
    lead: 'triangle',
    bass: 'sawtooth',
    drums: 'four',
    density: 0.45,
    arp: true,
    brightness: 2600,
  },

  createScene({ scene, center }) {
    const group = new THREE.Group();
    scene.backgroundNode = sky();
    scene.environmentIntensity = 0.25;

    const uSurge = uniform(0);
    group.add(makeBlackHole(uSurge), makePlanet(), makeHoverPad(center));

    const moon = new THREE.Mesh(new THREE.SphereGeometry(1.1, 32, 24), new THREE.MeshStandardNodeMaterial({ roughness: 1 }));
    (moon.material as THREE.MeshStandardNodeMaterial).colorNode = mix(rgb('#5a5866'), rgb('#bdbac6'), mx_noise_float(positionLocal.mul(3)).mul(0.5).add(0.5));
    moon.position.set(-9, 15, -28);
    group.add(moon);

    const belt = makeAsteroids(center, 260);
    group.add(belt.mesh);

    const dust = new Particles({
      count: 220,
      atlas: atlas(),
      cells: [6],
      loop: true,
      mode: 'face',
      blend: 'additive',
      intensity: 0.8,
      emitters: [{ at: [0, 4, -10], box: [18, 10, 6], dir: [0, 0, 1], spread: 0.1, speed: [1, 3] }],
      size: [0.03, 0.08],
      gravity: [0, 0, 0],
      drag: 0.1,
      life: [6, 10],
      colors: ['#ffffff', '#cfc6ff'],
    });
    group.add(dust.object);

    const boost = makeLights(group, ['#ffffff', 1.0], [
      ['#ffb347', 16, [8, 8, -2]],
      ['#8a7dff', 12, [-6, 4, 4]],
    ]);

    let phase = 0;
    return {
      group,
      surge(amount) {
        uSurge.value = Math.max(uSurge.value, amount);
      },
      update(f) {
        boost(f.speed, f.win);
        dust.update(f.time);
        phase += f.dt * (1 + f.speed * 0.15 + uSurge.value * 6);
        belt.uPhase.value = phase;
        uSurge.value *= Math.exp(-f.dt * 0.8);
      },
    };
  },

  celebrations: (world) => {
    const sprites = atlas();
    return [
      {
        name: 'Supernova',
        setup(fx) {
          const inner = fx.shockwave({ color: '#ffd9a0', radius: 14, width: 0.06, duration: 1.4 });
          const outer = fx.shockwave({ color: '#8a7dff', radius: 20, width: 0.04, duration: 1.8 });
          const burst = fx.particles({
            count: 1200,
            atlas: sprites,
            cells: [0, 6],
            colors: ['#ffffff', '#ffd9a0', '#8a7dff', '#64ffda'],
            blend: 'additive',
            intensity: 2.4,
            mode: 'stretch',
            stretch: 0.12,
            emitters: [{ at: [0, 3.9, 0.6], spread: 2, speed: [5, 14] }],
            size: [0.12, 0.22],
            gravity: [0, 0, 0],
            drag: 1.6,
            life: [1.6, 2.6],
          });
          return () => {
            fx.flash('#ffffff', 1, 0.9);
            fx.ripple(1.6, 1.4);
            inner.fire(fx.at(0, 0, 0.6));
            fx.after(0.15, () => outer.fire(fx.at(0, 0, 0.5)));
            burst.fire();
            fx.shake(1.4, 0.8);
            fx.sfx.boom(0, 0.6);
            world.surge(1);
          };
        },
      },
      {
        name: 'Warp Speed',
        setup(fx) {
          const streaks = fx.particles({
            count: 1000,
            atlas: sprites,
            cells: [6],
            colors: ['#ffffff', '#9fe8ff', '#cfc6ff'],
            blend: 'additive',
            intensity: 2,
            mode: 'stretch',
            stretch: 0.09,
            // a ring of emitters around the wheel, streaking outward past the camera
            emitters: Array.from({ length: 12 }, (_, i) => {
              const a = (i / 12) * Math.PI * 2;
              return {
                at: [Math.cos(a) * 5.5, 3.9 + Math.sin(a) * 4.5, -3] as [number, number, number],
                box: [1.5, 1.5, 6] as [number, number, number],
                dir: [Math.cos(a) * 0.7, Math.sin(a) * 0.7, 1] as [number, number, number],
                spread: 0.15,
                speed: [18, 32] as [number, number],
                delay: [0, 2.2] as [number, number],
              };
            }),
            size: [0.2, 0.35],
            gravity: [0, 0, 0],
            drag: 0.1,
            life: [1.1, 1.5],
            mirror: false,
          });
          return () => {
            streaks.fire();
            fx.aberration(1.6);
            fx.zoom(0.18, 2.6);
            world.surge(1.5);
            fx.after(2.3, () => fx.flash('#cfc6ff', 0.5, 0.5));
            fx.sfx.whoosh();
            fx.after(0.9, () => fx.sfx.whoosh());
          };
        },
      },
      {
        name: 'Meteor Shower',
        setup(fx) {
          const meteors = fx.particles({
            count: 260,
            atlas: sprites,
            cells: [6],
            colors: ['#ffd9a0', '#ff8a5c', '#ffffff'],
            blend: 'additive',
            intensity: 2.6,
            mode: 'stretch',
            stretch: 0.14,
            emitters: [{ at: [-12, 16, -4], box: [10, 2, 5], dir: [1, -0.8, 0.3], spread: 0.1, speed: [14, 22], delay: [0, 2.6] }],
            size: [0.14, 0.26],
            gravity: [0, -1, 0],
            drag: 0.2,
            life: [1.4, 2],
          });
          const junk = fx.particles({
            count: 180,
            atlas: sprites,
            cells: [1, 2, 3, 4, 5],
            colors: PALETTE,
            tint: 0.7,
            lit: false,
            intensity: 1.5,
            emitters: [
              { at: [-5, 0, 2], dir: [0.4, 1, 0.3], spread: 0.4, speed: [6, 11] },
              { at: [5, 0, 2], dir: [-0.4, 1, 0.3], spread: 0.4, speed: [6, 11] },
            ],
            size: [0.3, 0.5],
            gravity: [0, -2.5, 0],
            drag: 0.8,
            life: [3.5, 4.5],
            spin: 2,
          });
          return () => {
            meteors.fire();
            junk.fire();
            for (let i = 0; i < 5; i++) fx.sfx.boom(0.4 + i * 0.5, 1.3);
            fx.orbit(-0.3, 3);
          };
        },
      },
      {
        name: 'Zero-G Tumble',
        setup(fx) {
          const drift = fx.particles({
            count: 500,
            atlas: sprites,
            cells: [0, 1, 1, 2, 5],
            colors: PALETTE,
            tint: 0.8,
            mode: 'face',
            lit: false,
            intensity: 1.6,
            emitters: [{ at: [0, 3.9, 0.5], spread: 2, speed: [2, 5] }],
            size: [0.2, 0.4],
            gravity: [0, 0, 0],
            drag: 0.6,
            life: [3.5, 5],
            spin: 1,
          });
          return () => {
            fx.stunt('tumble');
            fx.orbit(0.6, 2.6);
            drift.fire();
            world.surge(0.6);
          };
        },
      },
    ];
  },
};
