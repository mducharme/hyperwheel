/** zen: confetti and celebration sprite shapes, drawn once into a texture atlas. */
import { makeAtlas, shapes, type Sprite } from '../../fx/atlas';

/** A cherry-blossom petal with its little notch. */
export const petal: Sprite = (ctx, r) => {
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(0, r * 0.85);
  ctx.bezierCurveTo(-r * 0.75, r * 0.3, -r * 0.55, -r * 0.75, -r * 0.12, -r * 0.8);
  ctx.lineTo(0, -r * 0.6);
  ctx.lineTo(r * 0.12, -r * 0.8);
  ctx.bezierCurveTo(r * 0.55, -r * 0.75, r * 0.75, r * 0.3, 0, r * 0.85);
  ctx.fill();
};

/** A glowing paper sky lantern. */
export const lantern: Sprite = (ctx, r) => {
  const g = ctx.createLinearGradient(0, -r * 0.8, 0, r * 0.8);
  g.addColorStop(0, '#ffe6b0');
  g.addColorStop(1, '#ff9a4d');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-r * 0.42, -r * 0.7);
  ctx.lineTo(r * 0.42, -r * 0.7);
  ctx.lineTo(r * 0.55, r * 0.6);
  ctx.quadraticCurveTo(0, r * 0.8, -r * 0.55, r * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff6d8';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.45, r * 0.18, r * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
};

/** A koi, swimming right: orange and white patches. */
export const koi: Sprite = (ctx, r) => {
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(r * 0.05, 0, r * 0.6, r * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath(); // tail
  ctx.moveTo(-r * 0.5, 0);
  ctx.lineTo(-r * 0.9, -r * 0.28);
  ctx.lineTo(-r * 0.78, 0);
  ctx.lineTo(-r * 0.9, r * 0.28);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ff6a2b';
  for (const [x, y, s] of [
    [0.3, -0.05, 0.2],
    [-0.15, 0.04, 0.17],
    [-0.72, 0, 0.12],
  ]) {
    ctx.beginPath();
    ctx.ellipse(x * r, y * r, s * r, s * r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
};

/** A heron gliding to the right, in silhouette. */
export const heron: Sprite = (ctx, r) => {
  ctx.strokeStyle = '#3d3a40';
  ctx.fillStyle = '#3d3a40';
  ctx.lineCap = 'round';
  ctx.lineWidth = r * 0.06;
  ctx.beginPath(); // wings
  ctx.moveTo(-r * 0.85, -r * 0.2);
  ctx.quadraticCurveTo(-r * 0.3, -r * 0.05, 0, r * 0.05);
  ctx.quadraticCurveTo(r * 0.3, -r * 0.05, r * 0.85, -r * 0.2);
  ctx.quadraticCurveTo(r * 0.3, r * 0.1, 0, r * 0.15);
  ctx.quadraticCurveTo(-r * 0.3, r * 0.1, -r * 0.85, -r * 0.2);
  ctx.fill();
  ctx.beginPath(); // tucked neck, long beak, trailing legs
  ctx.moveTo(r * 0.05, r * 0.08);
  ctx.quadraticCurveTo(r * 0.3, r * 0.2, r * 0.42, r * 0.08);
  ctx.lineTo(r * 0.7, r * 0.1);
  ctx.moveTo(-r * 0.05, r * 0.12);
  ctx.lineTo(-r * 0.6, r * 0.2);
  ctx.stroke();
};

export const atlas = () =>
  makeAtlas([
    petal, // 0
    lantern, // 1
    koi, // 2
    heron, // 3
    shapes.circle('#fff', true), // 4: water drops
    shapes.sparkle(), // 5
    shapes.glow(), // 6
  ]);
