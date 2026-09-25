'use strict';
// ---------- Computer opponent ----------
const AI_LEVELS = {
  easy: { vils: 24, gather: 0.9, train: 0.9, firstAttack: 960, wave: 6, waveGrow: 2, maxAge: 2, think: 1.2, feudalVils: 16, castleVils: 24, imperialVils: 99, towers: 0, milShare: 0.35 },
  normal: { vils: 36, gather: 1.12, train: 1.0, firstAttack: 690, wave: 7, waveGrow: 3, maxAge: 3, think: 0.8, feudalVils: 19, castleVils: 26, imperialVils: 33, towers: 1, milShare: 0.5 },
  hard: { vils: 48, gather: 1.35, train: 1.15, firstAttack: 560, wave: 8, waveGrow: 4, maxAge: 3, think: 0.5, feudalVils: 20, castleVils: 27, imperialVils: 34, towers: 2, milShare: 0.6 },
};
const AI_TECHS = ['loom', 'wheelbarrow', 'double_bit_axe', 'horse_collar', 'gold_mining', 'forging', 'fletching', 'scale_mail', 'padded_armor', 'man_at_arms',
  'bow_saw', 'heavy_plow', 'crossbowman', 'scale_barding', 'pikeman', 'light_cavalry', 'long_swordsman', 'iron_casting', 'chain_mail', 'bodkin_arrow',
  'leather_armor', 'chain_barding', 'bloodlines', 'hand_cart', 'gold_shaft', 'elite_skirmisher', 'arbalester', 'champion', 'cavalier', 'stone_mining'];
const ECO_TECHS = new Set(['loom', 'wheelbarrow', 'double_bit_axe', 'horse_collar', 'gold_mining', 'bow_saw', 'heavy_plow', 'hand_cart', 'gold_shaft', 'stone_mining']);

class AI {
  constructor(pid, diff) {
    this.pid = pid; this.p = PL(pid); this.D = AI_LEVELS[diff]; this.diff = diff;
    this.p.gatherMul = this.D.gather; this.p.trainMul = this.D.train;
    this.t = 1; this.jobs = new Map();
    this.attacking = false; this.waveSize = this.D.wave; this.wave = []; this.waveStart = 0; this.waveT = 0; this.lastWaveEnd = 0;
    this.threat = null; this.threatT = -99; this.belled = false; this.base = null; this.builtTowers = 0;
    this.placeFail = {};
  }
  update(dt) { this.t -= dt; this.waveT -= dt; if (this.t > 0) return; this.t = this.D.think; try { this.think(); } catch (e) { console.error('AI error', e); } }

  mine(fn) { return G.units.filter(u => !u.dead && u.owner === this.pid && fn(u)); }
  blds(type, all) { return G.buildings.filter(b => !b.dead && b.owner === this.pid && (!type || b.type === type) && (all || b.built)); }
  has(type) { return G.buildings.some(b => !b.dead && b.owner === this.pid && b.type === type); }
  count(type) { return G.buildings.filter(b => !b.dead && b.owner === this.pid && b.type === type).length; }

  think() {
    const p = this.p;
    const tcs = this.blds('town_center');
    if (tcs.length) this.base = { x: tcs[0].x, y: tcs[0].y };
    if (!this.base) { const any = this.mine(() => true)[0]; if (!any) return; this.base = { x: any.x, y: any.y }; }
    const vils = this.mine(u => u.type === 'villager' && !u.garrisonedIn);
    const allVils = this.mine(u => u.type === 'villager');
    const military = this.mine(u => isMilitary(UNITS[u.type]) || u.type === 'monk');
    for (const id of this.jobs.keys()) if (!getEnt(id)) this.jobs.delete(id);

    this.defend(military, vils);
    this.herd(tcs[0], military);

    // --- villagers
    const tc = tcs[0];
    const nextAge = ['feudal_age', 'castle_age', 'imperial_age'][p.age];
    const ageGoal = [this.D.feudalVils, this.D.castleVils, this.D.imperialVils][p.age];
    let saving = nextAge && p.age < this.D.maxAge && allVils.length >= ageGoal && techState(p, nextAge).ok && p.age < 2;
    if (saving) { if (this.saveStart == null) this.saveStart = G.time; if (G.time - this.saveStart > 100) saving = false; } else this.saveStart = null;
    if (tc && !saving && allVils.length < this.D.vils && !tc.queue.some(q => q.kind === 'tech') && tc.queue.length < 2 && p.pop < p.popCap) queueUnit(tc, 'villager', true);
    if (!tc && allVils.length && this.canAffordKeep(BUILDINGS.town_center.cost) && p.age >= 2) this.build('town_center', this.base, 0, 8, vils);

    // --- houses
    const housing = G.buildings.filter(b => !b.dead && b.owner === this.pid && b.type === 'house' && !b.built).length;
    const margin = p.age >= 2 ? 8 : p.age >= 1 ? 5 : 3;
    if (p.popCap < 200 && p.popCap - p.pop <= margin && housing < (p.age >= 2 ? 2 : 1) && p.res.wood >= 25) this.build('house', this.base, 4, 13, vils);

    this.superviseFoundations(vils);
    this.buildOrder(vils, allVils.length, military.length);
    this.assignJobs(vils, allVils.length);
    this.research(allVils.length, military.length);
    this.trainArmy(allVils.length, military.length);
    this.attack(military);
    this.useMarket();
  }

  canAffordKeep(cost, keep) { const p = this.p; for (const r in cost) if (p.res[r] - (keep && keep[r] || 0) < cost[r]) return false; return true; }

  // resources to keep aside for the next age
  reserve() {
    const p = this.p, n = this.mine(u => u.type === 'villager').length;
    const next = ['feudal_age', 'castle_age', 'imperial_age'][p.age];
    if (!next || p.age >= this.D.maxAge) return {};
    const vilGoal = [this.D.feudalVils, this.D.castleVils, this.D.imperialVils][p.age];
    const st = techState(p, next);
    if (!st.ok && !st.busy) {
      const t = TECHS[next];
      const have = new Set(G.buildings.filter(b => !b.dead && b.owner === this.pid && t.reqB.indexOf(b.type) >= 0).map(b => b.type)).size;
      if (have < 2 && n >= vilGoal - 8) return { wood: 200 };
      return {};
    }
    if (n < vilGoal - 1 || !st.ok) return {};
    if (p.age === 1 && !this.firstWave && this.diff !== 'easy' && G.time < 1200 &&
      G.units.filter(u => !u.dead && u.owner === this.pid && isMilitary(UNITS[u.type])).length < this.waveSize) return {}; // raise a Feudal army first
    return TECHS[next].cost;
  }

  buildOrder(vils, nv, nm) {
    const p = this.p, age = p.age;
    const inProgress = G.buildings.filter(b => !b.dead && b.owner === this.pid && !b.built && b.type !== 'house' && b.type !== 'farm').length;
    if (inProgress >= (age >= 2 ? 3 : 2)) return;
    // drop sites near busy resources
    for (const rt of ['wood', 'gold', 'stone']) {
      const workers = vils.filter(v => this.jobs.get(v.id) === rt);
      if (workers.length < (rt === 'stone' ? 2 : rt === 'gold' ? 2 : 2)) continue;
      const camp = rt === 'wood' ? 'lumber_camp' : 'mining_camp';
      if (G.buildings.some(b => !b.dead && b.owner === this.pid && b.type === camp && !b.built)) continue;
      const far = workers.filter(v => { const t = v.order && getEnt(v.order.target); if (!t || t.kind !== 'resource') return false; const ds = nearestDropsite(this.pid, rt, t.x, t.y); return !ds || edgeDist(t, ds) > 5; });
      if (far.length >= Math.max(2, workers.length * 0.5) && p.res.wood >= 100 && this.count(camp) < 6) {
        const t = getEnt(far[0].order.target);
        if (this.buildNear(camp, t, vils.filter(v => this.jobs.get(v.id) === rt))) return;
      }
    }
    // mill next to berries
    if (nv >= 6 && !this.has('mill')) {
      const b = this.nearestRes('berries', this.base, 18);
      if (b && dist(b.x, b.y, this.base.x, this.base.y) > 5 && p.res.wood >= 100) { if (this.buildNear('mill', b, vils)) return; }
      else if (nv >= 14 && p.res.wood >= 100) { if (this.build('mill', this.base, 4, 10, vils)) return; }
    }
    if (nv >= (this.diff === 'easy' ? 15 : 12) && !this.has('barracks') && p.res.wood >= 175) { if (this.build('barracks', this.base, 6, 14, vils)) return; }
    if (age === 0 && nv >= this.D.feudalVils - 3) { // make sure two Dark age buildings exist
      const have = ['barracks', 'mill', 'lumber_camp', 'mining_camp'].filter(t => this.has(t)).length;
      if (have < 2 && p.res.wood >= 100) { if (!this.has('mining_camp')) { const g = this.nearestRes('gold', this.base, 25); if (g && this.buildNear('mining_camp', g, vils)) return; } }
    }
    if (age >= 1) {
      const res = this.reserve();
      const list = ['blacksmith', 'archery_range'];
      if (this.diff !== 'easy') list.push('stable');
      for (const t of list) if (!this.has(t) && canAfford(p, BUILDINGS[t].cost)) { if (this.build(t, this.base, 6, 15, vils)) return; }
      if (this.builtTowers < this.D.towers && nv >= 22 && this.canAffordKeep(BUILDINGS.watch_tower.cost, res)) {
        const g = this.nearestRes('gold', this.base, 20);
        const spot = g ? { x: lerp(g.x, this.base.x, 0.3), y: lerp(g.y, this.base.y, 0.3) } : this.base;
        if (this.build('watch_tower', spot, 2, 7, vils)) { this.builtTowers++; return; }
      }
    }
    if (age >= 2) {
      const res = this.reserve();
      if (!this.has('siege_workshop') && canAfford(p, BUILDINGS.siege_workshop.cost)) { if (this.build('siege_workshop', this.base, 7, 16, vils)) return; }
      if (!this.has('monastery') && canAfford(p, BUILDINGS.monastery.cost)) { if (this.build('monastery', this.base, 7, 16, vils)) return; }
      if (this.diff !== 'easy' && !this.has('castle') && p.res.stone >= 650) { if (this.build('castle', this.frontPoint(7), 0, 8, vils) || this.build('castle', this.base, 5, 18, vils)) return; }
      // extra production when floating
      if (p.res.wood > 600 && this.count('barracks') < 2) { if (this.build('barracks', this.base, 7, 17, vils)) return; }
      if (p.res.wood > 600 && p.res.gold > 300 && this.count('archery_range') < 2) { if (this.build('archery_range', this.base, 7, 17, vils)) return; }
      if (p.res.wood > 600 && p.res.gold > 400 && this.count('stable') < 2 && this.diff !== 'easy') { if (this.build('stable', this.base, 7, 17, vils)) return; }
    }
    if (age >= 1 && p.res.wood > 700 && this.count('archery_range') < 2 && this.has('archery_range')) { if (this.build('archery_range', this.base, 7, 18, vils)) return; }
    if (age >= 1 && p.res.wood > 900 && this.count('barracks') < 2) { if (this.build('barracks', this.base, 7, 18, vils)) return; }
    if (age >= 1 && !this.has('market') && p.res.wood > 400 && nv > 24) this.build('market', this.base, 7, 16, vils);
    if (age >= 3 && this.diff === 'hard' && !this.has('wonder') && this.canAffordKeep(BUILDINGS.wonder.cost) && G.time > 2400) this.build('wonder', this.base, 4, 16, vils);
  }

  superviseFoundations(vils) {
    for (const b of G.buildings) {
      if (b.dead || b.built || b.owner !== this.pid) continue;
      const builders = vils.filter(v => v.order && v.order.type === 'build' && v.order.target === b.id).length;
      if (G.time - b.placedT > 150 && b.progress < 0.1) { deleteEntity(b); continue; }
      if (!builders) { const v = this.pickBuilder(vils, b.x, b.y); if (v) setOrder(v, { type: 'build', target: b.id }); }
    }
  }
  frontPoint(d) {
    const e = this.enemyBase();
    const dx = e.x - this.base.x, dy = e.y - this.base.y, l = Math.hypot(dx, dy) || 1;
    return { x: this.base.x + dx / l * d, y: this.base.y + dy / l * d };
  }
  enemyBase() {
    const tc = G.buildings.find(b => !b.dead && b.owner !== this.pid && b.owner > 0 && b.type === 'town_center');
    if (tc) return { x: tc.x, y: tc.y };
    const any = G.buildings.find(b => !b.dead && b.owner !== this.pid && b.owner > 0) || G.units.find(u => !u.dead && u.owner !== this.pid && u.owner > 0);
    return any ? { x: any.x, y: any.y } : { x: G.map.N / 2, y: G.map.N / 2 };
  }

  nearestRes(sub, from, maxD) {
    let best = null, bd = maxD;
    for (const r of G.resources) {
      if (r.dead || r.sub !== sub || r.amount <= 0) continue;
      const dd = dist(r.x, r.y, from.x, from.y);
      if (dd < bd) { bd = dd; best = r; }
    }
    return best;
  }

  // find a building spot around a point
  findSpot(type, c, dmin, dmax, margin = 1) {
    const size = BUILDINGS[type].size, N = G.map.N;
    const ok = (tx, ty) => {
      if (tx < 1 || ty < 1 || tx + size >= N - 1 || ty + size >= N - 1) return false;
      if (!canPlace(type, tx, ty, this.pid, false)) return false;
      if (margin) for (let j = ty - 1; j <= ty + size; j++) for (let i = tx - 1; i <= tx + size; i++) {
        if (i >= tx && i < tx + size && j >= ty && j < ty + size) continue;
        const k = j * N + i; const id = G.map.tileEnt[k];
        if (G.map.tileFarm[k] && type !== 'farm') return false;
        if (id) { const e = getEnt(id); if (e && (e.kind === 'building' || margin > 1)) return false; }
      }
      return true;
    };
    for (let r = dmin; r <= dmax; r++) {
      const n = 8 + r * 4, off = Math.random() * 6.28;
      for (let k = 0; k < n; k++) {
        const a = off + k / n * 6.283;
        const tx = Math.round(c.x + Math.cos(a) * r - size / 2), ty = Math.round(c.y + Math.sin(a) * r - size / 2);
        if (ok(tx, ty)) return [tx, ty];
      }
    }
    return null;
  }
  pickBuilder(vils, x, y, prefer) {
    let pool = (prefer && prefer.length ? prefer : vils).filter(v => !v.order || v.order.type !== 'build');
    if (!pool.length) pool = vils.filter(v => !v.order || v.order.type !== 'build');
    if (!pool.length) return null;
    pool.sort((a, b) => dist(a.x, a.y, x, y) - dist(b.x, b.y, x, y));
    return pool[0];
  }
  build(type, c, dmin, dmax, vils, prefer) {
    const d = BUILDINGS[type];
    if (!canAfford(this.p, d.cost) || !vils.length) return false;
    let spot = this.findSpot(type, c, dmin, dmax, type === 'farm' ? 0 : d.wall ? 0 : 1);
    if (!spot && type !== 'farm') spot = this.findSpot(type, c, dmin, dmax + 8, 0);
    if (!spot) return false;
    const b = placeFoundation(this.p, type, spot[0], spot[1]);
    if (!b) return false;
    const n = type === 'castle' || type === 'wonder' ? 4 : type === 'town_center' ? 3 : d.size >= 3 && type !== 'farm' ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const v = this.pickBuilder(vils, b.x, b.y, prefer); if (!v) break;
      setOrder(v, { type: 'build', target: b.id });
    }
    return b;
  }
  buildNear(type, res, vils) {
    const b = this.build(type, { x: res.x, y: res.y }, 2, 5, vils, vils.filter(v => dist(v.x, v.y, res.x, res.y) < 10));
    return b;
  }

  // ---------- villager jobs
  ratios() {
    const age = this.p.age;
    const nv = this.mine(u => u.type === 'villager').length;
    if (age === 0) return nv < 12 ? { food: 0.7, wood: 0.3, gold: 0, stone: 0 } : { food: 0.55, wood: 0.35, gold: 0.1, stone: 0 };
    if (age === 1) return { food: 0.45, wood: 0.36, gold: 0.15, stone: 0.04 };
    const castleStone = this.diff !== 'easy' && !this.has('castle');
    if (age === 2) return { food: 0.38, wood: 0.27, gold: 0.25, stone: castleStone ? 0.1 : 0.05 };
    return { food: 0.37, wood: 0.27, gold: 0.3, stone: 0.06 };
  }
  assignJobs(vils, total) {
    const r = this.ratios(), counts = { food: 0, wood: 0, gold: 0, stone: 0 };
    for (const v of vils) { const j = this.jobs.get(v.id); if (j) counts[j]++; }
    const p = this.p;
    const shift = (from, to, amt) => { const m = Math.min(amt, r[from]); r[from] -= m; r[to] += m; };
    if (p.res.wood > 500 && p.res.food < 400) shift('wood', 'food', p.res.wood > 1200 ? 0.2 : 0.1);
    if (p.res.gold > 900 && p.res.food < 400) shift('gold', 'food', 0.1);
    if (p.res.food > 1500 && p.res.gold < 400 && p.age >= 1) shift('food', 'gold', 0.1);
    if (p.age >= 1 && p.res.wood > 800 && p.res.gold < 600) shift('wood', 'gold', p.res.wood > 1500 ? 0.2 : 0.1);
    if (p.age >= 1 && p.res.wood > 1200 && p.res.stone < 700 && !this.has('castle') && this.diff !== 'easy') shift('wood', 'stone', 0.05);
    const want = {}; for (const k in r) want[k] = Math.round(r[k] * total);
    const idle = vils.filter(v => !v.order);
    for (const v of idle) {
      let job = this.jobs.get(v.id);
      if (!job || counts[job] > want[job] + 1) {
        if (job) counts[job]--;
        job = 'food'; let bd = -1e9;
        for (const k of RES) { const def = want[k] - counts[k]; if (def > bd) { bd = def; job = k; } }
        counts[job]++;
      }
      this.jobs.set(v.id, job);
      this.giveJob(v, job);
    }
    // rebalance one villager if badly skewed
    let over = null, under = null;
    for (const k of RES) { if (counts[k] - want[k] >= 2 && (!over || counts[k] - want[k] > counts[over] - want[over])) over = k; if (want[k] - counts[k] >= 2 && (!under || want[k] - counts[k] > want[under] - counts[under])) under = k; }
    if (over && under) {
      const v = vils.find(v => this.jobs.get(v.id) === over && v.order && v.order.type === 'gather' && v.carryAmt < 3);
      if (v) { this.jobs.set(v.id, under); this.giveJob(v, under); }
    }
  }
  giveJob(v, job) {
    const p = this.p, base = this.base;
    if (job === 'food') {
      // natural food close to a drop site first, then farms
      let t = null;
      const dropD = (x, y) => { const ds = nearestDropsite(this.pid, 'food', x, y); return ds ? distToRect(x, y, ds.tx, ds.ty, ds.tx + ds.w, ds.ty + ds.h) : 99; };
      const carc = G.resources.filter(r => !r.dead && r.type === 'carcass' && r.amount > 0 && dropD(r.x, r.y) < 6 && countGatherers(r) < 5);
      if (carc.length) t = carc.sort((a, b) => countGatherers(a) - countGatherers(b) || b.amount - a.amount)[0];
      if (!t) {
        const sheep = G.units.filter(u => !u.dead && u.type === 'sheep' && u.owner === this.pid && dropD(u.x, u.y) < 6);
        if (sheep.length) t = sheep.sort((a, b) => dist(a.x, a.y, v.x, v.y) - dist(b.x, b.y, v.x, v.y))[0];
      }
      if (!t) {
        const ber = G.resources.filter(r => !r.dead && r.sub === 'berries' && r.amount > 0 && dropD(r.x, r.y) < 5 && countGatherers(r) < 2);
        ber.sort((a, b) => dist(a.x, a.y, v.x, v.y) - dist(b.x, b.y, v.x, v.y));
        if (ber.length) t = ber[0];
      }
      if (!t) {
        const deer = G.units.filter(u => !u.dead && u.type === 'deer' && dropD(u.x, u.y) < 9 && countGatherers(u) < 2);
        if (deer.length) t = deer[0];
      }
      if (!t) t = findResourceNear(this.pid, 'farm', base.x, base.y, 30);
      if (t) { setOrder(v, { type: 'gather', target: t.id, sub: t.kind === 'unit' ? (t.type === 'sheep' ? 'sheep' : 'hunt') : t.kind === 'building' ? 'farm' : t.sub }); return; }
      // build a farm
      if (p.res.wood >= 60 + (this.reserve().wood || 0) * (this.countFarms() > 6 ? 1 : 0)) {
        const mill = this.blds('mill').sort((a, b) => dist(a.x, a.y, base.x, base.y) - dist(b.x, b.y, base.x, base.y));
        const anchor = this.countFarms() < 8 || !mill.length ? base : mill[0];
        const b = this.build('farm', anchor, 3, 9, [v], [v]);
        if (b) return;
      }
      job = 'wood';
    }
    const sub = job;
    let best = null, bd = 1e9;
    for (const r of G.resources) {
      if (r.dead || r.sub !== sub || r.amount <= 0) continue;
      const dd = dist(r.x, r.y, base.x, base.y) * 0.6 + dist(r.x, r.y, v.x, v.y) * 0.4 + (sub !== 'wood' ? countGatherers(r) * 2 : 0);
      if (dd < bd) { bd = dd; best = r; }
    }
    if (best) setOrder(v, { type: 'gather', target: best.id, sub });
  }
  countFarms() { return G.buildings.filter(b => !b.dead && b.owner === this.pid && b.type === 'farm').length; }

  herd(tc, military) {
    if (!tc) return;
    for (const sh of G.units) {
      if (sh.dead || sh.type !== 'sheep' || sh.owner !== this.pid || sh.order) continue;
      if (distToRect(sh.x, sh.y, tc.tx, tc.ty, tc.tx + tc.w, tc.ty + tc.h) > 3.5) {
        const a = Math.random() * 6.28; setOrder(sh, { type: 'move', rect: pointRect(tc.x + Math.cos(a) * 3.4, tc.y + Math.sin(a) * 3.4) });
      }
    }
    // early scouting with light cavalry finds sheep and deer
    if (this.p.age <= 1 && G.time < 900) {
      for (const u of military) {
        if (u.type !== 'scout' || (u.order && u.order.type !== 'move')) continue;
        if (u.order && u.order.type === 'move') continue;
        this.scoutStep = (this.scoutStep || 0) + 1;
        const a = this.scoutStep * 2.4, r = 9 + (this.scoutStep % 6) * 3.5;
        const x = clamp(tc.x + Math.cos(a) * r, 2, G.map.N - 2), y = clamp(tc.y + Math.sin(a) * r, 2, G.map.N - 2);
        const f = Path.nearestFree(x, y, 5); if (f) setOrder(u, { type: 'move', rect: pointRect(f[0], f[1]) });
      }
    }
  }

  // ---------- research & ages
  research(nv, nm) {
    const p = this.p;
    const tc = this.blds('town_center')[0];
    const next = ['feudal_age', 'castle_age', 'imperial_age'][p.age];
    if (tc && next && p.age < this.D.maxAge) {
      const goal = [this.D.feudalVils, this.D.castleVils, this.D.imperialVils][p.age];
      const st = techState(p, next);
      if (nv >= goal && st.ok && canAfford(p, techCost(p, next)) && !tc.queue.some(q => q.kind === 'tech')) {
        tc.queue = tc.queue.filter((q, i) => { if (q.kind === 'unit' && (i > 0 || q.t < 5)) { refund(p, q.cost); return false; } return true; });
        if (!tc.queue.length) queueTech(tc, next, true);
      }
    }
    const res = this.reserve();
    for (const key of AI_TECHS) {
      const t = TECHS[key]; const st = techState(p, key);
      if (!st.ok) continue;
      if (!ECO_TECHS.has(key) && nm < 4) continue;
      if (key === 'loom' && nv < 16) continue;
      const cost = techCost(p, key);
      const keepR = Object.assign({}, res); if (nv < this.D.vils) keepR.food = (keepR.food || 0) + 50;
      if (!this.canAffordKeep(cost, keepR)) continue;
      const where = G.buildings.find(b => !b.dead && b.built && b.owner === this.pid && BUILDINGS[b.type].techs.indexOf(key) >= 0 && b.queue.length === 0);
      if (!where) continue;
      if (where.type === 'town_center' && next && techState(p, next).ok) continue;
      queueTech(where, key, true);
      return;
    }
  }

  // ---------- army
  enemyComposition() {
    let cav = 0, arc = 0, inf = 0, tot = 0;
    for (const u of G.units) {
      if (u.dead || u.owner === this.pid || u.owner === 0) continue;
      const d = UNITS[u.type]; if (!isMilitary(d)) continue;
      tot++; if (hasCls(d, 'cavalry')) cav++; else if (hasCls(d, 'archer')) arc++; else if (hasCls(d, 'infantry')) inf++;
    }
    return { cav, arc, inf, tot };
  }
  trainArmy(nv, nm) {
    const p = this.p;
    if (p.pop >= p.popCap) return;
    const res = this.reserve();
    const early = p.age === 0;
    const threatened = G.time - this.threatT < 20 && (this.threatStr || 0) >= this.homeGuard();
    if (early && !threatened && !(this.diff === 'hard' && nm < 3)) return;
    if (nv < 10 && !threatened) return;
    const keep = Object.assign({}, res);
    if (nv < this.D.vils) keep.food = (keep.food || 0) + 60;
    if (!threatened && nm > nv * (this.diff === 'hard' ? 1.1 : 0.9)) return;
    const comp = this.enemyComposition();
    const spend = this.D.milShare;
    const counts = {}; for (const u of G.units) if (!u.dead && u.owner === this.pid) counts[u.type] = (counts[u.type] || 0) + 1;
    const cnt = key => counts[trainType(p, key)] || 0;
    for (const b of this.blds()) {
      if (!BUILDINGS[b.type].trains.length || b.type === 'town_center' || b.queue.length >= 2) continue;
      let choice = null;
      switch (b.type) {
        case 'barracks': choice = p.age === 0 ? 'militia' : (comp.cav > comp.tot * 0.3 || Math.random() < 0.3) && p.age >= 1 ? 'spearman' : 'militia'; break;
        case 'archery_range': choice = comp.arc > comp.tot * 0.35 && comp.tot > 3 ? 'skirmisher' : (p.age >= 2 && Math.random() < 0.2 ? 'cavalry_archer' : 'archer'); break;
        case 'stable': choice = p.age >= 2 ? (comp.inf > comp.tot * 0.5 && Math.random() < 0.3 ? 'scout' : 'knight') : 'scout'; if (p.age === 1 && cnt('scout') >= 4) choice = null; break;
        case 'siege_workshop': choice = cnt('battering_ram') < 3 ? 'battering_ram' : cnt('mangonel') < 2 ? 'mangonel' : null; break;
        case 'castle': choice = p.age >= 3 && cnt('trebuchet') < 2 && Math.random() < 0.3 ? 'trebuchet' : 'UU'; break;
        case 'monastery': choice = cnt('monk') < (this.diff === 'hard' ? 3 : 1) ? 'monk' : null; break;
      }
      if (!choice) continue;
      const st = unitState(p, choice); if (!st.ok) continue;
      const cost = UNITS[st.type].cost;
      // do not over-spend on army versus economy
      if (!threatened && Math.random() > spend) continue;
      if (!this.canAffordKeep(cost, threatened ? { food: nv < this.D.vils ? 50 : 0 } : keep)) continue;
      queueUnit(b, choice, true);
    }
  }
  homeGuard() { let n = 0; forUnitsNear(this.base.x, this.base.y, 22, u => { if (!u.dead && u.owner === this.pid && isMilitary(UNITS[u.type])) n++; }); return n; }
  onUnitSpawned(u) {
    const d = UNITS[u.type];
    if (isMilitary(d) || u.type === 'monk') {
      const f = this.frontPoint(6); setOrder(u, { type: 'move', rect: pointRect(f.x + rrange(-2, 2), f.y + rrange(-2, 2)) });
    }
  }
  onAttacked(t, src) {
    if (!src || src.kind !== 'unit') return;
    this.threat = { x: src.x, y: src.y };
    if (isMilitary(UNITS[src.type]) && (t.kind === 'building' || G.time - (this.hitT || -99) < 6)) this.threatT = G.time;
    this.hitT = G.time;
    if (t.kind === 'unit' && t.type === 'villager' && isMilitary(UNITS[src.type])) {
      const tc = this.blds('town_center').sort((a, b) => dist(a.x, a.y, t.x, t.y) - dist(b.x, b.y, t.x, t.y))[0];
      if (tc && dist(tc.x, tc.y, t.x, t.y) < 14 && tc.garrison.length < 15 && this.diff !== 'easy') { t.bellOrder = t.order; setOrder(t, { type: 'garrison', target: tc.id }); this.belled = true; }
      else if (tc) setOrder(t, { type: 'move', rect: pointRect(tc.x + rrange(-3, 3), tc.y + rrange(-3, 3)) });
    }
  }
  defend(military, vils) {
    // find enemies near our buildings
    let tx = 0, ty = 0, n = 0, str = 0;
    const mine = this.blds(null, true);
    for (const u of G.units) {
      if (u.dead || u.garrisonedIn || u.owner === this.pid || u.owner === 0) continue;
      const d = UNITS[u.type];
      let near = dist(u.x, u.y, this.base.x, this.base.y) < 20;
      if (!near) for (const b of mine) if (distToRect(u.x, u.y, b.tx, b.ty, b.tx + b.w, b.ty + b.h) < 8) { near = true; break; }
      if (!near) continue;
      tx += u.x; ty += u.y; n++; if (isMilitary(d)) str++;
    }
    this.threatStr = str;
    if (n) {
      this.threat = { x: tx / n, y: ty / n };
      if (str >= 2) this.threatT = G.time;
      const defenders = military.filter(u => !this.wave.includes(u.id) || str > 4 || dist(u.x, u.y, this.base.x, this.base.y) < 25);
      for (const u of defenders) {
        if (u.order && (u.order.type === 'attack' || (u.order.type === 'amove' && u.order.sub))) continue;
        setOrder(u, { type: 'amove', rect: pointRect(this.threat.x + rrange(-1, 1), this.threat.y + rrange(-1, 1)) });
      }
      if (str >= 4 && str > military.length * 1.3 && !this.belled && this.diff !== 'easy') {
        const tc = this.blds('town_center')[0];
        if (tc && dist(this.threat.x, this.threat.y, tc.x, tc.y) < 14) { ringBell(this.pid, true); this.belled = true; }
      }
    }
    const tc = this.blds('town_center')[0];
    if (tc) { let near = 0; forUnitsNear(tc.x, tc.y, 13, u => { if (!u.dead && u.owner > 0 && u.owner !== this.pid && isMilitary(UNITS[u.type])) near++; }); if (near) this.tcThreatT = G.time; }
    const anyInside = G.buildings.some(b => !b.dead && b.owner === this.pid && b.garrison.length);
    if ((this.belled || anyInside) && G.time - (this.tcThreatT || -99) > 8) { ringBell(this.pid, false); this.belled = false; }
  }
  attack(military) {
    const army = military.filter(u => u.type !== 'monk' || true);
    if (!this.attacking) {
      if (G.time < this.D.firstAttack || G.time - this.threatT < 15) return;
      if (G.time - this.lastWaveEnd < 60) return;
      if (army.length < this.waveSize) return;
      this.attacking = true; this.firstWave = true; this.wave = army.map(u => u.id); this.waveStart = army.length; this.waveT = 0;
      const tgt = this.pickTarget(this.base);
      if (!tgt) { this.attacking = false; return; }
      for (const u of army) setOrder(u, { type: 'amove', rect: pointRect(tgt.x + rrange(-2, 2), tgt.y + rrange(-2, 2)) });
      if (this.diff !== 'easy') notify('Enemy forces are on the move!', 'enemy');
      return;
    }
    const alive = this.wave.map(getEnt).filter(Boolean);
    this.wave = alive.map(u => u.id);
    if (alive.length < Math.max(2, this.waveStart * 0.3)) {
      for (const u of alive) setOrder(u, { type: 'move', rect: pointRect(this.base.x + rrange(-4, 4), this.base.y + rrange(-4, 4)) });
      this.attacking = false; this.wave = []; this.lastWaveEnd = G.time;
      this.waveSize = Math.min(40, this.waveSize + this.D.waveGrow);
      return;
    }
    if (this.waveT <= 0) {
      this.waveT = 4;
      // reinforce with fresh units, retarget idle ones
      for (const u of army) if (!this.wave.includes(u.id) && !u.order && alive.length > 3) { this.wave.push(u.id); }
      for (const id of this.wave) {
        const u = getEnt(id); if (!u) continue;
        if (u.order && (u.order.type === 'amove' || u.order.type === 'attack')) continue;
        const tgt = this.pickTarget(u);
        if (tgt) setOrder(u, { type: 'amove', rect: pointRect(tgt.x + rrange(-1, 1), tgt.y + rrange(-1, 1)) });
      }
    }
  }
  pickTarget(from) {
    let best = null, bd = 1e9;
    for (const b of G.buildings) {
      if (b.dead || b.owner === this.pid || b.owner === 0) continue;
      const d = BUILDINGS[b.type];
      const dd = dist(b.x, b.y, from.x, from.y) + (d.wall ? 30 : 0) + (b.type === 'farm' ? 8 : 0);
      if (dd < bd) { bd = dd; best = b; }
    }
    if (!best) for (const u of G.units) { if (u.dead || u.owner === this.pid || u.owner === 0) continue; const dd = dist(u.x, u.y, from.x, from.y); if (dd < bd) { bd = dd; best = u; } }
    return best ? { x: best.x, y: best.y } : null;
  }
  useMarket() {
    const p = this.p; const m = this.blds('market')[0]; if (!m) return;
    if (p.res.food > 1500 && p.res.gold < 300) marketTrade(p, 'food', false);
    if (p.res.wood > 1500 && p.res.gold < 300) marketTrade(p, 'wood', false);
    if (p.res.gold > 1200 && p.res.food < 200) marketTrade(p, 'food', true);
  }
}
