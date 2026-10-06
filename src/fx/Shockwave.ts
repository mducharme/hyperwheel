import * as THREE from 'three/webgpu';
import { atan, clamp, exp, float, length, mx_noise_float, pow, step, uniform, uv, vec3 } from 'three/tsl';

export interface ShockwaveOptions {
  color: string;
  /** Final radius in world units. */
  radius: number;
  /** Ring thickness as a fraction of the radius. */
  width?: number;
  duration?: number;
  intensity?: number;
}

/** An expanding additive ring with a noisy edge — ground slams, supernovae, sonar pings. */
export class Shockwave {
  readonly object: THREE.Mesh;
  private uTime = uniform(0);
  private uStart = uniform(-1e4);

  constructor(o: ShockwaveOptions) {
    const dur = o.duration ?? 1.2;
    const w = o.width ?? 0.08;
    const mat = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const p = uv().sub(0.5).mul(2);
    const r = length(p);
    const prog = clamp(this.uTime.sub(this.uStart).div(dur), 0, 1);
    const R = float(1).sub(pow(float(1).sub(prog), 3));
    const wobble = mx_noise_float(vec3(atan(p.y, p.x).mul(3), prog.mul(4), 0)).mul(0.04);
    const ring = exp(r.sub(R).add(wobble).div(w).pow(2).negate());
    const inner = step(r, R).mul(0.12).mul(r.div(R.add(0.001)));
    const alive = step(prog, 0.999).mul(step(0.0001, prog));
    const fade = pow(float(1).sub(prog), 1.5);
    mat.colorNode = (vec3 as any)(new THREE.Color(o.color)).mul(ring.add(inner).mul(fade).mul(alive).mul(o.intensity ?? 3));

    this.object = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    this.object.scale.setScalar(o.radius);
    this.object.frustumCulled = false;
    this.object.renderOrder = 3;
  }

  /** Fire at a position; `facing` = 'floor' lays it flat, otherwise it faces +Z (the camera). */
  fire(at: THREE.Vector3, facing: 'floor' | 'camera' = 'camera') {
    this.object.position.copy(at);
    this.object.rotation.set(facing === 'floor' ? -Math.PI / 2 : 0, 0, 0);
    this.uStart.value = this.uTime.value;
  }

  update(time: number) {
    this.uTime.value = time;
  }

  dispose() {
    this.object.geometry.dispose();
    (this.object.material as THREE.Material).dispose();
  }
}
