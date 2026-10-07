/** lab: winner celebrations. Each `setup` runs once when the scene loads (so shaders compile up front) and returns the function that plays it. */
import type { Celebration } from '../types';
import { atlas } from './sprites';
import { JAR, TANK } from './layout';
import type { LabScene } from '.';

const POTIONS = ['#7cff4f', '#b07cff', '#ff8c42', '#2ec4b6', '#ff5d8f'];

export const celebrations = (world: LabScene): Celebration[] => {
  const sprites = atlas();
  return [
    {
      name: 'Lightning Arc',
      setup(fx) {
        const sparks = fx.particles({
          count: 260,
          atlas: sprites,
          cells: [2],
          colors: ['#e6d9ff', '#b07cff', '#ffffff'],
          mode: 'stretch',
          stretch: 0.2,
          blend: 'additive',
          intensity: 3,
          mirror: false,
          emitters: [{ at: [0, 3.9, 0.3], box: [3.2, 3.2, 0.2], dir: [0, 0.4, 1], spread: 1.6, speed: [4, 9], delay: [0, 1.6] }],
          size: [0.04, 0.07],
          gravity: [0, -8, 0],
          drag: 0.4,
          life: [0.5, 0.9],
        });
        return () => {
          world.zap(2.2, true);
          sparks.fire();
          fx.flash('#d9c2ff', 0.5, 0.3);
          fx.sfx.boom(0, 1.2);
          fx.after(0.6, () => fx.flash('#d9c2ff', 0.3, 0.25));
          fx.shake(0.5, 1.6);
          fx.aberration(1.2);
        };
      },
    },
    {
      name: 'Potion Explosion',
      setup(fx) {
        const smoke = fx.particles({
          count: 110,
          atlas: sprites,
          cells: [0],
          colors: POTIONS,
          tint: 1,
          mode: 'face',
          mirror: false,
          emitters: [{ at: [5.8, 4, -10.5], box: [3, 1, 0.2], dir: [0, 0.5, 1], spread: 0.9, speed: [3, 7], delay: [0, 0.4] }],
          size: [1, 2.2],
          gravity: [0, 0.6, 0],
          drag: 1.6,
          life: [2.4, 3.4],
          wobble: 0.4,
        });
        const drops = fx.particles({
          count: 300,
          atlas: sprites,
          cells: [4],
          colors: POTIONS,
          tint: 1,
          intensity: 1.4,
          mirror: false,
          emitters: [{ at: [0, 11, 0], box: [11, 0.5, 4], dir: [0, -1, 0], spread: 0.3, speed: [3, 6], delay: [0.3, 1.8] }],
          size: [0.12, 0.22],
          gravity: [0, -6, 0],
          drag: 0.8,
          life: [2.5, 3.5],
        });
        return () => {
          smoke.fire();
          drops.fire();
          fx.sfx.boom(0, 1);
          fx.sfx.pop(0.1, 1.3);
          fx.sfx.pop(0.25, 1.6);
          fx.flash('#7cff4f', 0.2, 0.5);
        };
      },
    },
    {
      name: "It's Alive!",
      setup(fx) {
        return () => {
          world.alive(3.2);
          world.zap(3.2, true);
          fx.stunt('shake', 2.6);
          fx.shake(0.8, 2.6);
          fx.sfx.boom(0, 2.2);
          fx.after(1.4, () => fx.sfx.boom(0, 1.6));
          fx.flash('#ffffff', 0.4, 0.3);
          fx.zoom(0.08, 3);
        };
      },
    },
    {
      name: 'Bubble Overflow',
      setup(fx) {
        const bubbles = fx.particles({
          count: 420,
          atlas: sprites,
          cells: [1],
          colors: ['#c9ff9a', '#9ff6ff', '#e0c6ff'],
          mode: 'face',
          blend: 'additive',
          intensity: 1.6,
          mirror: false,
          emitters: [
            { at: [TANK.x, 5.6, TANK.z], box: [1, 0, 1], dir: [-0.4, 1, 0.4], spread: 0.5, speed: [3, 6], delay: [0, 2], weight: 2 },
            { at: [JAR.x, JAR.y + 1.6, JAR.z], box: [0.5, 0, 0.5], dir: [0.2, 1, 0], spread: 0.5, speed: [2, 5], delay: [0, 2], weight: 1 },
            { at: [0, 0.3, 0.5], box: [6, 0, 2], dir: [0, 1, 0], spread: 0.4, speed: [1.5, 3.5], delay: [0.3, 2.3], weight: 2 },
          ],
          size: [0.15, 0.4],
          gravity: [0, 1.2, 0],
          drag: 0.8,
          life: [2.4, 3.4],
          wobble: 0.6,
        });
        return () => {
          bubbles.fire();
          fx.sfx.pop(0, 1.2);
          fx.sfx.pop(0.3, 1.5);
          fx.sfx.pop(0.6, 1.1);
          fx.orbit(0.3, 3);
        };
      },
    },
  ];
};
