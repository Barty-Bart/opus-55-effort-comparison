// Computer opponent. Plays by the same rules and commands as the human player.
import { UNITS, BUILDINGS, TECHS } from './data.js';
import { RNG } from './rng.js';

export const AI_LEVELS = {
  easy: {
    label: 'Easy', think: 2.2, vils: [16, 22, 28, 32], milBuildings: [1, 1, 2, 3], armyCap: 22, attackSize: [0, 5, 8, 12],
    firstAttack: 1150, attackGap: 320, research: 0.35, counter: 0, farmsMax: 16, boar: false, extraTC: 0, towers: 0,
    retreat: 0.2, bonus: 0.9, castle: false,
  },
  standard: {
    label: 'Standard', think: 1.3, vils: [20, 28, 40, 48], milBuildings: [1, 2, 3, 4], armyCap: 45, attackSize: [0, 7, 12, 18],
    firstAttack: 800, attackGap: 220, research: 0.7, counter: 0.6, farmsMax: 26, boar: true, extraTC: 1, towers: 1,
    retreat: 0.3, bonus: 1, castle: true,
  },
  hard: {
    label: 'Hard', think: 0.75, vils: [22, 31, 52, 64], milBuildings: [1, 3, 5, 7], armyCap: 75, attackSize: [0, 6, 13, 22],
    firstAttack: 620, attackGap: 150, research: 1, counter: 1, farmsMax: 36, boar: true, extraTC: 2, towers: 2,
    retreat: 0.3, bonus: 1.05, castle: true,
  },
  hardest: {
    label: 'Hardest', think: 0.5, vils: [23, 33, 58, 72], milBuildings: [1, 3, 6, 8], armyCap: 95, attackSize: [0, 6, 13, 24],
    firstAttack: 560, attackGap: 120, research: 1, counter: 1, farmsMax: 40, boar: true, extraTC: 2, towers: 2,
    retreat: 0.3, bonus: 1.25, castle: true,
  },
};

const STRATS = {
  archers: {
    1: [['archer', 6], ['skirm', 2], ['spear', 1]],
    2: [['archer', 5], ['knight', 3], ['skirm', 1], ['mangonel', 0.7], ['ram', 0.8]],
    3: [['archer', 5], ['knight', 3], ['skirm', 1], ['ram', 1.6], ['mangonel', 1], ['treb', 0.4]],
  },
  knights: {
    1: [['scout', 5], ['archer', 2], ['spear', 1]],
    2: [['knight', 6], ['archer', 2], ['spear', 1], ['ram', 1]],
    3: [['knight', 6], ['archer', 2], ['spear', 1], ['ram', 1.6], ['treb', 0.6]],
  },
  infantry: {
    1: [['militia', 5], ['spear', 3], ['archer', 1]],
    2: [['militia', 5], ['spear', 2], ['archer', 2], ['ram', 1.5]],
    3: [['militia', 5], ['spear', 2], ['archer', 2], ['ram', 2], ['knight', 1], ['treb', 0.4]],
  },
  castle: {
    1: [['archer', 4], ['spear', 2], ['scout', 2]],
    2: [['longbow', 5], ['knight', 3], ['spear', 1], ['ram', 1]],
    3: [['longbow', 5], ['knight', 3], ['spear', 1], ['ram', 1], ['treb', 0.5]],
  },
};
const PRODUCER = {
  militia: 'barracks', spear: 'barracks', archer: 'archeryRange', skirm: 'archeryRange', cavArcher: 'archeryRange',
  scout: 'stable', knight: 'stable', ram: 'siegeWorkshop', mangonel: 'siegeWorkshop', longbow: 'castle', treb: 'castle', monk: 'monastery',
};
const ECO_TECHS = [
  'doubleBitAxe', 'horseCollar', 'wheelbarrow', 'goldMining', 'bowSaw', 'heavyPlow', 'handCart', 'goldShaftMining',
  'twoManSaw', 'cropRotation', 'stoneMining', 'townWatch', 'treadmillCrane', 'masonry',
];
const LINE_TECHS = {
  militia: ['manAtArms', 'longSwordsman', 'twoHanded', 'forging', 'scaleMail', 'ironCasting', 'chainMail', 'blastFurnace', 'plateMail'],
  spear: ['pikeman', 'halberdier', 'scaleMail', 'chainMail', 'plateMail', 'forging'],
  archer: ['fletching', 'paddedArcherArmor', 'bodkinArrow', 'crossbowman', 'leatherArcherArmor', 'thumbRing', 'ballistics', 'bracer', 'arbalester', 'ringArcherArmor', 'chemistry'],
  skirm: ['eliteSkirmisher', 'fletching', 'paddedArcherArmor'],
  longbow: ['fletching', 'bodkinArrow', 'paddedArcherArmor', 'leatherArcherArmor', 'thumbRing', 'ballistics', 'bracer', 'chemistry'],
  scout: ['bloodlines', 'forging', 'scaleBarding', 'lightCavalry', 'husbandry'],
  knight: ['bloodlines', 'forging', 'scaleBarding', 'ironCasting', 'chainBarding', 'husbandry', 'cavalier', 'blastFurnace', 'plateBarding'],
  ram: ['cappedRam'], mangonel: ['onager', 'chemistry'], treb: [],
};

const TAUNTS = {
  attack: ['Prepare yourself!', 'My army marches on your lands.', 'Your fields will burn!', 'Surrender now and I may spare your people.', 'Steel will decide this.', 'For the crown!'],
  age: ['A new age dawns for my kingdom.', 'My people prosper — can yours keep pace?', 'My smiths have learned new secrets.'],
  castle: ['My castle stands. Come and break it, if you can.'],
};

export class AI {
  constructor(game, player, level = 'standard', seed = 1) {
    this.g = game;
    this.p = player;
    this.level = level;
    this.cfg = AI_LEVELS[level] || AI_LEVELS.standard;
    this.rng = new RNG((seed * 2654435761) >>> 0);
    this.nextThink = 0.5 + this.rng.next() * this.cfg.think;
    const st = player.start;
    this.home = { x: st.cx, y: st.cy };
    const strats = level === 'easy' ? ['archers', 'infantry', 'knights'] : ['archers', 'knights', 'infantry', 'archers', 'knights', 'castle'];
    this.strat = strats[Math.floor(this.rng.next() * strats.length)];
    this.attack = null;
    this.attacksLaunched = 0;
    this.lastAttackEnd = 0;
    this.siegeWanted = -1; // time a wave was beaten back by towers / Town Center arrows
    this.scoutPhase = 0;
    this.scoutId = null;
    this.bellT = -1;
    this.enemySeen = { cavalry: 0, archer: 0, infantry: 0, siege: 0, total: 0 };
    this.lastPlace = {};
    this.boarHunt = null;
    player.gatherBonus = this.cfg.bonus;
    this.errors = 0;
  }

  // ------------------------------------------------------------- helpers
  get pi() { return this.p.index; }
  tcs() { return this.p.buildings.filter((b) => b.alive && b.type === 'townCenter' && b.complete); }
  count(type, complete = false) { return this.p.buildings.filter((b) => b.alive && b.type === type && (!complete || b.complete)).length; }
  pending(type) { return this.p.buildings.some((b) => b.alive && b.type === type && !b.complete); }
  vils() { return this.p.units.filter((u) => u.alive && u.isVillager && !u.garrisonedIn); }
  army() { return this.p.units.filter((u) => u.alive && u.isMilitary && !u.garrisonedIn && u.id !== this.scoutId); }
  afford(cost, reserve = null) {
    const r = this.p.res;
    for (const k in cost) {
      const need = cost[k] + (reserve && reserve[k] ? reserve[k] : 0);
      if (r[k] < need) return false;
    }
    return true;
  }
  enemies() { return this.g.players.filter((q) => q.alive && this.g.isEnemy(this.pi, q.index)); }

  jobOf(u) {
    const o = u.order;
    if (!o) return null;
    if (this.boarHunt && this.boarHunt.lure === u && this.boarHunt.phase !== 'kill') return 'build';
    if (o.type === 'build' || o.type === 'repair') return 'build';
    if (o.type === 'gather') {
      const t = o.target;
      if (!t) return o.kind === 'wood' ? 'wood' : o.kind === 'gold' ? 'gold' : o.kind === 'stone' ? 'stone' : 'food';
      if (t.kind === 'building' || t.kind === 'unit') return 'food';
      return t.res;
    }
    if (o.type === 'return') return u.carryType || (o.resume && o.resume.target && o.resume.target.res) || 'food';
    if (o.type === 'garrison') return 'garrison';
    if (o.type === 'flee') return 'flee';
    return null;
  }

  // ------------------------------------------------------------- main loop
  update() {
    const g = this.g;
    if (g.time < this.nextThink) return;
    this.nextThink = g.time + this.cfg.think;
    try {
      this.think();
    } catch (e) {
      this.errors++;
      if (this.errors < 5) console.error('AI error', e);
    }
  }

  think() {
    const g = this.g;
    if (this.p.age > (this.saidAge || 0)) { this.saidAge = this.p.age; if (this.rng.next() < 0.45) this.say('age'); }
    if (!this.saidCastle && this.p.buildings.some((b) => b.type === 'castle' && b.complete)) { this.saidCastle = true; this.say('castle'); }
    this.tc = this.tcs()[0] || null;
    if (this.tc) this.home = { x: this.tc.x, y: this.tc.y };
    this.vilList = this.vils();
    this.armyList = this.army();
    this.updateIntel();
    this.checkResign();
    if (!this.p.alive) return;
    this.reserve = this.computeReserve();
    this.defend();
    this.trainVillagers();
    this.manageHouses();
    this.manageAgeUp();
    this.manageEconomy();
    this.manageSheep();
    this.manageBuildings();
    this.manageResearch();
    this.trainMilitary();
    this.manageScout();
    this.manageAttack();
    this.manageMarket();
    this.repairBuildings();
    void g;
  }

  say(kind) {
    const lines = TAUNTS[kind];
    if (!lines || this.g.time - (this.lastSay || -999) < 120) return;
    this.lastSay = this.g.time;
    this.g.emit({ type: 'chat', player: this.pi, text: lines[Math.floor(this.rng.next() * lines.length)] });
  }

  checkResign() {
    const g = this.g;
    if (g.time < 600) return;
    const vils = this.vilList.length, army = this.armyList.length;
    const hasTC = this.p.buildings.some((b) => b.alive && b.type === 'townCenter');
    const canRebuild = this.p.age >= 2 && vils > 0 && this.p.res.wood >= 275 && this.p.res.stone >= 100;
    if (!hasTC && vils < 3 && army < 3 && !canRebuild) {
      g.emit({ type: 'chat', player: this.pi, text: 'I resign. Well played!' });
      g.cmdResign(this.pi);
    }
  }

  updateIntel() {
    const g = this.g, n = g.n, vis = this.p.visible;
    const seen = { cavalry: 0, archer: 0, infantry: 0, siege: 0, total: 0 };
    for (const q of this.enemies()) {
      for (const u of q.units) {
        if (!u.alive || !u.isMilitary || u.garrisonedIn) continue;
        if (!vis[Math.floor(u.y) * n + Math.floor(u.x)] && g.opts.reveal !== 'all') continue;
        const c = u.def.classes;
        if (c.includes('cavalry')) seen.cavalry++;
        if (c.includes('archer')) seen.archer++;
        if (c.includes('infantry')) seen.infantry++;
        if (c.includes('siege')) seen.siege++;
        seen.total++;
      }
    }
    const e = this.enemySeen, k = 0.85;
    for (const key in seen) e[key] = e[key] * k + seen[key] * (1 - k) * 3;
  }

  computeReserve() {
    const p = this.p, g = this.g;
    const vils = this.vilList.length;
    const res = { food: 0, wood: 0, gold: 0, stone: 0 };
    const next = p.age + 1;
    if (next <= 3 && !this.ageResearching()) {
      const tech = TECHS[['feudalAge', 'castleAge', 'imperialAge'][p.age]];
      const target = this.cfg.vils[p.age];
      if (vils >= target - 3 || g.time > [900, 1700, 2600][p.age]) {
        for (const k in tech.cost) res[k] += tech.cost[k];
      }
    }
    if (this.wantCastle()) res.stone = Math.max(res.stone, 650);
    return res;
  }
  ageResearching() { return ['feudalAge', 'castleAge', 'imperialAge'].some((t) => this.p.researching.has(t)); }
  wantCastle() { return this.cfg.castle && this.p.age >= 2 && this.count('castle') === 0 && (this.strat === 'castle' || this.p.age >= 3 || this.vilList.length > 40); }

  // ------------------------------------------------------------- villagers
  trainVillagers() {
    const age = Math.min(3, this.p.age);
    const target = this.cfg.vils[age] + (age < 3 && !this.ageResearching() ? 3 : 0);
    const vils = this.p.countUnits((u) => u.isVillager);
    for (const tc of this.tcs()) {
      if (tc.queue.length >= 2) continue;
      const queued = this.tcs().reduce((a, b) => a + b.queue.filter((q) => q.kind === 'unit').length, 0);
      if (vils + queued >= target) break;
      // keep the TC busy; the age-up click cancels queued villagers when it is time
      const saving = this.reserve.food > 0 && vils >= target && this.p.res.food >= this.reserve.food - 60;
      if (this.p.res.food >= 50 && !saving) this.g.cmdTrain(tc, 'villager', 1);
      if (!tc.rally) {
        const r = this.g.findResourceNear(this.pi, ['sheep', 'hunt'], tc.x, tc.y, 10);
        if (r) this.g.cmdRally(tc, r.x, r.y, r);
      }
    }
  }

  manageHouses() {
    const p = this.p;
    if (p.popCap >= 200) return;
    const producing = p.buildings.filter((b) => b.alive && b.complete && b.queue.length && b.queue[0].kind === 'unit').length;
    const margin = 2 + producing * 2 + (p.age >= 2 ? 3 : 0);
    const pendingHouses = p.buildings.filter((b) => b.alive && b.type === 'house' && !b.complete).length;
    if (p.popCap - p.pop > margin) return;
    if (pendingHouses >= (p.pop > 50 ? 2 : 1)) return;
    if (p.res.wood < 25) return;
    this.placeNearBase('house', { minDist: 5, maxDist: 16, gap: 1 }, 1);
  }

  // Place a building near the base (or given spot). Returns foundation or null.
  placeNearBase(type, opts = {}, builders = 1, at = null, prefer = null) {
    const g = this.g;
    const c = at || this.home;
    if (!g.canBuildType(this.pi, type).ok) return null;
    if (!g.canAfford(this.pi, BUILDINGS[type].cost)) return null;
    const last = this.lastPlace[type] || -99;
    if (g.time - last < 4) return null;
    const spot = g.findPlacement(this.pi, type, c.x, c.y, { ignoreFog: true, ...opts });
    if (!spot) return null;
    const bx = spot.x + BUILDINGS[type].size / 2, by = spot.y + BUILDINGS[type].size / 2;
    const cand = this.vilList.filter((u) => {
      const j = this.jobOf(u);
      return j !== 'build' && j !== 'garrison' && j !== 'flee' && (!prefer || prefer.includes(j));
    });
    const pool = cand.length ? cand : this.vilList.filter((u) => this.jobOf(u) !== 'garrison');
    pool.sort((a, b) => (a.x - bx) ** 2 + (a.y - by) ** 2 - ((b.x - bx) ** 2 + (b.y - by) ** 2));
    const r = g.cmdPlace(this.pi, type, spot.x, spot.y, pool.slice(0, builders));
    if (r.ok) { this.lastPlace[type] = g.time; return r.building; }
    return null;
  }

  // ------------------------------------------------------------- economy
  desiredShares() {
    const p = this.p, vils = this.vilList.length;
    let w;
    if (p.age === 0) {
      if (vils < 7) w = { food: 1, wood: 0, gold: 0, stone: 0 };
      else if (vils < 11) w = { food: 0.6, wood: 0.4, gold: 0, stone: 0 };
      else w = { food: 0.58, wood: 0.42, gold: 0, stone: 0 };
      if (this.ageResearching()) w = { food: 0.45, wood: 0.4, gold: 0.15, stone: 0 };
    } else if (p.age === 1) w = { food: 0.46, wood: 0.34, gold: 0.17, stone: 0.03 };
    else if (p.age === 2) w = { food: 0.4, wood: 0.3, gold: 0.24, stone: 0.06 };
    else w = { food: 0.36, wood: 0.28, gold: 0.29, stone: 0.07 };
    if (p.age >= 1) {
      const tot = { food: 0, wood: 0, gold: 0, stone: 0 };
      for (const [line, wt] of this.wantedMix()) {
        const c = UNITS[p.lineTier[line]].cost;
        for (const k in c) tot[k] += c[k] * wt;
      }
      const sum = tot.food + tot.wood + tot.gold + tot.stone;
      if (sum > 0) for (const k in w) w[k] = w[k] * 0.7 + (tot[k] / sum) * 0.3;
    }
    for (const k of ['food', 'wood', 'gold', 'stone']) {
      const deficit = (this.reserve[k] || 0) - p.res[k];
      if (deficit > 0) w[k] += Math.min(0.3, deficit / 1800);
    }
    if (this.wantCastle() && p.res.stone < 650) { w.stone += 0.08; w.food -= 0.04; w.wood -= 0.04; }
    if (this.cfg.towers && p.age >= 1 && p.res.stone < 150) w.stone = Math.max(w.stone, 0.04);
    for (const k of ['food', 'wood', 'gold', 'stone']) {
      const have = p.res[k] - (this.reserve[k] || 0);
      if (have > 1500) w[k] *= 0.3;
      else if (have > 700) w[k] *= 0.55;
      else if (have < 100 && k !== 'stone') w[k] *= k === 'wood' ? 1.6 : 1.35;
    }
    if (!this.knownMine('gold')) { w.food += w.gold * 0.5; w.wood += w.gold * 0.5; w.gold = 0; }
    if (!this.knownMine('stone')) { w.wood += w.stone; w.stone = 0; }
    const s = w.food + w.wood + w.gold + w.stone;
    for (const k in w) w[k] /= s;
    return w;
  }

  knownMine(type) {
    if (!this._mineCache || this.g.time - this._mineCache.t > 10) this._mineCache = { t: this.g.time };
    if (this._mineCache[type] !== undefined) return this._mineCache[type];
    const r = this.g.resources.find((x) => x.alive && x.type === type && Math.hypot(x.x - this.home.x, x.y - this.home.y) < 60 && this.g.reachableNode(x));
    return (this._mineCache[type] = !!r);
  }

  // How many of our villagers already work each resource.
  buildCrowd() {
    const c = new Map();
    for (const u of this.vilList) {
      const o = u.order;
      const t = o && (o.type === 'gather' ? o.target : o.type === 'return' && o.resume ? o.resume.target : null);
      if (t) c.set(t, (c.get(t) || 0) + 1);
    }
    this.crowd = c;
  }
  crowded(t) {
    const n = (this.crowd && this.crowd.get(t)) || 0;
    const lim = t.kind === 'unit' ? 7 : t.type === 'carcass' ? 7 : t.type === 'berries' || t.type === 'fish' ? 2 : t.type === 'tree' ? 2 : t.type === 'gold' || t.type === 'stone' ? 3 : 1;
    return n >= lim;
  }
  take(u, t) { u.command({ type: 'gather', target: t }); if (this.crowd) this.crowd.set(t, (this.crowd.get(t) || 0) + 1); }

  manageEconomy() {
    this.buildCrowd();
    const vils = this.vilList;
    const counts = { food: 0, wood: 0, gold: 0, stone: 0 };
    const idle = [];
    let builders = 0;
    for (const u of vils) {
      const j = this.jobOf(u);
      if (j === 'build') builders++;
      else if (j in counts) counts[j]++;
      else if (j === null) idle.push(u);
    }
    const shares = this.desiredShares();
    const workforce = vils.length - builders;
    const want = {};
    for (const k in counts) want[k] = shares[k] * workforce;
    this.ensureDropSites(counts, want);
    for (const u of idle) {
      let best = 'food', bd = -1e9;
      for (const k in want) { const d = want[k] - counts[k]; if (d > bd) { bd = d; best = k; } }
      if (this.assign(u, best)) counts[best]++;
      else {
        let ok = false;
        for (const k of ['wood', 'food', 'gold', 'stone']) if (k !== best && this.assign(u, k)) { counts[k]++; ok = true; break; }
        if (!ok && !u.order) {
          const t = this.g.findResourceNear(this.pi, ['wood', 'gold', 'stone', 'berries'], u.x, u.y, 50, null, u);
          if (t) u.command({ type: 'gather', target: t });
        }
      }
    }
    // Rebalance at most one villager every few seconds
    if (this.g.time - (this.lastRebalance || 0) < 5) { this.manageBoar(); this.staffFoundations(); return; }
    this.lastRebalance = this.g.time;
    let over = null, under = null, od = 1.5, ud = 1.5;
    for (const k in want) {
      const d = counts[k] - want[k];
      if (d > od) { od = d; over = k; }
      if (-d > ud) { ud = -d; under = k; }
    }
    if (over && under) {
      const cand = vils.filter((u) => this.jobOf(u) === over && u.carry < 2);
      if (cand.length) this.assign(cand[Math.floor(this.rng.next() * cand.length)], under);
    }
    this.manageBoar();
    this.staffFoundations();
  }

  // Foundations nobody is working on get the nearest free villager.
  staffFoundations() {
    const g = this.g;
    for (const b of this.p.buildings) {
      if (!b.alive || b.complete) continue;
      const busy = this.vilList.some((u) => u.order && ((u.order.type === 'build' && u.order.target === b) || u.queue.some((q) => q.target === b)));
      if (busy) continue;
      const pool = this.vilList.filter((u) => { const j = this.jobOf(u); return j !== 'build' && j !== 'garrison' && j !== 'flee'; });
      if (!pool.length) return;
      pool.sort((a, c) => Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(c.x - b.x, c.y - b.y));
      const n = b.type === 'castle' || b.type === 'townCenter' || b.type === 'wonder' ? 4 : b.def.isFarm ? 1 : 2;
      for (const u of pool.slice(0, n)) u.command({ type: 'build', target: b });
    }
  }

  // A reachable tree in a dense forest near home (for lumber camps).
  bestForestTree(maxDist) {
    const g = this.g, n = g.n, map = g.map, h = this.home;
    let best = null, bs = -1e9;
    for (const r of g.resources) {
      if (!r.alive || r.type !== 'tree') continue;
      const d = Math.hypot(r.x - h.x, r.y - h.y);
      if (d > maxDist || d < 5) continue;
      if (!g.reachableNode(r)) continue;
      let dens = 0;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const x = r.tx + dx, y = r.ty + dy;
        if (x < 0 || y < 0 || x >= n || y >= n) continue;
        const e = g.entities.get(map.occ[y * n + x]);
        if (e && e.type === 'tree') dens++;
      }
      if (dens < 9) continue;
      const covered = this.p.buildings.some((b) => b.alive && b.type === 'lumberCamp' && Math.hypot(b.x - r.x, b.y - r.y) < 5);
      const s = Math.min(dens, 30) * 1.2 - d * 1.0 - (covered ? 40 : 0);
      if (s > bs) { bs = s; best = r; }
    }
    return best;
  }

  assign(u, res) {
    const g = this.g, home = this.home;
    const skip = (e) => this.crowded(e);
    if (res === 'food') {
      let t = null;
      for (const d of this.p.buildings) {
        if (!d.alive || !d.complete || !d.def.dropSite.includes('food')) continue;
        t = g.findResourceNear(this.pi, ['sheep', 'hunt'], d.x, d.y, d.type === 'townCenter' ? 9 : 7, null, u, skip);
        if (t && t.kind === 'unit' && this.crowded(t)) t = null;
        if (t) break;
      }
      if (!t) {
        for (const d of this.p.buildings) {
          if (!d.alive || !d.def.dropSite.includes('food')) continue;
          t = g.findResourceNear(this.pi, ['berries'], d.x, d.y, d.size / 2 + 4, null, u, skip);
          if (t) break;
        }
      }
      if (!t && !this.pending('mill')) t = g.findResourceNear(this.pi, ['berries'], home.x, home.y, 14, null, u, skip);
      if (!t) {
        const f = g.findFreeFarm(this.pi, u.x, u.y);
        if (f) t = f;
      }
      if (!t) t = this.newFarm(u);
      if (!t) t = g.findResourceNear(this.pi, ['fish'], home.x, home.y, 20, null, u, skip);
      if (!t) return false;
      if (t.kind === 'building' && !t.complete) u.command({ type: 'build', target: t });
      else this.take(u, t);
      return true;
    }
    const kind = res;
    let t = null;
    const drops = this.p.buildings.filter((b) => b.alive && b.def.dropSite.includes(res) && b.type !== 'townCenter');
    drops.sort((a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y));
    for (const d of drops) { t = g.findResourceNear(this.pi, [kind], d.x, d.y, 7, null, u, skip); if (t) break; }
    if (!t) t = g.findResourceNear(this.pi, [kind], home.x, home.y, res === 'wood' ? 14 : 12, null, u, skip);
    // nothing close: walk further rather than stand idle (a new camp will follow)
    if (!t) t = g.findResourceNear(this.pi, [kind], u.x, u.y, 24, null, u, skip);
    if (!t) t = g.findResourceNear(this.pi, [kind], home.x, home.y, 36, null, u);
    if (!t) return false;
    this.take(u, t);
    return true;
  }

  newFarm(u) {
    const g = this.g, p = this.p;
    const farms = this.count('farm');
    if (farms >= this.cfg.farmsMax || p.res.wood < 60 + (this.reserve.wood || 0)) return null;
    if (!g.canBuildType(this.pi, 'farm').ok) return null;
    const centers = [...this.tcs(), ...p.buildings.filter((b) => b.alive && b.type === 'mill' && b.complete)];
    for (const c of centers) {
      const spot = g.findPlacement(this.pi, 'farm', c.x, c.y, {
        minDist: 1, maxDist: 5, gap: 0, ignoreFog: true,
        score: (s) => Math.hypot(s.x + 1.5 - c.x, s.y + 1.5 - c.y),
      });
      if (spot) {
        const r = g.cmdPlace(this.pi, 'farm', spot.x, spot.y, [u]);
        if (r.ok) return r.building;
      }
    }
    // No space: build a new mill in open ground for more farms
    if (!this.pending('mill') && p.res.wood >= 160) this.placeNearBase('mill', { minDist: 8, maxDist: 20, gap: 4 }, 1);
    return null;
  }

  // Average distance from targeted resources of a kind to their nearest drop site.
  dropDistance(res) {
    const g = this.g;
    let sum = 0, n = 0, cx = 0, cy = 0;
    for (const u of this.vilList) {
      const o = u.order && u.order.type === 'gather' ? u.order : u.order && u.order.type === 'return' ? u.order.resume : null;
      const t = o && o.target;
      if (!t || t.kind !== 'resource' || t.res !== res) continue;
      const d = g.nearestDropSite(this.pi, res, t.x, t.y);
      if (!d) continue;
      const dx = Math.max(d.tx - t.x, 0, t.x - (d.tx + d.size)), dy = Math.max(d.ty - t.y, 0, t.y - (d.ty + d.size));
      sum += Math.hypot(dx, dy); n++; cx += t.x; cy += t.y;
    }
    return n ? { d: sum / n, n, x: cx / n, y: cy / n } : null;
  }

  // Build lumber camps, mining camps and mills close to resources.
  ensureDropSites(counts, want) {
    const g = this.g, p = this.p;
    if (p.res.wood < 100) return;
    const needWood = counts.wood + want.wood > 2;
    if (needWood && !this.pending('lumberCamp')) {
      const camps = p.buildings.filter((b) => b.alive && (b.type === 'lumberCamp' || b.type === 'townCenter'));
      const good = camps.some((c) => this.treesNear(c, 6) >= 6);
      const dd = this.dropDistance('wood');
      if (!good) this.buildCampNear(['wood'], 'lumberCamp', 26);
      else if (dd && dd.d > 5 && dd.n >= 3) this.buildCampNear(['wood'], 'lumberCamp', 8, dd);
    }
    // Pre-build a mill at the berries once the sheep are running out
    if (p.age === 0 && counts.food >= 5 && this.count('mill') === 0 && !this.pending('mill') && this.vilList.length >= 9) {
      this.buildCampNear(['berries'], 'mill', 20);
    }
    for (const res of ['gold', 'stone']) {
      const dd = this.dropDistance(res);
      if (dd && dd.d > 4.5 && dd.n >= 2 && !this.pending('miningCamp')) this.buildCampNear([res], 'miningCamp', 8, dd);
    }
    for (const res of ['gold', 'stone']) {
      if (counts[res] + want[res] < 1.5 || this.pending('miningCamp')) continue;
      const camps = p.buildings.filter((b) => b.alive && (b.type === 'miningCamp' || b.type === 'townCenter'));
      const good = camps.some((c) => g.findResourceNear(this.pi, [res], c.x, c.y, c.size / 2 + 4));
      if (!good) this.buildCampNear([res], 'miningCamp', 40);
    }
    const onBerries = this.vilList.some((u) => u.order && u.order.type === 'gather' && u.order.target && u.order.target.type === 'berries');
    if (onBerries && !this.pending('mill')) {
      const mills = p.buildings.filter((b) => b.alive && (b.type === 'mill' || b.type === 'townCenter'));
      const good = mills.some((c) => g.findResourceNear(this.pi, ['berries'], c.x, c.y, c.size / 2 + 3.5));
      if (!good) this.buildCampNear(['berries'], 'mill', 24);
    }
  }

  treesNear(b, r) {
    const g = this.g, n = g.n, map = g.map;
    let c = 0;
    const cx = Math.floor(b.x), cy = Math.floor(b.y), R = Math.ceil(r + b.size / 2);
    for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) {
      if (x < 0 || y < 0 || x >= n || y >= n) continue;
      const id = map.occ[y * n + x];
      if (!id) continue;
      const e = g.entities.get(id);
      if (e && e.type === 'tree' && g.reachableNode(e)) c++;
    }
    return c;
  }

  buildCampNear(kinds, type, maxDist, near = null) {
    const g = this.g, home = near || this.home;
    const res = kinds[0] === 'wood' && !near ? this.bestForestTree(maxDist) : g.findResourceNear(this.pi, kinds, home.x, home.y, maxDist);
    if (!res) return null;
    const spot = g.findPlacement(this.pi, type, res.x, res.y, {
      minDist: 1, maxDist: 5, gap: 0, ignoreFog: true, allowResourceGap: true,
      score: (s) => {
        const cx = s.x + 1, cy = s.y + 1;
        let near = 0;
        for (const dx of [-3, -2, -1, 0, 1, 2, 3]) for (const dy of [-3, -2, -1, 0, 1, 2, 3]) {
          const e = g.entityAtTile(Math.floor(cx) + dx, Math.floor(cy) + dy);
          if (e && e.kind === 'resource' && kinds.includes(e.gatherKind)) near++;
        }
        return Math.hypot(cx - res.x, cy - res.y) - near * 0.6;
      },
    });
    if (!spot) return null;
    const pool = this.vilList.filter((u) => { const j = this.jobOf(u); return j !== 'build' && j !== 'garrison'; });
    pool.sort((a, b) => Math.hypot(a.x - spot.x, a.y - spot.y) - Math.hypot(b.x - spot.x, b.y - spot.y));
    const r = g.cmdPlace(this.pi, type, spot.x, spot.y, pool.slice(0, 2));
    return r.ok ? r.building : null;
  }

  manageSheep() {
    const tc = this.tc;
    if (!tc) return;
    for (const u of this.p.units) {
      if (!u.alive || !u.def.herdable || u.order) continue;
      const d = Math.hypot(u.x - tc.x, u.y - tc.y);
      if (d > 5.5) {
        const a = this.rng.next() * Math.PI * 2;
        this.g.cmdMove([u], tc.x + Math.cos(a) * 3.8, tc.y + Math.sin(a) * 3.8);
      }
    }
  }

  // Boar hunting the AoE way: one villager provokes the boar and lures it to the Town Center.
  manageBoar() {
    if (!this.cfg.boar || !this.tc) return;
    const g = this.g, tc = this.tc;
    const h = this.boarHunt;
    if (h) {
      const b = h.boar;
      const dead = !b.alive;
      if ((dead && !(b.carcass && b.carcass.alive)) || g.time - h.t0 > 120 || !h.lure.alive || h.lure.owner !== this.pi) { this.boarHunt = null; return; }
      if (dead) return;
      const dTC = Math.hypot(b.x - tc.x, b.y - tc.y);
      if (h.phase === 'lure') {
        if (!h.near && Math.hypot(h.lure.x - b.x, h.lure.y - b.y) < 4.5) h.near = g.time;
        if (b.order && b.order.type === 'attack' && b.order.target === h.lure) {
          h.phase = 'run';
          h.lure.command({ type: 'move', x: tc.x + (tc.x > b.x ? -2.6 : 2.6), y: tc.y + (tc.y > b.y ? -2.6 : 2.6) });
        } else if (h.near && g.time - h.near > 15) h.phase = 'kill';
      }
      if (h.phase === 'run' && (dTC < 6.5 || g.time - h.t0 > 60)) h.phase = 'kill';
      if (h.phase === 'kill' && !h.sent) {
        h.sent = true;
        const foodVils = this.vilList.filter((u) => this.jobOf(u) === 'food' && u !== h.lure);
        foodVils.sort((a, c) => Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(c.x - b.x, c.y - b.y));
        for (const u of [h.lure, ...foodVils.slice(0, 5)]) u.command({ type: 'gather', target: b });
      }
      return;
    }
    const foodVils = this.vilList.filter((u) => this.jobOf(u) === 'food');
    if (foodVils.length < 6 || this.p.age > 2) return;
    let boar = null, bd = 18 * 18;
    for (const u of g.units) {
      if (!u.alive || u.type !== 'boar' || u.order) continue;
      const d = (u.x - tc.x) ** 2 + (u.y - tc.y) ** 2;
      if (d < bd && g.canReach(tc.x + 2.5, tc.y + 2.5, u)) { bd = d; boar = u; }
    }
    if (!boar) return;
    const natural = g.findResourceNear(this.pi, ['sheep', 'hunt'], tc.x, tc.y, 9);
    if (natural && natural.kind === 'resource' && natural.amount > 60) return;
    foodVils.sort((a, c) => Math.hypot(a.x - boar.x, a.y - boar.y) - Math.hypot(c.x - boar.x, c.y - boar.y));
    const lure = foodVils[0];
    lure.command({ type: 'gather', target: boar });
    this.boarHunt = { boar, lure, t0: g.time, phase: 'lure' };
  }

  // ------------------------------------------------------------- age & buildings
  manageAgeUp() {
    const p = this.p, g = this.g;
    if (p.age >= 3 || this.ageResearching()) return;
    const tech = ['feudalAge', 'castleAge', 'imperialAge'][p.age];
    const target = this.cfg.vils[p.age];
    const vils = this.vilList.length;
    const late = g.time > [1000, 1900, 2900][p.age] * (this.level === 'easy' ? 1.3 : 1);
    if (vils < target - 1 && !late) return;
    if (!g.ageReqMet(p, p.age + 1)) {
      const opts = { 1: ['barracks', 'mill', 'lumberCamp'], 2: ['blacksmith', 'archeryRange', 'stable', 'market'], 3: ['university', 'siegeWorkshop', 'monastery'] }[p.age + 1];
      if (!opts.some((t) => this.pending(t))) {
        for (const t of opts) {
          if (this.count(t) > 0) continue;
          if (!g.canBuildType(this.pi, t).ok) continue;
          if (this.placeNearBase(t, { minDist: 6, maxDist: 20, gap: 2 }, 2)) break;
        }
      }
      return;
    }
    for (const tc of this.tcs()) {
      if (tc.queue.length && tc.queue[0].kind === 'unit' && tc.queue[0].t > 0) continue;
      if (g.canResearch(tc, tech).ok && g.canAfford(this.pi, TECHS[tech].cost)) {
        // Drop queued villagers so the age-up starts now
        while (tc.queue.length) g.cmdCancel(tc, tc.queue.length - 1);
        g.cmdResearch(tc, tech);
        return;
      }
    }
  }

  wantedMix() {
    const age = Math.max(1, this.p.age);
    const base = STRATS[this.strat][age].map(([l, w]) => [l, w]);
    const e = this.enemySeen, c = this.cfg.counter;
    if (c > 0 && e.total > 8) {
      const add = (line, w) => {
        const f = base.find((x) => x[0] === line);
        if (f) f[1] += w; else base.push([line, w]);
      };
      if (e.cavalry > 6 && e.cavalry / e.total > 0.3) add('spear', 5 * c);
      if (e.archer > 6 && e.archer / e.total > 0.35) { add('skirm', 3 * c); if (age >= 2) add('knight', 2 * c); else add('scout', 1.5 * c); }
      if (e.infantry > 6 && e.infantry / e.total > 0.4) add('archer', 3 * c);
      if (e.siege > 1.5) add(age >= 2 ? 'knight' : 'scout', 2 * c);
    }
    if (this.siegeWanted >= 0 && age >= 2) {
      const f = base.find((x) => x[0] === 'ram');
      if (f) f[1] = Math.max(f[1], 3); else base.push(['ram', 3]);
    }
    return base.filter(([line]) => this.lineAvailable(line));
  }

  lineAvailable(line) {
    const p = this.p;
    const def = UNITS[p.lineTier[line]];
    if (!def || p.age < def.age) return false;
    if (line === 'longbow' || line === 'treb') return p.age >= (line === 'treb' ? 3 : 2);
    return true;
  }

  manageBuildings() {
    const p = this.p, g = this.g, age = p.age;
    if (age === 0) {
      if (this.vilList.length >= 14 && this.count('barracks') === 0 && p.res.wood >= 175 + (this.reserve.wood || 0)) {
        this.placeNearBase('barracks', { minDist: 7, maxDist: 18, gap: 2 }, 2, this.frontSpot(7));
      }
      return;
    }
    if (this.ageResearching() && age < 2 && p.res.food < 900) return;
    // Military production buildings
    const mix = this.wantedMix();
    const need = new Map();
    for (const [line, w] of mix) {
      const b = PRODUCER[line];
      if (!b || b === 'castle') continue;
      need.set(b, (need.get(b) || 0) + w);
    }
    const maxB = this.cfg.milBuildings[age];
    const milTypes = ['barracks', 'archeryRange', 'stable', 'siegeWorkshop'];
    const have = milTypes.reduce((a, t) => a + this.count(t), 0);
    if (have < maxB && !milTypes.some((t) => this.pending(t))) {
      let best = null, bs = -1;
      for (const [t, w] of need) {
        if (!g.canBuildType(this.pi, t).ok) continue;
        const s = w / (1 + this.count(t) * 1.5);
        if (s > bs) { bs = s; best = t; }
      }
      if (best && this.afford(BUILDINGS[best].cost, this.reserve)) this.placeNearBase(best, { minDist: 7, maxDist: 22, gap: 2 }, 2, this.frontSpot(8));
    }
    if (age >= 1 && this.count('blacksmith') === 0 && this.afford(BUILDINGS.blacksmith.cost, this.reserve) && !this.pending('blacksmith') && this.armyList.length >= 3) {
      this.placeNearBase('blacksmith', { minDist: 6, maxDist: 20, gap: 2 }, 1);
    }
    if (age >= 1 && this.count('market') === 0 && this.vilList.length > 24 && this.afford({ wood: 175 }, this.reserve) && !this.pending('market') && (age >= 2 || p.res.gold > 300)) {
      this.placeNearBase('market', { minDist: 7, maxDist: 22, gap: 2 }, 1);
    }
    if (age >= 2) {
      if (this.count('university') === 0 && this.vilList.length > 30 && this.afford({ wood: 400 }, this.reserve) && !this.pending('university')) {
        this.placeNearBase('university', { minDist: 7, maxDist: 22, gap: 2 }, 2);
      }
      if (this.count('monastery') === 0 && this.level !== 'easy' && this.vilList.length > 34 && this.afford({ wood: 400 }, this.reserve) && !this.pending('monastery')) {
        this.placeNearBase('monastery', { minDist: 7, maxDist: 22, gap: 2 }, 2);
      }
      if (this.wantCastle() && p.res.stone >= 650 && !this.pending('castle')) {
        this.placeNearBase('castle', { minDist: 7, maxDist: 20, gap: 2 }, 5, this.frontSpot(9));
      }
      const tcsNow = p.buildings.filter((b) => b.alive && b.type === 'townCenter').length;
      if (tcsNow < 1 + this.cfg.extraTC && this.vilList.length > 28 && this.afford({ wood: 275 + 100, stone: 100 }, this.reserve) && !this.pending('townCenter')) {
        const r = g.findResourceNear(this.pi, ['wood', 'gold'], this.home.x, this.home.y, 26);
        const at = r ? { x: (r.x + this.home.x) / 2, y: (r.y + this.home.y) / 2 } : this.home;
        this.placeNearBase('townCenter', { minDist: 6, maxDist: 20, gap: 3 }, 4, at);
      }
      if (tcsNow === 0 && this.vilList.length > 0 && this.afford({ wood: 275, stone: 100 }) && !this.pending('townCenter')) {
        this.placeNearBase('townCenter', { minDist: 0, maxDist: 20, gap: 2 }, 5);
      }
    }
    // Watch towers near the mining area
    if (age >= 1 && this.cfg.towers && this.count('watchTower') + this.count('guardTower') + this.count('keep') < this.cfg.towers + (age >= 3 && p.res.stone > 500 ? 2 : 0) &&
      this.vilList.length > 24 && this.afford({ wood: 25, stone: 125 }, this.reserve) && !['watchTower', 'guardTower', 'keep'].some((t) => this.pending(t))) {
      const gold = g.findResourceNear(this.pi, ['gold'], this.home.x, this.home.y, 16);
      if (gold) this.placeNearBase('watchTower', { minDist: 2, maxDist: 6, gap: 1 }, 1, gold);
    }
    if ((age >= 3 || (age >= 2 && this.siegeWanted >= 0)) && this.count('siegeWorkshop') === 0 && this.afford(BUILDINGS.siegeWorkshop.cost, this.reserve) && !this.pending('siegeWorkshop') && g.canBuildType(this.pi, 'siegeWorkshop').ok) {
      this.placeNearBase('siegeWorkshop', { minDist: 8, maxDist: 22, gap: 2 }, 2);
    }
  }

  frontSpot(d) {
    const e = this.enemyTarget();
    if (!e) return this.home;
    const dx = e.x - this.home.x, dy = e.y - this.home.y, l = Math.hypot(dx, dy) || 1;
    return { x: this.home.x + (dx / l) * d, y: this.home.y + (dy / l) * d };
  }

  manageResearch() {
    const p = this.p, g = this.g;
    const rich = p.res.gold > 700 && p.res.food > 500;
    if (!rich && this.rng.next() > this.cfg.research) return;
    const wants = [];
    if (p.age >= 1 && !p.techs.has('loom') && this.vilList.length > 15) wants.push('loom');
    // interleave economy and military upgrades so the army keeps pace with the economy
    const eco = ECO_TECHS.slice(), mil = [];
    const mix = this.wantedMix().slice().sort((a, b) => b[1] - a[1]);
    for (const [line] of mix) for (const t of LINE_TECHS[line] || []) if (!mil.includes(t)) mil.push(t);
    while (eco.length || mil.length) { if (eco.length) wants.push(eco.shift()); if (mil.length) wants.push(mil.shift()); }
    if (p.age >= 2 && this.cfg.towers) wants.push('guardTowerTech');
    if (p.age >= 3) wants.push('conscription', 'architecture', 'hoardings', 'keepTech');
    let started = 0;
    for (const id of wants) {
      if (started >= 2) break;
      if (p.techs.has(id) || p.researching.has(id)) continue;
      const t = TECHS[id];
      if (!t || t.age > p.age) continue;
      if (!t.requires.every((r) => p.techs.has(r))) continue;
      if (!this.afford(t.cost, this.reserve)) continue;
      const b = p.buildings.find((x) => x.alive && x.complete && x.def.researches.includes(id) && x.queue.length === 0);
      if (!b) continue;
      if (g.cmdResearch(b, id).ok) started++;
    }
  }

  trainMilitary() {
    const p = this.p, g = this.g;
    if (p.age === 0) {
      // Token Dark Age defense: a few militia when threatened
      if (this.threat && this.threat.length && this.count('barracks', true)) {
        const b = p.buildings.find((x) => x.alive && x.complete && x.type === 'barracks');
        if (b && b.queue.length < 2) g.cmdTrain(b, 'militia', 1);
      }
      return;
    }
    const army = this.armyList.length;
    if (army >= this.cfg.armyCap && !(this.threat && this.threat.length)) return;
    if (p.pop >= p.popCap) return;
    const mix = this.wantedMix();
    if (!mix.length) return;
    const emergency = this.threat && this.threat.length > 2;
    // save up for the main production building if we don't have one yet
    const top = mix.slice().sort((a, b) => b[1] - a[1])[0];
    const mainB = top && PRODUCER[top[0]];
    let reserve = this.reserve;
    if (mainB && mainB !== 'castle' && !this.count(mainB) && g.canBuildType(this.pi, mainB).ok) {
      reserve = { ...this.reserve };
      for (const k in BUILDINGS[mainB].cost) reserve[k] = (reserve[k] || 0) + BUILDINGS[mainB].cost[k];
    }
    const producers = p.buildings.filter((b) => b.alive && b.complete && b.def.trains.length && b.type !== 'townCenter' && b.queue.length < 2);
    for (const b of producers) {
      const options = mix.filter(([line]) => b.def.trains.includes(line));
      if (!options.length) continue;
      if (b.type === 'monastery') continue;
      const total = options.reduce((a, o) => a + o[1], 0);
      let r = this.rng.next() * total, line = options[0][0];
      for (const [l, w] of options) { r -= w; if (r <= 0) { line = l; break; } }
      const def = UNITS[p.lineTier[line]];
      if (!this.afford(def.cost, emergency ? null : reserve)) continue;
      g.cmdTrain(b, line, 1);
      if (!b.rally) { const s = this.rallySpot(); g.cmdRally(b, s.x, s.y); }
    }
    // A couple of monks in the Castle Age
    const mon = p.buildings.find((b) => b.alive && b.complete && b.type === 'monastery' && b.queue.length === 0);
    if (mon && this.p.countUnits((u) => u.def.isMonk) < (this.level === 'hard' || this.level === 'hardest' ? 4 : 2) && this.afford(UNITS.monk.cost, this.reserve)) {
      g.cmdTrain(mon, 'monk', 1);
      if (!mon.rally) { const s = this.rallySpot(); g.cmdRally(mon, s.x, s.y); }
    }
  }

  rallySpot() {
    const f = this.frontSpot(9);
    const s = this.g.map.nearestWalkable(f.x, f.y, 8);
    return s ? { x: s.x + 0.5, y: s.y + 0.5 } : this.home;
  }

  // ------------------------------------------------------------- scouting
  manageScout() {
    const g = this.g;
    let scout = this.scoutId ? g.entities.get(this.scoutId) : null;
    if (!scout || !scout.alive || scout.owner !== this.pi) {
      scout = null;
      if (this.scoutPhase === 0) {
        scout = this.p.units.find((u) => u.alive && u.type === 'scoutCavalry');
        if (scout) this.scoutId = scout.id;
      }
      if (!scout) return;
    }
    // Detour to claim neutral sheep it can see
    if (this.scoutPhase <= 2 && (!scout.order || !scout.order.sheepHunt)) {
      let best = null, bd = 12 * 12;
      for (const u of g.units) {
        if (!u.alive || !u.def.herdable || u.owner !== -1) continue;
        const d = (u.x - scout.x) ** 2 + (u.y - scout.y) ** 2;
        if (d < bd && g.isVisibleTo(this.pi, u)) { bd = d; best = u; }
      }
      if (best) {
        if (scout.order) scout.queue.unshift(scout.order);
        scout.setOrder({ type: 'move', x: best.x, y: best.y, sheepHunt: true, tol: 1.5 });
        return;
      }
    }
    if (scout.order) return;
    const h = this.home;
    if (this.scoutPhase === 0) {
      const pts = [];
      for (const r of [9, 14, 19, 24]) for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 + r * 0.3;
        pts.push({ x: h.x + Math.cos(a) * r, y: h.y + Math.sin(a) * r });
      }
      for (const [i, pt] of pts.entries()) {
        const x = Math.max(1, Math.min(g.n - 2, pt.x)), y = Math.max(1, Math.min(g.n - 2, pt.y));
        scout.command({ type: 'move', x, y }, i > 0);
      }
      this.scoutPhase = 1;
    } else if (this.scoutPhase === 1) {
      const e = this.enemyTarget();
      if (e) {
        scout.command({ type: 'move', x: e.x, y: e.y });
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2;
          scout.command({ type: 'move', x: Math.max(1, Math.min(g.n - 2, e.x + Math.cos(a) * 9)), y: Math.max(1, Math.min(g.n - 2, e.y + Math.sin(a) * 9)) }, true);
        }
        const s = this.rallySpot();
        scout.command({ type: 'move', x: s.x, y: s.y }, true);
      }
      this.scoutPhase = 2;
    } else if (this.scoutPhase === 2) {
      this.scoutId = null; // joins the army
      this.scoutPhase = 3;
    }
  }

  // Best known enemy location: remembered building nearest to us (avoiding fortifications
  // unless we bring siege), else their start position.
  // Remembered enemy buildings that shoot arrows, with the radius they cover.
  enemyForts() {
    const g = this.g, out = [];
    for (const m of this.p.memory.values()) {
      const def = BUILDINGS[m.type];
      if (!def.attack || !g.isEnemy(this.pi, m.owner)) continue;
      out.push({ x: m.tx + m.size / 2, y: m.ty + m.size / 2, r: def.attack.range + m.size / 2 + 1 });
    }
    return out;
  }

  enemyTarget(from = null, withSiege = null) {
    const g = this.g, f = from || this.home;
    if (withSiege === null) withSiege = this.army().some((u) => u.def.classes.includes('siege'));
    const forts = withSiege ? [] : this.enemyForts();
    let best = null, bd = 1e18;
    for (const m of this.p.memory.values()) {
      if (!g.isEnemy(this.pi, m.owner)) continue;
      const q = g.players[m.owner];
      if (!q || !q.alive) continue;
      const x = m.tx + m.size / 2, y = m.ty + m.size / 2;
      let d = (x - f.x) ** 2 + (y - f.y) ** 2;
      const def = BUILDINGS[m.type];
      if (def.isWall) d *= 4;
      if (!withSiege) {
        // Without siege, strongholds are costly: raid what their arrows don't cover first
        if (m.type === 'castle') d *= 9;
        else if (def.attack) d *= 4;
        else if (forts.some((t) => (x - t.x) ** 2 + (y - t.y) ** 2 < t.r * t.r)) d *= 2.5;
      }
      if (def.trains.length || def.dropSite.length || m.type === 'house') d *= 0.8;
      if (d < bd) { bd = d; best = { x, y, id: m.id, type: m.type }; }
    }
    if (best) return best;
    for (const q of this.enemies()) {
      const st = q.start;
      const d = (st.cx - f.x) ** 2 + (st.cy - f.y) ** 2;
      if (d < bd) { bd = d; best = { x: st.cx, y: st.cy, guess: true }; }
    }
    return best;
  }

  // ------------------------------------------------------------- defense
  defend() {
    const g = this.g, p = this.p;
    const threat = [];
    const seen = new Set();
    const anchors = p.buildings.filter((b) => b.alive && (b.type === 'townCenter' || b.def.dropSite.length || b.def.trains.length || b.type === 'castle'));
    for (const b of anchors) {
      for (const u of g.unitsNear(b.x, b.y, 13 + b.size / 2, g._tmpA)) {
        if (seen.has(u) || u.owner < 0 || u.def.isAnimal || !g.isEnemy(this.pi, u.owner)) continue;
        if (!g.isVisibleTo(this.pi, u)) continue;
        seen.add(u);
        threat.push(u);
      }
    }
    this.threat = threat;
    const mil = threat.filter((u) => u.isMilitary || u.def.isMonk);
    if (threat.length) {
      this.lastThreatT = g.time;
      let cx = 0, cy = 0;
      for (const u of threat) { cx += u.x; cy += u.y; }
      cx /= threat.length; cy /= threat.length;
      const defenders = this.armyList.filter((u) => {
        if (this.attack && this.attack.units.includes(u) && Math.hypot(u.x - this.home.x, u.y - this.home.y) > 30) return false;
        return !u.order || u.order.type !== 'attack' || Math.hypot(u.x - cx, u.y - cy) > 12;
      });
      const home = defenders.filter((u) => Math.hypot(u.x - cx, u.y - cy) < 40);
      if (home.length) g.cmdMove(home, cx, cy, { attackMove: true });
      // Recall a raiding army if the base is in real danger
      if (this.attack && mil.length >= 5 && home.length < mil.length) {
        const back = this.attack.units.filter((u) => u.alive && u.owner === this.pi);
        g.cmdMove(back, cx, cy, { attackMove: true });
        this.endAttack();
      }
      // Villagers near enemy soldiers take shelter (only for a real raid, not a passing scout)
      const strength = (list) => list.reduce((a, u) => a + (u.hp / u.maxHp) * Math.max(1, u.st.atk) * (u.st.range > 0 ? 1.2 : 1), 0);
      const raiding = mil.filter((m) => m.order && m.order.type === 'attack' && m.order.target && m.order.target.owner === this.pi);
      const sMil = strength(mil);
      if (mil.length && raiding.length && sMil > strength(home) * 0.8 && (sMil >= 12 || raiding.some((m) => m.order.target.isVillager))) {
        const shelters = p.buildings.filter((b) => b.alive && b.complete && b.def.garrison > 0);
        for (const v of this.vilList) {
          if (v.garrisonedIn || (v.order && v.order.type === 'garrison')) continue;
          const danger = mil.some((m) => Math.hypot(m.x - v.x, m.y - v.y) < 7);
          if (!danger) continue;
          let best = null, bd = 400;
          for (const s of shelters) {
            if (s.garrisoned.length >= s.def.garrison) continue;
            const d = (s.x - v.x) ** 2 + (s.y - v.y) ** 2;
            if (d < bd) { bd = d; best = s; }
          }
          if (best) {
            v.bellResume = v.order && v.order.type !== 'flee' ? (v.order.type === 'return' && v.order.resume ? v.order.resume : v.order) : null;
            v.command({ type: 'garrison', target: best, bell: true });
            this.bellT = g.time;
          }
        }
      }
    }
    const quiet = g.time - (this.lastThreatT || -99) > 8;
    if (quiet && (this.bellT > 0 || g.time - (this.lastRelease || 0) > 15)) {
      this.bellT = -1;
      this.lastRelease = g.time;
      for (const v of this.vilList) {
        if (v.order && v.order.type === 'garrison' && v.order.bell) { const r = v.bellResume; v.bellResume = null; v.setOrder(r && (r.type !== 'gather' || (r.target && r.target.alive)) ? r : null); }
      }
      for (const b of p.buildings) {
        const vs = b.garrisoned.filter((u) => u.isVillager);
        if (vs.length) g.ungarrison(b, vs);
      }
    }
  }

  // ------------------------------------------------------------- attacking
  endAttack() {
    this.attack = null;
    this.lastAttackEnd = this.g.time;
  }

  manageAttack() {
    const g = this.g, p = this.p;
    const army = this.armyList;
    if (this.threat && this.threat.filter((u) => u.isMilitary).length >= 3 && !this.attack) return;
    if (!this.attack) {
      if (g.time < this.cfg.firstAttack) return;
      const gap = p.pop > 140 || g.time > 3000 ? this.cfg.attackGap * 0.35 : this.cfg.attackGap;
      if (g.time - this.lastAttackEnd < gap && this.attacksLaunched > 0) return;
      const need = Math.round(this.cfg.attackSize[p.age] * (1 + Math.min(this.attacksLaunched, 4) * 0.2));
      if (need <= 0) return;
      let ready = army.filter((u) => !u.order || u.order.type === 'move' || (u.order.type === 'attack' && u.order.auto));
      const readySiege = ready.filter((u) => u.def.classes.includes('siege'));
      if (readySiege.length && readySiege.length < 2) ready = ready.filter((u) => !u.def.classes.includes('siege'));
      if (ready.length < need && p.pop < 180) return;
      if (this.siegeWanted >= 0 && p.age >= 2 && readySiege.length < 2 && g.time - this.siegeWanted < 300 && p.pop < 150) return;
      const target = this.enemyTarget();
      if (!target) return;
      this.attack = { units: ready.slice(), initial: ready.length, t0: g.time, target, lastRetarget: g.time };
      this.attacksLaunched++;
      this.sendWave(ready, target);
      g.emit({ type: 'aiAttack', player: this.pi, x: target.x, y: target.y });
      if (this.attacksLaunched === 1 || this.rng.next() < 0.3) this.say('attack');
      return;
    }
    const a = this.attack;
    for (const u of a.units) if (!u.alive && u.lastHitBy && u.lastHitBy.kind === 'building') a.fortLosses = (a.fortLosses || 0) + 1;
    a.units = a.units.filter((u) => u.alive && u.owner === this.pi);
    const isSiege = (u) => u.def.classes.includes('siege');
    const beaten = (a.fortLosses || 0) >= Math.max(5, a.initial * 0.35) && !a.units.some(isSiege);
    if (beaten || a.units.length < Math.max(2, a.initial * this.cfg.retreat)) {
      // Towers and Town Center arrows are winning: fall back and return with siege
      if (beaten) this.siegeWanted = g.time;
      const s = this.rallySpot();
      g.cmdMove(a.units, s.x, s.y);
      this.endAttack();
      return;
    }
    // Reinforcements waiting at home join the fight (siege only travels in packs)
    const idleHome = army.filter((u) => !a.units.includes(u) && !u.order && Math.hypot(u.x - this.home.x, u.y - this.home.y) < 25);
    const homeSiege = idleHome.filter(isSiege), homeOther = idleHome.filter((u) => !isSiege(u));
    const c0 = this.centroid(a.units.filter((u) => !isSiege(u)).length ? a.units.filter((u) => !isSiege(u)) : a.units);
    if (homeOther.length >= 4) {
      g.cmdMove(homeOther, c0.x, c0.y, { attackMove: true });
      a.units.push(...homeOther);
    }
    if (homeSiege.length >= 3) {
      const tb = this.siegeTarget(c0.x, c0.y, 30);
      for (const sgu of homeSiege) sgu.command(tb ? { type: 'attack', target: tb } : { type: 'move', x: c0.x, y: c0.y, attackMove: true });
      a.units.push(...homeSiege);
    }
    for (const sgu of a.units) {
      if (!isSiege(sgu) || sgu.order) continue;
      if (Math.hypot(sgu.x - c0.x, sgu.y - c0.y) > 25) continue;
      const tb = this.siegeTarget(sgu.x, sgu.y, 30);
      if (tb) sgu.command({ type: 'attack', target: tb });
    }
    // Retarget idle attackers
    const idle = a.units.filter((u) => !u.order);
    if (idle.length >= Math.max(1, a.units.length * 0.4) || g.time - a.lastRetarget > 60) {
      const c = this.centroid(a.units);
      const t = this.enemyTarget(c);
      if (!t) { this.endAttack(); return; }
      if (t.guess && Math.hypot(c.x - t.x, c.y - t.y) < 6) {
        // Nothing found where we expected the enemy: hunt the remembered units instead
        const q = this.enemies()[0];
        const anyB = q && q.buildings.find((b) => b.alive);
        if (anyB) { this.sendWave(a.units, { x: anyB.x, y: anyB.y }); a.lastRetarget = g.time; return; }
        this.endAttack();
        return;
      }
      this.sendWave(idle.length >= a.units.length * 0.4 ? a.units : idle, t);
      a.lastRetarget = g.time;
    }
    // Give up only if the wave is stuck far from any target for a long time
    if (g.time - a.t0 > 900 && a.units.every((u) => !u.order)) {
      const s = this.rallySpot();
      g.cmdMove(a.units, s.x, s.y);
      this.endAttack();
    }
  }

  // Best building for siege near a point: castles and towers first, then the Town Center, then production.
  siegeTarget(x, y, radius = 18) {
    const g = this.g;
    const prio = (t) => (t === 'castle' ? 0 : t === 'keep' || t === 'guardTower' || t === 'watchTower' ? 1 : t === 'townCenter' ? 2 : BUILDINGS[t].trains.length ? 3 : t === 'wonder' ? 0 : 5);
    let best = null, bs = 1e9;
    for (const m of this.p.memory.values()) {
      if (!g.isEnemy(this.pi, m.owner) || BUILDINGS[m.type].isWall || BUILDINGS[m.type].isFarm) continue;
      const bx = m.tx + m.size / 2, by = m.ty + m.size / 2;
      const d = Math.hypot(bx - x, by - y);
      if (d > radius) continue;
      const b = g.entities.get(m.id);
      if (!b || !b.alive) continue;
      const sc = prio(m.type) * 12 + d;
      if (sc < bs) { bs = sc; best = b; }
    }
    return best;
  }

  sendWave(units, target) {
    const g = this.g;
    const siege = units.filter((u) => u.def.classes.includes('siege'));
    const monks = units.filter((u) => u.def.isMonk);
    const rest = units.filter((u) => !siege.includes(u) && !monks.includes(u));
    if (rest.length) g.cmdMove(rest, target.x, target.y, { attackMove: true });
    const tb = this.siegeTarget(target.x, target.y) || (target.id ? g.entities.get(target.id) : null);
    for (const s of siege) {
      if (tb && tb.alive && s.st.canAttackBuildings) s.command({ type: 'attack', target: tb });
      else s.command({ type: 'move', x: target.x, y: target.y, attackMove: true });
    }
    if (monks.length && rest.length) {
      const c = this.centroid(rest);
      g.cmdMove(monks, c.x, c.y);
    }
    // Monks convert valuable enemies close to the army
    for (const m of monks) {
      const near = g.unitsNear(m.x, m.y, 10, g._tmpA);
      let best = null, bv = 0;
      for (const v of near) {
        if (!g.isEnemy(this.pi, v.owner) || v.def.isAnimal || v.def.classes.includes('siege')) continue;
        const val = g.unitValue(v.def);
        if (val > bv) { bv = val; best = v; }
      }
      if (best && m.faith >= 100) m.command({ type: 'convert', target: best });
    }
  }

  centroid(units) {
    let x = 0, y = 0;
    for (const u of units) { x += u.x; y += u.y; }
    const n = Math.max(1, units.length);
    return { x: x / n, y: y / n };
  }

  manageMarket() {
    const p = this.p, g = this.g, r = p.res;
    if (!p.hasBuilding('market') || g.time - (this.lastTrade || 0) < 2.5) return;
    const castleNeed = this.wantCastle() ? 650 : 0;
    const trade = (a, k) => { if (g.cmdMarket(this.pi, a, k).ok) this.lastTrade = g.time; };
    // dump hoarded stone / food / wood for gold
    if (r.stone > Math.max(700, castleNeed + 300)) return trade('sell', 'stone');
    for (const k of ['food', 'wood']) if (r[k] > 1400 && r.gold < 600) return trade('sell', k);
    // buy what we are starving for
    const need = ['wood', 'food'].filter((k) => r[k] < 150).sort((a, b) => r[a] - r[b]);
    if (need.length && r.gold > 400 + (this.reserve.gold || 0)) return trade('buy', need[0]);
    if (castleNeed && r.stone < 650 && r.gold > 800) return trade('buy', 'stone');
  }

  repairBuildings() {
    const g = this.g, p = this.p;
    if (p.res.wood < 100) return;
    for (const b of p.buildings) {
      if (!b.alive || !b.complete || b.hp > b.maxHp * 0.6) continue;
      if (g.time - b.lastAttackedT < 5) continue;
      const repairing = this.vilList.filter((u) => u.order && u.order.type === 'repair' && u.order.target === b).length;
      if (repairing >= 2) continue;
      const pool = this.vilList.filter((u) => this.jobOf(u) !== 'build' && this.jobOf(u) !== 'garrison');
      pool.sort((a, c) => Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(c.x - b.x, c.y - b.y));
      for (const u of pool.slice(0, 2 - repairing)) u.command({ type: 'repair', target: b });
      break;
    }
  }
}
