// ===== Map Editor =====
'use strict';
const ED_OBJECTS = [
  { k: 'tree', v: 0, label: 'Oak tree', icon: 'woodi' }, { k: 'tree', v: 1, label: 'Pine tree', icon: 'woodi' }, { k: 'tree', v: 2, label: 'Palm tree', icon: 'woodi' },
  { k: 'shrub', label: 'Shrub (decor)', icon: 'food' }, { k: 'berry', label: 'Berry bush', icon: 'food' }, { k: 'gold', label: 'Gold', icon: 'gold' }, { k: 'stone', label: 'Stone', icon: 'stone' },
  { k: 'fish', v: 0, label: 'Shore fish', icon: 'fish' }, { k: 'fish', v: 1, label: 'Deep fish', icon: 'fish' }, { k: 'relic', label: 'Relic', icon: 'relicicon' },
  { k: 'unit', t: 'sheep', label: 'Sheep' }, { k: 'unit', t: 'deer', label: 'Deer' }, { k: 'unit', t: 'boar', label: 'Wild Boar' }, { k: 'unit', t: 'wolf', label: 'Wolf' },
];
const ED_UNITS = ['villager', 'scout', 'militia', 'spearman', 'archer', 'skirmisher', 'knight', 'cavarcher', 'monk', 'ram', 'mangonel', 'trebuchet', 'fishingship', 'transport', 'galley', 'fireship', 'demoship', 'tradecart'];
const Editor = {
  active: false, tool: 'terrain', terrain: T.GRASS, obj: null, owner: 1, brush: 2, undo: [], redo: [], players: [], name: 'My Map', sel: null, painting: false,
  savedList() { try { return Object.keys(JSON.parse(localStorage.getItem('aoe_maps') || '{}')); } catch (e) { return []; } },
  load(name) { try { const m = JSON.parse(localStorage.getItem('aoe_maps') || '{}'); return m[name] ? JSON.parse(JSON.stringify(m[name])) : null; } catch (e) { return null; } },
  store(name, spec) { const m = JSON.parse(localStorage.getItem('aoe_maps') || '{}'); m[name] = spec; localStorage.setItem('aoe_maps', JSON.stringify(m)); },
  open(name) {
    UI.gameRunning = false; this.active = true;
    showScreen('editor'); resize();
    if (!this.ui) this.buildUI();
    let spec = name ? this.load(name) : null;
    if (spec) { this.name = name; this.loadSpec(spec); }
    else if (!W || !this.players.length) this.newGenerated('coastal', 'small', (Math.random() * 1e6) | 0, 3);
    else this.loadSpec(this.toSpec());
    this.refreshUI();
  },
  close() { this.active = false; showScreen('menu'); },
  newGenerated(type, size, seed, np) {
    const spec = generateMapSpec({ size, seed, mapType: type, numPlayers: np });
    spec.players = spec.players.map((p, i) => ({ start: p.start, civ: Object.keys(CIVS)[i % 9], color: i, team: 0 }));
    this.loadSpec(spec); this.undo = []; this.redo = [];
  },
  newBlank(size) {
    const n = MAP_SIZES[size] || 80; const spec = blankMapSpec(n);
    spec.players = [{ start: null, civ: 'franks', color: 0, team: 0 }, { start: null, civ: 'teutons', color: 1, team: 0 }];
    this.loadSpec(spec); this.undo = []; this.redo = [];
  },
  loadSpec(spec) {
    this.players = spec.players.map((p, i) => ({ start: p.start ? { x: p.start.x, y: p.start.y } : null, civ: p.civ || Object.keys(CIVS)[i % 9], color: p.color !== undefined ? p.color : i, team: p.team || 0 }));
    const players = this.players.map((p, i) => ({ name: i === 0 ? 'You (human)' : 'Computer ' + i, civ: p.civ, color: PLAYER_COLORS[p.color % 8], human: i === 0, team: p.team }));
    // players array for createWorld must exist; strip starts so no TCs get auto-created
    const s2 = Object.assign({}, spec, { players: spec.players.map(() => ({ start: null })) });
    createWorld(s2, { players, seed: 1, fog: 'none', startRes: 'standard', startAge: 0 });
    W.editor = true;
    invalidateTerrain(); R.spriteCache.clear(); MM.baseVer = -1;
    centerCamOn(W.n / 2, W.n / 2); R.cam.zoom = 0.8;
    this.sel = null;
  },
  toSpec() {
    const map = W.map, objects = [];
    for (const e of W.list) {
      if (e.kind === 'res') { if (e.type === 'carcass') continue; objects.push({ k: e.type, x: e.x, y: e.y, v: e.v || 0 }); }
      else if (e.kind === 'relic') objects.push({ k: 'relic', x: e.x, y: e.y });
      else if (e.kind === 'unit') objects.push({ k: 'unit', t: e.type, x: Math.floor(e.x), y: Math.floor(e.y), o: e.owner });
      else if (e.kind === 'bld') objects.push({ k: 'bld', t: e.type, x: e.x, y: e.y, o: e.owner });
    }
    return { name: this.name, n: W.n, ter: Array.from(map.ter), elev: Array.from(map.elev), objects, players: this.players.map(p => ({ start: p.start, civ: p.civ, color: p.color, team: p.team })) };
  },
  snapshot() { this.undo.push(JSON.stringify(this.toSpec())); if (this.undo.length > 60) this.undo.shift(); this.redo = []; },
  doUndo() { if (!this.undo.length) return; this.redo.push(JSON.stringify(this.toSpec())); const s = JSON.parse(this.undo.pop()); const cam = Object.assign({}, R.cam); this.loadSpec(s); Object.assign(R.cam, cam); this.refreshUI(); },
  doRedo() { if (!this.redo.length) return; this.undo.push(JSON.stringify(this.toSpec())); const s = JSON.parse(this.redo.pop()); const cam = Object.assign({}, R.cam); this.loadSpec(s); Object.assign(R.cam, cam); this.refreshUI(); },
  validate(spec) {
    const errs = [], n = spec.n;
    if (!spec.players || spec.players.length < 2) errs.push('At least 2 players are required (you + one computer).');
    const tcs = spec.objects.filter(o => o.k === 'bld' && o.t === 'tc');
    spec.players.forEach((p, i) => { if (!p.start && !tcs.some(t => t.o === i + 1)) errs.push(`Player ${i + 1} has no Town Center or starting location.`); });
    // overlapping
    const occ = new Map();
    for (const o of spec.objects) {
      if (o.k === 'unit' || o.k === 'shrub') continue;
      const s = o.k === 'bld' ? BUILDINGS[o.t].size : 1;
      for (let y = o.y; y < o.y + s; y++) for (let x = o.x; x < o.x + s; x++) {
        const k = y * n + x; if (occ.has(k)) { errs.push(`Overlapping placement at (${x},${y}): ${occ.get(k)} and ${o.t || o.k}.`); break; }
        occ.set(k, o.t || o.k);
        const water = isWaterT(spec.ter[k]);
        if (o.k === 'fish' && !water) errs.push(`Fish placed on land at (${x},${y}).`);
        if (o.k !== 'fish' && o.k !== 'bld' && water) errs.push(`${o.k} placed on water at (${x},${y}).`);
        if (o.k === 'bld' && (!!BUILDINGS[o.t].water) !== water) errs.push(`${BUILDINGS[o.t].name} at (${o.x},${o.y}) is on invalid terrain.`);
      }
    }
    for (const o of spec.objects) if (o.k === 'unit') { const water = isWaterT(spec.ter[o.y * n + o.x]); if (UNITS[o.t].naval && !water) errs.push(`Ship (${UNITS[o.t].name}) placed on land at (${o.x},${o.y}).`); if (!UNITS[o.t].naval && water) errs.push(`${UNITS[o.t].name} placed on water at (${o.x},${o.y}).`); if (o.o > spec.players.length) errs.push(`${UNITS[o.t].name} owned by missing player ${o.o}.`); }
    for (const o of spec.objects) if (o.k === 'bld' && o.o > spec.players.length) errs.push(`Building owned by missing player ${o.o}.`);
    return [...new Set(errs)].slice(0, 12);
  },
  buildUI() {
    const E = $('#editor');
    E.innerHTML = `<div id="ed-side" class="panel">
      <h2>Map Editor</h2>
      <div class="ed-sec"><b>File</b><div class="row">
        <select id="ed-gtype"><option value="land">Highlands</option><option value="coastal" selected>Coastal</option><option value="islands">Islands</option></select>
        <select id="ed-gsize">${Object.keys(MAP_SIZES).map(k => `<option ${k === 'small' ? 'selected' : ''}>${k}</option>`).join('')}</select></div>
        <div class="row"><button class="btn small" id="ed-gen">New generated</button><button class="btn small" id="ed-blank">New blank</button></div>
        <div class="row"><input id="ed-name" value="My Map" maxlength="30"><button class="btn small" id="ed-save">Save</button></div>
        <div class="row"><select id="ed-list"></select><button class="btn small" id="ed-load">Load</button><button class="btn small" id="ed-del">🗑</button></div>
        <div class="row"><button class="btn small" id="ed-export">Export file</button><label class="btn small">Import file<input type="file" id="ed-import" accept=".json,application/json" hidden></label></div>
        <div class="row"><button class="btn primary" id="ed-play">▶ Save & Play</button><button class="btn small" id="ed-validate">Validate</button><button class="btn small" id="ed-exit">Exit</button></div>
      </div>
      <div class="ed-sec"><b>Tools</b><div class="row tools">
        <button class="tool" data-tool="select" title="Select / move (drag) — Delete key removes">✥ Select</button>
        <button class="tool" data-tool="erase" title="Erase objects in brush">⌫ Erase</button>
        <button class="tool" data-tool="start" title="Set the owner's starting location">⚑ Start</button>
        <button class="tool" data-tool="raise" title="Raise elevation">⛰ Raise</button>
        <button class="tool" data-tool="lower" title="Lower elevation">⬇ Lower</button>
        <button class="tool" data-tool="flatten" title="Flatten to level of first tile">▭ Flatten</button>
      </div>
      <div class="row">Brush <input type="range" id="ed-brush" min="1" max="8" value="2"><span id="ed-bv">2</span>
      <button class="btn small" id="ed-undo" title="Ctrl+Z">↶ Undo</button><button class="btn small" id="ed-redo" title="Ctrl+Y">↷ Redo</button></div></div>
      <div class="ed-sec"><b>Terrain</b><div class="row pal" id="ed-ter"></div></div>
      <div class="ed-sec"><b>Objects & animals</b><div class="pal" id="ed-obj"></div></div>
      <div class="ed-sec"><b>Units</b> <span class="small">(owner below)</span><div class="pal" id="ed-units"></div></div>
      <div class="ed-sec"><b>Buildings</b><div class="pal" id="ed-blds"></div></div>
      <div class="ed-sec"><b>Players</b> <span class="small">P1 is you (human); others are computer players</span><div id="ed-players"></div><button class="btn small" id="ed-addp">+ Add computer player</button></div>
      <div id="ed-status" class="small"></div>
    </div>
    <div id="ed-current" class="panel"></div>`;
    this.ui = true;
    const ter = $('#ed-ter');
    [T.GRASS, T.DIRT, T.SAND, T.FOREST, T.ROCK, T.SHALLOW, T.WATER, T.DEEP].forEach(t => { const b = el('button', 'sw-btn', ''); b.style.background = TER_COL[t]; b.title = TER_NAMES[t]; b.dataset.ter = t; b.onclick = () => { this.tool = 'terrain'; this.terrain = t; this.refreshUI(); }; ter.appendChild(b); });
    const mk = (box, item, iconKey, label) => { const b = el('button', 'pal-btn'); b.style.backgroundImage = `url(${iconFor(iconKey)})`; b.title = label; b.onclick = () => { this.tool = 'object'; this.obj = item; this.refreshUI(); }; item.el = b; box.appendChild(b); };
    ED_OBJECTS.forEach(o => mk($('#ed-obj'), o, o.k === 'unit' ? 'unit:' + o.t : o.icon, o.label));
    ED_UNITS.forEach(t => mk($('#ed-units'), { k: 'unit', t, label: UNITS[t].name }, 'unit:' + t, UNITS[t].name));
    Object.keys(BUILDINGS).forEach(t => mk($('#ed-blds'), { k: 'bld', t, label: BUILDINGS[t].name }, 'bld:' + t, BUILDINGS[t].name));
    for (const b of document.querySelectorAll('#ed-side .tool')) b.onclick = () => { this.tool = b.dataset.tool; this.refreshUI(); };
    $('#ed-brush').oninput = e => { this.brush = +e.target.value; $('#ed-bv').textContent = this.brush; };
    $('#ed-undo').onclick = () => this.doUndo(); $('#ed-redo').onclick = () => this.doRedo();
    $('#ed-gen').onclick = () => { this.snapshot(); this.newGenerated($('#ed-gtype').value, $('#ed-gsize').value, (Math.random() * 1e6) | 0, Math.max(2, this.players.length || 3)); this.refreshUI(); };
    $('#ed-blank').onclick = () => { this.snapshot(); this.newBlank($('#ed-gsize').value); this.refreshUI(); };
    $('#ed-save').onclick = () => { this.name = $('#ed-name').value.trim() || 'My Map'; this.store(this.name, this.toSpec()); this.status(`Saved "${this.name}".`); this.refreshUI(); };
    $('#ed-load').onclick = () => { const n = $('#ed-list').value; if (!n) return; const s = this.load(n); if (s) { this.name = n; this.loadSpec(s); this.undo = []; this.redo = []; this.refreshUI(); this.status(`Loaded "${n}".`); } };
    $('#ed-del').onclick = () => { const n = $('#ed-list').value; if (!n || !confirm(`Delete saved map "${n}"?`)) return; const m = JSON.parse(localStorage.getItem('aoe_maps') || '{}'); delete m[n]; localStorage.setItem('aoe_maps', JSON.stringify(m)); this.refreshUI(); };
    $('#ed-export').onclick = () => { const s = this.toSpec(); const blob = new Blob([JSON.stringify(s)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (this.name || 'map').replace(/[^\w-]+/g, '_') + '.aoemap.json'; a.click(); this.status('Exported ' + a.download); };
    $('#ed-import').onchange = e => { const f = e.target.files[0]; if (!f) return; f.text().then(t => { try { const s = JSON.parse(t); if (!s.n || !s.ter || !s.objects) throw new Error('Not a map file'); this.snapshot(); this.name = s.name || f.name; this.loadSpec(s); this.refreshUI(); this.status('Imported ' + f.name); } catch (err) { alert('Import failed: ' + err.message); } }); e.target.value = ''; };
    $('#ed-validate').onclick = () => { const errs = this.validate(this.toSpec()); this.status(errs.length ? '<span class="warn">' + errs.join('<br>') + '</span>' : '✔ Map is valid and playable.'); };
    $('#ed-play').onclick = () => this.play();
    $('#ed-exit').onclick = () => this.close();
    $('#ed-addp').onclick = () => { if (this.players.length >= 8) return; this.snapshot(); const used = new Set(this.players.map(p => p.color)); let c = 0; while (used.has(c)) c++; this.players.push({ start: null, civ: Object.keys(CIVS)[this.players.length % 9], color: c, team: 0 }); this.reloadKeep(); };
    const cv = $('#game');
    cv.addEventListener('mousedown', e => this.mouseDown(e));
    cv.addEventListener('mousemove', e => this.mouseMove(e));
    window.addEventListener('mouseup', e => this.mouseUp(e));
    cv.addEventListener('wheel', e => { if (!this.active) return; e.preventDefault(); R.cam.zoom = Math.max(0.4, Math.min(1.8, R.cam.zoom * (e.deltaY < 0 ? 1.1 : 0.9))); }, { passive: false });
    window.addEventListener('keydown', e => {
      if (!this.active || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? this.doRedo() : this.doUndo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); this.doRedo(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { if (this.sel && !this.sel.dead) { this.snapshot(); removeEnt(this.sel); this.sel = null; } }
      else if (e.key.startsWith('Arrow')) { UI.keys.add(e.key); e.preventDefault(); }
    });
    window.addEventListener('keyup', e => UI.keys.delete(e.key));
  },
  reloadKeep() { const cam = Object.assign({}, R.cam); this.loadSpec(this.toSpec()); Object.assign(R.cam, cam); this.refreshUI(); },
  status(h) { $('#ed-status').innerHTML = h; },
  refreshUI() {
    $('#ed-name').value = this.name;
    $('#ed-list').innerHTML = this.savedList().map(n => `<option ${n === this.name ? 'selected' : ''}>${n}</option>`).join('');
    for (const b of document.querySelectorAll('#ed-side .tool')) b.classList.toggle('on', b.dataset.tool === this.tool);
    for (const b of document.querySelectorAll('#ed-ter .sw-btn')) b.classList.toggle('on', this.tool === 'terrain' && +b.dataset.ter === this.terrain);
    for (const b of document.querySelectorAll('.pal-btn')) b.classList.remove('on');
    if (this.tool === 'object' && this.obj && this.obj.el) this.obj.el.classList.add('on');
    // players
    const pl = $('#ed-players');
    pl.innerHTML = this.players.map((p, i) => `<div class="ed-pl ${this.owner === i + 1 ? 'on' : ''}" data-i="${i}">
      <span class="sw" style="background:${PLAYER_COLORS[p.color % 8].c}"></span><b>P${i + 1}</b> ${i === 0 ? '(You)' : '(AI)'}
      <select data-civ="${i}">${Object.keys(CIVS).map(k => `<option value="${k}" ${p.civ === k ? 'selected' : ''}>${CIVS[k].name}</option>`).join('')}</select>
      <select data-col="${i}">${PLAYER_COLORS.map((c, ci) => `<option value="${ci}" ${p.color === ci ? 'selected' : ''}>${c.name}</option>`).join('')}</select>
      Team <select data-team="${i}">${[0, 1, 2, 3, 4].map(t => `<option value="${t}" ${p.team === t ? 'selected' : ''}>${t || '-'}</option>`).join('')}</select>
      ${p.start ? '⚑' : ''} ${i >= 2 ? `<button class="btn small" data-rm="${i}">✕</button>` : ''}</div>`).join('') + `<div class="ed-pl ${this.owner === 0 ? 'on' : ''}" data-i="-1"><span class="sw" style="background:#ddd6c0"></span><b>Gaia</b> (nature/neutral)</div>`;
    pl.querySelectorAll('.ed-pl').forEach(d => d.onclick = e => { if (e.target.tagName === 'SELECT' || e.target.tagName === 'BUTTON') return; this.owner = +d.dataset.i + 1; this.refreshUI(); });
    pl.querySelectorAll('[data-civ]').forEach(s => s.onchange = () => { this.players[+s.dataset.civ].civ = s.value; this.reloadKeep(); });
    pl.querySelectorAll('[data-col]').forEach(s => s.onchange = () => { this.players[+s.dataset.col].color = +s.value; this.reloadKeep(); });
    pl.querySelectorAll('[data-team]').forEach(s => s.onchange = () => { this.players[+s.dataset.team].team = +s.value; });
    pl.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { this.snapshot(); const i = +b.dataset.rm; const spec = this.toSpec(); spec.objects = spec.objects.filter(o => !((o.k === 'unit' || o.k === 'bld') && o.o === i + 1)).map(o => (o.o > i + 1 ? Object.assign(o, { o: o.o - 1 }) : o)); spec.players.splice(i, 1); const cam = Object.assign({}, R.cam); this.loadSpec(spec); Object.assign(R.cam, cam); if (this.owner > this.players.length) this.owner = 1; this.refreshUI(); });
    // current palette item
    let cur = '';
    if (this.tool === 'terrain') cur = `<span class="sw big" style="background:${TER_COL[this.terrain]}"></span> Painting: <b>${TER_NAMES[this.terrain]}</b>`;
    else if (this.tool === 'object' && this.obj) cur = `<span class="pal-btn cur" style="background-image:url(${iconFor(this.obj.k === 'unit' ? 'unit:' + this.obj.t : this.obj.k === 'bld' ? 'bld:' + this.obj.t : ED_OBJECTS.find(o => o === this.obj) ? this.obj.icon : 'woodi')})"></span> Placing: <b>${this.obj.label}</b>${this.obj.k === 'unit' || this.obj.k === 'bld' ? ` for <b style="color:${this.owner ? PLAYER_COLORS[this.players[this.owner - 1].color % 8].c : '#ddd'}">${this.owner ? 'P' + this.owner : 'Gaia'}</b>` : ''}`;
    else cur = `Tool: <b>${this.tool}</b>${this.tool === 'start' ? ` for P${this.owner || 1}` : ''}`;
    $('#ed-current').innerHTML = cur + `<span class="small dim"> · Left-click/drag to apply · Right-drag or arrows to pan · wheel to zoom · Ctrl+Z / Ctrl+Y</span>`;
  },
  tilesInBrush(t) { const out = [], r = this.brush - 1; const cx = Math.floor(t.x), cy = Math.floor(t.y); for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if (W.map.inb(x, y) && Math.hypot(x - cx, y - cy) <= r + 0.5) out.push({ x, y }); return out; },
  mouseDown(e) {
    if (!this.active) return;
    const t = screenToTile(e.offsetX, e.offsetY);
    if (e.button === 2) { this.pan = { x: e.clientX, y: e.clientY, cx: R.cam.x, cy: R.cam.y }; return; }
    if (e.button !== 0) return;
    if (this.tool === 'select') {
      const h = hitTest(e.offsetX, e.offsetY, { editor: true });
      this.sel = h; if (h) { this.snapshot(); this.moving = { ent: h }; }
      return;
    }
    this.snapshot(); this.painting = true; this.flatLevel = W.map.elevAt(t.x, t.y); this.lastApplied = null;
    this.apply(t);
  },
  mouseMove(e) {
    if (!this.active) return;
    UI.mouse.x = e.offsetX; UI.mouse.y = e.offsetY; UI.mouse.inCanvas = true;
    if (this.pan) { R.cam.x = this.pan.cx - (e.clientX - this.pan.x) / R.cam.zoom; R.cam.y = this.pan.cy - (e.clientY - this.pan.y) / R.cam.zoom; return; }
    const t = screenToTile(e.offsetX, e.offsetY);
    if (this.moving) { this.moveEnt(this.moving.ent, t); return; }
    if (this.painting && (this.tool === 'terrain' || this.tool === 'erase' || this.tool === 'flatten' || (this.tool === 'object' && this.obj && this.obj.k !== 'bld' && this.obj.k !== 'unit'))) this.apply(t);
  },
  mouseUp(e) { if (!this.active) return; this.painting = false; this.pan = null; this.moving = null; },
  moveEnt(e, t) {
    const x = Math.floor(t.x), y = Math.floor(t.y);
    if (e.kind === 'unit') { const naval = !!UNITS[e.type].naval; if (W.map.isWater(x, y) === naval && !W.map.blk[W.map.idx(x, y)]) { e.x = x + 0.5; e.y = y + 0.5; } return; }
    if (e.kind === 'bld') {
      const s = bsize(e); const nx = x - Math.floor(s / 2), ny = y - Math.floor(s / 2);
      if (nx === e.x && ny === e.y) return;
      // temporarily unblock
      for (let yy = e.y; yy < e.y + s; yy++) for (let xx = e.x; xx < e.x + s; xx++) if (W.map.blk[W.map.idx(xx, yy)] === e.id) W.map.blk[W.map.idx(xx, yy)] = 0;
      const ok = !canPlace(null, e.type, nx, ny, true);
      if (ok) { e.x = nx; e.y = ny; }
      if (!BUILDINGS[e.type].farm) for (let yy = e.y; yy < e.y + s; yy++) for (let xx = e.x; xx < e.x + s; xx++) W.map.blk[W.map.idx(xx, yy)] = e.id;
      return;
    }
    if (e.kind === 'res' || e.kind === 'relic') {
      const water = W.map.isWater(x, y);
      if (W.map.blk[W.map.idx(x, y)] || (e.type === 'fish') !== water) return;
      if (e.kind === 'res' && e.type !== 'shrub') { W.map.blk[W.map.idx(e.x, e.y)] = 0; W.map.blk[W.map.idx(x, y)] = e.id; }
      e.x = x; e.y = y;
    }
  },
  apply(t) {
    const map = W.map;
    const key = Math.floor(t.x) + ',' + Math.floor(t.y);
    if (this.lastApplied === key && this.tool !== 'raise' && this.tool !== 'lower') return;
    this.lastApplied = key;
    const tiles = this.tilesInBrush(t);
    if (this.tool === 'terrain' || this.tool === 'raise' || this.tool === 'lower' || this.tool === 'flatten') {
      for (const { x, y } of tiles) {
        const i = map.idx(x, y);
        if (this.tool === 'terrain') {
          const was = isWaterT(map.ter[i]), now = isWaterT(this.terrain);
          map.ter[i] = this.terrain;
          if (now) map.elev[i] = 0;
          if (was !== now) this.clearIncompatible(x, y, now);
        } else if (this.tool === 'raise') { if (!isWaterT(map.ter[i])) map.elev[i] = Math.min(4, map.elev[i] + 1); }
        else if (this.tool === 'lower') map.elev[i] = Math.max(0, map.elev[i] - 1);
        else if (!isWaterT(map.ter[i])) map.elev[i] = this.flatLevel;
      }
      this.terrainChanged(tiles);
      return;
    }
    if (this.tool === 'erase') {
      for (const e of W.list.slice()) { const c = center(e); if (tiles.some(q => Math.floor(c.x) === q.x && Math.floor(c.y) === q.y) || (e.kind === 'bld' && tiles.some(q => q.x >= e.x && q.x < e.x + bsize(e) && q.y >= e.y && q.y < e.y + bsize(e)))) removeEnt(e); }
      return;
    }
    if (this.tool === 'start') {
      const pi = Math.max(1, this.owner) - 1; this.players[pi].start = { x: Math.floor(t.x), y: Math.floor(t.y) }; this.refreshUI(); return;
    }
    if (this.tool === 'object' && this.obj) {
      const o = this.obj;
      if (o.k === 'bld') {
        const s = BUILDINGS[o.t].size; const x = Math.floor(t.x - s / 2 + 0.5), y = Math.floor(t.y - s / 2 + 0.5);
        if (!this.owner) { this.status('<span class="warn">Choose a player (not Gaia) as the owner for buildings.</span>'); return; }
        const err = canPlace(null, o.t, x, y, true); if (err) { this.status('<span class="warn">' + err + '</span>'); return; }
        spawnBuilding(o.t, this.owner, x, y, true); this.status(`Placed ${BUILDINGS[o.t].name} for P${this.owner}.`);
        return;
      }
      const list = o.k === 'unit' ? [{ x: Math.floor(t.x), y: Math.floor(t.y) }] : tiles.filter(() => this.brush === 1 || Math.random() < 0.55);
      for (const { x, y } of list) {
        const i = map.idx(x, y); const water = isWaterT(map.ter[i]);
        if (o.k === 'unit') {
          const d = UNITS[o.t];
          if (!!d.naval !== water) { this.status(`<span class="warn">${d.name} cannot be placed on ${water ? 'water' : 'land'}.</span>`); continue; }
          if (map.blk[i]) { this.status('<span class="warn">Tile is occupied.</span>'); continue; }
          const owner = d.animal ? 0 : this.owner;
          if (!d.animal && !owner) { this.status('<span class="warn">Choose a player owner for units.</span>'); continue; }
          spawnUnit(o.t, owner, x + 0.5, y + 0.5);
          continue;
        }
        if (map.blk[i]) continue;
        if (o.k === 'fish' ? !water : water) { if (list.length === 1) this.status(`<span class="warn">${o.label} must be placed on ${o.k === 'fish' ? 'water' : 'land'}.</span>`); continue; }
        if (W.list.some(e => (e.kind === 'relic' || (e.kind === 'res' && e.type === 'shrub')) && e.x === x && e.y === y)) continue;
        if (o.k !== 'shrub' && W.list.some(e => e.kind === 'unit' && Math.floor(e.x) === x && Math.floor(e.y) === y)) continue;
        spawnRes(o.k, x, y, o.v || 0);
        if (o.k === 'tree' && map.ter[i] === T.GRASS) { map.ter[i] = T.FOREST; }
      }
      if (o.k === 'tree') this.terrainChanged(list);
    }
  },
  clearIncompatible(x, y, water) {
    for (const e of W.list.slice()) {
      const c = center(e);
      if (e.kind === 'bld') { const s = bsize(e); if (x >= e.x && x < e.x + s && y >= e.y && y < e.y + s && !!BUILDINGS[e.type].water !== water) removeEnt(e); continue; }
      if (Math.floor(c.x) !== x || Math.floor(c.y) !== y) continue;
      if (e.kind === 'unit' && !!UNITS[e.type].naval !== water) removeEnt(e);
      else if ((e.kind === 'res' || e.kind === 'relic') && (e.type === 'fish') !== water) removeEnt(e);
    }
  },
  terrainChanged(tiles) {
    const map = W.map; map.computeVH(); R.mapVersion = map.version;
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; for (const q of tiles) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
    invalidateTiles(x0 - 1, y0 - 1, x1 + 1, y1 + 1);
  },
  play() {
    this.name = $('#ed-name').value.trim() || this.name || 'My Map';
    const spec = this.toSpec();
    const errs = this.validate(spec);
    if (errs.length) { this.status('<span class="warn">Cannot launch:<br>' + errs.join('<br>') + '</span>'); Sound.play('error'); return; }
    this.store(this.name, spec);
    UI.fromEditorName = this.name;
    this.active = false;
    const cfg = Object.assign(loadSetup(), { mapType: 'custom', customMap: this.name, civ: this.players[0].civ, color: this.players[0].color % 8, opponents: this.players.length - 1, teams: 'ffa' });
    if (!cfg.seed) cfg.seed = 1;
    launchFromSetup(cfg);
  },
  frame(dt) {
    const ctx = R.ctx;
    R.time += dt;
    scrollCamera(dt);
    renderWorld(ctx, { editor: true, selection: new Set(this.sel ? [this.sel] : []) });
    camTransform(ctx);
    // starts
    this.players.forEach((p, i) => {
      if (!p.start) return; const g = iso(p.start.x + 0.5, p.start.y + 0.5, W.map.h(p.start.x + 0.5, p.start.y + 0.5));
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.lineTo(g.x, g.y - 36); ctx.stroke();
      ctx.fillStyle = PLAYER_COLORS[p.color % 8].c; ctx.beginPath(); ctx.moveTo(g.x, g.y - 36); ctx.lineTo(g.x + 20, g.y - 30); ctx.lineTo(g.x, g.y - 22); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.fillText('P' + (i + 1) + ' start', g.x + 4, g.y + 14);
    });
    // brush preview
    if (UI.mouse.inCanvas && this.tool !== 'select') {
      const t = screenToTile(UI.mouse.x, UI.mouse.y);
      if (this.tool === 'object' && this.obj && this.obj.k === 'bld') {
        const s = BUILDINGS[this.obj.t].size; const x = Math.floor(t.x - s / 2 + 0.5), y = Math.floor(t.y - s / 2 + 0.5);
        const err = canPlace(null, this.obj.t, x, y, true);
        const gp = iso(x + s / 2, y + s / 2, W.map.h(x + s / 2, y + s / 2));
        ctx.save(); ctx.translate(gp.x, gp.y); poly(ctx, [P(-s / 2, -s / 2, 0), P(s / 2, -s / 2, 0), P(s / 2, s / 2, 0), P(-s / 2, s / 2, 0)], err ? 'rgba(255,40,40,0.35)' : 'rgba(60,255,60,0.3)', err ? '#f44' : '#4f4', 1.5); ctx.restore();
      } else {
        for (const q of (this.tool === 'object' && this.obj && this.obj.k === 'unit') || this.tool === 'start' ? [{ x: Math.floor(t.x), y: Math.floor(t.y) }] : this.tilesInBrush(t)) {
          const a = iso(q.x, q.y, W.map.h(q.x, q.y)), b = iso(q.x + 1, q.y, W.map.h(q.x + 1, q.y)), c = iso(q.x + 1, q.y + 1, W.map.h(q.x + 1, q.y + 1)), d = iso(q.x, q.y + 1, W.map.h(q.x, q.y + 1));
          poly(ctx, [[a.x, a.y], [b.x, b.y], [c.x, c.y], [d.x, d.y]], 'rgba(255,255,255,0.15)', 'rgba(255,255,255,0.6)', 0.8);
        }
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  },
};
