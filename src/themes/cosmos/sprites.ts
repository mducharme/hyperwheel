/** cosmos: confetti and celebration sprite shapes, drawn once into a texture atlas. */
import { makeAtlas, shapes, type Sprite } from '../../fx/atlas';

// ------------------------------------------------------------------ sprites

export const ringedPlanet: Sprite = (ctx, r) => {
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = r * 0.1;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.95, r * 0.28, -0.35, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(-r * 0.5, -r * 0.08, r, r * 0.12);
};

export const comet: Sprite = (ctx, r) => {
  const g = ctx.createLinearGradient(-r, 0, r * 0.6, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(255,255,255,0.9)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-r, -r * 0.05);
  ctx.lineTo(r * 0.55, -r * 0.3);
  ctx.lineTo(r * 0.55, r * 0.3);
  ctx.lineTo(-r, r * 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(r * 0.55, 0, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
};

export const crescent: Sprite = (ctx, r) => {
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2);
  ctx.arc(r * 0.35, -r * 0.2, r * 0.65, 0, Math.PI * 2, true);
  ctx.fill('evenodd');
};

export const saucer: Sprite = (ctx, r) => {
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.15, r * 0.35, r * 0.32, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.9, r * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  for (const x of [-0.5, 0, 0.5]) {
    ctx.beginPath();
    ctx.arc(x * r, r * 0.02, r * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }
};

export const atlas = () => makeAtlas([shapes.sparkle(), shapes.star(5, 0.45), ringedPlanet, comet, crescent, saucer, shapes.glow()]);
