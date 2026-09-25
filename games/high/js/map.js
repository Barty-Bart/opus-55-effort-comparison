'use strict';
// ---------- Map generation & terrain rendering ----------
const T_GRASS = 0, T_DIRT = 1, T_SAND = 2, T_SHALLOW = 3, T_WATER = 4, T_FOREST = 5, T_GRASS2 = 6;
const TERRAIN_COL = [[96, 140, 56], [146, 118, 74], [206, 186, 128], [62, 128, 156], [34, 84, 122], [66, 94, 42], [112, 150, 62]];
const P_NONE = 0, P_TREE = 1, P_GOLD = 2, P_STONE = 3, P_BERRY = 4;

function generateMap(mapType, seed) {
  seedRng(seed);
  const N = 96;
  const terrain = new Uint8Array(N * N), plan = new Uint8Array(N * N);
  const nz1 = makeNoise(seed + 11), nz2 = makeNoise(seed + 22), nz3 = makeNoise(seed + 33), nz4 = makeNoise(seed + 44);
  const I = (i, j) => j * N + i;
  const inb = (i, j) => i >= 0 && j >= 0 && i < N && j < N;

  // Town center top-left tiles (mirrored across the x=y diagonal for fairness)
  const s1 = { x: rndi(16, 20), y: rndi(70, 74) };
  const s2 = { x: s1.y, y: s1.x };
  const c1 = { x: s1.x + 2, y: s1.y + 2 }, c2 = { x: s2.x + 2, y: s2.y + 2 };

  // --- base terrain
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const n = fbm(nz1, i * 0.07, j * 0.07, 4);
    const m = fbm(nz4, i * 0.05 + 50, j * 0.05 + 50, 3);
    terrain[I(i, j)] = n > 0.64 ? T_DIRT : m > 0.6 ? T_GRASS2 : T_GRASS;
  }
  // --- lakes
  const lakeCount = mapType === 'lakes' ? 6 : mapType === 'forest' ? 1 : 2;
  const lakeR = mapType === 'lakes' ? [4.5, 8] : [3, 5];
  for (let k = 0, tries = 0; k < lakeCount && tries < 400; tries++) {
    const cx = rrange(6, N - 6), cy = rrange(6, N - 6);
    if (cx > cy + 2) continue; // generate on player-1 half, mirror later
    if (dist(cx, cy, c1.x, c1.y) < 20 || dist(cx, cy, c2.x, c2.y) < 20) continue;
    const r = rrange(lakeR[0], lakeR[1]);
    for (let j = Math.floor(cy - r * 1.6); j <= cy + r * 1.6; j++) for (let i = Math.floor(cx - r * 1.6); i <= cx + r * 1.6; i++) {
      if (!inb(i, j)) continue;
      const d = dist(i + 0.5, j + 0.5, cx, cy) / (r * (0.7 + 0.6 * nz2(i * 0.25, j * 0.25)));
      if (d < 1) terrain[I(i, j)] = d < 0.72 ? T_WATER : T_SHALLOW;
    }
    k++;
  }
  // shallow border for deep water touching land
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (terrain[I(i, j)] !== T_WATER) continue;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const a = i + di, b = j + dj;
      if (inb(a, b) && terrain[I(a, b)] < T_SHALLOW) { terrain[I(i, j)] = T_SHALLOW; }
    }
  }
  // sand shores
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const t = terrain[I(i, j)]; if (t === T_SHALLOW || t === T_WATER) continue;
    let near = false;
    for (let dj = -1; dj <= 1 && !near; dj++) for (let di = -1; di <= 1; di++) {
      const a = i + di, b = j + dj;
      if (inb(a, b) && (terrain[I(a, b)] === T_SHALLOW || terrain[I(a, b)] === T_WATER)) { near = true; break; }
    }
    if (near) terrain[I(i, j)] = T_SAND;
  }
  // --- forests
  const th = mapType === 'forest' ? 0.53 : mapType === 'lakes' ? 0.63 : 0.615;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const t = terrain[I(i, j)]; if (t === T_SHALLOW || t === T_WATER) continue;
    const f = fbm(nz3, i * 0.075, j * 0.075, 4);
    const edge = Math.min(i, j, N - 1 - i, N - 1 - j);
    if (f > th || (edge < 2 && f > th - 0.12) || (rnd() < 0.006 && t !== T_SAND)) plan[I(i, j)] = P_TREE;
  }
  // guaranteed woodline near player 1 (away from the map centre)
  {
    const ang = Math.atan2(c1.y - N / 2, c1.x - N / 2) + rrange(-0.9, 0.9);
    const wx = c1.x + Math.cos(ang) * 11, wy = c1.y + Math.sin(ang) * 11;
    for (let j = Math.floor(wy - 6); j <= wy + 6; j++) for (let i = Math.floor(wx - 6); i <= wx + 6; i++) {
      if (!inb(i, j) || terrain[I(i, j)] >= T_SHALLOW) continue;
      const d = dist(i + 0.5, j + 0.5, wx, wy) / (4.2 * (0.7 + 0.6 * nz2(i * 0.4 + 9, j * 0.4)));
      if (d < 1) plan[I(i, j)] = P_TREE;
    }
  }
  // clear the start area
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const d = dist(i + 0.5, j + 0.5, c1.x, c1.y);
    if (d < 7.5) plan[I(i, j)] = P_NONE;
    if (d < 4.5 + nz2(i * 0.5, j * 0.5) * 1.5 && terrain[I(i, j)] < T_SAND) terrain[I(i, j)] = T_DIRT;
  }
  // mirror half: tiles with i > j copy from (j, i)
  for (let j = 0; j < N; j++) for (let i = j + 1; i < N; i++) { terrain[I(i, j)] = terrain[I(j, i)]; plan[I(i, j)] = plan[I(j, i)]; }

  // --- resources for player 1 (relative placement), mirrored for player 2
  const isFree = (i, j, margin) => {
    if (!inb(i, j) || i >= j - 1) return false;
    const t = terrain[I(i, j)]; if (t === T_SHALLOW || t === T_WATER) return false;
    if (plan[I(i, j)] !== P_NONE) return false;
    if (margin) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const a = i + di, b = j + dj; if (inb(a, b) && plan[I(a, b)] > P_TREE) return false;
    }
    if (dist(i + 0.5, j + 0.5, c1.x, c1.y) < 4.5) return false;
    return true;
  };
  const clusters = [];
  function placeCluster(code, count, dmin, dmax, cx0, cy0) {
    for (let tries = 0; tries < 300; tries++) {
      const a = rnd() * Math.PI * 2, d = rrange(dmin, dmax);
      const cx = Math.floor(cx0 + Math.cos(a) * d), cy = Math.floor(cy0 + Math.sin(a) * d);
      if (!isFree(cx, cy, true)) continue;
      if (clusters.some(c => dist(c[0], c[1], cx, cy) < 5)) continue;
      const tiles = [[cx, cy]]; plan[I(cx, cy)] = code;
      let guard = 0;
      while (tiles.length < count && guard++ < 200) {
        const [bx, by] = pick(tiles); const dd = pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
        const nx = bx + dd[0], ny = by + dd[1];
        if (isFree(nx, ny, false) && plan[I(nx, ny)] === P_NONE) { plan[I(nx, ny)] = code; tiles.push([nx, ny]); }
      }
      // clear trees tightly around the cluster so it is reachable
      clusters.push([cx, cy]);
      return tiles;
    }
    return null;
  }
  placeCluster(P_BERRY, 6, 6, 8, c1.x, c1.y);
  placeCluster(P_GOLD, 7, 8, 11, c1.x, c1.y);
  placeCluster(P_STONE, 5, 9, 12, c1.x, c1.y);
  placeCluster(P_GOLD, 6, 13, 18, c1.x, c1.y);
  placeCluster(P_STONE, 5, 14, 19, c1.x, c1.y);
  // neutral map resources (further out)
  for (let k = 0; k < 3; k++) placeCluster(P_GOLD, 6, 20, 38, c1.x, c1.y);
  placeCluster(P_STONE, 5, 22, 38, c1.x, c1.y);
  placeCluster(P_BERRY, 5, 20, 34, c1.x, c1.y);

  const animals = [];
  const freeSpot = (dmin, dmax) => {
    for (let t = 0; t < 200; t++) {
      const a = rnd() * Math.PI * 2, d = rrange(dmin, dmax);
      const x = c1.x + Math.cos(a) * d, y = c1.y + Math.sin(a) * d;
      const i = Math.floor(x), j = Math.floor(y);
      if (isFree(i, j, false) && isFree(i + 1, j, false) && isFree(i, j + 1, false)) return [i + 0.5, j + 0.5];
    }
    return null;
  };
  for (let k = 0; k < 4; k++) { const s = freeSpot(3.2, 5); if (s) animals.push({ type: 'sheep', own: true, x: s[0], y: s[1] }); }
  for (let k = 0; k < 2; k++) { const s = freeSpot(12, 22); if (s) { animals.push({ type: 'sheep', x: s[0], y: s[1] }); animals.push({ type: 'sheep', x: s[0] + 0.7, y: s[1] + 0.4 }); } }
  { const s = freeSpot(14, 19); if (s) for (let k = 0; k < 3; k++) animals.push({ type: 'deer', x: s[0] + rrange(-1, 1), y: s[1] + rrange(-1, 1) }); }
  { const s = freeSpot(22, 32); if (s) for (let k = 0; k < 3; k++) animals.push({ type: 'deer', x: s[0] + rrange(-1, 1), y: s[1] + rrange(-1, 1) }); }
  { const s = freeSpot(11, 15); if (s) animals.push({ type: 'boar', x: s[0], y: s[1] }); }
  { const s = freeSpot(18, 26); if (s) animals.push({ type: 'boar', x: s[0], y: s[1] }); }

  // mirror resources
  for (let j = 0; j < N; j++) for (let i = j + 1; i < N; i++) plan[I(i, j)] = plan[I(j, i)];

  // --- connectivity: carve a path between bases if forests block it
  const reach = floodReach(N, terrain, plan, c1.x, c1.y + 3);
  if (!reach[I(c2.x, c2.y + 3)] || !reach[I(c2.x + 3, c2.y)]) {
    const steps = 200;
    for (let s = 0; s <= steps; s++) {
      const x = lerp(c1.x, c2.x, s / steps), y = lerp(c1.y, c2.y, s / steps) + Math.sin(s / steps * Math.PI) * 6;
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
        const a = Math.floor(x) + di, b = Math.floor(y) + dj;
        if (inb(a, b) && plan[I(a, b)] === P_TREE) { plan[I(a, b)] = P_NONE; plan[I(b, a)] = P_NONE; }
      }
    }
  }

  return { N, terrain, plan, animals, s1, s2, c1, c2 };
}

function floodReach(N, terrain, plan, sx, sy) {
  const seen = new Uint8Array(N * N), q = [sy * N + sx]; seen[q[0]] = 1;
  while (q.length) {
    const k = q.pop(), i = k % N, j = (k / N) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= N || b >= N) continue;
      const n = b * N + a; if (seen[n]) continue;
      if (terrain[n] === T_WATER || terrain[n] === T_SHALLOW || plan[n] !== P_NONE) continue;
      seen[n] = 1; q.push(n);
    }
  }
  return seen;
}

// Build the terrain texture: tile-space image (R px per tile), drawn with an iso affine transform.
function renderTerrainTexture(map) {
  const N = map.N, R = 32, S = N * R;
  const cv = makeCanvas(S, S), cx = cv.getContext('2d');
  const img = cx.createImageData(S, S), d = img.data;
  const nzA = makeNoise(777), nzB = makeNoise(778), nzC = makeNoise(779);
  const Z = 512;
  const fine = new Float32Array(Z * Z), warp1 = new Float32Array(Z * Z), warp2 = new Float32Array(Z * Z);
  // tileable baked noise: noise period 256 on value grid; sampling at x*k where Z*k is a multiple of 256
  for (let v = 0; v < Z; v++) for (let u = 0; u < Z; u++) {
    fine[v * Z + u] = fbm(nzA, u * 0.5, v * 0.5, 3);   // period 512 px
    warp1[v * Z + u] = fbm(nzB, u / 2, v / 2, 3);     // 1 cell per tile
    warp2[v * Z + u] = fbm(nzC, u / 2, v / 2, 3);
  }
  const tc = new Float32Array(N * N * 3), isW = new Float32Array(N * N);
  const tv = makeNoise(4242);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, t = map.terrain[k], c = TERRAIN_COL[t];
    const v = 0.9 + 0.2 * fbm(tv, i * 0.21, j * 0.21, 2);
    tc[k * 3] = c[0] * v; tc[k * 3 + 1] = c[1] * v; tc[k * 3 + 2] = c[2] * v;
    isW[k] = t === T_WATER ? 1 : t === T_SHALLOW ? 0.7 : 0;
  }
  const light = new Float32Array(N * N);
  const nzL = makeNoise(99);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) light[j * N + i] = 0.9 + 0.2 * fbm(nzL, i * 0.06, j * 0.06, 3);
  const invR = 1 / R;
  for (let v = 0; v < S; v++) {
    for (let u = 0; u < S; u++) {
      const wi = ((v >> 4) & 511) * Z + ((u >> 4) & 511);
      let fx = u * invR - 0.5 + (warp1[wi] - 0.5) * 1.3;
      let fy = v * invR - 0.5 + (warp2[wi] - 0.5) * 1.3;
      if (fx < 0) fx = 0; if (fy < 0) fy = 0; if (fx > N - 1.001) fx = N - 1.001; if (fy > N - 1.001) fy = N - 1.001;
      const i0 = fx | 0, j0 = fy | 0;
      let ax = fx - i0, ay = fy - j0;
      ax = ax * ax * (3 - 2 * ax); ay = ay * ay * (3 - 2 * ay);
      const k00 = j0 * N + i0, k10 = k00 + 1, k01 = k00 + N, k11 = k01 + 1;
      const w00 = (1 - ax) * (1 - ay), w10 = ax * (1 - ay), w01 = (1 - ax) * ay, w11 = ax * ay;
      let r = tc[k00 * 3] * w00 + tc[k10 * 3] * w10 + tc[k01 * 3] * w01 + tc[k11 * 3] * w11;
      let g = tc[k00 * 3 + 1] * w00 + tc[k10 * 3 + 1] * w10 + tc[k01 * 3 + 1] * w01 + tc[k11 * 3 + 1] * w11;
      let b = tc[k00 * 3 + 2] * w00 + tc[k10 * 3 + 2] * w10 + tc[k01 * 3 + 2] * w01 + tc[k11 * 3 + 2] * w11;
      const wv = isW[k00] * w00 + isW[k10] * w10 + isW[k01] * w01 + isW[k11] * w11;
      const lt = light[k00] * w00 + light[k10] * w10 + light[k01] * w01 + light[k11] * w11;
      const fn = fine[(v & 511) * Z + (u & 511)];
      const amp = 0.36 - wv * 0.26;
      let m = (1 - amp / 2 + amp * fn) * (wv > 0.5 ? 1 : lt);
      if (wv > 0.02) { // water: subtle ripples & shoreline foam
        const rip = Math.sin((u + v * 0.3) * 0.09 + fn * 6) * 0.04 * wv;
        m += rip;
        if (wv > 0.25 && wv < 0.45) { r += 40; g += 40; b += 36; }
      }
      const o = (v * S + u) * 4;
      d[o] = r * m; d[o + 1] = g * m; d[o + 2] = b * m; d[o + 3] = 255;
    }
  }
  cx.putImageData(img, 0, 0);
  // flat ground details (circles become correct iso ellipses after the transform)
  seedRng(1337);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const t = map.terrain[j * N + i];
    const n = t === T_GRASS || t === T_GRASS2 ? 6 : t === T_DIRT ? 4 : t === T_FOREST ? 5 : t === T_SAND ? 2 : 0;
    for (let k = 0; k < n; k++) {
      const x = (i + rnd()) * R, y = (j + rnd()) * R, rr = rrange(1, 3.2);
      if (t === T_GRASS || t === T_GRASS2 || t === T_FOREST) {
        const p = rnd();
        cx.fillStyle = p < 0.5 ? 'rgba(40,70,20,0.28)' : p < 0.9 ? 'rgba(170,200,90,0.22)' : pick(['rgba(240,230,120,0.8)', 'rgba(255,255,255,0.7)', 'rgba(220,120,200,0.7)']);
        cx.beginPath(); cx.arc(x, y, p < 0.9 ? rr * 1.6 : 1.1, 0, 6.283); cx.fill();
      } else if (t === T_DIRT || t === T_SAND) {
        cx.fillStyle = rnd() < 0.5 ? 'rgba(70,50,30,0.35)' : 'rgba(230,210,170,0.35)';
        cx.beginPath(); cx.arc(x, y, rr * 0.8, 0, 6.283); cx.fill();
      }
    }
  }
  // minimap base (one pixel per tile)
  const mm = makeCanvas(N, N), mx = mm.getContext('2d'), mi = mx.createImageData(N, N);
  for (let k = 0; k < N * N; k++) {
    mi.data[k * 4] = tc[k * 3]; mi.data[k * 4 + 1] = tc[k * 3 + 1]; mi.data[k * 4 + 2] = tc[k * 3 + 2]; mi.data[k * 4 + 3] = 255;
  }
  mx.putImageData(mi, 0, 0);
  map.tex = cv; map.R = R; map.mini = mm;
}
