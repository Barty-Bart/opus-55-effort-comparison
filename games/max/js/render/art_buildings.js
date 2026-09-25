// Procedural building art. Every building is modelled from textured 3D primitives.
import { Painter, MPX, SS, proj, makeCanvas, shade, v3, LIGHT } from './draw3d.js';
import { materials } from './textures.js';
import { RNG } from '../core/rng.js';

const T = MPX;

// ------------------------------------------------------------------ measuring / shadow painters
class MeasurePainter extends Painter {
  constructor() {
    super({ save() {}, restore() {}, beginPath() {}, closePath() {}, clip() {}, fill() {}, stroke() {}, fillRect() {}, transform() {}, createPattern() { return null; }, createLinearGradient() { return { addColorStop() {} }; }, moveTo: (x, y) => this.acc(x, y), lineTo: (x, y) => this.acc(x, y), arc() {} });
    this.x0 = 1e9; this.y0 = 1e9; this.x1 = -1e9; this.y1 = -1e9;
  }
  acc(x, y) { if (x < this.x0) this.x0 = x; if (x > this.x1) this.x1 = x; if (y < this.y0) this.y0 = y; if (y > this.y1) this.y1 = y; }
}

const SHX = -LIGHT[0] / LIGHT[2], SHY = -LIGHT[1] / LIGHT[2];
function groundOf(p) { return [p[0] + SHX * p[2], p[1] + SHY * p[2], 0]; }

function hull(points) {
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

// Shadow painter: every primitive paints the convex hull of its ground projection.
class ShadowPainter extends Painter {
  constructor(ctx) { super(ctx); }
  blob(pts3) {
    const scr = pts3.map((p) => proj(...groundOf(p)));
    const h = hull(scr);
    const ctx = this.ctx;
    ctx.beginPath();
    h.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
    ctx.closePath();
    ctx.fill();
  }
  face(pts) { this.blob(pts); return true; }
  box(x, y, z, w, d, h) {
    const P = [];
    for (const X of [x, x + w]) for (const Y of [y, y + d]) for (const Z of [z, z + h]) P.push([X, Y, Z]);
    this.blob(P);
  }
  gable(x, y, z, w, d, h, axis, r, g, ov = 3) {
    const P = [[x - ov, y - ov, z], [x + w + ov, y - ov, z], [x + w + ov, y + d + ov, z], [x - ov, y + d + ov, z]];
    if (axis === 'x') P.push([x - ov, y + d / 2, z + h], [x + w + ov, y + d / 2, z + h]);
    else P.push([x + w / 2, y - ov, z + h], [x + w / 2, y + d + ov, z + h]);
    P.push([x, y, 0], [x + w, y, 0], [x + w, y + d, 0], [x, y + d, 0]);
    this.blob(P);
  }
  hip(x, y, z, w, d, h, r, ov = 3) {
    this.blob([[x - ov, y - ov, z], [x + w + ov, y - ov, z], [x + w + ov, y + d + ov, z], [x - ov, y + d + ov, z], [x + w / 2, y + d / 2, z + h], [x, y, 0], [x + w, y + d, 0], [x + w, y, 0], [x, y + d, 0]]);
  }
  cylinder(cx, cy, z, r, h) {
    const P = [];
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; P.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, z], [cx + Math.cos(a) * r, cy + Math.sin(a) * r, z + h], [cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0]); }
    this.blob(P);
  }
  cone(cx, cy, z, r, h) {
    const P = [[cx, cy, z + h]];
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; P.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, z]); }
    this.blob(P);
  }
  revolve(cx, cy, prof) {
    const P = [];
    for (const [r, z] of prof) for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; P.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, z]); }
    this.blob(P);
  }
  crenels() {}
  rectOn() {} archOn() {}
  poly(pts) { this.blob(pts); }
  line(a, b, color, w = 1) {
    const ctx = this.ctx;
    const [x0, y0] = proj(...groundOf(a)), [x1, y1] = proj(...groundOf(b));
    ctx.lineWidth = w * 1.2; ctx.strokeStyle = '#000'; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
}

// ------------------------------------------------------------------ helpers
function styleMats(st) {
  const M = materials();
  return {
    wall: [M.log, M.timber, M.stone, M.stone][st],
    wall2: [M.plank, M.timberDark, M.stoneWarm, M.sandstone][st],
    base: [M.plankDark, M.stoneDark, M.stoneDark, M.stoneDark][st],
    roof: [M.thatch, M.thatch, M.tile, M.slate][st],
    roof2: [M.thatchDark, M.shingle, M.tileDark, M.tile][st],
    plank: M.plank,
    stone: M.stone,
  };
}
const DOOR = '#2b1a0e', WIN = '#1f1a1f', WINLIT = '#e8b04a';

function banner(p, O, U, u, v, w, h, team) {
  // hanging cloth banner on a wall face
  const V = [0, 0, -1];
  const P = (a, b) => v3.add(v3.add(O, v3.mul(U, a)), v3.mul(V, b));
  const n = v3.cross(U, V);
  p.poly([P(u, v), P(u + w, v), P(u + w, v + h), P(u + w / 2, v + h + w * 0.45), P(u, v + h)], team.main, { normal: n, stroke: shade(team.main, 0.45) });
  p.poly([P(u + w * 0.3, v + h * 0.25), P(u + w * 0.7, v + h * 0.25), P(u + w * 0.7, v + h * 0.55), P(u + w * 0.3, v + h * 0.55)], '#e8d27a', { normal: n });
}

function flagPole(p, out, x, y, z, h) {
  p.line([x, y, z], [x, y, z + h], '#3a2a1c', 1.6);
  out.flags.push({ x, y, z: z + h });
}

function barrel(p, x, y, z = 0) {
  const M = materials();
  p.cylinder(x, y, z, 4.2, 9, M.plankDark, { seg: 10, top: { color: '#6a4a2a' }, noAO: true });
}
function crate(p, x, y, z = 0, s = 8) {
  const M = materials();
  p.box(x, y, z, s, s, s, M.plankH, M.plank, { noAO: true });
}
function logPile(p, x, y, n = 3) {
  const M = materials();
  for (let i = 0; i < n; i++) {
    const zz = i < 2 ? 0 : 5;
    const yy = y + (i % 2) * 5.5 + (i >= 2 ? 2.7 : 0);
    // logs lying along x: approximate as boxes with log texture ends
    p.box(x, yy, zz, 26, 5, 5, M.log, M.log, { noAO: true });
    p.face([[x + 26, yy, zz + 5], [x + 26, yy + 5, zz + 5], [x + 26, yy + 5, zz], [x + 26, yy, zz]], { color: '#c8a070' }, { normal: [1, 0, 0] });
  }
}

// Shed roof sloping toward +y (front)
function shed(p, x, y, z, w, d, hBack, hFront, mat) {
  const back = [[x - 2, y - 2, z + hBack], [x + w + 2, y - 2, z + hBack], [x + w + 2, y + d + 3, z + hFront], [x - 2, y + d + 3, z + hFront]];
  p.face(back, mat, { O: back[0], U: [1, 0, 0], V: v3.norm(v3.sub(back[3], back[0])) });
  p.face([[x + w + 2, y + d + 3, z + hFront], [x + w + 2, y - 2, z + hBack], [x + w + 2, y - 2, z + hBack - 2.5], [x + w + 2, y + d + 3, z + hFront - 2.5]], materials().plankDark, { normal: [1, 0, 0] });
  p.face([[x - 2, y + d + 3, z + hFront], [x + w + 2, y + d + 3, z + hFront], [x + w + 2, y + d + 3, z + hFront - 2.5], [x - 2, y + d + 3, z + hFront - 2.5]], materials().plankDark, { normal: [0, 1, 0] });
}

// ------------------------------------------------------------------ building designs
// Each design: (p, S, st, team, rng, out) — draws in back-to-front order.
const DESIGNS = {
  house(p, S, st, team, rng, out) {
    const m = styleMats(st), M = materials();
    const x = 14, y = 14, w = S - 26, d = S - 30;
    const wallH = st >= 2 ? 30 : 27;
    if (st >= 2) {
      p.box(x, y, 0, w, d, 11, m.stone, null);
      p.box(x, y, 11, w, d, wallH - 11, M.timber, null);
    } else p.box(x, y, 0, w, d, wallH, m.wall, null);
    // chimney behind roof
    const cx = x + w * 0.72, cy = y + d * 0.3;
    p.box(cx, cy, 0, 8, 8, wallH + 30, st >= 1 ? M.stoneDark : M.stoneDark, M.dark);
    out.smoke.push({ x: cx + 4, y: cy + 4, z: wallH + 31, rate: 0.35 });
    p.gable(x, y, wallH, w, d, st >= 2 ? 24 : 26, 'x', m.roof, st >= 2 ? M.timber : m.wall2, 4);
    // door & window on front (+y) face
    const O = [x, y + d, wallH], U = [1, 0, 0];
    p.rectOn(O, U, w * 0.18, wallH - 17, w * 0.18 + 10, wallH, DOOR, { stroke: '#150c05' });
    p.rectOn(O, U, w * 0.58, wallH - 19, w * 0.58 + 9, wallH - 11, rng.next() < 0.5 ? WINLIT : WIN, { stroke: '#3a2412', lw: 1.2 });
    const O2 = [x + w, y + d, wallH], U2 = [0, -1, 0];
    p.rectOn(O2, U2, d * 0.35, wallH - 19, d * 0.35 + 9, wallH - 11, WIN, { stroke: '#3a2412', lw: 1.2 });
    barrel(p, x + w + 5, y + d * 0.25);
    if (rng.next() < 0.5) crate(p, x + w + 3, y + d * 0.55);
  },

  townCenter(p, S, st, team, rng, out) {
    const m = styleMats(st), M = materials();
    // courtyard
    p.face([[6, 6, 0.5], [S - 6, 6, 0.5], [S - 6, S - 6, 0.5], [6, S - 6, 0.5]], M.cobble, { normal: [0, 0, 1], O: [0, 0, 0], U: [1, 0, 0], V: [0, 1, 0], edge: false });
    // back wing (left)
    p.box(16, 16, 0, 50, 64, 30, m.wall2, null);
    p.gable(16, 16, 30, 50, 64, 22, 'y', m.roof2, m.wall2, 3);
    // back wing (right)
    p.box(98, 14, 0, 66, 44, 28, m.wall2, null);
    p.gable(98, 14, 28, 66, 44, 20, 'x', m.roof2, m.wall2, 3);
    // main hall
    const hx = 34, hy = 44, hw = 112, hd = 110, hh = st >= 2 ? 44 : 40;
    if (st >= 2) { p.box(hx, hy, 0, hw, hd, 14, m.base, null); p.box(hx, hy, 14, hw, hd, hh - 14, m.wall, null); }
    else p.box(hx, hy, 0, hw, hd, hh, m.wall, null);
    // tower rising through the roof
    const tx = hx + hw / 2 - 17, ty = hy + hd / 2 - 17;
    p.hip(hx, hy, hh, hw, hd, 38, m.roof, 7);
    const tH = hh + 62;
    p.box(tx, ty, hh + 14, 34, 34, tH - hh - 14, st >= 1 ? M.stone : M.timber, null);
    // tower windows
    p.rectOn([tx, ty + 34, tH], [1, 0, 0], 10, 10, 24, 22, WIN, { stroke: '#2a1a0a' });
    p.rectOn([tx + 34, ty + 34, tH], [0, -1, 0], 10, 10, 24, 22, WIN, { stroke: '#2a1a0a' });
    if (st >= 2) {
      p.box(tx - 3, ty - 3, tH, 40, 40, 5, M.stone, M.stoneDark, { noAO: true });
      p.crenels(tx - 3, ty - 3, tH + 5, 40, 40, M.stone, 5, 5);
      flagPole(p, out, tx + 17, ty + 17, tH + 5, 34);
    } else {
      p.hip(tx, ty, tH, 34, 34, 24, m.roof2, 4);
      flagPole(p, out, tx + 17, ty + 17, tH + 22, 22);
    }
    // front door & windows
    const O = [hx, hy + hd, hh], U = [1, 0, 0];
    p.archOn(O, U, hw * 0.4, hh - 30, hw * 0.4 + 22, hh, DOOR, { stroke: '#150c05' });
    for (const u of [12, 74]) p.archOn(O, U, u, 12, u + 12, 26, WINLIT, { stroke: '#3a2412', lw: 1.3 });
    const O2 = [hx + hw, hy + hd, hh], U2 = [0, -1, 0];
    for (const u of [16, 50, 84]) p.archOn(O2, U2, u, 12, u + 12, 26, WIN, { stroke: '#3a2412', lw: 1.3 });
    banner(p, O, U, hw * 0.4 - 16, 4, 10, 22, team);
    banner(p, O, U, hw * 0.4 + 28, 4, 10, 22, team);
    banner(p, O2, U2, 68, 4, 10, 22, team);
    // front market bits
    barrel(p, hx + hw + 8, hy + hd + 10);
    crate(p, hx + 6, hy + hd + 8);
    crate(p, hx + 15, hy + hd + 12, 0, 7);
    out.smoke.push({ x: hx + 20, y: hy + 20, z: hh + 30, rate: 0.25 });
  },

  mill(p, S, st, team, rng, out) {
    const m = styleMats(st), M = materials();
    const cx = S / 2 + 4, cy = S / 2 - 2;
    // side shed
    p.box(10, 42, 0, 30, 36, 16, m.wall2, null);
    shed(p, 10, 42, 0, 30, 36, 22, 14, m.roof2);
    const r = 22, h = 50;
    p.cylinder(cx, cy, 0, r, h, st >= 2 ? M.stone : st === 1 ? M.timber : M.plank, { seg: 14 });
    p.cone(cx, cy, h, r + 4, 26, m.roof, { seg: 14 });
    // door
    p.rectOn([cx - 6, cy + r - 1, h], [1, 0, 0], 0, h - 16, 11, h, DOOR, { stroke: '#150c05' });
    // grain sacks
    p.box(S - 30, S - 26, 0, 9, 7, 6, { color: '#d8c89a' }, { color: '#e8dab0' }, { noAO: true });
    p.box(S - 22, S - 20, 0, 8, 7, 5, { color: '#cdbb8a' }, { color: '#e0d0a0' }, { noAO: true });
    out.sails = { x: cx + r * 0.62, y: cy + r * 0.62, z: h + 6, r: 38 };
  },

  lumberCamp(p, S, st, team, rng, out) {
    const m = styleMats(st), M = materials();
    // open shed on four posts
    const x = 12, y = 12, w = 52, d = 40, h = 26;
    for (const [px, py] of [[x, y], [x + w, y], [x, y + d]]) p.box(px - 2, py - 2, 0, 4, 4, h, M.plankDark, null, { noAO: true });
    p.box(x + 4, y + 2, 0, w - 8, 5, h - 8, M.plank, null, { noAO: true });
    logPile(p, x + 8, y + 10, 4);
    p.box(x + w - 2, y + d - 2, 0, 4, 4, h, M.plankDark, null, { noAO: true });
    shed(p, x, y, 0, w, d, h + 8, h, m.roof2);
    logPile(p, 20, S - 26, 3);
    // stump with axe
    p.cylinder(S - 20, S - 34, 0, 6, 6, M.log, { seg: 10, top: { color: '#c8a070' }, noAO: true });
    p.line([S - 20, S - 34, 6], [S - 14, S - 30, 15], '#5a3a1e', 1.4);
    p.poly([[S - 15, S - 31, 13], [S - 11, S - 29, 16], [S - 13, S - 27, 11]], '#8a8f96');
    flagPole(p, out, x + w + 4, y + 4, 0, 40);
  },

  miningCamp(p, S, st, team, rng, out) {
    const m = styleMats(st), M = materials();
    const x = 12, y = 12, w = 52, d = 40, h = 26;
    for (const [px, py] of [[x, y], [x + w, y], [x, y + d]]) p.box(px - 2, py - 2, 0, 4, 4, h, M.plankDark, null, { noAO: true });
    p.box(x + 4, y + 2, 0, w - 8, 5, h - 8, M.plank, null, { noAO: true });
    // ore piles
    for (let i = 0; i < 6; i++) {
      const gx = x + 10 + (i % 3) * 11, gy = y + 12 + Math.floor(i / 3) * 10;
      p.poly([[gx, gy, 0], [gx + 9, gy, 0], [gx + 5, gy + 4, 7]], i % 2 ? '#d8b640' : '#9a9690');
      p.poly([[gx + 9, gy, 0], [gx + 9, gy + 8, 0], [gx + 5, gy + 4, 7]], i % 2 ? '#c8a030' : '#8a8680');
      p.poly([[gx, gy + 8, 0], [gx + 9, gy + 8, 0], [gx + 5, gy + 4, 7]], i % 2 ? '#e8c850' : '#aaa6a0');
    }
    p.box(x + w - 2, y + d - 2, 0, 4, 4, h, M.plankDark, null, { noAO: true });
    shed(p, x, y, 0, w, d, h + 8, h, m.roof2);
    // mine cart
    const cx = S - 36, cy = S - 30;
    p.box(cx, cy, 3, 18, 12, 9, M.plankDark, { color: '#caa24a' }, { noAO: true });
    for (const [wx, wy] of [[cx + 3, cy + 12], [cx + 14, cy + 12]]) p.poly(Array.from({ length: 10 }, (_, i) => [wx + Math.cos(i / 10 * 6.283) * 3.2, wy, 3 + Math.sin(i / 10 * 6.283) * 3.2]), '#3a2a1a', { normal: [0, 1, 0] });
    p.line([cx + 18, cy + 6, 9], [cx + 26, cy + 6, 13], '#5a3a1e', 1.4);
    flagPole(p, out, x + w + 4, y + 4, 0, 40);
  },

  barracks(p, S, st, team, rng, out) {
    const m = styleMats(st), M = materials();
    // back hall along x
    const wallH = 32;
    p.box(12, 12, 0, S - 24, 52, wallH, m.wall, null);
    p.gable(12, 12, wallH, S - 24, 52, 26, 'x', m.roof, m.wall2, 4);
    // left wing along y
    p.box(12, 64, 0, 44, S - 76, 26, m.wall2, null);
    p.gable(12, 64, 26, 44, S - 76, 22, 'y', m.roof2, m.wall2, 3);
    const O = [12, S - 12, 26], U = [1, 0, 0];
    p.archOn(O, U, 14, 6, 30, 26, DOOR, { stroke: '#150c05' });
    banner(p, [12 + 44, S - 12, 26], [0, -1, 0], 18, 3, 9, 18, team);
    const Oh = [56, 64, wallH], Uh = [1, 0, 0];
    for (const u of [8, 30, 52]) p.rectOn(Oh, Uh, u, 10, u + 9, 20, WIN, { stroke: '#3a2412', lw: 1.2 });
    banner(p, [S - 12, 64, wallH], [0, -1, 0], 14, 3, 10, 22, team);
    // yard: weapon rack & dummy
    const yx = 66, yy = 76;
    p.box(yx, yy + 8, 0, 30, 3, 12, M.plankDark, null, { noAO: true });
    for (let i = 0; i < 4; i++) p.line([yx + 4 + i * 7, yy + 10, 0], [yx + 4 + i * 7 + 1, yy + 11, 22], '#8a8f96', 1.2);
    p.line([S - 28, S - 30, 0], [S - 28, S - 30, 22], '#5a3a1e', 2);
    p.line([S - 34, S - 30, 16], [S - 22, S - 30, 16], '#5a3a1e', 1.6);
    p.cylinder(S - 28, S - 30, 10, 4, 10, M.thatch, { seg: 8, noAO: true });
    // fence
    for (let t = 0; t <= 60; t += 10) { p.line([60 + t, S - 12, 0], [60 + t, S - 12, 8], '#6a4a2a', 1.5); p.line([S - 12, 70 + t, 0], [S - 12, 70 + t, 8], '#6a4a2a', 1.5); }
    p.line([60, S - 12, 6], [S - 12, S - 12, 6], '#7a5a34', 1.2);
    p.line([S - 12, 70, 6], [S - 12, S - 12, 6], '#7a5a34', 1.2);
    flagPole(p, out, S - 16, 16, wallH + 10, 30);
  },

  archeryRange(p, S, st, team, rng, out) {
    const m = styleMats(st), M = materials();
    const wallH = 30;
    p.box(12, 12, 0, S - 24, 54, wallH, m.wall, null);
    p.gable(12, 12, wallH, S - 24, 54, 24, 'x', m.roof, m.wall2, 4);
    const O = [12, 66, wallH], U = [1, 0, 0];
    p.archOn(O, U, 18, 8, 36, wallH, DOOR, { stroke: '#150c05' });
    for (const u of [52, 72, 92]) p.archOn(O, U, u, 8, u + 10, 20, WIN, { stroke: '#3a2412', lw: 1.2 });
    banner(p, [S - 12, 66, wallH], [0, -1, 0], 20, 3, 10, 22, team);
    // targets
    for (let i = 0; i < 3; i++) {
      const tx = 30 + i * 32, ty = S - 34;
      p.line([tx - 3, ty + 3, 0], [tx, ty, 18], '#5a3a1e', 1.6);
      p.line([tx + 6, ty + 3, 0], [tx + 3, ty, 18], '#5a3a1e', 1.6);
      const c = [tx + 1.5, ty + 1, 18];
      const ring = (r, col) => p.poly(Array.from({ length: 14 }, (_, k) => [c[0] + Math.cos(k / 14 * 6.283) * r * 0.7, c[1] + 1 + Math.cos(k / 14 * 6.283) * r * 0.7, c[2] + Math.sin(k / 14 * 6.283) * r]), col, { normal: [1, 1, 0.3] });
      ring(9, '#d8c28a'); ring(6.5, '#b83a2a'); ring(4, '#e8dcb0'); ring(1.8, '#b83a2a');
    }
    for (let t = 0; t <= S - 24; t += 12) p.line([12 + t, S - 12, 0], [12 + t, S - 12, 7], '#6a4a2a', 1.4);
    p.line([12, S - 12, 5], [S - 12, S - 12, 5], '#7a5a34', 1.2);
    flagPole(p, out, S - 18, 16, wallH + 10, 30);
  },

  stable(p, S, st, team, rng, out) {
    const m = styleMats(st), M = materials();
    const x = 14, y = 12, w = S - 28, d = S - 44, wallH = 28;
    p.box(x, y, 0, w, d, wallH, st >= 2 ? M.stoneWarm : M.plank, null);
    p.gable(x, y, wallH, w, d, 34, 'y', m.roof, st >= 2 ? M.stoneWarm : M.plank, 4);
    // stall openings on the front (+y) face
    const O = [x, y + d, wallH], U = [1, 0, 0];
    for (let i = 0; i < 4; i++) {
      p.rectOn(O, U, 6 + i * 25, 8, 6 + i * 25 + 17, wallH, '#2a1a0e', { stroke: '#4a2e16' });
      p.rectOn(O, U, 6 + i * 25, wallH - 11, 6 + i * 25 + 17, wallH - 9, '#6a4a2a');
    }
    p.rectOn([x + w, y + d, wallH], [0, -1, 0], d * 0.3, 6, d * 0.3 + 22, wallH, '#2a1a0e', { stroke: '#4a2e16' });
    banner(p, [x + w, y + d, wallH], [0, -1, 0], d * 0.72, 2, 9, 18, team);
    // hay bales & trough
    p.box(S - 40, S - 26, 0, 12, 9, 7, M.thatch, M.thatch, { noAO: true });
    p.box(S - 26, S - 24, 0, 11, 9, 7, M.thatchDark, M.thatch, { noAO: true });
    p.box(24, S - 24, 0, 22, 7, 6, M.plankDark, { color: '#4a6a8a' }, { noAO: true });
    flagPole(p, out, x + w / 2, y + d / 2, wallH + 34, 20);
  },

  blacksmith(p, S, st, team, rng, out) {
    const m = styleMats(st), M = materials();
    const x = 14, y = 14, w = S - 44, d = S - 30, wallH = 30;
    // chimney at back
    p.box(x + 8, y + 6, 0, 14, 14, wallH + 36, M.stoneDark, M.dark);
    out.smoke.push({ x: x + 15, y: y + 13, z: wallH + 37, rate: 1.4, dark: true });
    p.box(x, y, 0, w, d, wallH, st >= 1 ? M.stone : M.log, null);
    p.gable(x, y, wallH, w, d, 26, 'y', m.roof, st >= 1 ? M.stone : M.log, 4);
    // open forge side (+x)
    const O2 = [x + w, y + d, wallH], U2 = [0, -1, 0];
    p.rectOn(O2, U2, 12, 8, 40, wallH, '#1e1410', { stroke: '#3a2412' });
    p.rectOn(O2, U2, 18, wallH - 12, 34, wallH - 4, '#ff8a2a');
    p.rectOn(O2, U2, 21, wallH - 10, 31, wallH - 6, '#ffd070');
    p.archOn([x, y + d, wallH], [1, 0, 0], w * 0.3, 8, w * 0.3 + 14, wallH, DOOR, { stroke: '#150c05' });
    // anvil & quench barrel outside
    const ax = x + w + 12, ay = y + d * 0.55;
    p.box(ax, ay, 0, 5, 5, 7, M.plankDark, null, { noAO: true });
    p.box(ax - 3, ay - 1, 7, 11, 7, 3.5, M.iron, M.iron, { noAO: true });
    barrel(p, ax + 4, ay + 16);
    banner(p, [x, y + d, wallH], [1, 0, 0], w * 0.68, 3, 9, 18, team);
    flagPole(p, out, x + w - 8, y + 8, wallH + 20, 24);
  },

  market(p, S, st, team, rng, out) {
    const m = styleMats(st), M = materials();
    p.face([[8, 8, 0.5], [S - 8, 8, 0.5], [S - 8, S - 8, 0.5], [8, S - 8, 0.5]], M.cobble, { normal: [0, 0, 1], O: [0, 0, 0], U: [1, 0, 0], V: [0, 1, 0], edge: false });
    // back hall
    p.box(20, 18, 0, 90, 50, 32, m.wall, null);
    p.gable(20, 18, 32, 90, 50, 24, 'x', m.roof, m.wall2, 4);
    p.box(118, 22, 0, 44, 60, 26, m.wall2, null);
    p.hip(118, 22, 26, 44, 60, 22, m.roof2, 3);
    // stalls with striped awnings
    const cols = [team.main, '#d8c060', '#3a8a5a', team.main, '#b84a3a'];
    const stall = (sx, sy, c) => {
      for (const [px, py] of [[sx, sy], [sx + 26, sy], [sx, sy + 20], [sx + 26, sy + 20]]) p.line([px, py, 0], [px, py, 16], '#5a3a1e', 1.4);
      p.box(sx + 2, sy + 4, 0, 22, 10, 8, M.plankH, { color: '#8a6a3a' }, { noAO: true });
      for (let k = 0; k < 4; k++) p.box(sx + 4 + k * 5, sy + 6, 8, 3.5, 3.5, 2.5, { color: ['#d84a3a', '#e8c040', '#7ab04a', '#c87a2a'][k] }, { color: ['#e85a4a', '#f8d050', '#8ac05a', '#d88a3a'][k] }, { noAO: true });
      const aw = [[sx - 3, sy - 3, 20], [sx + 29, sy - 3, 20], [sx + 29, sy + 25, 14], [sx - 3, sy + 25, 14]];
      p.poly(aw, c, { stroke: shade(c, 0.5) });
      for (let k = 1; k < 4; k += 2) p.poly([v3.lerp(aw[0], aw[1], k / 4), v3.lerp(aw[0], aw[1], (k + 1) / 4), v3.lerp(aw[3], aw[2], (k + 1) / 4), v3.lerp(aw[3], aw[2], k / 4)], '#efe6d0');
    };
    stall(22, 86, cols[0]);
    stall(66, 100, cols[1]);
    stall(118, 96, cols[2]);
    stall(34, 134, cols[3]);
    stall(96, 142, cols[4]);
    barrel(p, 150, 150); barrel(p, 160, 142); crate(p, 14, 160); crate(p, 22, 168, 0, 7);
    flagPole(p, out, 140, 50, 48, 26);
  },

  watchTower(p, S, st, team, rng, out) { tower(p, S, st, team, out, 0); },
  guardTower(p, S, st, team, rng, out) { tower(p, S, st, team, out, 1); },
  keep(p, S, st, team, rng, out) { tower(p, S, st, team, out, 2); },

  castle(p, S, st, team, rng, out) {
    const M = materials();
    const wall = M.stone, top = M.stoneDark;
    const e = 16, H = 46;
    // back curtain walls
    p.box(e, e, 0, S - 2 * e, 16, H, wall, top);
    p.crenels(e, e, H, S - 2 * e, 16, wall, 5, 6);
    p.box(e, e, 0, 16, S - 2 * e, H, wall, top);
    p.crenels(e, e, H, 16, S - 2 * e, wall, 5, 6);
    // keep
    const kx = 54, ky = 50, kw = 72, kd = 72, kh = 96;
    p.box(kx, ky, 0, kw, kd, kh, M.stone, top);
    p.crenels(kx, ky, kh, kw, kd, wall, 6, 7);
    p.box(kx + 20, ky + 20, kh, 30, 30, 22, M.stone, top);
    p.crenels(kx + 20, ky + 20, kh + 22, 30, 30, wall, 5, 6);
    flagPole(p, out, kx + 35, ky + 35, kh + 22, 36);
    for (const u of [16, 44]) p.archOn([kx, ky + kd, kh], [1, 0, 0], u, 24, u + 9, 40, WIN, { stroke: '#222' });
    for (const u of [18, 46]) p.archOn([kx + kw, ky + kd, kh], [0, -1, 0], u, 24, u + 9, 40, WIN, { stroke: '#222' });
    banner(p, [kx, ky + kd, kh], [1, 0, 0], 28, 48, 14, 30, team);
    banner(p, [kx + kw, ky + kd, kh], [0, -1, 0], 30, 48, 14, 30, team);
    // back corner tower
    const ct = (cx, cy) => {
      p.cylinder(cx, cy, 0, 20, H + 24, M.stone, { seg: 16 });
      p.cylinder(cx, cy, H + 24, 23, 6, M.stoneDark, { seg: 16, top: M.stoneDark, noAO: true });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.2;
        const bx = cx + Math.cos(a) * 20, by = cy + Math.sin(a) * 20;
        if (Math.cos(a) + Math.sin(a) < -0.6) continue;
        p.box(bx - 2.5, by - 2.5, H + 30, 5, 5, 6, wall, top, { noAO: true });
      }
    };
    ct(e + 4, e + 4);
    // front walls
    p.box(S - e - 16, e, 0, 16, S - 2 * e, H, wall, top);
    p.crenels(S - e - 16, e, H, 16, S - 2 * e, wall, 5, 6);
    ct(S - e - 4, e + 4);
    ct(e + 4, S - e - 4);
    p.box(e, S - e - 16, 0, S - 2 * e, 16, H, wall, top);
    p.crenels(e, S - e - 16, H, S - 2 * e, 16, wall, 5, 6);
    // gate
    p.archOn([e, S - e, H], [1, 0, 0], (S - 2 * e) / 2 - 14, 14, (S - 2 * e) / 2 + 14, H, '#1e140c', { stroke: '#101010' });
    banner(p, [e, S - e, H], [1, 0, 0], 20, 4, 12, 26, team);
    banner(p, [e, S - e, H], [1, 0, 0], S - 2 * e - 32, 4, 12, 26, team);
    ct(S - e - 4, S - e - 4);
    out.flags.push();
  },

  monastery(p, S, st, team, rng, out) {
    const M = materials();
    const wall = st >= 3 ? M.sandstone : M.stoneWarm;
    const x = 14, y = 30, w = S - 50, d = 56, h = 40;
    p.box(x, y, 0, w, d, h, wall, null);
    p.gable(x, y, h, w, d, 30, 'x', M.tileDark, wall, 4);
    // apse at back is hidden; bell tower at the front-right
    const tx = x + w - 6, ty = y + d - 2, tw = 32;
    p.box(tx, ty - tw + 8, 0, tw, tw, h + 46, wall, null);
    p.archOn([tx, ty + 8, h + 46], [1, 0, 0], 10, 8, 22, 26, '#1a1410', { stroke: '#3a2a1a' });
    p.archOn([tx + tw, ty + 8, h + 46], [0, -1, 0], 10, 8, 22, 26, '#1a1410', { stroke: '#3a2a1a' });
    p.hip(tx, ty - tw + 8, h + 46, tw, tw, 34, M.tileDark, 3);
    // cross
    const cx = tx + tw / 2, cy = ty - tw / 2 + 8, cz = h + 46 + 33;
    p.line([cx, cy, cz], [cx, cy, cz + 14], '#d8b640', 2);
    p.line([cx - 3.5, cy + 3.5, cz + 9], [cx + 3.5, cy - 3.5, cz + 9], '#d8b640', 2);
    // rose window & door
    const O = [x, y + d, h], U = [1, 0, 0];
    p.archOn(O, U, w * 0.25, 10, w * 0.25 + 14, h, DOOR, { stroke: '#150c05' });
    for (const u of [w * 0.5, w * 0.68]) {
      p.archOn(O, U, u, 8, u + 10, 26, '#3a5aa8', { stroke: '#d8b640', lw: 1 });
    }
    banner(p, O, U, 6, 4, 9, 20, team);
    // garden
    for (let i = 0; i < 5; i++) p.cylinder(22 + i * 14, S - 22, 0, 4, 5, { color: '#4a7a3a' }, { seg: 8, top: { color: '#5a9a4a' }, noAO: true });
  },

  university(p, S, st, team, rng, out) {
    const M = materials();
    const wall = M.sandstone;
    const x = 14, y = 14, w = S - 28, d = S - 36, h = 36;
    p.box(x, y, 0, w, d, h, wall, M.stoneWarm);
    // dome drum and dome
    const cx = x + w / 2, cy = y + d / 2;
    p.cylinder(cx, cy, h, 30, 14, wall, { seg: 18 });
    p.box(cx - 33, cy - 33, h + 14, 66, 66, 0.01, M.stoneWarm, null, { noAO: true });
    const prof = [];
    for (let k = 0; k <= 7; k++) { const a = (k / 7) * Math.PI / 2; prof.push([31 * Math.cos(a), h + 14 + 30 * Math.sin(a)]); }
    p.revolve(cx, cy, prof, st >= 3 ? M.slate : M.tileDark, { seg: 18 });
    p.cylinder(cx, cy, h + 43, 3.5, 8, M.stoneWarm, { seg: 8, noAO: true });
    p.cone(cx, cy, h + 51, 4.5, 9, { color: '#d8b640' }, { seg: 8 });
    // colonnade on the front
    const O = [x, y + d, h], U = [1, 0, 0];
    for (let i = 0; i < 6; i++) {
      const u = 10 + i * ((w - 20) / 5);
      p.cylinder(x + u, y + d + 8, 0, 3.2, h - 4, M.marble, { seg: 8, noAO: true });
    }
    p.box(x, y + d, h - 4, w, 12, 5, M.marble, M.marble, { noAO: true });
    p.archOn(O, U, w / 2 - 10, 8, w / 2 + 10, h, DOOR, { stroke: '#150c05' });
    for (const u of [16, w - 30]) p.archOn(O, U, u, 8, u + 12, 22, WIN, { stroke: '#8a7a5a' });
    banner(p, [x + w, y + d, h], [0, -1, 0], d / 2 - 5, 3, 10, 20, team);
    flagPole(p, out, x + w - 6, y + 6, h, 26);
  },

  siegeWorkshop(p, S, st, team, rng, out) {
    const M = materials();
    const x = 14, y = 14, w = S - 28, d = S - 70, h = 40;
    p.box(x, y, 0, w, 14, h, M.plank, null);
    p.box(x, y, 0, 14, d, h, M.plank, null);
    // roof on posts
    for (const [px, py] of [[x + w - 3, y + d - 3], [x + w / 2, y + d - 3]]) p.box(px, py, 0, 5, 5, h, M.plankDark, null, { noAO: true });
    p.gable(x, y, h, w, d, 30, 'x', M.shingle, M.plank, 4);
    // half-built catapult inside the yard
    const cx = x + w / 2 + 10, cy = S - 44;
    p.box(cx - 16, cy - 6, 4, 32, 12, 4, M.plankH, M.plank, { noAO: true });
    for (const [wx, wy] of [[cx - 12, cy + 6], [cx + 12, cy + 6]]) p.poly(Array.from({ length: 12 }, (_, i) => [wx + Math.cos(i / 12 * 6.283) * 5, wy, 5 + Math.sin(i / 12 * 6.283) * 5]), '#4a321c', { normal: [0, 1, 0] });
    p.line([cx - 6, cy, 8], [cx + 10, cy, 34], '#6a4a2a', 3);
    p.line([cx - 14, cy, 8], [cx - 4, cy, 24], '#5a3a1e', 2);
    p.line([cx + 12, cy, 8], [cx + 4, cy, 24], '#5a3a1e', 2);
    // crane
    p.line([x + 10, S - 20, 0], [x + 10, S - 20, 62], '#5a3a1e', 3);
    p.line([x + 10, S - 20, 60], [x + 50, S - 30, 58], '#5a3a1e', 2.4);
    p.line([x + 48, S - 30, 58], [x + 48, S - 30, 30], '#b8a888', 0.8);
    logPile(p, S - 60, S - 20, 3);
    banner(p, [x, y + 14, h], [1, 0, 0], w * 0.55, 4, 12, 24, team);
    flagPole(p, out, x + 8, y + 8, h + 20, 24);
  },

  wonder(p, S, st, team, rng, out) {
    const M = materials();
    const wall = M.marble, gold = { color: '#d8b640' };
    // stepped plinth
    for (let k = 0; k < 3; k++) p.box(10 + k * 7, 10 + k * 7, k * 5, S - 20 - k * 14, S - 20 - k * 14, 5, M.sandstone, M.sandstone, { noAO: true });
    const x = 40, y = 40, w = S - 80, d = S - 80, h = 70;
    p.box(x, y, 15, w, d, h, wall, null);
    p.hip(x, y, 15 + h, w, d, 34, M.slate, 5);
    // central dome/spire
    const cx = S / 2, cy = S / 2;
    p.cylinder(cx, cy, 15 + h + 20, 26, 26, wall, { seg: 18 });
    p.cone(cx, cy, 15 + h + 46, 29, 60, { color: '#caa638' }, { seg: 18 });
    // corner spires (back first)
    const spire = (sx, sy) => {
      p.box(sx - 11, sy - 11, 15, 22, 22, h + 36, wall, null);
      p.cone(sx, sy, 15 + h + 36, 16, 52, M.slate, { seg: 12 });
      p.cone(sx, sy, 15 + h + 86, 3, 12, gold, { seg: 6 });
    };
    spire(x, y); spire(x + w, y); spire(x, y + d);
    // facade details
    const O = [x, y + d, 15 + h], U = [1, 0, 0];
    p.archOn(O, U, w / 2 - 16, 24, w / 2 + 16, h, '#20160e', { stroke: '#d8b640', lw: 1.5 });
    for (const u of [16, w - 36]) p.archOn(O, U, u, 14, u + 20, 48, '#3a5aa8', { stroke: '#d8b640', lw: 1.2 });
    banner(p, O, U, w / 2 - 34, 6, 12, 34, team); banner(p, O, U, w / 2 + 22, 6, 12, 34, team);
    const O2 = [x + w, y + d, 15 + h], U2 = [0, -1, 0];
    for (const u of [16, d / 2 - 10, d - 36]) p.archOn(O2, U2, u, 14, u + 20, 48, '#3a5aa8', { stroke: '#d8b640', lw: 1.2 });
    spire(x + w, y + d);
    flagPole(p, out, cx, cy, 15 + h + 106, 30);
  },

  palisadeWall(p, S, st, team, rng, out, mask) { wallPiece(p, S, mask, false); },
  palisadeGate(p, S, st, team, rng, out, mask) { gatePiece(p, S, mask, false, team, out); },
  gate(p, S, st, team, rng, out, mask) { gatePiece(p, S, mask, true, team, out); },
  stoneWall(p, S, st, team, rng, out, mask) { wallPiece(p, S, mask, true); },
};

function tower(p, S, st, team, out, tier) {
  const M = materials();
  const e = 5 - tier, w = S - 2 * e;
  const h = 70 + tier * 14;
  p.box(e, e, 0, w, w, h, tier >= 1 ? M.stone : M.stoneWarm, M.stoneDark);
  p.box(e - 3, e - 3, h, w + 6, w + 6, 6, M.stoneDark, M.stoneDark, { noAO: true });
  p.crenels(e - 3, e - 3, h + 6, w + 6, w + 6, M.stone, 4.5, 6);
  p.archOn([e, e + w, h], [1, 0, 0], w / 2 - 4, 16, w / 2 + 4, 30, WIN, { stroke: '#111' });
  p.archOn([e + w, e + w, h], [0, -1, 0], w / 2 - 4, 16, w / 2 + 4, 30, WIN, { stroke: '#111' });
  p.archOn([e, e + w, h], [1, 0, 0], w / 2 - 6, h - 20, w / 2 + 6, h, DOOR, { stroke: '#111' });
  if (tier === 0) p.hip(e, e, h + 6, w, w, 22, M.shingle, 3);
  else if (tier === 1) p.hip(e, e, h + 6, w, w, 28, M.tileDark, 3);
  banner(p, [e, e + w, h], [1, 0, 0], 3, 34, 8, 18, team);
  flagPole(p, out, S / 2, S / 2, h + 6 + (tier < 2 ? [22, 28][tier] - 2 : 0), 20);
}

// Wall piece that connects toward neighbouring wall tiles (mask bits: 1=+x, 2=-x, 4=+y, 8=-y).
function wallPiece(p, S, mask, stone) {
  const M = materials();
  const c = S / 2, t = stone ? 13 : 8, h = stone ? 40 : 34;
  const segs = [];
  if (mask & 8) segs.push([c - t, 0, 2 * t, c]);
  if (mask & 2) segs.push([0, c - t, c, 2 * t]);
  if (mask & 1) segs.push([c, c - t, S - c, 2 * t]);
  if (mask & 4) segs.push([c - t, c, 2 * t, S - c]);
  if (!segs.length) segs.push([c - t, c - t, 2 * t, 2 * t]);
  segs.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
  if (stone) {
    for (const [x, y, w, d] of segs) {
      p.box(x, y, 0, w, d, h, M.stone, M.stoneDark);
      p.crenels(x, y, h, w, d, M.stone, 4, 5);
    }
    if (mask === 0 || mask === 3 || mask === 12) {
      // straight run or lone post: a small buttress keeps the line readable
      p.box(c - t + 3, c - t + 3, 0, 2 * t - 6, 2 * t - 6, h + 5, M.stone, M.stoneDark);
      p.crenels(c - t + 3, c - t + 3, h + 5, 2 * t - 6, 2 * t - 6, M.stone, 4, 4);
    } else {
      p.box(c - t - 1, c - t - 1, 0, 2 * t + 2, 2 * t + 2, h + 8, M.stone, M.stoneDark);
      p.crenels(c - t - 1, c - t - 1, h + 8, 2 * t + 2, 2 * t + 2, M.stone, 4, 5);
    }
  } else {
    // sharpened stakes along each segment
    const stakes = [];
    for (const [x, y, w, d] of segs) {
      const alongX = w > d;
      const len = alongX ? w : d;
      for (let k = 2.5; k <= len; k += 5) stakes.push(alongX ? [x + k, y + d / 2] : [x + w / 2, y + k]);
    }
    stakes.push([c, c]);
    stakes.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
    for (const [sx, sy] of stakes) {
      const hh = h - 4 + ((sx * 7 + sy * 13) % 7);
      p.cylinder(sx, sy, 0, 3, hh, M.log, { seg: 8, noAO: true });
      p.cone(sx, sy, hh, 3, 6, { color: '#8a6038' }, { seg: 8 });
    }
  }
}

// A gate spanning the tile along the wall direction: two posts/towers and a door between them.
function gatePiece(p, S, mask, stone, team, out) {
  const M = materials();
  const alongX = (mask & 3) !== 0 || !(mask & 12);
  const h = stone ? 46 : 36, t = stone ? 13 : 8;
  const c = S / 2;
  const post = (x, y) => {
    if (stone) { p.box(x - 7, y - 7, 0, 14, 14, h, M.stone, M.stoneDark); p.crenels(x - 7, y - 7, h, 14, 14, M.stone, 3.5, 4); }
    else { p.cylinder(x, y, 0, 4.2, h + 4, M.log, { seg: 10 }); p.cone(x, y, h + 4, 4.2, 7, { color: '#8a6038' }, { seg: 10 }); }
  };
  if (alongX) {
    post(5, c);
    // lintel & door (door faces +y, visible)
    p.box(5, c - t / 2, h - (stone ? 12 : 8), S - 10, t, stone ? 12 : 6, stone ? M.stone : M.log, stone ? M.stoneDark : M.log, { noAO: true });
    p.face([[9, c + t / 2 - 1, h - (stone ? 12 : 8)], [S - 9, c + t / 2 - 1, h - (stone ? 12 : 8)], [S - 9, c + t / 2 - 1, 0], [9, c + t / 2 - 1, 0]], M.plankDark, { normal: [0, 1, 0], O: [9, c + t / 2, h], U: [1, 0, 0] });
    if (stone) for (let k = 0; k < 5; k++) p.line([12 + k * 5, c + t / 2, 1], [12 + k * 5, c + t / 2, h - 13], '#2a2a2e', 0.9);
    post(S - 5, c);
    if (stone) { p.line([c, c, h], [c, c, h + 14], '#3a2a1c', 1.2); out.flags.push({ x: c, y: c, z: h + 14 }); }
  } else {
    post(c, 5);
    p.box(c - t / 2, 5, h - (stone ? 12 : 8), t, S - 10, stone ? 12 : 6, stone ? M.stone : M.log, stone ? M.stoneDark : M.log, { noAO: true });
    p.face([[c + t / 2 - 1, S - 9, h - (stone ? 12 : 8)], [c + t / 2 - 1, 9, h - (stone ? 12 : 8)], [c + t / 2 - 1, 9, 0], [c + t / 2 - 1, S - 9, 0]], M.plankDark, { normal: [1, 0, 0], O: [c + t / 2, S - 9, h], U: [0, -1, 0] });
    if (stone) for (let k = 0; k < 5; k++) p.line([c + t / 2, 12 + k * 5, 1], [c + t / 2, 12 + k * 5, h - 13], '#2a2a2e', 0.9);
    post(c, S - 5);
    if (stone) { p.line([c, c, h], [c, c, h + 14], '#3a2a1c', 1.2); out.flags.push({ x: c, y: c, z: h + 14 }); }
  }
  void team;
}

// ------------------------------------------------------------------ public API
const cache = new Map();
const BUILD_WALLS = new Set(['palisadeWall', 'stoneWall', 'palisadeGate', 'gate']);

export function buildingSprite(type, style, team, variant = 0, mask = 0) {
  const key = `${type}|${style}|${team.main}|${variant % 4}|${mask}`;
  let s = cache.get(key);
  if (s) return s;
  s = renderBuilding(type, style, team, variant, mask);
  cache.set(key, s);
  return s;
}

const SIZES = {
  townCenter: 4, house: 2, mill: 2, lumberCamp: 2, miningCamp: 2, farm: 3, barracks: 3, archeryRange: 3, stable: 3,
  blacksmith: 3, market: 4, watchTower: 1, guardTower: 1, keep: 1, palisadeWall: 1, stoneWall: 1, castle: 4, monastery: 3,
  university: 3, siegeWorkshop: 4, wonder: 5, palisadeGate: 1, gate: 1,
};
const MIN_STYLE = { gate: 1, castle: 2, monastery: 2, university: 2, siegeWorkshop: 2, wonder: 3, watchTower: 1, guardTower: 2, keep: 3, stoneWall: 1, market: 1, blacksmith: 1, archeryRange: 1, stable: 1 };

function renderBuilding(type, style, team, variant, mask) {
  const size = SIZES[type] || 2;
  const S = size * T;
  const st = Math.max(style, MIN_STYLE[type] || 0);
  const design = DESIGNS[type];
  const out = { flags: [], smoke: [], sails: null };
  const draw = (p) => {
    const rng = new RNG(variant * 7 + 3);
    design(p, S, st, team, rng, { flags: [], smoke: [], sails: null, push() {} }, mask);
  };
  // measure
  const mp = new MeasurePainter();
  draw(mp);
  // include footprint
  for (const q of [[0, 0, 0], [S, 0, 0], [S, S, 0], [0, S, 0]]) { const [x, y] = proj(...q); mp.acc(x, y); }
  const pad = 4;
  const x0 = mp.x0 - pad, y0 = mp.y0 - pad, x1 = mp.x1 + pad, y1 = mp.y1 + pad;
  const c = makeCanvas((x1 - x0) * SS, (y1 - y0) * SS);
  const ctx = c.getContext('2d');
  ctx.scale(SS, SS);
  ctx.translate(-x0, -y0);
  const p = new Painter(ctx);
  // foundation skirt
  const M = materials();
  p.face([[2, 2, 0], [S - 2, 2, 0], [S - 2, S - 2, 0], [2, S - 2, 0]], BUILD_WALLS.has(type) ? { color: 'rgba(0,0,0,0)' } : { color: 'rgba(92,72,48,0.55)' }, { normal: [0, 0, 1], edge: false, flatLight: true });
  const rng = new RNG(variant * 7 + 3);
  design(p, S, st, team, rng, out, mask);
  void M;
  // shadow sprite
  const sp0 = new MeasurePainter();
  const shadowMeasure = new ShadowPainter(sp0.ctx);
  shadowMeasure.ctx = { ...sp0.ctx, beginPath() {}, closePath() {}, fill() {}, stroke() {}, moveTo: (x, y) => sp0.acc(x, y), lineTo: (x, y) => sp0.acc(x, y) };
  design(shadowMeasure, S, st, team, new RNG(variant * 7 + 3), { flags: [], smoke: [], sails: null, push() {} }, mask);
  let shadow = null;
  if (isFinite(sp0.x0)) {
    const sx0 = sp0.x0 - 3, sy0 = sp0.y0 - 3, sx1 = sp0.x1 + 3, sy1 = sp0.y1 + 3;
    const sc = makeCanvas((sx1 - sx0) * SS / 2, (sy1 - sy0) * SS / 2);
    const sctx = sc.getContext('2d');
    sctx.scale(SS / 2, SS / 2);
    sctx.translate(-sx0, -sy0);
    sctx.fillStyle = '#000';
    const shp = new ShadowPainter(sctx);
    design(shp, S, st, team, new RNG(variant * 7 + 3), { flags: [], smoke: [], sails: null, push() {} }, mask);
    shadow = { canvas: sc, ax: -sx0 * SS / 2, ay: -sy0 * SS / 2, scale: SS / 2 };
  }
  return {
    canvas: c, ax: -x0 * SS, ay: -y0 * SS, w: c.width, h: c.height, size, S,
    flags: out.flags.map((f) => ({ sx: proj(f.x, f.y, f.z)[0], sy: proj(f.x, f.y, f.z)[1] })),
    smoke: out.smoke.map((f) => ({ sx: proj(f.x, f.y, f.z)[0], sy: proj(f.x, f.y, f.z)[1], rate: f.rate, dark: f.dark })),
    sails: out.sails ? { sx: proj(out.sails.x, out.sails.y, out.sails.z)[0], sy: proj(out.sails.x, out.sails.y, out.sails.z)[1], r: out.sails.r } : null,
    top: y0,
    shadow,
  };
}

// Farm: flat field whose crops ripen as food is consumed.
const farmCache = new Map();
export function farmSprite(stage, variant = 0) {
  const key = `${stage}|${variant % 2}`;
  let s = farmCache.get(key);
  if (s) return s;
  const S = 3 * T;
  const M = materials();
  const pad = 3;
  const x0 = proj(0, S, 0)[0] - pad, x1 = proj(S, 0, 0)[0] + pad, y0 = -14, y1 = proj(S, S, 0)[1] + pad;
  const c = makeCanvas((x1 - x0) * SS, (y1 - y0) * SS);
  const ctx = c.getContext('2d');
  ctx.scale(SS, SS); ctx.translate(-x0, -y0);
  const p = new Painter(ctx);
  p.face([[3, 3, 0], [S - 3, 3, 0], [S - 3, S - 3, 0], [3, S - 3, 0]], M.soil, { normal: [0, 0, 1], O: [0, 0, 0], U: variant % 2 ? [1, 0, 0] : [0, 1, 0], V: variant % 2 ? [0, 1, 0] : [1, 0, 0], edge: false, flatLight: true });
  const rng = new RNG(1234 + variant);
  // crops: stage 0 = freshly sown (small green), 1 = growing, 2 = ripe gold, 3 = nearly harvested (stubble)
  const colors = [['#6aa84a', '#4f8a38'], ['#8ab84a', '#6a9a3a'], ['#d8b84a', '#b8962e'], ['#b89a52', '#8a7440']][stage];
  const hgt = [3, 6, 9, 3][stage];
  const rows = 9;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < 14; k++) {
      const u = 8 + (r + 0.5) * ((S - 16) / rows), v = 8 + k * ((S - 16) / 14) + rng.next() * 2;
      const [x, y] = variant % 2 ? [v, u] : [u, v];
      if (stage === 3 && rng.next() < 0.55) continue;
      const [sx, sy] = proj(x, y, 0);
      ctx.strokeStyle = rng.next() < 0.5 ? colors[0] : colors[1];
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(sx, sy); ctx.lineTo(sx - 1.2, sy - hgt * 0.866);
      ctx.moveTo(sx, sy); ctx.lineTo(sx + 1.2, sy - hgt * 0.8);
      ctx.moveTo(sx, sy); ctx.lineTo(sx + 0.2, sy - hgt);
      ctx.stroke();
      if (stage === 2) { ctx.fillStyle = '#f0d070'; ctx.fillRect(sx - 0.6, sy - hgt - 1.2, 1.2, 2); }
    }
  }
  // wooden border posts
  for (const q of [[3, 3], [S - 3, 3], [3, S - 3], [S - 3, S - 3], [S / 2, 3], [3, S / 2], [S - 3, S / 2], [S / 2, S - 3]]) p.line([q[0], q[1], 0], [q[0], q[1], 7], '#6a4a2a', 1.6);
  ctx.strokeStyle = 'rgba(110,80,45,0.8)'; ctx.lineWidth = 0.8;
  p.path([[3, 3, 5], [S - 3, 3, 5], [S - 3, S - 3, 5], [3, S - 3, 5]]); ctx.stroke();
  s = { canvas: c, ax: -x0 * SS, ay: -y0 * SS, w: c.width, h: c.height, size: 3, S, flags: [], smoke: [], sails: null, shadow: null };
  farmCache.set(key, s);
  return s;
}

// Construction scaffolding overlay for a footprint of `size` tiles.
const scaffCache = new Map();
export function scaffoldSprite(size, height) {
  const key = `${size}|${Math.round(height)}`;
  let s = scaffCache.get(key);
  if (s) return s;
  const S = size * T;
  const pad = 4;
  const x0 = proj(0, S, 0)[0] - pad, x1 = proj(S, 0, 0)[0] + pad, y0 = -height * 0.866 - pad, y1 = proj(S, S, 0)[1] + pad;
  const c = makeCanvas((x1 - x0) * SS, (y1 - y0) * SS);
  const ctx = c.getContext('2d');
  ctx.scale(SS, SS); ctx.translate(-x0, -y0);
  const p = new Painter(ctx);
  const posts = [];
  const e = 4;
  const n = Math.max(2, size + 1);
  for (let i = 0; i < n; i++) {
    const t = e + (i / (n - 1)) * (S - 2 * e);
    posts.push([t, e], [t, S - e], [e, t], [S - e, t]);
  }
  const col = '#8a6238';
  for (const [x, y] of posts) p.line([x, y, 0], [x, y, height], col, 1.6);
  for (let z = 12; z < height; z += 16) {
    p.line([e, e, z], [S - e, e, z], col, 1.2);
    p.line([e, e, z], [e, S - e, z], col, 1.2);
    p.line([S - e, e, z], [S - e, S - e, z], col, 1.4);
    p.line([e, S - e, z], [S - e, S - e, z], col, 1.4);
  }
  p.line([e, S - e, 0], [S / 2, S - e, height * 0.8], col, 1.1);
  p.line([S - e, e, 0], [S - e, S / 2, height * 0.8], col, 1.1);
  s = { canvas: c, ax: -x0 * SS, ay: -y0 * SS, w: c.width, h: c.height };
  scaffCache.set(key, s);
  return s;
}

// Foundation: staked-out plot.
const foundCache = new Map();
export function foundationSprite(size) {
  let s = foundCache.get(size);
  if (s) return s;
  const S = size * T, pad = 4;
  const x0 = proj(0, S, 0)[0] - pad, x1 = proj(S, 0, 0)[0] + pad, y0 = -12, y1 = proj(S, S, 0)[1] + pad;
  const c = makeCanvas((x1 - x0) * SS, (y1 - y0) * SS);
  const ctx = c.getContext('2d');
  ctx.scale(SS, SS); ctx.translate(-x0, -y0);
  const p = new Painter(ctx);
  p.face([[2, 2, 0], [S - 2, 2, 0], [S - 2, S - 2, 0], [2, S - 2, 0]], { color: 'rgba(120,90,55,0.75)' }, { normal: [0, 0, 1], edge: false, flatLight: true });
  const rng = new RNG(size * 17);
  for (let k = 0; k < size * size * 6; k++) {
    const [x, y] = proj(4 + rng.next() * (S - 8), 4 + rng.next() * (S - 8), 0);
    ctx.fillStyle = rng.next() < 0.5 ? 'rgba(70,50,30,0.5)' : 'rgba(170,140,100,0.5)';
    ctx.fillRect(x, y, 1.5, 1);
  }
  for (const [x, y] of [[4, 4], [S - 4, 4], [4, S - 4], [S - 4, S - 4]]) p.line([x, y, 0], [x, y, 9], '#7a5a34', 1.8);
  ctx.strokeStyle = 'rgba(230,220,190,0.8)'; ctx.lineWidth = 0.6;
  p.path([[4, 4, 7], [S - 4, 4, 7], [S - 4, S - 4, 7], [4, S - 4, 7]]); ctx.stroke();
  s = { canvas: c, ax: -x0 * SS, ay: -y0 * SS, w: c.width, h: c.height };
  foundCache.set(size, s);
  return s;
}

// Rubble left after destruction.
const rubbleCache = new Map();
export function rubbleSprite(size, stone = true) {
  const key = size + '|' + stone;
  let s = rubbleCache.get(key);
  if (s) return s;
  const S = size * T, pad = 4;
  const x0 = proj(0, S, 0)[0] - pad, x1 = proj(S, 0, 0)[0] + pad, y0 = -16, y1 = proj(S, S, 0)[1] + pad;
  const c = makeCanvas((x1 - x0) * SS, (y1 - y0) * SS);
  const ctx = c.getContext('2d');
  ctx.scale(SS, SS); ctx.translate(-x0, -y0);
  const p = new Painter(ctx);
  p.face([[4, 4, 0], [S - 4, 4, 0], [S - 4, S - 4, 0], [4, S - 4, 0]], { color: 'rgba(50,40,32,0.6)' }, { normal: [0, 0, 1], edge: false, flatLight: true });
  const rng = new RNG(size * 31 + (stone ? 1 : 2));
  const n = size * size * 10;
  const chunks = [];
  for (let k = 0; k < n; k++) chunks.push([6 + rng.next() * (S - 12), 6 + rng.next() * (S - 12), 2 + rng.next() * 5, rng.next()]);
  chunks.sort((a, b) => a[0] + a[1] - b[0] - b[1]);
  for (const [x, y, r, q] of chunks) {
    const col = stone ? (q < 0.6 ? '#8a847a' : '#6a645c') : (q < 0.5 ? '#5a3a22' : '#3a2616');
    p.poly([[x - r, y, 0], [x, y - r, 0], [x + r * 0.3, y + r * 0.3, r * 0.9]], col);
    p.poly([[x, y - r, 0], [x + r, y + r * 0.2, 0], [x + r * 0.3, y + r * 0.3, r * 0.9]], col);
    p.poly([[x + r, y + r * 0.2, 0], [x - r, y, 0], [x + r * 0.3, y + r * 0.3, r * 0.9]], col);
  }
  // a couple of charred beams
  for (let k = 0; k < size; k++) {
    const x = 10 + rng.next() * (S - 20), y = 10 + rng.next() * (S - 20);
    p.line([x, y, 1], [x + 14 * (rng.next() - 0.3), y + 14 * (rng.next() - 0.3), 3], '#2a1a10', 2.4);
  }
  s = { canvas: c, ax: -x0 * SS, ay: -y0 * SS, w: c.width, h: c.height };
  rubbleCache.set(key, s);
  return s;
}

export const BUILDING_SIZES = SIZES;
