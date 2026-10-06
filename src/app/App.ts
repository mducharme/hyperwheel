import * as THREE from 'three/webgpu';
import { Stage } from '../engine/Stage';
import { CameraRig, type Insets } from '../engine/CameraRig';
import { Spin, segmentAtPointer } from '../engine/physics';
import { uSpeed, uWin } from '../engine/globals';
import { Wheel, WHEEL_RADIUS } from '../wheel/Wheel';
import { Pointer } from '../wheel/Pointer';
import { AudioBus } from '../audio/AudioBus';
import { Sfx } from '../audio/Sfx';
import { Music } from '../audio/Music';
import { FxDirector } from '../fx/FxDirector';
import { Stunts } from '../fx/Stunts';
import { disposeDeep } from '../themes/shared';
import { MUSIC } from '../themes';
import type { Theme, ThemeScene } from '../themes/types';
import { DragSpin } from './DragSpin';
import { Showcase } from '../characters/Showcase';
import { defaultCharacterFor } from '../characters/catalog';
import type { Entry } from '../library/wheels';

export const WHEEL_CENTER = new THREE.Vector3(0, 3.9, 0);
const DEFAULT_CAMERA = { height: 0.9, look: 0.15, frame: 8.6 };

export interface AppEvents {
  onSpinStart(): void;
  /** Fired when the wheel stops. `celebration` is the name of the animation playing. */
  onResult(name: string, index: number, celebration: string): void;
  /** The winner's character finished loading and is on stage (or failed: null). */
  onCharacter?(info: { name: string; description: string } | null): void;
  onFps(fps: number): void;
}

/**
 * Owns the 3D world, physics and audio, and runs the frame loop. Knows nothing
 * about the DOM panel — the UI talks to it through methods and `AppEvents`.
 */
export class App {
  readonly stage: Stage;
  readonly wheel = new Wheel();
  readonly spin = new Spin();
  readonly bus = new AudioBus();
  readonly sfx = new Sfx(this.bus);
  readonly music = new Music(this.bus);
  readonly cam: CameraRig;
  readonly stunts: Stunts;
  private pointer: Pointer;
  private drag!: DragSpin;

  theme!: Theme<any>;
  private world: ThemeScene | null = null;
  private fx: FxDirector | null = null;
  private celebrations: { name: string; play: () => void }[] = [];
  private lastCelebration = -1;

  entries: Entry[] = [];
  duration = 8;
  /** Show the winner's 3D character. */
  charactersEnabled = true;
  readonly showcase: Showcase;
  private thumbRequests: ((url: string | null) => void)[] = [];
  /** Blocks spins (e.g. while the winner dialog is open). */
  locked = false;
  insets: () => Insets = () => ({ x: 0, y: 0 });

  private elapsed = 0;
  private last = performance.now();
  private winAt = -1;
  private fps = { acc: 0, frames: 0 };

  constructor(
    private canvas: HTMLCanvasElement,
    private events: AppEvents,
  ) {
    this.stage = new Stage(canvas);
    this.cam = new CameraRig(this.stage.camera, WHEEL_CENTER);
    this.stunts = new Stunts(this.wheel.root, WHEEL_CENTER);
    this.pointer = new Pointer(this.wheel.flapper, (speed) => this.sfx.tick(speed));
    this.wheel.root.position.copy(WHEEL_CENTER);
    this.showcase = new Showcase((at, entrance) => {
      this.stage.triggerFlash(this.theme.ui.accent, 0.25, 0.4);
      this.stage.triggerRipple(at.clone().setY(at.y + 1), 0.6, 0.9);
      if (entrance === 'pop' || entrance === 'rise') this.sfx.pop(0, 1.2);
      else this.sfx.boom(0, 1.5);
    });
  }

  get names() {
    return this.entries.map((e) => e.name);
  }

  /** The character an entry is shown as: its own, or a stable random built-in. */
  characterFor(entry: Entry) {
    return entry.character ?? defaultCharacterFor(entry.name);
  }

  /** Resolve with a small JPEG of the next rendered frame. */
  captureThumbnail(): Promise<string | null> {
    return new Promise((resolve) => this.thumbRequests.push(resolve));
  }

  private grabThumbnail() {
    const requests = this.thumbRequests;
    this.thumbRequests = [];
    let url: string | null = null;
    try {
      const c = document.createElement('canvas');
      c.width = 240;
      c.height = 150;
      const src = this.canvas;
      // crop the area the wheel occupies (left of the panel on desktop)
      const w = Math.min(src.width, src.height * 1.6);
      const x = Math.max(0, (src.width - (innerWidth > 760 ? 380 * devicePixelRatio : 0) - w) / 2);
      c.getContext('2d')!.drawImage(src, x, 0, w, src.height, 0, 0, c.width, c.height);
      url = c.toDataURL('image/jpeg', 0.7);
    } catch {
      url = null;
    }
    requests.forEach((r) => r(url));
  }

  async init() {
    await this.stage.init();
    this.stage.scene.add(this.wheel.root);
    this.stage.scene.add(this.showcase.group);
    this.drag = new DragSpin({
      canvas: this.canvas,
      camera: this.stage.camera,
      center: () => this.wheel.root.position,
      radius: WHEEL_RADIUS + 0.5,
      canDrag: () => {
        this.bus.unlock();
        return this.canSpin;
      },
      turn: (d) => (this.spin.angle += d),
      fling: (dir, strength) => this.startSpin(dir, strength),
      tap: () => this.startSpin(),
    });
    this.canvas.addEventListener('pointermove', (e) => {
      this.cam.pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    });
    window.addEventListener('resize', () => this.stage.resize(innerWidth, innerHeight));
    this.stage.resize(innerWidth, innerHeight);
  }

  start() {
    this.stage.renderer.setAnimationLoop(() => this.frame());
  }

  get canSpin() {
    return !this.spin.spinning && !this.locked && this.names.length > 0;
  }

  setEntries(entries: Entry[]) {
    this.entries = entries;
    this.wheel.setEntries(this.names);
  }

  /** Send the character off stage (winner dialog closed). */
  dismissCharacter() {
    this.showcase.dismiss();
  }

  // ------------------------------------------------------------------ themes

  async setTheme(theme: Theme<any>) {
    const first = !this.theme;
    this.theme = theme;
    const { scene, renderer, camera } = this.stage;

    // tear down the previous world and its effects
    this.fx?.dispose();
    if (this.world) {
      scene.remove(this.world.group);
      this.world.dispose?.();
      disposeDeep(this.world.group);
    }
    scene.backgroundNode = null;
    scene.fogNode = null;
    this.stunts.clear();

    try {
      const w = theme.wheel;
      await document.fonts.load(`${w.fontWeight ?? 700} 64px ${w.font}`);
    } catch {
      /* fall back to the default font */
    }

    const world = theme.createScene({ scene, renderer, camera, center: WHEEL_CENTER });
    this.world = world;
    scene.add(world.group);
    this.wheel.setStyle(theme.wheel);
    this.stage.setPost(theme.post);
    this.cam.style = { ...DEFAULT_CAMERA, ...theme.camera };
    this.stunts.floating = !!theme.floating;
    this.sfx.tickStyle = theme.tick;
    this.music.setTheme(theme.id, MUSIC[theme.id], theme.song);
    this.showcase.setStyle({
      spot: theme.character?.spot ?? [0, 0.22, 1.6],
      entrance: theme.character?.entrance ?? 'beam',
      accent: theme.ui.accent,
    });

    this.fx = new FxDirector(scene, this.stage, this.cam, this.stunts, this.sfx, WHEEL_CENTER);
    this.fx.time = this.elapsed;
    this.celebrations = theme.celebrations(world).map((c) => ({ name: c.name, play: c.setup(this.fx!) }));
    this.lastCelebration = -1;

    // Compile new shaders up front rather than stuttering on the first win.
    // It's only an optimisation, so never let it block the scene for long.
    try {
      await Promise.race([renderer.compileAsync(scene, camera), new Promise((r) => setTimeout(r, 2500))]);
    } catch (err) {
      console.warn('precompile failed', err);
    }
    if (!first) {
      this.stage.triggerFlash(theme.ui.accent, 0.6, 0.6);
      this.stage.triggerRipple(WHEEL_CENTER, 1.2, 1.2);
    }
  }

  /** Play a specific celebration by index (or a random one). Returns its name. */
  celebrate(index?: number) {
    if (!this.fx || !this.celebrations.length) return '';
    let i = index ?? Math.floor(Math.random() * this.celebrations.length);
    if (index === undefined && this.celebrations.length > 1 && i === this.lastCelebration) {
      i = (i + 1) % this.celebrations.length;
    }
    this.lastCelebration = i;
    const c = this.celebrations[i];
    c.play();
    return c.name;
  }

  get celebrationNames() {
    return this.celebrations.map((c) => c.name);
  }

  // ------------------------------------------------------------------ spin flow

  startSpin(direction = -1, strength = 1) {
    if (!this.canSpin) return;
    this.bus.unlock();
    this.spin.launch(this.duration, direction, strength);
    // the result is decided at launch, so the winner's character can load during the spin
    if (this.charactersEnabled) {
      const winner = this.entries[segmentAtPointer(this.spin.target, this.entries.length)];
      if (winner) this.showcase.preload(this.characterFor(winner));
    }
    this.sfx.whoosh();
    this.music.startSpin();
    this.winAt = -1;
    this.events.onSpinStart();
  }

  private onSpinEnd() {
    const index = segmentAtPointer(this.spin.angle, this.names.length);
    this.winAt = this.elapsed;
    if (!this.music.win()) this.sfx.fanfare();
    const celebration = this.celebrate();
    const entry = this.entries[index];
    this.events.onResult(entry.name, index, celebration);
    if (this.charactersEnabled) {
      void this.showcase.present(this.characterFor(entry), entry.name).then((ok) => {
        this.events.onCharacter?.(ok ? this.showcase.current : null);
      });
    }
  }

  // ------------------------------------------------------------------ frame

  private frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.elapsed += dt;

    if (this.spin.spinning && this.spin.remaining < 1.1) this.music.windDown(this.spin.remaining + 0.1);
    if (this.spin.update(dt)) this.onSpinEnd();

    const omega = this.drag?.dragging ? this.drag.velocity : this.spin.velocity;
    const speed = Math.abs(omega);
    const win = this.winAt >= 0 ? Math.max(0, 1 - (this.elapsed - this.winAt) / 3.2) : 0;

    this.wheel.spinner.rotation.z = this.spin.angle;
    if (this.names.length) this.wheel.uActive.value = segmentAtPointer(this.spin.angle, this.names.length);
    this.pointer.update(dt, this.spin.angle, omega, this.wheel.pegSpacing);

    uSpeed.value = speed;
    uWin.value = win;
    this.wheel.uSpeed.value = speed;
    this.wheel.uWin.value = win;
    this.wheel.uChase.value += dt * (0.6 + speed * 0.6);

    this.stunts.update(dt, this.elapsed);
    this.showcase.update(dt);
    this.cam.focus = this.showcase.focus;
    this.world?.update({ time: this.elapsed, dt, speed, win, spinning: this.spin.spinning });
    this.fx?.update(dt, this.elapsed);
    this.stage.update(dt, speed, win);
    this.cam.update(dt, this.elapsed, speed, win, this.insets());
    this.stage.render();
    if (this.thumbRequests.length) this.grabThumbnail();

    this.fps.acc += dt;
    this.fps.frames++;
    if (this.fps.acc > 0.5) {
      this.events.onFps(Math.round(this.fps.frames / this.fps.acc));
      this.fps.acc = 0;
      this.fps.frames = 0;
    }
  }
}
