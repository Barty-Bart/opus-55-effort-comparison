// Mouse & keyboard: selection, orders, placement, camera and hotkeys.
import { BUILDINGS } from './config.js';
import { cursor } from './icons.js';

export class Input {
  constructor(session) {
    this.s = session;
    this.game = session.game;
    this.r = session.renderer;
    this.canvas = session.renderer.canvas;
    this.mx = window.innerWidth / 2; this.my = window.innerHeight / 2;
    this.inside = false;
    this.moved = false;
    this.down = null;
    this.midDrag = null;
    this.mode = null;
    this.keys = new Set();
    this.groups = new Array(10).fill(null).map(() => []);
    this.lastClick = { t: 0, e: null };
    this.lastGroup = { n: -1, t: 0 };
    this.idleIdx = 0; this.tcIdx = 0; this.milIdx = 0;
    this.curCursor = '';
    this.handlers = [];
    this.bind();
  }

  on(target, ev, fn, opts) { target.addEventListener(ev, fn, opts); this.handlers.push([target, ev, fn, opts]); }
  destroy() { for (const [t, ev, fn, opts] of this.handlers) t.removeEventListener(ev, fn, opts); this.handlers = []; }

  bind() {
    const c = this.canvas;
    this.on(c, 'mousedown', (e) => this.onDown(e));
    this.on(window, 'mousemove', (e) => this.onMove(e));
    this.on(window, 'mouseup', (e) => this.onUp(e));
    this.on(c, 'contextmenu', (e) => e.preventDefault());
    this.on(c, 'wheel', (e) => { e.preventDefault(); this.r.zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY); }, { passive: false });
    this.on(c, 'mouseenter', (e) => { this.inside = true; this.mx = e.clientX; this.my = e.clientY; });
    this.on(document, 'mouseleave', () => { this.inside = false; });
    this.on(window, 'keydown', (e) => this.onKey(e));
    this.on(window, 'keyup', (e) => this.keys.delete(e.key));
    this.on(window, 'blur', () => { this.keys.clear(); this.inside = false; });
  }

  get human() { return this.game.human; }
  ownSel() { return this.game.selection.filter((e) => e.owner === this.game.humanId && !e.dead); }
  ownUnits() { return this.ownSel().filter((e) => e.kind === 'unit'); }

  setSelection(list, sound = true) {
    const g = this.game;
    for (const e of g.selection) e.selected = false;
    g.selection = list.filter((e) => e && !e.dead);
    for (const e of g.selection) e.selected = true;
    this.s.ui.page = 'main';
    this.s.ui.cmdT = 0; this.s.ui.infoT = 0;
    if (sound && g.selection.length) {
      const e = g.selection[0];
      if (e.owner !== g.humanId) this.s.audio.play('click');
      else if (e.kind === 'building') this.s.audio.play('select_bld');
      else if (e.animal) this.s.audio.play('sheep');
      else if (e.isVillager) this.s.audio.play('select_vill');
      else this.s.audio.play('select_mil');
    }
  }

  // ------------------------------------------------------------------ modes
  beginPlacement(type) {
    this.mode = { kind: 'place', type, wallStart: null };
    this.updatePlacement();
  }
  beginAttackMove() { this.mode = { kind: 'attackMove' }; }
  cancelMode() { this.mode = null; this.r.placement = null; }

  placementTile(type) {
    const [wx, wy] = this.r.screenToWorld(this.mx, this.my);
    const s = BUILDINGS[type].size;
    return { x: Math.round(wx - s / 2), y: Math.round(wy - s / 2) };
  }
  updatePlacement() {
    if (!this.mode || this.mode.kind !== 'place') { this.r.placement = null; return; }
    const type = this.mode.type;
    const t = this.placementTile(type);
    if (BUILDINGS[type].wall && this.mode.wallStart) {
      const st = this.mode.wallStart;
      this.r.placement = { type, tiles: this.game.wallTiles(st.x, st.y, t.x, t.y) };
    } else this.r.placement = { type, tx: t.x, ty: t.y };
  }

  // ------------------------------------------------------------------ mouse
  onDown(e) {
    this.s.audio.init();
    this.mx = e.clientX; this.my = e.clientY;
    if (e.button === 1) { e.preventDefault(); this.midDrag = { x: e.clientX, y: e.clientY }; return; }
    if (this.s.paused && e.button === 0 && !this.mode) { /* allow selection while paused */ }
    if (e.button === 2) {
      if (this.mode) { this.cancelMode(); return; }
      const [wx, wy] = this.r.screenToWorld(e.clientX, e.clientY);
      const t = this.r.pick(e.clientX, e.clientY);
      this.commandAt(wx, wy, t, e.shiftKey);
      return;
    }
    if (e.button !== 0) return;
    if (this.mode && this.mode.kind === 'place') {
      const type = this.mode.type;
      if (BUILDINGS[type].wall) { this.mode.wallStart = this.placementTile(type); this.updatePlacement(); return; }
      const t = this.placementTile(type);
      const b = this.game.cmdBuild(this.ownUnits(), type, t.x, t.y, e.shiftKey && false);
      if (b) {
        this.s.audio.play('hammer');
        this.r.addMarker(b.x, b.y, '#e8d070');
        if (!e.shiftKey) this.cancelMode();
      } else this.s.audio.play('error');
      return;
    }
    if (this.mode && this.mode.kind === 'attackMove') {
      const [wx, wy] = this.r.screenToWorld(e.clientX, e.clientY);
      this.game.cmdAttackMove(this.ownUnits(), wx, wy);
      this.r.addMarker(wx, wy, '#ff6a40');
      this.s.audio.play('ack');
      if (!e.shiftKey) this.cancelMode();
      return;
    }
    this.down = { x: e.clientX, y: e.clientY, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey };
  }

  onMove(e) {
    const dx = e.clientX - this.mx, dy = e.clientY - this.my;
    this.mx = e.clientX; this.my = e.clientY;
    this.inside = e.target === this.canvas;
    this.moved = true;
    if (this.midDrag) { this.r.pan(-dx, -dy); return; }
    if (this.down) {
      const d = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y);
      if (d > 5 || this.r.dragRect) {
        this.r.dragRect = { x0: Math.min(this.down.x, e.clientX), y0: Math.min(this.down.y, e.clientY), x1: Math.max(this.down.x, e.clientX), y1: Math.max(this.down.y, e.clientY) };
      }
    }
    if (this.mode && this.mode.kind === 'place') this.updatePlacement();
  }

  onUp(e) {
    if (e.button === 1) { this.midDrag = null; return; }
    if (e.button !== 0) return;
    if (this.mode && this.mode.kind === 'place' && this.mode.wallStart) {
      const type = this.mode.type;
      const a = this.mode.wallStart, b = this.placementTile(type);
      this.game.cmdBuildWall(this.ownUnits(), type, a.x, a.y, b.x, b.y);
      this.s.audio.play('hammer');
      if (!e.shiftKey) this.cancelMode(); else { this.mode.wallStart = null; this.updatePlacement(); }
      return;
    }
    const down = this.down;
    this.down = null;
    if (!down) return;
    const g = this.game;
    if (this.r.dragRect) {
      const rc = this.r.dragRect;
      this.r.dragRect = null;
      const inBox = this.r.unitsInScreenRect(rc.x0, rc.y0, rc.x1, rc.y1);
      let own = inBox.filter((u) => u.owner === g.humanId && !u.animal);
      if (!own.length) own = inBox.filter((u) => u.owner === g.humanId);
      if (down.shift) {
        const set = new Set(g.selection.filter((x) => x.owner === g.humanId && x.kind === 'unit'));
        for (const u of own) set.add(u);
        this.setSelection([...set]);
      } else this.setSelection(own, own.length > 0);
      return;
    }
    const t = this.r.pick(e.clientX, e.clientY);
    const now = performance.now();
    const dbl = t && this.lastClick.e === t && now - this.lastClick.t < 350;
    this.lastClick = { t: now, e: t };
    if (!t) { if (!down.shift) this.setSelection([], false); return; }
    if ((dbl || down.ctrl) && t.owner === g.humanId) {
      const same = this.r.drawList.map((d) => d.e).filter((x) => x.type === t.type && x.owner === g.humanId && !x.dead);
      this.setSelection([...new Set(same)]);
      return;
    }
    if (down.shift && t.owner === g.humanId && t.kind === 'unit') {
      const sel = g.selection.filter((x) => x.owner === g.humanId);
      if (sel.includes(t)) this.setSelection(sel.filter((x) => x !== t));
      else this.setSelection([...sel.filter((x) => x.kind === 'unit'), t]);
      return;
    }
    this.setSelection([t]);
  }

  // Right-click / minimap order.
  commandAt(wx, wy, target, shift) {
    const g = this.game;
    const own = this.ownSel();
    if (!own.length) return;
    const units = own.filter((e) => e.kind === 'unit');
    if (units.length) {
      if (target && target.kind === 'unit' && target.owner === g.humanId && !target.animal && !(units.some((u) => u.def.tc === 'monk') && target.hp < target.maxHp)) target = null;
      g.cmdSmart(units, wx, wy, target, shift);
      if (target && (g.isEnemy(g.humanId, target.owner) && target.kind !== 'resource')) { this.r.flashEntity(target); this.s.audio.play('ack'); }
      else if (target && target.kind !== 'unit') { this.r.flashEntity(target, '#70e060'); this.s.audio.play('ack'); }
      else { this.r.addMarker(wx, wy); this.s.audio.play('ack'); }
      return;
    }
    // buildings: rally point
    const blds = own.filter((e) => e.kind === 'building' && e.complete && (e.def.cmds || []).some((c) => c.line));
    for (const b of blds) {
      if (target && target === b) { b.rally = null; continue; }
      b.rally = { x: wx, y: wy, target: target || null };
    }
    if (blds.length) { this.r.addMarker(wx, wy, '#e8d070'); this.s.audio.play('click'); }
  }

  // ------------------------------------------------------------------ keyboard
  onKey(e) {
    const s = this.s, g = this.game;
    if (s.overlayOpen()) return;
    const k = e.key;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) { this.keys.add(k); e.preventDefault(); return; }
    if (k === 'F1') { e.preventDefault(); s.showHelp(); return; }
    if (k === 'F10') { e.preventDefault(); s.openMenu(); return; }
    if (k === 'F3' || k === 'Pause' || k === 'p' || k === 'P') { e.preventDefault(); s.setPaused(!s.paused); return; }
    if (k === '+' || k === '=') { s.setSpeed(s.speedIdx + 1); return; }
    if (k === '-' || k === '_') { s.setSpeed(s.speedIdx - 1); return; }
    if (k === 'm' || k === 'M') { s.audio.setMuted(!s.audio.muted); s.ui.notify(s.audio.muted ? 'Sound muted' : 'Sound on'); return; }
    if (k === 'Escape') {
      if (this.mode) { this.cancelMode(); return; }
      if (s.ui.page !== 'main') { s.ui.page = 'main'; return; }
      if (g.selection.length) { this.setSelection([], false); return; }
      s.openMenu();
      return;
    }
    if (k === 'Delete' || k === 'Backspace') {
      const own = this.ownSel();
      if (own.length) { e.preventDefault(); g.cmdDelete(own); }
      return;
    }
    const digit = /^Digit([0-9])$/.exec(e.code || '');
    if (digit || /^[0-9]$/.test(k)) {
      const n = digit ? +digit[1] : +k;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        this.groups[n] = this.ownSel();
        s.ui.notify(`Group ${n} assigned`);
        return;
      }
      this.groups[n] = this.groups[n].filter((x) => !x.dead && x.owner === g.humanId);
      const list = this.groups[n].filter((x) => !(x.kind === 'unit' && x.garrisonedIn));
      if (!list.length) return;
      if (e.shiftKey) { this.setSelection([...new Set([...g.selection, ...list])]); return; }
      this.setSelection(list);
      const now = performance.now();
      if (this.lastGroup.n === n && now - this.lastGroup.t < 400) this.centerOnList(list);
      this.lastGroup = { n, t: now };
      return;
    }
    if (k === '.') { this.cycleIdleVillager(); return; }
    if (k === ',') { this.cycleIdleMilitary(); return; }
    if (k === ' ') {
      e.preventDefault();
      const ping = this.r.pings[this.r.pings.length - 1] || (g.lastAlert.t > 0 ? g.lastAlert : null);
      if (ping) this.r.centerOn(ping.x, ping.y);
      else if (g.selection.length) this.centerOnList(g.selection);
      return;
    }
    if (k === 'h' || k === 'H') {
      const tcs = g.buildings.filter((b) => !b.dead && b.owner === g.humanId && b.type === 'towncenter');
      if (tcs.length) { const tc = tcs[this.tcIdx++ % tcs.length]; this.setSelection([tc]); this.r.centerOn(tc.x, tc.y); }
      return;
    }
    if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (s.ui.hotkey(k, e.shiftKey)) e.preventDefault();
    }
  }

  centerOnList(list) {
    let x = 0, y = 0;
    for (const e of list) { x += e.x; y += e.y; }
    this.r.centerOn(x / list.length, y / list.length);
  }

  cycleIdleVillager() {
    const list = this.s.ui.idleVills.filter((u) => !u.dead && !u.order);
    if (!list.length) return;
    const u = list[this.idleIdx++ % list.length];
    this.setSelection([u]);
    this.r.centerOn(u.x, u.y);
  }
  cycleIdleMilitary() {
    const g = this.game;
    const list = g.units.filter((u) => !u.dead && u.owner === g.humanId && u.isMilitary && !u.order && !u.garrisonedIn);
    if (!list.length) return;
    const u = list[this.milIdx++ % list.length];
    this.setSelection([u]);
    this.r.centerOn(u.x, u.y);
  }

  // ------------------------------------------------------------------ per-frame
  update(dt) {
    const r = this.r;
    const sp = 900 * dt;
    let dx = 0, dy = 0;
    if (this.keys.has('ArrowLeft')) dx -= sp;
    if (this.keys.has('ArrowRight')) dx += sp;
    if (this.keys.has('ArrowUp')) dy -= sp;
    if (this.keys.has('ArrowDown')) dy += sp;
    if (this.inside && this.moved && !this.down && !this.midDrag && document.hasFocus()) {
      const m = 6;
      if (this.mx <= m) dx -= sp;
      if (this.mx >= r.W - m) dx += sp;
      if (this.my <= m) dy -= sp;
      if (this.my >= r.H - m) dy += sp;
    }
    if (dx || dy) { r.pan(dx, dy); if (this.mode && this.mode.kind === 'place') this.updatePlacement(); }
    // hover & cursor
    const hov = this.inside ? r.pick(this.mx, this.my) : null;
    r.hover = hov;
    this.setCursor(this.cursorFor(hov));
  }

  cursorFor(h) {
    const g = this.game;
    if (this.mode) return this.mode.kind === 'attackMove' ? 'target' : 'default';
    const units = this.ownUnits();
    if (!units.length || !h || h.dead) return 'default';
    const vills = units.some((u) => u.isVillager);
    const monks = units.some((u) => u.def.tc === 'monk');
    if (h.kind !== 'resource' && g.isEnemy(g.humanId, h.owner)) return monks && units.every((u) => u.def.tc === 'monk') ? 'convert' : 'attack';
    if (vills) {
      if (h.kind === 'resource') return h.resType === 'wood' ? 'wood' : h.resType === 'food' ? 'food' : 'mine';
      if (h.kind === 'unit' && h.animal) return 'food';
      if (h.kind === 'building' && h.owner === g.humanId) {
        if (!h.complete || h.hp < h.maxHp) return 'build';
        if (h.type === 'farm') return 'food';
        if (h.def.garrison) return 'garrison';
      }
    }
    if (monks && h.kind === 'unit' && h.owner === g.humanId && h.hp < h.maxHp) return 'heal';
    if (h.kind === 'building' && h.owner === g.humanId && h.def.garrison && h.complete) return 'garrison';
    if (h.kind === 'unit' && h.animal && units.some((u) => u.isMilitary)) return 'attack';
    return 'default';
  }
  setCursor(name) {
    if (name === this.curCursor) return;
    this.curCursor = name;
    this.canvas.style.cursor = cursor(name);
  }
}
