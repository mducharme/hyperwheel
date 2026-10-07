import * as THREE from 'three/webgpu';
import {
  abs,
  atan,
  attribute,
  dot,
  float,
  fract,
  instancedBufferAttribute,
  length,
  max,
  mix,
  mx_noise_float,
  normalLocal,
  normalView,
  positionLocal,
  positionViewDirection,
  pow,
  sin,
  smoothstep,
  step,
  texture,
  time,
  uniform,
  uv,
  vec3,
} from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { prefersDarkText, segmentColor } from './colors';
import { iridescent } from '../fx/nodes';

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
  /** CSS font-family for the names, e.g. '"Fredoka"'. Must be loaded in index.html. */
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
  private textCanvas = document.createElement('canvas');
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
    const mesh = new THREE.InstancedMesh(this.pegGeo, this.pegMat, total);
    const m = new THREE.Matrix4();
    const seg = (Math.PI * 2) / count;
    for (let j = 0; j < total; j++) {
      const a = j * stride * seg;
      m.makeTranslation(Math.cos(a) * PEG_R, Math.sin(a) * PEG_R, this.frontZ + 0.11);
      mesh.setMatrixAt(j, m);
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
    const mat = new THREE.MeshStandardNodeMaterial({ metalness: 0.95, roughness: 0.16 });
    const fres = pow(float(1).sub(abs(dot(normalView, positionViewDirection))), 2.0);
    const ang = atan(positionLocal.y, positionLocal.x).div(Math.PI * 2);
    const holo = iridescent(ang.mul(2).add(time.mul(0.12)).add(fres.mul(0.6)));
    const twoTone = mix(this.uRimA, this.uRimB, sin(ang.mul(Math.PI * 8).add(time)).mul(0.5).add(0.5));
    const rimCol = mix(twoTone, holo, this.uHolo);
    mat.colorNode = rimCol.mul(0.55).add(0.35);
    mat.emissiveNode = rimCol.mul(fres.mul(0.9).add(this.uSpeed.mul(0.02)).add(this.uWin.mul(0.8)));
    this.spinner.add(new THREE.Mesh(new THREE.TorusGeometry(RIM_R, 0.15, 32, 256), mat));

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

  private buildLeds() {
    // static marquee ring with chasing bulbs, carnival style
    const frameMat = new THREE.MeshStandardNodeMaterial({ metalness: 0.9, roughness: 0.3 });
    frameMat.colorNode = this.uFrame.mul(1.6);
    const frame = new THREE.Mesh(new THREE.TorusGeometry(LED_R, 0.09, 20, 256), frameMat);
    frame.position.z = -0.05;
    this.root.add(frame);

    const phases = new Float32Array(LED_COUNT);
    for (let i = 0; i < LED_COUNT; i++) phases[i] = i / LED_COUNT;
    const phase: any = instancedBufferAttribute(new THREE.InstancedBufferAttribute(phases, 1), 'float');

    const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.2, metalness: 0 });
    const chase = fract(phase.mul(8).sub(this.uChase));
    const lit = smoothstep(0.55, 1, chase);
    const strobe = step(0.5, fract(time.mul(6))).mul(this.uWin);
    const alt = step(0.5, fract(phase.mul(LED_COUNT / 2)));
    const bulb = mix(this.uLedA, this.uLedB, alt);
    // attract mode: two lights circling opposite ways, alternating with a marquee blink
    const comets = max(pow(fract(phase.sub(time.mul(0.36))), 16), pow(fract(phase.negate().sub(time.mul(0.36)).add(0.5)), 16));
    const blink = mix(alt, float(1).sub(alt), step(0.5, fract(time.mul(1.1)))).mul(0.8);
    const show = mix(comets, blink, smoothstep(-0.3, 0.3, sin(time.mul(0.45))));
    const bright = max(mix(lit, show, this.uAttract).mul(3.2).add(0.15), strobe.mul(5));
    mat.colorNode = bulb.mul(0.3);
    mat.emissiveNode = mix(bulb, vec3(1, 0.95, 0.85), this.uWin.mul(0.5)).mul(bright);

    const leds = new THREE.InstancedMesh(new THREE.SphereGeometry(0.085, 16, 12), mat, LED_COUNT);
    const m = new THREE.Matrix4();
    for (let i = 0; i < LED_COUNT; i++) {
      const a = (i / LED_COUNT) * Math.PI * 2;
      m.makeTranslation(Math.cos(a) * LED_R, Math.sin(a) * LED_R, 0.06);
      leds.setMatrixAt(i, m);
    }
    this.root.add(leds);
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
  }
}
