// ===== World simulation: entities, orders, combat, economy =====
'use strict';
let W = null;
const ent = id => W && W.ents.get(id);
const UNIT_R = u => { const d = UNITS[u.type]; if (d.naval) return u.type === 'transport' || u.type === 'galleon' ? 0.8 : 0.65; if (d.tags.includes('siege')) return 0.45; if (d.tags.includes('mounted') || u.type === 'cobra') return 0.35; return 0.25; };
const hasTag = (type, tag) => UNITS[type] && UNITS[type].tags.includes(tag);
const bsize = e => BUILDINGS[e.type].size;

function center(e) {
  if (e.kind === 'bld') { const s = bsize(e); return { x: e.x + s / 2, y: e.y + s / 2 }; }
  if (e.kind === 'res' || e.kind === 'relic') return { x: e.x + 0.5, y: e.y + 0.5 };
  return { x: e.x, y: e.y };
}
function rectOf(e) {
  if (e.kind === 'bld') { const s = bsize(e); return { x0: e.x, y0: e.y, x1: e.x + s - 1, y1: e.y + s - 1 }; }
  if (e.kind === 'res' || e.kind === 'relic') return { x0: e.x, y0: e.y, x1: e.x, y1: e.y };
  return { x0: e.x | 0, y0: e.y | 0, x1: e.x | 0, y1: e.y | 0 };
}
function distTo(u, e) {
  if (e.kind === 'unit') return Math.max(0, Math.hypot(u.x - e.x, u.y - e.y) - UNIT_R(e));
  const r = rectOf(e);
  const dx = Math.max(r.x0 - u.x, 0, u.x - (r.x1 + 1)), dy = Math.max(r.y0 - u.y, 0, u.y - (r.y1 + 1));
  return Math.hypot(dx, dy);
}
function stance(a, b) { if (a === b) return 'ally'; if (!a || !b) return 'gaia'; return W.players[a].stance[b]; }
function isEnemy(a, b) { return a > 0 && b > 0 && a !== b && W.players[a].stance[b] === 'enemy'; }
function isFriend(a, b) { return a === b || (a > 0 && b > 0 && W.players[a].stance[b] === 'ally' && W.players[b].stance[a] === 'ally'); }

class Player {
  constructor(id, o) {
    Object.assign(this, { id, name: o.name, civ: o.civ, color: o.color, human: !!o.human, team: o.team || 0 });
    this.res = { food: 200, wood: 200, gold: 100, stone: 200 };
    this.age = 0; this.techs = new Set(); this.researching = new Set();
    this.up = {}; this.carry = 10; this.gather = { food: 1, wood: 1, gold: 1, stone: 1, farm: 1, fish: 1 };
    this.farmFood = 175; this.bldLos = 0; this.bldAtk = 0; this.bldRange = 0; this.bldHp = 1; this.bldArmor = 0; this.towerLvl = 0;
    this.ballistics = false; this.monkRecharge = 1; this.sharedVision = false; this.tributeFee = 0.25; this.transportCap = 0;
    this.pop = 0; this.popCap = 0; this.alive = true; this.stance = []; this.bell = false;
    this.stats = { kills: 0, lost: 0, gathered: 0, built: 0, tributeSent: 0, relicGold: 0, tradeGold: 0 };
    this.buildSpeed = 1; this.tradeMul = 1; this.costMul = {}; this.techMul = 1;
    this.explored = null; this.visible = null;
    this.startX = 0; this.startY = 0;
  }
}

// ---------- world creation ----------
function createWorld(spec, settings) {
  const n = spec.n, map = new GameMap(n);
  map.ter.set(spec.ter); map.elev.set(spec.elev);
  const rng = mulberry32(settings.seed >>> 0 || 1);
  for (let i = 0; i < n * n; i++) map.deco[i] = (rng() * 256) | 0;
  map.computeVH(); map.computeRegions();
  W = { map, n, players: [null], ents: new Map(), list: [], nextId: 1, t: 0, projs: [], fx: [], decals: [], settings, rng, instant: false, msgs: [], grid: new Map(), cheatsUsed: 0, over: false, market: { food: 100, wood: 100, stone: 130 }, spec, tick: 0, alerts: [], humanId: 1 };
  W.instantFor = p => !!(W.instant && p && p.id === W.humanId);
  // players
  settings.players.forEach((po, i) => {
    const p = new Player(i + 1, po);
    p.explored = new Uint8Array(n * n); p.visible = new Uint8Array(n * n);
    W.players.push(p);
  });
  const np = W.players.length - 1;
  for (let a = 1; a <= np; a++) for (let b = 1; b <= np; b++) {
    const pa = W.players[a], pb = W.players[b];
    pa.stance[b] = a === b ? 'ally' : (pa.team && pa.team === pb.team ? 'ally' : 'enemy');
  }
  // civ bonuses
  for (let i = 1; i <= np; i++) applyCivBonus(W.players[i]);
  // objects
  for (const o of spec.objects) spawnFromSpec(o);
  // start positions
  for (let i = 1; i <= np; i++) {
    const p = W.players[i], sp = spec.players[i - 1];
    const tc = W.list.find(e => e.kind === 'bld' && e.owner === i && e.type === 'tc');
    if (tc) { p.startX = tc.x + 2; p.startY = tc.y + 2; }
    else if (sp && sp.start) { p.startX = sp.start.x; p.startY = sp.start.y; }
    // Custom start without TC: give a TC foundation-less start (spawn TC)
    if (!tc && sp && sp.start) {
      const b = spawnBuilding('tc', i, Math.max(0, sp.start.x - 2), Math.max(0, sp.start.y - 2), true);
      if (b) { p.startX = b.x + 2; p.startY = b.y + 2; }
      for (let k = 0; k < 3; k++) spawnUnit('villager', i, p.startX - 1 + k, p.startY + 3);
    }
  }
  // starting settings
  const sr = { standard: { food: 200, wood: 200, gold: 100, stone: 200 }, medium: { food: 500, wood: 500, gold: 300, stone: 300 }, high: { food: 1000, wood: 1000, gold: 1000, stone: 1000 } }[settings.startRes] || { food: 200, wood: 200, gold: 100, stone: 200 };
  for (let i = 1; i <= np; i++) {
    const p = W.players[i];
    p.res = Object.assign({}, sr);
    if (p.civ === 'chinese') { p.res.food = Math.max(0, p.res.food - 150); for (let k = 0; k < 3; k++) spawnUnit('villager', i, p.startX + 3, p.startY - 1 + k); }
    if (p.civ === 'spanish') spawnUnit('villager', i, p.startX - 3, p.startY);
    const age = settings.startAge | 0;
    for (let a = 1; a <= age; a++) { p.techs.add(['', 'feudal', 'castleage', 'imperial'][a]); p.age = a; }
    if (settings.difficulty === 'hardest' && !p.human) { for (const r of RES) p.res[r] += 200; }
  }
  // fog
  const human = W.players[1];
  if (settings.fog === 'explored') human.explored.fill(1);
  recalcPop();
  updateVisibility(true);
  return W;
}
function applyCivBonus(p) {
  switch (p.civ) {
    case 'franks': addUp(p, 'cavalry', { hpPct: 0.2 }); p.costMul.castle = 0.75; break;
    case 'teutons': addUp(p, 'infantry', { ma: 1 }); p.costMul.farm = 0.6; p.garrisonMul = 2; break;
    case 'spanish': p.buildSpeed = 1.3; p.tradeMul = 1.25; break;
    case 'italians': p.ageMul = 0.85; p.costMul.fishingship = 0.85; p.dockTechMul = 0.67; break;
    case 'japanese': addUp(p, 'infantry', { rofMul: -0.25 }); addUp(p, 'fishingship', { hpPct: 1, pa: 2 }); p.costMul.lumbercamp = p.costMul.miningcamp = p.costMul.mill = 0.5; break;
    case 'chinese': p.techMul = 0.9; p.tcPop = 10; break;
    case 'byzantines': p.costMul.spearman = p.costMul.pikeman = p.costMul.skirmisher = p.costMul.eskirm = 0.75; p.bldHp = 1.2; p.impMul = 0.67; break;
    case 'vikings': addUp(p, 'infantry', { hpPct: 0.2 }); for (const s of ['galley', 'wargalley', 'galleon', 'fireship', 'demoship']) p.costMul[s] = 0.85; p.freeTechs = ['wheelbarrow', 'handcart']; break;
    case 'saracens': p.tributeFee = 0.1; addUp(p, 'archer', { bldBonus: 2 }); addUp(p, 'transport', { hpPct: 1 }); p.transportCap += 10; break;
  }
  if (p.civ === 'franks') p.freeTechs = ['horsecollar', 'heavyplow'];
}
function spawnFromSpec(o) {
  if (o.k === 'unit') return spawnUnit(o.t, o.o | 0, o.x + 0.5, o.y + 0.5);
  if (o.k === 'bld') return spawnBuilding(o.t, o.o | 0, o.x, o.y, true);
  return spawnRes(o.k, o.x, o.y, o.v | 0);
}
function newId() { return W.nextId++; }
function addEnt(e) { W.ents.set(e.id, e); W.list.push(e); return e; }
function spawnRes(k, x, y, v = 0) {
  const map = W.map; if (!map.inb(x, y)) return null;
  const amounts = { tree: 100, gold: 800, stone: 350, berry: 125, fish: v ? 225 : 200, shrub: 0 };
  if (k === 'relic') return addEnt({ id: newId(), kind: 'relic', type: 'relic', x, y, owner: 0, carrier: 0, inBld: 0 });
  const e = addEnt({ id: newId(), kind: 'res', type: k, x, y, v, amount: amounts[k] || 0, max: amounts[k] || 1, felled: false, owner: 0, gatherers: 0 });
  if (k !== 'shrub') map.blk[map.idx(x, y)] = e.id;
  return e;
}
function statU(u, k) {
  const d = UNITS[u.type]; let v = d[k] || 0; const p = W.players[u.owner];
  if (p) {
    for (const t of d.tags) { const a = p.up[t]; if (a && a[k]) v += a[k]; }
    const b = p.up[u.type]; if (b && b[k]) v += b[k];
  }
  return v;
}
function unitMaxHp(type, owner) {
  const d = UNITS[type], p = W.players[owner]; let hp = d.hp;
  if (p) { const f = { type, owner }; hp = statU(f, 'hp'); hp *= 1 + statU(f, 'hpPct'); }
  return Math.round(hp);
}
function spawnUnit(type, owner, x, y) {
  const d = UNITS[type]; if (!d) return null;
  const u = addEnt({ id: newId(), kind: 'unit', type, owner, x, y, hp: 1, maxhp: 1, dir: Math.PI / 4, face: 1, anim: 'idle', animT: Math.random() * 10, path: null, pi: 0, order: null, carry: null, cd: 0, inside: 0, cargo: [], relic: 0, convT: 0, recharge: 0, stuck: 0, lastHitBy: 0, contest: 0, contestBy: 0, work: null, idleT: 0, bornT: W ? W.t : 0 });
  u.maxhp = u.hp = unitMaxHp(type, owner);
  if (d.animal) { u.homeX = x; u.homeY = y; }
  return u;
}
function spawnBuilding(type, owner, x, y, built) {
  const d = BUILDINGS[type], map = W.map, s = d.size;
  const b = addEnt({ id: newId(), kind: 'bld', type, owner, x, y, hp: 1, maxhp: 1, built: !!built, progress: built ? 1 : 0, queue: [], rally: null, garrison: [], relics: [], cd: 0, food: 0, farmer: 0, fireT: 0, openT: 0, builders: 0, bornT: W.t, relicT: 0 });
  b.maxhp = bldMaxHp(b);
  b.hp = built ? b.maxhp : 1;
  if (d.farm) b.food = W.players[owner] ? W.players[owner].farmFood : 175;
  if (!d.farm) for (let yy = y; yy < y + s; yy++) for (let xx = x; xx < x + s; xx++) if (map.inb(xx, yy)) map.blk[map.idx(xx, yy)] = b.id;
  return b;
}
function bldMaxHp(b) {
  const d = BUILDINGS[b.type], p = W.players[b.owner]; let hp = d.hp;
  if (p) { hp *= p.bldHp; if (b.type === 'tower') hp *= 1 + p.towerLvl * 0.5; }
  return Math.round(hp);
}
function removeEnt(e) {
  if (!W.ents.has(e.id)) return;
  W.ents.delete(e.id); e.dead = true;
  const i = W.list.indexOf(e); if (i >= 0) W.list.splice(i, 1);
  const map = W.map;
  if (e.kind === 'bld' && !BUILDINGS[e.type].farm) { const s = bsize(e); for (let y = e.y; y < e.y + s; y++) for (let x = e.x; x < e.x + s; x++) if (map.inb(x, y) && map.blk[map.idx(x, y)] === e.id) map.blk[map.idx(x, y)] = 0; }
  if (e.kind === 'res' && map.blk[map.idx(e.x, e.y)] === e.id) map.blk[map.idx(e.x, e.y)] = 0;
  if (typeof UI !== 'undefined' && UI.onRemoved) UI.onRemoved(e);
}

// ---------- passability ----------
function passLand(owner) {
  const map = W.map;
  return (i) => {
    const t = map.ter[i]; if (t === T.WATER || t === T.DEEP) return false;
    const b = map.blk[i]; if (!b) return true;
    const e = W.ents.get(b);
    if (!e) { map.blk[i] = 0; return true; }
    return e.type === 'gate' && e.built && owner > 0 && isFriend(e.owner, owner);
  };
}
function passNaval() {
  const map = W.map;
  return (i) => { const t = map.ter[i]; if (t !== T.WATER && t !== T.DEEP) return false; const b = map.blk[i]; if (!b) return true; if (!W.ents.get(b)) { map.blk[i] = 0; return true; } return false; };
}
function unitPass(u) { return UNITS[u.type].naval ? passNaval() : passLand(u.owner); }
function tilePassFor(u, x, y) { if (!W.map.inb(x | 0, y | 0)) return false; return unitPass(u)(W.map.idx(x | 0, y | 0)); }

// ---------- movement ----------
function pathTo(u, rect, r) {
  const res = findPath(W.map, u.x | 0, u.y | 0, { x0: rect.x0, y0: rect.y0, x1: rect.x1, y1: rect.y1, r }, unitPass(u));
  u.path = res.pts; u.pi = 0; u.pathOk = res.ok; u.goalRect = rect; u.goalR = r; u.repathT = 0;
  return res.ok;
}
function moveToPoint(u, x, y) {
  x = Math.max(0.3, Math.min(W.n - 0.3, x)); y = Math.max(0.3, Math.min(W.n - 0.3, y));
  pathTo(u, { x0: x | 0, y0: y | 0, x1: x | 0, y1: y | 0 }, 0);
  if (u.pathOk && u.path) { if (u.path.length) u.path[u.path.length - 1] = { x, y }; else u.path = [{ x, y }]; }
  u.dest = { x, y };
}
function moveNear(u, e, r) { pathTo(u, rectOf(e), r); u.dest = null; }
// returns true when path finished
function followPath(u, dt) {
  if (!u.path || u.pi >= u.path.length) { u.anim = u.anim === 'walk' ? 'idle' : u.anim; return true; }
  const d = UNITS[u.type];
  const p = u.path[u.pi];
  const dx = p.x - u.x, dy = p.y - u.y, dist = Math.hypot(dx, dy);
  let sp = (d.speed + statU(u, 'speed')) ;
  if (!d.naval) { const e0 = W.map.h(u.x, u.y), e1 = W.map.h(u.x + dx / (dist || 1) * 0.3, u.y + dy / (dist || 1) * 0.3); sp *= e1 > e0 + 0.05 ? 0.8 : e1 < e0 - 0.05 ? 1.1 : 1; }
  if (u.carry && u.carry.amt > 0 && u.type === 'villager') sp *= 0.95;
  const step = sp * dt;
  u.anim = 'walk';
  setFacing(u, dx, dy);
  if (dist <= step) { u.x = p.x; u.y = p.y; u.pi++; if (u.pi >= u.path.length) { u.anim = 'idle'; return true; } return false; }
  const nx = u.x + dx / dist * step, ny = u.y + dy / dist * step;
  if (tilePassFor(u, nx, ny) || !tilePassFor(u, u.x, u.y)) { u.x = nx; u.y = ny; u.stuck = Math.max(0, u.stuck - dt); }
  else {
    u.stuck += dt;
    if (u.stuck > 0.6) { u.stuck = 0; if (u.goalRect) pathTo(u, u.goalRect, u.goalR); }
  }
  return false;
}
function setFacing(u, dx, dy) {
  if (Math.abs(dx) + Math.abs(dy) < 1e-4) return;
  u.dir = Math.atan2(dy, dx);
  const sx = dx - dy; // screen x
  if (Math.abs(sx) > 0.01) u.face = sx > 0 ? 1 : -1;
  u.back = (dx + dy) < -0.01;
}
function faceTo(u, e) { const c = center(e); setFacing(u, c.x - u.x, c.y - u.y); }

// ---------- orders ----------
function setOrder(u, o) {
  if (u.dying) return;
  if (u.order && u.order.t === 'build') { const b = ent(u.order.id); if (b) b.builders = Math.max(0, b.builders - 1); }
  if (u.work && u.work.farm) { const f = ent(u.work.farm); if (f && f.farmer === u.id) f.farmer = 0; }
  u.work = null;
  u.order = o; u.path = null; u.convT = 0; u.phase = 0;
  if (!o) { u.anim = 'idle'; return; }
  if (o.t === 'move') moveToPoint(u, o.x, o.y);
}
function orderMove(units, x, y) {
  // formation: spread in a grid around the target
  const land = units.filter(u => !UNITS[u.type].naval), sea = units.filter(u => UNITS[u.type].naval);
  for (const grp of [land, sea]) {
    const k = Math.ceil(Math.sqrt(grp.length));
    grp.forEach((u, i) => {
      const ox = (i % k - (k - 1) / 2) * (grp.length > 1 ? 0.9 : 0), oy = (((i / k) | 0) - (k - 1) / 2) * (grp.length > 1 ? 0.9 : 0);
      if (u.type === 'transport' || u.order && u.order.t === 'unload') { }
      setOrder(u, { t: 'move', x: x + ox, y: y + oy });
    });
  }
}
function canAttack(u, t) {
  if (!t || t.dead || t === u) return false;
  const d = UNITS[u.type];
  if (!(d.atk > 0) && !d.selfDestruct) return false;
  if (t.kind === 'res' || t.kind === 'relic') return false;
  if (t.kind === 'unit' && t.inside) return false;
  if (t.kind === 'unit' && UNITS[t.type].animal) return true;
  if (t.owner === u.owner) return false;
  if (u.owner === 0) return true; // wild animals
  if (!isEnemy(u.owner, t.owner) && t.owner !== 0) return false;
  if (d.onlyBld && t.kind !== 'bld' && !(t.kind === 'unit' && hasTag(t.type, 'siege')) && !(t.kind === 'unit' && hasTag(t.type, 'ship'))) return false;
  if (d.naval && t.kind === 'unit' && !UNITS[t.type].naval) { /* ships can shoot units on shore */ }
  if (!d.naval && !(d.range > 0) && t.kind === 'unit' && UNITS[t.type].naval) return false; // melee cannot hit ships
  if (u.type === 'demoship' && t.kind === 'unit' && !UNITS[t.type].naval) return false;
  if (u.type === 'fireship' && t.kind === 'unit' && !UNITS[t.type].naval) return false;
  return true;
}
// Right-click context command. returns action name for voice
function orderTarget(units, t, shift) {
  let action = 'move';
  for (const u of units) {
    const d = UNITS[u.type];
    if (u.owner !== W.humanId && units.length && units[0].owner !== u.owner) continue;
    if (d.animal && u.type !== 'sheep') continue;
    const own = t.owner === u.owner;
    if (t.kind === 'bld') {
      const bd = BUILDINGS[t.type];
      if (own || isFriend(u.owner, t.owner)) {
        if (u.type === 'villager') {
          if (!t.built) { setOrder(u, { t: 'build', id: t.id }); action = 'build'; continue; }
          if (bd.farm && own) { setOrder(u, { t: 'farm', id: t.id }); action = 'gather'; continue; }
          if (t.hp < t.maxhp && own) { setOrder(u, { t: 'repair', id: t.id }); action = 'build'; continue; }
          if (u.carry && u.carry.amt > 0 && bd.drop && bd.drop.includes(u.carry.res) && t.type !== 'dock') { setOrder(u, { t: 'dropoff', id: t.id }); action = 'gather'; continue; }
        }
        if (u.relic && t.type === 'monastery' && own) { setOrder(u, { t: 'deposit', id: t.id }); continue; }
        if ((u.type === 'tradecart' && t.type === 'market') || (u.type === 'tradecog' && t.type === 'dock')) {
          const home = nearestOwn(u, u.type === 'tradecart' ? 'market' : 'dock', t.id);
          if (home) { setOrder(u, { t: 'trade', dest: t.id, home: home.id }); action = 'gather'; continue; }
        }
        if (own && canGarrisonIn(u, t)) { setOrder(u, { t: 'garrison', id: t.id }); continue; }
        if (u.type === 'fishingship' && t.type === 'dock' && u.carry && u.carry.amt) { setOrder(u, { t: 'dropoff', id: t.id }); continue; }
        setOrder(u, { t: 'moveto', id: t.id });
        continue;
      }
      if (canAttack(u, t)) { setOrder(u, { t: 'attack', id: t.id }); action = 'attack'; }
      else if (u.type === 'monk') { setOrder(u, { t: 'moveto', id: t.id }); }
      continue;
    }
    if (t.kind === 'res') {
      if (u.type === 'villager' && t.type !== 'fish' && t.type !== 'shrub') { setOrder(u, { t: 'gather', id: t.id }); action = 'gather'; continue; }
      if (u.type === 'fishingship' && t.type === 'fish') { setOrder(u, { t: 'gather', id: t.id }); action = 'gather'; continue; }
      const c = center(t); setOrder(u, { t: 'move', x: c.x, y: c.y + 1 }); continue;
    }
    if (t.kind === 'relic') {
      if (u.type === 'monk') { setOrder(u, { t: 'relic', id: t.id }); action = 'gather'; }
      else setOrder(u, { t: 'move', x: t.x + 0.5, y: t.y + 1.5 });
      continue;
    }
    if (t.kind === 'unit') {
      const td = UNITS[t.type];
      if (t.type === 'transport' && own && !d.naval) { setOrder(u, { t: 'board', id: t.id }); continue; }
      if (u.type === 'monk') {
        if (isFriend(u.owner, t.owner) && t.owner > 0) { if (!hasTag(t.type, 'machine')) { setOrder(u, { t: 'heal', id: t.id }); action = 'gather'; } else setOrder(u, { t: 'follow', id: t.id }); }
        else if (t.owner > 0 && !td.animal) { setOrder(u, { t: 'convert', id: t.id }); action = 'attack'; }
        continue;
      }
      if (u.type === 'villager') {
        if (td.animal && (t.owner === u.owner || t.owner === 0 || t.type !== 'sheep') && t.type !== 'wolf') { setOrder(u, { t: 'hunt', id: t.id }); action = 'gather'; continue; }
        if (own && hasTag(t.type, 'machine') && t.hp < t.maxhp) { setOrder(u, { t: 'repair', id: t.id }); action = 'build'; continue; }
      }
      if (own || isFriend(u.owner, t.owner)) { setOrder(u, { t: 'follow', id: t.id }); continue; }
      if (t.type === 'sheep') { const c = center(t); setOrder(u, { t: 'move', x: c.x, y: c.y }); continue; }
      if (canAttack(u, t)) { setOrder(u, { t: 'attack', id: t.id }); action = 'attack'; }
      continue;
    }
  }
  return action;
}
function canGarrisonIn(u, b) {
  if (!b.built || b.kind !== 'bld') return false;
  const d = UNITS[u.type], bd = BUILDINGS[b.type];
  if (!bd.garrison || d.naval || d.animal) return false;
  if (b.type === 'tc' && !(u.type === 'villager' || hasTag(u.type, 'infantry') || hasTag(u.type, 'archer') || u.type === 'monk')) return false;
  if (hasTag(u.type, 'siege') || u.type === 'cobra' || hasTag(u.type, 'trade')) return false;
  return true;
}
function garrisonCap(b) { const p = W.players[b.owner]; let c = BUILDINGS[b.type].garrison || 0; if (b.type === 'tower' && p && p.garrisonMul) c *= p.garrisonMul; return c; }
function nearestOwn(u, type, exclude) {
  let best = null, bd = 1e9;
  for (const e of W.list) if (e.kind === 'bld' && e.type === type && e.owner === u.owner && e.built && e.id !== exclude) { const d = distTo(u, e); if (d < bd) { bd = d; best = e; } }
  return best;
}
function nearestDrop(u, res) {
  let best = null, bd = 1e9;
  for (const e of W.list) {
    if (e.kind !== 'bld' || e.owner !== u.owner || !e.built) continue;
    const bdef = BUILDINGS[e.type];
    if (!bdef.drop || !bdef.drop.includes(res)) continue;
    if (!!UNITS[u.type].naval !== (e.type === 'dock')) continue;
    const d = distTo(u, e); if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function findNearestRes(u, types, x, y, maxD = 30, filter) {
  let best = null, bd = maxD;
  for (const e of W.list) {
    if (e.kind !== 'res' || !types.includes(e.type) || e.amount <= 0) continue;
    if (filter && !filter(e)) continue;
    const d = Math.hypot(e.x + 0.5 - x, e.y + 0.5 - y) + e.gatherers * 0.7;
    if (d < bd) {
      if (!UNITS[u.type].naval && W.map.landReg[W.map.idx(u.x | 0, u.y | 0)] && !adjReachable(u, e)) continue;
      bd = d; best = e;
    }
  }
  return best;
}
function adjReachable(u, e) {
  const map = W.map, reg = map.landReg[map.idx(u.x | 0, u.y | 0)];
  const r = rectOf(e);
  for (let y = r.y0 - 1; y <= r.y1 + 1; y++) for (let x = r.x0 - 1; x <= r.x1 + 1; x++) if (map.inb(x, y) && map.landReg[map.idx(x, y)] === reg && !map.blk[map.idx(x, y)]) return true;
  return false;
}

// ---------- spatial grid ----------
function rebuildGrid() {
  const g = W.grid; g.clear();
  for (const e of W.list) {
    if (e.kind !== 'unit' || e.inside || e.dying) continue;
    const k = ((e.y >> 2) << 10) | (e.x >> 2);
    let a = g.get(k); if (!a) g.set(k, a = []); a.push(e);
  }
}
function unitsNear(x, y, r, fn) {
  const out = [];
  const x0 = Math.max(0, (x - r) >> 2), x1 = (x + r) >> 2, y0 = Math.max(0, (y - r) >> 2), y1 = (y + r) >> 2;
  for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
    const a = W.grid.get((gy << 10) | gx); if (!a) continue;
    for (const u of a) if (Math.hypot(u.x - x, u.y - y) <= r && (!fn || fn(u))) out.push(u);
  }
  return out;
}

// ---------- combat ----------
function elevFactor(a, t) {
  const ea = W.map.elevAt(a.x, a.y);
  const c = center(t); const et = W.map.elevAt(c.x, c.y);
  return ea > et ? 1.25 : ea < et ? 0.75 : 1;
}
function computeDamage(att, t, meleeOverride) {
  const d = UNITS[att.type];
  let atk = att.kind === 'bld' ? bldAtk(att) : statU(att, 'atk') + d.atk * 0; // statU includes base
  if (att.kind !== 'bld') atk = statU(att, 'atk');
  const ranged = att.kind === 'bld' || (d && d.range > 0 && !d.meleeDmg);
  let armor;
  if (t.kind === 'bld') { const bd = BUILDINGS[t.type]; const bp = W.players[t.owner]; armor = (ranged ? bd.pa : bd.ma) + (bp ? bp.bldArmor : 0); }
  else armor = ranged ? statU(t, 'pa') : statU(t, 'ma');
  let dmg = Math.max(1, atk - armor);
  if (d && d.bonus) {
    const tags = t.kind === 'bld' ? ['building'] : UNITS[t.type].tags;
    for (const k in d.bonus) if (tags.includes(k)) dmg += d.bonus[k];
  }
  if (t.kind === 'bld' && att.kind === 'unit') dmg += statU(att, 'bldBonus');
  if (att.kind === 'unit' && t.kind === 'unit' && UNITS[t.type].animal && att.type === 'villager') dmg += 2;
  dmg *= elevFactor(att, t);
  return dmg;
}
function bldAtk(b) { const p = W.players[b.owner]; return BUILDINGS[b.type].atk + (p ? p.bldAtk + (b.type === 'tower' ? p.towerLvl * 2 : 0) : 0); }
function applyDamage(t, dmg, src) {
  if (!t || t.dead || t.dying) return;
  if (t.kind === 'res' || t.kind === 'relic') return;
  t.hp -= dmg;
  t.hitT = W.t;
  if (src) t.lastHitBy = src.id;
  if (t.kind === 'unit') {
    // retaliation / flee
    const td = UNITS[t.type];
    if (src && src.kind === 'unit' && !src.dead) {
      if (td.prey || t.type === 'sheep') { if (td.prey) fleeFrom(t, src); }
      else if ((td.fights || td.predator) && (!t.order || t.order.t !== 'attack')) setOrder(t, { t: 'attack', id: src.id });
      else if (!td.animal && t.type !== 'villager' && canAttack(t, src) && (!t.order || t.order.t === 'guard' || t.order.t === 'attackmove' || (t.order.t === 'move' && false))) setOrder(t, { t: 'attack', id: src.id });
      else if (!td.animal && !t.order && canAttack(t, src)) setOrder(t, { t: 'attack', id: src.id });
      if (t.owner === W.humanId && src.owner !== W.humanId) alertAttack(t);
      if (t.owner > 0 && W.players[t.owner].ai) W.players[t.owner].ai.onAttacked(t, src);
    }
    if (td.animal && t.type !== 'sheep') emitFx('blood', t.x, t.y, 3);
    else if (!hasTag(t.type, 'machine')) emitFx('blood', t.x, t.y, 2);
  } else {
    if (src && t.owner === W.humanId && src.owner !== W.humanId) alertAttack(t);
    if (src && t.owner > 0 && W.players[t.owner].ai) W.players[t.owner].ai.onAttacked(t, src);
    emitFx('dust', center(t).x, center(t).y, 2);
  }
  if (t.hp <= 0) killEnt(t, src);
}
function alertAttack(t) {
  if (W.t - (W.lastAlert || -99) > 8) { W.lastAlert = W.t; msg(t.kind === 'bld' ? 'Your building is under attack!' : 'You are under attack!', '#f88'); Sound.alert(); W.alerts.push({ x: center(t).x, y: center(t).y, t: W.t }); }
}
function killEnt(e, src) {
  if (e.dead || e.dying) return;
  const p = W.players[e.owner];
  if (src && src.owner && W.players[src.owner]) W.players[src.owner].stats.kills++;
  if (p) p.stats.lost++;
  if (e.kind === 'unit') {
    const d = UNITS[e.type];
    // drop relic
    if (e.relic) { const r = ent(e.relic); if (r) { r.carrier = 0; r.x = Math.max(0, Math.min(W.n - 1, e.x | 0)); r.y = Math.max(0, Math.min(W.n - 1, e.y | 0)); if (W.map.isWater(r.x, r.y)) { const t = nearestLandTile(r.x, r.y); if (t) { r.x = t.x; r.y = t.y; } } } e.relic = 0; }
    // transported units die with the ship
    for (const cid of e.cargo) { const c = ent(c_id(cid)); if (c) { removeEnt(c); } }
    e.cargo = [];
    if (d.naval) { Sound.play('sink', e.x, e.y); emitFx('splash', e.x, e.y, 10); W.decals.push({ type: 'wreck', x: e.x, y: e.y, t: W.t, face: e.face, ship: e.type, owner: e.owner, dur: 6 }); removeEnt(e); return; }
    if (d.animal && d.food > 0) {
      // becomes carcass resource
      const c = addEnt({ id: newId(), kind: 'res', type: 'carcass', animal: e.type, x: Math.max(0, Math.min(W.n - 1, e.x | 0)), y: Math.max(0, Math.min(W.n - 1, e.y | 0)), fx: e.x, fy: e.y, face: e.face, amount: d.food, max: d.food, owner: 0, gatherers: 0 });
      removeEnt(e);
      Sound.play(e.type === 'sheep' ? 'bleat' : 'animaldie', e.x, e.y);
      return c;
    }
    if (hasTag(e.type, 'siege') || e.type === 'cobra') { emitFx('explosion', e.x, e.y, 1); Sound.play('crash', e.x, e.y); removeEnt(e); return; }
    e.dying = true; e.dieT = 0; e.anim = 'die'; e.path = null; e.order = null;
    Sound.play(d.animal ? 'animaldie' : 'die', e.x, e.y, e);
    return;
  }
  if (e.kind === 'bld') {
    const c = center(e), s = bsize(e);
    // eject garrison
    const occ = e.garrison.slice(); e.garrison = [];
    removeEnt(e);
    for (const id of occ) { const u = ent(id); if (u) ejectUnit(u, e); }
    for (const rid of e.relics) { const r = ent(rid); if (r) { r.inBld = 0; const t = nearestLandTile(c.x | 0, c.y | 0, true); r.x = t ? t.x : c.x | 0; r.y = t ? t.y : c.y | 0; } }
    e.relics = [];
    for (const q of e.queue) refund(W.players[e.owner], q);
    if (e.queue.length && e.queue[0].kind === 'tech') W.players[e.owner].researching.delete(e.queue[0].id);
    e.queue = [];
    if (!BUILDINGS[e.type].farm) { W.decals.push({ type: 'rubble', x: e.x, y: e.y, s, t: W.t, dur: 60 }); emitFx('collapse', c.x, c.y, s); Sound.play('collapse', c.x, c.y); }
    recalcPop();
  }
}
function c_id(x) { return x; }
function nearestLandTile(x, y, freeOnly) {
  const map = W.map;
  for (let r = 0; r < 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const xx = x + dx, yy = y + dy; if (!map.inb(xx, yy)) continue;
    const i = map.idx(xx, yy); if (isWaterT(map.ter[i])) continue; if (freeOnly && map.blk[i]) continue;
    return { x: xx, y: yy };
  }
  return null;
}
function fireProjectile(src, t, type, dmgFn, extra = {}) {
  const s = src.kind === 'bld' ? center(src) : { x: src.x, y: src.y };
  const c = t.kind === 'unit' ? { x: t.x, y: t.y } : center(t);
  let tx = c.x, ty = c.y;
  const p = W.players[src.owner];
  if (t.kind === 'unit' && t.path && t.pi < (t.path ? t.path.length : 0) && !(p && p.ballistics) && !UNITS[t.type].animal) { tx += (Math.random() - 0.5) * 0.8; ty += (Math.random() - 0.5) * 0.8; }
  const dist = Math.hypot(tx - s.x, ty - s.y);
  const speed = { arrow: 9, javelin: 7, stone: 6, boulder: 5, bolt: 12, bullet: 20, fire: 6, axe: 7, jav: 7 }[type] || 8;
  W.projs.push(Object.assign({ type, sx: s.x, sy: s.y, sz: src.kind === 'bld' ? 1.8 : 0.6, x: s.x, y: s.y, tx, ty, t: 0, dur: Math.max(0.1, dist / speed), target: t.id, src: src.id, owner: src.owner, dmg: dmgFn, arc: type === 'stone' || type === 'boulder' ? 0.4 : type === 'bullet' || type === 'fire' ? 0.02 : 0.15, dist }, extra));
}
function updateProjectiles(dt) {
  for (let i = W.projs.length - 1; i >= 0; i--) {
    const p = W.projs[i]; p.t += dt;
    const f = Math.min(1, p.t / p.dur);
    p.x = p.sx + (p.tx - p.sx) * f; p.y = p.sy + (p.ty - p.sy) * f;
    if (f >= 1) {
      W.projs.splice(i, 1);
      const t = ent(p.target), src = ent(p.src) || { kind: 'unit', type: p.srcType || 'archer', owner: p.owner, x: p.sx, y: p.sy, id: p.src };
      if (p.blast) {
        emitFx(p.type === 'boulder' || p.type === 'stone' ? 'impact' : 'explosion', p.x, p.y, 1);
        Sound.play('impact', p.x, p.y);
        const hit = unitsNear(p.x, p.y, p.blast + 0.3, u => u.owner !== 0 || !UNITS[u.type].animal || true);
        for (const u of hit) if (u.owner !== p.owner || p.type === 'stone') applyDamage(u, p.dmgVal * (u === t ? 1 : 0.6), src);
        if (t && t.kind === 'bld' && distTo({ x: p.x, y: p.y }, t) < 1) applyDamage(t, p.dmgVal, src);
        continue;
      }
      if (!t || t.dead) { if (p.type !== 'fire') emitFx('dust', p.x, p.y, 1); continue; }
      const c = t.kind === 'unit' ? { x: t.x, y: t.y } : null;
      const hitOk = t.kind !== 'unit' || Math.hypot(c.x - p.x, c.y - p.y) < UNIT_R(t) + 0.35;
      if (hitOk) { applyDamage(t, p.dmgVal, src); if (p.type === 'fire') emitFx('fire', p.x, p.y, 2); }
      else emitFx(W.map.isWater(p.x | 0, p.y | 0) ? 'splash' : 'dust', p.x, p.y, 1);
    }
  }
}
function doAttack(u, t, dt) {
  const d = UNITS[u.type];
  if (!canAttack(u, t)) { setOrder(u, null); return; }
  let range = (d.range || 0) + statU(u, 'range');
  if (range > 0 && d.range) { const ea = W.map.elevAt(u.x, u.y), et = W.map.elevAt(center(t).x, center(t).y); if (ea > et) range += 1; }
  let reach = range > 0 ? range : 0.35;
  if (u.type === 'villager' && t.kind === 'unit' && UNITS[t.type].animal && t.type !== 'sheep') reach = 3; // hunters throw spears
  const dist = distTo(u, t);
  if (d.minRange && dist < d.minRange && t.kind === 'unit') { // back off
    const c = center(t); const ax = u.x - c.x, ay = u.y - c.y, l = Math.hypot(ax, ay) || 1;
    if (!u.path || u.pi >= u.path.length) moveToPoint(u, u.x + ax / l * 2, u.y + ay / l * 2);
    followPath(u, dt); return;
  }
  if (dist > reach) {
    u.repathT = (u.repathT || 0) - dt;
    if (!u.path || u.pi >= u.path.length || u.repathT <= 0) {
      u.repathT = 0.8;
      const r = Math.max(0, Math.floor(reach));
      if (t.kind === 'unit') pathTo(u, rectOf(t), Math.min(r, 6)); else pathTo(u, rectOf(t), Math.max(1, Math.min(r, 6)));
      if (!u.pathOk && u.path && u.path.length === 0 && dist > reach + 1) { u.giveUp = (u.giveUp || 0) + 1; if (u.giveUp > 4) { u.giveUp = 0; setOrder(u, null); return; } }
    }
    followPath(u, dt);
    return;
  }
  u.path = null; faceTo(u, t);
  u.anim = 'attack';
  if (u.cd > 0) return;
  let rof = d.rof * (1 + statU(u, 'rofMul'));
  u.cd = rof; u.atkT = W.t;
  if (d.selfDestruct) {
    emitFx('explosion', u.x, u.y, 2); Sound.play('explode', u.x, u.y);
    const dmg = statU(u, 'atk');
    for (const e of W.list.slice()) {
      if (e === u || e.dead) continue;
      if (e.kind === 'unit' && !e.inside && Math.hypot(e.x - u.x, e.y - u.y) < d.blast + UNIT_R(e) && e.owner !== u.owner) applyDamage(e, e.kind === 'bld' ? dmg + 150 : dmg, u);
      else if (e.kind === 'bld' && distTo(u, e) < d.blast && e.owner !== u.owner) applyDamage(e, dmg + 150, u);
    }
    killEnt(u, null); return;
  }
  const dmg = computeDamage(u, t);
  if (d.proj) {
    const shots = d.multishot || 1;
    for (let s = 0; s < shots; s++) fireProjectile(u, t, d.proj, null, { dmgVal: s === 0 ? dmg : dmg * 0.35, blast: d.blast || 0, srcType: u.type });
    Sound.play(d.proj === 'bullet' ? (u.type === 'cobra' ? 'mg' : 'gun') : d.proj === 'stone' || d.proj === 'boulder' ? 'catapult' : d.proj === 'fire' ? 'fire' : 'bow', u.x, u.y);
  } else if (u.type === 'villager' && t.kind === 'unit' && UNITS[t.type].animal && t.type !== 'sheep' && dist > 0.6) {
    fireProjectile(u, t, 'javelin', null, { dmgVal: dmg });
    Sound.play('bow', u.x, u.y);
  } else {
    applyDamage(t, dmg, u);
    Sound.play(t.kind === 'bld' ? 'hitbld' : hasTag(u.type, 'siege') ? 'ram' : UNITS[u.type].animal ? 'bite' : 'sword', u.x, u.y);
  }
}

// ---------- production ----------
function effCost(p, id, isTech) {
  const base = isTech ? TECHS[id].cost : (UNITS[id] ? UNITS[id].cost : BUILDINGS[id].cost);
  const c = {}; let m = p.costMul[id] || 1;
  if (isTech) {
    m *= p.techMul;
    if (TECHS[id].ageUp) { m *= p.ageMul || 1; if (id === 'imperial') m *= p.impMul || 1; }
    if (TECHS[id].at === 'dock') m *= p.dockTechMul || 1;
    if (p.freeTechs && p.freeTechs.includes(id)) m = 0;
  }
  for (const r in base) c[r] = Math.round(base[r] * m);
  return c;
}
function canPay(p, c) { for (const r in c) if (p.res[r] < c[r]) return false; return true; }
function pay(p, c) { for (const r in c) p.res[r] -= c[r]; }
function refund(p, q) { if (!p) return; for (const r in q.cost) p.res[r] += q.cost[r]; }
function currentType(p, base) {
  let t = base;
  for (let k = 0; k < 4; k++) { const up = Object.values(TECHS).find(x => x.upg && x.upg[0] === t && p.techs.has(Object.keys(TECHS).find(id => TECHS[id] === x))); if (!up) break; t = up.upg[1]; }
  return t;
}
function upgradeTechId(from) { return Object.keys(TECHS).find(id => TECHS[id].upg && TECHS[id].upg[0] === from); }
function builtCount(p, type) { let c = 0; for (const e of W.list) if (e.kind === 'bld' && e.owner === p.id && e.type === type && e.built) c++; return c; }
function hasBuilt(p, type) { for (const e of W.list) if (e.kind === 'bld' && e.owner === p.id && e.type === type && e.built) return true; return false; }
// Returns null if allowed, or a reason string.
function unitLocked(p, type) {
  const d = UNITS[type];
  if (d.age > p.age) return `Requires ${AGES[d.age]}`;
  return null;
}
function techLocked(p, id, b) {
  const t = TECHS[id];
  if (p.techs.has(id)) return 'Already researched';
  if (p.researching.has(id)) return 'Being researched';
  if (t.age > p.age) return `Requires ${AGES[t.age]}`;
  if (t.ageUp && t.ageUp !== p.age + 1) return t.ageUp <= p.age ? 'Already reached' : `Requires ${AGES[t.ageUp - 1]}`;
  if (t.req) for (const r of t.req) if (!p.techs.has(r)) return `Requires ${TECHS[r].name}`;
  if (t.ageUp) {
    const need = AGE_REQ[t.ageUp];
    const have = need.filter(bt => hasBuilt(p, bt));
    if (t.ageUp === 3 && hasBuilt(p, 'castle')) return null;
    if (have.length < 2) return `Requires 2 of: ${need.map(x => BUILDINGS[x].name).join(', ')} (have ${have.length})`;
  }
  if (t.upg && !Object.values(UNITS).length) return null;
  if (id === 'elite_uu' && p.age < 3) return 'Requires Imperial Age';
  return null;
}
function bldLocked(p, type) {
  const d = BUILDINGS[type];
  if (d.age > p.age) return `Requires ${AGES[d.age]}`;
  if (d.req) for (const r of d.req) if (!hasBuilt(p, r)) return `Requires ${BUILDINGS[r].name}`;
  return null;
}
function queueUnit(b, type) {
  const p = W.players[b.owner];
  if (!b.built) return 'Not built yet';
  const lock = unitLocked(p, type); if (lock) return lock;
  if (b.queue.length >= 10) return 'Queue full';
  const cost = effCost(p, type);
  if (!canPay(p, cost)) return 'Not enough resources';
  pay(p, cost);
  b.queue.push({ kind: 'unit', id: type, t: 0, cost });
  return null;
}
function queueTech(b, id) {
  const p = W.players[b.owner];
  if (!b.built) return 'Not built yet';
  const lock = techLocked(p, id, b); if (lock) return lock;
  if (b.queue.length >= 10) return 'Queue full';
  const cost = effCost(p, id, true);
  if (!canPay(p, cost)) return 'Not enough resources';
  pay(p, cost); p.researching.add(id);
  b.queue.push({ kind: 'tech', id, t: 0, cost });
  return null;
}
function cancelQueue(b, idx) {
  const q = b.queue[idx]; if (!q) return;
  b.queue.splice(idx, 1); refund(W.players[b.owner], q);
  if (q.kind === 'tech') W.players[b.owner].researching.delete(q.id);
}
function completeTech(p, id) {
  const t = TECHS[id];
  p.techs.add(id); p.researching.delete(id);
  if (t.fx) t.fx(p);
  if (t.ageUp) {
    p.age = t.ageUp;
    if (p.id === W.humanId) { msg(`You have advanced to the ${AGES[p.age]}!`, '#ffd76a'); Sound.fanfare(); }
    else msg(`${p.name} advanced to the ${AGES[p.age]}.`, p.color.l);
    for (const e of W.list) if (e.kind === 'bld' && e.owner === p.id) { const r = e.hp / e.maxhp; e.maxhp = bldMaxHp(e); e.hp = e.maxhp * r; }
  } else if (p.id === W.humanId) { msg(`${t.name} researched.`, '#bfe'); Sound.play('research'); }
  if (t.upg) {
    for (const e of W.list) if (e.kind === 'unit' && e.owner === p.id && e.type === t.upg[0]) { const r = e.hp / e.maxhp; e.type = t.upg[1]; e.maxhp = unitMaxHp(e.type, e.owner); e.hp = e.maxhp * r; }
  }
  // refresh hp for hp ups
  for (const e of W.list) if (e.kind === 'unit' && e.owner === p.id) { const m = unitMaxHp(e.type, e.owner); if (m !== e.maxhp) { e.hp += m - e.maxhp; e.maxhp = m; } }
  if (id === 'guardtower' || id === 'keep' || id === 'masonry') for (const e of W.list) if (e.kind === 'bld' && e.owner === p.id) { const r = e.hp / e.maxhp; e.maxhp = bldMaxHp(e); e.hp = e.maxhp * r; }
}
function freeTileNear(b, naval, fromX, fromY) {
  const r = rectOf(b), map = W.map;
  let best = null, bd = 1e9;
  for (let ring = 1; ring < 8 && !best; ring++) {
    for (let y = r.y0 - ring; y <= r.y1 + ring; y++) for (let x = r.x0 - ring; x <= r.x1 + ring; x++) {
      if (x > r.x0 - ring && x < r.x1 + ring && y > r.y0 - ring && y < r.y1 + ring) continue;
      if (!map.inb(x, y)) continue;
      const i = map.idx(x, y);
      const ok = naval ? (isWaterT(map.ter[i]) && !map.blk[i]) : (!isWaterT(map.ter[i]) && (!map.blk[i] || (ent(map.blk[i]) || {}).type === 'gate'));
      if (!ok) continue;
      const d = fromX !== undefined ? Math.hypot(x - fromX, y - fromY) : (y - r.y1) * -1 + Math.random() * 0.1 + (x + y) * -0.01;
      const dd = fromX !== undefined ? d : -(x + y) + Math.random();
      if (dd < bd) { bd = dd; best = { x: x + 0.5, y: y + 0.5 }; }
    }
  }
  return best;
}
function updateBuilding(b, dt) {
  const d = BUILDINGS[b.type], p = W.players[b.owner];
  if (!b.built) return;
  // fire / damage fx
  if (b.hp < b.maxhp * 0.66 && Math.random() < dt * (b.hp < b.maxhp * 0.33 ? 6 : 2)) { const c = center(b); emitFx('smoke', c.x + (Math.random() - 0.5) * d.size * 0.6, c.y + (Math.random() - 0.5) * d.size * 0.6, 1); }
  // production
  if (b.queue.length) {
    const q = b.queue[0];
    if (q.kind === 'unit') {
      if (p.pop >= p.popCap && !W.instantFor(p)) { b.popBlocked = true; if (p.id === W.humanId && W.t - (W.lastHouseMsg || -99) > 12) { W.lastHouseMsg = W.t; msg('You need to build more houses.', '#fc8'); } }
      else {
        b.popBlocked = false;
        q.t += dt * (W.instantFor(p) ? 1000 : 1);
        if (q.t >= UNITS[q.id].time) {
          b.queue.shift();
          const naval = !!UNITS[q.id].naval;
          const spot = freeTileNear(b, naval, b.rally ? b.rally.x : undefined, b.rally ? b.rally.y : undefined) || center(b);
          const u = spawnUnit(q.id, b.owner, spot.x, spot.y);
          p.pop++;
          if (b.rally) {
            const rt = b.rally.id && ent(b.rally.id);
            if (rt && (rt.kind === 'res' || rt.kind === 'bld' || rt.kind === 'unit')) orderTarget([u], rt);
            else setOrder(u, { t: 'move', x: b.rally.x, y: b.rally.y });
          }
          if (p.ai) p.ai.onTrained(u, b);
          if (p.id === W.humanId) Sound.play('trained', u.x, u.y);
          recalcPop();
        }
      }
    } else {
      q.t += dt * (W.instantFor(p) ? 1000 : 1);
      if (q.t >= TECHS[q.id].time) { b.queue.shift(); completeTech(p, q.id); }
    }
  }
  // relic gold
  if (b.type === 'monastery' && b.relics.length) {
    b.relicT += dt;
    if (b.relicT >= 2) { b.relicT -= 2; const g = b.relics.length; p.res.gold += g; p.stats.relicGold += g; }
  }
  // arrows
  if (d.atk) {
    b.cd -= dt;
    if (b.cd <= 0) {
      let nArrows = b.type === 'castle' ? 4 : 1;
      for (const id of b.garrison) { const u = ent(id); if (u && (u.type === 'villager' || hasTag(u.type, 'archer') || hasTag(u.type, 'infantry'))) nArrows++; }
      nArrows = Math.min(nArrows, b.type === 'castle' ? 20 : 12);
      const range = d.range + p.bldRange + 1;
      const c = center(b);
      const tgt = findTarget({ x: c.x, y: c.y, owner: b.owner, kind: 'bld', type: b.type }, range + d.size / 2);
      if (tgt) {
        b.cd = 2;
        for (let k = 0; k < nArrows; k++) setTimeoutSim(k * 0.08, () => { if (!b.dead && !tgt.dead) fireProjectile(b, tgt, 'arrow', null, { dmgVal: computeDamage(b, tgt) }); });
        Sound.play('bow', c.x, c.y);
      } else b.cd = 0.5;
    }
  }
  // gate opening
  if (d.gate) { const c = center(b); b.open = unitsNear(c.x, c.y, 1.6, u => isFriend(u.owner, b.owner)).length > 0; }
  // garrison heal
  for (const id of b.garrison) { const u = ent(id); if (u && u.hp < u.maxhp) u.hp = Math.min(u.maxhp, u.hp + dt * 0.5); }
}
function setTimeoutSim(delay, fn) { W.timers = W.timers || []; W.timers.push({ at: W.t + delay, fn }); }
function findTarget(src, range) {
  let best = null, bd = 1e9;
  const cands = unitsNear(src.x, src.y, range + 1, u => !u.inside);
  for (const u of cands) {
    if (u.owner === src.owner) continue;
    if (u.owner === 0 ? u.type !== 'wolf' : !isEnemy(src.owner, u.owner)) continue;
    if (src.kind === 'bld' && UNITS[u.type].naval && false) continue;
    const d = Math.hypot(u.x - src.x, u.y - src.y) + (u.type === 'villager' ? 0.5 : 0);
    if (d < bd) { bd = d; best = u; }
  }
  return best;
}
function findTargetFor(u, range) {
  const d = UNITS[u.type];
  let best = null, bd = 1e9;
  for (const t of unitsNear(u.x, u.y, range + 1, t => !t.inside && !t.dying)) {
    if (!canAttack(u, t)) continue;
    if (t.owner === 0 && t.type !== 'wolf') continue;
    const dist = Math.hypot(t.x - u.x, t.y - u.y);
    // prefer military over villagers, reachable
    let score = dist + (t.type === 'villager' ? 1.5 : 0) + (hasTag(t.type, 'monk') ? 0 : 0);
    if (!d.naval && UNITS[t.type].naval && !(d.range > 0)) continue;
    if (!d.naval && !(d.range > 0) && W.map.landReg[W.map.idx(t.x | 0, t.y | 0)] !== W.map.landReg[W.map.idx(u.x | 0, u.y | 0)]) continue;
    if (score < bd) { bd = score; best = t; }
  }
  if (!best && (d.onlyBld || d.naval || u.order && u.order.t === 'attackmove')) {
    for (const e of W.list) {
      if (e.kind !== 'bld' || !isEnemy(u.owner, e.owner)) continue;
      const dist = distTo(u, e); if (dist > range) continue;
      if (BUILDINGS[e.type].wall && !d.onlyBld) continue;
      if (dist < bd) { bd = dist; best = e; }
    }
  }
  return best;
}

// ---------- unit update ----------
function updateUnit(u, dt) {
  const d = UNITS[u.type];
  u.animT += dt;
  if (u.inside) return;
  if (u.dying) { u.dieT += dt; if (u.dieT > 12) removeEnt(u); return; }
  if (u.cd > 0) u.cd -= dt;
  if (u.recharge > 0) u.recharge -= dt;
  if (d.regen && u.hp < u.maxhp) u.hp = Math.min(u.maxhp, u.hp + dt * d.regen * 0.5);
  if (d.animal && u.owner === 0 || u.type === 'sheep') { animalAI(u, dt); if (u.type !== 'sheep' || !u.order) return; }
  const o = u.order;
  if (!o) {
    u.anim = u.anim === 'walk' || u.anim === 'attack' || u.anim === 'work' ? 'idle' : u.anim;
    u.idleT += dt;
    // auto behaviours
    u.scanT = (u.scanT || 0) - dt;
    if (u.scanT <= 0) {
      u.scanT = 0.5 + Math.random() * 0.3;
      if (u.type === 'monk') autoMonk(u);
      else if (d.atk > 0 && u.type !== 'villager' && !d.animal) {
        const t = findTargetFor(u, d.los + (d.range ? 1 : 0));
        if (t) setOrder(u, { t: 'attack', id: t.id, auto: true, ox: u.x, oy: u.y });
      }
    }
    separate(u, dt);
    return;
  }
  u.idleT = 0;
  switch (o.t) {
    case 'move': {
      if (followPath(u, dt)) setOrder(u, null);
      break;
    }
    case 'attackmove': {
      u.scanT = (u.scanT || 0) - dt;
      if (u.scanT <= 0) { u.scanT = 0.5; const t = findTargetFor(u, d.los + 1); if (t) { u.order = { t: 'attack', id: t.id, then: { t: 'attackmove', x: o.x, y: o.y } }; u.path = null; break; } }
      if (!u.path) moveToPoint(u, o.x, o.y);
      if (followPath(u, dt)) setOrder(u, null);
      break;
    }
    case 'moveto': case 'follow': {
      const t = ent(o.id); if (!t || t.dead || (t.kind === 'unit' && t.inside)) { setOrder(u, null); break; }
      if (distTo(u, t) > (o.t === 'follow' ? 2 : 1)) { u.repathT = (u.repathT || 0) - dt; if (!u.path || u.repathT <= 0) { u.repathT = 1; pathTo(u, rectOf(t), 1); } followPath(u, dt); }
      else { u.anim = 'idle'; u.path = null; if (o.t === 'moveto') setOrder(u, null); }
      break;
    }
    case 'attack': {
      const t = ent(o.id);
      if (!t || t.dead || t.dying || (t.kind === 'unit' && t.inside) || !canAttack(u, t) || (t.kind === 'unit' && t.owner !== 0 && !isEnemy(u.owner, t.owner) && t.owner !== u.owner && t.type !== 'sheep') ) {
        const then = o.then; setOrder(u, null);
        if (u.type === 'villager' && t && t.dead && o.hunt) break;
        if (then) setOrder(u, then);
        else if (o.auto && !d.animal) { const nt = findTargetFor(u, d.los + 1); if (nt) setOrder(u, { t: 'attack', id: nt.id, auto: true, ox: o.ox, oy: o.oy }); else if (o.ox !== undefined && Math.hypot(u.x - o.ox, u.y - o.oy) > 3 && u.owner !== W.humanId) setOrder(u, { t: 'move', x: o.ox, y: o.oy }); }
        break;
      }
      // leash for auto-acquired targets
      if (o.auto && o.ox !== undefined && Math.hypot(u.x - o.ox, u.y - o.oy) > d.los + 8) { setOrder(u, { t: 'move', x: o.ox, y: o.oy }); break; }
      doAttack(u, t, dt);
      break;
    }
    case 'hunt': {
      const t = ent(o.id);
      if (!t || t.dead) {
        // find the carcass
        const c = W.list.find(e => e.kind === 'res' && e.type === 'carcass' && Math.hypot(e.x + 0.5 - u.x, e.y + 0.5 - u.y) < 5);
        if (c) setOrder(u, { t: 'gather', id: c.id }); else setOrder(u, null);
        break;
      }
      if (t.kind === 'res') { setOrder(u, { t: 'gather', id: t.id }); break; }
      if (t.type === 'sheep' && t.owner !== u.owner && t.owner !== 0) { setOrder(u, null); break; }
      u.work = { kind: 'hunt' };
      doAttackAnimal(u, t, dt);
      if (t.dead) { const c = W.list.find(e => e.kind === 'res' && e.type === 'carcass' && Math.abs(e.x - (t.x | 0)) <= 1 && Math.abs(e.y - (t.y | 0)) <= 1); if (c) setOrder(u, { t: 'gather', id: c.id }); }
      break;
    }
    case 'gather': case 'farm': gatherLogic(u, dt); break;
    case 'dropoff': {
      const b = ent(o.id); if (!b) { setOrder(u, null); break; }
      if (distTo(u, b) > 1.1) { if (!u.path) moveNear(u, b, 1); followPath(u, dt); if (!u.path || u.pi >= u.path.length) { if (distTo(u, b) > 1.6) { setOrder(u, null); } } }
      else { deposit(u); const prev = o.prev; setOrder(u, prev || null); }
      break;
    }
    case 'build': buildLogic(u, dt); break;
    case 'repair': repairLogic(u, dt); break;
    case 'garrison': {
      const b = ent(o.id); if (!b || b.dead || !canGarrisonIn(u, b)) { setOrder(u, null); if (o.bell) u.bellWait = true; break; }
      if (distTo(u, b) > 1.2) { if (!u.path) moveNear(u, b, 1); if (followPath(u, dt) && distTo(u, b) > 1.8) { u.gtries = (u.gtries || 0) + 1; u.path = null; if (u.gtries > 3) { setOrder(u, null); if (o.bell) u.bellWait = true; } } }
      else {
        if (b.garrison.length >= garrisonCap(b)) { setOrder(u, null); if (o.bell) u.bellWait = true; if (u.owner === W.humanId && !o.bell) msg('That building is full.', '#fc8'); break; }
        garrisonUnit(u, b);
      }
      break;
    }
    case 'board': {
      const s = ent(o.id); if (!s || s.dead) { setOrder(u, null); break; }
      const cap = UNITS.transport.cap + W.players[s.owner].transportCap;
      if (s.cargo.length >= cap) { setOrder(u, null); break; }
      if (Math.hypot(s.x - u.x, s.y - u.y) <= 2.3) { boardUnit(u, s); break; }
      u.repathT = (u.repathT || 0) - dt;
      if (!u.path || u.repathT <= 0) { u.repathT = 1.2; pathTo(u, rectOf(s), 1); }
      if (followPath(u, dt)) { u.path = null; u.btries = (u.btries || 0) + 1; if (u.btries > 6) { u.btries = 0; setOrder(u, null); } }
      break;
    }
    case 'unload': transportUnload(u, dt); break;
    case 'heal': {
      const t = ent(o.id); if (!t || t.dead || t.dying || t.inside || t.hp >= t.maxhp || !isFriend(u.owner, t.owner)) { setOrder(u, null); break; }
      if (distTo(u, t) > 4) { u.repathT = (u.repathT || 0) - dt; if (!u.path || u.repathT <= 0) { u.repathT = 1; pathTo(u, rectOf(t), 3); } followPath(u, dt); }
      else { u.path = null; faceTo(u, t); u.anim = 'work'; u.work = { kind: 'heal', tgt: t.id }; t.hp = Math.min(t.maxhp, t.hp + dt * 2); if (Math.random() < dt * 4) emitFx('heal', t.x, t.y, 1); }
      break;
    }
    case 'convert': convertLogic(u, dt); break;
    case 'relic': {
      const r = ent(o.id); if (!r || r.carrier || r.inBld) { setOrder(u, null); break; }
      if (u.relic) { setOrder(u, null); break; }
      if (distTo(u, r) > 0.9) { if (!u.path) moveNear(u, r, 1); if (followPath(u, dt) && distTo(u, r) > 1.5) { setOrder(u, null); } }
      else {
        u.relic = r.id; r.carrier = u.id; Sound.play('relic', u.x, u.y);
        if (u.owner === W.humanId) msg('Relic collected! Bring it to a Monastery.', '#ffd76a');
        const m = nearestOwn(u, 'monastery'); setOrder(u, m ? { t: 'deposit', id: m.id } : null);
      }
      break;
    }
    case 'deposit': {
      const m = ent(o.id); if (!m || m.dead || !u.relic) { setOrder(u, null); break; }
      if (distTo(u, m) > 1.2) { if (!u.path) moveNear(u, m, 1); if (followPath(u, dt) && distTo(u, m) > 1.8) setOrder(u, null); }
      else { const r = ent(u.relic); if (r) { r.carrier = 0; r.inBld = m.id; m.relics.push(r.id); } u.relic = 0; Sound.play('relic', u.x, u.y); if (u.owner === W.humanId) msg('Relic stored in the Monastery: +1 gold every 2 seconds.', '#ffd76a'); setOrder(u, null); }
      break;
    }
    case 'trade': tradeLogic(u, dt); break;
    default: setOrder(u, null);
  }
  if (u.order && u.anim !== 'walk') separate(u, dt);
}
function doAttackAnimal(u, t, dt) {
  const dist = distTo(u, t);
  const reach = t.type === 'sheep' ? 0.4 : 3.5;
  if (dist > reach) { u.repathT = (u.repathT || 0) - dt; if (!u.path || u.repathT <= 0) { u.repathT = 0.7; pathTo(u, rectOf(t), t.type === 'sheep' ? 0 : 2); } followPath(u, dt); return; }
  u.path = null; faceTo(u, t); u.anim = 'attack';
  if (u.cd > 0) return;
  u.cd = 1.6; u.atkT = W.t;
  const dmg = computeDamage(u, t);
  if (t.type === 'sheep') { applyDamage(t, dmg + 3, u); Sound.play('sword', u.x, u.y); }
  else { fireProjectile(u, t, 'javelin', null, { dmgVal: dmg + 2 }); Sound.play('bow', u.x, u.y); }
}
function separate(u, dt) {
  const r = UNIT_R(u), naval = !!UNITS[u.type].naval;
  const near = unitsNear(u.x, u.y, r + 0.9);
  for (const o of near) {
    if (o === u || !!UNITS[o.type].naval !== naval) continue;
    const dx = u.x - o.x, dy = u.y - o.y, dd = Math.hypot(dx, dy), min = r + UNIT_R(o);
    if (dd < min && dd > 0.0001) {
      const push = (min - dd) * 0.5 * Math.min(1, dt * 6);
      const nx = u.x + dx / dd * push, ny = u.y + dy / dd * push;
      if (tilePassFor(u, nx, ny)) { u.x = nx; u.y = ny; }
    } else if (dd <= 0.0001) { u.x += (Math.random() - 0.5) * 0.05; u.y += (Math.random() - 0.5) * 0.05; }
  }
}

// ---------- economy logic ----------
function resKind(e) { if (e.kind === 'bld') return 'food'; return { tree: 'wood', gold: 'gold', stone: 'stone', berry: 'food', fish: 'food', carcass: 'food' }[e.type]; }
function workKind(e) { if (e.kind === 'bld') return 'farm'; return { tree: 'chop', gold: 'mine', stone: 'mine', berry: 'forage', fish: 'fish', carcass: 'butcher' }[e.type]; }
function gatherRate(u, e) {
  const p = W.players[u.owner];
  let r = { tree: 0.52, gold: 0.5, stone: 0.46, berry: 0.44, fish: 0.56, carcass: 0.52 }[e.type] || 0.42;
  if (e.kind === 'bld') r = 0.46 * p.gather.farm;
  const k = resKind(e); if (e.kind !== 'bld') r *= e.type === 'fish' ? p.gather.fish : p.gather[k] || 1;
  if (u.type === 'fishingship' && p.civ === 'japanese') r *= 1.05;
  if (p.ai) r *= p.ai.gatherMul;
  return r;
}
function carryCap(u) { const p = W.players[u.owner]; return u.type === 'fishingship' ? 15 : p.carry; }
function gatherLogic(u, dt) {
  const o = u.order;
  const e = ent(o.id);
  const cap = carryCap(u);
  const naval = !!UNITS[u.type].naval;
  if (!e || e.dead || (e.kind === 'res' && e.amount <= 0) || (e.kind === 'bld' && (!e.built || (e.farmer && e.farmer !== u.id)))) {
    // find replacement of same kind
    const type = o.rtype || (e ? e.type : null);
    const prevKind = o.res;
    let next = null;
    if (o.t === 'farm' || type === 'farm') {
      next = W.list.find(b => b.kind === 'bld' && b.type === 'farm' && b.owner === u.owner && b.built && !b.farmer && Math.hypot(b.x + 1.5 - u.x, b.y + 1.5 - u.y) < 12);
      if (next) { setOrder(u, { t: 'farm', id: next.id }); return; }
    } else if (type) {
      const types = type === 'carcass' || type === 'berry' ? ['carcass', 'berry'] : type === 'gold' || type === 'stone' ? [type] : [type];
      next = findNearestRes(u, types, u.x, u.y, 12);
      if (!next && type === 'carcass') { const sheep = W.list.find(s => s.kind === 'unit' && s.type === 'sheep' && s.owner === u.owner && !s.dying && Math.hypot(s.x - u.x, s.y - u.y) < 14); if (sheep) { setOrder(u, { t: 'hunt', id: sheep.id }); return; } }
    }
    if (next) { setOrder(u, { t: 'gather', id: next.id, rtype: next.type }); return; }
    if (u.carry && u.carry.amt > 0) { const dsite = nearestDrop(u, u.carry.res); if (dsite) { setOrder(u, { t: 'dropoff', id: dsite.id }); return; } }
    setOrder(u, null); return;
  }
  o.rtype = e.kind === 'bld' ? 'farm' : e.type;
  const res = resKind(e);
  if (u.carry && u.carry.res !== res && u.carry.amt > 0) u.carry = null;
  // returning
  if (u.phase === 1) {
    const dsite = ent(u.dropId) && !ent(u.dropId).dead ? ent(u.dropId) : nearestDrop(u, res);
    if (!dsite) { u.phase = 0; u.anim = 'idle'; if (u.owner === W.humanId && W.t - (u.noDropMsg || -99) > 20) { u.noDropMsg = W.t; msg('No drop-off site available!', '#fc8'); } setOrder(u, null); return; }
    u.dropId = dsite.id;
    if (distTo(u, dsite) <= (naval ? 1.6 : 1.1)) { deposit(u); u.phase = 0; u.path = null; u.dropId = 0; return; }
    if (!u.path || u.pi >= u.path.length) { moveNear(u, dsite, 1); if (!u.path.length && distTo(u, dsite) > 2) { u.dropFail = (u.dropFail || 0) + 1; if (u.dropFail > 3) { u.dropFail = 0; setOrder(u, null); } } }
    followPath(u, dt);
    return;
  }
  // going to resource
  const isFarm = e.kind === 'bld';
  const reach = isFarm ? 0.01 : naval ? 1.5 : 1.0;
  const dist = isFarm ? (u.x >= e.x && u.x <= e.x + 3 && u.y >= e.y && u.y <= e.y + 3 ? 0 : 1) : distTo(u, e);
  if (dist > reach) {
    if (isFarm && !e.farmer) e.farmer = u.id;
    if (!u.path || u.pi >= u.path.length) {
      if (isFarm) moveToPoint(u, e.x + 1.5, e.y + 1.5);
      else { pathTo(u, rectOf(e), 1); if (!u.pathOk && u.path.length === 0) { u.gfail = (u.gfail || 0) + 1; if (u.gfail > 3) { u.gfail = 0; e.gatherers += 3; o.id = -1; } } }
    }
    followPath(u, dt);
    return;
  }
  // working
  u.path = null;
  if (isFarm) { e.farmer = u.id; const fx = e.x + 0.4 + ((W.t * 0.25 + u.id) % 2.2), fy = e.y + 1.5 + Math.sin(W.t * 0.3 + u.id) * 0.8; const tx = Math.max(e.x + 0.3, Math.min(e.x + 2.7, fx)); u.x += (tx - u.x) * Math.min(1, dt * 0.8); u.y += (fy - u.y) * Math.min(1, dt * 0.8); setFacing(u, 1, -1); }
  else faceTo(u, e);
  if (!u.work || u.work.id !== e.id) { u.work = { id: e.id, kind: workKind(e), farm: isFarm ? e.id : 0 }; if (!isFarm) e.gatherers++; u.workStart = W.t; }
  u.anim = 'work';
  if (e.type === 'tree' && !e.felled && W.t - u.workStart > 1.2) { e.felled = true; e.fallDir = u.face; Sound.play('treefall', e.x, e.y); }
  if (!u.carry || u.carry.res !== res) u.carry = { res, amt: 0 };
  const rate = gatherRate(u, e) * dt;
  const avail = isFarm ? e.food : e.amount;
  const take = Math.min(rate, avail, cap - u.carry.amt);
  u.carry.amt += take;
  if (isFarm) e.food -= take; else e.amount -= take;
  // work sound & particles in rhythm
  u.workBeat = (u.workBeat || 0) + dt;
  const beat = { chop: 0.9, mine: 1.0, forage: 1.2, farm: 1.4, butcher: 0.9, fish: 2.0 }[u.work.kind] || 1;
  if (u.workBeat >= beat) {
    u.workBeat = 0;
    const c = center(e);
    Sound.play({ chop: 'chop', mine: 'mine', forage: 'forage', farm: 'farm', butcher: 'butcher', fish: 'fishsplash' }[u.work.kind], c.x, c.y);
    emitFx({ chop: 'chips', mine: e.type === 'gold' ? 'goldspark' : 'stonespark', forage: 'leaves', farm: 'dirt', butcher: 'blood', fish: 'splash' }[u.work.kind], c.x, c.y, 2);
  }
  if (isFarm ? e.food <= 0 : e.amount <= 0) {
    if (isFarm) {
      const p = W.players[u.owner]; const c = effCost(p, 'farm');
      if (canPay(p, c)) { pay(p, c); e.food = p.farmFood; if (u.owner === W.humanId) msg('Farm reseeded (−' + c.wood + ' wood).', '#cfc'); }
      else { e.farmer = 0; killEnt(e, null); }
    } else if (e.type !== 'fish' || true) {
      if (e.type === 'tree') W.decals.push({ type: 'stump', x: e.x, y: e.y, t: W.t, dur: 1e9, v: e.v });
      e.gatherers = Math.max(0, e.gatherers - 1); removeEnt(e);
    }
  }
  if (u.carry.amt >= cap - 0.001 || (e.dead && u.carry.amt > 0)) {
    u.phase = 1; u.path = null; u.anim = 'walk';
    if (!isFarm && !e.dead) { e.gatherers = Math.max(0, e.gatherers - 1); u.work = null; }
  }
}
function deposit(u) {
  if (!u.carry || u.carry.amt <= 0) return;
  const p = W.players[u.owner];
  const a = u.carry.amt; p.res[u.carry.res] += a; p.stats.gathered += a;
  u.carry.amt = 0;
  if (u.owner === W.humanId && Math.random() < 0.3) Sound.play('deposit', u.x, u.y);
}
function buildLogic(u, dt) {
  const b = ent(u.order.id);
  if (!b || b.dead) { setOrder(u, null); return; }
  if (b.built) { afterBuild(u, b); return; }
  if (distTo(u, b) > 1.1) {
    if (!u.path || u.pi >= u.path.length) { pathTo(u, rectOf(b), 1); if (!u.pathOk && distTo(u, b) > 2.5) { u.bfail = (u.bfail || 0) + 1; if (u.bfail > 4) { u.bfail = 0; setOrder(u, null); return; } } }
    followPath(u, dt); return;
  }
  u.path = null; faceTo(u, b);
  if (!u.work || u.work.kind !== 'build') { u.work = { kind: 'build' }; b.builders++; }
  // push units out of the foundation on first progress
  if (b.progress === 0) clearFoundation(b);
  u.anim = 'work';
  const p = W.players[u.owner];
  const inst = W.instantFor(p);
  const rate = dt / BUILDINGS[b.type].time * p.buildSpeed * (p.ai ? p.ai.gatherMul : 1) * 1.6 / (1 + (b.builders - 1) * 0.35);
  const add = inst ? 1 : rate;
  b.progress = Math.min(1, b.progress + add);
  b.hp = Math.min(b.maxhp, b.hp + add * b.maxhp);
  u.workBeat = (u.workBeat || 0) + dt;
  if (u.workBeat > 0.55) { u.workBeat = 0; const c = center(b); Sound.play('hammer', c.x, c.y); emitFx('dust', c.x + (Math.random() - 0.5), c.y + (Math.random() - 0.5), 1); }
  if (b.progress >= 1) completeBuilding(b);
}
function clearFoundation(b) {
  const r = rectOf(b);
  for (const o of unitsNear(r.x0 + (r.x1 - r.x0) / 2 + 0.5, r.y0 + (r.y1 - r.y0) / 2 + 0.5, 4)) {
    if (UNITS[o.type].naval) continue;
    if (o.x >= r.x0 && o.x < r.x1 + 1 && o.y >= r.y0 && o.y < r.y1 + 1) { const t = freeTileNear(b, false, o.x, o.y); if (t) { o.x = t.x; o.y = t.y; o.path = null; } }
  }
}
function completeBuilding(b) {
  if (b.built) return;
  b.built = true; b.progress = 1; b.hp = b.maxhp;
  const p = W.players[b.owner];
  p.stats.built++;
  if (BUILDINGS[b.type].farm) b.food = p.farmFood;
  if (b.owner === W.humanId) Sound.play('built', b.x, b.y);
  recalcPop();
  if (p.ai) p.ai.onBuilt(b);
}
function afterBuild(u, b) {
  const t = b.type;
  if (b.owner !== u.owner) { setOrder(u, null); return; }
  // find other foundation nearby
  const other = W.list.find(e => e.kind === 'bld' && e.owner === u.owner && !e.built && Math.hypot(e.x - u.x, e.y - u.y) < 10 && BUILDINGS[e.type].wall && BUILDINGS[t].wall);
  if (other) { setOrder(u, { t: 'build', id: other.id }); return; }
  if (t === 'farm' && !b.farmer) { setOrder(u, { t: 'farm', id: b.id }); return; }
  const want = t === 'lumbercamp' ? ['tree'] : t === 'miningcamp' ? ['gold', 'stone'] : t === 'mill' ? ['berry'] : null;
  if (want) { const r = findNearestRes(u, want, b.x + 1, b.y + 1, 10); if (r) { setOrder(u, { t: 'gather', id: r.id }); return; } }
  if (u.prevAfterBuild) { const o = u.prevAfterBuild; u.prevAfterBuild = null; setOrder(u, o); return; }
  setOrder(u, null);
}
function repairLogic(u, dt) {
  const t = ent(u.order.id);
  if (!t || t.dead || t.hp >= t.maxhp || (t.kind === 'bld' && !t.built)) { setOrder(u, null); return; }
  if (distTo(u, t) > 1.1) { u.repathT = (u.repathT || 0) - dt; if (!u.path || u.repathT <= 0) { u.repathT = 1; pathTo(u, rectOf(t), 1); } followPath(u, dt); return; }
  u.path = null; faceTo(u, t); u.anim = 'work'; u.work = { kind: 'repair' };
  const p = W.players[u.owner];
  const baseCost = t.kind === 'bld' ? BUILDINGS[t.type].cost : UNITS[t.type].cost;
  const hpRate = (t.kind === 'bld' ? t.maxhp / BUILDINGS[t.type].time * 0.75 : t.maxhp / 40) * dt;
  const cost = {}; for (const r in baseCost) cost[r] = baseCost[r] * 0.5 * hpRate / t.maxhp;
  if (!canPay(p, cost)) { if (u.owner === W.humanId) msg('Not enough resources to repair.', '#fc8'); setOrder(u, null); return; }
  pay(p, cost); t.hp = Math.min(t.maxhp, t.hp + hpRate);
  u.workBeat = (u.workBeat || 0) + dt;
  if (u.workBeat > 0.6) { u.workBeat = 0; const c = center(t); Sound.play('hammer', c.x, c.y); emitFx('repair', c.x, c.y, 1); }
}
function convertLogic(u, dt) {
  const t = ent(u.order.id);
  if (!t || t.dead || t.dying || t.inside || t.owner === u.owner || isFriend(u.owner, t.owner) || t.owner === 0 || (t.kind === 'bld') || t.type === 'cobra') { setOrder(u, null); u.convT = 0; return; }
  if (u.recharge > 0) { u.anim = 'idle'; if (distTo(u, t) < 9) { u.path = null; return; } }
  if (distTo(u, t) > 9) { u.repathT = (u.repathT || 0) - dt; if (!u.path || u.repathT <= 0) { u.repathT = 1; pathTo(u, rectOf(t), 8); } followPath(u, dt); u.convT = 0; return; }
  if (u.recharge > 0) return;
  u.path = null; faceTo(u, t); u.anim = 'work'; u.work = { kind: 'convert', tgt: t.id };
  if (u.convT === 0) Sound.chant(u);
  u.convT += dt;
  if (Math.random() < dt * 5) emitFx('convert', t.x, t.y, 1);
  let chance = 0;
  if (u.convT > 4) chance = dt * 0.28;
  if (hasTag(t.type, 'mounted')) chance *= 0.6;
  if (Math.random() < chance || u.convT > 10) {
    const old = t.owner;
    t.owner = u.owner; setOrder(t, null);
    if (t.cargo) for (const c of t.cargo) { const cu = ent(c); if (cu) cu.owner = u.owner; }
    recalcPop();
    emitFx('convert', t.x, t.y, 12); Sound.play('converted', t.x, t.y);
    if (u.owner === W.humanId) msg(`Converted an enemy ${UNITS[t.type].name}!`, '#dfb');
    if (old === W.humanId) msg(`Your ${UNITS[t.type].name} was converted!`, '#f99');
    W.players[u.owner].stats.kills++;
    u.recharge = 30 * W.players[u.owner].monkRecharge; u.convT = 0; setOrder(u, null);
  }
}
function autoMonk(u) {
  if (u.relic) { const m = nearestOwn(u, 'monastery'); if (m) setOrder(u, { t: 'deposit', id: m.id }); return; }
  let best = null, bd = 7;
  for (const t of unitsNear(u.x, u.y, 7, t => t.hp < t.maxhp && !t.dying && isFriend(u.owner, t.owner) && t !== u && !hasTag(t.type, 'machine') && !UNITS[t.type].animal)) { const d = Math.hypot(t.x - u.x, t.y - u.y); if (d < bd) { bd = d; best = t; } }
  if (best) setOrder(u, { t: 'heal', id: best.id });
}
function garrisonUnit(u, b) {
  u.inside = b.id; b.garrison.push(u.id); u.path = null; u.order = null; u.anim = 'idle';
  if (u.owner === W.humanId && UI.selection.includes(u)) UI.deselect(u);
  Sound.play('garrison', u.x, u.y);
}
function ejectUnit(u, b, toX, toY) {
  const naval = false;
  const spot = freeTileNear(b, naval, toX, toY) || nearestLandTile(b.x, b.y) || { x: b.x, y: b.y };
  u.x = spot.x + (spot.x % 1 ? 0 : 0.5); u.y = spot.y + (spot.y % 1 ? 0 : 0.5);
  u.inside = 0;
}
function ungarrisonAll(b) {
  const ids = b.garrison.slice(); b.garrison = [];
  for (const id of ids) { const u = ent(id); if (!u) continue; ejectUnit(u, b, b.rally ? b.rally.x : undefined, b.rally ? b.rally.y : undefined); if (b.rally) setOrder(u, { t: 'move', x: b.rally.x, y: b.rally.y }); }
  if (ids.length) Sound.play('garrison', b.x, b.y);
  return ids;
}
function ungarrisonOne(b, id) {
  const i = b.garrison.indexOf(id); if (i < 0) return;
  b.garrison.splice(i, 1); const u = ent(id); if (u) ejectUnit(u, b);
}
// Town Bell
function ringBell(p) {
  if (p.bell) return;
  p.bell = true;
  const tcs = W.list.filter(e => e.kind === 'bld' && e.owner === p.id && e.built && BUILDINGS[e.type].garrison);
  const load = new Map(tcs.map(b => [b.id, b.garrison.length]));
  for (const u of W.list) {
    if (u.kind !== 'unit' || u.owner !== p.id || u.type !== 'villager' || u.inside || u.dying) continue;
    let best = null, bd = 30;
    for (const b of tcs) { if (!canGarrisonIn(u, b) || load.get(b.id) >= garrisonCap(b)) continue; const d = distTo(u, b); if (d < bd) { bd = d; best = b; } }
    u.bellPrev = u.order ? Object.assign({}, u.order) : null;
    u.bellCarry = u.carry ? Object.assign({}, u.carry) : null;
    u.bellRung = true;
    if (best) { load.set(best.id, load.get(best.id) + 1); setOrder(u, { t: 'garrison', id: best.id, bell: true }); }
    else { u.bellWait = true; const tc = tcs[0]; if (tc) { const c = center(tc); setOrder(u, { t: 'move', x: c.x + (Math.random() - 0.5) * 3, y: c.y + 3 }); } }
  }
  if (p.id === W.humanId) { msg('Town Bell rung! Villagers take shelter.', '#fd8'); }
  Sound.bell();
}
function allClear(p) {
  if (!p.bell) return;
  p.bell = false;
  for (const b of W.list) {
    if (b.kind !== 'bld' || b.owner !== p.id || !b.garrison.length) continue;
    const vills = b.garrison.filter(id => { const u = ent(id); return u && u.bellRung; });
    for (const id of vills) ungarrisonOne(b, id);
  }
  for (const u of W.list) {
    if (u.kind !== 'unit' || u.owner !== p.id || !u.bellRung) continue;
    u.bellRung = false; u.bellWait = false;
    const prev = u.bellPrev; u.bellPrev = null;
    if (u.bellCarry) u.carry = u.bellCarry;
    if (prev && prev.id && !ent(prev.id)) { setOrder(u, null); continue; }
    if (prev && prev.t !== 'garrison') setOrder(u, prev); else setOrder(u, null);
  }
  if (p.id === W.humanId) msg('All clear — villagers return to work.', '#cfc');
}
// Transport
function boardUnit(u, s) {
  u.inside = s.id; s.cargo.push(u.id); u.path = null; u.order = null;
  if (u.owner === W.humanId && UI.selection.includes(u)) UI.deselect(u);
  Sound.play('garrison', s.x, s.y);
}
function transportUnload(s, dt) {
  const o = s.order;
  if (!s.cargo.length) { setOrder(s, null); return; }
  if (!o.wx) {
    // find water tile adjacent to land near target
    const map = W.map; let best = null, bd = 1e9;
    const tgtReg = map.landReg[map.idx(Math.max(0, Math.min(W.n - 1, o.x | 0)), Math.max(0, Math.min(W.n - 1, o.y | 0)))];
    for (let y = (o.y | 0) - 14; y <= (o.y | 0) + 14; y++) for (let x = (o.x | 0) - 14; x <= (o.x | 0) + 14; x++) {
      if (!map.inb(x, y) || !isWaterT(map.ter[map.idx(x, y)]) || map.blk[map.idx(x, y)]) continue;
      if (map.waterReg[map.idx(x, y)] !== map.waterReg[map.idx(s.x | 0, s.y | 0)]) continue;
      let adj = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (map.inb(xx, yy) && !isWaterT(map.ter[map.idx(xx, yy)]) && !map.blk[map.idx(xx, yy)] && (map.landReg[map.idx(xx, yy)] === tgtReg || isWaterT(map.ter[map.idx(o.x | 0, o.y | 0)]))) adj = true; }
      if (!adj) continue;
      const d = Math.hypot(x - o.x, y - o.y); if (d < bd) { bd = d; best = { x: x + 0.5, y: y + 0.5 }; }
    }
    if (!best) { if (s.owner === W.humanId) msg('No valid landing beach there.', '#fc8'); setOrder(s, null); return; }
    o.wx = best.x; o.wy = best.y; moveToPoint(s, best.x, best.y);
  }
  if (Math.hypot(s.x - o.wx, s.y - o.wy) > 0.6) { if (followPath(s, dt)) { if (Math.hypot(s.x - o.wx, s.y - o.wy) > 1.6) { o.tries = (o.tries || 0) + 1; if (o.tries > 3) { setOrder(s, null); return; } moveToPoint(s, o.wx, o.wy); } } return; }
  // unload
  const ids = s.cargo.slice(); s.cargo = [];
  let k = 0;
  for (const id of ids) {
    const u = ent(id); if (!u) continue;
    const t = nearestLandTile(s.x | 0, s.y | 0, true);
    if (!t) { s.cargo.push(id); continue; }
    u.inside = 0; u.x = t.x + 0.5 + ((k % 3) - 1) * 0.3; u.y = t.y + 0.5 + (((k / 3) | 0) - 1) * 0.3; k++;
    if (!tilePassFor(u, u.x, u.y)) { u.x = t.x + 0.5; u.y = t.y + 0.5; }
    const land = !isWaterT(W.map.ter[W.map.idx(Math.max(0, o.x | 0), Math.max(0, o.y | 0))]);
    if (o.then) setOrder(u, Object.assign({}, o.then)); else if (land) setOrder(u, { t: 'move', x: o.x + (Math.random() - 0.5) * 2, y: o.y + (Math.random() - 0.5) * 2 });
  }
  Sound.play('garrison', s.x, s.y);
  setOrder(s, null);
}
// Trade
function tradeLogic(u, dt) {
  const o = u.order;
  const btype = u.type === 'tradecart' ? 'market' : 'dock';
  const valid = b => b && !b.dead && b.built && b.type === btype && isFriend(b.owner, u.owner);
  let dest = ent(o.dest), home = ent(o.home);
  if (!valid(home)) { home = nearestOwn(u, btype, o.dest); if (home) o.home = home.id; }
  if (!valid(dest)) {
    // pick another friendly market to trade with
    let best = null, bd = 0;
    for (const e of W.list) if (valid(e) && e.id !== o.home) { const c = center(e); const d = Math.hypot(c.x - u.x, c.y - u.y); if (d > bd) { bd = d; best = e; } }
    if (!best || !home) { if (u.owner === W.humanId) msg('Trade route lost: no friendly destination.', '#fc8'); setOrder(u, null); return; }
    o.dest = best.id; dest = best; u.path = null;
  }
  if (distTo(u, dest) > (UNITS[u.type].naval ? 1.6 : 1.1)) {
    if (!u.path || u.pi >= u.path.length) { pathTo(u, rectOf(dest), 1); if (!u.pathOk && !u.path.length) { u.tfail = (u.tfail || 0) + 1; if (u.tfail > 3) { if (u.owner === W.humanId) msg('Trade route unreachable.', '#fc8'); setOrder(u, null); } } }
    followPath(u, dt); u.tradeCarry = !!u.tradeGold;
    return;
  }
  // arrived
  if (u.tradeGold && u.tradeFrom !== dest.id) {
    const p = W.players[u.owner]; p.res.gold += u.tradeGold; p.stats.tradeGold += u.tradeGold;
    emitFx('coins', u.x, u.y, 4); Sound.play('coins', u.x, u.y);
  }
  const hc = center(home || dest), dc = center(dest);
  const dist = Math.hypot(hc.x - dc.x, hc.y - dc.y);
  u.tradeGold = Math.round((dist * dist / 70 + dist * 0.3) * W.players[u.owner].tradeMul * (dest.owner !== u.owner ? 1.25 : 1));
  u.tradeFrom = dest.id;
  const nh = dest.id; o.dest = home ? home.id : o.home; o.home = nh; u.path = null;
}

// ---------- animals & sheep ----------
function fleeFrom(a, src) {
  const ax = a.x - src.x, ay = a.y - src.y, l = Math.hypot(ax, ay) || 1;
  a.fleeT = 3;
  a.order = null;
  const tx = a.x + ax / l * 4, ty = a.y + ay / l * 4;
  moveToPoint(a, tx, ty);
}
function animalAI(u, dt) {
  const d = UNITS[u.type];
  u.aiT = (u.aiT || 0) - dt;
  if (u.type === 'sheep') {
    u.capT = (u.capT || 0) - dt;
    if (u.capT <= 0) { u.capT = 0.5; sheepCapture(u); }
    if (!u.order) { if (u.path && u.pi < u.path.length) followPath(u, dt); else { u.anim = 'idle'; if (u.aiT <= 0) { u.aiT = 4 + Math.random() * 6; if (Math.random() < 0.4) { const nx = u.x + (Math.random() - 0.5) * 1.5, ny = u.y + (Math.random() - 0.5) * 1.5; if (tilePassFor(u, nx, ny)) moveToPoint(u, nx, ny); } } } separate(u, dt); }
    return;
  }
  if (u.order && u.order.t === 'attack') {
    const t = ent(u.order.id);
    if (!t || t.dead || t.dying || t.inside || Math.hypot(t.x - u.x, t.y - u.y) > 14) { setOrder(u, null); }
    else { doAttack(u, t, dt); return; }
  }
  if (d.prey) {
    if (u.fleeT > 0) { u.fleeT -= dt; if (followPath(u, dt)) u.fleeT = 0; return; }
    if (u.aiT <= 0) {
      u.aiT = 0.6;
      const threat = unitsNear(u.x, u.y, 2.5, o => o.owner > 0 && !UNITS[o.type].animal && o.type !== 'sheep');
      if (threat.length && !u.hunted) { fleeFrom(u, threat[0]); u.hunted = true; return; }
    }
  }
  if (d.predator && u.aiT <= 0) {
    u.aiT = 1;
    const prey = unitsNear(u.x, u.y, d.los, o => o.owner > 0 && !UNITS[o.type].naval && !o.inside && !o.dying && o.type !== 'cobra');
    if (prey.length) { prey.sort((a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y)); setOrder(u, { t: 'attack', id: prey[0].id }); return; }
  }
  // wander
  if (u.path && u.pi < u.path.length) { followPath(u, dt); return; }
  u.anim = 'idle';
  if (u.aiT <= 0) {
    u.aiT = 3 + Math.random() * 8;
    if (Math.random() < 0.5) {
      const hx = u.homeX || u.x, hy = u.homeY || u.y;
      const nx = hx + (Math.random() - 0.5) * 8, ny = hy + (Math.random() - 0.5) * 8;
      if (tilePassFor(u, nx, ny)) moveToPoint(u, nx, ny);
    }
  }
}
// Sheep proximity/guarding rule (see help): capture radius 4 tiles; owner's presence guards; single rival needs 1.5s.
function sheepCapture(s) {
  const near = unitsNear(s.x, s.y, 4, o => o.owner > 0 && !UNITS[o.type].animal && !UNITS[o.type].naval && !o.dying);
  const owners = new Set(near.map(o => o.owner));
  if (s.owner === 0) {
    if (owners.size === 1) { s.owner = [...owners][0]; s.capturedT = W.t; if (s.owner === W.humanId) { Sound.play('bleat', s.x, s.y); } }
    s.contest = 0; return;
  }
  if (owners.has(s.owner) || owners.size !== 1) { s.contest = 0; s.contestBy = 0; return; }
  const rival = [...owners][0];
  if (s.contestBy !== rival) { s.contestBy = rival; s.contest = 0; }
  s.contest += 0.5;
  if (s.contest >= 1.5) {
    const old = s.owner; s.owner = rival; s.contest = 0; s.contestBy = 0; s.capturedT = W.t; setOrder(s, null);
    if (rival === W.humanId) { msg('You captured a sheep!', '#dfd'); Sound.play('bleat', s.x, s.y); }
    else if (old === W.humanId) msg('An enemy stole one of your sheep!', '#f99');
  }
}

// ---------- visibility ----------
function updateVisibility(force) {
  const n = W.n;
  const human = W.players[W.humanId];
  const s = W.settings;
  const reveal = s.fog === 'none' || W.noFog;
  const vis = human.visible; vis.fill(0);
  if (reveal) { vis.fill(1); human.explored.fill(1); return; }
  const mark = (x, y, r) => {
    const x0 = Math.max(0, (x - r) | 0), x1 = Math.min(n - 1, (x + r) | 0), y0 = Math.max(0, (y - r) | 0), y1 = Math.min(n - 1, (y + r) | 0);
    const r2 = r * r;
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) { const dx = xx + 0.5 - x, dy = yy + 0.5 - y; if (dx * dx + dy * dy <= r2) { const i = yy * n + xx; vis[i] = 1; human.explored[i] = 1; } }
  };
  const allies = [];
  for (let i = 1; i < W.players.length; i++) if (i === W.humanId || (isFriend(i, W.humanId) && (human.sharedVision || W.players[i].sharedVision))) allies.push(i);
  for (const e of W.list) {
    if (!allies.includes(e.owner)) {
      if (e.type === 'sheep' && e.owner === 0) continue; continue;
    }
    if (e.kind === 'unit') { if (e.inside || e.dying) continue; mark(e.x, e.y, UNITS[e.type].los + 0.5); }
    else if (e.kind === 'bld') { const c = center(e); mark(c.x, c.y, (BUILDINGS[e.type].los || 4) + W.players[e.owner].bldLos + bsize(e) / 2); }
  }
  if (W.revealAll) human.explored.fill(1);
}
function isVisibleToHuman(e) {
  if (!W) return true;
  const n = W.n, c = center(e);
  const x = Math.max(0, Math.min(n - 1, c.x | 0)), y = Math.max(0, Math.min(n - 1, c.y | 0));
  return W.players[W.humanId].visible[y * n + x] === 1;
}
function isExploredForHuman(x, y) { const n = W.n; x = Math.max(0, Math.min(n - 1, x | 0)); y = Math.max(0, Math.min(n - 1, y | 0)); return W.players[W.humanId].explored[y * n + x] === 1; }

// ---------- population ----------
function recalcPop() {
  for (let i = 1; i < W.players.length; i++) { const p = W.players[i]; p.pop = 0; p.popCap = 0; }
  for (const e of W.list) {
    const p = W.players[e.owner]; if (!p) continue;
    if (e.kind === 'unit' && !UNITS[e.type].animal && e.type !== 'cobra' && !e.dying) p.pop++;
    if (e.kind === 'bld' && e.built && BUILDINGS[e.type].pop) p.popCap += e.type === 'tc' && p.tcPop ? p.tcPop : BUILDINGS[e.type].pop;
  }
  for (let i = 1; i < W.players.length; i++) { const p = W.players[i]; p.popCap = Math.min(200, p.popCap); }
}

// ---------- fx ----------
function emitFx(type, x, y, n = 1) {
  if (W.fx.length > 1500) return;
  for (let i = 0; i < n; i++) {
    const f = { type, x, y, z: 0.4, vx: (Math.random() - 0.5) * 1.2, vy: (Math.random() - 0.5) * 1.2, vz: 1 + Math.random() * 1.5, life: 0, max: 0.6 + Math.random() * 0.4, r: Math.random() };
    if (type === 'smoke') { f.z = 1 + Math.random(); f.vz = 0.5; f.vx *= 0.2; f.vy *= 0.2; f.max = 2.5; }
    if (type === 'fire') { f.vz = 0.8; f.max = 0.8; }
    if (type === 'explosion') { f.max = 0.9; f.vx *= 3; f.vy *= 3; f.vz = 3; }
    if (type === 'collapse') { f.max = 2; f.vx *= n * 0.6; f.vy *= n * 0.6; f.z = Math.random() * 2; }
    if (type === 'heal' || type === 'convert' || type === 'repair') { f.vz = 0.8; f.vx *= 0.3; f.vy *= 0.3; f.max = 1; }
    if (type === 'coins') { f.vz = 2; f.max = 1; }
    if (type === 'splash') { f.vz = 2; f.max = 0.7; }
    W.fx.push(f);
  }
}
function updateFx(dt) {
  for (let i = W.fx.length - 1; i >= 0; i--) {
    const f = W.fx[i]; f.life += dt;
    if (f.life >= f.max) { W.fx.splice(i, 1); continue; }
    f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
    if (f.type !== 'smoke' && f.type !== 'heal' && f.type !== 'convert' && f.type !== 'fire' && f.type !== 'repair') f.vz -= 6 * dt;
    if (f.z < 0) { f.z = 0; f.vz = 0; f.vx *= 0.5; f.vy *= 0.5; }
  }
  for (let i = W.decals.length - 1; i >= 0; i--) if (W.t - W.decals[i].t > W.decals[i].dur) W.decals.splice(i, 1);
}
function msg(text, color) { W.msgs.push({ text, color: color || '#fff', t: performance.now() }); if (W.msgs.length > 8) W.msgs.shift(); }

// ---------- main tick ----------
function worldTick(dt) {
  W.t += dt; W.tick++;
  if (W.timers && W.timers.length) { for (let i = W.timers.length - 1; i >= 0; i--) if (W.timers[i].at <= W.t) { const f = W.timers[i].fn; W.timers.splice(i, 1); f(); } }
  rebuildGrid();
  const list = W.list.slice();
  for (const e of list) {
    if (e.dead) continue;
    if (e.kind === 'unit') updateUnit(e, dt);
    else if (e.kind === 'bld') updateBuilding(e, dt);
    else if (e.kind === 'res' && e.type === 'carcass') { e.amount -= dt * 0.05; if (e.amount <= 0) removeEnt(e); }
  }
  // carried relics follow monks
  for (const e of W.list) if (e.kind === 'relic' && e.carrier) { const m = ent(e.carrier); if (!m) e.carrier = 0; }
  updateProjectiles(dt);
  updateFx(dt);
  if (W.tick % 6 === 0) updateVisibility();
  if (W.tick % 20 === 0) recalcPop();
  for (let i = 1; i < W.players.length; i++) { const p = W.players[i]; if (p.ai && p.alive) p.ai.update(dt); }
  if (W.tick % 40 === 0) checkVictory();
  if (W.tick % 10 === 0) W.market.food += (100 - W.market.food) * 0.01, W.market.wood += (100 - W.market.wood) * 0.01, W.market.stone += (130 - W.market.stone) * 0.01;
}
function isAlive(pid) {
  for (const e of W.list) {
    if (e.owner !== pid || e.dying) continue;
    if (e.kind === 'unit' && e.type !== 'sheep') return true;
    if (e.kind === 'bld' && !BUILDINGS[e.type].wall && !BUILDINGS[e.type].gate && e.type !== 'farm') return true;
  }
  return false;
}
function checkVictory() {
  if (W.over) return;
  for (let i = 1; i < W.players.length; i++) {
    const p = W.players[i];
    if (p.alive && !isAlive(i)) {
      p.alive = false;
      msg(`${p.name} has been defeated!`, p.color.l);
      // remaining property goes wild
      for (const e of W.list.slice()) if (e.owner === i && e.kind === 'unit' && e.type === 'sheep') e.owner = 0;
    }
  }
  const h = W.players[W.humanId];
  if (!h.alive) { endGame(false); return; }
  const others = W.players.filter((p, i) => p && i !== W.humanId && p.alive);
  if (others.every(p => isFriend(p.id, W.humanId))) endGame(true);
}
function endGame(win) { W.over = true; W.won = win; UI.showEnd(win); if (win) Sound.fanfare(); else Sound.defeat(); }

// ---------- commands used by UI & AI ----------
function canPlace(p, type, x, y, ignoreExplored) {
  const d = BUILDINGS[type], s = d.size, map = W.map;
  if (x < 0 || y < 0 || x + s > W.n || y + s > W.n) return 'Out of bounds';
  let minE = 9, maxE = -1, landAdj = false;
  for (let yy = y; yy < y + s; yy++) for (let xx = x; xx < x + s; xx++) {
    const i = map.idx(xx, yy);
    if (map.blk[i]) { const b = ent(map.blk[i]); if (b) return 'Blocked'; map.blk[i] = 0; }
    for (const f of W.list) if (f.kind === 'bld' && BUILDINGS[f.type].farm && xx >= f.x && xx < f.x + 3 && yy >= f.y && yy < f.y + 3) return 'Blocked by farm';
    const water = isWaterT(map.ter[i]);
    if (d.water ? !water : water) return d.water ? 'Docks must be on water next to the shore' : 'Cannot build on water';
    if (!ignoreExplored && p && p.human && !p.explored[i]) return 'Unexplored area';
    minE = Math.min(minE, map.elev[i]); maxE = Math.max(maxE, map.elev[i]);
  }
  if (!d.water && maxE - minE > 1) return 'Ground too steep';
  if (d.water) {
    for (let yy = y - 1; yy <= y + s; yy++) for (let xx = x - 1; xx <= x + s; xx++) { if (!map.inb(xx, yy)) continue; if (!isWaterT(map.ter[map.idx(xx, yy)])) landAdj = true; }
    if (!landAdj) return 'Docks must touch the shoreline';
  }
  // no units of others standing? allow (they get pushed)
  for (const r of W.list) if (r.kind === 'relic' && !r.carrier && !r.inBld && r.x >= x && r.x < x + s && r.y >= y && r.y < y + s) return 'Blocked by relic';
  return null;
}
function placeBuilding(p, type, x, y, builders, queued) {
  const err = canPlace(p, type, x, y); if (err) return err;
  const lock = bldLocked(p, type); if (lock) return lock;
  const cost = effCost(p, type); if (!canPay(p, cost)) return 'Not enough resources';
  pay(p, cost);
  const b = spawnBuilding(type, p.id, x, y, false);
  if (W.instantFor(p)) { b.progress = 1; completeBuilding(b); }
  for (const u of builders) {
    if (queued && u.order && u.order.t === 'build') { u.buildQueue = u.buildQueue || []; u.buildQueue.push(b.id); continue; }
    setOrder(u, { t: 'build', id: b.id });
  }
  return b;
}
function deleteEnt(e) {
  if (e.kind === 'unit') { killEnt(e, null); }
  else if (e.kind === 'bld') { if (!e.built) { const p = W.players[e.owner]; const c = effCost(p, e.type); for (const r in c) p.res[r] += Math.round(c[r] * (1 - e.progress)); } killEnt(e, null); }
}
function marketTrade(p, res, buy) {
  if (!hasBuilt(p, 'market')) return 'Requires a Market';
  const price = Math.round(W.market[res]);
  if (buy) { if (p.res.gold < price) return 'Not enough gold'; p.res.gold -= price; p.res[res] += 100; W.market[res] += 5; }
  else { if (p.res[res] < 100) return 'Not enough ' + res; p.res[res] -= 100; p.res.gold += Math.round(price * 0.7); W.market[res] = Math.max(20, W.market[res] - 5); }
  return null;
}
function tribute(from, to, res, amt) {
  const p = W.players[from], q = W.players[to];
  if (p.res[res] < amt) return 'Not enough ' + res;
  const fee = Math.round(amt * p.tributeFee);
  p.res[res] -= amt; q.res[res] += amt - fee; p.stats.tributeSent += amt;
  if (q.ai) q.ai.onTribute(from, res, amt - fee);
  return null;
}
function setStanceMutual(a, b, s) {
  W.players[a].stance[b] = s; W.players[b].stance[a] = s;
  // cancel attacks between non-enemies
  if (s !== 'enemy') for (const e of W.list) if (e.kind === 'unit' && e.order && e.order.t === 'attack') { const t = ent(e.order.id); if (t && ((e.owner === a && t.owner === b) || (e.owner === b && t.owner === a))) setOrder(e, null); }
}
