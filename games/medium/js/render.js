// Rendering: camera, terrain chunks, depth-sorted entities, particles, fog of war, minimap.
import { TW, TH, toScreen, toWorld, hash2, fbm, clamp, mulberry32, shade } from './util.js';
import { T } from './map.js';
import { UNITS, BUILDINGS } from './config.js';
import {
  blit, buildingSprite, farmSprite, drawMillBlades, drawConstruction, treeSprite, stumpSprite, fallenTreeSprite,
  mineSprite, berrySprite, rubbleSprite, drawUnit, drawAnimal, drawCorpse,
} from './sprites.js';

const CH = 16;
const TCOL = {
  [T.GRASS]: [98, 142, 58], [T.FOREST]: [66, 98, 42], [T.DIRT]: [146, 118, 76],
  [T.SAND]: [200, 180, 124], [T.WATER]: [52, 112, 164], [T.DEEP]: [32, 80, 134],
};

export class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    this.cam = { x: 0, y: 0, zoom: 1.15 };
    this.particles = [];
    this.chunks = new Map();
    this.time = 0;
    this.pings = [];
    this.hudBottom = 180;
    this.hudTop = 38;
    this.prepTerrain();
    this.fogCanvas = document.createElement('canvas');
    this.fogCanvas.width = game.N; this.fogCanvas.height = game.N;
    this.fogCtx = this.fogCanvas.getContext('2d');
    this.fogImg = this.fogCtx.createImageData(game.N, game.N);
    this.fogVer = -1;
    this.makeClouds();
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.W = window.innerWidth; this.H = window.innerHeight;
    this.canvas.width = Math.floor(this.W * dpr);
    this.canvas.height = Math.floor(this.H * dpr);
    this.canvas.style.width = this.W + 'px';
    this.canvas.style.height = this.H + 'px';
    const v = document.createElement('canvas');
    v.width = 256; v.height = 256;
    const vc = v.getContext('2d');
    const g = vc.createRadialGradient(128, 128, 60, 128, 128, 182);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(10,6,0,0.42)');
    vc.fillStyle = g; vc.fillRect(0, 0, 256, 256);
    this.vignette = v;
  }

  // ---------- camera ----------
  w2s(x, y) {
    const [sx, sy] = toScreen(x, y);
    return [(sx - this.cam.x) * this.cam.zoom, (sy - this.cam.y) * this.cam.zoom];
  }
  s2w(px, py) {
    return toWorld(px / this.cam.zoom + this.cam.x, py / this.cam.zoom + this.cam.y);
  }
  centerOn(x, y) {
    const [sx, sy] = toScreen(x, y);
    const viewH = this.H - this.hudBottom - this.hudTop;
    this.cam.x = sx - this.W / 2 / this.cam.zoom;
    this.cam.y = sy - (this.hudTop + viewH / 2) / this.cam.zoom;
    this.clampCam();
  }
  viewCenterWorld() {
    const viewH = this.H - this.hudBottom - this.hudTop;
    return this.s2w(this.W / 2, this.hudTop + viewH / 2);
  }
  clampCam() {
    const N = this.game.N;
    const z = this.cam.zoom;
    const minX = -N * TW / 2 - this.W / z * 0.25, maxX = N * TW / 2 - this.W / z * 0.75;
    const minY = -this.H / z * 0.35, maxY = N * TH - this.H / z * 0.55;
    this.cam.x = clamp(this.cam.x, minX, maxX);
    this.cam.y = clamp(this.cam.y, minY, maxY);
  }
  zoomAt(px, py, factor) {
    const [wx, wy] = [px / this.cam.zoom + this.cam.x, py / this.cam.zoom + this.cam.y];
    this.cam.zoom = clamp(this.cam.zoom * factor, 0.55, 2.0);
    this.cam.x = wx - px / this.cam.zoom;
    this.cam.y = wy - py / this.cam.zoom;
    this.clampCam();
  }

  // ---------- terrain ----------
  prepTerrain() {
    const g = this.game, N = g.N;
    this.tileCol = new Float32Array(N * N * 3);
    this.tileShade = new Float32Array(N * N);
    const s = g.seed % 1000;
    const hgt = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) hgt[y * N + x] = fbm(x / 7, y / 7, s + 40, 3);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const t = g.terrain[i];
      const base = TCOL[t];
      let [r, gg, b] = base;
      const n = fbm(x / 6, y / 6, s + 21, 3);
      const n2 = fbm(x / 2.5, y / 2.5, s + 77, 2);
      if (t === T.GRASS || t === T.FOREST) {
        const k = (n - 0.5) * 1.6;
        r += k * 22 + (n2 - 0.5) * 18; gg += k * 18 + (n2 - 0.5) * 10; b += k * 6;
        if (n > 0.62) { r += 16; gg += 8; b -= 4; }
      } else if (t === T.DIRT) {
        r += (n - 0.5) * 30; gg += (n - 0.5) * 24; b += (n - 0.5) * 16;
      } else if (t === T.SAND) {
        r += (n2 - 0.5) * 14; gg += (n2 - 0.5) * 12;
      }
      this.tileCol[i * 3] = r; this.tileCol[i * 3 + 1] = gg; this.tileCol[i * 3 + 2] = b;
      const gx = (x > 0 ? hgt[i - 1] : hgt[i]) - (x < N - 1 ? hgt[i + 1] : hgt[i]);
      const gy = (y > 0 ? hgt[i - N] : hgt[i]) - (y < N - 1 ? hgt[i + N] : hgt[i]);
      this.tileShade[i] = t >= T.WATER ? 0 : clamp((gx + gy) * 1.6, -0.14, 0.14);
    }
    // periodic detail texture
    const D = 128;
    this.detail = new Float32Array(D * D);
    const rnd = mulberry32(g.seed + 5);
    for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
      this.detail[y * D + x] = (fbm(x / 8, y / 8, s + 9, 3, 16) - 0.5) * 1.3 + (rnd() - 0.5) * 0.5;
    }
  }

  getChunk(cx, cy) {
    const key = cx * 1000 + cy;
    let c = this.chunks.get(key);
    if (!c) { c = this.buildChunk(cx, cy); this.chunks.set(key, c); }
    return c;
  }

  buildChunk(cx, cy) {
    const g = this.game, N = g.N;
    const x0 = cx * CH, y0 = cy * CH;
    const ox = (x0 - y0 - CH) * (TW / 2), oy = (x0 + y0) * (TH / 2);
    const W = CH * TW, H = CH * TH + 2;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(W, H);
    const data = img.data;
    const tc = this.tileCol, ts = this.tileShade, det = this.detail;
    const terr = g.terrain;
    for (let py = 0; py < H; py++) {
      const Y = oy + py + 0.5;
      for (let px = 0; px < W; px++) {
        const X = ox + px + 0.5;
        const wx = (X / 32 + Y / 16) / 2, wy = (Y / 16 - X / 32) / 2;
        if (wx < x0 || wx >= x0 + CH || wy < y0 || wy >= y0 + CH || wx < 0 || wy < 0 || wx >= N || wy >= N) continue;
        const u = wx - 0.5, v = wy - 0.5;
        let ix = Math.floor(u), iy = Math.floor(v);
        const fx = u - ix, fy = v - iy;
        const ix1 = Math.min(N - 1, ix + 1), iy1 = Math.min(N - 1, iy + 1);
        ix = Math.max(0, ix); iy = Math.max(0, iy);
        const i00 = iy * N + ix, i10 = iy * N + ix1, i01 = iy1 * N + ix, i11 = iy1 * N + ix1;
        const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
        let r = tc[i00 * 3] * w00 + tc[i10 * 3] * w10 + tc[i01 * 3] * w01 + tc[i11 * 3] * w11;
        let gg = tc[i00 * 3 + 1] * w00 + tc[i10 * 3 + 1] * w10 + tc[i01 * 3 + 1] * w01 + tc[i11 * 3 + 1] * w11;
        let b = tc[i00 * 3 + 2] * w00 + tc[i10 * 3 + 2] * w10 + tc[i01 * 3 + 2] * w01 + tc[i11 * 3 + 2] * w11;
        const sh = ts[i00] * w00 + ts[i10] * w10 + ts[i01] * w01 + ts[i11] * w11;
        const d = det[((Math.floor(wy * 16) & 127) << 7) | (Math.floor(wx * 16) & 127)];
        const tt = terr[Math.floor(wy) * N + Math.floor(wx)];
        let k;
        if (tt >= T.WATER) {
          const wave = Math.sin((wx + wy) * 5 + d * 2) * 0.05 + Math.sin((wx - wy) * 3.1 + d) * 0.03;
          k = 1 + d * 0.05 + wave;
        } else {
          k = 1 + d * (tt === T.SAND ? 0.06 : 0.11) + sh;
        }
        const o = (py * W + px) * 4;
        data[o] = r * k; data[o + 1] = gg * k; data[o + 2] = b * k; data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // decorations
    ctx.translate(-ox, -oy);
    for (let ty = y0; ty < y0 + CH && ty < N; ty++) for (let tx = x0; tx < x0 + CH && tx < N; tx++) {
      const t = terr[ty * N + tx];
      const h = hash2(tx, ty, 311);
      const [sx, sy] = toScreen(tx + 0.5, ty + 0.5);
      if (t === T.GRASS) {
        if (h < 0.35) {
          const n = 2 + Math.floor(h * 10) % 3;
          for (let k = 0; k < n; k++) {
            const px = sx + (hash2(tx, ty, k) - 0.5) * 36, py = sy + (hash2(ty, tx, k) - 0.5) * 14;
            ctx.strokeStyle = hash2(tx, k, 3) < 0.5 ? 'rgba(40,80,20,0.55)' : 'rgba(150,190,80,0.5)';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(px - 2, py); ctx.lineTo(px - 3, py - 4); ctx.moveTo(px, py); ctx.lineTo(px, py - 5); ctx.moveTo(px + 2, py); ctx.lineTo(px + 3, py - 4); ctx.stroke();
          }
        } else if (h < 0.4) {
          const cols = ['#f3f0e0', '#f0d860', '#c8a0e8', '#e86060'];
          ctx.fillStyle = cols[Math.floor(h * 1000) % 4];
          for (let k = 0; k < 4; k++) ctx.fillRect(sx + (hash2(tx, ty, k + 9) - 0.5) * 30, sy + (hash2(ty, tx, k + 9) - 0.5) * 12, 1.6, 1.6);
        } else if (h < 0.43) {
          ctx.fillStyle = 'rgba(120,110,100,0.8)';
          ctx.beginPath(); ctx.ellipse(sx + (h - 0.4) * 300, sy, 3, 1.8, 0, 0, Math.PI * 2); ctx.fill();
        }
      } else if (t === T.DIRT && h < 0.3) {
        ctx.fillStyle = 'rgba(90,70,45,0.5)';
        for (let k = 0; k < 3; k++) ctx.fillRect(sx + (hash2(tx, ty, k) - 0.5) * 34, sy + (hash2(ty, tx, k) - 0.5) * 12, 2, 1.5);
      } else if (t === T.FOREST && h < 0.5) {
        ctx.fillStyle = 'rgba(40,60,20,0.5)';
        for (let k = 0; k < 4; k++) ctx.fillRect(sx + (hash2(tx, ty, k) - 0.5) * 34, sy + (hash2(ty, tx, k) - 0.5) * 12, 2.5, 1.5);
      } else if (t === T.SAND && h < 0.15) {
        ctx.fillStyle = 'rgba(240,230,200,0.6)';
        ctx.fillRect(sx, sy, 2, 1);
      }
    }
    return { canvas, ox, oy, W, H };
  }

  makeClouds() {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = fbm(x / 32, y / 32, 1234, 4, 8);
      const a = clamp((n - 0.52) * 3.2, 0, 1);
      const o = (y * S + x) * 4;
      img.data[o] = 10; img.data[o + 1] = 20; img.data[o + 2] = 30; img.data[o + 3] = a * 255;
    }
    ctx.putImageData(img, 0, 0);
    this.clouds = c;
  }

  updateFogCanvas() {
    const g = this.game;
    if (this.fogVer === g.fogVersion) return;
    this.fogVer = g.fogVersion;
    const d = this.fogImg.data, N = g.N;
    for (let i = 0; i < N * N; i++) {
      const o = i * 4;
      d[o] = 8; d[o + 1] = 8; d[o + 2] = 12;
      d[o + 3] = g.vis[i] ? 0 : g.explored[i] ? 125 : 255;
    }
    this.fogCtx.putImageData(this.fogImg, 0, 0);
  }

  // ---------- particles ----------
  spawnFx(ev) {
    const P = this.particles;
    const r = Math.random;
    const add = (o) => { if (P.length < 900) P.push(o); };
    switch (ev.name) {
      case 'blood':
        for (let i = 0; i < 3; i++) add({ x: ev.x, y: ev.y, z: 0.35, vx: (r() - 0.5) * 0.8, vy: (r() - 0.5) * 0.8, vz: 0.8 + r(), life: 0, max: 0.5, kind: 'drop', col: '#9a1a14', size: 1.4 });
        break;
      case 'chips':
        for (let i = 0; i < 3; i++) add({ x: ev.x, y: ev.y, z: 0.4, vx: (r() - 0.5), vy: (r() - 0.5), vz: 1 + r(), life: 0, max: 0.6, kind: 'drop', col: '#c9a26a', size: 1.5 });
        break;
      case 'debris':
        for (let i = 0; i < 3; i++) add({ x: ev.x, y: ev.y, z: 0.6, vx: (r() - 0.5) * 1.5, vy: (r() - 0.5) * 1.5, vz: 1 + r() * 1.5, life: 0, max: 0.7, kind: 'drop', col: '#7a7060', size: 2 });
        add({ x: ev.x, y: ev.y, z: 0.5, vx: 0, vy: 0, vz: 0.3, life: 0, max: 1.0, kind: 'puff', col: '140,120,100', size: 6 });
        break;
      case 'dust': {
        const n = ev.big ? 14 : 5, w = ev.w || 1;
        for (let i = 0; i < n; i++) {
          const a = r() * Math.PI * 2, d = r() * w * 0.6;
          add({ x: ev.x + Math.cos(a) * d, y: ev.y + Math.sin(a) * d, z: 0.1, vx: Math.cos(a) * 0.6, vy: Math.sin(a) * 0.6, vz: 0.25, life: 0, max: 1.2 + r(), kind: 'puff', col: '170,150,110', size: 6 + r() * 6 * (ev.big ? 1.5 : 1) });
        }
        break;
      }
      case 'collapse': {
        const w = ev.w || 2;
        for (let i = 0; i < 26; i++) {
          const a = r() * Math.PI * 2, d = r() * w * 0.6;
          add({ x: ev.x + Math.cos(a) * d, y: ev.y + Math.sin(a) * d, z: 0.2 + r(), vx: Math.cos(a) * 0.5, vy: Math.sin(a) * 0.5, vz: 0.4 + r() * 0.5, life: 0, max: 2 + r() * 1.5, kind: 'puff', col: '90,80,70', size: 10 + r() * 12 });
        }
        for (let i = 0; i < 16; i++) add({ x: ev.x, y: ev.y, z: 1, vx: (r() - 0.5) * 3, vy: (r() - 0.5) * 3, vz: 2 + r() * 2, life: 0, max: 1, kind: 'drop', col: '#5a4a3a', size: 2.5 });
        break;
      }
      case 'fire':
        add({ x: ev.x, y: ev.y, z: ev.z, vx: (r() - 0.5) * 0.1, vy: (r() - 0.5) * 0.1, vz: 0.9 + r() * 0.5, life: 0, max: 0.7 + r() * 0.4, kind: 'fire', size: 3 + r() * 3 });
        break;
      case 'smoke':
        add({ x: ev.x, y: ev.y, z: ev.z, vx: 0.15 + r() * 0.1, vy: -0.05, vz: 0.6 + r() * 0.3, life: 0, max: 2.8 + r(), kind: 'puff', col: ev.dark ? '50,45,40' : '150,150,150', size: 3 + r() * 3, grow: 1 });
        break;
      case 'sparkle':
        for (let i = 0; i < 20; i++) add({ x: ev.x + (r() - 0.5) * 3, y: ev.y + (r() - 0.5) * 3, z: r() * 2, vx: 0, vy: 0, vz: 0.6 + r(), life: 0, max: 1.5 + r(), kind: 'spark', size: 2 });
        break;
    }
  }

  updateParticles(dt) {
    const out = [];
    for (const p of this.particles) {
      p.life += dt;
      if (p.life >= p.max) continue;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.kind === 'drop') { p.vz -= 5 * dt; if (p.z < 0) { p.z = 0; p.vx *= 0.5; p.vy *= 0.5; p.vz = 0; } }
      out.push(p);
    }
    this.particles = out;
  }

  // ---------- main render ----------
  render(dt, ui) {
    const g = this.game, ctx = this.ctx, z = this.cam.zoom;
    this.time += dt;
    this.updateParticles(dt);
    this.updateFogCanvas();
    const dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0b0d0f';
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.imageSmoothingEnabled = true;

    // visible tile range
    const corners = [this.s2w(0, 0), this.s2w(this.W, 0), this.s2w(0, this.H), this.s2w(this.W, this.H)];
    const minX = Math.floor(Math.min(...corners.map((c) => c[0]))) - 2, maxX = Math.ceil(Math.max(...corners.map((c) => c[0]))) + 2;
    const minY = Math.floor(Math.min(...corners.map((c) => c[1]))) - 2, maxY = Math.ceil(Math.max(...corners.map((c) => c[1]))) + 2;
    const NC = Math.ceil(g.N / CH);
    for (let cy = Math.max(0, Math.floor(minY / CH)); cy <= Math.min(NC - 1, Math.floor(maxY / CH)); cy++) {
      for (let cx = Math.max(0, Math.floor(minX / CH)); cx <= Math.min(NC - 1, Math.floor(maxX / CH)); cx++) {
        const ch = this.getChunk(cx, cy);
        const px = (ch.ox - this.cam.x) * z, py = (ch.oy - this.cam.y) * z;
        if (px > this.W || py > this.H || px + ch.W * z < 0 || py + ch.H * z < 0) continue;
        ctx.drawImage(ch.canvas, px, py, ch.W * z + 0.5, ch.H * z + 0.5);
      }
    }
    this.drawWater(ctx, minX, maxX, minY, maxY);

    const inView = (x, y, m = 120) => {
      const [sx, sy] = this.w2s(x, y);
      return sx > -m * z && sx < this.W + m * z && sy > -m * z && sy < this.H + m * 1.6 * z;
    };
    const human = g.human;

    // ground layer: decals, farms, selection rings
    for (const d of g.decals) {
      if (!inView(d.x, d.y) || !g.tileExplored(d.x, d.y)) continue;
      const [sx, sy] = this.w2s(d.x, d.y);
      if (d.kind === 'rubble') blit(ctx, rubbleSprite(d.w, d.seed), sx, sy, z, Math.min(1, (60 - d.t) / 10));
      else if (d.kind === 'stump') blit(ctx, stumpSprite(d.seed), sx, sy, z);
      else if (d.kind === 'arrow' && g.tileVisible(d.x, d.y)) {
        ctx.strokeStyle = 'rgba(60,40,20,0.8)'; ctx.lineWidth = 1 * z;
        const a = d.a;
        const [ex, ey] = [Math.cos(a) - Math.sin(a), (Math.cos(a) + Math.sin(a)) / 2];
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - ex * 5 * z, sy - ey * 5 * z - 2 * z); ctx.stroke();
      }
    }
    for (const b of g.buildings) {
      if (b.type !== 'farm' || !inView(b.x, b.y)) continue;
      if (b.owner !== human && !g.entExplored(b)) continue;
      const [sx, sy] = this.w2s(b.x, b.y);
      if (!b.built) drawConstruction(ctx, b, sx, sy, z, g.players[b.owner].color);
      else {
        const f = b.amount / b.max;
        blit(ctx, farmSprite(f > 0.7 ? 1 : f > 0.25 ? 2 : 3), sx, sy, z);
      }
      if (ui.selected.has(b)) this.drawFootprint(ctx, b, 'rgba(255,255,255,0.8)');
    }
    for (const c of g.corpses) {
      if (!inView(c.x, c.y) || (c.owner !== human && !g.tileVisible(c.x, c.y))) continue;
      const [sx, sy] = this.w2s(c.x, c.y);
      c.def = c.def || UNITS[c.type];
      drawCorpse(ctx, c, sx, sy, z, g.players[c.owner].color);
    }
    for (const e of ui.selected) {
      if (e.kind === 'unit' && !e.dead) {
        const [sx, sy] = this.w2s(e.x, e.y);
        const rr = (e.def.horse ? 12 : e.def.cls === 'siege' ? 14 : 8) * z;
        ctx.strokeStyle = e.owner === human ? 'rgba(255,255,255,0.9)' : 'rgba(255,90,80,0.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(sx, sy, rr, rr * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
      } else if (e.kind === 'building' && e.type !== 'farm' && !e.dead) {
        this.drawFootprint(ctx, e, e.owner === human ? 'rgba(255,255,255,0.8)' : 'rgba(255,90,80,0.8)');
      } else if (e.kind === 'resource' && !e.dead) {
        const [sx, sy] = this.w2s(e.x, e.y);
        ctx.strokeStyle = 'rgba(255,240,150,0.9)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(sx, sy, 14 * z, 7 * z, 0, 0, Math.PI * 2); ctx.stroke();
      }
    }
    if (ui.flash && ui.flash.t > 0) {
      const e = g.ents.get(ui.flash.id);
      if (e && !e.dead && Math.floor(ui.flash.t * 6) % 2 === 0) {
        if (e.kind === 'unit' || e.animal) {
          const [sx, sy] = this.w2s(e.x, e.y);
          ctx.strokeStyle = ui.flash.col; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(sx, sy, 10 * z, 5 * z, 0, 0, Math.PI * 2); ctx.stroke();
        } else this.drawFootprint(ctx, e, ui.flash.col);
      }
    }

    // sorted layer
    const list = [];
    for (const r of g.resources) {
      if (r.dead || !inView(r.x, r.y, 80)) continue;
      if (r.animal) { if (!g.tileVisible(r.x, r.y) && !(r.killed && g.tileExplored(r.x, r.y))) continue; }
      else if (!g.tileExplored(r.tx, r.ty)) continue;
      list.push({ d: r.x + r.y, e: r });
    }
    for (const b of g.buildings) {
      if (b.type === 'farm' || b.dead || !inView(b.x, b.y, 200)) continue;
      if (b.owner !== human && !g.entExplored(b)) continue;
      list.push({ d: b.x + b.y, e: b });
    }
    for (const u of g.units) {
      if (u.dead || !inView(u.x, u.y, 60)) continue;
      if (u.owner !== human && !g.tileVisible(u.x, u.y)) continue;
      list.push({ d: u.x + u.y, e: u });
    }
    list.sort((a, b) => a.d - b.d);
    const t = this.time;
    for (const it of list) {
      const e = it.e;
      const [sx, sy] = this.w2s(e.x, e.y);
      if (e.kind === 'unit') {
        drawUnit(ctx, e, sx, sy, z, g.players[e.owner].color, t);
      } else if (e.kind === 'building') {
        const col = g.players[e.owner].color;
        if (!e.built) drawConstruction(ctx, e, sx, sy, z, col);
        else {
          blit(ctx, buildingSprite(e.type, col), sx, sy, z);
          if (e.type === 'mill') drawMillBlades(ctx, sx, sy, z, t);
          this.buildingEffects(e, dt);
        }
      } else {
        this.drawResource(ctx, e, sx, sy, z, t);
      }
    }

    // projectiles
    for (const p of g.projectiles) {
      if (!inView(p.x, p.y) || !g.tileVisible(p.x, p.y)) continue;
      const [sx, sy] = this.w2s(p.x, p.y);
      const hz = p.z * 32 * z;
      if (p.kind === 'stone') {
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(sx, sy, 3 * z, 1.5 * z, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#6a625a'; ctx.beginPath(); ctx.arc(sx, sy - hz, 3.2 * z, 0, Math.PI * 2); ctx.fill();
      } else {
        const [px, py] = p.px !== undefined ? this.w2s(p.px, p.py) : [sx, sy];
        const phz = (p.pz ?? p.z) * 32 * z;
        let dx = sx - px, dy = (sy - hz) - (py - phz);
        const L = Math.hypot(dx, dy) || 1;
        dx /= L; dy /= L;
        const len = (p.kind === 'javelin' ? 9 : 7) * z;
        ctx.strokeStyle = p.kind === 'javelin' ? '#6b4a2a' : '#3a2a1a'; ctx.lineWidth = 1.2 * z;
        ctx.beginPath(); ctx.moveTo(sx, sy - hz); ctx.lineTo(sx - dx * len, sy - hz - dy * len); ctx.stroke();
        ctx.fillStyle = '#ddd'; ctx.fillRect(sx - dx * len - 1, sy - hz - dy * len - 1, 2 * z, 2 * z);
      }
    }
    // particles
    for (const p of this.particles) {
      if (!inView(p.x, p.y)) continue;
      if (!g.tileVisible(p.x, p.y) && p.kind !== 'puff') continue;
      const [sx, sy] = this.w2s(p.x, p.y);
      const k = p.life / p.max;
      const py = sy - p.z * 32 * z;
      if (p.kind === 'drop') { ctx.fillStyle = p.col; ctx.fillRect(sx - p.size * z / 2, py - p.size * z / 2, p.size * z, p.size * z); }
      else if (p.kind === 'puff') {
        ctx.fillStyle = `rgba(${p.col},${(1 - k) * 0.45})`;
        ctx.beginPath(); ctx.arc(sx, py, p.size * z * (0.6 + k * (p.grow ? 2 : 0.9)), 0, Math.PI * 2); ctx.fill();
      } else if (p.kind === 'fire') {
        ctx.fillStyle = `rgba(255,${Math.floor(200 - k * 160)},40,${(1 - k) * 0.9})`;
        ctx.beginPath(); ctx.arc(sx, py, p.size * z * (1 - k * 0.6), 0, Math.PI * 2); ctx.fill();
      } else if (p.kind === 'spark') {
        ctx.fillStyle = `rgba(255,235,140,${1 - k})`;
        ctx.fillRect(sx - 1, py - 1, p.size * z, p.size * z);
      }
    }

    // cloud shadows
    ctx.save();
    ctx.globalAlpha = 0.16;
    const pat = ctx.createPattern(this.clouds, 'repeat');
    const cs = 3 * z;
    const offx = (-this.cam.x * z - t * 6 * z) , offy = (-this.cam.y * z - t * 3 * z);
    ctx.translate(offx % (256 * cs), offy % (256 * cs));
    ctx.scale(cs, cs);
    ctx.fillStyle = pat;
    ctx.fillRect(-256, -256, this.W / cs + 512, this.H / cs + 512);
    ctx.restore();

    // fog of war
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.setTransform(dpr * z * TW / 2, dpr * z * TH / 2, -dpr * z * TW / 2, dpr * z * TH / 2, -this.cam.x * z * dpr, -this.cam.y * z * dpr);
    ctx.drawImage(this.fogCanvas, 0, 0);
    ctx.restore();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // overlays: HP bars, rally points
    for (const e of ui.selected) {
      if (e.dead) continue;
      if (e.kind === 'unit' || e.kind === 'building') this.drawHpBar(ctx, e);
      if (e.kind === 'building' && e.owner === human && e.rally) {
        const [sx, sy] = this.w2s(e.rally.x, e.rally.y);
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
        const [bx, by] = this.w2s(e.x, e.y);
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(sx, sy); ctx.stroke(); ctx.setLineDash([]);
        ctx.strokeStyle = '#3b2a1a'; ctx.lineWidth = 1.5 * z;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy - 18 * z); ctx.stroke();
        const wv = Math.sin(t * 5) * 1.5;
        ctx.fillStyle = g.players[human].color.main;
        ctx.beginPath(); ctx.moveTo(sx, sy - 18 * z); ctx.lineTo(sx + 10 * z, sy - (15 + wv) * z); ctx.lineTo(sx, sy - 11 * z); ctx.fill();
      }
    }
    for (const u of g.units) {
      if (u.dead || ui.selected.has(u) || g.time - u.lastHitT > 3) continue;
      if (u.owner !== human && !g.tileVisible(u.x, u.y)) continue;
      if (inView(u.x, u.y)) this.drawHpBar(ctx, u);
    }
    for (const b of g.buildings) {
      if (b.dead || ui.selected.has(b) || b.type === 'farm') continue;
      if ((g.time - b.lastHitT < 3 || !b.built) && inView(b.x, b.y) && (b.owner === human || g.entVisible(b))) this.drawHpBar(ctx, b);
    }
    // move markers
    for (const m of ui.markers) {
      const [sx, sy] = this.w2s(m.x, m.y);
      const k = m.t / 0.6;
      ctx.strokeStyle = m.col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(sx, sy, (4 + k * 10) * z, (2 + k * 5) * z, 0, 0, Math.PI * 2);
      ctx.globalAlpha = 1 - k; ctx.stroke(); ctx.globalAlpha = 1;
    }

    // placement ghost
    if (ui.placing && ui.mouseWorld) {
      const def = BUILDINGS[ui.placing];
      const [wx, wy] = ui.mouseWorld;
      const tx = Math.round(wx - def.w / 2), ty = Math.round(wy - def.h / 2);
      const ok = g.canPlace(ui.placing, tx, ty, human);
      const cx = tx + def.w / 2, cy = ty + def.h / 2;
      const [sx, sy] = this.w2s(cx, cy);
      ctx.globalAlpha = 0.65;
      if (ui.placing === 'farm') blit(ctx, farmSprite(1), sx, sy, z);
      else blit(ctx, buildingSprite(ui.placing, g.players[human].color), sx, sy, z);
      ctx.globalAlpha = 1;
      this.drawFootprint(ctx, { tx, ty, w: def.w, h: def.h }, ok ? 'rgba(80,255,80,0.9)' : 'rgba(255,60,60,0.9)', ok ? 'rgba(80,255,80,0.15)' : 'rgba(255,60,60,0.25)');
      if (def.attack) {
        const r = def.attack.range + g.players[human].mods.range.building + def.w / 2;
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.ellipse(sx, sy, r * 45.25 * z, r * 22.6 * z, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      }
      ui.placeOk = ok; ui.placeT = [tx, ty];
    }

    // vignette
    ctx.drawImage(this.vignette, 0, 0, this.W, this.H);

    // drag box
    if (ui.drag && ui.drag.active) {
      const { x0, y0, x1, y1 } = ui.drag;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      ctx.strokeRect(Math.min(x0, x1) + 0.5, Math.min(y0, y1) + 0.5, Math.abs(x1 - x0), Math.abs(y1 - y0));
    }
  }

  buildingEffects(b, dt) {
    const g = this.game;
    if (!g.entVisible(b)) return;
    const r = Math.random;
    const frac = b.hp / g.maxHp(b);
    if (frac < 0.6 && r() < dt * (frac < 0.3 ? 14 : 6) * Math.sqrt(b.w)) {
      this.spawnFx({ name: 'fire', x: b.tx + r() * b.w, y: b.ty + r() * b.h, z: 0.3 + r() * 0.8 });
      if (r() < 0.4) this.spawnFx({ name: 'smoke', x: b.tx + r() * b.w, y: b.ty + r() * b.h, z: 1, dark: true });
    }
    if (b.type === 'blacksmith' && r() < dt * 2.5) this.spawnFx({ name: 'smoke', x: b.x + 0.0, y: b.y - 1.3, z: 1.75 });
    if (b.type === 'house' && r() < dt * 0.8) this.spawnFx({ name: 'smoke', x: b.x - 0.35, y: b.y - 0.25, z: 1.3 });
  }

  drawResource(ctx, r, sx, sy, z, t) {
    if (r.type === 'tree') {
      if (r.amount < r.max) blit(ctx, fallenTreeSprite(r.variant), sx, sy, z);
      else blit(ctx, treeSprite(r.variant), sx, sy + 4 * z, z);
    } else if (r.type === 'gold' || r.type === 'stone') blit(ctx, mineSprite(r.type, r.variant, r.amount / r.max), sx, sy, z);
    else if (r.type === 'berry') blit(ctx, berrySprite(r.variant, r.amount / r.max), sx, sy, z);
    else drawAnimal(ctx, r, sx, sy, z, t);
  }

  drawFootprint(ctx, e, col, fill) {
    const pts = [[e.tx, e.ty], [e.tx + e.w, e.ty], [e.tx + e.w, e.ty + e.h], [e.tx, e.ty + e.h]].map(([x, y]) => this.w2s(x, y));
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke();
  }

  drawHpBar(ctx, e) {
    const g = this.game, z = this.cam.zoom;
    const mh = g.maxHp(e);
    const f = clamp(e.hp / mh, 0, 1);
    let sx, sy, w;
    if (e.kind === 'unit') {
      [sx, sy] = this.w2s(e.x, e.y);
      sy -= (e.def.horse ? 36 : e.def.cls === 'siege' ? 30 : 28) * z;
      w = 22 * z;
    } else {
      [sx, sy] = this.w2s(e.x, e.y);
      const top = { towncenter: 104, castle: 98, tower: 92, house: 48, farm: 14, mill: 60, lumbercamp: 42, miningcamp: 40, barracks: 64, siegeworkshop: 58 }[e.type] || 56;
      sy -= (e.built ? top : Math.min(top, 40)) * z;
      w = (e.w * 20 + 10) * z;
    }
    const h = 3.5;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(sx - w / 2 - 1, sy - 1, w + 2, h + 2);
    ctx.fillStyle = e.owner === g.human ? (f > 0.5 ? '#3ad04a' : f > 0.25 ? '#e0c030' : '#e03a2a') : '#e0402a';
    ctx.fillRect(sx - w / 2, sy, w * f, h);
    if (e.kind === 'building' && !e.built) {
      ctx.fillStyle = '#e8d070';
      ctx.fillRect(sx - w / 2, sy + h + 2, w * e.progress, 2);
    }
  }

  drawWater(ctx, minX, maxX, minY, maxY) {
    const g = this.game, N = g.N, z = this.cam.zoom, t = this.time;
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1.2 * z;
    ctx.beginPath();
    for (let y = Math.max(0, minY); y < Math.min(N, maxY); y++) {
      for (let x = Math.max(0, minX); x < Math.min(N, maxX); x++) {
        if (g.terrain[y * N + x] < T.WATER) continue;
        const h = hash2(x, y, 55);
        if (h > 0.45) continue;
        const ph = t * (0.6 + h) + h * 20;
        const a = Math.sin(ph);
        if (a < 0.2) continue;
        const [sx, sy] = this.w2s(x + 0.5 + Math.sin(ph * 0.3) * 0.3, y + 0.5);
        const L = 6 * z * a;
        ctx.moveTo(sx - L, sy); ctx.quadraticCurveTo(sx, sy - 2 * z, sx + L, sy);
      }
    }
    ctx.stroke();
  }

  // ---------- minimap ----------
  renderMinimap(mctx, W, H, ui) {
    const g = this.game, N = g.N;
    if (!this.mmBase || this.mmT === undefined || g.time - this.mmT > 4) {
      this.mmT = g.time;
      if (!this.mmBase) { this.mmBase = document.createElement('canvas'); this.mmBase.width = N; this.mmBase.height = N; }
      const c = this.mmBase.getContext('2d');
      const img = c.createImageData(N, N);
      for (let i = 0; i < N * N; i++) {
        const o = i * 4;
        const t = g.terrain[i];
        let col = [this.tileCol[i * 3], this.tileCol[i * 3 + 1], this.tileCol[i * 3 + 2]];
        const bid = g.block[i];
        if (bid) {
          const e = g.ents.get(bid);
          if (e && e.kind === 'resource') col = e.type === 'tree' ? [34, 70, 30] : e.type === 'gold' ? [240, 200, 50] : e.type === 'stone' ? [170, 170, 170] : [190, 60, 70];
        }
        img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
        if (t >= 4) { img.data[o] = 40; img.data[o + 1] = 90; img.data[o + 2] = 150; }
      }
      c.putImageData(img, 0, 0);
    }
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.clearRect(0, 0, W, H);
    const sx = W / (2 * N), sy = H / (2 * N);
    mctx.setTransform(sx, sy, -sx, sy, W / 2, 0);
    mctx.imageSmoothingEnabled = false;
    mctx.drawImage(this.mmBase, 0, 0);
    // entities
    for (const b of g.buildings) {
      if (b.dead) continue;
      if (b.owner !== g.human && !g.entExplored(b)) continue;
      mctx.fillStyle = g.players[b.owner].color.main;
      mctx.fillRect(b.tx, b.ty, b.w, b.h);
    }
    for (const u of g.units) {
      if (u.owner !== g.human && !g.tileVisible(u.x, u.y)) continue;
      mctx.fillStyle = u.owner === g.human ? g.players[u.owner].color.light : g.players[u.owner].color.main;
      mctx.fillRect(u.x - 0.8, u.y - 0.8, 1.8, 1.8);
    }
    for (const r of g.resources) {
      if (!r.animal || !g.tileVisible(r.x, r.y)) continue;
      mctx.fillStyle = '#f0ece0';
      mctx.fillRect(r.x - 0.5, r.y - 0.5, 1.2, 1.2);
    }
    mctx.imageSmoothingEnabled = true;
    mctx.drawImage(this.fogCanvas, 0, 0);
    // pings
    for (const p of this.pings) {
      const k = p.t / 3;
      mctx.strokeStyle = `rgba(255,60,40,${1 - k})`;
      mctx.lineWidth = 0.8;
      mctx.beginPath(); mctx.arc(p.x, p.y, 2 + ((p.t * 6) % 6), 0, Math.PI * 2); mctx.stroke();
    }
    // viewport
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    const toMM = (wx, wy) => [W / 2 + (wx - wy) * sx, (wx + wy) * sy];
    const c = [this.s2w(0, this.hudTop), this.s2w(this.W, this.hudTop), this.s2w(this.W, this.H - this.hudBottom), this.s2w(0, this.H - this.hudBottom)].map(([x, y]) => toMM(x, y));
    mctx.strokeStyle = 'rgba(255,255,255,0.95)'; mctx.lineWidth = 1;
    mctx.beginPath(); mctx.moveTo(c[0][0], c[0][1]); for (const p of c.slice(1)) mctx.lineTo(p[0], p[1]); mctx.closePath(); mctx.stroke();
  }
  minimapToWorld(mx, my, W, H) {
    const N = this.game.N;
    const sx = W / (2 * N), sy = H / (2 * N);
    const a = (mx - W / 2) / sx, b = my / sy;
    return [(a + b) / 2, (b - a) / 2];
  }
}
