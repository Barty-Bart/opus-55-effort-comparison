// ===== Map: terrain, elevation, generation, pathfinding =====
'use strict';
const T = { GRASS: 0, DIRT: 1, SAND: 2, SHALLOW: 3, WATER: 4, DEEP: 5, FOREST: 6, ROCK: 7 };
const TER_NAMES = ['Grass', 'Dirt', 'Sand', 'Shallows', 'Water', 'Deep Water', 'Forest Floor', 'Rocky Ground'];
const isWaterT = t => t === T.WATER || t === T.DEEP;

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

function makeNoise(rng) {
  const P = new Uint8Array(512), G = [];
  for (let i = 0; i < 256; i++) P[i] = i;
  for (let i = 255; i > 0; i--) { const j = (rng() * (i + 1)) | 0; const t = P[i]; P[i] = P[j]; P[j] = t; }
  for (let i = 0; i < 256; i++) P[i + 256] = P[i];
  for (let i = 0; i < 256; i++) G.push(rng());
  const fade = t => t * t * (3 - 2 * t);
  function v(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const a = G[P[(xi & 255) + P[yi & 255]]], b = G[P[((xi + 1) & 255) + P[yi & 255]]];
    const c = G[P[(xi & 255) + P[(yi + 1) & 255]]], d = G[P[((xi + 1) & 255) + P[(yi + 1) & 255]]];
    const u = fade(xf), w = fade(yf);
    return (a * (1 - u) + b * u) * (1 - w) + (c * (1 - u) + d * u) * w;
  }
  return function (x, y, oct = 3) { let s = 0, amp = 1, f = 1, tot = 0; for (let o = 0; o < oct; o++) { s += v(x * f, y * f) * amp; tot += amp; amp *= 0.5; f *= 2; } return s / tot; };
}

class GameMap {
  constructor(n) {
    this.n = n;
    this.ter = new Uint8Array(n * n);
    this.elev = new Uint8Array(n * n);
    this.vh = new Float32Array((n + 1) * (n + 1));
    this.blk = new Int32Array(n * n); // entity id blocking this tile (building/resource)
    this.deco = new Uint8Array(n * n); // random detail seed
    this.landReg = new Int32Array(n * n);
    this.waterReg = new Int32Array(n * n);
    this.version = 0;
  }
  idx(x, y) { return y * this.n + x; }
  inb(x, y) { return x >= 0 && y >= 0 && x < this.n && y < this.n; }
  isWater(x, y) { return this.inb(x, y) && isWaterT(this.ter[y * this.n + x]); }
  elevAt(x, y) { x = Math.max(0, Math.min(this.n - 1, x | 0)); y = Math.max(0, Math.min(this.n - 1, y | 0)); return this.elev[y * this.n + x]; }
  computeVH() {
    const n = this.n, N = n + 1;
    for (let vy = 0; vy <= n; vy++) for (let vx = 0; vx <= n; vx++) {
      let s = 0, c = 0;
      for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 0; dx++) {
        const x = vx + dx, y = vy + dy;
        if (x >= 0 && y >= 0 && x < n && y < n) {
          const t = this.ter[y * n + x];
          s += isWaterT(t) ? -0.35 : this.elev[y * n + x]; c++;
        }
      }
      this.vh[vy * N + vx] = s / c;
    }
    this.version++;
  }
  // continuous height (in elevation units) at tile-space point
  h(x, y) {
    const n = this.n, N = n + 1;
    x = Math.max(0, Math.min(n - 0.001, x)); y = Math.max(0, Math.min(n - 0.001, y));
    const xi = x | 0, yi = y | 0, fx = x - xi, fy = y - yi;
    const a = this.vh[yi * N + xi], b = this.vh[yi * N + xi + 1], c = this.vh[(yi + 1) * N + xi], d = this.vh[(yi + 1) * N + xi + 1];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }
  canStep(ax, ay, bx, by) { return Math.abs(this.elev[ay * this.n + ax] - this.elev[by * this.n + bx]) < 2; }
  computeRegions() {
    const n = this.n;
    this.landReg.fill(0); this.waterReg.fill(0);
    let rid = 0;
    const st = [];
    for (let i = 0; i < n * n; i++) {
      const water = isWaterT(this.ter[i]);
      const arr = water ? this.waterReg : this.landReg;
      if (arr[i]) continue;
      rid++; arr[i] = rid; st.push(i);
      while (st.length) {
        const c = st.pop(), cx = c % n, cy = (c / n) | 0;
        for (let d = 0; d < 4; d++) {
          const nx = cx + [1, -1, 0, 0][d], ny = cy + [0, 0, 1, -1][d];
          if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
          const j = ny * n + nx;
          if (arr[j] || isWaterT(this.ter[j]) !== water) continue;
          if (!water && !this.canStep(cx, cy, nx, ny)) continue;
          arr[j] = rid; st.push(j);
        }
      }
    }
  }
}

// ---------- Pathfinding (A*, 8-directional) ----------
const PF = { g: null, par: null, stamp: null, closed: null, cur: 1, heap: [], n: 0 };
function pfInit(n) {
  if (PF.n === n) return;
  PF.n = n; PF.g = new Float32Array(n * n); PF.par = new Int32Array(n * n); PF.stamp = new Uint32Array(n * n); PF.closed = new Uint32Array(n * n);
}
// passFn(i, x, y) -> bool. goal: {x0,y0,x1,y1,r}
function findPath(map, sx, sy, goal, passFn, maxNodes = 9000) {
  const n = map.n; pfInit(n);
  sx = Math.max(0, Math.min(n - 1, sx | 0)); sy = Math.max(0, Math.min(n - 1, sy | 0));
  const stamp = ++PF.cur;
  const g = PF.g, par = PF.par, st = PF.stamp, cl = PF.closed;
  const heap = []; // [f, idx]
  const push = (f, i) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; const t = heap[p]; heap[p] = heap[k]; heap[k] = t; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (; ;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; const t = heap[m]; heap[m] = heap[k]; heap[k] = t; k = m; } } return top; };
  const dist = (x, y) => { const dx = Math.max(goal.x0 - x, 0, x - goal.x1), dy = Math.max(goal.y0 - y, 0, y - goal.y1); return { dx, dy }; };
  const hfun = (x, y) => { const { dx, dy } = dist(x, y); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
  const done = (x, y) => { const { dx, dy } = dist(x, y); return Math.max(dx, dy) <= goal.r; };
  const s = sy * n + sx;
  g[s] = 0; par[s] = -1; st[s] = stamp; push(hfun(sx, sy), s);
  let best = s, bestH = hfun(sx, sy), expanded = 0, found = -1;
  while (heap.length) {
    const [, c] = pop();
    if (cl[c] === stamp) continue; cl[c] = stamp;
    const cx = c % n, cy = (c / n) | 0;
    if (done(cx, cy)) { found = c; break; }
    const hh = hfun(cx, cy); if (hh < bestH) { bestH = hh; best = c; }
    if (++expanded > maxNodes) break;
    for (let d = 0; d < 8; d++) {
      const dx = [1, -1, 0, 0, 1, 1, -1, -1][d], dy = [0, 0, 1, -1, 1, -1, 1, -1][d];
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
      const j = ny * n + nx;
      if (cl[j] === stamp) continue;
      if (!passFn(j, nx, ny) || !map.canStep(cx, cy, nx, ny)) continue;
      if (d >= 4 && (!passFn(cy * n + nx, nx, cy) || !passFn(ny * n + cx, cx, ny))) continue;
      const ng = g[c] + (d >= 4 ? 1.414 : 1) + Math.max(0, map.elev[j] - map.elev[c]) * 0.3;
      if (st[j] !== stamp || ng < g[j]) { st[j] = stamp; g[j] = ng; par[j] = c; push(ng + hfun(nx, ny), j); }
    }
  }
  const end = found >= 0 ? found : best;
  const pts = [];
  for (let c = end; c !== -1 && pts.length < 2000; c = par[c]) pts.push(c);
  pts.reverse();
  // string-pull smoothing
  const out = [];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    for (; j > i + 1; j--) if (lineClear(map, pts[i], pts[j], passFn)) break;
    out.push(pts[j]); i = j;
  }
  return { pts: out.map(c => ({ x: c % n + 0.5, y: ((c / n) | 0) + 0.5 })), ok: found >= 0 };
}
function lineClear(map, a, b, passFn) {
  const n = map.n; let x0 = a % n, y0 = (a / n) | 0; const x1 = b % n, y1 = (b / n) | 0;
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2;
  let px = x0, py = y0;
  for (let s = 1; s <= steps; s++) {
    const t = s / steps; const x = Math.round(x0 + (x1 - x0) * t), y = Math.round(y0 + (y1 - y0) * t);
    if (x === px && y === py) continue;
    if (!passFn(y * n + x, x, y) || !map.canStep(px, py, x, y)) return false;
    if (x !== px && y !== py && (!passFn(py * n + x, x, py) || !passFn(y * n + px, px, y))) return false;
    px = x; py = y;
  }
  return true;
}

// ---------- Map generation → spec ----------
const MAP_SIZES = { tiny: 64, small: 80, medium: 100, large: 120 };
function generateMapSpec(opts) {
  const n = MAP_SIZES[opts.size] || 80;
  const seed = opts.seed >>> 0;
  const rng = mulberry32(seed);
  const noise = makeNoise(rng), noise2 = makeNoise(rng), noise3 = makeNoise(rng);
  const np = opts.numPlayers;
  const ter = new Uint8Array(n * n), elev = new Uint8Array(n * n);
  const type = opts.mapType;
  // start positions
  const starts = [];
  const a0 = rng() * Math.PI * 2;
  const rad = type === 'islands' ? 0.32 * n : type === 'coastal' ? 0.35 * n : 0.34 * n;
  // team arrangement: teammates adjacent
  for (let i = 0; i < np; i++) {
    const a = a0 + (i / np) * Math.PI * 2;
    starts.push({ x: Math.round(n / 2 + Math.cos(a) * rad), y: Math.round(n / 2 + Math.sin(a) * rad) });
  }
  const water = new Uint8Array(n * n);
  const dStart = (x, y) => { let m = 1e9; for (const s of starts) m = Math.min(m, Math.hypot(x - s.x, y - s.y)); return m; };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x, nz = noise(x / 14, y / 14, 3), dc = Math.hypot(x - n / 2, y - n / 2);
    let w = false;
    if (type === 'land') {
      w = nz > 0.74 && dStart(x, y) > 14;
    } else if (type === 'coastal') {
      // central sea with bays; players on ring
      w = dc < n * 0.2 + (nz - 0.5) * n * 0.22 || (noise2(x / 9, y / 9) > 0.78 && dStart(x, y) > 13);
      // inlet channel to edge to make it a coastline
      if (Math.abs((x - n / 2) * Math.cos(a0 + Math.PI / np) + (y - n / 2) * Math.sin(a0 + Math.PI / np)) < 0 ) w = true;
    } else if (type === 'islands') {
      const d = dStart(x, y);
      const isl = d < n * 0.17 + (nz - 0.5) * 10;
      const small = noise2(x / 7, y / 7) > 0.72 && d > n * 0.22 && dc > 8;
      w = !(isl || small);
      if (x < 2 || y < 2 || x > n - 3 || y > n - 3) w = true;
    }
    if (dStart(x, y) < 9) w = false;
    water[i] = w ? 1 : 0;
  }
  // coastal: guarantee each player has water within ~14 tiles by carving small bay toward sea
  // distance to land / water
  const dW = bfsDist(n, i => water[i]), dL = bfsDist(n, i => !water[i]);
  for (let i = 0; i < n * n; i++) {
    if (water[i]) ter[i] = dL[i] > 3 ? T.DEEP : T.WATER;
    else if (dW[i] <= 1) ter[i] = T.SAND;
    else { const v = noise3(i % n / 6, (i / n | 0) / 6, 2); ter[i] = v > 0.66 ? T.DIRT : v < 0.3 ? T.FOREST : T.GRASS; }
  }
  // elevation: hills
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x; if (water[i]) continue;
    const hv = noise2(x / 18 + 100, y / 18 + 50, 3);
    let e = hv > 0.68 ? 3 : hv > 0.6 ? 2 : hv > 0.52 ? 1 : 0;
    if (dW[i] <= 2) e = Math.min(e, dW[i] - 1 < 0 ? 0 : dW[i] - 1);
    elev[i] = e;
  }
  // flatten starts
  for (const s of starts) {
    const e0 = elev[s.y * n + s.x];
    for (let y = s.y - 8; y <= s.y + 8; y++) for (let x = s.x - 8; x <= s.x + 8; x++) if (x >= 0 && y >= 0 && x < n && y < n && Math.hypot(x - s.x, y - s.y) < 8) elev[y * n + x] = e0;
  }
  smoothElev(n, elev, water);
  // cliff mesas on land maps (a few, away from starts)
  if (type !== 'islands') {
    const count = type === 'land' ? 4 : 2;
    for (let k = 0; k < count; k++) {
      for (let tries = 0; tries < 30; tries++) {
        const cx = 8 + (rng() * (n - 16)) | 0, cy = 8 + (rng() * (n - 16)) | 0, r = 3 + rng() * 3;
        if (dStart(cx, cy) < 16 || dW[cy * n + cx] < r + 3) continue;
        const rampA = rng() * Math.PI * 2;
        for (let y = cy - 7; y <= cy + 7; y++) for (let x = cx - 7; x <= cx + 7; x++) {
          if (x < 0 || y < 0 || x >= n || y >= n) continue;
          const d = Math.hypot(x - cx, y - cy); if (d > r) continue;
          elev[y * n + x] = Math.min(4, elev[y * n + x] + 2);
        }
        // ramp
        for (let t = r - 1; t <= r + 2; t += 0.5) {
          const x = Math.round(cx + Math.cos(rampA) * t), y = Math.round(cy + Math.sin(rampA) * t);
          for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]]) if (x + ox >= 0 && y + oy >= 0 && x + ox < n && y + oy < n) {
            const j = (y + oy) * n + x + ox; elev[j] = Math.max(0, Math.round(elev[cy * n + cx] - 1 - (t - r + 1) * 0.5));
          }
        }
        break;
      }
    }
  }
  const objects = [];
  const occ = new Uint8Array(n * n);
  const land = (x, y) => x >= 1 && y >= 1 && x < n - 1 && y < n - 1 && !water[y * n + x];
  const free = (x, y) => land(x, y) && !occ[y * n + x];
  const put = (o, w = 1) => { objects.push(o); for (let yy = o.y; yy < o.y + w; yy++) for (let xx = o.x; xx < o.x + w; xx++) occ[yy * n + xx] = 1; };
  // reserve TC areas
  for (const s of starts) for (let y = s.y - 5; y <= s.y + 5; y++) for (let x = s.x - 5; x <= s.x + 5; x++) if (x >= 0 && y >= 0 && x < n && y < n) occ[y * n + x] = 2;
  const clusterAt = (cx, cy, count, mk, spread = 1.3) => {
    const placed = []; const q = [[cx, cy]]; let guard = 0;
    while (placed.length < count && guard++ < 200) {
      const [bx, by] = q.length ? q[(rng() * q.length) | 0] : [cx, cy];
      const x = bx + ((rng() * 3) | 0) - 1, y = by + ((rng() * 3) | 0) - 1;
      if (!free(x, y) || Math.hypot(x - cx, y - cy) > count * spread) continue;
      put(mk(x, y)); placed.push([x, y]); q.push([x, y]);
    }
    return placed.length;
  };
  const findSpot = (s, dmin, dmax, check) => {
    for (let t = 0; t < 200; t++) {
      const a = rng() * Math.PI * 2, d = dmin + rng() * (dmax - dmin);
      const x = Math.round(s.x + Math.cos(a) * d), y = Math.round(s.y + Math.sin(a) * d);
      if (check(x, y)) return { x, y };
    }
    return null;
  };
  const areaFree = (x, y, r) => { for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) if (!free(xx, yy)) return false; return true; };
  // Forests (global)
  for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
    const i = y * n + x; if (water[i] || occ[i]) continue;
    const fz = noise3(x / 10 + 30, y / 10 + 70, 3);
    const nearStart = dStart(x, y);
    if (nearStart < 11) continue;
    if (fz > 0.62 || (fz > 0.58 && rng() < 0.35) || rng() < 0.012) {
      put({ k: 'tree', x, y, v: ter[i] === T.SAND ? 2 : (noise(x / 5, y / 5) > 0.5 ? 1 : 0) });
      if (ter[i] === T.GRASS) ter[i] = T.FOREST;
    }
  }
  const players = [];
  starts.forEach((s, pi) => {
    // TC
    for (let y = s.y - 5; y <= s.y + 5; y++) for (let x = s.x - 5; x <= s.x + 5; x++) if (x >= 0 && y >= 0 && x < n && y < n && occ[y * n + x] === 2) occ[y * n + x] = 0;
    for (let y = s.y - 2; y <= s.y + 2; y++) for (let x = s.x - 2; x <= s.x + 2; x++) if (x >= 0 && y >= 0 && x < n && y < n && ter[y * n + x] !== T.SAND) ter[y * n + x] = T.DIRT;
    const owner = pi + 1;
    put({ k: 'bld', t: 'tc', x: s.x - 2, y: s.y - 2, o: owner }, 4);
    for (let v = 0; v < 3; v++) objects.push({ k: 'unit', t: 'villager', x: s.x - 1 + v, y: s.y + 3, o: owner });
    objects.push({ k: 'unit', t: 'scout', x: s.x + 3, y: s.y + 1, o: owner });
    // sheep: 4 near, 4 further (neutral, found by scouting)
    for (let k = 0; k < 4; k++) { const p = findSpot(s, 4, 6, (x, y) => free(x, y)); if (p) objects.push({ k: 'unit', t: 'sheep', x: p.x, y: p.y, o: 0 }); }
    for (let k = 0; k < 2; k++) { const p = findSpot(s, 12, 16, (x, y) => areaFree(x, y, 1)); if (p) { objects.push({ k: 'unit', t: 'sheep', x: p.x, y: p.y, o: 0 }); objects.push({ k: 'unit', t: 'sheep', x: p.x + 1, y: p.y, o: 0 }); } }
    let p = findSpot(s, 6, 8, (x, y) => areaFree(x, y, 2)); if (p) clusterAt(p.x, p.y, 6, (x, y) => ({ k: 'berry', x, y }));
    p = findSpot(s, 7, 10, (x, y) => areaFree(x, y, 2)); if (p) clusterAt(p.x, p.y, 7, (x, y) => ({ k: 'gold', x, y }));
    p = findSpot(s, 13, 17, (x, y) => areaFree(x, y, 2)); if (p) clusterAt(p.x, p.y, 5, (x, y) => ({ k: 'gold', x, y }));
    p = findSpot(s, 8, 12, (x, y) => areaFree(x, y, 2)); if (p) clusterAt(p.x, p.y, 5, (x, y) => ({ k: 'stone', x, y }));
    for (let k = 0; k < 2; k++) { p = findSpot(s, 13, 18, (x, y) => areaFree(x, y, 1)); if (p) objects.push({ k: 'unit', t: 'boar', x: p.x, y: p.y, o: 0 }); }
    p = findSpot(s, 14, 20, (x, y) => areaFree(x, y, 2)); if (p) for (let k = 0; k < 4; k++) objects.push({ k: 'unit', t: 'deer', x: p.x + (k % 2), y: p.y + (k >> 1), o: 0 });
    // Home forests
    for (let k = 0; k < 2; k++) { p = findSpot(s, 9, 13, (x, y) => areaFree(x, y, 1)); if (p) clusterAt(p.x, p.y, 14, (x, y) => { if (ter[y * n + x] === T.GRASS) ter[y * n + x] = T.FOREST; return { k: 'tree', x, y, v: (rng() * 2) | 0 }; }, 0.45); }
    // stragglers
    for (let k = 0; k < 3; k++) { p = findSpot(s, 5, 7, (x, y) => areaFree(x, y, 1)); if (p) put({ k: 'tree', x: p.x, y: p.y, v: 0 }); }
    // shore fish near base
    let fishPlaced = 0;
    for (let t = 0; t < 400 && fishPlaced < 4; t++) {
      const a = rng() * Math.PI * 2, d = 8 + rng() * 14;
      const x = Math.round(s.x + Math.cos(a) * d), y = Math.round(s.y + Math.sin(a) * d);
      if (x < 1 || y < 1 || x >= n - 1 || y >= n - 1) continue;
      const i = y * n + x; if (!water[i] || occ[i] || dL[i] > 3) continue;
      put({ k: 'fish', x, y }); fishPlaced++;
    }
    players.push({ start: { x: s.x, y: s.y } });
  });
  // deep fish
  let df = 0;
  for (let t = 0; t < 4000 && df < n / 5; t++) {
    const x = (rng() * n) | 0, y = (rng() * n) | 0, i = y * n + x;
    if (!water[i] || occ[i] || dL[i] < 3) continue;
    put({ k: 'fish', x, y, v: 1 }); df++;
  }
  // wolves, relics, extra gold/stone, extra deer
  const nWolves = Math.round(n / 30) + 1;
  for (let t = 0, c = 0; t < 500 && c < nWolves; t++) { const x = (rng() * n) | 0, y = (rng() * n) | 0; if (free(x, y) && dStart(x, y) > 20) { objects.push({ k: 'unit', t: 'wolf', x, y, o: 0 }); c++; } }
  for (let t = 0, c = 0; t < 800 && c < 5; t++) { const x = (rng() * n) | 0, y = (rng() * n) | 0; if (areaFree(x, y, 1) && dStart(x, y) > 16) { put({ k: 'relic', x, y }); c++; } }
  for (let t = 0, c = 0; t < 800 && c < np + 2; t++) { const x = (rng() * n) | 0, y = (rng() * n) | 0; if (areaFree(x, y, 2) && dStart(x, y) > 20) { clusterAt(x, y, 5, (x, y) => ({ k: c % 2 ? 'stone' : 'gold', x, y })); c++; } }
  for (let t = 0, c = 0; t < 800 && c < np * 2; t++) { const x = (rng() * n) | 0, y = (rng() * n) | 0; if (areaFree(x, y, 1) && dStart(x, y) > 18) { for (let k = 0; k < 3; k++) objects.push({ k: 'unit', t: 'deer', x: x + k % 2, y: y + (k >> 1), o: 0 }); c++; } }
  // shrubs (decor)
  for (let t = 0; t < n * 3; t++) { const x = (rng() * n) | 0, y = (rng() * n) | 0; if (free(x, y) && dStart(x, y) > 5) { objects.push({ k: 'shrub', x, y }); occ[y * n + x] = 1; } }
  const spec = { name: 'Generated', n, ter: Array.from(ter), elev: Array.from(elev), objects, players };
  ensureConnectivity(spec, type !== 'islands');
  return spec;
}
function bfsDist(n, isSrc) {
  const d = new Int32Array(n * n).fill(1e6); const q = [];
  for (let i = 0; i < n * n; i++) if (isSrc(i)) { d[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) {
    const c = q[h], x = c % n, y = (c / n) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue; const j = ny * n + nx; if (d[j] > d[c] + 1) { d[j] = d[c] + 1; q.push(j); } }
  }
  return d;
}
function smoothElev(n, elev, water) {
  for (let it = 0; it < 6; it++) {
    let changed = false;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = y * n + x;
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
        const j = ny * n + nx;
        if (elev[i] - elev[j] >= 2) { elev[i] = elev[j] + 1; changed = true; }
      }
    }
    if (!changed) break;
  }
}
// Makes sure all starts (same landmass expected) can reach each other: carve through cliffs and trees.
function ensureConnectivity(spec, requireLand) {
  const n = spec.n;
  const blocked = new Uint8Array(n * n);
  for (const o of spec.objects) if (o.k === 'tree' || o.k === 'gold' || o.k === 'stone' || o.k === 'berry') blocked[o.y * n + o.x] = 1;
  const reach = (s) => {
    const seen = new Uint8Array(n * n); const q = [s.y * n + s.x]; seen[q[0]] = 1;
    for (let h = 0; h < q.length; h++) {
      const c = q[h], x = c % n, y = (c / n) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
        const j = ny * n + nx; if (seen[j] || isWaterT(spec.ter[j]) || blocked[j]) continue;
        if (Math.abs(spec.elev[c] - spec.elev[j]) >= 2) continue;
        seen[j] = 1; q.push(j);
      }
    }
    return seen;
  };
  const ps = spec.players;
  for (let k = 1; k < ps.length; k++) {
    let seen = reach(ps[0].start);
    const t = ps[k].start;
    if (seen[t.y * n + t.x]) continue;
    if (!requireLand) {
      // island map: only check if they share a landmass by water; nothing to carve
      continue;
    }
    // carve a corridor
    const a = ps[0].start, steps = Math.hypot(t.x - a.x, t.y - a.y) * 2;
    let prevE = spec.elev[a.y * n + a.x];
    for (let s = 0; s <= steps; s++) {
      const x = Math.round(a.x + (t.x - a.x) * s / steps), y = Math.round(a.y + (t.y - a.y) * s / steps);
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const xx = x + ox, yy = y + oy; if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
        const j = yy * n + xx;
        if (isWaterT(spec.ter[j])) spec.ter[j] = T.SHALLOW;
        if (blocked[j]) { blocked[j] = 0; spec.objects = spec.objects.filter(o => !(o.x === xx && o.y === yy && (o.k === 'tree' || o.k === 'gold' || o.k === 'stone' || o.k === 'berry'))); }
        if (Math.abs(spec.elev[j] - prevE) >= 2) spec.elev[j] = prevE + Math.sign(spec.elev[j] - prevE);
      }
      prevE = spec.elev[y * n + x];
    }
  }
}
function blankMapSpec(n) {
  const ter = new Array(n * n).fill(T.GRASS), elev = new Array(n * n).fill(0);
  return { name: 'Blank', n, ter, elev, objects: [], players: [{ start: null }, { start: null }] };
}
