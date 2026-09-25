// Procedural art: buildings (cached), trees & resources (cached), units & animals (drawn live).
import { shade, rgba, hash2, mulberry32 } from './util.js';

const S = 2; // cache resolution multiplier
const cache = new Map();

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * S); c.height = Math.ceil(h * S);
  const ctx = c.getContext('2d');
  ctx.scale(S, S);
  return [c, ctx];
}
export function cached(key, w, h, ax, ay, draw) {
  let s = cache.get(key);
  if (!s) {
    const [c, ctx] = makeCanvas(w, h);
    ctx.translate(ax, ay);
    draw(ctx);
    s = { c, w, h, ax, ay };
    cache.set(key, s);
  }
  return s;
}
export function blit(ctx, s, x, y, zoom, alpha = 1) {
  if (alpha !== 1) ctx.globalAlpha = alpha;
  ctx.drawImage(s.c, x - s.ax * zoom, y - s.ay * zoom, s.w * zoom, s.h * zoom);
  if (alpha !== 1) ctx.globalAlpha = 1;
}

// ---------------- iso helpers (tile offsets relative to footprint center) ----------------
const P = (dx, dy, z = 0) => [(dx - dy) * 32, (dx + dy) * 16 - z];
function poly(ctx, pts, fill, stroke, lw = 0.8) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
function line(ctx, a, b, col, lw = 1) {
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
  ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke();
}
function shadowDiamond(ctx, x0, y0, x1, y1, a = 0.28, grow = 0.25) {
  poly(ctx, [P(x0, y0), P(x1 + grow, y0), P(x1 + grow, y1 + grow), P(x0, y1 + grow)], `rgba(0,0,0,${a})`);
}

const MAT = {
  stone: { top: '#c3bba9', l: '#aba390', r: '#857d6c', line: 'rgba(60,50,40,0.35)' },
  darkstone: { top: '#9a978f', l: '#8a877e', r: '#67645d', line: 'rgba(30,30,30,0.35)' },
  plaster: { top: '#e7dab8', l: '#eadfc3', r: '#c7b894', line: 'rgba(80,60,30,0.2)' },
  wood: { top: '#a4743f', l: '#9a6a3a', r: '#74502b', line: 'rgba(40,20,5,0.4)' },
  thatch: { top: '#d0a650', l: '#c49a45', r: '#9c7632', line: 'rgba(90,60,20,0.35)' },
  redroof: { top: '#b85538', l: '#b24c32', r: '#86341f', line: 'rgba(60,15,5,0.35)' },
  slate: { top: '#6f7888', l: '#6a7384', r: '#4c5361', line: 'rgba(20,25,35,0.4)' },
};

// box with faces: +y face (screen-left) and +x face (screen-right), plus top
function box(ctx, x0, y0, x1, y1, z0, z1, m, tex) {
  const L = [P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)];
  const R = [P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)];
  const Tp = [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)];
  poly(ctx, L, m.l);
  poly(ctx, R, m.r);
  if (tex) faceTexture(ctx, x0, y0, x1, y1, z0, z1, tex, m);
  poly(ctx, Tp, m.top);
  // edge highlights
  line(ctx, P(x1, y1, z0), P(x1, y1, z1), 'rgba(0,0,0,0.25)', 0.7);
  line(ctx, P(x0, y1, z1), P(x1, y1, z1), 'rgba(255,255,255,0.18)', 0.7);
  line(ctx, P(x1, y0, z1), P(x1, y1, z1), 'rgba(255,255,255,0.1)', 0.7);
}
function faceTexture(ctx, x0, y0, x1, y1, z0, z1, tex, m) {
  ctx.save();
  if (tex === 'stone') {
    const rows = Math.max(1, Math.round((z1 - z0) / 4.5));
    for (let i = 1; i < rows; i++) {
      const z = z0 + (z1 - z0) * i / rows;
      line(ctx, P(x0, y1, z), P(x1, y1, z), m.line, 0.5);
      line(ctx, P(x1, y0, z), P(x1, y1, z), m.line, 0.5);
      const off = (i % 2) * 0.5;
      const zz = z0 + (z1 - z0) * (i - 1) / rows;
      for (let s = off; s < (x1 - x0) / 0.35; s++) {
        const x = x0 + s * 0.35; if (x >= x1) break;
        line(ctx, P(x, y1, zz), P(x, y1, z), m.line, 0.4);
      }
      for (let s = off; s < (y1 - y0) / 0.35; s++) {
        const y = y0 + s * 0.35; if (y >= y1) break;
        line(ctx, P(x1, y, zz), P(x1, y, z), m.line, 0.4);
      }
    }
  } else if (tex === 'plank') {
    for (let x = x0 + 0.12; x < x1; x += 0.18) line(ctx, P(x, y1, z0), P(x, y1, z1), m.line, 0.5);
    for (let y = y0 + 0.12; y < y1; y += 0.18) line(ctx, P(x1, y, z0), P(x1, y, z1), m.line, 0.5);
  } else if (tex === 'timber') {
    const tc = '#5b3a1f';
    line(ctx, P(x0, y1, z0 + 1), P(x1, y1, z0 + 1), tc, 1.6);
    line(ctx, P(x0, y1, z1 - 1), P(x1, y1, z1 - 1), tc, 1.6);
    line(ctx, P(x1, y0, z0 + 1), P(x1, y1, z0 + 1), tc, 1.6);
    line(ctx, P(x1, y0, z1 - 1), P(x1, y1, z1 - 1), tc, 1.6);
    const nx = Math.max(2, Math.round((x1 - x0) / 0.45));
    for (let i = 0; i <= nx; i++) { const x = x0 + (x1 - x0) * i / nx; line(ctx, P(x, y1, z0), P(x, y1, z1), tc, 1.3); }
    const ny = Math.max(2, Math.round((y1 - y0) / 0.45));
    for (let i = 0; i <= ny; i++) { const y = y0 + (y1 - y0) * i / ny; line(ctx, P(x1, y, z0), P(x1, y, z1), tc, 1.3); }
    for (let i = 0; i < nx; i += 2) { const xa = x0 + (x1 - x0) * i / nx, xb = x0 + (x1 - x0) * (i + 1) / nx; line(ctx, P(xa, y1, z0), P(xb, y1, z1), tc, 1); }
    for (let i = 1; i < ny; i += 2) { const ya = y0 + (y1 - y0) * i / ny, yb = y0 + (y1 - y0) * (i + 1) / ny; line(ctx, P(x1, ya, z1), P(x1, yb, z0), tc, 1); }
  }
  ctx.restore();
}
function roofLines(ctx, pts, col, n = 7, vertical = false) {
  ctx.save();
  poly(ctx, pts);
  ctx.clip();
  const [a, b, c, d] = pts;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const p1 = [a[0] + (d[0] - a[0]) * t, a[1] + (d[1] - a[1]) * t];
    const p2 = [b[0] + (c[0] - b[0]) * t, b[1] + (c[1] - b[1]) * t];
    line(ctx, p1, p2, col, 0.6);
  }
  ctx.restore();
}
// gable roof; axis 'x' => ridge runs along x
function gable(ctx, x0, y0, x1, y1, z, R, m, axis = 'x', ov = 0.1, wallM) {
  if (axis === 'x') {
    const ym = (y0 + y1) / 2;
    const back = [P(x0 - ov, y0 - ov, z - 1), P(x1 + ov, y0 - ov, z - 1), P(x1 + ov, ym, z + R), P(x0 - ov, ym, z + R)];
    const front = [P(x0 - ov, y1 + ov, z - 1), P(x1 + ov, y1 + ov, z - 1), P(x1 + ov, ym, z + R), P(x0 - ov, ym, z + R)];
    poly(ctx, back, m.top);
    poly(ctx, [P(x1, y0, z), P(x1, y1, z), P(x1, ym, z + R)], (wallM || m).r);
    poly(ctx, front, m.l);
    roofLines(ctx, [front[0], front[1], front[2], front[3]], m.line, 6);
    poly(ctx, [P(x1 + ov, y0 - ov, z - 1), P(x1 + ov, y1 + ov, z - 1), P(x1 + ov, ym, z + R)], null, 'rgba(0,0,0,0.35)', 0.8);
    line(ctx, P(x0 - ov, ym, z + R), P(x1 + ov, ym, z + R), 'rgba(255,255,255,0.25)', 1);
  } else {
    const xm = (x0 + x1) / 2;
    const back = [P(x0 - ov, y0 - ov, z - 1), P(x0 - ov, y1 + ov, z - 1), P(xm, y1 + ov, z + R), P(xm, y0 - ov, z + R)];
    const front = [P(x1 + ov, y0 - ov, z - 1), P(x1 + ov, y1 + ov, z - 1), P(xm, y1 + ov, z + R), P(xm, y0 - ov, z + R)];
    poly(ctx, back, m.top);
    poly(ctx, [P(x0, y1, z), P(x1, y1, z), P(xm, y1, z + R)], (wallM || m).l);
    poly(ctx, front, m.r);
    roofLines(ctx, [front[0], front[1], front[2], front[3]], m.line, 6);
    line(ctx, P(xm, y0 - ov, z + R), P(xm, y1 + ov, z + R), 'rgba(255,255,255,0.25)', 1);
  }
}
function pyramid(ctx, x0, y0, x1, y1, z, R, m, ov = 0.1) {
  const xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
  const A = P(xm, ym, z + R);
  const c00 = P(x0 - ov, y0 - ov, z - 1), c10 = P(x1 + ov, y0 - ov, z - 1), c11 = P(x1 + ov, y1 + ov, z - 1), c01 = P(x0 - ov, y1 + ov, z - 1);
  poly(ctx, [c00, c10, A], m.top);
  poly(ctx, [c00, c01, A], m.top);
  poly(ctx, [c10, c11, A], m.r);
  poly(ctx, [c01, c11, A], m.l);
  ctx.save(); poly(ctx, [c01, c11, A]); ctx.clip();
  for (let i = 1; i < 6; i++) { const t = i / 6; line(ctx, [c01[0] + (A[0] - c01[0]) * t, c01[1] + (A[1] - c01[1]) * t], [c11[0] + (A[0] - c11[0]) * t, c11[1] + (A[1] - c11[1]) * t], m.line, 0.6); }
  ctx.restore();
  line(ctx, c11, A, 'rgba(255,255,255,0.2)', 0.8);
}
function cylinder(ctx, cx, cy, r, z0, z1, m, crenel = false, tex = true) {
  const [sx, sy] = P(cx, cy, 0);
  const rx = r * 45.25, ry = r * 22.6;
  const g = ctx.createLinearGradient(sx - rx, 0, sx + rx, 0);
  g.addColorStop(0, m.l); g.addColorStop(0.45, m.top); g.addColorStop(1, m.r);
  ctx.beginPath();
  ctx.ellipse(sx, sy - z0, rx, ry, 0, 0, Math.PI);
  ctx.lineTo(sx - rx, sy - z1);
  ctx.ellipse(sx, sy - z1, rx, ry, 0, Math.PI, 0, true);
  ctx.closePath();
  ctx.fillStyle = g; ctx.fill();
  if (tex) {
    ctx.save(); ctx.clip();
    for (let z = z0 + 4; z < z1; z += 4.5) {
      ctx.beginPath(); ctx.ellipse(sx, sy - z, rx, ry, 0, 0, Math.PI);
      ctx.strokeStyle = m.line; ctx.lineWidth = 0.5; ctx.stroke();
    }
    ctx.restore();
  }
  ctx.beginPath(); ctx.ellipse(sx, sy - z1, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = shade('#c3bba9', -0.05); ctx.fill();
  if (crenel) {
    for (let a = 0.15; a < Math.PI; a += 0.5) {
      const x = sx + Math.cos(a) * rx, y = sy - z1 + Math.sin(a) * ry;
      ctx.fillStyle = a < Math.PI / 2 ? m.r : m.l;
      ctx.fillRect(x - 2.2, y - 4, 4.4, 4.5);
    }
    for (let a = Math.PI + 0.3; a < Math.PI * 2; a += 0.55) {
      const x = sx + Math.cos(a) * rx, y = sy - z1 + Math.sin(a) * ry;
      ctx.fillStyle = m.top; ctx.fillRect(x - 2, y - 4, 4, 4);
    }
  }
}
function cone(ctx, cx, cy, r, z, h, m) {
  const [sx, sy] = P(cx, cy, 0);
  const rx = r * 45.25, ry = r * 22.6;
  const g = ctx.createLinearGradient(sx - rx, 0, sx + rx, 0);
  g.addColorStop(0, m.l); g.addColorStop(0.5, m.top); g.addColorStop(1, m.r);
  ctx.beginPath();
  ctx.moveTo(sx - rx, sy - z);
  ctx.ellipse(sx, sy - z, rx, ry, 0, Math.PI, 0, true);
  ctx.lineTo(sx, sy - z - h);
  ctx.closePath();
  ctx.fillStyle = g; ctx.fill();
}
function flag(ctx, x, y, h, color, wave = 0, big = 1) {
  line(ctx, [x, y], [x, y - h], '#3b2a1a', 1.2);
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  const w = 11 * big, fh = 7 * big;
  ctx.quadraticCurveTo(x + w * 0.5, y - h - 2 + wave, x + w, y - h + 1);
  ctx.lineTo(x + w, y - h + fh);
  ctx.quadraticCurveTo(x + w * 0.5, y - h + fh - 2 + wave, x, y - h + fh);
  ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.5; ctx.stroke();
}
function banner(ctx, pt, color, h = 10) {
  const [x, y] = pt;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(x - 2.5, y); ctx.lineTo(x + 2.5, y); ctx.lineTo(x + 2.5, y + h); ctx.lineTo(x, y + h - 2.5); ctx.lineTo(x - 2.5, y + h); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,230,120,0.8)'; ctx.fillRect(x - 0.8, y + 2, 1.6, 3);
}
function doorL(ctx, x, y1, w, h, col = '#3a2412') {
  // door on +y face at tile x
  poly(ctx, [P(x - w / 2, y1, 0), P(x + w / 2, y1, 0), P(x + w / 2, y1, h), P(x - w / 2, y1, h)], col);
}
function windowR(ctx, x1, y, z, w = 0.12, h = 5) {
  poly(ctx, [P(x1, y - w, z), P(x1, y + w, z), P(x1, y + w, z + h), P(x1, y - w, z + h)], '#2a1c10');
}
function windowL(ctx, x, y1, z, w = 0.12, h = 5) {
  poly(ctx, [P(x - w, y1, z), P(x + w, y1, z), P(x + w, y1, z + h), P(x - w, y1, z + h)], '#2a1c10');
}

function groundPad(ctx, w, h, col = 'rgba(120,95,60,0.55)') {
  const hw = w / 2, hh = h / 2;
  poly(ctx, [P(-hw, -hh), P(hw, -hh), P(hw, hh), P(-hw, hh)], col);
}

// ---------------- building sprite painters ----------------
const B = {
  house(ctx, c) {
    groundPad(ctx, 1.9, 1.9);
    shadowDiamond(ctx, -0.7, -0.7, 0.7, 0.7);
    box(ctx, -0.72, -0.62, 0.62, 0.62, 0, 4, MAT.stone, 'stone');
    box(ctx, -0.7, -0.6, 0.6, 0.6, 4, 21, MAT.plaster, 'timber');
    doorL(ctx, -0.15, 0.6, 0.28, 11);
    windowR(ctx, 0.6, -0.1, 11);
    windowL(ctx, 0.3, 0.6, 11);
    gable(ctx, -0.7, -0.6, 0.6, 0.6, 21, 17, MAT.thatch, 'x', 0.14, MAT.plaster);
    box(ctx, -0.45, -0.35, -0.25, -0.15, 30, 40, MAT.stone);
    poly(ctx, [P(-0.25, 0.75, 17), P(0.1, 0.75, 17), P(0.1, 0.75, 13), P(-0.25, 0.75, 13)], c.main);
  },
  towncenter(ctx, c) {
    groundPad(ctx, 4.2, 4.2, 'rgba(110,90,60,0.6)');
    shadowDiamond(ctx, -1.8, -1.8, 1.8, 1.8, 0.3, 0.5);
    box(ctx, -1.85, -1.85, 1.85, 1.85, 0, 9, MAT.stone, 'stone');
    // steps
    box(ctx, -0.5, 1.85, 0.5, 2.05, 0, 5, MAT.stone);
    box(ctx, -1.5, -1.5, 1.1, 1.1, 9, 40, MAT.plaster, 'timber');
    doorL(ctx, 0, 1.1, 0.6, 20, '#3b2210');
    for (const x of [-1.0, 0.7]) windowL(ctx, x, 1.1, 24, 0.12, 7);
    for (const y of [-0.9, 0.3]) windowR(ctx, 1.1, y, 24, 0.12, 7);
    banner(ctx, P(-0.55, 1.1, 36), c.main, 14);
    banner(ctx, P(0.55, 1.1, 36), c.main, 14);
    banner(ctx, P(1.1, -0.3, 36), c.main, 14);
    pyramid(ctx, -1.5, -1.5, 1.1, 1.1, 40, 30, MAT.redroof, 0.2);
    // tower
    box(ctx, 0.6, -1.85, 1.6, -0.85, 9, 76, MAT.stone, 'stone');
    windowL(ctx, 1.1, -0.85, 56, 0.1, 8);
    windowR(ctx, 1.6, -1.35, 56, 0.1, 8);
    box(ctx, 0.5, -1.95, 1.7, -0.75, 76, 80, MAT.stone);
    for (let i = 0; i < 4; i++) box(ctx, 0.5 + i * 0.36, -0.87, 0.65 + i * 0.36, -0.75, 80, 84, MAT.stone);
    for (let i = 0; i < 4; i++) box(ctx, 1.58, -1.95 + i * 0.36, 1.7, -1.8 + i * 0.36, 80, 84, MAT.stone);
    const [fx, fy] = P(1.1, -1.35, 84);
    flag(ctx, fx, fy, 18, c.main, 0, 1.3);
    // porch posts
    for (const x of [-1.3, -0.4, 0.4]) box(ctx, x, 1.35, x + 0.1, 1.45, 9, 26, MAT.wood);
    poly(ctx, [P(-1.5, 1.1, 27), P(0.7, 1.1, 27), P(0.7, 1.6, 22), P(-1.5, 1.6, 22)], MAT.redroof.l, 'rgba(0,0,0,0.3)');
  },
  lumbercamp(ctx, c) {
    groundPad(ctx, 1.9, 1.9, 'rgba(110,80,50,0.5)');
    shadowDiamond(ctx, -0.8, -0.8, 0.5, 0.2);
    for (const [x, y] of [[-0.75, -0.75], [0.45, -0.75], [-0.75, 0.1], [0.45, 0.1]]) box(ctx, x, y, x + 0.1, y + 0.1, 0, 20, MAT.wood);
    box(ctx, -0.8, -0.8, 0.55, -0.72, 0, 16, MAT.wood, 'plank');
    gable(ctx, -0.8, -0.8, 0.55, 0.2, 20, 12, MAT.wood, 'x', 0.1);
    // logs pile
    const logs = [[0.2, 0.6], [-0.2, 0.6], [-0.6, 0.6], [0, 0.55], [-0.4, 0.55]];
    logs.forEach(([x, y], i) => {
      const z = i < 3 ? 3 : 8;
      const [sx, sy] = P(x, y, z);
      ctx.fillStyle = '#7a4e28';
      ctx.beginPath(); ctx.ellipse(sx + 8, sy - 4, 12, 3.5, -0.46, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d9b27a';
      ctx.beginPath(); ctx.arc(sx - 2, sy + 1, 3.3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#8a5a2a'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(sx - 2, sy + 1, 1.8, 0, Math.PI * 2); ctx.stroke();
    });
    const [fx, fy] = P(0.5, 0.2, 20);
    flag(ctx, fx, fy, 12, c.main, 0, 0.8);
  },
  mill(ctx, c) {
    groundPad(ctx, 1.9, 1.9, 'rgba(120,95,60,0.5)');
    shadowDiamond(ctx, -0.6, -0.6, 0.6, 0.6);
    box(ctx, -0.6, -0.6, 0.6, 0.6, 0, 5, MAT.stone, 'stone');
    box(ctx, -0.55, -0.55, 0.55, 0.55, 5, 30, MAT.plaster, 'timber');
    doorL(ctx, 0, 0.55, 0.3, 12);
    windowR(ctx, 0.55, 0, 20);
    pyramid(ctx, -0.55, -0.55, 0.55, 0.55, 30, 20, MAT.thatch, 0.12);
    // sacks
    for (const [x, y] of [[0.75, 0.2], [0.75, -0.2]]) {
      const [sx, sy] = P(x, y, 0);
      ctx.fillStyle = '#d8c38e'; ctx.beginPath(); ctx.ellipse(sx, sy - 3, 3.5, 4.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.stroke();
    }
    banner(ctx, P(-0.3, 0.55, 26), c.main, 8);
  },
  miningcamp(ctx, c) {
    groundPad(ctx, 1.9, 1.9, 'rgba(100,90,80,0.55)');
    shadowDiamond(ctx, -0.8, -0.8, 0.5, 0.2);
    for (const [x, y] of [[-0.75, -0.75], [0.45, -0.75], [-0.75, 0.1], [0.45, 0.1]]) box(ctx, x, y, x + 0.1, y + 0.1, 0, 19, MAT.wood);
    box(ctx, -0.8, -0.8, 0.55, -0.7, 0, 15, MAT.darkstone, 'stone');
    gable(ctx, -0.8, -0.8, 0.55, 0.2, 19, 11, MAT.slate, 'x', 0.1);
    // cart
    const [cx, cy] = P(0.1, 0.6, 0);
    ctx.fillStyle = '#6d4a2a'; ctx.fillRect(cx - 9, cy - 11, 18, 7);
    ctx.fillStyle = '#e8c547'; ctx.beginPath(); ctx.ellipse(cx - 3, cy - 11, 4, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#9a9a9a'; ctx.beginPath(); ctx.ellipse(cx + 3, cy - 11, 4, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2b1c10';
    for (const dx of [-6, 6]) { ctx.beginPath(); ctx.arc(cx + dx, cy - 3, 2.8, 0, Math.PI * 2); ctx.fill(); }
    const [fx, fy] = P(0.5, 0.2, 19);
    flag(ctx, fx, fy, 12, c.main, 0, 0.8);
  },
  barracks(ctx, c) {
    groundPad(ctx, 3, 3);
    shadowDiamond(ctx, -1.3, -1.3, 1.2, 0.4);
    box(ctx, -1.3, -1.3, 1.2, 0.4, 0, 12, MAT.stone, 'stone');
    box(ctx, -1.3, -1.3, 1.2, 0.4, 12, 28, MAT.plaster, 'timber');
    doorL(ctx, -0.1, 0.4, 0.5, 15);
    windowR(ctx, 1.2, -0.8, 16, 0.12, 6); windowR(ctx, 1.2, -0.1, 16, 0.12, 6);
    windowL(ctx, -0.9, 0.4, 16, 0.12, 6); windowL(ctx, 0.7, 0.4, 16, 0.12, 6);
    gable(ctx, -1.3, -1.3, 1.2, 0.4, 28, 20, MAT.redroof, 'x', 0.14, MAT.plaster);
    banner(ctx, P(-0.5, 0.4, 26), c.main, 12); banner(ctx, P(0.35, 0.4, 26), c.main, 12);
    // weapon rack
    const [rx, ry] = P(0.7, 1.1, 0);
    ctx.strokeStyle = '#5a3a1e'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(rx - 10, ry - 6); ctx.lineTo(rx + 10, ry - 11); ctx.stroke();
    for (let i = 0; i < 5; i++) {
      const x = rx - 8 + i * 4, y = ry - 6.5 - i;
      line(ctx, [x, y + 5], [x + 1, y - 13], '#8a6a4a', 0.9);
      line(ctx, [x + 1, y - 13], [x + 1.4, y - 16], '#cfd4da', 1.3);
    }
    const [fx, fy] = P(-1.1, 1.1, 0);
    flag(ctx, fx, fy, 30, c.main, 0, 1.1);
  },
  archeryrange(ctx, c) {
    groundPad(ctx, 3, 3, 'rgba(140,120,70,0.5)');
    shadowDiamond(ctx, -1.3, -1.3, 1.3, -0.1);
    box(ctx, -1.3, -1.3, 1.3, -0.1, 0, 24, MAT.wood, 'plank');
    windowL(ctx, -0.6, -0.1, 12, 0.14, 6); windowL(ctx, 0.5, -0.1, 12, 0.14, 6);
    doorL(ctx, 0, -0.1, 0.4, 14);
    gable(ctx, -1.3, -1.3, 1.3, -0.1, 24, 16, MAT.thatch, 'x', 0.14, MAT.wood);
    banner(ctx, P(-0.3, -0.1, 22), c.main, 11);
    // targets
    for (const [x, y] of [[-0.6, 0.9], [0.7, 0.9]]) {
      const [sx, sy] = P(x, y, 0);
      line(ctx, [sx - 3, sy], [sx - 1, sy - 12], '#5a3a1e', 1.2);
      line(ctx, [sx + 3, sy], [sx + 1, sy - 12], '#5a3a1e', 1.2);
      ctx.fillStyle = '#e6d39a'; ctx.beginPath(); ctx.ellipse(sx, sy - 13, 6, 6.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.ellipse(sx, sy - 13, 4, 4.3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e6d39a'; ctx.beginPath(); ctx.ellipse(sx, sy - 13, 2.2, 2.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.arc(sx, sy - 13, 0.9, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 6; i++) { const [sx, sy] = P(1.4, -1.2 + i * 0.5, 0); line(ctx, [sx, sy], [sx, sy - 7], '#6b4a2a', 1.2); }
  },
  stable(ctx, c) {
    groundPad(ctx, 3, 3, 'rgba(130,100,60,0.55)');
    shadowDiamond(ctx, -1.3, -1.2, 1.1, 0.6);
    box(ctx, -1.3, -1.2, 1.1, 0.6, 0, 22, MAT.wood, 'plank');
    // barn doors on +y face
    for (const x of [-0.7, 0.4]) {
      poly(ctx, [P(x - 0.3, 0.6, 0), P(x + 0.3, 0.6, 0), P(x + 0.3, 0.6, 15), P(x - 0.3, 0.6, 15)], '#5b3a1e');
      line(ctx, P(x - 0.3, 0.6, 0), P(x + 0.3, 0.6, 15), '#8a6036', 1.1);
      line(ctx, P(x + 0.3, 0.6, 0), P(x - 0.3, 0.6, 15), '#8a6036', 1.1);
    }
    gable(ctx, -1.3, -1.2, 1.1, 0.6, 22, 22, MAT.slate, 'y', 0.14, MAT.wood);
    banner(ctx, P(-0.15, 0.6, 20), c.main, 10);
    // hay
    const [hx, hy] = P(0.9, 1.1, 0);
    ctx.fillStyle = '#d9b64a'; ctx.beginPath(); ctx.ellipse(hx, hy - 4, 7, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(120,90,20,0.6)'; ctx.lineWidth = 0.6;
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(hx + i * 2, hy - 8); ctx.lineTo(hx + i * 2.4, hy); ctx.stroke(); }
    // fence
    for (let i = 0; i < 5; i++) { const [sx, sy] = P(-1.4 + i * 0.5, 1.35, 0); line(ctx, [sx, sy], [sx, sy - 7], '#6b4a2a', 1.3); }
    line(ctx, P(-1.4, 1.35, 5), P(0.6, 1.35, 5), '#7b5a3a', 1.1);
  },
  blacksmith(ctx, c) {
    groundPad(ctx, 3, 3, 'rgba(90,80,70,0.55)');
    shadowDiamond(ctx, -1.2, -1.2, 1.0, 0.5);
    box(ctx, -1.2, -1.2, 1.0, 0.5, 0, 24, MAT.darkstone, 'stone');
    // forge opening
    poly(ctx, [P(-0.5, 0.5, 0), P(0.3, 0.5, 0), P(0.3, 0.5, 13), P(-0.5, 0.5, 13)], '#2a1a10');
    poly(ctx, [P(-0.35, 0.5, 1), P(0.15, 0.5, 1), P(0.15, 0.5, 6), P(-0.35, 0.5, 6)], '#ff8c2a');
    gable(ctx, -1.2, -1.2, 1.0, 0.5, 24, 16, MAT.slate, 'x', 0.12, MAT.darkstone);
    box(ctx, 0.3, -1.0, 0.7, -0.6, 24, 52, MAT.stone, 'stone');
    banner(ctx, P(0.7, 0.5, 22), c.main, 10);
    // anvil
    const [ax, ay] = P(0.5, 1.1, 0);
    ctx.fillStyle = '#3e3e44';
    ctx.fillRect(ax - 2, ay - 6, 4, 6);
    ctx.beginPath(); ctx.moveTo(ax - 7, ay - 9); ctx.lineTo(ax + 6, ay - 9); ctx.lineTo(ax + 3, ay - 6); ctx.lineTo(ax - 4, ay - 6); ctx.closePath(); ctx.fill();
  },
  siegeworkshop(ctx, c) {
    groundPad(ctx, 3, 3, 'rgba(120,90,60,0.55)');
    shadowDiamond(ctx, -1.3, -1.3, 1.1, 0.6);
    for (const [x, y] of [[-1.3, -1.3], [1.0, -1.3], [-1.3, 0.5], [1.0, 0.5]]) box(ctx, x, y, x + 0.12, y + 0.12, 0, 26, MAT.wood);
    box(ctx, -1.3, -1.3, 1.1, -1.18, 0, 22, MAT.wood, 'plank');
    box(ctx, -1.3, -1.3, -1.18, 0.6, 0, 22, MAT.wood, 'plank');
    // big wheel inside
    const [wx, wy] = P(0, -0.2, 10);
    ctx.strokeStyle = '#5a3a1e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(wx, wy, 8, 9, 0, 0, Math.PI * 2); ctx.stroke();
    for (let a = 0; a < 6; a++) line(ctx, [wx, wy], [wx + Math.cos(a) * 8, wy + Math.sin(a) * 9], '#5a3a1e', 1);
    gable(ctx, -1.3, -1.3, 1.1, 0.6, 26, 16, MAT.redroof, 'y', 0.14, MAT.wood);
    // crane
    const [cx, cy] = P(1.2, 1.0, 0);
    line(ctx, [cx, cy], [cx, cy - 40], '#6b4a2a', 2);
    line(ctx, [cx, cy - 38], [cx - 18, cy - 44], '#6b4a2a', 1.6);
    line(ctx, [cx - 17, cy - 44], [cx - 17, cy - 26], '#333', 0.6);
    ctx.fillStyle = '#7a5a3a'; ctx.fillRect(cx - 20, cy - 26, 6, 5);
    const [fx, fy] = P(-1.2, 0.6, 26);
    flag(ctx, fx, fy, 14, c.main, 0, 0.9);
  },
  tower(ctx, c) {
    shadowDiamond(ctx, -0.45, -0.45, 0.45, 0.45, 0.3, 0.6);
    box(ctx, -0.42, -0.42, 0.42, 0.42, 0, 60, MAT.stone, 'stone');
    windowL(ctx, 0, 0.42, 40, 0.07, 7);
    windowR(ctx, 0.42, 0, 40, 0.07, 7);
    box(ctx, -0.5, -0.5, 0.5, 0.5, 60, 64, MAT.stone);
    for (let i = 0; i < 3; i++) {
      box(ctx, -0.5 + i * 0.38, 0.4, -0.38 + i * 0.38, 0.5, 64, 68, MAT.stone);
      box(ctx, 0.4, -0.5 + i * 0.38, 0.5, -0.38 + i * 0.38, 64, 68, MAT.stone);
    }
    pyramid(ctx, -0.4, -0.4, 0.4, 0.4, 66, 20, MAT.slate, 0.05);
    const [fx, fy] = P(0, 0, 86);
    flag(ctx, fx, fy, 10, c.main, 0, 0.8);
  },
  castle(ctx, c) {
    groundPad(ctx, 4.3, 4.3, 'rgba(110,100,85,0.6)');
    shadowDiamond(ctx, -2, -2, 2, 2, 0.32, 0.6);
    // back towers
    cylinder(ctx, -1.6, -1.6, 0.45, 0, 44, MAT.stone, true);
    // back walls
    box(ctx, -1.6, -1.75, 1.6, -1.45, 0, 34, MAT.stone, 'stone');
    box(ctx, -1.75, -1.6, -1.45, 1.6, 0, 34, MAT.stone, 'stone');
    cylinder(ctx, 1.6, -1.6, 0.45, 0, 44, MAT.stone, true);
    cylinder(ctx, -1.6, 1.6, 0.45, 0, 44, MAT.stone, true);
    // keep
    box(ctx, -0.9, -0.9, 0.7, 0.7, 0, 62, MAT.stone, 'stone');
    windowL(ctx, -0.2, 0.7, 44, 0.1, 9); windowR(ctx, 0.7, -0.2, 44, 0.1, 9);
    box(ctx, -1.0, -1.0, 0.8, 0.8, 62, 66, MAT.stone);
    for (let i = 0; i < 5; i++) {
      box(ctx, -1.0 + i * 0.4, 0.68, -0.8 + i * 0.4, 0.8, 66, 71, MAT.stone);
      box(ctx, 0.68, -1.0 + i * 0.4, 0.8, -0.8 + i * 0.4, 66, 71, MAT.stone);
    }
    banner(ctx, P(-0.5, 0.7, 58), c.main, 16); banner(ctx, P(0.7, -0.5, 58), c.main, 16);
    const [kx, ky] = P(-0.1, -0.1, 71);
    flag(ctx, kx, ky, 22, c.main, 0, 1.5);
    // front walls
    box(ctx, 1.45, -1.6, 1.75, 1.6, 0, 34, MAT.stone, 'stone');
    box(ctx, -1.6, 1.45, 1.6, 1.75, 0, 34, MAT.stone, 'stone');
    for (let i = 0; i < 8; i++) {
      box(ctx, -1.5 + i * 0.4, 1.62, -1.3 + i * 0.4, 1.75, 34, 38, MAT.stone);
      box(ctx, 1.62, -1.5 + i * 0.4, 1.75, -1.3 + i * 0.4, 34, 38, MAT.stone);
    }
    // gate
    poly(ctx, [P(-0.35, 1.75, 0), P(0.35, 1.75, 0), P(0.35, 1.75, 16), P(0, 1.75, 21), P(-0.35, 1.75, 16)], '#3a2515');
    for (let i = 1; i < 5; i++) line(ctx, P(-0.35 + i * 0.14, 1.75, 0), P(-0.35 + i * 0.14, 1.75, 17), 'rgba(0,0,0,0.5)', 0.6);
    banner(ctx, P(-0.9, 1.75, 30), c.main, 14); banner(ctx, P(0.9, 1.75, 30), c.main, 14);
    cylinder(ctx, 1.6, 1.6, 0.5, 0, 46, MAT.stone, true);
    const [tx, ty] = P(1.6, 1.6, 46);
    flag(ctx, tx, ty, 14, c.main, 0, 1);
  },
};

export function buildingSprite(type, color) {
  const def = { house: 2, towncenter: 4, lumbercamp: 2, mill: 2, miningcamp: 2, barracks: 3, archeryrange: 3, stable: 3, blacksmith: 3, siegeworkshop: 3, tower: 1, castle: 4 }[type] || 2;
  const halfW = def * 32 + 16;
  const up = { towncenter: 150, castle: 130, tower: 110, house: 60, barracks: 80, siegeworkshop: 80 }[type] || 70;
  const w = halfW * 2, h = up + def * 16 + 18;
  return cached('b_' + type + color.main, w, h, halfW, up, (ctx) => B[type](ctx, color));
}

export function farmSprite(stage) {
  // stage: 0 = freshly planted, 1 = growing, 2 = ripe, 3 = harvested
  return cached('farm' + stage, 3 * 64 + 8, 3 * 32 + 12, 3 * 32 + 4, 3 * 16 + 4, (ctx) => {
    const soil = ['#7a5a34', '#6f5230', '#6a4f2e', '#7c5d38'][stage];
    poly(ctx, [P(-1.45, -1.45), P(1.45, -1.45), P(1.45, 1.45), P(-1.45, 1.45)], soil, 'rgba(60,40,20,0.6)', 1);
    const rnd = mulberry32(17 + stage);
    for (let i = 0; i < 9; i++) {
      const y = -1.3 + i * 0.325;
      line(ctx, P(-1.35, y), P(1.35, y), 'rgba(40,25,10,0.35)', 1.2);
      if (stage === 3) continue;
      for (let x = -1.3; x < 1.3; x += 0.16) {
        const [sx, sy] = P(x + rnd() * 0.05, y + 0.12);
        const h = [2, 4, 6][stage] + rnd() * 2;
        const col = stage === 2 ? (rnd() < 0.5 ? '#e0c050' : '#caa83a') : stage === 1 ? (rnd() < 0.5 ? '#7fb040' : '#6a9a30') : '#5f8f35';
        line(ctx, [sx, sy], [sx + (rnd() - 0.5) * 1.5, sy - h], col, 1.2);
      }
    }
    // fence posts corners
    for (const [x, y] of [[-1.45, -1.45], [1.45, -1.45], [1.45, 1.45], [-1.45, 1.45]]) {
      const [sx, sy] = P(x, y); line(ctx, [sx, sy], [sx, sy - 5], '#5a3f22', 1.4);
    }
  });
}

// Mill blades drawn live
export function drawMillBlades(ctx, sx, sy, zoom, t) {
  ctx.save();
  ctx.translate(sx + 12 * zoom, sy - 38 * zoom);
  ctx.scale(zoom, zoom);
  ctx.rotate(t * 0.8);
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = '#5a3a1e';
    ctx.fillRect(-0.8, 0, 1.6, 22);
    ctx.fillStyle = 'rgba(235,225,200,0.92)';
    ctx.fillRect(1, 5, 5, 16);
    ctx.strokeStyle = 'rgba(90,60,30,0.6)'; ctx.lineWidth = 0.4;
    ctx.strokeRect(1, 5, 5, 16);
  }
  ctx.fillStyle = '#3a2412'; ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// Foundation / construction rendering
export function drawConstruction(ctx, b, sx, sy, zoom, color) {
  const w = b.w, h = b.h;
  ctx.save();
  ctx.translate(sx, sy); ctx.scale(zoom, zoom);
  const hw = w / 2, hh = h / 2;
  poly(ctx, [P(-hw, -hh), P(hw, -hh), P(hw, hh), P(-hw, hh)], 'rgba(120,95,60,0.7)', 'rgba(255,255,255,0.35)', 1);
  ctx.restore();
  if (b.type === 'farm') {
    ctx.globalAlpha = 0.3 + b.progress * 0.7;
    blit(ctx, farmSprite(0), sx, sy, zoom);
    ctx.globalAlpha = 1;
    return;
  }
  const s = buildingSprite(b.type, color);
  const p = b.progress;
  if (p > 0.02) {
    // reveal from bottom
    const full = s.h;
    const visible = full * (0.15 + 0.85 * p);
    ctx.save();
    const top = sy - s.ay * zoom + (full - visible) * zoom;
    ctx.beginPath(); ctx.rect(sx - s.ax * zoom, top, s.w * zoom, visible * zoom); ctx.clip();
    ctx.globalAlpha = 0.55 + p * 0.45;
    blit(ctx, s, sx, sy, zoom);
    ctx.restore();
  }
  // scaffolding
  ctx.save();
  ctx.translate(sx, sy); ctx.scale(zoom, zoom);
  const H = (b.type === 'tower' ? 60 : b.type === 'house' ? 22 : 30) * Math.min(1, p * 1.4 + 0.3);
  const posts = [[-hw + 0.1, hh - 0.1], [hw - 0.1, hh - 0.1], [hw - 0.1, -hh + 0.1], [-hw + 0.1, -hh + 0.1]];
  for (const [x, y] of posts) line(ctx, P(x, y, 0), P(x, y, H), '#8b6a40', 1.4);
  for (let z = 8; z < H; z += 10) {
    line(ctx, P(-hw + 0.1, hh - 0.1, z), P(hw - 0.1, hh - 0.1, z), '#a07a48', 1);
    line(ctx, P(hw - 0.1, -hh + 0.1, z), P(hw - 0.1, hh - 0.1, z), '#a07a48', 1);
  }
  ctx.restore();
}

// ---------------- trees & resources ----------------
export function treeSprite(variant) {
  const v = variant % 8;
  return cached('tree' + v, 60, 96, 30, 86, (ctx) => {
    const rnd = mulberry32(variant * 13 + 7);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(4, 0, 17, 7, 0, 0, Math.PI * 2); ctx.fill();
    if (v < 3) {
      // pine
      ctx.fillStyle = '#5a3a20'; ctx.fillRect(-2, -14, 4, 14);
      const greens = ['#1f4d2a', '#2a6034', '#357040'];
      const tiers = 4 + (v % 2);
      for (let i = 0; i < tiers; i++) {
        const y = -10 - i * 13, wdt = 19 - i * 3.2;
        ctx.fillStyle = greens[0];
        ctx.beginPath(); ctx.moveTo(-wdt, y); ctx.lineTo(0, y - 22); ctx.lineTo(wdt, y); ctx.closePath(); ctx.fill();
        ctx.fillStyle = greens[1 + (i % 2)];
        ctx.beginPath(); ctx.moveTo(-wdt + 2, y - 1); ctx.lineTo(0, y - 21); ctx.lineTo(1, y - 1); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath(); ctx.moveTo(1, y - 1); ctx.lineTo(0, y - 21); ctx.lineTo(wdt, y); ctx.closePath(); ctx.fill();
      }
    } else {
      // broadleaf
      ctx.fillStyle = '#5b3b22'; ctx.fillRect(-2.5, -24, 5, 24);
      ctx.strokeStyle = '#5b3b22'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(-7, -30); ctx.moveTo(0, -20); ctx.lineTo(7, -32); ctx.stroke();
      const base = ['#2f6a2a', '#3b7a2e', '#2d5f26', '#44802f', '#386b2b'][v - 3];
      const blobs = [];
      for (let i = 0; i < 9; i++) blobs.push([(rnd() - 0.5) * 26, -38 - rnd() * 26, 9 + rnd() * 6]);
      blobs.sort((a, b) => a[1] - b[1]);
      for (const [x, y, r] of blobs) {
        ctx.fillStyle = shade(base, -0.35); ctx.beginPath(); ctx.arc(x + 1.5, y + 2, r, 0, Math.PI * 2); ctx.fill();
      }
      for (const [x, y, r] of blobs) {
        const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.5, 1, x, y, r);
        g.addColorStop(0, shade(base, 0.3)); g.addColorStop(0.6, base); g.addColorStop(1, shade(base, -0.25));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,200,0.08)';
      for (let i = 0; i < 14; i++) { ctx.beginPath(); ctx.arc((rnd() - 0.6) * 22, -40 - rnd() * 24, 1.5 + rnd() * 1.5, 0, Math.PI * 2); ctx.fill(); }
    }
  });
}
export function stumpSprite(seed) {
  return cached('stump' + (seed % 2), 40, 24, 20, 14, (ctx) => {
    ctx.fillStyle = '#6b4526'; ctx.beginPath(); ctx.ellipse(0, 0, 4, 2.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(-4, -3, 8, 3);
    ctx.fillStyle = '#c9a26a'; ctx.beginPath(); ctx.ellipse(0, -3, 4, 2, 0, 0, Math.PI * 2); ctx.fill();
  });
}
export function fallenTreeSprite(variant) {
  return cached('fallen' + (variant % 2), 60, 30, 30, 18, (ctx) => {
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(2, 2, 18, 5, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.rotate(-0.42);
    ctx.fillStyle = '#6e4626'; ctx.fillRect(-18, -4, 30, 6);
    ctx.fillStyle = '#d8b07a'; ctx.beginPath(); ctx.ellipse(12, -1, 1.8, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = variant % 2 ? '#2a6034' : '#3b7a2e';
    ctx.beginPath(); ctx.ellipse(-20, -2, 8, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  });
}
export function mineSprite(type, variant, frac) {
  const stage = frac > 0.66 ? 2 : frac > 0.33 ? 1 : 0;
  return cached('mine' + type + (variant % 3) + stage, 64, 48, 32, 30, (ctx) => {
    const rnd = mulberry32(variant * 7 + stage);
    const k = 0.55 + stage * 0.22;
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(2, 3, 20 * k, 8 * k, 0, 0, Math.PI * 2); ctx.fill();
    const rocks = [];
    for (let i = 0; i < 6 + stage * 2; i++) rocks.push([(rnd() - 0.5) * 26 * k, (rnd() - 0.5) * 10 * k - 3, (5 + rnd() * 5) * k]);
    rocks.sort((a, b) => a[1] - b[1]);
    for (const [x, y, r] of rocks) {
      const base = type === 'gold' ? '#8a7a5a' : '#8f8f8f';
      ctx.fillStyle = shade(base, -0.3);
      ctx.beginPath(); ctx.moveTo(x - r, y + 2); ctx.lineTo(x - r * 0.6, y - r * 0.8); ctx.lineTo(x + r * 0.3, y - r); ctx.lineTo(x + r, y - r * 0.2); ctx.lineTo(x + r * 0.8, y + 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(base, 0.1);
      ctx.beginPath(); ctx.moveTo(x - r * 0.9, y + 1); ctx.lineTo(x - r * 0.6, y - r * 0.8); ctx.lineTo(x + r * 0.3, y - r); ctx.lineTo(x + r * 0.1, y); ctx.closePath(); ctx.fill();
      if (type === 'gold') {
        for (let j = 0; j < 3; j++) {
          const gx = x + (rnd() - 0.5) * r, gy = y - rnd() * r * 0.8;
          ctx.fillStyle = '#ffd84a'; ctx.beginPath(); ctx.arc(gx, gy, 1.2 + rnd() * 1.3, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#fff5b0'; ctx.fillRect(gx - 0.4, gy - 0.8, 0.8, 0.8);
        }
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.moveTo(x - r * 0.5, y - r * 0.5); ctx.lineTo(x + r * 0.2, y - r * 0.8); ctx.stroke();
      }
    }
  });
}
export function berrySprite(variant, frac) {
  const stage = frac > 0.5 ? 1 : 0;
  return cached('berry' + (variant % 3) + stage, 44, 36, 22, 26, (ctx) => {
    const rnd = mulberry32(variant * 3 + 1);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(2, 2, 14, 6, 0, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 7; i++) {
      const x = (rnd() - 0.5) * 18, y = -4 - rnd() * 10, r = 5 + rnd() * 3;
      const g = ctx.createRadialGradient(x - 2, y - 2, 1, x, y, r);
      g.addColorStop(0, '#5c9a3a'); g.addColorStop(1, '#2c5a22');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    const n = stage ? 16 : 6;
    for (let i = 0; i < n; i++) {
      const x = (rnd() - 0.5) * 20, y = -3 - rnd() * 13;
      ctx.fillStyle = rnd() < 0.5 ? '#c2263a' : '#8e2d7a';
      ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(x - 0.6, y - 0.9, 0.6, 0.6);
    }
  });
}
export function rubbleSprite(w, seed) {
  return cached('rubble' + w + (seed % 3), w * 64 + 10, w * 32 + 16, w * 32 + 5, w * 16 + 8, (ctx) => {
    const rnd = mulberry32(seed);
    poly(ctx, [P(-w / 2, -w / 2), P(w / 2, -w / 2), P(w / 2, w / 2), P(-w / 2, w / 2)], 'rgba(60,50,40,0.5)');
    for (let i = 0; i < w * w * 6; i++) {
      const [x, y] = P((rnd() - 0.5) * w * 0.9, (rnd() - 0.5) * w * 0.9);
      ctx.fillStyle = rnd() < 0.5 ? '#6d6458' : rnd() < 0.5 ? '#4a3a2a' : '#2a2520';
      ctx.fillRect(x - 2, y - 2, 2 + rnd() * 4, 2 + rnd() * 3);
    }
  });
}

// ---------------- units ----------------
const SKIN = '#e2b48c';
function limb(ctx, x0, y0, x1, y1, col, w) {
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
}

function drawWeapon(ctx, kind, hx, hy, ang, anim) {
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(ang);
  ctx.lineCap = 'round';
  switch (kind) {
    case 'sword':
      limb(ctx, 0, 0, 0, -10, '#d9dde2', 1.6);
      limb(ctx, -2, 0, 2, 0, '#6b4a2a', 1.3);
      break;
    case 'greatsword':
      limb(ctx, 0, 2, 0, -14, '#e2e6ea', 2);
      limb(ctx, -2.5, 0, 2.5, 0, '#6b4a2a', 1.4);
      break;
    case 'spear':
      limb(ctx, 0, 8, 0, -16, '#8a6a42', 1.2);
      ctx.fillStyle = '#d7dbe0'; ctx.beginPath(); ctx.moveTo(-1.4, -16); ctx.lineTo(0, -21); ctx.lineTo(1.4, -16); ctx.closePath(); ctx.fill();
      break;
    case 'lance':
      limb(ctx, 0, 6, 0, -20, '#9a7a52', 1.5);
      ctx.fillStyle = '#d7dbe0'; ctx.beginPath(); ctx.moveTo(-1.3, -20); ctx.lineTo(0, -24); ctx.lineTo(1.3, -20); ctx.closePath(); ctx.fill();
      break;
    case 'axe':
      limb(ctx, 0, 1, 0, -9, '#7a5a36', 1.3);
      ctx.fillStyle = '#b8bec6'; ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(3.5, -10.5); ctx.lineTo(3.5, -6); ctx.lineTo(0, -7); ctx.closePath(); ctx.fill();
      break;
    case 'pick':
      limb(ctx, 0, 1, 0, -9, '#7a5a36', 1.3);
      ctx.strokeStyle = '#9aa0a8'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-4, -7); ctx.quadraticCurveTo(0, -11, 4, -7); ctx.stroke();
      break;
    case 'hammer':
      limb(ctx, 0, 1, 0, -7, '#7a5a36', 1.3);
      ctx.fillStyle = '#707780'; ctx.fillRect(-2.2, -9, 4.4, 2.6);
      break;
    case 'hoe':
      limb(ctx, 0, 3, 0, -10, '#7a5a36', 1.2);
      limb(ctx, 0, -10, 3, -9, '#9aa0a8', 1.4);
      break;
    case 'javelin':
      limb(ctx, 0, 4, 0, -12, '#8a6a42', 1);
      ctx.fillStyle = '#ccc'; ctx.beginPath(); ctx.moveTo(-1, -12); ctx.lineTo(0, -15); ctx.lineTo(1, -12); ctx.fill();
      break;
  }
  ctx.restore();
}

function drawHuman(ctx, o) {
  // facing right. o: tunic, pants, walk, act ('idle'|'walk'|'work'|'attack'|'bow'), phase, weapon, helm, shield, hood, carry, gear
  const walk = o.act === 'walk';
  const ph = o.phase;
  const legA = walk ? Math.sin(ph * 9) * 2.6 : 0;
  const bob = walk ? Math.abs(Math.sin(ph * 9)) * 0.8 : 0;
  ctx.translate(0, -bob);
  // legs
  limb(ctx, -0.8, -8, -0.8 - legA, -0.5 + bob, shade(o.pants, -0.2), 2.3);
  limb(ctx, 0.8, -8, 0.8 + legA, -0.5 + bob, o.pants, 2.3);
  ctx.fillStyle = '#3a2716';
  ctx.fillRect(-0.8 - legA - 1.3, -1.3 + bob, 2.6, 1.5);
  ctx.fillRect(0.8 + legA - 1.3, -1.3 + bob, 2.6, 1.5);

  // arm angles
  let backAng = 0.2, frontAng = -0.3;
  let wAng = 0.6; // weapon angle
  const swing = o.act === 'work' || o.act === 'attack';
  if (walk) { backAng = -legA * 0.18; frontAng = legA * 0.18; wAng = 0.3 + frontAng; }
  if (swing) {
    const s = o.act === 'attack' ? Math.max(0, o.anim) / 0.4 : (Math.sin(ph * (o.fast ? 9 : 6)) * 0.5 + 0.5);
    frontAng = o.act === 'attack' ? -2.4 + (1 - s) * 2.6 : -2.2 + s * 2.2;
    wAng = frontAng + 1.4;
    if (o.workKind === 'berry' || o.workKind === 'farm') { frontAng = -0.9 + s * 0.6; wAng = frontAng + 0.8; }
  }
  const shoulderY = -15;
  // carried bundle on back
  if (o.carry) {
    const c = { wood: '#7a4e28', gold: '#e8c040', stone: '#9a9a9a', food: '#b8412f' }[o.carry];
    ctx.fillStyle = c;
    if (o.carry === 'wood') { ctx.fillRect(-7, -17, 3, 10); ctx.fillRect(-5.5, -18, 3, 10); }
    else { ctx.beginPath(); ctx.arc(-5, -12, 3.3, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.5; ctx.stroke(); }
  }
  // back arm
  const bx = Math.sin(backAng) * 6, by = Math.cos(backAng) * 6;
  limb(ctx, -1, shoulderY + 0.5, -1 + bx, shoulderY + 0.5 + by, shade(o.tunic, -0.3), 2.2);
  // cape
  if (o.cape) {
    ctx.fillStyle = shade(o.tunic, -0.35);
    ctx.beginPath(); ctx.moveTo(-3, -15.5); ctx.lineTo(-6 - (walk ? 1 : 0), -6); ctx.lineTo(-1, -7); ctx.closePath(); ctx.fill();
  }
  // torso
  ctx.fillStyle = o.tunic;
  ctx.beginPath();
  ctx.moveTo(-3.4, -16); ctx.lineTo(3.4, -16); ctx.lineTo(o.skirt ? 4 : 3, -6.5); ctx.lineTo(o.skirt ? -4 : -3, -6.5); ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(-3.2, -16, 2, 9);
  if (o.armor) {
    ctx.fillStyle = o.armor === 2 ? '#b8bec8' : '#8a8f98';
    ctx.fillRect(-3.2, -15.8, 6.4, o.armor === 2 ? 7 : 4);
    ctx.fillStyle = o.tunic; ctx.fillRect(-1, -15.8, 2, o.armor === 2 ? 7 : 4);
  }
  ctx.fillStyle = '#3d2715'; ctx.fillRect(-3.2, -9.5, 6.4, 1.2);
  // head
  ctx.fillStyle = SKIN;
  ctx.beginPath(); ctx.arc(0.3, -19.2, 3.1, 0, Math.PI * 2); ctx.fill();
  if (o.helm) {
    ctx.fillStyle = o.helm >= 2 ? '#c5cad2' : '#8e949c';
    ctx.beginPath(); ctx.arc(0.3, -19.8, 3.4, Math.PI, 0); ctx.fill();
    if (o.helm >= 2) { ctx.fillRect(-3.1, -20, 6.8, 3); ctx.fillStyle = '#222'; ctx.fillRect(1.2, -19.6, 2.4, 0.8); }
    if (o.helm >= 3) { ctx.fillStyle = o.plume || '#c33'; ctx.beginPath(); ctx.ellipse(-1.5, -24, 3, 1.4, -0.4, 0, Math.PI * 2); ctx.fill(); }
  } else if (o.hood) {
    ctx.fillStyle = o.hoodCol || '#3c6b2a';
    ctx.beginPath(); ctx.arc(0, -19.5, 3.6, Math.PI * 0.85, Math.PI * 2.1); ctx.lineTo(-3.5, -16); ctx.fill();
  } else if (o.hat) {
    ctx.fillStyle = '#c9a85a';
    ctx.beginPath(); ctx.ellipse(0.3, -21.4, 4.8, 1.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(0.3, -21.8, 2.4, Math.PI, 0); ctx.fill();
  } else {
    ctx.fillStyle = '#4a2e18';
    ctx.beginPath(); ctx.arc(0, -20, 3.1, Math.PI * 0.9, Math.PI * 2.05); ctx.fill();
  }
  // shield (on back arm side, in front of body)
  if (o.shield) {
    ctx.fillStyle = o.shieldCol;
    ctx.beginPath(); ctx.ellipse(-2.4, -11.5, 2.6, 4.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#d9c48a'; ctx.lineWidth = 0.8; ctx.stroke();
  }
  // front arm + weapon
  const fx = Math.sin(frontAng) * 6, fy = Math.cos(frontAng) * 6;
  const hx = 1.2 + fx, hy = shoulderY + 0.5 + fy;
  if (o.weapon === 'bow' || o.weapon === 'longbow' || o.weapon === 'crossbow') {
    const drawn = o.act === 'attack' ? 1 : 0;
    const ax = 5, ay = -13;
    limb(ctx, 1.2, shoulderY + 0.5, ax, ay, shade(o.tunic, -0.1), 2.2);
    if (o.weapon === 'crossbow') {
      limb(ctx, 1, -13, 9, -13.5, '#6b4a2a', 1.8);
      ctx.strokeStyle = '#4a3420'; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(8, -17.5); ctx.quadraticCurveTo(10, -13.5, 8, -9.5); ctx.stroke();
    } else {
      const L = o.weapon === 'longbow' ? 10 : 7.5;
      ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(ax, ay - L); ctx.quadraticCurveTo(ax + 5, ay, ax, ay + L); ctx.stroke();
      ctx.strokeStyle = 'rgba(230,230,230,0.8)'; ctx.lineWidth = 0.4;
      ctx.beginPath(); ctx.moveTo(ax, ay - L); ctx.lineTo(ax - drawn * 3.5, ay); ctx.lineTo(ax, ay + L); ctx.stroke();
    }
    ctx.fillStyle = SKIN; ctx.beginPath(); ctx.arc(ax, ay, 1.1, 0, Math.PI * 2); ctx.fill();
  } else {
    limb(ctx, 1.2, shoulderY + 0.5, hx, hy, shade(o.tunic, -0.1), 2.2);
    if (o.weapon) drawWeapon(ctx, o.weapon, hx, hy, wAng, o.anim);
    ctx.fillStyle = SKIN; ctx.beginPath(); ctx.arc(hx, hy, 1.1, 0, Math.PI * 2); ctx.fill();
  }
}

function drawHorse(ctx, o) {
  const walk = o.act === 'walk';
  const ph = o.phase * (walk ? 11 : 0);
  const body = o.coat;
  const legs = [[-5.5, 0], [-3.8, Math.PI], [4.5, Math.PI * 0.5], [6.2, Math.PI * 1.5]];
  ctx.fillStyle = 'rgba(0,0,0,0.0)';
  for (const [lx, off] of legs.slice(0, 2)) {
    const k = walk ? Math.sin(ph + off) * 2.8 : 0;
    limb(ctx, lx, -9, lx + k, -0.5, shade(body, -0.25), 2);
  }
  // tail
  ctx.strokeStyle = shade(body, -0.5); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-8, -12); ctx.quadraticCurveTo(-12, -10, -11 + (walk ? Math.sin(ph) : 0), -5); ctx.stroke();
  // body
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.ellipse(0, -11.5, 8.8, 4.3, 0, 0, Math.PI * 2); ctx.fill();
  // neck/head
  ctx.beginPath(); ctx.moveTo(4.5, -14); ctx.lineTo(8.5, -20.5); ctx.lineTo(11, -19); ctx.lineTo(8, -11); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.ellipse(11, -19, 3.6, 1.9, 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = shade(body, -0.5);
  ctx.beginPath(); ctx.moveTo(4.5, -15); ctx.lineTo(8.3, -21.5); ctx.lineTo(7.2, -21.8); ctx.lineTo(3.5, -15); ctx.fill();
  ctx.fillRect(9.4, -22.3, 1.2, 2);
  for (const [lx, off] of legs.slice(2)) {
    const k = walk ? Math.sin(ph + off) * 2.8 : 0;
    limb(ctx, lx, -9, lx + k, -0.5, body, 2);
  }
  if (o.barding) {
    ctx.fillStyle = o.barding;
    ctx.beginPath();
    ctx.moveTo(-8.5, -14); ctx.lineTo(7, -14.5); ctx.lineTo(8, -7);
    for (let x = 8; x >= -8.5; x -= 2.8) ctx.lineTo(x - 1.4, -6 + ((x | 0) % 2 ? 0.8 : -0.4));
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,230,140,0.8)'; ctx.fillRect(-8, -12, 15.5, 0.8);
  }
}

export function drawUnit(ctx, u, sx, sy, zoom, color, t) {
  const d = u.def;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(zoom * (u.facing < 0 ? -1 : 1), zoom);
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(0, 0, d.horse ? 10 : d.cls === 'siege' ? 13 : 5.5, d.horse ? 3.6 : d.cls === 'siege' ? 5 : 2.4, 0, 0, Math.PI * 2); ctx.fill();
  const act = u.attackAnim > 0 ? 'attack' : u.moving ? 'walk' : u.working ? 'work' : 'idle';
  const ph = u.animT;
  if (u.type === 'ram') drawRam(ctx, color, u, ph);
  else if (u.type === 'mangonel') drawMangonel(ctx, color, u);
  else if (d.horse) {
    const heavy = d.horse === 'heavy';
    drawHorse(ctx, { act: u.moving ? 'walk' : 'idle', phase: ph, coat: heavy ? '#5b4636' : '#8a5a34', barding: heavy ? color.main : null });
    ctx.translate(-0.5, -8.5);
    drawHuman(ctx, {
      tunic: color.main, pants: '#4a3b2a', act: act === 'walk' ? 'idle' : act, phase: ph, anim: u.attackAnim,
      weapon: d.gear, helm: d.helm || 0, armor: heavy ? 2 : 0, shield: heavy, shieldCol: color.dark, plume: color.light,
    });
  } else {
    const o = { tunic: color.main, pants: '#5a4630', act, phase: ph, anim: u.attackAnim, weapon: d.gear, helm: d.helm || 0 };
    if (u.type === 'villager') {
      o.tunic = shade(color.main, 0.12);
      o.pants = '#6b5537';
      o.hat = u.id % 3 !== 0; o.skirt = u.id % 2 === 0;
      o.workKind = u.workKind;
      o.weapon = u.working ? { wood: 'axe', gold: 'pick', stone: 'pick', build: 'hammer', farm: 'hoe', berry: null, hunt: 'sword' }[u.workKind] : null;
      if (act === 'attack') o.weapon = null;
      o.carry = u.carry && u.carry.amt > 1 ? u.carry.type : null;
      o.fast = u.workKind === 'build';
    }
    if (d.cls === 'infantry') {
      o.shield = d.gear === 'sword'; o.shieldCol = color.dark;
      o.armor = d.helm ? (d.helm >= 2 ? 2 : 1) : 0;
      o.cape = d.helm >= 2;
      if (!o.helm) o.helm = 1;
    }
    if (d.cls === 'archer') {
      o.hood = !d.helm || d.hood; o.hoodCol = d.hood ? '#3a6a2a' : shade(color.main, -0.3);
      if (u.type.includes('skirm')) { o.shield = true; o.shieldCol = '#8a6a42'; o.hood = false; o.helm = 1; }
    }
    drawHuman(ctx, o);
  }
  ctx.restore();
}

function drawRam(ctx, color, u, ph) {
  const walk = u.moving;
  ctx.fillStyle = '#2b1c10';
  for (const x of [-8, 7]) { ctx.beginPath(); ctx.arc(x, -3, 3.4, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#6b4a2a'; ctx.beginPath(); ctx.arc(x, -3, 1.2, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#2b1c10'; }
  // log
  const push = u.attackAnim > 0 ? Math.sin((u.attackAnim / 0.4) * Math.PI) * 4 : 0;
  ctx.fillStyle = '#6b4526'; ctx.fillRect(-10 + push, -10, 26, 4);
  ctx.fillStyle = '#50565e'; ctx.fillRect(15 + push, -11, 4, 6);
  // housing
  ctx.fillStyle = '#7a5530';
  ctx.beginPath(); ctx.moveTo(-13, -5); ctx.lineTo(13, -5); ctx.lineTo(10, -17); ctx.lineTo(-10, -17); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#5a3a1e';
  ctx.beginPath(); ctx.moveTo(-11, -17); ctx.lineTo(11, -17); ctx.lineTo(0, -24); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.6;
  for (let x = -10; x < 12; x += 3) { ctx.beginPath(); ctx.moveTo(x, -5); ctx.lineTo(x * 0.8, -17); ctx.stroke(); }
  ctx.fillStyle = color.main; ctx.fillRect(-9, -12, 18, 2.5);
  if (walk) { ctx.fillStyle = 'rgba(120,100,70,0.3)'; ctx.beginPath(); ctx.ellipse(-12, -1, 3, 1.5, 0, 0, Math.PI * 2); ctx.fill(); }
}
function drawMangonel(ctx, color, u) {
  ctx.fillStyle = '#2b1c10';
  for (const x of [-8, 8]) { ctx.beginPath(); ctx.arc(x, -3, 3, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#7a5530'; ctx.fillRect(-11, -8, 22, 4);
  ctx.fillStyle = '#6b4526'; ctx.fillRect(-3, -15, 3, 8); ctx.fillRect(3, -15, 3, 8);
  const fire = u.attackAnim > 0 ? u.attackAnim / 0.4 : 0;
  const ang = -2.3 + (1 - fire) * 0 + fire * 1.9;
  ctx.save(); ctx.translate(1.5, -13); ctx.rotate(u.atkCD > 0.5 && fire === 0 ? -0.5 : ang);
  ctx.fillStyle = '#8a6036'; ctx.fillRect(-1, 0, 2.2, 15);
  ctx.fillStyle = '#5a3a1e'; ctx.beginPath(); ctx.arc(0, 15, 2.8, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.fillStyle = color.main; ctx.fillRect(-10, -8, 5, 3);
}

export function drawAnimal(ctx, r, sx, sy, zoom, t) {
  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(zoom * (r.facing < 0 ? -1 : 1), zoom);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(0, 0, 6, 2.2, 0, 0, Math.PI * 2); ctx.fill();
  if (r.killed) {
    const k = 0.5 + 0.5 * (r.amount / r.max);
    ctx.fillStyle = '#7a2a1e'; ctx.beginPath(); ctx.ellipse(0, -1.5, 6 * k, 2.5 * k, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = r.type === 'sheep' ? '#eeeae0' : '#8a5a30';
    ctx.beginPath(); ctx.ellipse(-1, -2.5, 4.5 * k, 2 * k, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }
  const moving = !!r.tgt;
  const ph = r.animT * (moving ? 10 : 0);
  if (r.type === 'sheep') {
    for (const [lx, off] of [[-3, 0], [-1.5, 3], [2, 1.5], [3.4, 4.5]]) limb(ctx, lx, -4, lx + Math.sin(ph + off) * 1.2, -0.3, '#2a2420', 1.3);
    ctx.fillStyle = '#f2efe6';
    for (const [x, y, rr] of [[-2.5, -6, 3], [0.5, -6.8, 3.3], [3, -6, 2.8], [0, -4.8, 3.2], [-2, -8, 2.2], [2, -8, 2.2]]) { ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.beginPath(); ctx.arc(1, -4.5, 3, 0, Math.PI); ctx.fill();
    const graze = !moving && Math.sin(r.animT * 0.7 + r.variant) > 0.3 ? 3 : 0;
    ctx.fillStyle = '#2d2622'; ctx.beginPath(); ctx.ellipse(6, -7 + graze, 2, 1.6, 0.4, 0, Math.PI * 2); ctx.fill();
  } else {
    for (const [lx, off] of [[-3.5, 0], [-2, 3], [3, 1.5], [4.2, 4.5]]) limb(ctx, lx, -6, lx + Math.sin(ph + off) * 1.8, -0.3, '#5a3a20', 1.2);
    ctx.fillStyle = '#9a6a3c';
    ctx.beginPath(); ctx.ellipse(0, -7.5, 5.5, 2.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8d8c0'; ctx.beginPath(); ctx.ellipse(-4.5, -8, 1.3, 1.2, 0, 0, Math.PI * 2); ctx.fill();
    const graze = !moving && Math.sin(r.animT * 0.5 + r.variant) > 0.4 ? 5 : 0;
    ctx.fillStyle = '#9a6a3c';
    ctx.beginPath(); ctx.moveTo(3.5, -9); ctx.lineTo(6.5, -14 + graze); ctx.lineTo(8, -13 + graze); ctx.lineTo(5.5, -7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(8, -14 + graze, 2.2, 1.3, 0.4, 0, Math.PI * 2); ctx.fill();
    if (r.variant % 2) { ctx.strokeStyle = '#d8c8a8'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(7, -15 + graze); ctx.lineTo(5.5, -19 + graze); ctx.lineTo(4, -20 + graze); ctx.moveTo(5.8, -18 + graze); ctx.lineTo(7.5, -20 + graze); ctx.stroke(); }
  }
  ctx.restore();
}

export function drawCorpse(ctx, c, sx, sy, zoom, color) {
  const a = c.t > 25 ? Math.max(0, 1 - (c.t - 25) / 15) : 1;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(sx, sy); ctx.scale(zoom * (c.facing < 0 ? -1 : 1), zoom);
  const def = c.def;
  ctx.fillStyle = 'rgba(110,20,15,0.45)';
  ctx.beginPath(); ctx.ellipse(1, 0, 6, 2.2, 0, 0, Math.PI * 2); ctx.fill();
  if (c.type === 'ram' || c.type === 'mangonel') {
    ctx.fillStyle = '#4a3420';
    for (let i = 0; i < 6; i++) ctx.fillRect(-10 + i * 4, -3 - (i % 2) * 2, 5, 2);
  } else {
    if (def && def.horse) {
      ctx.fillStyle = def.horse === 'heavy' ? '#5b4636' : '#8a5a34';
      ctx.beginPath(); ctx.ellipse(0, -3, 9, 3.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(10, -1.5, 3.4, 1.6, 0.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = color.main; ctx.fillRect(-5, -3.5, 8, 3.2);
    ctx.fillStyle = SKIN; ctx.beginPath(); ctx.arc(5, -2, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4a3a28'; ctx.fillRect(-9, -2.6, 4, 2);
  }
  ctx.restore();
}

// ---------------- icons ----------------
const iconCache = new Map();
export function unitIcon(type, color, def) {
  const key = 'ui' + type + color.main;
  if (iconCache.has(key)) return iconCache.get(key);
  const c = document.createElement('canvas');
  c.width = 96; c.height = 96;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 96);
  g.addColorStop(0, '#5c6a78'); g.addColorStop(1, '#2c333b');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 96, 96);
  const fake = { def, type, facing: 1, animT: 0.3, attackAnim: 0, moving: false, working: false, carry: null, id: 1, atkCD: 0 };
  const z = def.cls === 'siege' ? 2.4 : def.horse ? 2.5 : 3.3;
  drawUnit(ctx, fake, def.horse ? 44 : 48, def.horse ? 90 : 88, z, color, 0);
  const url = c.toDataURL();
  iconCache.set(key, url);
  return url;
}
export function buildingIcon(type, color) {
  const key = 'bi' + type + color.main;
  if (iconCache.has(key)) return iconCache.get(key);
  const c = document.createElement('canvas');
  c.width = 96; c.height = 96;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 96);
  g.addColorStop(0, '#8fb0c8'); g.addColorStop(1, '#5d7a52');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 96, 96);
  const s = type === 'farm' ? farmSprite(2) : buildingSprite(type, color);
  const fit = Math.min(90 / s.w, 90 / s.h);
  ctx.drawImage(s.c, 48 - (s.w * fit) / 2, 48 - (s.h * fit) / 2, s.w * fit, s.h * fit);
  const url = c.toDataURL();
  iconCache.set(key, url);
  return url;
}
export function resourceIcon(type) {
  const key = 'ri' + type;
  if (iconCache.has(key)) return iconCache.get(key);
  const c = document.createElement('canvas');
  c.width = 96; c.height = 96;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 96);
  g.addColorStop(0, '#7a9a6a'); g.addColorStop(1, '#3d5a32');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 96, 96);
  let s;
  if (type === 'tree') s = treeSprite(4);
  else if (type === 'gold' || type === 'stone') s = mineSprite(type, 1, 1);
  else if (type === 'berry') s = berrySprite(1, 1);
  if (s) {
    const fit = Math.min(86 / s.w, 86 / s.h);
    ctx.drawImage(s.c, 48 - (s.w * fit) / 2, 50 - (s.h * fit) / 2, s.w * fit, s.h * fit);
  } else {
    drawAnimal(ctx, { type, killed: false, facing: 1, animT: 0, variant: 1, amount: 1, max: 1 }, 44, 76, 4.5, 0);
  }
  const url = c.toDataURL();
  iconCache.set(key, url);
  return url;
}
export function resIconSmall(type) {
  const key = 'rs' + type;
  if (iconCache.has(key)) return iconCache.get(key);
  const c = document.createElement('canvas'); c.width = 40; c.height = 40;
  const ctx = c.getContext('2d');
  ctx.translate(20, 20);
  if (type === 'wood') {
    for (const [y, col] of [[5, '#6e4424'], [-1, '#7e5030'], [-7, '#8a5a34']]) {
      ctx.fillStyle = col; ctx.fillRect(-14, y - 4, 26, 8);
      ctx.fillStyle = '#e0bb85'; ctx.beginPath(); ctx.ellipse(12, y, 3, 4, 0, 0, Math.PI * 2); ctx.fill();
    }
  } else if (type === 'food') {
    ctx.fillStyle = '#c8412e'; ctx.beginPath(); ctx.arc(-3, 3, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8d8c0'; ctx.fillRect(4, -12, 5, 12);
    ctx.beginPath(); ctx.arc(6.5, -13, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.arc(-6, -1, 4, 0, Math.PI * 2); ctx.fill();
  } else if (type === 'gold') {
    for (const [x, y] of [[-7, 5], [6, 5], [0, -4]]) {
      const g = ctx.createRadialGradient(x - 2, y - 2, 1, x, y, 8);
      g.addColorStop(0, '#fff3a0'); g.addColorStop(0.5, '#f0c030'); g.addColorStop(1, '#a07010');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
    }
  } else if (type === 'stone') {
    ctx.fillStyle = '#7a7a7a'; ctx.beginPath(); ctx.moveTo(-15, 10); ctx.lineTo(-10, -8); ctx.lineTo(4, -13); ctx.lineTo(15, -2); ctx.lineTo(12, 11); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#b5b5b5'; ctx.beginPath(); ctx.moveTo(-12, 8); ctx.lineTo(-9, -7); ctx.lineTo(4, -12); ctx.lineTo(1, 6); ctx.closePath(); ctx.fill();
  } else if (type === 'pop') {
    ctx.fillStyle = '#e2b48c'; ctx.beginPath(); ctx.arc(0, -8, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4a7ad8'; ctx.beginPath(); ctx.moveTo(-11, 15); ctx.quadraticCurveTo(-10, -1, 0, -1); ctx.quadraticCurveTo(10, -1, 11, 15); ctx.fill();
  }
  const url = c.toDataURL();
  iconCache.set(key, url);
  return url;
}
