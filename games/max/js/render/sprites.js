// Sprite cache with a per-frame generation budget so new sprites never stall a frame.
import { unitSprite, carcassSprite } from './art_units.js';
import { silhouette, makeCanvas, SS } from './draw3d.js';

export class SpriteCache {
  constructor() {
    this.map = new Map();
    this.t0 = 0;
    this.budgetMs = 6;
    this.generated = 0;
  }
  beginFrame() { this.t0 = performance.now(); this.generated = 0; }
  canGen() { return this.generated < 2 || performance.now() - this.t0 < this.budgetMs; }

  unit(type, team, anim, frame, dir, variant, task, carry, owned) {
    const key = `${type}|${team.main}|${anim}|${frame}|${dir}|${variant}|${task || ''}|${carry || ''}|${owned ? 1 : 0}`;
    let s = this.map.get(key);
    if (s) return s;
    if (!this.canGen()) {
      // fall back to an idle pose if we have one, otherwise draw nothing this frame
      const fk = `${type}|${team.main}|idle|0|${dir}|${variant}|${task || ''}||${owned ? 1 : 0}`;
      return this.map.get(fk) || null;
    }
    s = unitSprite(type, team, anim, frame, dir, variant, task, carry, owned);
    this.generated++;
    this.map.set(key, s);
    if (this.map.size > 6000) {
      // evict the oldest third (Map iterates in insertion order); they regenerate on demand
      let k = 0;
      for (const old of this.map.keys()) { if (k++ > 2000) break; if (!old.startsWith('flag|') && old !== 'sails' && !old.startsWith('puff|')) this.map.delete(old); }
    }
    return s;
  }
  carcass(animal, dir) {
    const key = `carcass|${animal}|${dir}`;
    let s = this.map.get(key);
    if (!s) { s = carcassSprite(animal, dir); this.map.set(key, s); }
    return s;
  }
  sil(sprite, color) {
    if (!sprite.sil) sprite.sil = {};
    let c = sprite.sil[color];
    if (!c) { c = sprite.sil[color] = silhouette(sprite.canvas, color); }
    return c;
  }
  // Waving flag frames
  flag(team, frame) {
    const key = `flag|${team.main}|${frame}`;
    let s = this.map.get(key);
    if (s) return s;
    const w = 16, h = 11;
    const c = makeCanvas(w * SS, h * SS);
    const ctx = c.getContext('2d');
    ctx.scale(SS, SS);
    const ph = (frame / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0, 1);
    for (let x = 0; x <= 13; x++) ctx.lineTo(x, 1 + Math.sin(ph + x * 0.45) * 1.3 * (x / 13));
    for (let x = 13; x >= 0; x--) ctx.lineTo(x, 8 + Math.sin(ph + x * 0.45) * 1.3 * (x / 13));
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, 13, 0);
    g.addColorStop(0, team.dark); g.addColorStop(0.4, team.main); g.addColorStop(1, team.light);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 0.6; ctx.stroke();
    s = { canvas: c, ax: 0, ay: 1 * SS, w: c.width, h: c.height };
    this.map.set(key, s);
    return s;
  }
  sails() {
    let s = this.map.get('sails');
    if (s) return s;
    const R = 34, c = makeCanvas(R * 2 * SS + 8, R * 2 * SS + 8);
    const ctx = c.getContext('2d');
    ctx.translate(c.width / 2, c.height / 2);
    ctx.scale(SS, SS);
    for (let k = 0; k < 4; k++) {
      ctx.save();
      ctx.rotate((k * Math.PI) / 2);
      ctx.fillStyle = '#5a3a1e';
      ctx.fillRect(-1, 0, 2, R);
      ctx.fillStyle = 'rgba(235,225,200,0.92)';
      ctx.fillRect(1.2, 6, 7, R - 7);
      ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 0.6;
      for (let y = 8; y < R; y += 5) { ctx.beginPath(); ctx.moveTo(1.2, y); ctx.lineTo(8.2, y); ctx.stroke(); }
      ctx.strokeRect(1.2, 6, 7, R - 7);
      ctx.restore();
    }
    ctx.fillStyle = '#3a2412'; ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, Math.PI * 2); ctx.fill();
    s = { canvas: c, ax: c.width / 2, ay: c.height / 2 };
    this.map.set('sails', s);
    return s;
  }
  // Soft round particle sprites
  puff(color) {
    const key = `puff|${color}`;
    let s = this.map.get(key);
    if (s) return s;
    const c = makeCanvas(32, 32);
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 32);
    s = { canvas: c };
    this.map.set(key, s);
    return s;
  }
}
