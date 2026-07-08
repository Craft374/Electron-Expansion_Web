// ============================================================
// save.js — 저장 / 불러오기 / 오프라인 진행
// ============================================================

var SAVE_KEY = "electronExpansionSave_v2";
var isResetting = false;   // 리셋 직후 자동 저장이 덮어쓰는 것 방지

function saveToString() {
  var s = state;
  var obj = {
    version: 3,
    entropy: s.entropy.toString(),
    totalEntropy: s.totalEntropy.toString(),
    particles: {
      electron: s.particles.electron.toString(),
      proton: s.particles.proton.toString(),
      neutron: s.particles.neutron.toString()
    },
    genLevels: s.genLevels,
    convLevels: s.convLevels,
    convOn: s.convOn,
    elements: s.elements.map(function (e) { return e.toString(); }),
    researched: s.researched,
    fusionLevels: s.fusionLevels,
    tracks: s.tracks,
    special: s.special,
    isotopes: s.isotopes,
    autoFusion: s.autoFusion,
    autoUp: s.autoUp,
    achievements: s.achievements,
    achRows: s.achRows,
    compression: {
      cp: s.compression.cp.toString(),
      totalCp: s.compression.totalCp.toString(),
      resets: s.compression.resets,
      up: s.compression.up
    },
    sacrifice: { mult: s.sacrifice.mult.toString(), recovery: s.sacrifice.recovery },
    autos: s.autos,
    star: s.star,
    planets: s.planets,
    planetResearched: s.planetResearched,
    solarSystem: s.solarSystem,
    settings: s.settings,
    playtime: s.playtime,
    lastTick: Date.now()
  };
  return btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
}

function loadFromString(str) {
  var obj = JSON.parse(decodeURIComponent(escape(atob(str))));
  var s = freshState();

  if (obj.entropy) s.entropy = D(obj.entropy);
  if (obj.totalEntropy) s.totalEntropy = D(obj.totalEntropy);
  if (obj.particles) {
    ["electron", "proton", "neutron"].forEach(function (k) {
      if (obj.particles[k]) s.particles[k] = D(obj.particles[k]);
    });
  }
  if (obj.genLevels) Object.assign(s.genLevels, obj.genLevels);
  if (obj.convLevels) Object.assign(s.convLevels, obj.convLevels);
  if (obj.convOn) Object.assign(s.convOn, obj.convOn);
  if (obj.elements) {
    obj.elements.forEach(function (v, i) { if (i < s.elements.length) s.elements[i] = D(v); });
  }
  if (typeof obj.researched === "number") s.researched = obj.researched;
  if (obj.fusionLevels) {
    obj.fusionLevels.forEach(function (v, i) {
      if (i < s.fusionLevels.length && typeof v === "number") s.fusionLevels[i] = v;
    });
  }
  if (obj.tracks) Object.assign(s.tracks, obj.tracks);
  if (obj.special) s.special = obj.special;
  if (obj.isotopes) s.isotopes = obj.isotopes;
  if (typeof obj.autoFusion === "boolean") s.autoFusion = obj.autoFusion;
  if (obj.autoUp) Object.assign(s.autoUp, obj.autoUp);
  if (obj.achievements) s.achievements = obj.achievements;
  if (obj.achRows) s.achRows = obj.achRows;
  if (obj.compression) {
    if (obj.compression.cp) s.compression.cp = D(obj.compression.cp);
    if (obj.compression.totalCp) s.compression.totalCp = D(obj.compression.totalCp);
    if (typeof obj.compression.resets === "number") s.compression.resets = obj.compression.resets;
    if (obj.compression.up) Object.assign(s.compression.up, obj.compression.up);
  }
  if (obj.sacrifice) {
    if (obj.sacrifice.mult) s.sacrifice.mult = D(obj.sacrifice.mult);
    if (typeof obj.sacrifice.recovery === "number") s.sacrifice.recovery = obj.sacrifice.recovery;
  }
  if (obj.autos) {
    for (var ak in obj.autos) {
      if (s.autos[ak]) Object.assign(s.autos[ak], obj.autos[ak]);
    }
  }
  if (obj.star) s.star = obj.star;
  if (obj.planets) {
    s.planets.random = obj.planets.random || [];
    s.planets.custom = obj.planets.custom || [];
    s.planets.special = obj.planets.special || {};
    s.planets.blueprints = obj.planets.blueprints || {};
    s.planets.solar = obj.planets.solar || {};
  }
  if (typeof obj.planetResearched === "boolean") s.planetResearched = obj.planetResearched;
  if (typeof obj.solarSystem === "boolean") s.solarSystem = obj.solarSystem;
  if (obj.settings) Object.assign(s.settings, obj.settings);
  if (typeof obj.playtime === "number") s.playtime = obj.playtime;
  if (typeof obj.lastTick === "number") s.lastTick = obj.lastTick;

  state = s;
}

function saveGame() {
  if (isResetting) return;
  try { localStorage.setItem(SAVE_KEY, saveToString()); }
  catch (e) { console.error("저장 실패:", e); }
}

function loadGame() {
  var str = localStorage.getItem(SAVE_KEY);
  if (!str) return 0;
  try { loadFromString(str); }
  catch (e) { console.error("불러오기 실패:", e); return 0; }

  // 이미 만족한 도전과제는 토스트 없이 표시 (기존 저장 마이그레이션)
  achSilent = true;
  checkAchievements();
  achSilent = false;

  var offlineSec = (Date.now() - state.lastTick) / 1000;
  var maxSec = offlineMaxTicks() * SYSTEM.tickSeconds;
  if (offlineSec > 5) {
    var applied = Math.min(offlineSec, maxSec);
    simulateOffline(applied);
    return applied;
  }
  return 0;
}

function exportSave() {
  var str = saveToString();
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(str);
  window.prompt("백업 코드 (클립보드에 복사됨):", str);
}

function importSave() {
  var str = window.prompt("백업 코드를 붙여넣으세요:");
  if (!str) return;
  try {
    loadFromString(str.trim());
    saveGame();
    location.reload();
  } catch (e) {
    alert("잘못된 백업 코드입니다.");
  }
}

function hardReset() {
  if (!confirm("정말 처음부터 다시 시작할까요? 모든 진행이 사라집니다.")) return;
  if (!confirm("마지막 확인입니다. 정말 초기화할까요?")) return;
  isResetting = true;                    // 이후의 어떤 자동 저장도 무시
  localStorage.removeItem(SAVE_KEY);
  location.reload();
}
