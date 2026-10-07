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
import { defaultCharacterFor, isKnownCharacter } from '../characters/catalog';
import type { Entry } from '../library/wheels';

/** Frame rate while nothing is happening. */
const IDLE_FPS = 30;

export const WHEEL_CENTER = new THREE.Vector3(0, 3.9, 0);
const DEFAULT_CAMERA = { height: 0.9, look: 0.15, frame: 8.6 };

interface StagedTheme {
  theme: Theme<any>;
  /** Off-screen scene the world was built in (holds its background, fog, environment). */
  staging: THREE.Scene;
  world: ThemeScene;
  fx: FxDirector;
  celebrations: { name: string; play: () => void }[];
}

export interface AppEvents {
  onSpinStart(): void;
  /** Fired when the wheel stops. `celebration` is the name of the animation playing. */
  onResult(name: string, index: number, celebration: string): void;
  /** The winner's character finished loading and is on stage (or failed: null). */
  onCharacter?(info: { name: string; description: string } | null): void;
  /** Measured frame rate, or null while idle (throttled on purpose). */
  onFps(fps: number | null): void;
  /** The first frame has been drawn. */
  onFirstFrame?(): void;
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
  readonly music = new Music(this.bus, MUSIC);
  readonly cam: CameraRig;
  readonly stunts: Stunts;
  private pointer: Pointer;
  private drag!: DragSpin;

  theme!: Theme<any>;
  private world: ThemeScene | null = null;
  private fx: FxDirector | null = null;
  private celebrations: { name: string; play: () => void }[] = [];
  /** A scene being prepared in the background. */
  private staged: { id: string; promise: Promise<StagedTheme> } | null = null;
  private themeRequest = '';
  private pendingSwap: { staged: StagedTheme; done: () => void } | null = null;
  private cover: HTMLCanvasElement | null = null;
  private coverFrames = -1;
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
  private firstFrame = false;
  /** Full frame rate until this time (elapsed seconds); idle scenes drop to IDLE_FPS. */
  private activeUntil = 0;
  private lastRender = 0;

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
    return entry.character && isKnownCharacter(entry.character) ? entry.character : defaultCharacterFor(entry.name);
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
      this.wake(1);
    });
    // any interaction restores the full frame rate at once
    for (const type of ['pointerdown', 'keydown', 'wheel'] as const) window.addEventListener(type, () => this.wake(2), { passive: true });
    window.addEventListener('resize', () => this.stage.resize(innerWidth, innerHeight));
    this.stage.resize(innerWidth, innerHeight);
  }

  start() {
    this.stage.renderer.setAnimationLoop(() => this.frame());
  }

  /** Run at full frame rate for at least `seconds` (spins, celebrations and input call this). */
  wake(seconds: number) {
    this.activeUntil = Math.max(this.activeUntil, this.elapsed + seconds);
  }

  private get idle() {
    return !this.spin.spinning && !this.drag?.dragging && !this.pendingSwap && this.coverFrames < 0 && this.elapsed >= this.activeUntil;
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

  /**
   * Switch scenes. The new world is built and its shaders compiled off-screen
   * first (see `stageTheme`), then swapped in within a single frame — so the
   * old scene stays on screen until the new one is ready (no black frames).
   */
  async setTheme(theme: Theme<any>) {
    const pending = this.staged;
    this.staged = null;
    let staged: Promise<StagedTheme>;
    if (pending?.id === theme.id) staged = pending.promise;
    else {
      void pending?.promise.then((s) => this.discard(s)); // prepared a different scene: free it
      staged = this.stageTheme(theme);
    }
    // quick successive switches: only the latest request may go live
    const request = (this.themeRequest = theme.id);
    const s = await staged;
    if (request !== this.themeRequest) return this.discard(s);
    await this.swap(s);
  }

  /**
   * Go live with a staged scene. The first frame of a new scene still builds
   * its render passes (mirror floors, post effects), which can take a few
   * hundred ms — so the swap happens under a snapshot of the last frame that
   * then cross-fades away, hiding the hitch.
   */
  private swap(s: StagedTheme): Promise<void> {
    if (!this.theme) {
      this.activate(s);
      return Promise.resolve();
    }
    this.pendingSwap?.done(); // superseded
    return new Promise((done) => (this.pendingSwap = { staged: s, done }));
  }

  /** Runs right after a frame was drawn: cover the canvas with that frame, then swap underneath. */
  private runPendingSwap() {
    const { staged, done } = this.pendingSwap!;
    this.pendingSwap = null;
    const cover = (this.cover ??= Object.assign(document.createElement('canvas'), { className: 'scene-cover' }));
    cover.width = this.canvas.width;
    cover.height = this.canvas.height;
    cover.style.transition = 'none';
    cover.style.opacity = '1';
    try {
      cover.getContext('2d')!.drawImage(this.canvas, 0, 0);
      this.canvas.after(cover);
      this.coverFrames = 0;
    } catch {
      /* can't snapshot: plain cut */
    }
    this.activate(staged);
    done();
  }

  /** Fade the snapshot out once the (possibly slow) first frame of the new scene is done. */
  private fadeCover() {
    const cover = this.cover;
    if (!cover?.isConnected || this.coverFrames < 0) return;
    if (++this.coverFrames < 2) return;
    this.coverFrames = -1;
    cover.style.transition = 'opacity 0.5s ease';
    cover.style.opacity = '0';
    cover.addEventListener('transitionend', () => cover.remove(), { once: true });
  }

  /**
   * Start preparing a scene in the background (e.g. the next one while the
   * wheel spins) so switching to it later is instant.
   */
  prepareTheme(theme: Theme<any>) {
    if (this.staged?.id === theme.id || this.theme?.id === theme.id) return;
    this.staged?.promise.then((s) => this.discard(s));
    this.staged = { id: theme.id, promise: this.stageTheme(theme) };
  }

  private async stageTheme(theme: Theme<any>): Promise<StagedTheme> {
    const { renderer, camera } = this.stage;
    try {
      const w = theme.wheel;
      await document.fonts.load(`${w.fontWeight ?? 700} 64px ${w.font}`);
    } catch {
      /* fall back to the default font */
    }
    // a private scene: themes set background/fog/environment on it, not on the live one
    const staging = new THREE.Scene();
    staging.environment = this.stage.scene.environment;
    const world = theme.createScene({ scene: staging, renderer, camera, center: WHEEL_CENTER });
    staging.add(world.group);
    const fx = new FxDirector(staging, this.stage, this.cam, this.stunts, this.sfx, WHEEL_CENTER);
    const celebrations = theme.celebrations(world).map((c) => ({ name: c.name, play: c.setup(fx) }));

    // Compile the new shaders without blocking rendering. It's only a warm-up,
    // so never wait on it for long.
    try {
      await Promise.race([this.stage.compileForPass(staging), new Promise((r) => setTimeout(r, 4000))]);
    } catch (err) {
      console.warn('precompile failed', err);
    }
    return { theme, staging, world, fx, celebrations };
  }

  /** Throw away a staged scene that won't be shown. */
  private discard(s: StagedTheme) {
    if (s.world === this.world) return;
    s.fx.dispose();
    s.world.dispose?.();
    disposeDeep(s.world.group);
  }

  /** Swap a staged scene in — synchronous, so it happens between two frames. */
  private activate(s: StagedTheme) {
    const first = !this.theme;
    const { scene } = this.stage;
    const theme = s.theme;

    this.fx?.dispose();
    if (this.world) {
      scene.remove(this.world.group);
      this.world.dispose?.();
      disposeDeep(this.world.group);
    }
    this.stunts.clear();

    this.theme = theme;
    this.world = s.world;
    scene.backgroundNode = s.staging.backgroundNode;
    scene.fogNode = s.staging.fogNode;
    scene.environmentIntensity = s.staging.environmentIntensity;
    scene.add(s.world.group);
    s.fx.moveTo(scene);
    s.fx.time = this.elapsed;
    this.fx = s.fx;
    this.celebrations = s.celebrations;
    this.lastCelebration = -1;

    this.wheel.setStyle(theme.wheel);
    this.stage.setPost(theme.post);
    this.cam.style = { ...DEFAULT_CAMERA, ...theme.camera };
    this.stunts.floating = !!theme.floating;
    this.sfx.tickStyle = theme.tick;
    this.music.setTheme(theme.id, theme.song);
    this.showcase.setStyle({
      spot: theme.character?.spot ?? [0, 0.22, 1.6],
      entrance: theme.character?.entrance ?? 'beam',
      accent: theme.ui.accent,
    });
    performance.mark('hw:theme-built');

    if (!first) this.stage.triggerRipple(WHEEL_CENTER, 1.2, 1.2);
    this.wake(2); // crossfade + ripple
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
    this.wake(7);
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
        if (ok) this.wake(8); // entrance + first dance at full rate
        this.events.onCharacter?.(ok ? this.showcase.current : null);
      });
    }
  }

  // ------------------------------------------------------------------ frame

  private frame() {
    const now = performance.now();
    // Idle (nothing spinning, celebrating or being touched): skip display frames down to
    // ~30 fps to save GPU time and battery. The small slack keeps 60 Hz screens at every
    // second frame and 120 Hz at every fourth instead of jittering.
    if (this.firstFrame && this.idle && now - this.lastRender < 1000 / IDLE_FPS - 4) return;
    this.lastRender = now;
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
    if (this.pendingSwap) this.runPendingSwap();
    else this.fadeCover();
    if (!this.firstFrame) {
      this.firstFrame = true;
      performance.mark('hw:first-frame');
      this.events.onFirstFrame?.();
    }
    if (this.thumbRequests.length) this.grabThumbnail();

    this.fps.acc += dt;
    this.fps.frames++;
    if (this.fps.acc > 0.5) {
      this.events.onFps(this.idle ? null : Math.round(this.fps.frames / this.fps.acc));
      this.fps.acc = 0;
      this.fps.frames = 0;
    }
  }
}
