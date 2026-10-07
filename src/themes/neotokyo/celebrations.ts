/** neotokyo: winner celebrations. Each `setup` runs once when the scene loads (so shaders compile up front) and returns the function that plays it. */
import type { Celebration } from '../types';
import { atlas } from './sprites';
import { SIGNS } from './layout';
import type { CityScene } from '.';

type V3 = [number, number, number];
const NEON = ['#ff2a6d', '#05d9e8', '#7b2cff', '#f9f871', '#ff9f1c'];

export const celebrations = (world: CityScene): Celebration[] => {
  const sprites = atlas();
  return [
    {
      name: 'Sign Overload',
      setup(fx) {
        const sparks = fx.particles({
          count: 320,
          atlas: sprites,
          cells: [0],
          colors: ['#fff2d6', '#ffd27a', '#ff9f1c'],
          mode: 'stretch',
          stretch: 0.18,
          blend: 'additive',
          intensity: 3,
          mirror: false,
          emitters: SIGNS.map(([x, y, z]) => ({ at: [x, y, z + 0.3] as V3, box: [0.4, 0.6, 0.1] as V3, dir: [0, 0.6, 1] as V3, spread: 1.2, speed: [3, 7] as [number, number], delay: [0, 2] as [number, number] })),
          size: [0.04, 0.07],
          gravity: [0, -9, 0],
          drag: 0.4,
          life: [0.5, 0.9],
        });
        const confetti = fx.particles({
          count: 700,
          atlas: sprites,
          cells: [3],
          colors: NEON,
          tint: 1,
          intensity: 1.6,
          aspect: 0.5,
          mirror: false,
          emitters: [{ at: [0, 11, 0], box: [12, 0.5, 4], dir: [0, -1, 0], spread: 0.3, speed: [3, 6], delay: [0, 1.5] }],
          size: [0.18, 0.3],
          gravity: [0, -3.5, 0],
          drag: 1.3,
          life: [4, 5.5],
          spin: 4,
          wobble: 0.5,
        });
        return () => {
          world.overload(3.5);
          sparks.fire();
          confetti.fire();
          fx.aberration(1.2);
          fx.sfx.boom(0, 0.8);
          fx.flash('#ff2a6d', 0.18, 0.4);
        };
      },
    },
    {
      name: 'Drone Swarm',
      setup(fx) {
        const drones = fx.particles({
          count: 260,
          atlas: sprites,
          cells: [0],
          colors: NEON,
          mode: 'face',
          blend: 'additive',
          intensity: 2.6,
          mirror: false,
          emitters: [{ at: [0, 0.5, -3], box: [9, 0.2, 5], dir: [0, 1, 0], spread: 0.2, speed: [2, 4], delay: [0, 1.6] }],
          size: [0.14, 0.22],
          gravity: [0, 0.3, 0],
          drag: 0.5,
          life: [3.5, 4.5],
          wobble: 1.4,
        });
        return () => {
          drones.fire();
          fx.orbit(0.4, 3.6);
          fx.sfx.whoosh();
          fx.sfx.applause(2.6, 0.4);
        };
      },
    },
    {
      name: 'Puddle Splash',
      setup(fx) {
        const splash = fx.particles({
          count: 600,
          atlas: sprites,
          cells: [1],
          colors: ['#d9e6ff', '#ffffff', '#ff9fc4', '#9ff6ff'],
          tint: 1,
          mode: 'face',
          mirror: false,
          emitters: [{ at: [0, 0.1, 0], box: [9, 0, 4], dir: [0, 1, 0], spread: 0.5, speed: [3, 7], delay: [0, 1.2] }],
          size: [0.07, 0.16],
          gravity: [0, -9, 0],
          drag: 0.4,
          life: [0.9, 1.4],
        });
        return () => {
          world.downpour(4);
          splash.fire();
          fx.sfx.whoosh();
          fx.stunt('hop');
          fx.ripple(0.7);
        };
      },
    },
    {
      name: 'Thunderstorm',
      setup(fx) {
        const deluge = fx.particles({
          count: 1400,
          atlas: sprites,
          cells: [0],
          colors: ['#d9e6ff', '#ffffff'],
          mode: 'stretch',
          stretch: 0.08,
          blend: 'additive',
          intensity: 0.8,
          mirror: false,
          emitters: [{ at: [0, 13, -2], box: [15, 1, 10], dir: [-0.2, -1, 0], spread: 0.02, speed: [20, 26], delay: [0.1, 2.6] }],
          size: [0.03, 0.045],
          gravity: [0, -4, 0],
          drag: 0.01,
          life: [0.7, 0.9],
        });
        return () => {
          world.lightning(1);
          world.downpour(4);
          deluge.fire();
          fx.flash('#e6ecff', 0.7, 0.35);
          fx.after(0.3, () => {
            fx.sfx.boom(0, 2.2);
            fx.shake(0.9, 1.6);
          });
          fx.after(1.4, () => world.lightning(0.7));
        };
      },
    },
  ];
};
