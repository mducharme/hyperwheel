import * as THREE from 'three/webgpu';

/** Draws one sprite centred at (0,0) within radius `r`. */
export type Sprite = (ctx: CanvasRenderingContext2D, r: number) => void;

export interface Atlas {
  texture: THREE.CanvasTexture;
  grid: number;
  count: number;
}

/**
 * Packs procedurally drawn sprites into a square texture atlas. Sprites are
 * drawn in white/greys where they should take the particle's tint, or in full
 * colour where they shouldn't (see ParticleOptions.tint).
 */
export function makeAtlas(sprites: Sprite[], cell = 128): Atlas {
  const grid = Math.ceil(Math.sqrt(sprites.length));
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = grid * cell;
  const ctx = canvas.getContext('2d')!;
  sprites.forEach((draw, i) => {
    ctx.save();
    ctx.translate((i % grid) * cell + cell / 2, Math.floor(i / grid) * cell + cell / 2);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    draw(ctx, cell * 0.42);
    ctx.restore();
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return { texture, grid, count: sprites.length };
}

// ------------------------------------------------------------------ shape kit

const path = (ctx: CanvasRenderingContext2D, pts: [number, number][]) => {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
};

export const shapes = {
  star:
    (points = 5, inner = 0.45, fill = '#fff'): Sprite =>
    (ctx, r) => {
      const pts: [number, number][] = [];
      for (let i = 0; i < points * 2; i++) {
        const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 ? r * inner : r;
        pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
      }
      path(ctx, pts);
      ctx.fillStyle = fill;
      ctx.fill();
    },

  /** Four-point twinkle with a soft halo — reads as light, great with additive blending. */
  sparkle: (): Sprite => (ctx, r) => {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.fillStyle = '#fff';
    for (const rot of [0, Math.PI / 2]) {
      ctx.save();
      ctx.rotate(rot);
      ctx.beginPath();
      ctx.moveTo(-r, 0);
      ctx.quadraticCurveTo(0, r * 0.08, r, 0);
      ctx.quadraticCurveTo(0, -r * 0.08, -r, 0);
      ctx.fill();
      ctx.restore();
    }
  },

  /** Soft round glow, for sparks and streaks. */
  glow: (): Sprite => (ctx, r) => {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-r, -r, r * 2, r * 2);
  },

  heart:
    (fill = '#fff'): Sprite =>
    (ctx, r) => {
      ctx.beginPath();
      ctx.moveTo(0, r * 0.9);
      ctx.bezierCurveTo(-r * 1.3, r * 0.05, -r * 0.65, -r * 1.05, 0, -r * 0.35);
      ctx.bezierCurveTo(r * 0.65, -r * 1.05, r * 1.3, r * 0.05, 0, r * 0.9);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.ellipse(-r * 0.4, -r * 0.35, r * 0.16, r * 0.1, -0.6, 0, Math.PI * 2);
      ctx.fill();
    },

  circle:
    (fill = '#fff', shine = true): Sprite =>
    (ctx, r) => {
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      if (shine) {
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.arc(-r * 0.3, -r * 0.3, r * 0.18, 0, Math.PI * 2);
        ctx.fill();
      }
    },

  ring:
    (width = 0.18, stroke = '#fff'): Sprite =>
    (ctx, r) => {
      ctx.beginPath();
      ctx.arc(0, 0, r * (0.85 - width / 2), 0, Math.PI * 2);
      ctx.lineWidth = r * width;
      ctx.strokeStyle = stroke;
      ctx.stroke();
    },

  triangle:
    (outline = false): Sprite =>
    (ctx, r) => {
      path(ctx, [
        [0, -r * 0.9],
        [r * 0.8, r * 0.6],
        [-r * 0.8, r * 0.6],
      ]);
      if (outline) {
        ctx.lineWidth = r * 0.2;
        ctx.strokeStyle = '#fff';
        ctx.stroke();
      } else {
        ctx.fillStyle = '#fff';
        ctx.fill();
      }
    },

  /** Rounded strip — paper confetti or a sprinkle. */
  strip:
    (w = 0.35, fill = '#fff'): Sprite =>
    (ctx, r) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.roundRect(-r * w, -r, r * w * 2, r * 2, r * w);
      ctx.fill();
    },

  zigzag: (): Sprite => (ctx, r) => {
    ctx.beginPath();
    for (let i = 0; i <= 4; i++) ctx.lineTo(-r + (i / 4) * r * 2, i % 2 ? r * 0.4 : -r * 0.4);
    ctx.lineWidth = r * 0.22;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
  },

  bolt: (): Sprite => (ctx, r) => {
    path(ctx, [
      [r * 0.2, -r],
      [-r * 0.55, r * 0.1],
      [-r * 0.05, r * 0.1],
      [-r * 0.25, r],
      [r * 0.55, -r * 0.15],
      [r * 0.05, -r * 0.15],
    ]);
    ctx.fillStyle = '#fff';
    ctx.fill();
  },

  plus: (): Sprite => (ctx, r) => {
    ctx.fillStyle = '#fff';
    ctx.fillRect(-r * 0.2, -r * 0.8, r * 0.4, r * 1.6);
    ctx.fillRect(-r * 0.8, -r * 0.2, r * 1.6, r * 0.4);
  },
};
