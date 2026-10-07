/** Perceived brightness of an sRGB hex color, 0..1. */
export function brightness(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

const linear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

/** WCAG relative luminance of an sRGB hex color. */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * linear(((n >> 16) & 255) / 255) + 0.7152 * linear(((n >> 8) & 255) / 255) + 0.0722 * linear((n & 255) / 255);
}

/** WCAG contrast ratio between two hex colors (1..21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Whether names on this segment color should be dark rather than white.
 * Keeps the brightness rule (white on saturated colors is part of the look),
 * but switches when its pick drops under 3:1 (WCAG's minimum for large text)
 * and the other color reads better.
 */
export function prefersDarkText(hex: string, dark: string, light = '#ffffff'): boolean {
  const pickDark = brightness(hex) > 0.62;
  const picked = contrast(hex, pickDark ? dark : light);
  const other = contrast(hex, pickDark ? light : dark);
  return picked < 3 && other > picked ? !pickDark : pickDark;
}

/** Color for segment i, avoiding identical neighbours where the wheel wraps around. */
export function segmentColor(colors: string[], i: number, count: number): string {
  let idx = i % colors.length;
  if (i === count - 1 && count > 1 && idx === 0) idx = Math.floor(colors.length / 2);
  return colors[idx];
}
