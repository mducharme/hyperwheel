import { uniform } from 'three/tsl';

/** Shader-visible app state, shared by every theme and effect. Written once per frame by the App. */
export const uSpeed = uniform(0);
export const uWin = uniform(0);
