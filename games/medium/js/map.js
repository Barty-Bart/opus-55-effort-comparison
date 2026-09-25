// Procedural, mirror-symmetric map generation.
import { mulberry32, fbm, valueNoise } from './util.js';

export const T = { GRASS: 0, FOREST: 1, DIRT: 2, SAND: 3, WATER: 4, DEEP: 5 };

export function generateMap(seed, N) {
  const rnd = mulberry32(seed);
  const terrain = new Uint8Array(N * N);
  const tree = new Uint8Array(N * N);
  const reserved = new Uint8Array(N * N);   // tiles where nothing may be placed
  const idx = (x, y) => y * N + x;
  const inb = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
  // symmetric noise: f(x,y) == f(y,x) so the map is fair for both sides
  const sym = (fn) => (x, y) => (fn(x, y) + fn(y, x)) * 0.5;
  const s1 = seed % 10000;

  const starts = [{ x: 22, y: N - 22 }, { x: N - 22, y: 22 }];

  // --- lakes on the diagonal (symmetric under x<->y) ---
  const lakes = [
    { x: N * 0.2 + rnd() * 4, r: 6.5 + rnd() * 3 },
    { x: N * 0.8 - rnd() * 4, r: 6.5 + rnd() * 3 },
  ];
  if (rnd() < 0.6) lakes.push({ x: N * 0.5, r: 3.5 + rnd() * 2 });
  const lakeNoise = sym((x, y) => fbm(x / 5, y / 5, s1 + 3, 3));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let best = 9;
    for (const L of lakes) {
      const d = Math.hypot(x + 0.5 - L.x, y + 0.5 - L.x) / L.r;
      best = Math.min(best, d);
    }
    const v = best + (lakeNoise(x, y) - 0.5) * 0.7;
    const i = idx(x, y);
    if (v < 0.6) terrain[i] = T.DEEP;
    else if (v < 1.0) terrain[i] = T.WATER;
    else if (v < 1.22) terrain[i] = T.SAND;
  }

  // --- forests ---
  const forestNoise = sym((x, y) => fbm(x / 11, y / 11, s1 + 11, 4));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = idx(x, y);
    if (terrain[i] >= T.SAND) continue;
    const edge = Math.min(x, y, N - 1 - x, N - 1 - y);
    const edgeBoost = edge < 3 ? 0.35 : edge < 6 ? 0.12 : 0;
    const f = forestNoise(x, y) + edgeBoost;
    if (f > 0.64) tree[i] = 1;
  }

  // keep bases open + dirt around town centers
  for (const s of starts) {
    for (let y = -13; y <= 13; y++) for (let x = -13; x <= 13; x++) {
      const tx = s.x + x, ty = s.y + y;
      if (!inb(tx, ty)) continue;
      const d = Math.hypot(x, y);
      const i = idx(tx, ty);
      if (d < 11.5) tree[i] = 0;
      if (d < 4.2 + valueNoise(tx * 0.6, ty * 0.6, s1) * 2.2 && terrain[i] === T.GRASS) terrain[i] = T.DIRT;
      if (d < 3.2) reserved[i] = 1;
    }
  }

  const resources = [];
  const occupied = () => { const o = new Uint8Array(N * N); return o; };
  const occ = occupied();
  const free = (x, y) => inb(x, y) && !tree[idx(x, y)] && terrain[idx(x, y)] < T.SAND && !occ[idx(x, y)] && !reserved[idx(x, y)];
  const mirror = (p) => ({ x: p.y, y: p.x });

  function placeBlob(cx, cy, count, type, both = true) {
    // grow a compact cluster from (cx,cy); mirror placement for the other side
    const placed = [];
    const q = [[Math.round(cx), Math.round(cy)]];
    const seen = new Set();
    let guard = 0;
    while (q.length && placed.length < count && guard++ < 400) {
      q.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy));
      const [x, y] = q.shift();
      const k = x + ',' + y;
      if (seen.has(k)) continue;
      seen.add(k);
      const m = mirror({ x, y });
      if (free(x, y) && free(m.x, m.y) && !(x === m.x && y === m.y)) {
        placed.push([x, y]);
        occ[idx(x, y)] = 1; occ[idx(m.x, m.y)] = 1;
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) q.push([x + dx, y + dy]);
    }
    for (const [x, y] of placed) {
      resources.push({ type, x, y });
      if (both) resources.push({ type, x: y, y: x });
    }
    return placed.length;
  }
  function forestBlob(cx, cy, r) {
    for (let y = -r - 2; y <= r + 2; y++) for (let x = -r - 2; x <= r + 2; x++) {
      const tx = Math.round(cx + x), ty = Math.round(cy + y);
      if (!inb(tx, ty)) continue;
      const d = Math.hypot(x, y) + (valueNoise(tx * 0.7, ty * 0.7, s1 + 5) - 0.5) * 2;
      if (d < r) {
        for (const p of [{ x: tx, y: ty }, mirror({ x: tx, y: ty })]) {
          const i = idx(p.x, p.y);
          if (terrain[i] < T.SAND && !reserved[i] && !occ[i]) tree[i] = 1;
        }
      }
    }
  }

  // Resource layout around player 0 start (mirrored for player 1).
  const s = starts[0];
  const toCenter = Math.atan2(N / 2 - s.y, N / 2 - s.x);
  const base = toCenter + Math.PI + (rnd() - 0.5) * 0.6;
  const at = (ang, d) => ({ x: s.x + Math.cos(ang) * d, y: s.y + Math.sin(ang) * d });
  const wood = at(base, 11 + rnd() * 2);
  forestBlob(wood.x, wood.y, 4.2);
  const wood2 = at(base + 1.7 + rnd() * 0.4, 13 + rnd() * 2);
  forestBlob(wood2.x, wood2.y, 3.5);
  const gold = at(base - 1.6 + (rnd() - 0.5) * 0.4, 9 + rnd() * 1.5);
  placeBlob(gold.x, gold.y, 7, 'gold');
  const stone = at(base + 2.9 + (rnd() - 0.5) * 0.3, 10 + rnd() * 1.5);
  placeBlob(stone.x, stone.y, 5, 'stone');
  const berry = at(base + 0.9 + (rnd() - 0.5) * 0.3, 6.5 + rnd());
  placeBlob(berry.x, berry.y, 6, 'berry');
  // second gold further away
  const gold2 = at(toCenter + (rnd() - 0.5) * 1.4, 17 + rnd() * 3);
  placeBlob(gold2.x, gold2.y, 5, 'gold');

  // Animals: sheep near town center, deer further out
  const animals = [];
  for (let k = 0; k < 4; k++) {
    const p = at(base - 0.6 + k * 0.35, 4.8 + (k % 2) * 0.6);
    animals.push({ type: 'sheep', x: p.x, y: p.y });
  }
  for (let g = 0; g < 2; g++) {
    const c = at(rnd() * Math.PI * 2, 15 + rnd() * 3);
    for (let k = 0; k < 2; k++) animals.push({ type: 'sheep', x: c.x + k * 0.6, y: c.y + (k % 2) * 0.5 });
  }
  for (let g = 0; g < 2; g++) {
    const c = at(toCenter + (g ? 1 : -1) * (0.9 + rnd() * 0.4), 16 + rnd() * 4);
    for (let k = 0; k < 3; k++) animals.push({ type: 'deer', x: c.x + (k - 1) * 0.7, y: c.y + (k % 2) * 0.6 });
  }

  // Neutral resources in the contested middle (mirrored pairs)
  for (let k = 0; k < 6; k++) {
    let tries = 0;
    while (tries++ < 50) {
      const x = 12 + rnd() * (N - 24), y = 12 + rnd() * (N - 24);
      if (Math.abs(x - y) < 6) continue;
      if (Math.hypot(x - s.x, y - s.y) < 22 || Math.hypot(y - s.x, x - s.y) < 22) continue;
      if (!free(Math.round(x), Math.round(y))) continue;
      const type = k < 4 ? 'gold' : 'stone';
      placeBlob(x, y, type === 'gold' ? 6 : 5, type);
      break;
    }
  }
  for (let k = 0; k < 4; k++) {
    const x = 10 + rnd() * (N - 20), y = 10 + rnd() * (N - 20);
    if (Math.hypot(x - s.x, y - s.y) < 18 || Math.hypot(y - s.x, x - s.y) < 18) continue;
    for (let j = 0; j < 3; j++) {
      const p = { x: x + j * 0.7, y: y + (j % 2) * 0.6 };
      animals.push({ type: 'deer', ...p });
    }
  }
  // stragglers
  for (let k = 0; k < 40; k++) {
    const x = Math.floor(rnd() * N), y = Math.floor(rnd() * N);
    if (Math.hypot(x - s.x, y - s.y) < 7 || Math.hypot(y - s.x, x - s.y) < 7) continue;
    if (free(x, y) && free(y, x)) { tree[idx(x, y)] = 1; tree[idx(y, x)] = 1; }
  }

  // mirror animals
  const allAnimals = [];
  for (const a of animals) {
    allAnimals.push(a);
    allAnimals.push({ type: a.type, x: a.y, y: a.x });
  }

  // Connectivity: make sure bases can reach each other through land
  const passable = (x, y) => inb(x, y) && !tree[idx(x, y)] && terrain[idx(x, y)] < T.WATER && !occ[idx(x, y)];
  function reach() {
    const seen = new Uint8Array(N * N);
    const q = [idx(starts[0].x, starts[0].y)];
    seen[q[0]] = 1;
    while (q.length) {
      const i = q.pop();
      const x = i % N, y = (i / N) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (passable(nx, ny) && !seen[idx(nx, ny)]) { seen[idx(nx, ny)] = 1; q.push(idx(nx, ny)); }
      }
    }
    return seen[idx(starts[1].x, starts[1].y)];
  }
  if (!reach()) {
    // carve a symmetric, gently curving road through the middle
    const a = starts[0], b = starts[1];
    for (let t = 0; t <= 1; t += 0.004) {
      const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const tx = Math.round(x + ox), ty = Math.round(y + oy);
        if (!inb(tx, ty)) continue;
        tree[idx(tx, ty)] = 0; tree[idx(ty, tx)] = 0;
        if (terrain[idx(tx, ty)] >= T.WATER) { terrain[idx(tx, ty)] = T.SAND; terrain[idx(ty, tx)] = T.SAND; }
      }
    }
  }

  // forest floor under trees
  for (let i = 0; i < N * N; i++) if (tree[i] && terrain[i] === T.GRASS) terrain[i] = T.FOREST;

  const trees = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (tree[idx(x, y)]) trees.push({ x, y });

  return { N, terrain, trees, resources, animals: allAnimals, starts };
}
