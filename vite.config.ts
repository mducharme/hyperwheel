import { defineConfig, loadEnv } from 'vite';
import { presetWheels } from './scripts/presetWheels.ts';

export default defineConfig(({ mode }) => {
  // not VITE_-prefixed: the URL is only used while building, never shipped to the browser
  const env = loadEnv(mode, process.cwd(), '');
  return {
    build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
    plugins: [presetWheels(env.PRESET_WHEELS_URL || undefined)],
  };
});
