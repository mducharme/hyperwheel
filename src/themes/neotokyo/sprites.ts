/** neotokyo: confetti and celebration sprite shapes, drawn once into a texture atlas. */
import { makeAtlas, shapes } from '../../fx/atlas';

export const atlas = () =>
  makeAtlas([
    shapes.glow(), // 0: lights, rain, trails
    shapes.circle('#fff', true), // 1: splashes
    shapes.sparkle(), // 2
    shapes.strip(0.2), // 3: neon confetti
    shapes.bolt(), // 4
  ]);
