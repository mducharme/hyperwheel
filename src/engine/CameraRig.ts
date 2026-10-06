import * as THREE from 'three/webgpu';

export interface Insets {
  /** Desktop side panel width (px). */
  x: number;
  /** Net upward shift of the visible centre (px). */
  y: number;
  /** Total vertical pixels covered by UI (mobile header + sheet). */
  used?: number;
}

export interface CameraStyle {
  /** Camera height above the wheel centre. */
  height: number;
  /** Look-at offset below the wheel centre. */
  look: number;
  /** World units to keep in frame around the wheel. */
  frame: number;
}

interface Move {
  kind: 'shake' | 'orbit' | 'zoom';
  t: number;
  dur: number;
  amount: number;
}

/**
 * Frames the wheel in whatever screen area the UI leaves free, adds idle sway,
 * pointer parallax, speed dolly, and celebratory moves (shake/orbit/zoom).
 *
 * The camera slides rather than skewing the projection (setViewOffset): the
 * mirror floor's reflector assumes an unshifted frustum.
 */
export class CameraRig {
  readonly pointer = new THREE.Vector2();
  style: CameraStyle = { height: 0.9, look: 0.15, frame: 8.6 };
  private parallax = new THREE.Vector2();
  private off = new THREE.Vector2();
  private target = new THREE.Vector3();
  private moves: Move[] = [];
  private punch = 0;
  /** World point to frame (e.g. the winner's character); null to frame the wheel. */
  focus: THREE.Vector3 | null = null;
  private focusW = 0;
  private focusPoint = new THREE.Vector3();

  constructor(
    private camera: THREE.PerspectiveCamera,
    private center: THREE.Vector3,
  ) {}

  shake(amount = 1, dur = 0.6) {
    this.moves.push({ kind: 'shake', t: 0, dur, amount });
  }
  /** Swing around the wheel by `amount` radians and back. */
  orbit(amount = 0.6, dur = 2.4) {
    this.moves.push({ kind: 'orbit', t: 0, dur, amount });
  }
  /** Push in (positive) or pull out (negative), then return. */
  zoom(amount = 0.2, dur = 1.6) {
    this.moves.push({ kind: 'zoom', t: 0, dur, amount });
  }

  update(dt: number, t: number, speed: number, win: number, insets: Insets) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const k = 1 - Math.exp(-dt * 8);
    this.off.x += (insets.x - this.off.x) * k;
    this.off.y += (insets.y - this.off.y) * k;

    const cam = this.camera;
    cam.aspect = w / h;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const availW = Math.max(1, w - this.off.x);
    const availH = Math.max(1, h - (insets.used ?? this.off.y));
    const F = this.style.frame;
    let dist = Math.max(F / 2 / (tanHalf * (availH / h)), F / 2 / (tanHalf * (availW / h))) * 1.04;

    this.punch += ((win > 0 ? 1 : 0) - this.punch) * (1 - Math.exp(-dt * (win > 0 ? 6 : 2)));
    if (this.focus) this.focusPoint.copy(this.focus);
    this.focusW += ((this.focus ? 1 : 0) - this.focusW) * (1 - Math.exp(-dt * 2.5));
    dist *= 1 - this.focusW * 0.28;
    dist *= 1 - Math.min(0.06, speed * 0.004) - this.punch * 0.08;

    let yaw = 0;
    const shake = new THREE.Vector3();
    for (const m of this.moves) {
      m.t += dt;
      const p = Math.min(1, m.t / m.dur);
      const env = Math.sin(Math.PI * p);
      if (m.kind === 'orbit') yaw += m.amount * env;
      if (m.kind === 'zoom') dist *= 1 - m.amount * env;
      if (m.kind === 'shake') {
        const a = m.amount * 0.25 * Math.pow(1 - p, 2);
        shake.x += (Math.random() - 0.5) * a;
        shake.y += (Math.random() - 0.5) * a;
      }
    }
    this.moves = this.moves.filter((m) => m.t < m.dur);

    const unitsPerPx = (2 * dist * tanHalf) / h;
    const shiftX = (this.off.x / 2) * unitsPerPx;
    const shiftY = (this.off.y / 2) * unitsPerPx;

    this.parallax.lerp(this.pointer, 1 - Math.exp(-dt * 3));
    const swayX = Math.sin(t * 0.21) * 0.35 + this.parallax.x * 1.4;
    const swayY = Math.sin(t * 0.17) * 0.18 + this.parallax.y * 0.7;

    const C = this.center;
    this.target.set(C.x + shiftX, C.y - this.style.look - shiftY, 0);
    // drift the look-at toward the focused character
    this.target.lerp(this.focusPoint.clone().add(new THREE.Vector3(shiftX, -shiftY, 0)), this.focusW * 0.75);
    // orbit around the (shifted) look target
    cam.position.set(
      this.target.x + swayX * Math.cos(yaw) + dist * Math.sin(yaw),
      C.y + this.style.height + swayY - this.focusW * 1.2,
      this.target.z - swayX * Math.sin(yaw) + dist * Math.cos(yaw),
    );
    cam.position.add(shake);
    cam.lookAt(this.target.clone().add(shake.multiplyScalar(0.5)));
    cam.updateProjectionMatrix();
  }
}
