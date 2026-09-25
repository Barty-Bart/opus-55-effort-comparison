// Application shell: menus, game lifecycle, main loop, event routing.
import { Game, DT } from './core/game.js';
import { AI } from './core/ai.js';
import { PLAYER_COLORS, AGE_NAMES, TECHS, BUILDINGS, UNITS } from './core/data.js';
import { Renderer } from './render/renderer.js';
import { Minimap } from './render/minimap.js';
import { HUD } from './ui/hud.js';
import { Controller } from './ui/input.js';
import { AudioEngine } from './audio/audio.js';
import { emblemURL } from './render/icons.js';

const $ = (id) => document.getElementById(id);
const AI_NAMES = ['Charlemagne', 'Saladin', 'Joan of Arc', 'Barbarossa', 'El Cid', 'Alfred the Great', 'Genghis Khan', 'Richard Lionheart', 'William the Conqueror', 'Frederick II'];
const SPEEDS = [1, 1.5, 2, 3];

function loadSettings() {
  const def = { master: 80, sfx: 80, music: 45, scrollSpeed: 100, edgeScroll: true, hints: true };
  try { return { ...def, ...JSON.parse(localStorage.getItem('aok-settings') || '{}') }; } catch { return def; }
}

class App {
  constructor() {
    this.canvas = $('game');
    this.audio = new AudioEngine();
    this.settings = loadSettings();
    this.game = null;
    this.renderer = null;
    this.mode = 'menu';
    this.paused = false;
    this.menuOpen = false;
    this.speed = 1.5;
    this.acc = 0;
    this.last = performance.now();
    this.lastHud = 0; this.lastMini = 0;
    this.viewer = 0;
    this.hud = null;
    this.ctl = null;
    this.minimap = null;
    this.hintsShown = new Set();
    this.bindMenus();
    this.applySettings();
    window.addEventListener('resize', () => { if (this.renderer) this.renderer.resize(); if (this.minimap) this.minimap.resize(); });
    document.addEventListener('pointerdown', () => this.audio.unlock(), { capture: true });
    // HUD buttons must not keep keyboard focus (Space/Enter would re-trigger them)
    document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('#hud button'); if (b) b.blur(); });
    document.addEventListener('keydown', () => this.audio.unlock(), { capture: true });
    $('menu-screen').querySelector('.emblem').style.backgroundImage = `url(${emblemURL()})`;
    this.frame = this.frame.bind(this);
    requestAnimationFrame(this.frame);
    setTimeout(() => this.startAttract(), 50);
  }

  inGame() { return this.mode === 'game'; }

  // ---------------------------------------------------------------- settings
  applySettings() {
    const s = this.settings;
    this.audio.setVolumes({ master: s.master / 100, sfx: s.sfx / 100, music: s.music / 100 });
    try { localStorage.setItem('aok-settings', JSON.stringify(s)); } catch { /* private mode */ }
  }

  // ---------------------------------------------------------------- menus
  bindMenus() {
    const show = (id) => { for (const s of ['menu-screen', 'setup-screen', 'howto-screen', 'options-screen']) $(s).classList.toggle('hidden', s !== id); };
    this.showScreen = show;
    const colSel = $('opt-color');
    colSel.innerHTML = PLAYER_COLORS.slice(0, 7).map((c, i) => `<option value="${i}">${c.name}</option>`).join('');
    $('btn-new').onclick = () => { this.audio.play('click'); show('setup-screen'); };
    $('btn-howto').onclick = () => { this.audio.play('click'); this.howtoFrom = 'menu'; show('howto-screen'); };
    $('btn-options').onclick = () => { this.audio.play('click'); this.optionsFrom = 'menu'; this.openOptions(); };
    $('btn-setup-back').onclick = () => { this.audio.play('click'); show('menu-screen'); };
    $('btn-howto-back').onclick = () => {
      this.audio.play('click');
      if (this.howtoFrom === 'game') { $('howto-screen').classList.add('hidden'); $('game-menu').classList.remove('hidden'); }
      else show('menu-screen');
    };
    $('btn-options-back').onclick = () => {
      this.audio.play('click');
      if (this.optionsFrom === 'game') { $('options-screen').classList.add('hidden'); $('game-menu').classList.remove('hidden'); }
      else show('menu-screen');
    };
    $('btn-start').onclick = () => { this.audio.play('click'); this.startFromSetup(); };
    // options
    const bindRange = (id, key) => { const el = $(id); el.oninput = () => { this.settings[key] = Number(el.value); this.applySettings(); }; };
    bindRange('vol-master', 'master'); bindRange('vol-sfx', 'sfx'); bindRange('vol-music', 'music'); bindRange('scroll-speed', 'scrollSpeed');
    $('edge-scroll').onchange = () => { this.settings.edgeScroll = $('edge-scroll').value === '1'; this.applySettings(); };
    $('opt-hints').onchange = () => { this.settings.hints = $('opt-hints').value === '1'; this.applySettings(); };
    // top bar
    $('btn-menu').onclick = () => this.toggleMenu();
    $('btn-pause').onclick = () => this.togglePause();
    $('btn-speed').onclick = () => this.changeSpeed(1, true);
    $('btn-objectives').onclick = () => $('scores').classList.toggle('hidden');
    // game menu
    $('gm-resume').onclick = () => this.toggleMenu(false);
    $('gm-options').onclick = () => { this.optionsFrom = 'game'; $('game-menu').classList.add('hidden'); this.openOptions(); };
    $('gm-howto').onclick = () => { this.howtoFrom = 'game'; $('game-menu').classList.add('hidden'); $('howto-screen').classList.remove('hidden'); };
    // Destructive choices need a second click to confirm
    const confirmBtn = (id, label, fn) => {
      const el = $(id);
      el.onclick = () => {
        if (el.dataset.armed === '1') { el.dataset.armed = ''; el.textContent = label; fn(); return; }
        el.dataset.armed = '1'; el.textContent = 'Click again to confirm';
        setTimeout(() => { el.dataset.armed = ''; el.textContent = label; }, 3000);
      };
    };
    confirmBtn('gm-restart', 'Restart', () => { this.toggleMenu(false); this.startGame(this.lastSetup); });
    confirmBtn('gm-resign', 'Resign', () => { this.toggleMenu(false); if (this.game && this.game.players[this.viewer].alive) this.game.cmdResign(this.viewer); });
    confirmBtn('gm-quit', 'Quit to Main Menu', () => { this.toggleMenu(false); this.quitToMenu(); });
    $('end-continue').onclick = () => {
      $('end-screen').classList.add('hidden'); this.keepWatching = true;
      if (this.game && !this.game.players[this.viewer].alive && this.renderer) { this.renderer.fullView = true; this.hud.message('Spectating — the whole map is revealed.', 'info', 6000); }
    };
    $('end-again').onclick = () => { $('end-screen').classList.add('hidden'); this.startGame(this.lastSetup); };
    $('end-menu').onclick = () => { $('end-screen').classList.add('hidden'); this.quitToMenu(); };
  }

  openOptions() {
    const s = this.settings;
    $('vol-master').value = s.master; $('vol-sfx').value = s.sfx; $('vol-music').value = s.music; $('scroll-speed').value = s.scrollSpeed;
    $('edge-scroll').value = s.edgeScroll ? '1' : '0'; $('opt-hints').value = s.hints ? '1' : '0';
    if (this.optionsFrom === 'game') $('options-screen').classList.remove('hidden');
    else this.showScreen('options-screen');
  }

  toggleMenu(force) {
    if (!this.inGame()) return;
    const open = force !== undefined ? force : !this.menuOpen;
    this.menuOpen = open;
    $('game-menu').classList.toggle('hidden', !open);
    if (!open) { $('options-screen').classList.add('hidden'); $('howto-screen').classList.add('hidden'); }
    this.audio.play('click');
  }
  togglePause() {
    if (!this.inGame()) return;
    this.paused = !this.paused;
    $('paused-label').classList.toggle('hidden', !this.paused);
    $('btn-pause').classList.toggle('on', this.paused);
    this.audio.play('click');
  }
  changeSpeed(dir, cycle = false) {
    let i = SPEEDS.indexOf(this.speed);
    if (i < 0) i = 1;
    i = cycle ? (i + 1) % SPEEDS.length : Math.max(0, Math.min(SPEEDS.length - 1, i + dir));
    this.speed = SPEEDS[i];
    $('btn-speed').textContent = this.speed.toFixed(1) + '×';
    if (this.hud) this.hud.message(`Game speed ${this.speed.toFixed(1)}×`, 'info', 1500);
  }

  readSetup() {
    const seedTxt = $('opt-seed').value.trim();
    return {
      name: $('opt-name').value.trim() || 'Player',
      color: Number($('opt-color').value),
      mapType: $('opt-map').value,
      size: Number($('opt-size').value),
      opponents: Number($('opt-opp').value),
      difficulty: $('opt-diff').value,
      teams: $('opt-teams').value,
      startAge: Number($('opt-age').value),
      startRes: $('opt-res').value,
      reveal: $('opt-reveal').value,
      speed: Number($('opt-speed').value),
      seed: seedTxt ? (Number(seedTxt) || [...seedTxt].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)) : null,
    };
  }
  startFromSetup() { this.startGame(this.readSetup()); }

  // ---------------------------------------------------------------- game lifecycle
  teardown() {
    if (this.ctl) this.ctl.detach();
    this.ctl = null; this.hud = null; this.minimap = null;
    this.game = null; this.renderer = null;
    this.paused = false; this.menuOpen = false;
    $('paused-label').classList.add('hidden');
    $('hud').classList.add('hidden');
    $('scores').classList.add('hidden');
    $('messages').innerHTML = '';
  }

  startAttract() {
    this.teardown();
    this.mode = 'menu';
    const seed = (Math.random() * 1e9) | 0;
    const game = new Game({
      seed, size: 72, mapType: Math.random() < 0.5 ? 'arabia' : 'lakes', reveal: 'all', startAge: 2, startRes: 'high',
      players: [{ name: 'A', color: 0, ai: 'hard' }, { name: 'B', color: 1, ai: 'hard' }],
    });
    game.players.forEach((p, i) => { p.ai = new AI(game, p, 'hard', seed + i); });
    this.game = game;
    this.viewer = 0;
    this.renderer = new Renderer(this.canvas, game, 0);
    const st = game.players[0].start;
    this.renderer.centerOn(st.cx + 6, st.cy + 6);
    this.renderer.cam.zoom = 1.05;
    this.attract = { tx: st.cx, ty: st.cy, t: 0 };
    this.speed = 1.5;
    // warm up the simulation so the scene is lively
    for (let i = 0; i < 20 * 90; i++) game.step(DT);
    game.events.length = 0;
    this.showScreen('menu-screen');
  }

  updateAttract(dt) {
    const a = this.attract, g = this.game, r = this.renderer;
    a.t -= dt;
    if (a.t <= 0) {
      a.t = 14;
      const p = g.players[Math.floor(Math.random() * g.players.length)];
      const list = [...p.buildings, ...p.units.filter((u) => u.isMilitary)];
      const e = list[Math.floor(Math.random() * list.length)];
      if (e) { a.tx = e.x; a.ty = e.y; }
    }
    const [ix, iy] = r.iso(a.tx, a.ty);
    r.cam.x += (ix - r.cam.x) * Math.min(1, dt * 0.25);
    r.cam.y += (iy - r.cam.y) * Math.min(1, dt * 0.25);
    r.clampCam();
    if (g.over || g.time > 60 * 30) this.startAttract();
  }

  startGame(setup) {
    if (!setup) setup = this.readSetup();
    this.lastSetup = setup;
    $('loading').classList.remove('hidden');
    for (const s of ['menu-screen', 'setup-screen', 'howto-screen', 'options-screen', 'end-screen']) $(s).classList.add('hidden');
    setTimeout(() => {
      try { this.createGame(setup); } catch (e) { console.error(e); alert('Failed to start game: ' + e.message); this.startAttract(); }
      $('loading').classList.add('hidden');
    }, 40);
  }

  createGame(setup) {
    this.teardown();
    for (const sc of ['menu-screen', 'setup-screen', 'howto-screen', 'options-screen', 'end-screen', 'game-menu']) $(sc).classList.add('hidden');
    const seed = setup.seed ?? ((Math.random() * 1e9) | 0);
    const used = new Set([setup.color]);
    const players = [{ name: setup.name, color: setup.color, human: true, team: setup.teams === 'allvsyou' ? 1 : 0 }];
    const names = AI_NAMES.slice().sort(() => Math.random() - 0.5);
    for (let i = 0; i < setup.opponents; i++) {
      let c = 0; while (used.has(c)) c++;
      used.add(c);
      players.push({ name: names[i], color: c, ai: setup.difficulty, team: setup.teams === 'allvsyou' ? 2 : 0 });
    }
    const game = new Game({
      seed, size: setup.size, mapType: setup.mapType, reveal: setup.reveal === 'all' ? 'all' : 'normal',
      startAge: setup.startAge, startRes: setup.startRes, players,
    });
    game.players.forEach((p, i) => { if (!p.human) p.ai = new AI(game, p, setup.difficulty, seed + i * 17); });
    if (setup.reveal === 'explored') for (const p of game.players) p.explored.fill(1);
    this.game = game;
    this.viewer = 0;
    this.mode = 'game';
    this.speed = setup.speed || 1.5;
    $('btn-speed').textContent = this.speed.toFixed(1) + '×';
    this.renderer = new Renderer(this.canvas, game, 0);
    this.hud = new HUD(this);
    this.minimap = new Minimap($('minimap'), this.renderer);
    this.ctl = new Controller(this);
    this.ctl.attach();
    this.renderer.ui.selection = this.ctl.sel;
    const st = game.players[0].start;
    this.renderer.centerOn(st.cx + 1.5, st.cy + 1.5);
    this.hud.show();
    this.minimap.resize();
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    this.endShown = false; this.keepWatching = false;
    this.hintsShown = new Set();
    this.lastHoused = -99;
    this.hud.message(`Welcome, ${setup.name}! ${AGE_NAMES[game.players[0].age]} begins.`, 'good', 6000);
    if (game.players.length > 1) this.hud.message(`Your rival${game.players.length > 2 ? 's' : ''}: ${game.players.slice(1).map((p) => p.name).join(', ')} (${setup.difficulty}).`, 'info', 8000);
    this.audio.play('bell');
  }

  quitToMenu() {
    this.startAttract();
  }

  // ---------------------------------------------------------------- events → feedback
  posAudio(x, y, range = 22) {
    const r = this.renderer;
    const [ix, iy] = r.iso(x, y);
    const dx = (ix - r.cam.x) / 32, dy = (iy - r.cam.y) / 16;
    const d = Math.hypot(dx * 0.7, dy * 0.7);
    if (d > range) return null;
    return { vol: Math.max(0.15, 1 - d / range), pan: Math.max(-0.8, Math.min(0.8, dx / 20)) };
  }
  visible(x, y) { return this.renderer.visibleTile(Math.floor(x), Math.floor(y)); }

  processEvents() {
    const g = this.game;
    if (!g.events.length) return;
    const evs = g.events;
    g.events = [];
    for (const e of evs) {
      this.renderer.onEvent(e);
      if (this.mode === 'game') this.handleEvent(e);
    }
  }

  handleEvent(e) {
    const g = this.game, pi = this.viewer, hud = this.hud, A = this.audio;
    const pname = (i) => `${g.players[i].name}`;
    switch (e.type) {
      case 'underAttack': {
        if (e.player !== pi) break;
        const t = e.target;
        const what = t.kind === 'building' ? 'Your town is under attack!' : t.isVillager ? 'Your villagers are under attack!' : 'Your army is under attack!';
        hud.message(what, 'alert', 5000);
        A.play('alarm');
        this.minimap.ping(e.x, e.y);
        this.ctl.lastAlert = { x: e.x, y: e.y };
        if (!this.hintsShown.has('bell') && t.isVillager && this.settings.hints) { this.hintsShown.add('bell'); setTimeout(() => hud.message('Tip: ring the Town Bell (select your Town Center, press Z) — sheltered villagers make it fire more arrows. Press Space to jump to the attack.', 'info', 10000), 1500); }
        break;
      }
      case 'age':
        if (e.player === pi) { hud.banner(AGE_NAMES[e.age], 'New buildings, units and technologies are available'); A.play('age'); }
        else hud.message(`${pname(e.player)} has advanced to the ${AGE_NAMES[e.age]}.`, 'info', 6000);
        break;
      case 'research':
        if (e.player === pi && !TECHS[e.tech].isAge) { hud.message(`${TECHS[e.tech].name} researched.`, 'good', 4000); A.play('research'); }
        break;
      case 'trained':
        if (e.player === pi) { const pa = this.posAudio(e.unit.x, e.unit.y, 40); A.play(e.unit.isVillager ? 'trainedVil' : 'trained', pa || { vol: 0.4 }); }
        break;
      case 'built': {
        const b = e.building;
        if (e.player === pi && !b.def.isWall && !b.def.isFarm) { hud.message(`${b.def.name} completed.`, 'good', 3500); A.play('built'); }
        break;
      }
      case 'housed':
        if (e.player === pi && g.time - this.lastHoused > 25 && g.players[pi].popCap < 200) { this.lastHoused = g.time; hud.message('You need to build more houses!', 'alert', 5000); A.play('error'); }
        break;
      case 'destroyed': {
        const b = e.building;
        if (b.owner === pi && !e.silent && !b.def.isWall) hud.message(`Your ${b.def.name} was destroyed!`, 'alert', 5000);
        const pa = this.posAudio(b.x, b.y);
        if (pa && !e.silent && (b.owner === pi || this.visible(b.x, b.y))) A.play('collapse', pa);
        break;
      }
      case 'death': {
        const u = e.unit;
        if (!(u.owner === pi || this.visible(u.x, u.y))) break;
        const pa = this.posAudio(u.x, u.y);
        if (pa) A.play(u.def.classes.includes('cavalry') ? 'horseDeath' : u.def.isAnimal ? 'hit' : 'death', { ...pa, vol: pa.vol * 0.7 });
        break;
      }
      case 'melee': {
        if (!this.visible(e.x, e.y)) break;
        const pa = this.posAudio(e.x, e.y);
        if (!pa) break;
        const att = e.attacker;
        if (e.target.kind === 'building') A.play(att.def.classes.includes('ram') ? 'stone' : 'hammer', pa);
        else A.play(att.isVillager || att.def.isAnimal ? 'hit' : 'sword', { ...pa, vol: pa.vol * 0.75 });
        break;
      }
      case 'shoot': {
        if (!this.visible(e.x, e.y)) break;
        const pa = this.posAudio(e.x, e.y);
        if (pa && (e.kind === 'arrow' || e.kind === 'bolt' || e.kind === 'javelin' || e.kind === 'spear')) A.play('arrow', { ...pa, vol: pa.vol * 0.6 });
        break;
      }
      case 'impact': {
        if ((e.kind === 'stone' || e.kind === 'boulder') && this.visible(e.x, e.y)) { const pa = this.posAudio(e.x, e.y); if (pa) A.play('stone', pa); }
        break;
      }
      case 'converting': { if (this.visible(e.x, e.y)) { const pa = this.posAudio(e.x, e.y); if (pa) A.play('wololo', pa); } break; }
      case 'convert':
        if (e.to === pi) hud.message(`${e.unit.def.name} converted to your cause!`, 'good', 4000);
        else if (e.from === pi) hud.message(`Your ${e.unit.def.name} has been converted!`, 'alert', 5000);
        break;
      case 'captured':
        if (e.to === pi && this.visible(e.unit.x, e.unit.y)) { const pa = this.posAudio(e.unit.x, e.unit.y); if (pa) A.play('sheep', pa); }
        break;
      case 'defeat':
        hud.message(`${pname(e.player)} has ${e.resigned ? 'resigned' : 'been defeated'}.`, e.player === pi ? 'alert' : 'good', 8000);
        if (e.player === pi) setTimeout(() => this.showEnd(false), 1800);
        break;
      case 'wonderBuilt':
        hud.banner('Wonder Completed', `${pname(e.player)} must hold it for ${Math.round(g.opts.wonderTime / 60)} minutes to win`);
        A.play(e.player === pi ? 'age' : 'alarm');
        break;
      case 'wonderLost': hud.message(`${pname(e.player)}'s Wonder has been destroyed!`, e.player === pi ? 'alert' : 'good', 6000); break;
      case 'chat': if (e.player !== pi && g.players[pi].alive) hud.message(`${pname(e.player)}: ${e.text}`, 'chat', 8000); break;
      case 'bell':
        if (e.player === pi) { hud.message(e.on ? 'Town bell rung — villagers take shelter!' : 'All clear — back to work.', e.on ? 'alert' : 'good', 4000); A.play(e.on ? 'bell' : 'research'); }
        break;
      case 'gameOver':
        if (!this.endShown) {
          const win = e.winners.includes(pi) || (g.players[pi].team && e.winners.some((w) => g.isAlly(w, pi)));
          setTimeout(() => this.showEnd(win), 2200);
        }
        break;
    }
  }

  showEnd(victory) {
    if (this.endShown || this.mode !== 'game') return;
    this.endShown = true;
    const g = this.game;
    const reason = victory
      ? (g.players.some((p) => p.wonderStart !== null && p.index === this.viewer) ? 'Your Wonder stands eternal' : 'All enemies have been conquered')
      : 'Your civilization has fallen';
    this.audio.play(victory ? 'victory' : 'defeat');
    this.hud.showEnd(victory, reason);
  }

  hints() {
    if (!this.settings.hints || this.mode !== 'game') return;
    const g = this.game, p = g.players[this.viewer], hud = this.hud;
    const once = (key, cond, text, ttl = 11000) => { if (!this.hintsShown.has(key) && cond) { this.hintsShown.add(key); hud.message(text, 'info', ttl); } };
    once('start', g.time > 4, 'Tip: select a villager and right-click a sheep, berry bush or tree to gather. Drag a box to select several units.');
    once('scout', g.time > 45 && p.units.some((u) => u.type === 'scoutCavalry' && !u.order), 'Tip: send your Scout Cavalry (the horseman) to explore — it claims stray sheep and finds deer, gold and the enemy base.');
    once('tc', g.time > 30 && p.buildings.some((b) => b.type === 'townCenter' && b.alive && !b.queue.length), 'Tip: keep your Town Center busy — press H to select it, then Q to train a villager (Shift+Q queues 5).');
    once('house', p.popCap - p.pop <= 1 && p.popCap < 200 && g.time > 20, 'Tip: you are almost out of population space. Select a villager and press Q then Q to build a House.');
    once('camp', g.time > 200 && !p.buildings.some((b) => b.type === 'lumberCamp'), 'Tip: build a Lumber Camp beside a forest (villager: Q then E) so wood-cutters walk less.');
    once('feudal', p.age === 0 && p.res.food >= 500 && g.ageReqMet(p, 1), 'You can now advance to the Feudal Age! Select your Town Center and press T.', 12000);
    once('feudalReq', p.age === 0 && p.res.food >= 500 && !g.ageReqMet(p, 1), 'To reach the Feudal Age you need two of: Barracks, Mill, Lumber Camp, Mining Camp.', 12000);
    once('castle', p.age === 1 && p.res.food >= 800 && p.res.gold >= 200, 'Advance to the Castle Age at your Town Center (needs two of: Archery Range, Stable, Blacksmith, Market).', 12000);
    once('farm', g.time > 420 && p.age >= 0 && !p.buildings.some((b) => b.def.isFarm) && !g.findResourceNear(this.viewer, ['sheep', 'hunt', 'berries'], p.start.cx, p.start.cy, 14), 'Natural food is running out — build Farms (villager: Q then T) around your Town Center or a Mill.');
  }

  // ---------------------------------------------------------------- main loop
  frame(now) {
    try { this.tick(now); }
    catch (e) { if ((this.frameErrors = (this.frameErrors || 0) + 1) < 5) console.error('frame error', e); }
    finally { requestAnimationFrame(this.frame); }
  }

  tick(now) {
    const dtReal = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const g = this.game;
    if (g && this.renderer) {
      const running = this.mode === 'menu' || (!this.paused && !this.menuOpen);
      if (running) {
        this.acc += dtReal * this.speed;
        let steps = 0;
        while (this.acc >= DT && steps < 10) { g.step(DT); this.acc -= DT; steps++; }
        if (steps >= 10) this.acc = 0;
      }
      this.processEvents();
      if (this.mode === 'menu') this.updateAttract(dtReal);
      if (this.ctl && !this.menuOpen) this.ctl.update(dtReal);
      this.renderer.render(running ? Math.min(1, this.acc / DT) : 1, dtReal);
      if (this.renderer.workSounds) this.playWorkSounds();
      if (this.minimap && now - this.lastMini > 120) { this.lastMini = now; this.minimap.draw(); }
      if (this.hud && now - this.lastHud > 110) { this.lastHud = now; this.hud.update(); }
      if (this.mode === 'game' && (!this.lastHint || now - this.lastHint > 1000)) { this.lastHint = now; this.hints(); }
    }
  }

  playWorkSounds() {
    if (this.mode !== 'game') { this.renderer.workSounds.length = 0; return; }
    for (const s of this.renderer.workSounds) {
      const pa = this.posAudio(s.x, s.y, 16);
      if (pa) this.audio.play(s.name, { ...pa, vol: pa.vol * 0.55 });
    }
    this.renderer.workSounds.length = 0;
  }
}

window.app = new App();
void UNITS; void BUILDINGS;
