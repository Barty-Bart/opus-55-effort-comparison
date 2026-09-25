// DOM heads-up display: resources, command grid, selection info, tooltips, messages.
import { UNITS, BUILDINGS, TECHS, RESOURCES, AGE_NAMES, GRID_KEYS, ECON_BUILDINGS, MIL_BUILDINGS, PLAYER_COLORS } from '../core/data.js';
import { unitIcon, buildingIcon, techIcon, cmdIcon, resIcon } from '../render/icons.js';

const $ = (id) => document.getElementById(id);
const fmtTime = (t) => { const s = Math.floor(t); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60; return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0'); };
const RES_LABEL = { food: 'Food', wood: 'Wood', gold: 'Gold', stone: 'Stone' };

export class HUD {
  constructor(app) {
    this.app = app;
    this.el = $('hud');
    this.cmdEls = [];
    const grid = $('commands');
    grid.innerHTML = '';
    for (let i = 0; i < 15; i++) {
      const b = document.createElement('button');
      b.className = 'cmd empty';
      b.innerHTML = '<img alt=""><span class="hk"></span><span class="cnt"></span>';
      b.dataset.slot = i;
      b.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
      b.addEventListener('click', (e) => { e.stopPropagation(); this.runSlot(i, e.shiftKey); });
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); this.runSlot(i, false, true); });
      b.addEventListener('mouseenter', () => { this.hoverSlot = i; this.showTip(); });
      b.addEventListener('mouseleave', () => { this.hoverSlot = -1; this.hideTip(); });
      grid.appendChild(b);
      this.cmdEls.push(b);
    }
    this.cmds = [];
    this.hoverSlot = -1;
    for (const r of RESOURCES) document.querySelector(`#res-${r} img`).src = resIcon(r);
    document.querySelector('#res-pop img').src = resIcon('pop');
    document.querySelector('#btn-idle img').src = resIcon('villager');
    document.querySelector('#btn-idle-mil img').src = resIcon('military');
    for (const r of [...RESOURCES, 'pop']) {
      const el = $('res-' + r);
      el.onmouseenter = () => this.showResTip(r, el);
      el.onmouseleave = () => this.hideTip();
    }
    $('info').onclick = (e) => this.onInfoClick(e);
    this.msgBox = $('messages');
    this.lastInfoKey = '';
    this.tipEl = $('tooltip');
    this.bannerT = null;
  }

  get game() { return this.app.game; }
  get ctl() { return this.app.ctl; }
  get pi() { return this.app.viewer; }
  get player() { return this.game.players[this.pi]; }

  show() { this.el.classList.remove('hidden'); }
  hide() { this.el.classList.add('hidden'); }

  // ---------------------------------------------------------------- messages
  message(text, cls = 'info', ttl = 7000) {
    // collapse repeats of the same message into a counter
    const now = performance.now();
    this.recent = this.recent || new Map();
    const prev = this.recent.get(text);
    if (prev && now - prev.t < 8000 && prev.el.isConnected) {
      prev.n++; prev.t = now;
      prev.el.textContent = `${text} (×${prev.n})`;
      prev.el.classList.remove('fade');
      clearTimeout(prev.fadeT); clearTimeout(prev.rmT);
      prev.fadeT = setTimeout(() => prev.el.classList.add('fade'), ttl);
      prev.rmT = setTimeout(() => prev.el.remove(), ttl + 1200);
      return;
    }
    const d = document.createElement('div');
    d.className = 'msg ' + cls;
    d.textContent = text;
    const rec = { t: now, n: 1, el: d };
    this.recent.set(text, rec);
    this.msgBox.appendChild(d);
    while (this.msgBox.children.length > 7) this.msgBox.removeChild(this.msgBox.firstChild);
    rec.fadeT = setTimeout(() => d.classList.add('fade'), ttl);
    rec.rmT = setTimeout(() => d.remove(), ttl + 1200);
  }
  banner(title, sub = '', ms = 3500) {
    const b = $('banner');
    b.querySelector('.banner-title').textContent = title;
    b.querySelector('.banner-sub').textContent = sub;
    b.classList.remove('hidden', 'out');
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    clearTimeout(this.bannerT); clearTimeout(this.bannerT2);
    this.bannerT = setTimeout(() => b.classList.add('out'), ms);
    this.bannerT2 = setTimeout(() => b.classList.add('hidden'), ms + 1300);
  }

  // ---------------------------------------------------------------- per-frame
  update() {
    const g = this.game, p = this.player;
    // resources
    const counts = { food: 0, wood: 0, gold: 0, stone: 0 };
    let builders = 0, idle = 0, idleMil = 0;
    for (const u of p.units) {
      if (!u.alive) continue;
      if (u.isVillager) {
        if (u.garrisonedIn) continue;
        const o = u.order;
        if (!o) { idle++; continue; }
        if (o.type === 'build' || o.type === 'repair') builders++;
        else if (o.type === 'gather') { const t = o.target; const r = t ? (t.kind === 'building' || t.kind === 'unit' ? 'food' : t.res) : null; if (r) counts[r]++; }
        else if (o.type === 'return' && u.carryType) counts[u.carryType]++;
      } else if (u.isMilitary && !u.order && !u.garrisonedIn) idleMil++;
    }
    for (const r of RESOURCES) {
      const el = $('res-' + r);
      const v = Math.floor(p.res[r]);
      const b = el.querySelector('b');
      if (b.textContent !== String(v)) b.textContent = v;
      el.querySelector('small').textContent = counts[r] ? `${counts[r]} villager${counts[r] > 1 ? 's' : ''}` : '';
    }
    const popEl = $('res-pop');
    popEl.querySelector('b').textContent = `${p.pop}/${p.popCap}`;
    const vils = p.units.filter((u) => u.alive && u.isVillager).length;
    popEl.querySelector('small').textContent = `${vils} vil · ${builders} bld`;
    popEl.classList.toggle('capped', p.pop >= p.popCap && p.popCap < 200);
    const ageT = AGE_NAMES[p.age];
    const researching = ['feudalAge', 'castleAge', 'imperialAge'].find((t) => p.researching.has(t));
    let ageHtml = ageT;
    if (researching) {
      const b = p.buildings.find((x) => x.alive && x.queue.length && x.queue[0].id === researching);
      const pct = b ? Math.floor((b.queue[0].t / TECHS[researching].time) * 100) : 0;
      ageHtml += `<small>advancing… ${pct}%</small>`;
    }
    if ($('age-label').innerHTML !== ageHtml) $('age-label').innerHTML = ageHtml;
    $('clock').textContent = fmtTime(g.time);
    const ib = $('btn-idle'), im = $('btn-idle-mil');
    ib.querySelector('span').textContent = idle; ib.classList.toggle('has', idle > 0);
    im.querySelector('span').textContent = idleMil; im.classList.toggle('has', idleMil > 0);
    // wonder timers
    const wt = [];
    for (const q of g.players) if (q.alive && q.wonderStart !== null) wt.push(`<div style="color:${q.color.css}">${q.name}'s Wonder: ${fmtTime(Math.max(0, g.opts.wonderTime - (g.time - q.wonderStart)))}</div>`);
    const wEl = $('wonder-timer');
    if (wt.length) { wEl.classList.remove('hidden'); wEl.innerHTML = wt.join(''); } else wEl.classList.add('hidden');
    this.updateCommands();
    this.updateInfo();
    if (!$('scores').classList.contains('hidden')) this.updateScores();
  }

  updateScores() {
    const g = this.game;
    const rows = g.players.map((q) => `<tr><td style="color:${q.color.css}">${q.name}${q.alive ? '' : ' (defeated)'}</td><td>${AGE_NAMES[q.age].split(' ')[0]}</td><td>${q.score()}</td></tr>`).join('');
    $('scores').innerHTML = `<table>${rows}</table>`;
  }

  // ---------------------------------------------------------------- commands
  buildCommands() {
    const ctl = this.ctl, g = this.game, p = this.player;
    const sel = ctl.ownSelection();
    const slots = new Array(15).fill(null);
    if (!sel.length) return slots;
    const units = sel.filter((e) => e.kind === 'unit');
    const blds = sel.filter((e) => e.kind === 'building');
    if (units.length) {
      const vils = units.filter((u) => u.isVillager);
      if (vils.length) {
        if (ctl.page === 'eco' || ctl.page === 'mil') {
          const list = (ctl.page === 'eco' ? ECON_BUILDINGS : MIL_BUILDINGS);
          list.forEach((type, i) => { slots[i] = this.buildCmd(type); });
          slots[14] = { icon: cmdIcon('back'), title: 'Back', desc: 'Return to villager commands.', action: () => { ctl.page = 'main'; }, hkLabel: 'Esc' };
        } else {
          slots[0] = { icon: cmdIcon('buildEco'), title: 'Build Economic Building', desc: 'Houses, mills, lumber and mining camps, farms, markets and more.', action: () => { ctl.page = 'eco'; } };
          slots[1] = { icon: cmdIcon('buildMil'), title: 'Build Military Building', desc: 'Barracks, archery ranges, stables, towers, walls and castles.', action: () => { ctl.page = 'mil'; } };
          slots[2] = { icon: cmdIcon('repair'), title: 'Repair', desc: 'Click a damaged building to repair it (costs resources).', action: () => ctl.setMode('repair') };
          slots[3] = { icon: cmdIcon('garrison'), title: 'Garrison', desc: 'Click a Town Center, tower or castle to take shelter inside.', action: () => ctl.setMode('garrison') };
          slots[12] = { icon: cmdIcon('stop'), title: 'Stop', desc: 'Stop the current action.', action: () => g.cmdStop(units) };
          slots[14] = { icon: cmdIcon('delete'), title: 'Delete', desc: 'Kill the selected units.', action: () => ctl.deleteSelection(), hkLabel: 'Del' };
        }
        return slots;
      }
      const mil = units.filter((u) => !u.def.isAnimal);
      if (mil.length) {
        slots[5] = { icon: cmdIcon('attackmove'), title: 'Attack Move', desc: 'Move to a location, attacking any enemies encountered on the way.', action: () => ctl.setMode('attackMove') };
        slots[1] = { icon: cmdIcon('garrison'), title: 'Garrison', desc: 'Click a building to garrison inside.', action: () => ctl.setMode('garrison') };
      }
      slots[12] = { icon: cmdIcon('stop'), title: 'Stop', desc: 'Stop the current action.', action: () => g.cmdStop(units) };
      slots[14] = { icon: cmdIcon('delete'), title: 'Delete', desc: 'Kill the selected units.', action: () => ctl.deleteSelection(), hkLabel: 'Del' };
      return slots;
    }
    // buildings (same type)
    const b = blds[0];
    if (!b.complete) {
      slots[14] = { icon: cmdIcon('delete'), title: 'Delete', desc: 'Cancel construction (refunds the remaining cost).', action: () => ctl.deleteSelection(), hkLabel: 'Del' };
      return slots;
    }
    const same = blds.filter((x) => x.type === b.type);
    let k = 0;
    const place = (cmd, slot) => { if (slot !== undefined) slots[slot] = cmd; else { while (k < 15 && slots[k]) k++; if (k < 15) slots[k] = cmd; } };
    for (const line of b.def.trains) place(this.trainCmd(same, line));
    if (b.type === 'townCenter') k = 5;
    else if (b.def.trains.length) k = 5;
    for (const id of b.def.researches) {
      const c = this.techCmd(b, id);
      if (!c) continue;
      if (TECHS[id].isAge) slots[4] = c; else place(c);
    }
    if (b.def.isMarket) {
      ['food', 'wood', 'stone'].forEach((r, i) => {
        slots[i] = { icon: resIcon(r), title: `Buy ${RES_LABEL[r]}`, desc: `Buy 100 ${r} for ${Math.round(p.market[r])} gold.`, cost: { gold: Math.round(p.market[r]) }, poor: p.res.gold < Math.round(p.market[r]), action: () => this.market('buy', r), overlay: 'buy' };
        slots[5 + i] = { icon: resIcon(r), title: `Sell ${RES_LABEL[r]}`, desc: `Sell 100 ${r} for ${Math.round(p.market[r] * 0.7)} gold.`, poor: p.res[r] < 100, action: () => this.market('sell', r), overlay: 'sell' };
      });
    }
    if (b.type === 'townCenter') {
      slots[10] = p.bell
        ? { icon: cmdIcon('allclear'), title: 'All Clear', desc: 'Villagers leave shelter and return to work.', action: () => g.cmdBell(this.pi, false) }
        : { icon: cmdIcon('bell'), title: 'Ring Town Bell', desc: 'All villagers run to the nearest Town Center, tower or castle and take shelter. Garrisoned villagers add arrows.', action: () => g.cmdBell(this.pi, true) };
    }
    if (b.def.garrison && b.garrisoned.length) slots[11] = { icon: cmdIcon('ungarrison'), title: 'Ungarrison', desc: `Release all ${b.garrisoned.length} garrisoned units.`, action: () => { for (const x of same) g.cmdUngarrison(x); } };
    slots[14] = { icon: cmdIcon('delete'), title: 'Delete', desc: 'Destroy this building.', action: () => ctl.deleteSelection(), hkLabel: 'Del' };
    return slots;
  }

  market(action, r) {
    const res = this.game.cmdMarket(this.pi, action, r);
    if (!res.ok) this.message(res.reason, 'alert', 3000);
    else this.app.audio.play('coin');
  }

  buildCmd(type) {
    const g = this.game, p = this.player, def = BUILDINGS[type];
    const chk = g.canBuildType(this.pi, type);
    const aff = g.canAfford(this.pi, def.cost);
    const stats = [`HP ${p.bstats[type].hp}`];
    if (def.pop) stats.push(`+${def.pop} population`);
    if (def.dropSite.length && type !== 'townCenter') stats.push(`Drop-off: ${def.dropSite.join(', ')}`);
    if (def.attack) stats.push(`Attack ${p.bstats[type].atk}, range ${p.bstats[type].range}`);
    return {
      icon: buildingIcon(type, p.colorIndex, Math.max(p.age, 1)), title: `Build ${def.name}`, cost: def.cost, desc: def.desc, stats: stats.join(' · '),
      disabled: !chk.ok, req: chk.ok ? null : chk.reason, poor: chk.ok && !aff,
      action: () => { if (!chk.ok) { this.message(chk.reason, 'alert', 3000); return; } this.ctl.startPlacement(type); },
    };
  }

  trainCmd(blds, line) {
    const g = this.game, p = this.player;
    const b = blds[0];
    const def = UNITS[p.lineTier[line]];
    const chk = g.canTrain(b, line);
    let queued = 0;
    for (const x of blds) for (const q of x.queue) if (q.kind === 'unit' && q.line === line) queued++;
    const st = p.ustats[def.id];
    const stats = `HP ${st.hp} · Attack ${st.atk} · Armor ${st.armorM}/${st.armorP}${st.range ? ' · Range ' + st.range : ''} · Speed ${st.speed.toFixed(2)}`;
    return {
      icon: unitIcon(def.id, p.colorIndex), title: `Train ${def.name}`, cost: def.cost, desc: def.desc, stats,
      disabled: !chk.ok && !chk.reason.includes('full'), req: chk.ok ? null : chk.reason, poor: chk.ok && !g.canAfford(this.pi, def.cost), count: queued || '',
      action: (shift) => {
        let n = shift ? 5 : 1, trained = 0, last = null;
        const order = blds.slice().sort((a, c) => a.queue.length - c.queue.length);
        for (let i = 0; i < n; i++) {
          const target = order.slice().sort((a, c) => a.queue.length - c.queue.length)[0];
          const r = g.cmdTrain(target, line, 1);
          if (!r || !r.ok) { last = r; break; }
          trained++;
        }
        if (!trained && last) { this.message(last.reason, 'alert', 3000); this.app.audio.play('error'); }
        else this.app.audio.play('click');
      },
      rightAction: () => {
        for (const x of blds) for (let i = x.queue.length - 1; i >= 0; i--) if (x.queue[i].kind === 'unit' && x.queue[i].line === line) { g.cmdCancel(x, i); return; }
      },
    };
  }

  techCmd(b, id) {
    const g = this.game, p = this.player, t = TECHS[id];
    const chk = g.canResearch(b, id);
    if (chk.done || chk.hidden) return null;
    if (!chk.ok && chk.busy && !p.researching.has(id)) { /* another age tech running */ }
    return {
      icon: techIcon(id, t.icon, p.colorIndex), title: `Research ${t.name}`, cost: t.cost, desc: t.desc, stats: `Research time ${t.time}s`,
      disabled: !chk.ok && !chk.busy, busy: p.researching.has(id), req: chk.ok ? null : chk.reason, poor: chk.ok && !g.canAfford(this.pi, t.cost),
      action: () => {
        const r = g.cmdResearch(b, id);
        if (!r.ok) { this.message(r.reason, 'alert', 3000); this.app.audio.play('error'); } else this.app.audio.play('click');
      },
    };
  }

  updateCommands() {
    const slots = this.buildCommands();
    this.cmds = slots;
    for (let i = 0; i < 15; i++) {
      const c = slots[i], el = this.cmdEls[i];
      if (!c) { if (!el.classList.contains('empty')) { el.className = 'cmd empty'; el._icon = null; } continue; }
      const cls = 'cmd' + (c.disabled ? ' disabled' : '') + (c.poor ? ' poor' : '') + (c.busy ? ' busy' : '');
      if (el.className !== cls) el.className = cls;
      if (el._icon !== c.icon) { el.querySelector('img').src = c.icon; el._icon = c.icon; }
      el.querySelector('.hk').textContent = c.hkLabel || GRID_KEYS[i];
      el.querySelector('.cnt').textContent = c.count || (c.overlay === 'buy' ? '+' : c.overlay === 'sell' ? '−' : '');
    }
    if (this.hoverSlot >= 0) this.showTip();
  }

  runSlot(i, shift = false, right = false) {
    const c = this.cmds[i];
    if (!c) return false;
    if (right) { if (c.rightAction) c.rightAction(); return true; }
    if (c.disabled && !c.busy) { if (c.req) this.message(c.req, 'alert', 2500); this.app.audio.play('error'); return true; }
    c.action(shift);
    this.updateCommands();
    return true;
  }
  hotkey(key, shift) {
    const i = GRID_KEYS.indexOf(key.toUpperCase());
    if (i < 0) return false;
    this.updateCommands();
    const c = this.cmds[i];
    if (c && c.hkLabel) return false; // Delete / Back have dedicated keys (Del / Esc)
    return this.runSlot(i, shift);
  }

  // ---------------------------------------------------------------- tooltip
  costHTML(cost) {
    const p = this.player;
    return RESOURCES.filter((r) => cost && cost[r]).map((r) => `<span class="${p.res[r] < cost[r] ? 'no' : ''}"><img src="${resIcon(r)}">${cost[r]}</span>`).join('');
  }
  showTip() {
    const c = this.cmds[this.hoverSlot];
    if (!c) { this.hideTip(); return; }
    const el = this.tipEl;
    const hk = c.hkLabel || GRID_KEYS[this.hoverSlot];
    el.innerHTML = `<div class="tt-title">${c.title}<span class="tt-hk">(${hk})</span></div>` +
      (c.cost ? `<div class="tt-cost">${this.costHTML(c.cost)}</div>` : '') +
      (c.req ? `<div class="tt-req">${c.req}</div>` : '') +
      (c.desc ? `<div class="tt-desc">${c.desc}</div>` : '') +
      (c.stats ? `<div class="tt-stats">${c.stats}</div>` : '');
    el.classList.remove('hidden');
    const r = this.cmdEls[this.hoverSlot].getBoundingClientRect();
    el.style.left = Math.max(6, r.left) + 'px';
    el.style.top = '';
    el.style.bottom = (window.innerHeight - r.top + 8) + 'px';
  }
  showResTip(r, anchor) {
    const el = this.tipEl, p = this.player;
    let html;
    if (r === 'pop') html = `<div class="tt-title">Population</div><div class="tt-desc">Current population / limit. Build Houses (+5), Town Centers (+5) and Castles (+20) to raise the limit, up to 200.</div>`;
    else html = `<div class="tt-title">${RES_LABEL[r]}</div><div class="tt-desc">${{ food: 'Gathered from sheep, deer, wild boar, forage bushes, fish and farms.', wood: 'Chopped from trees.', gold: 'Mined from gold mines. Also earned by selling at the Market.', stone: 'Mined from stone mines. Used for towers, walls and castles.' }[r]}</div><div class="tt-stats">Gathered so far: ${Math.floor(p.stats.gathered[r])}</div>`;
    el.innerHTML = html;
    el.classList.remove('hidden');
    const rc = anchor.getBoundingClientRect();
    el.style.left = rc.left + 'px'; el.style.top = (rc.bottom + 8) + 'px'; el.style.bottom = '';
  }
  hideTip() { this.tipEl.classList.add('hidden'); }

  // ---------------------------------------------------------------- info panel
  statHTML(icon, text, title = '') { return `<span class="stat" title="${title}"><img src="${resIcon(icon)}">${text}</span>`; }
  ownerHTML(o) {
    if (o < 0) return '<div class="sel-owner" style="color:#c8c0a8">Gaia</div>';
    const q = this.game.players[o];
    return `<div class="sel-owner" style="color:${q.color.css}">${q.name}${o === this.pi ? '' : this.game.isEnemy(o, this.pi) ? ' · enemy' : ' · ally'}</div>`;
  }
  updateInfo() {
    const ctl = this.ctl, g = this.game;
    const sel = [...ctl.sel].filter((e) => e.alive && !e.garrisonedIn);
    const el = $('info');
    let html = '';
    if (!sel.length) {
      html = `<div class="sel-desc" style="margin-top:4px;font-size:16px">${this.idleHint()}</div>`;
    } else if (sel.length === 1) html = this.singleInfo(sel[0]);
    else {
      html = '<div class="multi">';
      const shown = sel.slice(0, 48);
      for (const u of shown) {
        const col = u.owner >= 0 ? g.players[u.owner].colorIndex : 7;
        const icon = u.kind === 'unit' ? unitIcon(u.type, col) : u.kind === 'building' ? buildingIcon(u.type, col, Math.max(1, u.ageStyle)) : resIcon(u.res || 'food');
        html += `<div class="mu" data-id="${u.id}"><img src="${icon}"><div class="mhp"><i style="width:${Math.round((u.hp / u.maxHp) * 100)}%"></i></div></div>`;
      }
      if (sel.length > 48) html += `<div class="sel-status">+${sel.length - 48} more</div>`;
      html += '</div>';
    }
    if (html !== this.lastInfoKey) { el.innerHTML = html; this.lastInfoKey = html; }
  }
  idleHint() {
    const p = this.player, g = this.game;
    if (this.app.settings.hints === false) return '';
    const tc = p.buildings.find((b) => b.type === 'townCenter' && b.alive);
    if (tc && !tc.queue.length && p.age < 3 && p.units.filter((u) => u.isVillager).length < 30) return 'Tip: your Town Center is idle. Select it (H) and train villagers (Q).';
    if (p.pop >= p.popCap && p.popCap < 200) return 'Tip: you are at your population limit. Select a villager and build a House (Q → Q).';
    if (g.time < 240) return 'Select villagers with a left-click or drag box, then right-click sheep, trees, berries or mines to gather. Right-click the ground to move.';
    return 'Select a unit or building to see its details and commands.';
  }
  singleInfo(e) {
    const g = this.game, p = this.player;
    const own = e.owner === this.pi;
    if (e.kind === 'resource') {
      const icon = e.type === 'tree' ? resIcon('wood') : e.type === 'gold' ? resIcon('gold') : e.type === 'stone' ? resIcon('stone') : resIcon('food');
      const name = e.type === 'carcass' ? `${UNITS[e.animal] ? UNITS[e.animal].name : 'Animal'} (carcass)` : e.def.name;
      return `<div class="sel-single"><div class="sel-portrait"><img src="${icon}"></div><div class="sel-main"><div class="sel-name">${name}</div>${this.ownerHTML(-1)}<div class="sel-stats">${this.statHTML(e.res, Math.ceil(e.amount) + ' ' + e.res + ' remaining')}</div></div></div>`;
    }
    const colorIdx = e.owner >= 0 ? g.players[e.owner].colorIndex : 7;
    const hp = `<div class="hpbar"><i style="width:${Math.max(0, Math.round((e.hp / e.maxHp) * 100))}%"></i></div><div class="hptext">${Math.ceil(e.hp)}/${e.maxHp}</div>`;
    if (e.kind === 'unit') {
      const st = e.st;
      let stats = '';
      if (st.atk > 0 && !e.def.isMonk) {
        const bon = Object.entries(st.bonus || {}).filter(([c]) => c !== 'animal').map(([c, v]) => `+${v} vs ${c}`).join(', ');
        stats += this.statHTML('attack', `${st.atk}${bon ? ` <span class="bonus">(${bon})</span>` : ''}`, 'Attack');
      }
      if (!e.def.isAnimal || e.def.aggressiveWhenHit) stats += this.statHTML('armor', `${st.armorM}/${st.armorP}`, 'Melee / pierce armor');
      if (st.range > 0) stats += this.statHTML('range', st.range, 'Range');
      stats += this.statHTML('los', st.los, 'Line of sight');
      let status = '';
      if (e.isVillager) {
        const o = e.order;
        const task = !o ? 'Idle' : o.type === 'gather' ? `Gathering ${o.target && o.target.kind === 'building' ? 'food (farm)' : o.target ? (o.target.res || 'food') : ''}` : o.type === 'return' ? 'Returning resources' : o.type === 'build' ? 'Building' : o.type === 'repair' ? 'Repairing' : o.type === 'move' ? 'Moving' : o.type === 'attack' ? 'Attacking' : o.type === 'garrison' ? 'Seeking shelter' : o.type === 'flee' ? 'Fleeing' : '';
        status = `<div class="sel-status">${task}${e.carry >= 1 ? ` · carrying ${Math.floor(e.carry)} ${e.carryType}` : ''}</div>`;
      } else if (e.def.isMonk) {
        status = `<div class="sel-status">Faith: ${Math.floor(e.faith)}%</div>`;
      } else if (e.def.isAnimal) {
        status = `<div class="sel-status">${e.def.food} food</div>`;
      }
      return `<div class="sel-single"><div class="sel-portrait"><img src="${unitIcon(e.type, colorIdx)}">${hp}</div><div class="sel-main"><div class="sel-name">${e.def.name}</div>${this.ownerHTML(e.owner)}<div class="sel-stats">${stats}</div>${status}<div class="sel-desc">${e.def.desc || ''}</div></div></div>`;
    }
    // building
    const def = e.def;
    let body = '';
    if (!e.complete) {
      body += `<div class="sel-status">Under construction · ${e.lastBuilders || 0} builder${e.lastBuilders === 1 ? '' : 's'}</div><div class="progress"><i style="width:${Math.floor(e.progress * 100)}%"></i></div>`;
    } else {
      let stats = this.statHTML('armor', `${e.st.armorM}/${e.st.armorP}`, 'Melee / pierce armor');
      if (e.st.atk) stats += this.statHTML('attack', `${e.st.atk} × ${e.arrowCount()} arrow${e.arrowCount() > 1 ? 's' : ''}`, 'Attack') + this.statHTML('range', e.st.range, 'Range');
      if (def.garrison) stats += `<span class="stat">Garrison ${e.garrisoned.length}/${def.garrison}</span>`;
      if (def.isFarm) stats += this.statHTML('food', `${Math.ceil(e.amount)} food left`);
      if (def.pop) stats += this.statHTML('pop', `+${def.pop}`);
      body += `<div class="sel-stats">${stats}</div>`;
      if (own && e.queue.length) {
        body += '<div class="queue">';
        e.queue.forEach((q, i) => {
          const icon = q.kind === 'unit' ? unitIcon(p.lineTier[q.line], p.colorIndex) : techIcon(q.id, TECHS[q.id].icon, p.colorIndex);
          const total = q.kind === 'unit' ? UNITS[p.lineTier[q.line]].time : TECHS[q.id].time;
          body += `<div class="qitem ${i === 0 ? 'first' : ''}" data-qid="${q.qid}" title="Click to cancel"><img src="${icon}">${i === 0 ? `<div class="qp"><i style="width:${Math.floor((q.t / total) * 100)}%"></i></div>` : ''}</div>`;
        });
        body += '</div>';
        if (e.housed) body += '<div class="sel-status housed">Need more houses!</div>';
      }
      if (def.isMarket && own) body += `<div class="market-row">Prices (per 100): food <span>${Math.round(p.market.food)}</span> · wood <span>${Math.round(p.market.wood)}</span> · stone <span>${Math.round(p.market.stone)}</span></div>`;
      if (!e.queue.length || !own) body += `<div class="sel-desc">${def.desc || ''}</div>`;
    }
    return `<div class="sel-single"><div class="sel-portrait"><img src="${def.isFarm ? buildingIcon('farm', colorIdx, 1) : buildingIcon(e.type, colorIdx, Math.max(1, e.ageStyle))}">${hp}</div><div class="sel-main"><div class="sel-name">${def.name}</div>${this.ownerHTML(e.owner)}${body}</div></div>`;
  }
  onInfoClick(ev) {
    const q = ev.target.closest('.qitem');
    const ctl = this.ctl, g = this.game;
    if (q) {
      const b = [...ctl.sel][0];
      const i = b && b.kind === 'building' && b.owner === this.pi ? b.queue.findIndex((x) => x.qid === Number(q.dataset.qid)) : -1;
      if (i >= 0) { g.cmdCancel(b, i); this.app.audio.play('click'); this.lastInfoKey = ''; }
      return;
    }
    const mu = ev.target.closest('.mu');
    if (mu) {
      const id = Number(mu.dataset.id);
      const e = [...ctl.sel].find((x) => x.id === id);
      if (!e) return;
      if (ev.shiftKey) ctl.sel.delete(e);
      else if (ev.ctrlKey || ev.metaKey) { const t = e.type; ctl.select([...ctl.sel].filter((x) => x.type === t)); return; }
      else ctl.select([e]);
      ctl.selectionChanged();
    }
  }

  // ---------------------------------------------------------------- end screen
  showEnd(victory, reason) {
    const g = this.game;
    const s = $('end-screen');
    s.classList.remove('hidden');
    const t = s.querySelector('.end-title');
    t.textContent = victory ? 'Victory!' : 'Defeat';
    t.classList.toggle('defeat', !victory);
    s.querySelector('.end-sub').textContent = reason + ` — game time ${fmtTime(g.time)}`;
    const rows = [['', ...g.players.map((q) => `<span style="color:${q.color.css}">${q.name}</span>`)]];
    const add = (label, f) => rows.push([label, ...g.players.map(f)]);
    add('Score', (q) => q.score());
    add('Units killed', (q) => q.stats.kills);
    add('Units lost', (q) => q.stats.unitsLost);
    add('Buildings razed', (q) => q.stats.razed);
    add('Food / Wood', (q) => `${Math.floor(q.stats.gathered.food)} / ${Math.floor(q.stats.gathered.wood)}`);
    add('Gold / Stone', (q) => `${Math.floor(q.stats.gathered.gold)} / ${Math.floor(q.stats.gathered.stone)}`);
    add('Technologies', (q) => q.stats.techs);
    const at = (t) => (t === null ? '—' : t === 0 ? 'start' : fmtTime(t));
    add('Feudal Age', (q) => at(q.stats.ageTimes[1]));
    add('Castle Age', (q) => at(q.stats.ageTimes[2]));
    add('Imperial Age', (q) => at(q.stats.ageTimes[3]));
    add('Most villagers', (q) => q.stats.maxVillagers);
    add('Largest army', (q) => q.stats.maxMilitary);
    s.querySelector('.stats').innerHTML = rows.map((r, i) => `<tr>${r.map((c) => (i === 0 ? `<th>${c}</th>` : `<td>${c}</td>`)).join('')}</tr>`).join('');
    // score graph
    const cv = $('end-graph'), ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    const maxT = Math.max(60, g.time), maxS = Math.max(100, ...g.players.flatMap((q) => q.stats.history.map((h) => h.score)), ...g.players.map((q) => q.score()));
    ctx.strokeStyle = 'rgba(217,180,90,0.15)'; ctx.lineWidth = 1;
    for (let k = 1; k < 5; k++) { ctx.beginPath(); ctx.moveTo(0, (k * cv.height) / 5); ctx.lineTo(cv.width, (k * cv.height) / 5); ctx.stroke(); }
    for (const q of g.players) {
      const pts = [{ t: 0, score: 0 }, ...q.stats.history, { t: q.defeatedAt ?? g.time, score: q.score() }];
      ctx.strokeStyle = q.color.css; ctx.lineWidth = 2.5;
      ctx.beginPath();
      pts.forEach((h, i) => { const x = (h.t / maxT) * (cv.width - 10) + 5, y = cv.height - 6 - (h.score / maxS) * (cv.height - 16); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.stroke();
    }
    ctx.fillStyle = '#b9a57c'; ctx.font = '13px Georgia'; ctx.fillText('Score over time', 10, 16);
    const others = g.players.filter((q) => q.alive).length;
    $('end-continue').classList.toggle('hidden', !victory && others < 2);
    $('end-continue').textContent = victory ? 'Keep Playing' : 'Spectate';
  }
}

export { fmtTime, PLAYER_COLORS };
