import * as THREE from 'three/webgpu';
import { CELEBRATORY, sharedDances, type CharacterInstance } from './loader';
import type { Part } from './rig';
import { debug, dgroup } from '../debug';

type V = [number, number, number];

/** A procedural routine: limb directions in model space (character faces +Z, its left is +X) plus root motion. */
interface Pose {
  limbs: Partial<Record<Part, V>>;
  /** Vertical hop, in body heights. */
  lift?: number;
  /** Spin around the vertical axis (radians). */
  turn?: number;
  /** Side lean (radians). */
  lean?: number;
}
type Routine = (t: number) => Pose;

const wave01 = (t: number, speed: number) => 0.5 + 0.5 * Math.sin(t * speed);
const mixV = (a: V, b: V, k: number): V => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

/** Code-driven celebrations that work on any humanoid mapping, whatever its rest pose. */
export const ROUTINES: Record<string, Routine> = {
  cheer(t) {
    const pump = wave01(t, 9);
    const up: V = [0.35, 1, 0.15];
    const out: V = [0.95, 0.45, 0.2];
    return {
      limbs: {
        leftUpperArm: mixV(up, out, pump * 0.5),
        leftLowerArm: up,
        rightUpperArm: mixV([-up[0], up[1], up[2]], [-out[0], out[1], out[2]], pump * 0.5),
        rightLowerArm: [-up[0], up[1], up[2]],
      },
      lift: Math.abs(Math.sin(t * 4.5)) * 0.08,
    };
  },
  jacks(t) {
    const p = wave01(t, 7);
    return {
      limbs: {
        leftUpperArm: mixV([0.3, -1, 0], [0.45, 1, 0], p),
        leftLowerArm: mixV([0.3, -1, 0], [0.3, 1, 0], p),
        rightUpperArm: mixV([-0.3, -1, 0], [-0.45, 1, 0], p),
        rightLowerArm: mixV([-0.3, -1, 0], [-0.3, 1, 0], p),
        leftUpperLeg: mixV([0.04, -1, 0], [0.38, -1, 0], p),
        rightUpperLeg: mixV([-0.04, -1, 0], [-0.38, -1, 0], p),
        leftLowerLeg: mixV([0.04, -1, 0], [0.38, -1, 0], p),
        rightLowerLeg: mixV([-0.04, -1, 0], [-0.38, -1, 0], p),
      },
      lift: Math.abs(Math.sin(t * 3.5)) * 0.07,
    };
  },
  wave(t) {
    const w = Math.sin(t * 10);
    return {
      limbs: {
        rightUpperArm: [-0.55, 0.9, 0.25],
        rightLowerArm: [-0.15 + w * 0.45, 1, 0.3],
        leftUpperArm: [0.55, -0.8, 0.1],
        leftLowerArm: [-0.3, -0.2, 0.6], // hand on hip
      },
      lean: Math.sin(t * 2.5) * 0.08,
      lift: Math.abs(Math.sin(t * 2.5)) * 0.02,
    };
  },
  spinHop(t) {
    const cycle = (t % 1.6) / 1.6;
    const jump = cycle < 0.5 ? Math.sin(cycle * 2 * Math.PI) : 0;
    const eased = cycle < 0.5 ? 0.5 - 0.5 * Math.cos(cycle * 2 * Math.PI) : 1;
    return {
      limbs: {
        leftUpperArm: [1, 0.35 + jump * 0.5, 0],
        leftLowerArm: [1, 0.5 + jump * 0.5, 0],
        rightUpperArm: [-1, 0.35 + jump * 0.5, 0],
        rightLowerArm: [-1, 0.5 + jump * 0.5, 0],
      },
      turn: (Math.floor(t / 1.6) + eased) * Math.PI * 2,
      lift: Math.max(0, jump) * 0.22,
    };
  },
  dab(t) {
    const cycle = t % 2;
    const k = cycle < 0.25 ? cycle / 0.25 : cycle < 1.4 ? 1 : cycle < 1.65 ? 1 - (cycle - 1.4) / 0.25 : 0;
    const rest: V = [0.15, -1, 0.1];
    return {
      limbs: {
        leftUpperArm: mixV(rest, [0.9, 0.55, 0.15], k),
        leftLowerArm: mixV(rest, [0.9, 0.6, 0.15], k),
        rightUpperArm: mixV([-0.15, -1, 0.1], [0.35, 0.25, 0.9], k),
        rightLowerArm: mixV([-0.15, -1, 0.1], [0.95, 0.5, 0.2], k),
      },
      lean: k * 0.12,
      lift: k > 0 && k < 1 ? 0.03 : 0,
    };
  },
};

/** Aim limbs for children-less nodes (e.g. Kenney's block arms hang straight down at rest). */
const DOWN = new THREE.Vector3(0, -1, 0);
const LIMB_CHILD: Partial<Record<Part, Part>> = {
  leftUpperArm: 'leftLowerArm',
  leftLowerArm: 'leftHand',
  rightUpperArm: 'rightLowerArm',
  rightLowerArm: 'rightHand',
  leftUpperLeg: 'leftLowerLeg',
  leftLowerLeg: 'leftFoot',
  rightUpperLeg: 'rightLowerLeg',
  rightLowerLeg: 'rightFoot',
};
const ORDER: Part[] = [
  'leftUpperArm',
  'leftLowerArm',
  'rightUpperArm',
  'rightLowerArm',
  'leftUpperLeg',
  'leftLowerLeg',
  'rightUpperLeg',
  'rightLowerLeg',
];

interface BoneRest {
  bone: THREE.Object3D;
  local: THREE.Quaternion;
  /** Rest orientation relative to the model root. */
  model: THREE.Quaternion;
  /** Rest pointing direction relative to the model root. */
  dir: THREE.Vector3;
}

/**
 * Makes a character celebrate: its own dance clips first, then dances borrowed
 * from other Mixamo characters, otherwise a procedural routine.
 */
export class Performer {
  /** Root motion for the showcase to apply: hop height (body heights), turn and lean. */
  readonly motion = { lift: 0, turn: 0, lean: 0 };
  readonly description: string;
  private mixer: THREE.AnimationMixer;
  private routine: Routine | null = null;
  private rest = new Map<Part, BoneRest>();
  private t = 0;
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();

  constructor(
    private c: CharacterInstance,
    /** Entry name, for the debug log. */
    label = '',
  ) {
    this.mixer = new THREE.AnimationMixer(c.object);
    this.captureRest();

    const own = c.celebrations
      ? c.clips.filter((clip) => c.celebrations!.includes(clip.name))
      : c.clips.filter((clip) => CELEBRATORY.test(clip.name));
    const pool = [...own, ...sharedDances(c)];
    // real dances win most of the time; simple emotes/jumps share the stage with procedural routines
    const dancey = pool.some((clip) => /danc|salsa|flair|twerk|samba|step|groove|hip.?hop/i.test(clip.name));
    const clipChance = !c.rig.humanoid ? 1 : dancey ? 0.8 : 0.45;
    const useClip = pool.length > 0 && Math.random() < clipChance;
    let chosen: THREE.AnimationClip | null = null;
    if (useClip) {
      const clip = (chosen = pool[Math.floor(Math.random() * pool.length)]);
      this.mixer.clipAction(clip).reset().fadeIn(0.2).play();
      this.description = clip.name;
      // a little extra bounce on clips that don't move much (e.g. short emotes)
      if (c.rig.family === 'kenney') this.routine = (t) => ({ limbs: {}, lift: Math.abs(Math.sin(t * 4)) * 0.06 });
    } else if (c.rig.humanoid) {
      const names = Object.keys(ROUTINES);
      const name = names[Math.floor(Math.random() * names.length)];
      this.routine = ROUTINES[name];
      this.description = name;
    } else {
      // not a recognisable humanoid: squash-and-stretch hop
      this.routine = (t) => ({ limbs: {}, lift: Math.abs(Math.sin(t * 5)) * 0.15, turn: Math.sin(t * 2) * 0.4 });
      this.description = 'bounce';
    }
    if (debug.enabled) this.report(label, own, pool.length - own.length, clipChance, chosen);
  }

  /** Debug mode: explain what this character can do and why it's doing what it does. */
  private report(label: string, own: THREE.AnimationClip[], borrowed: number, clipChance: number, chosen: THREE.AnimationClip | null) {
    const c = this.c;
    // how many of a clip's tracks find a node to animate in this model
    const binding = (clip: THREE.AnimationClip) => {
      const missing = new Set<string>();
      let bound = 0;
      for (const track of clip.tracks) {
        const { nodeName } = THREE.PropertyBinding.parseTrackName(track.name);
        if (THREE.PropertyBinding.findNode(c.object, nodeName)) bound++;
        else missing.add(nodeName);
      }
      return { bound, total: clip.tracks.length, missing: [...missing] };
    };
    const kind = chosen ? (own.includes(chosen) ? 'its own clip' : 'a dance borrowed from another character') : this.description === 'bounce' ? 'a generic bounce' : 'a procedural routine';
    dgroup('🕺 character', `${label ? `“${label}”: ` : ''}${c.id} → ${this.description} (${kind})`, (log) => {
      let skinned = 0;
      c.object.traverse((o) => void ((o as THREE.SkinnedMesh).isSkinnedMesh && skinned++));
      log(`rig: ${c.rig.family}, ${c.rig.humanoid ? 'humanoid' : 'NOT recognised as humanoid'}; ${skinned} skinned mesh(es)`);

      const parts = Object.entries(c.rig.bones);
      const all: Part[] = ['hips', 'spine', 'chest', 'neck', 'head', 'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightUpperArm', 'rightLowerArm', 'rightHand', 'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot'];
      console.table(Object.fromEntries(all.map((p) => { const b = c.rig.bones[p]; return [p, { node: b?.name ?? '✗ not found', bone: b ? ((b as THREE.Bone).isBone ? 'yes' : 'no (plain node)') : '' }]; })));
      if (parts.length < 6) log('⚠️ few body parts were recognised from the bone names, so procedural routines have little to move');

      if (!c.clips.length) log('clips in the file: none');
      else {
        log(`clips in the file (${c.clips.length}):`);
        console.table(c.clips.map((clip) => { const b = binding(clip); return { name: clip.name, seconds: +clip.duration.toFixed(2), tracks: clip.tracks.length, connected: `${b.bound}/${b.total}`, celebration: own.includes(clip) ? 'yes' : '' }; }));
      }
      log(
        c.celebrations
          ? `celebration clips come from the pack's list: ${c.celebrations.join(', ')}`
          : `celebration clips = clips whose name matches ${CELEBRATORY} → ${own.length ? own.map((x) => x.name).join(', ') : 'none'}`,
      );
      log(`borrowed dances: ${borrowed}${c.rig.family !== 'mixamo' ? ' (only Mixamo-style rigs can borrow dances)' : ''}`);
      log(`choice: ${own.length + borrowed ? `${Math.round(clipChance * 100)}% chance of a clip, otherwise a procedural routine` : 'no usable clips, so a procedural routine'}`);

      if (chosen) {
        const b = binding(chosen);
        log(`playing “${chosen.name}” (${chosen.duration.toFixed(1)}s): ${b.bound}/${b.total} tracks connect to this model`);
        if (b.bound === 0) log(`⚠️ nothing will move: none of the clip's target names exist in the model (e.g. ${b.missing.slice(0, 4).join(', ')})`);
        else if (b.bound < b.total) log(`⚠️ partly connected; missing targets: ${b.missing.slice(0, 8).join(', ')}${b.missing.length > 8 ? '…' : ''}`);
        if (chosen.duration < 0.05) log('⚠️ the clip is (nearly) zero seconds long');
      } else if (this.routine) {
        const used = Object.keys(this.routine(0.5).limbs) as Part[];
        const unmapped = used.filter((p) => !this.rest.has(p));
        log(`routine moves: ${used.join(', ') || 'only the whole body (hop/turn)'}`);
        if (unmapped.length) log(`⚠️ these parts weren't found, so they won't move: ${unmapped.join(', ')}`);
      }
    });
  }

  private captureRest() {
    const root = this.c.object;
    root.updateMatrixWorld(true);
    const rootInv = root.getWorldQuaternion(new THREE.Quaternion()).invert();
    const bones = this.c.rig.bones;
    for (const part of ORDER) {
      const bone = bones[part];
      if (!bone) continue;
      const model = rootInv.clone().multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
      const childPart = LIMB_CHILD[part];
      const child = (childPart && bones[childPart]) || bone.children.find((ch) => (ch as THREE.Bone).isBone);
      let dir = DOWN.clone();
      if (child) {
        const a = bone.getWorldPosition(new THREE.Vector3());
        const b = child.getWorldPosition(new THREE.Vector3());
        if (b.distanceToSquared(a) > 1e-8) dir = b.sub(a).applyQuaternion(rootInv).normalize();
      }
      this.rest.set(part, { bone, local: bone.quaternion.clone(), model, dir });
    }
  }

  /** Rotate a bone so its rest direction points at `target` (model space). */
  private aim(r: BoneRest, target: V, rootInv: THREE.Quaternion) {
    this.v.set(...target).normalize();
    const desired = this.q.setFromUnitVectors(r.dir, this.v).multiply(r.model);
    const parent = r.bone.parent!;
    const parentModel = rootInv.clone().multiply(parent.getWorldQuaternion(new THREE.Quaternion()));
    r.bone.quaternion.copy(parentModel.invert().multiply(desired));
    r.bone.updateMatrixWorld(true);
  }

  update(dt: number) {
    this.t += dt;
    this.mixer.update(dt);
    if (!this.routine) return;
    const pose = this.routine(this.t);
    this.motion.lift = pose.lift ?? 0;
    this.motion.turn = pose.turn ?? 0;
    this.motion.lean = pose.lean ?? 0;
    if (!Object.keys(pose.limbs).length) return;

    const root = this.c.object;
    root.updateMatrixWorld(true);
    const rootInv = root.getWorldQuaternion(new THREE.Quaternion()).invert();
    for (const r of this.rest.values()) r.bone.quaternion.copy(r.local);
    root.updateMatrixWorld(true);
    for (const part of ORDER) {
      const target = pose.limbs[part];
      const r = this.rest.get(part);
      if (target && r) this.aim(r, target, rootInv);
    }
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.c.object);
  }
}
