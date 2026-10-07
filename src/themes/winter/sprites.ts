/** winter: confetti and celebration sprite shapes, drawn once into a texture atlas. */
import { makeAtlas, shapes, type Sprite } from '../../fx/atlas';

// ------------------------------------------------------------------ sprites

export const snowflake: Sprite = (ctx, r) => {
  ctx.strokeStyle = '#fff';
  ctx.lineCap = 'round';
  ctx.lineWidth = r * 0.09;
  for (let i = 0; i < 6; i++) {
    ctx.save();
    ctx.rotate((i / 6) * Math.PI * 2);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -r * 0.85);
    for (const [y, w] of [
      [0.35, 0.22],
      [0.6, 0.16],
    ]) {
      ctx.moveTo(0, -r * y);
      ctx.lineTo(-r * w, -r * (y + w));
      ctx.moveTo(0, -r * y);
      ctx.lineTo(r * w, -r * (y + w));
    }
    ctx.stroke();
    ctx.restore();
  }
};

export const present: Sprite = (ctx, r) => {
  ctx.fillStyle = '#fff';
  ctx.fillRect(-r * 0.65, -r * 0.45, r * 1.3, r * 1.15);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(-r * 0.12, -r * 0.45, r * 0.24, r * 1.15);
  ctx.fillRect(-r * 0.65, r * 0.0, r * 1.3, r * 0.2);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = r * 0.1;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(s * r * 0.22, -r * 0.6, r * 0.22, r * 0.13, s * 0.5, 0, Math.PI * 2);
    ctx.stroke();
  }
};

export const atlas = () => makeAtlas([snowflake, shapes.star(5, 0.45), shapes.sparkle(), shapes.glow(), present, shapes.circle('#fff', true)]);
