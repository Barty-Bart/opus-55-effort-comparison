// Terrain: one tile-space texture (T texels per tile) drawn through the isometric affine transform.
import { TER } from '../core/map.js';
import { valueNoise, hash2i } from '../core/rng.js';
import { makeCanvas } from './draw3d.js';

const P = 128; // tileable patch size
const BASE = {
  [TER.GRASS]: [82, 122, 44],
  [TER.GRASS2]: [128, 132, 60],
  [TER.DIRT]: [138, 108, 70],
  [TER.SAND]: [208, 188, 132],
  [TER.SHALLOW]: [70, 132, 138],
  [TER.WATER]: [34, 80, 118],
  [TER.FOREST]: [58, 76, 34],
};

function patch(type, seed) {
  const out = new Float32Array(P * P * 3);
  const [r, g, b] = BASE[type];
  for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
    let k = 1, tr = 0, tg = 0, tb = 0;
    const n1 = valueNoise(x / 32, y / 32, seed, P / 32);
    const n2 = valueNoise(x / 12, y / 12, seed + 7, P / 12 | 0 || 1);
    const n3 = valueNoise(x / 4, y / 4, seed + 13, P / 4);
    const h = hash2i(x, y, seed) - 0.5;
    switch (type) {
      case TER.GRASS:
        k = 1 + n1 * 0.08 + n2 * 0.07 + n3 * 0.05 + h * 0.14;
        tr = n2 * 10 + (h > 0.42 ? 18 : 0); tg = n1 * 6 + (h > 0.42 ? 16 : 0); tb = -n2 * 4;
        if (h < -0.44) k *= 0.82;
        break;
      case TER.GRASS2:
        k = 1 + n1 * 0.07 + n2 * 0.08 + n3 * 0.05 + h * 0.12;
        tr = n2 * 12; tg = n2 * 6; tb = -n1 * 6;
        if (h > 0.43) { tr += 20; tg += 14; }
        break;
      case TER.DIRT:
        k = 1 + n1 * 0.06 + n2 * 0.08 + n3 * 0.06 + h * 0.1;
        if (h > 0.45) { tr += 30; tg += 26; tb += 20; }
        if (h < -0.45) k *= 0.75;
        break;
      case TER.SAND:
        k = 1 + n1 * 0.04 + n2 * 0.05 + h * 0.07;
        if (h > 0.47) k *= 0.88;
        break;
      case TER.SHALLOW:
        k = 1 + n1 * 0.05 + n3 * 0.06;
        tg = n2 * 8; tb = n2 * 6;
        break;
      case TER.WATER:
        k = 1 + n1 * 0.05 + n2 * 0.04;
        tb = n3 * 6; tg = n3 * 3;
        break;
      case TER.FOREST:
        k = 1 + n1 * 0.08 + n2 * 0.1 + h * 0.18;
        if (h > 0.4) { tr += 26; tg += 8; } // fallen leaves
        if (h < -0.42) k *= 0.7;
        break;
    }
    const i = (y * P + x) * 3;
    out[i] = r * k + tr; out[i + 1] = g * k + tg; out[i + 2] = b * k + tb;
  }
  return out;
}

export function texelsPerTile(n) { return Math.max(14, Math.min(28, Math.floor(3072 / n))); }

// Build the terrain texture for a map. Returns { canvas, T, mini (1px per tile colours) }.
export function buildTerrain(map, seed = 1) {
  const n = map.n, terrain = map.terrain, height = map.height;
  const T = texelsPerTile(n);
  const W = n * T;
  const patches = {};
  for (const t of Object.values(TER)) patches[t] = patch(t, seed * 31 + t * 101);
  // per-tile lighting from height gradient
  const light = new Float32Array(n * n);
  const H = (x, y) => height[Math.min(n - 1, Math.max(0, y)) * n + Math.min(n - 1, Math.max(0, x))];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * 0.5, dy = (H(x, y + 1) - H(x, y - 1)) * 0.5;
    const nx = -dx * 2.2, ny = -dy * 2.2, nz = 1;
    const l = Math.hypot(nx, ny, nz);
    const lam = (nx * -0.318 + ny * 0.424 + nz * 0.848) / l;
    light[y * n + x] = 0.84 + (lam - 0.848) * 1.6 + H(x, y) * 0.03;
  }
  // water depth (distance to land)
  const depth = new Float32Array(n * n);
  const q = [];
  for (let i = 0; i < n * n; i++) {
    const t = terrain[i];
    if (t === TER.WATER || t === TER.SHALLOW) depth[i] = 1e9; else { depth[i] = 0; q.push(i); }
  }
  for (let h = 0; h < q.length; h++) {
    const c = q[h], x = c % n, y = (c / n) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
      const j = yy * n + xx;
      if (depth[j] > depth[c] + 1) { depth[j] = depth[c] + 1; q.push(j); }
    }
  }
  const depthF = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) depthF[i] = Math.min(1, depth[i] / 6);
  const canvas = makeCanvas(W, W);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, W);
  const d = img.data;
  const tt = (x, y) => terrain[Math.min(n - 1, Math.max(0, y)) * n + Math.min(n - 1, Math.max(0, x))];
  const isWater = (t) => t === TER.WATER || t === TER.SHALLOW;
  const types = [0, 0, 0, 0], ws = [0, 0, 0, 0];
  for (let ty = 0; ty < n; ty++) {
    for (let tx = 0; tx < n; tx++) {
      const t0 = terrain[ty * n + tx];
      let uniform = true;
      for (let dy = -1; dy <= 1 && uniform; dy++) for (let dx = -1; dx <= 1; dx++) if (tt(tx + dx, ty + dy) !== t0) { uniform = false; break; }
      for (let b = 0; b < T; b++) {
        const v = ty * T + b;
        const fy = (v + 0.5) / T;
        for (let a = 0; a < T; a++) {
          const u = tx * T + a;
          const fx = (u + 0.5) / T;
          // bilinear light
          const lx = fx - 0.5, ly = fy - 0.5;
          const lx0 = Math.max(0, Math.min(n - 2, Math.floor(lx))), ly0 = Math.max(0, Math.min(n - 2, Math.floor(ly)));
          const wx = Math.max(0, Math.min(1, lx - lx0)), wy = Math.max(0, Math.min(1, ly - ly0));
          const li = ly0 * n + lx0;
          const L = light[li] * (1 - wx) * (1 - wy) + light[li + 1] * wx * (1 - wy) + light[li + n] * (1 - wx) * wy + light[li + n + 1] * wx * wy;
          const DD = depthF[li] * (1 - wx) * (1 - wy) + depthF[li + 1] * wx * (1 - wy) + depthF[li + n] * (1 - wx) * wy + depthF[li + n + 1] * wx * wy;
          const pi = ((v % P) * P + (u % P)) * 3;
          let r, g, bb;
          if (uniform) {
            const pt = patches[t0];
            r = pt[pi]; g = pt[pi + 1]; bb = pt[pi + 2];
            if (t0 === TER.WATER || t0 === TER.SHALLOW) { r *= 1 - DD * 0.35; g *= 1 - DD * 0.28; bb *= 1 - DD * 0.12; }
          } else {
            // warped sample position
            const wxn = valueNoise(fx * 1.7, fy * 1.7, seed + 3) * 0.42 + valueNoise(fx * 4.3, fy * 4.3, seed + 9) * 0.12;
            const wyn = valueNoise(fx * 1.7 + 31, fy * 1.7 + 17, seed + 5) * 0.42 + valueNoise(fx * 4.3 + 7, fy * 4.3 + 3, seed + 11) * 0.12;
            const sx = fx + wxn - 0.5, sy = fy + wyn - 0.5;
            const x0 = Math.floor(sx), y0 = Math.floor(sy);
            const ax = sx - x0, ay = sy - y0;
            let cnt = 0;
            const add = (t, w) => {
              for (let k = 0; k < cnt; k++) if (types[k] === t) { ws[k] += w; return; }
              types[cnt] = t; ws[cnt] = w; cnt++;
            };
            add(tt(x0, y0), (1 - ax) * (1 - ay));
            add(tt(x0 + 1, y0), ax * (1 - ay));
            add(tt(x0, y0 + 1), (1 - ax) * ay);
            add(tt(x0 + 1, y0 + 1), ax * ay);
            let sum = 0, water = 0;
            for (let k = 0; k < cnt; k++) { const w = ws[k] * ws[k] * ws[k]; ws[k] = w; sum += w; }
            r = 0; g = 0; bb = 0;
            for (let k = 0; k < cnt; k++) {
              const w = ws[k] / sum, pt = patches[types[k]];
              r += pt[pi] * w; g += pt[pi + 1] * w; bb += pt[pi + 2] * w;
              if (isWater(types[k])) water += w;
            }
            if (water > 0) { const k = DD * water; r *= 1 - k * 0.35; g *= 1 - k * 0.28; bb *= 1 - k * 0.12; }
            if (water > 0.28 && water < 0.72) {
              const f = (1 - Math.abs(water - 0.5) / 0.22) * 0.45 * (0.7 + 0.3 * valueNoise(fx * 9, fy * 9, seed + 21));
              r += (235 - r) * f; g += (240 - g) * f; bb += (230 - bb) * f;
            }
          }
          const o = (v * W + u) * 4;
          d[o] = r * L; d[o + 1] = g * L; d[o + 2] = bb * L; d[o + 3] = 255;
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  // minimap colours
  const mini = new Uint8ClampedArray(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    const c = BASE[terrain[i]];
    const l = light[i];
    mini[i * 4] = c[0] * l; mini[i * 4 + 1] = c[1] * l; mini[i * 4 + 2] = c[2] * l; mini[i * 4 + 3] = 255;
    if (terrain[i] === TER.WATER) { const dd = Math.min(1, depth[i] / 6); mini[i * 4] *= 1 - dd * 0.3; mini[i * 4 + 1] *= 1 - dd * 0.25; }
  }
  return { canvas, T, mini, depth };
}

// Scatter decorative decals; returns Int16Array per tile (0 = none, else kind*16+variant+1).
export const DECAL_KINDS = ['tuft', 'drytuft', 'flowers', 'pebbles', 'bush', 'reeds', 'lily'];
export function scatterDecals(map, seed = 1) {
  const n = map.n, out = new Int16Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x, t = map.terrain[i];
    const h = hash2i(x, y, seed + 77);
    const v = Math.floor(hash2i(x, y, seed + 91) * 4);
    let kind = -1;
    if (t === TER.GRASS) { if (h < 0.16) kind = 0; else if (h < 0.2) kind = 2; else if (h < 0.23) kind = 4; else if (h < 0.25) kind = 3; }
    else if (t === TER.GRASS2) { if (h < 0.14) kind = 1; else if (h < 0.17) kind = 3; else if (h < 0.19) kind = 4; }
    else if (t === TER.DIRT) { if (h < 0.14) kind = 3; else if (h < 0.18) kind = 1; }
    else if (t === TER.SAND) {
      let nearW = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < n && yy < n && (map.terrain[yy * n + xx] === TER.SHALLOW)) nearW = true; }
      if (nearW && h < 0.35) kind = 5; else if (h < 0.06) kind = 3;
    } else if (t === TER.SHALLOW) { if (h < 0.08) kind = 6; }
    else if (t === TER.FOREST) { if (h < 0.1) kind = 4; }
    if (kind >= 0) out[i] = kind * 16 + v + 1;
  }
  return out;
}
