// Procedural unit models: humanoids with IK-driven animation, horses, siege engines, animals.
import { Model, renderModel, ik, v3, shade } from './draw3d.js';

const TAU = Math.PI * 2;
const SKINS = ['#e9bb92', '#d8a476', '#c58b5d', '#a86f47', '#f1cda7', '#8a5a3a'];
const HAIRS = ['#3a2616', '#6a4424', '#1e1612', '#a8783a', '#c8a060', '#5a3a22'];
const STEEL = '#cfd4da', IRON = '#8a9098', WOOD = '#7a5230', LEATHER = '#6a4a2a', DARKLEATHER = '#4a3220';

// Screen direction index (0=E,1=SE,2=S,3=SW,4=W,5=NW,6=N,7=NE) → world facing angle.
export function dirToFacing(d) {
  const phi = (d * Math.PI) / 4;
  const dx = (Math.cos(phi) + 2 * Math.sin(phi)) / 2, dy = (2 * Math.sin(phi) - Math.cos(phi)) / 2;
  return Math.atan2(dy, dx);
}
export function facingToDir(f) {
  const cx = Math.cos(f), cy = Math.sin(f);
  const sx = cx - cy, sy = (cx + cy) / 2;
  let a = Math.atan2(sy, sx);
  if (a < 0) a += TAU;
  return Math.round(a / (Math.PI / 4)) % 8;
}

// ------------------------------------------------------------------ appearance presets
const LOOKS = {
  villager: { kind: 'human', tunic: 'team', pants: '#6a4a2a', boots: '#3a2616' },
  militia: { kind: 'human', tunic: 'team', pants: '#5a4028', helm: 'cap', helmColor: LEATHER, weapon: 'sword', swordLen: 8, belt: true },
  manAtArms: { kind: 'human', tunic: '#8a9098', tabard: true, pants: '#4a3a2a', helm: 'kettle', weapon: 'sword', shield: 'round', swordLen: 9 },
  longSwordsman: { kind: 'human', tunic: '#9aa0a8', tabard: true, pants: '#3a3a40', helm: 'nasal', weapon: 'sword', shield: 'kite', swordLen: 11, scale: 1.04 },
  twoHanded: { kind: 'human', tunic: '#c6cbd2', tabard: true, pants: '#6a6e76', helm: 'great', plume: '#c8302a', weapon: 'twohand', scale: 1.07 },
  spearman: { kind: 'human', tunic: 'team', pants: '#6a5030', helm: 'cap', helmColor: '#8a6a3a', weapon: 'spear', spearLen: 22 },
  pikeman: { kind: 'human', tunic: '#c8b890', tabard: true, pants: '#5a4a30', helm: 'kettle', weapon: 'spear', spearLen: 30 },
  halberdier: { kind: 'human', tunic: '#b8bec6', tabard: true, pants: '#4a4a52', helm: 'kettle', weapon: 'halberd', spearLen: 28, scale: 1.04 },
  archer: { kind: 'human', tunic: 'team', pants: '#5a4a2a', helm: 'hood', helmColor: '#6a7040', weapon: 'bow', quiver: true },
  crossbowman: { kind: 'human', tunic: '#b8a880', tabard: true, pants: '#5a4a2a', helm: 'kettle', weapon: 'xbow', quiver: true },
  arbalester: { kind: 'human', tunic: '#9aa0a8', tabard: true, pants: '#3a3a40', helm: 'kettle', weapon: 'xbow', quiver: true, scale: 1.03 },
  skirmisher: { kind: 'human', tunic: 'team', pants: '#6a5030', helm: 'cap', helmColor: '#9a7a4a', weapon: 'javelin', shield: 'wicker' },
  eliteSkirmisher: { kind: 'human', tunic: '#9aa0a8', tabard: true, pants: '#5a4028', helm: 'kettle', weapon: 'javelin', shield: 'wicker' },
  longbowman: { kind: 'human', tunic: 'team', pants: '#4a5a2a', helm: 'hood', helmColor: '#3f6a30', weapon: 'longbow', quiver: true, scale: 1.02 },
  monk: { kind: 'human', robe: '#7a5838', helm: 'tonsure', weapon: 'staff', belt: 'team' },
  scoutCavalry: { kind: 'rider', tunic: 'team', helm: 'cap', helmColor: LEATHER, weapon: 'sword', swordLen: 8, horse: '#9a6a3a', mane: '#3a2616', cape: true },
  lightCavalry: { kind: 'rider', tunic: '#9aa0a8', tabard: true, helm: 'kettle', weapon: 'sword', swordLen: 9, horse: '#8a7e72', mane: '#2a2420', cape: true },
  knight: { kind: 'rider', tunic: '#c0c5cc', tabard: true, helm: 'great', weapon: 'sword', swordLen: 11, shield: 'kite', horse: '#4a3a2c', mane: '#1a1410', caparison: true },
  cavalier: { kind: 'rider', tunic: '#d0d4da', tabard: true, helm: 'great', plume: 'team', weapon: 'sword', swordLen: 12, shield: 'kite', horse: '#d8d0c6', mane: '#9a9088', caparison: true, scale: 1.04 },
  cavalryArcher: { kind: 'rider', tunic: 'team', helm: 'cap', helmColor: '#8a6a3a', weapon: 'bow', quiver: true, horse: '#8a5a32', mane: '#2a1a10' },
  heavyCavArcher: { kind: 'rider', tunic: '#9aa0a8', tabard: true, helm: 'kettle', weapon: 'bow', quiver: true, horse: '#5a4634', mane: '#1a1410', caparison: true },
  batteringRam: { kind: 'ram', scale: 1.1 }, cappedRam: { kind: 'ram', capped: true, scale: 1.15 },
  mangonel: { kind: 'mangonel', scale: 1.35 }, onager: { kind: 'mangonel', onager: true, scale: 1.45 },
  trebuchet: { kind: 'treb' },
  sheep: { kind: 'sheep' }, deer: { kind: 'deer' }, boar: { kind: 'boar' },
};

// Animation catalogue: frames and seconds per cycle.
export const ANIMS = {
  idle: { frames: 1 }, walk: { frames: 8 }, attack: { frames: 6 }, work: { frames: 6 }, die: { frames: 6 },
};
export function modelOf(type) { return LOOKS[type] || LOOKS.villager; }

// ------------------------------------------------------------------ easing / keyframes
const ease = (t) => t * t * (3 - 2 * t);
function key(frames, t) {
  // frames: [[t0, value], ...] where value is array of numbers; t in [0,1]
  if (t <= frames[0][0]) return frames[0][1];
  for (let i = 0; i < frames.length - 1; i++) {
    const [ta, a] = frames[i], [tb, b] = frames[i + 1];
    if (t <= tb) {
      const k = ease((t - ta) / (tb - ta));
      return a.map((v, j) => v + (b[j] - v) * k);
    }
  }
  return frames[frames.length - 1][1];
}

// ------------------------------------------------------------------ humanoid
const HIP_Z = 12, THIGH = 6.3, SHIN = 6.5, UARM = 5.3, FARM = 5.1;

function basePose() {
  return {
    bob: 0, lean: 0, footL: [0.4, 2.3, 0], footR: [-0.4, -2.3, 0],
    handL: [0.6, 4.6, 12.6], handR: [0.6, -4.6, 12.6], toolR: [0.4, 0, 1], toolL: [1, 0, 0.2],
    kneel: 0, head: 0,
  };
}

function walkLegs(P, t, stride = 3.4) {
  const a = t * TAU;
  P.footL = [Math.sin(a) * stride, 2.3, Math.max(0, Math.cos(a)) * 1.9];
  P.footR = [Math.sin(a + Math.PI) * stride, -2.3, Math.max(0, Math.cos(a + Math.PI)) * 1.9];
  P.bob = -Math.abs(Math.sin(a)) * 0.7 + 0.35;
  P.swing = Math.sin(a);
}

// Pose for anim/t given weapon and task.
function humanPose(look, anim, t, task, carry) {
  const P = basePose();
  const w = look.weapon;
  if (anim === 'walk') {
    walkLegs(P, t);
    P.handL = [-P.swing * 3.2, 4.6, 13];
    P.handR = [P.swing * 3.2, -4.6, 13];
  }
  // default weapon carry positions
  const guard = () => {
    if (w === 'sword') { P.handR = [4, -4.2, 16.5]; P.toolR = [0.55, 0, 0.85]; }
    else if (w === 'twohand') { P.handR = [4.2, -1.6, 17]; P.handL = [4.8, 0.6, 15.5]; P.toolR = [0.35, 0.1, 1]; }
    else if (w === 'spear' || w === 'halberd') { P.handR = [2.2, -4.3, 15]; P.toolR = [0.05, 0, 1]; }
    else if (w === 'bow' || w === 'longbow') { P.handL = [3.4, 4.4, 15.5]; P.toolL = [0.15, 0, 1]; }
    else if (w === 'xbow') { P.handR = [4, -2.4, 15.5]; P.handL = [5.5, 1.2, 16]; P.toolR = [1, 0.1, 0.25]; }
    else if (w === 'javelin') { P.handR = [1.5, -4.6, 18.5]; P.toolR = [0.5, 0, 0.85]; }
    else if (w === 'staff') { P.handR = [2.6, -4.2, 15]; P.toolR = [0.1, 0, 1]; }
  };
  if (anim === 'idle' || anim === 'walk') {
    guard();
    if (task && anim !== 'attack') {
      if (carry) carryPose(P, carry);
      else if (task === 'forage') { P.handL = [2.5, 3.8, 12.5]; }
      else toolHold(P, task);
    }
  } else if (anim === 'attack') {
    attackPose(P, look, t);
  } else if (anim === 'work') {
    workPose(P, task, t);
  } else if (anim === 'die') {
    guard();
    P.fall = Math.min(1, t * 1.15);
    P.handL = [-2, 7, 17 + t * 3]; P.handR = [-2, -7, 17 + t * 3];
  }
  return P;
}

function toolHold(P, task) {
  if (task === 'wood') { P.handR = [2.8, -4.2, 14]; P.toolR = [0.35, 0, 1]; }
  else if (task === 'gold' || task === 'stone') { P.handR = [2.4, -4.2, 14]; P.toolR = [0.3, 0, 1]; }
  else if (task === 'farm') { P.handR = [2.5, -4, 15]; P.toolR = [0.1, 0, 1]; }
  else if (task === 'build') { P.handR = [2.8, -4.3, 13.5]; P.toolR = [0.8, 0, 0.3]; }
  else if (task === 'hunt') { P.handR = [2.6, -4.3, 15.5]; P.toolR = [0.1, 0, 1]; }
  else if (task === 'fish') { P.handR = [2.6, -4.3, 15]; P.toolR = [0.15, 0, 1]; }
}
function carryPose(P, carry) {
  if (carry === 'wood') { P.handR = [1.2, -3.5, 21]; P.handL = [2.5, 3.2, 15]; }
  else { P.handR = [4.2, -2.4, 14.5]; P.handL = [4.2, 2.4, 14.5]; }
}

function attackPose(P, look, t) {
  const w = look.weapon;
  if (w === 'sword' || !w) {
    const h = key([[0, [3, -4.5, 16]], [0.3, [-1, -3.5, 26]], [0.5, [7.5, -1, 14]], [0.7, [6, -0.5, 13]], [1, [4, -4.2, 16.5]]], t);
    const d = key([[0, [0.55, 0, 0.85]], [0.3, [-0.6, -0.2, 0.8]], [0.5, [0.9, 0.3, -0.35]], [0.7, [0.8, 0.4, -0.5]], [1, [0.55, 0, 0.85]]], t);
    P.handR = h; P.toolR = d;
    P.lean = key([[0, [0]], [0.3, [-0.08]], [0.5, [0.18]], [1, [0]]], t)[0];
    P.footL = [2.2, 2.3, 0]; P.footR = [-1.8, -2.3, 0];
  } else if (w === 'twohand') {
    const h = key([[0, [4.2, -1.6, 17]], [0.35, [0.5, -0.8, 27.5]], [0.55, [8, 0, 12]], [1, [4.2, -1.6, 17]]], t);
    const d = key([[0, [0.35, 0.1, 1]], [0.35, [-0.7, 0, 0.7]], [0.55, [0.9, 0, -0.45]], [1, [0.35, 0.1, 1]]], t);
    P.handR = h; P.handL = v3.add(h, [0.6, 2, -1.4]); P.toolR = d;
    P.lean = key([[0, [0]], [0.35, [-0.1]], [0.55, [0.25]], [1, [0]]], t)[0];
    P.footL = [2.5, 2.3, 0]; P.footR = [-2, -2.3, 0];
  } else if (w === 'spear' || w === 'halberd') {
    const h = key([[0, [2, -3.5, 17]], [0.35, [-1.5, -3, 18]], [0.5, [8, -2, 17]], [1, [2, -3.5, 17]]], t);
    P.handR = h; P.handL = v3.add(h, [5, 3.5, 0.6]); P.toolR = [1, 0.15, 0.08];
    if (w === 'halberd') P.toolR = key([[0, [0.3, 0, 1]], [0.35, [-0.4, 0, 1]], [0.55, [1, 0, -0.1]], [1, [0.3, 0, 1]]], t);
    P.lean = key([[0, [0]], [0.5, [0.2]], [1, [0]]], t)[0];
    P.footL = [2.6, 2.3, 0]; P.footR = [-2.2, -2.3, 0];
  } else if (w === 'bow' || w === 'longbow') {
    const draw = key([[0, [0]], [0.5, [1]], [0.62, [0]], [1, [0]]], t)[0];
    P.handL = [7.2, 1.2, 21.5]; P.toolL = [0.15, 0, 1];
    P.handR = [6.2 - draw * 6.5, -0.6 - draw * 0.8, 21.5];
    P.draw = draw;
    P.footL = [2, 2.3, 0]; P.footR = [-1.6, -2.3, 0];
  } else if (w === 'xbow') {
    const rec = key([[0, [0]], [0.5, [0]], [0.58, [1]], [1, [0]]], t)[0];
    P.handR = [4 - rec * 1.2, -1.5, 20.5 + rec * 0.6]; P.handL = [7.8 - rec, 0.4, 20.8]; P.toolR = [1, 0.05, 0.06 + rec * 0.15];
    P.footL = [2, 2.3, 0]; P.footR = [-1.6, -2.3, 0];
  } else if (w === 'javelin') {
    P.handR = key([[0, [1.5, -4.6, 18.5]], [0.4, [-3.5, -4, 24]], [0.55, [7, -2, 22]], [1, [3, -4.4, 16]]], t);
    P.toolR = key([[0, [0.5, 0, 0.85]], [0.4, [0.8, 0, 0.3]], [0.55, [1, 0, 0.1]], [1, [0.5, 0, 0.85]]], t);
    P.hideTool = t > 0.56 && t < 0.9;
    P.lean = key([[0, [0]], [0.4, [-0.12]], [0.55, [0.2]], [1, [0]]], t)[0];
    P.footL = [2.4, 2.3, 0]; P.footR = [-2, -2.3, 0];
  } else if (w === 'staff') {
    const up = Math.sin(t * Math.PI);
    P.handR = [3, -4, 16 + up * 8]; P.toolR = [0.2, 0, 1];
    P.handL = [3.5, 4, 14 + up * 9];
  } else if (w === 'tool') {
    const h = key([[0, [3, -4.5, 16]], [0.35, [0, -4, 25]], [0.55, [7, -1.5, 13]], [1, [3, -4.5, 16]]], t);
    P.handR = h; P.toolR = key([[0, [0.4, 0, 0.9]], [0.35, [-0.4, 0, 0.9]], [0.55, [0.9, 0, -0.3]], [1, [0.4, 0, 0.9]]], t);
  }
}

function workPose(P, task, t) {
  if (task === 'wood') {
    const h = key([[0, [3.5, -4.6, 17]], [0.45, [0.5, -5.5, 22]], [0.62, [7.5, -1, 14.5]], [1, [3.5, -4.6, 17]]], t);
    P.handR = h; P.handL = v3.add(h, [-0.8, 2.2, -2.3]);
    P.toolR = key([[0, [0.5, -0.3, 0.8]], [0.45, [-0.5, -0.6, 0.6]], [0.62, [0.95, 0.35, -0.1]], [1, [0.5, -0.3, 0.8]]], t);
    P.lean = key([[0, [0.05]], [0.62, [0.2]], [1, [0.05]]], t)[0];
    P.footL = [2, 2.3, 0]; P.footR = [-1.5, -2.3, 0];
  } else if (task === 'gold' || task === 'stone') {
    const h = key([[0, [3, -3, 18]], [0.45, [0, -2.5, 27]], [0.62, [7, -1, 11]], [1, [3, -3, 18]]], t);
    P.handR = h; P.handL = v3.add(h, [-0.6, 2.6, -2.2]);
    P.toolR = key([[0, [0.2, 0, 1]], [0.45, [-0.7, 0, 0.7]], [0.62, [0.9, 0, -0.45]], [1, [0.2, 0, 1]]], t);
    P.lean = key([[0, [0.05]], [0.62, [0.3]], [1, [0.05]]], t)[0];
    P.footL = [2, 2.3, 0]; P.footR = [-1.6, -2.3, 0];
  } else if (task === 'farm') {
    const h = key([[0, [3, -3, 17]], [0.45, [2, -3, 22]], [0.65, [7, -1.5, 9]], [1, [3, -3, 17]]], t);
    P.handR = h; P.handL = v3.add(h, [1.5, 2.8, -3]);
    P.toolR = key([[0, [0.3, 0, 1]], [0.45, [0, 0, 1]], [0.65, [0.9, 0, -0.2]], [1, [0.3, 0, 1]]], t);
    P.lean = key([[0, [0.15]], [0.65, [0.4]], [1, [0.15]]], t)[0];
    P.footL = [2, 2.3, 0]; P.footR = [-1.5, -2.3, 0];
  } else if (task === 'build') {
    const h = key([[0, [5, -3.5, 12]], [0.4, [3, -3.8, 19]], [0.55, [7, -2.5, 10]], [1, [5, -3.5, 12]]], t);
    P.handR = h; P.toolR = key([[0, [0.9, 0, 0.3]], [0.4, [0.3, 0, 1]], [0.55, [1, 0, -0.4]], [1, [0.9, 0, 0.3]]], t);
    P.handL = [6, 2.5, 10];
    P.lean = 0.3; P.kneel = 0.35;
  } else if (task === 'forage') {
    const reach = (Math.sin(t * TAU) + 1) / 2;
    P.lean = 0.45;
    P.handR = [6 + reach * 2, -2, 10 - reach * 2];
    P.handL = [4, 3.8, 12];
    P.kneel = 0.15;
  } else if (task === 'hunt') {
    const c = Math.sin(t * TAU);
    P.lean = 0.55; P.kneel = 0.5;
    P.handR = [7 + c * 1.2, -1.6, 5.5 + c * 1.2]; P.toolR = [1, 0, -0.5];
    P.handL = [7, 1.8, 5.5];
  } else if (task === 'fish') {
    const h = key([[0, [3, -3, 20]], [0.45, [2, -3, 23]], [0.6, [8, -1.5, 9]], [1, [3, -3, 20]]], t);
    P.handR = h; P.handL = v3.add(h, [1, 2.8, -2.5]); P.toolR = [0.75, 0, -0.65];
    P.lean = key([[0, [0.1]], [0.6, [0.3]], [1, [0.1]]], t)[0];
  } else {
    attackPose(P, { weapon: 'tool' }, t);
  }
}

function colorOf(c, team) { return c === 'team' ? team.main : c; }

// Draw a humanoid into model m. seat: rider hip height (or null for standing).
function drawHuman(m, look, P, team, v, seat = null, taskInfo = {}) {
  const skin = SKINS[v % SKINS.length];
  const hair = HAIRS[(v >> 3) % HAIRS.length];
  const female = !!taskInfo.female;
  const tunic = colorOf(look.tunic || 'team', team);
  const pants = look.pants || '#5a4028';
  const boots = look.boots || '#3a2616';
  const bob = P.bob || 0;
  const kneel = P.kneel || 0;
  const pz = (seat !== null ? seat : HIP_Z - kneel * 3.5) + bob;
  const pel = [0, 0, pz];
  const lean = P.lean || 0;
  const Lp = (h, y = 0, fwd = 0) => [pel[0] + Math.sin(lean) * h + fwd, pel[1] + y, pel[2] + Math.cos(lean) * h];
  const chest = Lp(7.2), neck = Lp(10.2), head = Lp(13.3, 0, 0.2);
  const shL = Lp(8.1, 4.1), shR = Lp(8.1, -4.1);
  const robe = look.robe;
  // ---------------- legs
  if (seat !== null) {
    for (const s of [1, -1]) {
      const hip = [0, 2 * s, pz], knee = [3.2, 5.2 * s, pz - 4.6], foot = [1.2, 5.6 * s, pz - 10.5];
      m.limb(hip, knee, 1.8, 1.6, pants);
      m.limb(knee, foot, 1.55, 1.3, boots);
    }
  } else if (robe || female) {
    const skirtCol = robe || tunic;
    const top = Lp(1.5), r0 = 3.6, r1 = robe ? 5.4 : 5.0;
    const seg = 10;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
      const sw = (P.swing || 0) * 0.8;
      m.poly([
        [top[0] + Math.cos(a0) * r0, top[1] + Math.sin(a0) * r0, top[2]],
        [top[0] + Math.cos(a1) * r0, top[1] + Math.sin(a1) * r0, top[2]],
        [Math.cos(a1) * r1 + sw * Math.cos(a1), Math.sin(a1) * r1, 0.8],
        [Math.cos(a0) * r1 + sw * Math.cos(a0), Math.sin(a0) * r1, 0.8],
      ], skirtCol, { twoSided: false });
    }
    if (female && !robe) {
      // apron
      m.poly([[top[0] + 3.4, -2.2, top[2] - 0.5], [top[0] + 3.4, 2.2, top[2] - 0.5], [4.6, 2.8, 2.5], [4.6, -2.8, 2.5]], '#e8dcc0', { bias: 0.4 });
    }
    for (const [f, s] of [[P.footL, 1], [P.footR, -1]]) m.limb([f[0] + 0.2, f[1] * 0.8, 0.9], [f[0] + 2, f[1] * 0.8, 0.8], 1.1, 1.0, boots);
  } else {
    for (const [f, s] of [[P.footL, 1], [P.footR, -1]]) {
      const hip = [pel[0], 2.0 * s, pz];
      const foot = [f[0], f[1], f[2] + 1.1];
      const { J } = ik(hip, foot, THIGH, SHIN, [1, 0.1 * s, 0]);
      m.limb(hip, J, 1.85, 1.55, pants);
      m.limb(J, foot, 1.5, 1.25, boots);
      m.limb(foot, [foot[0] + 2.0, foot[1], foot[2] - 0.4], 1.15, 1.05, boots);
    }
  }
  // ---------------- torso
  const bodyCol = robe || (look.tabard ? team.main : tunic);
  m.limb(Lp(0.3), chest, 3.3, 3.95, bodyCol);
  if (look.tabard) {
    // metal collar & shoulders over a team-coloured surcoat, with a heraldic stripe
    m.sphere(Lp(8.6), 2.5, look.tunic, { sq: 0.7, bias: 0.2 });
    const f = (h, y) => { const p = Lp(h, y); return [p[0] + 3.5, p[1], p[2]]; };
    m.poly([f(6.5, -0.7), f(6.5, 0.7), f(0.5, 0.7), f(0.5, -0.7)], '#e8d27a', { bias: 0.9 });
    // mail skirt below the surcoat
    m.limb(Lp(-0.8), Lp(0.8), 3.45, 3.35, look.tunic, { bias: -0.05 });
  }
  if (robe && look.helm === 'tonsure') {
    const f = (h, y) => { const p = Lp(h, y); return [p[0] + 3.4, p[1], p[2]]; };
    m.poly([f(8, -1.4), f(8, 1.4), f(-3, 1.8), f(-3, -1.8)], team.main, { bias: 0.8 });
  }
  if (look.belt || !robe) {
    const bc = look.belt === 'team' ? team.main : '#3a2414';
    m.limb(Lp(1.2), Lp(2.2), 3.55, 3.6, bc, { bias: 0.1 });
  }
  if (look.cape) {
    const c = team.main;
    m.poly([Lp(8.3, 3.8, -1.2), Lp(8.3, -3.8, -1.2), [pel[0] - 3.5 - (P.swing || 0) * 0.3, -4.2, pz - 5], [pel[0] - 3.5, 4.2, pz - 5]], c, { bias: -1.5 });
  }
  if (look.quiver) {
    const a = Lp(3, -1.6, -3), b = Lp(11, -2.4, -4);
    m.limb(a, b, 1.3, 1.5, DARKLEATHER, { bias: -1 });
    m.line(b, v3.add(b, [0.3, -0.3, 2.2]), 0.7, '#e8e0d0', { bias: -1 });
    m.line(v3.add(b, [0, 0.8, 0]), v3.add(b, [0.1, 0.5, 2.4]), 0.7, '#c83a2a', { bias: -1 });
  }
  // ---------------- head
  m.limb(chest, neck, 1.4, 1.3, skin);
  m.sphere(head, 3.25, skin);
  const fwd = [Math.cos(0), 0, 0];
  void fwd;
  const hc = look.helmColor || LEATHER;
  const eye = (s) => m.sphere([head[0] + 2.9, head[1] + 1.15 * s, head[2] + 0.35], 0.42, '#231a14', { flat: true, bias: 0.02 });
  switch (look.helm) {
    case 'cap': m.sphere([head[0] - 0.3, head[1], head[2] + 1.1], 3.35, hc, { sq: 0.8, bias: 0.05 }); eye(1); eye(-1); break;
    case 'kettle':
      m.disc([head[0] - 0.2, head[1], head[2] + 1.6], [0, 0, 1], 4.9, IRON, { bias: 0.2 });
      m.sphere([head[0] - 0.2, head[1], head[2] + 1.4], 3.35, STEEL, { sq: 0.85, bias: 0.3 }); eye(1); eye(-1); break;
    case 'nasal':
      m.sphere([head[0] - 0.2, head[1], head[2] + 1], 3.45, STEEL, { bias: 0.1 });
      m.limb([head[0] + 3.2, head[1], head[2] + 2], [head[0] + 3.3, head[1], head[2] - 1], 0.45, 0.45, IRON, { bias: 0.2 }); eye(1); eye(-1); break;
    case 'great':
      m.limb([head[0], head[1], head[2] - 2.6], [head[0], head[1], head[2] + 2.4], 3.5, 3.4, STEEL, { bias: 0.1 });
      m.poly([[head[0] + 3.45, head[1] - 2, head[2] + 0.6], [head[0] + 3.45, head[1] + 2, head[2] + 0.6], [head[0] + 3.4, head[1] + 2, head[2] - 0.1], [head[0] + 3.4, head[1] - 2, head[2] - 0.1]], '#1a1a1a', { noShade: true, bias: 0.5 });
      break;
    case 'hood':
      m.sphere([head[0] - 0.5, head[1], head[2] + 0.5], 3.65, hc, { bias: 0.05 });
      m.limb([head[0] - 2, head[1], head[2] + 1.5], [head[0] - 4.2, head[1], head[2] - 1.5], 1.8, 0.5, hc, { bias: -0.2 });
      m.sphere([head[0] + 1.6, head[1], head[2] - 0.2], 2.1, skin, { bias: 0.5 }); eye(1); eye(-1); break;
    case 'tonsure':
      m.sphere([head[0] - 0.6, head[1], head[2] - 0.5], 3.2, '#6a4a2a', { sq: 0.7, bias: -0.05 }); eye(1); eye(-1); break;
    default:
      if (female) {
        m.sphere([head[0] - 0.6, head[1], head[2] + 0.7], 3.2, hair, { bias: -0.02 });
        m.sphere([head[0] - 3.2, head[1], head[2] + 0.6], 1.7, hair, { bias: -0.1 });
        if (v % 3 === 0) m.sphere([head[0] - 0.3, head[1], head[2] + 1.2], 3.4, '#d8c8a8', { sq: 0.75, bias: 0.05 });
      } else if (taskInfo.hat) {
        m.disc([head[0] - 0.2, head[1], head[2] + 1.8], [0, 0, 1], 5.3, '#c8a458', { bias: 0.2 });
        m.sphere([head[0] - 0.2, head[1], head[2] + 2.1], 2.6, '#b89448', { sq: 0.8, bias: 0.3 });
      } else m.sphere([head[0] - 0.7, head[1], head[2] + 0.8], 3.05, hair, { bias: -0.02 });
      eye(1); eye(-1);
  }
  if (look.plume) m.limb([head[0] - 0.5, head[1], head[2] + 3.4], [head[0] - 4, head[1], head[2] + 6], 1.1, 0.5, colorOf(look.plume, team), { bias: 0.3 });
  // ---------------- arms & gear
  const sleeve = robe || (look.tabard ? look.tunic : tunic);
  const armsDrawn = {};
  for (const [side, sh, hand] of [['L', shL, P.handL], ['R', shR, P.handR]]) {
    const s = side === 'L' ? 1 : -1;
    const tgt = [hand[0], hand[1], hand[2] + (P.bob || 0) - kneel * 3.5];
    if (seat !== null) tgt[2] = hand[2] + (pz - HIP_Z);
    const { J, E } = ik(sh, tgt, UARM, FARM, [-1, 0.35 * s, -0.25]);
    m.limb(sh, J, 1.45, 1.3, sleeve);
    m.limb(J, E, 1.25, 1.1, robe ? robe : skin);
    m.sphere(E, 1.15, skin);
    armsDrawn[side] = { J, E };
  }
  drawGear(m, look, P, team, armsDrawn, taskInfo);
}

function drawGear(m, look, P, team, arms, info) {
  const R = arms.R.E, L = arms.L.E;
  const dR = v3.norm(P.toolR || [0, 0, 1]);
  const w = info.tool || look.weapon;
  const along = (o, d, a, b) => [v3.add(o, v3.mul(d, a)), v3.add(o, v3.mul(d, b))];
  if (!P.hideTool) {
    if (w === 'sword') {
      const len = look.swordLen || 9;
      const [h0, h1] = along(R, dR, -1.6, 1.2);
      m.line(h0, h1, 1.3, '#4a3220', { bias: 0.3 });
      const perp = v3.norm(v3.cross(dR, [0, 0, 1])[0] ? v3.cross(dR, [0, 0, 1]) : [0, 1, 0]);
      m.line(v3.add(h1, v3.mul(perp, 2)), v3.add(h1, v3.mul(perp, -2)), 1.1, IRON, { bias: 0.35 });
      const [b0, b1] = along(R, dR, 1.2, len);
      m.poly([v3.add(b0, v3.mul(perp, 0.8)), v3.add(b1, v3.mul(perp, 0.35)), v3.add(b1, v3.mul(dR, 1.2)), v3.add(b1, v3.mul(perp, -0.35)), v3.add(b0, v3.mul(perp, -0.8))], STEEL, { bias: 0.4, stroke: '#6a6e76' });
    } else if (w === 'twohand') {
      const [h0, h1] = along(R, dR, -3.5, 1.2);
      m.line(h0, h1, 1.4, '#3a2618', { bias: 0.3 });
      const perp = v3.norm(v3.cross(dR, [0, 0, 1])[0] ? v3.cross(dR, [0, 0, 1]) : [0, 1, 0]);
      m.line(v3.add(h1, v3.mul(perp, 2.8)), v3.add(h1, v3.mul(perp, -2.8)), 1.3, IRON, { bias: 0.35 });
      const [b0, b1] = along(R, dR, 1.2, 15);
      m.poly([v3.add(b0, v3.mul(perp, 1)), v3.add(b1, v3.mul(perp, 0.5)), v3.add(b1, v3.mul(dR, 1.5)), v3.add(b1, v3.mul(perp, -0.5)), v3.add(b0, v3.mul(perp, -1))], STEEL, { bias: 0.4, stroke: '#6a6e76' });
    } else if (w === 'spear' || w === 'halberd') {
      const len = look.spearLen || 22;
      const [s0, s1] = along(R, dR, -len * 0.35, len * 0.65);
      m.line(s0, s1, 1.1, WOOD, { bias: 0.3 });
      const tip = v3.add(s1, v3.mul(dR, 3.2));
      const perp = v3.norm(v3.cross(dR, [0, 0, 1])[0] ? v3.cross(dR, [0, 0, 1]) : [0, 1, 0]);
      m.poly([v3.add(s1, v3.mul(perp, 1)), tip, v3.add(s1, v3.mul(perp, -1))], STEEL, { bias: 0.4 });
      if (w === 'halberd') {
        const a = v3.add(s1, v3.mul(dR, -2.5));
        m.poly([a, v3.add(a, v3.mul(perp, 3.4)), v3.add(v3.add(a, v3.mul(perp, 3.2)), v3.mul(dR, -3.5)), v3.add(a, v3.mul(dR, -2.6))], STEEL, { bias: 0.45, stroke: '#6a6e76' });
      }
    } else if (w === 'javelin') {
      const [s0, s1] = along(R, dR, -5, 8);
      m.line(s0, s1, 0.9, '#8a6a40', { bias: 0.3 });
      m.poly([v3.add(s1, [0, 0.5, 0]), v3.add(s1, v3.mul(dR, 2.2)), v3.add(s1, [0, -0.5, 0])], STEEL, { bias: 0.35 });
    } else if (w === 'staff') {
      const [s0, s1] = along(R, dR, -12, 6);
      m.line(s0, s1, 1.2, '#6a4a2a', { bias: 0.3 });
    } else if (w === 'xbow') {
      const s0 = v3.add(R, v3.mul(dR, -1)), s1 = v3.add(R, v3.mul(dR, 7.5));
      m.line(s0, s1, 1.4, '#5a3a20', { bias: 0.4 });
      const perp = [-dR[1], dR[0], 0];
      const pn = v3.norm(perp[0] || perp[1] ? perp : [0, 1, 0]);
      const bow0 = v3.add(s1, v3.mul(pn, 4.2)), bow1 = v3.add(s1, v3.mul(pn, -4.2));
      m.line(v3.add(bow0, v3.mul(dR, -1.2)), s1, 1, '#3a2a1a', { bias: 0.45 });
      m.line(s1, v3.add(bow1, v3.mul(dR, -1.2)), 1, '#3a2a1a', { bias: 0.45 });
      m.line(v3.add(bow0, v3.mul(dR, -1.2)), v3.add(R, v3.mul(dR, 2)), 0.4, '#e8e0c8', { bias: 0.46 });
      m.line(v3.add(bow1, v3.mul(dR, -1.2)), v3.add(R, v3.mul(dR, 2)), 0.4, '#e8e0c8', { bias: 0.46 });
    } else if (w === 'axe') {
      const [s0, s1] = along(R, dR, -2, 7);
      m.line(s0, s1, 1.1, WOOD, { bias: 0.3 });
      const perp = v3.norm(v3.cross(dR, [0, 0, 1])[0] ? v3.cross(dR, [0, 0, 1]) : [0, 1, 0]);
      const hd = v3.add(s1, v3.mul(dR, -1.2));
      m.poly([hd, v3.add(hd, v3.mul(perp, 3)), v3.add(v3.add(hd, v3.mul(perp, 3.2)), v3.mul(dR, 1.8)), v3.add(hd, v3.mul(dR, 1.2))], IRON, { bias: 0.4 });
    } else if (w === 'pick') {
      const [s0, s1] = along(R, dR, -2, 7);
      m.line(s0, s1, 1.1, WOOD, { bias: 0.3 });
      const perp = v3.norm(v3.cross(dR, [0, 1, 0])[0] || v3.cross(dR, [0, 1, 0])[2] ? v3.cross(dR, [0, 1, 0]) : [1, 0, 0]);
      m.line(v3.add(s1, v3.mul(perp, 3.2)), v3.add(s1, v3.mul(perp, -3.2)), 1.1, IRON, { bias: 0.35 });
    } else if (w === 'hoe') {
      const [s0, s1] = along(R, dR, -3, 9);
      m.line(s0, s1, 1, WOOD, { bias: 0.3 });
      m.line(s1, v3.add(s1, [0.6, 0, -2.4]), 1.6, IRON, { bias: 0.35 });
    } else if (w === 'hammer') {
      const [s0, s1] = along(R, dR, -1, 4.5);
      m.line(s0, s1, 1, WOOD, { bias: 0.3 });
      m.sphere(s1, 1.3, '#4a4a50', { bias: 0.35 });
    } else if (w === 'knife') {
      const [s0, s1] = along(R, dR, 0, 3);
      m.line(s0, s1, 0.8, STEEL, { bias: 0.35 });
    } else if (w === 'fishspear') {
      const [s0, s1] = along(R, dR, -6, 10);
      m.line(s0, s1, 0.9, WOOD, { bias: 0.3 });
      m.line(s1, v3.add(s1, v3.mul(dR, 2)), 0.9, STEEL, { bias: 0.3 });
    }
  }
  if (w === 'bow' || w === 'longbow') {
    const dL = v3.norm(P.toolL || [0, 0, 1]);
    const len = w === 'longbow' ? 12 : 9;
    const fwdv = [1, 0, 0];
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const s = i / 4 - 1;
      pts.push(v3.add(v3.add(L, v3.mul(dL, s * len)), v3.mul(fwdv, (1 - s * s) * 2.4)));
    }
    for (let i = 0; i < 8; i++) m.line(pts[i], pts[i + 1], 1.1, '#6a4020', { bias: 0.5 });
    const top = pts[0], bot = pts[8];
    const pull = P.draw ? v3.add(arms.R.E, [0, 0, 0]) : v3.add(L, [-0.4, 0, 0]);
    m.line(top, pull, 0.35, '#efe8d8', { bias: 0.52 });
    m.line(pull, bot, 0.35, '#efe8d8', { bias: 0.52 });
    if (P.draw > 0.1) m.line(pull, v3.add(pull, [9, 0.4, 0]), 0.6, '#caa070', { bias: 0.55 });
  }
  if (look.shield === 'round') {
    const c = v3.add(v3.lerp(arms.L.J, L, 0.55), [0.8, 1.5, 0]);
    m.disc(c, [0.35, 1, 0.05], 4.2, team.main, { bias: 0.6, stroke: '#3a3a3a', seg: 14 });
    m.disc(v3.add(c, [0.05, 0.12, 0]), [0.35, 1, 0.05], 1.2, '#c8ccd2', { bias: 0.65, seg: 8 });
  } else if (look.shield === 'kite') {
    const c = v3.add(v3.lerp(arms.L.J, L, 0.55), [0.8, 1.6, 0]);
    const n = v3.norm([0.35, 1, 0.05]), up = [0, 0, 1], side = v3.norm(v3.cross(up, n));
    const P2 = (a, b) => v3.add(c, v3.add(v3.mul(side, a), v3.mul(up, b)));
    m.poly([P2(-3.4, 4.5), P2(3.4, 4.5), P2(3.2, 0), P2(0, -6.5), P2(-3.2, 0)], team.main, { bias: 0.6, stroke: '#2a2a2a' });
    m.poly([P2(-0.6, 4), P2(0.6, 4), P2(0.5, -5), P2(-0.5, -5)], '#e8d27a', { bias: 0.65 });
  } else if (look.shield === 'wicker') {
    const c = v3.add(v3.lerp(arms.L.J, L, 0.5), [0.6, 1.4, 0]);
    m.disc(c, [0.3, 1, 0], 3.6, '#b89a60', { bias: 0.6, stroke: '#6a5030', seg: 12 });
  }
  // carried resources
  const carry = info.carry;
  if (carry === 'wood') {
    const s = v3.add(R, [-1.5, 0, 0.5]);
    for (let k = 0; k < 3; k++) m.limb(v3.add(s, [-4, 1.2 - k * 1.1, k * 0.4]), v3.add(s, [4.5, 1.8 - k * 1.1, k * 0.4 + 0.8]), 0.9, 0.9, k === 1 ? '#8a6038' : '#7a5230', { bias: 0.5 });
  } else if (carry === 'food') {
    m.sphere(v3.add(v3.lerp(R, L, 0.5), [1.3, 0, -0.8]), 2.4, info.task === 'farm' ? '#d8b84a' : info.task === 'forage' ? '#a83a4a' : '#b8584a', { bias: 0.5 });
  } else if (carry === 'gold') {
    const c = v3.add(v3.lerp(R, L, 0.5), [1.3, 0, -1]);
    m.sphere(c, 2.4, '#8a6a3a', { bias: 0.45 });
    m.sphere(v3.add(c, [0.5, 0.4, 1.4]), 1.1, '#f0cc40', { bias: 0.5 });
    m.sphere(v3.add(c, [0.3, -0.8, 1.2]), 0.9, '#e8c030', { bias: 0.5 });
  } else if (carry === 'stone') {
    m.box(v3.add(v3.lerp(R, L, 0.5), [1.5, 0, -0.6]), 2.2, 2.2, 1.8, '#9a968e', { bias: 0.5 });
  }
  if (info.task === 'forage' && !carry) {
    const c = v3.add(L, [0.5, 0.8, -1.5]);
    m.box(c, 1.8, 1.8, 1.4, '#a8864a', { bias: 0.4 });
  }
}

// ------------------------------------------------------------------ horse
function drawHorse(m, look, anim, t, team, v) {
  const col = look.horse;
  const mane = look.mane;
  const moving = anim === 'walk';
  const a = t * TAU;
  const bob = moving ? Math.abs(Math.sin(a)) * 1.1 : 0;
  const bz = 18.5 + bob;
  const legs = [
    ['FL', 8, 3.2, 0], ['FR', 8, -3.2, Math.PI], ['BL', -8.5, 3.2, Math.PI], ['BR', -8.5, -3.2, 0],
  ];
  for (const [, lx, ly, ph] of legs) {
    const hip = [lx, ly, bz - 3.5];
    let foot;
    if (moving) foot = [lx + Math.sin(a + ph) * 4.8, ly, Math.max(0, Math.cos(a + ph)) * 3.2 + 0.6];
    else if (anim === 'attack' && lx > 0) foot = [lx + 1 + Math.sin(t * Math.PI) * 2, ly, 0.6 + Math.sin(t * Math.PI) * 3];
    else foot = [lx + (lx > 0 ? 0.6 : -0.4), ly, 0.6];
    const { J } = ik(hip, foot, 7.6, 8.2, [lx > 0 ? -1 : 1, 0, 0.1]);
    m.limb(hip, J, 2.2, 1.5, col);
    m.limb(J, foot, 1.4, 1.1, col);
    m.sphere(foot, 1.2, '#2a2018', { bias: 0.05 });
  }
  m.limb([-9, 0, bz + 0.5], [8.5, 0, bz + 1.2], 5.4, 6.0, col);
  const head0 = [14.5, 0, bz + 10.5];
  m.limb([9, 0, bz + 2.5], head0, 3.6, 2.6, col);
  m.limb(head0, [19.5, 0, bz + 6.8], 2.6, 1.8, col);
  m.limb([8.2, 0, bz + 5.5], [13.8, 0, bz + 12.5], 1.4, 1.2, mane, { bias: -0.3 });
  m.limb([14.2, 1, bz + 12], [13.4, 1.2, bz + 14.2], 0.7, 0.4, col);
  m.limb([14.2, -1, bz + 12], [13.4, -1.2, bz + 14.2], 0.7, 0.4, col);
  const tailSw = moving ? Math.sin(a * 2) * 1.5 : 0;
  m.limb([-13.2, 0, bz + 2], [-16, tailSw, bz - 7], 1.6, 0.8, mane);
  // saddle
  m.limb([-2.5, 0, bz + 5.2], [2.5, 0, bz + 5.4], 3.4, 3.4, '#5a3220', { bias: 0.1 });
  if (look.caparison) {
    for (const s of [1, -1]) {
      m.poly([[-10, 5.3 * s, bz + 4], [9, 5.8 * s, bz + 4.5], [9.5, 6 * s, bz - 5], [-10.5, 5.6 * s, bz - 5]], team.main, { bias: 0.9 * s > 0 ? 0.2 : 0.2 });
      m.poly([[-10.5, 5.62 * s, bz - 4], [9.5, 6.02 * s, bz - 4], [9.5, 6.02 * s, bz - 5.2], [-10.5, 5.62 * s, bz - 5.2]], '#e8d27a', { bias: 0.3 });
    }
    m.poly([[9, 5.8, bz + 4.5], [9, -5.8, bz + 4.5], [11.5, -4.5, bz - 3], [11.5, 4.5, bz - 3]], team.main, { bias: 0.25 });
  }
  return bz + 5.5;
}

// ------------------------------------------------------------------ siege
function drawRam(m, look, anim, t, team) {
  const moving = anim === 'walk';
  const wood = '#6a4424', hide = look.capped ? '#6a6e76' : '#7a6448';
  for (const [x, y] of [[-10, 8.5], [10, 8.5], [-10, -8.5], [10, -8.5]]) {
    m.disc([x, y, 4.5], [0, 1, 0], 4.5, '#4a321c', { stroke: '#2a1a0c', seg: 12 });
    m.disc([x, y + Math.sign(y) * 0.3, 4.5], [0, 1, 0], 1.3, '#8a8a8a', { seg: 8 });
  }
  const thrust = anim === 'attack' ? Math.sin(Math.min(1, t * 1.6) * Math.PI) * 6 : 0;
  m.limb([-8 + thrust, 0, 11], [19 + thrust, 0, 11], 2.4, 2.4, '#8a6038', { bias: -0.5 });
  m.sphere([20 + thrust, 0, 11], 3.2, '#3a3a40', { bias: -0.4 });
  m.box([0, 0, 10], 15, 8, 3, wood, {});
  // roof
  const z0 = 13, z1 = 26;
  m.poly([[-15, -9, z0], [15, -9, z0], [15, 0, z1], [-15, 0, z1]], hide, { stroke: '#3a2a1a' });
  m.poly([[-15, 9, z0], [15, 9, z0], [15, 0, z1], [-15, 0, z1]], hide, { stroke: '#3a2a1a' });
  m.poly([[15, -9, z0], [15, 9, z0], [15, 0, z1]], '#5a3a20', { stroke: '#3a2a1a' });
  m.poly([[-15, -9, z0], [-15, 9, z0], [-15, 0, z1]], '#5a3a20', { stroke: '#3a2a1a' });
  if (look.capped) m.box([16, 0, 17], 2, 7, 5, '#5a5e66', {});
  m.line([-11, 0, 25], [-11, 0, 33], 0.7, '#3a2a1a');
  m.poly([[-11, 0, 33], [-11, 0, 29.5], [-6.5, 0, 31.2]], team.main, { bias: 0.3 });
  void moving;
}

function drawMangonel(m, look, anim, t, team) {
  const wood = '#7a5230';
  for (const [x, y] of [[-8, 7], [8, 7], [-8, -7], [8, -7]]) m.disc([x, y, 4], [0, 1, 0], 4, '#4a321c', { stroke: '#2a1a0c', seg: 12 });
  m.box([0, 5.5, 6], 13, 1.4, 1.6, wood, {});
  m.box([0, -5.5, 6], 13, 1.4, 1.6, wood, {});
  m.box([-6, 0, 6.5], 1.6, 6, 1.4, wood, {});
  m.box([6, 0, 6.5], 1.6, 6, 1.4, wood, {});
  // uprights
  m.limb([3, 5, 7], [3, 4.2, 18], 1, 1, wood);
  m.limb([3, -5, 7], [3, -4.2, 18], 1, 1, wood);
  // throwing arm: rests pulled back with the bucket low at the rear, swings up to the padded crossbar
  let th;
  if (anim === 'attack') th = t < 0.45 ? 0.3 : t < 0.58 ? 0.3 + ((t - 0.45) / 0.13) * 1.45 : 1.75 - ((t - 0.58) / 0.42) * 1.45;
  else th = 0.3;
  const piv = [2, 0, 8];
  const tip = [piv[0] - Math.cos(th) * 15, 0, piv[2] + Math.sin(th) * 15];
  m.limb(piv, tip, 1.3, 1.0, '#8a6038', { bias: 0.5 });
  m.sphere(tip, 2.4, '#5a3a20', { bias: 0.55 });
  if (anim !== 'attack' || t < 0.5) m.sphere([tip[0], 0, tip[2] + 1.6], 1.7, '#8a8680', { bias: 0.6 });
  m.limb([3, -4.2, 18], [3, 4.2, 18], 1.6, 1.6, '#a8844a', { bias: 0.2 });
  // torsion bundle & team pennant
  m.limb([2, -3.5, 8], [2, 3.5, 8], 2, 2, '#4a3a2a');
  m.line([-8, 0, 7], [-8, 0, 17], 0.7, '#3a2a1a');
  m.poly([[-8, 0, 17], [-8, 0, 13.5], [-3.5, 0, 15.2]], team.main, { bias: 0.3 });
  if (look.onager) m.box([7, 0, 9], 2.5, 3, 2, '#5a5e66', {});
}

function drawTreb(m, look, anim, t, team) {
  const wood = '#7a5230';
  m.box([0, 7, 2], 16, 1.8, 2, wood, {});
  m.box([0, -7, 2], 16, 1.8, 2, wood, {});
  for (const x of [-12, 12]) m.box([x, 0, 2], 2, 8, 2, wood, {});
  for (const s of [1, -1]) {
    m.limb([-9, 6.5 * s, 3], [0, 3.5 * s, 36], 1.4, 1.2, wood);
    m.limb([9, 6.5 * s, 3], [0, 3.5 * s, 36], 1.4, 1.2, wood);
  }
  m.limb([0, -4.5, 36], [0, 4.5, 36], 1.3, 1.3, '#5a3a20');
  let ang;
  if (anim === 'attack') ang = t < 0.4 ? -0.5 : t < 0.6 ? -0.5 + ((t - 0.4) / 0.2) * 2.3 : 1.8 - ((t - 0.6) / 0.4) * 2.3;
  else ang = -0.5;
  const piv = [0, 0, 36];
  const longEnd = [piv[0] - Math.cos(ang) * 30, 0, piv[2] - Math.sin(ang) * 30 * -1];
  const shortEnd = [piv[0] + Math.cos(ang) * 9, 0, piv[2] - Math.sin(ang) * 9];
  m.limb(shortEnd, longEnd, 1.6, 1.0, '#8a6038', { bias: 0.4 });
  m.box([shortEnd[0], 0, shortEnd[2] - 5], 4, 4, 4, '#5a5a5e', { bias: 0.45 });
  m.line(longEnd, [longEnd[0] + 2, 0, longEnd[2] - 8], 0.5, '#d8d0b8', { bias: 0.45 });
  m.line([-10, 0, 4], [-10, 0, 22], 0.8, '#3a2a1a');
  m.poly([[-10, 0, 22], [-10, 0, 17.5], [-4.5, 0, 19.7]], team.main, { bias: 0.3 });
}

// ------------------------------------------------------------------ animals
function quadLegs(m, anim, t, bz, pts, col, lens, hoof) {
  const moving = anim === 'walk';
  const a = t * TAU;
  for (const [lx, ly, ph] of pts) {
    const hip = [lx, ly, bz - 1.5];
    const foot = moving ? [lx + Math.sin(a + ph) * 2.6, ly, Math.max(0, Math.cos(a + ph)) * 1.6 + 0.4] : [lx, ly, 0.4];
    const { J } = ik(hip, foot, lens[0], lens[1], [lx > 0 ? -1 : 1, 0, 0]);
    m.limb(hip, J, 1.0, 0.75, col);
    m.limb(J, foot, 0.7, 0.55, hoof || col);
  }
}

function drawSheep(m, anim, t, team, owned) {
  const bz = 9 + (anim === 'walk' ? Math.abs(Math.sin(t * TAU)) * 0.5 : 0);
  quadLegs(m, anim, t, bz, [[4, 2, 0], [4, -2, Math.PI], [-4, 2, Math.PI], [-4, -2, 0]], '#3a3430', [4.2, 4.6]);
  const wool = '#eeeae0';
  m.sphere([-3, 0, bz + 1.5], 4.6, wool);
  m.sphere([1.5, 0, bz + 2], 4.8, wool);
  m.sphere([-0.5, 1.5, bz + 3.5], 3.8, '#f6f3ec');
  m.sphere([-0.5, -1.5, bz + 3.5], 3.8, '#f4f0e8');
  const eat = anim === 'idle' ? 0 : 0;
  m.sphere([6.5, 0, bz + 3 - eat], 2.4, '#2e2a26');
  m.limb([6, 1.6, bz + 4], [5.2, 3, bz + 3.2], 0.6, 0.4, '#2e2a26');
  m.limb([6, -1.6, bz + 4], [5.2, -3, bz + 3.2], 0.6, 0.4, '#2e2a26');
  if (owned) m.limb([4.2, 0, bz + 4.4], [4.6, 0, bz + 1.2], 1.2, 1.2, team.main, { bias: 0.4 });
}

function drawDeer(m, anim, t, v) {
  const col = '#9a6a3c', light = '#e8d8c0';
  const bz = 14 + (anim === 'walk' ? Math.abs(Math.sin(t * TAU)) * 0.8 : 0);
  quadLegs(m, anim, t, bz, [[5.5, 1.8, 0], [5.5, -1.8, Math.PI], [-5.5, 1.8, Math.PI], [-5.5, -1.8, 0]], col, [6.5, 7.2], '#3a2a1a');
  m.limb([-7, 0, bz + 1], [6, 0, bz + 1.6], 3.2, 3.6, col);
  m.limb([6.5, 0, bz + 2.5], [10, 0, bz + 9], 1.8, 1.4, col);
  m.limb([10, 0, bz + 9.5], [13.5, 0, bz + 8], 1.7, 1.1, col);
  m.sphere([-8, 0, bz + 2.5], 1.3, light);
  m.limb([10, 1, bz + 10.5], [9.4, 2.2, bz + 12], 0.5, 0.3, col);
  m.limb([10, -1, bz + 10.5], [9.4, -2.2, bz + 12], 0.5, 0.3, col);
  if (v % 2 === 0) {
    for (const s of [1, -1]) {
      m.line([9.8, 0.8 * s, bz + 11], [8.8, 2.6 * s, bz + 16], 0.7, '#d8c8a8');
      m.line([9.2, 1.8 * s, bz + 13.5], [11, 2.8 * s, bz + 15.5], 0.6, '#d8c8a8');
    }
  }
}

function drawBoar(m, anim, t) {
  const col = '#4a3a2e', dark = '#2e241c';
  const bz = 8.5 + (anim === 'walk' ? Math.abs(Math.sin(t * TAU)) * 0.5 : 0);
  quadLegs(m, anim, t, bz, [[4.5, 2.3, 0], [4.5, -2.3, Math.PI], [-4.5, 2.3, Math.PI], [-4.5, -2.3, 0]], dark, [4, 4.4]);
  m.limb([-6, 0, bz + 1.5], [4.5, 0, bz + 2.5], 4.4, 5, col);
  m.limb([3, 0, bz + 6.5], [-4, 0, bz + 6], 1.2, 0.9, '#2a2018', { bias: 0.3 });
  const lunge = anim === 'attack' ? Math.sin(t * Math.PI) * 2 : 0;
  m.limb([7 + lunge, 0, bz + 2.5], [11.5 + lunge, 0, bz + 0.5], 3.2, 1.6, col);
  for (const s of [1, -1]) m.line([10.8 + lunge, 1 * s, bz + 0.4], [12 + lunge, 1.6 * s, bz + 2.2], 0.8, '#efe6d0');
  m.limb([6.5, 1.6, bz + 5], [5.8, 2.4, bz + 6.8], 0.7, 0.4, col);
  m.limb([6.5, -1.6, bz + 5], [5.8, -2.4, bz + 6.8], 0.7, 0.4, col);
  m.line([-7.5, 0, bz + 2.5], [-9, 0, bz + 1], 0.6, dark);
}

// ------------------------------------------------------------------ public
const TOOL_OF_TASK = { wood: 'axe', gold: 'pick', stone: 'pick', farm: 'hoe', build: 'hammer', hunt: 'knife', fish: 'fishspear' };

// Build a Model for the given unit state and render it.
export function unitSprite(type, team, anim, frame, dir, variant = 0, task = null, carry = null, owned = false) {
  const look = LOOKS[type] || LOOKS.villager;
  const facing = dirToFacing(dir);
  const m = new Model(facing);
  const frames = ANIMS[anim] ? ANIMS[anim].frames : 1;
  const t = frames > 1 ? frame / frames : 0;
  const scale = look.scale || 1;
  const dieT = anim === 'die' ? Math.min(1, (frame + 1) / frames) : 0;
  if (anim === 'die') { m.fallA = ease(dieT) * (look.kind === 'human' ? 1.45 : 1.35); m.fallAxis = look.kind === 'human' ? 'y' : 'x'; }
  if (look.kind === 'human') {
    const female = type === 'villager' && variant % 2 === 1;
    let info = { female, carry: null, task, hat: type === 'villager' && !female && variant % 4 === 0 };
    let lk = look;
    if (type === 'villager') {
      const tool = task ? TOOL_OF_TASK[task] : null;
      info.tool = tool;
      if (carry) info.carry = carry;
      if (anim === 'attack') { info.tool = tool || 'axe'; lk = { ...look, weapon: 'tool' }; }
    }
    const P = humanPose(lk, anim === 'die' ? 'die' : anim, t, type === 'villager' ? task : null, info.carry);
    drawHuman(m, lk, P, team, variant, null, info);
  } else if (look.kind === 'rider') {
    const seatZ = drawHorse(m, look, anim === 'die' ? 'idle' : anim, t, team, variant);
    const P = humanPose(look, anim === 'attack' ? 'attack' : 'idle', t, null, null);
    P.lean = (P.lean || 0) * 0.6;
    drawHuman(m, look, P, team, variant, seatZ, {});
  } else if (look.kind === 'ram') drawRam(m, look, anim, t, team);
  else if (look.kind === 'mangonel') drawMangonel(m, look, anim, t, team);
  else if (look.kind === 'treb') drawTreb(m, look, anim, t, team);
  else if (look.kind === 'sheep') drawSheep(m, anim, t, team, owned);
  else if (look.kind === 'deer') drawDeer(m, anim, t, variant);
  else if (look.kind === 'boar') drawBoar(m, anim, t);
  if (scale !== 1) for (const it of m.items) scaleItem(it, scale);
  return renderModel(m, { outlineWidth: 1.25 });
}

function scaleItem(it, s) {
  const sc = (p) => [p[0] * s, p[1] * s, p[2] * s];
  if (it.p) it.p = sc(it.p);
  if (it.a) it.a = sc(it.a);
  if (it.b) it.b = sc(it.b);
  if (it.pts) it.pts = it.pts.map(sc);
  if (it.r) it.r *= s;
  if (it.r1) { it.r1 *= s; it.r2 *= s; }
}

// Lying carcass for a hunted animal.
export function carcassSprite(animal, dir) {
  const m = new Model(dirToFacing(dir));
  m.fallA = 1.35; m.fallAxis = 'x';
  if (animal === 'sheep') drawSheep(m, 'idle', 0, { main: '#888' }, false);
  else if (animal === 'deer') drawDeer(m, 'idle', 0, 1);
  else drawBoar(m, 'idle', 0);
  return renderModel(m, { outlineWidth: 1.1 });
}

export function unitLookKind(type) { return (LOOKS[type] || LOOKS.villager).kind; }
export { shade };
