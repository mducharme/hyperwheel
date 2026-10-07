/** pirates: confetti and celebration sprite shapes, drawn once into a texture atlas. */
import { makeAtlas, shapes, type Sprite } from '../../fx/atlas';

/** A gold doubloon with a stamped rim. */
export const coin: Sprite = (ctx, r) => {
  ctx.fillStyle = '#f2c14e';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#b8862b';
  ctx.lineWidth = r * 0.1;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#b8862b';
  ctx.font = `bold ${r * 0.8}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('✠', 0, r * 0.04);
};

/** A cut gemstone (white, tinted per particle). */
export const gem: Sprite = (ctx, r) => {
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(-r * 0.8, -r * 0.2);
  ctx.lineTo(-r * 0.4, -r * 0.65);
  ctx.lineTo(r * 0.4, -r * 0.65);
  ctx.lineTo(r * 0.8, -r * 0.2);
  ctx.lineTo(0, r * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = r * 0.06;
  ctx.beginPath();
  ctx.moveTo(-r * 0.8, -r * 0.2);
  ctx.lineTo(r * 0.8, -r * 0.2);
  ctx.moveTo(-r * 0.3, -r * 0.2);
  ctx.lineTo(0, r * 0.8);
  ctx.lineTo(r * 0.3, -r * 0.2);
  ctx.stroke();
};

/** A tiny Jolly Roger: skull and crossbones on black. */
export const jollyRoger: Sprite = (ctx, r) => {
  ctx.fillStyle = '#141414';
  ctx.fillRect(-r * 0.85, -r * 0.6, r * 1.7, r * 1.2);
  ctx.strokeStyle = '#f4f1e8';
  ctx.lineCap = 'round';
  ctx.lineWidth = r * 0.14;
  ctx.beginPath();
  ctx.moveTo(-r * 0.5, r * 0.35);
  ctx.lineTo(r * 0.5, -r * 0.05);
  ctx.moveTo(r * 0.5, r * 0.35);
  ctx.lineTo(-r * 0.5, -r * 0.05);
  ctx.stroke();
  ctx.fillStyle = '#f4f1e8';
  ctx.beginPath();
  ctx.arc(0, -r * 0.18, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#141414';
  for (const x of [-0.12, 0.12]) {
    ctx.beginPath();
    ctx.arc(x * r, -r * 0.2, r * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }
};

/** A cartoon puff of cannon smoke. */
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

/** A gull: two curved wings. */
export const gull: Sprite = (ctx, r) => {
  ctx.strokeStyle = '#f7f4ec';
  ctx.lineWidth = r * 0.14;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-r * 0.85, -r * 0.05);
  ctx.quadraticCurveTo(-r * 0.45, -r * 0.45, 0, r * 0.08);
  ctx.quadraticCurveTo(r * 0.45, -r * 0.45, r * 0.85, -r * 0.05);
  ctx.stroke();
};

export const atlas = () =>
  makeAtlas([
    coin, // 0
    gem, // 1
    jollyRoger, // 2
    puff, // 3: cannon smoke
    gull, // 4
    shapes.circle('#fff', true), // 5: sea spray
    shapes.sparkle(), // 6
    shapes.glow(), // 7: muzzle flash
  ]);
