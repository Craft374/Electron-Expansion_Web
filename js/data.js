// ============================================================
// data.js — 밸런스 수치 & 게임 데이터 전부
// ⭐ 숫자를 바꾸고 싶으면 이 파일만 보면 됩니다.
// ============================================================

function D(x) { return new Decimal(x); }

// ---------- 입자 생성기 ----------
// rate = base × 레벨 × 1.18^(레벨-1)
var GENERATORS = {
  electron: { name: "전자 생성기",   base: 1.2, cost0: 0,    costMult: 1.9  },
  proton:   { name: "양성자 생성기", base: 0.6, cost0: 500,  costMult: 2.0  },
  neutron:  { name: "중성자 생성기", base: 0.3, cost0: 3000, costMult: 2.05, unlockProton: 150 }
};
var GEN_RATE_GROW = 1.18;
var GEN_ORDER = ["electron", "proton", "neutron"];

// ---------- 입자 → E 변환 ----------
// 입자는 변환해야만 E가 됩니다. 변환기는 입자별로 따로 구매.
// 변환기 속도 = base × 1.9^(레벨-1) (개/초)
var CONVERTERS = {
  electron: { name: "전자 변환기",   value: 1,   base: 2,   cost0: 50,    costMult: 2.2 },
  proton:   { name: "양성자 변환기", value: 10,  base: 1,   cost0: 1000,  costMult: 2.3 },
  neutron:  { name: "중성자 변환기", value: 100, base: 0.5, cost0: 8000,  costMult: 2.4 }
};
var CONV_RATE_GROW = 1.9;

// ---------- 원소 (수소 ~ 철, 26종) ----------
var ELEMENTS = [
  { sym: "H",  name: "수소",     color: "#7fd4ff" },
  { sym: "He", name: "헬륨",     color: "#ffd27f" },
  { sym: "Li", name: "리튬",     color: "#ff9e9e" },
  { sym: "Be", name: "베릴륨",   color: "#9effa8" },
  { sym: "B",  name: "붕소",     color: "#d4a373" },
  { sym: "C",  name: "탄소",     color: "#8d99ae" },
  { sym: "N",  name: "질소",     color: "#6fa8dc" },
  { sym: "O",  name: "산소",     color: "#ff6b6b" },
  { sym: "F",  name: "플루오린", color: "#b5e48c" },
  { sym: "Ne", name: "네온",     color: "#ff7bd5" },
  { sym: "Na", name: "나트륨",   color: "#ffd166" },
  { sym: "Mg", name: "마그네슘", color: "#a8dadc" },
  { sym: "Al", name: "알루미늄", color: "#ced4da" },
  { sym: "Si", name: "규소",     color: "#b08968" },
  { sym: "P",  name: "인",       color: "#ffba08" },
  { sym: "S",  name: "황",       color: "#ffe45e" },
  { sym: "Cl", name: "염소",     color: "#9ef01a" },
  { sym: "Ar", name: "아르곤",   color: "#b298dc" },
  { sym: "K",  name: "칼륨",     color: "#f4a261" },
  { sym: "Ca", name: "칼슘",     color: "#e9ecef" },
  { sym: "Sc", name: "스칸듐",   color: "#c9ada7" },
  { sym: "Ti", name: "타이타늄", color: "#adb5bd" },
  { sym: "V",  name: "바나듐",   color: "#94d2bd" },
  { sym: "Cr", name: "크로뮴",   color: "#a2d2ff" },
  { sym: "Mn", name: "망가니즈", color: "#e5989b" },
  { sym: "Fe", name: "철",       color: "#d08c60" }
];

var GAS_SET = [1, 2, 7, 9, 10, 17, 18];   // 기체 원소

// ---------- 원소 생산 ----------
// 항성 이전(역방향): 원소마다 원자번호가 클수록 작은 시드 + "위 원소가 아래 원소를 생산".
//                   → 수소가 제일 많고, 원자번호가 클수록 적어짐. (철은 최상위 = 가장 희소)
// 항성 이후(정방향): 낮은 원소가 높은 원소를 생산(원래 방식) → 철 수급 가능.
var ELEM = {
  h_base: 0.3,        // 최하위(또는 항성 후 수소) 기본 시드 (개/초)
  cascade: 0.04,      // 인접 원소 보유량의 4%/초가 이웃 원소로 흐름
  revDecay: 0.4,      // 역방향 시드: 원자번호당 시드 ×0.4 (클수록 희소)
  cap: "1.8e308",     // 항성 이전 원소 보유 상한 (항성 이후 해제)
  eBase: 3,           // 수소 1개당 초당 E
  eGrow: 6            // 원소 단계당 E 생산 ×6
};

// ---------- 원소 업그레이드 4종 ----------
// 1) 융합 강화: 원소 하나씩 순환하며 생산 ×1.5 (원소당 최대 50회)
var FUSION = {
  effect: 1.5,
  costBase: 4000,
  costMult: 2.7,        // 삼중수소 -0.2, 융합 촉진 -0.1 (최저 2.4)
  capPerElement: 50
};
// 2~4) 공통 업그레이드 트랙
var TRACKS = {
  condense: { name: "엔트로피 응축", desc: "모든 원소의 E 생산 ×1.25", effect: 1.25,
              capPer: 10, costBase: 1e5, costMult: 3.2 },
  hflux:    { name: "수소 선속",     desc: "수소 기본 생산 ×1.3",      effect: 1.3,
              capPer: 5,  costBase: 5e4, costMult: 4.0 },
  accel:    { name: "입자 가속",     desc: "입자 생성기 생산 ×1.5",    effect: 1.5,
              capPer: 4,  costBase: 2e4, costMult: 2.8 }
};
var TRACK_ORDER = ["condense", "hflux", "accel"];

// ---------- 원소 연구 비용 ----------
var RESEARCH_HYDROGEN = { proton: 150, electron: 600, entropy: 2000 };
var RESEARCH_TABLE = [
  null,
  { prev: 40, e: "5e3", n: 0 },   // He
  { prev: 500, e: "1e5", n: 200 },   // Li
  { prev: 7.5e4, e: "4e8", n: 2.5e5 },   // Be
  { prev: 6.5e7, e: "1.6e13", n: 1e8 },   // B
  { prev: 2.5e11, e: "6.5e18", n: 2e10 },   // C
  { prev: 2.6e15, e: "5.5e24", n: 4e12 },   // N
  { prev: 6e19, e: "1.6e31", n: 3e14 },   // O
  { prev: 1.4e24, e: "3.6e37", n: 1.5e15 },   // F
  { prev: 5.3e28, e: "3.7e44", n: 7.5e15 },   // Ne
  { prev: 2.3e33, e: "1.3e51", n: 4e16 },   // Na
  { prev: 1.35e38, e: "1.5e58", n: 2e17 },   // Mg
  { prev: 4.8e42, e: "1.4e64", n: 1e18 },   // Al
  { prev: 1.5e48, e: "1e72", n: 5e18 },   // Si
  { prev: 1.1e53, e: "1.3e79", n: 2.5e19 },   // P
  { prev: 7.8e57, e: "3e85", n: 1.2e20 },   // S
  { prev: 5.5e63, e: "1e93", n: 6e20 },   // Cl
  { prev: 3e69, e: "5.4e100", n: 3e22 },   // Ar
  { prev: 5.4e74, e: "9.5e107", n: 1.6e23 },   // K
  { prev: 9e79, e: "3.9e114", n: 8e23 },   // Ca
  { prev: "2.3e93", e: "1e133", n: 4e24 },   // Sc  (여기부터 간격이 길어짐)
  { prev: "1.2e107", e: "1e150", n: 2e25 },   // Ti
  { prev: "6.5e120", e: "1e170", n: 1e26 },   // V
  { prev: "7e134", e: "1e190", n: 5e26 },   // Cr
  { prev: "2.3e149", e: "1e212", n: 2.7e27 },   // Mn
  { prev: "1.7e164", e: "1e222", n: 1.4e28 }   // Fe
];

// 3일차 기준 자연 보유량 스케일 (비용 책정의 기준값)
var ELEM_SCALE = [
  "6e22", "4e29", "2e36", "6e42", "2e49", "6e55", "2e62", "3e68", "7e74",
  "1e81", "2e87", "3e93", "3e99", "4e105", "4e111", "4e117", "3e123", "2e129",
  "1e135", "5e140", "3e146", "2e152", "2e158", "1e164", "7e170", "4e180"
];

// ---------- 특수 연구 (원소를 소모하는 1회성 업그레이드) ----------
var SPECIALS = [
  { id: "degeneracy", name: "전자 축퇴압",   req: 3,  cost: { 3: "1e12" },
    desc: "전자 생성기 생산 ×10" },
  { id: "catalyst",   name: "촉매 순환",     req: 6,  cost: { 6: "1e26" },
    desc: "수소 생산 ×5" },
  { id: "reflux",     name: "엔트로피 역류", req: 8,  cost: { 8: "1e33" },
    desc: "모든 원소의 E 생산 ×3" },
  { id: "gasloop",    name: "기체 순환",     req: 10, cost: { 10: "1e40" },
    desc: "기체 원소 생산 ×3" },
  { id: "nstar",      name: "중성자 물질",   req: 14, cost: { 14: "1e60" },
    desc: "중성자 생성기 생산 ×10" },
  { id: "halffusion", name: "융합 촉진",     req: 16, cost: { 16: "1e66" },
    desc: "융합 강화 가격 상승률 -0.1" },
  { id: "crystal",    name: "금속 결정화",   req: 21, cost: { 20: "1e102" },
    desc: "스칸듐~철 생산 ×3" },
  { id: "site1", name: "행성 부지 확장 I",   req: 26, cost: { 26: "1e196" },
    desc: "커스텀 행성 한도 +1" },
  { id: "site2", name: "행성 부지 확장 II",  req: 26, cost: { 26: "1e199" },
    desc: "커스텀 행성 한도 +1" },
  { id: "site3", name: "행성 부지 확장 III", req: 26, cost: { 26: "1e202" },
    desc: "커스텀 행성 한도 +1" }
];

// ---------- 생성기 자동 업그레이드 ----------
// 딜레이(초)마다 생성기/변환기 중 제일 싼 레벨을 자동 구매
var AUTOUP = {
  unlockCost: { 5: "1e18" },                       // 붕소
  steps: [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2, 0.15, 0.1],
  stepCostElem: 6,                                  // 탄소
  stepCostBase: "1e25",
  stepCostMult: 50
};

// ---------- 핵 압축 (첫 프레스티지) ----------
// 입자·생성기·변환기·E·원소량을 리셋하고 압축 포인트(CP)를 얻는다.
// 연구(해금)와 각종 업그레이드는 유지된다. CP는 영구 강화에 쓴다.
var COMP = {
  reqResearched: 5,      // 붕소 이후 해금
  scale: "1e6",          // CP = (원소가치 / scale) ^ exp
  exp: 0.2,
  selfPerLevel: 0.002    // 원소 자기증식 업그레이드: 레벨당 +0.2%/초
};
var COMP_UPGRADES = [
  { id: "particle", name: "입자 응축", desc: "입자 생성기 생산 ×1.6 / 레벨",
    base: 2, mult: 2.2, effect: 1.6 },
  { id: "conv", name: "변환 효율", desc: "변환기 E 산출 ×1.6 / 레벨",
    base: 3, mult: 2.2, effect: 1.6 },
  { id: "self", name: "원소 자기증식", desc: "각 원소가 자기 자신을 +0.2%/초 추가 생산 / 레벨",
    base: 5, mult: 2.6 },
  { id: "start", name: "압축 관성", desc: "압축 후 전자 생성기 시작 레벨 +3 / 레벨",
    base: 4, mult: 3, effect: 3 }
];

// ---------- 동위원소 (간접 보조 아이템, 중성자 소모) ----------
var ISOTOPES = [
  { id: "h2",   name: "중수소 ²H",     req: 2,  cost: { neutron: 5e3,  entropy: "5e5" },
    desc: "원소 연구에 필요한 이전 원소 요구량 -25%" },
  { id: "he3",  name: "헬륨-3 ³He",    req: 2,  cost: { neutron: 5e7,  entropy: "5e13" },
    desc: "오프라인 최대 틱 ×4" },
  { id: "h3",   name: "삼중수소 ³H",   req: 3,  cost: { neutron: 1e9,  entropy: "1e19" },
    desc: "융합 강화 가격 상승률 -0.2" },
  { id: "c14",  name: "탄소-14 ¹⁴C",   req: 6,  cost: { neutron: 1e12, entropy: "1e40" },
    desc: "융합 강화 자동 구매 해금" },
  { id: "n15",  name: "질소-15 ¹⁵N",   req: 7,  cost: { neutron: 5e9,  entropy: "1e30" },
    desc: "원소 연구의 중성자 요구량 -50%" },
  { id: "o18",  name: "산소-18 ¹⁸O",   req: 8,  cost: { neutron: 1e13, entropy: "1e45" },
    desc: "원소 연구 E 비용 -30%" },
  { id: "ne22", name: "네온-22 ²²Ne",  req: 10, cost: { neutron: 1e14, entropy: "1e52" },
    desc: "생성기·변환기 가격 -30%" },
  { id: "al26", name: "알루미늄-26 ²⁶Al", req: 13, cost: { neutron: 1e16, entropy: "1e70" },
    desc: "자동 업그레이드 딜레이 -20%" },
  { id: "k40",  name: "칼륨-40 ⁴⁰K",   req: 19, cost: { neutron: 1e20, entropy: "1e105" },
    desc: "오프라인 최대 틱 ×2 (다른 효과와 중첩)" },
  { id: "ti44", name: "티타늄-44 ⁴⁴Ti", req: 22, cost: { neutron: 5e23, entropy: "1e140" },
    desc: "특수 연구 비용 -25%" },
  { id: "fe56", name: "철-56 ⁵⁶Fe",    req: 26, cost: { neutron: 1e28, entropy: "1e200" },
    desc: "항성 제작·레벨업 비용 -20%" },
  { id: "fe60", name: "철-60 ⁶⁰Fe",    req: 26, cost: { neutron: 3e28, entropy: "1e205" },
    desc: "행성 건설 비용 -25%" }
];

// ---------- 항성 ----------
var STAR = {
  // 역캐스케이드에서 낮은 원소는 풍부, 철(최상위)은 희소 → 낮은 원소 다량 + 철 소량
  recipe: { 1: "1e30", 2: "1e26", 6: "1e18", 8: "1e14", 14: "1e9", 26: "1e5" },
  multBase: 10,          // E 배율 = 10 × 레벨^1.2 × 온도효율
  starProdScale: 1e-10, // 원소 직접 생산 = 자연 보유량 스케일 × 이 값 × 레벨^1.2 × 온도효율
  levelPow: 1.2,
  levelCostFe: "1e7",    // 항성 이후 정방향이라 철 수급 가능
  levelCostMult: 1.12,
  maxLevel: 365,         // 태양 최대 레벨 (1년)
  tempMin: 2000,
  tempMax: 40000,        // KELT-9b 보유 시 +5000
  tempDefault: 5778,
  tempOptBase: 2500, tempOptStep: 1400, tempSigma: 9000,
  effMin: 0.25, effAmp: 1.25,
  solarLevel: 365
};

// ---------- 행성 (티어: 랜덤 → 태양계 → 커스텀 → 특이) ----------

// 티어 1: 랜덤 행성 — 무작위 원소 하나 생산 ×3
var RANDOM_PLANET = {
  base: { 8: "1e66", 14: "1e103", 26: "1e190" },
  costGrowth: 6,
  bonus: 3,
  max: 8            // 최대 보유 수
};

// 티어 3: 커스텀 행성
var PLANET = {
  researchCost: "1e215",
  base: { 8: "1e71", 12: "1e96", 14: "1e108", 26: "1e198" },
  extraScaleMult: 1e4,
  costGrowth: 8,
  gasBonus: 8,          // 기체 행성: 기체 원소 ×8
  rockBonus: 8,         // 암석 행성: 고체 원소 ×8
  waterBonus: 5,        // 물 행성: 모든 원소 ×5
  baseLimit: 2          // 기본 한도 (특수 연구로 +3까지)
};

// 티어 4: 특이 행성 (실존 외계행성) — 청사진 구매 전엔 블라인드
var EXOPLANETS = [
  { id: "cancri", name: "55 Cancri e", nick: "다이아몬드 행성",
    blueprint: { neutron: 1e29, entropy: "1e212" }, build: { 6: "1e46" },
    lore: "표면이 다이아몬드로 덮인 초고밀도 행성.",
    effect: "탄소 생산 ×25",
    look: { type: "lava", colors: ["#e8d9c0", "#b0926a", "#fff6e0"] } },
  { id: "hd189", name: "HD 189733 b", nick: "유리비의 행성",
    blueprint: { neutron: 2e29, entropy: "1e216" }, build: { 14: "3e88" },
    lore: "규소 유리 비가 초속 2km 옆바람으로 내리는 푸른 행성.",
    effect: "규소 생산 ×25",
    look: { type: "gas", colors: ["#2e6fd8", "#1a3f8f", "#8fc1ff"] } },
  { id: "kepler", name: "Kepler-22b", nick: "바다 행성",
    blueprint: { neutron: 5e29, entropy: "1e220" }, build: { 1: "1e17", 8: "8e56" },
    lore: "행성 전체가 바다로 덮인 슈퍼지구.",
    effect: "수소·산소 생산 ×25",
    look: { type: "water", colors: ["#1e6fb8", "#0d4f8b", "#bfe8ff"] } },
  { id: "tres", name: "TrES-2b", nick: "가장 어두운 행성",
    blueprint: { neutron: 1e30, entropy: "1e224" }, build: { 6: "1e47", 7: "3e51" },
    lore: "빛의 1%만 반사하는, 석탄보다 어두운 행성.",
    effect: "오프라인 최대 틱 ×2",
    look: { type: "dark", colors: ["#1a1420", "#0b0810", "#3d1f4f"] } },
  { id: "gj", name: "GJ 1214 b", nick: "증기 행성",
    blueprint: { neutron: 2e30, entropy: "1e228" }, build: { 1: "1e18", 8: "3e57" },
    lore: "대기 전체가 뜨거운 수증기로 이루어진 물의 세계.",
    effect: "수소·산소 생산 ×40",
    look: { type: "ice", colors: ["#9fd8e8", "#5a9ab8", "#e8fbff"] } },
  { id: "wasp", name: "WASP-12b", nick: "별에 먹히는 행성",
    blueprint: { neutron: 5e30, entropy: "1e232" }, build: { 1: "1e18", 2: "1e23" },
    lore: "항성에 흡수되며 계란형으로 찌그러진 최후의 행성.",
    effect: "항성 배율 ×2",
    look: { type: "hot", colors: ["#ff8c42", "#c1440e", "#ffd29d"] } },
  { id: "psr", name: "PSR B1620-26 b", nick: "므두셀라",
    blueprint: { neutron: 1e31, entropy: "1e236" }, build: { 6: "1e48", 26: "1e200" },
    lore: "우주 나이의 대부분을 살아온 127억 년 된 최고령 행성.",
    effect: "모든 원소 생산 ×10",
    look: { type: "rock", colors: ["#8a7a5c", "#4f4638", "#c9b891"] } },
  { id: "kelt", name: "KELT-9b", nick: "가장 뜨거운 행성",
    blueprint: { neutron: 2e31, entropy: "1e240" }, build: { 1: "1e19", 26: "1e202" },
    lore: "표면 4,300K — 웬만한 항성보다 뜨거워 대기가 증발 중인 행성.",
    effect: "항성 온도 상한 +5,000K · 항성 배율 ×1.5",
    look: { type: "hot", colors: ["#ffd9a0", "#e86a2a", "#fff2d0"] } },
  { id: "rogue", name: "HD 106906 b", nick: "추방자",
    blueprint: { neutron: 5e31, entropy: "1e244" }, build: { 7: "1e53", 26: "1e204" },
    lore: "모항성에서 730AU 떨어져 홀로 떠도는 추방된 행성.",
    effect: "랜덤 행성 보너스 ×3 → ×6",
    look: { type: "dark", colors: ["#3a3550", "#1c1930", "#7a6fa8"] } }
];

// 티어 2: 태양계 행성 — 태양 Lv 365의 핵심 조력자
var SOLAR_PLANETS = [
  { id: "mercury", name: "수성", els: { 26: "1e197", 14: "3e89", 8: "8e57", 12: "1e79" },
    boost: [26, 12], mult: 10, desc: "철·마그네슘 생산 ×10",
    look: { type: "rock", colors: ["#9c9488", "#6e675e", "#c4bcae"] } },
  { id: "venus", name: "금성", els: { 6: "1e47", 8: "8e57", 16: "5e99", 14: "3e89" },
    boost: [16, 6], mult: 10, desc: "황·탄소 생산 ×10",
    look: { type: "gas", colors: ["#e8c56f", "#c9a24a", "#f5e3b0"] } },
  { id: "earth", name: "지구", els: { 8: "8e58", 14: "3e90", 13: "2e84", 26: "1e202", 7: "3e52", 1: "1e18" },
    boost: "all", mult: 5, desc: "모든 원소 생산 ×5",
    look: { type: "earth", colors: ["#2e6fd8", "#3f9142", "#e8e8e8"] } },
  { id: "mars", name: "화성", els: { 26: "3e199", 8: "8e57", 14: "3e89", 6: "1e47" },
    boost: [26, 14], mult: 10, desc: "철·규소 생산 ×10",
    look: { type: "rock", colors: ["#c1552f", "#8f3a1e", "#e8a06e"] } },
  { id: "jupiter", name: "목성", els: { 1: "1e19", 2: "1e24", 6: "1e47", 7: "3e52" },
    boost: [1, 2], mult: 15, desc: "수소·헬륨 생산 ×15",
    look: { type: "gas", colors: ["#d8a26a", "#a86e3f", "#f0d9b8"] } },
  { id: "saturn", name: "토성", els: { 1: "8e18", 2: "8e23", 7: "3e52", 6: "1e47" },
    boost: [1, 2], mult: 10, desc: "수소·헬륨 생산 ×10 (고리 보유)",
    look: { type: "gas", colors: ["#e0c48f", "#bfa066", "#f2e2bd"], rings: true } },
  { id: "uranus", name: "천왕성", els: { 1: "3e18", 2: "3e23", 6: "5e47", 7: "5e52", 8: "5e57" },
    boost: [6, 7], mult: 10, desc: "탄소·질소 생산 ×10",
    look: { type: "ice", colors: ["#7fd4d4", "#4fa8b8", "#c8f0f0"] } },
  { id: "neptune", name: "해왕성", els: { 1: "3e18", 2: "3e23", 6: "8e47", 7: "8e52", 8: "8e57" },
    boost: [7, 8], mult: 10, desc: "질소·산소 생산 ×10",
    look: { type: "ice", colors: ["#2f5fd0", "#1a3a9c", "#7fa8f0"] } },
  { id: "pluto", name: "명왕성", els: { 7: "1e53", 6: "5e47", 8: "3e57", 1: "1e18" },
    boost: [7], mult: 20, desc: "질소 생산 ×20 (그래도 행성입니다)",
    look: { type: "ice", colors: ["#c9b8a8", "#8f8070", "#e8dcc8"] } }
];

// ---------- 태양계 ----------
var SOLAR_SYSTEM = { mult: "2e7" };

// ---------- 도전과제 (업적) ----------
// row: 줄 구분(A/B). 한 줄을 모두 채우면 줄 보상.
// eff: 개별 달성 효과(생산 배율). check: 달성 조건 (런타임에 game.js 함수 참조).
var ACHIEVEMENTS = [
  { id: "a1", row: "A", name: "시작이 반이다!", icon: "🌱", cond: "첫 전자 생성기를 구매하세요.",
    eff: "효과 없음", check: function () { return state.genLevels.electron >= 1; } },
  { id: "a2", row: "A", name: "양성자 이몸 등장", icon: "🔴", cond: "양성자 생성기를 구매하세요.",
    eff: "", check: function () { return state.genLevels.proton >= 1; } },
  { id: "a3", row: "A", name: "주인공은 맨 마지막에", icon: "⚪", cond: "중성자 생성기를 구매하세요.",
    eff: "", check: function () { return state.genLevels.neutron >= 1; } },
  { id: "a4", row: "A", name: "돈 만이 벌고 싶다", icon: "💰", cond: "누적 10,002 E를 얻으세요.",
    eff: "즉시 10,002 E 지급", grant: 10002, check: function () { return state.totalEntropy.gte(10002); } },
  { id: "a5", row: "A", name: "빠른", icon: "💨", cond: "초당 1,000 E 이상 획득하세요.",
    eff: "", check: function () { return entropyRateDisplay().gte(1000); } },
  { id: "a6", row: "A", name: "원소다!", icon: "⚛️", cond: "수소를 연구하세요.",
    eff: "", check: function () { return state.researched >= 1; } },
  { id: "a7", row: "A", name: "이것도 수소인가?", icon: "💧", cond: "중수소를 합성하세요.",
    eff: "", check: function () { return !!state.isotopes.h2; } },
  { id: "a8", row: "A", name: "새로운 업그레이드", icon: "🔧", cond: "융합 강화를 구매하세요.",
    eff: "", check: function () { return fusionTotalLevel() >= 1; } },
  { id: "a9", row: "A", name: "풍선", icon: "🎈", cond: "헬륨을 연구하세요.",
    eff: "", check: function () { return state.researched >= 2; } },
  { id: "a10", row: "A", name: "진짜 빠른!", icon: "🚀", cond: "초당 2.5e5 E 이상 획득하세요.",
    eff: "", check: function () { return entropyRateDisplay().gte(2.5e5); } },

  { id: "b1", row: "B", name: "전자가 부족해!", icon: "⚡", cond: "전자 변환속도가 생산속도보다 빠르게 하세요.",
    eff: "", check: function () { return state.convLevels.electron >= 1 && convRate("electron").gt(genRate("electron")); } },
  { id: "b2", row: "B", name: "실버튼버", icon: "🥈", cond: "전자·양성자·중성자를 각 1e6개 이상 보유하세요.",
    eff: "전자 생산 ×1.05", check: function () {
      return state.particles.electron.gte(1e6) && state.particles.proton.gte(1e6) && state.particles.neutron.gte(1e6);
    } },
  { id: "b3", row: "B", name: "배터리", icon: "🔋", cond: "리튬을 연구하세요.",
    eff: "양성자 생산 ×1.05", check: function () { return state.researched >= 3; } },
  { id: "b4", row: "B", name: "헬륨친구", icon: "🫧", cond: "헬륨-3를 합성하세요.",
    eff: "", check: function () { return !!state.isotopes.he3; } },
  { id: "b5", row: "B", name: "단맛", icon: "🍬", cond: "베릴륨을 연구하세요.",
    eff: "중성자 생산 ×1.05", check: function () { return state.researched >= 4; } },
  { id: "b6", row: "B", name: "붕소3", icon: "🧪", cond: "붕소를 연구하세요.",
    eff: "", check: function () { return state.researched >= 5; } },
  { id: "b7", row: "B", name: "반백", icon: "🎂", cond: "전자 생성기를 50개 이상 보유하세요.",
    eff: "", check: function () { return state.genLevels.electron >= 50; } },
  { id: "b8", row: "B", name: "이런 C..", icon: "⚫", cond: "탄소를 연구하세요.",
    eff: "", check: function () { return state.researched >= 6; } },
  { id: "b9", row: "B", name: "과자봉지", icon: "🍿", cond: "질소를 연구하세요.",
    eff: "", check: function () { return state.researched >= 7; } },

  // ---- C줄: 중반 원소·자동화·희생 (제목/설명은 자유롭게 바꾸세요) ----
  { id: "c1", row: "C", name: "숨 쉬는 별", icon: "🫧", cond: "산소를 연구하세요.",
    eff: "", check: function () { return state.researched >= 8; } },
  { id: "c2", row: "C", name: "네온사인", icon: "💡", cond: "네온을 연구하세요.",
    eff: "", check: function () { return state.researched >= 10; } },
  { id: "c3", row: "C", name: "자동화 시대", icon: "⚙️", cond: "자동화 항목을 하나 가동하세요.",
    eff: "", check: function () { return AUTO_TARGETS.some(function (t) { return state.autos[t.key] && state.autos[t.key].on; }); } },
  { id: "c4", row: "C", name: "티끌 모아", icon: "🌪️", cond: "초당 1e15 E 이상 획득하세요.",
    eff: "", check: function () { return entropyRateDisplay().gte(1e15); } },
  { id: "c5", row: "C", name: "첫 희생", icon: "🩸", cond: "엔트로피를 한 번 희생하세요.",
    eff: "", check: function () { return state.sacrifice && D(state.sacrifice.mult).gt(1); } },
  { id: "c6", row: "C", name: "동위원소 수집가", icon: "⚗️", cond: "동위원소를 5개 이상 합성하세요.",
    eff: "중성자 생산 ×1.1", check: function () { return Object.keys(state.isotopes).length >= 5; } },

  // ---- D줄: 후반 원소·특수연구·자동화 ----
  { id: "d1", row: "D", name: "소금", icon: "🧂", cond: "염소를 연구하세요.",
    eff: "", check: function () { return state.researched >= 17; } },
  { id: "d2", row: "D", name: "연금술사", icon: "🧫", cond: "특수 연구를 3개 이상 완료하세요.",
    eff: "", check: function () { return Object.keys(state.special).length >= 3; } },
  { id: "d3", row: "D", name: "폭발적", icon: "💥", cond: "초당 1e40 E 이상 획득하세요.",
    eff: "", check: function () { return entropyRateDisplay().gte(1e40); } },
  { id: "d4", row: "D", name: "상시 가동", icon: "🤖", cond: "자동화 항목을 상시(0초)까지 단축하세요.",
    eff: "", check: function () { return AUTO_TARGETS.some(function (t) { return state.autos[t.key] && state.autos[t.key].level >= AUTO_DELAYS.length - 1; }); } },
  { id: "d5", row: "D", name: "희생의 대가", icon: "🗡️", cond: "희생 배율을 ×2 이상으로 만드세요.",
    eff: "중성자 생산 ×1.1", check: function () { return state.sacrifice && D(state.sacrifice.mult).gte(2); } },
  { id: "d6", row: "D", name: "철의 시대", icon: "🛠️", cond: "철을 연구하세요.",
    eff: "", check: function () { return state.researched >= ELEMENTS.length; } },

  // ---- E줄: 항성·행성·태양계 ----
  { id: "e1", row: "E", name: "별의 탄생", icon: "✦", cond: "항성을 점화하세요.",
    eff: "", check: function () { return !!state.star; } },
  { id: "e2", row: "E", name: "첫 세계", icon: "🪐", cond: "행성을 하나 이상 건설하세요.",
    eff: "", check: function () {
      return state.planets.random.length > 0 || state.planets.custom.length > 0 ||
        solarPlanetCount() > 0 || EXOPLANETS.some(function (x) { return state.planets.special[x.id]; });
    } },
  { id: "e3", row: "E", name: "심우주 신호", icon: "🛸", cond: "특이 행성을 하나 건설하세요.",
    eff: "", check: function () { return EXOPLANETS.some(function (x) { return state.planets.special[x.id]; }); } },
  { id: "e4", row: "E", name: "아홉 세계", icon: "🌍", cond: "태양계 행성 9개를 모두 건설하세요.",
    eff: "", check: function () { return solarPlanetCount() >= SOLAR_PLANETS.length; } },
  { id: "e5", row: "E", name: "일 년", icon: "☀️", cond: "태양을 Lv 365까지 올리세요.",
    eff: "", check: function () { return state.star && state.star.level >= STAR.maxLevel; } },
  { id: "e6", row: "E", name: "하나의 계", icon: "🌌", cond: "태양계를 구성하세요.",
    eff: "", check: function () { return !!state.solarSystem; } }
];

// 줄 보상: 한 줄 전부 달성 시
var ACH_ROWS = [
  { row: "A", reward: "초당 E 생산 ×1.05" },
  { row: "B", reward: "모든 입자 생산 ×1.1" },
  { row: "C", reward: "원소 생산 ×1.1" },
  { row: "D", reward: "초당 E 생산 ×1.1" },
  { row: "E", reward: "모든 생산 ×1.25" }
];

// ---------- 엔트로피 희생 ----------
var SACRIFICE = {
  reqResearched: 5,       // 붕소 이후
  recoverySeconds: 30,    // 생산이 0 → 원상복구까지
  gainCoef: 0.0006        // 배율 획득 계수 (아주 약함 — 초당 E log10에 비례)
  // 희생은 복구 100%(완전 회복) 상태에서만 가능 → 연타 방지
};

// ---------- 자동화 ----------
var AUTO_TARGETS = [
  { key: "gen_electron",  name: "전자 생성기 자동",   kind: "gen",   p: "electron" },
  { key: "gen_proton",    name: "양성자 생성기 자동", kind: "gen",   p: "proton" },
  { key: "gen_neutron",   name: "중성자 생성기 자동", kind: "gen",   p: "neutron" },
  { key: "conv_electron", name: "전자 변환기 자동",   kind: "conv",  p: "electron" },
  { key: "conv_proton",   name: "양성자 변환기 자동", kind: "conv",  p: "proton" },
  { key: "conv_neutron",  name: "중성자 변환기 자동", kind: "conv",  p: "neutron" },
  { key: "fusion",        name: "융합 강화 자동",     kind: "fusion" },
  { key: "track_condense",name: "엔트로피 응축 자동", kind: "track", t: "condense" },
  { key: "track_hflux",   name: "수소 선속 자동",     kind: "track", t: "hflux" },
  { key: "track_accel",   name: "입자 가속 자동",     kind: "track", t: "accel" }
];

// 딜레이 스케줄: 60s(1분)부터 5s씩 감소 → 0s(상시)
var AUTO_DELAYS = (function () {
  var a = [], d;
  for (d = 60; d > 0; d -= 5) a.push(d);
  a.push(0);
  return a;   // [60,55,...,5,0] = 13단계 (레벨 0~12)
})();
// 단축 비용: 레벨에 따라 초기 원소(수소~붕소)를 "소량" 고정 요구.
// 연구를 진행해도 요구 원소가 바뀌지 않는다(레벨로만 결정).
var AUTO_STEP_BASE = 1000;         // 첫 단축 비용(개수)
var AUTO_STEP_GROW = 4;            // 레벨당 비용 증가율
var AUTO_COST_MAX_ELEM = 5;        // 요구 최대 원소 = 붕소(초기 원소 유지)

// ---------- 시스템 ----------
var SYSTEM = {
  tickSeconds: 0.05,
  offlineMaxTicks: 1e6,
  autosaveSeconds: 30
};
