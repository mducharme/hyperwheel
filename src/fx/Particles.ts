import * as THREE from 'three/webgpu';
import {
  atan,
  cos,
  exp,
  float,
  floor,
  fract,
  instancedBufferAttribute,
  length,
  max,
  min,
  mix,
  mod,
  positionLocal,
  rotate,
  sin,
  smoothstep,
  step,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import type { Atlas } from './atlas';
import { rand } from './util';

type V3 = [number, number, number];

export interface Emitter {
  at: V3;
  /** Random half-extents around `at`. */
  box?: V3;
  /** Launch direction (normalised internally). Default straight up. */
  dir?: V3;
  /** Cone half-angle as a fraction of 90°; 2 = full sphere. */
  spread?: number;
  speed?: [number, number];
  /** Per-particle launch delay range in seconds. */
  delay?: [number, number];
  /** Relative share of the particle count. */
  weight?: number;
}

export interface ParticleOptions {
  count: number;
  emitters: Emitter[];
  atlas: Atlas;
  /** Subset of atlas cells to use (default: all). */
  cells?: number[];
  /** tumble = 3D paper flutter, face = flat to camera, stretch = streak along velocity. */
  mode?: 'tumble' | 'face' | 'stretch';
  size?: [number, number];
  /** Width / height of each quad. */
  aspect?: number;
  gravity?: V3;
  /** Linear air drag; higher = floatier. */
  drag?: number;
  life?: [number, number];
  colors?: string[];
  /** How much the sprite is multiplied by its colour: 0 = sprite colours, 1 = fully tinted. */
  tint?: number;
  blend?: 'normal' | 'additive';
  /** Brightness multiplier (values > 1 bloom). */
  intensity?: number;
  /** Use PBR lighting (normal blend only). */
  lit?: boolean;
  spin?: number;
  /** Side-to-side meander amplitude, e.g. for bubbles and snow. */
  wobble?: number;
  /** stretch mode: extra length per unit of speed. */
  stretch?: number;
  /** Ambient mode: particles respawn forever instead of bursting once. */
  loop?: boolean;
  /** Randomly mirror the effect on X each time it fires (default true). */
  mirror?: boolean;
  /** face mode: keep sprites level and turned toward their direction of travel (sprites face +X), for creatures and craft. */
  upright?: boolean;
  /** Affected by scene fog (default true); turn off for things far away in the sky. */
  fog?: boolean;
}


/**
 * Zero-CPU particles: every trajectory is a closed-form function of time
 * evaluated in the vertex shader (ballistic motion with linear drag, wobble,
 * tumbling or velocity-aligned stretching). Firing a burst writes one uniform.
 */
export class Particles {
  readonly object: THREE.InstancedMesh;
  private uTime = uniform(0);
  private uStart = uniform(-1e4);
  private uMirror = uniform(1);
  private maxLife: number;
  private opts: ParticleOptions;

  constructor(opts: ParticleOptions) {
    this.opts = opts;
    const {
      count,
      emitters,
      atlas,
      mode = 'tumble',
      size = [0.12, 0.2],
      aspect = 1,
      gravity = [0, -6, 0],
      drag = 1.2,
      life = [3, 4.5],
      colors = ['#ffffff'],
      tint = 1,
      blend = 'normal',
      intensity = 1,
      lit = blend === 'normal',
      spin = 6,
      wobble = 0,
      stretch = 0.15,
      loop = false,
    } = opts;
    const cells = opts.cells ?? Array.from({ length: atlas.count }, (_, i) => i);

    // One interleaved instance buffer (WebGPU allows only 8 vertex buffers per pipeline):
    // [origin.xyz, delay] [vel.xyz, life] [spinAxis.xyz, cell + phase] [color.rgb, size]
    const STRIDE = 16;
    const data = new Float32Array(count * STRIDE);
    const c = new THREE.Color();
    const v = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion();

    const weights = emitters.map((e) => e.weight ?? 1);
    const wsum = weights.reduce((s, w) => s + w, 0);
    this.maxLife = 0;

    for (let i = 0; i < count; i++) {
      // pick an emitter proportionally to its weight
      let pick = Math.random() * wsum;
      let e = emitters[0];
      for (let k = 0; k < emitters.length; k++) {
        pick -= weights[k];
        if (pick <= 0) {
          e = emitters[k];
          break;
        }
      }
      const box = e.box ?? [0, 0, 0];
      const o = i * STRIDE;
      data.set([e.at[0] + rand(-1, 1) * box[0], e.at[1] + rand(-1, 1) * box[1], e.at[2] + rand(-1, 1) * box[2]], o);

      // uniform direction inside a cone around e.dir
      const maxAngle = Math.min(Math.PI, ((e.spread ?? 0.4) * Math.PI) / 2);
      const cosT = rand(Math.cos(maxAngle), 1);
      const sinT = Math.sqrt(1 - cosT * cosT);
      const phi = Math.random() * Math.PI * 2;
      v.set(Math.cos(phi) * sinT, cosT, Math.sin(phi) * sinT);
      q.setFromUnitVectors(up, new THREE.Vector3(...(e.dir ?? [0, 1, 0])).normalize());
      v.applyQuaternion(q).multiplyScalar(rand(...(e.speed ?? [4, 8])));
      data.set([v.x, v.y, v.z], o + 4);

      const lifeI = rand(...life);
      const delay = loop ? Math.random() * lifeI : rand(...(e.delay ?? [0, 0.1]));
      this.maxLife = Math.max(this.maxLife, lifeI + (loop ? 0 : delay));
      data[o + 3] = delay;
      data[o + 7] = lifeI;

      const axis = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(0.4, 1) * spin);
      data.set([axis.x, axis.y, axis.z, cells[Math.floor(Math.random() * cells.length)] + Math.random() * 0.999], o + 8);

      c.set(colors[Math.floor(Math.random() * colors.length)]).offsetHSL(0, 0, rand(-0.06, 0.06));
      data.set([c.r, c.g, c.b, rand(...size)], o + 12);
    }

    const buffer = new THREE.InstancedInterleavedBuffer(data, STRIDE);
    const slot = (offset: number): any => instancedBufferAttribute(buffer as any, 'vec4', STRIDE, offset);
    const s0 = slot(0);
    const s1 = slot(4);
    const s2 = slot(8);
    const s3 = slot(12);
    const aOrigin = s0.xyz;
    const aVel = s1.xyz;
    const aCol = s3.xyz;
    const aSize = s3.w;
    const aCell = floor(s2.w);
    const aPhase = fract(s2.w);
    const aAxis = s2.xyz;

    // ---- motion
    const delay = s0.w;
    const lifeN = s1.w;
    const t = loop ? mod(this.uTime.add(delay), lifeN) : this.uTime.sub(this.uStart).sub(delay);
    const alive = loop ? float(1) : step(0, t).mul(step(t, lifeN));
    const tc = max(t, 0);
    const d = Math.max(drag, 0.05);
    const g = vec3(...gravity);
    const mirror = vec3(this.uMirror, 1, 1);
    const decay = float(1).sub(exp(tc.mul(-d))).div(d);
    let pos: any = aOrigin.mul(mirror).add(aVel.mul(mirror).mul(decay)).add(g.mul(tc.sub(decay).div(d)));
    const phase = aPhase.mul(Math.PI * 2);
    if (wobble > 0) {
      pos = pos.add(vec3(sin(tc.mul(2.7).add(phase)), 0, cos(tc.mul(2.1).add(phase))).mul(wobble));
    }

    const lifeP = tc.div(lifeN);
    const scale = aSize.mul(min(tc.mul(14), 1)).mul(float(1).sub(smoothstep(0.72, 1, lifeP))).mul(alive);
    let quad: any = (vec3 as any)(positionLocal.xy.mul(scale), 0);

    if (mode === 'tumble') {
      quad = rotate(quad, aAxis.mul(tc).add(phase) as any);
    } else if (mode === 'face' && opts.upright) {
      // no roll; mirror horizontally when travelling toward -X
      const facing = aVel.x.mul(this.uMirror).lessThan(0).select(float(-1), float(1));
      quad = vec3(quad.x.mul(facing), quad.y, 0);
    } else if (mode === 'face') {
      quad = rotate(quad, (vec3 as any)(0, 0, phase.add(tc.mul(aAxis.z))));
    } else {
      const vt = aVel.mul(mirror).mul(exp(tc.mul(-d))).add(g.mul(float(1).sub(exp(tc.mul(-d))).div(d)));
      const speed = length(vt.xy);
      // long axis = x (along velocity), thin on y
      quad = vec3(quad.x.mul(speed.mul(stretch).add(1)), quad.y.mul(0.3), 0);
      quad = rotate(quad, vec3(0, 0, atan(vt.y, vt.x)));
    }

    // ---- look
    const grid = atlas.grid;
    const cell = aCell;
    const cx = mod(cell, grid);
    const cy = floor(cell.div(grid));
    const cellUV = vec2(cx.add(uv().x), float(grid - 1).sub(cy).add(uv().y)).div(grid);
    const tex = texture(atlas.texture, cellUV);
    const rgb = mix(tex.rgb, tex.rgb.mul(aCol), tint);

    let mat: THREE.NodeMaterial;
    if (blend === 'additive') {
      const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const fade = float(1).sub(smoothstep(0.6, 1, lifeP));
      m.colorNode = rgb.mul(tex.a).mul(fade).mul(intensity);
      mat = m;
    } else if (lit) {
      const m = new THREE.MeshStandardNodeMaterial({ metalness: 0.3, roughness: 0.45, alphaTest: 0.4 });
      m.colorNode = rgb;
      m.opacityNode = tex.a;
      m.emissiveNode = rgb.mul(0.45 * intensity);
      mat = m;
    } else {
      const m = new THREE.MeshBasicNodeMaterial({ alphaTest: 0.4 });
      m.colorNode = rgb.mul(intensity);
      m.opacityNode = tex.a;
      mat = m;
    }
    mat.side = THREE.DoubleSide;
    mat.fog = opts.fog ?? true;
    mat.positionNode = quad.add(pos);

    this.object = new THREE.InstancedMesh(new THREE.PlaneGeometry(aspect, 1), mat, count);
    this.object.frustumCulled = false;
    const identity = new THREE.Matrix4();
    for (let i = 0; i < count; i++) this.object.setMatrixAt(i, identity);
    if (blend === 'additive') this.object.renderOrder = 2;
  }

  fire() {
    this.uStart.value = this.uTime.value;
    if (this.opts.mirror !== false) this.uMirror.value = Math.random() < 0.5 ? -1 : 1;
  }

  /** Seconds a single burst lasts. */
  get duration() {
    return this.maxLife;
  }

  update(time: number) {
    this.uTime.value = time;
  }

  dispose() {
    this.object.geometry.dispose();
    (this.object.material as THREE.Material).dispose();
    this.object.dispose();
  }
}
