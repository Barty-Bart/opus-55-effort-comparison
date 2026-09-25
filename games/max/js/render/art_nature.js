// Trees, mines, bushes, fish and ground decoration.
import { Model, renderModel, makeCanvas, SS, shade, mix, proj } from './draw3d.js';
import { RNG } from '../core/rng.js';

const TAU = Math.PI * 2;
const cache = new Map();
function cached(key, fn) { let s = cache.get(key); if (!s) { s = fn(); cache.set(key, s); } return s; }

const OAK_GREENS = ['#4e7a2c', '#5a8a32', '#46702a', '#628f38', '#3f6a26'];
const PINE_GREENS = ['#2f5a2e', '#2a5230', '#35633a', '#284c2a'];

function oakModel(v) {
  const rng = new RNG(v * 97 + 11);
  const m = new Model(0);
  const base = OAK_GREENS[v % OAK_GREENS.length];
  const s = 0.88 + rng.next() * 0.28;
  m.limb([0, 0, 0], [0.5, 0.3, 26 * s], 3.4, 2.3, '#5a3c22');
  m.limb([0.3, 0.2, 18 * s], [5, -3, 30 * s], 1.6, 1.0, '#5a3c22');
  const cz = 40 * s, rx = 15 * s, rz = 12 * s;
  const blobs = [];
  for (let i = 0; i < 16; i++) {
    const a = rng.next() * TAU, r = Math.sqrt(rng.next());
    const x = Math.cos(a) * rx * r * 0.9, y = Math.sin(a) * rx * r * 0.9;
    const z = cz + (rng.next() - 0.35) * rz * 1.4;
    blobs.push([x, y, z, (6.5 + rng.next() * 3.5) * s]);
  }
  for (const [x, y, z, r] of blobs) {
    const lightness = 0.85 + ((z - cz) / rz) * 0.2 + (y - x) * 0.004;
    m.sphere([x, y, z], r, shade(base, lightness));
  }
  // leaf speckles
  for (let i = 0; i < 46; i++) {
    const b = blobs[Math.floor(rng.next() * blobs.length)];
    const a = rng.next() * TAU, e = rng.next() * 0.9 + 0.1;
    const p = [b[0] + Math.cos(a) * b[3] * 0.8 * e, b[1] + Math.sin(a) * b[3] * 0.8 * e, b[2] + b[3] * 0.6 * (1 - e) + 1];
    m.sphere(p, 1.1 + rng.next() * 0.6, rng.next() < 0.6 ? shade(base, 1.25) : shade(base, 0.72), { flat: true, bias: 3 });
  }
  return m;
}

function pineModel(v) {
  const rng = new RNG(v * 131 + 7);
  const m = new Model(0);
  const base = PINE_GREENS[v % PINE_GREENS.length];
  const s = 0.9 + rng.next() * 0.3;
  m.limb([0, 0, 0], [0, 0, 20 * s], 2.6, 1.8, '#5a3a24');
  const tiers = 5;
  for (let k = 0; k < tiers; k++) {
    const z0 = (12 + k * 11) * s, h = 16 * s;
    const r = (15.5 - k * 2.6) * s;
    const n = 10;
    const col = shade(base, 0.9 + k * 0.06);
    const rot = rng.next();
    for (let i = 0; i < n; i++) {
      const a0 = ((i + rot) / n) * TAU, a1 = ((i + 1 + rot) / n) * TAU;
      const rr0 = r * (i % 2 ? 0.78 : 1.05), rr1 = r * ((i + 1) % 2 ? 0.78 : 1.05);
      m.poly([[0, 0, z0 + h], [Math.cos(a0) * rr0, Math.sin(a0) * rr0, z0 - (i % 2 ? 0 : 1.8)], [Math.cos(a1) * rr1, Math.sin(a1) * rr1, z0 - ((i + 1) % 2 ? 0 : 1.8)]], col, { bias: k * 0.5, twoSided: false });
    }
  }
  return m;
}

export function treeSprite(species, v) {
  return cached(`tree|${species}|${v}`, () => renderModel(species === 'pine' ? pineModel(v) : oakModel(v), { outlineWidth: 1.1, outlineColor: 'rgba(18,28,10,0.85)' }));
}

export function fellenTreeSprite(species, v, dir) {
  return cached(`felled|${species}|${v % 3}|${dir}`, () => {
    const m = new Model((dir / 8) * TAU);
    const rng = new RNG(v * 17 + 5);
    m.limb([0, 0, 1], [0, 0, 5], 3.4, 3.2, '#5a3c22');
    m.sphere([0, 0, 5.3], 3.2, '#c8a070', { sq: 0.5, bias: 0.5 });
    m.limb([2, 0, 3], [26, 1, 3], 2.8, 2, '#5a3c22');
    const col = species === 'pine' ? PINE_GREENS[v % 4] : OAK_GREENS[v % 5];
    for (let i = 0; i < 6; i++) m.sphere([22 + rng.next() * 12, (rng.next() - 0.5) * 12, 4 + rng.next() * 4], 5 + rng.next() * 2.5, shade(col, 0.8 + rng.next() * 0.3));
    return renderModel(m, { outlineWidth: 1.1 });
  });
}

export function stumpSprite(v) {
  return cached(`stump|${v % 3}`, () => {
    const m = new Model(v);
    m.limb([0, 0, 0], [0, 0, 3.5], 3.6, 3.3, '#5a3c22');
    m.sphere([0, 0, 3.8], 3.3, '#b89060', { sq: 0.5, bias: 1 });
    return renderModel(m, { outlineWidth: 1 });
  });
}

// Faceted rock: apex + jittered rim.
function rock(m, x, y, r, h, col, rng, bias = 0) {
  const n = 7;
  const apex = [x + (rng.next() - 0.6) * r * 0.4, y + (rng.next() - 0.4) * r * 0.4, h];
  const rim = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rng.next() * 0.4;
    const rr = r * (0.75 + rng.next() * 0.35);
    rim.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr, rng.next() * h * 0.25]);
  }
  for (let i = 0; i < n; i++) m.poly([apex, rim[i], rim[(i + 1) % n]], col, { bias, twoSided: false });
}

export function mineSprite(type, v, level) {
  return cached(`mine|${type}|${v % 4}|${level}`, () => {
    const rng = new RNG(v * 53 + (type === 'gold' ? 1 : 2));
    const m = new Model(0);
    const n = [3, 4, 5][level];
    const spots = [];
    for (let i = 0; i < n + 2; i++) spots.push([(rng.next() - 0.5) * 22, (rng.next() - 0.5) * 22]);
    spots.sort((a, b) => a[0] + a[1] - b[0] - b[1]);
    if (type === 'gold') {
      for (let i = 0; i < spots.length; i++) {
        const [x, y] = spots[i];
        if (i % 2 === 0) rock(m, x, y, 6 + rng.next() * 3, 7 + rng.next() * 5, i % 4 ? '#8a7a64' : '#7a6c58', rng);
        else rock(m, x, y, 4 + rng.next() * 2, 5 + rng.next() * 4 + level * 1.5, '#e0b830', rng, 0.3);
      }
      for (let k = 0; k < 4 + level * 2; k++) rock(m, (rng.next() - 0.5) * 20, (rng.next() - 0.5) * 20, 2 + rng.next() * 1.5, 3 + rng.next() * 3, '#f2cc40', rng, 0.6);
    } else {
      for (const [x, y] of spots) rock(m, x, y, 5 + rng.next() * 4, 6 + rng.next() * 7 + level, rng.next() < 0.5 ? '#a8a49c' : '#8e8a84', rng);
      for (let k = 0; k < 3 + level; k++) rock(m, (rng.next() - 0.5) * 22, (rng.next() - 0.5) * 22, 2.4, 3, '#b8b4ac', rng, 0.4);
    }
    const spr = renderModel(m, { outlineWidth: 1.1, outlineColor: 'rgba(30,24,16,0.9)' });
    if (type === 'gold') {
      const ctx = spr.canvas.getContext('2d');
      for (let k = 0; k < 3 + level; k++) {
        const x = spr.ax + (rng.next() - 0.5) * 30 * SS, y = spr.ay - rng.next() * 16 * SS;
        ctx.fillStyle = 'rgba(255,250,210,0.95)';
        ctx.beginPath();
        const r = (1.6 + rng.next() * 1.4) * SS;
        ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.25, y - r * 0.25); ctx.lineTo(x + r, y); ctx.lineTo(x + r * 0.25, y + r * 0.25);
        ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.25, y + r * 0.25); ctx.lineTo(x - r, y); ctx.lineTo(x - r * 0.25, y - r * 0.25);
        ctx.closePath(); ctx.fill();
      }
    }
    return spr;
  });
}

export function berrySprite(v, full) {
  return cached(`berry|${v % 3}|${full}`, () => {
    const rng = new RNG(v * 29 + 3);
    const m = new Model(0);
    const blobs = [];
    for (let i = 0; i < 7; i++) blobs.push([(rng.next() - 0.5) * 14, (rng.next() - 0.5) * 14, 5 + rng.next() * 6, 5 + rng.next() * 2.5]);
    for (const [x, y, z, r] of blobs) m.sphere([x, y, z], r, shade('#3e6a2a', 0.85 + rng.next() * 0.3));
    if (full) {
      for (let i = 0; i < 26; i++) {
        const b = blobs[Math.floor(rng.next() * blobs.length)];
        const a = rng.next() * TAU;
        m.sphere([b[0] + Math.cos(a) * b[3] * 0.8, b[1] + Math.sin(a) * b[3] * 0.8, b[2] + b[3] * 0.5 * rng.next()], 1.05, rng.next() < 0.7 ? '#c8283a' : '#8a1e5a', { bias: 3 });
      }
    }
    return renderModel(m, { outlineWidth: 1, outlineColor: 'rgba(16,28,10,0.85)' });
  });
}

export function fishSprite(v) {
  return cached(`fish|${v % 3}`, () => {
    const c = makeCanvas(40 * SS, 24 * SS);
    const ctx = c.getContext('2d');
    ctx.scale(SS, SS);
    const rng = new RNG(v * 7 + 1);
    for (let i = 0; i < 3; i++) {
      const x = 8 + rng.next() * 24, y = 6 + rng.next() * 12, a = rng.next() * TAU;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(1, 0.55);
      ctx.fillStyle = 'rgba(20,40,55,0.55)';
      ctx.beginPath(); ctx.ellipse(0, 0, 5, 2, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(-8, -2.5); ctx.lineTo(-8, 2.5); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    return { canvas: c, ax: 20 * SS, ay: 12 * SS, w: c.width, h: c.height };
  });
}

// Soft elliptical ground shadow (for trees, units, props).
export function blobShadow(rx, ry, a = 0.3) {
  return cached(`blob|${rx}|${ry}|${a}`, () => {
    const c = makeCanvas((rx * 2 + 8) * SS, (ry * 2 + 8) * SS);
    const ctx = c.getContext('2d');
    ctx.scale(SS, SS);
    const g = ctx.createRadialGradient(rx + 4, ry + 4, 0, rx + 4, ry + 4, rx + 3);
    g.addColorStop(0, `rgba(0,0,0,${a})`);
    g.addColorStop(0.65, `rgba(0,0,0,${a * 0.75})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.setTransform(SS, 0, 0, SS * (ry / rx), 0, 0);
    ctx.beginPath(); ctx.arc(rx + 4, (ry + 4) * (rx / ry), rx + 3, 0, TAU); ctx.fill();
    return { canvas: c, ax: (rx + 4) * SS, ay: (ry + 4) * SS, w: c.width, h: c.height };
  });
}

// Ground decals: tufts, flowers, pebbles, bushes, reeds, lily pads.
export function decalSprite(kind, v) {
  return cached(`decal|${kind}|${v % 4}`, () => {
    const rng = new RNG(v * 41 + kind.length * 13);
    const W = 26, H = 18;
    const c = makeCanvas(W * SS, H * SS);
    const ctx = c.getContext('2d');
    ctx.scale(SS, SS);
    const cx = W / 2, cy = H - 5;
    if (kind === 'tuft' || kind === 'drytuft') {
      const cols = kind === 'tuft' ? ['#6a9a3a', '#4e7a2a', '#8ab04a'] : ['#a8a050', '#8a8a40', '#c0b060'];
      for (let i = 0; i < 9; i++) {
        const x = cx + (rng.next() - 0.5) * 9, h = 3 + rng.next() * 4;
        ctx.strokeStyle = cols[i % 3]; ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.moveTo(x, cy); ctx.quadraticCurveTo(x + (rng.next() - 0.5) * 3, cy - h * 0.6, x + (rng.next() - 0.5) * 4, cy - h); ctx.stroke();
      }
    } else if (kind === 'flowers') {
      const cols = [['#f0e8f0', '#e8d040'], ['#e8d040', '#c89020'], ['#b870d8', '#f0e070'], ['#e85050', '#f0d070']][v % 4];
      for (let i = 0; i < 6; i++) {
        const x = cx + (rng.next() - 0.5) * 14, y = cy - rng.next() * 6;
        ctx.strokeStyle = '#4e7a2a'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(x, y + 2); ctx.lineTo(x, y); ctx.stroke();
        ctx.fillStyle = cols[0]; ctx.beginPath(); ctx.arc(x, y, 1.2, 0, TAU); ctx.fill();
        ctx.fillStyle = cols[1]; ctx.beginPath(); ctx.arc(x, y, 0.5, 0, TAU); ctx.fill();
      }
    } else if (kind === 'pebbles') {
      for (let i = 0; i < 5; i++) {
        const x = cx + (rng.next() - 0.5) * 14, y = cy - rng.next() * 5, r = 0.8 + rng.next() * 1.6;
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(x + 0.6, y + 0.4, r, r * 0.6, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = rng.next() < 0.5 ? '#a8a298' : '#8a857c'; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.65, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.ellipse(x - r * 0.3, y - r * 0.25, r * 0.4, r * 0.25, 0, 0, TAU); ctx.fill();
      }
    } else if (kind === 'bush') {
      // low fern-like shrub (kept small and yellow-green so it never reads as a berry bush)
      const g = ['#6a8a38', '#7a9a40', '#5e7e34'][v % 3];
      for (let i = 0; i < 6; i++) {
        const x = cx + (rng.next() - 0.5) * 10, y = cy - 1.5 - rng.next() * 2.5, r = 1.6 + rng.next() * 1.4;
        const gr = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, 0.5, x, y, r);
        gr.addColorStop(0, shade(g, 1.3)); gr.addColorStop(1, shade(g, 0.6));
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      }
    } else if (kind === 'reeds') {
      for (let i = 0; i < 8; i++) {
        const x = cx + (rng.next() - 0.5) * 12, h = 6 + rng.next() * 6;
        ctx.strokeStyle = rng.next() < 0.5 ? '#6a8a3a' : '#8a9a4a'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(x, cy); ctx.lineTo(x + (rng.next() - 0.5) * 2, cy - h); ctx.stroke();
        if (rng.next() < 0.4) { ctx.fillStyle = '#6a4a2a'; ctx.fillRect(x - 0.6, cy - h - 2, 1.2, 3); }
      }
    } else if (kind === 'lily') {
      for (let i = 0; i < 3; i++) {
        const x = cx + (rng.next() - 0.5) * 12, y = cy - rng.next() * 6;
        ctx.fillStyle = '#4a7a3a'; ctx.beginPath(); ctx.ellipse(x, y, 2.6, 1.4, 0, 0.3, TAU - 0.1); ctx.lineTo(x, y); ctx.fill();
        if (rng.next() < 0.4) { ctx.fillStyle = '#f0d0e0'; ctx.beginPath(); ctx.arc(x + 0.5, y - 0.4, 0.8, 0, TAU); ctx.fill(); }
      }
    }
    return { canvas: c, ax: cx * SS, ay: cy * SS, w: c.width, h: c.height };
  });
}

void mix; void proj;
