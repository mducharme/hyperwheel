/** candy: confetti and celebration sprite shapes, drawn once into a texture atlas. */
import { sin } from 'three/tsl';
import { makeAtlas, shapes, type Sprite } from '../../fx/atlas';

// ------------------------------------------------------------------ sprites

export const wrappedCandy: Sprite = (ctx, r) => {
  ctx.fillStyle = '#fff';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * r * 0.45, 0);
    ctx.lineTo(s * r, -r * 0.45);
    ctx.lineTo(s * r, r * 0.45);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.55, r * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = r * 0.08;
  for (const x of [-0.2, 0.1, 0.4]) {
    ctx.beginPath();
    ctx.moveTo(r * (x - 0.15), -r * 0.35);
    ctx.lineTo(r * (x + 0.05), r * 0.35);
    ctx.stroke();
  }
};

export const peppermint: Sprite = (ctx, r) => {
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r * 0.85, (i / 8) * Math.PI * 2, ((i + 1) / 8) * Math.PI * 2);
    ctx.fillStyle = i % 2 ? '#fff' : '#ff3b5c';
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.arc(-r * 0.3, -r * 0.3, r * 0.15, 0, Math.PI * 2);
  ctx.fill();
};

export const donut: Sprite = (ctx, r) => {
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2);
  ctx.arc(0, 0, r * 0.32, 0, Math.PI * 2, true);
  ctx.fillStyle = '#fff';
  ctx.fill('evenodd');
  const sprinkle = ['#ff3b5c', '#3bc9ff', '#ffe03b', '#5cff8a'];
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = r * (0.45 + Math.random() * 0.3);
    ctx.save();
    ctx.translate(Math.cos(a) * d, Math.sin(a) * d);
    ctx.rotate(Math.random() * Math.PI);
    ctx.fillStyle = sprinkle[i % 4];
    ctx.fillRect(-r * 0.08, -r * 0.025, r * 0.16, r * 0.05);
    ctx.restore();
  }
};

export const atlas = () =>
  makeAtlas([
    shapes.strip(0.28),
    shapes.heart(),
    shapes.star(5, 0.5),
    wrappedCandy,
    donut,
    shapes.circle(),
    peppermint,
    shapes.sparkle(),
  ]);
