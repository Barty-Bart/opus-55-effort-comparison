// Procedural unit art: articulated humans, horses, siege engines and animals.
// Everything is drawn once per (type, color, animation frame) into a cached canvas.
import { shade, mix, TAU, clamp } from './util.js';

export const SS = 2; // supersampling factor for crisp zoomed rendering
export const FRAMES = { idle: 1, walk: 8, attack: 8, work: 8 };

const SKIN = ['#eab98d', '#d9a273', '#c68a5a', '#f2c9a2', '#a9714a', '#e0ac80'];
const HAIR = ['#4a3020', '#2a1d14', '#7a5230', '#b88a4a', '#1c1410', '#8a3c20'];
const STEEL = '#b9bec4', STEEL_D = '#6e747c', WOOD = '#7a5332', WOOD_D = '#4d321d', LEATHER = '#7b4f2c';

const ease = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

function line(ctx, x0, y0, x1, y1, w, color, cap = 'round') {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = cap;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
}
function poly(ctx, pts, fill, stroke, lw = 0.6) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
function circle(ctx, x, y, r, fill, stroke, lw = 0.6) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
function ellipse(ctx, x, y, rx, ry, rot, fill, stroke, lw = 0.6) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
// direction vector for an "arm angle": 0 = straight down, PI/2 = forward, PI = up
const dir = (a) => [Math.sin(a), Math.cos(a)];

// ---------------------------------------------------------------------------
// Weapons
// ---------------------------------------------------------------------------
function drawWeapon(ctx, w, hx, hy, ang, o = {}) {
  const [dx, dy] = dir(ang);
  const px = -dy, py = dx; // perpendicular
  switch (w) {
    case 'sword': case 'longsword': case 'greatsword': {
      const L = w === 'sword' ? 7.5 : w === 'longsword' ? 9 : 11;
      line(ctx, hx - dx * 1.5, hy - dy * 1.5, hx, hy, 1.4, WOOD_D);
      line(ctx, hx + px * 2, hy + py * 2, hx - px * 2, hy - py * 2, 1.1, '#8a7a50');
      line(ctx, hx, hy, hx + dx * L, hy + dy * L, w === 'greatsword' ? 1.7 : 1.3, '#dfe4ea');
      line(ctx, hx + dx * 0.5 + px * 0.35, hy + dy * 0.5 + py * 0.35, hx + dx * L * 0.9 + px * 0.35, hy + dy * L * 0.9 + py * 0.35, 0.4, '#8d949c');
      break;
    }
    case 'spear': case 'pike': case 'halberd': {
      const back = w === 'spear' ? 7 : 9, fwd = w === 'spear' ? 9 : 12;
      const t = o.thrust || 0;
      const bx = hx - dx * (back - t), by = hy - dy * (back - t), fx = hx + dx * (fwd + t), fy = hy + dy * (fwd + t);
      line(ctx, bx, by, fx, fy, 1.1, WOOD);
      if (w === 'halberd') {
        poly(ctx, [[fx - dx * 3 + px * 0.3, fy - dy * 3 + py * 0.3], [fx - dx * 3.5 + px * 3, fy - dy * 3.5 + py * 3], [fx - dx * 1 + px * 2.6, fy - dy * 1 + py * 2.6], [fx - dx * 0.5, fy - dy * 0.5]], STEEL, STEEL_D, 0.4);
        poly(ctx, [[fx, fy], [fx + dx * 2.8, fy + dy * 2.8], [fx - px * 0.8, fy - py * 0.8]], '#dfe4ea');
      } else {
        poly(ctx, [[fx + px * 1, fy + py * 1], [fx + dx * 3.2, fy + dy * 3.2], [fx - px * 1, fy - py * 1]], '#dfe4ea', STEEL_D, 0.4);
      }
      break;
    }
    case 'javelin': {
      if (o.hide) break;
      line(ctx, hx - dx * 4, hy - dy * 4, hx + dx * 6, hy + dy * 6, 0.9, '#9a7448');
      poly(ctx, [[hx + dx * 6 + px * 0.7, hy + dy * 6 + py * 0.7], [hx + dx * 8.5, hy + dy * 8.5], [hx + dx * 6 - px * 0.7, hy + dy * 6 - py * 0.7]], '#cfd5db');
      break;
    }
    case 'bow': case 'longbow': {
      const L = w === 'longbow' ? 9 : 6.5;
      const pull = o.pull || 0;
      // bow limb: vertical-ish arc at hand
      ctx.strokeStyle = w === 'longbow' ? '#8a5a2e' : '#6e4524'; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(hx - 1.2, hy - L);
      ctx.quadraticCurveTo(hx + 2.6, hy, hx - 1.2, hy + L);
      ctx.stroke();
      const sx = hx - 1.2 - pull * 5.5;
      line(ctx, hx - 1.2, hy - L, sx, hy, 0.35, '#eee');
      line(ctx, sx, hy, hx - 1.2, hy + L, 0.35, '#eee');
      if (pull > 0.05) line(ctx, sx, hy, hx + 4, hy, 0.6, '#d8c9a0');
      break;
    }
    case 'crossbow': {
      line(ctx, hx - 5, hy + 0.5, hx + 3, hy - 0.2, 1.6, WOOD);
      line(ctx, hx + 2.5, hy - 3.2, hx + 2.5, hy + 3, 1, '#5d4a3a');
      line(ctx, hx + 2.5, hy - 3.2, hx - 1 - (o.pull || 0) * 0.5, hy, 0.3, '#ddd');
      line(ctx, hx + 2.5, hy + 3, hx - 1 - (o.pull || 0) * 0.5, hy, 0.3, '#ddd');
      break;
    }
    case 'axe': {
      line(ctx, hx - dx * 1.5, hy - dy * 1.5, hx + dx * 6, hy + dy * 6, 1.1, WOOD);
      const ex = hx + dx * 5.2, ey = hy + dy * 5.2;
      poly(ctx, [[ex, ey], [ex + px * 2.8 + dx * 1.4, ey + py * 2.8 + dy * 1.4], [ex + px * 3 - dx * 1.4, ey + py * 3 - dy * 1.4], [ex - dx * 0.8, ey - dy * 0.8]], '#c3c8ce', STEEL_D, 0.4);
      break;
    }
    case 'pick': {
      line(ctx, hx - dx * 1.5, hy - dy * 1.5, hx + dx * 6, hy + dy * 6, 1.1, WOOD);
      const ex = hx + dx * 6, ey = hy + dy * 6;
      ctx.strokeStyle = '#9aa0a6'; ctx.lineWidth = 1.1; ctx.beginPath();
      ctx.moveTo(ex - px * 3.2 - dx * 1.2, ey - py * 3.2 - dy * 1.2);
      ctx.quadraticCurveTo(ex + dx * 0.8, ey + dy * 0.8, ex + px * 3.2 - dx * 1.2, ey + py * 3.2 - dy * 1.2);
      ctx.stroke();
      break;
    }
    case 'hoe': {
      line(ctx, hx - dx * 3, hy - dy * 3, hx + dx * 7, hy + dy * 7, 1, WOOD);
      const ex = hx + dx * 7, ey = hy + dy * 7;
      line(ctx, ex, ey, ex + px * 2.5, ey + py * 2.5, 1.4, '#8f959b');
      break;
    }
    case 'hammer': {
      line(ctx, hx - dx * 1, hy - dy * 1, hx + dx * 4.5, hy + dy * 4.5, 1, WOOD);
      const ex = hx + dx * 4.5, ey = hy + dy * 4.5;
      line(ctx, ex - px * 1.6, ey - py * 1.6, ex + px * 1.6, ey + py * 1.6, 2, '#7d838a');
      break;
    }
    case 'knife': {
      line(ctx, hx, hy, hx + dx * 3.5, hy + dy * 3.5, 0.9, '#d7dce1');
      break;
    }
    case 'staff': {
      line(ctx, hx - dx * 10, hy - dy * 10, hx + dx * 6, hy + dy * 6, 1.1, '#8a6238');
      circle(ctx, hx + dx * 6.5, hy + dy * 6.5, 1.1, '#c9a84a');
      break;
    }
    case 'lance': {
      line(ctx, hx - dx * 6, hy - dy * 6, hx + dx * 15, hy + dy * 15, 1.3, '#d9cfb5');
      poly(ctx, [[hx + dx * 15 + px, hy + dy * 15 + py], [hx + dx * 18, hy + dy * 18], [hx + dx * 15 - px, hy + dy * 15 - py]], '#dfe4ea');
      break;
    }
    default: break;
  }
}

// Pose tables. Angles: a1 = shoulder, a2 = elbow bend (added), w = absolute weapon angle.
function armPose(weapon, anim, t) {
  const P = { a1: 0.35, a2: 0.7, b1: -0.3, b2: 0.5, w: 2.4, lunge: 0, thrust: 0, pull: 0, hide: false, bothHands: false };
  const walkS = anim === 'walk' ? Math.sin(t * TAU) : 0;
  switch (weapon) {
    case 'sword': case 'longsword': case 'greatsword':
      if (anim === 'attack') {
        if (t < 0.45) { const k = ease(t / 0.45); P.a1 = lerp(0.5, 2.9, k); P.a2 = lerp(0.8, 0.3, k); P.w = P.a1 + P.a2 + 0.2; }
        else if (t < 0.62) { const k = ease((t - 0.45) / 0.17); P.a1 = lerp(2.9, 1.25, k); P.a2 = lerp(0.3, 0.15, k); P.w = P.a1 + P.a2 + lerp(0.2, 0.25, k); P.lunge = k * 1.5; }
        else { const k = ease((t - 0.62) / 0.38); P.a1 = lerp(1.25, 0.5, k); P.a2 = lerp(0.15, 0.8, k); P.w = lerp(1.65, 2.4, k); P.lunge = (1 - k) * 1.5; }
        if (weapon === 'greatsword') { P.b1 = P.a1 - 0.2; P.b2 = P.a2; }
      } else { P.a1 = 0.45 + walkS * 0.3; P.a2 = 0.8; P.w = 2.3 + walkS * 0.2; }
      break;
    case 'spear': case 'pike': case 'halberd':
      if (anim === 'attack') { P.a1 = 1.35; P.a2 = 0.15; P.w = 1.62; P.thrust = Math.sin(clamp(t / 0.6, 0, 1) * Math.PI) * 4; P.lunge = P.thrust * 0.3; P.b1 = 1.1; P.b2 = 0.4; }
      else { P.a1 = 0.3 + walkS * 0.2; P.a2 = 1.2; P.w = anim === 'walk' ? 2.55 : 2.95; }
      break;
    case 'javelin':
      if (anim === 'attack') {
        if (t < 0.5) { const k = ease(t / 0.5); P.a1 = lerp(0.8, 2.6, k); P.a2 = 0.2; P.w = 1.9; }
        else { const k = ease(clamp((t - 0.5) / 0.2, 0, 1)); P.a1 = lerp(2.6, 1.2, k); P.a2 = 0.2; P.w = 1.7; P.hide = t > 0.62; }
      } else { P.a1 = 0.3 + walkS * 0.2; P.a2 = 1.1; P.w = 2.7; }
      break;
    case 'bow': case 'longbow':
      if (anim === 'attack') { P.a1 = 1.5; P.a2 = 0.05; P.w = 0; P.pull = t < 0.6 ? ease(t / 0.6) : 0; P.b1 = lerp(1.4, 1.75, P.pull); P.b2 = lerp(0.1, 1.6, P.pull); }
      else { P.a1 = 0.25 + walkS * 0.25; P.a2 = 0.3; P.w = 0; }
      break;
    case 'crossbow':
      P.a1 = 1.2; P.a2 = 0.35; P.b1 = 1.0; P.b2 = 0.9; P.w = 0; P.bothHands = true;
      if (anim === 'attack') P.pull = t < 0.2 ? 1 : 0;
      if (anim === 'walk') { P.a1 = 0.9 + walkS * 0.1; }
      break;
    case 'axe': case 'pick':
      if (anim === 'work' || anim === 'attack') {
        if (t < 0.3) { const k = ease(t / 0.3); P.a1 = lerp(3.0, 1.2, k); }
        else { const k = ease((t - 0.3) / 0.7); P.a1 = lerp(1.2, 3.0, k); }
        P.a2 = 0.15; P.w = P.a1 + 0.1; P.b1 = P.a1 - 0.25; P.b2 = 0.2; P.lunge = t < 0.35 ? 1 : 0;
      } else { P.a1 = 0.35 + walkS * 0.3; P.a2 = 0.6; P.w = 2.6; }
      break;
    case 'hoe':
      if (anim === 'work') { const k = t < 0.4 ? ease(t / 0.4) : 1 - ease((t - 0.4) / 0.6); P.a1 = lerp(2.2, 0.9, k); P.a2 = 0.2; P.w = P.a1 + 0.15; P.b1 = P.a1 - 0.3; P.b2 = 0.2; }
      else { P.a1 = 0.3 + walkS * 0.3; P.a2 = 0.5; P.w = 2.8; }
      break;
    case 'hammer':
      if (anim === 'work') { P.a1 = 1.7 + Math.sin(t * TAU * 2) * 0.7; P.a2 = 0.5; P.w = P.a1 + P.a2 + 0.3; P.b1 = 1.0; P.b2 = 0.6; }
      else { P.a1 = 0.35 + walkS * 0.3; P.a2 = 0.6; P.w = 2.4; }
      break;
    case 'basket':
      if (anim === 'work') { P.a1 = 1.25 + Math.sin(t * TAU) * 0.35; P.a2 = 0.3 + Math.sin(t * TAU + 1) * 0.3; }
      else { P.a1 = 0.3 + walkS * 0.3; P.a2 = 0.5; }
      P.w = 0;
      break;
    case 'knife':
      if (anim === 'work') { P.a1 = 1.0 + Math.sin(t * TAU) * 0.3; P.a2 = 0.6; P.w = 1.2; P.lunge = 1; }
      else { P.a1 = 0.3 + walkS * 0.3; P.a2 = 0.6; P.w = 1.6; }
      break;
    case 'staff':
      if (anim === 'attack') { P.a1 = 2.8 + Math.sin(t * TAU * 2) * 0.12; P.a2 = 0.1; P.b1 = 2.6 + Math.sin(t * TAU * 2 + 1) * 0.12; P.b2 = 0.1; P.w = 3.0; }
      else { P.a1 = 0.3 + walkS * 0.2; P.a2 = 1.2; P.w = 2.95; }
      break;
    default:
      P.a1 = 0.3 + walkS * 0.4; P.a2 = 0.4; P.w = 0;
  }
  if (anim === 'walk' && weapon !== 'crossbow') { P.b1 = -0.3 - walkS * 0.4; P.b2 = 0.4; }
  return P;
}

// ---------------------------------------------------------------------------
// Humans
// ---------------------------------------------------------------------------
export function drawHuman(ctx, o) {
  const anim = o.anim, t = o.t;
  const walk = anim === 'walk' ? Math.sin(t * TAU) : 0;
  const P = armPose(o.weapon, anim, t);
  const bob = anim === 'walk' ? -Math.abs(Math.cos(t * TAU)) * 0.8 + 0.4 : 0;
  const lx = P.lunge || 0;
  ctx.save();
  ctx.translate(0, bob);
  const skin = o.skin, pants = o.pants || '#5a4632', boots = '#3a2a1c';
  const hipY = -9;
  // legs
  const legAng = (s) => s * 0.55;
  const legF = anim === 'walk' ? legAng(walk) : anim === 'attack' || anim === 'work' ? 0.3 : 0.12;
  const legB = anim === 'walk' ? legAng(-walk) : anim === 'attack' || anim === 'work' ? -0.25 : -0.12;
  const drawLeg = (a, x, col) => {
    const kx = x + Math.sin(a) * 4.6, ky = hipY + Math.cos(a) * 4.6;
    const bend = Math.max(0, -a) * 0.9 + 0.1;
    const fx = kx + Math.sin(a - bend) * 4.6, fy = ky + Math.cos(a - bend) * 4.6;
    line(ctx, x, hipY, kx, ky, 2.5, col);
    line(ctx, kx, ky, fx, Math.min(fy, 0), 2.3, col);
    ellipse(ctx, fx + 0.8, Math.min(fy, 0) - 0.3, 1.6, 0.9, 0, boots);
  };
  if (!o.robe) {
    drawLeg(legB, -0.6 + lx * 0.3, shade(pants, -0.25));
    drawLeg(legF, 0.6 + lx * 0.6, pants);
  }
  // back arm (behind torso)
  const shX = 0.4 + lx * 0.6, shY = -16;
  const drawArm = (a1, a2, sx, sy, col, sleeve) => {
    const [d1x, d1y] = dir(a1), [d2x, d2y] = dir(a1 + a2);
    const ex = sx + d1x * 3.7, ey = sy + d1y * 3.7;
    const hx = ex + d2x * 3.5, hy = ey + d2y * 3.5;
    line(ctx, sx, sy, ex, ey, 2.2, sleeve);
    line(ctx, ex, ey, hx, hy, 1.9, sleeve);
    circle(ctx, hx, hy, 1.05, col);
    return [hx, hy];
  };
  const sleeveBack = shade(o.sleeve || o.tunic, -0.3);
  const [bhx, bhy] = drawArm(P.b1, P.b2, shX - 1.6, shY + 0.2, shade(skin, -0.2), sleeveBack);
  // cape
  if (o.cape) {
    poly(ctx, [[shX - 3, shY - 0.5], [shX - 1, shY], [-2 + lx * 0.4, -3.5 + Math.abs(walk) * 0.5], [-5.5 - Math.abs(walk) * 1.2, -4]], o.cape, shade(o.cape, -0.4), 0.4);
  }
  // torso
  const tunic = o.tunic, tunicD = shade(tunic, -0.28);
  const gx0 = -4 + lx * 0.5, gx1 = 4 + lx * 0.5;
  const grad = ctx.createLinearGradient(gx0, 0, gx1, 0);
  grad.addColorStop(0, shade(tunic, 0.12)); grad.addColorStop(0.55, tunic); grad.addColorStop(1, tunicD);
  if (o.robe) {
    poly(ctx, [[-3.2 + lx * 0.6, shY - 0.4], [3.2 + lx * 0.6, shY - 0.4], [4.6 + walk * 0.8, -0.3], [-4.4 + walk * 0.4, -0.3]], grad, shade(tunic, -0.5), 0.5);
    line(ctx, -4 + walk * 0.4, -0.8, 4.3 + walk * 0.8, -0.8, 0.9, o.trim || shade(tunic, -0.4));
  } else {
    const skirt = o.skirt !== false;
    poly(ctx, [[-3.2 + lx * 0.6, shY - 0.4], [3.1 + lx * 0.6, shY - 0.4], [3.1 + lx * 0.5, hipY - 0.5],
      [skirt ? 4.1 + lx * 0.4 : 3 + lx * 0.4, skirt ? hipY + 3.4 : hipY + 0.5], [skirt ? -4 + lx * 0.2 : -3 + lx * 0.2, skirt ? hipY + 3.4 : hipY + 0.5], [-3 + lx * 0.3, hipY - 0.5]],
      grad, shade(tunic, -0.5), 0.5);
    if (o.female && skirt) poly(ctx, [[-4 + lx * 0.2, hipY + 3.2], [4.1 + lx * 0.4, hipY + 3.2], [4.4, -2.2], [-3.8, -2.2]], shade(tunic, -0.08), shade(tunic, -0.4), 0.4);
  }
  // armor overlays
  if (o.armor === 1) { // mail
    ctx.save();
    ctx.beginPath(); ctx.rect(-3.3 + lx * 0.6, shY - 0.3, 6.5, 7.8); ctx.clip();
    ctx.fillStyle = '#8f969e'; ctx.fillRect(-4, shY - 1, 9, 9);
    ctx.fillStyle = 'rgba(40,44,50,0.45)';
    for (let yy = shY; yy < shY + 8; yy += 1.1) for (let xx = -4 + ((yy * 10) % 2 ? 0.5 : 0); xx < 5; xx += 1.1) ctx.fillRect(xx, yy, 0.45, 0.45);
    ctx.restore();
    line(ctx, -3.1 + lx * 0.6, shY + 5.2, 3 + lx * 0.6, shY + 5.2, 1.4, o.trim);
  } else if (o.armor === 2) { // plate
    const pg = ctx.createLinearGradient(-3, 0, 3.5, 0);
    pg.addColorStop(0, '#e9edf1'); pg.addColorStop(0.5, '#a9b0b8'); pg.addColorStop(1, '#6b727a');
    poly(ctx, [[-3.1 + lx * 0.6, shY - 0.3], [3 + lx * 0.6, shY - 0.3], [2.6 + lx * 0.5, hipY], [-2.7 + lx * 0.5, hipY]], pg, '#4c5258', 0.4);
    line(ctx, -2.7 + lx * 0.5, hipY + 0.2, 2.6 + lx * 0.5, hipY + 0.2, 1.3, o.trim);
  } else if (o.trim) {
    line(ctx, -3 + lx * 0.4, hipY - 0.2, 3.1 + lx * 0.4, hipY - 0.2, 1.1, o.belt || LEATHER);
  }
  if (o.tabard) {
    poly(ctx, [[-1.6 + lx * 0.6, shY + 0.6], [1.9 + lx * 0.6, shY + 0.6], [2.1 + lx * 0.5, hipY + 3.3], [-1.6 + lx * 0.4, hipY + 3.3]], o.tabard, shade(o.tabard, -0.45), 0.4);
    line(ctx, 0.15 + lx * 0.55, shY + 1.8, 0.15 + lx * 0.5, hipY + 1.5, 0.6, shade(o.tabard, 0.5));
  }
  // carried load on the back
  if (o.carry) drawCarry(ctx, o.carry, -3.2 + lx * 0.4, shY + 1.5);
  if (o.quiver) { poly(ctx, [[-4.2, shY + 0.5], [-2.8, shY - 0.4], [-1.4, shY + 6], [-2.8, shY + 6.6]], LEATHER, WOOD_D, 0.4); line(ctx, -3.6, shY - 0.2, -4.4, shY - 2.2, 0.5, '#e8e0c8'); line(ctx, -3.1, shY - 0.3, -3.5, shY - 2.5, 0.5, '#e8e0c8'); }
  // shield (carried in front of the chest)
  if (o.shield) {
    const sx = 2.2 + lx * 0.7, sy = shY + 3.8;
    if (o.shield === 'kite') poly(ctx, [[sx - 1.8, sy - 3.8], [sx + 2.2, sy - 3.8], [sx + 2.2, sy + 1], [sx + 0.2, sy + 4.8], [sx - 1.8, sy + 1]], o.shieldColor, shade(o.shieldColor, -0.5), 0.6);
    else { circle(ctx, sx, sy, 3.3, o.shieldColor, shade(o.shieldColor, -0.5), 0.7); circle(ctx, sx, sy, 0.9, '#c9c9c9'); }
    line(ctx, sx - 1.5, sy - 2.5, sx - 0.4, sy - 3.1, 0.6, 'rgba(255,255,255,0.45)');
  }
  // head
  const hx = 0.6 + lx * 0.8, hy = -20.2;
  line(ctx, hx - 0.3, hy + 2.6, hx - 0.3, hy + 4, 1.6, shade(skin, -0.15));
  const hg = ctx.createRadialGradient(hx - 1, hy - 1, 0.5, hx, hy, 3.4);
  hg.addColorStop(0, shade(skin, 0.15)); hg.addColorStop(1, shade(skin, -0.12));
  circle(ctx, hx, hy, 3.1, hg, shade(skin, -0.45), 0.4);
  drawHeadgear(ctx, o, hx, hy);
  if (o.helmet !== 'great' && o.helmet !== 'hood') circle(ctx, hx + 1.7, hy - 0.2, 0.42, '#231a14');
  if (o.beard) poly(ctx, [[hx + 0.2, hy + 1.2], [hx + 3, hy + 1.1], [hx + 1.8, hy + 3.4], [hx + 0.2, hy + 2.8]], o.hair);
  // front arm & weapon
  const sleeve = o.armor === 2 ? '#aab1b8' : o.sleeve || tunic;
  const [fhx, fhy] = drawArm(P.a1, P.a2, shX + 0.7, shY + 0.1, skin, sleeve);
  if (o.weapon === 'basket') {
    // basket held at the hip on the back hand
    poly(ctx, [[bhx - 2.4, bhy - 1], [bhx + 2.4, bhy - 1], [bhx + 1.8, bhy + 2.6], [bhx - 1.8, bhy + 2.6]], '#a07a44', '#5c4322', 0.5);
    line(ctx, bhx - 2.2, bhy + 0.4, bhx + 2.2, bhy + 0.4, 0.4, '#5c4322');
    if (o.anim === 'work') { circle(ctx, bhx - 0.6, bhy - 1.2, 0.7, '#b0203a'); circle(ctx, bhx + 0.8, bhy - 1.3, 0.7, '#8a1830'); }
  } else if (o.weapon === 'bow' || o.weapon === 'longbow') {
    drawWeapon(ctx, o.weapon, fhx, fhy, P.w, { pull: P.pull });
  } else if (o.weapon === 'crossbow') {
    drawWeapon(ctx, 'crossbow', fhx, fhy, 0, { pull: P.pull });
  } else if (o.weapon && o.weapon !== 'none') {
    drawWeapon(ctx, o.weapon, fhx, fhy, P.w, { thrust: P.thrust, hide: P.hide });
  }
  ctx.restore();
}

function drawHeadgear(ctx, o, hx, hy) {
  const hair = o.hair;
  switch (o.helmet) {
    case 'cap': // soft cap in color
      poly(ctx, [[hx - 3.3, hy - 0.5], [hx - 2.6, hy - 3], [hx + 0.5, hy - 4], [hx + 3.2, hy - 1.6], [hx + 3.2, hy - 0.8]], o.capColor || '#7a4b2a', shade(o.capColor || '#7a4b2a', -0.4), 0.4);
      break;
    case 'straw':
      ellipse(ctx, hx, hy - 1.6, 4.8, 1.3, 0, '#d9b861', '#8c7433', 0.4);
      ellipse(ctx, hx, hy - 2.6, 2.6, 1.6, 0, '#e2c572', '#8c7433', 0.4);
      break;
    case 'kettle':
      ellipse(ctx, hx, hy - 1.2, 4.6, 1.2, 0, '#9aa1a8', '#50565c', 0.4);
      ctx.beginPath(); ctx.arc(hx, hy - 1.2, 3, Math.PI, 0); ctx.fillStyle = '#b8bec5'; ctx.fill(); ctx.strokeStyle = '#50565c'; ctx.lineWidth = 0.4; ctx.stroke();
      break;
    case 'nasal':
      poly(ctx, [[hx - 3.2, hy - 0.4], [hx - 2.6, hy - 2.8], [hx + 0.2, hy - 5.2], [hx + 3, hy - 2.6], [hx + 3.3, hy - 0.4]], '#b5bcc3', '#4f555b', 0.4);
      line(ctx, hx + 2.3, hy - 0.8, hx + 2.3, hy + 1.3, 0.8, '#8a9097');
      break;
    case 'great':
      poly(ctx, [[hx - 3.3, hy + 2.8], [hx - 3.4, hy - 2.2], [hx - 1, hy - 3.9], [hx + 2, hy - 3.8], [hx + 3.4, hy - 1.8], [hx + 3.4, hy + 2.8]], '#b8bfc6', '#4a5056', 0.5);
      line(ctx, hx + 0.4, hy - 0.4, hx + 3.3, hy - 0.4, 0.7, '#1f2226');
      line(ctx, hx + 1.8, hy + 0.3, hx + 1.8, hy + 2.4, 0.4, '#3a3f45');
      if (o.plume) { ctx.strokeStyle = o.plume; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(hx - 0.5, hy - 3.8); ctx.quadraticCurveTo(hx - 3, hy - 7, hx - 5.5, hy - 4.5); ctx.stroke(); }
      break;
    case 'coif':
      poly(ctx, [[hx - 3.4, hy + 3], [hx - 3.4, hy - 1.8], [hx - 1, hy - 3.7], [hx + 1.8, hy - 3.5], [hx + 3.1, hy - 2], [hx + 1, hy - 1.6], [hx + 0.2, hy + 2.8]], '#9097a0', '#4d535a', 0.4);
      break;
    case 'hood':
      poly(ctx, [[hx - 3.6, hy + 3.2], [hx - 3.4, hy - 2.2], [hx - 0.8, hy - 4.1], [hx + 2.2, hy - 3.2], [hx + 3.3, hy - 1.2], [hx + 1.2, hy - 1.8], [hx + 0.4, hy + 3]], o.hoodColor || '#6a5040', shade(o.hoodColor || '#6a5040', -0.4), 0.4);
      circle(ctx, hx + 1.9, hy - 0.2, 0.4, '#231a14');
      break;
    case 'feather':
      poly(ctx, [[hx - 3.3, hy - 0.6], [hx - 2.4, hy - 3.2], [hx + 1.2, hy - 3.9], [hx + 3.4, hy - 1.4], [hx + 3.4, hy - 0.8]], '#4f6b36', '#2b3b1d', 0.4);
      ctx.strokeStyle = o.feather || '#d33'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(hx - 1.5, hy - 3.4); ctx.quadraticCurveTo(hx - 4, hy - 6, hx - 6, hy - 4.8); ctx.stroke();
      break;
    case 'tonsure':
      ctx.beginPath(); ctx.arc(hx, hy, 3.1, Math.PI * 0.95, Math.PI * 1.25); ctx.lineTo(hx - 1, hy); ctx.closePath(); ctx.fillStyle = hair; ctx.fill();
      break;
    default: // bare head with hair
      if (o.female) {
        poly(ctx, [[hx - 3.4, hy + 3.6], [hx - 3.4, hy - 1.5], [hx - 1.4, hy - 3.6], [hx + 1.6, hy - 3.6], [hx + 3.3, hy - 1.6], [hx + 1.2, hy - 2], [hx - 1.3, hy + 4.5]], hair, shade(hair, -0.4), 0.3);
        circle(ctx, hx - 3, hy - 1.5, 1.4, hair);
        if (o.kerchief) poly(ctx, [[hx - 3.3, hy - 1], [hx - 2.2, hy - 3.4], [hx + 1.2, hy - 3.8], [hx + 3.2, hy - 1.8], [hx - 0.5, hy - 1.8]], o.kerchief, shade(o.kerchief, -0.4), 0.3);
      } else {
        poly(ctx, [[hx - 3.3, hy + 0.5], [hx - 2.8, hy - 2.4], [hx + 0.4, hy - 3.8], [hx + 3, hy - 2.2], [hx + 2.2, hy - 1.6], [hx - 1, hy - 1.8], [hx - 1.8, hy + 1]], hair, shade(hair, -0.4), 0.3);
      }
  }
}

function drawCarry(ctx, what, x, y) {
  switch (what) {
    case 'wood':
      for (let i = 0; i < 3; i++) {
        const yy = y - 1.2 + i * 1.5;
        line(ctx, x - 2.2, yy, x + 3.8, yy - 0.8, 1.5, i % 2 ? '#8a5a32' : '#9c6a3c');
        circle(ctx, x - 2.2, yy, 0.8, '#c9a06a');
      }
      break;
    case 'food':
      poly(ctx, [[x - 2.2, y - 1.5], [x + 1.6, y - 1.5], [x + 1.2, y + 3.5], [x - 1.8, y + 3.5]], '#a07a44', '#5c4322', 0.5);
      circle(ctx, x - 0.9, y - 1.8, 0.9, '#b52a3a'); circle(ctx, x + 0.5, y - 2, 0.9, '#d0a030'); circle(ctx, x - 0.2, y - 2.6, 0.8, '#8a2a2a');
      break;
    case 'meat':
      ellipse(ctx, x, y + 0.5, 2.6, 1.7, 0.4, '#a23a2a', '#5a1d14', 0.5);
      ellipse(ctx, x - 0.3, y + 0.2, 1.3, 0.8, 0.4, '#e6c7b0');
      break;
    case 'gold':
      poly(ctx, [[x - 2.2, y - 1], [x + 1.8, y - 1.2], [x + 2, y + 3.2], [x - 2, y + 3.4]], '#8a6a3a', '#4a3620', 0.5);
      circle(ctx, x - 0.8, y - 1.3, 1, '#f3cd3c', '#9a7a14', 0.3); circle(ctx, x + 0.8, y - 1.5, 0.9, '#ffe066', '#9a7a14', 0.3);
      break;
    case 'stone':
      poly(ctx, [[x - 2.2, y - 1], [x + 1.8, y - 1.2], [x + 2, y + 3.2], [x - 2, y + 3.4]], '#8a6a3a', '#4a3620', 0.5);
      poly(ctx, [[x - 1.8, y - 1], [x - 0.6, y - 2.6], [x + 0.9, y - 2.2], [x + 1.4, y - 0.8]], '#a7a9ab', '#5d5f61', 0.3);
      break;
  }
}

// ---------------------------------------------------------------------------
// Horses
// ---------------------------------------------------------------------------
function drawHorse(ctx, o) {
  const anim = o.anim, t = o.t;
  const moving = anim === 'walk';
  const coat = o.coat, coatD = shade(coat, -0.35);
  const bob = moving ? Math.sin(t * TAU * 2) * 0.6 : 0;
  ctx.save();
  ctx.translate(0, bob);
  // legs: [x, phase]
  const legs = [[-6.2, 0], [5.4, 0.5], [-4.8, 0.55], [6.8, 0.05]];
  const drawLeg = (x, ph, far) => {
    const a = moving ? Math.sin((t + ph) * TAU) * 0.62 : anim === 'attack' && x > 0 ? -0.2 : 0.04;
    const topY = -10.2;
    const kx = x + Math.sin(a) * 5, ky = topY + Math.cos(a) * 5;
    const bend = moving ? Math.max(0, Math.sin((t + ph) * TAU + 1.2)) * 1.1 : 0;
    const fx = kx + Math.sin(a - bend * (x > 0 ? -1 : 1)) * 5.2, fy = ky + Math.cos(a - bend) * 5.2;
    const col = far ? coatD : shade(coat, -0.12);
    line(ctx, x, topY, kx, ky, 2.2, col);
    line(ctx, kx, ky, fx, Math.min(fy, -0.2), 1.6, col);
    ellipse(ctx, fx + 0.3, Math.min(fy, -0.2) + 0.1, 1.2, 0.8, 0, '#2a211a');
  };
  drawLeg(legs[0][0], legs[0][1], true); drawLeg(legs[1][0], legs[1][1], true);
  // tail
  ctx.strokeStyle = o.mane; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-8.5, -13.5); ctx.quadraticCurveTo(-12, -12 + (moving ? Math.sin(t * TAU) * 1.5 : 0), -11, -6.5); ctx.stroke();
  // body
  const g = ctx.createLinearGradient(0, -17, 0, -7);
  g.addColorStop(0, shade(coat, 0.15)); g.addColorStop(1, coatD);
  ellipse(ctx, 0, -12.2, 9.4, 4.4, 0, g, shade(coat, -0.55), 0.5);
  // neck + head
  const headLift = anim === 'attack' ? -1 : 0;
  poly(ctx, [[5.5, -15.2], [8.8, -20.5 + headLift], [11.2, -21 + headLift], [10.4, -17], [8.6, -11]], coat, shade(coat, -0.5), 0.5);
  poly(ctx, [[9.6, -21.6 + headLift], [12, -21.8 + headLift], [15.6, -17.6 + headLift], [14.8, -16.3 + headLift], [11.4, -17.2 + headLift]], shade(coat, 0.05), shade(coat, -0.55), 0.5);
  poly(ctx, [[10, -21.3 + headLift], [10.7, -23.6 + headLift], [11.3, -21.4 + headLift]], coatD);
  circle(ctx, 12.2, -20 + headLift, 0.45, '#111');
  // mane
  ctx.strokeStyle = o.mane; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(5.8, -15.8); ctx.quadraticCurveTo(7.5, -19.5, 10.2, -21.6 + headLift); ctx.stroke();
  // barding / blanket
  if (o.caparison) {
    const cg = ctx.createLinearGradient(0, -16, 0, -6);
    cg.addColorStop(0, shade(o.caparison, 0.1)); cg.addColorStop(1, shade(o.caparison, -0.3));
    poly(ctx, [[-8.8, -14.5], [7.5, -15.2], [9.4, -11.5], [8.6, -6.4], [-8.2, -6.4], [-9.6, -10]], cg, shade(o.caparison, -0.55), 0.5);
    for (let i = -6; i <= 6; i += 4) line(ctx, i, -14.6, i + 0.3, -6.6, 0.5, shade(o.caparison, 0.35));
    line(ctx, -8.4, -6.8, 8.4, -6.8, 0.9, o.trim || '#e0c060');
    if (o.plated) poly(ctx, [[7.3, -15], [11, -20], [12.4, -20.4], [10.6, -16], [8.8, -11.8]], '#b0b7be', '#4f555b', 0.4);
  } else if (o.blanket) {
    poly(ctx, [[-4.5, -16.2], [3.5, -16.4], [4.2, -10.5], [-4.8, -10.3]], o.blanket, shade(o.blanket, -0.5), 0.5);
  }
  // saddle
  ellipse(ctx, -0.8, -16.5, 3.4, 1.2, 0, '#5a3a20');
  drawLeg(legs[2][0], legs[2][1], false); drawLeg(legs[3][0], legs[3][1], false);
  ctx.restore();
  return bob;
}

// ---------------------------------------------------------------------------
// Unit definitions -> appearance
// ---------------------------------------------------------------------------
function humanLook(type, pc, anim, t, extra) {
  const v = extra.variant || 0;
  const skin = SKIN[v % SKIN.length], hair = HAIR[(v * 7 + 3) % HAIR.length];
  const base = { anim, t, skin, hair, trim: pc.main, tunic: pc.main, female: false };
  switch (type) {
    case 'villager': {
      const female = !!extra.female;
      const tool = { wood: 'axe', gold: 'pick', stone: 'pick', farm: 'hoe', forage: 'basket', build: 'hammer', hunt: 'javelin', sheep: 'knife' }[extra.task] || 'none';
      const weapon = tool === 'none' && anim === 'attack' ? 'axe' : tool;
      return {
        ...base, female, weapon, tunic: female ? mix(pc.main, '#d8c8a8', 0.35) : pc.main, sleeve: female ? mix(pc.main, '#d8c8a8', 0.35) : '#d9c8a4',
        pants: female ? '#6b5236' : '#6d5a3e', belt: LEATHER, helmet: female ? null : (v % 3 === 0 ? 'straw' : v % 3 === 1 ? 'cap' : null),
        capColor: shade(pc.main, -0.3), kerchief: female && v % 2 ? '#e9e0cc' : null, carry: extra.carry, skirt: true, beard: !female && v % 4 === 1,
      };
    }
    case 'sword': {
      const g = extra.gear || 0;
      return {
        ...base, weapon: g >= 3 ? 'greatsword' : g >= 2 ? 'longsword' : 'sword', armor: g === 0 ? 0 : g === 1 ? 1 : 2,
        helmet: g === 0 ? 'cap' : g === 1 ? 'kettle' : g === 2 ? 'nasal' : 'great', capColor: '#6b4a2e',
        shield: g < 3 ? (g === 0 ? 'round' : 'kite') : null, shieldColor: pc.main, tabard: g >= 2 ? pc.main : null,
        tunic: g === 0 ? pc.main : shade(pc.main, -0.15), sleeve: g >= 1 ? '#8f969e' : pc.main, pants: '#4d4038', beard: v % 3 === 0,
      };
    }
    case 'spear': {
      const g = extra.gear || 0;
      return {
        ...base, weapon: g === 0 ? 'spear' : g === 1 ? 'pike' : 'halberd', armor: g >= 1 ? 1 : 0,
        helmet: g === 0 ? 'cap' : g === 1 ? 'kettle' : 'nasal', capColor: '#6b4a2e', tunic: pc.main, pants: '#5a4a3c',
      };
    }
    case 'archer': {
      const g = extra.gear || 0;
      return {
        ...base, weapon: g === 0 ? 'bow' : 'crossbow', helmet: g === 0 ? 'feather' : g === 1 ? 'kettle' : 'nasal', feather: pc.light,
        tunic: pc.main, armor: g === 2 ? 1 : 0, quiver: g === 0, pants: '#4e5a3a',
      };
    }
    case 'longbow': {
      const g = extra.gear || 0;
      return { ...base, weapon: 'longbow', helmet: g ? 'kettle' : 'feather', feather: pc.light, tunic: '#4f6b36', tabard: pc.main, quiver: true, pants: '#4e4a3a' };
    }
    case 'skirm': {
      const g = extra.gear || 0;
      return { ...base, weapon: 'javelin', helmet: g ? 'coif' : 'cap', capColor: '#7a6a4a', tunic: pc.main, shield: 'round', shieldColor: '#9b7a4a', pants: '#5a4a3c' };
    }
    case 'monk':
      return {
        ...base, weapon: 'staff', robe: true, tunic: '#8a6a4a', sleeve: '#8a6a4a', trim: pc.main,
        helmet: v % 2 ? 'hood' : 'tonsure', hoodColor: '#7a5a3c', hair: '#6a5040',
      };
    default:
      return { ...base, weapon: 'none' };
  }
}

function drawRiderAndHorse(ctx, type, pc, anim, t, extra) {
  const g = extra.gear || 0;
  const v = extra.variant || 0;
  let coat = ['#6b4226', '#3a2a20', '#8a5a34', '#b8ad9c'][v % 4];
  let rider;
  if (type === 'knight') {
    coat = g >= 1 ? '#d8d2c6' : coat;
    rider = { weapon: g >= 2 ? 'lance' : 'sword', armor: 2, helmet: 'great', plume: pc.light, tabard: pc.main, shield: g < 2 ? 'kite' : null, shieldColor: pc.main };
  } else if (type === 'cavarcher') {
    rider = { weapon: 'bow', armor: 0, helmet: 'feather', feather: pc.light, quiver: true };
  } else { // scout / light cavalry
    rider = { weapon: 'spear', armor: g ? 1 : 0, helmet: g ? 'kettle' : 'cap', capColor: '#6b4a2e' };
  }
  const bob = drawHorse(ctx, {
    anim, t, coat, mane: shade(coat, -0.5),
    caparison: type === 'knight' ? pc.main : null, trim: pc.light, plated: type === 'knight' && g >= 2,
    blanket: type !== 'knight' ? pc.main : null,
  });
  // rider sits on the saddle: draw a human with legs hidden, shifted up
  ctx.save();
  ctx.translate(-0.8, -9.2 + bob);
  const skin = SKIN[v % SKIN.length];
  // dangling leg
  line(ctx, 0.4, -9, 2.2, -4.5, 2.3, '#4d4038');
  line(ctx, 2.2, -4.5, 1.2, -1, 2, '#4d4038');
  ellipse(ctx, 1.8, -0.8, 1.5, 0.8, 0, '#2e2218');
  const look = {
    anim: anim === 'walk' ? 'idle' : anim, t, skin, hair: HAIR[v % HAIR.length], trim: pc.main, tunic: pc.main,
    skirt: false, pants: '#4d4038', ...rider, robe: false, noLegs: true,
  };
  drawHumanNoLegs(ctx, look);
  ctx.restore();
}

function drawHumanNoLegs(ctx, look) {
  // draw a human and mask out the legs region by clipping above the hip
  ctx.save();
  ctx.beginPath(); ctx.rect(-30, -60, 60, 51.5); ctx.clip();
  drawHuman(ctx, look);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Siege
// ---------------------------------------------------------------------------
function drawWheel(ctx, x, y, r, rot) {
  circle(ctx, x, y, r, '#5a3d22', '#2d1d10', 0.6);
  circle(ctx, x, y, r - 1.1, '#7a5634');
  for (let i = 0; i < 4; i++) {
    const a = rot + (i * Math.PI) / 4 * 2;
    line(ctx, x - Math.cos(a) * (r - 1), y - Math.sin(a) * (r - 1), x + Math.cos(a) * (r - 1), y + Math.sin(a) * (r - 1), 0.7, '#4a3220');
  }
  circle(ctx, x, y, 1, '#3a2716');
}

function drawRam(ctx, pc, anim, t, gear) {
  const roll = anim === 'walk' ? t * TAU : 0;
  const thrust = anim === 'attack' ? Math.sin(clamp(t / 0.5, 0, 1) * Math.PI) * 5 : 0;
  // log
  line(ctx, -10 + thrust, -9.5, 15 + thrust, -9.5, 3.6, '#6b4a2c');
  poly(ctx, [[14 + thrust, -12], [19 + thrust, -12], [20.5 + thrust, -9.5], [19 + thrust, -7], [14 + thrust, -7]], gear ? '#8e949a' : '#5d6167', '#2b2e31', 0.5);
  // wheels behind
  drawWheel(ctx, -8.5, -3.6, 3.6, roll); drawWheel(ctx, 7.5, -3.6, 3.6, roll);
  // housing
  const g = ctx.createLinearGradient(-14, 0, 14, 0);
  g.addColorStop(0, '#8a6440'); g.addColorStop(1, '#5c3f24');
  poly(ctx, [[-13, -6], [12, -6], [12, -12], [0, -21], [-13, -12]], g, '#2f2012', 0.6);
  // roof hides
  poly(ctx, [[-14, -11.5], [0, -22.5], [13.5, -11.5], [11.5, -10], [0, -19], [-12, -10]], gear ? '#6e7479' : '#8d6a4a', '#3a2818', 0.5);
  for (let i = -10; i <= 10; i += 3.2) line(ctx, i, -12 - (10 - Math.abs(i)) * 0.8, i, -6.5, 0.5, 'rgba(40,25,10,0.5)');
  // player banner
  poly(ctx, [[-4, -14], [4, -14], [4, -9], [0, -7.5], [-4, -9]], pc.main, shade(pc.main, -0.5), 0.5);
  drawWheel(ctx, -6, -3, 3.6, roll + 0.5); drawWheel(ctx, 10, -3, 3.6, roll + 0.5);
}

function drawMangonel(ctx, pc, anim, t, gear) {
  const roll = anim === 'walk' ? t * TAU : 0;
  // arm angle: rest leaning back; attack swings forward
  let armA = -0.95;
  if (anim === 'attack') { armA = t < 0.25 ? lerp(-0.95, 1.1, ease(t / 0.25)) : t < 0.8 ? 1.1 : lerp(1.1, -0.95, (t - 0.8) / 0.2); }
  drawWheel(ctx, -8, -4, 3.8, roll);
  // base frame
  poly(ctx, [[-13, -5], [13, -5], [13, -9], [-13, -9]], '#7a5433', '#3a2716', 0.6);
  line(ctx, -12, -7, 12, -7, 0.5, 'rgba(0,0,0,0.35)');
  // uprights
  poly(ctx, [[-2.5, -9], [0.5, -9], [2.5, -19], [-0.5, -19]], '#8a6038', '#3a2716', 0.5);
  poly(ctx, [[4, -9], [7, -9], [2.5, -19], [-0.5, -19]], '#6e4c2c', '#3a2716', 0.5);
  line(ctx, -2, -17.5, 5, -17.5, 1.6, gear ? '#7c8288' : '#5b3e24');
  // throwing arm pivoting at (-6, -10)
  const px = -5, py = -10;
  const ax = px - Math.cos(armA) * 17, ay = py - Math.sin(armA) * 17;
  line(ctx, px, py, ax, ay, 2, '#9a6c40');
  const showStone = !(anim === 'attack' && t > 0.2 && t < 0.85);
  circle(ctx, ax, ay, 2.6, '#6b4a2c', '#2b1d10', 0.5);
  if (showStone) circle(ctx, ax, ay - 1, 1.9, '#8d8f91', '#4a4c4e', 0.4);
  // rope bundle
  circle(ctx, px, py, 2, '#c2a06a', '#5a4322', 0.4);
  // player flag
  line(ctx, 10, -9, 10, -20, 0.8, '#3a2716');
  poly(ctx, [[10, -20], [16, -18.5], [10, -16.5]], pc.main, shade(pc.main, -0.4), 0.4);
  drawWheel(ctx, 8, -3.6, 3.8, roll + 0.4);
}

function drawTrebuchet(ctx, pc, anim, t) {
  const roll = anim === 'walk' ? t * TAU : 0;
  let armA = 2.35; // radians, 0 = pointing right
  if (anim === 'attack') { armA = t < 0.3 ? lerp(2.35, -0.9, ease(t / 0.3)) : t < 0.75 ? -0.9 : lerp(-0.9, 2.35, (t - 0.75) / 0.25); }
  drawWheel(ctx, -14, -3.6, 3.6, roll); drawWheel(ctx, 12, -3.6, 3.6, roll);
  poly(ctx, [[-19, -5], [18, -5], [18, -9], [-19, -9]], '#7a5433', '#3a2716', 0.6);
  // A-frame
  poly(ctx, [[-10, -9], [-6.5, -9], [1.5, -42], [-1.5, -42]], '#8a6038', '#3a2716', 0.5);
  poly(ctx, [[10, -9], [6.5, -9], [1.5, -42], [-1.5, -42]], '#6e4c2c', '#3a2716', 0.5);
  line(ctx, -6, -24, 6, -24, 1.4, '#5b3e24');
  const px = 0, py = -40;
  const L1 = 26, L2 = 9;
  const ax = px + Math.cos(armA) * L1, ay = py - Math.sin(armA) * L1;
  const cx = px - Math.cos(armA) * L2, cy = py + Math.sin(armA) * L2;
  line(ctx, cx, cy, ax, ay, 2.2, '#9a6c40');
  // counterweight box
  poly(ctx, [[cx - 4, cy], [cx + 4, cy], [cx + 3.5, cy + 8], [cx - 3.5, cy + 8]], '#5b4130', '#2b1d10', 0.5);
  line(ctx, cx - 3.5, cy + 4, cx + 3.5, cy + 4, 0.5, 'rgba(0,0,0,0.4)');
  // sling
  line(ctx, ax, ay, ax + (anim === 'attack' && t < 0.4 ? 6 : -2), ay + 7, 0.5, '#d9c9a0');
  circle(ctx, px, py, 1.6, '#3a2716');
  line(ctx, 15, -9, 15, -22, 0.8, '#3a2716');
  poly(ctx, [[15, -22], [21, -20.5], [15, -18.5]], pc.main, shade(pc.main, -0.4), 0.4);
}

// ---------------------------------------------------------------------------
// Animals
// ---------------------------------------------------------------------------
function drawSheep(ctx, anim, t, pc) {
  const moving = anim === 'walk';
  const legs = [-3.5, -1.8, 2.4, 3.8];
  legs.forEach((x, i) => {
    const a = moving ? Math.sin((t + (i % 2) * 0.5) * TAU) * 0.5 : 0;
    line(ctx, x, -4.5, x + Math.sin(a) * 3.8, -0.4, 1.1, '#2a2622');
  });
  const wool = ['#f1eee6', '#e7e2d6', '#fbf8f0'];
  const bumps = [[-4, -7], [-1.5, -8.3], [1.2, -8.2], [3.4, -7], [-2.6, -5.5], [0.4, -5.6], [2.8, -5.5]];
  bumps.forEach(([x, y], i) => circle(ctx, x, y, 2.6, wool[i % 3], '#b8b2a4', 0.35));
  if (pc) ellipse(ctx, -1, -9.8, 1.8, 0.8, 0, pc.main);
  const graze = anim === 'idle' && Math.floor(t * 4) % 2 === 1;
  ellipse(ctx, 6.2, graze ? -4 : -7.2, 1.9, 1.35, graze ? 0.9 : 0.35, '#2e2a26');
  circle(ctx, 6.9, graze ? -4.3 : -7.6, 0.3, '#ddd');
}
function drawDeer(ctx, anim, t, stag) {
  const moving = anim === 'walk';
  const legs = [[-5, 0], [-3.6, 0.5], [4, 0.45], [5.2, 0.95]];
  legs.forEach(([x, ph]) => {
    const a = moving ? Math.sin((t + ph) * TAU) * 0.7 : 0;
    line(ctx, x, -7.5, x + Math.sin(a) * 3.5, -3.8, 1.3, '#6b4527');
    line(ctx, x + Math.sin(a) * 3.5, -3.8, x + Math.sin(a) * 4.2, -0.3, 1, '#5a3a20');
  });
  const g = ctx.createLinearGradient(0, -13, 0, -6);
  g.addColorStop(0, '#a4703e'); g.addColorStop(1, '#7a4f2a');
  ellipse(ctx, 0, -9.3, 7, 3.3, 0, g, '#4a2f18', 0.4);
  ellipse(ctx, 0.5, -7.3, 5, 1.2, 0, '#e2cfb0');
  poly(ctx, [[4.2, -10.8], [6.5, -15.5], [8.6, -15.6], [7.4, -10]], '#9a683a', '#4a2f18', 0.4);
  ellipse(ctx, 8.8, -16.3, 2.4, 1.5, 0.4, '#a4703e', '#4a2f18', 0.4);
  circle(ctx, 9.3, -16.8, 0.35, '#111');
  poly(ctx, [[7.2, -17.3], [6.5, -19.3], [7.9, -17.6]], '#8a5a30');
  if (stag) {
    ctx.strokeStyle = '#d8c7a4'; ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(8, -17.5); ctx.lineTo(7.2, -21.5); ctx.lineTo(5.8, -23); ctx.moveTo(7.4, -20.3); ctx.lineTo(9, -22); ctx.stroke();
  }
  ellipse(ctx, -6.8, -10.3, 1.2, 1.5, 0, '#f2ead8');
}

// ---------------------------------------------------------------------------
// Public sprite API
// ---------------------------------------------------------------------------
const BOXES = {
  human: { w: 44, h: 46, ox: 22, oy: 40 },
  cav: { w: 60, h: 58, ox: 26, oy: 48 },
  siege: { w: 64, h: 44, ox: 30, oy: 34 },
  treb: { w: 72, h: 86, ox: 36, oy: 76 },
  animal: { w: 36, h: 32, ox: 16, oy: 26 },
};

const cache = new Map();
const CACHE_CAP = 2400;

export function unitBox(sprite) {
  if (sprite === 'knight' || sprite === 'scout' || sprite === 'cavarcher') return BOXES.cav;
  if (sprite === 'ram' || sprite === 'mangonel') return BOXES.siege;
  if (sprite === 'trebuchet') return BOXES.treb;
  if (sprite === 'sheep' || sprite === 'deer') return BOXES.animal;
  return BOXES.human;
}

// key params: sprite, color obj, anim, frame, extra {gear, task, carry, female, variant}
export function getUnitSprite(sprite, pc, anim, frame, extra = {}) {
  const key = `${sprite}|${pc.main}|${anim}|${frame}|${extra.gear || 0}|${extra.task || ''}|${extra.carry || ''}|${extra.female ? 1 : 0}|${extra.variant || 0}`;
  let s = cache.get(key);
  if (s) {
    // least-recently-used ordering: move to the back
    cache.delete(key); cache.set(key, s);
    return s;
  }
  if (cache.size >= CACHE_CAP) {
    let n = cache.size - CACHE_CAP + 200;
    for (const k of cache.keys()) { cache.delete(k); if (--n <= 0) break; }
  }
  const box = unitBox(sprite);
  const c = document.createElement('canvas');
  c.width = box.w * SS; c.height = box.h * SS;
  const ctx = c.getContext('2d');
  ctx.scale(SS, SS);
  ctx.translate(box.ox, box.oy);
  const nf = FRAMES[anim] || 1;
  const t = frame / nf;
  switch (sprite) {
    case 'knight': case 'scout': case 'cavarcher': drawRiderAndHorse(ctx, sprite, pc, anim, t, extra); break;
    case 'ram': drawRam(ctx, pc, anim, t, extra.gear); break;
    case 'mangonel': drawMangonel(ctx, pc, anim, t, extra.gear); break;
    case 'trebuchet': drawTrebuchet(ctx, pc, anim, t); break;
    case 'sheep': drawSheep(ctx, anim, t, extra.owned ? pc : null); break;
    case 'deer': drawDeer(ctx, anim, t, (extra.variant || 0) % 3 === 0); break;
    default: drawHuman(ctx, humanLook(sprite, pc, anim, t, extra));
  }
  s = { c, ox: box.ox, oy: box.oy, w: box.w, h: box.h };
  cache.set(key, s);
  return s;
}

export function spriteCacheSize() { return cache.size; }
