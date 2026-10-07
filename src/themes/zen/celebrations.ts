/** zen: winner celebrations. Each `setup` runs once when the scene loads (so shaders compile up front) and returns the function that plays it. */
import type { Celebration } from '../types';
import { atlas } from './sprites';
import { POND } from './layout';
import type { ZenScene } from '.';

const BLOSSOM = ['#f6b3c6', '#ffd6e0', '#ffffff', '#f48fb1'];

export const celebrations = (world: ZenScene): Celebration[] => {
  const sprites = atlas();
  return [
    {
      name: 'Petal Storm',
      setup(fx) {
        const storm = fx.particles({
          count: 1400,
          atlas: sprites,
          cells: [0],
          colors: BLOSSOM,
          tint: 1,
          mode: 'tumble',
          emitters: [{ at: [-15, 5, 0], box: [2, 5, 5], dir: [1, 0.1, 0.05], spread: 0.35, speed: [6, 11], delay: [0, 2] }],
          size: [0.16, 0.26],
          gravity: [0, -0.6, 0],
          drag: 0.4,
          life: [3.5, 5],
          spin: 4,
          wobble: 0.7,
        });
        return () => {
          storm.fire();
          world.gust(4);
          fx.sfx.whoosh();
          fx.after(0.8, () => fx.sfx.whoosh());
          fx.orbit(0.3, 3.4);
        };
      },
    },
    {
      name: 'Lantern Rise',
      setup(fx) {
        const lanterns = fx.particles({
          count: 70,
          atlas: sprites,
          cells: [1],
          mode: 'face',
          intensity: 1.6,
          mirror: false,
          emitters: [{ at: [0, 0.8, -1], box: [9, 0.3, 4], dir: [0, 1, 0], spread: 0.15, speed: [0.8, 1.6], delay: [0, 2.5] }],
          size: [0.45, 0.75],
          gravity: [0.1, 0.25, 0],
          drag: 0.3,
          life: [6, 8],
          wobble: 0.5,
        });
        const glow = fx.particles({
          count: 70,
          atlas: sprites,
          cells: [6],
          colors: ['#ffb36b'],
          mode: 'face',
          blend: 'additive',
          intensity: 1.4,
          mirror: false,
          emitters: [{ at: [0, 0.8, -1], box: [9, 0.3, 4], dir: [0, 1, 0], spread: 0.15, speed: [0.8, 1.6], delay: [0, 2.5] }],
          size: [1.2, 1.8],
          gravity: [0.1, 0.25, 0],
          drag: 0.3,
          life: [6, 8],
          wobble: 0.5,
        });
        return () => {
          lanterns.fire();
          glow.fire();
          fx.flash('#ffd6a5', 0.1, 1.5);
          fx.zoom(-0.06, 4);
        };
      },
    },
    {
      name: 'Koi Leap',
      setup(fx) {
        const koi = fx.particles({
          count: 9,
          atlas: sprites,
          cells: [2],
          mode: 'face',
          upright: true, // level, and turned the way they leap
          mirror: false,
          emitters: [{ at: [POND.x, 0.1, POND.z], box: [0.8, 0, 0.6], dir: [-0.35, 1, 0.1], spread: 0.25, speed: [6, 8], delay: [0, 1.6] }],
          size: [0.85, 1.05],
          gravity: [0, -9, 0],
          drag: 0.1,
          life: [1.5, 1.7],
        });
        const splash = fx.particles({
          count: 220,
          atlas: sprites,
          cells: [4],
          colors: ['#ffffff', '#d9f0f2'],
          tint: 1,
          mode: 'face',
          mirror: false,
          emitters: [{ at: [POND.x, 0.1, POND.z], box: [1, 0, 0.8], dir: [0, 1, 0], spread: 0.6, speed: [2, 5], delay: [0, 1.8] }],
          size: [0.06, 0.14],
          gravity: [0, -9, 0],
          drag: 0.4,
          life: [0.8, 1.2],
        });
        return () => {
          koi.fire();
          splash.fire();
          world.ripple();
          fx.sfx.pop(0, 0.8);
          fx.sfx.pop(0.6, 0.9);
          fx.sfx.pop(1.2, 0.85);
        };
      },
    },
    {
      name: 'Gong',
      setup(fx) {
        const wave = fx.shockwave({ color: '#ffd6a5', radius: 18, width: 0.06, duration: 1.8, intensity: 1.8 });
        const petals = fx.particles({
          count: 500,
          atlas: sprites,
          cells: [0],
          colors: BLOSSOM,
          tint: 1,
          mode: 'tumble',
          mirror: false,
          emitters: [{ at: [0, 11, -2], box: [12, 1, 6], dir: [0, -1, 0], spread: 0.4, speed: [0.5, 1.5], delay: [0.3, 2] }],
          size: [0.09, 0.15],
          gravity: [0.2, -0.8, 0],
          drag: 1.2,
          life: [5, 7],
          spin: 2,
          wobble: 0.8,
        });
        return () => {
          wave.fire(fx.at(0, -3.85, 0.4), 'floor');
          petals.fire();
          world.ripple();
          fx.sfx.boom(0, 2.6);
          fx.ripple(0.6, 1.6);
          fx.flash('#ffe4c4', 0.15, 1.2);
        };
      },
    },
  ];
};
