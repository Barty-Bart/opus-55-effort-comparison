// UI icons (units, buildings, technologies, resources, commands) and custom cursors.
import { getUnitSprite } from './artUnits.js';
import { getBuildingSprite, getFarmSprite, getWallSprite } from './art.js';
import { UNITS, TECHS, LINES, BUILDINGS } from './config.js';
import { TAU, shade } from './util.js';

const cache = new Map();
const SZ = 64;

function frame(ctx, tint = '#2c3440') {
  const g = ctx.createLinearGradient(0, 0, SZ, SZ);
  g.addColorStop(0, shade(tint, 0.25)); g.addColorStop(1, shade(tint, -0.35));
  ctx.fillStyle = g; ctx.fillRect(0, 0, SZ, SZ);
  const r = ctx.createRadialGradient(SZ * 0.4, SZ * 0.35, 4, SZ / 2, SZ / 2, SZ * 0.75);
  r.addColorStop(0, 'rgba(255,240,200,0.18)'); r.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = r; ctx.fillRect(0, 0, SZ, SZ);
}

function mk(key, draw) {
  let url = cache.get(key);
  if (url) return url;
  const c = document.createElement('canvas');
  c.width = SZ; c.height = SZ;
  const ctx = c.getContext('2d');
  draw(ctx);
  url = c.toDataURL();
  cache.set(key, url);
  return url;
}

// Draw a unit sprite so the figure fills the icon frame.
function portrait(ctx, def, pc) {
  const s = getUnitSprite(def.sprite, pc, 'idle', 0, { gear: def.gear || 0, variant: 1, owned: true });
  const fit = {
    knight: [1.55, 3, 5], scout: [1.55, 3, 5], cavarcher: [1.55, 3, 5], ram: [1.6, 3, 10], mangonel: [1.6, 2, 10],
    trebuchet: [0.8, 0, 4], sheep: [2.6, 2, 14], deer: [2.1, 2, 12],
  }[def.sprite] || [1.95, 1, 4];
  const [scale, dx, bottom] = fit;
  ctx.drawImage(s.c, SZ / 2 - (s.ox + dx) * scale, SZ - bottom - s.oy * scale, s.w * scale, s.h * scale);
}

export function unitIcon(type, pc) {
  const def = UNITS[type];
  return mk(`u|${type}|${pc.main}`, (ctx) => {
    frame(ctx, '#34404e');
    portrait(ctx, def, pc);
  });
}

export function buildingIcon(type, pc, age = 1) {
  return mk(`b|${type}|${pc.main}|${age}`, (ctx) => {
    frame(ctx, '#3a4436');
    const s = type === 'farm' ? getFarmSprite(2, 3, true) : BUILDINGS[type].wall ? getWallSprite(type, pc, 10, true) : getBuildingSprite(type, pc, age, 0);
    const scale = Math.min((SZ - 6) / s.w, (SZ - 6) / (s.h - 20));
    const w = s.w * scale, h = s.h * scale;
    ctx.drawImage(s.c, (SZ - w) / 2, SZ - h - 2 + 6 * scale, w, h);
  });
}

// ---------------------------------------------------------------------------
// glyph helpers
// ---------------------------------------------------------------------------
function L(ctx, pts, w, col) {
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
}
function P(ctx, pts, fill, stroke, w = 1.5) {
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = w; ctx.stroke(); }
}
function C(ctx, x, y, r, fill, stroke, w = 1.5) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = w; ctx.stroke(); }
}
function steelGrad(ctx, x0, y0, x1, y1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, '#f2f4f6'); g.addColorStop(0.5, '#a8b0b8'); g.addColorStop(1, '#5c636b');
  return g;
}
function badge(ctx, n) {
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(SZ - 20, SZ - 18, 18, 16);
  ctx.fillStyle = '#f4d77a'; ctx.font = 'bold 13px Georgia'; ctx.textAlign = 'center'; ctx.fillText(n, SZ - 11, SZ - 5);
}
function upArrow(ctx) {
  P(ctx, [[46, 8], [58, 22], [51, 22], [51, 32], [41, 32], [41, 22], [34, 22]], '#6fd04a', '#1d4a10', 1.5);
}

function drawAxe(ctx, x, y, s = 1, dbl = false) {
  L(ctx, [[x - 14 * s, y + 16 * s], [x + 10 * s, y - 12 * s]], 4 * s, '#8a5a30');
  const head = (sgn) => P(ctx, [[x + 4 * s, y - 8 * s], [x + (4 + 12 * sgn) * s, y - (14 + 6 * sgn) * s], [x + (10 + 10 * sgn) * s, y - (2 - 4 * sgn) * s]], steelGrad(ctx, x, y - 20, x + 20, y), '#333', 1);
  head(1); if (dbl) head(-1);
}
function drawPick(ctx, x, y, s = 1) {
  L(ctx, [[x - 14 * s, y + 16 * s], [x + 8 * s, y - 10 * s]], 4 * s, '#8a5a30');
  ctx.strokeStyle = '#9aa2aa'; ctx.lineWidth = 5 * s; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - 8 * s, y - 20 * s); ctx.quadraticCurveTo(x + 10 * s, y - 16 * s, x + 20 * s, y - 2 * s); ctx.stroke();
}
function drawNugget(ctx, x, y, r, col = '#f2c230') {
  P(ctx, [[x - r, y], [x - r * 0.3, y - r], [x + r, y - r * 0.4], [x + r * 0.6, y + r * 0.7], [x - r * 0.5, y + r * 0.8]], col, shade(col, -0.5), 1.2);
  P(ctx, [[x - r * 0.6, y - r * 0.1], [x - r * 0.2, y - r * 0.8], [x + r * 0.5, y - r * 0.4]], 'rgba(255,255,220,0.7)');
}
function drawArrow(ctx, x0, y0, x1, y1, col = '#e8e0c8') {
  L(ctx, [[x0, y0], [x1, y1]], 2.5, '#8a6a40');
  const a = Math.atan2(y1 - y0, x1 - x0);
  P(ctx, [[x1 + Math.cos(a) * 7, y1 + Math.sin(a) * 7], [x1 + Math.cos(a + 2.4) * 6, y1 + Math.sin(a + 2.4) * 6], [x1 + Math.cos(a - 2.4) * 6, y1 + Math.sin(a - 2.4) * 6]], '#c8ccd2', '#444', 1);
  L(ctx, [[x0, y0], [x0 - Math.cos(a - 0.5) * 7, y0 - Math.sin(a - 0.5) * 7]], 2, col);
  L(ctx, [[x0, y0], [x0 - Math.cos(a + 0.5) * 7, y0 - Math.sin(a + 0.5) * 7]], 2, col);
}
function drawArmor(ctx, level) {
  const g = level === 0 ? '#9a7040' : steelGrad(ctx, 16, 12, 48, 52);
  P(ctx, [[20, 12], [44, 12], [50, 22], [46, 52], [18, 52], [14, 22]], g, '#2a2a2a', 1.5);
  P(ctx, [[26, 12], [32, 20], [38, 12]], '#2a2a2a');
  if (level === 1) { ctx.fillStyle = 'rgba(40,40,40,0.5)'; for (let y = 22; y < 50; y += 3) for (let x = 18 + (y % 2); x < 46; x += 3) ctx.fillRect(x, y, 1.3, 1.3); }
  if (level === 0) for (let y = 24; y < 50; y += 6) L(ctx, [[17, y], [47, y]], 1, 'rgba(0,0,0,0.4)');
  if (level === 2) { L(ctx, [[32, 22], [32, 50]], 1.5, 'rgba(255,255,255,0.6)'); L(ctx, [[18, 36], [46, 36]], 1.5, 'rgba(0,0,0,0.35)'); }
}
function drawHorseHead(ctx, level) {
  P(ctx, [[20, 54], [22, 30], [30, 14], [36, 10], [48, 24], [50, 32], [44, 34], [38, 28], [34, 40], [36, 54]], '#8a5a34', '#2a1a10', 1.5);
  C(ctx, 38, 20, 2, '#111');
  const g = level === 0 ? '#9a7040' : steelGrad(ctx, 26, 10, 50, 34);
  P(ctx, [[30, 14], [36, 10], [48, 24], [44, 28], [34, 22]], g, '#222', 1.2);
}
function drawShieldEmblem(ctx, col, numeral) {
  P(ctx, [[12, 10], [52, 10], [52, 34], [32, 56], [12, 34]], col, '#1a1208', 2);
  P(ctx, [[16, 14], [48, 14], [48, 33], [32, 51], [16, 33]], null, 'rgba(255,230,160,0.8)', 1.5);
  ctx.fillStyle = '#fff3c8'; ctx.font = 'bold 20px Georgia'; ctx.textAlign = 'center'; ctx.fillText(numeral, 32, 36);
}

const TECH_GLYPH = {
  feudal: (c) => drawShieldEmblem(c, '#6a4a2a', 'II'),
  castle: (c) => drawShieldEmblem(c, '#3a5a8a', 'III'),
  imperial: (c) => { drawShieldEmblem(c, '#8a2a2a', 'IV'); P(c, [[20, 8], [24, 0], [28, 6], [32, -1], [36, 6], [40, 0], [44, 8]], '#e8c040', '#6a5010', 1); },
  loom: (c) => { C(c, 32, 32, 18, '#d8c8a0', '#6a5030', 2); for (let i = -14; i <= 14; i += 4) L(c, [[18, 32 + i * 0.6], [46, 32 - i * 0.6]], 1, '#8a6a40'); L(c, [[16, 52], [48, 12]], 3, '#8a5a30'); },
  wheelbarrow: (c) => { P(c, [[14, 26], [46, 26], [40, 40], [18, 40]], '#9a6a3a', '#3a2410', 2); C(c, 44, 46, 7, '#5a3a1a', '#221', 2); L(c, [[14, 30], [4, 44]], 3, '#6a4a2a'); L(c, [[18, 40], [16, 52]], 3, '#6a4a2a'); },
  handcart: (c) => { P(c, [[10, 22], [50, 22], [50, 38], [10, 38]], '#9a6a3a', '#3a2410', 2); C(c, 20, 44, 8, '#5a3a1a', '#221', 2); C(c, 42, 44, 8, '#5a3a1a', '#221', 2); L(c, [[50, 30], [60, 22]], 3, '#6a4a2a'); },
  horsecollar: (c) => { c.strokeStyle = '#8a5a30'; c.lineWidth = 9; c.beginPath(); c.arc(32, 30, 16, Math.PI * 0.85, Math.PI * 2.15); c.stroke(); c.strokeStyle = '#c9a060'; c.lineWidth = 3; c.stroke(); },
  heavyplow: (c) => { L(c, [[10, 14], [40, 40]], 4, '#8a5a30'); P(c, [[36, 36], [54, 42], [50, 52], [34, 46]], steelGrad(c, 34, 36, 54, 52), '#333', 1.5); },
  croprotation: (c) => { for (let i = 0; i < 5; i++) { const x = 16 + i * 8; L(c, [[x, 56], [x + 2, 16]], 2, '#b09030'); P(c, [[x + 2, 12], [x + 6, 20], [x + 2, 28], [x - 2, 20]], '#e8c050', '#8a6a20', 1); } },
  doublebitaxe: (c) => drawAxe(c, 32, 34, 1, true),
  bowsaw: (c) => { c.strokeStyle = '#8a5a30'; c.lineWidth = 4; c.beginPath(); c.arc(32, 40, 20, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); L(c, [[13, 34], [51, 34]], 3, '#c0c6cc'); for (let x = 15; x < 50; x += 3) L(c, [[x, 35], [x + 1.5, 38]], 1, '#666'); },
  twomansaw: (c) => { L(c, [[6, 34], [58, 34]], 6, '#c0c6cc'); for (let x = 8; x < 56; x += 3) L(c, [[x, 37], [x + 1.5, 40]], 1.2, '#555'); L(c, [[6, 26], [6, 42]], 5, '#8a5a30'); L(c, [[58, 26], [58, 42]], 5, '#8a5a30'); },
  goldmining: (c) => { drawPick(c, 30, 32); drawNugget(c, 44, 46, 9); },
  goldshaft: (c) => { drawPick(c, 30, 30); drawNugget(c, 40, 48, 8); drawNugget(c, 52, 42, 6); },
  stonemining: (c) => { drawPick(c, 30, 32); drawNugget(c, 44, 46, 9, '#a8aaad'); },
  stoneshaft: (c) => { drawPick(c, 30, 30); drawNugget(c, 40, 48, 8, '#a8aaad'); drawNugget(c, 52, 42, 6, '#a8aaad'); },
  forging: (c) => forge(c, 1), ironcasting: (c) => forge(c, 2), blastfurnace: (c) => forge(c, 3),
  scalemail: (c) => drawArmor(c, 0), chainmail: (c) => drawArmor(c, 1), platemail: (c) => drawArmor(c, 2),
  scalebarding: (c) => drawHorseHead(c, 0), chainbarding: (c) => drawHorseHead(c, 1), platebarding: (c) => drawHorseHead(c, 2),
  fletching: (c) => drawArrow(c, 12, 52, 50, 14),
  bodkin: (c) => { drawArrow(c, 10, 50, 44, 16); drawArrow(c, 20, 56, 54, 22); },
  bracer: (c) => { P(c, [[14, 22], [50, 22], [46, 44], [18, 44]], '#8a5a30', '#2a1a0a', 2); for (let x = 20; x < 46; x += 6) L(c, [[x, 24], [x, 42]], 1.5, '#c9a060'); },
  paddedarcher: (c) => { P(c, [[20, 12], [44, 12], [48, 52], [16, 52]], '#8a7a50', '#2a1a0a', 1.5); for (let y = 18; y < 52; y += 6) L(c, [[18, y], [46, y]], 1, 'rgba(0,0,0,0.35)'); },
  leatherarcher: (c) => { P(c, [[20, 12], [44, 12], [48, 52], [16, 52]], '#6a4424', '#2a1a0a', 1.5); L(c, [[20, 30], [44, 30]], 3, '#3a2410'); },
  ringarcher: (c) => { P(c, [[20, 12], [44, 12], [48, 52], [16, 52]], '#7a8088', '#222', 1.5); for (let y = 16; y < 52; y += 4) for (let x = 20; x < 46; x += 4) C(c, x, y, 1.3, null, '#333', 0.8); },
};
function forge(c, lvl) {
  P(c, [[14, 40], [50, 40], [46, 48], [40, 48], [40, 56], [24, 56], [24, 48], [18, 48]], '#4a4c52', '#111', 1.5);
  L(c, [[40, 12], [22, 32]], 4, '#8a5a30');
  P(c, [[36, 8], [48, 14], [44, 22], [32, 16]], steelGrad(c, 32, 8, 48, 22), '#222', 1);
  for (let i = 0; i < lvl; i++) { c.fillStyle = ['#ffcc40', '#ff8a20', '#ff4a10'][i]; c.beginPath(); c.arc(12 + i * 6, 30 - i * 3, 4, 0, TAU); c.fill(); }
}

export function techIcon(id, pc) {
  const t = TECHS[id];
  if (t && t.fx && t.fx.line) {
    const [line, tier] = t.fx.line;
    const type = LINES[line][tier];
    return mk(`tu|${id}|${pc.main}`, (ctx) => {
      frame(ctx, '#3c3a52');
      portrait(ctx, UNITS[type], pc);
      upArrow(ctx);
    });
  }
  return mk(`t|${id}`, (ctx) => {
    frame(ctx, t && t.ageUp ? '#4a3c24' : '#3c3a52');
    const g = TECH_GLYPH[id];
    if (g) { ctx.save(); g(ctx); ctx.restore(); }
  });
}

export function resIcon(res, size = 64) {
  return mk(`r|${res}|${size}`, (ctx) => {
    ctx.save();
    ctx.scale(SZ / 64, SZ / 64);
    switch (res) {
      case 'food':
        C(ctx, 26, 36, 17, '#b8482e', '#4a1a0e', 2); C(ctx, 22, 31, 7, 'rgba(255,200,170,0.35)');
        L(ctx, [[38, 26], [54, 12]], 7, '#efe6d0'); C(ctx, 55, 9, 4.5, '#efe6d0'); C(ctx, 58, 14, 4.5, '#efe6d0');
        break;
      case 'wood':
        for (let i = 0; i < 3; i++) {
          const y = 22 + i * 12 - (i === 2 ? 6 : 0), x = i === 2 ? 22 : 8;
          P(ctx, [[x, y - 6], [x + 40, y - 6], [x + 40, y + 6], [x, y + 6]], '#8a5a30', '#3a2410', 1.5);
          C(ctx, x + 40, y, 6.5, '#d8b07a', '#6a4a24', 1.5); C(ctx, x + 40, y, 2.5, null, '#8a6a40', 1);
        }
        break;
      case 'gold':
        drawNugget(ctx, 20, 42, 13); drawNugget(ctx, 42, 44, 12); drawNugget(ctx, 32, 24, 13, '#ffd84a');
        break;
      case 'stone':
        drawNugget(ctx, 22, 40, 15, '#9c9fa4'); drawNugget(ctx, 44, 44, 12, '#b4b7bb'); drawNugget(ctx, 34, 22, 12, '#888b90');
        break;
      case 'pop':
        C(ctx, 22, 18, 8, '#e8c49a', '#5a3a20', 1.5); P(ctx, [[10, 58], [12, 30], [32, 30], [34, 58]], '#3d6ad0', '#1a2a5a', 1.5);
        C(ctx, 44, 22, 7, '#e8c49a', '#5a3a20', 1.5); P(ctx, [[32, 58], [34, 34], [54, 34], [56, 58]], '#c04030', '#4a1a10', 1.5);
        break;
      case 'time':
        C(ctx, 32, 32, 22, '#e8dcc0', '#4a3a20', 3); L(ctx, [[32, 32], [32, 16]], 3, '#2a1a0a'); L(ctx, [[32, 32], [44, 38]], 3, '#2a1a0a');
        break;
    }
    ctx.restore();
  });
}

const CMD_GLYPH = {
  eco: (c) => { P(c, [[14, 34], [32, 18], [50, 34], [50, 54], [14, 54]], '#c9a060', '#3a2410', 2); P(c, [[10, 36], [32, 14], [54, 36]], null, '#8a3a20', 4); P(c, [[28, 42], [36, 42], [36, 54], [28, 54]], '#4a2a10'); },
  mil: (c) => { L(c, [[14, 50], [48, 14]], 5, '#d8dde2'); L(c, [[18, 38], [28, 48]], 4, '#8a6a30'); L(c, [[50, 50], [16, 14]], 5, '#d8dde2'); L(c, [[46, 38], [36, 48]], 4, '#8a6a30'); },
  stop: (c) => { const pts = []; for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + TAU / 16; pts.push([32 + Math.cos(a) * 22, 32 + Math.sin(a) * 22]); } P(c, pts, '#b8302a', '#fff', 2.5); L(c, [[20, 32], [44, 32]], 5, '#fff'); },
  delete: (c) => { C(c, 32, 32, 22, '#5a1a14', '#e04a3a', 3); L(c, [[20, 20], [44, 44]], 6, '#ff6a5a'); L(c, [[44, 20], [20, 44]], 6, '#ff6a5a'); },
  back: (c) => { P(c, [[12, 32], [30, 14], [30, 24], [52, 24], [52, 40], [30, 40], [30, 50]], '#d8c890', '#4a3a1a', 2); },
  attackmove: (c) => { L(c, [[12, 52], [40, 24]], 5, '#d8dde2'); L(c, [[16, 40], [26, 50]], 4, '#8a6a30'); P(c, [[38, 12], [56, 12], [56, 30]], '#e8c040', '#5a4010', 1.5); L(c, [[36, 32], [54, 14]], 3, '#e8c040'); },
  bell: (c) => { P(c, [[20, 44], [22, 26], [32, 16], [42, 26], [44, 44]], '#d0a840', '#5a4010', 2); P(c, [[14, 44], [50, 44], [50, 48], [14, 48]], '#b89030', '#5a4010', 1.5); C(c, 32, 52, 4, '#8a6a20'); L(c, [[32, 10], [32, 16]], 3, '#5a4010'); },
  allclear: (c) => { P(c, [[20, 44], [22, 26], [32, 16], [42, 26], [44, 44]], '#8a9aa8', '#2a3440', 2); P(c, [[14, 44], [50, 44], [50, 48], [14, 48]], '#6a7a88', '#2a3440', 1.5); L(c, [[12, 54], [52, 10]], 4, '#d04030'); },
  ungarrison: (c) => { P(c, [[10, 20], [30, 20], [30, 54], [10, 54]], '#8a8478', '#2a2a2a', 2); P(c, [[28, 30], [44, 30], [44, 22], [58, 37], [44, 52], [44, 44], [28, 44]], '#6fd04a', '#1d4a10', 1.5); },
  garrison: (c) => { P(c, [[34, 20], [54, 20], [54, 54], [34, 54]], '#8a8478', '#2a2a2a', 2); P(c, [[6, 30], [22, 30], [22, 22], [36, 37], [22, 52], [22, 44], [6, 44]], '#e8c040', '#5a4010', 1.5); },
  buy: (c) => { drawNugget(c, 22, 44, 12); P(c, [[36, 36], [44, 20], [52, 36], [47, 36], [47, 52], [41, 52], [41, 36]], '#6fd04a', '#1d4a10', 1.5); },
  sell: (c) => { drawNugget(c, 22, 44, 12); P(c, [[36, 36], [44, 52], [52, 36], [47, 36], [47, 20], [41, 20], [41, 36]], '#e05a3a', '#4a1a10', 1.5); },
  stance: (c) => { P(c, [[16, 10], [48, 10], [48, 34], [32, 54], [16, 34]], '#4a6aa0', '#1a2a4a', 2); L(c, [[24, 30], [40, 30]], 4, '#fff'); },
};

export function cmdIcon(name, res) {
  return mk(`c|${name}|${res || ''}`, (ctx) => {
    frame(ctx, name === 'delete' ? '#4a2a2a' : '#3a3a3a');
    ctx.save();
    CMD_GLYPH[name] && CMD_GLYPH[name](ctx);
    ctx.restore();
    if (res) {
      // small resource glyph in the corner
      ctx.save(); ctx.translate(2, 2); ctx.scale(0.42, 0.42);
      const tmp = { food: '#b8482e', wood: '#8a5a30', stone: '#9c9fa4' }[res];
      if (res === 'wood') { for (let i = 0; i < 2; i++) { P(ctx, [[4, 14 + i * 16], [44, 14 + i * 16], [44, 26 + i * 16], [4, 26 + i * 16]], tmp, '#222', 2); C(ctx, 44, 20 + i * 16, 6, '#d8b07a'); } }
      else if (res === 'food') { C(ctx, 26, 30, 18, tmp, '#222', 2); L(ctx, [[40, 20], [56, 6]], 8, '#efe6d0'); }
      else drawNugget(ctx, 28, 30, 18, tmp);
      ctx.restore();
    }
  });
}

// ---------------------------------------------------------------------------
// Cursors
// ---------------------------------------------------------------------------
const curCache = new Map();
export function cursor(name) {
  let css = curCache.get(name);
  if (css) return css;
  const c = document.createElement('canvas');
  c.width = 32; c.height = 32;
  const ctx = c.getContext('2d');
  let hx = 2, hy = 2;
  switch (name) {
    case 'default':
      P(ctx, [[2, 2], [2, 24], [8, 18], [13, 29], [17, 27], [12, 17], [21, 17]], '#f0d890', '#2a1a08', 1.8);
      P(ctx, [[4, 6], [4, 19], [8, 15]], 'rgba(255,255,255,0.6)');
      break;
    case 'attack':
      L(ctx, [[4, 4], [24, 24]], 3.5, '#e8ecef'); L(ctx, [[4, 4], [24, 24]], 1, '#7a8088');
      L(ctx, [[18, 26], [26, 18]], 3, '#8a6a30'); L(ctx, [[23, 23], [29, 29]], 3.5, '#5a3a18');
      P(ctx, [[2, 2], [8, 3], [3, 8]], '#fff');
      hx = 3; hy = 3;
      break;
    case 'wood':
      ctx.translate(-2, 2); drawAxe(ctx, 16, 14, 0.62, false); hx = 12; hy = 6;
      break;
    case 'mine':
      drawPick(ctx, 16, 16, 0.6); hx = 10; hy = 6;
      break;
    case 'food':
      P(ctx, [[6, 12], [26, 12], [23, 28], [9, 28]], '#b08a50', '#3a2410', 1.5);
      for (let x = 9; x < 25; x += 4) L(ctx, [[x, 13], [x - 1, 27]], 1, '#6a4a24');
      C(ctx, 12, 10, 3, '#c42a48'); C(ctx, 18, 9, 3, '#8e1e3a'); C(ctx, 22, 11, 3, '#c42a48');
      hx = 16; hy = 16;
      break;
    case 'build':
      L(ctx, [[6, 28], [20, 12]], 3.5, '#8a5a30');
      P(ctx, [[14, 4], [28, 12], [24, 18], [10, 10]], steelGrad(ctx, 10, 4, 28, 18), '#222', 1.2);
      hx = 18; hy = 8;
      break;
    case 'garrison':
      P(ctx, [[8, 8], [24, 8], [24, 28], [8, 28]], '#a8a296', '#2a2a2a', 1.5);
      for (let x = 8; x < 24; x += 6) ctx.fillStyle = '#2a2a2a', ctx.fillRect(x, 4, 4, 4);
      P(ctx, [[13, 18], [19, 18], [19, 28], [13, 28]], '#3a2410');
      hx = 16; hy = 16;
      break;
    case 'target':
      C(ctx, 16, 16, 11, null, '#f0d890', 2.5); C(ctx, 16, 16, 4, null, '#f0d890', 2);
      L(ctx, [[16, 1], [16, 8]], 2, '#f0d890'); L(ctx, [[16, 24], [16, 31]], 2, '#f0d890'); L(ctx, [[1, 16], [8, 16]], 2, '#f0d890'); L(ctx, [[24, 16], [31, 16]], 2, '#f0d890');
      hx = 16; hy = 16;
      break;
    case 'convert':
      L(ctx, [[16, 2], [16, 30]], 3, '#f0d890'); L(ctx, [[7, 10], [25, 10]], 3, '#f0d890'); C(ctx, 16, 10, 4, null, '#fff', 1.5);
      hx = 16; hy = 10;
      break;
    case 'heal':
      P(ctx, [[12, 4], [20, 4], [20, 12], [28, 12], [28, 20], [20, 20], [20, 28], [12, 28], [12, 20], [4, 20], [4, 12], [12, 12]], '#6fd04a', '#1d4a10', 1.5);
      hx = 16; hy = 16;
      break;
  }
  css = `url(${c.toDataURL()}) ${hx} ${hy}, auto`;
  curCache.set(name, css);
  return css;
}
