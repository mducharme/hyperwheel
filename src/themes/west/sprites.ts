/** west: confetti and celebration sprite shapes, drawn once into a texture atlas. */
import { makeAtlas, shapes, type Sprite } from '../../fx/atlas';

/** A cowboy hat, side on. */
export const hat: Sprite = (ctx, r) => {
  ctx.fillStyle = '#fff';
  ctx.beginPath(); // brim, curled up at the ends
  ctx.moveTo(-r * 0.9, r * 0.05);
  ctx.quadraticCurveTo(-r * 0.75, r * 0.3, 0, r * 0.28);
  ctx.quadraticCurveTo(r * 0.75, r * 0.3, r * 0.9, r * 0.05);
  ctx.quadraticCurveTo(r * 0.7, r * 0.18, 0, r * 0.14);
  ctx.quadraticCurveTo(-r * 0.7, r * 0.18, -r * 0.9, r * 0.05);
  ctx.fill();
  ctx.beginPath(); // crown with its pinch
  ctx.moveTo(-r * 0.42, r * 0.16);
  ctx.quadraticCurveTo(-r * 0.48, -r * 0.45, -r * 0.18, -r * 0.5);
  ctx.quadraticCurveTo(0, -r * 0.38, r * 0.18, -r * 0.5);
  ctx.quadraticCurveTo(r * 0.48, -r * 0.45, r * 0.42, r * 0.16);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(-r * 0.43, r * 0.02, r * 0.86, r * 0.1); // hat band
};

/** A rough gold nugget. */
export const nugget: Sprite = (ctx, r) => {
  ctx.fillStyle = '#f2c14e';
  ctx.beginPath();
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.55 + ((i * 29) % 10) / 30);
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,230,0.7)';
  ctx.beginPath();
  ctx.arc(-r * 0.18, -r * 0.2, r * 0.16, 0, Math.PI * 2);
  ctx.fill();
};

/** A six-pointed sheriff's star with ball tips. */
export const badge: Sprite = (ctx, r) => {
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.42 : r * 0.78;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }
};

/** A hawk gliding to the right, in silhouette. */
export const hawk: Sprite = (ctx, r) => {
  ctx.fillStyle = '#3a2c22';
  ctx.beginPath();
  ctx.moveTo(-r * 0.9, -r * 0.1);
  ctx.quadraticCurveTo(-r * 0.4, -r * 0.2, -r * 0.05, r * 0.02);
  ctx.lineTo(r * 0.35, r * 0.0);
  ctx.lineTo(r * 0.5, r * 0.06);
  ctx.lineTo(r * 0.35, r * 0.1);
  ctx.lineTo(r * 0.05, r * 0.1);
  ctx.quadraticCurveTo(r * 0.4, -r * 0.2, r * 0.9, -r * 0.1);
  ctx.quadraticCurveTo(r * 0.4, r * 0.12, 0, r * 0.18);
  ctx.lineTo(-r * 0.22, r * 0.26);
  ctx.lineTo(-r * 0.1, r * 0.14);
  ctx.quadraticCurveTo(-r * 0.4, r * 0.12, -r * 0.9, -r * 0.1);
  ctx.fill();
};

/** A cartoon puff of dust or smoke. */
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

export const atlas = () =>
  makeAtlas([
    hat, // 0
    nugget, // 1
    badge, // 2
    hawk, // 3
    puff, // 4: dust, smoke
    shapes.strip(0.22), // 5: splinters
    shapes.glow(), // 6: sparks, flash
    shapes.sparkle(), // 7
  ]);
