import * as THREE from 'three/webgpu';
import { mod } from '../engine/physics';

export interface DragTarget {
  canvas: HTMLCanvasElement;
  camera: THREE.Camera;
  center: () => THREE.Vector3;
  radius: number;
  /** Is a drag allowed right now? */
  canDrag(): boolean;
  /** Rotate the wheel by `delta` radians. */
  turn(delta: number): void;
  /** Released fast enough to count as a fling. */
  fling(direction: number, strength: number): void;
  /** Quick tap on the wheel. */
  tap(): void;
}

/** Grab the wheel and turn it; let go with speed to fling it. */
export class DragSpin {
  dragging = false;
  /** Current angular velocity while dragging (rad/s). */
  velocity = 0;
  private angle = 0;
  private moved = 0;
  private startedAt = 0;
  private samples: { t: number; d: number }[] = [];

  constructor(private t: DragTarget) {
    const c = t.canvas;
    c.addEventListener('pointerdown', (e) => this.down(e));
    c.addEventListener('pointermove', (e) => this.move(e));
    c.addEventListener('pointerup', (e) => this.up(e));
    c.addEventListener('pointercancel', (e) => this.up(e));
  }

  private screen() {
    const r = this.t.canvas.getBoundingClientRect();
    const center = this.t.center();
    const c = center.clone().project(this.t.camera);
    const edge = center.clone().add(new THREE.Vector3(this.t.radius, 0, 0)).project(this.t.camera);
    const cx = r.left + ((c.x + 1) / 2) * r.width;
    const cy = r.top + ((1 - c.y) / 2) * r.height;
    return { cx, cy, radius: Math.abs(r.left + ((edge.x + 1) / 2) * r.width - cx) };
  }

  private angleAt(e: PointerEvent, cx: number, cy: number) {
    return Math.atan2(-(e.clientY - cy), e.clientX - cx);
  }

  private down(e: PointerEvent) {
    if (!this.t.canDrag()) return;
    const { cx, cy, radius } = this.screen();
    if (Math.hypot(e.clientX - cx, e.clientY - cy) > radius * 1.1) return;
    this.dragging = true;
    this.angle = this.angleAt(e, cx, cy);
    this.moved = 0;
    this.velocity = 0;
    this.startedAt = performance.now();
    this.samples = [];
    this.t.canvas.setPointerCapture(e.pointerId);
    this.t.canvas.classList.add('dragging');
  }

  private move(e: PointerEvent) {
    if (!this.dragging) return;
    const { cx, cy } = this.screen();
    const a = this.angleAt(e, cx, cy);
    const d = mod(a - this.angle + Math.PI, Math.PI * 2) - Math.PI;
    this.angle = a;
    this.t.turn(d);
    this.moved += Math.abs(d);
    const now = performance.now();
    this.samples.push({ t: now, d });
    while (this.samples.length && now - this.samples[0].t > 90) this.samples.shift();
    this.velocity = this.recentVelocity(now);
  }

  private recentVelocity(now: number) {
    const recent = this.samples.filter((s) => now - s.t < 90);
    if (!recent.length) return 0;
    return (recent.reduce((s, x) => s + x.d, 0) / Math.max(16, now - recent[0].t)) * 1000;
  }

  private up(e: PointerEvent) {
    if (!this.dragging) return;
    this.dragging = false;
    this.t.canvas.classList.remove('dragging');
    if (this.t.canvas.hasPointerCapture(e.pointerId)) this.t.canvas.releasePointerCapture(e.pointerId);
    const now = performance.now();
    const v = this.recentVelocity(now);
    this.velocity = 0;
    if (Math.abs(v) > 1.5) this.t.fling(Math.sign(v), THREE.MathUtils.clamp(Math.abs(v) / 12, 0.6, 1.6));
    else if (this.moved < 0.04 && now - this.startedAt < 450) this.t.tap();
  }
}
