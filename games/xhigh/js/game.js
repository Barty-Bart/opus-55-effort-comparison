// Game state, players, combat resolution, queries and player commands.
import {
  UNITS, BUILDINGS, TECHS, LINES, LINE_OF_TYPE, LINE_AGE, AGE_BUILDINGS, MAX_POP, PLAYER_COLORS, GAIA_COLOR,
  DIFFICULTY, WONDER_TIME, AGE_NAMES,
} from './config.js';
import { RNG, distToRect, clamp, TAU } from './util.js';
import { generateMap } from './map.js';
import { Pathfinder } from './pathfinding.js';
import { Unit, Building, Resource } from './entities.js';
import { AIController } from './ai.js';

// Tech chain prerequisites derived from building command lists (e.g. bodkin requires fletching).
export const TECH_PREREQ = {};
for (const b of Object.values(BUILDINGS)) {
  for (const c of b.cmds || []) {
    if (c.techs) for (let i = 1; i < c.techs.length; i++) TECH_PREREQ[c.techs[i]] = c.techs[i - 1];
  }
}

const BUILDING_CLASSES = ['building'];
const WALL_CLASSES = ['building', 'wall'];
const NON_ESSENTIAL = new Set(['farm', 'house', 'palisade', 'stonewall']);

export class Player {
  constructor(id, name, color, opts = {}) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.isAI = !!opts.isAI;
    this.isGaia = !!opts.isGaia;
    this.isHuman = !!opts.isHuman;
    this.res = { food: 0, wood: 0, gold: 0, stone: 0 };
    this.age = 0;
    this.techs = new Set();
    this.researching = new Set();
    this.ageResearching = false;
    this.lineTier = {};
    for (const l of Object.keys(LINES)) this.lineTier[l] = 0;
    this.mods = {
      gather: {}, atk: {}, arm: {}, range: { archer: 0 }, farmFood: 175, carry: 0,
      villSpeed: 1, villHp: 0, villArm: [0, 0], bldAtk: 0, bldRange: 0,
    };
    this.statsVer = 0;
    this.pop = 0;
    this.popCap = 0;
    this.defeated = false;
    this.gatherBonus = 1;
    this.trainMult = 1;
    this.bellRung = false;
    this.start = null;
    this.stats = {
      unitsKilled: 0, unitsLost: 0, buildingsRazed: 0, buildingsLost: 0, conversions: 0,
      gathered: { food: 0, wood: 0, gold: 0, stone: 0 },
      villagersTrained: 0, militaryTrained: 0, techs: 0, ageTimes: [0, null, null, null],
    };
  }
  canAfford(cost) {
    for (const k in cost) if ((this.res[k] || 0) < cost[k]) return false;
    return true;
  }
  pay(cost) { for (const k in cost) this.res[k] -= cost[k]; }
  refund(cost) { for (const k in cost) this.res[k] += cost[k]; }
}

export class Game {
  constructor(settings) {
    this.settings = settings;
    this.seed = settings.seed >>> 0;
    this.rng = new RNG(this.seed * 31 + 7);
    this.time = 0;
    this.units = [];
    this.buildings = [];
    this.resources = [];
    this.projectiles = [];
    this.listeners = {};
    this.selection = [];
    this.over = false;
    this.won = false;
    this.dirty = false;
    this.market = { food: 100, wood: 100, stone: 130 };
    this.pathBudget = 0;
    this.slowT = 0; this.secT = 0; this.histT = 0;
    this.history = [];
    this.lastAlert = { t: -99, x: 0, y: 0 };
    this.wonderTime = WONDER_TIME;
    this.ais = [];
    this.humanId = 1;
    this.spectate = !!settings.spectate;
  }

  // ------------------------------------------------------------------ events
  on(ev, fn) { (this.listeners[ev] || (this.listeners[ev] = [])).push(fn); }
  emit(ev, data) { const l = this.listeners[ev]; if (l) for (const fn of l) fn(data); }
  notifyPlayer(p, text, type = 'info', extra = {}) {
    if (p && p.id === this.humanId) this.emit('notify', { text, type, ...extra });
  }

  // ------------------------------------------------------------------ setup
  init() {
    const s = this.settings;
    const N = s.mapSize;
    const numPlayers = 1 + s.opponents;
    const gen = generateMap({ N, numPlayers, seed: this.seed, mapType: s.mapType });
    this.map = gen.map;
    this.pf = new Pathfinder(this.map);
    this.hashC = 3;
    this.hashG = Math.ceil(N / this.hashC);
    this.hash = Array.from({ length: this.hashG * this.hashG }, () => []);

    // players
    this.players = [new Player(0, 'Gaia', GAIA_COLOR, { isGaia: true })];
    const humanColor = s.color ?? 0;
    const used = new Set([humanColor]);
    const human = new Player(1, s.playerName || 'You', PLAYER_COLORS[humanColor], { isHuman: !this.spectate, isAI: this.spectate });
    human.colorIdx = humanColor;
    this.players.push(human);
    const aiNames = ['Charlemagne', 'Saladin', 'Genghis Khan', 'Joan of Arc', 'Barbarossa', 'William Wallace'];
    const rng = this.rng;
    const shuffledNames = rng.shuffle(aiNames.slice());
    for (let i = 0; i < s.opponents; i++) {
      let ci = [1, 2, 3, 4, 5, 6, 7, 0].find((c) => !used.has(c));
      used.add(ci);
      const p = new Player(2 + i, shuffledNames[i], PLAYER_COLORS[ci], { isAI: true });
      p.colorIdx = ci;
      this.players.push(p);
    }
    const startRes = s.startRes === 'high' ? [1000, 1000, 1000, 1000] : s.startRes === 'medium' ? [500, 500, 500, 500] : [200, 200, 100, 200];
    for (const p of this.players) {
      if (p.isGaia) continue;
      p.res = { food: startRes[0], wood: startRes[1], gold: startRes[2], stone: startRes[3] };
    }
    const diff = DIFFICULTY[s.difficulty] || DIFFICULTY.standard;
    for (const p of this.players) {
      if (p.isAI && !p.isGaia) { p.gatherBonus = diff.gatherMult; p.trainMult = diff.trainMult; }
    }

    // vision
    this.visible = new Uint8Array(N * N);
    this.explored = new Uint8Array(N * N);

    // resources & animals
    for (const sp of gen.specs) {
      if (sp.kind === 'sheep' || sp.kind === 'deer') {
        const u = this.spawnUnit(sp.kind, sp.owner || 0, sp.x, sp.y);
        u.anchorX = sp.x; u.anchorY = sp.y;
      } else {
        const r = new Resource(this, sp.kind, sp.x, sp.y, sp.amount, { variant: sp.variant, pine: sp.pine });
        this.resources.push(r);
      }
    }
    // starting towns
    gen.starts.forEach((st, i) => {
      const p = this.players[i + 1];
      p.start = { x: st.x, y: st.y };
      // clear any object in the way (shouldn't be any)
      this.map.clearArea(st.x - 2, st.y - 2, 4, 4);
      const tc = new Building(this, 'towncenter', p.id, st.x - 2, st.y - 2, true);
      this.buildings.push(tc);
      const spots = [[-1, 2.6], [0.2, 2.8], [1.4, 2.6]];
      for (const [dx, dy] of spots) this.spawnUnit('villager', p.id, st.x + dx, st.y + dy);
      const sc = tc.spawnPoint(st.x + 5, st.y + 5);
      this.spawnUnit('scout', p.id, sc.x, sc.y);
    });
    this.updatePop();
    for (const p of this.players) if (p.isAI && !p.isGaia) this.ais.push(new AIController(this, p, s.difficulty));
    this.updateVisibility();
  }

  lineAge(line) { return LINE_AGE[line] ?? 0; }
  isEnemy(a, b) { return a !== b && a !== 0 && b !== 0; }
  get human() { return this.players[this.humanId]; }

  // ------------------------------------------------------------------ entities
  spawnUnit(type, owner, x, y) {
    const u = new Unit(this, type, owner, x, y);
    this.units.push(u);
    if (!u.animal) this.players[owner].pop++;
    return u;
  }

  canPlaceBuilding(p, type, tx, ty) {
    const def = BUILDINGS[type];
    if (!this.map.canPlace(tx, ty, def.size, !!def.walkable)) return false;
    if (p.isHuman && this.settings.reveal !== 'all') {
      const N = this.map.N;
      for (let j = ty; j < ty + def.size; j++) for (let i = tx; i < tx + def.size; i++) if (!this.explored[j * N + i]) return false;
    }
    return true;
  }

  buildingRequirement(p, type) {
    const def = BUILDINGS[type];
    if (p.age < def.age) return `Requires ${AGE_NAMES[def.age]}`;
    if (def.requires && !this.buildings.some((b) => b.owner === p.id && b.type === def.requires && b.complete && !b.dead)) {
      return `Requires a ${BUILDINGS[def.requires].name}`;
    }
    if (type === 'wonder' && this.buildings.some((b) => b.owner === p.id && b.type === 'wonder' && !b.dead)) return 'Only one Wonder allowed';
    return null;
  }

  placeFoundation(p, type, tx, ty, silent = false) {
    const def = BUILDINGS[type];
    const req = this.buildingRequirement(p, type);
    if (req) { if (!silent) this.notifyPlayer(p, req, 'warn'); return null; }
    if (!this.canPlaceBuilding(p, type, tx, ty)) { if (!silent) this.notifyPlayer(p, 'Cannot build there', 'warn'); return null; }
    if (!p.canAfford(def.cost)) { if (!silent) this.notifyPlayer(p, 'Not enough resources', 'warn', { cost: def.cost }); return null; }
    p.pay(def.cost);
    const b = new Building(this, type, p.id, tx, ty, false);
    this.buildings.push(b);
    if (!def.walkable) {
      for (const u of this.units) {
        if (u.dead || u.garrisonedIn) continue;
        if (u.x >= tx && u.x < tx + def.size && u.y >= ty && u.y < ty + def.size) {
          const f = this.pf.nearestFree(u.x, u.y, 8);
          if (f) { u.x = f.x + 0.5; u.y = f.y + 0.5; u.path = null; }
        }
      }
    }
    this.emit('placed', { building: b });
    return b;
  }

  // ------------------------------------------------------------------ queries
  usePathBudget() {
    if (this.pathBudget <= 0) return false;
    this.pathBudget--;
    return true;
  }

  buildHash() {
    const C = this.hashC, G = this.hashG;
    for (const a of this.hash) a.length = 0;
    for (const u of this.units) {
      if (u.dead || u.garrisonedIn) continue;
      const cx = clamp(Math.floor(u.x / C), 0, G - 1), cy = clamp(Math.floor(u.y / C), 0, G - 1);
      this.hash[cy * G + cx].push(u);
    }
  }

  unitsInRadius(x, y, r, out = []) {
    const C = this.hashC, G = this.hashG;
    const x0 = clamp(Math.floor((x - r) / C), 0, G - 1), x1 = clamp(Math.floor((x + r) / C), 0, G - 1);
    const y0 = clamp(Math.floor((y - r) / C), 0, G - 1), y1 = clamp(Math.floor((y + r) / C), 0, G - 1);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const cell = this.hash[cy * G + cx];
      for (let i = 0; i < cell.length; i++) {
        const u = cell[i];
        if (u.dead) continue;
        const dx = u.x - x, dy = u.y - y;
        const rr = r + u.radius;
        if (dx * dx + dy * dy <= rr * rr) out.push(u);
      }
    }
    return out;
  }

  findTarget(unit, radius, opts = {}) {
    const owner = unit.owner;
    let best = null, bs = 1e9;
    if (!unit.def.onlyBuildings) {
      const list = this.unitsInRadius(unit.x, unit.y, radius);
      for (const e of list) {
        if (e.animal || !this.isEnemy(owner, e.owner) || e.garrisonedIn) continue;
        if (unit.skip && unit.skipping(e)) continue;
        const d = Math.hypot(e.x - unit.x, e.y - unit.y);
        if (unit.def.minRange && d < unit.def.minRange + 0.5) continue;
        let s = d;
        if (e.isVillager) s += 1.5;
        if (e.def.tc === 'siege') s += unit.range > 0 ? 4 : -1;
        if (e.def.tc === 'monk') s -= 1;
        if (s < bs) { bs = s; best = e; }
      }
      if (best) return best;
    }
    if (opts.buildings) {
      for (const b of this.buildings) {
        if (b.dead || !this.isEnemy(owner, b.owner)) continue;
        if (unit.skip && unit.skipping(b)) continue;
        const d = distToRect(unit.x, unit.y, b.tx, b.ty, b.tx + b.size, b.ty + b.size);
        if (d > radius) continue;
        let s = d + (b.def.wall ? 6 : 0) + (b.type === 'farm' ? 3 : 0);
        if (unit.def.onlyBuildings && b.def.attack) s -= 2;
        if (s < bs) { bs = s; best = b; }
      }
    }
    return best;
  }

  findTargetForBuilding(b, range, random = false) {
    const cands = this.unitsInRadius(b.x, b.y, range + b.size / 2 + 1);
    let best = null, bs = 1e9;
    const pool = [];
    for (const e of cands) {
      if (e.animal || !this.isEnemy(b.owner, e.owner) || e.garrisonedIn) continue;
      const d = distToRect(e.x, e.y, b.tx, b.ty, b.tx + b.size, b.ty + b.size);
      if (d > range) continue;
      const s = d + (e.def.tc === 'siege' && e.def.onlyBuildings ? 3 : 0);
      pool.push(e);
      if (s < bs) { bs = s; best = e; }
    }
    if (random && pool.length) return pool[Math.floor(Math.random() * pool.length)];
    return best;
  }

  findHealTarget(monk, radius) {
    let best = null, bd = 1e9;
    for (const e of this.unitsInRadius(monk.x, monk.y, radius)) {
      if (e.owner !== monk.owner || e === monk || e.animal || e.hp >= e.maxHp || e.def.tc === 'siege') continue;
      const d = Math.hypot(e.x - monk.x, e.y - monk.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  resourceAccessible(r) {
    const map = this.map;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((dx || dy) && map.passable(r.tx + dx, r.ty + dy)) return true;
    }
    return false;
  }

  // kind: wood | gold | stone | forage | hunt | sheep | farm
  findResource(owner, kind, x, y, maxR = 10, unit = null) {
    if (kind === 'farm') {
      let best = null, bd = 1e9;
      for (const b of this.buildings) {
        if (b.dead || b.type !== 'farm' || b.owner !== owner || !b.complete) continue;
        if (b.unreach && b.unreach[owner] > this.time) continue;
        if (b.farmer && b.farmer !== unit && !b.farmer.dead && b.farmer.order && b.farmer.order.target === b) continue;
        const d = Math.hypot(b.x - x, b.y - y);
        if (d < bd && d < maxR * 2) { bd = d; best = b; }
      }
      return best;
    }
    if (kind === 'hunt' || kind === 'sheep') {
      let best = null, bd = 1e9;
      for (const r of this.resources) {
        if (r.dead || r.type !== 'carcass' || r.amount <= 0) continue;
        if (r.unreach && r.unreach[owner] > this.time) continue;
        const d = Math.hypot(r.x - x, r.y - y);
        if (d < bd && d < maxR) { bd = d; best = r; }
      }
      if (best) return best;
      for (const u of this.units) {
        if (u.dead || !u.animal) continue;
        if (u.animal === 'herd' && u.owner !== owner && u.owner !== 0) continue;
        if (u.unreach && u.unreach[owner] > this.time) continue;
        const d = Math.hypot(u.x - x, u.y - y) + (u.animal === 'hunt' && kind === 'sheep' ? 3 : 0);
        if (d < bd && d < maxR) { bd = d; best = u; }
      }
      return best;
    }
    const type = kind === 'wood' ? 'tree' : kind === 'forage' ? 'berry' : kind;
    const map = this.map, N = map.N;
    const cx = Math.floor(x), cy = Math.floor(y);
    let best = null, bd = 1e9, foundRing = -1;
    for (let r = 0; r <= maxR; r++) {
      if (foundRing >= 0 && r > foundRing + 1) break;
      for (let j = cy - r; j <= cy + r; j++) {
        if (j < 0 || j >= N) continue;
        const step = (j === cy - r || j === cy + r) ? 1 : 2 * r;
        for (let i = cx - r; i <= cx + r; i += step || 1) {
          if (i < 0 || i >= N) continue;
          const o = map.obj[j * N + i];
          if (!o || o.kind !== 'resource' || o.type !== type || o.dead || o.amount <= 0) continue;
          if (o.unreach && o.unreach[owner] > this.time) continue;
          if (!this.resourceAccessible(o)) continue;
          const d = Math.hypot(o.x - x, o.y - y);
          if (d < bd) { bd = d; best = o; if (foundRing < 0) foundRing = r; }
        }
      }
    }
    return best;
  }

  findDropSite(owner, resType, x, y) {
    let best = null, bd = 1e9;
    for (const b of this.buildings) {
      if (b.dead || b.owner !== owner || !b.complete || !b.def.drop || !b.def.drop.includes(resType)) continue;
      const d = distToRect(x, y, b.tx, b.ty, b.tx + b.size, b.ty + b.size);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  findFoundation(owner, x, y, r) {
    let best = null, bd = 1e9;
    for (const b of this.buildings) {
      if (b.dead || b.owner !== owner || b.complete) continue;
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < r && d < bd) { bd = d; best = b; }
    }
    return best;
  }

  // A unit sealed into a tiny pocket (e.g. by a new building next to trees) is moved to open ground.
  rescueUnit(u) {
    const map = this.map, N = map.N;
    const regionSize = (sx, sy, cap) => {
      const seen = new Set([sy * N + sx]);
      const q = [sy * N + sx];
      while (q.length && seen.size < cap) {
        const k = q.pop(), x = k % N, y = (k / N) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy, nk = ny * N + nx;
          if (map.passable(nx, ny) && !seen.has(nk)) { seen.add(nk); q.push(nk); }
        }
      }
      return seen.size;
    };
    const cx = Math.floor(u.x), cy = Math.floor(u.y);
    if (map.passable(cx, cy) && regionSize(cx, cy, 40) >= 40) return false;
    for (let r = 1; r <= 12; r++) {
      let best = null, bd = 1e9;
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
        const x = cx + i, y = cy + j;
        if (!map.passable(x, y)) continue;
        const d = i * i + j * j;
        if (d < bd && regionSize(x, y, 40) >= 40) { bd = d; best = { x, y }; }
      }
      if (best) { u.x = best.x + 0.5; u.y = best.y + 0.5; u.path = null; return true; }
    }
    return false;
  }

  findBlockingBuilding(unit, target) {
    let best = null, bd = 1e9;
    for (const b of this.buildings) {
      if (b.dead || !this.isEnemy(unit.owner, b.owner)) continue;
      const d = distToRect(unit.x, unit.y, b.tx, b.ty, b.tx + b.size, b.ty + b.size);
      if (d > 5) continue;
      const s = d - (b.def.wall ? 1 : 0);
      if (s < bd) { bd = s; best = b; }
    }
    return best;
  }

  // ------------------------------------------------------------------ combat
  dealDamage(target, attacker, atk, atkType, bonus, mult = 1) {
    if (!target || target.dead) return 0;
    let armM, armP, classes;
    if (target.kind === 'building') {
      armM = target.def.armor[0]; armP = target.def.armor[1];
      classes = target.def.wall ? WALL_CLASSES : BUILDING_CLASSES;
      if (!target.complete) { armM = 0; armP = Math.min(armP, 2); }
    } else {
      armM = target.armorM; armP = target.armorP; classes = target.def.classes;
    }
    let dmg = atkType === 'pierce' ? Math.max(0, atk - armP) : Math.max(0, atk - armM);
    if (bonus) for (const c in bonus) if (classes.includes(c)) dmg += bonus[c];
    dmg = Math.max(1, dmg) * mult;
    target.hp -= dmg;
    target.lastHitT = this.time;
    if (attacker && !attacker.dead) {
      this.onAttacked(target, attacker);
      if (target.kind === 'unit') {
        target.onDamaged(attacker);
        if (!target.animal) this.alertAllies(target, attacker);
      }
    }
    if (target.hp <= 0) {
      if (target.kind === 'unit') this.killUnit(target, attacker);
      else this.destroyBuilding(target, attacker);
    }
    return dmg;
  }

  alertAllies(victim, attacker) {
    if (attacker.kind !== 'unit' || attacker.animal) return;
    if ((victim.alertT || 0) > this.time) return;
    victim.alertT = this.time + 1;
    for (const u of this.unitsInRadius(victim.x, victim.y, 6)) {
      if (u.owner !== victim.owner || u.order || !u.isMilitary || u.stance === 'passive') continue;
      if (!u.canAttack(attacker)) continue;
      u.order = { type: 'attack', target: attacker, auto: true };
      u.path = null; u.navKey = null;
    }
  }

  onAttacked(target, attacker) {
    const owner = target.owner;
    if (owner === 0) return;
    if (!this.isEnemy(owner, attacker.owner)) return;
    const p = this.players[owner];
    p.lastAttacked = { t: this.time, x: target.x, y: target.y, attacker };
    if (target.isVillager) p.lastVillHit = this.time;
    if (owner === this.humanId) {
      const la = this.lastAlert;
      if (this.time - la.t > 20 || Math.hypot(la.x - target.x, la.y - target.y) > 15 && this.time - la.t > 6) {
        this.lastAlert = { t: this.time, x: target.x, y: target.y };
        this.emit('underAttack', { x: target.x, y: target.y, target });
      }
    }
  }

  fireProjectile(src, target, opts) {
    const kind = opts.kind || 'arrow';
    let sz;
    if (src.kind === 'building') sz = (src.def.height || 60) * 0.72;
    else if (src.def.classes.includes('cavalry')) sz = 24;
    else if (src.def.tc === 'siege') sz = kind === 'boulder' ? 60 : 22;
    else sz = 17;
    let sx = src.x, sy = src.y;
    if (src.kind === 'building') { sx += (Math.random() - 0.5) * src.size * 0.6; sy += (Math.random() - 0.5) * src.size * 0.6; }
    let tx = target.x, ty = target.y, tz = 10;
    if (target.kind === 'building') {
      const p = { x: clamp(sx, target.tx + 0.3, target.tx + target.size - 0.3), y: clamp(sy, target.ty + 0.3, target.ty + target.size - 0.3) };
      tx = p.x + (Math.random() - 0.5) * 0.6; ty = p.y + (Math.random() - 0.5) * 0.6; tz = 22;
    }
    const hit = target.kind === 'building' || Math.random() < (opts.accuracy ?? 1);
    if (!hit) {
      const a = Math.random() * TAU, r = 0.6 + Math.random() * 1.1;
      tx += Math.cos(a) * r; ty += Math.sin(a) * r; tz = 0;
    }
    const dist = Math.hypot(tx - sx, ty - sy);
    const speed = kind === 'stone' ? 6.5 : kind === 'boulder' ? 7 : kind === 'javelin' ? 7.5 : 10;
    const dur = Math.max(0.12, dist / speed);
    const arcK = kind === 'arrow' ? 4 : kind === 'javelin' ? 5 : kind === 'boulder' ? 9 : 10;
    this.projectiles.push({
      kind, sx, sy, sz, x: sx, y: sy, z: sz, px: sx, py: sy, pz: sz, tx, ty, tz,
      t: -(opts.delay || 0), dur, target: hit ? target : null,
      atk: opts.atk, atkType: opts.atkType || 'pierce', bonus: opts.bonus || null, splash: opts.splash || 0,
      owner: src.owner, attacker: src, arc: dist * arcK, fired: !opts.delay,
    });
    if (!opts.delay) this.emit('shoot', { src, kind });
  }

  updateProjectiles(dt) {
    const list = this.projectiles;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (p.t < 0) {
        p.t += dt;
        if (p.t >= 0 && !p.fired) { p.fired = true; this.emit('shoot', { src: p.attacker, kind: p.kind }); }
        list[w++] = p; continue;
      }
      const tg = p.target;
      if (tg && !tg.dead && tg.kind === 'unit' && !tg.garrisonedIn) { p.tx = tg.x; p.ty = tg.y; }
      p.t += dt / p.dur;
      const t = Math.min(1, p.t);
      p.px = p.x; p.py = p.y; p.pz = p.z;
      p.x = p.sx + (p.tx - p.sx) * t;
      p.y = p.sy + (p.ty - p.sy) * t;
      p.z = p.sz + (p.tz - p.sz) * t + p.arc * 4 * t * (1 - t);
      if (p.t >= 1) { this.impact(p); continue; }
      list[w++] = p;
    }
    list.length = w;
  }

  impact(p) {
    const attacker = p.attacker && !p.attacker.dead ? p.attacker : null;
    if (p.splash) {
      const hits = this.unitsInRadius(p.tx, p.ty, p.splash);
      for (const u of hits) {
        if (u.owner === p.owner || u.garrisonedIn || u.animal) continue;
        const d = Math.hypot(u.x - p.tx, u.y - p.ty);
        const f = d < p.splash * 0.5 ? 1 : 0.5;
        this.dealDamage(u, attacker, p.atk * f, p.atkType, p.bonus);
      }
      if (p.target && p.target.kind === 'building' && !p.target.dead) this.dealDamage(p.target, attacker, p.atk, p.atkType, p.bonus);
      this.emit('impact', { kind: p.kind, x: p.tx, y: p.ty });
      return;
    }
    if (p.target && !p.target.dead && !(p.target.kind === 'unit' && p.target.garrisonedIn)) {
      this.dealDamage(p.target, attacker, p.atk, p.atkType, p.bonus);
      if (p.kind === 'boulder') this.emit('impact', { kind: p.kind, x: p.tx, y: p.ty });
      else this.emit('arrowHit', { x: p.tx, y: p.ty, target: p.target });
    } else {
      this.emit('arrowMiss', { x: p.tx, y: p.ty, kind: p.kind, dx: p.tx - p.sx, dy: p.ty - p.sy });
    }
  }

  killUnit(u, killer) {
    if (u.dead) return;
    u.dead = true;
    this.dirty = true;
    if (u.garrisonedIn) {
      const g = u.garrisonedIn.garrison, i = g.indexOf(u);
      if (i >= 0) g.splice(i, 1);
      u.garrisonedIn = null;
    }
    if (!u.animal) {
      const p = this.players[u.owner];
      p.pop--;
      p.stats.unitsLost++;
      if (killer && killer.owner !== u.owner && killer.owner) this.players[killer.owner].stats.unitsKilled++;
    } else {
      const c = new Resource(this, 'carcass', u.x, u.y, u.def.food, { animal: u.type, facing: u.facing });
      this.resources.push(c);
      u.carcass = c;
    }
    this.emit('unitDied', { unit: u, killer });
  }

  destroyBuilding(b, killer) {
    if (b.dead) return;
    b.dead = true;
    this.dirty = true;
    if (!b.def.walkable) this.map.clearArea(b.tx, b.ty, b.size, b.size, b);
    else this.map.clearArea(b.tx, b.ty, b.size, b.size, b);
    // restore any resource-free tiles; eject garrison
    if (b.garrison.length) {
      const units = b.ungarrison();
      for (const u of units) u.hp = Math.max(1, u.hp - 5);
    }
    const p = this.players[b.owner];
    for (const it of b.queue) {
      if (it.kind === 'tech') { p.researching.delete(it.id); if (TECHS[it.id].ageUp) p.ageResearching = false; }
    }
    b.queue.length = 0;
    if (b.farmer && b.farmer.order && b.farmer.order.target === b) b.farmer.finishOrder();
    if (killer && killer.owner && killer.owner !== b.owner) {
      p.stats.buildingsLost++;
      this.players[killer.owner].stats.buildingsRazed++;
    }
    this.updatePopCap(p);
    this.emit('buildingDestroyed', { building: b, killer });
  }

  convertUnit(u, newOwner, monk) {
    const oldP = this.players[u.owner], newP = this.players[newOwner];
    oldP.pop--; newP.pop++;
    oldP.stats.unitsLost++;
    newP.stats.conversions++;
    u.owner = newOwner;
    u.setOrder(null);
    u.statsVer = -1;
    u.selected = false;
    const i = this.selection.indexOf(u);
    if (i >= 0 && newOwner !== this.humanId) this.selection.splice(i, 1);
    this.emit('converted', { unit: u, monk, from: oldP, to: newP });
  }

  farmDepleted(f) {
    const p = this.players[f.owner];
    if (p.res.wood >= 60 && !f.dead) {
      p.res.wood -= 60;
      f.food = p.mods.farmFood;
      f.reseeds = (f.reseeds || 0) + 1;
      return;
    }
    const farmer = f.farmer;
    this.destroyBuilding(f, null);
    if (farmer && !farmer.dead) this.notifyPlayer(p, 'A farm has been exhausted', 'info');
  }

  onResourceDepleted(r) { this.dirty = true; this.emit('resourceDepleted', { resource: r }); }

  onBuildingComplete(b, initial) {
    const p = this.players[b.owner];
    this.updatePopCap(p);
    if (!initial) {
      this.emit('built', { building: b });
      if (b.type === 'wonder') {
        for (const q of this.players) if (!q.isGaia) this.notifyPlayer(q, `${p.name} has completed a Wonder! It must be destroyed within ${Math.round(this.wonderTime / 60)} minutes.`, 'alert');
      }
    }
  }

  onHoused(p, b) {
    if (p.id === this.humanId && b.queue[0] && b.queue[0].kind === 'unit') this.emit('housed', {});
  }

  updatePopCap(p) {
    let cap = 0;
    for (const b of this.buildings) if (!b.dead && b.owner === p.id && b.complete && b.def.pop) cap += b.def.pop;
    p.popCap = Math.min(MAX_POP, cap);
  }
  updatePop() {
    for (const p of this.players) { p.pop = 0; }
    for (const u of this.units) if (!u.dead && !u.animal) this.players[u.owner].pop++;
    for (const p of this.players) if (!p.isGaia) this.updatePopCap(p);
  }

  // ------------------------------------------------------------------ technology
  ageReqCount(p) {
    if (p.age >= 3) return 0;
    const list = AGE_BUILDINGS[p.age];
    const have = new Set();
    let castle = 0;
    for (const b of this.buildings) {
      if (b.dead || b.owner !== p.id || !b.complete) continue;
      if (list.includes(b.type)) have.add(b.type);
      if (b.type === 'castle' && p.age === 2) castle = 1;
    }
    return have.size + castle;
  }
  techAvailable(p, id) {
    const t = TECHS[id];
    if (!t || p.techs.has(id) || p.researching.has(id)) return false;
    if (t.ageUp) return p.age === t.age && !p.ageResearching;
    if (p.age < t.age) return false;
    const pre = TECH_PREREQ[id];
    if (pre && !p.techs.has(pre)) return false;
    return true;
  }
  techBlocker(p, id) {
    const t = TECHS[id];
    if (t.ageUp) {
      if (p.age !== t.age) return 'Not available';
      if (p.ageResearching) return 'Already advancing';
      if (this.ageReqCount(p) < 2) return `Requires 2 ${AGE_NAMES[p.age]} buildings (${AGE_BUILDINGS[p.age].map((b) => BUILDINGS[b].name).join(', ')})`;
      return null;
    }
    if (p.age < t.age) return `Requires ${AGE_NAMES[t.age]}`;
    const pre = TECH_PREREQ[id];
    if (pre && !p.techs.has(pre)) return `Requires ${TECHS[pre].name}`;
    return null;
  }

  completeTech(p, id, building) {
    const t = TECHS[id];
    p.researching.delete(id);
    p.techs.add(id);
    p.stats.techs++;
    if (t.ageUp) {
      p.age = t.ageUp;
      p.ageResearching = false;
      p.stats.ageTimes[t.ageUp] = this.time;
      this.emit('ageUp', { player: p, age: p.age });
    }
    if (t.fx) this.applyTechFx(p, t.fx);
    p.statsVer++;
    this.emit('techDone', { player: p, id, building });
  }

  applyTechFx(p, fx) {
    const m = p.mods;
    if (fx.gather) for (const k in fx.gather) m.gather[k] = (m.gather[k] || 1) * fx.gather[k];
    if (fx.atk) for (const k in fx.atk) m.atk[k] = (m.atk[k] || 0) + fx.atk[k];
    if (fx.arm) for (const k in fx.arm) { const a = m.arm[k] || [0, 0]; m.arm[k] = [a[0] + fx.arm[k][0], a[1] + fx.arm[k][1]]; }
    if (fx.range) for (const k in fx.range) m.range[k] = (m.range[k] || 0) + fx.range[k];
    if (fx.farm) {
      m.farmFood += fx.farm;
      for (const b of this.buildings) if (!b.dead && b.owner === p.id && b.type === 'farm' && b.complete) b.food += fx.farm;
    }
    if (fx.carry) m.carry += fx.carry;
    if (fx.villSpeed) m.villSpeed *= fx.villSpeed;
    if (fx.villHp) m.villHp += fx.villHp;
    if (fx.villArm) m.villArm = [m.villArm[0] + fx.villArm[0], m.villArm[1] + fx.villArm[1]];
    if (fx.bldAtk) m.bldAtk += fx.bldAtk;
    if (fx.bldRange) m.bldRange += fx.bldRange;
    if (fx.line) {
      const [line, tier] = fx.line;
      p.lineTier[line] = tier;
      const nt = LINES[line][tier];
      for (const u of this.units) {
        if (u.dead || u.owner !== p.id || LINE_OF_TYPE[u.type] !== line) continue;
        u.type = nt; u.def = UNITS[nt]; u.radius = u.def.radius;
      }
    }
  }

  // ------------------------------------------------------------------ commands
  formation(units, x, y) {
    const n = units.length;
    if (n <= 1) return [{ x, y }];
    const cols = Math.ceil(Math.sqrt(n));
    const sp = 0.75;
    const cx = units.reduce((s, u) => s + u.x, 0) / n, cy = units.reduce((s, u) => s + u.y, 0) / n;
    let fx = x - cx, fy = y - cy;
    const fl = Math.hypot(fx, fy) || 1; fx /= fl; fy /= fl;
    const rx = -fy, ry = fx;
    const slots = [];
    const rows = Math.ceil(n / cols);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (slots.length >= n) break;
      const ox = (c - (cols - 1) / 2) * sp, oy = -(r - (rows - 1) / 2) * sp;
      slots.push({ x: x + rx * ox + fx * oy, y: y + ry * ox + fy * oy });
    }
    // ranged units to the back, melee to the front
    const sorted = units.slice().sort((a, b) => (a.range > 0 ? 0 : 1) - (b.range > 0 ? 0 : 1) || (a.x * rx + a.y * ry) - (b.x * rx + b.y * ry));
    const out = new Map();
    const bySlot = slots.slice().sort((a, b) => ((a.x - x) * fx + (a.y - y) * fy) - ((b.x - x) * fx + (b.y - y) * fy));
    sorted.forEach((u, i) => {
      let s = bySlot[i];
      if (!this.map.passableF(s.x, s.y)) { const f = this.pf.nearestFree(s.x, s.y, 4); s = f ? { x: f.x + 0.5, y: f.y + 0.5 } : { x, y }; }
      out.set(u, s);
    });
    return units.map((u) => out.get(u));
  }

  cmdMove(units, x, y, queued = false) {
    units = units.filter((u) => u.kind === 'unit' && !u.dead && !u.garrisonedIn);
    if (!units.length) return;
    if (!this.map.passableF(x, y)) { const f = this.pf.nearestFree(x, y, 10); if (f) { x = f.x + 0.5; y = f.y + 0.5; } }
    const pts = this.formation(units, x, y);
    units.forEach((u, i) => u.setOrder({ type: 'move', x: pts[i].x, y: pts[i].y }, queued));
  }

  cmdAttackMove(units, x, y) {
    units = units.filter((u) => u.kind === 'unit' && !u.dead && !u.garrisonedIn && !u.isVillager);
    if (!units.length) return;
    const pts = this.formation(units, x, y);
    units.forEach((u, i) => u.setOrder({ type: 'attackMove', x: pts[i].x, y: pts[i].y }));
  }

  cmdStop(units) { for (const u of units) if (u.kind === 'unit') u.stop(); }

  // Context-sensitive right click.
  cmdSmart(units, x, y, target, queued = false) {
    const movers = [];
    for (const u of units) {
      if (u.kind !== 'unit' || u.dead || u.garrisonedIn) continue;
      if (target && !target.dead) {
        const o = this.smartOrderFor(u, target);
        if (o) { u.setOrder(o, queued); continue; }
      }
      movers.push(u);
    }
    if (movers.length) this.cmdMove(movers, x, y, queued);
  }

  smartOrderFor(u, t) {
    if (t.kind === 'unit' && t.animal) {
      if (u.isVillager) return { type: 'gather', target: t, kind: t.animal === 'herd' ? 'sheep' : 'hunt', phase: 'go' };
      if (t.animal === 'hunt' && u.isMilitary && u.def.atk > 0 && !u.def.onlyBuildings) return { type: 'attack', target: t, force: true };
      return null;
    }
    if ((t.kind === 'unit' || t.kind === 'building') && this.isEnemy(u.owner, t.owner)) {
      if (u.def.tc === 'monk') return t.kind === 'unit' ? { type: 'convert', target: t } : null;
      if (u.canAttack(t)) return { type: 'attack', target: t };
      return null;
    }
    if (t.kind === 'resource') {
      if (u.isVillager) return { type: 'gather', target: t, kind: t.gatherKind, phase: 'go' };
      return null;
    }
    if (t.kind === 'building' && t.owner === u.owner) {
      if (u.isVillager) {
        if (!t.complete || t.hp < t.maxHp) return { type: 'build', target: t };
        if (t.type === 'farm') return { type: 'gather', target: t, kind: 'farm', phase: 'go' };
        if (u.carry > 0 && t.def.drop && t.def.drop.includes(u.carryType)) {
          const o = u.order;
          const resume = o && o.type === 'gather' ? { kind: o.kind, lx: o.lx, ly: o.ly } : null;
          return { type: 'dropoff', target: t, resume };
        }
        if (t.def.garrison) return { type: 'garrison', target: t };
        return null;
      }
      if (t.def.garrison && t.complete && u.def.tc !== 'siege' && t.garrison.length < t.def.garrison) return { type: 'garrison', target: t };
      return null;
    }
    if (t.kind === 'unit' && t.owner === u.owner && u.def.tc === 'monk' && t.hp < t.maxHp && t !== u) return { type: 'heal', target: t };
    return null;
  }

  cmdBuild(units, type, tx, ty, queued = false) {
    const vills = units.filter((u) => u.kind === 'unit' && u.isVillager && !u.dead && !u.garrisonedIn);
    if (!vills.length) return null;
    const p = this.players[vills[0].owner];
    const b = this.placeFoundation(p, type, tx, ty);
    if (!b) return null;
    for (const u of vills) u.setOrder({ type: 'build', target: b }, queued);
    return b;
  }

  wallTiles(x0, y0, x1, y1) {
    const pts = [];
    let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, x = x0, y = y0, guard = 0;
    for (;;) {
      pts.push({ x, y });
      if ((x === x1 && y === y1) || guard++ > 200) break;
      const e2 = 2 * err;
      // 4-connected so walls have no diagonal gaps
      if (e2 >= dy && (e2 <= dx ? Math.abs(dx) >= Math.abs(dy) : true)) { err += dy; x += sx; }
      else if (e2 <= dx) { err += dx; y += sy; }
      else { err += dy; x += sx; }
    }
    return pts;
  }

  cmdBuildWall(units, type, x0, y0, x1, y1) {
    const vills = units.filter((u) => u.kind === 'unit' && u.isVillager && !u.dead && !u.garrisonedIn);
    if (!vills.length) return;
    const p = this.players[vills[0].owner];
    const req = this.buildingRequirement(p, type);
    if (req) { this.notifyPlayer(p, req, 'warn'); return; }
    const tiles = this.wallTiles(x0, y0, x1, y1);
    const placed = [];
    for (const t of tiles) {
      if (!this.canPlaceBuilding(p, type, t.x, t.y)) continue;
      if (!p.canAfford(BUILDINGS[type].cost)) { this.notifyPlayer(p, 'Not enough resources', 'warn', { cost: BUILDINGS[type].cost }); break; }
      const b = this.placeFoundation(p, type, t.x, t.y, true);
      if (b) placed.push(b);
    }
    if (!placed.length) return;
    // sort by distance to the villagers so they build progressively
    const cx = vills[0].x, cy = vills[0].y;
    placed.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
    for (const u of vills) {
      u.setOrder({ type: 'build', target: placed[0] });
      for (let i = 1; i < placed.length; i++) u.queue.push({ type: 'build', target: placed[i] });
    }
  }

  cmdDelete(ents) {
    for (const e of ents) {
      if (e.dead || e.owner !== this.humanId && !this.spectate) continue;
      if (e.kind === 'unit') this.killUnit(e, null);
      else if (e.kind === 'building') {
        if (!e.complete && e.progress === 0) this.players[e.owner].refund(e.def.cost);
        this.destroyBuilding(e, null);
      }
    }
  }

  ringBell(p) {
    const shelters = this.buildings.filter((b) => !b.dead && b.owner === p.id && b.complete && b.def.garrison);
    if (!shelters.length) return;
    const space = new Map(shelters.map((b) => [b, b.def.garrison - b.garrison.length]));
    for (const u of this.units) {
      if (u.dead || u.owner !== p.id || !u.isVillager || u.garrisonedIn) continue;
      let best = null, bd = 1e9;
      for (const b of shelters) {
        if (space.get(b) <= 0) continue;
        const d = Math.hypot(b.x - u.x, b.y - u.y);
        if (d < bd) { bd = d; best = b; }
      }
      if (!best || bd > 40) continue;
      space.set(best, space.get(best) - 1);
      const prev = u.order;
      u.setOrder({ type: 'garrison', target: best });
      u.bellOrder = prev && prev.type !== 'garrison' ? prev : null;
    }
    p.bellRung = true;
    this.notifyPlayer(p, 'Town bell rung! Villagers seek shelter.', 'alert');
    this.emit('bell', { player: p });
  }

  allClear(p) {
    for (const b of this.buildings) {
      if (b.dead || b.owner !== p.id || !b.garrison.length) continue;
      const vills = b.garrison.filter((u) => u.isVillager);
      if (!vills.length) continue;
      b.garrison = b.garrison.filter((u) => !u.isVillager);
      const keep = b.garrison;
      b.garrison = vills;
      b.ungarrison();
      b.garrison = keep;
    }
    for (const u of this.units) {
      if (u.dead || u.owner !== p.id || u.bellOrder === undefined) continue;
      if (u.order && u.order.type === 'garrison') { u.order = u.bellOrder; u.path = null; u.navKey = null; }
      u.bellOrder = undefined;
    }
    p.bellRung = false;
    this.notifyPlayer(p, 'All clear. Villagers return to work.', 'info');
  }

  tradePrice(res, action) {
    const base = this.market[res];
    return action === 'buy' ? Math.round(base * 1.3) : Math.round(base * 0.7);
  }
  trade(p, action, res) {
    const price = this.tradePrice(res, action);
    if (action === 'buy') {
      if (p.res.gold < price) { this.notifyPlayer(p, 'Not enough gold', 'warn'); return false; }
      p.res.gold -= price; p.res[res] += 100;
      this.market[res] = Math.min(9999, this.market[res] + 4);
    } else {
      if (p.res[res] < 100) { this.notifyPlayer(p, `Not enough ${res}`, 'warn'); return false; }
      p.res[res] -= 100; p.res.gold += price;
      this.market[res] = Math.max(20, this.market[res] - 4);
    }
    this.emit('trade', { player: p });
    return true;
  }

  // ------------------------------------------------------------------ vision
  updateVisibility() {
    const N = this.map.N, vis = this.visible, exp = this.explored;
    const h = this.humanId;
    if (this.settings.reveal === 'all' || this.spectate) { vis.fill(1); exp.fill(1); }
    else {
      vis.fill(0);
      for (const u of this.units) {
        if (u.dead || u.owner !== h || u.garrisonedIn) continue;
        this.stamp(u.x, u.y, u.los + 0.5);
      }
      for (const b of this.buildings) {
        if (b.dead || b.owner !== h) continue;
        this.stamp(b.x, b.y, (b.complete ? b.def.los : 2) + b.size / 2);
      }
      for (let k = 0; k < N * N; k++) if (vis[k]) exp[k] = 1;
    }
    for (const b of this.buildings) {
      if (b.dead || b.seenBy[h]) continue;
      if (b.owner === h) { b.seenBy[h] = true; continue; }
      for (let j = b.ty; j < b.ty + b.size && !b.seenBy[h]; j++) for (let i = b.tx; i < b.tx + b.size; i++) {
        if (vis[j * N + i]) { b.seenBy[h] = true; break; }
      }
    }
  }
  stamp(x, y, r) {
    const N = this.map.N, vis = this.visible;
    const cx = Math.floor(x), cy = Math.floor(y), R = Math.ceil(r), r2 = r * r;
    for (let dy = -R; dy <= R; dy++) {
      const ty = cy + dy;
      if (ty < 0 || ty >= N) continue;
      const w = Math.floor(Math.sqrt(Math.max(0, r2 - dy * dy)));
      const x0 = Math.max(0, cx - w), x1 = Math.min(N - 1, cx + w);
      const row = ty * N;
      for (let tx = x0; tx <= x1; tx++) vis[row + tx] = 1;
    }
  }
  tileVisible(x, y) {
    const N = this.map.N;
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= N || y >= N) return false;
    return this.visible[y * N + x] === 1;
  }
  tileExplored(x, y) {
    const N = this.map.N;
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= N || y >= N) return false;
    return this.explored[y * N + x] === 1;
  }

  // ------------------------------------------------------------------ update
  update(dt) {
    this.time += dt;
    this.pathBudget = 70;
    this.buildHash();
    const units = this.units;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!u.dead && !u.garrisonedIn) u.update(dt);
    }
    this.separate();
    const bl = this.buildings;
    for (let i = 0; i < bl.length; i++) if (!bl[i].dead) bl[i].update(dt);
    this.updateProjectiles(dt);
    for (const ai of this.ais) if (!ai.player.defeated) ai.update(dt);

    this.slowT += dt;
    if (this.slowT >= 0.2) { this.slowT = 0; this.updateVisibility(); this.checkSheep(); }
    this.secT += dt;
    if (this.secT >= 1) { this.secT -= 1; this.updatePop(); this.checkVictory(); this.updateWonders(1); }
    this.histT += dt;
    if (this.histT >= 15 || this.history.length === 0) { this.histT = 0; this.recordHistory(); }
    if (this.dirty) this.cleanup();
  }

  cleanup() {
    this.dirty = false;
    this.units = this.units.filter((u) => !u.dead);
    this.buildings = this.buildings.filter((b) => !b.dead);
    this.resources = this.resources.filter((r) => !r.dead);
    this.selection = this.selection.filter((e) => !e.dead && !(e.kind === 'unit' && e.garrisonedIn));
  }

  separate() {
    const C = this.hashC, G = this.hashG, map = this.map;
    for (let cy = 0; cy < G; cy++) for (let cx = 0; cx < G; cx++) {
      const cell = this.hash[cy * G + cx];
      if (!cell.length) continue;
      for (let i = 0; i < cell.length; i++) {
        const u = cell[i];
        if (u.dead || u.garrisonedIn) continue;
        for (let ny = cy - 1; ny <= cy + 1; ny++) for (let nx = cx - 1; nx <= cx + 1; nx++) {
          if (nx < 0 || ny < 0 || nx >= G || ny >= G) continue;
          const other = this.hash[ny * G + nx];
          for (let j = 0; j < other.length; j++) {
            const v = other[j];
            if (v.id <= u.id || v.dead || v.garrisonedIn) continue;
            const dx = v.x - u.x, dy = v.y - u.y;
            const rr = (u.radius + v.radius) * 0.85;
            let d2 = dx * dx + dy * dy;
            if (d2 >= rr * rr) continue;
            let d = Math.sqrt(d2), ux, uy;
            if (d < 1e-4) { const a = Math.random() * TAU; ux = Math.cos(a); uy = Math.sin(a); d = 0; }
            else { ux = dx / d; uy = dy / d; }
            const overlap = rr - d;
            // moving units squeeze past; stationary ones make room
            const wu = u.moved ? 0.15 : (u.anim === 'work' || u.anim === 'attack') ? 0.3 : 0.5;
            const wv = v.moved ? 0.15 : (v.anim === 'work' || v.anim === 'attack') ? 0.3 : 0.5;
            const tot = wu + wv;
            const push = Math.min(overlap, 0.05);
            const pu = (push * wu) / tot, pv = (push * wv) / tot;
            const ax = u.x - ux * pu, ay = u.y - uy * pu;
            if (map.passableF(ax, ay)) { u.x = ax; u.y = ay; }
            const bx = v.x + ux * pv, by = v.y + uy * pv;
            if (map.passableF(bx, by)) { v.x = bx; v.y = by; }
          }
        }
      }
    }
  }

  checkSheep() {
    for (const s of this.units) {
      if (s.dead || s.animal !== 'herd') continue;
      const near = this.unitsInRadius(s.x, s.y, 3.2);
      let best = null, bd = 1e9, ownerNear = false;
      for (const u of near) {
        if (u.animal || u.dead) continue;
        if (u.owner === s.owner) ownerNear = true;
        const d = Math.hypot(u.x - s.x, u.y - s.y);
        if (d < bd) { bd = d; best = u; }
      }
      if (best && best.owner !== s.owner && (!ownerNear || s.owner === 0)) {
        s.owner = best.owner;
        s.setOrder(null);
        s.anchorX = s.x; s.anchorY = s.y;
        this.emit('sheepCaptured', { sheep: s, player: this.players[best.owner] });
      }
    }
  }

  updateWonders(dt) {
    for (const b of this.buildings) {
      if (b.dead || b.type !== 'wonder' || !b.complete || b.wonderT == null) continue;
      const before = b.wonderT;
      b.wonderT -= dt;
      const p = this.players[b.owner];
      for (const mark of [300, 180, 60, 30]) {
        if (before > mark && b.wonderT <= mark) {
          const mine = b.owner === this.humanId;
          this.emit('notify', { text: mine ? `Your Wonder will bring victory in ${mark >= 60 ? mark / 60 + ' minute' + (mark > 60 ? 's' : '') : mark + ' seconds'}!` : `${p.name}'s Wonder will bring them victory in ${mark >= 60 ? mark / 60 + ' minute' + (mark > 60 ? 's' : '') : mark + ' seconds'}! Destroy it!`, type: mine ? 'good' : 'alert' });
        }
      }
      if (b.wonderT <= 0 && !this.over) {
        for (const q of this.players) if (!q.isGaia && q !== p && !q.defeated) this.defeatPlayer(q, 'wonder');
        this.endGame(p.id === this.humanId, 'wonder');
        return;
      }
    }
  }

  checkVictory() {
    for (const p of this.players) {
      if (p.isGaia || p.defeated) continue;
      let alive = false;
      for (const u of this.units) if (!u.dead && u.owner === p.id && !u.animal) { alive = true; break; }
      if (!alive) for (const b of this.buildings) if (!b.dead && b.owner === p.id && b.complete && !NON_ESSENTIAL.has(b.type)) { alive = true; break; }
      if (!alive) this.defeatPlayer(p, 'destroyed');
    }
    if (this.over) return;
    const alive = this.players.filter((p) => !p.isGaia && !p.defeated);
    const human = this.players[this.humanId];
    if (this.spectate) {
      if (alive.length === 1) this.endGame(false, 'conquest', alive[0]);
      return;
    }
    if (human.defeated) this.endGame(false, 'conquest');
    else if (alive.length === 1 && alive[0] === human) this.endGame(true, 'conquest');
  }

  defeatPlayer(p, reason) {
    if (p.defeated) return;
    p.defeated = true;
    this.emit('defeated', { player: p, reason });
    // a defeated player's remaining holdings crumble
    for (const u of this.units) if (!u.dead && u.owner === p.id && !u.animal) this.killUnit(u, null);
    for (const b of this.buildings) if (!b.dead && b.owner === p.id) this.destroyBuilding(b, null);
  }

  resign(p) { this.defeatPlayer(p, 'resigned'); this.checkVictory(); }

  endGame(won, reason, winner = null) {
    if (this.over) return;
    this.over = true;
    this.won = won;
    this.recordHistory();
    this.emit('gameOver', { won, reason, winner });
  }

  recordHistory() {
    const snap = { t: this.time, p: [] };
    for (const p of this.players) {
      if (p.isGaia) { snap.p.push(null); continue; }
      let vill = 0, mil = 0;
      for (const u of this.units) {
        if (u.dead || u.owner !== p.id || u.animal) continue;
        if (u.isVillager) vill++; else mil++;
      }
      const g = p.stats.gathered;
      snap.p.push({ vill, mil, age: p.age, res: g.food + g.wood + g.gold + g.stone });
    }
    this.history.push(snap);
  }

  score(p) {
    const g = p.stats.gathered;
    const eco = (g.food + g.wood + g.gold + g.stone) / 10;
    return Math.round(eco + p.stats.unitsKilled * 10 + p.stats.buildingsRazed * 25 + p.stats.techs * 20 + p.age * 150);
  }
}
