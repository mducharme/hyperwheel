import * as THREE from 'three/webgpu';

/** Where the cannons sit (x side, z); celebrations fire from their muzzles. */
export const CANNONS: [number, number][] = [
  [-1, -3],
  [-1, -9],
  [1, -3],
  [1, -9],
];
export const CHEST = new THREE.Vector3(-3.5, 0, 2.1);
