/** abyss: confetti and celebration sprite shapes, drawn once into a texture atlas. */
import { makeAtlas, shapes, type Sprite } from '../../fx/atlas';

// ------------------------------------------------------------------ sprites

export const bubble: Sprite = (ctx, r) => {
  const g = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 0.85);
  g.addColorStop(0, 'rgba(255,255,255,0.05)');
  g.addColorStop(1, 'rgba(255,255,255,0.8)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = r * 0.1;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.55, Math.PI * 1.1, Math.PI * 1.45);
  ctx.stroke();
};

export const fish: Sprite = (ctx, r) => {
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(r * 0.1, 0, r * 0.6, r * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-r * 0.4, 0);
  ctx.lineTo(-r * 0.9, -r * 0.4);
  ctx.lineTo(-r * 0.9, r * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#123';
  ctx.beginPath();
  ctx.arc(r * 0.42, -r * 0.08, r * 0.08, 0, Math.PI * 2);
  ctx.fill();
};

export const shell: Sprite = (ctx, r) => {
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(0, r * 0.7);
  ctx.arc(0, r * 0.7, r * 1.3, -Math.PI * 0.78, -Math.PI * 0.22);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = r * 0.06;
  for (let i = -3; i <= 3; i++) {
    const a = -Math.PI / 2 + i * 0.2;
    ctx.beginPath();
    ctx.moveTo(0, r * 0.7);
    ctx.lineTo(Math.cos(a) * r * 1.25, r * 0.7 + Math.sin(a) * r * 1.25);
    ctx.stroke();
  }
};

export const atlas = () =>
  makeAtlas([bubble, fish, shapes.star(5, 0.42), shell, shapes.circle('#fff', true), shapes.glow(), shapes.sparkle()]);
