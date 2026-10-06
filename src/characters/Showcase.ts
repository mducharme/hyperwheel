import * as THREE from 'three/webgpu';
import { float, pow, uniform, uv } from 'three/tsl';
import type { CharacterInstance } from './loader';
import type { Performer } from './Performer';

// Model loaders (glTF, Draco, meshopt, FBX) are a separate chunk, fetched on first use.
const runtime = () => Promise.all([import('./loader'), import('./Performer')]);

export type Entrance = 'beam' | 'pop' | 'rise' | 'teleport';

export interface ShowcaseStyle {
  /** Where the character stands (world). */
  spot: THREE.Vector3Tuple;
  entrance: Entrance;
  accent: string;
}

const TARGET_HEIGHT = 2.3;
const ENTER = 1.0;
const EXIT = 0.35;

const easeOutBack = (p: number) => 1 + 2.7 * Math.pow(p - 1, 3) + 1.7 * Math.pow(p - 1, 2);
const easeOutElastic = (p: number) =>
  p === 0 ? 0 : p === 1 ? 1 : Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;

/**
 * Presents the winner's character in front of the wheel: themed entrance,
 * celebration loop, exit. Characters are instantiated during the spin so the
 * reveal is instant.
 */
export class Showcase {
  readonly group = new THREE.Group();
  /** World point the camera should look at while a character is shown (null = none). */
  focus: THREE.Vector3 | null = null;
  current: { name: string; description: string } | null = null;

  private holder = new THREE.Group(); // entrance/exit transform
  private mover = new THREE.Group(); // performer root motion
  private instance: CharacterInstance | null = null;
  private performer: Performer | null = null;
  private pending: Promise<CharacterInstance | null> | null = null;
  private pendingId = '';
  private style: ShowcaseStyle = { spot: [0, 0.22, 1.6], entrance: 'beam', accent: '#ffffff' };
  private phase: 'idle' | 'enter' | 'show' | 'exit' = 'idle';
  private t = 0;
  private scale = 1;
  private pillar: THREE.Mesh;
  private uPillar = uniform(0);
  private uPillarColor = uniform(new THREE.Color());

  constructor(private onArrive: (at: THREE.Vector3, entrance: Entrance) => void) {
    this.group.add(this.holder);
    this.holder.add(this.mover);

    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    mat.colorNode = (this.uPillarColor as any).mul(pow(float(1).sub(uv().y), 1.5)).mul(this.uPillar).mul(2.5);
    this.pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.05, 9, 40, 1, true).translate(0, 4.5, 0), mat);
    this.pillar.visible = false;
    this.group.add(this.pillar);
  }

  setStyle(style: ShowcaseStyle) {
    this.style = style;
    this.uPillarColor.value.set(style.accent);
  }

  /** Start loading a character before it's needed (e.g. while the wheel spins). */
  preload(id: string) {
    if (this.pendingId === id && this.pending) return;
    this.pendingId = id;
    this.pending = runtime()
      .then(([loader]) => loader.instantiate(id))
      .catch((err) => {
      console.warn('character failed to load', id, err);
      return null;
    });
  }

  async present(id: string, name: string) {
    this.clear();
    this.preload(id);
    const inst = await this.pending;
    this.pending = null;
    this.pendingId = '';
    if (!inst) return false;

    this.instance = inst;
    this.scale = TARGET_HEIGHT / inst.height;
    inst.object.scale.multiplyScalar(this.scale);
    inst.object.position.y -= inst.minY * this.scale;
    this.mover.add(inst.object);
    const [, { Performer }] = await runtime();
    this.performer = new Performer(inst);
    this.current = { name, description: this.performer.description };

    const [x, y, z] = this.style.spot;
    this.group.position.set(x, y, z);
    this.focus = new THREE.Vector3(x, y + TARGET_HEIGHT * 0.55, z);
    this.phase = 'enter';
    this.t = 0;
    this.pillar.visible = this.style.entrance === 'beam' || this.style.entrance === 'teleport';
    this.applyEntrance(0);
    return true;
  }

  dismiss() {
    if (this.phase === 'enter' || this.phase === 'show') {
      this.phase = 'exit';
      this.t = 0;
    }
    this.focus = null;
  }

  private clear() {
    if (this.instance) this.mover.remove(this.instance.object);
    this.performer?.dispose();
    this.instance = null;
    this.performer = null;
    this.current = null;
    this.phase = 'idle';
    this.pillar.visible = false;
    this.uPillar.value = 0;
  }

  private applyEntrance(p: number) {
    const h = this.holder;
    h.position.set(0, 0, 0);
    h.rotation.set(0, 0, 0);
    h.scale.set(1, 1, 1);
    switch (this.style.entrance) {
      case 'beam': {
        const e = easeOutElastic(p);
        h.scale.set(0.6 + 0.4 * e, e, 0.6 + 0.4 * e);
        this.uPillar.value = p < 0.3 ? p / 0.3 : Math.max(0, 1 - (p - 0.3) / 0.7) * 0.8 + 0.2 * (1 - p);
        break;
      }
      case 'pop': {
        const e = easeOutElastic(p);
        h.scale.setScalar(Math.max(0.001, e));
        h.rotation.y = (1 - Math.min(1, p * 1.4)) * Math.PI * 2;
        break;
      }
      case 'rise':
        h.position.y = -TARGET_HEIGHT * 1.3 * (1 - easeOutBack(p));
        break;
      case 'teleport': {
        const e = easeOutBack(Math.min(1, p * 1.2));
        h.scale.set(Math.max(0.02, e), 1 + (1 - e) * 0.6, Math.max(0.02, e));
        this.uPillar.value = Math.max(0, 1 - p) * 1.2;
        break;
      }
    }
  }

  update(dt: number) {
    if (this.phase === 'idle') return;
    this.t += dt;
    this.performer?.update(dt);
    const m = this.performer?.motion;
    if (m) {
      this.mover.position.y = m.lift * TARGET_HEIGHT;
      this.mover.rotation.set(0, m.turn, m.lean);
    }

    if (this.phase === 'enter') {
      const p = Math.min(1, this.t / ENTER);
      this.applyEntrance(p);
      if (p >= 1) {
        this.phase = 'show';
        this.pillar.visible = false;
        this.onArrive(this.group.position.clone(), this.style.entrance);
      }
    } else if (this.phase === 'exit') {
      const p = Math.min(1, this.t / EXIT);
      const s = 1 - p * p;
      this.holder.scale.set(s, s * (1 + p * 0.4), s);
      if (p >= 1) this.clear();
    }
  }
}
