/** synthwave: winner celebrations. Each `setup` runs once when the scene loads (so shaders compile up front) and returns the function that plays it. */
import * as THREE from 'three/webgpu';
import { PALETTE } from './meta';
import type { Celebration } from '../types';
import { atlas } from './sprites';

export const celebrations = (): Celebration[] => {
  const sprites = atlas();
  return [
    {
      name: 'Laser Cannons',
      setup(fx) {
        const p = fx.particles({
          count: 900,
          atlas: sprites,
          cells: [0, 1, 2, 3, 4, 5],
          colors: PALETTE,
          blend: 'normal',
          lit: false,
          intensity: 1.8,
          emitters: [
            { at: [-4.6, 0.4, 1.6], dir: [0.3, 1, 0.25], spread: 0.25, speed: [8, 15] },
            { at: [4.6, 0.4, 1.6], dir: [-0.3, 1, 0.25], spread: 0.25, speed: [8, 15] },
          ],
          size: [0.16, 0.26],
          gravity: [0, -6, 0],
          drag: 1.4,
          life: [3, 4.5],
        });
        return () => {
          p.fire();
          fx.ripple(0.8);
          fx.aberration(0.8);
          fx.sfx.boom(0, 1.2);
        };
      },
    },
    {
      name: 'Fireworks Finale',
      setup(fx) {
        const shells = 6;
        const p = fx.particles({
          count: 1800,
          atlas: sprites,
          cells: [6, 7],
          colors: PALETTE,
          blend: 'additive',
          intensity: 2.4,
          mode: 'stretch',
          stretch: 0.25,
          emitters: Array.from({ length: shells }, (_, i) => ({
            at: [(i % 2 ? 1 : -1) * (1 + Math.random() * 3.5), 4.5 + Math.random() * 3, 0.5 + Math.random() * 2] as [number, number, number],
            spread: 2,
            speed: [3, 6] as [number, number],
            delay: [i * 0.32, i * 0.32 + 0.03] as [number, number],
          })),
          size: [0.12, 0.2],
          gravity: [0, -2, 0],
          drag: 2.2,
          life: [1.4, 2.2],
        });
        return () => {
          p.fire();
          for (let i = 0; i < shells; i++) {
            fx.after(i * 0.32, () => fx.flash(PALETTE[i % PALETTE.length], 0.18, 0.3));
            fx.sfx.boom(i * 0.32, 0.8 + Math.random() * 0.5);
          }
          fx.orbit(0.25, 2.6);
        };
      },
    },
    {
      name: 'Grid Quake',
      setup(fx) {
        const waves = [0, 1, 2].map(() => fx.shockwave({ color: '#ff2fd0', radius: 18, width: 0.05, duration: 1.6 }));
        const fountain = fx.particles({
          count: 600,
          atlas: sprites,
          cells: [0, 1, 4, 5],
          colors: PALETTE,
          lit: false,
          intensity: 1.8,
          emitters: [{ at: [0, 7.6, 0.4], dir: [0, 1, 0.3], spread: 0.6, speed: [6, 10] }],
          size: [0.14, 0.24],
          gravity: [0, -7, 0],
          drag: 1.2,
        });
        return () => {
          fx.stunt('hop');
          waves.forEach((w, i) =>
            fx.after(0.35 + i * 0.22, () => {
              w.fire(new THREE.Vector3(0, 0.06, -0.6), 'floor');
              if (i === 0) {
                fx.shake(1.6, 0.7);
                fx.ripple(1.2, 1.4, new THREE.Vector3(0, 0.2, 0));
              }
            }),
          );
          fx.sfx.boom(0.35, 0.7);
          fx.after(0.2, () => fountain.fire());
        };
      },
    },
    {
      name: 'Outrun Flip',
      setup(fx) {
        const rain = fx.particles({
          count: 1000,
          atlas: sprites,
          cells: [0, 1, 2, 3, 4, 5],
          colors: PALETTE,
          lit: false,
          intensity: 1.6,
          emitters: [{ at: [0, 10.5, 0], box: [10, 1, 3], dir: [0, -1, 0], spread: 0.2, speed: [3, 6], delay: [0, 1.6] }],
          size: [0.14, 0.24],
          gravity: [0, -6, 0],
          drag: 1.2,
          life: [4, 5],
          mirror: false,
        });
        return () => {
          fx.stunt('flip');
          fx.orbit(0.5, 2.4);
          rain.fire();
          fx.flash('#ff2fd0', 0.25, 0.6);
        };
      },
    },
  ];
};
