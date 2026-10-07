/** pharaoh: winner celebrations. Each `setup` runs once when the scene loads (so shaders compile up front) and returns the function that plays it. */
import type { Celebration } from '../types';
import { atlas } from './sprites';
import type { PharaohScene } from '.';

const GOLD = ['#e0b04a', '#f2d27a', '#ffcf6b'];

export const celebrations = (world: PharaohScene): Celebration[] => {
  const sprites = atlas();
  return [
    {
      name: 'Sandstorm',
      setup(fx) {
        const sand = fx.particles({
          count: 1600,
          atlas: sprites,
          cells: [3],
          colors: ['#d9c3a0', '#c9a87a', '#e8d2a6'],
          tint: 1,
          mode: 'face',
          mirror: false,
          emitters: [{ at: [-16, 3, 0], box: [2, 3.5, 7], dir: [1, 0.08, 0.05], spread: 0.25, speed: [10, 18], delay: [0, 2.6] }],
          size: [0.05, 0.12],
          gravity: [0, -1, 0],
          drag: 0.3,
          life: [2, 3],
          wobble: 0.6,
        });
        return () => {
          world.storm(3.5);
          sand.fire();
          fx.shake(0.6, 3);
          fx.stunt('shake', 2.4);
          fx.sfx.whoosh();
          fx.after(0.8, () => fx.sfx.whoosh());
          fx.after(1.6, () => fx.sfx.whoosh());
        };
      },
    },
    {
      name: 'Scarab Swarm',
      setup(fx) {
        const swarm = fx.particles({
          count: 320,
          atlas: sprites,
          cells: [0],
          colors: ['#2ab7a9', '#1f4e8c', '#e0b04a'],
          tint: 1,
          mode: 'tumble',
          intensity: 1.3,
          mirror: false,
          emitters: [{ at: [0, 0.3, 0.5], box: [7, 0.1, 2], dir: [0, 1, 0], spread: 0.6, speed: [3, 7], delay: [0, 1.4] }],
          size: [0.2, 0.32],
          gravity: [0, 0.5, 0],
          drag: 0.6,
          life: [2.6, 3.4],
          spin: 3,
          wobble: 1.6,
        });
        const glints = fx.particles({
          count: 140,
          atlas: sprites,
          cells: [5],
          colors: ['#fff3c4', '#9ff3e6'],
          mode: 'face',
          blend: 'additive',
          intensity: 2.2,
          mirror: false,
          emitters: [{ at: [0, 4, 0.8], box: [6, 3.5, 1.5], dir: [0, 1, 0], spread: 1, speed: [0.5, 2], delay: [0.3, 2.2] }],
          size: [0.15, 0.3],
          gravity: [0, 0, 0],
          drag: 1.5,
          life: [0.8, 1.3],
        });
        return () => {
          swarm.fire();
          glints.fire();
          world.glyphsBlaze(3);
          fx.orbit(0.35, 3.2);
          fx.sfx.whoosh();
        };
      },
    },
    {
      name: 'Eye of Ra',
      setup(fx) {
        const motes = fx.particles({
          count: 260,
          atlas: sprites,
          cells: [4],
          colors: GOLD,
          mode: 'face',
          blend: 'additive',
          intensity: 2.4,
          mirror: false,
          emitters: [{ at: [0, 14, -1], box: [3, 2, 3], dir: [0, -1, 0], spread: 0.3, speed: [2, 5], delay: [0.3, 2.2] }],
          size: [0.12, 0.26],
          gravity: [0, -1, 0],
          drag: 0.8,
          life: [2.4, 3.2],
          wobble: 0.5,
        });
        return () => {
          world.beam(3.5);
          world.glyphsBlaze(4);
          motes.fire();
          fx.flash('#ffd27a', 0.4, 1);
          fx.sfx.boom(0.1, 1.8);
          fx.ripple(0.8, 1.4);
          fx.zoom(0.08, 3);
        };
      },
    },
    {
      name: "Pharaoh's Gold",
      setup(fx) {
        const coins = fx.particles({
          count: 900,
          atlas: sprites,
          cells: [3, 3, 1],
          colors: GOLD,
          tint: 1,
          mirror: false,
          emitters: [{ at: [0, 11, 0], box: [12, 0.5, 4], dir: [0, -1, 0], spread: 0.25, speed: [3, 6], delay: [0, 1.6] }],
          size: [0.16, 0.3],
          gravity: [0, -6, 0],
          drag: 1,
          life: [3.5, 4.5],
          spin: 6,
        });
        const glints = fx.particles({
          count: 160,
          atlas: sprites,
          cells: [5],
          colors: ['#fff3c4', '#ffffff'],
          mode: 'face',
          blend: 'additive',
          intensity: 2.2,
          mirror: false,
          emitters: [{ at: [0, 8, 0], box: [10, 3, 3], dir: [0, -1, 0], spread: 0.5, speed: [1, 3], delay: [0.2, 2] }],
          size: [0.15, 0.3],
          gravity: [0, -2, 0],
          drag: 1.2,
          life: [1, 1.6],
        });
        return () => {
          coins.fire();
          glints.fire();
          world.glyphsBlaze(2.5);
          fx.sfx.applause(3, 0.2);
          fx.flash('#e0b04a', 0.15, 0.7);
        };
      },
    },
  ];
};
