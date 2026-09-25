// ===== Isometric renderer: terrain chunks, sprites, procedural units & buildings =====
'use strict';
const R = {
  cv: null, ctx: null, cw: 0, ch: 0, cam: { x: 0, y: 0, zoom: 1 },
  chunks: new Map(), CH: 8, spriteCache: new Map(), fogCv: null, fogImg: null, waterPat: null, mapVersion: -1,
  showGrid: false, time: 0,
};
function shade(hex, f) {
  let c = hex.replace('#', ''); if (c.length === 3) c = c.split('').map(x => x + x).join('');
  let r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  if (f >= 1) { r += (255 - r) * (f - 1); g += (255 - g) * (f - 1); b += (255 - b) * (f - 1); } else { r *= f; g *= f; b *= f; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = ((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t, g = ((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t, bl = (pa & 255) * (1 - t) + (pb & 255) * t;
  return `rgb(${r | 0},${g | 0},${bl | 0})`;
}
const iso = (x, y, h) => ({ x: (x - y) * TW / 2, y: (x + y) * TH / 2 - h * EH });
function pcolor(owner) { if (!owner || !W || !W.players[owner]) return GAIA_COLOR; return W.players[owner].color; }

function renderInit(cv) {
  R.cv = cv; R.ctx = cv.getContext('2d');
  // water pattern
  const wp = document.createElement('canvas'); wp.width = 256; wp.height = 128;
  const g = wp.getContext('2d');
  g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 1.5;
  const rng = mulberry32(7);
  for (let i = 0; i < 40; i++) {
    const x = rng() * 256, y = rng() * 128, l = 8 + rng() * 18;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y - 3, x + l, y); g.stroke();
  }
  g.strokeStyle = 'rgba(180,230,255,0.10)';
  for (let i = 0; i < 25; i++) { const x = rng() * 256, y = rng() * 128, l = 6 + rng() * 10; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y + 2, x + l, y); g.stroke(); }
  R.waterPatCv = wp;
}
function resize() {
  const dpr = 1;
  R.cw = R.cv.clientWidth; R.ch = R.cv.clientHeight;
  R.cv.width = R.cw * dpr; R.cv.height = R.ch * dpr;
}
function camTransform(ctx) { const c = R.cam; ctx.setTransform(c.zoom, 0, 0, c.zoom, R.cw / 2 - c.x * c.zoom, R.ch / 2 - c.y * c.zoom); }
function toScreen(x, y, h) { const p = iso(x, y, h); return { x: (p.x - R.cam.x) * R.cam.zoom + R.cw / 2, y: (p.y - R.cam.y) * R.cam.zoom + R.ch / 2 }; }
function screenToTile(sx, sy) {
  const wx = (sx - R.cw / 2) / R.cam.zoom + R.cam.x, wy0 = (sy - R.cv.getBoundingClientRect().top * 0 - R.ch / 2) / R.cam.zoom + R.cam.y;
  let tx = 0, ty = 0, wy = wy0;
  for (let k = 0; k < 4; k++) {
    tx = (wx / (TW / 2) + wy / (TH / 2)) / 2; ty = (wy / (TH / 2) - wx / (TW / 2)) / 2;
    const h = W && W.map ? Math.max(0, W.map.h(tx, ty)) : 0;
    wy = wy0 + h * EH;
  }
  return { x: tx, y: ty };
}
function centerCamOn(x, y) { const p = iso(x, y, W ? W.map.h(x, y) : 0); R.cam.x = p.x; R.cam.y = p.y; }
function clampCam() {
  const n = W.n; const maxX = n * TW / 2, maxY = n * TH;
  R.cam.x = Math.max(-maxX, Math.min(maxX, R.cam.x)); R.cam.y = Math.max(-40, Math.min(maxY, R.cam.y));
}

// ---------- terrain ----------
const TER_COL = ['#6e9a3a', '#9a7747', '#d6c088', '#86b5a2', '#2b6a97', '#1a4a78', '#557a2c', '#8a8070'];
function tileColor(map, x, y) {
  const i = y * map.n + x, t = map.ter[i], dv = map.deco[i];
  let c = TER_COL[t];
  const nz = ((dv & 15) - 7.5) / 90;
  return { base: c, var: nz };
}
function invalidateTerrain() { R.chunks.clear(); }
function invalidateTiles(x0, y0, x1, y1) {
  for (const [k] of R.chunks) { const cx = k & 1023, cy = k >> 10; if (cx * R.CH <= x1 + 1 && (cx + 1) * R.CH >= x0 - 1 && cy * R.CH <= y1 + 1 && (cy + 1) * R.CH >= y0 - 1) R.chunks.delete(k); }
}
function buildChunk(cx, cy) {
  const map = W.map, n = map.n, CH = R.CH, N = n + 1;
  const x0 = cx * CH, y0 = cy * CH;
  const minX = (x0 - (y0 + CH)) * TW / 2 - 4, maxX = ((x0 + CH) - y0) * TW / 2 + 4;
  const minY = (x0 + y0) * TH / 2 - 5 * EH - 6, maxY = ((x0 + CH) + (y0 + CH)) * TH / 2 + EH + 6;
  const S = 1.5;
  const cv = document.createElement('canvas'); cv.width = Math.ceil((maxX - minX) * S); cv.height = Math.ceil((maxY - minY) * S);
  const g = cv.getContext('2d');
  g.setTransform(S, 0, 0, S, -minX * S, -minY * S);
  for (let y = y0; y < Math.min(n, y0 + CH); y++) for (let x = x0; x < Math.min(n, x0 + CH); x++) drawTile(g, map, x, y);
  return { cv, minX, minY, S };
}
function drawTile(g, map, x, y) {
  const n = map.n, N = n + 1, i = y * n + x, t = map.ter[i];
  const h0 = map.vh[y * N + x], h1 = map.vh[y * N + x + 1], h2 = map.vh[(y + 1) * N + x + 1], h3 = map.vh[(y + 1) * N + x];
  const water = isWaterT(t);
  const H = v => water ? -0.35 : v;
  const p0 = iso(x, y, H(h0)), p1 = iso(x + 1, y, H(h1)), p2 = iso(x + 1, y + 1, H(h2)), p3 = iso(x, y + 1, H(h3));
  const { base, var: nv } = tileColor(map, x, y);
  let light = 1 + ((h0 + h3) - (h1 + h2)) * 0.09 + ((h0 + h1) - (h2 + h3)) * 0.05 + nv;
  const steep = Math.max(h0, h1, h2, h3) - Math.min(h0, h1, h2, h3);
  let col = base;
  if (!water && steep >= 1.3) col = mix(base, '#7b6a55', Math.min(1, (steep - 1.1) * 1.2));
  g.beginPath(); g.moveTo(p0.x, p0.y - 0.5); g.lineTo(p1.x + 0.7, p1.y); g.lineTo(p2.x, p2.y + 0.7); g.lineTo(p3.x - 0.7, p3.y); g.closePath();
  if (water) {
    const deep = t === T.DEEP;
    g.fillStyle = deep ? 'rgba(18,55,95,0.78)' : 'rgba(35,105,150,0.55)'; g.fill();
    // shore foam & sand shelf
    const n4 = [[0, -1, p0, p1], [1, 0, p1, p2], [0, 1, p2, p3], [-1, 0, p3, p0]];
    for (const [dx, dy, a, b] of n4) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= n || yy >= n || isWaterT(map.ter[yy * n + xx])) continue;
      g.strokeStyle = 'rgba(230,245,250,0.55)'; g.lineWidth = 2.2;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, cx = (p0.x + p2.x) / 2, cy = (p0.y + p2.y) / 2;
      g.beginPath(); g.moveTo(a.x + (cx - a.x) * 0.12, a.y + (cy - a.y) * 0.12); g.quadraticCurveTo(mx + (cx - mx) * 0.25, my + (cy - my) * 0.25, b.x + (cx - b.x) * 0.12, b.y + (cy - b.y) * 0.12); g.stroke();
      g.fillStyle = 'rgba(200,190,140,0.25)'; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(cx, cy); g.fill();
    }
    return;
  }
  g.fillStyle = shade(col.startsWith('#') ? col : '#6e9a3a', 1) ;
  g.fillStyle = col.startsWith('rgb') ? col : col; g.fill();
  g.fillStyle = light > 1 ? `rgba(255,250,220,${Math.min(0.35, (light - 1) * 1.2)})` : `rgba(0,10,20,${Math.min(0.5, (1 - light) * 1.3)})`; g.fill();
  // cliff strata
  if (steep >= 1.3) {
    g.strokeStyle = 'rgba(60,45,30,0.5)'; g.lineWidth = 1;
    for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(p3.x + (p2.x - p3.x) * 0.1, p3.y - k * 5 + (p2.y - p3.y) * 0.1); g.lineTo(p2.x - (p2.x - p3.x) * 0.1, p2.y - k * 5 - (p2.y - p3.y) * 0.1); g.stroke(); }
    const rng = mulberry32(i * 7 + 3);
    for (let k = 0; k < 3; k++) { g.fillStyle = `rgba(${90 + rng() * 40},${80 + rng() * 30},${70 + rng() * 20},0.9)`; const px = p0.x + (rng() - 0.5) * 40, py = (p0.y + p2.y) / 2 + (rng() - 0.5) * 12; g.beginPath(); g.ellipse(px, py, 3 + rng() * 3, 2 + rng() * 2, 0, 0, 6.3); g.fill(); }
  }
  // texture detail
  const rng = mulberry32(i * 9301 + 49297);
  const cx = (p0.x + p2.x) / 2, cy = (p0.y + p2.y) / 2;
  if (t === T.GRASS || t === T.FOREST) {
    for (let k = 0; k < 7; k++) {
      const u = rng() - 0.5, v = rng() - 0.5;
      const px = cx + (u - v) * TW / 2 * 0.9, py = cy + (u + v) * TH / 2 * 0.9 - (map.h(x + 0.5 + u, y + 0.5 + v) - (h0 + h2) / 2) * EH;
      g.strokeStyle = rng() < 0.5 ? 'rgba(40,80,20,0.55)' : 'rgba(150,190,80,0.5)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(px, py); g.lineTo(px - 1.5, py - 3); g.moveTo(px, py); g.lineTo(px + 1.5, py - 3.5); g.stroke();
    }
    if (rng() < 0.08) { g.fillStyle = ['#f3e36a', '#fff', '#d97ad6', '#e86a5a'][(rng() * 4) | 0]; g.beginPath(); g.arc(cx + (rng() - 0.5) * 20, cy + (rng() - 0.5) * 8, 1.4, 0, 6.3); g.fill(); }
  } else if (t === T.DIRT) {
    for (let k = 0; k < 5; k++) { g.fillStyle = rng() < 0.5 ? 'rgba(90,60,30,0.35)' : 'rgba(200,170,120,0.35)'; g.beginPath(); g.ellipse(cx + (rng() - 0.5) * 36, cy + (rng() - 0.5) * 14, 1.5 + rng() * 2, 1 + rng(), 0, 0, 6.3); g.fill(); }
  } else if (t === T.SAND) {
    for (let k = 0; k < 6; k++) { g.fillStyle = rng() < 0.5 ? 'rgba(160,130,80,0.35)' : 'rgba(255,245,210,0.45)'; g.fillRect(cx + (rng() - 0.5) * 36, cy + (rng() - 0.5) * 14, 1.5, 1); }
  } else if (t === T.SHALLOW) {
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.moveTo(cx - 12, cy); g.quadraticCurveTo(cx - 4, cy - 3, cx + 4, cy); g.stroke();
  } else if (t === T.ROCK) {
    for (let k = 0; k < 4; k++) { g.fillStyle = 'rgba(70,65,60,0.5)'; g.beginPath(); g.ellipse(cx + (rng() - 0.5) * 30, cy + (rng() - 0.5) * 10, 2 + rng() * 2, 1.2 + rng(), 0, 0, 6.3); g.fill(); }
  }
  if (R.showGrid) { g.strokeStyle = 'rgba(0,0,0,0.15)'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(p0.x, p0.y); g.lineTo(p1.x, p1.y); g.lineTo(p2.x, p2.y); g.lineTo(p3.x, p3.y); g.closePath(); g.stroke(); }
}
function drawTerrain(ctx) {
  const map = W.map, n = map.n, CH = R.CH;
  if (R.mapVersion !== map.version || R.mapRef !== map) { R.chunks.clear(); R.mapVersion = map.version; R.mapRef = map; }
  const z = R.cam.zoom;
  const vx0 = R.cam.x - R.cw / 2 / z - 80, vx1 = R.cam.x + R.cw / 2 / z + 80, vy0 = R.cam.y - R.ch / 2 / z - 80, vy1 = R.cam.y + R.ch / 2 / z + 120;
  const nc = Math.ceil(n / CH);
  // animated water beneath (land chunks are opaque)
  ctx.save();
  { const a = iso(0, 0, 0), b = iso(n, 0, 0), c = iso(n, n, 0), d = iso(0, n, 0); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.clip(); }
  if (!R.waterPat) R.waterPat = ctx.createPattern(R.waterPatCv, 'repeat');
  ctx.fillStyle = '#1d5a88'; ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
  const off = (R.time * 12) % 256;
  ctx.translate(off, (R.time * 4) % 128); ctx.fillStyle = R.waterPat; ctx.fillRect(vx0 - off, vy0 - 128, vx1 - vx0 + 256, vy1 - vy0 + 256);
  ctx.translate(-off * 2 + 60, 30); ctx.globalAlpha = 0.6; ctx.fillRect(vx0 + off, vy0 - 128, vx1 - vx0 + 256, vy1 - vy0 + 256);
  ctx.restore();
  let built = 0;
  for (let s = 0; s < nc * 2; s++) for (let cy = 0; cy < nc; cy++) {
    const cx = s - cy; if (cx < 0 || cx >= nc) continue;
    const x0 = cx * CH, y0 = cy * CH;
    const sx0 = (x0 - (y0 + CH)) * TW / 2, sx1 = ((x0 + CH) - y0) * TW / 2, sy0 = (x0 + y0) * TH / 2 - 5 * EH, sy1 = (x0 + y0 + 2 * CH) * TH / 2 + EH;
    if (sx1 < vx0 || sx0 > vx1 || sy1 < vy0 || sy0 > vy1) continue;
    const key = (cy << 10) | cx;
    let c = R.chunks.get(key);
    if (!c) { if (built > 60) continue; c = buildChunk(cx, cy); R.chunks.set(key, c); built++; }
    ctx.drawImage(c.cv, c.minX, c.minY, c.cv.width / c.S, c.cv.height / c.S);
  }
  if (R.chunks.size > 260) { let k = 0; for (const key of R.chunks.keys()) { if (k++ > 60) break; R.chunks.delete(key); } }
}

// ---------- drawing helpers ----------
function P(lx, ly, lz) { return [(lx - ly) * TW / 2, (lx + ly) * TH / 2 - lz]; }
function poly(g, pts, fill, stroke, lw) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 1; g.stroke(); } }
function box(g, x, y, w, d, z0, h, col, opt = {}) {
  const z1 = z0 + h;
  const top = opt.top || shade(col, 1.15), left = opt.left || shade(col, 1.0), right = opt.right || shade(col, 0.72);
  const ol = opt.ol === undefined ? 'rgba(0,0,0,0.35)' : opt.ol;
  poly(g, [P(x - w, y + d, z0), P(x + w, y + d, z0), P(x + w, y + d, z1), P(x - w, y + d, z1)], left, ol, 0.7);
  poly(g, [P(x + w, y - d, z0), P(x + w, y + d, z0), P(x + w, y + d, z1), P(x + w, y - d, z1)], right, ol, 0.7);
  if (!opt.noTop) poly(g, [P(x - w, y - d, z1), P(x + w, y - d, z1), P(x + w, y + d, z1), P(x - w, y + d, z1)], top, ol, 0.7);
  if (opt.beams) { // timber framing
    g.strokeStyle = opt.beams; g.lineWidth = 1.6;
    for (const f of [0.25, 0.75]) { const a = P(x - w + 2 * w * f, y + d, z0), b = P(x - w + 2 * w * f, y + d, z1); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
    const a = P(x - w, y + d, z0 + h * 0.5), b = P(x + w, y + d, z0 + h * 0.5); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    const c1 = P(x + w, y - d, z0 + h * 0.5), c2 = P(x + w, y + d, z0 + h * 0.5); g.beginPath(); g.moveTo(c1[0], c1[1]); g.lineTo(c2[0], c2[1]); g.stroke();
    const e1 = P(x + w, y - d, z0), e2 = P(x + w, y + d, z1); g.beginPath(); g.moveTo(e1[0], e1[1]); g.lineTo(e2[0], e2[1]); g.stroke();
  }
  if (opt.bricks) {
    g.strokeStyle = 'rgba(40,35,30,0.28)'; g.lineWidth = 0.6;
    for (let zz = z0 + 5; zz < z1; zz += 5) {
      let a = P(x - w, y + d, zz), b = P(x + w, y + d, zz); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
      a = P(x + w, y - d, zz); b = P(x + w, y + d, zz); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    }
  }
}
function gableX(g, x, y, w, d, z, rh, col, o = 0.12) {
  const zr = z + rh;
  poly(g, [P(x - w - o, y - d - o, z), P(x + w + o, y - d - o, z), P(x + w + o, y, zr), P(x - w - o, y, zr)], shade(col, 0.8), 'rgba(0,0,0,0.4)', 0.7);
  poly(g, [P(x + w, y - d, z), P(x + w, y + d, z), P(x + w, y, zr)], shade(col, 0.62), 'rgba(0,0,0,0.4)', 0.7);
  poly(g, [P(x - w - o, y + d + o, z), P(x + w + o, y + d + o, z), P(x + w + o, y, zr), P(x - w - o, y, zr)], shade(col, 1.05), 'rgba(0,0,0,0.4)', 0.7);
  // roof lines texture
  g.strokeStyle = 'rgba(0,0,0,0.13)'; g.lineWidth = 0.8;
  for (let k = 1; k < 6; k++) { const f = k / 6; const a = P(x - w - o + (2 * w + 2 * o) * f, y + d + o, z), b = P(x - w - o + (2 * w + 2 * o) * f, y, zr); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
}
function gableY(g, x, y, w, d, z, rh, col, o = 0.12) {
  const zr = z + rh;
  poly(g, [P(x - w - o, y - d - o, z), P(x - w - o, y + d + o, z), P(x, y + d + o, zr), P(x, y - d - o, zr)], shade(col, 0.8), 'rgba(0,0,0,0.4)', 0.7);
  poly(g, [P(x - w, y + d, z), P(x + w, y + d, z), P(x, y + d, zr)], shade(col, 0.9), 'rgba(0,0,0,0.4)', 0.7);
  poly(g, [P(x + w + o, y - d - o, z), P(x + w + o, y + d + o, z), P(x, y + d + o, zr), P(x, y - d - o, zr)], shade(col, 0.66), 'rgba(0,0,0,0.4)', 0.7);
  g.strokeStyle = 'rgba(0,0,0,0.13)'; g.lineWidth = 0.8;
  for (let k = 1; k < 6; k++) { const f = k / 6; const a = P(x + w + o, y - d - o + (2 * d + 2 * o) * f, z), b = P(x, y - d - o + (2 * d + 2 * o) * f, zr); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
}
function pyramid(g, x, y, w, d, z, rh, col) {
  const ap = P(x, y, z + rh);
  poly(g, [P(x - w, y - d, z), P(x + w, y - d, z), ap], shade(col, 0.8));
  poly(g, [P(x - w, y - d, z), P(x - w, y + d, z), ap], shade(col, 0.85));
  poly(g, [P(x - w, y + d, z), P(x + w, y + d, z), ap], shade(col, 1.05), 'rgba(0,0,0,0.35)', 0.7);
  poly(g, [P(x + w, y - d, z), P(x + w, y + d, z), ap], shade(col, 0.68), 'rgba(0,0,0,0.35)', 0.7);
}
function cyl(g, x, y, r, z0, h, col) {
  const c = P(x, y, z0), c2 = P(x, y, z0 + h); const rx = r * TW / 2 * 1.41, ry = r * TH / 2 * 1.41;
  const grd = g.createLinearGradient(c[0] - rx, 0, c[0] + rx, 0); grd.addColorStop(0, shade(col, 1.1)); grd.addColorStop(0.5, shade(col, 0.95)); grd.addColorStop(1, shade(col, 0.6));
  g.fillStyle = grd; g.beginPath(); g.ellipse(c[0], c[1], rx, ry, 0, 0, Math.PI); g.lineTo(c2[0] - rx, c2[1]); g.ellipse(c2[0], c2[1], rx, ry, 0, Math.PI, 0, true); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 0.7; g.stroke();
  g.fillStyle = shade(col, 1.15); g.beginPath(); g.ellipse(c2[0], c2[1], rx, ry, 0, 0, 6.3); g.fill(); g.stroke();
}
function cone(g, x, y, r, z0, h, col) {
  const c = P(x, y, z0), rx = r * TW / 2 * 1.41, ry = r * TH / 2 * 1.41;
  const grd = g.createLinearGradient(c[0] - rx, 0, c[0] + rx, 0); grd.addColorStop(0, shade(col, 1.15)); grd.addColorStop(1, shade(col, 0.6));
  g.fillStyle = grd; g.beginPath(); g.ellipse(c[0], c[1], rx, ry, 0, 0, Math.PI); g.lineTo(c[0], c[1] - h); g.closePath(); g.fill(); g.strokeStyle = 'rgba(0,0,0,0.35)'; g.stroke();
}
function flag(g, x, y, z, col, t, size = 1) {
  const b = P(x, y, z), tp = P(x, y, z + 18 * size);
  g.strokeStyle = '#3a2a1a'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(b[0], b[1]); g.lineTo(tp[0], tp[1]); g.stroke();
  const wv = Math.sin(t * 5 + x * 3) * 2;
  g.fillStyle = col; g.beginPath(); g.moveTo(tp[0], tp[1]); g.quadraticCurveTo(tp[0] + 6 * size, tp[1] + wv, tp[0] + 12 * size, tp[1] + 2 + wv * 0.5); g.lineTo(tp[0] + 12 * size, tp[1] + 8 * size + wv * 0.5); g.quadraticCurveTo(tp[0] + 6 * size, tp[1] + 6 * size + wv, tp[0], tp[1] + 7 * size); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 0.5; g.stroke();
}
function crenel(g, x, y, w, d, z, col) {
  const s = 0.13;
  for (let k = -w + s; k <= w - s + 0.01; k += s * 3) box(g, x + k, y + d - s / 2, s, s / 2, z, 4, col);
  for (let k = -d + s; k <= d - s + 0.01; k += s * 3) box(g, x + w - s / 2, y + k, s / 2, s, z, 4, col);
}
function windowAt(g, x, y, z, side, col = '#2a1f18') {
  const pts = side === 'l' ? [P(x - 0.08, y, z), P(x + 0.08, y, z), P(x + 0.08, y, z + 6), P(x - 0.08, y, z + 6)] : [P(x, y - 0.08, z), P(x, y + 0.08, z), P(x, y + 0.08, z + 6), P(x, y - 0.08, z + 6)];
  poly(g, pts, col);
}
function doorAt(g, x, y, z, side, w = 0.14, h = 9) {
  const pts = side === 'l' ? [P(x - w, y, z), P(x + w, y, z), P(x + w, y, z + h), P(x - w, y, z + h)] : [P(x, y - w, z), P(x, y + w, z), P(x, y + w, z + h), P(x, y - w, z + h)];
  poly(g, pts, '#4a2e17', 'rgba(0,0,0,0.5)');
}

// ---------- building art ----------
const STYLE = [
  { wall: '#8d6238', roof: '#c8a45a', trim: '#5e3f22', base: '#7a6a55', beams: null, stone: '#9a9080' },
  { wall: '#e6d8b8', roof: '#a8452e', trim: '#5a3a20', base: '#8f8472', beams: '#5a3a20', stone: '#a49a88' },
  { wall: '#b8b0a0', roof: '#4d6278', trim: '#6b6258', base: '#8f877a', beams: null, stone: '#b3ab9c' },
  { wall: '#c9c1ae', roof: '#3f5670', trim: '#7a6e5e', base: '#9a9282', beams: null, stone: '#c4bcaa' },
];
function drawBuildingArt(g, type, st, pc, t) {
  const S = STYLE[st];
  const stoneAge = st >= 2;
  const walls = S.wall, roof = S.roof;
  const bricks = stoneAge;
  switch (type) {
    case 'house': {
      box(g, 0, 0, 0.72, 0.62, 0, 8, S.base, { bricks: true });
      box(g, 0, 0, 0.68, 0.58, 8, st ? 12 : 10, walls, { beams: S.beams });
      doorAt(g, -0.1, 0.58, 8, 'l'); windowAt(g, 0.68, 0.1, 13, 'r');
      if (st) windowAt(g, 0.35, 0.58, 13, 'l');
      gableX(g, 0, 0, 0.68, 0.58, st ? 20 : 18, st ? 16 : 14, roof);
      if (st >= 2) box(g, 0.35, -0.2, 0.08, 0.08, 26, 12, '#8a7a6a');
      flag(g, -0.55, 0.45, 24, pc.c, t, 0.6);
      break;
    }
    case 'tc': {
      box(g, 0, 0, 1.85, 1.85, 0, 5, '#9a8c74', { bricks: true });
      // wings
      box(g, 0.9, -0.6, 0.75, 0.9, 5, 18, walls, { beams: S.beams, bricks });
      gableY(g, 0.9, -0.6, 0.75, 0.9, 23, 14, roof);
      box(g, -0.6, 0.9, 0.9, 0.75, 5, 18, walls, { beams: S.beams, bricks });
      gableX(g, -0.6, 0.9, 0.9, 0.75, 23, 14, roof);
      // central keep
      box(g, -0.3, -0.3, 0.95, 0.95, 5, stoneAge ? 42 : 34, stoneAge ? S.stone : walls, { beams: S.beams, bricks });
      doorAt(g, -0.3, 0.65, 5, 'l', 0.25, 14);
      windowAt(g, -0.6, 0.65, 26, 'l'); windowAt(g, 0.0, 0.65, 26, 'l'); windowAt(g, 0.65, -0.3, 26, 'r');
      if (stoneAge) { crenel(g, -0.3, -0.3, 0.95, 0.95, 47, S.stone); pyramid(g, -0.3, -0.3, 0.7, 0.7, 47, 26, roof); }
      else pyramid(g, -0.3, -0.3, 1.05, 1.05, 39, 28, roof);
      // bell tower
      if (st >= 1) { box(g, 1.2, 1.2, 0.3, 0.3, 5, 34, S.stone, { bricks: true }); cone(g, 1.2, 1.2, 0.34, 39, 20, roof); }
      flag(g, -0.3, -0.3, stoneAge ? 72 : 67, pc.c, t, 1.1);
      flag(g, 1.5, -1.4, 5, pc.c, t, 0.8); flag(g, -1.4, 1.5, 5, pc.c, t, 0.8);
      break;
    }
    case 'mill': {
      box(g, 0, 0, 0.6, 0.6, 0, 6, S.base, { bricks: true });
      if (stoneAge) { cyl(g, 0, 0, 0.5, 6, 30, S.stone); cone(g, 0, 0, 0.55, 36, 18, roof); }
      else { box(g, 0, 0, 0.55, 0.55, 6, 26, walls, { beams: S.beams }); pyramid(g, 0, 0, 0.62, 0.62, 32, 18, roof); }
      doorAt(g, 0, 0.5, 6, 'l');
      // grain sacks
      box(g, 0.75, 0.55, 0.12, 0.1, 0, 5, '#d8c79a'); box(g, 0.75, 0.25, 0.12, 0.1, 0, 5, '#cbb888');
      break;
    }
    case 'lumbercamp': {
      box(g, -0.25, -0.25, 0.55, 0.55, 0, 14, walls, { beams: S.beams });
      gableX(g, -0.25, -0.25, 0.55, 0.55, 14, 10, roof);
      // log piles
      for (let k = 0; k < 3; k++) for (let j = 0; j < 3 - k; j++) {
        const p = P(0.35 + j * 0.22 + k * 0.11, 0.6, 3 + k * 4.5); g.fillStyle = '#7a4f28'; g.beginPath(); g.ellipse(p[0], p[1], 3.6, 3.6, 0, 0, 6.3); g.fill(); g.fillStyle = '#d9b27a'; g.beginPath(); g.ellipse(p[0] - 0.5, p[1], 2.3, 2.3, 0, 0, 6.3); g.fill();
      }
      const a = P(-0.6, 0.6, 0), b = P(0.7, 0.6, 0); g.strokeStyle = '#6a4424'; g.lineWidth = 3; g.beginPath(); g.moveTo(a[0], a[1] - 2); g.lineTo(b[0], b[1] - 2); g.stroke();
      break;
    }
    case 'miningcamp': {
      // open shed on posts
      for (const [x, y] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) box(g, x, y, 0.06, 0.06, 0, 16, '#5e3f22');
      gableY(g, 0, 0, 0.7, 0.7, 16, 10, roof);
      box(g, -0.2, 0.2, 0.25, 0.2, 0, 5, '#6a4a2a'); // cart
      const w1 = P(-0.35, 0.42, 2); g.fillStyle = '#3a2a1a'; g.beginPath(); g.arc(w1[0], w1[1], 2.5, 0, 6.3); g.fill();
      for (let k = 0; k < 4; k++) { const p = P(0.3 + (k % 2) * 0.2, 0.2 + (k >> 1) * 0.25, 1.5); g.fillStyle = k % 2 ? '#e0c040' : '#9a948c'; g.beginPath(); g.ellipse(p[0], p[1], 3.5, 2.5, 0, 0, 6.3); g.fill(); }
      break;
    }
    case 'barracks': {
      box(g, 0, 0, 1.3, 1.2, 0, 5, S.base, { bricks: true });
      box(g, -0.2, 0, 1.0, 1.0, 5, 22, walls, { beams: S.beams, bricks });
      gableX(g, -0.2, 0, 1.0, 1.0, 27, 16, roof);
      doorAt(g, -0.2, 1.0, 5, 'l', 0.25, 13); windowAt(g, -0.8, 1.0, 16, 'l'); windowAt(g, 0.4, 1.0, 16, 'l');
      // weapon rack
      for (let k = 0; k < 4; k++) { const a = P(1.1, -0.6 + k * 0.3, 0), b = P(1.1, -0.6 + k * 0.3, 18); g.strokeStyle = '#6a5040'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); g.fillStyle = '#c8c8d0'; g.beginPath(); g.moveTo(b[0] - 1.5, b[1] + 1); g.lineTo(b[0], b[1] - 4); g.lineTo(b[0] + 1.5, b[1] + 1); g.fill(); }
      const s = P(1.15, 0.8, 7); g.fillStyle = pc.c; g.beginPath(); g.arc(s[0], s[1], 4.5, 0, 6.3); g.fill(); g.strokeStyle = '#ddd'; g.lineWidth = 1; g.stroke();
      flag(g, -1.1, -0.9, 38, pc.c, t);
      break;
    }
    case 'range': {
      box(g, 0, 0, 1.3, 1.2, 0, 4, S.base, { bricks: true });
      box(g, -0.4, -0.3, 0.8, 0.8, 4, 20, walls, { beams: S.beams, bricks });
      gableY(g, -0.4, -0.3, 0.8, 0.8, 24, 14, roof);
      // targets
      for (const [x, y] of [[0.9, 0.3], [0.9, 0.9], [0.2, 1.0]]) { const p = P(x, y, 8); g.fillStyle = '#e8dcc0'; g.beginPath(); g.ellipse(p[0], p[1], 5, 6, 0, 0, 6.3); g.fill(); g.fillStyle = '#c33'; g.beginPath(); g.ellipse(p[0], p[1], 3, 3.6, 0, 0, 6.3); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.ellipse(p[0], p[1], 1.2, 1.4, 0, 0, 6.3); g.fill(); const q = P(x, y, 0); g.strokeStyle = '#5a3a20'; g.beginPath(); g.moveTo(q[0], q[1]); g.lineTo(p[0], p[1] + 5); g.stroke(); }
      doorAt(g, -0.4, 0.5, 4, 'l', 0.2, 12);
      flag(g, -1.1, -1.0, 34, pc.c, t);
      break;
    }
    case 'stable': {
      box(g, -0.3, -0.3, 1.0, 0.9, 0, 18, walls, { beams: S.beams, bricks });
      gableX(g, -0.3, -0.3, 1.0, 0.9, 18, 14, roof);
      for (let k = 0; k < 3; k++) doorAt(g, -0.9 + k * 0.6, 0.6, 0, 'l', 0.18, 10);
      // fence paddock
      g.strokeStyle = '#7a5530'; g.lineWidth = 1.5;
      for (const z of [3, 7]) { const a = P(-1.3, 1.3, z), b = P(1.3, 1.3, z), c = P(1.3, -1.3, z); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.stroke(); }
      const hay = P(1.0, 1.0, 2); g.fillStyle = '#e0c060'; g.beginPath(); g.ellipse(hay[0], hay[1], 6, 4, 0, 0, 6.3); g.fill();
      flag(g, -1.2, -1.1, 32, pc.c, t);
      break;
    }
    case 'blacksmith': {
      box(g, 0, 0, 1.0, 1.0, 0, 18, stoneAge ? S.stone : walls, { beams: S.beams, bricks });
      gableX(g, 0, 0, 1.0, 1.0, 18, 13, roof);
      box(g, 0.6, -0.5, 0.18, 0.18, 18, 22, '#6a625a', { bricks: true });
      doorAt(g, -0.2, 1.0, 0, 'l', 0.3, 12);
      const an = P(0.5, 1.25, 3); g.fillStyle = '#333'; g.fillRect(an[0] - 5, an[1] - 3, 10, 3); g.fillRect(an[0] - 2, an[1], 4, 4);
      const fire = P(0.1, 1.02, 3); g.fillStyle = '#ff9a2a'; g.beginPath(); g.ellipse(fire[0], fire[1] - 3, 3, 2, 0, 0, 6.3); g.fill();
      break;
    }
    case 'market': {
      box(g, -0.6, -0.6, 0.7, 0.7, 0, 20, walls, { beams: S.beams, bricks });
      gableY(g, -0.6, -0.6, 0.7, 0.7, 20, 12, roof);
      const cols = ['#c0392b', '#2980b9', '#27ae60', '#f1c40f'];
      [[0.7, -0.5], [0.7, 0.4], [-0.3, 0.8], [0.4, 1.0]].forEach(([x, y], k) => {
        box(g, x, y, 0.28, 0.22, 0, 6, '#8a6a40');
        poly(g, [P(x - 0.34, y - 0.28, 13), P(x + 0.34, y - 0.28, 13), P(x + 0.34, y + 0.3, 9), P(x - 0.34, y + 0.3, 9)], cols[k], 'rgba(0,0,0,0.3)');
        for (let j = 0; j < 3; j++) { const p = P(x - 0.15 + j * 0.15, y + 0.05, 7); g.fillStyle = ['#e74c3c', '#f39c12', '#8e44ad'][j]; g.beginPath(); g.arc(p[0], p[1], 1.6, 0, 6.3); g.fill(); }
      });
      flag(g, -1.2, -1.2, 32, pc.c, t);
      break;
    }
    case 'university': {
      box(g, 0, 0, 1.25, 1.25, 0, 5, S.base, { bricks: true });
      box(g, 0, 0, 1.05, 1.05, 5, 24, S.stone, { bricks: true });
      for (let k = 0; k < 4; k++) { const a = P(-0.8 + k * 0.5, 1.12, 5), b = P(-0.8 + k * 0.5, 1.12, 29); g.strokeStyle = '#f0ece0'; g.lineWidth = 3; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
      const c = P(0, 0, 29); g.fillStyle = shade(roof, 1.1); g.beginPath(); g.ellipse(c[0], c[1], 34, 17, 0, Math.PI, 0); g.ellipse(c[0], c[1] - 2, 28, 26, 0, 0, Math.PI, true); g.fill(); g.strokeStyle = 'rgba(0,0,0,0.3)'; g.stroke();
      const top = P(0, 0, 54); g.fillStyle = '#e8c860'; g.beginPath(); g.arc(top[0], top[1], 3, 0, 6.3); g.fill();
      flag(g, 1.0, -1.0, 29, pc.c, t);
      break;
    }
    case 'monastery': {
      box(g, 0, 0, 1.3, 1.3, 0, 3, '#9a8f7c', { bricks: true });
      // nave
      box(g, -0.3, 0.1, 0.55, 1.1, 3, 26, S.stone, { bricks: true });
      gableY(g, -0.3, 0.1, 0.55, 1.1, 29, 16, '#7a3a2a');
      // rose window & door on front gable
      const rw = P(-0.3, 1.2, 20); g.fillStyle = '#6aa0d8'; g.beginPath(); g.arc(rw[0], rw[1], 4, 0, 6.3); g.fill(); g.strokeStyle = '#e8c860'; g.lineWidth = 1; g.stroke();
      doorAt(g, -0.3, 1.2, 3, 'l', 0.18, 12);
      // bell tower
      box(g, 0.75, -0.75, 0.3, 0.3, 3, 46, S.stone, { bricks: true });
      const bw = P(0.75, -0.45, 38); g.fillStyle = '#2a1f18'; g.fillRect(bw[0] - 3, bw[1] - 6, 5, 7);
      cone(g, 0.75, -0.75, 0.36, 49, 22, '#4a5a6a');
      // cross
      const cr = P(0.75, -0.75, 72); g.strokeStyle = '#e8c860'; g.lineWidth = 1.8; g.beginPath(); g.moveTo(cr[0], cr[1]); g.lineTo(cr[0], cr[1] - 10); g.moveTo(cr[0] - 3.5, cr[1] - 7); g.lineTo(cr[0] + 3.5, cr[1] - 7); g.stroke();
      const cr2 = P(-0.3, 1.2, 45); g.beginPath(); g.moveTo(cr2[0], cr2[1]); g.lineTo(cr2[0], cr2[1] - 8); g.moveTo(cr2[0] - 3, cr2[1] - 5.5); g.lineTo(cr2[0] + 3, cr2[1] - 5.5); g.stroke();
      // cloister garden
      const gp = P(0.8, 0.7, 3.2); g.fillStyle = '#5a8a3a'; g.beginPath(); g.ellipse(gp[0], gp[1], 12, 6, 0, 0, 6.3); g.fill();
      flag(g, 1.1, 1.1, 3, pc.c, t, 0.7);
      break;
    }
    case 'siege': {
      for (const [x, y] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) box(g, x, y, 0.08, 0.08, 0, 24, '#5e3f22');
      gableX(g, 0, 0, 1.2, 1.2, 24, 16, roof);
      box(g, -0.5, -0.5, 0.7, 0.5, 0, 18, walls, { beams: S.beams });
      // half built catapult
      const b = P(0.4, 0.5, 4); g.strokeStyle = '#6a4424'; g.lineWidth = 3; g.beginPath(); g.moveTo(b[0] - 14, b[1]); g.lineTo(b[0] + 12, b[1] - 3); g.moveTo(b[0], b[1]); g.lineTo(b[0] + 8, b[1] - 18); g.stroke();
      g.fillStyle = '#3a2a1a'; g.beginPath(); g.arc(b[0] - 10, b[1] + 3, 4, 0, 6.3); g.arc(b[0] + 9, b[1] + 1, 4, 0, 6.3); g.fill();
      flag(g, -1.1, -1.1, 30, pc.c, t);
      break;
    }
    case 'tower': {
      const s2 = STYLE[Math.max(1, st)];
      box(g, 0, 0, 0.42, 0.42, 0, 44, s2.stone, { bricks: true });
      box(g, 0, 0, 0.5, 0.5, 44, 8, s2.stone, { bricks: true });
      crenel(g, 0, 0, 0.5, 0.5, 52, s2.stone);
      windowAt(g, 0.0, 0.42, 30, 'l'); windowAt(g, 0.42, 0, 20, 'r');
      if (st >= 2) pyramid(g, 0, 0, 0.42, 0.42, 52, 18, s2.roof);
      flag(g, 0, 0, st >= 2 ? 70 : 52, pc.c, t, 0.9);
      break;
    }
    case 'castle': {
      const c = '#b0a894';
      box(g, 0, 0, 1.9, 1.9, 0, 4, '#8a8272', { bricks: true });
      // curtain walls
      box(g, 0, 0, 1.55, 1.55, 4, 30, c, { bricks: true });
      crenel(g, 0, 0, 1.55, 1.55, 34, c);
      // keep
      box(g, -0.3, -0.3, 0.8, 0.8, 34, 30, shade(c, 1.05).replace('rgb', 'rgb'), { bricks: true });
      box(g, -0.3, -0.3, 0.8, 0.8, 34, 30, '#bdb5a2', { bricks: true });
      crenel(g, -0.3, -0.3, 0.8, 0.8, 64, '#bdb5a2');
      // corner towers
      for (const [x, y] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) { cyl(g, x, y, 0.42, 4, 42, '#a8a08c'); cone(g, x, y, 0.48, 46, 20, '#3f5670'); }
      // gate
      const gp = [P(-0.3, 1.55, 4), P(0.3, 1.55, 4), P(0.3, 1.55, 22), P(-0.3, 1.55, 22)]; poly(g, gp, '#3a2616', 'rgba(0,0,0,0.5)');
      // banners hanging
      for (const x of [-0.9, 0.9]) { const a = P(x, 1.56, 30); g.fillStyle = pc.c; g.beginPath(); g.moveTo(a[0] - 4, a[1]); g.lineTo(a[0] + 4, a[1] - 4); g.lineTo(a[0] + 4, a[1] + 14); g.lineTo(a[0], a[1] + 20); g.lineTo(a[0] - 4, a[1] + 18); g.fill(); }
      flag(g, -0.3, -0.3, 68, pc.c, t, 1.3);
      break;
    }
    case 'palisade': {
      for (let k = 0; k < 4; k++) for (let j = 0; j < 4; j++) {
        if (k !== 3 && j !== 3 && k !== 0 && j !== 0) continue;
        const x = -0.38 + k * 0.25, y = -0.38 + j * 0.25; const a = P(x, y, 0), b = P(x, y, 22);
        g.strokeStyle = '#7a5230'; g.lineWidth = 5; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
        g.fillStyle = '#9a6a3a'; g.beginPath(); g.moveTo(b[0] - 2.5, b[1]); g.lineTo(b[0], b[1] - 5); g.lineTo(b[0] + 2.5, b[1]); g.fill();
      }
      break;
    }
    case 'wall': {
      const c = STYLE[Math.max(2, st)].stone;
      box(g, 0, 0, 0.5, 0.5, 0, 26, c, { bricks: true });
      crenel(g, 0, 0, 0.5, 0.5, 26, c);
      break;
    }
    case 'gate': {
      const c = STYLE[Math.max(2, st)].stone;
      box(g, -0.32, -0.32, 0.18, 0.18, 0, 38, c, { bricks: true });
      box(g, 0.32, 0.32, 0.18, 0.18, 0, 38, c, { bricks: true });
      box(g, 0, 0, 0.5, 0.5, 26, 8, c, { bricks: true });
      crenel(g, 0, 0, 0.5, 0.5, 34, c);
      flag(g, 0.32, 0.32, 38, pc.c, t, 0.7);
      break;
    }
    case 'dock': {
      // posts in water
      for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) { const a = P(k * 1.2, j * 1.2, -6), b = P(k * 1.2, j * 1.2, 4); g.strokeStyle = '#4a3018'; g.lineWidth = 3; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
      box(g, 0, 0, 1.4, 1.4, 2, 3, '#9a6e40', { top: '#a87a48' });
      g.strokeStyle = 'rgba(60,35,15,0.5)'; g.lineWidth = 0.8;
      for (let k = -1.3; k < 1.4; k += 0.25) { const a = P(k, -1.4, 5), b = P(k, 1.4, 5); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
      box(g, -0.6, -0.6, 0.6, 0.6, 5, 16, walls, { beams: S.beams });
      gableX(g, -0.6, -0.6, 0.6, 0.6, 21, 11, roof);
      // crane
      const cb = P(0.8, 0.8, 5), ct = P(0.8, 0.8, 34), ca = P(1.5, 0.3, 32); g.strokeStyle = '#5a3a1a'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(cb[0], cb[1]); g.lineTo(ct[0], ct[1]); g.lineTo(ca[0], ca[1]); g.stroke();
      g.lineWidth = 0.8; g.beginPath(); g.moveTo(ca[0], ca[1]); g.lineTo(ca[0], ca[1] + 16); g.stroke();
      box(g, 0.6, 1.0, 0.15, 0.15, 5, 5, '#8a6a40');
      flag(g, -1.2, 1.2, 5, pc.c, t, 0.9);
      break;
    }
    case 'outpost': {
      for (const [x, y] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) { const a = P(x, y, 0), b = P(x * 0.6, y * 0.6, 34); g.strokeStyle = '#6a4424'; g.lineWidth = 2; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
      box(g, 0, 0, 0.3, 0.3, 34, 3, '#8a6038');
      const f = P(0, 0, 40); g.fillStyle = '#ffb030'; g.beginPath(); g.ellipse(f[0], f[1], 2.5, 4, 0, 0, 6.3); g.fill();
      break;
    }
  }
}
const BLD_H = { house: 50, tc: 110, mill: 60, lumbercamp: 40, miningcamp: 36, barracks: 70, range: 60, stable: 50, blacksmith: 60, market: 50, university: 80, monastery: 110, siege: 55, tower: 90, castle: 120, palisade: 30, wall: 34, gate: 44, dock: 40, outpost: 48, farm: 10 };
function bldSprite(type, st, pc) {
  const key = type + '|' + st + '|' + pc.c;
  let s = R.spriteCache.get(key); if (s) return s;
  const size = BUILDINGS[type].size, SC = 2;
  const w = size * TW + 60, h = size * TH + (BLD_H[type] || 60) + 60;
  const cv = document.createElement('canvas'); cv.width = w * SC; cv.height = h * SC;
  const g = cv.getContext('2d'); g.scale(SC, SC);
  const ax = w / 2, ay = h - size * TH / 2 - 14;
  g.translate(ax, ay);
  // ground shadow & foundation
  g.fillStyle = 'rgba(0,0,0,0.18)'; poly(g, [P(-size / 2 + 0.1, -size / 2 + 0.1 + 0.25, 0), P(size / 2 + 0.25, -size / 2 + 0.25, 0), P(size / 2 + 0.25, size / 2 + 0.25, 0), P(-size / 2, size / 2 + 0.25, 0)], 'rgba(0,0,0,0.2)');
  if (type !== 'dock' && !BUILDINGS[type].wall && type !== 'gate' && type !== 'outpost') poly(g, [P(-size / 2, -size / 2, 0), P(size / 2, -size / 2, 0), P(size / 2, size / 2, 0), P(-size / 2, size / 2, 0)], 'rgba(150,130,95,0.55)');
  drawBuildingArt(g, type, st, pc, 0.3);
  s = { cv, ax, ay, w, h, SC };
  R.spriteCache.set(key, s);
  return s;
}
function bldStyle(b) { const p = W.players[b.owner]; return p ? Math.min(3, p.age) : 0; }
function drawBuilding(ctx, b, alpha) {
  const d = BUILDINGS[b.type], s = d.size;
  const cx = b.x + s / 2, cy = b.y + s / 2;
  const hh = d.water ? -0.35 : W.map.h(cx, cy);
  const gp = iso(cx, cy, hh);
  const pc = pcolor(b.owner);
  if (d.farm) { drawFarm(ctx, b, gp); return; }
  const sp = bldSprite(b.type, bldStyle(b), pc);
  ctx.save();
  if (alpha) ctx.globalAlpha = alpha;
  if (!b.built) {
    // foundation & scaffold
    const g = ctx; g.translate(gp.x, gp.y);
    poly(g, [P(-s / 2, -s / 2, 0), P(s / 2, -s / 2, 0), P(s / 2, s / 2, 0), P(-s / 2, s / 2, 0)], 'rgba(170,140,90,0.7)', 'rgba(80,60,30,0.8)', 1.2);
    const pr = b.progress;
    if (pr > 0.02) {
      const H = (BLD_H[b.type] || 60) + 20;
      g.save(); g.beginPath(); g.rect(-sp.ax, s * TH / 2 + 14 - (s * TH + H) * pr - 10, sp.w, sp.h); g.clip();
      g.drawImage(sp.cv, -sp.ax, -sp.ay, sp.w, sp.h); g.restore();
    }
    // scaffolding poles
    g.strokeStyle = '#8a6a40'; g.lineWidth = 1.5;
    const top = 10 + (BLD_H[b.type] || 50) * Math.min(1, pr + 0.25) * 0.7;
    for (const [x, y] of [[-s / 2, s / 2], [s / 2, s / 2], [s / 2, -s / 2], [0, s / 2], [s / 2, 0]]) { const a = P(x, y, 0), c = P(x, y, top); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(c[0], c[1]); g.stroke(); }
    for (let z = 10; z < top; z += 12) { const a = P(-s / 2, s / 2, z), c = P(s / 2, s / 2, z), e = P(s / 2, -s / 2, z); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(c[0], c[1]); g.lineTo(e[0], e[1]); g.stroke(); }
    ctx.restore();
    return;
  }
  ctx.drawImage(sp.cv, gp.x - sp.ax, gp.y - sp.ay, sp.w, sp.h);
  // animated overlays
  const t = R.time;
  if (b.type === 'mill') {
    const st = bldStyle(b); const hub = P(0.3, 0.58, st >= 2 ? 42 : 36);
    ctx.save(); ctx.translate(gp.x + hub[0], gp.y + hub[1]); const a = t * 1.2;
    for (let k = 0; k < 4; k++) { ctx.save(); ctx.rotate(a + k * Math.PI / 2); ctx.scale(0.8, 1); ctx.fillStyle = '#e8dcc0'; ctx.strokeStyle = '#5a3a20'; ctx.lineWidth = 1; ctx.fillRect(2, -3, 22, 6); ctx.strokeRect(2, -3, 22, 6); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(24, 0); ctx.stroke(); ctx.restore(); }
    ctx.fillStyle = '#5a3a20'; ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, 6.3); ctx.fill(); ctx.restore();
  }
  if (b.type === 'blacksmith' && Math.random() < 0.08) emitFx('smoke', b.x + 2.1, b.y + 1.0, 1);
  if (b.type === 'tc' && Math.random() < 0.02) emitFx('smoke', b.x + 1.2, b.y + 1.2, 1);
  if (b.type === 'gate' && b.open) { ctx.fillStyle = 'rgba(40,25,10,0.9)'; const a = P(-0.14, -0.14, 0); ctx.fillRect(gp.x + a[0] - 6, gp.y + a[1] - 22, 12, 22); }
  // relic glow in monastery
  if (b.type === 'monastery' && b.relics.length) { const r = P(-0.3, 1.2, 38); ctx.fillStyle = `rgba(255,220,100,${0.3 + Math.sin(t * 3) * 0.15})`; ctx.beginPath(); ctx.arc(gp.x + r[0], gp.y + r[1], 8, 0, 6.3); ctx.fill(); }
  // damage: flames
  if (b.hp < b.maxhp * 0.66) {
    const n = b.hp < b.maxhp * 0.33 ? 3 : 1;
    for (let k = 0; k < n; k++) {
      const rng = mulberry32(b.id * 13 + k); const fx = (rng() - 0.5) * s * 0.8, fy = (rng() - 0.5) * s * 0.8, fz = 10 + rng() * 20;
      const p = P(fx, fy, fz); drawFlame(ctx, gp.x + p[0], gp.y + p[1], 1 + n * 0.2, t + k);
    }
  }
  ctx.restore();
}
function drawFlame(ctx, x, y, s, t) {
  for (let i = 0; i < 3; i++) {
    const f = Math.sin(t * 12 + i * 2) * 1.5;
    ctx.fillStyle = ['rgba(255,80,20,0.85)', 'rgba(255,160,40,0.9)', 'rgba(255,240,150,0.9)'][i];
    ctx.beginPath(); ctx.moveTo(x - (6 - i * 2) * s, y); ctx.quadraticCurveTo(x - (3 - i) * s + f, y - (10 - i * 2) * s, x + f * 0.5, y - (16 - i * 4) * s); ctx.quadraticCurveTo(x + (3 - i) * s + f, y - (8 - i * 2) * s, x + (6 - i * 2) * s, y); ctx.fill();
  }
}
function drawFarm(ctx, b, gp) {
  const g = ctx; g.save(); g.translate(gp.x, gp.y);
  const s = 1.5;
  poly(g, [P(-s, -s, 0), P(s, -s, 0), P(s, s, 0), P(-s, s, 0)], b.built ? '#7a5a34' : 'rgba(150,120,80,0.6)', '#5a3e20', 1);
  const pr = b.built ? 1 : b.progress;
  const frac = b.built ? Math.max(0, b.food / Math.max(1, W.players[b.owner] ? W.players[b.owner].farmFood : 175)) : 0;
  for (let k = 0; k < 8; k++) {
    const y = -s + 0.2 + k * 0.37; if ((k + 1) / 8 > pr + 0.01) break;
    const a = P(-s + 0.15, y, 0), c = P(s - 0.15, y, 0);
    g.strokeStyle = '#5e4222'; g.lineWidth = 2; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(c[0], c[1]); g.stroke();
    if (b.built) {
      const hcol = frac > 0.5 ? '#c9b040' : frac > 0.2 ? '#9aaa38' : '#6a8a30';
      for (let j = 0; j < 10; j++) {
        const q = P(-s + 0.2 + j * 0.3, y, 0); const sway = Math.sin(R.time * 2 + j + k) * 0.8;
        const hh = 3 + frac * 6;
        g.strokeStyle = hcol; g.lineWidth = 1.3; g.beginPath(); g.moveTo(q[0], q[1]); g.lineTo(q[0] + sway, q[1] - hh); g.stroke();
        if (frac > 0.3) { g.fillStyle = '#e0c860'; g.fillRect(q[0] + sway - 1, q[1] - hh - 2, 2, 3); }
      }
    }
  }
  g.restore();
}

// ---------- resources ----------
function treeSprite(v, shadeV) {
  const key = 'tree' + v + '|' + shadeV;
  let s = R.spriteCache.get(key); if (s) return s;
  const SC = 2, w = 70, h = 100;
  const cv = document.createElement('canvas'); cv.width = w * SC; cv.height = h * SC;
  const g = cv.getContext('2d'); g.scale(SC, SC); g.translate(w / 2, h - 12);
  const rng = mulberry32(v * 100 + shadeV * 7 + 1);
  g.fillStyle = 'rgba(0,0,0,0.22)'; g.beginPath(); g.ellipse(6, 2, 18, 7, 0, 0, 6.3); g.fill();
  const sf = 0.85 + shadeV * 0.07;
  if (v === 0) { // oak
    g.fillStyle = '#5a3a1e'; g.beginPath(); g.moveTo(-3, 0); g.lineTo(-2, -22); g.lineTo(2, -22); g.lineTo(3.5, 0); g.fill();
    const cols = ['#2f5a1c', '#3b6e22', '#4a8228', '#5c9632'];
    for (let k = 0; k < 16; k++) { const a = rng() * 6.28, r = rng() * 13; g.fillStyle = shade(cols[(k * 4 / 16) | 0], sf); g.beginPath(); g.arc(Math.cos(a) * r * 1.1, -34 + Math.sin(a) * r * 0.9 - k * 0.3, 8 + rng() * 5, 0, 6.3); g.fill(); }
    for (let k = 0; k < 10; k++) { g.fillStyle = 'rgba(180,220,120,0.35)'; g.beginPath(); g.arc(-6 + rng() * 10, -44 + rng() * 12, 2 + rng() * 2, 0, 6.3); g.fill(); }
  } else if (v === 1) { // pine
    g.fillStyle = '#4a2e18'; g.fillRect(-2, -14, 4, 14);
    for (let k = 0; k < 5; k++) { const y = -12 - k * 11, wd = 17 - k * 3; g.fillStyle = shade(k % 2 ? '#1f4a2a' : '#285a32', sf + k * 0.04); g.beginPath(); g.moveTo(-wd, y); g.lineTo(0, y - 18); g.lineTo(wd, y); g.quadraticCurveTo(0, y + 4, -wd, y); g.fill(); g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.moveTo(0, y - 18); g.lineTo(wd, y); g.quadraticCurveTo(wd * 0.5, y + 2, 0, y + 1); g.fill(); }
  } else { // palm
    g.strokeStyle = '#7a5a3a'; g.lineWidth = 4; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(6, -24, 2, -46); g.stroke();
    for (let k = 0; k < 7; k++) { const a = k / 7 * 6.28; g.strokeStyle = shade('#3f7a2a', sf); g.lineWidth = 3; g.beginPath(); g.moveTo(2, -46); g.quadraticCurveTo(2 + Math.cos(a) * 12, -54 + Math.sin(a) * 4, 2 + Math.cos(a) * 20, -42 + Math.sin(a) * 6 + 6); g.stroke(); }
  }
  s = { cv, w, h, ax: w / 2, ay: h - 12 };
  R.spriteCache.set(key, s);
  return s;
}
function drawRes(ctx, e) {
  const cx = e.x + 0.5, cy = e.y + 0.5;
  const t = R.time;
  if (e.type === 'fish') { drawFish(ctx, e, t); return; }
  const gp = iso(cx, cy, W.map.h(cx, cy));
  const frac = e.amount / e.max;
  if (e.type === 'tree') {
    if (e.felled) {
      // felled trunk lying + stump
      ctx.save(); ctx.translate(gp.x, gp.y);
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(0, 2, 16, 5, 0, 0, 6.3); ctx.fill();
      const dir = e.fallDir || 1; const len = 10 + 18 * frac;
      ctx.fillStyle = '#6a4424'; ctx.save(); ctx.rotate(dir * 0.35); ctx.fillRect(0, -3, dir * len, 5); ctx.restore();
      ctx.fillStyle = e.v === 1 ? '#285a32' : '#3b6e22';
      if (frac > 0.4) { ctx.beginPath(); ctx.ellipse(dir * (len + 4), dir * 0.35 * (len + 4), 9 * frac + 3, 5, dir * 0.35, 0, 6.3); ctx.fill(); }
      ctx.fillStyle = '#5a3a1e'; ctx.beginPath(); ctx.ellipse(0, 0, 4, 2.5, 0, 0, 6.3); ctx.fill(); ctx.fillStyle = '#d9b27a'; ctx.beginPath(); ctx.ellipse(0, -1, 3.2, 1.8, 0, 0, 6.3); ctx.fill();
      ctx.restore(); return;
    }
    const sp = treeSprite(e.v, e.id % 4);
    const sway = Math.sin(t * 1.3 + e.id) * 0.015;
    ctx.save(); ctx.translate(gp.x, gp.y); ctx.transform(1, 0, sway, 1, 0, 0);
    const sc = 0.9 + ((e.id * 37) % 20) / 100;
    ctx.drawImage(sp.cv, -sp.ax * sc, -sp.ay * sc, sp.w * sc, sp.h * sc);
    ctx.restore(); return;
  }
  if (e.type === 'gold' || e.type === 'stone') {
    const gold = e.type === 'gold';
    const n = Math.max(1, Math.ceil(frac * 6));
    const rng = mulberry32(e.id * 11);
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(gp.x + 2, gp.y + 2, 20, 8, 0, 0, 6.3); ctx.fill();
    for (let k = 0; k < 6; k++) {
      const ox = (rng() - 0.5) * 30, oy = (rng() - 0.5) * 10, r = 5 + rng() * 5;
      if (k >= n) continue;
      const base = gold ? '#b8962a' : '#8a8680';
      ctx.fillStyle = shade(base, 0.8); ctx.beginPath(); ctx.moveTo(gp.x + ox - r, gp.y + oy); ctx.lineTo(gp.x + ox - r * 0.6, gp.y + oy - r * 1.1); ctx.lineTo(gp.x + ox + r * 0.4, gp.y + oy - r * 1.3); ctx.lineTo(gp.x + ox + r, gp.y + oy - r * 0.3); ctx.lineTo(gp.x + ox + r * 0.8, gp.y + oy + 2); ctx.lineTo(gp.x + ox - r * 0.7, gp.y + oy + 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(base, 1.25); ctx.beginPath(); ctx.moveTo(gp.x + ox - r * 0.6, gp.y + oy - r * 1.1); ctx.lineTo(gp.x + ox + r * 0.4, gp.y + oy - r * 1.3); ctx.lineTo(gp.x + ox + r * 0.2, gp.y + oy - r * 0.5); ctx.lineTo(gp.x + ox - r * 0.5, gp.y + oy - r * 0.4); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.7; ctx.stroke();
      if (gold) { ctx.fillStyle = '#ffe66a'; ctx.fillRect(gp.x + ox - 2, gp.y + oy - r * 0.8, 2, 2); ctx.fillRect(gp.x + ox + 2, gp.y + oy - r * 0.4, 1.5, 1.5); }
    }
    if (gold && Math.sin(t * 3 + e.id) > 0.97) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(gp.x + (e.id % 7) - 3, gp.y - 10, 1.5, 0, 6.3); ctx.fill(); }
    return;
  }
  if (e.type === 'berry') {
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(gp.x + 2, gp.y + 2, 14, 6, 0, 0, 6.3); ctx.fill();
    const rng = mulberry32(e.id * 5);
    for (let k = 0; k < 7; k++) { ctx.fillStyle = shade('#2f6a2a', 0.8 + rng() * 0.4); ctx.beginPath(); ctx.arc(gp.x + (rng() - 0.5) * 18, gp.y - 7 + (rng() - 0.5) * 8, 6 + rng() * 2, 0, 6.3); ctx.fill(); }
    const nb = Math.ceil(frac * 14);
    for (let k = 0; k < nb; k++) { ctx.fillStyle = k % 3 ? '#c8203a' : '#e84a5a'; ctx.beginPath(); ctx.arc(gp.x + (rng() - 0.5) * 20, gp.y - 7 + (rng() - 0.5) * 10, 1.6, 0, 6.3); ctx.fill(); }
    return;
  }
  if (e.type === 'shrub') {
    const rng = mulberry32(e.id * 3);
    for (let k = 0; k < 4; k++) { ctx.fillStyle = shade('#4a7a2a', 0.8 + rng() * 0.4); ctx.beginPath(); ctx.arc(gp.x + (rng() - 0.5) * 12, gp.y - 3 + (rng() - 0.5) * 4, 3 + rng() * 2, 0, 6.3); ctx.fill(); }
    return;
  }
  if (e.type === 'carcass') {
    const fx = e.fx || cx, fy = e.fy || cy; const p = iso(fx, fy, W.map.h(fx, fy));
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(e.face || 1, 1);
    const s = 0.6 + 0.4 * frac;
    drawAnimalBody(ctx, e.animal, 0, 'dead', s);
    ctx.fillStyle = '#a8202a'; ctx.beginPath(); ctx.ellipse(0, -3, 5 * s, 2.5 * s, 0, 0, 6.3); ctx.fill();
    ctx.restore();
  }
}
function drawFish(ctx, e, t) {
  const cx = e.x + 0.5, cy = e.y + 0.5; const gp = iso(cx, cy, -0.35);
  const n = Math.max(1, Math.ceil(e.amount / e.max * 4));
  for (let k = 0; k < n; k++) {
    const a = t * (0.6 + k * 0.15) + k * 1.7 + e.id;
    const x = gp.x + Math.cos(a) * 12, y = gp.y + Math.sin(a) * 5;
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(Math.cos(a) * 5, -Math.sin(a) * 12) * 0.5);
    ctx.fillStyle = e.v ? 'rgba(20,40,60,0.55)' : 'rgba(30,60,70,0.5)'; ctx.beginPath(); ctx.ellipse(0, 0, e.v ? 7 : 5, 2, 0, 0, 6.3); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(-9, -2.5); ctx.lineTo(-9, 2.5); ctx.fill();
    ctx.restore();
  }
  // leaping fish occasionally
  const ph = (t * 0.5 + e.id * 0.37) % 4;
  if (ph < 0.6) {
    const f = ph / 0.6; const x = gp.x - 10 + f * 20, y = gp.y - Math.sin(f * Math.PI) * 14;
    ctx.fillStyle = '#b8c8d0'; ctx.save(); ctx.translate(x, y); ctx.rotate(-0.8 + f * 1.6); ctx.beginPath(); ctx.ellipse(0, 0, 5, 2, 0, 0, 6.3); ctx.fill(); ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(-7, -2); ctx.lineTo(-7, 2); ctx.fill(); ctx.restore();
    if (f > 0.85 || f < 0.15) { ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.ellipse(f < 0.5 ? gp.x - 10 : gp.x + 10, gp.y, 5, 2, 0, 0, 6.3); ctx.stroke(); }
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.ellipse(gp.x, gp.y, 10 + (t * 6 % 6), 4 + (t * 2 % 2), 0, 0, 6.3); ctx.stroke();
}
function drawRelic(ctx, r, x, y) {
  const t = R.time;
  ctx.fillStyle = `rgba(255,220,120,${0.25 + Math.sin(t * 3) * 0.12})`; ctx.beginPath(); ctx.ellipse(x, y - 6, 14, 9, 0, 0, 6.3); ctx.fill();
  ctx.save(); ctx.translate(x, y);
  box(ctx, 0, 0, 0.2, 0.14, 0, 8, '#c8a030', { top: '#f0d060' });
  gableX(ctx, 0, 0, 0.2, 0.14, 8, 5, '#d8b040', 0.02);
  const c = P(0, 0.14, 4); ctx.fillStyle = '#b02030'; ctx.beginPath(); ctx.arc(c[0], c[1], 1.5, 0, 6.3); ctx.fill();
  ctx.restore();
}

// ---------- units ----------
const SKIN = ['#e8c4a0', '#d8a878', '#c08858', '#f0d0b0'];
function limb(g, x0, y0, len, ang, w, col) { const x1 = x0 + Math.sin(ang) * len, y1 = y0 + Math.cos(ang) * len; g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); return [x1, y1]; }
function workSwing(t, period, sharp = 3) { const ph = (t % period) / period; return ph < 0.7 ? ph / 0.7 : 1 - Math.pow((ph - 0.7) / 0.3, 1 / sharp); } // raise slow, strike fast
function drawHuman(g, o) {
  // o: t, anim, work, pc, tunic, legs, skin, head, weapon, shield, carry, female, crouch, torsoCol
  const t = o.t;
  const walk = o.anim === 'walk';
  const legA = walk ? Math.sin(t * 11) * 0.55 : 0;
  const bob = walk ? Math.abs(Math.sin(t * 11)) * 1.2 : Math.sin(t * 2) * 0.3;
  let crouch = o.crouch || 0, lean = o.lean || 0;
  const hipY = -10 + crouch - bob;
  // legs
  if (!o.robe) {
    limb(g, -1, hipY, 10 - crouch * 0.6, legA - crouch * 0.05, 2.6, o.legs);
    limb(g, 1.2, hipY, 10 - crouch * 0.6, -legA + crouch * 0.08, 2.6, shade(o.legs.startsWith('#') ? o.legs : '#555', 0.8));
    g.fillStyle = '#3a2a1a'; const f1 = [-1 + Math.sin(legA) * 10, hipY + Math.cos(legA) * 10]; g.fillRect(f1[0] - 1, f1[1] - 1, 3.5, 2);
  }
  g.save(); g.translate(0, hipY); g.rotate(lean);
  // back arm
  const armBack = o.armBack !== undefined ? o.armBack : (walk ? -legA * 0.8 : 0.15);
  limb(g, -1.5, -8, 7.5, armBack, 2.3, shade(o.tunic, 0.75));
  // torso
  if (o.robe) {
    g.fillStyle = o.tunic; g.beginPath(); g.moveTo(-4, -10); g.lineTo(4, -10); g.lineTo(5.5, 10 - crouch); g.lineTo(-5.5, 10 - crouch); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 0.6; g.stroke();
  } else {
    g.fillStyle = o.tunic; g.beginPath(); g.moveTo(-3.8, -10); g.lineTo(3.8, -10); g.lineTo(4.4, 1.5); g.lineTo(-4.4, 1.5); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 0.6; g.stroke();
  }
  if (o.torsoDetail) o.torsoDetail(g);
  if (o.sash) { g.fillStyle = o.sash; g.fillRect(-4.2, -2.5, 8.4, 2); }
  // head
  g.fillStyle = o.skin; g.beginPath(); g.arc(0.5, -13.5, 3.3, 0, 6.3); g.fill();
  if (o.head) o.head(g); else { g.fillStyle = o.hair || '#4a3020'; g.beginPath(); g.arc(0.2, -14.5, 3.4, Math.PI, 0); g.fill(); }
  g.fillStyle = '#222'; g.fillRect(2.4, -14, 0.9, 0.9);
  // front arm + held item
  const armFront = o.armFront !== undefined ? o.armFront : (walk ? legA * 0.8 : -0.1);
  const hand = limb(g, 1.5, -8, 7.5, armFront, 2.4, o.tunic);
  g.fillStyle = o.skin; g.beginPath(); g.arc(hand[0], hand[1], 1.3, 0, 6.3); g.fill();
  if (o.item) { g.save(); g.translate(hand[0], hand[1]); g.rotate(-armFront + (o.itemRot || 0)); o.item(g); g.restore(); }
  if (o.shield) o.shield(g);
  g.restore();
  if (o.carry) o.carry(g, hipY);
}
// tools & weapons drawn in hand space (pointing +y down from hand originally; rotated to arm)
const ITEMS = {
  axe: g => { g.strokeStyle = '#6a4424'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, 2); g.lineTo(0, -9); g.stroke(); g.fillStyle = '#b8bcc4'; g.beginPath(); g.moveTo(0, -9); g.lineTo(4.5, -10.5); g.lineTo(4.5, -5.5); g.lineTo(0, -6.5); g.fill(); },
  pick: g => { g.strokeStyle = '#6a4424'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, 2); g.lineTo(0, -9); g.stroke(); g.strokeStyle = '#9aa0a8'; g.lineWidth = 1.8; g.beginPath(); g.moveTo(-5, -7); g.quadraticCurveTo(0, -11, 5, -7); g.stroke(); },
  hammer: g => { g.strokeStyle = '#6a4424'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(0, 1); g.lineTo(0, -7); g.stroke(); g.fillStyle = '#777'; g.fillRect(-2.5, -9.5, 5, 3); },
  hoe: g => { g.strokeStyle = '#7a5434'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(0, 4); g.lineTo(0, -12); g.stroke(); g.strokeStyle = '#999'; g.lineWidth = 1.8; g.beginPath(); g.moveTo(0, -12); g.lineTo(4, -10); g.stroke(); },
  spear: g => { g.strokeStyle = '#7a5434'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(0, 5); g.lineTo(0, -14); g.stroke(); g.fillStyle = '#ccc'; g.beginPath(); g.moveTo(-1.5, -14); g.lineTo(0, -19); g.lineTo(1.5, -14); g.fill(); },
  pike: g => { g.strokeStyle = '#7a5434'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(0, 6); g.lineTo(0, -24); g.stroke(); g.fillStyle = '#ddd'; g.beginPath(); g.moveTo(-1.5, -24); g.lineTo(0, -29); g.lineTo(1.5, -24); g.fill(); },
  knife: g => { g.fillStyle = '#ddd'; g.fillRect(-0.6, -5, 1.4, 5); g.fillStyle = '#5a3a1a'; g.fillRect(-0.8, 0, 1.8, 2); },
  basket: g => { g.fillStyle = '#b08850'; g.beginPath(); g.ellipse(0, 1, 3.5, 2.5, 0, 0, 6.3); g.fill(); g.fillStyle = '#c8203a'; g.beginPath(); g.arc(-1, 0, 1, 0, 6.3); g.arc(1.2, 0.3, 1, 0, 6.3); g.fill(); },
  sword: g => { g.fillStyle = '#e0e4ea'; g.beginPath(); g.moveTo(-1, -1); g.lineTo(-0.8, -13); g.lineTo(0, -15); g.lineTo(0.8, -13); g.lineTo(1, -1); g.fill(); g.fillStyle = '#8a6a2a'; g.fillRect(-3, -1.5, 6, 1.5); g.fillRect(-0.7, 0, 1.4, 3); },
  bigsword: g => { g.fillStyle = '#e8ecf2'; g.beginPath(); g.moveTo(-1.3, -1); g.lineTo(-1.1, -19); g.lineTo(0, -22); g.lineTo(1.1, -19); g.lineTo(1.3, -1); g.fill(); g.fillStyle = '#8a6a2a'; g.fillRect(-4, -1.5, 8, 1.6); g.fillRect(-0.8, 0, 1.6, 5); },
  katana: g => { g.strokeStyle = '#e8ecf2'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(1.5, -8, 0.5, -16); g.stroke(); g.fillStyle = '#222'; g.fillRect(-0.8, 0, 1.6, 4); },
  staff: g => { g.strokeStyle = '#7a5434'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(0, 8); g.lineTo(0, -16); g.stroke(); g.strokeStyle = '#e8c860'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, -16); g.lineTo(0, -21); g.moveTo(-2, -19); g.lineTo(2, -19); g.stroke(); },
  jav: g => { g.strokeStyle = '#8a6444'; g.lineWidth = 1.1; g.beginPath(); g.moveTo(0, 3); g.lineTo(0, -13); g.stroke(); g.fillStyle = '#bbb'; g.beginPath(); g.moveTo(-1, -13); g.lineTo(0, -16); g.lineTo(1, -13); g.fill(); },
  throwaxe: g => { g.strokeStyle = '#6a4424'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(0, 1); g.lineTo(0, -7); g.stroke(); g.fillStyle = '#c8ccd4'; g.beginPath(); g.moveTo(0, -7); g.quadraticCurveTo(4, -9, 4, -4); g.lineTo(0, -5); g.fill(); },
  gun: g => { g.fillStyle = '#5a3a1a'; g.fillRect(-1, -2, 2.4, 5); g.fillStyle = '#444'; g.fillRect(-0.7, -13, 1.6, 11); },
};
function bowItem(draw) {
  return g => {
    g.strokeStyle = '#6a4424'; g.lineWidth = 1.6; g.beginPath(); g.arc(-5, 0, 9, -1.1, 1.1); g.stroke();
    const sx = -5 + Math.cos(1.1) * 9, sy = Math.sin(1.1) * 9;
    g.strokeStyle = '#eee'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(sx, -sy); g.lineTo(sx - draw * 5, 0); g.lineTo(sx, sy); g.stroke();
    if (draw > 0.3) { g.strokeStyle = '#8a6a4a'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(sx - draw * 5, 0); g.lineTo(sx - draw * 5 + 13, 0); g.stroke(); }
  };
}
function xbowItem(g) { g.fillStyle = '#6a4424'; g.fillRect(-1, -9, 2.2, 11); g.strokeStyle = '#5a3a1a'; g.lineWidth = 1.6; g.beginPath(); g.arc(0, -3, 6, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); }
function roundShield(pc, x = 3.5, y = -4, r = 4) { return g => { g.fillStyle = pc.c; g.beginPath(); g.arc(x, y, r, 0, 6.3); g.fill(); g.strokeStyle = shade('#888888', 0.8); g.lineWidth = 1; g.stroke(); g.fillStyle = '#ddd'; g.beginPath(); g.arc(x, y, 1.2, 0, 6.3); g.fill(); }; }
function kiteShield(pc, x = 4, y = -5) { return g => { g.fillStyle = pc.c; g.beginPath(); g.moveTo(x - 3.5, y - 5); g.lineTo(x + 3.5, y - 5); g.lineTo(x + 3, y + 2); g.lineTo(x, y + 6); g.lineTo(x - 3, y + 2); g.closePath(); g.fill(); g.strokeStyle = '#ddd'; g.lineWidth = 0.8; g.stroke(); g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(x, y - 4); g.lineTo(x, y + 4); g.moveTo(x - 2.5, y - 1.5); g.lineTo(x + 2.5, y - 1.5); g.stroke(); }; }
const HELM = {
  kettle: col => g => { g.fillStyle = col || '#8a8e96'; g.beginPath(); g.arc(0.5, -14.5, 3.8, Math.PI, 0); g.fill(); g.fillRect(-4, -14.8, 9, 1.4); },
  nasal: col => g => { g.fillStyle = col || '#9aa0a8'; g.beginPath(); g.moveTo(-3, -13.5); g.quadraticCurveTo(0.5, -20.5, 4, -13.5); g.fill(); g.fillRect(2.8, -14, 0.9, 3); },
  great: col => g => { g.fillStyle = col || '#a8aeb8'; g.fillRect(-3, -18, 7.2, 7.5); g.fillStyle = '#222'; g.fillRect(1, -15.5, 3.2, 0.9); },
  hood: col => g => { g.fillStyle = col; g.beginPath(); g.arc(0.3, -13.8, 4, Math.PI * 0.9, Math.PI * 2.1); g.lineTo(-3, -10); g.fill(); },
  straw: () => g => { g.fillStyle = '#e0c878'; g.beginPath(); g.ellipse(0.5, -16, 6, 1.6, 0, 0, 6.3); g.fill(); g.beginPath(); g.arc(0.5, -16.5, 2.8, Math.PI, 0); g.fill(); },
  scarf: col => g => { g.fillStyle = col; g.beginPath(); g.arc(0.3, -14, 3.8, Math.PI * 0.85, Math.PI * 2.05); g.lineTo(-3.5, -9.5); g.fill(); },
  kabuto: () => g => { g.fillStyle = '#2a2a2a'; g.beginPath(); g.arc(0.5, -14.5, 4, Math.PI, 0); g.fill(); g.fillStyle = '#c8a030'; g.beginPath(); g.moveTo(-2, -18); g.lineTo(0.5, -22); g.lineTo(3, -18); g.fill(); g.fillStyle = '#2a2a2a'; g.fillRect(-4.5, -14.5, 10, 1.5); },
  horned: () => g => { g.fillStyle = '#8a8e96'; g.beginPath(); g.arc(0.5, -14.5, 3.8, Math.PI, 0); g.fill(); g.strokeStyle = '#eee8d0'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-3, -16); g.quadraticCurveTo(-6, -18, -5, -21); g.moveTo(4, -16); g.quadraticCurveTo(7, -18, 6, -21); g.stroke(); },
  turban: () => g => { g.fillStyle = '#f0ece0'; g.beginPath(); g.ellipse(0.5, -16, 4.2, 3, 0, 0, 6.3); g.fill(); g.fillStyle = '#c03030'; g.fillRect(-0.5, -17, 2, 1.5); },
  tophat: () => g => { g.fillStyle = '#222'; g.fillRect(-2.5, -22, 6, 6); g.fillRect(-4, -16.5, 9, 1.4); },
  mono: col => g => { g.fillStyle = col; g.beginPath(); g.arc(0.3, -14, 4.1, Math.PI * 0.8, Math.PI * 2.15); g.lineTo(-4, -8); g.fill(); },
};
function villagerLook(u, pc) {
  const female = u.id % 3 === 0;
  const w = u.work ? u.work.kind : null;
  const o = { tunic: female ? mix(pc.c, '#d8c8a8', 0.35) : pc.c, legs: female ? mix(pc.c, '#d8c8a8', 0.35) : '#6a5038', skin: SKIN[u.id % 4], hair: ['#3a2410', '#6a4020', '#1a1008', '#a07030'][u.id % 4], robe: female, sash: female ? '#f0e8d0' : '#6a4a2a' };
  if (female) o.head = HELM.scarf('#f0e8d8');
  else if (w === 'farm' || (u.order && u.order.t === 'farm')) o.head = HELM.straw();
  return o;
}
function drawUnitFigure(g, u, t) {
  const d = UNITS[u.type], pc = pcolor(u.owner), anim = u.anim;
  const skin = SKIN[u.id % 4];
  const attacking = anim === 'attack';
  const atkPh = attacking ? workSwing(t - (u.atkT || 0) * 0 , d.rof || 2, 3) : 0;
  const since = u.atkT !== undefined ? (W.t - u.atkT) : 9;
  const strike = attacking ? Math.max(0, 1 - since / 0.35) : 0; // 1 right after hit
  const raise = attacking ? Math.min(1, Math.max(0, (since - 0.3) / Math.max(0.3, (d.rof || 2) - 0.5))) : 0;
  const swingArm = attacking ? (-2.6 * raise + 0.5 * strike) : undefined;
  switch (d.draw) {
    case 'villager': {
      const o = villagerLook(u, pc); o.t = t; o.anim = anim;
      const wk = u.work ? u.work.kind : null;
      if (anim === 'work' && wk) {
        const period = { chop: 0.9, mine: 1.0, build: 0.55, repair: 0.6, farm: 1.4, forage: 1.2, butcher: 0.9, hunt: 1.6 }[wk] || 1;
        const s = workSwing(t, period, wk === 'build' || wk === 'repair' ? 2 : 3);
        if (wk === 'chop') { o.item = ITEMS.axe; o.armFront = -2.8 + s * 3.1; o.armBack = -2.5 + s * 2.8; o.lean = s * 0.15; }
        else if (wk === 'mine') { o.item = ITEMS.pick; o.armFront = -3.0 + s * 3.4; o.armBack = -2.6 + s * 3.0; o.lean = 0.1 + s * 0.2; }
        else if (wk === 'build' || wk === 'repair') { o.item = ITEMS.hammer; o.armFront = -1.9 + s * 1.9; o.crouch = 3; o.lean = 0.25; }
        else if (wk === 'farm') { o.item = ITEMS.hoe; o.armFront = -0.6 + s * 1.3; o.armBack = -0.4 + s * 1.1; o.lean = 0.3 + s * 0.15; o.itemRot = 0.4; }
        else if (wk === 'forage') { o.armFront = -1.4 - Math.sin(t * 5) * 0.5; o.armBack = 0.4; o.carry = (g, hy) => { g.save(); g.translate(-4, hy - 4); ITEMS.basket(g); g.restore(); }; }
        else if (wk === 'butcher') { o.item = ITEMS.knife; o.crouch = 4; o.lean = 0.35; o.armFront = 0.2 + Math.sin(t * 9) * 0.6; }
      } else if (attacking) {
        if (u.order && u.order.t === 'hunt') { o.item = ITEMS.spear; o.armFront = -2.6 * raise + strike * 1.2; }
        else { o.item = ITEMS.knife; o.armFront = swingArm; }
      } else if (u.order && u.order.t === 'hunt') o.item = ITEMS.spear;
      if (u.carry && u.carry.amt > 0.5 && anim !== 'work') {
        const r = u.carry.res, amt = Math.min(1, u.carry.amt / 10);
        o.armFront = -2.5; o.armBack = -2.4;
        o.carry = (g, hy) => {
          g.save(); g.translate(0, hy - 16);
          if (r === 'wood') { g.fillStyle = '#7a4f28'; for (let k = 0; k < 1 + amt * 3; k++) { g.save(); g.rotate(-0.25); g.fillRect(-7, -2 - k * 2.2, 14, 2.2); g.restore(); } g.fillStyle = '#d9b27a'; g.beginPath(); g.arc(7, -3, 1.2, 0, 6.3); g.fill(); }
          else if (r === 'gold') { g.fillStyle = '#8a6a3a'; g.beginPath(); g.ellipse(0, -2, 4.5, 3.5, 0, 0, 6.3); g.fill(); g.fillStyle = '#f0c830'; g.beginPath(); g.arc(-1, -4.5, 1.8, 0, 6.3); g.arc(1.5, -4, 1.6, 0, 6.3); g.fill(); }
          else if (r === 'stone') { g.fillStyle = '#9a948c'; g.fillRect(-4, -6, 8, 5); g.strokeStyle = '#555'; g.lineWidth = 0.5; g.strokeRect(-4, -6, 8, 5); }
          else { g.fillStyle = '#b08850'; g.beginPath(); g.ellipse(0, -2, 5, 3, 0, 0, 6.3); g.fill(); g.fillStyle = u.work && u.work.kind === 'butcher' ? '#b0303a' : '#d83040'; g.beginPath(); g.arc(-1.5, -4, 1.5, 0, 6.3); g.arc(1.5, -4, 1.5, 0, 6.3); g.fill(); }
          g.restore();
        };
      }
      drawHuman(g, o);
      break;
    }
    case 'sword': case 'samurai': case 'tknight': case 'berserk': {
      const tier = { militia: 0, manatarms: 1, longsword: 2, twohanded: 3, tknight: 4, samurai: 5, berserk: 6 }[u.type] || 0;
      const o = { t, anim, tunic: pc.c, legs: tier >= 2 ? '#707680' : '#5a4a3a', skin, sash: '#5a3a1a' };
      o.head = [HELM.kettle(), HELM.nasal(), HELM.nasal('#b0b6c0'), HELM.great(), HELM.great('#606670'), HELM.kabuto(), HELM.horned()][tier];
      o.item = tier === 3 || tier === 4 ? ITEMS.bigsword : tier === 5 ? ITEMS.katana : tier === 6 ? ITEMS.axe : ITEMS.sword;
      if (tier === 5) o.tunic = mix(pc.c, '#303030', 0.25);
      if (tier === 4) o.torsoDetail = g => { g.fillStyle = '#f4f0e8'; g.fillRect(-3.8, -10, 7.6, 11.5); g.fillStyle = pc.c; g.fillRect(-0.9, -8.5, 1.8, 8); g.fillRect(-3, -6, 6, 1.8); };
      if (tier >= 1 && tier <= 3) o.torsoDetail = g => { g.fillStyle = 'rgba(160,165,175,0.55)'; g.fillRect(-3.8, -10, 7.6, 4); };
      if (tier < 3 || tier === 6) o.shield = tier === 6 ? roundShield(pc, 4, -4, 4.5) : tier === 0 ? roundShield(pc) : kiteShield(pc);
      o.armFront = attacking ? swingArm : undefined;
      drawHuman(g, o); break;
    }
    case 'spear': {
      const o = { t, anim, tunic: pc.c, legs: '#5a4a3a', skin, head: u.type === 'pikeman' ? HELM.kettle('#9aa0a8') : HELM.hood(shade(pc.c, 0.7)), item: u.type === 'pikeman' ? ITEMS.pike : ITEMS.spear, sash: '#6a4a2a' };
      o.armFront = attacking ? -1.2 - strike * 0.6 + raise * 0.3 : -0.9; o.itemRot = attacking ? -0.3 : 0;
      o.shield = u.type === 'spearman' ? roundShield(pc, 3, -3, 3.5) : null;
      drawHuman(g, o); break;
    }
    case 'bow': case 'xbow': case 'jav': case 'axeman': {
      const o = { t, anim, tunic: pc.c, legs: '#5a5040', skin, sash: '#6a4a2a' };
      if (d.draw === 'bow') { o.head = HELM.hood(mix(pc.c, '#3a5a2a', 0.5)); o.item = bowItem(attacking ? raise : 0); o.armFront = attacking ? -1.57 : 0.1; o.itemRot = 1.57; o.armBack = attacking ? -1.57 + 0.3 * raise : 0.1; }
      else if (d.draw === 'xbow') { o.head = u.type === 'chukonu' ? HELM.kabuto() : HELM.kettle(); o.item = xbowItem; o.armFront = attacking ? -1.5 : 0.2; o.armBack = attacking ? -1.3 : 0.1; }
      else if (d.draw === 'jav') { o.head = HELM.hood('#8a7050'); o.item = ITEMS.jav; o.armFront = attacking ? -2.8 * raise + strike * 1.5 : -0.2; o.shield = roundShield(pc, -3, -4, 3); }
      else { o.head = HELM.nasal(); o.item = ITEMS.throwaxe; o.armFront = attacking ? -2.8 * raise + strike * 2 : 0; o.shield = kiteShield(pc, -3, -5); }
      if (u.type === 'genoese') o.head = HELM.kettle('#c0c4cc');
      o.carry = (g, hy) => { g.fillStyle = '#6a4424'; g.save(); g.translate(-3, hy - 8); g.rotate(-0.3); g.fillRect(-1.5, -6, 3, 9); g.fillStyle = '#ddd'; g.fillRect(-1.5, -7.5, 1, 2); g.fillRect(0.5, -7.5, 1, 2); g.restore(); };
      drawHuman(g, o); break;
    }
    case 'monk': {
      const o = { t, anim, tunic: '#8a6a4a', legs: '#5a4030', skin, robe: true, head: HELM.mono('#7a5a3a'), item: ITEMS.staff, sash: pc.c };
      if (anim === 'work') { o.armFront = -2.6 + Math.sin(t * 4) * 0.2; o.armBack = -2.4 + Math.cos(t * 4) * 0.2; }
      if (u.relic) o.carry = (g, hy) => { g.save(); g.translate(0, hy - 20); g.fillStyle = '#e8c040'; g.fillRect(-3.5, -4, 7, 5); g.fillStyle = '#b02030'; g.fillRect(-0.7, -3.5, 1.4, 4); g.restore(); };
      if (u.recharge > 0) o.tunic = '#6a5a4a';
      drawHuman(g, o);
      if (anim === 'work' && u.work && u.work.kind === 'convert') { g.strokeStyle = `rgba(255,240,150,${0.5 + Math.sin(t * 8) * 0.3})`; g.lineWidth = 1; g.beginPath(); g.arc(0, -30, 5 + Math.sin(t * 6) * 2, 0, 6.3); g.stroke(); }
      if (anim === 'work' && u.work && u.work.kind === 'heal') { g.fillStyle = 'rgba(160,255,160,0.5)'; g.beginPath(); g.arc(0, -30, 3, 0, 6.3); g.fill(); }
      break;
    }
    case 'scout': case 'knight': case 'cavarcher': case 'conq': case 'mameluke': {
      const camel = d.draw === 'mameluke';
      const horseCol = { scout: '#a87848', knight: '#e8e4dc', cavarcher: '#6a4428', conq: '#2a2420', mameluke: '#c8a870' }[d.draw];
      drawHorse(g, u, t, anim, horseCol, pc, camel, d.draw === 'knight' ? (u.type === 'cataphract' ? 'barding' : 'caparison') : null);
      g.save(); g.translate(camel ? 2 : 1, camel ? -14 : -10);
      const rider = { t, anim: 'idle', tunic: pc.c, legs: '#5a4a3a', skin, sash: '#6a4a2a', crouch: 0 };
      rider.head = d.draw === 'knight' ? (u.type === 'cataphract' ? HELM.nasal('#c8a040') : HELM.great()) : d.draw === 'scout' ? HELM.kettle() : d.draw === 'conq' ? HELM.kettle('#c0c4cc') : d.draw === 'mameluke' ? HELM.turban() : HELM.hood(mix(pc.c, '#444', 0.4));
      if (d.draw === 'knight' || d.draw === 'scout') { rider.item = d.draw === 'knight' ? ITEMS.sword : ITEMS.spear; rider.armFront = attacking ? swingArm : -0.5; rider.shield = d.draw === 'knight' ? kiteShield(pc, -2, -5) : null; }
      if (d.draw === 'cavarcher') { rider.item = bowItem(attacking ? raise : 0); rider.armFront = attacking ? -1.57 : 0; rider.itemRot = 1.57; }
      if (d.draw === 'conq') { rider.item = ITEMS.gun; rider.armFront = attacking ? -1.57 : -0.3; rider.itemRot = 0; }
      if (d.draw === 'mameluke') { rider.item = ITEMS.throwaxe; rider.armFront = attacking ? -2.6 * raise + strike * 2 : -0.4; }
      // seated legs
      g.strokeStyle = '#5a4a3a'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(0, -10 + 10); g.lineTo(3, 5); g.lineTo(2, 9); g.stroke();
      drawHuman(g, Object.assign(rider, { robe: true, crouch: 0 }));
      g.restore();
      break;
    }
    case 'cart': {
      drawHorse(g, u, t, anim, '#8a6a4a', pc, false, null, 0.8, 10);
      g.save(); g.translate(-10, 0);
      const wa = u.anim === 'walk' ? t * 6 : 0;
      box(g, 0, 0, 0.28, 0.2, 5, 7, '#8a6038');
      const w = P(0, 0.25, 4); g.strokeStyle = '#3a2a1a'; g.lineWidth = 1.5; g.beginPath(); g.arc(w[0], w[1], 4.5, 0, 6.3); g.stroke(); g.beginPath(); g.moveTo(w[0] + Math.cos(wa) * 4.5, w[1] + Math.sin(wa) * 4.5); g.lineTo(w[0] - Math.cos(wa) * 4.5, w[1] - Math.sin(wa) * 4.5); g.stroke();
      g.fillStyle = u.tradeGold ? '#e8c040' : '#c8b088'; g.beginPath(); g.ellipse(0, -14, 7, 4, 0, 0, 6.3); g.fill();
      g.fillStyle = pc.c; g.fillRect(-7, -12, 14, 2);
      g.restore(); break;
    }
    case 'ram': {
      const recoil = attacking ? strike * 5 : 0;
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(0, 2, 20, 8, 0, 0, 6.3); g.fill();
      for (const x of [-10, 8]) { g.fillStyle = '#3a2a1a'; g.beginPath(); g.arc(x, 0, 4.5, 0, 6.3); g.fill(); }
      g.fillStyle = '#7a5530'; g.fillRect(-16, -14, 30, 12);
      g.fillStyle = '#5a3a1e'; g.beginPath(); g.moveTo(-18, -14); g.lineTo(0, -26); g.lineTo(16, -14); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.3)'; for (let k = -14; k < 14; k += 5) { g.beginPath(); g.moveTo(k, -14); g.lineTo(k, -2); g.stroke(); }
      g.fillStyle = '#6a4424'; g.fillRect(8 + recoil, -10, 14, 4); g.fillStyle = '#888'; g.fillRect(20 + recoil, -11, 4, 6);
      g.fillStyle = pc.c; g.fillRect(-12, -20, 6, 4);
      break;
    }
    case 'mangonel': case 'trebuchet': case 'scorpion': {
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(0, 2, 18, 7, 0, 0, 6.3); g.fill();
      if (d.draw === 'scorpion') {
        g.fillStyle = '#6a4424'; g.fillRect(-10, -6, 20, 4); g.fillRect(-2, -12, 4, 8);
        g.strokeStyle = '#4a2e14'; g.lineWidth = 2; g.beginPath(); g.arc(4, -12, 9, -1.3, 1.3); g.stroke();
        g.strokeStyle = '#ddd'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(4 + Math.cos(1.3) * 9, -12 - 9 * Math.sin(1.3)); g.lineTo(4 - raise * 6, -12); g.lineTo(4 + Math.cos(1.3) * 9, -12 + 9 * Math.sin(1.3)); g.stroke();
        g.fillStyle = pc.c; g.fillRect(-10, -8, 5, 3);
        for (const x of [-8, 7]) { g.fillStyle = '#3a2a1a'; g.beginPath(); g.arc(x, -1, 3, 0, 6.3); g.fill(); }
      } else if (d.draw === 'mangonel') {
        for (const x of [-10, 9]) { g.fillStyle = '#3a2a1a'; g.beginPath(); g.arc(x, -1, 4, 0, 6.3); g.fill(); }
        g.fillStyle = '#7a5530'; g.fillRect(-14, -8, 28, 5); g.fillRect(-4, -18, 4, 12);
        const armA = attacking ? (-1.4 + 1.4 * Math.min(1, since / 0.25) * 1 - (since > 0.3 ? Math.min(1.4, (since - 0.3) * 0.6) : 0)) : 0.1;
        g.save(); g.translate(-2, -12); g.rotate(-1.2 - armA); g.fillStyle = '#6a4424'; g.fillRect(-1.5, 0, 3, 18); g.fillStyle = '#4a3018'; g.beginPath(); g.arc(0, 18, 3.5, 0, Math.PI); g.fill(); g.restore();
        g.fillStyle = pc.c; g.fillRect(8, -12, 5, 3);
      } else {
        g.strokeStyle = '#6a4424'; g.lineWidth = 3; g.beginPath(); g.moveTo(-16, 0); g.lineTo(-2, -34); g.lineTo(12, 0); g.stroke();
        g.lineWidth = 2; g.beginPath(); g.moveTo(-20, 0); g.lineTo(20, 0); g.stroke();
        const a = attacking ? Math.min(Math.PI * 0.95, since * 6) : 0.15;
        g.save(); g.translate(-2, -34); g.rotate(-1.1 + a); g.fillStyle = '#5a3a1e'; g.fillRect(-1.5, -10, 3, 40); g.fillStyle = '#555'; g.fillRect(-5, -16, 10, 8); g.restore();
        g.fillStyle = pc.c; g.fillRect(-18, -6, 6, 4);
      }
      break;
    }
    case 'cobra': {
      const bob = u.anim === 'walk' ? Math.sin(t * 30) * 0.5 : 0;
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(0, 2, 18, 6, 0, 0, 6.3); g.fill();
      for (const x of [-10, 10]) { g.fillStyle = '#111'; g.beginPath(); g.ellipse(x, -1, 4.5, 4.5, 0, 0, 6.3); g.fill(); g.fillStyle = '#aaa'; g.beginPath(); g.arc(x, -1, 2, 0, 6.3); g.fill(); }
      g.fillStyle = pc.c; g.beginPath(); g.moveTo(-18, -3 + bob); g.lineTo(-16, -10 + bob); g.lineTo(-6, -12 + bob); g.lineTo(0, -18 + bob); g.lineTo(9, -18 + bob); g.lineTo(14, -11 + bob); g.lineTo(19, -9 + bob); g.lineTo(19, -3 + bob); g.closePath(); g.fill();
      g.strokeStyle = '#111'; g.lineWidth = 0.8; g.stroke();
      g.fillStyle = '#9ad0ff'; g.beginPath(); g.moveTo(1, -17 + bob); g.lineTo(8, -17 + bob); g.lineTo(12, -11.5 + bob); g.lineTo(-2, -11.5 + bob); g.fill();
      g.fillStyle = '#fff'; g.fillRect(-18, -8 + bob, 37, 1.5);
      g.fillStyle = '#333'; g.fillRect(12, -14 + bob, 10, 2);
      if (attacking && since < 0.1) { g.fillStyle = '#ffe070'; g.beginPath(); g.arc(23, -13 + bob, 3, 0, 6.3); g.fill(); }
      break;
    }
    case 'sheep': case 'deer': case 'boar': case 'wolf': {
      drawAnimalBody(g, d.draw, t, anim, 1, u);
      if (u.type === 'sheep' && u.owner) { g.fillStyle = pc.c; g.fillRect(4, -9, 3, 3); g.strokeStyle = pc.c; g.lineWidth = 1.5; g.beginPath(); g.arc(7, -9, 2.5, 0.5, 2.6); g.stroke(); }
      break;
    }
    default: {
      if (d.naval) drawShip(g, u, t, pc, attacking, since);
    }
  }
}
function drawHorse(g, u, t, anim, col, pc, camel, armor, scale = 1, dx = 0) {
  g.save(); g.translate(dx, 0); g.scale(scale, scale);
  const run = anim === 'walk';
  const ph = t * (run ? 13 : 0);
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(0, 1, 15, 5, 0, 0, 6.3); g.fill();
  const bodyY = camel ? -18 : -13, bob = run ? Math.sin(ph * 2) * 1 : 0;
  const legC = shade(col.startsWith('#') ? col : '#888', 0.75);
  const legs = [[-8, 0], [-5, 1.6], [7, 0.8], [9, 2.4]];
  for (const [lx, off] of legs) {
    const a = run ? Math.sin(ph + off * 2) * 0.6 : 0;
    limb(g, lx, bodyY + 3 + bob, camel ? 16 : 12, a, 2.4, legC);
  }
  // tail
  g.strokeStyle = shade(col, 0.5); g.lineWidth = 2; g.beginPath(); g.moveTo(-12, bodyY - 1 + bob); g.quadraticCurveTo(-16, bodyY + 3 + Math.sin(t * 6) * 2, -15, bodyY + 9); g.stroke();
  // body
  g.fillStyle = col; g.beginPath(); g.ellipse(0, bodyY + bob, 12.5, 5.5, 0, 0, 6.3); g.fill(); g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 0.6; g.stroke();
  if (camel) { g.beginPath(); g.ellipse(-1, bodyY - 5 + bob, 5, 4, 0, Math.PI, 0); g.fill(); }
  // neck & head
  g.fillStyle = col; g.beginPath(); g.moveTo(8, bodyY - 2 + bob); g.lineTo(camel ? 15 : 13, bodyY - (camel ? 14 : 11) + bob); g.lineTo(camel ? 18 : 16, bodyY - (camel ? 12 : 9) + bob); g.lineTo(12, bodyY + 2 + bob); g.fill();
  g.beginPath(); g.ellipse(camel ? 18 : 16.5, bodyY - (camel ? 13 : 10) + bob, 4, 2.2, 0.5, 0, 6.3); g.fill();
  if (!camel) { g.fillStyle = shade(col, 0.4); g.beginPath(); g.moveTo(10, bodyY - 5 + bob); g.lineTo(13, bodyY - 12 + bob); g.lineTo(11.5, bodyY - 4 + bob); g.fill(); }
  g.fillStyle = '#111'; g.fillRect((camel ? 18 : 16.5), bodyY - (camel ? 14 : 11) + bob, 1, 1);
  if (armor === 'caparison') { g.fillStyle = pc.c; g.beginPath(); g.moveTo(-12, bodyY - 3 + bob); g.lineTo(10, bodyY - 4 + bob); g.lineTo(11, bodyY + 6 + bob); g.lineTo(-12, bodyY + 6 + bob); g.closePath(); g.fill(); g.fillStyle = '#f0e8c0'; g.fillRect(-12, bodyY + 4.5 + bob, 23, 1.5); }
  if (armor === 'barding') { g.fillStyle = '#9aa0a8'; g.beginPath(); g.ellipse(0, bodyY + bob, 12, 5, 0, 0, 6.3); g.fill(); g.fillStyle = pc.c; g.fillRect(-10, bodyY + 2 + bob, 20, 1.6); }
  // saddle
  g.fillStyle = armor ? pc.d : '#5a3a1a'; g.fillRect(-2, bodyY - 6 + bob, 7, 3);
  g.restore();
  g.translate(0, bob);
}
function drawAnimalBody(g, kind, t, anim, s = 1, u) {
  g.save(); g.scale(s, s);
  const dead = anim === 'dead' || anim === 'die';
  if (dead) { g.rotate(0); g.scale(1, 0.55); g.translate(0, 4); }
  const run = anim === 'walk', ph = t * (kind === 'sheep' ? 9 : 12);
  g.fillStyle = 'rgba(0,0,0,0.2)'; if (!dead) { g.beginPath(); g.ellipse(0, 1, kind === 'sheep' ? 8 : 10, 3, 0, 0, 6.3); g.fill(); }
  if (kind === 'sheep') {
    for (const [x, o] of [[-4, 0], [-2, 1], [3, 0.5], [5, 1.5]]) limb(g, x, -5, 5, run ? Math.sin(ph + o * 2) * 0.5 : 0, 1.6, '#2a2a2a');
    g.fillStyle = '#f4f2ea'; for (const [x, y, r] of [[-4, -8, 4], [0, -9.5, 4.5], [4, -8, 4], [-2, -6, 4], [2, -6, 4]]) { g.beginPath(); g.arc(x, y, r, 0, 6.3); g.fill(); }
    g.strokeStyle = 'rgba(0,0,0,0.15)'; g.lineWidth = 0.6; g.beginPath(); g.arc(0, -8, 7, 0, 6.3); g.stroke();
    const hb = anim === 'idle' ? Math.max(0, Math.sin(t * 0.7 + (u ? u.id : 0))) * 3 : 0; // grazing
    g.fillStyle = '#2a2622'; g.beginPath(); g.ellipse(8, -9 + hb, 2.6, 2, 0.3, 0, 6.3); g.fill(); g.fillRect(6.5, -11 + hb, 1.2, 1.5);
  } else if (kind === 'deer') {
    for (const [x, o] of [[-5, 0], [-3, 1], [4, 0.5], [6, 1.5]]) limb(g, x, -9, 9, run ? Math.sin(ph + o * 2) * 0.7 : 0, 1.4, '#6a4424');
    g.fillStyle = '#9a6a3a'; g.beginPath(); g.ellipse(0, -11, 8, 3.8, 0, 0, 6.3); g.fill();
    g.fillStyle = '#f0e8d8'; g.beginPath(); g.arc(-8, -12, 1.8, 0, 6.3); g.fill();
    g.fillStyle = '#9a6a3a'; g.beginPath(); g.moveTo(5, -13); g.lineTo(9, -20); g.lineTo(11, -19); g.lineTo(8, -11); g.fill(); g.beginPath(); g.ellipse(10.5, -20, 3, 1.8, 0.4, 0, 6.3); g.fill();
    if (!u || u.id % 2) { g.strokeStyle = '#d8c8a8'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(9, -22); g.lineTo(7, -27); g.moveTo(8, -25); g.lineTo(5, -26); g.moveTo(10, -22); g.lineTo(12, -27); g.stroke(); }
  } else if (kind === 'boar') {
    for (const [x, o] of [[-5, 0], [-3, 1], [3, 0.5], [5, 1.5]]) limb(g, x, -5, 5, run ? Math.sin(ph + o * 2) * 0.6 : 0, 2, '#2a2018');
    g.fillStyle = '#4a3a2e'; g.beginPath(); g.ellipse(0, -8, 9, 5, 0, 0, 6.3); g.fill();
    g.strokeStyle = '#2a1e16'; g.lineWidth = 0.8; for (let k = -6; k < 6; k += 2) { g.beginPath(); g.moveTo(k, -12.5); g.lineTo(k + 1, -14.5); g.stroke(); }
    g.fillStyle = '#3a2c22'; g.beginPath(); g.moveTo(6, -11); g.lineTo(13, -8); g.lineTo(12, -5); g.lineTo(6, -5); g.fill();
    g.strokeStyle = '#f0ead8'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(11, -6); g.quadraticCurveTo(13, -8, 12, -10); g.stroke();
  } else if (kind === 'wolf') {
    for (const [x, o] of [[-5, 0], [-3, 1], [4, 0.5], [6, 1.5]]) limb(g, x, -7, 7, run ? Math.sin(ph + o * 2) * 0.7 : 0, 1.6, '#5a5a5a');
    g.fillStyle = '#7a7a78'; g.beginPath(); g.ellipse(0, -9, 8.5, 3.6, 0, 0, 6.3); g.fill();
    g.strokeStyle = '#6a6a68'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(-8, -9); g.quadraticCurveTo(-13, -8, -14, -4); g.stroke();
    g.fillStyle = '#7a7a78'; g.beginPath(); g.moveTo(6, -11); g.lineTo(13, -10); g.lineTo(14, -8); g.lineTo(7, -6); g.fill();
    g.beginPath(); g.moveTo(7, -11); g.lineTo(8, -15); g.lineTo(10, -11); g.fill();
    g.fillStyle = '#ff4'; g.fillRect(10.5, -10, 1, 1);
  }
  g.restore();
}
function drawShip(g, u, t, pc, attacking, since) {
  const type = u.type;
  const bob = Math.sin(t * 2 + u.id) * 1.2, roll = Math.sin(t * 1.5 + u.id) * 0.03;
  g.rotate(roll); g.translate(0, bob);
  const L = { fishingship: 16, transport: 24, tradecog: 22, galley: 28, wargalley: 30, galleon: 32, fireship: 26, demoship: 18 }[type] || 22;
  // wake
  if (u.anim === 'walk') { g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-L, 2); g.quadraticCurveTo(-L - 10, 6, -L - 22, 4 + Math.sin(t * 5) * 2); g.stroke(); g.beginPath(); g.moveTo(-L, -1); g.quadraticCurveTo(-L - 10, -4, -L - 20, -3); g.stroke(); }
  g.fillStyle = 'rgba(0,20,40,0.3)'; g.beginPath(); g.ellipse(0, 2, L + 2, 6, 0, 0, 6.3); g.fill();
  // hull
  const hullC = type === 'demoship' ? '#5a4030' : '#7a5230';
  g.fillStyle = shade(hullC, 0.8); g.beginPath(); g.moveTo(-L, -8); g.quadraticCurveTo(-L + 2, 2, -L * 0.5, 3); g.lineTo(L * 0.6, 3); g.quadraticCurveTo(L + 2, 0, L + 4, -10); g.lineTo(-L, -8); g.fill();
  g.fillStyle = hullC; g.beginPath(); g.moveTo(-L, -8); g.lineTo(L + 4, -10); g.lineTo(L, -6); g.lineTo(-L + 1, -5); g.fill();
  g.fillStyle = pc.c; g.beginPath(); g.moveTo(-L + 1, -4); g.lineTo(L + 1, -5.5); g.lineTo(L, -3.5); g.lineTo(-L + 2, -2); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(-L, -8); g.quadraticCurveTo(-L + 2, 2, -L * 0.5, 3); g.lineTo(L * 0.6, 3); g.quadraticCurveTo(L + 2, 0, L + 4, -10); g.stroke();
  const mast = (x, h, w, col) => {
    g.strokeStyle = '#4a3018'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, -8); g.lineTo(x, -8 - h); g.stroke();
    const billow = u.anim === 'walk' ? 3 : 1;
    g.fillStyle = col; g.beginPath(); g.moveTo(x - w / 2, -8 - h + 3); g.quadraticCurveTo(x + billow, -8 - h * 0.55, x - w / 2, -12); g.lineTo(x + w / 2, -12); g.quadraticCurveTo(x + w / 2 + billow, -8 - h * 0.55, x + w / 2, -8 - h + 3); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 0.6; g.stroke();
  };
  if (type === 'fishingship') {
    mast(0, 20, 12, '#f0e8d8');
    g.fillStyle = pc.c; g.fillRect(-3, -24, 6, 4);
    // net
    g.strokeStyle = 'rgba(220,220,200,0.6)'; g.lineWidth = 0.5; const nx = u.anim === 'work' ? L + 4 : 0;
    if (u.anim === 'work') { for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(L - 2, -8); g.quadraticCurveTo(L + 6, -2 + Math.sin(t * 3) * 2, L + 10 + k, 2); g.stroke(); } }
    const fis = { t, anim: 'idle', tunic: pc.c, legs: '#554', skin: '#d8a878', head: HELM.straw(), armFront: u.anim === 'work' ? -1.2 + Math.sin(t * 2) * 0.4 : 0 };
    g.save(); g.translate(-8, -6); g.scale(0.7, 0.7); drawHuman(g, fis); g.restore();
  } else if (type === 'transport') {
    mast(0, 26, 20, '#e8dcc0');
    g.fillStyle = pc.c; g.beginPath(); g.arc(0, -22, 3, 0, 6.3); g.fill();
    for (let k = 0; k < Math.min(6, u.cargo.length); k++) { g.fillStyle = pc.l; g.beginPath(); g.arc(-14 + k * 5, -11, 2, 0, 6.3); g.fill(); }
    box(g, -0.3, 0, 0.1, 0.1, 8, 4, '#8a6a40');
  } else if (type === 'tradecog') {
    mast(0, 30, 20, '#f4ecd8');
    g.strokeStyle = pc.c; g.lineWidth = 2.5; g.beginPath(); g.moveTo(0, -35); g.lineTo(0, -18); g.moveTo(-6, -28); g.lineTo(6, -28); g.stroke();
    g.fillStyle = u.tradeGold ? '#e8c040' : '#b89868'; g.fillRect(-14, -13, 6, 5); g.fillRect(8, -13, 6, 5);
  } else if (type === 'galley' || type === 'wargalley' || type === 'galleon' || type === 'fireship') {
    const masts = type === 'galleon' ? [-8, 8] : [0];
    for (const m of masts) mast(m, type === 'galleon' ? 34 : 28, type === 'galleon' ? 16 : 18, type === 'fireship' ? '#3a2a22' : '#f0e8d8');
    for (const m of masts) { g.fillStyle = pc.c; g.fillRect(m - 5, -8 - (type === 'galleon' ? 22 : 18), 10, 5); }
    g.fillStyle = pc.c; g.beginPath(); g.moveTo(masts[0], -8 - (type === 'galleon' ? 34 : 28)); g.lineTo(masts[0] + 8, -8 - (type === 'galleon' ? 32 : 26)); g.lineTo(masts[0], -8 - (type === 'galleon' ? 30 : 24)); g.fill();
    if (type !== 'galleon') { // oars
      const row = Math.sin(t * (u.anim === 'walk' ? 6 : 1.5));
      g.strokeStyle = '#6a4a2a'; g.lineWidth = 1;
      for (let k = -3; k <= 3; k++) { const x = k * (L / 4.5); g.beginPath(); g.moveTo(x, -3); g.lineTo(x - 5 + row * 4, 7); g.stroke(); }
    }
    if (type === 'fireship') { g.fillStyle = '#444'; g.fillRect(L - 4, -14, 10, 3); if (attacking && since < 0.4) { drawFlame(g, L + 10, -10, 0.8, t); } }
    box(g, -0.35, 0, 0.12, 0.12, 8, 5, '#6a4a2a');
  } else if (type === 'demoship') {
    for (let k = 0; k < 4; k++) { g.fillStyle = '#6a4424'; g.beginPath(); g.ellipse(-9 + k * 6, -11, 2.8, 3.5, 0, 0, 6.3); g.fill(); g.strokeStyle = '#333'; g.lineWidth = 0.6; g.stroke(); }
    g.fillStyle = pc.c; g.fillRect(-2, -22, 6, 4); g.strokeStyle = '#4a3018'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-2, -12); g.lineTo(-2, -22); g.stroke();
    if (Math.sin(t * 20) > 0) { g.fillStyle = '#ff8'; g.beginPath(); g.arc(9, -15, 1.2, 0, 6.3); g.fill(); }
  }
  // cargo passenger count indicator for transport handled in UI
}
function drawUnit(ctx, u, sel) {
  const d = UNITS[u.type];
  const hh = d.naval ? -0.35 : W.map.h(u.x, u.y);
  const p = iso(u.x, u.y, hh);
  const t = u.animT;
  ctx.save(); ctx.translate(p.x, p.y);
  if (u.dying) {
    const f = Math.min(1, u.dieT / 0.6);
    ctx.globalAlpha = u.dieT > 9 ? Math.max(0, 1 - (u.dieT - 9) / 3) : 1;
    ctx.scale(u.face * US, US);
    ctx.rotate(-f * 1.45); ctx.translate(-f * 3, 0);
    drawUnitFigure(ctx, Object.assign({}, u, { anim: 'idle', work: null, carry: null }), 0);
    ctx.restore();
    return;
  }
  if (sel) { ctx.strokeStyle = sel; ctx.lineWidth = 1.6; const r = UNIT_R(u) * 34 * US; ctx.beginPath(); ctx.ellipse(0, 0, r + 3, (r + 3) * 0.5, 0, 0, 6.3); ctx.stroke(); }
  ctx.scale((u.face || 1) * US, US);
  drawUnitFigure(ctx, u, t);
  ctx.restore();
}
const US = 1.3;
function unitHeight(u) { const d = UNITS[u.type]; if (d.naval) return 40 * US; if (d.tags.includes('mounted')) return 36 * US; if (d.animal) return 16 * US; if (d.tags.includes('siege')) return 34 * US; return 28 * US; }

// ---------- fx & projectiles ----------
function drawProjectile(ctx, p) {
  const f = Math.min(1, p.t / p.dur);
  const h0 = W.map.h(p.sx, p.sy), h1 = W.map.h(p.tx, p.ty);
  const z = (h0 + (h1 - h0) * f) * EH + p.sz * EH * (1 - f) + Math.sin(f * Math.PI) * p.dist * p.arc * 20 + 10 * (1 - f);
  const a = iso(p.x, p.y, 0); const y = a.y - z;
  const ang = Math.atan2((p.ty - p.sy) * 16 + (p.tx - p.sx) * 16 - Math.cos(f * Math.PI) * p.dist * p.arc * 20 * 3, (p.tx - p.sx - (p.ty - p.sy)) * 32);
  ctx.save(); ctx.translate(a.x, y);
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(0, z - W.map.h(p.x, p.y) * EH * 0, 2.5, 1, 0, 0, 6.3); ctx.fill();
  ctx.rotate(ang);
  if (p.type === 'arrow' || p.type === 'bolt') { ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = p.type === 'bolt' ? 2 : 1.2; ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(5, 0); ctx.stroke(); ctx.fillStyle = '#ccc'; ctx.beginPath(); ctx.moveTo(5, -1.5); ctx.lineTo(8, 0); ctx.lineTo(5, 1.5); ctx.fill(); ctx.fillStyle = '#eee'; ctx.fillRect(-7, -1.5, 2.5, 3); }
  else if (p.type === 'javelin' || p.type === 'jav') { ctx.strokeStyle = '#7a5434'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(7, 0); ctx.stroke(); ctx.fillStyle = '#bbb'; ctx.beginPath(); ctx.moveTo(7, -1.4); ctx.lineTo(10, 0); ctx.lineTo(7, 1.4); ctx.fill(); }
  else if (p.type === 'axe') { ctx.rotate(p.t * 20); ITEMS.throwaxe(ctx); }
  else if (p.type === 'stone' || p.type === 'boulder') { ctx.fillStyle = '#6a625a'; ctx.beginPath(); ctx.arc(0, 0, p.type === 'boulder' ? 5 : 3.5, 0, 6.3); ctx.fill(); ctx.fillStyle = '#8a827a'; ctx.beginPath(); ctx.arc(-1, -1, 1.5, 0, 6.3); ctx.fill(); }
  else if (p.type === 'bullet') { ctx.fillStyle = '#ffe070'; ctx.fillRect(-4, -0.8, 8, 1.6); }
  else if (p.type === 'fire') { ctx.fillStyle = 'rgba(255,140,30,0.9)'; ctx.beginPath(); ctx.arc(0, 0, 3 + Math.random() * 2, 0, 6.3); ctx.fill(); ctx.fillStyle = 'rgba(255,240,120,0.9)'; ctx.beginPath(); ctx.arc(0, 0, 1.5, 0, 6.3); ctx.fill(); }
  ctx.restore();
}
function drawFx(ctx, f) {
  const a = iso(f.x, f.y, W.map.h(f.x, f.y));
  const x = a.x, y = a.y - f.z * EH;
  const k = f.life / f.max;
  switch (f.type) {
    case 'chips': ctx.fillStyle = '#c8a070'; ctx.fillRect(x, y - 10, 2, 1.5); break;
    case 'leaves': ctx.fillStyle = '#4a8a2a'; ctx.fillRect(x, y - 8, 2, 2); break;
    case 'goldspark': ctx.fillStyle = `rgba(255,230,90,${1 - k})`; ctx.fillRect(x, y - 8, 2, 2); break;
    case 'stonespark': ctx.fillStyle = `rgba(230,230,230,${1 - k})`; ctx.fillRect(x, y - 8, 1.6, 1.6); break;
    case 'dirt': ctx.fillStyle = 'rgba(110,80,40,0.8)'; ctx.fillRect(x, y - 3, 2, 2); break;
    case 'blood': ctx.fillStyle = `rgba(150,20,20,${1 - k})`; ctx.fillRect(x, y - 8, 1.8, 1.8); break;
    case 'dust': ctx.fillStyle = `rgba(170,150,120,${0.5 * (1 - k)})`; ctx.beginPath(); ctx.arc(x, y - 4, 3 + k * 6, 0, 6.3); ctx.fill(); break;
    case 'smoke': ctx.fillStyle = `rgba(70,70,70,${0.45 * (1 - k)})`; ctx.beginPath(); ctx.arc(x, y - 20, 4 + k * 10, 0, 6.3); ctx.fill(); break;
    case 'fire': drawFlame(ctx, x, y, 0.5 * (1 - k) + 0.2, R.time + f.r * 5); break;
    case 'explosion': ctx.fillStyle = `rgba(255,${160 - k * 120},40,${1 - k})`; ctx.beginPath(); ctx.arc(x, y - 6, 4 + k * 16, 0, 6.3); ctx.fill(); ctx.fillStyle = `rgba(60,60,60,${0.6 * (1 - k)})`; ctx.beginPath(); ctx.arc(x + 4, y - 14 - k * 10, 3 + k * 10, 0, 6.3); ctx.fill(); break;
    case 'impact': ctx.fillStyle = `rgba(120,100,80,${0.6 * (1 - k)})`; ctx.beginPath(); ctx.arc(x, y - 3, 3 + k * 12, 0, 6.3); ctx.fill(); break;
    case 'collapse': ctx.fillStyle = `rgba(140,120,100,${0.7 * (1 - k)})`; ctx.beginPath(); ctx.arc(x, y - 6, 6 + k * 18, 0, 6.3); ctx.fill(); ctx.fillStyle = '#6a5a4a'; ctx.fillRect(x - 2, y - 2, 3, 3); break;
    case 'splash': ctx.fillStyle = `rgba(220,240,255,${0.8 * (1 - k)})`; ctx.beginPath(); ctx.arc(x, y + 4, 2 + k * 3, 0, 6.3); ctx.fill(); break;
    case 'heal': ctx.fillStyle = `rgba(120,255,140,${1 - k})`; ctx.fillRect(x - 1, y - 20 - 2, 2, 6); ctx.fillRect(x - 3, y - 20, 6, 2); break;
    case 'repair': ctx.fillStyle = `rgba(255,220,120,${1 - k})`; ctx.fillRect(x - 1, y - 24 - 2, 2, 6); ctx.fillRect(x - 3, y - 24, 6, 2); break;
    case 'convert': ctx.strokeStyle = `rgba(255,240,160,${1 - k})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y - 16, 4 + k * 10, 0, 6.3); ctx.stroke(); break;
    case 'coins': ctx.fillStyle = `rgba(255,215,70,${1 - k})`; ctx.beginPath(); ctx.arc(x, y - 16, 2, 0, 6.3); ctx.fill(); break;
  }
}
function drawDecal(ctx, d) {
  if (d.type === 'rubble') {
    const s = d.s; const c = iso(d.x + s / 2, d.y + s / 2, W.map.h(d.x + s / 2, d.y + s / 2));
    const rng = mulberry32(d.x * 31 + d.y);
    ctx.globalAlpha = Math.max(0, 1 - (W.t - d.t) / d.dur);
    for (let k = 0; k < s * 8; k++) { ctx.fillStyle = rng() < 0.5 ? '#6a5e50' : '#4a3a2a'; ctx.beginPath(); ctx.ellipse(c.x + (rng() - 0.5) * s * 50, c.y + (rng() - 0.5) * s * 22, 3 + rng() * 4, 2 + rng() * 2, 0, 0, 6.3); ctx.fill(); }
    ctx.globalAlpha = 1;
  } else if (d.type === 'stump') {
    const c = iso(d.x + 0.5, d.y + 0.5, W.map.h(d.x + 0.5, d.y + 0.5));
    ctx.fillStyle = '#5a3a1e'; ctx.beginPath(); ctx.ellipse(c.x, c.y, 4, 2.5, 0, 0, 6.3); ctx.fill(); ctx.fillStyle = '#c8a070'; ctx.beginPath(); ctx.ellipse(c.x, c.y - 1, 3, 1.6, 0, 0, 6.3); ctx.fill();
  } else if (d.type === 'wreck') {
    const k = (W.t - d.t) / d.dur; const c = iso(d.x, d.y, -0.35);
    ctx.save(); ctx.translate(c.x, c.y + k * 12); ctx.rotate(k * 0.6 * (d.face || 1)); ctx.globalAlpha = 1 - k;
    ctx.beginPath(); ctx.rect(-40, -60, 80, 60 - k * 0); ctx.clip();
    drawShip(ctx, { type: d.ship, id: 1, anim: 'idle', cargo: [], owner: d.owner }, 0, pcolor(d.owner), false, 9);
    ctx.restore();
    if (Math.random() < 0.3) emitFx('splash', d.x + (Math.random() - 0.5), d.y + (Math.random() - 0.5), 1);
  }
}

// ---------- main scene ----------
function entDepth(e) {
  if (e.kind === 'bld') { const s = bsize(e); if (BUILDINGS[e.type].farm) return e.x + e.y - 10; return e.x + e.y + s - 0.6; }
  if (e.kind === 'res' || e.kind === 'relic') return e.x + e.y + 1;
  return e.x + e.y;
}
function renderWorld(ctx, opts = {}) {
  const map = W.map;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0b0d10'; ctx.fillRect(0, 0, R.cw, R.ch);
  camTransform(ctx);
  drawTerrain(ctx);
  const z = R.cam.zoom;
  const vx0 = R.cam.x - R.cw / 2 / z - 120, vx1 = R.cam.x + R.cw / 2 / z + 120, vy0 = R.cam.y - R.ch / 2 / z - 60, vy1 = R.cam.y + R.ch / 2 / z + 200;
  const human = W.players[W.humanId];
  const fogOn = !opts.editor;
  const inView = (x, y) => { const p = iso(x, y, 0); return p.x > vx0 && p.x < vx1 && p.y > vy0 && p.y < vy1; };
  // decals
  for (const d of W.decals) if (inView(d.x, d.y) && (!fogOn || isExploredForHuman(d.x, d.y))) drawDecal(ctx, d);
  // collect
  const vis = [];
  for (const e of W.list) {
    if (e.kind === 'unit' && e.inside) continue;
    if (e.kind === 'relic' && (e.carrier || e.inBld)) continue;
    const c = center(e);
    if (!inView(c.x, c.y)) continue;
    if (fogOn) {
      if (e.kind === 'unit') { if (e.owner !== W.humanId && !isVisibleToHuman(e)) continue; }
      else if (!isExploredForHuman(c.x, c.y)) continue;
      else if (e.kind === 'bld' && e.owner !== W.humanId && !isVisibleToHuman(e) && !e.seenBy) continue;
    }
    if (e.kind === 'bld' && isVisibleToHuman(e)) e.seenBy = true;
    vis.push(e);
  }
  // farms first (flat)
  vis.sort((a, b) => entDepth(a) - entDepth(b));
  const selSet = opts.selection || new Set();
  for (const e of vis) {
    if (e.kind === 'bld') {
      drawBuilding(ctx, e);
      if (selSet.has(e)) { const s = bsize(e), c = iso(e.x, e.y, map.h(e.x + s / 2, e.y + s / 2)); ctx.save(); ctx.translate(iso(e.x + s / 2, e.y + s / 2, map.h(e.x + s / 2, e.y + s / 2)).x, iso(e.x + s / 2, e.y + s / 2, map.h(e.x + s / 2, e.y + s / 2)).y); poly(ctx, [P(-s / 2, -s / 2, 0), P(s / 2, -s / 2, 0), P(s / 2, s / 2, 0), P(-s / 2, s / 2, 0)], null, '#fff', 1.5); ctx.restore(); }
    } else if (e.kind === 'unit') drawUnit(ctx, e, selSet.has(e) ? (e.owner === W.humanId ? '#fff' : pcolor(e.owner).l) : null);
    else if (e.kind === 'res') { drawRes(ctx, e); if (selSet.has(e)) { const c = iso(e.x + 0.5, e.y + 0.5, map.h(e.x + 0.5, e.y + 0.5)); ctx.strokeStyle = '#ffe'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(c.x, c.y, 18, 9, 0, 0, 6.3); ctx.stroke(); } }
    else if (e.kind === 'relic') { const c = iso(e.x + 0.5, e.y + 0.5, map.h(e.x + 0.5, e.y + 0.5)); drawRelic(ctx, e, c.x, c.y); }
  }
  for (const p of W.projs) if (inView(p.x, p.y) && (!fogOn || human.visible[map.idx(Math.max(0, Math.min(W.n - 1, p.x | 0)), Math.max(0, Math.min(W.n - 1, p.y | 0)))])) drawProjectile(ctx, p);
  for (const f of W.fx) if (inView(f.x, f.y) && (!fogOn || human.visible[map.idx(Math.max(0, Math.min(W.n - 1, f.x | 0)), Math.max(0, Math.min(W.n - 1, f.y | 0)))])) drawFx(ctx, f);
  // fog
  if (fogOn) drawFog(ctx);
  // health bars & overlays for selection
  for (const e of vis) {
    if (e.kind === 'res' || e.kind === 'relic') continue;
    const sel = selSet.has(e);
    const hurt = e.hp < e.maxhp && (W.t - (e.hitT || -99) < 4);
    if (!sel && !hurt && !(opts.hover === e)) continue;
    if (e.kind === 'unit' && e.dying) continue;
    const c = center(e);
    let top;
    if (e.kind === 'unit') { const p = iso(c.x, c.y, UNITS[e.type].naval ? -0.35 : map.h(c.x, c.y)); top = { x: p.x, y: p.y - unitHeight(e) - 8 }; }
    else { const p = iso(c.x, c.y, map.h(c.x, c.y)); top = { x: p.x, y: p.y - (BLD_H[e.type] || 50) * 0.8 - 10 }; }
    const w = e.kind === 'bld' ? 50 : 26;
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(top.x - w / 2 - 1, top.y - 1, w + 2, 5);
    const f = Math.max(0, e.hp / e.maxhp);
    ctx.fillStyle = e.owner === W.humanId ? (f > 0.5 ? '#3ad04a' : f > 0.25 ? '#e8c020' : '#e03020') : pcolor(e.owner).c;
    ctx.fillRect(top.x - w / 2, top.y, w * f, 3);
    if (e.kind === 'bld' && !e.built) { ctx.fillStyle = '#6af'; ctx.fillRect(top.x - w / 2, top.y + 4, w * e.progress, 2); }
    if (e.kind === 'unit' && e.type === 'sheep' && e.contest > 0) { ctx.fillStyle = pcolor(e.contestBy).c; ctx.fillRect(top.x - w / 2, top.y - 4, w * e.contest / 1.5, 2); }
    if (e.kind === 'unit' && e.convT > 0) { ctx.fillStyle = '#fe8'; ctx.fillRect(top.x - w / 2, top.y + 4, w * Math.min(1, e.convT / 10), 2); }
    if (e.kind === 'unit' && e.cargo && e.cargo.length) { ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.fillText(e.cargo.length + '', top.x + w / 2 + 3, top.y + 4); }
    if (e.kind === 'bld' && e.garrison && e.garrison.length) { ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.fillText('⚑' + e.garrison.length, top.x + w / 2 + 3, top.y + 5); }
    if (e.kind === 'bld' && e.relics && e.relics.length) { ctx.fillStyle = '#ffd76a'; ctx.font = 'bold 11px sans-serif'; ctx.fillText('✝' + e.relics.length, top.x - w / 2 - 22, top.y + 5); }
  }
}
function drawFog(ctx) {
  const n = W.n, human = W.players[W.humanId];
  if (!R.fogCv || R.fogCv.width !== n) { R.fogCv = document.createElement('canvas'); R.fogCv.width = n; R.fogCv.height = n; R.fogImg = R.fogCv.getContext('2d').createImageData(n, n); }
  if (!R.fogT || performance.now() - R.fogT > 150) {
    R.fogT = performance.now();
    const d = R.fogImg.data;
    for (let i = 0; i < n * n; i++) { d[i * 4 + 3] = human.visible[i] ? 0 : human.explored[i] ? 115 : 255; }
    R.fogCv.getContext('2d').putImageData(R.fogImg, 0, 0);
  }
  ctx.save();
  const z = R.cam.zoom;
  ctx.setTransform(z * TW / 2, z * TH / 2, -z * TW / 2, z * TH / 2, R.cw / 2 - R.cam.x * z, R.ch / 2 - R.cam.y * z - 0.6 * EH * z);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(R.fogCv, 0, 0);
  ctx.restore();
  camTransform(ctx);
}

// ---------- minimap ----------
const MM = { cv: null, base: null, baseVer: -1, t: 0 };
function renderMinimap(cv, editor) {
  const g = cv.getContext('2d'), n = W.n, S = cv.width;
  const human = W.players[W.humanId];
  if (!MM.base || MM.base.width !== n || MM.baseVer !== W.map.version || MM.ref !== W.map) {
    MM.ref = W.map;
    MM.base = document.createElement('canvas'); MM.base.width = n; MM.base.height = n; MM.baseVer = W.map.version;
    const bg = MM.base.getContext('2d'), img = bg.createImageData(n, n);
    for (let i = 0; i < n * n; i++) {
      const c = TER_COL[W.map.ter[i]]; const v = parseInt(c.slice(1), 16); const e = 1 + W.map.elev[i] * 0.06;
      img.data[i * 4] = Math.min(255, ((v >> 16) & 255) * e); img.data[i * 4 + 1] = Math.min(255, ((v >> 8) & 255) * e); img.data[i * 4 + 2] = Math.min(255, (v & 255) * e); img.data[i * 4 + 3] = 255;
    }
    bg.putImageData(img, 0, 0);
  }
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, S, S);
  const k = S / (n * 2);
  // diamond transform: tile (x,y) -> ((x-y)*k + S/2, (x+y)*k/2 + S/4)
  g.setTransform(k, k / 2, -k, k / 2, S / 2, S / 4);
  g.drawImage(MM.base, 0, 0);
  // entities
  for (const e of W.list) {
    if (e.kind === 'unit' && e.inside) continue;
    const c = center(e);
    if (!editor && W.settings.fog !== 'none' && !W.noFog) {
      if (e.kind === 'unit' && e.owner !== W.humanId && !isVisibleToHuman(e)) continue;
      if (!isExploredForHuman(c.x, c.y)) continue;
      if (e.kind === 'bld' && e.owner !== W.humanId && !e.seenBy) continue;
    }
    let col = null, s = 1;
    if (e.kind === 'res') { col = { tree: '#1f4a1a', gold: '#f0d040', stone: '#b0b0b0', berry: '#d05070', fish: '#80c0ff', carcass: '#d05070' }[e.type]; if (e.type === 'shrub') continue; }
    else if (e.kind === 'relic') { col = '#fff'; s = 1.5; }
    else if (e.kind === 'unit' && e.owner === 0) { col = UNITS[e.type].predator ? '#aa4444' : '#e0d8c0'; }
    else { col = pcolor(e.owner).c; s = e.kind === 'bld' ? bsize(e) : 1.4; }
    g.fillStyle = col;
    if (e.kind === 'bld') g.fillRect(e.x, e.y, s, s); else g.fillRect(c.x - s / 2, c.y - s / 2, s, s);
  }
  // fog
  if (!editor && W.settings.fog !== 'none' && !W.noFog) {
    if (!MM.fog || MM.fog.width !== n) { MM.fog = document.createElement('canvas'); MM.fog.width = n; MM.fog.height = n; MM.fogImg = MM.fog.getContext('2d').createImageData(n, n); }
    const d = MM.fogImg.data;
    for (let i = 0; i < n * n; i++) d[i * 4 + 3] = human.visible[i] ? 0 : human.explored[i] ? 110 : 255;
    MM.fog.getContext('2d').putImageData(MM.fogImg, 0, 0);
    g.drawImage(MM.fog, 0, 0);
  }
  // alerts
  for (const a of W.alerts) if (W.t - a.t < 4) { g.strokeStyle = `rgba(255,60,60,${1 - (W.t - a.t) / 4})`; g.lineWidth = 1; g.beginPath(); g.arc(a.x, a.y, 2 + (W.t - a.t) * 3, 0, 6.3); g.stroke(); }
  // view rect
  const corners = [screenToTile(0, 0), screenToTile(R.cw, 0), screenToTile(R.cw, R.ch), screenToTile(0, R.ch)];
  g.strokeStyle = '#fff'; g.lineWidth = 0.8; g.beginPath(); corners.forEach((c, i) => i ? g.lineTo(c.x, c.y) : g.moveTo(c.x, c.y)); g.closePath(); g.stroke();
  g.setTransform(1, 0, 0, 1, 0, 0);
}
function minimapToTile(cv, mx, my) {
  const n = W.n, S = cv.width, k = S / (n * 2);
  const X = (mx - S / 2) / k, Y = (my - S / 4) / (k / 2);
  return { x: (X + Y) / 2, y: (Y - X) / 2 };
}

// ---------- icons for buttons ----------
const ICONS = new Map();
function iconFor(key) {
  if (ICONS.has(key)) return ICONS.get(key);
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
  const g = cv.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 64); grd.addColorStop(0, '#5a4a36'); grd.addColorStop(1, '#2a2218'); g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const pc = W && W.players[W.humanId] ? W.players[W.humanId].color : PLAYER_COLORS[0];
  const [kind, id] = key.includes(':') ? key.split(':') : ['tech', key];
  const savedTime = R.time;
  if (kind === 'unit') {
    const d = UNITS[id];
    const fake = { id: 7, type: id, owner: W ? W.humanId : 1, anim: 'idle', animT: 0.5, face: 1, cargo: [], x: 0, y: 0, carry: null, work: null };
    g.save(); const sc = d.naval ? 0.95 : d.tags.includes('mounted') || d.tags.includes('siege') ? 1.25 : d.animal ? 1.8 : 1.7;
    g.translate(32 + (d.naval ? 0 : -2), d.naval ? 48 : 56); g.scale(sc, sc);
    drawUnitFigure(g, fake, 0.5); g.restore();
  } else if (kind === 'bld') {
    const s = BUILDINGS[id].size; const sp = bldSprite(id, W && W.players[W.humanId] ? Math.min(3, W.players[W.humanId].age) : 1, pc);
    const sc = Math.min(56 / sp.w, 56 / sp.h) * 1.15;
    if (id === 'farm') { g.save(); g.translate(32, 36); g.scale(0.34, 0.34); drawFarm(g, { built: true, food: 175, owner: 1, x: 0, y: 0, progress: 1 }, { x: 0, y: 0 }); g.restore(); }
    else g.drawImage(sp.cv, 32 - sp.w * sc / 2, 60 - sp.h * sc, sp.w * sc, sp.h * sc);
  } else {
    drawTechIcon(g, id, pc);
  }
  const url = cv.toDataURL();
  ICONS.set(key, url);
  return url;
}
function drawTechIcon(g, id, pc) {
  const t = TECHS[id];
  const icon = t ? t.icon : id;
  if (icon && (icon.startsWith('unit:') || icon === 'uu')) {
    const u = icon === 'uu' ? CIVS[W.players[W.humanId].civ].uu : icon.slice(5), d = UNITS[u];
    g.save(); g.translate(30, d.naval ? 48 : 56); const sc = d.naval ? 0.95 : d.tags.includes('mounted') ? 1.25 : 1.7; g.scale(sc, sc);
    drawUnitFigure(g, { id: 7, type: u, owner: W.humanId, anim: 'idle', animT: 0.5, face: 1, cargo: [], x: 0, y: 0 }, 0.5); g.restore();
    g.fillStyle = '#ffd76a'; g.font = 'bold 18px serif'; g.fillText(icon === 'uu' ? '★' : '⇧', 44, 20); return;
  }
  g.save(); g.translate(32, 32);
  g.lineCap = 'round';
  const gold = '#e8c860', steel = '#c8ccd4', wood = '#8a5a30';
  switch (icon) {
    case 'age1': case 'age2': case 'age3': {
      const n = +icon.slice(3);
      g.fillStyle = pc.c; g.beginPath(); g.moveTo(-18, -20); g.lineTo(18, -20); g.lineTo(16, 6); g.lineTo(0, 22); g.lineTo(-16, 6); g.closePath(); g.fill(); g.strokeStyle = gold; g.lineWidth = 2.5; g.stroke();
      g.fillStyle = gold; g.font = 'bold 20px serif'; g.textAlign = 'center'; g.fillText(['', 'II', 'III', 'IV'][n], 0, 5);
      g.beginPath(); g.moveTo(-12, -20); g.lineTo(-12, -28); g.lineTo(-6, -23); g.lineTo(0, -30); g.lineTo(6, -23); g.lineTo(12, -28); g.lineTo(12, -20); g.fill();
      break;
    }
    case 'loom': g.strokeStyle = wood; g.lineWidth = 4; g.beginPath(); g.moveTo(-14, 18); g.lineTo(14, -18); g.stroke(); g.fillStyle = '#e8dcc0'; g.beginPath(); g.ellipse(0, 0, 10, 7, -0.9, 0, 6.3); g.fill(); g.strokeStyle = '#a89878'; g.lineWidth = 1; for (let k = -6; k <= 6; k += 3) { g.beginPath(); g.moveTo(k - 4, k + 4); g.lineTo(k + 4, k - 4); g.stroke(); } break;
    case 'wheel': g.strokeStyle = wood; g.lineWidth = 4; g.beginPath(); g.arc(0, 0, 18, 0, 6.3); g.stroke(); g.lineWidth = 2.5; for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(k) * 18, Math.sin(k) * 18); g.stroke(); } break;
    case 'cart': g.fillStyle = wood; g.fillRect(-20, -10, 34, 14); g.strokeStyle = '#3a2a1a'; g.lineWidth = 3; g.beginPath(); g.arc(-10, 10, 7, 0, 6.3); g.arc(8, 10, 7, 0, 6.3); g.stroke(); g.strokeStyle = wood; g.beginPath(); g.moveTo(14, -4); g.lineTo(24, -12); g.stroke(); break;
    case 'eye': g.fillStyle = '#f0ece0'; g.beginPath(); g.ellipse(0, 0, 22, 12, 0, 0, 6.3); g.fill(); g.fillStyle = '#3a6ab0'; g.beginPath(); g.arc(0, 0, 8, 0, 6.3); g.fill(); g.fillStyle = '#111'; g.beginPath(); g.arc(0, 0, 4, 0, 6.3); g.fill(); break;
    case 'collar': g.strokeStyle = '#6a4424'; g.lineWidth = 7; g.beginPath(); g.arc(0, 4, 16, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); g.fillStyle = gold; g.beginPath(); g.arc(-15, -2, 3, 0, 6.3); g.arc(15, -2, 3, 0, 6.3); g.fill(); break;
    case 'plow': g.strokeStyle = wood; g.lineWidth = 4; g.beginPath(); g.moveTo(-20, -16); g.lineTo(6, 8); g.stroke(); g.fillStyle = steel; g.beginPath(); g.moveTo(2, 4); g.lineTo(20, 12); g.lineTo(4, 16); g.fill(); break;
    case 'axe': g.strokeStyle = wood; g.lineWidth = 4; g.beginPath(); g.moveTo(-14, 20); g.lineTo(10, -16); g.stroke(); g.fillStyle = steel; g.beginPath(); g.moveTo(4, -18); g.quadraticCurveTo(22, -20, 20, -2); g.lineTo(8, -8); g.fill(); g.beginPath(); g.moveTo(10, -16); g.quadraticCurveTo(-6, -24, -6, -6); g.lineTo(6, -10); g.fill(); break;
    case 'saw': g.fillStyle = steel; g.beginPath(); g.moveTo(-22, 4); for (let k = -22; k <= 16; k += 4) g.lineTo(k + 2, 10); g.lineTo(18, 4); g.lineTo(18, -2); g.lineTo(-22, -2); g.fill(); g.strokeStyle = wood; g.lineWidth = 4; g.beginPath(); g.arc(-2, -2, 18, Math.PI, 0); g.stroke(); break;
    case 'gold': g.fillStyle = '#d8b030'; for (const [x, y] of [[-8, 6], [8, 6], [0, -6]]) { g.beginPath(); g.moveTo(x - 10, y + 6); g.lineTo(x - 6, y - 6); g.lineTo(x + 6, y - 7); g.lineTo(x + 10, y + 6); g.fill(); } g.fillStyle = '#fff6a0'; g.fillRect(-2, -8, 3, 3); break;
    case 'stone': g.fillStyle = '#9a948c'; for (const [x, y] of [[-8, 6], [8, 6], [0, -6]]) { g.beginPath(); g.moveTo(x - 10, y + 6); g.lineTo(x - 6, y - 6); g.lineTo(x + 6, y - 7); g.lineTo(x + 10, y + 6); g.fill(); } break;
    case 'sword': case 'sword2': g.rotate(0.6); g.fillStyle = steel; g.fillRect(-2.5, -24, 5, 34); g.fillStyle = gold; g.fillRect(-9, 8, 18, 4); g.fillStyle = wood; g.fillRect(-2, 12, 4, 10); if (icon === 'sword2') { g.rotate(-1.2); g.fillStyle = steel; g.fillRect(-2.5, -24, 5, 34); } break;
    case 'armor': case 'armor2': g.fillStyle = icon === 'armor' ? '#8a8e96' : '#b0b6c0'; g.beginPath(); g.moveTo(-16, -16); g.lineTo(16, -16); g.lineTo(20, 0); g.lineTo(14, 20); g.lineTo(-14, 20); g.lineTo(-20, 0); g.closePath(); g.fill(); g.strokeStyle = '#555'; g.lineWidth = 1; for (let k = -12; k < 20; k += 5) { g.beginPath(); g.moveTo(-15, k); g.lineTo(15, k); g.stroke(); } break;
    case 'horse': g.scale(1.3, 1.3); g.translate(-2, 12); drawHorse(g, { id: 1 }, 0, 'idle', '#a87848', pc, false, 'caparison'); break;
    case 'arrow': case 'arrow2': g.rotate(-0.7); g.strokeStyle = wood; g.lineWidth = 3; g.beginPath(); g.moveTo(-22, 0); g.lineTo(16, 0); g.stroke(); g.fillStyle = steel; g.beginPath(); g.moveTo(14, -6); g.lineTo(26, 0); g.lineTo(14, 6); g.fill(); g.fillStyle = '#eee'; g.fillRect(-24, -5, 8, 10); if (icon === 'arrow2') { g.fillStyle = '#c33'; g.fillRect(-24, -5, 8, 3); } break;
    case 'brick': for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) { g.fillStyle = (r + c) % 2 ? '#b0a894' : '#9a9280'; g.fillRect(-22 + c * 15 + (r % 2) * 7, -18 + r * 10, 14, 9); } break;
    case 'target': for (let k = 3; k > 0; k--) { g.fillStyle = k % 2 ? '#e8dcc0' : '#c33'; g.beginPath(); g.arc(0, 0, k * 7, 0, 6.3); g.fill(); } break;
    case 'tower': g.fillStyle = '#a8a090'; g.fillRect(-10, -14, 20, 34); for (let k = 0; k < 3; k++) g.fillRect(-12 + k * 9, -22, 6, 8); g.fillStyle = '#222'; g.fillRect(-3, -4, 6, 10); break;
    case 'flask': g.fillStyle = '#6ac'; g.beginPath(); g.moveTo(-5, -20); g.lineTo(5, -20); g.lineTo(5, -6); g.lineTo(16, 18); g.lineTo(-16, 18); g.lineTo(-5, -6); g.fill(); g.fillStyle = '#3a8'; g.fillRect(-12, 8, 24, 10); break;
    case 'monk': g.fillStyle = '#8a6a4a'; g.beginPath(); g.moveTo(-12, 22); g.lineTo(-8, -6); g.lineTo(8, -6); g.lineTo(12, 22); g.fill(); g.fillStyle = '#e8c4a0'; g.beginPath(); g.arc(0, -12, 7, 0, 6.3); g.fill(); g.strokeStyle = gold; g.lineWidth = 3; g.beginPath(); g.moveTo(18, 22); g.lineTo(18, -18); g.moveTo(12, -12); g.lineTo(24, -12); g.stroke(); break;
    case 'map': g.fillStyle = '#e8dcb0'; g.fillRect(-20, -16, 40, 32); g.strokeStyle = '#8a6a3a'; g.lineWidth = 2; g.beginPath(); g.moveTo(-14, 8); g.quadraticCurveTo(-4, -12, 12, 4); g.stroke(); g.fillStyle = '#c33'; g.beginPath(); g.arc(12, 4, 3, 0, 6.3); g.fill(); break;
    case 'ship': g.fillStyle = wood; g.beginPath(); g.moveTo(-22, 4); g.lineTo(22, 4); g.lineTo(14, 16); g.lineTo(-14, 16); g.fill(); g.fillStyle = '#f0e8d8'; g.beginPath(); g.moveTo(0, -20); g.lineTo(16, 0); g.lineTo(0, 0); g.fill(); g.strokeStyle = '#4a3018'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 4); g.lineTo(0, -22); g.stroke(); break;
    case 'fish': g.fillStyle = '#8ab0c8'; g.beginPath(); g.ellipse(0, 0, 18, 9, 0, 0, 6.3); g.fill(); g.beginPath(); g.moveTo(-14, 0); g.lineTo(-26, -10); g.lineTo(-26, 10); g.fill(); g.fillStyle = '#111'; g.beginPath(); g.arc(10, -2, 2, 0, 6.3); g.fill(); break;
    case 'bell': g.fillStyle = gold; g.beginPath(); g.moveTo(-16, 14); g.quadraticCurveTo(-14, -18, 0, -18); g.quadraticCurveTo(14, -18, 16, 14); g.closePath(); g.fill(); g.beginPath(); g.arc(0, 17, 4, 0, 6.3); g.fill(); break;
    case 'allclear': g.fillStyle = '#6c6'; g.beginPath(); g.moveTo(-18, 0); g.lineTo(-6, 14); g.lineTo(18, -14); g.lineTo(14, -18); g.lineTo(-6, 6); g.lineTo(-14, -4); g.fill(); break;
    case 'ungarrison': g.fillStyle = '#ddd'; g.beginPath(); g.moveTo(-18, -4); g.lineTo(4, -4); g.lineTo(4, -14); g.lineTo(20, 2); g.lineTo(4, 18); g.lineTo(4, 8); g.lineTo(-18, 8); g.fill(); break;
    case 'stop': g.fillStyle = '#c33'; g.beginPath(); for (let k = 0; k < 8; k++) g.lineTo(Math.cos(k * Math.PI / 4 + Math.PI / 8) * 20, Math.sin(k * Math.PI / 4 + Math.PI / 8) * 20); g.fill(); g.fillStyle = '#fff'; g.fillRect(-12, -3, 24, 6); break;
    case 'delete': g.strokeStyle = '#e44'; g.lineWidth = 6; g.beginPath(); g.moveTo(-14, -14); g.lineTo(14, 14); g.moveTo(14, -14); g.lineTo(-14, 14); g.stroke(); break;
    case 'ecobuild': g.fillStyle = '#c8a45a'; g.beginPath(); g.moveTo(-18, -2); g.lineTo(0, -18); g.lineTo(18, -2); g.fill(); g.fillStyle = '#8d6238'; g.fillRect(-14, -2, 28, 20); g.fillStyle = '#4a2e17'; g.fillRect(-4, 6, 8, 12); break;
    case 'milbuild': g.fillStyle = '#a8a090'; g.fillRect(-16, -8, 32, 26); for (let k = 0; k < 4; k++) g.fillRect(-16 + k * 9, -16, 6, 8); g.fillStyle = pc.c; g.fillRect(-2, -26, 12, 8); g.fillStyle = '#333'; g.fillRect(-2, -26, 2, 18); break;
    case 'unload': g.fillStyle = wood; g.beginPath(); g.moveTo(-22, -6); g.lineTo(22, -6); g.lineTo(14, 8); g.lineTo(-14, 8); g.fill(); g.fillStyle = '#ddd'; g.beginPath(); g.moveTo(-6, 10); g.lineTo(6, 10); g.lineTo(6, 16); g.lineTo(12, 16); g.lineTo(0, 26); g.lineTo(-12, 16); g.lineTo(-6, 16); g.fill(); break;
    case 'attackmove': g.rotate(0.7); g.fillStyle = steel; g.fillRect(-2.5, -22, 5, 30); g.fillStyle = gold; g.fillRect(-8, 6, 16, 4); g.rotate(-1.4); g.fillStyle = steel; g.fillRect(-2.5, -22, 5, 30); g.fillStyle = gold; g.fillRect(-8, 6, 16, 4); break;
    case 'relicicon': g.fillStyle = '#e8c040'; g.fillRect(-14, -8, 28, 18); g.fillStyle = '#b02030'; g.fillRect(-2, -6, 4, 14); g.fillRect(-7, -2, 14, 4); break;
    case 'garrison': g.fillStyle = '#a8a090'; g.fillRect(-16, -10, 32, 28); g.fillStyle = '#222'; g.beginPath(); g.moveTo(-6, 18); g.lineTo(-6, 2); g.quadraticCurveTo(0, -6, 6, 2); g.lineTo(6, 18); g.fill(); g.fillStyle = '#ddd'; g.beginPath(); g.moveTo(0, -26); g.lineTo(10, -14); g.lineTo(-10, -14); g.fill(); break;
    case 'market': g.fillStyle = '#e8c860'; g.beginPath(); g.arc(-6, 4, 10, 0, 6.3); g.fill(); g.fillStyle = '#c8a040'; g.beginPath(); g.arc(8, -4, 10, 0, 6.3); g.fill(); g.fillStyle = '#8a6a20'; g.font = 'bold 14px serif'; g.fillText('$', 3, 1); break;
    case 'food': g.fillStyle = '#c33'; g.beginPath(); g.arc(-4, 0, 12, 0, 6.3); g.fill(); g.fillStyle = '#3a3'; g.fillRect(-2, -16, 3, 6); break;
    case 'woodi': g.fillStyle = '#7a4f28'; g.fillRect(-18, -6, 36, 8); g.fillRect(-18, 4, 36, 8); g.fillStyle = '#d9b27a'; g.beginPath(); g.arc(18, -2, 4, 0, 6.3); g.arc(18, 8, 4, 0, 6.3); g.fill(); break;
    case 'rally': g.strokeStyle = '#ddd'; g.lineWidth = 2; g.beginPath(); g.moveTo(-8, 22); g.lineTo(-8, -20); g.stroke(); g.fillStyle = pc.c; g.beginPath(); g.moveTo(-8, -20); g.lineTo(16, -12); g.lineTo(-8, -4); g.fill(); break;
    default: g.fillStyle = '#ddd'; g.font = 'bold 22px serif'; g.textAlign = 'center'; g.fillText('?', 0, 8);
  }
  g.restore();
}
