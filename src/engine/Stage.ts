import * as THREE from 'three/webgpu';
import {
  exp,
  float,
  length,
  max,
  normalize,
  pass,
  screenSize,
  screenUV,
  sin,
  smoothstep,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { chromaticAberration } from 'three/addons/tsl/display/ChromaticAberrationNode.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export interface PostStyle {
  bloom: [strength: number, radius: number, threshold: number];
  exposure: number;
  /** Chromatic aberration at full spin speed. */
  aberration: number;
  /** 0..1 vignette darkness. */
  vignette: number;
}

/**
 * Renderer, scene, camera and the post-processing chain:
 * scene → screen ripple (shockwaves) → bloom → chromatic aberration → flash + vignette.
 */
export class Stage {
  readonly renderer: THREE.WebGPURenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
  readonly envMap: THREE.Texture | null = null;

  private readonly uAberration = uniform(0);
  private readonly uRipple = uniform(-1); // progress 0..1, <0 = off
  private readonly uRippleStrength = uniform(0);
  private readonly uRippleCenter = uniform(new THREE.Vector2(0.5, 0.5));
  private readonly uFlash = uniform(0);
  private readonly uFlashColor = uniform(new THREE.Color('#ffffff'));
  private readonly uVignette = uniform(0.55);

  private pipeline!: THREE.RenderPipeline;
  private bloomNode: any;
  private fxNode: any;
  private plainNode: any;
  private style: PostStyle = { bloom: [0.5, 0.45, 0.82], exposure: 1, aberration: 1, vignette: 0.55 };

  private ripple = { t: -1, dur: 1 };
  private flash = { t: -1, dur: 1, peak: 0 };
  private aberrationKick = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  }

  get isWebGPU(): boolean {
    return (this.renderer.backend as any).isWebGPUBackend === true;
  }

  async init() {
    await this.renderer.init();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    (this as any).envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envMap;
    this.buildPipeline();
  }

  private buildPipeline() {
    this.pipeline = new THREE.RenderPipeline(this.renderer);
    const scenePass = pass(this.scene, this.camera);
    const color = scenePass.getTextureNode('output');

    // Shockwave ripple: a travelling sine ring that bends screen UVs
    const aspect = screenSize.x.div(screenSize.y);
    const d = screenUV.sub(this.uRippleCenter);
    const r = length(d.mul(vec2(aspect, 1)));
    const front = this.uRipple.mul(1.4);
    const band = exp(r.sub(front).mul(9).pow(2).negate());
    const wave = sin(r.sub(front).mul(48)).mul(band).mul(this.uRippleStrength).mul(float(1).sub(this.uRipple));
    const active = this.uRipple.greaterThanEqual(0).select(float(1), float(0));
    const uvR = screenUV.sub(normalize(d.add(vec2(1e-5))).mul(wave.mul(0.025).mul(active)));
    const rippled = color.sample(uvR);

    this.bloomNode = bloom(rippled, ...this.style.bloom);
    const combined = rippled.add(this.bloomNode);
    const split: any = chromaticAberration(combined, this.uAberration, vec2(0.5, 0.5), float(1.0));
    const v = length(screenUV.sub(0.5));
    const vignette = float(1).sub(smoothstep(0.35, 0.95, v).mul(this.uVignette));
    const flashed = split.rgb.mul(vignette).add((this.uFlashColor as any).mul(this.uFlash));
    this.fxNode = vec4(max(flashed, vec3(0)), 1);
    this.plainNode = scenePass;
    this.pipeline.outputNode = this.fxNode;
  }

  setPost(style: PostStyle) {
    this.style = style;
    this.renderer.toneMappingExposure = style.exposure;
    this.bloomNode.strength.value = style.bloom[0];
    this.bloomNode.radius.value = style.bloom[1];
    this.bloomNode.threshold.value = style.bloom[2];
    this.uVignette.value = style.vignette;
  }

  setFx(on: boolean) {
    this.pipeline.outputNode = on ? this.fxNode : this.plainNode;
    this.pipeline.needsUpdate = true;
  }

  /** Screen-space shockwave from a world position. */
  triggerRipple(at: THREE.Vector3, strength = 1, duration = 1.2) {
    const p = at.clone().project(this.camera);
    this.uRippleCenter.value.set((p.x + 1) / 2, (1 - p.y) / 2);
    this.uRippleStrength.value = strength;
    this.ripple = { t: 0, dur: duration };
  }

  triggerFlash(color: THREE.ColorRepresentation, peak = 0.8, duration = 0.5) {
    this.uFlashColor.value.set(color);
    this.flash = { t: 0, dur: duration, peak };
  }

  kickAberration(amount: number) {
    this.aberrationKick = Math.max(this.aberrationKick, amount);
  }

  update(dt: number, speed: number, win: number) {
    if (this.ripple.t >= 0) {
      this.ripple.t += dt;
      const p = this.ripple.t / this.ripple.dur;
      this.uRipple.value = p >= 1 ? -1 : p;
      if (p >= 1) this.ripple.t = -1;
    }
    if (this.flash.t >= 0) {
      this.flash.t += dt;
      const p = this.flash.t / this.flash.dur;
      this.uFlash.value = p >= 1 ? 0 : this.flash.peak * Math.pow(1 - p, 2);
      if (p >= 1) this.flash.t = -1;
    }
    this.aberrationKick *= Math.exp(-dt * 2.5);
    this.uAberration.value = Math.min(1.1, speed * 0.05) * this.style.aberration + win * 0.3 + this.aberrationKick;
  }

  render() {
    this.pipeline.render();
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
  }
}
