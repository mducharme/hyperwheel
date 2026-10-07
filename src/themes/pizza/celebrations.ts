/** pizza: winner celebrations. Each `setup` runs once when the scene loads (so shaders compile up front) and returns the function that plays it. */
import type { Celebration } from '../types';
import { atlas } from './sprites';
import { OVEN_MOUTH } from './layout';
import type { PizzaScene } from '.';

export const celebrations = (world: PizzaScene): Celebration[] => {
  const sprites = atlas();
  return [
    {
      name: 'Topping Rain',
      setup(fx) {
        // one system per topping, so every sprite keeps its own colour
        const topping = (cells: number[], colors: string[], count: number) =>
          fx.particles({
            count,
            atlas: sprites,
            cells,
            colors,
            tint: 1,
            mirror: false,
            emitters: [{ at: [0, 11, 0.5], box: [11, 0.5, 3], dir: [0, -1, 0], spread: 0.3, speed: [2, 5], delay: [0, 2] }],
            size: [0.22, 0.36],
            gravity: [0, -6, 0],
            drag: 0.9,
            life: [2.5, 3.2],
            spin: 4,
            wobble: 0.4,
          });
        const toppings = [topping([0], ['#c0392b', '#a93226'], 220), topping([1], ['#3f8a2c', '#4f9a3a'], 120), topping([5], ['#2a2622'], 80)];
        const slices = fx.particles({
          count: 40,
          atlas: sprites,
          cells: [2],
          mode: 'face',
          mirror: false,
          emitters: [{ at: [0, 11, 0.5], box: [10, 0.5, 2], dir: [0, -1, 0], spread: 0.2, speed: [2, 4], delay: [0.2, 2] }],
          size: [0.7, 1],
          gravity: [0, -5, 0],
          drag: 0.8,
          life: [2.6, 3.2],
          spin: 2,
        });
        return () => {
          for (const t of toppings) t.fire();
          slices.fire();
          fx.sfx.applause(2.6, 0.2);
          fx.zoom(-0.05, 2.6);
        };
      },
    },
    {
      name: 'Dough Toss',
      setup(fx) {
        const flour = fx.particles({
          count: 60,
          atlas: sprites,
          cells: [3],
          colors: ['#fff6e6'],
          tint: 1,
          mode: 'face',
          mirror: false,
          emitters: [{ at: [0, 3.9, 0.6], box: [3, 3, 0.3], dir: [0, 0.4, 1], spread: 1.5, speed: [2, 5] }],
          size: [1, 2],
          gravity: [0, 0.4, 0],
          drag: 2,
          life: [1.8, 2.6],
        });
        return () => {
          fx.stunt('flip');
          fx.after(0.15, () => flour.fire());
          fx.sfx.whoosh();
          fx.after(0.9, () => fx.sfx.whoosh());
          fx.orbit(0.25, 2.6);
        };
      },
    },
    {
      name: 'Oven Blast',
      setup(fx) {
        const embers = fx.particles({
          count: 380,
          atlas: sprites,
          cells: [4],
          colors: ['#ffd27a', '#ff7a2a', '#ff4a1a'],
          blend: 'additive',
          intensity: 3,
          mode: 'stretch',
          stretch: 0.15,
          mirror: false,
          emitters: [{ at: OVEN_MOUTH.toArray(), box: [1.4, 0.8, 0.2], dir: [-1, 0.35, 0.7], spread: 0.45, speed: [9, 15], delay: [0, 0.8] }],
          size: [0.08, 0.16],
          gravity: [0, 1.5, 0],
          drag: 0.9,
          life: [1.4, 2.2],
        });
        return () => {
          world.blast(2.6);
          embers.fire();
          fx.flash('#ff9a4a', 0.35, 0.6);
          fx.sfx.boom(0, 1.3);
          fx.shake(0.4, 1);
        };
      },
    },
    {
      name: 'Mamma Mia',
      setup(fx) {
        const slices = fx.particles({
          count: 90,
          atlas: sprites,
          cells: [2],
          mode: 'face',
          mirror: false,
          emitters: [{ at: [0, 3.9, 0.6], dir: [0, 0.4, 1], spread: 1.8, speed: [5, 10] }],
          size: [0.5, 0.8],
          gravity: [0, -7, 0],
          drag: 0.7,
          life: [2, 2.6],
          spin: 5,
        });
        return () => {
          slices.fire();
          fx.stunt('jelly', 1.6);
          fx.ripple(0.7);
          fx.sfx.pop(0, 1);
          fx.sfx.pop(0.2, 1.3);
          fx.sfx.applause(2.2, 0.4);
        };
      },
    },
  ];
};
