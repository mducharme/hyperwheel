/** synthwave: confetti and celebration sprite shapes, drawn once into a texture atlas. */
import { makeAtlas, shapes } from '../../fx/atlas';

export const atlas = () =>
  makeAtlas([
    shapes.triangle(true),
    shapes.ring(0.2),
    shapes.zigzag(),
    shapes.bolt(),
    shapes.star(5, 0.45),
    shapes.plus(),
    shapes.sparkle(),
    shapes.glow(),
  ]);
