// Scripted computer opponent: economy, build order, ages, army composition, attack waves and defense.
import { UNITS, BUILDINGS, TECHS } from './config.js';

const AGE_TECH = ['feudal', 'castle', 'imperial'];

export class AI {
  constructor(game, pid, difficulty) {
    this.g = game;
    this.pid = pid;
    this.p = game.players[pid];
    this.diff = difficulty;
    this.t = 1;
    this.rebalanceT = 10;
    this.threat = null;
    this.wave = 0;
    this.attacking = false;
    this.attackForce = new Set();
    const D = { easy: 0, standard: 1, hard: 2 }[difficulty] ?? 1;
    this.D = D;
    this.vilTargets = [[16, 24, 34, 40], [22, 32, 44, 55], [24, 36, 50, 62]][D];
    this.firstAttack = [960, 660, 480][D];
    this.nextAttack = this.firstAttack;
    this.baseWave = [10, 8, 7][D];
    const tc = game.buildings.find((b) => b.owner === pid && b.type === 'towncenter');
    this.home = tc ? { x: tc.x, y: tc.y } : { x: game.N / 2, y: game.N / 2 };
    this.enemyHome = (() => {
      const e = game.buildings.find((b) => b.owner !== pid && b.type === 'towncenter');
      return e ? { x: e.x, y: e.y } : { x: game.N / 2, y: game.N / 2 };
    })();
    this.scoutPts = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      this.scoutPts.push({ x: this.home.x + Math.cos(a) * 16, y: this.home.y + Math.sin(a) * 16 });
    }
    this.scoutPts.push({ x: game.N / 2, y: game.N / 2 }, { ...this.enemyHome });
  }

  onAttacked(tg, src) {
    if (tg.owner !== this.pid || src.owner === this.pid) return;
    this.threat = { x: src.x, y: src.y, t: this.g.time, id: src.id };
  }

  update(dt) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.5;
    if (!this.p.alive) return;
    this.think();
  }

  // ---------- helpers ----------
  mine(kind) { return kind === 'unit' ? this.g.units.filter((u) => u.owner === this.pid && !u.dead) : this.g.buildings.filter((b) => b.owner === this.pid && !b.dead); }
  count(type, onlyBuilt = false) { return this.blds.filter((b) => b.type === type && (!onlyBuilt || b.built)).length; }
  free(cost) {
    const r = this.p.res, res = this.reserve || {};
    for (const k in cost) if (r[k] - (res[k] || 0) < cost[k]) return false;
    return true;
  }

  findSpot(type, cx, cy, minD, maxD, margin = 1, allowRes = false) {
    const g = this.g, def = BUILDINGS[type];
    const start = Math.random() * Math.PI * 2;
    for (let r = minD; r <= maxD; r += 0.7) {
      const steps = Math.max(8, Math.floor(r * 5));
      for (let i = 0; i < steps; i++) {
        const a = start + (i / steps) * Math.PI * 2;
        const tx = Math.round(cx + Math.cos(a) * r - def.w / 2), ty = Math.round(cy + Math.sin(a) * r - def.h / 2);
        if (!g.canPlace(type, tx, ty, this.pid)) continue;
        let ok = true;
        for (let y = ty - margin; y < ty + def.h + margin && ok; y++) for (let x = tx - margin; x < tx + def.w + margin; x++) {
          if (!g.inb(x, y)) { ok = false; break; }
          const i2 = y * g.N + x;
          if (g.bgrid[i2] && g.ents.get(g.bgrid[i2])?.type !== 'farm') { ok = false; break; }
          if (!allowRes && g.block[i2] && g.ents.get(g.block[i2])?.kind === 'resource') { ok = false; break; }
        }
        if (!ok) continue;
        // keep away from enemy territory
        if (Math.hypot(tx - this.enemyHome.x, ty - this.enemyHome.y) < 14) continue;
        return [tx, ty];
      }
    }
    return null;
  }

  pickBuilder(nearX, nearY) {
    let best = null, bd = 1e9;
    for (const v of this.vils) {
      if (v.task && v.task.t === 'build') continue;
      const farming = v.task && v.task.t === 'gather' && v.task.sub === 'farm';
      const d = Math.hypot(v.x - nearX, v.y - nearY) + (farming ? 12 : 0) + (v.task ? 0 : -5);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  build(type, spot, builders = 1) {
    if (!spot) return null;
    const def = BUILDINGS[type];
    if (!this.free(def.cost)) return null;
    const cx = spot[0] + def.w / 2, cy = spot[1] + def.h / 2;
    const bs = [];
    for (let i = 0; i < builders; i++) {
      const v = this.pickBuilder(cx, cy);
      if (!v) break;
      bs.push(v);
      v.task = { t: 'build', id: -1 }; // temp mark so we don't pick again
    }
    if (!bs.length) return null;
    for (const v of bs) v.task = null;
    return this.g.placeBuilding(this.pid, type, spot[0], spot[1], bs);
  }

  // ---------- main loop ----------
  think() {
    const g = this.g, p = this.p;
    this.units = this.mine('unit');
    this.blds = this.mine('building');
    this.vils = this.units.filter((u) => u.def.cls === 'villager');
    this.army = this.units.filter((u) => u.def.cls !== 'villager');
    const tc = this.blds.find((b) => b.type === 'towncenter' && b.built);
    if (tc) this.home = { x: tc.x, y: tc.y };
    this.reserve = null;

    this.handleAge(tc);
    this.handleVillagerProduction(tc);
    this.handleHousing();
    this.handleBuildOrder(tc);
    this.handleFoundations();
    this.handleDropsites();
    this.handleAssignment();
    this.handleTechs();
    this.handleMilitary();
    this.handleArmy();
    this.handleScout();
    if (!tc && !this.blds.some((b) => b.type === 'towncenter') && this.vils.length && p.age >= 0) {
      if (p.res.wood >= 275 && p.res.stone >= 100) {
        const spot = this.findSpot('towncenter', this.home.x, this.home.y, 0, 12, 1);
        if (spot) { this.p.age < 2 ? this.forceBuild('towncenter', spot) : this.build('towncenter', spot, 4); }
      }
    }
  }
  forceBuild(type, spot) {
    // allow rebuilding a lost town center even before Castle Age
    const age = this.p.age;
    this.p.age = Math.max(age, BUILDINGS[type].age || 0);
    const b = this.build(type, spot, 4);
    this.p.age = age;
    return b;
  }

  handleAge(tc) {
    const p = this.p;
    if (!tc || p.age >= 3) return;
    const key = AGE_TECH[p.age];
    if (p.researching.has(key)) return;
    const t = TECHS[key];
    const need = this.vilTargets[p.age] - (this.D === 0 ? 2 : 3);
    if (this.vils.length < need) return;
    if (this.g.techLocked(p, key)) return;
    this.reserve = t.cost;
    if (this.g.canAfford(p, t.cost) && !tc.queue.some((q) => q.kind === 'tech' && TECHS[q.key].ageUp)) {
      // clear villager queue so the age-up starts promptly
      for (let i = tc.queue.length - 1; i >= 1; i--) if (tc.queue[i].kind === 'unit') this.g.cancelQueue(tc, i);
      this.reserve = null;
      this.g.queueTech(tc, key);
    }
  }

  handleVillagerProduction(tc) {
    if (!tc) return;
    const target = this.vilTargets[this.p.age];
    const inQ = tc.queue.filter((q) => q.kind === 'unit').length;
    if (this.vils.length + inQ >= target) return;
    if (tc.queue.some((q) => q.kind === 'tech' && TECHS[q.key].ageUp)) return;
    if (inQ < 2 && this.free(UNITS.villager.cost) && this.p.pop + inQ < this.p.popCap + 1) this.g.queueTrain(tc, 'villager');
  }

  handleHousing() {
    const p = this.p;
    if (p.popCap >= 200) return;
    const pending = this.blds.filter((b) => (b.type === 'house' || b.type === 'towncenter' || b.type === 'castle') && !b.built).length;
    const prod = this.blds.filter((b) => b.built && (b.def.trains)).length;
    const margin = 2 + prod * 1.5;
    if (p.pop + margin >= p.popCap && pending < (p.age >= 2 ? 2 : 1)) {
      if (!this.free({ wood: 25 })) return;
      const spot = this.findSpot('house', this.home.x, this.home.y, 5, 16, 0);
      this.build('house', spot);
    }
  }

  handleBuildOrder(tc) {
    const p = this.p, v = this.vils.length, age = p.age;
    const want = (type, n, cond = true) => {
      if (!cond || this.count(type) >= n) return false;
      if (age < (BUILDINGS[type].age || 0)) return false;
      if (!this.free(BUILDINGS[type].cost)) return true; // wait (block lower priorities)
      const spot = this.findSpot(type, this.home.x, this.home.y, type === 'tower' ? 8 : 6, 18, 1);
      this.build(type, spot, type === 'castle' ? 3 : 1);
      return true;
    };
    if (this.blds.some((b) => !b.built && b.type !== 'farm' && b.type !== 'house' && this.g.time - b.createdT < 60 && b.def.cat === 'mil')) return;
    if (want('barracks', 1, v >= 11)) return;
    if (age >= 1) {
      const first = this.D === 2 ? 'stable' : 'archeryrange';
      if (want(first, 1)) return;
      if (want('blacksmith', 1, v >= 20)) return;
      if (want(first === 'stable' ? 'archeryrange' : 'stable', 1, v >= 24)) return;
      if (want('tower', 1, this.D >= 1 && p.res.stone >= 150 && v >= 22)) return;
    }
    if (age >= 2) {
      if (want('siegeworkshop', 1)) return;
      if (want('castle', 1, p.res.stone >= 650)) return;
      if (want('barracks', 2, v >= 35)) return;
      if (want('archeryrange', 2, v >= 38)) return;
      if (want('stable', 2, v >= 40 && this.D >= 1)) return;
    }
    if (age >= 3) {
      if (want('stable', 3, v >= 45)) return;
      if (want('archeryrange', 3, v >= 48 && this.D >= 1)) return;
    }
  }

  handleFoundations() {
    for (const b of this.blds) {
      if (b.built || b.dead) continue;
      const n = this.vils.filter((v) => v.task && v.task.t === 'build' && v.task.id === b.id).length;
      const want = b.type === 'castle' || b.type === 'towncenter' ? 3 : 1;
      if (n >= want) continue;
      const v = this.pickBuilder(b.x, b.y);
      if (!v) continue;
      this.g.releaseFarm(v);
      v.task = { t: 'build', id: b.id };
      v.goalKey = null;
    }
  }

  handleDropsites() {
    const g = this.g;
    // lumber camps near forests being worked or near home
    const woodCamps = this.blds.filter((b) => b.type === 'lumbercamp' || b.type === 'towncenter');
    const lumberCount = this.count('lumbercamp');
    if (this.vils.length >= 4 && lumberCount < 4 && this.free({ wood: 100 })) {
      const need = lumberCount === 0 || this.vils.some((u) => u.task && u.task.t === 'gather' && u.task.resType === 'wood' && u.task.returning && this.nearestDist(woodCamps, u.x, u.y) > 7);
      if (need && !this.blds.some((b) => b.type === 'lumbercamp' && !b.built)) {
        const tree = this.findForest();
        if (tree) this.build('lumbercamp', this.findSpot('lumbercamp', tree.x, tree.y, 1.5, 4, 0, true));
      }
    }
    const millCount = this.count('mill');
    if (this.vils.length >= 7 && millCount === 0 && this.free({ wood: 100 })) {
      const berry = g.findResourceNear(this.pid, 'food', this.home.x, this.home.y, 16, 'berry');
      const spot = berry ? this.findSpot('mill', berry.x, berry.y, 1.5, 4, 0, true) : this.findSpot('mill', this.home.x, this.home.y, 5, 10, 1);
      this.build('mill', spot);
    }
    const needGold = this.p.age >= 1 || this.vils.length >= this.vilTargets[0] - 3;
    const mineCamps = this.blds.filter((b) => b.type === 'miningcamp' || b.type === 'towncenter');
    const mcount = this.count('miningcamp');
    if (needGold && mcount < 3 && this.free({ wood: 100 }) && !this.blds.some((b) => b.type === 'miningcamp' && !b.built)) {
      for (const rt of ['gold', 'stone']) {
        if (rt === 'stone' && this.p.age < 2) continue;
        const r = g.findResourceNear(this.pid, rt, this.home.x, this.home.y, 30, null);
        if (r && this.nearestDist(mineCamps, r.x, r.y) > 4) {
          this.build('miningcamp', this.findSpot('miningcamp', r.x, r.y, 1.5, 4, 0, true));
          break;
        }
      }
    }
  }
  nearestDist(list, x, y) {
    let bd = 1e9;
    for (const b of list) bd = Math.min(bd, Math.hypot(b.x - x, b.y - y) - b.w / 2);
    return bd;
  }
  findForest() {
    const g = this.g;
    let best = null, bs = 1e9;
    for (const r of g.resources) {
      if (r.type !== 'tree' || r.dead) continue;
      const d = Math.hypot(r.x - this.home.x, r.y - this.home.y);
      if (d > 30 || d < 5) continue;
      if (this.blds.some((b) => b.type === 'lumbercamp' && Math.hypot(b.x - r.x, b.y - r.y) < 6)) continue;
      // density check
      let n = 0;
      for (let y = r.ty - 2; y <= r.ty + 2; y++) for (let x = r.tx - 2; x <= r.tx + 2; x++) {
        if (!g.inb(x, y)) continue;
        const e = g.ents.get(g.block[y * g.N + x]);
        if (e && e.type === 'tree') n++;
      }
      if (n < 8) continue;
      if (d < bs) { bs = d; best = r; }
    }
    return best;
  }

  desiredRatios() {
    const base = this.baseRatios();
    const r = this.p.res;
    let sum = 0;
    for (const k in base) {
      if (!base[k]) continue;
      if (r[k] > 900) base[k] *= 0.45; else if (r[k] > 500) base[k] *= 0.75;
      else if (r[k] < 120) base[k] *= 1.3;
      sum += base[k];
    }
    for (const k in base) base[k] /= sum || 1;
    return base;
  }
  baseRatios() {
    const a = this.p.age;
    if (a === 0) {
      if (this.vils.length >= this.vilTargets[0] - 4) return { food: 0.55, wood: 0.35, gold: 0.1, stone: 0 };
      return { food: 0.6, wood: 0.4, gold: 0, stone: 0 };
    }
    if (a === 1) return { food: 0.45, wood: 0.33, gold: 0.22, stone: this.D >= 1 ? 0.0 : 0 };
    if (a === 2) return { food: 0.38, wood: 0.27, gold: 0.27, stone: 0.08 };
    return { food: 0.36, wood: 0.28, gold: 0.3, stone: 0.06 };
  }

  handleAssignment() {
    const counts = { food: 0, wood: 0, gold: 0, stone: 0 };
    const byType = { food: [], wood: [], gold: [], stone: [] };
    const idle = [];
    for (const v of this.vils) {
      if (v.task && v.task.t === 'gather' && v.task.resType) { counts[v.task.resType]++; byType[v.task.resType].push(v); }
      else if (!v.task) idle.push(v);
    }
    const ratios = this.desiredRatios();
    const n = this.vils.length;
    const deficit = (k) => ratios[k] * n - counts[k];
    for (const v of idle) {
      const k = ['food', 'wood', 'gold', 'stone'].sort((a, b) => deficit(b) - deficit(a))[0];
      if (this.assign(v, k)) counts[k]++;
      else if (this.assign(v, 'wood')) counts.wood++;
    }
    this.rebalanceT -= 0.5;
    if (this.rebalanceT <= 0) {
      this.rebalanceT = 8;
      const keys = ['food', 'wood', 'gold', 'stone'];
      const over = keys.sort((a, b) => deficit(a) - deficit(b))[0];
      const under = [...keys].sort((a, b) => deficit(b) - deficit(a))[0];
      if (deficit(over) < -1.5 && deficit(under) > 1.5 && byType[over].length) {
        const v = byType[over].find((u) => !(u.task.sub === 'farm')) || byType[over][0];
        this.g.releaseFarm(v);
        v.task = null;
        this.assign(v, under);
      }
    }
  }

  assign(v, type) {
    const g = this.g;
    let target = null;
    if (type === 'food') {
      // hunt / forage near home, then farms
      let best = null, bs = 1e9;
      for (const r of g.resources) {
        if (r.dead || (r.type !== 'sheep' && r.type !== 'deer' && r.type !== 'berry')) continue;
        const d = Math.hypot(r.x - this.home.x, r.y - this.home.y);
        if (d > (r.type === 'berry' ? 14 : 20)) continue;
        const s = d + r.workersPrev * (r.type === 'berry' ? 1 : 3) + (r.killed ? -4 : 0);
        if (s < bs) { bs = s; best = r; }
      }
      target = best || g.findResourceNear(this.pid, 'food', this.home.x, this.home.y, 20, 'farm');
      if (!target) {
        if (!this.p.res.wood || this.p.res.wood < 60) return false;
        const mill = this.blds.find((b) => b.type === 'mill' && b.built);
        const near = Math.random() < 0.5 || !mill ? this.home : mill;
        let spot = this.findSpot('farm', near.x, near.y, 3, 9, 0);
        if (!spot) spot = this.findSpot('farm', this.home.x, this.home.y, 3, 14, 0);
        if (!spot) return false;
        const f = g.placeBuilding(this.pid, 'farm', spot[0], spot[1], [v]);
        return !!f;
      }
    } else {
      const drops = this.blds.filter((b) => b.built && b.def.drop && b.def.drop.includes(type));
      let best = null, bs = 1e9;
      for (const d of drops) {
        const r = g.findResourceNear(this.pid, type, d.x, d.y, 9);
        if (r) {
          const s = Math.hypot(r.x - d.x, r.y - d.y) + (d.type === 'towncenter' ? 2 : 0);
          if (s < bs) { bs = s; best = r; }
        }
      }
      target = best || g.findResourceNear(this.pid, type, this.home.x, this.home.y, 40);
    }
    if (!target) return false;
    g.cmdGather([v], target);
    return true;
  }

  handleTechs() {
    const g = this.g, p = this.p;
    const order = [
      ['loom', 0, 18], ['doublebit', 1, 0], ['horsecollar', 1, 0], ['wheelbarrow', 1, 0], ['goldmining', 1, 0],
      ['fletching', 1, 0], ['forging', 1, 0], ['scalebarding', 1, 0], ['scalemail', 1, 0], ['manatarms', 1, 0], ['bloodlines', 1, 0], ['paddedarcher', 1, 0],
      ['bowsaw', 2, 0], ['heavyplow', 2, 0], ['handcart', 2, 0], ['goldshaft', 2, 0], ['crossbowman', 2, 0], ['longswordsman', 2, 0], ['pikeman', 2, 0],
      ['bodkin', 2, 0], ['ironcasting', 2, 0], ['chainbarding', 2, 0], ['chainmail', 2, 0], ['leatherarcher', 2, 0], ['eliteskirmisher', 2, 0], ['masonry', 2, 0], ['lightcav', 2, 0],
      ['twoman', 3, 0], ['croprotation', 3, 0], ['cavalier', 3, 0], ['arbalest', 3, 0], ['blastfurnace', 3, 0], ['bracer', 3, 0], ['platemail', 3, 0], ['twohanded', 3, 0], ['elitelongbowman', 3, 0],
    ];
    for (const [key, age, minVils] of order) {
      if (p.age < age || this.vils.length < minVils) continue;
      if (p.techs.has(key) || p.researching.has(key)) continue;
      if (!g.techVisible(p, key) || g.techLocked(p, key)) continue;
      const t = TECHS[key];
      const b = this.blds.find((bb) => bb.built && bb.def.techs && bb.def.techs.includes(key) && bb.queue.length === 0);
      if (!b) continue;
      // keep a buffer for units/ages
      const buffer = {};
      for (const k in t.cost) buffer[k] = t.cost[k] + (p.age >= 2 ? 100 : 50);
      if (!this.free(buffer)) continue;
      g.queueTech(b, key);
      return;
    }
  }

  enemyComposition() {
    const c = { infantry: 0, archer: 0, cavalry: 0, siege: 0 };
    for (const u of this.g.units) if (u.owner !== this.pid && !u.dead && c[u.def.cls] !== undefined) c[u.def.cls]++;
    return c;
  }

  handleMilitary() {
    const g = this.g, p = this.p;
    if (p.pop >= p.popCap) return;
    const early = p.age === 0 && (!this.threat || g.time - this.threat.t > 20);
    if (early) return;
    const ec = this.enemyComposition();
    const mine = { infantry: 0, archer: 0, cavalry: 0, siege: 0, ram: 0, mangonel: 0 };
    for (const u of this.army) { mine[u.def.cls]++; if (u.type === 'ram') mine.ram++; if (u.type === 'mangonel') mine.mangonel++; }
    for (const b of this.blds) {
      if (!b.built || !b.def.trains || b.type === 'towncenter') continue;
      if (b.queue.length >= 2) continue;
      let unit = null;
      switch (b.type) {
        case 'barracks': unit = ec.cavalry > ec.infantry + 2 && p.age >= 1 ? 'spearman' : (p.res.gold < 60 && p.age >= 1 ? 'spearman' : 'militia'); break;
        case 'archeryrange': unit = ec.archer > 4 && ec.archer >= ec.infantry && p.res.gold < 350 ? 'skirmisher' : 'archer'; break;
        case 'stable': unit = p.age >= 2 ? (ec.infantry > ec.archer * 2 && ec.cavalry < 3 ? 'knight' : 'knight') : 'scout'; break;
        case 'siegeworkshop': unit = mine.ram < 2 + this.D ? 'ram' : (mine.mangonel < 2 && ec.archer + ec.infantry > 10 ? 'mangonel' : null); break;
        case 'castle': unit = 'longbowman'; break;
      }
      if (!unit) continue;
      const cur = p.unitMap[unit];
      if (p.age < (UNITS[cur].age || 0)) continue;
      if (!this.free(UNITS[cur].cost)) continue;
      g.queueTrain(b, unit);
    }
  }

  handleArmy() {
    const g = this.g;
    const army = this.army.filter((u) => !(u === this.scoutUnit && this.scouting));
    // defense
    if (this.threat && g.time - this.threat.t < 8) {
      const th = this.threat;
      const dHome = Math.hypot(th.x - this.home.x, th.y - this.home.y);
      if (dHome < 26) {
        for (const u of army) {
          if (this.attackForce.has(u.id) && this.attacking) continue;
          if (u.task && (u.task.t === 'attack')) continue;
          g.cmdMove([u], th.x, th.y, true);
        }
        // pull villagers near the threat to fight light raids
        const src = g.ents.get(th.id);
        if (src && !src.dead && src.def && (src.def.cls === 'cavalry' || src.def.cls === 'infantry')) {
          const enemies = g.unitsNear(th.x, th.y, 6, []).filter((e) => e.owner !== this.pid);
          const vilsNear = this.vils.filter((v) => Math.hypot(v.x - th.x, v.y - th.y) < 6);
          if (enemies.length <= 2 && vilsNear.length >= 4 && army.length < 3) {
            for (const v of vilsNear.slice(0, enemies.length * 4)) { g.releaseFarm(v); v.task = { t: 'attack', id: src.id }; }
          }
        }
      }
    }
    // idle villagers that were fighting go back to work via assignment loop (their tasks end when target dies)

    // attack waves
    const time = g.time;
    const home = army.filter((u) => !this.attackForce.has(u.id));
    const waveSize = Math.min(30, this.baseWave + this.wave * 3);
    if (!this.attacking && time >= this.nextAttack && home.length >= waveSize) {
      this.attacking = true;
      this.wave++;
      this.attackForce = new Set(home.map((u) => u.id));
      this.attackStart = home.length;
      const tgt = this.pickTarget(home);
      if (tgt) g.cmdMove(home, tgt.x, tgt.y, true);
      g.emit('msg', { text: 'Enemy forces are marching on you!', kind: 'alert' });
    }
    if (this.attacking) {
      const force = this.army.filter((u) => this.attackForce.has(u.id));
      if (force.length < Math.max(2, this.attackStart * 0.25)) {
        // retreat
        g.cmdMove(force, this.home.x + 2, this.home.y + 2);
        this.attacking = false;
        this.attackForce = new Set();
        this.nextAttack = time + [240, 170, 130][this.D];
      } else {
        for (const u of force) {
          if (!u.task) {
            const tgt = this.pickTarget([u]);
            if (tgt) g.cmdMove([u], tgt.x + (Math.random() - 0.5) * 2, tgt.y + (Math.random() - 0.5) * 2, true);
          }
        }
      }
    } else {
      // gather idle army at a rally spot toward the enemy
      const rx = this.home.x + (this.enemyHome.x - this.home.x) * 0.15, ry = this.home.y + (this.enemyHome.y - this.home.y) * 0.15;
      for (const u of home) {
        if (u.task || u === this.scoutUnit) continue;
        if (Math.hypot(u.x - rx, u.y - ry) > 5) g.cmdMove([u], rx, ry);
      }
    }
  }

  pickTarget(units) {
    const g = this.g;
    if (!units.length) return null;
    const cx = units.reduce((s, u) => s + u.x, 0) / units.length, cy = units.reduce((s, u) => s + u.y, 0) / units.length;
    const hasRam = units.some((u) => u.def.onlyBuildings);
    let best = null, bs = 1e9;
    for (const b of g.buildings) {
      if (b.dead || b.owner === this.pid) continue;
      let s = Math.hypot(b.x - cx, b.y - cy);
      if (b.type === 'towncenter' && hasRam) s -= 10;
      if (b.type === 'farm') s += 3;
      if (s < bs) { bs = s; best = b; }
    }
    if (!best) {
      for (const u of g.units) {
        if (u.dead || u.owner === this.pid) continue;
        const s = Math.hypot(u.x - cx, u.y - cy);
        if (s < bs) { bs = s; best = u; }
      }
    }
    return best ? { x: best.x, y: best.y } : null;
  }

  handleScout() {
    const g = this.g;
    if (this.scoutDone) return;
    if (!this.scoutUnit) {
      this.scoutUnit = this.army.find((u) => u.type === 'scout');
      if (!this.scoutUnit) { this.scoutDone = true; return; }
      this.scouting = true;
      this.scoutIdx = 0;
    }
    const s = this.scoutUnit;
    if (s.dead) { this.scoutDone = true; this.scouting = false; return; }
    if (!s.task) {
      if (this.scoutIdx >= this.scoutPts.length - 1) { this.scouting = false; this.scoutDone = true; g.cmdMove([s], this.home.x + 3, this.home.y + 3); return; }
      const pt = this.scoutPts[this.scoutIdx++];
      g.cmdMove([s], Math.max(1, Math.min(g.N - 2, pt.x)), Math.max(1, Math.min(g.N - 2, pt.y)));
    }
  }
}
