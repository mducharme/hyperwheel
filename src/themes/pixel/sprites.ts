/** pixel: confetti and celebration sprite shapes, drawn once into a texture atlas. Everything is drawn on a coarse pixel grid. */
import { makeAtlas, type Sprite } from '../../fx/atlas';

/** Draw a bitmap (rows of '#' and '.') centred in the cell, `c` maps characters to colours. */
const bitmap =
  (rows: string[], c: Record<string, string>): Sprite =>
  (ctx, r) => {
    const n = Math.max(rows.length, ...rows.map((s) => s.length));
    const px = (r * 1.8) / n;
    rows.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (!c[ch]) return;
        ctx.fillStyle = c[ch];
        ctx.fillRect((x - row.length / 2) * px, (y - rows.length / 2) * px, px + 0.5, px + 0.5);
      }),
    );
  };

const W = { '#': '#fff', o: '#ccc' };

export const coin = bitmap(['..####..', '.#oooo#.', '#oo##oo#', '#oo##oo#', '#oo##oo#', '#oo##oo#', '.#oooo#.', '..####..'], { '#': '#fff', o: '#ddd' });
export const square = bitmap(['#'], W);
export const star = bitmap(['...#...', '...#...', '#######', '.#####.', '..###..', '.##.##.', '##...##'], W);
export const heart = bitmap(['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'], W);
export const oneUp = bitmap(
  ['.#..#..#.###.', '##..#..#.#..#', '.#..#..#.###.', '.#..#..#.#...', '###..##..#...'],
  W,
);

export const atlas = () =>
  makeAtlas([
    coin, // 0
    square, // 1
    star, // 2
    heart, // 3
    oneUp, // 4
  ]);
