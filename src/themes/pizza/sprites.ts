/** pizza: confetti and celebration sprite shapes, drawn once into a texture atlas. */
import { makeAtlas, shapes, type Sprite } from '../../fx/atlas';

/** A pepperoni slice with darker spots (tinted per particle). */
export const pepperoni: Sprite = (ctx, r) => {
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (const [x, y] of [
    [-0.3, -0.2],
    [0.25, -0.3],
    [0.1, 0.3],
    [-0.25, 0.35],
    [0.4, 0.15],
  ]) {
    ctx.beginPath();
    ctx.arc(x * r, y * r, r * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }
};

/** A basil leaf. */
export const leaf: Sprite = (ctx, r) => {
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.85);
  ctx.quadraticCurveTo(r * 0.6, -r * 0.2, 0, r * 0.85);
  ctx.quadraticCurveTo(-r * 0.6, -r * 0.2, 0, -r * 0.85);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = r * 0.06;
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.7);
  ctx.lineTo(0, r * 0.7);
  ctx.stroke();
};

/** A pizza slice: crust along the top edge, a dot of pepperoni. */
export const slice: Sprite = (ctx, r) => {
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.moveTo(-r * 0.7, -r * 0.6);
  ctx.lineTo(r * 0.7, -r * 0.6);
  ctx.lineTo(0, r * 0.85);
  ctx.fill();
  ctx.fillStyle = '#c47a35';
  ctx.beginPath();
  ctx.roundRect(-r * 0.78, -r * 0.82, r * 1.56, r * 0.3, r * 0.15);
  ctx.fill();
  ctx.fillStyle = '#d62828';
  for (const [x, y] of [
    [-0.22, -0.25],
    [0.2, -0.2],
    [0, 0.25],
  ]) {
    ctx.beginPath();
    ctx.arc(x * r, y * r, r * 0.13, 0, Math.PI * 2);
    ctx.fill();
  }
};

/** A soft puff of flour or smoke. */
export const puff: Sprite = (ctx, r) => {
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.9);
  g.addColorStop(0, 'rgba(255,255,255,0.45)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.2)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2);
  ctx.fill();
};

export const atlas = () =>
  makeAtlas([
    pepperoni, // 0
    leaf, // 1
    slice, // 2: full-colour
    puff, // 3
    shapes.glow(), // 4: embers
    shapes.circle('#fff', true), // 5: olives, cheese bits
  ]);
