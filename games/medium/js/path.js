// A* pathfinding on the tile grid (8-directional, no corner cutting) + path smoothing.

const SQ2 = Math.SQRT2;
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQ2], [1, -1, SQ2], [-1, 1, SQ2], [-1, -1, SQ2]];

export class PathFinder {
  constructor(N, passable) {
    this.N = N;
    this.passable = passable; // (x,y) => bool
    const n = N * N;
    this.g = new Float32Array(n);
    this.came = new Int32Array(n);
    this.open = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.gen = 1;
    this.heap = new Int32Array(n * 8);
    this.heapF = new Float32Array(n * 8);
    this.hsize = 0;
  }

  push(i, f) {
    let k = this.hsize++;
    const h = this.heap, hf = this.heapF;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (hf[p] <= f) break;
      h[k] = h[p]; hf[k] = hf[p]; k = p;
    }
    h[k] = i; hf[k] = f;
  }
  pop() {
    const h = this.heap, hf = this.heapF;
    const top = h[0];
    const last = h[--this.hsize], lf = hf[this.hsize];
    let k = 0;
    const n = this.hsize;
    while (true) {
      let c = 2 * k + 1;
      if (c >= n) break;
      if (c + 1 < n && hf[c + 1] < hf[c]) c++;
      if (hf[c] >= lf) break;
      h[k] = h[c]; hf[k] = hf[c]; k = c;
    }
    h[k] = last; hf[k] = lf;
    return top;
  }

  nearestPassable(x, y, maxR = 12) {
    x = Math.max(0, Math.min(this.N - 1, x)); y = Math.max(0, Math.min(this.N - 1, y));
    if (this.passable(x, y)) return [x, y];
    for (let r = 1; r <= maxR; r++) {
      let best = null, bd = 1e9;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = x + dx, ny = y + dy;
        if (this.passable(nx, ny)) {
          const d = dx * dx + dy * dy;
          if (d < bd) { bd = d; best = [nx, ny]; }
        }
      }
      if (best) return best;
    }
    return null;
  }

  // goal: {x,y} tile  OR  {rect:{x,y,w,h}, inside:boolean}
  // returns array of {x,y} tile centers (excluding start) or null
  find(sx, sy, goal, maxNodes = 7000) {
    const N = this.N;
    sx = Math.max(0, Math.min(N - 1, sx | 0)); sy = Math.max(0, Math.min(N - 1, sy | 0));
    let isGoal, heur;
    if (goal.rect) {
      const r = goal.rect;
      const inside = goal.inside;
      const x0 = inside ? r.x : r.x - 1, y0 = inside ? r.y : r.y - 1;
      const x1 = inside ? r.x + r.w - 1 : r.x + r.w, y1 = inside ? r.y + r.h - 1 : r.y + r.h;
      isGoal = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1 &&
        (inside || !(x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h));
      heur = (x, y) => {
        const dx = Math.max(x0 - x, 0, x - x1), dy = Math.max(y0 - y, 0, y - y1);
        return Math.max(dx, dy) + (SQ2 - 1) * Math.min(dx, dy);
      };
    } else {
      let gx = goal.x | 0, gy = goal.y | 0;
      if (!this.passable(gx, gy)) {
        const np = this.nearestPassable(gx, gy);
        if (!np) return null;
        [gx, gy] = np;
      }
      isGoal = (x, y) => x === gx && y === gy;
      heur = (x, y) => {
        const dx = Math.abs(x - gx), dy = Math.abs(y - gy);
        return Math.max(dx, dy) + (SQ2 - 1) * Math.min(dx, dy);
      };
    }
    if (isGoal(sx, sy)) return [];

    const gen = ++this.gen;
    const g = this.g, came = this.came, open = this.open, closed = this.closed;
    this.hsize = 0;
    const s = sy * N + sx;
    g[s] = 0; came[s] = -1; open[s] = gen;
    this.push(s, heur(sx, sy));
    let bestNode = s, bestH = heur(sx, sy);
    let found = -1, count = 0;
    while (this.hsize > 0) {
      const cur = this.pop();
      if (closed[cur] === gen) continue;
      closed[cur] = gen;
      const cx = cur % N, cy = (cur / N) | 0;
      if (isGoal(cx, cy)) { found = cur; break; }
      if (++count > maxNodes) break;
      const cg = g[cur];
      for (let d = 0; d < 8; d++) {
        const dx = DIRS[d][0], dy = DIRS[d][1];
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const ni = ny * N + nx;
        if (closed[ni] === gen) continue;
        if (!this.passable(nx, ny)) continue;
        if (dx && dy && (!this.passable(cx + dx, cy) || !this.passable(cx, cy + dy))) continue;
        const ng = cg + DIRS[d][2];
        if (open[ni] === gen && ng >= g[ni]) continue;
        open[ni] = gen; g[ni] = ng; came[ni] = cur;
        const h = heur(nx, ny);
        if (h < bestH) { bestH = h; bestNode = ni; }
        this.push(ni, ng + h * 1.001);
      }
    }
    const end = found >= 0 ? found : bestNode;
    if (end === s) return found >= 0 ? [] : null;
    const out = [];
    let c = end;
    while (c !== s && c !== -1) {
      out.push({ x: (c % N) + 0.5, y: ((c / N) | 0) + 0.5 });
      c = came[c];
    }
    out.reverse();
    out.partial = found < 0;
    return out;
  }

  lineClear(x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    const steps = Math.ceil(len / 0.2);
    const o = 0.28;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + dx * t, y = y0 + dy * t;
      if (!this.passable(Math.floor(x), Math.floor(y))) return false;
      if (!this.passable(Math.floor(x + o), Math.floor(y + o))) return false;
      if (!this.passable(Math.floor(x - o), Math.floor(y - o))) return false;
      if (!this.passable(Math.floor(x + o), Math.floor(y - o))) return false;
      if (!this.passable(Math.floor(x - o), Math.floor(y + o))) return false;
    }
    return true;
  }

  smooth(sx, sy, path) {
    if (path.length < 2) return path;
    const out = [];
    let cx = sx, cy = sy, i = 0;
    while (i < path.length) {
      let j = Math.min(path.length - 1, i + 16);
      while (j > i && !this.lineClear(cx, cy, path[j].x, path[j].y)) j--;
      out.push(path[j]);
      cx = path[j].x; cy = path[j].y;
      i = j + 1;
    }
    out.partial = path.partial;
    return out;
  }
}
