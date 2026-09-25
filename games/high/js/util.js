'use strict';
// ---------- Core constants & helpers ----------
const HW = 32, HH = 16;            // half tile width / height in iso pixels
const GAME_SPEEDS = [
  { name: 'Slow', f: 1.0 }, { name: 'Normal', f: 1.7 }, { name: 'Fast', f: 2.6 }, { name: 'Very Fast', f: 4 },
];

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
let rng = mulberry32(12345);
function seedRng(s) { rng = mulberry32(s); }
const rnd = () => rng();
const rndi = (a, b) => a + Math.floor(rng() * (b - a + 1));
const rrange = (a, b) => a + rng() * (b - a);
const pick = arr => arr[Math.floor(rng() * arr.length)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const isoX = (x, y) => (x - y) * HW;
const isoY = (x, y) => (x + y) * HH;
function isoToWorld(px, py) { const a = px / HW, b = py / HH; return [(a + b) / 2, (b - a) / 2]; }

function distToRect(px, py, x0, y0, x1, y1) {
  const dx = px < x0 ? x0 - px : px > x1 ? px - x1 : 0;
  const dy = py < y0 ? y0 - py : py > y1 ? py - y1 : 0;
  return Math.sqrt(dx * dx + dy * dy);
}
function closestOnRect(px, py, x0, y0, x1, y1) { return [clamp(px, x0, x1), clamp(py, y0, y1)]; }

// Value noise (tileable, power-of-two size)
function makeNoise(seed, size = 256) {
  const r = mulberry32(seed), g = new Float32Array(size * size), m = size - 1;
  for (let i = 0; i < g.length; i++) g[i] = r();
  return function (x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    let xf = x - xi, yf = y - yi;
    xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf);
    const x0 = xi & m, y0 = yi & m, x1 = (x0 + 1) & m, y1 = (y0 + 1) & m;
    const a = g[y0 * size + x0], b = g[y0 * size + x1], c = g[y1 * size + x0], d = g[y1 * size + x1];
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}
function fbm(n, x, y, oct = 4) {
  let a = 0.5, f = 1, s = 0, t = 0;
  for (let i = 0; i < oct; i++) { s += a * n(x * f, y * f); t += a; a *= 0.5; f *= 2; }
  return s / t;
}

class MinHeap {
  constructor(cap) { this.idx = new Int32Array(cap); this.key = new Float32Array(cap); this.n = 0; }
  clear() { this.n = 0; }
  push(i, k) {
    if (this.n >= this.idx.length) { // grow
      const ni = new Int32Array(this.idx.length * 2), nk = new Float32Array(this.idx.length * 2);
      ni.set(this.idx); nk.set(this.key); this.idx = ni; this.key = nk;
    }
    let p = this.n++;
    while (p > 0) {
      const q = (p - 1) >> 1;
      if (this.key[q] <= k) break;
      this.idx[p] = this.idx[q]; this.key[p] = this.key[q]; p = q;
    }
    this.idx[p] = i; this.key[p] = k;
  }
  pop() {
    const top = this.idx[0];
    const n = --this.n; const li = this.idx[n], lk = this.key[n];
    let p = 0;
    for (;;) {
      let c = 2 * p + 1; if (c >= n) break;
      if (c + 1 < n && this.key[c + 1] < this.key[c]) c++;
      if (this.key[c] >= lk) break;
      this.idx[p] = this.idx[c]; this.key[p] = this.key[c]; p = c;
    }
    this.idx[p] = li; this.key[p] = lk;
    return top;
  }
}

function fmtTime(s) { s = Math.floor(s); const m = Math.floor(s / 60), ss = s % 60; return (m < 10 ? '0' : '') + m + ':' + (ss < 10 ? '0' : '') + ss; }
const _shadeCache = new Map();
function shade(col, f) { // f: -1..1 ; accepts #rrggbb or rgb(r,g,b)
  const key = col + f; const hit = _shadeCache.get(key); if (hit) return hit;
  let r, g, b;
  if (col[0] === '#') { const n = parseInt(col.slice(1), 16); r = n >> 16; g = (n >> 8) & 255; b = n & 255; }
  else { const m = col.match(/[\d.]+/g) || [0, 0, 0]; r = +m[0]; g = +m[1]; b = +m[2]; }
  if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  const out = 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  _shadeCache.set(key, out); return out;
}
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h); return c; }
