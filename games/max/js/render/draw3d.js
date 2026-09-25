// Tiny 3D→isometric toolkit used to paint every sprite procedurally.
// Model space: x/y horizontal (1 tile = 45.25 model px), z up. Projection is 2:1 dimetric.

export const MPX = 45.254834; // model px per tile edge
export const SS = 2;          // sprite supersampling
const KX = 0.70710678, KY = 0.35355339, KZ = 0.8660254;

export function proj(x, y, z) { return [(x - y) * KX, (x + y) * KY - z * KZ]; }
export function projV(v) { return [(v[0] - v[1]) * KX, (v[0] + v[1]) * KY - v[2] * KZ]; }
export function depthOf(x, y, z) { return (x + y) * 0.6124 + z * 0.5; }

const LV = (() => { const v = [-0.6, 0.8, 1.6]; const l = Math.hypot(...v); return v.map((c) => c / l); })();
export const LIGHT = LV;
export function lambert(n) {
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  return Math.max(0, (n[0] * LV[0] + n[1] * LV[1] + n[2] * LV[2]) / l);
}
export const LIGHT2D = (() => {
  const s = projV(LV); const l = Math.hypot(s[0], s[1]); return [s[0] / l, s[1] / l];
})();
const CAM = [0.6124, 0.6124, 0.5];
export function facesCamera(n) { return n[0] * CAM[0] + n[1] * CAM[1] + n[2] * CAM[2] > 0.001; }

// ---------------------------------------------------------------- colours
const hexCache = new Map();
export function rgbOf(c) {
  let v = hexCache.get(c);
  if (v) return v;
  if (c[0] === '#') {
    const h = c.length === 4 ? c.slice(1).split('').map((x) => x + x).join('') : c.slice(1);
    v = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  } else {
    const m = c.match(/[\d.]+/g).map(Number);
    v = [m[0], m[1], m[2]];
  }
  hexCache.set(c, v);
  return v;
}
const cl = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
export function rgbStr(r, g, b, a = 1) { return a >= 1 ? `rgb(${cl(r)},${cl(g)},${cl(b)})` : `rgba(${cl(r)},${cl(g)},${cl(b)},${a})`; }
// f < 1 darkens, f > 1 lightens toward white
export function shade(c, f) {
  const [r, g, b] = rgbOf(c);
  if (f <= 1) return rgbStr(r * f, g * f, b * f);
  const t = Math.min(1, f - 1);
  return rgbStr(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t);
}
export function mix(a, b, t) {
  const A = rgbOf(a), B = rgbOf(b);
  return rgbStr(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
export function alpha(c, a) { const [r, g, b] = rgbOf(c); return rgbStr(r, g, b, a); }

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
}

// ---------------------------------------------------------------- vector helpers
export const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};

// Two-bone IK: root S, target T, bone lengths a/b, pole direction. Returns joint & end.
export function ik(S, T, a, b, pole) {
  let d = v3.sub(T, S);
  let L = v3.len(d);
  const dir = L > 1e-6 ? v3.mul(d, 1 / L) : [0, 0, -1];
  L = Math.max(Math.abs(a - b) + 0.01, Math.min(a + b - 0.01, L));
  const x = (a * a - b * b + L * L) / (2 * L);
  const h = Math.sqrt(Math.max(0, a * a - x * x));
  let pp = v3.sub(pole, v3.mul(dir, v3.dot(pole, dir)));
  pp = v3.norm(pp);
  const J = v3.add(v3.add(S, v3.mul(dir, x)), v3.mul(pp, h));
  const E = v3.add(S, v3.mul(dir, L));
  return { J, E };
}

// ---------------------------------------------------------------- primitive models (units, props)
export class Model {
  constructor(facing = 0) {
    this.c = Math.cos(facing); this.s = Math.sin(facing);
    this.items = [];
    this.fallA = 0; this.fallAxis = 'y'; this.ox = 0; this.oy = 0; this.oz = 0;
    this.pitch = 0;
  }
  // local → world
  T(p) {
    let x = p[0], y = p[1], z = p[2];
    if (this.pitch) { const c = Math.cos(this.pitch), s = Math.sin(this.pitch); const x2 = x * c - z * s; z = x * s + z * c; x = x2; }
    if (this.fallA) {
      const c = Math.cos(this.fallA), s = Math.sin(this.fallA);
      if (this.fallAxis === 'y') { const x2 = x * c - z * s; z = x * s + z * c; x = x2; }
      else { const y2 = y * c - z * s; z = y * s + z * c; y = y2; }
      if (z < 0.4) z = 0.4 + (z - 0.4) * 0.15;
    }
    x += this.ox; y += this.oy; z += this.oz;
    return [x * this.c - y * this.s, x * this.s + y * this.c, z];
  }
  sphere(p, r, color, o = {}) {
    const w = this.T(p);
    this.items.push({ k: 's', p: w, r, color, sq: o.sq || 1, d: depthOf(w[0], w[1], w[2]) + (o.bias || 0), flat: o.flat });
  }
  limb(a, b, r1, r2, color, o = {}) {
    const A = this.T(a), B = this.T(b);
    this.items.push({ k: 'l', a: A, b: B, r1, r2, color, d: depthOf((A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2) + (o.bias || 0), flat: o.flat });
  }
  line(a, b, w, color, o = {}) {
    const A = this.T(a), B = this.T(b);
    this.items.push({ k: 'n', a: A, b: B, w, color, d: depthOf((A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2) + (o.bias || 0) });
  }
  poly(pts, color, o = {}) {
    const W = pts.map((p) => this.T(p));
    let n = [0, 0, 1];
    if (W.length >= 3) n = v3.cross(v3.sub(W[1], W[0]), v3.sub(W[2], W[0]));
    let cx = 0, cy = 0, cz = 0;
    for (const q of W) { cx += q[0]; cy += q[1]; cz += q[2]; }
    const k = W.length;
    this.items.push({ k: 'p', pts: W, color, n, d: depthOf(cx / k, cy / k, cz / k) + (o.bias || 0), stroke: o.stroke, noShade: o.noShade, twoSided: o.twoSided !== false, alpha: o.alpha });
  }
  // A disc (shield, wheel) centred at p with normal n (local) and radius r.
  disc(p, n, r, color, o = {}) {
    const nn = v3.norm(n);
    let a = Math.abs(nn[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const u = v3.norm(v3.cross(nn, a)), w = v3.cross(nn, u);
    const seg = o.seg || 14, pts = [];
    for (let i = 0; i < seg; i++) {
      const t = (i / seg) * Math.PI * 2;
      pts.push(v3.add(p, v3.add(v3.mul(u, Math.cos(t) * r * (o.rx || 1)), v3.mul(w, Math.sin(t) * r * (o.ry || 1)))));
    }
    this.poly(pts, color, o);
  }
  // Oriented box from centre p with half extents (hx along local x, hy, hz).
  box(p, hx, hy, hz, color, o = {}) {
    const c = [
      [-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz],
      [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz],
    ].map((q) => {
      let [x, y, z] = q;
      if (o.rotZ) { const cs = Math.cos(o.rotZ), sn = Math.sin(o.rotZ); const x2 = x * cs - y * sn; y = x * sn + y * cs; x = x2; }
      if (o.rotY) { const cs = Math.cos(o.rotY), sn = Math.sin(o.rotY); const x2 = x * cs - z * sn; z = x * sn + z * cs; x = x2; }
      return [p[0] + x, p[1] + y, p[2] + z];
    });
    const faces = [[4, 5, 6, 7], [0, 3, 2, 1], [1, 2, 6, 5], [0, 4, 7, 3], [3, 7, 6, 2], [0, 1, 5, 4]];
    for (const f of faces) {
      const pts = f.map((i) => c[i]);
      const W = pts.map((q) => this.T(q));
      const n = v3.cross(v3.sub(W[1], W[0]), v3.sub(W[2], W[0]));
      if (!facesCamera(n)) continue;
      let cx = 0, cy = 0, cz = 0;
      for (const q of W) { cx += q[0]; cy += q[1]; cz += q[2]; }
      this.items.push({ k: 'p', pts: W, color, n, d: depthOf(cx / 4, cy / 4, cz / 4) + (o.bias || 0), twoSided: false, stroke: o.stroke });
    }
  }

  bounds() {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const acc = (p, r = 0) => {
      const [sx, sy] = proj(p[0], p[1], p[2]);
      if (sx - r < x0) x0 = sx - r; if (sx + r > x1) x1 = sx + r;
      if (sy - r < y0) y0 = sy - r; if (sy + r > y1) y1 = sy + r;
    };
    for (const it of this.items) {
      if (it.k === 's') acc(it.p, it.r);
      else if (it.k === 'l') { acc(it.a, it.r1); acc(it.b, it.r2); }
      else if (it.k === 'n') { acc(it.a, it.w); acc(it.b, it.w); }
      else for (const q of it.pts) acc(q, 0.5);
    }
    return { x0, y0, x1, y1 };
  }

  draw(ctx) {
    const items = this.items.slice().sort((a, b) => a.d - b.d);
    for (const it of items) {
      if (it.k === 's') drawSphere(ctx, it);
      else if (it.k === 'l') drawLimb(ctx, it);
      else if (it.k === 'n') {
        const [ax, ay] = proj(...it.a), [bx, by] = proj(...it.b);
        ctx.strokeStyle = it.color; ctx.lineWidth = it.w; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      } else drawPoly(ctx, it);
    }
  }
}

function drawSphere(ctx, it) {
  const [x, y] = proj(it.p[0], it.p[1], it.p[2]);
  const r = it.r;
  if (it.flat) { ctx.fillStyle = it.color; ctx.beginPath(); ctx.ellipse(x, y, r, r * it.sq, 0, 0, Math.PI * 2); ctx.fill(); return; }
  const g = ctx.createRadialGradient(x + LIGHT2D[0] * r * 0.45, y + LIGHT2D[1] * r * 0.45, r * 0.1, x, y, r * 1.05);
  g.addColorStop(0, shade(it.color, 1.28));
  g.addColorStop(0.45, it.color);
  g.addColorStop(1, shade(it.color, 0.55));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(x, y, r, r * it.sq, 0, 0, Math.PI * 2); ctx.fill();
}

export function capsulePath(ctx, ax, ay, ar, bx, by, br) {
  const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
  ctx.beginPath();
  if (d < 0.01) { ctx.arc(ax, ay, Math.max(ar, br), 0, Math.PI * 2); return [0, 1]; }
  const ux = dx / d, uy = dy / d, nx = -uy, ny = ux;
  const tn = Math.atan2(ny, nx);
  ctx.moveTo(ax + nx * ar, ay + ny * ar);
  ctx.lineTo(bx + nx * br, by + ny * br);
  ctx.arc(bx, by, br, tn, tn - Math.PI, true);
  ctx.lineTo(ax - nx * ar, ay - ny * ar);
  ctx.arc(ax, ay, ar, tn - Math.PI, tn - 2 * Math.PI, true);
  ctx.closePath();
  return [nx, ny];
}

function drawLimb(ctx, it) {
  const [ax, ay] = proj(it.a[0], it.a[1], it.a[2]);
  const [bx, by] = proj(it.b[0], it.b[1], it.b[2]);
  const [nx, ny] = capsulePath(ctx, ax, ay, it.r1, bx, by, it.r2);
  if (it.flat) { ctx.fillStyle = it.color; ctx.fill(); return; }
  const mx = (ax + bx) / 2, my = (ay + by) / 2, r = Math.max(it.r1, it.r2);
  const lit = nx * LIGHT2D[0] + ny * LIGHT2D[1] > 0 ? 1 : -1;
  const g = ctx.createLinearGradient(mx + nx * r * lit, my + ny * r * lit, mx - nx * r * lit, my - ny * r * lit);
  g.addColorStop(0, shade(it.color, 1.25));
  g.addColorStop(0.4, it.color);
  g.addColorStop(1, shade(it.color, 0.58));
  ctx.fillStyle = g;
  ctx.fill();
}

function drawPoly(ctx, it) {
  const pts = it.pts;
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = proj(pts[i][0], pts[i][1], pts[i][2]);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  let n = it.n;
  if (!facesCamera(n)) { if (!it.twoSided) return; n = [-n[0], -n[1], -n[2]]; }
  const f = it.noShade ? 1 : 0.55 + 0.6 * lambert(n);
  if (it.alpha !== undefined) ctx.globalAlpha = it.alpha;
  ctx.fillStyle = shade(it.color, f);
  ctx.fill();
  if (it.stroke) { ctx.strokeStyle = it.stroke; ctx.lineWidth = 0.6; ctx.stroke(); }
  ctx.globalAlpha = 1;
}

// Render a model to a supersampled canvas with a dark outline. Anchor = model origin.
export function renderModel(model, opts = {}) {
  const pad = opts.pad ?? 3, ss = opts.ss ?? SS;
  const b = model.bounds();
  if (!isFinite(b.x0)) return { canvas: makeCanvas(1, 1), ax: 0, ay: 0, w: 1, h: 1 };
  const w = (b.x1 - b.x0 + pad * 2) * ss, h = (b.y1 - b.y0 + pad * 2) * ss;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.scale(ss, ss);
  ctx.translate(-b.x0 + pad, -b.y0 + pad);
  model.draw(ctx);
  const out = opts.outline === false ? c : outline(c, opts.outlineColor || 'rgba(22,16,10,0.92)', opts.outlineWidth ?? 1.4 * ss / 2);
  return { canvas: out, ax: (-b.x0 + pad) * ss, ay: (-b.y0 + pad) * ss, w: out.width, h: out.height };
}

export function outline(src, color, r = 1.4) {
  const c = makeCanvas(src.width, src.height);
  const x = c.getContext('2d');
  const d = r * 0.7071;
  for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [d, d], [-d, d], [d, -d], [-d, -d]]) x.drawImage(src, dx, dy);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  x.globalCompositeOperation = 'source-over';
  x.drawImage(src, 0, 0);
  return c;
}

// Solid silhouette of a sprite (used for "seen through" outlines).
export function silhouette(src, color) {
  const c = makeCanvas(src.width, src.height);
  const x = c.getContext('2d');
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

// ---------------------------------------------------------------- face painter (buildings)
// Materials are {tex: canvas, scale: model px per texture px, color, team}.
export class Painter {
  constructor(ctx) {
    this.ctx = ctx;
    this.patterns = new Map();
    this.edge = 'rgba(30,20,12,0.35)';
  }
  pattern(mat) {
    let p = this.patterns.get(mat.tex);
    if (!p) { p = this.ctx.createPattern(mat.tex, 'repeat'); this.patterns.set(mat.tex, p); }
    return p;
  }
  path(pts) {
    const ctx = this.ctx;
    ctx.beginPath();
    pts.forEach((p, i) => { const [x, y] = proj(p[0], p[1], p[2]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.closePath();
  }
  // Paint a planar polygon. O,U,V give texture orientation (U along width, V "down" the face).
  face(pts, mat, o = {}) {
    const ctx = this.ctx;
    let n = o.normal || v3.cross(v3.sub(pts[1], pts[0]), v3.sub(pts[2], pts[0]));
    if (!o.force && !facesCamera(n)) return false;
    ctx.save();
    this.path(pts);
    ctx.clip();
    if (mat.tex) {
      const O = o.O || pts[0];
      const U = o.U || v3.norm(v3.sub(pts[1], pts[0]));
      const V = o.V || [0, 0, -1];
      const s = mat.scale || 0.5;
      const [ox, oy] = proj(O[0], O[1], O[2]);
      const [ux, uy] = projV(U), [vx, vy] = projV(V);
      ctx.save();
      ctx.transform(ux * s, uy * s, vx * s, vy * s, ox, oy);
      ctx.fillStyle = this.pattern(mat);
      ctx.fillRect(-4000, -4000, 8000, 8000);
      ctx.restore();
      if (mat.tint) { ctx.fillStyle = mat.tint; ctx.fill(); }
    } else {
      ctx.fillStyle = mat.color;
      ctx.fill();
    }
    const lit = o.flatLight ? 0.9 : 0.5 + 0.62 * lambert(n);
    if (lit < 1) { ctx.fillStyle = `rgba(20,14,30,${(1 - lit) * 0.95})`; ctx.fill(); }
    else if (lit > 1) { ctx.fillStyle = `rgba(255,248,225,${(lit - 1) * 0.6})`; ctx.fill(); }
    if (o.ao) {
      // ambient occlusion toward the bottom edge
      const [x0, y0] = proj(...o.ao[0]), [x1, y1] = proj(...o.ao[1]);
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, 'rgba(10,6,0,0.42)');
      g.addColorStop(1, 'rgba(10,6,0,0)');
      ctx.fillStyle = g;
      ctx.fill();
    }
    ctx.restore();
    if (o.edge !== false) {
      this.path(pts);
      ctx.strokeStyle = o.edgeColor || this.edge;
      ctx.lineWidth = o.edgeWidth || 0.7;
      ctx.stroke();
    }
    return true;
  }

  // Axis-aligned box: x,y,z min corner; w (x), d (y), h (z). Draws the 3 visible faces.
  box(x, y, z, w, d, h, wall, top, o = {}) {
    const X1 = x + w, Y1 = y + d, Z1 = z + h;
    const aoH = Math.min(h, 16);
    // +y face (front-left)
    this.face([[x, Y1, Z1], [X1, Y1, Z1], [X1, Y1, z], [x, Y1, z]], o.wallY || wall, { normal: [0, 1, 0], O: [x, Y1, Z1], U: [1, 0, 0], ao: o.noAO ? null : [[x, Y1, z], [x, Y1, z + aoH]] });
    // +x face (front-right)
    this.face([[X1, Y1, Z1], [X1, y, Z1], [X1, y, z], [X1, Y1, z]], o.wallX || wall, { normal: [1, 0, 0], O: [X1, Y1, Z1], U: [0, -1, 0], ao: o.noAO ? null : [[X1, y, z], [X1, y, z + aoH]] });
    if (top) this.face([[x, y, Z1], [X1, y, Z1], [X1, Y1, Z1], [x, Y1, Z1]], top, { normal: [0, 0, 1], O: [x, y, Z1], U: [1, 0, 0], V: [0, 1, 0] });
  }

  // Gable roof over [x,x+w]×[y,y+d] at height z, ridge height h, ridge along 'x' or 'y'.
  gable(x, y, z, w, d, h, axis, roof, gableMat, ov = 3) {
    const x0 = x - ov, y0 = y - ov, x1 = x + w + ov, y1 = y + d + ov;
    if (axis === 'x') {
      const ym = y + d / 2;
      const back = [[x0, y0, z], [x1, y0, z], [x1, ym, z + h], [x0, ym, z + h]];
      const front = [[x0, ym, z + h], [x1, ym, z + h], [x1, y1, z], [x0, y1, z]];
      const nB = v3.cross(v3.sub(back[1], back[0]), v3.sub(back[2], back[0]));
      if (facesCamera(nB)) this.face(back, roof, { O: back[3], U: [1, 0, 0], V: v3.norm(v3.sub(back[0], back[3])) });
      this.face([[x + w, y, z], [x + w, y + d, z], [x + w, ym, z + h]], gableMat, { normal: [1, 0, 0], O: [x + w, y + d, z + h], U: [0, -1, 0] });
      this.face(front, roof, { O: front[0], U: [1, 0, 0], V: v3.norm(v3.sub(front[3], front[0])) });
    } else {
      const xm = x + w / 2;
      const back = [[x0, y1, z], [x0, y0, z], [xm, y0, z + h], [xm, y1, z + h]];
      const front = [[xm, y1, z + h], [xm, y0, z + h], [x1, y0, z], [x1, y1, z]];
      const nB = v3.cross(v3.sub(back[1], back[0]), v3.sub(back[2], back[0]));
      if (facesCamera(nB)) this.face(back, roof, { O: back[3], U: [0, -1, 0], V: v3.norm(v3.sub(back[0], back[3])) });
      this.face([[x, y + d, z], [x + w, y + d, z], [xm, y + d, z + h]], gableMat, { normal: [0, 1, 0], O: [x, y + d, z + h], U: [1, 0, 0] });
      this.face(front, roof, { O: front[1], U: [0, 1, 0], V: v3.norm(v3.sub(front[2], front[1])) });
    }
  }

  // Hip roof (pyramid if square) over the rectangle.
  hip(x, y, z, w, d, h, roof, ov = 3) {
    const x0 = x - ov, y0 = y - ov, x1 = x + w + ov, y1 = y + d + ov;
    let r0, r1;
    if (w >= d) { const ym = y + d / 2, inset = Math.min(w / 2, d / 2 + ov); r0 = [x0 + inset, ym, z + h]; r1 = [x1 - inset, ym, z + h]; }
    else { const xm = x + w / 2, inset = Math.min(d / 2, w / 2 + ov); r0 = [xm, y0 + inset, z + h]; r1 = [xm, y1 - inset, z + h]; }
    const A = [x0, y0, z], B = [x1, y0, z], C = [x1, y1, z], D = [x0, y1, z];
    let faces;
    if (w >= d) faces = [[A, B, r1, r0], [B, C, r1], [C, D, r0, r1], [D, A, r0]];
    else faces = [[A, B, r0], [B, C, r1, r0], [C, D, r1], [D, A, r0, r1]];
    const withN = faces.map((f) => ({ f, n: v3.cross(v3.sub(f[1], f[0]), v3.sub(f[2], f[0])), dp: f.reduce((a, p) => a + depthOf(...p), 0) / f.length }));
    withN.sort((a, b) => a.dp - b.dp);
    for (const { f, n } of withN) {
      if (!facesCamera(n)) continue;
      const edge = v3.norm(v3.sub(f[1], f[0]));
      const mid = v3.lerp(f[0], f[1], 0.5);
      const apex = f.length === 4 ? v3.lerp(f[2], f[3], 0.5) : f[2];
      this.face(f, roof, { normal: n, O: apex, U: edge, V: v3.norm(v3.sub(mid, apex)) });
    }
  }

  cylinder(cx, cy, z, r, h, mat, o = {}) {
    const seg = o.seg || 16;
    const pts = [];
    for (let i = 0; i < seg; i++) { const a = (i / seg) * Math.PI * 2; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    const faces = [];
    for (let i = 0; i < seg; i++) {
      const a = pts[i], b = pts[(i + 1) % seg];
      const mx = (a[0] + b[0]) / 2 - cx, my = (a[1] + b[1]) / 2 - cy;
      const n = [mx, my, 0];
      if (!facesCamera(n)) continue;
      faces.push({ a, b, n, dp: depthOf(mx + cx, my + cy, z) });
    }
    faces.sort((p, q) => p.dp - q.dp);
    for (const f of faces) {
      const ang = Math.atan2(f.n[1], f.n[0]);
      this.face([[f.a[0], f.a[1], z + h], [f.b[0], f.b[1], z + h], [f.b[0], f.b[1], z], [f.a[0], f.a[1], z]], mat,
        { normal: f.n, O: [cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, z + h], U: v3.norm([f.b[0] - f.a[0], f.b[1] - f.a[1], 0]), edge: false, ao: o.noAO ? null : [[f.a[0], f.a[1], z], [f.a[0], f.a[1], z + Math.min(h, 14)]] });
    }
    if (o.top) this.face(pts.map((p) => [p[0], p[1], z + h]), o.top, { normal: [0, 0, 1], O: [cx, cy, z + h], U: [1, 0, 0], V: [0, 1, 0] });
    // silhouette edges
    const ctx = this.ctx;
    ctx.strokeStyle = this.edge; ctx.lineWidth = 0.7;
    const [lx0, ly0] = proj(cx - r * 0.7071, cy + r * 0.7071, z), [lx1, ly1] = proj(cx - r * 0.7071, cy + r * 0.7071, z + h);
    const [rx0, ry0] = proj(cx + r * 0.7071, cy - r * 0.7071, z), [rx1, ry1] = proj(cx + r * 0.7071, cy - r * 0.7071, z + h);
    ctx.beginPath(); ctx.moveTo(lx0, ly0); ctx.lineTo(lx1, ly1); ctx.moveTo(rx0, ry0); ctx.lineTo(rx1, ry1); ctx.stroke();
  }

  // Surface of revolution from a profile [[radius, z], ...] (bottom to top).
  revolve(cx, cy, prof, mat, o = {}) {
    const seg = o.seg || 16;
    const faces = [];
    for (let k = 0; k < prof.length - 1; k++) {
      const [r0, z0] = prof[k], [r1, z1] = prof[k + 1];
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
        const pts = [[cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0, z0], [cx + Math.cos(a1) * r0, cy + Math.sin(a1) * r0, z0],
          [cx + Math.cos(a1) * r1, cy + Math.sin(a1) * r1, z1], [cx + Math.cos(a0) * r1, cy + Math.sin(a0) * r1, z1]];
        if (r1 < 0.01) pts.pop();
        const n = v3.cross(v3.sub(pts[1], pts[0]), v3.sub(pts[pts.length - 1], pts[0]));
        if (!facesCamera(n)) continue;
        faces.push({ pts, n, dp: depthOf((pts[0][0] + pts[2][0]) / 2, (pts[0][1] + pts[2][1]) / 2, (z0 + z1) / 2) });
      }
    }
    faces.sort((p, q) => p.dp - q.dp);
    for (const f of faces) this.face(f.pts, mat, { normal: f.n, O: f.pts[f.pts.length - 1], U: v3.norm(v3.sub(f.pts[1], f.pts[0])), V: v3.norm(v3.sub(f.pts[0], f.pts[f.pts.length - 1])), edge: false });
  }

  cone(cx, cy, z, r, h, mat, o = {}) {
    const seg = o.seg || 16;
    const apex = [cx, cy, z + h];
    const faces = [];
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const A = [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, z], B = [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, z];
      const n = v3.cross(v3.sub(B, A), v3.sub(apex, A));
      if (!facesCamera(n)) continue;
      faces.push({ A, B, n, dp: depthOf((A[0] + B[0]) / 2, (A[1] + B[1]) / 2, z) });
    }
    faces.sort((p, q) => p.dp - q.dp);
    for (const f of faces) {
      const mid = v3.lerp(f.A, f.B, 0.5);
      this.face([f.A, f.B, apex], mat, { normal: f.n, O: apex, U: v3.norm(v3.sub(f.B, f.A)), V: v3.norm(v3.sub(mid, apex)), edge: false });
    }
  }

  // Merlons along the top edges of a box top at height z.
  crenels(x, y, z, w, d, mat, size = 4, h = 4, o = {}) {
    const items = [];
    const step = size * 2;
    for (let t = 0; t + size <= w + 0.01; t += step) { items.push([x + t, y, size, size]); items.push([x + t, y + d - size, size, size]); }
    for (let t = step; t + size <= d - size + 0.01; t += step) { items.push([x, y + t, size, size]); items.push([x + w - size, y + t, size, size]); }
    items.sort((a, b) => depthOf(a[0], a[1], 0) - depthOf(b[0], b[1], 0));
    for (const [ix, iy, iw, id] of items) this.box(ix, iy, z, iw, id, h, mat, o.top || mat, { noAO: true });
  }

  // Rectangle on a vertical face: face origin O (top-left), U (horizontal unit), V down; u/v in model px.
  rectOn(O, U, u0, v0, u1, v1, color, o = {}) {
    const V = [0, 0, -1];
    const P = (u, v) => v3.add(v3.add(O, v3.mul(U, u)), v3.mul(V, v));
    const pts = [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)];
    this.path(pts);
    this.ctx.fillStyle = color;
    this.ctx.fill();
    if (o.stroke) { this.ctx.strokeStyle = o.stroke; this.ctx.lineWidth = o.lw || 0.7; this.ctx.stroke(); }
  }
  // Arched opening (door/window) on a vertical face.
  archOn(O, U, u0, vTop, u1, vBot, color, o = {}) {
    const V = [0, 0, -1];
    const P = (u, v) => v3.add(v3.add(O, v3.mul(U, u)), v3.mul(V, v));
    const r = (u1 - u0) / 2, cu = (u0 + u1) / 2;
    const pts = [P(u0, vBot)];
    for (let i = 0; i <= 8; i++) { const a = Math.PI - (i / 8) * Math.PI; pts.push(P(cu + Math.cos(a) * r, vTop + r - Math.sin(a) * r)); }
    pts.push(P(u1, vBot));
    this.path(pts);
    this.ctx.fillStyle = color;
    this.ctx.fill();
    if (o.stroke) { this.ctx.strokeStyle = o.stroke; this.ctx.lineWidth = o.lw || 0.8; this.ctx.stroke(); }
  }
  // Flat polygon in 3D with solid color & lambert shading
  poly(pts, color, o = {}) {
    const n = o.normal || v3.cross(v3.sub(pts[1], pts[0]), v3.sub(pts[2], pts[0]));
    if (!o.twoSided && !facesCamera(n)) return;
    const nn = facesCamera(n) ? n : v3.mul(n, -1);
    const f = o.noShade ? 1 : 0.5 + 0.62 * lambert(nn);
    this.path(pts);
    this.ctx.fillStyle = shade(color, f);
    this.ctx.fill();
    if (o.stroke) { this.ctx.strokeStyle = o.stroke; this.ctx.lineWidth = o.lw || 0.6; this.ctx.stroke(); }
  }
  line(a, b, color, w = 1) {
    const ctx = this.ctx;
    const [x0, y0] = proj(...a), [x1, y1] = proj(...b);
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
}
