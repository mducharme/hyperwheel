/** grandprix: confetti and celebration sprite shapes, drawn once into a texture atlas. */
import { makeAtlas, shapes, type Sprite } from '../../fx/atlas';

/** A square of chequered-flag cloth. */
export const checker: Sprite = (ctx, r) => {
  const n = 4;
  const s = (r * 1.6) / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#111' : '#fff';
      ctx.fillRect(-r * 0.8 + x * s, -r * 0.8 + y * s, s, s);
    }
  }
};

/** A cartoon puff of tyre smoke. */
export const puff: Sprite = (ctx, r) => {
  ctx.fillStyle = '#fff';
  for (const [x, y, s] of [
    [0, 0.1, 0.55],
    [-0.42, 0.2, 0.38],
    [0.42, 0.18, 0.4],
    [-0.2, -0.3, 0.4],
    [0.25, -0.28, 0.36],
  ]) {
    ctx.beginPath();
    ctx.arc(x * r, y * r, s * r, 0, Math.PI * 2);
    ctx.fill();
  }
};

/** A sponsor blimp, nose to the right. */
export const blimp: Sprite = (ctx, r) => {
  ctx.fillStyle = '#d9dde3';
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.9, r * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e10600';
  ctx.fillRect(-r * 0.62, -r * 0.08, r * 1.2, r * 0.16);
  // tail fins
  ctx.fillStyle = '#9aa1ab';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-r * 0.62, 0);
    ctx.lineTo(-r * 0.95, s * r * 0.36);
    ctx.lineTo(-r * 0.78, 0);
    ctx.fill();
  }
  // gondola
  ctx.fillStyle = '#333';
  ctx.fillRect(-r * 0.12, r * 0.28, r * 0.28, r * 0.1);
};

export const atlas = () =>
  makeAtlas([
    checker, // 0: chequered confetti
    shapes.strip(0.22), // 1: streamers
    shapes.star(5, 0.45), // 2
    shapes.sparkle(), // 3
    shapes.glow(), // 4: foam, speed streaks
    puff, // 5: tyre smoke
    blimp, // 6
    shapes.circle('#fff', true), // 7: foam droplets
  ]);
