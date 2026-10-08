import { uniform } from 'three/tsl';

/** Shader-visible app state, shared by every theme and effect. Written once per frame by the App. */
export const uSpeed = uniform(0);
export const uWin = uniform(0);
/** 1 when the viewer asked their OS to reduce motion: shaders use it to calm strobes. Kept in sync by `engine/motion`. */
export const uCalm = uniform(0);
