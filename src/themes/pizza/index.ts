import * as THREE from 'three/webgpu';
import { abs, float, floor, fog, fract, hash, mix, mx_fractal_noise_float, mx_noise_float, positionLocal, positionWorld, rangeFogFactor, smoothstep, step, texture, time, uniform, uv, vec2, vec3 } from 'three/tsl';
import type { Theme, ThemeScene } from '../types';
import { makeLights, makeStand, rgb } from '../shared';
import { Particles } from '../../fx/Particles';
import { uSpeed, uWin } from '../../engine/globals';
import { SCALES } from '../../audio/ChipSynth';
import { meta, PALETTE } from './meta';
import { rand } from '../../fx/util';
import { atlas } from './sprites';
import { idleMoments } from '../../fx/ambient';
import { OVEN_MOUTH } from './layout';
import { celebrations } from './celebrations';

type N = any;

const BACK_Z = -10;

// ------------------------------------------------------------------ the kitchen

/** A butcher-block counter: end-grain strips of varying tone. */
function makeCounter() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.7 });
  const p = positionWorld;
  const strip = floor(p.x.div(0.7));
  const block = floor(p.z.div(1.8).add(hash(strip).mul(3)));
  const tone = hash(strip.mul(17).add(block.mul(31)));
  const grain = mx_noise_float(vec3(p.x.mul(6), p.z.mul(0.6), 0)).mul(0.5).add(0.5);
  const seam = step(0.96, fract(p.x.div(0.7))).max(step(0.98, fract(p.z.div(1.8).add(hash(strip).mul(3)))));
  m.colorNode = mix(mix(rgb('#b9814a'), rgb('#dba86c'), tone), rgb('#8a5a2e'), grain.mul(0.35)).mul(float(1).sub(seam.mul(0.35)));
  const f = new THREE.Mesh(new THREE.PlaneGeometry(44, 30), m);
  f.rotation.x = -Math.PI / 2;
  f.position.z = -2;
  return f;
}

/** The back wall: cream subway tiles above a band of green tiles. */
function makeWall() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.35 });
  const p = positionWorld;
  const row = floor(p.y.div(0.4));
  const u = p.x.div(0.8).add(row.mul(0.5));
  const grout = step(0.92, fract(p.y.div(0.4))).max(step(0.96, fract(u)));
  const low = step(p.y, 2.4);
  const tile = mix(rgb('#d8c9ac'), rgb('#2a9d8f').mul(0.8), low).mul(float(0.93).add(hash(floor(u).add(row.mul(91))).mul(0.07)));
  m.colorNode = mix(tile, rgb('#9a8f7c'), grout).mul(0.6);
  const g = new THREE.Group();
  const back = new THREE.Mesh(new THREE.PlaneGeometry(44, 16), m);
  back.position.set(0, 8, BACK_Z);
  g.add(back);
  return g;
}

/** A dome of firebrick with a glowing arched mouth and flames dancing inside. */
function makeOven(uFlare: N) {
  const g = new THREE.Group();
  const brick = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 });
  const pl = positionLocal;
  const ang = pl.x.atan(pl.z);
  const row = floor(pl.y.div(0.32));
  const col = floor(ang.mul(14).add(row.mul(0.5)));
  const mortar = step(0.9, fract(pl.y.div(0.32))).max(step(0.92, fract(ang.mul(14).add(row.mul(0.5)))));
  const soot = smoothstep(1.2, 3.6, pl.y);
  brick.colorNode = mix(mix(rgb('#b5532f'), rgb('#8f3b22'), hash(col.add(row.mul(37)))), rgb('#d8c7a8'), mortar).mul(float(1).sub(soot.mul(0.5)));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(3.6, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), brick);
  dome.position.y = 1.3;
  g.add(dome);
  // the stone base it sits on
  const stone = new THREE.MeshStandardNodeMaterial({ color: '#6d665c', roughness: 0.9, flatShading: true });
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(3.9, 4, 1.3, 20).translate(0, 0.65, 0), stone));
  // chimney
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 3, 12).translate(0.6, 5.6, -1.2), brick));

  // the mouth: an arch on the dome's face, glowing with flames
  const arch = new THREE.Shape();
  arch.moveTo(-1.3, 0);
  arch.lineTo(-1.3, 0.9);
  arch.absarc(0, 0.9, 1.3, Math.PI, 0, true);
  arch.lineTo(1.3, 0);
  arch.closePath();
  const fire = new THREE.MeshBasicNodeMaterial();
  const u = uv();
  const fu = vec2(u.x.div(2.6).add(0.5), u.y.div(2.2));
  const n = mx_fractal_noise_float(vec3(fu.x.mul(4), fu.y.mul(3).sub(time.mul(2.2)), time.mul(0.4)), 3, 2, 0.5).mul(0.5).add(0.5);
  const flame = smoothstep(0.35, 0.75, n.sub(fu.y.mul(0.65)).add(0.25)).mul(smoothstep(0.5, 0.1, abs(fu.x.sub(0.5))));
  const flareK = float(1).add(uFlare.mul(2.5));
  fire.colorNode = mix(rgb('#1a0804'), mix(rgb('#ff5a1a'), rgb('#ffd27a'), flame.mul(flame)), flame).mul(float(1.4).mul(flareK)).add(rgb('#ff6a20').mul(0.15));
  const mouth = new THREE.Mesh(new THREE.ShapeGeometry(arch, 24), fire);
  mouth.position.set(0, 1.3, 3.55);
  g.add(mouth);
  // a brick lip around the arch
  const lip = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.2, 8, 24, Math.PI).translate(0, 0.9, 0), brick);
  lip.position.set(0, 1.3, 3.5);
  g.add(lip);

  const pos = OVEN_MOUTH.clone();
  g.position.set(pos.x, 0, pos.z - 3.8);
  g.rotation.y = -0.35;
  return g;
}

/** A neon "PIZZA" sign on the tiles. */
function makeSign(uBuzz: N) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 300;
  const ctx = c.getContext('2d')!;
  ctx.font = '200px "Chewy", "Comic Sans MS", cursive';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 16;
  ctx.lineJoin = 'round';
  ctx.strokeText('PIZZA', 512, 160);
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  // only the lettering glows: the canvas alpha masks the colour
  m.colorNode = rgb('#ff4d6d').mul(texture(tex).a).mul(float(2.2).mul(float(1).sub(uBuzz.mul(0.85))));
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.76), m);
  sign.position.set(-8.5, 7.4, BACK_Z + 0.05);
  return sign;
}

/** Odds and ends on the counter: tomatoes, a flour sack, a rolling pin, a stack of pizza boxes. */
function makeProps() {
  const g = new THREE.Group();
  const tomato = new THREE.MeshStandardNodeMaterial({ color: '#d62828', roughness: 0.3 });
  const stem = new THREE.MeshStandardNodeMaterial({ color: '#2d6a2e', roughness: 0.7 });
  for (const [x, z, s] of [
    [-6.6, 0.6, 0.38],
    [-6, 1.2, 0.33],
    [-7.1, 1.3, 0.35],
    [-6.4, 1.9, 0.3],
  ]) {
    const t = new THREE.Mesh(new THREE.SphereGeometry(s, 16, 12).scale(1, 0.85, 1), tomato);
    t.position.set(x, s * 0.85, z);
    g.add(t);
    const st = new THREE.Mesh(new THREE.ConeGeometry(s * 0.35, s * 0.3, 5), stem);
    st.position.set(x, s * 1.75, z);
    g.add(st);
  }
  // a flour sack
  const sackGeo = new THREE.SphereGeometry(1, 16, 12);
  const sp = sackGeo.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const y = sp.getY(i);
    const k = y > 0 ? 1 - y * 0.45 : 1;
    sp.setXYZ(i, sp.getX(i) * k * 0.9, (y + 1) * 0.85, sp.getZ(i) * k * 0.7);
  }
  sackGeo.computeVertexNormals();
  const sack = new THREE.MeshStandardNodeMaterial({ color: '#e8dcc0', roughness: 1 });
  const s1 = new THREE.Mesh(sackGeo, sack);
  s1.position.set(-9.5, 0, -3.5);
  s1.rotation.y = 0.4;
  g.add(s1);
  // rolling pin
  const wood = new THREE.MeshStandardNodeMaterial({ color: '#d9a56a', roughness: 0.6 });
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.4, 14).rotateZ(Math.PI / 2), wood);
  pin.add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.3, 8).rotateZ(Math.PI / 2), wood));
  pin.position.set(5.2, 0.22, 2.2);
  pin.rotation.y = 0.5;
  g.add(pin);
  // pizza boxes
  const box = new THREE.MeshStandardNodeMaterial({ roughness: 0.9 });
  box.colorNode = mix(rgb('#c9a678'), rgb('#e63946'), step(0.8, fract(positionWorld.y.mul(1.6).add(0.1))).mul(0.6));
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.32, 2.6), box);
    b.position.set(-8.2 + rand(-0.12, 0.12), 0.16 + i * 0.34, -6.5);
    b.rotation.y = rand(-0.15, 0.15);
    g.add(b);
  }
  return g;
}

export interface PizzaScene extends ThemeScene {
  /** The oven roars: flames flare and embers pour out. */
  blast(seconds: number): void;
}

// ------------------------------------------------------------------ theme

export const pizza: Theme<PizzaScene> = {
  ...meta,
  wheel: {
    palette: PALETTE,
    font: `"${meta.font.family}"`,
    fontWeight: meta.font.weight,
    rim: ['#c47a35', '#ffd166'],
    holo: 0.05,
    flapper: '#e63946',
    leds: ['#ffd27a', '#ff7a3a'],
    hub: ['#e63946', '#ffd166'],
    pegs: '#fff1d0',
    frame: '#3a2416',
    pizza: true,
    pointer: 'cutter',
  },
  post: { bloom: [0.55, 0.45, 0.78], exposure: 0.95, aberration: 0.5, vignette: 0.7 },
  character: { spot: [0, 0.22, 1.6], entrance: 'pop' },
  tick: 'knock',
  song: {
    bpm: 138,
    root: 62,
    scale: SCALES.major,
    progressions: [
      [0, 3, 4, 0],
      [0, 5, 3, 4],
      [3, 4, 0, 0],
    ],
    lead: 'triangle',
    bass: 'triangle',
    drums: 'four',
    density: 0.6,
    arp: true,
    brightness: 4500,
  },

  createScene({ scene, center }) {
    const group = new THREE.Group();
    const uFlare = uniform(0);
    const uBuzz = uniform(0);
    scene.fogNode = fog(rgb('#2a1a12'), rangeFogFactor(28, 70));
    scene.environmentIntensity = 0.12;
    scene.backgroundNode = rgb('#2a1a12');

    group.add(makeCounter(), makeWall(), makeOven(uFlare), makeSign(uBuzz), makeProps());

    // a shelf of jars along the wall
    const shelfWood = new THREE.MeshStandardNodeMaterial({ color: '#6b4226', roughness: 0.85 });
    group.add(new THREE.Mesh(new THREE.BoxGeometry(7, 0.18, 0.8).translate(-8, 4.6, BACK_Z + 0.4), shelfWood));
    const jarColors = ['#e63946', '#ffd166', '#2a9d8f', '#f4a261', '#fff1d0', '#8d5524'];
    jarColors.forEach((c, i) => {
      const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.8, 14).translate(0, 0.4, 0), new THREE.MeshStandardNodeMaterial({ color: c, roughness: 0.3 }));
      jar.position.set(-10.6 + i * 1.05, 4.69, BACK_Z + 0.4);
      jar.add(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.14, 14).translate(0, 0.86, 0), shelfWood));
      group.add(jar);
    });

    // strings of warm bulbs swagged across the room
    const bulbSpots: THREE.Vector3[] = [];
    for (const [z, y, sag] of [
      [-2.5, 8.6, 1.1],
      [-5.5, 9.2, 1.3],
      [-8.5, 9.6, 1],
    ]) {
      for (let i = 0; i <= 26; i++) {
        const t = i / 26;
        bulbSpots.push(new THREE.Vector3(-15 + t * 30, y - Math.sin(t * Math.PI) * sag - Math.abs(Math.sin(t * Math.PI * 3)) * 0.35, z));
      }
    }
    const bulbMat = new THREE.MeshBasicNodeMaterial();
    // each bulb glows at its own slightly different warmth and twinkles slowly
    const bh = hash(positionWorld.x.mul(3).floor().add(positionWorld.z.mul(7).floor()));
    bulbMat.colorNode = mix(rgb('#ffcf87'), rgb('#ff9a4a'), bh).mul(float(2.6).add(time.mul(1.5).add(bh.mul(40)).sin().mul(0.4)).add(uWin.mul(2)));
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 8, 6), bulbMat, bulbSpots.length);
    const bm = new THREE.Matrix4();
    bulbSpots.forEach((p, i) => bulbs.setMatrixAt(i, bm.makeTranslation(p.x, p.y, p.z)));
    group.add(bulbs);
    const wire = new THREE.MeshBasicNodeMaterial({ color: '#1a120c' });
    for (let s = 0; s < 3; s++) {
      const curve = new THREE.CatmullRomCurve3(bulbSpots.slice(s * 27, s * 27 + 27).map((p) => p.clone().setY(p.y + 0.12)));
      group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 120, 0.015, 4), wire));
    }

    // a fresh pizza on a wooden peel, steaming
    const peel = new THREE.Group();
    const peelWood = new THREE.MeshStandardNodeMaterial({ color: '#c08a52', roughness: 0.7 });
    peel.add(new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.06, 28).translate(0, 0.03, 0), peelWood));
    peel.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 1.8).translate(0, 0.03, 1.9), peelWood));
    const cheese = new THREE.MeshStandardNodeMaterial({ roughness: 0.55 });
    cheese.colorNode = mix(rgb('#ffcf5c'), rgb('#e8902e'), mx_noise_float(positionWorld.mul(4)).mul(0.5).add(0.5).mul(0.6));
    peel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.08, 28).translate(0, 0.1, 0), cheese));
    peel.add(new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.09, 8, 32).rotateX(Math.PI / 2).translate(0, 0.12, 0), new THREE.MeshStandardNodeMaterial({ color: '#d29149', roughness: 0.8 })));
    const pep = new THREE.MeshStandardNodeMaterial({ color: '#a8261c', roughness: 0.5 });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const r = i ? 0.55 : 0;
      peel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.03, 14).translate(Math.cos(a) * r, 0.15, Math.sin(a) * r), pep));
    }
    peel.position.set(-5.4, 0, -0.8);
    peel.rotation.y = 0.5;
    group.add(peel);

    const brass = new THREE.MeshStandardNodeMaterial({ color: '#c9a25a', metalness: 0.7, roughness: 0.35 });
    group.add(makeStand(center, { legs: brass, plinth: new THREE.MeshStandardNodeMaterial({ color: '#3a2416', roughness: 0.7 }), neon: rgb('#ffb35a').mul(float(1.3).add(uSpeed.mul(0.08)).add(uWin.mul(2.4))) }));

    // embers drifting up from the oven's mouth
    const sprites = atlas();
    const embers = new Particles({
      count: 60,
      atlas: sprites,
      cells: [4],
      loop: true,
      mode: 'face',
      blend: 'additive',
      intensity: 2.5,
      colors: ['#ffb35a', '#ff6a20'],
      mirror: false,
      emitters: [{ at: OVEN_MOUTH.toArray(), box: [1.6, 0.5, 0.3], dir: [0, 1, 0.3], spread: 0.4, speed: [0.6, 1.4] }],
      size: [0.05, 0.11],
      gravity: [0, 0.8, 0],
      drag: 0.4,
      life: [1.6, 2.6],
      wobble: 0.5,
    });
    group.add(embers.object);

    let blastLeft = 0;
    let buzzLeft = 0;
    // idle moments: the oven flares, the neon sign buzzes, a puff of flour
    const flour = new Particles({
      count: 40,
      atlas: sprites,
      cells: [3],
      colors: ['#fff6e6'],
      tint: 1,
      mode: 'face',
      mirror: false,
      emitters: [{ at: [-9.5, 1.6, -3.5], box: [0.4, 0.2, 0.4], dir: [0.3, 1, 0.4], spread: 0.7, speed: [0.8, 1.8] }],
      size: [0.5, 0.9],
      gravity: [0, 0.2, 0],
      drag: 1.6,
      life: [1.6, 2.4],
    });
    group.add(flour.object);
    // steam curling up off the fresh pizza
    const steam = new Particles({
      count: 24,
      atlas: sprites,
      cells: [3],
      loop: true,
      colors: ['#fff6e6'],
      tint: 1,
      intensity: 0.5,
      mode: 'face',
      mirror: false,
      emitters: [{ at: [-5.4, 0.3, -0.8], box: [0.6, 0, 0.6], dir: [0, 1, 0], spread: 0.25, speed: [0.3, 0.6] }],
      size: [0.4, 0.8],
      gravity: [0.05, 0.25, 0],
      drag: 0.5,
      life: [2.4, 3.2],
      wobble: 0.6,
    });
    group.add(steam.object);
    const moments = idleMoments();
    moments.add(() => (blastLeft = 0.9));
    moments.add(() => (buzzLeft = 1.2));
    moments.add(() => flour.fire());

    // evening: a soft warm key on the wheel; the oven, the bulbs and the neon do the rest
    const lights = makeLights(group, ['#ffd9a8', 0.75], [
      ['#ff7a2a', 34, [OVEN_MOUTH.x - 0.5, 2.4, OVEN_MOUTH.z + 2]],
      ['#ff4d6d', 8, [-8.5, 7, BACK_Z + 2]],
      ['#ffc27a', 14, [-6, 7.6, -4]],
      ['#ffc27a', 10, [4, 7.8, -5]],
    ]);
    group.add(new THREE.HemisphereLight('#a8705a', '#2a160c', 0.22));
    const ovenLight = group.children.find((o): o is THREE.PointLight => (o as THREE.PointLight).isPointLight && (o as THREE.PointLight).color.getHexString() === 'ff7a2a');

    return {
      group,
      moments,
      blast(seconds) {
        blastLeft = Math.max(blastLeft, seconds);
      },
      update(f) {
        lights(f.speed, f.win);
        moments.update(f);
        embers.update(f.time);
        flour.update(f.time);
        steam.update(f.time);
        blastLeft = Math.max(0, blastLeft - f.dt);
        uFlare.value += ((blastLeft > 0 ? 1 : 0) - uFlare.value) * (1 - Math.exp(-f.dt * 6));
        // on top of the shared speed and win boost: the oven flickers and flares
        if (ovenLight) ovenLight.intensity *= (1 + uFlare.value * 2) * (0.9 + Math.sin(f.time * 13) * 0.05 + Math.sin(f.time * 7.3) * 0.05);
        buzzLeft = Math.max(0, buzzLeft - f.dt);
        uBuzz.value = buzzLeft > 0 && Math.random() < 0.4 ? 1 : 0;
      },
    };
  },

  celebrations,
};

