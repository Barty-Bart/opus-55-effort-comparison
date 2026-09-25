// Grid A* over the tile map with 8-way movement, plus line-of-sight path smoothing.
import { MinHeap, clamp } from './util.js';

const SQ2 = Math.SQRT2;
const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];

export class Pathfinder {
  constructor(map) {
    this.map = map;
    const n = map.N * map.N;
    this.g = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.opened = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.stamp = 0;
    this.heap = new MinHeap(4096);
    this.calls = 0;
  }

  // goal: inclusive tile rect {x0,y0,x1,y1}; with adj=true the goal is any free tile touching the rect.
  // Returns { tiles: [tileIndex...] (excluding start), reached }
  find(sx, sy, goal, maxNodes = 7000) {
    const map = this.map, N = map.N, blocked = map.blocked;
    const g = this.g, parent = this.parent, opened = this.opened, closed = this.closed, heap = this.heap;
    sx = clamp(sx | 0, 0, N - 1); sy = clamp(sy | 0, 0, N - 1);
    this.calls++;
    if (++this.stamp >= 0xfffffff0) { this.opened.fill(0); this.closed.fill(0); this.stamp = 1; }
    const st = this.stamp;
    const adj = !!goal.adj;
    const gx0 = goal.x0, gx1 = goal.x1, gy0 = goal.y0, gy1 = goal.y1;
    const ex0 = adj ? gx0 - 1 : gx0, ex1 = adj ? gx1 + 1 : gx1, ey0 = adj ? gy0 - 1 : gy0, ey1 = adj ? gy1 + 1 : gy1;
    const isGoal = (x, y) => x >= ex0 && x <= ex1 && y >= ey0 && y <= ey1 &&
      !(adj && x >= gx0 && x <= gx1 && y >= gy0 && y <= gy1);
    const h = (x, y) => {
      const dx = x < ex0 ? ex0 - x : x > ex1 ? x - ex1 : 0;
      const dy = y < ey0 ? ey0 - y : y > ey1 ? y - ey1 : 0;
      return dx > dy ? dx + 0.4142 * dy : dy + 0.4142 * dx;
    };
    const start = sy * N + sx;
    if (isGoal(sx, sy)) return { tiles: [], reached: true, expanded: 0 };
    heap.clear();
    g[start] = 0; parent[start] = -1; opened[start] = st;
    heap.push(start, h(sx, sy));
    let best = start, bestH = h(sx, sy), expanded = 0;
    while (heap.size) {
      const cur = heap.pop();
      if (closed[cur] === st) continue;
      closed[cur] = st;
      const cx = cur % N, cy = (cur / N) | 0;
      if (cur !== start && isGoal(cx, cy)) return { tiles: this.build(cur), reached: true, expanded };
      const hc = h(cx, cy);
      if (hc < bestH || (hc === bestH && g[cur] < g[best])) { best = cur; bestH = hc; }
      if (++expanded > maxNodes) break;
      const gc = g[cur];
      for (let d = 0; d < 8; d++) {
        const nx = cx + DX[d], ny = cy + DY[d];
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const nk = ny * N + nx;
        if (blocked[nk] !== 0 || closed[nk] === st) continue;
        if (d >= 4 && (blocked[cy * N + nx] !== 0 || blocked[ny * N + cx] !== 0)) continue;
        const ng = gc + (d >= 4 ? SQ2 : 1);
        if (opened[nk] !== st || ng < g[nk]) {
          opened[nk] = st; g[nk] = ng; parent[nk] = cur;
          heap.push(nk, ng + h(nx, ny) * 1.001);
        }
      }
    }
    return { tiles: best === start ? [] : this.build(best), reached: false, expanded };
  }

  build(k) {
    const out = [];
    while (k !== -1 && this.parent[k] !== -1) { out.push(k); k = this.parent[k]; }
    out.reverse();
    return out;
  }

  toPoints(tiles) {
    const N = this.map.N;
    return tiles.map((k) => ({ x: (k % N) + 0.5, y: ((k / N) | 0) + 0.5 }));
  }

  // Grid traversal of the segment; every touched tile must be passable. Start tile is ignored when skipStart.
  lineClear(x0, y0, x1, y1, skipStart = true) {
    const map = this.map;
    let tx = Math.floor(x0), ty = Math.floor(y0);
    const ex = Math.floor(x1), ey = Math.floor(y1);
    if (!skipStart && !map.passable(tx, ty)) return false;
    const dx = x1 - x0, dy = y1 - y0;
    const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    let tmx = dx !== 0 ? (dx > 0 ? tx + 1 - x0 : x0 - tx) * tdx : Infinity;
    let tmy = dy !== 0 ? (dy > 0 ? ty + 1 - y0 : y0 - ty) * tdy : Infinity;
    let n = Math.abs(ex - tx) + Math.abs(ey - ty);
    let guard = 0;
    while (n > 0 && guard++ < 1000) {
      if (Math.abs(tmx - tmy) < 1e-9) {
        if (!map.passable(tx + stepX, ty) || !map.passable(tx, ty + stepY)) return false;
        tx += stepX; ty += stepY; tmx += tdx; tmy += tdy; n -= 2;
      } else if (tmx < tmy) { tx += stepX; tmx += tdx; n--; }
      else { ty += stepY; tmy += tdy; n--; }
      if (!map.passable(tx, ty)) return false;
    }
    return true;
  }

  // A corridor check: center line plus two offset lines at +-r.
  wideClear(x0, y0, x1, y1, r = 0.2) {
    if (!this.lineClear(x0, y0, x1, y1, true)) return false;
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
    if (L < 1e-6) return true;
    const px = (-dy / L) * r, py = (dx / L) * r;
    return this.lineClear(x0 + px, y0 + py, x1 + px, y1 + py, false) &&
      this.lineClear(x0 - px, y0 - py, x1 - px, y1 - py, false);
  }

  smooth(sx, sy, pts, r = 0.2) {
    const out = [];
    let cx = sx, cy = sy, i = 0;
    while (i < pts.length) {
      let j = Math.min(pts.length - 1, i + 16);
      for (; j > i; j--) if (this.wideClear(cx, cy, pts[j].x, pts[j].y, r)) break;
      out.push(pts[j]);
      cx = pts[j].x; cy = pts[j].y;
      i = j + 1;
    }
    return out;
  }

  nearestFree(x, y, maxR = 12) {
    const map = this.map;
    const fx = Math.floor(x), fy = Math.floor(y);
    if (map.passable(fx, fy)) return { x: fx, y: fy };
    for (let r = 1; r <= maxR; r++) {
      let best = null, bd = 1e9;
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
        if (!map.passable(fx + i, fy + j)) continue;
        const d = i * i + j * j;
        if (d < bd) { bd = d; best = { x: fx + i, y: fy + j }; }
      }
      if (best) return best;
    }
    return null;
  }
}
