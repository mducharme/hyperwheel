import './style.css';
import { App } from './app/App';
import { UI } from './app/ui';
import { toast } from './app/dom';
import { listAssets } from './library/assets';
import { storageAvailable } from './library/db';
import { getTheme, prefetchThemes } from './themes';
import { persist, store } from './app/store';
import { loadSceneFont } from './themes/fonts';
import { debug } from './debug';
import { startTheme } from './app/route';

const debugParam = new URLSearchParams(location.search).get('debug');
if (debugParam !== null) {
  store.debug = !['0', 'false', 'off'].includes(debugParam);
  persist();
}
debug.enabled = store.debug;
document.body.classList.toggle('debug', store.debug);

/**
 * Load uploaded characters in the background (one at a time, when idle) so
 * their dance clips join the shared library — then any Mixamo-rigged
 * character can borrow them on the first spin.
 */
async function warmDanceLibrary() {
  const idle = () => new Promise<void>((r) => ('requestIdleCallback' in window ? requestIdleCallback(() => r()) : setTimeout(r, 200)));
  const assets = await listAssets();
  if (!assets.length) return;
  const { loadTemplateCached } = await import('./characters/loader');
  for (const asset of assets) {
    await idle();
    await loadTemplateCached(asset.id).catch(() => undefined);
  }
}

// Start downloading the scene we'll most likely show while the GPU initialises.
// start on the first scene's code and wheel font right away, in parallel with everything else
const firstTheme = getTheme(startTheme);
void firstTheme.load();
void loadSceneFont(firstTheme.font);

const canvas = document.getElementById('scene') as HTMLCanvasElement;
let ui: UI;
const app = new App(canvas, {
  onSpinStart: () => ui.onSpinStart(),
  onResult: (name, index, celebration) => ui.onResult(name, index, celebration),
  onCharacter: (info) => ui.onCharacter(info),
  onFps: (fps) => ui.onFps(fps),
  onQuality: (level) => ui?.onQuality(level),
  onFirstFrame: () => {
    document.body.classList.add('ready');
    setTimeout(() => document.getElementById('boot')?.remove(), 800);
  },
});
ui = new UI(app);

/** Start-up failed: say so in the loading overlay instead of spinning forever. */
function bootFailed(message: string, err: unknown) {
  console.error(err);
  const el = document.getElementById('boot');
  if (!el) return;
  el.classList.add('failed');
  el.setAttribute('role', 'alert');
  el.removeAttribute('aria-hidden');
  el.querySelector('p')!.textContent = message;
}

async function boot() {
  performance.mark('ls:boot');
  try {
    await app.init();
    performance.mark('ls:renderer');
  } catch (err) {
    return bootFailed('This browser can’t draw 3D graphics (it needs WebGPU or WebGL2). Try an up-to-date Chrome, Safari, Edge or Firefox.', err);
  }
  ui.setBackend(app.stage.isWebGPU);
  let started: Awaited<ReturnType<UI['init']>>;
  try {
    started = await ui.init();
  } catch (err) {
    return bootFailed('Something went wrong while starting LocoSpin. Reloading the page usually fixes it.', err);
  }
  const { fromLink, linkError } = started;
  performance.mark('ls:scene');
  app.start();
  // after the first frame: fetch the other scenes and the character loaders while idle
  const later = (fn: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 1500));
  later(() => {
    prefetchThemes();
    void import('./characters/loader');
    void warmDanceLibrary();
  });
  const saving = await storageAvailable();
  // ask the browser not to clear uploaded characters and wheels when space runs low
  // (or, in Safari, after a week without a visit); it may say no, which changes nothing
  if (saving) void navigator.storage?.persist?.().catch(() => false);
  if (!saving) toast('This browser isn’t letting LocoSpin save anything — your wheel will be lost when you leave the page.', 'error');
  else if (fromLink) toast('Opened a shared wheel — it\'s saved in your wheels.');
  else if (linkError) toast(linkError);
}

void boot();

// handy for poking at scenes from the console during development
if (import.meta.env.DEV) Object.assign(window as any, { app, ui });
