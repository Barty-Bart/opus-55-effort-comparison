// Bootstrap: main menu (with a live background battle), loading, game session loop and screens.
import { BASE_SPEED, PLAYER_COLORS, AGE_NAMES, BUILDINGS, UNITS, TECHS, DIFFICULTY } from './config.js';
import { Game } from './game.js';
import { paintTerrain, minimapBase } from './map.js';
import { Renderer } from './render.js';
import { UI } from './ui.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { formatTime, clamp, rgba, TAU } from './util.js';
import { cursor } from './icons.js';

const $ = (id) => document.getElementById(id);
const canvas = $('view');
const audio = new AudioEngine();
let session = null;
let demo = null;

const SPEEDS = [0.5, 1, 1.5, 2, 3];
const errCount = {};
// Keep one failing subsystem from freezing the others; report each distinct error once.
function guard(name, fn) {
  try { fn(); } catch (err) {
    const k = name + ':' + err.message;
    if (!errCount[k]) console.error(`[${name}]`, err);
    errCount[k] = (errCount[k] || 0) + 1;
  }
}

// ---------------------------------------------------------------------------
// Settings persistence
// ---------------------------------------------------------------------------
const DEFAULTS = { playerName: 'You', color: 0, mapType: 'arabia', mapSize: 96, opponents: 1, difficulty: 'standard', startRes: 'standard', reveal: 'normal', tips: true, speed: 1, sfx: 0.7, music: 0.45 };
function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('aoc-settings') || '{}') }; } catch { return { ...DEFAULTS }; }
}
function saveSettings(s) { try { localStorage.setItem('aoc-settings', JSON.stringify(s)); } catch { /* storage unavailable */ } }
let settings = loadSettings();

// ---------------------------------------------------------------------------
// Session: one running game with its renderer, HUD and input
// ---------------------------------------------------------------------------
class Session {
  constructor(game, renderer, opts = {}) {
    this.game = game;
    this.renderer = renderer;
    this.audio = audio;
    this.demo = !!opts.demo;
    this.paused = false;
    this.speedIdx = opts.speedIdx ?? 1;
    this.over = false;
    this.ending = false;
    if (!this.demo) {
      this.ui = new UI(game, renderer, audio, this);
      this.input = new Input(this);
      this.wireEvents();
      this.setSpeed(this.speedIdx);
      this.tips = settings.tips ? [
        [4, 'Welcome, sire! Select your <b>Town Center</b> (press <b>H</b>) and train <b>Villagers</b> with <b>Q</b>.'],
        [26, 'Select villagers and <b>right-click</b> sheep, berries, trees, gold or stone to gather. Drag to box-select.'],
        [60, 'Each <b>House</b> supports 5 population. Villager → <b>Q</b> (Economic) → <b>Q</b> (House).'],
        [120, 'Build a <b>Lumber Camp</b> by the forest and a <b>Mill</b> by the berries so villagers walk less.'],
        [200, 'To reach the <b>Feudal Age</b> you need 500 food and two of: Barracks, Mill, Lumber Camp, Mining Camp.'],
        [320, 'The enemy will come. Train soldiers at the <b>Barracks</b>. When raided, ring the <b>Town Bell</b> (select TC, press <b>C</b>).'],
        [480, 'Counters: <b>spearmen</b> beat cavalry, <b>archers</b> beat infantry, <b>skirmishers</b> beat archers, <b>rams</b> crush buildings.'],
      ] : [];
    }
  }

  vol(x, y) {
    const r = this.renderer;
    const [sx, sy] = r.worldToScreen(x, y);
    const dx = (sx - r.W / 2) / r.W, dy = (sy - r.H / 2) / r.H;
    const d = Math.hypot(dx, dy);
    const zoomF = clamp(r.zoom, 0.6, 1.2);
    return clamp(1.15 - d * 1.5, 0, 1) * zoomF;
  }
  heard(e) {
    const g = this.game;
    if (!e) return false;
    if (g.spectate || g.settings.reveal === 'all') return true;
    return e.owner === g.humanId || g.tileVisible(e.x, e.y);
  }

  wireEvents() {
    const g = this.game, ui = this.ui, a = audio, h = g.humanId;
    g.on('notify', (d) => ui.notify(d.text, d.type, d));
    g.on('work', ({ unit, task }) => {
      if (!this.heard(unit)) return;
      const snd = { wood: 'chop', gold: 'mine', stone: 'mine', farm: 'farm', forage: 'forage', build: 'hammer' }[task];
      if (snd) a.play(snd, this.vol(unit.x, unit.y) * 0.45);
    });
    g.on('meleeHit', ({ attacker, target }) => {
      if (!this.heard(target)) return;
      const armed = attacker.def && (attacker.def.tc === 'infantry' || attacker.def.tc === 'cavalry');
      a.play(armed ? 'sword' : attacker.def && attacker.def.tc === 'siege' ? 'boom' : 'punch', this.vol(target.x, target.y) * (target.kind === 'building' ? 0.5 : 0.7));
    });
    g.on('shoot', ({ src, kind }) => {
      if (!src || !this.heard(src)) return;
      a.play(kind === 'stone' || kind === 'boulder' ? 'launch' : 'arrow', this.vol(src.x, src.y) * 0.5);
    });
    g.on('arrowHit', ({ x, y }) => { if (g.tileVisible(x, y)) a.play('hit', this.vol(x, y) * 0.35); });
    g.on('impact', ({ x, y }) => { if (g.tileVisible(x, y)) a.play('boom', this.vol(x, y) * 0.8); });
    g.on('unitDied', ({ unit }) => { if (!unit.animal && this.heard(unit)) a.play('death', this.vol(unit.x, unit.y) * 0.6); });
    g.on('buildingDestroyed', ({ building: b, killer }) => {
      if (b.type === 'farm') return;
      if (this.heard(b)) a.play('collapse', Math.max(0.3, this.vol(b.x, b.y)));
      if (b.owner === h && killer) ui.notify(`Your ${b.def.name} was destroyed!`, 'alert');
      else if (killer && killer.owner === h) ui.notify(`Enemy ${b.def.name} destroyed.`, 'good');
    });
    g.on('built', ({ building: b }) => {
      if (b.owner !== h) return;
      if (!b.def.wall && b.type !== 'farm' && b.type !== 'house') ui.notify(`${b.def.name} completed.`, 'good');
      a.play('built', b.type === 'house' || b.def.wall || b.type === 'farm' ? 0.4 : 0.8);
    });
    g.on('trained', ({ unit }) => { if (unit.owner === h) a.play('trained', 0.5); });
    g.on('techDone', ({ player, id }) => {
      if (player.id !== h || TECHS[id].ageUp) return;
      ui.notify(`${TECHS[id].name} researched.`, 'good');
      a.play('tech', 0.8);
    });
    g.on('ageUp', ({ player, age }) => {
      if (player.id === h) { a.play('ageup'); this.banner(AGE_NAMES[age], 'Your civilization advances!'); ui.notify(`You have advanced to the <b>${AGE_NAMES[age]}</b>!`, 'good'); }
      else ui.notify(`<span style="color:${player.color.light}">${player.name}</span> has advanced to the ${AGE_NAMES[age]}.`, 'info');
    });
    g.on('underAttack', ({ x, y, target }) => {
      a.play('alert', 0.8);
      ui.notify(target.isVillager ? 'Your villagers are under attack!' : target.kind === 'building' ? 'Your buildings are under attack!' : 'You are under attack!', 'alert');
    });
    let housedT = -99;
    g.on('housed', () => {
      if (g.time - housedT < 25) return;
      housedT = g.time;
      ui.notify('You need to build more <b>Houses</b>!', 'warn');
      a.play('error', 0.6);
    });
    g.on('converted', ({ unit, from, to }) => {
      if (this.heard(unit)) a.play('convert', 0.9);
      if (from.id === h) ui.notify(`Your ${unit.def.name} was converted!`, 'alert');
      else if (to.id === h) ui.notify(`${unit.def.name} converted to your cause.`, 'good');
    });
    g.on('heal', ({ unit }) => { if (this.heard(unit)) a.play('heal', this.vol(unit.x, unit.y) * 0.25); });
    g.on('bell', ({ player }) => { if (player.id === h || this.heard(player.start && { ...player.start, owner: player.id })) a.play('bell', player.id === h ? 0.9 : 0.4); });
    g.on('defeated', ({ player, reason }) => {
      if (player.id === h) return;
      ui.notify(`<span style="color:${player.color.light}">${player.name}</span> has been ${reason === 'resigned' ? 'forced to resign' : 'defeated'}.`, 'good');
    });
    g.on('sheepCaptured', ({ player }) => { if (player.id === h) a.play('sheep', 0.3); });
    g.on('gameOver', (d) => {
      this.ending = true;
      a.play(d.won ? 'victory' : 'defeat');
      this.banner(d.won ? 'Victory!' : 'Defeat', d.won ? (d.reason === 'wonder' ? 'Your Wonder stands eternal.' : 'Your enemies have been vanquished.') : 'Your civilization has fallen.');
      setTimeout(() => { if (session === this) showGameOver(this, d); }, 3200);
    });
  }

  banner(title, sub) {
    const el = $('banner');
    el.innerHTML = `<div class="b-title">${title}</div><div class="b-sub">${sub}</div>`;
    el.classList.remove('hidden', 'show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => el.classList.add('hidden'), 3600);
  }

  overlayOpen() { return !$('ingamemenu').classList.contains('hidden') || !$('help').classList.contains('hidden') || !$('gameover').classList.contains('hidden'); }
  setPaused(p) {
    this.paused = p;
    $('pausedbanner').classList.toggle('hidden', !p || this.overlayOpen());
    $('btn-pause').textContent = p ? '▶' : '❚❚';
  }
  setSpeed(i) {
    this.speedIdx = clamp(i, 0, SPEEDS.length - 1);
    $('btn-speed').textContent = SPEEDS[this.speedIdx].toFixed(1) + '×';
    settings.speed = this.speedIdx; saveSettings(settings);
  }
  openMenu() {
    this.wasPaused = this.paused;
    this.setPaused(true);
    $('ingamemenu').classList.remove('hidden');
    $('pausedbanner').classList.add('hidden');
  }
  closeMenu() {
    $('ingamemenu').classList.add('hidden');
    this.setPaused(!!this.wasPaused);
  }
  showHelp() {
    this.wasPausedHelp = this.paused;
    this.setPaused(true);
    $('help').classList.remove('hidden');
    $('pausedbanner').classList.add('hidden');
  }

  frame(dt) {
    const g = this.game, r = this.renderer;
    let simDt = 0;
    if (!this.paused && !(this.overlayOpen() && !this.demo)) {
      simDt = dt * BASE_SPEED * (this.demo ? 0.7 : SPEEDS[this.speedIdx]);
      let rem = simDt;
      while (rem > 1e-6) { const st = Math.min(rem, 0.06); g.update(st); rem -= st; }
    }
    if (this.demo) {
      this.camT = (this.camT || 0) + dt;
      const p = g.players[1];
      const tc = g.buildings.find((b) => b.owner === 1 && b.type === 'towncenter') || { x: p.start.x, y: p.start.y };
      const a = this.camT * 0.05;
      // drift around the town, keeping it to the right of the menu panel
      const N = g.map.N, dx = N / 2 - tc.x, dy = N / 2 - tc.y, dl = Math.hypot(dx, dy) || 1;
      r.centerOn(tc.x + (dx / dl) * 2 + Math.cos(a) * 3, tc.y + (dy / dl) * 2 + Math.sin(a) * 3);
      r.camX -= (r.W * 0.16) / r.zoom;
    }
    guard('render', () => r.render(simDt));
    if (!this.demo) {
      guard('ui', () => this.ui.update(dt));
      guard('input', () => this.input.update(dt));
      if (this.tips.length && g.time >= this.tips[0][0]) { this.ui.notify(this.tips.shift()[1], 'tip'); }
    }
  }

  destroy() {
    if (this.input) this.input.destroy();
    if (this.ui) this.ui.destroy();
    this.game.listeners = {};
    $('hud').classList.add('hidden');
    $('banner').classList.add('hidden');
    $('pausedbanner').classList.add('hidden');
  }
}

// ---------------------------------------------------------------------------
// Creating games
// ---------------------------------------------------------------------------
function terrainRes(N) { return Math.max(16, Math.min(32, Math.floor(3072 / N))); }

async function createGame(cfg, onProgress) {
  const game = new Game(cfg);
  game.init();
  game.minimapColors = minimapBase(game.map);
  const P = cfg.terrainRes || terrainRes(game.map.N);
  const terrain = await paintTerrain(game.map, P, game.seed, onProgress);
  const renderer = new Renderer(canvas, game, terrain, P);
  return { game, renderer };
}

async function startDemo() {
  const cfg = { seed: (Math.random() * 1e9) | 0, mapSize: 64, opponents: 1, mapType: 'arabia', difficulty: 'hard', startRes: 'high', reveal: 'all', spectate: true, color: 0, terrainRes: 20 };
  const { game, renderer } = await createGame(cfg);
  for (let t = 0; t < 60 * 11; t += 0.1) game.update(0.1);
  renderer.viewTop = 0; renderer.viewBottom = 0;
  renderer.zoom = 1.15;
  if (session) return; // the player already started
  demo = new Session(game, renderer, { demo: true });
}

async function startGame() {
  settings = readMenu();
  saveSettings(settings);
  audio.init();
  audio.setSfxVolume(settings.sfx); audio.setMusicVolume(settings.music);
  demo = null;
  if (session) { session.destroy(); session = null; }
  $('mainmenu').classList.add('hidden');
  $('gameover').classList.add('hidden');
  const load = $('loading');
  load.classList.remove('hidden');
  const bar = load.querySelector('.lbar div'), txt = load.querySelector('.ltext');
  const stage = (t, f) => { txt.textContent = t; bar.style.width = `${f * 100}%`; };
  stage('Surveying the land…', 0.02);
  await new Promise((r) => setTimeout(r, 30));
  const size = +settings.mapSize + (settings.opponents >= 3 ? 24 : 0);
  const cfg = {
    seed: settings.seed ? +settings.seed : (Math.random() * 1e9) | 0,
    mapSize: size, opponents: +settings.opponents, mapType: settings.mapType, difficulty: settings.difficulty,
    startRes: settings.startRes, reveal: settings.reveal, color: +settings.color, playerName: settings.playerName || 'You',
  };
  const { game, renderer } = await createGame(cfg, (f) => stage('Painting forests, rivers and fields…', 0.05 + f * 0.85));
  stage('Raising your town…', 0.95);
  await new Promise((r) => setTimeout(r, 30));
  if (cfg.reveal === 'explored') game.explored.fill(1);
  renderer.viewTop = 44; renderer.viewBottom = 196;
  renderer.zoom = 1.25;
  const tc = game.buildings.find((b) => b.owner === game.humanId && b.type === 'towncenter');
  renderer.centerOn(tc.x + 1, tc.y + 1);
  session = new Session(game, renderer, { speedIdx: settings.speed ?? 1 });
  game.updateVisibility();
  load.classList.add('hidden');
  session.banner(AGE_NAMES[0], `${DIFFICULTY[cfg.difficulty].name} · ${{ arabia: 'Arabia', forest: 'Black Forest', lakes: 'Lakes' }[cfg.mapType]} · ${cfg.opponents} opponent${cfg.opponents > 1 ? 's' : ''}`);
  if (!settings.seenHelp) { settings.seenHelp = true; saveSettings(settings); setTimeout(() => session && session.showHelp(), 400); }
}

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------
function buildMenu() {
  const sel = $('opt-color');
  sel.innerHTML = PLAYER_COLORS.map((c, i) => `<option value="${i}">${c.name}</option>`).join('');
  $('opt-name').value = settings.playerName;
  sel.value = settings.color;
  $('opt-map').value = settings.mapType;
  $('opt-size').value = settings.mapSize;
  $('opt-opp').value = settings.opponents;
  $('opt-diff').value = settings.difficulty;
  $('opt-res').value = settings.startRes;
  $('opt-reveal').value = settings.reveal;
  $('opt-tips').checked = settings.tips;
  $('opt-seed').value = settings.seed || '';
  const sw = () => { $('color-swatch').style.background = PLAYER_COLORS[+sel.value].main; };
  sel.onchange = sw; sw();
  $('btn-start').onclick = () => startGame();
  $('btn-howto').onclick = () => { $('help').classList.remove('hidden'); };
  document.body.style.cursor = cursor('default');
}
function readMenu() {
  return {
    ...settings,
    playerName: $('opt-name').value.trim().slice(0, 16) || 'You',
    color: +$('opt-color').value, mapType: $('opt-map').value, mapSize: +$('opt-size').value, opponents: +$('opt-opp').value,
    difficulty: $('opt-diff').value, startRes: $('opt-res').value, reveal: $('opt-reveal').value, tips: $('opt-tips').checked,
    seed: $('opt-seed').value.trim(),
  };
}

function toMainMenu() {
  if (session) { session.destroy(); session = null; }
  $('ingamemenu').classList.add('hidden');
  $('gameover').classList.add('hidden');
  $('help').classList.add('hidden');
  $('mainmenu').classList.remove('hidden');
  startDemo();
}

function wireScreens() {
  $('btn-resume').onclick = () => session && session.closeMenu();
  $('btn-restart').onclick = () => { $('ingamemenu').classList.add('hidden'); startGame(); };
  $('btn-quit').onclick = () => toMainMenu();
  $('btn-resign').onclick = () => { if (!session) return; $('ingamemenu').classList.add('hidden'); session.setPaused(false); session.game.resign(session.game.human); };
  $('btn-menu').onclick = () => session && session.openMenu();
  $('btn-help').onclick = () => session && session.showHelp();
  $('btn-pause').onclick = () => session && session.setPaused(!session.paused);
  $('btn-speed').onclick = () => session && session.setSpeed((session.speedIdx + 1) % SPEEDS.length);
  $('help-close').onclick = () => { $('help').classList.add('hidden'); if (session) session.setPaused(!!session.wasPausedHelp); };
  $('go-menu').onclick = () => toMainMenu();
  $('go-again').onclick = () => startGame();
  $('go-continue').onclick = () => { $('gameover').classList.add('hidden'); if (session) session.setPaused(false); };
  const sfx = $('vol-sfx'), mus = $('vol-music');
  sfx.value = settings.sfx; mus.value = settings.music;
  sfx.oninput = () => { settings.sfx = +sfx.value; audio.setSfxVolume(settings.sfx); saveSettings(settings); };
  mus.oninput = () => { settings.music = +mus.value; audio.setMusicVolume(settings.music); saveSettings(settings); };
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('help').classList.contains('hidden')) { $('help-close').click(); e.stopImmediatePropagation(); }
    else if (!$('ingamemenu').classList.contains('hidden')) { session && session.closeMenu(); e.stopImmediatePropagation(); }
  }, true);
  window.addEventListener('resize', () => { const r = session ? session.renderer : demo ? demo.renderer : null; if (r) r.resize(); });
  document.addEventListener('pointerdown', () => audio.init(), { once: true });
  // HUD buttons must not keep keyboard focus, or Space/Enter would re-press them
  document.addEventListener('mousedown', (e) => { if (e.target.closest && e.target.closest('#hud button')) e.preventDefault(); });
}

// ---------------------------------------------------------------------------
// End of game statistics
// ---------------------------------------------------------------------------
function showGameOver(s, d) {
  const g = s.game;
  s.setPaused(true);
  $('pausedbanner').classList.add('hidden');
  const el = $('gameover');
  el.classList.remove('hidden');
  $('go-title').textContent = d.won ? 'Victory' : 'Defeat';
  $('go-title').className = d.won ? 'win' : 'lose';
  $('go-sub').textContent = `${d.won ? (d.reason === 'wonder' ? 'Your Wonder has secured your legacy' : 'You have conquered your rivals') : 'Your people have been conquered'} after ${formatTime(g.time)} of game time.`;
  $('go-continue').classList.toggle('hidden', !d.won);
  const players = g.players.filter((p) => !p.isGaia);
  const ageT = (p, a) => (p.stats.ageTimes[a] != null ? formatTime(p.stats.ageTimes[a]) : '—');
  const rows = [
    ['Score', (p) => g.score(p)],
    ['Units killed', (p) => p.stats.unitsKilled],
    ['Units lost', (p) => p.stats.unitsLost],
    ['Buildings razed', (p) => p.stats.buildingsRazed],
    ['Villagers trained', (p) => p.stats.villagersTrained],
    ['Military trained', (p) => p.stats.militaryTrained],
    ['Food gathered', (p) => Math.floor(p.stats.gathered.food)],
    ['Wood gathered', (p) => Math.floor(p.stats.gathered.wood)],
    ['Gold gathered', (p) => Math.floor(p.stats.gathered.gold)],
    ['Stone gathered', (p) => Math.floor(p.stats.gathered.stone)],
    ['Technologies', (p) => p.stats.techs],
    ['Feudal Age', (p) => ageT(p, 1)],
    ['Castle Age', (p) => ageT(p, 2)],
    ['Imperial Age', (p) => ageT(p, 3)],
  ];
  let html = `<table><thead><tr><th></th>${players.map((p) => `<th><span class="sw" style="background:${p.color.main}"></span>${p.name}${p.defeated ? ' <em>(defeated)</em>' : ''}</th>`).join('')}</tr></thead><tbody>`;
  for (const [label, fn] of rows) html += `<tr><td>${label}</td>${players.map((p) => `<td>${fn(p)}</td>`).join('')}</tr>`;
  html += '</tbody></table>';
  $('go-table').innerHTML = html;
  drawChart($('go-chart'), g, players);
}

const DASHES = [[], [7, 4], [2, 3], [10, 3, 2, 3]];
const MARKS = ['circle', 'square', 'triangle', 'diamond'];
function drawMarker(ctx, kind, x, y, r) {
  ctx.beginPath();
  if (kind === 'circle') ctx.arc(x, y, r, 0, TAU);
  else if (kind === 'square') ctx.rect(x - r, y - r, r * 2, r * 2);
  else if (kind === 'triangle') { ctx.moveTo(x, y - r * 1.2); ctx.lineTo(x + r * 1.1, y + r * 0.8); ctx.lineTo(x - r * 1.1, y + r * 0.8); ctx.closePath(); }
  else { ctx.moveTo(x, y - r * 1.25); ctx.lineTo(x + r * 1.1, y); ctx.lineTo(x, y + r * 1.25); ctx.lineTo(x - r * 1.1, y); ctx.closePath(); }
}

// Population over time: one line per player, colour = player colour (identity),
// plus dash pattern + marker shape + direct end label so identity never relies on colour alone.
function drawChart(cv, g, players) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = cv.clientWidth || 520, H = cv.clientHeight || 220;
  cv.width = W * dpr; cv.height = H * dpr;
  const ctx = cv.getContext('2d');
  const hist = g.history;
  const pad = { l: 38, r: 96, t: 14, b: 26 };
  const T = Math.max(60, hist.length ? hist[hist.length - 1].t : 60);
  const series = players.map((p) => ({ p, pts: hist.map((h) => ({ t: h.t, v: h.p[p.id] ? h.p[p.id].vill + h.p[p.id].mil : 0 })) }));
  const maxV = Math.max(10, ...series.flatMap((s) => s.pts.map((q) => q.v)));
  const niceMax = Math.ceil(maxV / 10) * 10;
  const X = (t) => pad.l + (t / T) * (W - pad.l - pad.r);
  const Y = (v) => H - pad.b - (v / niceMax) * (H - pad.t - pad.b);
  const draw = (hoverT) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.font = '11px "EB Garamond", Georgia, serif';
    // recessive grid + axis labels in text ink
    ctx.strokeStyle = 'rgba(232,220,190,0.12)'; ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(232,220,190,0.6)';
    for (let i = 0; i <= 4; i++) {
      const v = (niceMax / 4) * i, y = Y(v);
      ctx.beginPath(); ctx.moveTo(pad.l, y + 0.5); ctx.lineTo(W - pad.r, y + 0.5); ctx.stroke();
      ctx.textAlign = 'right'; ctx.fillText(String(Math.round(v)), pad.l - 6, y + 4);
    }
    ctx.textAlign = 'center';
    const step = T > 3600 ? 900 : T > 1800 ? 600 : T > 600 ? 300 : 60;
    for (let t = 0; t <= T; t += step) ctx.fillText(formatTime(t), X(t), H - 8);
    // series
    series.forEach((s, i) => {
      ctx.strokeStyle = s.p.color.main; ctx.lineWidth = 2; ctx.setLineDash(DASHES[i % 4]); ctx.lineJoin = 'round';
      ctx.beginPath();
      s.pts.forEach((q, j) => (j ? ctx.lineTo(X(q.t), Y(q.v)) : ctx.moveTo(X(q.t), Y(q.v))));
      ctx.stroke();
      ctx.setLineDash([]);
      const last = s.pts[s.pts.length - 1];
      if (last) {
        ctx.fillStyle = s.p.color.main; ctx.strokeStyle = '#1b1712'; ctx.lineWidth = 2;
        drawMarker(ctx, MARKS[i % 4], X(last.t), Y(last.v), 4); ctx.stroke(); ctx.fill();
      }
    });
    // direct end labels (text ink, not series colour), nudged apart to avoid collisions
    const labels = series.map((s, i) => { const l = s.pts[s.pts.length - 1] || { t: 0, v: 0 }; return { i, s, y: Y(l.v), x: X(l.t) }; }).sort((a, b) => a.y - b.y);
    for (let k = 1; k < labels.length; k++) if (labels[k].y - labels[k - 1].y < 13) labels[k].y = labels[k - 1].y + 13;
    ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(240,230,205,0.92)';
    for (const l of labels) ctx.fillText(`${l.s.p.name.slice(0, 12)}`, l.x + 9, l.y + 4);
    // hover crosshair + tooltip
    if (hoverT != null && hist.length) {
      let idx = 0, bd = 1e9;
      hist.forEach((h, j) => { const d = Math.abs(h.t - hoverT); if (d < bd) { bd = d; idx = j; } });
      const h = hist[idx], x = X(h.t);
      ctx.strokeStyle = 'rgba(240,230,205,0.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + 0.5, pad.t); ctx.lineTo(x + 0.5, H - pad.b); ctx.stroke();
      const lines = series.map((s, i) => ({ s, i, v: s.pts[idx] ? s.pts[idx].v : 0, d: h.p[s.p.id] }));
      series.forEach((s, i) => { const q = s.pts[idx]; if (!q) return; ctx.fillStyle = s.p.color.main; ctx.strokeStyle = '#1b1712'; ctx.lineWidth = 2; drawMarker(ctx, MARKS[i % 4], x, Y(q.v), 4); ctx.stroke(); ctx.fill(); });
      const bw = 170, bh = 20 + lines.length * 16;
      const bx = x + 12 + bw > W ? x - 12 - bw : x + 12, by = pad.t + 4;
      ctx.fillStyle = 'rgba(20,16,12,0.94)'; ctx.strokeStyle = 'rgba(201,161,60,0.6)';
      ctx.fillRect(bx, by, bw, bh); ctx.strokeRect(bx + 0.5, by + 0.5, bw, bh);
      ctx.fillStyle = 'rgba(240,230,205,0.95)'; ctx.textAlign = 'left';
      ctx.fillText(formatTime(h.t), bx + 8, by + 14);
      lines.forEach((l, k) => {
        const yy = by + 30 + k * 16;
        ctx.fillStyle = l.s.p.color.main; drawMarker(ctx, MARKS[l.i % 4], bx + 12, yy - 4, 3.5); ctx.fill();
        ctx.fillStyle = 'rgba(240,230,205,0.95)';
        ctx.fillText(`${l.s.p.name.slice(0, 10)}: ${l.v} (${l.d ? l.d.vill : 0} vil · ${l.d ? l.d.mil : 0} mil)`, bx + 22, yy);
      });
    }
  };
  draw(null);
  cv.onmousemove = (e) => {
    const rc = cv.getBoundingClientRect();
    const x = e.clientX - rc.left;
    if (x < pad.l || x > W - pad.r) { draw(null); return; }
    draw(((x - pad.l) / (W - pad.l - pad.r)) * T);
  };
  cv.onmouseleave = () => draw(null);
  // legend (always present for >= 2 series)
  $('go-legend').innerHTML = series.map((s, i) => {
    const dash = DASHES[i % 4].length ? `stroke-dasharray="${DASHES[i % 4].join(' ')}"` : '';
    return `<span class="lg"><svg width="30" height="12"><line x1="1" y1="6" x2="29" y2="6" stroke="${s.p.color.main}" stroke-width="2" ${dash}/></svg>${s.p.name}</span>`;
  }).join('') + '<span class="lg muted">Population (villagers + military) over time</span>';
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  try {
    if (session) session.frame(dt);
    else if (demo) demo.frame(dt);
  } catch (err) {
    console.error(err);
  }
  requestAnimationFrame(loop);
}

buildMenu();
wireScreens();
startDemo();
requestAnimationFrame(loop);

// debugging / automated testing hooks
window.__aoc = {
  get session() { return session; },
  get demo() { return demo; },
  startGame, toMainMenu, settings: () => settings, UNITS, BUILDINGS,
};
