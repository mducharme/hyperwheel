/** Perceived brightness of an sRGB hex color, 0..1. */
export function brightness(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Color for segment i, avoiding identical neighbours where the wheel wraps around. */
export function segmentColor(colors: string[], i: number, count: number): string {
  let idx = i % colors.length;
  if (i === count - 1 && count > 1 && idx === 0) idx = Math.floor(colors.length / 2);
  return colors[idx];
}
