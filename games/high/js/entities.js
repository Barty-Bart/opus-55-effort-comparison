'use strict';
// ---------- Game state, entities & simulation ----------
let G = null;
const PL = i => G.players[i];
const LINES = {
  militia: ['militia', 'man_at_arms', 'long_swordsman', 'champion'],
  spearman: ['spearman', 'pikeman'],
  archer: ['archer', 'crossbowman', 'arbalester'],
  skirmisher: ['skirmisher', 'elite_skirmisher'],
  scout: ['scout', 'light_cavalry'],
  knight: ['knight', 'cavalier'],
};

function createPlayer(id, civ, isAI) {
  const p = {
    id, civ, isAI, res: { food: 200, wood: 200, gold: 100, stone: 200 }, age: 0, techs: new Set(), busy: new Set(), alias: {},
    pop: 0, popCap: 0, gatherMul: 1, trainMul: 1,
    mods: { vil: { hp: 0, am: 0, ap: 0, speed: 0, carry: 0 }, inf: { atk: 0, am: 0, ap: 0 }, cav: { atk: 0, am: 0, ap: 0, hp: 0, hpMul: 1 },
      arc: { atk: 0, am: 0, ap: 0, range: 0 }, bld: { atk: 0, range: 0 }, gather: { wood: 1, gold: 1, stone: 1, farm: 1, berries: 1, sheep: 1, hunt: 1 }, farmFood: 0, cavArcReload: 1 },
    market: { food: 100, wood: 100, stone: 100 },
    stats: { gathered: { food: 0, wood: 0, gold: 0, stone: 0 }, trained: 0, killed: 0, lost: 0, razed: 0, bldLost: 0, techs: 0, built: 0 },
    ageTimes: [0], defeated: false, reseed: true,
  };
  if (civ === 'teutons') { p.mods.inf.am += 1; p.mods.bld.range += 1; }
  if (civ === 'franks') p.mods.cav.hpMul = 1.2;
  if (civ === 'mongols') { p.mods.cavArcReload = 0.75; p.mods.gather.hunt = 1.4; }
  if (civ === 'britons') p.mods.gather.sheep = 1.25;
  return p;
}

// ---------- stat helpers ----------
const hasCls = (d, c) => d.cls.indexOf(c) >= 0;
function uAtk(u) {
  const d = UNITS[u.type], m = PL(u.owner).mods; let a = d.atk;
  if (hasCls(d, 'archer')) a += m.arc.atk;
  else if (hasCls(d, 'infantry')) a += m.inf.atk;
  else if (hasCls(d, 'cavalry')) a += m.cav.atk;
  return a;
}
function uRange(u) { const d = UNITS[u.type]; if (!d.range) return 0; return d.range + (hasCls(d, 'archer') ? PL(u.owner).mods.arc.range : 0); }
function uArmor(u) {
  const d = UNITS[u.type], m = PL(u.owner).mods; let a0 = d.armor[0], a1 = d.armor[1];
  if (hasCls(d, 'villager')) { a0 += m.vil.am; a1 += m.vil.ap; }
  else if (hasCls(d, 'archer')) { a0 += m.arc.am; a1 += m.arc.ap; }
  else if (hasCls(d, 'infantry')) { a0 += m.inf.am; a1 += m.inf.ap; }
  else if (hasCls(d, 'cavalry')) { a0 += m.cav.am; a1 += m.cav.ap; }
  return [a0, a1];
}
function uSpeed(u) { const d = UNITS[u.type]; return d.speed * (hasCls(d, 'villager') ? 1 + PL(u.owner).mods.vil.speed : 1); }
function uMaxHp(type, owner) {
  const d = UNITS[type], m = PL(owner).mods; let h = d.hp;
  if (hasCls(d, 'villager')) h += m.vil.hp;
  if (hasCls(d, 'cavalry')) h = (h + m.cav.hp) * m.cav.hpMul;
  return Math.round(h);
}
function uReload(u) { const d = UNITS[u.type]; return d.reload * (hasCls(d, 'cavalry') && hasCls(d, 'archer') ? PL(u.owner).mods.cavArcReload : 1); }
function uLos(u) { return UNITS[u.type].los; }
function isMilitary(d) { return !hasCls(d, 'villager') && !hasCls(d, 'animal') && !hasCls(d, 'monk'); }
function carryCap(p) { return 10 + p.mods.vil.carry; }
function bAtk(b) { return BUILDINGS[b.type].attack.atk + PL(b.owner).mods.bld.atk; }
function bRange(b) { return BUILDINGS[b.type].attack.range + PL(b.owner).mods.bld.range; }
function bArrows(b) {
  const d = BUILDINGS[b.type]; let n = d.attack.arrows;
  for (const id of b.garrison) { const u = G.byId.get(id); if (u) { const ud = UNITS[u.type]; if (hasCls(ud, 'villager') || hasCls(ud, 'infantry') || (hasCls(ud, 'archer') && !hasCls(ud, 'cavalry'))) n++; } }
  return n;
}
function entClasses(e) { return e.kind === 'building' ? ['building'] : UNITS[e.type].cls; }
function entArmor(e) { return e.kind === 'building' ? BUILDINGS[e.type].armor : uArmor(e); }
function calcDamage(atk, atkType, bonus, target) {
  const arm = entArmor(target);
  let dmg = Math.max(0, atk - (atkType === 'p' ? arm[1] : arm[0]));
  const cls = entClasses(target);
  for (const c in bonus) if (cls.indexOf(c) >= 0) dmg += bonus[c];
  return Math.max(1, dmg);
}

// ---------- costs ----------
function techCost(p, key) { if (p.civ === 'franks' && (key === 'horse_collar' || key === 'heavy_plow')) return {}; return TECHS[key].cost; }
function canAfford(p, cost) { for (const r in cost) if (p.res[r] < cost[r]) return false; return true; }
function pay(p, cost) { for (const r in cost) p.res[r] -= cost[r]; }
function refund(p, cost, f = 1) { for (const r in cost) p.res[r] += Math.floor(cost[r] * f); }
function trainType(p, key) { if (key === 'UU') return CIVS[p.civ].uu; return p.alias[key] || key; }

// ---------- entity creation ----------
function newEnt(o) { o.id = G.nextId++; o.dead = false; G.byId.set(o.id, o); return o; }
function getEnt(id) { if (!id) return null; const e = G.byId.get(id); return e && !e.dead ? e : null; }

function spawnUnit(type, owner, x, y) {
  const u = newEnt({ kind: 'unit', type, owner, x, y, hp: 1, maxHp: 1, order: null, path: null, pi: 0, goalKey: null, face: Math.random() < 0.5 ? 1 : -1,
    moving: false, walkT: 0, cool: Math.random(), atkAnim: 0, carryType: null, carryAmt: 0, carryFrac: 0, working: false, task: null,
    scanT: Math.random() * 0.5, repathT: 0, stuckT: 0, garrisonedIn: 0, faith: 100, lastHit: 0 });
  u.maxHp = uMaxHp(type, owner); u.hp = u.maxHp;
  G.units.push(u);
  return u;
}

function createBuilding(type, owner, tx, ty, built) {
  const d = BUILDINGS[type];
  const b = newEnt({ kind: 'building', type, owner, tx, ty, w: d.size, h: d.size, x: tx + d.size / 2, y: ty + d.size / 2,
    built: false, progress: 0, hp: 1, maxHp: d.hp, queue: [], rally: null, garrison: [], cool: 1, farmer: 0,
    amount: 0, buildersNow: 0, buildersPrev: 0, fireT: 0, smokeT: Math.random(), placedT: G.time });
  G.buildings.push(b);
  if (d.noBlock) markFarm(b, true); else blockTiles(b, true);
  if (d.wall) refreshWallMasks(b);
  if (built) { b.progress = 1; completeBuilding(b, true); }
  return b;
}

const RES_AMOUNT = { tree: 100, gold: 800, stone: 350, berries: 125 };
function addResource(type, i, j) {
  const r = newEnt({ kind: 'resource', type, owner: 0, tx: i, ty: j, x: i + 0.5, y: j + 0.5, amount: RES_AMOUNT[type], max: RES_AMOUNT[type],
    rtype: type === 'tree' ? 'wood' : type === 'berries' ? 'food' : type, sub: type === 'tree' ? 'wood' : type, variant: Math.floor(Math.random() * 8) });
  G.resources.push(r);
  const k = j * G.map.N + i; G.map.tileEnt[k] = r.id; G.map.pass[k] = 0;
  return r;
}
function addCarcass(animal) {
  const d = UNITS[animal.type];
  const r = newEnt({ kind: 'resource', type: 'carcass', src: animal.type, owner: 0, x: animal.x, y: animal.y, tx: Math.floor(animal.x), ty: Math.floor(animal.y),
    amount: d.food, max: d.food, rtype: 'food', sub: d.herd ? 'sheep' : 'hunt', decay: 0, face: animal.face });
  G.resources.push(r);
  return r;
}

function blockTiles(e, on) {
  const N = G.map.N;
  for (let j = e.ty; j < e.ty + e.h; j++) for (let i = e.tx; i < e.tx + e.w; i++) {
    const k = j * N + i;
    G.map.tileEnt[k] = on ? e.id : 0;
    G.map.pass[k] = on ? 0 : (G.map.water[k] ? 0 : 1);
  }
}
function markFarm(e, on) {
  const N = G.map.N;
  for (let j = e.ty; j < e.ty + e.h; j++) for (let i = e.tx; i < e.tx + e.w; i++) G.map.tileFarm[j * N + i] = on ? e.id : 0;
}
function refreshWallMasks(b) {
  const N = G.map.N;
  for (let j = b.ty - 1; j <= b.ty + 1; j++) for (let i = b.tx - 1; i <= b.tx + 1; i++) {
    if (i < 0 || j < 0 || i >= N || j >= N) continue;
    const e = getEnt(G.map.tileEnt[j * N + i]);
    if (e && e.kind === 'building' && BUILDINGS[e.type].wall) e.wallMask = wallMask(e);
  }
}
function wallMask(b) {
  const N = G.map.N; let m = 0;
  const is = (i, j) => { if (i < 0 || j < 0 || i >= N || j >= N) return false; const e = getEnt(G.map.tileEnt[j * N + i]); return e && e.kind === 'building' && (BUILDINGS[e.type].wall || e.type === 'watch_tower') && e.owner === b.owner; };
  if (is(b.tx + 1, b.ty)) m |= 1; if (is(b.tx - 1, b.ty)) m |= 2; if (is(b.tx, b.ty + 1)) m |= 4; if (is(b.tx, b.ty - 1)) m |= 8;
  return m;
}

function tileFree(i, j) {
  const N = G.map.N; if (i < 0 || j < 0 || i >= N || j >= N) return false;
  const k = j * N + i; return !G.map.water[k] && !G.map.tileEnt[k] && !G.map.tileFarm[k];
}
function canPlace(type, tx, ty, owner, checkFog) {
  const d = BUILDINGS[type], N = G.map.N;
  for (let j = ty; j < ty + d.size; j++) for (let i = tx; i < tx + d.size; i++) {
    if (!tileFree(i, j)) return false;
    if (checkFog && !G.fog.explored[j * N + i]) return false;
  }
  return true;
}
function placeFoundation(p, type, tx, ty) {
  const d = BUILDINGS[type];
  if (!canAfford(p, d.cost)) return null;
  if (!canPlace(type, tx, ty, p.id, !p.isAI && !G.revealAll)) return null;
  pay(p, d.cost);
  const b = createBuilding(type, p.id, tx, ty, false);
  ejectUnits(b);
  return b;
}
function ejectUnits(b) {
  if (BUILDINGS[b.type].noBlock) return;
  for (const u of G.units) {
    if (u.dead || u.garrisonedIn) continue;
    if (u.x >= b.tx && u.x < b.tx + b.w && u.y >= b.ty && u.y < b.ty + b.h) {
      const f = Path.nearestFree(u.x, u.y); if (f) { u.x = f[0]; u.y = f[1]; u.path = null; }
    }
  }
}

function completeBuilding(b, silent) {
  const d = BUILDINGS[b.type], p = PL(b.owner);
  b.built = true; b.progress = 1; b.hp = silent ? d.hp : Math.max(b.hp, d.hp * 0.999); b.hp = d.hp;
  if (b.type === 'farm') b.amount = d.food + p.mods.farmFood;
  if (!silent) {
    p.stats.built++;
    if (b.owner === 1) { Sound.play('done'); if (d.wonder) notify('Your Wonder is complete! Defend it to win.', 'good'); }
    else if (d.wonder) notify('The enemy has completed a Wonder! Destroy it before time runs out!', 'warn');
  }
  if (d.wonder) G.wonder = { id: b.id, owner: b.owner, t: 300 };
}

// ---------- geometry ----------
function rectOf(e) {
  if (e.kind === 'building') return { x0: e.tx, y0: e.ty, x1: e.tx + e.w, y1: e.ty + e.h };
  if (e.kind === 'resource') { if (e.type === 'carcass') return { x0: e.x - 0.2, y0: e.y - 0.2, x1: e.x + 0.2, y1: e.y + 0.2 }; return { x0: e.tx, y0: e.ty, x1: e.tx + 1, y1: e.ty + 1 }; }
  const r = UNITS[e.type].radius; return { x0: e.x - r, y0: e.y - r, x1: e.x + r, y1: e.y + r };
}
function pointRect(x, y, r = 0) { return { x0: x - r, y0: y - r, x1: x + r, y1: y + r }; }
function edgeDist(u, e) { const r = rectOf(e); return distToRect(u.x, u.y, r.x0, r.y0, r.x1, r.y1); }
function passAt(x, y) { const N = G.map.N, i = Math.floor(x), j = Math.floor(y); return i >= 0 && j >= 0 && i < N && j < N && G.map.pass[j * N + i] === 1; }
function faceTo(u, x, y) { const sx = (x - u.x) - (y - u.y); if (Math.abs(sx) > 0.02) u.face = sx > 0 ? 1 : -1; }

// ---------- movement ----------
function stopMove(u) { u.path = null; u.pi = 0; u.goalKey = null; }
function approach(u, target, reach, dt) {
  const r = target.x0 !== undefined ? target : rectOf(target);
  const d = distToRect(u.x, u.y, r.x0, r.y0, r.x1, r.y1);
  if (d <= reach) { if (u.path) stopMove(u); u.stuckT = 0; return true; }
  const key = target.id ? 'e' + target.id : 'p' + r.x0.toFixed(1) + ',' + r.y0.toFixed(1) + ',' + r.x1.toFixed(1);
  u.repathT -= dt;
  const movedTarget = target.kind === 'unit' && u.pathTX != null && dist(target.x, target.y, u.pathTX, u.pathTY) > 1.3;
  const exhausted = u.path && u.pi >= u.path.length;
  if (u.goalKey !== key || !u.path || ((movedTarget || exhausted) && u.repathT <= 0)) {
    const res = Path.find(u.x, u.y, r, Math.max(reach, 0.72));
    u.path = res.pts; u.pi = 0; u.goalKey = key; u.pathTX = target.x; u.pathTY = target.y;
    u.repathT = 0.7 + Math.random() * 0.5;
  }
  const spd = uSpeed(u) * dt;
  if (u.pi < u.path.length) followPath(u, spd);
  else { // steer directly toward the goal
    const [cx, cy] = closestOnRect(u.x, u.y, r.x0, r.y0, r.x1, r.y1);
    const dx = cx - u.x, dy = cy - u.y, dd = Math.hypot(dx, dy) || 1;
    const st = Math.min(spd, Math.max(0, dd - reach * 0.9));
    const nx = u.x + dx / dd * st, ny = u.y + dy / dd * st;
    if (passAt(nx, ny) || !passAt(u.x, u.y)) { u.x = nx; u.y = ny; u.moving = true; faceTo(u, cx, cy); u.stuckT = Math.max(0, u.stuckT - dt); }
    else if (passAt(nx, u.y)) { u.x = nx; u.moving = true; u.stuckT += dt * 0.5; }
    else if (passAt(u.x, ny)) { u.y = ny; u.moving = true; u.stuckT += dt * 0.5; }
    else u.stuckT += dt;
  }
  return false;
}
function followPath(u, step) {
  while (step > 0 && u.pi < u.path.length) {
    const wp = u.path[u.pi];
    if (!passAt(wp[0], wp[1]) && u.pi === u.path.length - 1 && false) { }
    const dx = wp[0] - u.x, dy = wp[1] - u.y, dd = Math.hypot(dx, dy);
    faceTo(u, wp[0], wp[1]);
    if (dd <= step) { u.x = wp[0]; u.y = wp[1]; u.pi++; step -= dd; }
    else {
      const nx = u.x + dx / dd * step, ny = u.y + dy / dd * step;
      if (!passAt(nx, ny) && passAt(u.x, u.y)) { u.path = []; u.pi = 0; u.repathT = 0; return; } // blocked: repath
      u.x = nx; u.y = ny; step = 0;
    }
  }
  u.moving = true;
}

// ---------- orders ----------
function setOrder(u, o) { u.order = o; stopMove(u); u.stuckT = 0; u.working = false; if (o && o.type !== 'gather' && o.type !== 'drop') { } }
function finishOrder(u) { u.order = u.nextOrder || null; u.nextOrder = null; stopMove(u); }

function updateUnit(u, dt) {
  const d = UNITS[u.type];
  if (u.cool > 0) u.cool -= dt;
  if (u.atkAnim > 0) u.atkAnim -= dt;
  u.moving = false; u.working = false;
  if (hasCls(d, 'monk') && u.faith < 100) u.faith = Math.min(100, u.faith + dt * 1.7);
  const o = u.order;
  if (!o) idleUnit(u, d, dt);
  else switch (o.type) {
    case 'move': if (approach(u, o.rect, 0.15, dt) || u.stuckT > 2.5) finishOrder(u); break;
    case 'amove': doAttackMove(u, d, o, dt); break;
    case 'attack': doAttack(u, d, o, dt); break;
    case 'gather': doGather(u, d, o, dt); break;
    case 'drop': doDrop(u, o, dt); break;
    case 'build': doBuild(u, o, dt); break;
    case 'repair': doRepair(u, o, dt); break;
    case 'garrison': doGarrison(u, o, dt); break;
    case 'heal': doHeal(u, o, dt); break;
    case 'convert': doConvert(u, o, dt); break;
    default: u.order = null;
  }
  if (u.moving) u.walkT += dt;
  if (u.hp < u.maxHp && hasCls(d, 'animal') === false && u.regen) u.hp = Math.min(u.maxHp, u.hp + dt * u.regen);
}

function idleUnit(u, d, dt) {
  u.scanT -= dt; if (u.scanT > 0) return;
  u.scanT = 0.45 + Math.random() * 0.25;
  if (isMilitary(d)) {
    const t = findTarget(u, uLos(u) + 1, d.onlyBld, d.onlyBld ? true : 2.5);
    if (t) u.order = { type: 'attack', target: t.id, auto: true, hx: u.x, hy: u.y };
  } else if (hasCls(d, 'monk')) {
    const t = findHealTarget(u); if (t) u.order = { type: 'heal', target: t.id, auto: true };
  } else if (d.look === 'deer' && Math.random() < 0.04) {
    const x = u.x + rrange(-2, 2), y = u.y + rrange(-2, 2); if (passAt(x, y)) u.order = { type: 'move', rect: pointRect(x, y) };
  }
}

function isEnemy(a, b) { return b.owner !== a.owner && b.owner !== 0 && a.owner !== 0; }
function canSee(owner, e) { return owner !== 1 || G.revealAll || tileVisible(e.x, e.y); }

// find nearest enemy unit (or building) around u
function findTarget(u, radius, onlyBld, bldRange) {
  let best = null, bd = 1e9;
  if (!onlyBld) {
    forUnitsNear(u.x, u.y, radius, v => {
      if (v.dead || v.garrisonedIn || !isEnemy(u, v)) return;
      if (!canSee(u.owner, v)) return;
      let dd = dist(u.x, u.y, v.x, v.y);
      const vd = UNITS[v.type];
      if (!isMilitary(vd) && !hasCls(vd, 'monk')) dd += 2; // prefer soldiers
      if (dd < bd) { bd = dd; best = v; }
    });
    if (best) return best;
  }
  if (bldRange) {
    const R = bldRange === true ? radius : bldRange;
    for (const b of G.buildings) {
      if (b.dead || !isEnemy(u, b)) continue;
      const dd = edgeDist(u, b); if (dd > R) continue;
      let score = dd + (BUILDINGS[b.type].wall ? 6 : 0) + (b.type === 'farm' ? 3 : 0);
      if (score < bd) { bd = score; best = b; }
    }
  }
  return best;
}
function findHealTarget(u) {
  let best = null, bd = 1e9;
  forUnitsNear(u.x, u.y, uLos(u), v => {
    if (v.dead || v.garrisonedIn || v.owner !== u.owner || v.id === u.id || v.hp >= v.maxHp) return;
    const vd = UNITS[v.type]; if (hasCls(vd, 'siege') || hasCls(vd, 'animal')) return;
    const dd = dist(u.x, u.y, v.x, v.y); if (dd < bd) { bd = dd; best = v; }
  });
  return best;
}

function attackStep(u, d, t, dt) {
  const range = uRange(u);
  const dd = edgeDist(u, t);
  if (range > 0 && d.minRange && dd < d.minRange && t.kind === 'unit') { // back off from targets that are too close
    if (!u.backOff || G.time > u.backOff.until) {
      const ax = u.x - t.x, ay = u.y - t.y, l = Math.hypot(ax, ay) || 1;
      const f = Path.nearestFree(u.x + ax / l * 2.5, u.y + ay / l * 2.5, 3) || [u.x, u.y];
      u.backOff = { r: pointRect(f[0], f[1], 0.2), until: G.time + 1.5 };
    }
    approach(u, u.backOff.r, 0.3, dt);
    return;
  }
  const reach = range > 0 ? range : (t.kind === 'unit' ? d.radius + 0.35 : 0.78);
  if (!approach(u, t, reach, dt)) return;
  faceTo(u, t.x, t.y);
  if (u.cool > 0) return;
  u.cool = uReload(u); u.atkAnim = 0.5;
  if (range > 0) spawnProjectile(u, t, d.proj || 'arrow', uAtk(u), d.atkType, d.bonus, d.blast);
  else {
    const dmg = calcDamage(uAtk(u), 'm', d.bonus, t);
    damage(t, dmg, u);
    if (onScreenVisible(u.x, u.y)) Sound.play(hasCls(d, 'siege') ? 'rock' : t.kind === 'building' ? 'hit' : 'sword');
  }
}

function doAttack(u, d, o, dt) {
  const t = getEnt(o.target);
  if (!t || t.garrisonedIn || t.owner === u.owner || (t.kind === 'unit' && t.owner === 0 && !hasCls(UNITS[t.type], 'animal')) || (d.onlyBld && t.kind !== 'building') || (t.kind === 'unit' && !canSee(u.owner, t) && !o.forced)) {
    const nt = isMilitary(d) ? findTarget(u, uLos(u) + 2, d.onlyBld, d.onlyBld ? true : 2.5) : null;
    if (nt) { o.target = nt.id; o.forced = false; } else finishOrder(u);
    return;
  }
  if (o.auto && dist(u.x, u.y, o.hx, o.hy) > uLos(u) + 8) { setOrder(u, { type: 'move', rect: pointRect(o.hx, o.hy) }); return; }
  if (u.stuckT > 4) { u.stuckT = 0; finishOrder(u); return; }
  attackStep(u, d, t, dt);
}

function doAttackMove(u, d, o, dt) {
  u.scanT -= dt;
  if (o.sub) {
    const t = getEnt(o.sub);
    if (t && !t.garrisonedIn && isEnemy(u, t) && (t.kind === 'building' || canSee(u.owner, t)) && u.stuckT < 4) {
      if (t.kind === 'building' && u.scanT <= 0) { // switch to units if any appear
        u.scanT = 0.6; const nu = d.onlyBld ? null : findTarget(u, uLos(u), false, false);
        if (nu) { o.sub = nu.id; return; }
      }
      attackStep(u, d, t, dt); return;
    }
    o.sub = null; u.stuckT = 0; stopMove(u);
  }
  if (u.scanT <= 0) {
    u.scanT = 0.5 + Math.random() * 0.2;
    const t = findTarget(u, uLos(u) + 1, d.onlyBld, true);
    if (t) { o.sub = t.id; return; }
  }
  if (approach(u, o.rect, 0.6, dt) || u.stuckT > 3) finishOrder(u);
}

// ---------- economy ----------
function gatherRate(p, sub) { return GATHER[sub] * (p.mods.gather[sub] || 1) * p.gatherMul; }
function nearestDropsite(owner, rtype, x, y) {
  let best = null, bd = 1e9;
  for (const b of G.buildings) {
    if (b.dead || b.owner !== owner || !b.built) continue;
    if (BUILDINGS[b.type].drop.indexOf(rtype) < 0) continue;
    const dd = distToRect(x, y, b.tx, b.ty, b.tx + b.w, b.ty + b.h);
    if (dd < bd) { bd = dd; best = b; }
  }
  return best;
}
function findResourceNear(owner, sub, x, y, radius, excludeId) {
  let best = null, bd = 1e9;
  if (sub === 'farm') {
    for (const b of G.buildings) {
      if (b.dead || b.type !== 'farm' || !b.built || b.owner !== owner || b.id === excludeId) continue;
      if (b.farmer && getEnt(b.farmer) && getEnt(b.farmer).order && getEnt(b.farmer).order.target === b.id) continue;
      const dd = dist(x, y, b.x, b.y); if (dd < radius && dd < bd) { bd = dd; best = b; }
    }
    return best;
  }
  for (const r of G.resources) {
    if (r.dead || r.amount <= 0 || r.id === excludeId) continue;
    if (r.sub !== sub && !(sub === 'hunt' && r.sub === 'sheep') && !(sub === 'sheep' && r.sub === 'hunt')) continue;
    const dd = dist(x, y, r.x, r.y); if (dd > radius) continue;
    const crowd = r.type === 'tree' ? 0 : countGatherers(r) * 1.5;
    if (dd + crowd < bd) { bd = dd + crowd; best = r; }
  }
  if (!best && (sub === 'sheep' || sub === 'hunt')) { // look for herdables owned by the player
    for (const u of G.units) {
      if (u.dead || u.owner !== owner || u.type !== 'sheep') continue;
      const dd = dist(x, y, u.x, u.y); if (dd < radius && dd < bd) { bd = dd; best = u; }
    }
  }
  return best;
}
function countGatherers(r) { let n = 0; for (const u of G.units) if (!u.dead && u.order && u.order.type === 'gather' && u.order.target === r.id) n++; return n; }

function doGather(u, d, o, dt) {
  const p = PL(u.owner);
  let t = getEnt(o.target);
  if (!t && G.carcassOf[o.target]) { t = getEnt(G.carcassOf[o.target]); if (t) o.target = t.id; }
  // hunting live animals
  if (t && t.kind === 'unit') {
    const td = UNITS[t.type];
    if (!hasCls(td, 'animal')) { finishOrder(u); return; }
    const reach = td.hunt ? 2.4 : d.radius + 0.4;
    u.task = td.hunt ? 'hunt' : 'sheep';
    if (u.carryAmt > 0 && u.carryType !== 'food') { u.carryAmt = 0; u.carryFrac = 0; }
    if (!approach(u, t, reach, dt)) return;
    faceTo(u, t.x, t.y);
    if (u.cool <= 0) {
      u.cool = uReload(u); u.atkAnim = 0.5;
      if (td.hunt) spawnProjectile(u, t, 'javelin', uAtk(u) + 1, 'p', {}, 0);
      else damage(t, calcDamage(uAtk(u), 'm', {}, t), u);
    }
    return;
  }
  if (!t || t.amount <= 0 || (t.kind === 'building' && (t.type !== 'farm' || !t.built || t.owner !== u.owner))) {
    if (t && t.kind === 'building' && t.type === 'farm' && !t.built && t.owner === u.owner) { setOrder(u, { type: 'build', target: t.id }); return; }
    const nt = findResourceNear(u.owner, o.sub, o.lx != null ? o.lx : u.x, o.ly != null ? o.ly : u.y, o.sub === 'farm' ? 6 : 9, o.target);
    if (nt) { o.target = nt.id; stopMove(u); return; }
    if (u.carryAmt > 0) setOrder(u, { type: 'drop' }); else finishOrder(u);
    u.idleReason = o.sub;
    return;
  }
  const rt = t.kind === 'building' ? 'food' : t.rtype;
  const sub = t.kind === 'building' ? 'farm' : t.sub;
  o.sub = sub; o.lx = t.x; o.ly = t.y;
  const cap = carryCap(p);
  if (u.carryAmt > 0 && u.carryType !== rt) { u.carryAmt = 0; u.carryFrac = 0; }
  if (u.carryAmt >= cap) { u.nextOrder = null; setOrder(u, { type: 'drop', ret: o }); return; }
  if (t.type === 'farm') {
    const f = getEnt(t.farmer);
    if (f && f.id !== u.id && f.order && f.order.target === t.id) {
      const nt = findResourceNear(u.owner, 'farm', t.x, t.y, 8, t.id);
      if (nt) o.target = nt.id; else finishOrder(u);
      return;
    }
    t.farmer = u.id;
  }
  u.task = sub;
  const tgt = t.type === 'farm' ? pointRect(t.x + ((u.id % 3) - 1) * 0.5, t.y + ((u.id >> 1) % 3 - 1) * 0.5, 0.35) : t;
  const reach = t.type === 'farm' ? 0.05 : t.type === 'carcass' ? 0.5 : 0.75;
  if (!approach(u, tgt, reach, dt)) {
    if (u.stuckT > 3) { // unreachable: try another
      u.stuckT = 0; const nt = findResourceNear(u.owner, sub, u.x, u.y, 9, t.id);
      if (nt) o.target = nt.id; else finishOrder(u);
    }
    return;
  }
  u.working = true;
  faceTo(u, t.x + (t.type === 'farm' ? (u.face > 0 ? 1 : -1) : 0), t.y);
  u.carryFrac += gatherRate(p, sub) * dt;
  while (u.carryFrac >= 1 && t.amount > 0 && u.carryAmt < cap) { u.carryFrac -= 1; t.amount--; u.carryAmt++; u.carryType = rt; }
  if (onScreenVisible(u.x, u.y)) { if (sub === 'wood') Sound.play('chop'); else if (sub === 'gold' || sub === 'stone') Sound.play('mine'); }
  if (t.amount <= 0) depleteResource(t, u);
}

function depleteResource(t, u) {
  if (t.kind === 'building') { // farm exhausted
    const p = PL(t.owner), tx = t.tx, ty = t.ty, owner = t.owner;
    killEntity(t, null, true);
    if (p.reseed && canAfford(p, BUILDINGS.farm.cost)) {
      const nb = placeFoundation(p, 'farm', tx, ty);
      if (nb && u) setOrder(u, { type: 'build', target: nb.id });
      if (owner === 1 && nb) G.stats.reseeds++;
    } else if (owner === 1 && G.time - (G.farmMsgT || -99) > 25) { G.farmMsgT = G.time; notify(p.reseed ? 'A farm is exhausted — not enough wood to reseed it.' : 'A farm has been exhausted.', 'info'); }
    return;
  }
  t.dead = true;
  if (t.type !== 'carcass') { const k = t.ty * G.map.N + t.tx; G.map.tileEnt[k] = 0; G.map.pass[k] = G.map.water[k] ? 0 : 1; }
  if (t.type === 'tree') G.decals.push({ type: 'stump', x: t.x, y: t.y, t: 0, life: 90 });
  G.minimapDirty = true;
}

function doDrop(u, o, dt) {
  if (u.carryAmt <= 0) { u.order = o.ret || null; stopMove(u); return; }
  const ds = nearestDropsite(u.owner, u.carryType, u.x, u.y);
  if (!ds) { u.order = null; return; }
  if (!approach(u, ds, 0.78, dt)) { if (u.stuckT > 4) { u.stuckT = 0; u.order = null; } return; }
  const p = PL(u.owner);
  p.res[u.carryType] += u.carryAmt; p.stats.gathered[u.carryType] += u.carryAmt;
  if (u.owner === 1) G.resFlash[u.carryType] = 0.4;
  u.carryAmt = 0; u.carryFrac = 0;
  u.order = o.ret || null; stopMove(u);
}

function doBuild(u, o, dt) {
  const b = getEnt(o.target);
  if (!b || b.owner !== u.owner || b.kind !== 'building') { finishOrder(u); afterBuildIdle(u, null); return; }
  if (b.built) { afterBuild(u, b); return; }
  if (!approach(u, b, BUILDINGS[b.type].noBlock ? 0.3 : 0.78, dt)) { if (u.stuckT > 5) { u.stuckT = 0; finishOrder(u); } return; }
  u.working = true; u.task = 'build'; faceTo(u, b.x, b.y);
  b.buildersNow++;
  const n = Math.max(1, b.buildersPrev);
  const rate = (n + 2) / (3 * n) / BUILDINGS[b.type].time * (PL(u.owner).buildMul || 1);
  b.progress += rate * dt; b.hp = Math.min(b.maxHp, b.hp + b.maxHp * rate * dt);
  if (onScreenVisible(u.x, u.y)) Sound.play('build');
  if (b.progress >= 1 && !b.built) completeBuilding(b);
}
function afterBuild(u, b) {
  const d = BUILDINGS[b.type];
  if (b.type === 'farm') { const f = getEnt(b.farmer); if (!f || f.id === u.id || !f.order || f.order.target !== b.id) { setOrder(u, { type: 'gather', target: b.id, sub: 'farm' }); return; } }
  if (d.drop.length && b.type !== 'town_center') {
    let best = null;
    for (const rt of d.drop) {
      const sub = rt === 'food' ? 'berries' : rt;
      const r = findResourceNear(u.owner, sub, b.x, b.y, 9);
      if (r && (!best || dist(r.x, r.y, b.x, b.y) < dist(best.x, best.y, b.x, b.y))) best = r;
    }
    if (best) { setOrder(u, { type: 'gather', target: best.id, sub: best.sub }); return; }
  }
  afterBuildIdle(u, b);
}
function afterBuildIdle(u, b) {
  // look for another nearby foundation
  let best = null, bd = 12;
  for (const f of G.buildings) {
    if (f.dead || f.built || f.owner !== u.owner) continue;
    const dd = dist(u.x, u.y, f.x, f.y); if (dd < bd) { bd = dd; best = f; }
  }
  if (best) { setOrder(u, { type: 'build', target: best.id }); return; }
  u.order = u.nextOrder || null; u.nextOrder = null;
}
function doRepair(u, o, dt) {
  const b = getEnt(o.target);
  if (!b || b.owner !== u.owner || !b.built || b.hp >= b.maxHp) { finishOrder(u); return; }
  if (!approach(u, b, 0.78, dt)) { if (u.stuckT > 5) finishOrder(u); return; }
  const p = PL(u.owner);
  u.working = true; u.task = 'repair'; faceTo(u, b.x, b.y);
  const amt = b.maxHp / BUILDINGS[b.type].time * 0.5 * dt;
  const woodCost = amt / b.maxHp * (BUILDINGS[b.type].cost.wood || 0) * 0.5 + amt / b.maxHp * (BUILDINGS[b.type].cost.stone || 0) * 0.5;
  if (woodCost > 0) { const r = BUILDINGS[b.type].cost.stone ? 'stone' : 'wood'; if (p.res[r] < woodCost) { finishOrder(u); return; } p.res[r] -= woodCost; }
  b.hp = Math.min(b.maxHp, b.hp + amt);
  if (onScreenVisible(u.x, u.y)) Sound.play('build');
}
function doGarrison(u, o, dt) {
  const b = getEnt(o.target);
  const cap = b ? BUILDINGS[b.type].garrison || 0 : 0;
  if (!b || b.owner !== u.owner || !b.built || b.garrison.length >= cap) { finishOrder(u); return; }
  if (!approach(u, b, 0.8, dt)) { if (u.stuckT > 5) finishOrder(u); return; }
  u.garrisonedIn = b.id; b.garrison.push(u.id); u.order = null; stopMove(u); u.moving = false;
  const i = G.sel.indexOf(u.id); if (i >= 0) G.sel.splice(i, 1);
}
function ungarrison(b) {
  const out = b.garrison.slice(); b.garrison.length = 0;
  for (const id of out) {
    const u = G.byId.get(id); if (!u || u.dead) continue;
    u.garrisonedIn = 0;
    const f = Path.nearestFree(b.x + b.w / 2 + 0.6, b.y + b.h / 2 + 0.6, 14) || [b.x + b.w / 2 + 0.5, b.y + b.h / 2 + 0.5];
    u.x = f[0] + rrange(-0.3, 0.3); u.y = f[1] + rrange(-0.3, 0.3);
    if (!passAt(u.x, u.y)) { u.x = f[0]; u.y = f[1]; }
    u.order = u.bellOrder || null; u.bellOrder = null;
    if (b.rally && !u.order) setOrder(u, { type: 'move', rect: pointRect(b.rally.x, b.rally.y) });
  }
}
function doHeal(u, o, dt) {
  const t = getEnt(o.target);
  if (!t || t.owner !== u.owner || t.hp >= t.maxHp || t.garrisonedIn) { finishOrder(u); return; }
  if (!approach(u, t, 3.5, dt)) { if (u.stuckT > 4) finishOrder(u); return; }
  u.working = true; faceTo(u, t.x, t.y);
  t.hp = Math.min(t.maxHp, t.hp + dt * 1.8);
  if (Math.random() < dt * 3) G.fx.push({ type: 'spark', x: t.x, y: t.y, z: 10 + Math.random() * 14, vz: 14, life: 0.8, t: 0, col: '#fff6a0' });
}
function doConvert(u, o, dt) {
  const t = getEnt(o.target);
  if (!t || !isEnemy(u, t) || t.kind !== 'unit' || t.garrisonedIn) { finishOrder(u); return; }
  if (u.faith < 100) { finishOrder(u); if (u.owner === 1) notify('Your monk needs to rest before converting again.', 'info'); return; }
  if (!approach(u, t, uRange(u), dt)) { o.ch = 0; return; }
  u.working = true; faceTo(u, t.x, t.y);
  o.ch = (o.ch || 0) + dt;
  if (Math.random() < dt * 3) G.fx.push({ type: 'spark', x: t.x, y: t.y, z: 10 + Math.random() * 14, vz: 10, life: 0.8, t: 0, col: '#aee8ff' });
  if (o.ch > 4 && (Math.random() < dt * 0.3 || o.ch > 10)) {
    const was = t.owner;
    t.owner = u.owner; t.order = null; stopMove(t); t.maxHp = uMaxHp(t.type, t.owner); t.hp = Math.min(t.hp, t.maxHp);
    if (t.carryAmt) t.carryAmt = 0;
    const si = G.sel.indexOf(t.id); if (si >= 0 && was === 1) G.sel.splice(si, 1);
    u.faith = 0; finishOrder(u);
    if (onScreenVisible(t.x, t.y) || was === 1 || u.owner === 1) Sound.play('convert');
    if (was === 1) notify('One of your units has been converted!', 'warn');
    if (u.owner === 1) notify('Unit converted!', 'good');
    G.fx.push({ type: 'ring', x: t.x, y: t.y, z: 0, life: 1, t: 0, col: '#ffffff' });
  }
}

// ---------- damage ----------
function damage(t, amt, src) {
  if (t.dead) return;
  t.hp -= amt;
  t.lastHit = G.time;
  if (t.kind === 'unit') onUnitAttacked(t, src);
  else if (t.kind === 'building') onBuildingAttacked(t, src);
  if (t.hp <= 0) killEntity(t, src);
}
function onUnitAttacked(t, src) {
  if (!src || src.dead) return;
  const d = UNITS[t.type];
  if (t.owner === 1 && src.owner === 2 && !G.demo) alertPlayer(t);
  const ai = G.aiOf[t.owner]; if (ai && src.owner > 0 && src.owner !== t.owner) ai.onAttacked(t, src);
  if (d.look === 'deer') {
    if (!t.order) { const ax = t.x - src.x, ay = t.y - src.y, l = Math.hypot(ax, ay) || 1; const x = t.x + ax / l * 3, y = t.y + ay / l * 3; if (passAt(x, y)) t.order = { type: 'move', rect: pointRect(x, y) }; }
    return;
  }
  if (d.fights) { if (src.kind === 'unit' && (!t.order || t.order.type !== 'attack')) t.order = { type: 'attack', target: src.id, forced: true }; return; }
  if (src.kind !== 'unit') return;
  if (isMilitary(d) && (!t.order || (t.order.type === 'attack' && t.order.auto && getEnt(t.order.target) && getEnt(t.order.target).kind === 'building'))) {
    if (!UNITS[src.type] || (d.onlyBld)) return;
    t.order = { type: 'attack', target: src.id, auto: true, hx: t.x, hy: t.y };
  }
  if (hasCls(d, 'villager') && !t.order && isMilitary(UNITS[src.type]) === false && src.owner !== 0) t.order = { type: 'attack', target: src.id };
}
function onBuildingAttacked(b, src) {
  if (b.owner === 1 && src && src.owner === 2 && !G.demo) alertPlayer(b);
  const ai = G.aiOf[b.owner]; if (ai && src && src.owner > 0 && src.owner !== b.owner) ai.onAttacked(b, src);
}
function alertPlayer(e) {
  if (G.time - (G.lastAlertT || -99) > 12) {
    G.lastAlertT = G.time; G.lastAlert = { x: e.x, y: e.y };
    const what = e.kind === 'building' ? 'Your ' + BUILDINGS[e.type].name + ' is under attack!' : hasCls(UNITS[e.type], 'villager') ? 'Your villagers are under attack!' : 'Your army is under attack!';
    notify(what + ' (Home to view)', 'warn');
    Sound.play('alarm');
  }
  G.mmPings.push({ x: e.x, y: e.y, t: 0 });
}

function killEntity(e, killer, silent) {
  if (e.dead) return;
  e.dead = true;
  const N = G.map.N;
  if (e.kind === 'unit') {
    const d = UNITS[e.type];
    if (e.garrisonedIn) { const b = G.byId.get(e.garrisonedIn); if (b) { const i = b.garrison.indexOf(e.id); if (i >= 0) b.garrison.splice(i, 1); } }
    if (hasCls(d, 'animal') && d.food) {
      const c = addCarcass(e); G.carcassOf[e.id] = c.id;
    } else {
      G.decals.push({ type: 'corpse', ut: e.type, owner: e.owner, x: e.x, y: e.y, face: e.face, t: 0, life: 25, id: e.id });
      if (onScreenVisible(e.x, e.y)) Sound.play('die');
    }
    if (e.owner > 0 && !hasCls(d, 'animal')) {
      PL(e.owner).stats.lost++;
      if (killer && killer.owner > 0 && killer.owner !== e.owner) PL(killer.owner).stats.killed++;
    }
  } else if (e.kind === 'building') {
    const d = BUILDINGS[e.type];
    if (d.noBlock) markFarm(e, false); else blockTiles(e, false);
    if (e.garrison.length) ungarrison(e);
    for (const q of e.queue) { if (q.kind === 'tech') PL(e.owner).busy.delete(q.key); }
    if (d.wall) refreshWallMasks(e);
    if (!silent) {
      G.decals.push({ type: 'rubble', x: e.x, y: e.y, size: e.w, t: 0, life: 60 });
      for (let k = 0; k < 14 * e.w; k++) G.fx.push({ type: 'dust', x: e.tx + Math.random() * e.w, y: e.ty + Math.random() * e.h, z: Math.random() * 20, vz: 8 + Math.random() * 16, life: 1.5 + Math.random() * 1.5, t: 0, size: 6 + Math.random() * 8 });
      if (onScreenVisible(e.x, e.y)) Sound.play('collapse');
      PL(e.owner).stats.bldLost++;
      if (killer && killer.owner > 0 && killer.owner !== e.owner) PL(killer.owner).stats.razed++;
      if (e.owner === 1 && !d.wall) notify('Your ' + d.name + ' was destroyed.', 'warn');
    }
    if (G.wonder && G.wonder.id === e.id) G.wonder = null;
    G.minimapDirty = true;
  }
}

// ---------- projectiles & effects ----------
function spawnProjectile(src, t, kind, atk, atkType, bonus, blast, fromZ) {
  const sx = src.x, sy = src.y;
  let tx = t.x, ty = t.y;
  if (t.kind === 'unit' && t.moving && t.path && t.path[t.pi]) { const wp = t.path[t.pi]; const l = dist(t.x, t.y, wp[0], wp[1]) || 1; tx += (wp[0] - t.x) / l * 0.5; ty += (wp[1] - t.y) / l * 0.5; }
  if (t.kind === 'building') { const [cx, cy] = closestOnRect(sx, sy, t.tx + 0.2, t.ty + 0.2, t.tx + t.w - 0.2, t.ty + t.h - 0.2); tx = lerp(cx, t.x, 0.3); ty = lerp(cy, t.y, 0.3); }
  const dd = dist(sx, sy, tx, ty);
  const speed = kind === 'rock' || kind === 'boulder' ? 5.5 : kind === 'javelin' || kind === 'axe' ? 7 : 9;
  G.proj.push({ kind, x0: sx, y0: sy, z0: fromZ || 14, x1: tx, y1: ty, z1: t.kind === 'building' ? 18 : 10, t: 0, dur: Math.max(0.15, dd / speed), arc: Math.min(60, dd * (kind === 'rock' || kind === 'boulder' ? 9 : 4)),
    target: t.id, atk, atkType, bonus: bonus || {}, blast: blast || 0, src: src.id, owner: src.owner });
  if (onScreenVisible(sx, sy)) Sound.play(kind === 'rock' || kind === 'boulder' ? 'rock' : 'arrow');
}
function updateProjectiles(dt) {
  for (const p of G.proj) {
    p.t += dt;
    if (p.t < p.dur) continue;
    p.done = true;
    const src = G.byId.get(p.src) || { owner: p.owner, kind: 'unit', x: p.x0, y: p.y0, dead: true };
    if (p.blast) {
      const hits = [];
      forUnitsNear(p.x1, p.y1, p.blast + 0.5, v => { if (!v.dead && !v.garrisonedIn && v.owner !== 0) { const dd = dist(v.x, v.y, p.x1, p.y1); if (dd <= p.blast + UNITS[v.type].radius) hits.push([v, dd]); } });
      for (const b of G.buildings) { if (!b.dead && b.owner !== p.owner && distToRect(p.x1, p.y1, b.tx, b.ty, b.tx + b.w, b.ty + b.h) < p.blast * 0.5) hits.push([b, 0]); }
      for (const [v, dd] of hits) { const f = dd < p.blast * 0.5 ? 1 : 0.5; damage(v, calcDamage(p.atk, p.atkType, p.bonus, v) * f, src); }
      for (let k = 0; k < 10; k++) G.fx.push({ type: 'dust', x: p.x1 + rrange(-0.5, 0.5), y: p.y1 + rrange(-0.5, 0.5), z: 0, vz: 10 + Math.random() * 20, life: 1 + Math.random(), t: 0, size: 5 + Math.random() * 6 });
      if (onScreenVisible(p.x1, p.y1)) Sound.play('rock');
      continue;
    }
    const t = getEnt(p.target);
    if (!t || t.garrisonedIn) continue;
    let hit = false;
    if (t.kind === 'building') hit = true;
    else hit = dist(t.x, t.y, p.x1, p.y1) < 0.9 + UNITS[t.type].radius;
    if (hit) {
      damage(t, calcDamage(p.atk, p.atkType, p.bonus, t), src);
      if (t.kind === 'unit' && !hasCls(UNITS[t.type], 'siege') && Math.random() < 0.6) G.fx.push({ type: 'blood', x: t.x, y: t.y, z: 10, vz: 6, life: 0.5, t: 0 });
    } else if (p.kind === 'arrow' || p.kind === 'bolt') G.decals.push({ type: 'arrow', x: p.x1, y: p.y1, t: 0, life: 6, a: Math.atan2(p.y1 - p.y0, p.x1 - p.x0) });
  }
  G.proj = G.proj.filter(p => !p.done);
}
function updateFx(dt) {
  for (const f of G.fx) { f.t += dt; if (f.vz) f.z += f.vz * dt; if (f.vx) { f.x += f.vx * dt; f.y += f.vy * dt; } }
  G.fx = G.fx.filter(f => f.t < f.life);
  for (const d of G.decals) d.t += dt;
  G.decals = G.decals.filter(d => d.t < d.life);
}

// ---------- buildings ----------
function updateBuilding(b, dt) {
  const d = BUILDINGS[b.type], p = PL(b.owner);
  b.buildersPrev = b.buildersNow; b.buildersNow = 0;
  if (!b.built) return;
  // production
  if (b.queue.length) {
    const q = b.queue[0];
    if (q.kind === 'unit') {
      const type = q.type;
      if (q.t >= UNITS[type].time && p.pop >= p.popCap) { b.housed = true; if (b.owner === 1 && G.time - (G.housedMsgT || -99) > 20) { G.housedMsgT = G.time; notify('You need to build more houses.', 'warn'); } }
      else {
        b.housed = false; q.t += dt * p.trainMul;
        if (q.t >= UNITS[type].time && p.pop < p.popCap) { spawnFromBuilding(b, type); b.queue.shift(); }
      }
    } else {
      q.t += dt;
      if (q.t >= TECHS[q.key].time) { b.queue.shift(); completeTech(p, q.key); }
    }
  } else b.housed = false;
  // defensive fire
  if (d.attack && b.owner) {
    b.cool -= dt;
    if (b.cool <= 0) {
      const t = buildingTarget(b);
      if (t) {
        const n = bArrows(b), atk = bAtk(b);
        for (let k = 0; k < n; k++) {
          const src = { x: b.x + rrange(-b.w * 0.3, b.w * 0.3), y: b.y + rrange(-b.h * 0.3, b.h * 0.3), owner: b.owner, id: b.id, kind: 'building' };
          const tt = k === 0 ? t : (buildingTarget(b, true) || t);
          spawnProjectile(src, tt, 'arrow', atk, 'p', {}, 0, b.type === 'watch_tower' ? 60 : b.type === 'castle' ? 70 : 60);
        }
        b.cool = d.attack.reload;
      } else b.cool = 0.4;
    }
  }
  if (b.garrison.length) for (const id of b.garrison) { const u = G.byId.get(id); if (u && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + dt * 0.5); }
}
function buildingTarget(b, random) {
  const R = bRange(b); const cands = [];
  let best = null, bd = 1e9;
  forUnitsNear(b.x, b.y, R + b.w / 2 + 1, v => {
    if (v.dead || v.garrisonedIn || !isEnemy(b, v)) return;
    const dd = distToRect(v.x, v.y, b.tx, b.ty, b.tx + b.w, b.ty + b.h); if (dd > R) return;
    if (b.owner === 1 && !tileVisible(v.x, v.y) && !G.revealAll) return;
    if (random) cands.push(v);
    const sc = dd + (hasCls(UNITS[v.type], 'siege') && UNITS[v.type].armor[1] > 100 ? 20 : 0);
    if (sc < bd) { bd = sc; best = v; }
  });
  if (random && cands.length) return cands[Math.floor(Math.random() * cands.length)];
  return best;
}
function spawnFromBuilding(b, type) {
  const p = PL(b.owner);
  const tx = b.rally ? b.rally.x : b.x + b.w, ty = b.rally ? b.rally.y : b.y + b.h;
  const ax = b.x + (tx - b.x) / (dist(b.x, b.y, tx, ty) || 1) * (b.w / 2 + 0.7);
  const ay = b.y + (ty - b.y) / (dist(b.x, b.y, tx, ty) || 1) * (b.h / 2 + 0.7);
  const f = Path.nearestFree(ax, ay, 12) || [b.x + b.w / 2 + 0.5, b.y + b.h / 2 + 0.5];
  const u = spawnUnit(type, b.owner, f[0], f[1]);
  p.stats.trained++;
  if (b.owner === 1 && onScreenVisible(u.x, u.y)) Sound.play('train');
  if (b.rally) {
    const re = getEnt(b.rally.id);
    if (re && type === 'villager' && (re.kind === 'resource' || (re.kind === 'building' && re.type === 'farm'))) setOrder(u, { type: 'gather', target: re.id, sub: re.kind === 'building' ? 'farm' : re.sub });
    else if (re && type === 'villager' && re.kind === 'building' && !re.built) setOrder(u, { type: 'build', target: re.id });
    else setOrder(u, { type: 'move', rect: pointRect(b.rally.x, b.rally.y) });
  }
  if (G.aiOf[b.owner]) G.aiOf[b.owner].onUnitSpawned(u);
  return u;
}
function completeTech(p, key) {
  const t = TECHS[key];
  p.techs.add(key); p.busy.delete(key); p.stats.techs++;
  if (t.apply) t.apply(p);
  if (t.upgrade) {
    const [from, to] = t.upgrade; p.alias[from] = to;
    const line = LINES[from];
    for (const u of G.units) if (!u.dead && u.owner === p.id && line.indexOf(u.type) >= 0 && line.indexOf(u.type) < line.indexOf(to)) {
      const f = u.hp / u.maxHp; u.type = to; u.maxHp = uMaxHp(to, p.id); u.hp = Math.max(1, Math.round(u.maxHp * f));
    }
  }
  if (t.ageUp) {
    p.age = t.ageUp; p.ageTimes[t.ageUp] = G.time;
    if (p.civ === 'britons' && t.ageUp === 2) p.mods.arc.range += 1;
    if (p.id === 1) { Sound.play('age'); bigMessage(AGE_NAMES[p.age], 'Your civilization has advanced'); }
    else notify('The enemy has advanced to the ' + AGE_NAMES[p.age] + '.', 'enemy');
  } else if (p.id === 1) { Sound.play('research'); notify(t.name + ' researched.', 'good'); }
  // refresh hp for hp-affecting techs
  for (const u of G.units) if (!u.dead && u.owner === p.id) { const nm = uMaxHp(u.type, p.id); if (nm !== u.maxHp) { u.hp += nm - u.maxHp; u.maxHp = nm; } }
  for (const b of G.buildings) if (!b.dead && b.owner === p.id && b.type === 'farm' && b.built && (key === 'horse_collar' || key === 'heavy_plow')) b.amount += key === 'horse_collar' ? 75 : 125;
}

// availability of a production item: returns {ok, reason, hidden}
function techState(p, key) {
  const t = TECHS[key];
  if (p.techs.has(key)) return { hidden: true };
  for (const r of t.req) if (!p.techs.has(r)) return { hidden: true };
  if (t.ageUp) {
    if (p.age !== t.age) return { hidden: p.age > t.age, ok: false, reason: 'Requires ' + AGE_NAMES[t.age] };
    const have = new Set(G.buildings.filter(b => !b.dead && b.built && b.owner === p.id && t.reqB.indexOf(b.type) >= 0).map(b => b.type));
    if (have.size < 2) return { ok: false, reason: 'Requires 2 of: ' + t.reqB.map(k => BUILDINGS[k].name).join(', ') + ' (have ' + have.size + ')' };
  } else if (p.age < t.age) return { ok: false, reason: 'Requires ' + AGE_NAMES[t.age] };
  if (p.busy.has(key)) return { ok: false, reason: 'Already being researched', busy: true };
  if (t.ageUp && [...p.busy].some(k => TECHS[k].ageUp)) return { ok: false, reason: 'Already advancing' };
  return { ok: true };
}
function unitState(p, key) {
  const type = trainType(p, key), d = UNITS[type];
  if ((d.age || 0) > p.age) return { ok: false, reason: 'Requires ' + AGE_NAMES[d.age], type };
  return { ok: true, type };
}
function queueUnit(b, key, silentFail) {
  const p = PL(b.owner), st = unitState(p, key);
  if (!st.ok) return false;
  const cost = UNITS[st.type].cost;
  if (b.queue.length >= 10) return false;
  if (!canAfford(p, cost)) { if (!silentFail && p.id === 1) { notifyShort(cost, p); Sound.play('error'); } return false; }
  pay(p, cost); b.queue.push({ kind: 'unit', key, type: st.type, t: 0, cost });
  return true;
}
function queueTech(b, key, silentFail) {
  const p = PL(b.owner), st = techState(p, key);
  if (!st.ok) return false;
  const cost = techCost(p, key);
  if (!canAfford(p, cost)) { if (!silentFail && p.id === 1) { notifyShort(cost, p); Sound.play('error'); } return false; }
  pay(p, cost); b.queue.push({ kind: 'tech', key, t: 0, cost }); p.busy.add(key);
  return true;
}
function cancelQueue(b, idx) {
  const q = b.queue[idx]; if (!q) return;
  const p = PL(b.owner); refund(p, q.cost);
  if (q.kind === 'tech') p.busy.delete(q.key);
  b.queue.splice(idx, 1);
}
function notifyShort(cost, p) {
  const miss = RES.filter(r => cost[r] && p.res[r] < cost[r]);
  notify('Not enough ' + miss.join(' and ') + '.', 'warn');
}

// ---------- spatial grid ----------
const CELL = 4;
function rebuildGrid() {
  const gw = Math.ceil(G.map.N / CELL);
  if (!G.grid) { G.grid = []; for (let k = 0; k < gw * gw; k++) G.grid.push([]); G.gw = gw; }
  for (const c of G.grid) c.length = 0;
  for (const u of G.units) {
    if (u.dead || u.garrisonedIn) continue;
    const ci = clamp(Math.floor(u.x / CELL), 0, gw - 1), cj = clamp(Math.floor(u.y / CELL), 0, gw - 1);
    G.grid[cj * gw + ci].push(u);
  }
}
function forUnitsNear(x, y, r, fn) {
  const gw = G.gw;
  const i0 = clamp(Math.floor((x - r) / CELL), 0, gw - 1), i1 = clamp(Math.floor((x + r) / CELL), 0, gw - 1);
  const j0 = clamp(Math.floor((y - r) / CELL), 0, gw - 1), j1 = clamp(Math.floor((y + r) / CELL), 0, gw - 1);
  const r2 = r * r;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const cell = G.grid[j * gw + i];
    for (let k = 0; k < cell.length; k++) { const u = cell[k]; const dx = u.x - x, dy = u.y - y; if (dx * dx + dy * dy <= r2) fn(u); }
  }
}
function separateUnits(dt) {
  for (const u of G.units) {
    if (u.dead || u.garrisonedIn) continue;
    const du = UNITS[u.type];
    if (u.working && !u.moving) continue;
    forUnitsNear(u.x, u.y, 0.9, v => {
      if (v === u || v.dead) return;
      const dv = UNITS[v.type];
      const min = (du.radius + dv.radius) * 0.9;
      let dx = u.x - v.x, dy = u.y - v.y; let dd = Math.hypot(dx, dy);
      if (dd >= min) return;
      if (dd < 0.001) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; dd = Math.hypot(dx, dy); }
      const push = (min - dd) * (u.moving ? 0.25 : 0.5) * Math.min(1, dt * 12);
      const nx = u.x + dx / dd * push, ny = u.y + dy / dd * push;
      if (passAt(nx, ny)) { u.x = nx; u.y = ny; }
    });
  }
}

// ---------- fog of war (human player) ----------
function tileVisible(x, y) { const N = G.map.N, i = Math.floor(x), j = Math.floor(y); if (i < 0 || j < 0 || i >= N || j >= N) return false; return G.fog.vis[j * N + i] === 1; }
function tileExplored(i, j) { const N = G.map.N; if (i < 0 || j < 0 || i >= N || j >= N) return false; return G.fog.explored[j * N + i] === 1; }
function updateFog() {
  const N = G.map.N, vis = G.fog.vis, exp = G.fog.explored;
  vis.fill(0);
  const stamp = (x, y, r) => {
    const r2 = r * r, ci = Math.floor(x), cj = Math.floor(y), R = Math.ceil(r);
    for (let j = cj - R; j <= cj + R; j++) { if (j < 0 || j >= N) continue;
      for (let i = ci - R; i <= ci + R; i++) { if (i < 0 || i >= N) continue;
        const dx = i + 0.5 - x, dy = j + 0.5 - y; if (dx * dx + dy * dy <= r2) { const k = j * N + i; vis[k] = 1; exp[k] = 1; } } }
  };
  for (const u of G.units) if (!u.dead && !u.garrisonedIn && u.owner === 1) stamp(u.x, u.y, uLos(u) + 0.5);
  for (const b of G.buildings) if (!b.dead && b.owner === 1) stamp(b.x, b.y, BUILDINGS[b.type].los + b.w / 2);
  if (G.revealAll) { vis.fill(1); exp.fill(1); }
}
function onScreenVisible(x, y) {
  if (!G || !G.view) return false;
  const px = isoX(x, y), py = isoY(x, y), v = G.view;
  if (px < v.x0 - 50 || px > v.x1 + 50 || py < v.y0 - 50 || py > v.y1 + 80) return false;
  return G.revealAll || tileVisible(x, y);
}

// ---------- players ----------
function updatePlayers(dt) {
  for (const p of G.players) { p.pop = 0; p.popCap = 0; }
  for (const u of G.units) if (!u.dead && u.owner > 0 && !hasCls(UNITS[u.type], 'animal')) G.players[u.owner].pop++;
  for (const b of G.buildings) if (!b.dead && b.built && b.owner > 0 && BUILDINGS[b.type].pop) G.players[b.owner].popCap += BUILDINGS[b.type].pop;
  for (const p of G.players) p.popCap = Math.min(200, p.popCap);
}
function playerAlive(pid) {
  for (const u of G.units) if (!u.dead && u.owner === pid && !hasCls(UNITS[u.type], 'animal')) return true;
  for (const b of G.buildings) if (!b.dead && b.owner === pid && !BUILDINGS[b.type].wall && b.type !== 'farm' && (b.built || b.progress > 0.02)) return true;
  return false;
}

// ---------- commands (shared by UI & AI) ----------
function formationPoints(n, x, y) {
  const pts = [], cols = Math.ceil(Math.sqrt(n)), sp = 0.8;
  for (let k = 0; k < n; k++) {
    const r = Math.floor(k / cols), c = k % cols;
    const ox = (c - (cols - 1) / 2) * sp, oy = (r - (Math.ceil(n / cols) - 1) / 2) * sp;
    // rotate grid 45deg in tile space so the formation is screen-aligned
    let px = x + (ox + oy) * 0.707, py = y + (oy - ox) * 0.707;
    if (!passAt(px, py)) { const f = Path.nearestFree(px, py, 4); if (f) { px = f[0]; py = f[1]; } else { px = x; py = y; } }
    pts.push([px, py]);
  }
  return pts;
}
function cmdMove(units, x, y, amove) {
  if (!units.length) return;
  const pts = formationPoints(units.length, x, y);
  // assign nearest slots greedily
  const cx = units.reduce((s, u) => s + u.x, 0) / units.length, cy = units.reduce((s, u) => s + u.y, 0) / units.length;
  const order = units.slice().sort((a, b) => dist(a.x, a.y, x, y) - dist(b.x, b.y, x, y));
  const used = new Array(pts.length).fill(false);
  for (const u of order) {
    let bi = 0, bd = 1e9;
    for (let k = 0; k < pts.length; k++) { if (used[k]) continue; const dd = dist(u.x - cx + x, u.y - cy + y, pts[k][0], pts[k][1]); if (dd < bd) { bd = dd; bi = k; } }
    used[bi] = true;
    if (u.type === 'sheep' || UNITS[u.type].look === 'deer') { setOrder(u, { type: 'move', rect: pointRect(pts[bi][0], pts[bi][1]) }); continue; }
    setOrder(u, { type: amove ? 'amove' : 'move', rect: pointRect(pts[bi][0], pts[bi][1]) });
  }
}
function cmdSmart(units, x, y, t, pid, alt) {
  if (!units.length) return;
  const movers = [];
  for (const u of units) {
    const d = UNITS[u.type];
    if (!t) { movers.push(u); continue; }
    const vil = hasCls(d, 'villager');
    if (t.kind === 'unit') {
      const td = UNITS[t.type];
      if (hasCls(td, 'animal') && vil) setOrder(u, { type: 'gather', target: t.id, sub: td.herd ? 'sheep' : 'hunt' });
      else if (isEnemy(u, t) && !d.onlyBld) {
        if (hasCls(d, 'monk')) setOrder(u, { type: 'convert', target: t.id });
        else if (d.atk > 0) setOrder(u, { type: 'attack', target: t.id, forced: true });
        else movers.push(u);
      } else if (hasCls(td, 'animal') && vil && (t.owner === 0 || t.owner === u.owner)) setOrder(u, { type: 'gather', target: t.id, sub: td.herd ? 'sheep' : 'hunt' });
      else if (hasCls(td, 'animal') && t.owner === 0 && isMilitary(d) && !d.onlyBld) setOrder(u, { type: 'attack', target: t.id, forced: true });
      else if (t.owner === u.owner && hasCls(d, 'monk') && t.hp < t.maxHp) setOrder(u, { type: 'heal', target: t.id });
      else movers.push(u);
    } else if (t.kind === 'resource') {
      if (vil) setOrder(u, { type: 'gather', target: t.id, sub: t.sub }); else movers.push(u);
    } else if (t.kind === 'building') {
      const bd = BUILDINGS[t.type];
      if (isEnemy(u, t)) { if (d.atk > 0 && !hasCls(d, 'monk')) setOrder(u, { type: 'attack', target: t.id, forced: true }); else movers.push(u); }
      else if (t.owner === u.owner) {
        if (alt && bd.garrison && t.built && !hasCls(d, 'siege')) setOrder(u, { type: 'garrison', target: t.id });
        else if (vil && !t.built) setOrder(u, { type: 'build', target: t.id });
        else if (vil && t.type === 'farm') setOrder(u, { type: 'gather', target: t.id, sub: 'farm' });
        else if (vil && u.carryAmt > 0 && bd.drop.indexOf(u.carryType) >= 0) setOrder(u, { type: 'drop' });
        else if (vil && t.hp < t.maxHp) setOrder(u, { type: 'repair', target: t.id });
        else if (bd.garrison && t.built && !hasCls(d, 'siege') && (alt || (!vil && t.type !== 'town_center'))) setOrder(u, { type: 'garrison', target: t.id });
        else movers.push(u);
      } else movers.push(u);
    }
  }
  if (movers.length) cmdMove(movers, x, y, false);
}
function cmdStop(units) { for (const u of units) { setOrder(u, null); } }
function ringBell(pid, on) {
  if (on) {
    for (const u of G.units) {
      if (u.dead || u.owner !== pid || u.garrisonedIn || u.type !== 'villager') continue;
      let best = null, bd = 25;
      for (const b of G.buildings) {
        if (b.dead || b.owner !== pid || !b.built || !BUILDINGS[b.type].garrison || b.type === 'monastery') continue;
        const cap = BUILDINGS[b.type].garrison;
        const pending = G.units.filter(v => !v.dead && v.order && v.order.type === 'garrison' && v.order.target === b.id).length;
        if (b.garrison.length + pending >= cap) continue;
        const dd = dist(u.x, u.y, b.x, b.y); if (dd < bd) { bd = dd; best = b; }
      }
      if (best) { u.bellOrder = u.order && u.order.type !== 'garrison' ? u.order : null; setOrder(u, { type: 'garrison', target: best.id }); }
    }
    if (pid === 1) Sound.play('bell');
  } else {
    for (const b of G.buildings) if (!b.dead && b.owner === pid && b.garrison.length) ungarrison(b);
  }
}
function deleteEntity(e) {
  if (e.kind === 'building' && !e.built && e.progress < 0.01) refund(PL(e.owner), BUILDINGS[e.type].cost);
  if (e.kind === 'building') for (let i = e.queue.length - 1; i >= 0; i--) cancelQueue(e, i);
  killEntity(e, null);
}
function marketTrade(p, r, buy) {
  const price = p.market[r];
  if (buy) { if (p.res.gold < price) return false; p.res.gold -= price; p.res[r] += 100; p.market[r] = Math.min(9999, price + 6); }
  else { if (p.res[r] < 100) return false; p.res[r] -= 100; p.res.gold += Math.floor(price * 0.7); p.market[r] = Math.max(20, price - 6); }
  return true;
}

// ---------- main simulation step ----------
function simulate(dt) {
  G.time += dt;
  rebuildGrid();
  updatePlayers(dt);
  for (let i = 0, n = G.units.length; i < n; i++) { const u = G.units[i]; if (!u.dead && !u.garrisonedIn) updateUnit(u, dt); }
  for (let i = 0, n = G.buildings.length; i < n; i++) { const b = G.buildings[i]; if (!b.dead) updateBuilding(b, dt); }
  separateUnits(dt);
  updateProjectiles(dt);
  updateFx(dt);
  // herdable animals join whoever is near them
  G.herdT = (G.herdT || 0) - dt;
  if (G.herdT <= 0) {
    G.herdT = 0.5;
    for (const sh of G.units) {
      if (sh.dead || !UNITS[sh.type].herd) continue;
      let own = false, other = 0;
      forUnitsNear(sh.x, sh.y, 3.5, v => { if (v.dead || v.owner === 0 || hasCls(UNITS[v.type], 'animal')) return; if (v.owner === sh.owner) own = true; else other = v.owner; });
      if (other && !own) { sh.owner = other; sh.order = null; if (other === 1 && !G.demo && G.time - (G.sheepMsgT || -99) > 30) { G.sheepMsgT = G.time; notify('You found sheep! Bring them to your Town Center.', 'good'); } }
    }
  }
  // carcass decay
  for (const r of G.resources) if (!r.dead && r.type === 'carcass') { r.decay += dt; if (r.decay > 8 && Math.random() < dt * 0.25) { r.amount -= 1; if (r.amount <= 0) depleteResource(r); } }
  // building fire & smoke effects
  for (const b of G.buildings) {
    if (b.dead || !b.built) continue;
    const dmg = 1 - b.hp / b.maxHp;
    if (dmg > 0.35 && Math.random() < dt * dmg * 10 * b.w) G.fx.push({ type: 'fire', x: b.tx + 0.3 + Math.random() * (b.w - 0.6), y: b.ty + 0.3 + Math.random() * (b.h - 0.6), z: 10 + Math.random() * 25, vz: 18, life: 0.7 + Math.random() * 0.5, t: 0, size: 4 + Math.random() * 5 });
    if (b.type === 'blacksmith' && Math.random() < dt * 2.5) G.fx.push({ type: 'smoke', x: b.tx + 1.0, y: b.ty + 1.0, z: 68, vz: 16, vx: 0.15, vy: -0.15, life: 2.2, t: 0, size: 4 });
    if (b.type === 'town_center' && Math.random() < dt * 0.8) G.fx.push({ type: 'smoke', x: b.tx + 0.9, y: b.ty + 1.2, z: 60, vz: 12, vx: 0.1, vy: -0.1, life: 2.5, t: 0, size: 3 });
  }
  // cleanup
  if (G.units.some(u => u.dead)) { for (const u of G.units) if (u.dead) G.byId.delete(u.id); G.units = G.units.filter(u => !u.dead); }
  if (G.buildings.some(b => b.dead)) { for (const b of G.buildings) if (b.dead) G.byId.delete(b.id); G.buildings = G.buildings.filter(b => !b.dead); }
  if (G.resources.some(r => r.dead)) { for (const r of G.resources) if (r.dead) G.byId.delete(r.id); G.resources = G.resources.filter(r => !r.dead); }
  // wonder
  if (G.wonder) { G.wonder.t -= dt; if (G.wonder.t <= 0 && !G.over) endGame(G.wonder.owner === 1, 'wonder'); }
  G.fogT -= dt; if (G.fogT <= 0) { G.fogT = 0.2; updateFog(); G.fogDirty = true; }
  G.checkT -= dt;
  if (G.checkT <= 0 && !G.over) {
    G.checkT = 1;
    if (!playerAlive(2)) endGame(true, 'conquest');
    else if (!playerAlive(1)) endGame(false, 'conquest');
  }
  for (const k in G.aiOf) G.aiOf[k].update(dt);
}
