// Boot, screens, main loop, event dispatch.
import { Game } from './game.js';
import { Renderer } from './render.js';
import { UI } from './ui.js';
import { AI } from './ai.js';
import { Audio } from './audio.js';
import { AGE_NAMES } from './config.js';
import { fmtTime } from './util.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const audio = new Audio();
const STEP = 1 / 30;

let game = null, renderer = null, ui = null;
let state = 'title';
let paused = false, menuOpen = false, watching = false;
let speed = 1.5, acc = 0, last = performance.now();
let opts = { difficulty: 'standard', speed: 1.5, seed: randSeed() };
const titleCam = { t: 0 };

function randSeed() { return Math.floor(Math.random() * 900000) + 100000; }

// ---------------- screens ----------------
function show(id, on = true) { $(id).classList.toggle('hidden', !on); }
function seg(id, cb) {
  const el = $(id);
  el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    el.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
    audio.init(); audio.play('click');
    cb(b.dataset.v);
  }));
}
seg('opt-diff', (v) => { opts.difficulty = v; });
seg('opt-speed', (v) => { opts.speed = +v; });
seg('opt-music', (v) => { audio.setMusic(v === '1'); });
$('opt-sfx').addEventListener('input', (e) => audio.setSfxVol(+e.target.value));
$('opt-seed').value = opts.seed;
$('btn-reseed').addEventListener('click', () => { opts.seed = randSeed(); $('opt-seed').value = opts.seed; titleBackdrop(opts.seed); });
$('opt-seed').addEventListener('change', (e) => { const v = parseInt(e.target.value, 10); if (v > 0) { opts.seed = v; titleBackdrop(v); } });
$('btn-start').addEventListener('click', () => { audio.init(); startGame(); });
$('btn-howto').addEventListener('click', () => { show('howto'); });
$('btn-howto-close').addEventListener('click', () => { show('howto', false); });
$('m-resume').addEventListener('click', () => closeMenu());
$('m-howto').addEventListener('click', () => show('howto'));
$('m-quit').addEventListener('click', () => { closeMenu(); toTitle(); });
$('m-resign').addEventListener('click', () => {
  if (!game || game.winner >= 0) return;
  game.players[game.human].alive = false;
  closeMenu();
  game.checkVictory();
});
$('e-again').addEventListener('click', () => { show('end', false); opts.seed = randSeed(); $('opt-seed').value = opts.seed; startGame(); });
$('e-watch').addEventListener('click', () => { show('end', false); watching = true; game.revealAll = true; game.frozen = false; });
$('e-title').addEventListener('click', () => { show('end', false); toTitle(); });

function openMenu() { if (state !== 'game') return; menuOpen = true; show('menu'); }
function closeMenu() { menuOpen = false; show('menu', false); }

const hooks = {
  togglePause: () => { paused = !paused; show('paused', paused); },
  openMenu: () => (menuOpen ? closeMenu() : openMenu()),
  cycleSpeed: () => {
    const s = [1, 1.5, 2, 3];
    speed = s[(s.indexOf(speed) + 1) % s.length];
    $('btn-speed').textContent = speed + '×';
  },
  inGame: () => state === 'game',
  menuOpen: () => menuOpen || !$('howto').classList.contains('hidden'),
  paused: () => paused,
  watching: () => watching,
};

function titleBackdrop(seed) {
  game = new Game({ seed, difficulty: 'standard' });
  game.revealAll = true;
  game.updateFog();
  renderer = new Renderer(canvas, game);
  renderer.hudBottom = 0; renderer.hudTop = 0;
  renderer.cam.zoom = 1.0;
  const s = game.map.starts[0];
  renderer.centerOn(s.x, s.y);
  titleCam.x = renderer.cam.x; titleCam.y = renderer.cam.y; titleCam.t = 0;
}

function toTitle() {
  if (ui) ui.unbind();
  ui = null;
  state = 'title';
  paused = false; watching = false;
  show('paused', false);
  show('hud', false);
  show('title');
  titleBackdrop(opts.seed);
}

function startGame() {
  show('title', false);
  show('loading');
  setTimeout(() => {
    if (ui) ui.unbind();
    game = new Game({ seed: opts.seed, difficulty: opts.difficulty });
    game.ai = new AI(game, 1, opts.difficulty);
    renderer = new Renderer(canvas, game);
    ui = new UI(game, renderer, audio, hooks);
    const tc = game.buildings.find((b) => b.owner === game.human && b.type === 'towncenter');
    renderer.centerOn(tc.x, tc.y + 1);
    // pre-build nearby terrain chunks
    renderer.render(0, ui);
    speed = opts.speed;
    $('btn-speed').textContent = speed + '×';
    paused = false; menuOpen = false; watching = false;
    show('paused', false);
    state = 'game';
    show('loading', false);
    show('hud');
    ui.addMsg(`${AGE_NAMES[0]} — build up your economy!`, 'age');
    ui.addMsg('Tip: select your villagers and right-click trees, berries or sheep to gather.', 'info');
    ui.selected.add(tc);
    ui.refreshCmds(true);
  }, 30);
}

// ---------------- events ----------------
function processEvents(realDt) {
  const g = game;
  for (const ev of g.events) {
    switch (ev.type) {
      case 'sfx': {
        if (ev.ui) { audio.play(ev.name); break; }
        if (!ui) break;
        if (!g.tileVisible(ev.x, ev.y)) break;
        const [sx, sy] = renderer.w2s(ev.x, ev.y);
        if (sx < -100 || sx > renderer.W + 100 || sy < -100 || sy > renderer.H + 100) break;
        const vol = 0.35 + 0.65 * Math.min(1, renderer.cam.zoom);
        audio.play(ev.name, vol, (sx / renderer.W - 0.5) * 1.4);
        break;
      }
      case 'fx': {
        const [sx, sy] = renderer.w2s(ev.x, ev.y);
        if (sx < -200 || sx > renderer.W + 200 || sy < -200 || sy > renderer.H + 200) break;
        renderer.spawnFx(ev);
        break;
      }
      case 'msg':
        if (ui) {
          ui.addMsg(ev.text, ev.kind);
          if (ev.kind === 'alert' && ev.x !== undefined) ui.lastAlert = { x: ev.x, y: ev.y };
        }
        break;
      case 'ping':
        renderer.pings.push({ x: ev.x, y: ev.y, t: 0 });
        if (ui) ui.lastAlert = { x: ev.x, y: ev.y };
        break;
      case 'ageup': {
        const b = $('age-banner');
        b.textContent = AGE_NAMES[ev.age];
        b.classList.remove('hidden');
        b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
        setTimeout(() => b.classList.add('hidden'), 4000);
        for (const tc of g.buildings) if (tc.owner === g.human && tc.type === 'towncenter') renderer.spawnFx({ name: 'sparkle', x: tc.x, y: tc.y });
        break;
      }
      case 'gameover':
        if (state === 'game') setTimeout(() => showEnd(ev.winner), 2200);
        break;
    }
  }
  g.events.length = 0;
}

function showEnd(winner) {
  const g = game;
  const won = winner === g.human;
  audio.play(won ? 'victory' : 'defeat');
  $('end-title').textContent = won ? 'Victory!' : 'Defeat';
  $('end-title').className = won ? '' : 'defeat';
  $('end-sub').textContent = won ? `You conquered the enemy in ${fmtTime(g.time)}.` : `Your realm has fallen after ${fmtTime(g.time)}.`;
  const [a, b] = g.players;
  const row = (label, f) => `<tr><td>${label}</td><td>${f(a)}</td><td>${f(b)}</td></tr>`;
  const sum = (p) => Math.floor(Object.values(p.stats.gathered).reduce((s, v) => s + v, 0));
  $('end-stats').innerHTML = `<tr><th></th><th style="color:${a.color.light}">${a.name}</th><th style="color:${b.color.light}">${b.name}</th></tr>` +
    row('Age reached', (p) => AGE_NAMES[p.age]) +
    row('Units trained', (p) => p.stats.trained) +
    row('Enemy units killed', (p) => p.stats.kills) +
    row('Units lost', (p) => p.stats.lost) +
    row('Buildings constructed', (p) => p.stats.built) +
    row('Enemy buildings razed', (p) => p.stats.razed) +
    row('Technologies researched', (p) => p.stats.techs) +
    row('Food / Wood gathered', (p) => `${Math.floor(p.stats.gathered.food)} / ${Math.floor(p.stats.gathered.wood)}`) +
    row('Gold / Stone gathered', (p) => `${Math.floor(p.stats.gathered.gold)} / ${Math.floor(p.stats.gathered.stone)}`) +
    row('Total resources', sum);
  show('end');
}

// ---------------- loop ----------------
function frame(ts) {
  const realDt = Math.min(0.1, (ts - last) / 1000);
  last = ts;
  try {
    if (state === 'game' && game) {
      if (!paused && !menuOpen) {
        acc += realDt * speed;
        let steps = 0;
        while (acc >= STEP && steps < 10) { game.update(STEP); acc -= STEP; steps++; }
        if (steps >= 10) acc = 0;
      }
      processEvents(realDt);
      ui.update(realDt, realDt);
      renderer.render(paused || menuOpen ? 0 : realDt * Math.min(speed, 2), ui);
      audio.updateMusic(realDt);
    } else if (state === 'title' && game) {
      titleCam.t += realDt;
      renderer.cam.x = titleCam.x + Math.sin(titleCam.t * 0.05) * 600;
      renderer.cam.y = titleCam.y - Math.sin(titleCam.t * 0.035) * 250;
      game.update(realDt);
      game.events.length = 0;
      renderer.render(realDt, { selected: new Set(), markers: [], placing: null });
    }
  } catch (err) {
    console.error(err);
    window.__lastError = String(err && err.stack || err);
  }
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => { if (renderer) renderer.resize(); });
window.__aok = { get game() { return game; }, get ui() { return ui; }, get renderer() { return renderer; }, startGame, setOpt: (k, v) => { opts[k] = v; } };

toTitle();
requestAnimationFrame(frame);
