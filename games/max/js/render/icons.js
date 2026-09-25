// Procedurally drawn UI icons (portraits, technologies, commands, resources).
import { unitSprite } from './art_units.js';
import { buildingSprite, farmSprite } from './art_buildings.js';
import { makeCanvas, SS } from './draw3d.js';
import { PLAYER_COLORS } from '../core/data.js';

const cache = new Map();
const S = 64;

function bg(ctx, c1, c2) {
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, c1); g.addColorStop(1, c2);
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  const v = ctx.createRadialGradient(S * 0.45, S * 0.35, 4, S / 2, S / 2, S * 0.75);
  v.addColorStop(0, 'rgba(255,255,255,0.18)'); v.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, S, S);
}
function fitSprite(ctx, s, scaleMax = 1.9, yBias = 0.56) {
  const w = s.canvas.width / SS, h = s.canvas.height / SS;
  const k = Math.min(scaleMax, (S - 8) / w, (S - 8) / h);
  const dx = (S - w * k) / 2, dy = (S - h * k) / 2 + (yBias - 0.5) * 8;
  ctx.drawImage(s.canvas, dx, dy, w * k, h * k);
}
function stroke(ctx, w, c) { ctx.lineWidth = w; ctx.strokeStyle = c; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); }
function fill(ctx, c) { ctx.fillStyle = c; ctx.fill(); }
function tier(ctx, n) {
  if (!n) return;
  const txt = ['I', 'II', 'III', 'IV'][n - 1];
  ctx.font = 'bold 13px Georgia, serif'; ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillText(txt, S - 4, S - 4);
  ctx.fillStyle = '#ffe08a'; ctx.fillText(txt, S - 5, S - 5);
}

// ---- glyph painters (64x64 space)
const G = {
  sword(ctx, x = 32, y = 32, a = -0.8, len = 40, col = '#dfe4ea') {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(-3, -len / 2 + 8); ctx.lineTo(0, -len / 2); ctx.lineTo(3, -len / 2 + 8); ctx.lineTo(2.5, len / 2 - 10); ctx.lineTo(-2.5, len / 2 - 10); ctx.closePath();
    fill(ctx, col); stroke(ctx, 1, '#4a4e56');
    ctx.fillStyle = '#c8a040'; ctx.fillRect(-8, len / 2 - 11, 16, 3.5);
    ctx.fillStyle = '#5a3a20'; ctx.fillRect(-2, len / 2 - 8, 4, 8);
    ctx.fillStyle = '#c8a040'; ctx.beginPath(); ctx.arc(0, len / 2 + 1, 3, 0, 7); ctx.fill();
    ctx.restore();
  },
  axe(ctx, x = 32, y = 34, a = 0.4) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(0, 22); stroke(ctx, 4, '#7a5230');
    ctx.beginPath(); ctx.moveTo(-1, -20); ctx.quadraticCurveTo(14, -24, 16, -10); ctx.quadraticCurveTo(10, -8, -1, -8); ctx.closePath();
    fill(ctx, '#c8ccd2'); stroke(ctx, 1, '#50545a');
    ctx.restore();
  },
  pick(ctx, x = 32, y = 34, a = 0.5) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(0, 22); stroke(ctx, 4, '#7a5230');
    ctx.beginPath(); ctx.moveTo(-18, -12); ctx.quadraticCurveTo(0, -24, 18, -12); stroke(ctx, 4, '#b8bcc2');
    ctx.restore();
  },
  arrow(ctx, x1, y1, x2, y2, col = '#8a6030') {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); stroke(ctx, 2.6, col);
    const a = Math.atan2(y2 - y1, x2 - x1);
    ctx.save(); ctx.translate(x2, y2); ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(-5, -4.5); ctx.lineTo(-5, 4.5); ctx.closePath(); fill(ctx, '#c8ccd2');
    ctx.restore();
    ctx.save(); ctx.translate(x1, y1); ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-6, -4); ctx.moveTo(0, 0); ctx.lineTo(-6, 4); ctx.moveTo(4, 0); ctx.lineTo(-2, -4); ctx.moveTo(4, 0); ctx.lineTo(-2, 4); stroke(ctx, 1.6, '#e8e0d0');
    ctx.restore();
  },
  shield(ctx, x = 32, y = 32, r = 18, c = '#b83a2a') {
    ctx.beginPath(); ctx.moveTo(x - r, y - r * 0.8); ctx.lineTo(x + r, y - r * 0.8); ctx.lineTo(x + r * 0.95, y + r * 0.1); ctx.quadraticCurveTo(x + r * 0.7, y + r * 0.9, x, y + r * 1.15); ctx.quadraticCurveTo(x - r * 0.7, y + r * 0.9, x - r * 0.95, y + r * 0.1); ctx.closePath();
    fill(ctx, c); stroke(ctx, 2.2, '#e8d27a');
  },
  chest(ctx, c = '#b8bec6', x = 32, y = 33) {
    ctx.beginPath(); ctx.moveTo(x - 16, y - 16); ctx.lineTo(x - 7, y - 20); ctx.quadraticCurveTo(x, y - 14, x + 7, y - 20); ctx.lineTo(x + 16, y - 16); ctx.lineTo(x + 13, y - 2); ctx.lineTo(x + 12, y + 18); ctx.lineTo(x - 12, y + 18); ctx.lineTo(x - 13, y - 2); ctx.closePath();
    fill(ctx, c); stroke(ctx, 1.5, '#3a3a40');
    ctx.beginPath(); ctx.moveTo(x, y - 12); ctx.lineTo(x, y + 16); stroke(ctx, 1, 'rgba(0,0,0,0.35)');
  },
  horse(ctx, c = '#8a5a32', x = 32, y = 34) {
    ctx.beginPath(); ctx.moveTo(x - 6, y + 20); ctx.lineTo(x - 8, y - 2); ctx.quadraticCurveTo(x - 10, y - 18, x + 2, y - 22); ctx.lineTo(x + 6, y - 26); ctx.lineTo(x + 8, y - 20);
    ctx.quadraticCurveTo(x + 18, y - 12, x + 20, y - 4); ctx.lineTo(x + 16, y); ctx.lineTo(x + 8, y - 6); ctx.quadraticCurveTo(x + 6, y + 6, x + 12, y + 20); ctx.closePath();
    fill(ctx, c); stroke(ctx, 1.5, '#2a1a10');
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x + 9, y - 12, 1.6, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 6, y - 16); ctx.quadraticCurveTo(x - 12, y - 4, x - 10, y + 12); stroke(ctx, 3, '#2a1a10');
  },
  wheat(ctx, x = 32, y = 36) {
    for (const dx of [-8, 0, 8]) {
      ctx.beginPath(); ctx.moveTo(x + dx * 0.4, y + 20); ctx.lineTo(x + dx, y - 10); stroke(ctx, 1.6, '#a88a3a');
      for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.ellipse(x + dx + (k % 2 ? 2.5 : -2.5), y - 12 + k * 5, 2.2, 3.6, k % 2 ? 0.5 : -0.5, 0, 7); fill(ctx, '#e8c860'); }
    }
  },
  nugget(ctx, x, y, r, c1 = '#f2cc40', c2 = '#b8901a') {
    ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x - r * 0.5, y - r * 0.8); ctx.lineTo(x + r * 0.6, y - r * 0.7); ctx.lineTo(x + r, y + r * 0.1); ctx.lineTo(x + r * 0.4, y + r * 0.8); ctx.lineTo(x - r * 0.6, y + r * 0.7); ctx.closePath();
    const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r); g.addColorStop(0, c1); g.addColorStop(1, c2);
    ctx.fillStyle = g; ctx.fill(); stroke(ctx, 1, 'rgba(0,0,0,0.5)');
  },
  log(ctx, x, y, len, a = 0) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = '#7a5230'; ctx.fillRect(-len / 2, -5, len, 10);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-len / 2, 2, len, 3);
    ctx.fillStyle = '#d8b080'; ctx.beginPath(); ctx.ellipse(len / 2, 0, 3, 5, 0, 0, 7); ctx.fill(); stroke(ctx, 1, '#6a4020');
    ctx.restore();
  },
  roman(ctx, n, col = '#ffe08a') {
    ctx.font = 'bold 26px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(n, 33, 35);
    ctx.fillStyle = col; ctx.fillText(n, 32, 33);
    ctx.textBaseline = 'alphabetic';
  },
};

const TECH_DRAW = {
  age1: (c) => { bg(c, '#3a5a8a', '#1a2a4a'); G.shield(c, 32, 30, 20, '#2f5fb0'); G.roman(c, 'II'); },
  age2: (c) => { bg(c, '#6a4a8a', '#2a1a4a'); G.shield(c, 32, 30, 20, '#7a3aa0'); G.roman(c, 'III'); },
  age3: (c) => { bg(c, '#8a6a2a', '#3a2a0a'); G.shield(c, 32, 30, 20, '#b8902a'); G.roman(c, 'IV', '#fff4c0'); },
  loom: (c) => { bg(c, '#6a8a4a', '#2a3a1a'); c.beginPath(); c.ellipse(32, 32, 10, 18, 0, 0, 7); fill(c, '#d8c8a0'); for (let k = -14; k <= 14; k += 4) { c.beginPath(); c.moveTo(22, 32 + k); c.lineTo(42, 32 + k * 0.9); stroke(c, 1, '#8a6a3a'); } c.beginPath(); c.moveTo(32, 8); c.lineTo(32, 56); stroke(c, 3, '#6a4a2a'); },
  wheelbarrow: (c) => { bg(c, '#6a8a4a', '#2a3a1a'); c.beginPath(); c.moveTo(12, 26); c.lineTo(44, 26); c.lineTo(38, 40); c.lineTo(18, 40); c.closePath(); fill(c, '#8a6038'); stroke(c, 1.5, '#3a2412'); c.beginPath(); c.arc(26, 46, 7, 0, 7); fill(c, '#5a3a20'); stroke(c, 1.5, '#2a1a0a'); c.beginPath(); c.moveTo(44, 28); c.lineTo(56, 34); stroke(c, 3, '#6a4020'); G.nugget(c, 30, 22, 7); },
  handcart: (c) => { bg(c, '#6a8a4a', '#2a3a1a'); c.beginPath(); c.rect(12, 22, 34, 16); fill(c, '#8a6038'); stroke(c, 1.5, '#3a2412'); for (const x of [20, 40]) { c.beginPath(); c.arc(x, 44, 7, 0, 7); fill(c, '#5a3a20'); stroke(c, 1.5, '#2a1a0a'); } c.beginPath(); c.moveTo(46, 26); c.lineTo(58, 20); stroke(c, 3, '#6a4020'); G.log(c, 29, 18, 26); },
  townwatch: (c) => { bg(c, '#4a6a8a', '#1a2a3a'); c.beginPath(); c.ellipse(32, 32, 20, 11, 0, 0, 7); fill(c, '#f0ead8'); c.beginPath(); c.arc(32, 32, 8, 0, 7); fill(c, '#3a6aa0'); c.beginPath(); c.arc(32, 32, 3.5, 0, 7); fill(c, '#111'); c.beginPath(); c.ellipse(32, 32, 20, 11, 0, 0, 7); stroke(c, 2, '#2a1a0a'); },
  horsecollar: (c) => { bg(c, '#8a7a3a', '#3a2a0a'); c.beginPath(); c.ellipse(32, 30, 16, 20, 0, 0, 7); stroke(c, 7, '#7a4a24'); c.beginPath(); c.ellipse(32, 30, 16, 20, 0, 0, 7); stroke(c, 2, '#d8b060'); tier(c, 1); },
  heavyplow: (c) => { bg(c, '#8a7a3a', '#3a2a0a'); c.beginPath(); c.moveTo(10, 20); c.lineTo(40, 40); stroke(c, 4, '#7a5230'); c.beginPath(); c.moveTo(36, 36); c.lineTo(54, 36); c.lineTo(46, 52); c.closePath(); fill(c, '#a8acb2'); stroke(c, 1.5, '#3a3a40'); tier(c, 2); },
  croprotation: (c) => { bg(c, '#8a7a3a', '#3a2a0a'); G.wheat(c); c.beginPath(); c.arc(32, 32, 24, 0.3, 5.9); stroke(c, 2, 'rgba(255,255,255,0.6)'); tier(c, 3); },
  axe1: (c) => { bg(c, '#5a7a3a', '#1a2a0a'); G.axe(c); tier(c, 1); },
  axe2: (c) => { bg(c, '#5a7a3a', '#1a2a0a'); G.axe(c, 26, 34, 0.3); G.axe(c, 38, 34, -0.3); tier(c, 2); },
  axe3: (c) => { bg(c, '#5a7a3a', '#1a2a0a'); c.beginPath(); c.moveTo(8, 30); c.lineTo(56, 30); stroke(c, 3, '#6a4020'); for (let x = 12; x < 54; x += 5) { c.beginPath(); c.moveTo(x, 30); c.lineTo(x + 2.5, 38); c.lineTo(x + 5, 30); fill(c, '#c8ccd2'); } tier(c, 3); },
  gold1: (c) => { bg(c, '#8a6a1a', '#3a2a08'); G.pick(c); G.nugget(c, 42, 46, 9); tier(c, 1); },
  gold2: (c) => { bg(c, '#8a6a1a', '#3a2a08'); G.pick(c, 28, 30); G.nugget(c, 40, 46, 9); G.nugget(c, 24, 50, 6); tier(c, 2); },
  stone1: (c) => { bg(c, '#6a6a6a', '#2a2a2a'); G.pick(c); G.nugget(c, 42, 46, 9, '#c8c4bc', '#6a6660'); tier(c, 1); },
  stone2: (c) => { bg(c, '#6a6a6a', '#2a2a2a'); G.pick(c, 28, 30); G.nugget(c, 40, 46, 9, '#c8c4bc', '#6a6660'); G.nugget(c, 24, 50, 6, '#c8c4bc', '#6a6660'); tier(c, 2); },
  forge1: (c) => { bg(c, '#8a3a2a', '#3a0a08'); G.sword(c, 32, 30, -0.7); tier(c, 1); },
  forge2: (c) => { bg(c, '#8a3a2a', '#3a0a08'); G.sword(c, 28, 30, -0.6); G.sword(c, 38, 30, 0.6); tier(c, 2); },
  forge3: (c) => { bg(c, '#a84a1a', '#3a0a08'); c.beginPath(); c.arc(32, 36, 16, 0, 7); const g = c.createRadialGradient(32, 36, 2, 32, 36, 16); g.addColorStop(0, '#fff0a0'); g.addColorStop(1, 'rgba(255,90,20,0)'); c.fillStyle = g; c.fill(); G.sword(c, 32, 30, -0.7); tier(c, 3); },
  infarmor1: (c) => { bg(c, '#6a5a4a', '#2a1a0a'); G.chest(c, '#9a7a4a'); tier(c, 1); },
  infarmor2: (c) => { bg(c, '#6a5a4a', '#2a1a0a'); G.chest(c, '#a8acb2'); for (let y = 18; y < 50; y += 4) { c.beginPath(); c.moveTo(20, y); c.lineTo(44, y); stroke(c, 0.6, 'rgba(0,0,0,0.35)'); } tier(c, 2); },
  infarmor3: (c) => { bg(c, '#6a5a4a', '#2a1a0a'); G.chest(c, '#dde2e8'); tier(c, 3); },
  cavarmor1: (c) => { bg(c, '#5a4a6a', '#1a0a2a'); G.horse(c, '#8a5a32'); tier(c, 1); },
  cavarmor2: (c) => { bg(c, '#5a4a6a', '#1a0a2a'); G.horse(c, '#9a9ea6'); tier(c, 2); },
  cavarmor3: (c) => { bg(c, '#5a4a6a', '#1a0a2a'); G.horse(c, '#dde2e8'); tier(c, 3); },
  arrow1: (c) => { bg(c, '#4a6a3a', '#1a2a0a'); G.arrow(c, 12, 52, 52, 12); tier(c, 1); },
  arrow2: (c) => { bg(c, '#4a6a3a', '#1a2a0a'); G.arrow(c, 8, 48, 46, 10); G.arrow(c, 18, 56, 56, 18); tier(c, 2); },
  arrow3: (c) => { bg(c, '#4a6a3a', '#1a2a0a'); c.beginPath(); c.moveTo(14, 20); c.lineTo(50, 20); c.lineTo(50, 40); c.lineTo(14, 40); c.closePath(); fill(c, '#8a5a32'); stroke(c, 1.5, '#3a2412'); G.arrow(c, 10, 52, 54, 12); tier(c, 3); },
  archarmor1: (c) => { bg(c, '#6a5a3a', '#2a1a0a'); G.chest(c, '#b8a070'); tier(c, 1); },
  archarmor2: (c) => { bg(c, '#6a5a3a', '#2a1a0a'); G.chest(c, '#8a5a30'); tier(c, 2); },
  archarmor3: (c) => { bg(c, '#6a5a3a', '#2a1a0a'); G.chest(c, '#8a8e96'); for (let y = 18; y < 50; y += 5) for (let x = 20; x < 46; x += 5) { c.beginPath(); c.arc(x, y, 1.6, 0, 7); stroke(c, 0.6, 'rgba(0,0,0,0.4)'); } tier(c, 3); },
  thumbring: (c) => { bg(c, '#4a6a3a', '#1a2a0a'); c.beginPath(); c.arc(32, 32, 14, 0, 7); stroke(c, 6, '#d8b640'); c.beginPath(); c.arc(32, 32, 14, 0, 7); stroke(c, 1.5, '#7a5a10'); },
  bloodlines: (c) => { bg(c, '#8a2a2a', '#2a0a0a'); G.horse(c, '#6a3a1a'); c.fillStyle = '#ff4a4a'; c.font = 'bold 20px Georgia'; c.fillText('+', 50, 20); },
  husbandry: (c) => { bg(c, '#5a4a3a', '#1a0a0a'); c.beginPath(); c.arc(32, 32, 16, 0.6, Math.PI * 2 - 0.6 + Math.PI * 0.001); stroke(c, 7, '#8a8e96'); for (let k = 0; k < 6; k++) { const a = 0.9 + k * 0.9; c.beginPath(); c.arc(32 + Math.cos(a) * 16, 32 + Math.sin(a) * 16, 1.4, 0, 7); fill(c, '#222'); } },
  masonry: (c) => { bg(c, '#6a6a6a', '#2a2a2a'); for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) { c.fillStyle = r % 2 ? '#a8a49a' : '#b8b4aa'; c.fillRect(8 + k * 16 + (r % 2) * 8, 12 + r * 10, 14, 8); } },
  architecture: (c) => { bg(c, '#6a6a7a', '#2a2a3a'); c.fillStyle = '#e8e2d2'; c.fillRect(12, 14, 40, 6); c.fillRect(12, 48, 40, 5); for (const x of [16, 28, 40]) c.fillRect(x, 20, 7, 28); },
  crane: (c) => { bg(c, '#6a5a3a', '#2a1a0a'); c.beginPath(); c.moveTo(18, 56); c.lineTo(18, 10); c.lineTo(52, 18); stroke(c, 4, '#7a5230'); c.beginPath(); c.moveTo(48, 17); c.lineTo(48, 40); stroke(c, 1.2, '#e8e0d0'); c.fillStyle = '#9a968e'; c.fillRect(42, 40, 12, 9); },
  ballistics: (c) => { bg(c, '#4a6a3a', '#1a2a0a'); for (const [r, col] of [[20, '#e8dcb0'], [14, '#b83a2a'], [8, '#e8dcb0'], [3, '#b83a2a']]) { c.beginPath(); c.arc(32, 32, r, 0, 7); fill(c, col); } G.arrow(c, 8, 10, 30, 30); },
  chemistry: (c) => { bg(c, '#3a5a6a', '#0a1a2a'); c.beginPath(); c.moveTo(26, 10); c.lineTo(38, 10); c.lineTo(38, 26); c.lineTo(50, 52); c.lineTo(14, 52); c.lineTo(26, 26); c.closePath(); fill(c, 'rgba(200,230,255,0.5)'); stroke(c, 2, '#e8f0ff'); c.beginPath(); c.moveTo(19, 42); c.lineTo(45, 42); c.lineTo(50, 52); c.lineTo(14, 52); c.closePath(); fill(c, '#5ad85a'); },
  fervor: (c) => { bg(c, '#6a5a2a', '#2a1a0a'); c.beginPath(); c.ellipse(30, 38, 12, 18, 0.4, 0, 7); fill(c, '#8a6038'); for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(44, 20 + k * 8); c.lineTo(58, 20 + k * 8); stroke(c, 2, '#fff'); } },
  sanctity: (c) => { bg(c, '#6a5a2a', '#2a1a0a'); c.beginPath(); c.ellipse(32, 18, 16, 5, 0, 0, 7); stroke(c, 3, '#ffe890'); c.beginPath(); c.arc(32, 38, 12, 0, 7); fill(c, '#e0b890'); },
  illumination: (c) => { bg(c, '#3a2a5a', '#0a0a1a'); c.fillStyle = '#e8e0c8'; c.fillRect(26, 28, 12, 24); const g = c.createRadialGradient(32, 20, 1, 32, 20, 14); g.addColorStop(0, '#fff8c0'); g.addColorStop(1, 'rgba(255,180,40,0)'); c.fillStyle = g; c.fillRect(14, 4, 36, 32); c.beginPath(); c.ellipse(32, 22, 3, 6, 0, 0, 7); fill(c, '#ffd040'); },
  hoardings: (c) => { bg(c, '#5a5a5a', '#1a1a1a'); c.fillStyle = '#9a968e'; c.fillRect(14, 26, 36, 30); c.fillStyle = '#7a5230'; c.fillRect(10, 16, 44, 12); c.fillStyle = '#5a3a20'; for (let x = 12; x < 54; x += 8) c.fillRect(x, 16, 3, 12); },
  conscription: (c) => { bg(c, '#8a2a2a', '#2a0a0a'); c.beginPath(); c.moveTo(20, 56); c.lineTo(20, 8); stroke(c, 3, '#5a3a20'); c.beginPath(); c.moveTo(21, 10); c.lineTo(50, 16); c.lineTo(21, 30); c.closePath(); fill(c, '#d8b640'); c.fillStyle = '#fff'; c.font = 'bold 22px Georgia'; c.fillText('+', 44, 50); },
};

const CMD_DRAW = {
  stop: (c) => { bg(c, '#6a2a2a', '#2a0a0a'); c.beginPath(); for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + Math.PI / 8; c.lineTo(32 + Math.cos(a) * 20, 32 + Math.sin(a) * 20); } c.closePath(); fill(c, '#c83a2a'); stroke(c, 2, '#fff'); c.fillStyle = '#fff'; c.fillRect(22, 29, 20, 6); },
  garrison: (c) => { bg(c, '#3a4a6a', '#0a1a2a'); c.fillStyle = '#9a968e'; c.fillRect(20, 20, 24, 34); c.fillStyle = '#5a5650'; for (let x = 20; x < 44; x += 8) c.fillRect(x, 14, 5, 8); c.fillStyle = '#2a1a10'; c.fillRect(28, 38, 8, 16); G.arrow(c, 32, 6, 32, 36, '#e8e8e8'); },
  ungarrison: (c) => { bg(c, '#3a4a6a', '#0a1a2a'); c.fillStyle = '#9a968e'; c.fillRect(20, 20, 24, 34); c.fillStyle = '#5a5650'; for (let x = 20; x < 44; x += 8) c.fillRect(x, 14, 5, 8); c.fillStyle = '#2a1a10'; c.fillRect(28, 38, 8, 16); G.arrow(c, 32, 40, 54, 56, '#e8e8e8'); },
  bell: (c) => { bg(c, '#8a6a1a', '#2a1a0a'); c.beginPath(); c.moveTo(18, 44); c.quadraticCurveTo(20, 16, 32, 14); c.quadraticCurveTo(44, 16, 46, 44); c.closePath(); fill(c, '#d8b640'); stroke(c, 2, '#6a4a10'); c.beginPath(); c.arc(32, 48, 4, 0, 7); fill(c, '#8a6a1a'); },
  allclear: (c) => { bg(c, '#3a6a3a', '#0a2a0a'); c.beginPath(); c.moveTo(18, 44); c.quadraticCurveTo(20, 16, 32, 14); c.quadraticCurveTo(44, 16, 46, 44); c.closePath(); fill(c, '#a8a8a8'); stroke(c, 2, '#3a3a3a'); c.beginPath(); c.moveTo(14, 34); c.lineTo(28, 48); c.lineTo(52, 18); stroke(c, 5, '#5aff5a'); },
  delete: (c) => { bg(c, '#6a2a2a', '#2a0a0a'); c.beginPath(); c.moveTo(18, 18); c.lineTo(46, 46); c.moveTo(46, 18); c.lineTo(18, 46); stroke(c, 7, '#ff5a4a'); },
  repair: (c) => { bg(c, '#6a5a3a', '#2a1a0a'); c.save(); c.translate(32, 32); c.rotate(-0.7); c.fillStyle = '#7a5230'; c.fillRect(-2.5, -6, 5, 28); c.fillStyle = '#5a5e66'; c.fillRect(-11, -14, 22, 10); c.restore(); },
  buildEco: (c) => { bg(c, '#5a6a3a', '#1a2a0a'); c.beginPath(); c.moveTo(12, 30); c.lineTo(32, 14); c.lineTo(52, 30); c.closePath(); fill(c, '#b89448'); stroke(c, 1.5, '#5a3a1a'); c.fillStyle = '#e6d8b2'; c.fillRect(17, 30, 30, 22); c.fillStyle = '#4a2e16'; c.fillRect(28, 38, 8, 14); },
  buildMil: (c) => { bg(c, '#6a3a2a', '#2a0a0a'); c.fillStyle = '#9a968e'; c.fillRect(14, 22, 36, 32); c.fillStyle = '#6a6660'; for (let x = 14; x < 50; x += 9) c.fillRect(x, 15, 6, 9); c.fillStyle = '#2a1a10'; c.fillRect(27, 38, 10, 16); G.sword(c, 44, 22, 0.6, 26); },
  back: (c) => { bg(c, '#4a4a4a', '#1a1a1a'); c.beginPath(); c.moveTo(42, 14); c.lineTo(20, 32); c.lineTo(42, 50); stroke(c, 7, '#e8e0c8'); },
  attackmove: (c) => { bg(c, '#6a2a2a', '#2a0a0a'); G.sword(c, 30, 30, -0.8, 34); G.arrow(c, 16, 50, 52, 40, '#e8e0c8'); },
  buy: (c) => { bg(c, '#3a6a3a', '#0a2a0a'); G.nugget(c, 22, 40, 10); c.fillStyle = '#5aff5a'; c.font = 'bold 26px Georgia'; c.fillText('+', 44, 30); },
  sell: (c) => { bg(c, '#6a3a3a', '#2a0a0a'); G.nugget(c, 22, 40, 10); c.fillStyle = '#ff6a5a'; c.font = 'bold 30px Georgia'; c.fillText('−', 44, 30); },
  townbell: (c) => CMD_DRAW.bell(c),
  formation: (c) => { bg(c, '#3a4a6a', '#0a1a2a'); for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(16 + k * 11, 20 + r * 12, 3.5, 0, 7); fill(c, '#e8e0c8'); } },
};

const RES_DRAW = {
  wood: (c) => { G.log(c, 30, 40, 40, -0.1); G.log(c, 34, 28, 38, 0.1); G.log(c, 30, 16, 30, -0.05); },
  food: (c) => {
    c.beginPath(); c.ellipse(28, 36, 18, 13, -0.4, 0, 7); fill(c, '#c8584a'); stroke(c, 2, '#5a1a10');
    c.beginPath(); c.ellipse(26, 34, 11, 7, -0.4, 0, 7); fill(c, '#e88a78');
    c.beginPath(); c.moveTo(40, 26); c.lineTo(54, 14); stroke(c, 5, '#f0e8d8'); c.beginPath(); c.arc(55, 12, 4, 0, 7); fill(c, '#f0e8d8');
  },
  gold: (c) => { G.nugget(c, 22, 40, 12); G.nugget(c, 42, 42, 11); G.nugget(c, 33, 24, 12); },
  stone: (c) => { G.nugget(c, 22, 42, 13, '#c8c4bc', '#6a6660'); G.nugget(c, 42, 42, 12, '#b8b4ac', '#5a5650'); G.nugget(c, 32, 24, 12, '#d8d4cc', '#7a7670'); },
  pop: (c) => { c.beginPath(); c.moveTo(8, 30); c.lineTo(32, 10); c.lineTo(56, 30); c.closePath(); fill(c, '#b89448'); stroke(c, 2, '#5a3a1a'); c.fillStyle = '#e6d8b2'; c.fillRect(14, 30, 36, 24); c.fillStyle = '#4a2e16'; c.fillRect(27, 38, 10, 16); stroke(c, 2, '#5a3a1a'); },
  villager: (c) => { c.beginPath(); c.arc(32, 18, 9, 0, 7); fill(c, '#e0b890'); c.beginPath(); c.moveTo(18, 58); c.lineTo(20, 32); c.quadraticCurveTo(32, 26, 44, 32); c.lineTo(46, 58); c.closePath(); fill(c, '#4a84ff'); stroke(c, 2, '#1a2a5a'); },
  military: (c) => { G.sword(c, 32, 32, -0.8, 46); },
  time: (c) => { c.beginPath(); c.arc(32, 32, 22, 0, 7); fill(c, '#e8e0c8'); stroke(c, 3, '#6a5a3a'); c.beginPath(); c.moveTo(32, 32); c.lineTo(32, 16); c.moveTo(32, 32); c.lineTo(44, 38); stroke(c, 3, '#2a1a0a'); },
  attack: (c) => { G.sword(c, 32, 32, -0.8, 46); },
  armor: (c) => { G.shield(c, 32, 30, 20, '#7a8a9a'); },
  parmor: (c) => { G.shield(c, 32, 30, 20, '#7a8a9a'); G.arrow(c, 10, 54, 36, 30); },
  range: (c) => { c.beginPath(); c.arc(14, 32, 26, -1.1, 1.1); stroke(c, 4, '#8a5a30'); c.beginPath(); c.moveTo(24, 9); c.lineTo(24, 55); stroke(c, 1.2, '#eee'); G.arrow(c, 18, 32, 58, 32); },
  los: (c) => { c.beginPath(); c.ellipse(32, 32, 24, 13, 0, 0, 7); fill(c, '#f0ead8'); c.beginPath(); c.arc(32, 32, 9, 0, 7); fill(c, '#3a6aa0'); c.beginPath(); c.arc(32, 32, 4, 0, 7); fill(c, '#111'); },
};

function make(key, fn) {
  let url = cache.get(key);
  if (url) return url;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  fn(ctx);
  url = c.toDataURL();
  cache.set(key, url);
  return url;
}

function drawUnitPortrait(ctx, type, colorIndex) {
  bg(ctx, '#5a6a7a', '#1e2630');
  const s = unitSprite(type, PLAYER_COLORS[colorIndex], 'idle', 0, 1, 0, null, null, false);
  fitSprite(ctx, s, type === 'villager' || s.canvas.width / SS < 30 ? 1.9 : 1.6);
}
export function unitIcon(type, colorIndex = 0) {
  return make(`u|${type}|${colorIndex}`, (ctx) => drawUnitPortrait(ctx, type, colorIndex));
}
export function buildingIcon(type, colorIndex = 0, style = 1) {
  return make(`b|${type}|${colorIndex}|${style}`, (ctx) => {
    bg(ctx, '#6a7a5a', '#1e2a16');
    const s = type === 'farm' ? farmSprite(1, 0) : buildingSprite(type, style, PLAYER_COLORS[colorIndex], 0, type === 'palisadeWall' || type === 'stoneWall' || type === 'palisadeGate' || type === 'gate' ? 3 : 0);
    fitSprite(ctx, s, 1.3, 0.5);
  });
}
export function techIcon(id, iconKey, colorIndex = 0) {
  if (iconKey && iconKey.startsWith('unit:')) {
    return make(`tu|${iconKey}|${colorIndex}`, (ctx) => {
      drawUnitPortrait(ctx, iconKey.slice(5), colorIndex);
      ctx.fillStyle = 'rgba(40,120,40,0.35)'; ctx.fillRect(0, 0, S, S);
      ctx.beginPath(); ctx.moveTo(44, 24); ctx.lineTo(54, 10); ctx.lineTo(64, 24); ctx.closePath(); ctx.fillStyle = '#6aff5a'; ctx.fill();
      ctx.fillRect(50.5, 22, 7, 11);
      ctx.strokeStyle = '#1a3a10'; ctx.lineWidth = 1; ctx.strokeRect(50.5, 22, 7, 11);
    });
  }
  if (iconKey && iconKey.startsWith('building:')) return buildingIcon(iconKey.slice(9), colorIndex, 2);
  const fn = TECH_DRAW[iconKey];
  return make(`t|${iconKey}`, fn || ((c) => { bg(c, '#5a5a5a', '#1a1a1a'); G.roman(c, '?'); }));
}
export function cmdIcon(key) { return make(`c|${key}`, CMD_DRAW[key] || ((c) => bg(c, '#444', '#111'))); }
export function resIcon(key) { return make(`r|${key}`, RES_DRAW[key] || (() => {})); }

// Custom cursors (data URLs) — drawn at 32x32.
export function cursorURL(kind) {
  const key = `cur|${kind}`;
  let url = cache.get(key);
  if (url) return url;
  const c = makeCanvas(32, 32);
  const ctx = c.getContext('2d');
  ctx.lineJoin = 'round';
  if (kind === 'default') {
    ctx.beginPath(); ctx.moveTo(2, 2); ctx.lineTo(2, 24); ctx.lineTo(8, 18); ctx.lineTo(12, 28); ctx.lineTo(16, 26); ctx.lineTo(12, 16); ctx.lineTo(20, 16); ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, 20, 28); g.addColorStop(0, '#fff2b0'); g.addColorStop(1, '#c89a30');
    ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#3a2408'; ctx.stroke();
  } else if (kind === 'attack') {
    ctx.save(); ctx.translate(16, 16); ctx.rotate(-0.78);
    ctx.fillStyle = '#e8ecf0'; ctx.strokeStyle = '#2a1a0a'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(3, -10); ctx.lineTo(2.5, 6); ctx.lineTo(-2.5, 6); ctx.lineTo(-3, -10); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#c8a040'; ctx.fillRect(-7, 6, 14, 3); ctx.strokeRect(-7, 6, 14, 3);
    ctx.fillStyle = '#6a3a1a'; ctx.fillRect(-1.8, 9, 3.6, 6);
    ctx.restore();
  } else if (kind === 'gather') {
    ctx.save(); ctx.translate(16, 16); ctx.rotate(0.6);
    ctx.fillStyle = '#8a5a30'; ctx.fillRect(-1.8, -13, 3.6, 28);
    ctx.beginPath(); ctx.moveTo(-1, -12); ctx.quadraticCurveTo(12, -14, 12, -3); ctx.quadraticCurveTo(6, -4, -1, -3); ctx.closePath();
    ctx.fillStyle = '#d8dce2'; ctx.fill(); ctx.strokeStyle = '#2a1a0a'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.restore();
  } else if (kind === 'build') {
    ctx.save(); ctx.translate(16, 16); ctx.rotate(-0.7);
    ctx.fillStyle = '#8a5a30'; ctx.fillRect(-1.8, -4, 3.6, 18); ctx.strokeStyle = '#2a1a0a'; ctx.strokeRect(-1.8, -4, 3.6, 18);
    ctx.fillStyle = '#7a7e86'; ctx.fillRect(-8, -11, 16, 7); ctx.strokeRect(-8, -11, 16, 7);
    ctx.restore();
  } else if (kind === 'garrison') {
    ctx.fillStyle = '#b8b4aa'; ctx.fillRect(8, 10, 16, 18); ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 1.2; ctx.strokeRect(8, 10, 16, 18);
    ctx.fillStyle = '#8a8680'; for (let x = 8; x < 24; x += 6) ctx.fillRect(x, 6, 4, 5);
    ctx.fillStyle = '#5aff5a'; ctx.beginPath(); ctx.moveTo(16, 26); ctx.lineTo(10, 18); ctx.lineTo(22, 18); ctx.closePath(); ctx.fill();
  } else if (kind === 'heal' || kind === 'convert') {
    ctx.fillStyle = kind === 'heal' ? '#5aff6a' : '#ffe060'; ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1.2;
    ctx.fillRect(12, 4, 8, 24); ctx.fillRect(4, 12, 24, 8); ctx.strokeRect(12, 4, 8, 24);
  }
  url = `url(${c.toDataURL()}) ${kind === 'default' ? '2 2' : '16 16'}, auto`;
  cache.set(key, url);
  return url;
}

// Title-screen emblem: a castle over a warm glow on a transparent background.
export function emblemURL() {
  let url = cache.get('emblem');
  if (url) return url;
  const c = makeCanvas(200, 170);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(100, 95, 8, 100, 95, 95);
  g.addColorStop(0, 'rgba(255,214,120,0.55)'); g.addColorStop(0.5, 'rgba(255,190,80,0.18)'); g.addColorStop(1, 'rgba(255,190,80,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 200, 170);
  const s = buildingSprite('castle', 2, PLAYER_COLORS[1], 0, 0);
  const w = s.canvas.width / SS, h = s.canvas.height / SS;
  const k = Math.min(180 / w, 150 / h);
  ctx.drawImage(s.canvas, (200 - w * k) / 2, (170 - h * k) / 2 + 4, w * k, h * k);
  url = c.toDataURL();
  cache.set('emblem', url);
  return url;
}
