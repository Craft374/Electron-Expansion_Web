// ============================================================
// render.js — 항성/행성/태양계 캔버스 렌더링
// 노이즈 기반 표면 질감 + 홍염 + 채층으로 실제 태양 사진 느낌
// ============================================================

// 흑체복사 근사 색상 (T: 켈빈) → [r, g, b]
function blackbodyColor(T) {
  var t = T / 100, r, g, b;
  if (t <= 66) {
    r = 255;
    g = Math.min(255, Math.max(0, 99.47 * Math.log(t) - 161.12));
    b = t <= 19 ? 0 : Math.min(255, Math.max(0, 138.52 * Math.log(t - 10) - 305.04));
  } else {
    r = Math.min(255, Math.max(0, 329.7 * Math.pow(t - 60, -0.1332)));
    g = Math.min(255, Math.max(0, 288.12 * Math.pow(t - 60, -0.0755)));
    b = 255;
  }
  return [r | 0, g | 0, b | 0];
}

function spectralClass(T) {
  if (T < 3700) return "M형 (적색)";
  if (T < 5200) return "K형 (주황)";
  if (T < 6000) return "G형 (황색·태양형)";
  if (T < 7500) return "F형 (황백색)";
  if (T < 10000) return "A형 (백색)";
  if (T < 30000) return "B형 (청백색)";
  return "O형 (청색)";
}

function rgba(r, g, b, a) { return "rgba(" + (r|0) + "," + (g|0) + "," + (b|0) + "," + a + ")"; }

function hexRgb(hex) {
  var v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function mixWhite(c, f) {
  return [c[0] + (255 - c[0]) * f, c[1] + (255 - c[1]) * f, c[2] + (255 - c[2]) * f];
}

function seededRand(seed) {
  var s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

// ---------- 노이즈 타일 (표면 질감용, 1회 생성 후 재사용) ----------
var _noiseTiles = null;
var _tintCache = {};

function makeNoiseTile(size, seed) {
  var cv = document.createElement("canvas");
  cv.width = cv.height = size;
  var ctx = cv.getContext("2d");
  var img = ctx.createImageData(size, size);
  var rnd = seededRand(seed);
  function grid(n) {
    var g = new Float32Array(n * n);
    for (var i = 0; i < n * n; i++) g[i] = rnd();
    return g;
  }
  var g1 = grid(8), g2 = grid(32), g3 = grid(80);
  function smp(g, n, u, v) {
    var fx = u * n, fy = v * n;
    var x0 = Math.floor(fx), y0 = Math.floor(fy);
    var tx = fx - x0, ty = fy - y0;
    x0 = x0 % n; y0 = y0 % n;
    var x1 = (x0 + 1) % n, y1 = (y0 + 1) % n;
    tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    var a = g[y0 * n + x0], b = g[y0 * n + x1], c = g[y1 * n + x0], d = g[y1 * n + x1];
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  }
  var p = 0;
  for (var y = 0; y < size; y++) {
    for (var x = 0; x < size; x++) {
      var u = x / size, v = y / size;
      var val = 0.45 * smp(g1, 8, u, v) + 0.35 * smp(g2, 32, u, v) + 0.2 * smp(g3, 80, u, v);
      val = Math.pow(val, 1.9) * 1.7;
      if (val > 1) val = 1;
      img.data[p++] = 255; img.data[p++] = 255; img.data[p++] = 255;
      img.data[p++] = (val * 255) | 0;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

function getNoiseTiles() {
  if (!_noiseTiles) _noiseTiles = [makeNoiseTile(256, 11), makeNoiseTile(256, 777)];
  return _noiseTiles;
}

// 노이즈 타일을 색으로 물들인 버전 (캐시)
function tintedTile(idx, color) {
  var key = idx + "|" + color;
  if (_tintCache[key]) return _tintCache[key];
  var tile = getNoiseTiles()[idx];
  var cv = document.createElement("canvas");
  cv.width = cv.height = tile.width;
  var ctx = cv.getContext("2d");
  ctx.drawImage(tile, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, cv.width, cv.height);
  _tintCache[key] = cv;
  return cv;
}

// 타일을 무한 반복으로 영역에 그림 (자전 오프셋용) — 패턴 방식이라 이음새 없음
var _patCache = {};
function drawTiled(ctx, tile, ox, oy, ts, x0, y0, w, h) {
  var key = tile._patKey || (tile._patKey = "p" + Math.random());
  var pat = _patCache[key];
  if (!pat) pat = _patCache[key] = ctx.createPattern(tile, "repeat");
  var s = ts / tile.width;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, w, h);
  ctx.clip();
  ctx.translate(x0 - ox, y0 - oy);
  ctx.scale(s, s);
  ctx.fillStyle = pat;
  var span = Math.max(w, h) / s + tile.width * 4;
  ctx.fillRect(-span, -span, span * 3, span * 3);
  ctx.restore();
}

// ============================================================
// 항성 — SDO 태양 사진 스타일
// ============================================================
function drawStar(cv, temp, level, t) {
  var ctx = cv.getContext("2d");
  var w = cv.width, h = cv.height;
  ctx.clearRect(0, 0, w, h);
  var cx = w / 2, cy = h / 2;
  var R = Math.min(w, h) * (0.3 + Math.min(0.04, level / 9000)) *
          (1 + 0.008 * Math.sin(t * 1.3) + 0.004 * Math.sin(t * 3.1));

  // 온도 버킷 (틴트 캐시 효율) — 사진 느낌을 위해 색은 실제보다 따뜻하게 보정
  // (실제 5,778K 흑체색은 거의 흰색이지만, 태양 사진은 주황빛)
  var tb = Math.round(temp / 500) * 500;
  var photoT = 1700 + (tb - 2000) * 0.45;
  var c = blackbodyColor(photoT);
  var bright = mixWhite(c, 0.3);
  var deep = [c[0] * 0.3, c[1] * 0.16, c[2] * 0.12];

  // 배경 별
  var rnd = seededRand(777);
  for (var i = 0; i < 45; i++) {
    var sx = rnd() * w, sy = rnd() * h, sr = rnd() * 1.1 + 0.3;
    var tw = 0.4 + 0.6 * Math.abs(Math.sin(t * (0.4 + rnd()) + i));
    ctx.fillStyle = rgba(255, 255, 255, 0.3 * tw);
    ctx.beginPath(); ctx.arc(sx, sy, sr, 0, 7); ctx.fill();
  }

  // 외곽 코로나 (넓고 부드럽게)
  var glow = ctx.createRadialGradient(cx, cy, R * 0.7, cx, cy, R * 2.1);
  glow.addColorStop(0, rgba(c[0], c[1], c[2], 0.5));
  glow.addColorStop(0.35, rgba(c[0], c[1], c[2], 0.16));
  glow.addColorStop(1, rgba(c[0], c[1], c[2], 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  // 본체 바탕 (중심 밝고 가장자리 어두운 주연감광)
  var body = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R);
  body.addColorStop(0, rgba(bright[0], bright[1], bright[2], 1));
  body.addColorStop(0.55, rgba(c[0], c[1], c[2], 1));
  body.addColorStop(0.88, rgba(c[0] * 0.75, c[1] * 0.62, c[2] * 0.55, 1));
  body.addColorStop(1, rgba(deep[0], deep[1], deep[2], 1));
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();

  // ----- 표면 질감 (클립 안) -----
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.995, 0, 7); ctx.clip();

  var ts1 = R * 1.5, ts2 = R * 2.4;
  var brightCss = "rgb(" + (bright[0]|0) + "," + (bright[1]|0) + "," + (bright[2]|0) + ")";
  var darkCss = "rgb(" + (deep[0]|0) + "," + (deep[1]|0) + "," + (deep[2]|0) + ")";

  // 어두운 필라멘트 (먼저 깔아 대비 확보)
  ctx.globalAlpha = 0.75;
  drawTiled(ctx, tintedTile(1, darkCss), t * 2.1, -t * 3.2, ts1 * 1.15, cx - R, cy - R, R * 2, R * 2);
  ctx.globalAlpha = 0.45;
  drawTiled(ctx, tintedTile(0, darkCss), -t * 1.4, t * 2.6, ts2 * 0.7, cx - R, cy - R, R * 2, R * 2);

  // 밝은 쌀알무늬 두 겹 (서로 다른 속도로 흘러 이글거림)
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.42;
  drawTiled(ctx, tintedTile(0, brightCss), t * 5, t * 2.2, ts1, cx - R, cy - R, R * 2, R * 2);
  ctx.globalAlpha = 0.26;
  drawTiled(ctx, tintedTile(1, brightCss), -t * 3.4, t * 4.1, ts2, cx - R, cy - R, R * 2, R * 2);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;

  // 활동 영역 (밝은 플레어 지점, 천천히 이동·깜빡임)
  ctx.globalCompositeOperation = "lighter";
  var rnd2 = seededRand(4242);
  for (i = 0; i < 3; i++) {
    var aAng = rnd2() * 6.28 + t * 0.04 * (i + 1);
    var aDist = (0.35 + rnd2() * 0.45) * R;
    var ax = cx + Math.cos(aAng) * aDist, ay = cy + Math.sin(aAng) * aDist * 0.85;
    var flick = 0.45 + 0.35 * Math.sin(t * 2.2 + i * 2.6);
    var ar = R * (0.1 + rnd2() * 0.12);
    var spot = ctx.createRadialGradient(ax, ay, 0, ax, ay, ar);
    spot.addColorStop(0, rgba(255, 255, 240, 0.75 * flick));
    spot.addColorStop(0.4, rgba(bright[0], bright[1], bright[2], 0.4 * flick));
    spot.addColorStop(1, rgba(bright[0], bright[1], bright[2], 0));
    ctx.fillStyle = spot;
    ctx.beginPath(); ctx.arc(ax, ay, ar, 0, 7); ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
  ctx.restore();

  // 채층 림 (가장자리 얇은 빛)
  ctx.strokeStyle = rgba(bright[0], bright[1], bright[2], 0.7);
  ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.arc(cx, cy, R + 0.8, 0, 7); ctx.stroke();
  var rim = ctx.createRadialGradient(cx, cy, R, cx, cy, R * 1.14);
  rim.addColorStop(0, rgba(c[0], c[1], c[2], 0.4));
  rim.addColorStop(1, rgba(c[0], c[1], c[2], 0));
  ctx.fillStyle = rim;
  ctx.beginPath(); ctx.arc(cx, cy, R * 1.14, 0, 7); ctx.fill();

  // 홍염 (가장자리에서 솟아오르는 고리)
  for (i = 0; i < 5; i++) {
    var pAng = (i / 5) * 6.28 + t * 0.03;
    var sway = Math.sin(t * 0.9 + i * 2.1);
    var bx = cx + Math.cos(pAng) * R, by = cy + Math.sin(pAng) * R;
    var ex = cx + Math.cos(pAng + 0.22) * R, ey = cy + Math.sin(pAng + 0.22) * R;
    var mx = cx + Math.cos(pAng + 0.11) * R * (1.16 + 0.09 * sway);
    var my = cy + Math.sin(pAng + 0.11) * R * (1.16 + 0.09 * sway);
    var alpha = 0.35 + 0.3 * Math.sin(t * 1.4 + i * 1.9);
    if (alpha < 0.12) continue;
    ctx.strokeStyle = rgba(bright[0], bright[1], bright[2], alpha);
    ctx.lineWidth = 1.6 + 0.8 * Math.abs(sway);
    ctx.shadowColor = rgba(c[0], c[1], c[2], 0.8);
    ctx.shadowBlur = 7;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(mx, my, ex, ey);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}

// ============================================================
// 행성
// ============================================================
// look: { type, colors: [메인, 어두움, 밝음/대기], rings }
function drawPlanet(cv, look, t, seed) {
  var ctx = cv.getContext("2d");
  var w = cv.width, h = cv.height;
  ctx.clearRect(0, 0, w, h);
  var cx = w / 2, cy = h / 2;
  var R = Math.min(w, h) * 0.33;
  var c0 = hexRgb(look.colors[0]), c1 = hexRgb(look.colors[1]), c2 = hexRgb(look.colors[2]);
  var rnd = seededRand(seed || 42);
  var rings = look.rings;

  if (rings) drawRingHalf(ctx, cx, cy, R, c2, true);

  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.clip();

  ctx.fillStyle = rgba(c1[0], c1[1], c1[2], 1);
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

  var type = look.type;
  var shift = (t * 5) % (R * 4);

  if (type === "gas" || type === "hot") {
    var bands = 9;
    for (var i = 0; i < bands; i++) {
      var y = cy - R + (i / bands) * R * 2;
      var bh = R * 2 / bands + 1;
      var mix = (i % 3 === 0) ? c0 : (i % 3 === 1 ? c2 : c1);
      var wob = Math.sin(i * 2.2 + t * 0.5) * R * 0.05;
      ctx.fillStyle = rgba(mix[0], mix[1], mix[2], 0.85);
      ctx.beginPath();
      ctx.ellipse(cx + wob, y + bh / 2, R * 1.1, bh * 0.62, 0, 0, 7);
      ctx.fill();
    }
    if (type === "hot") {
      for (i = 0; i < 4; i++) {
        var hy = cy - R * 0.6 + i * R * 0.4;
        ctx.strokeStyle = rgba(255, 230, 160, 0.5);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - R, hy + Math.sin(t * 2 + i) * 4);
        ctx.quadraticCurveTo(cx, hy - 8, cx + R, hy + Math.cos(t * 2 + i) * 4);
        ctx.stroke();
      }
    }
  } else if (type === "water" || type === "ice") {
    for (i = 0; i < 6; i++) {
      var wx = cx - R + ((rnd() * R * 4 + shift * (0.5 + rnd() * 0.5)) % (R * 4)) - R;
      var wy = cy - R + rnd() * R * 2;
      var wr = R * (0.15 + rnd() * 0.3);
      var sw = ctx.createRadialGradient(wx, wy, 0, wx, wy, wr);
      sw.addColorStop(0, rgba(c2[0], c2[1], c2[2], type === "water" ? 0.4 : 0.55));
      sw.addColorStop(1, rgba(c2[0], c2[1], c2[2], 0));
      ctx.fillStyle = sw;
      ctx.beginPath(); ctx.ellipse(wx, wy, wr * 1.6, wr * 0.7, -0.3, 0, 7); ctx.fill();
    }
  } else if (type === "earth") {
    for (i = 0; i < 5; i++) {
      var ex = cx - R + ((rnd() * R * 4 + shift) % (R * 4)) - R;
      var ey = cy - R * 0.7 + rnd() * R * 1.4;
      var er = R * (0.2 + rnd() * 0.25);
      ctx.fillStyle = rgba(63, 145, 66, 0.9);
      ctx.beginPath();
      ctx.ellipse(ex, ey, er * 1.3, er * 0.8, rnd() * 3, 0, 7);
      ctx.fill();
    }
    for (i = 0; i < 6; i++) {
      var ux = cx - R + ((rnd() * R * 4 + shift * 1.6) % (R * 4)) - R;
      var uy = cy - R + rnd() * R * 2;
      ctx.fillStyle = rgba(255, 255, 255, 0.35);
      ctx.beginPath();
      ctx.ellipse(ux, uy, R * (0.2 + rnd() * 0.2), R * 0.07, 0, 0, 7);
      ctx.fill();
    }
  } else if (type === "lava") {
    for (i = 0; i < 7; i++) {
      var lx = cx - R + rnd() * R * 2, ly = cy - R + rnd() * R * 2;
      var glow2 = 0.5 + 0.4 * Math.sin(t * 2 + i * 1.7);
      ctx.strokeStyle = rgba(255, 180 + (rnd() * 60 | 0), 80, glow2);
      ctx.lineWidth = 1.5 + rnd() * 1.5;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.quadraticCurveTo(lx + (rnd() - 0.5) * R, ly + (rnd() - 0.5) * R,
                           lx + (rnd() - 0.5) * R * 1.5, ly + (rnd() - 0.5) * R * 1.5);
      ctx.stroke();
    }
  } else if (type === "dark") {
    for (i = 0; i < 4; i++) {
      var dx = cx - R + rnd() * R * 2, dy = cy - R + rnd() * R * 2;
      var dg = ctx.createRadialGradient(dx, dy, 0, dx, dy, R * 0.5);
      dg.addColorStop(0, rgba(c2[0], c2[1], c2[2], 0.25));
      dg.addColorStop(1, rgba(0, 0, 0, 0));
      ctx.fillStyle = dg;
      ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    }
  } else {
    // rock: 크레이터/얼룩
    for (i = 0; i < 12; i++) {
      var rx = cx - R + ((rnd() * R * 4 + shift * 0.7) % (R * 4)) - R;
      var ry = cy - R + rnd() * R * 2;
      var rr = R * (0.05 + rnd() * 0.16);
      var cc = rnd() > 0.5 ? c1 : c0;
      ctx.fillStyle = rgba(cc[0], cc[1], cc[2], 0.6);
      ctx.beginPath(); ctx.arc(rx, ry, rr, 0, 7); ctx.fill();
    }
  }

  // 표면 노이즈 질감 (모든 타입 공통 — 입체감·디테일)
  if (type !== "dark") {
    var darkCss2 = "rgb(" + (c1[0] * 0.5 | 0) + "," + (c1[1] * 0.5 | 0) + "," + (c1[2] * 0.5 | 0) + ")";
    ctx.globalAlpha = 0.3;
    drawTiled(ctx, tintedTile(0, darkCss2), shift * 0.8, 0, R * 1.6, cx - R, cy - R, R * 2, R * 2);
    ctx.globalAlpha = 1;
  }

  // 명암 (빛: 왼쪽 위)
  var light = ctx.createRadialGradient(cx - R * 0.45, cy - R * 0.45, R * 0.1, cx, cy, R * 1.35);
  light.addColorStop(0, "rgba(255,255,255,0.35)");
  light.addColorStop(0.4, "rgba(255,255,255,0)");
  light.addColorStop(0.75, "rgba(0,0,0,0.3)");
  light.addColorStop(1, "rgba(0,0,0,0.75)");
  ctx.fillStyle = light;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

  // 스페큘러 하이라이트
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.beginPath();
  ctx.ellipse(cx - R * 0.42, cy - R * 0.42, R * 0.22, R * 0.13, -0.7, 0, 7);
  ctx.fill();

  ctx.restore();

  // 대기 림
  ctx.strokeStyle = rgba(c2[0], c2[1], c2[2], look.type === "dark" ? 0.25 : 0.55);
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, R + 1, 0, 7); ctx.stroke();
  var rim = ctx.createRadialGradient(cx, cy, R, cx, cy, R * 1.25);
  rim.addColorStop(0, rgba(c2[0], c2[1], c2[2], 0.22));
  rim.addColorStop(1, rgba(c2[0], c2[1], c2[2], 0));
  ctx.fillStyle = rim;
  ctx.beginPath(); ctx.arc(cx, cy, R * 1.25, 0, 7); ctx.fill();

  if (rings) drawRingHalf(ctx, cx, cy, R, c2, false);
}

function drawRingHalf(ctx, cx, cy, R, c, back) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.35);
  ctx.strokeStyle = rgba(c[0], c[1], c[2], 0.55);
  ctx.lineWidth = R * 0.16;
  ctx.beginPath();
  if (back) ctx.ellipse(0, 0, R * 1.65, R * 0.5, 0, Math.PI, Math.PI * 2);
  else ctx.ellipse(0, 0, R * 1.65, R * 0.5, 0, 0, Math.PI);
  ctx.stroke();
  ctx.strokeStyle = rgba(c[0], c[1], c[2], 0.25);
  ctx.lineWidth = R * 0.05;
  ctx.beginPath();
  if (back) ctx.ellipse(0, 0, R * 1.95, R * 0.6, 0, Math.PI, Math.PI * 2);
  else ctx.ellipse(0, 0, R * 1.95, R * 0.6, 0, 0, Math.PI);
  ctx.stroke();
  ctx.restore();
}

// ============================================================
// 태양계
// ============================================================
function drawSolarSystem(cv, temp, t) {
  var ctx = cv.getContext("2d");
  var w = cv.width, h = cv.height;
  ctx.clearRect(0, 0, w, h);
  var cx = w / 2, cy = h / 2;

  var rnd = seededRand(2024);
  for (var i = 0; i < 80; i++) {
    var sx = rnd() * w, sy = rnd() * h;
    ctx.fillStyle = rgba(255, 255, 255, 0.15 + rnd() * 0.3);
    ctx.beginPath(); ctx.arc(sx, sy, rnd() * 1.1 + 0.2, 0, 7); ctx.fill();
  }

  var c = blackbodyColor(temp || 5778);
  var sR = Math.min(w, h) * 0.055;
  var glow = ctx.createRadialGradient(cx, cy, sR * 0.3, cx, cy, sR * 4);
  glow.addColorStop(0, rgba(c[0], c[1], c[2], 0.8));
  glow.addColorStop(1, rgba(c[0], c[1], c[2], 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  var body = ctx.createRadialGradient(cx - sR * 0.2, cy - sR * 0.2, 0, cx, cy, sR);
  body.addColorStop(0, "#fff");
  body.addColorStop(1, rgba(c[0], c[1], c[2], 1));
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.arc(cx, cy, sR, 0, 7); ctx.fill();

  for (i = 0; i < SOLAR_PLANETS.length; i++) {
    var p = SOLAR_PLANETS[i];
    var orbitR = sR * 2.2 + (i + 1) * (Math.min(w, h) * 0.42 - sR * 2.2) / SOLAR_PLANETS.length;
    ctx.strokeStyle = "rgba(120,180,255,0.13)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(cx, cy, orbitR, orbitR * 0.42, 0, 0, 7); ctx.stroke();

    var speed = 1 / Math.pow(orbitR / 40, 1.5) * 18;
    var ang = t * speed + i * 2.2;
    var px = cx + Math.cos(ang) * orbitR;
    var py = cy + Math.sin(ang) * orbitR * 0.42;
    var pc = hexRgb(p.look.colors[0]);
    var pR = 3 + (i >= 4 && i <= 7 ? 3 : 0);

    var pg = ctx.createRadialGradient(px - pR * 0.3, py - pR * 0.3, 0, px, py, pR);
    pg.addColorStop(0, rgba(Math.min(255, pc[0] + 70), Math.min(255, pc[1] + 70), Math.min(255, pc[2] + 70), 1));
    pg.addColorStop(1, rgba(pc[0] * 0.5, pc[1] * 0.5, pc[2] * 0.5, 1));
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.arc(px, py, pR, 0, 7); ctx.fill();

    if (p.look.rings) {
      ctx.strokeStyle = rgba(pc[0], pc[1], pc[2], 0.7);
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(px, py, pR * 2, pR * 0.7, -0.3, 0, 7); ctx.stroke();
    }
  }
}
