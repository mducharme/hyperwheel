import * as THREE from 'three/webgpu';

/** Tops of the two Tesla coils (where the arcs leap from). */
export const COIL_TOPS = [new THREE.Vector3(-6.6, 5.1, -3.6), new THREE.Vector3(6.8, 5.1, -4)];
/** The specimen tank and the brain jar; celebrations bubble out of them. */
export const TANK = new THREE.Vector3(10, 0, -7.5);
export const JAR = new THREE.Vector3(-4.6, 1.1, 1.6);
