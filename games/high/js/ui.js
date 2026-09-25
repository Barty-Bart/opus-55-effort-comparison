'use strict';
// ---------- User interface & input ----------
const UI = {
  place: null, drag: null, pan: null, mouse: { x: 0, y: 0, inside: false }, keys: {}, page: 'eco', amove: false,
  cmdSig: '', infoSig: '', slots: [], lastClick: { t: 0, id: 0 }, hover: null, hoverDirty: true, tipSlot: -1, cursors: null, lastIdle: 0, msgs: [],
};
const $ = id => document.getElementById(id);

function initUI() {
  UI.cursors = makeCursors();
  document.querySelectorAll('img.ricon').forEach(img => img.src = resIcon(img.dataset.r));
  const cv = $('view');
  cv.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  cv.addEventListener('wheel', onWheel, { passive: false });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('contextmenu', e => { if (G && !G.menu) e.preventDefault(); });
  cv.addEventListener('dblclick', e => e.preventDefault());
  document.addEventListener('mouseleave', () => { UI.mouse.inside = false; });
  document.addEventListener('mouseenter', () => { UI.mouse.inside = true; });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', e => { UI.keys[e.key] = false; });
  window.addEventListener('blur', () => { UI.keys = {}; });
  // minimap
  const mm = $('minimap');
  const mmMove = e => { const r = mm.getBoundingClientRect(); const w = miniToWorld(e.clientX - r.left, e.clientY - r.top); return w; };
  mm.addEventListener('mousedown', e => {
    if (!G) return;
    const w = mmMove(e);
    if (e.button === 2) { rightClickWorld(w[0], w[1], null); return; }
    UI.mmDrag = true; centerOn(w[0], w[1]);
  });
  window.addEventListener('mousemove', e => { if (UI.mmDrag && G) { const w = mmMove(e); centerOn(w[0], w[1]); } });
  window.addEventListener('mouseup', () => { UI.mmDrag = false; });
  mm.addEventListener('contextmenu', e => e.preventDefault());
  // command panel
  const cmds = $('commands');
  cmds.addEventListener('mousedown', e => {
    const el = e.target.closest('.cmd'); if (!el) return;
    e.preventDefault(); const s = UI.slots[+el.dataset.i]; if (s && s.act && !s.locked) { Sound.play('click'); s.act(e.shiftKey); refreshPanels(true); }
  });
  cmds.addEventListener('mousemove', e => { const el = e.target.closest('.cmd'); if (!el) { hideTip(); return; } showSlotTip(+el.dataset.i, el); });
  cmds.addEventListener('mouseleave', hideTip);
  $('info').addEventListener('mousedown', onInfoClick);
  $('topbar').addEventListener('mousemove', e => { const el = e.target.closest('[data-tip]'); if (el) showTip(el.dataset.tip, el, true); else hideTip(); });
  $('topbar').addEventListener('mouseleave', hideTip);
  $('idle-vil').addEventListener('mousedown', () => selectIdle('villager'));
  $('speed-btn').addEventListener('mousedown', () => { G.speedIdx = (G.speedIdx + 1) % GAME_SPEEDS.length; });
  $('menu-btn').addEventListener('mousedown', () => openPause());
}

// ---------- notifications ----------
function notify(text, cls = 'info') {
  if (G && G.demo) return;
  const box = $('messages'); if (!box) return;
  const d = document.createElement('div'); d.className = 'msg ' + cls; d.textContent = text;
  box.appendChild(d);
  while (box.children.length > 6) box.removeChild(box.firstChild);
  setTimeout(() => { d.style.opacity = '0'; }, 6000);
  setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, 7000);
}
function bigMessage(title, sub) {
  if (G && G.demo) return;
  const el = $('center-msg'); el.innerHTML = title + (sub ? '<small>' + sub + '</small>' : '');
  el.classList.add('show'); clearTimeout(UI.bigT); UI.bigT = setTimeout(() => el.classList.remove('show'), 3800);
}

// ---------- picking ----------
function spriteHit(s, lx, ly) {
  if (lx < 0 || ly < 0 || lx >= s.cv.width || ly >= s.cv.height) return false;
  const c = s.ctx || s.cv.getContext('2d');
  try { return c.getImageData(lx | 0, ly | 0, 1, 1).data[3] > 30; } catch (e) { return true; }
}
function pickAt(sx, sy) {
  const [ix, iy] = screenToIso(sx, sy);
  const [wx, wy] = isoToWorld(ix, iy);
  let best = null, bd = 1e9;
  for (const u of G.units) {
    if (u.garrisonedIn) continue;
    if (u.owner !== 1 && !G.revealAll && !tileVisible(u.x, u.y)) continue;
    const px = isoX(u.x, u.y), py = isoY(u.x, u.y), h = unitHeight(u), w = (UNITS[u.type].radius * 40 + 3) * US;
    if (ix < px - w || ix > px + w || iy < py - h - 3 || iy > py + 4) continue;
    const dd = Math.hypot(ix - px, iy - (py - h / 2));
    if (dd < bd) { bd = dd; best = u; }
  }
  if (best) return best;
  let bk = -1e9;
  const test = (e, s, px, py, key) => {
    if (key <= bk) return;
    if (spriteHit(s, ix - (px - s.ax), iy - (py - s.ay))) { bk = key; best = e; }
  };
  for (const b of G.buildings) {
    if (b.owner !== 1 && !G.revealAll && !tileExplored(Math.floor(b.x), Math.floor(b.y))) continue;
    const inFoot = wx >= b.tx && wx < b.tx + b.w && wy >= b.ty && wy < b.ty + b.h;
    if (inFoot && b.x + b.y > bk) { bk = b.x + b.y; best = b; continue; }
    if (b.type === 'farm' || !b.built) continue;
    const s = BUILDINGS[b.type].wall ? getWallSprite(b.type, b.owner, b.wallMask || 0) : getBuildingSprite(b.type, b.owner, styleOf(b.owner));
    const px = isoX(b.tx, b.ty), py = isoY(b.tx, b.ty);
    if (ix < px - s.ax || ix > px - s.ax + s.cv.width || iy < py - s.ay || iy > py - s.ay + s.cv.height) continue;
    test(b, s, px, py, b.x + b.y);
  }
  for (const r of G.resources) {
    if (!G.revealAll && !tileExplored(r.tx, r.ty)) continue;
    const px = isoX(r.x, r.y), py = isoY(r.x, r.y);
    if (Math.abs(ix - px) > 34 || iy > py + 20 || iy < py - 80) continue;
    if (r.type === 'carcass') { if (Math.hypot(ix - px, (iy - py) * 2) < 12 && r.x + r.y > bk) { bk = r.x + r.y; best = r; } continue; }
    const s = r.type === 'tree' ? SPR.trees[r.variant] : r.type === 'berries' ? SPR.res.berries[3] : SPR.res[r.type];
    if (r.tx === Math.floor(wx) && r.ty === Math.floor(wy) && r.x + r.y > bk) { bk = r.x + r.y; best = r; continue; }
    test(r, s, px, py, r.x + r.y);
  }
  return best;
}

// ---------- selection ----------
function selected() { return G.sel.map(getEnt).filter(Boolean); }
function selectEnts(list, add) {
  const ids = list.map(e => e.id);
  if (add) { for (const id of ids) { const i = G.sel.indexOf(id); if (i >= 0 && ids.length === 1) G.sel.splice(i, 1); else if (i < 0) G.sel.push(id); } }
  else G.sel = ids;
  UI.page = 'eco'; UI.amove = false;
  if (list.length) Sound.play('select');
  refreshPanels(true);
}
function boxSelect(x0, y0, x1, y1, add) {
  const a = Math.min(x0, x1), b = Math.max(x0, x1), c = Math.min(y0, y1), d = Math.max(y0, y1);
  let got = G.units.filter(u => !u.garrisonedIn && u.owner === 1 && (() => { const s = worldToScreen(u.x, u.y); const h = unitHeight(u) * G.cam.zoom * 0.5; return s[0] >= a && s[0] <= b && s[1] - h >= c - 6 && s[1] - h <= d + 6; })());
  const mil = got.filter(u => isMilitary(UNITS[u.type]) || u.type === 'monk');
  if (mil.length && mil.length < got.length && !add) { /* keep mixed selection like AoE */ }
  got = got.slice(0, 60);
  if (got.length) selectEnts(got, add);
  else if (!add) { G.sel = []; refreshPanels(true); }
}
function selectIdle(type) {
  const list = G.units.filter(u => u.owner === 1 && !u.garrisonedIn && !u.order && (type === 'villager' ? u.type === 'villager' : (isMilitary(UNITS[u.type]))));
  if (!list.length) return;
  UI.lastIdle = (UI.lastIdle + 1) % list.length;
  const u = list[UI.lastIdle]; selectEnts([u]); centerOn(u.x, u.y);
}

// ---------- mouse ----------
function onMouseDown(e) {
  if (!G || G.menu || G.demo) return;
  Sound.init(); Sound.resume();
  hideTip();
  const sx = e.clientX, sy = e.clientY;
  if (e.button === 1) { UI.pan = { x: sx, y: sy, cx: G.cam.x, cy: G.cam.y }; e.preventDefault(); return; }
  if (e.button === 2) {
    if (UI.place) { UI.place = null; return; }
    if (UI.amove) { UI.amove = false; return; }
    const w = screenToWorld(sx, sy);
    rightClickWorld(w[0], w[1], pickAt(sx, sy), e.altKey);
    return;
  }
  if (e.button !== 0) return;
  if (UI.place) {
    const P = UI.place;
    if (BUILDINGS[P.type].wall) { P.dragStart = [P.tx, P.ty]; P.tiles = [[P.tx, P.ty]]; return; }
    placeBuildingAt(P.type, P.tx, P.ty, e.shiftKey);
    return;
  }
  if (UI.amove) {
    const w = screenToWorld(sx, sy);
    const units = selected().filter(u => u.kind === 'unit' && u.owner === 1);
    cmdMove(units, w[0], w[1], true); UI.amove = false;
    G.fx.push({ type: 'order', x: w[0], y: w[1], z: 0, t: 0, life: 0.6, col: '#ff6040' }); Sound.play('order');
    return;
  }
  UI.drag = { x0: sx, y0: sy, x1: sx, y1: sy, active: false, shift: e.shiftKey };
}
function onMouseMove(e) {
  UI.mouse.x = e.clientX; UI.mouse.y = e.clientY; UI.mouse.inside = true; UI.hoverDirty = true;
  if (!G) return;
  if (UI.pan) { G.cam.x = UI.pan.cx - (e.clientX - UI.pan.x) / G.cam.zoom; G.cam.y = UI.pan.cy - (e.clientY - UI.pan.y) / G.cam.zoom; clampCam(); return; }
  if (UI.drag) { UI.drag.x1 = e.clientX; UI.drag.y1 = e.clientY; if (Math.abs(UI.drag.x1 - UI.drag.x0) + Math.abs(UI.drag.y1 - UI.drag.y0) > 6) UI.drag.active = true; }
  if (UI.place) updatePlaceTile();
}
function updatePlaceTile() {
  const P = UI.place, d = BUILDINGS[P.type];
  const w = screenToWorld(UI.mouse.x, UI.mouse.y);
  P.tx = Math.floor(w[0] - d.size / 2 + 0.5); P.ty = Math.floor(w[1] - d.size / 2 + 0.5);
  if (d.size === 1) { P.tx = Math.floor(w[0]); P.ty = Math.floor(w[1]); }
  if (P.dragStart) P.tiles = wallLine(P.dragStart[0], P.dragStart[1], P.tx, P.ty);
}
function wallLine(x0, y0, x1, y1) {
  const pts = [[x0, y0]]; let x = x0, y = y0;
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = Math.sign(x1 - x0), sy = Math.sign(y1 - y0);
  let guard = 0;
  while ((x !== x1 || y !== y1) && guard++ < 200) {
    const ex = Math.abs((x + sx - x0) * dy - (y - y0) * dx), ey = Math.abs((x - x0) * dy - (y + sy - y0) * dx);
    if (x !== x1 && (y === y1 || ex <= ey)) x += sx; else y += sy;
    pts.push([x, y]);
  }
  return pts;
}
function onMouseUp(e) {
  if (!G) return;
  if (e.button === 1) { UI.pan = null; return; }
  if (e.button !== 0) return;
  if (UI.place && UI.place.dragStart) {
    const P = UI.place, tiles = P.tiles || [];
    const vils = selected().filter(u => u.kind === 'unit' && u.type === 'villager' && u.owner === 1);
    let first = null, n = 0;
    for (const [tx, ty] of tiles) { const b = placeFoundation(PL(1), P.type, tx, ty); if (b) { n++; if (!first) first = b; } }
    if (first) { for (const v of vils) setOrder(v, { type: 'build', target: first.id }); Sound.play('place'); }
    else Sound.play('error');
    if (!e.shiftKey) UI.place = null; else { P.dragStart = null; P.tiles = null; }
    return;
  }
  const d = UI.drag; UI.drag = null;
  if (!d || e.target !== $('view') && !d.active) return;
  if (d.active) { boxSelect(d.x0, d.y0, d.x1, d.y1, d.shift); return; }
  const ent = pickAt(d.x0, d.y0);
  const now = performance.now();
  if (ent && ent.kind === 'unit' && ent.owner === 1 && UI.lastClick.id === ent.id && now - UI.lastClick.t < 350) {
    const same = G.units.filter(u => u.owner === 1 && !u.garrisonedIn && u.type === ent.type && (() => { const s = worldToScreen(u.x, u.y); return s[0] > 0 && s[0] < RD.W && s[1] > 0 && s[1] < RD.H; })());
    selectEnts(same.slice(0, 60)); UI.lastClick = { t: 0, id: 0 }; return;
  }
  if (ent && ent.kind === 'building' && ent.owner === 1 && UI.lastClick.id === ent.id && now - UI.lastClick.t < 350) {
    const same = G.buildings.filter(b => b.owner === 1 && b.type === ent.type && b.built);
    G.sel = same.map(b => b.id); refreshPanels(true); UI.lastClick = { t: 0, id: 0 }; return;
  }
  UI.lastClick = { t: now, id: ent ? ent.id : 0 };
  if (ent) selectEnts([ent], d.shift && ent.owner === 1 && ent.kind === 'unit');
  else if (!d.shift) { G.sel = []; refreshPanels(true); }
}
function onWheel(e) {
  e.preventDefault(); if (!G) return;
  const before = screenToIso(e.clientX, e.clientY);
  G.cam.zoom = clamp(G.cam.zoom * (e.deltaY > 0 ? 0.9 : 1.1), 0.45, 2.2);
  const after = screenToIso(e.clientX, e.clientY);
  G.cam.x += before[0] - after[0]; G.cam.y += before[1] - after[1]; clampCam();
}
function rightClickWorld(wx, wy, ent, alt) {
  const sel = selected();
  const units = sel.filter(e => e.kind === 'unit' && e.owner === 1);
  const blds = sel.filter(e => e.kind === 'building' && e.owner === 1 && e.built);
  if (units.length) {
    cmdSmart(units, wx, wy, ent, 1, alt);
    const col = ent && isEnemyOf1(ent) ? '#ff5040' : '#7fff60';
    G.fx.push({ type: 'order', x: ent ? ent.x : wx, y: ent ? ent.y : wy, z: 0, t: 0, life: 0.6, col });
    Sound.play('order');
  } else if (blds.length) {
    for (const b of blds) {
      if (!BUILDINGS[b.type].trains.length && !BUILDINGS[b.type].garrison) continue;
      b.rally = { x: ent ? ent.x : wx, y: ent ? ent.y : wy, id: ent && ent.id !== b.id ? ent.id : 0 };
    }
    Sound.play('click');
  }
}
function isEnemyOf1(e) { return e.owner && e.owner !== 1; }
function placeBuildingAt(type, tx, ty, keep) {
  const p = PL(1), d = BUILDINGS[type];
  if (!canAfford(p, d.cost)) { notifyShort(d.cost, p); Sound.play('error'); UI.place = null; return; }
  if (!canPlace(type, tx, ty, 1, !G.revealAll)) { Sound.play('error'); return; }
  const b = placeFoundation(p, type, tx, ty);
  if (!b) { Sound.play('error'); return; }
  const vils = selected().filter(u => u.kind === 'unit' && u.type === 'villager' && u.owner === 1);
  if (keep) { // shift: queue - idle / free villagers go to the first, others pick up after
    for (const v of vils) if (!v.order || v.order.type !== 'build') setOrder(v, { type: 'build', target: b.id });
  } else for (const v of vils) setOrder(v, { type: 'build', target: b.id });
  Sound.play('place');
  if (!keep) UI.place = null;
}

// ---------- keyboard ----------
function onKeyDown(e) {
  if (!G || G.menu || G.demo) { if (e.key === 'Escape' && G && G.menu === 'pause') closePause(); return; }
  UI.keys[e.key] = true;
  const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  if (e.key === 'Escape') { if (UI.place) UI.place = null; else if (UI.amove) UI.amove = false; else if (UI.page !== 'eco') { UI.page = 'eco'; refreshPanels(true); } else if (G.sel.length) { G.sel = []; refreshPanels(true); } else openPause(); return; }
  if (e.key === 'F10') { openPause(); e.preventDefault(); return; }
  if (/^[0-9]$/.test(e.key)) {
    const n = +e.key;
    if (e.ctrlKey || e.metaKey) { G.groups[n] = G.sel.slice(); notify('Group ' + n + ' assigned.', 'info'); e.preventDefault(); return; }
    const g = (G.groups[n] || []).filter(id => getEnt(id));
    if (!g.length) return;
    const now = performance.now();
    if (UI.lastGroup === n && now - UI.lastGroupT < 400) { const e0 = getEnt(g[0]); centerOn(e0.x, e0.y); }
    UI.lastGroup = n; UI.lastGroupT = now;
    G.sel = g; refreshPanels(true); Sound.play('select');
    return;
  }
  if (e.ctrlKey || e.metaKey) return;
  if (k === 'H') { const tc = G.buildings.find(b => b.owner === 1 && b.type === 'town_center'); if (tc) { selectEnts([tc]); centerOn(tc.x, tc.y); } return; }
  if (k === '.') { selectIdle('villager'); return; }
  if (k === ',') { selectIdle('military'); return; }
  if (k === ' ') { const s = selected(); if (s.length) centerOn(s[0].x, s[0].y); e.preventDefault(); return; }
  if (e.key === 'Home') { if (G.lastAlert) centerOn(G.lastAlert.x, G.lastAlert.y); return; }
  if (k === 'P' || e.key === 'Pause') { G.paused = !G.paused; bigMessage(G.paused ? 'Paused' : '', G.paused ? 'Press P to resume' : ''); if (!G.paused) $('center-msg').classList.remove('show'); return; }
  if (k === '+' || k === '=') { G.speedIdx = Math.min(GAME_SPEEDS.length - 1, G.speedIdx + 1); return; }
  if (k === '-' || k === '_') { G.speedIdx = Math.max(0, G.speedIdx - 1); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { doDelete(); return; }
  const idx = HOTKEYS.indexOf(k);
  if (idx >= 0) { const s = UI.slots[idx]; if (s && s.act && !s.locked) { Sound.play('click'); s.act(e.shiftKey); refreshPanels(true); } }
}
function doDelete() {
  const s = selected().filter(e => e.owner === 1 && e.kind !== 'resource');
  if (!s.length) return;
  for (const e of s) deleteEntity(e);
  G.sel = []; refreshPanels(true);
}

// ---------- camera scrolling ----------
function updateCamera(dt) {
  if (!G) return;
  let dx = 0, dy = 0;
  const sp = 900 * dt / G.cam.zoom;
  if (UI.keys.ArrowLeft) dx -= sp; if (UI.keys.ArrowRight) dx += sp; if (UI.keys.ArrowUp) dy -= sp; if (UI.keys.ArrowDown) dy += sp;
  const m = UI.mouse, e = 6;
  if (m.inside && !UI.pan && !UI.mmDrag && document.hasFocus()) {
    if (m.x <= e) dx -= sp; if (m.x >= RD.W - e) dx += sp; if (m.y <= e) dy -= sp; if (m.y >= RD.H - e) dy += sp;
  }
  if (dx || dy) { G.cam.x += dx; G.cam.y += dy; clampCam(); UI.hoverDirty = true; if (UI.place) updatePlaceTile(); }
}
function updateHover() {
  if (!UI.hoverDirty || !G) return;
  UI.hoverDirty = false;
  const cv = $('view');
  if (UI.place || UI.amove) { cv.style.cursor = UI.amove ? UI.cursors.attack : UI.cursors.default; return; }
  const ent = pickAt(UI.mouse.x, UI.mouse.y);
  UI.hover = ent;
  const sel = selected(), mine = sel.filter(e => e.kind === 'unit' && e.owner === 1);
  let cur = UI.cursors.default;
  if (ent && mine.length) {
    const vil = mine.some(u => u.type === 'villager');
    if (ent.owner && ent.owner !== 1) cur = UI.cursors.attack;
    else if (ent.kind === 'resource' && vil) cur = UI.cursors.gather;
    else if (ent.kind === 'unit' && ent.owner === 0 && UNITS[ent.type].hunt) cur = vil ? UI.cursors.gather : UI.cursors.attack;
    else if (ent.kind === 'unit' && ent.type === 'sheep' && vil) cur = UI.cursors.gather;
    else if (ent.kind === 'building' && ent.owner === 1 && vil && (!ent.built || ent.hp < ent.maxHp)) cur = UI.cursors.build;
    else if (ent.kind === 'building' && ent.owner === 1 && ent.type === 'farm' && vil) cur = UI.cursors.gather;
    else if (ent.kind === 'building' && ent.owner === 1 && BUILDINGS[ent.type].garrison && ent.built && !vil && ent.type !== 'town_center') cur = UI.cursors.garrison;
  } else if (ent && ent.owner === 1) cur = UI.cursors.hand;
  cv.style.cursor = cur;
}

// ---------- tooltip ----------
function costHTML(cost, p) {
  let h = '<div class="tt-cost">';
  for (const r of RES) if (cost[r]) h += `<span class="${p && p.res[r] < cost[r] ? 'no' : ''}"><img src="${resIcon(r)}">${cost[r]}</span>`;
  if (!RES.some(r => cost[r])) h += '<span>Free</span>';
  return h + '</div>';
}
function showTip(html, anchor, below) {
  const t = $('tooltip'); t.innerHTML = html; t.classList.remove('hidden');
  const r = anchor.getBoundingClientRect(), tw = t.offsetWidth, th = t.offsetHeight;
  let x = r.left + r.width / 2 - tw / 2, y = below ? r.bottom + 8 : r.top - th - 8;
  x = clamp(x, 6, window.innerWidth - tw - 6); y = clamp(y, 6, window.innerHeight - th - 6);
  t.style.left = x + 'px'; t.style.top = y + 'px';
}
function hideTip() { $('tooltip').classList.add('hidden'); UI.tipSlot = -1; }
function showSlotTip(i, el) {
  const s = UI.slots[i]; if (!s) { hideTip(); return; }
  UI.tipSlot = i;
  let h = `<div class="tt-title">${s.title}${s.hk ? ' <span style="color:#bfae88;font-size:12px">(' + s.hk + ')</span>' : ''}</div>`;
  if (s.cost) h += costHTML(s.cost, PL(1));
  if (s.time) h += `<div class="tt-desc">Time: ${s.time}s</div>`;
  if (s.reason) h += `<div class="tt-req">${s.reason}</div>`;
  if (s.desc) h += `<div class="tt-desc">${s.desc}</div>`;
  if (s.stats) h += `<div class="tt-desc">${s.stats}</div>`;
  showTip(h, el);
}

// ---------- command slots ----------
function unitStatsLine(type) {
  const d = UNITS[type]; if (!d) return '';
  const parts = ['HP ' + d.hp];
  if (d.atk) parts.push('Attack ' + d.atk + (d.range ? ' (range ' + d.range + ')' : ''));
  parts.push('Armor ' + d.armor[0] + '/' + d.armor[1]);
  const b = Object.keys(d.bonus); if (b.length) parts.push('Bonus vs ' + b.map(k => k === 'spear' ? 'spearmen' : k === 'building' ? 'buildings' : k).join(', '));
  return parts.join(' · ');
}
function buildSlots() {
  const slots = new Array(15).fill(null);
  const sel = selected(); const p = PL(1);
  if (!sel.length) return slots;
  const e0 = sel[0];
  if (e0.owner !== 1) return slots;
  const units = sel.filter(e => e.kind === 'unit');
  if (units.length) {
    const vils = units.filter(u => u.type === 'villager');
    if (vils.length) {
      const list = BUILD_PAGES[UI.page === 'mil' ? 'mil' : 'eco'];
      list.forEach((key, i) => {
        const d = BUILDINGS[key]; const locked = d.age > p.age;
        slots[i] = { icon: buildingIcon(key), title: 'Build ' + d.name, cost: d.cost, time: d.time, desc: d.desc, locked, reason: locked ? 'Requires ' + AGE_NAMES[d.age] : null,
          poor: !canAfford(p, d.cost), act: () => { if (!canAfford(p, d.cost)) { notifyShort(d.cost, p); Sound.play('error'); return; } UI.place = { type: key, tx: 0, ty: 0 }; updatePlaceTile(); } };
      });
      slots[12] = UI.page === 'mil' ? { icon: cmdIcon('eco'), title: 'Economic Buildings', act: () => { UI.page = 'eco'; } } : { icon: cmdIcon('mil'), title: 'Military Buildings', act: () => { UI.page = 'mil'; } };
    }
    if (!vils.length) slots[5] = { icon: cmdIcon('amove'), title: 'Attack Move', desc: 'Move and engage any enemies along the way. Click a destination.', act: () => { UI.amove = true; } };
    slots[13] = { icon: cmdIcon('stop'), title: 'Stop', act: () => cmdStop(selected().filter(u => u.kind === 'unit')) };
    slots[14] = { icon: cmdIcon('delete'), title: 'Delete', desc: 'Kill the selected units (Del).', act: doDelete };
    return slots;
  }
  // building(s)
  const b = e0; const d = BUILDINGS[b.type];
  if (!b.built) { slots[14] = { icon: cmdIcon('delete'), title: 'Cancel construction', desc: 'Refunds the cost if construction has not started.', act: doDelete }; return slots; }
  let i = 0;
  for (const key of d.trains) {
    const st = unitState(p, key); const type = st.type; const ud = UNITS[type];
    const cnt = b.queue.filter(q => q.kind === 'unit' && q.key === key).length;
    slots[i++] = { icon: unitIcon(type), title: 'Train ' + ud.name, cost: ud.cost, time: ud.time, desc: ud.desc, stats: unitStatsLine(type), locked: !st.ok, reason: st.reason, poor: !canAfford(p, ud.cost), cnt,
      act: shift => { for (let n = 0; n < (shift ? 5 : 1); n++) if (!queueUnit(b, key, n > 0)) break; } };
  }
  for (const key of d.techs) {
    const st = techState(p, key); if (st.hidden) continue;
    const t = TECHS[key]; const cost = techCost(p, key);
    slots[i++] = { icon: techIcon(key), title: t.name, cost, time: t.time, desc: t.desc, locked: !st.ok && !st.busy, reason: st.reason, poor: !canAfford(p, cost), active: st.busy,
      act: () => { if (st.busy) return; queueTech(b, key); } };
    if (i >= 12) break;
  }
  if (d.garrison) slots[12] = { icon: cmdIcon('ungarrison'), title: 'Ungarrison (' + b.garrison.length + ')', desc: 'Release all garrisoned units.', act: () => ungarrison(b), locked: !b.garrison.length };
  if (b.type === 'town_center') {
    const belled = G.units.some(u => u.owner === 1 && (u.garrisonedIn || (u.order && u.order.type === 'garrison')) && u.type === 'villager');
    slots[13] = belled ? { icon: cmdIcon('allclear'), title: 'All Clear', desc: 'Villagers leave shelter and return to work.', act: () => ringBell(1, false) }
      : { icon: cmdIcon('bell'), title: 'Ring Town Bell', desc: 'Villagers take shelter in nearby Town Centers and towers, which then fire extra arrows.', act: () => ringBell(1, true) };
  }
  if (b.type === 'mill') slots[13] = { icon: cmdIcon('reseed'), title: 'Auto-reseed farms: ' + (p.reseed ? 'ON' : 'OFF'), desc: 'Exhausted farms are automatically rebuilt for 60 wood.', active: p.reseed, act: () => { p.reseed = !p.reseed; } };
  slots[14] = { icon: cmdIcon('delete'), title: 'Delete ' + d.name, act: doDelete };
  return slots;
}
function refreshPanels(force) {
  if (!G) return;
  G.sel = G.sel.filter(id => getEnt(id));
  const slots = buildSlots();
  const sig = slots.map(s => s ? s.icon.length + s.title + (s.locked ? 'L' : '') + (s.poor ? 'P' : '') + (s.cnt || '') + (s.active ? 'A' : '') : '-').join('|') + UI.page;
  UI.slots = slots;
  if (sig !== UI.cmdSig || force) {
    UI.cmdSig = sig;
    const box = $('commands');
    box.innerHTML = slots.map((s, i) => s ? `<div class="cmd${s.locked ? ' locked' : ''}${s.poor && !s.locked ? ' poor' : ''}${s.active ? ' active' : ''}" data-i="${i}" style="background-image:url(${s.icon})">${s.cnt ? '<span class="cnt">' + s.cnt + '</span>' : ''}<span class="hk">${HOTKEYS[i]}</span></div>`
      : `<div class="cmd empty"></div>`).join('');
    slots.forEach((s, i) => { if (s) s.hk = HOTKEYS[i]; });
    if (UI.tipSlot >= 0) { const el = box.querySelector(`[data-i="${UI.tipSlot}"]`); if (el) showSlotTip(UI.tipSlot, el); else hideTip(); }
  } else slots.forEach((s, i) => { if (s) s.hk = HOTKEYS[i]; });
  renderInfo(force);
}

// ---------- info panel ----------
function renderInfo(force) {
  const sel = selected(); const box = $('info');
  let sig = sel.map(e => e.id).join(',');
  if (sel.length === 1) {
    const e = sel[0];
    sig += '|' + Math.ceil(e.hp || 0) + '|' + (e.kind === 'resource' ? e.amount : '') + '|' + (e.carryAmt || '') + (e.carryType || '');
    if (e.kind === 'building') sig += '|' + e.queue.map(q => q.key + Math.floor(q.t / (q.kind === 'unit' ? UNITS[q.type].time : TECHS[q.key].time) * 50)).join(',') + '|' + e.garrison.length + '|' + (e.progress * 100 | 0) + (e.housed ? 'H' : '') + (e.amount | 0);
    if (e.kind === 'building' && e.type === 'market') sig += JSON.stringify(PL(1).market) + PL(1).res.gold;
    if (e.kind === 'unit') sig += '|' + (e.order ? e.order.type : '') + '|' + (e.faith | 0) + '|' + e.type;
  } else sig += '|' + sel.map(e => Math.ceil(e.hp / 4)).join(',');
  if (sig === UI.infoSig && !force) return;
  UI.infoSig = sig;
  if (!sel.length) { box.innerHTML = '<div class="infocol" style="justify-content:center;color:#bfae88;font-size:14px;opacity:.8">Select a unit or building.<br>Right-click to command. Drag to select many.</div>'; return; }
  if (sel.length > 1) {
    box.innerHTML = '<div class="multi">' + sel.map(e => `<div class="mitem" data-id="${e.id}" style="background-image:url(${e.kind === 'unit' ? unitIcon(e.type, e.owner) : buildingIcon(e.type, e.owner)})"><div class="mhp"><div style="width:${e.hp / e.maxHp * 100}%"></div></div></div>`).join('') + '</div>';
    return;
  }
  const e = sel[0];
  const ownerName = e.owner === 1 ? 'You (' + CIVS[PL(1).civ].name + ')' : e.owner === 2 ? 'Enemy (' + CIVS[PL(2).civ].name + ')' : 'Nature';
  let icon, name, body = '';
  if (e.kind === 'unit') {
    const d = UNITS[e.type]; icon = unitIcon(e.type, e.owner); name = d.name;
    const arm = uArmor(e), atk = uAtk(e), rng = uRange(e);
    body += `<div class="hpbar"><div style="width:${e.hp / e.maxHp * 100}%"></div></div><div class="hptext">${Math.ceil(e.hp)} / ${e.maxHp}</div><div class="stats">`;
    if (atk) body += `<span><i>⚔ Attack</i> ${atk}${d.atkType === 'p' ? ' (pierce)' : ''}</span>`;
    body += `<span><i>🛡 Armor</i> ${arm[0]}/${arm[1]}</span>`;
    if (rng) body += `<span><i>🏹 Range</i> ${rng}</span>`;
    if (!hasCls(d, 'animal')) body += `<span><i>👁 Sight</i> ${d.los}</span>`;
    if (hasCls(d, 'monk')) body += `<span><i>✨ Faith</i> ${e.faith | 0}%</span>`;
    body += '</div>';
    if (e.type === 'villager') {
      const act = e.order ? ({ gather: 'Gathering ' + (e.order.sub || ''), build: 'Building', repair: 'Repairing', drop: 'Returning resources', move: 'Moving', attack: 'Fighting', garrison: 'Seeking shelter' }[e.order.type] || '') : 'Idle';
      body += `<div class="carry">${e.carryAmt ? `<img src="${resIcon(e.carryType)}"> Carrying ${e.carryAmt}` : ''} <span style="color:#bfae88">${act}</span></div>`;
    }
    if (hasCls(d, 'animal') && d.food) body += `<div class="carry"><img src="${resIcon('food')}"> ${d.food} food</div>`;
  } else if (e.kind === 'resource') {
    const nm = { tree: 'Tree', gold: 'Gold Mine', stone: 'Stone Mine', berries: 'Forage Bush', carcass: UNITS[e.src] ? UNITS[e.src].name + ' (carcass)' : 'Carcass' }[e.type];
    name = nm; const r = e.rtype;
    const cv = makeCanvas(64, 60), c = cv.getContext('2d'); iconBg(c, 64, 60, '#8aa860', '#3a5028');
    const s = e.type === 'tree' ? SPR.trees[e.variant] : e.type === 'berries' ? SPR.res.berries[3] : e.type === 'carcass' ? null : SPR.res[e.type];
    if (s) { const sc = Math.min(56 / s.cv.width, 54 / s.cv.height); c.drawImage(s.cv, 32 - s.cv.width * sc / 2, 57 - s.cv.height * sc, s.cv.width * sc, s.cv.height * sc); }
    else { c.save(); c.translate(32, 42); c.scale(2.5, 2.5); drawCarcass(c, e.src); c.restore(); }
    icon = cv.toDataURL();
    body += `<div class="carry" style="font-size:16px"><img src="${resIcon(r)}" style="width:22px;height:22px"> ${Math.ceil(e.amount)} ${r}</div>`;
  } else {
    const d = BUILDINGS[e.type]; icon = buildingIcon(e.type, e.owner); name = d.name;
    body += `<div class="hpbar"><div style="width:${(e.built ? e.hp / e.maxHp : e.progress) * 100}%"></div></div><div class="hptext">${e.built ? Math.ceil(e.hp) + ' / ' + e.maxHp : 'Under construction ' + Math.floor(e.progress * 100) + '%'}</div><div class="stats">`;
    body += `<span><i>🛡 Armor</i> ${d.armor[0]}/${d.armor[1]}</span>`;
    if (d.attack) body += `<span><i>🏹 Arrows</i> ${bArrows(e)} × ${bAtk(e)}</span><span><i>Range</i> ${bRange(e)}</span>`;
    if (d.garrison) body += `<span><i>Garrison</i> ${e.garrison.length}/${d.garrison}</span>`;
    if (d.pop) body += `<span><i>Housing</i> +${d.pop}</span>`;
    if (e.type === 'farm' && e.built) body += `<span><i>Food</i> ${Math.ceil(e.amount)}</span>`;
    body += '</div>';
    if (e.owner === 1 && e.queue.length) {
      const q0 = e.queue[0], tot = q0.kind === 'unit' ? UNITS[q0.type].time : TECHS[q0.key].time;
      body += `<div class="qlabel">${e.housed ? '<span style="color:#ff9a7a">Need more houses!</span>' : (q0.kind === 'unit' ? 'Training ' + UNITS[q0.type].name : 'Researching ' + TECHS[q0.key].name) + ' — ' + Math.floor(q0.t / tot * 100) + '%'}</div><div class="queue">`;
      e.queue.forEach((q, i) => { const t = q.kind === 'unit' ? UNITS[q.type].time : TECHS[q.key].time; body += `<div class="qitem" data-q="${i}" title="Click to cancel" style="background-image:url(${q.kind === 'unit' ? unitIcon(q.type) : techIcon(q.key)})">${i === 0 ? `<div class="qp" style="width:${q.t / t * 100}%"></div>` : ''}</div>`; });
      body += '</div>';
    }
    if (e.owner === 1 && e.type === 'market' && e.built) {
      const p = PL(1);
      body += '<div class="market">';
      for (const r of ['food', 'wood', 'stone']) body += `<span><img src="${resIcon(r)}" style="width:16px;vertical-align:middle"> ${r}</span><button data-buy="${r}">Buy 100 (${p.market[r]}g)</button><button data-sell="${r}">Sell 100 (+${Math.floor(p.market[r] * 0.7)}g)</button>`;
      body += '</div>';
    }
  }
  box.innerHTML = `<div class="portrait" style="background-image:url(${icon})"></div><div class="infocol"><div class="iname">${name}</div><div class="iowner">${ownerName}</div>${body}</div>`;
}
function onInfoClick(e) {
  const q = e.target.closest('.qitem');
  if (q) { const b = selected()[0]; if (b && b.kind === 'building' && b.owner === 1) { cancelQueue(b, +q.dataset.q); Sound.play('click'); refreshPanels(true); } return; }
  const m = e.target.closest('.mitem');
  if (m) { const ent = getEnt(+m.dataset.id); if (ent) { if (e.shiftKey) { G.sel = G.sel.filter(id => id !== ent.id); refreshPanels(true); } else selectEnts([ent]); } return; }
  const buy = e.target.dataset && e.target.dataset.buy, sell = e.target.dataset && e.target.dataset.sell;
  if (buy || sell) { if (marketTrade(PL(1), buy || sell, !!buy)) Sound.play('click'); else Sound.play('error'); refreshPanels(true); }
}

// ---------- top bar ----------
function updateTopBar(dt) {
  const p = PL(1);
  for (const r of RES) {
    const el = $('r-' + r); const v = Math.floor(p.res[r]);
    const span = el.firstElementChild.nextElementSibling;
    if (span.textContent != v) span.textContent = v;
    const gatherers = G.units.filter(u => u.owner === 1 && u.type === 'villager' && u.order && ((u.order.type === 'gather' && (u.order.sub === r || (r === 'food' && ['farm', 'berries', 'sheep', 'hunt'].includes(u.order.sub)))) || (u.order.type === 'drop' && u.carryType === r))).length;
    const em = el.querySelector('em'); const tx = gatherers ? '(' + gatherers + ')' : '';
    if (em.textContent !== tx) em.textContent = tx;
  }
  const popEl = $('r-pop').querySelector('span'); const pt = p.pop + '/' + p.popCap;
  if (popEl.textContent !== pt) popEl.textContent = pt;
  $('r-pop').classList.toggle('flash', p.pop >= p.popCap && p.popCap < 200);
  $('age-name').textContent = AGE_NAMES[p.age];
  const tc = G.buildings.find(b => b.owner === 1 && b.queue.length && b.queue[0].kind === 'tech' && TECHS[b.queue[0].key].ageUp);
  const ap = $('age-prog');
  if (tc) { ap.style.visibility = 'visible'; ap.firstElementChild.style.width = (tc.queue[0].t / TECHS[tc.queue[0].key].time * 100) + '%'; } else ap.style.visibility = 'hidden';
  $('clock').textContent = fmtTime(G.time);
  $('speed-btn').textContent = GAME_SPEEDS[G.speedIdx].name;
  const idle = G.units.filter(u => u.owner === 1 && u.type === 'villager' && !u.order && !u.garrisonedIn).length;
  const iv = $('idle-vil'); iv.querySelector('b').textContent = idle; iv.classList.toggle('none', !idle);
  const wt = $('wonder-timer');
  if (G.wonder) { wt.classList.remove('hidden'); wt.innerHTML = `<span style="color:${PCOL[G.wonder.owner].light}">${G.wonder.owner === 1 ? 'Your' : 'Enemy'} Wonder</span><br>${fmtTime(Math.max(0, G.wonder.t))}`; }
  else wt.classList.add('hidden');
}

// ---------- menus ----------
function openPause() { if (!G || G.demo || G.menu) return; G.menu = 'pause'; $('pausemenu').classList.remove('hidden'); }
function closePause() { G.menu = null; $('pausemenu').classList.add('hidden'); }
