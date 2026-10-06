import * as THREE from 'three/webgpu';
import { builtin } from './catalog';
import { instantiate } from './loader';
import { db } from '../library/db';

const SIZE = 256;
const memory = new Map<string, Promise<string | null>>();
/** Bump when portrait framing changes so cached renders are redone. */
const VERSION = 2;

/** Portrait for a character: the pack's preview for built-ins, a cached render for uploads. */
export function characterThumb(renderer: THREE.WebGPURenderer, id: string): Promise<string | null> {
  const b = builtin(id);
  if (b?.preview) return Promise.resolve(b.preview);
  let p = memory.get(id);
  if (!p) {
    p = (async () => {
      const cached = await db.get<string>('thumbs', `${VERSION}:${id}`);
      if (cached) return cached;
      const url = await renderPortrait(renderer, id).catch((err) => {
        console.warn('thumbnail failed', err);
        return null;
      });
      if (url) await db.put('thumbs', url, `${VERSION}:${id}`);
      return url;
    })();
    memory.set(id, p);
  }
  return p;
}

/** Render a head-and-shoulders portrait of any character (also used to pre-render pack thumbnails). */
export async function renderPortrait(renderer: THREE.WebGPURenderer, id: string) {
  const inst = await instantiate(id);
  const h = inst.height;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#3a3550', 2.4));
  const key = new THREE.DirectionalLight('#ffffff', 2.2);
  key.position.set(1.5, 3, 4);
  scene.add(key);
  inst.object.position.y -= inst.minY;
  scene.add(inst.object);

  // head-and-shoulders framing
  const cam = new THREE.PerspectiveCamera(28, 1, h * 0.01, h * 20);
  const rt = new THREE.RenderTarget(SIZE, SIZE, { type: THREE.UnsignedByteType });
  const shoot = async () => {
    const prevColor = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(rt);
    renderer.render(scene, cam);
    renderer.setRenderTarget(null);
    renderer.setClearColor(prevColor, prevAlpha);
    return (await renderer.readRenderTargetPixelsAsync(rt, 0, 0, SIZE, SIZE)) as Uint8Array;
  };
  // Head-and-shoulders first, then step back gently until the character no
  // longer fills the frame edge to edge (big chibi heads, object-shaped
  // characters); full body only as a last resort.
  const coverage = (px: Uint8Array) => {
    let covered = 0;
    for (let i = 3; i < px.length; i += 4) if (px[i] > 200) covered++;
    return covered / (SIZE * SIZE);
  };
  let px: Uint8Array = new Uint8Array();
  for (const pull of [1, 1.3, 1.65]) {
    cam.position.set(0, h * (0.8 - (pull - 1) * 0.12), h * 1.05 * pull);
    cam.lookAt(0, h * (0.76 - (pull - 1) * 0.12), 0);
    px = await shoot();
    if (coverage(px) <= 0.82) break;
  }
  if (coverage(px) > 0.82) {
    const box = new THREE.Box3().setFromObject(inst.object, true);
    const size = box.getSize(new THREE.Vector3());
    const fit = (Math.max(size.y, size.x * 0.8) * 0.62) / Math.tan(THREE.MathUtils.degToRad(14));
    cam.position.set(0, size.y * 0.55, box.max.z + fit * 0.8);
    cam.lookAt(0, size.y * 0.5, 0);
    px = await shoot();
  }
  rt.dispose();

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(SIZE, SIZE);
  // render targets hold linear colour: encode to sRGB for display
  const enc = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    enc[i] = Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));
  }
  const flip = !renderer.backend.coordinateSystem || renderer.backend.coordinateSystem === THREE.WebGLCoordinateSystem;
  for (let y = 0; y < SIZE; y++) {
    const srcRow = flip ? SIZE - 1 - y : y;
    for (let x = 0; x < SIZE; x++) {
      const s = (srcRow * SIZE + x) * 4;
      const d = (y * SIZE + x) * 4;
      img.data[d] = enc[px[s]];
      img.data[d + 1] = enc[px[s + 1]];
      img.data[d + 2] = enc[px[s + 2]];
      img.data[d + 3] = px[s + 3];
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}
