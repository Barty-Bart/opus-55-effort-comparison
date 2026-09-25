// Map representation and random map generation.
import { RNG, fbm } from './rng.js';

export const TER = { GRASS: 0, GRASS2: 1, DIRT: 2, SAND: 3, SHALLOW: 4, WATER: 5, FOREST: 6 };
export const TER_WALKABLE = [1, 1, 1, 1, 0, 0, 1];
export const TER_BUILDABLE = [1, 1, 1, 1, 0, 0, 1];
export const TER_NAMES = ['Grass', 'Dry Grass', 'Dirt', 'Sand', 'Shallows', 'Water', 'Forest Floor'];

export class GameMap {
  constructor(gen) {
    this.n = gen.n;
    this.terrain = gen.terrain;
    this.height = gen.height;
    const N = this.n * this.n;
    this.block = new Uint8Array(N);   // 0 free, 1 terrain (water), 2 static object
    this.occ = new Int32Array(N);     // id of static occupant (resource / building); 0 none
    for (let i = 0; i < N; i++) if (!TER_WALKABLE[this.terrain[i]]) this.block[i] = 1;
    this.gate = new Int16Array(N).fill(-1); // owner of a gate on this tile (block value 3)
    this.ally = (a, b) => a === b;
    this.version = 1;
  }
  // Tile passable for a unit of `owner` (gates let their owner & allies through).
  passFor(i, owner) {
    const b = this.block[i];
    return b === 0 || (b === 3 && owner >= 0 && this.ally(this.gate[i], owner));
  }
  walkableFor(x, y, owner) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.n || y >= this.n) return false;
    return this.passFor(y * this.n + x, owner);
  }
  inb(x, y) { return x >= 0 && y >= 0 && x < this.n && y < this.n; }
  idx(x, y) { return y * this.n + x; }
  walkable(x, y) { return x >= 0 && y >= 0 && x < this.n && y < this.n && this.block[y * this.n + x] === 0; }
  walkableF(x, y) { return this.walkable(Math.floor(x), Math.floor(y)); }
  isWater(x, y) { const t = this.terrain[y * this.n + x]; return t === TER.WATER || t === TER.SHALLOW; }
  setStatic(x, y, id, blocks, gateOwner = -1) {
    const i = y * this.n + x;
    this.occ[i] = id;
    if (gateOwner >= 0) { this.block[i] = 3; this.gate[i] = gateOwner; }
    else if (blocks) this.block[i] = 2;
    this.version++;
  }
  clearStatic(x, y) {
    const i = y * this.n + x;
    this.occ[i] = 0;
    this.gate[i] = -1;
    this.block[i] = TER_WALKABLE[this.terrain[i]] ? 0 : 1;
    this.version++;
  }
  // Nearest walkable tile to (x, y) by spiral search.
  nearestWalkable(x, y, maxR = 12) {
    x = Math.floor(x); y = Math.floor(y);
    if (this.walkable(x, y)) return { x, y };
    for (let r = 1; r <= maxR; r++) {
      let best = null, bd = 1e9;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (this.walkable(x + dx, y + dy)) { const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = { x: x + dx, y: y + dy }; } }
      }
      if (best) return best;
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------
const TAG = { FREE: 0, BASE: 1, WATER: 2, FOREST: 3, RES: 4, BUFFER: 5, TC: 6 };

export function generateMap({ size: n, players: P, seed, mapType = 'arabia' }) {
  const rng = new RNG(seed);
  const N = n * n;
  const terrain = new Uint8Array(N);
  const height = new Float32Array(N);
  const tag = new Uint8Array(N);
  const objects = [];
  const idx = (x, y) => y * n + x;
  const inb = (x, y) => x >= 0 && y >= 0 && x < n && y < n;
  const s = seed % 100000;

  // --- Base terrain & visual elevation --------------------------------------
  const dryBias = mapType === 'arabia' ? 0.05 : mapType === 'forest' ? -0.25 : -0.1;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const a = fbm(x / 20, y / 20, 4, s + 11);
    const b = fbm(x / 6.5, y / 6.5, 3, s + 23);
    let t = TER.GRASS;
    if (a + dryBias > 0.16) t = TER.GRASS2;
    if (b > 0.46 && a + dryBias > -0.05) t = TER.DIRT;
    terrain[idx(x, y)] = t;
    height[idx(x, y)] = fbm(x / 26, y / 26, 4, s + 37) * 1.3 + fbm(x / 9, y / 9, 2, s + 41) * 0.25;
  }

  // --- Player start positions ------------------------------------------------
  const starts = [];
  const a0 = rng.next() * Math.PI * 2;
  const rad = n * (P <= 2 ? 0.33 : 0.36);
  for (let p = 0; p < P; p++) {
    const a = a0 + (p * Math.PI * 2) / P + rng.range(-0.15, 0.15);
    let cx = n / 2 + Math.cos(a) * rad, cy = n / 2 + Math.sin(a) * rad;
    cx = Math.max(14, Math.min(n - 14, cx)); cy = Math.max(14, Math.min(n - 14, cy));
    starts.push({ cx: Math.round(cx), cy: Math.round(cy), x: Math.round(cx) - 2, y: Math.round(cy) - 2 });
  }
  const distToStart = (x, y) => {
    let m = 1e9;
    for (const st of starts) m = Math.min(m, Math.hypot(x + 0.5 - st.cx, y + 0.5 - st.cy));
    return m;
  };
  for (const st of starts) {
    for (let y = st.cy - 12; y <= st.cy + 12; y++) for (let x = st.cx - 12; x <= st.cx + 12; x++) {
      if (!inb(x, y)) continue;
      const d = Math.hypot(x + 0.5 - st.cx, y + 0.5 - st.cy);
      if (d < 10.5) tag[idx(x, y)] = TAG.BASE;
      // Dirt courtyard around the town center
      const nd = d + fbm(x / 3, y / 3, 2, s + 57) * 1.6;
      if (nd < 4.2) terrain[idx(x, y)] = TER.DIRT;
    }
    for (let y = st.y - 1; y < st.y + 5; y++) for (let x = st.x - 1; x < st.x + 5; x++) if (inb(x, y)) tag[idx(x, y)] = TAG.TC;
  }

  // --- Lakes -------------------------------------------------------------------
  const lakes = [];
  const addLake = (cx, cy, R) => {
    const r2 = Math.ceil(R * 1.9 + 3);
    for (let y = cy - r2; y <= cy + r2; y++) for (let x = cx - r2; x <= cx + r2; x++) {
      if (!inb(x, y)) continue;
      const i = idx(x, y);
      if (tag[i] === TAG.BASE || tag[i] === TAG.TC) continue;
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / R + fbm(x / 5, y / 5, 3, s + 71) * 0.45;
      if (d < 0.78) { terrain[i] = TER.WATER; tag[i] = TAG.WATER; }
      else if (d < 1.0) { terrain[i] = TER.SHALLOW; tag[i] = TAG.WATER; }
      else if (d < 1.3 && terrain[i] !== TER.WATER && terrain[i] !== TER.SHALLOW) { terrain[i] = TER.SAND; if (tag[i] === TAG.FREE) tag[i] = TAG.BUFFER; }
      height[i] = Math.min(height[i], (d - 1) * 0.6 - 0.2);
    }
    lakes.push({ cx, cy, R });
  };
  const lakeSpecs = mapType === 'lakes'
    ? [{ R: n * 0.1, central: true }, { R: rng.range(4, 6.5) }, { R: rng.range(4, 6.5) }, { R: rng.range(3.5, 5.5) }, { R: rng.range(3.5, 5) }]
    : mapType === 'forest' ? [{ R: rng.range(3, 4.5) }] : [{ R: rng.range(3, 4.5) }, ...(rng.chance(0.6) ? [{ R: rng.range(2.5, 4) }] : [])];
  for (const spec of lakeSpecs) {
    for (let tries = 0; tries < 200; tries++) {
      let cx, cy;
      if (spec.central) { cx = Math.round(n / 2 + rng.range(-3, 3)); cy = Math.round(n / 2 + rng.range(-3, 3)); }
      else { cx = rng.int(8, n - 9); cy = rng.int(8, n - 9); }
      if (distToStart(cx, cy) < spec.R + 17) continue;
      if (lakes.some((l) => Math.hypot(l.cx - cx, l.cy - cy) < l.R + spec.R + 8)) continue;
      addLake(cx, cy, spec.R);
      break;
    }
  }

  // --- Helpers for resource placement ------------------------------------------
  const tileFree = (x, y) => inb(x, y) && tag[idx(x, y)] <= TAG.BASE && terrain[idx(x, y)] !== TER.WATER && terrain[idx(x, y)] !== TER.SHALLOW;
  const areaFree = (x, y, r) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (!inb(x + dx, y + dy)) return false;
      const t = tag[idx(x + dx, y + dy)];
      if (t !== TAG.FREE && t !== TAG.BASE) return false;
    }
    return true;
  };
  const markBuffer = (x, y, r) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (!inb(x + dx, y + dy)) continue;
      const i = idx(x + dx, y + dy);
      if (tag[i] === TAG.FREE || tag[i] === TAG.BASE) tag[i] = TAG.BUFFER;
    }
  };
  // Grow a compact blob of `count` tiles; returns tile list or null.
  const growBlob = (sx, sy, count) => {
    if (!tileFree(sx, sy)) return null;
    const cells = [[sx, sy]], seen = new Set([sx + sy * n]);
    const frontier = [];
    const pushN = (x, y) => {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = nx + ny * n;
        if (!seen.has(k) && tileFree(nx, ny)) { seen.add(k); frontier.push([nx, ny]); }
      }
    };
    pushN(sx, sy);
    while (cells.length < count && frontier.length) {
      // prefer cells close to the seed for compactness
      let bi = 0, bd = 1e9;
      for (let i = 0; i < frontier.length; i++) {
        const d = Math.hypot(frontier[i][0] - sx, frontier[i][1] - sy) + rng.next() * 1.2;
        if (d < bd) { bd = d; bi = i; }
      }
      const c = frontier.splice(bi, 1)[0];
      cells.push(c); pushN(c[0], c[1]);
    }
    return cells.length >= count ? cells : null;
  };
  const placeCluster = (cx, cy, dmin, dmax, count, type, opts = {}) => {
    for (let tries = 0; tries < 400; tries++) {
      const a = rng.next() * Math.PI * 2, d = rng.range(dmin, dmax);
      const x = Math.round(cx + Math.cos(a) * d), y = Math.round(cy + Math.sin(a) * d);
      if (!inb(x, y) || x < 2 || y < 2 || x > n - 3 || y > n - 3) continue;
      if (!areaFree(x, y, 1)) continue;
      if (opts.avoidStarts && distToStart(x, y) < opts.avoidStarts) continue;
      const cells = growBlob(x, y, count);
      if (!cells) continue;
      for (const [tx, ty] of cells) {
        tag[idx(tx, ty)] = TAG.RES;
        objects.push({ kind: 'resource', type, x: tx, y: ty });
      }
      for (const [tx, ty] of cells) markBuffer(tx, ty, opts.buffer ?? 1);
      if (type === 'gold' || type === 'stone') {
        for (const [tx, ty] of cells) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const xx = tx + dx, yy = ty + dy;
          if (!inb(xx, yy)) continue;
          const i = idx(xx, yy);
          if (terrain[i] === TER.WATER || terrain[i] === TER.SHALLOW || terrain[i] === TER.SAND) continue;
          if (Math.hypot(dx, dy) + fbm(xx / 2.5, yy / 2.5, 2, s + 91) * 1.2 < 1.9) terrain[i] = TER.DIRT;
        }
      }
      return cells;
    }
    return null;
  };
  const placeAnimals = (cx, cy, dmin, dmax, count, type, owner, spacing = 1.2, opts = {}) => {
    for (let tries = 0; tries < 300; tries++) {
      const a = rng.next() * Math.PI * 2, d = rng.range(dmin, dmax);
      const x = Math.round(cx + Math.cos(a) * d), y = Math.round(cy + Math.sin(a) * d);
      if (!inb(x, y) || !areaFree(x, y, 1)) continue;
      if (opts.avoidStarts && distToStart(x, y) < opts.avoidStarts) continue;
      const placed = [];
      for (let k = 0; k < count; k++) {
        for (let t2 = 0; t2 < 30; t2++) {
          const ax = x + rng.range(-spacing, spacing) * (1 + k * 0.3), ay = y + rng.range(-spacing, spacing) * (1 + k * 0.3);
          const tx = Math.floor(ax), ty = Math.floor(ay);
          if (!tileFree(tx, ty)) continue;
          if (placed.some((p) => Math.hypot(p.x - ax, p.y - ay) < 0.7)) continue;
          placed.push({ x: ax, y: ay });
          break;
        }
      }
      if (placed.length < count) continue;
      for (const p of placed) {
        objects.push({ kind: 'animal', type, x: p.x + 0.5, y: p.y + 0.5, owner });
        markBuffer(Math.floor(p.x), Math.floor(p.y), 0);
      }
      return placed;
    }
    return null;
  };

  // --- Player resources ----------------------------------------------------------
  starts.forEach((st, p) => {
    const cx = st.cx, cy = st.cy;
    placeCluster(cx, cy, 7.5, 9.5, 7, 'gold');
    placeCluster(cx, cy, 7, 9, 6, 'berries');
    placeCluster(cx, cy, 8, 10.5, 5, 'stone');
    placeCluster(cx, cy, 13, 17, 4, 'gold');
    placeCluster(cx, cy, 16, 21, 4, 'gold');
    placeCluster(cx, cy, 14, 19, 4, 'stone');
    placeAnimals(cx, cy, 3.6, 5.2, 4, 'sheep', p, 1.3);
    placeAnimals(cx, cy, 11, 17, 2, 'sheep', -1, 1.0);
    placeAnimals(cx, cy, 12, 18, 2, 'sheep', -1, 1.0);
    placeAnimals(cx, cy, 14, 20, 4, 'deer', -1, 1.4);
    placeAnimals(cx, cy, 11, 16, 1, 'boar', -1, 0.5);
    placeAnimals(cx, cy, 13, 18, 1, 'boar', -1, 0.5);
  });

  // --- Forests ---------------------------------------------------------------------
  const forestOK = (x, y) => {
    if (!inb(x, y)) return false;
    const i = idx(x, y);
    if (tag[i] !== TAG.FREE) return false;
    if (terrain[i] === TER.WATER || terrain[i] === TER.SHALLOW || terrain[i] === TER.SAND) return false;
    return true;
  };
  const species = () => { const r = rng.next(); return r < 0.45 ? 'oak' : r < 0.8 ? 'pine' : 'mixed'; };
  const addForest = (cx, cy, R, sp) => {
    const r2 = Math.ceil(R * 1.6 + 2);
    let count = 0;
    for (let y = cy - r2; y <= cy + r2; y++) for (let x = cx - r2; x <= cx + r2; x++) {
      if (!forestOK(x, y)) continue;
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / R + fbm(x / 3.2, y / 3.2, 3, s + 131) * 0.55;
      if (d < 1) {
        const i = idx(x, y);
        tag[i] = TAG.FOREST; terrain[i] = TER.FOREST;
        objects.push({ kind: 'resource', type: 'tree', x, y, species: sp === 'mixed' ? (rng.chance(0.5) ? 'oak' : 'pine') : sp });
        count++;
      }
    }
    return count;
  };

  if (mapType === 'forest') {
    // Black Forest: the map is mostly forest with clearings and lanes.
    const clear = new Uint8Array(N);
    const carve = (x0, y0, x1, y1, w) => {
      const len = Math.hypot(x1 - x0, y1 - y0);
      for (let t = 0; t <= len; t += 0.5) {
        const px = x0 + ((x1 - x0) * t) / len, py = y0 + ((y1 - y0) * t) / len;
        const ww = w + fbm(px / 6, py / 6, 2, s + 171) * 2;
        for (let dy = -Math.ceil(ww); dy <= Math.ceil(ww); dy++) for (let dx = -Math.ceil(ww); dx <= Math.ceil(ww); dx++) {
          if (dx * dx + dy * dy > ww * ww) continue;
          const x = Math.round(px + dx), y = Math.round(py + dy);
          if (inb(x, y)) clear[idx(x, y)] = 1;
        }
      }
    };
    for (const st of starts) {
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const d = Math.hypot(x + 0.5 - st.cx, y + 0.5 - st.cy) + fbm(x / 5, y / 5, 2, s + 151) * 3;
        if (d < 19) clear[idx(x, y)] = 1;
      }
      carve(st.cx, st.cy, n / 2, n / 2, 3.2);
    }
    for (let k = 0; k < starts.length; k++) {
      const a = starts[k], b = starts[(k + 1) % starts.length];
      carve(a.cx, a.cy, b.cx, b.cy, 2.6);
    }
    for (let g = 0; g < 5; g++) {
      const gx = rng.int(10, n - 10), gy = rng.int(10, n - 10), R = rng.range(4, 7);
      for (let y = gy - 8; y <= gy + 8; y++) for (let x = gx - 8; x <= gx + 8; x++) if (inb(x, y) && Math.hypot(x - gx, y - gy) < R) clear[idx(x, y)] = 1;
    }
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = idx(x, y);
      if (clear[i] || !forestOK(x, y)) continue;
      tag[i] = TAG.FOREST; terrain[i] = TER.FOREST;
      const sp = fbm(x / 14, y / 14, 2, s + 191) > 0 ? 'pine' : 'oak';
      objects.push({ kind: 'resource', type: 'tree', x, y, species: sp });
    }
  } else {
    // Player wood lines
    for (const st of starts) {
      let placed = 0;
      for (let tries = 0; tries < 300 && placed < 2; tries++) {
        const a = rng.next() * Math.PI * 2, d = rng.range(12, 16);
        const x = Math.round(st.cx + Math.cos(a) * d), y = Math.round(st.cy + Math.sin(a) * d);
        if (!inb(x, y) || !forestOK(x, y)) continue;
        if (addForest(x, y, rng.range(3.2, 4.6), species()) > 18) placed++;
      }
    }
    const count = Math.round((n * n) / (mapType === 'lakes' ? 950 : 720));
    for (let k = 0, tries = 0; k < count && tries < 3000; tries++) {
      const x = rng.int(3, n - 4), y = rng.int(3, n - 4);
      if (distToStart(x, y) < 14 || !forestOK(x, y)) continue;
      addForest(x, y, rng.range(2.2, 5.2), species());
      k++;
    }
  }

  // --- Neutral resources (map center / contested areas) ---------------------------
  const neutralGold = Math.max(2, Math.round(n / 36));
  for (let k = 0; k < neutralGold; k++) placeCluster(n / 2, n / 2, 0, n * 0.3, rng.int(3, 5), 'gold', { avoidStarts: 24 });
  const neutralStone = Math.max(1, Math.round(n / 60));
  for (let k = 0; k < neutralStone; k++) placeCluster(n / 2, n / 2, 0, n * 0.32, rng.int(3, 4), 'stone', { avoidStarts: 24 });
  for (let k = 0; k < Math.round(n / 40); k++) placeAnimals(n / 2, n / 2, 0, n * 0.42, rng.int(3, 4), 'deer', -1, 1.4, { avoidStarts: 22 });
  for (let k = 0; k < Math.round(n / 50); k++) placeAnimals(n / 2, n / 2, 0, n * 0.4, 2, 'sheep', -1, 1.0, { avoidStarts: 22 });

  // --- Straggler trees near each town center ------------------------------------------
  for (const st of starts) {
    let placed = 0;
    for (let tries = 0; tries < 200 && placed < 4; tries++) {
      const a = rng.next() * Math.PI * 2, d = rng.range(4.2, 6.5);
      const x = Math.floor(st.cx + Math.cos(a) * d), y = Math.floor(st.cy + Math.sin(a) * d);
      if (!inb(x, y)) continue;
      const i = idx(x, y);
      if (tag[i] !== TAG.BASE && tag[i] !== TAG.FREE) continue;
      if (!areaFree(x, y, 1)) continue;
      tag[i] = TAG.RES; markBuffer(x, y, 1);
      objects.push({ kind: 'resource', type: 'tree', x, y, species: rng.chance(0.5) ? 'oak' : 'pine' });
      placed++;
    }
  }

  // --- Shore fish ---------------------------------------------------------------------
  for (const lake of lakes) {
    const cand = [];
    const r = Math.ceil(lake.R * 1.8 + 2);
    for (let y = lake.cy - r; y <= lake.cy + r; y++) for (let x = lake.cx - r; x <= lake.cx + r; x++) {
      if (!inb(x, y) || terrain[idx(x, y)] !== TER.SHALLOW) continue;
      let shore = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (inb(xx, yy) && TER_WALKABLE[terrain[idx(xx, yy)]] && tag[idx(xx, yy)] !== TAG.FOREST) shore = true;
      }
      if (shore) cand.push([x, y]);
    }
    rng.shuffle(cand);
    const want = Math.min(cand.length, Math.max(2, Math.round(lake.R * 0.9)));
    const chosen = [];
    for (const c of cand) {
      if (chosen.length >= want) break;
      if (chosen.some((o) => Math.abs(o[0] - c[0]) + Math.abs(o[1] - c[1]) < 3)) continue;
      chosen.push(c);
      objects.push({ kind: 'resource', type: 'fish', x: c[0], y: c[1] });
    }
  }

  // --- Connectivity: carve lanes through forests if a base is sealed off -------------------
  const blockedTile = new Uint8Array(N);
  for (let i = 0; i < N; i++) blockedTile[i] = TER_WALKABLE[terrain[i]] ? 0 : 1;
  const treeAt = new Map();
  objects.forEach((o, k) => { if (o.kind === 'resource') { blockedTile[idx(o.x, o.y)] = 1; if (o.type === 'tree') treeAt.set(idx(o.x, o.y), k); } });
  const flood = (sx, sy) => {
    const seen = new Uint8Array(N);
    const q = [idx(sx, sy)]; seen[q[0]] = 1;
    while (q.length) {
      const c = q.pop(); const x = c % n, y = (c / n) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (!inb(xx, yy)) continue;
        const j = idx(xx, yy);
        if (seen[j] || blockedTile[j]) continue;
        seen[j] = 1; q.push(j);
      }
    }
    return seen;
  };
  const removed = new Set();
  for (let pass = 0; pass < 3; pass++) {
    const seen = flood(starts[0].cx, starts[0].cy + 3);
    let ok = true;
    for (let p = 1; p < starts.length; p++) {
      if (seen[idx(starts[p].cx, starts[p].cy + 3)]) continue;
      ok = false;
      const a = starts[0], b = starts[p];
      const len = Math.hypot(b.cx - a.cx, b.cy - a.cy);
      for (let t = 0; t <= len; t += 0.5) {
        const px = Math.round(a.cx + ((b.cx - a.cx) * t) / len), py = Math.round(a.cy + ((b.cy - a.cy) * t) / len);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const j = idx(px + dx, py + dy);
          if (treeAt.has(j)) { removed.add(treeAt.get(j)); treeAt.delete(j); blockedTile[j] = 0; }
        }
      }
    }
    if (ok) break;
  }
  const finalObjects = removed.size ? objects.filter((_, k) => !removed.has(k)) : objects;

  // Smooth heights near town centers so bases look flat.
  for (const st of starts) {
    for (let y = st.cy - 7; y <= st.cy + 7; y++) for (let x = st.cx - 7; x <= st.cx + 7; x++) {
      if (!inb(x, y)) continue;
      const d = Math.hypot(x - st.cx, y - st.cy);
      const w = Math.max(0, 1 - d / 7);
      height[idx(x, y)] = height[idx(x, y)] * (1 - w) + height[idx(st.cx, st.cy)] * w;
    }
  }

  return { n, terrain, height, starts, objects: finalObjects, lakes };
}
