/** pharaoh: confetti and celebration sprite shapes, drawn once into a texture atlas. */
import { makeAtlas, shapes, type Sprite } from '../../fx/atlas';

/** A scarab beetle seen from above, head up. */
export const scarab: Sprite = (ctx, r) => {
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.12, r * 0.42, r * 0.55, 0, 0, Math.PI * 2); // wing cases
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.5, r * 0.26, r * 0.17, 0, 0, Math.PI * 2); // head
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = r * 0.07;
  ctx.lineCap = 'round';
  for (const s of [-1, 1]) {
    for (const y of [-0.15, 0.15, 0.45]) {
      ctx.beginPath();
      ctx.moveTo(s * r * 0.38, y * r);
      ctx.lineTo(s * r * 0.72, y * r - r * 0.1);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = r * 0.04;
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.35);
  ctx.lineTo(0, r * 0.65);
  ctx.stroke();
};

/** A small ankh. */
export const ankh: Sprite = (ctx, r) => {
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = r * 0.17;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.42, r * 0.2, r * 0.28, 0, 0, Math.PI * 2);
  ctx.moveTo(-r * 0.42, -r * 0.08);
  ctx.lineTo(r * 0.42, -r * 0.08);
  ctx.moveTo(0, -r * 0.14);
  ctx.lineTo(0, r * 0.82);
  ctx.stroke();
};

/** A falcon gliding to the right, in silhouette. */
export const falcon: Sprite = (ctx, r) => {
  ctx.fillStyle = '#1d1a26';
  ctx.beginPath();
  ctx.moveTo(-r * 0.92, -r * 0.18);
  ctx.quadraticCurveTo(-r * 0.4, -r * 0.12, -r * 0.05, r * 0.04);
  ctx.lineTo(r * 0.32, r * 0.0);
  ctx.lineTo(r * 0.46, r * 0.06);
  ctx.lineTo(r * 0.3, r * 0.1);
  ctx.lineTo(r * 0.05, r * 0.12);
  ctx.quadraticCurveTo(r * 0.4, -r * 0.12, r * 0.92, -r * 0.18);
  ctx.quadraticCurveTo(r * 0.4, r * 0.1, 0, r * 0.2);
  ctx.lineTo(-r * 0.25, r * 0.3);
  ctx.lineTo(-r * 0.12, r * 0.16);
  ctx.quadraticCurveTo(-r * 0.4, r * 0.1, -r * 0.92, -r * 0.18);
  ctx.fill();
};

export const atlas = () =>
  makeAtlas([
    scarab, // 0
    ankh, // 1
    falcon, // 2
    shapes.circle('#fff', true), // 3: coins, sand
    shapes.glow(), // 4: fire, light
    shapes.sparkle(), // 5
  ]);
