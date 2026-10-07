/** sky: winner celebrations. Each `setup` runs once when the scene loads (so shaders compile up front) and returns the function that plays it. */
import type { Celebration } from '../types';
import { flyby } from '../../fx/ambient';
import type { Particles } from '../../fx/Particles';
import { atlas } from './sprites';
import { PALETTE } from './meta';
import type { SkyScene } from '.';

/** Hand a ready-made particle system to the effects director (it ticks and disposes it). */
const effect = (p: Particles) => ({ object: p.object, update: (t: number) => p.update(t), dispose: () => p.dispose(), fire: () => p.fire() });

export const celebrations = (world: SkyScene): Celebration[] => {
  const sprites = atlas();
  return [
    {
      name: 'Balloon Release',
      setup(fx) {
        const balloons = fx.particles({
          count: 90,
          atlas: sprites,
          cells: [0],
          colors: PALETTE,
          tint: 1,
          mode: 'face',
          mirror: false,
          emitters: [{ at: [0, 0.6, 0.5], box: [7, 0.3, 2], dir: [0, 1, 0], spread: 0.25, speed: [2, 4], delay: [0, 1.8] }],
          size: [0.9, 1.3],
          gravity: [0.15, 0.9, 0],
          drag: 0.4,
          life: [5, 6.5],
          wobble: 0.7,
        });
        const streamers = fx.particles({
          count: 500,
          atlas: sprites,
          cells: [5, 4],
          colors: PALETTE,
          tint: 1,
          mirror: false,
          emitters: [{ at: [0, 11, 0], box: [12, 0.5, 4], dir: [0, -1, 0], spread: 0.3, speed: [2, 5], delay: [0.3, 1.8] }],
          size: [0.18, 0.3],
          gravity: [0, -3, 0],
          drag: 1.3,
          life: [4, 5],
          spin: 4,
          wobble: 0.5,
        });
        return () => {
          balloons.fire();
          streamers.fire();
          fx.sfx.pop(0, 1.1);
          fx.sfx.applause(2.8, 0.3);
          fx.zoom(-0.05, 3);
        };
      },
    },
    {
      name: 'Rainbow Bridge',
      setup(fx) {
        const sparkles = fx.particles({
          count: 220,
          atlas: sprites,
          cells: [3],
          colors: ['#ff6b6b', '#ffe66d', '#4ecdc4', '#5d9cec', '#a29bfe'],
          mode: 'face',
          blend: 'additive',
          intensity: 2.2,
          mirror: false,
          emitters: [{ at: [0, 6, -2], box: [11, 4, 3], dir: [0, 1, 0], spread: 1, speed: [0.5, 2], delay: [0.2, 2.5] }],
          size: [0.16, 0.32],
          gravity: [0, 0.2, 0],
          drag: 1.4,
          life: [1.2, 1.8],
        });
        return () => {
          world.rainbow(5);
          sparkles.fire();
          fx.flash('#fff6d6', 0.15, 1.2);
          fx.orbit(-0.3, 3.4);
        };
      },
    },
    {
      name: 'Bird Flock',
      setup(fx) {
        const flock = fx.add(effect(flyby({ atlas: sprites, cells: [1], count: 22, from: [-9, 5.6, 2.6], box: [2.5, 2.2, 1.4], dir: [1, 0.12, 0], speed: [8, 11], life: 3, size: [1.2, 1.6], wobble: 0.5, stagger: 1.6 })));
        const feathers = fx.particles({
          count: 120,
          atlas: sprites,
          cells: [5],
          colors: ['#ffffff', '#dfe8f2'],
          tint: 1,
          mirror: false,
          emitters: [{ at: [0, 7, 2], box: [8, 1.5, 1], dir: [0, -1, 0], spread: 0.6, speed: [0.5, 1.5], delay: [0.6, 2.4] }],
          size: [0.12, 0.2],
          gravity: [0, -1.2, 0],
          drag: 1.6,
          life: [3, 4],
          spin: 3,
          wobble: 0.8,
        });
        return () => {
          flock.fire();
          feathers.fire();
          fx.sfx.whoosh();
          fx.after(0.7, () => fx.sfx.whoosh());
        };
      },
    },
    {
      name: 'Cloud Burst',
      setup(fx) {
        const clouds = fx.particles({
          count: 45,
          atlas: sprites,
          cells: [2],
          colors: ['#ffffff', '#eef6ff'],
          tint: 1,
          mode: 'face',
          mirror: false,
          emitters: [{ at: [0, 3.9, 0.4], box: [1, 1, 0.3], dir: [0, 0.3, 1], spread: 1.6, speed: [4, 8] }],
          size: [0.8, 1.6],
          gravity: [0, 0.3, 0],
          drag: 2,
          life: [2, 3],
          wobble: 0.4,
        });
        const stars = fx.particles({
          count: 300,
          atlas: sprites,
          cells: [4],
          colors: ['#ffe66d', '#ffffff', '#ff9f43'],
          tint: 1,
          mirror: false,
          emitters: [{ at: [0, 3.9, 0.6], dir: [0, 0.4, 1], spread: 1.8, speed: [6, 12] }],
          size: [0.16, 0.28],
          gravity: [0, -5, 0],
          drag: 1,
          life: [2, 3],
          spin: 5,
        });
        return () => {
          clouds.fire();
          stars.fire();
          fx.stunt('hop');
          fx.ripple(0.8);
          fx.sfx.boom(0, 0.9);
        };
      },
    },
  ];
};
