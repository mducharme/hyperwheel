/** haunted: confetti and celebration sprite shapes, drawn once into a texture atlas. */
import { makeAtlas, shapes, type Sprite } from '../../fx/atlas';

// ------------------------------------------------------------------ sprites (original silhouettes)

export const bat: Sprite = (ctx, r) => {
  ctx.fillStyle = '#241433';
  ctx.strokeStyle = '#7a4fb0';
  ctx.lineWidth = r * 0.05;
  ctx.beginPath();
  // body + scalloped wings
  ctx.moveTo(0, -r * 0.25);
  ctx.quadraticCurveTo(r * 0.35, -r * 0.55, r * 0.95, -r * 0.35);
  ctx.quadraticCurveTo(r * 0.8, -r * 0.05, r * 0.85, r * 0.15);
  ctx.quadraticCurveTo(r * 0.62, 0, r * 0.52, r * 0.18);
  ctx.quadraticCurveTo(r * 0.38, r * 0.02, r * 0.22, r * 0.25);
  ctx.quadraticCurveTo(r * 0.1, r * 0.1, 0, r * 0.35);
  ctx.quadraticCurveTo(-r * 0.1, r * 0.1, -r * 0.22, r * 0.25);
  ctx.quadraticCurveTo(-r * 0.38, r * 0.02, -r * 0.52, r * 0.18);
  ctx.quadraticCurveTo(-r * 0.62, 0, -r * 0.85, r * 0.15);
  ctx.quadraticCurveTo(-r * 0.8, -r * 0.05, -r * 0.95, -r * 0.35);
  ctx.quadraticCurveTo(-r * 0.35, -r * 0.55, 0, -r * 0.25);
  ctx.fill();
  ctx.stroke();
  // ears + glowing eyes
  ctx.beginPath();
  ctx.moveTo(-r * 0.12, -r * 0.2);
  ctx.lineTo(-r * 0.08, -r * 0.42);
  ctx.lineTo(-r * 0.02, -r * 0.22);
  ctx.moveTo(r * 0.12, -r * 0.2);
  ctx.lineTo(r * 0.08, -r * 0.42);
  ctx.lineTo(r * 0.02, -r * 0.22);
  ctx.fill();
  ctx.fillStyle = '#ffd23f';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(s * r * 0.06, -r * 0.12, r * 0.035, 0, Math.PI * 2);
    ctx.fill();
  }
};

export const ghost: Sprite = (ctx, r) => {
  ctx.fillStyle = '#f4f1ff';
  ctx.beginPath();
  ctx.moveTo(-r * 0.55, r * 0.75);
  ctx.lineTo(-r * 0.55, -r * 0.2);
  ctx.arc(0, -r * 0.2, r * 0.55, Math.PI, 0);
  ctx.lineTo(r * 0.55, r * 0.75);
  for (let i = 0; i < 4; i++) {
    const x0 = r * 0.55 - (i * r * 1.1) / 4;
    ctx.quadraticCurveTo(x0 - r * 0.14, r * 0.95, x0 - r * 0.275, r * 0.75);
  }
  ctx.fill();
  ctx.fillStyle = '#20142e';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(s * r * 0.2, -r * 0.2, r * 0.08, r * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(0, r * 0.08, r * 0.1, r * 0.13, 0, 0, Math.PI * 2);
  ctx.fill();
};

export const candyCorn: Sprite = (ctx, r) => {
  const tri = (y0: number, y1: number, color: string) => {
    const w = (y: number) => ((y + r * 0.85) / (r * 1.7)) * r * 0.7;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-w(y0), y0);
    ctx.lineTo(w(y0), y0);
    ctx.lineTo(w(y1), y1);
    ctx.lineTo(-w(y1), y1);
    ctx.closePath();
    ctx.fill();
  };
  tri(-r * 0.85, -r * 0.25, '#fff6e0');
  tri(-r * 0.25, r * 0.35, '#ff8a1f');
  tri(r * 0.35, r * 0.85, '#ffd23f');
};

export const miniPumpkin: Sprite = (ctx, r) => {
  ctx.fillStyle = '#ff7a1a';
  for (const dx of [-0.32, 0.32, 0]) {
    ctx.beginPath();
    ctx.ellipse(dx * r, r * 0.08, r * (dx ? 0.42 : 0.48), r * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(120,40,0,0.45)';
  ctx.lineWidth = r * 0.05;
  for (const dx of [-0.2, 0.2]) {
    ctx.beginPath();
    ctx.ellipse(dx * r, r * 0.08, r * 0.12, r * 0.6, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#3d7a2a';
  ctx.fillRect(-r * 0.06, -r * 0.75, r * 0.12, r * 0.25);
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.moveTo(-r * 0.3, -r * 0.05);
  ctx.lineTo(-r * 0.15, -r * 0.2);
  ctx.lineTo(-r * 0.05, -r * 0.05);
  ctx.moveTo(r * 0.3, -r * 0.05);
  ctx.lineTo(r * 0.15, -r * 0.2);
  ctx.lineTo(r * 0.05, -r * 0.05);
  ctx.fill();
};

export const wrapped: Sprite = (ctx, r) => {
  ctx.fillStyle = '#fff';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * r * 0.4, 0);
    ctx.lineTo(s * r * 0.95, -r * 0.4);
    ctx.lineTo(s * r * 0.95, r * 0.4);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.5, r * 0.36, 0, 0, Math.PI * 2);
  ctx.fill();
};

export const atlas = () => makeAtlas([bat, ghost, candyCorn, miniPumpkin, wrapped, shapes.sparkle(), shapes.glow()]);
