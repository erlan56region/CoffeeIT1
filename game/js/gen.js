/* =========================================================
   ЧЕРВЯК ДЖИМ — генератор уровней.
   Каждый уровень собирается из участков, которые больше нигде не повторяются:
   ручные участки локации и общие ручные участки идут по одному разу за игру,
   остальное строится процедурно (по сиду уровня — раскладка стабильна).
   Сложность d растёт от 0 (первый уровень) до 1 (последний): шире пропасти,
   больше и сильнее враги, сложнее варианты головоломок, новые механики.
   ========================================================= */
'use strict';

// ---------- Сетка участка ----------
// Строки 0–14, пол — строки 12–14 ('#'), стоять можно на строке 11.
const FLOOR = 12;
function makeGrid(w) { const g = []; for (let r = 0; r < ROWS; r++) g.push(new Array(w).fill(r >= FLOOR ? '#' : ' ')); return g; }
function put(g, c, r, ch) { if (r >= 0 && r < ROWS && c >= 0 && c < g[0].length) g[r][c] = ch; }
function fill(g, c0, c1, r0, r1, ch) { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) put(g, c, r, ch); }
const ri = (r, a, b) => a + Math.floor(r() * (b - a + 1));
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const chance = (r, p) => r() < p;

// Пропасть: пустота, шипы на дне или жидкость (лава/кислота/слизь)
function pitKind(ctx) {
  if (['lava', 'whale', 'slime'].includes(ctx.loc)) return 'liquid';
  if (ctx.loc === 'factory' && chance(ctx.r, 0.5)) return 'liquid';
  return ctx.d < 0.12 || chance(ctx.r, 0.4) ? 'spikes' : 'void';
}
function pit(g, c0, c1, kind) {
  fill(g, c0, c1, FLOOR, 14, kind === 'liquid' ? '~' : ' ');
  if (kind === 'spikes') fill(g, c0, c1, 14, 14, '^');
}
// Преграда до самого верха: дверь (рычаг/кнопка), лазер или замок
function barrier(g, c, kind) {
  if (kind === 'laser') { fill(g, c, c, 0, 11, 'Z'); return 1; }
  fill(g, c, c + 1, 0, 8, '#'); fill(g, c, c + 1, 9, 11, kind === 'lock' ? 'K' : 'D');
  return 2;
}
function doorKind(ctx) { return ctx.loc === 'factory' || (ctx.d > 0.45 && chance(ctx.r, 0.35)) ? 'laser' : 'door'; }

// ---------- Враги ----------
function groundLetter(ctx, wide) {
  const o = ['e', 'e'];
  if (ctx.d >= 0.1) o.push('g');
  if (ctx.d >= 0.15 && ctx.loc !== 'lava') o.push('j');
  if (ctx.d >= 0.3 && wide) o.push('z', 'z');
  return pick(ctx.r, o);
}
// поставить врага на поверхность (строка r — где он стоит)
function foe(g, c, r, ctx, wide = false) { if (g[r] && g[r][c] === ' ') put(g, c, r, groundLetter(ctx, wide)); }
function flyer(g, c, r, ctx) { if (ctx.d >= 0.05 && g[r] && g[r][c] === ' ') put(g, c, r, 'f'); }
const foeCount = (ctx, base = 1) => base + Math.floor(ctx.d * 3 + ctx.r() * 1.5);
function atoms(g, c0, c1, r) { for (let c = c0; c <= c1; c += 2) if (g[r][c] === ' ') put(g, c, r, 'a'); }

// ---------- Генераторы участков ----------
// Бег с пропастями и перепадами высот
function genRun(ctx) {
  const { r, d } = ctx;
  const kind = pitKind(ctx);
  const spans = [[ri(r, 3, 4), 0]];
  let h = 0;
  const n = 3 + Math.floor(d * 2) + ri(r, 0, 1);
  for (let i = 0; i < n; i++) {
    const nh = d < 0.1 ? 0 : clamp(h + ri(r, -2, 2), 0, 3);
    let pw = ri(r, 2, Math.min(7, 3 + Math.round(d * 3.5)));
    if (nh - h >= 2) pw = Math.min(pw, 3);
    spans.push([pw, -1], [ri(r, 2, d > 0.5 ? 4 : 5), nh]);
    h = nh;
  }
  spans.push([3, 0]);
  const w = spans.reduce((s, p) => s + p[0], 0);
  const g = makeGrid(w);
  let c = 0, prevH = 0;
  for (let i = 0; i < spans.length; i++) {
    const [len, hh] = spans[i];
    if (hh < 0) {
      pit(g, c, c + len - 1, kind);
      const nextH = spans[i + 1] ? spans[i + 1][1] : 0;
      if (len >= 4) {
        // островок над широкой пропастью: обычный, рассыпающийся или мигающий
        const pr = FLOOR - Math.min(prevH, nextH) - 3, pc = c + Math.floor(len / 2) - 1;
        const ch = d > 0.55 && chance(r, 0.4) ? 'X' : d > 0.7 && chance(r, 0.4) ? '!' : '=';
        fill(g, pc, pc + 1, pr, pr, ch);
        put(g, pc, pr - 2, 'a');
      } else atoms(g, c, c + len - 1, FLOOR - Math.max(prevH, nextH) - 4);
      if (chance(r, 0.25 + d * 0.4)) flyer(g, c + Math.floor(len / 2), 6, ctx);
      if (kind === 'liquid' && len >= 4 && ctx.d > 0.2 && chance(r, 0.5)) put(g, c + 1, FLOOR, 'j');
    } else {
      if (hh > 0) fill(g, c, c + len - 1, FLOOR - hh, FLOOR - 1, '#');
      if (len >= 3 && i > 0 && i < spans.length - 1 && chance(r, 0.45 + d * 0.4)) foe(g, c + 1 + Math.floor(r() * (len - 2)), FLOOR - hh - 1, ctx, len >= 5);
      prevH = hh;
    }
    c += len;
  }
  return { g };
}

// Подъём по зигзагу платформ на плато над шипами
function genClimb(ctx) {
  const { r, d } = ctx;
  const top = d > 0.5 ? 5 : 6;                      // верх плато
  const climbW = 9 + ri(r, 0, 1), plateau = 7 + ri(r, 0, 5);
  const w = 2 + climbW + plateau + 4;
  const g = makeGrid(w);
  const p0 = 2 + climbW;
  fill(g, p0, p0 + plateau - 1, top, FLOOR - 1, '#');
  if (d > 0.25) fill(g, 3, p0 - 1, FLOOR - 1, FLOOR - 1, '^');
  // зигзаг вверх: слева на 3 ряда выше пола, справа — у самого плато
  fill(g, 2, 4, 9, 9, d > 0.6 && chance(r, 0.3) ? 'X' : '=');
  fill(g, p0 - 4, p0 - 2, 7, 7, '=');
  put(g, 3, 8, 'a'); put(g, p0 - 3, 6, 'a');
  const nf = foeCount(ctx);
  for (let i = 0; i < nf; i++) foe(g, p0 + 1 + ri(r, 0, plateau - 2), top - 1, ctx, plateau >= 6);
  atoms(g, p0 + 1, p0 + plateau - 2, top - 2);
  if (chance(r, 0.5)) flyer(g, Math.floor(p0 / 2), 3, ctx);
  return { g };
}

// Низкий туннель — только ползком (с завалами и опасной прорехой на сложных уровнях)
function genTunnel(ctx) {
  const { r, d } = ctx;
  const L = 7 + Math.round(d * 9) + ri(r, 0, 3);
  const w = L + 8;
  const g = makeGrid(w);
  const t0 = 4, t1 = t0 + L - 1;
  fill(g, t0, t1, 0, 9, '#');
  // прореха посередине — сверху падает опасность
  if (d > 0.3 && L > 10) {
    const m = t0 + Math.floor(L / 2) - 1;
    fill(g, m, m + 2, 0, 9, ' ');
    if (ctx.loc === 'junk' || ctx.loc === 'factory') put(g, m + 1, 2, 'P');
    else if (ctx.loc === 'ice') { put(g, m, 3, '#'); put(g, m, 4, 'i'); }
    else flyer(g, m + 1, 5, ctx);
  }
  // завал: треснувший блок на высоте ползущего Джима — разбей выстрелом сидя
  if (d > 0.4) put(g, t0 + 3 + ri(r, 0, Math.max(0, L - 8)), 11, 'R');
  atoms(g, t0 + 1, t1 - 1, 11);
  const ne = Math.floor(d * 2.5 + r());
  for (let i = 0; i < ne; i++) { const c = t0 + 2 + Math.floor((i + 0.5) * (L - 4) / ne); if (g[11][c] !== 'R') put(g, c, 11, 'e'); }
  return { g, puzzle: 'crouch' };
}

// Дверь/лазер + рычаг в разных местах
function genLeverDoor(ctx) {
  const { r, d } = ctx;
  const w = 26 + ri(r, 0, 4);
  const g = makeGrid(w);
  const D = w - 5;
  const bk = doorKind(ctx);
  barrier(g, D, bk);
  const variants = ['plat', 'floor'];
  if (d > 0.3) variants.push('alcove');
  if (d > 0.45) variants.push('jet', 'jet');
  const v = pick(r, variants);
  let puzzle = bk === 'laser' ? 'laser' : 'lever';
  if (v === 'plat') {
    // рычаг висит в воздухе — стреляй с платформы на 2 ряда ниже
    const lr = ri(r, 5, 7);
    const pr = lr + 2;
    const pc = ri(r, 2, 6);
    fill(g, pc, pc + 3, pr, pr, '=');
    if (pr < 9) fill(g, pc + 5, pc + 7, pr + 2 <= 9 ? 9 : pr + 2, pr + 2 <= 9 ? 9 : pr + 2, '=');
    put(g, ri(r, pc + 8, D - 3), lr, 'L');
  } else if (v === 'floor') {
    // рычаг на полу за пропастью
    const kind = pitKind(ctx);
    const pc = ri(r, 7, 10), pw = ri(r, 3, 4 + Math.round(d * 2));
    pit(g, pc, pc + pw - 1, kind);
    put(g, Math.min(D - 2, pc + pw + 2), 10, 'L');
  } else if (v === 'alcove') {
    // рычаг в нише за треснувшей стеной
    const ac = ri(r, 9, D - 5);
    fill(g, ac - 1, ac + 1, 8, 8, '#'); fill(g, ac + 1, ac + 1, 9, 11, '#');
    fill(g, ac - 1, ac - 1, 9, 11, 'R');
    put(g, ac, 10, 'L');
    puzzle = 'secret';
  } else {
    // высоко — долети на джетпаке и выстрели
    put(g, ri(r, 8, D - 3), d > 0.7 ? 4 : 5, 'L');
    puzzle = 'jet';
  }
  const nf = foeCount(ctx);
  for (let i = 0; i < nf; i++) foe(g, ri(r, 4, D - 2), 11, ctx, true);
  put(g, D + 3, 11, 'a');
  return { g, puzzle };
}

// Замок и ключ: на платформах, на острове, в лазе, на столбе (джетпак), под охраной
function genKeyLock(ctx) {
  const { r, d } = ctx;
  const w = 26 + ri(r, 0, 4);
  const g = makeGrid(w);
  const D = w - 5;
  barrier(g, D, 'lock');
  const variants = ['plat', 'island'];
  if (d > 0.25) variants.push('crawl', 'guard');
  if (d > 0.5) variants.push('pillar', 'pillar');
  const v = pick(r, variants);
  let puzzle = 'key';
  if (v === 'plat') {
    let row = 10, c = ri(r, 2, 4), lastC = c, lastR = row;
    const steps = d > 0.4 ? 3 : 2;
    for (let i = 0; i < steps; i++) { fill(g, c, c + 2, row, row, '='); lastC = c; lastR = row; row -= 2; c += ri(r, 3, 5); }
    put(g, lastC + 1, lastR - 1, 'k');
  } else if (v === 'island') {
    const kind = pitKind(ctx);
    const pc = ri(r, 4, 7), pw = 7 + ri(r, 0, 2);
    pit(g, pc, pc + pw - 1, kind);
    const ic = pc + Math.floor((pw - 3) / 2);
    fill(g, ic, ic + 2, 10, 10, d > 0.6 ? 'X' : '=');
    put(g, ic + 1, 9, 'k');
  } else if (v === 'crawl') {
    // ключ в тупиковом лазе под плитой
    const k0 = ri(r, 6, 9), k1 = k0 + 5 + ri(r, 0, 3);
    fill(g, k0, k1, 8, 9, '#'); fill(g, k1 + 1, k1 + 1, 8, 11, '#');
    fill(g, k0 - 3, k0 - 1, 10, 10, '=');
    put(g, k1, 11, 'k'); put(g, k0 + 2, 11, 'e');
    puzzle = 'crouch';
  } else if (v === 'pillar') {
    const pc = ri(r, 8, D - 5);
    fill(g, pc, pc + 1, 5, 11, '#');
    put(g, pc, 4, 'k');
    puzzle = 'jet';
  } else {
    const kc = ri(r, 10, D - 5);
    put(g, kc, 11, 'k');
    put(g, kc - 3, 11, groundLetter(ctx, true)); put(g, kc + 3, 11, 'g');
  }
  const nf = foeCount(ctx, 0);
  for (let i = 0; i < nf; i++) flyer(g, ri(r, 4, D - 2), ri(r, 3, 6), ctx);
  put(g, D + 3, 11, 'a');
  return { g, puzzle };
}

// Ящик на кнопку (кнопка в лунке — ящик сам в неё сваливается)
function genCratePlate(ctx) {
  const { r, d } = ctx;
  const bk = doorKind(ctx);
  if (d > 0.4 && chance(r, 0.5)) {
    // ящик на уступе: столкни его вниз, прямо в лунку
    const w = 26 + ri(r, 0, 3);
    const g = makeGrid(w);
    const D = w - 5;
    const lw = 6 + ri(r, 0, 2);
    fill(g, 3, 3 + lw, 8, 8, '#');
    put(g, 4, 7, 'C');
    fill(g, 5 + lw, 7 + lw, 10, 10, '=');
    put(g, 2, FLOOR, '_');
    barrier(g, D, bk);
    put(g, ri(r, 10 + lw, D - 2), 11, groundLetter(ctx, false));
    put(g, D + 3, 11, 'a');
    return { g, puzzle: 'crate' };
  }
  const w = 24 + ri(r, 0, 6);
  const g = makeGrid(w);
  const D = w - 5;
  const P = ri(r, 9, D - 4);
  put(g, 4, 11, 'C');
  put(g, P, FLOOR, '_');
  barrier(g, D, bk);
  const nf = foeCount(ctx, 0);
  for (let i = 0; i < nf; i++) flyer(g, ri(r, 6, D - 2), ri(r, 5, 8), ctx);
  put(g, D + 3, 11, 'a');
  return { g, puzzle: bk === 'laser' ? 'laser' : 'crate' };
}

// Движущиеся платформы над пропастью (и лифт к высокому выходу)
function genMovers(ctx) {
  const { r, d } = ctx;
  const lift = d > 0.5 && chance(r, 0.5);
  const pw = 12 + ri(r, 0, 4) + (d > 0.4 ? 3 : 0);
  const w = 4 + pw + (lift ? 7 : 4);
  const g = makeGrid(w);
  pit(g, 4, 3 + pw, pitKind(ctx));
  if (d > 0.4) {
    const a = 4, m = 4 + Math.floor(pw / 2);
    put(g, a, 10, 'M'); put(g, m - 2, 10, '}');
    put(g, m, 9, 'M'); put(g, 3 + pw - 2, 9, '}');
  } else { put(g, 4, 10, 'M'); put(g, 3 + pw - 2, 10, '}'); }
  atoms(g, 6, 2 + pw, 7);
  if (chance(r, 0.4 + d * 0.4)) flyer(g, 4 + Math.floor(pw / 2), 5, ctx);
  if (lift) {
    // высокий уступ, на него — вертикальный лифт
    const lc = 4 + pw;
    fill(g, lc + 3, w - 1, 6, FLOOR - 1, '#');
    put(g, lc, 11, 'V'); put(g, lc, 6, '{');
    foe(g, w - 2, 5, ctx);
  }
  return { g };
}

// Треснувшая стена, за ней — бонус
function genSecret(ctx) {
  const { r, d } = ctx;
  const w = 20 + ri(r, 0, 5);
  const g = makeGrid(w);
  const s = ri(r, 7, w - 10);
  fill(g, s, s, 9, 11, 'R');
  fill(g, s + 1, s + 7, 9, 9, '#'); fill(g, s + 7, s + 7, 10, 11, '#');
  put(g, s + 4, 11, d < 0.5 && chance(r, 0.5) ? 'u' : 'h');
  put(g, s + 2, 11, 'a');
  foe(g, ri(r, 2, s - 2), 11, ctx);
  atoms(g, s + 1, s + 6, 7);
  return { g, puzzle: 'secret' };
}

// Пружина — единственный путь через высокую стену (если не хватает топлива)
function genSpring(ctx) {
  const { r, d } = ctx;
  const w = 22 + ri(r, 0, 4);
  const g = makeGrid(w);
  const wc = ri(r, 9, 12), wh = d > 0.5 ? 8 : 7;
  fill(g, wc, wc + 1, FLOOR - wh, FLOOR - 1, '#');
  put(g, wc - 3, 11, 'S');
  if (d > 0.35) { fill(g, wc - 2, wc - 1, 11, 11, '^'); }
  atoms(g, wc - 4, wc + 2, FLOOR - wh - 2);
  const nf = foeCount(ctx, 0);
  for (let i = 0; i < nf; i++) foe(g, ri(r, wc + 4, w - 2), 11, ctx, true);
  return { g };
}

// Рассыпающийся мост
function genCrumble(ctx) {
  const { r, d } = ctx;
  const pw = 10 + ri(r, 0, 4) + Math.round(d * 3);
  const w = pw + 8;
  const g = makeGrid(w);
  pit(g, 4, 3 + pw, pitKind(ctx) === 'liquid' ? 'liquid' : 'void');
  if (d > 0.5) {
    // ступенчатый: вверх и вниз
    let row = 11;
    for (let c = 4; c <= 3 + pw; c += 3) { fill(g, c, c + 1, row, row, 'X'); row = row === 11 ? 9 : 11; }
  } else fill(g, 4, 3 + pw, FLOOR, FLOOR, 'X');
  atoms(g, 5, 2 + pw, 8);
  const nf = foeCount(ctx, 0);
  for (let i = 0; i < nf; i++) flyer(g, ri(r, 5, 2 + pw), ri(r, 4, 7), ctx);
  return { g };
}

// Арена: толпа врагов и платформы
function genGauntlet(ctx) {
  const { r, d } = ctx;
  const w = 24 + ri(r, 0, 6);
  const g = makeGrid(w);
  const p1 = ri(r, 4, 7), p2 = ri(r, w - 11, w - 7);
  fill(g, p1, p1 + 3, 9, 9, '='); fill(g, p2, p2 + 3, 9, 9, '=');
  put(g, p1 + 1, 8, 'g'); atoms(g, p2, p2 + 3, 8);
  const n = 3 + Math.round(d * 4);
  for (let i = 0; i < n; i++) foe(g, Math.round(4 + (i + 0.5) * (w - 7) / n + r() * 2 - 1), 11, ctx, true);
  for (let i = 0; i < 1 + Math.round(d * 2); i++) flyer(g, ri(r, 4, w - 4), ri(r, 3, 6), ctx);
  if (d > 0.4 && (ctx.loc === 'junk' || ctx.loc === 'factory')) put(g, Math.floor(w / 2), 3, 'P');
  if (chance(r, 0.4)) put(g, Math.floor(w / 2), 7, 'h');
  return { g };
}

// Мигающие платформы над пропастью
function genBlink(ctx) {
  const { r, d } = ctx;
  const pw = 13 + ri(r, 0, 4) + Math.round(d * 3);
  const w = pw + 8;
  const g = makeGrid(w);
  pit(g, 4, 3 + pw, pitKind(ctx));
  let c = 5, a = true, row = 10;
  while (c + 2 <= 3 + pw - 1) {
    fill(g, c, c + 2, row, row, a ? '!' : '?');
    if (chance(r, 0.4)) put(g, c + 1, row - 2, 'a');
    c += ri(r, 4, 5); a = !a; row = row === 10 ? (d > 0.5 ? 8 : 9) : 10;
  }
  if (chance(r, 0.3 + d * 0.5)) flyer(g, 4 + Math.floor(pw / 2), 5, ctx);
  return { g, puzzle: 'blink' };
}

// Высоченная стена — только на джетпаке
function genJetWall(ctx) {
  const { r, d } = ctx;
  const w = 20 + ri(r, 0, 5);
  const g = makeGrid(w);
  const wc = ri(r, 8, 11), wh = 5 + (d > 0.6 ? 1 : 0) + (d > 0.85 ? 1 : 0);
  fill(g, wc, wc + 1 + ri(r, 0, 2), FLOOR - wh, FLOOR - 1, '#');
  if (d > 0.5) fill(g, wc - 2, wc - 1, 11, 11, '^');
  atoms(g, wc, wc + 2, FLOOR - wh - 2);
  if (d > 0.45) { const kind = pitKind(ctx); pit(g, wc + 5, wc + 7, kind); }
  flyer(g, wc + 1, FLOOR - wh - 4, ctx);
  foe(g, w - 3, 11, ctx);
  return { g, puzzle: 'jet' };
}

// Закрытая комната с рычагом — попасть только телепортом
function genTeleport(ctx) {
  const { r, d } = ctx;
  const D = ri(r, 10, 13);
  const rc = D + 3 + ri(r, 0, 2), r0 = ri(r, 0, 2);
  const w = rc + 11;
  const g = makeGrid(w);
  barrier(g, D, doorKind(ctx));
  fill(g, rc, rc + 7, r0, r0 + 4, '#'); fill(g, rc + 1, rc + 6, r0 + 1, r0 + 3, ' ');
  put(g, rc + 5, r0 + 2, 'L'); put(g, rc + 2, r0 + 3, 'T');
  if (d > 0.6) put(g, rc + 4, r0 + 3, 'e');
  put(g, ri(r, 3, D - 3), 11, 'T');
  foe(g, ri(r, 2, D - 2), 11, ctx);
  put(g, D + 4, 11, 'a');
  return { g, puzzle: 'teleport' };
}

const GENS = [
  { id: 'run', min: 0, f: genRun },
  { id: 'climb', min: 0, f: genClimb },
  { id: 'tunnel', min: 1, f: genTunnel, noWater: true },
  { id: 'lever', min: 2, f: genLeverDoor, puzzle: true },
  { id: 'movers', min: 3, f: genMovers },
  { id: 'key', min: 4, f: genKeyLock, puzzle: true },
  { id: 'secret', min: 5, f: genSecret, noWater: true },
  { id: 'spring', min: 5, f: genSpring, noWater: true },
  { id: 'crate', min: 6, f: genCratePlate, puzzle: true, noWater: true },
  { id: 'crumble', min: 7, f: genCrumble },
  { id: 'gauntlet', min: 8, f: genGauntlet },
  { id: 'blink', min: 9, f: genBlink, puzzle: true },
  { id: 'jet', min: 10, f: genJetWall, noWater: true },
  { id: 'teleport', min: 12, f: genTeleport, puzzle: true },
];
// ручные общие участки, которым нельзя под воду
const NO_WATER = new Set(['tunnel', 'plate', 'crateclimb', 'turret', 'spring', 'secret']);

// ---------- Особенности локаций поверх участка ----------
function flatRuns(g, minLen) {
  const runs = []; let s = -1;
  for (let c = 0; c <= g[0].length; c++) {
    const ok = c < g[0].length && g[FLOOR][c] === '#' && g[11][c] === ' ' && g[10][c] === ' ' && g[9][c] === ' ';
    if (ok && s < 0) s = c;
    if (!ok && s >= 0) { if (c - s >= minLen) runs.push([s, c - 1]); s = -1; }
  }
  return runs;
}
function decorate(g, ctx) {
  const { r, d, loc } = ctx, w = g[0].length;
  const hasPlate = g[FLOOR].includes('_') || g.some(row => row.includes('C') || row.includes('S'));
  if ((loc === 'junk' || loc === 'factory') && !hasPlate) {
    for (const [a, b] of flatRuns(g, 6)) if (chance(r, 0.35 + d * 0.3)) fill(g, a + 1, b - 1, FLOOR, FLOOR, chance(r, 0.5) ? '<' : '>');
  }
  if (loc === 'lava' && !hasPlate) {
    let last = -9;
    for (const [a, b] of flatRuns(g, 4)) for (let c = a + 1; c < b; c++) {
      const open = [5, 6, 7, 8, 9].every(rr => g[rr][c] === ' ');
      if (open && c - last > 5 && chance(r, 0.25 + d * 0.3)) { put(g, c, 11, 'Y'); last = c; }
    }
  }
  if (loc === 'ice') {
    let last = -9;
    for (let c = 1; c < w - 1; c++) for (let rr = 1; rr <= 7; rr++) {
      if (g[rr][c] === '#' && g[rr + 1][c] === ' ' && g[rr + 2][c] === ' ' && g[FLOOR][c] === '#' && c - last > 3 && chance(r, 0.4)) { put(g, c, rr + 1, 'i'); last = c; break; }
    }
  }
  if (loc === 'dark') for (let c = ri(r, 2, 6); c < w - 2; c += ri(r, 9, 14)) { let rr = 1; while (rr < 8 && g[rr][c] !== ' ') rr++; if (g[rr][c] === ' ') put(g, c, rr, 'l'); }
  if (loc === 'water') for (const [a, b] of flatRuns(g, 3)) if (chance(r, 0.6)) put(g, Math.floor((a + b) / 2), 11, 'q');
  if (loc === 'crystal' || loc === 'whale') {
    let alt = true;
    for (let rr = 0; rr < FLOOR; rr++) for (let c = 0; c < w; c++) if (g[rr][c] === '=') {
      let e = c; while (e < w && g[rr][e] === '=') e++;
      if (chance(r, 0.5)) { fill(g, c, e - 1, rr, rr, loc === 'crystal' ? (alt ? '!' : '?') : 'X'); alt = !alt; }
      c = e;
    }
  }
}

// ---------- Сборка 33 уровней ----------
// какую механику уже показывает общий ручной участок
const GENERIC_FAMILY = { gaps: 'run', spikepit: 'run', hop: 'run', moving: 'movers', vmove: 'movers', bridge: 'lever', plate: 'crate', crateclimb: 'crate', turret: 'tunnel', zigzag: 'climb', arena: 'gauntlet' };
function buildLevels() {
  const levels = [];
  const platLocs = LOCATIONS.map((l, i) => i).filter(i => !LOCATIONS[i].race);
  const totalPlat = platLocs.length * 3;
  // общие ручные участки — каждый ровно один раз, по возрастанию сложности
  const generic = Object.keys(CHUNKS).filter(k => !CHUNKS[k].loc && CHUNKS[k].diff).sort((a, b) => CHUNKS[a].diff - CHUNKS[b].diff);
  const genericFor = {};
  {
    const slots = [];
    platLocs.forEach(li => { for (let n = 0; n < 3; n++) slots.push({ li, n, pl: slots.length }); });
    let gi = 0;
    for (let s = 0; s < slots.length && gi < generic.length; s++) {
      const want = Math.floor(gi * slots.length / generic.length);
      if (s < want) continue;
      const water = LOCATIONS[slots[s].li].theme.underwater;
      // подводным уровням — только подходящие; неподходящий отдаём следующему уровню
      let k = gi;
      while (k < generic.length && water && NO_WATER.has(generic[k])) k++;
      if (k >= generic.length) continue;
      [generic[gi], generic[k]] = [generic[k], generic[gi]];
      genericFor[slots[s].pl] = generic[gi++];
    }
  }
  let pl = 0, introduced = 0, lastUsed = new Set();
  LOCATIONS.forEach((loc, li) => {
    for (let n = 0; n < 3; n++) {
      const name = LEVEL_NAMES[li][n];
      if (loc.race) { levels.push({ loc: li, n, race: n, name }); continue; }
      const d = pl / (totalPlat - 1);
      const r = seeded(1000 + pl * 97);
      const water = !!loc.theme.underwater;
      const ctx = { r, d, loc: loc.key, pl };
      const spec = Object.keys(CHUNKS).filter(k => CHUNKS[k].loc === loc.key);
      const middle = [];
      if (spec[n]) middle.push(spec[n]);
      if (genericFor[pl]) middle.push(genericFor[pl]);
      const total = Math.max(3, 3 + Math.floor(pl / 5) + (n === 1 ? 1 : 0) - (n === 2 ? 1 : 0));
      const avail = GENS.filter(gd => gd.min <= pl && !(water && gd.noWater));
      const used = new Set();
      // ручной общий участок уже даёт свою механику — не дублируем её процедурным
      if (genericFor[pl]) used.add(GENERIC_FAMILY[genericFor[pl]] || genericFor[pl]);
      const chosen = [];
      // новая механика на каждом уровне, пока они не кончились
      const fresh = avail.filter(gd => gd.min >= introduced && gd.min <= pl).sort((a, b) => a.min - b.min);
      if (fresh.length) { introduced = fresh[0].min + 1; if (!used.has(fresh[0].id)) { chosen.push(fresh[0]); used.add(fresh[0].id); } }
      const needPuzzles = 1 + Math.floor(d * 3);
      // то, что было на прошлом уровне, — в конец очереди
      const fresher = list => list.sort((a, b) => lastUsed.has(a.id) - lastUsed.has(b.id));
      const puzzles = fresher(shuffle(avail.filter(gd => gd.puzzle && !used.has(gd.id)), r));
      for (const gd of puzzles) { if (chosen.filter(x => x.puzzle).length >= needPuzzles || middle.length + chosen.length >= total) break; chosen.push(gd); used.add(gd.id); }
      const rest = fresher(shuffle(avail.filter(gd => !used.has(gd.id)), r));
      for (const gd of rest) { if (middle.length + chosen.length >= total) break; chosen.push(gd); used.add(gd.id); }
      chosen.forEach((gd, k) => {
        const res = gd.f(ctx);
        decorate(res.g, ctx);
        const id = `p${pl}_${k}_${gd.id}`;
        CHUNKS[id] = { rows: res.g.map(row => row.join('')), puzzle: res.puzzle, gen: gd.id };
        middle.push(id);
      });
      lastUsed = new Set(chosen.map(gd => gd.id));
      const mids = shuffle(middle, r);
      // контрольная точка посередине длинного уровня
      if (mids.length >= 5) { const id = mids[Math.floor(mids.length / 2)]; CHUNKS[id + '_c'] = withCheckpoint(CHUNKS[id]); mids[Math.floor(mids.length / 2)] = id + '_c'; }
      const p = platLocs.indexOf(li);
      const gift = { '0,1': 1, '1,0': 2, '2,0': 3, '3,0': 4 }[p + ',' + n];
      levels.push({ loc: li, n, name, chunks: ['start', ...mids, n === 2 ? 'boss' : 'end'], gift, d, boss: n === 2 });
      pl++;
    }
  });
  return levels;
}
// копия участка с флажком-чекпоинтом на первой свободной клетке пола
function withCheckpoint(ch) {
  const rows = ch.rows.map(s => s.split(''));
  const off = ROWS - rows.length;
  for (let c = 0; c < rows[0].length; c++) {
    const r = 11 - off;
    if (r >= 0 && rows[r][c] === ' ' && rows[r + 1] && rows[r + 1][c] === '#') { rows[r][c] = 'c'; break; }
  }
  return { ...ch, rows: rows.map(r => r.join('')) };
}
const LEVELS = buildLevels();
