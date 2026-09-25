// ===== Boot & main loop =====
'use strict';
const SIM_DT = 0.05;
let lastFrame = performance.now(), simAcc = 0, uiAcc = 0, mmAcc = 0, fpsS = 60;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.1, (now - lastFrame) / 1000); lastFrame = now;
  fpsS = fpsS * 0.95 + (1 / Math.max(0.001, dt)) * 0.05;
  if (Editor.active && W) { Editor.frame(dt); mmAcc += dt; if (mmAcc > 0.5) { mmAcc = 0; renderMinimap($('#minimap'), true); } return; }
  if (!UI.gameRunning || !W) { menuBackdrop(dt); return; }
  const paused = UI.paused || !$('#modal').classList.contains('hidden') && !W.over;
  $('#pausebanner').classList.toggle('hidden', !UI.paused);
  if (!paused && !W.over) {
    simAcc += dt * (W.speed || 1);
    let steps = 0;
    while (simAcc >= SIM_DT && steps < 8) { worldTick(SIM_DT); simAcc -= SIM_DT; steps++; }
    if (steps >= 8) simAcc = 0;
    R.time += dt * (W.speed || 1);
  } else if (W.over) { worldTick(SIM_DT * 0.5); R.time += dt; }
  scrollCamera(dt);
  UI.hover = UI.mouse.inCanvas ? hitTest(UI.mouse.x, UI.mouse.y) : null;
  renderWorld(R.ctx, { selection: new Set(UI.selection), hover: UI.hover });
  drawOverlays(R.ctx);
  uiAcc += dt; mmAcc += dt;
  if (uiAcc > 0.25) {
    uiAcc = 0;
    UI.selection = UI.selection.filter(e => !e.dead && !(e.kind === 'unit' && (e.inside || e.dying)));
    updateTopbar(); renderCommands(); renderSelInfo();
    // ambient waves depend on how much water is on screen
    const c = screenToTile(R.cw / 2, R.ch / 2); let w = 0, n = 0; for (let dy = -8; dy <= 8; dy += 4) for (let dx = -8; dx <= 8; dx += 4) { n++; if (W.map.isWater((c.x + dx) | 0, (c.y + dy) | 0)) w++; }
    Sound.updateAmbient(w / n);
  }
  if (mmAcc > 0.4) { mmAcc = 0; renderMinimap($('#minimap')); }
}
// animated backdrop behind the main menu: a small generated village scene
let backdrop = null;
function menuBackdrop(dt) {
  if (!backdrop) {
    const spec = generateMapSpec({ size: 'tiny', seed: 4242, mapType: 'coastal', numPlayers: 2 });
    createWorld(spec, { players: [{ name: 'A', civ: 'franks', color: PLAYER_COLORS[0], human: true }, { name: 'B', civ: 'teutons', color: PLAYER_COLORS[1] }], seed: 4242, fog: 'none', startRes: 'high', startAge: 2 });
    backdrop = W; W.menu = true;
    const tc = W.list.find(e => e.type === 'tc' && e.owner === 1);
    const p = W.players[1];
    for (const [t, dx, dy] of [['house', -4, -3], ['house', 5, -2], ['mill', -5, 3], ['barracks', 5, 3], ['blacksmith', 1, -6], ['monastery', -1, 6]]) { const x = tc.x + dx, y = tc.y + dy; if (!canPlace(p, t, x, y, true)) spawnBuilding(t, 1, x, y, true); }
    p.ai = new AIPlayer(p, 'standard'); W.players[2].ai = new AIPlayer(W.players[2], 'standard');
    centerCamOn(tc.x + 2, tc.y + 2); R.cam.zoom = 1.1;
  }
  if (W !== backdrop) { if (UI.gameRunning) return; W = backdrop; }
  worldTick(Math.min(dt, 0.05)); R.time += dt;
  R.cam.x += dt * 6;
  renderWorld(R.ctx, { editor: true });
}
window.addEventListener('load', () => {
  renderInit($('#game'));
  resize();
  initMenus(); initHUD(); initInput();
  showScreen('menu');
  requestAnimationFrame(frame);
  // debugging / automated test hook
  window.__game = { get W() { return W; }, UI, Sound, Editor, startGame, launchFromSetup, runCheat, R };
});
