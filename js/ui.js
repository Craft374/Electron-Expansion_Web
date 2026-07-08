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
  setHidden("nav-synthesis", !synthUnlocked());
  setHidden("nav-isotopes", state.researched < 2);
  setHidden("nav-automation", state.researched < 1);
  setHidden("nav-compression", !compressUnlocked());
  setHidden("badge-compression", !canCompress());
  setHidden("nav-challenge", state.researched < 2 && !chActive() &&
    !CHALLENGES.some(function (c) { return state.challenge.completed[c.id]; }));
  setHidden("nav-star", state.researched < ELEMENTS.length);
  setHidden("nav-planets", !state.star);
  var solarVisible = state.solarSystem ||
    (state.star && (solarPlanetCount() >= SOLAR_PLANETS.length || state.star.level >= STAR.solarLevel));
  setHidden("nav-solar", !solarVisible);

  // 알림 배지: 연구 가능 / 동위원소 합성 가능
  var rc = researchCost();
  setHidden("badge-elements", !(rc && canAfford(rc)));
  var isoReady = false;
  ISOTOPES.forEach(function (iso) {
    if (!state.isotopes[iso.id] && state.researched >= iso.req &&
        canAfford({ neutron: iso.cost.neutron, entropy: D(iso.cost.entropy) })) isoReady = true;
  });
  setHidden("badge-isotopes", !isoReady);

  var synthReady = false;
  if (synthUnlocked()) {
    for (var ci = 0; ci < COMPOUNDS.length; ci++) {
      var c = COMPOUNDS[ci];
      if (compoundResearchable(c) && synthLevel(c.id) === 0 && canAfford(synthCost(c))) { synthReady = true; break; }
    }
  }
  setHidden("badge-synthesis", !synthReady);
}

// 지수 표기(AeB)에 마우스를 올리면 정확한 개수 표시 (너무 크면 미표시)
function setExactTitle(elm, value, suffix) {
  if (!elm) return;
  var ex = formatExact(value);
  if (ex !== null) { elm.title = ex + (suffix || ""); elm.classList.add("exact"); }
  else { elm.title = ""; elm.classList.remove("exact"); }
}

function updateHeader() {
  var eNum = el("txt-entropy");
  eNum.textContent = format(state.entropy.floor());
  setExactTitle(eNum, state.entropy.floor(), " E");
  el("txt-erate").textContent = format(entropyRateDisplay(), 1);
  el("txt-goal").textContent = currentGoal();
  updateSideRes();
}

// ----- 사이드바 상단 자원 표시 -----
var SIDE_RES_LIST = [
  { k: "entropy",  lb: "E",     avail: function () { return true; },
    val: function () { return state.entropy.floor(); }, suf: " E" },
  { k: "electron", lb: "전자",   avail: function () { return genVisible("electron"); },
    val: function () { return state.particles.electron.floor(); }, suf: " 개" },
  { k: "proton",   lb: "양성자", avail: function () { return genVisible("proton"); },
    val: function () { return state.particles.proton.floor(); }, suf: " 개" },
  { k: "neutron",  lb: "중성자", avail: function () { return genVisible("neutron"); },
    val: function () { return state.particles.neutron.floor(); }, suf: " 개" },
  { k: "element",  lb: "원소",   avail: function () { return state.researched >= 1; },
    val: function () { return state.elements[state.researched - 1].floor(); }, suf: " 개",
    lbDyn: function () { return ELEMENTS[state.researched - 1].sym; } }
];

function activeSideRes() {
  var sr = state.settings.sideRes || { entropy: true };
  return SIDE_RES_LIST.filter(function (o) { return sr[o.k] && o.avail(); });
}

function updateSideRes() {
  var list = activeSideRes();
  var s = list.map(function (o) { return o.k; }).join(",");
  var box = el("side-res");
  if (sig.sideRes !== s) {
    box.innerHTML = list.map(function (o) {
      return '<div class="sr-row' + (o.k === "entropy" ? " big" : "") + '">' +
        '<span class="sr-lb" id="sr-lb-' + o.k + '">' + o.lb + '</span>' +
        '<span class="sr-val" id="sr-val-' + o.k + '"></span></div>';
    }).join("");
    sig.sideRes = s;
  }
  list.forEach(function (o) {
    var v = o.val();
    var vEl = el("sr-val-" + o.k);
    if (vEl) { vEl.textContent = format(v); setExactTitle(vEl, v, o.suf); }
    if (o.lbDyn) { var lEl = el("sr-lb-" + o.k); if (lEl) lEl.textContent = o.lbDyn(); }
  });
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
      setExactTitle(el("gen-stat-" + k), state.particles[k].floor(), " 개");
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
      var gain = state.particles[k].floor().mul(CONVERTERS[k].value).mul(compConvMult());
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
      // "→"를 다음 업그레이드 값으로 오해하지 않도록 명확히 표기하고, 다음 레벨 처리량을 함께 표시
      var eOut = convRate(k).mul(CONVERTERS[k].value);
      var nextConv = convRate(k).mul(CONV_RATE_GROW);
      el("conv-stat-" + k).innerHTML =
        "자동 변환 처리량: 초당 <b>" + format(convRate(k), 1) + "</b>개 (= " + format(eOut, 1) + " E)" +
        ' <span style="color:var(--dim)">· 다음 레벨 초당 ' + format(nextConv, 1) + "개</span>";
      var chk = el("conv-on-" + k);
      if (chk.checked !== state.convOn[k]) chk.checked = state.convOn[k];
    }
  });

  // 엔트로피 희생 패널
  updateSacrifice();
}

// ============================================================
// 엔트로피 희생
// ============================================================
function updateSacrifice() {
  var vis = sacUnlocked();
  setHidden("panel-sacrifice", !vis);
  if (!vis) return;
  el("txt-sac-mult").textContent = "×" + format(sacNeutronMult(), 2);
  var f = sacrificeGainFactor();
  el("txt-sac-gain").textContent = "중성자 생성기 ×" + f.toFixed(4) +
    " → 누적 ×" + format(sacNeutronMult().mul(f), 2);
  var rec = sacRecovery();
  if (rec >= 1) {
    el("txt-sac-recovery").textContent = "정상 (희생 가능)";
  } else {
    el("txt-sac-recovery").textContent = Math.floor(rec * 100) + "% 복구 중… (완전 복구 후 희생 가능)";
  }
  el("btn-sacrifice").disabled = !canSacrifice();
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
    setExactTitle(el("elem-amt-" + n), state.elements[n - 1].floor(), " 개");
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

  // 붕괴 프레스티지
  setHidden("panel-collapse", state.stellar.permanent);
  if (!state.stellar.permanent) {
    el("txt-collapse-req").textContent = STAR.collapseLevel;
    el("txt-collapse-perm").textContent = STAR.permanentAt;
    el("txt-collapse-count").textContent = state.stellar.collapses;
    el("txt-collapse-bonus").textContent = format(starBonusMult(), 2);
    var cbtn = el("btn-collapse");
    var willPerm = collapseIsPermanent();
    cbtn.textContent = collapseAvailable()
      ? (willPerm ? "✦ 붕괴 → 영구 항성" : "✦ 중력 붕괴 (다음 보너스 ×" + STAR.collapseBonus + ")")
      : "Lv " + STAR.collapseLevel + " 이상에서 붕괴 가능";
    cbtn.disabled = !collapseAvailable();
  }
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

  // 티어 점진 공개: 티어1은 처음부터, 이후 태양 레벨 50당 하나씩 공개
  var lv = state.star ? state.star.level : 0;
  setHidden("planet-tier2", lv < 50);
  setHidden("panel-custom", lv < 100);
  setHidden("planet-tier4", lv < 150);

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
// 도전과제 탭 + 토스트
// ============================================================

function achSig() {
  return ACHIEVEMENTS.map(function (a) { return state.achievements[a.id] ? 1 : 0; }).join("") +
    "|" + ACH_ROWS.map(function (r) { return achRowDone(r.row) ? 1 : 0; }).join("");
}

function buildAch() {
  var box = el("ach-rows");
  box.innerHTML = "";
  ACH_ROWS.forEach(function (rw) {
    var got = achRowDone(rw.row);
    var tiles = ACHIEVEMENTS.filter(function (a) { return a.row === rw.row; }).map(function (a) {
      var done = !!state.achievements[a.id];
      var effLine = a.eff && a.eff !== "효과 없음"
        ? '<div class="tt-eff">효과: ' + a.eff + '</div>'
        : (a.eff === "효과 없음" ? '<div class="tt-cond">효과 없음</div>' : '');
      return '<div class="ach-tile' + (done ? " done" : "") + '">' +
        '<div class="at-ic">' + a.icon + '</div>' +
        '<div class="at-nm">' + a.name + '</div>' +
        '<div class="at-tip"><div class="tt-nm">' + a.icon + ' ' + a.name + '</div>' +
          '<div class="tt-cond">' + a.cond + '</div>' + effLine +
          (done ? '<div class="tt-done">✓ 달성</div>' : '') + '</div></div>';
    }).join("");
    var block = document.createElement("div");
    block.className = "ach-rowblock";
    block.innerHTML =
      '<div class="ach-rowhead"><span>' + rw.row + '줄</span>' +
      '<span class="ach-reward' + (got ? " got" : "") + '">줄 보상: ' + rw.reward + (got ? " ✓" : "") + '</span></div>' +
      '<div class="ach-grid">' + tiles + '</div>';
    box.appendChild(block);
  });
}

function updateAch() {
  var count = 0;
  ACHIEVEMENTS.forEach(function (a) { if (state.achievements[a.id]) count++; });
  el("txt-ach-count").textContent = count + " / " + ACHIEVEMENTS.length;
  var s = achSig();
  if (sig.ach !== s) { buildAch(); sig.ach = s; }
}

function drainAchToasts() {
  if (!achToastQueue.length) return;
  var box = el("ach-toasts");
  while (achToastQueue.length) {
    var t = achToastQueue.shift();
    var div = document.createElement("div");
    div.className = "ach-toast";
    div.innerHTML = '<div class="ach-ic">' + t.icon + '</div>' +
      '<div class="ach-txt"><div class="ach-top">' + t.top + '</div>' +
      '<div class="ach-nm">' + t.name + '</div></div>';
    box.appendChild(div);
    (function (d) { setTimeout(function () { d.remove(); }, 5000); })(div);
  }
}

// ============================================================
// 주기별 도전 탭
// ============================================================
function chSig() {
  return (chActive() || "-") + "|" + CHALLENGES.map(function (c) {
    return (state.challenge.completed[c.id] ? "1" : "0") + (challengeUnlocked(c) ? "u" : "-");
  }).join("");
}
function buildChallenges() {
  var box = el("challenge-list");
  box.innerHTML = CHALLENGES.map(function (c) {
    var done = !!state.challenge.completed[c.id];
    var unlocked = challengeUnlocked(c);
    var active = chActive() === c.id;
    var cls = "iso-card" + (done ? " owned" : "") + (active ? " ch-active" : "");
    var btn;
    if (active) btn = '<button class="btn danger" id="ch-btn-' + c.id + '">포기하고 나가기</button>';
    else if (!unlocked) btn = '<div class="iso-owned-tag" style="color:var(--dim)">🔒 ' + ELEMENTS[CHALLENGE_PERIODS[c.period][1] - 1].name + '까지 필요</div>';
    else if (done) btn = '<div class="iso-owned-tag">✓ 클리어</div>' +
      '<button class="btn" id="ch-btn-' + c.id + '">재도전</button>';
    else btn = '<button class="btn" id="ch-btn-' + c.id + '">도전 시작</button>';
    return '<div class="' + cls + '">' +
      '<div class="iso-name">' + c.period + '주기 · ' + c.name + (active ? ' <span style="color:var(--purple)">진행 중</span>' : '') + '</div>' +
      '<div class="iso-desc">' + c.desc + '</div>' +
      '<div class="iso-desc" style="color:var(--cyan)">목표: ' + c.goalDesc + '</div>' +
      '<div class="iso-desc" style="color:var(--green)">보상: ' + c.reward + '</div>' +
      (active && c.id === "ch3" ? '<div class="iso-desc">반물질: <b id="ch-am">' + '</b> / 1.8e308</div>' : '') +
      btn + '</div>';
  }).join("");
  CHALLENGES.forEach(function (c) {
    var b = el("ch-btn-" + c.id);
    if (!b) return;
    b.onclick = function () {
      if (chActive() === c.id) exitChallenge(false);
      else if (challengeUnlocked(c) && !chActive()) {
        if (confirm("도전을 시작하면 원소 진행이 리셋됩니다. 진행할까요?")) enterChallenge(c.id);
      }
      updateUI();
    };
  });
}
function updateChallenges() {
  var s = chSig();
  if (sig.ch !== s) { buildChallenges(); sig.ch = s; }
  el("txt-ch-active").textContent = chActive()
    ? (findChallenge(chActive()).period + "주기 진행 중") : "";
  var am = el("ch-am");
  if (am) am.textContent = format(state.challenge.antimatter, 2);
}

// ============================================================
// 합성 탭
// ============================================================
function synthSig() {
  return state.researched + "|" + COMPOUNDS.map(function (c) { return synthLevel(c.id); }).join(",");
}
function boostText(cmp) {
  return cmp.e.map(function (n) { return ELEMENTS[n - 1].sym; }).join("·");
}
function buildSynth() {
  var box = el("synth-list");
  var html = "";
  COMPOUNDS.forEach(function (c) {
    var researchable = compoundResearchable(c);
    var need = c.e.map(function (n) { return ELEMENTS[n - 1].sym; }).join(", ");
    if (!researchable) {
      html += '<div class="synth-card locked"><div class="synth-f">???</div>' +
        '<div class="synth-n">미해금</div>' +
        '<div class="synth-need">' + need + ' 연구 필요</div></div>';
      return;
    }
    html += '<div class="synth-card" id="synth-card-' + c.id + '">' +
      '<div class="synth-f">' + c.f + '</div>' +
      '<div class="synth-n">' + c.n + ' <small id="synth-lv-' + c.id + '"></small></div>' +
      '<div class="synth-boost">강화: ' + boostText(c) + ' ×<span id="synth-eff-' + c.id + '"></span></div>' +
      '<div class="cost-line" id="synth-cost-' + c.id + '"></div>' +
      '<button class="btn" id="synth-buy-' + c.id + '"></button></div>';
  });
  box.innerHTML = html;
  COMPOUNDS.forEach(function (c) {
    var b = el("synth-buy-" + c.id);
    if (b) b.onclick = function () { buySynth(c.id); updateUI(); };
  });
}
function updateSynth() {
  var s = synthSig();
  if (sig.synth !== s) { buildSynth(); sig.synth = s; }
  var count = 0, total = 0;
  COMPOUNDS.forEach(function (c) {
    if (compoundResearchable(c)) total++;
    if (synthLevel(c.id) > 0) count++;
    if (!compoundResearchable(c)) return;
    var lv = synthLevel(c.id);
    var lvEl = el("synth-lv-" + c.id);
    if (!lvEl) return;
    lvEl.textContent = lv > 0 ? "Lv " + lv : "";
    el("synth-eff-" + c.id).textContent = format(Decimal.pow(SYNTH.effect, lv), 2);
    var cost = synthCost(c);
    el("synth-cost-" + c.id).innerHTML = costHTML(cost);
    var btn = el("synth-buy-" + c.id);
    btn.textContent = lv === 0 ? "합성" : "강화 →Lv" + (lv + 1);
    btn.disabled = !canAfford(cost);
  });
  el("txt-synth-count").textContent = count + " / " + total;
}

// ============================================================
// 핵 압축 탭
// ============================================================
function buildCompUps() {
  var box = el("comp-up-list");
  box.innerHTML = COMP_UPGRADES.map(function (u) {
    return '<div class="iso-card">' +
      '<div class="iso-name">' + u.name + ' <small id="comp-lv-' + u.id + '" style="color:var(--dim)"></small></div>' +
      '<div class="iso-desc">' + u.desc + '</div>' +
      '<div class="cost-line" id="comp-cost-' + u.id + '"></div>' +
      '<button class="btn" id="comp-buy-' + u.id + '">강화</button></div>';
  }).join("");
  COMP_UPGRADES.forEach(function (u) {
    el("comp-buy-" + u.id).onclick = function () { buyCompUp(u.id); updateUI(); };
  });
}
function updateCompression() {
  if (!sig.compBuilt) { buildCompUps(); sig.compBuilt = true; }
  el("txt-cp").textContent = format(state.compression.cp, 0);
  el("txt-cp-total").textContent = format(state.compression.totalCp, 0);
  el("txt-cp-resets").textContent = state.compression.resets;
  el("txt-cp-gain").textContent = format(compressGain(), 0);
  el("btn-compress").disabled = !canCompress();
  COMP_UPGRADES.forEach(function (u) {
    el("comp-lv-" + u.id).textContent = "Lv " + compUp(u.id);
    var cost = compUpCost(u.id);
    el("comp-cost-" + u.id).innerHTML =
      '<span class="cost-item ' + (state.compression.cp.gte(cost) ? "ok" : "no") + '">' +
      format(cost, 0) + ' CP</span>';
    el("comp-buy-" + u.id).disabled = state.compression.cp.lt(cost);
  });
}

// ============================================================
// 자동화 탭
// ============================================================

function autoSig() {
  return AUTO_TARGETS.filter(autoTargetVisible).map(function (t) { return t.key; }).join(",");
}

function buildAuto() {
  var box = el("auto-list");
  var vis = AUTO_TARGETS.filter(autoTargetVisible);
  box.innerHTML = vis.map(function (t) {
    return '<div class="auto-card">' +
      '<div class="ac-head"><span class="ac-name">' + t.name + '</span>' +
      '<label class="switch"><input type="checkbox" id="auto-on-' + t.key + '"> 가동</label></div>' +
      '<div class="ac-delay">딜레이 <b id="auto-delay-' + t.key + '"></b> · <span id="auto-lvtxt-' + t.key + '"></span></div>' +
      '<div class="cost-line" id="auto-cost-' + t.key + '"></div>' +
      '<div class="btn-row"><button class="btn" id="auto-step-' + t.key + '">단축</button>' +
      '<button class="btn" id="auto-max-' + t.key + '">최대</button></div></div>';
  }).join("") || '<div class="panel-sub">아직 자동화할 항목이 없습니다.</div>';
  vis.forEach(function (t) {
    el("auto-on-" + t.key).onchange = function () { state.autos[t.key].on = this.checked; };
    el("auto-step-" + t.key).onclick = function () { buyAutoStep(t.key); updateUI(); };
    el("auto-max-" + t.key).onclick = function () { buyAutoStepMax(t.key); updateUI(); };
  });
}

function updateAuto() {
  var s = autoSig();
  if (sig.auto !== s) { buildAuto(); sig.auto = s; }
  var toggleBtn = el("btn-auto-all-toggle");
  if (toggleBtn) toggleBtn.textContent = allAutoOn() ? "전체 정지" : "전체 가동";
  AUTO_TARGETS.filter(autoTargetVisible).forEach(function (t) {
    var a = state.autos[t.key];
    var d = autoDelay(a.level);
    el("auto-delay-" + t.key).textContent = d <= 0 ? "상시(0초)" : d.toFixed(2) + "초";
    el("auto-lvtxt-" + t.key).textContent = "단축 " + a.level + " / " + AUTO_MAX_LEVEL;
    var stepEl = el("auto-step-" + t.key), costEl = el("auto-cost-" + t.key), maxEl = el("auto-max-" + t.key);
    if (a.level >= AUTO_MAX_LEVEL) {
      costEl.innerHTML = '<span class="cost-item ok">최대 단축 (상시)</span>';
      stepEl.disabled = true;
      if (maxEl) maxEl.disabled = true;
    } else {
      var c = autoStepCost(a.level);
      costEl.innerHTML = costHTML(c);
      stepEl.disabled = !canAfford(c);
      if (maxEl) maxEl.disabled = !canAfford(c);
    }
    var chk = el("auto-on-" + t.key);
    if (chk.checked !== a.on) chk.checked = a.on;
  });
}

// ============================================================
// 도움말 (스포일러 방지 — 현재 가능한 것만)
// ============================================================
function updateHelp() {
  var p = [];
  p.push('<p><b>◉ 엔트로피 (E)</b> — 기본 화폐입니다. 입자는 <b>변환기</b>를 거쳐야 E가 됩니다 (전자 1 · 양성자 10 · 중성자 100). 처음엔 수동 변환 버튼으로 시작하세요.</p>');
  p.push('<p><b>입자 생성기</b> — 전자 생성기는 무료입니다. 전자를 변환해 E를 모으면 양성자·중성자가 순서대로 해금됩니다. 변환기는 체크박스로 끄고 켤 수 있습니다.</p>');
  if (genVisible("neutron")) {
    p.push('<p><b>중성자</b> — 중성자는 연구·동위원소의 재료이기도 합니다. 변환기를 꺼서 중성자를 모아두는 판단이 중요합니다.</p>');
  }
  p.push('<p><b>★ 도전과제</b> — 조건을 만족하면 자동으로 달성되고, 우측 상단에 알림이 뜹니다. 한 줄을 모두 채우면 줄 보상을 받습니다.</p>');
  if (state.researched >= 1) {
    p.push('<p><b>⬡ 원소</b> — 수소부터 순서대로 연구합니다. 원소는 이전 원소로부터 자동 생산되고 보유량만큼 E를 만듭니다. 업그레이드: 융합 강화, 엔트로피 응축, 수소 선속, 입자 가속. 새 원소를 연구하면 업그레이드 상한이 풀립니다.</p>');
    p.push('<p><b>⟳ 자동화</b> — 생성기·변환기·원소 업그레이드를 자동 구매합니다. 딜레이를 단축할수록 자주 구매하며, 끝까지 단축하면 상시(0초) 구매가 됩니다.</p>');
  }
  if (state.researched >= 2) {
    p.push('<p><b>⧉ 동위원소</b> — 중성자를 소모해 합성하는 보조 아이템입니다. 할인·오프라인 확장·자동화 강화 등 다양한 도움을 줍니다.</p>');
  }
  if (sacUnlocked()) {
    p.push('<p><b>엔트로피 희생</b> — 현재 초당 E를 잠시 0으로 되돌리는 대신, 중성자 생성기에 영구 배율을 얻습니다. 중성자 생산이 느릴 때 유용합니다.</p>');
  }
  if (state.researched >= ELEMENTS.length) {
    p.push('<p><b>✦ 항성</b> — 철을 임계질량까지 모으면 항성이 점화됩니다. 항성은 E 생산을 크게 증폭하고 원소를 직접 만들어냅니다. 온도에 따라 강해지는 원소가 달라집니다.</p>');
  }
  if (state.star) {
    p.push('<p><b>◍ 행성</b> — 랜덤 → 태양계 → 커스텀 → 특이 행성 순으로 확장됩니다. 특이 행성은 청사진을 해독하기 전까진 정체를 알 수 없습니다.</p>');
  }
  p.push('<p><b>오프라인</b> — 게임을 꺼둔 동안에도 일정 시간까지 진행됩니다. 설정에서 최대 틱을 조절할 수 있습니다.</p>');
  el("help-text").innerHTML = p.join("");
}

function buildSideResOpts() {
  var box = el("side-res-opts");
  if (!box || box.dataset.built) return;
  box.innerHTML = SIDE_RES_LIST.map(function (o) {
    return '<label class="check"><input type="checkbox" data-sr="' + o.k + '"> ' +
      (o.k === "element" ? "최신 원소" : o.lb) + '</label>';
  }).join("");
  box.querySelectorAll("[data-sr]").forEach(function (inp) {
    var k = inp.dataset.sr;
    inp.checked = !!(state.settings.sideRes && state.settings.sideRes[k]);
    inp.onchange = function () {
      if (!state.settings.sideRes) state.settings.sideRes = {};
      state.settings.sideRes[k] = this.checked;
      updateSideRes();
    };
  });
  box.dataset.built = "1";
}

// ============================================================
// 전체 갱신
// ============================================================

function updateUI() {
  updateNav();
  updateHeader();
  drainAchToasts();
  if (activeTab === "main") updateGens();
  else if (activeTab === "ach") updateAch();
  else if (activeTab === "automation") updateAuto();
  else if (activeTab === "compression") updateCompression();
  else if (activeTab === "challenge") updateChallenges();
  else if (activeTab === "synthesis") updateSynth();
  else if (activeTab === "elements") { updateFusion(); updateResearch(); updateElemGrid(); updateSpecials(); }
  else if (activeTab === "isotopes") updateIsotopes();
  else if (activeTab === "star") updateStar();
  else if (activeTab === "planets") updatePlanets();
  else if (activeTab === "solar") updateSolar();
  else if (activeTab === "settings") updateSettings();
  else if (activeTab === "help") updateHelp();
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

  // 엔트로피 희생
  el("btn-sacrifice").onclick = function () {
    if (doSacrifice()) updateUI();
  };

  // 핵 압축
  el("btn-compress").onclick = function () {
    if (canCompress() && confirm("핵 압축을 실행할까요? 입자·생성기·변환기·E·원소 보유량이 리셋됩니다.")) {
      doCompress(); updateUI();
    }
  };

  // 자동화: 전체 최대 단축 / 전체 가동·정지
  el("btn-auto-all-max").onclick = function () { buyAllAutoMax(); updateUI(); };
  el("btn-auto-all-toggle").onclick = function () { setAllAuto(!allAutoOn()); updateUI(); };

  // 설정: 사이드바 표시 옵션
  buildSideResOpts();

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
  el("btn-collapse").onclick = function () {
    if (collapseAvailable() &&
        confirm("항성을 붕괴시킬까요? 원소·입자·항성·행성이 리셋되고 영구 배율을 얻습니다.")) {
      doCollapse(); updateUI();
    }
  };

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
