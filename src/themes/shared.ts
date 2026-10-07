import * as THREE from 'three/webgpu';
import { float, length, positionWorld, reflector, smoothstep, vec3 } from 'three/tsl';

type N = any;

/** Dispose every geometry, material and texture under `root`. */
export function disposeDeep(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
    for (const m of mats) {
      for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
      m.dispose();
    }
  });
}

export interface FloorOptions {
  /** Base colour under everything. */
  base: N;
  /** Mirror strength near the stage (0 = no reflector). */
  reflect?: number;
  /** Extra colour added on top: (xz, dist) => vec3 node. */
  pattern?: (xz: N, dist: N) => N;
  /** Distance where the floor fades out into the sky. */
  fade?: [number, number];
  size?: number;
}

/** A large ground plane with optional planar reflection and a procedural pattern. */
export function makeFloor(o: FloorOptions) {
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true });
  const xz = positionWorld.xz;
  const dist = length(xz);
  let colorNode: N = o.base;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(o.size ?? 90, o.size ?? 90), mat);
  floor.rotation.x = -Math.PI / 2;

  if (o.reflect) {
    const mirror = reflector({ resolutionScale: 0.5 } as any);
    floor.add(mirror.target);
    colorNode = colorNode.add(mirror.rgb.mul(float(o.reflect).mul(float(1).sub(smoothstep(4, 22, dist)))));
  }
  if (o.pattern) colorNode = colorNode.add(o.pattern(xz, dist));
  const [f0, f1] = o.fade ?? [18, 40];
  mat.colorNode = colorNode;
  mat.opacityNode = float(1).sub(smoothstep(f0, f1, dist));
  return floor;
}

export interface StandOptions {
  legs: THREE.Material;
  plinth?: THREE.Material;
  plinthRadius?: number;
  /** Emissive colour node for the plinth's glowing lip. */
  neon?: N;
}

/** A-frame stand with axle and a round plinth, sized for the default wheel centre. */
export function makeStand(center: THREE.Vector3, o: StandOptions) {
  const group = new THREE.Group();
  const axle = new THREE.Vector3(center.x, center.y, -0.45);
  for (const side of [-1, 1]) {
    const foot = new THREE.Vector3(side * 1.9, 0.2, -1.1);
    const len = foot.distanceTo(axle);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, len, 20), o.legs);
    leg.position.copy(foot.clone().add(axle).multiplyScalar(0.5));
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axle.clone().sub(foot).normalize());
    group.add(leg);
  }
  const axleMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.7, 32).rotateX(Math.PI / 2), o.legs);
  axleMesh.position.copy(axle);
  group.add(axleMesh);

  const R = o.plinthRadius ?? 2.7;
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.1, R + 0.1, 0.22, 96), o.plinth ?? o.legs);
  plinth.position.set(0, 0.11, -0.6);
  group.add(plinth);

  if (o.neon) {
    const neonMat = new THREE.MeshBasicNodeMaterial();
    neonMat.colorNode = o.neon;
    const neon = new THREE.Mesh(new THREE.TorusGeometry(R + 0.02, 0.025, 8, 160).rotateX(Math.PI / 2), neonMat);
    neon.position.set(0, 0.2, -0.6);
    group.add(neon);
  }
  return group;
}

/** Point lights that brighten with spin speed and wins. */
export function makeLights(group: THREE.Group, key: [string, number], points: [string, number, THREE.Vector3Tuple][]) {
  const k = new THREE.DirectionalLight(key[0], key[1]);
  k.position.set(2, 8, 10);
  group.add(k);
  const lights = points.map(([color, intensity, pos]) => {
    const l = new THREE.PointLight(color, intensity, 30, 1.6);
    l.position.set(...pos);
    l.userData.base = intensity;
    group.add(l);
    return l;
  });
  return (speed: number, win: number) => {
    const boost = 1 + Math.min(2, speed * 0.08) + win * 2;
    for (const l of lights) l.intensity = l.userData.base * boost;
  };
}

export const rgb = (hex: string): N => {
  const c = new THREE.Color(hex);
  return vec3(c.r, c.g, c.b);
};

/**
 * A tube along a smooth curve through `points`, with a radius that varies
 * along it (`radius(t)`, t = 0..1) — tentacles, necks, tails. UV x runs along
 * the tube, y around it.
 */
export function taperedTube(points: THREE.Vector3[], radius: (t: number) => number, segments = 60, radial = 12) {
  const curve = new THREE.CatmullRomCurve3(points);
  const frames = curve.computeFrenetFrames(segments, false);
  const pos: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    curve.getPointAt(t, p);
    const r = radius(t);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      n.copy(frames.normals[i]).multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[i], Math.sin(a));
      pos.push(p.x + n.x * r, p.y + n.y * r, p.z + n.z * r);
      uvs.push(t, j / radial);
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}
