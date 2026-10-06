/**
 * Spin model: dω/dt = -k·ω - c  (viscous drag + constant friction).
 *
 * Instead of integrating and hoping, we pick the *total travel angle* up front
 * (base turns + a uniformly random extra fraction of a turn) and solve for the
 * initial velocity that produces it. That keeps the result fair — every angle is
 * equally likely — while the motion stays physically plausible: a fast whirl, a
 * long exponential bleed, then a linear creep to a stop.
 */
export class Spin {
  angle = 0;
  velocity = 0;
  spinning = false;

  private t = 0;
  private T = 0;
  private k = 0;
  private c = 0;
  private w0 = 0;
  private dir = 1;
  private start = 0;
  private travel = 0;

  /**
   * @param duration seconds until the wheel stops
   * @param direction -1 = clockwise (as seen by the viewer), +1 = counter-clockwise
   * @param strength scales the number of base turns (a hard fling spins further)
   */
  launch(duration: number, direction = -1, strength = 1) {
    const T = duration;
    const k = 4 / T; // fixed curve shape regardless of duration
    const eKT = Math.exp(k * T);
    const g = (1 - (k * T) / (eKT - 1)) / k; // travel per unit initial velocity

    const baseTurns = Math.max(2, T * 0.62) * strength;
    const travel = baseTurns * Math.PI * 2 + Math.random() * Math.PI * 2;
    const w0 = travel / g;

    this.T = T;
    this.k = k;
    this.w0 = w0;
    this.c = (k * w0) / (eKT - 1);
    this.dir = Math.sign(direction) || -1;
    this.start = this.angle;
    this.travel = travel;
    this.t = 0;
    this.velocity = this.dir * w0;
    this.spinning = true;
  }

  /** The angle the current spin will come to rest at (it's decided at launch). */
  get target() {
    return this.spinning ? this.start + this.dir * this.travel : this.angle;
  }

  /** Seconds until the wheel stops (0 when idle). */
  get remaining() {
    return this.spinning ? this.T - this.t : 0;
  }

  /** Returns true on the frame the spin comes to rest. */
  update(dt: number): boolean {
    if (!this.spinning) return false;
    this.t = Math.min(this.t + dt, this.T);
    const { k, c, w0, t } = this;
    const a = w0 + c / k;
    const e = Math.exp(-k * t);
    const traveled = (a * (1 - e)) / k - (c / k) * t;
    this.angle = this.start + this.dir * traveled;
    this.velocity = this.dir * Math.max(0, a * e - c / k);
    if (this.t >= this.T) {
      this.angle = this.start + this.dir * this.travel;
      this.velocity = 0;
      this.spinning = false;
      return true;
    }
    return false;
  }
}

/** Index of the segment under a pointer at world angle π/2 (12 o'clock). */
export function segmentAtPointer(angle: number, count: number): number {
  const seg = (Math.PI * 2) / count;
  const local = mod(Math.PI / 2 - angle, Math.PI * 2);
  return Math.min(count - 1, Math.floor(local / seg));
}

export function mod(a: number, n: number) {
  return ((a % n) + n) % n;
}
