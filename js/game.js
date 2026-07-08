// ============================================================
// game.js — 게임 규칙 (DOM을 건드리지 않는 순수 로직)
// ============================================================

function freshState() {
  return {
    entropy: D(0),
    totalEntropy: D(0),
    particles: { electron: D(0), proton: D(0), neutron: D(0) },
    genLevels: { electron: 0, proton: 0, neutron: 0 },
    convLevels: { electron: 0, proton: 0, neutron: 0 },   // 변환기 (0 = 미보유)
    convOn: { electron: true, proton: true, neutron: true },
    elements: ELEMENTS.map(function () { return D(0); }),
    researched: 0,
    fusionLevels: ELEMENTS.map(function () { return 0; }),
    tracks: { condense: 0, hflux: 0, accel: 0 },          // 업그레이드 트랙
    special: {},                                           // 특수 연구 (1회성)
    isotopes: {},
    autoFusion: false,
    autoUp: { unlocked: false, level: 0, on: true, timer: 0 },  // (구버전 호환용, 미사용)
    achievements: {},
    achRows: {},
    compression: { cp: D(0), totalCp: D(0), resets: 0, up: { particle: 0, conv: 0, self: 0, start: 0 } },
    compounds: {},
    sacrifice: { mult: D(1), recovery: 1 },
    autos: (function () {
      var o = {};
      AUTO_TARGETS.forEach(function (t) { o[t.key] = { on: false, level: 0, timer: 0 }; });
      return o;
    })(),
    star: null,
    planets: { random: [], custom: [], special: {}, blueprints: {}, solar: {} },
    planetResearched: false,
    solarSystem: false,
    settings: {
      notation: "sci",
      offlineMaxTicks: SYSTEM.offlineMaxTicks,
      autosave: true,
      devMode: false,
      gameSpeed: 1,
      sideRes: { entropy: true, electron: false, proton: false, neutron: false, element: false }
    },
    playtime: 0,
    lastTick: Date.now()
  };
}

var state = freshState();

// ============================================================
// 생산 배율
// ============================================================

function fusionMult(n) {
  return Decimal.pow(FUSION.effect, state.fusionLevels[n - 1]);
}

function fusionTotalLevel() {
  var t = 0;
  for (var i = 0; i < state.fusionLevels.length; i++) t += state.fusionLevels[i];
  return t;
}

function fusionNextTarget() {
  var best = -1;
  for (var i = 0; i < state.researched; i++) {
    if (state.fusionLevels[i] >= FUSION.capPerElement) continue;
    if (best === -1 || state.fusionLevels[i] < state.fusionLevels[best]) best = i;
  }
  return best;
}

function isGasElement(n) { return GAS_SET.indexOf(n) >= 0; }

// ============================================================
// 도전과제 · 희생 배율
// ============================================================

function achDone(id) { return !!state.achievements[id]; }

function achRowDone(row) {
  for (var i = 0; i < ACHIEVEMENTS.length; i++) {
    if (ACHIEVEMENTS[i].row === row && !state.achievements[ACHIEVEMENTS[i].id]) return false;
  }
  return true;
}

// 입자 생산에 곱해지는 도전과제 배율 (개별 + 줄 보상)
function achParticleMult(key) {
  var m = 1;
  if (key === "electron" && achDone("b2")) m *= 1.05;
  if (key === "proton" && achDone("b3")) m *= 1.05;
  if (key === "neutron" && achDone("b5")) m *= 1.05;
  if (key === "neutron" && achDone("c6")) m *= 1.1;
  if (key === "neutron" && achDone("d5")) m *= 1.1;
  if (achRowDone("B")) m *= 1.1;
  if (achRowDone("E")) m *= 1.25;
  return m;
}

// E 생산에 곱해지는 도전과제 배율 (A·D·E줄 보상)
function achEntropyMult() {
  var m = D(1);
  if (achRowDone("A")) m = m.mul(1.05);
  if (achRowDone("D")) m = m.mul(1.1);
  if (achRowDone("E")) m = m.mul(1.25);
  return m;
}

// 원소 생산에 곱해지는 도전과제 배율 (C·E줄 보상)
function achElementMult() {
  var m = D(1);
  if (achRowDone("C")) m = m.mul(1.1);
  if (achRowDone("E")) m = m.mul(1.25);
  return m;
}

// 희생: 생산 복구 계수 (0~1)
function sacRecovery() {
  return state.sacrifice ? state.sacrifice.recovery : 1;
}
function sacNeutronMult() {
  return state.sacrifice ? D(state.sacrifice.mult) : D(1);
}
function sacUnlocked() { return state.researched >= SACRIFICE.reqResearched; }

// 지금 희생하면 붙을 배율 (현재 초당 E 규모 기반, 매우 약함)
function sacrificeGainFactor() {
  var esec = coreEntropyRate();  // 복구 throttle 미포함
  var l = Math.max(0, Decimal.log10(esec.add(10)));
  return 1 + l * SACRIFICE.gainCoef;
}

// 복구 100%(완전 회복) 상태에서만 희생 가능 → 연타 방지
function canSacrifice() {
  return sacUnlocked() && sacRecovery() >= 1;
}

function doSacrifice() {
  if (!canSacrifice()) return false;
  state.sacrifice.mult = D(state.sacrifice.mult).mul(sacrificeGainFactor());
  state.sacrifice.recovery = 0;
  return true;
}

// 항성 온도 상한 (KELT-9b 보유 시 확장)
function starTempMax() {
  return STAR.tempMax + (state.planets.special.kelt ? 5000 : 0);
}

function starTempEff(n) {
  if (!state.star) return 1;
  var opt = STAR.tempOptBase + (n - 1) * STAR.tempOptStep;
  var x = (state.star.temp - opt) / STAR.tempSigma;
  return STAR.effMin + STAR.effAmp * Math.exp(-x * x);
}

// 항성의 원소 직접 생산 (개/초) — 연쇄 증폭을 감안한 소량 스트림
function starProdRate(n) {
  if (!state.star) return D(0);
  return D(ELEM_SCALE[n - 1]).mul(STAR.starProdScale)
    .mul(D(state.star.level).pow(STAR.levelPow))
    .mul(starTempEff(n));
}

// 항성의 E 생산 배율 (연쇄에 타지 않아 안전한 주 효과)
function starEMult(n) {
  if (!state.star) return D(1);
  var m = D(STAR.multBase).mul(D(state.star.level).pow(STAR.levelPow)).mul(starTempEff(n));
  if (state.planets.special.wasp) m = m.mul(2);
  if (state.planets.special.kelt) m = m.mul(1.5);
  return Decimal.max(m, 1);
}

function planetMult(n) {
  var m = D(1);
  // 랜덤 행성
  var rBonus = state.planets.special.rogue ? RANDOM_PLANET.bonus * 2 : RANDOM_PLANET.bonus;
  state.planets.random.forEach(function (p) {
    if (p.elem === n) m = m.mul(rBonus);
  });
  // 커스텀 행성
  var gas = 0, rock = 0, water = 0;
  state.planets.custom.forEach(function (p) {
    if (p.type === "gas") gas++;
    else if (p.type === "water") water++;
    else rock++;
  });
  if (isGasElement(n)) m = m.mul(Decimal.pow(PLANET.gasBonus, gas));
  else m = m.mul(Decimal.pow(PLANET.rockBonus, rock));
  m = m.mul(Decimal.pow(PLANET.waterBonus, water));
  // 특이 행성
  var sp = state.planets.special;
  if (sp.cancri && n === 6) m = m.mul(25);
  if (sp.hd189 && n === 14) m = m.mul(25);
  if (sp.kepler && (n === 1 || n === 8)) m = m.mul(25);
  if (sp.gj && (n === 1 || n === 8)) m = m.mul(40);
  if (sp.psr) m = m.mul(10);
  // 태양계 행성
  SOLAR_PLANETS.forEach(function (p) {
    if (!state.planets.solar[p.id]) return;
    if (p.boost === "all" || p.boost.indexOf(n) >= 0) m = m.mul(p.mult);
  });
  return m;
}

// 특수 연구 배율
function specialMult(n) {
  var m = D(1);
  if (state.special.gasloop && isGasElement(n)) m = m.mul(3);
  if (state.special.crystal && n >= 21) m = m.mul(3);
  return m;
}

// ---- 합성 (화합물) ----
function findCompound(id) {
  for (var i = 0; i < COMPOUNDS.length; i++) if (COMPOUNDS[i].id === id) return COMPOUNDS[i];
  return null;
}
function synthUnlocked() { return state.researched >= SYNTH.reqResearched; }
function compoundResearchable(cmp) { return Math.max.apply(null, cmp.e) <= state.researched; }
function synthLevel(id) { return state.compounds[id] || 0; }
function synthCost(cmp) {
  var lv = synthLevel(cmp.id);
  var cost = { elements: {} };
  cmp.e.forEach(function (e) {
    cost.elements[e] = D(SYNTH.base).mul(Decimal.pow(SYNTH.grow, lv))
      .mul(Decimal.pow(ELEM.revDecay, e - 1)).ceil();
  });
  return cost;
}
function buySynth(id) {
  var cmp = findCompound(id);
  if (!cmp || !compoundResearchable(cmp)) return false;
  if (pay(synthCost(cmp))) { state.compounds[id] = synthLevel(id) + 1; return true; }
  return false;
}
// 원소 n을 강화하는 모든 화합물의 배율 곱
function synthMult(n) {
  var m = D(1);
  for (var i = 0; i < COMPOUNDS.length; i++) {
    var c = COMPOUNDS[i], lv = state.compounds[c.id];
    if (lv && c.e.indexOf(n) >= 0) m = m.mul(Decimal.pow(SYNTH.effect, lv));
  }
  return m;
}

function elementMult(n) {
  var m = fusionMult(n).mul(specialMult(n)).mul(achElementMult()).mul(synthMult(n));
  if (state.solarSystem) return m.mul(D(SOLAR_SYSTEM.mult));
  return m.mul(planetMult(n));
}

// ============================================================
// 생산 속도
// ============================================================

function genRate(key) {
  var lv = state.genLevels[key];
  if (lv <= 0) return D(0);
  var r = D(GENERATORS[key].base).mul(lv).mul(Decimal.pow(GEN_RATE_GROW, lv - 1));
  r = r.mul(Decimal.pow(TRACKS.accel.effect, state.tracks.accel));
  if (key === "electron" && state.special.degeneracy) r = r.mul(10);
  if (key === "neutron" && state.special.nstar) r = r.mul(10);
  r = r.mul(achParticleMult(key)).mul(compParticleMult());
  if (key === "neutron") r = r.mul(sacNeutronMult());
  return r;
}

// 변환기 속도 (개/초)
function convRate(key) {
  var lv = state.convLevels[key];
  if (lv <= 0) return D(0);
  return D(CONVERTERS[key].base).mul(Decimal.pow(CONV_RATE_GROW, lv - 1));
}

// 원소 기본 시드 (수소 선속·촉매 반영)
function elementSeed() {
  var s = D(ELEM.h_base).mul(Decimal.pow(TRACKS.hflux.effect, state.tracks.hflux));
  if (state.special.catalyst) s = s.mul(5);
  return s;
}

// ---- 핵 압축 (프레스티지) 배율 ----
function compUp(id) { return state.compression ? (state.compression.up[id] || 0) : 0; }
function compParticleMult() { return Decimal.pow(COMP_UPGRADES[0].effect, compUp("particle")); }
function compConvMult() { return Decimal.pow(COMP_UPGRADES[1].effect, compUp("conv")); }
function compSelfRate() { return D(COMP.selfPerLevel).mul(compUp("self")); }
function compStartLevel() { return COMP_UPGRADES[3].effect * compUp("start"); }

function compValue(id) {
  var u = null;
  COMP_UPGRADES.forEach(function (x) { if (x.id === id) u = x; });
  return u;
}
function compUpCost(id) {
  var u = compValue(id);
  return D(u.base).mul(Decimal.pow(u.mult, compUp(id))).ceil();
}
function buyCompUp(id) {
  var cost = compUpCost(id);
  if (state.compression.cp.lt(cost)) return false;
  state.compression.cp = state.compression.cp.sub(cost);
  state.compression.up[id]++;
  return true;
}

// 압축 시 얻는 CP = (원소 가치 합 / scale) ^ exp
function compressWorth() {
  var w = D(0);
  for (var n = 1; n <= state.researched; n++) {
    w = w.add(state.elements[n - 1].mul(Decimal.pow(ELEM.eGrow, n - 1)));
  }
  return w;
}
function compressGain() {
  var w = compressWorth();
  if (w.lte(0)) return D(0);
  return Decimal.pow(w.div(COMP.scale), COMP.exp).floor();
}
function compressUnlocked() { return state.researched >= COMP.reqResearched; }
function canCompress() { return compressUnlocked() && compressGain().gte(1); }

function doCompress() {
  if (!canCompress()) return false;
  var g = compressGain();
  state.compression.cp = state.compression.cp.add(g);
  state.compression.totalCp = state.compression.totalCp.add(g);
  state.compression.resets++;
  // 리셋: 입자·생성기·변환기·E·원소량 (연구/업그레이드는 유지)
  state.particles = { electron: D(0), proton: D(0), neutron: D(0) };
  state.genLevels = { electron: compStartLevel(), proton: 0, neutron: 0 };
  state.convLevels = { electron: 0, proton: 0, neutron: 0 };
  state.convOn = { electron: true, proton: true, neutron: true };
  state.entropy = D(0);
  state.elements = ELEMENTS.map(function () { return D(0); });
  return true;
}

function elementProdRate(n) {
  if (state.researched < n) return D(0);
  var base;
  if (state.star) {
    // 항성 이후: 정방향 캐스케이드 (낮은 원소 → 높은 원소). 철 수급 가능.
    if (n === 1) base = elementSeed();
    else base = state.elements[n - 2].mul(ELEM.cascade);
  } else {
    // 항성 이전: 역방향. 원자번호가 클수록 시드가 작고, 위 원소가 아래 원소를 생산.
    base = elementSeed().mul(Decimal.pow(ELEM.revDecay, n - 1));
    if (n < state.researched) base = base.add(state.elements[n].mul(ELEM.cascade));
  }
  // 압축 업그레이드: 각 원소가 자기 자신을 추가 생산
  base = base.add(state.elements[n - 1].mul(compSelfRate()));
  return base.mul(elementMult(n)).add(starProdRate(n));
}

// 원소 1개당 초당 E (응축·역류 반영)
function elementERate(n) {
  var r = D(ELEM.eBase).mul(Decimal.pow(ELEM.eGrow, n - 1))
    .mul(Decimal.pow(TRACKS.condense.effect, state.tracks.condense))
    .mul(starEMult(n));
  if (state.special.reflux) r = r.mul(3);
  return r;
}

function elementEntropyRate() {
  var r = D(0);
  for (var n = 1; n <= state.researched; n++) {
    r = r.add(state.elements[n - 1].mul(elementERate(n)));
  }
  return r;
}

// 초당 E 기본값 (원소 E + 변환기 처리량) × 도전과제 배율 — 희생 복구 throttle 미포함
function coreEntropyRate() {
  var r = elementEntropyRate();
  GEN_ORDER.forEach(function (k) {
    if (state.convLevels[k] < 1 || !state.convOn[k]) return;
    var effective = state.particles[k].gt(0)
      ? convRate(k)
      : Decimal.min(convRate(k), genRate(k));
    r = r.add(effective.mul(CONVERTERS[k].value).mul(compConvMult()));
  });
  return r.mul(achEntropyMult());
}

// 화면 표시용 초당 E (희생 복구 throttle 포함)
function entropyRateDisplay() {
  return coreEntropyRate().mul(sacRecovery());
}

function gainEntropy(amount) {
  state.entropy = state.entropy.add(amount);
  state.totalEntropy = state.totalEntropy.add(amount);
}

// ============================================================
// 틱
// ============================================================

function tick(dt) {
  state.playtime += dt;

  var rec = sacRecovery();               // 희생 복구 계수 (0~1)
  var eMult = achEntropyMult().mul(rec);  // 도전과제 × 복구

  // 1. 입자 생산
  GEN_ORDER.forEach(function (k) {
    state.particles[k] = state.particles[k].add(genRate(k).mul(dt));
  });

  // 2. 자동 변환 (입자 → E) — 희생 복구 동안 처리량이 줄어 입자가 쌓임
  GEN_ORDER.forEach(function (k) {
    if (state.convLevels[k] < 1 || !state.convOn[k]) return;
    var amt = Decimal.min(state.particles[k], convRate(k).mul(dt)).mul(rec);
    if (amt.lte(0)) return;
    state.particles[k] = state.particles[k].sub(amt);
    gainEntropy(amt.mul(CONVERTERS[k].value).mul(achEntropyMult()).mul(compConvMult()));
  });

  // 3. 원소 연쇄 생산 (항성 이전에는 1.8e308 상한)
  var prods = [];
  for (var n = 1; n <= state.researched; n++) prods[n] = elementProdRate(n);
  var capped = !state.star;
  for (n = 1; n <= state.researched; n++) {
    state.elements[n - 1] = state.elements[n - 1].add(prods[n].mul(dt));
    if (capped && state.elements[n - 1].gt(ELEM.cap)) state.elements[n - 1] = D(ELEM.cap);
  }

  // 4. 원소의 E 생산
  gainEntropy(elementEntropyRate().mul(dt).mul(eMult));

  // 5. 희생 생산 복구 (0 → 1)
  if (rec < 1) {
    state.sacrifice.recovery = Math.min(1, rec + dt / SACRIFICE.recoverySeconds);
  }

  // 6. 자동화 장치
  AUTO_TARGETS.forEach(function (t) {
    var a = state.autos[t.key];
    if (!a || !a.on) return;
    var delay = autoDelay(a.level);
    if (delay <= 0) {
      var g = 0;
      while (g++ < 200 && autoBuyTarget(t)) { /* 상시 구매 */ }
    } else {
      a.timer += dt;
      var guard = 0;
      while (a.timer >= delay && guard++ < 100) {
        a.timer -= delay;
        if (!autoBuyTarget(t)) { a.timer = 0; break; }
      }
    }
  });

  // 7. 융합 강화 자동 구매 (탄소-14 동위원소)
  if (state.autoFusion && state.isotopes.c14) buyFusionMax();

  // 8. 도전과제 판정
  checkAchievements();
}

// ============================================================
// 도전과제 판정 (틱마다 호출, 신규 달성 감지)
// ============================================================
var achSilent = false;          // 오프라인 시뮬레이션 중 토스트 억제
var achToastQueue = [];         // {name, icon} — ui.js가 소비

function checkAchievements() {
  for (var i = 0; i < ACHIEVEMENTS.length; i++) {
    var a = ACHIEVEMENTS[i];
    if (state.achievements[a.id]) continue;
    if (a.check()) {
      state.achievements[a.id] = true;
      if (a.grant) gainEntropy(a.grant);
      if (!achSilent) achToastQueue.push({ icon: a.icon, name: a.name, top: "도전과제 달성" });
    }
  }
  // 줄 보상
  for (var r = 0; r < ACH_ROWS.length; r++) {
    var row = ACH_ROWS[r].row;
    if (!state.achRows[row] && achRowDone(row)) {
      state.achRows[row] = true;
      if (!achSilent) achToastQueue.push({ icon: "🏅", name: ACH_ROWS[r].reward, top: row + "줄 완성 보상" });
    }
  }
}

function simulateOffline(seconds) {
  var chunks = 200;
  achSilent = true;
  for (var i = 0; i < chunks; i++) tick(seconds / chunks);
  achSilent = false;
}

function offlineMaxTicks() {
  var t = state.settings.offlineMaxTicks;
  if (state.isotopes.he3) t *= 4;
  if (state.isotopes.k40) t *= 2;
  if (state.planets.special.tres) t *= 2;
  return t;
}

// ============================================================
// 비용 지불
// ============================================================

function canAfford(cost) {
  if (cost.entropy && state.entropy.lt(cost.entropy)) return false;
  if (cost.electron && state.particles.electron.lt(cost.electron)) return false;
  if (cost.proton && state.particles.proton.lt(cost.proton)) return false;
  if (cost.neutron && state.particles.neutron.lt(cost.neutron)) return false;
  if (cost.elements) {
    for (var n in cost.elements) {
      if (state.elements[n - 1].lt(cost.elements[n])) return false;
    }
  }
  return true;
}

function pay(cost) {
  if (!canAfford(cost)) return false;
  if (cost.entropy) state.entropy = state.entropy.sub(cost.entropy);
  if (cost.electron) state.particles.electron = state.particles.electron.sub(cost.electron);
  if (cost.proton) state.particles.proton = state.particles.proton.sub(cost.proton);
  if (cost.neutron) state.particles.neutron = state.particles.neutron.sub(cost.neutron);
  if (cost.elements) {
    for (var n in cost.elements) {
      state.elements[n - 1] = state.elements[n - 1].sub(cost.elements[n]);
    }
  }
  return true;
}

// 행성 건설 비용 할인 (철-60)
function planetDiscount(cost) {
  if (!state.isotopes.fe60 || !cost.elements) return cost;
  var out = { elements: {} };
  for (var n in cost.elements) out.elements[n] = D(cost.elements[n]).mul(0.75);
  return out;
}

// ============================================================
// 생성기 / 변환기
// ============================================================

function genCost(key) {
  var g = GENERATORS[key], lv = state.genLevels[key];
  var disc = state.isotopes.ne22 ? 0.7 : 1;
  if (lv === 0) {
    var c = { entropy: D(g.cost0).mul(disc).ceil() };
    if (g.unlockProton) c.proton = g.unlockProton;
    return c;
  }
  return { entropy: D(Math.max(g.cost0, 15)).mul(Decimal.pow(g.costMult, lv)).mul(disc).ceil() };
}

function buyGenerator(key) {
  if (pay(genCost(key))) { state.genLevels[key]++; return true; }
  return false;
}

function convCost(key) {
  var c = CONVERTERS[key], lv = state.convLevels[key];
  var disc = state.isotopes.ne22 ? 0.7 : 1;
  return { entropy: D(c.cost0).mul(Decimal.pow(c.costMult, lv)).mul(disc).ceil() };
}

function buyConverter(key) {
  if (pay(convCost(key))) { state.convLevels[key]++; return true; }
  return false;
}

// 수동 변환: 보유 입자 전량 → E
function actionConvertAll(key) {
  var amt = state.particles[key].floor();
  if (amt.lte(0)) return D(0);
  state.particles[key] = state.particles[key].sub(amt);
  var gained = amt.mul(CONVERTERS[key].value).mul(compConvMult());
  gainEntropy(gained);
  return gained;
}

// 공개 조건: 이전 것을 구매해야 다음이 보임
function genVisible(key) {
  if (key === "electron") return true;
  if (key === "proton") return state.convLevels.electron >= 1;
  if (key === "neutron") return state.convLevels.proton >= 1;
  return false;
}

function convVisible(key) {
  return state.genLevels[key] >= 1;
}

// ============================================================
// 원소 연구
// ============================================================

function researchCost() {
  var n = state.researched + 1;
  if (n > ELEMENTS.length) return null;
  if (n === 1) {
    return {
      proton: RESEARCH_HYDROGEN.proton,
      electron: RESEARCH_HYDROGEN.electron,
      entropy: RESEARCH_HYDROGEN.entropy
    };
  }
  var row = RESEARCH_TABLE[n - 1];
  var prev = D(row.prev);
  if (state.isotopes.h2) prev = prev.mul(0.75);
  var e = D(row.e);
  if (state.isotopes.o18) e = e.mul(0.7);

  var cost = { entropy: e, elements: {} };
  cost.elements[n - 1] = prev;
  if (row.n > 0) {
    var nn = D(row.n);
    if (state.isotopes.n15) nn = nn.mul(0.5);
    cost.neutron = nn;
  }
  return cost;
}

function researchNext() {
  var cost = researchCost();
  if (!cost) return false;
  if (pay(cost)) { state.researched++; return true; }
  return false;
}

// ============================================================
// 융합 강화 + 업그레이드 트랙
// ============================================================

function fusionCostMult() {
  var m = FUSION.costMult;
  if (state.isotopes.h3) m -= 0.2;
  if (state.special.halffusion) m -= 0.1;
  return m;
}

function fusionCost() {
  return D(FUSION.costBase).mul(Decimal.pow(fusionCostMult(), fusionTotalLevel())).ceil();
}

function fusionCap() { return FUSION.capPerElement * state.researched; }

function buyFusion() {
  var target = fusionNextTarget();
  if (target < 0) return false;
  if (pay({ entropy: fusionCost() })) { state.fusionLevels[target]++; return true; }
  return false;
}

function buyFusionMax() {
  var n = 0;
  while (n < 2000 && buyFusion()) n++;
  return n;
}

function trackCost(id) {
  var t = TRACKS[id];
  return D(t.costBase).mul(Decimal.pow(t.costMult, state.tracks[id])).ceil();
}

function trackCap(id) { return TRACKS[id].capPer * state.researched; }

function buyTrack(id) {
  if (state.tracks[id] >= trackCap(id)) return false;
  if (pay({ entropy: trackCost(id) })) { state.tracks[id]++; return true; }
  return false;
}

function buyTrackMax(id) {
  var n = 0;
  while (n < 1000 && buyTrack(id)) n++;
  return n;
}

// ============================================================
// 특수 연구 (1회성, 원소 소모)
// ============================================================

function specialCost(sp) {
  var disc = state.isotopes.ti44 ? 0.75 : 1;
  var cost = { elements: {} };
  for (var n in sp.cost) cost.elements[n] = D(sp.cost[n]).mul(disc);
  return cost;
}

function buySpecial(id) {
  var sp = null;
  SPECIALS.forEach(function (s) { if (s.id === id) sp = s; });
  if (!sp || state.special[id] || state.researched < sp.req) return false;
  if (pay(specialCost(sp))) { state.special[id] = true; return true; }
  return false;
}

// ============================================================
// 자동화 (항목별 자동 구매)
// ============================================================

var AUTO_MAX_LEVEL = AUTO_DELAYS.length - 1;

function autoDelay(level) {
  var d = AUTO_DELAYS[Math.min(level, AUTO_MAX_LEVEL)];
  if (state.isotopes.al26) d *= 0.8;
  return d;
}

// 단축 비용: 레벨에 따라 초기 원소(H~B)를 소량 요구.
// 요구 원소는 레벨로만 결정되므로, 새 원소를 연구해도 비용이 바뀌지 않는다.
function autoStepCost(level) {
  var e = Math.min(AUTO_COST_MAX_ELEM,
    1 + Math.floor(level * AUTO_COST_MAX_ELEM / AUTO_DELAYS.length));
  var amt = D(AUTO_STEP_BASE).mul(Decimal.pow(AUTO_STEP_GROW, level));
  var cost = { elements: {} };
  cost.elements[e] = amt;
  return cost;
}

function buyAutoStep(key) {
  var a = state.autos[key];
  if (!a || a.level >= AUTO_MAX_LEVEL) return false;
  if (pay(autoStepCost(a.level))) { a.level++; return true; }
  return false;
}

// 한 항목의 단축을 살 수 있는 만큼 전부
function buyAutoStepMax(key) {
  var n = 0;
  while (n < 100 && buyAutoStep(key)) n++;
  return n;
}

// 보이는 모든 자동화 항목을 한 번에 최대 단축
function buyAllAutoMax() {
  var total = 0;
  AUTO_TARGETS.forEach(function (t) {
    if (autoTargetVisible(t)) total += buyAutoStepMax(t.key);
  });
  return total;
}

// 보이는 모든 자동화 항목을 한 번에 가동/정지
function setAllAuto(on) {
  AUTO_TARGETS.forEach(function (t) {
    if (autoTargetVisible(t) && state.autos[t.key]) state.autos[t.key].on = on;
  });
}
function allAutoOn() {
  var any = false, all = true;
  AUTO_TARGETS.forEach(function (t) {
    if (!autoTargetVisible(t)) return;
    any = true;
    if (!state.autos[t.key].on) all = false;
  });
  return any && all;
}

function autoBuyTarget(t) {
  if (t.kind === "gen") return buyGenerator(t.p);
  if (t.kind === "conv") return buyConverter(t.p);
  if (t.kind === "fusion") return buyFusion();
  if (t.kind === "track") return buyTrack(t.t);
  return false;
}

function autoTargetVisible(t) {
  if (t.kind === "gen") return genVisible(t.p);
  if (t.kind === "conv") return convVisible(t.p);
  if (t.kind === "fusion" || t.kind === "track") return state.researched >= 1;
  return false;
}

// ============================================================
// 동위원소
// ============================================================

function buyIsotope(id) {
  var iso = null;
  ISOTOPES.forEach(function (i) { if (i.id === id) iso = i; });
  if (!iso || state.isotopes[id] || state.researched < iso.req) return false;
  if (pay({ neutron: iso.cost.neutron, entropy: D(iso.cost.entropy) })) {
    state.isotopes[id] = true;
    if (id === "c14") state.autoFusion = true;
    return true;
  }
  return false;
}

// ============================================================
// 항성
// ============================================================

function starRecipeCost() {
  var cost = { elements: {} };
  for (var n in STAR.recipe) {
    var amt = D(STAR.recipe[n]);
    if (state.isotopes.fe56) amt = amt.mul(0.8);
    cost.elements[n] = amt;
  }
  return cost;
}

function createStar() {
  if (state.star || state.researched < ELEMENTS.length) return false;
  if (pay(starRecipeCost())) {
    state.star = { level: 1, temp: STAR.tempDefault };
    return true;
  }
  return false;
}

function starLevelCost() {
  var c = D(STAR.levelCostFe).mul(Decimal.pow(STAR.levelCostMult, state.star.level - 1));
  if (state.isotopes.fe56) c = c.mul(0.8);
  return { elements: { 26: c } };
}

function buyStarLevel() {
  if (!state.star || state.star.level >= STAR.maxLevel) return false;
  if (pay(starLevelCost())) { state.star.level++; return true; }
  return false;
}

function buyStarLevelMax() {
  var n = 0;
  while (n < 400 && buyStarLevel()) n++;
  return n;
}

function setStarTemp(t) {
  if (!state.star) return;
  state.star.temp = Math.max(STAR.tempMin, Math.min(starTempMax(), t));
}

// ============================================================
// 행성 — 티어 1: 랜덤 행성
// ============================================================

function randomPlanetCost() {
  var mult = Decimal.pow(RANDOM_PLANET.costGrowth, state.planets.random.length);
  var cost = { elements: {} };
  for (var n in RANDOM_PLANET.base) cost.elements[n] = D(RANDOM_PLANET.base[n]).mul(mult);
  return planetDiscount(cost);
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  var k = function (n) { return (n + h / 30) % 12; };
  var a = s * Math.min(l, 1 - l);
  var f = function (n) {
    var c = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * c).toString(16).padStart(2, "0");
  };
  return "#" + f(0) + f(8) + f(4);
}

function buildRandomPlanet() {
  if (!state.star || state.planets.random.length >= RANDOM_PLANET.max) return false;
  if (!pay(randomPlanetCost())) return false;
  var seed = (Date.now() + state.planets.random.length * 7919) % 2147483000;
  var rnd = seededRandLogic(seed);
  var elem = 1 + Math.floor(rnd() * state.researched);
  var types = ["rock", "gas", "ice", "water", "lava"];
  var type = types[Math.floor(rnd() * types.length)];
  var h = Math.floor(rnd() * 360);
  var look = {
    type: type,
    colors: [hslToHex(h, 45, 55), hslToHex(h, 50, 28), hslToHex((h + 40) % 360, 55, 75)]
  };
  state.planets.random.push({ seed: seed, elem: elem, look: look });
  return true;
}

// render.js 없이도 돌아가도록 로직용 시드 난수
function seededRandLogic(seed) {
  var s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

// ============================================================
// 행성 — 티어 2: 태양계 행성
// ============================================================

function solarPlanetCost(sp) {
  var cost = { elements: {} };
  for (var n in sp.els) cost.elements[n] = D(sp.els[n]);
  return planetDiscount(cost);
}

function buildSolarPlanet(id) {
  var sp = null;
  SOLAR_PLANETS.forEach(function (p) { if (p.id === id) sp = p; });
  if (!sp || state.planets.solar[id] || !state.star) return false;
  if (pay(solarPlanetCost(sp))) { state.planets.solar[id] = true; return true; }
  return false;
}

function solarPlanetCount() {
  var c = 0;
  SOLAR_PLANETS.forEach(function (p) { if (state.planets.solar[p.id]) c++; });
  return c;
}

// ============================================================
// 행성 — 티어 3: 커스텀 행성
// ============================================================

function customLimit() {
  var lim = PLANET.baseLimit;
  if (state.special.site1) lim++;
  if (state.special.site2) lim++;
  if (state.special.site3) lim++;
  return lim;
}

function researchPlanet() {
  if (state.planetResearched || !state.star) return false;
  if (pay({ entropy: D(PLANET.researchCost) })) { state.planetResearched = true; return true; }
  return false;
}

function planetTypeOf(extras) {
  if (extras.indexOf(1) >= 0 && extras.indexOf(8) >= 0) return "water";
  var gas = extras.filter(isGasElement).length;
  if (gas * 2 > extras.length) return "gas";
  return "rock";
}

function customPlanetCost(extras) {
  var mult = Decimal.pow(PLANET.costGrowth, state.planets.custom.length);
  var cost = { elements: {} };
  for (var n in PLANET.base) cost.elements[n] = D(PLANET.base[n]).mul(mult);
  extras.forEach(function (n) {
    var cur = cost.elements[n] || D(0);
    cost.elements[n] = cur.add(D(ELEM_SCALE[n - 1]).mul(PLANET.extraScaleMult).mul(mult));
  });
  return planetDiscount(cost);
}

function buildCustomPlanet(extras) {
  if (!state.planetResearched || extras.length < 1 || extras.length > 3) return false;
  if (state.planets.custom.length >= customLimit()) return false;
  if (pay(customPlanetCost(extras))) {
    state.planets.custom.push({ type: planetTypeOf(extras), extras: extras.slice() });
    return true;
  }
  return false;
}

function deleteCustomPlanet(index) {
  if (index < 0 || index >= state.planets.custom.length) return false;
  state.planets.custom.splice(index, 1);
  return true;
}

// ============================================================
// 행성 — 티어 4: 특이 행성 (블라인드 청사진)
// ============================================================

function buyBlueprint(id) {
  var exo = null;
  EXOPLANETS.forEach(function (e) { if (e.id === id) exo = e; });
  if (!exo || state.planets.blueprints[id]) return false;
  if (pay({ neutron: exo.blueprint.neutron, entropy: D(exo.blueprint.entropy) })) {
    state.planets.blueprints[id] = true;
    return true;
  }
  return false;
}

function exoBuildCost(exo) {
  var cost = { elements: {} };
  for (var n in exo.build) cost.elements[n] = D(exo.build[n]);
  return planetDiscount(cost);
}

function buildExoplanet(id) {
  var exo = null;
  EXOPLANETS.forEach(function (e) { if (e.id === id) exo = e; });
  if (!exo || !state.planets.blueprints[id] || state.planets.special[id]) return false;
  if (pay(exoBuildCost(exo))) { state.planets.special[id] = true; return true; }
  return false;
}

// ============================================================
// 태양계
// ============================================================

function canFormSolarSystem() {
  return state.star && state.star.level >= STAR.solarLevel &&
    solarPlanetCount() === SOLAR_PLANETS.length && !state.solarSystem;
}

function formSolarSystem() {
  if (!canFormSolarSystem()) return false;
  state.solarSystem = true;
  return true;
}

// ============================================================
// 최대 구매 (제일 비싼 것부터)
// ============================================================

function maxBuyAll() {
  var total = 0;
  for (var iter = 0; iter < 3000; iter++) {
    var best = null, bestCost = null;
    function consider(cost, fn) {
      if (state.entropy.gte(cost) && (bestCost === null || cost.gt(bestCost))) {
        bestCost = cost; best = fn;
      }
    }
    if (state.researched > 0 && fusionNextTarget() >= 0) consider(fusionCost(), buyFusion);
    TRACK_ORDER.forEach(function (id) {
      if (state.researched > 0 && state.tracks[id] < trackCap(id)) {
        consider(trackCost(id), function () { return buyTrack(id); });
      }
    });
    GEN_ORDER.forEach(function (k) {
      if (genVisible(k)) {
        var c = genCost(k);
        if (!c.proton || state.particles.proton.gte(c.proton)) {
          consider(c.entropy, function () { return buyGenerator(k); });
        }
      }
      if (convVisible(k)) consider(convCost(k).entropy, function () { return buyConverter(k); });
    });
    if (!best) break;
    if (!best()) break;
    total++;
  }
  return total;
}

// ============================================================
// 다음 목표
// ============================================================

function currentGoal() {
  if (state.genLevels.electron < 1) return "전자 생성기를 무료로 구매하세요";
  if (state.convLevels.electron < 1) return "전자를 수동 변환해 E를 모아 전자 변환기를 해금하세요";
  if (state.genLevels.proton < 1) return "양성자 생성기를 해금하세요";
  if (state.convLevels.proton < 1) return "양성자 변환기를 해금하세요";
  if (state.genLevels.neutron < 1) return "중성자 생성기를 해금하세요 (양성자 + E)";
  if (state.researched === 0) return "수소를 연구하세요";
  if (state.researched < ELEMENTS.length) {
    return "다음 원소: " + ELEMENTS[state.researched].name + " (" + ELEMENTS[state.researched].sym + ") 연구";
  }
  if (!state.star) return "철 1e100을 모아 핵융합으로 항성을 점화하세요";
  if (!state.solarSystem) {
    return "태양 Lv " + STAR.solarLevel + " + 태양계 행성 9개 → 태양계 구성 (" +
      "Lv " + state.star.level + " · 행성 " + solarPlanetCount() + "/9)";
  }
  return "태양계 완성! 다음 업데이트를 기다려주세요";
}
