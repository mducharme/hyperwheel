/** crystal: winner celebrations. Each `setup` runs once when the scene loads (so shaders compile up front) and returns the function that plays it. */
import type { Celebration } from '../types';
import { atlas } from './sprites';
import { GEMS } from './meta';
import type { CaveScene } from '.';

export const celebrations = (world: CaveScene): Celebration[] => {
  const sprites = atlas();
  return [
    {
      name: 'Crystal Shatter',
      setup(fx) {
        // the wheel's crystal rim bursts into shards in every direction
        const shards = fx.particles({
          count: 520,
          atlas: sprites,
          cells: [1, 1, 0],
          colors: GEMS,
          tint: 1,
          intensity: 1.3,
          mirror: false,
          emitters: [{ at: [0, 3.9, 0.6], box: [2.4, 2.4, 0.2], dir: [0, 0.4, 1], spread: 1.6, speed: [6, 13] }],
          size: [0.16, 0.34],
          gravity: [0, -7, 0],
          drag: 0.9,
          life: [2, 3],
          spin: 7,
        });
        const glints = fx.particles({
          count: 140,
          atlas: sprites,
          cells: [5],
          colors: ['#ffffff', '#e0fbfc'],
          mode: 'face',
          blend: 'additive',
          intensity: 2.6,
          mirror: false,
          emitters: [{ at: [0, 3.9, 0.6], box: [3.2, 3.2, 0.5], dir: [0, 1, 0], spread: 2, speed: [1, 3], delay: [0, 0.4] }],
          size: [0.2, 0.4],
          gravity: [0, 0, 0],
          drag: 2,
          life: [0.6, 1.1],
        });
        return () => {
          shards.fire();
          glints.fire();
          world.resonate();
          fx.flash('#d9c2ff', 0.35, 0.5);
          fx.ripple(0.9);
          fx.sfx.pop(0, 1.6);
          fx.sfx.pop(0.08, 1.9);
          fx.sfx.pop(0.16, 2.2);
        };
      },
    },
    {
      name: 'Gem Shower',
      setup(fx) {
        const gems = fx.particles({
          count: 900,
          atlas: sprites,
          cells: [0],
          colors: GEMS,
          tint: 1,
          intensity: 1.2,
          mirror: false,
          emitters: [{ at: [0, 12, 0], box: [12, 0.5, 4], dir: [0, -1, 0], spread: 0.25, speed: [3, 6], delay: [0, 1.6] }],
          size: [0.2, 0.36],
          gravity: [0, -6, 0],
          drag: 1,
          life: [3.5, 4.5],
          spin: 5,
        });
        const sparkle = fx.particles({
          count: 200,
          atlas: sprites,
          cells: [2],
          colors: ['#ffffff', '#c8b6ff', '#9ff3ff'],
          mode: 'face',
          blend: 'additive',
          intensity: 2,
          mirror: false,
          emitters: [{ at: [0, 9, 0], box: [11, 3, 3], dir: [0, -1, 0], spread: 0.5, speed: [1, 3], delay: [0.2, 2] }],
          size: [0.15, 0.32],
          gravity: [0, -2, 0],
          drag: 1.2,
          life: [1, 1.6],
        });
        return () => {
          gems.fire();
          sparkle.fire();
          world.flare(3);
          fx.zoom(0.07, 2.5);
          fx.sfx.applause(2.8, 0.2);
        };
      },
    },
    {
      name: 'Mine Cart Rush',
      setup(fx) {
        const pebbles = fx.particles({
          count: 120,
          atlas: sprites,
          cells: [4],
          colors: ['#8a8196', '#6b6378'],
          tint: 1,
          mode: 'tumble',
          mirror: false,
          emitters: [{ at: [0, 15.5, -4], box: [10, 0, 4], dir: [0, -1, 0], spread: 0.2, speed: [0.5, 2], delay: [0.3, 1.8] }],
          size: [0.08, 0.2],
          gravity: [0, -9, 0],
          drag: 0.3,
          life: [1.8, 2.4],
          spin: 6,
        });
        return () => {
          world.cartRun(true);
          pebbles.fire();
          fx.sfx.whoosh();
          fx.after(0.9, () => fx.sfx.whoosh());
          fx.sfx.boom(0.3, 1.4);
          fx.shake(0.55, 2.2);
          fx.stunt('shake', 1.6);
        };
      },
    },
    {
      name: 'Geode Glow',
      setup(fx) {
        const motes = fx.particles({
          count: 420,
          atlas: sprites,
          cells: [3],
          colors: GEMS,
          mode: 'face',
          blend: 'additive',
          intensity: 2.2,
          mirror: false,
          emitters: [{ at: [0, 0.4, -4], box: [12, 0.2, 8], dir: [0, 1, 0], spread: 0.3, speed: [2, 5], delay: [0, 1.2] }],
          size: [0.1, 0.24],
          gravity: [0, 0.4, 0],
          drag: 0.8,
          life: [2.4, 3.4],
          wobble: 0.5,
        });
        return () => {
          world.resonate();
          world.flare(4);
          motes.fire();
          fx.orbit(0.45, 3.4);
          fx.flash('#9ff3ff', 0.15, 1);
        };
      },
    },
  ];
};
