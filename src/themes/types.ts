import type * as THREE from 'three/webgpu';
import type { WheelStyle } from '../wheel/Wheel';
import type { PostStyle } from '../engine/Stage';
import type { CameraStyle } from '../engine/CameraRig';
import type { TickStyle } from '../audio/Sfx';
import type { ChipSong } from '../audio/ChipSynth';
import type { FxDirector } from '../fx/FxDirector';
import type { Entrance } from '../characters/Showcase';

export interface FrameState {
  time: number;
  dt: number;
  /** |angular velocity| of the wheel, rad/s. */
  speed: number;
  /** Win glow envelope, 1 → 0 over a few seconds after a result. */
  win: number;
  spinning: boolean;
}

export interface SceneContext {
  scene: THREE.Scene;
  renderer: THREE.WebGPURenderer;
  camera: THREE.PerspectiveCamera;
  /** World position of the wheel hub. */
  center: THREE.Vector3;
}

/** What a theme builds: its world around the wheel. */
export interface ThemeScene {
  /** Added to the scene on activation and disposed on switch. */
  group: THREE.Group;
  update(f: FrameState): void;
  /** Extra cleanup beyond disposing the group's geometries/materials. */
  dispose?(): void;
  /** Occasional touches of life while idle (see fx/ambient.ts). */
  moments?: { readonly count: number; play(i: number): void };
}

/**
 * A winner animation. `setup` runs once when the theme loads (build effects
 * here so shaders compile up front) and returns the function that plays it.
 */
export interface Celebration {
  name: string;
  setup(fx: FxDirector): () => void;
}

/** The lightweight part of a theme: enough for menus and swatches without loading the scene. */
export interface ThemeMeta {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  /** Panel accent colours (CSS). */
  ui: { accent: string; accent2: string; accent3: string };
  palette: string[];
}

export interface Theme<S extends ThemeScene = ThemeScene> extends ThemeMeta {
  wheel: WheelStyle;
  post: PostStyle;
  camera?: Partial<CameraStyle>;
  tick: TickStyle;
  /** Procedural fallback music, used until generated tracks exist. */
  song: ChipSong;
  /** Where the winner's character stands and how it arrives. */
  character?: { spot: THREE.Vector3Tuple; entrance: Entrance };
  /** No stand: the wheel bobs in zero-g. */
  floating?: boolean;
  createScene(ctx: SceneContext): S;
  /** Celebrations get the theme's own scene so they can drive its props. */
  celebrations(scene: S): Celebration[];
}
