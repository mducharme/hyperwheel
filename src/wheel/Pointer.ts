import { mod } from '../engine/physics';
import { PEG_R } from './Wheel';
import type * as THREE from 'three/webgpu';

/**
 * The flapper at 12 o'clock. Pegs push it aside as they pass (it can never sink
 * through a peg), then an underdamped spring snaps it back with a wobble.
 * Fires `onTick` every time a peg passes the pointer.
 */
export class Pointer {
  private angle = 0;
  private vel = 0;
  private lastPeg = 0;

  constructor(
    private flapper: THREE.Object3D,
    private onTick: (speed: number) => void,
  ) {}

  update(dt: number, wheelAngle: number, omega: number, pegSpacing: number) {
    let target = 0;
    let dir = 0;
    if (pegSpacing > 0) {
      const rel = mod(wheelAngle - Math.PI / 2 + pegSpacing / 2, pegSpacing) - pegSpacing / 2;
      const arc = rel * PEG_R;
      const W = 0.24;
      const approaching = rel * omega < 0;
      if (approaching && Math.abs(arc) < W && Math.abs(omega) > 0.01) {
        dir = -Math.sign(omega);
        target = (1 - Math.abs(arc) / W) * 0.7 * dir;
      }

      const idx = Math.floor((wheelAngle - Math.PI / 2) / pegSpacing);
      if (idx !== this.lastPeg) {
        this.onTick(Math.abs(omega));
        this.vel += -Math.sign(omega) * Math.min(4, 1 + Math.abs(omega) * 0.15);
        this.lastPeg = idx;
      }
    }

    const K = 700;
    const D = 16;
    this.vel += (-K * this.angle - D * this.vel) * dt;
    this.angle += this.vel * dt;
    if (dir !== 0 && this.angle * dir < target * dir) {
      this.vel = (target - this.angle) / Math.max(dt, 1e-3);
      this.angle = target;
    }
    this.angle = Math.max(-0.9, Math.min(0.9, this.angle));
    this.flapper.rotation.z = this.angle;
  }
}
