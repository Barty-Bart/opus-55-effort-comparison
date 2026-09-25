// Computer opponent: runs an economy, follows a build order, advances ages, builds a
// counter-composition army, defends its town and launches escalating attack waves.
import { UNITS, BUILDINGS, TECHS, LINES, DIFFICULTY } from './config.js';
import { distToRect } from './util.js';

const AGE_TECH = ['feudal', 'castle', 'imperial'];
const ECO_TECHS = new Set(['wheelbarrow', 'doublebitaxe', 'horsecollar', 'goldmining', 'bowsaw', 'heavyplow', 'handcart', 'goldshaft', 'twomansaw', 'croprotation']);

const DISTRIBUTION = [
  { food: 0.56, wood: 0.40, gold: 0.04, stone: 0 },
  { food: 0.44, wood: 0.34, gold: 0.18, stone: 0.04 },
  { food: 0.40, wood: 0.24, gold: 0.28, stone: 0.08 },
  { food: 0.38, wood: 0.24, gold: 0.30, stone: 0.08 },
];

const RESEARCH = [
  [],
  [['towncenter', 'wheelbarrow'], ['lumbercamp', 'doublebitaxe'], ['mill', 'horsecollar'], ['miningcamp', 'goldmining'],
    ['blacksmith', 'fletching'], ['blacksmith', 'forging'], ['blacksmith', 'scalemail'], ['barracks', 'up_manatarms'],
    ['blacksmith', 'paddedarcher'], ['blacksmith', 'scalebarding']],
  [['lumbercamp', 'bowsaw'], ['mill', 'heavyplow'], ['towncenter', 'handcart'], ['miningcamp', 'goldshaft'],
    ['archeryrange', 'up_crossbow'], ['barracks', 'up_pikeman'], ['blacksmith', 'bodkin'], ['blacksmith', 'ironcasting'],
    ['blacksmith', 'chainbarding'], ['blacksmith', 'leatherarcher'], ['blacksmith', 'chainmail'], ['barracks', 'up_longsword'],
    ['archeryrange', 'up_eliteskirm'], ['miningcamp', 'stonemining'], ['stable', 'up_lightcav']],
  [['lumbercamp', 'twomansaw'], ['mill', 'croprotation'], ['archeryrange', 'up_arbalester'], ['stable', 'up_cavalier'],
    ['blacksmith', 'blastfurnace'], ['blacksmith', 'bracer'], ['blacksmith', 'platebarding'], ['barracks', 'up_halberdier'],
    ['blacksmith', 'platemail'], ['blacksmith', 'ringarcher'], ['siegeworkshop', 'up_cappedram'], ['siegeworkshop', 'up_onager'],
    ['barracks', 'up_twohanded'], ['castle', 'up_elitelongbow'], ['stable', 'up_paladin']],
];

function power(u) {
  if (u.isVillager) return 0.25;
  if (u.def.tc === 'monk') return 0.5;
  if (u.def.tc === 'siege') return u.def.onlyBuildings ? 0.6 : 2;
  return (u.maxHp / 45) * ((u.atk + 3) / 7) * (u.range > 0 ? 1.2 : 1);
}

export class AIController {
  constructor(game, player, difficulty) {
    this.game = game;
    this.player = player;
    this.p = player;
    this.d = DIFFICULTY[difficulty] || DIFFICULTY.standard;
    this.thinkT = Math.random() * 0.5;
    this.base = { x: player.start.x, y: player.start.y };
    this.attack = null;
    this.nextAttackT = this.d.firstAttack * (0.9 + Math.random() * 0.2);
    this.waveNum = 0;
    this.threatClearT = 0;
    this.reserve = {};
    this.lastBalanceT = 0;
    this.scoutStep = 0;
    this.skipTechs = new Set();
    for (const age of RESEARCH) for (const [, id] of age) if (Math.random() > this.d.techs) this.skipTechs.add(id);
    this.pending = new Map(); // type -> time of last placement attempt
    const c = game.map.N / 2;
    const dx = c - this.base.x, dy = c - this.base.y, l = Math.hypot(dx, dy) || 1;
    this.rally = { x: this.base.x + (dx / l) * 8, y: this.base.y + (dy / l) * 8 };
    this.towardCenter = { x: dx / l, y: dy / l };
  }

  update(dt) {
    this.thinkT -= dt;
    if (this.thinkT > 0) return;
    this.thinkT = this.d.think;
    if (this.p.defeated) return;
    this.census();
    if (this.checkResign()) return;
    this.planAge();
    this.manageResearch();
    this.manageEconomy();
    this.manageBuildings();
    this.manageMilitary();
    this.manageArmy();
    this.manageScoutAndSheep();
    this.useMarket();
  }

  // --------------------------------------------------------------- census
  census() {
    const g = this.game, p = this.p;
    this.vills = []; this.military = []; this.monks = []; this.sheep = []; this.idle = [];
    this.task = { food: 0, wood: 0, gold: 0, stone: 0, build: 0 };
    for (const u of g.units) {
      if (u.dead || u.owner !== p.id) continue;
      if (u.animal) { this.sheep.push(u); continue; }
      if (u.isVillager) {
        this.vills.push(u);
        if (u.garrisonedIn) continue;
        const o = u.order;
        if (!o) { this.idle.push(u); continue; }
        if (o.type === 'gather') {
          const k = o.kind;
          const r = k === 'wood' ? 'wood' : k === 'gold' ? 'gold' : k === 'stone' ? 'stone' : 'food';
          this.task[r]++;
          u.aiRes = r;
        } else if (o.type === 'build') { this.task.build++; u.aiRes = 'build'; }
        else if (o.type === 'dropoff') { this.task[u.carryType || 'food']++; }
      } else if (u.def.tc === 'monk') this.monks.push(u);
      else this.military.push(u);
    }
    this.bld = {};
    this.done = {};
    for (const b of g.buildings) {
      if (b.dead || b.owner !== p.id) continue;
      (this.bld[b.type] || (this.bld[b.type] = [])).push(b);
      if (b.complete) this.done[b.type] = (this.done[b.type] || 0) + 1;
    }
    this.tcs = (this.bld.towncenter || []).filter((b) => b.complete);
    if (this.tcs.length) { this.base = { x: this.tcs[0].x, y: this.tcs[0].y }; }
    // food left in herdables, carcasses and bushes near home
    let nf = 0;
    const b = this.base;
    for (const r of g.resources) if (!r.dead && (r.type === 'berry' || r.type === 'carcass') && Math.hypot(r.x - b.x, r.y - b.y) < 20) nf += r.amount;
    for (const s of this.sheep) nf += s.def.food;
    this.naturalFood = nf;
  }
  count(type) { return (this.bld[type] || []).length; }

  checkResign() {
    const g = this.game, p = this.p;
    if (this.tcs.length === 0 && this.vills.length === 0 && this.military.length < 3 && g.time > 60) {
      g.emit('notify', { text: `${p.name} has resigned.`, type: 'alert' });
      g.resign(p);
      return true;
    }
    return false;
  }

  canSpend(cost, ignoreReserve = false) {
    const p = this.p;
    for (const k in cost) {
      const r = ignoreReserve ? 0 : this.reserve[k] || 0;
      if (p.res[k] - r < cost[k]) return false;
    }
    return true;
  }

  // --------------------------------------------------------------- age
  planAge() {
    const g = this.game, p = this.p;
    this.reserve = {};
    const tech = AGE_TECH[p.age];
    if (!tech || p.ageResearching || !this.tcs.length) return;
    const target = this.d.villTarget[p.age];
    const vc = this.vills.length;
    const minTime = [0, 420, 900][p.age] * (this.d.think > 1.5 ? 1.3 : 1);
    if (vc < target - (p.age === 0 ? 0 : 3) || g.time < minTime) return;
    if (g.ageReqCount(p) < 2) return; // manageBuildings will add requirements
    const cost = TECHS[tech].cost;
    this.reserve = { ...cost };
    if (p.canAfford(cost)) {
      const tc = this.tcs[0];
      tc.research(tech);
      this.reserve = {};
    }
  }

  // --------------------------------------------------------------- economy
  manageEconomy() {
    const g = this.game, p = this.p;
    const target = this.d.villTarget[p.age] + (p.ageResearching ? 3 : 0);
    let queued = 0;
    for (const tc of this.tcs) for (const it of tc.queue) if (it.kind === 'unit') queued++;
    for (const tc of this.tcs) {
      if (tc.queue.some((it) => it.kind === 'tech' && TECHS[it.id].ageUp)) continue;
      const keep = this.vills.length >= 12 ? (this.reserve.food || 0) : 0;
      if (this.vills.length + queued < target && tc.queue.length < 2 && p.res.food >= 50 + keep && p.pop < p.popCap) {
        if (tc.train('villager')) queued++;
      }
    }
    // houses
    const building = (this.bld.house || []).filter((b) => !b.complete).length;
    const prodCount = (this.done.barracks || 0) + (this.done.archeryrange || 0) + (this.done.stable || 0) + this.tcs.length;
    const margin = 2 + prodCount * 1.5 + p.age;
    if (p.popCap < 200 && p.pop + margin >= p.popCap && building < (p.age >= 2 ? 2 : 1) && p.res.wood >= 25) {
      this.construct('house', 1);
    }
    // idle villagers
    const dist = this.distribution();
    const total = this.vills.length;
    for (const u of this.idle) {
      if (u.order || u.dead) continue;
      let best = 'food', bd = -1e9;
      for (const r of ['food', 'wood', 'gold', 'stone']) {
        const deficit = dist[r] * total - this.task[r];
        if (deficit > bd) { bd = deficit; best = r; }
      }
      if (this.assign(u, best)) this.task[best]++;
    }
    // periodic rebalance
    if (g.time - this.lastBalanceT > 18) {
      this.lastBalanceT = g.time;
      let over = null, under = null, om = 0, um = 0;
      for (const r of ['food', 'wood', 'gold', 'stone']) {
        const diff = this.task[r] - dist[r] * total;
        if (diff > om) { om = diff; over = r; }
        if (-diff > um) { um = -diff; under = r; }
      }
      if (over && under && om >= 2 && um >= 2) {
        const movers = this.vills.filter((u) => u.aiRes === over && !u.garrisonedIn && u.order && u.order.kind !== 'farm').slice(0, Math.min(3, Math.floor(um)));
        for (const u of movers) this.assign(u, under);
      }
    }
  }

  distribution() {
    const p = this.p;
    const base = { ...DISTRIBUTION[p.age] };
    if (this.vills.length < 12) { base.food = 0.62; base.wood = 0.38; base.gold = 0; base.stone = 0; }
    if (p.age === 0 && this.vills.length >= 16) { base.gold = 0.06; base.food -= 0.03; base.wood -= 0.03; }
    if (p.age >= 2 && !this.count('castle') && this.d.techs >= 0.85 && p.res.stone < 650) { base.stone += 0.06; base.food -= 0.03; base.wood -= 0.03; }
    // stockpile-based nudges: starve nothing, hoard nothing
    for (const r of ['food', 'wood', 'gold', 'stone']) {
      const stock = p.res[r];
      base[r] *= Math.min(1.5, Math.max(0.25, 1.45 - stock / 900));
    }
    if (p.res.stone > 700) base.stone = 0.01;
    // bank wood for farms before the berries and sheep run out
    if (this.naturalFood !== undefined && this.naturalFood < 900 && (this.bld.farm || []).length < this.task.food) base.wood += 0.12;
    const s = base.food + base.wood + base.gold + base.stone;
    for (const r in base) base[r] /= s;
    return base;
  }

  assign(u, res) {
    const g = this.game, p = this.p, b = this.base;
    const go = (t, kind) => { u.setOrder({ type: 'gather', target: t, kind, phase: 'go' }); u.aiRes = res; return true; };
    if (res === 'food') {
      // herdables & carcasses near town first
      let t = g.findResource(p.id, 'sheep', b.x, b.y, 12, u);
      if (t && Math.hypot(t.x - b.x, t.y - b.y) < 12 && !(t.kind === 'unit' && t.animal === 'hunt' && Math.hypot(t.x - b.x, t.y - b.y) > 9)) return go(t, t.kind === 'unit' && t.animal === 'hunt' ? 'hunt' : 'sheep');
      t = g.findResource(p.id, 'forage', b.x, b.y, 16, u);
      if (t) {
        const mill = g.findDropSite(p.id, 'food', t.x, t.y);
        const md = mill ? distToRect(t.x, t.y, mill.tx, mill.ty, mill.tx + mill.size, mill.ty + mill.size) : 99;
        if (md > 4 && !this.count('mill') && p.res.wood >= 100) {
          const site = this.placeNear('mill', t.x, t.y, 1, 5, [u]);
          if (site) return true;
        }
        if (this.task.food < 7 || md <= 4) return go(t, 'forage');
      }
      t = g.findResource(p.id, 'farm', b.x, b.y, 16, u);
      if (t) return go(t, 'farm');
      if (p.res.wood >= 60 && (this.count('mill') || this.done.mill)) {
        if (this.buildFarm(u)) return true;
      }
      if (t = g.findResource(p.id, 'forage', b.x, b.y, 22, u)) return go(t, 'forage');
      if ((t = g.findResource(p.id, 'hunt', b.x, b.y, 13, u)) && Math.hypot(t.x - b.x, t.y - b.y) < 13) return go(t, 'hunt');
      if (!this.count('mill') && p.res.wood >= 100) { if (this.placeNear('mill', b.x + 3, b.y + 3, 3, 9, [u])) return true; }
      res = 'wood';
    }
    if (res === 'wood') {
      const drops = [...this.tcs, ...(this.bld.lumbercamp || []).filter((c) => c.complete)];
      let best = null, bd = 1e9;
      for (const d of drops) {
        const t = g.findResource(p.id, 'wood', d.x, d.y, 9, u);
        if (!t) continue;
        const dd = distToRect(t.x, t.y, d.tx, d.ty, d.tx + d.size, d.ty + d.size);
        if (dd < bd) { bd = dd; best = t; }
      }
      const campPending = (this.bld.lumbercamp || []).some((c) => !c.complete);
      if ((!best || bd > 5) && !campPending && p.res.wood >= 100) {
        const tree = this.bestTreeCluster();
        if (tree && this.placeNear('lumbercamp', tree.x, tree.y, 1, 4, [u], (tx, ty) => -this.treesAround(tx + 1, ty + 1, 4))) return true;
      }
      if (best) return go(best, 'wood');
      const t = g.findResource(p.id, 'wood', b.x, b.y, 30, u);
      if (t) return go(t, 'wood');
      return false;
    }
    if (res === 'gold' || res === 'stone') {
      const camps = [...this.tcs, ...(this.bld.miningcamp || []).filter((c) => c.complete)];
      let best = null, bd = 1e9;
      for (const d of camps) {
        const t = g.findResource(p.id, res, d.x, d.y, 8, u);
        if (!t) continue;
        const dd = distToRect(t.x, t.y, d.tx, d.ty, d.tx + d.size, d.ty + d.size);
        if (dd < bd) { bd = dd; best = t; }
      }
      const campPending = (this.bld.miningcamp || []).some((c) => !c.complete);
      if ((!best || bd > 4) && !campPending && p.res.wood >= 100) {
        const mine = g.findResource(p.id, res, b.x, b.y, 30, u);
        if (mine && this.placeNear('miningcamp', mine.x, mine.y, 1, 4, [u], (tx, ty) => this.minesAround(res, tx + 1, ty + 1) * -1)) return true;
      }
      if (best) return go(best, res);
      const t = g.findResource(p.id, res, b.x, b.y, 35, u);
      if (t) return go(t, res);
      return this.assign(u, 'wood');
    }
    return false;
  }

  treesAround(x, y, r) {
    const map = this.game.map;
    let n = 0;
    for (let j = y - r; j <= y + r; j++) for (let i = x - r; i <= x + r; i++) {
      const o = map.objAt(i, j);
      if (o && o.kind === 'resource' && o.type === 'tree') n++;
    }
    return n;
  }
  minesAround(res, x, y) {
    const map = this.game.map;
    let n = 0;
    for (let j = y - 3; j <= y + 3; j++) for (let i = x - 3; i <= x + 3; i++) {
      const o = map.objAt(i, j);
      if (o && o.kind === 'resource' && o.type === res) n++;
    }
    return n;
  }

  bestTreeCluster() {
    const g = this.game, map = g.map, b = this.base;
    let best = null, bs = 1e9;
    const R = 26;
    for (let j = Math.floor(b.y) - R; j <= b.y + R; j += 2) for (let i = Math.floor(b.x) - R; i <= b.x + R; i += 2) {
      const o = map.objAt(i, j);
      if (!o || o.kind !== 'resource' || o.type !== 'tree' || !g.resourceAccessible(o)) continue;
      const d = Math.hypot(i - b.x, j - b.y);
      if (d < 6) continue;
      const dens = this.treesAround(i, j, 3);
      if (dens < 8) continue;
      // avoid existing camps
      const camps = this.bld.lumbercamp || [];
      if (camps.some((c) => Math.hypot(c.x - i, c.y - j) < 7)) continue;
      const s = d - dens * 0.35;
      if (s < bs) { bs = s; best = o; }
    }
    return best;
  }

  // Find a building spot near (cx, cy) and send builders there.
  placeNear(type, cx, cy, minR, maxR, builders, scoreFn) {
    const g = this.game, p = this.p;
    const def = BUILDINGS[type];
    if (!p.canAfford(def.cost) || g.buildingRequirement(p, type)) return null;
    const spot = this.findSpot(type, cx, cy, minR, maxR, scoreFn);
    if (!spot) return null;
    const b = g.placeFoundation(p, type, spot.x, spot.y, true);
    if (!b) return null;
    for (const u of builders) { u.setOrder({ type: 'build', target: b }); u.aiRes = 'build'; }
    this.pending.set(type, g.time);
    return b;
  }

  // Is the ring around a prospective building reachable from the town center?
  reachable(tx, ty, s) {
    const g = this.game;
    const tc = this.tcs[0];
    if (!tc) return true;
    const from = tc.spawnPoint(tx, ty);
    const res = g.pf.find(Math.floor(from.x), Math.floor(from.y), { x0: tx, y0: ty, x1: tx + s - 1, y1: ty + s - 1, adj: true }, 4000);
    return res.reached;
  }

  findSpot(type, cx, cy, minR, maxR, scoreFn) {
    const g = this.game, map = g.map, p = this.p;
    const s = BUILDINGS[type].size;
    const needGap = type !== 'farm' && type !== 'palisade' && type !== 'stonewall';
    const allowRes = type === 'mill' || type === 'lumbercamp' || type === 'miningcamp' || type === 'farm';
    const cands = [];
    const ox = Math.floor(cx - s / 2), oy = Math.floor(cy - s / 2);
    for (let r = minR; r <= maxR; r++) {
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
        const tx = ox + i, ty = oy + j;
        if (!g.canPlaceBuilding(p, type, tx, ty)) continue;
        if (needGap && !this.ringFree(tx, ty, s, allowRes)) continue;
        cands.push({ x: tx, y: ty, sc: scoreFn ? scoreFn(tx, ty) + r * 0.3 : r });
      }
      if (cands.length >= 12) break;
    }
    cands.sort((a, b) => a.sc - b.sc);
    // drop sites nestle against resources: make sure they don't seal anyone in
    const check = allowRes && type !== 'farm';
    for (let i = 0; i < Math.min(cands.length, check ? 6 : 1); i++) {
      if (!check || this.reachable(cands[i].x, cands[i].y, s)) return cands[i];
    }
    return null;
  }
  ringFree(tx, ty, s, allowRes = false) {
    const map = this.game.map;
    for (let j = ty - 1; j <= ty + s; j++) for (let i = tx - 1; i <= tx + s; i++) {
      if (i >= tx && i < tx + s && j >= ty && j < ty + s) continue;
      if (!map.inb(i, j)) return false;
      const k = j * map.N + i;
      if (map.blocked[k] === 3) return false;
      const o = map.obj[k];
      if (!allowRes && o && o.kind === 'resource' && o.type !== 'tree') return false;
    }
    return true;
  }

  buildFarm(u) {
    const g = this.game;
    const anchors = [...this.tcs, ...(this.bld.mill || []).filter((m) => m.complete)];
    for (const a of anchors) {
      const spot = this.findSpot('farm', a.x, a.y, Math.ceil(a.size / 2) + 1, Math.ceil(a.size / 2) + 5,
        (tx, ty) => Math.hypot(tx + 1.5 - a.x, ty + 1.5 - a.y));
      if (spot) {
        const f = g.placeFoundation(this.p, 'farm', spot.x, spot.y, true);
        if (f) { u.setOrder({ type: 'build', target: f }); u.aiRes = 'food'; return true; }
      }
    }
    return false;
  }

  // Place a building with a couple of nearby builders.
  construct(type, nBuilders = 1, near = null) {
    const g = this.game, p = this.p;
    const last = this.pending.get(type);
    if (last !== undefined && g.time - last < 4) return null;
    const def = BUILDINGS[type];
    if (!this.canSpend(def.cost, type === 'house')) return null;
    const c = near || this.base;
    let spot;
    if (type === 'house') spot = this.findSpot(type, c.x - this.towardCenter.x * 4, c.y - this.towardCenter.y * 4, 4, 14, (tx, ty) => Math.hypot(tx - c.x, ty - c.y) * 0.5 + (this.treesAround(tx, ty, 1) ? 3 : 0));
    else if (def.attack || type === 'castle') spot = this.findSpot(type, c.x + this.towardCenter.x * 7, c.y + this.towardCenter.y * 7, 2, 12);
    else spot = this.findSpot(type, c.x + this.towardCenter.x * 3, c.y + this.towardCenter.y * 3, 5, 16, (tx, ty) => Math.abs(Math.hypot(tx - c.x, ty - c.y) - 9));
    if (!spot) return null;
    const b = g.placeFoundation(p, type, spot.x, spot.y, true);
    if (!b) return null;
    this.pending.set(type, g.time);
    // builders: nearest villagers, preferring wood/idle over farmers
    const cands = this.vills.filter((u) => !u.garrisonedIn && !(u.order && (u.order.type === 'build')) && !(u.order && u.order.kind === 'farm'));
    cands.sort((a, b2) => Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(b2.x - b.x, b2.y - b.y));
    for (const u of cands.slice(0, nBuilders)) { u.setOrder({ type: 'build', target: b }); u.aiRes = 'build'; }
    return b;
  }

  nearestVills(pt, n) {
    const c = this.vills.filter((u) => !u.garrisonedIn && !(u.order && (u.order.type === 'build' || u.order.kind === 'farm')));
    c.sort((a, b) => Math.hypot(a.x - pt.x, a.y - pt.y) - Math.hypot(b.x - pt.x, b.y - pt.y));
    return c.slice(0, n);
  }

  staffFoundations() {
    const g = this.game;
    const unstaffed = [];
    for (const b of g.buildings) {
      if (b.dead || b.owner !== this.p.id || b.complete) continue;
      if (!this.vills.some((u) => u.order && u.order.type === 'build' && u.order.target === b)) unstaffed.push(b);
    }
    for (const b of unstaffed) {
      const cands = this.vills.filter((u) => !u.garrisonedIn && !(u.order && (u.order.type === 'build' || u.order.kind === 'farm')) && u.aiRes !== 'fight');
      let best = null, bd = 1e9;
      for (const u of cands) { const d = Math.hypot(u.x - b.x, u.y - b.y); if (d < bd) { bd = d; best = u; } }
      if (best) { best.setOrder({ type: 'build', target: b }); best.aiRes = 'build'; }
    }
  }

  manageBuildings() {
    const g = this.game, p = this.p;
    const vc = this.vills.length;
    this.staffFoundations();
    const want = (type, n, builders = 1) => {
      if (this.count(type) >= n) return false;
      if (g.buildingRequirement(p, type)) return false;
      return !!this.construct(type, builders);
    };
    // don't start two optional buildings in the same think
    if (p.age === 0) {
      if (vc >= 8 && !this.count('mill') && p.res.wood >= 100) {
        const berry = g.findResource(p.id, 'forage', this.base.x, this.base.y, 16);
        if (berry ? this.placeNear('mill', berry.x, berry.y, 1, 5, this.nearestVills(berry, 1)) : want('mill', 1)) return;
      }
      if (vc >= 10 && want('barracks', 1, 2)) return;
      if (vc >= this.d.villTarget[0] - 3 && g.ageReqCount(p) < 2) {
        if (!this.count('mill') && want('mill', 1)) return;
        if (!this.count('lumbercamp') && want('lumbercamp', 1)) return;
        if (!this.count('miningcamp') && want('miningcamp', 1)) return;
      }
      return;
    }
    if (p.age >= 1) {
      if (want('barracks', 1, 2)) return;
      if (want('archeryrange', 1, 2)) return;
      if (vc >= 20 && want('blacksmith', 1, 2)) return;
      if (vc >= 24 && want('stable', 1, 2)) return;
      if (p.age === 1 && vc >= this.d.villTarget[1] - 4 && g.ageReqCount(p) < 2 && want('market', 1, 2)) return;
      if (vc >= 28 && this.d.think <= 1.2 && want('market', 1, 1)) return;
    }
    if (p.age >= 2) {
      if (want('siegeworkshop', 1, 2)) return;
      if (this.d.think <= 1.2 && p.res.stone >= 650 && want('castle', 1, 5)) return;
      if (vc >= 35 && want('monastery', 1, 2)) return;
      if (vc >= 35 && want('archeryrange', 2, 2)) return;
      if (vc >= 40 && want('stable', 2, 2)) return;
      if (p.age === 2 && vc >= this.d.villTarget[2] - 4 && g.ageReqCount(p) < 2 && want('monastery', 1, 2)) return;
      if (this.d.think <= 0.8 && vc >= 30 && want('watchtower', 1, 2)) return;
    }
    if (p.age >= 3) {
      if (this.d.think <= 0.8 && vc >= 50 && g.time > 2400 && want('wonder', 1, 8)) return;
      if (vc >= 45 && want('barracks', 2, 2)) return;
      if (vc >= 50 && want('stable', 3, 2)) return;
      if (vc >= 50 && want('siegeworkshop', 2, 2)) return;
    }
    // housekeeping: idle builders get re-used by economy automatically
  }

  manageResearch() {
    const g = this.game, p = this.p;
    this.savingTech = null;
    if (!this.tcs.length) return;
    // loom before feudal or when harassed
    if (!p.techs.has('loom') && (this.vills.length >= this.d.villTarget[0] - 2 || (p.lastAttacked && g.time - p.lastAttacked.t < 10))) {
      const tc = this.tcs[0];
      if (tc.queue.length <= 1 && this.canSpend(TECHS.loom.cost)) tc.research('loom');
    }
    let started = 0;
    for (let age = 1; age <= p.age; age++) {
      for (const [btype, id] of RESEARCH[age]) {
        if (started >= 2) return;
        if (this.skipTechs.has(id) || !g.techAvailable(p, id)) continue;
        const bs = (this.bld[btype] || []).filter((b) => b.complete);
        if (!bs.length) continue;
        const b = bs.find((x) => x.queue.length === 0) || (btype !== 'towncenter' ? null : bs.find((x) => x.queue.length <= 1));
        if (!b) continue;
        if (!this.techWorthIt(id)) continue;
        if (!this.canSpend(TECHS[id].cost)) {
          // economy upgrades are worth saving for
          if (ECO_TECHS.has(id) && !this.savingTech) {
            this.savingTech = id;
            for (const k in TECHS[id].cost) this.reserve[k] = Math.max(this.reserve[k] || 0, TECHS[id].cost[k]);
          }
          continue;
        }
        if (b.research(id)) started++;
      }
    }
  }
  techWorthIt(id) {
    const m = this.military;
    const has = (pred) => m.some(pred);
    switch (id) {
      case 'up_manatarms': case 'up_longsword': case 'up_twohanded': return has((u) => u.def.sprite === 'sword');
      case 'up_pikeman': case 'up_halberdier': return has((u) => u.def.sprite === 'spear');
      case 'up_lightcav': return has((u) => u.def.sprite === 'scout');
      case 'up_paladin': return this.p.res.gold > 1500;
      case 'scalebarding': case 'chainbarding': case 'platebarding': return has((u) => u.def.tc === 'cavalry');
      case 'up_eliteskirm': return has((u) => u.def.sprite === 'skirm');
      case 'up_elitelongbow': return has((u) => u.def.sprite === 'longbow');
      case 'up_cappedram': return has((u) => u.def.sprite === 'ram');
      case 'up_onager': return has((u) => u.def.sprite === 'mangonel');
      default: return true;
    }
  }

  // --------------------------------------------------------------- military
  enemyComposition() {
    const g = this.game, p = this.p;
    const c = { cav: 0, arch: 0, inf: 0, siege: 0, total: 0 };
    for (const u of g.units) {
      if (u.dead || u.animal || !g.isEnemy(p.id, u.owner) || !u.isMilitary) continue;
      c.total++;
      const cl = u.def.classes;
      if (cl.includes('cavalry')) c.cav++;
      else if (cl.includes('archer')) c.arch++;
      else if (cl.includes('siege')) c.siege++;
      else c.inf++;
    }
    return c;
  }

  manageMilitary() {
    const g = this.game, p = this.p;
    if (!this.tcs.length && this.vills.length === 0) return;
    if (p.age === 0) {
      // a token defence force in the Dark Age on higher difficulties
      if (this.d.think > 0.8 || this.military.length >= 3 || this.vills.length < 14) return;
    }
    if (this.military.length >= this.d.maxMilitary) return;
    if (p.pop >= p.popCap) return;
    const comp = this.enemyComposition();
    const lowGold = p.res.gold < 120;
    const counts = {};
    for (const u of this.military) counts[u.def.sprite] = (counts[u.def.sprite] || 0) + 1;
    const tryTrain = (b, line) => {
      if (g.lineAge(line) > p.age) return false;
      const type = LINES[line][p.lineTier[line] || 0];
      if (!this.canSpend(UNITS[type].cost)) return false;
      return b.train(line) > 0;
    };
    const rnd = Math.random();
    for (const b of g.buildings) {
      if (b.dead || b.owner !== p.id || !b.complete || b.queue.length >= 2) continue;
      switch (b.type) {
        case 'barracks': {
          const wantSpear = p.age >= 1 && (comp.cav > comp.inf * 0.6 || rnd < 0.3);
          if (wantSpear || lowGold) { if (p.age >= 1) tryTrain(b, 'spear'); }
          else tryTrain(b, 'sword');
          break;
        }
        case 'archeryrange': {
          const wantSkirm = comp.arch >= 4 && comp.arch >= comp.inf;
          if (wantSkirm || lowGold) tryTrain(b, 'skirm');
          else if (p.age >= 2 && rnd < 0.25) tryTrain(b, 'cavarcher') || tryTrain(b, 'archer');
          else tryTrain(b, 'archer');
          break;
        }
        case 'stable': {
          if (p.age >= 2 && !lowGold && (comp.cav < comp.total * 0.6 || rnd < 0.5)) tryTrain(b, 'knight') || tryTrain(b, 'scout');
          else if (rnd < 0.6) tryTrain(b, 'scout');
          break;
        }
        case 'siegeworkshop': {
          const rams = counts.ram || 0, mangs = counts.mangonel || 0;
          if (rams < (p.age >= 3 ? 3 : 2)) tryTrain(b, 'ram');
          else if (mangs < 2 && comp.inf + comp.arch >= 8) tryTrain(b, 'mangonel');
          break;
        }
        case 'castle': {
          if (p.age >= 3 && (counts.trebuchet || 0) < 2 && rnd < 0.4) tryTrain(b, 'trebuchet');
          else if (rnd < 0.5) tryTrain(b, 'longbow');
          break;
        }
        case 'monastery': {
          if (this.monks.length < 3) tryTrain(b, 'monk');
          break;
        }
      }
    }
  }

  findThreat() {
    const g = this.game, p = this.p;
    const mine = g.buildings.filter((b) => !b.dead && b.owner === p.id && b.type !== 'palisade' && b.type !== 'stonewall');
    const threats = [];
    for (const u of g.units) {
      if (u.dead || u.animal || u.garrisonedIn || !g.isEnemy(p.id, u.owner)) continue;
      if (u.isVillager && !(u.order && u.order.type === 'attack')) continue;
      let near = false;
      for (const b of mine) {
        const d = distToRect(u.x, u.y, b.tx, b.ty, b.tx + b.size, b.ty + b.size);
        if (d < (b.type === 'towncenter' ? 12 : 6)) { near = true; break; }
      }
      if (near) threats.push(u);
    }
    if (!threats.length) return null;
    let x = 0, y = 0, pw = 0;
    for (const u of threats) { x += u.x; y += u.y; pw += power(u); }
    return { units: threats, x: x / threats.length, y: y / threats.length, power: pw };
  }

  manageArmy() {
    const g = this.game, p = this.p;
    const army = this.military;
    const threat = this.findThreat();
    const inWave = (u) => this.attack && this.attack.units.has(u);
    if (threat) {
      this.threatClearT = g.time;
      let home = army.filter((u) => !inWave(u));
      const homePower = home.reduce((s, u) => s + power(u), 0);
      if (this.attack && homePower < threat.power) {
        // recall the wave to defend
        for (const u of this.attack.units) if (!u.dead) home.push(u);
        this.endWave(false);
      }
      for (const u of home) {
        if (u.dead) continue;
        if (u.order && u.order.type === 'attack' && !u.order.target.dead && u.order.target.kind === 'unit') continue;
        let best = null, bd = 1e9;
        for (const t of threat.units) {
          if (!u.canAttack(t)) continue;
          const d = Math.hypot(t.x - u.x, t.y - u.y);
          if (d < bd) { bd = d; best = t; }
        }
        if (best) u.setOrder({ type: 'attack', target: best });
      }
      const defPower = home.reduce((s, u) => s + power(u), 0);
      // units that can actually hurt villagers, close to the town
      const danger = threat.units.filter((u) => !u.def.onlyBuildings && (u.isMilitary || u.def.tc === 'monk'));
      const dangerPower = danger.reduce((s, u) => s + power(u), 0);
      const nearTown = danger.some((u) => this.tcs.some((tc) => Math.hypot(u.x - tc.x, u.y - tc.y) < 9));
      const villsHit = g.time - (p.lastVillHit ?? -99) < 3;
      if (nearTown && villsHit) this.dangerT = g.time;
      const rams = threat.units.filter((u) => u.def.onlyBuildings);
      if ((dangerPower <= 2.2 && defPower < dangerPower) || (rams.length && !danger.length && defPower < 1)) {
        // villagers chase off tiny raids and hack rams apart themselves
        const targets = danger.length ? danger : rams;
        const fighters = this.vills.filter((u) => !u.garrisonedIn).sort((a, b) => Math.hypot(a.x - threat.x, a.y - threat.y) - Math.hypot(b.x - threat.x, b.y - threat.y)).slice(0, rams.length && !danger.length ? 8 : 5);
        for (const v of fighters) {
          if (Math.hypot(v.x - threat.x, v.y - threat.y) > 12) continue;
          if (v.order && v.order.type === 'attack') continue;
          const t = targets[Math.floor(Math.random() * targets.length)];
          if (v.canAttack(t)) { v.setOrder({ type: 'attack', target: t }); v.aiRes = 'fight'; }
        }
      } else if (dangerPower > 2.2 && nearTown && villsHit && defPower < dangerPower * 0.8 && !p.bellRung && this.tcs.length && g.time - (this.clearT || -99) > 25) {
        g.ringBell(p);
        this.bellT = g.time;
      }
    }
    if (p.bellRung && (g.time - (this.dangerT || 0) > 8 || g.time - (this.bellT || 0) > 40)) { g.allClear(p); this.clearT = g.time; }
    if (!threat) for (const v of this.vills) if (v.aiRes === 'fight' && !v.order) v.aiRes = null;
    // monks convert
    for (const m of this.monks) {
      if (m.faith < 1 || (m.order && m.order.type === 'convert')) continue;
      const e = g.findTarget(m, m.los, {});
      if (e && !e.isVillager && e.def.tc !== 'siege' && e.def.tc !== 'monk') m.setOrder({ type: 'convert', target: e });
      else if (!m.order && this.attack && this.attack.units.size) {
        const lead = [...this.attack.units].find((u) => !u.dead);
        if (lead) m.setOrder({ type: 'move', x: lead.x - 1, y: lead.y - 1 });
      }
    }
    // attack waves
    if (this.attack) this.updateWave();
    else if (!threat) {
      const home = army.filter((u) => !u.order);
      for (const u of home) {
        if (Math.hypot(u.x - this.rally.x, u.y - this.rally.y) > 5 && u.def.sprite !== 'scout' || (u.def.sprite === 'scout' && g.time > 300 && Math.hypot(u.x - this.rally.x, u.y - this.rally.y) > 5)) {
          u.setOrder({ type: 'move', x: this.rally.x + (Math.random() - 0.5) * 4, y: this.rally.y + (Math.random() - 0.5) * 4 });
        }
      }
      const size = this.d.waveBase + this.waveNum * this.d.waveGrow;
      const fighters = army.filter((u) => u.def.sprite !== 'scout' || p.age >= 2 || g.time > 600);
      if (g.time >= this.nextAttackT && fighters.length >= Math.min(size, 45)) this.launchWave(fighters);
      else if (g.time >= this.nextAttackT + 240 && fighters.length >= Math.max(4, size * 0.6)) this.launchWave(fighters);
    }
  }

  pickTarget(from) {
    const g = this.game, p = this.p;
    let best = null, bs = 1e9;
    for (const b of g.buildings) {
      if (b.dead || !g.isEnemy(p.id, b.owner)) continue;
      const d = Math.hypot(b.x - from.x, b.y - from.y);
      let s = d;
      if (b.def.wall) s += 25;
      if (b.type === 'farm' || b.type === 'house') s += 4;
      if (b.def.attack && b.type !== 'towncenter') s += 6;
      if (b.type === 'wonder') s -= 40;
      if (s < bs) { bs = s; best = b; }
    }
    return best;
  }

  launchWave(units) {
    const target = this.pickTarget(this.base);
    if (!target) return;
    this.waveNum++;
    this.attack = { units: new Set(units), target, startSize: units.length, startT: this.game.time, retargetT: 0 };
    this.orderWave(target);
  }

  orderWave(target) {
    const g = this.game;
    const units = [...this.attack.units].filter((u) => !u.dead);
    const siege = units.filter((u) => u.def.onlyBuildings);
    const rest = units.filter((u) => !u.def.onlyBuildings);
    const tx = target.x, ty = target.y + (target.size ? target.size / 2 + 1 : 0);
    g.cmdAttackMove(rest, tx, ty);
    for (const s of siege) s.setOrder({ type: 'attack', target });
    this.attack.target = target;
  }

  updateWave() {
    const g = this.game, a = this.attack;
    for (const u of a.units) if (u.dead || u.owner !== this.p.id) a.units.delete(u);
    if (a.units.size < Math.max(2, a.startSize * 0.3)) { this.endWave(true); return; }
    const alive = [...a.units];
    let cx = 0, cy = 0;
    for (const u of alive) { cx += u.x; cy += u.y; }
    cx /= alive.length; cy /= alive.length;
    if (!a.target || a.target.dead) {
      const t = this.pickTarget({ x: cx, y: cy });
      if (!t) { this.endWave(false); return; }
      this.orderWave(t);
      return;
    }
    // idle members get re-issued the attack
    const idle = alive.filter((u) => !u.order);
    if (idle.length) {
      const t = this.pickTarget({ x: cx, y: cy });
      if (t) {
        const siege = idle.filter((u) => u.def.onlyBuildings);
        g.cmdAttackMove(idle.filter((u) => !u.def.onlyBuildings), t.x, t.y + t.size / 2 + 1);
        for (const s of siege) s.setOrder({ type: 'attack', target: t });
      }
    }
    // reinforcements from home join in
    for (const u of this.military) {
      if (a.units.has(u) || u.order) continue;
      if (g.time - a.startT < 120) { a.units.add(u); u.setOrder({ type: 'attackMove', x: cx, y: cy }); }
    }
  }

  endWave(retreat) {
    const g = this.game;
    if (this.attack) {
      if (retreat) {
        const units = [...this.attack.units].filter((u) => !u.dead);
        g.cmdMove(units, this.rally.x, this.rally.y);
      }
    }
    this.attack = null;
    this.nextAttackT = g.time + this.d.attackGap * (retreat ? 1 : 0.6);
  }

  manageScoutAndSheep() {
    const g = this.game;
    // sheep are walked to the town center
    if (this.tcs.length) {
      const tc = this.tcs[0];
      for (const s of this.sheep) {
        if (s.animal !== 'herd' || s.order) continue;
        const d = Math.hypot(s.x - tc.x, s.y - tc.y);
        if (d > 5) s.setOrder({ type: 'move', x: tc.x + (Math.random() - 0.5) * 3, y: tc.ty + tc.size + 1 + Math.random() * 1.5 });
      }
    }
    // the scout circles the base early on, finding sheep
    if (g.time < 300) {
      for (const u of this.military) {
        if (u.def.sprite !== 'scout' || u.order) continue;
        this.scoutStep++;
        const a = this.scoutStep * 1.1;
        const r = 10 + (this.scoutStep % 4) * 3;
        const x = this.base.x + Math.cos(a) * r, y = this.base.y + Math.sin(a) * r;
        if (g.map.passableF(x, y)) u.setOrder({ type: 'move', x, y });
      }
    }
  }

  useMarket() {
    const g = this.game, p = this.p;
    if (!this.done.market || this.d.think > 1.5) return;
    for (const r of ['food', 'wood', 'stone']) {
      if (p.res[r] > (r === 'stone' ? (this.count('castle') ? 700 : 1400) : 1500) && p.res.gold < 400) { g.trade(p, 'sell', r); return; }
    }
    if (p.res.food < 150 && p.res.wood > 900 && p.res.gold < 200) { g.trade(p, 'sell', 'wood'); return; }
    if (p.res.food < 150 && p.res.gold > 400) { g.trade(p, 'buy', 'food'); return; }
    if (p.res.gold > 1500) {
      const need = ['food', 'wood'].find((r) => p.res[r] < 200);
      if (need) g.trade(p, 'buy', need);
    }
  }
}
