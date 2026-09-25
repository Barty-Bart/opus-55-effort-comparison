// Core simulation: entities, economy, combat, production, fog of war.
import { UNITS, BUILDINGS, TECHS, RESOURCE_DEFS, GATHER, CARRY, MAP_SIZE, PLAYER_COLORS, POP_MAX, AGE_NAMES, newMods } from './config.js';
import { generateMap, T } from './map.js';
import { PathFinder } from './path.js';
import { distRect, mulberry32, hash2 } from './util.js';

export class Player {
  constructor(id, name, human, color) {
    this.id = id; this.name = name; this.human = human; this.color = color;
    this.res = { food: 200, wood: 200, gold: 100, stone: 200 };
    this.age = 0;
    this.techs = new Set();
    this.researching = new Set();
    this.mods = newMods();
    this.unitMap = {};
    for (const k of Object.keys(UNITS)) this.unitMap[k] = k;
    this.pop = 0; this.popCap = 0;
    this.alive = true;
    this.gatherMult = 1; this.trainMult = 1;
    this.stats = { trained: 0, lost: 0, kills: 0, razed: 0, bLost: 0, built: 0, techs: 0, gathered: { food: 0, wood: 0, gold: 0, stone: 0 } };
    this.ageTimes = [0];
  }
}

export class Game {
  constructor(opts) {
    this.opts = opts;
    this.seed = opts.seed;
    this.N = MAP_SIZE;
    this.time = 0;
    this.nextId = 1;
    this.cmdSeq = 0;
    this.rnd = mulberry32(opts.seed * 7 + 1);
    const N = this.N;
    const map = generateMap(opts.seed, N);
    this.map = map;
    this.terrain = map.terrain;
    this.block = new Int32Array(N * N);   // blocking entity id per tile
    this.bgrid = new Int32Array(N * N);   // building footprint (incl. farms)
    this.ents = new Map();
    this.units = []; this.buildings = []; this.resources = [];
    this.projectiles = []; this.corpses = []; this.decals = []; this.events = [];
    this.players = [
      new Player(0, opts.playerName || 'You', true, PLAYER_COLORS[0]),
      new Player(1, 'Computer', false, PLAYER_COLORS[1]),
    ];
    this.human = 0;
    this.pf = new PathFinder(N, (x, y) => this.passable(x, y));
    this.vis = new Uint8Array(N * N);
    this.explored = new Uint8Array(N * N);
    this.fogT = 0; this.fogVersion = 0;
    this.alertT = {};
    this.winner = -1;
    this.victoryT = 0;
    this.CN = Math.ceil(N / 4);
    this.cells = Array.from({ length: this.CN * this.CN }, () => []);

    for (const t of map.trees) this.addResource('tree', t.x, t.y);
    for (const r of map.resources) this.addResource(r.type, r.x, r.y);
    for (const a of map.animals) this.addAnimal(a.type, a.x, a.y);

    map.starts.forEach((s, pid) => {
      const tc = this.addBuilding('towncenter', pid, s.x - 2, s.y - 2, true);
      const toC = Math.atan2(N / 2 - s.y, N / 2 - s.x);
      for (let k = 0; k < 3; k++) {
        const a = toC + (k - 1) * 0.5;
        this.addUnit('villager', pid, s.x + Math.cos(a) * 3.2, s.y + Math.sin(a) * 3.2);
      }
      this.addUnit('scout', pid, s.x + Math.cos(toC + 1.6) * 3.4, s.y + Math.sin(toC + 1.6) * 3.4);
      tc.rally = null;
    });
    const diff = opts.difficulty || 'standard';
    const ai = this.players[1];
    if (diff === 'easy') { ai.gatherMult = 0.8; ai.trainMult = 0.85; }
    if (diff === 'hard') { ai.gatherMult = 1.25; ai.trainMult = 1.15; ai.res.food += 100; ai.res.wood += 100; }
    this.recalcPop();
    this.updateFog();
  }

  // ---------- helpers ----------
  inb(x, y) { return x >= 0 && y >= 0 && x < this.N && y < this.N; }
  passable(x, y) {
    if (x < 0 || y < 0 || x >= this.N || y >= this.N) return false;
    const i = y * this.N + x;
    return this.terrain[i] < T.WATER && this.block[i] === 0;
  }
  emit(type, data) { this.events.push({ type, ...data }); }
  sfx(name, x, y) { this.events.push({ type: 'sfx', name, x, y }); }
  fx(name, x, y, extra) { this.events.push({ type: 'fx', name, x, y, ...extra }); }
  msg(pid, text, kind = 'info', x, y) { if (pid === this.human) this.events.push({ type: 'msg', text, kind, x, y }); }
  alert(pid, key, text, x, y) {
    if (pid !== this.human) return;
    if ((this.alertT[key] || -99) > this.time - 15) return;
    this.alertT[key] = this.time;
    this.events.push({ type: 'msg', text, kind: 'alert', x, y });
    this.events.push({ type: 'sfx', name: 'alarm', ui: true });
    this.events.push({ type: 'ping', x, y });
  }

  resType(r) {
    if (r.kind === 'building') return 'food';
    return RESOURCE_DEFS[r.type].res;
  }
  gatherKey(r) { return r.kind === 'building' ? 'farm' : r.type === 'tree' ? 'wood' : r.type; }

  maxHp(e) {
    const p = this.players[e.owner];
    if (e.kind === 'building') return Math.round(e.def.hp * p.mods.bldHp + (e.type === 'tower' ? p.mods.towerHp : 0));
    return e.def.hp + p.mods.hp[e.def.cls];
  }
  atkOf(u) { return u.def.atk + this.players[u.owner].mods.atk[u.def.cls]; }
  rangeOf(u) {
    const r = u.def.range;
    return r > 0 && u.def.cls === 'archer' ? r + this.players[u.owner].mods.range.archer : r;
  }
  armorOf(e) {
    const p = this.players[e.owner];
    const a = e.kind === 'building' ? p.mods.armor.building : p.mods.armor[e.def.cls];
    return [e.def.armor[0] + a[0], e.def.armor[1] + a[1]];
  }
  speedOf(u) { return u.def.speed * this.players[u.owner].mods.speed[u.def.cls]; }
  carryCap(u, r) {
    const p = this.players[u.owner];
    return CARRY + p.mods.carry + (r && r.kind === 'building' && p.techs.has('heavyplow') ? 1 : 0);
  }
  distToEnt(u, e) {
    if (e.kind === 'unit') return Math.hypot(u.x - e.x, u.y - e.y) - e.def.radius - (u.def ? u.def.radius : 0);
    if (e.animal) return Math.hypot(u.x - e.x, u.y - e.y) - 0.3;
    return distRect(u.x, u.y, e.tx, e.ty, e.w, e.h);
  }
  isEnemy(a, b) { return b && a.owner !== undefined && b.owner !== undefined && a.owner !== b.owner && b.owner >= 0; }
  canAfford(p, cost) { for (const k in cost) if (p.res[k] < cost[k]) return false; return true; }
  pay(p, cost) { for (const k in cost) p.res[k] -= cost[k]; }
  refund(p, cost) { for (const k in cost) p.res[k] += cost[k]; }

  tileVisible(x, y) { x |= 0; y |= 0; return this.inb(x, y) && this.vis[y * this.N + x] === 1; }
  tileExplored(x, y) { x |= 0; y |= 0; return this.inb(x, y) && this.explored[y * this.N + x] === 1; }
  entVisible(e) {
    if (e.owner === this.human) return true;
    if (e.kind === 'building' || (e.kind === 'resource' && !e.animal)) {
      for (let y = e.ty; y < e.ty + e.h; y++) for (let x = e.tx; x < e.tx + e.w; x++) if (this.vis[y * this.N + x]) return true;
      return false;
    }
    return this.tileVisible(e.x, e.y);
  }
  entExplored(e) {
    if (e.kind === 'building' || (e.kind === 'resource' && !e.animal)) {
      for (let y = e.ty; y < e.ty + e.h; y++) for (let x = e.tx; x < e.tx + e.w; x++) if (this.explored[y * this.N + x]) return true;
      return false;
    }
    return this.tileExplored(e.x, e.y);
  }

  // ---------- entity creation ----------
  addResource(type, tx, ty) {
    const def = RESOURCE_DEFS[type];
    const r = {
      id: this.nextId++, kind: 'resource', type, tx, ty, w: 1, h: 1, x: tx + 0.5, y: ty + 0.5,
      amount: def.amount, max: def.amount, variant: Math.floor(hash2(tx, ty, 99) * 1000), workers: 0, workersPrev: 0, owner: -1,
    };
    this.ents.set(r.id, r);
    this.resources.push(r);
    this.block[ty * this.N + tx] = r.id;
    return r;
  }
  addAnimal(type, x, y) {
    let tx = Math.floor(x), ty = Math.floor(y);
    if (!this.passable(tx, ty)) {
      const p = this.pf.nearestPassable(tx, ty, 5);
      if (!p) return;
      [tx, ty] = p; x = tx + 0.5; y = ty + 0.5;
    }
    const def = RESOURCE_DEFS[type];
    const r = {
      id: this.nextId++, kind: 'resource', type, animal: true, x, y, tx, ty, w: 1, h: 1, amount: def.amount, max: def.amount,
      killed: false, facing: this.rnd() < 0.5 ? 1 : -1, wanderT: this.rnd() * 5, homeX: x, homeY: y, tgt: null,
      variant: Math.floor(this.rnd() * 1000), workers: 0, workersPrev: 0, owner: -1, animT: this.rnd() * 10,
    };
    this.ents.set(r.id, r);
    this.resources.push(r);
    return r;
  }
  addBuilding(type, owner, tx, ty, built) {
    const def = BUILDINGS[type];
    const b = {
      id: this.nextId++, kind: 'building', type, def, owner, tx, ty, w: def.w, h: def.h,
      x: tx + def.w / 2, y: ty + def.h / 2, built, progress: built ? 1 : 0, hp: 1,
      queue: [], rally: null, atkCD: 0, bc: 0, bcPrev: 0, farmer: 0, createdT: this.time, lastHitT: -99,
    };
    b.hp = built ? this.maxHp(b) : 1;
    if (type === 'farm') { b.amount = 175 + this.players[owner].mods.farmFood; b.max = b.amount; }
    this.ents.set(b.id, b);
    this.buildings.push(b);
    for (let y = ty; y < ty + def.h; y++) for (let x = tx; x < tx + def.w; x++) {
      const i = y * this.N + x;
      this.bgrid[i] = b.id;
      if (!def.walkable) this.block[i] = b.id;
    }
    if (!def.walkable) this.pushUnitsOut(b);
    this.recalcPop();
    return b;
  }
  addUnit(type, owner, x, y) {
    const def = UNITS[type];
    const u = {
      id: this.nextId++, kind: 'unit', type, def, owner, x, y, hp: 0, task: null, path: null, pathIdx: 0, goalKey: null,
      carry: { type: null, amt: 0 }, facing: 1, animT: this.rnd() * 10, atkCD: 0, attackAnim: 0, scanT: this.rnd() * 0.5,
      lastHitT: -99, moving: false, working: false, workKind: null, repathT: 0, repathCD: 0, fail: 0, buildQueue: [],
    };
    u.hp = this.maxHp(u);
    this.ents.set(u.id, u);
    this.units.push(u);
    return u;
  }

  canPlace(type, tx, ty, pid) {
    const def = BUILDINGS[type];
    for (let y = ty; y < ty + def.h; y++) for (let x = tx; x < tx + def.w; x++) {
      if (!this.inb(x, y)) return false;
      const i = y * this.N + x;
      if (this.terrain[i] >= T.WATER || this.block[i] || this.bgrid[i]) return false;
      if (pid === this.human && !this.explored[i]) return false;
    }
    // don't allow building right on top of enemy units
    for (const u of this.units) {
      if (u.owner !== pid && u.x >= tx - 0.2 && u.x <= tx + def.w + 0.2 && u.y >= ty - 0.2 && u.y <= ty + def.h + 0.2) return false;
    }
    return true;
  }

  pushUnitsOut(b) {
    for (const u of this.units) {
      if (u.x >= b.tx && u.x < b.tx + b.w && u.y >= b.ty && u.y < b.ty + b.h) {
        let best = null, bd = 1e9;
        for (let y = b.ty - 1; y <= b.ty + b.h; y++) for (let x = b.tx - 1; x <= b.tx + b.w; x++) {
          if (!this.passable(x, y)) continue;
          const d = Math.hypot(x + 0.5 - u.x, y + 0.5 - u.y);
          if (d < bd) { bd = d; best = [x, y]; }
        }
        if (!best) best = this.pf.nearestPassable(Math.floor(u.x), Math.floor(u.y), 8);
        if (best) { u.x = best[0] + 0.5; u.y = best[1] + 0.5; u.path = null; u.goalKey = null; }
      }
    }
  }

  recalcPop() {
    for (const p of this.players) { p.pop = 0; p.popCap = 0; }
    for (const u of this.units) if (!u.dead) this.players[u.owner].pop++;
    for (const b of this.buildings) {
      if (b.dead) continue;
      const p = this.players[b.owner];
      if (b.built && b.def.pop) p.popCap += b.def.pop;
      if (b.queue.length && b.queue[0].kind === 'unit' && b.queue[0].started) p.pop++;
    }
    for (const p of this.players) p.popCap = Math.min(POP_MAX, p.popCap);
  }

  // ---------- main update ----------
  update(dt) {
    if (this.winner >= 0 && this.frozen) return;
    this.time += dt;
    for (const b of this.buildings) { b.bcPrev = b.bc; b.bc = 0; }
    for (const r of this.resources) { r.workersPrev = r.workers; r.workers = 0; }
    this.rebuildHash();
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      if (!u.dead) this.updateUnit(u, dt);
    }
    this.separate(dt);
    for (let i = 0; i < this.buildings.length; i++) {
      const b = this.buildings[i];
      if (!b.dead) this.updateBuilding(b, dt);
    }
    for (const r of this.resources) if (r.animal && !r.dead) this.updateAnimal(r, dt);
    this.updateProjectiles(dt);
    for (const c of this.corpses) c.t += dt;
    if (this.corpses.length && this.corpses[0].t > 40) this.corpses = this.corpses.filter((c) => c.t < 40);
    for (const d of this.decals) d.t += dt;
    this.decalT = (this.decalT || 0) - dt;
    if (this.decalT <= 0) { this.decalT = 1; this.decals = this.decals.filter((d) => d.t < d0life(d)); }

    this.fogT -= dt;
    if (this.fogT <= 0) { this.fogT = 0.25; this.updateFog(); }
    if (this.ai) this.ai.update(dt);
    this.cleanup();
    this.recalcPop();
    this.victoryT -= dt;
    if (this.victoryT <= 0) { this.victoryT = 1; this.checkVictory(); }
  }

  cleanup() {
    if (this.units.some((u) => u.dead)) this.units = this.units.filter((u) => !u.dead);
    if (this.buildings.some((b) => b.dead)) this.buildings = this.buildings.filter((b) => !b.dead);
    if (this.resources.some((r) => r.dead)) this.resources = this.resources.filter((r) => !r.dead);
  }

  rebuildHash() {
    for (const c of this.cells) c.length = 0;
    const CN = this.CN;
    for (const u of this.units) {
      if (u.dead) continue;
      const cx = Math.min(CN - 1, Math.max(0, (u.x / 4) | 0)), cy = Math.min(CN - 1, Math.max(0, (u.y / 4) | 0));
      this.cells[cy * CN + cx].push(u);
    }
  }
  unitsNear(x, y, r, out = []) {
    out.length = 0;
    const CN = this.CN;
    const x0 = Math.max(0, ((x - r) / 4) | 0), x1 = Math.min(CN - 1, ((x + r) / 4) | 0);
    const y0 = Math.max(0, ((y - r) / 4) | 0), y1 = Math.min(CN - 1, ((y + r) / 4) | 0);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      for (const u of this.cells[cy * CN + cx]) {
        if (!u.dead && (u.x - x) ** 2 + (u.y - y) ** 2 <= r * r) out.push(u);
      }
    }
    return out;
  }

  // ---------- movement ----------
  setPath(u, goal, key) {
    const sx = Math.floor(u.x), sy = Math.floor(u.y);
    let path;
    if (goal.ent) {
      const e = goal.ent;
      if (e.kind === 'unit' || e.animal) path = this.pf.find(sx, sy, { x: Math.floor(e.x), y: Math.floor(e.y) });
      else path = this.pf.find(sx, sy, { rect: { x: e.tx, y: e.ty, w: e.w, h: e.h }, inside: !!e.def?.walkable });
      if (path && e.def?.walkable && !path.partial) {
        // walk into the middle of a farm
        path.push({ x: e.x + (hash2(u.id, 3) - 0.5) * 1.2, y: e.y + (hash2(u.id, 4) - 0.5) * 1.2 });
      } else if (path && !path.partial && e.kind !== 'unit' && !e.animal) {
        // final approach: step up close to the target's edge
        const last = path.length ? path[path.length - 1] : { x: u.x, y: u.y };
        const m = 0.42;
        const hx = Math.max(e.tx - m, Math.min(e.tx + e.w + m, last.x));
        const hy = Math.max(e.ty - m, Math.min(e.ty + e.h + m, last.y));
        if (this.passable(Math.floor(hx), Math.floor(hy))) path.push({ x: hx, y: hy });
      }
    } else {
      const gx = Math.floor(goal.x), gy = Math.floor(goal.y);
      path = this.pf.find(sx, sy, { x: gx, y: gy });
      if (path && !path.partial && this.passable(gx, gy)) {
        if (path.length) path[path.length - 1] = { x: goal.x, y: goal.y };
        else path = [{ x: goal.x, y: goal.y }];
      }
    }
    if (path) path = this.pf.smooth(u.x, u.y, path);
    u.path = path || [];
    u.pathIdx = 0; u.goalKey = key; u.repathT = 0;
    if (goal.ent) { u.pathGX = goal.ent.x; u.pathGY = goal.ent.y; }
  }

  followPath(u, dt) {
    if (!u.path || u.pathIdx >= u.path.length) return false;
    let step = this.speedOf(u) * dt;
    while (step > 0 && u.pathIdx < u.path.length) {
      const wp = u.path[u.pathIdx];
      const dx = wp.x - u.x, dy = wp.y - u.y;
      const d = Math.hypot(dx, dy);
      if (d < 1e-4) { u.pathIdx++; continue; }
      const sdx = dx - dy;
      if (Math.abs(sdx) > 0.1 * d) u.facing = sdx > 0 ? 1 : -1;
      if (d <= step) { u.x = wp.x; u.y = wp.y; u.pathIdx++; step -= d; }
      else { u.x += (dx / d) * step; u.y += (dy / d) * step; step = 0; }
    }
    u.moving = true;
    return true;
  }

  // Move toward an entity; repaths as needed. Returns false if hopeless.
  approach(u, e, dt) {
    const key = 'e' + e.id;
    u.repathT += dt;
    u.repathCD -= dt;
    const mover = e.kind === 'unit' || e.animal;
    const ended = !u.path || u.pathIdx >= u.path.length;
    let need = u.goalKey !== key;
    if (!need && mover && u.repathT > 0.8 && Math.hypot(e.x - u.pathGX, e.y - u.pathGY) > 1.2) need = true;
    if (!need && ended && u.repathCD <= 0) { need = true; u.fail++; }
    if (need) {
      if (u.goalKey !== key) u.fail = 0;
      this.setPath(u, { ent: e }, key);
      u.repathCD = 0.6;
      if (u.fail > 6) return false;
    }
    this.followPath(u, dt);
    return true;
  }

  faceTo(u, x, y) {
    const sdx = (x - u.x) - (y - u.y);
    if (Math.abs(sdx) > 0.05) u.facing = sdx > 0 ? 1 : -1;
  }

  separate(dt) {
    const tmp = [];
    for (const u of this.units) {
      if (u.dead) continue;
      this.unitsNear(u.x, u.y, 1.0, tmp);
      for (const v of tmp) {
        if (v.id <= u.id) continue;
        let dx = v.x - u.x, dy = v.y - u.y;
        let d = Math.hypot(dx, dy);
        const minD = (u.def.radius + v.def.radius) * 0.9;
        if (d >= minD) continue;
        if (d < 1e-3) { dx = this.rnd() - 0.5; dy = this.rnd() - 0.5; d = Math.hypot(dx, dy) || 1; }
        const nx = dx / d, ny = dy / d;
        const ov = Math.min(minD - d, 0.2) * Math.min(1, dt * 8);
        let wu = u.working ? 0.15 : u.moving ? 0.6 : 1, wv = v.working ? 0.15 : v.moving ? 0.6 : 1;
        if (u.def.cls === 'siege') wu *= 0.3;
        if (v.def.cls === 'siege') wv *= 0.3;
        const s = wu + wv;
        this.nudge(u, -nx * ov * wu / s, -ny * ov * wu / s);
        this.nudge(v, nx * ov * wv / s, ny * ov * wv / s);
      }
    }
  }
  nudge(u, dx, dy) {
    const nx = u.x + dx, ny = u.y + dy;
    if (this.passable(Math.floor(nx), Math.floor(ny)) || !this.passable(Math.floor(u.x), Math.floor(u.y))) {
      if (this.passable(Math.floor(nx), Math.floor(ny))) { u.x = nx; u.y = ny; }
    }
  }

  // ---------- unit AI ----------
  updateUnit(u, dt) {
    u.animT += dt;
    if (u.atkCD > 0) u.atkCD -= dt;
    if (u.attackAnim > 0) u.attackAnim -= dt;
    u.moving = false; u.working = false;
    const t = u.task;
    if (!t) { this.idle(u, dt); return; }
    switch (t.t) {
      case 'move':
        if (u.goalKey !== t.key) this.setPath(u, { x: t.x, y: t.y }, t.key);
        if (!this.followPath(u, dt)) { u.task = null; u.path = null; }
        break;
      case 'amove': this.doAttackMove(u, t, dt); break;
      case 'gather': this.doGather(u, t, dt); break;
      case 'build': this.doBuild(u, t, dt); break;
      case 'drop': this.doDrop(u, t, dt); break;
      case 'attack': this.doAttack(u, t, dt); break;
      default: u.task = null;
    }
  }

  idle(u, dt) {
    if (u.def.cls === 'villager') return;
    u.scanT -= dt;
    if (u.scanT > 0) return;
    u.scanT = 0.45 + this.rnd() * 0.2;
    const tg = this.findEnemyNear(u, u.def.los + (this.rangeOf(u) > 0 ? 1 : 0));
    if (tg) u.task = { t: 'attack', id: tg.id, auto: true, ox: u.x, oy: u.y };
  }

  findEnemyNear(u, r) {
    const tmp = this.unitsNear(u.x, u.y, r, this._tmpA || (this._tmpA = []));
    let best = null, bd = 1e9;
    const onlyB = u.def.onlyBuildings;
    if (!onlyB) {
      for (const v of tmp) {
        if (v.owner === u.owner) continue;
        if (u.owner === this.human && !this.tileVisible(v.x, v.y)) continue;
        let d = Math.hypot(v.x - u.x, v.y - u.y);
        if (v.def.cls === 'villager') d += 1.5; // prefer military targets
        if (d < bd) { bd = d; best = v; }
      }
    }
    if (best) return best;
    for (const b of this.buildings) {
      if (b.dead || b.owner === u.owner) continue;
      const d = distRect(u.x, u.y, b.tx, b.ty, b.w, b.h);
      if (d > r) continue;
      let score = d + (b.type === 'farm' ? 4 : 0) + (b.def.attack && !onlyB ? 3 : 0);
      if (score < bd) { bd = score; best = b; }
    }
    return best;
  }

  doAttackMove(u, t, dt) {
    u.scanT -= dt;
    if (u.scanT <= 0) {
      u.scanT = 0.4 + this.rnd() * 0.2;
      const tg = this.findEnemyNear(u, u.def.los + 1);
      if (tg) { u.task = { t: 'attack', id: tg.id, then: t }; return; }
    }
    if (u.goalKey !== t.key) this.setPath(u, { x: t.x, y: t.y }, t.key);
    if (!this.followPath(u, dt)) { u.task = null; u.path = null; }
  }

  validTarget(u, tg) {
    if (!tg || tg.dead || tg.kind === 'resource' || tg.owner === u.owner) return false;
    if (u.def.onlyBuildings && tg.kind !== 'building') return false;
    if (u.owner === this.human && tg.kind === 'unit' && !this.tileVisible(tg.x, tg.y)) return false;
    return true;
  }

  doAttack(u, t, dt) {
    const tg = this.ents.get(t.id);
    if (!this.validTarget(u, tg)) {
      u.path = null; u.goalKey = null;
      if (t.then) { u.task = t.then; return; }
      if (t.auto) {
        const nt = this.findEnemyNear(u, u.def.los);
        if (nt) { t.id = nt.id; return; }
        if (Math.hypot(u.x - t.ox, u.y - t.oy) > 1.5) { u.task = { t: 'move', x: t.ox, y: t.oy, key: 'r' + (++this.cmdSeq) }; return; }
      }
      u.task = null;
      return;
    }
    if (t.auto && Math.hypot(u.x - t.ox, u.y - t.oy) > u.def.los + 6) {
      u.task = { t: 'move', x: t.ox, y: t.oy, key: 'r' + (++this.cmdSeq) };
      return;
    }
    const range = this.rangeOf(u);
    const d = this.distToEnt(u, tg);
    const reach = range > 0 ? range + 0.25 : (tg.kind === 'building' ? 0.85 : 0.35);
    if (d <= reach) {
      u.path = null; u.goalKey = null;
      this.faceTo(u, tg.x, tg.y);
      if (u.atkCD <= 0) this.strike(u, tg);
      else if (u.attackAnim <= 0) u.working = false;
    } else {
      if (!this.approach(u, tg, dt)) { u.task = t.then || null; }
    }
  }

  unitAtkStats(u) {
    return { atk: this.atkOf(u), type: u.def.atkType, bonus: u.def.bonus, owner: u.owner, srcId: u.id, splash: u.def.splash };
  }
  strike(u, tg) {
    u.atkCD = u.def.rate;
    u.attackAnim = 0.4;
    const st = this.unitAtkStats(u);
    if (u.def.proj) {
      this.launch(u.def.proj, u.x, u.y, u.def.cls === 'siege' ? 0.6 : 0.55, tg, st);
      this.sfx(u.def.proj === 'stone' ? 'catapult' : 'bow', u.x, u.y);
    } else {
      this.damage(st, tg, this.calcDamage(st, tg));
      this.sfx(tg.kind === 'building' ? (u.def.cls === 'siege' ? 'ram' : 'hitbuilding') : u.def.cls === 'villager' ? 'punch' : 'sword', u.x, u.y);
    }
  }

  calcDamage(st, tg) {
    const arm = this.armorOf(tg)[st.type === 'melee' ? 0 : 1];
    let dmg = Math.max(0, st.atk - arm);
    if (st.bonus) {
      const cls = tg.kind === 'building' ? 'building' : tg.def.cls;
      dmg += st.bonus[cls] || 0;
    }
    return Math.max(1, dmg);
  }

  damage(st, tg, dmg) {
    if (!tg || tg.dead) return;
    tg.hp -= dmg;
    tg.lastHitT = this.time;
    tg.lastAttacker = st.srcId;
    const src = this.ents.get(st.srcId);
    if (tg.kind === 'unit') {
      this.fx('blood', tg.x, tg.y);
      if (!tg.task && tg.def.cls !== 'villager' && src && src.kind === 'unit' && !tg.def.onlyBuildings) {
        tg.task = { t: 'attack', id: src.id, auto: true, ox: tg.x, oy: tg.y };
      }
      if (tg.def.cls === 'villager') this.alert(tg.owner, 'vil', 'Your villagers are under attack!', tg.x, tg.y);
      else this.alert(tg.owner, 'army', 'Your army is under attack!', tg.x, tg.y);
    } else {
      this.fx('debris', tg.x + (this.rnd() - 0.5) * tg.w * 0.6, tg.y + (this.rnd() - 0.5) * tg.h * 0.6);
      this.alert(tg.owner, 'bld', `Your ${tg.def.name} is under attack!`, tg.x, tg.y);
    }
    if (this.ai && src) this.ai.onAttacked(tg, src);
    if (tg.hp <= 0) this.kill(tg, st.owner);
  }

  kill(e, killerOwner) {
    if (e.dead) return;
    e.dead = true;
    e.hp = 0;
    const p = this.players[e.owner];
    if (e.kind === 'unit') {
      p.stats.lost++;
      if (killerOwner >= 0 && killerOwner !== e.owner) this.players[killerOwner].stats.kills++;
      this.corpses.push({ x: e.x, y: e.y, type: e.type, owner: e.owner, facing: e.facing, t: 0 });
      this.sfx(e.def.cls === 'siege' ? 'crash' : 'die', e.x, e.y);
      this.releaseFarm(e);
    } else if (e.kind === 'building') {
      p.stats.bLost++;
      if (killerOwner >= 0 && killerOwner !== e.owner) this.players[killerOwner].stats.razed++;
      for (let y = e.ty; y < e.ty + e.h; y++) for (let x = e.tx; x < e.tx + e.w; x++) {
        const i = y * this.N + x;
        if (this.block[i] === e.id) this.block[i] = 0;
        if (this.bgrid[i] === e.id) this.bgrid[i] = 0;
      }
      for (const q of e.queue) { this.refund(p, q.kind === 'unit' ? UNITS[q.key].cost : TECHS[q.key].cost); if (q.kind === 'tech') p.researching.delete(q.key); }
      e.queue = [];
      if (e.type !== 'farm') {
        this.decals.push({ kind: 'rubble', x: e.x, y: e.y, w: e.w, h: e.h, t: 0, seed: e.id });
        this.fx('collapse', e.x, e.y, { w: e.w });
        this.sfx('collapse', e.x, e.y);
      }
      if (killerOwner !== e.owner && e.type !== 'farm') this.msg(e.owner, `Your ${e.def.name} was destroyed!`, 'alert', e.x, e.y);
      if (e.owner !== this.human && killerOwner === this.human && e.type !== 'farm') this.msg(this.human, `Enemy ${e.def.name} destroyed.`, 'good', e.x, e.y);
    }
    this.emit('killed', { id: e.id });
  }

  releaseFarm(u) {
    if (u.task && u.task.t === 'gather') {
      const f = this.ents.get(u.task.id);
      if (f && f.farmer === u.id) f.farmer = 0;
    }
  }

  // ---------- projectiles ----------
  launch(kind, x, y, z, tg, st) {
    const tx = tg.x, ty = tg.y;
    const d = Math.hypot(tx - x, ty - y);
    const speed = kind === 'stone' ? 6 : kind === 'javelin' ? 8 : 10;
    this.projectiles.push({
      kind, x0: x, y0: y, z0: z, x, y, z, tx, ty, targetId: tg.id, t: 0, dur: Math.max(0.15, d / speed),
      arc: kind === 'stone' ? 0.25 + d * 0.12 : 0.06 + d * 0.05, st, homing: kind !== 'stone',
    });
  }
  updateProjectiles(dt) {
    const keep = [];
    for (const p of this.projectiles) {
      p.t += dt;
      if (p.homing) {
        const tg = this.ents.get(p.targetId);
        if (tg && !tg.dead) { p.tx = tg.x; p.ty = tg.y; }
      }
      const k = Math.min(1, p.t / p.dur);
      p.px = p.x; p.py = p.y; p.pz = p.z;
      p.x = p.x0 + (p.tx - p.x0) * k;
      p.y = p.y0 + (p.ty - p.y0) * k;
      p.z = p.z0 * (1 - k) + 0.3 * k + Math.sin(Math.PI * k) * p.arc;
      if (k >= 1) {
        if (p.st.splash) {
          this.fx('dust', p.tx, p.ty, { big: true });
          this.sfx('thud', p.tx, p.ty);
          const hit = this.unitsNear(p.tx, p.ty, p.st.splash + 0.3, []);
          for (const u of hit) if (u.owner !== p.st.owner) {
            const f = Math.hypot(u.x - p.tx, u.y - p.ty) < 0.5 ? 1 : 0.5;
            this.damage(p.st, u, Math.max(1, Math.round(this.calcDamage(p.st, u) * f)));
          }
          for (const b of this.buildings) {
            if (b.dead || b.owner === p.st.owner) continue;
            if (distRect(p.tx, p.ty, b.tx, b.ty, b.w, b.h) < 0.3) this.damage(p.st, b, this.calcDamage(p.st, b));
          }
        } else {
          const tg = this.ents.get(p.targetId);
          if (tg && !tg.dead) this.damage(p.st, tg, this.calcDamage(p.st, tg));
        }
        if (p.kind !== 'stone') this.decals.push({ kind: 'arrow', x: p.tx + (this.rnd() - 0.5) * 0.3, y: p.ty + (this.rnd() - 0.5) * 0.3, t: 0, a: Math.atan2(p.ty - p.y0, p.tx - p.x0) });
        continue;
      }
      keep.push(p);
    }
    this.projectiles = keep;
  }

  // ---------- gathering ----------
  findResourceNear(pid, resType, x, y, radius, sub, exclude = 0) {
    let best = null, bs = 1e9;
    const human = pid === this.human;
    for (const r of this.resources) {
      if (r.dead || r.id === exclude || RESOURCE_DEFS[r.type].res !== resType) continue;
      if (sub && r.type !== sub) continue;
      const d = Math.hypot(r.x - x, r.y - y);
      if (d > radius) continue;
      if (human && !this.tileExplored(r.x, r.y)) continue;
      const s = d + r.workersPrev * (r.type === 'tree' ? 2.5 : 0.8);
      if (s < bs) { bs = s; best = r; }
    }
    if (resType === 'food' && (!sub || sub === 'farm')) {
      for (const b of this.buildings) {
        if (b.dead || b.type !== 'farm' || b.owner !== pid || !this.farmFree(b)) continue;
        const d = Math.hypot(b.x - x, b.y - y);
        if (d > radius) continue;
        if (d < bs) { bs = d; best = b; }
      }
    }
    return best;
  }
  farmFree(f, uid) {
    if (!f.farmer || f.farmer === uid) return true;
    const u = this.ents.get(f.farmer);
    return !u || u.dead || !u.task || u.task.id !== f.id;
  }

  nearestDropsite(pid, type, x, y) {
    let best = null, bd = 1e9;
    for (const b of this.buildings) {
      if (b.dead || !b.built || b.owner !== pid || !b.def.drop || !b.def.drop.includes(type)) continue;
      const d = distRect(x, y, b.tx, b.ty, b.w, b.h);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  doGather(u, t, dt) {
    let r = this.ents.get(t.id);
    const p = this.players[u.owner];
    if (r && r.kind === 'building') {
      if (r.dead || r.owner !== u.owner) r = null;
      else if (!r.built) { u.task = { t: 'build', id: r.id, thenGather: true }; return; }
    }
    if (!r || r.dead) {
      if (t.returning && u.carry.amt > 0) { /* finish drop first */ }
      else {
        const nr = this.findResourceNear(u.owner, t.resType || 'wood', t.lx ?? u.x, t.ly ?? u.y, 9, t.sub === 'farm' ? 'farm' : t.sub);
        const nr2 = nr || (t.resType === 'food' ? this.findResourceNear(u.owner, 'food', t.lx ?? u.x, t.ly ?? u.y, 9) : null);
        if (nr2) { t.id = nr2.id; r = nr2; t.sub = nr2.kind === 'building' ? 'farm' : nr2.type; }
        else {
          if (u.carry.amt > 0) { u.task = { t: 'drop', id: 0, resType: u.carry.type }; return; }
          u.task = null; u.path = null; return;
        }
      }
    }
    const resType = r ? this.resType(r) : t.resType;
    t.resType = resType;
    if (r) { t.lx = r.x; t.ly = r.y; t.sub = r.kind === 'building' ? 'farm' : r.type; }
    if (u.carry.type && u.carry.type !== resType && u.carry.amt > 0) u.carry = { type: null, amt: 0 };
    const cap = this.carryCap(u, r);

    if (t.returning) {
      const ds = this.nearestDropsite(u.owner, u.carry.type || resType, u.x, u.y);
      if (!ds) { t.returning = false; if (u.carry.amt >= cap) { u.working = false; return; } }
      else if (this.distToEnt(u, ds) <= 1.0) {
        this.deposit(u);
        t.returning = false;
      } else { if (!this.approach(u, ds, dt)) { u.task = null; } return; }
    }
    if (!r) return;
    if (u.carry.amt >= cap) { t.returning = true; return; }

    if (r.kind === 'building') {
      if (!this.farmFree(r, u.id)) {
        const other = this.findResourceNear(u.owner, 'food', u.x, u.y, 9, 'farm');
        if (other && other !== r) { t.id = other.id; return; }
        u.task = null; return;
      }
      r.farmer = u.id;
    }
    r.workers++;
    const inRange = r.kind === 'building' ? Math.hypot(u.x - r.x, u.y - r.y) < 1.2 : this.distToEnt(u, r) <= 1.0;
    if (!inRange) {
      if (!this.approach(u, r, dt)) {
        const alt = this.findResourceNear(u.owner, resType, r.x, r.y, 7, r.kind === 'building' ? 'farm' : r.type, r.id);
        if (alt) { t.id = alt.id; u.goalKey = null; u.fail = 0; } else u.task = null;
      }
      return;
    }
    u.path = null; u.goalKey = null;
    u.working = true;
    u.workKind = resType === 'food' ? (r.kind === 'building' ? 'farm' : r.animal ? 'hunt' : 'berry') : resType;
    this.faceTo(u, r.x, r.y);
    if (r.animal && !r.killed) { r.killed = true; r.tgt = null; this.sfx('punch', r.x, r.y); }
    const key = this.gatherKey(r);
    const rate = GATHER[key] * p.mods.gather[resType] * (key === 'farm' ? p.mods.gather.farm : 1) * p.gatherMult;
    const amt = Math.min(rate * dt, r.amount, cap - u.carry.amt);
    r.amount -= amt;
    u.carry.type = resType;
    u.carry.amt += amt;
    u.gatherTick = (u.gatherTick || 0) + dt;
    if (u.gatherTick > 1.1) {
      u.gatherTick = 0;
      const s = { wood: 'chop', gold: 'mine', stone: 'mine', food: r.kind === 'building' ? 'farm' : r.animal ? 'meat' : 'berry' }[resType];
      this.sfx(s, u.x, u.y);
      if (resType === 'wood') this.fx('chips', r.x, r.y);
    }
    if (r.amount <= 0.001) this.exhaust(r, u);
  }

  exhaust(r, u) {
    if (r.kind === 'building') {
      // farm exhausted: reseed if affordable
      const p = this.players[r.owner];
      if (this.canAfford(p, { wood: 60 })) {
        this.pay(p, { wood: 60 });
        r.built = false; r.progress = 0; r.hp = 1;
        r.amount = 175 + p.mods.farmFood; r.max = r.amount;
        if (u) u.task = { t: 'build', id: r.id, thenGather: true };
      } else {
        this.msg(r.owner, 'A farm has been exhausted (not enough wood to reseed).', 'info', r.x, r.y);
        this.kill(r, r.owner);
      }
      return;
    }
    r.dead = true;
    if (!r.animal) this.block[r.ty * this.N + r.tx] = 0;
    if (r.type === 'tree') this.decals.push({ kind: 'stump', x: r.x, y: r.y, t: 0, seed: r.variant });
    this.emit('killed', { id: r.id });
  }

  deposit(u) {
    const p = this.players[u.owner];
    if (u.carry.amt > 0 && u.carry.type) {
      p.res[u.carry.type] += u.carry.amt;
      p.stats.gathered[u.carry.type] += u.carry.amt;
    }
    u.carry = { type: null, amt: 0 };
  }

  doDrop(u, t, dt) {
    let ds = t.id ? this.ents.get(t.id) : null;
    if (!ds || ds.dead || !ds.built || ds.owner !== u.owner || !(ds.def.drop || []).includes(u.carry.type)) {
      ds = u.carry.type ? this.nearestDropsite(u.owner, u.carry.type, u.x, u.y) : null;
      if (!ds) { u.task = t.then || null; return; }
      t.id = ds.id;
    }
    if (this.distToEnt(u, ds) <= 1.0) {
      this.deposit(u);
      u.task = t.then || null; u.path = null; u.goalKey = null;
    } else if (!this.approach(u, ds, dt)) u.task = null;
  }

  // ---------- building ----------
  doBuild(u, t, dt) {
    const b = this.ents.get(t.id);
    if (!b || b.dead || b.owner !== u.owner) { this.nextBuild(u); return; }
    const mh = this.maxHp(b);
    if (b.built && b.hp >= mh) { this.afterBuild(u, b, t); return; }
    const inRange = b.def.walkable ? distRect(u.x, u.y, b.tx, b.ty, b.w, b.h) <= 0.5 : this.distToEnt(u, b) <= 1.0;
    if (!inRange) {
      if (!this.approach(u, b, dt)) this.nextBuild(u);
      return;
    }
    u.path = null; u.goalKey = null;
    u.working = true; u.workKind = 'build';
    this.faceTo(u, b.x, b.y);
    u.gatherTick = (u.gatherTick || 0) + dt;
    if (u.gatherTick > 0.9) { u.gatherTick = 0; this.sfx('hammer', u.x, u.y); }
    if (!b.built) {
      const n = Math.max(1, b.bcPrev);
      b.bc++;
      const dp = ((n + 2) / (3 * b.def.time * n)) * dt;
      b.progress = Math.min(1, b.progress + dp);
      b.hp = Math.min(mh, b.hp + mh * dp);
      if (b.progress >= 1) this.completeBuilding(b);
    } else {
      b.hp = Math.min(mh, b.hp + (mh / (b.def.time * 2.5)) * dt);
    }
  }

  completeBuilding(b) {
    b.built = true; b.progress = 1;
    const p = this.players[b.owner];
    if (b.type !== 'farm' || !b.reseeded) p.stats.built++;
    b.reseeded = true;
    if (b.type !== 'farm') {
      this.fx('dust', b.x, b.y, { big: true, w: b.w });
      this.sfx('built', b.x, b.y);
      this.msg(b.owner, `${b.def.name} completed.`, 'info', b.x, b.y);
    }
    this.recalcPop();
    this.emit('built', { id: b.id });
  }

  nextBuild(u) {
    u.path = null; u.goalKey = null;
    while (u.buildQueue.length) {
      const id = u.buildQueue.shift();
      const b = this.ents.get(id);
      if (b && !b.dead && !b.built) { u.task = { t: 'build', id }; return; }
    }
    u.task = null;
  }

  afterBuild(u, b, t) {
    u.path = null; u.goalKey = null;
    if (u.buildQueue.length) { this.nextBuild(u); return; }
    if (b.type === 'farm' && this.farmFree(b, u.id)) { u.task = { t: 'gather', id: b.id, resType: 'food', sub: 'farm' }; return; }
    const auto = { lumbercamp: ['wood'], miningcamp: ['gold', 'stone'], mill: ['food'] }[b.type];
    if (auto && !t.repair) {
      let best = null, bd = 1e9;
      for (const rt of auto) {
        const r = this.findResourceNear(u.owner, rt, b.x, b.y, 9, rt === 'food' ? 'berry' : null);
        if (r) { const d = Math.hypot(r.x - b.x, r.y - b.y); if (d < bd) { bd = d; best = r; } }
      }
      if (best) { u.task = { t: 'gather', id: best.id, resType: this.resType(best) }; return; }
    }
    if (u.carry.amt > 0 && b.def.drop && b.def.drop.includes(u.carry.type)) this.deposit(u);
    u.task = null;
  }

  updateBuilding(b, dt) {
    if (!b.built) return;
    const p = this.players[b.owner];
    if (b.def.attack) {
      b.atkCD -= dt;
      if (b.atkCD <= 0) {
        const range = b.def.attack.range + p.mods.range.building;
        const tg = this.findTargetForBuilding(b, range);
        if (tg) {
          const st = { atk: b.def.attack.atk + p.mods.atk.building + (b.type === 'tower' ? p.mods.towerAtk : 0), type: 'pierce', owner: b.owner, srcId: b.id };
          for (let k = 0; k < b.def.attack.shots; k++) {
            const ox = (this.rnd() - 0.5) * b.w * 0.5, oy = (this.rnd() - 0.5) * b.h * 0.5;
            this.launch('arrow', b.x + ox, b.y + oy, b.type === 'tower' ? 2.2 : 1.6, tg, st);
          }
          this.sfx('bow', b.x, b.y);
          b.atkCD = b.def.attack.rate;
        } else b.atkCD = 0.4;
      }
    }
    if (!b.queue.length) return;
    const q = b.queue[0];
    if (q.kind === 'unit') {
      if (!q.started) {
        if (p.pop >= p.popCap) {
          if (!q.blocked) { q.blocked = true; }
          if (b.owner === this.human) this.alert(b.owner, 'house', 'You need to build more houses!', b.x, b.y);
          return;
        }
        q.started = true; q.blocked = false;
        p.pop++;
      }
      q.t += dt * p.trainMult;
      if (q.t >= UNITS[q.key].time) {
        b.queue.shift();
        this.spawnFrom(b, q.key);
      }
    } else {
      q.t += dt * p.trainMult;
      if (q.t >= TECHS[q.key].time) {
        b.queue.shift();
        this.applyTech(p, q.key);
      }
    }
  }

  findTargetForBuilding(b, range) {
    const tmp = this.unitsNear(b.x, b.y, range + b.w / 2 + 0.5, this._tmpB || (this._tmpB = []));
    let best = null, bd = 1e9;
    for (const u of tmp) {
      if (u.owner === b.owner) continue;
      const d = distRect(u.x, u.y, b.tx, b.ty, b.w, b.h);
      if (d > range) continue;
      const s = d + (u.def.cls === 'siege' ? -2 : 0);
      if (s < bd) { bd = s; best = u; }
    }
    return best;
  }

  spawnFrom(b, key) {
    const p = this.players[b.owner];
    const rx = b.rally ? b.rally.x : b.x + b.w, ry = b.rally ? b.rally.y : b.y + b.h;
    let best = null, bd = 1e9;
    for (let y = b.ty - 1; y <= b.ty + b.h; y++) for (let x = b.tx - 1; x <= b.tx + b.w; x++) {
      if (x >= b.tx && x < b.tx + b.w && y >= b.ty && y < b.ty + b.h) continue;
      if (!this.passable(x, y)) continue;
      const d = Math.hypot(x + 0.5 - rx, y + 0.5 - ry);
      if (d < bd) { bd = d; best = [x, y]; }
    }
    if (!best) best = this.pf.nearestPassable(b.tx + b.w, b.ty + b.h, 10);
    if (!best) return;
    const u = this.addUnit(key, b.owner, best[0] + 0.5 + (this.rnd() - 0.5) * 0.2, best[1] + 0.5 + (this.rnd() - 0.5) * 0.2);
    p.stats.trained++;
    this.sfx('trained', u.x, u.y);
    if (b.rally) {
      const tg = b.rally.id ? this.ents.get(b.rally.id) : null;
      if (tg && !tg.dead && u.def.cls === 'villager' && (tg.kind === 'resource' || tg.type === 'farm')) {
        u.task = { t: 'gather', id: tg.id, resType: this.resType(tg) };
      } else if (tg && !tg.dead && u.def.cls === 'villager' && tg.kind === 'building' && tg.owner === u.owner && !tg.built) {
        u.task = { t: 'build', id: tg.id };
      } else {
        u.task = { t: 'move', x: b.rally.x + (this.rnd() - 0.5) * 0.8, y: b.rally.y + (this.rnd() - 0.5) * 0.8, key: 'm' + (++this.cmdSeq) };
      }
    }
    this.emit('spawned', { id: u.id, owner: u.owner });
    return u;
  }

  // ---------- tech ----------
  techLocked(p, key) {
    // returns reason string if locked, else null
    const t = TECHS[key];
    if (p.age < (t.age || 0)) return `Requires ${AGE_NAMES[t.age]}`;
    if (t.req && !p.techs.has(t.req)) return `Requires ${TECHS[t.req].name}`;
    if (t.ageUp) {
      if ([...p.researching].some((k) => TECHS[k].ageUp)) return 'Already advancing';
      const rb = t.reqBuildings;
      const have = new Set(this.buildings.filter((b) => !b.dead && b.built && b.owner === p.id).map((b) => b.type));
      const n = rb.list.filter((k) => have.has(k)).length;
      if (n < rb.n) return `Requires ${rb.n} of: ${rb.list.map((k) => BUILDINGS[k].name).join(', ')}`;
    }
    return null;
  }
  techVisible(p, key) {
    const t = TECHS[key];
    if (p.techs.has(key) || p.researching.has(key)) return false;
    if (t.ageUp && t.age !== p.age) return false;
    if (t.upgrade) {
      const from = t.upgrade[0];
      if (!Object.values(p.unitMap).includes(from)) return false;
    }
    if (t.req && !p.techs.has(t.req) && !p.researching.has(t.req)) {
      // show next tier only after previous is known
      return false;
    }
    return true;
  }

  queueTech(b, key) {
    const p = this.players[b.owner];
    if (!b.built || b.dead) return 'Building not complete';
    if (!this.techVisible(p, key)) return 'Not available';
    const lock = this.techLocked(p, key);
    if (lock) return lock;
    const t = TECHS[key];
    if (!this.canAfford(p, t.cost)) return 'Not enough resources';
    if (b.queue.length >= 10) return 'Queue full';
    this.pay(p, t.cost);
    p.researching.add(key);
    b.queue.push({ kind: 'tech', key, t: 0 });
    return null;
  }
  queueTrain(b, baseKey) {
    const p = this.players[b.owner];
    const key = p.unitMap[baseKey];
    const def = UNITS[key];
    if (!b.built || b.dead) return 'Building not complete';
    if (p.age < (def.age || 0)) return `Requires ${AGE_NAMES[def.age]}`;
    if (b.queue.length >= 15) return 'Queue full';
    if (!this.canAfford(p, def.cost)) return 'Not enough resources';
    this.pay(p, def.cost);
    b.queue.push({ kind: 'unit', key, t: 0 });
    return null;
  }
  cancelQueue(b, idx) {
    const q = b.queue[idx];
    if (!q) return;
    const p = this.players[b.owner];
    this.refund(p, q.kind === 'unit' ? UNITS[q.key].cost : TECHS[q.key].cost);
    if (q.kind === 'tech') p.researching.delete(q.key);
    b.queue.splice(idx, 1);
    this.recalcPop();
  }

  applyTech(p, key) {
    const t = TECHS[key];
    p.techs.add(key);
    p.researching.delete(key);
    p.stats.techs++;
    if (t.ageUp) {
      p.age = t.ageUp;
      p.ageTimes[p.age] = this.time;
      if (p.id === this.human) {
        this.emit('msg', { text: `You have advanced to the ${AGE_NAMES[p.age]}!`, kind: 'age' });
        this.emit('sfx', { name: 'fanfare', ui: true });
        this.emit('ageup', { age: p.age });
      } else {
        this.emit('msg', { text: `The enemy has advanced to the ${AGE_NAMES[p.age]}.`, kind: 'alert' });
      }
      return;
    }
    const before = new Map();
    for (const e of [...this.units, ...this.buildings]) if (e.owner === p.id && !e.dead) before.set(e, this.maxHp(e));
    if (t.apply) t.apply(p);
    if (t.upgrade) {
      const [from, to] = t.upgrade;
      for (const k in p.unitMap) if (p.unitMap[k] === from) p.unitMap[k] = to;
      for (const u of this.units) {
        if (u.owner !== p.id || u.type !== from || u.dead) continue;
        const ratio = u.hp / this.maxHp(u);
        u.type = to; u.def = UNITS[to];
        u.hp = Math.max(1, Math.round(ratio * this.maxHp(u)));
        before.delete(u);
      }
    }
    for (const [e, mh] of before) {
      const nm = this.maxHp(e);
      if (nm > mh && (e.kind === 'unit' || e.built)) e.hp += nm - mh;
    }
    if (p.id === this.human) {
      this.emit('msg', { text: `${t.name} researched.`, kind: 'good' });
      this.emit('sfx', { name: 'research', ui: true });
    }
  }

  // ---------- placement ----------
  placeBuilding(pid, type, tx, ty, builders, queue = false) {
    const p = this.players[pid];
    const def = BUILDINGS[type];
    if (p.age < (def.age || 0)) return null;
    if (!this.canPlace(type, tx, ty, pid)) return null;
    if (!this.canAfford(p, def.cost)) return null;
    this.pay(p, def.cost);
    const b = this.addBuilding(type, pid, tx, ty, false);
    for (const u of builders) {
      if (u.def.cls !== 'villager') continue;
      if (queue && u.task && u.task.t === 'build') u.buildQueue.push(b.id);
      else { this.releaseFarm(u); u.buildQueue = []; u.task = { t: 'build', id: b.id }; u.path = null; u.goalKey = null; }
    }
    return b;
  }

  // ---------- animals ----------
  updateAnimal(r, dt) {
    r.animT += dt;
    if (r.killed) return;
    if (r.tgt) {
      const dx = r.tgt[0] - r.x, dy = r.tgt[1] - r.y, d = Math.hypot(dx, dy);
      const sp = RESOURCE_DEFS[r.type].speed * dt;
      if (d < sp) { r.tgt = null; r.wanderT = 2 + this.rnd() * 5; }
      else {
        const nx = r.x + dx / d * sp, ny = r.y + dy / d * sp;
        if (this.passable(Math.floor(nx), Math.floor(ny))) { r.x = nx; r.y = ny; } else r.tgt = null;
        if (Math.abs(dx - dy) > 0.05) r.facing = dx - dy > 0 ? 1 : -1;
      }
      return;
    }
    r.wanderT -= dt;
    if (r.wanderT <= 0) {
      const rad = r.type === 'deer' ? 3 : 1.4;
      const a = this.rnd() * Math.PI * 2;
      const tx = r.homeX + Math.cos(a) * rad * this.rnd(), ty = r.homeY + Math.sin(a) * rad * this.rnd();
      if (this.passable(Math.floor(tx), Math.floor(ty))) r.tgt = [tx, ty];
      else r.wanderT = 1;
    }
  }

  // ---------- fog ----------
  updateFog() {
    const N = this.N, vis = this.vis;
    vis.fill(0);
    const mark = (cx, cy, rad) => {
      const r2 = rad * rad, R = Math.ceil(rad);
      const x0 = Math.floor(cx), y0 = Math.floor(cy);
      for (let dy = -R; dy <= R; dy++) {
        const y = y0 + dy;
        if (y < 0 || y >= N) continue;
        for (let dx = -R; dx <= R; dx++) {
          const x = x0 + dx;
          if (x < 0 || x >= N) continue;
          const ddx = x + 0.5 - cx, ddy = y + 0.5 - cy;
          if (ddx * ddx + ddy * ddy <= r2) vis[y * N + x] = 1;
        }
      }
    };
    for (const u of this.units) if (u.owner === this.human && !u.dead) mark(u.x, u.y, u.def.los + 0.5);
    for (const b of this.buildings) if (b.owner === this.human && !b.dead) mark(b.x, b.y, (b.built ? b.def.los : 2) + Math.max(b.w, b.h) / 2);
    if (this.revealAll) vis.fill(1);
    for (let i = 0; i < N * N; i++) if (vis[i]) this.explored[i] = 1;
    this.fogVersion++;
  }

  // ---------- commands (used by UI and AI) ----------
  formation(units, x, y) {
    const n = units.length;
    const cols = Math.ceil(Math.sqrt(n));
    const sp = units.some((u) => u.def.cls === 'cavalry' || u.def.cls === 'siege') ? 0.9 : 0.7;
    const sorted = [...units].sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
    const rows = Math.ceil(n / cols);
    return sorted.map((u, i) => {
      let px = x + ((i % cols) - (cols - 1) / 2) * sp, py = y + (Math.floor(i / cols) - (rows - 1) / 2) * sp;
      if (!this.passable(Math.floor(px), Math.floor(py))) { px = x; py = y; }
      return [u, px, py];
    });
  }
  cmdMove(units, x, y, amove = false) {
    const key = 'm' + (++this.cmdSeq);
    for (const [u, px, py] of this.formation(units, x, y)) {
      this.releaseFarm(u);
      u.task = { t: amove ? 'amove' : 'move', x: px, y: py, key: key + '_' + u.id };
      u.buildQueue = [];
    }
  }
  cmdStop(units) { for (const u of units) { this.releaseFarm(u); u.task = null; u.path = null; u.goalKey = null; u.buildQueue = []; } }
  cmdAttack(units, tg) {
    for (const u of units) {
      if (u.def.onlyBuildings && tg.kind !== 'building') { continue; }
      this.releaseFarm(u);
      u.task = { t: 'attack', id: tg.id }; u.goalKey = null; u.buildQueue = [];
    }
  }
  cmdGather(units, r) {
    const vils = units.filter((u) => u.def.cls === 'villager');
    for (const u of vils) {
      this.releaseFarm(u);
      let target = r;
      if (r.kind === 'building' && r.type === 'farm' && !this.farmFree(r, u.id)) {
        target = this.findResourceNear(u.owner, 'food', r.x, r.y, 6, 'farm') || r;
      }
      u.task = { t: 'gather', id: target.id, resType: this.resType(target) };
      if (target.kind === 'building') target.farmer = this.farmFree(target, u.id) ? u.id : target.farmer;
      u.goalKey = null; u.buildQueue = [];
    }
    return vils.length;
  }
  cmdBuild(units, b) {
    for (const u of units) {
      if (u.def.cls !== 'villager') continue;
      this.releaseFarm(u);
      u.task = { t: 'build', id: b.id, repair: b.built }; u.goalKey = null; u.buildQueue = [];
    }
  }
  cmdDrop(units, b) {
    for (const u of units) {
      if (u.def.cls !== 'villager' || !u.carry.amt || !(b.def.drop || []).includes(u.carry.type)) continue;
      const prev = u.task && u.task.t === 'gather' ? u.task : null;
      if (prev) prev.returning = false;
      u.task = { t: 'drop', id: b.id, then: prev }; u.goalKey = null;
    }
  }
  deleteEntity(e) {
    if (e.dead) return;
    if (e.kind === 'building' && !e.built) {
      // refund part of foundation cost
      const p = this.players[e.owner];
      if (e.progress < 0.01) this.refund(p, e.def.cost);
    }
    this.kill(e, e.owner);
  }

  // ---------- victory ----------
  checkVictory() {
    if (this.winner >= 0) return;
    for (const p of this.players) {
      if (!p.alive) continue;
      let units = 0, vils = 0, mil = 0, core = 0, other = 0;
      for (const u of this.units) if (u.owner === p.id && !u.dead) { units++; if (u.def.cls === 'villager') vils++; else mil++; }
      for (const b of this.buildings) {
        if (b.owner !== p.id || b.dead) continue;
        if ((b.type === 'towncenter' || b.type === 'castle')) core++;
        else if (b.type !== 'farm' && b.type !== 'house') other++;
      }
      const noEconomy = vils === 0 && core === 0;
      const canTrainMil = other > 0 && (p.res.food + p.res.gold + p.res.wood) > 150;
      if ((units === 0 && core === 0 && other === 0) || (noEconomy && mil === 0 && !canTrainMil)) {
        p.alive = false;
      }
    }
    const alive = this.players.filter((p) => p.alive);
    if (alive.length <= 1) {
      this.winner = alive.length ? alive[0].id : -2;
      this.emit('gameover', { winner: this.winner });
    }
  }
}

function d0life(d) { return d.kind === 'rubble' ? 60 : d.kind === 'stump' ? 240 : 8; }
