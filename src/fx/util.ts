import * as THREE from 'three/webgpu';
import { instancedBufferAttribute } from 'three/tsl';

/** Uniform random number in [a, b). */
export const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Per-instance shader attribute from a typed array (`size` floats per instance). */
export const inst = (data: Float32Array, size: number, type: string): any =>
  instancedBufferAttribute(new THREE.InstancedBufferAttribute(data, size), type);
