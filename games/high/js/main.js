'use strict';
// ---------- Game setup & main loop ----------
const MENU = { civ: 'britons', diff: 'normal', map: 'arabia' };

function newGame(opts) {
  const seed = opts.seed || Math.floor(Math.random() * 1e9);
  G = {
    time: 0, speedIdx: 1, paused: false, over: false, menu: null, demo: !!opts.demo, nextId: 1, byId: new Map(),
    units: [], buildings: [], resources: [], proj: [], fx: [], decals: [], sel: [], groups: {}, carcassOf: {}, mmPings: [], resFlash: {},
    stats: { reseeds: 0 }, fogT: 0, checkT: 1, cam: { x: 0, y: 0, zoom: 1 }, revealAll: !!opts.demo, opts, aiOf: {}, wonder: null,
  };
  const gen = generateMap(opts.map, seed);
  const N = gen.N;
  G.map = { N, terrain: gen.terrain, water: new Uint8Array(N * N), pass: new Uint8Array(N * N), tileEnt: new Int32Array(N * N), tileFarm: new Int32Array(N * N) };
  for (let k = 0; k < N * N; k++) { const w = gen.terrain[k] === T_WATER || gen.terrain[k] === T_SHALLOW; G.map.water[k] = w ? 1 : 0; G.map.pass[k] = w ? 0 : 1; }
  Path.init(N);
  G.fog = { vis: new Uint8Array(N * N), explored: new Uint8Array(N * N) };

  const civKeys = Object.keys(CIVS);
  const aiCiv = pick(civKeys.filter(c => c !== opts.civ));
  G.players = [createPlayer(0, 'britons', false), createPlayer(1, opts.civ, !!opts.demo), createPlayer(2, aiCiv, true)];

  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, pl = gen.plan[k];
    if (pl === P_TREE) { addResource('tree', i, j); G.map.terrain[k] = T_FOREST; }
    else if (pl === P_GOLD) addResource('gold', i, j);
    else if (pl === P_STONE) addResource('stone', i, j);
    else if (pl === P_BERRY) addResource('berries', i, j);
  }
  renderTerrainTexture(G.map);

  const tc1 = createBuilding('town_center', 1, gen.s1.x, gen.s1.y, true);
  const tc2 = createBuilding('town_center', 2, gen.s2.x, gen.s2.y, true);
  // starting units (mirrored)
  const startOffsets = [[4.6, 1.2], [4.6, 2.4], [1.4, 4.6]];
  for (const [ox, oy] of startOffsets) {
    spawnUnit('villager', 1, gen.s1.x + ox, gen.s1.y + oy);
    spawnUnit('villager', 2, gen.s2.x + oy, gen.s2.y + ox);
  }
  spawnUnit('scout', 1, gen.s1.x + 2.6, gen.s1.y + 4.8);
  spawnUnit('scout', 2, gen.s2.x + 4.8, gen.s2.y + 2.6);
  for (const a of gen.animals) {
    if (a.own) { spawnUnit('sheep', 1, a.x, a.y); spawnUnit('sheep', 2, a.y, a.x); }
    else { spawnUnit(a.type, 0, a.x, a.y); spawnUnit(a.type, 0, a.y, a.x); }
  }
  G.aiOf[2] = new AI(2, opts.diff);
  if (opts.demo) G.aiOf[1] = new AI(1, 'hard');
  initFogCanvas();
  updateFog(); refreshFogCanvas();
  updatePlayers(0);
  centerOn(tc1.x, tc1.y);
  if (opts.demo) { G.cam.zoom = 0.8; centerOn((tc1.x + tc2.x) / 2, (tc1.y + tc2.y) / 2); G.speedIdx = 2; }
  UI.cmdSig = ''; UI.infoSig = ''; UI.place = null; UI.amove = false;
  $('messages').innerHTML = '';
  if (!opts.demo) {
    G.sel = [tc1.id];
    refreshPanels(true);
    setTimeout(() => bigMessage(AGE_NAMES[0], 'Build your economy — ' + CIVS[opts.civ].name + ' vs ' + CIVS[aiCiv].name), 300);
    notify('Tip: select villagers and right-click trees, berries or sheep to gather. Build houses to grow your population.', 'info');
  }
}

function endGame(win, how) {
  G.over = true;
  if (G.demo) { setTimeout(() => { if (G && G.demo) startDemo(); }, 4000); return; }
  Sound.play(win ? 'victory' : 'defeat');
  $('end-title').textContent = win ? 'Victory!' : 'Defeat';
  $('end-title').style.color = win ? '' : '#e0503c';
  $('end-sub').textContent = win ? (how === 'wonder' ? 'Your Wonder has stood the test of time.' : 'The enemy has been vanquished.') : (how === 'wonder' ? 'The enemy Wonder stands triumphant.' : 'Your civilization has fallen.');
  const a = PL(1), b = PL(2);
  const row = (label, x, y) => `<tr><td>${label}</td><td>${x}</td><td>${y}</td></tr>`;
  $('end-stats').innerHTML = `<tr><th></th><th style="color:${PCOL[1].light}">You (${CIVS[a.civ].name})</th><th style="color:${PCOL[2].light}">Enemy (${CIVS[b.civ].name})</th></tr>` +
    row('Units trained', a.stats.trained, b.stats.trained) + row('Enemies killed', a.stats.killed, b.stats.killed) + row('Units lost', a.stats.lost, b.stats.lost) +
    row('Buildings razed', a.stats.razed, b.stats.razed) + row('Buildings constructed', a.stats.built, b.stats.built) +
    RES.map(r => row(r[0].toUpperCase() + r.slice(1) + ' gathered', a.stats.gathered[r], b.stats.gathered[r])).join('') +
    row('Technologies', a.stats.techs, b.stats.techs) + row('Age reached', AGE_NAMES[a.age], AGE_NAMES[b.age]) + row('Game time', fmtTime(G.time), '');
  setTimeout(() => { G.menu = 'end'; $('endscreen').classList.remove('hidden'); }, 1800);
}

function demoCamera(rdt) {
  G.demoT = (G.demoT || 0) - rdt;
  if (G.demoT <= 0 || !G.demoFocus) {
    G.demoT = 16;
    const fighters = G.units.filter(u => u.owner > 0 && u.order && (u.order.type === 'attack' || (u.order.type === 'amove' && u.order.sub)));
    const cands = G.buildings.filter(b => b.owner > 0 && (b.type === 'town_center' || b.type === 'castle' || b.type === 'market' || b.type === 'mill' || b.type === 'barracks'));
    const t = fighters.length > 3 && Math.random() < 0.6 ? fighters[Math.floor(Math.random() * fighters.length)] : cands[Math.floor(Math.random() * cands.length)];
    if (t) G.demoFocus = { x: isoX(t.x, t.y) + rrange(-120, 120), y: isoY(t.x, t.y) + rrange(-60, 60) };
  }
  if (G.demoFocus) {
    const k = Math.min(1, rdt * 0.35);
    G.cam.x += (G.demoFocus.x - G.cam.x) * k; G.cam.y += (G.demoFocus.y - G.cam.y) * k;
    G.demoFocus.x += 6 * rdt; clampCam();
  }
}
function startDemo() {
  newGame({ civ: 'franks', diff: 'hard', map: pick(['arabia', 'lakes', 'forest']), demo: true });
}
function showHUD(on) { for (const id of ['topbar', 'bottom']) $(id).classList.toggle('hidden', !on); }

function startGame() {
  $('mainmenu').classList.add('hidden'); $('loading').classList.remove('hidden');
  Sound.init(); Sound.resume(); Sound.enabled = true;
  setTimeout(() => {
    newGame({ civ: MENU.civ, diff: MENU.diff, map: MENU.map });
    $('loading').classList.add('hidden'); showHUD(true);
  }, 30);
}
function toMainMenu() {
  for (const id of ['pausemenu', 'endscreen', 'helpscreen']) $(id).classList.add('hidden');
  showHUD(false); $('mainmenu').classList.remove('hidden'); $('wonder-timer').classList.add('hidden');
  Sound.enabled = false;
  startDemo();
  G.menu = null;
}

function setupMenus() {
  const civBox = $('opt-civ');
  civBox.innerHTML = Object.keys(CIVS).map(k => `<button data-v="${k}" class="${k === MENU.civ ? 'sel' : ''}">${CIVS[k].name}</button>`).join('');
  const updDesc = () => { $('civ-desc').textContent = CIVS[MENU.civ].desc; };
  updDesc();
  const bindOpts = (id, key, cb) => $(id).addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    MENU[key] = b.dataset.v; $(id).querySelectorAll('button').forEach(x => x.classList.toggle('sel', x === b)); if (cb) cb();
  });
  bindOpts('opt-civ', 'civ', updDesc); bindOpts('opt-diff', 'diff'); bindOpts('opt-map', 'map');
  $('start-btn').addEventListener('click', startGame);
  $('help-btn').addEventListener('click', () => { $('helpscreen').classList.remove('hidden'); });
  $('help-btn2').addEventListener('click', () => { $('helpscreen').classList.remove('hidden'); });
  $('help-close').addEventListener('click', () => { $('helpscreen').classList.add('hidden'); });
  $('resume-btn').addEventListener('click', closePause);
  $('restart-btn').addEventListener('click', () => { $('pausemenu').classList.add('hidden'); G.menu = null; $('loading').classList.remove('hidden'); setTimeout(() => { newGame({ civ: MENU.civ, diff: MENU.diff, map: MENU.map }); $('loading').classList.add('hidden'); }, 30); });
  $('quit-btn').addEventListener('click', toMainMenu);
  $('end-menu').addEventListener('click', toMainMenu);
  $('end-continue').addEventListener('click', () => { $('endscreen').classList.add('hidden'); G.menu = null; });
}

let lastFrame = performance.now(), uiTimer = 0, fps = 60;
function frame(now) {
  const rdt = Math.min(0.1, (now - lastFrame) / 1000); lastFrame = now;
  fps = fps * 0.95 + (1 / Math.max(0.001, rdt)) * 0.05;
  if (G) {
    try {
      if (!G.menu && !G.paused) {
        let dt = rdt * GAME_SPEEDS[G.speedIdx].f;
        while (dt > 1e-6) { const s = Math.min(dt, 0.05); simulate(s); dt -= s; }
      }
      if (G.fogDirty) { refreshFogCanvas(); G.fogDirty = false; }
      if (!G.demo) { updateCamera(rdt); updateHover(); }
      else demoCamera(rdt);
      render(now);
      uiTimer -= rdt;
      if (uiTimer <= 0 && !G.demo) { uiTimer = 0.15; refreshPanels(); updateTopBar(); }
    } catch (e) { console.error(e); if (!window.__err) window.__err = String(e.stack || e); }
  }
  requestAnimationFrame(frame);
}

window.addEventListener('load', () => {
  makeTrees(); makeResourceSprites();
  initRender(); initUI(); setupMenus();
  Sound.enabled = false;
  startDemo();
  requestAnimationFrame(frame);
});
