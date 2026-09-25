// Mouse & keyboard control: selection, commands, placement, camera.
import { BUILDINGS } from '../core/data.js';
import { cursorURL } from '../render/icons.js';

export class Controller {
  constructor(app) {
    this.app = app;
    this.sel = new Set();
    this.groups = {};
    this.page = 'main';
    this.mode = null;          // null | 'place' | 'attackMove' | 'repair' | 'garrison'
    this.placing = null;       // { type, wallStart }
    this.mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2, inside: false, moved: false };
    this.drag = null;
    this.pan = null;
    this.keys = new Set();
    this.lastClick = { t: 0, e: null };
    this.lastGroupKey = { k: null, t: 0 };
    this.idleIdx = 0;
    this.lastAlert = null;
    this.cursor = '';
    this.bound = [];
  }

  get game() { return this.app.game; }
  get r() { return this.app.renderer; }
  get pi() { return this.app.viewer; }

  on(target, type, fn, opts) { target.addEventListener(type, fn, opts); this.bound.push([target, type, fn, opts]); }
  attach() {
    const cv = this.app.canvas;
    this.on(cv, 'mousedown', (e) => this.onDown(e));
    this.on(window, 'mousemove', (e) => this.onMove(e));
    this.on(window, 'mouseup', (e) => this.onUp(e));
    this.on(cv, 'contextmenu', (e) => e.preventDefault());
    this.on(cv, 'wheel', (e) => { e.preventDefault(); this.r.zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.1 : 1 / 1.1); }, { passive: false });
    this.on(cv, 'mouseleave', () => { this.mouse.inside = false; });
    this.on(cv, 'mouseenter', (e) => { this.mouse.inside = true; this.mouse.x = e.clientX; this.mouse.y = e.clientY; });
    this.on(document, 'mouseleave', () => { this.mouse.inside = false; });
    this.on(window, 'blur', () => { this.keys.clear(); this.mouse.inside = false; });
    this.on(window, 'keydown', (e) => this.onKey(e));
    this.on(window, 'keyup', (e) => this.keys.delete(e.key));
    const mm = document.getElementById('minimap');
    const miniGo = (e) => {
      const rc = mm.getBoundingClientRect();
      const t = this.app.minimap.fromMini(e.clientX - rc.left, e.clientY - rc.top);
      return t;
    };
    this.on(mm, 'mousedown', (e) => {
      e.preventDefault();
      const t = miniGo(e);
      if (e.button === 2) { this.commandAt(t.x, t.y, null, e.shiftKey); return; }
      this.r.centerOn(t.x, t.y);
      this.miniDrag = true;
    });
    this.on(window, 'mousemove', (e) => { if (this.miniDrag) { const t = miniGo(e); this.r.centerOn(t.x, t.y); } });
    this.on(window, 'mouseup', () => { this.miniDrag = false; });
    this.on(mm, 'contextmenu', (e) => e.preventDefault());
    this.on(document.getElementById('btn-idle'), 'click', () => this.nextIdle(true));
    this.on(document.getElementById('btn-idle-mil'), 'click', () => this.nextIdle(false));
  }
  detach() { for (const [t, ty, fn, o] of this.bound) t.removeEventListener(ty, fn, o); this.bound = []; }

  // ---------------------------------------------------------------- selection helpers
  ownSelection() {
    const out = [];
    for (const e of this.sel) if (e.alive && e.owner === this.pi && !e.garrisonedIn) out.push(e);
    return out;
  }
  ownUnits() { return this.ownSelection().filter((e) => e.kind === 'unit'); }
  select(list) {
    this.sel.clear();
    for (const e of list) if (e && e.alive) this.sel.add(e);
    this.selectionChanged();
  }
  selectionChanged() {
    this.page = 'main';
    if (this.mode && this.mode !== 'place') this.mode = null;
    this.r.ui.selection = this.sel;
    this.app.hud.lastInfoKey = '';
  }
  cleanSelection() {
    let changed = false;
    for (const e of this.sel) if (!e.alive || e.garrisonedIn || (e.kind === 'unit' && e.owner !== this.pi && e.owner >= 0 && !this.game.isVisibleTo(this.pi, e))) { this.sel.delete(e); changed = true; }
    if (changed) this.r.ui.selection = this.sel;
  }

  // ---------------------------------------------------------------- modes
  setMode(m) { this.mode = m; this.placing = null; this.r.ui.placing = null; }
  startPlacement(type) {
    const vils = this.ownUnits().filter((u) => u.isVillager);
    if (!vils.length) return;
    this.mode = 'place';
    this.placing = { type, wallStart: null };
    this.app.audio.play('click');
  }
  cancelMode() {
    if (this.mode === 'place' && this.placing && this.placing.wallStart) { this.placing.wallStart = null; return; }
    this.mode = null; this.placing = null; this.r.ui.placing = null;
  }

  tileAt(sx, sy) { return this.r.screenToTile(sx, sy); }

  // ---------------------------------------------------------------- mouse
  onDown(e) {
    this.app.audio.unlock();
    const x = e.clientX, y = e.clientY;
    this.mouse.x = x; this.mouse.y = y; this.mouse.inside = true;
    if (e.button === 1) { e.preventDefault(); this.pan = { x, y, cx: this.r.cam.x, cy: this.r.cam.y }; return; }
    if (e.button === 2) {
      if (this.mode) { this.cancelMode(); return; }
      const t = this.tileAt(x, y);
      const target = this.r.pick(x, y);
      this.commandAt(t.x, t.y, target, e.shiftKey);
      return;
    }
    if (e.button !== 0) return;
    if (this.mode === 'place') { this.placeClick(e); return; }
    if (this.mode === 'attackMove' || this.mode === 'repair' || this.mode === 'garrison') {
      const t = this.tileAt(x, y);
      const target = this.r.pick(x, y);
      this.modeClick(this.mode, t, target, e.shiftKey);
      if (!e.shiftKey) this.mode = null;
      return;
    }
    this.drag = { x0: x, y0: y, x1: x, y1: y, active: false, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey };
  }

  onMove(e) {
    this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.moved = true;
    if (e.target === this.app.canvas) this.mouse.inside = true;
    if (this.pan) {
      const z = this.r.cam.zoom;
      this.r.cam.x = this.pan.cx - (e.clientX - this.pan.x) / z;
      this.r.cam.y = this.pan.cy - (e.clientY - this.pan.y) / z;
      this.r.clampCam();
      return;
    }
    if (this.drag) {
      this.drag.x1 = e.clientX; this.drag.y1 = e.clientY;
      if (!this.drag.active && Math.hypot(this.drag.x1 - this.drag.x0, this.drag.y1 - this.drag.y0) > 6) this.drag.active = true;
      this.r.ui.dragBox = this.drag.active ? this.drag : null;
    }
  }

  onUp(e) {
    if (e.button === 1) { this.pan = null; return; }
    if (e.button === 0 && this.wallDrag) {
      this.wallDrag = false;
      const p = this.placing;
      if (this.mode === 'place' && p && p.wallStart) {
        const t = this.tileAt(e.clientX, e.clientY);
        if (Math.floor(t.x) !== p.wallStart.x || Math.floor(t.y) !== p.wallStart.y) this.placeClick(e);
      }
      return;
    }
    if (e.button !== 0 || !this.drag) return;
    const d = this.drag;
    this.drag = null;
    this.r.ui.dragBox = null;
    if (d.active) {
      let units = this.r.unitsInRect(d.x0, d.y0, d.x1, d.y1).filter((u) => u.owner === this.pi && u.alive);
      const nonAnimals = units.filter((u) => !u.def.isAnimal);
      if (nonAnimals.length) units = nonAnimals;
      if (d.shift) {
        for (const s of [...this.sel]) if (s.owner !== this.pi || s.kind === 'resource') this.sel.delete(s);
        for (const u of units) this.sel.add(u);
        this.selectionChanged();
      }
      else if (units.length) this.select(units);
      else if (!d.shift) this.select([]);
      if (units.length) this.app.audio.selectSound(units[0]);
      return;
    }
    // click
    const x = e.clientX, y = e.clientY;
    const ent = this.r.pick(x, y);
    const now = performance.now();
    const dbl = ent && this.lastClick.e === ent && now - this.lastClick.t < 350;
    this.lastClick = { t: now, e: ent };
    if (!ent) { if (!d.shift) this.select([]); return; }
    if ((dbl || d.ctrl) && ent.owner === this.pi && ent.kind === 'unit') {
      const same = this.visibleOwn().filter((u) => u.type === ent.type);
      this.select(same);
      return;
    }
    if ((dbl || d.ctrl) && ent.owner === this.pi && ent.kind === 'building' && ent.complete) {
      const same = new Set();
      for (const b of this.r.picks) if (b.pri === 2 && b.e.kind === 'building' && b.e.owner === this.pi && b.e.type === ent.type && b.e.complete) same.add(b.e);
      same.add(ent);
      this.select([...same]);
      return;
    }
    if (d.shift && ent.owner === this.pi && (ent.kind === 'unit' || ent.kind === 'building')) {
      if (this.sel.has(ent)) this.sel.delete(ent); else {
        // do not mix foreign or resources in a multi-selection
        for (const s of [...this.sel]) if (s.owner !== this.pi) this.sel.delete(s);
        this.sel.add(ent);
      }
      this.selectionChanged();
    } else this.select([ent]);
    this.app.audio.selectSound(ent);
  }

  visibleOwn() {
    const out = [];
    for (const b of this.r.picks) if (b.pri === 3 && b.e.owner === this.pi) out.push(b.e);
    return out;
  }

  // ---------------------------------------------------------------- commands
  commandAt(x, y, target, shift) {
    const g = this.game;
    const own = this.ownSelection();
    if (!own.length) return;
    const units = own.filter((e) => e.kind === 'unit');
    const blds = own.filter((e) => e.kind === 'building');
    if (target && target.kind === 'resource' && target.size && !this.game.players[this.pi].explored[target.ty * g.n + target.tx]) target = null;
    if (!units.length && blds.length) {
      for (const b of blds) g.cmdRally(b, x, y, target);
      this.r.fx.marker(x, y, 'move', this.r.time);
      this.app.audio.play('click');
      return;
    }
    if (!units.length) return;
    const kind = g.cmdSmart(units, x, y, target, shift);
    const mk = kind === 'attack' || kind === 'convert' ? 'attack' : kind === 'gather' || kind === 'build' || kind === 'repair' || kind === 'return' ? 'gather' : 'move';
    const mx = target && target.alive ? target.x : x, my = target && target.alive ? target.y : y;
    this.r.fx.marker(mx, my, mk, this.r.time);
    this.app.audio.ackSound(units[0], kind);
  }

  modeClick(mode, t, target, shift) {
    const g = this.game;
    const units = this.ownUnits();
    if (!units.length) return;
    if (mode === 'attackMove') {
      g.cmdMove(units.filter((u) => !u.isVillager), t.x, t.y, { attackMove: true, queue: shift });
      this.r.fx.marker(t.x, t.y, 'attack', this.r.time);
      this.app.audio.ackSound(units[0], 'attack');
    } else if (mode === 'repair') {
      if (target && target.kind === 'building' && target.owner === this.pi) {
        g.cmdRepair(units.filter((u) => u.isVillager), target, shift);
        this.r.fx.marker(target.x, target.y, 'build', this.r.time);
        this.app.audio.ackSound(units[0], 'build');
      }
    } else if (mode === 'garrison') {
      if (target && target.kind === 'building' && target.owner === this.pi && target.def.garrison) {
        g.cmdGarrison(units, target);
        this.r.fx.marker(target.x, target.y, 'move', this.r.time);
        this.app.audio.ackSound(units[0], 'move');
      }
    }
  }

  placementTiles() {
    const p = this.placing;
    if (!p) return null;
    const def = BUILDINGS[p.type];
    const t = this.tileAt(this.mouse.x, this.mouse.y);
    const g = this.game;
    const aff = g.canAfford(this.pi, def.cost);
    if (def.isWall && !def.isGate && p.wallStart) {
      const end = { x: Math.floor(t.x), y: Math.floor(t.y) };
      const line = g.wallLine(p.wallStart.x, p.wallStart.y, end.x, end.y);
      let budget = Math.floor(Math.min(...Object.entries(def.cost).map(([r, c]) => g.players[this.pi].res[r] / c)));
      return line.map((q) => ({ x: q.x, y: q.y, ok: g.canPlace(this.pi, p.type, q.x, q.y) && budget-- > 0 }));
    }
    const s = def.size;
    const tx = Math.round(t.x - s / 2), ty = Math.round(t.y - s / 2);
    return [{ x: tx, y: ty, ok: aff && g.canPlace(this.pi, p.type, tx, ty) }];
  }

  placeClick(e) {
    const g = this.game, p = this.placing;
    const def = BUILDINGS[p.type];
    const vils = this.ownUnits().filter((u) => u.isVillager);
    if (!vils.length) { this.cancelMode(); return; }
    if (def.isWall && !def.isGate) {
      const t = this.tileAt(e.clientX, e.clientY);
      if (!p.wallStart) { p.wallStart = { x: Math.floor(t.x), y: Math.floor(t.y) }; this.wallDrag = true; return; }
      const r = g.cmdPlaceWall(this.pi, p.type, p.wallStart.x, p.wallStart.y, Math.floor(t.x), Math.floor(t.y), vils, e.shiftKey);
      if (!r.ok) { this.app.hud.message(r.reason, 'alert', 2500); this.app.audio.play('error'); return; }
      this.app.audio.play('place');
      if (e.shiftKey) p.wallStart = null; else this.cancelMode();
      if (!e.shiftKey) this.mode = null;
      return;
    }
    const tiles = this.placementTiles();
    const tt = tiles[0];
    const r = g.cmdPlace(this.pi, p.type, tt.x, tt.y, vils, e.shiftKey);
    if (!r.ok) { this.app.hud.message(r.reason, 'alert', 2500); this.app.audio.play('error'); return; }
    this.app.audio.play('place');
    this.r.fx.dust(...this.r.iso(tt.x + def.size / 2, tt.y + def.size / 2), 6, 0.6);
    if (!e.shiftKey) { this.mode = null; this.placing = null; this.r.ui.placing = null; this.page = 'main'; }
  }

  deleteSelection() {
    const own = this.ownSelection();
    if (!own.length) return;
    for (const e of own) this.game.cmdDelete(e);
    this.select([]);
    this.app.audio.play('delete');
  }

  nextIdle(villager) {
    const p = this.game.players[this.pi];
    const list = p.units.filter((u) => u.alive && !u.garrisonedIn && !u.order && (villager ? u.isVillager : u.isMilitary));
    if (!list.length) return;
    this.idleIdx = (this.idleIdx + 1) % list.length;
    const u = list[this.idleIdx];
    this.select([u]);
    this.r.centerOn(u.x, u.y);
    this.app.audio.selectSound(u);
  }

  // ---------------------------------------------------------------- keyboard
  onKey(e) {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'SELECT') return;
    if (!this.app.inGame()) return;
    const k = e.key;
    this.keys.add(k);
    if (k === 'F10') { e.preventDefault(); this.app.toggleMenu(); return; }
    if (this.app.menuOpen) { if (k === 'Escape') this.app.toggleMenu(false); return; }
    if (k === 'Escape') {
      if (this.mode) this.cancelMode();
      else if (this.page !== 'main') this.page = 'main';
      else this.select([]);
      return;
    }
    if (k === 'p' || k === 'P' || k === 'F3' || k === 'Pause') { e.preventDefault(); this.app.togglePause(); return; }
    if (k === '+' || k === '=') { this.app.changeSpeed(1); return; }
    if (k === '-' || k === '_') { this.app.changeSpeed(-1); return; }
    if (k === 'Delete' || k === 'Backspace') { this.deleteSelection(); return; }
    if (k === '.') { this.nextIdle(true); return; }
    if (k === ',') { this.nextIdle(false); return; }
    if (k === ' ') {
      e.preventDefault();
      if (this.lastAlert) this.r.centerOn(this.lastAlert.x, this.lastAlert.y);
      else { const s = [...this.sel][0]; if (s) this.r.centerOn(s.x, s.y); }
      return;
    }
    if (k === 'o' || k === 'O') { document.getElementById('scores').classList.toggle('hidden'); return; }
    if ((k === 'm' || k === 'M') && !e.ctrlKey && !e.metaKey) {
      const st = this.app.settings;
      if (st.music > 0) { st.savedMusic = st.music; st.music = 0; } else st.music = st.savedMusic || 45;
      this.app.applySettings();
      this.app.hud.message(st.music > 0 ? 'Music on' : 'Music muted', 'info', 1500);
      return;
    }
    if (/^[0-9]$/.test(k)) {
      const n = k;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        this.groups[n] = this.ownSelection();
        this.app.hud.message(`Group ${n} assigned (${this.groups[n].length})`, 'info', 1800);
        return;
      }
      const grp = (this.groups[n] || []).filter((x) => x.alive && x.owner === this.pi);
      if (!grp.length) return;
      const now = performance.now();
      if (this.lastGroupKey.k === n && now - this.lastGroupKey.t < 400) { const u = grp[0]; this.r.centerOn(u.x, u.y); }
      this.lastGroupKey = { k: n, t: now };
      this.select(grp);
      this.app.audio.selectSound(grp[0]);
      return;
    }
    if ((k === 'h' || k === 'H') && !e.ctrlKey) {
      const tcs = this.game.players[this.pi].buildings.filter((b) => b.alive && b.type === 'townCenter');
      if (!tcs.length) return;
      const cur = [...this.sel][0];
      const i = tcs.indexOf(cur);
      const tc = tcs[(i + 1) % tcs.length];
      this.select([tc]);
      this.r.centerOn(tc.x, tc.y);
      return;
    }
    if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (this.app.hud.hotkey(k, e.shiftKey)) { e.preventDefault(); return; }
    }
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    const r = this.r;
    // camera scroll
    let vx = 0, vy = 0;
    const K = this.keys;
    if (K.has('ArrowLeft')) vx -= 1;
    if (K.has('ArrowRight')) vx += 1;
    if (K.has('ArrowUp')) vy -= 1;
    if (K.has('ArrowDown')) vy += 1;
    const edge = this.app.settings.edgeScroll && this.mouse.inside && this.mouse.moved && !this.pan && document.hasFocus();
    if (edge && !this.app.menuOpen) {
      const m = 6, W = window.innerWidth, H = window.innerHeight;
      if (this.mouse.x <= m) vx -= 1;
      if (this.mouse.x >= W - m - 1) vx += 1;
      if (this.mouse.y <= m) vy -= 1;
      if (this.mouse.y >= H - m - 1) vy += 1;
    }
    if (vx || vy) {
      const sp = 900 * (this.app.settings.scrollSpeed / 100) / r.cam.zoom * dt;
      r.cam.x += vx * sp; r.cam.y += vy * sp * 0.9;
      r.clampCam();
    }
    this.cleanSelection();
    // hover & placement preview
    const overUI = this.isOverUI();
    this.r.ui.hover = this.mouse.inside && !overUI && !this.drag ? r.pick(this.mouse.x, this.mouse.y) : null;
    if (this.mode === 'place' && this.placing) this.r.ui.placing = { type: this.placing.type, tiles: this.placementTiles() };
    else this.r.ui.placing = null;
    this.updateCursor();
  }

  isOverUI() {
    const y = this.mouse.y;
    return y < 42 || y > window.innerHeight - 208;
  }

  updateCursor() {
    let c = 'default';
    const h = this.r.ui.hover, own = this.ownUnits();
    if (this.mode === 'attackMove') c = 'attack';
    else if (this.mode === 'repair') c = 'build';
    else if (this.mode === 'garrison') c = 'garrison';
    else if (h && own.length && !this.mode) {
      const g = this.game;
      const vil = own.some((u) => u.isVillager), mil = own.some((u) => u.isMilitary), monk = own.some((u) => u.def.isMonk);
      if (h.kind === 'resource' || (h.kind === 'unit' && h.def.isAnimal && h.owner !== this.pi)) c = vil ? 'gather' : (mil && h.kind === 'unit' ? 'attack' : 'default');
      else if ((h.kind === 'unit' || h.kind === 'building') && g.isEnemy(this.pi, h.owner)) c = monk && h.kind === 'unit' ? 'convert' : 'attack';
      else if (h.kind === 'building' && h.owner === this.pi) {
        if (vil && (!h.complete || h.hp < h.maxHp)) c = 'build';
        else if (vil && h.def.isFarm) c = 'gather';
        else if (h.def.garrison && !vil && own.some((u) => g.canGarrison(u, h))) c = 'garrison';
      } else if (h.kind === 'unit' && h.owner === this.pi && monk && h.hp < h.maxHp) c = 'heal';
    }
    if (c !== this.cursor) { this.cursor = c; this.app.canvas.style.cursor = cursorURL(c); }
  }
}
