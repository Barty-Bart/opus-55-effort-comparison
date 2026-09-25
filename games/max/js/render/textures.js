// Procedural material textures for building faces.
import { RNG, valueNoise } from '../core/rng.js';
import { makeCanvas, rgbOf } from './draw3d.js';

function canvas(w, h, fn) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  fn(ctx, w, h);
  return c;
}
function noiseOverlay(ctx, w, h, amount, seed, scale = 1) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = (valueNoise(x / (3 * scale), y / (3 * scale), seed, Math.round(w / (3 * scale))) * 0.6 + (Math.random() - 0.5) * 0.8) * amount;
    const i = (y * w + x) * 4;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}
const col = (r, g, b) => `rgb(${r | 0},${g | 0},${b | 0})`;
function vary(base, rng, amt) {
  const [r, g, b] = rgbOf(base);
  const k = 1 + (rng.next() - 0.5) * amt;
  return col(r * k, g * k, b * k);
}

function stoneTex(base, seed, rowH = 8) {
  const rng = new RNG(seed);
  return canvas(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#4f4b45';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += rowH) {
      let x = -Math.floor(rng.next() * 10);
      while (x < w) {
        const bw = 10 + Math.floor(rng.next() * 9);
        const c = vary(base, rng, 0.28);
        ctx.fillStyle = c;
        const draw = (ox) => {
          ctx.fillRect(ox + x + 1, y + 1, bw - 1, rowH - 1);
          ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(ox + x + 1, y + 1, bw - 1, 1);
          ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(ox + x + 1, y + rowH - 1, bw - 1, 1);
          ctx.fillStyle = c;
        };
        draw(0); if (x + bw > w) draw(-w); if (x < 0) draw(w);
        x += bw;
      }
    }
    noiseOverlay(ctx, w, h, 14, seed);
  });
}

function plankTex(base, seed, vertical = true) {
  const rng = new RNG(seed);
  return canvas(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#3a2412'; ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 8) {
      const c = vary(base, rng, 0.3);
      ctx.fillStyle = c;
      if (vertical) ctx.fillRect(x + 1, 0, 7, h); else ctx.fillRect(0, x + 1, w, 7);
      ctx.strokeStyle = 'rgba(40,20,5,0.35)'; ctx.lineWidth = 0.6;
      for (let k = 0; k < 3; k++) {
        const o = 2 + rng.next() * 4;
        ctx.beginPath();
        if (vertical) { ctx.moveTo(x + o, 0); ctx.bezierCurveTo(x + o + 1, 20, x + o - 1, 44, x + o, 64); }
        else { ctx.moveTo(0, x + o); ctx.bezierCurveTo(20, x + o + 1, 44, x + o - 1, 64, x + o); }
        ctx.stroke();
      }
      if (rng.next() < 0.5) { ctx.fillStyle = 'rgba(30,15,5,0.5)'; ctx.beginPath(); ctx.arc(vertical ? x + 4 : rng.next() * 60, vertical ? rng.next() * 60 : x + 4, 1, 0, 7); ctx.fill(); }
    }
    noiseOverlay(ctx, w, h, 10, seed);
  });
}

function logTex(base, seed) {
  const rng = new RNG(seed);
  return canvas(64, 64, (ctx, w, h) => {
    for (let y = 0; y < h; y += 8) {
      const c = vary(base, rng, 0.25);
      const g = ctx.createLinearGradient(0, y, 0, y + 8);
      g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(0.25, c); g.addColorStop(0.55, c); g.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = c; ctx.fillRect(0, y, w, 8);
      ctx.fillStyle = g; ctx.fillRect(0, y, w, 8);
      ctx.fillStyle = 'rgba(255,230,190,0.15)'; ctx.fillRect(0, y + 2, w, 1);
    }
    noiseOverlay(ctx, w, h, 12, seed);
  });
}

function plasterTex(base, seed) {
  return canvas(64, 64, (ctx, w, h) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    noiseOverlay(ctx, w, h, 16, seed, 2);
  });
}

function timberTex(plaster, beam, seed) {
  const rng = new RNG(seed);
  return canvas(64, 64, (ctx, w, h) => {
    ctx.fillStyle = plaster; ctx.fillRect(0, 0, w, h);
    noiseOverlay(ctx, w, h, 14, seed, 2);
    ctx.fillStyle = beam;
    ctx.fillRect(0, 0, w, 3); ctx.fillRect(0, 30, w, 3); ctx.fillRect(0, 61, w, 3);
    for (const x of [0, 32]) ctx.fillRect(x, 0, 3, h);
    ctx.strokeStyle = beam; ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(3, 30); ctx.lineTo(30, 3);
    ctx.moveTo(35, 33); ctx.lineTo(62, 61);
    ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let k = 0; k < 20; k++) ctx.fillRect(rng.next() * 64, rng.next() * 64, 1, 1);
  });
}

function thatchTex(base, seed) {
  const rng = new RNG(seed);
  return canvas(64, 64, (ctx, w, h) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 6) {
      ctx.fillStyle = 'rgba(60,35,5,0.35)'; ctx.fillRect(0, y + 5, w, 1);
      for (let k = 0; k < 60; k++) {
        const x = rng.next() * w, len = 3 + rng.next() * 5;
        ctx.strokeStyle = rng.next() < 0.5 ? 'rgba(255,230,150,0.35)' : 'rgba(90,60,15,0.35)';
        ctx.lineWidth = 0.7;
        ctx.beginPath(); ctx.moveTo(x, y + rng.next() * 2); ctx.lineTo(x + (rng.next() - 0.5) * 1.5, y + len); ctx.stroke();
      }
    }
    noiseOverlay(ctx, w, h, 12, seed);
  });
}

function clayTileTex(base, seed) {
  const rng = new RNG(seed);
  return canvas(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#4a2012'; ctx.fillRect(0, 0, w, h);
    for (let y = 0, r = 0; y < h; y += 6, r++) {
      const off = r % 2 ? 4 : 0;
      for (let x = -8 + off; x < w + 8; x += 8) {
        const c = vary(base, rng, 0.25);
        const g = ctx.createLinearGradient(x, 0, x + 8, 0);
        g.addColorStop(0, 'rgba(0,0,0,0.35)'); g.addColorStop(0.35, c); g.addColorStop(0.6, c); g.addColorStop(1, 'rgba(0,0,0,0.3)');
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 8, y); ctx.lineTo(x + 8, y + 5); ctx.arc(x + 4, y + 5, 4, 0, Math.PI); ctx.closePath(); ctx.fill();
        ctx.fillStyle = g; ctx.fill();
      }
    }
    noiseOverlay(ctx, w, h, 10, seed);
  });
}

function slateTex(base, seed) {
  const rng = new RNG(seed);
  return canvas(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#20232a'; ctx.fillRect(0, 0, w, h);
    for (let y = 0, r = 0; y < h; y += 5, r++) {
      const off = r % 2 ? 4 : 0;
      for (let x = -8 + off; x < w; x += 8) {
        ctx.fillStyle = vary(base, rng, 0.25);
        ctx.fillRect(x + 0.5, y + 0.5, 7, 4.2);
        ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x + 0.5, y + 0.5, 7, 0.8);
      }
    }
    noiseOverlay(ctx, w, h, 8, seed);
  });
}

function shingleTex(base, seed) {
  const rng = new RNG(seed);
  return canvas(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#2e1a0c'; ctx.fillRect(0, 0, w, h);
    for (let y = 0, r = 0; y < h; y += 6, r++) {
      const off = r % 2 ? 5 : 0;
      for (let x = -10 + off; x < w; x += 10) {
        ctx.fillStyle = vary(base, rng, 0.35);
        ctx.fillRect(x + 0.6, y + 0.6, 9, 5.2);
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x + 0.6, y + 5, 9, 0.8);
      }
    }
    noiseOverlay(ctx, w, h, 10, seed);
  });
}

function cobbleTex(base, seed) {
  const rng = new RNG(seed);
  return canvas(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#5a5248'; ctx.fillRect(0, 0, w, h);
    for (let k = 0; k < 70; k++) {
      const x = rng.next() * w, y = rng.next() * h, r = 2.5 + rng.next() * 3;
      ctx.fillStyle = vary(base, rng, 0.3);
      for (const [dx, dy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) { ctx.beginPath(); ctx.ellipse(x + dx, y + dy, r, r * 0.8, rng.next(), 0, 7); ctx.fill(); }
    }
    noiseOverlay(ctx, w, h, 10, seed);
  });
}

function marbleTex(base, seed) {
  return canvas(64, 64, (ctx, w, h) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(120,110,100,0.35)'; ctx.lineWidth = 0.6;
    for (let y = 0; y < h; y += 16) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    for (let y = 0, r = 0; y < h; y += 16, r++) for (let x = r % 2 ? 16 : 0; x < w; x += 32) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 16); ctx.stroke(); }
    noiseOverlay(ctx, w, h, 9, seed, 2);
  });
}

function soilTex(seed) {
  const rng = new RNG(seed);
  return canvas(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#6e4a2a'; ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 4) {
      ctx.fillStyle = 'rgba(40,22,8,0.45)'; ctx.fillRect(0, y, w, 1.4);
      ctx.fillStyle = 'rgba(160,120,70,0.25)'; ctx.fillRect(0, y + 2, w, 1);
    }
    for (let k = 0; k < 40; k++) { ctx.fillStyle = 'rgba(30,15,5,0.3)'; ctx.fillRect(rng.next() * w, rng.next() * h, 1, 1); }
    noiseOverlay(ctx, w, h, 12, seed);
  });
}

let MATS = null;
export function materials() {
  if (MATS) return MATS;
  const m = (tex, scale = 0.5, extra = {}) => ({ tex, scale, ...extra });
  MATS = {
    stone: m(stoneTex('#a39d91', 11)),
    stoneDark: m(stoneTex('#7f7a72', 12)),
    stoneWarm: m(stoneTex('#c2ae8a', 13)),
    sandstone: m(stoneTex('#d8c397', 14, 10)),
    plank: m(plankTex('#8a5a32', 21)),
    plankDark: m(plankTex('#6a4224', 22)),
    plankH: m(plankTex('#94643a', 23, false)),
    log: m(logTex('#7a5230', 31)),
    plaster: m(plasterTex('#e3d6b4', 41)),
    timber: m(timberTex('#e6d8b2', '#5a3a1e', 42)),
    timberDark: m(timberTex('#d9c9a2', '#4a2e16', 43)),
    thatch: m(thatchTex('#b89448', 51)),
    thatchDark: m(thatchTex('#9a7a3a', 52)),
    tile: m(clayTileTex('#a8492c', 61)),
    tileDark: m(clayTileTex('#8a3a24', 62)),
    slate: m(slateTex('#5a6272', 71)),
    shingle: m(shingleTex('#7a5234', 81)),
    cobble: m(cobbleTex('#8a8276', 91)),
    marble: m(marbleTex('#ece6d6', 92)),
    soil: m(soilTex(93)),
    gold: { color: '#d8b640' },
    dark: { color: '#2a1d14' },
    wood: { color: '#7a5230' },
    woodDark: { color: '#4e331d' },
    iron: { color: '#5d6168' },
  };
  return MATS;
}
