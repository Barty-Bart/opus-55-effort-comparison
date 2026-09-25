// Scene renderer: isometric world, fog of war, sprites, effects and overlays.
import { buildTerrain, scatterDecals, DECAL_KINDS } from './terrain.js';
import { SpriteCache } from './sprites.js';
import { Effects } from './effects.js';
import { buildingSprite, farmSprite, scaffoldSprite, foundationSprite, rubbleSprite } from './art_buildings.js';
import { treeSprite, fellenTreeSprite, stumpSprite, mineSprite, berrySprite, fishSprite, blobShadow, decalSprite } from './art_nature.js';
import { facingToDir, unitLookKind } from './art_units.js';
import { SS, makeCanvas } from './draw3d.js';
import { TER } from '../core/map.js';
import { BUILDINGS } from '../core/data.js';

const ZH = 39.19;
const GAIA_TEAM = { main: '#9a9a9a', dark: '#555', light: '#ddd' };
const WORK_CYCLE = { wood: 1.15, gold: 1.35, stone: 1.35, farm: 1.6, build: 0.8, forage: 1.3, hunt: 1.0, fish: 1.5 };
const MIRROR = { 3: 1, 4: 0, 5: 7 };
const WORK_SOUND = { wood: 'chop', gold: 'mine', stone: 'mine', farm: 'farm', build: 'hammer', fish: 'splash' };

export class Renderer {
  constructor(canvas, game, viewer) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.game = game;
    this.viewer = viewer;
    this.sprites = new SpriteCache();
    this.fx = new Effects();
    this.cam = { x: 0, y: 0, zoom: 1.15 };
    this.time = 0;
    this.ui = { selection: new Set(), hover: null, placing: null, dragBox: null };
    const n = game.n;
    const tr = buildTerrain(game.map, game.opts.seed);
    this.terrain = tr.canvas; this.T = tr.T; this.miniColors = tr.mini;
    this.decals = scatterDecals(game.map, game.opts.seed);
    this.fog = makeCanvas(n + 2, n + 2);
    this.fogCtx = this.fog.getContext('2d');
    this.fogImg = this.fogCtx.createImageData(n + 2, n + 2);
    this.fogA = new Float32Array((n + 2) * (n + 2)).fill(1);
    this.items = [];
    this.picks = [];
    this.wallMasks = new Map();
    this.wallsDirty = true;
    this.emitT = new Map();
    this.workSounds = [];
    this.birds = Array.from({ length: Math.max(2, Math.round(n / 40)) }, (_, i) => ({
      x: n * (0.2 + 0.6 * Math.random()), y: n * (0.2 + 0.6 * Math.random()), a: Math.random() * 6.283, turn: (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.2),
      z: 3.2 + Math.random() * 1.5, ph: Math.random() * 10, glide: 0, id: i,
    }));
    this.resize();
  }

  get player() { return this.game.players[this.viewer]; }
  teamOf(owner) { return owner >= 0 ? this.game.players[owner].color : GAIA_TEAM; }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.W = this.canvas.clientWidth || window.innerWidth;
    this.H = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(this.W * dpr);
    this.canvas.height = Math.round(this.H * dpr);
  }

  // ------------------------------------------------------------ camera
  iso(x, y) { return [(x - y) * 32, (x + y) * 16]; }
  centerOn(x, y) { const [ix, iy] = this.iso(x, y); this.cam.x = ix; this.cam.y = iy; this.clampCam(); }
  screenToIso(sx, sy) { return [(sx - this.W / 2) / this.cam.zoom + this.cam.x, (sy - this.H / 2) / this.cam.zoom + this.cam.y]; }
  screenToTile(sx, sy) {
    const [ix, iy] = this.screenToIso(sx, sy);
    return { x: (ix / 32 + iy / 16) / 2, y: (iy / 16 - ix / 32) / 2 };
  }
  toScreen(x, y, z = 0) {
    const [ix, iy] = this.iso(x, y);
    return [(ix - this.cam.x) * this.cam.zoom + this.W / 2, (iy - z * ZH - this.cam.y) * this.cam.zoom + this.H / 2];
  }
  clampCam() {
    const n = this.game.n;
    let tx = (this.cam.x / 32 + this.cam.y / 16) / 2, ty = (this.cam.y / 16 - this.cam.x / 32) / 2;
    tx = Math.max(2, Math.min(n - 2, tx)); ty = Math.max(2, Math.min(n - 2, ty));
    const [ix, iy] = this.iso(tx, ty);
    this.cam.x = ix; this.cam.y = iy;
  }
  zoomAt(sx, sy, factor) {
    const before = this.screenToIso(sx, sy);
    this.cam.zoom = Math.max(0.55, Math.min(1.9, this.cam.zoom * factor));
    const after = this.screenToIso(sx, sy);
    this.cam.x += before[0] - after[0]; this.cam.y += before[1] - after[1];
    this.clampCam();
  }

  // ------------------------------------------------------------ events → effects
  onEvent(e) {
    const g = this.game, fx = this.fx, t = this.time;
    const vis = (x, y) => this.visibleTile(Math.floor(x), Math.floor(y));
    switch (e.type) {
      case 'death': {
        const u = e.unit;
        if (!vis(u.x, u.y) && u.owner !== this.viewer) break;
        const kind = unitLookKind(u.type);
        const [ix, iy] = this.iso(u.x, u.y);
        if (kind === 'ram' || kind === 'mangonel' || kind === 'treb') { fx.dust(ix, iy, 12, 1.2); for (let i = 0; i < 5; i++) fx.fire(ix + (Math.random() - 0.5) * 20, iy - 6, 0.8); }
        else fx.corpses.push({ type: u.type, owner: u.owner, x: u.x, y: u.y, dir: facingToDir(u.facing), variant: this.variantOf(u), t0: t, ttl: 14 });
        break;
      }
      case 'destroyed': {
        const b = e.building;
        this.wallsDirty = true;
        if (e.silent && b.def.isFarm) break;
        const [ix, iy] = this.iso(b.x, b.y);
        if (!this.player.explored[Math.floor(b.y) * g.n + Math.floor(b.x)]) break;
        fx.rubble.push({ tx: b.tx, ty: b.ty, size: b.size, stone: b.ageStyle >= 1 || b.def.classes.includes('castle') || b.type === 'stoneWall', t0: t });
        fx.dust(ix, iy, 10 + b.size * 6, 1 + b.size * 0.4);
        for (let i = 0; i < b.size * 4; i++) fx.fire(ix + (Math.random() - 0.5) * b.size * 40, iy - Math.random() * 10, 1);
        break;
      }
      case 'placed': case 'built': this.wallsDirty = true; break;
      case 'depleted': {
        const r = e.res;
        if (r.type === 'tree') this.fx.stumps.push({ tx: r.tx, ty: r.ty, v: r.variant });
        break;
      }
      case 'impact': {
        if (!vis(e.x, e.y)) break;
        const [ix, iy] = this.iso(e.x, e.y);
        if (e.kind === 'stone' || e.kind === 'boulder') fx.dust(ix, iy, e.kind === 'boulder' ? 12 : 7, e.kind === 'boulder' ? 1.3 : 0.8, 'dust');
        else if (!e.hit) {
          const tile = g.map.terrain[Math.floor(e.y) * g.n + Math.floor(e.x)];
          if (tile === TER.WATER || tile === TER.SHALLOW) fx.splash(ix, iy);
          else fx.parts.push({ x: ix, y: iy, vx: 0, vy: 0, g: 0, drag: 0, grow: 0, life: 0, max: 2.5, size: 1, kind: 'stuck', alpha: 1 });
        }
        break;
      }
      case 'convert': {
        const u = e.unit; const [ix, iy] = this.iso(u.x, u.y);
        fx.sparkle(ix, iy - 14, '#fff3a0', 16);
        break;
      }
      case 'melee': {
        if (!vis(e.x, e.y) || Math.random() < 0.5) break;
        const [ix, iy] = this.iso(e.x, e.y);
        if (e.target && e.target.kind === 'building') fx.chips(ix + (Math.random() - 0.5) * 20, iy - 10, '#9a8a70', 2);
        break;
      }
      case 'trained': case 'research': break;
    }
  }

  variantOf(u) { return u.isVillager ? u.variant % 4 : u.def.isAnimal ? u.variant % 2 : u.variant % 3; }

  visibleTile(x, y) {
    const n = this.game.n;
    if (x < 0 || y < 0 || x >= n || y >= n) return false;
    return this.fullView || this.player.visible[y * n + x] === 1;
  }
  exploredTile(x, y) {
    const n = this.game.n;
    if (x < 0 || y < 0 || x >= n || y >= n) return false;
    return this.fullView || this.player.explored[y * n + x] === 1;
  }

  // ------------------------------------------------------------ helpers
  blit(s, ix, iy, alpha = 1, mirror = false) {
    const ctx = this.ctx;
    if (alpha !== 1) ctx.globalAlpha = alpha;
    const w = s.canvas.width / SS, h = s.canvas.height / SS;
    if (mirror) {
      ctx.save(); ctx.translate(ix, iy); ctx.scale(-1, 1);
      ctx.drawImage(s.canvas, -s.ax / SS, -s.ay / SS, w, h);
      ctx.restore();
    } else ctx.drawImage(s.canvas, ix - s.ax / SS, iy - s.ay / SS, w, h);
    if (alpha !== 1) ctx.globalAlpha = 1;
  }
  worldTransform() {
    const s = this.cam.zoom * this.dpr;
    this.ctx.setTransform(s, 0, 0, s, (this.W / 2 - this.cam.x * this.cam.zoom) * this.dpr, (this.H / 2 - this.cam.y * this.cam.zoom) * this.dpr);
  }

  unitAnim(u) {
    let anim = u.anim, frame = 0;
    const kind = unitLookKind(u.type);
    const t = this.time;
    if (anim === 'walk') {
      if (kind === 'ram' || kind === 'mangonel' || kind === 'treb') anim = 'idle';
      else {
        const base = kind === 'rider' ? 1.25 : kind === 'human' ? 0.62 : 0.8;
        const cyc = base / Math.max(0.35, u.st.speed) * (u.order && u.order.wander ? 2 : 1);
        frame = Math.floor(((t - u.animT) / cyc) * 8) % 8;
        if (frame < 0) frame = 0;
      }
    } else if (anim === 'attack') {
      const dur = kind === 'treb' ? 2.2 : kind === 'mangonel' ? 1.3 : Math.min(u.st.reload, 1.0);
      const e = t - u.animT;
      if (e > dur || e < 0) { anim = 'idle'; }
      else frame = Math.min(5, Math.floor((e / dur) * 6));
    } else if (anim === 'work') {
      const cyc = WORK_CYCLE[u.task] || 1.1;
      frame = Math.floor(((t - u.animT + (u.id % 7) * 0.13) / cyc) * 6) % 6;
      if (frame < 0) frame = 0;
    }
    return [anim, frame];
  }

  unitSpriteFor(u) {
    let [anim, frame] = this.unitAnim(u);
    const d = facingToDir(u.facing);
    const mirror = d >= 3 && d <= 5;
    const dir = mirror ? MIRROR[d] : d;
    let task = null, carry = null;
    if (u.isVillager) {
      task = u.task;
      if (u.carry > 0.5 && anim === 'walk') carry = u.carryType;
      if (anim === 'walk' && !carry && task === 'forage') task = null;
      if (anim === 'walk' || anim === 'idle') { if (task === 'hunt' && !carry) task = 'hunt'; }
    }
    const s = this.sprites.unit(u.type, this.teamOf(u.owner), anim, frame, dir, this.variantOf(u), task, carry, u.def.isAnimal && u.owner >= 0);
    return { s, mirror, anim, frame };
  }

  computeWallMasks() {
    this.wallMasks.clear();
    const g = this.game, n = g.n;
    for (const b of g.buildings) {
      if (!b.alive || !b.def.isWall) continue;
      let m = 0;
      const chk = (x, y) => { const e = g.entityAtTile(x, y); return e && e.kind === 'building' && e.def.isWall; };
      if (chk(b.tx + 1, b.ty)) m |= 1;
      if (chk(b.tx - 1, b.ty)) m |= 2;
      if (chk(b.tx, b.ty + 1)) m |= 4;
      if (chk(b.tx, b.ty - 1)) m |= 8;
      this.wallMasks.set(b.id, m);
    }
    void n;
    this.wallsDirty = false;
  }

  // ------------------------------------------------------------ main render
  render(alpha, dtReal) {
    const g = this.game, ctx = this.ctx, n = g.n;
    this.time = g.time + alpha * (1 / 20);
    this.sprites.beginFrame();
    this.fx.update(dtReal, this.time);
    if (this.wallsDirty) this.computeWallMasks();
    const p = this.player;
    const zoom = this.cam.zoom;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.worldTransform();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // terrain
    ctx.save();
    const T = this.T;
    ctx.transform(32 / T, 16 / T, -32 / T, 16 / T, 0, 0);
    ctx.drawImage(this.terrain, 0, 0);
    ctx.restore();

    // visible range in iso px
    const vx0 = this.cam.x - this.W / 2 / zoom - 64, vx1 = this.cam.x + this.W / 2 / zoom + 64;
    const vy0 = this.cam.y - this.H / 2 / zoom - 40, vy1 = this.cam.y + this.H / 2 / zoom + 200;
    this.view = { vx0, vx1, vy0, vy1 };
    const toTile = (ix, iy) => [(ix / 32 + iy / 16) / 2, (iy / 16 - ix / 32) / 2];
    const cs = [toTile(vx0, vy0), toTile(vx1, vy0), toTile(vx0, vy1), toTile(vx1, vy1)];
    const tx0 = Math.max(0, Math.floor(Math.min(...cs.map((c) => c[0]))) - 1), tx1 = Math.min(n - 1, Math.ceil(Math.max(...cs.map((c) => c[0]))) + 1);
    const ty0 = Math.max(0, Math.floor(Math.min(...cs.map((c) => c[1]))) - 1), ty1 = Math.min(n - 1, Math.ceil(Math.max(...cs.map((c) => c[1]))) + 1);
    const inView = (ix, iy, m = 0) => ix > vx0 - m && ix < vx1 + m && iy > vy0 - m && iy < vy1 + m;

    const items = this.items; items.length = 0;
    const map = g.map, occ = map.occ, terrain = map.terrain, explored = this.fullView ? this.allOnes || (this.allOnes = new Uint8Array(n * n).fill(1)) : p.explored;
    // --- per-tile pass: water glints, decals, static resources
    const glintT = this.time;
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const ix = (tx - ty) * 32, iy = (tx + ty) * 16 + 16;
        if (!inView(ix, iy)) continue;
        const i = ty * n + tx;
        if (!explored[i]) continue;
        const t = terrain[i];
        if (t === TER.WATER || t === TER.SHALLOW) {
          const h = ((tx * 73856093) ^ (ty * 19349663)) >>> 0;
          const ph = (h % 1000) / 1000;
          const a = Math.sin(glintT * 1.1 + ph * 6.283);
          if (a > 0.55) {
            const k = (a - 0.55) / 0.45;
            ctx.globalAlpha = k * (t === TER.WATER ? 0.5 : 0.35);
            ctx.strokeStyle = '#e8f6ff';
            ctx.lineWidth = 1.1;
            const ox = ((h >> 10) % 30) - 15, oy = ((h >> 16) % 12) - 6;
            ctx.beginPath(); ctx.moveTo(ix + ox - 5, iy + oy); ctx.quadraticCurveTo(ix + ox, iy + oy - 2, ix + ox + 5, iy + oy); ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
        const dcl = this.decals[i];
        if (dcl && !occ[i]) {
          const kind = DECAL_KINDS[(dcl - 1) >> 4], v = (dcl - 1) & 15;
          const s = decalSprite(kind, v);
          this.blit(s, ix + ((v * 7) % 13) - 6, iy + ((v * 5) % 7) - 3);
        }
        const id = occ[i];
        if (id) {
          const e = g.entities.get(id);
          if (e && e.kind === 'resource') {
            if (e.type === 'fish') {
              const s = fishSprite(e.variant);
              this.blit(s, ix, iy, 0.9);
              const rp = (this.time * 0.5 + (e.variant % 10) / 10) % 1;
              ctx.strokeStyle = `rgba(230,245,255,${0.45 * (1 - rp)})`;
              ctx.lineWidth = 1;
              ctx.beginPath(); ctx.ellipse(ix + ((e.variant % 5) - 2) * 3, iy, 3 + rp * 10, (3 + rp * 10) * 0.5, 0, 0, 6.283); ctx.stroke();
              items.push({ d: tx + ty + 0.2, k: 9, e, ix, iy });
            } else items.push({ d: tx + ty + 1, k: 1, e, ix, iy });
          }
        }
      }
    }
    // stumps
    for (const st of this.fx.stumps) {
      const [ix, iy] = this.iso(st.tx + 0.5, st.ty + 0.5);
      if (!inView(ix, iy)) continue;
      if (occ[st.ty * n + st.tx]) continue;
      this.blit(stumpSprite(st.v), ix, iy);
    }
    // rubble
    for (const r of this.fx.rubble) {
      const [ix, iy] = this.iso(r.tx, r.ty);
      if (!inView(ix, iy, 200)) continue;
      const a = Math.min(1, (90 - (this.time - r.t0)) / 10);
      this.blit(rubbleSprite(r.size, r.stone), ix, iy, a);
    }
    // --- buildings (live + remembered)
    const sel = this.ui.selection;
    for (const b of g.buildings) {
      if (!b.alive) continue;
      const own = b.owner === this.viewer || g.isAlly(b.owner, this.viewer) || this.fullView;
      if (!own && !g.buildingVisibleTo(p, b)) continue;
      const [ix, iy] = this.iso(b.tx, b.ty);
      if (!inView(ix, iy, b.size * 64 + 60)) continue;
      this.queueBuilding(items, b, ix, iy, b.type, b.owner, b.ageStyle, b.complete, b.progress, b.variant, b);
    }
    if (!this.fullView) for (const m of p.memory.values()) {
      const live = g.entities.get(m.id);
      if (live && live.alive && g.buildingVisibleTo(p, live)) continue;
      const [ix, iy] = this.iso(m.tx, m.ty);
      if (!inView(ix, iy, m.size * 64 + 60)) continue;
      this.queueBuilding(items, null, ix, iy, m.type, m.owner, m.ageStyle, m.complete, m.progress, m.variant, m);
    }
    // --- carcasses & corpses (ground)
    for (const r of g.resources) {
      if (!r.alive || r.size !== 0) continue;
      if (!this.visibleTile(Math.floor(r.x), Math.floor(r.y)) && !explored[Math.floor(r.y) * n + Math.floor(r.x)]) continue;
      const [ix, iy] = this.iso(r.x, r.y);
      if (!inView(ix, iy)) continue;
      items.push({ d: r.x + r.y - 0.6, k: 6, e: r, ix, iy });
    }
    for (const c of this.fx.corpses) {
      const [ix, iy] = this.iso(c.x, c.y);
      if (!inView(ix, iy)) continue;
      if (!this.visibleTile(Math.floor(c.x), Math.floor(c.y)) && c.owner !== this.viewer) continue;
      items.push({ d: c.x + c.y - 0.5, k: 7, e: c, ix, iy });
    }
    // --- units
    for (const u of g.units) {
      if (!u.alive || u.garrisonedIn) continue;
      const x = u.px + (u.x - u.px) * alpha, y = u.py + (u.y - u.py) * alpha;
      const own = u.owner === this.viewer || g.isAlly(u.owner, this.viewer);
      if (!own && !this.visibleTile(Math.floor(x), Math.floor(y))) continue;
      const [ix, iy] = this.iso(x, y);
      if (!inView(ix, iy, 40)) continue;
      items.push({ d: x + y, k: 4, e: u, ix, iy });
    }

    // --- selection circles & shadows (ground layer)
    this.drawGround(items, sel);

    items.sort((a, b) => a.d - b.d);
    this.picks.length = 0;
    const occluded = [];
    this.occluders = [];
    for (const it of items) this.drawItem(it, occluded);
    this.drawSilhouettes(occluded);
    this.drawProjectiles(alpha);
    this.drawParticles();
    this.drawBirds(dtReal);
    this.drawFog(dtReal);
    this.drawOverlays(alpha);
  }

  queueBuilding(items, b, ix, iy, type, owner, style, complete, progress, variant, src) {
    const def = BUILDINGS[type];
    if (def.isFarm) { items.push({ d: -1e6 + (src.tx + src.ty), k: 5, e: src, ix, iy, type, owner, complete, progress, variant, ghost: !b }); return; }
    items.push({ d: src.tx + src.ty + def.size - 0.02, k: 2, e: src, ix, iy, type, owner, style, complete, progress, variant, ghost: !b, live: b });
  }

  drawGround(items, sel) {
    const ctx = this.ctx;
    // farms first (flat), then foundations, then shadows
    for (const it of items) {
      if (it.k === 5) {
        const b = it.e;
        const frac = it.ghost ? 0.9 : (b.amount / (b.maxAmount || 1));
        const stage = !it.complete ? 0 : frac > 0.72 ? 0 : frac > 0.42 ? 1 : frac > 0.14 ? 2 : 3;
        if (!it.complete) this.blit(foundationSprite(3), it.ix, it.iy);
        this.blit(farmSprite(stage, it.variant), it.ix, it.iy, it.complete ? 1 : Math.max(0.15, it.progress));
        if (it.live !== undefined || !it.ghost) this.pickBox(it.e, it.ix - 96, it.iy, it.ix + 96, it.iy + 96, 0);
        if (sel.has(b)) this.footprint(b.tx, b.ty, 3, '#ffffff');
      }
    }
    for (const it of items) {
      if (it.k === 2 && !it.complete) this.blit(foundationSprite(BUILDINGS[it.type].size), it.ix, it.iy);
    }
    // selection indicators under units / buildings
    for (const e of sel) {
      if (!e.alive) continue;
      if (e.kind === 'unit' && !e.garrisonedIn) {
        const [ix, iy] = this.iso(e.x, e.y);
        const r = e.def.radius * 64 + 5;
        ctx.strokeStyle = e.owner === this.viewer ? 'rgba(255,255,255,0.9)' : e.owner < 0 ? 'rgba(255,230,120,0.9)' : 'rgba(255,90,80,0.95)';
        ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.ellipse(ix, iy, r, r * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
      } else if (e.kind === 'building' && !e.def.isFarm) this.footprint(e.tx, e.ty, e.size, e.owner === this.viewer ? '#ffffff' : '#ff6a5a');
      else if (e.kind === 'resource') { if (e.size) this.footprint(e.tx, e.ty, 1, '#ffe27a'); }
    }
    const h = this.ui.hover;
    if (h && h.alive && !sel.has(h)) {
      if (h.kind === 'unit' && !h.garrisonedIn) {
        const [ix, iy] = this.iso(h.x, h.y);
        const r = h.def.radius * 64 + 5;
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(ix, iy, r, r * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
      } else if (h.kind === 'building') this.footprint(h.tx, h.ty, h.size, 'rgba(255,255,255,0.35)');
    }
    // shadows
    ctx.globalAlpha = 0.3;
    for (const it of items) {
      if (it.k === 2 && it.complete) {
        const s = this.buildingSpriteFor(it);
        const sh = s.shadow;
        if (sh) ctx.drawImage(sh.canvas, it.ix - sh.ax / sh.scale, it.iy - sh.ay / sh.scale, sh.canvas.width / sh.scale, sh.canvas.height / sh.scale);
      }
    }
    ctx.globalAlpha = 1;
    for (const it of items) {
      if (it.k === 1) {
        const e = it.e;
        if (e.type === 'tree' && !e.felled) { const s = blobShadow(17, 8, 0.28); this.blit(s, it.ix + 22, it.iy - 2); }
        else if (e.type === 'gold' || e.type === 'stone') { const s = blobShadow(12, 6, 0.22); this.blit(s, it.ix + 4, it.iy + 1); }
      } else if (it.k === 4) {
        const u = it.e;
        const kind = unitLookKind(u.type);
        const s = kind === 'rider' ? blobShadow(13, 6, 0.3) : kind === 'human' ? blobShadow(7, 3.5, 0.3) : u.def.isAnimal ? blobShadow(8, 4, 0.28) : blobShadow(16, 8, 0.3);
        this.blit(s, it.ix + 3, it.iy + 0.5);
      }
    }
  }

  footprint(tx, ty, size, color) {
    const ctx = this.ctx;
    const [x0, y0] = this.iso(tx, ty), [x1, y1] = this.iso(tx + size, ty), [x2, y2] = this.iso(tx + size, ty + size), [x3, y3] = this.iso(tx, ty + size);
    ctx.strokeStyle = color; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.closePath(); ctx.stroke();
  }

  buildingSpriteFor(it) {
    const mask = BUILDINGS[it.type].isWall ? (this.wallMasks.get(it.e.id) ?? 0) : 0;
    return buildingSprite(it.type, it.style, this.teamOf(it.owner), it.variant, mask);
  }

  pickBox(e, x0, y0, x1, y1, pri) { this.picks.push({ e, x0, y0, x1, y1, pri }); }

  drawItem(it, occluded) {
    const ctx = this.ctx;
    switch (it.k) {
      case 1: { // static resource
        const e = it.e;
        let s;
        if (e.type === 'tree') s = e.felled ? fellenTreeSprite(e.species, e.variant, Math.round(((e.fellAngle || 0) / (Math.PI * 2)) * 8 + 8) % 8) : treeSprite(e.species || 'oak', e.variant % 6);
        else if (e.type === 'gold' || e.type === 'stone') s = mineSprite(e.type, e.variant, e.amount / e.maxAmount > 0.66 ? 2 : e.amount / e.maxAmount > 0.33 ? 1 : 0);
        else if (e.type === 'berries') s = berrySprite(e.variant, e.amount > 0);
        if (!s) return;
        this.blit(s, it.ix, it.iy);
        if (e.type === 'tree' && !e.felled) this.occluders.push({ s, x: it.ix - s.ax / SS, y: it.iy - s.ay / SS, d: it.d });
        if (e.type === 'tree') this.pickBox(e, it.ix - 12, it.iy - 52, it.ix + 12, it.iy + 4, 1);
        else this.pickBox(e, it.ix - 16, it.iy - 18, it.ix + 16, it.iy + 8, 1);
        break;
      }
      case 9: this.pickBox(it.e, it.ix - 16, it.iy - 8, it.ix + 16, it.iy + 8, 1); break;
      case 2: this.drawBuilding(it); break;
      case 4: {
        const u = it.e;
        const { s, mirror, anim, frame } = this.unitSpriteFor(u);
        if (anim === 'work' && frame !== u._wf) {
          u._wf = frame;
          if (frame === 3 && WORK_SOUND[u.task] && this.workSounds.length < 12) this.workSounds.push({ name: WORK_SOUND[u.task], x: u.x, y: u.y });
        }
        if (!s) return;
        this.blit(s, it.ix, it.iy, 1, mirror);
        const w = s.canvas.width / SS, h = s.canvas.height / SS;
        const x0 = mirror ? it.ix - (w - s.ax / SS) : it.ix - s.ax / SS, y0 = it.iy - s.ay / SS;
        this.pickBox(u, x0 + 2, y0 + 1, x0 + w - 2, y0 + h - 1, 3);
        u._top = y0;
        if (this.isOccluded(u)) occluded.push({ s, mirror, u, d: it.d, x0, y0, w, h });
        // effects tied to animation
        if (u.anim === 'work' && u.task === 'wood' && Math.random() < 0.02) this.fx.chips(it.ix + (mirror ? -8 : 8), it.iy - 10, '#c09060', 2);
        if (u.def.isMonk && u.order && u.order.type === 'heal' && u.anim === 'work' && Math.random() < 0.15) {
          const t = u.order.target;
          if (t && t.alive) { const [tx, ty] = this.iso(t.x, t.y); this.fx.heal(tx, ty - 20); }
        }
        break;
      }
      case 6: { // carcass
        const r = it.e;
        const s = this.sprites.carcass(r.animal || 'deer', facingToDir(r.facing || 0));
        this.blit(s, it.ix, it.iy);
        this.pickBox(r, it.ix - 14, it.iy - 12, it.ix + 14, it.iy + 6, 1);
        break;
      }
      case 7: { // corpse
        const c = it.e;
        const e = this.time - c.t0;
        const mirror = c.dir >= 3 && c.dir <= 5;
        const dir = mirror ? MIRROR[c.dir] : c.dir;
        const frame = e < 0.7 ? Math.min(5, Math.floor((e / 0.7) * 6)) : 5;
        const s = this.sprites.unit(c.type, this.teamOf(c.owner), 'die', frame, dir, c.variant, null, null, false);
        if (!s) return;
        const a = e > c.ttl - 4 ? Math.max(0, (c.ttl - e) / 4) : 1;
        this.blit(s, it.ix, it.iy, a, mirror);
        break;
      }
    }
    void ctx;
  }

  // Draw the parts of units hidden behind trees/buildings as translucent team-coloured silhouettes.
  drawSilhouettes(list) {
    if (!list.length) return;
    const ctx = this.ctx;
    if (!this.silCanvas) { this.silCanvas = makeCanvas(64, 64); this.silCtx = this.silCanvas.getContext('2d'); }
    const sc = this.silCanvas, sx = this.silCtx;
    for (const o of list) {
      const occ = this.occluders.filter((q) => q.d > o.d && q.x < o.x0 + o.w && q.x + q.s.canvas.width / SS > o.x0 && q.y < o.y0 + o.h && q.y + q.s.canvas.height / SS > o.y0);
      if (!occ.length) continue;
      const W = o.s.canvas.width, H = o.s.canvas.height;
      if (sc.width < W || sc.height < H) { sc.width = Math.max(sc.width, W); sc.height = Math.max(sc.height, H); }
      sx.setTransform(1, 0, 0, 1, 0, 0);
      sx.globalCompositeOperation = 'source-over';
      sx.clearRect(0, 0, W, H);
      for (const q of occ) sx.drawImage(q.s.canvas, (q.x - o.x0) * SS, (q.y - o.y0) * SS);
      sx.globalCompositeOperation = 'source-in';
      const sil = this.sprites.sil(o.s, this.teamOf(o.u.owner).light);
      if (o.mirror) { sx.setTransform(-1, 0, 0, 1, W, 0); sx.drawImage(sil, 0, 0); sx.setTransform(1, 0, 0, 1, 0, 0); }
      else sx.drawImage(sil, 0, 0);
      sx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.55;
      ctx.drawImage(sc, 0, 0, W, H, o.x0, o.y0, W / SS, H / SS);
      ctx.globalAlpha = 1;
    }
  }

  isOccluded(u) {
    const g = this.game, n = g.n;
    const tx = Math.floor(u.x), ty = Math.floor(u.y);
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2], [2, 2]]) {
      const x = tx + dx, y = ty + dy;
      if (x >= n || y >= n) continue;
      const id = g.map.occ[y * n + x];
      if (!id) continue;
      const e = g.entities.get(id);
      if (!e) continue;
      if ((e.kind === 'resource' && e.type === 'tree' && !e.felled) || (e.kind === 'building' && !e.def.isFarm && !e.def.isWall)) return true;
    }
    return false;
  }

  drawBuilding(it) {
    const ctx = this.ctx;
    const s = this.buildingSpriteFor(it);
    const size = BUILDINGS[it.type].size;
    const ghost = it.ghost;
    const b = it.live;
    if (!it.complete) {
      if (it.progress > 0.01) {
        const H = s.canvas.height, vis = H * (0.12 + 0.88 * it.progress);
        const w = s.canvas.width;
        ctx.drawImage(s.canvas, 0, H - vis, w, vis, it.ix - s.ax / SS, it.iy - s.ay / SS + (H - vis) / SS, w / SS, vis / SS);
        const sc = scaffoldSprite(size, 18 + size * 14);
        this.blit(sc, it.ix, it.iy, 0.95);
      }
      this.pickBox(it.e, it.ix - size * 32, it.iy - 10, it.ix + size * 32, it.iy + size * 32, 2);
      return;
    }
    if (ghost) { ctx.globalAlpha = 0.85; }
    this.blit(s, it.ix, it.iy);
    ctx.globalAlpha = 1;
    this.occluders.push({ s, x: it.ix - s.ax / SS, y: it.iy - s.ay / SS, d: it.d });
    const top = it.iy - s.ay / SS;
    this.pickBox(it.e, it.ix - size * 32 + 4, top + 6, it.ix + size * 32 - 4, it.iy + size * 32 - 2, 2);
    if (b) b._top = top;
    // mill sails
    if (s.sails) {
      const sl = this.sprites.sails();
      const cx = it.ix + s.sails.sx, cy = it.iy + s.sails.sy;
      ctx.save(); ctx.translate(cx, cy); ctx.scale(0.62, 0.9); ctx.rotate(this.time * (ghost ? 0 : 0.9));
      ctx.drawImage(sl.canvas, -sl.ax / SS, -sl.ay / SS, sl.canvas.width / SS, sl.canvas.height / SS);
      ctx.restore();
    }
    // flags
    for (const f of s.flags) {
      const fl = this.sprites.flag(this.teamOf(it.owner), Math.floor(this.time * 8 + (it.variant % 6)) % 6);
      this.blit(fl, it.ix + f.sx, it.iy + f.sy);
    }
    if (ghost || !b) return;
    // smoke & fire
    const key = b.id;
    let last = this.emitT.get(key) || 0;
    if (this.time - last > 0.12) {
      this.emitT.set(key, this.time);
      for (const sm of s.smoke) if (Math.random() < sm.rate * 0.25) this.fx.smoke(it.ix + sm.sx, it.iy + sm.sy, sm.dark, 0.8);
      const frac = b.hp / b.maxHp;
      if (frac < 0.66) {
        const n = frac < 0.33 ? 3 : 1;
        for (let k = 0; k < n; k++) {
          const fx = b.tx + 0.3 + Math.random() * (size - 0.6), fy = b.ty + 0.3 + Math.random() * (size - 0.6);
          const [px, py] = this.iso(fx, fy);
          this.fx.fire(px, py - 14 - Math.random() * size * 14, 0.8 + size * 0.15);
        }
      }
    }
  }

  drawProjectiles(alpha) {
    const ctx = this.ctx, g = this.game;
    for (const p of g.projectiles) {
      if (p.t < 0) continue;
      const x = p.px + (p.x - p.px) * alpha, y = p.py + (p.y - p.py) * alpha, z = p.pz + (p.z - p.pz) * alpha;
      if (p.owner !== this.viewer && !this.visibleTile(Math.floor(x), Math.floor(y))) continue;
      const [ix, iy] = this.iso(x, y);
      const sy = iy - z * ZH;
      if (p.kind === 'stone' || p.kind === 'boulder') {
        const r = p.kind === 'boulder' ? 4 : 2.6;
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(ix, iy, r, r * 0.5, 0, 0, 6.283); ctx.fill();
        ctx.fillStyle = '#6a6660'; ctx.beginPath(); ctx.arc(ix, sy, r, 0, 6.283); ctx.fill();
        ctx.fillStyle = '#9a968e'; ctx.beginPath(); ctx.arc(ix - r * 0.3, sy - r * 0.3, r * 0.45, 0, 6.283); ctx.fill();
        continue;
      }
      // direction of travel in screen space
      const f = Math.min(1, p.t / p.dur);
      const dfx = (p.tx - p.sx), dfy = (p.ty - p.sy);
      const dz = (p.tz - p.sz) + 4 * p.arc * (1 - 2 * f);
      let dx = (dfx - dfy) * 32, dy = (dfx + dfy) * 16 - dz * ZH;
      const l = Math.hypot(dx, dy) || 1;
      dx /= l; dy /= l;
      const len = p.kind === 'javelin' || p.kind === 'spear' ? 11 : p.kind === 'bolt' ? 6 : 8;
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(ix, iy); ctx.lineTo(ix - dx * len * 0.7, iy - (dy * len * 0.2)); ctx.stroke();
      ctx.strokeStyle = p.kind === 'bolt' ? '#3a3026' : '#4a3620'; ctx.lineWidth = p.kind === 'javelin' || p.kind === 'spear' ? 1.4 : 1.1;
      ctx.beginPath(); ctx.moveTo(ix - dx * len, sy - dy * len); ctx.lineTo(ix, sy); ctx.stroke();
      ctx.strokeStyle = '#e8e8e8'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(ix - dx * len, sy - dy * len); ctx.lineTo(ix - dx * (len - 2), sy - dy * (len - 2)); ctx.stroke();
    }
  }

  drawParticles() {
    const ctx = this.ctx;
    for (const p of this.fx.parts) {
      const k = p.life / p.max;
      if (p.kind === 'smoke' || p.kind === 'dsmoke' || p.kind === 'dust') {
        const col = p.kind === 'smoke' ? 'rgba(210,210,210,1)' : p.kind === 'dsmoke' ? 'rgba(60,56,52,1)' : 'rgba(170,150,120,1)';
        const s = this.sprites.puff(col);
        ctx.globalAlpha = p.alpha * (1 - k) * Math.min(1, p.life * 4);
        const r = Math.max(0.5, p.size);
        ctx.drawImage(s.canvas, p.x - r, p.y - r, r * 2, r * 2);
      } else if (p.kind === 'fire') {
        const s = this.sprites.puff(k < 0.4 ? 'rgba(255,230,120,1)' : 'rgba(255,120,30,1)');
        ctx.globalAlpha = p.alpha * (1 - k);
        const r = Math.max(0.5, p.size);
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(s.canvas, p.x - r, p.y - r, r * 2, r * 2);
        ctx.globalCompositeOperation = 'source-over';
      } else if (p.kind === 'chip' || p.kind === 'spark') {
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      } else if (p.kind === 'plus') {
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - 2.5, p.y - 0.8, 5, 1.6); ctx.fillRect(p.x - 0.8, p.y - 2.5, 1.6, 5);
      } else if (p.kind === 'stuck') {
        ctx.globalAlpha = 1 - k * k;
        ctx.strokeStyle = '#4a3620'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 3, p.y - 5); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  // Birds of prey circling lazily over the land (ambient).
  drawBirds(dt) {
    const ctx = this.ctx, n = this.game.n;
    for (const b of this.birds) {
      b.ph += dt;
      if (Math.random() < dt * 0.08) b.turn = -b.turn;
      b.a += b.turn * dt;
      b.x += Math.cos(b.a) * 1.3 * dt; b.y += Math.sin(b.a) * 1.3 * dt;
      if (b.x < 4 || b.y < 4 || b.x > n - 4 || b.y > n - 4) b.a += Math.PI * dt * 2;
      b.x = Math.max(2, Math.min(n - 2, b.x)); b.y = Math.max(2, Math.min(n - 2, b.y));
      if (!this.exploredTile(Math.floor(b.x), Math.floor(b.y))) continue;
      const [gx, gy] = this.iso(b.x + b.z * 0.375, b.y - b.z * 0.5);
      const [ix, iy0] = this.iso(b.x, b.y);
      const iy = iy0 - b.z * ZH;
      if (!(ix > this.view.vx0 && ix < this.view.vx1 && iy > this.view.vy0 - 100 && iy < this.view.vy1)) continue;
      const flap = Math.sin(b.ph * 7) > 0.2 || Math.floor(b.ph / 3) % 2 ? Math.sin(b.ph * 9) * 2.2 : 0.4;
      const dx = Math.cos(b.a) - Math.sin(b.a), dy = (Math.cos(b.a) + Math.sin(b.a)) * 0.5;
      const l = Math.hypot(dx, dy) || 1, fx = dx / l, fy = dy / l, px = -fy, py = fx;
      const wing = (sx, sy, col, w) => {
        ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(sx + px * 7 - fx * 1.5, sy + py * 7 - flap - fy * 1.5);
        ctx.quadraticCurveTo(sx + px * 3, sy + py * 3 - flap * 0.6 - 1.5, sx, sy);
        ctx.quadraticCurveTo(sx - px * 3, sy - py * 3 - flap * 0.6 - 1.5, sx - px * 7 - fx * 1.5, sy - py * 7 - flap - fy * 1.5);
        ctx.stroke();
      };
      ctx.globalAlpha = 0.14; wing(gx, gy, '#000', 2.2);
      ctx.globalAlpha = 0.9; wing(ix, iy, '#2a2018', 1.7);
      ctx.fillStyle = '#2a2018'; ctx.beginPath(); ctx.ellipse(ix + fx * 1.5, iy + fy * 1.5, 1.8, 1.1, Math.atan2(fy, fx), 0, 6.283); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  drawFog(dt) {
    const g = this.game, n = g.n, p = this.player;
    const W = n + 2;
    const A = this.fogA, d = this.fogImg.data;
    const k = Math.min(1, dt * 7);
    const all = g.opts.reveal === 'all';
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        const j = y * W + x;
        let target = 1;
        if (x > 0 && y > 0 && x <= n && y <= n) {
          const i = (y - 1) * n + (x - 1);
          target = all || this.fullView ? 0 : p.visible[i] ? 0 : p.explored[i] ? 0.5 : 1;
        }
        A[j] += (target - A[j]) * k;
        d[j * 4 + 3] = A[j] * 255;
      }
    }
    this.fogCtx.putImageData(this.fogImg, 0, 0);
    const ctx = this.ctx;
    ctx.save();
    ctx.transform(32, 16, -32, 16, 0, 0);
    ctx.drawImage(this.fog, -1, -1);
    ctx.restore();
  }

  drawOverlays(alpha) {
    const ctx = this.ctx, g = this.game, ui = this.ui;
    // health bars
    const bar = (x, y, w, frac, col) => {
      ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 4.5);
      ctx.fillStyle = '#6a1a14'; ctx.fillRect(x - w / 2, y, w, 2.5);
      ctx.fillStyle = frac > 0.5 ? col : frac > 0.25 ? '#e8c030' : '#e84030';
      ctx.fillRect(x - w / 2, y, w * Math.max(0, frac), 2.5);
    };
    const now = g.time;
    for (const u of g.units) {
      if (!u.alive || u.garrisonedIn || u.def.isAnimal) continue;
      const selected = ui.selection.has(u);
      if (!selected && !(u.hp < u.maxHp && now - u.lastHitT < 5)) continue;
      const x = u.px + (u.x - u.px) * alpha, y = u.py + (u.y - u.py) * alpha;
      if (u.owner !== this.viewer && !this.visibleTile(Math.floor(x), Math.floor(y))) continue;
      const [ix, iy] = this.iso(x, y);
      const top = u._top !== undefined ? u._top : iy - 30;
      bar(ix, top - 3, u.radius > 0.3 ? 22 : 16, u.hp / u.maxHp, u.owner === this.viewer ? '#5ae05a' : this.teamOf(u.owner).light);
    }
    for (const e of ui.selection) {
      if (e.kind === 'building' && e.alive) {
        const [ix, iy] = this.iso(e.x, e.y);
        const top = e._top !== undefined ? e._top : iy - 60;
        bar(ix, top - 4, 22 + e.size * 12, e.hp / e.maxHp, e.owner === this.viewer ? '#5ae05a' : '#e85a4a');
        if (e.owner === this.viewer && e.rally) {
          const [rx, ry] = this.iso(e.rally.x, e.rally.y);
          ctx.setLineDash([3, 4]); ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(ix, iy); ctx.lineTo(rx, ry); ctx.stroke(); ctx.setLineDash([]);
          ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx, ry - 20); ctx.stroke();
          const fl = this.sprites.flag(this.teamOf(this.viewer), Math.floor(this.time * 8) % 6);
          this.blit(fl, rx, ry - 20);
        }
      }
    }
    // command markers
    for (const m of this.fx.markers) {
      const k = (this.time - m.t0) / 0.8;
      const [ix, iy] = this.iso(m.x, m.y);
      const r = 10 * (1 - k * 0.6);
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = m.kind === 'attack' ? '#ff4a3a' : m.kind === 'gather' || m.kind === 'build' ? '#ffd84a' : '#7aff6a';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(ix, iy, r, r * 0.5, 0, 0, 6.283); ctx.stroke();
      if (m.kind === 'move') { ctx.beginPath(); ctx.moveTo(ix, iy - 3 - (1 - k) * 8); ctx.lineTo(ix, iy - 1); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    // placement ghost
    const pl = ui.placing;
    if (pl && pl.tiles) {
      const def = BUILDINGS[pl.type];
      const team = this.teamOf(this.viewer);
      for (const t of pl.tiles) {
        const [ix, iy] = this.iso(t.x, t.y);
        this.tileFill(t.x, t.y, def.size, t.ok ? 'rgba(90,255,90,0.22)' : 'rgba(255,60,50,0.35)');
        const s = def.isFarm ? farmSprite(0, 0) : buildingSprite(pl.type, this.player.age, team, 0, def.isWall ? 15 : 0);
        this.blit(s, ix, iy, t.ok ? 0.62 : 0.4);
      }
    }
    // floating texts
    for (const f of this.fx.floaters) {
      const k = (this.time - f.t0) / 1.4;
      const [ix, iy] = this.iso(f.x, f.y);
      ctx.globalAlpha = 1 - k;
      ctx.font = 'bold 11px Georgia, serif'; ctx.textAlign = 'center';
      ctx.fillStyle = '#000'; ctx.fillText(f.text, ix + 1, iy - 30 - k * 18 + 1);
      ctx.fillStyle = f.color; ctx.fillText(f.text, ix, iy - 30 - k * 18);
      ctx.globalAlpha = 1;
    }
    // drag box (screen space)
    if (ui.dragBox) {
      const b = ui.dragBox;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      const x = Math.min(b.x0, b.x1), y = Math.min(b.y0, b.y1), w = Math.abs(b.x1 - b.x0), h = Math.abs(b.y1 - b.y0);
      ctx.fillRect(x, y, w, h); ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    }
  }

  tileFill(tx, ty, size, color) {
    const ctx = this.ctx;
    const [x0, y0] = this.iso(tx, ty), [x1, y1] = this.iso(tx + size, ty), [x2, y2] = this.iso(tx + size, ty + size), [x3, y3] = this.iso(tx, ty + size);
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.closePath(); ctx.fill();
  }

  // Entity under a screen point (CSS px).
  pick(sx, sy) {
    const [ix, iy] = this.screenToIso(sx, sy);
    let best = null, bp = -1;
    for (let i = this.picks.length - 1; i >= 0; i--) {
      const b = this.picks[i];
      if (ix >= b.x0 && ix <= b.x1 && iy >= b.y0 && iy <= b.y1) {
        if (b.pri > bp) { bp = b.pri; best = b.e; if (bp === 3) break; }
      }
    }
    if (best && best.kind === 'building' && !best.alive && best.id !== undefined && !best.def) return null;
    return best;
  }

  // Units whose sprite boxes intersect a screen rectangle.
  unitsInRect(x0, y0, x1, y1) {
    const [ax, ay] = this.screenToIso(Math.min(x0, x1), Math.min(y0, y1));
    const [bx, by] = this.screenToIso(Math.max(x0, x1), Math.max(y0, y1));
    const out = [];
    for (const b of this.picks) {
      if (b.pri !== 3) continue;
      const u = b.e;
      const [cx, cy] = this.iso(u.x, u.y);
      if (cx >= ax && cx <= bx && cy - 10 >= ay - 12 && cy - 10 <= by) out.push(u);
    }
    return out;
  }
}
