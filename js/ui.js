// ============================================================
// ui.js — 화면 구성/갱신
// 원칙: 버튼이 있는 DOM은 구조가 바뀔 때만 재생성하고,
//       매 프레임에는 텍스트/활성화 상태만 제자리에서 갱신한다.
//       (버튼 클릭 씹힘·번쩍임 방지)
// ============================================================

function el(id) { return document.getElementById(id); }
var activeTab = "main";
var selExtras = [];
var planetCanvases = [];
var sig = {};   // 섹션별 구조 시그니처 (바뀌면 재생성)

function shadeHex(hex, f) {
  var c = hexRgb(hex);
  return "rgb(" + (c[0] * f | 0) + "," + (c[1] * f | 0) + "," + (c[2] * f | 0) + ")";
}

function switchTab(name) {
  activeTab = name;
  document.querySelectorAll(".tab-page").forEach(function (p) { p.classList.add("hidden"); });
  document.querySelectorAll(".side-btn").forEach(function (b) {
    b.classList.toggle("active", b.dataset.tab === name);
  });
  el("tab-" + name).classList.remove("hidden");
  updateUI();
}

function setHidden(id, hidden) {
  el(id).classList.toggle("hidden", !!hidden);
}

// 비용 표시 (충분: 초록 / 부족: 빨강)
function costHTML(cost) {
  var parts = [];
  function item(text, need, have) {
    parts.push('<span class="cost-item ' + (have.gte(need) ? "ok" : "no") + '">' + text + "</span>");
  }
  if (cost.elements) {
    Object.keys(cost.elements).map(Number).sort(function (a, b) { return a - b; }).forEach(function (n) {
      item(ELEMENTS[n - 1].sym + " " + format(cost.elements[n], 1), D(cost.elements[n]), state.elements[n - 1]);
    });
  }
  if (cost.electron) item("전자 " + format(cost.electron, 1), D(cost.electron), state.particles.electron);
  if (cost.proton) item("양성자 " + format(cost.proton, 1), D(cost.proton), state.particles.proton);
  if (cost.neutron) item("중성자 " + format(cost.neutron, 1), D(cost.neutron), state.particles.neutron);
  if (cost.entropy) item(format(cost.entropy, 1) + " E", D(cost.entropy), state.entropy);
  return parts.join('<span class="cost-sep"> · </span>');
}

// ============================================================
// 내비게이션 / 헤더
// ============================================================

function updateNav() {
  setHidden("nav-elements", state.genLevels.neutron < 1 && state.researched < 1);
  setHidden("nav-isotopes", state.researched < 2);
  setHidden("nav-star", state.researched < ELEMENTS.length);
  setHidden("nav-planets", !state.star);
  var solarVisible = state.solarSystem ||
    (state.star && (solarPlanetCount() >= SOLAR_PLANETS.length || state.star.level >= STAR.solarLevel));
  setHidden("nav-solar", !solarVisible);
}

function updateHeader() {
  el("txt-entropy").textContent = format(state.entropy.floor());
  el("txt-erate").textContent = format(entropyRateDisplay(), 1);
  el("txt-goal").textContent = currentGoal();
}

// ============================================================
// 입자 생성기 & 변환기
// ============================================================

function buildGenList() {
  var html = "";
  GEN_ORDER.forEach(function (k) {
    html +=
      '<div class="gen-row hidden" id="gen-row-' + k + '">' +
        '<div class="gen-info">' +
          '<div class="gen-name">' + GENERATORS[k].name + ' <small id="gen-lv-' + k + '"></small></div>' +
          '<div class="gen-stat" id="gen-stat-' + k + '"></div>' +
          '<label class="check sm hidden" id="conv-line-' + k + '">' +
            '<input type="checkbox" id="conv-on-' + k + '"> <span id="conv-stat-' + k + '"></span>' +
          '</label>' +
        '</div>' +
        '<div class="gen-btns">' +
          '<button class="btn" id="gen-buy-' + k + '"></button>' +
          '<button class="btn ghost hidden" id="conv-manual-' + k + '"></button>' +
          '<button class="btn hidden" id="conv-buy-' + k + '"></button>' +
        '</div>' +
      '</div>';
  });
  el("gen-list").innerHTML = html;
  GEN_ORDER.forEach(function (k) {
    el("gen-buy-" + k).onclick = function () { buyGenerator(k); updateUI(); };
    el("conv-buy-" + k).onclick = function () { buyConverter(k); updateUI(); };
    el("conv-manual-" + k).onclick = function () { actionConvertAll(k); updateUI(); };
    el("conv-on-" + k).onchange = function () { state.convOn[k] = this.checked; };
  });
}

function updateGens() {
  GEN_ORDER.forEach(function (k) {
    var visible = genVisible(k);
    setHidden("gen-row-" + k, !visible);
    if (!visible) return;
    var lv = state.genLevels[k];

    el("gen-lv-" + k).textContent = lv > 0 ? "Lv " + lv : "";
    if (lv > 0) {
      el("gen-stat-" + k).innerHTML =
        "보유 <b>" + formatWhole(state.particles[k]) + "</b>개 · 초당 <b>+" + format(genRate(k), 1) + "</b>개";
    } else {
      el("gen-stat-" + k).textContent = "미보유";
    }

    // 생성기 구매/레벨업 버튼
    var gc = genCost(k);
    var gbtn = el("gen-buy-" + k);
    if (lv === 0) {
      gbtn.textContent = gc.entropy.eq(0) ? "무료 구매"
        : "해금 — " + (gc.proton ? "양성자 " + format(gc.proton, 0) + " + " : "") + format(gc.entropy, 0) + " E";
    } else {
      gbtn.textContent = "레벨업 " + format(gc.entropy, 0) + " E";
    }
    gbtn.disabled = !canAfford(gc);

    // 수동 변환
    var mbtn = el("conv-manual-" + k);
    setHidden("conv-manual-" + k, lv < 1);
    if (lv >= 1) {
      var gain = state.particles[k].floor().mul(CONVERTERS[k].value);
      mbtn.textContent = "전량 변환 → " + format(gain, 0) + " E";
      mbtn.disabled = state.particles[k].lt(1);
    }

    // 변환기
    var cbtn = el("conv-buy-" + k);
    var cVisible = convVisible(k);
    setHidden("conv-buy-" + k, !cVisible);
    if (cVisible) {
      var cc = convCost(k);
      var clv = state.convLevels[k];
      cbtn.textContent = clv === 0
        ? CONVERTERS[k].name + " 해금 — " + format(cc.entropy, 0) + " E"
        : "변환 Lv" + clv + " → " + (clv + 1) + " — " + format(cc.entropy, 0) + " E";
      cbtn.disabled = !canAfford(cc);
    }
    var owned = state.convLevels[k] >= 1;
    setHidden("conv-line-" + k, !owned);
    if (owned) {
      el("conv-stat-" + k).textContent =
        "자동 변환: 초당 " + format(convRate(k), 1) + "개 → " +
        format(convRate(k).mul(CONVERTERS[k].value), 1) + " E";
      var chk = el("conv-on-" + k);
      if (chk.checked !== state.convOn[k]) chk.checked = state.convOn[k];
    }
  });

  // 자동 업그레이드 장치
  var showAuto = state.researched >= 5 || state.autoUp.unlocked;
  setHidden("panel-autoup", !showAuto);
  if (showAuto) {
    setHidden("autoup-locked", state.autoUp.unlocked);
    setHidden("autoup-open", !state.autoUp.unlocked);
    if (!state.autoUp.unlocked) {
      var uc = autoUpUnlockCost();
      el("txt-autoup-unlock-cost").innerHTML = costHTML(uc);
      el("btn-autoup-unlock").disabled = !canAfford(uc);
    } else {
      el("txt-autoup-delay").textContent = autoUpDelay().toFixed(2);
      var maxed = state.autoUp.level >= AUTOUP.steps.length - 1;
      el("txt-autoup-lv").textContent = "(" + state.autoUp.level + " / " + (AUTOUP.steps.length - 1) + ")";
      if (maxed) {
        el("txt-autoup-cost").innerHTML = '<span class="cost-item ok">최대 단축 완료</span>';
        el("btn-autoup-step").disabled = true;
      } else {
        var sc = autoUpStepCost();
        el("txt-autoup-cost").innerHTML = costHTML(sc);
        el("btn-autoup-step").disabled = !canAfford(sc);
      }
      var achk = el("chk-autoup");
      if (achk.checked !== state.autoUp.on) achk.checked = state.autoUp.on;
    }
  }
}

// ============================================================
// 원소 탭 — 업그레이드 4종 / 연구 / 그리드 / 특수 연구
// ============================================================

function updateFusion() {
  el("txt-fusion-lv").textContent = fusionTotalLevel() + " / " + fusionCap();
  var target = fusionNextTarget();
  el("txt-fusion-target").textContent = target >= 0
    ? ELEMENTS[target].name + " (" + ELEMENTS[target].sym + ") ×" + FUSION.effect
    : "상한 도달";
  el("txt-fusion-cost").textContent = format(fusionCost(), 1);
  var can = target >= 0 && state.entropy.gte(fusionCost());
  el("btn-fusion").disabled = !can;
  el("btn-fusion-max").disabled = !can;
  setHidden("auto-fusion-wrap", !state.isotopes.c14);
  var fchk = el("chk-auto-fusion");
  if (fchk.checked !== state.autoFusion) fchk.checked = state.autoFusion;

  TRACK_ORDER.forEach(function (id) {
    el("txt-track-" + id + "-lv").textContent = state.tracks[id] + " / " + trackCap(id);
    el("txt-track-" + id + "-cost").textContent = format(trackCost(id), 1);
    var ok = state.tracks[id] < trackCap(id) && state.entropy.gte(trackCost(id));
    document.querySelectorAll('[data-track="' + id + '"]').forEach(function (b) { b.disabled = !ok; });
  });
}

function updateResearch() {
  var done = state.researched >= ELEMENTS.length;
  setHidden("research-static", done);
  setHidden("research-done", !done);
  if (done) return;
  var n = state.researched + 1;
  var cost = researchCost();
  el("txt-research-title").innerHTML =
    "다음 원소: " + ELEMENTS[n - 1].name +
    ' <span class="sym">' + ELEMENTS[n - 1].sym + '</span> <small style="color:var(--dim)">(' + n + "/26)</small>";
  el("txt-research-cost").innerHTML = costHTML(cost);
  el("btn-research").disabled = !canAfford(cost);
}

function buildElemGrid() {
  var html = "";
  for (var n = 1; n <= state.researched; n++) {
    var e = ELEMENTS[n - 1];
    html +=
      '<div class="elem-tile" style="border-left-color:' + e.color + '">' +
        '<div class="elem-head">' +
          '<span class="elem-sym" style="color:' + e.color + '">' + e.sym + '</span>' +
          '<span class="elem-name">' + e.name + '</span>' +
          '<span class="elem-fusion" id="elem-fu-' + n + '"></span>' +
        '</div>' +
        '<div class="elem-amt" id="elem-amt-' + n + '"></div>' +
        '<div class="elem-rate" id="elem-rate-' + n + '"></div>' +
      '</div>';
  }
  el("elem-grid").innerHTML = html || '<div class="panel-sub">아직 연구한 원소가 없습니다.</div>';
}

function updateElemGrid() {
  if (sig.elemGrid !== state.researched) {
    buildElemGrid();
    sig.elemGrid = state.researched;
  }
  for (var n = 1; n <= state.researched; n++) {
    el("elem-amt-" + n).textContent = format(state.elements[n - 1]);
    el("elem-rate-" + n).textContent = "+" + format(elementProdRate(n), 1) + "/초";
    el("elem-fu-" + n).textContent = state.fusionLevels[n - 1] > 0 ? "강화 +" + state.fusionLevels[n - 1] : "";
  }
}

function specialSig() {
  return state.researched + "|" + SPECIALS.map(function (s) { return state.special[s.id] ? 1 : 0; }).join("");
}

function buildSpecials() {
  var box = el("special-list");
  box.innerHTML = "";
  SPECIALS.forEach(function (sp) {
    if (state.researched < sp.req) return;
    var card = document.createElement("div");
    var owned = !!state.special[sp.id];
    card.className = "iso-card" + (owned ? " owned" : "");
    card.innerHTML =
      '<div class="iso-name">' + sp.name + '</div>' +
      '<div class="iso-desc">' + sp.desc + '</div>' +
      (owned
        ? '<div class="iso-owned-tag">✓ 연구 완료</div>'
        : '<div class="cost-line" id="spec-cost-' + sp.id + '"></div>' +
          '<button class="btn" id="spec-btn-' + sp.id + '">연구</button>');
    box.appendChild(card);
    if (!owned) {
      el("spec-btn-" + sp.id).onclick = function () { buySpecial(sp.id); updateUI(); };
    }
  });
}

function updateSpecials() {
  var visible = state.researched >= SPECIALS[0].req;
  setHidden("panel-specials", !visible);
  if (!visible) return;
  var s = specialSig();
  if (sig.specials !== s) { buildSpecials(); sig.specials = s; }
  SPECIALS.forEach(function (sp) {
    if (state.researched < sp.req || state.special[sp.id]) return;
    var cost = specialCost(sp);
    var cEl = el("spec-cost-" + sp.id);
    if (cEl) cEl.innerHTML = costHTML(cost);
    var bEl = el("spec-btn-" + sp.id);
    if (bEl) bEl.disabled = !canAfford(cost);
  });
}

// ============================================================
// 동위원소
// ============================================================

function isoSig() {
  return state.researched + "|" + ISOTOPES.map(function (i) { return state.isotopes[i.id] ? 1 : 0; }).join("");
}

function buildIsotopes() {
  var box = el("iso-list");
  box.innerHTML = "";
  ISOTOPES.forEach(function (iso) {
    if (state.researched < iso.req) return;
    var owned = !!state.isotopes[iso.id];
    var card = document.createElement("div");
    card.className = "iso-card" + (owned ? " owned" : "");
    card.innerHTML =
      '<div class="iso-name">' + iso.name + '</div>' +
      '<div class="iso-desc">' + iso.desc + '</div>' +
      (owned
        ? '<div class="iso-owned-tag">✓ 합성 완료</div>'
        : '<div class="cost-line" id="iso-cost-' + iso.id + '"></div>' +
          '<button class="btn" id="iso-btn-' + iso.id + '">합성</button>');
    box.appendChild(card);
    if (!owned) {
      el("iso-btn-" + iso.id).onclick = function () { buyIsotope(iso.id); updateUI(); };
    }
  });
  if (!box.children.length) {
    box.innerHTML = '<div class="panel-sub">아직 합성 가능한 동위원소가 없습니다.</div>';
  }
}

function updateIsotopes() {
  var s = isoSig();
  if (sig.iso !== s) { buildIsotopes(); sig.iso = s; }
  ISOTOPES.forEach(function (iso) {
    if (state.researched < iso.req || state.isotopes[iso.id]) return;
    var cost = { neutron: iso.cost.neutron, entropy: D(iso.cost.entropy) };
    var cEl = el("iso-cost-" + iso.id);
    if (cEl) cEl.innerHTML = costHTML(cost);
    var bEl = el("iso-btn-" + iso.id);
    if (bEl) bEl.disabled = !canAfford(cost);
  });
}

// ============================================================
// 항성
// ============================================================

function updateStar() {
  setHidden("star-locked", !!state.star);
  setHidden("star-owned", !state.star);

  if (!state.star) {
    var cost = starRecipeCost();
    var rows = "";
    Object.keys(cost.elements).map(Number).sort(function (a, b) { return a - b; }).forEach(function (n) {
      var need = cost.elements[n], have = state.elements[n - 1];
      rows += '<div class="recipe-row">' +
        '<span class="cost-item ' + (have.gte(need) ? "ok" : "no") + '">' +
        ELEMENTS[n - 1].name + " (" + ELEMENTS[n - 1].sym + ") — " + format(need, 1) + '</span>' +
        '<span class="have">보유 ' + format(have, 1) + '</span></div>';
    });
    el("star-recipe").innerHTML = rows;
    el("btn-ignite").disabled = !canAfford(cost);
    return;
  }

  var s = state.star;
  el("txt-star-lv").textContent = "Lv " + s.level + " / " + STAR.maxLevel;
  el("txt-star-temp").textContent = s.temp.toLocaleString("en-US");
  el("txt-star-class").textContent = spectralClass(s.temp);
  el("txt-star-mult").innerHTML =
    "H ×" + format(starEMult(1), 1) + " · Si ×" + format(starEMult(14), 1) + " · Fe ×" + format(starEMult(26), 1);
  el("txt-star-prod").innerHTML =
    "H +" + format(starProdRate(1), 1) + "/초 · Fe +" + format(starProdRate(26), 1) + "/초";

  var rng = el("rng-temp");
  rng.max = starTempMax();
  if (Number(rng.value) !== s.temp && document.activeElement !== rng) rng.value = s.temp;

  var maxed = s.level >= STAR.maxLevel;
  if (maxed) {
    el("txt-star-cost").innerHTML = '<span class="cost-item ok">최대 레벨 (1년 완성)</span>';
    el("btn-star-lv").disabled = true;
    el("btn-star-max").disabled = true;
  } else {
    var lvCost = starLevelCost();
    el("txt-star-cost").innerHTML = costHTML(lvCost);
    el("btn-star-lv").disabled = !canAfford(lvCost);
    el("btn-star-max").disabled = !canAfford(lvCost);
  }
  el("txt-star-solar-hint").textContent = maxed
    ? "태양이 1년을 채웠습니다! 아홉 행성을 모아 태양계를 구성하세요."
    : "태양계 구성 조건: Lv " + STAR.solarLevel + " — 행성들의 생산 보너스가 필요할 겁니다";
}

// ============================================================
// 행성 (티어 1~4)
// ============================================================

function customLook(extras) {
  var type = planetTypeOf(extras);
  var c0 = ELEMENTS[extras[0] - 1].color;
  var c2 = extras.length > 1 ? ELEMENTS[extras[1] - 1].color : "#cfe8ff";
  if (type === "water") return { type: "water", colors: ["#1e6fb8", "#0d4f8b", c0] };
  return { type: type, colors: [c0, shadeHex(c0, 0.45), c2] };
}

function customTypeName(type) {
  return type === "gas" ? "기체 행성" : type === "water" ? "물 행성" : "암석 행성";
}

function customEffectText(type) {
  return type === "gas" ? "기체 원소 생산 ×" + PLANET.gasBonus
    : type === "water" ? "모든 원소 생산 ×" + PLANET.waterBonus
    : "고체 원소 생산 ×" + PLANET.rockBonus;
}

function planetsSig() {
  return [
    state.planets.random.length,
    SOLAR_PLANETS.map(function (p) { return state.planets.solar[p.id] ? 1 : 0; }).join(""),
    state.planets.custom.length, customLimit(), state.planetResearched ? 1 : 0,
    EXOPLANETS.map(function (x) {
      return (state.planets.blueprints[x.id] ? "b" : "-") + (state.planets.special[x.id] ? "x" : "-");
    }).join(""),
    state.researched
  ].join("|");
}

function buildPlanets() {
  planetCanvases = [];

  // ----- 티어 1: 랜덤 행성 -----
  var rbox = el("random-built");
  rbox.innerHTML = "";
  state.planets.random.forEach(function (p, i) {
    var div = document.createElement("div");
    div.className = "built-planet";
    var bonus = state.planets.special.rogue ? RANDOM_PLANET.bonus * 2 : RANDOM_PLANET.bonus;
    div.innerHTML = '<canvas width="80" height="72"></canvas>' +
      '<div>' + ELEMENTS[p.elem - 1].sym + " ×" + bonus + '</div>' +
      '<div class="tip">' + ELEMENTS[p.elem - 1].name + " 생산 ×" + bonus + '</div>';
    rbox.appendChild(div);
    planetCanvases.push({ cv: div.querySelector("canvas"), look: p.look, seed: p.seed });
  });

  // ----- 티어 2: 태양계 행성 -----
  var grid = el("solar-planet-grid");
  grid.innerHTML = "";
  SOLAR_PLANETS.forEach(function (p, i) {
    var owned = !!state.planets.solar[p.id];
    var card = document.createElement("div");
    card.className = "planet-card" + (owned ? " owned" : "");
    card.innerHTML =
      '<canvas width="110" height="95"></canvas>' +
      '<div class="planet-name">' + p.name + '</div>' +
      '<div class="planet-desc">' + p.desc + '</div>' +
      (owned ? '<div class="iso-owned-tag">✓ 건설됨</div>'
             : '<div class="planet-cost" id="solar-cost-' + p.id + '"></div>' +
               '<button class="btn" id="solar-btn-' + p.id + '">건설</button>');
    grid.appendChild(card);
    planetCanvases.push({ cv: card.querySelector("canvas"), look: p.look, seed: 100 + i * 17 });
    if (!owned) {
      el("solar-btn-" + p.id).onclick = function () { buildSolarPlanet(p.id); updateUI(); };
    }
  });

  // ----- 티어 3: 커스텀 행성 -----
  var builtBox = el("custom-built");
  builtBox.innerHTML = "";
  state.planets.custom.forEach(function (p, i) {
    var look = customLook(p.extras);
    var div = document.createElement("div");
    div.className = "built-planet";
    var syms = p.extras.map(function (n) { return ELEMENTS[n - 1].sym; }).join("·");
    div.innerHTML =
      '<button class="del-btn" title="행성 파괴">✕</button>' +
      '<canvas width="90" height="80"></canvas>' +
      '<div>' + customTypeName(p.type) + '<br>(' + syms + ')</div>' +
      '<div class="tip">' + customEffectText(p.type) + '</div>';
    builtBox.appendChild(div);
    planetCanvases.push({ cv: div.querySelector("canvas"), look: look, seed: 900 + i * 53 });
    div.querySelector(".del-btn").onclick = function () {
      if (confirm("이 행성을 파괴할까요? 재료는 돌려받지 못합니다.")) {
        deleteCustomPlanet(i);
        updateUI();
      }
    };
  });

  // ----- 티어 4: 특이 행성 (블라인드) -----
  var exo = el("exo-list");
  exo.innerHTML = "";
  EXOPLANETS.forEach(function (x, i) {
    var hasBp = !!state.planets.blueprints[x.id];
    var built = !!state.planets.special[x.id];
    var card = document.createElement("div");
    card.className = "planet-card" + (built ? " owned" : "") + (!hasBp ? " blind" : "");
    var inner = '<canvas width="110" height="95"></canvas>';
    if (!hasBp) {
      inner +=
        '<div class="planet-name">???</div>' +
        '<div class="planet-nick">미확인 신호 #' + (i + 1) + '</div>' +
        '<div class="planet-desc">청사진을 해독하면 정체가 밝혀집니다.</div>' +
        '<div class="planet-cost" id="exo-cost-' + x.id + '"></div>' +
        '<button class="btn" id="exo-btn-' + x.id + '">청사진 해독</button>';
    } else if (!built) {
      inner +=
        '<div class="planet-name">' + x.name + '</div>' +
        '<div class="planet-nick">' + x.nick + '</div>' +
        '<div class="planet-desc">' + x.lore + '<br><i>건설하면 효과가 밝혀집니다.</i></div>' +
        '<div class="planet-cost" id="exo-cost-' + x.id + '"></div>' +
        '<button class="btn" id="exo-btn-' + x.id + '">건설</button>';
    } else {
      inner +=
        '<div class="planet-name">' + x.name + '</div>' +
        '<div class="planet-nick">' + x.nick + '</div>' +
        '<div class="planet-desc">' + x.lore + '</div>' +
        '<div class="planet-effect">✦ ' + x.effect + '</div>' +
        '<div class="iso-owned-tag">✓ 건설됨</div>';
    }
    card.innerHTML = inner;
    exo.appendChild(card);
    planetCanvases.push({
      cv: card.querySelector("canvas"),
      look: hasBp ? x.look : { type: "dark", colors: ["#14121c", "#0a0910", "#2a2438"] },
      seed: 500 + i * 31
    });
    var btn = card.querySelector("button");
    if (btn) {
      btn.onclick = function () {
        if (!state.planets.blueprints[x.id]) buyBlueprint(x.id);
        else buildExoplanet(x.id);
        updateUI();
      };
    }
  });
}

function buildCustomChips() {
  var box = el("custom-chips");
  box.innerHTML = "";
  for (var n = 1; n <= state.researched; n++) {
    (function (n) {
      var e = ELEMENTS[n - 1];
      var chip = document.createElement("button");
      chip.className = "chip" + (selExtras.indexOf(n) >= 0 ? " sel" : "");
      chip.innerHTML = e.sym + " " + e.name + (isGasElement(n) ? ' <span class="gas-tag">기체</span>' : "");
      chip.onclick = function () {
        var i = selExtras.indexOf(n);
        if (i >= 0) selExtras.splice(i, 1);
        else if (selExtras.length < 3) selExtras.push(n);
        buildCustomChips();
        updatePlanets();
      };
      box.appendChild(chip);
    })(n);
  }
}

function updatePlanets() {
  var s = planetsSig();
  if (sig.planets !== s) {
    buildPlanets();
    buildCustomChips();
    sig.planets = s;
  }

  // 티어 1
  el("txt-random-max").textContent = RANDOM_PLANET.max;
  var rFull = state.planets.random.length >= RANDOM_PLANET.max;
  if (rFull) {
    el("txt-random-cost").innerHTML = '<span class="cost-item ok">한도 도달 (' + RANDOM_PLANET.max + '/' + RANDOM_PLANET.max + ')</span>';
    el("btn-random-planet").disabled = true;
  } else {
    var rc = randomPlanetCost();
    el("txt-random-cost").innerHTML = costHTML(rc);
    el("btn-random-planet").disabled = !canAfford(rc);
  }

  // 티어 2 비용
  SOLAR_PLANETS.forEach(function (p) {
    if (state.planets.solar[p.id]) return;
    var cost = solarPlanetCost(p);
    var cEl = el("solar-cost-" + p.id);
    if (cEl) cEl.innerHTML = costHTML(cost);
    var bEl = el("solar-btn-" + p.id);
    if (bEl) bEl.disabled = !canAfford(cost);
  });

  // 티어 3
  el("txt-custom-limit").textContent = state.planets.custom.length + " / " + customLimit();
  setHidden("custom-locked", state.planetResearched);
  setHidden("custom-open", !state.planetResearched);
  if (!state.planetResearched) {
    var pr = { entropy: D(PLANET.researchCost) };
    var btn = el("btn-planet-research");
    btn.textContent = "행성 공학 연구 — " + format(pr.entropy, 1) + " E";
    btn.disabled = !canAfford(pr);
  } else {
    if (selExtras.length === 0) {
      el("txt-custom-type").textContent = "원소를 선택하세요";
      el("txt-custom-cost").innerHTML = "";
      el("btn-build-custom").disabled = true;
    } else {
      var type = planetTypeOf(selExtras);
      el("txt-custom-type").textContent = customTypeName(type) + " — " + customEffectText(type);
      var cost = customPlanetCost(selExtras);
      el("txt-custom-cost").innerHTML = costHTML(cost);
      el("btn-build-custom").disabled = !canAfford(cost) || state.planets.custom.length >= customLimit();
    }
  }

  // 티어 4 비용
  EXOPLANETS.forEach(function (x) {
    if (state.planets.special[x.id]) return;
    var cEl = el("exo-cost-" + x.id), bEl = el("exo-btn-" + x.id);
    if (!cEl || !bEl) return;
    var cost = state.planets.blueprints[x.id]
      ? exoBuildCost(x)
      : { neutron: x.blueprint.neutron, entropy: D(x.blueprint.entropy) };
    cEl.innerHTML = costHTML(cost);
    bEl.disabled = !canAfford(cost);
  });
}

// ============================================================
// 태양계
// ============================================================

function updateSolar() {
  setHidden("solar-locked", state.solarSystem);
  setHidden("solar-formed", !state.solarSystem);
  if (!state.solarSystem) {
    var lv = state.star ? state.star.level : 0;
    el("txt-solar-req-lv").innerHTML = lv >= STAR.solarLevel
      ? '<span style="color:var(--green)">Lv ' + lv + " / " + STAR.solarLevel + " ✓</span>"
      : "Lv " + lv + " / " + STAR.solarLevel;
    var pc = solarPlanetCount();
    el("txt-solar-req-pl").innerHTML = pc >= 9
      ? '<span style="color:var(--green)">' + pc + " / 9 ✓</span>"
      : pc + " / 9";
    el("btn-form-solar").disabled = !canFormSolarSystem();
  } else {
    el("txt-solar-mult").textContent = "×" + format(D(SOLAR_SYSTEM.mult), 0);
  }
}

// ============================================================
// 설정
// ============================================================

function updateSettings() {
  el("txt-playtime").textContent = formatTime(state.playtime);
  el("txt-total-e").textContent = format(state.totalEntropy.floor());
  el("txt-last-save").textContent = lastSaveTime > 0
    ? "마지막 저장: " + formatTime((Date.now() - lastSaveTime) / 1000) + " 전" : "";
  var ticks = offlineMaxTicks();
  el("txt-offline-info").textContent =
    "현재 최대 " + ticks.toLocaleString("en-US") + "틱 = 약 " +
    formatTime(ticks * SYSTEM.tickSeconds) + " (동위원소·행성 보너스 포함)";
  el("txt-speed").textContent = "×" + state.settings.gameSpeed;
  document.querySelectorAll(".dev-speed").forEach(function (b) {
    b.classList.toggle("on", Number(b.dataset.speed) === state.settings.gameSpeed);
  });
}

// ============================================================
// 전체 갱신
// ============================================================

function updateUI() {
  updateNav();
  updateHeader();
  if (activeTab === "main") updateGens();
  else if (activeTab === "elements") { updateFusion(); updateResearch(); updateElemGrid(); updateSpecials(); }
  else if (activeTab === "isotopes") updateIsotopes();
  else if (activeTab === "star") updateStar();
  else if (activeTab === "planets") updatePlanets();
  else if (activeTab === "solar") updateSolar();
  else if (activeTab === "settings") updateSettings();
}

// ============================================================
// 캔버스 애니메이션
// ============================================================

var lastPlanetDraw = 0;
function animateCanvases(ts) {
  requestAnimationFrame(animateCanvases);
  var t = ts / 1000;

  if (activeTab === "star" && state.star) {
    drawStar(el("cv-star"), state.star.temp, state.star.level, t);
  }
  if (activeTab === "solar" && state.solarSystem) {
    drawSolarSystem(el("cv-solar"), state.star ? state.star.temp : 5778, t);
  }
  if (activeTab === "planets" && ts - lastPlanetDraw > 66) {
    lastPlanetDraw = ts;
    planetCanvases.forEach(function (p) {
      if (p.cv.isConnected) drawPlanet(p.cv, p.look, t, p.seed);
    });
    if (state.planetResearched && selExtras.length > 0) {
      drawPlanet(el("cv-custom-preview"), customLook(selExtras), t, 1000);
    } else if (state.planetResearched) {
      var pcv = el("cv-custom-preview");
      pcv.getContext("2d").clearRect(0, 0, pcv.width, pcv.height);
    }
  }
}

// ============================================================
// 초기화
// ============================================================

function initUI() {
  document.querySelectorAll(".side-btn").forEach(function (b) {
    b.onclick = function () { switchTab(b.dataset.tab); };
  });

  buildGenList();

  el("btn-maxbuy").onclick = function () { maxBuyAll(); updateUI(); };

  // 자동 업그레이드
  el("btn-autoup-unlock").onclick = function () { unlockAutoUp(); updateUI(); };
  el("btn-autoup-step").onclick = function () { buyAutoUpStep(); updateUI(); };
  el("chk-autoup").onchange = function () { state.autoUp.on = this.checked; };

  // 원소
  el("btn-fusion").onclick = function () { buyFusion(); updateUI(); };
  el("btn-fusion-max").onclick = function () { buyFusionMax(); updateUI(); };
  el("chk-auto-fusion").onchange = function () { state.autoFusion = this.checked; };
  document.querySelectorAll("[data-track]").forEach(function (b) {
    b.onclick = function () {
      if (b.dataset.max === "1") buyTrackMax(b.dataset.track);
      else buyTrack(b.dataset.track);
      updateUI();
    };
  });
  el("btn-research").onclick = function () { researchNext(); updateUI(); };

  // 항성
  el("btn-ignite").onclick = function () { if (createStar()) switchTab("star"); updateUI(); };
  el("rng-temp").oninput = function () { setStarTemp(Number(this.value)); updateStar(); };
  el("btn-star-lv").onclick = function () { buyStarLevel(); updateUI(); };
  el("btn-star-max").onclick = function () { buyStarLevelMax(); updateUI(); };

  // 행성
  el("btn-random-planet").onclick = function () { buildRandomPlanet(); updateUI(); };
  el("btn-planet-research").onclick = function () { researchPlanet(); updateUI(); };
  el("btn-build-custom").onclick = function () {
    if (buildCustomPlanet(selExtras)) { selExtras = []; }
    updateUI();
  };

  // 태양계
  el("btn-form-solar").onclick = function () { formSolarSystem(); updateUI(); };

  // 설정
  el("btn-save").onclick = function () { saveGame(); lastSaveTime = Date.now(); updateUI(); };
  el("btn-export").onclick = exportSave;
  el("btn-import").onclick = importSave;
  el("btn-reset").onclick = hardReset;
  el("chk-autosave").onchange = function () { state.settings.autosave = this.checked; };
  el("chk-kmb").onchange = function () { state.settings.notation = this.checked ? "kmb" : "sci"; };
  el("inp-offline").value = state.settings.offlineMaxTicks;
  el("btn-offline-apply").onclick = function () {
    var v = Number(el("inp-offline").value);
    if (v >= 1000) { state.settings.offlineMaxTicks = v; updateSettings(); }
  };
  el("chk-dev").onchange = function () {
    state.settings.devMode = this.checked;
    if (!this.checked) state.settings.gameSpeed = 1;
    setHidden("dev-tools", !this.checked);
    updateSettings();
  };
  document.querySelectorAll(".dev-speed").forEach(function (b) {
    b.onclick = function () { state.settings.gameSpeed = Number(b.dataset.speed); updateSettings(); };
  });

  el("chk-autosave").checked = state.settings.autosave;
  el("chk-kmb").checked = state.settings.notation === "kmb";
  el("chk-dev").checked = state.settings.devMode;
  setHidden("dev-tools", !state.settings.devMode);

  requestAnimationFrame(animateCanvases);
}

function showOfflineToast(seconds, gained) {
  var ticks = Math.floor(seconds / SYSTEM.tickSeconds);
  el("offline-text").textContent =
    "오프라인 " + formatTime(seconds) + " (" + ticks.toLocaleString("en-US") + "틱) 동안 Entropy +" + format(gained) + " E";
  el("offline-toast").classList.remove("hidden");
}
