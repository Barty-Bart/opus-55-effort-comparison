// HUD, selection, commands, keyboard & mouse input.
import { UNITS, BUILDINGS, TECHS, RESOURCE_DEFS, AGE_NAMES, AGE_SHORT, GRID_KEYS, ECO_BUILD, MIL_BUILD } from './config.js';
import { unitIcon, buildingIcon, resourceIcon, resIconSmall, buildingSprite } from './sprites.js';
import { fmtTime, clamp } from './util.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(game, renderer, audio, hooks) {
    this.g = game; this.r = renderer; this.audio = audio; this.hooks = hooks;
    this.selected = new Set();
    this.placing = null;
    this.page = 'main';
    this.drag = null;
    this.markers = [];
    this.mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2, in: false };
    this.mouseWorld = null;
    this.keys = new Set();
    this.groups = {};
    this.lastGroupKey = null; this.lastGroupT = 0;
    this.pendingCmd = null;
    this.lastAlert = null;
    this.hudT = 0;
    this.cmdSig = '';
    this.infoSig = '';
    this.flash = null;
    this.idleIdx = 0;
    this.lastClick = { t: 0, id: 0 };
    this.cmdButtons = [];
    this.bind();
    for (const el of document.querySelectorAll('#topbar .res')) el.querySelector('.ri').src = resIconSmall(el.dataset.res);
    this.mm = $('minimap');
    this.mm.width = 290 * 2; this.mm.height = 145 * 2;
    this.mmCtx = this.mm.getContext('2d');
  }

  get me() { return this.g.players[this.g.human]; }
  selList() { return [...this.selected].filter((e) => !e.dead); }
  ownUnits() { return this.selList().filter((e) => e.kind === 'unit' && e.owner === this.g.human); }

  // ---------------- input binding ----------------
  bind() {
    const cv = this.r.canvas;
    this.handlers = [];
    const on = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); this.handlers.push([el, ev, fn, opt]); };
    on(cv, 'mousedown', (e) => this.onDown(e));
    on(window, 'mousemove', (e) => this.onMove(e));
    on(window, 'mouseup', (e) => this.onUp(e));
    on(cv, 'contextmenu', (e) => e.preventDefault());
    on(cv, 'wheel', (e) => { e.preventDefault(); this.r.zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12); }, { passive: false });
    on(cv, 'mouseleave', () => { this.mouse.in = false; });
    on(cv, 'mouseenter', (e) => { this.mouse.in = true; this.mouse.x = e.clientX; this.mouse.y = e.clientY; });
    on(window, 'keydown', (e) => this.onKey(e));
    on(window, 'keyup', (e) => this.keys.delete(e.key));
    on(window, 'blur', () => this.keys.clear());
    const mm = $('minimap');
    let mmDrag = false;
    const mmPos = (e) => { const r = mm.getBoundingClientRect(); return this.r.minimapToWorld((e.clientX - r.left) / r.width * 290, (e.clientY - r.top) / r.height * 145, 290, 145); };
    on(mm, 'mousedown', (e) => {
      e.preventDefault();
      const [wx, wy] = mmPos(e);
      if (e.button === 2) { this.rightClickWorld(wx, wy, null, e.shiftKey); return; }
      mmDrag = true; this.r.centerOn(wx, wy);
    });
    on(mm, 'contextmenu', (e) => e.preventDefault());
    on(window, 'mousemove', (e) => { if (mmDrag) { const [wx, wy] = mmPos(e); this.r.centerOn(wx, wy); } });
    on(window, 'mouseup', () => { mmDrag = false; });
    on($('btn-idle'), 'click', () => this.nextIdle());
    on($('btn-pause'), 'click', () => this.hooks.togglePause());
    on($('btn-menu'), 'click', () => this.hooks.openMenu());
    on($('btn-speed'), 'click', () => this.hooks.cycleSpeed());
    on($('commands'), 'mouseleave', () => this.hideTip());
  }
  unbind() { for (const [el, ev, fn, opt] of this.handlers) el.removeEventListener(ev, fn, opt); }

  onDown(e) {
    this.audio.init();
    this.mouse.x = e.clientX; this.mouse.y = e.clientY;
    if (this.g.winner >= 0 && !this.hooks.watching()) return;
    if (e.button === 1) { this.pan = { x: e.clientX, y: e.clientY, cx: this.r.cam.x, cy: this.r.cam.y }; e.preventDefault(); return; }
    if (e.button === 2) {
      if (this.placing) { this.placing = null; return; }
      if (this.pendingCmd) { this.pendingCmd = null; return; }
      const [wx, wy] = this.r.s2w(e.clientX, e.clientY);
      this.rightClickWorld(wx, wy, this.pick(e.clientX, e.clientY), e.shiftKey);
      return;
    }
    if (e.button !== 0) return;
    if (this.placing) {
      this.tryPlace(e.shiftKey);
      return;
    }
    if (this.pendingCmd === 'amove') {
      const [wx, wy] = this.r.s2w(e.clientX, e.clientY);
      const units = this.ownUnits();
      const tg = this.pick(e.clientX, e.clientY);
      if (tg && tg.owner !== undefined && tg.owner >= 0 && tg.owner !== this.g.human) this.g.cmdAttack(units, tg);
      else this.g.cmdMove(units, wx, wy, true);
      this.marker(wx, wy, '#ff6a4a');
      this.audio.play('click');
      if (!e.shiftKey) this.pendingCmd = null;
      return;
    }
    this.drag = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY, active: false, shift: e.shiftKey };
  }
  onMove(e) {
    this.mouse.x = e.clientX; this.mouse.y = e.clientY;
    this.mouse.in = e.target === this.r.canvas;
    if (this.pan) {
      this.r.cam.x = this.pan.cx - (e.clientX - this.pan.x) / this.r.cam.zoom;
      this.r.cam.y = this.pan.cy - (e.clientY - this.pan.y) / this.r.cam.zoom;
      this.r.clampCam();
    }
    if (this.drag) {
      this.drag.x1 = e.clientX; this.drag.y1 = e.clientY;
      if (Math.abs(this.drag.x1 - this.drag.x0) + Math.abs(this.drag.y1 - this.drag.y0) > 6) this.drag.active = true;
    }
  }
  onUp(e) {
    if (e.button === 1) { this.pan = null; return; }
    if (e.button !== 0 || !this.drag) return;
    const d = this.drag;
    this.drag = null;
    if (d.active) this.boxSelect(d, d.shift);
    else this.clickSelect(d.x0, d.y0, d.shift);
  }

  onKey(e) {
    const k = e.key;
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    if (!this.hooks.inGame()) return;
    this.audio.init();
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Tab'].includes(k)) e.preventDefault();
    if (k === 'F10' || (k === 'Escape' && !this.placing && !this.pendingCmd && this.page === 'main' && this.selected.size === 0)) { e.preventDefault(); this.hooks.openMenu(); return; }
    if (this.hooks.menuOpen()) return;
    this.keys.add(k);
    if (e.repeat && !k.startsWith('Arrow')) return;
    const lower = k.toLowerCase();
    if (k === 'Escape') {
      if (this.placing) this.placing = null;
      else if (this.pendingCmd) this.pendingCmd = null;
      else if (this.page !== 'main') this.page = 'main';
      else this.selected.clear();
      this.refreshCmds(true);
      return;
    }
    if (lower === 'p' || k === 'Pause' || k === 'F3') { this.hooks.togglePause(); return; }
    if (this.hooks.paused()) return;
    if (/^[0-9]$/.test(k)) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        this.groups[k] = this.ownUnits().map((u) => u.id).concat(this.selList().filter((b) => b.kind === 'building' && b.owner === this.g.human).map((b) => b.id));
        this.toast(`Group ${k} assigned`);
      } else if (this.groups[k]) {
        const ents = this.groups[k].map((id) => this.g.ents.get(id)).filter((x) => x && !x.dead);
        if (!ents.length) return;
        if (!e.shiftKey) this.selected.clear();
        for (const x of ents) this.selected.add(x);
        const now = performance.now();
        if (this.lastGroupKey === k && now - this.lastGroupT < 400) this.centerOnSelection();
        this.lastGroupKey = k; this.lastGroupT = now;
        this.refreshCmds(true);
      }
      return;
    }
    if (k === 'Delete' || k === 'Backspace') {
      for (const x of this.selList()) if (x.owner === this.g.human) this.g.deleteEntity(x);
      this.selected.clear();
      this.refreshCmds(true);
      return;
    }
    if (k === '.') { this.nextIdle(); return; }
    if (k === ',') { this.selectIdleMilitary(); return; }
    if (k === ' ') { if (this.lastAlert) this.r.centerOn(this.lastAlert.x, this.lastAlert.y); else this.centerOnSelection(); return; }
    if (k === '+' || k === '=') { this.r.zoomAt(this.r.W / 2, this.r.H / 2, 1.12); return; }
    if (k === '-') { this.r.zoomAt(this.r.W / 2, this.r.H / 2, 1 / 1.12); return; }
    if (lower === 'h' && !e.ctrlKey) {
      const tc = this.g.buildings.find((b) => b.owner === this.g.human && b.type === 'towncenter' && !b.dead);
      if (tc) { this.selected.clear(); this.selected.add(tc); this.r.centerOn(tc.x, tc.y); this.refreshCmds(true); }
      return;
    }
    const gi = GRID_KEYS.indexOf(k.toUpperCase());
    if (gi >= 0 && !e.ctrlKey && !e.metaKey) {
      const btn = this.cmdButtons[gi];
      if (btn && btn.action) { btn.action(e.shiftKey); this.audio.play('click'); }
    }
  }

  // ---------------- picking & selection ----------------
  pick(px, py) {
    const g = this.g, r = this.r, z = r.cam.zoom;
    let best = null, bestD = -1e9, bestPri = -1;
    const consider = (e, pri, depth) => {
      if (pri > bestPri || (pri === bestPri && depth > bestD)) { best = e; bestPri = pri; bestD = depth; }
    };
    for (const u of g.units) {
      if (u.dead || (u.owner !== g.human && !g.tileVisible(u.x, u.y))) continue;
      const [sx, sy] = r.w2s(u.x, u.y);
      const hw = (u.def.horse || u.def.cls === 'siege' ? 13 : 8) * z, ht = (u.def.horse ? 34 : 26) * z;
      if (px >= sx - hw && px <= sx + hw && py >= sy - ht && py <= sy + 4 * z) consider(u, 3, u.x + u.y);
    }
    if (best) return best;
    const [wx, wy] = r.s2w(px, py);
    for (const b of g.buildings) {
      if (b.dead || (b.owner !== g.human && !g.entExplored(b))) continue;
      const inFoot = wx >= b.tx && wx < b.tx + b.w && wy >= b.ty && wy < b.ty + b.h;
      let hit = inFoot;
      if (!hit && b.type !== 'farm') {
        const [sx, sy] = r.w2s(b.x, b.y);
        const s = buildingSprite(b.type, g.players[b.owner].color);
        const hw = (b.w + b.h) * 13 * z;
        hit = px >= sx - hw && px <= sx + hw && py >= sy - s.ay * z * 0.85 && py <= sy;
      }
      if (hit) consider(b, b.type === 'farm' ? 1 : 2, b.x + b.y);
    }
    for (const res of g.resources) {
      if (res.dead) continue;
      if (res.animal ? !g.tileVisible(res.x, res.y) && !res.killed : !g.tileExplored(res.tx, res.ty)) continue;
      const [sx, sy] = r.w2s(res.x, res.y);
      const tall = res.type === 'tree' && res.amount >= res.max;
      const hw = (tall ? 13 : 14) * z, top = (tall ? 58 : 18) * z;
      if (px >= sx - hw && px <= sx + hw && py >= sy - top && py <= sy + 7 * z) consider(res, res.animal ? 2.5 : 1.5, res.x + res.y);
    }
    return best;
  }

  clickSelect(px, py, shift) {
    const e = this.pick(px, py);
    const now = performance.now();
    if (e && e.kind === 'unit' && e.owner === this.g.human && this.lastClick.id === e.id && now - this.lastClick.t < 350) {
      // double click: all of type on screen
      this.selected.clear();
      for (const u of this.g.units) {
        if (u.dead || u.owner !== this.g.human || u.type !== e.type) continue;
        const [sx, sy] = this.r.w2s(u.x, u.y);
        if (sx >= 0 && sx <= this.r.W && sy >= 38 && sy <= this.r.H - 180) this.selected.add(u);
      }
      this.refreshCmds(true);
      return;
    }
    this.lastClick = { t: now, id: e ? e.id : 0 };
    if (!shift) this.selected.clear();
    if (e) {
      if (shift && this.selected.has(e)) this.selected.delete(e);
      else {
        // don't mix own units with other things
        if (shift && (e.owner !== this.g.human || e.kind !== 'unit')) this.selected.clear();
        for (const s of [...this.selected]) if (s.kind !== 'unit' || s.owner !== this.g.human) this.selected.delete(s);
        this.selected.add(e);
      }
      if (e.owner === this.g.human) this.audio.play('select');
    }
    this.page = 'main';
    this.refreshCmds(true);
  }

  boxSelect(d, shift) {
    const x0 = Math.min(d.x0, d.x1), x1 = Math.max(d.x0, d.x1), y0 = Math.min(d.y0, d.y1), y1 = Math.max(d.y0, d.y1);
    const found = [];
    for (const u of this.g.units) {
      if (u.dead || u.owner !== this.g.human) continue;
      const [sx, sy] = this.r.w2s(u.x, u.y);
      const cy = sy - 10 * this.r.cam.zoom;
      if (sx >= x0 && sx <= x1 && cy >= y0 && cy <= y1 + 10) found.push(u);
    }
    if (!shift) this.selected.clear();
    for (const s of [...this.selected]) if (s.kind !== 'unit' || s.owner !== this.g.human) this.selected.delete(s);
    // prefer military if mixed? keep all, AoE-style
    for (const u of found) this.selected.add(u);
    if (found.length) this.audio.play('select');
    this.page = 'main';
    this.refreshCmds(true);
  }

  centerOnSelection() {
    const l = this.selList();
    if (!l.length) return;
    const x = l.reduce((s, e) => s + e.x, 0) / l.length, y = l.reduce((s, e) => s + e.y, 0) / l.length;
    this.r.centerOn(x, y);
  }

  nextIdle() {
    const idle = this.g.units.filter((u) => u.owner === this.g.human && u.def.cls === 'villager' && !u.task && !u.dead);
    if (!idle.length) { this.audio.play('error'); return; }
    this.idleIdx = (this.idleIdx + 1) % idle.length;
    const u = idle[this.idleIdx];
    this.selected.clear(); this.selected.add(u);
    this.r.centerOn(u.x, u.y);
    this.page = 'main';
    this.refreshCmds(true);
  }
  selectIdleMilitary() {
    const idle = this.g.units.filter((u) => u.owner === this.g.human && u.def.cls !== 'villager' && !u.task && !u.dead);
    if (!idle.length) { this.audio.play('error'); return; }
    this.selected.clear();
    for (const u of idle) this.selected.add(u);
    this.centerOnSelection();
    this.refreshCmds(true);
  }

  marker(x, y, col = '#7aff6a') { this.markers.push({ x, y, t: 0, col }); }

  rightClickWorld(wx, wy, target, shift) {
    const g = this.g;
    const sel = this.selList();
    const units = sel.filter((e) => e.kind === 'unit' && e.owner === g.human);
    const bld = sel.find((e) => e.kind === 'building' && e.owner === g.human);
    if (!units.length) {
      if (bld && bld.def.trains) {
        bld.rally = { x: wx, y: wy, id: target && (target.kind === 'resource' || target.owner === g.human) ? target.id : 0 };
        this.marker(wx, wy, '#ffe070');
        this.audio.play('click');
      }
      return;
    }
    const vils = units.filter((u) => u.def.cls === 'villager');
    const mil = units.filter((u) => u.def.cls !== 'villager');
    if (target && target.owner !== undefined && target.owner >= 0 && target.owner !== g.human) {
      g.cmdAttack(units, target);
      this.flashEnt(target, '#ff4a3a');
      this.audio.play('click');
      return;
    }
    if (target && target.kind === 'resource') {
      if (vils.length) { g.cmdGather(vils, target); this.flashEnt(target, '#7aff6a'); }
      if (mil.length) g.cmdMove(mil, target.x, target.y);
      this.audio.play('click');
      return;
    }
    if (target && target.kind === 'building' && target.owner === g.human) {
      if (vils.length) {
        const needs = !target.built || target.hp < g.maxHp(target);
        if (needs) g.cmdBuild(vils, target);
        else if (target.type === 'farm') g.cmdGather(vils, target);
        else if (target.def.drop && vils.some((v) => v.carry.amt > 0 && target.def.drop.includes(v.carry.type))) g.cmdDrop(vils, target);
        else g.cmdMove(vils, target.x, target.y + target.h / 2 + 0.6);
        this.flashEnt(target, '#7aff6a');
      }
      if (mil.length) g.cmdMove(mil, target.x + target.w / 2 + 1, target.y + target.h / 2 + 1);
      this.audio.play('click');
      return;
    }
    g.cmdMove(units, wx, wy);
    this.marker(wx, wy);
    this.audio.play('click');
  }
  flashEnt(e, col) { this.flash = { id: e.id, t: 1.0, col }; }

  tryPlace(shift) {
    const g = this.g, type = this.placing;
    if (!this.placeT) return;
    const [tx, ty] = this.placeT;
    const def = BUILDINGS[type];
    if (!g.canAfford(this.me, def.cost)) { this.toast('Not enough resources', 'alert'); this.audio.play('error'); this.placing = null; return; }
    if (!this.placeOk) { this.audio.play('error'); return; }
    const builders = this.ownUnits().filter((u) => u.def.cls === 'villager');
    const b = g.placeBuilding(g.human, type, tx, ty, builders, shift);
    if (b) {
      this.audio.play('hammer');
      if (!shift || !g.canAfford(this.me, def.cost)) this.placing = null;
    } else this.audio.play('error');
  }

  toast(text, kind = 'info') { this.addMsg(text, kind); }
  addMsg(text, kind) {
    const box = $('messages');
    const el = document.createElement('div');
    el.className = 'm ' + kind;
    el.textContent = text;
    box.appendChild(el);
    while (box.children.length > 6) box.firstChild.remove();
    setTimeout(() => { el.style.opacity = '0'; }, 5500);
    setTimeout(() => el.remove(), 6400);
  }

  // ---------------- per-frame ----------------
  update(dt, realDt) {
    // camera scroll
    const sp = 900 * realDt / this.r.cam.zoom;
    let dx = 0, dy = 0;
    if (this.keys.has('ArrowLeft')) dx -= sp;
    if (this.keys.has('ArrowRight')) dx += sp;
    if (this.keys.has('ArrowUp')) dy -= sp;
    if (this.keys.has('ArrowDown')) dy += sp;
    if (this.mouse.in && !this.drag && document.hasFocus()) {
      const m = 6;
      if (this.mouse.x <= m) dx -= sp;
      if (this.mouse.x >= this.r.W - m) dx += sp;
      if (this.mouse.y <= m) dy -= sp;
      if (this.mouse.y >= this.r.H - m) dy += sp;
    }
    if (dx || dy) { this.r.cam.x += dx; this.r.cam.y += dy; this.r.clampCam(); }
    this.mouseWorld = this.r.s2w(this.mouse.x, this.mouse.y);
    for (const m of this.markers) m.t += realDt;
    this.markers = this.markers.filter((m) => m.t < 0.6);
    if (this.flash) { this.flash.t -= realDt; if (this.flash.t <= 0) this.flash = null; }
    for (const p of this.r.pings) p.t += realDt;
    this.r.pings = this.r.pings.filter((p) => p.t < 3);
    for (const s of [...this.selected]) if (s.dead) this.selected.delete(s);
    // cursor
    const cv = this.r.canvas;
    let cur = 'default';
    if (this.placing) cur = 'crosshair';
    else if (this.pendingCmd) cur = 'crosshair';
    else if (this.ownUnits().length && this.mouse.in) {
      const h = this.hoverT > 0.08 ? this.hover : null;
      if (h && h.owner >= 0 && h.owner !== this.g.human && h.owner !== undefined) cur = 'crosshair';
      else if (h && h.kind === 'resource') cur = 'pointer';
    }
    this.hoverT = (this.hoverT || 0) + realDt;
    if (this.hoverT > 0.1) { this.hover = this.mouse.in ? this.pick(this.mouse.x, this.mouse.y) : null; this.hoverT = 0.09; }
    if (cv.style.cursor !== cur) cv.style.cursor = cur;

    this.hudT -= realDt;
    if (this.hudT <= 0) { this.hudT = 0.1; this.updateHUD(); }
    this.mmT = (this.mmT || 0) - realDt;
    if (this.mmT <= 0) { this.mmT = 0.12; this.r.renderMinimap(this.mmCtx, this.mm.width, this.mm.height, this); }
  }

  updateHUD() {
    const g = this.g, p = this.me;
    for (const k of ['food', 'wood', 'gold', 'stone']) $('r-' + k).textContent = Math.floor(p.res[k]);
    const counts = { food: 0, wood: 0, gold: 0, stone: 0 };
    let idle = 0;
    for (const u of g.units) {
      if (u.owner !== g.human || u.def.cls !== 'villager') continue;
      if (!u.task) idle++;
      else if (u.task.t === 'gather' && u.task.resType) counts[u.task.resType]++;
    }
    for (const k in counts) $('v-' + k).textContent = counts[k] ? counts[k] : '';
    $('r-pop').textContent = `${p.pop}/${p.popCap}`;
    $('r-pop').parentElement.classList.toggle('housed', p.pop >= p.popCap);
    $('idle-count').textContent = idle;
    $('btn-idle').classList.toggle('has', idle > 0);
    $('age-num').textContent = AGE_SHORT[p.age];
    $('age-name').textContent = AGE_NAMES[p.age];
    $('clock').textContent = fmtTime(g.time);
    // age progress
    const tc = g.buildings.find((b) => b.owner === g.human && b.queue.length && b.queue[0].kind === 'tech' && TECHS[b.queue[0].key].ageUp);
    const ap = $('age-prog');
    if (tc) { ap.style.display = 'block'; ap.firstChild.style.width = (tc.queue[0].t / TECHS[tc.queue[0].key].time * 100) + '%'; }
    else ap.style.display = 'none';
    this.refreshCmds(false);
    this.renderInfo();
  }

  // ---------------- command grid ----------------
  commandSpec() {
    const g = this.g, p = this.me;
    const sel = this.selList();
    const cells = new Array(15).fill(null);
    if (!sel.length) return cells;
    const units = sel.filter((e) => e.kind === 'unit' && e.owner === g.human);
    if (units.length) {
      const hasVil = units.some((u) => u.def.cls === 'villager');
      if (hasVil && this.page === 'main') {
        cells[0] = { emo: '🏠', cls: 'act', name: 'Build Economic Building', desc: 'Houses, Mills, Lumber & Mining Camps, Farms, Town Centers.', action: () => { this.page = 'eco'; this.refreshCmds(true); } };
        cells[1] = { emo: '⚔️', cls: 'act', name: 'Build Military Building', desc: 'Barracks, Archery Range, Stable, Blacksmith, Siege Workshop, Towers, Castles.', action: () => { this.page = 'mil'; this.refreshCmds(true); } };
      } else if (hasVil) {
        const list = this.page === 'eco' ? ECO_BUILD : MIL_BUILD;
        list.forEach((type, i) => {
          const def = BUILDINGS[type];
          const lock = p.age < (def.age || 0) ? `Requires ${AGE_NAMES[def.age]}` : null;
          cells[i] = {
            img: buildingIcon(type, p.color), name: def.name, desc: def.desc + (def.pop ? ` (+${def.pop} population)` : ''), cost: def.cost, lock,
            action: () => {
              if (lock) { this.toast(lock, 'alert'); this.audio.play('error'); return; }
              if (!g.canAfford(p, def.cost)) { this.toast('Not enough resources', 'alert'); this.audio.play('error'); return; }
              this.placing = type;
            },
          };
        });
        cells[14] = { emo: '↩', cls: 'act', name: 'Back', desc: '', action: () => { this.page = 'main'; this.refreshCmds(true); } };
        return cells;
      }
      const military = units.some((u) => u.def.cls !== 'villager');
      if (military) cells[5] = { emo: '🎯', cls: 'act', name: 'Attack Move', desc: 'Move to a location, attacking any enemies encountered on the way.', action: () => { this.pendingCmd = 'amove'; } };
      cells[10] = { emo: '✋', cls: 'act', name: 'Stop', desc: 'Stop current action.', action: () => g.cmdStop(this.ownUnits()) };
      cells[14] = { emo: '💀', cls: 'act', name: 'Delete', desc: 'Delete the selected units (Del).', action: () => { for (const u of this.ownUnits()) g.deleteEntity(u); this.selected.clear(); } };
      return cells;
    }
    const b = sel.length === 1 && sel[0].kind === 'building' && sel[0].owner === g.human ? sel[0] : null;
    if (!b) return cells;
    if (!b.built) {
      cells[14] = { emo: '💀', cls: 'act', name: 'Delete', desc: 'Cancel this foundation.', action: () => { g.deleteEntity(b); this.selected.clear(); } };
      return cells;
    }
    let i = 0;
    for (const base of b.def.trains || []) {
      const key = p.unitMap[base];
      const def = UNITS[key];
      const lock = p.age < (def.age || 0) ? `Requires ${AGE_NAMES[def.age]}` : null;
      const n = b.queue.filter((q) => q.kind === 'unit' && q.key === key).length;
      cells[i++] = {
        img: unitIcon(key, p.color, def), name: def.name, desc: this.unitDesc(def, p), cost: def.cost, lock, count: n || '',
        action: (shift) => {
          if (lock) { this.toast(lock, 'alert'); this.audio.play('error'); return; }
          const times = shift ? 5 : 1;
          for (let k = 0; k < times; k++) {
            const err = g.queueTrain(b, base);
            if (err) { if (k === 0) { this.toast(err, 'alert'); this.audio.play('error'); } break; }
          }
        },
      };
    }
    if (i > 0) i = 5;
    for (const tk of b.def.techs || []) {
      if (!g.techVisible(p, tk)) continue;
      if (i >= 14) break;
      const t = TECHS[tk];
      const lock = g.techLocked(p, tk);
      cells[i++] = {
        emo: t.icon, img: t.unitIcon ? unitIcon(t.unitIcon, p.color, UNITS[t.unitIcon]) : null, cls: 'tech', name: t.name, desc: t.desc, cost: t.cost, lock, time: t.time,
        action: () => {
          const err = g.queueTech(b, tk);
          if (err) { this.toast(err, 'alert'); this.audio.play('error'); }
        },
      };
    }
    cells[14] = { emo: '💀', cls: 'act', name: 'Delete', desc: 'Delete this building.', action: () => { if (confirm(`Delete ${b.def.name}?`)) { g.deleteEntity(b); this.selected.clear(); } } };
    return cells;
  }
  unitDesc(def, p) {
    const atk = def.atk + p.mods.atk[def.cls];
    const arm = p.mods.armor[def.cls];
    let s = `${def.desc} HP ${def.hp + p.mods.hp[def.cls]}, Attack ${atk}`;
    if (def.range) s += `, Range ${def.range + (def.cls === 'archer' ? p.mods.range.archer : 0)}`;
    s += `, Armor ${def.armor[0] + arm[0]}/${def.armor[1] + arm[1]}.`;
    return s;
  }

  refreshCmds(force) {
    const g = this.g, p = this.me;
    const sel = this.selList();
    const sig = [this.page, sel.map((e) => e.id + ':' + (e.type || '') + (e.built ? 'b' : '')).join(','), p.age, p.techs.size, p.researching.size, Object.values(p.unitMap).join(),
      sel.length === 1 && sel[0].queue ? sel[0].queue.map((q) => q.key).join() : ''].join('|');
    const box = $('commands');
    if (force || sig !== this.cmdSig) {
      this.cmdSig = sig;
      const spec = this.commandSpec();
      box.innerHTML = '';
      this.cmdButtons = spec;
      spec.forEach((c, idx) => {
        const el = document.createElement('button');
        el.className = 'cmd';
        if (!c) { el.style.visibility = 'hidden'; box.appendChild(el); return; }
        el.innerHTML = (c.img ? `<img src="${c.img}">` : `<div class="emo ${c.cls || ''}">${c.emo}</div>`) + `<span class="hk">${GRID_KEYS[idx]}</span>` + (c.count ? `<span class="cnt">${c.count}</span>` : '');
        el.addEventListener('mousedown', (e) => { e.preventDefault(); this.audio.init(); if (e.button === 0) { c.action(e.shiftKey); this.audio.play('click'); this.refreshCmds(true); } });
        el.addEventListener('mouseenter', () => this.showTip(c, idx));
        el.addEventListener('mouseleave', () => this.hideTip());
        c.el = el;
        box.appendChild(el);
      });
    }
    for (const c of this.cmdButtons) {
      if (!c || !c.el) continue;
      c.el.classList.toggle('locked', !!c.lock);
      c.el.classList.toggle('poor', !c.lock && !!c.cost && !g.canAfford(p, c.cost));
    }
  }

  showTip(c, idx) {
    const tip = $('tooltip');
    const p = this.me;
    let html = `<h4>${c.name} <small style="opacity:.6">(${GRID_KEYS[idx]})</small></h4>`;
    if (c.cost) {
      html += '<div class="cost">';
      for (const k of ['food', 'wood', 'gold', 'stone']) if (c.cost[k]) html += `<span class="${p.res[k] < c.cost[k] ? 'no' : ''}"><img src="${resIconSmall(k)}">${c.cost[k]}</span>`;
      if (c.time) html += `<span>⏱ ${c.time}s</span>`;
      html += '</div>';
    }
    if (c.desc) html += `<p>${c.desc}</p>`;
    if (c.lock) html += `<p class="lock">🔒 ${c.lock}</p>`;
    tip.innerHTML = html;
    tip.classList.remove('hidden');
  }
  hideTip() { $('tooltip').classList.add('hidden'); }

  // ---------------- info panel ----------------
  renderInfo() {
    const g = this.g, p = this.me;
    const sel = this.selList();
    const box = $('info');
    if (!sel.length) {
      const sig = 'none';
      if (this.infoSig !== sig) {
        this.infoSig = sig;
        box.innerHTML = `<div class="info-main"><div class="info-name">Your Realm</div><div class="desc">Select units by clicking or dragging. Right-click to command. Build houses to grow your population, gather resources, and advance through the ages to defeat your rival.</div><div class="hint">Tip: press <b>.</b> to find idle villagers, <b>H</b> for your Town Center.</div></div>`;
      }
      return;
    }
    if (sel.length > 1) {
      const sig = 'multi' + sel.map((e) => e.id + ':' + Math.round(e.hp)).join(',');
      if (this.infoSig === sig) return;
      this.infoSig = sig;
      const shown = sel.slice(0, 36);
      box.innerHTML = `<div class="multi">${shown.map((e) => `<div class="mu" data-id="${e.id}"><img src="${unitIcon(e.type, g.players[e.owner].color, e.def)}"><div class="mh"><div style="width:${clamp(e.hp / g.maxHp(e), 0, 1) * 100}%"></div></div></div>`).join('')}</div>`;
      box.querySelectorAll('.mu').forEach((el) => el.addEventListener('mousedown', (ev) => {
        const e = g.ents.get(+el.dataset.id);
        if (!e) return;
        if (ev.shiftKey) this.selected.delete(e);
        else { this.selected.clear(); this.selected.add(e); }
        this.refreshCmds(true);
      }));
      return;
    }
    const e = sel[0];
    const owner = e.owner >= 0 ? g.players[e.owner] : null;
    let icon, name, parts = [];
    if (e.kind === 'unit') {
      icon = unitIcon(e.type, owner.color, e.def); name = e.def.name;
      const atk = g.atkOf(e), arm = g.armorOf(e), rng = g.rangeOf(e);
      parts.push(`<div class="stats"><span>⚔ <b>${atk}</b>${e.def.bonus ? ' <small>(+bonus)</small>' : ''}</span><span>🛡 <b>${arm[0]}/${arm[1]}</b></span>${rng ? `<span>🏹 <b>${rng}</b></span>` : ''}<span>👁 <b>${e.def.los}</b></span></div>`);
      if (e.def.cls === 'villager') {
        const act = !e.task ? 'Idle' : e.task.t === 'gather' ? `Gathering ${e.task.resType}` : e.task.t === 'build' ? 'Building' : e.task.t === 'attack' ? 'Fighting' : 'Moving';
        parts.push(`<div class="stats"><span>${act}</span>${e.carry.amt > 0 ? `<span><img src="${resIconSmall(e.carry.type)}" style="width:16px;vertical-align:middle"> <b>${Math.floor(e.carry.amt)}</b>/${g.carryCap(e)}</span>` : ''}</div>`);
      } else parts.push(`<div class="desc">${e.def.desc}</div>`);
    } else if (e.kind === 'building') {
      icon = buildingIcon(e.type, owner.color); name = e.def.name;
      if (!e.built) parts.push(`<div class="stats"><span>Under construction: <b>${Math.floor(e.progress * 100)}%</b></span></div>`);
      else {
        const arm = g.armorOf(e);
        const s = [`<span>🛡 <b>${arm[0]}/${arm[1]}</b></span>`];
        if (e.def.attack) s.push(`<span>🏹 <b>${e.def.attack.atk + owner.mods.atk.building + (e.type === 'tower' ? owner.mods.towerAtk : 0)}</b> × ${e.def.attack.shots}</span>`);
        if (e.def.pop) s.push(`<span>🏠 +${e.def.pop}</span>`);
        if (e.type === 'farm') s.push(`<span>🌾 <b>${Math.floor(e.amount)}</b> food left</span>`);
        parts.push(`<div class="stats">${s.join('')}</div>`);
        if (e.owner === g.human && e.queue.length) {
          parts.push(`<div class="queue">${e.queue.map((q, i) => {
            const isU = q.kind === 'unit';
            const ic = isU ? `<img src="${unitIcon(q.key, owner.color, UNITS[q.key])}">` : (TECHS[q.key].unitIcon ? `<img src="${unitIcon(TECHS[q.key].unitIcon, owner.color, UNITS[TECHS[q.key].unitIcon])}">` : `<div class="emo">${TECHS[q.key].icon}</div>`);
            const tt = isU ? UNITS[q.key].time : TECHS[q.key].time;
            return `<div class="qitem ${i === 0 ? 'first' : ''} ${q.blocked ? 'blocked' : ''}" data-i="${i}" title="Click to cancel">${ic}${i === 0 ? `<div class="qp" style="width:${q.t / tt * 100}%"></div>` : ''}</div>`;
          }).join('')}</div>`);
          if (e.queue[0].blocked) parts.push(`<div class="hint" style="color:#ff8f7a">Population limit reached — build more houses!</div>`);
        } else if (e.owner === g.human) parts.push(`<div class="desc">${e.def.desc}</div>${e.def.trains ? '<div class="hint">Right-click to set a rally point.</div>' : ''}`);
      }
    } else {
      icon = resourceIcon(e.type); name = RESOURCE_DEFS[e.type].name;
      parts.push(`<div class="stats"><span><img src="${resIconSmall(RESOURCE_DEFS[e.type].res)}" style="width:18px;vertical-align:middle"> <b>${Math.ceil(e.amount)}</b> ${RESOURCE_DEFS[e.type].res}</span></div>`);
    }
    const hp = e.kind !== 'resource' ? `<div class="hpbar"><div style="width:${clamp(e.hp / g.maxHp(e), 0, 1) * 100}%"></div><span>${Math.ceil(e.hp)} / ${g.maxHp(e)}</span></div>` : '';
    const html = `<div class="portrait"><img src="${icon}"></div><div class="info-main"><div class="info-name">${name}</div>${owner ? `<div class="info-owner" style="color:${owner.color.light}">${owner.name}</div>` : ''}${hp}${parts.join('')}</div>`;
    if (html === this.infoSig) return;
    this.infoSig = html;
    box.innerHTML = html;
    box.querySelectorAll('.qitem').forEach((el) => el.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      g.cancelQueue(e, +el.dataset.i);
      this.audio.play('click');
      this.refreshCmds(true);
    }));
  }
}
