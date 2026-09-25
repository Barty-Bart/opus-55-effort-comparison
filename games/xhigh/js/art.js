// Procedural world art: buildings (per age style), construction stages, walls, farms,
// trees, mines, bushes and ground decorations. All pre-rendered once and cached.
import { shade, rgba, RNG, TAU } from './util.js';
import { BUILDINGS } from './config.js';
import { SS } from './artUnits.js';

const HW = 32, HH = 16; // half tile sizes

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------
const MAT = {
  planks: { color: '#8f6c45', tex: 'planks' },
  darkplanks: { color: '#6f5236', tex: 'planks' },
  logs: { color: '#7d5b3a', tex: 'logs' },
  plaster: { color: '#e4d9bd', tex: 'timber', beam: '#5a3d24' },
  stone: { color: '#b3aa95', tex: 'stone' },
  darkstone: { color: '#8f8b82', tex: 'stone' },
  whitestone: { color: '#d9d2c1', tex: 'stone' },
  plain: { color: '#b3aa95', tex: null },
};
const ROOF = {
  thatch: { color: '#c9a459', tex: 'thatch' },
  tile: { color: '#b8573b', tex: 'tile' },
  darktile: { color: '#8f4634', tex: 'tile' },
  slate: { color: '#5c6877', tex: 'slate' },
  shingle: { color: '#7d5b3b', tex: 'shingle' },
  gold: { color: '#d7ad3c', tex: 'slate' },
  canvas: { color: '#e8e0cc', tex: null },
};
function styleFor(age) {
  switch (age) {
    case 0: return { wall: MAT.planks, low: MAT.stone, roof: ROOF.thatch, stone: MAT.stone, trim: '#6b4a2c' };
    case 1: return { wall: MAT.plaster, low: MAT.stone, roof: ROOF.tile, stone: MAT.stone, trim: '#5a3d24' };
    case 2: return { wall: MAT.plaster, low: MAT.stone, roof: ROOF.darktile, stone: MAT.darkstone, trim: '#4a3220' };
    default: return { wall: MAT.whitestone, low: MAT.whitestone, roof: ROOF.slate, stone: MAT.whitestone, trim: '#c9a13c' };
  }
}

// ---------------------------------------------------------------------------
// Isometric painter
// ---------------------------------------------------------------------------
class Iso {
  constructor(ctx, ox, oy, seed = 1) {
    this.ctx = ctx; this.ox = ox; this.oy = oy;
    this.rng = new RNG(seed);
    this.meta = { flags: [], smoke: [], fire: [], sails: null, glow: [] };
  }
  r() { return this.rng.next(); }
  p(x, y, z = 0) { return [this.ox + (x - y) * HW, this.oy + (x + y) * HH - z]; }
  pathS(pts) {
    const c = this.ctx; c.beginPath();
    for (let i = 0; i < pts.length; i++) (i ? c.lineTo : c.moveTo).call(c, pts[i][0], pts[i][1]);
    c.closePath();
  }
  fillS(pts, fill, stroke, lw = 0.6) {
    this.pathS(pts);
    if (fill) { this.ctx.fillStyle = fill; this.ctx.fill(); }
    if (stroke) { this.ctx.strokeStyle = stroke; this.ctx.lineWidth = lw; this.ctx.stroke(); }
  }
  fill3(pts3, fill, stroke, lw) { this.fillS(pts3.map(([x, y, z]) => this.p(x, y, z)), fill, stroke, lw); }
  line3(a, b, w, color) {
    const [x0, y0] = this.p(...a), [x1, y1] = this.p(...b);
    const c = this.ctx; c.strokeStyle = color; c.lineWidth = w; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
  }
  faceSW(x0, x1, y, z0, z1) { return { kind: 'sw', a0: x0, a1: x1, z0, z1, pt: (u, z) => this.p(u, y, z) }; }
  faceSE(y0, y1, x, z0, z1) { return { kind: 'se', a0: y0, a1: y1, z0, z1, pt: (u, z) => this.p(x, u, z) }; }
  quad(f, u0, u1, z0, z1) { return [f.pt(u0, z0), f.pt(u1, z0), f.pt(u1, z1), f.pt(u0, z1)]; }

  wall(f, mat, light) {
    const ctx = this.ctx;
    const base = light >= 1 ? mat.color : shade(mat.color, light - 1);
    const pts = this.quad(f, f.a0, f.a1, f.z0, f.z1);
    this.fillS(pts, base);
    ctx.save();
    this.pathS(pts); ctx.clip();
    if (mat.tex === 'stone') this.texStone(f, base);
    else if (mat.tex === 'planks') this.texPlanks(f, base);
    else if (mat.tex === 'logs') this.texLogs(f, base);
    else if (mat.tex === 'timber') this.texTimber(f, base, light >= 1 ? mat.beam : shade(mat.beam, light - 1));
    // ambient occlusion at the ground and a soft light falloff toward the top
    const b = f.pt(f.a0, f.z0), t = f.pt(f.a0, f.z1);
    const g = ctx.createLinearGradient(0, b[1] + 6, 0, t[1]);
    g.addColorStop(0, 'rgba(0,0,0,0.32)'); g.addColorStop(Math.min(0.9, 8 / Math.max(8, f.z1 - f.z0)), 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(255,245,220,0.06)');
    ctx.fillStyle = g; ctx.fillRect(-2000, -2000, 4000, 4000);
    ctx.restore();
    this.fillS(pts, null, 'rgba(30,20,10,0.45)', 0.6);
  }
  texStone(f, base) {
    const rowH = 4.4;
    let row = 0;
    for (let z = f.z0; z < f.z1; z += rowH, row++) {
      const bl = 0.24 + this.r() * 0.08;
      const off = row % 2 ? bl / 2 : 0;
      for (let u = f.a0 - off; u < f.a1; u += bl) {
        const tint = (this.r() - 0.5) * 0.16;
        this.fillS(this.quad(f, Math.max(f.a0, u), Math.min(f.a1, u + bl), z, Math.min(f.z1, z + rowH)), shade(base, tint), 'rgba(50,40,30,0.38)', 0.45);
      }
    }
  }
  texPlanks(f, base) {
    const w = 0.15;
    for (let u = f.a0; u < f.a1; u += w) {
      this.fillS(this.quad(f, u, Math.min(f.a1, u + w), f.z0, f.z1), shade(base, (this.r() - 0.5) * 0.18), 'rgba(40,25,10,0.45)', 0.45);
    }
    // knots
    for (let i = 0; i < (f.a1 - f.a0) * 4; i++) {
      const [x, y] = f.pt(f.a0 + this.r() * (f.a1 - f.a0), f.z0 + this.r() * (f.z1 - f.z0));
      this.ctx.fillStyle = 'rgba(40,25,10,0.35)'; this.ctx.fillRect(x, y, 0.8, 0.8);
    }
  }
  texLogs(f, base) {
    for (let z = f.z0; z < f.z1; z += 4) {
      this.fillS(this.quad(f, f.a0, f.a1, z, z + 4), shade(base, (this.r() - 0.5) * 0.12));
      this.fillS(this.quad(f, f.a0, f.a1, z, z + 1.2), 'rgba(0,0,0,0.25)');
      this.fillS(this.quad(f, f.a0, f.a1, z + 3, z + 4), 'rgba(255,255,255,0.12)');
    }
  }
  texTimber(f, base, beam) {
    const ctx = this.ctx;
    // plaster mottling
    for (let i = 0; i < (f.a1 - f.a0) * 30; i++) {
      const [x, y] = f.pt(f.a0 + this.r() * (f.a1 - f.a0), f.z0 + this.r() * (f.z1 - f.z0));
      ctx.fillStyle = this.r() < 0.5 ? 'rgba(120,100,70,0.12)' : 'rgba(255,255,255,0.14)';
      ctx.fillRect(x, y, 1.4, 1);
    }
    const posts = [];
    const n = Math.max(2, Math.round((f.a1 - f.a0) / 0.5));
    for (let i = 0; i <= n; i++) posts.push(f.a0 + ((f.a1 - f.a0) * i) / n);
    const zm = (f.z0 + f.z1) / 2;
    const L = (u0, z0, u1, z1, w) => { const [x0, y0] = f.pt(u0, z0), [x1, y1] = f.pt(u1, z1); ctx.strokeStyle = beam; ctx.lineWidth = w; ctx.lineCap = 'butt'; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
    for (const u of posts) L(u, f.z0, u, f.z1, 1.8);
    L(f.a0, f.z0 + 0.8, f.a1, f.z0 + 0.8, 1.8);
    L(f.a0, zm, f.a1, zm, 1.5);
    L(f.a0, f.z1 - 0.8, f.a1, f.z1 - 0.8, 1.8);
    for (let i = 0; i < posts.length - 1; i++) {
      if (i % 2 === 0) L(posts[i], f.z0 + 0.8, posts[i + 1], zm, 1.2);
      else L(posts[i], zm, posts[i + 1], f.z0 + 0.8, 1.2);
    }
  }
  box(x0, y0, x1, y1, z0, z1, mat, opts = {}) {
    // back faces are never visible in this projection; draw the two front walls and the top
    this.wall(this.faceSW(x0, x1, y1, z0, z1), mat, 1.0);
    this.wall(this.faceSE(y0, y1, x1, z0, z1), mat, 0.72);
    if (opts.top !== false) {
      const top = opts.topColor || shade(mat.color, 0.08);
      this.fill3([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], top, 'rgba(30,20,10,0.4)', 0.5);
    }
  }
  // Simple untextured block with given colors (small props).
  block(x0, y0, x1, y1, z0, z1, color) {
    this.fill3([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], color, 'rgba(0,0,0,0.35)', 0.4);
    this.fill3([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], shade(color, -0.28), 'rgba(0,0,0,0.35)', 0.4);
    this.fill3([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], shade(color, 0.12), 'rgba(0,0,0,0.3)', 0.4);
  }
  roofTex(pts, roof, light) {
    const ctx = this.ctx;
    const base = shade(roof.color, light - 1);
    this.fillS(pts, base);
    ctx.save(); this.pathS(pts); ctx.clip();
    const [p0, p1, p2, p3] = pts;
    const len = Math.hypot((p3[0] + p2[0]) / 2 - (p0[0] + p1[0]) / 2, (p3[1] + p2[1]) / 2 - (p0[1] + p1[1]) / 2);
    const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const rowsN = Math.max(2, Math.round(len / (roof.tex === 'thatch' ? 2.5 : 3.4)));
    if (roof.tex === 'thatch') {
      for (let i = 0; i < 260; i++) {
        const v = this.r(), s = this.r();
        const a = lerp2(lerp2(p0, p3, v), lerp2(p1, p2, v), s);
        const b = lerp2(lerp2(p0, p3, Math.max(0, v - 0.12)), lerp2(p1, p2, Math.max(0, v - 0.12)), s);
        ctx.strokeStyle = this.r() < 0.5 ? rgba(shade(base, -0.3), 0.6) : rgba(shade(base, 0.25), 0.5);
        ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
    } else if (roof.tex) {
      for (let i = 1; i <= rowsN; i++) {
        const v = i / rowsN;
        const a = lerp2(p0, p3, v), b = lerp2(p1, p2, v);
        ctx.strokeStyle = 'rgba(30,15,5,0.35)'; ctx.lineWidth = 0.7;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        const a0 = lerp2(p0, p3, v - 1 / rowsN), b0 = lerp2(p1, p2, v - 1 / rowsN);
        const w = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const cols = Math.max(1, Math.round(w / (roof.tex === 'slate' ? 3.2 : 4)));
        for (let j = 0; j <= cols; j++) {
          const s = (j + (i % 2 ? 0.5 : 0)) / cols;
          if (s > 1) continue;
          const top = lerp2(a, b, s), bot = lerp2(a0, b0, s);
          ctx.strokeStyle = 'rgba(30,15,5,0.25)'; ctx.lineWidth = 0.5;
          ctx.beginPath(); ctx.moveTo(top[0], top[1]); ctx.lineTo(bot[0], bot[1]); ctx.stroke();
        }
        if (roof.tex === 'tile') {
          ctx.strokeStyle = 'rgba(255,220,180,0.12)'; ctx.lineWidth = 0.6;
          ctx.beginPath(); ctx.moveTo(a[0], a[1] + 0.8); ctx.lineTo(b[0], b[1] + 0.8); ctx.stroke();
        }
      }
    }
    // light gradient: brighter toward the ridge
    const mid0 = lerp2(p0, p1, 0.5), mid1 = lerp2(p3, p2, 0.5);
    const g = ctx.createLinearGradient(mid0[0], mid0[1], mid1[0], mid1[1]);
    g.addColorStop(0, 'rgba(0,0,0,0.18)'); g.addColorStop(1, 'rgba(255,240,210,0.1)');
    ctx.fillStyle = g; ctx.fillRect(-2000, -2000, 4000, 4000);
    ctx.restore();
    this.fillS(pts, null, 'rgba(25,12,5,0.55)', 0.6);
  }
  gableX(x0, y0, x1, y1, zb, zr, roof, wallMat) {
    const ov = 0.12, ym = (y0 + y1) / 2, drop = 3;
    const P = (x, y, z) => this.p(x, y, z);
    this.roofTex([P(x1 + ov, y0 - ov, zb - drop), P(x0 - ov, y0 - ov, zb - drop), P(x0 - ov, ym, zr), P(x1 + ov, ym, zr)], roof, 0.86);
    // gable wall (east end)
    const tri = [P(x1, y0, zb), P(x1, y1, zb), P(x1, ym, zr)];
    this.fillS(tri, shade(wallMat.color, -0.28));
    if (wallMat.tex === 'timber') {
      this.ctx.save(); this.pathS(tri); this.ctx.clip();
      this.line3([x1, ym, zb], [x1, ym, zr], 1.6, shade(wallMat.beam, -0.2));
      this.line3([x1, y0, zb + 1], [x1, y1, zb + 1], 1.6, shade(wallMat.beam, -0.2));
      this.ctx.restore();
    } else if (wallMat.tex === 'planks' || wallMat.tex === 'logs') {
      this.ctx.save(); this.pathS(tri); this.ctx.clip();
      for (let y = y0; y < y1; y += 0.15) this.line3([x1, y, zb], [x1, y, zr + 5], 0.5, 'rgba(30,15,5,0.45)');
      this.ctx.restore();
    }
    this.fillS(tri, null, 'rgba(25,12,5,0.45)', 0.5);
    this.roofTex([P(x0 - ov, y1 + ov, zb - drop), P(x1 + ov, y1 + ov, zb - drop), P(x1 + ov, ym, zr), P(x0 - ov, ym, zr)], roof, 1.0);
    // barge board on the gable end
    this.fillS([P(x1 + ov, y1 + ov, zb - drop), P(x1 + ov, ym, zr), P(x1 + ov, ym, zr + 2), P(x1 + ov, y1 + ov, zb - drop + 2)], shade(roof.color, -0.45));
    this.line3([x0 - ov, ym, zr + 0.5], [x1 + ov, ym, zr + 0.5], 1.4, shade(roof.color, -0.35));
  }
  gableY(x0, y0, x1, y1, zb, zr, roof, wallMat) {
    const ov = 0.12, xm = (x0 + x1) / 2, drop = 3;
    const P = (x, y, z) => this.p(x, y, z);
    this.roofTex([P(x0 - ov, y1 + ov, zb - drop), P(x0 - ov, y0 - ov, zb - drop), P(xm, y0 - ov, zr), P(xm, y1 + ov, zr)], roof, 0.9);
    const tri = [P(x0, y1, zb), P(x1, y1, zb), P(xm, y1, zr)];
    this.fillS(tri, wallMat.color);
    if (wallMat.tex === 'timber') {
      this.ctx.save(); this.pathS(tri); this.ctx.clip();
      this.line3([xm, y1, zb], [xm, y1, zr], 1.6, wallMat.beam);
      this.line3([x0, y1, zb + 1], [x1, y1, zb + 1], 1.6, wallMat.beam);
      this.line3([x0 + (x1 - x0) * 0.25, y1, zb], [xm, y1, zb + (zr - zb) * 0.55], 1.2, wallMat.beam);
      this.line3([x1 - (x1 - x0) * 0.25, y1, zb], [xm, y1, zb + (zr - zb) * 0.55], 1.2, wallMat.beam);
      this.ctx.restore();
    } else if (wallMat.tex === 'planks' || wallMat.tex === 'logs') {
      this.ctx.save(); this.pathS(tri); this.ctx.clip();
      for (let x = x0; x < x1; x += 0.15) this.line3([x, y1, zb], [x, y1, zr + 5], 0.5, 'rgba(30,15,5,0.45)');
      this.ctx.restore();
    } else if (wallMat.tex === 'stone') {
      this.ctx.save(); this.pathS(tri); this.ctx.clip();
      this.texStone(this.faceSW(x0, x1, y1, zb, zr), wallMat.color);
      this.ctx.restore();
    }
    this.fillS(tri, null, 'rgba(25,12,5,0.45)', 0.5);
    this.roofTex([P(x1 + ov, y1 + ov, zb - drop), P(x1 + ov, y0 - ov, zb - drop), P(xm, y0 - ov, zr), P(xm, y1 + ov, zr)], roof, 0.74);
    this.fillS([P(x0 - ov, y1 + ov, zb - drop), P(xm, y1 + ov, zr), P(xm, y1 + ov, zr + 2), P(x0 - ov, y1 + ov, zb - drop + 2)], shade(roof.color, -0.4));
    this.fillS([P(xm, y1 + ov, zr), P(x1 + ov, y1 + ov, zb - drop), P(x1 + ov, y1 + ov, zb - drop + 2), P(xm, y1 + ov, zr + 2)], shade(roof.color, -0.5));
    this.line3([xm, y0 - ov, zr + 0.5], [xm, y1 + ov, zr + 0.5], 1.4, shade(roof.color, -0.35));
  }
  hip(x0, y0, x1, y1, zb, zr, roof) {
    const ov = 0.12;
    x0 -= ov; y0 -= ov; x1 += ov; y1 += ov; zb -= 3;
    const P = (x, y, z) => this.p(x, y, z);
    const w = x1 - x0, d = y1 - y0;
    let r0, r1;
    if (w >= d) { const h = d / 2; r0 = [x0 + h, y0 + h]; r1 = [x1 - h, y0 + h]; }
    else { const h = w / 2; r0 = [x0 + h, y0 + h]; r1 = [x0 + h, y1 - h]; }
    this.roofTex([P(x1, y0, zb), P(x0, y0, zb), P(r0[0], r0[1], zr), P(r1[0], r1[1], zr)], roof, 0.88);
    this.roofTex([P(x0, y1, zb), P(x0, y0, zb), P(r0[0], r0[1], zr), P(r0[0], r0[1], zr)], roof, 0.9);
    this.roofTex([P(x1, y0, zb), P(x1, y1, zb), P(r1[0], r1[1], zr), P(r1[0], r1[1], zr)], roof, 0.72);
    this.roofTex([P(x0, y1, zb), P(x1, y1, zb), P(r1[0], r1[1], zr), P(r0[0], r0[1], zr)], roof, 1.0);
    this.line3([r0[0], r0[1], zr + 0.5], [r1[0], r1[1], zr + 0.5], 1.3, shade(roof.color, -0.35));
  }
  pyramid(x0, y0, x1, y1, zb, zt, roof, ov = 0.1) {
    x0 -= ov; y0 -= ov; x1 += ov; y1 += ov;
    const xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
    const P = (x, y, z) => this.p(x, y, z);
    const A = P(xm, ym, zt);
    this.roofTex([P(x0, y1, zb), P(x0, y0, zb), A, A], roof, 0.9);
    this.roofTex([P(x1, y0, zb), P(x1, y1, zb), A, A], roof, 0.72);
    this.roofTex([P(x0, y1, zb), P(x1, y1, zb), A, A], roof, 1.0);
  }
  cyl(cx, cy, r, z0, z1, mat, opts = {}) {
    const ctx = this.ctx;
    const rx = r * HW * Math.SQRT2, ry = r * HH * Math.SQRT2;
    const [X, Y0] = this.p(cx, cy, z0);
    const Y1 = Y0 - (z1 - z0);
    ctx.beginPath();
    ctx.moveTo(X - rx, Y1); ctx.lineTo(X - rx, Y0);
    ctx.ellipse(X, Y0, rx, ry, 0, Math.PI, 0, true);
    ctx.lineTo(X + rx, Y1);
    ctx.ellipse(X, Y1, rx, ry, 0, 0, Math.PI, false);
    ctx.closePath();
    const g = ctx.createLinearGradient(X - rx, 0, X + rx, 0);
    g.addColorStop(0, shade(mat.color, 0.1)); g.addColorStop(0.35, mat.color); g.addColorStop(1, shade(mat.color, -0.38));
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.clip();
    if (mat.tex === 'stone') {
      let row = 0;
      for (let z = z0; z < z1; z += 4.4, row++) {
        const y = Y0 - (z - z0);
        ctx.strokeStyle = 'rgba(50,40,30,0.35)'; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.ellipse(X, y, rx, ry, 0, 0, Math.PI, false); ctx.stroke();
        for (let k = 0; k < 7; k++) {
          const a = ((k + (row % 2 ? 0.5 : 0)) / 7) * Math.PI;
          const xx = X + Math.cos(a) * rx, yy = y + Math.sin(a) * ry;
          ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx, yy - 4.4); ctx.stroke();
        }
      }
    } else if (mat.tex === 'planks') {
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI; const xx = X + Math.cos(a) * rx;
        ctx.strokeStyle = 'rgba(40,25,10,0.4)'; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(xx, Y1 + Math.sin(a) * ry); ctx.lineTo(xx, Y0 + Math.sin(a) * ry); ctx.stroke();
      }
    }
    const ag = ctx.createLinearGradient(0, Y0 + ry, 0, Y0 - 12);
    ag.addColorStop(0, 'rgba(0,0,0,0.3)'); ag.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ag; ctx.fillRect(X - rx - 2, Y1 - 50, rx * 2 + 4, Y0 - Y1 + 80);
    ctx.restore();
    ctx.strokeStyle = 'rgba(30,20,10,0.45)'; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(X - rx, Y1); ctx.lineTo(X - rx, Y0); ctx.ellipse(X, Y0, rx, ry, 0, Math.PI, 0, true); ctx.lineTo(X + rx, Y1); ctx.stroke();
    if (opts.top !== false) {
      ctx.beginPath(); ctx.ellipse(X, Y1, rx, ry, 0, 0, TAU);
      ctx.fillStyle = opts.topColor || shade(mat.color, 0.05); ctx.fill();
      ctx.strokeStyle = 'rgba(30,20,10,0.45)'; ctx.stroke();
    }
  }
  cone(cx, cy, r, zb, zt, roof) {
    const ctx = this.ctx;
    const rx = r * HW * Math.SQRT2, ry = r * HH * Math.SQRT2;
    const [X, Yb] = this.p(cx, cy, zb);
    const Ya = Yb - (zt - zb);
    ctx.beginPath();
    ctx.moveTo(X - rx, Yb); ctx.lineTo(X, Ya); ctx.lineTo(X + rx, Yb);
    ctx.ellipse(X, Yb, rx, ry, 0, 0, Math.PI, false);
    ctx.closePath();
    const g = ctx.createLinearGradient(X - rx, 0, X + rx, 0);
    g.addColorStop(0, shade(roof.color, 0.12)); g.addColorStop(0.4, roof.color); g.addColorStop(1, shade(roof.color, -0.42));
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = 'rgba(20,10,5,0.3)'; ctx.lineWidth = 0.5;
    for (let k = 1; k < 12; k++) {
      const a = (k / 12) * Math.PI;
      ctx.beginPath(); ctx.moveTo(X, Ya); ctx.lineTo(X + Math.cos(a) * rx, Yb + Math.sin(a) * ry); ctx.stroke();
    }
    for (let k = 1; k < 6; k++) {
      const f = k / 6;
      ctx.beginPath(); ctx.ellipse(X, Ya + (Yb - Ya) * f, rx * f, ry * f, 0, 0, Math.PI, false); ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(20,10,5,0.5)'; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(X - rx, Yb); ctx.lineTo(X, Ya); ctx.lineTo(X + rx, Yb); ctx.ellipse(X, Yb, rx, ry, 0, 0, Math.PI, false); ctx.stroke();
  }
  crenel(x0, y0, x1, y1, z, mat, h = 5) {
    const m = 0.14, step = 0.3;
    const col = mat.color;
    for (let x = x0; x < x1 - 0.01; x += step) this.block(x, y0, Math.min(x + m, x1), y0 + m, z, z + h, col);
    for (let y = y0 + step; y < y1 - 0.01; y += step) this.block(x0, y, x0 + m, Math.min(y + m, y1), z, z + h, col);
    for (let y = y0; y < y1 - 0.01; y += step) this.block(x1 - m, y, x1, Math.min(y + m, y1), z, z + h, col);
    for (let x = x0; x < x1 - 0.01; x += step) this.block(x, y1 - m, Math.min(x + m, x1), y1, z, z + h, col);
  }
  cylCrenel(cx, cy, r, z, mat) {
    const as = [];
    for (let k = 0; k < 10; k++) as.push((k / 10) * TAU + 0.3);
    as.sort((a, b) => (Math.cos(a) + Math.sin(a)) - (Math.cos(b) + Math.sin(b)));
    for (const a of as) {
      const x = cx + Math.cos(a) * r * 0.85, y = cy + Math.sin(a) * r * 0.85;
      this.block(x - 0.07, y - 0.07, x + 0.07, y + 0.07, z, z + 5, mat.color);
    }
  }
  door(f, u, w, h, color = '#4a2e18', arch = true) {
    const u0 = u - w / 2, u1 = u + w / 2;
    const pts = [f.pt(u0, f.z0), f.pt(u1, f.z0), f.pt(u1, f.z0 + h)];
    if (arch) for (let i = 1; i < 8; i++) { const a = (i / 8) * Math.PI; pts.push(f.pt(u - Math.cos(a) * w / 2, f.z0 + h + Math.sin(a) * w * 9)); }
    pts.push(f.pt(u0, f.z0 + h));
    this.fillS(pts, shade('#2a1a0e', 0), '#1a0f06', 0.8);
    const inner = pts.map(([x, y]) => [x, y]);
    this.ctx.save(); this.pathS(inner); this.ctx.clip();
    for (let k = 0; k < 4; k++) {
      const uu = u0 + (w * (k + 0.5)) / 4;
      const [a0, b0] = f.pt(uu, f.z0), [a1, b1] = f.pt(uu, f.z0 + h + w * 9);
      this.ctx.strokeStyle = rgba(color, 0.9); this.ctx.lineWidth = (w * 32) / 4 - 0.4;
      this.ctx.beginPath(); this.ctx.moveTo(a0, b0); this.ctx.lineTo(a1, b1); this.ctx.stroke();
    }
    this.ctx.restore();
    this.fillS(pts, null, '#1a0f06', 0.7);
  }
  window(f, u, zc, w, h, lit = false) {
    const pts = this.quad(f, u - w / 2, u + w / 2, zc - h / 2, zc + h / 2);
    this.fillS(pts, lit ? '#e8b458' : '#241a14', 'rgba(70,50,30,0.9)', 0.9);
    const [a, b] = f.pt(u, zc - h / 2), [c, d] = f.pt(u, zc + h / 2);
    this.ctx.strokeStyle = 'rgba(80,60,40,0.9)'; this.ctx.lineWidth = 0.6;
    this.ctx.beginPath(); this.ctx.moveTo(a, b); this.ctx.lineTo(c, d); this.ctx.stroke();
  }
  slit(f, u, zc, h = 6) {
    this.fillS(this.quad(f, u - 0.03, u + 0.03, zc - h / 2, zc + h / 2), '#1b1410');
  }
  banner(f, u, ztop, w, h, pc) {
    const pts = [f.pt(u - w / 2, ztop), f.pt(u + w / 2, ztop), f.pt(u + w / 2, ztop - h), f.pt(u, ztop - h - 3), f.pt(u - w / 2, ztop - h)];
    this.fillS(pts, pc.main, shade(pc.main, -0.5), 0.5);
    const [a, b] = f.pt(u - w / 2 - 0.03, ztop + 0.5), [c, d] = f.pt(u + w / 2 + 0.03, ztop + 0.5);
    this.ctx.strokeStyle = '#5a3d24'; this.ctx.lineWidth = 1; this.ctx.beginPath(); this.ctx.moveTo(a, b); this.ctx.lineTo(c, d); this.ctx.stroke();
    const [e, g] = f.pt(u, ztop - h * 0.45);
    this.ctx.fillStyle = shade(pc.main, 0.55); this.ctx.beginPath(); this.ctx.arc(e, g, 1.3, 0, TAU); this.ctx.fill();
  }
  flag(x, y, z, h = 16) {
    const [X, Y] = this.p(x, y, z);
    this.ctx.strokeStyle = '#3a2a1a'; this.ctx.lineWidth = 1; this.ctx.beginPath(); this.ctx.moveTo(X, Y); this.ctx.lineTo(X, Y - h); this.ctx.stroke();
    this.ctx.fillStyle = '#c9a13c'; this.ctx.beginPath(); this.ctx.arc(X, Y - h - 0.8, 1, 0, TAU); this.ctx.fill();
    this.meta.flags.push({ x: X, y: Y - h, h });
  }
  smoke(x, y, z) { const [X, Y] = this.p(x, y, z); this.meta.smoke.push({ x: X, y: Y }); }
  fire(x, y, z) { const [X, Y] = this.p(x, y, z); this.meta.fire.push({ x: X, y: Y }); }
  post(x, y, z0, z1, color = '#6b4a2c', r = 0.05) { this.block(x - r, y - r, x + r, y + r, z0, z1, color); }
  barrel(x, y, z = 0) {
    this.cyl(x, y, 0.1, z, z + 7, { color: '#8a5f36', tex: 'planks' }, { topColor: '#6a4526' });
    const [X, Y] = this.p(x, y, z + 2); this.ctx.strokeStyle = '#3a3a3a'; this.ctx.lineWidth = 0.6;
    this.ctx.beginPath(); this.ctx.ellipse(X, Y, 0.1 * HW * 1.414, 0.1 * HH * 1.414, 0, 0, Math.PI); this.ctx.stroke();
  }
  crate(x, y, s = 0.2, z = 0) { this.block(x - s / 2, y - s / 2, x + s / 2, y + s / 2, z, z + s * 36, '#9a7446'); this.line3([x - s / 2, y + s / 2, z], [x + s / 2, y + s / 2, z + s * 36], 0.5, 'rgba(40,25,10,0.6)'); }
  logPile(x0, y0, x1, n = 3) {
    // logs lying along x
    for (let row = 0; row < n; row++) {
      const count = n - row;
      for (let i = 0; i < count; i++) {
        const y = y0 + 0.14 * i + row * 0.07, z = row * 4.3 + 2.2;
        const [ax, ay] = this.p(x0, y, z), [bx, by] = this.p(x1, y, z);
        this.ctx.strokeStyle = '#6e4a2a'; this.ctx.lineWidth = 4.3; this.ctx.lineCap = 'butt';
        this.ctx.beginPath(); this.ctx.moveTo(ax, ay); this.ctx.lineTo(bx, by); this.ctx.stroke();
        this.ctx.strokeStyle = 'rgba(255,230,190,0.18)'; this.ctx.lineWidth = 1;
        this.ctx.beginPath(); this.ctx.moveTo(ax, ay - 1.4); this.ctx.lineTo(bx, by - 1.4); this.ctx.stroke();
        this.ctx.fillStyle = '#d0a870'; this.ctx.beginPath(); this.ctx.ellipse(bx, by, 1.7, 2.1, 0, 0, TAU); this.ctx.fill();
        this.ctx.strokeStyle = '#8a6a40'; this.ctx.lineWidth = 0.4; this.ctx.stroke();
      }
    }
  }
  groundPatch(x0, y0, x1, y1, color, alpha = 1) {
    this.fill3([[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]], rgba(color, alpha));
  }
}

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------
function plinth(I, s, st, inset = 0.08, h = 4) {
  I.box(inset, inset, s - inset, s - inset, 0, h, st.low.tex ? st.low : MAT.stone);
}

const DRAW = {
  house(I, st, pc, v) {
    plinth(I, 2, st, 0.15, 3);
    const alongY = v % 2 === 1;
    if (st.wall === MAT.whitestone || st.wall.tex === 'timber' && st.roof === ROOF.darktile) {
      I.box(0.3, 0.3, 1.7, 1.7, 3, 12, st.low);
      I.box(0.3, 0.3, 1.7, 1.7, 12, 27, st.wall);
    } else I.box(0.3, 0.3, 1.7, 1.7, 3, 27, st.wall);
    const sw = I.faceSW(0.3, 1.7, 1.7, 3, 27), se = I.faceSE(0.3, 1.7, 1.7, 3, 27);
    I.door(sw, 0.72, 0.3, 11);
    I.window(sw, 1.3, 17, 0.22, 5, v % 3 === 0);
    I.window(se, 0.8, 17, 0.22, 5);
    I.window(se, 1.3, 17, 0.22, 5, v % 4 === 1);
    I.box(0.55, 0.55, 0.8, 0.8, 27, 52, st.stone, { topColor: '#3a3430' });
    I.smoke(0.675, 0.675, 53);
    if (alongY) I.gableY(0.3, 0.3, 1.7, 1.7, 27, 47, st.roof, st.wall);
    else I.gableX(0.3, 0.3, 1.7, 1.7, 27, 47, st.roof, st.wall);
    I.fire(1, 1, 38);
    if (v % 3 === 1) I.barrel(1.85, 1.2);
    if (v % 3 === 2) I.crate(1.2, 1.85, 0.2);
  },
  towncenter(I, st, pc, v, age) {
    I.box(0.05, 0.05, 3.95, 3.95, 0, 6, MAT.stone);
    // steps in front
    I.box(1.4, 3.95, 2.6, 4.12, 0, 3, MAT.stone);
    const wall = age === 0 ? MAT.logs : age === 1 ? MAT.plaster : age === 2 ? MAT.darkstone : MAT.whitestone;
    // back corner turret
    if (age >= 2) { I.cyl(0.55, 0.55, 0.36, 6, 50, st.stone); I.cone(0.55, 0.55, 0.45, 50, 76, st.roof); }
    I.box(0.55, 0.55, 3.45, 3.45, 6, 40, wall);
    const sw = I.faceSW(0.55, 3.45, 3.45, 6, 40), se = I.faceSE(0.55, 3.45, 3.45, 6, 40);
    I.door(sw, 2.0, 0.55, 17, '#5a3a1e');
    for (const u of [1.1, 2.9]) I.window(sw, u, 27, 0.25, 7, true);
    for (const u of [1.1, 2.0, 2.9]) I.window(se, u, 27, 0.25, 7, u === 2.0);
    I.banner(sw, 1.45, 36, 0.3, 14, pc); I.banner(sw, 2.55, 36, 0.3, 14, pc);
    I.hip(0.55, 0.55, 3.45, 3.45, 40, 62, st.roof);
    // central tower rising from the roof
    const tw = age >= 2 ? MAT.stone : age === 1 ? MAT.plaster : MAT.planks;
    const top = age === 0 ? 80 : age === 1 ? 88 : age === 2 ? 96 : 104;
    I.box(1.5, 1.5, 2.5, 2.5, 52, top, age === 3 ? MAT.whitestone : tw);
    const tsw = I.faceSW(1.5, 2.5, 2.5, 52, top), tse = I.faceSE(1.5, 2.5, 2.5, 52, top);
    I.window(tsw, 2.0, top - 12, 0.2, 7, true); I.window(tse, 2.0, top - 12, 0.2, 7);
    if (age >= 2) {
      I.crenel(1.45, 1.45, 2.55, 2.55, top, MAT.stone, 5);
      I.pyramid(1.62, 1.62, 2.38, 2.38, top + 2, top + 30, st.roof, 0.04);
      I.flag(2, 2, top + 30, 18);
    } else {
      I.pyramid(1.5, 1.5, 2.5, 2.5, top, top + 26, st.roof);
      I.flag(2, 2, top + 26, 16);
    }
    if (age >= 2) {
      I.cyl(0.55, 3.45, 0.36, 6, 50, st.stone); I.cone(0.55, 3.45, 0.45, 50, 76, st.roof);
      I.cyl(3.45, 0.55, 0.36, 6, 50, st.stone); I.cone(3.45, 0.55, 0.45, 50, 76, st.roof);
      I.cyl(3.45, 3.45, 0.36, 6, 50, st.stone); I.cone(3.45, 3.45, 0.45, 50, 76, st.roof);
      I.flag(3.45, 3.45, 76, 12);
    } else {
      I.flag(0.6, 3.4, 40, 20);
      I.flag(3.4, 0.6, 40, 20);
    }
    if (age === 3) { I.line3([0.55, 3.45, 40.5], [3.45, 3.45, 40.5], 1.2, '#d8b040'); I.line3([3.45, 0.55, 40.5], [3.45, 3.45, 40.5], 1.2, '#b8902a'); }
    I.barrel(3.7, 3.8); I.barrel(3.85, 3.55); I.crate(0.4, 3.8, 0.22);
    I.fire(1.2, 2.5, 50); I.fire(2.8, 2.2, 50); I.fire(2, 2, top); I.fire(2.5, 3, 45);
  },
  barracks(I, st, pc, v, age) {
    plinth(I, 3, st);
    const wall = age >= 2 ? MAT.stone : st.wall;
    I.box(0.3, 0.3, 2.7, 1.8, 4, 34, wall);
    const sw = I.faceSW(0.3, 2.7, 1.8, 4, 34), se = I.faceSE(0.3, 1.8, 2.7, 4, 34);
    I.door(sw, 1.5, 0.45, 15);
    I.window(sw, 0.75, 24, 0.22, 6); I.window(sw, 2.25, 24, 0.22, 6);
    I.window(se, 1.05, 24, 0.22, 6);
    I.banner(sw, 1.05, 32, 0.24, 12, pc); I.banner(sw, 1.95, 32, 0.24, 12, pc);
    I.gableX(0.3, 0.3, 2.7, 1.8, 34, 58, st.roof, wall);
    I.flag(2.7, 1.05, 58, 16);
    // training yard: fence, weapon rack, dummy
    for (let x = 0.3; x <= 2.75; x += 0.3) I.post(x, 2.85, 4, 10, '#6b4a2c', 0.04);
    I.line3([0.3, 2.85, 8], [2.75, 2.85, 8], 1.2, '#7b5a3a');
    I.post(2.2, 2.25, 4, 20, '#7a5a3a', 0.05);
    I.line3([2.05, 2.25, 17], [2.35, 2.25, 17], 1.4, '#7a5a3a');
    const [dx, dy] = I.p(2.2, 2.25, 13); I.ctx.fillStyle = '#c9a86a'; I.ctx.beginPath(); I.ctx.ellipse(dx, dy, 3, 4.5, 0, 0, TAU); I.ctx.fill();
    I.ctx.strokeStyle = '#7a5a30'; I.ctx.lineWidth = 0.5; I.ctx.stroke();
    for (let i = 0; i < 4; i++) I.line3([0.55 + i * 0.12, 2.35, 4], [0.5 + i * 0.12, 2.3, 26], 0.8, '#8a6a44');
    I.line3([0.45, 2.33, 14], [1.0, 2.33, 14], 1, '#5a3d24');
    I.fire(1, 1, 45); I.fire(2, 1, 45);
  },
  archeryrange(I, st, pc, v, age) {
    plinth(I, 3, st);
    const wall = age >= 2 ? MAT.stone : st.wall;
    I.box(0.3, 0.3, 2.7, 1.5, 4, 32, wall);
    const sw = I.faceSW(0.3, 2.7, 1.5, 4, 32), se = I.faceSE(0.3, 1.5, 2.7, 4, 32);
    I.door(sw, 0.8, 0.35, 14); I.window(sw, 1.6, 22, 0.2, 6); I.window(sw, 2.3, 22, 0.2, 6);
    I.window(se, 0.9, 22, 0.2, 6);
    I.banner(sw, 1.2, 30, 0.22, 11, pc);
    I.gableX(0.3, 0.3, 2.7, 1.5, 32, 52, st.roof, wall);
    I.flag(0.4, 0.9, 50, 14);
    // targets
    const target = (x, y) => {
      I.post(x - 0.12, y, 4, 16, '#6b4a2c', 0.03); I.post(x + 0.12, y, 4, 16, '#6b4a2c', 0.03);
      const [X, Y] = I.p(x, y + 0.05, 17);
      const c = I.ctx;
      [[6, '#d9c27a'], [4.6, '#c23a2a'], [3.2, '#eee'], [1.8, '#c23a2a']].forEach(([r, col]) => { c.fillStyle = col; c.beginPath(); c.ellipse(X, Y, r * 0.9, r, 0, 0, TAU); c.fill(); });
      c.strokeStyle = '#8a7340'; c.lineWidth = 0.5; c.beginPath(); c.ellipse(X, Y, 5.4, 6, 0, 0, TAU); c.stroke();
      c.strokeStyle = '#4a3a2a'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(X + 1, Y - 1); c.lineTo(X - 3, Y - 4); c.stroke();
    };
    target(1.2, 2.35); target(2.2, 2.35);
    // hay bale
    I.block(0.4, 2.4, 0.75, 2.75, 4, 10, '#d4b35e');
    I.fire(1.2, 0.9, 40); I.fire(2.2, 0.9, 40);
  },
  stable(I, st, pc, v, age) {
    plinth(I, 3, st);
    if (age >= 2) { I.box(0.3, 0.35, 2.7, 2.55, 4, 12, MAT.stone); I.box(0.3, 0.35, 2.7, 2.55, 12, 30, MAT.planks); }
    else I.box(0.3, 0.35, 2.7, 2.55, 4, 30, age === 0 ? MAT.logs : MAT.planks);
    const sw = I.faceSW(0.3, 2.7, 2.55, 4, 30), se = I.faceSE(0.35, 2.55, 2.7, 4, 30);
    // big barn door (dark opening with half-open doors)
    I.fillS(I.quad(sw, 1.05, 1.95, 4, 22), '#20160e', '#140d07', 0.8);
    I.fillS(I.quad(sw, 0.8, 1.05, 4, 21), '#7a5230', '#3a2716', 0.6);
    I.line3([0.8, 2.56, 4.5], [1.05, 2.56, 20.5], 0.8, '#3a2716'); I.line3([0.8, 2.56, 20.5], [1.05, 2.56, 4.5], 0.8, '#3a2716');
    // horse head peeking out
    const [hx, hy] = I.p(1.5, 2.58, 13);
    const c = I.ctx; c.fillStyle = '#6b4226'; c.beginPath(); c.ellipse(hx + 2, hy, 2.4, 4.2, -0.5, 0, TAU); c.fill();
    c.fillStyle = '#111'; c.beginPath(); c.arc(hx + 2.6, hy - 1.8, 0.5, 0, TAU); c.fill();
    I.window(se, 0.9, 20, 0.2, 5); I.window(se, 1.7, 20, 0.2, 5);
    I.gableY(0.3, 0.35, 2.7, 2.55, 30, 56, age === 0 ? ROOF.thatch : st.roof, age >= 2 ? MAT.planks : MAT.planks);
    I.flag(1.5, 2.5, 56, 14);
    I.block(2.3, 2.65, 2.85, 2.95, 4, 10, '#d4b35e'); I.block(2.45, 2.62, 2.8, 2.9, 10, 15, '#caa653');
    I.block(0.2, 2.65, 0.75, 2.85, 4, 8, '#6b4a2c');
    I.fire(1.5, 1, 45); I.fire(1.5, 2, 40);
  },
  blacksmith(I, st, pc, v, age) {
    plinth(I, 3, st);
    const wall = age >= 1 ? MAT.stone : MAT.logs;
    I.box(1.95, 0.45, 2.45, 0.95, 4, 30, MAT.darkstone);
    I.box(0.35, 0.35, 2.65, 2.1, 4, 30, wall);
    const sw = I.faceSW(0.35, 2.65, 2.1, 4, 30), se = I.faceSE(0.35, 2.1, 2.65, 4, 30);
    I.door(sw, 0.8, 0.35, 13);
    I.fillS(I.quad(sw, 1.4, 2.3, 4, 16), '#1d140e', '#120b06', 0.7);
    I.fillS(I.quad(sw, 1.55, 2.15, 5, 11), '#e87a2a');
    I.fillS(I.quad(sw, 1.7, 2.0, 5, 9), '#ffd070');
    I.meta.glow.push({ x: I.p(1.85, 2.1, 8)[0], y: I.p(1.85, 2.1, 8)[1] });
    I.window(se, 1.2, 20, 0.22, 6, true);
    I.hip(0.35, 0.35, 2.65, 2.1, 30, 48, st.roof);
    I.box(1.95, 0.45, 2.45, 0.95, 38, 66, MAT.darkstone, { topColor: '#2a2420' });
    I.smoke(2.2, 0.7, 67); I.smoke(2.2, 0.7, 67);
    // canopy with anvil
    I.post(1.4, 2.8, 4, 24, '#6b4a2c', 0.05); I.post(2.55, 2.8, 4, 24, '#6b4a2c', 0.05);
    I.roofTex([I.p(1.3, 2.9, 22), I.p(2.65, 2.9, 22), I.p(2.65, 2.1, 30), I.p(1.3, 2.1, 30)], ROOF.shingle, 0.95);
    I.block(1.75, 2.4, 2.05, 2.6, 4, 9, '#3a3a3e');
    I.block(1.7, 2.45, 2.12, 2.55, 9, 11, '#55575c');
    I.barrel(0.6, 2.6);
    I.fire(1, 1, 40); I.fire(2, 1.5, 40);
  },
  market(I, st, pc, v, age) {
    I.box(0.1, 0.1, 3.9, 3.9, 0, 2, MAT.stone);
    I.box(1.3, 0.35, 2.7, 1.5, 2, 28, st.wall);
    const sw = I.faceSW(1.3, 2.7, 1.5, 2, 28);
    I.door(sw, 2.0, 0.35, 12); I.window(sw, 1.6, 20, 0.2, 5); I.window(sw, 2.4, 20, 0.2, 5);
    I.hip(1.3, 0.35, 2.7, 1.5, 28, 46, st.roof);
    I.flag(2.0, 0.9, 46, 14);
    const stall = (x, y, c1, c2) => {
      I.block(x - 0.35, y - 0.2, x + 0.35, y + 0.2, 2, 8, '#8a6440');
      // goods
      const cols = ['#c23a2a', '#e0b030', '#6aa040', '#d07030'];
      for (let i = 0; i < 5; i++) { const [gx, gy] = I.p(x - 0.25 + i * 0.12, y, 9); I.ctx.fillStyle = cols[(i + Math.floor(x * 3)) % 4]; I.ctx.beginPath(); I.ctx.arc(gx, gy, 1.3, 0, TAU); I.ctx.fill(); }
      I.post(x - 0.38, y - 0.25, 2, 22, '#6b4a2c', 0.03); I.post(x + 0.38, y - 0.25, 2, 22, '#6b4a2c', 0.03);
      I.post(x - 0.38, y + 0.3, 2, 16, '#6b4a2c', 0.03); I.post(x + 0.38, y + 0.3, 2, 16, '#6b4a2c', 0.03);
      const n = 6;
      for (let i = 0; i < n; i++) {
        const x0 = x - 0.45 + (0.9 * i) / n, x1 = x - 0.45 + (0.9 * (i + 1)) / n;
        I.fill3([[x0, y + 0.42, 15], [x1, y + 0.42, 15], [x1, y - 0.3, 22], [x0, y - 0.3, 22]], i % 2 ? c1 : c2, 'rgba(0,0,0,0.25)', 0.3);
      }
    };
    stall(0.8, 2.1, '#c8322a', '#f2ead8'); stall(2.1, 2.5, '#2d5fb8', '#e8c24a'); stall(3.2, 2.1, pc.main, '#f2ead8'); stall(1.3, 3.3, '#3a8a3a', '#f2ead8');
    I.barrel(3.3, 3.3); I.barrel(3.5, 3.1); I.crate(2.8, 3.5, 0.22); I.crate(0.4, 3.0, 0.2);
    I.fire(2, 0.9, 38);
  },
  mill(I, st, pc, v, age) {
    plinth(I, 2, st, 0.2, 3);
    const wall = age >= 2 ? MAT.stone : age === 1 ? MAT.plaster : MAT.planks;
    I.box(0.4, 0.4, 1.6, 1.6, 3, 36, wall);
    const sw = I.faceSW(0.4, 1.6, 1.6, 3, 36);
    I.door(sw, 0.7, 0.28, 11);
    I.window(I.faceSE(0.4, 1.6, 1.6, 3, 36), 1.0, 24, 0.2, 5);
    I.pyramid(0.4, 0.4, 1.6, 1.6, 36, 62, age === 0 ? ROOF.thatch : st.roof, 0.14);
    const [hx, hy] = I.p(1.12, 1.78, 44);
    I.meta.sails = { x: hx, y: hy, r: 30 };
    // sacks
    for (const [x, y] of [[1.75, 0.6], [1.8, 0.85], [1.72, 1.1]]) { const [sx, sy] = I.p(x, y, 3); I.ctx.fillStyle = '#d8c89a'; I.ctx.beginPath(); I.ctx.ellipse(sx, sy - 2.5, 2.6, 3, 0, 0, TAU); I.ctx.fill(); I.ctx.strokeStyle = '#8a7a50'; I.ctx.lineWidth = 0.4; I.ctx.stroke(); }
    I.fire(1, 1, 40);
  },
  lumbercamp(I, st, pc, v, age) {
    I.groundPatch(0.1, 0.1, 1.9, 1.9, '#6e5638', 0.5);
    I.box(0.25, 0.25, 1.75, 0.6, 0, 24, age >= 2 ? MAT.darkplanks : MAT.planks);
    I.post(0.3, 1.3, 0, 20, '#6b4a2c', 0.05); I.post(1.7, 1.3, 0, 20, '#6b4a2c', 0.05);
    I.logPile(0.45, 0.72, 1.5, 3);
    I.roofTex([I.p(0.15, 1.42, 18), I.p(1.85, 1.42, 18), I.p(1.85, 0.2, 30), I.p(0.15, 0.2, 30)], age === 0 ? ROOF.thatch : ROOF.shingle, 1.0);
    I.fillS([I.p(1.85, 1.42, 18), I.p(1.85, 0.2, 30), I.p(1.85, 0.2, 32), I.p(1.85, 1.42, 20)], '#4a3220');
    // saw horse + stump with axe
    I.block(1.3, 1.55, 1.8, 1.65, 0, 6, '#7a5a3a');
    I.cyl(0.5, 1.65, 0.12, 0, 5, { color: '#8a6440', tex: 'planks' }, { topColor: '#d0a870' });
    I.line3([0.5, 1.65, 5], [0.62, 1.55, 11], 1, '#6b4a2c');
    I.flag(0.3, 0.3, 24, 12);
    I.fire(1, 0.8, 26);
  },
  miningcamp(I, st, pc, v, age) {
    I.groundPatch(0.1, 0.1, 1.9, 1.9, '#6f6558', 0.5);
    I.box(0.25, 0.25, 1.75, 0.6, 0, 24, age >= 2 ? MAT.stone : MAT.planks);
    I.post(0.3, 1.3, 0, 20, '#6b4a2c', 0.05); I.post(1.7, 1.3, 0, 20, '#6b4a2c', 0.05);
    // ore piles
    const pile = (x, y, col) => { for (let i = 0; i < 7; i++) { const [px, py] = I.p(x + (I.r() - 0.5) * 0.35, y + (I.r() - 0.5) * 0.3, 1 + I.r() * 3); I.ctx.fillStyle = shade(col, (I.r() - 0.5) * 0.3); I.ctx.beginPath(); I.ctx.arc(px, py, 2 + I.r() * 1.2, 0, TAU); I.ctx.fill(); } };
    pile(0.6, 0.95, '#9a9a96'); pile(1.25, 0.95, '#e0b83a');
    I.roofTex([I.p(0.15, 1.42, 18), I.p(1.85, 1.42, 18), I.p(1.85, 0.2, 30), I.p(0.15, 0.2, 30)], age === 0 ? ROOF.thatch : ROOF.shingle, 1.0);
    I.fillS([I.p(1.85, 1.42, 18), I.p(1.85, 0.2, 30), I.p(1.85, 0.2, 32), I.p(1.85, 1.42, 20)], '#4a3220');
    // cart
    I.block(0.9, 1.5, 1.55, 1.85, 3, 9, '#7a5433');
    for (let i = 0; i < 4; i++) { const [px, py] = I.p(1.0 + i * 0.15, 1.65, 10); I.ctx.fillStyle = i % 2 ? '#f0c840' : '#a0a09a'; I.ctx.beginPath(); I.ctx.arc(px, py, 1.8, 0, TAU); I.ctx.fill(); }
    const [wx, wy] = I.p(1.0, 1.86, 3); I.ctx.fillStyle = '#4a3220'; I.ctx.beginPath(); I.ctx.ellipse(wx, wy, 2.4, 2.8, 0, 0, TAU); I.ctx.fill();
    const [wx2, wy2] = I.p(1.45, 1.86, 3); I.ctx.beginPath(); I.ctx.ellipse(wx2, wy2, 2.4, 2.8, 0, 0, TAU); I.ctx.fill();
    I.line3([0.4, 1.7, 0], [0.5, 1.6, 12], 1, '#6b4a2c');
    I.flag(0.3, 0.3, 24, 12);
    I.fire(1, 0.8, 26);
  },
  watchtower(I, st, pc, v, age) {
    I.box(0.08, 0.08, 0.92, 0.92, 0, 4, MAT.stone);
    I.box(0.16, 0.16, 0.84, 0.84, 4, 84, age >= 3 ? MAT.whitestone : MAT.stone);
    const sw = I.faceSW(0.16, 0.84, 0.84, 4, 84), se = I.faceSE(0.16, 0.84, 0.84, 4, 84);
    I.door(sw, 0.5, 0.22, 11);
    I.slit(sw, 0.5, 40); I.slit(sw, 0.5, 62); I.slit(se, 0.5, 50); I.slit(se, 0.5, 70);
    I.box(0.04, 0.04, 0.96, 0.96, 84, 98, MAT.planks);
    for (const u of [0.25, 0.5, 0.75]) I.slit(I.faceSW(0.04, 0.96, 0.96, 84, 98), u, 91, 5);
    I.pyramid(0.04, 0.04, 0.96, 0.96, 98, 124, st.roof === ROOF.thatch ? ROOF.shingle : st.roof, 0.1);
    I.flag(0.5, 0.5, 124, 14);
    I.fire(0.5, 0.5, 90);
  },
  palisade() {},
  stonewall() {},
  siegeworkshop(I, st, pc, v, age) {
    I.groundPatch(0.1, 0.1, 3.9, 3.9, '#6e5638', 0.45);
    I.box(0.25, 0.25, 3.75, 1.9, 0, 36, age >= 3 ? MAT.stone : MAT.planks);
    const sw = I.faceSW(0.25, 3.75, 1.9, 0, 36);
    I.fillS(I.quad(sw, 1.3, 2.7, 0, 24), '#1f150c', '#120b06', 0.8);
    I.window(sw, 0.7, 22, 0.25, 7); I.window(sw, 3.3, 22, 0.25, 7);
    I.window(I.faceSE(0.25, 1.9, 3.75, 0, 36), 1.1, 22, 0.25, 7);
    I.gableX(0.25, 0.25, 3.75, 1.9, 36, 62, age === 0 ? ROOF.thatch : ROOF.shingle, MAT.planks);
    I.flag(3.75, 1.08, 62, 16);
    // crane
    I.post(3.3, 2.9, 0, 44, '#7a5433', 0.07);
    I.line3([3.3, 2.9, 44], [2.5, 2.9, 40], 1.6, '#7a5433');
    I.line3([2.5, 2.9, 40], [2.5, 2.9, 18], 0.5, '#d9c9a0');
    I.block(2.35, 2.8, 2.65, 3.0, 12, 18, '#6b6b6b');
    // half-built ram frame
    I.block(0.6, 2.4, 1.9, 2.55, 0, 4, '#8a6038');
    I.block(0.6, 3.1, 1.9, 3.25, 0, 4, '#8a6038');
    for (const x of [0.7, 1.25, 1.8]) { I.post(x, 2.47, 4, 20, '#8a6038', 0.05); I.post(x, 3.18, 4, 20, '#8a6038', 0.05); I.line3([x, 2.47, 20], [x, 3.18, 20], 1.2, '#7a5433'); }
    I.logPile(2.0, 3.35, 3.1, 2);
    I.fire(1, 1, 45); I.fire(3, 1, 45);
  },
  monastery(I, st, pc, v, age) {
    plinth(I, 3, st);
    const wall = MAT.whitestone;
    I.box(0.35, 0.45, 2.1, 2.6, 4, 36, wall);
    const sw = I.faceSW(0.35, 2.1, 2.6, 4, 36), se = I.faceSE(0.45, 2.6, 2.1, 4, 36);
    I.door(sw, 1.22, 0.36, 16, '#5a3a1e');
    I.window(se, 0.9, 24, 0.14, 11); I.window(se, 1.5, 24, 0.14, 11); I.window(se, 2.1, 24, 0.14, 11);
    I.gableY(0.35, 0.45, 2.1, 2.6, 36, 64, age >= 3 ? ROOF.slate : ROOF.darktile, wall);
    // rose window on the gable
    const [rx, ry] = I.p(1.22, 2.6, 48);
    const c = I.ctx; c.fillStyle = '#3a4a6a'; c.beginPath(); c.arc(rx, ry, 4.5, 0, TAU); c.fill(); c.strokeStyle = '#d8d0b8'; c.lineWidth = 0.8; c.stroke();
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; c.beginPath(); c.moveTo(rx, ry); c.lineTo(rx + Math.cos(a) * 4.5, ry + Math.sin(a) * 4.5); c.stroke(); }
    // bell tower
    I.box(2.2, 1.7, 2.85, 2.45, 4, 70, wall);
    const tsw = I.faceSW(2.2, 2.85, 2.45, 4, 70), tse = I.faceSE(1.7, 2.45, 2.85, 4, 70);
    I.window(tsw, 2.52, 60, 0.18, 10); I.window(tse, 2.07, 60, 0.18, 10);
    I.window(tsw, 2.52, 34, 0.12, 8);
    I.pyramid(2.2, 1.7, 2.85, 2.45, 70, 100, age >= 3 ? ROOF.slate : ROOF.darktile, 0.08);
    const [cx, cy] = I.p(2.525, 2.075, 100);
    c.strokeStyle = '#d8b040'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx, cy - 10); c.moveTo(cx - 3, cy - 7); c.lineTo(cx + 3, cy - 7); c.stroke();
    I.banner(sw, 0.7, 32, 0.2, 10, pc);
    I.fire(1.2, 1.5, 50); I.fire(2.5, 2, 80);
  },
  castle(I, st, pc, v, age) {
    const S = age >= 3 ? MAT.whitestone : MAT.stone;
    const R = age >= 3 ? ROOF.slate : ROOF.darktile;
    I.groundPatch(0.05, 0.05, 3.95, 3.95, '#6a6258', 0.5);
    const T = (x, y, h = 64) => { I.cyl(x, y, 0.42, 0, h, S); I.cylCrenel(x, y, 0.42, h, S); };
    T(0.45, 0.45);
    I.box(0.45, 0.25, 3.55, 0.65, 0, 46, S); I.crenel(0.45, 0.25, 3.55, 0.65, 46, S);
    I.box(0.25, 0.45, 0.65, 3.55, 0, 46, S); I.crenel(0.25, 0.45, 0.65, 3.55, 46, S);
    // keep
    I.box(1.2, 1.2, 2.8, 2.8, 0, 94, S);
    const ksw = I.faceSW(1.2, 2.8, 2.8, 0, 94), kse = I.faceSE(1.2, 2.8, 2.8, 0, 94);
    for (const u of [1.6, 2.0, 2.4]) { I.slit(ksw, u, 70); I.slit(kse, u, 70); }
    I.window(ksw, 2.0, 82, 0.22, 8, true); I.window(kse, 2.0, 82, 0.22, 8);
    I.banner(ksw, 1.55, 62, 0.25, 18, pc); I.banner(ksw, 2.45, 62, 0.25, 18, pc);
    I.crenel(1.2, 1.2, 2.8, 2.8, 94, S, 6);
    I.cyl(2.8, 2.8, 0.22, 94, 108, S); I.cone(2.8, 2.8, 0.3, 108, 128, R);
    I.cyl(1.2, 2.8, 0.2, 94, 104, S); I.cone(1.2, 2.8, 0.27, 104, 120, R);
    I.cyl(2.8, 1.2, 0.2, 94, 104, S); I.cone(2.8, 1.2, 0.27, 104, 120, R);
    I.flag(2.0, 2.0, 100, 26);
    // front walls + gatehouse
    I.box(0.65, 3.35, 3.35, 3.75, 0, 46, S); I.crenel(0.65, 3.35, 3.35, 3.75, 46, S);
    I.box(3.35, 0.65, 3.75, 3.35, 0, 46, S); I.crenel(3.35, 0.65, 3.75, 3.35, 46, S);
    const wsw = I.faceSW(0.65, 3.35, 3.75, 0, 46), wse = I.faceSE(0.65, 3.35, 3.75, 0, 46);
    for (const u of [1.0, 2.9]) I.slit(wsw, u, 30); for (const u of [1.2, 2.2, 2.9]) I.slit(wse, u, 30);
    I.box(1.55, 3.25, 2.45, 3.9, 0, 58, S); I.crenel(1.55, 3.25, 2.45, 3.9, 58, S);
    I.door(I.faceSW(1.55, 2.45, 3.9, 0, 58), 2.0, 0.5, 22, '#3a2412');
    I.banner(I.faceSW(1.55, 2.45, 3.9, 0, 58), 2.0, 54, 0.3, 14, pc);
    T(0.45, 3.55); T(3.55, 0.45);
    T(3.55, 3.55, 68);
    I.flag(3.55, 3.55, 73, 14); I.flag(0.45, 3.55, 69, 12); I.flag(3.55, 0.45, 69, 12);
    I.fire(2, 2, 90); I.fire(1, 3.5, 40); I.fire(3.5, 1, 40); I.fire(2, 3.5, 50);
  },
  wonder(I, st, pc, v, age) {
    const S = MAT.whitestone, R = ROOF.slate, G = ROOF.gold;
    I.box(0.05, 0.05, 4.95, 4.95, 0, 8, S);
    I.box(1.8, 4.95, 3.2, 5.15, 0, 4, S);
    I.cyl(0.8, 0.8, 0.5, 8, 96, S); I.cone(0.8, 0.8, 0.6, 96, 140, R);
    I.box(0.8, 0.8, 4.2, 4.2, 8, 72, S);
    const sw = I.faceSW(0.8, 4.2, 4.2, 8, 72), se = I.faceSE(0.8, 4.2, 4.2, 8, 72);
    I.door(sw, 2.5, 0.7, 28, '#5a3a1e');
    for (const u of [1.3, 1.8, 3.2, 3.7]) { I.window(sw, u, 34, 0.16, 16, true); I.window(sw, u, 58, 0.14, 9); }
    for (const u of [1.3, 1.8, 2.5, 3.2, 3.7]) { I.window(se, u, 34, 0.16, 16); I.window(se, u, 58, 0.14, 9); }
    I.banner(sw, 2.0, 66, 0.3, 22, pc); I.banner(sw, 3.0, 66, 0.3, 22, pc);
    I.line3([0.8, 4.2, 72.5], [4.2, 4.2, 72.5], 1.6, '#d8b040'); I.line3([4.2, 0.8, 72.5], [4.2, 4.2, 72.5], 1.6, '#b08a28');
    I.hip(0.8, 0.8, 4.2, 4.2, 72, 100, R);
    I.box(2.05, 2.05, 2.95, 2.95, 94, 128, S);
    I.window(I.faceSW(2.05, 2.95, 2.95, 94, 128), 2.5, 114, 0.2, 12, true);
    I.window(I.faceSE(2.05, 2.95, 2.95, 94, 128), 2.5, 114, 0.2, 12);
    I.cyl(2.5, 2.5, 0.5, 128, 134, { color: '#d8b040', tex: null });
    I.cone(2.5, 2.5, 0.5, 134, 176, G);
    I.flag(2.5, 2.5, 176, 16);
    I.cyl(0.8, 4.2, 0.5, 8, 96, S); I.cone(0.8, 4.2, 0.6, 96, 140, R);
    I.cyl(4.2, 0.8, 0.5, 8, 96, S); I.cone(4.2, 0.8, 0.6, 96, 140, R);
    I.cyl(4.2, 4.2, 0.5, 8, 96, S); I.cone(4.2, 4.2, 0.6, 96, 140, G);
    I.flag(4.2, 4.2, 140, 14); I.flag(0.8, 4.2, 140, 12); I.flag(4.2, 0.8, 140, 12);
    I.fire(2, 2, 90); I.fire(3, 3, 80); I.fire(2.5, 4, 60); I.fire(4, 2.5, 60);
  },
};

// ---------------------------------------------------------------------------
// Sprite caches
// ---------------------------------------------------------------------------
const bCache = new Map();

function newCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * SS); c.height = Math.ceil(h * SS);
  const ctx = c.getContext('2d');
  ctx.scale(SS, SS);
  return { c, ctx };
}

export function buildingFrame(type) {
  const def = BUILDINGS[type];
  const s = def.size;
  const pad = 10;
  const H = (def.height || 60) + 40;
  const w = s * 64 + pad * 2, h = s * 32 + H + pad;
  return { w, h, ox: s * 32 + pad, oy: H };
}

export function getBuildingSprite(type, pc, age, variant = 0) {
  const key = `${type}|${pc.main}|${age}|${variant}`;
  let s = bCache.get(key);
  if (s) return s;
  const fr = buildingFrame(type);
  const { c, ctx } = newCanvas(fr.w, fr.h);
  const I = new Iso(ctx, fr.ox, fr.oy, 1000 + variant * 17 + age * 3);
  DRAW[type](I, styleFor(age), pc, variant, age);
  s = { c, ox: fr.ox, oy: fr.oy, w: fr.w, h: fr.h, meta: I.meta };
  bCache.set(key, s);
  return s;
}

// Under-construction look: foundation, the building rising from the ground, and scaffolding.
export function getConstructionSprite(type, pc, age, stage) {
  const key = `C|${type}|${pc.main}|${age}|${stage}`;
  let s = bCache.get(key);
  if (s) return s;
  const def = BUILDINGS[type];
  const fr = buildingFrame(type);
  const full = getBuildingSprite(type, pc, age, 0);
  const { c, ctx } = newCanvas(fr.w, fr.h);
  const I = new Iso(ctx, fr.ox, fr.oy, 77 + stage);
  const n = def.size;
  // foundation dirt + stone outline
  I.fill3([[0.05, 0.05, 0], [n - 0.05, 0.05, 0], [n - 0.05, n - 0.05, 0], [0.05, n - 0.05, 0]], '#8a7152', 'rgba(60,45,30,0.8)', 1);
  for (let i = 0; i < n * 7; i++) {
    const side = i % 4, t = I.r() * n;
    const [x, y] = side === 0 ? [t, 0.1] : side === 1 ? [n - 0.1, t] : side === 2 ? [t, n - 0.1] : [0.1, t];
    const [X, Y] = I.p(x, y, 0);
    ctx.fillStyle = shade('#a39c8c', (I.r() - 0.5) * 0.3); ctx.beginPath(); ctx.ellipse(X, Y, 2.5, 1.6, 0, 0, TAU); ctx.fill();
  }
  if (stage > 0) {
    const bottom = fr.oy + n * 32;
    const topY = 10;
    const f = stage / 4;
    const cut = bottom - (bottom - topY) * f;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, cut, fr.w, fr.h - cut); ctx.clip();
    ctx.drawImage(full.c, 0, 0, fr.w, fr.h);
    ctx.restore();
    // scaffolding
    const zTop = Math.max(10, ((def.height || 60) * f) * 0.9);
    const poles = [[0.1, n - 0.1], [n - 0.1, n - 0.1], [n - 0.1, 0.1], [n / 2, n - 0.05], [n - 0.05, n / 2]];
    for (const [x, y] of poles) I.line3([x, y, 0], [x, y, zTop + 4], 1.2, '#8a6a40');
    for (let z = 10; z < zTop; z += 12) {
      I.line3([0.1, n - 0.1, z], [n - 0.1, n - 0.1, z], 1.4, '#9a7a4a');
      I.line3([n - 0.1, n - 0.1, z], [n - 0.1, 0.1, z], 1.4, '#7a5a3a');
    }
  } else {
    // stakes and a lumber pile
    for (const [x, y] of [[0.15, 0.15], [n - 0.15, 0.15], [0.15, n - 0.15], [n - 0.15, n - 0.15]]) I.line3([x, y, 0], [x, y, 9], 1.4, '#7a5a3a');
    if (n >= 2) I.logPile(n * 0.3, n * 0.55, n * 0.65, 2);
  }
  s = { c, ox: fr.ox, oy: fr.oy, w: fr.w, h: fr.h, meta: { flags: [], smoke: [], fire: full.meta.fire } };
  bCache.set(key, s);
  return s;
}

// Walls: mask bits N=1 E=2 S=4 W=8
export function getWallSprite(type, pc, mask, complete = true) {
  const key = `W|${type}|${pc.main}|${mask}|${complete ? 1 : 0}`;
  let s = bCache.get(key);
  if (s) return s;
  const H = 70, pad = 10;
  const w = 64 + pad * 2, h = 32 + H + pad;
  const { c, ctx } = newCanvas(w, h);
  const I = new Iso(ctx, 32 + pad, H, 5 + mask);
  if (!complete) ctx.globalAlpha = 0.55;
  if (type === 'palisade') {
    const stakes = [[0.5, 0.5]];
    const add = (dx, dy) => { for (let t = 0.17; t <= 0.52; t += 0.17) stakes.push([0.5 + dx * t, 0.5 + dy * t]); };
    if (mask & 1) add(0, -1); if (mask & 2) add(1, 0); if (mask & 4) add(0, 1); if (mask & 8) add(-1, 0);
    if (!mask) { stakes.push([0.35, 0.5], [0.65, 0.5]); }
    stakes.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
    for (const [x, y] of stakes) {
      const [X, Y] = I.p(x, y, 0);
      const hh = 30 + ((x * 13 + y * 7) % 1) * 6;
      const g = ctx.createLinearGradient(X - 2, 0, X + 2, 0);
      g.addColorStop(0, '#a07a4c'); g.addColorStop(1, '#5e4228');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(X - 2.2, Y); ctx.lineTo(X - 2.2, Y - hh); ctx.lineTo(X, Y - hh - 4); ctx.lineTo(X + 2.2, Y - hh); ctx.lineTo(X + 2.2, Y); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#3a2716'; ctx.lineWidth = 0.4; ctx.stroke();
    }
  } else {
    const S = MAT.stone, h1 = 40;
    const seg = (x0, y0, x1, y1) => { I.box(x0, y0, x1, y1, 0, h1, S); I.crenel(x0, y0, x1, y1, h1, S, 5); };
    if (mask & 1) seg(0.28, 0, 0.72, 0.28);
    if (mask & 8) seg(0, 0.28, 0.28, 0.72);
    seg(0.24, 0.24, 0.76, 0.76);
    if (mask & 2) seg(0.72, 0.28, 1, 0.72);
    if (mask & 4) seg(0.28, 0.72, 0.72, 1);
  }
  ctx.globalAlpha = 1;
  s = { c, ox: 32 + pad, oy: H, w, h, meta: { flags: [], smoke: [], fire: [] } };
  bCache.set(key, s);
  return s;
}

export function getFarmSprite(stage, variant = 0, complete = true) {
  const key = `F|${stage}|${variant}|${complete ? 1 : 0}`;
  let s = bCache.get(key);
  if (s) return s;
  const pad = 6;
  const w = 192 + pad * 2, h = 96 + 30 + pad;
  const { c, ctx } = newCanvas(w, h);
  const I = new Iso(ctx, 96 + pad, 28, 300 + stage * 7 + variant);
  const n = 3;
  I.fill3([[0.06, 0.06, 0], [n - 0.06, 0.06, 0], [n - 0.06, n - 0.06, 0], [0.06, n - 0.06, 0]], '#6d4f30', 'rgba(60,40,20,0.9)', 1.2);
  // furrows
  ctx.save();
  I.pathS([I.p(0.1, 0.1), I.p(n - 0.1, 0.1), I.p(n - 0.1, n - 0.1), I.p(0.1, n - 0.1)]); ctx.clip();
  for (let y = 0.15; y < n; y += 0.2) {
    I.line3([0.1, y, 0], [n - 0.1, y, 0], 2.2, '#5a3f24');
    I.line3([0.1, y + 0.08, 0], [n - 0.1, y + 0.08, 0], 1.2, '#86633e');
  }
  if (complete) {
    const crop = stage === 2 ? ['#d9b44a', '#e7c65a', '#c49a32'] : stage === 1 ? ['#6d9c3a', '#86b048', '#5a8a30'] : ['#a08850', '#8a7440', '#b09a60'];
    for (let y = 0.2; y < n - 0.1; y += 0.2) {
      for (let x = 0.15; x < n - 0.1; x += 0.13) {
        const [X, Y] = I.p(x + (I.r() - 0.5) * 0.05, y, 0);
        const hgt = stage === 2 ? 7 + I.r() * 3 : stage === 1 ? 4 + I.r() * 2 : 1.5 + I.r();
        ctx.strokeStyle = crop[Math.floor(I.r() * 3)]; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(X - 0.8, Y); ctx.lineTo(X - 1.3, Y - hgt); ctx.moveTo(X, Y); ctx.lineTo(X, Y - hgt - 0.5); ctx.moveTo(X + 0.8, Y); ctx.lineTo(X + 1.3, Y - hgt); ctx.stroke();
        if (stage === 2) { ctx.fillStyle = '#f0d270'; ctx.fillRect(X - 0.7, Y - hgt - 1.6, 1.4, 2); }
      }
    }
  }
  ctx.restore();
  if (complete && variant % 3 === 0) {
    // scarecrow
    I.line3([2.4, 0.6, 0], [2.4, 0.6, 20], 1.2, '#6b4a2c');
    I.line3([2.3, 0.6, 15], [2.5, 0.6, 15], 1.2, '#6b4a2c');
    const [X, Y] = I.p(2.4, 0.6, 20); ctx.fillStyle = '#e0c890'; ctx.beginPath(); ctx.arc(X, Y - 2, 2.5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#7a4a2a'; ctx.fillRect(X - 3.5, Y - 5, 7, 1.5); ctx.fillRect(X - 2, Y - 7, 4, 2.5);
  }
  s = { c, ox: 96 + pad, oy: 28, w, h, meta: { flags: [], smoke: [], fire: [] } };
  bCache.set(key, s);
  return s;
}

export function getRubbleSprite(size, variant = 0) {
  const key = `R|${size}|${variant}`;
  let s = bCache.get(key);
  if (s) return s;
  const pad = 8;
  const w = size * 64 + pad * 2, h = size * 32 + 20 + pad;
  const { c, ctx } = newCanvas(w, h);
  const I = new Iso(ctx, size * 32 + pad, 16, 900 + size * 11 + variant);
  I.fill3([[0.1, 0.1, 0], [size - 0.1, 0.1, 0], [size - 0.1, size - 0.1, 0], [0.1, size - 0.1, 0]], 'rgba(40,32,26,0.75)');
  for (let i = 0; i < size * size * 10; i++) {
    const x = 0.2 + I.r() * (size - 0.4), y = 0.2 + I.r() * (size - 0.4);
    const [X, Y] = I.p(x, y, 0);
    if (I.r() < 0.3) {
      ctx.strokeStyle = I.r() < 0.5 ? '#3a2a1c' : '#5a4028'; ctx.lineWidth = 1.6;
      const a = I.r() * TAU; ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X + Math.cos(a) * 7, Y + Math.sin(a) * 3.5); ctx.stroke();
    } else {
      ctx.fillStyle = shade('#8f877a', (I.r() - 0.5) * 0.5);
      ctx.beginPath(); ctx.ellipse(X, Y - 1, 1.5 + I.r() * 2.5, 1 + I.r() * 1.5, 0, 0, TAU); ctx.fill();
    }
  }
  s = { c, ox: size * 32 + pad, oy: 16, w, h };
  bCache.set(key, s);
  return s;
}

// ---------------------------------------------------------------------------
// Trees, mines, bushes, decorations
// ---------------------------------------------------------------------------
const rCache = new Map();

function blob(ctx, x, y, r, c0, c1) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, c0); g.addColorStop(1, c1);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}

export function getTreeSprite(pine, variant, felled) {
  const key = `T|${pine ? 1 : 0}|${variant}|${felled ? 1 : 0}`;
  let s = rCache.get(key);
  if (s) return s;
  const w = 64, h = 84, ox = 32, oy = 74;
  const { c, ctx } = newCanvas(w, h);
  ctx.translate(ox, oy);
  const rng = new RNG(variant * 131 + (pine ? 7 : 3));
  if (felled) {
    // stump + fallen log
    ctx.fillStyle = '#6b4a2c'; ctx.beginPath(); ctx.ellipse(0, -2, 4.5, 2.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#5a3d24'; ctx.fillRect(-4.5, -5, 9, 3);
    ctx.fillStyle = '#d6b07a'; ctx.beginPath(); ctx.ellipse(0, -5, 4.5, 2.2, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#a07a48'; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.ellipse(0, -5, 2.5, 1.2, 0, 0, TAU); ctx.stroke();
    ctx.save(); ctx.rotate(-0.35);
    const g = ctx.createLinearGradient(0, -7, 0, 0);
    g.addColorStop(0, '#8a6038'); g.addColorStop(1, '#4e3620');
    ctx.fillStyle = g; ctx.fillRect(4, -6, 24, 6.5);
    ctx.fillStyle = '#d6b07a'; ctx.beginPath(); ctx.ellipse(4, -2.75, 1.8, 3.25, 0, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.fillStyle = pine ? '#2f5a30' : '#46742e';
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(20 + rng.next() * 8, -10 + rng.next() * 6 - i, 3 + rng.next() * 2, 0, TAU); ctx.fill(); }
  } else if (pine) {
    const hgt = 56 + rng.next() * 12, wd = 16 + rng.next() * 4;
    ctx.fillStyle = '#4e3522'; ctx.fillRect(-1.8, -12, 3.6, 12);
    const layers = 5;
    const base = ['#244a28', '#2c5a30', '#35663a'][variant % 3];
    for (let i = 0; i < layers; i++) {
      const f = i / layers;
      const y0 = -8 - f * (hgt - 14), y1 = y0 - (hgt - 8) / layers * 1.6;
      const ww = wd * (1 - f * 0.78);
      const g = ctx.createLinearGradient(-ww, 0, ww, 0);
      g.addColorStop(0, shade(base, 0.25)); g.addColorStop(0.5, base); g.addColorStop(1, shade(base, -0.35));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(-ww, y0);
      const teeth = 5;
      for (let k = 0; k <= teeth; k++) { const x = -ww + (2 * ww * k) / teeth; ctx.lineTo(x, y0 + (k % 2 ? -1.5 : 1.5)); }
      ctx.lineTo(0, y1); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(10,30,10,0.35)'; ctx.lineWidth = 0.5; ctx.stroke();
    }
    for (let i = 0; i < 30; i++) {
      const y = -10 - rng.next() * (hgt - 16), f = (-y - 8) / hgt, ww = wd * (1 - f * 0.8);
      ctx.fillStyle = rng.next() < 0.5 ? 'rgba(120,170,90,0.35)' : 'rgba(10,30,10,0.3)';
      ctx.fillRect((rng.next() * 2 - 1) * ww * 0.8, y, 1.5, 1);
    }
  } else {
    const hgt = 50 + rng.next() * 12, rr = 16 + rng.next() * 5;
    const lean = (rng.next() - 0.5) * 3;
    ctx.strokeStyle = '#4e3522'; ctx.lineWidth = 4.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(lean, -hgt * 0.3, lean * 1.5, -hgt * 0.55); ctx.stroke();
    ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(lean, -hgt * 0.35); ctx.lineTo(lean + 6, -hgt * 0.5); ctx.stroke();
    const greens = [['#5a8c3a', '#2e5222'], ['#679a3e', '#355c24'], ['#4f8234', '#284a1c'], ['#78a444', '#3f6526'], ['#6a8e38', '#34521e'], ['#5c9440', '#2a5020']][variant % 6];
    const cy = -hgt + rr * 0.9;
    const blobs = [];
    for (let i = 0; i < 16; i++) {
      const a = rng.next() * TAU, d = rng.next() * rr * 0.72;
      blobs.push([lean * 1.5 + Math.cos(a) * d * 1.1, cy + Math.sin(a) * d * 0.9, rr * (0.36 + rng.next() * 0.22)]);
    }
    blobs.sort((a, b) => a[1] - b[1]);
    for (const [x, y, r] of blobs) blob(ctx, x + 1.5, y + 1.5, r, greens[1], shade(greens[1], -0.3));
    for (const [x, y, r] of blobs) blob(ctx, x, y, r, shade(greens[0], 0.18), greens[1]);
    for (let i = 0; i < 45; i++) {
      const a = rng.next() * TAU, d = rng.next() * rr;
      const x = lean * 1.5 + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.85;
      ctx.fillStyle = y < cy ? 'rgba(200,230,140,0.35)' : 'rgba(10,30,5,0.3)';
      ctx.beginPath(); ctx.arc(x, y, 0.9 + rng.next(), 0, TAU); ctx.fill();
    }
  }
  s = { c, ox, oy, w, h };
  rCache.set(key, s);
  return s;
}

export function getMineSprite(kind, variant, level) {
  const key = `M|${kind}|${variant}|${level}`;
  let s = rCache.get(key);
  if (s) return s;
  const w = 64, h = 44, ox = 32, oy = 32;
  const { c, ctx } = newCanvas(w, h);
  ctx.translate(ox, oy);
  const rng = new RNG(variant * 97 + (kind === 'gold' ? 1 : 2) * 13);
  const rocks = 2 + level + (variant % 2);
  const base = kind === 'gold' ? '#8f8270' : '#9a9da3';
  for (let i = 0; i < rocks; i++) {
    const cx = (rng.next() - 0.5) * 22, cy = (rng.next() - 0.5) * 8 - 2;
    const r = (5 + rng.next() * 5) * (0.6 + level * 0.2);
    const pts = [];
    const n = 7;
    for (let k = 0; k < n; k++) { const a = (k / n) * TAU; const rr = r * (0.75 + rng.next() * 0.35); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.62 - (Math.sin(a) < 0 ? r * 0.5 : 0)]); }
    const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r * 0.6);
    g.addColorStop(0, shade(base, 0.3)); g.addColorStop(0.5, base); g.addColorStop(1, shade(base, -0.4));
    ctx.fillStyle = g; ctx.beginPath(); pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(30,25,20,0.55)'; ctx.lineWidth = 0.6; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.moveTo(pts[3][0], pts[3][1]); ctx.lineTo(pts[4][0], pts[4][1]); ctx.lineTo(pts[5][0], pts[5][1]); ctx.stroke();
    if (kind === 'gold') {
      for (let k = 0; k < 3 + level; k++) {
        const nx = cx + (rng.next() - 0.5) * r * 1.2, ny = cy - r * 0.2 + (rng.next() - 0.5) * r * 0.7;
        const nr = 1.4 + rng.next() * 1.6;
        ctx.fillStyle = '#b8860b'; ctx.beginPath(); ctx.moveTo(nx - nr, ny); ctx.lineTo(nx - nr * 0.2, ny - nr); ctx.lineTo(nx + nr, ny - nr * 0.3); ctx.lineTo(nx + nr * 0.4, ny + nr * 0.7); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffd84a'; ctx.beginPath(); ctx.moveTo(nx - nr * 0.6, ny - nr * 0.1); ctx.lineTo(nx - nr * 0.1, ny - nr * 0.8); ctx.lineTo(nx + nr * 0.6, ny - nr * 0.3); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff8c0'; ctx.fillRect(nx - 0.4, ny - nr * 0.6, 0.8, 0.8);
      }
    } else {
      for (let k = 0; k < 3; k++) {
        const nx = cx + (rng.next() - 0.5) * r, ny = cy - r * 0.3 + (rng.next() - 0.5) * r * 0.5;
        ctx.strokeStyle = 'rgba(60,62,66,0.6)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(nx - 2, ny); ctx.lineTo(nx + 2, ny + 1); ctx.stroke();
        ctx.fillStyle = 'rgba(220,225,235,0.35)'; ctx.beginPath(); ctx.moveTo(nx - 2, ny - 1); ctx.lineTo(nx + 1, ny - 2.5); ctx.lineTo(nx + 2, ny - 0.8); ctx.closePath(); ctx.fill();
      }
    }
  }
  s = { c, ox, oy, w, h };
  rCache.set(key, s);
  return s;
}

export function getBerrySprite(variant, level) {
  const key = `B|${variant}|${level}`;
  let s = rCache.get(key);
  if (s) return s;
  const w = 48, h = 40, ox = 24, oy = 30;
  const { c, ctx } = newCanvas(w, h);
  ctx.translate(ox, oy);
  const rng = new RNG(variant * 53 + 9);
  const blobs = [];
  for (let i = 0; i < 9; i++) blobs.push([(rng.next() - 0.5) * 16, -6 - rng.next() * 9, 4 + rng.next() * 3.5]);
  blobs.sort((a, b) => a[1] - b[1]);
  for (const [x, y, r] of blobs) blob(ctx, x, y, r, '#5f9a3e', '#2a5a22');
  const berries = level * 6;
  for (let i = 0; i < berries; i++) {
    const x = (rng.next() - 0.5) * 18, y = -4 - rng.next() * 12;
    ctx.fillStyle = rng.next() < 0.5 ? '#c42a48' : '#8e1e3a';
    ctx.beginPath(); ctx.arc(x, y, 1.3, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(x - 0.6, y - 0.8, 0.6, 0.6);
  }
  s = { c, ox, oy, w, h };
  rCache.set(key, s);
  return s;
}

export function getDecorSprite(kind, v) {
  const key = `D|${kind}|${v}`;
  let s = rCache.get(key);
  if (s) return s;
  const w = 24, h = 20, ox = 12, oy = 16;
  const { c, ctx } = newCanvas(w, h);
  ctx.translate(ox, oy);
  const rng = new RNG(v * 31 + kind.length * 7);
  switch (kind) {
    case 'tuft':
      for (let i = 0; i < 7; i++) {
        const x = (rng.next() - 0.5) * 8;
        ctx.strokeStyle = rng.next() < 0.5 ? '#4e7c2a' : '#86a846'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.quadraticCurveTo(x + 0.5, -3, x + (rng.next() - 0.5) * 4, -4 - rng.next() * 3); ctx.stroke();
      }
      break;
    case 'flower': {
      const col = ['#f2e05a', '#f4f0e8', '#c77ad8', '#e8584a'][v % 4];
      for (let i = 0; i < 4; i++) {
        const x = (rng.next() - 0.5) * 9, y = (rng.next() - 0.5) * 3;
        ctx.strokeStyle = '#4e7c2a'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 3); ctx.stroke();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y - 3.3, 1.1, 0, TAU); ctx.fill();
      }
      break;
    }
    case 'bush':
      for (let i = 0; i < 5; i++) blob(ctx, (rng.next() - 0.5) * 8, -2.5 - rng.next() * 3, 2.5 + rng.next() * 1.5, '#5f8e38', '#2e5020');
      break;
    case 'rock':
      ctx.fillStyle = '#8d8a84'; ctx.beginPath(); ctx.ellipse(0, -1.5, 3.5, 2.2, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#b0ada6'; ctx.beginPath(); ctx.ellipse(-0.8, -2.4, 2, 1.1, 0, 0, TAU); ctx.fill();
      break;
    case 'pebble':
      for (let i = 0; i < 3; i++) { ctx.fillStyle = shade('#9a9082', (rng.next() - 0.5) * 0.4); ctx.beginPath(); ctx.ellipse((rng.next() - 0.5) * 8, (rng.next() - 0.5) * 3, 1.2, 0.8, 0, 0, TAU); ctx.fill(); }
      break;
    case 'reed':
      for (let i = 0; i < 6; i++) {
        const x = (rng.next() - 0.5) * 7;
        ctx.strokeStyle = rng.next() < 0.5 ? '#8a9a4a' : '#6a7a36'; ctx.lineWidth = 0.7;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (rng.next() - 0.5) * 2, -6 - rng.next() * 4); ctx.stroke();
      }
      break;
  }
  s = { c, ox, oy, w, h };
  rCache.set(key, s);
  return s;
}
