import './style.css';
import { App } from './app/App';
import { UI } from './app/ui';
import { toast } from './app/dom';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
let ui: UI;
const app = new App(canvas, {
  onSpinStart: () => ui.onSpinStart(),
  onResult: (name, index, celebration) => ui.onResult(name, index, celebration),
  onCharacter: (info) => ui.onCharacter(info),
  onFps: (fps) => ui.onFps(fps),
});
ui = new UI(app);

async function boot() {
  try {
    await app.init();
  } catch (err) {
    console.error(err);
    const el = document.getElementById('backend')!;
    el.textContent = 'No WebGPU / WebGL2 :(';
    el.classList.add('warn');
    return;
  }
  ui.setBackend(app.stage.isWebGPU);
  const { fromLink } = await ui.init();
  app.start();
  if (fromLink) toast('Opened a shared wheel — it\'s saved in your wheels.');
}

void boot();

// handy for poking at scenes from the console during development
if (import.meta.env.DEV) Object.assign(window as any, { app, ui });
