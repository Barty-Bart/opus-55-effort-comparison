'use strict';
// ---------- A* pathfinding on the tile grid ----------
const Path = {
  N: 0, g: null, came: null, stamp: null, closed: null, cur: 0, heap: null,
  init(N) {
    this.N = N;
    this.g = new Float32Array(N * N); this.came = new Int32Array(N * N);
    this.stamp = new Int32Array(N * N); this.closed = new Int32Array(N * N);
    this.cur = 0; this.heap = new MinHeap(N * N * 4);
  },
  // rect: {x0,y0,x1,y1}; reach: distance from tile centre to rect considered success
  find(sx, sy, rect, reach, maxNodes = 7000) {
    const N = this.N, g = this.g, came = this.came, stamp = this.stamp, closed = this.closed, heap = this.heap;
    const pass = G.map.pass;
    let si = clamp(Math.floor(sx), 0, N - 1), sj = clamp(Math.floor(sy), 0, N - 1);
    const start = sj * N + si;
    this.cur++; const cur = this.cur;
    heap.clear();
    g[start] = 0; stamp[start] = cur; came[start] = -1;
    const h = (i, j) => Math.max(0, distToRect(i + 0.5, j + 0.5, rect.x0, rect.y0, rect.x1, rect.y1) - reach);
    heap.push(start, h(si, sj));
    let best = start, bestH = h(si, sj), found = -1, expanded = 0;
    while (heap.n > 0) {
      const k = heap.pop();
      if (closed[k] === cur) continue;
      closed[k] = cur;
      const i = k % N, j = (k / N) | 0;
      const hk = h(i, j);
      if (hk <= 0) { found = k; break; }
      if (hk < bestH) { bestH = hk; best = k; }
      if (++expanded > maxNodes) break;
      const gk = g[k];
      for (let d = 0; d < 8; d++) {
        const di = DIRS8[d][0], dj = DIRS8[d][1];
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= N || b >= N) continue;
        const n = b * N + a;
        if (!pass[n]) continue;
        if (di && dj && (!pass[j * N + a] || !pass[b * N + i])) continue;
        const ng = gk + (di && dj ? 1.4142 : 1);
        if (stamp[n] === cur && ng >= g[n]) continue;
        stamp[n] = cur; g[n] = ng; came[n] = k;
        heap.push(n, ng + h(a, b) * 1.001);
      }
    }
    const end = found >= 0 ? found : best;
    if (end === start) return { pts: [], complete: found >= 0 };
    const tiles = [];
    for (let k = end; k !== -1 && k !== start; k = came[k]) tiles.push(k);
    tiles.reverse();
    let pts = tiles.map(k => [(k % N) + 0.5, ((k / N) | 0) + 0.5]);
    pts = this.smooth(sx, sy, pts);
    return { pts, complete: found >= 0 };
  },
  lineClear(x0, y0, x1, y1) {
    const N = this.N, pass = G.map.pass;
    const d = Math.hypot(x1 - x0, y1 - y0), steps = Math.ceil(d / 0.2);
    const nx = -(y1 - y0) / (d || 1) * 0.24, ny = (x1 - x0) / (d || 1) * 0.24;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      for (let o = -1; o <= 1; o++) {
        const i = Math.floor(x + nx * o), j = Math.floor(y + ny * o);
        if (i < 0 || j < 0 || i >= N || j >= N || !pass[j * N + i]) return false;
      }
    }
    return true;
  },
  smooth(sx, sy, pts) {
    if (pts.length < 2) return pts;
    const out = []; let cx = sx, cy = sy, i = 0;
    while (i < pts.length) {
      let far = i;
      for (let k = Math.min(pts.length - 1, i + 12); k > i; k--) {
        if (this.lineClear(cx, cy, pts[k][0], pts[k][1])) { far = k; break; }
      }
      out.push(pts[far]); cx = pts[far][0]; cy = pts[far][1]; i = far + 1;
    }
    return out;
  },
  // nearest passable tile to (x,y)
  nearestFree(x, y, maxR = 12) {
    const N = this.N, pass = G.map.pass;
    const ci = Math.floor(x), cj = Math.floor(y);
    for (let r = 0; r <= maxR; r++) {
      let best = null, bd = 1e9;
      for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue;
        if (i < 0 || j < 0 || i >= N || j >= N || !pass[j * N + i]) continue;
        const d = dist(i + 0.5, j + 0.5, x, y); if (d < bd) { bd = d; best = [i + 0.5, j + 0.5]; }
      }
      if (best) return best;
    }
    return null;
  },
};
const DIRS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
