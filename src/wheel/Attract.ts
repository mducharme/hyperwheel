import type { Wheel } from './Wheel';

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * Idle "attract mode", like an arcade cabinet waiting for a player: the
 * marquee bulbs switch to a light show and, every so often, the wheel gives a
 * little nudge that springs back. Purely visual — the spin's real angle (and
 * so the result) is never touched; `offset` is only added when drawing.
 */
export class Attract {
  /** Extra rotation to draw the wheel with (radians). */
  offset = 0;
  /** Its rate of change, so the pointer can react to the nudge. */
  velocity = 0;
  private level = 0;
  private nudgeT = -1;
  private dir = 1;
  private next = rand(4, 7);

  constructor(private wheel: Wheel) {}

  /** `calm`: nothing spinning, no celebration, nobody interacting. */
  update(dt: number, calm: boolean) {
    // fade the light show in slowly, out at once
    this.level += ((calm ? 1 : 0) - this.level) * (1 - Math.exp(-dt * (calm ? 1.2 : 12)));
    this.wheel.uAttract.value = this.level;

    let target = 0;
    if (calm) {
      this.next -= dt;
      if (this.next <= 0 && this.nudgeT < 0) {
        this.nudgeT = 0;
        this.dir = Math.random() < 0.5 ? -1 : 1;
        this.next = rand(8, 13);
      }
      if (this.nudgeT >= 0) {
        this.nudgeT += dt;
        // a push that springs back with a wobble (peaks around 5°)
        target = this.dir * 0.12 * Math.exp(-2.8 * this.nudgeT) * Math.sin(11 * this.nudgeT);
        if (this.nudgeT > 1.8) this.nudgeT = -1;
      }
    } else {
      this.nudgeT = -1;
    }

    const prev = this.offset;
    // when interrupted, settle back quickly instead of jumping
    this.offset = calm ? target : this.offset * Math.exp(-dt * 15);
    this.velocity = (this.offset - prev) / Math.max(dt, 1e-3);
    return this.offset;
  }
}
