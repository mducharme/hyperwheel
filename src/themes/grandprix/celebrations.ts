/** grandprix: winner celebrations. Each `setup` runs once when the scene loads (so shaders compile up front) and returns the function that plays it. */
import type { Celebration } from '../types';
import { atlas } from './sprites';
import type { RaceScene } from '.';

export const celebrations = (world: RaceScene): Celebration[] => {
  const sprites = atlas();
  return [
    {
      name: 'Chequered Flag',
      setup(fx) {
        const flags = fx.particles({
          count: 1100,
          atlas: sprites,
          cells: [0, 0, 1],
          colors: ['#ffffff', '#ffffff', '#e10600', '#ffd400'],
          tint: 0.6,
          aspect: 0.8,
          mirror: false,
          emitters: [{ at: [0, 11, 0], box: [13, 0.5, 4], dir: [0, -1, 0], spread: 0.3, speed: [4, 7], delay: [0, 1.5] }],
          size: [0.28, 0.48],
          gravity: [0, -3.5, 0],
          drag: 1.3,
          life: [4.5, 6],
          spin: 4,
          wobble: 0.5,
        });
        return () => {
          flags.fire();
          world.wave(4.5);
          world.cheer(4);
          fx.sfx.applause(3.2);
          fx.zoom(0.08, 2.5);
        };
      },
    },
    {
      name: 'Champagne Spray',
      setup(fx) {
        // two magnums at the front of the podium, sprayed up and over the wheel
        const foam = fx.particles({
          count: 900,
          atlas: sprites,
          cells: [7, 7, 4],
          colors: ['#fff6d8', '#ffe9a3', '#ffffff'],
          tint: 1,
          intensity: 1.2,
          mirror: false,
          emitters: [
            { at: [-1.6, 0.6, 1.8], dir: [0.35, 1, 0.1], spread: 0.18, speed: [9, 14], delay: [0, 1.8] },
            { at: [1.6, 0.6, 1.8], dir: [-0.35, 1, 0.1], spread: 0.18, speed: [9, 14], delay: [0.2, 2] },
          ],
          size: [0.08, 0.22],
          gravity: [0, -9, 0],
          drag: 0.9,
          life: [1.6, 2.4],
          wobble: 0.15,
        });
        const sparkle = fx.particles({
          count: 160,
          atlas: sprites,
          cells: [3],
          colors: ['#ffe9a3', '#ffffff'],
          mode: 'face',
          blend: 'additive',
          intensity: 2,
          mirror: false,
          emitters: [{ at: [0, 5.5, 1], box: [4, 2.5, 1], dir: [0, 1, 0], spread: 1, speed: [0.5, 1.5], delay: [0.3, 2] }],
          size: [0.15, 0.3],
          gravity: [0, -0.5, 0],
          drag: 1.5,
          life: [1, 1.6],
        });
        return () => {
          foam.fire();
          sparkle.fire();
          fx.sfx.pop(0, 0.7);
          fx.sfx.pop(0.2, 0.75);
          fx.flash('#ffe9a3', 0.15, 0.6);
          world.cheer(3);
          fx.sfx.applause(2.6, 0.3);
        };
      },
    },
    {
      name: 'Burnout',
      setup(fx) {
        // cartoon tyre smoke billowing from both sides of the stand
        const smoke = fx.particles({
          count: 120,
          atlas: sprites,
          cells: [5],
          colors: ['#f2f2f2', '#d6d9de', '#bfc3ca'],
          tint: 1,
          mode: 'face',
          emitters: [
            { at: [-2.8, 0.3, 0.6], box: [0.4, 0.1, 0.6], dir: [-0.6, 0.5, 0.3], spread: 0.6, speed: [1.5, 3.5], delay: [0, 1.6] },
            { at: [2.8, 0.3, 0.6], box: [0.4, 0.1, 0.6], dir: [0.6, 0.5, 0.3], spread: 0.6, speed: [1.5, 3.5], delay: [0, 1.6] },
          ],
          size: [1.2, 2.6],
          gravity: [0, 0.7, 0],
          drag: 1.4,
          life: [2.6, 3.6],
          wobble: 0.4,
          mirror: false,
        });
        return () => {
          smoke.fire();
          world.boost(2.4, 2.5);
          fx.stunt('shake', 1.8);
          fx.shake(0.5, 2);
          fx.sfx.whoosh();
          fx.after(0.6, () => fx.sfx.whoosh());
          fx.after(1.2, () => fx.sfx.whoosh());
        };
      },
    },
    {
      name: 'Victory Lap',
      setup(fx) {
        // speed lines streaking past as the whole field floors it
        const streaks = fx.particles({
          count: 220,
          atlas: sprites,
          cells: [4],
          colors: ['#ffffff', '#ffe9a3'],
          mode: 'stretch',
          stretch: 0.35,
          blend: 'additive',
          intensity: 1.6,
          emitters: [{ at: [-16, 3.5, 2], box: [2, 3.5, 3], dir: [1, 0, 0], spread: 0.02, speed: [26, 40], delay: [0, 2.6] }],
          size: [0.14, 0.24],
          gravity: [0, 0, 0],
          drag: 0.05,
          life: [1, 1.3],
        });
        return () => {
          world.boost(3.2, 4.5);
          streaks.fire();
          world.cheer(4.5);
          fx.orbit(0.45, 3.6);
          fx.sfx.whoosh();
          fx.sfx.applause(3.4, 0.4);
          fx.flash('#ffffff', 0.12, 0.5);
        };
      },
    },
  ];
};
