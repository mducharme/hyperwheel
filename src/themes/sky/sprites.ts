/** sky: confetti and celebration sprite shapes, drawn once into a texture atlas. */
import { makeAtlas, shapes, type Sprite } from '../../fx/atlas';

/** A party balloon on its string. */
export const balloon: Sprite = (ctx, r) => {
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.2, r * 0.42, r * 0.52, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-r * 0.07, r * 0.32);
  ctx.lineTo(r * 0.07, r * 0.32);
  ctx.lineTo(0, r * 0.4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = r * 0.04;
  ctx.beginPath();
  ctx.moveTo(0, r * 0.4);
  ctx.quadraticCurveTo(r * 0.12, r * 0.62, 0, r * 0.9);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.16, -r * 0.42, r * 0.08, r * 0.14, -0.4, 0, Math.PI * 2);
  ctx.fill();
};

/** A small bird, wings up. */
export const bird: Sprite = (ctx, r) => {
  ctx.strokeStyle = '#3d4a5c';
  ctx.lineWidth = r * 0.13;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-r * 0.8, -r * 0.1);
  ctx.quadraticCurveTo(-r * 0.4, -r * 0.4, 0, r * 0.1);
  ctx.quadraticCurveTo(r * 0.4, -r * 0.4, r * 0.8, -r * 0.1);
  ctx.stroke();
};

/** A puff of cloud. */
export const cloud: Sprite = (ctx, r) => {
  ctx.fillStyle = '#fff';
  for (const [x, y, s] of [
    [0, 0.1, 0.5],
    [-0.45, 0.22, 0.34],
    [0.45, 0.2, 0.36],
    [-0.2, -0.22, 0.38],
    [0.24, -0.2, 0.34],
  ]) {
    ctx.beginPath();
    ctx.arc(x * r, y * r, s * r, 0, Math.PI * 2);
    ctx.fill();
  }
};

export const atlas = () =>
  makeAtlas([
    balloon, // 0
    bird, // 1
    cloud, // 2
    shapes.sparkle(), // 3
    shapes.star(5, 0.45), // 4
    shapes.strip(0.22), // 5: streamers
  ]);
