/** pirates: winner celebrations. Each `setup` runs once when the scene loads (so shaders compile up front) and returns the function that plays it. */
import type { Celebration } from '../types';
import { atlas } from './sprites';
import { CANNONS, CHEST } from './layout';
import type { PirateScene } from '.';

type V3 = [number, number, number];
/** Muzzle of each cannon (they sit inside the rails, barrels pointing out to sea). */
const muzzles: V3[] = CANNONS.map(([side, z]) => [side * 7.85, 0.65, z]);

export const celebrations = (world: PirateScene): Celebration[] => {
  const sprites = atlas();
  return [
    {
      name: 'Cannon Volley',
      setup(fx) {
        const smoke = fx.particles({
          count: 160,
          atlas: sprites,
          cells: [3],
          colors: ['#f4efe6', '#d9d3c7', '#bdb6a8'],
          tint: 1,
          mode: 'face',
          mirror: false,
          emitters: muzzles.map(([x, y, z], i) => ({ at: [x, y, z] as V3, dir: [Math.sign(x) * 0.6, 0.8, 0] as V3, spread: 0.45, speed: [3, 7] as [number, number], delay: [i * 0.25, i * 0.25 + 0.3] as [number, number] })),
          size: [0.8, 2],
          gravity: [0, 0.8, 0],
          drag: 1.6,
          life: [2.2, 3.2],
          wobble: 0.3,
        });
        const flashes = fx.particles({
          count: 24,
          atlas: sprites,
          cells: [7],
          colors: ['#ffd27a', '#ff8a3d'],
          mode: 'face',
          blend: 'additive',
          intensity: 4,
          mirror: false,
          emitters: muzzles.map(([x, y, z], i) => ({ at: [x + Math.sign(x) * 0.4, y, z] as V3, speed: [0, 0.5] as [number, number], delay: [i * 0.25, i * 0.25 + 0.02] as [number, number] })),
          size: [1.2, 1.8],
          gravity: [0, 0, 0],
          drag: 1,
          life: [0.12, 0.2],
        });
        return () => {
          world.fireCannons();
          smoke.fire();
          flashes.fire();
          muzzles.forEach((_, i) => fx.sfx.boom(i * 0.25, 1.1));
          fx.shake(0.6, 1.6);
          fx.flash('#ffb35c', 0.18, 0.5);
        };
      },
    },
    {
      name: 'Treasure Trove',
      setup(fx) {
        const loot = fx.particles({
          count: 520,
          atlas: sprites,
          cells: [0, 0, 0, 1],
          colors: ['#f2c14e', '#f2c14e', '#e63946', '#2a9d8f', '#4361ee', '#b5179e'],
          tint: 0.85,
          mirror: false,
          emitters: [{ at: [CHEST.x, 0.9, CHEST.z], box: [0.4, 0, 0.2], dir: [0.25, 1, 0.1], spread: 0.35, speed: [7, 12], delay: [0.25, 1.6] }],
          size: [0.22, 0.36],
          gravity: [0, -9, 0],
          drag: 0.6,
          life: [2.2, 3],
          spin: 6,
        });
        const glints = fx.particles({
          count: 120,
          atlas: sprites,
          cells: [6],
          colors: ['#fff3c4', '#ffffff'],
          mode: 'face',
          blend: 'additive',
          intensity: 2.2,
          mirror: false,
          emitters: [{ at: [CHEST.x, 1.2, CHEST.z], box: [1.2, 0.8, 0.6], dir: [0, 1, 0], spread: 1, speed: [0.5, 2], delay: [0.3, 2] }],
          size: [0.15, 0.32],
          gravity: [0, 0.2, 0],
          drag: 1.4,
          life: [0.9, 1.4],
        });
        return () => {
          world.openChest();
          loot.fire();
          glints.fire();
          fx.sfx.pop(0.2, 0.8);
          fx.flash('#ffcf5a', 0.15, 0.6);
          fx.zoom(0.06, 2.4);
        };
      },
    },
    {
      name: 'Release the Kraken',
      setup(fx) {
        const splash = fx.particles({
          count: 260,
          atlas: sprites,
          cells: [5],
          colors: ['#ffffff', '#cfeaf2'],
          tint: 1,
          mode: 'face',
          mirror: false,
          emitters: [
            { at: [-9.6, -2, -12], box: [1, 0, 1], dir: [0, 1, 0], spread: 0.5, speed: [5, 10], delay: [0, 0.8] },
            { at: [9.6, -2, -10], box: [1, 0, 1], dir: [0, 1, 0], spread: 0.5, speed: [5, 10], delay: [0.2, 1] },
          ],
          size: [0.2, 0.55],
          gravity: [0, -9, 0],
          drag: 0.5,
          life: [1.6, 2.4],
        });
        return () => {
          world.kraken(5);
          splash.fire();
          fx.sfx.boom(0, 2);
          fx.sfx.whoosh();
          fx.shake(0.8, 3);
          fx.stunt('shake', 2.5);
          fx.flash('#7b2d6b', 0.12, 0.8);
        };
      },
    },
    {
      name: 'Jolly Roger',
      setup(fx) {
        const flags = fx.particles({
          count: 900,
          atlas: sprites,
          cells: [2, 0, 0],
          colors: ['#ffffff', '#f2c14e'],
          tint: 0,
          aspect: 1,
          mirror: false,
          emitters: [{ at: [0, 11, 0], box: [13, 0.5, 4], dir: [0, -1, 0], spread: 0.3, speed: [3, 6], delay: [0, 1.5] }],
          size: [0.3, 0.5],
          gravity: [0, -3.5, 0],
          drag: 1.3,
          life: [4.5, 6],
          spin: 4,
          wobble: 0.5,
        });
        return () => {
          flags.fire();
          world.wave(4.5);
          fx.sfx.applause(3);
          fx.orbit(0.35, 3.2);
        };
      },
    },
  ];
};
