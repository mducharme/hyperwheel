/** gameshow: winner celebrations. Each `setup` runs once when the scene loads (so shaders compile up front) and returns the function that plays it. */
import type { FxDirector } from '../../fx/FxDirector';
import { PALETTE } from './meta';
import type { Celebration } from '../types';
import { atlas } from './sprites';
import type { ShowScene } from '.';

export const celebrations = (world: ShowScene): Celebration[] => {
  const sprites = atlas();
  const metallic = ['#ffd23f', '#e8e8f4', '#ff3b5c', '#3b82ff', '#2ee59d'];
  return [
    {
      name: 'Ticker-Tape Finale',
      setup(fx) {
        const tape = fx.particles({
          count: 1200,
          atlas: sprites,
          cells: [0, 0, 1],
          colors: metallic,
          aspect: 0.5,
          mirror: false,
          emitters: [{ at: [0, 16, 0], box: [14, 0.5, 5], dir: [0, -1, 0], spread: 0.3, speed: [2, 5], delay: [0, 1.5] }],
          size: [0.3, 0.55],
          gravity: [0, -3.5, 0],
          drag: 1.3,
          life: [4.5, 6],
          spin: 4,
          wobble: 0.5,
        });
        return () => {
          tape.fire();
          world.converge(4);
          world.cheer(3.5);
          fx.sfx.applause(3.2);
          fx.zoom(0.08, 2.5);
        };
      },
    },
    {
      name: 'Confetti Cannons',
      setup(fx) {
        const cannons = fx.particles({
          count: 1000,
          atlas: sprites,
          cells: [1, 1, 2],
          colors: metallic,
          emitters: [
            { at: [-4.6, 0.4, 1.6], dir: [0.3, 1, 0.25], spread: 0.25, speed: [9, 16] },
            { at: [4.6, 0.4, 1.6], dir: [-0.3, 1, 0.25], spread: 0.25, speed: [9, 16] },
          ],
          size: [0.16, 0.28],
          gravity: [0, -6, 0],
          drag: 1.3,
          life: [3.5, 5],
        });
        return () => {
          cannons.fire();
          world.cheer(2.5);
          fx.sfx.boom(0, 1.2);
          fx.sfx.applause(2.4, 0.15);
          fx.ripple(0.7);
        };
      },
    },
    {
      name: 'Jackpot',
      setup(fx) {
        const coins = fx.particles({
          count: 700,
          atlas: sprites,
          cells: [4],
          colors: ['#ffd23f', '#ffcf2f', '#ffe68a'],
          tint: 1,
          mirror: false,
          emitters: [{ at: [0, 15, 0.5], box: [9, 0.5, 3], dir: [0, -1, 0], spread: 0.2, speed: [3, 6], delay: [0, 1.2] }],
          size: [0.3, 0.45],
          gravity: [0, -9, 0],
          drag: 0.8,
          life: [3, 4],
          spin: 6,
        });
        return () => {
          world.jackpot(3.5);
          coins.fire();
          fx.flash('#ffd23f', 0.3, 0.6);
          fx.stunt('boing');
          for (let i = 0; i < 12; i++) fx.sfx.pop(i * 0.08, 1.4 + (i % 4) * 0.25);
        };
      },
    },
    {
      name: 'Standing Ovation',
      setup(fx: FxDirector) {
        const balloons = fx.particles({
          count: 160,
          atlas: sprites,
          cells: [3],
          colors: PALETTE,
          mode: 'face',
          lit: false,
          intensity: 1.15,
          mirror: false,
          emitters: [{ at: [0, -1, 2], box: [12, 0.5, 3], dir: [0, 1, 0], spread: 0.15, speed: [1, 3], delay: [0, 1.6] }],
          size: [0.7, 1.1],
          gravity: [0, 2.2, 0],
          drag: 0.9,
          life: [5, 6.5],
          spin: 0.4,
          wobble: 0.6,
        });
        return () => {
          balloons.fire();
          world.cheer(4.5);
          world.converge(3);
          fx.sfx.applause(4);
          fx.orbit(0.35, 4);
        };
      },
    },
  ];
};
