'use strict';
// ================= Age of Kingdoms — a small AoE2-style RTS =================
const N = 96, TW = 64, TH = 32, HW = 32, HH = 16;
const RES = ['food', 'wood', 'gold', 'stone'];
const RICON = { food: '🍖', wood: '🪵', gold: '🪙', stone: '🪨' };
const AGES = ['Dark Age', 'Feudal Age', 'Castle Age', 'Imperial Age'];
const PCOL = ['#2f6fe6', '#d8322a'];
const PNAME = ['Blue Kingdom', 'Red Kingdom'];
const ECON = 1.7;

const UNITS = {
  villager: { name: 'Villager', icon: '👷', cls: 'vil', hp: 25, atk: 3, armor: 0, parmor: 0, range: 0, rof: 2, speed: 1.6, los: 4, cost: { food: 50 }, time: 10, age: 0, desc: 'Gathers resources and constructs buildings.' },
  militia: { name: 'Man-at-Arms', icon: '⚔️', cls: 'inf', hp: 45, atk: 6, armor: 1, parmor: 1, range: 0, rof: 2, speed: 1.3, los: 5, cost: { food: 60, gold: 20 }, time: 12, age: 0, desc: 'Sturdy sword infantry. Good all-rounder.' },
  spearman: { name: 'Spearman', icon: '🔱', cls: 'inf', hp: 45, atk: 3, armor: 0, parmor: 0, range: 0, rof: 2.5, speed: 1.4, los: 5, bonus: { cav: 15, siege: 5 }, cost: { food: 35, wood: 25 }, time: 10, age: 1, desc: 'Cheap infantry. Deals huge bonus damage to cavalry.' },
  archer: { name: 'Archer', icon: '🏹', cls: 'arch', hp: 30, atk: 4, armor: 0, parmor: 0, range: 5, rof: 2, speed: 1.4, los: 7, bonus: { inf: 2 }, cost: { wood: 25, gold: 45 }, time: 12, age: 1, proj: 'arrow', desc: 'Ranged. Strong vs infantry, weak vs cavalry and skirmishers.' },
  skirm: { name: 'Skirmisher', icon: '🎯', cls: 'arch', hp: 30, atk: 2, armor: 0, parmor: 3, range: 4, rof: 2.5, speed: 1.4, los: 6, bonus: { arch: 4 }, cost: { food: 25, wood: 35 }, time: 10, age: 1, proj: 'arrow', desc: 'Cheap ranged unit with bonus vs archers.' },
  scout: { name: 'Scout Cavalry', icon: '🐎', cls: 'cav', hp: 45, atk: 3, armor: 0, parmor: 2, range: 0, rof: 2, speed: 2.5, los: 8, bonus: { arch: 4, siege: 6 }, cost: { food: 80 }, time: 12, age: 1, desc: 'Fast, cheap cavalry. Great for raiding and scouting.' },
  knight: { name: 'Knight', icon: '🛡️', cls: 'cav', hp: 100, atk: 10, armor: 2, parmor: 2, range: 0, rof: 1.8, speed: 2.1, los: 6, bonus: { siege: 6 }, cost: { food: 60, gold: 75 }, time: 16, age: 2, desc: 'Heavy cavalry. Devastating in groups.' },
  longbow: { name: 'Longbowman', icon: '🪶', cls: 'arch', hp: 35, atk: 6, armor: 0, parmor: 1, range: 7, rof: 2, speed: 1.3, los: 9, bonus: { inf: 2 }, cost: { wood: 35, gold: 40 }, time: 14, age: 2, proj: 'arrow', desc: 'Castle unique unit. Extreme range archer.' },
  mangonel: { name: 'Mangonel', icon: '☄️', cls: 'siege', hp: 60, atk: 25, armor: 0, parmor: 6, range: 7, minr: 2, rof: 5, speed: 0.9, los: 8, splash: 1.1, bonus: { building: 30 }, cost: { wood: 160, gold: 135 }, time: 22, age: 2, proj: 'rock', desc: 'Hurls rocks that damage groups. Hits your own units too!' },
  ram: { name: 'Battering Ram', icon: '🐏', cls: 'siege', hp: 175, atk: 2, armor: -3, parmor: 150, range: 0, rof: 4, speed: 0.9, los: 3, bonus: { building: 125, siege: 30 }, cost: { wood: 160, gold: 75 }, time: 22, age: 2, desc: 'Smashes buildings. Nearly immune to arrows.' },
};
const BLD = {
  towncenter: { name: 'Town Center', icon: '🏛️', s: 4, hp: 2400, cost: { wood: 275, stone: 100 }, time: 60, age: 2, los: 8, pop: 5, accepts: RES, trains: ['villager'], techs: ['loom', 'wheelbarrow', 'handcart', 'age1', 'age2', 'age3'], atk: 5, range: 6, arrows: 2, desc: 'Trains villagers, researches ages. Accepts all resources.' },
  house: { name: 'House', icon: '🏠', s: 2, hp: 550, cost: { wood: 25 }, time: 12, age: 0, los: 2, pop: 5, desc: 'Supports 5 population.' },
  mill: { name: 'Mill', icon: '🌾', s: 2, hp: 600, cost: { wood: 100 }, time: 18, age: 0, los: 4, accepts: ['food'], techs: ['horsecollar', 'heavyplow'], desc: 'Drop-off for food. Farming upgrades.' },
  lumbercamp: { name: 'Lumber Camp', icon: '🪓', s: 2, hp: 600, cost: { wood: 100 }, time: 18, age: 0, los: 4, accepts: ['wood'], techs: ['doubleaxe', 'bowsaw'], desc: 'Drop-off for wood. Woodcutting upgrades.' },
  miningcamp: { name: 'Mining Camp', icon: '⛏️', s: 2, hp: 600, cost: { wood: 100 }, time: 18, age: 0, los: 4, accepts: ['gold', 'stone'], techs: ['goldmining', 'stonemining'], desc: 'Drop-off for gold and stone.' },
  farm: { name: 'Farm', icon: '🥕', s: 3, hp: 300, cost: { wood: 60 }, time: 10, age: 0, los: 1, flat: true, food: 250, desc: 'Endless-ish food. Auto-reseeds for 60 wood.' },
  barracks: { name: 'Barracks', icon: '⚔️', s: 3, hp: 1200, cost: { wood: 175 }, time: 25, age: 0, los: 5, trains: ['militia', 'spearman'], techs: ['champion'], desc: 'Trains infantry.' },
  archery: { name: 'Archery Range', icon: '🏹', s: 3, hp: 1200, cost: { wood: 175 }, time: 25, age: 1, los: 5, trains: ['archer', 'skirm'], techs: ['arbalest'], desc: 'Trains archers and skirmishers.' },
  stable: { name: 'Stable', icon: '🐎', s: 3, hp: 1200, cost: { wood: 175 }, time: 25, age: 1, los: 5, trains: ['scout', 'knight'], techs: ['paladin'], desc: 'Trains cavalry.' },
  blacksmith: { name: 'Blacksmith', icon: '⚒️', s: 3, hp: 1200, cost: { wood: 150 }, time: 25, age: 1, los: 5, techs: ['forging', 'fletching', 'scalemail', 'ironcasting', 'bodkin', 'chainmail'], desc: 'Attack and armor upgrades.' },
  tower: { name: 'Watch Tower', icon: '🗼', s: 1, hp: 1000, cost: { wood: 25, stone: 125 }, time: 30, age: 1, los: 9, atk: 5, range: 7, arrows: 1, desc: 'Defensive tower that shoots arrows.' },
  siege: { name: 'Siege Workshop', icon: '🛠️', s: 3, hp: 1500, cost: { wood: 200 }, time: 30, age: 2, los: 5, trains: ['mangonel', 'ram'], desc: 'Builds siege weapons.' },
  castle: { name: 'Castle', icon: '🏰', s: 4, hp: 4800, cost: { stone: 650 }, time: 80, age: 2, los: 10, pop: 20, atk: 10, range: 8, arrows: 4, trains: ['longbow'], desc: 'Mighty fortress. Fires volleys of arrows. +20 pop.' },
};
const BUILD_LIST = ['house', 'mill', 'lumbercamp', 'miningcamp', 'farm', 'barracks', 'archery', 'stable', 'blacksmith', 'tower', 'siege', 'castle', 'towncenter'];
const MIL = u => u.kind === 'unit' && u.def.cls !== 'vil';
const TECH = {
  loom: { name: 'Loom', icon: '🧶', cost: { gold: 50 }, time: 15, age: 0, desc: 'Villagers +15 HP, +1/+2 armor.', fx: p => { up(p, 'hp', 'vil', 15); up(p, 'armor', 'vil', 1); up(p, 'parmor', 'vil', 2); } },
  wheelbarrow: { name: 'Wheelbarrow', icon: '🛒', cost: { food: 175, wood: 50 }, time: 20, age: 1, desc: 'Villagers move 10% faster and carry +5.', fx: p => { p.m.vspeed += .1; p.m.carry += 5; } },
  handcart: { name: 'Hand Cart', icon: '🛞', cost: { food: 300, wood: 200 }, time: 30, age: 2, req: 'wheelbarrow', desc: 'Villagers move 10% faster and carry +5.', fx: p => { p.m.vspeed += .1; p.m.carry += 5; } },
  doubleaxe: { name: 'Double-Bit Axe', icon: '🪓', cost: { food: 100, wood: 50 }, time: 15, age: 1, desc: 'Wood gathering +20%.', fx: p => p.m.rate.tree += .2 },
  bowsaw: { name: 'Bow Saw', icon: '🪚', cost: { food: 150, wood: 100 }, time: 25, age: 2, req: 'doubleaxe', desc: 'Wood gathering +20%.', fx: p => p.m.rate.tree += .2 },
  goldmining: { name: 'Gold Mining', icon: '🪙', cost: { food: 100, wood: 75 }, time: 20, age: 1, desc: 'Gold mining +15%.', fx: p => p.m.rate.gold += .15 },
  stonemining: { name: 'Stone Mining', icon: '🪨', cost: { food: 100, wood: 75 }, time: 20, age: 1, desc: 'Stone mining +15%.', fx: p => p.m.rate.stone += .15 },
  horsecollar: { name: 'Horse Collar', icon: '🐴', cost: { food: 75, wood: 75 }, time: 15, age: 1, desc: 'Farming +15%, berries +15%.', fx: p => { p.m.rate.farm += .15; p.m.rate.berry += .15; } },
  heavyplow: { name: 'Heavy Plow', icon: '🚜', cost: { food: 125, wood: 125 }, time: 25, age: 2, req: 'horsecollar', desc: 'Farming +20%.', fx: p => p.m.rate.farm += .2 },
  forging: { name: 'Forging', icon: '🔨', cost: { food: 150 }, time: 20, age: 1, desc: 'Infantry & cavalry +1 attack.', fx: p => { up(p, 'atk', 'inf', 1); up(p, 'atk', 'cav', 1); } },
  ironcasting: { name: 'Iron Casting', icon: '🔥', cost: { food: 220, gold: 120 }, time: 30, age: 2, req: 'forging', desc: 'Infantry & cavalry +1 attack.', fx: p => { up(p, 'atk', 'inf', 1); up(p, 'atk', 'cav', 1); } },
  fletching: { name: 'Fletching', icon: '🪶', cost: { food: 100, gold: 50 }, time: 20, age: 1, desc: 'Archers, towers & town centers +1 attack, +1 range.', fx: p => { up(p, 'atk', 'arch', 1); up(p, 'range', 'arch', 1); up(p, 'atk', 'bld', 1); up(p, 'range', 'bld', 1); } },
  bodkin: { name: 'Bodkin Arrow', icon: '🏹', cost: { food: 200, gold: 100 }, time: 30, age: 2, req: 'fletching', desc: 'Archers, towers & town centers +1 attack, +1 range.', fx: p => { up(p, 'atk', 'arch', 1); up(p, 'range', 'arch', 1); up(p, 'atk', 'bld', 1); up(p, 'range', 'bld', 1); } },
  scalemail: { name: 'Scale Armor', icon: '🧥', cost: { food: 100 }, time: 20, age: 1, desc: 'Infantry & cavalry +1/+1 armor.', fx: p => { for (const c of ['inf', 'cav']) { up(p, 'armor', c, 1); up(p, 'parmor', c, 1); } } },
  chainmail: { name: 'Chain Mail', icon: '⛓️', cost: { food: 200, gold: 100 }, time: 30, age: 2, req: 'scalemail', desc: 'Infantry & cavalry +1/+1 armor.', fx: p => { for (const c of ['inf', 'cav']) { up(p, 'armor', c, 1); up(p, 'parmor', c, 1); } } },
  champion: { name: 'Champion', icon: '🗡️', cost: { food: 750, gold: 350 }, time: 40, age: 3, desc: 'Men-at-Arms become Champions: +25 HP, +5 attack, +1 armor.', fx: p => { up(p, 'hp', 'militia', 25); up(p, 'atk', 'militia', 5); up(p, 'armor', 'militia', 1); p.names.militia = 'Champion'; } },
  arbalest: { name: 'Arbalest', icon: '🎯', cost: { food: 350, gold: 300 }, time: 40, age: 3, desc: 'Archers become Arbalests: +10 HP, +2 attack, +1 range.', fx: p => { up(p, 'hp', 'archer', 10); up(p, 'atk', 'archer', 2); up(p, 'range', 'archer', 1); p.names.archer = 'Arbalest'; } },
  paladin: { name: 'Paladin', icon: '👑', cost: { food: 1300, gold: 750 }, time: 50, age: 3, desc: 'Knights become Paladins: +50 HP, +3 attack, +1 armor.', fx: p => { up(p, 'hp', 'knight', 50); up(p, 'atk', 'knight', 3); up(p, 'armor', 'knight', 1); p.names.knight = 'Paladin'; } },
  age1: { name: 'Feudal Age', icon: '🏯', cost: { food: 500 }, time: 40, age: 0, isAge: 1, desc: 'Advance to the Feudal Age. Unlocks archers, cavalry, towers and more.' },
  age2: { name: 'Castle Age', icon: '🏰', cost: { food: 800, gold: 200 }, time: 55, age: 1, isAge: 2, desc: 'Advance to the Castle Age. Unlocks knights, siege, castles and town centers.' },
  age3: { name: 'Imperial Age', icon: '👑', cost: { food: 1000, gold: 800 }, time: 70, age: 2, isAge: 3, desc: 'Advance to the Imperial Age. Unlocks elite unit upgrades.' },
};
const RESDEF = {
  tree: { name: 'Tree', rt: 'wood', amount: 100, icon: '🌳' },
  gold: { name: 'Gold Mine', rt: 'gold', amount: 800, icon: '🪙' },
  stone: { name: 'Stone Mine', rt: 'stone', amount: 350, icon: '🪨' },
  berry: { name: 'Berry Bush', rt: 'food', amount: 125, icon: '🫐' },
};
const RATE = { tree: .42, gold: .4, stone: .38, berry: .38, farm: .4 };

// ---------------- state ----------------
const terrain = new Uint8Array(N * N), block = new Int32Array(N * N), occ = new Int32Array(N * N), vis = new Uint8Array(N * N);
const I = (x, y) => y * N + x;
const inMap = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
const free = (x, y) => inMap(x, y) && block[I(x, y)] === 0;
let ents = [], byId = new Map(), nextId = 1, P = [], sel = [], gtime = 0, speed = 1, paused = true, over = false;
let projs = [], fx = [], diff = 1, groups = {};
const alive = e => e && !e.dead;
let rng = mulberry(Date.now() & 0xffff);
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function mkPlayer(id, ai) {
  return {
    id, ai, res: { food: 200, wood: 200, gold: 100, stone: 200 }, age: 0, techs: new Set(), researching: new Set(), names: {},
    m: { hp: {}, atk: {}, armor: {}, parmor: {}, range: {}, rate: { tree: 0, gold: 0, stone: 0, berry: 0, farm: 0 }, carry: 0, vspeed: 0 },
    stats: { trained: 0, killed: 0, lost: 0, razed: 0, gathered: 0 }, pop: 0, cap: 0, defeated: false,
  };
}
function up(p, k, c, v) {
  const before = new Map();
  if (k === 'hp') for (const e of ents) if (e.owner === p.id && e.kind === 'unit') before.set(e, st(e, 'hp'));
  p.m[k][c] = (p.m[k][c] || 0) + v;
  if (k === 'hp') for (const [e, h] of before) { const d = st(e, 'hp') - h; e.maxHp += d; e.hp += d; }
}
function st(e, k) {
  const d = e.def; let v = d[k] || 0; const p = P[e.owner]; if (!p || !p.m[k]) return v;
  const cls = e.kind === 'bld' ? 'bld' : d.cls;
  return v + (p.m[k][cls] || 0) + (p.m[k][e.type] || 0);
}
const nameOf = e => (e.kind === 'unit' && P[e.owner] && P[e.owner].names[e.type]) || e.def.name;
const afford = (p, c) => RES.every(r => (p.res[r] || 0) >= (c[r] || 0));
const pay = (p, c) => RES.forEach(r => p.res[r] -= (c[r] || 0));
const refund = (p, c) => RES.forEach(r => p.res[r] += (c[r] || 0));
const costStr = c => RES.filter(r => c[r]).map(r => RICON[r] + ' ' + c[r]).join('  ');

// ---------------- entities ----------------
function addEnt(e) { e.id = nextId++; e.hitT = -99; ents.push(e); byId.set(e.id, e); return e; }
function mkRes(type, x, y) {
  if (!inMap(x, y) || block[I(x, y)] !== 0 || occ[I(x, y)] !== 0) return null;
  const d = RESDEF[type];
  const e = addEnt({ kind: 'res', type, def: d, owner: -1, x: x + .5, y: y + .5, tx: x, ty: y, amount: d.amount, blocks: true, v: rng() });
  block[I(x, y)] = e.id; return e;
}
function mkUnit(type, owner, x, y) {
  const d = UNITS[type];
  const u = addEnt({ kind: 'unit', type, def: d, owner, x, y, order: { type: 'idle' }, path: null, carry: { type: 'food', amt: 0 }, cd: rng(), face: 1, scan: rng(), atkAnim: 0, walk: rng() * 9 });
  u.maxHp = u.hp = st(u, 'hp'); return u;
}
function mkBld(type, owner, bx, by, done) {
  const d = BLD[type];
  const b = addEnt({ kind: 'bld', type, def: d, owner, bx, by, s: d.s, x: bx + d.s / 2, y: by + d.s / 2, done: !!done, progress: done ? 1 : 0, queue: [], cd: 1, blocks: !d.flat, rally: null });
  b.maxHp = d.hp; b.hp = done ? d.hp : 1; if (d.flat) b.amount = d.food;
  for (let j = by; j < by + d.s; j++) for (let i = bx; i < bx + d.s; i++) { occ[I(i, j)] = b.id; if (b.blocks) block[I(i, j)] = b.id; }
  if (b.blocks) for (const u of ents) if (u.kind === 'unit' && !u.dead && u.x >= bx && u.x < bx + d.s && u.y >= by && u.y < by + d.s) nudgeOut(u);
  return b;
}
function nudgeOut(u) {
  const f = nearestFree(u.x | 0, u.y | 0, 12); if (f) { u.x = f[0] + .5; u.y = f[1] + .5; u.path = null; }
}
function rectOf(e) {
  if (e.kind === 'bld') return { x: e.bx, y: e.by, w: e.s, h: e.s };
  if (e.kind === 'res') return { x: e.tx, y: e.ty, w: 1, h: 1 };
  return { x: e.x, y: e.y, w: 0, h: 0 };
}
function ptRect(px, py, r) { const dx = Math.max(r.x - px, 0, px - (r.x + r.w)), dy = Math.max(r.y - py, 0, py - (r.y + r.h)); return Math.hypot(dx, dy); }
const distTo = (u, e) => ptRect(u.x, u.y, rectOf(e));

function kill(e, killer) {
  if (e.dead) return; e.dead = true; byId.delete(e.id);
  if (e.kind === 'bld') {
    for (let j = e.by; j < e.by + e.s; j++) for (let i = e.bx; i < e.bx + e.s; i++) { if (occ[I(i, j)] === e.id) occ[I(i, j)] = 0; if (block[I(i, j)] === e.id) block[I(i, j)] = 0; }
    for (const q of e.queue) { refund(P[e.owner], q.cost); if (q.kind === 'tech') P[e.owner].researching.delete(q.type); }
    if (e.type !== 'farm') { fx.push({ k: 'rubble', x: e.x, y: e.y, s: e.s, t: 0, life: 40 }); for (let i = 0; i < 8; i++) fx.push({ k: 'dust', x: e.x + (rng() - .5) * e.s, y: e.y + (rng() - .5) * e.s, t: 0, life: 1.5 + rng() }); if (vis[I(e.x | 0, e.y | 0)] === 2) sfx(90, .5, 'sawtooth', .06, .3); }
    if (killer != null && P[killer]) P[killer].stats.razed++;
  } else if (e.kind === 'res') {
    if (block[I(e.tx, e.ty)] === e.id) block[I(e.tx, e.ty)] = 0;
    if (e.type === 'tree') fx.push({ k: 'stump', x: e.x, y: e.y, t: 0, life: 60 });
  } else {
    fx.push({ k: 'corpse', x: e.x, y: e.y, owner: e.owner, cls: e.def.cls, face: e.face, t: 0, life: 12 });
    if (P[e.owner]) P[e.owner].stats.lost++;
    if (killer != null && P[killer]) P[killer].stats.killed++;
    if (vis[I(e.x | 0, e.y | 0)] === 2) sfx(180 + rng() * 60, .15, 'triangle', .05, .5);
  }
}

// ---------------- pathfinding ----------------
const gS = new Float32Array(N * N), came = new Int32Array(N * N), seen = new Uint32Array(N * N), closed = new Uint32Array(N * N);
let gen = 0; let hI = [], hF = [];
function hpush(i, f) { let k = hI.length; hI.push(i); hF.push(f); while (k > 0) { const p = (k - 1) >> 1; if (hF[p] <= f) break; hI[k] = hI[p]; hF[k] = hF[p]; k = p; } hI[k] = i; hF[k] = f; }
function hpop() {
  const top = hI[0], li = hI.pop(), lf = hF.pop(); const n = hI.length;
  if (n) { let k = 0; while (true) { let c = 2 * k + 1; if (c >= n) break; if (c + 1 < n && hF[c + 1] < hF[c]) c++; if (hF[c] >= lf) break; hI[k] = hI[c]; hF[k] = hF[c]; k = c; } hI[k] = li; hF[k] = lf; }
  return top;
}
function nearestFree(x, y, maxR = 10) {
  x = Math.max(0, Math.min(N - 1, x)); y = Math.max(0, Math.min(N - 1, y));
  if (free(x, y)) return [x, y];
  for (let r = 1; r <= maxR; r++) { let best = null, bd = 1e9; for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) { if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue; if (free(x + i, y + j)) { const d = i * i + j * j; if (d < bd) { bd = d; best = [x + i, y + j]; } } } if (best) return best; }
  return null;
}
function lineFree(ax, ay, bx, by) {
  const d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d / .25);
  for (let k = 1; k <= n; k++) { const t = k / n; if (!free(Math.floor(ax + (bx - ax) * t), Math.floor(ay + (by - ay) * t))) return false; }
  return true;
}
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
function findPath(sx, sy, gx, gy, ent) {
  gen++; hI.length = 0; hF.length = 0;
  const si = Math.max(0, Math.min(N - 1, sx | 0)), sj = Math.max(0, Math.min(N - 1, sy | 0));
  let goal, gi, gj;
  if (ent && ent.blocks) {
    const r = rectOf(ent); gi = Math.floor(r.x + r.w / 2 - .01); gj = Math.floor(r.y + r.h / 2 - .01);
    goal = (i, j) => ptRect(i + .5, j + .5, r) <= .75;
    if (ptRect(sx, sy, r) <= .8) return [];
  } else {
    gi = Math.max(0, Math.min(N - 1, gx | 0)); gj = Math.max(0, Math.min(N - 1, gy | 0));
    if (!free(gi, gj)) { const f = nearestFree(gi, gj, 12); if (!f) return []; gi = f[0]; gj = f[1]; gx = gi + .5; gy = gj + .5; }
    goal = (i, j) => i === gi && j === gj;
    if (si === gi && sj === gj) return [{ x: gx, y: gy }];
  }
  const h = (i, j) => { const dx = Math.abs(i - gi), dy = Math.abs(j - gj); return Math.max(dx, dy) + .414 * Math.min(dx, dy); };
  const s = I(si, sj); seen[s] = gen; gS[s] = 0; came[s] = -1; hpush(s, h(si, sj));
  let found = -1, best = s, bestH = h(si, sj), iter = 0;
  while (hI.length && iter++ < 5000) {
    const c = hpop(); if (closed[c] === gen) continue; closed[c] = gen;
    const ci = c % N, cj = (c / N) | 0;
    if (goal(ci, cj)) { found = c; break; }
    const hc = h(ci, cj); if (hc < bestH) { bestH = hc; best = c; }
    for (const [dx, dy, w] of DIRS) {
      const ni = ci + dx, nj = cj + dy; if (!free(ni, nj)) continue;
      if (dx && dy && (!free(ci + dx, cj) || !free(ci, cj + dy))) continue;
      const n = I(ni, nj); if (closed[n] === gen) continue;
      const g = gS[c] + w;
      if (seen[n] !== gen || g < gS[n]) { seen[n] = gen; gS[n] = g; came[n] = c; hpush(n, g + h(ni, nj) * 1.05); }
    }
  }
  const end = found >= 0 ? found : best;
  const pts = []; let c = end;
  while (c !== s && c >= 0) { pts.push({ x: c % N + .5, y: ((c / N) | 0) + .5 }); c = came[c]; }
  pts.reverse();
  if (found >= 0 && !(ent && ent.blocks) && pts.length) pts[pts.length - 1] = { x: gx, y: gy };
  // string pulling
  const out = []; let cx = sx, cy = sy, i = 0;
  while (i < pts.length) { let j = Math.min(pts.length - 1, i + 14); while (j > i && !lineFree(cx, cy, pts[j].x, pts[j].y)) j--; out.push(pts[j]); cx = pts[j].x; cy = pts[j].y; i = j + 1; }
  return out;
}
function pathTo(u, x, y, ent) { u.path = findPath(u.x, u.y, x, y, ent); }
function pathToEnt(u, e) { if (e.kind === 'bld' && e.def.flat) pathTo(u, e.x + (rng() - .5), e.y + (rng() - .5)); else pathTo(u, e.x, e.y, e); }
function uspeed(u) { let s = u.def.speed; if (u.def.cls === 'vil') s *= 1 + P[u.owner].m.vspeed; return s; }
function follow(u, dt) {
  if (!u.path || !u.path.length) return true;
  const p = u.path[0], dx = p.x - u.x, dy = p.y - u.y, d = Math.hypot(dx, dy), sp = uspeed(u) * dt;
  u.moving = true; if (Math.abs(dx - dy) > .02) u.face = dx - dy > 0 ? 1 : -1;
  if (d <= sp) { u.x = p.x; u.y = p.y; u.path.shift(); return !u.path.length; }
  const nx = u.x + dx / d * sp, ny = u.y + dy / d * sp;
  if (!free(nx | 0, ny | 0) && free(u.x | 0, u.y | 0)) { u.path = null; return true; }
  u.x = nx; u.y = ny; return false;
}

// ---------------- orders ----------------
function isEnemy(a, b) { return b.owner >= 0 && a.owner >= 0 && a.owner !== b.owner; }
function orderMove(units, x, y) {
  const n = units.length, cols = Math.ceil(Math.sqrt(n));
  units.forEach((u, k) => {
    const ox = (k % cols - (cols - 1) / 2) * .9, oy = (Math.floor(k / cols) - (cols - 1) / 2) * .9;
    u.order = { type: 'move' }; pathTo(u, x + ox, y + oy);
  });
}
function orderUnit(u, t) {
  if (!t) return;
  if (isEnemy(u, t)) { u.order = { type: 'attack', target: t, rp: 0 }; u.path = null; return; }
  if (u.type === 'villager') {
    if (t.kind === 'res') { u.order = { type: 'gather', target: t, rtype: t.type, phase: 'go' }; u.path = null; return; }
    if (t.kind === 'bld' && t.owner === u.owner) {
      if (!t.done) { u.order = { type: 'build', target: t }; u.path = null; return; }
      if (t.type === 'farm') { if (!farmTaken(t, u)) t.farmer = u; u.order = { type: 'gather', target: t, rtype: 'farm', phase: 'go' }; u.path = null; return; }
      if (u.carry.amt > 0 && t.def.accepts && t.def.accepts.includes(u.carry.type)) { u.order = { type: 'gather', target: u.lastRes && alive(u.lastRes) ? u.lastRes : null, rtype: u.lastRtype || 'tree', phase: 'drop', ds: t }; u.path = null; return; }
      if (t.hp < t.maxHp) { u.order = { type: 'repair', target: t }; u.path = null; return; }
    }
  }
  u.order = { type: 'move' }; pathTo(u, t.x, t.y, t.blocks ? t : null);
}
function nearestEnemy(u, r, bldOnly) {
  let best = null, bd = r;
  for (const e of ents) {
    if (e.dead || e.kind === 'res' || !isEnemy(u, e)) continue;
    if (bldOnly && e.kind !== 'bld') continue;
    if (e.kind === 'bld' && e.type === 'farm' && !bldOnly) continue;
    let d = distTo(u, e); if (e.kind === 'bld' && !bldOnly) d += 3;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function nearestDrop(u, rt) {
  let best = null, bd = 1e9;
  for (const e of ents) if (!e.dead && e.kind === 'bld' && e.owner === u.owner && e.done && e.def.accepts && e.def.accepts.includes(rt)) { const d = distTo(u, e); if (d < bd) { bd = d; best = e; } }
  return best;
}
function findRes(owner, rtype, x, y, rad, excl) {
  let best = null, bd = rad;
  for (const e of ents) {
    if (e.dead || e === excl) continue;
    if (rtype === 'farm') { if (e.type !== 'farm' || e.owner !== owner || !e.done || farmTaken(e, null)) continue; }
    else if (e.kind !== 'res' || e.type !== rtype) continue;
    const d = Math.hypot(e.x - x, e.y - y); if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function farmTaken(f, u) { return f.farmer && f.farmer !== u && alive(f.farmer) && f.farmer.order.target === f; }
const resRt = r => r.type === 'farm' ? 'food' : r.def.rt;

function dealDamage(att, t, base, pierce, owner) {
  if (t.dead) return;
  const tc = t.kind === 'bld' ? 'building' : t.def.cls;
  let dmg = base - (t.kind === 'unit' ? st(t, pierce ? 'parmor' : 'armor') : (pierce ? 8 : 1));
  if (att && att.def && att.def.bonus && att.def.bonus[tc]) dmg += att.def.bonus[tc];
  if (t.kind === 'bld' && pierce) dmg = Math.min(dmg, 2);
  dmg = Math.max(1, dmg);
  t.hp -= dmg; t.hitT = gtime;
  if (t.owner === 0 && gtime - lastAlert > 20 && (t.kind === 'bld' || t.def.cls === 'vil' || true)) { lastAlert = gtime; msg('⚠️ You are under attack!', '#ff8a7a'); sfx(300, .25, 'square', .05, .5); setTimeout(() => sfx(240, .3, 'square', .05, .5), 180); alertAt = { x: t.x, y: t.y, t: gtime }; }
  if (t.hp <= 0) { kill(t, owner); return; }
  if (t.kind === 'unit' && att && alive(att) && att.kind === 'unit' || t.kind === 'unit' && att && att.kind === 'bld') {
    const o = t.order;
    if (t.def.cls !== 'vil' && (o.type === 'idle' || (o.type === 'attack' && o.auto && o.target && o.target.kind === 'bld')) && !(t.type === 'ram' && att.kind === 'unit')) { if (att.kind === 'unit') t.order = { type: 'attack', target: att, auto: true, rp: 0, hx: t.x, hy: t.y }; }
  }
}
let lastAlert = -99, alertAt = null;

// ---------------- unit behaviors ----------------
function updUnit(u, dt) {
  u.cd = Math.max(0, u.cd - dt); u.atkAnim = Math.max(0, u.atkAnim - dt); u.moving = false; u.working = false;
  if (!free(u.x | 0, u.y | 0) && !(u.order.type === 'gather' && u.order.target && u.order.target.type === 'farm')) { const b = byId.get(block[I(u.x | 0, u.y | 0)]); if (b && b.kind === 'bld') nudgeOut(u); }
  const o = u.order;
  switch (o.type) {
    case 'idle':
      if ((u.scan -= dt) <= 0) {
        u.scan = .5 + rng() * .4;
        if (u.def.cls !== 'vil') { const e = nearestEnemy(u, st(u, 'los'), u.type === 'ram'); if (e) u.order = { type: 'attack', target: e, auto: true, rp: 0, hx: u.x, hy: u.y }; }
      }
      break;
    case 'move': if (follow(u, dt)) u.order = { type: 'idle' }; break;
    case 'amove':
      if (!alive(o.target) && (o.scan = (o.scan || 0) - dt) <= 0) { o.scan = .5; o.target = nearestEnemy(u, st(u, 'los') + 1, u.type === 'ram'); if (o.target) u.path = null; }
      if (alive(o.target)) { doAttack(u, dt, o); if (!alive(o.target)) { o.target = null; u.path = null; } }
      else { if (!u.path) pathTo(u, o.x, o.y); if (follow(u, dt)) u.order = { type: 'idle' }; }
      break;
    case 'attack': doAttack(u, dt, o); break;
    case 'gather': doGather(u, dt, o); break;
    case 'build': case 'repair': doBuild(u, dt, o); break;
  }
}
function doAttack(u, dt, o) {
  const t = o.target;
  if (!alive(t) || (t.owner === u.owner)) {
    if (o.type === 'amove') return;
    const n = u.def.cls !== 'vil' ? nearestEnemy(u, st(u, 'los'), u.type === 'ram') : null;
    if (n) { o.target = n; o.rp = 0; return; }
    u.order = { type: 'idle' }; u.path = null; return;
  }
  if (t.kind === 'unit' && t.owner !== 0 && u.owner === 0 && vis[I(t.x | 0, t.y | 0)] !== 2 && o.auto) { u.order = { type: 'idle' }; return; }
  const d = distTo(u, t), r = st(u, 'range'), reach = r > 0 ? r : (t.kind === 'unit' ? .7 : .8);
  if (o.auto && o.hx != null && Math.hypot(u.x - o.hx, u.y - o.hy) > st(u, 'los') + 6) { u.order = { type: 'move' }; pathTo(u, o.hx, o.hy); return; }
  if (d <= reach) {
    u.path = null; const dx = t.x - u.x, dy = t.y - u.y; if (Math.abs(dx - dy) > .02) u.face = dx - dy > 0 ? 1 : -1;
    if (u.cd <= 0) {
      u.cd = st(u, 'rof'); u.atkAnim = .35;
      if (u.def.proj) fire(u, t, st(u, 'atk'), u.def.proj);
      else { dealDamage(u, t, st(u, 'atk'), false, u.owner); if (vis[I(u.x | 0, u.y | 0)] === 2 && rng() < .5) sfx(700 + rng() * 500, .04, 'square', .015); }
    }
  } else {
    o.rp = (o.rp || 0) - dt;
    if (!u.path || !u.path.length || o.rp <= 0) { o.rp = t.kind === 'unit' ? .6 : 3; if (t.kind === 'unit') pathTo(u, t.x, t.y); else pathToEnt(u, t); }
    follow(u, dt);
  }
}
function fire(src, t, dmg, kind) {
  const sx = src.x, sy = src.y, tx = t.x + (t.kind === 'unit' ? 0 : (rng() - .5) * t.s * .6), ty = t.y + (t.kind === 'unit' ? 0 : (rng() - .5) * t.s * .6);
  const d = Math.hypot(tx - sx, ty - sy), spd = kind === 'rock' ? 7 : 12;
  projs.push({ kind, sx, sy, tx, ty, target: t, dmg, owner: src.owner, att: src, t: 0, dur: Math.max(.15, d / spd), h: src.kind === 'bld' ? 40 : 14, splash: src.def.splash || 0 });
  if (src.owner === 0 || vis[I(sx | 0, sy | 0)] === 2) sfx(kind === 'rock' ? 120 : 1400, kind === 'rock' ? .2 : .05, kind === 'rock' ? 'sawtooth' : 'triangle', .02, kind === 'rock' ? .5 : .6);
}
function doGather(u, dt, o) {
  const p = P[u.owner], cap = 10 + p.m.carry;
  if (o.phase === 'drop') {
    let ds = o.ds;
    if (!alive(ds) || !ds.done) { ds = o.ds = nearestDrop(u, u.carry.type); u.path = null; if (!ds) { u.order = { type: 'idle' }; return; } }
    if (distTo(u, ds) <= .85) {
      const amt = Math.floor(u.carry.amt); p.res[u.carry.type] += amt; p.stats.gathered += amt; u.carry.amt = 0; o.phase = 'go'; u.path = null;
      if (!alive(o.target)) { const r = findRes(u.owner, o.rtype, u.x, u.y, 14); o.target = r; }
      return;
    }
    if (!u.path || !u.path.length) { pathToEnt(u, ds); if (!u.path.length && distTo(u, ds) > .85) { o.fails = (o.fails || 0) + 1; if (o.fails > 20) { u.order = { type: 'idle' }; } } }
    follow(u, dt); return;
  }
  let r = o.target;
  const valid = r && alive(r) && (r.type === 'farm' ? (r.done && r.owner === u.owner && !farmTaken(r, u)) : r.amount > 0);
  if (!valid) {
    r = o.target = findRes(u.owner, o.rtype, u.x, u.y, o.rtype === 'farm' ? 20 : 14, r); u.path = null;
    if (!r) { if (u.carry.amt >= 1) { o.phase = 'drop'; o.ds = null; } else u.order = { type: 'idle' }; return; }
  }
  const rt = resRt(r);
  if (u.carry.amt > 0 && u.carry.type !== rt) { o.phase = 'drop'; o.ds = null; u.path = null; return; }
  if (u.carry.amt >= cap) { o.phase = 'drop'; o.ds = null; u.path = null; return; }
  const farm = r.type === 'farm';
  const d = farm ? ptRect(u.x, u.y, { x: r.bx + .3, y: r.by + .3, w: r.s - .6, h: r.s - .6 }) : distTo(u, r);
  if (d <= (farm ? .05 : .85)) {
    u.path = null; u.working = true; u.lastRes = r; u.lastRtype = o.rtype;
    const dx = r.x - u.x, dy = r.y - u.y; if (!farm && Math.abs(dx - dy) > .02) u.face = dx - dy > 0 ? 1 : -1;
    if (farm) { r.farmer = u; u.walk += dt * 2; }
    const rk = r.type === 'farm' ? 'farm' : r.type;
    const rate = RATE[rk] * ECON * (1 + (p.m.rate[rk] || 0)) * (p.ai ? [0.85, 1, 1.2][diff] : 1) * dt;
    const take = Math.min(rate, r.amount);
    r.amount -= take; u.carry.type = rt; u.carry.amt += take;
    if (r.amount <= 0) {
      if (farm) { if (p.res.wood >= 60) { p.res.wood -= 60; r.amount = BLD.farm.food; } else kill(r); }
      else kill(r);
    }
  } else {
    if (!u.path || !u.path.length) {
      pathToEnt(u, r);
      if (!u.path.length) { o.fails = (o.fails || 0) + 1; if (o.fails > 6) { o.fails = 0; o.target = findRes(u.owner, o.rtype, u.x, u.y, 14, r); } }
    }
    follow(u, dt);
  }
}
function doBuild(u, dt, o) {
  const b = o.target;
  if (!alive(b)) { u.order = { type: 'idle' }; return; }
  if (o.type === 'build' && b.done || o.type === 'repair' && b.hp >= b.maxHp) { afterBuild(u, b); return; }
  const d = b.def.flat ? ptRect(u.x, u.y, rectOf(b)) : distTo(u, b);
  if (d <= .85) {
    u.path = null; u.working = true; const dx = b.x - u.x, dy = b.y - u.y; if (Math.abs(dx - dy) > .02) u.face = dx - dy > 0 ? 1 : -1;
    if (o.type === 'repair') { const p = P[u.owner]; if (p.res.wood >= .1) { b.hp = Math.min(b.maxHp, b.hp + b.maxHp * dt / b.def.time / 2); p.res.wood -= dt * .5; } else u.order = { type: 'idle' }; return; }
    const f = dt / b.def.time * (P[u.owner].ai ? [0.9, 1, 1.15][diff] : 1);
    b.progress = Math.min(1, b.progress + f); b.hp = Math.min(b.maxHp, b.hp + b.maxHp * f);
    if (b.progress >= 1) completeBld(b);
  } else {
    if (!u.path || !u.path.length) { pathToEnt(u, b); if (!u.path.length) { o.fails = (o.fails || 0) + 1; if (o.fails > 10) u.order = { type: 'idle' }; } }
    follow(u, dt);
  }
}
function completeBld(b) {
  b.done = true; b.progress = 1;
  for (let i = 0; i < 6; i++) fx.push({ k: 'dust', x: b.x + (rng() - .5) * b.s, y: b.y + (rng() - .5) * b.s, t: 0, life: 1 + rng() });
  if (b.owner === 0) { sfx(520, .12, 'triangle', .05); setTimeout(() => sfx(780, .18, 'triangle', .05), 110); msg(`${b.def.name} completed.`); }
}
function afterBuild(u, b) {
  if (b.type === 'farm' && !farmTaken(b, u)) { b.farmer = u; u.order = { type: 'gather', target: b, rtype: 'farm', phase: 'go' }; return; }
  if (b.def.accepts && b.type !== 'towncenter') {
    for (const [rt, rtype] of [['wood', 'tree'], ['gold', 'gold'], ['stone', 'stone'], ['food', 'berry']]) {
      if (!b.def.accepts.includes(rt)) continue;
      const r = findRes(u.owner, rtype, b.x, b.y, 8); if (r) { u.order = { type: 'gather', target: r, rtype, phase: 'go' }; return; }
    }
  }
  if (u.after) { const a = u.after; u.after = null; if (a.type === 'gather' && (alive(a.target) || a.rtype)) { u.order = { type: 'gather', target: alive(a.target) ? a.target : null, rtype: a.rtype, phase: 'go' }; return; } }
  for (const e of ents) if (!e.dead && e.kind === 'bld' && e.owner === u.owner && !e.done && Math.hypot(e.x - u.x, e.y - u.y) < 10) { u.order = { type: 'build', target: e }; return; }
  u.order = { type: 'idle' };
}

// ---------------- buildings ----------------
function queueItem(b, kind, type) {
  const p = P[b.owner], d = kind === 'unit' ? UNITS[type] : TECH[type];
  if (b.queue.length >= 5 || !afford(p, d.cost)) return false;
  if (kind === 'tech') { if (p.techs.has(type) || p.researching.has(type)) return false; if (d.isAge && [...p.researching].some(t => TECH[t].isAge)) return false; p.researching.add(type); }
  pay(p, d.cost); b.queue.push({ kind, type, t: 0, total: d.time, cost: d.cost, icon: d.icon });
  return true;
}
function cancelItem(b, k) {
  const q = b.queue[k]; if (!q) return; b.queue.splice(k, 1); refund(P[b.owner], q.cost); if (q.kind === 'tech') P[b.owner].researching.delete(q.type);
}
function updBld(b, dt) {
  if (!b.done) return;
  const p = P[b.owner];
  if (b.hp < b.maxHp * .5 && rng() < dt * 6) fx.push({ k: 'fire', x: b.x + (rng() - .5) * b.s * .8, y: b.y + (rng() - .5) * b.s * .8, t: 0, life: .9 + rng() * .6, h: 18 + rng() * 20 });
  if (b.queue.length) {
    const q = b.queue[0];
    if (q.kind === 'unit' && p.pop >= p.cap) { b.popBlocked = true; }
    else {
      b.popBlocked = false; q.t += dt * (p.ai ? [0.9, 1, 1.1][diff] : 1);
      if (q.t >= q.total) {
        b.queue.shift();
        if (q.kind === 'unit') spawnFrom(b, q.type);
        else research(p, q.type);
      }
    }
  }
  if (b.def.atk && (b.cd -= dt) <= 0) {
    b.cd = 2;
    const range = st(b, 'range'); let best = null, bd = range;
    for (const e of ents) { if (e.dead || e.kind !== 'unit' || !isEnemy(b, e)) continue; const d = distTo(e, b); if (d < bd) { bd = d; best = e; } }
    if (best) for (let k = 0; k < b.def.arrows; k++) setTimeout(() => { if (alive(best) && alive(b)) fire(b, best, st(b, 'atk'), 'arrow'); }, k * 90 / speed);
  }
}
function spawnFrom(b, type) {
  const p = P[b.owner];
  const tgt = b.rally ? [b.rally.x, b.rally.y] : [b.x + b.s, b.y + b.s];
  let best = null, bd = 1e9;
  for (let j = b.by - 1; j <= b.by + b.s; j++) for (let i = b.bx - 1; i <= b.bx + b.s; i++) {
    if (!free(i, j)) continue; const d = Math.hypot(i + .5 - tgt[0], j + .5 - tgt[1]); if (d < bd) { bd = d; best = [i, j]; }
  }
  if (!best) best = nearestFree(b.bx + b.s, b.by + b.s, 6) || [b.bx, b.by];
  const u = mkUnit(type, b.owner, best[0] + .5, best[1] + .5);
  p.stats.trained++;
  if (b.owner === 0) sfx(440, .1, 'triangle', .04);
  if (b.rally) {
    const r = b.rally.ent;
    if (r && alive(r) && type === 'villager' && (r.kind === 'res' || r.type === 'farm')) orderUnit(u, r);
    else { u.order = { type: 'move' }; pathTo(u, b.rally.x, b.rally.y); }
  }
  return u;
}
function research(p, type) {
  const d = TECH[type]; p.researching.delete(type); p.techs.add(type);
  if (d.isAge) {
    p.age = d.isAge;
    if (p.id === 0) { msg(`🎉 You have advanced to the ${AGES[p.age]}!`, '#ffd77a'); [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => sfx(f, .3, 'triangle', .06), i * 140)); }
    else msg(`The ${PNAME[p.id]} has advanced to the ${AGES[p.age]}.`, '#ff9d8d');
  } else { d.fx(p); if (p.id === 0) { msg(`${d.name} researched.`); sfx(660, .15, 'triangle', .05); } }
}

// ---------------- map generation ----------------
function noise2(seed) {
  const g = new Float32Array(26 * 26).map(() => rng());
  return (x, y) => { const X = x / 6, Y = y / 6, xi = Math.floor(X), yi = Math.floor(Y), fx = X - xi, fy = Y - yi; const s = t => t * t * (3 - 2 * t); const v = (i, j) => g[(j % 26) * 26 + (i % 26)]; const a = v(xi, yi), b = v(xi + 1, yi), c = v(xi, yi + 1), d = v(xi + 1, yi + 1); return a + (b - a) * s(fx) + (c - a) * s(fy) + (a - b - c + d) * s(fx) * s(fy); };
}
function genMap() {
  const n1 = noise2(), n2 = noise2();
  const B0 = [16, 16], B1 = [N - 20, N - 20];
  const nearBase = (x, y, r) => Math.hypot(x - B0[0] - 2, y - B0[1] - 2) < r || Math.hypot(x - B1[0] - 2, y - B1[1] - 2) < r;
  // terrain + ponds (mirror-symmetric)
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const v = n2(x, y); terrain[I(x, y)] = v > .68 ? 1 : 0;
  }
  const ponds = [[70, 20, 5], [52, 36, 3]];
  for (const [px, py, r] of ponds) for (const [cx, cy] of [[px, py], [N - 1 - px, N - 1 - py]])
    for (let y = cy - r - 1; y <= cy + r + 1; y++) for (let x = cx - r - 1; x <= cx + r + 1; x++) if (inMap(x, y) && Math.hypot(x - cx, (y - cy) * 1.2) < r + n1(x, y) * 1.5) { terrain[I(x, y)] = 2; block[I(x, y)] = -1; }
  // start positions
  const starts = [B0, B1];
  // base resources (for player 0 generate, then mirror)
  const mirror = (x, y) => [N - 1 - x, N - 1 - y];
  const cluster = (type, cx, cy, count) => {
    const q = [[cx, cy]], done = new Set(); let placed = 0;
    while (q.length && placed < count) { const k = Math.floor(rng() * Math.min(q.length, 3)); const [x, y] = q.splice(k, 1)[0]; const key = x + ',' + y; if (done.has(key)) continue; done.add(key); if (!free(x, y) || occ[I(x, y)]) continue; mkRes(type, x, y); const [mx, my] = mirror(x, y); mkRes(type, mx, my); placed++; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) q.push([x + dx, y + dy]); }
  };
  // reserve TC tiles so resources don't overlap
  for (const [bx, by] of starts) for (let j = by - 1; j < by + 5; j++) for (let i = bx - 1; i < bx + 5; i++) occ[I(i, j)] = -5;
  const bx = B0[0], by = B0[1];
  cluster('berry', bx + 8, by - 3, 8);
  cluster('gold', bx - 5, by + 8, 7);
  cluster('gold', bx + 11, by + 6, 6);
  cluster('stone', bx + 6, by - 7, 5);
  cluster('berry', bx - 6, by - 2, 6);
  // forests
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (x + y > N - 1) continue;
    const edge = Math.min(x, y, N - 1 - x, N - 1 - y);
    const v = n1(x, y) + (edge < 3 ? .5 : 0) + (edge < 6 ? .1 : 0);
    if (v > .7 && !nearBase(x, y, 9.5) && free(x, y) && !occ[I(x, y)] && rng() < .92) { mkRes('tree', x, y); const [mx, my] = mirror(x, y); mkRes('tree', mx, my); }
  }
  // guaranteed woodline near base
  for (let k = 0; k < 40; k++) { const a = -0.3 + rng() * .9, r = 10 + rng() * 3; const x = Math.round(bx + 2 - Math.cos(a) * r * .2 + Math.cos(a + 2.1) * r), y = Math.round(by + 2 + Math.sin(a + 2.1) * r); if (x > 0 && y > 0 && !nearBase(x, y, 9)) cluster('tree', x, y, 1); }
  for (let k = 0; k < 40; k++) { const x = Math.round(bx - 9 + rng() * 5), y = Math.round(by + 12 + rng() * 5); if (x > 0) cluster('tree', x, y, 1); }
  // stragglers
  for (let k = 0; k < 10; k++) { const a = rng() * 6.28, r = 5.5 + rng() * 2.5; const x = Math.round(bx + 2 + Math.cos(a) * r), y = Math.round(by + 2 + Math.sin(a) * r); cluster('tree', x, y, 1); }
  // mid-map resources
  cluster('gold', 40, 58, 8); cluster('stone', 30, 45, 6); cluster('gold', 58, 18, 6); cluster('berry', 36, 30, 6);
  for (const [sx, sy] of starts) for (let j = sy - 1; j < sy + 5; j++) for (let i = sx - 1; i < sx + 5; i++) occ[I(i, j)] = 0;
  // players
  P = [mkPlayer(0, false), mkPlayer(1, true)];
  starts.forEach(([x, y], id) => {
    const tc = mkBld('towncenter', id, x, y, true); P[id].home = { x: tc.x, y: tc.y };
    for (let k = 0; k < 3; k++) mkUnit('villager', id, x + 1 + k, y + 4.6);
    const sc = mkUnit('scout', id, x + 4.6, y + 4.6);
  });
}

// ---------------- AI ----------------
const AI = { t: 0, waveT: 0, waveN: 0, wave: false, rebalance: 0, milIdx: 0 };
function canPlace(type, bx, by, owner, margin = 0) {
  const s = BLD[type].s;
  for (let j = by - margin; j < by + s + margin; j++) for (let i = bx - margin; i < bx + s + margin; i++) {
    if (!inMap(i, j)) return false;
    const inner = i >= bx && i < bx + s && j >= by && j < by + s;
    if (inner) { if (block[I(i, j)] !== 0 || occ[I(i, j)] !== 0) return false; if (owner === 0 && !vis[I(i, j)]) return false; }
    else if (block[I(i, j)] > 0 && byId.get(block[I(i, j)]) && byId.get(block[I(i, j)]).kind === 'bld' || occ[I(i, j)] > 0) return false;
  }
  return true;
}
function findSpot(type, ax, ay, rmin, rmax, margin = 1) {
  const s = BLD[type].s;
  for (let r = rmin; r <= rmax; r++) {
    for (let k = 0; k < 24; k++) { const a = rng() * 6.283; const x = Math.round(ax + Math.cos(a) * r - s / 2), y = Math.round(ay + Math.sin(a) * r - s / 2); if (canPlace(type, x, y, 1, margin)) return [x, y]; }
  }
  return null;
}
function aiBuild(p, type, spot, builders) {
  if (!spot || !afford(p, BLD[type].cost)) return null;
  pay(p, BLD[type].cost);
  const b = mkBld(type, p.id, spot[0], spot[1], false);
  for (const u of builders) { if (u.order.type === 'gather') u.after = u.order; u.order = { type: 'build', target: b }; u.path = null; }
  return b;
}
function aiTick(p) {
  const me = p.id, mine = ents.filter(e => !e.dead && e.owner === me);
  const vils = mine.filter(e => e.type === 'villager'), army = mine.filter(MIL), blds = mine.filter(e => e.kind === 'bld');
  const cnt = t => blds.filter(b => b.type === t).length;
  const tc = blds.find(b => b.type === 'towncenter' && b.done);
  const home = tc ? tc : blds[0] || vils[0]; if (!home) return;
  const hx = home.x, hy = home.y;
  const saving = [...p.researching].some(t => TECH[t].isAge);
  const ageNext = p.age < 3 ? TECH['age' + (p.age + 1)] : null;
  const vilTarget = [22, 30, 40, 48][p.age] + diff * 2;
  const ageVils = [18, 25, 32][p.age] - (diff === 2 ? 2 : 0);
  const reserveAge = ageNext && vils.length >= ageVils - 3 && !saving;
  const canSpend = (c, essential) => afford(p, c) && (essential || !reserveAge || RES.every(r => !c[r] || !ageNext.cost[r] || p.res[r] - c[r] >= ageNext.cost[r] * .85));
  // villagers
  if (tc && vils.length < vilTarget && tc.queue.filter(q => q.kind === 'unit').length < 2 && afford(p, UNITS.villager.cost)) queueItem(tc, 'unit', 'villager');
  // age up
  if (tc && ageNext && !saving && vils.length >= ageVils && afford(p, ageNext.cost) && tc.queue.length < 2 && gtime > [0, 300, 600][p.age] / (1 + diff * .25)) queueItem(tc, 'tech', 'age' + (p.age + 1));
  // builders helper
  const freeVil = (x, y) => { let b = null, bd = 1e9; for (const u of vils) { if (u.order.type === 'build') continue; const d = Math.hypot(u.x - x, u.y - y) + (u.carry.amt > 5 ? 3 : 0); if (d < bd) { bd = d; b = u; } } return b; };
  const building = t => blds.some(b => b.type === t && !b.done);
  let built = false;
  const tryBuild = (type, spot, nb = 1) => { if (built || !spot || !canSpend(BLD[type].cost, type === 'house' || type.endsWith('camp') || type === 'mill')) return; const bs = []; for (let k = 0; k < nb; k++) { const v = freeVil(spot[0], spot[1]); if (v && !bs.includes(v)) bs.push(v); } if (!bs.length) return; if (aiBuild(p, type, spot, bs)) built = true; };
  // re-staff abandoned foundations
  for (const b of blds) if (!b.done && !vils.some(u => u.order.type === 'build' && u.order.target === b)) { const v = freeVil(b.x, b.y); if (v) { if (v.order.type === 'gather') v.after = v.order; v.order = { type: 'build', target: b }; v.path = null; } }
  // houses
  if (p.cap < 200 && p.cap - p.pop <= 3 + p.age * 2 && !building('house')) tryBuild('house', findSpot('house', hx, hy, 5, 14));
  if (p.cap < 200 && p.cap - p.pop <= 1 && blds.filter(b => b.type === 'house' && !b.done).length < 2) tryBuild('house', findSpot('house', hx, hy, 5, 14));
  const nearestResTo = (rt, x, y, rad) => findRes(me, rt, x, y, rad);
  // lumber camp near woodline
  const camps = blds.filter(b => b.type === 'lumbercamp');
  const campOk = camps.some(c => findRes(me, 'tree', c.x, c.y, 6));
  if (vils.length >= 5 && !campOk && !building('lumbercamp')) { const t = nearestResTo('tree', hx, hy, 40); if (t) tryBuild('lumbercamp', findSpot('lumbercamp', t.x, t.y, 2, 5, 0)); }
  const berry = nearestResTo('berry', hx, hy, 14);
  if (vils.length >= 7 && berry && !blds.some(b => b.type === 'mill' && Math.hypot(b.x - berry.x, b.y - berry.y) < 7)) tryBuild('mill', findSpot('mill', berry.x, berry.y, 2, 5, 0));
  if (vils.length >= 11 && !blds.some(b => b.type === 'miningcamp' && findRes(me, 'gold', b.x, b.y, 6))) { const g = nearestResTo('gold', hx, hy, 30); if (g) tryBuild('miningcamp', findSpot('miningcamp', g.x, g.y, 2, 5, 0)); }
  if (vils.length >= 12 && cnt('barracks') === 0) tryBuild('barracks', findSpot('barracks', hx, hy, 7, 15));
  if (p.age >= 1) {
    if (cnt('archery') === 0) tryBuild('archery', findSpot('archery', hx, hy, 7, 16));
    if (cnt('blacksmith') === 0 && vils.length >= 20) tryBuild('blacksmith', findSpot('blacksmith', hx, hy, 6, 16));
    if (cnt('stable') === 0 && vils.length >= 22) tryBuild('stable', findSpot('stable', hx, hy, 7, 16));
    if (cnt('tower') < diff && p.res.stone > 300) tryBuild('tower', findSpot('tower', hx + (N / 2 - hx) * .15, hy + (N / 2 - hy) * .15, 3, 8));
  }
  if (p.age >= 2) {
    if (cnt('siege') === 0) tryBuild('siege', findSpot('siege', hx, hy, 8, 18));
    if (cnt('barracks') < 2 && vils.length >= 30) tryBuild('barracks', findSpot('barracks', hx, hy, 8, 18));
    if (cnt('stable') < 2 && vils.length >= 34) tryBuild('stable', findSpot('stable', hx, hy, 8, 18));
    if (cnt('castle') === 0 && p.res.stone >= 650) tryBuild('castle', findSpot('castle', hx + (N / 2 - hx) * .12, hy + (N / 2 - hy) * .12, 5, 14), 3);
  }
  if (!tc && afford(p, BLD.towncenter.cost) && p.age >= 2) tryBuild('towncenter', findSpot('towncenter', hx, hy, 0, 14), 4);
  // worker distribution
  const share = [{ food: .52, wood: .40, gold: .08, stone: 0 }, { food: .46, wood: .32, gold: .17, stone: .05 }, { food: .42, wood: .27, gold: .24, stone: .07 }, { food: .40, wood: .25, gold: .30, stone: .05 }][p.age];
  const task = u => { const o = u.order; if (o.type !== 'gather') return o.type === 'build' ? 'build' : 'idle'; return o.rtype === 'farm' || o.rtype === 'berry' ? 'food' : o.rtype === 'tree' ? 'wood' : o.rtype; };
  const have = { food: 0, wood: 0, gold: 0, stone: 0 };
  for (const u of vils) { const t = task(u); if (have[t] != null) have[t]++; }
  const assign = (u, rt) => {
    const dsNear = rtype => { const r = findRes(me, rtype, hx, hy, 40); return r; };
    if (rt === 'food') {
      const onBerry = vils.filter(v => v.order.type === 'gather' && v.order.rtype === 'berry').length; const b = onBerry < 7 && findRes(me, 'berry', hx, hy, 16); if (b) { u.order = { type: 'gather', target: b, rtype: 'berry', phase: 'go' }; return true; }
      const f = findRes(me, 'farm', hx, hy, 30); if (f) { f.farmer = u; u.order = { type: 'gather', target: f, rtype: 'farm', phase: 'go' }; return true; }
      if (p.res.wood >= 60) { const mill = blds.find(b => b.type === 'mill' && b.done); const a = tc || mill || home; const spot = findSpotFarm(a); if (spot) { pay(p, BLD.farm.cost); const fm = mkBld('farm', me, spot[0], spot[1], false); u.order = { type: 'build', target: fm }; u.path = null; return true; } }
      return false;
    }
    const rtype = rt === 'wood' ? 'tree' : rt;
    let src = null;
    if (rt === 'wood') { for (const c of camps) { src = findRes(me, 'tree', c.x, c.y, 8); if (src) break; } }
    if (rt !== 'wood') { const mc = blds.find(b => b.type === 'miningcamp' && findRes(me, rtype, b.x, b.y, 6)); if (mc) src = findRes(me, rtype, mc.x, mc.y, 6); }
    if (!src) src = dsNear(rtype);
    if (!src) return false;
    u.order = { type: 'gather', target: src, rtype, phase: 'go' }; u.path = null; return true;
  };
  const deficit = () => { let best = null, bv = -1e9; for (const r of RES) { const v = share[r] * vils.length - have[r]; if (share[r] > 0 && v > bv) { bv = v; best = r; } } return best; };
  for (const u of vils) {
    if (u.order.type !== 'idle') continue;
    let rt = deficit(); if (!assign(u, rt)) { for (const r of ['wood', 'food', 'gold', 'stone']) if (r !== rt && assign(u, r)) { rt = r; break; } }
    have[rt] = (have[rt] || 0) + 1;
  }
  if ((AI.rebalance -= 1) <= 0) {
    AI.rebalance = 12;
    let over = null, ov = 1.5; for (const r of RES) { const v = have[r] - share[r] * vils.length; if (v > ov) { ov = v; over = r; } }
    const want = deficit();
    if (over && want && over !== want) { const u = vils.find(v => task(v) === over && v.carry.amt < 3); if (u) { have[over]--; if (assign(u, want)) have[want]++; } }
  }
  // camp for stone when needed
  if (p.age >= 1 && have.stone > 0 && !blds.some(b => b.type === 'miningcamp' && findRes(me, 'stone', b.x, b.y, 6)) && !building('miningcamp')) { const s = nearestResTo('stone', hx, hy, 30); if (s) tryBuild('miningcamp', findSpot('miningcamp', s.x, s.y, 2, 5, 0)); }
  // techs
  if (!saving) {
    const order = ['loom', 'doubleaxe', 'horsecollar', 'wheelbarrow', 'forging', 'fletching', 'scalemail', 'goldmining', 'bowsaw', 'heavyplow', 'ironcasting', 'bodkin', 'chainmail', 'handcart', 'champion', 'arbalest', 'paladin'];
    for (const t of order) {
      const d = TECH[t]; if (p.techs.has(t) || p.researching.has(t) || d.age > p.age || (d.req && !p.techs.has(d.req))) continue;
      if (t === 'loom' && vils.length < 16) continue;
      const b = blds.find(b => b.done && b.def.techs && b.def.techs.includes(t) && b.queue.length === 0);
      if (b && canSpend(d.cost)) { queueItem(b, 'tech', t); break; }
    }
  }
  // military production
  const comp = { barracks: p.age >= 1 ? ['militia', 'spearman', 'militia'] : ['militia'], archery: ['archer', 'archer', 'skirm'], stable: p.age >= 2 ? ['knight', 'knight', 'scout'] : ['scout'], siege: ['mangonel', 'ram'], castle: ['longbow'] };
  const milCap = [8, 20, 45, 70][p.age];
  for (const b of blds) {
    if (!b.done || !comp[b.type] || b.queue.length >= 2 || army.length >= milCap) continue;
    if (b.type === 'siege' && army.filter(u => u.def.cls === 'siege').length >= 3) continue;
    const list = comp[b.type]; const t = list[(AI.milIdx++) % list.length];
    if (UNITS[t].age <= p.age && canSpend(UNITS[t].cost) && (p.age > 0 || vils.length >= 14)) queueItem(b, 'unit', t);
  }
  // defense
  let threat = null;
  for (const e of ents) { if (e.dead || e.owner !== 0 || e.kind !== 'unit') continue; if (blds.some(b => Math.hypot(b.x - e.x, b.y - e.y) < 12)) { threat = e; break; } }
  if (threat) { for (const u of army) if (u.order.type === 'idle' || (u.order.type === 'amove' && !AI.wave) || u.order.type === 'move') { u.order = { type: 'attack', target: threat, rp: 0 }; u.path = null; } }
  // attack waves
  const firstAttack = [720, 540, 400][diff];
  const waveSize = Math.min(28, [5, 6, 7][diff] + AI.waveN * 3);
  const idleArmy = army.filter(u => u.order.type === 'idle' || u.order.type === 'amove');
  if (!AI.wave && gtime > firstAttack && army.length >= waveSize && gtime > AI.waveT) {
    AI.wave = true; AI.waveN++;
    msg('🔥 The Red Kingdom is marching on you!', '#ff8a7a');
  }
  if (AI.wave) {
    const tgt = aiTarget(army[0] || home);
    if (!tgt || army.length < Math.max(2, waveSize * .3)) { AI.wave = false; AI.waveT = gtime + 90; for (const u of army) { u.order = { type: 'move' }; pathTo(u, hx + rng() * 4, hy + 5 + rng() * 4); } }
    else for (const u of idleArmy) { if (u.order.type === 'amove' && u.order.x === tgt.x && u.order.y === tgt.y) continue; u.order = { type: 'amove', x: tgt.x, y: tgt.y }; u.path = null; }
  }
}
function aiTarget(from) {
  let best = null, bd = 1e9;
  for (const e of ents) { if (e.dead || e.owner !== 0 || e.kind !== 'bld') continue; const d = Math.hypot(e.x - from.x, e.y - from.y) + (e.type === 'farm' ? 6 : 0); if (d < bd) { bd = d; best = e; } }
  if (!best) for (const e of ents) if (!e.dead && e.owner === 0) return e;
  return best;
}
function findSpotFarm(a) {
  for (let r = 2; r <= 9; r++) for (let k = 0; k < 20; k++) { const ang = rng() * 6.283, x = Math.round(a.x + Math.cos(ang) * (r + a.s / 2) - 1.5), y = Math.round(a.y + Math.sin(ang) * (r + a.s / 2) - 1.5); if (canPlace('farm', x, y, 1, 0)) return [x, y]; }
  return null;
}

// ---------------- simulation step ----------------
let visT = 0, aiT = 0, uiT = 0, winT = 0;
function step(dt) {
  gtime += dt;
  for (const p of P) { p.pop = 0; p.cap = 0; }
  for (const e of ents) { if (e.dead) continue; if (e.kind === 'unit') P[e.owner].pop++; else if (e.kind === 'bld' && e.done && e.def.pop) P[e.owner].cap += e.def.pop; }
  for (const p of P) p.cap = Math.min(200, p.cap);
  for (const e of ents) { if (e.dead) continue; if (e.kind === 'unit') updUnit(e, dt); else if (e.kind === 'bld') updBld(e, dt); }
  separate(dt);
  for (const pr of projs) {
    pr.t += dt;
    if (pr.target && alive(pr.target) && pr.kind === 'arrow') { pr.tx += (pr.target.x - pr.tx) * Math.min(1, dt * 6); pr.ty += (pr.target.y - pr.ty) * Math.min(1, dt * 6); }
    if (pr.t >= pr.dur) {
      pr.done = true;
      if (pr.kind === 'rock') {
        fx.push({ k: 'dust', x: pr.tx, y: pr.ty, t: 0, life: .8 });
        for (const e of ents) { if (e.dead || e.kind === 'res' || e.owner === pr.owner && e.kind === 'bld') continue; const d = distTo({ x: pr.tx, y: pr.ty }, e); if (d <= pr.splash) dealDamage(pr.att, e, e.owner === pr.owner ? pr.dmg * .5 : pr.dmg, false, pr.owner); }
      } else if (alive(pr.target) && distTo({ x: pr.tx, y: pr.ty }, pr.target) < .6) dealDamage(pr.att, pr.target, pr.dmg, true, pr.owner);
    }
  }
  projs = projs.filter(p => !p.done);
  for (const f of fx) f.t += dt; fx = fx.filter(f => f.t < f.life);
  if (ents.some(e => e.dead)) { ents = ents.filter(e => !e.dead); sel = sel.filter(alive); }
  if ((aiT -= dt) <= 0) { aiT = 1; for (const p of P) if (p.ai && !p.defeated) aiTick(p); }
  if ((visT -= dt) <= 0) { visT = .25; computeVis(); }
  if ((winT -= dt) <= 0) { winT = 1; checkWin(); }
}
function separate(dt) {
  const grid = new Map();
  for (const u of ents) { if (u.kind !== 'unit' || u.dead) continue; const k = (u.x | 0) + (u.y | 0) * N; let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(u); }
  for (const u of ents) {
    if (u.kind !== 'unit' || u.dead) continue;
    const cx = u.x | 0, cy = u.y | 0;
    for (let j = cy - 1; j <= cy + 1; j++) for (let i = cx - 1; i <= cx + 1; i++) {
      const a = grid.get(i + j * N); if (!a) continue;
      for (const v of a) {
        if (v.id <= u.id) continue;
        const dx = v.x - u.x, dy = v.y - u.y, d = Math.hypot(dx, dy), min = .42;
        if (d < min && d > 1e-4) {
          const push = (min - d) * .5 * Math.min(1, dt * 8), nx = dx / d * push, ny = dy / d * push;
          const um = u.working ? .2 : 1, vm = v.working ? .2 : 1;
          if (free((u.x - nx * um) | 0, (u.y - ny * um) | 0)) { u.x -= nx * um; u.y -= ny * um; }
          if (free((v.x + nx * vm) | 0, (v.y + ny * vm) | 0)) { v.x += nx * vm; v.y += ny * vm; }
        } else if (d <= 1e-4) { v.x += (rng() - .5) * .05; v.y += (rng() - .5) * .05; }
      }
    }
  }
}
function computeVis() {
  for (let i = 0; i < vis.length; i++) if (vis[i] === 2) vis[i] = 1;
  for (const e of ents) {
    if (e.dead || e.owner !== 0) continue;
    const r = e.kind === 'unit' ? st(e, 'los') : e.def.los + e.s / 2, cx = e.x, cy = e.y;
    const r2 = r * r;
    for (let j = Math.max(0, Math.floor(cy - r)); j <= Math.min(N - 1, Math.floor(cy + r)); j++) for (let i = Math.max(0, Math.floor(cx - r)); i <= Math.min(N - 1, Math.floor(cx + r)); i++) { const dx = i + .5 - cx, dy = j + .5 - cy; if (dx * dx + dy * dy <= r2) vis[I(i, j)] = 2; }
  }
}
function checkWin() {
  if (over) return;
  for (const p of P) {
    const has = ents.some(e => !e.dead && e.owner === p.id && (e.kind === 'unit' || (e.kind === 'bld' && e.type !== 'farm')));
    if (!has) p.defeated = true;
  }
  if (P[0].defeated || P[1].defeated) endGame(!P[0].defeated);
}
function endGame(win) {
  over = true; paused = true;
  document.getElementById('endTitle').textContent = win ? 'Victory!' : 'Defeat';
  const s = P[0].stats, e = P[1].stats;
  document.getElementById('endStats').innerHTML = `${win ? 'The Red Kingdom has fallen. Your dynasty will be remembered for ages.' : 'Your kingdom lies in ruins.'}<br><br>
  <table style="margin:auto;text-align:left;border-spacing:18px 2px"><tr><th></th><th style="color:#8fb5ff">You</th><th style="color:#ff9d8d">Red</th></tr>
  <tr><td>Time played</td><td colspan=2>${fmtTime(gtime)}</td></tr>
  <tr><td>Age reached</td><td>${AGES[P[0].age]}</td><td>${AGES[P[1].age]}</td></tr>
  <tr><td>Units trained</td><td>${s.trained}</td><td>${e.trained}</td></tr><tr><td>Units killed</td><td>${s.killed}</td><td>${e.killed}</td></tr>
  <tr><td>Buildings razed</td><td>${s.razed}</td><td>${e.razed}</td></tr><tr><td>Resources gathered</td><td>${s.gathered}</td><td>${e.gathered}</td></tr></table>`;
  document.getElementById('endScreen').classList.remove('hidden');
  if (win) [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => sfx(f, .4, 'triangle', .07), i * 160));
  else [392, 330, 262, 196].forEach((f, i) => setTimeout(() => sfx(f, .5, 'sawtooth', .05), i * 220));
}
const fmtTime = t => String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(Math.floor(t % 60)).padStart(2, '0');

// ---------------- audio ----------------
let AC = null, sfxN = 0;
function sfx(f, d = .08, type = 'square', vol = .04, slide = 0) {
  if (!AC || sfxN > 8) return; sfxN++; setTimeout(() => sfxN--, d * 1000);
  const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime;
  o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(f * slide, t + d);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + d);
  o.connect(g).connect(AC.destination); o.start(t); o.stop(t + d + .02);
}

// ================= RENDERING =================
const cv = document.getElementById('game'), ctx = cv.getContext('2d');
const mini = document.getElementById('mini'), mctx = mini.getContext('2d');
let W = 0, H = 0, DPR = 1;
const cam = { x: 0, y: 0 };
function resize() { DPR = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * DPR; cv.height = H * DPR; cv.style.width = W + 'px'; cv.style.height = H + 'px'; }
addEventListener('resize', resize); resize();
const iso = (x, y) => [(x - y) * HW - cam.x, (x + y) * HH - cam.y];
const toTile = (sx, sy) => { const X = sx + cam.x, Y = sy + cam.y; return [(X / HW + Y / HH) / 2, (Y / HH - X / HW) / 2]; };
function centerOn(x, y) { cam.x = (x - y) * HW - W / 2; cam.y = (x + y) * HH - (H - 110) / 2; clampCam(); }
function clampCam() { cam.x = Math.max(-N * HW - W / 2, Math.min(N * HW - W / 2, cam.x)); cam.y = Math.max(-H / 2, Math.min(N * TH - H / 2 + 150, cam.y)); }

function shade(hex, a) { let n = parseInt(hex.slice(1), 16), r = n >> 16, g = n >> 8 & 255, b = n & 255; const f = a < 0 ? 0 : 255, t = Math.abs(a); r = Math.round((f - r) * t + r); g = Math.round((f - g) * t + g); b = Math.round((f - b) * t + b); return `rgb(${r},${g},${b})`; }
function makeTile(base, spots, seed, water) {
  const c = document.createElement('canvas'); c.width = TW + 2; c.height = TH + 2; const g = c.getContext('2d');
  g.translate(1, 1); g.beginPath(); g.moveTo(HW, -1); g.lineTo(TW + 1.5, HH); g.lineTo(HW, TH + 1); g.lineTo(-1.5, HH); g.closePath(); g.clip();
  g.fillStyle = base; g.fillRect(-2, -2, TW + 4, TH + 4);
  const r = mulberry(seed);
  for (let k = 0; k < 60; k++) { g.fillStyle = spots[Math.floor(r() * spots.length)]; const x = r() * TW, y = r() * TH; if (water) g.fillRect(x, y, 6 + r() * 8, 1); else g.fillRect(x, y, 2 + r() * 2, 1 + r() * 1.5); }
  if (!water) for (let k = 0; k < 8; k++) { g.strokeStyle = spots[0]; g.beginPath(); const x = r() * TW, y = r() * TH; g.moveTo(x, y); g.lineTo(x + r() * 2 - 1, y - 3); g.stroke(); }
  return c;
}
const TILES = [
  [0, 1, 2, 3].map(s => makeTile('#5d8a36', ['#4f7a2d', '#6a9a3e', '#76a646', '#557f31'], s * 7 + 1)),
  [0, 1].map(s => makeTile('#9a7f4f', ['#8a6f42', '#a88c5a', '#7d653d', '#b39766'], s * 5 + 3)),
  [0, 1].map(s => makeTile('#2e6a9c', ['#3a7db3', '#285d8a', '#4b8fc2'], s * 3 + 9, true)),
];
function poly(pts, fill, stroke) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); } }
const upv = (p, h) => [p[0], p[1] - h];
function box(x0, y0, sx, sy, h, col, topCol) {
  const A = iso(x0, y0), B = iso(x0 + sx, y0), C = iso(x0 + sx, y0 + sy), D = iso(x0, y0 + sy);
  poly([D, C, upv(C, h), upv(D, h)], shade(col, .08), '#0004');
  poly([C, B, upv(B, h), upv(C, h)], shade(col, -.25), '#0004');
  if (topCol) poly([upv(A, h), upv(B, h), upv(C, h), upv(D, h)], topCol, '#0003');
  return { A: upv(A, h), B: upv(B, h), C: upv(C, h), D: upv(D, h) };
}
function roof(t, rh, col, over = 4) {
  const cx = (t.A[0] + t.C[0]) / 2, cy = (t.A[1] + t.C[1]) / 2, ex = p => [p[0] + (p[0] - cx) * over / 30, p[1] + (p[1] - cy) * over / 30];
  const A = ex(t.A), B = ex(t.B), C = ex(t.C), D = ex(t.D), ap = [cx, cy - rh];
  poly([A, B, ap], shade(col, -.35)); poly([A, D, ap], shade(col, -.1));
  poly([D, C, ap], shade(col, .12), '#0005'); poly([C, B, ap], shade(col, -.2), '#0005');
  return ap;
}
function flag(x, y, col, h = 22) {
  ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - h); ctx.stroke();
  const w = Math.sin(now * 5 + x) * 2; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, y - h); ctx.quadraticCurveTo(x + 6, y - h - 2 + w, x + 12, y - h + 2 + w); ctx.lineTo(x, y - h + 7); ctx.fill();
}
function crenel(t, col, n = 6) {
  ctx.fillStyle = col;
  for (const [P1, P2] of [[t.D, t.C], [t.C, t.B]]) for (let k = 0; k < n; k++) { const f = (k + .25) / n, g = (k + .6) / n; const a = [P1[0] + (P2[0] - P1[0]) * f, P1[1] + (P2[1] - P1[1]) * f], b = [P1[0] + (P2[0] - P1[0]) * g, P1[1] + (P2[1] - P1[1]) * g]; poly([a, b, upv(b, 5), upv(a, 5)], col, '#0005'); }
}
const WOOD = '#b08552', STONE = '#9a968c', PLASTER = '#d8c9a3';
function drawBld(b) {
  const d = b.def, s = b.s, pc = PCOL[b.owner], i = .12, x0 = b.bx + i, y0 = b.by + i, w = s - 2 * i;
  const prog = b.done ? 1 : b.progress, hk = b.done ? 1 : .15 + prog * .85;
  if (b.type === 'farm') return drawFarm(b);
  // foundation
  poly([iso(b.bx, b.by), iso(b.bx + s, b.by), iso(b.bx + s, b.by + s), iso(b.bx, b.by + s)], '#7a6848', '#5a4a30');
  if (!b.done) ctx.globalAlpha = .55 + prog * .45;
  const [cx, cy] = iso(b.x, b.y);
  let t, ap;
  switch (b.type) {
    case 'towncenter': {
      t = box(x0, y0, w, w, 16 * hk, STONE, '#8b877d');
      const t2 = box(x0 + .5, y0 + .5, w - 1, w - 1, 34 * hk, PLASTER);
      roof(t2, 26 * hk, '#8a3d22', 6);
      const t3 = box(b.x - .5, b.y - .5, 1, 1, 58 * hk, PLASTER); ap = roof(t3, 18 * hk, '#6f2e18', 3);
      if (b.done) flag(ap[0], ap[1], pc, 18);
      break;
    }
    case 'house': t = box(x0, y0, w, w, 18 * hk, PLASTER); ctx.fillStyle = '#5a3a1e'; { const C = iso(x0 + w, y0 + w); ctx.fillRect(C[0] + 6, C[1] - 12 * hk - 4, 5, 10 * hk); } ap = roof(t, 16 * hk, '#a2472a'); if (b.done) flag(t.B[0] - 4, t.B[1] + 2, pc, 14); break;
    case 'mill': t = box(x0, y0, w, w, 22 * hk, WOOD); ap = roof(t, 14 * hk, '#6e5030'); if (b.done) { const a = now * 1.5; ctx.strokeStyle = '#e8dcc0'; ctx.lineWidth = 3; for (let k = 0; k < 4; k++) { const an = a + k * Math.PI / 2; ctx.beginPath(); ctx.moveTo(ap[0], ap[1] + 4); ctx.lineTo(ap[0] + Math.cos(an) * 22, ap[1] + 4 + Math.sin(an) * 22); ctx.stroke(); } ctx.fillStyle = '#4a3420'; ctx.beginPath(); ctx.arc(ap[0], ap[1] + 4, 3, 0, 7); ctx.fill(); flag(t.D[0] + 4, t.D[1] + 4, pc, 12); } break;
    case 'lumbercamp': case 'miningcamp': {
      const posts = [[x0, y0 + w], [x0 + w, y0 + w], [x0 + w, y0]]; ctx.strokeStyle = '#4a3420'; ctx.lineWidth = 3;
      for (const [px, py] of posts) { const p = iso(px, py); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0], p[1] - 18 * hk); ctx.stroke(); }
      t = box(x0, y0, w, w, 0, WOOD); const tt = { A: upv(t.A, 18 * hk), B: upv(t.B, 18 * hk), C: upv(t.C, 18 * hk), D: upv(t.D, 18 * hk) };
      if (b.type === 'lumbercamp') { ctx.fillStyle = '#7b5530'; for (let k = 0; k < 4; k++) { ctx.fillRect(cx - 16, cy - 4 - k * 5, 30, 4); ctx.fillStyle = k % 2 ? '#7b5530' : '#8e6639'; } }
      else { ctx.fillStyle = '#c9a642'; ctx.beginPath(); ctx.arc(cx - 6, cy - 2, 7, Math.PI, 0); ctx.fill(); ctx.fillStyle = '#8f8a80'; ctx.beginPath(); ctx.arc(cx + 8, cy, 6, Math.PI, 0); ctx.fill(); }
      roof(tt, 10 * hk, '#6e5030', 6); if (b.done) flag(tt.D[0] + 2, tt.D[1] + 18, pc, 26); break;
    }
    case 'barracks': t = box(x0, y0, w, w, 24 * hk, WOOD); crenel(t, WOOD, 5); ap = roof(box(x0 + .6, y0 + .6, w - 1.2, w - 1.2, 24 * hk, WOOD), 14 * hk, '#5a4028'); if (b.done) { flag(t.A[0], t.A[1] + 2, pc, 30); const C = iso(x0 + w * .75, y0 + w); ctx.fillStyle = pc; ctx.fillRect(C[0] - 4, C[1] - 20, 8, 12); } break;
    case 'archery': t = box(x0, y0, w, w, 22 * hk, WOOD); ap = roof(t, 18 * hk, '#556b2f'); if (b.done) { const C = iso(x0 + w * .4, y0 + w); ctx.fillStyle = '#eee'; ctx.beginPath(); ctx.arc(C[0] + 10, C[1] - 11, 6, 0, 7); ctx.fill(); ctx.fillStyle = '#c33'; ctx.beginPath(); ctx.arc(C[0] + 10, C[1] - 11, 3.5, 0, 7); ctx.fill(); flag(ap[0], ap[1], pc, 14); } break;
    case 'stable': t = box(x0, y0, w, w, 20 * hk, WOOD); ap = roof(t, 16 * hk, '#8a6a2a'); if (b.done) { ctx.fillStyle = '#d6b85a'; ctx.fillRect(cx + 18, cy + 4, 14, 7); flag(ap[0], ap[1], pc, 14); } break;
    case 'blacksmith': t = box(x0, y0, w, w, 22 * hk, STONE); ap = roof(t, 14 * hk, '#4d4d55'); if (b.done) { const C = iso(x0 + w * .3, y0 + w * .3); ctx.fillStyle = '#555'; ctx.fillRect(C[0] - 3, C[1] - 58, 7, 22); for (let k = 0; k < 3; k++) { const f = (now * .6 + k / 3) % 1; ctx.fillStyle = `rgba(90,90,90,${.5 - f * .5})`; ctx.beginPath(); ctx.arc(C[0] + f * 10, C[1] - 60 - f * 30, 4 + f * 7, 0, 7); ctx.fill(); } flag(t.B[0] - 6, t.B[1] + 4, pc, 14); } break;
    case 'siege': t = box(x0, y0, w, w, 20 * hk, WOOD); ap = roof(t, 12 * hk, '#5a4028'); if (b.done) { ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx + 22, cy - 6, 8, 0, 7); ctx.stroke(); flag(ap[0], ap[1], pc, 14); } break;
    case 'tower': t = box(x0 + .1, y0 + .1, w - .2, w - .2, 62 * hk, STONE, '#8b877d'); if (b.done) { crenel(t, STONE, 2); flag((t.A[0] + t.C[0]) / 2, (t.A[1] + t.C[1]) / 2, pc, 18); } break;
    case 'castle': {
      t = box(x0 + .3, y0 + .3, w - .6, w - .6, 44 * hk, STONE, '#8b877d'); if (b.done) crenel(t, STONE, 7);
      const keep = box(b.x - .8, b.y - .8, 1.6, 1.6, 66 * hk, '#a8a498', '#8b877d'); if (b.done) crenel(keep, '#a8a498', 3);
      for (const [tx, ty] of [[x0, y0 + w - 1], [x0 + w - 1, y0 + w - 1], [x0 + w - 1, y0]]) { const tw = box(tx, ty, 1, 1, 56 * hk, STONE, '#8b877d'); if (b.done) roof(tw, 14, '#5a5a66', 3); }
      if (b.done) flag((keep.A[0] + keep.C[0]) / 2, (keep.A[1] + keep.C[1]) / 2, pc, 24);
      break;
    }
  }
  ctx.globalAlpha = 1;
  if (!b.done) { // scaffolding
    ctx.strokeStyle = '#6b4a24'; ctx.lineWidth = 1.5; const hh = 30 * (1 - prog) + 8;
    for (const [px, py] of [[b.bx, b.by + s], [b.bx + s, b.by + s], [b.bx + s, b.by], [b.bx + s / 2, b.by + s]]) { const p = iso(px, py); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0], p[1] - hh - 20); ctx.stroke(); }
  }
}
function drawFarm(b) {
  const s = b.s, A = iso(b.bx, b.by), B = iso(b.bx + s, b.by), C = iso(b.bx + s, b.by + s), D = iso(b.bx, b.by + s);
  poly([A, B, C, D], b.done ? '#6e4e2c' : '#7a6848', '#4a3420');
  if (!b.done) { ctx.globalAlpha = b.progress; }
  const f = b.done ? b.amount / BLD.farm.food : b.progress;
  ctx.strokeStyle = b.done ? `rgb(${140 + (1 - f) * 60},${170 - (1 - f) * 20},${60})` : '#5a3e20'; ctx.lineWidth = 2.5;
  for (let k = 1; k < 9; k++) { const t = k / 9, p1 = iso(b.bx + .2, b.by + t * s), p2 = iso(b.bx + s - .2, b.by + t * s); ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke(); }
  ctx.globalAlpha = 1;
}
function drawRes(r) {
  const [sx, sy] = iso(r.x, r.y), v = r.v;
  if (r.type === 'tree') {
    ctx.fillStyle = '#0003'; ctx.beginPath(); ctx.ellipse(sx + 3, sy + 1, 15, 6, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#5b3a1e'; ctx.fillRect(sx - 2.5, sy - 16, 5, 16);
    const hs = .85 + v * .35;
    if (v < .45) { // pine
      const cols = ['#1f4a26', '#2a5e30', '#35703a'];
      for (let k = 0; k < 3; k++) { const y = sy - 14 - k * 11 * hs, w = (16 - k * 4) * hs; poly([[sx - w, y], [sx + w, y], [sx, y - 18 * hs]], cols[k]); }
    } else {
      const g = v > .8 ? ['#4f6e22', '#66882e', '#7ea03a'] : ['#2f5a24', '#3e7230', '#4f8a3a'];
      const c = (x, y, r, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(sx + x, sy + y, r, 0, 7); ctx.fill(); };
      c(-7 * hs, -22 * hs, 10 * hs, g[0]); c(7 * hs, -23 * hs, 10 * hs, g[0]); c(0, -32 * hs, 12 * hs, g[1]); c(-3 * hs, -35 * hs, 7 * hs, g[2]); c(4 * hs, -25 * hs, 6 * hs, g[2]);
    }
  } else if (r.type === 'gold' || r.type === 'stone') {
    const f = .5 + .5 * r.amount / r.def.amount, base = r.type === 'gold' ? ['#8a6d1a', '#d9b43a', '#f5de7a'] : ['#6d6a64', '#a19d94', '#cfccc4'];
    ctx.fillStyle = '#0003'; ctx.beginPath(); ctx.ellipse(sx, sy + 1, 20 * f, 8 * f, 0, 0, 7); ctx.fill();
    const rocks = [[-8, -2, 9], [7, -1, 8], [0, -6, 10], [-2, 2, 6]];
    for (const [x, y, rr] of rocks) { const R = rr * f; poly([[sx + x - R, sy + y], [sx + x - R * .6, sy + y - R], [sx + x + R * .5, sy + y - R * 1.1], [sx + x + R, sy + y - R * .2], [sx + x + R * .6, sy + y + R * .4]], base[1], base[0]); ctx.fillStyle = base[2]; ctx.fillRect(sx + x - R * .3, sy + y - R * .8, R * .45, R * .3); }
  } else if (r.type === 'berry') {
    ctx.fillStyle = '#0003'; ctx.beginPath(); ctx.ellipse(sx, sy + 1, 14, 6, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#2f6a2a'; for (const [x, y, rr] of [[-6, -6, 8], [6, -6, 8], [0, -11, 9]]) { ctx.beginPath(); ctx.arc(sx + x, sy + y, rr, 0, 7); ctx.fill(); }
    const n = Math.ceil(10 * r.amount / r.def.amount); const rr = mulberry(r.id);
    for (let k = 0; k < n; k++) { ctx.fillStyle = k % 2 ? '#b0204a' : '#6a2a9a'; ctx.beginPath(); ctx.arc(sx - 11 + rr() * 22, sy - 16 + rr() * 13, 2, 0, 7); ctx.fill(); }
  }
}
function drawHuman(u, pc, t) {
  const walk = u.moving ? Math.sin(u.walk * 10) : 0, a = u.atkAnim > 0 ? Math.sin((.35 - u.atkAnim) / .35 * Math.PI) : 0;
  const work = u.working ? Math.sin(t * 8 + u.id) : 0;
  const vil = u.type === 'villager', mil = !vil;
  // legs
  ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(-2, -8); ctx.lineTo(-2 + walk * 3, 0); ctx.moveTo(2, -8); ctx.lineTo(2 - walk * 3, 0); ctx.stroke();
  // body
  const tunic = vil ? '#8a6a3a' : u.type === 'militia' ? '#8b8f96' : u.def.cls === 'arch' ? '#5d6b35' : '#a08a60';
  ctx.fillStyle = tunic; ctx.beginPath(); ctx.roundRect(-4.5, -18, 9, 11, 2); ctx.fill();
  ctx.fillStyle = pc; ctx.fillRect(-4.5, vil ? -11 : -16, 9, vil ? 2.5 : 5);
  // head
  ctx.fillStyle = '#e0b48a'; ctx.beginPath(); ctx.arc(0, -21.5, 3.6, 0, 7); ctx.fill();
  if (mil) { ctx.fillStyle = u.def.cls === 'arch' ? '#4a5a2a' : '#6d7178'; ctx.beginPath(); ctx.arc(0, -22.5, 3.9, Math.PI, 0); ctx.fill(); }
  else { ctx.fillStyle = '#6b4a24'; ctx.fillRect(-4, -25, 8, 2); }
  ctx.lineCap = 'round';
  if (vil) {
    if (u.carry.amt > 0) { ctx.fillStyle = { food: '#c0392b', wood: '#7b5530', gold: '#e6c34a', stone: '#9a968c' }[u.carry.type]; ctx.fillRect(-8, -18, 4, 7); }
    const o = u.order, rt = o.type === 'gather' && o.target ? o.target.type : o.type;
    ctx.save(); ctx.translate(4, -14); ctx.rotate(-.6 + work * .9);
    ctx.strokeStyle = '#5b3a1e'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(8, -4); ctx.stroke();
    if (rt === 'tree') { ctx.fillStyle = '#bbb'; ctx.fillRect(6, -7, 4, 4); }
    else if (rt === 'gold' || rt === 'stone') { ctx.strokeStyle = '#999'; ctx.beginPath(); ctx.moveTo(5, -8); ctx.quadraticCurveTo(10, -6, 11, -1); ctx.stroke(); }
    else if (rt === 'build' || rt === 'repair') { ctx.fillStyle = '#777'; ctx.fillRect(7, -6, 4, 3); }
    ctx.restore();
  } else if (u.def.cls === 'arch') {
    ctx.strokeStyle = '#6b4a24'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(5 - a * 2, -15, 7, -1.2, 1.2); ctx.stroke();
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = .7; ctx.beginPath(); ctx.moveTo(5 - a * 2 + 7 * Math.cos(-1.2), -15 + 7 * Math.sin(-1.2)); ctx.lineTo(1 - a * 3, -15); ctx.lineTo(5 - a * 2 + 7 * Math.cos(1.2), -15 + 7 * Math.sin(1.2)); ctx.stroke();
  } else if (u.type === 'spearman') {
    ctx.strokeStyle = '#6b4a24'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-2 + a * 6, -5); ctx.lineTo(8 + a * 6, -30); ctx.stroke();
    ctx.fillStyle = '#ccc'; poly([[8 + a * 6, -30], [6 + a * 6, -26], [10 + a * 6, -26]], '#ccc');
  } else {
    ctx.fillStyle = pc; ctx.beginPath(); ctx.ellipse(-5, -12, 3.5, 6, 0, 0, 7); ctx.fill(); ctx.strokeStyle = '#222'; ctx.lineWidth = .8; ctx.stroke();
    ctx.save(); ctx.translate(4, -13); ctx.rotate(-1.1 + a * 1.8); ctx.strokeStyle = '#ddd'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -11); ctx.stroke(); ctx.restore();
  }
}
function drawUnit(u, t) {
  const [sx, sy] = iso(u.x, u.y), pc = PCOL[u.owner];
  if (sel.includes(u)) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(sx, sy, u.def.cls === 'cav' || u.def.cls === 'siege' ? 15 : 10, u.def.cls === 'cav' || u.def.cls === 'siege' ? 7 : 5, 0, 0, 7); ctx.stroke(); }
  ctx.fillStyle = '#0004'; ctx.beginPath(); ctx.ellipse(sx, sy, 8, 3.5, 0, 0, 7); ctx.fill();
  if (u.moving) u.walk += 1 / 60;
  ctx.save(); ctx.translate(sx, sy); ctx.scale(u.face * 1.2, 1.2);
  if (u.def.cls === 'cav') {
    const walk = u.moving ? Math.sin(u.walk * 14) : 0, horse = u.type === 'knight' ? '#e8e2d6' : '#7a4a26';
    ctx.strokeStyle = '#3a2412'; ctx.lineWidth = 2.2; ctx.beginPath();
    for (const [lx, ph] of [[-7, 1], [-4, -1], [5, -1], [8, 1]]) { ctx.moveTo(lx, -8); ctx.lineTo(lx + walk * 3 * ph, 0); } ctx.stroke();
    ctx.fillStyle = horse; ctx.beginPath(); ctx.ellipse(0, -10, 11, 4.8, 0, 0, 7); ctx.fill();
    if (u.type === 'knight') { ctx.fillStyle = pc; ctx.fillRect(-9, -11, 16, 5); }
    ctx.fillStyle = horse; ctx.beginPath(); ctx.moveTo(8, -12); ctx.lineTo(14, -20); ctx.lineTo(17, -18); ctx.lineTo(12, -9); ctx.fill();
    ctx.fillStyle = '#2a1a0a'; ctx.fillRect(-12, -12, 3, 7);
    ctx.save(); ctx.translate(0, -9); ctx.scale(.85, .85); drawHuman({ ...u, moving: false, type: u.type === 'knight' ? 'militia' : 'scoutrider', def: { cls: 'inf' } }, pc, t); ctx.restore();
  } else if (u.def.cls === 'siege') {
    ctx.fillStyle = '#6b4a24'; ctx.strokeStyle = '#3a2412';
    if (u.type === 'ram') { poly([[-14, -6], [14, -6], [10, -20], [-10, -20]], '#7b5530', '#3a2412'); poly([[-10, -20], [10, -20], [0, -26]], pc); ctx.fillStyle = '#555'; ctx.fillRect(12 + (u.atkAnim > 0 ? 4 : 0), -12, 6, 5); }
    else { ctx.fillRect(-12, -9, 24, 5); ctx.save(); ctx.translate(-2, -9); ctx.rotate(-.4 - (u.atkAnim > 0 ? 1.1 * Math.sin(u.atkAnim / .35 * Math.PI) : 0)); ctx.fillRect(-1.5, -18, 3, 18); ctx.fillStyle = '#888'; ctx.beginPath(); ctx.arc(0, -18, 3.5, 0, 7); ctx.fill(); ctx.restore(); ctx.fillStyle = pc; ctx.fillRect(6, -14, 5, 5); }
    ctx.fillStyle = '#3a2412'; for (const wx of [-8, 8]) { ctx.beginPath(); ctx.arc(wx, -3, 3.5, 0, 7); ctx.fill(); }
  } else drawHuman(u, pc, t);
  ctx.restore();
  if (sel.includes(u) || gtime - u.hitT < 3) hpBar(sx, sy - (u.def.cls === 'cav' ? 38 : 32), 22, u.hp / u.maxHp);
}
function hpBar(x, y, w, f) { ctx.fillStyle = '#000a'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 5); ctx.fillStyle = f > .5 ? '#4c4' : f > .25 ? '#dc4' : '#d33'; ctx.fillRect(x - w / 2, y, w * Math.max(0, f), 3); }
function drawFx(f) {
  const [sx, sy] = iso(f.x, f.y), k = f.t / f.life;
  if (f.k === 'corpse') { ctx.globalAlpha = 1 - k; ctx.fillStyle = '#5a1a12'; ctx.beginPath(); ctx.ellipse(sx, sy, 7, 3, 0, 0, 7); ctx.fill(); ctx.fillStyle = PCOL[f.owner]; ctx.fillRect(sx - 5, sy - 3, 9, 3); ctx.globalAlpha = 1; }
  else if (f.k === 'stump') { ctx.fillStyle = '#5b3a1e'; ctx.beginPath(); ctx.ellipse(sx, sy - 2, 4, 2.5, 0, 0, 7); ctx.fill(); }
  else if (f.k === 'rubble') { ctx.globalAlpha = Math.min(1, (1 - k) * 3); ctx.fillStyle = '#5a5046'; for (let i = 0; i < 10; i++) { const r = mulberry(i + f.x * 7); ctx.fillRect(sx + (r() - .5) * f.s * 40, sy + (r() - .5) * f.s * 18, 5, 3); } ctx.globalAlpha = 1; }
  else if (f.k === 'dust') { ctx.fillStyle = `rgba(160,140,110,${.6 * (1 - k)})`; ctx.beginPath(); ctx.arc(sx, sy - 6 - k * 14, 5 + k * 12, 0, 7); ctx.fill(); }
  else if (f.k === 'fire') { const h = f.h || 20; ctx.fillStyle = `rgba(255,${120 + (1 - k) * 100},30,${1 - k})`; ctx.beginPath(); ctx.arc(sx, sy - h - k * 16, 4 * (1 - k) + 2, 0, 7); ctx.fill(); ctx.fillStyle = `rgba(60,60,60,${.4 * k})`; ctx.beginPath(); ctx.arc(sx, sy - h - 10 - k * 30, 6 + k * 6, 0, 7); ctx.fill(); }
  else if (f.k === 'click') { ctx.strokeStyle = f.col; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(sx, sy, 14 * (1 - k), 7 * (1 - k), 0, 0, 7); ctx.stroke(); }
}
function drawProj(p) {
  const k = Math.min(1, p.t / p.dur), x = p.sx + (p.tx - p.sx) * k, y = p.sy + (p.ty - p.sy) * k;
  const [sx, sy] = iso(x, y), arc = Math.sin(k * Math.PI) * (p.kind === 'rock' ? 40 : 18) + p.h * (1 - k) + 6 * k;
  if (p.kind === 'rock') { ctx.fillStyle = '#555'; ctx.beginPath(); ctx.arc(sx, sy - arc, 3.5, 0, 7); ctx.fill(); return; }
  const k2 = Math.min(1, k + .05), x2 = p.sx + (p.tx - p.sx) * k2, y2 = p.sy + (p.ty - p.sy) * k2, [sx2, sy2] = iso(x2, y2), arc2 = Math.sin(k2 * Math.PI) * 18 + p.h * (1 - k2) + 6 * k2;
  const ang = Math.atan2((sy2 - arc2) - (sy - arc), sx2 - sx);
  ctx.strokeStyle = '#2a1a0a'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(sx - Math.cos(ang) * 6, sy - arc - Math.sin(ang) * 6); ctx.lineTo(sx + Math.cos(ang) * 4, sy - arc + Math.sin(ang) * 4); ctx.stroke();
}
function isVisibleEnt(e) {
  if (e.owner === 0) return true;
  if (e.kind === 'unit') return vis[I(e.x | 0, e.y | 0)] === 2;
  if (e.kind === 'bld') return vis[I(e.x | 0, e.y | 0)] > 0 || vis[I(e.bx, e.by)] > 0;
  return vis[I(e.tx, e.ty)] > 0;
}
let now = 0;
function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  // terrain
  const wt = Math.floor(now * 1.2) % 2;
  const t0 = toTile(0, 0), t1 = toTile(W, 0), t2 = toTile(0, H), t3 = toTile(W, H);
  const minx = Math.max(0, Math.floor(Math.min(t0[0], t2[0])) - 1), maxx = Math.min(N - 1, Math.ceil(Math.max(t1[0], t3[0])) + 1);
  const miny = Math.max(0, Math.floor(Math.min(t0[1], t1[1])) - 1), maxy = Math.min(N - 1, Math.ceil(Math.max(t2[1], t3[1])) + 1);
  for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
    const i = I(x, y); if (!vis[i]) continue;
    const [sx, sy] = iso(x, y); if (sx < -TW || sx > W + TW || sy < -TH || sy > H + TH) continue;
    const tt = terrain[i], set = TILES[tt]; const img = tt === 2 ? set[(wt + x + y) % 2] : set[(x * 7 + y * 13) % set.length];
    ctx.drawImage(img, sx - HW - 1, sy - 1);
  }
  // ghost placement
  const list = [];
  for (const e of ents) {
    if (e.dead || !isVisibleEnt(e)) continue;
    const [sx, sy] = iso(e.x, e.y); if (sx < -140 || sx > W + 140 || sy < -40 || sy > H + 160) continue;
    if (e.kind === 'bld' && e.type === 'farm') { drawFarm(e); if (sel.includes(e)) selDiamond(e); continue; }
    list.push(e);
  }
  for (const f of fx) if (f.k === 'rubble' || f.k === 'stump' || f.k === 'corpse' || f.k === 'click') { if (vis[I(Math.min(N - 1, f.x | 0), Math.min(N - 1, f.y | 0))]) drawFx(f); }
  if (placing) drawGhost();
  list.sort((a, b) => (a.kind === 'bld' ? a.bx + a.by + 2 * a.s - 1 : a.x + a.y) - (b.kind === 'bld' ? b.bx + b.by + 2 * b.s - 1 : b.x + b.y));
  for (const e of list) {
    if (e.kind === 'res') drawRes(e);
    else if (e.kind === 'bld') { if (sel.includes(e)) selDiamond(e); drawBld(e); if (sel.includes(e) || gtime - e.hitT < 3) { const [sx, sy] = iso(e.x, e.y); hpBar(sx, sy - e.s * 16 - 40, 40, e.hp / e.maxHp); } }
    else drawUnit(e, now);
  }
  for (const f of fx) if (f.k === 'dust' || f.k === 'fire') drawFx(f);
  for (const p of projs) drawProj(p);
  // fog
  ctx.fillStyle = 'rgba(0,0,0,.42)'; ctx.beginPath();
  for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) { if (vis[I(x, y)] !== 1) continue; const [sx, sy] = iso(x, y); ctx.moveTo(sx, sy - .5); ctx.lineTo(sx + HW + .5, sy + HH); ctx.lineTo(sx, sy + TH + .5); ctx.lineTo(sx - HW - .5, sy + HH); }
  ctx.fill();
  ctx.fillStyle = '#000'; ctx.beginPath();
  for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) { if (vis[I(x, y)]) continue; const [sx, sy] = iso(x, y); ctx.moveTo(sx, sy - 1); ctx.lineTo(sx + HW + 1, sy + HH); ctx.lineTo(sx, sy + TH + 1); ctx.lineTo(sx - HW - 1, sy + HH); }
  ctx.fill();
  // rally point
  const sb = sel.length === 1 && sel[0].kind === 'bld' && sel[0].owner === 0 && sel[0].rally ? sel[0] : null;
  if (sb) { const [rx, ry] = iso(sb.rally.x, sb.rally.y); flag(rx, ry, PCOL[0], 20); }
  // drag box
  if (drag && drag.active) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]); ctx.strokeRect(drag.x0, drag.y0, mouse.x - drag.x0, mouse.y - drag.y0); ctx.setLineDash([]); ctx.fillStyle = '#ffffff12'; ctx.fillRect(drag.x0, drag.y0, mouse.x - drag.x0, mouse.y - drag.y0); }
}
function selDiamond(b) { poly([iso(b.bx, b.by), iso(b.bx + b.s, b.by), iso(b.bx + b.s, b.by + b.s), iso(b.bx, b.by + b.s)], null, '#fff'); }
function drawGhost() {
  const [tx, ty] = toTile(mouse.x, mouse.y), s = BLD[placing].s, bx = Math.round(tx - s / 2), by = Math.round(ty - s / 2);
  const ok = canPlace(placing, bx, by, 0, 0) && afford(P[0], BLD[placing].cost);
  poly([iso(bx, by), iso(bx + s, by), iso(bx + s, by + s), iso(bx, by + s)], ok ? 'rgba(80,220,80,.35)' : 'rgba(230,60,60,.4)', ok ? '#8f8' : '#f88');
  ctx.globalAlpha = .6; drawBld({ type: placing, def: BLD[placing], s, bx, by, x: bx + s / 2, y: by + s / 2, done: true, progress: 1, owner: 0, amount: BLD.farm.food }); ctx.globalAlpha = 1;
}

// ---------------- minimap ----------------
const MW = 232, MH = 116, MK = MW / (2 * N);
const mtoPx = (x, y) => [(x - y) * MK + MW / 2, (x + y) * MK / 2];
let mterrain = null;
function buildMiniTerrain() {
  mterrain = document.createElement('canvas'); mterrain.width = MW; mterrain.height = MH; const g = mterrain.getContext('2d');
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const [px, py] = mtoPx(x, y); g.fillStyle = ['#4f7a2d', '#8a6f42', '#2e6a9c'][terrain[I(x, y)]]; g.fillRect(px - MK, py, MK * 2 + .5, MK + .5); }
}
function renderMini() {
  mctx.fillStyle = '#000'; mctx.fillRect(0, 0, MW, MH); mctx.drawImage(mterrain, 0, 0);
  for (const e of ents) {
    if (e.dead || !isVisibleEnt(e)) continue;
    const [px, py] = mtoPx(e.x, e.y);
    if (e.kind === 'res') { mctx.fillStyle = { tree: '#1f4a1f', gold: '#f0d040', stone: '#bbb', berry: '#c05080' }[e.type]; mctx.fillRect(px - 1, py - .5, 2, 1.5); }
    else if (e.kind === 'bld') { mctx.fillStyle = PCOL[e.owner]; const s = e.s * MK * 1.2; mctx.fillRect(px - s, py - s / 2, s * 2, s); }
    else { mctx.fillStyle = e.owner === 0 ? '#7fb0ff' : '#ff6a5a'; mctx.fillRect(px - 1.2, py - 1.2, 2.4, 2.4); }
  }
  mctx.fillStyle = '#000';
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const v = vis[I(x, y)]; if (v === 2) continue; mctx.globalAlpha = v ? .4 : 1; const [px, py] = mtoPx(x, y); mctx.fillRect(px - MK, py, MK * 2 + .5, MK + .5); }
  mctx.globalAlpha = 1;
  if (alertAt && gtime - alertAt.t < 4) { const [px, py] = mtoPx(alertAt.x, alertAt.y); mctx.strokeStyle = '#f33'; mctx.lineWidth = 2; mctx.beginPath(); mctx.arc(px, py, 4 + ((gtime - alertAt.t) * 10) % 10, 0, 7); mctx.stroke(); }
  const c = [toTile(0, 38), toTile(W, 38), toTile(W, H - 150), toTile(0, H - 150)].map(([x, y]) => mtoPx(x, y));
  mctx.strokeStyle = '#fff'; mctx.lineWidth = 1; mctx.beginPath(); c.forEach((p, i) => i ? mctx.lineTo(p[0], p[1]) : mctx.moveTo(p[0], p[1])); mctx.closePath(); mctx.stroke();
}

// ================= INPUT =================
const mouse = { x: 0, y: 0, in: false };
let drag = null, placing = null, lastClick = { t: 0, id: 0 };
const keys = {};
cv.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; if (drag && Math.hypot(mouse.x - drag.x0, mouse.y - drag.y0) > 5) drag.active = true; });
cv.addEventListener('mousedown', e => {
  if (!AC) try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { }
  if (over || paused && !started) return;
  if (e.button === 0) {
    if (placing) { tryPlace(e.shiftKey); return; }
    drag = { x0: e.clientX, y0: e.clientY, active: false, shift: e.shiftKey };
  } else if (e.button === 2) { if (placing) { placing = null; return; } rightClick(e.clientX, e.clientY); }
});
addEventListener('mouseup', e => {
  if (e.button !== 0 || !drag) return;
  const d = drag; drag = null;
  if (d.active) {
    const x0 = Math.min(d.x0, mouse.x), x1 = Math.max(d.x0, mouse.x), y0 = Math.min(d.y0, mouse.y), y1 = Math.max(d.y0, mouse.y);
    let picked = ents.filter(u => u.kind === 'unit' && u.owner === 0 && !u.dead && (() => { const [sx, sy] = iso(u.x, u.y); return sx >= x0 && sx <= x1 && sy - 10 >= y0 - 10 && sy - 10 <= y1; })());
    if (picked.length) { sel = d.shift ? [...new Set([...sel, ...picked])] : picked; sfx(900, .03, 'square', .02); updateUI(); }
  } else {
    const e2 = pick(mouse.x, mouse.y);
    if (!e2) { if (!d.shift) sel = []; return; }
    const dbl = performance.now() - lastClick.t < 350 && lastClick.id === e2.id; lastClick = { t: performance.now(), id: e2.id };
    if (dbl && e2.owner === 0) { sel = ents.filter(u => u.type === e2.type && u.owner === 0 && !u.dead && (() => { const [sx, sy] = iso(u.x, u.y); return sx > 0 && sx < W && sy > 0 && sy < H; })()); }
    else if (d.shift && e2.owner === 0 && sel.every(s => s.owner === 0)) { sel = sel.includes(e2) ? sel.filter(s => s !== e2) : [...sel, e2]; }
    else sel = [e2];
    updateUI();
    sfx(900, .03, 'square', .02);
  }
});
function pick(sx, sy) {
  let best = null, bd = 16;
  for (const u of ents) { if (u.dead || u.kind !== 'unit' || !isVisibleEnt(u)) continue; const [ux, uy] = iso(u.x, u.y); const d = Math.hypot(sx - ux, (sy - (uy - 12)) * .8); if (d < bd) { bd = d; best = u; } }
  if (best) return best;
  // tall buildings: screen-space box test, frontmost first
  let bb = null, bk = -1;
  for (const b of ents) {
    if (b.dead || b.kind !== 'bld' || !isVisibleEnt(b)) continue;
    const L = iso(b.bx, b.by + b.s), R = iso(b.bx + b.s, b.by), T = iso(b.bx, b.by), Bm = iso(b.bx + b.s, b.by + b.s);
    const h = b.type === 'farm' ? 0 : b.s * 14 + 20;
    if (sx >= L[0] + 4 && sx <= R[0] - 4 && sy >= T[1] - h && sy <= Bm[1]) { const [tx, ty] = toTile(sx, sy); const inside = tx >= b.bx && tx < b.bx + b.s && ty >= b.by && ty < b.by + b.s; const k = b.bx + b.by + (inside ? 1000 : 0) - (b.type === 'farm' ? 500 : 0); if (k > bk) { bk = k; bb = b; } }
  }
  if (bb) return bb;
  const [tx, ty] = toTile(sx, sy); const i = tx | 0, j = ty | 0; if (!inMap(i, j) || !vis[I(i, j)]) return null;
  const e = byId.get(block[I(i, j)]); if (e && e.kind === 'res') return e;
  for (const [di, dj] of [[0, 1], [1, 0], [1, 1]]) { const e2 = inMap(i + di, j + dj) && byId.get(block[I(i + di, j + dj)]); if (e2 && e2.kind === 'res' && e2.type === 'tree') return e2; }
  return null;
}
function rightClick(sx, sy) {
  const mine = sel.filter(e => e.owner === 0 && !e.dead);
  if (!mine.length) return;
  const t = pick(sx, sy), [tx, ty] = toTile(sx, sy);
  const units = mine.filter(e => e.kind === 'unit');
  if (!units.length) {
    for (const b of mine) if (b.kind === 'bld' && b.def.trains) b.rally = { x: t ? t.x : tx, y: t ? t.y : ty, ent: t };
    fx.push({ k: 'click', x: tx, y: ty, t: 0, life: .5, col: '#ffd77a' }); return;
  }
  if (t && (t.owner !== 0 || t.kind === 'res' || (t.kind === 'bld' && units.some(u => u.type === 'villager')))) {
    const enemy = t.owner > 0 && isVisibleEnt(t);
    for (const u of units) { if (t.kind === 'res' && u.type !== 'villager') { orderMove([u], t.x, t.y); continue; } orderUnit(u, t); }
    fx.push({ k: 'click', x: t.x, y: t.y, t: 0, life: .5, col: enemy ? '#f44' : '#ff4' });
    sfx(enemy ? 300 : 600, .05, 'square', .03);
  } else {
    orderMove(units, tx, ty); fx.push({ k: 'click', x: tx, y: ty, t: 0, life: .5, col: '#4f4' }); sfx(600, .05, 'square', .03);
  }
}
function startPlace(type) { if (!afford(P[0], BLD[type].cost)) { msg('Not enough resources.', '#ff8a7a'); return; } placing = type; }
function tryPlace(keep) {
  const [tx, ty] = toTile(mouse.x, mouse.y), s = BLD[placing].s, bx = Math.round(tx - s / 2), by = Math.round(ty - s / 2);
  if (!afford(P[0], BLD[placing].cost)) { msg('Not enough resources.', '#ff8a7a'); placing = null; return; }
  if (!canPlace(placing, bx, by, 0, 0)) { sfx(150, .12, 'square', .04); return; }
  pay(P[0], BLD[placing].cost);
  const b = mkBld(placing, 0, bx, by, false);
  const vs = sel.filter(u => u.type === 'villager' && u.owner === 0);
  for (const u of vs) { if (u.order.type === 'gather') u.after = u.order; u.order = { type: 'build', target: b }; u.path = null; }
  sfx(330, .1, 'triangle', .05);
  if (!keep) placing = null;
}
addEventListener('keydown', e => {
  if (!started) return;
  keys[e.key] = true;
  const k = e.key.toLowerCase();
  if (e.key === 'Escape') { placing = null; sel = []; }
  if (over) return;
  if (k === 'p') togglePause();
  if (/^[1-9]$/.test(e.key)) { if (e.ctrlKey || e.metaKey) { groups[e.key] = sel.filter(s => s.owner === 0); msg(`Group ${e.key} set.`); e.preventDefault(); } else if (groups[e.key]) { const g = groups[e.key].filter(alive); if (g.length) { if (sel.length === g.length && sel.every(s => g.includes(s))) centerOn(g[0].x, g[0].y); sel = g; } } }
  if (k === 'h') { const tc = ents.find(b => b.type === 'towncenter' && b.owner === 0 && !b.dead); if (tc) { sel = [tc]; centerOn(tc.x, tc.y); } }
  if (e.key === '.') selectIdle();
  if (e.key === 'Delete' || e.key === 'Backspace') { for (const s of sel) if (s.owner === 0) kill(s); sel = []; }
  const hk = 'qwertasdfgzxcvb'.indexOf(k);
  if (hk >= 0 && !e.ctrlKey && !e.metaKey) { cmdList = getCmds(); const c = cmdList[hk]; if (c && c.enabled) { c.fn(); updateUI(); } else if (c && c.reason) msg(c.reason, '#ff8a7a'); }
});
addEventListener('keyup', e => { keys[e.key] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
document.addEventListener('mouseleave', () => mouse.in = false);
document.addEventListener('mouseenter', () => mouse.in = true);
let idleIdx = 0;
function selectIdle() { const idle = ents.filter(u => u.type === 'villager' && u.owner === 0 && !u.dead && u.order.type === 'idle'); if (!idle.length) return; const u = idle[idleIdx++ % idle.length]; sel = [u]; centerOn(u.x, u.y); }
function miniJump(e) { const r = mini.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top; const X = (mx - MW / 2) / MK, Y = my * 2 / MK; const x = (X + Y) / 2, y = (Y - X) / 2; if (e.button === 2 && sel.some(s => s.owner === 0 && s.kind === 'unit')) { orderMove(sel.filter(s => s.owner === 0 && s.kind === 'unit'), x, y); return; } centerOn(x, y); }
let miniDrag = false;
mini.addEventListener('mousedown', e => { miniJump(e); if (e.button === 0) miniDrag = true; });
addEventListener('mouseup', () => miniDrag = false);
mini.addEventListener('mousemove', e => { if (miniDrag) miniJump(e); });
mini.addEventListener('contextmenu', e => e.preventDefault());
function togglePause() { if (over) return; paused = !paused; document.getElementById('pauseBtn').textContent = paused ? '▶' : '⏸'; if (paused) msg('Game paused (P to resume)'); }
document.getElementById('pauseBtn').onclick = togglePause;
document.getElementById('speedBtn').onclick = e => { speed = speed === 1 ? 1.5 : speed === 1.5 ? 2 : speed === 2 ? 3 : 1; e.target.textContent = speed + '×'; };
document.getElementById('idleBtn').onclick = selectIdle;
document.getElementById('helpBtn').onclick = () => msg('Right-click to command. Villagers build via the command grid (QWERT…). H = Town Center, . = idle villager, Ctrl+# = groups.', '#ffd77a');

// ================= UI =================
const $ = id => document.getElementById(id);
const cmdEl = $('cmds'), infoEl = $('info'), tipEl = $('tip');
const btns = [];
let cmdList = [];
const HOT = 'QWERTASDFGZXCVB';
for (let k = 0; k < 15; k++) {
  const b = document.createElement('button'); b.className = 'empty'; cmdEl.appendChild(b); btns.push(b);
  b.onclick = () => { const c = cmdList[k]; if (!c) return; if (c.enabled) { c.fn(); sfx(800, .03, 'square', .02); updateUI(true); } else if (c.reason) msg(c.reason, '#ff8a7a'); };
  b.onmouseenter = () => { b.hover = true; showTip(k); }; b.onmouseleave = () => { b.hover = false; tipEl.style.display = 'none'; };
}
function showTip(k) {
  const c = cmdList[k]; if (!c) { tipEl.style.display = 'none'; return; }
  tipEl.innerHTML = `<b>${c.name}</b> <span style="opacity:.6">(${HOT[k]})</span>${c.cost ? '<br>' + costStr(c.cost) : ''}${c.desc ? '<br>' + c.desc : ''}${c.reason ? `<br><span class="bad">${c.reason}</span>` : ''}`;
  const r = btns[k].getBoundingClientRect(); tipEl.style.display = 'block'; tipEl.style.left = Math.min(innerWidth - 290, r.left - 100) + 'px'; tipEl.style.top = (r.top - tipEl.offsetHeight - 8) + 'px';
}
function reqReason(p, age, cost) { if (p.age < age) return 'Requires ' + AGES[age]; if (cost && !afford(p, cost)) return 'Not enough resources'; return ''; }
function getCmds() {
  const p = P[0], own = sel.filter(e => e.owner === 0 && !e.dead);
  if (!own.length) return [];
  if (own.some(e => e.type === 'villager')) return BUILD_LIST.map(t => { const d = BLD[t], r = reqReason(p, d.age, d.cost); return { icon: d.icon, name: 'Build ' + d.name, cost: d.cost, desc: d.desc, enabled: !r, reason: r, fn: () => startPlace(t) }; });
  const units = own.filter(e => e.kind === 'unit');
  if (units.length) return [{ icon: '✋', name: 'Stop', enabled: true, fn: () => units.forEach(u => { u.order = { type: 'idle' }; u.path = null; }) }, null, null, null, { icon: '💀', name: 'Delete unit', enabled: true, fn: () => { units.forEach(u => kill(u)); sel = []; } }];
  const b = own[0]; if (b.kind !== 'bld') return [];
  if (!b.done) return [null, null, null, null, { icon: '❌', name: 'Cancel construction', enabled: true, fn: () => { refund(p, b.def.cost); kill(b); sel = []; } }];
  const out = [];
  for (const t of b.def.trains || []) { const d = UNITS[t], r = reqReason(p, d.age, d.cost) || (b.queue.length >= 5 ? 'Queue full' : ''); out.push({ icon: d.icon, name: 'Train ' + (p.names[t] || d.name), cost: d.cost, desc: d.desc, enabled: !r, reason: r, fn: () => queueItem(b, 'unit', t) }); }
  for (const t of b.def.techs || []) {
    const d = TECH[t]; if (p.techs.has(t) || p.researching.has(t)) continue;
    if (d.isAge && d.isAge !== p.age + 1) continue;
    if (d.req && !p.techs.has(d.req) && !p.researching.has(d.req)) continue;
    let r = reqReason(p, d.age, d.cost); if (d.req && !p.techs.has(d.req)) r = 'Requires ' + TECH[d.req].name; if (d.isAge && [...p.researching].some(x => TECH[x].isAge)) r = 'Already advancing';
    out.push({ icon: d.icon, name: 'Research ' + d.name, cost: d.cost, desc: d.desc, enabled: !r, reason: r, fn: () => queueItem(b, 'tech', t) });
  }
  while (out.length < 14) out.push(null);
  out[14] = { icon: '💥', name: 'Delete building', enabled: true, fn: () => { kill(b); sel = []; } };
  return out;
}
let lastInfoSig = '';
function updateUI(force) {
  const p = P[0];
  for (const r of RES) $('r-' + r).textContent = Math.floor(p.res[r]);
  $('r-pop').textContent = `${p.pop}/${p.cap}`; $('r-pop').style.color = p.pop >= p.cap ? '#ff8a7a' : '';
  $('r-idle').textContent = ents.filter(u => u.type === 'villager' && u.owner === 0 && !u.dead && u.order.type === 'idle').length;
  $('age').textContent = AGES[p.age]; $('clock').textContent = fmtTime(gtime);
  $('enemyAge').textContent = 'Enemy: ' + AGES[P[1].age];
  cmdList = getCmds();
  btns.forEach((b, k) => { const c = cmdList[k]; if (!c) { b.className = 'empty'; b.innerHTML = ''; return; } b.className = c.enabled ? '' : 'off'; const h = c.icon + `<span>${HOT[k]}</span>`; if (b.innerHTML !== h) b.innerHTML = h; if (b.hover) showTip(k); });
  // info panel
  const s = sel.filter(alive);
  let html = '';
  if (s.length === 1) {
    const e = s[0], own = e.owner === 0;
    const col = e.owner >= 0 ? PCOL[e.owner] : '#a4834e';
    html += `<div class="portrait" style="border-color:${col}">${e.def.icon}</div><div>`;
    html += `<h3>${nameOf(e)}${e.owner === 1 ? ' <span style="color:#ff9d8d;font-size:13px">(Enemy)</span>' : ''}</h3>`;
    if (e.kind === 'res') html += `<div class="stats">${RICON[e.def.rt]} ${Math.ceil(e.amount)} ${e.def.rt} remaining</div>`;
    else {
      html += `<div class="hpbar"><i style="width:${100 * e.hp / e.maxHp}%"></i></div><div class="stats">HP ${Math.ceil(e.hp)}/${e.maxHp}`;
      if (e.kind === 'unit') {
        html += ` &nbsp; ⚔️ ${st(e, 'atk')} &nbsp; 🛡️ ${st(e, 'armor')}/${st(e, 'parmor')}${st(e, 'range') ? ' &nbsp; 🎯 ' + st(e, 'range') : ''}`;
        if (e.type === 'villager' && e.carry.amt >= 1) html += `<br>Carrying ${RICON[e.carry.type]} ${Math.floor(e.carry.amt)}`;
        if (e.type === 'villager') html += `<br><span style="opacity:.7">${{ idle: 'Idle', gather: 'Gathering', build: 'Building', repair: 'Repairing', move: 'Moving', attack: 'Attacking' }[e.order.type] || ''}</span>`;
      } else {
        if (!e.done) html += `<br>Under construction: ${Math.floor(e.progress * 100)}%`;
        if (e.type === 'farm' && e.done) html += `<br>🍖 ${Math.ceil(e.amount)} food left`;
        if (e.def.atk) html += ` &nbsp; ⚔️ ${st(e, 'atk')} × ${e.def.arrows}`;
        if (e.def.pop) html += ` &nbsp; 👥 +${e.def.pop}`;
        if (own && e.queue.length) {
          html += `<div class="queue">` + e.queue.map((q, k) => `<div class="qi" data-q="${k}" title="Click to cancel">${q.icon}${k === 0 ? `<i style="width:${100 * q.t / q.total}%"></i>` : ''}</div>`).join('') + `</div>`;
          if (e.popBlocked) html += `<div style="color:#ff8a7a">Need more houses!</div>`;
        }
      }
      html += '</div>';
    }
    html += '</div>';
  } else if (s.length > 1) {
    html += `<div class="multi">` + s.slice(0, 60).map(e => `<div class="mi" data-id="${e.id}" title="${nameOf(e)}">${e.def.icon}<i style="width:${31 * e.hp / e.maxHp}px"></i></div>`).join('') + `</div>`;
  }
  if (html !== lastInfoSig) { infoEl.innerHTML = html; lastInfoSig = html; }
}
infoEl.addEventListener('click', e => {
  const q = e.target.closest('.qi'); if (q && sel[0]) { cancelItem(sel[0], +q.dataset.q); updateUI(); return; }
  const m = e.target.closest('.mi'); if (m) { const u = byId.get(+m.dataset.id); if (u) sel = [u]; }
});
function msg(t, col) {
  const el = document.createElement('div'); el.textContent = t; if (col) el.style.color = col; $('msgs').appendChild(el);
  setTimeout(() => el.style.opacity = 0, 5000); setTimeout(() => el.remove(), 5700);
  while ($('msgs').children.length > 5) $('msgs').firstChild.remove();
}

// ================= MAIN LOOP =================
let started = false, last = performance.now();
function frame(ts) {
  const rdt = Math.min(.1, (ts - last) / 1000); last = ts; now += rdt;
  if (started) {
    // camera scroll
    const sp = 900 * rdt; let dx = 0, dy = 0;
    if (keys.ArrowLeft) dx -= sp; if (keys.ArrowRight) dx += sp; if (keys.ArrowUp) dy -= sp; if (keys.ArrowDown) dy += sp;
    if (mouse.in && !over) { if (mouse.x < 6) dx -= sp; if (mouse.x > W - 6) dx += sp; if (mouse.y < 4) dy -= sp; if (mouse.y > H - 4) dy += sp; }
    if (dx || dy) { cam.x += dx; cam.y += dy; clampCam(); }
    if (!paused && !over) { let t = rdt * speed; while (t > 0) { const d = Math.min(.05, t); step(d); t -= d; } }
    render();
    if ((uiT -= rdt) <= 0) { uiT = .2; updateUI(); renderMini(); }
    // cursor
    if (!placing) { const h = sel.some(s => s.owner === 0 && s.kind === 'unit') ? pick(mouse.x, mouse.y) : null; cv.style.cursor = h ? (h.owner === 1 ? 'crosshair' : h.kind === 'res' ? 'cell' : 'pointer') : 'default'; } else cv.style.cursor = 'copy';
  }
  requestAnimationFrame(frame);
}
function startGame() {
  genMap(); buildMiniTerrain(); computeVis();
  const tc = ents.find(e => e.type === 'towncenter' && e.owner === 0); centerOn(tc.x + 2, tc.y + 2);
  sel = [tc]; started = true; paused = false; mouse.in = true;
  document.getElementById('menu').classList.add('hidden');
  msg('Welcome, my liege. Build houses, gather resources and advance through the ages!', '#ffd77a');
  msg('Tip: select villagers and use the grid (bottom-right) to build. Right-click to gather.', '#dccca0');
}
document.querySelectorAll('.diff button').forEach(b => b.onclick = () => { document.querySelectorAll('.diff button').forEach(x => x.classList.remove('on')); b.classList.add('on'); diff = +b.dataset.d; });
document.getElementById('startBtn').onclick = () => { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { } startGame(); };
requestAnimationFrame(frame);
// test hook
window.__game = { get ents() { return ents; }, iso, setSel(a) { sel = a; }, centerOn, mkUnit, mkBld, kill, get P() { return P; }, step, get gtime() { return gtime; }, set speed(v) { speed = v; }, AI, vis };
