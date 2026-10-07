/** west: winner celebrations. Each `setup` runs once when the scene loads (so shaders compile up front) and returns the function that plays it. */
import type { Celebration } from '../types';
import { atlas } from './sprites';
import { TNT } from './layout';
import type { WestScene } from '.';

type V3 = [number, number, number];
const FUSE = 1.3;

export const celebrations = (world: WestScene): Celebration[] => {
  const sprites = atlas();
  return [
    {
      name: 'Yee-Haw!',
      setup(fx) {
        const hats = fx.particles({
          count: 260,
          atlas: sprites,
          cells: [0],
          colors: ['#7a5c3e', '#3b2414', '#e9d8a6', '#c0392b'],
          tint: 1,
          mirror: false,
          emitters: [
            { at: [-5, 0.5, 2], dir: [0.3, 1, 0.2], spread: 0.35, speed: [9, 13] },
            { at: [5, 0.5, 2], dir: [-0.3, 1, 0.2], spread: 0.35, speed: [9, 13] },
          ],
          size: [0.42, 0.62],
          gravity: [0, -6, 0],
          drag: 1.2,
          life: [3, 4],
          spin: 3,
        });
        const stars = fx.particles({
          count: 500,
          atlas: sprites,
          cells: [2],
          colors: ['#f4d35e', '#e9d8a6', '#ffffff'],
          tint: 1,
          mirror: false,
          emitters: [{ at: [0, 11, 0], box: [12, 0.5, 4], dir: [0, -1, 0], spread: 0.3, speed: [3, 6], delay: [0.2, 1.6] }],
          size: [0.18, 0.3],
          gravity: [0, -3, 0],
          drag: 1.3,
          life: [4, 5],
          spin: 4,
          wobble: 0.4,
        });
        return () => {
          hats.fire();
          stars.fire();
          fx.stunt('hop');
          fx.sfx.applause(2.8, 0.2);
          fx.sfx.whoosh();
        };
      },
    },
    {
      name: 'Gold Rush',
      setup(fx) {
        const gold = fx.particles({
          count: 520,
          atlas: sprites,
          cells: [1],
          tint: 0,
          mirror: false,
          emitters: [
            { at: [-3.6, 0.2, 1.6], dir: [-0.15, 1, 0.2], spread: 0.25, speed: [8, 12], delay: [0, 1.2] },
            { at: [3.6, 0.2, 1.6], dir: [0.15, 1, 0.2], spread: 0.25, speed: [8, 12], delay: [0.2, 1.4] },
          ],
          size: [0.2, 0.34],
          gravity: [0, -9, 0],
          drag: 0.6,
          life: [2.2, 3],
          spin: 6,
        });
        const glints = fx.particles({
          count: 160,
          atlas: sprites,
          cells: [7],
          colors: ['#fff3c4', '#ffffff'],
          mode: 'face',
          blend: 'additive',
          intensity: 2.2,
          mirror: false,
          emitters: [{ at: [0, 4, 1.4], box: [5, 3, 1], dir: [0, 1, 0], spread: 1, speed: [0.5, 2], delay: [0.3, 2] }],
          size: [0.15, 0.3],
          gravity: [0, 0, 0],
          drag: 1.5,
          life: [0.8, 1.3],
        });
        return () => {
          gold.fire();
          glints.fire();
          fx.sfx.pop(0, 0.9);
          fx.sfx.pop(0.25, 1);
          fx.flash('#f4d35e', 0.15, 0.6);
          fx.zoom(0.06, 2.4);
        };
      },
    },
    {
      name: 'Dynamite',
      setup(fx) {
        const fuse = fx.particles({
          count: 90,
          atlas: sprites,
          cells: [6],
          colors: ['#ffd27a', '#ff8a3d'],
          mode: 'stretch',
          stretch: 0.2,
          blend: 'additive',
          intensity: 3,
          mirror: false,
          emitters: [{ at: [TNT.x, 1.72, TNT.z], dir: [0, 1, 0], spread: 1.2, speed: [1, 3], delay: [0, FUSE] }],
          size: [0.04, 0.06],
          gravity: [0, -4, 0],
          drag: 0.5,
          life: [0.25, 0.45],
        });
        const smoke = fx.particles({
          count: 110,
          atlas: sprites,
          cells: [4],
          colors: ['#d9d3c7', '#a89f92', '#6f675c'],
          tint: 1,
          mode: 'face',
          mirror: false,
          emitters: [{ at: [TNT.x, 1, TNT.z] as V3, dir: [0, 1, 0] as V3, spread: 1.4, speed: [3, 7], delay: [FUSE, FUSE + 0.15] }],
          size: [1, 2.4],
          gravity: [0, 1, 0],
          drag: 1.6,
          life: [2.2, 3.2],
          wobble: 0.4,
        });
        const blast = fx.particles({
          count: 30,
          atlas: sprites,
          cells: [6],
          colors: ['#fff1c4', '#ff9a3d'],
          mode: 'face',
          blend: 'additive',
          intensity: 4,
          mirror: false,
          emitters: [{ at: [TNT.x, 1.1, TNT.z], box: [0.5, 0.4, 0.5], speed: [0, 2], delay: [FUSE, FUSE + 0.05] }],
          size: [2, 3.4],
          gravity: [0, 0, 0],
          drag: 2,
          life: [0.25, 0.4],
        });
        const splinters = fx.particles({
          count: 120,
          atlas: sprites,
          cells: [5],
          colors: ['#8a6440', '#b3261e', '#5a3d24'],
          tint: 1,
          mirror: false,
          emitters: [{ at: [TNT.x, 1.1, TNT.z], dir: [0, 1, 0], spread: 1.3, speed: [6, 12], delay: [FUSE, FUSE + 0.05] }],
          size: [0.12, 0.24],
          gravity: [0, -9, 0],
          drag: 0.4,
          life: [1.4, 2],
          spin: 9,
        });
        return () => {
          world.dynamite(FUSE);
          fuse.fire();
          smoke.fire();
          blast.fire();
          splinters.fire();
          fx.sfx.whoosh();
          fx.after(FUSE, () => {
            fx.sfx.boom(0, 2);
            fx.shake(1, 1.4);
            fx.flash('#ffb35c', 0.5, 0.5);
            fx.ripple(1);
            fx.stunt('shake', 1.2);
          });
        };
      },
    },
    {
      name: 'Tumbleweed Stampede',
      setup(fx) {
        const dust = fx.particles({
          count: 120,
          atlas: sprites,
          cells: [4],
          colors: ['#e6c9a0', '#d1b085'],
          tint: 1,
          mode: 'face',
          mirror: false,
          emitters: [{ at: [0, 0.4, -1], box: [14, 0.2, 5], dir: [0.4, 1, 0], spread: 0.6, speed: [0.5, 2], delay: [0.2, 2.6] }],
          size: [1.2, 2.6],
          gravity: [0.5, 0.3, 0],
          drag: 1.2,
          life: [2.2, 3.2],
          wobble: 0.4,
        });
        return () => {
          world.tumbleweeds(10);
          dust.fire();
          fx.sfx.whoosh();
          fx.after(0.8, () => fx.sfx.whoosh());
          fx.orbit(0.3, 3.2);
        };
      },
    },
  ];
};
