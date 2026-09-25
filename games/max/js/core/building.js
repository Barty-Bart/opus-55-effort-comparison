// Buildings: construction, production queues, research, defensive fire, garrisons.
import { UNITS, TECHS } from './data.js';

export class Building {
  constructor(game, def, owner, tx, ty, complete) {
    this.id = game.nextId++;
    this.game = game;
    this.kind = 'building';
    this.def = def;
    this.type = def.id;
    this.owner = owner;
    this.tx = tx; this.ty = ty;
    this.size = def.size;
    this.x = tx + def.size / 2;
    this.y = ty + def.size / 2;
    this.st = game.buildingStats(owner, def);
    this.maxHp = this.st.hp;
    this.complete = !!complete;
    this.progress = complete ? 1 : 0;
    this.hp = complete ? this.maxHp : Math.max(1, this.maxHp * 0.02);
    this.builders = 0;
    this.lastBuilders = 0;
    this.queue = [];
    this.rally = null;
    this.garrisoned = [];
    this.attackCd = game.rng.next();
    this.alive = true;
    this.ageStyle = game.players[owner].age;
    this.variant = game.rng.int(0, 1023);
    this.created = game.time;
    this.completedAt = complete ? game.time : null;
    this.housed = false;
    this.lastAttackedT = -99;
    this.lastAttacker = null;
    if (def.isFarm) {
      this.res = 'food';
      this.amount = game.players[owner].eco.farmFood;
      this.maxAmount = this.amount;
      this.farmer = null;
    }
  }

  refreshStats() {
    const st = this.game.buildingStats(this.owner, this.def);
    const frac = this.hp / this.maxHp;
    this.st = st;
    this.maxHp = st.hp;
    this.hp = Math.max(1, frac * this.maxHp);
  }
  setDef(def) {
    this.def = def; this.type = def.id;
    this.refreshStats();
  }

  update(dt) {
    const g = this.game;
    this.lastBuilders = this.builders;
    if (!this.complete) {
      if (this.builders > 0) {
        const pl = g.players[this.owner];
        const rate = ((this.builders + 2) / (3 * this.def.time)) * pl.eco.buildSpeed * (pl.buildBonus || 1);
        const dp = Math.min(rate * dt, 1 - this.progress);
        this.progress += dp;
        this.hp = Math.min(this.maxHp, this.hp + dp * this.maxHp * 0.98);
        if (this.progress >= 1 - 1e-9) g.completeBuilding(this);
      }
      this.builders = 0;
      return;
    }
    this.builders = 0;
    if (this.queue.length) this.updateProduction(dt);
    else this.housed = false;
    if (this.st.atk > 0) this.updateAttack(dt);
    if (this.garrisoned.length) {
      for (const u of this.garrisoned) if (u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + dt * 0.6);
    }
  }

  updateProduction(dt) {
    const g = this.game, pl = g.players[this.owner];
    const item = this.queue[0];
    if (item.kind === 'unit') {
      const def = UNITS[pl.lineTier[item.line]];
      if (pl.pop + def.pop > pl.popCap) {
        if (!this.housed) { this.housed = true; g.emit({ type: 'housed', player: this.owner, building: this }); }
        return;
      }
      this.housed = false;
      const mult = def.id === 'villager' ? 1 : pl.eco.trainSpeed;
      item.t += dt * mult * (pl.trainBonus || 1);
      if (item.t >= def.time) {
        this.queue.shift();
        g.spawnTrained(this, def);
      }
    } else {
      const tech = TECHS[item.id];
      item.t += dt * (pl.researchBonus || 1);
      if (item.t >= tech.time) {
        this.queue.shift();
        pl.researching.delete(item.id);
        pl.applyTech(item.id);
      }
    }
  }

  arrowCount() {
    let n = this.st.arrows;
    if (this.def.attack && this.def.attack.garrisonArrows) {
      for (const u of this.garrisoned) if (u.isVillager || u.def.classes.includes('infantry') || u.def.classes.includes('archer')) n++;
    }
    return n;
  }

  updateAttack(dt) {
    this.attackCd -= dt;
    if (this.attackCd > 0) return;
    const g = this.game;
    const t = g.findBuildingTarget(this, this.st.range);
    if (!t) { this.attackCd = 0.35; return; }
    const n = this.arrowCount();
    for (let k = 0; k < n; k++) g.launchProjectile(this, t, { spread: k });
    this.attackCd = this.st.reload;
  }
}
