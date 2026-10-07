/** crystal: confetti and celebration sprite shapes, drawn once into a texture atlas. */
import { makeAtlas, shapes, type Sprite } from '../../fx/atlas';

/** A faceted gem (white, tinted per particle). */
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
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = r * 0.06;
  ctx.beginPath();
  ctx.moveTo(-r * 0.8, -r * 0.2);
  ctx.lineTo(r * 0.8, -r * 0.2);
  ctx.moveTo(-r * 0.3, -r * 0.2);
  ctx.lineTo(0, r * 0.8);
  ctx.lineTo(r * 0.3, -r * 0.2);
  ctx.stroke();
};

/** A long thin crystal shard. */
export const shard: Sprite = (ctx, r) => {
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.9);
  ctx.lineTo(r * 0.22, -r * 0.4);
  ctx.lineTo(r * 0.18, r * 0.9);
  ctx.lineTo(-r * 0.18, r * 0.9);
  ctx.lineTo(-r * 0.22, -r * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.9);
  ctx.lineTo(r * 0.22, -r * 0.4);
  ctx.lineTo(r * 0.18, r * 0.9);
  ctx.lineTo(0, r * 0.9);
  ctx.closePath();
  ctx.fill();
};

/** A rough pebble for falling dust and the cart's ore. */
export const pebble: Sprite = (ctx, r) => {
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.55 + ((i * 37) % 10) / 40);
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
};

export const atlas = () =>
  makeAtlas([
    gem, // 0
    shard, // 1
    shapes.sparkle(), // 2
    shapes.glow(), // 3: spores, sparks
    pebble, // 4
    shapes.star(4, 0.3), // 5: glints
  ]);
