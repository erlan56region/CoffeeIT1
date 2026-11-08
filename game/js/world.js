/* =========================================================
   ЧЕРВЯК ДЖИМ — мир: загрузка уровня, физика тайлов, игрок, оружие,
   механизмы (рычаги, двери, ключи, телепорты…), враги и боссы
   ========================================================= */
'use strict';

let state = 'loading', stateT = 0, gameTime = 0;
let level = null, player = null, camX = 0, shake = 0;
let enemies = [], corpses = [], bullets = [], ebullets = [], items = [], particles = [], floaters = [];
let movers = [], crates = [], levers = [], plates = [], teleports = [], geysers = [], icicles = [], crushers = [], vents = [], bubbles = [], lamps = [], npcs = [], checkpoints = [];
let boss = null, exitDoor = null;
let lives = 5, score = 0, curLevel = 0, levelTime = 0;
let ammo = WEAPONS.map(w => w.pack ? 0 : Infinity);
let banner = null; // {text, sub, t}

// ---------- Частицы ----------
function puff(x, y, size = 1, vx = 0, color = 'rgba(235,225,255,0.85)') {
  particles.push({ kind: 'puff', x, y, vx: vx + rand(-30, 30), vy: rand(-60, -20), life: 0.5, max: 0.5, size: rand(10, 16) * size, color });
}
function sparks(x, y, color = '#fff6a0', n = 8, speed = 300) {
  for (let i = 0; i < n; i++) { const a = rand(0, Math.PI * 2), s = rand(0.3, 1) * speed; particles.push({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.25, 0.5), max: 0.5, size: rand(2, 4), color }); }
}
function shards(x, y, color, n = 8) {
  for (let i = 0; i < n; i++) particles.push({ kind: 'shard', x, y, vx: rand(-260, 260), vy: rand(-520, -120), life: rand(0.6, 1), max: 1, size: rand(5, 11), color, rot: rand(0, 6), vr: rand(-12, 12), g: 1 });
}
function feathers(x, y, n = 6, color = '#1d1d26') {
  for (let i = 0; i < n; i++) particles.push({ kind: 'feather', x, y, vx: rand(-160, 160), vy: rand(-220, 40), life: rand(0.8, 1.3), max: 1.3, size: rand(7, 12), color, rot: rand(0, 6), vr: rand(-6, 6) });
}
function ring(x, y, color, r = 60) { particles.push({ kind: 'ring', x, y, vx: 0, vy: 0, life: 0.35, max: 0.35, size: r, color }); }
function floatText(x, y, text, color = '#ffe14a') { floaters.push({ x, y, text, color, t: 0 }); }
function updateParticles(dt) {
  // затухание скорости не зависит от частоты кадров
  const d92 = Math.pow(0.92, dt * 60), d97 = Math.pow(0.97, dt * 60), d90 = Math.pow(0.9, dt * 60);
  for (const p of particles) {
    p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.kind === 'puff') { p.vx *= d92; p.vy *= d92; p.size += dt * 22; }
    if (p.kind === 'feather') { p.vy = Math.min(p.vy + 300 * dt, 90); p.vx *= d97; p.rot += p.vr * dt; }
    if (p.g) { p.vy += 1400 * dt; p.rot += p.vr * dt; }
    if (p.kind === 'spark') { p.vx *= d90; p.vy *= d90; }
    if (p.kind === 'pop') { p.vy *= d90; }
  }
  // поверженные враги: подпрыгивают, кувыркаются и тают
  for (const c of corpses) { c.deathT += dt; c.vy += 1500 * dt; c.x += c.dvx * dt; c.y += c.vy * dt; c.deathRot += c.dvr * dt; }
  corpses = corpses.filter(c => c.deathT < 0.6);
  particles = particles.filter(p => p.life > 0);
  if (particles.length > MAX_PARTICLES) particles.splice(0, particles.length - MAX_PARTICLES);
  for (const f of floaters) { f.t += dt; f.y -= 50 * dt * (1.6 - f.t); }
  floaters = floaters.filter(f => f.t < 1.1);
}

// ---------- Сборка уровня из чанков ----------
function chunkRows(id) {
  const c = CHUNKS[id];
  const w = Math.max(...c.rows.map(r => r.length));
  const rows = c.rows.map(r => r.padEnd(w, ' '));
  while (rows.length < ROWS) rows.unshift(' '.repeat(w));
  return { rows, w };
}

function newPlayer(x, y) {
  return { x, y, w: PLAYER_W, h: STAND_H, vx: 0, vy: 0, onGround: false, face: 1, crouch: false, glide: false, jet: false, fuel: 1, jetSnd: 0, inv: 0, health: 100,
    weapon: 0, shootCd: 0, whip: 0, whipCd: 0, whipHit: false, anim: newJimAnim(), keys: 0, oxygen: 100, inWater: false,
    coyote: 0, jumpBuf: 0, jumpCut: false, ride: null, teleLock: true, deathFly: false, dropT: 0, conveyor: 0, airT: 0 };
}

function loadLevel(idx) {
  curLevel = idx;
  const def = LEVELS[idx];
  const loc = LOCATIONS[def.loc];
  const parts = def.chunks.map(chunkRows);
  const cols = parts.reduce((s, p) => s + p.w, 0);
  const grid = [], group = [];
  for (let r = 0; r < ROWS; r++) { grid.push([]); group.push([]); }
  let off = 0;
  const chunkStarts = [];
  parts.forEach((p, gi) => {
    chunkStarts.push({ id: def.chunks[gi], x: off * TS, w: p.w * TS });
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < p.w; c++) { grid[r].push(p.rows[r][c]); group[r].push(gi); }
    off += p.w;
  });
  level = { def, loc, theme: loc.theme, cols, w: cols * TS, grid, group, chunks: chunkStarts, active: {}, crumble: {}, rhp: {}, springT: {},
    phase: false, phaseT: 0, segs: {}, dark: !!loc.theme.dark, underwater: !!loc.theme.underwater, slippery: !!loc.theme.slippery,
    checkpoint: null, arena: null, hints: [] };
  enemies = []; corpses = []; bullets = []; ebullets = []; items = []; particles = []; floaters = [];
  movers = []; crates = []; levers = []; plates = []; teleports = []; geysers = []; icicles = []; crushers = []; vents = []; bubbles = []; lamps = []; npcs = []; checkpoints = [];
  boss = null; exitDoor = null; banner = null;
  let start = { x: 100, y: 400 };
  const E = loc.enemies || {};
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < cols; c++) {
    const ch = grid[r][c];
    const x = c * TS, y = r * TS, bottom = (r + 1) * TS, cx = x + TS / 2, g = group[r][c];
    const clear = () => { grid[r][c] = ' '; };
    switch (ch) {
      case '@': start = { x: cx - PLAYER_W / 2, y: bottom - STAND_H }; clear(); break;
      case 'N': npcs.push({ x: cx, y: bottom, friend: loc.friend, t: 0, line: 0, lineT: 0, talked: false, gift: def.gift }); clear(); break;
      case 'E': exitDoor = { x: cx - 40, y: bottom - 120, w: 80, h: 120, open: !def.boss, t: 0 }; clear(); break;
      case 'c': checkpoints.push({ x: cx, y: bottom, on: false }); clear(); break;
      case 'B': boss = makeBoss(loc.boss, cx, bottom, chunkStarts[g]); clear(); break;
      case 'C': crates.push({ x: x + 1, y: bottom - 46, w: 46, h: 46, vx: 0, vy: 0, onGround: false }); clear(); break;
      case '_': plates.push({ x: x + 4, y: bottom - 10, w: TS - 8, h: 10, g, down: false }); clear(); break;
      case 'L': levers.push({ x, y, w: TS, h: TS, g, on: false, t: 0 }); clear(); break;
      case 'T': teleports.push({ x, y, w: TS, h: TS, r, c, t: rand(0, 6) }); clear(); break;
      case 'M': {
        let c2 = c + 1; while (c2 < cols && grid[r][c2] !== '}') c2++;
        if (c2 < cols) grid[r][c2] = ' ';
        movers.push({ x, y, w: TS * 3, h: 20, x0: x, x1: c2 * TS, y0: y, y1: y, t: rand(0, 6), dx: 0, dy: 0, speed: 0.55 });
        clear(); break;
      }
      case 'V': {
        let r2 = r - 1; while (r2 >= 0 && grid[r2][c] !== '{') r2--;
        if (r2 >= 0) grid[r2][c] = ' ';
        movers.push({ x, y, w: TS * 3, h: 20, x0: x, x1: x, y0: y, y1: Math.max(0, r2) * TS, t: 0, dx: 0, dy: 0, speed: 0.5 });
        clear(); break;
      }
      case 'Y': geysers.push({ x, y, bottom, t: (c * 0.37) % 3 }); clear(); break;
      case 'i': icicles.push({ x: cx - 12, y, w: 24, h: 44, vy: 0, state: 'hang', t: 0 }); clear(); break;
      case 'P': crushers.push({ x: cx - 34, y0: y, y, w: 68, h: 44, state: 'up', t: (c * 0.53) % 2.2, floor: findFloor(c, r) }); clear(); break;
      case 'q': vents.push({ x: cx, bottom, t: rand(0, 1.4) }); clear(); break;
      case 'l': lamps.push({ x: cx, y: y + 10, t: rand(0, 6) }); clear(); break;
      case 'a': case 'h': case 'u': case 'o': case 'k':
        items.push({ kind: ch, x: cx, y: y + TS / 2, t: rand(0, 6), taken: false }); clear(); break;
      case 'e': case 'f': case 'g': case 'j': case 'z': {
        const left = grid[r][c - 1], right = grid[r][c + 1];
        const inLiquid = left === '~' || right === '~';
        grid[r][c] = inLiquid ? '~' : ' ';
        if (E[ch]) enemies.push(makeEnemy(ch, E[ch], cx, bottom, inLiquid));
        break;
      }
      case 'R': level.rhp[r * cols + c] = 6; break;
    }
  }
  // Подсказки друга: реплики локации + советы по головоломкам этого уровня
  const hints = [...(loc.friend ? loc.friend.lines : [])];
  for (const t of loc.tips || []) hints.push(t);
  const seen = new Set();
  for (const id of def.chunks) { const pz = CHUNKS[id].puzzle; if (pz && !seen.has(pz)) { seen.add(pz); hints.push(PUZZLE_TIPS[pz]); } }
  if (def.chunks.includes('spring') || def.chunks.some(id => /springs/.test(id))) hints.push('Держи прыжок, когда касаешься пружины, — подлетишь выше. Отпусти — подпрыгнешь ниже.');
  if (def.boss) hints.push(`Впереди логово: ${loc.boss.name}! Запасись патронами.`);
  level.hints = hints;
  for (const n of npcs) n.hints = hints;
  pairTeleports();
  player = newPlayer(start.x, start.y);
  player.inWater = level.underwater;
  level.checkpoint = { x: start.x, y: start.y };
  camX = clamp(player.x - W * 0.35, 0, level.w - W);
  levelTime = 0;
  for (let i = 1; i < WEAPONS.length; i++) if (SAVE.weapons[i] && ammo[i] <= 0) ammo[i] = Math.ceil(WEAPONS[i].start / 2);
  if (!SAVE.weapons[player.weapon]) player.weapon = 0;
  player.weapon = SAVE.weapons[lastWeapon] && (ammo[lastWeapon] > 0) ? lastWeapon : 0;
}
let lastWeapon = 0;

function pairTeleports() {
  // парами в порядке появления (сверху вниз, слева направо) внутри каждого чанка
  const byChunk = {};
  for (const t of teleports) { const g = level.group[t.r][t.c]; (byChunk[g] = byChunk[g] || []).push(t); }
  for (const g in byChunk) {
    const list = byChunk[g].sort((a, b) => a.r - b.r || a.c - b.c);
    for (let i = 0; i + 1 < list.length; i += 2) { list[i].to = list[i + 1]; list[i + 1].to = list[i]; }
  }
}
function findFloor(c, r) {
  for (let rr = r + 1; rr < ROWS; rr++) { const ch = level.grid[rr][c]; if (ch === '#' || ch === '<' || ch === '>') return rr * TS; }
  return H;
}

// ---------- Тайлы ----------
function groupActive(g) { return !!level.active[g]; }
function tileAt(c, r) {
  if (c < 0 || c >= level.cols) return 1;
  if (r < 0) { // стены и лазеры до верха экрана нельзя перелететь
    const top = level.grid[0][c];
    return level.theme.ceiling || tileAt(c, 0) === 1 || (top === 'Z' && !groupActive(level.group[0][c])) ? 1 : 0;
  }
  if (r >= ROWS) return 0;
  const ch = level.grid[r][c];
  switch (ch) {
    case '#': case '<': case '>': case 'S': case 'R': case 'K': return 1;
    case 'X': { const k = level.crumble[r * level.cols + c]; return k && k.gone ? 0 : 1; }
    case '=': return 2;
    case 'D': return groupActive(level.group[r][c]) ? 0 : 1;
    case 'b': return groupActive(level.group[r][c]) ? 1 : 0;
    case '!': return level.phase ? 0 : 1;
    case '?': return level.phase ? 1 : 0;
  }
  return 0;
}
const charAt = (c, r) => (r < 0 || r >= ROWS || c < 0 || c >= level.cols) ? ' ' : level.grid[r][c];
function setTile(c, r, ch) { level.grid[r][c] = ch; invalidateSeg(c); }
function invalidateSeg(c) {
  // тайл рисуется с соседями, поэтому сбрасываем все сегменты, которых он касается
  const s0 = Math.floor((c - 1) * TS / SEG_W), s1 = Math.floor((c + 2) * TS / SEG_W);
  for (let s = s0; s <= s1; s++) if (level.segs[s]) { segPool.push(level.segs[s]); delete level.segs[s]; }
}
const SEG_W = 960;

// Движение AABB по тайлам. Возвращает {hitX, hitY, landed, landTile}
function moveBody(o, dx, dy, opts = {}) {
  const res = { hitX: false, hitY: false, landed: false, ceil: false, landC: -1, landR: -1 };
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 16));
  const sx = dx / steps, sy = dy / steps;
  for (let i = 0; i < steps; i++) {
    if (sx) {
      o.x += sx;
      const r0 = Math.floor((o.y + 1) / TS), r1 = Math.floor((o.y + o.h - 1) / TS);
      if (sx > 0) {
        const c = Math.floor((o.x + o.w - 0.01) / TS);
        for (let r = r0; r <= r1; r++) if (tileAt(c, r) === 1) { o.x = c * TS - o.w; res.hitX = true; break; }
      } else {
        const c = Math.floor(o.x / TS);
        for (let r = r0; r <= r1; r++) if (tileAt(c, r) === 1) { o.x = (c + 1) * TS; res.hitX = true; break; }
      }
    }
    if (sy) {
      const prevBottom = o.y + o.h;
      o.y += sy;
      const c0 = Math.floor((o.x + 1) / TS), c1 = Math.floor((o.x + o.w - 1) / TS);
      if (sy > 0) {
        const r = Math.floor((o.y + o.h - 0.01) / TS);
        for (let c = c0; c <= c1; c++) {
          const t = tileAt(c, r);
          if (t === 1 || (t === 2 && !opts.drop && prevBottom <= r * TS + 1)) { o.y = r * TS - o.h; res.hitY = true; res.landed = true; res.landC = c; res.landR = r; break; }
        }
      } else {
        const r = Math.floor(o.y / TS);
        for (let c = c0; c <= c1; c++) if (tileAt(c, r) === 1) { o.y = (r + 1) * TS; res.hitY = true; res.ceil = true; break; }
      }
    }
  }
  return res;
}
function boxFree(x, y, w, h) {
  const c0 = Math.floor((x + 1) / TS), c1 = Math.floor((x + w - 1) / TS), r0 = Math.floor((y + 1) / TS), r1 = Math.floor((y + h - 1) / TS);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (tileAt(c, r) === 1) return false;
  return true;
}
function tilesUnder(o, fn) {
  const c0 = Math.floor((o.x + 1) / TS), c1 = Math.floor((o.x + o.w - 1) / TS), r = Math.floor((o.y + o.h + 2) / TS);
  for (let c = c0; c <= c1; c++) fn(c, r, charAt(c, r));
}

// Платформы-сущности (движущиеся, ящики, замороженные враги): {x,y,w}
function topPlatforms() {
  const list = movers.slice();
  for (const cr of crates) list.push(cr);
  for (const e of enemies) if (e.frozen > 0 && !e.dead) list.push(e);
  return list;
}

// ---------- Игрок ----------
function hurtPlayer(dmg, fromX) {
  const p = player;
  if (p.inv > 0 || state !== 'play') return;
  p.health -= dmg;
  p.inv = 1.5;
  p.vx = (p.x + p.w / 2 < fromX ? -1 : 1) * 380;
  p.vy = level.underwater ? -200 : -460;
  p.onGround = false;
  shake = 0.3;
  SFX.hurt();
  sparks(p.x + p.w / 2, p.y + p.h / 2, '#ff9fc6', 10);
  if (p.health <= 0) killPlayer(false);
}
function killPlayer(pit) {
  const p = player;
  if (state !== 'play') return;
  p.health = 0;
  p.deathFly = !pit;
  if (!pit) { p.vy = -700; p.vx = -p.face * 160; }
  lives--;
  setState('dead');
  SFX.die();
}
function respawnPlayer() {
  const cp = level.checkpoint;
  const keep = { weapon: player.weapon, keys: player.keys };
  player = newPlayer(cp.x, cp.y);
  Object.assign(player, keep);
  player.inWater = level.underwater;
  player.inv = 1.8;
  ebullets = [];
  if (boss && boss.active && !boss.dead) resetBoss(boss);
  setState('play');
}

function wantShoot() { return pressed.shoot || (keys.shoot && WEAPONS[player.weapon].id === 'laser'); }

function cycleWeapon(dir) {
  const p = player;
  for (let i = 1; i <= WEAPONS.length; i++) {
    const w = (p.weapon + dir * i + WEAPONS.length * 3) % WEAPONS.length;
    if (SAVE.weapons[w]) { if (w !== p.weapon) { p.weapon = w; lastWeapon = w; SFX.switchW(); weaponFlash = 1; } return; }
  }
}
let weaponFlash = 0;

function updatePlayer(dt) {
  const p = player;
  p.inv = Math.max(0, p.inv - dt);
  p.shootCd -= dt; p.whipCd -= dt; p.dropT -= dt;
  const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);

  // Оружие: Q/E/Tab — по кругу, 1-5 — напрямую
  if (pressed.prevW) cycleWeapon(-1);
  if (pressed.nextW) cycleWeapon(1);
  for (let i = 0; i < WEAPONS.length; i++) if (pressed['w' + i] && SAVE.weapons[i] && p.weapon !== i) { p.weapon = i; lastWeapon = i; SFX.switchW(); weaponFlash = 1; }

  // Присед
  const wantCrouch = keys.down && (p.onGround || p.crouch) && !p.inWater;
  if (wantCrouch && !p.crouch) { p.crouch = true; p.y += p.h - CROUCH_H; p.h = CROUCH_H; }
  else if (!wantCrouch && p.crouch) {
    if (boxFree(p.x, p.y + p.h - STAND_H, p.w, STAND_H)) { p.crouch = false; p.y += p.h - STAND_H; p.h = STAND_H; }
  }

  // Горизонталь
  const maxV = p.crouch ? CRAWL : p.inWater ? 270 : RUN;
  const slip = level.slippery && p.onGround;
  const airCtl = p.jet || p.glide;   // на джетпаке и вертолёте управление в воздухе точнее
  const accel = slip ? 700 : p.onGround ? 3600 : airCtl ? 3200 : 2200;
  const fric = slip ? 260 : p.onGround ? 3400 : airCtl ? 2600 : 900;
  if (dir) { p.vx += dir * accel * dt; if (Math.abs(p.vx) > maxV) p.vx = Math.sign(p.vx) * Math.max(maxV, Math.abs(p.vx) - fric * dt); p.face = dir; }
  else { const s = Math.sign(p.vx); p.vx -= s * fric * dt; if (Math.sign(p.vx) !== s) p.vx = 0; }

  // Прыжок / плавание
  if (pressed.jump) p.jumpBuf = 0.13; else p.jumpBuf -= dt;
  if (p.onGround) p.coyote = 0.1; else p.coyote -= dt;
  const dropReq = keys.down && p.jumpBuf > 0 && p.onGround && standingOnOneWay(p);
  if (dropReq) { p.dropT = 0.25; p.jumpBuf = 0; p.onGround = false; p.y += 2; }
  if (p.inWater) {
    if (p.jumpBuf > 0) { p.vy = -430; p.jumpBuf = 0; p.anim.stroke = 1; SFX.bubble(); bubbles.push({ x: p.x + p.w / 2, y: p.y + 20, vy: -60, r: 6, t: 0, deco: true }); }
    p.vy += 650 * dt;
    p.vy = clamp(p.vy, -460, 210);
    p.glide = false; p.jet = false;
  } else {
    let jumped = false;
    if (p.jumpBuf > 0 && p.coyote > 0) {
      let ok = true;
      if (p.crouch) { if (boxFree(p.x, p.y + p.h - STAND_H, p.w, STAND_H)) { p.crouch = false; p.y += p.h - STAND_H; p.h = STAND_H; } else ok = false; }
      if (ok) {
        p.vy = -JUMP_V; p.onGround = false; p.coyote = 0; p.jumpBuf = 0; p.jumpCut = false; p.ride = null;
        p.anim.takeoffT = 0.14; SFX.jump(); puff(p.x + p.w / 2, p.y + p.h, 0.8);
        jumped = true;
      }
    }
    // Джетпак: ещё раз нажми прыжок в воздухе и держи — тяга вверх, пока есть топливо
    if (p.onGround) { p.fuel = Math.min(1, p.fuel + dt * JET_REFILL); p.jet = false; }
    else if (pressed.jump && !jumped && p.fuel > 0.05) { p.jet = true; p.jumpBuf = 0; }
    if (p.jet && (!keys.jump || p.fuel <= 0 || p.onGround)) p.jet = false;
    if (p.jet) {
      p.fuel = Math.max(0, p.fuel - dt / JET_TIME);
      p.vy = Math.max(p.vy - JET_THRUST * dt, -JET_MAX_UP);
      p.jumpCut = true;
      p.jetSnd -= dt;
      if (p.jetSnd <= 0) { p.jetSnd = 0.09; SFX.jet(); }
      if (Math.random() < dt * 25) { const n = MX.apply(playerBones(p).torso, [160, 760]); particles.push({ kind: 'puff', x: n.x + rand(-4, 4), y: n.y, vx: rand(-30, 30), vy: rand(200, 320), life: 0.35, max: 0.35, size: rand(6, 10), color: 'rgba(255,200,120,0.75)' }); }
    }
    if (!keys.jump && p.vy < -300 && !p.jumpCut) { p.vy *= 0.5; p.jumpCut = true; }
    p.vy += GRAVITY * dt;
    p.glide = !p.onGround && keys.jump && p.vy > 0 && !p.jet;
    if (p.glide) p.vy = Math.min(p.vy, GLIDE_FALL);
    p.vy = Math.min(p.vy, 1300);
  }

  // Конвейер и езда на платформах
  let extraX = p.conveyor * 170 * dt, extraY = 0;
  if (p.ride && p.onGround) { extraX += p.ride.dx || 0; extraY += p.ride.dy || 0; }
  const prevBottom = p.y + p.h;
  // Горизонтальное движение + толкание ящиков
  const dx = p.vx * dt + extraX;
  const rx = moveBody(p, dx, 0);
  if (rx.hitX) p.vx = 0;
  pushCrates(p, dx);
  // Вертикаль
  const ry = moveBody(p, 0, p.vy * dt + extraY, { drop: p.dropT > 0 });
  const wasGround = p.onGround;
  p.onGround = false; p.ride = null; p.conveyor = 0;
  if (ry.ceil && p.vy < 0) p.vy = 0;
  if (ry.landed) {
    p.onGround = true;
    const ch = charAt(ry.landC, ry.landR);
    if (ch === 'S') { springBounce(p, ry.landC, ry.landR); }
    else { landing(p, wasGround); p.vy = 0; }
  }
  // Платформы-сущности
  if (p.vy >= 0 && !(p.dropT > 0)) {
    for (const pl of topPlatforms()) {
      const top = pl.y;
      if (p.x + p.w > pl.x + 2 && p.x < pl.x + pl.w - 2 && prevBottom <= top + 6 + Math.max(0, pl.dy || 0) && p.y + p.h >= top - 1) {
        p.y = top - p.h; if (!p.onGround) landing(p, wasGround); p.onGround = true; p.vy = 0; p.ride = pl; break;
      }
    }
  }
  if (p.onGround) {
    tilesUnder(p, (c, r, ch) => {
      if (ch === '<') p.conveyor = -1; else if (ch === '>') p.conveyor = 1;
      if (ch === 'X') { const k = level.crumble[r * level.cols + c] || (level.crumble[r * level.cols + c] = { t: 0, gone: false, shake: 0 }); if (!k.touched) { k.touched = true; k.t = 0; SFX.crumble(); } }
    });
  }
  // Стены арены босса
  if (level.arena) p.x = clamp(p.x, level.arena.x0, level.arena.x1 - p.w);
  p.x = clamp(p.x, 0, level.w - p.w);

  // Опасности
  const hb = { x: p.x + 6, y: p.y + 12, w: p.w - 12, h: p.h - 14 };
  const c0 = Math.floor(hb.x / TS), c1 = Math.floor((hb.x + hb.w) / TS), r0 = Math.floor(hb.y / TS), r1 = Math.floor((hb.y + hb.h) / TS);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const ch = charAt(c, r);
    if (ch === '^') { const was = p.inv; hurtPlayer(20, c * TS + 24); p.vy = level.underwater ? -380 : -950; p.onGround = false; if (was) p.vx *= 0.5; }
    else if (ch === '~') { hurtPlayer(25, c * TS + 24); p.vy = level.underwater ? -420 : -1050; p.onGround = false; if (state === 'play') sparks(p.x + p.w / 2, (r) * TS, level.theme.liquid[0], 12); }
    else if (ch === 'Z' && !groupActive(level.group[r][c])) { hurtPlayer(25, c * TS + 24); p.vx = (p.x + p.w / 2 < c * TS + 24 ? -1 : 1) * 520; }
  }
  // замок открывается, если упереться в него с ключом
  if (p.keys > 0) {
    const kc0 = Math.floor((p.x - 6) / TS), kc1 = Math.floor((p.x + p.w + 6) / TS), kr0 = Math.floor(p.y / TS), kr1 = Math.floor((p.y + p.h - 1) / TS);
    outer: for (let r = kr0; r <= kr1; r++) for (let c = kc0; c <= kc1; c++) if (charAt(c, r) === 'K') { unlock(c, r); break outer; }
  }
  if (p.y > H + 60) { killPlayer(true); return; }

  // Кислород под водой
  if (p.inWater) {
    p.oxygen -= dt * 4;
    if (p.oxygen <= 0) { p.oxygen = 0; p.airDmg = (p.airDmg || 0) + dt; if (p.airDmg > 1) { p.airDmg = 0; p.inv = 0; hurtPlayer(10, p.x); } }
  }

  // Стрельба
  if (wantShoot() && p.shootCd <= 0 && p.whip <= 0) fireWeapon(p);
  // Хлыст-голова
  if (pressed.whip && p.whipCd <= 0 && !p.crouch) { p.whip = 0.28; p.whipCd = 0.42; p.whipHit = false; SFX.whip(); }
  if (p.whip > 0) {
    p.whip -= dt;
    if (!p.whipHit && p.whip < 0.2 && p.whip > 0.08) {
      p.whipHit = true;
      const box = { x: p.face > 0 ? p.x + p.w / 2 : p.x + p.w / 2 - 200, y: p.y + 4, w: 200, h: 56 };
      meleeHit(box, 2);
    }
  }

  updateJimAnim(p, dt, dir);
  if (p.onGround && Math.abs(p.vx) > 150 && slip && Math.random() < dt * 20) puff(p.x + p.w / 2, p.y + p.h, 0.5, 0, 'rgba(255,255,255,0.8)');
  p.airT = p.onGround ? 0 : p.airT + dt;

  // Телепорты
  const feet = { x: p.x + 8, y: p.y + p.h - 30, w: p.w - 16, h: 28 };
  const onT = teleports.find(t => t.to && overlap(feet, t));
  if (!onT) p.teleLock = false;
  else if (!p.teleLock && p.onGround) {
    const to = onT.to;
    sparks(p.x + p.w / 2, p.y + p.h / 2, '#c08aff', 18);
    p.x = to.x + TS / 2 - p.w / 2; p.y = (to.r + 1) * TS - p.h; p.vx = 0; p.vy = 0; p.teleLock = true;
    sparks(p.x + p.w / 2, p.y + p.h / 2, '#c08aff', 18);
    SFX.teleport(); ring(p.x + p.w / 2, p.y + p.h / 2, '#c08aff', 90);
  }
}
function standingOnOneWay(p) {
  let any = false;
  tilesUnder(p, (c, r) => { if (tileAt(c, r) === 2) any = true; });
  return any || (p.ride && p.ride.h === 20);
}
function landing(p, wasGround) {
  if (!wasGround && p.airT > 0.15) {
    const pow = clamp(p.vy / 1100, 0.25, 1);
    p.anim.landT = 0.24; p.anim.landPow = pow;
    puff(p.x + p.w / 2 - 14, p.y + p.h, 0.6 * pow + 0.3, -60); puff(p.x + p.w / 2 + 14, p.y + p.h, 0.6 * pow + 0.3, 60);
  }
}
function springBounce(o, c, r) {
  const strong = o === player && keys.jump;
  o.vy = strong ? -1450 : -1100;
  o.onGround = false;
  level.springT[r * level.cols + c] = 0.3;
  if (o === player) { o.jumpCut = true; o.anim.takeoffT = 0.14; o.airT = 0.2; }
  SFX.spring();
}

function pushCrates(p, dx) {
  for (const cr of crates) {
    if (!overlap(p, cr)) continue;
    if (p.y + p.h <= cr.y + 8) continue; // стоит сверху
    const fromLeft = p.x + p.w / 2 < cr.x + cr.w / 2;
    const want = fromLeft ? (p.x + p.w) - cr.x : (p.x - (cr.x + cr.w));
    const before = cr.x;
    // ящик сдвигается, только если толкаем в его сторону
    if (cr.onGround && ((fromLeft && dx > 0) || (!fromLeft && dx < 0))) {
      moveBody(cr, want, 0);
      if (!crateBlockedByCrate(cr)) { if (level.slippery && cr.onGround) cr.vx = p.vx * 1.1; }
      else cr.x = before;
    }
    if (fromLeft) p.x = cr.x - p.w; else p.x = cr.x + cr.w;
    if (Math.abs(cr.x - before) < 0.5) p.vx = 0;
  }
}
function crateBlockedByCrate(cr) { return crates.some(o => o !== cr && overlap(o, cr)); }

function updateCrates(dt) {
  for (const cr of crates) {
    cr.vy = Math.min(cr.vy + GRAVITY * dt, 1200);
    if (cr.vx) {
      const r = moveBody(cr, cr.vx * dt, 0);
      if (r.hitX || crateBlockedByCrate(cr)) { if (crateBlockedByCrate(cr)) cr.x -= cr.vx * dt; cr.vx = 0; SFX.hit(); }
      const f = level.slippery ? 120 : 3000;
      const s = Math.sign(cr.vx); cr.vx -= s * f * dt; if (Math.sign(cr.vx) !== s) cr.vx = 0;
    }
    const r = moveBody(cr, 0, cr.vy * dt);
    if (r.landed) { if (!cr.onGround && cr.vy > 300) { puff(cr.x + 23, cr.y + 46, 0.8); SFX.crumble(); } cr.vy = 0; cr.onGround = true; }
    else cr.onGround = false;
    // ящик на ящике / на платформе
    for (const o of crates) if (o !== cr && cr.vy >= 0 && cr.x + cr.w > o.x + 4 && cr.x < o.x + o.w - 4 && cr.y + cr.h > o.y && cr.y + cr.h < o.y + 20) { cr.y = o.y - cr.h; cr.vy = 0; cr.onGround = true; }
    for (const m of movers) if (cr.vy >= 0 && cr.x + cr.w > m.x && cr.x < m.x + m.w && cr.y + cr.h >= m.y - 2 && cr.y + cr.h < m.y + 16) { cr.y = m.y - cr.h; cr.x += m.dx; cr.vy = 0; cr.onGround = true; }
    if (cr.y > H + 100) { cr.dead = true; }
    // ящик сам «проваливается» в узкую яму-лунку (там обычно кнопка)
    if (cr.onGround) {
      const cc = Math.floor((cr.x + cr.w / 2) / TS), rr = Math.floor((cr.y + cr.h + 2) / TS);
      if (tileAt(cc, rr) === 0 && Math.abs(cr.x + cr.w / 2 - (cc * TS + TS / 2)) < 16) { cr.x = cc * TS + (TS - cr.w) / 2; cr.y += 4; cr.onGround = false; cr.vx = 0; }
    }
    // конвейер
    if (cr.onGround) tilesUnder(cr, (c, rr, ch) => { if (ch === '<') moveBody(cr, -170 * dt, 0); else if (ch === '>') moveBody(cr, 170 * dt, 0); });
    // шипы/лава уничтожают ящик? Нет — ящик лишь стоит.
  }
  crates = crates.filter(c => !c.dead);
}

function unlock(c, r) {
  const p = player;
  p.keys--;
  const stack = [[c, r]];
  while (stack.length) {
    const [cc, rr] = stack.pop();
    if (charAt(cc, rr) !== 'K') continue;
    setTile(cc, rr, ' ');
    shards(cc * TS + 24, rr * TS + 24, '#ffd23f', 4);
    stack.push([cc + 1, rr], [cc - 1, rr], [cc, rr + 1], [cc, rr - 1]);
  }
  SFX.door(); floatText(c * TS + 24, r * TS, 'ОТКРЫТО!', '#ffd23f');
}

// ---------- Оружие ----------
function fireWeapon(p) {
  const wi = p.weapon, w = WEAPONS[wi];
  if (ammo[wi] <= 0) { p.weapon = 0; SFX.switchW(); floatText(p.x + p.w / 2, p.y - 10, 'Нет патронов!', '#ff9f9f'); return; }
  aimPlayer(p);
  const m = jimMuzzle(p);
  const f = p.face;
  p.shootCd = w.cd;
  p.anim.shootT = 0.13;
  if (w.pack) ammo[wi]--;
  const base = { kind: w.id, x: m.x, y: m.y, life: 1.25, dmg: 1, r: 8, hit: new Set(), color: w.color, t: 0 };
  switch (w.id) {
    case 'blaster': bullets.push({ ...base, vx: f * 1150, vy: 0 }); SFX.shoot(); break;
    case 'spread':
      for (const a of [-0.2, 0, 0.2]) bullets.push({ ...base, hit: new Set(), vx: f * Math.cos(a) * 1000, vy: Math.sin(a) * 1000, life: 0.6 });
      SFX.spread(); break;
    case 'laser': bullets.push({ ...base, vx: f * 1900, vy: 0, life: 0.55, dmg: 0.6, pierce: true, r: 5 }); SFX.laser(); break;
    case 'rocket': bullets.push({ ...base, vx: f * 420, vy: 0, life: 2, dmg: 3, r: 10, accel: f * 1400 }); SFX.rocket(); p.vx -= f * 120; break;
    case 'freeze': bullets.push({ ...base, vx: f * 820, vy: 0, life: 0.9, dmg: 0, r: 10 }); SFX.freeze(); break;
  }
  sparks(m.x + f * 6, m.y, w.color, 5, 180);
}

function hitLeverBox(box) {
  for (const L of levers) {
    if (L.on) continue;
    const lb = { x: L.x - 14, y: L.y - 14, w: L.w + 28, h: L.h + 28 };
    if (overlap(box, lb)) { L.on = true; L.t = 0; level.active[L.g] = true; SFX.lever(); setTimeout(() => SFX.door(), 200); sparks(L.x + 24, L.y + 24, '#ffe14a', 12); floatText(L.x + 24, L.y - 10, 'ЩЁЛК!', '#ffe14a'); return true; }
  }
  return false;
}
function damageWall(c, r, dmg) {
  const k = r * level.cols + c;
  level.rhp[k] = (level.rhp[k] || 6) - dmg;
  sparks(c * TS + 24, r * TS + 24, '#d8c8b0', 4, 160);
  if (level.rhp[k] <= 0) { setTile(c, r, ' '); shards(c * TS + 24, r * TS + 24, '#8a7a6a', 10); SFX.crumble(); }
}
function explode(x, y, radius, dmg) {
  SFX.boom(); shake = 0.35;
  ring(x, y, '#ffb43a', radius); sparks(x, y, '#ffb43a', 22, 420); puff(x, y, 2.2, 0, 'rgba(90,70,60,0.8)');
  for (const e of enemies) if (!e.dead && !e.hidden && Math.hypot(e.x + e.w / 2 - x, e.y + e.h / 2 - y) < radius + e.w / 2) damageEnemy(e, dmg, x, 'blast');
  if (boss && boss.active && !boss.dead && Math.hypot(boss.x - x, boss.y - boss.h / 2 - y) < radius + boss.w / 2) damageBoss(dmg);
  const c0 = Math.floor((x - radius) / TS), c1 = Math.floor((x + radius) / TS), r0 = Math.floor((y - radius) / TS), r1 = Math.floor((y + radius) / TS);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (charAt(c, r) === 'R') damageWall(c, r, 6);
  hitLeverBox({ x: x - radius / 2, y: y - radius / 2, w: radius, h: radius });
}

function updateBullets(dt) {
  for (const b of bullets) {
    b.t += dt; b.life -= dt;
    if (b.accel) { b.vx += b.accel * dt; b.vx = clamp(b.vx, -1100, 1100); if (Math.random() < 0.6) puff(b.x - Math.sign(b.vx) * 14, b.y, 0.4, -b.vx * 0.1, 'rgba(200,200,200,0.7)'); }
    const steps = Math.ceil(Math.abs(b.vx * dt) / 12) || 1;
    for (let s = 0; s < steps && b.life > 0; s++) {
      b.x += b.vx * dt / steps; b.y += b.vy * dt / steps;
      const c = Math.floor(b.x / TS), r = Math.floor(b.y / TS);
      const t = tileAt(c, r);
      if (t === 1) {
        if (charAt(c, r) === 'R') damageWall(c, r, b.kind === 'rocket' ? 6 : b.kind === 'laser' ? 0.5 : 1);
        if (b.kind === 'rocket') explode(b.x, b.y, 90, 4);
        else sparks(b.x, b.y, b.color, 5, 160);
        b.life = 0; break;
      }
      const box = { x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2 };
      if (hitLeverBox(box) && !b.pierce) { b.life = 0; break; }
      for (const e of enemies) {
        if (e.dead || e.hidden || b.hit.has(e) || !overlap(box, e)) continue;
        b.hit.add(e);
        if (b.kind === 'rocket') { explode(b.x, b.y, 90, 4); b.life = 0; break; }
        if (b.kind === 'freeze') { freezeEnemy(e); b.life = 0; break; }
        damageEnemy(e, b.dmg, b.x - b.vx, 'bullet');
        if (!b.pierce) { b.life = 0; break; }
      }
      if (b.life <= 0) break;
      if (boss && boss.active && !boss.dead && !b.hit.has(boss) && overlap(box, bossBox())) {
        b.hit.add(boss);
        if (b.kind === 'rocket') explode(b.x, b.y, 90, 4);
        else { damageBoss(b.kind === 'freeze' ? 1 : b.dmg); if (b.kind === 'freeze') boss.slow = 1.5; sparks(b.x, b.y, b.color, 6); }
        if (!b.pierce) { b.life = 0; break; }
      }
    }
    if (b.x < camX - 450 || b.x > camX + W + 450) b.life = 0;
  }
  bullets = bullets.filter(b => b.life > 0);

  for (const b of ebullets) {
    b.t += dt; b.life -= dt;
    if (b.g) b.vy += b.g * dt;
    if (b.homing) {
      // плавно доворачивает к Джиму
      const want = Math.atan2(player.y + player.h / 2 - b.y, player.x + player.w / 2 - b.x), cur = Math.atan2(b.vy, b.vx), sp = Math.hypot(b.vx, b.vy);
      let da = want - cur; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      const na = cur + clamp(da, -2.2 * dt, 2.2 * dt);
      b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
    }
    b.x += b.vx * dt; b.y += b.vy * dt;
    const c = Math.floor(b.x / TS), r = Math.floor(b.y / TS);
    if (tileAt(c, r) === 1 || b.y > H + 40) {
      if (b.bomb) { ring(b.x, b.y, '#ff7a3a', 70); sparks(b.x, b.y, '#ff7a3a', 14, 300); SFX.boom(); if (Math.hypot(player.x + player.w / 2 - b.x, player.y + player.h - 20 - b.y) < 80) hurtPlayer(18, b.x); }
      b.life = 0; continue;
    }
    const pb = { x: player.x + 4, y: player.y + 6, w: player.w - 8, h: player.h - 8 };
    if (state === 'play' && overlap({ x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2 }, pb)) { hurtPlayer(b.dmg, b.x); if (!b.flame) b.life = 0; }
  }
  ebullets = ebullets.filter(b => b.life > 0);
}

function meleeHit(box, dmg) {
  hitLeverBox(box);
  for (const e of enemies) if (!e.dead && !e.hidden && overlap(box, e)) damageEnemy(e, dmg, player.x + player.w / 2, 'melee');
  if (boss && boss.active && !boss.dead && overlap(box, bossBox())) damageBoss(dmg);
  const c0 = Math.floor(box.x / TS), c1 = Math.floor((box.x + box.w) / TS), r0 = Math.floor(box.y / TS), r1 = Math.floor((box.y + box.h) / TS);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (charAt(c, r) === 'R') damageWall(c, r, 2);
}

// ---------- Механизмы ----------
function updateMechanics(dt) {
  const p = player;
  // мигающие блоки
  level.phaseT += dt;
  if (level.phaseT > 2.6) {
    level.phaseT = 0; level.phase = !level.phase;
    tone('triangle', level.phase ? 520 : 390, level.phase ? 520 : 390, 0.08, 0.04);
    // игрок внутри появившегося блока — выталкиваем вверх
    if (!boxFree(p.x, p.y, p.w, p.h)) { for (let k = 0; k < 6 && !boxFree(p.x, p.y, p.w, p.h); k++) p.y -= TS; p.vy = -300; }
  }
  // рассыпающиеся блоки
  for (const k in level.crumble) {
    const cr = level.crumble[k];
    if (cr.touched && !cr.gone) { cr.t += dt; if (cr.t > 0.5) { cr.gone = true; cr.t = 0; const c = k % level.cols, r = Math.floor(k / level.cols); shards(c * TS + 24, r * TS + 20, level.theme.plat, 6); invalidateSeg(c); } }
    else if (cr.gone) { cr.t += dt; if (cr.t > 4 && !overlap(p, { x: (k % level.cols) * TS, y: Math.floor(k / level.cols) * TS, w: TS, h: TS })) { cr.gone = false; cr.touched = false; cr.t = 0; invalidateSeg(k % level.cols); } }
  }
  for (const k in level.springT) level.springT[k] = Math.max(0, level.springT[k] - dt);
  // плиты: активны, пока на них кто-то стоит
  const plateGroups = {};
  for (const pl of plates) {
    const zone = { x: pl.x, y: pl.y - 6, w: pl.w, h: pl.h + 6 };
    pl.down = overlap(zone, p) || crates.some(c => overlap(zone, c)) || enemies.some(e => !e.dead && overlap(zone, e));
    if (pl.down) plateGroups[pl.g] = true;
  }
  for (const pl of plates) {
    const prev = level.active[pl.g];
    const now = !!plateGroups[pl.g] || levers.some(L => L.g === pl.g && L.on);
    if (prev !== now) { level.active[pl.g] = now; SFX.door(); }
  }
  for (const L of levers) L.t += dt;
  // движущиеся платформы
  for (const m of movers) {
    m.t += dt * m.speed;
    const k = (1 - Math.cos(m.t)) / 2;
    const nx = m.x0 + (m.x1 - m.x0) * k, ny = m.y0 + (m.y1 - m.y0) * k;
    m.dx = nx - m.x; m.dy = ny - m.y; m.x = nx; m.y = ny;
  }
  // гейзеры
  for (const g of geysers) {
    g.t = (g.t + dt) % 3;
    g.erupt = g.t > 2.3;
    if (g.t > 1.8 && g.t < 2.3 && Math.random() < dt * 14) sparks(g.x + 24, g.bottom - 4, '#ffb42a', 2, 120);
    if (g.erupt) {
      const box = { x: g.x + 6, y: g.bottom - 200, w: TS - 12, h: 200 };
      if (overlap(box, p)) { hurtPlayer(22, g.x + 24); }
      if (Math.random() < dt * 30) particles.push({ kind: 'spark', x: g.x + 24 + rand(-10, 10), y: g.bottom - rand(0, 180), vx: rand(-40, 40), vy: -300, life: 0.4, max: 0.4, size: rand(4, 8), color: Math.random() < 0.5 ? '#ffd23f' : '#ff5a1a' });
    }
  }
  // сосульки
  for (const ic of icicles) {
    if (ic.state === 'hang') { if (Math.abs(p.x + p.w / 2 - (ic.x + 12)) < 70 && p.y > ic.y) { ic.state = 'shake'; ic.t = 0; SFX.crumble(); } }
    else if (ic.state === 'shake') { ic.t += dt; if (ic.t > 0.35) { ic.state = 'fall'; } }
    else if (ic.state === 'fall') {
      ic.vy += GRAVITY * dt; ic.y += ic.vy * dt;
      if (overlap(ic, p)) { hurtPlayer(20, ic.x); ic.state = 'gone'; shards(ic.x + 12, ic.y + 30, '#dff4ff', 8); }
      else if (tileAt(Math.floor((ic.x + 12) / TS), Math.floor((ic.y + ic.h) / TS)) === 1) { ic.state = 'gone'; shards(ic.x + 12, ic.y + ic.h, '#dff4ff', 8); SFX.crumble(); }
    }
  }
  icicles = icicles.filter(i => i.state !== 'gone');
  // прессы
  for (const cr of crushers) {
    cr.t += dt;
    const bottomY = cr.floor - cr.h;
    if (cr.state === 'up') { cr.y = cr.y0; if (cr.t > 1.4) { cr.state = 'warn'; cr.t = 0; } }
    else if (cr.state === 'warn') { if (cr.t > 0.35) { cr.state = 'down'; cr.t = 0; } }
    else if (cr.state === 'down') {
      cr.y = Math.min(bottomY, cr.y + 1500 * dt);
      if (cr.y >= bottomY) { cr.state = 'hold'; cr.t = 0; if (Math.abs(cr.x - camX - W / 2) < W) { SFX.boom(); shake = 0.15; puff(cr.x + 10, cr.floor, 1); puff(cr.x + cr.w - 10, cr.floor, 1); } }
    } else if (cr.state === 'hold') { if (cr.t > 0.5) { cr.state = 'rise'; cr.t = 0; } }
    else if (cr.state === 'rise') { cr.y -= 240 * dt; if (cr.y <= cr.y0) { cr.y = cr.y0; cr.state = 'up'; cr.t = 0; } }
    const box = { x: cr.x + 4, y: 0, w: cr.w - 8, h: cr.y + cr.h };
    if (overlap(box, p) && state === 'play') {
      if (cr.state === 'down' || cr.state === 'hold') { const was = p.inv; hurtPlayer(30, cr.x + cr.w / 2); if (!was) p.vx = (p.x + p.w / 2 < cr.x + cr.w / 2 ? -1 : 1) * 600; }
      // толкает в сторону, чтобы не застрять
      if (p.x + p.w / 2 < cr.x + cr.w / 2) p.x = Math.min(p.x, cr.x - p.w + 2); else p.x = Math.max(p.x, cr.x + cr.w - 2);
    }
  }
  // пузыри
  for (const v of vents) { v.t -= dt; if (v.t <= 0) { v.t = 1.3; bubbles.push({ x: v.x + rand(-8, 8), y: v.bottom - 10, vy: -90, r: rand(14, 18), t: 0 }); } }
  for (const b of bubbles) {
    b.t += dt; b.y += b.vy * dt; b.x += Math.sin(b.t * 4) * 20 * dt;
    if (!b.deco && overlap({ x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2 }, p)) { p.oxygen = Math.min(100, p.oxygen + 30); b.dead = true; SFX.bubble(); floatText(b.x, b.y, '+O₂', '#bff4ff'); }
    if (b.y < 30 || tileAt(Math.floor(b.x / TS), Math.floor((b.y - b.r) / TS)) === 1 || (b.deco && b.t > 1.2)) b.dead = true;
  }
  bubbles = bubbles.filter(b => !b.dead);
  // предметы
  for (const it of items) {
    if (it.taken) continue;
    it.t += dt;
    if (it.drop) { it.vy += 1600 * dt; it.y += it.vy * dt; if (tileAt(Math.floor(it.x / TS), Math.floor((it.y + 16) / TS)) !== 0) { it.y = Math.floor((it.y + 16) / TS) * TS - 16; it.vy = 0; it.drop = false; } if (it.y > H) it.taken = true; }
    const box = { x: it.x - 22, y: it.y - 22, w: 44, h: 44 };
    if (overlap(box, p)) takeItem(it);
  }
  items = items.filter(i => !i.taken);
  // чекпоинты
  for (const cp of checkpoints) if (!cp.on && Math.abs(p.x + p.w / 2 - cp.x) < 40 && Math.abs(p.y + p.h - cp.y) < 100) {
    cp.on = true; level.checkpoint = { x: cp.x - p.w / 2, y: cp.y - STAND_H }; SFX.groovy(); floatText(cp.x, cp.y - 150, 'ЧЕКПОИНТ!', '#7dff3a');
    p.health = Math.max(p.health, 60);
  }
  // друзья
  for (const n of npcs) {
    n.t += dt;
    const near = Math.abs(p.x + p.w / 2 - n.x) < 220;
    if (near) {
      if (!n.talked) { n.talked = true; n.line = 0; n.lineT = 0; SFX.talk(); if (n.gift && !SAVE.weapons[n.gift]) giveWeapon(n.gift); }
      n.lineT += dt;
      if (n.lineT > 4.2) { n.lineT = 0; n.line = (n.line + 1) % n.hints.length; SFX.talk(); }
    }
    n.near = near;
  }
  // выход
  if (exitDoor) {
    exitDoor.t += dt;
    if (exitDoor.open && overlap(p, exitDoor) && state === 'play') completeLevel();
  }
  for (const t of teleports) t.t += dt;
  for (const l of lamps) l.t += dt;
}

function giveWeapon(wi) {
  SAVE.weapons[wi] = true; writeSave();
  ammo[wi] = Math.max(ammo[wi], WEAPONS[wi].start);
  player.weapon = wi; lastWeapon = wi;
  banner = { text: 'НОВОЕ ОРУЖИЕ!', sub: WEAPONS[wi].name + '  •  Q / E — переключить', t: 0, color: WEAPONS[wi].color };
  SFX.weapon();
}

function takeItem(it) {
  const p = player;
  it.taken = true;
  // предмет не исчезает мгновенно: вспухает и тает
  particles.push({ kind: 'pop', item: { kind: it.kind, t: it.t }, x: it.x, y: it.y, vx: 0, vy: -120, life: 0.3, max: 0.3 });
  switch (it.kind) {
    case 'a': {
      let any = false;
      for (let i = 1; i < WEAPONS.length; i++) if (SAVE.weapons[i]) { ammo[i] = Math.min(ammo[i] + WEAPONS[i].pack, WEAPONS[i].start * 3); any = true; }
      score += any ? 50 : 150; SFX.pickup(); floatText(it.x, it.y - 20, any ? 'ПАТРОНЫ' : '+150', '#7ff6ff'); sparks(it.x, it.y, '#7ff6ff', 6);
      break;
    }
    case 'h': p.health = Math.min(100, p.health + 35); SFX.heart(); floatText(it.x, it.y - 20, '+35', '#ff6a9a'); break;
    case 'u': lives++; SFX.life(); floatText(it.x, it.y - 20, '+1 ЖИЗНЬ', '#7dff3a'); score += 500; break;
    case 'o': score += 1000; SFX.cow(); floatText(it.x, it.y - 20, 'МУ-У! +1000', '#fff'); break;
    case 'k': p.keys++; SFX.key(); floatText(it.x, it.y - 20, 'КЛЮЧ!', '#ffd23f'); break;
  }
}

function completeLevel() {
  SFX.win();
  score += 1000 + Math.max(0, Math.floor(300 - levelTime)) * 10;
  lastWeapon = player.weapon;
  if (SAVE.unlocked < curLevel + 1) SAVE.unlocked = Math.min(LEVELS.length - 1, curLevel + 1);
  SAVE.best[curLevel] = Math.max(SAVE.best[curLevel] || 0, score);
  writeSave();
  setState(LEVELS[curLevel].loc === LOCATIONS.length - 1 && LEVELS[curLevel].boss ? 'ending' : 'complete');
}

// ---------- Боссы ----------
function makeBoss(def, cx, bottom, chunk) {
  const b = { def, w: def.w, h: def.h, hp: def.hp, maxHp: def.hp, x: cx, y: bottom, floorY: bottom, chunk, active: false, dead: false, t: 0, state: 'wait',
    atk: 0, atkT: 0, face: -1, vx: 0, vy: 0, flash: 0, slow: 0, sx: cx, mode: def.mode, deadT: 0, sub: 0 };
  resetBoss(b);
  return b;
}
function resetBoss(b) {
  b.hp = b.maxHp; b.x = b.chunk.x + b.chunk.w * 0.7; b.state = b.active ? 'idle' : 'wait'; b.atkT = 1.5; b.vx = 0; b.vy = 0; b.atk = 0;
  b.y = bossRestY(b);
}
function bossRestY(b) {
  if (b.mode === 'fly') return 385;
  if (b.mode === 'swim') return 330;
  if (b.mode === 'ceiling') return 40 + b.h;
  return b.floorY;
}
// Хитбокс босса: x — центр, y — низ
function bossBox() { const b = boss; return { x: b.x - b.w / 2 + 14, y: b.y - b.h + 10, w: b.w - 28, h: b.h - 16 }; }
function damageBoss(d) {
  const b = boss;
  if (b.dead || b.state === 'wait' || b.state === 'intro') return;
  b.hp -= d; b.flash = 0.1; SFX.hit();
  if (b.hp <= 0) {
    b.dead = true; b.deadT = 0; score += 5000;
    SFX.win(); shake = 0.8;
    for (let i = 0; i < 6; i++) setTimeout(() => { if (boss) { explodeFx(boss.x + rand(-80, 80), boss.y - boss.h / 2 + rand(-60, 60)); } }, i * 160);
    if (exitDoor) exitDoor.open = true;
    level.arena = null;
    banner = { text: 'ПОБЕДА!', sub: b.def.name + ' повержен(а)!', t: 0, color: '#b6ff4a' };
    ebullets = [];
    for (const e of enemies) if (e.summoned) damageEnemy(e, 99, e.x, 'blast');
  }
}
function explodeFx(x, y) { SFX.boom(); ring(x, y, '#ffb43a', 80); sparks(x, y, '#ffd23f', 18, 380); puff(x, y, 2, 0, 'rgba(90,70,60,0.8)'); }

function updateBoss(dt) {
  const b = boss;
  if (!b) return;
  b.t += dt; b.flash -= dt;
  if (b.dead) { b.deadT += dt; b.y += 200 * dt * (b.mode === 'fly' ? 1 : 0); return; }
  const p = player;
  const ch = b.chunk;
  if (b.state === 'wait') {
    if (p.x > ch.x + 4 * TS) {
      b.active = true; b.state = 'intro'; b.atkT = 2.2;
      level.arena = { x0: ch.x, x1: ch.x + ch.w };
      banner = { text: b.def.name.toUpperCase(), sub: 'БОСС', t: 0, color: '#ff5a5a' };
      SFX.boss();
    }
    return;
  }
  const slowK = b.slow > 0 ? 0.45 : 1;
  b.slow -= dt;
  const k = (b.hp < b.maxHp / 2 ? 1.35 : 1) * slowK;
  const pcx = p.x + p.w / 2;
  const x0 = ch.x + b.w / 2 + 20, x1 = ch.x + ch.w - b.w / 2 - 20;
  if (b.state === 'intro') { b.atkT -= dt; b.face = Math.sign(pcx - b.x) || -1; idleMove(b, dt, k, pcx, x0, x1); if (b.atkT <= 0) { b.state = 'idle'; b.atkT = 1.2; } }
  else if (b.state === 'idle') {
    b.face = Math.sign(pcx - b.x) || b.face;
    idleMove(b, dt, k, pcx, x0, x1);
    b.atkT -= dt * k;
    if (b.atkT <= 0) {
      const list = b.def.attacks;
      b.cur = list[b.atk % list.length]; b.atk++;
      b.state = 'attack'; b.st = 0; b.sub = 0;
    }
  } else if (b.state === 'attack') {
    b.st += dt * k;
    const done = bossAttack(b, dt * k, pcx, x0, x1);
    if (done) { b.state = 'idle'; b.atkT = rand(0.9, 1.5); }
  }
  // контакт
  if (state === 'play' && overlap(bossBox(), { x: p.x + 6, y: p.y + 8, w: p.w - 12, h: p.h - 10 })) hurtPlayer(20, b.x);
}
function idleMove(b, dt, k, pcx, x0, x1) {
  if (b.mode === 'fly' || b.mode === 'swim') {
    const tx = clamp(pcx + Math.sin(b.t * 0.7) * 260, x0, x1);
    b.x += (tx - b.x) * lerpK(dt, 1.2 * k);
    const ty = bossRestY(b) + Math.sin(b.t * 2) * 40;
    b.y += (ty - b.y) * lerpK(dt, 3);
  } else if (b.mode === 'ceiling') {
    const tx = clamp(pcx, x0, x1);
    b.x += clamp(tx - b.x, -160 * dt * k, 160 * dt * k);
    b.y += (bossRestY(b) - b.y) * lerpK(dt, 4);
  } else if (b.mode === 'ground') {
    const tx = clamp(pcx + (b.x > pcx ? 260 : -260), x0, x1);
    b.x += clamp(tx - b.x, -90 * dt * k, 90 * dt * k);
    b.y = b.floorY;
  } else { b.y = b.floorY; b.x += (x1 - b.x) * lerpK(dt, 2); }
}
function bossShot(b, ang, speed, opts = {}) {
  const sx = b.x + (opts.dx || b.face * b.w * 0.3), sy = b.y - b.h * (opts.hk || 0.55);
  ebullets.push({ x: sx, y: sy, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, life: 4, r: opts.r || 11, dmg: opts.dmg || 15, color: opts.color || '#ff5a5a', g: opts.g || 0, bomb: opts.bomb, t: 0 });
}
function bossAttack(b, dt, pcx, x0, x1) {
  const p = player;
  const py = p.y + p.h / 2;
  switch (b.cur) {
    case 'eggs': {
      idleMove(b, dt, 1.4, pcx, x0, x1);
      if (b.st > 0.35 * (b.sub + 1) && b.sub < 4) {
        b.sub++;
        ebullets.push({ x: b.x, y: b.y - b.h * 0.3, vx: rand(-60, 60), vy: 0, g: 1500, life: 4, r: 13, dmg: 18, color: '#f6ecd0', bomb: true, egg: true, t: 0 });
        tone('triangle', 400, 200, 0.12, 0.06);
      }
      return b.st > 1.9;
    }
    case 'dive': {
      if (b.sub === 0) { b.sub = 1; b.tx = pcx; b.ty = Math.min(p.y + p.h, b.floorY - 10); b.ox = b.x; b.oy = b.y; tone('sawtooth', 900, 200, 0.4, 0.07); }
      const t = b.st;
      if (t < 0.4) { b.y -= 120 * dt; b.flash = Math.sin(t * 60) > 0 ? 0.02 : 0; }
      else if (t < 1.0) { const q = (t - 0.4) / 0.6; b.x = b.ox + (b.tx - b.ox) * q; b.y = b.oy + (b.ty - b.oy) * Math.sin(q * Math.PI / 2); b.face = Math.sign(b.tx - b.ox) || b.face; }
      else if (t < 1.8) { b.y += (bossRestY(b) - b.y) * lerpK(dt, 4); }
      else return true;
      return false;
    }
    case 'jump': {
      if (b.mode !== 'ground') return true;
      if (b.sub === 0) { b.sub = 1; b.vy = -1250; b.jx = clamp(pcx, x0, x1); b.jx0 = b.x; b.air = 0; b.squash = 0.2; }
      if (b.sub === 1) {
        b.air += dt; b.vy += 2300 * dt; b.y += b.vy * dt;
        b.x = b.jx0 + (b.jx - b.jx0) * clamp(b.air / 1.05, 0, 1);
        if (b.y >= b.floorY && b.vy > 0) {
          b.y = b.floorY; b.sub = 2; shake = 0.5; SFX.boom();
          // ударная волна по полу в обе стороны
          for (const d of [-1, 1]) ebullets.push({ x: b.x + d * b.w * 0.4, y: b.floorY - 20, vx: d * 520, vy: 0, life: 2.2, r: 20, dmg: 18, color: '#ffd23f', wave: true, t: 0 });
          puff(b.x - 60, b.floorY, 2); puff(b.x + 60, b.floorY, 2);
        }
        return false;
      }
      return b.st > b.air + 0.6;
    }
    case 'charge': {
      if (b.sub === 0) { b.sub = 1; b.face = Math.sign(pcx - b.x) || b.face; b.cy = b.mode === 'ground' || b.mode === 'static' ? b.floorY : Math.min(b.floorY - 20, p.y + p.h); }
      if (b.st < 0.7) { b.x += Math.sin(b.st * 80) * 2; if (b.mode !== 'ground') b.y += (b.cy - b.y) * lerpK(dt, 5); return false; }
      b.x += b.face * 720 * dt;
      if (Math.random() < dt * 30) puff(b.x - b.face * b.w / 2, b.y - 10, 1);
      if (b.x < x0 || b.x > x1) { b.x = clamp(b.x, x0, x1); shake = 0.4; SFX.boom(); return true; }
      return b.st > 3;
    }
    case 'spread': {
      if (b.st > 0.5 && b.sub === 0) {
        b.sub = 1;
        const a0 = Math.atan2(py - (b.y - b.h * 0.55), pcx - b.x);
        const n = b.hp < b.maxHp / 2 ? 7 : 5;
        for (let i = 0; i < n; i++) bossShot(b, a0 + (i - (n - 1) / 2) * 0.2, 380, { dx: 0, color: b.def.color === '#e8f4ff' ? '#bff4ff' : '#ff5a8a' });
        tone('square', 300, 120, 0.2, 0.08);
      }
      if (b.st > 1.2 && b.sub === 1 && b.hp < b.maxHp / 2) {
        b.sub = 2; const a0 = Math.atan2(py - (b.y - b.h * 0.55), pcx - b.x);
        for (let i = 0; i < 4; i++) bossShot(b, a0 + (i - 1.5) * 0.25, 340, { dx: 0 });
      }
      return b.st > 1.6;
    }
    case 'throw': {
      if (b.st > 0.3 * (b.sub + 1) && b.sub < 3) {
        b.sub++;
        const sx = b.x, sy = b.y - b.h * 0.8;
        const tx = pcx + rand(-120, 120), tFl = 1.0;
        ebullets.push({ x: sx, y: sy, vx: (tx - sx) / tFl, vy: ((p.y + p.h - 20) - sy - 0.5 * 1400 * tFl * tFl) / tFl, g: 1400, life: 4, r: 15, dmg: 16, color: '#b0a080', bomb: true, rock: true, t: 0 });
        tone('triangle', 300, 150, 0.15, 0.06);
      }
      return b.st > 1.6;
    }
    case 'summon': {
      if (b.st > 0.6 && b.sub === 0) {
        b.sub = 1;
        const E = level.loc.enemies;
        const live = enemies.filter(e => e.summoned).length;
        for (let i = 0; i < 2 && live + i < 4; i++) {
          const type = i === 0 ? 'f' : 'e';
          const ex = clamp(b.x + (i ? 120 : -120), b.chunk.x + 80, b.chunk.x + b.chunk.w - 80);
          const e = makeEnemy(type, E[type], ex, type === 'f' ? 300 : b.floorY, false);
          if (type === 'e') e.y = 200;
          e.summoned = true; e.cd = 1;
          enemies.push(e);
          sparks(ex, type === 'f' ? 280 : 300, '#c08aff', 14);
        }
        SFX.teleport();
      }
      return b.st > 1.3;
    }
    case 'laser': {
      // горизонтальный луч на уровне груди — пригнись или подпрыгни!
      const ly = b.floorY - 112;
      if (b.sub === 0) { b.sub = 1; b.face = Math.sign(pcx - b.x) || b.face; b.laserY = ly; tone('sine', 200, 800, 0.9, 0.05); }
      b.laserOn = b.st > 0.9 && b.st < 1.9;
      b.laserWarn = b.st <= 0.9;
      if (b.mode !== 'ground' && b.mode !== 'static') b.y += (b.floorY - 40 - b.y) * lerpK(dt, 4);
      if (b.laserOn) {
        if (b.sub === 1) { b.sub = 2; tone('sawtooth', 120, 90, 1, 0.08); }
        const lx0 = b.face > 0 ? b.x : b.chunk.x, lx1 = b.face > 0 ? b.chunk.x + b.chunk.w : b.x;
        const box = { x: lx0, y: ly - 9, w: lx1 - lx0, h: 18 };
        if (overlap(box, p)) hurtPlayer(22, b.x);
      }
      if (b.st > 1.9) { b.laserOn = false; b.laserWarn = false; return true; }
      return false;
    }
  }
  return true;
}

// ---------- Камера ----------
let camLook = 0;
function updateCamera(dt) {
  const p = player;
  // упреждение по направлению взгляда и скорости меняется плавно — без рывка при развороте
  camLook += (p.face * 90 + clamp(p.vx, -RUN, RUN) * 0.12 - camLook) * lerpK(dt, 2.2);
  let target = p.x + p.w / 2 - W * 0.45 + camLook;
  let lo = 0, hi = level.w - W;
  if (level.arena) { lo = level.arena.x0; hi = Math.max(lo, level.arena.x1 - W); }
  target = clamp(target, lo, hi);
  camX += (target - camX) * lerpK(dt, 5);
  camX = clamp(camX, 0, Math.max(0, level.w - W));
  shake = Math.max(0, shake - dt);
}

function updateWorld(dt) {
  levelTime += dt;
  updateMechanics(dt);
  updatePlayer(dt);
  if (state !== 'play' && state !== 'dead') return;
  updateCrates(dt);
  updateEnemies(dt);
  updateBoss(dt);
  updateBullets(dt);
  updateCamera(dt);
  if (banner) { banner.t += dt; if (banner.t > 3) banner = null; }
  weaponFlash = Math.max(0, weaponFlash - dt * 2);
}
