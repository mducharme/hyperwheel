/** dino: confetti and celebration sprite shapes, drawn once into a texture atlas. */
import { makeAtlas, shapes, type Sprite } from '../../fx/atlas';

/** A pterodactyl in silhouette, gliding to the right. */
export const ptero: Sprite = (ctx, r) => {
  ctx.fillStyle = '#2d2a26';
  ctx.beginPath();
  // wings
  ctx.moveTo(-r * 0.95, -r * 0.25);
  ctx.quadraticCurveTo(-r * 0.45, -r * 0.05, -r * 0.1, r * 0.05);
  ctx.lineTo(r * 0.1, r * 0.05);
  ctx.quadraticCurveTo(r * 0.45, -r * 0.05, r * 0.95, -r * 0.25);
  ctx.quadraticCurveTo(r * 0.45, r * 0.15, r * 0.05, r * 0.25);
  ctx.lineTo(-r * 0.05, r * 0.25);
  ctx.quadraticCurveTo(-r * 0.45, r * 0.15, -r * 0.95, -r * 0.25);
  ctx.fill();
  // head with its long crest and beak, pointing right
  ctx.beginPath();
  ctx.moveTo(r * 0.05, r * 0.02);
  ctx.lineTo(r * 0.55, r * 0.12);
  ctx.lineTo(r * 0.08, r * 0.2);
  ctx.lineTo(-r * 0.25, -r * 0.08);
  ctx.closePath();
  ctx.fill();
};

/** A small running raptor in silhouette, facing right. */
export const raptor: Sprite = (ctx, r) => {
  ctx.fillStyle = '#3a3226';
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.38, r * 0.2, -0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath(); // tail
  ctx.moveTo(-r * 0.3, -r * 0.05);
  ctx.quadraticCurveTo(-r * 0.7, -r * 0.2, -r * 0.95, -r * 0.08);
  ctx.quadraticCurveTo(-r * 0.6, r * 0.08, -r * 0.3, r * 0.1);
  ctx.fill();
  ctx.beginPath(); // neck and head
  ctx.moveTo(r * 0.25, -r * 0.1);
  ctx.quadraticCurveTo(r * 0.45, -r * 0.45, r * 0.62, -r * 0.42);
  ctx.lineTo(r * 0.82, -r * 0.36);
  ctx.lineTo(r * 0.6, -r * 0.28);
  ctx.quadraticCurveTo(r * 0.45, -r * 0.2, r * 0.32, r * 0.05);
  ctx.fill();
  ctx.lineWidth = r * 0.09; // legs mid-stride
  ctx.strokeStyle = '#3a3226';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, r * 0.1);
  ctx.lineTo(r * 0.2, r * 0.45);
  ctx.lineTo(r * 0.32, r * 0.62);
  ctx.moveTo(-r * 0.05, r * 0.1);
  ctx.lineTo(-r * 0.22, r * 0.4);
  ctx.lineTo(-r * 0.4, r * 0.52);
  ctx.stroke();
};

/** A broad fern leaflet (white, tinted green per particle). */
export const leaf: Sprite = (ctx, r) => {
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.9);
  ctx.quadraticCurveTo(r * 0.55, -r * 0.2, 0, r * 0.9);
  ctx.quadraticCurveTo(-r * 0.55, -r * 0.2, 0, -r * 0.9);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = r * 0.06;
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.8);
  ctx.lineTo(0, r * 0.85);
  ctx.stroke();
};

/** A curved piece of eggshell. */
export const shell: Sprite = (ctx, r) => {
  ctx.fillStyle = '#f3ead2';
  ctx.beginPath();
  ctx.moveTo(-r * 0.7, 0);
  ctx.quadraticCurveTo(-r * 0.6, -r * 0.7, 0, -r * 0.75);
  ctx.quadraticCurveTo(r * 0.6, -r * 0.7, r * 0.7, 0);
  ctx.lineTo(r * 0.4, r * 0.2);
  ctx.lineTo(r * 0.15, -r * 0.05);
  ctx.lineTo(-r * 0.1, r * 0.25);
  ctx.lineTo(-r * 0.4, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#8a9a5b';
  for (const [x, y] of [
    [-0.3, -0.4],
    [0.2, -0.5],
    [0.35, -0.2],
  ]) {
    ctx.beginPath();
    ctx.arc(x * r, y * r, r * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }
};

/** A cartoon puff of dust. */
export const dust: Sprite = (ctx, r) => {
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

/** A giant prehistoric dragonfly, flying right. */
export const dragonfly: Sprite = (ctx, r) => {
  ctx.fillStyle = 'rgba(200, 235, 255, 0.85)';
  for (const [y, s] of [
    [-0.18, 1],
    [0.12, 0.85],
  ]) {
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * r * 0.08, y * r, r * 0.5 * s, r * 0.1, side * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = '#2f6f7a';
  ctx.fillRect(-r * 0.75, -r * 0.04, r * 1.4, r * 0.08);
  ctx.beginPath();
  ctx.arc(r * 0.68, 0, r * 0.09, 0, Math.PI * 2);
  ctx.fill();
};

export const atlas = () =>
  makeAtlas([
    ptero, // 0
    raptor, // 1
    leaf, // 2
    shell, // 3
    dust, // 4
    dragonfly, // 5
    shapes.sparkle(), // 6
    shapes.circle('#fff', true), // 7: water drops
  ]);
