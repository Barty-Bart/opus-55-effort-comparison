'use strict';
// ---------- Procedural sprite art ----------
class Iso {
  constructor(c, ax, ay) { this.c = c; this.ax = ax; this.ay = ay; }
  P(x, y, z = 0) { return [this.ax + (x - y) * HW, this.ay + (x + y) * HH - z]; }
  poly(pts, fill, stroke, lw = 1) {
    const c = this.c; c.beginPath();
    pts.forEach((p, i) => { const q = this.P(p[0], p[1], p[2] || 0); i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); });
    c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
  }
  line(a, b, col, lw = 1) {
    const c = this.c, p = this.P(a[0], a[1], a[2] || 0), q = this.P(b[0], b[1], b[2] || 0);
    c.strokeStyle = col; c.lineWidth = lw; c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(q[0], q[1]); c.stroke();
  }
  // left = +y face (lit), right = +x face (shaded)
  box(x0, y0, x1, y1, z0, z1, top, left, right, edge = 'rgba(0,0,0,0.35)') {
    this.poly([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], right, edge, 0.7);
    this.poly([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], left, edge, 0.7);
    if (top) this.poly([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], top, edge, 0.7);
  }
  faceR(X, a0, a1, z0, z1, col) { this.poly([[X, a0, z0], [X, a1, z0], [X, a1, z1], [X, a0, z1]], col); }
  faceL(Y, a0, a1, z0, z1, col) { this.poly([[a0, Y, z0], [a1, Y, z0], [a1, Y, z1], [a0, Y, z1]], col); }
  pyramid(x0, y0, x1, y1, z, h, colL, colR, colB) {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, ap = [cx, cy, z + h];
    this.poly([[x0, y0, z], [x1, y0, z], ap], colB || colR, 'rgba(0,0,0,.3)', 0.6);
    this.poly([[x0, y0, z], [x0, y1, z], ap], colB || colL, 'rgba(0,0,0,.3)', 0.6);
    this.poly([[x1, y0, z], [x1, y1, z], ap], colR, 'rgba(0,0,0,.35)', 0.7);
    this.poly([[x0, y1, z], [x1, y1, z], ap], colL, 'rgba(0,0,0,.35)', 0.7);
  }
  gableX(x0, y0, x1, y1, z, h, colL, colR, end) { // ridge along x
    const cy = (y0 + y1) / 2;
    this.poly([[x0, y0, z], [x1, y0, z], [x1, cy, z + h], [x0, cy, z + h]], shadeC(colR, -0.2), 'rgba(0,0,0,.3)', 0.6);
    this.poly([[x1, y0, z], [x1, y1, z], [x1, cy, z + h]], end, 'rgba(0,0,0,.35)', 0.7);
    this.poly([[x0, y1, z], [x1, y1, z], [x1, cy, z + h], [x0, cy, z + h]], colL, 'rgba(0,0,0,.35)', 0.7);
    // shingle lines
    for (let k = 1; k < 5; k++) { const t = k / 5; this.line([x0, lerp(y1, cy, t), z + h * t], [x1, lerp(y1, cy, t), z + h * t], 'rgba(0,0,0,.18)', 1); }
  }
  gableY(x0, y0, x1, y1, z, h, colL, colR, end) { // ridge along y
    const cx = (x0 + x1) / 2;
    this.poly([[x0, y0, z], [x0, y1, z], [cx, y1, z + h], [cx, y0, z + h]], shadeC(colL, -0.1), 'rgba(0,0,0,.3)', 0.6);
    this.poly([[x0, y1, z], [x1, y1, z], [cx, y1, z + h]], end, 'rgba(0,0,0,.35)', 0.7);
    this.poly([[x1, y0, z], [x1, y1, z], [cx, y1, z + h], [cx, y0, z + h]], colR, 'rgba(0,0,0,.35)', 0.7);
    for (let k = 1; k < 5; k++) { const t = k / 5; this.line([lerp(x1, cx, t), y0, z + h * t], [lerp(x1, cx, t), y1, z + h * t], 'rgba(0,0,0,.18)', 1); }
  }
  shadow(x0, y0, x1, y1, H) {
    const s = H / 80;
    this.poly([[x0, y0], [x0 + s, y0 - s], [x1 + s, y0 - s], [x1 + s, y1 - s], [x1, y1], [x0, y1]], 'rgba(10,20,5,0.28)');
  }
  flag(x, y, z, h, col) {
    const c = this.c, p = this.P(x, y, z), top = [p[0], p[1] - h];
    c.strokeStyle = '#3a2a1a'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(top[0], top[1]); c.stroke();
    c.fillStyle = col; c.beginPath(); c.moveTo(top[0], top[1]); c.quadraticCurveTo(top[0] + 7, top[1] + 1, top[0] + 13, top[1] + 4);
    c.quadraticCurveTo(top[0] + 7, top[1] + 6, top[0], top[1] + 9); c.fill();
    c.strokeStyle = 'rgba(0,0,0,.4)'; c.lineWidth = 0.6; c.stroke();
  }
  bricksR(X, a0, a1, z0, z1, col, rows = 4) { // stone texture on +x face
    const c = this.c; const rh = (z1 - z0) / rows;
    for (let r = 0; r < rows; r++) {
      const n = 3 + ((r * 7) % 3); const off = (r % 2) * 0.5;
      for (let k = 0; k < n; k++) {
        const a = a0 + (a1 - a0) * ((k + off) / n), b = Math.min(a1, a + (a1 - a0) / n * 0.92);
        if (a >= a1) continue;
        this.poly([[X, a, z0 + r * rh + 0.8], [X, b, z0 + r * rh + 0.8], [X, b, z0 + (r + 1) * rh - 0.4], [X, a, z0 + (r + 1) * rh - 0.4]], (k + r) % 3 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)', 'rgba(0,0,0,0.16)', 0.5);
      }
    }
  }
  bricksL(Y, a0, a1, z0, z1, col, rows = 4) {
    const rh = (z1 - z0) / rows;
    for (let r = 0; r < rows; r++) {
      const n = 3 + ((r * 5) % 3); const off = (r % 2) * 0.5;
      for (let k = 0; k < n; k++) {
        const a = a0 + (a1 - a0) * ((k + off) / n), b = Math.min(a1, a + (a1 - a0) / n * 0.92);
        if (a >= a1) continue;
        this.poly([[a, Y, z0 + r * rh + 0.8], [b, Y, z0 + r * rh + 0.8], [b, Y, z0 + (r + 1) * rh - 0.4], [a, Y, z0 + (r + 1) * rh - 0.4]], (k + r) % 3 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)', 'rgba(0,0,0,0.15)', 0.5);
      }
    }
  }
  planksR(X, a0, a1, z0, z1, n = 6) { for (let k = 1; k < n; k++) { const a = lerp(a0, a1, k / n); this.line([X, a, z0], [X, a, z1], 'rgba(0,0,0,.22)', 0.8); } }
  planksL(Y, a0, a1, z0, z1, n = 6) { for (let k = 1; k < n; k++) { const a = lerp(a0, a1, k / n); this.line([a, Y, z0], [a, Y, z1], 'rgba(0,0,0,.22)', 0.8); } }
  crenel(x0, y0, x1, y1, z, h, col, colL, colR) { // battlements on the visible front edges
    const n1 = Math.max(2, Math.round((x1 - x0) * 3)), n2 = Math.max(2, Math.round((y1 - y0) * 3));
    for (let k = 0; k < n2; k += 1) { if (k % 2) continue; const a = y0 + (y1 - y0) * k / n2, b = y0 + (y1 - y0) * (k + 1) / n2; this.box(x1 - 0.12, a, x1, b, z, z + h, col, colL, colR); }
    for (let k = 0; k < n1; k += 1) { if (k % 2) continue; const a = x0 + (x1 - x0) * k / n1, b = x0 + (x1 - x0) * (k + 1) / n1; this.box(a, y1 - 0.12, b, y1, z, z + h, col, colL, colR); }
  }
}
function shadeC(col, f) { return col[0] === '#' ? shade(col, f) : col; }

const SPR = { bld: {}, trees: [], res: {}, icons: {} };
function mkSprite(w, h, H, fn) {
  const pad = 8, cw = (w + h) * HW + pad * 2, ch = (w + h) * HH + H + pad * 2;
  const cv = makeCanvas(cw, ch), c = cv.getContext('2d', { willReadFrequently: true });
  const ax = h * HW + pad, ay = H + pad;
  fn(new Iso(c, ax, ay), c);
  return { cv, ax, ay, ctx: c };
}

// palette per style (0 = early wooden, 1 = later stone)
function palette(st) {
  return st ? {
    wallL: '#e2d6bd', wallR: '#b8aa8e', roofL: '#b04a32', roofR: '#7e2f1f', roofEnd: '#cdbb98', stoneL: '#a9a49a', stoneR: '#7f7a72', stoneT: '#c4c0b6', wood: '#6b4526', woodL: '#8a5d34', woodR: '#64411f', beam: '#4a2e17',
  } : {
    wallL: '#dcc79a', wallR: '#b09a6e', roofL: '#b08a48', roofR: '#836431', roofEnd: '#c7ad7a', stoneL: '#9d978b', stoneR: '#76716a', stoneT: '#b8b3a8', wood: '#6b4526', woodL: '#8a5d34', woodR: '#64411f', beam: '#4a2e17',
  };
}

function drawBuildingArt(type, owner, st) {
  const d = BUILDINGS[type], s = d.size, pc = PCOL[owner], p = palette(st);
  const H = { town_center: 130, house: 60, mill: 80, lumber_camp: 50, mining_camp: 50, farm: 10, barracks: 70, archery_range: 60, stable: 60, blacksmith: 80,
    market: 60, watch_tower: 100, palisade: 40, stone_wall: 50, siege_workshop: 70, monastery: 110, castle: 130, wonder: 170 }[type] || 60;
  return mkSprite(s, s, H, (I, c) => {
    switch (type) {
      case 'house': {
        I.shadow(0.2, 0.2, 1.8, 1.8, 50);
        I.box(0.22, 0.22, 1.78, 1.78, 0, 5, p.stoneT, p.stoneL, p.stoneR);
        I.box(0.3, 0.3, 1.7, 1.7, 5, 27, null, p.wallL, p.wallR);
        if (!st) { [0.3, 0.75, 1.25, 1.7].forEach(a => { I.line([a, 1.7, 5], [a, 1.7, 27], p.beam, 1.6); I.line([1.7, a, 5], [1.7, a, 27], p.beam, 1.6); });
          I.line([0.3, 1.7, 16], [1.7, 1.7, 16], p.beam, 1.4); I.line([1.7, 0.3, 16], [1.7, 1.7, 16], p.beam, 1.4); }
        else { I.bricksL(1.7, 0.3, 1.7, 5, 27); I.bricksR(1.7, 0.3, 1.7, 5, 27); }
        I.faceL(1.7, 0.85, 1.15, 5, 19, '#4a2e17');
        I.faceR(1.7, 0.85, 1.15, 13, 20, '#2a2016'); I.faceR(1.7, 0.85, 1.15, 13, 14, p.beam);
        I.gableX(0.12, 0.12, 1.88, 1.88, 27, 20, p.roofL, p.roofR, p.roofEnd);
        I.box(0.55, 0.9, 0.75, 1.1, 36, 52, '#8a7d6e', '#7a6d5e', '#5d5246');
        I.flag(1.85, 1.0, 47, 12, pc.main);
        break;
      }
      case 'town_center': {
        I.shadow(0.1, 0.1, 3.9, 3.9, 120);
        I.box(0.1, 0.1, 3.9, 3.9, 0, 7, p.stoneT, p.stoneL, p.stoneR);
        I.bricksL(3.9, 0.1, 3.9, 0, 7, null, 1); I.bricksR(3.9, 0.1, 3.9, 0, 7, null, 1);
        I.box(0.5, 0.5, 3.5, 3.5, 7, 42, null, p.wallL, p.wallR);
        if (st) { I.bricksL(3.5, 0.5, 3.5, 7, 42, null, 6); I.bricksR(3.5, 0.5, 3.5, 7, 42, null, 6); }
        else { for (let a = 0.5; a <= 3.51; a += 0.5) { I.line([a, 3.5, 7], [a, 3.5, 42], p.beam, 1.8); I.line([3.5, a, 7], [3.5, a, 42], p.beam, 1.8); }
          I.line([0.5, 3.5, 25], [3.5, 3.5, 25], p.beam, 1.6); I.line([3.5, 0.5, 25], [3.5, 3.5, 25], p.beam, 1.6); }
        I.faceL(3.5, 1.6, 2.4, 7, 28, '#3a2412'); I.faceL(3.5, 1.65, 2.35, 7, 26, '#5a3a1e');
        I.line([2, 3.5, 7], [2, 3.5, 26], '#2a1a0a', 1);
        [0.85, 3.0].forEach(a => { I.faceL(3.5, a, a + 0.3, 20, 30, '#2a2016'); I.faceR(3.5, a, a + 0.3, 20, 30, '#241a12'); });
        I.faceR(3.5, 1.7, 2.3, 18, 30, '#241a12');
        I.pyramid(0.3, 0.3, 3.7, 3.7, 42, 34, p.roofL, p.roofR);
        I.box(1.45, 1.45, 2.55, 2.55, 40, 92, null, p.wallL, p.wallR);
        I.bricksL(2.55, 1.45, 2.55, 40, 92, null, 7); I.bricksR(2.55, 1.45, 2.55, 40, 92, null, 7);
        I.faceL(2.55, 1.75, 2.25, 72, 84, '#241a12'); I.faceR(2.55, 1.75, 2.25, 72, 84, '#1c140e');
        I.faceL(2.55, 1.55, 2.45, 48, 64, pc.main); I.faceR(2.55, 1.6, 2.4, 48, 62, pc.dark);
        I.pyramid(1.3, 1.3, 2.7, 2.7, 92, 30, p.roofL, p.roofR);
        I.flag(2, 2, 121, 16, pc.main);
        I.flag(3.7, 0.4, 7, 22, pc.main); I.flag(0.4, 3.7, 7, 22, pc.main);
        break;
      }
      case 'mill': {
        I.shadow(0.3, 0.3, 1.7, 1.7, 70);
        I.box(0.25, 0.25, 1.75, 1.75, 0, 4, p.stoneT, p.stoneL, p.stoneR);
        I.box(0.45, 0.45, 1.55, 1.55, 4, 44, null, p.wallL, p.wallR);
        I.bricksL(1.55, 0.45, 1.55, 4, 44, null, 5); I.bricksR(1.55, 0.45, 1.55, 4, 44, null, 5);
        I.faceL(1.55, 0.85, 1.15, 4, 18, '#4a2e17');
        I.pyramid(0.3, 0.3, 1.7, 1.7, 44, 26, p.roofL, p.roofR);
        // sacks
        I.box(1.6, 0.4, 1.85, 0.7, 0, 7, '#e8dcb8', '#d6c79e', '#b8a878');
        I.flag(1.0, 1.0, 70, 8, pc.main);
        break;
      }
      case 'lumber_camp': {
        I.shadow(0.2, 0.2, 1.8, 1.4, 34);
        [[0.3, 0.3], [1.7, 0.3], [0.3, 1.2], [1.7, 1.2]].forEach(([x, y]) => I.box(x - 0.05, y - 0.05, x + 0.05, y + 0.05, 0, 24, null, p.woodL, p.woodR));
        I.gableX(0.15, 0.15, 1.85, 1.35, 24, 14, p.roofL, p.roofR, p.woodL);
        // logs
        for (let r = 0; r < 3; r++) for (let k = 0; k < 4 - r; k++) {
          const y = 1.45 + k * 0.1 + r * 0.05, z = r * 5;
          const q = I.P(0.35, y, z + 3), e = I.P(1.55, y, z + 3);
          c.strokeStyle = '#6b4526'; c.lineWidth = 5; c.beginPath(); c.moveTo(q[0], q[1]); c.lineTo(e[0], e[1]); c.stroke();
          c.fillStyle = '#d9b27a'; c.beginPath(); c.ellipse(e[0], e[1], 2.2, 2.6, 0, 0, 6.28); c.fill();
          c.strokeStyle = '#7a5530'; c.lineWidth = 0.6; c.stroke();
        }
        I.box(1.0, 0.55, 1.3, 0.85, 0, 6, '#a5794a', '#8a5d34', '#64411f');
        I.flag(1.8, 0.3, 24, 10, pc.main);
        break;
      }
      case 'mining_camp': {
        I.shadow(0.2, 0.2, 1.8, 1.4, 34);
        [[0.3, 0.3], [1.7, 0.3], [0.3, 1.2], [1.7, 1.2]].forEach(([x, y]) => I.box(x - 0.05, y - 0.05, x + 0.05, y + 0.05, 0, 24, null, p.woodL, p.woodR));
        I.gableY(0.15, 0.15, 1.85, 1.35, 24, 14, p.roofL, p.roofR, p.woodL);
        // cart
        I.box(0.5, 1.4, 1.2, 1.8, 3, 10, '#7a5530', '#8a5d34', '#64411f');
        [[0.6, 1.8], [1.1, 1.8]].forEach(([x, y]) => { const q = I.P(x, y, 3); c.fillStyle = '#3a2412'; c.beginPath(); c.arc(q[0], q[1], 3.2, 0, 6.28); c.fill(); });
        for (let k = 0; k < 6; k++) { const q = I.P(0.6 + (k % 3) * 0.2, 1.5 + (k > 2 ? 0.15 : 0), 11); c.fillStyle = k % 2 ? '#e8c040' : '#9a948a'; c.beginPath(); c.arc(q[0], q[1], 2.4, 0, 6.28); c.fill(); }
        I.box(1.4, 1.35, 1.8, 1.75, 0, 5, '#a09a90', '#8a857c', '#6a655d');
        I.flag(1.8, 0.3, 24, 10, pc.main);
        break;
      }
      case 'barracks': {
        I.shadow(0.3, 0.3, 2.7, 2.1, 60);
        I.box(0.25, 0.25, 2.75, 2.05, 0, 4, p.stoneT, p.stoneL, p.stoneR);
        I.box(0.3, 0.3, 2.7, 2.0, 4, 32, null, st ? p.wallL : p.woodL, st ? p.wallR : p.woodR);
        if (st) { I.bricksL(2.0, 0.3, 2.7, 4, 32, null, 4); I.bricksR(2.7, 0.3, 2.0, 4, 32, null, 4); } else { I.planksL(2.0, 0.3, 2.7, 4, 32, 12); I.planksR(2.7, 0.3, 2.0, 4, 32, 8); }
        I.faceL(2.0, 1.2, 1.8, 4, 22, '#2e1c0e');
        [0.6, 2.2].forEach(a => { const q = I.P(a, 2.0, 20); c.fillStyle = pc.main; c.beginPath(); c.ellipse(q[0], q[1], 4, 5, 0, 0, 6.28); c.fill(); c.strokeStyle = '#d8c070'; c.lineWidth = 1; c.stroke(); });
        I.gableX(0.15, 0.15, 2.85, 2.15, 32, 22, p.roofL, p.roofR, p.roofEnd);
        // yard: weapon rack + dummy
        I.box(0.5, 2.45, 1.4, 2.55, 0, 3, '#6b4526', '#6b4526', '#4a2e17');
        for (let k = 0; k < 5; k++) I.line([0.55 + k * 0.2, 2.5, 0], [0.6 + k * 0.2, 2.5, 18], '#aaa', 1.2);
        I.line([2.3, 2.5, 0], [2.3, 2.5, 20], '#6b4526', 2); I.line([2.1, 2.4, 15], [2.5, 2.6, 15], '#6b4526', 2);
        { const q = I.P(2.3, 2.5, 22); c.fillStyle = '#d6b474'; c.beginPath(); c.arc(q[0], q[1], 3, 0, 6.28); c.fill(); }
        I.flag(2.7, 0.3, 32, 16, pc.main);
        break;
      }
      case 'archery_range': {
        I.shadow(0.3, 0.3, 1.6, 2.7, 50);
        I.box(0.3, 0.3, 1.5, 2.7, 0, 26, null, st ? p.wallL : p.woodL, st ? p.wallR : p.woodR);
        if (!st) { I.planksL(2.7, 0.3, 1.5, 0, 26, 6); I.planksR(1.5, 0.3, 2.7, 0, 26, 12); } else { I.bricksR(1.5, 0.3, 2.7, 0, 26); }
        I.faceR(1.5, 1.2, 1.8, 0, 18, '#2e1c0e');
        I.gableY(0.15, 0.15, 1.65, 2.85, 26, 18, p.roofL, p.roofR, p.roofEnd);
        // fence
        for (let k = 0; k <= 6; k++) { I.line([1.7 + k * 0.18, 2.8, 0], [1.7 + k * 0.18, 2.8, 8], '#6b4526', 1.5); I.line([2.85, 0.2 + k * 0.43, 0], [2.85, 0.2 + k * 0.43, 8], '#6b4526', 1.5); }
        I.line([1.7, 2.8, 6], [2.85, 2.8, 6], '#6b4526', 1.2); I.line([2.85, 0.2, 6], [2.85, 2.8, 6], '#6b4526', 1.2);
        // targets
        [[2.3, 0.8], [2.3, 1.9]].forEach(([x, y]) => {
          I.line([x, y, 0], [x + 0.1, y, 14], '#6b4526', 1.5);
          const q = I.P(x, y, 14);
          ['#e8dcb0', '#c83020', '#e8dcb0', '#c83020'].forEach((col, i) => { c.fillStyle = col; c.beginPath(); c.ellipse(q[0], q[1], 6 - i * 1.5, 7 - i * 1.7, 0.45, 0, 6.28); c.fill(); });
        });
        I.flag(1.5, 0.3, 26, 14, pc.main);
        break;
      }
      case 'stable': {
        I.shadow(0.3, 0.3, 2.7, 2.2, 50);
        I.box(0.3, 0.3, 2.7, 2.1, 0, 26, null, st ? p.wallL : p.woodL, st ? p.wallR : p.woodR);
        if (!st) { I.planksL(2.1, 0.3, 2.7, 0, 26, 14); I.planksR(2.7, 0.3, 2.1, 0, 26, 8); } else { I.bricksL(2.1, 0.3, 2.7, 0, 26); }
        [0.5, 1.2, 1.9].forEach(a => { I.faceL(2.1, a, a + 0.45, 0, 17, '#2a1a0c'); I.faceL(2.1, a, a + 0.45, 12, 17, '#5a3a1e'); });
        I.gableX(0.15, 0.15, 2.85, 2.25, 26, 20, p.roofL, p.roofR, p.roofEnd);
        // hay
        { const q = I.P(2.3, 2.5, 4); c.fillStyle = '#d8b850'; c.beginPath(); c.ellipse(q[0], q[1], 10, 6, 0, 0, 6.28); c.fill(); c.fillStyle = '#e8cc68'; c.beginPath(); c.ellipse(q[0] - 2, q[1] - 2, 7, 4, 0, 0, 6.28); c.fill(); }
        I.box(0.6, 2.35, 1.5, 2.6, 0, 5, '#5a8ab0', '#7a5530', '#5a3a1e');
        I.flag(2.7, 0.3, 26, 16, pc.main);
        break;
      }
      case 'blacksmith': {
        I.shadow(0.4, 0.4, 2.6, 2.6, 60);
        I.box(0.4, 0.4, 2.6, 2.6, 0, 30, null, p.stoneL, p.stoneR);
        I.bricksL(2.6, 0.4, 2.6, 0, 30, null, 5); I.bricksR(2.6, 0.4, 2.6, 0, 30, null, 5);
        I.faceL(2.6, 1.2, 1.8, 0, 20, '#2a1a0c');
        I.faceR(2.6, 1.3, 1.7, 10, 20, '#ff9a30'); I.faceR(2.6, 1.3, 1.7, 10, 12, '#6a2a0a');
        I.pyramid(0.25, 0.25, 2.75, 2.75, 30, 24, '#5a5048', '#3e3630');
        I.box(0.8, 0.8, 1.2, 1.2, 30, 66, '#6a645c', '#8a847a', '#666058');
        // anvil
        I.box(2.75, 1.3, 2.95, 1.7, 0, 6, '#333', '#444', '#222');
        I.flag(2.5, 2.5, 30, 12, pc.main);
        break;
      }
      case 'market': {
        I.poly([[0.2, 0.2], [2.8, 0.2], [2.8, 2.8], [0.2, 2.8]], '#b8a888', 'rgba(0,0,0,.2)');
        const stall = (x, y, cA, cB) => {
          [[x, y], [x + 0.9, y], [x, y + 0.9], [x + 0.9, y + 0.9]].forEach(([a, b]) => I.line([a, b, 0], [a, b, 18], '#5a3a1e', 1.5));
          I.box(x + 0.05, y + 0.05, x + 0.85, y + 0.85, 0, 8, '#8a5d34', '#7a5530', '#5a3a1e');
          I.gableX(x - 0.05, y - 0.05, x + 0.95, y + 0.95, 18, 10, cA, cB, cA);
          for (let k = 1; k < 4; k++) I.line([x - 0.05 + k * 0.25, y + 0.95, 18], [x - 0.05 + k * 0.25, y + 0.45, 28], 'rgba(255,255,255,.55)', 2);
        };
        stall(0.4, 0.4, '#c83a2a', '#8a2014'); stall(1.7, 0.4, '#2a6ac8', '#1a4088'); stall(0.4, 1.7, '#d8b030', '#9a7a18');
        [[1.9, 1.9], [2.3, 2.1], [2.0, 2.4]].forEach(([x, y], i) => I.box(x, y, x + 0.25, y + 0.25, 0, 8, '#b08050', '#9a6a3a', '#6a4520'));
        I.flag(2.6, 2.6, 0, 34, pc.main);
        break;
      }
      case 'watch_tower': {
        I.shadow(0.15, 0.15, 0.85, 0.85, 90);
        I.box(0.18, 0.18, 0.82, 0.82, 0, 44, null, p.stoneL, p.stoneR);
        I.bricksL(0.82, 0.18, 0.82, 0, 44, null, 6); I.bricksR(0.82, 0.18, 0.82, 0, 44, null, 6);
        I.faceL(0.82, 0.4, 0.6, 0, 10, '#3a2412');
        I.box(0.05, 0.05, 0.95, 0.95, 44, 60, p.woodL, p.woodL, p.woodR);
        I.faceL(0.95, 0.3, 0.7, 49, 57, '#1a120a'); I.faceR(0.95, 0.3, 0.7, 49, 57, '#140e08');
        I.pyramid(-0.05, -0.05, 1.05, 1.05, 60, 24, p.roofL, p.roofR);
        I.flag(0.5, 0.5, 84, 12, pc.main);
        break;
      }
      case 'siege_workshop': {
        I.shadow(0.2, 0.2, 2.8, 2.8, 60);
        I.box(0.3, 0.3, 2.7, 1.3, 0, 30, null, p.woodL, p.woodR); I.planksL(1.3, 0.3, 2.7, 0, 30, 10);
        [[0.3, 2.6], [2.7, 2.6], [2.7, 1.3]].forEach(([x, y]) => I.box(x - 0.06, y - 0.06, x + 0.06, y + 0.06, 0, 30, null, p.woodL, p.woodR));
        // ram frame inside
        I.box(1.0, 1.6, 2.2, 2.2, 3, 12, '#7a5530', '#8a5d34', '#5a3a1e');
        I.gableX(0.15, 0.15, 2.85, 2.75, 30, 22, p.roofL, p.roofR, p.roofEnd);
        I.line([2.4, 0.4, 52], [2.9, 0.1, 64], '#5a3a1e', 3); I.line([2.9, 0.1, 64], [2.9, 0.1, 40], '#ccc', 0.8);
        I.flag(0.4, 0.4, 52, 12, pc.main);
        break;
      }
      case 'monastery': {
        I.shadow(0.3, 0.3, 2.7, 2.7, 90);
        I.box(0.3, 0.6, 2.4, 2.3, 0, 36, null, '#ece6d8', '#c4bca8');
        I.bricksL(2.3, 0.3, 2.4, 0, 36, null, 5);
        I.faceL(2.3, 1.1, 1.5, 0, 22, '#3a2412');
        [0.6, 1.8].forEach(a => { I.faceL(2.3, a, a + 0.22, 14, 28, '#3a60b0'); I.faceL(2.3, a + 0.05, a + 0.17, 16, 26, '#d84a40'); });
        I.gableX(0.2, 0.5, 2.5, 2.4, 36, 24, '#4a4a58', '#33333e', '#ddd6c6');
        I.box(2.0, 0.3, 2.75, 1.05, 0, 72, null, '#ece6d8', '#c4bca8');
        I.bricksR(2.75, 0.3, 1.05, 0, 72, null, 9);
        I.faceR(2.75, 0.52, 0.83, 54, 66, '#241a12'); I.faceL(1.05, 2.2, 2.55, 54, 66, '#241a12');
        I.pyramid(1.95, 0.25, 2.8, 1.1, 72, 26, '#4a4a58', '#33333e');
        { const q = I.P(2.375, 0.675, 98); c.strokeStyle = '#e8c860'; c.lineWidth = 2; c.beginPath(); c.moveTo(q[0], q[1]); c.lineTo(q[0], q[1] - 12); c.moveTo(q[0] - 4, q[1] - 8); c.lineTo(q[0] + 4, q[1] - 8); c.stroke(); }
        I.flag(0.4, 2.2, 36, 12, pc.main);
        break;
      }
      case 'castle': {
        const sL = '#aaa497', sR = '#7c776d', sT = '#c7c2b6';
        I.shadow(0.1, 0.1, 3.9, 3.9, 120);
        const tower = (x, y, h) => { I.box(x - 0.45, y - 0.45, x + 0.45, y + 0.45, 0, h, sT, sL, sR); I.bricksL(y + 0.45, x - 0.45, x + 0.45, 0, h, null, 6); I.bricksR(x + 0.45, y - 0.45, y + 0.45, 0, h, null, 6); I.crenel(x - 0.45, y - 0.45, x + 0.45, y + 0.45, h, 6, sT, sL, sR); I.faceL(y + 0.45, x - 0.1, x + 0.1, h - 22, h - 12, '#1a120a'); };
        tower(0.5, 0.5, 58);
        I.box(0.5, 0.35, 3.5, 0.75, 0, 40, sT, sL, sR); I.box(0.35, 0.5, 0.75, 3.5, 0, 40, sT, sL, sR);
        tower(3.5, 0.5, 58); tower(0.5, 3.5, 58);
        I.box(1.2, 1.2, 2.8, 2.8, 0, 80, sT, sL, sR);
        I.bricksL(2.8, 1.2, 2.8, 0, 80, null, 9); I.bricksR(2.8, 1.2, 2.8, 0, 80, null, 9);
        I.crenel(1.2, 1.2, 2.8, 2.8, 80, 7, sT, sL, sR);
        I.faceL(2.8, 1.55, 2.45, 44, 70, pc.main); I.faceR(2.8, 1.6, 2.4, 44, 68, pc.dark);
        I.faceL(2.8, 1.9, 2.1, 30, 40, '#1a120a');
        I.box(0.6, 3.25, 3.4, 3.65, 0, 40, sT, sL, sR); I.bricksL(3.65, 0.6, 3.4, 0, 40, null, 5); I.crenel(0.6, 3.25, 3.4, 3.65, 40, 5, sT, sL, sR);
        I.box(3.25, 0.6, 3.65, 3.4, 0, 40, sT, sL, sR); I.bricksR(3.65, 0.6, 3.4, 0, 40, null, 5); I.crenel(3.25, 0.6, 3.65, 3.4, 40, 5, sT, sL, sR);
        I.faceL(3.65, 1.6, 2.4, 0, 26, '#2a1a0c'); I.faceL(3.65, 1.65, 2.35, 0, 24, '#5a3a1e');
        for (let k = 1; k < 5; k++) I.line([1.65 + k * 0.14, 3.65, 0], [1.65 + k * 0.14, 3.65, 24], '#333', 0.8);
        tower(3.5, 3.5, 62);
        I.flag(2, 2, 87, 20, pc.main); I.flag(0.5, 3.5, 64, 12, pc.main); I.flag(3.5, 0.5, 64, 12, pc.main);
        break;
      }
      case 'wonder': {
        const gL = '#efe2bd', gR = '#c4b288', gT = '#fff4d6', gold = '#e8c040';
        I.shadow(0.1, 0.1, 4.9, 4.9, 150);
        I.box(0.1, 0.1, 4.9, 4.9, 0, 8, gT, gL, gR);
        I.box(0.4, 0.4, 4.6, 4.6, 8, 16, gT, gL, gR);
        I.box(0.8, 0.8, 4.2, 4.2, 16, 64, null, gL, gR);
        for (let k = 0; k < 6; k++) { const a = 1.0 + k * 0.55; I.faceL(4.2, a, a + 0.22, 26, 54, '#8a6a30'); I.faceR(4.2, a, a + 0.22, 26, 54, '#6a5020'); }
        I.faceL(4.2, 2.2, 2.8, 16, 44, '#3a2412');
        I.pyramid(0.7, 0.7, 4.3, 4.3, 64, 18, '#d9c690', '#a8955e');
        const q = I.P(2.5, 2.5, 82);
        c.fillStyle = gold; c.beginPath(); c.ellipse(q[0], q[1], 34, 34, 0, Math.PI, 0); c.fill();
        const gr = c.createLinearGradient(q[0] - 34, 0, q[0] + 34, 0); gr.addColorStop(0, 'rgba(255,255,220,.5)'); gr.addColorStop(1, 'rgba(90,50,0,.45)');
        c.fillStyle = gr; c.beginPath(); c.ellipse(q[0], q[1], 34, 34, 0, Math.PI, 0); c.fill();
        c.strokeStyle = '#8a6010'; c.lineWidth = 1; c.stroke();
        c.fillStyle = '#b89020'; c.fillRect(q[0] - 35, q[1] - 2, 70, 5);
        c.strokeStyle = gold; c.lineWidth = 3; c.beginPath(); c.moveTo(q[0], q[1] - 34); c.lineTo(q[0], q[1] - 52); c.stroke();
        c.fillStyle = gold; c.beginPath(); c.arc(q[0], q[1] - 54, 4, 0, 6.28); c.fill();
        [[0.8, 0.8], [4.2, 0.8], [0.8, 4.2], [4.2, 4.2]].forEach(([x, y]) => { I.box(x - 0.25, y - 0.25, x + 0.25, y + 0.25, 16, 96, null, gL, gR); I.pyramid(x - 0.3, y - 0.3, x + 0.3, y + 0.3, 96, 40, gold, '#a07818'); });
        I.flag(2.5, 4.6, 16, 30, pc.main); I.flag(4.6, 2.5, 16, 30, pc.main);
        break;
      }
    }
  });
}

function getBuildingSprite(type, owner, st) {
  const k = type + owner + '_' + st;
  if (!SPR.bld[k]) SPR.bld[k] = drawBuildingArt(type, owner, st);
  return SPR.bld[k];
}

// Walls: sprite per neighbour mask (bit0 +x, bit1 -x, bit2 +y, bit3 -y)
function getWallSprite(type, owner, mask) {
  const k = type + owner + 'm' + mask;
  if (SPR.bld[k]) return SPR.bld[k];
  const stone = type === 'stone_wall', pc = PCOL[owner];
  SPR.bld[k] = mkSprite(1, 1, 50, (I, c) => {
    const h = stone ? 26 : 22;
    const segs = [];
    if (mask & 8) segs.push([0.3, 0, 0.7, 0.5]);  // -y (back)
    if (mask & 2) segs.push([0, 0.3, 0.5, 0.7]);  // -x (back)
    const front = [];
    if (mask & 1) front.push([0.5, 0.3, 1, 0.7]);
    if (mask & 4) front.push([0.3, 0.5, 0.7, 1]);
    const draw = s => {
      if (stone) { I.box(s[0], s[1], s[2], s[3], 0, h, '#c4c0b6', '#a9a49a', '#7f7a72'); I.bricksL(s[3], s[0], s[2], 0, h, null, 3); I.bricksR(s[2], s[1], s[3], 0, h, null, 3); }
      else {
        const n = 3, lenX = s[2] - s[0], lenY = s[3] - s[1];
        const alongX = lenX > lenY;
        for (let k2 = 0; k2 < n; k2++) {
          const t = (k2 + 0.5) / n;
          const x = alongX ? s[0] + lenX * t : 0.5, y = alongX ? 0.5 : s[1] + lenY * t;
          stake(I, c, x, y, h - (k2 % 2) * 3);
        }
      }
    };
    segs.forEach(draw);
    if (stone) { I.box(0.26, 0.26, 0.74, 0.74, 0, h + 4, '#cfcbc1', '#b1aca2', '#858077'); I.crenel(0.26, 0.26, 0.74, 0.74, h + 4, 4, '#cfcbc1', '#b1aca2', '#858077'); }
    else stake(I, c, 0.5, 0.5, h + 2);
    front.forEach(draw);
    if (stone && !(mask)) I.flag(0.5, 0.5, h + 8, 10, pc.main);
  });
  return SPR.bld[k];
}
function stake(I, c, x, y, h) {
  const b = I.P(x, y, 0), t = I.P(x, y, h);
  c.strokeStyle = '#4a2e17'; c.lineWidth = 6; c.beginPath(); c.moveTo(b[0], b[1]); c.lineTo(t[0], t[1]); c.stroke();
  c.strokeStyle = '#8a5d34'; c.lineWidth = 4; c.beginPath(); c.moveTo(b[0] - 0.5, b[1]); c.lineTo(t[0] - 0.5, t[1]); c.stroke();
  c.fillStyle = '#a57a48'; c.beginPath(); c.moveTo(t[0] - 2.5, t[1]); c.lineTo(t[0] + 2.5, t[1]); c.lineTo(t[0], t[1] - 5); c.fill();
}

// Farm sprite by fullness stage 0..4 (4 = fresh)
function getFarmSprite(stage, built) {
  const k = 'farm' + stage + (built ? 'b' : 'f');
  if (SPR.bld[k]) return SPR.bld[k];
  SPR.bld[k] = mkSprite(3, 3, 14, (I, c) => {
    I.poly([[0.08, 0.08], [2.92, 0.08], [2.92, 2.92], [0.08, 2.92]], built ? '#6e5230' : '#8a7050', 'rgba(40,25,10,.5)', 1);
    for (let r = 0; r < 9; r++) {
      const y = 0.25 + r * 0.31;
      I.line([0.2, y], [2.8, y], 'rgba(40,25,10,.45)', 2);
      I.line([0.2, y + 0.08], [2.8, y + 0.08], 'rgba(160,120,70,.35)', 1);
      if (!built) continue;
      const n = 14;
      for (let k2 = 0; k2 < n; k2++) {
        if (((k2 * 7 + r * 3) % 5) >= stage + 1) continue;
        const x = 0.25 + k2 * (2.5 / n), q = I.P(x, y, 0);
        const hgt = 3 + stage * 1.6;
        c.strokeStyle = stage > 2 ? '#c8b040' : '#8ab040'; c.lineWidth = 1.4;
        c.beginPath(); c.moveTo(q[0], q[1]); c.lineTo(q[0] - 1, q[1] - hgt); c.moveTo(q[0], q[1]); c.lineTo(q[0] + 1.5, q[1] - hgt * 0.8); c.stroke();
        if (stage > 2) { c.fillStyle = '#e8d060'; c.fillRect(q[0] - 2, q[1] - hgt - 1.5, 2, 2.5); }
      }
    }
  });
  return SPR.bld[k];
}

function getFoundationSprite(size) {
  const k = 'found' + size;
  if (SPR.bld[k]) return SPR.bld[k];
  SPR.bld[k] = mkSprite(size, size, 16, (I, c) => {
    const m = 0.08, s = size - m;
    I.poly([[m, m], [s, m], [s, s], [m, s]], 'rgba(140,110,70,0.75)', 'rgba(60,40,20,.7)', 1);
    for (let k2 = 0; k2 < size * 3; k2++) { const q = I.P(m + rnd() * (s - m), m + rnd() * (s - m)); c.fillStyle = 'rgba(90,70,40,.5)'; c.beginPath(); c.arc(q[0], q[1], 1.5, 0, 6.28); c.fill(); }
    [[m, m], [s, m], [s, s], [m, s]].forEach(([x, y]) => { I.line([x, y, 0], [x, y, 12], '#6b4526', 2.5); });
    I.line([m, s, 9], [s, s, 9], '#d8c898', 0.8); I.line([s, m, 9], [s, s, 9], '#d8c898', 0.8);
  });
  return SPR.bld[k];
}

// ---------- Trees & resources ----------
function makeTrees() {
  seedRng(4040);
  for (let v = 0; v < 8; v++) {
    const pine = v >= 5;
    const W = 64, H = 84, cv = makeCanvas(W, H), c = cv.getContext('2d', { willReadFrequently: true });
    const ax = 32, ay = 76;
    c.fillStyle = 'rgba(10,25,5,0.3)'; c.beginPath(); c.ellipse(ax + 8, ay - 1, 18, 7, 0, 0, 6.28); c.fill();
    if (!pine) {
      c.fillStyle = '#5a3a1e'; c.fillRect(ax - 2.5, ay - 26, 5, 26);
      c.fillStyle = '#6b4526'; c.fillRect(ax - 2.5, ay - 26, 2, 26);
      const base = [[38, 88, 30], [46, 100, 34], [52, 92, 28], [60, 104, 36], [42, 80, 24]][v];
      const blobs = [];
      for (let k = 0; k < 9; k++) blobs.push([ax + rrange(-12, 12), ay - 40 + rrange(-12, 10), rrange(8, 13)]);
      blobs.sort((a, b) => a[1] - b[1]);
      blobs.forEach(([x, y, r]) => { c.fillStyle = `rgb(${base[0] * 0.7},${base[1] * 0.7},${base[2] * 0.7})`; c.beginPath(); c.arc(x, y + 2, r, 0, 6.28); c.fill(); });
      blobs.forEach(([x, y, r]) => { c.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`; c.beginPath(); c.arc(x, y, r * 0.9, 0, 6.28); c.fill(); });
      blobs.forEach(([x, y, r]) => { c.fillStyle = `rgba(${base[0] + 60},${base[1] + 60},${base[2] + 30},0.55)`; c.beginPath(); c.arc(x - r * 0.3, y - r * 0.35, r * 0.45, 0, 6.28); c.fill(); });
    } else {
      c.fillStyle = '#4a2e17'; c.fillRect(ax - 2, ay - 16, 4, 16);
      const g = [[30, 72, 40], [26, 64, 36], [36, 78, 44]][v - 5];
      const layers = 4, top = ay - 74 + v * 3;
      for (let k = 0; k < layers; k++) {
        const y0 = top + k * 13, w = 9 + k * 5;
        c.fillStyle = `rgb(${g[0]},${g[1]},${g[2]})`;
        c.beginPath(); c.moveTo(ax, y0); c.lineTo(ax + w, y0 + 20); c.lineTo(ax - w, y0 + 20); c.closePath(); c.fill();
        c.fillStyle = `rgba(${g[0] + 50},${g[1] + 60},${g[2] + 30},0.5)`;
        c.beginPath(); c.moveTo(ax, y0); c.lineTo(ax - w, y0 + 20); c.lineTo(ax - w * 0.2, y0 + 20); c.closePath(); c.fill();
      }
    }
    SPR.trees.push({ cv, ax, ay, ctx: c });
  }
  // stump
  const cv = makeCanvas(20, 14), c = cv.getContext('2d');
  c.fillStyle = '#5a3a1e'; c.beginPath(); c.ellipse(10, 8, 6, 3.5, 0, 0, 6.28); c.fill(); c.fillRect(4, 5, 12, 3);
  c.fillStyle = '#c8a070'; c.beginPath(); c.ellipse(10, 5, 6, 3, 0, 0, 6.28); c.fill();
  SPR.stump = { cv, ax: 10, ay: 8 };
}

function makeResourceSprites() {
  seedRng(5050);
  const mine = (gold) => {
    const cv = makeCanvas(64, 44), c = cv.getContext('2d', { willReadFrequently: true }), ax = 32, ay = 30;
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(ax + 3, ay + 2, 26, 11, 0, 0, 6.28); c.fill();
    const rocks = [];
    for (let k = 0; k < 7; k++) rocks.push([ax + rrange(-16, 16), ay + rrange(-8, 5), rrange(6, 11)]);
    rocks.sort((a, b) => a[1] - b[1]);
    rocks.forEach(([x, y, r]) => {
      c.fillStyle = gold ? '#7a6a52' : '#8a8680';
      c.beginPath(); c.moveTo(x - r, y + r * 0.4); c.lineTo(x - r * 0.6, y - r * 0.7); c.lineTo(x + r * 0.3, y - r * 0.9); c.lineTo(x + r, y - r * 0.1); c.lineTo(x + r * 0.7, y + r * 0.5); c.closePath(); c.fill();
      c.fillStyle = gold ? '#9a8a6a' : '#b4b0a8';
      c.beginPath(); c.moveTo(x - r * 0.6, y - r * 0.7); c.lineTo(x + r * 0.3, y - r * 0.9); c.lineTo(x + r * 0.1, y - r * 0.1); c.lineTo(x - r * 0.7, y + r * 0.1); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 0.8; c.stroke();
      if (gold) for (let q = 0; q < 3; q++) { c.fillStyle = q ? '#f0c830' : '#fff0a0'; c.beginPath(); c.arc(x + rrange(-r * 0.6, r * 0.6), y + rrange(-r * 0.6, r * 0.2), rrange(1.2, 2.6), 0, 6.28); c.fill(); }
    });
    return { cv, ax, ay, ctx: c };
  };
  SPR.res.gold = mine(true); SPR.res.stone = mine(false);
  const bush = (stage) => {
    const cv = makeCanvas(48, 40), c = cv.getContext('2d', { willReadFrequently: true }), ax = 24, ay = 30;
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(ax + 3, ay + 1, 17, 7, 0, 0, 6.28); c.fill();
    for (let k = 0; k < 7; k++) { const x = ax + rrange(-11, 11), y = ay - 8 + rrange(-6, 5), r = rrange(5, 8); c.fillStyle = k % 2 ? '#2e5a24' : '#3a6a2a'; c.beginPath(); c.arc(x, y, r, 0, 6.28); c.fill(); }
    for (let k = 0; k < 4; k++) { const x = ax + rrange(-9, 9), y = ay - 11 + rrange(-4, 3); c.fillStyle = 'rgba(120,180,80,.45)'; c.beginPath(); c.arc(x - 1, y - 1, 3.5, 0, 6.28); c.fill(); }
    for (let k = 0; k < stage * 5; k++) { const x = ax + rrange(-12, 12), y = ay - 8 + rrange(-8, 6); c.fillStyle = k % 3 ? '#c8284a' : '#8a2a8a'; c.beginPath(); c.arc(x, y, 1.8, 0, 6.28); c.fill(); c.fillStyle = 'rgba(255,255,255,.6)'; c.fillRect(x - 0.8, y - 1, 0.8, 0.8); }
    return { cv, ax, ay };
  };
  SPR.res.berries = [bush(0), bush(1), bush(2), bush(3)];
}

// ---------- Units (drawn live each frame) ----------
const SKIN = ['#e8b88a', '#d49a6a', '#c08050', '#f0c8a0'];
function limb(c, x0, y0, x1, y1, col, w) { c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); }

// o: {tunic, tunicDark, pants, skin, helm, helmCol, armor, weapon, shield, shieldCol, walk, swing, hipY, female, hood, robe, carry, tool}
function drawHuman(c, o) {
  const hip = o.hipY != null ? o.hipY : -9, sh = hip - 8.5, mounted = o.hipY != null && o.hipY < -9;
  const ph = o.walk;
  // legs
  if (!mounted && !o.robe) {
    const s1 = ph != null ? Math.sin(ph) * 3.4 : 0.9, s2 = ph != null ? -Math.sin(ph) * 3.4 : -0.9;
    limb(c, 0, hip, s2, 0, shade(o.pants, -0.25), 2.6);
    limb(c, 0, hip, s1, 0, o.pants, 2.6);
    c.fillStyle = '#2a1a0c'; c.fillRect(s1 - 1, -1.5, 3, 1.6); c.fillRect(s2 - 1, -1.5, 3, 1.6);
  } else if (mounted) {
    limb(c, 0.5, hip, 2.2, hip + 6.5, o.pants, 2.6);
  }
  // back arm
  limb(c, -1, sh + 1.5, -2.6 + (ph != null ? -Math.sin(ph) * 1.5 : 0), sh + 7, shade(o.armor || o.tunic, -0.3), 2.2);
  // body
  c.fillStyle = o.armor || o.tunic;
  if (o.robe || o.female) {
    c.beginPath(); c.moveTo(-3.3, sh); c.lineTo(3.3, sh); c.lineTo(o.robe ? 4.8 : 4.4, o.robe ? -0.5 : hip + 5); c.lineTo(o.robe ? -4.8 : -4.4, o.robe ? -0.5 : hip + 5); c.closePath(); c.fill();
  } else {
    c.beginPath(); c.moveTo(-3.4, sh); c.lineTo(3.4, sh); c.lineTo(3.1, hip + 1.5); c.lineTo(-3.1, hip + 1.5); c.closePath(); c.fill();
  }
  c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 0.7; c.stroke();
  if (o.armor && o.tunic) { // tabard in player colour
    c.fillStyle = o.tabard || o.tunic; c.beginPath(); c.moveTo(-1.8, sh + 1); c.lineTo(1.8, sh + 1); c.lineTo(2.2, hip + 2.5); c.lineTo(-2.2, hip + 2.5); c.closePath(); c.fill();
    if (o.tabard) { c.fillStyle = '#111'; c.fillRect(-0.4, sh + 2, 0.8, 5); c.fillRect(-1.6, sh + 3.5, 3.2, 0.8); }
  }
  if (!o.robe) { c.fillStyle = 'rgba(40,25,10,.8)'; c.fillRect(-3.2, hip - 0.5, 6.4, 1.2); }
  else { c.fillStyle = o.sash || '#e8c860'; c.fillRect(-3.4, hip - 2, 6.8, 1.2); }
  // head
  const hy = sh - 3.2;
  c.fillStyle = o.skin; c.beginPath(); c.arc(0.3, hy, 3.1, 0, 6.283); c.fill();
  c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(1.6, hy - 0.8, 0.9, 0.9);
  switch (o.helm) {
    case 'cap': c.fillStyle = o.helmCol || '#6a5a40'; c.beginPath(); c.arc(0.2, hy - 0.6, 3.3, Math.PI, 0); c.fill(); break;
    case 'kettle': c.fillStyle = '#9aa0a8'; c.beginPath(); c.arc(0.2, hy - 0.8, 3.3, Math.PI, 0); c.fill(); c.fillRect(-4.2, hy - 1.2, 8.8, 1.3); break;
    case 'full': c.fillStyle = '#a8aeb6'; c.beginPath(); c.arc(0.2, hy - 0.4, 3.5, Math.PI * 0.9, Math.PI * 2.1); c.fill(); c.fillRect(-3.2, hy - 1, 6.8, 3.8); c.fillStyle = '#222'; c.fillRect(1.2, hy - 0.6, 2.4, 0.9); break;
    case 'great': c.fillStyle = '#c0c6ce'; c.fillRect(-3.1, hy - 4, 6.6, 7.2); c.fillStyle = '#222'; c.fillRect(0.8, hy - 1.2, 2.8, 0.9); c.fillRect(2.2, hy - 1.2, 0.8, 3); if (o.plume) { c.fillStyle = o.tunic; c.beginPath(); c.ellipse(-1.5, hy - 5.5, 3.5, 1.8, -0.4, 0, 6.28); c.fill(); } break;
    case 'fur': c.fillStyle = '#6a4a2a'; c.beginPath(); c.arc(0.2, hy - 1, 3.6, Math.PI, 0); c.fill(); c.fillStyle = o.tunic; c.fillRect(-0.5, hy - 5, 1.5, 1.5); break;
    case 'hood': c.fillStyle = o.hoodCol || '#5a6a30'; c.beginPath(); c.arc(0, hy - 0.2, 3.6, Math.PI * 0.75, Math.PI * 2.05); c.lineTo(-3.5, hy + 3); c.fill(); break;
    case 'bald': c.fillStyle = 'rgba(0,0,0,.08)'; c.beginPath(); c.arc(0.3, hy - 1, 2.5, Math.PI, 0); c.fill(); break;
    case 'scarf': c.fillStyle = o.helmCol || '#e8dcc0'; c.beginPath(); c.arc(0.1, hy - 0.4, 3.5, Math.PI * 0.8, Math.PI * 2.05); c.lineTo(-3.6, hy + 3.5); c.fill(); break;
    default: c.fillStyle = o.hair || '#4a3018'; c.beginPath(); c.arc(0.1, hy - 0.9, 3.1, Math.PI * 0.95, Math.PI * 2.05); c.fill(); break;
  }
  // front arm + weapon
  const th = o.armAng != null ? o.armAng : 0.35;
  const sx = 1, sy = sh + 1.5, hx = sx + Math.sin(th) * 6, hy2 = sy + Math.cos(th) * 6;
  const w = o.weapon;
  if (o.shield) {
    c.fillStyle = o.shieldCol; c.beginPath(); c.ellipse(3.6, sh + 5, 2.6, 4.2, 0, 0, 6.28); c.fill();
    c.strokeStyle = '#e0c870'; c.lineWidth = 0.9; c.stroke();
  }
  const wa = th + (o.wOff != null ? o.wOff : 1.2), vx = Math.sin(wa), vy = Math.cos(wa);
  const drawW = () => {
    switch (w) {
      case 'sword': limb(c, hx, hy2, hx + vx * 8, hy2 + vy * 8, '#d8dce4', 1.4); limb(c, hx - vy * 1.8, hy2 + vx * 1.8, hx + vy * 1.8, hy2 - vx * 1.8, '#8a6a30', 1.2); break;
      case 'longsword': limb(c, hx, hy2, hx + vx * 10, hy2 + vy * 10, '#e4e8f0', 1.6); limb(c, hx - vy * 2, hy2 + vx * 2, hx + vy * 2, hy2 - vx * 2, '#c8a040', 1.3); break;
      case 'greatsword': limb(c, hx - vx * 2, hy2 - vy * 2, hx + vx * 12, hy2 + vy * 12, '#eef0f4', 2); limb(c, hx - vy * 2.5, hy2 + vx * 2.5, hx + vy * 2.5, hy2 - vx * 2.5, '#c8a040', 1.4); break;
      case 'club': limb(c, hx, hy2, hx + vx * 7, hy2 + vy * 7, '#6b4526', 2.4); break;
      case 'axe': case 'woodaxe': limb(c, hx - vx, hy2 - vy, hx + vx * 7, hy2 + vy * 7, '#6b4526', 1.4); c.fillStyle = '#c0c4cc'; c.beginPath(); c.moveTo(hx + vx * 5, hy2 + vy * 5); c.lineTo(hx + vx * 7 + vy * 3, hy2 + vy * 7 - vx * 3); c.lineTo(hx + vx * 8.5 + vy * 2, hy2 + vy * 8.5 - vx * 2); c.closePath(); c.fill(); break;
      case 'pick': limb(c, hx - vx, hy2 - vy, hx + vx * 7, hy2 + vy * 7, '#6b4526', 1.4); limb(c, hx + vx * 7 - vy * 3.5, hy2 + vy * 7 + vx * 3.5, hx + vx * 7 + vy * 3.5, hy2 + vy * 7 - vx * 3.5, '#9aa0a8', 1.4); break;
      case 'hammer': limb(c, hx, hy2, hx + vx * 5.5, hy2 + vy * 5.5, '#6b4526', 1.3); limb(c, hx + vx * 5.5 - vy * 1.8, hy2 + vy * 5.5 + vx * 1.8, hx + vx * 5.5 + vy * 1.8, hy2 + vy * 5.5 - vx * 1.8, '#666', 2.6); break;
      case 'hoe': limb(c, hx - vx * 3, hy2 - vy * 3, hx + vx * 9, hy2 + vy * 9, '#7a5530', 1.2); limb(c, hx + vx * 9, hy2 + vy * 9, hx + vx * 9 + vy * 2.5, hy2 + vy * 9 - vx * 2.5, '#999', 1.6); break;
      case 'knife': limb(c, hx, hy2, hx + vx * 4, hy2 + vy * 4, '#ccc', 1.2); break;
      case 'basket': c.fillStyle = '#a07838'; c.fillRect(hx - 2.5, hy2 - 1, 5, 3.5); c.fillStyle = '#c8284a'; c.fillRect(hx - 2, hy2 - 1.5, 1.5, 1.5); c.fillRect(hx, hy2 - 1.8, 1.5, 1.5); break;
      case 'spear': case 'pike': { const L = w === 'pike' ? 20 : 15; limb(c, hx - vx * 6, hy2 - vy * 6, hx + vx * L, hy2 + vy * L, '#7a5530', 1.3); c.fillStyle = '#d0d4dc'; c.beginPath(); c.moveTo(hx + vx * (L + 4), hy2 + vy * (L + 4)); c.lineTo(hx + vx * L - vy * 1.6, hy2 + vy * L + vx * 1.6); c.lineTo(hx + vx * L + vy * 1.6, hy2 + vy * L - vx * 1.6); c.fill(); break; }
      case 'javelin': limb(c, hx - vx * 5, hy2 - vy * 5, hx + vx * 8, hy2 + vy * 8, '#9a7a4a', 1.1); limb(c, hx + vx * 8, hy2 + vy * 8, hx + vx * 10, hy2 + vy * 10, '#ccc', 1.4); break;
      case 'staff': limb(c, hx, hy2 + 7, hx + 0.5, hy2 - 10, '#8a6a3a', 1.4); break;
      case 'bow': case 'longbow': {
        const R = w === 'longbow' ? 9.5 : 7, bx = hx + 1, by = hy2 - 1;
        c.strokeStyle = '#6b4526'; c.lineWidth = 1.5; c.beginPath(); c.arc(bx - R * 0.55, by, R, -1.1, 1.1); c.stroke();
        const ex = bx - R * 0.55 + Math.cos(1.1) * R, e1y = by - Math.sin(1.1) * R, e2y = by + Math.sin(1.1) * R;
        const pull = o.draw || 0;
        c.strokeStyle = 'rgba(240,240,220,.8)'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(ex, e1y); c.lineTo(ex - pull * 6, by); c.lineTo(ex, e2y); c.stroke();
        if (pull > 0.2) limb(c, ex - pull * 6, by, ex + 6, by, '#d8c8a0', 0.9);
        break;
      }
      case 'crossbow': limb(c, hx - 5, hy2 - 1, hx + 5, hy2 - 1, '#6b4526', 2); limb(c, hx + 4, hy2 - 5, hx + 4, hy2 + 3, '#555', 1.3); break;
    }
  };
  drawW();
  limb(c, sx, sy, hx, hy2, o.armor ? shade(o.armor, 0.1) : o.tunic, 2.2);
  c.fillStyle = o.skin; c.beginPath(); c.arc(hx, hy2, 1.2, 0, 6.28); c.fill();
  // carried goods
  if (o.carry) {
    const cy = sh - 1;
    switch (o.carry) {
      case 'wood': limb(c, -6, cy + 1, 4, cy - 2, '#7a5530', 3.2); c.fillStyle = '#d9b27a'; c.beginPath(); c.arc(4, cy - 2, 1.6, 0, 6.28); c.fill(); break;
      case 'gold': c.fillStyle = '#b89a50'; c.beginPath(); c.arc(-3.5, cy + 2, 3.2, 0, 6.28); c.fill(); c.fillStyle = '#f0c830'; c.beginPath(); c.arc(-3.5, cy + 0.8, 1.6, 0, 6.28); c.fill(); break;
      case 'stone': c.fillStyle = '#a4a09a'; c.fillRect(-6.5, cy - 1, 5, 4.5); c.strokeStyle = 'rgba(0,0,0,.4)'; c.lineWidth = 0.6; c.strokeRect(-6.5, cy - 1, 5, 4.5); break;
      case 'food': c.fillStyle = '#a07838'; c.fillRect(-6.5, cy, 5, 4); c.fillStyle = '#c84a3a'; c.beginPath(); c.arc(-4, cy, 1.8, 0, 6.28); c.fill(); break;
    }
  }
}

function drawHorse(c, coat, barding, ph, bardCol) {
  const legs = [[-6, 0], [-4, 1.5], [5, 0.7], [7, 2.2]];
  legs.forEach(([x, o], i) => {
    const s = ph != null ? Math.sin(ph + o * 1.7) * 3 : 0;
    const col = i % 2 ? shade(coat, -0.25) : coat;
    limb(c, x, -9, x + s, 0, col, 2.2);
    c.fillStyle = '#222'; c.fillRect(x + s - 1, -1.2, 2.2, 1.4);
  });
  // tail
  c.strokeStyle = shade(coat, -0.45); c.lineWidth = 2; c.beginPath(); c.moveTo(-9, -13); c.quadraticCurveTo(-13, -10, -12, -5); c.stroke();
  c.fillStyle = coat; c.beginPath(); c.ellipse(0, -12, 9.5, 4.6, 0, 0, 6.28); c.fill();
  c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 0.7; c.stroke();
  // neck & head
  c.beginPath(); c.moveTo(5, -15); c.lineTo(9.5, -22); c.lineTo(12.5, -21); c.lineTo(9, -11); c.closePath(); c.fill();
  c.beginPath(); c.ellipse(13, -20, 4.2, 2.2, 0.5, 0, 6.28); c.fill();
  c.fillStyle = shade(coat, -0.5); c.beginPath(); c.moveTo(8.5, -22.5); c.lineTo(6, -16); c.lineTo(7.5, -15.5); c.lineTo(10, -21.5); c.fill();
  c.fillStyle = '#111'; c.fillRect(12, -21.5, 1, 1);
  if (barding) {
    c.fillStyle = bardCol; c.beginPath(); c.ellipse(0, -12, 10.2, 5.2, 0, Math.PI * 1.02, Math.PI * 1.98, true); c.lineTo(-10, -9); c.lineTo(10, -9); c.fill();
    c.fillStyle = 'rgba(255,230,140,.8)'; c.fillRect(-10, -8.2, 20, 1);
  }
  c.fillStyle = '#5a2a14'; c.fillRect(-3, -17, 6, 2.2);
}

function unitAnim(u, T) {
  const walk = u.moving ? (u.walkT || 0) * 9 : null;
  let swing = -1;
  if (u.atkAnim > 0) swing = 1 - u.atkAnim / 0.5;
  else if (u.working) swing = (T * 1.6 + u.id * 0.37) % 1;
  return { walk, swing };
}

const TOOL_FOR = { wood: 'woodaxe', gold: 'pick', stone: 'pick', farm: 'hoe', berries: 'basket', build: 'hammer', repair: 'hammer', hunt: 'knife', sheep: 'knife' };

function drawUnitBody(c, u, T, colIdx) {
  const d = UNITS[u.type], pc = PCOL[colIdx != null ? colIdx : u.owner];
  const { walk, swing } = unitAnim(u, T);
  const skin = SKIN[u.id % 4];
  const g = d.gear || {};
  const swingAng = s => s < 0 ? null : s < 0.45 ? lerp(0.4, 2.7, s / 0.45) : lerp(2.7, 0.1, Math.min(1, (s - 0.45) / 0.3));
  switch (d.look) {
    case 'villager': {
      const fem = u.id % 3 === 0;
      const tool = u.working ? TOOL_FOR[u.task] : null;
      let arm = walk != null ? 0.35 + Math.sin(walk) * 0.35 : 0.3;
      if (tool && swing >= 0) arm = tool === 'basket' ? 0.9 + Math.sin(swing * 6.28) * 0.3 : tool === 'hoe' ? 0.8 + Math.sin(swing * 6.28) * 0.6 : swingAng(swing);
      if (!tool && swing >= 0 && u.atkAnim > 0) arm = swingAng(swing);
      drawHuman(c, { tunic: fem ? shade(pc.main, 0.25) : pc.main, pants: fem ? pc.dark : '#6a5438', skin, helm: fem ? 'scarf' : (u.id % 2 ? 'cap' : null), helmCol: fem ? '#ece0c4' : '#7a6444',
        female: fem, walk, armAng: arm, weapon: tool || (u.atkAnim > 0 ? 'knife' : null), wOff: tool === 'hoe' ? 0.4 : 1.2, carry: u.carryAmt > 0 && !u.working ? u.carryType : null });
      break;
    }
    case 'infantry': {
      let arm = walk != null ? 0.3 + Math.sin(walk) * 0.25 : 0.3;
      let wOff = 1.2;
      if (g.weapon === 'spear' || g.weapon === 'pike') { arm = swing >= 0 ? 0.9 + Math.sin(swing * Math.PI) * 0.7 : 0.9; wOff = 1.57 - arm + 0.05; }
      else if (g.weapon === 'axe' && d.range) { if (swing >= 0) arm = swingAng(swing); }
      else if (swing >= 0) arm = swingAng(swing);
      if (g.weapon === 'greatsword' && swing < 0) { wOff = 2.4; }
      drawHuman(c, { tunic: pc.main, tabard: g.tabard, pants: '#4a4038', skin, helm: g.helm, armor: g.armor, weapon: g.weapon, wOff, shield: g.shield, shieldCol: pc.main, walk, armAng: arm, plume: g.plume });
      break;
    }
    case 'archer': {
      const draw = swing >= 0 ? Math.min(1, swing * 2) * (swing < 0.8 ? 1 : 0) : 0;
      const bowish = g.weapon === 'bow' || g.weapon === 'longbow';
      let arm = bowish ? (swing >= 0 || !u.moving ? 1.45 : 0.5 + (walk != null ? Math.sin(walk) * 0.2 : 0)) : g.weapon === 'crossbow' ? 1.5 : (swing >= 0 ? swingAng(swing) : 0.4);
      drawHuman(c, { tunic: pc.main, pants: '#4a4038', skin, helm: g.hood ? 'hood' : g.helm, hoodCol: g.armor, armor: g.hood ? null : g.armor, weapon: g.weapon, wOff: g.weapon === 'javelin' ? 1.4 : 0, walk, armAng: arm, draw });
      break;
    }
    case 'cavalry': {
      const bob = walk != null ? Math.abs(Math.sin(walk * 0.5)) * 1.2 : 0;
      c.save(); c.translate(0, -bob);
      drawHorse(c, g.horse, g.barding, walk != null ? walk * 0.8 : null, pc.main);
      let arm = 0.4, wOff = 1.2;
      const bowish = g.weapon === 'bow';
      if (g.weapon === 'lance') { arm = swing >= 0 ? 0.9 + Math.sin(swing * Math.PI) * 0.6 : 0.9; wOff = 1.57 - arm - 0.05; }
      else if (bowish) arm = 1.45;
      else if (swing >= 0) arm = swingAng(swing);
      c.save(); c.translate(-1, 0);
      drawHuman(c, { tunic: pc.main, pants: '#4a4038', skin, helm: g.helm, armor: g.barding ? '#a8aeb6' : null, weapon: g.weapon === 'lance' ? 'pike' : g.weapon, wOff: bowish ? 0 : wOff, walk: null, armAng: arm, hipY: -15.5, plume: g.plume, draw: bowish && swing >= 0 ? Math.min(1, swing * 2) : 0 });
      c.restore(); c.restore();
      break;
    }
    case 'monk': {
      const arm = u.working ? 1.8 + Math.sin(T * 4) * 0.3 : walk != null ? 0.3 + Math.sin(walk) * 0.3 : 0.3;
      drawHuman(c, { tunic: '#8a5a2a', pants: '#6a4520', skin, helm: 'bald', robe: true, sash: pc.main, weapon: 'staff', walk, armAng: arm });
      if (u.working) { c.fillStyle = 'rgba(255,240,160,' + (0.3 + 0.2 * Math.sin(T * 6)) + ')'; c.beginPath(); c.arc(0, -26, 4, 0, 6.28); c.fill(); }
      break;
    }
    case 'ram': {
      const th = swing >= 0 ? Math.sin(swing * Math.PI) * 4 : 0;
      const roll = walk != null ? walk : 0;
      c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(0, 0, 16, 6, 0, 0, 6.28); c.fill();
      limb(c, -8 + th, -9, 17 + th, -9, '#5a3a1e', 4.5); c.fillStyle = '#555'; c.fillRect(15 + th, -12, 5, 6);
      c.fillStyle = '#7a5530'; c.beginPath(); c.moveTo(-13, -5); c.lineTo(13, -5); c.lineTo(11, -14); c.lineTo(-11, -14); c.fill();
      c.fillStyle = '#9a6a3a'; c.beginPath(); c.moveTo(-13, -13); c.lineTo(13, -13); c.lineTo(0, -24); c.fill();
      c.strokeStyle = 'rgba(0,0,0,.4)'; c.lineWidth = 0.8; c.stroke();
      c.fillStyle = pc.main; c.fillRect(-6, -18, 6, 3);
      for (let k = -1; k <= 1; k++) limb(c, -12 + k * 0.2, -13 + k * 3, 12, -13 + k * 3, 'rgba(0,0,0,.2)', 0.7);
      [-9, 9].forEach(x => { c.fillStyle = '#3a2412'; c.beginPath(); c.arc(x, -3.5, 3.6, 0, 6.28); c.fill(); c.strokeStyle = '#8a6a3a'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(x + Math.cos(roll) * 3, -3.5 + Math.sin(roll) * 3); c.lineTo(x - Math.cos(roll) * 3, -3.5 - Math.sin(roll) * 3); c.stroke(); });
      break;
    }
    case 'mangonel': case 'trebuchet': {
      const treb = d.look === 'trebuchet', k = treb ? 1.5 : 1;
      c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(0, 0, 14 * k, 5 * k, 0, 0, 6.28); c.fill();
      c.fillStyle = '#6b4526'; c.fillRect(-12 * k, -7, 24 * k, 4);
      [-8 * k, 8 * k].forEach(x => { c.fillStyle = '#3a2412'; c.beginPath(); c.arc(x, -3, 3.4, 0, 6.28); c.fill(); });
      limb(c, -4 * k, -6, 0, -16 * k, '#7a5530', 2.4); limb(c, 4 * k, -6, 0, -16 * k, '#5a3a1e', 2.4);
      const a = swing >= 0 ? lerp(-0.9, 1.3, Math.min(1, swing * 2.5)) : -0.9;
      const L = 14 * k, px = 0, py = -16 * k;
      const ex = px + Math.cos(Math.PI + a) * L, ey = py + Math.sin(Math.PI + a) * L;
      limb(c, px - (ex - px) * 0.4, py - (ey - py) * 0.4, ex, ey, '#8a5d34', 2);
      if (treb) { c.fillStyle = '#555'; c.fillRect(px - (ex - px) * 0.4 - 4, py - (ey - py) * 0.4 - 2, 8, 8); }
      else { c.fillStyle = '#5a3a1e'; c.beginPath(); c.arc(ex, ey, 2.8, 0, 6.28); c.fill(); }
      c.fillStyle = pc.main; c.fillRect(-10 * k, -9, 5, 3);
      break;
    }
    case 'sheep': {
      const ph = walk != null ? walk : 0;
      c.fillStyle = 'rgba(0,0,0,.2)'; c.beginPath(); c.ellipse(0, 0, 7, 3, 0, 0, 6.28); c.fill();
      [-3, 3].forEach((x, i) => limb(c, x, -4, x + Math.sin(ph + i * 3) * 1.5, 0, '#222', 1.5));
      c.fillStyle = '#f2f0e8'; [[-3, -6.5], [0, -7.5], [3, -6.5], [0, -5.5]].forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 3.2, 0, 6.28); c.fill(); });
      c.fillStyle = '#d8d4c8'; c.beginPath(); c.arc(-1, -5, 3, 0, 3.14); c.fill();
      c.fillStyle = '#2a2a2a'; c.beginPath(); c.ellipse(6, -7.5, 2.2, 1.6, 0.3, 0, 6.28); c.fill();
      if (u.owner > 0) { c.fillStyle = pc.main; c.fillRect(-1, -11.5, 3, 2); }
      break;
    }
    case 'deer': {
      const ph = walk != null ? walk * 1.2 : 0;
      c.fillStyle = 'rgba(0,0,0,.2)'; c.beginPath(); c.ellipse(0, 0, 8, 3, 0, 0, 6.28); c.fill();
      [-5, -3, 3, 5].forEach((x, i) => limb(c, x, -7, x + Math.sin(ph + i * 1.6) * 2, 0, '#6a4020', 1.2));
      c.fillStyle = '#a8703a'; c.beginPath(); c.ellipse(0, -9, 7, 3.2, 0, 0, 6.28); c.fill();
      c.fillStyle = '#f0e0c0'; c.beginPath(); c.ellipse(-6.5, -10, 1.5, 1.2, 0, 0, 6.28); c.fill();
      c.fillStyle = '#a8703a'; c.beginPath(); c.moveTo(4, -10); c.lineTo(7, -15); c.lineTo(9, -14); c.lineTo(6, -8); c.fill();
      c.beginPath(); c.ellipse(9, -15, 2.6, 1.6, 0.4, 0, 6.28); c.fill();
      c.strokeStyle = '#d8c8a0'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(8, -16.5); c.lineTo(7, -21); c.lineTo(5, -23); c.moveTo(7, -20); c.lineTo(9, -22.5); c.stroke();
      break;
    }
    case 'boar': {
      const ph = walk != null ? walk : 0;
      c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(0, 0, 8, 3.2, 0, 0, 6.28); c.fill();
      [-4, -2, 3, 5].forEach((x, i) => limb(c, x, -4, x + Math.sin(ph + i * 1.6) * 1.5, 0, '#2a1a10', 1.8));
      c.fillStyle = '#4a3222'; c.beginPath(); c.ellipse(0, -7, 7.5, 4.5, 0, 0, 6.28); c.fill();
      c.fillStyle = '#3a2418'; c.beginPath(); c.moveTo(-4, -11); c.lineTo(3, -12.5); c.lineTo(5, -10); c.fill();
      c.fillStyle = '#4a3222'; c.beginPath(); c.moveTo(5, -9); c.lineTo(10, -6); c.lineTo(9, -3.5); c.lineTo(4, -4); c.fill();
      c.strokeStyle = '#f0ead8'; c.lineWidth = 1; c.beginPath(); c.moveTo(9, -4.5); c.quadraticCurveTo(11, -6, 10.5, -8); c.stroke();
      break;
    }
  }
}

function drawCarcass(c, type) {
  c.fillStyle = 'rgba(120,10,10,.5)'; c.beginPath(); c.ellipse(0, 0, 8, 3.5, 0, 0, 6.28); c.fill();
  if (type === 'sheep') { c.fillStyle = '#e8e4d8'; c.beginPath(); c.ellipse(0, -2.5, 6.5, 3, 0, 0, 6.28); c.fill(); c.fillStyle = '#b84a3a'; c.fillRect(-2, -4, 4, 2); }
  else if (type === 'deer') { c.fillStyle = '#a8703a'; c.beginPath(); c.ellipse(0, -2.5, 7, 3, 0, 0, 6.28); c.fill(); c.fillStyle = '#c84a3a'; c.fillRect(-2, -4.5, 4, 2); }
  else { c.fillStyle = '#4a3222'; c.beginPath(); c.ellipse(0, -3, 7.5, 3.5, 0, 0, 6.28); c.fill(); c.fillStyle = '#c84a3a'; c.fillRect(-2, -5, 4, 2); }
}

// ---------- Icons ----------
function iconBg(c, w, h, top, bottom) {
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, top); g.addColorStop(1, bottom);
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.strokeStyle = 'rgba(255,230,170,.25)'; c.strokeRect(0.5, 0.5, w - 1, h - 1);
}
function unitIcon(type, owner = 1) {
  const k = 'u' + type + owner; if (SPR.icons[k]) return SPR.icons[k];
  const cv = makeCanvas(64, 60), c = cv.getContext('2d');
  iconBg(c, 64, 60, '#6a8ab0', '#2a3a50');
  const d = UNITS[type]; const big = ['cavalry', 'ram', 'mangonel', 'trebuchet'].includes(d.look);
  const sc = big ? 1.55 : 2.0;
  c.save(); c.translate(big ? 30 : 30, 55); c.scale(sc, sc);
  const fake = { id: 1, type, owner, moving: false, atkAnim: 0, face: 1, working: false };
  drawUnitBody(c, fake, 0);
  c.restore();
  return SPR.icons[k] = cv.toDataURL();
}
function buildingIcon(type, owner = 1) {
  const k = 'b' + type + owner; if (SPR.icons[k]) return SPR.icons[k];
  const cv = makeCanvas(64, 60), c = cv.getContext('2d');
  iconBg(c, 64, 60, '#8aa860', '#3a5028');
  const s = type === 'farm' ? getFarmSprite(4, true) : BUILDINGS[type].wall ? getWallSprite(type, owner, 5) : getBuildingSprite(type, owner, 0);
  const sc = Math.min(58 / s.cv.width, 54 / s.cv.height);
  c.drawImage(s.cv, 32 - s.cv.width * sc / 2, 57 - s.cv.height * sc, s.cv.width * sc, s.cv.height * sc);
  return SPR.icons[k] = cv.toDataURL();
}
function techIcon(key) {
  const k = 't' + key; if (SPR.icons[k]) return SPR.icons[k];
  const t = TECHS[key];
  if (t.upgrade) { // upgrade: show resulting unit with an arrow
    const img = new Image(); img.src = unitIcon(t.upgrade[1]);
    const cv = makeCanvas(64, 60), c = cv.getContext('2d');
    iconBg(c, 64, 60, '#b08a40', '#4a3410');
    const fake = { id: 1, type: t.upgrade[1], owner: 1, moving: false, atkAnim: 0, face: 1 };
    const big = UNITS[t.upgrade[1]].look === 'cavalry';
    c.save(); c.translate(32, 55); c.scale(big ? 1.5 : 1.9, big ? 1.5 : 1.9); drawUnitBody(c, fake, 0); c.restore();
    c.fillStyle = '#ffe890'; c.strokeStyle = '#3a2410'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(48, 20); c.lineTo(56, 10); c.lineTo(64, 20); c.lineTo(59, 20); c.lineTo(59, 28); c.lineTo(53, 28); c.lineTo(53, 20); c.closePath(); c.fill(); c.stroke();
    return SPR.icons[k] = cv.toDataURL();
  }
  const cv = makeCanvas(64, 60), c = cv.getContext('2d');
  const age = t.ageUp != null;
  iconBg(c, 64, 60, age ? '#d8b048' : '#9a6a3a', age ? '#6a4a10' : '#3a2410');
  c.font = '30px "Apple Color Emoji","Segoe UI Emoji",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(t.icon || '★', 32, 32);
  if (age) { c.fillStyle = '#fff4c8'; c.font = 'bold 11px Cinzel, Georgia, serif'; c.fillText(['I', 'II', 'III', 'IV'][t.ageUp], 52, 50); }
  return SPR.icons[k] = cv.toDataURL();
}
function cmdIcon(name) {
  const k = 'c' + name; if (SPR.icons[k]) return SPR.icons[k];
  const cv = makeCanvas(64, 60), c = cv.getContext('2d');
  iconBg(c, 64, 60, '#7a6a5a', '#2a2018');
  c.strokeStyle = '#f0e0b0'; c.fillStyle = '#f0e0b0'; c.lineWidth = 4; c.lineCap = 'round'; c.lineJoin = 'round';
  switch (name) {
    case 'stop': c.fillStyle = '#c83a2a'; c.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283 + 0.39; c.lineTo(32 + Math.cos(a) * 18, 30 + Math.sin(a) * 18); } c.fill(); c.fillStyle = '#fff'; c.fillRect(20, 27, 24, 6); break;
    case 'delete': c.strokeStyle = '#e04030'; c.lineWidth = 6; c.beginPath(); c.moveTo(18, 16); c.lineTo(46, 44); c.moveTo(46, 16); c.lineTo(18, 44); c.stroke(); break;
    case 'amove': c.beginPath(); c.moveTo(16, 44); c.lineTo(42, 18); c.stroke(); c.beginPath(); c.moveTo(34, 16); c.lineTo(44, 16); c.lineTo(44, 26); c.stroke(); c.lineWidth = 3; c.beginPath(); c.moveTo(20, 30); c.lineTo(30, 40); c.stroke(); break;
    case 'garrison': c.beginPath(); c.moveTo(16, 46); c.lineTo(16, 24); c.lineTo(32, 12); c.lineTo(48, 24); c.lineTo(48, 46); c.closePath(); c.stroke(); c.fillRect(27, 32, 10, 14); break;
    case 'ungarrison': c.beginPath(); c.moveTo(12, 46); c.lineTo(12, 24); c.lineTo(26, 13); c.lineTo(40, 24); c.lineTo(40, 30); c.stroke(); c.beginPath(); c.moveTo(30, 40); c.lineTo(54, 40); c.moveTo(46, 32); c.lineTo(54, 40); c.lineTo(46, 48); c.stroke(); break;
    case 'bell': c.beginPath(); c.moveTo(20, 40); c.quadraticCurveTo(20, 14, 32, 14); c.quadraticCurveTo(44, 14, 44, 40); c.closePath(); c.fill(); c.fillRect(16, 38, 32, 4); c.beginPath(); c.arc(32, 46, 4, 0, 6.28); c.fill(); break;
    case 'allclear': c.beginPath(); c.moveTo(16, 30); c.lineTo(27, 42); c.lineTo(48, 18); c.stroke(); break;
    case 'eco': c.font = '30px "Apple Color Emoji",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('🏠', 32, 30); break;
    case 'mil': c.font = '30px "Apple Color Emoji",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('⚔️', 32, 30); break;
    case 'back': c.beginPath(); c.moveTo(40, 14); c.lineTo(22, 30); c.lineTo(40, 46); c.stroke(); break;
    case 'repair': c.font = '30px "Apple Color Emoji",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('🔧', 32, 30); break;
    case 'reseed': c.font = '28px "Apple Color Emoji",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('🌱', 32, 30); break;
  }
  return SPR.icons[k] = cv.toDataURL();
}
function resIcon(r) {
  const k = 'r' + r; if (SPR.icons[k]) return SPR.icons[k];
  const cv = makeCanvas(32, 32), c = cv.getContext('2d');
  switch (r) {
    case 'food': c.fillStyle = '#b83a2a'; c.beginPath(); c.ellipse(14, 17, 10, 8, -0.5, 0, 6.28); c.fill(); c.fillStyle = '#e86a4a'; c.beginPath(); c.ellipse(12, 15, 5, 3.5, -0.5, 0, 6.28); c.fill();
      c.strokeStyle = '#f0e8d8'; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath(); c.moveTo(21, 22); c.lineTo(28, 28); c.stroke(); c.fillStyle = '#f0e8d8'; c.beginPath(); c.arc(28.5, 26, 2.5, 0, 6.28); c.arc(26, 29, 2.5, 0, 6.28); c.fill(); break;
    case 'wood':
      [[4, 18], [16, 18], [10, 9]].forEach(([x, y]) => { c.fillStyle = '#7a5028'; c.fillRect(x - 2, y - 5, 16, 10); c.fillStyle = '#d8b078'; c.beginPath(); c.ellipse(x + 14, y, 4, 5, 0, 0, 6.28); c.fill(); c.strokeStyle = '#8a6030'; c.lineWidth = 1; c.beginPath(); c.arc(x + 14, y, 2, 0, 6.28); c.stroke(); }); break;
    case 'gold': [[9, 20, 7], [20, 21, 7], [15, 12, 7]].forEach(([x, y, rr]) => { c.fillStyle = '#c89a20'; c.beginPath(); c.arc(x, y, rr, 0, 6.28); c.fill(); c.fillStyle = '#ffe070'; c.beginPath(); c.arc(x - 2, y - 2, rr * 0.5, 0, 6.28); c.fill(); }); break;
    case 'stone': [[8, 20, 7], [20, 22, 7], [14, 11, 7]].forEach(([x, y, rr]) => { c.fillStyle = '#8a8680'; c.beginPath(); c.moveTo(x - rr, y + 3); c.lineTo(x - rr * 0.5, y - rr); c.lineTo(x + rr, y - rr * 0.4); c.lineTo(x + rr * 0.7, y + rr * 0.6); c.fill(); c.fillStyle = '#c8c4bc'; c.beginPath(); c.moveTo(x - rr * 0.5, y - rr); c.lineTo(x + rr, y - rr * 0.4); c.lineTo(x, y); c.fill(); }); break;
    case 'pop': c.fillStyle = '#e8b88a'; c.beginPath(); c.arc(16, 9, 5.5, 0, 6.28); c.fill(); c.fillStyle = '#5a88d8'; c.beginPath(); c.moveTo(7, 30); c.quadraticCurveTo(7, 15, 16, 15); c.quadraticCurveTo(25, 15, 25, 30); c.fill(); break;
  }
  return SPR.icons[k] = cv.toDataURL();
}

function makeCursors() {
  const mk = (fn, hx, hy) => { const cv = makeCanvas(32, 32), c = cv.getContext('2d'); fn(c); return `url(${cv.toDataURL()}) ${hx} ${hy}, auto`; };
  const gaunt = c => { c.fillStyle = '#d8c080'; c.strokeStyle = '#2a1a08'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(2, 2); c.lineTo(14, 22); c.lineTo(16, 15); c.lineTo(25, 24); c.lineTo(28, 21); c.lineTo(19, 12); c.lineTo(25, 10); c.closePath(); c.fill(); c.stroke(); };
  const sword = c => { c.strokeStyle = '#2a1a08'; c.lineWidth = 4; c.beginPath(); c.moveTo(3, 3); c.lineTo(24, 24); c.stroke(); c.strokeStyle = '#e8ecf0'; c.lineWidth = 2; c.beginPath(); c.moveTo(3, 3); c.lineTo(22, 22); c.stroke(); c.strokeStyle = '#c89a30'; c.lineWidth = 3; c.beginPath(); c.moveTo(16, 26); c.lineTo(26, 16); c.moveTo(24, 24); c.lineTo(29, 29); c.stroke(); };
  const axe = c => { c.strokeStyle = '#5a3a1e'; c.lineWidth = 3; c.beginPath(); c.moveTo(6, 28); c.lineTo(22, 6); c.stroke(); c.fillStyle = '#c8ccd4'; c.strokeStyle = '#222'; c.lineWidth = 1; c.beginPath(); c.moveTo(16, 6); c.lineTo(28, 4); c.lineTo(26, 16); c.closePath(); c.fill(); c.stroke(); };
  const hammer = c => { c.strokeStyle = '#5a3a1e'; c.lineWidth = 3; c.beginPath(); c.moveTo(6, 28); c.lineTo(20, 10); c.stroke(); c.fillStyle = '#888'; c.strokeStyle = '#222'; c.lineWidth = 1; c.save(); c.translate(21, 9); c.rotate(0.9); c.fillRect(-8, -4, 16, 8); c.strokeRect(-8, -4, 16, 8); c.restore(); };
  const hand = c => { c.fillStyle = '#e8c8a0'; c.strokeStyle = '#2a1a08'; c.lineWidth = 1.3; c.beginPath(); c.moveTo(10, 4); c.lineTo(14, 4); c.lineTo(14, 13); c.lineTo(24, 14); c.lineTo(24, 26); c.lineTo(12, 28); c.lineTo(6, 20); c.lineTo(10, 18); c.closePath(); c.fill(); c.stroke(); };
  const garr = c => { c.fillStyle = '#d8c080'; c.strokeStyle = '#2a1a08'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(4, 28); c.lineTo(4, 12); c.lineTo(16, 3); c.lineTo(28, 12); c.lineTo(28, 28); c.closePath(); c.fill(); c.stroke(); c.fillStyle = '#2a1a08'; c.fillRect(13, 18, 6, 10); };
  return { default: mk(gaunt, 2, 2), attack: mk(sword, 3, 3), gather: mk(axe, 6, 6), build: mk(hammer, 6, 6), hand: mk(hand, 12, 4), garrison: mk(garr, 16, 16) };
}
