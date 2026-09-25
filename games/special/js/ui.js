// ===== User interface: HUD, input, commands, menus, diplomacy, cheats =====
'use strict';
const $ = s => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const RES_ICON = { food: '🍖', wood: '🪵', gold: '🪙', stone: '🪨' };
const TIPS = [
  'Keep your Town Center busy training Villagers — a strong economy wins games.',
  'Scout with your Scout Cavalry to find sheep: any sheep your units walk near becomes yours.',
  'Build Houses before you hit the population limit (shown top-left).',
  'Build a Lumber Camp next to a forest and a Mining Camp next to gold to shorten walking.',
  'Right-click a sheep with Villagers to slaughter it and gather its food.',
  'Advance to the Feudal Age at the Town Center once you have 2 Dark Age buildings (Barracks, Mill, Lumber Camp, Mining Camp or Dock).',
  'Spearmen counter cavalry, Skirmishers counter archers, archers beat slow infantry.',
  'Fight from high ground: +25% damage downhill, −25% uphill.',
  'Build a Dock on the shoreline: Fishing Ships are an excellent food source.',
  'If raiders attack, ring the Town Bell (TC button) — press it again for All Clear to resume work.',
  'Monks can pick up Relics. Each Relic in a Monastery produces gold.',
  'Press Enter to chat or enter cheat codes (when allowed in setup).',
];

const UI = {
  selection: [], groups: {}, mode: null, drag: null, mouse: { x: 0, y: 0, tx: 0, ty: 0, inCanvas: false }, hover: null,
  keys: new Set(), panelKey: '', lastPanel: 0, page: 'main', paused: false, chatOpen: false, settings: null, spec: null, fromEditor: false,
  gameRunning: false, tipIdx: 0, tipT: 0,
  onRemoved(e) { const i = this.selection.indexOf(e); if (i >= 0) this.selection.splice(i, 1); },
  deselect(e) { const i = this.selection.indexOf(e); if (i >= 0) this.selection.splice(i, 1); },
  human() { return W.players[W.humanId]; },
};

// ---------- screens ----------
function showScreen(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('hidden', s.id !== id);
  document.body.classList.toggle('in-game', id === 'hud');
  document.body.classList.toggle('in-editor', id === 'editor');
  if (R.cv) resize();
}
function initMenus() {
  $('#btn-sp').onclick = () => { Sound.init(); Sound.startMusic(); buildSetup(); showScreen('setup'); };
  $('#btn-editor').onclick = () => { Sound.init(); Sound.startMusic(); Editor.open(); };
  $('#btn-help').onclick = () => { Sound.init(); openHelp(); };
  $('#btn-audio').onclick = () => { Sound.init(); openAudio(); };
  document.addEventListener('pointerdown', () => { Sound.init(); if (!Sound.musicOn && Sound.ctx) Sound.startMusic(); }, { once: true });
}
function openModal(title, html, buttons) {
  const m = $('#modal'); m.classList.remove('hidden');
  m.innerHTML = `<div class="modal-box"><h2>${title}</h2><div class="modal-body">${html}</div><div class="modal-btns"></div></div>`;
  const bb = m.querySelector('.modal-btns');
  for (const [label, fn] of (buttons || [['Close', null]])) { const b = el('button', 'btn', label); b.onclick = () => { if (fn && fn() === false) return; closeModal(); }; bb.appendChild(b); }
  return m;
}
function closeModal() { $('#modal').classList.add('hidden'); $('#modal').innerHTML = ''; }
function openHelp() {
  let extra = '';
  if (UI.gameRunning && W) {
    const others = W.players.filter((p, i) => p && i !== W.humanId);
    extra = `<h3>This match</h3><p>Map: ${W.settings.mapLabel || W.settings.mapType}. ${W.settings.cheats ? 'Cheats allowed.' : 'Cheats disabled.'}</p><ul>${others.map(p => `<li><span class="sw" style="background:${p.color.c}"></span>${p.name} (${CIVS[p.civ].name}) — ${p.alive ? stanceLabel(W.players[W.humanId].stance[p.id]) : 'defeated'}</li>`).join('')}</ul>
    <p><b>Win condition:</b> you win when every surviving player is your <i>ally</i>. Neutral (peace) players must be allied or defeated.</p>`;
  }
  openModal('Help & Rules', extra + HELP_TEXT);
}
function openAudio() {
  const v = Sound.vol;
  const m = openModal('Audio Settings', `
    <label class="row">Master <input type="range" id="v-master" min="0" max="1" step="0.05" value="${v.master}"></label>
    <label class="row">Music <input type="range" id="v-music" min="0" max="1" step="0.05" value="${v.music}"></label>
    <label class="row">Effects <input type="range" id="v-sfx" min="0" max="1" step="0.05" value="${v.sfx}"></label>
    <label class="row">Voices <input type="range" id="v-voice" min="0" max="1" step="0.05" value="${v.voice}"></label>
    <label class="row"><input type="checkbox" id="v-mute" ${v.muted ? 'checked' : ''}> Mute all</label>
    <p class="small">Voices use your system's built-in speech voices for each civilization's language (French, German, Spanish, Italian, Japanese, Chinese, Greek, Swedish, Arabic). If a language voice is missing, a synthesized formant voice is used instead.</p>
    <button class="btn" id="v-test">Test voice</button>`);
  for (const k of ['master', 'music', 'sfx', 'voice']) m.querySelector('#v-' + k).oninput = e => { Sound.vol[k] = +e.target.value; Sound.applyVol(); Sound.saveVol(); };
  m.querySelector('#v-mute').onchange = e => { Sound.vol.muted = e.target.checked; Sound.applyVol(); Sound.saveVol(); if (Sound.vol.muted && 'speechSynthesis' in window) speechSynthesis.cancel(); };
  m.querySelector('#v-test').onclick = () => { const civ = UI.gameRunning ? W.players[W.humanId].civ : ($('#s-civ') ? $('#s-civ').value : 'franks'); const fake = { id: 4, type: 'villager', owner: 1 }; const oldW = W; if (!W) { window.W = null; } Sound.lastVoiceT = 0; speakAs(civ, 'select'); };
}
function speakAs(civ, kind) {
  if (W && W.players) { const u = W.list.find(e => e.owner === W.humanId && e.kind === 'unit'); if (u && W.players[W.humanId].civ === civ) { Sound.speak(u, kind); return; } }
  const tmpW = W; W = { players: [null, { civ, color: PLAYER_COLORS[0] }] };
  Sound.speak({ id: 4, type: 'knight', owner: 1 }, kind);
  W = tmpW;
}

// ---------- game setup ----------
const SETUP_DEFAULT = { name: 'Player', color: 0, civ: 'franks', mapType: 'coastal', size: 'small', opponents: 2, difficulty: 'standard', teams: 'ffa', startAge: 0, startRes: 'standard', fog: 'normal', speed: '1', seed: 0, cheats: true, tips: true, customMap: '' };
function loadSetup() { try { return Object.assign({}, SETUP_DEFAULT, JSON.parse(localStorage.getItem('aoe_setup') || '{}')); } catch (e) { return Object.assign({}, SETUP_DEFAULT); } }
function buildSetup() {
  const s = loadSetup();
  if (!s.seed) s.seed = (Math.random() * 1e6) | 0;
  const maps = Editor.savedList();
  const civOpts = Object.keys(CIVS).map(k => `<option value="${k}" ${s.civ === k ? 'selected' : ''}>${CIVS[k].name}</option>`).join('');
  $('#setup').innerHTML = `<div class="panel setup-panel">
    <h1>Game Setup</h1>
    <div class="setup-grid">
      <div class="col">
        <h3>You</h3>
        <label>Name <input id="s-name" maxlength="16" value="${s.name}"></label>
        <label>Color <div id="s-colors" class="colors">${PLAYER_COLORS.map((c, i) => `<span class="swatch ${i === s.color ? 'on' : ''}" data-i="${i}" style="background:${c.c}" title="${c.name}"></span>`).join('')}</div></label>
        <label>Civilization <select id="s-civ">${civOpts}</select></label>
        <div id="civ-info" class="civ-info"></div>
        <h3>Opponents</h3>
        <label>Computer players <select id="s-opp">${[1, 2, 3].map(n => `<option ${s.opponents == n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label>Difficulty <select id="s-diff">${['easy', 'standard', 'hard', 'hardest'].map(d => `<option value="${d}" ${s.difficulty === d ? 'selected' : ''}>${d[0].toUpperCase() + d.slice(1)}</option>`).join('')}</select></label>
        <label>Teams <select id="s-teams">
          <option value="ffa" ${s.teams === 'ffa' ? 'selected' : ''}>Free for all</option>
          <option value="2v2" ${s.teams === '2v2' ? 'selected' : ''}>Teams: You + Computer 1 vs the rest</option>
          <option value="1vall" ${s.teams === '1vall' ? 'selected' : ''}>You vs all computers (they are allied)</option>
        </select></label>
        <div id="opp-list" class="small"></div>
      </div>
      <div class="col">
        <h3>Map</h3>
        <label>Map type <select id="s-map">
          <option value="land" ${s.mapType === 'land' ? 'selected' : ''}>Highlands (land, hills & cliffs)</option>
          <option value="coastal" ${s.mapType === 'coastal' ? 'selected' : ''}>Coastal (mixed land & inland sea)</option>
          <option value="islands" ${s.mapType === 'islands' ? 'selected' : ''}>Islands (naval, transports needed)</option>
          <option value="custom" ${s.mapType === 'custom' ? 'selected' : ''} ${maps.length ? '' : 'disabled'}>Custom map (from Map Editor)</option>
        </select></label>
        <label id="lab-custom" class="${s.mapType === 'custom' ? '' : 'hidden'}">Custom map <select id="s-custom">${maps.map(m => `<option ${m === s.customMap ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
        <label>Map size <select id="s-size">${Object.keys(MAP_SIZES).map(k => `<option value="${k}" ${s.size === k ? 'selected' : ''}>${k[0].toUpperCase() + k.slice(1)} (${MAP_SIZES[k]}×${MAP_SIZES[k]})</option>`).join('')}</select></label>
        <label>Map seed <span class="inline"><input id="s-seed" type="number" value="${s.seed}"><button class="btn small" id="s-reseed">🎲</button></span></label>
        <canvas id="s-preview" width="220" height="120"></canvas>
        <h3>Rules</h3>
        <label>Starting age <select id="s-age">${AGES.map((a, i) => `<option value="${i}" ${+s.startAge === i ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
        <label>Starting resources <select id="s-res"><option value="standard" ${s.startRes === 'standard' ? 'selected' : ''}>Standard (200/200/100/200)</option><option value="medium" ${s.startRes === 'medium' ? 'selected' : ''}>Medium (500/500/300/300)</option><option value="high" ${s.startRes === 'high' ? 'selected' : ''}>High (1000 each)</option></select></label>
        <label>Visibility <select id="s-fog"><option value="normal" ${s.fog === 'normal' ? 'selected' : ''}>Normal (black map + fog of war)</option><option value="explored" ${s.fog === 'explored' ? 'selected' : ''}>Explored (fog of war only)</option><option value="none" ${s.fog === 'none' ? 'selected' : ''}>All visible</option></select></label>
        <label>Game speed <select id="s-speed"><option value="0.7" ${s.speed === '0.7' ? 'selected' : ''}>Slow</option><option value="1" ${s.speed === '1' ? 'selected' : ''}>Normal</option><option value="1.5" ${s.speed === '1.5' ? 'selected' : ''}>Fast</option><option value="2" ${s.speed === '2' ? 'selected' : ''}>Very fast</option></select></label>
        <label class="check"><input type="checkbox" id="s-cheats" ${s.cheats ? 'checked' : ''}> Allow cheats</label>
        <label class="check"><input type="checkbox" id="s-tips" ${s.tips ? 'checked' : ''}> Show newcomer tips</label>
      </div>
    </div>
    <div class="setup-btns"><button class="btn" id="s-back">Back</button><button class="btn primary" id="s-start">Start Game</button></div>
  </div>`;
  let color = s.color;
  const civInfo = () => {
    const c = CIVS[$('#s-civ').value], uu = UNITS[c.uu];
    $('#civ-info').innerHTML = `<b>${c.name}</b> <span class="small">(voices: ${c.lang})</span><ul>${c.bonuses.map(b => `<li>${b}</li>`).join('')}</ul><div class="uu"><b>Unique unit:</b> ${uu.name} — ${uu.desc}</div>`;
  };
  const oppList = () => {
    const n = +$('#s-opp').value, t = $('#s-teams').value;
    const rows = []; for (let i = 0; i < n; i++) rows.push(`Computer ${i + 1}: ${teamOf(t, i + 1, n + 1) === teamOf(t, 0, n + 1) && t !== 'ffa' ? '<b>ally</b>' : 'enemy'}`);
    $('#opp-list').innerHTML = rows.join('<br>');
  };
  const preview = () => {
    const cv = $('#s-preview'), g = cv.getContext('2d'); g.fillStyle = '#111'; g.fillRect(0, 0, cv.width, cv.height);
    const mt = $('#s-map').value;
    let spec;
    try {
      if (mt === 'custom') spec = Editor.load($('#s-custom').value);
      else spec = generateMapSpec({ size: 'tiny', seed: +$('#s-seed').value, mapType: mt, numPlayers: +$('#s-opp').value + 1 });
    } catch (e) { return; }
    if (!spec) return;
    const n = spec.n, k = cv.width / (n * 2);
    g.save(); g.setTransform(k, k / 2, -k, k / 2, cv.width / 2, 0);
    for (let i = 0; i < n * n; i++) { g.fillStyle = TER_COL[spec.ter[i]]; g.fillRect(i % n, (i / n) | 0, 1.05, 1.05); }
    for (const o of spec.objects) if (o.k === 'tree') { g.fillStyle = '#244a1c'; g.fillRect(o.x, o.y, 1, 1); } else if (o.k === 'bld') { g.fillStyle = '#fff'; g.fillRect(o.x, o.y, 4, 4); }
    g.restore();
  };
  $('#s-colors').onclick = e => { const i = e.target.dataset.i; if (i === undefined) return; color = +i; for (const sw of document.querySelectorAll('#s-colors .swatch')) sw.classList.toggle('on', +sw.dataset.i === color); };
  $('#s-civ').onchange = () => { civInfo(); speakAs($('#s-civ').value, 'select'); };
  $('#s-opp').onchange = () => { oppList(); preview(); };
  $('#s-teams').onchange = oppList;
  $('#s-map').onchange = () => { $('#lab-custom').classList.toggle('hidden', $('#s-map').value !== 'custom'); preview(); };
  $('#s-custom').onchange = preview; $('#s-seed').onchange = preview;
  $('#s-reseed').onclick = () => { $('#s-seed').value = (Math.random() * 1e6) | 0; preview(); };
  $('#s-back').onclick = () => showScreen('menu');
  $('#s-start').onclick = () => {
    const cfg = {
      name: $('#s-name').value.trim() || 'Player', color, civ: $('#s-civ').value, mapType: $('#s-map').value, customMap: $('#s-custom') ? $('#s-custom').value : '',
      size: $('#s-size').value, opponents: +$('#s-opp').value, difficulty: $('#s-diff').value, teams: $('#s-teams').value, startAge: +$('#s-age').value,
      startRes: $('#s-res').value, fog: $('#s-fog').value, speed: $('#s-speed').value, seed: +$('#s-seed').value || 1, cheats: $('#s-cheats').checked, tips: $('#s-tips').checked,
    };
    try { localStorage.setItem('aoe_setup', JSON.stringify(cfg)); } catch (e) { }
    launchFromSetup(cfg);
  };
  civInfo(); oppList(); preview();
}
function teamOf(mode, idx, total) {
  if (mode === 'ffa') return 0;
  if (mode === '1vall') return idx === 0 ? 1 : 2;
  if (mode === '2v2') return idx <= 1 ? 1 : 2;
  return 0;
}
const AI_NAMES = ['Charlemagne', 'Frederick', 'Isabella', 'Doge Enrico', 'Minamoto', 'Wu Zetian', 'Basil II', 'Harald', 'Saladin', 'Joan', 'Otto', 'El Cid'];
function launchFromSetup(cfg) {
  let spec;
  const players = [];
  const usedColors = new Set([cfg.color]);
  const nextColor = () => { for (let i = 0; i < PLAYER_COLORS.length; i++) if (!usedColors.has(i)) { usedColors.add(i); return i; } return 0; };
  const rng = mulberry32(cfg.seed + 99);
  const civKeys = Object.keys(CIVS);
  if (cfg.mapType === 'custom') {
    spec = Editor.load(cfg.customMap);
    if (!spec) { alert('Custom map not found'); return; }
    const errs = Editor.validate(spec); if (errs.length) { alert('Map is not playable:\n' + errs.join('\n')); return; }
    spec.players.forEach((sp, i) => {
      if (i === 0) players.push({ name: cfg.name, civ: cfg.civ, color: PLAYER_COLORS[cfg.color], human: true, team: sp.team || teamOf(cfg.teams, 0) });
      else { const ci = sp.color !== undefined && !usedColors.has(sp.color) ? (usedColors.add(sp.color), sp.color) : nextColor(); players.push({ name: AI_NAMES[(rng() * AI_NAMES.length) | 0], civ: sp.civ || civKeys[(rng() * civKeys.length) | 0], color: PLAYER_COLORS[ci], human: false, team: sp.team || teamOf(cfg.teams, i) }); }
    });
  } else {
    const np = cfg.opponents + 1;
    spec = generateMapSpec({ size: cfg.size, seed: cfg.seed, mapType: cfg.mapType, numPlayers: np });
    for (let i = 0; i < np; i++) {
      if (i === 0) players.push({ name: cfg.name, civ: cfg.civ, color: PLAYER_COLORS[cfg.color], human: true, team: teamOf(cfg.teams, 0, np) });
      else { const civ = civKeys[(rng() * civKeys.length) | 0]; players.push({ name: AI_NAMES[(rng() * AI_NAMES.length) | 0] + '', civ, color: PLAYER_COLORS[nextColor()], human: false, team: teamOf(cfg.teams, i, np) }); }
    }
  }
  // unique names
  const seen = new Set(); for (const p of players) { while (seen.has(p.name)) p.name += '+'; seen.add(p.name); }
  const settings = Object.assign({}, cfg, { players, seed: cfg.seed, mapLabel: { land: 'Highlands', coastal: 'Coastal', islands: 'Islands', custom: 'Custom: ' + cfg.customMap }[cfg.mapType] });
  startGame(spec, settings, cfg.mapType === 'custom' && UI.fromEditorName === cfg.customMap);
}
function startGame(spec, settings, fromEditor) {
  UI.lastSpec = JSON.parse(JSON.stringify(spec)); UI.lastSettings = settings; UI.fromEditor = !!fromEditor;
  createWorld(spec, settings);
  for (let i = 1; i < W.players.length; i++) { const p = W.players[i]; if (!p.human) p.ai = new AIPlayer(p, settings.difficulty); }
  W.speed = +settings.speed || 1;
  UI.selection = []; UI.groups = {}; UI.mode = null; UI.page = 'main'; UI.paused = false; UI.gameRunning = true; UI.panelKey = ''; UI.tipIdx = 0; UI.tipT = 5;
  const h = W.players[W.humanId];
  centerCamOn(h.startX, h.startY); R.cam.zoom = 1; invalidateTerrain(); R.spriteCache.clear(); ICONS.clear();
  showScreen('hud');
  resize();
  msg(`Welcome, ${h.name} of the ${CIVS[h.civ].name}! ${settings.cheats ? 'Cheats are enabled (press Enter).' : ''}`, '#ffd76a');
  if (W.players.length > 2) msg('Win by defeating every player who is not your ally. See Diplomacy (top bar) for alliances.', '#ddd');
  Sound.startMusic();
}

// ---------- HUD ----------
function initHUD() {
  $('#hud').innerHTML = `
  <div id="topbar">
    <div class="res" id="r-food" title="Food">🍖 <span>0</span></div>
    <div class="res" id="r-wood" title="Wood">🪵 <span>0</span></div>
    <div class="res" id="r-gold" title="Gold">🪙 <span>0</span></div>
    <div class="res" id="r-stone" title="Stone">🪨 <span>0</span></div>
    <div class="res" id="r-pop" title="Population / limit">👥 <span>0/0</span></div>
    <div class="res" id="r-vil" title="Idle villagers (press . to select)">💤 <span>0</span></div>
    <div id="age-label">Dark Age</div>
    <div id="clock">00:00</div>
    <div class="tb-btns"><button class="btn small" id="b-dip">Diplomacy</button><button class="btn small" id="b-obj">Help</button><button class="btn small" id="b-snd">🔊</button><button class="btn small" id="b-menu">Menu (F10)</button></div>
  </div>
  <div id="msgs"></div>
  <div id="tipbox" class="hidden"></div>
  <div id="bottom">
    <div id="mm-wrap"><canvas id="minimap" width="220" height="220"></canvas></div>
    <div id="selinfo"></div>
    <div id="cmds"></div>
  </div>
  <div id="chatbox" class="hidden"><span>Chat / cheat:</span><input id="chat" autocomplete="off" spellcheck="false"></div>
  <div id="pausebanner" class="hidden">PAUSED</div>`;
  $('#b-dip').onclick = openDiplomacy; $('#b-obj').onclick = openHelp; $('#b-snd').onclick = openAudio; $('#b-menu').onclick = openGameMenu;
  const mm = $('#minimap');
  const mmMove = e => { const r = mm.getBoundingClientRect(); const t = minimapToTile(mm, (e.clientX - r.left) * mm.width / r.width, (e.clientY - r.top) * mm.height / r.height); return t; };
  mm.addEventListener('mousedown', e => {
    e.preventDefault(); const t = mmMove(e);
    if (e.button === 2 && UI.selection.length && UI.selection[0].owner === W.humanId) { issueMove(t.x, t.y); return; }
    centerCamOn(t.x, t.y); UI.mmDrag = true;
  });
  window.addEventListener('mousemove', e => { if (UI.mmDrag) { const t = mmMove(e); centerCamOn(t.x, t.y); } });
  window.addEventListener('mouseup', () => UI.mmDrag = false);
  mm.addEventListener('contextmenu', e => e.preventDefault());
}
function openGameMenu() {
  UI.paused = true;
  const btns = [['Resume', () => { UI.paused = false; }], ['Restart', () => { restartGame(); }]];
  if (UI.fromEditor) btns.push(['Return to Editor', () => { UI.gameRunning = false; Editor.open(UI.fromEditorName); }]);
  btns.push(['Quit to Main Menu', () => { UI.gameRunning = false; showScreen('menu'); }]);
  openModal('Game Menu', `<p>Game time ${fmtTime(W.t)}. Seed ${W.settings.seed}.</p>`, btns);
}
function restartGame() { const s = UI.lastSettings, spec = JSON.parse(JSON.stringify(UI.lastSpec)); closeModal(); startGame(spec, s, UI.fromEditor); }
function fmtTime(t) { t = t | 0; const h = (t / 3600) | 0, m = ((t / 60) | 0) % 60, s = t % 60; return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0'); }
function stanceLabel(s) { return { ally: 'Ally', neutral: 'Neutral (peace)', enemy: 'Enemy' }[s] || s; }
function updateTopbar() {
  const p = UI.human();
  for (const r of RES) $('#r-' + r + ' span').textContent = Math.floor(p.res[r]);
  $('#r-pop span').textContent = `${p.pop}/${p.popCap}`;
  $('#r-pop').classList.toggle('warn', p.pop >= p.popCap);
  const idle = W.list.filter(e => e.kind === 'unit' && e.owner === W.humanId && e.type === 'villager' && !e.order && !e.inside && !e.dying).length;
  $('#r-vil span').textContent = idle;
  $('#age-label').textContent = AGES[p.age] + (p.researching.has('feudal') || p.researching.has('castleage') || p.researching.has('imperial') ? ' (advancing…)' : '');
  $('#clock').textContent = fmtTime(W.t) + (W.instant ? ' ⚡' : '') + (W.speed !== 1 ? ` ×${W.speed}` : '');
  // messages
  const box = $('#msgs'); const now = performance.now();
  const html = W.msgs.filter(m => now - m.t < 9000).map(m => `<div style="color:${m.color}">${escapeHtml(m.text)}</div>`).join('');
  if (box._h !== html) { box.innerHTML = html; box._h = html; }
  // tips
  if (W.settings.tips) {
    UI.tipT -= 0.25;
    if (UI.tipT <= 0 && UI.tipIdx < TIPS.length) { const tb = $('#tipbox'); tb.innerHTML = `<b>Tip:</b> ${TIPS[UI.tipIdx++]} <button class="btn small" onclick="this.parentNode.classList.add('hidden')">OK</button>`; tb.classList.remove('hidden'); UI.tipT = 55; setTimeout(() => tb.classList.add('hidden'), 20000); }
  }
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// ---------- selection panel & commands ----------
function costHtml(c) { return Object.keys(c).filter(r => c[r] > 0).map(r => `<span class="cost ${UI.human().res[r] >= c[r] ? '' : 'short'}">${RES_ICON[r]}${c[r]}</span>`).join(' ') || '<span class="cost">free</span>'; }
function commandsFor(sel) {
  const p = UI.human(); const cmds = [];
  if (!sel.length) return cmds;
  const first = sel[0];
  if (first.owner !== W.humanId) return cmds;
  if (first.kind === 'unit') {
    const types = new Set(sel.map(u => u.type));
    const allVill = [...types].every(t => t === 'villager');
    if (UI.page === 'eco' || UI.page === 'mil') {
      for (const bt of Object.keys(BUILDINGS).filter(k => BUILDINGS[k].cat === UI.page)) {
        const d = BUILDINGS[bt];
        cmds.push({ key: d.hk, icon: 'bld:' + bt, name: d.name, cost: effCost(p, bt), desc: d.desc, lock: bldLocked(p, bt), fn: () => startPlacement(bt) });
      }
      cmds.push({ key: 'Escape', label: 'Esc', icon: 'stop', name: 'Back', desc: 'Return to villager commands', fn: () => { UI.page = 'main'; } });
      return cmds;
    }
    if (types.has('villager')) {
      cmds.push({ key: 'B', icon: 'ecobuild', name: 'Build Economic Building', desc: 'Houses, Mill, Lumber/Mining Camps, Farms, Dock, Market, Blacksmith, University, Monastery, Town Center', fn: () => { UI.page = 'eco'; } });
      cmds.push({ key: 'V', icon: 'milbuild', name: 'Build Military Building', desc: 'Barracks, Archery Range, Stable, Siege Workshop, Towers, Walls, Gates, Castle', fn: () => { UI.page = 'mil'; } });
    }
    if (sel.some(u => UNITS[u.type].atk > 0 && u.type !== 'villager')) cmds.push({ key: 'A', icon: 'attackmove', name: 'Attack Move', desc: 'Move to a point, attacking any enemy encountered on the way.', fn: () => { UI.mode = { t: 'attackmove' }; } });
    if (sel.some(u => !UNITS[u.type].naval && !UNITS[u.type].animal)) cmds.push({ key: 'G', icon: 'garrison', name: 'Garrison', desc: 'Click a Town Center, Tower, Castle or your Transport Ship to enter it.', fn: () => { UI.mode = { t: 'garrison' }; } });
    if (types.has('transport')) cmds.push({ key: 'U', icon: 'unload', name: 'Unload', desc: 'Click a shore location: the ship sails there and unloads its passengers.', fn: () => { UI.mode = { t: 'unload' }; } });
    if (types.has('monk') && sel.some(u => u.relic)) cmds.push({ key: 'D', icon: 'relicicon', name: 'Drop Relic', desc: 'Drop the carried relic here.', fn: () => { for (const u of sel) if (u.relic) { const r = ent(u.relic); if (r) { r.carrier = 0; r.x = u.x | 0; r.y = u.y | 0; } u.relic = 0; } } });
    if (types.has('tradecart') || types.has('tradecog')) cmds.push({ key: 'T', icon: 'market', name: 'Trade', desc: 'Right-click a friendly (yours or allied) Market (carts) or Dock (cogs) to start a trade route.', fn: () => msg('Right-click a friendly Market/Dock to trade.', '#ddd') });
    cmds.push({ key: 'S', icon: 'stop', name: 'Stop', desc: 'Stop current action.', fn: () => { for (const u of sel) setOrder(u, null); } });
    cmds.push({ key: 'Delete', label: 'Del', icon: 'delete', name: 'Delete', desc: 'Kill the selected units.', fn: () => { for (const u of sel.slice()) deleteEnt(u); } });
    return cmds;
  }
  if (first.kind === 'bld') {
    const b = first, d = BUILDINGS[b.type];
    if (!b.built) { cmds.push({ key: 'Delete', label: 'Del', icon: 'delete', name: 'Cancel construction', desc: 'Refunds the unspent part of the cost.', fn: () => deleteEnt(b) }); return cmds; }
    const trains = TRAIN[b.type] || [];
    for (let base of trains) {
      if (base === '__uu') base = CIVS[p.civ].uu;
      const t = currentType(p, base); const u = UNITS[t];
      cmds.push({ key: u.hk, icon: 'unit:' + t, name: u.name, cost: effCost(p, t), desc: u.desc + statLine(u), lock: unitLocked(p, t), time: u.time, fn: () => { for (const bb of sel.filter(x => x.type === b.type)) { const err = queueUnit(bb, t); if (err) { msg(err, '#fc8'); Sound.play('error'); break; } else Sound.play('click'); } } });
    }
    const techs = (TECHS_AT[b.type] || []).filter(id => {
      const t = TECHS[id]; if (p.techs.has(id)) return false;
      if (t.req && t.req.some(r => !p.techs.has(r) && TECHS[r].at === t.at && !p.researching.has(r))) return false;
      if (t.req && t.req.some(r => p.researching.has(r))) return false;
      if (t.ageUp && t.ageUp !== p.age + 1) return false;
      if (t.upg && t.upg[0] && !UNITS[t.upg[0]]) return false;
      return true;
    });
    for (const id of techs) { const t = TECHS[id]; cmds.push({ key: t.hk, icon: id, name: t.name, cost: effCost(p, id, true), desc: t.desc, lock: techLocked(p, id, b), time: t.time, fn: () => { const err = queueTech(b, id); if (err) { msg(err, '#fc8'); Sound.play('error'); } else Sound.play('click'); } }); }
    if (b.type === 'tc') cmds.push({ key: 'B', icon: p.bell ? 'allclear' : 'bell', name: p.bell ? 'All Clear' : 'Ring Town Bell', desc: p.bell ? 'Villagers leave shelter and return to their previous work.' : 'Villagers nearby run into Town Centers, Towers and Castles for shelter; garrisoned villagers add arrows.', fn: () => { p.bell ? allClear(p) : ringBell(p); UI.panelKey = ''; } });
    if (d.garrison) cmds.push({ key: 'U', icon: 'ungarrison', name: `Ungarrison (${b.garrison.length}/${garrisonCap(b)})`, desc: 'Release all garrisoned units at the nearest free spot (or toward the rally point).', lock: b.garrison.length ? null : 'No units inside', fn: () => ungarrisonAll(b) });
    if (b.type === 'market') {
      for (const [i, r] of ['food', 'wood', 'stone'].entries()) {
        cmds.push({ key: 'ASD'[i], icon: r === 'food' ? 'food' : r === 'wood' ? 'woodi' : 'stone', name: `Buy 100 ${r}`, desc: `Costs ${Math.round(W.market[r])} gold. Prices rise when you buy.`, cost: { gold: Math.round(W.market[r]) }, fn: () => { const e = marketTrade(p, r, true); if (e) msg(e, '#fc8'); else Sound.play('coins'); } });
        cmds.push({ key: 'ZXC'[i], icon: r === 'food' ? 'food' : r === 'wood' ? 'woodi' : 'stone', name: `Sell 100 ${r}`, desc: `Earns ${Math.round(W.market[r] * 0.7)} gold.`, cost: { [r]: 100 }, fn: () => { const e = marketTrade(p, r, false); if (e) msg(e, '#fc8'); else Sound.play('coins'); } });
      }
    }
    if (trains.length) cmds.push({ key: 'Y', icon: 'rally', name: 'Set Rally Point', desc: 'Click a location (or resource) where new units should go. You can also right-click with the building selected.', fn: () => { UI.mode = { t: 'rally' }; } });
    cmds.push({ key: 'Delete', label: 'Del', icon: 'delete', name: 'Delete building', desc: 'Destroy this building.', fn: () => { for (const x of sel.slice()) deleteEnt(x); } });
    return cmds;
  }
  return cmds;
}
function statLine(u) { return `<br><span class="small">HP ${u.hp} · Attack ${u.atk}${u.range ? ' · Range ' + u.range : ''} · Armor ${u.ma}/${u.pa}${u.bonus ? ' · Bonus vs ' + Object.keys(u.bonus).join(', ') : ''}</span>`; }
function renderCommands() {
  const box = $('#cmds'); const sel = UI.selection;
  const p = UI.human();
  const key = sel.map(e => e.id).join(',') + '|' + UI.page + '|' + p.age + '|' + p.techs.size + '|' + p.researching.size + '|' + p.bell + '|' + (sel[0] && sel[0].kind === 'bld' ? sel[0].built + ':' + sel[0].garrison.length : '') + '|' + (sel[0] && sel[0].relic ? 1 : 0) + '|' + W.list.filter(e => e.kind === 'bld' && e.owner === W.humanId && e.built).length;
  if (key !== UI.panelKey) {
    UI.panelKey = key;
    UI.cmds = commandsFor(sel);
    box.innerHTML = '';
    for (const c of UI.cmds) {
      const b = el('div', 'cmd');
      b.style.backgroundImage = `url(${iconFor(c.icon)})`;
      b.innerHTML = `<span class="hk">${c.label || c.key}</span>`;
      b.onclick = e => { e.stopPropagation(); runCmd(c); };
      b.onmouseenter = () => showTip(c, b); b.onmouseleave = hideTip;
      c.el = b; box.appendChild(b);
    }
  }
  for (const c of UI.cmds || []) {
    if (!c.el) continue;
    c.el.classList.toggle('locked', !!c.lock);
    c.el.classList.toggle('poor', !c.lock && c.cost && !canPay(p, c.cost));
  }
}
function runCmd(c) {
  if (c.lock) { msg(c.name + ': ' + c.lock, '#fc8'); Sound.play('error'); return; }
  c.fn(); UI.panelKey = ''; renderCommands();
}
function showTip(c, anchor) {
  const t = $('#tooltip');
  t.innerHTML = `<div class="tt-name">${c.name} <span class="hk2">[${c.label || c.key}]</span></div>${c.cost ? '<div>' + costHtml(c.cost) + (c.time ? ` <span class="small">⏱${c.time}s</span>` : '') + '</div>' : ''}<div class="tt-desc">${c.desc || ''}</div>${c.lock ? `<div class="tt-lock">🔒 ${c.lock}</div>` : ''}`;
  t.classList.remove('hidden');
  const r = anchor.getBoundingClientRect();
  t.style.left = Math.min(window.innerWidth - 330, r.left) + 'px'; t.style.bottom = (window.innerHeight - r.top + 8) + 'px';
}
function hideTip() { $('#tooltip').classList.add('hidden'); }
function renderSelInfo() {
  const box = $('#selinfo'); const sel = UI.selection;
  if (!sel.length) { box.innerHTML = `<div class="small dim">Select units or buildings. Right-click to command.<br>Enter: chat/cheats · F1: help</div>`; return; }
  if (sel.length > 1) {
    box.innerHTML = `<div class="multi">${sel.slice(0, 40).map(u => `<div class="mini" data-id="${u.id}" style="background-image:url(${iconFor((u.kind === 'bld' ? 'bld:' : 'unit:') + u.type)})"><i style="width:${(u.hp / u.maxhp * 100) | 0}%"></i></div>`).join('')}</div><div class="small">${sel.length} selected</div>`;
    box.querySelectorAll('.mini').forEach(m => m.onclick = () => { const e = ent(+m.dataset.id); if (e) { UI.selection = [e]; UI.panelKey = ''; } });
    return;
  }
  const e = sel[0]; const p = W.players[e.owner];
  let name, icon, lines = [];
  if (e.kind === 'unit') {
    const d = UNITS[e.type]; name = d.name; icon = 'unit:' + e.type;
    if (!d.animal || e.owner) {
      const rng = statU(e, 'range'); lines.push(`⚔ ${statU(e, 'atk')}${d.range ? ` 🎯 ${d.range + rng}` : ''} 🛡 ${statU(e, 'ma')}/${statU(e, 'pa')}`);
    }
    if (e.carry && e.carry.amt > 0) lines.push(`Carrying ${Math.floor(e.carry.amt)} ${e.carry.res}`);
    if (e.order) lines.push(`<span class="dim">${orderLabel(e)}</span>`);
    if (e.type === 'sheep') lines.push(e.owner ? `Owned by <b style="color:${p.color.c}">${p.name}</b>` : 'Neutral — walk a unit within 4 tiles to claim');
    if (d.animal && d.food) lines.push(`Food: ${d.food}`);
    if (e.cargo && e.cargo.length) lines.push(`Passengers: ${e.cargo.length}/${UNITS.transport.cap + W.players[e.owner].transportCap}`);
    if (e.type === 'transport' && !e.cargo.length) lines.push('Empty. Right-click it with land units to board.');
    if (e.relic) lines.push('Carrying a relic ✝');
    if (e.type === 'monk' && e.recharge > 0) lines.push(`Recovering faith: ${Math.ceil(e.recharge)}s`);
    if (e.tradeGold) lines.push(`Trade goods worth ${e.tradeGold} gold`);
  } else if (e.kind === 'bld') {
    const d = BUILDINGS[e.type]; name = d.name; icon = 'bld:' + e.type;
    if (!e.built) lines.push(`Under construction ${Math.floor(e.progress * 100)}%`);
    if (d.farm) lines.push(`Food left: ${Math.floor(e.food)}`);
    if (d.garrison) lines.push(`Garrison ${e.garrison.length}/${garrisonCap(e)}`);
    if (e.type === 'monastery') lines.push(`Relics: ${e.relics.length} → +${(e.relics.length * 0.5).toFixed(1)} gold/s`);
    if (d.atk) lines.push(`Arrows: ${(e.type === 'castle' ? 4 : 1) + e.garrison.length} · Attack ${bldAtk(e)}`);
    if (d.pop && e.owner === W.humanId) lines.push(`Supports ${e.type === 'tc' && p.tcPop ? p.tcPop : d.pop} population`);
  } else if (e.kind === 'res') { name = { tree: 'Tree', gold: 'Gold Mine', stone: 'Stone Mine', berry: 'Berry Bush', fish: 'Fish', carcass: 'Carcass', shrub: 'Shrub' }[e.type]; icon = e.type === 'gold' ? 'gold' : e.type === 'stone' ? 'stone' : e.type === 'fish' ? 'fish' : e.type === 'tree' ? 'woodi' : 'food'; if (e.type !== 'shrub') lines.push(`${resKind(e)}: ${Math.floor(e.amount)}`); }
  else if (e.kind === 'relic') { name = 'Relic'; icon = 'relicicon'; lines.push('Only monks can carry relics.'); }
  const hp = e.maxhp ? `<div class="hpbar"><i style="width:${Math.max(0, e.hp / e.maxhp * 100)}%"></i><span>${Math.ceil(e.hp)}/${e.maxhp}</span></div>` : '';
  let extra = '';
  if (e.kind === 'bld' && e.garrison.length) extra += `<div class="gar">${e.garrison.map(id => { const u = ent(id); return u ? `<div class="mini" data-g="${id}" title="Click to release" style="background-image:url(${iconFor('unit:' + u.type)})"></div>` : ''; }).join('')}</div>`;
  if (e.kind === 'unit' && e.cargo && e.cargo.length) extra += `<div class="gar">${e.cargo.map(id => { const u = ent(id); return u ? `<div class="mini" style="background-image:url(${iconFor('unit:' + u.type)})"></div>` : ''; }).join('')}</div>`;
  if (e.kind === 'bld' && e.queue.length) extra += `<div class="queue">${e.queue.map((q, i) => `<div class="mini q" data-q="${i}" title="Click to cancel" style="background-image:url(${iconFor(q.kind === 'unit' ? 'unit:' + q.id : q.id)})">${i === 0 ? `<i style="width:${Math.min(100, q.t / (q.kind === 'unit' ? UNITS[q.id].time : TECHS[q.id].time) * 100)}%"></i>` : ''}</div>`).join('')}${e.popBlocked ? '<span class="warn">Need houses!</span>' : ''}</div>`;
  const owner = p ? `<span style="color:${p.color.c}">${p.name}</span>` : '<span class="dim">Nature</span>';
  box.innerHTML = `<div class="single"><div class="portrait" style="background-image:url(${iconFor(icon)})"></div><div class="info"><div class="nm">${name}</div><div class="small">${owner}</div>${hp}${lines.map(l => `<div class="small">${l}</div>`).join('')}</div></div>${extra}`;
  box.querySelectorAll('[data-g]').forEach(m => m.onclick = () => { if (e.owner === W.humanId) { ungarrisonOne(e, +m.dataset.g); } });
  box.querySelectorAll('[data-q]').forEach(m => m.onclick = () => { if (e.owner === W.humanId) cancelQueue(e, +m.dataset.q); });
}
function orderLabel(u) {
  const o = u.order; const t = o.t;
  if (t === 'gather' || t === 'farm') { const e = ent(o.id); return u.phase === 1 ? 'Returning resources' : 'Gathering ' + (e ? (e.kind === 'bld' ? 'food (farm)' : resKind(e)) : ''); }
  return { move: 'Moving', attack: 'Attacking', build: 'Building', repair: 'Repairing', hunt: 'Hunting', garrison: 'Going to garrison', board: 'Boarding transport', heal: 'Healing', convert: 'Converting…', relic: 'Fetching relic', deposit: 'Carrying relic to Monastery', trade: 'Trading', unload: 'Sailing to unload', attackmove: 'Attack-moving', follow: 'Following', dropoff: 'Dropping off' }[t] || t;
}

// ---------- input ----------
function hitTest(sx, sy, opts = {}) {
  const tp = screenToTile(sx, sy);
  let best = null, bestPri = -1, bestDepth = -1e9;
  const human = W.players[W.humanId];
  for (const e of W.list) {
    if (e.kind === 'unit' && (e.inside || e.dying)) continue;
    if (e.kind === 'relic' && (e.carrier || e.inBld)) continue;
    if (!opts.editor) {
      if (e.kind === 'unit' && e.owner !== W.humanId && !isVisibleToHuman(e)) continue;
      if (e.kind !== 'unit' && !isExploredForHuman(center(e).x, center(e).y)) continue;
    }
    let hit = false, pri = 0;
    const c = center(e);
    if (e.kind === 'unit') {
      const p = toScreen(c.x, c.y, UNITS[e.type].naval ? -0.35 : W.map.h(c.x, c.y)); const r = (UNIT_R(e) * 34 + 7) * R.cam.zoom, h = (unitHeight(e) + 4) * R.cam.zoom;
      hit = sx > p.x - r && sx < p.x + r && sy > p.y - h && sy < p.y + 6 * R.cam.zoom; pri = 3;
    } else if (e.kind === 'bld') {
      const s = bsize(e);
      if (tp.x >= e.x && tp.x < e.x + s && tp.y >= e.y && tp.y < e.y + s) hit = true;
      else { const p = toScreen(c.x, c.y, W.map.h(c.x, c.y)); const w = s * TW / 2 * 0.75 * R.cam.zoom, h = (BLD_H[e.type] || 50) * 0.85 * R.cam.zoom; hit = sx > p.x - w && sx < p.x + w && sy > p.y - h && sy < p.y; }
      pri = BUILDINGS[e.type].farm ? 0.5 : 2;
    } else if (e.kind === 'res' || e.kind === 'relic') {
      if (e.type === 'shrub' && !opts.editor) continue;
      const p = toScreen(c.x, c.y, e.type === 'fish' ? -0.35 : W.map.h(c.x, c.y));
      const h = (e.type === 'tree' && !e.felled ? 55 : 18) * R.cam.zoom, w = (e.type === 'tree' ? 14 : 18) * R.cam.zoom;
      hit = sx > p.x - w && sx < p.x + w && sy > p.y - h && sy < p.y + 8 * R.cam.zoom; pri = e.kind === 'relic' ? 2.5 : 1;
    }
    if (!hit) continue;
    const dpt = entDepth(e);
    if (pri > bestPri || (pri === bestPri && dpt > bestDepth)) { best = e; bestPri = pri; bestDepth = dpt; }
  }
  return best;
}
function selectEnts(list, add) {
  if (!add) UI.selection = [];
  for (const e of list) if (!UI.selection.includes(e)) UI.selection.push(e);
  // only own units if mixing
  const own = UI.selection.filter(e => e.owner === W.humanId);
  if (own.length && own.length !== UI.selection.length) UI.selection = own;
  const units = UI.selection.filter(e => e.kind === 'unit');
  if (units.length && units.length !== UI.selection.length) UI.selection = units;
  UI.page = 'main'; UI.panelKey = '';
  const f = UI.selection[0];
  if (f && f.kind === 'unit' && (f.owner === W.humanId)) Sound.speak(f, 'select');
  else if (f && f.kind === 'bld') Sound.play('click', center(f).x, center(f).y);
}
function initInput() {
  const cv = $('#game');
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('mousedown', e => {
    if (!UI.gameRunning) return;
    Sound.init();
    const x = e.offsetX, y = e.offsetY; const t = screenToTile(x, y);
    if (e.button === 0) {
      if (UI.mode) { handleModeClick(x, y, t, e); return; }
      if (UI.place) { tryPlace(t, e.shiftKey); return; }
      UI.drag = { x0: x, y0: y, x1: x, y1: y };
    } else if (e.button === 2) {
      if (UI.place || UI.mode) { UI.place = null; UI.mode = null; return; }
      rightClick(x, y, t);
    }
  });
  cv.addEventListener('mousemove', e => {
    UI.mouse.x = e.offsetX; UI.mouse.y = e.offsetY; UI.mouse.inCanvas = true;
    if (UI.drag) { UI.drag.x1 = e.offsetX; UI.drag.y1 = e.offsetY; }
    if (UI.place && UI.place.wallStart && e.buttons & 1) { }
  });
  cv.addEventListener('mouseleave', () => UI.mouse.inCanvas = false);
  window.addEventListener('mouseup', e => {
    if (!UI.gameRunning || e.button !== 0 || !UI.drag) return;
    const d = UI.drag; UI.drag = null;
    if (Math.abs(d.x1 - d.x0) < 5 && Math.abs(d.y1 - d.y0) < 5) {
      const h = hitTest(d.x0, d.y0);
      const now = performance.now();
      if (h && UI.lastClick && UI.lastClick.id === h.id && now - UI.lastClick.t < 350 && h.owner === W.humanId) {
        // double click: select all of type on screen
        const same = W.list.filter(o => o.type === h.type && o.owner === W.humanId && !o.inside && !o.dying && (() => { const c = center(o); const p = toScreen(c.x, c.y, 0); return p.x > 0 && p.y > 0 && p.x < R.cw && p.y < R.ch; })());
        selectEnts(same, false);
      } else if (h) selectEnts([h], e.shiftKey);
      else if (!e.shiftKey) { UI.selection = []; UI.panelKey = ''; UI.page = 'main'; }
      UI.lastClick = h ? { id: h.id, t: now } : null;
    } else {
      const x0 = Math.min(d.x0, d.x1), x1 = Math.max(d.x0, d.x1), y0 = Math.min(d.y0, d.y1), y1 = Math.max(d.y0, d.y1);
      const picked = W.list.filter(o => o.kind === 'unit' && o.owner === W.humanId && !o.inside && !o.dying && (() => { const p = toScreen(o.x, o.y, UNITS[o.type].naval ? -0.35 : W.map.h(o.x, o.y)); return p.x >= x0 && p.x <= x1 && p.y - 10 >= y0 && p.y - 10 <= y1; })());
      if (picked.length) selectEnts(picked.filter(u => u.type !== 'sheep').length ? picked.filter(u => u.type !== 'sheep') : picked, e.shiftKey);
    }
  });
  cv.addEventListener('wheel', e => { e.preventDefault(); const z = R.cam.zoom * (e.deltaY < 0 ? 1.1 : 0.9); R.cam.zoom = Math.max(0.55, Math.min(1.8, z)); }, { passive: false });
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', e => UI.keys.delete(e.key));
  window.addEventListener('resize', () => resize());
}
function onKey(e) {
  if (!UI.gameRunning) return;
  if (UI.chatOpen) {
    if (e.key === 'Enter') { e.preventDefault(); submitChat(); }
    else if (e.key === 'Escape') { closeChat(); }
    e.stopPropagation();
    return; // letters never trigger gameplay shortcuts while typing
  }
  if (!$('#modal').classList.contains('hidden')) { if (e.key === 'Escape') { closeModal(); UI.paused = false; } return; }
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
  UI.keys.add(e.key);
  const k = e.key;
  if (k === 'Enter') { e.preventDefault(); openChat(); return; }
  if (k === 'F1') { e.preventDefault(); openHelp(); return; }
  if (k === 'F3') { e.preventDefault(); UI.paused = !UI.paused; return; }
  if (k === 'F10') { e.preventDefault(); openGameMenu(); return; }
  if (k === 'Escape') { if (UI.place || UI.mode) { UI.place = null; UI.mode = null; } else if (UI.page !== 'main') { UI.page = 'main'; UI.panelKey = ''; } else { UI.selection = []; UI.panelKey = ''; } return; }
  if (/^[0-9]$/.test(k)) {
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); UI.groups[k] = UI.selection.slice(); msg(`Group ${k} set.`, '#ccc'); }
    else if (UI.groups[k]) { const g = UI.groups[k].filter(u => !u.dead && u.owner === W.humanId); if (g.length) { if (UI.lastGroup === k && performance.now() - UI.lastGroupT < 400) centerCamOn(center(g[0]).x, center(g[0]).y); selectEnts(g, false); UI.lastGroup = k; UI.lastGroupT = performance.now(); } }
    return;
  }
  if (k === 'h' || k === 'H') { if (!UI.cmds || !UI.cmds.some(c => c.key === 'H')) { const tc = W.list.find(b => b.kind === 'bld' && b.type === 'tc' && b.owner === W.humanId); if (tc) { selectEnts([tc], false); centerCamOn(center(tc).x, center(tc).y); } return; } }
  if (k === '.') { const idle = W.list.filter(u => u.kind === 'unit' && u.owner === W.humanId && u.type === 'villager' && !u.order && !u.inside && !u.dying); if (idle.length) { UI.idleIdx = ((UI.idleIdx || 0) + 1) % idle.length; const u = idle[UI.idleIdx]; selectEnts([u], false); centerCamOn(u.x, u.y); } return; }
  if (k === ' ') { const f = UI.selection[0]; if (f) { const c = center(f); centerCamOn(c.x, c.y); } e.preventDefault(); return; }
  if (k.startsWith('Arrow')) { e.preventDefault(); return; }
  // command hotkeys
  if (UI.cmds) {
    const kk = k.length === 1 ? k.toUpperCase() : k;
    const c = UI.cmds.find(c => c.key === kk);
    if (c) { e.preventDefault(); runCmd(c); return; }
  }
}
function openChat() { UI.chatOpen = true; $('#chatbox').classList.remove('hidden'); const i = $('#chat'); i.value = ''; setTimeout(() => i.focus(), 0); }
function closeChat() { UI.chatOpen = false; $('#chatbox').classList.add('hidden'); $('#chat').blur(); }
function submitChat() {
  const raw = $('#chat').value; closeChat();
  if (!raw.trim()) return;
  const res = runCheat(raw);
  if (res === null) msg(`${UI.human().name}: ${raw}`, UI.human().color.l);
}
// returns null when not a cheat
function runCheat(raw) {
  const code = raw.trim().toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, ' ');
  const p = UI.human();
  const cheats = {
    "cheese steak jimmy's": () => { p.res.food += 10000; return '+10,000 food'; },
    'cheese steak jimmys': () => { p.res.food += 10000; return '+10,000 food'; },
    'lumberjack': () => { p.res.wood += 10000; return '+10,000 wood'; },
    'robin hood': () => { p.res.gold += 10000; return '+10,000 gold'; },
    'rock on': () => { p.res.stone += 10000; return '+10,000 stone'; },
    'marco': () => { W.revealAll = !W.revealAll; if (W.revealAll) { W.exploredBackup = p.explored.slice(); p.explored.fill(1); return 'Map revealed'; } if (W.exploredBackup) p.explored.set(W.exploredBackup); return 'Map reveal off'; },
    'polo': () => { W.noFog = !W.noFog; updateVisibility(); return W.noFog ? 'Fog of war removed' : 'Fog of war restored'; },
    'aegis': () => { W.instant = !W.instant; return W.instant ? 'Instant build/train/research ON' : 'Instant build/train/research OFF'; },
    'how do you turn this on': () => { const tc = W.list.find(b => b.kind === 'bld' && b.type === 'tc' && b.owner === p.id) || W.list.find(b => b.kind === 'bld' && b.owner === p.id); const at = tc ? (freeTileNear(tc, false) || center(tc)) : { x: p.startX, y: p.startY }; const u = spawnUnit('cobra', p.id, at.x, at.y); recalcPop(); selectEnts([u], false); centerCamOn(u.x, u.y); return 'A Cobra Car appears!'; },
  };
  if (!cheats[code]) return null;
  if (!W.settings.cheats) { msg('Cheats are disabled in this game (enable "Allow cheats" in setup).', '#fc8'); return false; }
  const r = cheats[code](); W.cheatsUsed++;
  msg('Cheat: ' + r, '#9f9'); Sound.play('research');
  return r;
}
function rightClick(sx, sy, t) {
  const sel = UI.selection.filter(e => e.owner === W.humanId);
  if (!sel.length) return;
  const target = hitTest(sx, sy);
  if (sel[0].kind === 'bld') {
    for (const b of sel) b.rally = target && target !== b ? { x: center(target).x, y: center(target).y, id: target.id } : { x: t.x, y: t.y };
    Sound.play('click'); emitFx('dust', t.x, t.y, 2);
    msg('Rally point set.', '#ccc');
    return;
  }
  const units = sel.filter(u => u.kind === 'unit');
  if (target && target !== units[0]) {
    const action = orderTarget(units, target);
    Sound.speak(units[0], action);
    UI.flash = { x: center(target).x, y: center(target).y, t: performance.now(), col: action === 'attack' ? '#f44' : '#4f4' };
    return;
  }
  issueMove(t.x, t.y);
}
function issueMove(x, y) {
  const units = UI.selection.filter(e => e.owner === W.humanId && e.kind === 'unit');
  if (!units.length) return;
  // transports with a land destination: move then unload
  const ships = units.filter(u => u.type === 'transport' && u.cargo.length && !W.map.isWater(x | 0, y | 0));
  if (ships.length) { for (const s of ships) setOrder(s, { t: 'unload', x, y }); }
  orderMove(units.filter(u => !ships.includes(u)), x, y);
  Sound.speak(units[0], 'move');
  UI.flash = { x, y, t: performance.now(), col: '#4f4' };
}
function handleModeClick(sx, sy, t, e) {
  const m = UI.mode; const sel = UI.selection.filter(u => u.owner === W.humanId);
  const target = hitTest(sx, sy);
  if (m.t === 'attackmove') { for (const u of sel) setOrder(u, { t: 'attackmove', x: t.x, y: t.y }); Sound.speak(sel[0], 'attack'); UI.flash = { x: t.x, y: t.y, t: performance.now(), col: '#f44' }; }
  else if (m.t === 'garrison') {
    if (target && target.owner === W.humanId) {
      let n = 0;
      for (const u of sel.filter(u => u.kind === 'unit')) { if (target.kind === 'bld' && canGarrisonIn(u, target)) { setOrder(u, { t: 'garrison', id: target.id }); n++; } else if (target.type === 'transport' && !UNITS[u.type].naval) { setOrder(u, { t: 'board', id: target.id }); n++; } }
      if (n) Sound.speak(sel[0], 'move'); else msg('Those units cannot garrison there.', '#fc8');
    }
  }
  else if (m.t === 'unload') { for (const s of sel) if (s.type === 'transport') setOrder(s, { t: 'unload', x: t.x, y: t.y }); Sound.speak(sel[0], 'move'); UI.flash = { x: t.x, y: t.y, t: performance.now(), col: '#4f4' }; }
  else if (m.t === 'rally') { for (const b of sel) b.rally = target ? { x: center(target).x, y: center(target).y, id: target.id } : { x: t.x, y: t.y }; }
  if (!e.shiftKey) UI.mode = null;
}
// ---------- building placement ----------
function startPlacement(type) {
  const p = UI.human();
  const lock = bldLocked(p, type); if (lock) { msg(lock, '#fc8'); return; }
  UI.place = { type };
  if (BUILDINGS[type].wall) msg('Click the start and end of the wall line. Right-click to cancel.', '#ddd');
}
function placeOrigin(type, t) { const s = BUILDINGS[type].size; return { x: Math.floor(t.x - s / 2 + 0.5), y: Math.floor(t.y - s / 2 + 0.5) }; }
function tryPlace(t, shift) {
  const p = UI.human(); const type = UI.place.type;
  const builders = UI.selection.filter(u => u.kind === 'unit' && u.type === 'villager' && u.owner === W.humanId);
  if (!builders.length) { UI.place = null; return; }
  if (BUILDINGS[type].wall) {
    if (!UI.place.start) { UI.place.start = { x: Math.floor(t.x), y: Math.floor(t.y) }; return; }
    const a = UI.place.start, b = { x: Math.floor(t.x), y: Math.floor(t.y) };
    const pts = wallLine(a, b); let placed = 0, first = null;
    for (const q of pts) { const r = placeBuilding(p, type, q.x, q.y, placed === 0 ? builders : []); if (typeof r === 'object') { placed++; if (!first) first = r; } }
    if (placed) { Sound.speak(builders[0], 'build'); Sound.play('place'); } else { msg('Cannot place wall there.', '#fc8'); Sound.play('error'); }
    UI.place = shift ? { type } : null; UI.page = 'main'; UI.panelKey = '';
    return;
  }
  const o = placeOrigin(type, t);
  const r = placeBuilding(p, type, o.x, o.y, builders);
  if (typeof r === 'string') { msg(r, '#fc8'); Sound.play('error'); return; }
  Sound.speak(builders[0], 'build'); Sound.play('place');
  if (!shift) { UI.place = null; UI.page = 'main'; UI.panelKey = ''; }
}
function wallLine(a, b) {
  const pts = []; const n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  for (let i = 0; i <= n; i++) { const x = Math.round(a.x + (b.x - a.x) * i / (n || 1)), y = Math.round(a.y + (b.y - a.y) * i / (n || 1)); if (!pts.some(p => p.x === x && p.y === y)) pts.push({ x, y }); }
  return pts.slice(0, 40);
}
function drawOverlays(ctx) {
  camTransform(ctx);
  const t = screenToTile(UI.mouse.x, UI.mouse.y);
  if (UI.place) {
    const type = UI.place.type, s = BUILDINGS[type].size, p = UI.human();
    const list = BUILDINGS[type].wall && UI.place.start ? wallLine(UI.place.start, { x: Math.floor(t.x), y: Math.floor(t.y) }) : [placeOrigin(type, t)];
    for (const o of list) {
      const err = canPlace(p, type, o.x, o.y);
      const cx = o.x + s / 2, cy = o.y + s / 2;
      const gp = iso(cx, cy, BUILDINGS[type].water ? -0.35 : W.map.h(cx, cy));
      ctx.save(); ctx.globalAlpha = 0.6;
      if (!BUILDINGS[type].farm) { const sp = bldSprite(type, Math.min(3, p.age), p.color); ctx.drawImage(sp.cv, gp.x - sp.ax, gp.y - sp.ay, sp.w, sp.h); }
      ctx.restore();
      ctx.save(); ctx.translate(gp.x, gp.y);
      poly(ctx, [P(-s / 2, -s / 2, 0), P(s / 2, -s / 2, 0), P(s / 2, s / 2, 0), P(-s / 2, s / 2, 0)], err ? 'rgba(255,40,40,0.35)' : 'rgba(60,255,60,0.25)', err ? '#f44' : '#4f4', 1.5);
      ctx.restore();
      if (err && list.length === 1) { ctx.fillStyle = '#fbb'; ctx.font = '12px sans-serif'; ctx.fillText(err, gp.x + 20, gp.y - 10); }
    }
  }
  // rally points
  for (const b of UI.selection) if (b.kind === 'bld' && b.rally && b.owner === W.humanId) {
    const p = iso(b.rally.x, b.rally.y, W.map.h(b.rally.x, b.rally.y));
    ctx.strokeStyle = '#eee'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - 22); ctx.stroke();
    ctx.fillStyle = UI.human().color.c; ctx.beginPath(); ctx.moveTo(p.x, p.y - 22); ctx.lineTo(p.x + 12, p.y - 18); ctx.lineTo(p.x, p.y - 14); ctx.fill();
  }
  // move destination markers for selected units
  for (const u of UI.selection) if (u.kind === 'unit' && u.owner === W.humanId && u.order && (u.order.t === 'move' || u.order.t === 'attackmove' || u.order.t === 'unload')) {
    const d = u.order.t === 'unload' ? { x: u.order.x, y: u.order.y } : u.order; const p = iso(d.x, d.y, W.map.h(d.x, d.y));
    ctx.strokeStyle = u.order.t === 'attackmove' ? 'rgba(255,90,90,0.6)' : 'rgba(120,255,120,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(p.x, p.y, 6, 3, 0, 0, 6.3); ctx.stroke();
  }
  if (UI.flash) {
    const k = (performance.now() - UI.flash.t) / 500;
    if (k < 1) { const p = iso(UI.flash.x, UI.flash.y, W.map.h(UI.flash.x, UI.flash.y)); ctx.strokeStyle = UI.flash.col; ctx.lineWidth = 2; ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.ellipse(p.x, p.y, 14 * (1 - k) + 4, (14 * (1 - k) + 4) / 2, 0, 0, 6.3); ctx.stroke(); ctx.globalAlpha = 1; }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (UI.drag && (Math.abs(UI.drag.x1 - UI.drag.x0) > 4 || Math.abs(UI.drag.y1 - UI.drag.y0) > 4)) {
    const d = UI.drag; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]); ctx.strokeRect(Math.min(d.x0, d.x1) + 0.5, Math.min(d.y0, d.y1) + 0.5, Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0)); ctx.setLineDash([]);
  }
  // cursor hint
  const cv = $('#game');
  const h = UI.mouse.inCanvas ? UI.hover : null;
  let cur = 'default';
  if (UI.mode) cur = 'crosshair';
  else if (h && UI.selection.length && UI.selection[0].owner === W.humanId && UI.selection[0].kind === 'unit') {
    if (h.owner && isEnemy(W.humanId, h.owner)) cur = 'crosshair'; else if (h.kind === 'res' || h.kind === 'relic') cur = 'cell'; else cur = 'pointer';
  } else if (h) cur = 'pointer';
  if (cv.style.cursor !== cur) cv.style.cursor = cur;
}
function scrollCamera(dt) {
  const sp = 900 * dt / R.cam.zoom;
  let dx = 0, dy = 0;
  if (UI.keys.has('ArrowLeft')) dx -= sp; if (UI.keys.has('ArrowRight')) dx += sp; if (UI.keys.has('ArrowUp')) dy -= sp; if (UI.keys.has('ArrowDown')) dy += sp;
  if (UI.mouse.inCanvas && !UI.drag && document.hasFocus()) {
    const m = 6;
    if (UI.mouse.x < m) dx -= sp; if (UI.mouse.x > R.cw - m) dx += sp; if (UI.mouse.y < m) dy -= sp; if (UI.mouse.y > R.ch - m) dy += sp;
  }
  R.cam.x += dx; R.cam.y += dy; clampCam();
}
// ---------- end screen ----------
UI.showEnd = function (win) {
  const rows = W.players.slice(1).map(p => `<tr><td><span class="sw" style="background:${p.color.c}"></span>${p.name}</td><td>${CIVS[p.civ].name}</td><td>${AGES[p.age]}</td><td>${p.stats.kills}</td><td>${p.stats.lost}</td><td>${Math.floor(p.stats.gathered)}</td><td>${p.stats.relicGold}</td><td>${p.stats.tradeGold}</td><td>${p.alive ? (isFriend(p.id, W.humanId) ? 'Allied' : 'Alive') : 'Defeated'}</td></tr>`).join('');
  const btns = [['Restart', () => restartGame()]];
  if (UI.fromEditor) btns.push(['Return to Editor', () => { UI.gameRunning = false; Editor.open(UI.fromEditorName); }]);
  btns.push(['Main Menu', () => { UI.gameRunning = false; showScreen('menu'); }]);
  btns.push(['Keep watching', () => { }]);
  openModal(win ? '🏆 Victory!' : '💀 Defeat', `<p>${win ? 'All rival players have been defeated or are your allies.' : 'Your civilization has fallen.'} Time: ${fmtTime(W.t)}</p><table class="stats"><tr><th>Player</th><th>Civ</th><th>Age</th><th>Kills</th><th>Lost</th><th>Gathered</th><th>Relic gold</th><th>Trade gold</th><th>Status</th></tr>${rows}</table>`, btns);
};
// ---------- diplomacy ----------
function openDiplomacy() {
  const h = UI.human();
  const others = W.players.filter((p, i) => p && i !== W.humanId);
  const fee = Math.round(h.tributeFee * 100);
  const html = `<table class="dip"><tr><th>Player</th><th>Civ</th><th>Their stance</th><th>Your stance</th><th>Actions</th></tr>
  ${others.map(p => `<tr class="${p.alive ? '' : 'dead'}"><td><span class="sw" style="background:${p.color.c}"></span>${p.name}</td><td>${CIVS[p.civ].name}</td><td>${stanceLabel(p.stance[W.humanId])}</td><td>${stanceLabel(h.stance[p.id])}</td>
  <td>${p.alive ? `<button class="btn small" data-a="ally" data-p="${p.id}" ${h.stance[p.id] === 'ally' ? 'disabled' : ''}>Propose alliance</button>
  <button class="btn small" data-a="peace" data-p="${p.id}" ${h.stance[p.id] !== 'enemy' ? 'disabled' : ''}>Propose peace</button>
  <button class="btn small danger" data-a="war" data-p="${p.id}" ${h.stance[p.id] === 'enemy' ? 'disabled' : ''}>Declare war</button>` : 'Defeated'}</td></tr>`).join('')}</table>
  <h3>Tribute</h3><div class="row">To <select id="t-to">${others.filter(p => p.alive).map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</select>
  ${RES.map(r => `<button class="btn small" data-t="${r}" data-n="100">${RES_ICON[r]} 100</button><button class="btn small" data-t="${r}" data-n="500">${RES_ICON[r]} 500</button>`).join(' ')}</div>
  <p class="small">Tribute fee: <b>${fee}%</b> of the amount is lost (Coinage and some civilizations reduce it). Computer players remember gifts and are more willing to make peace or ally.</p>
  <p class="small"><b>Win condition:</b> you win when every surviving player is your ally. Allies never target each other; declaring war restores hostile targeting immediately. Peace (neutral) players will not attack but must eventually be allied or defeated.</p>
  <div id="dip-log" class="small"></div>`;
  const m = openModal('Diplomacy', html);
  m.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
    const pid = +b.dataset.p, a = b.dataset.a, p = W.players[pid];
    let text;
    if (a === 'war') { setStanceMutual(W.humanId, pid, 'enemy'); if (p.ai) p.ai.attitude[W.humanId] = (p.ai.attitude[W.humanId] || 0) - 30; text = `You declared war on ${p.name}.`; }
    else { const r = p.ai.consider(W.humanId, a); if (r.ok) setStanceMutual(W.humanId, pid, a === 'ally' ? 'ally' : 'neutral'); text = `${p.name} ${r.ok ? 'ACCEPTS' : 'REJECTS'} your ${a === 'ally' ? 'alliance' : 'peace'} proposal: "${r.reason}"`; }
    msg(text, a === 'war' ? '#f88' : '#ffd76a');
    openDiplomacy(); $('#dip-log').textContent = text;
  });
  m.querySelectorAll('[data-t]').forEach(b => b.onclick = () => {
    const to = +$('#t-to').value, r = b.dataset.t, n = +b.dataset.n;
    const err = tribute(W.humanId, to, r, n);
    const text = err || `Sent ${n} ${r} to ${W.players[to].name} (fee ${Math.round(n * h.tributeFee)}).`;
    msg(text, err ? '#fc8' : '#dfd'); $('#dip-log').textContent = text;
  });
}
UI.aiProposal = function (aiId, kind) {
  const p = W.players[aiId];
  msg(`${p.name} proposes an alliance!`, '#ffd76a');
  UI.pendingProposal = { aiId, kind };
  openModal('Diplomatic proposal', `<p><span class="sw" style="background:${p.color.c}"></span><b>${p.name}</b> (${CIVS[p.civ].name}) offers you an alliance.</p>`, [['Accept', () => { setStanceMutual(W.humanId, aiId, 'ally'); msg(`You are now allied with ${p.name}.`, '#dfd'); }], ['Decline', () => { p.ai.attitude[W.humanId] -= 10; msg(`You declined ${p.name}'s alliance.`, '#fc8'); }]]);
};
