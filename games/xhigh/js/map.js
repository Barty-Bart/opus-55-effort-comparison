// World grid, procedural map generation and terrain texture painting.
import { RNG, makeNoise, hash2, smoothstep, TAU } from './util.js';

export const T_GRASS = 0, T_DIRT = 1, T_SAND = 2, T_WATER = 3, T_FOREST = 4, T_SHALLOW = 5;

// blocked values
export const B_FREE = 0, B_WATER = 1, B_OBJECT = 2, B_BUILDING = 3;

export class GameMap {
  constructor(N) {
    this.N = N;
    this.terrain = new Uint8Array(N * N);
    this.blocked = new Uint8Array(N * N);
    this.obj = new Array(N * N).fill(null); // entity occupying the tile (resource / building)
    this.decor = [];
    this.waterTiles = [];
  }
  inb(x, y) { return x >= 0 && y >= 0 && x < this.N && y < this.N; }
  passable(x, y) {
    return x >= 0 && y >= 0 && x < this.N && y < this.N && this.blocked[y * this.N + x] === 0;
  }
  passableF(fx, fy) { return this.passable(Math.floor(fx), Math.floor(fy)); }
  isWater(x, y) {
    if (!this.inb(x, y)) return false;
    const t = this.terrain[y * this.N + x];
    return t === T_WATER;
  }
  objAt(x, y) { return this.inb(x, y) ? this.obj[y * this.N + x] : null; }
  setArea(x, y, w, h, val, ent) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      if (!this.inb(i, j)) continue;
      const k = j * this.N + i;
      this.blocked[k] = val;
      this.obj[k] = ent;
    }
  }
  clearArea(x, y, w, h, ent) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      if (!this.inb(i, j)) continue;
      const k = j * this.N + i;
      if (!ent || this.obj[k] === ent) {
        this.obj[k] = null;
        this.blocked[k] = this.terrain[k] === T_WATER ? B_WATER : B_FREE;
      }
    }
  }
  // Can a building of size s be placed with its top-left tile at (x, y)?
  canPlace(x, y, s, walkable = false) {
    for (let j = y; j < y + s; j++) for (let i = x; i < x + s; i++) {
      if (!this.inb(i, j)) return false;
      const k = j * this.N + i;
      if (this.blocked[k] !== 0) return false;
      const t = this.terrain[k];
      if (t === T_WATER || t === T_SHALLOW) return false;
      if (this.obj[k]) return false;
    }
    return true;
  }
}

// ---------------------------------------------------------------------------
// Map generation
// ---------------------------------------------------------------------------
export function generateMap({ N, numPlayers, seed, mapType }) {
  const rng = new RNG(seed);
  const nz = makeNoise(seed + 11), nz2 = makeNoise(seed + 29), nz3 = makeNoise(seed + 47), nz4 = makeNoise(seed + 71);
  const map = new GameMap(N);
  const T = map.terrain;
  const forest = new Uint8Array(N * N);
  const reserved = new Uint8Array(N * N);
  const specs = [];
  const idx = (x, y) => y * N + x;

  // --- player start positions on a ring ---
  const starts = [];
  const R = N * (numPlayers <= 2 ? 0.33 : 0.36);
  const a0 = rng.range(0, TAU);
  for (let i = 0; i < numPlayers; i++) {
    const a = a0 + (i * TAU) / numPlayers + rng.range(-0.12, 0.12);
    starts.push({ x: Math.round(N / 2 + Math.cos(a) * R), y: Math.round(N / 2 + Math.sin(a) * R) });
  }
  const distToStart = (x, y) => {
    let d = 1e9;
    for (const s of starts) d = Math.min(d, Math.hypot(x - s.x, y - s.y));
    return d;
  };

  // --- dirt patches ---
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const n = nz.fbm(x * 0.07, y * 0.07, 3);
    if (n > 0.62) T[idx(x, y)] = T_DIRT;
  }

  // --- lakes ---
  const lakeCount = mapType === 'lakes' ? rng.int(4, 6) : mapType === 'arabia' ? rng.int(1, 2) : rng.int(1, 2);
  const lakes = [];
  for (let tries = 0; tries < 400 && lakes.length < lakeCount; tries++) {
    const r = mapType === 'lakes' ? rng.range(5, 9) : rng.range(3, 5.5);
    const cx = rng.range(r + 4, N - r - 4), cy = rng.range(r + 4, N - r - 4);
    if (distToStart(cx, cy) < r + 15) continue;
    if (lakes.some((l) => Math.hypot(l.x - cx, l.y - cy) < l.r + r + 8)) continue;
    lakes.push({ x: cx, y: cy, r });
    const rr = Math.ceil(r * 1.5);
    for (let y = Math.floor(cy - rr); y <= cy + rr; y++) for (let x = Math.floor(cx - rr); x <= cx + rr; x++) {
      if (!map.inb(x, y)) continue;
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r + (nz2.n2(x * 0.22, y * 0.22) - 0.5) * 0.7;
      if (d < 1) T[idx(x, y)] = T_WATER;
    }
  }

  // --- forests ---
  const thr = mapType === 'forest' ? 0.5 : mapType === 'lakes' ? 0.63 : 0.655;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const k = idx(x, y);
    if (T[k] === T_WATER) continue;
    const f = nz3.fbm(x * 0.075, y * 0.075, 4);
    const edge = Math.min(x, y, N - 1 - x, N - 1 - y);
    const edgeF = edge < 1.5 + nz4.n2(x * 0.15, y * 0.15) * (mapType === 'forest' ? 7 : 4);
    if ((f > thr || edgeF) && distToStart(x, y) > 11) forest[k] = 1;
  }
  // a dependable woodline for each player
  for (const s of starts) {
    for (let tries = 0; tries < 60; tries++) {
      const a = rng.range(0, TAU), d = rng.range(12, 15);
      const cx = Math.round(s.x + Math.cos(a) * d), cy = Math.round(s.y + Math.sin(a) * d);
      if (!map.inb(cx, cy) || T[idx(cx, cy)] === T_WATER) continue;
      blob(cx, cy, mapType === 'forest' ? 40 : 55, (x, y) => {
        const k = idx(x, y);
        if (T[k] === T_WATER || Math.hypot(x - s.x, y - s.y) < 10) return false;
        forest[k] = 1; return true;
      });
      break;
    }
  }
  function blob(cx, cy, count, accept) {
    const seen = new Set();
    const frontier = [[cx, cy]];
    let n = 0;
    while (frontier.length && n < count) {
      const i = Math.floor(rng.next() * frontier.length);
      const [x, y] = frontier[i];
      frontier[i] = frontier[frontier.length - 1]; frontier.pop();
      const key = x + y * N;
      if (seen.has(key) || !map.inb(x, y)) continue;
      seen.add(key);
      if (!accept(x, y)) continue;
      n++;
      const dirs = rng.shuffle([[1, 0], [-1, 0], [0, 1], [0, -1]]);
      for (const [dx, dy] of dirs) frontier.push([x + dx, y + dy]);
    }
    return n;
  }

  // --- beaches around water ---
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const k = idx(x, y);
    if (T[k] === T_WATER) continue;
    let near = false;
    for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (dx * dx + dy * dy > 5) continue;
      if (map.isWater(x + dx, y + dy)) { near = true; break; }
    }
    if (near) { T[k] = T_SAND; forest[k] = 0; }
  }

  // --- guarantee that every player can reach every other player ---
  const passableGen = (k) => T[k] !== T_WATER && !forest[k];
  function reach(from) {
    const seen = new Uint8Array(N * N);
    const q = [idx(from.x, from.y)];
    seen[q[0]] = 1;
    while (q.length) {
      const k = q.pop();
      const x = k % N, y = (k / N) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!map.inb(nx, ny)) continue;
        const nk = idx(nx, ny);
        if (!seen[nk] && passableGen(nk)) { seen[nk] = 1; q.push(nk); }
      }
    }
    return seen;
  }
  for (let i = 1; i < starts.length; i++) {
    const seen = reach(starts[0]);
    if (seen[idx(starts[i].x, starts[i].y)]) continue;
    carve(starts[0], starts[i]);
  }
  function carve(a, b) {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const px = a.x + (b.x - a.x) * t + Math.sin(t * 9) * 2, py = a.y + (b.y - a.y) * t;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = Math.round(px + dx), y = Math.round(py + dy);
        if (!map.inb(x, y)) continue;
        const k = idx(x, y);
        forest[k] = 0;
        if (T[k] === T_WATER) T[k] = T_SHALLOW;
      }
    }
  }

  // --- resources ---
  const freeTile = (x, y) => map.inb(x, y) && x > 1 && y > 1 && x < N - 2 && y < N - 2 &&
    T[idx(x, y)] !== T_WATER && T[idx(x, y)] !== T_SHALLOW && !forest[idx(x, y)] && !reserved[idx(x, y)];
  const areaClear = (cx, cy, r) => {
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if (!freeTile(x, y)) return false;
    return true;
  };
  function findSpot(sx, sy, dmin, dmax, clearR) {
    for (let relax = 0; relax < 3; relax++) {
      for (let tries = 0; tries < 250; tries++) {
        const a = rng.range(0, TAU), d = rng.range(dmin, dmax + relax * 2);
        const x = Math.round(sx + Math.cos(a) * d), y = Math.round(sy + Math.sin(a) * d);
        if (areaClear(x, y, Math.max(0, clearR - relax))) return { x, y };
      }
    }
    return null;
  }
  function reserveAround(tiles, margin) {
    for (const [x, y] of tiles) {
      for (let dy = -margin; dy <= margin; dy++) for (let dx = -margin; dx <= margin; dx++) {
        const nx = x + dx, ny = y + dy;
        if (map.inb(nx, ny) && !reserved[idx(nx, ny)]) reserved[idx(nx, ny)] = 2;
      }
      reserved[idx(x, y)] = 1;
    }
  }
  function cluster(cx, cy, count, kind, amount) {
    const tiles = [];
    blob(cx, cy, count, (x, y) => {
      if (!freeTile(x, y)) return false;
      tiles.push([x, y]); reserved[idx(x, y)] = 1; return true;
    });
    for (const [x, y] of tiles) specs.push({ kind, x, y, amount, variant: rng.int(0, 5) });
    reserveAround(tiles, 1);
    return tiles.length;
  }
  function animals(cx, cy, count, kind, owner) {
    let n = 0;
    for (let tries = 0; tries < 40 && n < count; tries++) {
      const x = cx + rng.int(-2, 2), y = cy + rng.int(-2, 2);
      if (!freeTile(x, y) || reserved[idx(x, y)]) continue;
      reserved[idx(x, y)] = 2;
      specs.push({ kind, x: x + 0.5, y: y + 0.5, owner });
      n++;
    }
  }

  starts.forEach((s, pi) => {
    // clear the town site
    for (let y = s.y - 9; y <= s.y + 9; y++) for (let x = s.x - 9; x <= s.x + 9; x++) {
      if (!map.inb(x, y) || Math.hypot(x - s.x, y - s.y) > 9.5) continue;
      forest[idx(x, y)] = 0;
    }
    for (let y = s.y - 4; y <= s.y + 3; y++) for (let x = s.x - 4; x <= s.x + 3; x++) if (map.inb(x, y)) reserved[idx(x, y)] = 1;
    // starting sheep near the town center belong to the player
    for (let i = 0; i < 4; i++) {
      const p = findSpot(s.x, s.y, 4, 6, 0);
      if (p) { reserved[idx(p.x, p.y)] = 2; specs.push({ kind: 'sheep', x: p.x + 0.5, y: p.y + 0.5, owner: pi + 1 }); }
    }
    let p = findSpot(s.x, s.y, 7, 9, 2); if (p) cluster(p.x, p.y, 6, 'berry', 125);
    p = findSpot(s.x, s.y, 8, 11, 2); if (p) cluster(p.x, p.y, 7, 'gold', 800);
    p = findSpot(s.x, s.y, 13, 18, 2); if (p) cluster(p.x, p.y, 7, 'gold', 800);
    p = findSpot(s.x, s.y, 9, 13, 2); if (p) cluster(p.x, p.y, 5, 'stone', 350);
    p = findSpot(s.x, s.y, 15, 20, 2); if (p) cluster(p.x, p.y, 4, 'stone', 350);
    for (let i = 0; i < 2; i++) { p = findSpot(s.x, s.y, 11, 18, 1); if (p) animals(p.x, p.y, 2, 'sheep', 0); }
    for (let i = 0; i < 2; i++) { p = findSpot(s.x, s.y, 14, 22, 2); if (p) animals(p.x, p.y, rng.int(3, 4), 'deer', 0); }
  });
  // contested resources in the middle of the map
  const extraGold = numPlayers <= 2 ? 2 : 3;
  for (let i = 0; i < extraGold; i++) {
    for (let tries = 0; tries < 200; tries++) {
      const x = rng.int(8, N - 9), y = rng.int(8, N - 9);
      if (distToStart(x, y) < 20 || !areaClear(x, y, 2)) continue;
      cluster(x, y, 8, 'gold', 800); break;
    }
  }
  for (let i = 0; i < extraGold - 1; i++) {
    for (let tries = 0; tries < 200; tries++) {
      const x = rng.int(8, N - 9), y = rng.int(8, N - 9);
      if (distToStart(x, y) < 20 || !areaClear(x, y, 2)) continue;
      cluster(x, y, 6, 'stone', 350); break;
    }
  }
  for (let i = 0; i < numPlayers * 2; i++) {
    for (let tries = 0; tries < 100; tries++) {
      const x = rng.int(8, N - 9), y = rng.int(8, N - 9);
      if (distToStart(x, y) < 22 || !areaClear(x, y, 1)) continue;
      animals(x, y, rng.int(2, 4), 'deer', 0); break;
    }
  }

  // --- trees ---
  const density = mapType === 'forest' ? 0.96 : 0.92;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const k = idx(x, y);
    const pine = nz2.fbm(x * 0.05 + 40, y * 0.05, 2) > 0.52;
    if (forest[k] && !reserved[k]) {
      if (rng.next() < density) {
        specs.push({ kind: 'tree', x, y, amount: 100, variant: rng.int(0, 5), pine });
        T[k] = T_FOREST;
      }
    } else if (!reserved[k] && T[k] !== T_WATER && T[k] !== T_SHALLOW && T[k] !== T_SAND && distToStart(x, y) > 10 && rng.next() < 0.005) {
      specs.push({ kind: 'tree', x, y, amount: 100, variant: rng.int(0, 5), pine });
    }
  }
  // forest floor under forest edges too
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (forest[idx(x, y)] && T[idx(x, y)] === T_GRASS) T[idx(x, y)] = T_FOREST;

  // dirt ring around each town center
  for (const s of starts) {
    for (let y = s.y - 6; y <= s.y + 6; y++) for (let x = s.x - 6; x <= s.x + 6; x++) {
      if (!map.inb(x, y)) continue;
      const d = Math.hypot(x + 0.5 - s.x, y + 0.5 - s.y) + (nz.n2(x * 0.4, y * 0.4) - 0.5) * 2.2;
      if (d < 4.2 && T[idx(x, y)] !== T_WATER) T[idx(x, y)] = T_DIRT;
    }
  }

  // blocked grid from terrain
  for (let k = 0; k < N * N; k++) map.blocked[k] = T[k] === T_WATER ? B_WATER : B_FREE;
  for (let k = 0; k < N * N; k++) if (T[k] === T_WATER) map.waterTiles.push(k);

  // decorations (non-blocking)
  for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
    const k = idx(x, y);
    if (reserved[k] === 1 || forest[k]) continue;
    const t = T[k];
    const r = rng.next();
    if (t === T_GRASS && r < 0.30) {
      const kind = r < 0.2 ? 'tuft' : r < 0.26 ? 'flower' : r < 0.285 ? 'bush' : 'rock';
      map.decor.push({ x: x + rng.range(0.15, 0.85), y: y + rng.range(0.15, 0.85), kind, v: rng.int(0, 3) });
    } else if (t === T_DIRT && r < 0.08) {
      map.decor.push({ x: x + rng.range(0.2, 0.8), y: y + rng.range(0.2, 0.8), kind: 'pebble', v: rng.int(0, 3) });
    } else if (t === T_SAND && r < 0.06) {
      map.decor.push({ x: x + rng.range(0.2, 0.8), y: y + rng.range(0.2, 0.8), kind: 'reed', v: rng.int(0, 3) });
    }
  }
  map.decor.sort((a, b) => a.x + a.y - (b.x + b.y));

  return { map, starts, specs };
}

// ---------------------------------------------------------------------------
// Terrain texture: painted once in tile space, drawn with an isometric transform.
// ---------------------------------------------------------------------------
function blurField(src, N, passes) {
  let a = src, b = new Float32Array(N * N);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const l = a[y * N + Math.max(0, x - 1)], c = a[y * N + x], r = a[y * N + Math.min(N - 1, x + 1)];
      b[y * N + x] = (l + 2 * c + r) * 0.25;
    }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = b[Math.max(0, y - 1) * N + x], c = b[y * N + x], d = b[Math.min(N - 1, y + 1) * N + x];
      a[y * N + x] = (u + 2 * c + d) * 0.25;
    }
  }
  return a;
}
function cornerField(f, N) {
  const M = N + 1;
  const c = new Float32Array(M * M);
  for (let y = 0; y <= N; y++) for (let x = 0; x <= N; x++) {
    const x0 = Math.max(0, x - 1), x1 = Math.min(N - 1, x), y0 = Math.max(0, y - 1), y1 = Math.min(N - 1, y);
    c[y * M + x] = (f[y0 * N + x0] + f[y0 * N + x1] + f[y1 * N + x0] + f[y1 * N + x1]) * 0.25;
  }
  return c;
}

export async function paintTerrain(map, P, seed, onProgress) {
  const N = map.N, W = N * P, M = N + 1;
  const T = map.terrain;
  const nz = makeNoise(seed + 5), nzB = makeNoise(seed + 77);
  const mk = (fn) => { const f = new Float32Array(N * N); for (let k = 0; k < N * N; k++) f[k] = fn(T[k]); return f; };
  const fDirt = cornerField(blurField(mk((t) => (t === T_DIRT ? 1 : 0)), N, 1), N);
  const fSand = cornerField(blurField(mk((t) => (t === T_SAND ? 1 : 0)), N, 1), N);
  const fWater = cornerField(blurField(mk((t) => (t === T_WATER ? 1 : t === T_SHALLOW ? 0.35 : 0)), N, 1), N);
  const fDeep = cornerField(blurField(mk((t) => (t === T_WATER ? 1 : 0)), N, 4), N);
  const fForest = cornerField(blurField(mk((t) => (t === T_FOREST ? 1 : 0)), N, 1), N);
  const fShallow = cornerField(blurField(mk((t) => (t === T_SHALLOW ? 1 : 0)), N, 1), N);

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = W;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, W);
  const d = img.data;
  const inv = 1 / P;

  for (let ty = 0; ty < N; ty++) {
    if (onProgress && ty % 6 === 0) { onProgress(ty / N); await new Promise((r) => setTimeout(r, 0)); }
    for (let tx = 0; tx < N; tx++) {
      const c00 = ty * M + tx, c10 = c00 + 1, c01 = c00 + M, c11 = c01 + 1;
      const D = [fDirt[c00], fDirt[c10], fDirt[c01], fDirt[c11]];
      const S = [fSand[c00], fSand[c10], fSand[c01], fSand[c11]];
      const Wt = [fWater[c00], fWater[c10], fWater[c01], fWater[c11]];
      const Dp = [fDeep[c00], fDeep[c10], fDeep[c01], fDeep[c11]];
      const F = [fForest[c00], fForest[c10], fForest[c01], fForest[c11]];
      const Sh = [fShallow[c00], fShallow[c10], fShallow[c01], fShallow[c11]];
      for (let py = 0; py < P; py++) {
        const fv = (py + 0.5) * inv;
        const gy = ty * P + py;
        for (let px = 0; px < P; px++) {
          const fu = (px + 0.5) * inv;
          const gx = tx * P + px;
          const w00 = (1 - fu) * (1 - fv), w10 = fu * (1 - fv), w01 = (1 - fu) * fv, w11 = fu * fv;
          const dirt = D[0] * w00 + D[1] * w10 + D[2] * w01 + D[3] * w11;
          const sand = S[0] * w00 + S[1] * w10 + S[2] * w01 + S[3] * w11;
          const water = Wt[0] * w00 + Wt[1] * w10 + Wt[2] * w01 + Wt[3] * w11;
          const deep = Dp[0] * w00 + Dp[1] * w10 + Dp[2] * w01 + Dp[3] * w11;
          const fo = F[0] * w00 + F[1] * w10 + F[2] * w01 + F[3] * w11;
          const sh = Sh[0] * w00 + Sh[1] * w10 + Sh[2] * w01 + Sh[3] * w11;
          const u = tx + fu, v = ty + fv;
          const nLow = nz.n2(u * 0.16, v * 0.16);
          const nMid = nz.n2(u * 0.85 + 50, v * 0.85 + 13);
          const nFine = nzB.n2(gx * 0.22, gy * 0.22);
          const grain = hash2(gx, gy) - 0.5;

          // grass
          const gm = smoothstep(0.25, 0.75, nLow);
          let r = 84 + 30 * gm, g = 124 + 28 * gm, b = 42 + 16 * gm;
          const var1 = 0.9 + 0.2 * nMid + (nFine - 0.5) * 0.12;
          r *= var1; g *= var1; b *= var1;
          // forest floor
          const fw = smoothstep(0.3, 0.7, fo + (nMid - 0.5) * 0.4);
          if (fw > 0) {
            const br = nFine;
            const fr = 62 + 24 * br, fg = 80 + 6 * br, fb = 36 + 4 * br;
            r += (fr - r) * fw; g += (fg - g) * fw; b += (fb - b) * fw;
          }
          // dirt
          const dw = smoothstep(0.36, 0.62, dirt + (nMid - 0.5) * 0.5 + (nFine - 0.5) * 0.12);
          if (dw > 0) {
            const m = nMid * 0.6 + nFine * 0.4;
            const dr = 128 + 30 * m, dg = 100 + 22 * m, db = 64 + 14 * m;
            r += (dr - r) * dw; g += (dg - g) * dw; b += (db - b) * dw;
          }
          // sand
          const sw = smoothstep(0.32, 0.58, sand + (nMid - 0.5) * 0.3);
          if (sw > 0) {
            const m = nFine;
            const sr = 196 + 18 * m, sg = 174 + 16 * m, sb = 118 + 14 * m;
            r += (sr - r) * sw; g += (sg - g) * sw; b += (sb - b) * sw;
          }
          // shallows (fords)
          const shw = smoothstep(0.35, 0.65, sh + (nMid - 0.5) * 0.3);
          if (shw > 0) {
            const k = shw * 0.55;
            r += (92 - r) * k; g += (150 - g) * k; b += (158 - b) * k;
          }
          // water
          const wv = water + (nMid - 0.5) * 0.14;
          if (wv > 0.3) {
            // wet sand darkening
            const wet = smoothstep(0.3, 0.47, wv) * 0.22;
            r *= 1 - wet; g *= 1 - wet; b *= 1 - wet * 0.6;
          }
          const ww = smoothstep(0.46, 0.54, wv);
          if (ww > 0) {
            const dep = smoothstep(0.45, 0.95, deep);
            let wr = 66 + (26 - 66) * dep, wg = 138 + (78 - 138) * dep, wb = 162 + (126 - 162) * dep;
            const ripple = (nFine - 0.5) * 14;
            wr += ripple * 0.5; wg += ripple; wb += ripple;
            const foam = Math.max(0, 1 - Math.abs(wv - 0.56) / 0.05) * 0.55;
            wr += (225 - wr) * foam; wg += (238 - wg) * foam; wb += (236 - wb) * foam;
            r += (wr - r) * ww; g += (wg - g) * ww; b += (wb - b) * ww;
          }
          r += grain * 10; g += grain * 10; b += grain * 8;
          const o = (gy * W + gx) * 4;
          d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// Per-tile base colors for the minimap.
export function minimapBase(map) {
  const N = map.N;
  const out = new Uint8ClampedArray(N * N * 4);
  const nz = makeNoise(99);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const k = y * N + x;
    const n = nz.n2(x * 0.3, y * 0.3) * 16 - 8;
    let c;
    switch (map.terrain[k]) {
      case T_DIRT: c = [140, 112, 70]; break;
      case T_SAND: c = [200, 180, 124]; break;
      case T_WATER: c = [40, 96, 140]; break;
      case T_SHALLOW: c = [90, 146, 156]; break;
      case T_FOREST: c = [70, 100, 44]; break;
      default: c = [96, 138, 50];
    }
    out[k * 4] = c[0] + n; out[k * 4 + 1] = c[1] + n; out[k * 4 + 2] = c[2] + n; out[k * 4 + 3] = 255;
  }
  return out;
}
