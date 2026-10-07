/** gameshow: confetti and celebration sprite shapes, drawn once into a texture atlas. */
import { makeAtlas, shapes, type Sprite } from '../../fx/atlas';

// ------------------------------------------------------------------ sprites

export const balloon: Sprite = (ctx, r) => {
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.2, r * 0.55, r * 0.68, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-r * 0.08, r * 0.48);
  ctx.lineTo(r * 0.08, r * 0.48);
  ctx.lineTo(0, r * 0.58);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = r * 0.03;
  ctx.beginPath();
  ctx.moveTo(0, r * 0.58);
  ctx.quadraticCurveTo(r * 0.12, r * 0.78, 0, r * 0.98);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.2, -r * 0.45, r * 0.1, r * 0.17, -0.4, 0, Math.PI * 2);
  ctx.fill();
};

export const coin: Sprite = (ctx, r) => {
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = r * 0.1;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
  ctx.stroke();
  shapes.star(5, 0.45, 'rgba(0,0,0,0.22)')(ctx, r * 0.42);
};

export const atlas = () =>
  makeAtlas([
    shapes.strip(0.16), // ticker tape
    shapes.strip(0.4), // confetti
    shapes.star(5, 0.45),
    balloon,
    coin,
    shapes.sparkle(),
    shapes.glow(),
  ]);
