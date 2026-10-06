import * as THREE from 'three/webgpu';

/** Canonical humanoid parts every animation in the app talks to. */
export type Part =
  | 'hips'
  | 'spine'
  | 'chest'
  | 'neck'
  | 'head'
  | 'leftUpperArm'
  | 'leftLowerArm'
  | 'leftHand'
  | 'rightUpperArm'
  | 'rightLowerArm'
  | 'rightHand'
  | 'leftUpperLeg'
  | 'leftLowerLeg'
  | 'leftFoot'
  | 'rightUpperLeg'
  | 'rightLowerLeg'
  | 'rightFoot';

export type RigFamily = 'mixamo' | 'kenney' | 'generic';

export interface Rig {
  family: RigFamily;
  bones: Partial<Record<Part, THREE.Object3D>>;
  /** Enough parts mapped for full-body procedural animation. */
  humanoid: boolean;
}

/** Split "mixamorigLeftUpLeg" / "arm-left" / "upperarm_l" into lowercase tokens. */
function tokens(name: string) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .filter((t) => !/^(mixamorig\d*|armature|def|bip\d*|rig|org|mch)$/.test(t));
}

function classify(name: string): { side: 'left' | 'right' | null; part: string } {
  const t = tokens(name);
  let side: 'left' | 'right' | null = null;
  const rest = t.filter((x) => {
    if (x === 'left' || x === 'l') return (side = 'left'), false;
    if (x === 'right' || x === 'r') return (side = 'right'), false;
    return true;
  });
  return { side, part: rest.join('') };
}

/**
 * Map a model's bones (or plain nodes, for rigid rigs like Kenney's) onto
 * canonical humanoid parts using naming heuristics.
 */
export function mapRig(root: THREE.Object3D): Rig {
  const nodes: THREE.Object3D[] = [];
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone || o.name) nodes.push(o);
  });
  const names = nodes.map((n) => n.name);
  const family: RigFamily = names.some((n) => /^mixamorig/i.test(n))
    ? 'mixamo'
    : names.includes('arm-left') && names.includes('torso')
      ? 'kenney'
      : 'generic';

  const found = new Map<string, THREE.Object3D>();
  for (const n of nodes) {
    const { side, part } = classify(n.name);
    const key = side ? `${side}:${part}` : part;
    // first match wins (outermost in the hierarchy)
    if (!found.has(key)) found.set(key, n);
  }
  const pick = (...keys: string[]) => keys.map((k) => found.get(k)).find(Boolean);

  const bones: Rig['bones'] = {};
  bones.hips = pick('hips', 'hip', 'pelvis', 'root');
  bones.spine = pick('spine', 'spine0', 'torso', 'spine01');
  bones.chest = pick('spine2', 'spine02', 'spine03', 'chest', 'upperchest', 'spine1');
  bones.neck = pick('neck', 'neck1', 'neck01');
  bones.head = pick('head');
  for (const side of ['left', 'right'] as const) {
    const s = (p: string) => `${side}:${p}`;
    const hasUpLeg = found.has(s('upleg')) || found.has(s('upperleg')) || found.has(s('thigh'));
    bones[`${side}UpperArm`] = pick(s('arm'), s('upperarm'), s('uparm'));
    bones[`${side}LowerArm`] = pick(s('forearm'), s('lowerarm'), s('elbow'));
    bones[`${side}Hand`] = pick(s('hand'), s('wrist'));
    bones[`${side}UpperLeg`] = pick(s('upleg'), s('upperleg'), s('thigh'), hasUpLeg ? '' : s('leg'));
    bones[`${side}LowerLeg`] = pick(s('lowerleg'), s('calf'), s('shin'), s('knee'), hasUpLeg ? s('leg') : '');
    bones[`${side}Foot`] = pick(s('foot'), s('ankle'));
  }
  const humanoid = !!(bones.leftUpperArm && bones.rightUpperArm && (bones.hips || bones.spine));
  return { family, bones, humanoid };
}

/** Bone name with the rig prefix stripped, used to share clips between Mixamo-family rigs. */
export const canonicalBoneName = (name: string) => name.replace(/^mixamorig\d*:?/i, '');
