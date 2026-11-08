/* =========================================================
   ЧЕРВЯК ДЖИМ — отрисовка: фон, тайлы по темам локаций, враги,
   друзья, боссы, Джим, HUD (жизни — лицо Джима), темнота
   ========================================================= */
'use strict';

const INK = '#141018';

// Мягкое свечение — готовый спрайт радиального градиента (дешевле, чем shadowBlur)
const glowCache = {};
function glowSprite(color, r = 64, inner = 0) {
  const key = color + r + inner;
  if (glowCache[key]) return glowCache[key];
  const c = document.createElement('canvas'); c.width = c.height = r * 2;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(r, r, r * inner, r, r, r);
  gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2);
  return (glowCache[key] = c);
}
function glow(x, y, r, color, a = 0.6) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a;
  ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
  ctx.restore();
}
// Вспышка при попадании: та же отрисовка ещё раз в режиме «осветления»
function flashPass(draw, a) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a;
  draw();
  ctx.restore();
}
const SOLID_VIS = new Set(['#', '<', '>', 'R', 'K']);
function hash2(c, r) { let h = (c * 374761393 + r * 668265263) >>> 0; h = (h ^ (h >>> 13)) * 1274126177 >>> 0; return (h ^ (h >>> 16)) / 4294967296; }

// ---------- Фон ----------
function drawBackground(name, cam, par = 0.25) {
  const img = IMG['bg_' + name];
  if (!img || !img.width) { ctx.fillStyle = '#120a2a'; ctx.fillRect(0, 0, W, H); return; }
  const s = H / img.height, iw = img.width * s;
  const off = (cam * par) % (iw * 2);
  for (let i = -1; i < Math.ceil(W / iw) + 2; i++) {
    const x = i * iw - off;
    if (x > W || x + iw < 0) continue;
    ctx.save();
    if (((i % 2) + 2) % 2 === 1) { ctx.translate(x + iw, 0); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, iw + 1, H); }
    else ctx.drawImage(img, x, 0, iw + 1, H);
    ctx.restore();
  }
}

// ---------- Статичные тайлы: пререндер в сегменты 960 px ----------
const segPool = [];   // холсты сегментов переиспользуются, а не создаются заново
function getSeg(s) {
  if (level.segs[s]) return level.segs[s];
  const cv = segPool.pop() || Object.assign(document.createElement('canvas'), { width: SEG_W, height: H });
  const g = cv.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, SEG_W, H);
  const c0 = Math.floor(s * SEG_W / TS), c1 = Math.ceil((s + 1) * SEG_W / TS);
  g.translate(-s * SEG_W, 0);
  for (let r = 0; r < ROWS; r++) for (let c = c0 - 1; c <= c1; c++) {
    const ch = charAt(c, r);
    if (ch === ' ') continue;
    paintStatic(g, c, r, ch);
  }
  // кэш ограничен: держим только ближайшие сегменты
  const keys = Object.keys(level.segs);
  if (keys.length > 5) for (const k of keys) if (Math.abs(k - s) > 2) { segPool.push(level.segs[k]); delete level.segs[k]; }
  level.segs[s] = cv;
  return cv;
}
function visSolid(c, r) { const ch = charAt(c, r); return SOLID_VIS.has(ch) || (r >= ROWS); }

function paintStatic(g, c, r, ch) {
  const th = level.theme, x = c * TS, y = r * TS;
  if (ch === '#' || ch === '<' || ch === '>' || ch === 'R') paintSolid(g, c, r, x, y, th, ch);
  else if (ch === '=') paintPlank(g, x, y, th);
  else if (ch === '^') paintSpikes(g, x, y, visSolid(c, r - 1) && !visSolid(c, r + 1));
  else if (ch === '~') paintLiquid(g, c, r, x, y, th);
  else if (ch === 'K') paintLock(g, x, y);
}
function paintSolid(g, c, r, x, y, th, ch) {
  const [light, mid, dark] = th.body;
  let depth = 0; for (let k = 1; k <= 3; k++) if (visSolid(c, r - k)) depth++; else break;
  g.fillStyle = mid; g.fillRect(x, y, TS, TS);
  if (depth > 0) { g.fillStyle = `rgba(0,0,0,${0.12 * depth})`; g.fillRect(x, y, TS, TS); }
  // текстура: камушки / заклёпки
  const h1 = hash2(c, r), h2 = hash2(c + 7, r + 3);
  g.fillStyle = h1 > 0.5 ? dark : light;
  g.globalAlpha = 0.35;
  g.beginPath(); g.ellipse(x + 8 + h1 * 30, y + 10 + h2 * 26, 5 + h2 * 5, 3 + h1 * 3, h1 * 3, 0, Math.PI * 2); g.fill();
  if (h2 > 0.4) { g.beginPath(); g.ellipse(x + 30 - h2 * 18, y + 30 + h1 * 10, 3 + h1 * 3, 2 + h2 * 2, 0, 0, Math.PI * 2); g.fill(); }
  g.globalAlpha = 1;
  // края
  g.fillStyle = INK;
  if (!visSolid(c - 1, r)) g.fillRect(x, y, 4, TS);
  if (!visSolid(c + 1, r)) g.fillRect(x + TS - 4, y, 4, TS);
  if (!visSolid(c, r + 1) && r < ROWS - 1) g.fillRect(x, y + TS - 4, TS, 4);
  if (ch === 'R') {
    g.fillStyle = 'rgba(255,240,220,0.18)'; g.fillRect(x + 4, y + 4, TS - 8, TS - 8);
    g.strokeStyle = INK; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x + 10, y + 6); g.lineTo(x + 22, y + 20); g.lineTo(x + 16, y + 30); g.lineTo(x + 30, y + 42);
    g.moveTo(x + 22, y + 20); g.lineTo(x + 38, y + 14); g.stroke();
  }
  if (!visSolid(c, r - 1)) paintTop(g, c, r, x, y, th);
}
function paintTop(g, c, r, x, y, th) {
  const [t1, t2] = th.top, h = hash2(c, r);
  g.fillStyle = INK; g.fillRect(x, y - 3, TS, 5);
  switch (th.topKind) {
    case 'slime': case 'goo':
      g.fillStyle = t2; g.fillRect(x, y, TS, 14);
      g.fillStyle = t1; g.fillRect(x, y, TS, 8);
      g.fillStyle = t2; g.beginPath(); g.ellipse(x + 10 + h * 26, y + 14, 5, 9 + h * 8, 0, 0, Math.PI); g.fill();
      g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.ellipse(x + 10 + h * 26, y + 14, 5, 9 + h * 8, 0, 0, Math.PI); g.stroke();
      break;
    case 'metal':
      g.fillStyle = t2; g.fillRect(x, y, TS, 12); g.fillStyle = t1; g.fillRect(x, y, TS, 6);
      g.fillStyle = INK; g.beginPath(); g.arc(x + 8, y + 8, 2, 0, 7); g.arc(x + 40, y + 8, 2, 0, 7); g.fill();
      break;
    case 'snow':
      g.fillStyle = t2; g.beginPath(); g.roundRect(x - 2, y - 6, TS + 4, 18, 8); g.fill();
      g.fillStyle = t1; g.beginPath(); g.roundRect(x - 2, y - 7, TS + 4, 12, 6); g.fill();
      if (h > 0.5) { g.fillStyle = '#dff4ff'; g.beginPath(); g.moveTo(x + 14, y + 10); g.lineTo(x + 20, y + 10); g.lineTo(x + 17, y + 24); g.fill(); }
      break;
    case 'ember':
      g.fillStyle = t2; g.fillRect(x, y, TS, 12);
      g.strokeStyle = t1; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y + 6); g.lineTo(x + 14, y + 10); g.lineTo(x + 26, y + 4); g.lineTo(x + TS, y + 8); g.stroke();
      break;
    case 'weed':
      g.fillStyle = t2; g.fillRect(x, y, TS, 10); g.fillStyle = t1; g.fillRect(x, y, TS, 5);
      g.strokeStyle = t1; g.lineWidth = 4; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x + 12, y); g.quadraticCurveTo(x + 4, y - 14, x + 12 + h * 6, y - 24 - h * 10); g.stroke();
      if (h > 0.5) { g.beginPath(); g.moveTo(x + 34, y); g.quadraticCurveTo(x + 42, y - 10, x + 32, y - 20); g.stroke(); }
      break;
    case 'flesh':
      g.fillStyle = t2; g.fillRect(x, y, TS, 12);
      g.fillStyle = t1; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(x + 8 + i * 16, y + 3, 8, Math.PI, 0); g.fill(); }
      break;
    case 'hazard':
      g.fillStyle = t1; g.fillRect(x, y, TS, 10);
      g.fillStyle = t2; for (let i = -1; i < 4; i++) { g.beginPath(); g.moveTo(x + i * 16, y + 10); g.lineTo(x + i * 16 + 8, y); g.lineTo(x + i * 16 + 16, y); g.lineTo(x + i * 16 + 8, y + 10); g.fill(); }
      break;
    case 'crystal':
      g.fillStyle = shade(th.body[0], 0.2); g.fillRect(x, y, TS, 8);
      if (h > 0.35) {
        g.fillStyle = h > 0.7 ? t2 : t1;
        g.beginPath(); g.moveTo(x + 10 + h * 20, y + 2); g.lineTo(x + 16 + h * 20, y - 16 - h * 10); g.lineTo(x + 22 + h * 20, y + 2); g.closePath(); g.fill();
        g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
      }
      break;
    case 'void':
      g.fillStyle = t2; g.fillRect(x, y, TS, 8); g.fillStyle = t1; g.fillRect(x, y, TS, 3);
      break;
  }
}
function paintPlank(g, x, y, th) {
  g.fillStyle = INK; g.beginPath(); g.roundRect(x - 1, y - 1, TS + 2, 18, 5); g.fill();
  g.fillStyle = th.plat; g.beginPath(); g.roundRect(x + 1, y + 1, TS - 2, 14, 4); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x + 4, y + 3, TS - 8, 3);
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 4, y + 11, TS - 8, 3);
}
function paintSpikes(g, x, y, down) {
  for (let i = 0; i < 3; i++) {
    const sx = x + i * 16;
    g.beginPath();
    if (down) { g.moveTo(sx + 1, y); g.lineTo(sx + 8, y + 40); g.lineTo(sx + 15, y); }
    else { g.moveTo(sx + 1, y + TS); g.lineTo(sx + 8, y + 8); g.lineTo(sx + 15, y + TS); }
    g.closePath();
    const gr = g.createLinearGradient(sx, 0, sx + 16, 0); gr.addColorStop(0, '#f2f2ff'); gr.addColorStop(1, '#7a7a90');
    g.fillStyle = gr; g.fill(); g.strokeStyle = INK; g.lineWidth = 2.5; g.stroke();
  }
}
function paintLiquid(g, c, r, x, y, th) {
  const surf = charAt(c, r - 1) !== '~';
  const gr = g.createLinearGradient(0, y, 0, y + TS);
  gr.addColorStop(0, th.liquid[0]); gr.addColorStop(1, th.liquid[1]);
  g.fillStyle = surf ? gr : th.liquid[1];
  g.fillRect(x, y + (surf ? 10 : 0), TS, TS - (surf ? 10 : 0));
  if (hash2(c, r) > 0.6) { g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.arc(x + 12 + hash2(r, c) * 24, y + 24, 3, 0, 7); g.fill(); }
}
function paintLock(g, x, y) {
  g.fillStyle = INK; g.fillRect(x, y, TS, TS);
  g.fillStyle = '#e8b52a'; g.fillRect(x + 3, y + 3, TS - 6, TS - 6);
  g.fillStyle = '#ffd86a'; g.fillRect(x + 3, y + 3, TS - 6, 6);
  g.fillStyle = INK; g.beginPath(); g.arc(x + 24, y + 20, 6, 0, 7); g.fill(); g.fillRect(x + 21, y + 22, 6, 14);
}

function drawTiles() {
  const s0 = Math.floor(camX / SEG_W), s1 = Math.floor((camX + W) / SEG_W);
  for (let s = s0; s <= s1; s++) ctx.drawImage(getSeg(s), Math.round(s * SEG_W - camX), 0);
  // следующий сегмент готовим заранее, чтобы не было рывка на границе
  const ahead = player && player.vx < 0 ? s0 - 1 : s1 + 1;
  if (ahead >= 0 && ahead * SEG_W < level.cols * TS && !level.segs[ahead]) getSeg(ahead);
  // динамические тайлы
  const c0 = Math.floor(camX / TS) - 1, c1 = Math.ceil((camX + W) / TS) + 1;
  const th = level.theme, t = gameTime;
  for (let r = 0; r < ROWS; r++) for (let c = c0; c <= c1; c++) {
    const ch = charAt(c, r);
    if (ch === ' ' || ch === '#' || ch === '=' || ch === '^' || ch === 'K') continue;
    const x = c * TS - camX, y = r * TS;
    switch (ch) {
      case '~': if (charAt(c, r - 1) !== '~') {
        ctx.fillStyle = th.liquid[0];
        ctx.beginPath(); ctx.moveTo(x, y + TS);
        for (let i = 0; i <= 6; i++) ctx.lineTo(x + i * 8, y + 10 + Math.sin(t * 4 + (c * TS + i * 8) * 0.05) * 4);
        ctx.lineTo(x + TS, y + TS); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        for (let i = 0; i < 6; i++) ctx.fillRect(x + i * 8, y + 9 + Math.sin(t * 4 + (c * TS + i * 8) * 0.05) * 4, 5, 2);
        if (th.glowLiquid && Math.random() < 0.01) sparks(c * TS + rand(0, TS), y + 8, '#ffd23f', 1, 120);
      } break;
      case '<': case '>': {
        const dir = ch === '>' ? 1 : -1;
        ctx.fillStyle = '#2a2a33'; ctx.fillRect(x, y, TS, 12);
        ctx.fillStyle = '#ffd23f';
        const o = ((t * 170 * dir) % 24 + 24) % 24;
        for (let i = -1; i < 3; i++) {
          const cx = x + i * 24 + o; if (cx < x - 8 || cx > x + TS) continue;
          ctx.beginPath(); ctx.moveTo(cx, y + 2); ctx.lineTo(cx + 8 * dir, y + 6); ctx.lineTo(cx, y + 10); ctx.lineTo(cx + 3 * dir, y + 6); ctx.fill();
        }
        ctx.fillStyle = INK; ctx.fillRect(x, y + 12, TS, 2);
      } break;
      case 'R': {
        const hp = level.rhp[r * level.cols + c] || 6;
        if (hp < 6) { ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 6, y + 40); ctx.lineTo(x + 20, y + 30); ctx.lineTo(x + 36, y + 38); if (hp < 3) { ctx.moveTo(x + 20, y + 30); ctx.lineTo(x + 24, y + 8); } ctx.stroke(); }
      } break;
      case 'S': drawSpring(x, y, level.springT[r * level.cols + c] || 0); break;
      case 'X': {
        const k = level.crumble[r * level.cols + c];
        if (k && k.gone) break;
        const sh = k && k.touched ? Math.sin(t * 70) * 2.5 : 0;
        ctx.save(); ctx.translate(x + sh, y);
        ctx.fillStyle = INK; ctx.beginPath(); ctx.roundRect(0, 0, TS, 26, 6); ctx.fill();
        ctx.fillStyle = shade(th.plat, -0.1); ctx.beginPath(); ctx.roundRect(2, 2, TS - 4, 22, 5); ctx.fill();
        ctx.fillStyle = shade(th.plat, 0.25); ctx.fillRect(5, 4, TS - 10, 4);
        ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(14, 2); ctx.lineTo(20, 14); ctx.lineTo(16, 24); ctx.moveTo(32, 2); ctx.lineTo(28, 12); ctx.stroke();
        ctx.restore();
      } break;
      case 'D': {
        const open = groupActive(level.group[r][c]);
        if (open) { ctx.fillStyle = 'rgba(80,255,120,0.15)'; ctx.fillRect(x + 8, y, TS - 16, TS); break; }
        ctx.fillStyle = INK; ctx.fillRect(x, y, TS, TS);
        ctx.fillStyle = '#8a3a3a'; ctx.fillRect(x + 3, y, TS - 6, TS);
        ctx.fillStyle = '#c85a4a'; ctx.fillRect(x + 6, y + 4, 8, TS - 8); ctx.fillRect(x + 20, y + 4, 8, TS - 8); ctx.fillRect(x + 34, y + 4, 8, TS - 8);
        if (charAt(c, r - 1) !== 'D') { ctx.fillStyle = '#ffd23f'; ctx.fillRect(x, y, TS, 6); }
      } break;
      case 'b': {
        if (!groupActive(level.group[r][c])) { ctx.strokeStyle = 'rgba(120,255,255,0.35)'; ctx.setLineDash([6, 6]); ctx.strokeRect(x + 2, y + 2, TS - 4, 14); ctx.setLineDash([]); break; }
        ctx.fillStyle = INK; ctx.fillRect(x, y, TS, 20);
        ctx.fillStyle = '#5ae0ff'; ctx.fillRect(x, y + 3, TS, 13);
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(x, y + 5, TS, 3);
      } break;
      case 'Z': {
        const on = !groupActive(level.group[r][c]);
        ctx.fillStyle = '#3a3f4a'; ctx.fillRect(x + 16, y, 16, 4); ctx.fillRect(x + 16, y + TS - 4, 16, 4);
        if (on) {
          const fl = 0.7 + Math.sin(t * 40 + r) * 0.3;
          ctx.fillStyle = `rgba(255,40,60,${0.35 * fl})`; ctx.fillRect(x + 12, y, 24, TS);
          ctx.fillStyle = `rgba(255,120,140,${fl})`; ctx.fillRect(x + 20, y, 8, TS);
          ctx.fillStyle = '#fff'; ctx.fillRect(x + 23, y, 2, TS);
        }
      } break;
      case '!': case '?': {
        const red = ch === '!';
        const solid = red ? !level.phase : level.phase;
        const warn = level.phaseT > 2.0 && Math.floor(t * 10) % 2 === 0;
        const col = red ? '#ff4a6a' : '#4a8aff';
        if (solid) {
          ctx.fillStyle = INK; ctx.fillRect(x, y, TS, TS);
          ctx.fillStyle = warn ? '#fff' : col; ctx.fillRect(x + 3, y + 3, TS - 6, TS - 6);
          ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x + 6, y + 6, TS - 12, 6);
          ctx.fillStyle = INK; ctx.font = '900 22px Rubik, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ch, x + 24, y + 27);
        } else {
          ctx.strokeStyle = col; ctx.globalAlpha = warn ? 0.9 : 0.45; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
          ctx.strokeRect(x + 4, y + 4, TS - 8, TS - 8); ctx.setLineDash([]); ctx.globalAlpha = 1;
        }
      } break;
    }
  }
}
function drawSpring(x, y, k) {
  const comp = k > 0 ? Math.sin(k / 0.3 * Math.PI) * 12 : 0;
  const top = y + 16 - (k > 0.15 ? 10 : 0) + comp * 0.3;
  ctx.fillStyle = INK; ctx.fillRect(x + 4, y + TS - 10, TS - 8, 10);
  ctx.fillStyle = '#7a7a8a'; ctx.fillRect(x + 6, y + TS - 8, TS - 12, 6);
  ctx.strokeStyle = '#d8d8e8'; ctx.lineWidth = 4;
  ctx.beginPath();
  const n = 4, hgt = (y + TS - 10) - (top + 8);
  for (let i = 0; i <= n; i++) ctx.lineTo(x + (i % 2 ? 36 : 12), y + TS - 10 - hgt * i / n);
  ctx.stroke();
  ctx.fillStyle = INK; ctx.beginPath(); ctx.roundRect(x + 2, top - 2, TS - 4, 14, 5); ctx.fill();
  ctx.fillStyle = '#ff4a3a'; ctx.beginPath(); ctx.roundRect(x + 4, top, TS - 8, 10, 4); ctx.fill();
}

// ---------- Механизмы и предметы ----------
function drawMechanics() {
  const t = gameTime;
  for (const m of movers) {
    const x = m.x - camX; if (x > W || x + m.w < 0) continue;
    ctx.fillStyle = INK; ctx.beginPath(); ctx.roundRect(x - 2, m.y - 2, m.w + 4, m.h + 4, 8); ctx.fill();
    ctx.fillStyle = shade(level.theme.plat, 0.1); ctx.beginPath(); ctx.roundRect(x, m.y, m.w, m.h, 7); ctx.fill();
    ctx.fillStyle = '#7ff6ff'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x + 24 + i * 48, m.y + 10, 4, 0, 7); ctx.fill(); }
    // реактивные струйки снизу
    ctx.fillStyle = `rgba(127,246,255,${0.4 + Math.sin(t * 30) * 0.2})`;
    ctx.beginPath(); ctx.moveTo(x + 20, m.y + m.h); ctx.lineTo(x + 28, m.y + m.h + 14 + Math.sin(t * 40) * 4); ctx.lineTo(x + 36, m.y + m.h); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + m.w - 36, m.y + m.h); ctx.lineTo(x + m.w - 28, m.y + m.h + 14 + Math.cos(t * 40) * 4); ctx.lineTo(x + m.w - 20, m.y + m.h); ctx.fill();
  }
  for (const pl of plates) {
    const x = pl.x - camX; if (x > W || x < -60) continue;
    const d = pl.down ? 5 : 0;
    ctx.fillStyle = INK; ctx.fillRect(x - 2, pl.y + d - 2, pl.w + 4, pl.h + 4 - d);
    ctx.fillStyle = pl.down ? '#7dff3a' : '#ff9a2a'; ctx.fillRect(x, pl.y + d, pl.w, pl.h - d);
  }
  for (const L of levers) {
    const x = L.x - camX; if (x > W || x < -60) continue;
    ctx.save(); ctx.translate(x + 24, L.y + 24);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.roundRect(-18, -18, 36, 36, 6); ctx.fill();
    ctx.fillStyle = L.on ? '#3a8a3a' : '#8a3a3a'; ctx.beginPath(); ctx.roundRect(-15, -15, 30, 30, 5); ctx.fill();
    const a = L.on ? 0.7 : -0.7;
    ctx.rotate(a);
    ctx.fillStyle = INK; ctx.fillRect(-4, -26, 8, 26);
    ctx.fillStyle = '#d8d8e8'; ctx.fillRect(-2, -24, 4, 24);
    ctx.fillStyle = L.on ? '#7dff3a' : '#ff4a3a'; ctx.beginPath(); ctx.arc(0, -26, 7, 0, 7); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    if (!L.on) { ctx.globalAlpha = 0.5 + Math.sin(t * 6) * 0.3; ctx.strokeStyle = '#ffe14a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x + 24, L.y + 24, 28, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; }
  }
  for (const tp of teleports) {
    const x = tp.x - camX; if (x > W + 40 || x < -90) continue;
    const cx = x + 24, by = tp.y + TS;
    ctx.save();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(cx, by - 4, 30, 9, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#c08aff'; ctx.beginPath(); ctx.ellipse(cx, by - 5, 26, 6, 0, 0, 7); ctx.fill();
    const gr = ctx.createLinearGradient(0, by - 110, 0, by);
    gr.addColorStop(0, 'rgba(192,138,255,0)'); gr.addColorStop(1, 'rgba(192,138,255,0.55)');
    ctx.fillStyle = gr; ctx.fillRect(cx - 24, by - 110, 48, 106);
    for (let i = 0; i < 4; i++) { const k = (tp.t * 0.8 + i / 4) % 1; ctx.fillStyle = `rgba(255,255,255,${1 - k})`; ctx.fillRect(cx - 18 + i * 11, by - 10 - k * 90, 3, 8); }
    ctx.restore();
  }
  for (const g of geysers) {
    const x = g.x - camX; if (x > W || x < -60) continue;
    ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(x + 24, g.bottom - 4, 22, 8, 0, 0, 7); ctx.fill();
    ctx.fillStyle = g.t > 1.8 ? '#ffb42a' : '#5a2a1a'; ctx.beginPath(); ctx.ellipse(x + 24, g.bottom - 5, 16, 5, 0, 0, 7); ctx.fill();
    if (g.erupt) {
      const hh = 200 * Math.min(1, (g.t - 2.3) / 0.12);
      const gr = ctx.createLinearGradient(0, g.bottom - hh, 0, g.bottom);
      gr.addColorStop(0, 'rgba(255,220,80,0)'); gr.addColorStop(0.3, '#ffd23f'); gr.addColorStop(1, '#ff4a1a');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.moveTo(x + 8, g.bottom - 4);
      for (let i = 0; i <= 8; i++) ctx.lineTo(x + 6 + i * 4.5 + Math.sin(gameTime * 30 + i) * 4, g.bottom - hh + Math.abs(i - 4) * 10);
      ctx.lineTo(x + 40, g.bottom - 4); ctx.fill();
    }
  }
  for (const ic of icicles) {
    const x = ic.x - camX + (ic.state === 'shake' ? Math.sin(gameTime * 80) * 2 : 0); if (x > W || x < -40) continue;
    ctx.beginPath(); ctx.moveTo(x, ic.y); ctx.lineTo(x + 12, ic.y + ic.h); ctx.lineTo(x + 24, ic.y); ctx.closePath();
    inkPath('#dff4ff', 2.5);
    ctx.fillStyle = 'rgba(120,190,255,0.6)'; ctx.beginPath(); ctx.moveTo(x + 14, ic.y); ctx.lineTo(x + 12, ic.y + ic.h - 6); ctx.lineTo(x + 20, ic.y); ctx.fill();
  }
  for (const cr of crushers) {
    const x = cr.x - camX; if (x > W || x < -100) continue;
    const sh = cr.state === 'warn' ? Math.sin(gameTime * 90) * 3 : 0;
    ctx.fillStyle = INK; ctx.fillRect(x + cr.w / 2 - 11 + sh, -4, 22, cr.y + 4);
    ctx.fillStyle = '#8a94a4'; ctx.fillRect(x + cr.w / 2 - 8 + sh, -4, 16, cr.y + 4);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.roundRect(x - 3 + sh, cr.y - 3, cr.w + 6, cr.h + 6, 6); ctx.fill();
    ctx.fillStyle = '#5a6070'; ctx.beginPath(); ctx.roundRect(x + sh, cr.y, cr.w, cr.h, 5); ctx.fill();
    ctx.fillStyle = '#ffd23f'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x + sh + i * 17, cr.y + cr.h); ctx.lineTo(x + sh + i * 17 + 8, cr.y + cr.h - 12); ctx.lineTo(x + sh + i * 17 + 17, cr.y + cr.h); ctx.fill(); }
    ctx.fillStyle = cr.state === 'warn' ? '#ff3a3a' : '#7a2a2a'; ctx.beginPath(); ctx.arc(x + cr.w / 2 + sh, cr.y + 14, 6, 0, 7); ctx.fill();
  }
  for (const cr of crates) drawCrate(cr.x - camX, cr.y, cr.w);
  for (const b of bubbles) {
    const x = b.x - camX;
    ctx.strokeStyle = 'rgba(220,250,255,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, b.y, b.r, 0, 7); ctx.stroke();
    ctx.fillStyle = 'rgba(200,240,255,0.25)'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.22, 0, 7); ctx.fill();
  }
  for (const v of vents) { const x = v.x - camX; ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(x, v.bottom - 3, 16, 6, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#5ad8ff'; ctx.beginPath(); ctx.ellipse(x, v.bottom - 4, 9, 3, 0, 0, 7); ctx.fill(); }
  for (const l of lamps) {
    const x = l.x - camX; if (x > W + 40 || x < -40) continue;
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, l.y); ctx.stroke();
    ctx.save(); ctx.translate(x, l.y); ctx.rotate(Math.sin(l.t * 1.5) * 0.1);
    ctx.fillStyle = '#ffe9a0';
    ctx.beginPath(); ctx.roundRect(-12, 0, 24, 30, 6); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
  }
  for (const cp of checkpoints) {
    const x = cp.x - camX; if (x > W || x < -60) continue;
    ctx.fillStyle = INK; ctx.fillRect(x - 4, cp.y - 120, 8, 120);
    ctx.fillStyle = '#c8c8d8'; ctx.fillRect(x - 2, cp.y - 118, 4, 118);
    const wave = Math.sin(gameTime * 5) * 5;
    ctx.beginPath(); ctx.moveTo(x + 4, cp.y - 118); ctx.quadraticCurveTo(x + 30, cp.y - 112 + wave, x + 56, cp.y - 104); ctx.lineTo(x + 4, cp.y - 86); ctx.closePath();
    inkPath(cp.on ? '#7dff3a' : '#ff4a6a', 3);
  }
  if (exitDoor) drawExit(exitDoor);
  for (const it of items) drawItem(it);
}
function drawCrate(x, y, w) {
  ctx.fillStyle = INK; ctx.fillRect(x - 2, y - 2, w + 4, w + 4);
  ctx.fillStyle = '#b5773a'; ctx.fillRect(x, y, w, w);
  ctx.fillStyle = '#d8995a'; ctx.fillRect(x + 4, y + 4, w - 8, 6); ctx.fillRect(x + 4, y + w - 10, w - 8, 6);
  ctx.strokeStyle = '#7a4a1a'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x + 6, y + 10); ctx.lineTo(x + w - 6, y + w - 10); ctx.moveTo(x + w - 6, y + 10); ctx.lineTo(x + 6, y + w - 10); ctx.stroke();
}
function drawExit(d) {
  const x = d.x - camX; if (x > W + 60 || x < -140) return;
  ctx.save();
  ctx.fillStyle = INK; ctx.beginPath(); ctx.roundRect(x - 6, d.y - 6, d.w + 12, d.h + 6, [40, 40, 0, 0]); ctx.fill();
  ctx.fillStyle = '#4a3a6a'; ctx.beginPath(); ctx.roundRect(x, d.y, d.w, d.h, [36, 36, 0, 0]); ctx.fill();
  if (d.open) {
    const gr = ctx.createRadialGradient(x + d.w / 2, d.y + d.h / 2, 5, x + d.w / 2, d.y + d.h / 2, 60);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.4, '#9affb0'); gr.addColorStop(1, '#2a8a5a');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.roundRect(x + 8, d.y + 8, d.w - 16, d.h - 8, [30, 30, 0, 0]); ctx.fill();
    for (let i = 0; i < 5; i++) { const a = d.t * 2 + i * 1.25; ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(x + d.w / 2 + Math.cos(a) * 24, d.y + d.h / 2 + Math.sin(a) * 34, 3, 0, 7); ctx.fill(); }
    outlinedText('ВЫХОД', x + d.w / 2, d.y - 22 + Math.sin(d.t * 3) * 4, 26, '#9affb0');
  } else {
    ctx.fillStyle = '#2a2238'; ctx.beginPath(); ctx.roundRect(x + 8, d.y + 8, d.w - 16, d.h - 8, [30, 30, 0, 0]); ctx.fill();
    outlinedText('ЗАКРЫТО', x + d.w / 2, d.y - 22, 22, '#ff9f9f');
  }
  ctx.restore();
}
function drawItem(it) {
  const x = it.x - camX, y = it.y + Math.sin(it.t * 3) * 5;
  if (x < -40 || x > W + 40) return;
  ctx.save(); ctx.translate(x, y);
  switch (it.kind) {
    case 'a': drawAtom(0, 0, it.t); break;
    case 'h': drawHeart(0, 0, it.t); break;
    case 'u': drawJimFace(0, 0, 44, it.t); ctx.globalAlpha = 0.6 + Math.sin(it.t * 6) * 0.3; outlinedText('1UP', 0, -30, 16, '#7dff3a'); break;
    case 'o': if (IMG.cow && IMG.cow.width) { ctx.rotate(Math.sin(it.t * 2) * 0.2); ctx.drawImage(IMG.cow, -40, -32, 80, 66); } break;
    case 'k':
      ctx.rotate(Math.sin(it.t * 2) * 0.3);
      ctx.beginPath(); ctx.arc(-8, 0, 10, 0, 7); ctx.moveTo(0, -3); ctx.rect(0, -4, 22, 8); ctx.rect(14, 4, 4, 7); ctx.rect(8, 4, 4, 5);
      inkPath('#ffd23f', 2.5);
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(-8, 0, 4, 0, 7); ctx.fill();
      break;
  }
  ctx.restore();
}
function drawAtom(x, y, t) {
  ctx.save(); ctx.translate(x, y);
  ctx.strokeStyle = '#7ff6ff'; ctx.lineWidth = 2.5;
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(0, 0, 18, 7, t * 2 + i * Math.PI / 3, 0, Math.PI * 2); ctx.stroke(); }
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, 7); ctx.fill();
  ctx.restore();
}
function drawHeart(x, y, t) {
  const s = 1 + Math.sin(t * 6) * 0.08;
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.beginPath(); ctx.moveTo(0, 12); ctx.bezierCurveTo(-22, -2, -14, -20, 0, -9); ctx.bezierCurveTo(14, -20, 22, -2, 0, 12);
  inkPath('#ff4a7a', 3);
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(-7, -6, 3, 0, 7); ctx.fill();
  ctx.restore();
}

// Лицо Джима (голова из рига) — для счётчика жизней
function drawJimFace(x, y, size, t = 0, alpha = 1) {
  if (!RIG || !IMG.jim_head || !IMG.jim_head.width) return;
  const [px, py, pw, ph] = RIG.jim.parts.head;
  const k = size / ph;
  ctx.save(); ctx.globalAlpha *= alpha;
  ctx.translate(x, y); ctx.rotate(Math.sin(t * 2) * 0.06); ctx.scale(k, k);
  ctx.drawImage(IMG.jim_head, -pw / 2, -ph / 2, pw, ph);
  ctx.restore();
}

// ---------- Враги: процедурные мультяшные рисовалки ----------
function eye(x, y, r, lx = 0.3, ly = 0, angry = false) {
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x + lx * r * 0.5, y + ly * r * 0.4, r * 0.48, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + lx * r * 0.5 - r * 0.15, y - r * 0.2, r * 0.15, 0, 7); ctx.fill();
  if (angry) { ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - r, y - r * 1.1); ctx.lineTo(x + r, y - r * 0.5); ctx.stroke(); }
}
function blobShape(w, h, wob) {
  ctx.beginPath();
  ctx.moveTo(-w / 2, 0);
  ctx.bezierCurveTo(-w / 2 - wob, -h * 0.6, -w * 0.3, -h, 0, -h);
  ctx.bezierCurveTo(w * 0.3, -h, w / 2 + wob, -h * 0.6, w / 2, 0);
  ctx.closePath();
}
const DRAW = {
  slug(e, w, h, t, c1, c2, ex) {
    const sq = Math.sin(t * 6) * 0.06;
    ctx.save(); ctx.scale(1 + sq, 1 - sq);
    ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.quadraticCurveTo(-w / 2, -h * 0.7, -w * 0.05, -h * 0.75); ctx.quadraticCurveTo(w / 2, -h * 1.05, w / 2, -h * 0.35); ctx.quadraticCurveTo(w / 2, 0, w * 0.3, 0); ctx.closePath();
    inkPath(c1);
    ctx.fillStyle = c2; ctx.beginPath(); ctx.ellipse(-w * 0.15, -h * 0.35, w * 0.12, h * 0.12, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(w * 0.25, -h * 0.8); ctx.lineTo(w * 0.2, -h * 1.15); ctx.moveTo(w * 0.38, -h * 0.75); ctx.lineTo(w * 0.42, -h * 1.12); ctx.stroke();
    eye(w * 0.2, -h * 1.18, 6, 0.6); eye(w * 0.43, -h * 1.15, 6, 0.6);
    if (ex && ex.helmet) { ctx.beginPath(); ctx.ellipse(w * 0.3, -h * 0.82, w * 0.22, h * 0.2, 0, Math.PI, 0); inkPath('#c8c8d8'); ctx.fillStyle = '#ff3a3a'; ctx.fillRect(w * 0.27, -h * 1.08, 6, 10); }
    if (ex && ex.spear) { ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-w * 0.1, -h * 0.2); ctx.lineTo(w * 0.7, -h * 0.9); ctx.stroke(); ctx.beginPath(); ctx.moveTo(w * 0.7, -h * 1.05); ctx.lineTo(w * 0.82, -h * 0.98); ctx.lineTo(w * 0.66, -h * 0.82); ctx.closePath(); inkPath('#d8d8e8', 2); }
    ctx.restore();
  },
  blob(e, w, h, t, c1, c2, ex) {
    const sq = e.squash > 0 ? 0.25 : Math.sin(t * 5) * 0.05;
    const air = e.onGround === false && !e.fly;
    ctx.save(); ctx.scale(1 + (air ? -0.12 : sq), 1 + (air ? 0.15 : -sq));
    blobShape(w, h, 8); inkPath(c1);
    ctx.fillStyle = c2; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.ellipse(0, -h * 0.2, w * 0.35, h * 0.15, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.ellipse(-w * 0.2, -h * 0.7, w * 0.1, h * 0.08, -0.5, 0, 7); ctx.fill();
    eye(-w * 0.1, -h * 0.58, 7, 0.7, 0, true); eye(w * 0.18, -h * 0.58, 7, 0.7, 0, true);
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(w * 0.05, -h * 0.35, 7, 0.2, Math.PI - 0.2); ctx.stroke();
    if (ex && ex.antenna) { ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(4, -h - 14); ctx.stroke(); ctx.fillStyle = '#ff5a7a'; ctx.beginPath(); ctx.arc(4, -h - 16, 5, 0, 7); ctx.fill(); }
    if (ex && ex.cilia) { for (let i = 0; i < 7; i++) { const a = Math.PI + i / 6 * Math.PI; ctx.beginPath(); ctx.moveTo(Math.cos(a) * w * 0.48, -h / 2 + Math.sin(a) * h * 0.5); ctx.lineTo(Math.cos(a) * w * 0.62, -h / 2 + Math.sin(a) * h * 0.62 + Math.sin(t * 12 + i) * 3); ctx.stroke(); } }
    ctx.restore();
  },
  bug(e, w, h, t, c1, c2, ex) {
    const step = Math.sin(t * 14);
    ctx.strokeStyle = INK; ctx.lineWidth = 4;
    for (let i = 0; i < 3; i++) { const lx = -w * 0.3 + i * w * 0.28; ctx.beginPath(); ctx.moveTo(lx, -h * 0.3); ctx.lineTo(lx + (i % 2 ? step : -step) * 8, 0); ctx.stroke(); }
    ctx.beginPath(); ctx.ellipse(-w * 0.05, -h * 0.5, w * 0.42, h * 0.42, 0, 0, 7); inkPath(c1);
    ctx.strokeStyle = c2; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-w * 0.05, -h * 0.9); ctx.lineTo(-w * 0.05, -h * 0.1); ctx.stroke();
    ctx.fillStyle = c2; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-w * 0.25 + (i % 2) * w * 0.35, -h * 0.55 + i * 6, 5, 0, 7); ctx.fill(); }
    ctx.beginPath(); ctx.arc(w * 0.38, -h * 0.45, h * 0.26, 0, 7); inkPath(shade(c1, -0.3));
    eye(w * 0.44, -h * 0.52, 6, 0.8, 0, true);
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(w * 0.5, -h * 0.65); ctx.quadraticCurveTo(w * 0.7, -h, w * 0.62, -h * 1.05); ctx.stroke();
    if (ex && ex.cracks) { ctx.strokeStyle = '#ffb42a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-w * 0.3, -h * 0.7); ctx.lineTo(-w * 0.15, -h * 0.5); ctx.lineTo(-w * 0.28, -h * 0.3); ctx.stroke(); }
  },
  crow(e, w, h, t) {
    let flap = crowFlap(t, 13), tilt = Math.sin(t * 2.3) * 0.06;
    if (e.state === 'swoop') { flap = -0.55; tilt = clamp(e.vy / 400, -1, 1) * 0.5; }
    ctx.save(); ctx.scale(1, 1);
    drawCrowRig(0, -h / 2, w * 1.5, 1, flap, tilt, e.flash > 0 ? 'brightness(3)' : null);
    ctx.restore();
  },
  turret(e, w, h, t, c1, c2) {
    ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.lineTo(-w * 0.4, -h * 0.45); ctx.lineTo(w * 0.4, -h * 0.45); ctx.lineTo(w / 2, 0); ctx.closePath(); inkPath(shade(c1, -0.2));
    const rc = e.recoil ? e.recoil * 30 : 0;
    ctx.beginPath(); ctx.roundRect(w * 0.05 - rc, -h * 0.68, w * 0.62, h * 0.18, 4); inkPath('#3a3a44');
    ctx.beginPath(); ctx.arc(0, -h * 0.5, w * 0.34, Math.PI, 0); ctx.closePath(); inkPath(c1);
    ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(w * 0.08, -h * 0.68, 6 + Math.sin(t * 8) * 1.5, 0, 7); ctx.fill();
  },
  rat(e, w, h, t, c1, c2) {
    const run = Math.sin(t * 18);
    ctx.strokeStyle = c2; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-w * 0.4, -h * 0.3); ctx.quadraticCurveTo(-w * 0.75, -h * 0.9 + run * 4, -w * 0.6, -h * 0.2); ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-w * 0.2, -h * 0.2); ctx.lineTo(-w * 0.2 + run * 6, 0); ctx.moveTo(w * 0.15, -h * 0.2); ctx.lineTo(w * 0.15 - run * 6, 0); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -h * 0.45, w * 0.4, h * 0.36, 0, 0, 7); inkPath(c1);
    ctx.beginPath(); ctx.moveTo(w * 0.2, -h * 0.7); ctx.lineTo(w * 0.58, -h * 0.4); ctx.lineTo(w * 0.2, -h * 0.25); ctx.closePath(); inkPath(c1);
    ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(w * 0.58, -h * 0.42, 4, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(w * 0.12, -h * 0.82, 9, 0, 7); inkPath(c2);
    eye(w * 0.32, -h * 0.55, 5, 0.6, 0, true);
  },
  drone(e, w, h, t, c1, c2) {
    ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-w * 0.35, -h * 0.75); ctx.lineTo(-w * 0.35, -h * 0.95); ctx.moveTo(w * 0.35, -h * 0.75); ctx.lineTo(w * 0.35, -h * 0.95); ctx.stroke();
    const s = Math.abs(Math.sin(t * 40));
    ctx.fillStyle = 'rgba(220,220,230,0.7)'; ctx.fillRect(-w * 0.35 - 18 * s, -h, 36 * s, 4); ctx.fillRect(w * 0.35 - 18 * s, -h, 36 * s, 4);
    ctx.beginPath(); ctx.roundRect(-w * 0.42, -h * 0.75, w * 0.84, h * 0.5, 10); inkPath(c1);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(w * 0.15, -h * 0.5, 9, 0, 7); ctx.fill();
    ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(w * 0.18, -h * 0.5, 5, 0, 7); ctx.fill();
  },
  can(e, w, h, t, c1, c2) {
    ctx.beginPath(); ctx.roundRect(-w / 2, -h * 0.85, w, h * 0.85, 6); inkPath(c1);
    ctx.strokeStyle = c2; ctx.lineWidth = 3; for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-w / 2 + 3, -h * 0.85 + i * h * 0.2); ctx.lineTo(w / 2 - 3, -h * 0.85 + i * h * 0.2); ctx.stroke(); }
    const lid = e.recoil ? 0.6 : Math.sin(t * 3) * 0.1;
    ctx.save(); ctx.translate(-w / 2, -h * 0.85); ctx.rotate(-lid); ctx.beginPath(); ctx.roundRect(-3, -8, w + 6, 10, 4); inkPath(shade(c1, 0.2)); ctx.restore();
    eye(-w * 0.1, -h * 0.9 - (e.recoil ? 8 : 0), 7, 0.7, 0, true); eye(w * 0.2, -h * 0.9 - (e.recoil ? 8 : 0), 7, 0.7, 0, true);
  },
  tire(e, w, h, t, c1, c2) {
    ctx.save(); ctx.translate(0, -h / 2); ctx.rotate(t * 6 * e.face);
    ctx.beginPath(); ctx.arc(0, 0, w / 2, 0, 7); inkPath(c1);
    ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(0, 0, w * 0.22, 0, 7); ctx.fill();
    ctx.strokeStyle = '#444'; ctx.lineWidth = 4; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * w * 0.38, Math.sin(a) * w * 0.38); ctx.lineTo(Math.cos(a) * w * 0.48, Math.sin(a) * w * 0.48); ctx.stroke(); }
    ctx.restore();
    eye(-6, -h * 0.55, 6, 0.7, 0, true); eye(10, -h * 0.55, 6, 0.7, 0, true);
  },
  dog(e, w, h, t, c1, c2) {
    const run = Math.sin(t * (e.state === 'charge' ? 26 : 12));
    ctx.strokeStyle = INK; ctx.lineWidth = 6;
    for (const [lx, ph] of [[-0.3, 1], [-0.15, -1], [0.2, -1], [0.32, 1]]) { ctx.beginPath(); ctx.moveTo(w * lx, -h * 0.35); ctx.lineTo(w * lx + run * ph * 8, 0); ctx.stroke(); }
    ctx.beginPath(); ctx.ellipse(-w * 0.02, -h * 0.5, w * 0.4, h * 0.26, 0, 0, 7); inkPath(c1);
    ctx.fillStyle = c2; ctx.beginPath(); ctx.ellipse(-w * 0.15, -h * 0.55, w * 0.12, h * 0.1, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(w * 0.36, -h * 0.72, w * 0.18, h * 0.2, 0.2, 0, 7); inkPath(c1);
    ctx.beginPath(); ctx.moveTo(w * 0.48, -h * 0.66); ctx.lineTo(w * 0.58, -h * 0.6); ctx.lineTo(w * 0.48, -h * 0.55); inkPath('#fff', 2);
    ctx.beginPath(); ctx.ellipse(w * 0.28, -h * 0.9, 8, 14, -0.5, 0, 7); inkPath(c2);
    eye(w * 0.4, -h * 0.78, 6, 0.7, 0, true);
    ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-w * 0.4, -h * 0.55); ctx.lineTo(-w * 0.55, -h * 0.8 + run * 5); ctx.stroke();
  },
  penguin(e, w, h, t, c1, c2) {
    const wad = Math.sin(t * 12) * 0.12;
    ctx.save(); ctx.rotate(wad);
    ctx.fillStyle = c2; ctx.beginPath(); ctx.ellipse(-8, -3, 10, 5, 0, 0, 7); ctx.ellipse(10, -3, 10, 5, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, -h * 0.5, w * 0.45, h * 0.5, 0, 0, 7); inkPath(c1);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(w * 0.08, -h * 0.42, w * 0.3, h * 0.36, 0, 0, 7); ctx.fill();
    eye(w * 0.05, -h * 0.75, 6, 0.8); eye(w * 0.25, -h * 0.75, 6, 0.8);
    ctx.fillStyle = c2; ctx.beginPath(); ctx.moveTo(w * 0.22, -h * 0.66); ctx.lineTo(w * 0.52, -h * 0.62); ctx.lineTo(w * 0.22, -h * 0.56); ctx.fill();
    ctx.restore();
  },
  bat(e, w, h, t, c1, c2) {
    const f = Math.sin(t * (e.state === 'swoop' ? 30 : 16));
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0, -h * 0.5); ctx.quadraticCurveTo(s * w * 0.3, -h * (0.9 + f * 0.4), s * w * 0.5, -h * (0.5 + f * 0.45)); ctx.lineTo(s * w * 0.35, -h * 0.35); ctx.lineTo(s * w * 0.2, -h * 0.45); ctx.closePath(); inkPath(c2); }
    ctx.beginPath(); ctx.ellipse(0, -h * 0.45, w * 0.18, h * 0.32, 0, 0, 7); inkPath(c1);
    ctx.beginPath(); ctx.moveTo(-8, -h * 0.7); ctx.lineTo(-12, -h * 0.95); ctx.lineTo(-2, -h * 0.75); ctx.moveTo(8, -h * 0.7); ctx.lineTo(12, -h * 0.95); ctx.lineTo(2, -h * 0.75); inkPath(c1, 2);
    ctx.fillStyle = '#ff3a3a'; ctx.beginPath(); ctx.arc(-5, -h * 0.55, 3, 0, 7); ctx.arc(5, -h * 0.55, 3, 0, 7); ctx.fill();
  },
  snowman(e, w, h, t, c1, c2) {
    ctx.beginPath(); ctx.arc(0, -h * 0.25, w * 0.5, 0, 7); inkPath(c1);
    ctx.beginPath(); ctx.arc(0, -h * 0.62, w * 0.38, 0, 7); inkPath(c1);
    ctx.beginPath(); ctx.arc(0, -h * 0.88, w * 0.28, 0, 7); inkPath(c1);
    ctx.fillStyle = INK; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(0, -h * 0.5 - i * 8 + 10, 3, 0, 7); ctx.fill(); }
    eye(-4, -h * 0.92, 4, 0.8, 0, true); eye(10, -h * 0.92, 4, 0.8, 0, true);
    ctx.fillStyle = c2; ctx.beginPath(); ctx.moveTo(6, -h * 0.86); ctx.lineTo(28, -h * 0.84); ctx.lineTo(6, -h * 0.8); ctx.fill();
    ctx.beginPath(); ctx.roundRect(-w * 0.3, -h * 1.18, w * 0.6, h * 0.16, 2); inkPath(INK); ctx.fillStyle = INK; ctx.fillRect(-w * 0.42, -h * 1.04, w * 0.84, 5);
    ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 4; const a = e.recoil ? -1.2 : -0.4; ctx.beginPath(); ctx.moveTo(w * 0.3, -h * 0.62); ctx.lineTo(w * 0.3 + Math.cos(a) * 30, -h * 0.62 + Math.sin(a) * 30); ctx.stroke();
  },
  yetiCub(e, w, h, t, c1, c2) {
    const run = Math.sin(t * (e.state === 'charge' ? 24 : 10));
    ctx.strokeStyle = INK; ctx.lineWidth = 10; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-w * 0.2, -h * 0.3); ctx.lineTo(-w * 0.2 + run * 8, -4); ctx.moveTo(w * 0.15, -h * 0.3); ctx.lineTo(w * 0.15 - run * 8, -4); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -h * 0.52, w * 0.45, h * 0.42, 0, 0, 7); inkPath(c1);
    for (let i = 0; i < 6; i++) { ctx.strokeStyle = c2; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-w * 0.3 + i * 10, -h * 0.85); ctx.lineTo(-w * 0.28 + i * 10, -h * 0.75); ctx.stroke(); }
    ctx.fillStyle = c2; ctx.beginPath(); ctx.ellipse(w * 0.15, -h * 0.6, w * 0.22, h * 0.18, 0, 0, 7); ctx.fill();
    eye(w * 0.08, -h * 0.65, 6, 0.7, 0, true); eye(w * 0.26, -h * 0.65, 6, 0.7, 0, true);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(w * 0.18, -h * 0.5, 9, 5, 0, 0, Math.PI); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(w * 0.12, -h * 0.5, 4, 5); ctx.fillRect(w * 0.22, -h * 0.5, 4, 5);
  },
  imp(e, w, h, t, c1, c2) {
    const f = Math.sin(t * 18);
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(-4 * s, -h * 0.6); ctx.lineTo(-s * w * 0.55, -h * (0.9 + f * 0.15)); ctx.lineTo(-s * w * 0.4, -h * 0.55); ctx.closePath(); inkPath(shade(c1, -0.35), 2); }
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-w * 0.15, -h * 0.25); ctx.quadraticCurveTo(-w * 0.5, -h * 0.1, -w * 0.45, -h * 0.4); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -h * 0.42, w * 0.28, h * 0.3, 0, 0, 7); inkPath(c1);
    ctx.beginPath(); ctx.moveTo(-w * 0.18, -h * 0.66); ctx.lineTo(-w * 0.25, -h * 0.95); ctx.lineTo(-w * 0.05, -h * 0.7); ctx.moveTo(w * 0.18, -h * 0.66); ctx.lineTo(w * 0.25, -h * 0.95); ctx.lineTo(w * 0.05, -h * 0.7); inkPath(c2, 2);
    eye(-w * 0.04, -h * 0.5, 5, 0.7, 0, true); eye(w * 0.14, -h * 0.5, 5, 0.7, 0, true);
    ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-w * 0.05, -h * 0.32); ctx.lineTo(w * 0.05, -h * 0.28); ctx.lineTo(w * 0.15, -h * 0.33); ctx.stroke();
  },
  fish(e, w, h, t, c1, c2) {
    const wag = Math.sin(t * 14) * 0.3;
    ctx.save(); ctx.translate(0, -h / 2);
    if (e.inLiquid) ctx.rotate(e.vy < 0 ? -1.2 : 1.2);
    ctx.save(); ctx.translate(-w * 0.35, 0); ctx.rotate(wag); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-w * 0.25, -h * 0.4); ctx.lineTo(-w * 0.25, h * 0.4); ctx.closePath(); inkPath(c2); ctx.restore();
    ctx.beginPath(); ctx.ellipse(0, 0, w * 0.4, h * 0.42, 0, 0, 7); inkPath(c1);
    ctx.beginPath(); ctx.moveTo(-w * 0.1, -h * 0.38); ctx.lineTo(w * 0.05, -h * 0.65); ctx.lineTo(w * 0.15, -h * 0.36); inkPath(c2, 2);
    eye(w * 0.2, -h * 0.08, 6, 0.8, 0, true);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(w * 0.28, h * 0.12); for (let i = 0; i < 4; i++) { ctx.lineTo(w * 0.3 + i * 3, h * 0.12 + (i % 2 ? 0 : 6)); } ctx.lineTo(w * 0.4, h * 0.1); ctx.fill();
    ctx.restore();
  },
  crab(e, w, h, t, c1, c2) {
    const s = Math.sin(t * 14);
    ctx.strokeStyle = INK; ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(d * w * 0.2, -h * 0.3); ctx.lineTo(d * (w * 0.35 + i * 6), -h * 0.15 + (i % 2 ? s : -s) * 3); ctx.lineTo(d * (w * 0.38 + i * 6), 0); ctx.stroke(); }
    ctx.beginPath(); ctx.ellipse(0, -h * 0.42, w * 0.36, h * 0.3, 0, 0, 7); inkPath(c1);
    for (const d of [-1, 1]) { ctx.save(); ctx.translate(d * w * 0.42, -h * 0.75); ctx.rotate(d * (0.3 + Math.max(0, s) * 0.3)); ctx.beginPath(); ctx.arc(0, 0, 10, 0.4, Math.PI * 2 - 0.4); ctx.lineTo(0, 0); ctx.closePath(); inkPath(c2, 2.5); ctx.restore(); }
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-6, -h * 0.65); ctx.lineTo(-8, -h * 0.9); ctx.moveTo(6, -h * 0.65); ctx.lineTo(8, -h * 0.9); ctx.stroke();
    eye(-8, -h * 0.95, 5, 0.6); eye(8, -h * 0.95, 5, 0.6);
  },
  urchin(e, w, h, t, c1, c2) {
    ctx.save(); ctx.translate(0, -h / 2);
    ctx.strokeStyle = c2; ctx.lineWidth = 3;
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2 + Math.sin(t * 3) * 0.05; const l = w * (0.55 + (i % 2) * 0.12 + (e.recoil ? 0.1 : 0)); ctx.beginPath(); ctx.moveTo(Math.cos(a) * w * 0.3, Math.sin(a) * w * 0.3); ctx.lineTo(Math.cos(a) * l, Math.sin(a) * l); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(0, 0, w * 0.34, 0, 7); inkPath(c1);
    eye(-6, -4, 5, 0.6, 0, true); eye(8, -4, 5, 0.6, 0, true);
    ctx.restore();
  },
  jelly(e, w, h, t, c1, c2) {
    const p = Math.sin(t * 4);
    ctx.save(); ctx.globalAlpha = 0.9;
    ctx.strokeStyle = c2; ctx.lineWidth = 3;
    for (let i = 0; i < 5; i++) { const x = -w * 0.3 + i * w * 0.15; ctx.beginPath(); ctx.moveTo(x, -h * 0.5); ctx.quadraticCurveTo(x + Math.sin(t * 5 + i) * 8, -h * 0.25, x + Math.sin(t * 4 + i) * 6, 0); ctx.stroke(); }
    ctx.beginPath(); ctx.ellipse(0, -h * 0.62, w * (0.48 - p * 0.04), h * (0.36 + p * 0.04), 0, Math.PI, 0); ctx.lineTo(w * 0.45, -h * 0.55); ctx.quadraticCurveTo(0, -h * 0.45, -w * 0.45, -h * 0.55); ctx.closePath();
    inkPath(c1);
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.ellipse(-w * 0.15, -h * 0.82, w * 0.1, h * 0.06, -0.4, 0, 7); ctx.fill();
    eye(-6, -h * 0.65, 4, 0.5); eye(8, -h * 0.65, 4, 0.5);
    ctx.restore();
  },
  eel(e, w, h, t, c1, c2) {
    ctx.save(); ctx.translate(0, -h / 2);
    ctx.lineCap = 'round';
    const pts = []; for (let i = 0; i <= 10; i++) { const x = -w / 2 + i * w / 10; pts.push([x, Math.sin(t * 8 - i * 0.7) * h * 0.25]); }
    for (const [lw, col] of [[h * 0.7 + 6, INK], [h * 0.7, c1]]) { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); }
    if (Math.sin(t * 3) > 0.6) { ctx.strokeStyle = c2; ctx.lineWidth = 2; for (let i = 0; i < 3; i++) { const [x, y] = pts[2 + i * 3]; ctx.beginPath(); ctx.moveTo(x, y - 20); ctx.lineTo(x + 6, y - 10); ctx.lineTo(x - 4, y - 4); ctx.lineTo(x + 2, y + 6); ctx.stroke(); } }
    const [hx, hy] = pts[10]; eye(hx - 4, hy - 5, 5, 0.8, 0, true);
    ctx.restore();
  },
  eye(e, w, h, t, c1, c2) {
    ctx.save(); ctx.translate(0, -h / 2);
    ctx.strokeStyle = '#a83a5a'; ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) { const a = Math.PI * 0.6 + i * 0.25; ctx.beginPath(); ctx.moveTo(Math.cos(a) * w * 0.4, Math.sin(a) * w * 0.4); ctx.quadraticCurveTo(Math.cos(a) * w * 0.7, Math.sin(a) * w * 0.7 + Math.sin(t * 6 + i) * 6, Math.cos(a) * w * 0.8, Math.sin(a) * w * 0.9); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(0, 0, w * 0.45, 0, 7); inkPath(c1);
    ctx.strokeStyle = 'rgba(200,40,60,0.6)'; ctx.lineWidth = 1.5; for (let i = 0; i < 5; i++) { const a = i * 1.3; ctx.beginPath(); ctx.moveTo(Math.cos(a) * w * 0.44, Math.sin(a) * w * 0.44); ctx.lineTo(Math.cos(a + 0.3) * w * 0.25, Math.sin(a + 0.3) * w * 0.25); ctx.stroke(); }
    const lx = clamp((player.x - e.x) / 300, -1, 1) * e.face, ly = clamp((player.y - e.y) / 300, -1, 1);
    ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(lx * w * 0.15, ly * w * 0.12, w * 0.22, 0, 7); ctx.fill();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(lx * w * 0.17, ly * w * 0.14, w * 0.11, 0, 7); ctx.fill();
    const bl = (t % 3) < 0.12; if (bl) { ctx.fillStyle = c1; ctx.beginPath(); ctx.arc(0, 0, w * 0.44, 0, 7); ctx.fill(); ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(-w * 0.4, 0); ctx.lineTo(w * 0.4, 0); ctx.stroke(); }
    ctx.restore();
  },
  polyp(e, w, h, t, c1, c2) {
    const sw = Math.sin(t * 3) * 0.1 - (e.recoil ? 0.3 : 0);
    ctx.save(); ctx.rotate(sw);
    ctx.beginPath(); ctx.moveTo(-w * 0.35, 0); ctx.quadraticCurveTo(-w * 0.45, -h * 0.6, -w * 0.25, -h * 0.85); ctx.lineTo(w * 0.25, -h * 0.85); ctx.quadraticCurveTo(w * 0.45, -h * 0.6, w * 0.35, 0); ctx.closePath(); inkPath(c1);
    ctx.beginPath(); ctx.ellipse(0, -h * 0.85, w * 0.32, h * 0.12, 0, 0, 7); inkPath(c2);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(0, -h * 0.85, w * 0.16, h * 0.05 + (e.recoil ? 4 : 0), 0, 0, 7); ctx.fill();
    eye(-w * 0.12, -h * 0.55, 5, 0.6, 0, true); eye(w * 0.14, -h * 0.55, 5, 0.6, 0, true);
    ctx.restore();
  },
  worm(e, w, h, t, c1, c2) {
    const segs = 7;
    for (let i = segs - 1; i >= 0; i--) {
      const x = -w / 2 + (i + 0.5) * w / segs, y = -h / 2 - Math.max(0, Math.sin(t * 8 - i * 0.9)) * 10;
      ctx.beginPath(); ctx.ellipse(x, y, w / segs * 0.65, h * 0.42, 0, 0, 7); inkPath(i === segs - 1 ? c1 : (i % 2 ? c1 : c2));
    }
    const hx = w / 2 - w / segs * 0.5, hy = -h / 2 - Math.max(0, Math.sin(t * 8 - (segs - 1) * 0.9)) * 10;
    eye(hx, hy - 6, 6, 0.8, 0, true);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(hx + 6, hy + 6, 5, 0, Math.PI); ctx.fill();
  },
  robot(e, w, h, t, c1, c2) {
    const step = Math.sin(t * 10);
    ctx.fillStyle = INK; ctx.fillRect(-w * 0.25 + step * 3, -h * 0.3, 8, h * 0.3); ctx.fillRect(w * 0.12 - step * 3, -h * 0.3, 8, h * 0.3);
    ctx.beginPath(); ctx.roundRect(-w * 0.4, -h * 0.75, w * 0.8, h * 0.48, 6); inkPath(c1);
    ctx.beginPath(); ctx.roundRect(-w * 0.3, -h, w * 0.6, h * 0.28, 6); inkPath(shade(c1, 0.15));
    ctx.fillStyle = INK; ctx.fillRect(-w * 0.2, -h * 0.92, w * 0.45, 10);
    ctx.fillStyle = c2; ctx.fillRect(-w * 0.1 + Math.sin(t * 3) * 6, -h * 0.9, 10, 6);
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(-w * 0.25, -h * 0.6, w * 0.5, 6);
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(0, -h - 10); ctx.stroke(); ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(0, -h - 12, 4, 0, 7); ctx.fill();
  },
  springbot(e, w, h, t, c1, c2) {
    const comp = e.onGround ? 0.7 + Math.sin(t * 8) * 0.05 : 1.15;
    ctx.strokeStyle = '#d8d8e8'; ctx.lineWidth = 4; ctx.beginPath();
    for (let i = 0; i <= 5; i++) ctx.lineTo(i % 2 ? 10 : -10, -i * h * 0.08 * comp);
    ctx.stroke();
    ctx.beginPath(); ctx.roundRect(-w / 2, -h * 0.45 * comp - h * 0.5, w, h * 0.5, 10); inkPath(c1);
    eye(-8, -h * 0.45 * comp - h * 0.28, 7, 0.7, 0, true); eye(10, -h * 0.45 * comp - h * 0.28, 7, 0.7, 0, true);
  },
  tank(e, w, h, t, c1, c2) {
    ctx.beginPath(); ctx.roundRect(-w / 2, -h * 0.32, w, h * 0.32, 14); inkPath('#2a2a33');
    ctx.fillStyle = '#5a5a66'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(-w * 0.38 + i * w * 0.19, -h * 0.16, 7, 0, 7); ctx.fill(); }
    ctx.beginPath(); ctx.roundRect(-w * 0.42, -h * 0.75, w * 0.84, h * 0.46, 8); inkPath(c1);
    ctx.fillStyle = c2; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(w * 0.42, -h * 0.75 + i * h * 0.12); ctx.lineTo(w * 0.58, -h * 0.69 + i * h * 0.12); ctx.lineTo(w * 0.42, -h * 0.63 + i * h * 0.12); ctx.fill(); }
    ctx.fillStyle = INK; ctx.fillRect(w * 0.05, -h * 0.68, w * 0.28, 12);
    ctx.fillStyle = e.state === 'wind' || e.state === 'charge' ? '#ff2a2a' : '#ffd23f'; ctx.fillRect(w * 0.1, -h * 0.66, w * 0.18, 8);
  },
  spider(e, w, h, t, c1, c2) {
    const s = Math.sin(t * 16);
    ctx.strokeStyle = INK; ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) for (const d of [-1, 1]) { const ph = (i % 2 ? s : -s) * 4; ctx.beginPath(); ctx.moveTo(d * 6, -h * 0.45); ctx.lineTo(d * (w * 0.3 + i * 4), -h * 0.85 + i * 6 + ph); ctx.lineTo(d * (w * 0.4 + i * 4), ph * 0.5); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(-w * 0.3, -h * 0.4); ctx.lineTo(0, -h * 0.75); ctx.lineTo(w * 0.3, -h * 0.4); ctx.lineTo(0, -h * 0.15); ctx.closePath(); inkPath(c1);
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.moveTo(-w * 0.15, -h * 0.45); ctx.lineTo(0, -h * 0.65); ctx.lineTo(0, -h * 0.45); ctx.fill();
    ctx.fillStyle = '#ff3a3a'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(w * 0.08 + (i % 2) * 8, -h * 0.5 + Math.floor(i / 2) * 7, 2.5, 0, 7); ctx.fill(); }
  },
  gem(e, w, h, t, c1, c2, ex) {
    const hop = ex && ex.hop && !e.onGround ? 0.1 : 0;
    ctx.save(); ctx.scale(1 - hop, 1 + hop);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-w / 2, -h * 0.55); ctx.lineTo(-w * 0.25, -h); ctx.lineTo(w * 0.25, -h); ctx.lineTo(w / 2, -h * 0.55); ctx.closePath(); inkPath(c1);
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.moveTo(-w * 0.25, -h); ctx.lineTo(-w / 2, -h * 0.55); ctx.lineTo(0, -h * 0.55); ctx.closePath(); ctx.fill();
    ctx.fillStyle = c2; ctx.globalAlpha = 0.4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -h * 0.55); ctx.lineTo(w / 2, -h * 0.55); ctx.fill(); ctx.globalAlpha = 1;
    eye(-6, -h * 0.6, 5, 0.6, 0, true); eye(8, -h * 0.6, 5, 0.6, 0, true);
    ctx.restore();
  },
  stoneGolem(e, w, h, t, c1, c2) {
    const step = Math.sin(t * (e.state === 'charge' ? 20 : 8));
    ctx.beginPath(); ctx.roundRect(-w * 0.35 + step * 4, -h * 0.3, w * 0.25, h * 0.3, 6); inkPath(shade(c1, -0.2));
    ctx.beginPath(); ctx.roundRect(w * 0.1 - step * 4, -h * 0.3, w * 0.25, h * 0.3, 6); inkPath(shade(c1, -0.2));
    ctx.beginPath(); ctx.roundRect(-w * 0.45, -h * 0.85, w * 0.9, h * 0.6, 14); inkPath(c1);
    ctx.beginPath(); ctx.roundRect(w * 0.3, -h * 0.75 + step * 4, w * 0.3, h * 0.42, 8); inkPath(shade(c1, 0.1));
    ctx.fillStyle = c2; ctx.beginPath(); ctx.moveTo(-w * 0.1, -h * 0.9); ctx.lineTo(0, -h * 1.08); ctx.lineTo(w * 0.1, -h * 0.9); ctx.fill();
    ctx.fillStyle = c2; ctx.fillRect(w * 0.05, -h * 0.7, 12, 6); ctx.fillRect(w * 0.22, -h * 0.7, 12, 6);
  },
  bubbleGuy(e, w, h, t, c1, c2) {
    ctx.save(); ctx.translate(0, -h / 2); const s = 1 + Math.sin(t * 5) * 0.05; ctx.scale(s, 1 / s);
    ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(0, 0, w * 0.45, 0, 7); inkPath(c1); ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.ellipse(-w * 0.18, -w * 0.18, w * 0.1, w * 0.06, -0.6, 0, 7); ctx.fill();
    eye(-6, -2, 6, 0.6, 0, true); eye(10, -2, 6, 0.6, 0, true);
    ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(4, 12, 5, 0, 7); ctx.fill();
    ctx.restore();
  },
  ghost(e, w, h, t, c1, c2) {
    ctx.save(); ctx.globalAlpha = 0.85 + Math.sin(t * 4) * 0.1;
    ctx.beginPath(); ctx.moveTo(-w / 2, -h * 0.1); ctx.quadraticCurveTo(-w / 2, -h, 0, -h); ctx.quadraticCurveTo(w / 2, -h, w / 2, -h * 0.1);
    for (let i = 0; i < 4; i++) ctx.quadraticCurveTo(w / 2 - (i + 0.5) * w / 4, Math.sin(t * 8 + i) * 6 + 4, w / 2 - (i + 1) * w / 4, -h * 0.1);
    ctx.closePath(); inkPath(c1);
    ctx.fillStyle = c2;
    ctx.beginPath(); ctx.ellipse(-w * 0.05, -h * 0.65, 5, 8, 0, 0, 7); ctx.ellipse(w * 0.22, -h * 0.65, 5, 8, 0, 0, 7); ctx.fill();
    ctx.restore();
  },
  gorilla(e, w, h, t, c1, c2) {
    const step = Math.sin(t * (e.state === 'charge' ? 22 : 9));
    ctx.beginPath(); ctx.ellipse(-w * 0.2, -h * 0.15, 12, h * 0.15, 0, 0, 7); inkPath(shade(c1, -0.2));
    ctx.beginPath(); ctx.ellipse(w * 0.15, -h * 0.15, 12, h * 0.15, 0, 0, 7); inkPath(shade(c1, -0.2));
    ctx.beginPath(); ctx.ellipse(-w * 0.02, -h * 0.55, w * 0.42, h * 0.36, 0, 0, 7); inkPath(c1);
    ctx.beginPath(); ctx.ellipse(w * 0.38, -h * 0.3 + step * 5, 14, h * 0.28, -0.2, 0, 7); inkPath(c1);
    ctx.beginPath(); ctx.ellipse(-w * 0.38, -h * 0.3 - step * 5, 14, h * 0.28, 0.2, 0, 7); inkPath(shade(c1, -0.15));
    ctx.beginPath(); ctx.ellipse(w * 0.15, -h * 0.82, w * 0.2, h * 0.17, 0, 0, 7); inkPath(shade(c1, 0.1));
    ctx.fillStyle = '#8a8a9a'; ctx.beginPath(); ctx.roundRect(w * 0.05, -h * 0.92, w * 0.24, 10, 3); ctx.fill();
    ctx.fillStyle = c2; ctx.fillRect(w * 0.18, -h * 0.9, 9, 6);
  },
  // ----- новые враги -----
  snowball(e, w, h, t, c1, c2) {
    ctx.save(); ctx.translate(0, -h / 2); ctx.rotate(e.x / (w / 2));
    ctx.beginPath(); ctx.arc(0, 0, w / 2, 0, 7); inkPath(c1);
    ctx.fillStyle = c2; for (let i = 0; i < 5; i++) { const a = i * 1.3; ctx.beginPath(); ctx.ellipse(Math.cos(a) * w * 0.28, Math.sin(a) * w * 0.28, w * 0.1, w * 0.06, a, 0, 7); ctx.fill(); }
    ctx.restore();
    eye(-w * 0.05, -h * 0.6, 6, 0.8, 0, true); eye(w * 0.22, -h * 0.6, 6, 0.8, 0, true);
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(w * 0.1, -h * 0.3, 7, Math.PI + 0.3, -0.3); ctx.stroke();
  },
  magma(e, w, h, t, c1, c2) {
    const sq = Math.sin(t * 7) * 0.06;
    ctx.save(); ctx.scale(1 + sq, 1 - sq);
    glow(0, -h * 0.5, w * 0.8, c1, 0.35);
    blobShape(w, h, 10); inkPath(c2);
    ctx.strokeStyle = c1; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-w * 0.35, -h * 0.25); ctx.lineTo(-w * 0.1, -h * 0.5); ctx.lineTo(-w * 0.2, -h * 0.75); ctx.moveTo(w * 0.1, -h * 0.15); ctx.lineTo(w * 0.3, -h * 0.4); ctx.stroke();
    ctx.fillStyle = c1; ctx.beginPath(); ctx.arc(w * 0.12, -h * 0.62, 9, 0, 7); ctx.arc(w * 0.34, -h * 0.6, 7, 0, 7); ctx.fill();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(w * 0.15, -h * 0.62, 4, 0, 7); ctx.arc(w * 0.36, -h * 0.6, 3, 0, 7); ctx.fill();
    ctx.restore();
  },
  volcano(e, w, h, t, c1, c2) {
    const rc = e.recoil ? e.recoil * 12 : 0;
    ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.lineTo(-w * 0.16, -h + rc); ctx.lineTo(w * 0.16, -h + rc); ctx.lineTo(w / 2, 0); ctx.closePath(); inkPath(c1);
    ctx.fillStyle = c2; ctx.beginPath(); ctx.ellipse(0, -h + rc, w * 0.16, 5, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = c2; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-w * 0.06, -h + rc); ctx.lineTo(-w * 0.12, -h * 0.6); ctx.moveTo(w * 0.08, -h + rc); ctx.lineTo(w * 0.14, -h * 0.7); ctx.stroke();
    if (e.burst > 0 || rc) glow(0, -h, 40, c2, 0.6);
    else if (Math.sin(t * 3) > 0.6) { ctx.fillStyle = 'rgba(80,70,70,0.6)'; ctx.beginPath(); ctx.arc(Math.sin(t * 5) * 4, -h - 12 - (t * 30) % 20, 7, 0, 7); ctx.fill(); }
    eye(-w * 0.12, -h * 0.35, 7, 0.7, 0, true); eye(w * 0.14, -h * 0.35, 7, 0.7, 0, true);
  },
  salamander(e, w, h, t, c1, c2) {
    const run = Math.sin(t * (e.state === 'charge' ? 24 : 10));
    ctx.strokeStyle = INK; ctx.lineWidth = 6;
    for (const [lx, ph] of [[-0.25, 1], [-0.1, -1], [0.18, -1], [0.3, 1]]) { ctx.beginPath(); ctx.moveTo(w * lx, -h * 0.35); ctx.lineTo(w * lx + run * ph * 9, 0); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(-w * 0.3, -h * 0.5); ctx.quadraticCurveTo(-w * 0.55, -h * 0.4 + run * 6, -w * 0.62, -h * 0.75); ctx.quadraticCurveTo(-w * 0.45, -h * 0.25, -w * 0.25, -h * 0.25); inkPath(c1);
    ctx.beginPath(); ctx.ellipse(0, -h * 0.45, w * 0.34, h * 0.26, 0, 0, 7); inkPath(c1);
    ctx.beginPath(); ctx.ellipse(w * 0.36, -h * 0.55, w * 0.16, h * 0.22, 0.15, 0, 7); inkPath(c1);
    ctx.fillStyle = c2; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(-w * 0.2 + i * w * 0.13, -h * 0.66, 5, 0, 7); ctx.fill(); }
    for (let i = 0; i < 4; i++) { const fx = -w * 0.25 + i * w * 0.14, fl = 10 + Math.sin(t * 20 + i * 2) * 5; ctx.fillStyle = i % 2 ? '#ffd23f' : '#ff8a1a'; ctx.beginPath(); ctx.moveTo(fx - 6, -h * 0.68); ctx.quadraticCurveTo(fx, -h * 0.7 - fl * 1.6, fx + 6, -h * 0.68); ctx.fill(); }
    eye(w * 0.4, -h * 0.66, 6, 0.8, 0, true);
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(w * 0.36, -h * 0.45); ctx.lineTo(w * 0.5, -h * 0.47); ctx.stroke();
  },
  piranha(e, w, h, t, c1, c2) {
    const tail = Math.sin(t * 16) * 0.35;
    ctx.save(); ctx.translate(-w * 0.35, -h / 2); ctx.rotate(tail); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-w * 0.2, -h * 0.35); ctx.lineTo(-w * 0.2, h * 0.35); ctx.closePath(); inkPath(shade(c1, -0.2)); ctx.restore();
    ctx.beginPath(); ctx.ellipse(0, -h / 2, w * 0.4, h * 0.46, 0, 0, 7); inkPath(c1);
    ctx.fillStyle = c2; ctx.beginPath(); ctx.ellipse(w * 0.02, -h * 0.3, w * 0.3, h * 0.18, 0, 0, Math.PI); ctx.fill();
    const bite = (Math.sin(t * 12) + 1) * 0.5;
    ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(w * 0.42, -h * 0.5); ctx.lineTo(w * 0.15, -h * 0.42 - bite * 4); ctx.lineTo(w * 0.15, -h * 0.32 + bite * 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(w * (0.18 + i * 0.07), -h * 0.43 - bite * 3); ctx.lineTo(w * (0.21 + i * 0.07), -h * 0.36); ctx.lineTo(w * (0.24 + i * 0.07), -h * 0.43 - bite * 3); ctx.fill(); }
    eye(w * 0.15, -h * 0.65, 7, 0.8, 0.3, true);
    ctx.beginPath(); ctx.moveTo(-w * 0.1, -h * 0.92); ctx.lineTo(w * 0.05, -h * 1.12); ctx.lineTo(w * 0.12, -h * 0.9); inkPath(shade(c1, -0.2), 2);
  },
  tick(e, w, h, t, c1, c2) {
    const step = Math.sin(t * 16);
    ctx.strokeStyle = INK; ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) { const lx = -w * 0.3 + i * w * 0.2; ctx.beginPath(); ctx.moveTo(lx, -h * 0.4); ctx.quadraticCurveTo(lx + (i < 2 ? -10 : 10), -h * 0.55, lx + (i % 2 ? step : -step) * 6 + (i < 2 ? -8 : 8), 0); ctx.stroke(); }
    ctx.beginPath(); ctx.ellipse(-w * 0.05, -h * 0.5, w * 0.4, h * 0.42, 0, 0, 7); inkPath(c1);
    ctx.fillStyle = c2; ctx.beginPath(); ctx.ellipse(-w * 0.1, -h * 0.65, w * 0.2, h * 0.12, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(w * 0.35, -h * 0.4, h * 0.22, 0, 7); inkPath(c2);
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(w * 0.5, -h * 0.4); ctx.lineTo(w * 0.62, -h * 0.3); ctx.moveTo(w * 0.48, -h * 0.32); ctx.lineTo(w * 0.58, -h * 0.18); ctx.stroke();
    eye(w * 0.32, -h * 0.52, 5, 0.8, 0, true); eye(w * 0.45, -h * 0.5, 4, 0.8, 0, true);
  },
  microbe(e, w, h, t, c1, c2) {
    const sq = e.squash > 0 ? 0.22 : Math.sin(t * 6) * 0.06;
    ctx.save(); ctx.scale(1 + sq, 1 - sq);
    ctx.strokeStyle = shade(c2, -0.2); ctx.lineWidth = 3;
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * w * 0.42, -h / 2 + Math.sin(a) * h * 0.42); ctx.lineTo(Math.cos(a) * w * 0.56, -h / 2 + Math.sin(a) * h * 0.56 + Math.sin(t * 10 + i) * 3); ctx.stroke(); }
    ctx.beginPath(); ctx.ellipse(0, -h / 2, w * 0.44, h * 0.44, 0, 0, 7); inkPath(c1);
    ctx.fillStyle = c2; ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(-w * 0.12, -h * 0.4, w * 0.14, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(w * 0.18, -h * 0.28, w * 0.07, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    eye(w * 0.12, -h * 0.6, 8, 0.6, 0, true);
    ctx.restore();
  },
  heliBot(e, w, h, t, c1, c2) {
    const s = Math.abs(Math.sin(t * 38));
    ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, -h * 0.75); ctx.lineTo(0, -h * 0.95); ctx.stroke();
    ctx.fillStyle = 'rgba(220,230,240,0.75)'; ctx.fillRect(-w * 0.6 * s, -h, w * 1.2 * s, 5);
    ctx.beginPath(); ctx.moveTo(-w * 0.35, -h * 0.55); ctx.lineTo(-w * 0.6, -h * 0.65); ctx.lineTo(-w * 0.6, -h * 0.45); ctx.closePath(); inkPath(shade(c1, -0.2), 2);
    ctx.beginPath(); ctx.ellipse(0, -h * 0.5, w * 0.38, h * 0.3, 0, 0, 7); inkPath(c1);
    const warn = e.state === 'warn' && Math.floor(t * 16) % 2;
    ctx.beginPath(); ctx.arc(w * 0.08, -h * 0.25, 8, 0, Math.PI); inkPath(warn ? '#ff2a2a' : c2, 2);
    ctx.fillStyle = INK; ctx.fillRect(w * 0.05, -h * 0.62, w * 0.24, h * 0.14);
    ctx.fillStyle = c2; ctx.fillRect(w * 0.12 + Math.sin(t * 3) * 3, -h * 0.6, 7, h * 0.1);
  },
  sentry(e, w, h, t, c1, c2) {
    ctx.strokeStyle = INK; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(0, -h * 0.45); ctx.lineTo(-w * 0.42, 0); ctx.moveTo(0, -h * 0.45); ctx.lineTo(w * 0.42, 0); ctx.moveTo(0, -h * 0.45); ctx.lineTo(0, 0); ctx.stroke();
    const rc = e.recoil ? e.recoil * 40 : 0;
    ctx.beginPath(); ctx.roundRect(w * 0.1 - rc, -h * 0.78, w * 0.55, 10, 3); inkPath('#2a2a34', 2);
    ctx.beginPath(); ctx.roundRect(-w * 0.32, -h * 0.95, w * 0.64, h * 0.45, 8); inkPath(c1);
    const on = e.burst > 0 || Math.sin(t * 4) > 0;
    glow(w * 0.12, -h * 0.75, 18, c2, on ? 0.7 : 0.25);
    ctx.fillStyle = on ? c2 : shade(c2, -0.5); ctx.beginPath(); ctx.arc(w * 0.12, -h * 0.75, 7, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(-w * 0.28, -h * 0.58, w * 0.56, 4);
  },
  moth(e, w, h, t, c1, c2) {
    const flap = Math.sin(t * 18);
    for (const s of [-1, 1]) {
      ctx.save(); ctx.translate(-w * 0.05, -h * 0.55); ctx.scale(1, flap * s * 0.5 + (s > 0 ? 0.6 : -0.6));
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-w * 0.55, -h * 0.9, -w * 0.15, -h * 0.85); ctx.quadraticCurveTo(w * 0.35, -h * 0.9, 0, 0); inkPath(c1, 2.5);
      ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(-w * 0.08, -h * 0.55, 6, 0, 7); ctx.fill();
      ctx.restore();
    }
    ctx.beginPath(); ctx.ellipse(0, -h * 0.5, w * 0.12, h * 0.32, 0.3, 0, 7); inkPath(shade(c1, -0.35));
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(w * 0.08, -h * 0.75); ctx.quadraticCurveTo(w * 0.2, -h, w * 0.3, -h * 0.95); ctx.moveTo(w * 0.04, -h * 0.78); ctx.quadraticCurveTo(w * 0.05, -h * 1.05, w * 0.16, -h * 1.08); ctx.stroke();
    eye(w * 0.1, -h * 0.68, 5, 0.8, 0, true);
    glow(0, -h * 0.5, w * 0.6, c2, 0.25);
  },
  geode(e, w, h, t, c1, c2) {
    const open = !e.onGround;
    ctx.save(); ctx.translate(0, -h / 2);
    if (!open) {
      // закрытая — каменная скорлупа, пули отскакивают
      ctx.beginPath(); for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2, rr = (i % 2 ? 0.46 : 0.5); ctx.lineTo(Math.cos(a) * w * rr, Math.sin(a) * h * rr); } ctx.closePath(); inkPath(c1);
      ctx.strokeStyle = shade(c1, -0.35); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-w * 0.45, 0); ctx.lineTo(w * 0.45, 0); ctx.stroke();
      ctx.fillStyle = INK; ctx.fillRect(w * 0.08, -h * 0.08, 14, 4);
    } else {
      // в прыжке раскрывается — уязвима!
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(0, s * 6, w * 0.48, s > 0 ? 0 : Math.PI, s > 0 ? Math.PI : Math.PI * 2); ctx.closePath(); inkPath(c1); }
      ctx.beginPath(); ctx.ellipse(0, 0, w * 0.4, h * 0.16, 0, 0, 7); inkPath(shade(c1, -0.4), 2);
      ctx.fillStyle = c2; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * w * 0.14 - 6, 4); ctx.lineTo(i * w * 0.14, -10 - (2 - Math.abs(i)) * 3); ctx.lineTo(i * w * 0.14 + 6, 4); ctx.fill(); }
      glow(0, 0, w * 0.6, c2, 0.4);
      eye(w * 0.12, -2, 5, 0.8, 0, true);
    }
    ctx.restore();
  },
  snailKnight(e, w, h, t, c1, c2) {
    const sq = Math.sin(t * 6) * 0.04;
    ctx.save(); ctx.scale(1 + sq, 1 - sq);
    ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.lineTo(w * 0.45, 0); ctx.quadraticCurveTo(w * 0.5, -h * 0.5, w * 0.3, -h * 0.55); ctx.lineTo(-w * 0.4, -h * 0.2); ctx.closePath(); inkPath('#c8e86a');
    ctx.beginPath(); ctx.arc(-w * 0.1, -h * 0.5, h * 0.42, 0, 7); inkPath(c1);
    ctx.strokeStyle = c2; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(-w * 0.1, -h * 0.5, h * 0.26, 0, 5); ctx.stroke(); ctx.beginPath(); ctx.arc(-w * 0.1, -h * 0.5, h * 0.11, 0, 5); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(w * 0.32, -h * 0.78, w * 0.14, h * 0.16, 0, Math.PI, 0); inkPath('#c8c8d8');
    ctx.fillStyle = '#ff3a3a'; ctx.beginPath(); ctx.moveTo(w * 0.3, -h * 0.92); ctx.quadraticCurveTo(w * 0.15, -h * 1.15, w * 0.05, -h * 0.95); ctx.lineTo(w * 0.28, -h * 0.88); ctx.fill();
    eye(w * 0.38, -h * 0.66, 5, 0.8, 0, true);
    ctx.restore();
  },
  slimeFountain(e, w, h, t, c1, c2) {
    const rc = e.recoil ? e.recoil * 20 : 0;
    ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.lineTo(-w * 0.35, -h * 0.25); ctx.lineTo(w * 0.35, -h * 0.25); ctx.lineTo(w / 2, 0); ctx.closePath(); inkPath('#8a7a9a');
    ctx.beginPath(); ctx.roundRect(-w * 0.14, -h * 0.7, w * 0.28, h * 0.46, 4); inkPath('#a89ab8');
    ctx.beginPath(); ctx.ellipse(0, -h * 0.72, w * 0.36, h * 0.1, 0, 0, 7); inkPath('#8a7a9a');
    const jet = h * (0.25 + Math.abs(Math.sin(t * 4)) * 0.1) + rc;
    ctx.fillStyle = c1; ctx.beginPath(); ctx.moveTo(-w * 0.1, -h * 0.75); ctx.quadraticCurveTo(-w * 0.18, -h * 0.75 - jet, 0, -h * 0.75 - jet * 1.2); ctx.quadraticCurveTo(w * 0.18, -h * 0.75 - jet, w * 0.1, -h * 0.75); ctx.fill();
    ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(0, -h * 0.75 - jet, 6, 0, 7); ctx.fill();
    eye(-w * 0.12, -h * 0.5, 6, 0.8, 0, true); eye(w * 0.12, -h * 0.5, 6, 0.8, 0, true);
  },
  jellyCube(e, w, h, t, c1, c2) {
    const sq = e.squash > 0 ? 0.2 : Math.sin(t * 7) * 0.05;
    const air = e.onGround === false;
    ctx.save(); ctx.scale(1 + (air ? -0.1 : sq), 1 + (air ? 0.12 : -sq));
    ctx.globalAlpha *= 0.85;
    ctx.beginPath(); ctx.roundRect(-w / 2, -h, w, h, 10); inkPath(c1);
    ctx.globalAlpha /= 0.85;
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(-w * 0.38, -h * 0.9, w * 0.18, h * 0.1);
    ctx.fillStyle = c2; ctx.globalAlpha *= 0.5; ctx.beginPath(); ctx.arc(-w * 0.2, -h * 0.25, 6, 0, 7); ctx.arc(w * 0.2, -h * 0.4, 4, 0, 7); ctx.fill(); ctx.globalAlpha /= 0.5;
    eye(-w * 0.08, -h * 0.6, 7, 0.7, 0, true); eye(w * 0.2, -h * 0.6, 7, 0.7, 0, true);
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-w * 0.02, -h * 0.32); ctx.lineTo(w * 0.08, -h * 0.38); ctx.lineTo(w * 0.18, -h * 0.32); ctx.stroke();
    ctx.restore();
  },
  slugGuard(e, w, h, t, c1, c2) {
    const wind = e.state === 'wind' ? -16 : e.state === 'lunge' ? 26 : 0;
    const sq = Math.sin(t * 5) * 0.03;
    ctx.save(); ctx.scale(1 + sq, 1 - sq);
    ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.quadraticCurveTo(-w * 0.45, -h * 0.75, 0, -h * 0.85); ctx.quadraticCurveTo(w * 0.42, -h * 0.85, w * 0.4, 0); ctx.closePath(); inkPath('#b8d85a');
    ctx.beginPath(); ctx.roundRect(-w * 0.38, -h * 0.62, w * 0.72, h * 0.4, 8); inkPath(c1);
    ctx.fillStyle = c2; ctx.fillRect(-w * 0.05, -h * 0.6, w * 0.1, h * 0.36);
    ctx.beginPath(); ctx.ellipse(0, -h * 0.84, w * 0.3, h * 0.12, 0, Math.PI, 0); inkPath(c1);
    ctx.fillStyle = '#ff3a3a'; ctx.fillRect(-4, -h * 1.02, 8, h * 0.1);
    eye(w * 0.08, -h * 0.72, 6, 0.8, 0, true); eye(w * 0.26, -h * 0.72, 6, 0.8, 0, true);
    ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(-w * 0.2 + wind, -h * 0.45); ctx.lineTo(w * 0.85 + wind, -h * 0.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w * 0.85 + wind, -h * 0.58); ctx.lineTo(w * 1.05 + wind, -h * 0.5); ctx.lineTo(w * 0.85 + wind, -h * 0.42); ctx.closePath(); inkPath('#e0e0f0', 2);
    ctx.restore();
  },
  skullFly(e, w, h, t, c1, c2) {
    for (let i = 0; i < 4; i++) { const fx = -w * 0.3 - i * 8, fl = Math.sin(t * 18 + i) * 5; ctx.fillStyle = i % 2 ? c2 : shade(c2, 0.4); ctx.globalAlpha = 0.8 - i * 0.15; ctx.beginPath(); ctx.ellipse(fx, -h * 0.5 + fl, 14 - i * 2, 10 - i * 1.5, 0, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
    glow(0, -h * 0.5, w * 0.8, c2, 0.35);
    ctx.beginPath(); ctx.arc(0, -h * 0.58, w * 0.4, 0, 7); inkPath(c1);
    ctx.beginPath(); ctx.roundRect(-w * 0.2, -h * 0.32, w * 0.42, h * 0.22, 4); inkPath(c1);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(w * 0.02, -h * 0.6, 7, 8, 0, 0, 7); ctx.ellipse(w * 0.24, -h * 0.6, 6, 7, 0, 0, 7); ctx.fill();
    ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(w * 0.04, -h * 0.6, 3, 0, 7); ctx.arc(w * 0.25, -h * 0.6, 3, 0, 7); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-w * 0.12 + i * w * 0.1, -h * 0.3); ctx.lineTo(-w * 0.12 + i * w * 0.1, -h * 0.12); ctx.stroke(); }
  },
  obelisk(e, w, h, t, c1, c2) {
    const fl = Math.sin(t * 2) * 4 - (e.recoil ? e.recoil * 10 : 0);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 0, w * 0.4, 5, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-w * 0.35, -8 + fl); ctx.lineTo(-w * 0.22, -h + fl); ctx.lineTo(0, -h - 14 + fl); ctx.lineTo(w * 0.22, -h + fl); ctx.lineTo(w * 0.35, -8 + fl); ctx.closePath(); inkPath(c1);
    ctx.strokeStyle = c2; ctx.lineWidth = 2; ctx.globalAlpha = 0.6 + Math.sin(t * 5) * 0.3;
    ctx.beginPath(); ctx.moveTo(-6, -h * 0.3 + fl); ctx.lineTo(0, -h * 0.4 + fl); ctx.lineTo(6, -h * 0.3 + fl); ctx.moveTo(-5, -h * 0.82 + fl); ctx.lineTo(5, -h * 0.82 + fl); ctx.stroke();
    ctx.globalAlpha = 1;
    glow(0, -h * 0.6 + fl, 26, c2, 0.6);
    ctx.fillStyle = c2; ctx.beginPath(); ctx.ellipse(0, -h * 0.6 + fl, 9, 6, 0, 0, 7); ctx.fill();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(2, -h * 0.6 + fl, 3, 5, 0, 0, 7); ctx.fill();
  },
  boxJack(e, w, h, t, c1, c2) {
    ctx.beginPath(); ctx.roundRect(-w / 2, -h * 0.6, w, h * 0.6, 4); inkPath(c1);
    ctx.fillStyle = c2; ctx.beginPath(); ctx.moveTo(-w * 0.25, -h * 0.3); ctx.lineTo(0, -h * 0.5); ctx.lineTo(w * 0.25, -h * 0.3); ctx.lineTo(0, -h * 0.1); ctx.closePath(); ctx.fill();
    if (e.hidden) { ctx.beginPath(); ctx.roundRect(-w / 2 - 3, -h * 0.68, w + 6, 10, 3); inkPath(shade(c1, 0.2)); return; }
    ctx.save(); ctx.translate(-w / 2, -h * 0.6); ctx.rotate(-1.9); ctx.beginPath(); ctx.roundRect(0, -10, w, 10, 3); inkPath(shade(c1, 0.2)); ctx.restore();
    const bob = Math.sin(t * 9) * 6;
    ctx.strokeStyle = '#c8c8d8'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, -h * 0.6);
    for (let i = 1; i <= 4; i++) ctx.lineTo((i % 2 ? 8 : -8), -h * 0.6 - i * 9 - bob * i / 4); ctx.stroke();
    const hy = -h * 0.6 - 44 - bob;
    ctx.beginPath(); ctx.arc(0, hy, 16, 0, 7); inkPath('#f6ecd0');
    ctx.fillStyle = c2; ctx.beginPath(); ctx.moveTo(-16, hy - 6); ctx.lineTo(-22, hy - 26); ctx.lineTo(-4, hy - 14); ctx.lineTo(4, hy - 30); ctx.lineTo(10, hy - 14); ctx.lineTo(24, hy - 24); ctx.lineTo(16, hy - 6); ctx.fill();
    eye(-3, hy - 2, 5, 0.8, 0, true); eye(9, hy - 2, 5, 0.8, 0, true);
    ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(3, hy + 4, 7, 0.2, Math.PI - 0.2); ctx.stroke();
  }
};
function drawEnemy(e) {
  const cx = e.x + e.w / 2 - camX;
  if (cx < -150 || cx > W + 150) return;
  const fn = DRAW[e.def.draw] || DRAW.blob;
  const t = e.frozen > 0 ? 0 : e.t;
  // спрятавшийся враг: бугорок и глазки (табакерка рисует закрытую коробку сама)
  if (e.hidden && e.def.draw !== 'boxJack') {
    ctx.save(); ctx.translate(cx, e.y + e.h);
    const mw = e.w * 0.6;
    ctx.beginPath(); ctx.ellipse(0, 2, mw / 2, 12 + Math.sin(t * 6) * 2, 0, Math.PI, 0); inkPath(level.theme.body[0], 2.5);
    if (Math.sin(t * 1.7) > -0.6) { ctx.fillStyle = '#ffe14a'; ctx.beginPath(); ctx.arc(-6, -4, 2.5, 0, 7); ctx.arc(6, -4, 2.5, 0, 7); ctx.fill(); }
    ctx.restore();
    return;
  }
  ctx.save();
  if (e.fade !== undefined && e.fade < 1) ctx.globalAlpha = Math.max(0.05, e.fade);
  // нить паука, лазер вертобота, электрическое поле угря
  if (e.ceil !== undefined && e.hang !== undefined) { ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx, e.ceil); ctx.lineTo(cx, e.y + 6); ctx.stroke(); }
  if (e.state === 'warn' && e.ai === 'laserFly') {
    ctx.strokeStyle = Math.floor(gameTime * 16) % 2 ? 'rgba(255,40,40,0.9)' : 'rgba(255,40,40,0.35)'; ctx.lineWidth = 2; ctx.setLineDash([10, 8]);
    ctx.beginPath(); ctx.moveTo(cx, e.y + e.h); ctx.lineTo(cx, H); ctx.stroke(); ctx.setLineDash([]);
  } else if (e.state === 'beam' && e.ai === 'laserFly') {
    const bw = 16 + Math.sin(gameTime * 60) * 4;
    ctx.fillStyle = 'rgba(58,224,255,0.45)'; ctx.fillRect(cx - bw, e.y + e.h - 6, bw * 2, H);
    ctx.fillStyle = '#e8ffff'; ctx.fillRect(cx - bw * 0.35, e.y + e.h - 6, bw * 0.7, H);
  }
  if (e.zapT > 0) {
    glow(cx, e.y + e.h / 2, 120, '#ffff5a', 0.45);
    ctx.strokeStyle = '#ffff9a'; ctx.lineWidth = 2.5;
    for (let i = 0; i < 4; i++) { const a = gameTime * 7 + i * 1.6; ctx.beginPath(); ctx.moveTo(cx, e.y + e.h / 2); for (let k = 1; k <= 4; k++) ctx.lineTo(cx + Math.cos(a) * k * 26 + rand(-8, 8), e.y + e.h / 2 + Math.sin(a) * k * 22 + rand(-8, 8)); ctx.stroke(); }
  }
  ctx.translate(cx, e.y + e.h);
  ctx.scale(e.face >= 0 ? 1 : -1, 1);
  fn(e, e.w, e.h, t, e.def.c1, e.def.c2, e.def.extra);
  // щит спереди у щитоносцев
  if (e.ai === 'shield' && e.type !== 'z') {
    ctx.beginPath(); ctx.roundRect(e.w * 0.42, -e.h * 0.95, 14, e.h * 0.85, 6); inkPath('#b8c0d0', 3);
    ctx.fillStyle = '#ffffff'; ctx.globalAlpha *= 0.6; ctx.fillRect(e.w * 0.42 + 3, -e.h * 0.85, 3, e.h * 0.5); ctx.globalAlpha /= 0.6;
  }
  if (e.flash > 0 && e.def.draw !== 'crow') flashPass(() => fn(e, e.w, e.h, t, e.def.c1, e.def.c2, e.def.extra), 0.7);
  ctx.restore();
  if (e.frozen > 0) {
    ctx.save();
    ctx.globalAlpha = e.frozen < 1 && Math.floor(gameTime * 12) % 2 ? 0.35 : 0.6;
    ctx.fillStyle = '#bff4ff'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(e.x - camX - 4, e.y - 4, e.w + 8, e.h + 6, 8); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 0.9; ctx.fillStyle = '#fff'; ctx.fillRect(e.x - camX + 6, e.y + 4, 10, 4);
    ctx.restore();
  }
}

// ---------- Друзья ----------
const FRIEND_DRAW = {
  cow(t) { if (IMG.cow && IMG.cow.width) { ctx.save(); ctx.translate(0, -60 + Math.sin(t * 2) * 8); ctx.rotate(Math.sin(t * 1.3) * 0.15); ctx.drawImage(IMG.cow, -60, -50, 120, 99); ctx.restore(); } },
  princess(t) { if (RIG) drawPrincessRig(0, 0, 170, t, 'idle'); },
  puppy(t) {
    const wag = Math.sin(t * 16) * 0.5;
    ctx.save(); ctx.translate(-26, -40); ctx.rotate(-0.8 + wag); ctx.beginPath(); ctx.ellipse(0, -10, 5, 14, 0, 0, 7); inkPath('#f6ecd0'); ctx.restore();
    ctx.strokeStyle = INK; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-14, -20); ctx.lineTo(-16, -2); ctx.moveTo(14, -20); ctx.lineTo(16, -2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -34, 30, 20, 0, 0, 7); inkPath('#f6ecd0');
    ctx.fillStyle = '#c87a3a'; ctx.beginPath(); ctx.ellipse(-8, -36, 10, 8, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(26, -62, 22, 20, 0, 0, 7); inkPath('#f6ecd0');
    ctx.beginPath(); ctx.ellipse(12, -72, 8, 16, 0.5 + Math.sin(t * 3) * 0.1, 0, 7); inkPath('#c87a3a');
    eye(30, -66, 6, 0.6); ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(46, -58, 5, 0, 7); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(36, -52, 6, 0.2, 2.6); ctx.stroke();
    ctx.fillStyle = '#ff3a6a'; ctx.fillRect(8, -48, 22, 6);
  },
  friendPenguin(t) {
    ctx.save(); ctx.rotate(Math.sin(t * 3) * 0.08);
    ctx.beginPath(); ctx.ellipse(0, -48, 32, 48, 0, 0, 7); inkPath('#1e2533');
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(6, -42, 22, 36, 0, 0, 7); ctx.fill();
    eye(2, -74, 6, 0.4); eye(18, -74, 6, 0.4);
    ctx.fillStyle = '#ffb020'; ctx.beginPath(); ctx.moveTo(16, -66); ctx.lineTo(36, -62); ctx.lineTo(16, -58); ctx.fill();
    ctx.fillStyle = '#ff3a3a'; ctx.fillRect(-26, -60, 52, 8); ctx.fillRect(14, -60, 8, 26);
    ctx.restore();
  },
  snail(t) {
    ctx.beginPath(); ctx.moveTo(-50, 0); ctx.quadraticCurveTo(-50, -18, -10, -18); ctx.lineTo(40, -22); ctx.quadraticCurveTo(52, -40, 46, -60); ctx.lineTo(36, -60); ctx.quadraticCurveTo(38, -30, 30, -18); ctx.lineTo(50, 0); ctx.closePath(); inkPath('#c8d88a');
    ctx.beginPath(); ctx.arc(-10, -42, 32, 0, 7); inkPath('#a86a3a');
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); for (let a = 0; a < 12; a += 0.3) ctx.lineTo(-10 + Math.cos(a) * a * 2.4, -42 + Math.sin(a) * a * 2.4); ctx.stroke();
    eye(40, -66, 7, 0.4); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(40, -66, 10, 0, 7); ctx.moveTo(30, -66); ctx.lineTo(52, -66); ctx.stroke();
  },
  fishFriend(t) {
    ctx.save(); ctx.translate(0, -60 + Math.sin(t * 2) * 10);
    ctx.save(); ctx.translate(-36, 0); ctx.rotate(Math.sin(t * 8) * 0.3); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-24, -20); ctx.lineTo(-24, 20); ctx.closePath(); inkPath('#ff9a2a'); ctx.restore();
    ctx.beginPath(); ctx.ellipse(0, 0, 40, 28, 0, 0, 7); inkPath('#ffb84a');
    ctx.fillStyle = '#fff'; ctx.fillRect(-14, -26, 8, 52); ctx.fillRect(8, -27, 8, 54);
    eye(22, -6, 8, 0.5); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(30, 10, 6, 0.3, 2.6); ctx.stroke();
    ctx.restore();
  },
  mechanic(t) {
    ctx.strokeStyle = INK; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-10, -40); ctx.lineTo(-12, -4); ctx.moveTo(10, -40); ctx.lineTo(12, -4); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(-24, -96, 48, 60, 10); inkPath('#3a6aa8');
    ctx.beginPath(); ctx.arc(0, -114, 22, 0, 7); inkPath('#f2c49a');
    ctx.beginPath(); ctx.ellipse(0, -128, 24, 10, 0, Math.PI, 0); inkPath('#ff7a2a');
    eye(-6, -116, 4, 0.5); eye(8, -116, 4, 0.5);
    ctx.fillStyle = '#6a4a2a'; ctx.beginPath(); ctx.ellipse(2, -104, 12, 5, 0, 0, Math.PI); ctx.fill();
    ctx.save(); ctx.translate(26, -70); ctx.rotate(Math.sin(t * 4) * 0.5); ctx.fillStyle = INK; ctx.fillRect(-3, -26, 6, 28); ctx.beginPath(); ctx.arc(0, -28, 8, 0, 7); ctx.fill(); ctx.fillStyle = '#c8c8d8'; ctx.beginPath(); ctx.arc(0, -28, 5, 0, 7); ctx.fill(); ctx.restore();
  },
  sailor(t) {
    ctx.strokeStyle = INK; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-10, -40); ctx.lineTo(-12, -4); ctx.moveTo(10, -40); ctx.lineTo(12, -4); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(-26, -96, 52, 60, 12); inkPath('#2a4a8a');
    ctx.fillStyle = '#fff'; for (let i = 0; i < 3; i++) ctx.fillRect(-24, -86 + i * 14, 48, 5);
    ctx.beginPath(); ctx.arc(0, -114, 22, 0, 7); inkPath('#f2c49a');
    ctx.beginPath(); ctx.arc(0, -104, 22, 0.2, Math.PI - 0.2); inkPath('#e8e8e8');
    ctx.beginPath(); ctx.ellipse(0, -132, 20, 8, 0, 0, 7); inkPath('#fff');
    eye(-7, -118, 4, 0.5); eye(8, -118, 4, 0.5);
    ctx.save(); ctx.translate(28, -100); ctx.rotate(-0.3 + Math.sin(t * 2) * 0.2); ctx.fillStyle = '#6a3a1a'; ctx.fillRect(-2, 0, 4, 16); ctx.beginPath(); ctx.ellipse(0, 0, 8, 5, 0, 0, 7); ctx.fill(); ctx.restore();
  },
  friendRobot(t) {
    const b = Math.sin(t * 4) * 3;
    ctx.beginPath(); ctx.roundRect(-20, -26, 40, 26, 8); inkPath('#5a6070');
    ctx.beginPath(); ctx.roundRect(-28, -78 + b, 56, 52, 10); inkPath('#9aa4b4');
    ctx.beginPath(); ctx.roundRect(-22, -116 + b, 44, 36, 8); inkPath('#c8d0dc');
    ctx.fillStyle = INK; ctx.fillRect(-16, -108 + b, 32, 16);
    ctx.fillStyle = '#3ae0ff'; ctx.fillRect(-12, -104 + b, 8, 8); ctx.fillRect(4, -104 + b, 8, 8);
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(0, -56 + b, 8, 0, 7); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -116 + b); ctx.lineTo(0, -130 + b); ctx.stroke();
    ctx.fillStyle = Math.sin(t * 6) > 0 ? '#ff3a3a' : '#7dff3a'; ctx.beginPath(); ctx.arc(0, -132 + b, 5, 0, 7); ctx.fill();
  },
  fairy(t) {
    ctx.save(); ctx.translate(0, -90 + Math.sin(t * 3) * 10);
    const f = Math.sin(t * 30) * 0.4;
    ctx.globalAlpha = 0.7;
    for (const s of [-1, 1]) { ctx.save(); ctx.scale(s, 1); ctx.rotate(f); ctx.beginPath(); ctx.ellipse(18, -10, 22, 10, -0.5, 0, 7); inkPath('#bff4ff', 2); ctx.restore(); }
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.moveTo(-12, 20); ctx.lineTo(0, -8); ctx.lineTo(12, 20); ctx.closePath(); inkPath('#ff7ad8');
    ctx.beginPath(); ctx.arc(0, -18, 12, 0, 7); inkPath('#f2c49a');
    eye(-4, -18, 3, 0.3); eye(5, -18, 3, 0.3);
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(20, 0, 4, 0, 7); ctx.fill();
    ctx.restore();
  },
  jester(t) {
    ctx.save(); ctx.scale(1 + Math.sin(t * 6) * 0.04, 1 - Math.sin(t * 6) * 0.04);
    ctx.beginPath(); ctx.moveTo(-34, 0); ctx.quadraticCurveTo(-34, -60, 0, -70); ctx.quadraticCurveTo(34, -60, 34, 0); ctx.closePath(); inkPath('#9ad83a');
    for (const [s, col] of [[-1, '#ff3a6a'], [1, '#3a8aff']]) { ctx.beginPath(); ctx.moveTo(0, -66); ctx.quadraticCurveTo(s * 30, -100, s * 36, -76); ctx.lineTo(s * 8, -60); ctx.closePath(); inkPath(col); ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(s * 36, -76, 6, 0, 7); ctx.fill(); }
    eye(-10, -40, 7, 0.4); eye(12, -40, 7, 0.4);
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, -26, 12, 0.2, Math.PI - 0.2); ctx.stroke();
    ctx.restore();
  },
};
function drawNPC(n) {
  const x = n.x - camX; if (x < -200 || x > W + 200) return;
  const fn = FRIEND_DRAW[n.friend.draw];
  ctx.save(); ctx.translate(x, n.y); ctx.scale(-1, 1);
  if (fn) fn(n.t);
  ctx.restore();
  outlinedText(n.friend.name, x, n.y + 18, 18, '#ffe14a');
  if (n.near && n.hints && n.hints.length) bubble(x, n.y - 150, n.hints[n.line], { size: 17, maxW: 340 });
  else if (!n.talked) { ctx.globalAlpha = 0.6 + Math.sin(n.t * 5) * 0.4; outlinedText('!', x, n.y - 150 + Math.sin(n.t * 4) * 6, 40, '#ffe14a'); ctx.globalAlpha = 1; }
}

// ---------- Боссы ----------
function drawBossEntity(b) {
  if (!b || (b.dead && b.deadT > 1.2)) return;
  const x = b.x - camX; if (x < -400 || x > W + 400) return;
  ctx.save();
  ctx.translate(x, b.y);
  if (b.dead) { ctx.globalAlpha = 1 - b.deadT / 1.2; ctx.rotate(b.deadT * 0.6); }
  ctx.scale(b.face >= 0 ? 1 : -1, 1);
  const bd = BOSS_DRAW[b.def.draw] || BOSS_DRAW.generic;
  bd(b, b.w, b.h, b.t);
  if (b.flash > 0 && b.def.draw !== 'crowBoss') flashPass(() => bd(b, b.w, b.h, b.t), 0.7);
  if (b.slow > 0) { ctx.fillStyle = 'rgba(160,235,255,0.3)'; ctx.beginPath(); ctx.ellipse(0, -b.h / 2, b.w * 0.55, b.h * 0.55, 0, 0, 7); ctx.fill(); }
  ctx.restore();
  // лазер-атака
  if (b.laserWarn || b.laserOn) {
    const lx0 = b.face > 0 ? b.x : b.chunk.x, lx1 = b.face > 0 ? b.chunk.x + b.chunk.w : b.x;
    ctx.save();
    if (b.laserWarn) { ctx.strokeStyle = `rgba(255,60,60,${0.4 + Math.sin(gameTime * 40) * 0.3})`; ctx.setLineDash([12, 10]); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(lx0 - camX, b.laserY); ctx.lineTo(lx1 - camX, b.laserY); ctx.stroke(); ctx.setLineDash([]); }
    else { ctx.fillStyle = 'rgba(255,40,80,0.45)'; ctx.fillRect(lx0 - camX, b.laserY - 14, lx1 - lx0, 28); ctx.fillStyle = '#ff9ab0'; ctx.fillRect(lx0 - camX, b.laserY - 6, lx1 - lx0, 12); ctx.fillStyle = '#fff'; ctx.fillRect(lx0 - camX, b.laserY - 2, lx1 - lx0, 4); }
    ctx.restore();
  }
}
function bossEyes(x, y, r, b, angry = true) { const lx = 0.6; eye(x, y, r, lx, 0.2, angry); eye(x + r * 2.4, y, r, lx, 0.2, angry); }
const BOSS_DRAW = {
  generic(b, w, h, t) { ctx.beginPath(); ctx.ellipse(0, -h / 2, w / 2, h / 2, 0, 0, 7); inkPath(b.def.color); bossEyes(0, -h * 0.6, 12, b); },
  crowBoss(b, w, h, t) {
    let flap = crowFlap(t, b.hp < b.maxHp / 2 ? 13 : 10) * 1.1, tilt = Math.sin(t * 1.9) * 0.08;
    if (b.cur === 'dive' && b.state === 'attack') { flap = -0.6; tilt = 0.4; }
    drawCrowRig(0, -h / 2, w * 1.5, 1, flap, tilt, b.flash > 0 ? 'brightness(3)' : 'hue-rotate(250deg) saturate(2.2)');
    // пси-шлем
    ctx.save(); ctx.translate(w * 0.32, -h * 0.85); ctx.beginPath(); ctx.ellipse(0, 0, 30, 18, 0, Math.PI, 0); inkPath('#c8c8d8'); ctx.strokeStyle = '#ff3aff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(0, -34); ctx.stroke(); ctx.fillStyle = '#ff3aff'; ctx.beginPath(); ctx.arc(0, -36, 6 + Math.sin(t * 10) * 2, 0, 7); ctx.fill(); ctx.restore();
  },
  junkKing(b, w, h, t) {
    const bob = Math.sin(t * 3) * 4;
    ctx.beginPath(); ctx.moveTo(-w * 0.45, 0); ctx.lineTo(-w * 0.35, -h * 0.7 + bob); ctx.lineTo(w * 0.35, -h * 0.7 + bob); ctx.lineTo(w * 0.45, 0); ctx.closePath(); inkPath('#7a6a5a');
    const junk = [['#b5733a', -0.25, -0.2, 40, 30], ['#5a8a5a', 0.15, -0.3, 36, 40], ['#8a8a9a', -0.05, -0.5, 50, 26], ['#a83a3a', 0.25, -0.55, 30, 30], ['#3a5aa8', -0.3, -0.55, 34, 28]];
    for (const [c, jx, jy, jw, jh] of junk) { ctx.beginPath(); ctx.roundRect(w * jx - jw / 2, h * jy - jh / 2 + bob, jw, jh, 4); inkPath(c); }
    ctx.beginPath(); ctx.arc(0, -h * 0.8 + bob, w * 0.26, 0, 7); inkPath('#9a9aaa');
    bossEyes(-14, -h * 0.82 + bob, 11, b);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.roundRect(-20, -h * 0.7 + bob, 50, 12, 4); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-w * 0.22, -h * 0.98 + bob); for (let i = 0; i < 5; i++) { ctx.lineTo(-w * 0.22 + i * w * 0.11 + w * 0.055, -h * 1.12 + bob); ctx.lineTo(-w * 0.22 + (i + 1) * w * 0.11, -h * 0.98 + bob); } ctx.closePath(); inkPath('#ffd23f');
    // руки-краны
    const arm = b.cur === 'throw' && b.state === 'attack' ? -1.6 : Math.sin(t * 2) * 0.3;
    ctx.save(); ctx.translate(w * 0.38, -h * 0.55 + bob); ctx.rotate(arm); ctx.beginPath(); ctx.roundRect(-8, -8, 70, 16, 6); inkPath('#ffb020'); ctx.beginPath(); ctx.arc(70, 0, 14, 0, 7); inkPath('#5a5a66'); ctx.restore();
  },
  yeti(b, w, h, t) {
    const bob = Math.sin(t * 3) * 4, air = b.cur === 'jump' && b.sub === 1;
    ctx.beginPath(); ctx.ellipse(-w * 0.2, -h * 0.12, 22, h * 0.14, 0, 0, 7); inkPath('#d8e8f8');
    ctx.beginPath(); ctx.ellipse(w * 0.2, -h * 0.12, 22, h * 0.14, 0, 0, 7); inkPath('#d8e8f8');
    ctx.beginPath(); ctx.ellipse(0, -h * 0.5 + bob, w * 0.45, h * 0.4, 0, 0, 7); inkPath('#f0f6ff');
    for (let i = 0; i < 10; i++) { ctx.strokeStyle = '#9ac0e0'; ctx.lineWidth = 3; const a = Math.PI + i * 0.3; ctx.beginPath(); ctx.moveTo(Math.cos(a) * w * 0.4, -h * 0.5 + bob + Math.sin(a) * h * 0.35); ctx.lineTo(Math.cos(a) * w * 0.47, -h * 0.5 + bob + Math.sin(a) * h * 0.42); ctx.stroke(); }
    const arm = air ? -2.4 : Math.sin(t * 2.5) * 0.3;
    for (const s of [-1, 1]) { ctx.save(); ctx.translate(s * w * 0.4, -h * 0.6 + bob); ctx.rotate(s * (0.3 - arm * 0.5)); ctx.beginPath(); ctx.ellipse(0, h * 0.18, 20, h * 0.24, 0, 0, 7); inkPath('#e0ecf8'); ctx.restore(); }
    ctx.fillStyle = '#7ab0e0'; ctx.beginPath(); ctx.ellipse(w * 0.1, -h * 0.68 + bob, w * 0.25, h * 0.15, 0, 0, 7); ctx.fill();
    bossEyes(-6, -h * 0.72 + bob, 10, b);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(w * 0.12, -h * 0.58 + bob, 22, 10, 0, 0, Math.PI); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(w * 0.02, -h * 0.58 + bob); ctx.lineTo(w * 0.05, -h * 0.52 + bob); ctx.lineTo(w * 0.08, -h * 0.58 + bob); ctx.moveTo(w * 0.16, -h * 0.58 + bob); ctx.lineTo(w * 0.19, -h * 0.52 + bob); ctx.lineTo(w * 0.22, -h * 0.58 + bob); ctx.fill();
  },
  golem(b, w, h, t) {
    const bob = Math.sin(t * 3) * 3;
    ctx.beginPath(); ctx.roundRect(-w * 0.32, -h * 0.3, w * 0.24, h * 0.3, 10); inkPath('#4a3030');
    ctx.beginPath(); ctx.roundRect(w * 0.08, -h * 0.3, w * 0.24, h * 0.3, 10); inkPath('#4a3030');
    ctx.beginPath(); ctx.roundRect(-w * 0.45, -h * 0.85 + bob, w * 0.9, h * 0.6, 24); inkPath('#5a3a3a');
    ctx.strokeStyle = '#ffb42a'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-w * 0.3, -h * 0.7 + bob); ctx.lineTo(-w * 0.1, -h * 0.5 + bob); ctx.lineTo(-w * 0.25, -h * 0.35 + bob); ctx.moveTo(w * 0.1, -h * 0.75 + bob); ctx.lineTo(w * 0.25, -h * 0.55 + bob); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(-w * 0.22, -h * 1.05 + bob, w * 0.44, h * 0.26, 14); inkPath('#6a4040');
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(-w * 0.08, -h * 0.96 + bob, 18, 10); ctx.fillRect(w * 0.08, -h * 0.96 + bob, 18, 10);
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.roundRect(s * w * 0.45 - 20, -h * 0.75 + bob + Math.sin(t * 2 + s) * 8, 40, h * 0.45, 14); inkPath('#5a3a3a'); }
  },
  angler(b, w, h, t) {
    const sw = Math.sin(t * 5) * 0.2;
    ctx.save(); ctx.translate(-w * 0.42, -h * 0.5); ctx.rotate(sw); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-w * 0.2, -h * 0.35); ctx.lineTo(-w * 0.2, h * 0.35); ctx.closePath(); inkPath('#2a1a4a'); ctx.restore();
    ctx.beginPath(); ctx.ellipse(0, -h * 0.5, w * 0.45, h * 0.45, 0, 0, 7); inkPath('#3a2a6a');
    const open = b.cur === 'charge' && b.state === 'attack' ? 0.4 : 0.15 + Math.sin(t * 3) * 0.05;
    ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(w * 0.45, -h * 0.5); ctx.lineTo(w * 0.05, -h * (0.5 - open * 0.3)); ctx.lineTo(w * 0.45, -h * (0.5 - open)); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff'; for (let i = 0; i < 5; i++) { const x = w * 0.12 + i * w * 0.065; ctx.beginPath(); ctx.moveTo(x, -h * 0.5); ctx.lineTo(x + 6, -h * 0.42); ctx.lineTo(x + 12, -h * 0.5); ctx.fill(); }
    eye(w * 0.15, -h * 0.72, 14, 0.6, 0, true);
    ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(w * 0.05, -h * 0.92); ctx.quadraticCurveTo(w * 0.3, -h * 1.35, w * 0.55, -h * 1.0); ctx.stroke();
    ctx.fillStyle = '#ffff9a'; ctx.beginPath(); ctx.arc(w * 0.55, -h * 0.98, 12 + Math.sin(t * 6) * 3, 0, 7); ctx.fill();
  },
  parasiteQueen(b, w, h, t) {
    for (let i = 0; i < 6; i++) { const a = -Math.PI * 0.9 + i * 0.35; ctx.strokeStyle = INK; ctx.lineWidth = 16; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, -h * 0.4); ctx.quadraticCurveTo(Math.cos(a) * w * 0.5, -h * 0.4 + Math.sin(a) * h * 0.4 + Math.sin(t * 3 + i) * 20, Math.cos(a + Math.sin(t * 2 + i) * 0.2) * w * 0.7, -h * 0.4 + Math.sin(a) * h * 0.7); ctx.stroke(); ctx.strokeStyle = '#d85a8a'; ctx.lineWidth = 10; ctx.stroke(); }
    ctx.beginPath(); ctx.ellipse(0, -h * 0.35, w * 0.4, h * 0.35, 0, 0, 7); inkPath('#a83a8a');
    ctx.fillStyle = '#ff9ad8'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(-w * 0.2 + i * w * 0.1, -h * 0.15, 6, 0, 7); ctx.fill(); }
    ctx.beginPath(); ctx.ellipse(w * 0.1, -h * 0.72, w * 0.2, h * 0.17, 0, 0, 7); inkPath('#c84a9a');
    bossEyes(w * 0.02, -h * 0.76, 9, b);
    ctx.beginPath(); ctx.moveTo(-w * 0.05, -h * 0.88); ctx.lineTo(0, -h * 1.0); ctx.lineTo(w * 0.08, -h * 0.9); ctx.lineTo(w * 0.15, -h * 1.02); ctx.lineTo(w * 0.22, -h * 0.88); ctx.closePath(); inkPath('#b6ff3a');
  },
  megaRobot(b, w, h, t) {
    const bob = Math.sin(t * 4) * 3, step = b.cur === 'jump' && b.sub === 1;
    ctx.beginPath(); ctx.roundRect(-w * 0.32, -h * 0.32, w * 0.22, h * 0.32, 6); inkPath('#4f5866');
    ctx.beginPath(); ctx.roundRect(w * 0.1, -h * 0.32, w * 0.22, h * 0.32, 6); inkPath('#4f5866');
    ctx.beginPath(); ctx.roundRect(-w * 0.42, -h * 0.82 + bob, w * 0.84, h * 0.52, 12); inkPath('#7a8494');
    ctx.fillStyle = '#ffd23f'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(-w * 0.4 + i * w * 0.17, -h * 0.34 + bob); ctx.lineTo(-w * 0.32 + i * w * 0.17, -h * 0.42 + bob); ctx.lineTo(-w * 0.24 + i * w * 0.17, -h * 0.34 + bob); ctx.fill(); }
    ctx.fillStyle = '#3ae0ff'; ctx.beginPath(); ctx.arc(0, -h * 0.6 + bob, 18 + Math.sin(t * 6) * 3, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.roundRect(-w * 0.25, -h * 1.05 + bob, w * 0.5, h * 0.24, 10); inkPath('#9aa4b4');
    ctx.fillStyle = INK; ctx.fillRect(-w * 0.18, -h * 0.98 + bob, w * 0.4, 18);
    ctx.fillStyle = b.laserWarn || b.laserOn ? '#ffffff' : '#ff2a2a'; ctx.fillRect(-w * 0.12 + Math.sin(t * 2) * 10, -h * 0.96 + bob, w * 0.14, 12);
    for (const s of [-1, 1]) { ctx.save(); ctx.translate(s * w * 0.46, -h * 0.75 + bob); ctx.rotate(step ? -s * 2.4 : s * 0.15 + Math.sin(t * 3) * 0.1); ctx.beginPath(); ctx.roundRect(-14, 0, 28, h * 0.4, 8); inkPath('#5a6070'); ctx.beginPath(); ctx.arc(0, h * 0.42, 18, 0, 7); inkPath('#3a3f4a'); ctx.restore(); }
  },
  crystalSpider(b, w, h, t) {
    const s = Math.sin(t * 8);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(0, -h - 400); ctx.stroke();
    for (let i = 0; i < 4; i++) for (const d of [-1, 1]) {
      const ph = (i % 2 ? s : -s) * 8;
      ctx.strokeStyle = INK; ctx.lineWidth = 9; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(d * 20, -h * 0.5); ctx.lineTo(d * (w * 0.3 + i * 12), -h * 0.95 + i * 10 + ph); ctx.lineTo(d * (w * 0.45 + i * 8), -h * 0.05 + ph); ctx.stroke();
      ctx.strokeStyle = '#5af0ff'; ctx.lineWidth = 5; ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(-w * 0.28, -h * 0.5); ctx.lineTo(-w * 0.1, -h * 0.85); ctx.lineTo(w * 0.1, -h * 0.85); ctx.lineTo(w * 0.28, -h * 0.5); ctx.lineTo(0, -h * 0.15); ctx.closePath(); inkPath('#7a6ac8');
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.moveTo(-w * 0.1, -h * 0.85); ctx.lineTo(-w * 0.28, -h * 0.5); ctx.lineTo(0, -h * 0.5); ctx.fill();
    ctx.fillStyle = '#ff3a8a'; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(-w * 0.09 + (i % 3) * w * 0.09, -h * 0.58 + Math.floor(i / 3) * 14, 5, 0, 7); ctx.fill(); }
  },
  slugQueen(b, w, h, t) {
    const sq = Math.sin(t * 3) * 0.04;
    ctx.save(); ctx.scale(1 + sq, 1 - sq);
    ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.quadraticCurveTo(-w * 0.5, -h * 0.5, -w * 0.1, -h * 0.55); ctx.quadraticCurveTo(w * 0.35, -h * 1.0, w * 0.42, -h * 0.5); ctx.quadraticCurveTo(w * 0.5, -h * 0.1, w * 0.3, 0); ctx.closePath(); inkPath('#f0c83a');
    ctx.fillStyle = '#c89a1a'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(-w * 0.3 + i * w * 0.12, -h * 0.25, 12, 8, 0, 0, 7); ctx.fill(); }
    ctx.beginPath(); ctx.ellipse(w * 0.2, -h * 0.55, w * 0.1, h * 0.1, 0, 0, 7); inkPath('#ffe9a0');
    ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(w * 0.22, -h * 0.82); ctx.lineTo(w * 0.15, -h * 1.05); ctx.moveTo(w * 0.36, -h * 0.75); ctx.lineTo(w * 0.42, -h * 0.98); ctx.stroke();
    eye(w * 0.15, -h * 1.08, 12, 0.6, 0, true); eye(w * 0.43, -h * 1.0, 12, 0.6, 0, true);
    ctx.beginPath(); ctx.moveTo(w * 0.12, -h * 0.82); ctx.lineTo(w * 0.15, -h * 0.95); ctx.lineTo(w * 0.22, -h * 0.86); ctx.lineTo(w * 0.28, -h * 0.98); ctx.lineTo(w * 0.33, -h * 0.84); ctx.lineTo(w * 0.4, -h * 0.94); ctx.lineTo(w * 0.42, -h * 0.78); ctx.closePath(); inkPath('#ffd23f');
    ctx.fillStyle = '#ff3a6a'; ctx.beginPath(); ctx.arc(w * 0.28, -h * 0.9, 5, 0, 7); ctx.fill();
    ctx.restore();
  },
  professor(b, w, h, t) {
    // летающее кресло с огромным мозгом
    const bob = Math.sin(t * 2.5) * 6;
    ctx.fillStyle = `rgba(127,246,255,${0.4 + Math.sin(t * 30) * 0.2})`; ctx.beginPath(); ctx.moveTo(-w * 0.25, -h * 0.05 + bob); ctx.lineTo(0, h * 0.2 + bob + Math.sin(t * 40) * 6); ctx.lineTo(w * 0.25, -h * 0.05 + bob); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, -h * 0.12 + bob, w * 0.48, h * 0.12, 0, 0, 7); inkPath('#8a94a4');
    ctx.fillStyle = '#ff3a3a'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(-w * 0.32 + i * w * 0.16, -h * 0.12 + bob, 5, 0, 7); ctx.fill(); }
    ctx.beginPath(); ctx.roundRect(-w * 0.2, -h * 0.55 + bob, w * 0.4, h * 0.4, 10); inkPath('#f0f0f0');
    ctx.fillStyle = '#3a6aa8'; ctx.beginPath(); ctx.moveTo(-4, -h * 0.55 + bob); ctx.lineTo(4, -h * 0.55 + bob); ctx.lineTo(6, -h * 0.25 + bob); ctx.lineTo(0, -h * 0.2 + bob); ctx.lineTo(-6, -h * 0.25 + bob); ctx.fill();
    ctx.beginPath(); ctx.arc(0, -h * 0.66 + bob, w * 0.15, 0, 7); inkPath('#d8e0c8');
    ctx.beginPath(); ctx.ellipse(0, -h * 0.85 + bob, w * 0.3, h * 0.2, 0, 0, 7); inkPath('#ff9ab0');
    ctx.strokeStyle = '#c85a7a'; ctx.lineWidth = 3; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(-w * 0.18 + i * w * 0.09, -h * 0.87 + bob, 12, Math.PI * 0.9, Math.PI * 2.1); ctx.stroke(); }
    ctx.fillStyle = 'rgba(200,240,255,0.3)'; ctx.beginPath(); ctx.ellipse(0, -h * 0.82 + bob, w * 0.34, h * 0.28, 0, 0, 7); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(-12, -h * 0.66 + bob, 9, 7, 0, 0, 7); ctx.ellipse(14, -h * 0.66 + bob, 9, 7, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(-12, -h * 0.66 + bob, 4, 0, 7); ctx.arc(14, -h * 0.66 + bob, 4, 0, 7); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(2, -h * 0.58 + bob, 9, 0.3, Math.PI - 0.3); ctx.stroke();
  },
};

// ---------- Пули ----------
function drawBullets() {
  for (const b of bullets) {
    const x = b.x - camX;
    ctx.save();
    if (b.kind === 'laser') {
      const len = 70;
      ctx.fillStyle = 'rgba(255,79,216,0.4)'; ctx.fillRect(x - Math.sign(b.vx) * len, b.y - 6, Math.sign(b.vx) * len, 12);
      ctx.fillStyle = '#ffd0f4'; ctx.fillRect(x - Math.sign(b.vx) * len, b.y - 2, Math.sign(b.vx) * len, 4);
    } else if (b.kind === 'rocket') {
      ctx.translate(x, b.y); ctx.scale(Math.sign(b.vx), 1);
      ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(-14, -5); ctx.lineTo(-30 - Math.random() * 10, 0); ctx.lineTo(-14, 5); ctx.fill();
      ctx.beginPath(); ctx.roundRect(-16, -7, 28, 14, 6); inkPath('#d8d8e8', 2);
      ctx.beginPath(); ctx.moveTo(12, -7); ctx.lineTo(22, 0); ctx.lineTo(12, 7); inkPath('#ff4a3a', 2);
    } else if (b.kind === 'freeze') {
      ctx.translate(x, b.y); ctx.rotate(b.t * 10);
      ctx.strokeStyle = '#e8fbff'; ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) { ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(11, 0); ctx.stroke(); }
    } else {
      glow(x, b.y, 30, b.color, 0.5);
      ctx.fillStyle = b.color; ctx.beginPath(); ctx.ellipse(x - Math.sign(b.vx) * 8, b.y, 18, 6, Math.atan2(b.vy, b.vx), 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(x, b.y, 8, 4, Math.atan2(b.vy, b.vx), 0, 7); ctx.fill();
    }
    ctx.restore();
  }
  for (const b of ebullets) {
    const x = b.x - camX;
    ctx.save();
    if (b.wave) {
      ctx.fillStyle = b.color; ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.moveTo(x - 24, b.y + 20); ctx.quadraticCurveTo(x, b.y - 30 - Math.sin(b.t * 20) * 6, x + 24, b.y + 20); ctx.fill();
    } else if (b.flame) {
      // язычок пламени огненного следа
      const k = Math.min(1, b.life / 0.4), fl = Math.sin(b.t * 30 + b.x) * 3;
      glow(x, b.y, 34 * k, '#ff8a1a', 0.55);
      ctx.globalAlpha = k;
      ctx.fillStyle = '#ff5a1a'; ctx.beginPath(); ctx.moveTo(x - 11 * k, b.y + 12); ctx.quadraticCurveTo(x - 12 * k, b.y - 6, x + fl, b.y - 26 * k); ctx.quadraticCurveTo(x + 12 * k, b.y - 6, x + 11 * k, b.y + 12); ctx.fill();
      ctx.fillStyle = '#ffe14a'; ctx.beginPath(); ctx.moveTo(x - 5 * k, b.y + 12); ctx.quadraticCurveTo(x - 6 * k, b.y, x + fl * 0.5, b.y - 12 * k); ctx.quadraticCurveTo(x + 6 * k, b.y, x + 5 * k, b.y + 12); ctx.fill();
    } else if (b.egg) { ctx.beginPath(); ctx.ellipse(x, b.y, 10, 13, b.t * 4, 0, 7); inkPath('#f6ecd0', 2.5); }
    else if (b.rock) { ctx.translate(x, b.y); ctx.rotate(b.t * 6); ctx.beginPath(); ctx.moveTo(-14, -6); ctx.lineTo(-4, -14); ctx.lineTo(12, -10); ctx.lineTo(14, 6); ctx.lineTo(0, 14); ctx.lineTo(-12, 8); ctx.closePath(); inkPath(b.color, 2.5); }
    else {
      glow(x, b.y, b.r * 2.6, b.color, 0.5);
      ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(x, b.y, b.r, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, b.y, b.r * 0.45, 0, 7); ctx.fill();
    }
    ctx.restore();
  }
}

function drawParticles() {
  for (const p of particles) {
    const k = Math.max(0, p.life / p.max), x = p.x - camX;
    ctx.save();
    ctx.globalAlpha = Math.min(1, k * 1.5);
    if (p.kind === 'puff') { ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(x, p.y, p.size, 0, 7); ctx.fill(); }
    else if (p.kind === 'spark') { ctx.fillStyle = p.color; ctx.fillRect(x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
    else if (p.kind === 'ring') { ctx.strokeStyle = p.color; ctx.lineWidth = 6 * k; ctx.beginPath(); ctx.arc(x, p.y, p.size * (1 - k * 0.7), 0, 7); ctx.stroke(); }
    else if (p.kind === 'shard' || p.kind === 'feather') {
      ctx.translate(x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color;
      if (p.kind === 'feather') { ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size * 0.3, 0, 0, 7); ctx.fill(); }
      else { ctx.beginPath(); ctx.moveTo(-p.size / 2, -p.size / 3); ctx.lineTo(p.size / 2, -p.size / 4); ctx.lineTo(0, p.size / 2); ctx.closePath(); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke(); }
    }
    ctx.restore();
  }
  for (const f of floaters) { ctx.globalAlpha = Math.min(1, (1.1 - f.t) * 3); outlinedText(f.text, f.x - camX, f.y, 24, f.color); ctx.globalAlpha = 1; }
}

// ---------- Джим ----------
function drawJim() {
  const p = player;
  if (!RIG || !p) return;
  if (p.inv > 0 && p.inv < 1.2 && Math.floor(p.inv * 16) % 2 === 0 && state === 'play') return;
  const B = playerBones(p);
  ctx.save();
  ctx.translate(-camX, 0);
  const jet = { on: p.jet && state === 'play', fuel: p.fuel };
  drawJimRig(B, p.glide && state === 'play', jet);
  if (p.inv > 1.2 && state === 'play' && Math.floor(p.inv * 24) % 2 === 0) flashPass(() => drawJimRig(B, false, jet), 0.45);
  // Вспышка выстрела — у ствола пистолета, цветом текущего оружия
  if (p.anim.shootT > 0.05) {
    const m = MX.apply(B.armF, RIG.jim.muzzle);
    const k = (p.anim.shootT - 0.05) / 0.08;
    ctx.save();
    ctx.translate(m.x + p.face * 6, m.y);
    ctx.rotate(gameTime * 20);
    ctx.globalAlpha = k;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 5 : 16 * (0.7 + k * 0.3), a = i / 10 * Math.PI * 2; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  if (p.whip > 0.1 && p.whip < 0.18) {
    const t = MX.apply(B.head, [600, 150]);
    ctx.save(); ctx.translate(t.x + p.face * 26, t.y);
    ctx.strokeStyle = '#fff6b0'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + gameTime * 10; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 8, Math.sin(a) * 8); ctx.lineTo(Math.cos(a) * 20, Math.sin(a) * 20); ctx.stroke(); }
    ctx.restore();
  }
  ctx.restore();
}

// ---------- Темнота (Тёмная туманность) ----------
let darkCvs = null;
// Тьма считается в половинном разрешении, «дыры» света — готовый спрайт градиента
const DARK_K = 0.5;
let lightSpr = null;
function drawDarkness() {
  if (!darkCvs) {
    darkCvs = document.createElement('canvas'); darkCvs.width = W * DARK_K; darkCvs.height = H * DARK_K;
    lightSpr = glowSprite('rgba(0,0,0,1)', 128, 0.2);
  }
  const g = darkCvs.getContext('2d');
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  g.clearRect(0, 0, darkCvs.width, darkCvs.height);
  g.fillStyle = 'rgba(3,0,10,0.95)'; g.fillRect(0, 0, darkCvs.width, darkCvs.height);
  g.globalCompositeOperation = 'destination-out';
  const hole = (x, y, r, a = 1) => { if (x + r < 0 || x - r > W) return; g.globalAlpha = a; g.drawImage(lightSpr, (x - r) * DARK_K, (y - r) * DARK_K, 2 * r * DARK_K, 2 * r * DARK_K); };
  const p = player;
  hole(p.x + p.w / 2 - camX, p.y + p.h / 2, 230 + Math.sin(gameTime * 3) * 6);
  for (const l of lamps) hole(l.x - camX, l.y + 20, 300 + Math.sin(l.t * 4) * 8);
  for (const b of bullets) hole(b.x - camX, b.y, 90, 0.8);
  for (const b of ebullets) hole(b.x - camX, b.y, 50, 0.6);
  for (const e of enemies) if (e.def.draw === 'eye' || e.def.draw === 'ghost') hole(e.x + e.w / 2 - camX, e.y + e.h / 2, 60, 0.5);
  if (exitDoor) hole(exitDoor.x + 40 - camX, exitDoor.y + 60, 170, 0.9);
  for (const n of npcs) hole(n.x - camX, n.y - 80, 200, 0.9);
  for (const it of items) hole(it.x - camX, it.y, 50, 0.6);
  if (boss && boss.active) hole(boss.x - camX, boss.y - boss.h / 2, 260, 0.9);
  for (const pt of particles) if (pt.kind === 'ring') hole(pt.x - camX, pt.y, pt.size * 1.5, 0.8);
  ctx.drawImage(darkCvs, 0, 0, W, H);
}

// ---------- Мир целиком ----------
function drawWorld() {
  const sx = shake > 0 ? rand(-1, 1) * shake * 18 : 0, sy = shake > 0 ? rand(-1, 1) * shake * 12 : 0;
  ctx.save();
  ctx.translate(sx, sy);
  drawBackground(level.loc.bg, camX);
  if (level.underwater) { ctx.fillStyle = 'rgba(20,90,140,0.18)'; ctx.fillRect(0, 0, W, H); }
  drawTiles();
  drawMechanics();
  for (const n of npcs) drawNPC(n);
  for (const e of enemies) drawEnemy(e);
  drawBossEntity(boss);
  drawJim();
  drawBullets();
  drawParticles();
  if (level.underwater) {
    // лучи света и пузырьки
    ctx.save(); ctx.globalAlpha = 0.08; ctx.fillStyle = '#bff4ff';
    for (let i = 0; i < 5; i++) { const x = ((i * 330 - camX * 0.3) % 1600 + 1600) % 1600 - 160; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 90, 0); ctx.lineTo(x + 260, H); ctx.lineTo(x + 120, H); ctx.fill(); }
    ctx.restore();
  }
  if (level.dark) drawDarkness();
  ctx.restore();
}

// ---------- HUD ----------
function drawHUD() {
  const p = player;
  // Панель
  ctx.save();
  ctx.fillStyle = 'rgba(8,4,24,0.6)'; ctx.beginPath(); ctx.roundRect(12, 10, 420, 96, 16); ctx.fill();
  // Жизни — лица Джима
  const n = Math.min(lives, 6);
  for (let i = 0; i < n; i++) drawJimFace(46 + i * 46, 42, 46, gameTime + i * 0.7);
  if (lives > 6) outlinedText('×' + lives, 46 + 6 * 46, 44, 26, '#fff', 'left');
  // Здоровье (энергия костюма)
  const hw = 300, hx = 24, hy = 74;
  ctx.fillStyle = INK; ctx.beginPath(); ctx.roundRect(hx - 3, hy - 3, hw + 6, 22, 9); ctx.fill();
  const hk = clamp(p.health / 100, 0, 1);
  const hg = ctx.createLinearGradient(hx, 0, hx + hw, 0); hg.addColorStop(0, '#ff3a5a'); hg.addColorStop(0.5, '#ffd23f'); hg.addColorStop(1, '#7dff3a');
  ctx.fillStyle = hg; ctx.beginPath(); ctx.roundRect(hx, hy, Math.max(4, hw * hk), 16, 7); ctx.fill();
  plainText('КОСТЮМ ' + Math.ceil(Math.max(0, p.health)) + '%', hx + 8, hy + 9, 12, '#141018', 'left', 900);
  if (p.keys > 0) { ctx.save(); ctx.translate(hx + hw + 30, hy + 6); ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(-6, 0, 7, 0, 7); ctx.fill(); ctx.fillRect(0, -3, 16, 6); ctx.restore(); outlinedText('×' + p.keys, hx + hw + 58, hy + 7, 20, '#ffd23f', 'left'); }
  ctx.restore();

  // Оружие
  const wx = W / 2 - 170;
  ctx.fillStyle = 'rgba(8,4,24,0.6)'; ctx.beginPath(); ctx.roundRect(wx, 10, 340, 66, 16); ctx.fill();
  const w = WEAPONS[p.weapon];
  if (weaponFlash > 0) { ctx.strokeStyle = w.color; ctx.globalAlpha = weaponFlash; ctx.lineWidth = 4; ctx.beginPath(); ctx.roundRect(wx, 10, 340, 66, 16); ctx.stroke(); ctx.globalAlpha = 1; }
  drawWeaponIcon(p.weapon, wx + 36, 43, 1);
  outlinedText(w.short, wx + 70, 30, 24, w.color, 'left');
  outlinedText(w.pack ? String(ammo[p.weapon]) : '∞', wx + 70, 58, 22, '#fff', 'left');
  for (let i = 0; i < WEAPONS.length; i++) {
    const sx = wx + 200 + i * 27, owned = SAVE.weapons[i];
    ctx.fillStyle = i === p.weapon ? WEAPONS[i].color : owned ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.06)';
    ctx.beginPath(); ctx.roundRect(sx, 26, 23, 34, 6); ctx.fill();
    plainText(String(i + 1), sx + 11.5, 43, 15, i === p.weapon ? '#141018' : owned ? '#fff' : 'rgba(255,255,255,0.3)', 'center', 900);
  }

  // Очки и уровень
  ctx.fillStyle = 'rgba(8,4,24,0.6)'; ctx.beginPath(); ctx.roundRect(W - 352, 10, 340, 66, 16); ctx.fill();
  outlinedText('ОЧКИ ' + score, W - 24, 30, 26, '#ffe14a', 'right');
  plainText(`${level.loc.name} • ${LEVELS[curLevel].n + 1}: ${LEVELS[curLevel].name}`, W - 24, 58, 15, '#e8e0ff', 'right');

  // Кислород
  if (p.inWater) {
    const ok = p.oxygen / 100;
    ctx.fillStyle = 'rgba(8,4,24,0.6)'; ctx.beginPath(); ctx.roundRect(12, 114, 260, 34, 12); ctx.fill();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.roundRect(56, 122, 204, 18, 8); ctx.fill();
    ctx.fillStyle = ok < 0.25 && Math.floor(gameTime * 6) % 2 ? '#ff3a5a' : '#7fe6ff'; ctx.beginPath(); ctx.roundRect(58, 124, Math.max(4, 200 * ok), 14, 6); ctx.fill();
    outlinedText('O₂', 34, 131, 22, '#bff4ff');
  }
  // Босс
  if (boss && boss.active && !boss.dead) {
    const bw = 600, bx = W / 2 - bw / 2, by = H - 46;
    ctx.fillStyle = 'rgba(8,4,24,0.7)'; ctx.beginPath(); ctx.roundRect(bx - 12, by - 30, bw + 24, 62, 14); ctx.fill();
    outlinedText(boss.def.name, W / 2, by - 12, 22, '#ff9f9f');
    ctx.fillStyle = INK; ctx.beginPath(); ctx.roundRect(bx - 3, by + 2, bw + 6, 20, 8); ctx.fill();
    ctx.fillStyle = '#ff3a5a'; ctx.beginPath(); ctx.roundRect(bx, by + 5, Math.max(4, bw * boss.hp / boss.maxHp), 14, 6); ctx.fill();
  }
  if (banner) {
    const a = Math.min(1, banner.t * 4, (3 - banner.t) * 2);
    ctx.globalAlpha = Math.max(0, a);
    outlinedText(banner.text, W / 2, 200, 72, banner.color || '#ffe14a');
    if (banner.sub) outlinedText(banner.sub, W / 2, 262, 30, '#fff');
    ctx.globalAlpha = 1;
  }
}
function drawWeaponIcon(i, x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  const c = WEAPONS[i].color;
  ctx.beginPath(); ctx.roundRect(-20, -8, 34, 14, 4); inkPath('#c8c8d8', 2.5);
  ctx.beginPath(); ctx.roundRect(-14, 2, 10, 16, 3); inkPath('#8a8a9a', 2.5);
  ctx.fillStyle = c;
  if (i === 0) { ctx.beginPath(); ctx.arc(20, -1, 5, 0, 7); ctx.fill(); }
  if (i === 1) { for (const a of [-0.4, 0, 0.4]) { ctx.beginPath(); ctx.arc(20 + Math.cos(a) * 6, -1 + Math.sin(a) * 9, 3.5, 0, 7); ctx.fill(); } }
  if (i === 2) { ctx.fillRect(14, -3, 14, 4); }
  if (i === 3) { ctx.beginPath(); ctx.moveTo(14, -6); ctx.lineTo(28, -1); ctx.lineTo(14, 4); ctx.fill(); }
  if (i === 4) { ctx.strokeStyle = c; ctx.lineWidth = 2.5; for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3; ctx.beginPath(); ctx.moveTo(20 - Math.cos(a) * 7, -1 - Math.sin(a) * 7); ctx.lineTo(20 + Math.cos(a) * 7, -1 + Math.sin(a) * 7); ctx.stroke(); } }
  ctx.restore();
}
