// ============================================================
// main.js — 시작점 (게임 루프, 자동 저장, 오프라인)
// ============================================================

var lastSaveTime = 0;
var lastFrame = Date.now();

function gameLoop() {
  var now = Date.now();
  var dt = (now - lastFrame) / 1000;
  lastFrame = now;
  if (dt <= 0) return;

  // 개발자 모드 배속
  dt *= state.settings.gameSpeed || 1;

  // 탭이 오래 백그라운드였다면 잘게 나눠 처리 (연쇄 생산 정확도)
  if (dt > 10) simulateOffline(dt);
  else tick(dt);

  state.lastTick = now;
}

function uiLoop() {
  updateUI();
}

function autoSave() {
  if (!state.settings.autosave) return;
  saveGame();
  lastSaveTime = Date.now();
}

function init() {
  // 저장 불러오기 + 오프라인 진행
  var beforeE = D(0);
  var raw = localStorage.getItem(SAVE_KEY);
  if (raw) {
    try { beforeE = D(JSON.parse(decodeURIComponent(escape(atob(raw)))).entropy || 0); }
    catch (e) { /* 무시 */ }
  }
  var offlineSec = loadGame();

  initUI();
  updateUI();

  if (offlineSec > 60) {
    showOfflineToast(offlineSec, state.entropy.sub(beforeE).max(0));
  }

  lastFrame = Date.now();
  setInterval(gameLoop, 1000 * SYSTEM.tickSeconds);  // 초당 20틱
  setInterval(uiLoop, 100);                          // 화면 갱신 초당 10회
  setInterval(autoSave, SYSTEM.autosaveSeconds * 1000);

  window.addEventListener("beforeunload", saveGame);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") saveGame();
  });
}

window.addEventListener("DOMContentLoaded", init);
