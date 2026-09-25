// ===== Computer player =====
'use strict';
const AI_DIFF = {
  easy: { gatherMul: 0.75, attackAt: 900, wave: 6, maxVill: 28, react: 3 },
  standard: { gatherMul: 1.0, attackAt: 660, wave: 9, maxVill: 42, react: 1.5 },
  hard: { gatherMul: 1.15, attackAt: 480, wave: 12, maxVill: 55, react: 1 },
  hardest: { gatherMul: 1.35, attackAt: 390, wave: 14, maxVill: 65, react: 0.7 },
};
class AIPlayer {
  constructor(p, diff) {
    this.p = p; this.cfg = AI_DIFF[diff] || AI_DIFF.standard; this.gatherMul = this.cfg.gatherMul;
    this.t = 0; this.acc = 0; this.state = 'boom'; this.attitude = {}; this.lastAttackBy = {};
    this.scoutPts = null; this.threatT = 0; this.waveN = 0; this.transportPlan = null; this.nextAttack = this.cfg.attackAt;
    this.buildCooldown = 0; this.log = [];
    for (let i = 1; i < W.players.length; i++) this.attitude[i] = 0;
  }
  get id() { return this.p.id; }
  mine(filter) { return W.list.filter(e => e.owner === this.id && filter(e)); }
  tc() { return W.list.find(e => e.kind === 'bld' && e.owner === this.id && e.type === 'tc' && e.built) || W.list.find(e => e.kind === 'bld' && e.owner === this.id && e.type === 'tc'); }
  home() { const tc = this.tc(); if (tc) return center(tc); const any = W.list.find(e => e.owner === this.id && e.kind === 'bld'); if (any) return center(any); return { x: this.p.startX, y: this.p.startY }; }
  update(dt) {
    this.acc += dt; this.t += dt;
    if (this.acc < 1) return;
    const step = this.acc; this.acc = 0;
    if (!this.p.alive) return;
    try {
      this.economy(step);
      this.military(step);
      this.diplomacy(step);
    } catch (e) { console.warn('AI error', e); }
  }
  // ---------- economy ----------
  economy(dt) {
    const p = this.p;
    const vills = this.mine(e => e.kind === 'unit' && e.type === 'villager' && !e.dying);
    const tcs = this.mine(e => e.kind === 'bld' && e.type === 'tc' && e.built);
    const home = this.home();
    this.buildCooldown -= dt;
    // Town Bell: only against a real raid, and always sound all-clear later
    this.manageBell(tcs);
    if (p.bell) return;
    // villagers (pause briefly to save food for the next Age)
    const nextAgeId = ['feudal', 'castleage', 'imperial'][p.age];
    const minV = [15, 24, 32][p.age] || 99;
    const saving = this.saving = nextAgeId && vills.length >= Math.min(minV, this.cfg.maxVill - 2) && !p.researching.has(nextAgeId) && !techLocked(p, nextAgeId) && p.res.food < effCost(p, nextAgeId, true).food;
    for (const tc of tcs) if (!saving && tc.queue.filter(q => q.kind === 'unit').length < 2 && vills.length + tcs.reduce((s, t) => s + t.queue.length, 0) < this.cfg.maxVill && p.res.food >= 50) queueUnit(tc, 'villager');
    // scouting early for sheep
    this.scouting();
    // herd owned sheep home
    for (const s of W.list) if (s.kind === 'unit' && s.type === 'sheep' && s.owner === this.id && !s.order && Math.hypot(s.x - home.x, s.y - home.y) > 7) setOrder(s, { t: 'move', x: home.x + 3 + Math.random() * 2, y: home.y + 3 + Math.random() * 2 });
    // assign idle villagers
    const counts = { food: 0, wood: 0, gold: 0, stone: 0, build: 0 };
    for (const v of vills) { const k = this.vTask(v); if (k) counts[k]++; }
    counts.food += Math.floor(this.mine(e => e.kind === 'unit' && e.type === 'fishingship').length * 0.8);
    const want = this.ratios();
    if (saving) { want.food += 0.15; want.wood -= 0.1; want.gold = Math.max(0, want.gold - 0.05); if (p.age >= 1 && p.res.gold < 200) { want.gold += 0.1; want.food -= 0.05; want.wood -= 0.05; } }
    const tot = vills.length || 1;
    for (const v of vills) {
      if (v.order || v.inside) continue;
      let best = 'food', bd = -1e9;
      for (const r of RES) { const deficit = want[r] - counts[r] / tot; if (deficit > bd) { bd = deficit; best = r; } }
      if (this.assign(v, best)) counts[best]++;
      else if (best !== 'wood' && this.assign(v, 'wood')) counts.wood++;
      else if (this.assign(v, 'food')) counts.food++;
    }
    // rebalance every ~8s: move one villager from the most over- to the most under-staffed resource
    this.rebT = (this.rebT || 0) + dt;
    if (this.rebT > 4 && vills.length > 6) {
      this.rebT = 0;
      let over = null, under = null, om = 0.06, um = 0.06;
      for (const r of RES) { const d = counts[r] / tot - want[r]; if (d > om) { om = d; over = r; } if (-d > um) { um = -d; under = r; } }
      if (over && under) { const v = vills.find(v => this.vTask(v) === over && !(v.carry && v.carry.amt > 5)); if (v) this.assign(v, under); }
    }
    // houses
    const houseBuilding = this.mine(e => e.kind === 'bld' && e.type === 'house' && !e.built).length;
    if (p.popCap < 200 && p.pop + 3 + tcs.length * 2 >= p.popCap && houseBuilding < (p.pop > 40 ? 2 : 1) && p.res.wood >= 25) this.build('house', home, 3, 12);
    if (this.buildCooldown > 0) return;
    // drop sites
    this.dropSites(vills, home);
    // farms when natural food runs out (never more than the food workforce needs)
    const naturalFood = W.list.some(e => (e.kind === 'res' && (e.type === 'berry' || e.type === 'carcass') && Math.hypot(e.x - home.x, e.y - home.y) < 22) || (e.kind === 'unit' && e.type === 'sheep' && e.owner === this.id));
    const farms = this.mine(e => e.kind === 'bld' && e.type === 'farm');
    const fishers = this.mine(e => e.kind === 'unit' && e.type === 'fishingship').length;
    const foodTarget = Math.round(want.food * tot) - (naturalFood ? 4 : 0) - Math.floor(fishers / 2);
    const wantDock = this.waterNear() && tot >= 8 && !W.list.some(e => e.kind === 'bld' && e.owner === this.id && e.type === 'dock');
    if (wantDock && p.res.wood >= 150) { if (this.buildDock(home)) { this.buildCooldown = 4; return; } }
    if (farms.length < foodTarget && p.res.wood >= 60 + (p.pop + 3 >= p.popCap ? 25 : 0) + (wantDock ? 150 : 0) && hasBuilt(p, 'mill')) {
      const mill = this.mine(e => e.kind === 'bld' && (e.type === 'mill' || e.type === 'tc') && e.built);
      const anchor = mill.length ? center(mill[farms.length % mill.length]) : home;
      if (this.build('farm', anchor, 2, 9, true)) { this.buildCooldown = 2; return; }
    }
    // buildings program
    const age = p.age;
    const nV = vills.length;
    const has = t => this.mine(e => e.kind === 'bld' && e.type === t).length;
    const plan = [
      ['mill', nV >= 6 && has('mill') < 1],
      ['lumbercamp', nV >= 8 && has('lumbercamp') < 1],
      ['dock', nV >= 8 && has('dock') < (this.needNaval() && age >= 1 ? 2 : 1) && this.waterNear()],
      ['barracks', nV >= 12 && has('barracks') < 1],
      ['miningcamp', nV >= 14 && has('miningcamp') < 1],
      ['lumbercamp', nV >= 18 && has('lumbercamp') < 2],
      ['range', age >= 1 && has('range') < 1],
      ['blacksmith', age >= 1 && has('blacksmith') < 1],
      ['stable', age >= 1 && nV >= 20 && has('stable') < 1],
      ['market', age >= 1 && nV >= 24 && has('market') < 1],
      ['tower', age >= 1 && has('tower') < 1 && p.res.stone > 200],
      ['monastery', age >= 2 && has('monastery') < 1],
      ['university', age >= 2 && has('university') < 1],
      ['siege', age >= 2 && has('siege') < 1],
      ['castle', age >= 2 && has('castle') < 1 && p.res.stone >= 650],
      ['barracks', age >= 2 && has('barracks') < 2 && nV > 30],
      ['range', age >= 2 && has('range') < 2 && nV > 35],
      ['tc', age >= 1 && has('tc') < 2 && nV > 30 && p.res.stone >= 100 && p.res.wood >= 275],
    ];
    let tries = 0;
    for (const [type, cond] of plan) {
      if (!cond) continue;
      if (bldLocked(p, type)) continue;
      if (++tries > 2) break;
      const c = effCost(p, type); if (!canPay(p, c)) continue;
      if (type === 'miningcamp') { const g = findNearestRes({ x: home.x, y: home.y, type: 'villager' }, ['gold'], home.x, home.y, 25); if (g) { if (this.build('miningcamp', { x: g.x + 0.5, y: g.y + 0.5 }, 1, 4)) { this.buildCooldown = 5; break; } } continue; }
      if (type === 'lumbercamp') { const tr = findNearestRes({ x: home.x, y: home.y, type: 'villager' }, ['tree'], home.x, home.y, 25, e => W.list.filter(o => o.kind === 'res' && o.type === 'tree' && Math.abs(o.x - e.x) < 3 && Math.abs(o.y - e.y) < 3).length > 5 && !W.list.some(b => b.kind === 'bld' && b.owner === this.id && b.type === 'lumbercamp' && Math.hypot(b.x - e.x, b.y - e.y) < 8)); if (tr) { if (this.build('lumbercamp', { x: tr.x + 0.5, y: tr.y + 0.5 }, 1, 4)) { this.buildCooldown = 5; break; } } continue; }
      const b = type === 'dock' ? this.buildDock(home) : this.build(type, home, type === 'tower' ? 6 : 5, type === 'castle' ? 14 : 16);
      if (b) { this.buildCooldown = 5; break; }
    }
    // age up
    const tc = tcs[0];
    if (tc && !tc.queue.some(q => q.kind === 'tech')) {
      const nextAge = nextAgeId;
      if (nextAge && nV >= Math.min(minV, this.cfg.maxVill - 2) && !techLocked(p, nextAge) && canPay(p, effCost(p, nextAge, true))) { tc.queue.filter(q => q.kind === 'unit').forEach(() => cancelQueue(tc, tc.queue.findIndex(q => q.kind === 'unit'))); queueTech(tc, nextAge); }
      else if (!p.techs.has('loom') && age >= 0 && nV > 12 && p.res.gold >= 50) queueTech(tc, 'loom');
    }
    // economy techs when surplus
    this.research(['wheelbarrow', 'doublebit', 'horsecollar', 'goldmining', 'forging', 'fletching', 'scalemail', 'paddedarcher', 'scalebarding', 'bowsaw', 'heavyplow', 'up_manatarms', 'up_crossbow', 'up_pikeman', 'handcart', 'ironcasting', 'bodkin', 'chainmail', 'up_longsword', 'up_lightcav', 'masonry', 'ballistics', 'gillnets', 'up_wargalley', 'careening', 'sanctity', 'fervor', 'up_cavalier', 'up_arbalest', 'up_twohanded', 'chemistry', 'up_galleon', 'elite_uu', 'guardtower', 'murderholes', 'keep', 'up_eskirm', 'townwatch'], 300);
    // fishing ships
    const docks = this.mine(e => e.kind === 'bld' && e.type === 'dock' && e.built);
    if (docks.length) {
      const fishers = this.mine(e => e.kind === 'unit' && e.type === 'fishingship').length;
      const fish = W.list.filter(e => e.kind === 'res' && e.type === 'fish' && e.amount > 0 && W.map.waterReg[W.map.idx(e.x, e.y)] === W.map.waterReg[W.map.idx(docks[0].x + 1, docks[0].y + 1)]).length;
      if (fishers < Math.min(fish, 6) && p.res.wood >= 75 && docks[0].queue.length < 2) queueUnit(docks[0], 'fishingship');
      for (const f of this.mine(e => e.kind === 'unit' && e.type === 'fishingship' && !e.order)) {
        const r = findNearestRes(f, ['fish'], f.x, f.y, 60, e => W.map.waterReg[W.map.idx(e.x, e.y)] === W.map.waterReg[W.map.idx(f.x | 0, f.y | 0)]);
        if (r) setOrder(f, { t: 'gather', id: r.id });
      }
    }
    const mk = this.mine(e => e.kind === 'bld' && e.type === 'market' && e.built)[0];
    if (mk) { if (p.res.wood < 100 && p.res.gold > 400) marketTrade(p, 'wood', true); if (p.res.food > 1500 && p.res.gold < 600) marketTrade(p, 'food', false); if (p.res.wood < 100 && p.res.food > 1200) { marketTrade(p, 'food', false); } }
    // trade carts with allies' markets
    const market = this.mine(e => e.kind === 'bld' && e.type === 'market' && e.built)[0];
    if (market && age >= 2) {
      const partner = W.list.find(e => e.kind === 'bld' && e.type === 'market' && e.built && e.owner !== this.id && isFriend(e.owner, this.id));
      const carts = this.mine(e => e.kind === 'unit' && e.type === 'tradecart');
      if (partner && carts.length < 4 && p.res.gold >= 100 && market.queue.length < 1) queueUnit(market, 'tradecart');
      for (const c of carts) if (!c.order && partner) setOrder(c, { t: 'trade', home: market.id, dest: partner.id });
      // sell surplus
      for (const r of ['food', 'wood', 'stone']) if (p.res[r] > 1500 && p.res.gold < 300) marketTrade(p, r, false);
    }
  }
  research(list, reserve) {
    const p = this.p;
    for (const id of list) {
      const t = TECHS[id]; if (!t || p.techs.has(id) || p.researching.has(id)) continue;
      if (techLocked(p, id)) continue;
      const c = effCost(p, id, true);
      const surplus = RES.every(r => (p.res[r] || 0) >= (c[r] || 0) + (c[r] ? reserve * 0.5 : 0));
      if (!surplus) continue;
      const b = this.mine(e => e.kind === 'bld' && e.type === t.at && e.built && e.queue.length === 0)[0];
      if (b) { queueTech(b, id); return; }
    }
  }
  ratios() {
    const a = this.p.age;
    let r = [{ food: 0.5, wood: 0.44, gold: 0.06, stone: 0 }, { food: 0.42, wood: 0.42, gold: 0.13, stone: 0.03 }, { food: 0.38, wood: 0.36, gold: 0.2, stone: 0.06 }, { food: 0.36, wood: 0.32, gold: 0.25, stone: 0.07 }][a];
    if (a === 0 && W.list.filter(e => e.owner === this.id && e.type === 'villager').length < 12) r = { food: 0.62, wood: 0.38, gold: 0, stone: 0 };
    // adapt to stockpiles: starve what is hoarded, feed what is missing
    r = Object.assign({}, r); const R0 = this.p.res;
    for (const k of RES) { if (!r[k]) continue; if (R0[k] > 1500) r[k] *= 0.3; else if (R0[k] > 700) r[k] *= 0.6; else if (R0[k] < 120) r[k] *= 1.6; }
    const sum = RES.reduce((s, k) => s + r[k], 0) || 1; for (const k of RES) r[k] /= sum;
    if (this.p.res.stone > 800) r = Object.assign({}, r, { stone: 0, wood: r.wood + r.stone });
    if (this.p.res.gold > 1500) r = Object.assign({}, r, { gold: r.gold * 0.4, food: r.food + r.gold * 0.6 });
    return r;
  }
  vTask(v) {
    const o = v.order; if (!o) return null;
    if (o.t === 'farm' || o.t === 'hunt') return 'food';
    if (o.t === 'gather') { const e = ent(o.id); const t = o.rtype || (e && e.type); return { tree: 'wood', gold: 'gold', stone: 'stone', berry: 'food', carcass: 'food', farm: 'food' }[t] || 'food'; }
    if (o.t === 'dropoff' && v.carry) return v.carry.res;
    if (o.t === 'build' || o.t === 'repair') return 'build';
    return null;
  }
  assign(v, res) {
    const home = this.home();
    if (res === 'food') {
      const sheep = W.list.filter(s => s.kind === 'unit' && s.type === 'sheep' && s.owner === this.id && !s.dying && Math.hypot(s.x - home.x, s.y - home.y) < 14);
      const carc = W.list.find(e => e.kind === 'res' && e.type === 'carcass' && e.amount > 5 && Math.hypot(e.x - home.x, e.y - home.y) < 14 && e.gatherers < 4);
      if (carc) { setOrder(v, { t: 'gather', id: carc.id }); return true; }
      if (sheep.length) { setOrder(v, { t: 'hunt', id: sheep[0].id }); return true; }
      const farm = W.list.find(f => f.kind === 'bld' && f.type === 'farm' && f.owner === this.id && f.built && !f.farmer);
      if (farm) { setOrder(v, { t: 'farm', id: farm.id }); return true; }
      const berry = findNearestRes(v, ['berry'], home.x, home.y, 20);
      if (berry && berry.gatherers < 6) { setOrder(v, { t: 'gather', id: berry.id }); return true; }
      const deer = W.list.find(a => a.kind === 'unit' && a.type === 'deer' && a.owner === 0 && Math.hypot(a.x - home.x, a.y - home.y) < 20);
      if (deer) { setOrder(v, { t: 'hunt', id: deer.id }); return true; }
      const unfinished = W.list.find(f => f.kind === 'bld' && f.type === 'farm' && f.owner === this.id && !f.built);
      if (unfinished) { setOrder(v, { t: 'build', id: unfinished.id }); return true; }
      if (this.p.res.wood >= 60 && hasBuilt(this.p, 'mill')) { const b = this.build('farm', home, 2, 9, true, [v]); if (b) return true; }
      return false;
    }
    const type = res === 'wood' ? 'tree' : res;
    // prefer resources near own drop sites
    const drops = this.mine(e => e.kind === 'bld' && e.built && BUILDINGS[e.type].drop && BUILDINGS[e.type].drop.includes(res) && e.type !== 'dock');
    let best = null, bd = 1e9;
    for (const d of drops) { const c = center(d); const r = findNearestRes(v, [type], c.x, c.y, 10); if (r) { const dd = Math.hypot(r.x - c.x, r.y - c.y) + r.gatherers * 1.5; if (dd < bd) { bd = dd; best = r; } } }
    if (!best) best = findNearestRes(v, [type], home.x, home.y, 40);
    if (best) { setOrder(v, { t: 'gather', id: best.id }); return true; }
    return false;
  }
  dropSites(vills, home) {
    const p = this.p;
    const drops = t => this.mine(e => e.kind === 'bld' && (e.type === t || e.type === 'tc'));
    const check = (res, btype, types) => {
      const gatherers = vills.filter(v => this.vTask(v) === res && v.order && v.order.t === 'gather');
      if (gatherers.length < 3) return false;
      // average distance to drop
      let far = 0;
      for (const v of gatherers) { const o = v.order; const e = o && ent(o.id); if (!e) continue; const d = nearestDrop(v, res); if (!d || distTo({ x: e.x + 0.5, y: e.y + 0.5 }, d) > 7) far++; }
      if (far < 3) return false;
      if (this.mine(e => e.kind === 'bld' && e.type === btype && !e.built).length) return false;
      if (this.mine(e => e.kind === 'bld' && e.type === btype).length >= (btype === 'mill' ? 2 : 6)) return false;
      if (!canPay(p, effCost(p, btype))) return false;
      // find the resource cluster
      const v = gatherers.find(v => v.order && ent(v.order.id));
      if (!v) return false;
      const r = ent(v.order.id);
      return !!this.build(btype, { x: r.x + 0.5, y: r.y + 0.5 }, 1, 6, false, [v]);
    };
    if (check('wood', 'lumbercamp')) { this.buildCooldown = 5; return; }
    if (check('gold', 'miningcamp')) { this.buildCooldown = 5; return; }
    if (check('stone', 'miningcamp')) { this.buildCooldown = 5; return; }
    if (check('food', 'mill')) { this.buildCooldown = 5; return; }
  }
  // find a spot and start construction
  build(type, near, dmin, dmax, tight, builders) {
    const p = this.p;
    if (bldLocked(p, type)) return null;
    if (!canPay(p, effCost(p, type))) return null;
    const s = BUILDINGS[type].size;
    const rng = W.rng;
    for (let tries = 0; tries < 60; tries++) {
      const a = rng() * Math.PI * 2, d = dmin + rng() * (dmax - dmin) + tries * 0.15;
      const x = Math.round(near.x + Math.cos(a) * d - s / 2), y = Math.round(near.y + Math.sin(a) * d - s / 2);
      if (canPlace(p, type, x, y, true)) continue;
      if (!tight && !this.margin(x, y, s)) continue;
      if (!this.reachable(x, y, s, near)) continue;
      const vs = builders || this.pickBuilders(x, y, type === 'castle' || type === 'tc' ? 4 : type === 'farm' ? 1 : 2);
      if (!vs.length) return null;
      const b = placeBuilding(p, type, x, y, vs);
      if (typeof b === 'object') { for (const v of vs) v.prevAfterBuild = null; return b; }
    }
    return null;
  }
  margin(x, y, s) {
    const map = W.map;
    for (let yy = y - 1; yy <= y + s; yy++) for (let xx = x - 1; xx <= x + s; xx++) { if (!map.inb(xx, yy)) return false; if (yy >= y && yy < y + s && xx >= x && xx < x + s) continue; const b = map.blk[map.idx(xx, yy)]; if (b) { const e = ent(b); if (e && e.kind === 'bld') return false; } if (isWaterT(map.ter[map.idx(xx, yy)])) continue; }
    return true;
  }
  reachable(x, y, s, near) { const map = W.map; const r0 = map.landReg[map.idx(Math.max(0, Math.min(W.n - 1, near.x | 0)), Math.max(0, Math.min(W.n - 1, near.y | 0)))]; return map.landReg[map.idx(x, y)] === r0; }
  pickBuilders(x, y, n, reg) {
    if (!reg) reg = W.map.landReg[W.map.idx(x, y)];
    const vills = this.mine(e => e.kind === 'unit' && e.type === 'villager' && !e.inside && !e.dying && W.map.landReg[W.map.idx(e.x | 0, e.y | 0)] === reg);
    vills.sort((a, b) => (this.vTask(a) === 'build') - (this.vTask(b) === 'build') || (this.vTask(a) === 'wood' ? -1 : 0) || Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
    return vills.slice(0, n);
  }
  waterNear() {
    if (this._water !== undefined) return this._water;
    const h = this.home(); const map = W.map; let cnt = 0;
    for (let y = (h.y | 0) - 25; y <= (h.y | 0) + 25; y++) for (let x = (h.x | 0) - 25; x <= (h.x | 0) + 25; x++) if (map.isWater(x, y)) cnt++;
    this._water = cnt > 40; return this._water;
  }
  buildDock(home) {
    const p = this.p, map = W.map;
    const cands = [];
    for (let y = (home.y | 0) - 26; y <= (home.y | 0) + 26; y++) for (let x = (home.x | 0) - 26; x <= (home.x | 0) + 26; x++) {
      if (!map.inb(x, y) || !map.isWater(x, y)) continue;
      cands.push({ x, y, d: Math.hypot(x - home.x, y - home.y) });
    }
    cands.sort((a, b) => a.d - b.d);
    // prefer water body with the most connectivity (largest region)
    for (const c of cands) {
      if (canPlace(p, 'dock', c.x - 1, c.y - 1, true)) continue;
      // must be adjacent to our landmass
      let ok = false; const myReg = map.landReg[map.idx(home.x | 0, home.y | 0)];
      for (let yy = c.y - 2; yy <= c.y + 2; yy++) for (let xx = c.x - 2; xx <= c.x + 2; xx++) if (map.inb(xx, yy) && !map.isWater(xx, yy) && map.landReg[map.idx(xx, yy)] === myReg) ok = true;
      if (!ok) continue;
      const vs = this.pickBuilders(c.x, c.y, 2, myReg); if (!vs.length) return null;
      const b = placeBuilding(p, 'dock', c.x - 1, c.y - 1, vs);
      if (typeof b === 'object') return b;
    }
    return null;
  }
  scouting() {
    const scout = this.mine(e => e.kind === 'unit' && (e.type === 'scout' || e.type === 'lightcav'))[0];
    if (!scout || scout.order || this.t > 360) return;
    const h = this.home();
    if (!this.scoutPts) { this.scoutPts = []; for (let r of [9, 14, 19]) for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + r; this.scoutPts.push({ x: h.x + Math.cos(a) * r, y: h.y + Math.sin(a) * r }); } }
    const pt = this.scoutPts.shift(); if (pt) setOrder(scout, { t: 'move', x: Math.max(1, Math.min(W.n - 2, pt.x)), y: Math.max(1, Math.min(W.n - 2, pt.y)) });
  }
  manageBell(tcs) {
    const p = this.p;
    if (!tcs.length) return;
    const home = center(tcs[0]);
    const threats = unitsNear(home.x, home.y, 14, u => isEnemy(this.id, u.owner) && !UNITS[u.type].animal && u.type !== 'villager' && !UNITS[u.type].naval && !hasTag(u.type, 'trade'));
    const defenders = this.army().filter(u => Math.hypot(u.x - home.x, u.y - home.y) < 20);
    const nearVill = threats.filter(u => Math.hypot(u.x - home.x, u.y - home.y) < 10).length;
    if (!p.bell && nearVill >= 4 && threats.length > defenders.length * 1.5 && this.t - (this.clearedT || -999) > 150) { ringBell(p); this.bellT = this.t; }
    if (p.bell) {
      if (threats.length === 0) { this.clearT = (this.clearT || 0) + 1; if (this.clearT > 6) { allClear(p); this.clearT = 0; this.clearedT = this.t; } }
      else this.clearT = 0;
      if (p.bell && this.t - this.bellT > 60) { allClear(p); this.clearedT = this.t; } // never trap the economy for long
    }
  }
  // ---------- military ----------
  army() { return this.mine(e => e.kind === 'unit' && !e.inside && !e.dying && !UNITS[e.type].animal && e.type !== 'villager' && e.type !== 'monk' && !hasTag(e.type, 'trade') && !UNITS[e.type].naval && e.type !== 'cobra' && e.type !== 'scout' || (e.kind === 'unit' && e.type === 'scout' && this.t > 360 && !e.inside)); }
  navy() { return this.mine(e => e.kind === 'unit' && hasTag(e.type, 'warship')); }
  enemies() { const out = []; for (let i = 1; i < W.players.length; i++) if (i !== this.id && W.players[i].alive && isEnemy(this.id, i)) out.push(i); return out; }
  needNaval() {
    const en = this.enemies(); if (!en.length) return false;
    const h = this.home(); const myReg = W.map.landReg[W.map.idx(h.x | 0, h.y | 0)];
    return en.some(i => { const b = W.list.find(e => e.owner === i && e.kind === 'bld'); if (!b) return false; return W.map.landReg[W.map.idx(b.x, b.y)] !== myReg; });
  }
  military(dt) {
    const p = this.p, age = p.age;
    // production
    const reserveFood = age < 3 ? (age === 0 ? 500 : age === 1 ? 800 : 1000) : 0;
    const armySize = this.army().length;
    const econOK = this.mine(e => e.kind === 'unit' && e.type === 'villager').length >= Math.min(20, this.cfg.maxVill - 5) || this.t > 600;
    const maxArmy = 20 + age * 15;
    const enemyCav = W.list.filter(e => e.kind === 'unit' && isEnemy(this.id, e.owner) && hasTag(e.type, 'mounted')).length;
    const enemyArch = W.list.filter(e => e.kind === 'unit' && isEnemy(this.id, e.owner) && hasTag(e.type, 'archer')).length;
    const trainAt = (btype, types) => {
      for (const b of this.mine(e => e.kind === 'bld' && e.type === btype && e.built && e.queue.length < 2)) {
        let base = types[(Math.random() * types.length) | 0]; if (base === '__uu') base = CIVS[p.civ].uu;
        const t = currentType(p, base);
        if (unitLocked(p, t)) continue;
        const c = effCost(p, t);
        if (p.res.food - (c.food || 0) < (econOK ? 0 : reserveFood * 0.3) && c.food) continue;
        if (canPay(p, c)) queueUnit(b, t);
      }
    };
    if (armySize < maxArmy && ((econOK && !this.saving) || this.underThreat())) {
      trainAt('barracks', enemyCav > 3 ? ['spearman', 'spearman', 'militia'] : ['militia', 'spearman']);
      trainAt('range', enemyArch > 4 ? ['skirmisher', 'archer'] : age >= 2 ? ['archer', 'archer', 'cavarcher'] : ['archer', 'archer', 'skirmisher']);
      trainAt('stable', age >= 2 ? ['knight', 'knight', 'scout'] : ['scout']);
      trainAt('castle', ['__uu', '__uu', 'trebuchet']);
      if (this.army().filter(u => hasTag(u.type, 'siege')).length < 3) trainAt('siege', ['ram', 'mangonel', 'scorpion']);
    }
    // monks for relics
    const mon = this.mine(e => e.kind === 'bld' && e.type === 'monastery' && e.built)[0];
    const monks = this.mine(e => e.kind === 'unit' && e.type === 'monk');
    if (mon && monks.length < 3 && p.res.gold >= 100 && mon.queue.length === 0) queueUnit(mon, 'monk');
    for (const m of monks) {
      if (m.order) continue;
      if (m.relic) { if (mon) setOrder(m, { t: 'deposit', id: mon.id }); continue; }
      const reg = W.map.landReg[W.map.idx(m.x | 0, m.y | 0)];
      const r = W.list.filter(r => r.kind === 'relic' && !r.carrier && !r.inBld && W.map.landReg[W.map.idx(r.x, r.y)] === reg && !W.list.some(o => o.kind === 'unit' && o.type === 'monk' && o.owner === this.id && o.order && o.order.id === r.id)).sort((a, b) => Math.hypot(a.x - m.x, a.y - m.y) - Math.hypot(b.x - m.x, b.y - m.y))[0];
      if (r && mon) setOrder(m, { t: 'relic', id: r.id });
      else { const a = this.army(); if (a.length) setOrder(m, { t: 'follow', id: a[0].id }); }
    }
    // navy
    const dock = this.mine(e => e.kind === 'bld' && e.type === 'dock' && e.built)[0];
    const naval = this.needNaval();
    if (dock && age >= 1) {
      const navy = this.navy();
      const want = naval ? 6 + age * 2 : 2 + age;
      if (navy.length < want && dock.queue.length < 2 && p.res.wood > 150 && p.res.gold > 40) queueUnit(dock, currentType(p, age >= 2 && Math.random() < 0.25 ? 'fireship' : 'galley'));
      // send navy to hunt enemy ships/docks
      if (navy.length >= 3 && this.t % 10 < 1) {
        const tgt = this.navalTarget(navy[0]);
        if (tgt) for (const s of navy) if (!s.order) setOrder(s, { t: 'attackmove', x: tgt.x, y: tgt.y });
      }
    }
    // transports for island maps
    if (naval && dock) {
      const trans = this.mine(e => e.kind === 'unit' && e.type === 'transport');
      if (trans.length < 2 && p.res.wood >= 125 && dock.queue.length < 2 && this.army().length >= 4) queueUnit(dock, 'transport');
    }
    // attack waves
    this.nextAttack -= 0;
    const army = this.army();
    const idle = army.filter(u => !u.order || u.order.t === 'move');
    if (this.state === 'attacking') {
      if (army.length < 3) { this.state = 'boom'; this.nextAttack = this.t + 120; }
      else if (this.t % 6 < 1) this.pressAttack(army);
    } else if (this.t > this.nextAttack && army.length >= this.cfg.wave + this.waveN * 2) {
      this.state = 'attacking'; this.waveN++; this.pressAttack(army);
    } else {
      // gather idle army at rally point near home
      const h = this.home();
      for (const u of idle) if (!u.order && Math.hypot(u.x - h.x, u.y - h.y) > 12) setOrder(u, { t: 'move', x: h.x + 5, y: h.y + 5 });
    }
  }
  underThreat() { const h = this.home(); return unitsNear(h.x, h.y, 16, u => isEnemy(this.id, u.owner) && !UNITS[u.type].animal).length > 0; }
  targetPlayer() {
    const en = this.enemies(); if (!en.length) return null;
    const h = this.home();
    if (!this.focus || !en.includes(this.focus)) {
      en.sort((a, b) => { const ba = W.list.find(e => e.owner === a && e.kind === 'bld'), bb = W.list.find(e => e.owner === b && e.kind === 'bld'); return (ba ? Math.hypot(ba.x - h.x, ba.y - h.y) : 1e9) - (bb ? Math.hypot(bb.x - h.x, bb.y - h.y) : 1e9) - (this.attitude[a] || 0) * 0.5 + (this.attitude[b] || 0) * 0.5; });
      this.focus = en[0];
    }
    return this.focus;
  }
  pressAttack(army) {
    const tp = this.targetPlayer(); if (!tp) { this.state = 'boom'; return; }
    const cx = army.reduce((s, u) => s + u.x, 0) / army.length, cy = army.reduce((s, u) => s + u.y, 0) / army.length;
    // nearest enemy building (non wall), prefer TC/castle
    let tgt = null, bd = 1e9;
    for (const e of W.list) {
      if (e.owner !== tp || e.dead) continue;
      if (e.kind === 'bld' && (BUILDINGS[e.type].wall)) continue;
      if (e.kind === 'unit' && (e.inside || UNITS[e.type].naval)) continue;
      const c = center(e); const d = Math.hypot(c.x - cx, c.y - cy) - (e.type === 'tc' ? 4 : 0) + (e.kind === 'unit' ? 6 : 0);
      if (d < bd) { bd = d; tgt = e; }
    }
    if (!tgt) return;
    const tc = center(tgt);
    const myReg = W.map.landReg[W.map.idx(cx | 0, cy | 0)], tReg = W.map.landReg[W.map.idx(tc.x | 0, tc.y | 0)];
    if (W.map.isWater(tc.x | 0, tc.y | 0) || myReg !== tReg) { this.ferry(army, tc); return; }
    for (const u of army) {
      if (u.order && (u.order.t === 'attack' || u.order.t === 'board')) continue;
      if (u.order && u.order.t === 'attackmove' && Math.hypot(u.order.x - tc.x, u.order.y - tc.y) < 3) continue;
      if (UNITS[u.type].onlyBld && tgt.kind === 'bld') setOrder(u, { t: 'attack', id: tgt.id });
      else setOrder(u, { t: 'attackmove', x: tc.x + (Math.random() - 0.5) * 2, y: tc.y + (Math.random() - 0.5) * 2 });
    }
  }
  // Transport the army across water to the target
  ferry(army, tgt) {
    const trans = this.mine(e => e.kind === 'unit' && e.type === 'transport' && !e.dying);
    if (!trans.length) return;
    const home = this.home(); const map = W.map;
    const myReg = map.landReg[map.idx(home.x | 0, home.y | 0)];
    for (const s of trans) {
      const cap = UNITS.transport.cap + this.p.transportCap;
      const landed = army.filter(u => map.landReg[map.idx(u.x | 0, u.y | 0)] === myReg && !u.inside);
      if (s.order && s.order.t === 'unload') continue;
      if (s.cargo.length >= Math.min(cap, landed.length + s.cargo.length) && s.cargo.length > 0) {
        setOrder(s, { t: 'unload', x: tgt.x, y: tgt.y, then: { t: 'attackmove', x: tgt.x, y: tgt.y } });
        continue;
      }
      if (s.waitT === undefined) s.waitT = 0;
      s.waitT += 6;
      if (s.cargo.length && s.waitT > 40) { s.waitT = 0; setOrder(s, { t: 'unload', x: tgt.x, y: tgt.y, then: { t: 'attackmove', x: tgt.x, y: tgt.y } }); continue; }
      // move transport to our shore near the army
      if (!s.order) {
        const cx = landed.length ? landed.reduce((a, u) => a + u.x, 0) / landed.length : home.x, cy = landed.length ? landed.reduce((a, u) => a + u.y, 0) / landed.length : home.y;
        let best = null, bd = 1e9;
        for (let y = (cy | 0) - 20; y <= (cy | 0) + 20; y++) for (let x = (cx | 0) - 20; x <= (cx | 0) + 20; x++) {
          if (!map.inb(x, y) || !map.isWater(x, y) || map.blk[map.idx(x, y)]) continue;
          if (map.waterReg[map.idx(x, y)] !== map.waterReg[map.idx(s.x | 0, s.y | 0)]) continue;
          let adj = false; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (map.inb(xx, yy) && !map.isWater(xx, yy) && map.landReg[map.idx(xx, yy)] === myReg && !map.blk[map.idx(xx, yy)]) adj = true; }
          if (!adj) continue;
          const d = Math.hypot(x - cx, y - cy); if (d < bd) { bd = d; best = { x: x + 0.5, y: y + 0.5 }; }
        }
        if (best && Math.hypot(s.x - best.x, s.y - best.y) > 1) setOrder(s, { t: 'move', x: best.x, y: best.y });
      }
      let n = cap - s.cargo.length;
      for (const u of landed) { if (n <= 0) break; if (u.order && u.order.t === 'board') { n--; continue; } if (hasTag(u.type, 'siege') && u.type !== 'ram') continue; setOrder(u, { t: 'board', id: s.id }); n--; }
    }
  }
  navalTarget(from) {
    let best = null, bd = 1e9;
    const reg = W.map.waterReg[W.map.idx(from.x | 0, from.y | 0)];
    for (const e of W.list) {
      if (!isEnemy(this.id, e.owner)) continue;
      let pos = null;
      if (e.kind === 'unit' && UNITS[e.type].naval && !e.inside) pos = { x: e.x, y: e.y };
      else if (e.kind === 'bld') { // coastal buildings: nearest water tile within 5
        const c = center(e); const r = e.type === 'dock' ? 0 : 4;
        for (let y = (c.y | 0) - 5; y <= (c.y | 0) + 5 && !pos; y++) for (let x = (c.x | 0) - 5; x <= (c.x | 0) + 5; x++) if (W.map.isWater(x, y) && !W.map.blk[W.map.idx(x, y)] && W.map.waterReg[W.map.idx(x, y)] === reg) { pos = { x: x + 0.5, y: y + 0.5 }; break; }
        if (!pos) continue;
        void r;
      }
      if (!pos) continue;
      if (W.map.waterReg[W.map.idx(Math.max(0, pos.x | 0), Math.max(0, pos.y | 0))] !== reg && !(e.kind === 'bld')) continue;
      const d = Math.hypot(pos.x - from.x, pos.y - from.y) + (e.kind === 'bld' ? 10 : 0);
      if (d < bd) { bd = d; best = pos; }
    }
    return best;
  }
  // ---------- callbacks ----------
  onAttacked(t, src) {
    if (!src || src.owner === 0 && !UNITS[src.type].predator) return;
    if (src.owner > 0) { if (W.t - (this.lastAttackBy[src.owner] || -99) > 10) this.attitude[src.owner] = Math.max(-100, (this.attitude[src.owner] || 0) - 3); this.lastAttackBy[src.owner] = W.t; }
    // defend: send nearby army units
    if (W.t - (this.lastDef || -9) < this.cfg.react) return;
    this.lastDef = W.t;
    const army = this.army().filter(u => (!u.order || u.order.t === 'move' || u.order.auto) && Math.hypot(u.x - src.x, u.y - src.y) < 25);
    for (const u of army) if (canAttack(u, src)) setOrder(u, { t: 'attack', id: src.id, auto: true, ox: u.x, oy: u.y });
    // villagers fight back vs wolves/lone scouts
    if (t.kind === 'unit' && t.type === 'villager' && (src.owner === 0 || hasTag(src.type, 'cavalry') && army.length === 0)) {
      for (const v of unitsNear(t.x, t.y, 5, v => v.owner === this.id && v.type === 'villager')) { if (v.order && v.order.t !== 'attack') { v.prevAfterBuild = v.order; } setOrder(v, { t: 'attack', id: src.id, then: v.prevAfterBuild }); }
    }
  }
  onTrained(u, b) { if (u.type === 'villager') setOrder(u, null); }
  onBuilt(b) { }
  onTribute(from, res, amt) { this.attitude[from] = (this.attitude[from] || 0) + amt / 25; if (from === W.humanId) msg(`${this.p.name}: "Thank you for the ${res}."`, this.p.color.l); }
  strength(pid) {
    let s = 0; for (const e of W.list) if (e.owner === pid && !e.dying) { if (e.kind === 'unit') s += e.type === 'villager' ? 0.3 : UNITS[e.type].animal ? 0 : 1 + (e.maxhp / 100); else if (e.kind === 'bld') s += e.type === 'castle' ? 8 : e.type === 'tc' ? 5 : 0.3; }
    return s + W.players[pid].age * 6;
  }
  // Evaluate a diplomatic proposal from another player. Returns {ok, reason}
  consider(from, kind) {
    const cur = this.p.stance[from];
    const me = this.strength(this.id), them = this.strength(from);
    const att = this.attitude[from] || 0;
    const recentlyHit = W.t - (this.lastAttackBy[from] || -999) < 60;
    if (kind === 'ally') {
      if (cur === 'ally') return { ok: false, reason: 'We are already allies.' };
      if (recentlyHit) return { ok: false, reason: 'You attacked us only moments ago. No.' };
      const otherEnemies = this.enemies().filter(i => i !== from);
      const biggest = Math.max(0, ...otherEnemies.map(i => this.strength(i)));
      if (att >= 25) return { ok: true, reason: 'Your generosity has earned our friendship.' };
      if (otherEnemies.length && biggest > me * 1.1 && att > -20) return { ok: true, reason: 'Together we can stand against our common foe.' };
      if (cur === 'neutral' && att >= 5) return { ok: true, reason: 'Our peace has held. We accept.' };
      return { ok: false, reason: me > them * 1.3 ? 'We do not need allies as weak as you.' : 'We do not trust you yet. Perhaps a tribute would help.' };
    }
    if (kind === 'peace') {
      if (cur !== 'enemy') return { ok: false, reason: 'We are not at war with you.' };
      if (recentlyHit && att < 10) return { ok: false, reason: 'Not while your soldiers still spill our blood!' };
      if (att >= 10) return { ok: true, reason: 'Your gifts speak of good faith. Peace it is.' };
      if (me < them * 0.9) return { ok: true, reason: 'We accept peace — for now.' };
      if (this.enemies().length > 1 && me < them * 1.4) return { ok: true, reason: 'We have other enemies to deal with. Peace.' };
      return { ok: false, reason: 'We are winning this war. No peace.' };
    }
    return { ok: false, reason: '' };
  }
  diplomacy(dt) {
    // attitude drifts toward peace when not fighting
    for (let i = 1; i < W.players.length; i++) if (i !== this.id && this.p.stance[i] !== 'enemy') this.attitude[i] = Math.min(40, (this.attitude[i] || 0) + dt * 0.01);
    // occasionally offer an alliance to the human if they have been friendly
    const h = W.humanId;
    if (this.p.stance[h] === 'neutral' && (this.attitude[h] || 0) > 20 && !this.offered && W.players.length > 3) { this.offered = true; UI.aiProposal(this.id, 'ally'); }
    // betrayal: if neutral human grows too strong, declare war (rarely)
    if (this.p.stance[h] === 'neutral' && (this.attitude[h] || 0) < -30) { setStanceMutual(this.id, h, 'enemy'); msg(`${this.p.name} has declared war on you!`, '#f88'); }
  }
}
