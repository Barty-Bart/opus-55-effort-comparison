'use strict';
// ---------- Rendering ----------
const RD = { cv: null, c: null, W: 0, H: 0, dpr: 1, mm: null, mc: null, fog: null, fogC: null, fogImg: null, resMini: null, mmT: 0 };

function initRender() {
  RD.cv = document.getElementById('view'); RD.c = RD.cv.getContext('2d');
  RD.mm = document.getElementById('minimap'); RD.mc = RD.mm.getContext('2d');
  window.addEventListener('resize', resizeView);
  resizeView();
}
function resizeView() {
  RD.dpr = Math.min(2, window.devicePixelRatio || 1);
  RD.W = window.innerWidth; RD.H = window.innerHeight;
  RD.cv.width = RD.W * RD.dpr; RD.cv.height = RD.H * RD.dpr;
  RD.mm.width = 240 * RD.dpr; RD.mm.height = 124 * RD.dpr;
}
function initFogCanvas() {
  const N = G.map.N;
  RD.fog = makeCanvas(N + 2, N + 2); RD.fogC = RD.fog.getContext('2d'); RD.fogImg = RD.fogC.createImageData(N + 2, N + 2);
  for (let k = 0; k < (N + 2) * (N + 2); k++) RD.fogImg.data[k * 4 + 3] = 255;
  buildResMini();
}
function refreshFogCanvas() {
  const N = G.map.N, d = RD.fogImg.data, vis = G.fog.vis, exp = G.fog.explored;
  const W = N + 2;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = j * N + i; d[((j + 1) * W + i + 1) * 4 + 3] = vis[k] ? 0 : exp[k] ? 115 : 255; }
  RD.fogC.putImageData(RD.fogImg, 0, 0);
}
function buildResMini() {
  const N = G.map.N;
  if (!RD.resMini) RD.resMini = makeCanvas(N, N);
  const c = RD.resMini.getContext('2d'); c.clearRect(0, 0, N, N);
  for (const r of G.resources) {
    if (r.dead || r.type === 'carcass') continue;
    c.fillStyle = r.type === 'tree' ? '#1f4a18' : r.type === 'gold' ? '#f0d040' : r.type === 'stone' ? '#b8b8b0' : '#d05080';
    c.fillRect(r.tx, r.ty, 1, 1);
  }
  G.minimapDirty = false;
}

// camera: cam.x/cam.y are iso-pixel coordinates of the screen centre
function screenToIso(sx, sy) { const z = G.cam.zoom; return [G.cam.x + (sx - RD.W / 2) / z, G.cam.y + (sy - RD.H / 2) / z]; }
function screenToWorld(sx, sy) { const p = screenToIso(sx, sy); return isoToWorld(p[0], p[1]); }
function worldToScreen(x, y) { const z = G.cam.zoom; return [(isoX(x, y) - G.cam.x) * z + RD.W / 2, (isoY(x, y) - G.cam.y) * z + RD.H / 2]; }
function centerOn(x, y) { G.cam.x = isoX(x, y); G.cam.y = isoY(x, y) + 40 / G.cam.zoom; clampCam(); }
function clampCam() {
  const N = G.map.N;
  G.cam.x = clamp(G.cam.x, -N * HW, N * HW);
  G.cam.y = clamp(G.cam.y, 0, N * HH * 2 + 120);
}

function styleOf(owner) { return owner > 0 && PL(owner).age >= 2 ? 1 : 0; }

function render(realT) {
  const c = RD.c, z = G.cam.zoom, dpr = RD.dpr, T = G.time;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.fillStyle = '#0b0806'; c.fillRect(0, 0, RD.W, RD.H);
  c.setTransform(dpr * z, 0, 0, dpr * z, dpr * (RD.W / 2 - G.cam.x * z), dpr * (RD.H / 2 - G.cam.y * z));
  const v = G.view = { x0: G.cam.x - RD.W / 2 / z, y0: G.cam.y - RD.H / 2 / z, x1: G.cam.x + RD.W / 2 / z, y1: G.cam.y + RD.H / 2 / z };
  const map = G.map, N = map.N;

  // terrain
  c.save();
  c.imageSmoothingEnabled = true;
  c.transform(HW / map.R, HH / map.R, -HW / map.R, HH / map.R, 0, 0);
  c.drawImage(map.tex, 0, 0);
  c.restore();

  // visible tile bounds
  const corners = [isoToWorld(v.x0, v.y0), isoToWorld(v.x1, v.y0), isoToWorld(v.x0, v.y1), isoToWorld(v.x1, v.y1)];
  const ti0 = clamp(Math.floor(Math.min(...corners.map(p => p[0]))) - 2, 0, N - 1), ti1 = clamp(Math.ceil(Math.max(...corners.map(p => p[0]))) + 2, 0, N - 1);
  const tj0 = clamp(Math.floor(Math.min(...corners.map(p => p[1]))) - 2, 0, N - 1), tj1 = clamp(Math.ceil(Math.max(...corners.map(p => p[1]))) + 2, 0, N - 1);
  const inView = (px, py, top = 160, side = 90) => px > v.x0 - side && px < v.x1 + side && py > v.y0 - 30 && py < v.y1 + top;

  // water shimmer
  c.lineWidth = 1.2;
  for (let j = tj0; j <= tj1; j++) for (let i = ti0; i <= ti1; i++) {
    const k = j * N + i; if (!map.water[k] || !G.fog.explored[k]) continue;
    const h = ((i * 73856093) ^ (j * 19349663)) & 1023;
    const ph = realT * 0.0011 + h * 0.01;
    const a = Math.pow(Math.max(0, Math.sin(ph * 3.1)), 6) * 0.45;
    if (a < 0.02) continue;
    const px = isoX(i + 0.5, j + 0.5) + ((h & 15) - 8) * 1.5, py = isoY(i + 0.5, j + 0.5) + (((h >> 4) & 7) - 4);
    c.strokeStyle = 'rgba(220,240,255,' + a + ')';
    c.beginPath(); c.moveTo(px - 6, py); c.lineTo(px + 6, py); c.stroke();
  }

  // flat layer: decals, farms, foundations, selection footprints
  for (const d of G.decals) {
    const px = isoX(d.x, d.y), py = isoY(d.x, d.y);
    if (!inView(px, py) || !tileExplored(Math.floor(d.x), Math.floor(d.y))) continue;
    const fade = Math.min(1, (d.life - d.t) / 5);
    c.globalAlpha = fade;
    if (d.type === 'stump') c.drawImage(SPR.stump.cv, px - SPR.stump.ax, py - SPR.stump.ay);
    else if (d.type === 'rubble') drawRubble(c, d, px, py);
    else if (d.type === 'arrow') { c.strokeStyle = '#5a3a1e'; c.lineWidth = 1; c.beginPath(); c.moveTo(px, py); c.lineTo(px - 3, py - 5); c.stroke(); }
    else if (d.type === 'corpse' && (d.owner === 1 || tileVisible(d.x, d.y) || G.revealAll)) drawCorpse(c, d, px, py, T);
    c.globalAlpha = 1;
  }
  const selSet = new Set(G.sel);
  for (const b of G.buildings) {
    const px = isoX(b.tx, b.ty), py = isoY(b.tx, b.ty);
    if (!inView(px, py, 200, 200)) continue;
    if (b.owner !== 1 && !G.revealAll && !tileExplored(Math.floor(b.x), Math.floor(b.y))) continue;
    if (b.type === 'farm') {
      const st = b.built ? clamp(Math.ceil(b.amount / (BUILDINGS.farm.food + PL(b.owner).mods.farmFood) * 4), 1, 4) : 0;
      const s = getFarmSprite(b.built ? st : 0, b.built);
      if (!b.built) c.globalAlpha = 0.5 + 0.5 * b.progress;
      c.drawImage(s.cv, px - s.ax, py - s.ay); c.globalAlpha = 1;
    } else if (!b.built) { const s = getFoundationSprite(b.w); c.drawImage(s.cv, px - s.ax, py - s.ay); }
    if (selSet.has(b.id)) drawFootprint(c, b.tx, b.ty, b.w, b.h, b.owner === 1 ? 'rgba(255,255,255,0.9)' : b.owner === 0 ? '#ddd' : 'rgba(255,90,70,0.9)');
  }
  // resources selection ring
  for (const id of G.sel) { const r = getEnt(id); if (r && r.kind === 'resource') drawFootprint(c, r.type === 'carcass' ? r.x - 0.4 : r.tx, r.type === 'carcass' ? r.y - 0.4 : r.ty, r.type === 'carcass' ? 0.8 : 1, r.type === 'carcass' ? 0.8 : 1, '#fff'); }

  // sorted objects
  const list = [];
  for (const r of G.resources) {
    const px = isoX(r.x, r.y), py = isoY(r.x, r.y);
    if (!inView(px, py, 100) || (!G.revealAll && !G.fog.explored[r.ty * N + r.tx])) continue;
    list.push({ k: r.x + r.y, e: r, px, py });
  }
  for (const b of G.buildings) {
    if (b.type === 'farm') continue;
    const px = isoX(b.tx, b.ty), py = isoY(b.tx, b.ty);
    if (!inView(px, py, 260, 220)) continue;
    if (b.owner !== 1 && !G.revealAll && !tileExplored(Math.floor(b.x), Math.floor(b.y))) continue;
    list.push({ k: b.x + b.y, e: b, px, py });
  }
  for (const u of G.units) {
    if (u.garrisonedIn) continue;
    const px = isoX(u.x, u.y), py = isoY(u.x, u.y);
    if (!inView(px, py, 60)) continue;
    if (u.owner !== 1 && !G.revealAll && !tileVisible(u.x, u.y)) continue;
    list.push({ k: u.x + u.y, e: u, px, py });
  }
  list.sort((a, b) => a.k - b.k);
  for (const it of list) {
    const e = it.e, px = it.px, py = it.py;
    if (e.kind === 'resource') drawResource(c, e, px, py);
    else if (e.kind === 'building') drawBuilding(c, e, px, py, T);
    else drawUnit(c, e, px, py, T, selSet.has(e.id));
  }

  // projectiles
  for (const p of G.proj) {
    const t = p.t / p.dur;
    const pos = t2 => { const x = lerp(p.x0, p.x1, t2), y = lerp(p.y0, p.y1, t2), zz = lerp(p.z0, p.z1, t2) + p.arc * 4 * t2 * (1 - t2); return [isoX(x, y), isoY(x, y) - zz, isoX(x, y), isoY(x, y)]; };
    const a = pos(t), b = pos(Math.min(1, t + 0.04));
    if (!inView(a[0], a[1])) continue;
    const mx = p.x0 + (p.x1 - p.x0) * t, my = p.y0 + (p.y1 - p.y0) * t;
    if (!G.revealAll && !tileVisible(mx, my)) continue;
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    c.fillStyle = 'rgba(0,0,0,.2)'; c.beginPath(); c.arc(a[2], a[3], p.kind === 'rock' || p.kind === 'boulder' ? 3 : 1.2, 0, 6.28); c.fill();
    c.save(); c.translate(a[0], a[1]); c.rotate(ang);
    switch (p.kind) {
      case 'arrow': case 'bolt': c.strokeStyle = '#3a2a1a'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-7, 0); c.lineTo(3, 0); c.stroke(); c.fillStyle = '#ccc'; c.beginPath(); c.moveTo(5, 0); c.lineTo(2, -1.8); c.lineTo(2, 1.8); c.fill(); c.strokeStyle = '#eee'; c.beginPath(); c.moveTo(-7, 0); c.lineTo(-9, -2); c.moveTo(-7, 0); c.lineTo(-9, 2); c.stroke(); break;
      case 'javelin': c.strokeStyle = '#8a6a3a'; c.lineWidth = 1.3; c.beginPath(); c.moveTo(-8, 0); c.lineTo(5, 0); c.stroke(); c.fillStyle = '#ccc'; c.beginPath(); c.moveTo(8, 0); c.lineTo(4, -1.5); c.lineTo(4, 1.5); c.fill(); break;
      case 'axe': c.rotate(realT * 0.03); c.strokeStyle = '#6b4526'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-4, 0); c.lineTo(4, 0); c.stroke(); c.fillStyle = '#ccc'; c.fillRect(2, -3, 3, 4); break;
      case 'rock': c.fillStyle = '#5a5550'; c.beginPath(); c.arc(0, 0, 3.2, 0, 6.28); c.fill(); break;
      case 'boulder': c.fillStyle = '#6a655e'; c.beginPath(); c.arc(0, 0, 5, 0, 6.28); c.fill(); c.fillStyle = 'rgba(255,255,255,.2)'; c.beginPath(); c.arc(-1.5, -1.5, 2, 0, 6.28); c.fill(); break;
    }
    c.restore();
  }
  // particles
  for (const f of G.fx) {
    const px = isoX(f.x, f.y), py = isoY(f.x, f.y) - (f.z || 0);
    if (!inView(px, py)) continue;
    if (!G.revealAll && !tileExplored(Math.floor(f.x), Math.floor(f.y))) continue;
    const t = f.t / f.life;
    switch (f.type) {
      case 'dust': c.fillStyle = 'rgba(150,130,100,' + (0.5 * (1 - t)) + ')'; c.beginPath(); c.arc(px, py, f.size * (0.6 + t), 0, 6.28); c.fill(); break;
      case 'smoke': c.fillStyle = 'rgba(90,90,90,' + (0.4 * (1 - t)) + ')'; c.beginPath(); c.arc(px, py, f.size * (1 + t * 2.5), 0, 6.28); c.fill(); break;
      case 'fire': {
        c.globalCompositeOperation = 'lighter';
        c.fillStyle = 'rgba(255,' + (160 - t * 120 | 0) + ',40,' + (0.7 * (1 - t)) + ')'; c.beginPath(); c.arc(px, py, f.size * (1 - t * 0.5), 0, 6.28); c.fill();
        c.globalCompositeOperation = 'source-over';
        if (t > 0.5) { c.fillStyle = 'rgba(60,60,60,' + (0.3 * (1 - t)) + ')'; c.beginPath(); c.arc(px, py - 6, f.size * 1.4, 0, 6.28); c.fill(); }
        break;
      }
      case 'blood': c.fillStyle = 'rgba(170,20,20,' + (1 - t) + ')'; for (let k = 0; k < 3; k++) { c.beginPath(); c.arc(px + (k - 1) * 2.5 * (1 + t * 2), py - 4 + t * 8, 1.2, 0, 6.28); c.fill(); } break;
      case 'spark': c.fillStyle = f.col || '#fff'; c.globalAlpha = 1 - t; c.beginPath(); c.arc(px, py, 1.6, 0, 6.28); c.fill(); c.globalAlpha = 1; break;
      case 'ring': c.strokeStyle = f.col || '#fff'; c.globalAlpha = 1 - t; c.lineWidth = 2; c.beginPath(); c.ellipse(px, py, 6 + t * 26, 3 + t * 13, 0, 0, 6.28); c.stroke(); c.globalAlpha = 1; break;
      case 'order': { c.strokeStyle = f.col || '#7fff60'; c.globalAlpha = 1 - t; c.lineWidth = 1.6; const s = 9 * (1 - t * 0.6); c.beginPath(); c.ellipse(px, py, s, s / 2, 0, 0, 6.28); c.stroke(); c.globalAlpha = 1; break; }
    }
  }

  // fog
  if (!G.revealAll) {
    c.save(); c.imageSmoothingEnabled = true;
    c.transform(HW, HH, -HW, HH, 0, 0);
    c.drawImage(RD.fog, -1, -1);
    c.restore();
  }

  // overlays: health bars, rally points
  for (const it of list) {
    const e = it.e;
    if (e.kind === 'resource') continue;
    const sel = selSet.has(e.id);
    const hurt = e.kind === 'unit' && e.hp < e.maxHp && G.time - e.lastHit < 3;
    if (!sel && !hurt && !(e.kind === 'building' && !e.built && e.owner === 1 && e.progress > 0)) continue;
    if (e.kind === 'unit') drawBar(c, it.px, it.py - unitHeight(e) - 5, 22, e.hp / e.maxHp, e.owner);
    else { const s = e.w; drawBar(c, isoX(e.x, e.y), isoY(e.tx, e.ty) - buildingHeight(e) + 6, 16 + s * 12, e.built ? e.hp / e.maxHp : e.progress, e.owner, !e.built); }
  }
  for (const id of G.sel) {
    const b = getEnt(id);
    if (!b || b.kind !== 'building' || b.owner !== 1 || !b.rally) continue;
    const bx = isoX(b.x, b.y), by = isoY(b.x, b.y), rx = isoX(b.rally.x, b.rally.y), ry = isoY(b.rally.x, b.rally.y);
    c.setLineDash([4, 4]); c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 1; c.beginPath(); c.moveTo(bx, by); c.lineTo(rx, ry); c.stroke(); c.setLineDash([]);
    c.strokeStyle = '#3a2a1a'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(rx, ry); c.lineTo(rx, ry - 20); c.stroke();
    const wv = Math.sin(realT * 0.006) * 1.5;
    c.fillStyle = PCOL[1].main; c.beginPath(); c.moveTo(rx, ry - 20); c.lineTo(rx + 11, ry - 17 + wv); c.lineTo(rx, ry - 13); c.fill();
  }
  // placement ghost
  if (UI.place) drawPlacement(c);

  // screen-space overlays
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (UI.drag && UI.drag.active) {
    const d = UI.drag;
    c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 1; c.fillStyle = 'rgba(255,255,255,.08)';
    const x = Math.min(d.x0, d.x1), y = Math.min(d.y0, d.y1), w = Math.abs(d.x1 - d.x0), h = Math.abs(d.y1 - d.y0);
    c.fillRect(x, y, w, h); c.strokeRect(x + 0.5, y + 0.5, w, h);
  }
  // minimap
  RD.mmT -= 1; if (RD.mmT <= 0) { RD.mmT = 6; drawMinimap(realT); }
}

const US = 1.3; // unit draw scale
function unitHeight(u) { const l = UNITS[u.type].look; return US * (l === 'cavalry' ? 30 : l === 'trebuchet' ? 34 : l === 'sheep' || l === 'boar' ? 12 : l === 'deer' ? 20 : l === 'ram' || l === 'mangonel' ? 24 : 24); }
function buildingHeight(b) { return { town_center: 118, house: 50, mill: 70, barracks: 56, castle: 108, watch_tower: 86, monastery: 100, wonder: 150, blacksmith: 68, archery_range: 46, stable: 48, siege_workshop: 54, market: 34, lumber_camp: 40, mining_camp: 40, palisade: 26, stone_wall: 30, farm: 2 }[b.type] || 40; }

function drawBar(c, x, y, w, f, owner, prog) {
  c.fillStyle = 'rgba(0,0,0,.7)'; c.fillRect(x - w / 2 - 1, y - 1, w + 2, 5);
  c.fillStyle = prog ? '#e8c860' : f > 0.5 ? (owner === 1 ? '#5fd84a' : owner === 2 ? '#e84a3a' : '#ddd') : f > 0.25 ? '#e8b030' : '#e03020';
  c.fillRect(x - w / 2, y, w * clamp(f, 0, 1), 3);
}
function drawFootprint(c, tx, ty, w, h, col) {
  c.strokeStyle = col; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(isoX(tx, ty), isoY(tx, ty)); c.lineTo(isoX(tx + w, ty), isoY(tx + w, ty)); c.lineTo(isoX(tx + w, ty + h), isoY(tx + w, ty + h)); c.lineTo(isoX(tx, ty + h), isoY(tx, ty + h)); c.closePath(); c.stroke();
}
function drawRubble(c, d, px, py) {
  const s = d.size;
  c.fillStyle = 'rgba(70,60,45,.16)'; c.beginPath(); c.ellipse(px, py, s * 20, s * 10, 0, 0, 6.28); c.fill();
  for (let k = 0; k < s * 14; k++) {
    const h = (k * 2654435761 + (d.x * 1000 | 0)) >>> 0;
    const ox = ((h & 255) / 255 - 0.5) * s * 36, oy = (((h >> 8) & 255) / 255 - 0.5) * s * 16;
    c.fillStyle = ['#8a847a', '#6a5a48', '#a09a8e', '#5a3a1e'][(h >> 16) & 3]; c.fillRect(px + ox, py + oy, 2 + ((h >> 20) & 3), 1.5 + ((h >> 22) & 1));
  }
}
function drawCorpse(c, d, px, py, T) {
  c.save(); c.translate(px, py);
  c.fillStyle = 'rgba(110,10,10,.45)'; c.beginPath(); c.ellipse(2, 0, 8, 3.5, 0, 0, 6.28); c.fill();
  if (d.face < 0) c.scale(-1, 1);
  c.rotate(-1.35); c.scale(0.9 * US, 0.9 * US);
  const fake = { id: d.id, type: d.ut, owner: d.owner, moving: false, atkAnim: 0, face: 1, working: false };
  drawUnitBody(c, fake, T);
  c.restore();
}
function drawResource(c, r, px, py) {
  if (r.type === 'tree') { const s = SPR.trees[r.variant]; c.drawImage(s.cv, px - s.ax, py - s.ay); return; }
  if (r.type === 'gold' || r.type === 'stone') {
    const s = SPR.res[r.type], f = 0.65 + 0.35 * r.amount / r.max;
    c.drawImage(s.cv, px - s.ax * f, py - s.ay * f + 4 * (1 - f), s.cv.width * f, s.cv.height * f); return;
  }
  if (r.type === 'berries') { const s = SPR.res.berries[clamp(Math.ceil(r.amount / r.max * 3), 0, 3)]; c.drawImage(s.cv, px - s.ax, py - s.ay); return; }
  if (r.type === 'carcass') { c.save(); c.translate(px, py); if (r.face < 0) c.scale(-1, 1); drawCarcass(c, r.src); c.restore(); }
}
function drawBuilding(c, b, px, py, T) {
  const d = BUILDINGS[b.type];
  const s = d.wall ? getWallSprite(b.type, b.owner, b.wallMask || 0) : getBuildingSprite(b.type, b.owner, styleOf(b.owner));
  const x = px - s.ax, y = py - s.ay;
  if (!b.built) {
    if (b.progress <= 0.001) return;
    const h = s.cv.height, reveal = h * (0.12 + 0.88 * b.progress);
    c.save(); c.globalAlpha = 0.92;
    c.beginPath(); c.rect(x - 2, y + h - reveal, s.cv.width + 4, reveal + 2); c.clip();
    c.drawImage(s.cv, x, y);
    c.restore();
    // scaffolding
    c.strokeStyle = 'rgba(110,75,40,.9)'; c.lineWidth = 1.2;
    const top = y + h - reveal;
    const pts = [[b.tx, b.ty + b.h], [b.tx + b.w, b.ty + b.h], [b.tx + b.w, b.ty]];
    for (const [ix, iy] of pts) { const qx = isoX(ix, iy), qy = isoY(ix, iy); c.beginPath(); c.moveTo(qx, qy); c.lineTo(qx, Math.max(top, qy - 70)); c.stroke(); }
    return;
  }
  c.drawImage(s.cv, x, y);
  if (b.type === 'mill') {
    const hx = isoX(b.tx + 1.0, b.ty + 1.58), hy = isoY(b.tx + 1.0, b.ty + 1.58) - 38;
    const a0 = T * 1.3, e1x = 0.894, e1y = 0.447;
    c.fillStyle = '#e8dcc0'; c.strokeStyle = '#5a3a1e'; c.lineWidth = 1;
    for (let k = 0; k < 4; k++) {
      const a = a0 + k * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
      const dx = ca * e1x, dy = ca * e1y - sa; // blade direction in screen
      const px2 = -sa * e1x, py2 = -sa * e1y - ca; // perpendicular in-plane
      const L = 24, W = 4;
      c.beginPath();
      c.moveTo(hx + dx * 5, hy + dy * 5); c.lineTo(hx + dx * L, hy + dy * L);
      c.lineTo(hx + dx * L + px2 * W, hy + dy * L + py2 * W); c.lineTo(hx + dx * 5 + px2 * W, hy + dy * 5 + py2 * W); c.closePath();
      c.fill(); c.stroke();
      c.beginPath(); c.moveTo(hx, hy); c.lineTo(hx + dx * L, hy + dy * L); c.stroke();
    }
    c.fillStyle = '#3a2412'; c.beginPath(); c.arc(hx, hy, 2.5, 0, 6.28); c.fill();
  }
  if (b.garrison.length && b.owner === 1 && G.sel.indexOf(b.id) >= 0) {
    c.fillStyle = 'rgba(0,0,0,.6)'; const tx = isoX(b.x, b.y), ty = isoY(b.tx, b.ty) - buildingHeight(b) - 10;
    c.fillRect(tx - 12, ty - 9, 24, 12); c.fillStyle = '#ffe890'; c.font = 'bold 10px sans-serif'; c.textAlign = 'center'; c.fillText(b.garrison.length, tx, ty);
  }
}
function drawUnit(c, u, px, py, T, sel) {
  c.save(); c.translate(px, py);
  const d = UNITS[u.type];
  if (sel) {
    const r = d.radius * 36;
    c.strokeStyle = u.owner === 1 ? 'rgba(255,255,255,.95)' : u.owner === 0 ? '#ddd' : 'rgba(255,80,60,.95)';
    c.lineWidth = 1.3; c.beginPath(); c.ellipse(0, 0, r, r / 2, 0, 0, 6.28); c.stroke();
  }
  c.scale(u.face < 0 ? -US : US, US);
  drawUnitBody(c, u, T);
  c.restore();
}

function drawPlacement(c) {
  const P = UI.place;
  const d = BUILDINGS[P.type], p = PL(1);
  const tiles = P.tiles || [[P.tx, P.ty]];
  for (const [tx, ty] of tiles) {
    const ok = canPlace(P.type, tx, ty, 1, !G.revealAll) && canAfford(p, P.tiles ? scaleCost(d.cost, tiles.length) : d.cost);
    const px = isoX(tx, ty), py = isoY(tx, ty);
    c.globalAlpha = 0.6;
    if (P.type === 'farm') { const s = getFarmSprite(4, true); c.drawImage(s.cv, px - s.ax, py - s.ay); }
    else { const s = d.wall ? getWallSprite(P.type, 1, 0) : getBuildingSprite(P.type, 1, styleOf(1)); c.drawImage(s.cv, px - s.ax, py - s.ay); }
    c.globalAlpha = 1;
    c.fillStyle = ok ? 'rgba(80,255,80,.22)' : 'rgba(255,40,40,.35)';
    c.beginPath(); c.moveTo(isoX(tx, ty), isoY(tx, ty)); c.lineTo(isoX(tx + d.size, ty), isoY(tx + d.size, ty)); c.lineTo(isoX(tx + d.size, ty + d.size), isoY(tx + d.size, ty + d.size)); c.lineTo(isoX(tx, ty + d.size), isoY(tx, ty + d.size)); c.closePath(); c.fill();
  }
  if (!P.tiles && (d.attack)) { // show range
    const cx = P.tx + d.size / 2, cy = P.ty + d.size / 2, r = d.attack.range + p.mods.bld.range + d.size / 2;
    c.strokeStyle = 'rgba(255,255,255,.35)'; c.setLineDash([6, 6]); c.beginPath(); c.ellipse(isoX(cx, cy), isoY(cx, cy), r * HW * 1.414, r * HH * 1.414, 0, 0, 6.28); c.stroke(); c.setLineDash([]);
  }
}
function scaleCost(cost, n) { const o = {}; for (const r in cost) o[r] = cost[r] * n; return o; }

// ---------- minimap ----------
const MM = { s: 240 / (2 * 96), ox: 120, oy: 2 };
function miniToWorld(mx, my) { const a = (mx - MM.ox) / MM.s, b = (my - MM.oy) * 2 / MM.s; return [(a + b) / 2, (b - a) / 2]; }
function drawMinimap(realT) {
  const c = RD.mc, dpr = RD.dpr, N = G.map.N; MM.s = 240 / (2 * N);
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, 240, 124);
  if (G.minimapDirty) buildResMini();
  c.setTransform(dpr * MM.s, dpr * MM.s / 2, -dpr * MM.s, dpr * MM.s / 2, dpr * MM.ox, dpr * MM.oy);
  c.imageSmoothingEnabled = false;
  c.drawImage(G.map.mini, 0, 0); c.drawImage(RD.resMini, 0, 0);
  for (const b of G.buildings) {
    if (b.owner !== 1 && !G.revealAll && !tileExplored(Math.floor(b.x), Math.floor(b.y))) continue;
    c.fillStyle = b.owner ? PCOL[b.owner].main : '#ccc';
    c.fillRect(b.tx, b.ty, b.w, b.h);
  }
  for (const u of G.units) {
    if (u.garrisonedIn) continue;
    if (u.owner !== 1 && !G.revealAll && !tileVisible(u.x, u.y)) continue;
    c.fillStyle = u.owner ? PCOL[u.owner].light : '#fff';
    if (u.owner === 0) { if (UNITS[u.type].look === 'boar' || UNITS[u.type].look === 'deer') c.fillStyle = '#e8e0c0'; }
    c.fillRect(u.x - 0.7, u.y - 0.7, 1.4, 1.4);
  }
  if (!G.revealAll) { c.imageSmoothingEnabled = true; c.drawImage(RD.fog, -1, -1); }
  // alert pings
  G.mmPings = G.mmPings.filter(p => { p.t += 0.1; return p.t < 3; });
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (const p of G.mmPings) {
    const mx = (p.x - p.y) * MM.s + MM.ox, my = (p.x + p.y) * MM.s / 2 + MM.oy;
    c.strokeStyle = 'rgba(255,60,40,' + (1 - p.t / 3) + ')'; c.lineWidth = 1.5; c.beginPath(); c.arc(mx, my, 3 + (p.t % 1) * 8, 0, 6.28); c.stroke();
  }
  // camera frustum
  const pts = [[0, 0], [RD.W, 0], [RD.W, RD.H - 176], [0, RD.H - 176]].map(([sx, sy]) => { const w = screenToWorld(sx, sy); return [(w[0] - w[1]) * MM.s + MM.ox, (w[0] + w[1]) * MM.s / 2 + MM.oy]; });
  c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 1;
  c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); c.stroke();
  // frame
  c.strokeStyle = 'rgba(200,170,110,.5)';
  c.beginPath(); c.moveTo(MM.ox, MM.oy); c.lineTo(MM.ox + N * MM.s, MM.oy + N * MM.s / 2); c.lineTo(MM.ox, MM.oy + N * MM.s); c.lineTo(MM.ox - N * MM.s, MM.oy + N * MM.s / 2); c.closePath(); c.stroke();
}
