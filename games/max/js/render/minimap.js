// Diamond minimap with fog, resources, players and the camera frame.
import { makeCanvas } from './draw3d.js';

export class Minimap {
  constructor(canvas, renderer) {
    this.canvas = canvas;
    this.r = renderer;
    this.g = renderer.game;
    const n = this.g.n;
    this.base = makeCanvas(n, n);
    this.baseCtx = this.base.getContext('2d');
    this.baseImg = this.baseCtx.createImageData(n, n);
    this.fog = makeCanvas(n, n);
    this.fogCtx = this.fog.getContext('2d');
    this.fogImg = this.fogCtx.createImageData(n, n);
    this.lastBase = -99;
    this.pings = [];
    this.resize();
  }
  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.W = this.canvas.clientWidth || 240;
    this.H = this.canvas.clientHeight || 120;
    this.canvas.width = Math.round(this.W * dpr);
    this.canvas.height = Math.round(this.H * dpr);
    this.ctx = this.canvas.getContext('2d');
  }
  // tile → minimap px
  toMini(x, y) {
    const n = this.g.n;
    return [((x - y) / n) * (this.W / 2) + this.W / 2, ((x + y) / n) * (this.H / 2)];
  }
  fromMini(mx, my) {
    const n = this.g.n;
    const a = ((mx - this.W / 2) / (this.W / 2)) * n, b = (my / (this.H / 2)) * n;
    return { x: (a + b) / 2, y: (b - a) / 2 };
  }
  ping(x, y, color = '#ff3a2a') { this.pings.push({ x, y, t0: performance.now(), color }); }

  updateBase() {
    const g = this.g, n = g.n, d = this.baseImg.data, src = this.r.miniColors, occ = g.map.occ;
    for (let i = 0; i < src.length; i += 4) { d[i] = src[i] * 1.22; d[i + 1] = src[i + 1] * 1.22; d[i + 2] = src[i + 2] * 1.22; d[i + 3] = 255; }
    for (let i = 0; i < n * n; i++) {
      const id = occ[i];
      if (!id) continue;
      const e = g.entities.get(id);
      if (!e || e.kind !== 'resource') continue;
      let c;
      if (e.type === 'tree') c = [34, 64, 26];
      else if (e.type === 'gold') c = [236, 200, 40];
      else if (e.type === 'stone') c = [176, 176, 170];
      else if (e.type === 'berries') c = [170, 60, 110];
      else if (e.type === 'fish') c = [120, 170, 220];
      if (c) { d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; }
    }
    this.baseCtx.putImageData(this.baseImg, 0, 0);
  }

  draw() {
    const g = this.g, n = g.n, ctx = this.ctx, p = this.r.player;
    const now = performance.now();
    if (now - this.lastBase > 2000) { this.updateBase(); this.lastBase = now; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // diamond base via affine transform: tile (x,y) → ((x-y)*W/2n + W/2, (x+y)*H/2n)
    const sx = this.W / 2 / n, sy = this.H / 2 / n;
    ctx.save();
    ctx.transform(sx, sy, -sx, sy, this.W / 2, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.base, 0, 0);
    // fog
    const fd = this.fogImg.data;
    const all = g.opts.reveal === 'all' || this.r.fullView;
    for (let i = 0; i < n * n; i++) fd[i * 4 + 3] = all ? 0 : p.visible[i] ? 0 : p.explored[i] ? 85 : 255;
    this.fogCtx.putImageData(this.fogImg, 0, 0);
    ctx.drawImage(this.fog, 0, 0);
    ctx.restore();
    // buildings
    const visibleOrOwn = (e) => this.r.fullView || e.owner === this.r.viewer || g.isAlly(e.owner, this.r.viewer) || g.isVisibleTo(this.r.viewer, e);
    for (const b of g.buildings) {
      if (!b.alive || b.def.isFarm && b.owner !== this.r.viewer) continue;
      if (!visibleOrOwn(b)) continue;
      const [x, y] = this.toMini(b.x, b.y);
      const s = Math.max(2.5, b.size * 1.5);
      ctx.fillStyle = b.def.isFarm ? '#c8b060' : g.players[b.owner].color.css;
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 0.6; ctx.strokeRect(x - s / 2, y - s / 2, s, s);
    }
    if (!this.r.fullView) for (const m of p.memory.values()) {
      const live = g.entities.get(m.id);
      if (live && live.alive && g.buildingVisibleTo(p, live)) continue;
      const [x, y] = this.toMini(m.tx + m.size / 2, m.ty + m.size / 2);
      const s = Math.max(2.5, m.size * 1.5);
      ctx.fillStyle = g.players[m.owner].color.css;
      ctx.globalAlpha = 0.7;
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
      ctx.globalAlpha = 1;
    }
    // units
    for (const u of g.units) {
      if (!u.alive || u.garrisonedIn) continue;
      if (u.def.isAnimal) {
        if (u.owner < 0 && !(p.visible[Math.floor(u.y) * n + Math.floor(u.x)] || all)) continue;
        if (u.owner >= 0 && u.owner !== this.r.viewer && !all && !g.isVisibleTo(this.r.viewer, u)) continue;
        const [x, y] = this.toMini(u.x, u.y);
        ctx.fillStyle = u.owner >= 0 ? g.players[u.owner].color.light : '#e8e0c8';
        ctx.fillRect(x - 0.8, y - 0.8, 1.6, 1.6);
        continue;
      }
      if (!visibleOrOwn(u)) continue;
      const [x, y] = this.toMini(u.x, u.y);
      ctx.fillStyle = g.players[u.owner].color.css;
      ctx.fillRect(x - 1.2, y - 1.2, 2.4, 2.4);
    }
    // camera frame
    const r = this.r;
    const k = this.W / (64 * n);
    const vx0 = (r.cam.x - r.W / 2 / r.cam.zoom) * k + this.W / 2, vy0 = (r.cam.y - r.H / 2 / r.cam.zoom) * k;
    const vw = (r.W / r.cam.zoom) * k, vh = (r.H / r.cam.zoom) * k;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1;
    ctx.strokeRect(vx0 + 0.5, vy0 + 0.5, vw, vh);
    // attack pings
    this.pings = this.pings.filter((pg) => now - pg.t0 < 3000);
    for (const pg of this.pings) {
      const [x, y] = this.toMini(pg.x, pg.y);
      const t = ((now - pg.t0) % 1000) / 1000;
      ctx.strokeStyle = pg.color; ctx.globalAlpha = 1 - t; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, 3 + t * 12, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}
