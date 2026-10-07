/** lab: confetti and celebration sprite shapes, drawn once into a texture atlas. */
import { makeAtlas, shapes, type Sprite } from '../../fx/atlas';

/** A cartoon puff of coloured smoke. */
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

/** A bubble: a ring with a highlight. */
export const bubble: Sprite = (ctx, r) => {
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = r * 0.12;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.28, -r * 0.3, r * 0.12, r * 0.2, -0.6, 0, Math.PI * 2);
  ctx.fill();
};

export const atlas = () =>
  makeAtlas([
    puff, // 0: smoke
    bubble, // 1
    shapes.glow(), // 2: sparks, light
    shapes.bolt(), // 3
    shapes.circle('#fff', true), // 4: droplets
    shapes.sparkle(), // 5
  ]);
