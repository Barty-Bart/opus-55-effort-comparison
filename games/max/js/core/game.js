// Core simulation: players, entities, commands, combat, visibility, victory.
import {
  UNITS, BUILDINGS, TECHS, LINES, RESOURCE_NODES, START_RESOURCES, AGE_REQUIREMENTS, POP_MAX,
  AGE_NAMES, defaultEco, PLAYER_COLORS, RESOURCES,
} from './data.js';
import { GameMap, generateMap, TER_BUILDABLE } from './map.js';
import { PathFinder } from './path.js';
import { RNG } from './rng.js';
import { Unit } from './unit.js';
import { Building } from './building.js';

export const DT = 1 / 20;
const TAU = Math.PI * 2;
const PROJ_SPEED = { arrow: 7.5, bolt: 9, javelin: 6, spear: 5.5, stone: 4.6, boulder: 4.2 };

// ---------------------------------------------------------------------------
export class ResourceNode {
  constructor(game, type, tx, ty, opts = {}) {
    const def = RESOURCE_NODES[type];
    this.id = game.nextId++;
    this.game = game;
    this.kind = 'resource';
    this.type = type;
    this.def = def;
    this.res = def.res;
    this.gatherKind = opts.gatherKind || def.gather;
    this.amount = opts.amount ?? def.amount;
    this.maxAmount = this.amount;
    this.owner = -1;
    this.alive = true;
    this.felled = false;
    this.species = opts.species || null;
    this.variant = game.rng.int(0, 1023);
    if (opts.float) {
      this.x = opts.x; this.y = opts.y;
      this.tx = Math.floor(opts.x); this.ty = Math.floor(opts.y);
      this.size = 0;
      this.animal = opts.animal;
      this.facing = opts.facing || 0;
      this.created = game.time;
    } else {
      this.tx = tx; this.ty = ty;
      this.x = tx + 0.5; this.y = ty + 0.5;
      this.size = 1;
    }
  }
}

// ---------------------------------------------------------------------------
function matchUnit(on, def) {
  if (on === 'meleeCav') return def.classes.includes('cavalry') && !def.classes.includes('archer');
  const c = on.indexOf(':'), k = on.slice(0, c), v = on.slice(c + 1);
  if (k === 'unit') return def.id === v;
  if (k === 'line') return def.line === v;
  if (k === 'class') return def.classes.includes(v);
  return false;
}
function matchBuilding(on, def) {
  const c = on.indexOf(':'), k = on.slice(0, c), v = on.slice(c + 1);
  if (k === 'building') return def.id === v;
  if (k === 'bclass') {
    if (v === 'building') return true;
    if (v === 'arrows') return !!def.attack;
    return def.classes.includes(v);
  }
  return false;
}
function applyEff(s, e) {
  if (e.add !== undefined) s[e.stat] += e.add;
  if (e.mul !== undefined) s[e.stat] *= e.mul;
}

export class Player {
  constructor(game, index, cfg) {
    this.game = game;
    this.index = index;
    this.name = cfg.name || `Player ${index + 1}`;
    this.colorIndex = cfg.color ?? index;
    this.color = PLAYER_COLORS[this.colorIndex];
    this.human = !!cfg.human;
    this.aiLevel = cfg.ai || null;
    this.team = cfg.team || 0;
    this.res = { ...START_RESOURCES[game.opts.startRes || 'standard'] };
    this.age = 0;
    this.techs = new Set();
    this.researching = new Set();
    this.eco = defaultEco();
    this.lineTier = {};
    for (const [line, tiers] of Object.entries(LINES)) this.lineTier[line] = tiers[0];
    this.ustats = {};
    this.bstats = {};
    this.units = [];
    this.buildings = [];
    this.pop = 0;
    this.popCap = 0;
    const N = game.map.n * game.map.n;
    this.explored = new Uint8Array(N);
    this.visible = new Uint8Array(N);
    this.memory = new Map();
    this.alive = true;
    this.resigned = false;
    this.defeatedAt = null;
    this.market = { food: 100, wood: 100, stone: 100 };
    this.bell = false;
    this.wonderStart = null;
    this.lastAlertT = -99; this.lastAlertX = 0; this.lastAlertY = 0;
    this.attacks = []; // recent attacks on this player: {x, y, t, by}
    this.autoReseed = true;
    this.gatherBonus = 1;
    this.stats = {
      unitsTrained: 0, unitsLost: 0, kills: 0, killValue: 0, buildingsBuilt: 0, buildingsLost: 0, razed: 0, razeValue: 0,
      gathered: { food: 0, wood: 0, gold: 0, stone: 0 }, techs: 0, techValue: 0, ageTimes: [0, null, null, null],
      converted: 0, maxVillagers: 0, maxMilitary: 0, history: [],
    };
    this.refreshStats();
  }

  refreshStats() {
    const effects = [];
    for (const id of this.techs) for (const e of TECHS[id].effects) if (e.t === 'stat') effects.push(e);
    for (const def of Object.values(UNITS)) {
      const s = {
        hp: def.hp, atk: def.atk, armorM: def.armor[0], armorP: def.armor[1], range: def.range, minRange: def.minRange,
        los: def.los, speed: def.speed, reload: def.reload, accuracy: def.accuracy, atkType: def.atkType, bonus: def.bonus,
        canAttackUnits: def.canAttackUnits, canAttackBuildings: def.canAttackBuildings,
      };
      for (const e of effects) if (matchUnit(e.on, def)) applyEff(s, e);
      if (def.id === 'villager') s.speed *= this.eco.villSpeed;
      s.accuracy = Math.min(1, s.accuracy);
      s.hp = Math.round(s.hp);
      this.ustats[def.id] = s;
    }
    for (const def of Object.values(BUILDINGS)) {
      const a = def.attack;
      const s = {
        hp: def.hp, armorM: def.armor[0], armorP: def.armor[1], los: def.los, atk: a ? a.atk : 0, range: a ? a.range : 0,
        reload: a ? a.reload : 0, arrows: a ? a.arrows : 0, accuracy: 0.85, atkType: 'pierce', bonus: {},
        canAttackUnits: true, canAttackBuildings: false,
      };
      for (const e of effects) if (matchBuilding(e.on, def)) applyEff(s, e);
      s.hp = Math.round(s.hp);
      s.accuracy = Math.min(1, s.accuracy);
      this.bstats[def.id] = s;
    }
  }

  applyTech(id, silent = false) {
    if (this.techs.has(id)) return;
    const g = this.game, t = TECHS[id];
    this.techs.add(id);
    this.stats.techs++;
    this.stats.techValue += (t.cost.food || 0) + (t.cost.wood || 0) + (t.cost.gold || 0) + (t.cost.stone || 0);
    let ageUp = false;
    for (const e of t.effects) {
      if (e.t === 'eco') { if (e.mul !== undefined) this.eco[e.stat] *= e.mul; if (e.add !== undefined) this.eco[e.stat] += e.add; }
      else if (e.t === 'upgrade') this.lineTier[e.line] = e.to;
      else if (e.t === 'age') { this.age = e.age; this.stats.ageTimes[e.age] = g.time; ageUp = true; }
    }
    this.refreshStats();
    for (const e of t.effects) {
      if (e.t === 'upgrade') {
        const tiers = LINES[e.line], to = tiers.indexOf(e.to);
        for (const u of this.units) if (u.def.line === e.line && tiers.indexOf(u.def.id) < to) u.setDef(UNITS[e.to]);
      }
      if (e.t === 'bupgrade') for (const b of this.buildings) if (b.type === e.from) b.setDef(BUILDINGS[e.to]);
    }
    for (const u of this.units) u.refreshStats();
    for (const b of this.buildings) b.refreshStats();
    if (ageUp) {
      for (const b of this.buildings) b.ageStyle = this.age;
      if (!silent) g.emit({ type: 'age', player: this.index, age: this.age });
    }
    if (!silent) g.emit({ type: 'research', player: this.index, tech: id });
  }

  countUnits(pred) { let n = 0; for (const u of this.units) if (u.alive && pred(u)) n++; return n; }
  villagers() { return this.units.filter((u) => u.alive && u.isVillager); }
  military() { return this.units.filter((u) => u.alive && u.isMilitary); }
  hasBuilding(type, complete = true) { return this.buildings.some((b) => b.alive && b.type === type && (!complete || b.complete)); }
  score() {
    const s = this.stats;
    const eco = (s.gathered.food + s.gathered.wood + s.gathered.gold + s.gathered.stone) / 10;
    const mil = (s.killValue + s.razeValue) / 5;
    const tech = s.techValue / 5 + [0, 100, 300, 600][this.age];
    return Math.round(eco + mil + tech);
  }
}

// ---------------------------------------------------------------------------
export class Game {
  constructor(opts) {
    this.opts = {
      size: 120, mapType: 'arabia', seed: 12345, reveal: 'normal', startAge: 0, startRes: 'standard',
      wonderTime: 300, ...opts,
    };
    this.time = 0;
    this.tick = 0;
    this.nextId = 1;
    this.qidSeq = 0;
    this.rng = new RNG(((this.opts.seed * 7919) ^ 0x5bd1e995) >>> 0);
    const gen = generateMap({ size: this.opts.size, players: this.opts.players.length, seed: this.opts.seed, mapType: this.opts.mapType });
    this.gen = gen;
    this.map = new GameMap(gen);
    this.map.ally = (a, b) => this.isAlly(a, b);
    this.n = this.map.n;
    this.path = new PathFinder(this.map);
    this.pathCost = 0;
    this.pathBudget = 14000;
    this.pathMaxNodes = 5000;
    this.entities = new Map();
    this.units = [];
    this.buildings = [];
    this.resources = [];
    this.projectiles = [];
    this.events = [];
    this.eventsEnabled = true;
    this.cellSize = 4;
    this.cells = Math.ceil(this.n / this.cellSize);
    this.buckets = Array.from({ length: this.cells * this.cells }, () => []);
    this._tmpA = []; this._tmpB = []; this._tmpC = [];
    this.discs = [];
    this.winner = null;
    this.over = false;
    this.dirtyUnits = this.dirtyBuildings = this.dirtyResources = false;
    this.players = this.opts.players.map((cfg, i) => new Player(this, i, cfg));
    this.setupWorld();
    this.rebuildSpatial();
    this.updateVisibility();
  }

  emit(ev) { if (this.eventsEnabled) this.events.push(ev); }

  // ------------------------------------------------------------- setup
  setupWorld() {
    const gen = this.gen;
    for (const o of gen.objects) {
      if (o.kind === 'resource') this.addResource(o.type, o.x, o.y, { species: o.species });
      else if (o.kind === 'animal') this.addUnit(o.type, o.owner, o.x, o.y);
    }
    this.players.forEach((p, i) => this.setupPlayer(p, gen.starts[i]));
  }

  setupPlayer(p, st) {
    p.start = st;
    const startAge = this.opts.startAge || 0;
    const tc = this.addBuilding('townCenter', p.index, st.x, st.y, true);
    for (let a = 1; a <= startAge; a++) p.applyTech(['feudalAge', 'castleAge', 'imperialAge'][a - 1], true);
    if (startAge > 0) {
      // unlock previous-age military upgrades lines appropriately via ages only (upgrades still need research)
      tc.ageStyle = p.age;
    }
    const nv = [3, 6, 10, 14][startAge];
    const houses = startAge > 0 ? Math.max(0, Math.ceil((nv + 1 + 4) / 5) - 1) : 0;
    for (let k = 0; k < houses; k++) {
      const spot = this.findPlacement(p.index, 'house', st.cx, st.cy, { minDist: 4, maxDist: 12, ignoreFog: true });
      if (spot) this.addBuilding('house', p.index, spot.x, spot.y, true);
    }
    for (let k = 0; k < nv; k++) {
      const pos = this.spawnPoint(tc, k, st.cx + 3, st.cy + 3);
      this.addUnit('villager', p.index, pos.x, pos.y);
    }
    const sp = this.spawnPoint(tc, nv + 3, st.cx - 3, st.cy + 3);
    this.addUnit('scoutCavalry', p.index, sp.x, sp.y);
    const bonus = [0, 200, 500, 1000][startAge];
    for (const r of RESOURCES) p.res[r] += bonus;
    for (const b of p.buildings) b.ageStyle = p.age;
    this.recalcPop(p);
  }

  // ------------------------------------------------------------- entities
  addUnit(type, owner, x, y) {
    const def = typeof type === 'string' ? UNITS[type] : type;
    const u = new Unit(this, def, owner, x, y);
    this.entities.set(u.id, u);
    this.units.push(u);
    if (owner >= 0) {
      const p = this.players[owner];
      p.units.push(u);
      p.pop += def.pop;
    }
    return u;
  }

  addBuilding(type, owner, tx, ty, complete) {
    if (type === 'watchTower' && owner >= 0) {
      const t = this.players[owner].techs;
      if (t.has('keepTech')) type = 'keep'; else if (t.has('guardTowerTech')) type = 'guardTower';
    }
    const def = BUILDINGS[type];
    const b = new Building(this, def, owner, tx, ty, complete);
    this.entities.set(b.id, b);
    this.buildings.push(b);
    this.players[owner].buildings.push(b);
    for (let y = ty; y < ty + def.size; y++) for (let x = tx; x < tx + def.size; x++) this.map.setStatic(x, y, b.id, !def.walkable, def.isGate ? owner : -1);
    if (complete) { b.completedAt = this.time; this.recalcPop(this.players[owner]); }
    return b;
  }

  addResource(type, tx, ty, opts) {
    const r = new ResourceNode(this, type, tx, ty, opts);
    this.entities.set(r.id, r);
    this.resources.push(r);
    if (r.size) this.map.setStatic(tx, ty, r.id, true);
    return r;
  }

  unitStats(owner, def) {
    if (owner >= 0) return this.players[owner].ustats[def.id];
    if (!this._gaiaStats) this._gaiaStats = {};
    let s = this._gaiaStats[def.id];
    if (!s) {
      s = this._gaiaStats[def.id] = {
        hp: def.hp, atk: def.atk, armorM: def.armor[0], armorP: def.armor[1], range: def.range, minRange: 0, los: def.los,
        speed: def.speed, reload: def.reload, accuracy: def.accuracy, atkType: def.atkType, bonus: def.bonus,
        canAttackUnits: true, canAttackBuildings: false,
      };
    }
    return s;
  }
  buildingStats(owner, def) { return this.players[owner].bstats[def.id]; }

  recalcPop(p) {
    let cap = 0;
    for (const b of p.buildings) if (b.alive && b.complete) cap += b.def.pop;
    p.popCap = Math.min(POP_MAX, cap);
  }

  // ------------------------------------------------------------- tick
  step(dt) {
    this.time += dt;
    this.tick++;
    this.pathCost = 0;
    this.rebuildSpatial();
    const units = this.units;
    for (let i = 0; i < units.length; i++) { const u = units[i]; if (u.alive) u.update(dt); }
    this.separate();
    const bs = this.buildings;
    for (let i = 0; i < bs.length; i++) { const b = bs[i]; if (b.alive) b.update(dt); }
    this.updateProjectiles(dt);
    this.cleanup();
    if (this.tick % 5 === 0) this.updateVisibility();
    if (this.tick % 10 === 3) this.updateSheep();
    if (this.tick % 20 === 9) this.updateMarkets();
    for (const p of this.players) if (p.ai && p.alive) p.ai.update(dt);
    if (this.tick % 20 === 7) this.checkVictory();
    if (this.tick % Math.round(30 / dt) === 0) this.recordHistory();
  }

  cleanup() {
    if (this.dirtyUnits) { this.units = this.units.filter((u) => u.alive); this.dirtyUnits = false; }
    if (this.dirtyBuildings) { this.buildings = this.buildings.filter((b) => b.alive); this.dirtyBuildings = false; }
    if (this.dirtyResources) { this.resources = this.resources.filter((r) => r.alive); this.dirtyResources = false; }
  }

  rebuildSpatial() {
    const cs = this.cellSize, C = this.cells, B = this.buckets;
    for (let i = 0; i < B.length; i++) B[i].length = 0;
    for (const u of this.units) {
      if (!u.alive || u.garrisonedIn) continue;
      let cx = (u.x / cs) | 0, cy = (u.y / cs) | 0;
      if (cx < 0) cx = 0; else if (cx >= C) cx = C - 1;
      if (cy < 0) cy = 0; else if (cy >= C) cy = C - 1;
      B[cy * C + cx].push(u);
    }
  }

  unitsNear(x, y, r, out = []) {
    out.length = 0;
    const cs = this.cellSize, C = this.cells;
    const x0 = Math.max(0, Math.floor((x - r) / cs)), x1 = Math.min(C - 1, Math.floor((x + r) / cs));
    const y0 = Math.max(0, Math.floor((y - r) / cs)), y1 = Math.min(C - 1, Math.floor((y + r) / cs));
    const r2 = r * r;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const b = this.buckets[cy * C + cx];
      for (let i = 0; i < b.length; i++) {
        const u = b[i];
        const dx = u.x - x, dy = u.y - y;
        if (dx * dx + dy * dy <= r2 && u.alive && !u.garrisonedIn) out.push(u);
      }
    }
    return out;
  }

  separate() {
    const tmp = this._tmpC;
    const weight = (u) => (u.anim === 'work' ? 0.08 : u.anim === 'attack' ? 0.25 : u.moving ? 0.55 : 1);
    for (const u of this.units) {
      if (!u.alive || u.garrisonedIn) continue;
      const r = u.def.radius;
      this.unitsNear(u.x, u.y, r + 0.6, tmp);
      for (const v of tmp) {
        if (v.id <= u.id) continue;
        const dx = v.x - u.x, dy = v.y - u.y;
        const min = r + v.def.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        let d = Math.sqrt(d2), nx, ny;
        if (d < 1e-4) { const a = ((u.id * 7 + v.id * 13) % 628) / 100; nx = Math.cos(a); ny = Math.sin(a); d = 0; }
        else { nx = dx / d; ny = dy / d; }
        const overlap = (min - d) * 0.45;
        const wu = weight(u), wv = weight(v), ws = wu + wv;
        const pu = (overlap * wu) / ws, pv = (overlap * wv) / ws;
        u.tryMove(u.x - nx * pu, u.y - ny * pu);
        v.tryMove(v.x + nx * pv, v.y + ny * pv);
      }
    }
  }

  // ------------------------------------------------------------- queries
  isEnemy(a, b) {
    if (a < 0 || b < 0 || a === b) return false;
    const pa = this.players[a], pb = this.players[b];
    return pa.team === 0 || pa.team !== pb.team;
  }
  isAlly(a, b) { return a === b || (a >= 0 && b >= 0 && this.players[a].team !== 0 && this.players[a].team === this.players[b].team); }

  buildingVisibleTo(p, b) {
    if (this.opts.reveal === 'all') return true;
    const n = this.n, v = p.visible;
    for (let y = b.ty; y < b.ty + b.size; y++) for (let x = b.tx; x < b.tx + b.size; x++) if (v[y * n + x]) return true;
    return false;
  }
  isVisibleTo(pi, e) {
    if (pi < 0 || this.opts.reveal === 'all') return true;
    const p = this.players[pi];
    if (e.kind === 'building') return this.buildingVisibleTo(p, e);
    const x = Math.floor(e.x), y = Math.floor(e.y);
    if (x < 0 || y < 0 || x >= this.n || y >= this.n) return false;
    return p.visible[y * this.n + x] === 1;
  }

  canAttack(u, t) { return this.isValidAttackTarget(u, t); }
  isValidAttackTarget(u, t) {
    if (!t || !t.alive || t.garrisonedIn) return false;
    if (t.kind === 'resource') return false;
    if (t.kind === 'unit') {
      if (!u.st.canAttackUnits) return false;
      if (u.st.atk <= 0) return false;
      if (u.owner < 0) return t.owner >= 0; // wild animals (boar) fight back against anyone
      if (t.def.isAnimal) return t.owner === -1 || t.owner === u.owner || this.isEnemy(u.owner, t.owner);
      return this.isEnemy(u.owner, t.owner);
    }
    if (t.kind === 'building') {
      if (!u.st.canAttackBuildings || u.st.atk <= 0) return false;
      return this.isEnemy(u.owner, t.owner);
    }
    return false;
  }

  findTarget(u, radius, includeBuildings = false) {
    const p = this.players[u.owner];
    const n = this.n;
    let best = null, bestScore = 1e9;
    if (u.st.canAttackUnits) {
      const near = this.unitsNear(u.x, u.y, radius + 0.5, this._tmpA);
      for (const v of near) {
        if (v.owner < 0 || v.def.isAnimal || !this.isEnemy(u.owner, v.owner)) continue;
        if (!p.visible[Math.floor(v.y) * n + Math.floor(v.x)] && this.opts.reveal !== 'all') continue;
        const d = Math.hypot(v.x - u.x, v.y - u.y);
        if (d > radius + v.def.radius) continue;
        if (u.st.minRange && d < u.st.minRange + 0.3) continue;
        let score = d;
        if (v.isVillager) score += 2.5;
        else if (v.def.isMonk) score += 0.5;
        else if (v.def.classes.includes('siege')) score += u.st.range > 0 ? 2 : -1;
        if (v.order && v.order.target === u) score -= 2;
        if (score < bestScore) { bestScore = score; best = v; }
      }
      if (best) return best;
    }
    if ((includeBuildings || !u.st.canAttackUnits) && u.st.canAttackBuildings) {
      for (const b of this.buildings) {
        if (!b.alive || b.def.isWall || !this.isEnemy(u.owner, b.owner)) continue;
        // archers don't waste arrows on stone and timber they can barely scratch
        if (u.st.atkType === 'pierce' && !u.def.classes.includes('siege') && this.calcDamage(u.st, b) < 3) continue;
        if (Math.abs(b.x - u.x) > radius + 3 || Math.abs(b.y - u.y) > radius + 3) continue;
        const d = u.distTo(b);
        if (d > radius) continue;
        if (!this.buildingVisibleTo(p, b)) continue;
        const fort = b.type === 'castle' ? 14 : b.def.classes.includes('tower') ? 7 : 0;
        const score = d + (u.def.classes.includes('siege') ? -fort * 0.5 : fort) + (b.def.isFarm ? 2 : 0) + (b.type === 'house' ? 1 : 0);
        if (score < bestScore) { bestScore = score; best = b; }
      }
    }
    return best;
  }

  findBuildingTarget(b, range) {
    const p = this.players[b.owner];
    const near = this.unitsNear(b.x, b.y, range + b.size / 2 + 1, this._tmpA);
    let best = null, bs = 1e9;
    const n = this.n;
    for (const v of near) {
      if (v.owner < 0 || v.def.isAnimal || !this.isEnemy(b.owner, v.owner)) continue;
      if (!p.visible[Math.floor(v.y) * n + Math.floor(v.x)] && this.opts.reveal !== 'all') continue;
      const dx = Math.max(b.tx - v.x, 0, v.x - (b.tx + b.size)), dy = Math.max(b.ty - v.y, 0, v.y - (b.ty + b.size));
      const d = Math.hypot(dx, dy);
      if (d > range + 0.3) continue;
      let s = d;
      if (v.order && v.order.target === b) s -= 3;
      if (v.def.classes.includes('ram')) s += 6; // arrows barely scratch rams
      if (s < bs) { bs = s; best = v; }
    }
    return best;
  }

  findHealTarget(m, radius) {
    const near = this.unitsNear(m.x, m.y, radius, this._tmpA);
    let best = null, bd = 1e9;
    for (const v of near) {
      if (v === m || v.owner !== m.owner || v.hp >= v.maxHp || v.def.classes.includes('siege') || v.def.isAnimal) continue;
      const d = Math.hypot(v.x - m.x, v.y - m.y);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  nearestDropSite(pi, res, x, y) {
    let best = null, bd = 1e9;
    for (const b of this.players[pi].buildings) {
      if (!b.alive || !b.complete || !b.def.dropSite.includes(res)) continue;
      const dx = Math.max(b.tx - x, 0, x - (b.tx + b.size)), dy = Math.max(b.ty - y, 0, y - (b.ty + b.size));
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  // ---- Connectivity (4-connected walkable regions), recomputed lazily.
  regions() {
    const map = this.map;
    if (this._reg && (this._regVer === map.version || this.time - this._regT < 1.5)) return this._reg;
    const n = this.n, N = n * n, block = map.block;
    const reg = this._reg || (this._reg = new Int32Array(N));
    const stack = this._regStack || (this._regStack = new Int32Array(N));
    reg.fill(0);
    let id = 0;
    const open = (i) => block[i] === 0 || block[i] === 3;
    for (let i = 0; i < N; i++) {
      if (!open(i) || reg[i]) continue;
      id++;
      let sp = 0;
      stack[sp++] = i; reg[i] = id;
      while (sp) {
        const c = stack[--sp], x = c % n;
        if (x > 0 && open(c - 1) && !reg[c - 1]) { reg[c - 1] = id; stack[sp++] = c - 1; }
        if (x < n - 1 && open(c + 1) && !reg[c + 1]) { reg[c + 1] = id; stack[sp++] = c + 1; }
        if (c >= n && open(c - n) && !reg[c - n]) { reg[c - n] = id; stack[sp++] = c - n; }
        if (c < N - n && open(c + n) && !reg[c + n]) { reg[c + n] = id; stack[sp++] = c + n; }
      }
    }
    this._regVer = map.version; this._regT = this.time;
    return reg;
  }
  regionAt(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.n || y >= this.n) return 0;
    return this.regions()[y * this.n + x];
  }
  // Can a unit standing at (x, y) walk up to entity e?
  canReach(x, y, e) {
    const reg = this.regions(), n = this.n;
    let r = this.regionAt(x, y);
    if (!r) {
      const w = this.map.nearestWalkable(x, y, 2);
      if (!w) return true;
      r = reg[w.y * n + w.x];
    }
    if (e.kind === 'unit' || e.size === 0) {
      const er = this.regionAt(e.x, e.y);
      if (er) return er === r;
      const w = this.map.nearestWalkable(e.x, e.y, 1);
      return !w || reg[w.y * n + w.x] === r;
    }
    const s = e.size;
    for (let k = -1; k <= s; k++) {
      for (const [tx, ty] of [[e.tx + k, e.ty - 1], [e.tx + k, e.ty + s], [e.tx - 1, e.ty + k], [e.tx + s, e.ty + k]]) {
        if (tx < 0 || ty < 0 || tx >= n || ty >= n) continue;
        if (reg[ty * n + tx] === r) return true;
      }
    }
    if (e.kind === 'building' && e.def.walkable) return reg[e.ty * n + e.tx] === r;
    return false;
  }

  // Resource tile has an orthogonal walkable neighbour (so it can be gathered).
  reachableNode(r) {
    if (r.size === 0) return true;
    const m = this.map;
    return m.walkable(r.tx + 1, r.ty) || m.walkable(r.tx - 1, r.ty) || m.walkable(r.tx, r.ty + 1) || m.walkable(r.tx, r.ty - 1);
  }

  findResourceNear(pi, kinds, x, y, radius, exclude = null, forUnit = null, skip = null) {
    const n = this.n, map = this.map;
    const explored = pi >= 0 ? this.players[pi].explored : null;
    const cx = Math.floor(x), cy = Math.floor(y);
    let best = null, bd = 1e9;
    const statics = kinds.some((k) => k === 'wood' || k === 'gold' || k === 'stone' || k === 'berries' || k === 'fish');
    if (statics) {
      const r = Math.ceil(radius);
      for (let dy = -r; dy <= r; dy++) {
        const ty = cy + dy;
        if (ty < 0 || ty >= n) continue;
        for (let dx = -r; dx <= r; dx++) {
          const tx = cx + dx;
          if (tx < 0 || tx >= n) continue;
          const i = ty * n + tx;
          const id = map.occ[i];
          if (!id) continue;
          const d0 = dx * dx + dy * dy;
          if (d0 > radius * radius || d0 >= bd) continue;
          const e = this.entities.get(id);
          if (!e || e.kind !== 'resource' || e === exclude || !kinds.includes(e.gatherKind)) continue;
          if (skip && skip(e)) continue;
          if (explored && !explored[i]) continue;
          if (!this.reachableNode(e)) continue;
          if (forUnit && !this.canReach(forUnit.x, forUnit.y, e)) continue;
          let d = d0;
          if (forUnit) d = (e.x - forUnit.x) ** 2 + (e.y - forUnit.y) ** 2 + d0 * 0.5;
          if (d < bd) { bd = d; best = e; }
        }
      }
    }
    if (kinds.includes('hunt') || kinds.includes('sheep')) {
      for (const r of this.resources) {
        if (!r.alive || r.size !== 0 || r === exclude || !kinds.includes(r.gatherKind)) continue;
        if (skip && skip(r)) continue;
        const d = (r.x - x) ** 2 + (r.y - y) ** 2;
        if (d < bd && d < radius * radius * 1.5 && (!forUnit || this.canReach(forUnit.x, forUnit.y, r))) { bd = d; best = r; }
      }
      if (!best) {
        for (const u of this.units) {
          if (!u.alive || !u.def.isAnimal || u === exclude) continue;
          if (u.def.aggressiveWhenHit) continue;
          if (u.def.herdable && u.owner !== pi && u.owner !== -1) continue;
          if (explored && !explored[Math.floor(u.y) * n + Math.floor(u.x)]) continue;
          const d = (u.x - x) ** 2 + (u.y - y) ** 2;
          if (d < bd && d < radius * radius * 1.5 && (!forUnit || this.canReach(forUnit.x, forUnit.y, u))) { bd = d; best = u; }
        }
      }
    }
    return best;
  }

  findFreeFarm(pi, x, y, exclude = null) {
    let best = null, bd = 1e9;
    for (const b of this.players[pi].buildings) {
      if (!b.alive || !b.def.isFarm || b === exclude) continue;
      if (b.farmer && b.farmer.alive && b.farmer.order && (b.farmer.order.target === b || (b.farmer.order.resume && b.farmer.order.resume.target === b))) continue;
      const d = (b.x - x) ** 2 + (b.y - y) ** 2;
      if (d < bd && d < 400) { bd = d; best = b; }
    }
    return best;
  }

  findFoundationNear(pi, x, y, r, exclude = null, forUnit = null) {
    let best = null, bd = r * r;
    for (const b of this.players[pi].buildings) {
      if (!b.alive || b.complete || b === exclude) continue;
      if (forUnit && !this.canReach(forUnit.x, forUnit.y, b)) continue;
      const d = (b.x - x) ** 2 + (b.y - y) ** 2;
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  // Enemy structure (typically a wall) standing between a unit and its goal.
  findBlockingStructure(u, target = null) {
    if (!u.st.canAttackBuildings || u.st.atk <= 0) return null;
    const n = this.n, cx = Math.floor(u.x), cy = Math.floor(u.y);
    let best = null, bd = 1e9;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= n || y >= n) continue;
      const id = this.map.occ[y * n + x];
      if (!id) continue;
      const e = this.entities.get(id);
      if (!e || e.kind !== 'building' || !this.isEnemy(u.owner, e.owner)) continue;
      let d = dx * dx + dy * dy;
      if (target) d += ((e.x - target.x) ** 2 + (e.y - target.y) ** 2) * 0.05;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  entityAtTile(x, y) {
    if (!this.map.inb(x, y)) return null;
    const id = this.map.occ[y * this.n + x];
    return id ? this.entities.get(id) || null : null;
  }

  // ------------------------------------------------------------- placement
  canPlace(pi, type, tx, ty, ignoreFog = false) {
    const def = BUILDINGS[type];
    const s = def.size, n = this.n, map = this.map;
    if (tx < 0 || ty < 0 || tx + s > n || ty + s > n) return false;
    const ex = pi >= 0 ? this.players[pi].explored : null;
    for (let y = ty; y < ty + s; y++) for (let x = tx; x < tx + s; x++) {
      const i = y * n + x;
      if (!TER_BUILDABLE[map.terrain[i]]) return false;
      if (map.block[i] !== 0 || map.occ[i] !== 0) {
        if (!(def.isGate && this.wallForGate(pi, type, x, y))) return false;
      }
      if (!ignoreFog && ex && !ex[i]) return false;
    }
    return true;
  }
  // An own wall segment (finished or not) of the right material that a gate can replace.
  wallForGate(pi, type, x, y) {
    const e = this.entityAtTile(x, y);
    const want = type === 'gate' ? 'stoneWall' : 'palisadeWall';
    return e && e.kind === 'building' && e.owner === pi && e.type === want ? e : null;
  }

  // Search rings around (cx, cy) for a valid building site keeping gaps free.
  findPlacement(pi, type, cx, cy, opts = {}) {
    const def = BUILDINGS[type], s = def.size, n = this.n, map = this.map;
    const minD = opts.minDist ?? 2, maxD = opts.maxDist ?? 20, gap = opts.gap ?? 1;
    const rng = this.rng;
    const gapOK = (tx, ty) => {
      for (let y = ty - gap; y < ty + s + gap; y++) for (let x = tx - gap; x < tx + s + gap; x++) {
        if (x < 0 || y < 0 || x >= n || y >= n) return false;
        if (x >= tx && x < tx + s && y >= ty && y < ty + s) continue;
        const id = map.occ[y * n + x];
        if (!id) { if (map.block[y * n + x] && !opts.allowWaterGap) return false; continue; }
        const e = this.entities.get(id);
        if (!e) continue;
        if (e.kind === 'building') { if (!(opts.allowFarmGap && e.def.isFarm) && !(opts.adjacentOK)) return false; }
        else if (!opts.allowResourceGap) return false;
      }
      return true;
    };
    for (let r = minD; r <= maxD; r++) {
      const cands = [];
      const ox = Math.round(cx - s / 2), oy = Math.round(cy - s / 2);
      for (let d = -r; d <= r; d++) {
        for (const [tx, ty] of [[ox + d, oy - r], [ox + d, oy + r], [ox - r, oy + d], [ox + r, oy + d]]) {
          if (!this.canPlace(pi, type, tx, ty, opts.ignoreFog)) continue;
          if (!gapOK(tx, ty)) continue;
          if (opts.avoid && opts.avoid(tx, ty)) continue;
          cands.push({ x: tx, y: ty });
        }
      }
      if (cands.length) {
        if (opts.score) { cands.sort((a, b) => opts.score(a) - opts.score(b)); return cands[0]; }
        return cands[Math.floor(rng.next() * cands.length)];
      }
    }
    return null;
  }

  pushUnitsOut(b) {
    const near = this.unitsNear(b.x, b.y, b.size + 1, this._tmpA).slice();
    for (const u of near) {
      if (b.def.walkable) continue;
      const inside = u.x > b.tx - u.def.radius && u.x < b.tx + b.size + u.def.radius && u.y > b.ty - u.def.radius && u.y < b.ty + b.size + u.def.radius;
      if (!inside) continue;
      const w = this.map.nearestWalkable(u.x, u.y, 6);
      if (w) { u.x = u.px = w.x + 0.5; u.y = u.py = w.y + 0.5; u.needPath = !!u.goal; }
    }
  }

  spawnPoint(b, k = 0, tx, ty) {
    const s = b.size, pts = [];
    if (tx === undefined) { tx = b.x + s; ty = b.y + s; }
    for (let d = 1; d <= 5 && pts.length <= k; d++) {
      for (let y = b.ty - d; y < b.ty + s + d; y++) for (let x = b.tx - d; x < b.tx + s + d; x++) {
        const onRing = x === b.tx - d || y === b.ty - d || x === b.tx + s + d - 1 || y === b.ty + s + d - 1;
        if (!onRing || !this.map.walkable(x, y)) continue;
        pts.push({ x: x + 0.5, y: y + 0.5, d: d * 100 + Math.hypot(x + 0.5 - tx, y + 0.5 - ty) });
      }
    }
    if (!pts.length) return { x: b.x, y: b.y + s / 2 + 0.6 };
    pts.sort((a, c) => a.d - c.d);
    const p = pts[k % pts.length];
    return { x: p.x + (this.rng.next() - 0.5) * 0.3, y: p.y + (this.rng.next() - 0.5) * 0.3 };
  }

  // ------------------------------------------------------------- economy
  canAfford(pi, cost) {
    const r = this.players[pi].res;
    for (const k in cost) if (r[k] + 1e-6 < cost[k]) return false;
    return true;
  }
  pay(pi, cost) {
    if (!this.canAfford(pi, cost)) return false;
    const r = this.players[pi].res;
    for (const k in cost) r[k] -= cost[k];
    return true;
  }
  refund(pi, cost, frac = 1) {
    const r = this.players[pi].res;
    for (const k in cost) r[k] += cost[k] * frac;
  }
  deposit(pi, res, amt) {
    const p = this.players[pi];
    p.res[res] += amt;
    p.stats.gathered[res] += amt;
  }
  payRepair(pi, b, hp) {
    const c = b.def.cost, f = (hp / b.maxHp) * 0.5, r = this.players[pi].res;
    for (const k in c) if (r[k] < c[k] * f) return false;
    for (const k in c) r[k] -= c[k] * f;
    return true;
  }

  depleteResource(t) {
    if (t.kind === 'building') {
      const p = this.players[t.owner];
      if (p.autoReseed && p.res.wood >= 60) {
        p.res.wood -= 60;
        t.amount = t.maxAmount = p.eco.farmFood;
        this.emit({ type: 'reseed', building: t });
        return;
      }
      this.destroyBuilding(t, null, -1, true);
      return;
    }
    t.alive = false;
    t.amount = 0;
    this.entities.delete(t.id);
    this.dirtyResources = true;
    if (t.size) this.map.clearStatic(t.tx, t.ty);
    this.emit({ type: 'depleted', res: t });
  }

  updateMarkets() {
    for (const p of this.players) for (const k in p.market) p.market[k] += (100 - p.market[k]) * 0.004;
  }

  // ------------------------------------------------------------- combat
  calcDamage(s, t) {
    const armor = s.atkType === 'pierce' ? t.st.armorP : t.st.armorM;
    let dmg = Math.max(0, s.atk - armor);
    const cls = t.def.classes;
    for (const c in s.bonus) if (cls.includes(c)) dmg += s.bonus[c];
    return Math.max(1, dmg);
  }

  meleeHit(u, t) {
    const dmg = this.calcDamage(u.st, t);
    this.emit({ type: 'melee', x: t.x, y: t.y, attacker: u, target: t });
    this.applyDamage(t, dmg, u, u.owner);
  }

  launchProjectile(src, target, opts = {}) {
    const isB = src.kind === 'building';
    const st = src.st;
    const kind = isB ? 'arrow' : src.isVillager ? 'spear' : (src.def.projectile || 'arrow');
    let sx = src.x, sy = src.y;
    let sz = isB ? (src.def.classes.includes('tower') ? 2.1 : src.type === 'castle' ? 2.2 : 1.5) : 0.55;
    if (isB) { sx += (this.rng.next() - 0.5) * src.size * 0.6; sy += (this.rng.next() - 0.5) * src.size * 0.6; }
    let acc = src.isVillager ? 0.9 : st.accuracy ?? 1;
    if (target.kind === 'building') acc = 1;
    if (opts.spread) acc -= 0.05;
    const hit = this.rng.next() < acc;
    let tx = target.x, ty = target.y;
    if (target.kind === 'building') {
      tx = target.tx + 0.25 + this.rng.next() * (target.size - 0.5);
      ty = target.ty + 0.25 + this.rng.next() * (target.size - 0.5);
    }
    if (!hit) {
      const a = this.rng.next() * TAU, r = 0.5 + this.rng.next() * 1.0;
      tx += Math.cos(a) * r; ty += Math.sin(a) * r;
    }
    const dist = Math.hypot(tx - sx, ty - sy);
    const speed = PROJ_SPEED[kind] || 7;
    const p = {
      kind, owner: src.owner, attacker: src,
      stats: { atk: st.atk, atkType: st.atkType, bonus: st.bonus },
      target: hit ? target : null, aimAt: target,
      sx, sy, sz, tx, ty, tz: target.kind === 'building' ? 0.6 : 0.35,
      x: sx, y: sy, z: sz, px: sx, py: sy, pz: sz,
      t: -(opts.spread ? opts.spread * 0.04 : 0), dur: Math.max(0.12, dist / speed),
      arc: kind === 'stone' || kind === 'boulder' ? 0.28 * dist + 0.4 : kind === 'bolt' ? 0.05 * dist : 0.12 * dist,
      splash: src.def && src.def.splash ? src.def.splash : 0, friendly: !!(src.def && src.def.friendlyFire),
    };
    this.projectiles.push(p);
    this.emit({ type: 'shoot', kind, x: sx, y: sy, src });
  }

  updateProjectiles(dt) {
    let any = false;
    for (const p of this.projectiles) {
      p.px = p.x; p.py = p.y; p.pz = p.z;
      p.t += dt;
      if (p.t < 0) continue;
      if (p.target && p.target.alive && p.target.kind === 'unit' && !p.target.garrisonedIn) { p.tx = p.target.x; p.ty = p.target.y; }
      const f = Math.min(1, p.t / p.dur);
      p.x = p.sx + (p.tx - p.sx) * f;
      p.y = p.sy + (p.ty - p.sy) * f;
      p.z = p.sz + (p.tz - p.sz) * f + 4 * p.arc * f * (1 - f);
      if (f >= 1) { this.impact(p); p.done = true; any = true; }
    }
    if (any) this.projectiles = this.projectiles.filter((p) => !p.done);
  }

  impact(p) {
    const t = p.target;
    if (t && t.alive && !t.garrisonedIn) this.applyDamage(t, this.calcDamage(p.stats, t), p.attacker, p.owner);
    if (p.splash > 0) {
      const near = this.unitsNear(p.tx, p.ty, p.splash + 0.3, this._tmpB).slice();
      for (const u of near) {
        if (u === t || !u.alive) continue;
        if (u.owner < 0) continue;
        if (!p.friendly && !this.isEnemy(p.owner, u.owner)) continue;
        if (Math.hypot(u.x - p.tx, u.y - p.ty) > p.splash + u.def.radius) continue;
        this.applyDamage(u, this.calcDamage(p.stats, u) * 0.8, p.attacker, p.owner);
      }
    }
    this.emit({ type: 'impact', kind: p.kind, x: p.tx, y: p.ty, hit: !!(t && t.alive !== undefined), building: t && t.kind === 'building', target: t });
  }

  applyDamage(t, dmg, att, attOwner) {
    if (!t.alive) return;
    t.hp -= dmg;
    if (t.kind === 'unit') { t.lastHitBy = att; t.lastHitT = this.time; }
    else { t.lastAttackedT = this.time; t.lastAttacker = att; }
    if (t.owner >= 0 && attOwner >= 0 && attOwner !== t.owner) this.alertAttack(t, attOwner, att);
    if (t.hp <= 0) {
      if (t.kind === 'unit') this.killUnit(t, att, attOwner);
      else if (t.kind === 'building') this.destroyBuilding(t, att, attOwner);
      return;
    }
    if (t.kind === 'unit') t.onAttacked(att && att.alive ? att : null);
  }

  alertAttack(t, attOwner, att) {
    const p = this.players[t.owner];
    p.attacks.push({ x: t.x, y: t.y, t: this.time, by: att, target: t });
    if (p.attacks.length > 40) p.attacks.splice(0, p.attacks.length - 40);
    const far = Math.hypot(t.x - p.lastAlertX, t.y - p.lastAlertY) > 18;
    if (this.time - p.lastAlertT > 20 || (far && this.time - p.lastAlertT > 6)) {
      p.lastAlertT = this.time; p.lastAlertX = t.x; p.lastAlertY = t.y;
      this.emit({ type: 'underAttack', player: t.owner, x: t.x, y: t.y, target: t, by: attOwner });
    }
  }

  unitValue(def) { const c = def.cost || {}; return (c.food || 0) + (c.wood || 0) + (c.gold || 0) + (c.stone || 0); }

  killUnit(u, att = null, attOwner = -1) {
    if (!u.alive) return;
    u.alive = false;
    u.hp = 0;
    this.entities.delete(u.id);
    this.dirtyUnits = true;
    if (u.garrisonedIn) {
      const b = u.garrisonedIn;
      b.garrisoned = b.garrisoned.filter((v) => v !== u);
      u.garrisonedIn = null;
    }
    if (u.order) {
      const tt = u.order.target || (u.order.resume && u.order.resume.target);
      if (tt && tt.farmer === u) tt.farmer = null;
    }
    if (u.owner >= 0) {
      const p = this.players[u.owner];
      const i = p.units.indexOf(u);
      if (i >= 0) p.units.splice(i, 1);
      p.pop -= u.def.pop;
      if (!u.def.isAnimal) p.stats.unitsLost++;
    }
    if (attOwner >= 0 && attOwner !== u.owner && !u.def.isAnimal) {
      const s = this.players[attOwner].stats;
      s.kills++; s.killValue += this.unitValue(u.def);
    }
    if (u.def.isAnimal && u.def.food) {
      u.carcass = this.addResource('carcass', 0, 0, {
        float: true, x: u.x, y: u.y, amount: u.def.food, gatherKind: u.def.carcassGather, animal: u.type, facing: u.facing,
      });
    }
    this.emit({ type: 'death', unit: u, x: u.x, y: u.y, killer: att });
  }

  destroyBuilding(b, att = null, attOwner = -1, silent = false) {
    if (!b.alive) return;
    b.alive = false;
    b.hp = 0;
    this.entities.delete(b.id);
    this.dirtyBuildings = true;
    const p = this.players[b.owner];
    const i = p.buildings.indexOf(b);
    if (i >= 0) p.buildings.splice(i, 1);
    for (let y = b.ty; y < b.ty + b.size; y++) for (let x = b.tx; x < b.tx + b.size; x++) {
      if (this.map.occ[y * this.n + x] === b.id) this.map.clearStatic(x, y);
    }
    if (b.garrisoned.length) this.ungarrison(b);
    for (const it of b.queue) if (it.kind === 'tech') p.researching.delete(it.id);
    b.queue.length = 0;
    if (b.farmer) b.farmer = null;
    if (!silent) {
      p.stats.buildingsLost++;
      if (attOwner >= 0 && attOwner !== b.owner) {
        const s = this.players[attOwner].stats;
        s.razed++; s.razeValue += this.unitValue(b.def);
      }
    }
    this.recalcPop(p);
    if (b.def.isWonder && p.wonderStart !== null) { p.wonderStart = null; this.emit({ type: 'wonderLost', player: b.owner }); }
    this.emit({ type: 'destroyed', building: b, x: b.x, y: b.y, silent });
  }

  completeBuilding(b) {
    b.complete = true;
    b.progress = 1;
    b.completedAt = this.time;
    b.ageStyle = this.players[b.owner].age;
    const p = this.players[b.owner];
    p.stats.buildingsBuilt++;
    if (b.def.isFarm) { b.amount = b.maxAmount = p.eco.farmFood; }
    this.recalcPop(p);
    this.emit({ type: 'built', building: b, player: b.owner });
  }

  convert(u, newOwner, monk = null) {
    const old = u.owner;
    if (old >= 0) {
      const p = this.players[old];
      const i = p.units.indexOf(u);
      if (i >= 0) p.units.splice(i, 1);
      p.pop -= u.def.pop;
      p.stats.unitsLost++;
    }
    u.owner = newOwner;
    const np = this.players[newOwner];
    np.units.push(u);
    np.pop += u.def.pop;
    if (monk) np.stats.converted++;
    u.stop();
    u.carry = 0;
    const line = LINES[u.def.line], tier = np.lineTier[u.def.line];
    u.setDef(line && tier && line.indexOf(tier) > line.indexOf(u.def.id) ? UNITS[tier] : u.def);
    this.emit({ type: 'convert', unit: u, from: old, to: newOwner, monk });
  }

  captureAnimal(u, newOwner) {
    const old = u.owner;
    if (old >= 0) { const p = this.players[old]; const i = p.units.indexOf(u); if (i >= 0) p.units.splice(i, 1); }
    u.owner = newOwner;
    if (newOwner >= 0) this.players[newOwner].units.push(u);
    u.stop();
    this.emit({ type: 'captured', unit: u, from: old, to: newOwner });
  }

  updateSheep() {
    const tmp = this._tmpB;
    for (const u of this.units) {
      if (!u.alive || !u.def.herdable) continue;
      this.unitsNear(u.x, u.y, 4.2, tmp);
      let own = false, bestO = -1, bd = 1e9;
      for (const v of tmp) {
        if (v.owner < 0 || v.def.isAnimal) continue;
        if (v.owner === u.owner) { own = true; break; }
        const d = (v.x - u.x) ** 2 + (v.y - u.y) ** 2;
        if (d < bd) { bd = d; bestO = v.owner; }
      }
      if (!own && bestO >= 0 && bestO !== u.owner) this.captureAnimal(u, bestO);
    }
  }

  // ------------------------------------------------------------- garrison
  canGarrison(u, b) {
    if (!b || !b.alive || !b.complete || !b.def.garrison || b.owner !== u.owner) return false;
    if (b.garrisoned.length >= b.def.garrison) return false;
    if (u.def.isAnimal || u.def.classes.includes('siege')) return false;
    const cav = u.def.classes.includes('cavalry');
    if (b.def.classes.includes('tc') || b.def.classes.includes('tower')) return !cav;
    return true;
  }
  garrison(u, b) {
    u.garrisonedIn = b;
    b.garrisoned.push(u);
    u.stopMoving();
    u.order = null;
    u.anim = 'idle';
    u.x = u.px = b.x; u.y = u.py = b.y;
    this.emit({ type: 'garrison', unit: u, building: b });
  }
  ungarrison(b, list = null) {
    const out = list || b.garrisoned.slice();
    let k = 0;
    for (const u of out) {
      const idx = b.garrisoned.indexOf(u);
      if (idx >= 0) b.garrisoned.splice(idx, 1);
      u.garrisonedIn = null;
      const pos = this.spawnPoint(b, k++, b.rally ? b.rally.x : undefined, b.rally ? b.rally.y : undefined);
      u.x = u.px = pos.x; u.y = u.py = pos.y;
      if (u.bellResume && u.bellResume.target && (u.bellResume.target.alive || u.bellResume.type !== 'gather')) { const r = u.bellResume; u.bellResume = null; u.setOrder(r); }
      else if (b.rally && b.alive) { u.bellResume = null; u.setOrder({ type: 'move', x: b.rally.x, y: b.rally.y }); }
      else { u.bellResume = null; u.setOrder(null); }
    }
  }

  // ------------------------------------------------------------- visibility
  disc(r) {
    const R = Math.max(1, Math.round(r));
    let d = this.discs[R];
    if (!d) {
      const arr = [];
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dy * dy <= R * R + R * 0.8) arr.push(dx, dy);
      d = this.discs[R] = Int16Array.from(arr);
    }
    return d;
  }

  updateVisibility() {
    const n = this.n;
    const all = this.opts.reveal === 'all';
    for (const p of this.players) {
      const vis = p.visible;
      if (all) { vis.fill(1); p.explored.fill(1); continue; }
      vis.fill(0);
      const stamp = (x, y, r) => {
        const cx = Math.floor(x), cy = Math.floor(y), d = this.disc(r);
        for (let k = 0; k < d.length; k += 2) {
          const tx = cx + d[k], ty = cy + d[k + 1];
          if (tx >= 0 && ty >= 0 && tx < n && ty < n) vis[ty * n + tx] = 1;
        }
      };
      for (const u of p.units) if (u.alive && !u.garrisonedIn && !u.def.isAnimal) stamp(u.x, u.y, u.st.los);
      for (const u of p.units) if (u.alive && u.def.isAnimal) stamp(u.x, u.y, 2);
      for (const b of p.buildings) if (b.alive) stamp(b.x, b.y, (b.complete ? b.st.los : 2) + b.size / 2);
    }
    // Shared team vision
    for (const p of this.players) {
      if (!p.team) continue;
      for (const q of this.players) {
        if (q === p || q.team !== p.team || q.index < p.index) continue;
        const a = p.visible, b = q.visible;
        for (let i = 0; i < a.length; i++) if (a[i] || b[i]) { a[i] = 1; b[i] = 1; }
      }
    }
    if (!all) for (const p of this.players) {
      const vis = p.visible, ex = p.explored;
      for (let i = 0; i < vis.length; i++) if (vis[i]) ex[i] = 1;
    }
    for (const p of this.players) this.updateMemory(p);
  }

  updateMemory(p) {
    for (const b of this.buildings) {
      if (!b.alive || b.owner === p.index) continue;
      if (!this.buildingVisibleTo(p, b)) continue;
      let m = p.memory.get(b.id);
      if (!m) { m = { id: b.id }; p.memory.set(b.id, m); }
      m.type = b.type; m.owner = b.owner; m.tx = b.tx; m.ty = b.ty; m.size = b.size; m.ageStyle = b.ageStyle;
      m.complete = b.complete; m.progress = b.progress; m.variant = b.variant; m.hpFrac = b.hp / b.maxHp; m.seenT = this.time;
    }
    for (const [id, m] of p.memory) {
      const b = this.entities.get(id);
      if (b && b.alive && b.owner === m.owner) continue;
      const n = this.n;
      let seen = this.opts.reveal === 'all';
      for (let y = m.ty; y < m.ty + m.size && !seen; y++) for (let x = m.tx; x < m.tx + m.size; x++) if (p.visible[y * n + x]) { seen = true; break; }
      if (seen) p.memory.delete(id);
    }
  }

  // ------------------------------------------------------------- victory
  checkVictory() {
    if (this.over) return;
    for (const p of this.players) {
      if (!p.alive) continue;
      const hasUnit = p.units.some((u) => u.alive && !u.def.isAnimal);
      const hasBld = p.buildings.some((b) => b.alive && b.complete && !b.def.isWall && !b.def.isFarm && b.type !== 'house');
      if (!hasUnit && !hasBld) this.defeat(p);
    }
    for (const p of this.players) {
      if (!p.alive) continue;
      const w = p.buildings.find((b) => b.alive && b.def.isWonder && b.complete);
      if (w) {
        if (p.wonderStart === null) { p.wonderStart = this.time; this.emit({ type: 'wonderBuilt', player: p.index }); }
        else if (this.time - p.wonderStart >= this.opts.wonderTime) {
          for (const q of this.players) if (q.alive && !this.isAlly(q.index, p.index)) this.defeat(q);
        }
      } else p.wonderStart = null;
    }
    const alive = this.players.filter((p) => p.alive);
    const teams = new Set(alive.map((p) => (p.team ? 't' + p.team : 'p' + p.index)));
    if (teams.size <= 1) {
      this.over = true;
      this.winner = alive.length ? alive[0].index : null;
      this.emit({ type: 'gameOver', winner: this.winner, winners: alive.map((p) => p.index) });
    }
  }

  defeat(p, resigned = false) {
    if (!p.alive) return;
    p.alive = false;
    p.resigned = resigned;
    p.defeatedAt = this.time;
    const lost = p.stats.unitsLost;
    for (const u of p.units.slice()) {
      if (u.def.isAnimal) this.captureAnimal(u, -1);
      else this.killUnit(u, null, -1);
    }
    p.stats.unitsLost = lost;
    for (const b of p.buildings.slice()) this.destroyBuilding(b, null, -1, true);
    this.emit({ type: 'defeat', player: p.index, resigned });
  }

  recordHistory() {
    for (const p of this.players) {
      const vils = p.countUnits((u) => u.isVillager);
      const mil = p.countUnits((u) => u.isMilitary);
      p.stats.maxVillagers = Math.max(p.stats.maxVillagers, vils);
      p.stats.maxMilitary = Math.max(p.stats.maxMilitary, mil);
      p.stats.history.push({ t: this.time, score: p.score(), vils, mil, pop: p.pop });
    }
  }

  // ------------------------------------------------------------- availability
  canBuildType(pi, type) {
    const def = BUILDINGS[type], p = this.players[pi];
    if (!def || def.hidden) return { ok: false, reason: 'Unavailable' };
    if (p.age < def.age) return { ok: false, reason: `Requires ${AGE_NAMES[def.age]}` };
    for (const r of def.requires) if (!p.hasBuilding(r)) return { ok: false, reason: `Requires a ${BUILDINGS[r].name}` };
    if (def.isWonder && p.buildings.some((b) => b.alive && b.def.isWonder)) return { ok: false, reason: 'Only one Wonder allowed' };
    return { ok: true };
  }

  canTrain(b, line) {
    const p = this.players[b.owner];
    if (!b.alive || !b.complete) return { ok: false, reason: 'Building not complete' };
    if (!b.def.trains.includes(line)) return { ok: false, reason: 'Cannot train here' };
    const def = UNITS[p.lineTier[line]];
    if (p.age < def.age) return { ok: false, reason: `Requires ${AGE_NAMES[def.age]}`, def };
    if (b.queue.length >= 15) return { ok: false, reason: 'Queue is full', def };
    return { ok: true, def };
  }

  ageReqMet(p, age) {
    const req = AGE_REQUIREMENTS[age];
    const have = new Set();
    for (const b of p.buildings) if (b.alive && b.complete && req.includes(b.type)) have.add(b.type);
    return have.size + (have.has('castle') ? 1 : 0) >= 2;
  }

  canResearch(b, id) {
    const t = TECHS[id], p = this.players[b.owner];
    if (!b.alive || !b.complete) return { ok: false, reason: 'Building not complete' };
    if (!b.def.researches.includes(id)) return { ok: false, reason: 'Not available here' };
    if (p.techs.has(id)) return { ok: false, reason: 'Already researched', done: true };
    if (p.researching.has(id)) return { ok: false, reason: 'Being researched', busy: true };
    if (t.isAge) {
      const target = t.effects[0].age;
      if (p.age >= target) return { ok: false, reason: 'Already reached', done: true };
      if (p.age < target - 1) return { ok: false, reason: `Requires ${AGE_NAMES[target - 1]}`, hidden: true };
      for (const q of ['feudalAge', 'castleAge', 'imperialAge']) if (p.researching.has(q)) return { ok: false, reason: 'Already advancing', busy: true };
      if (!this.ageReqMet(p, target)) {
        const names = AGE_REQUIREMENTS[target].map((x) => BUILDINGS[x].name).join(', ');
        return { ok: false, reason: `Requires two of: ${names}` };
      }
    }
    for (const r of t.requires) if (!p.techs.has(r)) return { ok: false, reason: `Requires ${TECHS[r].name}`, hidden: true };
    if (!t.isAge && p.age < t.age) return { ok: false, reason: `Requires ${AGE_NAMES[t.age]}` };
    if (b.queue.length >= 15) return { ok: false, reason: 'Queue is full' };
    return { ok: true };
  }

  // ------------------------------------------------------------- commands
  formation(units, x, y) {
    if (units.length === 1) return [{ x, y }];
    let cx = 0, cy = 0;
    for (const u of units) { cx += u.x; cy += u.y; }
    cx /= units.length; cy /= units.length;
    let dx = x - cx, dy = y - cy;
    const l = Math.hypot(dx, dy) || 1;
    dx /= l; dy /= l;
    const px = -dy, py = dx;
    const n = units.length;
    const cols = Math.ceil(Math.sqrt(n * 1.8));
    const rows = Math.ceil(n / cols);
    const sp = units.some((u) => u.def.radius > 0.3) ? 0.95 : 0.72;
    const ranked = units.map((u) => ({
      u, melee: u.st.range > 0 ? 1 : 0,
      f: (u.x - cx) * dx + (u.y - cy) * dy, l: (u.x - cx) * px + (u.y - cy) * py,
    })).sort((a, b) => a.melee - b.melee || b.f - a.f);
    const out = new Map();
    for (let r = 0; r < rows; r++) {
      const row = ranked.slice(r * cols, (r + 1) * cols).sort((a, b) => a.l - b.l);
      row.forEach((e, c) => {
        const lat = (c - (row.length - 1) / 2) * sp, fwd = -r * sp;
        let tx = x + px * lat + dx * fwd, ty = y + py * lat + dy * fwd;
        if (!this.map.walkableF(tx, ty)) {
          const w = this.map.nearestWalkable(tx, ty, 4);
          if (w) { tx = w.x + 0.5; ty = w.y + 0.5; } else { tx = x; ty = y; }
        }
        out.set(e.u, { x: tx, y: ty });
      });
    }
    return units.map((u) => out.get(u));
  }

  cmdMove(units, x, y, opts = {}) {
    units = units.filter((u) => u.alive && !u.garrisonedIn);
    if (!units.length) return;
    x = Math.max(0.3, Math.min(this.n - 0.3, x));
    y = Math.max(0.3, Math.min(this.n - 0.3, y));
    const slots = this.formation(units, x, y);
    units.forEach((u, i) => u.command({ type: 'move', x: slots[i].x, y: slots[i].y, attackMove: opts.attackMove || false }, opts.queue));
  }

  smartOrderFor(u, t) {
    if (!t || !t.alive) return null;
    const pi = u.owner;
    if (u.def.isAnimal) return null;
    if (u.isVillager) {
      if (t.kind === 'resource') return { type: 'gather', target: t };
      if (t.kind === 'unit' && t.def.isAnimal) return { type: 'gather', target: t };
      if (t.kind === 'building' && t.owner === pi) {
        if (!t.complete) return { type: 'build', target: t };
        if (t.def.isFarm) return { type: 'gather', target: t };
        if (u.carry > 0 && t.def.dropSite.includes(u.carryType)) {
          const prev = u.order && u.order.type === 'gather' ? u.order : u.order && u.order.type === 'return' ? u.order.resume : null;
          return { type: 'return', drop: t, resume: prev };
        }
        if (t.hp < t.maxHp) return { type: 'repair', target: t };
        if (this.canGarrison(u, t)) return { type: 'garrison', target: t };
        return null;
      }
      if (this.isEnemy(pi, t.owner)) return { type: 'attack', target: t };
      return null;
    }
    if (u.def.isMonk) {
      if (t.kind === 'unit' && t.owner === pi && t !== u && !t.def.isAnimal) return { type: 'heal', target: t };
      if (t.kind === 'unit' && this.isEnemy(pi, t.owner)) return { type: 'convert', target: t };
      if (t.kind === 'building' && t.owner === pi && this.canGarrison(u, t)) return { type: 'garrison', target: t };
      return null;
    }
    if (t.kind === 'building' && t.owner === pi) return this.canGarrison(u, t) ? { type: 'garrison', target: t } : null;
    if ((t.kind === 'unit' || t.kind === 'building') && this.isValidAttackTarget(u, t)) return { type: 'attack', target: t };
    return null;
  }

  // Right-click style command. Returns the dominant order type.
  cmdSmart(units, x, y, target, queue = false) {
    const list = units.filter((u) => u.alive && !u.garrisonedIn);
    if (!list.length) return null;
    const movers = [];
    let kind = 'move';
    for (const u of list) {
      const o = this.smartOrderFor(u, target);
      if (o) { u.command(o, queue); kind = o.type; }
      else movers.push(u);
    }
    if (movers.length) this.cmdMove(movers, x, y, { queue });
    return kind;
  }

  cmdGather(units, target, queue = false) { for (const u of units) if (u.alive && u.isVillager) u.command({ type: 'gather', target }, queue); }
  cmdAttack(units, target, queue = false) { for (const u of units) if (u.alive && this.isValidAttackTarget(u, target)) u.command({ type: 'attack', target }, queue); }
  cmdBuild(units, b, queue = false) { for (const u of units) if (u.alive && u.isVillager) u.command({ type: 'build', target: b }, queue); }
  cmdRepair(units, b, queue = false) { for (const u of units) if (u.alive && u.isVillager) u.command({ type: 'repair', target: b }, queue); }
  cmdAttackMove(units, x, y, queue = false) { this.cmdMove(units, x, y, { attackMove: true, queue }); }
  cmdStop(units) { for (const u of units) if (u.alive) u.stop(); }

  cmdPlace(pi, type, tx, ty, builders = [], queue = false) {
    const chk = this.canBuildType(pi, type);
    if (!chk.ok) return chk;
    const p = this.players[pi];
    if (!this.canPlace(pi, type, tx, ty, !p.human)) return { ok: false, reason: 'Cannot build there' };
    const def = BUILDINGS[type];
    if (!this.pay(pi, def.cost)) return { ok: false, reason: 'Not enough resources' };
    if (def.isGate) {
      const w = this.wallForGate(pi, type, tx, ty);
      if (w) { if (!w.complete) this.refund(pi, w.def.cost, 1 - w.progress); this.destroyBuilding(w, null, -1, true); }
    }
    const b = this.addBuilding(type, pi, tx, ty, false);
    if (!def.isGate) this.pushUnitsOut(b);
    // Shift-placing queues behind other build orders, but never behind endless work like gathering.
    for (const u of builders) if (u.alive && u.isVillager && u.owner === pi) u.command({ type: 'build', target: b }, queue && !!u.order && u.order.type === 'build');
    this.emit({ type: 'placed', building: b, player: pi });
    return { ok: true, building: b };
  }

  wallLine(x0, y0, x1, y1) {
    const pts = [];
    let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx - dy;
    let x = x0, y = y0;
    for (let guard = 0; guard < 400; guard++) {
      pts.push({ x, y });
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      // Walls step orthogonally so the line has no diagonal gaps.
      if (e2 > -dy) { err -= dy; x += sx; if (e2 < dx) pts.push({ x, y }); }
      if (e2 < dx) { err += dx; y += sy; }
    }
    const seen = new Set();
    return pts.filter((p) => { const k = p.x + ',' + p.y; if (seen.has(k)) return false; seen.add(k); return true; });
  }

  cmdPlaceWall(pi, type, x0, y0, x1, y1, builders = [], queue = false) {
    const chk = this.canBuildType(pi, type);
    if (!chk.ok) return chk;
    const placed = [];
    for (const p of this.wallLine(x0, y0, x1, y1)) {
      if (!this.canPlace(pi, type, p.x, p.y, !this.players[pi].human)) continue;
      if (!this.pay(pi, BUILDINGS[type].cost)) break;
      const b = this.addBuilding(type, pi, p.x, p.y, false);
      this.pushUnitsOut(b);
      placed.push(b);
    }
    if (!placed.length) return { ok: false, reason: 'Cannot build there' };
    for (const u of builders) {
      if (!u.alive || !u.isVillager) continue;
      placed.forEach((b, i) => u.command({ type: 'build', target: b }, i > 0 || (queue && !!u.order && u.order.type === 'build')));
    }
    this.emit({ type: 'placed', building: placed[0], player: pi });
    return { ok: true, buildings: placed };
  }

  cmdTrain(b, line, count = 1) {
    const p = this.players[b.owner];
    let n = 0, last = null;
    for (let k = 0; k < count; k++) {
      const chk = this.canTrain(b, line);
      if (!chk.ok) { last = chk; break; }
      if (!this.pay(b.owner, chk.def.cost)) { last = { ok: false, reason: 'Not enough resources' }; break; }
      b.queue.push({ kind: 'unit', line, t: 0, qid: ++this.qidSeq, cost: chk.def.cost });
      n++;
    }
    void p;
    return n ? { ok: true, n } : last;
  }

  cmdResearch(b, id) {
    const chk = this.canResearch(b, id);
    if (!chk.ok) return chk;
    if (!this.pay(b.owner, TECHS[id].cost)) return { ok: false, reason: 'Not enough resources' };
    b.queue.push({ kind: 'tech', id, t: 0, qid: ++this.qidSeq });
    this.players[b.owner].researching.add(id);
    return { ok: true };
  }

  cmdCancel(b, idx) {
    const it = b.queue[idx];
    if (!it) return;
    const p = this.players[b.owner];
    b.queue.splice(idx, 1);
    if (it.kind === 'unit') this.refund(b.owner, it.cost || UNITS[p.lineTier[it.line]].cost);
    else { this.refund(b.owner, TECHS[it.id].cost); p.researching.delete(it.id); }
  }

  cmdRally(b, x, y, target = null) {
    if (!b.alive) return;
    b.rally = { x, y, target: target && target !== b ? target : null };
  }

  cmdGarrison(units, b) {
    for (const u of units) if (this.canGarrison(u, b)) u.command({ type: 'garrison', target: b });
  }
  cmdUngarrison(b) { if (b.garrisoned.length) this.ungarrison(b); }

  cmdDelete(e) {
    if (!e || !e.alive) return;
    if (e.kind === 'unit') this.killUnit(e, null, -1);
    else if (e.kind === 'building') {
      if (!e.complete) this.refund(e.owner, e.def.cost, 1 - e.progress);
      this.destroyBuilding(e, null, -1, !e.complete);
    }
  }

  cmdBell(pi, on) {
    const p = this.players[pi];
    if (on) {
      p.bell = true;
      const cap = new Map();
      const shelters = p.buildings.filter((b) => b.alive && b.complete && b.def.garrison > 0);
      for (const u of p.units) {
        if (!u.alive || !u.isVillager || u.garrisonedIn) continue;
        let best = null, bd = 30 * 30;
        for (const b of shelters) {
          const used = (cap.get(b) || 0) + b.garrisoned.length;
          if (used >= b.def.garrison) continue;
          const d = (b.x - u.x) ** 2 + (b.y - u.y) ** 2;
          if (d < bd) { bd = d; best = b; }
        }
        if (best) {
          cap.set(best, (cap.get(best) || 0) + 1);
          u.bellResume = u.order && u.order.type !== 'garrison' ? (u.order.type === 'return' && u.order.resume ? u.order.resume : u.order) : null;
          u.command({ type: 'garrison', target: best, bell: true });
        }
      }
      this.emit({ type: 'bell', player: pi, on: true });
    } else {
      p.bell = false;
      for (const u of p.units) {
        if (!u.alive || !u.isVillager || u.garrisonedIn || !u.order || u.order.type !== 'garrison' || !u.order.bell) continue;
        const r = u.bellResume; u.bellResume = null;
        u.setOrder(r && (r.type !== 'gather' || (r.target && r.target.alive)) ? r : null);
      }
      for (const b of p.buildings) {
        if (!b.garrisoned.length) continue;
        const vs = b.garrisoned.filter((u) => u.isVillager);
        if (vs.length) this.ungarrison(b, vs);
      }
      this.emit({ type: 'bell', player: pi, on: false });
    }
  }

  cmdMarket(pi, action, res) {
    const p = this.players[pi];
    if (!p.hasBuilding('market')) return { ok: false, reason: 'Requires a Market' };
    const price = p.market[res];
    if (action === 'buy') {
      const cost = Math.round(price);
      if (p.res.gold < cost) return { ok: false, reason: 'Not enough gold' };
      p.res.gold -= cost; p.res[res] += 100;
      p.market[res] = Math.min(400, price + 6);
    } else {
      if (p.res[res] < 100) return { ok: false, reason: `Not enough ${res}` };
      p.res[res] -= 100; p.res.gold += Math.round(price * 0.7);
      p.market[res] = Math.max(25, price - 6);
    }
    return { ok: true };
  }

  cmdResign(pi) { this.defeat(this.players[pi], true); this.checkVictory(); }

  spawnTrained(b, def) {
    const p = this.players[b.owner];
    const r = b.rally;
    const pos = this.spawnPoint(b, 0, r ? r.x : undefined, r ? r.y : undefined);
    const u = this.addUnit(def, b.owner, pos.x, pos.y);
    p.stats.unitsTrained++;
    if (r) {
      const t = r.target;
      let o = null;
      if (t && t.alive) o = this.smartOrderFor(u, t);
      if (o && o.type !== 'attack') u.command(o);
      else u.command({ type: 'move', x: r.x, y: r.y });
    }
    this.emit({ type: 'trained', unit: u, player: b.owner, building: b });
    return u;
  }
}
