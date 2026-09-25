// DOM heads-up display: resources, command card, info panel, tooltips, messages and minimap.
import { UNITS, BUILDINGS, TECHS, LINES, LINE_AGE, AGE_NAMES, HOTKEYS, VILLAGER_MENUS, RES_TYPES } from './config.js';
import { unitIcon, buildingIcon, techIcon, resIcon, cmdIcon } from './icons.js';
import { formatTime, clamp, TAU } from './util.js';

const AGE_TECH = ['feudal', 'castle', 'imperial'];
const $ = (id) => document.getElementById(id);

function costHTML(cost, p) {
  return Object.entries(cost).filter(([, v]) => v > 0).map(([k, v]) => {
    const short = p && (p.res[k] || 0) < v;
    return `<span class="cost ${short ? 'short' : ''}"><img src="${resIcon(k)}">${v}</span>`;
  }).join('');
}

let statIcons = null;
function makeStatIcons() {
  const mk = (draw) => { const c = document.createElement('canvas'); c.width = 28; c.height = 28; const x = c.getContext('2d'); draw(x); return c.toDataURL(); };
  const line = (x, pts, w, col) => { x.strokeStyle = col; x.lineWidth = w; x.lineCap = 'round'; x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.stroke(); };
  statIcons = {
    atk: mk((x) => { line(x, [[5, 23], [22, 6]], 3, '#e8ecf0'); line(x, [[8, 16], [13, 21]], 2.5, '#c9a040'); line(x, [[4, 24], [7, 21]], 3, '#7a5a30'); }),
    arm: mk((x) => { x.fillStyle = '#6a8ac0'; x.strokeStyle = '#1a2a4a'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(5, 4); x.lineTo(23, 4); x.lineTo(23, 14); x.lineTo(14, 25); x.lineTo(5, 14); x.closePath(); x.fill(); x.stroke(); }),
    parm: mk((x) => { x.fillStyle = '#a07a50'; x.strokeStyle = '#3a2410'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(5, 4); x.lineTo(23, 4); x.lineTo(23, 14); x.lineTo(14, 25); x.lineTo(5, 14); x.closePath(); x.fill(); x.stroke(); line(x, [[9, 19], [19, 9]], 1.5, '#eee'); }),
    rng: mk((x) => { x.strokeStyle = '#a07040'; x.lineWidth = 2.5; x.beginPath(); x.arc(6, 14, 11, -1.1, 1.1); x.stroke(); line(x, [[10, 4], [10, 24]], 1, '#eee'); line(x, [[4, 14], [25, 14]], 1.5, '#d0d0d0'); }),
    los: mk((x) => { x.fillStyle = '#e8e0c8'; x.beginPath(); x.ellipse(14, 14, 11, 7, 0, 0, TAU); x.fill(); x.fillStyle = '#3a6ab0'; x.beginPath(); x.arc(14, 14, 4.5, 0, TAU); x.fill(); x.fillStyle = '#111'; x.beginPath(); x.arc(14, 14, 2, 0, TAU); x.fill(); }),
    spd: mk((x) => { line(x, [[4, 9], [18, 9]], 2, '#c8e0f0'); line(x, [[8, 15], [24, 15]], 2, '#c8e0f0'); line(x, [[4, 21], [18, 21]], 2, '#c8e0f0'); }),
    gar: mk((x) => { x.fillStyle = '#a8a296'; x.fillRect(6, 8, 16, 17); x.fillStyle = '#2a2a2a'; for (let i = 6; i < 22; i += 5) x.fillRect(i, 4, 3, 4); x.fillStyle = '#3a2410'; x.fillRect(11, 16, 6, 9); }),
  };
}

export class UI {
  constructor(game, renderer, audio, session) {
    this.game = game;
    this.r = renderer;
    this.audio = audio;
    this.s = session;
    this.page = 'main';
    this.cmdSig = '';
    this.infoSig = '';
    this.topT = 0; this.cmdT = 0; this.infoT = 0; this.mmT = 0; this.countT = 0;
    this.specs = [];
    this.villCounts = { food: 0, wood: 0, gold: 0, stone: 0 };
    this.idleVills = [];
    this.tipIdx = 0;
    if (!statIcons) makeStatIcons();
    this.initDOM();
  }

  initDOM() {
    const g = this.game;
    this.hud = $('hud');
    this.hud.classList.remove('hidden');
    for (const r of RES_TYPES) {
      const el = document.querySelector(`#topbar .res[data-res="${r}"]`);
      el.querySelector('img').src = resIcon(r);
    }
    document.querySelector('#topbar .res.pop img').src = resIcon('pop');
    $('btn-idle').querySelector('img').src = unitIcon('villager', g.human.color);
    this.cmdEl = $('cmdcard');
    this.cmdEl.innerHTML = '';
    this.slots = [];
    for (let i = 0; i < 15; i++) {
      const b = document.createElement('button');
      b.className = 'cmd empty';
      b.innerHTML = `<img><span class="hk">${HOTKEYS[i]}</span><span class="qn"></span><div class="prog"></div>`;
      b.addEventListener('mouseenter', () => this.showTip(i));
      b.addEventListener('mouseleave', () => this.hideTip());
      b.addEventListener('click', (ev) => { ev.preventDefault(); this.activate(i, ev.shiftKey); });
      b.addEventListener('contextmenu', (ev) => { ev.preventDefault(); this.cancelLast(i); });
      this.cmdEl.appendChild(b);
      this.slots.push(b);
    }
    this.infoEl = $('infopanel');
    this.infoEl.addEventListener('click', (ev) => this.onInfoClick(ev));
    this.infoEl.addEventListener('contextmenu', (ev) => { ev.preventDefault(); this.onInfoClick(ev); });
    this.tipEl = $('tooltip');
    this.msgEl = $('messages');
    this.msgEl.innerHTML = '';
    this.mm = $('minimap');
    const mm = this.mm;
    let mmDrag = false;
    const mmPos = (ev) => { const rect = mm.getBoundingClientRect(); return [(ev.clientX - rect.left) * (mm.width / rect.width), (ev.clientY - rect.top) * (mm.height / rect.height)]; };
    mm.onmousedown = (ev) => {
      ev.preventDefault();
      const [mx, my] = mmPos(ev);
      const [wx, wy] = this.r.minimapToWorld(mx, my, mm.width);
      if (ev.button === 2) { this.s.input.commandAt(wx, wy, null, ev.shiftKey); return; }
      mmDrag = true; this.r.centerOn(wx, wy);
    };
    mm.oncontextmenu = (ev) => ev.preventDefault();
    this.onWinMove = (ev) => {
      if (!mmDrag) return;
      const [mx, my] = mmPos(ev);
      const [wx, wy] = this.r.minimapToWorld(mx, my, mm.width);
      this.r.centerOn(wx, wy);
    };
    this.onWinUp = () => { mmDrag = false; };
    window.addEventListener('mousemove', this.onWinMove);
    window.addEventListener('mouseup', this.onWinUp);
    $('btn-idle').onclick = () => this.s.input.cycleIdleVillager();
  }

  destroy() {
    window.removeEventListener('mousemove', this.onWinMove);
    window.removeEventListener('mouseup', this.onWinUp);
    this.mm.onmousedown = null;
    this.hideTip();
  }

  // ------------------------------------------------------------------ messages
  notify(text, type = 'info', extra = {}) {
    const html = text + (extra.cost ? ' ' + costHTML(extra.cost, this.game.human) : '');
    const top = this.msgEl.firstElementChild;
    if (top && top.dataset.src === html && !top.classList.contains('fade')) {
      // collapse repeats into a counter instead of stacking duplicates
      const n = (+top.dataset.n || 1) + 1;
      top.dataset.n = n;
      top.innerHTML = `${html} <span class="rep">×${n}</span>`;
      return;
    }
    const d = document.createElement('div');
    d.className = 'msg ' + type;
    d.dataset.src = html;
    d.innerHTML = html;
    this.msgEl.prepend(d);
    while (this.msgEl.children.length > 6) this.msgEl.lastChild.remove();
    setTimeout(() => d.classList.add('fade'), type === 'alert' ? 7000 : 5000);
    setTimeout(() => d.remove(), type === 'alert' ? 8200 : 6200);
  }

  // ------------------------------------------------------------------ per-frame
  update(dt) {
    this.topT -= dt; this.cmdT -= dt; this.infoT -= dt; this.mmT -= dt; this.countT -= dt;
    if (this.countT <= 0) { this.countT = 0.5; this.countVillagers(); }
    if (this.topT <= 0) { this.topT = 0.1; this.refreshTop(); }
    this.scoreT = (this.scoreT || 0) - dt;
    if (this.scoreT <= 0) { this.scoreT = 1; this.refreshScores(); }
    if (this.cmdT <= 0) { this.cmdT = 0.12; this.refreshCmd(); }
    if (this.infoT <= 0) { this.infoT = 0.12; this.refreshInfo(); }
    this.r.updatePings(dt);
    if (this.mmT <= 0) { this.mmT = 0.1; this.r.drawMinimap(this.mm); }
  }

  countVillagers() {
    const g = this.game, h = g.humanId;
    const c = { food: 0, wood: 0, gold: 0, stone: 0 };
    const idle = [];
    let idleMil = 0;
    for (const u of g.units) {
      if (u.dead || u.owner !== h) continue;
      if (u.isVillager) {
        if (u.garrisonedIn) continue;
        const o = u.order;
        if (!o) { idle.push(u); continue; }
        if (o.type === 'gather') {
          const k = o.kind;
          c[k === 'wood' ? 'wood' : k === 'gold' ? 'gold' : k === 'stone' ? 'stone' : 'food']++;
        }
      } else if (u.isMilitary && !u.order) idleMil++;
    }
    this.villCounts = c;
    this.idleVills = idle;
    this.idleMil = idleMil;
  }

  refreshTop() {
    const g = this.game, p = g.human;
    for (const r of RES_TYPES) {
      const el = document.querySelector(`#topbar .res[data-res="${r}"]`);
      el.querySelector('.val').textContent = Math.floor(p.res[r]);
      el.querySelector('.cnt').textContent = this.villCounts[r] || '';
    }
    const pop = document.querySelector('#topbar .res.pop');
    pop.querySelector('.val').textContent = `${p.pop}/${p.popCap}`;
    pop.classList.toggle('capped', p.pop >= p.popCap && p.popCap < 200);
    $('agename').textContent = AGE_NAMES[p.age];
    const ageTc = g.buildings.find((b) => !b.dead && b.owner === p.id && b.queue[0] && b.queue[0].kind === 'tech' && TECHS[b.queue[0].id].ageUp);
    const bar = $('ageprog');
    if (ageTc) {
      bar.classList.remove('hidden');
      bar.firstElementChild.style.width = `${(ageTc.qT / ageTc.queue[0].time) * 100}%`;
      $('agename').textContent = `Advancing to ${TECHS[ageTc.queue[0].id].name}…`;
    } else bar.classList.add('hidden');
    $('clock').textContent = formatTime(g.time);
    const idleBtn = $('btn-idle');
    idleBtn.querySelector('span').textContent = this.idleVills.length;
    idleBtn.classList.toggle('has', this.idleVills.length > 0);
  }

  refreshScores() {
    const g = this.game;
    const html = g.players.filter((p) => !p.isGaia).map((p) => {
      return `<div class="sc${p.defeated ? ' out' : ''}"><span class="sw" style="background:${p.color.main}"></span>${p.name}<span class="ag">${['I', 'II', 'III', 'IV'][p.age]}</span><b>${g.score(p)}</b></div>`;
    }).join('');
    const el = document.getElementById('scores');
    if (el.innerHTML !== html) el.innerHTML = html;
  }

  // ------------------------------------------------------------------ command card
  specsFor() {
    const g = this.game, p = g.human, sel = g.selection;
    const own = sel.filter((e) => e.owner === g.humanId && !e.dead);
    if (!own.length) return [];
    const specs = [];
    const units = own.filter((e) => e.kind === 'unit' && !e.animal);
    if (units.length) {
      const vills = units.filter((u) => u.isVillager);
      if (vills.length && this.page !== 'main') {
        const list = VILLAGER_MENUS[this.page];
        list.forEach((type, slot) => {
          if (!type) return;
          const def = BUILDINGS[type];
          const req = g.buildingRequirement(p, type);
          specs.push({
            slot, icon: buildingIcon(type, p.color, Math.max(1, p.age)), title: def.name, cost: def.cost, desc: def.desc,
            enabled: !req, reason: req, afford: p.canAfford(def.cost),
            onClick: () => { if (req) { this.error(req); return; } if (!p.canAfford(def.cost)) { this.error('Not enough resources', def.cost); return; } this.s.input.beginPlacement(type); },
          });
        });
        specs.push({ slot: 14, icon: cmdIcon('back'), title: 'Back', enabled: true, afford: true, onClick: () => { this.page = 'main'; } });
        return specs;
      }
      if (vills.length) {
        specs.push({ slot: 0, icon: cmdIcon('eco'), title: 'Build Economic Building', desc: 'Houses, mills, camps, farms, markets and more.', enabled: true, afford: true, onClick: () => { this.page = 'eco'; } });
        specs.push({ slot: 1, icon: cmdIcon('mil'), title: 'Build Military Building', desc: 'Barracks, ranges, stables, towers, walls and castles.', enabled: true, afford: true, onClick: () => { this.page = 'mil'; } });
      }
      if (units.some((u) => u.isMilitary)) {
        specs.push({ slot: 5, icon: cmdIcon('attackmove'), title: 'Attack Move', desc: 'Move to a location, attacking any enemies met along the way.', enabled: true, afford: true, onClick: () => this.s.input.beginAttackMove() });
      }
      specs.push({ slot: 6, icon: cmdIcon('stop'), title: 'Stop', desc: 'Stop the current action.', enabled: true, afford: true, onClick: () => g.cmdStop(units) });
      if (units.some((u) => u.isMilitary)) {
        const passive = units.every((u) => u.stance === 'passive');
        specs.push({ slot: 7, icon: cmdIcon('stance'), title: passive ? 'Stance: Stand Ground (click for Aggressive)' : 'Stance: Aggressive (click for Stand Ground)', desc: passive ? 'Units hold position and never chase.' : 'Units engage enemies that come into sight.', enabled: true, afford: true, onClick: () => { for (const u of units) u.stance = passive ? undefined : 'passive'; } });
      }
      specs.push({ slot: 14, icon: cmdIcon('delete'), title: 'Delete', desc: 'Kill the selected units (Del).', enabled: true, afford: true, onClick: () => g.cmdDelete(units) });
      return specs;
    }
    const blds = own.filter((e) => e.kind === 'building');
    if (!blds.length) return specs;
    const b0 = blds[0];
    const same = blds.filter((b) => b.type === b0.type && b.complete);
    if (!b0.complete) {
      specs.push({ slot: 14, icon: cmdIcon('delete'), title: 'Cancel Construction', desc: 'Remove the foundation.', enabled: true, afford: true, onClick: () => g.cmdDelete([b0]) });
      return specs;
    }
    for (const c of b0.def.cmds || []) {
      if (c.line) {
        const type = LINES[c.line][p.lineTier[c.line] || 0];
        const def = UNITS[type];
        const minAge = LINE_AGE[c.line];
        const enabled = p.age >= minAge;
        let count = 0;
        for (const b of same) for (const it of b.queue) if (it.kind === 'unit' && it.line === c.line) count++;
        specs.push({
          slot: c.slot, icon: unitIcon(type, p.color), title: `Train ${def.name}`, cost: def.cost, desc: def.desc, unit: def,
          enabled, reason: enabled ? null : `Requires ${AGE_NAMES[minAge]}`, afford: p.canAfford(def.cost), count,
          onClick: (shift) => {
            if (!enabled) { this.error(`Requires ${AGE_NAMES[minAge]}`); return; }
            const n = shift ? 5 : 1;
            let done = 0;
            for (let i = 0; i < n; i++) {
              const b = same.slice().sort((a, b2) => a.queue.length - b2.queue.length)[0];
              if (!p.canAfford(def.cost)) { if (!done) this.error('Not enough resources', def.cost); break; }
              if (b.train(c.line, 1)) done++;
            }
            if (done) this.audio.play('click');
          },
          onCancel: () => { for (const b of same) { for (let i = b.queue.length - 1; i >= 0; i--) if (b.queue[i].kind === 'unit' && b.queue[i].line === c.line) { b.cancel(i); return; } } },
        });
      } else if (c.techs || c.age) {
        const id = c.age ? AGE_TECH[p.age] : c.techs.find((t) => !p.techs.has(t));
        if (!id) continue;
        const t = TECHS[id];
        const researching = p.researching.has(id);
        const blocker = researching ? 'Researching…' : g.techBlocker(p, id);
        specs.push({
          slot: c.slot, icon: techIcon(id, p.color), title: (c.age ? 'Advance to ' : 'Research ') + t.name, cost: t.cost, desc: t.desc,
          enabled: !blocker, reason: blocker, afford: p.canAfford(t.cost), researching, time: t.time,
          onClick: () => {
            if (blocker) { this.error(blocker); return; }
            if (!p.canAfford(t.cost)) { this.error('Not enough resources', t.cost); return; }
            if (c.age && g.ageReqCount(p) < 2) { this.error(g.techBlocker(p, id)); return; }
            const b = same.slice().sort((a, b2) => a.queue.length - b2.queue.length)[0];
            if (b.research(id)) this.audio.play('click');
          },
          onCancel: () => { for (const b of same) { const i = b.queue.findIndex((it) => it.kind === 'tech' && it.id === id); if (i >= 0) { b.cancel(i); return; } } },
        });
      } else if (c.action === 'bell') {
        const rung = p.bellRung;
        specs.push({
          slot: c.slot, icon: cmdIcon(rung ? 'allclear' : 'bell'), title: rung ? 'All Clear' : 'Ring Town Bell',
          desc: rung ? 'Villagers leave shelter and go back to work.' : 'All villagers run to the nearest Town Center or tower and garrison. Each garrisoned villager adds an arrow.',
          enabled: true, afford: true, onClick: () => (rung ? g.allClear(p) : g.ringBell(p)),
        });
      } else if (c.action === 'ungarrison') {
        const n = same.reduce((s, b) => s + b.garrison.length, 0);
        specs.push({ slot: c.slot, icon: cmdIcon('ungarrison'), title: 'Ungarrison All', desc: `Release all garrisoned units (${n}).`, enabled: n > 0, reason: n ? null : 'No units garrisoned', afford: true, onClick: () => { for (const b of same) b.ungarrison(); } });
      } else if (c.trade) {
        const price = g.tradePrice(c.res, c.trade);
        const cost = c.trade === 'buy' ? { gold: price } : { [c.res]: 100 };
        specs.push({
          slot: c.slot, icon: cmdIcon(c.trade, c.res), title: c.trade === 'buy' ? `Buy 100 ${c.res} for ${price} gold` : `Sell 100 ${c.res} for ${price} gold`,
          desc: 'Market prices shift with every transaction.', cost, enabled: true, afford: p.canAfford(cost),
          onClick: (shift) => { for (let i = 0; i < (shift ? 5 : 1); i++) if (!g.trade(p, c.trade, c.res)) break; this.audio.play('click'); },
        });
      }
    }
    specs.push({ slot: 14, icon: cmdIcon('delete'), title: 'Delete Building', desc: 'Demolish this building (Del).', enabled: true, afford: true, onClick: () => g.cmdDelete(same.length ? same : [b0]) });
    return specs;
  }

  refreshCmd() {
    const specs = this.specsFor();
    this.specs = specs;
    const sig = specs.map((s) => `${s.slot}:${s.icon.length}:${s.title}:${s.enabled}:${s.afford}:${s.count || 0}:${s.researching || 0}`).join('|');
    const bySlot = new Map(specs.map((s) => [s.slot, s]));
    if (sig !== this.cmdSig) {
      this.cmdSig = sig;
      for (let i = 0; i < 15; i++) {
        const el = this.slots[i], s = bySlot.get(i);
        if (!s) { el.className = 'cmd empty'; el.querySelector('img').removeAttribute('src'); el.querySelector('.qn').textContent = ''; continue; }
        el.className = 'cmd' + (s.enabled ? '' : ' locked') + (s.enabled && !s.afford ? ' poor' : '');
        const img = el.querySelector('img');
        if (img.getAttribute('src') !== s.icon) img.src = s.icon;
        el.querySelector('.qn').textContent = s.count ? s.count : '';
      }
      if (this.tipSlot !== undefined) this.showTip(this.tipSlot);
    }
  }

  activate(slot, shift = false) {
    const s = this.specs.find((x) => x.slot === slot);
    if (!s) return false;
    this.audio.play('click');
    s.onClick(shift);
    this.refreshCmd();
    this.cmdT = 0; this.infoT = 0;
    return true;
  }
  cancelLast(slot) {
    const s = this.specs.find((x) => x.slot === slot);
    if (s && s.onCancel) { s.onCancel(); this.cmdT = 0; this.infoT = 0; }
  }
  hotkey(key, shift) {
    const i = HOTKEYS.indexOf(key.toUpperCase());
    if (i < 0) return false;
    this.refreshCmd(); // the selection may have changed this very frame
    return this.activate(i, shift);
  }

  error(text, cost) {
    this.audio.play('error');
    this.notify(text, 'warn', cost ? { cost } : {});
  }

  showTip(slot) {
    this.tipSlot = slot;
    const s = this.specs.find((x) => x.slot === slot);
    if (!s) { this.hideTip(); return; }
    let html = `<div class="tt-title">${s.title} <span class="tt-hk">(${HOTKEYS[slot]})</span></div>`;
    if (s.cost && Object.keys(s.cost).length) html += `<div class="tt-cost">${costHTML(s.cost, this.game.human)}${s.time ? `<span class="cost"><img src="${resIcon('time')}">${s.time}s</span>` : ''}</div>`;
    if (s.desc) html += `<div class="tt-desc">${s.desc}</div>`;
    if (s.unit) {
      const u = s.unit;
      html += `<div class="tt-stats">HP ${u.hp} · Attack ${u.atk}${u.range ? ` · Range ${u.range}` : ''} · Armor ${u.armor[0]}/${u.armor[1]}${u.bonus ? ' · Bonus vs ' + Object.keys(u.bonus).join(', ') : ''}</div>`;
    }
    if (!s.enabled && s.reason) html += `<div class="tt-req">${s.reason}</div>`;
    if (s.onCancel && (s.count || s.researching)) html += `<div class="tt-hint">Right-click to cancel. Shift-click to queue 5.</div>`;
    else if (s.onCancel) html += `<div class="tt-hint">Shift-click to queue 5.</div>`;
    this.tipEl.innerHTML = html;
    this.tipEl.classList.remove('hidden');
  }
  hideTip() { this.tipSlot = undefined; this.tipEl.classList.add('hidden'); }

  // ------------------------------------------------------------------ info panel
  refreshInfo() {
    const g = this.game, sel = g.selection.filter((e) => !e.dead);
    if (!sel.length) {
      const sig = 'none';
      if (this.infoSig !== sig) { this.infoSig = sig; this.infoEl.innerHTML = `<div class="info-empty">${this.emptyHint()}</div>`; }
      return;
    }
    if (sel.length === 1) { this.infoEl.innerHTML = this.singleHTML(sel[0]); this.infoSig = ''; return; }
    // group view
    const html = sel.slice(0, 40).map((e, i) => {
      const icon = e.kind === 'unit' ? unitIcon(e.type, g.players[e.owner].color) : buildingIcon(e.type, g.players[e.owner].color, g.players[e.owner].age);
      const f = clamp(e.hp / e.maxHp, 0, 1);
      return `<div class="gicon" data-idx="${i}"><img src="${icon}"><div class="ghp"><div style="width:${f * 100}%;background:${f > 0.6 ? '#4ce04c' : f > 0.3 ? '#f0d040' : '#f04030'}"></div></div></div>`;
    }).join('');
    const sig = 'g' + sel.length + html.length;
    this.infoEl.innerHTML = `<div class="info-group">${html}</div>`;
    this.infoSig = sig;
  }

  emptyHint() {
    const tips = [
      'Select your <b>Town Center</b> (H) and train <b>Villagers</b> (Q).',
      'Right-click trees, berries, gold or stone to gather with villagers.',
      'Build <b>Houses</b> to raise your population limit.',
      'Advance through the ages at the Town Center to unlock new units.',
      'Press <b>.</b> to find idle villagers. Ring the town bell when raided.',
    ];
    return `<div class="hint-title">Age of Crowns</div><div class="hint">${tips[Math.floor(this.game.time / 12) % tips.length]}</div>`;
  }

  singleHTML(e) {
    const g = this.game;
    const owner = g.players[e.owner];
    const mine = e.owner === g.humanId;
    let icon = '', name = '', stats = '', extra = '', queue = '';
    const hpf = clamp(e.hp / e.maxHp, 0, 1);
    const hp = `<div class="hpbar"><div style="width:${hpf * 100}%"></div><span>${Math.ceil(e.hp)} / ${e.maxHp}</span></div>`;
    const st = (ic, v, t) => `<span class="st" title="${t}"><img src="${statIcons[ic]}">${v}</span>`;
    if (e.kind === 'unit') {
      icon = unitIcon(e.type, owner.color);
      name = e.def.name;
      if (!e.animal) {
        const atk = e.def.atk > 0 ? st('atk', e.atk, 'Attack') : '';
        stats = `${atk}${st('arm', e.armorM, 'Melee armor')}${st('parm', e.armorP, 'Pierce armor')}${e.range ? st('rng', e.range, 'Range') : ''}${st('los', e.los, 'Line of sight')}${st('spd', e.speed.toFixed(2), 'Speed')}`;
      }
      if (e.isVillager && mine) {
        const task = { wood: 'Lumberjack', gold: 'Gold Miner', stone: 'Stone Miner', forage: 'Forager', farm: 'Farmer', hunt: 'Hunter', sheep: 'Shepherd', build: 'Builder' }[e.task];
        name = task || (e.female ? 'Villager' : 'Villager');
        if (e.carry > 0.5) extra = `Carrying <b>${Math.floor(e.carry)}</b> <img class="inl" src="${resIcon(e.carryType)}"> ${e.carryType}`;
        else if (!e.order) extra = '<span class="idle">Idle</span>';
      } else if (e.def.tc === 'monk' && mine) {
        extra = `Faith: <b>${Math.floor(e.faith * 100)}%</b>`;
      } else if (e.animal) {
        extra = `Food: <b>${e.def.food}</b>`;
      }
    } else if (e.kind === 'building') {
      icon = buildingIcon(e.type, owner.color, owner.age);
      name = e.def.name;
      stats = `${st('arm', e.def.armor[0], 'Melee armor')}${st('parm', e.def.armor[1], 'Pierce armor')}`;
      if (e.def.attack) stats = st('atk', e.def.attack.atk + owner.mods.bldAtk, 'Arrow attack') + st('rng', e.def.attack.range + owner.mods.bldRange, 'Range') + stats;
      if (e.def.garrison) stats += st('gar', `${e.garrison.length}/${e.def.garrison}`, 'Garrison');
      if (!e.complete) extra = `Under construction: <b>${Math.floor(e.progress * 100)}%</b>`;
      else if (e.type === 'farm') extra = `Food remaining: <b>${Math.floor(e.food)}</b>`;
      else if (e.type === 'house' || e.def.pop) extra = mine ? `Population: <b>${owner.pop} / ${owner.popCap}</b>` : '';
      if (e.type === 'market' && e.complete) extra = `Prices — Food ${g.tradePrice('food', 'buy')}/${g.tradePrice('food', 'sell')} · Wood ${g.tradePrice('wood', 'buy')}/${g.tradePrice('wood', 'sell')} · Stone ${g.tradePrice('stone', 'buy')}/${g.tradePrice('stone', 'sell')}`;
      if (e.type === 'wonder' && e.wonderT != null) extra = `Victory in <b>${formatTime(e.wonderT)}</b>`;
      if (mine && e.queue.length) {
        const it = e.queue[0];
        const qicon = (q) => (q.kind === 'unit' ? unitIcon(LINES[q.line][owner.lineTier[q.line] || 0], owner.color) : techIcon(q.id, owner.color));
        const f = clamp(e.qT / it.time, 0, 1);
        const label = it.kind === 'unit' ? UNITS[LINES[it.line][owner.lineTier[it.line] || 0]].name : TECHS[it.id].name;
        queue = `<div class="queue"><div class="q0" data-q="0"><img src="${qicon(it)}"><div class="qbar"><div style="width:${f * 100}%"></div></div></div>
          <div class="qinfo">${it.housed ? '<span class="housed">Need more houses!</span>' : `${label} <b>${Math.floor(f * 100)}%</b>`}</div>
          <div class="qrest">${e.queue.slice(1, 10).map((q, i) => `<img data-q="${i + 1}" src="${qicon(q)}">`).join('')}</div></div>`;
      }
    } else {
      // resource
      const names = { tree: 'Tree', gold: 'Gold Mine', stone: 'Stone Mine', berry: 'Forage Bush', carcass: e.name };
      name = names[e.type];
      const rt = e.resType;
      icon = resIcon(rt);
      extra = `${rt[0].toUpperCase() + rt.slice(1)}: <b>${Math.ceil(e.amount)}</b>`;
      return `<div class="info-single"><div class="portrait"><img src="${icon}"></div><div class="details"><div class="name">${name}</div><div class="extra">${extra}</div></div></div>`;
    }
    const ownerTag = `<span class="owner" style="color:${owner.color.light}">${owner.isGaia ? 'Gaia' : owner.name}</span>`;
    return `<div class="info-single"><div class="portrait"><img src="${icon}"></div><div class="details"><div class="name">${name} ${ownerTag}</div>${hp}<div class="stats">${stats}</div><div class="extra">${extra}</div></div>${queue}</div>`;
  }

  onInfoClick(ev) {
    const g = this.game;
    const gi = ev.target.closest('.gicon');
    if (gi) {
      const i = +gi.dataset.idx;
      const e = g.selection[i];
      if (!e) return;
      if (ev.shiftKey || ev.type === 'contextmenu') { this.s.input.setSelection(g.selection.filter((x) => x !== e)); }
      else if (ev.ctrlKey || ev.metaKey) { this.s.input.setSelection(g.selection.filter((x) => x.type === e.type)); }
      else this.s.input.setSelection([e]);
      return;
    }
    const q = ev.target.closest('[data-q]');
    if (q && g.selection.length === 1 && g.selection[0].kind === 'building') {
      g.selection[0].cancel(+q.dataset.q);
      this.audio.play('click');
      this.infoT = 0; this.cmdT = 0;
    }
  }
}
