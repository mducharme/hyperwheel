import * as THREE from 'three/webgpu';
import {
  abs,
  atan,
  attribute,
  cos,
  dot,
  float,
  floor,
  fract,
  hash,
  instancedBufferAttribute,
  instanceIndex,
  length,
  max,
  mix,
  mx_noise_float,
  normalLocal,
  normalView,
  positionGeometry,
  positionLocal,
  positionViewDirection,
  positionWorld,
  pow,
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
import { prefersDarkText, segmentColor } from './colors';
import { iridescent } from '../fx/nodes';
import { uCalm } from '../engine/globals';

export const WHEEL_RADIUS = 3;
const R = WHEEL_RADIUS;
const HUB_R = 0.62;
const DEPTH = 0.3;
const TEXT_SIZE = 2048;
const RIM_R = R + 0.1;
const LED_R = R + 0.48;
const LED_COUNT = 56;
export const PEG_R = R - 0.06;

/** Everything a theme can restyle on the wheel. Colors are hex strings. */
export interface WheelStyle {
  palette: string[];
  /** CSS font-family for the names, e.g. '"Fredoka"' (scenes take it from their meta font). */
  font: string;
  fontWeight?: number;
  /** Two-tone rim gradient… */
  rim: [string, string];
  /** …blended with an animated holographic sheen, 0..1. */
  holo: number;
  flapper: string;
  /** Marquee bulbs alternate between these. */
  leds: [string, string];
  hub: [string, string];
  pegs: string;
  /** Backing plate / marquee frame. */
  frame: string;
  /** Ship's helm: turned wooden handles around a wooden rim, and no marquee bulbs. */
  helm?: { handles: number; wood: string };
  /** Racing tyre instead of the chrome rim: lettering on the sidewall, a coloured compound band, no marquee bulbs. */
  tire?: { text: string; color: string };
  /** A pine wreath with berries instead of the chrome rim. */
  wreath?: { berries: string };
  /** Chunky multicoloured string lights instead of the marquee bulbs. */
  stringLights?: string[];
  /** Pins on the wheel face: metal pins (default) or Christmas baubles. */
  pins?: 'baubles' | 'skulls' | 'gumdrops' | 'pearls' | 'stars' | 'pebbles' | 'cubes';
  /** The pointer: the glossy teardrop (default) or an icicle. */
  pointer?: 'icicle' | 'scythe' | 'candycane' | 'anchor' | 'comet' | 'horseshoe' | 'leaf' | 'ankh' | 'balloon' | 'bolt' | 'pixel' | 'cutter';
  /** A frosted donut instead of the chrome rim. */
  donut?: { frosting: string; sprinkles: string[] };
  /** Rivets or bolts around the rim, in this colour (brass for a porthole, iron for a wagon wheel). */
  rivets?: string;
  /** Glowing bubbles instead of the marquee bulbs. */
  bubbles?: boolean;
  /** The rim as a ring of swirling plasma (hot and cool colours) instead of chrome. */
  plasmaRim?: { hot: string; cool: string };
  /** The rim as a glowing neon tube, fading between two colours, instead of chrome. */
  neonRim?: { a: string; b: string };
  /** Electric arcs crackling around the rim, in this colour. */
  arcs?: string;
  /** A rim of voxel cubes in these colours instead of chrome. */
  voxelRim?: string[];
  /** A golden pizza crust instead of the chrome rim, with toppings along the slice seams. */
  pizza?: boolean;
  /** Flickering candles instead of the marquee bulbs. */
  candles?: boolean;
  /** A matte finish instead of chrome: plain wood, or twisted dark wood. */
  rimFinish?: 'wood' | 'gnarled' | 'bamboo';
}

/** Name color on light segments. */
const DARK_TEXT = '#16052a';

const col = (hex = '#ffffff') => uniform(new THREE.Color(hex));

export class Wheel {
  readonly root = new THREE.Group();
  /** Rotates with the spin. */
  readonly spinner = new THREE.Group();
  /** The pivoting pointer at 12 o'clock. */
  readonly flapper = new THREE.Group();

  readonly uActive = uniform(0);
  readonly uSpeed = uniform(0);
  readonly uWin = uniform(0);
  readonly uChase = uniform(0);
  /** 0..1: idle "attract mode" light show on the marquee bulbs. */
  readonly uAttract = uniform(0);

  private readonly uRimA = col();
  private readonly uRimB = col();
  private readonly uHolo = uniform(1);
  private readonly uFlapper = col();
  private readonly uLedA = col();
  private readonly uLedB = col();
  private readonly uHubA = col();
  private readonly uHubB = col();
  private readonly uPegs = col();
  private readonly uFrame = col();

  frontZ = 0;
  private style!: WheelStyle;
  private names: string[] = [];
  private wedges: THREE.Mesh;
  private pegs: THREE.InstancedMesh | null = null;
  private pegGeo = new THREE.CylinderGeometry(0.045, 0.055, 0.26, 12).rotateX(Math.PI / 2);
  private pegMat: THREE.MeshStandardNodeMaterial;
  /** Christmas-bauble pins: a shiny ball with a little gold cap (colour per instance). */
  private baubleGeo = mergeGeometries([new THREE.SphereGeometry(0.08, 16, 12), new THREE.CylinderGeometry(0.025, 0.025, 0.05, 8).rotateX(Math.PI / 2).translate(0, 0, 0.085)])!;
  private baubleMat = new THREE.MeshStandardNodeMaterial({ metalness: 0.55, roughness: 0.12 });
  /** Little skull pins: a cranium and a jaw, eye sockets and nose painted in by the material. */
  private skullGeo = mergeGeometries([new THREE.SphereGeometry(0.085, 16, 12).scale(1, 0.95, 0.85), new THREE.BoxGeometry(0.1, 0.06, 0.1).translate(0, -0.075, 0.005)])!.scale(1.3, 1.3, 1.3);
  private skullMat = (() => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.55 });
    const p = positionGeometry.div(1.3); // the face was drawn for the unscaled skull
    const eye = (x: number) => smoothstep(0.024, 0.016, length(vec2(p.x.sub(x), p.y.sub(0.002))));
    const front = smoothstep(0.03, 0.06, p.z);
    const nose = smoothstep(0.014, 0.008, length(vec2(p.x, p.y.add(0.035))));
    const teeth = step(0.5, fract(p.x.mul(60))).mul(smoothstep(-0.07, -0.062, p.y)).mul(smoothstep(-0.05, -0.058, p.y));
    const dark = eye(-0.03).max(eye(0.03)).max(nose).mul(front).max(teeth.mul(0.6));
    m.colorNode = mix(vec3(0.86, 0.82, 0.7), vec3(0.05, 0.03, 0.05), dark);
    return m;
  })();
  /** Sugar-dusted gumdrop pins (colour per instance). */
  private gumdropGeo = new THREE.SphereGeometry(0.12, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.15, 1).rotateX(Math.PI / 2);
  private gumdropMat = (() => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.7 });
    m.emissiveNode = vec3(step(0.96, hash(floor(positionGeometry.mul(90)).dot(vec3(1, 57, 113)))).mul(0.6)); // sugar glints
    return m;
  })();
  /** Lustrous pearl pins. */
  private pearlGeo = new THREE.SphereGeometry(0.075, 18, 12);
  private pearlMat = (() => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.18, metalness: 0.15 });
    const fres = pow(float(1).sub(abs(dot(normalView, positionViewDirection))), 2.0);
    m.colorNode = vec3(0.93, 0.91, 0.88).add(iridescent(fres.mul(1.5)).mul(0.18));
    return m;
  })();
  /** Smooth, flat river pebbles (colour per instance). */
  private pebbleGeo = new THREE.SphereGeometry(0.09, 14, 10).scale(1, 0.72, 0.5);
  private pebbleMat = (() => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.55 });
    m.colorNode = vec3(mx_noise_float(positionGeometry.mul(40)).mul(0.08).add(0.95)); // faint speckle, times the instance colour
    return m;
  })();
  /** Little voxel cubes (colour per instance). */
  private cubeGeo = new THREE.BoxGeometry(0.13, 0.13, 0.13);
  private cubeMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.6, flatShading: true });
  /** Little glowing star pins. */
  private starGeo = new THREE.OctahedronGeometry(0.075, 0).scale(1, 1, 0.45);
  private starMat = (() => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.3 });
    m.colorNode = vec3(1, 0.93, 0.75);
    m.emissiveNode = vec3(1, 0.85, 0.55).mul(sin(time.mul(3).add(positionWorld.x.mul(5))).mul(0.4).add(1.2));
    return m;
  })();
  /** Pin shapes: geometry, material, height off the face, per-pin colours, upright toward the rim. */
  private get pinKinds(): Record<string, { geo: THREE.BufferGeometry; mat: THREE.Material; z: number; colors?: string[]; upright?: boolean }> {
    return {
      pins: { geo: this.pegGeo, mat: this.pegMat, z: 0.11 },
      baubles: { geo: this.baubleGeo, mat: this.baubleMat, z: 0.09, colors: ['#d62839', '#f2c230', '#dfe6ee'] },
      skulls: { geo: this.skullGeo, mat: this.skullMat, z: 0.07, upright: true },
      gumdrops: { geo: this.gumdropGeo, mat: this.gumdropMat, z: 0.02, colors: ['#ff5d8f', '#5ee6c8', '#ffd166', '#b388ff', '#ff9e5e'] },
      pearls: { geo: this.pearlGeo, mat: this.pearlMat, z: 0.07 },
      stars: { geo: this.starGeo, mat: this.starMat, z: 0.07 },
      pebbles: { geo: this.pebbleGeo, mat: this.pebbleMat, z: 0.05, colors: ['#8d8a84', '#a69c8c', '#6f6b66', '#b8b0a2', '#7c746a'] },
      cubes: { geo: this.cubeGeo, mat: this.cubeMat, z: 0.07, colors: ['#ff4d4d', '#ffd23f', '#3ddc84', '#3fa9ff', '#c86bff'], upright: true },
    };
  }
  private textCanvas = document.createElement('canvas');
  /** Marquee bulbs and their frame (hidden for a helm). */
  private marquee = new THREE.Group();
  private rimMat!: THREE.MeshStandardNodeMaterial;
  private helm: THREE.Mesh | null = null;
  private chromeRim!: THREE.Mesh;
  private tire: THREE.Mesh | null = null;
  private tireKey = '';
  private wreath: THREE.Group | null = null;
  private lights: THREE.Group | null = null;
  private lightsKey = '';
  private flapperDefault: THREE.Object3D[] = [];
  /** Special pointer shapes, built on first use. */
  private pointers = new Map<string, THREE.Object3D>();
  private candles: THREE.Group | null = null;
  /** Optional decorations by slot, with the key they were built for. */
  private decorations = new Map<string, { key: string; object: THREE.Object3D }>();
  private helmKey = '';
  private readonly uWood = col();
  private readonly uTireColor = col();
  private readonly uBerry = col();
  private readonly uGnarl = uniform(0);
  private readonly uBamboo = uniform(0);
  /** Base brightness of the rim: high for chrome, low for wood. */
  private readonly uRimLift = uniform(0.35);
  private textTex: THREE.CanvasTexture;

  constructor() {
    this.root.add(this.spinner);

    this.textCanvas.width = this.textCanvas.height = TEXT_SIZE;
    this.textTex = new THREE.CanvasTexture(this.textCanvas);
    this.textTex.colorSpace = THREE.SRGBColorSpace;
    this.textTex.anisotropy = 8;

    this.wedges = new THREE.Mesh(new THREE.BufferGeometry(), this.makeWedgeMaterial());
    this.spinner.add(this.wedges);

    this.pegMat = new THREE.MeshStandardNodeMaterial({ metalness: 1, roughness: 0.18 });
    this.pegMat.colorNode = this.uPegs;
    this.pegMat.emissiveNode = this.uPegs.mul(this.uSpeed.mul(0.04).add(0.08));

    this.buildRim();
    this.buildHub();
    this.buildLeds();
    this.buildFlapper();
    this.root.add(this.marquee);
  }

  setStyle(style: WheelStyle) {
    this.style = style;
    this.uRimA.value.set(style.rim[0]);
    this.uRimB.value.set(style.rim[1]);
    this.uHolo.value = style.holo;
    this.uFlapper.value.set(style.flapper);
    this.uLedA.value.set(style.leds[0]);
    this.uLedB.value.set(style.leds[1]);
    this.uHubA.value.set(style.hub[0]);
    this.uHubB.value.set(style.hub[1]);
    this.uPegs.value.set(style.pegs);
    this.uFrame.value.set(style.frame);
    this.applyHelm(style.helm);
    this.applyTire(style.tire);
    this.applyWreath(style.wreath);
    this.applyStringLights(style.stringLights);
    this.applyPointer(style.pointer);
    this.applyCandles(!!style.candles);
    this.decorate('donut', style.donut && JSON.stringify(style.donut), () => this.makeDonut(style.donut!), this.spinner);
    this.decorate('rivets', style.rivets, () => this.makeRivets(style.rivets!), this.spinner);
    this.decorate('bubbles', style.bubbles ? 'on' : undefined, () => this.makeBubbles(), this.root);
    this.decorate('plasmaRim', style.plasmaRim && JSON.stringify(style.plasmaRim), () => this.makePlasmaRim(style.plasmaRim!), this.spinner);
    this.decorate('neonRim', style.neonRim && JSON.stringify(style.neonRim), () => this.makeNeonRim(style.neonRim!), this.spinner);
    this.decorate('arcs', style.arcs, () => this.makeArcs(style.arcs!), this.root);
    this.decorate('voxelRim', style.voxelRim?.join(), () => this.makeVoxelRim(style.voxelRim!), this.spinner);
    this.decorate('crust', style.pizza ? 'on' : undefined, () => this.makeCrust(), this.spinner);
    this.applyRimFinish(style.rimFinish);
    this.chromeRim.visible = !style.tire && !style.wreath && !style.donut && !style.plasmaRim && !style.neonRim && !style.voxelRim && !style.pizza;
    this.marquee.visible = !style.helm && !style.tire && !style.stringLights && !style.candles && !style.bubbles;
    this.setEntries(this.names);
  }

  // ---------------------------------------------------------------- wedges

  private makeWedgeMaterial() {
    const mat = new THREE.MeshPhysicalNodeMaterial({
      metalness: 0.05,
      clearcoat: 0.8,
      clearcoatRoughness: 0.06,
      iridescence: 0.15,
      iridescenceIOR: 1.6,
    });

    const base = attribute('color', 'vec3');
    const seg = attribute('segIndex', 'float');

    // Names are painted into one big canvas and projected straight onto the
    // front faces using local XY — no UV unwrapping, no z-fighting decal.
    const textUV = positionLocal.xy.div(R * 2).add(0.5);
    const txt = texture(this.textTex, textUV);
    const front = smoothstep(0.86, 0.98, normalLocal.z);
    const ink = txt.a.mul(front);
    mat.colorNode = mix(base, txt.rgb, ink);

    // metallic-flake sparkle in the paint
    const flake = mx_noise_float(positionLocal.mul(55));
    mat.roughnessNode = flake.mul(0.12).add(0.3);

    // radial sheen sweep that races around the wheel while it spins
    const ang = atan(positionLocal.y, positionLocal.x);
    const sweep = pow(sin(ang.mul(3).sub(time.mul(2))).mul(0.5).add(0.5), 12).mul(this.uSpeed.mul(0.03).min(0.5));

    const isActive = float(1).sub(step(0.5, abs(seg.sub(this.uActive))));
    const pulse = sin(time.mul(10)).mul(0.5).add(0.5);
    const activeGlow = isActive.mul(pulse.mul(0.25).add(0.25).add(this.uWin.mul(1.6)));
    mat.emissiveNode = base.mul(activeGlow.add(sweep).add(0.03)).mul(float(1).sub(ink));
    return mat;
  }

  /** Rebuild wedge geometry, text texture and pegs for a new entry list. */
  setEntries(names: string[]) {
    this.names = names;
    if (!this.style) return;
    const palette = this.style.palette;
    const n = Math.max(1, names.length);
    const seg = (Math.PI * 2) / n;
    const color = new THREE.Color();

    // keep bevels from self-intersecting on very thin slices near the hub
    const bevel = Math.min(0.045, HUB_R * seg * 0.25);
    const gap = Math.min(0.012, seg * 0.04);
    const curve = Math.max(2, Math.ceil(320 / n));

    const parts: THREE.BufferGeometry[] = [];
    const finish = (g: THREE.BufferGeometry, hex: string, index: number) => {
      g.deleteAttribute('uv');
      const count = g.getAttribute('position').count;
      color.set(hex);
      const colors = new Float32Array(count * 3);
      for (let v = 0; v < count; v++) color.toArray(colors, v * 3);
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      g.setAttribute('segIndex', new THREE.BufferAttribute(new Float32Array(count).fill(index), 1));
      parts.push(g);
    };

    if (names.length === 0) {
      const g = new THREE.CylinderGeometry(R - 0.02, R - 0.02, DEPTH, 128).rotateX(Math.PI / 2).translate(0, 0, DEPTH / 2);
      finish(g, this.style.frame, -10);
    } else {
      for (let i = 0; i < n; i++) {
        const a0 = i * seg + gap;
        const a1 = (i + 1) * seg - gap;
        const shape = new THREE.Shape();
        shape.absarc(0, 0, R - 0.02, a0, a1, false);
        shape.absarc(0, 0, HUB_R - 0.1, a1, a0, true);
        shape.closePath();
        const g = new THREE.ExtrudeGeometry(shape, {
          depth: DEPTH,
          curveSegments: curve,
          bevelEnabled: n > 1,
          bevelThickness: bevel,
          bevelSize: bevel,
          bevelSegments: 3,
        });
        finish(g, segmentColor(palette, i, n), i);
      }
    }

    const merged = mergeGeometries(parts, false)!;
    parts.forEach((p) => p.dispose());
    merged.translate(0, 0, -DEPTH / 2);
    this.wedges.geometry.dispose();
    this.wedges.geometry = merged;
    this.frontZ = DEPTH / 2 + bevel;

    this.drawText(names);
    this.buildPegs(names.length);
    // pizza toppings sit on the slice seams, so they follow the number of slices
    this.decorate('toppings', this.style?.pizza && names.length <= 16 ? String(names.length) : undefined, () => this.makeToppings(names.length), this.spinner);
  }

  private drawText(names: string[]) {
    const ctx = this.textCanvas.getContext('2d')!;
    const S = TEXT_SIZE;
    const c = S / 2;
    const px = c / R; // canvas pixels per world unit
    const font = (size: number) => `${this.style.fontWeight ?? 700} ${size}px ${this.style.font}, sans-serif`;
    ctx.clearRect(0, 0, S, S);

    if (names.length === 0) {
      ctx.save();
      ctx.translate(c, c);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = font(S * 0.045);
      ctx.fillText('Add some names →', 0, -S * 0.22);
      ctx.restore();
      this.textTex.needsUpdate = true;
      return;
    }

    const palette = this.style.palette;
    const n = names.length;
    const seg = (Math.PI * 2) / n;
    const outer = (R - 0.32) * px;
    const inner = (HUB_R + 0.35) * px;
    const maxW = outer - inner;
    const midR = (outer + inner) * 0.62;
    const maxFont = Math.min(S * 0.07, seg * midR * 0.72);

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      const hex = segmentColor(palette, i, n);
      const dark = prefersDarkText(hex, DARK_TEXT);
      let label = names[i];
      let size = maxFont;
      ctx.font = font(size);
      let w = ctx.measureText(label).width;
      if (w > maxW) {
        size = Math.max(maxFont * 0.45, (size * maxW) / w);
        ctx.font = font(size);
        w = ctx.measureText(label).width;
        while (w > maxW && label.length > 1) {
          label = label.slice(0, -1);
          w = ctx.measureText(label + '…').width;
        }
        if (label !== names[i]) label += '…';
      }

      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(-(i + 0.5) * seg); // canvas Y is flipped vs world Y
      ctx.shadowColor = dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = size * 0.12;
      ctx.fillStyle = dark ? DARK_TEXT : '#ffffff';
      ctx.fillText(label, outer, size * 0.04);
      ctx.restore();
    }
    this.textTex.needsUpdate = true;
  }

  private buildPegs(count: number) {
    if (this.pegs) {
      this.spinner.remove(this.pegs);
      this.pegs.dispose();
      this.pegs = null;
    }
    if (count < 2) return;
    // Too many pegs turn into a picket fence; thin them out.
    const stride = Math.ceil(count / 90);
    const total = Math.floor(count / stride);
    const kind = this.pinKinds[this.style?.pins ?? 'pins'];
    const mesh = new THREE.InstancedMesh(kind.geo, kind.mat, total);
    const m = new THREE.Matrix4();
    const seg = (Math.PI * 2) / count;
    const shades = kind.colors?.map((c) => new THREE.Color(c));
    for (let j = 0; j < total; j++) {
      const a = j * stride * seg;
      m.makeTranslation(Math.cos(a) * PEG_R, Math.sin(a) * PEG_R, this.frontZ + kind.z);
      // shaped pins stand upright relative to the rim, top outward
      if (kind.upright) m.multiply(new THREE.Matrix4().makeRotationZ(a - Math.PI / 2));
      mesh.setMatrixAt(j, m);
      if (shades) mesh.setColorAt(j, shades[j % shades.length]);
    }
    this.pegs = mesh;
    this.spinner.add(mesh);
  }

  /** Angular spacing of the pegs (0 when there are none). */
  get pegSpacing() {
    const n = this.names.length;
    if (n < 2) return 0;
    return Math.ceil(n / 90) * ((Math.PI * 2) / n);
  }

  // ---------------------------------------------------------------- decor

  private buildRim() {
    const mat = (this.rimMat = new THREE.MeshStandardNodeMaterial({ metalness: 0.95, roughness: 0.16 }));
    const fres = pow(float(1).sub(abs(dot(normalView, positionViewDirection))), 2.0);
    const ang = atan(positionLocal.y, positionLocal.x).div(Math.PI * 2);
    const holo = iridescent(ang.mul(2).add(time.mul(0.12)).add(fres.mul(0.6)));
    const twoTone = mix(this.uRimA, this.uRimB, sin(ang.mul(Math.PI * 8).add(time)).mul(0.5).add(0.5));
    const rimCol = mix(twoTone, holo, this.uHolo);
    // gnarled finish: knotty bumps pushed out along the normal, darker in the grooves
    const knots = mx_noise_float(positionLocal.mul(vec3(3.2, 3.2, 9))).mul(0.5).add(0.5);
    // bamboo finish: a node (a darker, slightly swollen joint) every few degrees around the ring
    const seg = fract(ang.mul(28));
    const joint = smoothstep(0.06, 0.0, seg.min(float(1).sub(seg)));
    mat.positionNode = positionLocal.add(normalLocal.mul(knots.sub(0.5).mul(0.11).mul(this.uGnarl).add(joint.mul(0.035).mul(this.uBamboo))));
    mat.colorNode = rimCol
      .mul(float(0.9).sub(this.uRimLift))
      .add(this.uRimLift)
      .mul(mix(float(1), knots.mul(0.6).add(0.55), this.uGnarl))
      .mul(mix(float(1), float(0.55), joint.mul(this.uBamboo)));
    mat.emissiveNode = rimCol.mul(fres.mul(0.9).add(this.uSpeed.mul(0.02)).add(this.uWin.mul(0.8)));
    this.chromeRim = new THREE.Mesh(new THREE.TorusGeometry(RIM_R, 0.15, 32, 256), mat);
    this.spinner.add(this.chromeRim);

    // dark backing plate so the wheel reads as a solid object from oblique angles
    const backMat = new THREE.MeshStandardNodeMaterial({ metalness: 0.6, roughness: 0.4 });
    backMat.colorNode = this.uFrame;
    const back = new THREE.Mesh(new THREE.CylinderGeometry(RIM_R, RIM_R, 0.08, 128).rotateX(Math.PI / 2), backMat);
    back.position.z = -DEPTH / 2 - 0.08;
    this.spinner.add(back);
  }

  private buildHub() {
    const chrome = new THREE.MeshStandardNodeMaterial({ color: '#ffffff', metalness: 1, roughness: 0.08 });
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(HUB_R - 0.02, HUB_R + 0.06, 0.42, 64).rotateX(Math.PI / 2), chrome);
    hub.position.z = 0.18;
    this.spinner.add(hub);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(HUB_R - 0.02, 0.05, 16, 96), chrome);
    ring.position.z = 0.39;
    this.spinner.add(ring);

    // animated vortex on the hub face
    const faceMat = new THREE.MeshStandardNodeMaterial({ metalness: 0.3, roughness: 0.25 });
    const p = uv().sub(0.5);
    const r = length(p);
    const a = atan(p.y, p.x);
    const swirl = sin(a.mul(5).add(r.mul(26)).sub(time.mul(3)).sub(this.uChase.mul(2))).mul(0.5).add(0.5);
    const tint = mix(this.uHubA, this.uHubB, swirl);
    const hubCol = mix(tint, iridescent(r.mul(1.6).sub(time.mul(0.25))), 0.25);
    faceMat.colorNode = hubCol.mul(0.2);
    faceMat.emissiveNode = hubCol
      .mul(swirl.mul(0.9).add(0.25).add(this.uWin.mul(1.5)))
      .mul(float(1.15).sub(smoothstep(0.36, 0.5, r)));
    const face = new THREE.Mesh(new THREE.CircleGeometry(HUB_R - 0.06, 64), faceMat);
    face.position.z = 0.395;
    this.spinner.add(face);
  }

  /**
   * How bright a bulb at `phase` (0..1 around the ring) is right now: chasing
   * with the spin, an attract-mode light show while idle, a strobe on a win.
   * `alt` (0/1) splits the ring into alternating bulbs.
   */
  private bulbBrightness(phase: any, alt: any) {
    const chase = fract(phase.mul(8).sub(this.uChase));
    const lit = smoothstep(0.55, 1, chase);
    const strobe = step(0.5, fract(time.mul(6))).mul(this.uWin);
    // attract mode: two lights circling opposite ways, alternating with a marquee blink
    const comets = max(pow(fract(phase.sub(time.mul(0.36))), 16), pow(fract(phase.negate().sub(time.mul(0.36)).add(0.5)), 16));
    const blink = mix(alt, float(1).sub(alt), step(0.5, fract(time.mul(1.1)))).mul(0.8);
    const show = mix(comets, blink, smoothstep(-0.3, 0.3, sin(time.mul(0.45))));
    return max(mix(lit, show, this.uAttract).mul(3.2).add(0.15), strobe.mul(5));
  }

  private buildLeds() {
    // static marquee ring with chasing bulbs, carnival style
    const frameMat = new THREE.MeshStandardNodeMaterial({ metalness: 0.9, roughness: 0.3 });
    frameMat.colorNode = this.uFrame.mul(1.6);
    const frame = new THREE.Mesh(new THREE.TorusGeometry(LED_R, 0.09, 20, 256), frameMat);
    frame.position.z = -0.05;
    this.marquee.add(frame);

    const phases = new Float32Array(LED_COUNT);
    for (let i = 0; i < LED_COUNT; i++) phases[i] = i / LED_COUNT;
    const phase: any = instancedBufferAttribute(new THREE.InstancedBufferAttribute(phases, 1), 'float');

    const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.2, metalness: 0 });
    const alt = step(0.5, fract(phase.mul(LED_COUNT / 2)));
    const bulb = mix(this.uLedA, this.uLedB, alt);
    const bright = this.bulbBrightness(phase, alt);
    mat.colorNode = bulb.mul(0.3);
    mat.emissiveNode = mix(bulb, vec3(1, 0.95, 0.85), this.uWin.mul(0.5)).mul(bright);

    const leds = new THREE.InstancedMesh(new THREE.SphereGeometry(0.085, 16, 12), mat, LED_COUNT);
    const m = new THREE.Matrix4();
    for (let i = 0; i < LED_COUNT; i++) {
      const a = (i / LED_COUNT) * Math.PI * 2;
      m.makeTranslation(Math.cos(a) * LED_R, Math.sin(a) * LED_R, 0.06);
      leds.setMatrixAt(i, m);
    }
    this.marquee.add(leds);
  }

  /** A pine wreath around the slices instead of the chrome rim (it turns with the wheel). */
  private applyWreath(wreath: WheelStyle['wreath']) {
    if (!!wreath === !!this.wreath) {
      if (wreath) this.uBerry.value.set(wreath.berries);
      return;
    }
    if (this.wreath) {
      this.spinner.remove(this.wreath);
      this.wreath.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry.dispose();
          (mesh.material as THREE.Material).dispose();
        }
      });
      this.wreath = null;
    }
    if (!wreath) return;
    this.uBerry.value.set(wreath.berries);
    const g = new THREE.Group();
    const ringR = RIM_R + 0.06;
    const tube = 0.23;
    const base = new THREE.Mesh(new THREE.TorusGeometry(ringR, tube, 16, 200), new THREE.MeshStandardNodeMaterial({ color: '#173d24', roughness: 0.9 }));
    g.add(base);

    // needle tufts sticking out of the garland, frosted at the tips
    const tufts = 2000;
    const needleMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, flatShading: true });
    const tip = smoothstep(0.02, 0.15, positionGeometry.y);
    const shade = hash(instanceIndex).mul(0.35).add(0.75);
    needleMat.colorNode = mix(vec3(0.07, 0.25, 0.13).mul(shade), vec3(0.86, 0.93, 0.97), tip.mul(0.75));
    const needles = new THREE.InstancedMesh(new THREE.ConeGeometry(0.055, 0.36, 5), needleMat, tufts);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (let i = 0; i < tufts; i++) {
      const a = Math.random() * Math.PI * 2;
      // around the tube: the front and the outer edge (not the inner edge, so none poke over the names)
      const v = -Math.PI * 0.35 + Math.random() * Math.PI * 0.95;
      n.set(Math.cos(v) * Math.cos(a), Math.cos(v) * Math.sin(a), Math.sin(v));
      p.set(Math.cos(a) * ringR, Math.sin(a) * ringR, 0).addScaledVector(n, tube * 0.75);
      n.x += (Math.random() - 0.5) * 1.1;
      n.y += (Math.random() - 0.5) * 1.1;
      n.z += (Math.random() - 0.5) * 0.8;
      q.setFromUnitVectors(up, n.normalize());
      const s = 0.8 + Math.random() * 0.7;
      m.compose(p.clone().addScaledVector(n, 0.1 * s), q, new THREE.Vector3(s, s, s));
      needles.setMatrixAt(i, m);
    }
    g.add(needles);

    // clusters of three berries on the front of the wreath
    const berryMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.25, metalness: 0.1 });
    berryMat.colorNode = this.uBerry;
    berryMat.emissiveNode = this.uBerry.mul(0.15);
    const clusters = 18;
    const berries = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 12, 8), berryMat, clusters * 3);
    for (let c = 0; c < clusters; c++) {
      const a = ((c + 0.5) / clusters) * Math.PI * 2;
      for (let k = 0; k < 3; k++) {
        const b = a + (k - 1) * 0.022;
        const r = ringR + (k === 1 ? 0.07 : -0.02);
        m.makeTranslation(Math.cos(b) * r, Math.sin(b) * r, tube + 0.04);
        berries.setMatrixAt(c * 3 + k, m);
      }
    }
    g.add(berries);
    this.wreath = g;
    this.spinner.add(g);
  }

  /** Chunky glass bulbs on a wire, each its own colour, in place of the marquee ring. */
  private applyStringLights(colors: WheelStyle['stringLights']) {
    const key = colors?.join() ?? '';
    if (key === this.lightsKey) return;
    this.lightsKey = key;
    if (this.lights) {
      this.root.remove(this.lights);
      this.lights.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry.dispose();
          (mesh.material as THREE.Material).dispose();
        }
      });
      this.lights = null;
    }
    if (!colors?.length) return;
    const g = new THREE.Group();
    const wire = new THREE.Mesh(new THREE.TorusGeometry(LED_R, 0.025, 8, 256), new THREE.MeshStandardNodeMaterial({ color: '#15301c', roughness: 0.6 }));
    wire.position.z = -0.02;
    g.add(wire);

    const count = 40;
    const phases = new Float32Array(count);
    const tints = new Float32Array(count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      phases[i] = i / count;
      c.set(colors[i % colors.length]);
      tints.set([c.r, c.g, c.b], i * 3);
    }
    const phase: any = instancedBufferAttribute(new THREE.InstancedBufferAttribute(phases, 1), 'float');
    const tint: any = instancedBufferAttribute(new THREE.InstancedBufferAttribute(tints, 3), 'vec3');
    const alt = step(0.5, fract(phase.mul(count / 2)));
    // each bulb also twinkles on its own a little, like real fairy lights
    const twinkle = sin(time.mul(2.3).add(phase.mul(97))).mul(0.18).add(0.9);
    const bright = this.bulbBrightness(phase, alt).mul(0.75).add(0.5).mul(twinkle);
    const glass = new THREE.MeshStandardNodeMaterial({ roughness: 0.15, metalness: 0 });
    glass.colorNode = tint.mul(0.35);
    // brighter toward the tip of the bulb
    glass.emissiveNode = tint.mul(bright).mul(smoothstep(-0.05, 0.16, positionGeometry.y).mul(0.6).add(0.55));

    // a C9-style bulb pointing out from the ring, on a little socket
    const bulbGeo = new THREE.LatheGeometry(
      [
        [0.001, 0],
        [0.05, 0.02],
        [0.075, 0.08],
        [0.07, 0.15],
        [0.04, 0.22],
        [0.001, 0.25],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
      14,
    ).translate(0, 0.04, 0);
    const bulbs = new THREE.InstancedMesh(bulbGeo, glass, count);
    const sockets = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.032, 0.036, 0.06, 8).translate(0, 0.02, 0), new THREE.MeshStandardNodeMaterial({ color: '#15301c', roughness: 0.6 }), count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      // pointing outward, tipped a little toward the camera
      const dir = new THREE.Vector3(Math.cos(a), Math.sin(a), 0.35).normalize();
      q.setFromUnitVectors(up, dir);
      m.compose(new THREE.Vector3(Math.cos(a) * LED_R, Math.sin(a) * LED_R, 0.02), q, new THREE.Vector3(1, 1, 1));
      bulbs.setMatrixAt(i, m);
      sockets.setMatrixAt(i, m);
    }
    g.add(bulbs, sockets);
    this.lights = g;
    this.root.add(g);
  }

  /**
   * Show the decoration for `slot` built for `key` (rebuilding it when the key
   * changes), or remove it when `key` is undefined.
   */
  private decorate(slot: string, key: string | undefined, build: () => THREE.Object3D, parent: THREE.Object3D) {
    const current = this.decorations.get(slot);
    if (current?.key === key) return;
    if (current) {
      current.object.parent?.remove(current.object);
      current.object.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry.dispose();
          (mesh.material as THREE.Material).dispose();
        }
      });
      this.decorations.delete(slot);
    }
    if (key === undefined) return;
    const object = build();
    parent.add(object);
    this.decorations.set(slot, { key, object });
  }

  /** A ring donut: baked dough with glossy, drippy frosting on the front, and sprinkles. */
  private makeDonut(d: NonNullable<WheelStyle['donut']>) {
    const g = new THREE.Group();
    const ringR = RIM_R + 0.06;
    const tube = 0.25;
    // Torus UVs: x around the wheel, y around the tube (0.25 = the face toward the camera)
    const u = uv();
    const drip = mx_noise_float(vec3(u.x.mul(40), 0, 0)).mul(0.06);
    const frosted = smoothstep(0.2 + 0.015, 0.2, abs(u.y.sub(0.25)).sub(drip));
    const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.65 });
    const dough = mix(vec3(0.85, 0.58, 0.32), vec3(0.62, 0.36, 0.17), smoothstep(0.3, 0.6, abs(u.y.sub(0.25))));
    const frosting = new THREE.Color(d.frosting);
    mat.colorNode = mix(dough, vec3(frosting.r, frosting.g, frosting.b), frosted);
    mat.roughnessNode = mix(float(0.7), float(0.25), frosted);
    const donut = new THREE.Mesh(new THREE.TorusGeometry(ringR, tube, 24, 220), mat);
    donut.scale.z = 0.85;
    g.add(donut);

    const count = 420;
    const sprinkles = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.014, 0.06, 2, 6), new THREE.MeshStandardNodeMaterial({ roughness: 0.4 }), count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.62; // on the frosting
      const n = new THREE.Vector3(Math.cos(v) * Math.cos(a), Math.cos(v) * Math.sin(a), Math.sin(v) * 0.85);
      const p = new THREE.Vector3(Math.cos(a) * ringR, Math.sin(a) * ringR, 0).addScaledVector(n, tube * 1.01);
      // lying flat on the surface, pointing any which way
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3().randomDirection().cross(n).normalize());
      sprinkles.setMatrixAt(i, m.compose(p, q, new THREE.Vector3(1, 1, 1)));
      sprinkles.setColorAt(i, c.set(d.sprinkles[i % d.sprinkles.length]));
    }
    g.add(sprinkles);
    return g;
  }

  /** Brass rivets around the rim, like a ship's porthole. */
  private makeRivets(color: string) {
    const count = 32;
    const rivets = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), new THREE.MeshStandardNodeMaterial({ color, metalness: 0.6, roughness: 0.35 }), count);
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const a = ((i + 0.5) / count) * Math.PI * 2;
      rivets.setMatrixAt(i, m.makeTranslation(Math.cos(a) * RIM_R, Math.sin(a) * RIM_R, 0.13));
    }
    return rivets;
  }

  /** Glowing bubbles that bob gently, in place of the bulbs. */
  private makeBubbles() {
    const count = 36;
    const phases = new Float32Array(count);
    for (let i = 0; i < count; i++) phases[i] = i / count;
    const phase: any = instancedBufferAttribute(new THREE.InstancedBufferAttribute(phases, 1), 'float');
    const alt = step(0.5, fract(phase.mul(count / 2)));
    const bright = this.bulbBrightness(phase, alt).mul(0.4).add(0.6);
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const fres = pow(float(1).sub(abs(dot(normalView, positionViewDirection))), 2.5);
    // a bright rim and a little highlight, like a soap bubble lit from inside
    const highlight = smoothstep(0.035, 0.0, length(positionGeometry.xy.sub(vec2(-0.035, 0.04))));
    mat.colorNode = mix(this.uLedA, this.uLedB, alt).mul(fres.mul(1.4).add(0.07)).add(vec3(highlight.mul(0.9))).mul(bright);
    // bob: positionLocal includes the instance transform here, so this is in world units
    mat.positionNode = positionLocal.add((vec3 as any)(0, sin(time.mul(1.6).add(phase.mul(37))).mul(0.04), 0));
    const bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 16, 12), mat, count);
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const s = 0.75 + ((i * 7) % 5) * 0.12;
      bubbles.setMatrixAt(i, m.compose(new THREE.Vector3(Math.cos(a) * LED_R, Math.sin(a) * LED_R, 0.06), new THREE.Quaternion(), new THREE.Vector3(s, s, s)));
    }
    bubbles.renderOrder = 2;
    return bubbles;
  }

  /** Electric arcs crackling around the rim: jagged bolts that jump every few frames. */
  private makeArcs(color: string) {
    const c = new THREE.Color(color);
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const u = uv();
    // the pattern re-rolls ~14 times a second, like a real discharge
    const frame = floor(time.mul(mix(float(14), float(1.5), uCalm))); // slow re-rolls for reduced motion
    // around the tube, 0 is the outer edge and 0.25 the face toward the camera: keep the bolts there
    const path = mx_noise_float(vec3(u.x.mul(70), frame, 0)).mul(0.2).add(0.17);
    const bolt = smoothstep(0.03, 0.0, abs(u.y.sub(path)));
    const active = step(0.25, mx_noise_float(vec3(u.x.mul(6), frame.mul(0.7), 3)));
    const hot = mix(vec3(c.r, c.g, c.b), vec3(1, 1, 1), bolt.mul(0.6));
    mat.colorNode = hot.mul(bolt.mul(active).mul(float(3.2).add(this.uSpeed.mul(0.1)).add(this.uWin.mul(2))));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(RIM_R + 0.05, 0.3, 24, 240), mat);
    ring.renderOrder = 2;
    return ring;
  }

  /** A rim of voxel cubes, alternating colours. */
  private makeVoxelRim(colors: string[]) {
    const count = 80;
    const cubes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.24, 0.24, 0.3), new THREE.MeshStandardNodeMaterial({ roughness: 0.55, flatShading: true }), count);
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      cubes.setMatrixAt(i, m.makeRotationZ(a).setPosition(Math.cos(a) * (RIM_R + 0.04), Math.sin(a) * (RIM_R + 0.04), 0));
      cubes.setColorAt(i, c.set(colors[Math.floor(i / 2) % colors.length]));
    }
    return cubes;
  }

  /** A pizza crust: puffy golden dough with charred blisters. */
  private makeCrust() {
    const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.75 });
    const n = mx_noise_float(positionLocal.mul(5)).mul(0.5).add(0.5);
    const char = smoothstep(0.72, 0.8, mx_noise_float(positionLocal.mul(vec3(3, 3, 6)).add(7)).mul(0.5).add(0.5));
    const u = uv();
    const top = smoothstep(0.5, 0.0, abs(u.y.sub(0.25))); // the face toward the camera bakes darker
    mat.colorNode = mix(mix(vec3(0.93, 0.74, 0.42), vec3(0.78, 0.5, 0.22), n.mul(0.6).add(top.mul(0.3))), vec3(0.25, 0.14, 0.08), char.mul(0.85));
    mat.positionNode = positionLocal.add(normalLocal.mul(n.sub(0.5).mul(0.06)));
    const crust = new THREE.Mesh(new THREE.TorusGeometry(RIM_R + 0.05, 0.27, 24, 220), mat);
    crust.scale.z = 0.8;
    return crust;
  }

  /** Pizza toppings along each slice seam: pepperoni, olives and basil, away from the names. */
  private makeToppings(slices: number) {
    const g = new THREE.Group();
    if (slices < 2) return g;
    const seg = (Math.PI * 2) / slices;
    const pepMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.55 });
    pepMat.colorNode = mix(vec3(0.72, 0.12, 0.1), vec3(0.45, 0.06, 0.05), step(0.75, mx_noise_float(positionGeometry.mul(40)).mul(0.5).add(0.5)));
    const oliveMat = new THREE.MeshStandardNodeMaterial({ color: '#1e1c1a', roughness: 0.35 });
    const basilMat = new THREE.MeshStandardNodeMaterial({ color: '#3f8a2c', roughness: 0.6, side: THREE.DoubleSide });
    const pep = new THREE.CylinderGeometry(0.17, 0.17, 0.035, 20).rotateX(Math.PI / 2);
    const olive = new THREE.TorusGeometry(0.06, 0.03, 8, 14);
    const basil = new THREE.CircleGeometry(0.1, 12).scale(1.6, 0.8, 1);
    const z = this.frontZ + 0.03;
    for (let k = 0; k < slices; k++) {
      const a = k * seg;
      const at = (r: number, da = 0) => [Math.cos(a + da) * r, Math.sin(a + da) * r] as const;
      const [x1, y1] = at(slices > 10 ? 1.9 : 1.6);
      const p1 = new THREE.Mesh(pep, pepMat);
      p1.position.set(x1, y1, z);
      g.add(p1);
      if (slices <= 10) {
        const [x2, y2] = at(2.4);
        const p2 = new THREE.Mesh(pep, pepMat);
        p2.position.set(x2, y2, z);
        g.add(p2);
      }
      const [ox, oy] = at(1.15, 0.08);
      const o = new THREE.Mesh(olive, oliveMat);
      o.position.set(ox, oy, z);
      g.add(o);
      const [bx, by] = at(2.05, -0.05);
      const b = new THREE.Mesh(basil, basilMat);
      b.position.set(bx, by, z + 0.01);
      b.rotation.z = a + 0.6;
      g.add(b);
    }
    return g;
  }

  /** A neon tube around the wheel: a glowing glass core in a dark housing, humming faintly. */
  private makeNeonRim(n: NonNullable<WheelStyle['neonRim']>) {
    const g = new THREE.Group();
    const housing = new THREE.Mesh(new THREE.TorusGeometry(RIM_R, 0.15, 16, 200), new THREE.MeshStandardNodeMaterial({ color: '#15121c', metalness: 0.7, roughness: 0.35 }));
    housing.position.z = -0.04;
    g.add(housing);
    const a = new THREE.Color(n.a);
    const b = new THREE.Color(n.b);
    const ang = atan(positionLocal.y, positionLocal.x);
    // the colour drifts around the tube; a faint mains hum, brighter while spinning and on a win
    const blend = sin(ang.mul(2).add(time.mul(0.6))).mul(0.5).add(0.5);
    const hum = sin(time.mul(120)).mul(0.03).add(sin(time.mul(3.1)).mul(0.04)).add(1);
    const glow = new THREE.MeshBasicNodeMaterial();
    glow.colorNode = mix(vec3(a.r, a.g, a.b), vec3(b.r, b.g, b.b), blend).mul(hum).mul(float(2.2).add(this.uSpeed.mul(0.06)).add(this.uWin.mul(2)));
    const tube = new THREE.Mesh(new THREE.TorusGeometry(RIM_R, 0.075, 12, 220), glow);
    tube.position.z = 0.08;
    g.add(tube);
    return g;
  }

  /** The rim as a ring of swirling plasma, like an accretion disk: white-hot to orange, brighter on one side. */
  private makePlasmaRim(p: NonNullable<WheelStyle['plasmaRim']>) {
    const hot = new THREE.Color(p.hot);
    const cool = new THREE.Color(p.cool);
    const mat = new THREE.MeshBasicNodeMaterial();
    const ang = atan(positionLocal.y, positionLocal.x);
    // streaks flowing around the ring, faster while the wheel spins
    const flow = time.mul(float(1.6).add(this.uSpeed.mul(0.15)));
    const n = mx_noise_float(vec3(cos(ang.sub(flow.mul(0.35))).mul(3), sin(ang.sub(flow.mul(0.35))).mul(3), positionLocal.z.mul(6).add(time.mul(0.4)))).mul(0.5).add(0.5);
    const streak = mx_noise_float(vec3(ang.mul(14).sub(flow), positionLocal.z.mul(10), 0)).mul(0.5).add(0.5);
    const heat = n.mul(0.6).add(streak.mul(0.4));
    // relativistic beaming: one side of the ring brighter than the other
    const doppler = cos(ang.add(0.6)).mul(0.35).add(1);
    mat.colorNode = mix(vec3(cool.r, cool.g, cool.b), vec3(hot.r, hot.g, hot.b), smoothstep(0.35, 0.8, heat))
      .mul(heat.mul(1.4).add(0.6))
      .mul(doppler)
      .mul(float(1.4).add(this.uWin.mul(1.5)));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(RIM_R, 0.16, 24, 256), mat);
    return ring;
  }

  /** Chrome (default) or matte: wood for a helm or a wagon wheel, knotted dark wood when gnarled. */
  private applyRimFinish(finish: WheelStyle['rimFinish']) {
    const matte = !!this.style.helm || !!finish;
    this.rimMat.metalness = matte ? 0.1 : 0.95;
    this.rimMat.roughness = matte ? 0.6 : 0.16;
    this.uRimLift.value = matte ? 0.04 : 0.35;
    this.uGnarl.value = finish === 'gnarled' ? 1 : 0;
    this.uBamboo.value = finish === 'bamboo' ? 1 : 0;
  }

  /** A ring of flickering candles in place of the marquee bulbs (they stay upright). */
  private applyCandles(on: boolean) {
    if (on === !!this.candles) return;
    if (this.candles) {
      this.root.remove(this.candles);
      this.candles.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry.dispose();
          (mesh.material as THREE.Material).dispose();
        }
      });
      this.candles = null;
    }
    if (!on) return;
    const count = 24;
    const g = new THREE.Group();
    const phases = new Float32Array(count);
    const heights = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      phases[i] = i / count;
      heights[i] = 0.75 + ((i * 37) % 10) / 22; // uneven, half-burnt candles
    }
    const phase: any = instancedBufferAttribute(new THREE.InstancedBufferAttribute(phases, 1), 'float');
    const alt = step(0.5, fract(phase.mul(count / 2)));

    // wax: off-white with darker drips running down from the top
    const wax = new THREE.MeshStandardNodeMaterial({ roughness: 0.55 });
    const drips = smoothstep(0.55, 0.85, mx_noise_float(vec3(atan(positionGeometry.z, positionGeometry.x).mul(3), positionGeometry.y.mul(4), 0)).mul(0.5).add(0.5)).mul(smoothstep(0.05, 0.2, positionGeometry.y));
    wax.colorNode = mix(vec3(0.92, 0.88, 0.78), vec3(0.75, 0.68, 0.55), drips);
    wax.emissiveNode = vec3(1, 0.55, 0.2).mul(smoothstep(0.15, 0.27, positionGeometry.y).mul(0.25)); // lit from the flame above
    const body = new THREE.CylinderGeometry(0.08, 0.092, 0.27, 12).translate(0, 0.135, 0);

    // flame: a teardrop that flickers, leans and pulses with the light show
    const flicker = sin(time.mul(17).add(phase.mul(41))).mul(0.5).add(sin(time.mul(9.3).add(phase.mul(77))).mul(0.5));
    const bright = this.bulbBrightness(phase, alt).mul(0.45).add(0.75).mul(flicker.mul(0.12).add(1));
    const flameMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const fy = positionGeometry.y;
    flameMat.colorNode = mix(vec3(1, 0.95, 0.65), vec3(1, 0.45, 0.1), smoothstep(0.0, 0.14, fy)).mul(bright.mul(1.6));
    const lean = flicker.mul(0.015).mul(fy.mul(8));
    flameMat.positionNode = positionLocal.add((vec3 as any)(lean, flicker.mul(0.01).mul(fy.mul(6)), 0));
    const flameGeo = new THREE.LatheGeometry(
      [
        [0.001, 0],
        [0.03, 0.03],
        [0.035, 0.06],
        [0.022, 0.12],
        [0.001, 0.17],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
      10,
    );
    const halo = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    halo.colorNode = vec3(1, 0.55, 0.2).mul(smoothstep(0.5, 0.0, length(uv().sub(0.5))).mul(bright.mul(0.35)));

    const bodies = new THREE.InstancedMesh(body, wax, count);
    const flames = new THREE.InstancedMesh(flameGeo, flameMat, count);
    const halos = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.42, 0.42), halo, count);
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const x = Math.cos(a) * LED_R;
      const y = Math.sin(a) * LED_R;
      const h = heights[i];
      bodies.setMatrixAt(i, m.compose(new THREE.Vector3(x, y - 0.12, 0.04), new THREE.Quaternion(), new THREE.Vector3(1, h, 1)));
      flames.setMatrixAt(i, m.compose(new THREE.Vector3(x, y - 0.12 + 0.27 * h + 0.01, 0.04), new THREE.Quaternion(), new THREE.Vector3(1.25, 1.25, 1.25)));
      halos.setMatrixAt(i, m.compose(new THREE.Vector3(x, y - 0.12 + 0.27 * h + 0.09, 0.1), new THREE.Quaternion(), new THREE.Vector3(1.25, 1.25, 1.25)));
    }
    flames.renderOrder = halos.renderOrder = 2;
    // the iron ring the candles stand on
    const ring = new THREE.Mesh(new THREE.TorusGeometry(LED_R, 0.04, 8, 200), new THREE.MeshStandardNodeMaterial({ color: '#2a2530', metalness: 0.7, roughness: 0.5 }));
    g.add(ring, bodies, halos, flames);
    this.candles = g;
    this.root.add(g);
  }

  /** Swap the pointer between the glossy teardrop (default) and the special shapes. */
  private applyPointer(kind: WheelStyle['pointer']) {
    for (const o of this.flapperDefault) o.visible = !kind;
    if (kind && !this.pointers.has(kind)) {
      const shape = { icicle: () => this.makeIcicle(), scythe: () => this.makeScythe(), candycane: () => this.makeCandyCane(), anchor: () => this.makeAnchor(), comet: () => this.makeComet(), horseshoe: () => this.makeHorseshoe(), leaf: () => this.makeLeaf(), ankh: () => this.makeAnkh(), balloon: () => this.makeBalloon(), bolt: () => this.makeBolt(), pixel: () => this.makePixelArrow(), cutter: () => this.makeCutter() }[kind]();
      this.pointers.set(kind, shape);
      this.flapper.add(shape);
    }
    for (const [k, o] of this.pointers) o.visible = k === kind;
  }

  private makeIcicle() {
    const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.06, metalness: 0.1 });
    const fres = pow(float(1).sub(abs(dot(normalView, positionViewDirection))), 2.2);
    // clear blue ice, frosted near the top, glowing at the edges
    mat.colorNode = mix(vec3(0.62, 0.85, 1), vec3(0.93, 0.98, 1), smoothstep(-0.2, 0.2, positionGeometry.y));
    mat.emissiveNode = vec3(0.45, 0.8, 1).mul(fres.mul(1.2).add(0.12).add(this.uWin.mul(0.8)));
    // a main spike with a lumpy, dripping profile
    const profile = [
      [0.001, -0.78],
      [0.05, -0.55],
      [0.07, -0.42],
      [0.1, -0.3],
      [0.12, -0.1],
      [0.18, 0.06],
      [0.22, 0.16],
      [0.2, 0.24],
      [0.001, 0.28],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const icicle = new THREE.Mesh(new THREE.LatheGeometry(profile, 12), mat);
    icicle.scale.z = 0.6; // flatter front to back, like the original pointer
    return icicle;
  }

  /** A red-and-white candy cane hanging from its hook, its straight end pointing at the pins. */
  private makeCandyCane() {
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.3, 0.02, 0),
      new THREE.Vector3(0.28, 0.2, 0),
      new THREE.Vector3(0.12, 0.3, 0),
      new THREE.Vector3(-0.02, 0.18, 0),
      new THREE.Vector3(0, -0.2, 0),
      new THREE.Vector3(0, -0.72, 0),
    ]);
    const mat = new THREE.MeshPhysicalNodeMaterial({ roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 });
    const u = uv();
    mat.colorNode = mix(vec3(0.96, 0.95, 0.94), vec3(0.85, 0.08, 0.15), step(0.5, fract(u.x.mul(16).add(u.y))));
    return new THREE.Mesh(new THREE.TubeGeometry(path, 64, 0.06, 12, false), mat);
  }

  /** A ship's anchor: ring, stock and shank, with curved arms and flukes at the bottom. */
  private makeAnchor() {
    const g = new THREE.Group();
    const iron = new THREE.MeshStandardNodeMaterial({ color: '#b08a45', metalness: 0.45, roughness: 0.4 });
    g.add(new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.022, 8, 20).translate(0, 0.2, 0), iron));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.34, 8).rotateZ(Math.PI / 2).translate(0, 0.07, 0), iron));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.86, 10).translate(0, -0.28, 0), iron));
    const arms = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.032, 8, 24, Math.PI).rotateZ(Math.PI).translate(0, -0.48, 0), iron);
    g.add(arms);
    for (const s of [-1, 1]) {
      const fluke = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 4).rotateZ(s * 0.6).translate(s * 0.25, -0.43, 0), iron);
      g.add(fluke);
    }
    g.add(new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.1, 6).rotateZ(Math.PI).translate(0, -0.74, 0), iron)); // the crown's point
    return g;
  }

  /** A hot-air balloon: striped envelope at the pivot, ropes, and the basket pointing at the pins. */
  private makeBalloon() {
    const g = new THREE.Group();
    const env = new THREE.MeshStandardNodeMaterial({ roughness: 0.5 });
    const ang = atan(positionLocal.z, positionLocal.x);
    env.colorNode = mix(vec3(0.95, 0.25, 0.25), vec3(1, 0.85, 0.3), step(0.5, fract(ang.mul(8 / (Math.PI * 2)))));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 16).scale(1, 1.15, 1).translate(0, 0.05, 0), env));
    const rope = new THREE.MeshStandardNodeMaterial({ color: '#5a4630', roughness: 0.9 });
    for (const x of [-0.1, 0.1]) g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.38, 4).rotateZ(x * 0.6).translate(x * 0.7, -0.38, 0), rope));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.12, 0.1).translate(0, -0.62, 0), new THREE.MeshStandardNodeMaterial({ color: '#8a5a2b', roughness: 0.8 })));
    g.add(new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.08, 6).rotateZ(Math.PI).translate(0, -0.72, 0), rope));
    return g;
  }

  /** A lightning bolt, zigzagging down to a point. */
  private makeBolt() {
    const s = new THREE.Shape();
    s.moveTo(-0.06, 0.2);
    s.lineTo(0.16, 0.2);
    s.lineTo(0.04, -0.1);
    s.lineTo(0.17, -0.1);
    s.lineTo(-0.05, -0.76);
    s.lineTo(0.0, -0.3);
    s.lineTo(-0.13, -0.3);
    s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2 }).translate(0, 0, -0.025);
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.colorNode = vec3(1, 0.92, 0.35).mul(sin(time.mul(30)).mul(0.15).add(1.5).add(this.uWin.mul(1.5)));
    return new THREE.Mesh(geo, mat);
  }

  /** A blocky pixel arrow pointing down, built from cubes. */
  private makePixelArrow() {
    const rows: [number, number][] = [
      [0.12, 1],
      [0.0, 1],
      [-0.12, 1],
      [-0.24, 5],
      [-0.36, 3],
      [-0.48, 1],
    ];
    const cubes = rows.flatMap(([y, w]) => Array.from({ length: w }, (_, i) => new THREE.BoxGeometry(0.115, 0.115, 0.12).translate((i - (w - 1) / 2) * 0.12, y - 0.2, 0)));
    const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.5, flatShading: true });
    mat.colorNode = this.uFlapper;
    mat.emissiveNode = this.uFlapper.mul(float(0.2).add(this.uWin.mul(0.8)));
    return new THREE.Mesh(mergeGeometries(cubes)!, mat);
  }

  /** A pizza cutter: handle up, the round blade at the bottom resting on the pins. */
  private makeCutter() {
    const g = new THREE.Group();
    const handle = new THREE.MeshStandardNodeMaterial({ color: '#c0392b', roughness: 0.45 });
    g.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.32, 4, 10).translate(0, 0.05, 0), handle));
    const steel = new THREE.MeshStandardNodeMaterial({ color: '#b8bcc4', metalness: 0.7, roughness: 0.3 });
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.05).translate(0, -0.28, 0), steel));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.025, 32).rotateX(Math.PI / 2).translate(0, -0.5, 0), steel));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.06, 10).rotateX(Math.PI / 2).translate(0, -0.5, 0), handle));
    return g;
  }

  /** A golden ankh: the loop at the pivot, the arms, and the stem pointing down at the pins. */
  private makeAnkh() {
    const gold = new THREE.MeshStandardNodeMaterial({ color: '#e0b04a', metalness: 0.6, roughness: 0.3 });
    const fres = pow(float(1).sub(abs(dot(normalView, positionViewDirection))), 2.5);
    gold.emissiveNode = vec3(1, 0.75, 0.3).mul(fres.mul(0.5).add(this.uWin.mul(0.8)));
    const geo = mergeGeometries([
      new THREE.TorusGeometry(0.13, 0.045, 10, 24).scale(0.85, 1.2, 1).translate(0, 0.08, 0),
      new THREE.BoxGeometry(0.46, 0.085, 0.07).translate(0, -0.12, 0),
      new THREE.CylinderGeometry(0.045, 0.035, 0.6, 10).translate(0, -0.44, 0),
      new THREE.ConeGeometry(0.035, 0.08, 10).rotateZ(Math.PI).translate(0, -0.78, 0),
    ])!;
    return new THREE.Mesh(geo, gold);
  }

  /** A green leaf hanging from its stem, its tip pointing at the pins. */
  private makeLeaf() {
    const outline = new THREE.Shape();
    outline.moveTo(0, 0.02);
    outline.bezierCurveTo(0.26, -0.08, 0.24, -0.5, 0, -0.76);
    outline.bezierCurveTo(-0.24, -0.5, -0.26, -0.08, 0, 0.02);
    const geo = new THREE.ExtrudeGeometry(outline, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2, curveSegments: 24 }).translate(0, 0, -0.02);
    const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.5, side: THREE.DoubleSide });
    const p = positionGeometry;
    // midrib and side veins, lighter toward the tip
    const midrib = smoothstep(0.012, 0.0, abs(p.x));
    const veins = smoothstep(0.85, 1, sin(p.y.mul(38).add(abs(p.x).mul(30)))).mul(0.5);
    mat.colorNode = mix(vec3(0.24, 0.5, 0.2), vec3(0.45, 0.7, 0.3), smoothstep(0, -0.7, p.y)).add(vec3(midrib.max(veins).mul(0.12)));
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo, mat));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.24, 6).translate(0, 0.13, 0), new THREE.MeshStandardNodeMaterial({ color: '#4a6a2e', roughness: 0.7 })));
    return g;
  }

  /** A lucky horseshoe, open end up, hanging from a nail; its curve points at the pins. */
  private makeHorseshoe() {
    const g = new THREE.Group();
    const iron = new THREE.MeshStandardNodeMaterial({ color: '#6f6a64', metalness: 0.55, roughness: 0.45 });
    const shoe = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.055, 10, 32, Math.PI * 1.45).rotateZ(Math.PI * 0.775).scale(1, 1.15, 0.6).translate(0, -0.42, 0), iron);
    g.add(shoe);
    // nail holes along the shoe
    const holeMat = new THREE.MeshStandardNodeMaterial({ color: '#2a2622', roughness: 0.8 });
    for (let i = 0; i < 6; i++) {
      const a = Math.PI * 0.775 + 0.35 + (i / 5) * (Math.PI * 1.45 - 0.7); // the arc runs around the bottom; the gap is at the top
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 6).rotateX(Math.PI / 2), holeMat);
      hole.position.set(Math.cos(a) * 0.24, -0.42 + Math.sin(a) * 0.24 * 1.15, 0.035);
      g.add(hole);
    }
    // hung from a nail by a strip of leather
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.36, 0.02).translate(0, -0.02, 0), new THREE.MeshStandardNodeMaterial({ color: '#6b4226', roughness: 0.8 })));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 8).rotateX(Math.PI / 2).translate(0, 0.16, 0.02), iron));
    return g;
  }

  /** A comet: a blazing head at the tip with its glowing tail streaming up behind it. */
  private makeComet() {
    const g = new THREE.Group();
    const head = new THREE.MeshBasicNodeMaterial();
    head.colorNode = vec3(1, 0.97, 0.9).mul(float(2.2).add(this.uWin.mul(2)));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12).translate(0, -0.62, 0), head));
    const tail = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const along = smoothstep(-0.62, 0.3, positionGeometry.y); // 0 at the head, 1 at the far end
    const flicker = sin(time.mul(11).add(positionGeometry.y.mul(20))).mul(0.1).add(1);
    tail.colorNode = mix(vec3(0.75, 0.9, 1), vec3(0.6, 0.45, 1), along).mul(float(1).sub(along).mul(1.6)).mul(flicker);
    g.add(new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.92, 20, 1, true).rotateZ(Math.PI).translate(0, -0.16, 0), tail));
    return g;
  }

  /** A reaper's scythe blade hanging from the pivot, curving down to a point. */
  private makeScythe() {
    const g = new THREE.Group();
    const blade = new THREE.Shape();
    blade.moveTo(-0.05, 0.12);
    blade.quadraticCurveTo(0.42, 0.02, 0.2, -0.42);
    blade.quadraticCurveTo(0.08, -0.62, -0.02, -0.74); // the point, aimed at the pins
    blade.quadraticCurveTo(0.1, -0.4, -0.12, -0.12);
    blade.closePath();
    const geo = new THREE.ExtrudeGeometry(blade, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2, curveSegments: 20 }).translate(0, 0, -0.03);
    // dull, dark steel: a mirror finish would just reflect the bright environment and read as white
    const steel = new THREE.MeshStandardNodeMaterial({ metalness: 0.25, roughness: 0.45 });
    const fres = pow(float(1).sub(abs(dot(normalView, positionViewDirection))), 3.0);
    steel.colorNode = vec3(0.2, 0.2, 0.24);
    // an eerie sheen along the edge, flaring on a win
    steel.emissiveNode = vec3(0.55, 0.3, 0.95).mul(fres.mul(0.7).add(0.02).add(this.uWin.mul(0.6)));
    g.add(new THREE.Mesh(geo, steel));
    // the end of the wooden snath it hangs from, with an iron collar
    const wood = new THREE.MeshStandardNodeMaterial({ color: '#3a2618', roughness: 0.8 });
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.42, 10).translate(0, 0.2, 0), wood));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.08, 12).translate(0, 0.04, 0), new THREE.MeshStandardNodeMaterial({ color: '#2a2a30', metalness: 0.8, roughness: 0.4 })));
    return g;
  }

  /** Swap the chrome rim for a racing tyre (or back). */
  private applyTire(tire: WheelStyle['tire']) {
    const key = tire ? `${tire.text}|${tire.color}` : '';
    if (key === this.tireKey) return;
    this.tireKey = key;
    if (this.tire) {
      this.spinner.remove(this.tire);
      this.tire.geometry.dispose();
      const mat = this.tire.material as THREE.MeshStandardNodeMaterial;
      (mat.userData.lettering as THREE.Texture | undefined)?.dispose();
      mat.dispose();
      this.tire = null;
    }
    if (!tire) return;

    // sidewall lettering, drawn once; it repeats three times around the tyre
    const c = document.createElement('canvas');
    c.width = 2048;
    c.height = 160;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = tire.color;
    ctx.font = 'italic 900 112px "Arial Black", "Helvetica Neue", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tire.text, 1024, 84, 1900);
    const lettering = new THREE.CanvasTexture(c);
    lettering.colorSpace = THREE.SRGBColorSpace;
    lettering.anisotropy = 8;
    lettering.wrapS = THREE.RepeatWrapping; // repeat by wrapping, not fract(), so there's no seam

    // Torus UVs: x runs around the wheel (counter-clockwise), y around the tube
    // (0 = outer tread, 0.25 = the face toward the camera, 0.5 = inner edge).
    const u = uv();
    const rubber = vec3(0.045, 0.045, 0.05);
    // tread: chevron grooves on the outer band
    const outer = smoothstep(0.13, 0.08, u.y).max(smoothstep(0.87, 0.92, u.y));
    const groove = step(0.5, fract(u.x.mul(220).add(abs(u.y.sub(0.5)).mul(6))));
    let col: any = mix(rubber, rubber.mul(0.4), groove.mul(outer));
    // sidewall: a coloured compound band either side of the lettering
    const side = u.y.sub(0.25);
    const band = smoothstep(0.012, 0.0, abs(abs(side).sub(0.095)));
    col = mix(col, this.uTireColor, band);
    // lettering, mirrored so it reads clockwise (the right way up across the top)
    const textV = side.div(0.16).add(0.5);
    const inBand = step(0, textV).mul(step(textV, 1));
    const ink = texture(lettering, vec2(u.x.mul(-3), float(1).sub(textV))).a.mul(inBand);
    col = mix(col, this.uTireColor, ink);
    const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0 });
    mat.colorNode = col;
    mat.roughnessNode = mix(float(0.85), float(0.5), band.max(ink));
    mat.userData.lettering = lettering;
    this.uTireColor.value.set(tire.color);
    this.tire = new THREE.Mesh(new THREE.TorusGeometry(RIM_R + 0.14, 0.32, 28, 256), mat);
    this.tire.scale.z = 0.75; // a little narrower front to back than it is tall
    this.spinner.add(this.tire);
  }

  /** Switch between the carnival marquee and a ship's helm. */
  private applyHelm(helm: WheelStyle['helm']) {
    // a wooden rim is matte; the default one is chrome
    if (helm) this.uWood.value.set(helm.wood);
    const key = helm ? String(helm.handles) : '';
    if (key === this.helmKey) return;
    this.helmKey = key;
    if (this.helm) {
      this.spinner.remove(this.helm);
      this.helm.geometry.dispose();
      (this.helm.material as THREE.Material).dispose();
      this.helm = null;
    }
    if (!helm) return;

    // one turned handle (lathe profile along +Y, from the rim outward), repeated around the wheel
    const profile = [
      [0.075, 0],
      [0.08, 0.14],
      [0.12, 0.24],
      [0.085, 0.34],
      [0.09, 0.54],
      [0.13, 0.68],
      [0.145, 0.8],
      [0.12, 0.91],
      [0.05, 0.99],
      [0.001, 1.0],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const handle = new THREE.LatheGeometry(profile, 14);
    const collar = new THREE.TorusGeometry(0.1, 0.035, 8, 16).rotateX(Math.PI / 2).translate(0, 0.06, 0);
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < helm.handles; i++) {
      const a = (i / helm.handles) * Math.PI * 2;
      for (const g of [handle, collar]) {
        parts.push(g.clone().translate(0, RIM_R + 0.1, 0).rotateZ(a - Math.PI / 2));
      }
    }
    const geo = mergeGeometries(parts)!;
    // turned-wood grain: rings along each handle, a little darker at the ends
    const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.55, metalness: 0.05 });
    const along = length(positionLocal.xy);
    mat.colorNode = this.uWood.mul(sin(along.mul(60)).mul(0.08).add(0.95)).mul(float(1).sub(smoothstep(RIM_R + 0.8, RIM_R + 1.1, along).mul(0.25)));
    // the handles sit just behind the pointer so they sweep under it
    this.helm = new THREE.Mesh(geo, mat);
    this.helm.position.z = -0.08;
    this.spinner.add(this.helm);
  }

  private buildFlapper() {
    const shape = new THREE.Shape();
    shape.moveTo(-0.24, 0);
    shape.absarc(0, 0, 0.24, Math.PI, 0, true);
    shape.lineTo(0.05, -0.62);
    shape.quadraticCurveTo(0, -0.7, -0.05, -0.62);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.1,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.04,
      bevelSegments: 4,
      curveSegments: 24,
    }).translate(0, 0, -0.05);

    const mat = new THREE.MeshPhysicalNodeMaterial({ metalness: 0.2, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 });
    mat.colorNode = this.uFlapper;
    const fres = pow(float(1).sub(abs(dot(normalView, positionViewDirection))), 3.0);
    mat.emissiveNode = this.uFlapper.mul(fres.mul(1.4).add(0.12).add(this.uWin.mul(0.8)));
    this.flapper.add(new THREE.Mesh(geo, mat));

    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 24, 16),
      new THREE.MeshStandardNodeMaterial({ color: '#ffffff', metalness: 1, roughness: 0.05 }),
    );
    cap.position.z = 0.1;
    this.flapper.add(cap);

    this.flapper.position.set(0, R + 0.5, 0.3);
    this.root.add(this.flapper);
    this.flapperDefault = [...this.flapper.children];
  }
}
