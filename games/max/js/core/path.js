// Grid pathfinding: A* with an octile heuristic, a node budget and path smoothing.

const SQ2 = Math.SQRT2;
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQ2], [1, -1, SQ2], [-1, 1, SQ2], [-1, -1, SQ2]];

export class PathFinder {
  constructor(map) {
    this.map = map;
    const N = map.n * map.n;
    this.g = new Float32Array(N);
    this.from = new Int32Array(N);
    this.seen = new Uint32Array(N);
    this.closed = new Uint32Array(N);
    this.gen = 0;
    this.heapN = new Int32Array(N * 4 + 16);
    this.heapF = new Float32Array(N * 4 + 16);
    this.size = 0;
    this.expanded = 0; // statistics (budgeting)
  }

  push(node, f) {
    let i = this.size++;
    const hn = this.heapN, hf = this.heapF;
    if (i >= hn.length) { this.size--; return; }
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hf[p] <= f) break;
      hn[i] = hn[p]; hf[i] = hf[p]; i = p;
    }
    hn[i] = node; hf[i] = f;
  }
  pop() {
    const hn = this.heapN, hf = this.heapF;
    const top = hn[0];
    const n = --this.size;
    if (n > 0) {
      const ln = hn[n], lf = hf[n];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && hf[c + 1] < hf[c]) c++;
        if (hf[c] >= lf) break;
        hn[i] = hn[c]; hf[i] = hf[c]; i = c;
      }
      hn[i] = ln; hf[i] = lf;
    }
    return top;
  }

  // Distance from tile centre to an inclusive tile rectangle (continuous metric).
  static rectDist(cx, cy, r) {
    const dx = Math.max(r.x0 - cx, 0, cx - (r.x1 + 1));
    const dy = Math.max(r.y0 - cy, 0, cy - (r.y1 + 1));
    return Math.hypot(dx, dy);
  }

  // Find a path from tile (sx,sy) to any tile whose centre lies within `range` of rect.
  // Returns { tiles: [idx...], complete } or null if start is invalid.
  find(sx, sy, rect, range, maxNodes = 6000, owner = -1) {
    const map = this.map, n = map.n, block = map.block;
    const canPass = owner >= 0 ? (i) => block[i] === 3 && map.ally(map.gate[i], owner) : null;
    if (sx < 0 || sy < 0 || sx >= n || sy >= n) return null;
    const gen = ++this.gen;
    if (gen >= 0xfffffff0) { this.seen.fill(0); this.closed.fill(0); this.gen = 1; }
    const G = this.gen;
    const start = sy * n + sx;
    const gx0 = rect.x0, gy0 = rect.y0, gx1 = rect.x1 + 1, gy1 = rect.y1 + 1;
    const h = (x, y) => {
      const cx = x + 0.5, cy = y + 0.5;
      const dx = Math.max(gx0 - cx, 0, cx - gx1), dy = Math.max(gy0 - cy, 0, cy - gy1);
      const d = dx > dy ? dx + (SQ2 - 1) * dy : dy + (SQ2 - 1) * dx;
      return Math.max(0, d - range);
    };
    const goalTest = (x, y) => {
      const cx = x + 0.5, cy = y + 0.5;
      const dx = Math.max(gx0 - cx, 0, cx - gx1), dy = Math.max(gy0 - cy, 0, cy - gy1);
      return dx * dx + dy * dy <= range * range + 1e-6;
    };
    this.size = 0;
    this.g[start] = 0; this.from[start] = -1; this.seen[start] = G;
    this.push(start, h(sx, sy));
    let best = start, bestH = h(sx, sy), found = -1, count = 0;
    while (this.size > 0) {
      const cur = this.pop();
      if (this.closed[cur] === G) continue;
      this.closed[cur] = G;
      const cx = cur % n, cy = (cur / n) | 0;
      if (goalTest(cx, cy)) { found = cur; break; }
      const hc = h(cx, cy);
      if (hc < bestH || (hc === bestH && this.g[cur] < this.g[best])) { bestH = hc; best = cur; }
      if (++count > maxNodes) break;
      const gc = this.g[cur];
      for (let k = 0; k < 8; k++) {
        const d = DIRS[k];
        const nx = cx + d[0], ny = cy + d[1];
        if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
        const ni = ny * n + nx;
        if (block[ni] !== 0 && !(canPass && canPass(ni))) continue;
        if (k >= 4) { // no corner cutting
          const a = cy * n + nx, b = ny * n + cx;
          if ((block[a] !== 0 && !(canPass && canPass(a))) || (block[b] !== 0 && !(canPass && canPass(b)))) continue;
        }
        if (this.closed[ni] === G) continue;
        const ng = gc + d[2];
        if (this.seen[ni] !== G || ng < this.g[ni]) {
          this.seen[ni] = G; this.g[ni] = ng; this.from[ni] = cur;
          this.push(ni, ng + h(nx, ny) * 1.02);
        }
      }
    }
    this.expanded += count;
    const end = found >= 0 ? found : best;
    const tiles = [];
    for (let c = end; c !== -1; c = this.from[c]) tiles.push(c);
    tiles.reverse();
    return { tiles, complete: found >= 0, cost: count };
  }

  // True if a unit can walk the straight segment keeping a little clearance.
  lineWalkable(x0, y0, x1, y1, clearance = 0.26, owner = -1) {
    const map = this.map;
    const W = owner >= 0 ? (x, y) => map.walkableFor(x, y, owner) : (x, y) => map.walkableF(x, y);
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
    if (len < 1e-6) return W(x1, y1);
    const steps = Math.ceil(len / 0.2);
    const nx = (-dy / len) * clearance, ny = (dx / len) * clearance;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, px = x0 + dx * t, py = y0 + dy * t;
      if (!W(px, py) || !W(px + nx, py + ny) || !W(px - nx, py - ny)) return false;
    }
    return true;
  }

  // Convert tile path to smoothed world-space waypoints starting from (x, y).
  smooth(x, y, tiles, owner = -1) {
    const n = this.map.n;
    const pts = tiles.map((c) => ({ x: (c % n) + 0.5, y: ((c / n) | 0) + 0.5 }));
    if (pts.length && Math.floor(x) === Math.floor(pts[0].x) && Math.floor(y) === Math.floor(pts[0].y)) pts.shift();
    const out = [];
    let cx = x, cy = y, i = 0;
    while (i < pts.length) {
      let j = i;
      while (j + 1 < pts.length && j - i < 14 && this.lineWalkable(cx, cy, pts[j + 1].x, pts[j + 1].y, 0.26, owner)) j++;
      out.push(pts[j]);
      cx = pts[j].x; cy = pts[j].y;
      i = j + 1;
    }
    return out;
  }
}
