// Canvas renderer: camera, terrain, depth-sorted sprites, effects, fog of war, overlays and minimap.
import { BUILDINGS, UNITS } from './config.js';
import { getUnitSprite, FRAMES } from './artUnits.js';
import {
  getBuildingSprite, getConstructionSprite, getWallSprite, getFarmSprite, getRubbleSprite,
  getTreeSprite, getMineSprite, getBerrySprite, getDecorSprite,
} from './art.js';
import { clamp, TAU, hash2, rgba, shade } from './util.js';

const CAV = new Set(['knight', 'scout', 'cavarcher']);

export class Renderer {
  constructor(canvas, game, terrainCanvas, P) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    this.terrain = terrainCanvas;
    this.P = P;
    const N = game.map.N;
    this.fog = document.createElement('canvas');
    this.fog.width = N; this.fog.height = N;
    this.fogCtx = this.fog.getContext('2d');
    this.fogImg = this.fogCtx.createImageData(N, N);
    this.fogT = 0;
    this.zoom = 1;
    this.camX = 0; this.camY = N * 16;
    this.W = 800; this.H = 600; this.dpr = 1;
    this.viewTop = 44; this.viewBottom = 196;
    this.particles = [];
    this.decals = [];
    this.markers = [];
    this.pings = [];
    this.t = 0;
    this.hover = null;
    this.placement = null;
    this.dragRect = null;
    this.flashes = [];
    this.drawList = [];
    this.emitT = 0;
    this.buildMinimapBase();
    this.bindEvents();
    this.resize();
  }

  // ------------------------------------------------------------------ camera
  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.W = window.innerWidth; this.H = window.innerHeight;
    this.canvas.width = Math.floor(this.W * dpr); this.canvas.height = Math.floor(this.H * dpr);
    this.canvas.style.width = this.W + 'px'; this.canvas.style.height = this.H + 'px';
  }
  get centerY() { return this.viewTop + (this.H - this.viewTop - this.viewBottom) / 2; }
  iso(x, y) { return [(x - y) * 32, (x + y) * 16]; }
  worldToScreen(x, y, z = 0) {
    return [((x - y) * 32 - this.camX) * this.zoom + this.W / 2, ((x + y) * 16 - z - this.camY) * this.zoom + this.centerY];
  }
  screenToWorld(sx, sy) {
    const ix = (sx - this.W / 2) / this.zoom + this.camX, iy = (sy - this.centerY) / this.zoom + this.camY;
    return [(ix / 32 + iy / 16) / 2, (iy / 16 - ix / 32) / 2];
  }
  centerOn(x, y) { [this.camX, this.camY] = this.iso(x, y); this.clampCam(); }
  clampCam() {
    const N = this.game.map.N;
    this.camX = clamp(this.camX, -N * 32 + 100, N * 32 - 100);
    this.camY = clamp(this.camY, 60, N * 32 - 60);
  }
  pan(dx, dy) { this.camX += dx / this.zoom; this.camY += dy / this.zoom; this.clampCam(); }
  zoomAt(f, sx, sy) {
    const ix = (sx - this.W / 2) / this.zoom + this.camX, iy = (sy - this.centerY) / this.zoom + this.camY;
    this.zoom = clamp(this.zoom * f, 0.5, 1.8);
    this.camX = ix - (sx - this.W / 2) / this.zoom;
    this.camY = iy - (sy - this.centerY) / this.zoom;
    this.clampCam();
  }

  // ------------------------------------------------------------------ events -> effects
  bindEvents() {
    const g = this.game;
    g.on('unitDied', ({ unit }) => {
      if (unit.animal) return;
      const def = unit.def;
      const sp = this.unitSprite(unit, 'idle', 0);
      this.decals.push({ kind: 'corpse', sp, x: unit.x, y: unit.y, facing: unit.facing, t: 0, cav: CAV.has(def.sprite) || def.tc === 'siege', owner: unit.owner });
      for (let i = 0; i < 5; i++) this.spawn('dust', unit.x, unit.y, 4, { vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.5) * 0.6, vz: 6, life: 0.8, size: 4 });
      if (def.tc === 'siege') for (let i = 0; i < 10; i++) this.spawn('debris', unit.x, unit.y, 12, { vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, vz: 30 + Math.random() * 30, life: 1.2 });
    });
    g.on('buildingDestroyed', ({ building: b }) => {
      if (b.type !== 'farm') this.decals.push({ kind: 'rubble', size: b.size, tx: b.tx, ty: b.ty, x: b.x, y: b.y, t: 0, v: b.id % 3 });
      const n = b.type === 'farm' ? 4 : 10 + b.size * 8;
      for (let i = 0; i < n; i++) {
        const x = b.tx + Math.random() * b.size, y = b.ty + Math.random() * b.size;
        this.spawn('smoke', x, y, Math.random() * 30, { vz: 10 + Math.random() * 16, life: 2 + Math.random() * 2, size: 10 + b.size * 3, dark: true });
        if (b.type !== 'farm') this.spawn('debris', x, y, 20 + Math.random() * 30, { vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, vz: 20 + Math.random() * 40, life: 1.5 });
      }
    });
    g.on('meleeHit', ({ target }) => {
      const x = target.x + (Math.random() - 0.5) * 0.3, y = target.y + (Math.random() - 0.5) * 0.3;
      const z = target.kind === 'building' ? 15 + Math.random() * 20 : 12;
      const metal = target.kind === 'unit' && (target.armorM > 0 || target.def.tc === 'siege');
      for (let i = 0; i < 4; i++) this.spawn(metal ? 'spark' : target.kind === 'building' ? 'chip' : 'blood', x, y, z, { vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, vz: 15 + Math.random() * 20, life: 0.4 });
    });
    g.on('arrowMiss', ({ x, y, kind, dx, dy }) => {
      if (kind === 'stone' || kind === 'boulder') return;
      this.decals.push({ kind: 'arrow', x, y, t: 0, ang: Math.atan2((dx + dy) * 16, (dx - dy) * 32), jav: kind === 'javelin' });
      this.spawn('dust', x, y, 1, { life: 0.5, size: 3 });
    });
    g.on('impact', ({ x, y, kind }) => {
      for (let i = 0; i < 14; i++) this.spawn('dust', x, y, 3, { vx: (Math.random() - 0.5) * 2.5, vy: (Math.random() - 0.5) * 2.5, vz: 8 + Math.random() * 10, life: 1 + Math.random(), size: 9 });
      for (let i = 0; i < 8; i++) this.spawn('debris', x, y, 4, { vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, vz: 30 + Math.random() * 30, life: 1 });
      this.decals.push({ kind: 'crater', x, y, t: 0 });
    });
    g.on('work', ({ unit, task }) => {
      if (!this.onScreen(unit.x, unit.y, 60)) return;
      const fx = unit.x + unit.dirX * 0.3, fy = unit.y + unit.dirY * 0.3;
      if (task === 'wood') for (let i = 0; i < 3; i++) this.spawn('chip', fx, fy, 10, { vx: (Math.random() - 0.5) * 1.5, vy: (Math.random() - 0.5) * 1.5, vz: 20 + Math.random() * 15, life: 0.7 });
      else if (task === 'gold' || task === 'stone') for (let i = 0; i < 3; i++) this.spawn(task === 'gold' ? 'goldspark' : 'spark', fx, fy, 6, { vx: (Math.random() - 0.5) * 1.5, vy: (Math.random() - 0.5) * 1.5, vz: 16 + Math.random() * 16, life: 0.45 });
      else if (task === 'farm') this.spawn('dust', unit.x + 0.2, unit.y, 1, { life: 0.8, size: 4, vz: 3 });
      else if (task === 'build') this.spawn('dust', fx, fy, 4, { life: 0.6, size: 4, vz: 4 });
    });
    g.on('built', ({ building: b }) => {
      for (let i = 0; i < 6 + b.size * 3; i++) this.spawn('dust', b.tx + Math.random() * b.size, b.ty + Math.random() * b.size, 2, { vz: 6, life: 1.2, size: 8 });
    });
    g.on('converted', ({ unit }) => {
      for (let i = 0; i < 16; i++) this.spawn('holy', unit.x, unit.y, 10 + Math.random() * 10, { vx: (Math.random() - 0.5) * 1.2, vy: (Math.random() - 0.5) * 1.2, vz: 10 + Math.random() * 10, life: 1.2 });
    });
    g.on('heal', ({ target }) => this.spawn('heal', target.x, target.y, 18, { vz: 12, life: 0.9, vx: (Math.random() - 0.5) * 0.4 }));
    g.on('trained', ({ unit }) => this.spawn('dust', unit.x, unit.y, 2, { life: 0.8, size: 6, vz: 4 }));
    g.on('underAttack', ({ x, y }) => this.pings.push({ x, y, t: 0, color: '#ff4030' }));
  }

  spawn(kind, x, y, z, o = {}) {
    if (this.particles.length > 1400) return;
    this.particles.push({
      kind, x, y, z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, life: o.life || 1, max: o.life || 1,
      size: o.size || 3, dark: o.dark, rot: Math.random() * TAU, seed: Math.random(),
    });
  }

  addMarker(x, y, color = '#70e060') { this.markers.push({ x, y, t: 0, color }); }
  flashEntity(e, color = '#ff5040') { this.flashes.push({ e, t: 0, color }); }

  onScreen(x, y, m = 80) {
    const [sx, sy] = this.worldToScreen(x, y);
    return sx > -m && sy > -m && sx < this.W + m && sy < this.H + m;
  }

  // ------------------------------------------------------------------ helpers
  unitSprite(u, anim, frame) {
    const def = u.def;
    const pc = this.game.players[u.owner].color;
    const extra = { gear: def.gear || 0, variant: u.id % 4 };
    if (u.isVillager) {
      extra.task = u.task;
      extra.female = u.female;
      if (u.carry > 0.5) extra.carry = u.carryType === 'food' ? (u.task === 'hunt' || u.task === 'sheep' ? 'meat' : 'food') : u.carryType;
    }
    if (u.animal) extra.owned = u.owner !== 0;
    return getUnitSprite(def.sprite, pc, anim, frame, extra);
  }
  unitFrame(u) {
    const anim = u.anim;
    const nf = FRAMES[anim] || 1;
    let frame = 0;
    if (anim === 'walk') {
      const cyc = CAV.has(u.def.sprite) ? 0.5 : u.def.tc === 'siege' ? 1.2 : 0.72;
      frame = Math.floor((u.animT / cyc) * nf) % nf;
    } else if (anim === 'attack') {
      if (u.def.tc === 'monk') frame = Math.floor(u.animT * 6) % nf;
      else {
        const dur = u.isVillager ? 0.6 : Math.min(0.7, u.def.rof * 0.5);
        frame = clamp(Math.floor((u.animT / dur) * nf), 0, nf - 1);
      }
    } else if (anim === 'work') {
      frame = Math.floor((u.animT / (u.task === 'build' ? 0.9 : 1.15)) * nf) % nf;
    }
    return [anim, frame];
  }
  buildingSprite(b) {
    const pc = this.game.players[b.owner].color;
    const age = this.game.players[b.owner].age;
    if (b.def.wall) return getWallSprite(b.type, pc, this.wallMask(b), b.complete);
    if (!b.complete) return getConstructionSprite(b.type, pc, age, Math.min(3, Math.floor(b.progress * 4)));
    return getBuildingSprite(b.type, pc, age, b.type === 'house' ? b.variant % 4 : 0);
  }
  wallMask(b) {
    const map = this.game.map;
    const same = (x, y) => { const o = map.objAt(x, y); return o && o.kind === 'building' && o.def.wall && o.owner === b.owner; };
    return (same(b.tx, b.ty - 1) ? 1 : 0) | (same(b.tx + 1, b.ty) ? 2 : 0) | (same(b.tx, b.ty + 1) ? 4 : 0) | (same(b.tx - 1, b.ty) ? 8 : 0);
  }
  resourceSprite(r) {
    switch (r.type) {
      case 'tree': return getTreeSprite(r.pine, r.variant, r.felled);
      case 'gold': case 'stone': {
        const f = r.amount / r.maxAmount;
        return getMineSprite(r.type, r.variant, f > 0.66 ? 2 : f > 0.33 ? 1 : 0);
      }
      case 'berry': return getBerrySprite(r.variant, Math.ceil((r.amount / r.maxAmount) * 3));
    }
    return null;
  }
  visibleEnt(e) {
    const g = this.game;
    if (g.spectate || g.settings.reveal === 'all') return true;
    if (e.kind === 'unit') return e.owner === g.humanId || g.tileVisible(e.x, e.y);
    if (e.kind === 'building') return e.owner === g.humanId || !!e.seenBy[g.humanId];
    return g.tileExplored(e.x, e.y);
  }

  // ------------------------------------------------------------------ frame
  render(dt) {
    const g = this.game, ctx = this.ctx, dpr = this.dpr;
    this.t += dt;
    const k = this.zoom;
    const ox = this.W / 2 - this.camX * k, oy = this.centerY - this.camY * k;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#07080a';
    ctx.fillRect(0, 0, this.W, this.H);

    // terrain (painted in tile space, projected with an affine transform)
    const P = this.P;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.setTransform(dpr * k * 32 / P, dpr * k * 16 / P, -dpr * k * 32 / P, dpr * k * 16 / P, dpr * ox, dpr * oy);
    ctx.drawImage(this.terrain, 0, 0);
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * ox, dpr * oy);

    // visible iso rect
    const vx0 = this.camX - this.W / 2 / k - 140, vx1 = this.camX + this.W / 2 / k + 140;
    const vy0 = this.camY - (this.centerY) / k - 60, vy1 = this.camY + (this.H - this.centerY) / k + 220;
    const inView = (ix, iy) => ix > vx0 && ix < vx1 && iy > vy0 && iy < vy1;
    this.vis = { vx0, vx1, vy0, vy1 };

    this.drawWater(ctx, inView);
    this.drawDecor(ctx, inView);

    // collect entities
    const items = [];
    const ground = [];
    for (const r of g.resources) {
      if (r.dead) continue;
      const ix = (r.x - r.y) * 32, iy = (r.x + r.y) * 16;
      if (!inView(ix, iy)) continue;
      if (!this.visibleEnt(r)) continue;
      if (r.type === 'carcass') { ground.push({ e: r, ix, iy }); continue; }
      items.push({ e: r, ix, iy, px: r.x, py: r.y, depth: r.x + r.y });
    }
    for (const b of g.buildings) {
      if (b.dead) continue;
      const ix = (b.x - b.y) * 32, iy = (b.x + b.y) * 16;
      if (ix < vx0 - b.size * 40 || ix > vx1 + b.size * 40 || iy < vy0 - 200 || iy > vy1 + b.size * 20) continue;
      if (!this.visibleEnt(b)) continue;
      if (b.def.walkable) { ground.push({ e: b, ix, iy }); continue; }
      items.push({ e: b, ix, iy, rect: true, x0: b.tx, y0: b.ty, x1: b.tx + b.size, y1: b.ty + b.size, depth: b.x + b.y });
    }
    for (const u of g.units) {
      if (u.dead || u.garrisonedIn) continue;
      const ix = (u.x - u.y) * 32, iy = (u.x + u.y) * 16;
      if (!inView(ix, iy)) continue;
      if (!this.visibleEnt(u)) continue;
      items.push({ e: u, ix, iy, px: u.x, py: u.y, depth: u.x + u.y + 0.01 });
    }
    items.sort(cmpItems);

    // ground layer
    for (const it of ground) this.drawGroundItem(ctx, it);
    this.drawDecals(ctx, dt, inView);
    this.drawSelectionUnder(ctx);
    // shadows
    this.drawShadows(ctx, items);
    // sprites
    this.drawList.length = 0;
    for (const it of items) this.drawItem(ctx, it);
    this.drawProjectiles(ctx);
    this.updateParticles(dt);
    this.drawParticles(ctx);
    this.emitAmbient(dt, items);

    // fog of war
    this.fogT -= dt;
    if (this.fogT <= 0) { this.fogT = 0.1; this.updateFog(); }
    if (!(g.spectate || g.settings.reveal === 'all')) {
      ctx.imageSmoothingEnabled = true;
      ctx.setTransform(dpr * k * 32, dpr * k * 16, -dpr * k * 32, dpr * k * 16, dpr * ox, dpr * oy);
      ctx.drawImage(this.fog, 0, 0);
      ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * ox, dpr * oy);
    }

    // overlays
    this.drawOverlays(ctx, items, dt);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.dragRect) {
      const r = this.dragRect;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
      ctx.strokeRect(r.x0 + 0.5, r.y0 + 0.5, r.x1 - r.x0, r.y1 - r.y0);
    }
    // vignette
    const vg = ctx.createRadialGradient(this.W / 2, this.H / 2, Math.min(this.W, this.H) * 0.45, this.W / 2, this.H / 2, Math.max(this.W, this.H) * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, this.W, this.H);
  }

  drawWater(ctx, inView) {
    const g = this.game, map = g.map, N = map.N;
    const t = this.t;
    ctx.lineCap = 'round';
    for (const k of map.waterTiles) {
      const x = k % N, y = (k / N) | 0;
      const ix = (x - y) * 32, iy = (x + y) * 16 + 16;
      if (!inView(ix, iy)) continue;
      if (!g.tileExplored(x, y)) continue;
      const h = hash2(x, y);
      const ph = t * 0.9 + h * TAU;
      const a = 0.09 + 0.09 * Math.sin(ph);
      if (a <= 0.02) continue;
      const dx = Math.sin(t * 0.35 + h * 9) * 6;
      ctx.strokeStyle = `rgba(220,240,255,${a.toFixed(3)})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(ix - 10 + dx + h * 8, iy - 3 + h * 6);
      ctx.lineTo(ix + 2 + dx + h * 8, iy - 5 + h * 6);
      ctx.stroke();
      if (h > 0.5) {
        ctx.beginPath();
        ctx.moveTo(ix - 2 - dx, iy + 4 - h * 4);
        ctx.lineTo(ix + 8 - dx, iy + 2 - h * 4);
        ctx.stroke();
      }
    }
  }

  drawDecor(ctx, inView) {
    const g = this.game, map = this.game.map;
    if (this.zoom < 0.55) return;
    for (const d of map.decor) {
      const ix = (d.x - d.y) * 32, iy = (d.x + d.y) * 16;
      if (!inView(ix, iy)) continue;
      if (!g.tileExplored(d.x, d.y)) continue;
      const o = map.objAt(Math.floor(d.x), Math.floor(d.y));
      if (o && o.kind === 'building') continue;
      const s = getDecorSprite(d.kind, d.v);
      ctx.drawImage(s.c, ix - s.ox, iy - s.oy, s.w, s.h);
    }
  }

  drawGroundItem(ctx, it) {
    const e = it.e;
    if (e.kind === 'building') { // farm
      const f = e.complete ? e.food / Math.max(1, this.game.players[e.owner].mods.farmFood) : 0;
      const s = getFarmSprite(!e.complete ? 0 : f > 0.55 ? 2 : f > 0.2 ? 1 : 0, e.variant % 6, e.complete);
      const [ax, ay] = this.iso(e.tx, e.ty);
      if (!e.complete) ctx.globalAlpha = 0.5 + e.progress * 0.5;
      ctx.drawImage(s.c, ax - s.ox, ay - s.oy, s.w, s.h);
      ctx.globalAlpha = 1;
      this.drawList.push({ e, ground: true });
      if (e.hp < e.maxHp * 0.5 && Math.random() < 0.02) this.spawn('smoke', e.x + (Math.random() - 0.5) * 2, e.y + (Math.random() - 0.5) * 2, 2, { vz: 10, life: 2, size: 8 });
      return;
    }
    // carcass: the animal lying on its side
    const u = UNITS[e.animal] || UNITS.sheep;
    const pc = this.game.players[0].color;
    const s = getUnitSprite(u.sprite, pc, 'idle', 0, { variant: e.id % 4 });
    ctx.save();
    ctx.translate(it.ix, it.iy);
    const f = clamp(e.amount / e.maxAmount, 0.3, 1);
    ctx.fillStyle = 'rgba(110,20,15,0.45)';
    ctx.beginPath(); ctx.ellipse(2, 0, 10 * f + 3, 4 * f + 1.5, 0, 0, TAU); ctx.fill();
    ctx.scale(e.facing, 1);
    ctx.rotate(-1.35);
    ctx.globalAlpha = 0.95;
    ctx.drawImage(s.c, -s.ox, -s.oy + 4, s.w, s.h * f);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  drawDecals(ctx, dt, inView) {
    let w = 0;
    for (const d of this.decals) {
      d.t += dt;
      const life = d.kind === 'rubble' ? 70 : d.kind === 'corpse' ? 24 : d.kind === 'crater' ? 25 : 10;
      if (d.t > life) continue;
      this.decals[w++] = d;
      const ix = (d.x - d.y) * 32, iy = (d.x + d.y) * 16;
      if (!inView(ix, iy)) continue;
      if (!this.game.tileExplored(d.x, d.y)) continue;
      const fade = clamp((life - d.t) / 6, 0, 1);
      if (d.kind === 'rubble') {
        const s = getRubbleSprite(d.size, d.v);
        const [ax, ay] = this.iso(d.tx, d.ty);
        ctx.globalAlpha = fade;
        ctx.drawImage(s.c, ax - s.ox, ay - s.oy, s.w, s.h);
      } else if (d.kind === 'corpse') {
        if (!(this.game.spectate || this.game.settings.reveal === 'all') && d.owner !== this.game.humanId && !this.game.tileVisible(d.x, d.y)) continue;
        const fall = clamp(d.t / 0.45, 0, 1);
        const ang = (d.cav ? 1.25 : 1.45) * fall * fall;
        ctx.save();
        ctx.translate(ix, iy);
        ctx.scale(d.facing, 1);
        ctx.rotate(-ang);
        ctx.globalAlpha = fade * (d.t > 1.5 ? 0.72 : 1);
        ctx.drawImage(d.sp.c, -d.sp.ox, -d.sp.oy, d.sp.w, d.sp.h);
        ctx.restore();
      } else if (d.kind === 'arrow') {
        ctx.globalAlpha = fade;
        ctx.strokeStyle = d.jav ? '#8a6a40' : '#6a5030'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(ix, iy); ctx.lineTo(ix - Math.cos(d.ang) * 6, iy - 5); ctx.stroke();
        ctx.fillStyle = '#e8e0c8'; ctx.fillRect(ix - Math.cos(d.ang) * 6 - 1, iy - 6, 2, 2);
      } else if (d.kind === 'crater') {
        ctx.globalAlpha = fade * 0.5;
        ctx.fillStyle = '#3a2e22';
        ctx.beginPath(); ctx.ellipse(ix, iy, 12, 6, 0, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    this.decals.length = w;
  }

  drawSelectionUnder(ctx) {
    const g = this.game;
    for (const e of g.selection) {
      if (e.dead) continue;
      if (e.kind === 'unit') {
        if (e.garrisonedIn) continue;
        const [ix, iy] = this.iso(e.x, e.y);
        const r = e.radius * 1.25;
        ctx.strokeStyle = e.owner === g.humanId ? 'rgba(255,255,255,0.95)' : e.owner === 0 ? '#f0e070' : '#ff5a4a';
        ctx.lineWidth = 1.4 / this.zoom + 0.4;
        ctx.beginPath(); ctx.ellipse(ix, iy, r * 45, r * 22.6, 0, 0, TAU); ctx.stroke();
      } else if (e.kind === 'building') {
        const pts = [this.iso(e.tx, e.ty), this.iso(e.tx + e.size, e.ty), this.iso(e.tx + e.size, e.ty + e.size), this.iso(e.tx, e.ty + e.size)];
        ctx.strokeStyle = e.owner === g.humanId ? 'rgba(255,255,255,0.9)' : '#ff5a4a';
        ctx.lineWidth = 1.5 / this.zoom + 0.3;
        ctx.setLineDash([6, 4]);
        ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.stroke();
        ctx.setLineDash([]);
      } else if (e.kind === 'resource') {
        const [ix, iy] = this.iso(e.x, e.y);
        ctx.strokeStyle = '#f0e070'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.ellipse(ix, iy, 20, 10, 0, 0, TAU); ctx.stroke();
      }
    }
    const h = this.hover;
    if (h && !h.dead && !h.selected && h.kind === 'unit' && !h.garrisonedIn) {
      const [ix, iy] = this.iso(h.x, h.y);
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(ix, iy, h.radius * 55, h.radius * 27, 0, 0, TAU); ctx.stroke();
    }
  }

  drawShadows(ctx, items) {
    ctx.fillStyle = 'rgba(10,15,5,0.24)';
    for (const it of items) {
      const e = it.e;
      if (e.kind === 'unit') {
        const r = e.radius;
        ctx.beginPath(); ctx.ellipse(it.ix + 2, it.iy + 1, r * 40, r * 18, 0, 0, TAU); ctx.fill();
      } else if (e.kind === 'resource') {
        if (e.type === 'tree' && !e.felled) {
          ctx.beginPath(); ctx.ellipse(it.ix + 14, it.iy + 2, e.pine ? 12 : 18, e.pine ? 5 : 7, 0.25, 0, TAU); ctx.fill();
        } else if (e.type !== 'tree') {
          ctx.beginPath(); ctx.ellipse(it.ix + 4, it.iy + 2, 16, 7, 0, 0, TAU); ctx.fill();
        }
      } else if (e.kind === 'building' && !e.def.wall) {
        const h = (e.complete ? e.def.height || 50 : (e.def.height || 50) * e.progress) / 34;
        const L = Math.min(h, e.size * 0.85);
        const x0 = e.tx + 0.1, y0 = e.ty + 0.1, x1 = e.tx + e.size - 0.1, y1 = e.ty + e.size - 0.1;
        const pts = [[x0, y1], [x0, y0], [x1, y0], [x1 + L, y0 - L * 0.15], [x1 + L, y1 - L * 0.15], [x1, y1]];
        ctx.beginPath();
        pts.forEach(([x, y], i) => { const [ix, iy] = this.iso(x, y); i ? ctx.lineTo(ix, iy) : ctx.moveTo(ix, iy); });
        ctx.closePath(); ctx.fill();
      }
    }
  }

  drawItem(ctx, it) {
    const e = it.e;
    const g = this.game;
    if (e.kind === 'resource') {
      const s = this.resourceSprite(e);
      if (!s) return;
      const jx = (hash2(e.tx, e.ty) - 0.5) * 8, jy = (hash2(e.ty, e.tx) - 0.5) * 4;
      ctx.drawImage(s.c, it.ix - s.ox + jx, it.iy - s.oy + jy, s.w, s.h);
      this.drawList.push({ e, x: it.ix + jx, y: it.iy + jy, w: e.type === 'tree' ? 16 : 18, top: e.type === 'tree' ? (e.felled ? 12 : 60) : 22 });
      return;
    }
    if (e.kind === 'building') {
      const s = this.buildingSprite(e);
      const [ax, ay] = this.iso(e.tx, e.ty);
      ctx.drawImage(s.c, ax - s.ox, ay - s.oy, s.w, s.h);
      const fl = this.flashes.find((f) => f.e === e);
      if (fl) {
        ctx.globalAlpha = 0.4 * (1 - fl.t / 0.8);
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(s.c, ax - s.ox, ay - s.oy, s.w, s.h);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }
      if (e.complete) this.drawBuildingLive(ctx, e, s, ax, ay);
      this.drawList.push({ e, building: true });
      return;
    }
    // unit
    const [anim, frame] = this.unitFrame(e);
    const s = this.unitSprite(e, anim, frame);
    ctx.save();
    ctx.translate(it.ix, it.iy);
    if (e.facing < 0) ctx.scale(-1, 1);
    if (e.convertGlow && g.time - e.convertGlow < 0.3) {
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(this.t * 20);
      ctx.fillStyle = 'rgba(255,250,200,0.5)';
      ctx.beginPath(); ctx.ellipse(0, -12, 12, 18, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(s.c, -s.ox, -s.oy, s.w, s.h);
    const fl = this.flashes.find((f) => f.e === e);
    if (fl) { ctx.globalAlpha = 0.5 * (1 - fl.t / 0.8); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(s.c, -s.ox, -s.oy, s.w, s.h); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
    ctx.restore();
    const big = CAV.has(e.def.sprite) || e.def.tc === 'siege';
    this.drawList.push({ e, x: it.ix, y: it.iy, w: big ? 18 : 10, top: e.def.sprite === 'trebuchet' ? 70 : big ? 34 : 26 });
    // dust when cavalry gallops
    if (big && anim === 'walk' && Math.random() < 0.08) this.spawn('dust', e.x - e.dirX * 0.3, e.y - e.dirY * 0.3, 1, { life: 0.7, size: 4, vz: 3 });
  }

  drawBuildingLive(ctx, b, s, ax, ay) {
    const t = this.t;
    const pc = this.game.players[b.owner].color;
    const baseX = ax - s.ox, baseY = ay - s.oy;
    // waving flags
    for (const f of s.meta.flags || []) {
      const fx = baseX + f.x, fy = baseY + f.y;
      const w = 10 + f.h * 0.15, h = 6;
      ctx.fillStyle = pc.main;
      ctx.strokeStyle = shade(pc.main, -0.5); ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      const n = 6;
      for (let i = 1; i <= n; i++) { const u = i / n; ctx.lineTo(fx + u * w, fy + Math.sin(t * 5 + u * 3 + b.id) * 1.6 * u); }
      for (let i = n; i >= 0; i--) { const u = i / n; ctx.lineTo(fx + u * w, fy + h + Math.sin(t * 5 + u * 3 + b.id) * 1.6 * u - (i === n ? 1 : 0)); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(fx, fy + 0.5, w * 0.35, 1.5);
    }
    // windmill sails
    if (s.meta.sails) {
      const { x, y, r } = s.meta.sails;
      const hx = baseX + x, hy = baseY + y;
      const rot = t * 1.1 + b.id;
      const ux = 32 / 35.78, uy = 16 / 35.78;
      ctx.lineCap = 'butt';
      for (let i = 0; i < 4; i++) {
        const a = rot + (i * Math.PI) / 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        const P = (d, o) => {
          // point at distance d along the arm and offset o across it, in the face plane (u axis, z axis)
          const U = ca * d - sa * o, Z = sa * d + ca * o;
          return [hx + ux * U, hy + uy * U - Z];
        };
        const e0 = P(0, 0), e1 = P(r, 0);
        ctx.strokeStyle = '#5a3d24'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(e0[0], e0[1]); ctx.lineTo(e1[0], e1[1]); ctx.stroke();
        const q = [P(r * 0.25, 0.5), P(r, 0.5), P(r, 6), P(r * 0.25, 6)];
        ctx.fillStyle = 'rgba(236,226,200,0.92)';
        ctx.beginPath(); q.forEach(([X, Y], j) => (j ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y))); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(90,60,30,0.8)'; ctx.lineWidth = 0.5; ctx.stroke();
        for (let d = 0.4; d < 1; d += 0.2) { const a0 = P(r * d, 0.5), a1 = P(r * d, 6); ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1]); ctx.stroke(); }
      }
      ctx.fillStyle = '#3a2716'; ctx.beginPath(); ctx.arc(hx, hy, 2, 0, TAU); ctx.fill();
    }
    // forge glow
    for (const gl of s.meta.glow || []) {
      const a = 0.25 + 0.15 * Math.sin(t * 7 + b.id) + Math.random() * 0.05;
      const gx = baseX + gl.x, gy = baseY + gl.y;
      const grd = ctx.createRadialGradient(gx, gy, 1, gx, gy, 16);
      grd.addColorStop(0, `rgba(255,160,60,${a})`); grd.addColorStop(1, 'rgba(255,120,30,0)');
      ctx.fillStyle = grd; ctx.fillRect(gx - 16, gy - 16, 32, 32);
    }
    // wonder countdown glow
    if (b.type === 'wonder' && b.wonderT != null) {
      const a = 0.12 + 0.08 * Math.sin(t * 2);
      ctx.fillStyle = `rgba(255,220,120,${a})`;
      ctx.beginPath(); ctx.ellipse(ax, ay + b.size * 16, b.size * 40, b.size * 20, 0, 0, TAU); ctx.fill();
    }
  }

  drawProjectiles(ctx) {
    const g = this.game;
    for (const p of g.projectiles) {
      if (p.t < 0) continue;
      const ix = (p.x - p.y) * 32, iy = (p.x + p.y) * 16 - p.z;
      if (!(g.spectate || g.settings.reveal === 'all') && !g.tileVisible(p.x, p.y)) continue;
      const gx = (p.x - p.y) * 32, gy = (p.x + p.y) * 16;
      if (p.kind === 'stone' || p.kind === 'boulder') {
        const r = p.kind === 'boulder' ? 4 : 3;
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(gx, gy, r * 1.2, r * 0.6, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#7e7a74'; ctx.beginPath(); ctx.arc(ix, iy, r, 0, TAU); ctx.fill();
        ctx.fillStyle = '#b0aca4'; ctx.beginPath(); ctx.arc(ix - 1, iy - 1, r * 0.4, 0, TAU); ctx.fill();
        continue;
      }
      const pix = (p.px - p.py) * 32, piy = (p.px + p.py) * 16 - p.pz;
      let dx = ix - pix, dy = iy - piy;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d; dy /= d;
      const len = p.kind === 'javelin' ? 9 : 7;
      ctx.strokeStyle = p.kind === 'javelin' ? '#8a6a40' : '#4a3a28';
      ctx.lineWidth = p.kind === 'javelin' ? 1.4 : 1;
      ctx.beginPath(); ctx.moveTo(ix - dx * len, iy - dy * len); ctx.lineTo(ix, iy); ctx.stroke();
      ctx.fillStyle = '#d8d8d0'; ctx.fillRect(ix - dx * len - 1, iy - dy * len - 1, 2, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(gx - 2, gy, 4, 1);
    }
  }

  updateParticles(dt) {
    let w = 0;
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      this.particles[w++] = p;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      switch (p.kind) {
        case 'chip': case 'debris': case 'spark': case 'goldspark': case 'blood':
          p.vz -= 120 * dt;
          if (p.z < 0) { p.z = 0; p.vz *= -0.3; p.vx *= 0.5; p.vy *= 0.5; }
          break;
        case 'smoke':
          p.vx += 0.05 * dt; p.vz *= 0.995;
          break;
        case 'fire':
          p.vz += 10 * dt;
          break;
        case 'dust':
          p.vz *= 0.96;
          break;
      }
    }
    this.particles.length = w;
  }

  drawParticles(ctx) {
    const g = this.game;
    const fogged = !(g.spectate || g.settings.reveal === 'all');
    for (const p of this.particles) {
      const ix = (p.x - p.y) * 32, iy = (p.x + p.y) * 16 - p.z;
      if (ix < this.vis.vx0 || ix > this.vis.vx1 || iy < this.vis.vy0 - 100 || iy > this.vis.vy1) continue;
      if (fogged && !g.tileExplored(p.x, p.y)) continue;
      const f = p.life / p.max;
      switch (p.kind) {
        case 'smoke': {
          const r = p.size * (1.6 - f);
          const c = p.dark ? '40,36,32' : '150,145,138';
          ctx.fillStyle = `rgba(${c},${(0.32 * f).toFixed(3)})`;
          ctx.beginPath(); ctx.arc(ix, iy, r, 0, TAU); ctx.fill();
          break;
        }
        case 'fire': {
          // flickering tongue of flame: orange outer, yellow core
          ctx.globalCompositeOperation = 'lighter';
          const r = p.size * (0.35 + f * 0.65);
          const sway = Math.sin(this.t * 14 + p.seed * 20) * r * 0.35;
          const flame = (rr, col) => {
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.moveTo(ix + sway, iy - rr * 2.4);
            ctx.quadraticCurveTo(ix + rr * 1.1, iy - rr * 0.4, ix, iy + rr * 0.7);
            ctx.quadraticCurveTo(ix - rr * 1.1, iy - rr * 0.4, ix + sway, iy - rr * 2.4);
            ctx.fill();
          };
          flame(r, `rgba(255,${(90 + 60 * f) | 0},20,${(0.55 * f).toFixed(3)})`);
          flame(r * 0.55, `rgba(255,230,120,${(0.7 * f).toFixed(3)})`);
          ctx.globalCompositeOperation = 'source-over';
          break;
        }
        case 'ember':
          ctx.fillStyle = `rgba(255,${(140 + 100 * f) | 0},60,${f.toFixed(3)})`; ctx.fillRect(ix - 0.8, iy - 0.8, 1.6, 1.6);
          break;
        case 'dust': {
          const r = p.size * (1.4 - f * 0.6);
          ctx.fillStyle = `rgba(150,125,90,${(0.35 * f).toFixed(3)})`;
          ctx.beginPath(); ctx.arc(ix, iy, r, 0, TAU); ctx.fill();
          break;
        }
        case 'chip':
          ctx.fillStyle = '#c9a06a'; ctx.fillRect(ix - 1, iy - 1, 2.2, 1.4);
          break;
        case 'debris':
          ctx.fillStyle = '#5a4a3a'; ctx.fillRect(ix - 1.5, iy - 1.5, 3, 3);
          break;
        case 'spark':
          ctx.fillStyle = `rgba(255,240,200,${f})`; ctx.fillRect(ix - 0.8, iy - 0.8, 1.6, 1.6);
          break;
        case 'goldspark':
          ctx.fillStyle = `rgba(255,215,80,${f})`; ctx.fillRect(ix - 1, iy - 1, 2, 2);
          break;
        case 'blood':
          ctx.fillStyle = `rgba(150,20,20,${f})`; ctx.fillRect(ix - 0.8, iy - 0.8, 1.6, 1.6);
          break;
        case 'holy':
          ctx.fillStyle = `rgba(255,250,190,${f})`; ctx.beginPath(); ctx.arc(ix, iy, 1.6, 0, TAU); ctx.fill();
          break;
        case 'heal':
          ctx.fillStyle = `rgba(120,255,120,${f})`; ctx.fillRect(ix - 2.5, iy - 0.8, 5, 1.6); ctx.fillRect(ix - 0.8, iy - 2.5, 1.6, 5);
          break;
      }
    }
  }

  emitAmbient(dt, items) {
    this.emitT += dt;
    if (this.emitT < 0.08) return;
    const step = this.emitT;
    this.emitT = 0;
    for (const it of items) {
      const b = it.e;
      if (b.kind !== 'building' || !b.complete || b.def.wall) continue;
      const s = this.buildingSprite(b);
      const hpf = b.hp / b.maxHp;
      // chimney smoke
      for (const sm of s.meta.smoke || []) {
        const rate = b.type === 'blacksmith' ? 3 : b.type === 'house' ? 0.35 : 0.5;
        if (Math.random() < rate * step) {
          const [wx, wy] = this.screenLocalToWorld(it, s, sm);
          this.spawn('smoke', wx, wy, this.localZ(it, s, sm), { vz: 14, vx: 0.15, life: 3, size: 4 });
        }
      }
      // fire on damaged buildings
      if (hpf < 0.66 && s.meta.fire && s.meta.fire.length) {
        const intensity = hpf < 0.25 ? 3 : hpf < 0.45 ? 2 : 1;
        const spots = Math.min(s.meta.fire.length, intensity + 1);
        for (let k = 0; k < spots; k++) {
          const fp = s.meta.fire[k];
          const [wx, wy] = this.screenLocalToWorld(it, s, fp);
          const z = this.localZ(it, s, fp);
          if (hpf < 0.45) {
            for (let i = 0; i < intensity; i++) {
              if (Math.random() < 0.45) this.spawn('fire', wx + (Math.random() - 0.5) * 0.35, wy + (Math.random() - 0.5) * 0.35, z - 2, { vz: 10 + Math.random() * 10, life: 0.45 + Math.random() * 0.35, size: 3 + Math.random() * 2.5 + intensity });
            }
            if (Math.random() < 0.25) this.spawn('ember', wx, wy, z + 4, { vz: 25 + Math.random() * 15, vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.5) * 0.6, life: 1 });
          }
          if (Math.random() < 0.35 * intensity) this.spawn('smoke', wx, wy, z + 8, { vz: 16, vx: 0.2, life: 2.8, size: 6 + intensity * 2, dark: true });
        }
      }
    }
  }
  // Convert a sprite-local point to a world ground position below it + height.
  screenLocalToWorld(it, s, pt) {
    const b = it.e;
    const [ax, ay] = this.iso(b.tx, b.ty);
    const sx = ax - s.ox + pt.x;
    // ground point: center of the building footprint, height from screen offset
    return [b.x + (sx - (b.x - b.y) * 32) / 64, b.y - (sx - (b.x - b.y) * 32) / 64];
  }
  localZ(it, s, pt) {
    const b = it.e;
    const [ax, ay] = this.iso(b.tx, b.ty);
    const sy = ay - s.oy + pt.y;
    const [wx, wy] = this.screenLocalToWorld(it, s, pt);
    const gy = (wx + wy) * 16;
    return Math.max(0, gy - sy);
  }

  drawOverlays(ctx, items, dt) {
    const g = this.game, k = this.zoom;
    const inv = 1 / k;
    // health bars
    for (const it of items) {
      const e = it.e;
      if (e.kind === 'resource') continue;
      const recently = g.time - e.lastHitT < 3;
      if (!e.selected && !recently && !(e === this.hover)) continue;
      if (e.kind === 'unit' && e.animal && !e.selected) continue;
      if (e.kind === 'building' && e.def.walkable && !e.selected) continue;
      let bx, by, bw;
      if (e.kind === 'unit') {
        bx = it.ix; by = it.iy - (e.def.sprite === 'trebuchet' ? 80 : CAV.has(e.def.sprite) || e.def.tc === 'siege' ? 42 : 32); bw = e.def.tc === 'siege' || CAV.has(e.def.sprite) ? 26 : 20;
      } else {
        const [ax, ay] = this.iso(e.tx, e.ty);
        const h = e.complete ? (e.def.height || 50) : Math.max(12, (e.def.height || 50) * e.progress);
        bx = ax; by = ay + e.size * 16 - h - 14; bw = 16 + e.size * 14;
      }
      const f = clamp(e.hp / e.maxHp, 0, 1);
      const w = bw * Math.max(0.8, inv * 0.9), h = 3.2 * Math.max(0.8, inv * 0.9);
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(bx - w / 2 - 1, by - 1, w + 2, h + 2);
      ctx.fillStyle = f > 0.6 ? '#4ce04c' : f > 0.3 ? '#f0d040' : '#f04030';
      if (e.owner !== g.humanId && e.owner !== 0) ctx.fillStyle = f > 0.3 ? '#e04838' : '#b02018';
      ctx.fillRect(bx - w / 2, by, w * f, h);
      if (e.kind === 'building' && !e.complete) {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(bx - w / 2 - 1, by + h + 1, w + 2, h);
        ctx.fillStyle = '#e8c860';
        ctx.fillRect(bx - w / 2, by + h + 1.5, w * e.progress, h - 1);
      }
    }
    // rally points
    for (const e of g.selection) {
      if (e.kind !== 'building' || !e.rally || e.owner !== g.humanId) continue;
      const [rx, ry] = this.iso(e.rally.x, e.rally.y);
      const [bx, by] = this.iso(e.x, e.y);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = inv;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(rx, ry); ctx.stroke();
      ctx.setLineDash([]);
      const pc = g.players[e.owner].color;
      ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx, ry - 20); ctx.stroke();
      ctx.fillStyle = pc.main;
      ctx.beginPath(); ctx.moveTo(rx, ry - 20);
      for (let i = 0; i <= 5; i++) ctx.lineTo(rx + i * 2.4, ry - 20 + Math.sin(this.t * 6 + i) * 1.2);
      for (let i = 5; i >= 0; i--) ctx.lineTo(rx + i * 2.4, ry - 14 + Math.sin(this.t * 6 + i) * 1.2);
      ctx.fill();
    }
    // move markers
    let w = 0;
    for (const m of this.markers) {
      m.t += dt;
      if (m.t > 0.7) continue;
      this.markers[w++] = m;
      const [ix, iy] = this.iso(m.x, m.y);
      const f = 1 - m.t / 0.7;
      ctx.strokeStyle = rgba(m.color, f); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(ix, iy, 14 * f + 3, 7 * f + 1.5, 0, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(ix, iy, 6 * f + 1, 3 * f + 0.5, 0, 0, TAU); ctx.stroke();
    }
    this.markers.length = w;
    w = 0;
    for (const f of this.flashes) { f.t += dt; if (f.t < 0.8) this.flashes[w++] = f; }
    this.flashes.length = w;
    // placement ghost
    if (this.placement) this.drawPlacement(ctx);
  }

  drawPlacement(ctx) {
    const pl = this.placement, g = this.game;
    const def = BUILDINGS[pl.type];
    const p = g.human;
    const tiles = pl.tiles || [{ x: pl.tx, y: pl.ty }];
    for (const t of tiles) {
      const ok = g.canPlaceBuilding(p, pl.type, t.x, t.y);
      for (let j = 0; j < def.size; j++) for (let i = 0; i < def.size; i++) {
        const x = t.x + i, y = t.y + j;
        const free = g.map.canPlace(x, y, 1, def.walkable) && (g.settings.reveal === 'all' || g.tileExplored(x, y));
        const pts = [this.iso(x, y), this.iso(x + 1, y), this.iso(x + 1, y + 1), this.iso(x, y + 1)];
        ctx.fillStyle = free ? 'rgba(80,255,80,0.22)' : 'rgba(255,50,40,0.35)';
        ctx.beginPath(); pts.forEach(([a, b], k) => (k ? ctx.lineTo(a, b) : ctx.moveTo(a, b))); ctx.closePath(); ctx.fill();
      }
      let s;
      if (def.wall) s = getWallSprite(pl.type, p.color, 0, true);
      else if (def.walkable) s = getFarmSprite(2, 0, true);
      else s = getBuildingSprite(pl.type, p.color, p.age, 0);
      const [ax, ay] = this.iso(t.x, t.y);
      ctx.globalAlpha = ok ? 0.72 : 0.4;
      ctx.drawImage(s.c, ax - s.ox, ay - s.oy, s.w, s.h);
      ctx.globalAlpha = 1;
    }
  }

  // ------------------------------------------------------------------ fog
  updateFog() {
    const g = this.game, N = g.map.N;
    const d = this.fogImg.data, vis = g.visible, exp = g.explored;
    for (let k = 0; k < N * N; k++) {
      const o = k * 4;
      d[o] = 6; d[o + 1] = 9; d[o + 2] = 16;
      d[o + 3] = vis[k] ? 0 : exp[k] ? 112 : 255;
    }
    this.fogCtx.putImageData(this.fogImg, 0, 0);
  }

  // ------------------------------------------------------------------ picking
  pick(sx, sy) {
    const [wx, wy] = this.screenToWorld(sx, sy);
    const k = this.zoom;
    let best = null, bd = 1e9;
    // units first (front-most wins)
    for (let i = this.drawList.length - 1; i >= 0; i--) {
      const d = this.drawList[i];
      if (d.building || d.ground || d.e.kind !== 'unit') continue;
      const [ux, uy] = this.worldToScreen(d.e.x, d.e.y);
      if (sx < ux - d.w * k || sx > ux + d.w * k || sy < uy - d.top * k || sy > uy + 5 * k) continue;
      const dist = Math.abs(sx - ux) + Math.abs(sy - (uy - d.top * k * 0.5)) * 0.5;
      if (dist < bd) { bd = dist; best = d.e; }
    }
    if (best) return best;
    // buildings: the projected prism above the footprint
    for (let i = this.drawList.length - 1; i >= 0; i--) {
      const d = this.drawList[i];
      if (!d.building) continue;
      const b = d.e;
      const H = (b.complete ? (b.def.height || 50) : (b.def.height || 50) * Math.max(0.2, b.progress)) * 0.85;
      for (let z = 0; z <= H; z += 6) {
        const [x, y] = this.screenToWorld(sx, sy + z * k);
        if (x >= b.tx && x <= b.tx + b.size && y >= b.ty && y <= b.ty + b.size) return b;
      }
    }
    // resources
    for (let i = this.drawList.length - 1; i >= 0; i--) {
      const d = this.drawList[i];
      if (d.e.kind !== 'resource') continue;
      const [rx, ry] = this.worldToScreen(d.e.x, d.e.y);
      const jx = (hash2(d.e.tx, d.e.ty) - 0.5) * 8 * k;
      if (sx < rx + jx - d.w * k || sx > rx + jx + d.w * k || sy < ry - d.top * k || sy > ry + 8 * k) continue;
      return d.e;
    }
    // ground items (farms, carcasses)
    const map = this.game.map;
    const o = map.objAt(Math.floor(wx), Math.floor(wy));
    if (o && o.kind === 'building' && o.def.walkable && this.visibleEnt(o)) return o;
    for (const r of this.game.resources) {
      if (r.dead || r.type !== 'carcass') continue;
      if (Math.hypot(r.x - wx, r.y - wy) < 0.6 && this.visibleEnt(r)) return r;
    }
    return null;
  }

  unitsInScreenRect(x0, y0, x1, y1) {
    const out = [];
    for (const d of this.drawList) {
      if (d.e.kind !== 'unit') continue;
      const [ux, uy] = this.worldToScreen(d.e.x, d.e.y);
      const cy = uy - d.top * this.zoom * 0.4;
      if (ux >= x0 && ux <= x1 && cy >= y0 && cy <= y1) out.push(d.e);
    }
    return out;
  }

  // ------------------------------------------------------------------ minimap
  buildMinimapBase() {
    const g = this.game, map = g.map, N = map.N;
    this.mmTile = document.createElement('canvas');
    this.mmTile.width = N; this.mmTile.height = N;
    this.mmTileCtx = this.mmTile.getContext('2d');
    this.mmImg = this.mmTileCtx.createImageData(N, N);
    this.refreshMinimapTiles();
  }
  refreshMinimapTiles() {
    const g = this.game, map = g.map, N = map.N;
    const d = this.mmImg.data;
    const base = g.minimapColors;
    for (let k = 0; k < N * N; k++) {
      const o = k * 4;
      let r = base[o], gg = base[o + 1], b = base[o + 2];
      const ob = map.obj[k];
      if (ob && ob.kind === 'resource') {
        if (ob.type === 'tree') { r = 38; gg = 78; b = 30; }
        else if (ob.type === 'gold') { r = 236; gg = 196; b = 40; }
        else if (ob.type === 'stone') { r = 170; gg = 170; b = 176; }
        else if (ob.type === 'berry') { r = 200; gg = 60; b = 90; }
      }
      d[o] = r; d[o + 1] = gg; d[o + 2] = b; d[o + 3] = 255;
    }
    this.mmTileCtx.putImageData(this.mmImg, 0, 0);
  }

  drawMinimap(canvas, pings) {
    const g = this.game, N = g.map.N;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const s = W / (N * 64);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
    // tile layer with iso transform
    ctx.setTransform(32 * s, 16 * s, -32 * s, 16 * s, N * 32 * s, 0);
    ctx.drawImage(this.mmTile, 0, 0);
    if (!(g.spectate || g.settings.reveal === 'all')) { ctx.imageSmoothingEnabled = true; ctx.drawImage(this.fog, 0, 0); }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const toMM = (x, y) => [((x - y) * 32 + N * 32) * s, (x + y) * 16 * s];
    // buildings
    for (const b of g.buildings) {
      if (b.dead || !this.visibleEnt(b)) continue;
      const [mx, my] = toMM(b.x, b.y);
      const sz = Math.max(2.5, b.size * 64 * s * 0.5);
      ctx.fillStyle = g.players[b.owner].color.main;
      ctx.fillRect(mx - sz / 2, my - sz / 4, sz, sz / 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 0.6; ctx.strokeRect(mx - sz / 2, my - sz / 4, sz, sz / 2);
    }
    for (const u of g.units) {
      if (u.dead || u.garrisonedIn || !this.visibleEnt(u)) continue;
      const [mx, my] = toMM(u.x, u.y);
      ctx.fillStyle = u.owner === 0 ? '#e8e0c8' : g.players[u.owner].color.main;
      ctx.fillRect(mx - 1.2, my - 1.2, 2.4, 2.4);
    }
    // pings
    for (const p of pings || this.pings) {
      const [mx, my] = toMM(p.x, p.y);
      const f = (p.t % 1);
      ctx.strokeStyle = rgba(p.color, 1 - f); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(mx, my, 4 + f * 14, 0, TAU); ctx.stroke();
    }
    // camera frustum
    const corners = [[0, this.viewTop], [this.W, this.viewTop], [this.W, this.H - this.viewBottom], [0, this.H - this.viewBottom]].map(([x, y]) => this.screenToWorld(x, y));
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1;
    ctx.beginPath();
    corners.forEach(([x, y], i) => { const [mx, my] = toMM(x, y); i ? ctx.lineTo(mx, my) : ctx.moveTo(mx, my); });
    ctx.closePath(); ctx.stroke();
  }
  minimapToWorld(mx, my, W) {
    const N = this.game.map.N;
    const s = W / (N * 64);
    const ix = mx / s - N * 32, iy = my / s;
    return [(ix / 32 + iy / 16) / 2, (iy / 16 - ix / 32) / 2];
  }
  updatePings(dt) {
    let w = 0;
    for (const p of this.pings) { p.t += dt; if (p.t < 4) this.pings[w++] = p; }
    this.pings.length = w;
  }
}

function cmpItems(a, b) {
  if (a.rect && !b.rect) return -pointVsRect(b, a);
  if (!a.rect && b.rect) return pointVsRect(a, b);
  return a.depth - b.depth;
}
function pointVsRect(p, r) {
  if (p.px >= r.x1 || p.py >= r.y1) return 1;
  if (p.px <= r.x0 || p.py <= r.y0) return -1;
  return p.depth - r.depth;
}
