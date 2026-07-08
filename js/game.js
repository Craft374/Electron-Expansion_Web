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
    autoUp: { unlocked: false, level: 0, on: true, timer: 0 },
    star: null,
    planets: { random: [], custom: [], special: {}, blueprints: {}, solar: {} },
    planetResearched: false,
    solarSystem: false,
    settings: {
      notation: "sci",
      offlineMaxTicks: SYSTEM.offlineMaxTicks,
      autosave: true,
      devMode: false,
      gameSpeed: 1
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

function elementMult(n) {
  var m = fusionMult(n).mul(specialMult(n));
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
  return r;
}

// 변환기 속도 (개/초)
function convRate(key) {
  var lv = state.convLevels[key];
  if (lv <= 0) return D(0);
  return D(CONVERTERS[key].base).mul(Decimal.pow(CONV_RATE_GROW, lv - 1));
}

function elementProdRate(n) {
  if (state.researched < n) return D(0);
  var base;
  if (n === 1) {
    base = D(ELEM.h_base).mul(Decimal.pow(TRACKS.hflux.effect, state.tracks.hflux));
    if (state.special.catalyst) base = base.mul(5);
  } else {
    base = state.elements[n - 2].mul(ELEM.cascade);
  }
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

// 화면 표시용 초당 E (변환기 처리량 포함)
function entropyRateDisplay() {
  var r = elementEntropyRate();
  GEN_ORDER.forEach(function (k) {
    if (state.convLevels[k] < 1 || !state.convOn[k]) return;
    var effective = state.particles[k].gt(0)
      ? convRate(k)
      : Decimal.min(convRate(k), genRate(k));
    r = r.add(effective.mul(CONVERTERS[k].value));
  });
  return r;
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

  // 1. 입자 생산
  GEN_ORDER.forEach(function (k) {
    state.particles[k] = state.particles[k].add(genRate(k).mul(dt));
  });

  // 2. 자동 변환 (입자 → E)
  GEN_ORDER.forEach(function (k) {
    if (state.convLevels[k] < 1 || !state.convOn[k]) return;
    var amt = Decimal.min(state.particles[k], convRate(k).mul(dt));
    if (amt.lte(0)) return;
    state.particles[k] = state.particles[k].sub(amt);
    gainEntropy(amt.mul(CONVERTERS[k].value));
  });

  // 3. 원소 연쇄 생산
  var prods = [];
  for (var n = 1; n <= state.researched; n++) prods[n] = elementProdRate(n);
  for (n = 1; n <= state.researched; n++) {
    state.elements[n - 1] = state.elements[n - 1].add(prods[n].mul(dt));
  }

  // 4. 원소의 E 생산
  gainEntropy(elementEntropyRate().mul(dt));

  // 5. 생성기 자동 업그레이드
  if (state.autoUp.unlocked && state.autoUp.on) {
    state.autoUp.timer += dt;
    var delay = autoUpDelay();
    var guard = 0;
    while (state.autoUp.timer >= delay && guard++ < 50) {
      state.autoUp.timer -= delay;
      if (!autoUpBuyOne()) { state.autoUp.timer = 0; break; }
    }
  }

  // 6. 융합 강화 자동 구매
  if (state.autoFusion && state.isotopes.c14) buyFusionMax();
}

function simulateOffline(seconds) {
  var chunks = 200;
  for (var i = 0; i < chunks; i++) tick(seconds / chunks);
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
  var gained = amt.mul(CONVERTERS[key].value);
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
// 생성기 자동 업그레이드
// ============================================================

function autoUpDelay() {
  var d = AUTOUP.steps[state.autoUp.level];
  if (state.isotopes.al26) d *= 0.8;
  return d;
}

function autoUpUnlockCost() {
  var cost = { elements: {} };
  for (var n in AUTOUP.unlockCost) cost.elements[n] = D(AUTOUP.unlockCost[n]);
  return cost;
}

function unlockAutoUp() {
  if (state.autoUp.unlocked) return false;
  if (pay(autoUpUnlockCost())) { state.autoUp.unlocked = true; return true; }
  return false;
}

function autoUpStepCost() {
  var cost = { elements: {} };
  cost.elements[AUTOUP.stepCostElem] =
    D(AUTOUP.stepCostBase).mul(Decimal.pow(AUTOUP.stepCostMult, state.autoUp.level));
  return cost;
}

function buyAutoUpStep() {
  if (state.autoUp.level >= AUTOUP.steps.length - 1) return false;
  if (pay(autoUpStepCost())) { state.autoUp.level++; return true; }
  return false;
}

// 보유 중인 생성기/변환기 중 제일 싼 레벨 1개 자동 구매
function autoUpBuyOne() {
  var best = null, bestCost = null;
  GEN_ORDER.forEach(function (k) {
    if (state.genLevels[k] >= 1) {
      var c = genCost(k).entropy;
      if (state.entropy.gte(c) && (bestCost === null || c.lt(bestCost))) {
        bestCost = c; best = function () { return buyGenerator(k); };
      }
    }
    if (state.convLevels[k] >= 1) {
      var c2 = convCost(k).entropy;
      if (state.entropy.gte(c2) && (bestCost === null || c2.lt(bestCost))) {
        bestCost = c2; best = function () { return buyConverter(k); };
      }
    }
  });
  return best ? best() : false;
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
