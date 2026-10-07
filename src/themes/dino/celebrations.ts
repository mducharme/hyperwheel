/** dino: winner celebrations. Each `setup` runs once when the scene loads (so shaders compile up front) and returns the function that plays it. */
import type { Celebration } from '../types';
import { flyby } from '../../fx/ambient';
import type { Particles } from '../../fx/Particles';
import { atlas } from './sprites';
import { NEST } from './layout';
import type { DinoScene } from '.';

const LEAVES = ['#6a994e', '#8cb369', '#a7c957', '#4f772d'];

/** Hand a ready-made particle system to the effects director (it ticks and disposes it). */
const effect = (p: Particles) => ({ object: p.object, update: (t: number) => p.update(t), dispose: () => p.dispose(), fire: () => p.fire() });

export const celebrations = (world: DinoScene): Celebration[] => {
  const sprites = atlas();
  return [
    {
      name: 'T-Rex Roar',
      setup(fx) {
        // the roar shakes leaves loose from the canopy
        const leaves = fx.particles({
          count: 380,
          atlas: sprites,
          cells: [2],
          colors: LEAVES,
          tint: 1,
          mirror: false,
          emitters: [{ at: [0, 12, -2], box: [14, 1, 5], dir: [0, -1, 0], spread: 0.4, speed: [1, 3], delay: [1.7, 3] }],
          size: [0.18, 0.32],
          gravity: [0, -2.5, 0],
          drag: 1.4,
          life: [3.5, 5],
          spin: 4,
          wobble: 0.6,
        });
        return () => {
          world.roar();
          world.stomp(3);
          leaves.fire();
          fx.after(1.7, () => {
            fx.sfx.boom(0, 2.4);
            fx.shake(1.1, 1.8);
            fx.stunt('shake', 1.6);
            fx.ripple(0.8);
          });
        };
      },
    },
    {
      name: 'Egg Hatch',
      setup(fx) {
        const shells = fx.particles({
          count: 120,
          atlas: sprites,
          cells: [3],
          tint: 0,
          mirror: false,
          emitters: [{ at: [NEST.x, 0.6, NEST.z], box: [0.4, 0.2, 0.3], dir: [0.2, 1, 0.3], spread: 0.6, speed: [4, 8], delay: [1.1, 1.25] }],
          size: [0.18, 0.3],
          gravity: [0, -9, 0],
          drag: 0.6,
          life: [1.6, 2.2],
          spin: 8,
        });
        const sparkle = fx.particles({
          count: 160,
          atlas: sprites,
          cells: [6],
          colors: ['#fff6c9', '#ffffff', '#c7f09a'],
          mode: 'face',
          blend: 'additive',
          intensity: 2.2,
          mirror: false,
          emitters: [{ at: [NEST.x, 0.8, NEST.z], box: [0.6, 0.3, 0.4], dir: [0, 1, 0], spread: 0.8, speed: [1.5, 4], delay: [1.1, 1.8] }],
          size: [0.15, 0.3],
          gravity: [0, -0.5, 0],
          drag: 1.2,
          life: [1, 1.6],
        });
        const confetti = fx.particles({
          count: 700,
          atlas: sprites,
          cells: [2],
          colors: ['#f4a259', '#bc4b51', '#f4e285', '#8cb369', '#5b8e7d'],
          tint: 1,
          mirror: false,
          emitters: [{ at: [0, 11, 0], box: [12, 0.5, 4], dir: [0, -1, 0], spread: 0.3, speed: [3, 6], delay: [1.2, 2.6] }],
          size: [0.16, 0.28],
          gravity: [0, -3, 0],
          drag: 1.3,
          life: [4, 5.5],
          spin: 4,
          wobble: 0.5,
        });
        return () => {
          world.hatch();
          shells.fire();
          sparkle.fire();
          confetti.fire();
          fx.after(1.1, () => {
            fx.sfx.pop(0, 1.4);
            fx.sfx.pop(0.1, 1.7);
            fx.sfx.pop(0.2, 2);
            fx.flash('#fff6c9', 0.18, 0.5);
          });
          fx.zoom(0.06, 2.4);
        };
      },
    },
    {
      name: 'Stampede',
      setup(fx) {
        // a herd of little raptors dashes across the valley, kicking up dust
        const herd = fx.add(effect(flyby({ atlas: sprites, cells: [1], count: 16, from: [-18, 0.75, 3.6], box: [2, 0.15, 1.2], speed: [11, 14], life: 4, size: [1.1, 1.5], wobble: 0.12, stagger: 1.6 })));
        const dust = fx.particles({
          count: 120,
          atlas: sprites,
          cells: [4],
          colors: ['#c9b58f', '#b59f78'],
          tint: 1,
          mode: 'face',
          emitters: [{ at: [-6, 0.3, 3.4], box: [9, 0.15, 1.2], dir: [0.3, 1, 0], spread: 0.6, speed: [0.5, 2], delay: [0.3, 2.6] }],
          size: [1, 2.2],
          gravity: [0, 0.4, 0],
          drag: 1.2,
          life: [2, 3],
          wobble: 0.3,
        });
        return () => {
          herd.fire();
          dust.fire();
          world.stomp(5);
          fx.shake(0.45, 2.6);
          fx.sfx.whoosh();
          fx.after(0.8, () => fx.sfx.whoosh());
          fx.orbit(0.25, 3);
        };
      },
    },
    {
      name: 'Pterodactyl Flock',
      setup(fx) {
        const flock = fx.add(effect(flyby({ atlas: sprites, cells: [0], count: 12, from: [-11, 5.6, 2.8], box: [2, 1.4, 1.2], dir: [1, 0.08, 0], speed: [8, 11], life: 3.6, size: [1.1, 1.6], wobble: 0.5, stagger: 1.6 })));
        const feathers = fx.particles({
          count: 500,
          atlas: sprites,
          cells: [2],
          colors: ['#f4a259', '#f4e285', '#bc4b51', '#8cb369'],
          tint: 1,
          mirror: false,
          emitters: [{ at: [0, 10.5, 0], box: [12, 0.5, 4], dir: [0, -1, 0], spread: 0.3, speed: [2, 4], delay: [0.6, 2] }],
          size: [0.18, 0.3],
          gravity: [0, -2.4, 0],
          drag: 1.4,
          life: [4, 5.5],
          spin: 4,
          wobble: 0.6,
        });
        return () => {
          flock.fire();
          feathers.fire();
          fx.sfx.whoosh();
          fx.orbit(0.4, 3.2);
          fx.sfx.applause(2.6, 0.5);
        };
      },
    },
  ];
};
