// ============================================================
// format.js — 숫자 표기 (지수 표기 / K,M,B 표기)
// ============================================================

var KMB_UNITS = [
  { v: 1e12, s: "T" },
  { v: 1e9,  s: "B" },
  { v: 1e6,  s: "M" },
  { v: 1e3,  s: "K" }
];

function format(value, decimals) {
  var d = new Decimal(value);
  if (decimals === undefined) decimals = 2;

  if (d.lt(0)) return "-" + format(d.neg(), decimals);
  if (d.eq(0)) return "0";

  // 100만 미만: 콤마 표기
  if (d.lt(1e6)) {
    var n = d.toNumber();
    if (n >= 100 || Number.isInteger(n)) return Math.floor(n).toLocaleString("en-US");
    return n.toLocaleString("en-US", { maximumFractionDigits: decimals });
  }

  // K,M,B 표기 (1e15 미만까지)
  if (state.settings.notation === "kmb" && d.lt(1e15)) {
    var num = d.toNumber();
    for (var i = 0; i < KMB_UNITS.length; i++) {
      if (num >= KMB_UNITS[i].v) return (num / KMB_UNITS[i].v).toFixed(decimals) + KMB_UNITS[i].s;
    }
  }

  // 지수 표기 (아주 큰 수까지 안전)
  var e = d.log10().floor();
  var m = d.div(Decimal.pow(10, e)).toNumber();
  if (Number(m.toFixed(decimals)) >= 10) { m = m / 10; e = e.add(1); }
  return m.toFixed(decimals) + "e" + format(e, 0);
}

function formatWhole(value) {
  return format(new Decimal(value).floor(), 0);
}

// 정확한 개수 (2^53 미만에서만 정수가 정확) — 툴팁용, 너무 크면 null
function formatExact(value) {
  var d = new Decimal(value);
  if (d.lt(0) || d.gte(1e15)) return null;
  return Math.floor(d.toNumber()).toLocaleString("en-US");
}

function formatRate(value) {
  return format(value, 1) + "/초";
}

function formatTime(seconds) {
  seconds = Math.floor(seconds);
  var d = Math.floor(seconds / 86400);
  var h = Math.floor((seconds % 86400) / 3600);
  var m = Math.floor((seconds % 3600) / 60);
  var s = seconds % 60;
  var parts = [];
  if (d > 0) parts.push(d + "일");
  if (h > 0) parts.push(h + "시간");
  if (m > 0) parts.push(m + "분");
  if (d === 0 && h === 0) parts.push(s + "초");
  return parts.join(" ") || "0초";
}
