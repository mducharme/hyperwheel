import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { builtin } from './catalog';
import { assetUrl, getAsset } from '../library/assets';
import { canonicalBoneName, mapRig, type Rig, type RigFamily } from './rig';

export interface CharacterTemplate {
  id: string;
  scene: THREE.Object3D;
  clips: THREE.AnimationClip[];
  family: RigFamily;
  humanoid: boolean;
}

export interface CharacterInstance {
  id: string;
  object: THREE.Object3D;
  clips: THREE.AnimationClip[];
  rig: Rig;
  /** Unscaled height of the model in its rest pose. */
  height: number;
  /** Lowest point, so feet can be placed on the ground. */
  minY: number;
}

/** Animations worth celebrating with, by name. */
export const CELEBRATORY = /danc|salsa|flair|twerk|samba|hip.?hop|celebrat|victor|cheer|win|step|emote.?yes|wave|jump|clap|happy|fist|party|groove/i;

const draco = new DRACOLoader().setDecoderPath(`${import.meta.env.BASE_URL}draco/`);
const gltfLoader = new GLTFLoader().setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder);
const fbxLoader = new FBXLoader();

const templates = new Map<string, Promise<CharacterTemplate>>();

/**
 * Celebration clips seen this session from Mixamo-family rigs, keyed by their
 * canonical (prefix-free) bone names, so any Mixamo character can borrow
 * another's dance moves.
 */
const danceLibrary = new Map<string, THREE.AnimationClip>();

function register(t: CharacterTemplate) {
  if (t.family !== 'mixamo') return;
  for (const clip of t.clips) {
    if (!CELEBRATORY.test(clip.name)) continue;
    const key = `${t.id}:${clip.name}`;
    if (danceLibrary.has(key)) continue;
    const portable = clip.clone();
    // keep rotations only: positions (root motion, bone lengths) don't transfer between bodies
    portable.tracks = portable.tracks
      .filter((tr) => tr.name.endsWith('.quaternion'))
      .map((tr) => {
        const copy = tr.clone();
        copy.name = canonicalBoneName(tr.name);
        return copy;
      });
    danceLibrary.set(key, portable);
  }
}

/** Borrowed dances for a Mixamo character, renamed to its own bone prefix. */
export function sharedDances(instance: CharacterInstance): THREE.AnimationClip[] {
  if (instance.rig.family !== 'mixamo') return [];
  const hips = instance.rig.bones.hips?.name ?? '';
  const prefix = hips.slice(0, hips.length - canonicalBoneName(hips).length);
  const own = new Set(instance.clips.map((c) => c.name));
  return [...danceLibrary.entries()]
    .filter(([key, clip]) => !key.startsWith(`${instance.id}:`) && !own.has(clip.name))
    .map(([, clip]) => {
      const c = clip.clone();
      c.tracks = c.tracks.map((tr) => {
        const copy = tr.clone();
        copy.name = prefix + tr.name;
        return copy;
      });
      return c;
    });
}

async function sourceFor(id: string): Promise<{ url: string; fbx: boolean }> {
  const b = builtin(id);
  if (b) return { url: b.url, fbx: false };
  const [url, asset] = await Promise.all([assetUrl(id), getAsset(id)]);
  if (!url || !asset) throw new Error('Character file not found in this browser.');
  return { url, fbx: /\.fbx$/i.test(asset.name) };
}

async function loadTemplate(id: string): Promise<CharacterTemplate> {
  const { url, fbx } = await sourceFor(id);
  let scene: THREE.Object3D;
  let clips: THREE.AnimationClip[];
  if (fbx) {
    const group = await fbxLoader.loadAsync(url);
    scene = group;
    clips = group.animations;
  } else {
    const gltf = await gltfLoader.loadAsync(url);
    scene = gltf.scene;
    clips = gltf.animations;
  }
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.frustumCulled = false; // skinned bounds don't follow the animation
      m.castShadow = true;
    }
  });
  const rig = mapRig(scene);
  const t: CharacterTemplate = { id, scene, clips, family: rig.family, humanoid: rig.humanoid };
  register(t);
  return t;
}

export function loadTemplateCached(id: string) {
  let p = templates.get(id);
  if (!p) {
    p = loadTemplate(id);
    templates.set(id, p);
    p.catch(() => templates.delete(id));
  }
  return p;
}

/** A fresh, independently animatable copy of a character. */
export async function instantiate(id: string): Promise<CharacterInstance> {
  const t = await loadTemplateCached(id);
  const object = cloneSkinned(t.scene);
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object, true);
  const size = box.getSize(new THREE.Vector3());
  return { id, object, clips: t.clips, rig: mapRig(object), height: Math.max(0.01, size.y), minY: box.min.y };
}

/** Validate an uploaded file by actually loading it. Returns a short report. */
export async function inspect(id: string) {
  const t = await loadTemplateCached(id);
  const dances = t.clips.filter((c) => CELEBRATORY.test(c.name)).map((c) => c.name);
  return { family: t.family, humanoid: t.humanoid, clips: t.clips.map((c) => c.name), dances };
}
