// Mobile units: villagers, soldiers, siege, monks and animals.

const TAU = Math.PI * 2;
export const MELEE_REACH = 0.3;
export const WORK_REACH = 0.42;
const TASK_OF = { wood: 'wood', gold: 'gold', stone: 'stone', farm: 'farm', berries: 'forage', hunt: 'hunt', sheep: 'hunt', fish: 'fish' };

export class Unit {
  constructor(game, def, owner, x, y) {
    this.id = game.nextId++;
    this.game = game;
    this.kind = 'unit';
    this.def = def;
    this.type = def.id;
    this.owner = owner;
    this.x = x; this.y = y; this.px = x; this.py = y;
    this.facing = game.rng.next() * TAU;
    this.st = game.unitStats(owner, def);
    this.maxHp = this.st.hp;
    this.hp = this.maxHp;
    this.alive = true;
    this.order = null;
    this.queue = [];
    this.goal = null; this.path = null; this.pathI = 0; this.needPath = false;
    this.stuckT = 0; this.stuckN = 0; this.lastPX = x; this.lastPY = y;
    this.anim = 'idle'; this.animT = 0;
    this.moving = false;
    this.carry = 0; this.carryType = null; this.task = null;
    this.attackCd = 0; this.strikeAt = -1; this.strikeTarget = null;
    this.garrisonedIn = null;
    this.scanT = game.rng.next() * 0.5;
    this.lastHitBy = null; this.lastHitT = -99;
    this.variant = game.rng.int(0, 1023);
    this.faith = 100; this.convertT = 0;
    this.created = game.time;
  }

  get radius() { return this.def.radius; }
  get isVillager() { return this.def.id === 'villager'; }
  get isAnimal() { return !!this.def.isAnimal; }
  get isMilitary() { return !this.def.isAnimal && this.def.id !== 'villager' && !this.def.isMonk; }
  speed() { return this.order && this.order.wander ? this.st.speed * 0.45 : this.st.speed; }
  capacity() { return this.def.capacity * this.game.players[this.owner].eco.capacity; }

  refreshStats() {
    const st = this.game.unitStats(this.owner, this.def);
    const oldMax = this.maxHp;
    this.st = st;
    this.maxHp = st.hp;
    if (this.maxHp > oldMax) this.hp += this.maxHp - oldMax;
    if (this.hp > this.maxHp) this.hp = this.maxHp;
  }
  setDef(def) {
    const frac = this.hp / this.maxHp;
    this.def = def; this.type = def.id;
    this.st = this.game.unitStats(this.owner, def);
    this.maxHp = this.st.hp;
    this.hp = Math.max(1, frac * this.maxHp);
  }

  // Edge-to-edge distance to another entity.
  distTo(e) {
    if (e.kind === 'unit') return Math.max(0, Math.hypot(e.x - this.x, e.y - this.y) - e.def.radius - this.def.radius);
    if (e.size === 0) return Math.max(0, Math.hypot(e.x - this.x, e.y - this.y) - 0.25 - this.def.radius);
    const dx = Math.max(e.tx - this.x, 0, this.x - (e.tx + e.size));
    const dy = Math.max(e.ty - this.y, 0, this.y - (e.ty + e.size));
    return Math.max(0, Math.hypot(dx, dy) - this.def.radius);
  }

  // ------------------------------------------------------------------ orders
  command(order, queued = false) {
    const o = this.order;
    const endless = o && (o.type === 'gather' || o.type === 'return' || o.wander || (o.type === 'attack' && o.auto));
    if (queued && o && !endless) { this.queue.push(order); return; }
    this.queue.length = 0;
    this.setOrder(order);
  }
  setOrder(order) {
    const prev = this.order;
    if (prev && prev.target && prev.target.farmer === this) {
      const keep = order && (order.target === prev.target || (order.resume && order.resume.target === prev.target));
      if (!keep) prev.target.farmer = null;
    }
    this.order = order;
    this.goal = null; this.path = null; this.needPath = false;
    this.strikeAt = -1; this.convertT = 0;
    if (order) order.t0 = this.game.time;
  }
  finishOrder() {
    const o = this.order;
    if (o && o.resume) { this.setOrder(o.resume); return; }
    if (this.queue.length) this.setOrder(this.queue.shift());
    else this.setOrder(null);
  }
  stop() { this.queue.length = 0; this.bellResume = null; this.setOrder(null); this.stopMoving(); }

  // ---------------------------------------------------------------- movement
  goTo(x, y, tol = 0.15) {
    const g = this.goal;
    if (g && !g.ent && Math.abs(g.x - x) < 0.01 && Math.abs(g.y - y) < 0.01) return;
    this.goal = { x, y, tol };
    this.needPath = true; this.path = null; this.stuckN = 0; this.stuckT = 0;
  }
  goToEnt(e, reach) {
    const g = this.goal;
    if (g && g.ent === e && g.reach === reach) {
      if (e.kind === 'unit' && this.game.time >= g.nextRepath && Math.hypot(e.x - g.ex, e.y - g.ey) > 0.8) {
        g.ex = e.x; g.ey = e.y; g.nextRepath = this.game.time + 0.5; this.needPath = true;
      }
      return;
    }
    this.goal = { ent: e, reach, ex: e.x, ey: e.y, nextRepath: this.game.time + 0.5 };
    this.needPath = true; this.path = null; this.stuckN = 0; this.stuckT = 0;
  }
  stopMoving() { this.goal = null; this.path = null; this.needPath = false; }

  goalReached() {
    const g = this.goal;
    if (g.ent) return this.distTo(g.ent) <= g.reach;
    return Math.hypot(g.x - this.x, g.y - this.y) <= g.tol;
  }

  approachFrom(px, py, e, reach) {
    const off = this.def.radius + Math.max(0.05, reach * 0.5);
    if (e.kind === 'unit' || e.size === 0) {
      const dx = px - e.x, dy = py - e.y, d = Math.hypot(dx, dy) || 1;
      const r = (e.kind === 'unit' ? e.def.radius : 0.25) + off;
      return { x: e.x + (dx / d) * r, y: e.y + (dy / d) * r };
    }
    const x0 = e.tx, y0 = e.ty, x1 = e.tx + e.size, y1 = e.ty + e.size;
    const cx = Math.min(Math.max(px, x0), x1), cy = Math.min(Math.max(py, y0), y1);
    const dx = px - cx, dy = py - cy, d = Math.hypot(dx, dy);
    if (d < 1e-4) return { x: px, y: py };
    return { x: cx + (dx / d) * off, y: cy + (dy / d) * off };
  }

  computePath() {
    this.needPath = false;
    const g = this.goal, game = this.game, pf = game.path, map = game.map;
    const sx = Math.floor(this.x), sy = Math.floor(this.y);
    this.pathI = 0;
    if (!g.ent) {
      let tx = g.x, ty = g.y;
      if (!map.walkableFor(tx, ty, this.owner)) {
        const w = map.nearestWalkable(tx, ty, 12);
        if (!w) { this.path = []; return; }
        tx = w.x + 0.5; ty = w.y + 0.5; g.x = tx; g.y = ty;
      }
      game.pathCost += 4;
      if (pf.lineWalkable(this.x, this.y, tx, ty, 0.2, this.owner)) { this.path = [{ x: tx, y: ty }]; return; }
      const res = pf.find(sx, sy, { x0: Math.floor(tx), y0: Math.floor(ty), x1: Math.floor(tx), y1: Math.floor(ty) }, 0, game.pathMaxNodes, this.owner);
      if (!res) { this.path = []; return; }
      game.pathCost += res.cost;
      const pts = pf.smooth(this.x, this.y, res.tiles, this.owner);
      if (res.complete) { if (pts.length) pts[pts.length - 1] = { x: tx, y: ty }; else pts.push({ x: tx, y: ty }); }
      else if (!pts.length) { this.path = []; return; }
      this.path = pts;
      return;
    }
    const e = g.ent;
    const ap = this.approachFrom(this.x, this.y, e, g.reach);
    game.pathCost += 4;
    if (Math.hypot(ap.x - this.x, ap.y - this.y) < 4 && pf.lineWalkable(this.x, this.y, ap.x, ap.y, 0.12, this.owner)) {
      this.path = [ap];
      return;
    }
    let rect;
    if (e.kind === 'unit' || e.size === 0) { const ex = Math.floor(e.x), ey = Math.floor(e.y); rect = { x0: ex, y0: ey, x1: ex, y1: ey }; }
    else rect = { x0: e.tx, y0: e.ty, x1: e.tx + e.size - 1, y1: e.ty + e.size - 1 };
    const range = Math.max(1.0, g.reach + this.def.radius + 0.25);
    const res = pf.find(sx, sy, rect, range, game.pathMaxNodes, this.owner);
    if (!res) { this.path = []; return; }
    game.pathCost += res.cost;
    const pts = pf.smooth(this.x, this.y, res.tiles, this.owner);
    if (res.complete) {
      const last = pts.length ? pts[pts.length - 1] : { x: this.x, y: this.y };
      const a2 = this.approachFrom(last.x, last.y, e, g.reach);
      if (Math.hypot(a2.x - last.x, a2.y - last.y) < 1.6) pts.push(a2);
    }
    this.path = pts;
  }

  tryMove(nx, ny) {
    const map = this.game.map, o = this.owner;
    if (!map.walkableFor(this.x, this.y, o) || map.walkableFor(nx, ny, o)) { this.x = nx; this.y = ny; return true; }
    if (map.walkableFor(nx, this.y, o)) { this.x = nx; return true; }
    if (map.walkableFor(this.x, ny, o)) { this.y = ny; return true; }
    return false;
  }

  // One tick of movement toward the current goal. Returns 'arrived' | 'moving' | 'waiting' | 'failed'.
  moveStep(dt) {
    const g = this.goal;
    if (!g) return 'arrived';
    if (g.ent && !g.ent.alive) { this.stopMoving(); return 'failed'; }
    if (this.goalReached()) { this.stopMoving(); return 'arrived'; }
    if (this.needPath) {
      if (this.game.pathCost > this.game.pathBudget) return 'waiting';
      this.computePath();
    }
    if (!this.path || this.pathI >= this.path.length) {
      if (g.ent && g.ent.kind === 'unit' && this.stuckN < 6) { this.needPath = true; this.stuckN++; return 'moving'; }
      this.stopMoving();
      return 'failed';
    }
    const wp = this.path[this.pathI];
    const step = this.speed() * dt;
    const dx = wp.x - this.x, dy = wp.y - this.y, d = Math.hypot(dx, dy);
    if (d > 1e-6) this.facing = Math.atan2(dy, dx);
    if (d <= step) { this.tryMove(wp.x, wp.y); this.pathI++; }
    else this.tryMove(this.x + (dx / d) * step, this.y + (dy / d) * step);
    this.moving = true;
    this.stuckT += dt;
    if (this.stuckT >= 1.0) {
      const moved = Math.hypot(this.x - this.lastPX, this.y - this.lastPY);
      this.lastPX = this.x; this.lastPY = this.y; this.stuckT = 0;
      if (moved < 0.12 * this.speed()) {
        if (++this.stuckN > 5) { this.stopMoving(); return 'failed'; }
        this.needPath = true;
      }
    }
    return 'moving';
  }

  faceEnt(e) {
    let tx = e.x, ty = e.y;
    if (e.kind === 'building') { tx = Math.min(Math.max(this.x, e.tx), e.tx + e.size); ty = Math.min(Math.max(this.y, e.ty), e.ty + e.size); }
    const dx = tx - this.x, dy = ty - this.y;
    if (dx * dx + dy * dy > 1e-6) this.facing = Math.atan2(dy, dx);
  }
  setAnim(a) { if (this.anim !== a) { this.anim = a; this.animT = this.game.time; } }

  // ------------------------------------------------------------------ update
  update(dt) {
    if (this.garrisonedIn) return;
    this.px = this.x; this.py = this.y;
    if (this.attackCd > 0) this.attackCd -= dt;
    if (this.def.isMonk && this.faith < 100) this.faith = Math.min(100, this.faith + (dt * 100) / (45 * this.st.reload));
    this.moving = false;
    if (this.strikeAt >= 0 && this.game.time >= this.strikeAt) this.resolveStrike();
    const o = this.order;
    if (!o) this.doIdle(dt);
    else {
      switch (o.type) {
        case 'move': this.doMove(dt); break;
        case 'attack': this.doAttack(dt); break;
        case 'gather': this.doGather(dt); break;
        case 'return': this.doReturn(dt); break;
        case 'build': this.doBuild(dt); break;
        case 'repair': this.doRepair(dt); break;
        case 'garrison': this.doGarrison(dt); break;
        case 'heal': this.doHeal(dt); break;
        case 'convert': this.doConvert(dt); break;
        case 'flee': this.doFlee(dt); break;
        default: this.finishOrder();
      }
    }
    if (this.moving) this.setAnim('walk');
    else if (this.anim === 'walk') this.setAnim('idle');
    else if (this.anim === 'work' && (!this.order || (this.order.type !== 'gather' && this.order.type !== 'build' && this.order.type !== 'repair'))) this.setAnim('idle');
  }

  doIdle(dt) {
    const d = this.def;
    if (d.isAnimal) { this.animalIdle(dt); return; }
    if ((this.scanT -= dt) > 0) return;
    this.scanT = 0.4 + this.game.rng.next() * 0.3;
    if (this.isVillager) return;
    if (d.isMonk) {
      const t = this.game.findHealTarget(this, this.st.los);
      if (t) this.setOrder({ type: 'heal', target: t, auto: true });
      return;
    }
    if (this.st.atk <= 0) return;
    const t = this.game.findTarget(this, this.st.los + (this.st.range > 0 ? 1 : 0), d.classes.includes('siege'));
    if (t) this.setOrder({ type: 'attack', target: t, auto: true, hx: this.x, hy: this.y });
  }

  animalIdle(dt) {
    const d = this.def, g = this.game;
    if ((this.scanT -= dt) > 0) return;
    this.scanT = 3 + g.rng.next() * 7;
    if ((this.owner === -1 && d.herdable) || d.flees) {
      if (g.rng.next() < 0.45) {
        const a = g.rng.next() * TAU, r = 0.6 + g.rng.next() * 1.4;
        const nx = this.x + Math.cos(a) * r, ny = this.y + Math.sin(a) * r;
        if (g.map.walkableF(nx, ny)) this.setOrder({ type: 'move', x: nx, y: ny, wander: true });
      }
    }
  }

  doMove(dt) {
    const o = this.order;
    if (!this.goal) this.goTo(o.x, o.y, o.tol ?? 0.15);
    if (o.attackMove) {
      if ((this.scanT -= dt) <= 0) {
        this.scanT = 0.3 + this.game.rng.next() * 0.15;
        const t = this.game.findTarget(this, this.st.los + 1, true);
        if (t) { this.setOrder({ type: 'attack', target: t, auto: true, resume: o, hx: this.x, hy: this.y }); return; }
      }
    }
    const r = this.moveStep(dt);
    if (r === 'arrived' || r === 'failed') {
      if (r === 'failed' && o.attackMove) {
        const w = this.game.findBlockingStructure(this);
        if (w) { this.setOrder({ type: 'attack', target: w, resume: o }); return; }
      }
      this.finishOrder();
    }
  }

  attackReach(t) {
    if (this.isVillager && t.kind === 'unit' && t.def.isAnimal && !t.def.herdable) return 3;
    if (this.st.range > 0) return this.st.range;
    return t.kind === 'unit' ? MELEE_REACH : 0.36;
  }

  // Close in on / strike a target. Returns 'inrange' | 'moving' | 'failed' | 'tooclose'.
  engage(t, dt) {
    const reach = this.attackReach(t), d = this.distTo(t);
    if (d <= reach) {
      if (d < (this.st.minRange || 0)) return 'tooclose';
      this.stopMoving();
      this.faceEnt(t);
      if (this.attackCd <= 0 && this.strikeAt < 0) this.beginStrike(t);
      return 'inrange';
    }
    const want = reach > 1 ? reach - 0.4 : reach * 0.75;
    this.goToEnt(t, want);
    const r = this.moveStep(dt);
    return r === 'failed' ? 'failed' : 'moving';
  }

  beginStrike(t) {
    this.attackCd = this.st.reload;
    this.anim = 'attack'; this.animT = this.game.time;
    this.strikeAt = this.game.time + Math.min(this.st.reload, 1.4) * this.def.attackDelay;
    this.strikeTarget = t;
  }

  resolveStrike() {
    const t = this.strikeTarget;
    this.strikeAt = -1; this.strikeTarget = null;
    if (!t || !t.alive || t.garrisonedIn) return;
    const reach = this.attackReach(t);
    if (this.distTo(t) > reach + 0.8) return;
    if (reach >= 1) this.game.launchProjectile(this, t);
    else this.game.meleeHit(this, t);
  }

  doAttack(dt) {
    const o = this.order, t = o.target, g = this.game;
    if (!g.isValidAttackTarget(this, t)) { this.finishOrder(); return; }
    if (t.kind === 'unit' && !g.isVisibleTo(this.owner, t)) { this.finishOrder(); return; }
    if (o.auto && o.hx !== undefined && Math.hypot(this.x - o.hx, this.y - o.hy) > 11 && this.distTo(t) > this.attackReach(t)) {
      if (o.resume) this.finishOrder();
      else this.setOrder({ type: 'move', x: o.hx, y: o.hy });
      return;
    }
    const r = this.engage(t, dt);
    if (r === 'tooclose') {
      // Siege with minimum range backs off
      const dx = this.x - t.x, dy = this.y - t.y, d = Math.hypot(dx, dy) || 1;
      const nx = this.x + (dx / d) * 1.5, ny = this.y + (dy / d) * 1.5;
      if (g.map.walkableF(nx, ny)) { this.goTo(nx, ny, 0.3); this.moveStep(dt); } else this.finishOrder();
    } else if (r === 'failed') {
      const w = g.findBlockingStructure(this, t);
      if (w && w !== t) { this.setOrder({ type: 'attack', target: w, resume: o.resume || (o.auto ? null : o) }); return; }
      this.finishOrder();
    }
  }

  // --------------------------------------------------------------- economy
  findNextResource(o, exclude) {
    const g = this.game;
    const kind = o.kind;
    if (!kind) return false;
    if (exclude) { (o.excl || (o.excl = [])).push(exclude); if (o.excl.length > 6) o.excl.shift(); }
    const skip = (e) => e === exclude || (o.excl && o.excl.includes(e));
    if (kind === 'farm') {
      const f = g.findFreeFarm(this.owner, o.lx ?? this.x, o.ly ?? this.y, exclude);
      if (f && !skip(f)) { o.target = f; o.spot = null; return true; }
      return false;
    }
    let cx = o.lx ?? this.x, cy = o.ly ?? this.y, radius = kind === 'wood' ? 12 : 9;
    const kinds = kind === 'hunt' || kind === 'sheep' ? ['hunt', 'sheep'] : [kind];
    if (kinds.length === 2) {
      // Only keep hunting close to a food drop-off, never chase herds across the map.
      const drop = g.nearestDropSite(this.owner, 'food', cx, cy);
      if (drop) { cx = drop.x; cy = drop.y; radius = 11; }
    }
    for (let tries = 0; tries < 3; tries++) {
      const r = g.findResourceNear(this.owner, kinds, cx, cy, radius, exclude, this);
      if (!r) return false;
      if (skip(r)) { exclude = r; continue; }
      o.target = r; o.spot = null; this.goal = null;
      return true;
    }
    return false;
  }

  doGather(dt) {
    const o = this.order, g = this.game;
    let t = o.target;
    if (!t || !t.alive) {
      if (t && t.kind === 'unit' && t.carcass && t.carcass.alive) { o.target = t = t.carcass; }
      else {
        this.stopMoving();
        if (this.findNextResource(o, t)) return;
        if (this.carry > 0) { this.setOrder({ type: 'return', resume: null }); return; }
        this.finishOrder();
        return;
      }
    }
    if (t.kind === 'unit') {
      if (!t.def.isAnimal) { this.finishOrder(); return; }
      if (t.def.herdable && t.owner >= 0 && t.owner !== this.owner) {
        // Someone else's sheep: let it go and look for our own food.
        this.stopMoving();
        if (!this.findNextResource(o, t)) this.finishOrder();
        return;
      }
      this.task = 'hunt';
      o.kind = t.def.carcassGather; o.lx = t.x; o.ly = t.y;
      if (this.carry > 0 && this.carryType !== 'food') this.carry = 0;
      const r = this.engage(t, dt);
      if (r === 'failed') {
        this.stopMoving();
        if (!this.findNextResource(o, t)) this.finishOrder();
      }
      return;
    }
    let kind, res;
    if (t.kind === 'building') {
      if (!t.def.isFarm || t.owner !== this.owner) { this.finishOrder(); return; }
      if (!t.complete) { this.setOrder({ type: 'build', target: t }); return; }
      if (t.farmer && t.farmer !== this && t.farmer.alive && t.farmer.order &&
        (t.farmer.order.target === t || (t.farmer.order.resume && t.farmer.order.resume.target === t))) {
        o.kind = 'farm';
        if (!this.findNextResource(o, t)) this.finishOrder();
        return;
      }
      t.farmer = this;
      kind = 'farm'; res = 'food';
    } else { kind = t.gatherKind; res = t.res; }
    o.kind = kind; o.lx = t.x; o.ly = t.y;
    if (this.carry > 0 && this.carryType !== res) this.carry = 0;
    this.carryType = res;
    this.task = TASK_OF[kind];
    const cap = this.capacity();
    if (this.carry >= cap - 1e-6) { this.setOrder({ type: 'return', resume: o }); return; }
    if (t.kind === 'building') {
      if (!o.spot) o.spot = { x: t.tx + 0.55 + g.rng.next() * (t.size - 1.1), y: t.ty + 0.55 + g.rng.next() * (t.size - 1.1) };
      if (Math.hypot(o.spot.x - this.x, o.spot.y - this.y) > 0.3) {
        this.goTo(o.spot.x, o.spot.y, 0.25);
        const r = this.moveStep(dt);
        if (r === 'failed') { this.finishOrder(); return; }
        if (r !== 'arrived') return;
      }
      this.stopMoving();
      if (o.faceAngle === undefined) o.faceAngle = (g.rng.int(0, 3) * Math.PI) / 2 + Math.PI / 4;
      this.facing = o.faceAngle;
    } else {
      if (this.distTo(t) > WORK_REACH) {
        this.goToEnt(t, WORK_REACH * 0.8);
        const r = this.moveStep(dt);
        if (r === 'failed') {
          this.stopMoving();
          if (!this.findNextResource(o, t)) this.finishOrder();
          return;
        }
        if (r !== 'arrived') return;
      }
      this.stopMoving();
      this.faceEnt(t);
    }
    this.setAnim('work');
    const pl = g.players[this.owner];
    const rate = this.def.gatherRates[kind] * pl.eco[kind] * (pl.gatherBonus || 1);
    const amt = Math.min(rate * dt, t.amount, cap - this.carry);
    t.amount -= amt;
    this.carry += amt;
    if (t.type === 'tree' && !t.felled) { t.felled = true; t.fellAngle = Math.atan2(t.y - this.y, t.x - this.x); }
    if (t.amount <= 1e-6) g.depleteResource(t, this);
  }

  doReturn(dt) {
    const o = this.order, g = this.game;
    if (this.carry <= 0.001 || !this.carryType) { this.carry = 0; this.finishOrder(); return; }
    let d = o.drop;
    if (!d || !d.alive || !d.complete || d.owner !== this.owner) {
      d = o.drop = g.nearestDropSite(this.owner, this.carryType, this.x, this.y);
      if (!d) { this.setAnim('idle'); o.waitT = (o.waitT || 0) + dt; if (o.waitT > 3) { o.resume = null; this.finishOrder(); } return; }
    }
    if (this.distTo(d) > WORK_REACH) {
      this.goToEnt(d, WORK_REACH * 0.8);
      const r = this.moveStep(dt);
      if (r === 'failed') { o.drop = null; o.fails = (o.fails || 0) + 1; if (o.fails > 3) { o.resume = null; this.finishOrder(); } }
      return;
    }
    g.deposit(this.owner, this.carryType, this.carry);
    this.carry = 0;
    this.finishOrder();
  }

  doBuild(dt) {
    const o = this.order, b = o.target;
    if (!b || !b.alive || b.owner !== this.owner) { this.afterBuild(null); return; }
    if (b.complete) { this.afterBuild(b); return; }
    if (this.distTo(b) > WORK_REACH) {
      this.goToEnt(b, WORK_REACH * 0.8);
      const r = this.moveStep(dt);
      if (r === 'failed') this.afterBuild(null, b);
      return;
    }
    this.stopMoving();
    this.faceEnt(b);
    this.task = 'build';
    this.setAnim('work');
    b.builders++;
  }

  afterBuild(b, failed = null) {
    const g = this.game;
    if (this.queue.length) { this.setOrder(this.queue.shift()); return; }
    if (b && b.alive && b.complete) {
      if (b.def.isFarm && (!b.farmer || !b.farmer.alive || b.farmer === this)) { this.setOrder({ type: 'gather', target: b }); return; }
      const drops = b.def.dropSite;
      if (drops.length && b.type !== 'townCenter') {
        const kinds = drops.includes('wood') ? ['wood'] : drops.includes('gold') ? ['gold', 'stone'] : ['berries', 'hunt', 'sheep', 'fish'];
        const r = g.findResourceNear(this.owner, kinds, b.x, b.y, 9, null, this);
        if (r) { this.setOrder({ type: 'gather', target: r }); return; }
        if (drops.includes('food')) { const f = g.findFreeFarm(this.owner, b.x, b.y); if (f) { this.setOrder({ type: 'gather', target: f }); return; } }
      }
    }
    const f = g.findFoundationNear(this.owner, this.x, this.y, 10, failed, this);
    if (f) { this.setOrder({ type: 'build', target: f }); return; }
    this.setOrder(null);
  }

  doRepair(dt) {
    const o = this.order, b = o.target, g = this.game;
    if (!b || !b.alive || b.owner !== this.owner || !b.complete || b.hp >= b.maxHp) { this.finishOrder(); return; }
    if (this.distTo(b) > WORK_REACH) {
      this.goToEnt(b, WORK_REACH * 0.8);
      if (this.moveStep(dt) === 'failed') this.finishOrder();
      return;
    }
    this.stopMoving(); this.faceEnt(b); this.task = 'build'; this.setAnim('work');
    const hpRate = Math.max(3, (b.maxHp / b.def.time) * 0.5) * g.players[this.owner].eco.buildSpeed;
    const gain = Math.min(hpRate * dt, b.maxHp - b.hp);
    if (!g.payRepair(this.owner, b, gain)) { this.finishOrder(); return; }
    b.hp += gain;
  }

  doGarrison(dt) {
    const o = this.order, b = o.target, g = this.game;
    if (!b || !b.alive || b.owner !== this.owner || !b.complete || !g.canGarrison(this, b)) {
      if (o.bell && this.bellResume) {
        const r = this.bellResume; this.bellResume = null;
        this.setOrder(r.type !== 'gather' || (r.target && r.target.alive) ? r : null);
      } else this.finishOrder();
      return;
    }
    if (this.distTo(b) > WORK_REACH) {
      this.goToEnt(b, WORK_REACH * 0.8);
      if (this.moveStep(dt) === 'failed') this.finishOrder();
      return;
    }
    g.garrison(this, b);
  }

  doHeal(dt) {
    const o = this.order, t = o.target;
    if (!t || !t.alive || t.owner !== this.owner || t.hp >= t.maxHp || t.garrisonedIn || t === this || t.def.classes.includes('siege')) { this.finishOrder(); return; }
    const reach = this.def.healRange;
    if (this.distTo(t) > reach) {
      if (o.auto && this.distTo(t) > this.st.los + 2) { this.finishOrder(); return; }
      this.goToEnt(t, reach * 0.8);
      if (this.moveStep(dt) === 'failed') this.finishOrder();
      return;
    }
    this.stopMoving(); this.faceEnt(t); this.setAnim('work');
    t.hp = Math.min(t.maxHp, t.hp + 2.5 * dt);
  }

  doConvert(dt) {
    const o = this.order, t = o.target, g = this.game;
    if (!t || !t.alive || t.kind !== 'unit' || t.owner === this.owner || t.owner < 0 || t.garrisonedIn || t.def.classes.includes('siege')) { this.finishOrder(); return; }
    if (!g.isVisibleTo(this.owner, t)) { this.finishOrder(); return; }
    const reach = this.st.range;
    if (this.distTo(t) > reach) {
      this.convertT = 0;
      this.goToEnt(t, reach - 0.5);
      if (this.moveStep(dt) === 'failed') this.finishOrder();
      return;
    }
    this.stopMoving(); this.faceEnt(t);
    if (this.faith < 100) { this.setAnim('idle'); return; }
    this.setAnim('attack');
    if (this.convertT === 0) g.emit({ type: 'converting', unit: this, target: t, x: this.x, y: this.y });
    this.convertT += dt;
    if (this.convertT >= 4 && (g.rng.next() < dt * 0.4 || this.convertT >= 10)) {
      g.convert(t, this.owner, this);
      this.faith = 0; this.convertT = 0;
      this.finishOrder();
    }
  }

  doFlee(dt) {
    const o = this.order;
    if (!this.goal) this.goTo(o.x, o.y, 0.3);
    const r = this.moveStep(dt);
    if (r === 'arrived' || r === 'failed' || this.game.time - o.t0 > 6) this.finishOrder();
  }

  fleeFrom(att, dist) {
    const g = this.game;
    const dx = this.x - att.x, dy = this.y - att.y, l = Math.hypot(dx, dy) || 1;
    for (let k = 0; k < 6; k++) {
      const a = Math.atan2(dy, dx) + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.5;
      const nx = this.x + Math.cos(a) * dist, ny = this.y + Math.sin(a) * dist;
      if (g.map.walkableF(nx, ny)) { this.setOrder({ type: 'flee', x: nx, y: ny }); return; }
    }
    void l;
  }

  onAttacked(att) {
    const d = this.def, g = this.game;
    if (!att || !att.alive || att.kind !== 'unit') {
      if (this.isMilitary && !this.order && att && att.alive && att.kind === 'building' && g.canAttack(this, att) && g.isEnemy(this.owner, att.owner)) {
        this.setOrder({ type: 'attack', target: att, auto: true, hx: this.x, hy: this.y });
      }
      return;
    }
    if (d.isAnimal) {
      if (d.flees) { if (!this.order || this.order.type !== 'flee') this.fleeFrom(att, 4.5); }
      else if (d.aggressiveWhenHit) { if (!this.order || this.order.type !== 'attack') this.setOrder({ type: 'attack', target: att }); }
      return;
    }
    if (att.owner === this.owner) return;
    if (this.isVillager || d.isMonk) {
      if (!this.order && !att.def.isAnimal) this.fleeFrom(att, 3);
      return;
    }
    const o = this.order;
    if (!o || o.wander || (o.type === 'attack' && o.auto && o.target.kind === 'building')) {
      if (g.canAttack(this, att)) this.setOrder({ type: 'attack', target: att, auto: true, hx: this.x, hy: this.y, resume: o && o.resume ? o.resume : null });
    }
  }
}
