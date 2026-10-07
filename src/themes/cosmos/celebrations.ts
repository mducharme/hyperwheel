/** cosmos: winner celebrations. Each `setup` runs once when the scene loads (so shaders compile up front) and returns the function that plays it. */
import { cos, length, sin } from 'three/tsl';
import { PALETTE } from './meta';
import type { Celebration } from '../types';
import { atlas } from './sprites';
import type { CosmosScene } from '.';

export const celebrations = (world: CosmosScene): Celebration[] => {
  const sprites = atlas();
  return [
    {
      name: 'Supernova',
      setup(fx) {
        const inner = fx.shockwave({ color: '#ffd9a0', radius: 14, width: 0.06, duration: 1.4 });
        const outer = fx.shockwave({ color: '#8a7dff', radius: 20, width: 0.04, duration: 1.8 });
        const burst = fx.particles({
          count: 1200,
          atlas: sprites,
          cells: [0, 6],
          colors: ['#ffffff', '#ffd9a0', '#8a7dff', '#64ffda'],
          blend: 'additive',
          intensity: 2.4,
          mode: 'stretch',
          stretch: 0.12,
          emitters: [{ at: [0, 3.9, 0.6], spread: 2, speed: [5, 14] }],
          size: [0.12, 0.22],
          gravity: [0, 0, 0],
          drag: 1.6,
          life: [1.6, 2.6],
        });
        return () => {
          fx.flash('#ffffff', 1, 0.9);
          fx.ripple(1.6, 1.4);
          inner.fire(fx.at(0, 0, 0.6));
          fx.after(0.15, () => outer.fire(fx.at(0, 0, 0.5)));
          burst.fire();
          fx.shake(1.4, 0.8);
          fx.sfx.boom(0, 0.6);
          world.surge(1);
        };
      },
    },
    {
      name: 'Warp Speed',
      setup(fx) {
        const streaks = fx.particles({
          count: 1000,
          atlas: sprites,
          cells: [6],
          colors: ['#ffffff', '#9fe8ff', '#cfc6ff'],
          blend: 'additive',
          intensity: 2,
          mode: 'stretch',
          stretch: 0.09,
          // a ring of emitters around the wheel, streaking outward past the camera
          emitters: Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            return {
              at: [Math.cos(a) * 5.5, 3.9 + Math.sin(a) * 4.5, -3] as [number, number, number],
              box: [1.5, 1.5, 6] as [number, number, number],
              dir: [Math.cos(a) * 0.7, Math.sin(a) * 0.7, 1] as [number, number, number],
              spread: 0.15,
              speed: [18, 32] as [number, number],
              delay: [0, 2.2] as [number, number],
            };
          }),
          size: [0.2, 0.35],
          gravity: [0, 0, 0],
          drag: 0.1,
          life: [1.1, 1.5],
          mirror: false,
        });
        return () => {
          streaks.fire();
          fx.aberration(1.6);
          fx.zoom(0.18, 2.6);
          world.surge(1.5);
          fx.after(2.3, () => fx.flash('#cfc6ff', 0.5, 0.5));
          fx.sfx.whoosh();
          fx.after(0.9, () => fx.sfx.whoosh());
        };
      },
    },
    {
      name: 'Meteor Shower',
      setup(fx) {
        const meteors = fx.particles({
          count: 260,
          atlas: sprites,
          cells: [6],
          colors: ['#ffd9a0', '#ff8a5c', '#ffffff'],
          blend: 'additive',
          intensity: 2.6,
          mode: 'stretch',
          stretch: 0.14,
          emitters: [{ at: [-12, 16, -4], box: [10, 2, 5], dir: [1, -0.8, 0.3], spread: 0.1, speed: [14, 22], delay: [0, 2.6] }],
          size: [0.14, 0.26],
          gravity: [0, -1, 0],
          drag: 0.2,
          life: [1.4, 2],
        });
        const junk = fx.particles({
          count: 180,
          atlas: sprites,
          cells: [1, 2, 3, 4, 5],
          colors: PALETTE,
          tint: 0.7,
          lit: false,
          intensity: 1.5,
          emitters: [
            { at: [-5, 0, 2], dir: [0.4, 1, 0.3], spread: 0.4, speed: [6, 11] },
            { at: [5, 0, 2], dir: [-0.4, 1, 0.3], spread: 0.4, speed: [6, 11] },
          ],
          size: [0.3, 0.5],
          gravity: [0, -2.5, 0],
          drag: 0.8,
          life: [3.5, 4.5],
          spin: 2,
        });
        return () => {
          meteors.fire();
          junk.fire();
          for (let i = 0; i < 5; i++) fx.sfx.boom(0.4 + i * 0.5, 1.3);
          fx.orbit(-0.3, 3);
        };
      },
    },
    {
      name: 'Zero-G Tumble',
      setup(fx) {
        const drift = fx.particles({
          count: 500,
          atlas: sprites,
          cells: [0, 1, 1, 2, 5],
          colors: PALETTE,
          tint: 0.8,
          mode: 'face',
          lit: false,
          intensity: 1.6,
          emitters: [{ at: [0, 3.9, 0.5], spread: 2, speed: [2, 5] }],
          size: [0.2, 0.4],
          gravity: [0, 0, 0],
          drag: 0.6,
          life: [3.5, 5],
          spin: 1,
        });
        return () => {
          fx.stunt('tumble');
          fx.orbit(0.6, 2.6);
          drift.fire();
          world.surge(0.6);
        };
      },
    },
  ];
};
