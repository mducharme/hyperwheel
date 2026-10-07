/** Small reusable TSL building blocks shared by the wheel, effects and themes. */
import { abs, cos, dot, float, hash, normalView, positionViewDirection, pow, rtt, screenSize, screenUV, sin, step, time, vec3 } from 'three/tsl';

type N = any;

/** Cosine palette: smooth rainbow-ish hue cycle, great for holographic sheen. */
export const iridescent = (t: N) => cos(vec3(0, 0.33, 0.67).add(t).mul(Math.PI * 2)).mul(0.5).add(0.5);

/** Rim-light factor: 0 facing the camera, 1 at grazing angles. */
export const fresnel = (power = 2) => pow(float(1).sub(abs(dot(normalView, positionViewDirection))), power);

/**
 * Render a soft full-screen node (nebulae, cloud noise) into a reduced-size
 * texture each frame and stretch it back over the screen. Smooth noise looks the
 * same upscaled, at a fraction of the cost (0.25 = 1/16 of the pixels). Keep
 * anything sharp, like stars, out of it.
 */
export const lowRes = (node: N, scale = 0.25) => (rtt(node, null, null, { resolutionScale: scale } as any) as any).sample(screenUV);

/** Screen-space twinkling star field. `cell` is star spacing in pixels. */
export const starField = (density = 0.9965, cell = 2.5, brightness = 1.6, seed = 0) => {
  const c = screenUV.mul(screenSize).div(cell).floor();
  const h = hash(c.x.add(c.y.mul(1931.0)).add(seed));
  const twinkle = sin(time.mul(2.5).add(h.mul(500))).mul(0.5).add(0.5);
  return step(density, h).mul(twinkle).mul(brightness);
};
