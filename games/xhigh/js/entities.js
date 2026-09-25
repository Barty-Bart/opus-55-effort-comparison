// Units, buildings and resources: all per-entity simulation behaviour lives here.
import { UNITS, BUILDINGS, TECHS, LINES, GATHER_RATES, CARRY_BASE, GARRISON_ARROW_TC } from './config.js';
import { distToRect } from './util.js';
import { B_OBJECT, B_BUILDING } from './map.js';

let NEXT_ID = 1;

class Entity {
  constructor(game, kind, type, owner) {
    this.id = NEXT_ID++;
    this.game = game;
    this.kind = kind;
    this.type = type;
    this.owner = owner;
    this.dead = false;
    this.hp = 1;
    this.maxHp = 1;
    this.lastHitT = -99;
  }
  get player() { return this.game.players[this.owner]; }
}

// Tile rect [x0, y0, x1, y1) of an entity that occupies tiles, else null.
export function entRect(e) {
  if (e.kind === 'building') return [e.tx, e.ty, e.tx + e.size, e.ty + e.size];
  if (e.kind === 'resource' && e.blocks) return [e.tx, e.ty, e.tx + 1, e.ty + 1];
  return null;
}
export function goalRect(e) {
  if (e.kind === 'building') {
    return { x0: e.tx, y0: e.ty, x1: e.tx + e.size - 1, y1: e.ty + e.size - 1, adj: !e.def.walkable };
  }
  if (e.kind === 'resource' && e.blocks) return { x0: e.tx, y0: e.ty, x1: e.tx, y1: e.ty, adj: true };
  const x = Math.floor(e.x), y = Math.floor(e.y);
  return { x0: x, y0: y, x1: x, y1: y, adj: false };
}
export function nearestPointOn(e, x, y) {
  const r = entRect(e);
  if (!r) return { x: e.x, y: e.y };
  return { x: Math.min(Math.max(x, r[0]), r[2]), y: Math.min(Math.max(y, r[1]), r[3]) };
}

// ===========================================================================
// Resource
// ===========================================================================
const RES_INFO = {
  tree: { resType: 'wood', gather: 'wood', blocks: true, name: 'Tree' },
  gold: { resType: 'gold', gather: 'gold', blocks: true, name: 'Gold Mine' },
  stone: { resType: 'stone', gather: 'stone', blocks: true, name: 'Stone Mine' },
  berry: { resType: 'food', gather: 'forage', blocks: true, name: 'Forage Bush' },
  carcass: { resType: 'food', gather: 'hunt', blocks: false, name: 'Carcass' },
};

export class Resource extends Entity {
  constructor(game, type, x, y, amount, opts = {}) {
    super(game, 'resource', type, 0);
    const info = RES_INFO[type];
    this.resType = info.resType;
    this.gatherKind = info.gather;
    this.blocks = info.blocks;
    this.name = info.name;
    this.amount = amount;
    this.maxAmount = amount;
    this.variant = opts.variant || 0;
    this.pine = !!opts.pine;
    this.felled = false;
    this.fellDir = Math.random() < 0.5 ? 1 : -1;
    this.animal = opts.animal || null;
    this.facing = opts.facing || 1;
    this.born = game.time;
    if (this.blocks) {
      this.tx = x; this.ty = y; this.x = x + 0.5; this.y = y + 0.5;
      game.map.setArea(x, y, 1, 1, B_OBJECT, this);
    } else {
      this.x = x; this.y = y; this.tx = Math.floor(x); this.ty = Math.floor(y);
    }
    if (type === 'carcass') {
      this.gatherKind = opts.animal === 'sheep' ? 'sheep' : 'hunt';
      this.name = opts.animal === 'sheep' ? 'Sheep' : 'Deer';
    }
    this.seen = false;
  }
  deplete() {
    if (this.dead) return;
    this.dead = true;
    if (this.blocks) this.game.map.clearArea(this.tx, this.ty, 1, 1, this);
    this.game.onResourceDepleted(this);
  }
}

// ===========================================================================
// Unit
// ===========================================================================
export class Unit extends Entity {
  constructor(game, type, owner, x, y) {
    super(game, 'unit', type, owner);
    this.def = UNITS[type];
    this.x = x; this.y = y;
    this.radius = this.def.radius || 0.2;
    this.facing = Math.random() < 0.5 ? 1 : -1;
    this.dirX = 1; this.dirY = 0;
    this.maxHp = 0;
    this.statsVer = -1;
    this.refreshStats();
    this.hp = this.maxHp;
    this.order = null;
    this.queue = [];
    this.path = null; this.pathI = 0; this.navKey = null; this.navWait = 0; this.navFails = 0;
    this.pathPartial = false; this.repathT = 0;
    this.anim = 'idle'; this.animT = Math.random() * 10; this.atkCd = 0; this.swingT = 0; this.pendingHit = null;
    this.carry = 0; this.carryType = null; this.task = null;
    this.idleT = 0; this.scanT = Math.random() * 0.5;
    this.stuckT = 0; this.stuckX = x; this.stuckY = y;
    this.garrisonedIn = null;
    this.homeX = x; this.homeY = y;
    this.animal = this.def.animal || null;
    this.female = this.id % 3 === 0;
    this.workSndT = Math.random() * 1.5;
    this.faith = 1;
    this.anchorX = x; this.anchorY = y;
    this.wanderT = 2 + Math.random() * 6;
    this.moved = false;
    this.bellOrder = undefined;
  }

  get isVillager() { return this.def.tc === 'villager'; }
  get isMilitary() { return !this.animal && this.def.tc !== 'villager' && this.def.tc !== 'monk'; }

  refreshStats() {
    const d = this.def, p = this.game.players[this.owner], m = p.mods, tc = d.tc;
    const oldMax = this.maxHp;
    this.maxHp = d.hp + (tc === 'villager' ? m.villHp : 0);
    if (oldMax > 0 && this.maxHp !== oldMax) this.hp = (this.hp * this.maxHp) / oldMax;
    this.atk = d.atk + (m.atk[tc] || 0);
    const arm = m.arm[tc] || [0, 0];
    this.armorM = d.armor[0] + arm[0] + (tc === 'villager' ? m.villArm[0] : 0);
    this.armorP = d.armor[1] + arm[1] + (tc === 'villager' ? m.villArm[1] : 0);
    const rb = tc === 'archer' ? m.range.archer || 0 : 0;
    this.range = d.range > 0 ? d.range + rb : 0;
    this.los = d.los + rb;
    this.speed = d.speed * (tc === 'villager' ? m.villSpeed : 1);
    this.capacity = CARRY_BASE + m.carry;
    this.statsVer = p.statsVer;
  }

  distTo(e) {
    if (e.kind === 'unit') return Math.max(0, Math.hypot(e.x - this.x, e.y - this.y) - e.radius - this.radius);
    const r = entRect(e);
    if (r) return Math.max(0, distToRect(this.x, this.y, r[0], r[1], r[2], r[3]) - this.radius);
    return Math.max(0, Math.hypot(e.x - this.x, e.y - this.y) - this.radius);
  }
  isAdjacent(e) {
    const r = entRect(e);
    if (!r) return false;
    const tx = Math.floor(this.x), ty = Math.floor(this.y);
    return tx >= r[0] - 1 && tx <= r[2] && ty >= r[1] - 1 && ty <= r[3];
  }
  faceTo(x, y) {
    const sx = (x - this.x) - (y - this.y);
    if (Math.abs(sx) > 0.02) this.facing = sx > 0 ? 1 : -1;
    const d = Math.hypot(x - this.x, y - this.y);
    if (d > 1e-3) { this.dirX = (x - this.x) / d; this.dirY = (y - this.y) / d; }
  }

  // ---------------------------------------------------------------- orders
  setOrder(o, queued = false) {
    if (this.dead) return;
    if (queued && this.order) { this.queue.push(o); return; }
    this.queue.length = 0;
    this.order = o;
    this.path = null; this.navKey = null; this.navFails = 0; this.navWait = 0;
    this.pendingHit = null;
    if (o && o.type !== 'gather' && o.type !== 'build') this.task = null;
    this.bellOrder = undefined;
  }
  finishOrder() {
    this.order = this.queue.length ? this.queue.shift() : null;
    this.path = null; this.navKey = null; this.navFails = 0;
    if (!this.order) { this.homeX = this.x; this.homeY = this.y; this.idleT = 0; }
  }
  stop() { this.setOrder(null); this.homeX = this.x; this.homeY = this.y; }

  // Targets this unit recently failed to reach are ignored by auto-targeting for a while.
  skipTarget(t) { (this.skip || (this.skip = new Map())).set(t.id, this.game.time + 15); }
  skipping(t) { return !!this.skip && (this.skip.get(t.id) || 0) > this.game.time; }

  canAttack(t) {
    if (!t || t.dead) return false;
    if (t.kind === 'resource') return false;
    if (t.kind === 'unit') {
      if (t.garrisonedIn) return false;
      if (this.def.onlyBuildings) return false;
      if (t.animal) return t.animal === 'hunt' && this.isMilitary && this.def.atk > 0;
    }
    if (t.owner === this.owner) return false;
    if (t.owner === 0 && t.kind !== 'unit') return false;
    if (this.def.atk <= 0) return false;
    return true;
  }

  // ---------------------------------------------------------------- movement
  step(dt) {
    if (!this.path) return 'none';
    const map = this.game.map;
    let remaining = this.speed * dt;
    while (remaining > 1e-6) {
      const wp = this.path[this.pathI];
      const dx = wp.x - this.x, dy = wp.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d < 1e-4) {
        this.pathI++;
        if (this.pathI >= this.path.length) { this.path = null; return 'arrived'; }
        continue;
      }
      const ux = dx / d, uy = dy / d;
      this.dirX = ux; this.dirY = uy;
      const sx = ux - uy;
      if (Math.abs(sx) > 0.08) this.facing = sx > 0 ? 1 : -1;
      if (d <= remaining) {
        if (!map.passableF(wp.x, wp.y) && map.passableF(this.x, this.y)) { this.path = null; return 'blocked'; }
        this.x = wp.x; this.y = wp.y; remaining -= d;
        this.moved = true;
        this.pathI++;
        if (this.pathI >= this.path.length) { this.path = null; return 'arrived'; }
      } else {
        const nx = this.x + ux * remaining, ny = this.y + uy * remaining;
        if (map.passableF(nx, ny) || !map.passableF(this.x, this.y)) { this.x = nx; this.y = ny; this.moved = true; }
        else {
          // slide along the obstacle
          if (map.passableF(nx, this.y)) { this.x = nx; this.moved = true; }
          else if (map.passableF(this.x, ny)) { this.y = ny; this.moved = true; }
          else { this.path = null; return 'blocked'; }
        }
        remaining = 0;
      }
    }
    return 'moving';
  }

  checkStuck(dt) {
    this.stuckT += dt;
    if (this.stuckT > 1.2) {
      const moved = Math.hypot(this.x - this.stuckX, this.y - this.stuckY);
      this.stuckT = 0; this.stuckX = this.x; this.stuckY = this.y;
      if (moved < 0.15 && this.path) { this.path = null; this.navFails++; return true; }
    }
    return false;
  }

  buildPath(goal, fx, fy) {
    const game = this.game;
    if (!game.usePathBudget()) return false;
    const pf = game.pf;
    let res = pf.find(Math.floor(this.x), Math.floor(this.y), goal);
    if (!res.reached && res.expanded < 12 && game.rescueUnit(this)) res = pf.find(Math.floor(this.x), Math.floor(this.y), goal);
    let pts = pf.toPoints(res.tiles);
    if (res.reached && fx !== undefined && !goal.adj) {
      if (pts.length) pts[pts.length - 1] = { x: fx, y: fy };
      else pts = [{ x: fx, y: fy }];
    }
    this.pathPartial = !res.reached;
    if (!pts.length) { this.path = null; return true; }
    this.path = pf.smooth(this.x, this.y, pts, this.radius * 0.9);
    this.pathI = 0;
    return true;
  }

  // Walk toward a point. Returns 'arrived' | 'moving' | 'wait' | 'fail'.
  navToPoint(x, y, dt) {
    const key = 'p' + x.toFixed(2) + ',' + y.toFixed(2);
    if (this.navKey !== key) { this.navKey = key; this.path = null; this.navFails = 0; this.navWait = 0; }
    if (Math.hypot(x - this.x, y - this.y) < 0.08) { this.path = null; return 'arrived'; }
    if (!this.path) {
      if (this.navWait > 0) { this.navWait -= dt; return 'wait'; }
      if (this.navFails > 6) return 'fail';
      const pf = this.game.pf;
      if (Math.hypot(x - this.x, y - this.y) < 6 && this.game.map.passableF(x, y) && pf.wideClear(this.x, this.y, x, y, this.radius * 0.9)) {
        this.path = [{ x, y }]; this.pathI = 0; this.pathPartial = false;
      } else {
        if (!this.buildPath({ x0: Math.floor(x), y0: Math.floor(y), x1: Math.floor(x), y1: Math.floor(y) }, x, y)) return 'wait';
        if (!this.path) return this.pathPartial ? 'fail' : 'arrived';
      }
      this.stuckT = 0; this.stuckX = this.x; this.stuckY = this.y;
    }
    const r = this.step(dt);
    if (r === 'arrived') return this.pathPartial ? 'fail' : 'arrived';
    if (r === 'blocked') { this.navFails++; this.navWait = 0.15; return 'moving'; }
    this.checkStuck(dt);
    return 'moving';
  }

  // Walk until within `range` of entity (or adjacent for tile objects). Returns 'arrived' | 'moving' | 'wait' | 'fail'.
  navToEnt(e, range, dt) {
    const key = 'e' + e.id;
    if (this.navKey !== key) { this.navKey = key; this.path = null; this.navFails = 0; this.navWait = 0; }
    const d = this.distTo(e);
    if (d <= range) { this.path = null; return 'arrived'; }
    const tileObj = e.kind === 'building' || (e.kind === 'resource' && e.blocks);
    if (tileObj && range <= 0.5 && this.isAdjacent(e) && !(e.kind === 'building' && e.def.walkable)) {
      // nudge closer for looks, but count as arrived
      this.path = null;
      const p = nearestPointOn(e, this.x, this.y);
      const dd = Math.hypot(p.x - this.x, p.y - this.y);
      if (dd > this.radius + 0.12) {
        const s = Math.min(this.speed * dt, dd - this.radius - 0.1);
        const nx = this.x + ((p.x - this.x) / dd) * s, ny = this.y + ((p.y - this.y) / dd) * s;
        if (this.game.map.passableF(nx, ny)) { this.x = nx; this.y = ny; this.faceTo(p.x, p.y); this.moved = true; return 'moving'; }
      }
      return 'arrived';
    }
    if (e.kind === 'unit' && this.path) {
      this.repathT -= dt;
      if (this.repathT <= 0) this.path = null;
    }
    if (!this.path) {
      if (this.navWait > 0) { this.navWait -= dt; return 'wait'; }
      if (this.navFails > 8) return 'fail';
      const pf = this.game.pf;
      const p = nearestPointOn(e, this.x, this.y);
      const straight = Math.hypot(p.x - this.x, p.y - this.y);
      let direct = false;
      if (straight < 7) {
        // aim slightly short of the target surface so the corridor check does not hit the object itself
        const back = tileObj ? Math.min(0.45, straight) : 0;
        const ax = p.x + ((this.x - p.x) / (straight || 1)) * back, ay = p.y + ((this.y - p.y) / (straight || 1)) * back;
        if (this.game.map.passableF(ax, ay) && pf.wideClear(this.x, this.y, ax, ay, this.radius * 0.9)) {
          this.path = [{ x: ax, y: ay }]; this.pathI = 0; this.pathPartial = false; direct = true;
        }
      }
      if (!direct) {
        if (!this.buildPath(goalRect(e))) return 'wait';
        if (!this.path) {
          if (this.pathPartial) { this.navFails++; this.navWait = 0.8; return 'fail'; }
          // we are on a goal tile already; walk straight at it
          this.path = [{ x: p.x, y: p.y }]; this.pathI = 0;
        }
      }
      this.repathT = e.kind === 'unit' ? 0.5 + Math.random() * 0.3 : 99;
      this.stuckT = 0; this.stuckX = this.x; this.stuckY = this.y;
    }
    const r = this.step(dt);
    if (r === 'arrived') {
      if (this.pathPartial) { this.navFails++; this.navWait = 0.8; return 'fail'; }
      if (this.distTo(e) > range && !(tileObj && this.isAdjacent(e))) this.navFails++;
    } else if (r === 'blocked') { this.navFails++; this.navWait = 0.1; }
    this.checkStuck(dt);
    return 'moving';
  }

  // ---------------------------------------------------------------- update
  update(dt) {
    if (this.statsVer !== this.game.players[this.owner].statsVer) this.refreshStats();
    this.animT += dt;
    this.moved = false;
    this.anim = 'idle';
    if (this.atkCd > 0) this.atkCd -= dt;
    if (this.swingT > 0) this.swingT -= dt;
    if (this.faith < 1) this.faith = Math.min(1, this.faith + dt / 30);
    if (this.pendingHit) {
      this.pendingHit.t -= dt;
      if (this.pendingHit.t <= 0) { const ph = this.pendingHit; this.pendingHit = null; this.resolveHit(ph); }
    }
    const o = this.order;
    if (!o) { this.updateIdle(dt); }
    else {
      switch (o.type) {
        case 'move': this.updateMove(dt, o); break;
        case 'attackMove': this.updateAttackMove(dt, o); break;
        case 'attack': this.updateAttack(dt, o); break;
        case 'gather': this.updateGather(dt, o); break;
        case 'build': this.updateBuild(dt, o); break;
        case 'garrison': this.updateGarrison(dt, o); break;
        case 'dropoff': this.updateDropoffOrder(dt, o); break;
        case 'heal': this.updateHeal(dt, o); break;
        case 'convert': this.updateConvert(dt, o); break;
        case 'flee': this.updateFlee(dt, o); break;
        default: this.finishOrder();
      }
    }
    if (this.swingT > 0 && !this.moved) this.anim = 'attack';
    else if (this.moved) this.anim = 'walk';
  }

  updateIdle(dt) {
    this.anim = 'idle';
    this.idleT += dt;
    if (this.animal) return this.updateAnimalIdle(dt);
    this.scanT -= dt;
    if (this.scanT > 0) return;
    this.scanT = 0.45 + Math.random() * 0.3;
    const tc = this.def.tc;
    if (tc === 'villager') return;
    if (tc === 'monk') {
      const t = this.game.findHealTarget(this, this.los);
      if (t) this.order = { type: 'heal', target: t, auto: true };
      return;
    }
    if (this.stance === 'passive') return;
    const t = this.game.findTarget(this, this.def.onlyBuildings ? this.los + 1 : this.los, { buildings: !!this.def.onlyBuildings || this.def.tc === 'siege' });
    if (t) { this.order = { type: 'attack', target: t, auto: true }; this.path = null; this.navKey = null; }
  }

  updateAnimalIdle(dt) {
    this.wanderT -= dt;
    if (this.wanderT > 0) return;
    this.wanderT = 4 + Math.random() * 8;
    const r = this.animal === 'hunt' ? 3 : 1.2;
    const tx = this.anchorX + (Math.random() * 2 - 1) * r, ty = this.anchorY + (Math.random() * 2 - 1) * r;
    if (this.game.map.passableF(tx, ty)) this.order = { type: 'move', x: tx, y: ty, wander: true };
  }

  updateMove(dt, o) {
    const r = this.navToPoint(o.x, o.y, dt);
    if (r === 'arrived' || r === 'fail') this.finishOrder();
  }

  updateAttackMove(dt, o) {
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 0.4 + Math.random() * 0.2;
      const t = this.game.findTarget(this, this.los + 1, { buildings: true });
      if (t) {
        this.queue.unshift(o);
        this.order = { type: 'attack', target: t, fromAM: true };
        this.path = null; this.navKey = null;
        return;
      }
    }
    const r = this.navToPoint(o.x, o.y, dt);
    if (r === 'arrived' || r === 'fail') this.finishOrder();
  }

  inAttackRange(t) {
    const d = this.distTo(t);
    if (this.range > 0) return d <= this.range + 0.05;
    if (d <= 0.3) return true;
    return t.kind !== 'unit' && this.isAdjacent(t) && d <= 0.75;
  }

  updateAttack(dt, o) {
    const t = o.target;
    if (!this.canAttack(t)) { this.finishOrder(); return; }
    if (o.auto) {
      const leash = Math.hypot(this.x - this.homeX, this.y - this.homeY);
      if (leash > this.los + 6) {
        this.order = { type: 'move', x: this.homeX, y: this.homeY };
        this.path = null; this.navKey = null;
        return;
      }
    }
    if (this.def.minRange && this.distTo(t) < this.def.minRange) {
      // too close for a catapult: back off a little
      const dx = this.x - t.x, dy = this.y - t.y, d = Math.hypot(dx, dy) || 1;
      const bx = this.x + (dx / d) * 2, by = this.y + (dy / d) * 2;
      if (this.game.map.passableF(bx, by)) { this.navToPoint(bx, by, dt); return; }
      this.finishOrder(); return;
    }
    if (this.inAttackRange(t)) {
      this.path = null;
      this.faceTo(t.x, t.y);
      if (this.atkCd <= 0) this.beginAttack(t);
      if (this.swingT <= 0) this.anim = 'idle';
      return;
    }
    const range = this.range > 0 ? this.range : 0.3;
    const r = this.navToEnt(t, range, dt);
    if (r === 'fail') {
      // Unreachable (walled off?) - hit whatever enemy structure is in the way.
      const wall = this.game.findBlockingBuilding(this, t);
      if (wall && wall !== t && !this.skipping(wall)) { this.skipTarget(t); this.queue.unshift(o); this.order = { type: 'attack', target: wall, fromAM: true }; this.path = null; this.navKey = null; }
      else { this.skipTarget(t); this.finishOrder(); }
    }
  }

  beginAttack(t) {
    this.atkCd = this.def.rof;
    this.swingT = Math.min(0.7, this.def.rof * 0.5);
    this.animT = 0;
    this.pendingHit = { target: t, t: this.range > 0 ? 0.3 : 0.28 };
  }

  resolveHit(ph) {
    const t = ph.target;
    if (!t || t.dead) return;
    if (ph.hunt) {
      if (t.kind === 'unit' && t.animal) {
        if (ph.ranged) this.game.fireProjectile(this, t, { kind: 'javelin', atk: 6, atkType: 'pierce', accuracy: 1 });
        else this.game.dealDamage(t, this, 7, 'melee', null);
      }
      return;
    }
    if (!this.canAttack(t)) return;
    if (this.def.projectile) {
      this.game.fireProjectile(this, t, {
        kind: this.def.projectile, atk: this.atk, atkType: this.def.atkType, bonus: this.def.bonus,
        accuracy: this.def.accuracy || 1, splash: this.def.splash || 0,
      });
    } else if (this.distTo(t) <= Math.max(this.range, 0.3) + 0.6 || this.isAdjacent(t)) {
      this.game.dealDamage(t, this, this.atk, this.def.atkType, this.def.bonus);
      this.game.emit('meleeHit', { attacker: this, target: t });
    }
  }

  onDamaged(attacker) {
    if (!attacker || attacker.dead || attacker.owner === this.owner) return;
    if (this.animal) {
      if (this.animal === 'hunt') this.fleeFrom(attacker, 5);
      return;
    }
    const tc = this.def.tc;
    if (tc === 'villager' || tc === 'monk') {
      if (!this.order && attacker.kind === 'unit') this.fleeFrom(attacker, 4);
      return;
    }
    if (this.stance === 'passive') return;
    if ((!this.order || (this.order.type === 'attack' && this.order.auto && this.order.target.kind === 'building')) && this.canAttack(attacker)) {
      if (attacker.kind === 'building' && this.range === 0 && attacker.def.attack && attacker.type !== 'watchtower' && this.def.tc !== 'siege') return;
      this.order = { type: 'attack', target: attacker, auto: true };
      this.path = null; this.navKey = null;
    }
  }

  fleeFrom(src, dist) {
    const dx = this.x - src.x, dy = this.y - src.y, d = Math.hypot(dx, dy) || 1;
    let tx = this.x + (dx / d) * dist, ty = this.y + (dy / d) * dist;
    const f = this.game.pf.nearestFree(tx, ty, 4);
    if (!f) return;
    this.order = { type: 'flee', x: f.x + 0.5, y: f.y + 0.5, t: 4 };
    this.path = null; this.navKey = null;
  }
  updateFlee(dt, o) {
    o.t -= dt;
    const r = this.navToPoint(o.x, o.y, dt);
    if (r === 'arrived' || r === 'fail' || o.t <= 0) {
      this.finishOrder();
      if (this.animal) { this.anchorX = this.x; this.anchorY = this.y; }
    }
  }

  // ---------------------------------------------------------------- gathering
  gatherTarget(kind, lx, ly) {
    return this.game.findResource(this.owner, kind, lx, ly, 10, this);
  }

  updateGather(dt, o) {
    if (o.phase === 'drop') return this.updateDrop(dt, o);
    const game = this.game;
    let t = o.target;
    if (!this.validGatherTarget(t)) {
      if (t && t.kind === 'unit' && t.dead && t.carcass && !t.carcass.dead) t = t.carcass;
      else t = this.gatherTarget(o.kind, o.lx ?? this.x, o.ly ?? this.y);
      if (!t) {
        if (this.carry > 0) { o.phase = 'drop'; o.final = true; o.drop = null; return; }
        this.task = null;
        this.finishOrder();
        return;
      }
      o.target = t; o.spot = null;
      this.path = null; this.navKey = null;
    }
    o.lx = t.x; o.ly = t.y;
    // live animal: slaughter / hunt it first
    if (t.kind === 'unit') {
      this.task = t.animal === 'herd' ? 'sheep' : 'hunt';
      const ranged = t.animal === 'hunt';
      const reach = ranged ? 3 : 0.3;
      if (this.distTo(t) <= reach) {
        this.faceTo(t.x, t.y);
        if (t.animal === 'herd' && t.owner !== this.owner) t.owner = this.owner;
        if (this.atkCd <= 0) {
          this.atkCd = 1.2; this.swingT = 0.6; this.animT = 0;
          this.pendingHit = { target: t, t: 0.3, hunt: true, ranged };
        }
        if (this.swingT <= 0) this.anim = 'idle';
      } else if (this.navToEnt(t, reach, dt) === 'fail') {
        this.skipTarget(t);
        (t.unreach || (t.unreach = {}))[this.owner] = game.time + 60;
        o.target = null;
      }
      return;
    }
    const resType = t.resType;
    if (this.carryType !== resType) { this.carry = 0; this.carryType = resType; }
    this.task = t.kind === 'building' ? 'farm' : t.gatherKind;
    if (t.kind === 'building') {
      // farm: walk onto a spot on the field
      if (t.farmer && t.farmer !== this && !t.farmer.dead && t.farmer.order && t.farmer.order.target === t) {
        const other = game.findResource(this.owner, 'farm', t.x, t.y, 12, this);
        if (other && other !== t) { o.target = other; o.spot = null; return; }
        this.finishOrder(); return;
      }
      t.farmer = this;
      if (!o.spot) {
        const s = t.size;
        o.spot = { x: t.tx + 0.5 + Math.random() * (s - 1), y: t.ty + 0.5 + Math.random() * (s - 1) };
      }
      const fr = this.navToPoint(o.spot.x, o.spot.y, dt);
      if (fr === 'fail') {
        (t.unreach || (t.unreach = {}))[this.owner] = game.time + 60;
        t.farmer = null; o.target = null; o.spot = null;
        return;
      }
      if (fr !== 'arrived') return;
      if (Math.random() < dt * 0.25) o.spot = { x: t.tx + 0.5 + Math.random() * (t.size - 1), y: t.ty + 0.5 + Math.random() * (t.size - 1) };
    } else {
      const reach = t.blocks ? 0.3 : 0.35;
      const r = this.navToEnt(t, reach, dt);
      if (r === 'fail') {
        (t.unreach || (t.unreach = {}))[this.owner] = game.time + 120;
        const alt = this.gatherTarget(o.kind, t.x, t.y);
        if (alt && alt !== t && !o.triedAlt) { o.target = alt; o.triedAlt = true; this.navKey = null; this.path = null; }
        else this.finishOrder();
        return;
      }
      if (r !== 'arrived') return;
      this.faceTo(t.x, t.y);
    }
    // work
    this.anim = 'work';
    if (t.kind === 'resource' && t.type === 'tree' && !t.felled) { t.felled = true; t.fellDir = this.facing; }
    const p = this.player;
    const kind = t.kind === 'building' ? 'farm' : t.gatherKind;
    const g1 = p.mods.gather[kind] || 1, g2 = kind === resType ? 1 : p.mods.gather[resType] || 1;
    const rate = GATHER_RATES[kind] * g1 * g2 * p.gatherBonus;
    const amt = Math.min(rate * dt, this.capacity - this.carry, t.amount);
    t.amount -= amt;
    this.carry += amt;
    this.workSndT -= dt;
    if (this.workSndT <= 0) { this.workSndT = 1.1 + Math.random() * 0.5; game.emit('work', { unit: this, task: this.task }); }
    if (t.amount <= 1e-6) {
      if (t.kind === 'building') game.farmDepleted(t);
      else t.deplete();
    }
    if (this.carry >= this.capacity - 1e-6) { o.phase = 'drop'; o.drop = null; this.path = null; this.navKey = null; }
  }

  validGatherTarget(t) {
    if (!t || t.dead) return false;
    if (t.kind === 'resource') return t.amount > 0;
    if (t.kind === 'building') return t.type === 'farm' && t.complete && t.owner === this.owner && t.amount > 0;
    if (t.kind === 'unit') return !!t.animal && (t.animal === 'hunt' || t.owner === this.owner || t.owner === 0);
    return false;
  }

  updateDrop(dt, o) {
    let ds = o.drop;
    if (!ds || ds.dead || !ds.complete || ds.owner !== this.owner) {
      ds = this.game.findDropSite(this.owner, this.carryType, this.x, this.y);
      if (!ds) { this.anim = 'idle'; return; }
      o.drop = ds; this.path = null; this.navKey = null;
    }
    const r = this.navToEnt(ds, 0.3, dt);
    if (r === 'arrived') {
      this.deposit();
      if (o.final) { this.finishOrder(); return; }
      o.phase = 'go'; this.path = null; this.navKey = null;
    } else if (r === 'fail') {
      o.drop = null; o.dropFails = (o.dropFails || 0) + 1;
      this.navFails = 0; this.navWait = 0.4 + Math.random() * 0.4;
      if (o.dropFails > 12) this.finishOrder();
    }
  }
  deposit() {
    if (this.carry > 0 && this.carryType) {
      const p = this.player;
      const amt = this.carry;
      p.res[this.carryType] += amt;
      p.stats.gathered[this.carryType] += amt;
      this.game.emit('deposit', { unit: this, res: this.carryType, amount: amt });
    }
    this.carry = 0;
  }
  updateDropoffOrder(dt, o) {
    if (this.carry <= 0) { this.finishOrder(); return; }
    let ds = o.target;
    if (!ds || ds.dead || !ds.complete || !(ds.def.drop || []).includes(this.carryType)) {
      ds = this.game.findDropSite(this.owner, this.carryType, this.x, this.y);
      if (!ds) { this.finishOrder(); return; }
      o.target = ds;
    }
    const r = this.navToEnt(ds, 0.3, dt);
    if (r === 'arrived') {
      this.deposit();
      if (o.resume && this.game.findResource(this.owner, o.resume.kind, o.resume.lx, o.resume.ly, 8, this)) {
        this.order = { type: 'gather', target: null, kind: o.resume.kind, lx: o.resume.lx, ly: o.resume.ly, phase: 'go' };
        this.path = null; this.navKey = null;
      } else this.finishOrder();
    } else if (r === 'fail') this.finishOrder();
  }

  // ---------------------------------------------------------------- building
  updateBuild(dt, o) {
    const b = o.target;
    if (!b || b.dead || b.owner !== this.owner) { this.afterBuild(b); return; }
    if (b.complete && b.hp >= b.maxHp - 0.01) { this.afterBuild(b); return; }
    this.task = 'build';
    let r;
    if (b.def.walkable) {
      if (!o.spot) o.spot = { x: b.tx + 0.3 + Math.random() * (b.size - 0.6), y: b.ty + b.size - 0.2 + Math.random() * 0.1 };
      r = this.navToPoint(o.spot.x, o.spot.y, dt);
      if (r === 'fail') r = 'arrived';
    } else {
      r = this.navToEnt(b, 0.3, dt);
    }
    if (r === 'fail') { this.finishOrder(); return; }
    if (r !== 'arrived') return;
    this.faceTo(b.x, b.y);
    this.anim = 'work';
    if (!b.complete) b.addBuildWork(dt);
    else b.repairWork(dt);
    this.workSndT -= dt;
    if (this.workSndT <= 0) { this.workSndT = 0.9 + Math.random() * 0.4; this.game.emit('work', { unit: this, task: 'build' }); }
  }

  afterBuild(b) {
    const game = this.game;
    this.task = null;
    if (this.queue.length) { this.finishOrder(); return; }
    // keep building nearby foundations first
    const next = game.findFoundation(this.owner, this.x, this.y, 9);
    if (next) { this.order = { type: 'build', target: next }; this.path = null; this.navKey = null; return; }
    if (b && !b.dead && b.complete) {
      if (b.type === 'farm') {
        if (!b.farmer || b.farmer.dead || b.farmer === this || !(b.farmer.order && b.farmer.order.target === b)) {
          this.order = { type: 'gather', target: b, kind: 'farm', phase: 'go' }; this.path = null; this.navKey = null; return;
        }
      }
      const drops = b.def.drop;
      if (drops && drops.length < 4) {
        let best = null, bd = 1e9;
        for (const res of drops) {
          const kind = res === 'food' ? 'forage' : res;
          const t = game.findResource(this.owner, kind, b.x, b.y, 10, this);
          if (t) { const d = Math.hypot(t.x - b.x, t.y - b.y); if (d < bd) { bd = d; best = { t, kind }; } }
        }
        if (!best && drops.includes('food')) {
          const t = game.findResource(this.owner, 'farm', b.x, b.y, 10, this);
          if (t) best = { t, kind: 'farm' };
        }
        if (best) { this.order = { type: 'gather', target: best.t, kind: best.kind, phase: 'go' }; this.path = null; this.navKey = null; return; }
      }
    }
    this.finishOrder();
  }

  // ---------------------------------------------------------------- garrison
  updateGarrison(dt, o) {
    const b = o.target;
    if (!b || b.dead || !b.complete || b.owner !== this.owner || !b.def.garrison || b.garrison.length >= b.def.garrison) {
      if (this.bellOrder !== undefined) { const bo = this.bellOrder; this.bellOrder = undefined; this.order = bo; this.path = null; this.navKey = null; return; }
      this.finishOrder(); return;
    }
    const r = this.navToEnt(b, 0.4, dt);
    if (r === 'arrived') b.enter(this);
    else if (r === 'fail') this.finishOrder();
  }

  // ---------------------------------------------------------------- monks
  updateHeal(dt, o) {
    const t = o.target;
    if (!t || t.dead || t.garrisonedIn || t.owner !== this.owner || t.hp >= t.maxHp || t.def.tc === 'siege') { this.finishOrder(); return; }
    if (o.auto && Math.hypot(this.x - this.homeX, this.y - this.homeY) > this.los + 4) { this.finishOrder(); return; }
    if (this.distTo(t) <= 4) {
      this.path = null; this.faceTo(t.x, t.y); this.anim = 'attack'; this.swingT = 0.2;
      t.hp = Math.min(t.maxHp, t.hp + 1.6 * dt);
      o.fx = (o.fx || 0) - dt;
      if (o.fx <= 0) { o.fx = 0.5; this.game.emit('heal', { unit: this, target: t }); }
    } else if (this.navToEnt(t, 4, dt) === 'fail') this.finishOrder();
  }
  updateConvert(dt, o) {
    const t = o.target;
    if (!t || t.dead || t.garrisonedIn || t.owner === this.owner || t.owner === 0 || t.kind !== 'unit' || t.def.tc === 'monk' || t.def.tc === 'siege' || t.animal) { this.finishOrder(); return; }
    if (this.faith < 1) {
      this.anim = 'idle';
      if (this.distTo(t) > this.range && this.navToEnt(t, this.range, dt) === 'fail') this.finishOrder();
      return;
    }
    if (this.distTo(t) <= this.range) {
      this.path = null; this.faceTo(t.x, t.y); this.anim = 'attack'; this.swingT = 0.2;
      if (o.need === undefined) { o.need = 4 + Math.random() * 6; o.t = 0; this.game.emit('convertStart', { unit: this, target: t }); }
      o.t += dt;
      t.convertGlow = this.game.time;
      if (o.t >= o.need) {
        this.faith = 0;
        this.game.convertUnit(t, this.owner, this);
        this.finishOrder();
      }
    } else {
      o.need = undefined;
      if (this.navToEnt(t, this.range, dt) === 'fail') this.finishOrder();
    }
  }
}

// ===========================================================================
// Building
// ===========================================================================
export class Building extends Entity {
  constructor(game, type, owner, tx, ty, complete = false) {
    super(game, 'building', type, owner);
    this.def = BUILDINGS[type];
    this.size = this.def.size;
    this.tx = tx; this.ty = ty;
    this.x = tx + this.size / 2; this.y = ty + this.size / 2;
    this.maxHp = this.def.hp;
    this.complete = complete;
    this.progress = complete ? 1 : 0;
    this.hp = complete ? this.maxHp : 1;
    this.queue = [];
    this.qT = 0;
    this.rally = null;
    this.garrison = [];
    this.atkCd = 1 + Math.random();
    this.builders = 0; this.buildersNext = 0;
    this.food = 0; this.farmer = null;
    this.seenBy = {};
    this.variant = Math.floor(Math.random() * 1000);
    this.bornT = game.time;
    this.housedNotified = false;
    this.wonderT = null;
    if (!this.def.walkable) game.map.setArea(tx, ty, this.size, this.size, B_BUILDING, this);
    else {
      for (let j = ty; j < ty + this.size; j++) for (let i = tx; i < tx + this.size; i++) game.map.obj[j * game.map.N + i] = this;
    }
    if (complete) this.onComplete(true);
  }

  // farms behave like a resource for gathering
  get resType() { return 'food'; }
  get amount() { return this.food; }
  set amount(v) { this.food = v; }
  get gatherKind() { return 'farm'; }

  addBuildWork(dt) {
    this.buildersNext++;
    const n = Math.max(1, this.builders);
    const rate = 3 / (n + 2) / this.def.time;
    const dp = rate * dt;
    this.progress = Math.min(1, this.progress + dp);
    this.hp = Math.min(this.maxHp, this.hp + this.maxHp * dp);
    if (this.progress >= 1 && !this.complete) {
      this.complete = true;
      this.onComplete(false);
    }
  }
  repairWork(dt) {
    this.buildersNext++;
    const n = Math.max(1, this.builders);
    const perSec = Math.max(8, this.maxHp / this.def.time) * 0.5;
    this.hp = Math.min(this.maxHp, this.hp + perSec * (3 / (n + 2)) * dt);
  }

  onComplete(initial) {
    const game = this.game;
    if (this.type === 'farm') this.food = this.player.mods.farmFood;
    if (this.type === 'wonder') this.wonderT = game.wonderTime;
    game.onBuildingComplete(this, initial);
  }

  enter(u) {
    if (this.garrison.length >= (this.def.garrison || 0)) return false;
    u.garrisonedIn = this;
    u.path = null;
    u.order = null;
    u.queue.length = 0;
    u.x = this.x; u.y = this.y;
    u.selected = false;
    const si = this.game.selection.indexOf(u);
    if (si >= 0) this.game.selection.splice(si, 1);
    this.garrison.push(u);
    this.game.emit('garrison', { unit: u, building: this });
    return true;
  }
  ungarrison() {
    const units = this.garrison.splice(0);
    for (const u of units) {
      u.garrisonedIn = null;
      const sp = this.spawnPoint(this.rally ? this.rally.x : this.tx + this.size + 1, this.rally ? this.rally.y : this.ty + this.size + 1);
      u.x = sp.x; u.y = sp.y;
      u.homeX = u.x; u.homeY = u.y;
      if (u.bellOrder !== undefined) { u.order = u.bellOrder; u.bellOrder = undefined; }
      else if (this.rally) u.setOrder({ type: 'move', x: this.rally.x + (Math.random() - 0.5), y: this.rally.y + (Math.random() - 0.5) });
    }
    return units;
  }

  spawnPoint(towardX, towardY) {
    const map = this.game.map;
    const x0 = this.tx, y0 = this.ty, s = this.size;
    for (let r = 1; r <= 6; r++) {
      let best = null, bd = 1e9;
      for (let j = y0 - r; j < y0 + s + r; j++) for (let i = x0 - r; i < x0 + s + r; i++) {
        if (i > x0 - r && i < x0 + s + r - 1 && j > y0 - r && j < y0 + s + r - 1) continue;
        if (!map.passable(i, j)) continue;
        const d = Math.hypot(i + 0.5 - towardX, j + 0.5 - towardY);
        if (d < bd) { bd = d; best = { x: i + 0.5 + (Math.random() - 0.5) * 0.3, y: j + 0.5 + (Math.random() - 0.5) * 0.3 }; }
      }
      if (best) return best;
    }
    return { x: this.x, y: this.ty + s + 0.5 };
  }

  // ------------------------------------------------ production & research
  currentLineType(line) { return LINES[line][this.player.lineTier[line] || 0]; }

  canTrain(line) {
    const p = this.player;
    return this.complete && p.age >= (this.game.lineAge(line));
  }

  train(line, count = 1) {
    const p = this.player, game = this.game;
    let n = 0;
    for (let i = 0; i < count; i++) {
      if (this.queue.length >= 15) break;
      const type = this.currentLineType(line);
      const cost = UNITS[type].cost;
      if (!p.canAfford(cost)) { if (n === 0) game.notifyPlayer(p, 'Not enough resources', 'warn', { cost }); break; }
      p.pay(cost);
      this.queue.push({ kind: 'unit', line, cost: { ...cost }, time: UNITS[type].time });
      n++;
    }
    return n;
  }

  research(id) {
    const p = this.player, game = this.game;
    const t = TECHS[id];
    if (!game.techAvailable(p, id)) return false;
    if (this.queue.length >= 15) return false;
    const busyAge = t.ageUp && p.ageResearching;
    if (busyAge) return false;
    if (!p.canAfford(t.cost)) { game.notifyPlayer(p, 'Not enough resources', 'warn', { cost: t.cost }); return false; }
    p.pay(t.cost);
    p.researching.add(id);
    if (t.ageUp) p.ageResearching = true;
    this.queue.push({ kind: 'tech', id, cost: { ...t.cost }, time: t.time });
    return true;
  }

  cancel(i) {
    const it = this.queue[i];
    if (!it) return;
    this.queue.splice(i, 1);
    if (i === 0) this.qT = 0;
    const p = this.player;
    p.refund(it.cost);
    if (it.kind === 'tech') {
      p.researching.delete(it.id);
      if (TECHS[it.id].ageUp) p.ageResearching = false;
    }
  }

  update(dt) {
    this.builders = this.buildersNext;
    this.buildersNext = 0;
    if (!this.complete) return;
    const game = this.game, p = this.player;
    // queue
    const it = this.queue[0];
    if (it) {
      if (it.kind === 'unit') {
        const type = this.currentLineType(it.line);
        const popNeed = UNITS[type].pop === 0 ? 0 : 1;
        if (p.pop + popNeed > p.popCap) {
          it.housed = true;
          if (!this.housedNotified) { this.housedNotified = true; game.onHoused(p, this); }
        } else {
          it.housed = false; this.housedNotified = false;
          this.qT += dt * (p.trainMult || 1);
          if (this.qT >= it.time) {
            this.qT = 0; this.queue.shift();
            this.spawnUnit(type);
          }
        }
      } else {
        this.qT += dt * (p.trainMult || 1);
        if (this.qT >= it.time) {
          this.qT = 0; this.queue.shift();
          game.completeTech(p, it.id, this);
        }
      }
    }
    // arrows
    const atk = this.def.attack;
    if (atk) {
      this.atkCd -= dt;
      if (this.atkCd <= 0) {
        const range = atk.range + p.mods.bldRange;
        const t = game.findTargetForBuilding(this, range);
        if (t) {
          let arrows = atk.arrows;
          for (const u of this.garrison) if (GARRISON_ARROW_TC.includes(u.def.tc)) arrows++;
          arrows = Math.min(arrows, this.type === 'castle' ? 24 : 16);
          for (let i = 0; i < arrows; i++) {
            let tgt = t;
            if (i > 0 && arrows > 2 && Math.random() < 0.4) tgt = game.findTargetForBuilding(this, range, true) || t;
            game.fireProjectile(this, tgt, { kind: 'arrow', atk: atk.atk + p.mods.bldAtk, atkType: 'pierce', accuracy: 0.9, delay: i * 0.08 });
          }
          this.atkCd = atk.rof;
        } else this.atkCd = 0.4;
      }
    }
    // garrison heals
    if (this.garrison.length) for (const u of this.garrison) u.hp = Math.min(u.maxHp, u.hp + dt * 0.5);
  }

  spawnUnit(type) {
    const game = this.game, p = this.player;
    const tx = this.rally ? this.rally.x : this.tx + this.size + 2, ty = this.rally ? this.rally.y : this.ty + this.size + 2;
    const sp = this.spawnPoint(tx, ty);
    const u = game.spawnUnit(type, this.owner, sp.x, sp.y);
    if (UNITS[type].tc === 'villager') p.stats.villagersTrained++;
    else p.stats.militaryTrained++;
    if (this.rally) {
      const rt = this.rally.target;
      if (rt && !rt.dead && u.isVillager && rt.kind === 'building' && !rt.complete && rt.owner === u.owner) {
        u.setOrder({ type: 'build', target: rt });
      } else if (rt && !rt.dead && u.isVillager && (rt.kind === 'resource' || (rt.kind === 'building' && rt.type === 'farm' && rt.owner === u.owner))) {
        u.setOrder({ type: 'gather', target: rt, kind: rt.kind === 'building' ? 'farm' : rt.gatherKind, phase: 'go' });
      } else if (rt && !rt.dead && rt.kind === 'unit' && rt.animal && u.isVillager) {
        u.setOrder({ type: 'gather', target: rt, kind: rt.animal === 'herd' ? 'sheep' : 'hunt', phase: 'go' });
      } else {
        u.setOrder({ type: 'move', x: this.rally.x + (Math.random() - 0.5) * 0.8, y: this.rally.y + (Math.random() - 0.5) * 0.8 });
      }
    }
    game.emit('trained', { unit: u, building: this });
    return u;
  }
}
