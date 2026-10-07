/** tiki: confetti and celebration sprite shapes, drawn once into a texture atlas. */
import { makeAtlas, shapes, type Sprite } from '../../fx/atlas';

// ------------------------------------------------------------------ sprites

export const flower = (petal: string, centre: string): Sprite => (ctx, r) => {
  for (let i = 0; i < 5; i++) {
    ctx.save();
    ctx.rotate((i / 5) * Math.PI * 2);
    ctx.fillStyle = petal;
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.45, r * 0.3, r * 0.48, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = centre;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2);
  ctx.fill();
};

export const leaf: Sprite = (ctx, r) => {
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.95);
  ctx.quadraticCurveTo(r * 0.45, -r * 0.1, 0, r * 0.95);
  ctx.quadraticCurveTo(-r * 0.45, -r * 0.1, 0, -r * 0.95);
  ctx.fill();
};

export const atlas = () =>
  makeAtlas([
    flower('#ff4d6d', '#ffd23f'), // hibiscus-ish
    flower('#fff6e0', '#ffcf2f'), // plumeria-ish
    flower('#ff9fd0', '#fff'),
    leaf,
    shapes.sparkle(),
    shapes.glow(),
    shapes.circle('#fff', false),
  ]);
