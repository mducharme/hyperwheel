/** pixel: winner celebrations. Each `setup` runs once when the scene loads (so shaders compile up front) and returns the function that plays it. */
import type { Celebration } from '../types';
import { atlas } from './sprites';
import { PALETTE } from './meta';
import type { PixelScene } from '.';

export const celebrations = (world: PixelScene): Celebration[] => {
  const sprites = atlas();
  return [
    {
      name: 'Coin Shower',
      setup(fx) {
        const coins = fx.particles({
          count: 260,
          atlas: sprites,
          cells: [0],
          colors: ['#ffd23f', '#ffc21a'],
          tint: 1,
          intensity: 1.3,
          mode: 'face',
          mirror: false,
          emitters: [{ at: [0, 11, 0.5], box: [11, 0.5, 3], dir: [0, -1, 0], spread: 0.2, speed: [3, 6], delay: [0, 2] }],
          size: [0.35, 0.5],
          gravity: [0, -9, 0],
          drag: 0.3,
          life: [2, 2.6],
        });
        return () => {
          world.bumpAll();
          coins.fire();
          for (let i = 0; i < 8; i++) fx.sfx.pop(i * 0.18, 1.8 + i * 0.1);
        };
      },
    },
    {
      name: '1-UP',
      setup(fx) {
        const ups = fx.particles({
          count: 14,
          atlas: sprites,
          cells: [4],
          colors: ['#3ddc84'],
          tint: 1,
          intensity: 1.5,
          mode: 'face',
          mirror: false,
          emitters: [{ at: [0, 5, 1.2], box: [7, 2.5, 0.5], dir: [0, 1, 0], spread: 0.05, speed: [1.2, 1.8], delay: [0, 1.4] }],
          size: [1.1, 1.4],
          gravity: [0, 0, 0],
          drag: 0.2,
          life: [1.6, 2],
        });
        const hearts = fx.particles({
          count: 120,
          atlas: sprites,
          cells: [3],
          colors: ['#ff4d4d', '#ff8c9e'],
          tint: 1,
          mirror: false,
          emitters: [{ at: [0, 3.9, 0.6], dir: [0, 0.6, 1], spread: 1.4, speed: [4, 8] }],
          size: [0.25, 0.4],
          gravity: [0, -6, 0],
          drag: 0.8,
          life: [1.8, 2.4],
        });
        return () => {
          ups.fire();
          hearts.fire();
          fx.stunt('hop');
          fx.sfx.pop(0, 1.6);
          fx.sfx.pop(0.15, 2);
        };
      },
    },
    {
      name: 'Pixel Explosion',
      setup(fx) {
        const pixels = fx.particles({
          count: 700,
          atlas: sprites,
          cells: [1],
          colors: PALETTE,
          tint: 1,
          intensity: 1.4,
          mirror: false,
          emitters: [{ at: [0, 3.9, 0.4], box: [3, 3, 0.2], dir: [0, 0.3, 1], spread: 1.9, speed: [5, 12] }],
          size: [0.14, 0.26],
          gravity: [0, -9, 0],
          drag: 0.6,
          life: [1.8, 2.6],
        });
        return () => {
          pixels.fire();
          fx.flash('#ffffff', 0.35, 0.25);
          fx.shake(0.4, 0.6);
          fx.sfx.boom(0, 1);
          fx.ripple(0.8);
        };
      },
    },
    {
      name: 'Power-Up',
      setup(fx) {
        const stars = fx.particles({
          count: 220,
          atlas: sprites,
          cells: [2],
          colors: ['#ffd23f', '#ffffff', '#ff8c2e'],
          tint: 1,
          intensity: 2,
          blend: 'additive',
          mirror: false,
          emitters: [{ at: [0, 3.9, 0.4], box: [4, 4, 0.3], dir: [0, 1, 0.3], spread: 1.4, speed: [2, 6], delay: [0, 1.8] }],
          size: [0.25, 0.45],
          gravity: [0, 1, 0],
          drag: 1,
          life: [1.2, 1.8],
          spin: 4,
        });
        return () => {
          stars.fire();
          fx.stunt('jelly', 1.8);
          fx.zoom(0.08, 2);
          for (let i = 0; i < 6; i++) fx.after(i * 0.12, () => fx.flash(PALETTE[i % PALETTE.length], 0.12, 0.12));
          fx.sfx.whoosh();
        };
      },
    },
  ];
};
