import * as THREE from 'three/webgpu';
import { float, floor, fog, hash, mix, positionWorld, rangeFogFactor, screenSize, screenUV, smoothstep, step, vec2, vec3 } from 'three/tsl';
import type { Theme, ThemeScene } from '../types';
import { makeLights, makeStand, rgb } from '../shared';
import { uSpeed, uWin } from '../../engine/globals';
import { SCALES } from '../../audio/ChipSynth';
import { meta, PALETTE } from './meta';
import { inst, rand } from '../../fx/util';
import { idleMoments } from '../../fx/ambient';
import { BLOCKS } from './layout';
import { celebrations } from './celebrations';

const VOX = 2;

/** Height of the voxel hills (in voxels) at a column; flat around the stage, rising toward the back. */
function hillHeight(x: number, z: number) {
  const back = Math.min(1, Math.max(0, (-z - 14) / 20));
  const h = 1.6 + Math.sin(x * 0.17 + 1) * 1.6 + Math.cos(z * 0.21 + x * 0.05) * 1.3 + Math.sin(x * 0.07 - z * 0.11) * 2;
  return Math.max(0, Math.round(h * back * 1.4));
}

/** The voxel landscape behind the stage: dirt columns with grass caps, as two instanced meshes. */
function makeHills() {
  const cols: [number, number, number][] = [];
  for (let x = -44; x <= 44; x += VOX) for (let z = -70; z <= -12; z += VOX) cols.push([x, z, hillHeight(x, z)]);
  const box = new THREE.BoxGeometry(VOX, VOX, VOX);
  const dirt = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, flatShading: true });
  // a speckle of darker pixels on every face, snapped to an 8-pixel grid per voxel
  const speck = hash(floor(positionWorld.mul(4)).dot(vec3(1, 57, 113)));
  dirt.colorNode = mix(rgb('#8a5a32'), rgb('#6b4226'), step(0.7, speck));
  const grass = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, flatShading: true });
  const shade = new Float32Array(cols.length);
  grass.colorNode = mix(rgb('#2fbf5f'), rgb('#22974a'), step(0.75, speck)).mul(inst(shade, 1, 'float'));
  const dirtCount = cols.reduce((n, [, , h]) => n + h, 0);
  const dirtMesh = new THREE.InstancedMesh(box, dirt, Math.max(1, dirtCount));
  const grassMesh = new THREE.InstancedMesh(box, grass, cols.length);
  const m = new THREE.Matrix4();
  let d = 0;
  cols.forEach(([x, z, h], i) => {
    for (let k = 0; k < h; k++) dirtMesh.setMatrixAt(d++, m.makeTranslation(x, k * VOX - VOX / 2, z));
    grassMesh.setMatrixAt(i, m.makeTranslation(x, h * VOX - VOX / 2, z));
    shade[i] = 0.85 + ((x * 7 + z * 13) % 3) * 0.08;
  });
  dirtMesh.count = d;
  return [dirtMesh, grassMesh];
}

/** The ground the stage stands on: a grid of grass tiles. */
function makeGround() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9 });
  const cell = floor(positionWorld.xz.div(VOX));
  const tone = hash(cell.x.add(cell.y.mul(57)));
  const speck = hash(floor(positionWorld.xz.mul(4)).dot(vec3(1, 57, 0).xy));
  m.colorNode = mix(rgb('#2fbf5f'), rgb('#22974a'), step(0.6, tone).mul(0.5).add(step(0.8, speck).mul(0.5)));
  const g = new THREE.Mesh(new THREE.BoxGeometry(100, VOX, 40), m);
  g.position.set(0, -VOX / 2, 8);
  return g;
}

/** A cloud of white cubes. */
function makeCloud(mat: THREE.Material, w: number) {
  const g = new THREE.Group();
  const box = new THREE.BoxGeometry(1.5, 1.5, 1.5);
  for (let i = 0; i < w; i++) {
    const c = new THREE.Mesh(box, mat);
    c.position.set((i - (w - 1) / 2) * 1.5, 0, 0);
    g.add(c);
    if (i > 0 && i < w - 1) {
      const top = new THREE.Mesh(box, mat);
      top.position.set((i - (w - 1) / 2) * 1.5, 1.5, 0);
      g.add(top);
    }
  }
  return g;
}

/** A face texture for the floating blocks: a brick pattern or a "?" mystery block. */
function blockTexture(kind: 0 | 1) {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const ctx = c.getContext('2d')!;
  if (kind === 0) {
    ctx.fillStyle = '#c4622d';
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = '#3a1a0a';
    for (const y of [0, 4, 8, 12]) ctx.fillRect(0, y, 16, 1);
    for (let row = 0; row < 4; row++) for (const x of row % 2 ? [3, 11] : [7, 15]) ctx.fillRect(x, row * 4, 1, 4);
  } else {
    ctx.fillStyle = '#f5b324';
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = '#8a4b0a';
    ctx.fillRect(0, 15, 16, 1);
    ctx.fillRect(15, 0, 1, 16);
    for (const [x, y] of [
      [1, 1],
      [14, 1],
      [1, 14],
      [14, 14],
    ])
      ctx.fillRect(x, y, 1, 1);
    // the question mark
    const q = ['.####.', '##..##', '....##', '...##.', '..##..', '......', '..##..'];
    ctx.fillStyle = '#fff6d6';
    q.forEach((row, y) => [...row].forEach((ch, x) => ch === '#' && ctx.fillRect(5 + x, 4 + y, 1, 1)));
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A shelled critter built from cubes: a domed shell with spots, a little head and four feet. Walks along +X. */
function makeCritter(color: string) {
  const g = new THREE.Group();
  const shell = new THREE.MeshStandardNodeMaterial({ color, roughness: 0.5, flatShading: true });
  const rim = new THREE.MeshStandardNodeMaterial({ color: '#fff1d6', roughness: 0.6, flatShading: true });
  const skin = new THREE.MeshStandardNodeMaterial({ color: '#ffd27a', roughness: 0.7, flatShading: true });
  const black = new THREE.MeshStandardNodeMaterial({ color: '#1a1b2e' });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.18, 0.8).translate(0, 0.32, 0), rim));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.36, 0.72).translate(0, 0.58, 0), shell));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.5).translate(0, 0.85, 0), shell));
  for (const [x, z] of [
    [-0.2, 0.37],
    [0.2, -0.37],
    [0.15, 0.37],
  ]) g.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.02).translate(x, 0.62, z), rim));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36).translate(0.6, 0.58, 0), skin));
  for (const s of [-1, 1]) g.add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.06).translate(0.79, 0.64, s * 0.09), black));
  const feet = [
    [0.3, 0.25],
    [-0.3, 0.25],
    [0.3, -0.25],
    [-0.3, -0.25],
  ].map(([x, z]) => {
    const ft = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.18), skin);
    ft.position.set(x, 0.1, z);
    g.add(ft);
    return ft;
  });
  return { group: g, feet };
}

/** A tiny voxel hero: cap, head, shirt, overalls and boots. Faces +X. */
function makeHero() {
  const g = new THREE.Group();
  const box = (w: number, h: number, d: number, x: number, y: number, color: string) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d).translate(x, y, 0), new THREE.MeshStandardNodeMaterial({ color, roughness: 0.6, flatShading: true }));
    g.add(m);
  };
  box(0.32, 0.14, 0.3, 0, 0.07, '#4a2c17'); // boots
  box(0.3, 0.26, 0.26, 0, 0.27, '#3f6fd8'); // overalls
  box(0.34, 0.22, 0.28, 0, 0.5, '#3ddc84'); // shirt
  box(0.3, 0.28, 0.28, 0, 0.75, '#ffd2a8'); // head
  box(0.34, 0.1, 0.32, 0.02, 0.93, '#ff4d4d'); // cap
  box(0.12, 0.04, 0.3, 0.2, 0.9, '#ff4d4d'); // peak
  box(0.04, 0.06, 0.06, 0.16, 0.78, '#1a1b2e'); // eye
  g.scale.setScalar(1.3);
  return { group: g, big: 0 };
}

export interface PixelScene extends ThemeScene {
  /** Every block bumps and pops a coin. */
  bumpAll(): void;
}

// ------------------------------------------------------------------ theme

export const pixel: Theme<PixelScene> = {
  ...meta,
  wheel: {
    palette: PALETTE,
    font: `"${meta.font.family}"`,
    fontWeight: meta.font.weight,
    rim: ['#2b2d42', '#ffd23f'],
    holo: 0.1,
    flapper: '#ffffff',
    leds: ['#ffd23f', '#3fa9ff'],
    hub: ['#ff4d4d', '#ffd23f'],
    pegs: '#ffffff',
    frame: '#1a1b2e',
    voxelRim: ['#ff4d4d', '#ffd23f', '#3ddc84', '#3fa9ff', '#c86bff'],
    pins: 'cubes',
    pointer: 'pixel',
  },
  post: { bloom: [0.2, 0.35, 0.95], exposure: 0.82, aberration: 0.6, vignette: 0.3 },
  character: { spot: [0, 0.22, 1.6], entrance: 'pop' },
  tick: 'blip',
  song: {
    bpm: 150,
    root: 60,
    scale: SCALES.major,
    progressions: [
      [0, 5, 3, 4],
      [0, 3, 4, 0],
      [5, 4, 3, 4],
    ],
    lead: 'square',
    bass: 'triangle',
    drums: 'four',
    density: 0.7,
    arp: true,
    brightness: 6000,
  },

  createScene({ scene, center }) {
    const group = new THREE.Group();
    // a pixelated sunset: the sky is snapped to a coarse pixel grid, banded, with a blocky sun
    const PX = 7;
    const q = floor(screenUV.mul(screenSize).div(PX)).mul(PX).div(screenSize);
    const aspect = screenSize.x.div(screenSize.y);
    const bands = floor(q.y.mul(40)).div(40);
    let skyCol: any = mix(rgb('#241a5c'), rgb('#8a3a9a'), smoothstep(0.0, 0.1, bands));
    skyCol = mix(skyCol, rgb('#ff6a5c'), smoothstep(0.08, 0.17, bands));
    skyCol = mix(skyCol, rgb('#ffc56b'), smoothstep(0.15, 0.24, bands));
    const sunD = vec2(q.x.mul(aspect), q.y).sub(vec2(aspect.mul(0.56), 0.15)).length();
    const sunCol = mix(rgb('#fff17a'), rgb('#ff9a3c'), smoothstep(0.08, 0.2, q.y)).mul(1.6);
    skyCol = mix(skyCol, sunCol, step(sunD, 0.075));
    // a sparse checker of stars in the top bands
    const star = step(0.985, hash(floor(screenUV.mul(screenSize).div(PX)).dot(vec2(1, 157)))).mul(smoothstep(0.1, 0.0, q.y));
    scene.backgroundNode = skyCol.add(vec3(star));
    scene.fogNode = fog(rgb('#e88a6a'), rangeFogFactor(45, 120));
    scene.environmentIntensity = 0.25;

    group.add(makeGround(), ...makeHills());

    const cloudMat = new THREE.MeshStandardNodeMaterial({ color: '#ffffff', roughness: 1, flatShading: true });
    cloudMat.emissiveNode = rgb('#ffb3a0').mul(0.45);
    const clouds = [
      { x: -22, y: 14, z: -40, w: 5, speed: 0.8 },
      { x: 4, y: 18, z: -55, w: 6, speed: 0.6 },
      { x: 30, y: 12, z: -36, w: 4, speed: 0.9 },
      { x: -40, y: 20, z: -60, w: 7, speed: 0.5 },
    ].map((c) => {
      const mesh = makeCloud(cloudMat, c.w);
      group.add(mesh);
      return { ...c, mesh };
    });

    // floating rows of bricks and mystery blocks
    const mats = [0, 1].map((k) => new THREE.MeshStandardNodeMaterial({ map: blockTexture(k as 0 | 1), roughness: 0.8 }));
    const blockGeo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
    const blocks = BLOCKS.map(([x, y, z, k]) => {
      const mesh = new THREE.Mesh(blockGeo, mats[k]);
      mesh.position.set(x, y, z);
      group.add(mesh);
      return { mesh, y, bump: 0, mystery: k === 1 };
    });

    // coins: spinning above the blocks, and popping out of them when bumped
    const coinMat = new THREE.MeshStandardNodeMaterial({ color: '#ffd23f', metalness: 0.6, roughness: 0.3, flatShading: true });
    coinMat.emissiveNode = rgb('#ffb300').mul(float(0.35).add(uWin.mul(0.8)));
    const coinGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.12, 8).rotateX(Math.PI / 2);
    const coins = blocks.map((b) => {
      const mesh = new THREE.Mesh(coinGeo, coinMat);
      mesh.position.set(b.mesh.position.x, b.y + 1.5, b.mesh.position.z);
      mesh.visible = b.mystery;
      group.add(mesh);
      return { mesh, pop: -1 };
    });

    // a voxel stand: a plinth of stacked blocks
    const blockMat = mats[0];
    group.add(makeStand(center, { legs: blockMat, plinth: new THREE.MeshStandardNodeMaterial({ color: '#2b2d42', roughness: 0.6 }), neon: rgb('#ffd23f').mul(float(1.3).add(uSpeed.mul(0.08)).add(uWin.mul(2.5))) }));

    const bump = (i: number) => {
      blocks[i].bump = 1;
      if (blocks[i].mystery) coins[i].pop = 0;
    };

    // shelled critters patrolling the ground; bonk one and it flips onto its back for a bit
    const critters = [
      { x0: -9, x1: -5.2, z: 0.6, color: '#3fb6a8' },
      { x0: 5.4, x1: 8.6, z: -0.4, color: '#c86bff' },
      { x0: -12, x1: -7, z: -6, color: '#ff8c2e' },
      { x0: 6, x1: 11, z: -7, color: '#3fa9ff' },
    ].map((c, i) => {
      const k = makeCritter(c.color);
      group.add(k.group);
      return { ...c, ...k, t: i * 1.7, flipped: 0 };
    });

    // a tiny hero hopping along the right-hand row of blocks
    const hero = makeHero();
    group.add(hero.group);
    const row = BLOCKS.filter(([x]) => x > 0).map(([x, y, z]) => new THREE.Vector3(x, y + 0.6, z));
    let heroAt = 0;
    let heroDir = 1;
    let hopT = 0; // 0..1 while mid-jump
    let heroWait = 0.8;

    // idle moments: a block bumps, a critter gets bonked, the hero does a big jump
    const moments = idleMoments();
    moments.add(() => bump(Math.floor(rand(0, blocks.length))));
    moments.add(() => (critters[Math.floor(rand(0, 2))].flipped = 2.5));
    moments.add(() => {
      heroWait = 0;
      hero.big = 1;
    });

    // sunset light: warm low key, a violet sky fill
    const lights = makeLights(group, ['#ffc48a', 1.45], []);
    group.add(new THREE.HemisphereLight('#c08ad0', '#2a5a3a', 0.45));

    // quantise motion to the frame-rate of an old console
    const snap = (v: number) => Math.round(v * 8) / 8;

    return {
      group,
      moments,
      bumpAll() {
        blocks.forEach((_, i) => bump(i));
      },
      update(f) {
        lights(f.speed, f.win);
        moments.update(f);
        for (const c of critters) {
          c.flipped = Math.max(0, c.flipped - f.dt);
          if (c.flipped > 0) {
            // on its back, legs kicking
            c.group.rotation.z = Math.PI;
            c.group.position.y = 0.55 + snap(Math.abs(Math.sin(c.flipped * 6)) * 0.15);
            c.feet.forEach((ft, j) => (ft.position.y = 0.1 + Math.sin(f.time * 20 + j) * 0.05));
            continue;
          }
          c.group.rotation.z = 0;
          c.t += f.dt * 0.35 * (1 + f.speed * 0.03);
          const u = (Math.sin(c.t) + 1) / 2;
          c.group.position.set(snap(c.x0 + (c.x1 - c.x0) * u), 0, c.z);
          c.group.rotation.y = Math.cos(c.t) >= 0 ? 0 : Math.PI;
          // a two-frame walk
          const step = Math.floor(f.time * 6) % 2;
          c.feet.forEach((ft, j) => (ft.position.y = 0.1 + (j % 2 === step ? 0.08 : 0)));
        }
        // the hero waits on a block, then hops to the next one (a big jump when it feels like it)
        if (hopT > 0) {
          hopT += f.dt / (hero.big ? 0.9 : 0.5);
          const from = row[heroAt];
          const to = row[heroAt + heroDir];
          const e = Math.min(1, hopT);
          hero.group.position.lerpVectors(from, to, e);
          hero.group.position.y += Math.sin(e * Math.PI) * (hero.big ? 2.6 : 1.1);
          if (hopT >= 1) {
            heroAt += heroDir;
            hopT = 0;
            heroWait = rand(0.6, 1.6);
            hero.big = 0;
            bump(BLOCKS.findIndex(([x, , z]) => x === to.x && z === to.z));
          }
        } else {
          hero.group.position.copy(row[heroAt]);
          heroWait -= f.dt;
          if (heroWait <= 0) {
            if (heroAt + heroDir < 0 || heroAt + heroDir >= row.length) heroDir = -heroDir;
            hero.group.rotation.y = heroDir > 0 ? 0 : Math.PI;
            hopT = 0.0001;
          }
        }
        for (const c of clouds) {
          c.x += f.dt * c.speed;
          if (c.x > 50) c.x = -50;
          c.mesh.position.set(snap(c.x), c.y, c.z);
        }
        blocks.forEach((b, i) => {
          b.bump = Math.max(0, b.bump - f.dt * 5);
          b.mesh.position.y = b.y + snap(Math.sin(b.bump * Math.PI) * 0.4);
          const coin = coins[i];
          if (coin.pop >= 0) {
            coin.pop += f.dt;
            coin.mesh.visible = true;
            coin.mesh.position.y = b.y + 1.5 + Math.sin(Math.min(1, coin.pop / 0.6) * Math.PI) * 2.2;
            if (coin.pop > 0.6) coin.pop = -1;
          }
          // coins turn in steps, like a four-frame sprite
          coin.mesh.rotation.y = Math.floor(f.time * 8 + i) * (Math.PI / 4);
        });
      },
    };
  },

  celebrations,
};
