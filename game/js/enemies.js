/* =========================================================
   ЧЕРВЯК ДЖИМ — враги: создание, урон, поведение (ИИ)
   У каждой локации свои враги со своим поведением (поле ai в data.js),
   а их сила растёт от уровня к уровню (level.def.d от 0 до 1).
   ========================================================= */
'use strict';

function makeEnemy(type, def, cx, bottom, inLiquid) {
  const d = (level.def && level.def.d) || 0;
  const e = { type, def, ai: def.ai || null, w: def.w, h: def.h, x: cx - def.w / 2, y: bottom - def.h, vx: 0, vy: 0,
    hp: Math.round(def.hp * (1 + d)), spd: (def.speed || 0) * (1 + d * 0.3), dmg: Math.round(def.dmg * (1 + d * 0.35)), fireK: 1 - d * 0.3,
    face: -1, t: rand(0, 5), state: 'idle', st: 0, cd: rand(0.5, 2), onGround: false, frozen: 0, flash: 0,
    homeX: cx, homeY: bottom - def.h, inLiquid, dead: false, hidden: false, k: 1 };
  if (type === 'f' || (type === 'j' && level.underwater)) { e.y = bottom - TS / 2 - def.h / 2; e.homeY = e.y; e.fly = true; }
  if ((def.extra && def.extra.fly) || e.ai === 'teleport' || e.ai === 'zap') e.fly = true;
  if (inLiquid) { e.y = bottom; e.homeY = bottom; e.fly = true; e.cd = rand(0.5, 2.5); }
  if (e.ai === 'ambush' || e.ai === 'burrow') e.hidden = true;
  if (e.ai === 'dropper') {
    // висит под потолком, если он есть над головой
    const c = Math.floor(cx / TS);
    for (let r = Math.floor(e.y / TS) - 1; r >= Math.max(0, Math.floor(e.y / TS) - 8); r--) if (tileAt(c, r) === 1) { e.ceil = (r + 1) * TS; e.hang = e.ceil + 30; e.y = e.hang; e.fly = true; break; }
  }
  return e;
}

function freezeEnemy(e) {
  e.frozen = 6; e.vx = 0; e.vy = 0;
  SFX.freeze(); sparks(e.x + e.w / 2, e.y + e.h / 2, '#bff4ff', 14);
  floatText(e.x + e.w / 2, e.y - 6, 'ЗАМОРОЖЕН!', '#bff4ff');
}

// Броня: щит спереди, закрытая жеода, наэлектризованный угорь
function blocksHit(e, fromX, src) {
  if (src === 'blast' || e.frozen > 0) return false;
  const front = (fromX - (e.x + e.w / 2)) * e.face > 0;
  if (e.ai === 'shield' && front && src === 'bullet') return true;
  if (e.ai === 'armorHop' && e.onGround) return true;
  if (e.ai === 'zap' && e.zapT > 0) return true;
  return false;
}

function damageEnemy(e, dmg, fromX, src = 'bullet') {
  if (e.dead || e.hidden) return;
  if (blocksHit(e, fromX, src)) {
    sparks(e.x + e.w / 2 - e.face * 0, e.y + e.h * 0.4, '#ffffff', 6, 220);
    if (!e.dingT || e.dingT < gameTime) { floatText(e.x + e.w / 2, e.y - 10, 'ДЗЫНЬ!', '#d8e8ff'); e.dingT = gameTime + 0.6; }
    tone('triangle', 1800, 1400, 0.06, 0.05);
    return;
  }
  e.hp -= dmg;
  e.flash = 0.12;
  if (e.frozen > 0 && dmg > 0) { e.frozen = 0; shards(e.x + e.w / 2, e.y + e.h / 2, '#bff4ff', 8); }
  SFX.hit();
  if (!e.fly && dmg > 0) e.vx += (e.x + e.w / 2 < fromX ? -1 : 1) * 120;
  if (e.hp > 0) return;
  e.dead = true;
  const pts = 100 + e.def.hp * 25;
  score += pts;
  floatText(e.x + e.w / 2, e.y, '+' + pts);
  if (e.def.draw === 'crow') feathers(e.x + e.w / 2, e.y + e.h / 2, 10);
  sparks(e.x + e.w / 2, e.y + e.h / 2, e.def.c1, 14, 320);
  puff(e.x + e.w / 2, e.y + e.h / 2, 1.6, 0);
  // делится на двух малышей
  if (e.ai === 'split' && !e.small) {
    for (const s of [-1, 1]) {
      const m = makeEnemy(e.type, e.def, e.x + e.w / 2 + s * 16, e.y + e.h, false);
      Object.assign(m, { small: true, k: 0.62, w: Math.round(e.def.w * 0.62), h: Math.round(e.def.h * 0.62), hp: 1, vx: s * 220, vy: -420, face: s, cd: 0.6 });
      m.x = e.x + e.w / 2 + s * 16 - m.w / 2; m.y = e.y + e.h - m.h;
      enemies.push(m);
    }
    return;
  }
  const r = Math.random();
  if (r < 0.22) items.push({ kind: 'a', x: e.x + e.w / 2, y: e.y + e.h / 2, t: 0, vy: -300, drop: true });
  else if (r < 0.3) items.push({ kind: 'h', x: e.x + e.w / 2, y: e.y + e.h / 2, t: 0, vy: -300, drop: true });
}

function enemyShoot(e, kind, angOff = 0) {
  const pd = e.def.proj; if (!pd) return;
  const ex = e.x + e.w / 2, ey = e.y + e.h * 0.4;
  const px = player.x + player.w / 2, py = player.y + player.h * 0.5;
  const dx = px - ex, dy = py - ey;
  const k = kind || pd.kind;
  const b = { x: ex, y: ey, vx: 0, vy: 0, life: 3, r: 8, dmg: e.dmg, color: pd.color, t: 0 };
  if (k === 'bullet') Object.assign(b, { x: ex + e.face * e.w / 2, vx: e.face * pd.speed, r: 7 });
  else if (k === 'aimed') { const a = Math.atan2(dy, dx) + angOff; Object.assign(b, { vx: Math.cos(a) * pd.speed, vy: Math.sin(a) * pd.speed }); }
  else if (k === 'arc') {
    const tFlight = clamp(Math.abs(dx) / pd.speed, 0.5, 1.4) * (1 + angOff);
    Object.assign(b, { y: ey - 10, vx: dx / tFlight, vy: (dy - 0.5 * 1400 * tFlight * tFlight) / tFlight, g: 1400, life: 4, r: 9 });
  }
  ebullets.push(b);
  tone('square', 500, 200, 0.07, 0.04);
  return b;
}
function ringShot(e, n, speed, color) {
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; ebullets.push({ x: e.x + e.w / 2, y: e.y + e.h / 2, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 2.5, r: 7, dmg: e.dmg, color, t: 0 }); }
  tone('square', 700, 300, 0.1, 0.04);
}
function shockwave(x, y, dmg, speed = 360, color = '#ffd23f') {
  for (const d of [-1, 1]) ebullets.push({ x: x + d * 30, y: y - 16, vx: d * speed, vy: 0, life: 0.9, r: 14, dmg, color, wave: true, t: 0 });
  shake = Math.max(shake, 0.25); SFX.boom();
}

// ---------- Базовые движения ----------
function gravityAI(e, dt, keepVx) {
  if (level.underwater) e.vy = Math.min(e.vy + 600 * dt, 220); else e.vy = Math.min(e.vy + GRAVITY * dt, 1200);
  const r = moveBody(e, e.vx * dt, e.vy * dt);
  if (r.hitX && keepVx) { e.state = 'stun'; e.st = 0.9; e.vx = 0; shake = 0.15; SFX.hit(); }
  if (r.landed) { e.vy = 0; e.onGround = true; } else e.onGround = false;
  if (r.ceil) e.vy = 0;
  return r;
}
// впереди обрыв, стена или опасность?
function blockedAhead(e, r) {
  const aheadX = e.face > 0 ? e.x + e.w + 4 : e.x - 4;
  const c = Math.floor(aheadX / TS), rr = Math.floor((e.y + e.h + 4) / TS);
  const groundAhead = tileAt(c, rr) !== 0;
  const hazard = charAt(c, rr - 1) === '^' || charAt(c, rr) === '~' || charAt(c, rr - 1) === '~';
  return (r && r.hitX) || !groundAhead || hazard;
}
function walkAI(e, dt, speed) {
  if (e.face === 0) e.face = -1;
  e.vx = e.face * speed;
  const r = gravityAI(e, dt);
  if (e.onGround && blockedAhead(e, r)) e.face = -e.face;
}
function hopAI(e, dt, dist, toP, high = 1) {
  gravityAI(e, dt);
  if (e.onGround) {
    e.vx *= 0.8; e.cd -= dt;
    if (e.cd <= 0 && dist < 620) { e.vy = -rand(650, 820) * high; e.vx = toP * e.spd * rand(0.9, 1.4); e.face = toP; e.cd = rand(0.9, 1.6) * e.fireK; e.onGround = false; e.squash = 0.2; e.jumped = true; }
  }
  e.squash = Math.max(0, (e.squash || 0) - dt);
}
function chargeAI(e, dt, dist, toP, dy, mult = 3.4) {
  if (e.state === 'charge') { e.vx = e.face * e.spd * mult; e.st -= dt; if (e.st <= 0) { e.state = 'stun'; e.st = 0.8; } if (Math.random() < dt * 20) puff(e.x + e.w / 2 - e.face * e.w / 2, e.y + e.h, 0.6); }
  else if (e.state === 'stun') { e.vx *= 0.85; e.st -= dt; if (e.st <= 0) e.state = 'idle'; }
  else if (e.state === 'wind') { e.vx = 0; e.st -= dt; if (e.st <= 0) { e.state = 'charge'; e.st = 1.1; SFX.boss(); } }
  else { walkAI(e, dt, e.spd); if (dist < 430 && Math.abs(dy) < 120) { e.face = toP; e.state = 'wind'; e.st = 0.55; } }
  if (e.state !== 'idle') gravityAI(e, dt, true);
}
function flyAI(e, dt, dist, pcx, pcy, wide = false) {
  const ecx = e.x + e.w / 2;
  if (e.state === 'swoop') {
    e.x += e.vx * dt; e.y += e.vy * dt;
    e.st -= dt;
    if (e.st <= 0 || e.y > H - 120) e.state = 'return';
  } else if (e.state === 'return') {
    const dx = e.homeX - ecx, dy = e.homeY - e.y;
    const d = Math.hypot(dx, dy);
    if (d < 20) { e.state = 'idle'; e.cd = rand(1.2, 2.2) * e.fireK; }
    else { e.x += dx / d * 220 * dt; e.y += dy / d * 220 * dt; e.face = Math.sign(dx) || e.face; }
  } else {
    // «широкий» полёт — большая восьмёрка
    e.y = e.homeY + Math.sin(e.t * (wide ? 3 : 2.2)) * (wide ? 70 : 26);
    e.x = e.homeX - e.w / 2 + Math.sin(e.t * (wide ? 0.8 : 0.9)) * (wide ? 190 : 50);
    e.face = Math.cos(e.t * 0.9) > 0 ? 1 : -1;
    e.cd -= dt;
    if (e.cd <= 0 && dist < 460) {
      const dx = pcx - ecx, dy = pcy - (e.y + e.h / 2);
      const d = Math.hypot(dx, dy) || 1;
      const sp = Math.max(240, e.spd * 1.3);
      e.vx = dx / d * sp; e.vy = dy / d * sp; e.face = Math.sign(dx) || 1;
      e.state = 'swoop'; e.st = Math.min(1.6, d / sp + 0.25);
      if (e.def.draw === 'crow') tone('sawtooth', 700, 300, 0.2, 0.04);
    }
  }
  // летуны не проходят сквозь стены
  const c = Math.floor((e.x + e.w / 2) / TS), r = Math.floor((e.y + e.h / 2) / TS);
  if (tileAt(c, r) === 1 && e.state === 'swoop') e.state = 'return';
}
// плавное преследование (сквозь стены не летает — скользит вдоль)
function chaseAI(e, dt, pcx, pcy, speed, range = 700) {
  const ecx = e.x + e.w / 2, ecy = e.y + e.h / 2;
  let tx = pcx, ty = pcy - 20;
  if (Math.hypot(pcx - ecx, pcy - ecy) > range) { tx = e.homeX; ty = e.homeY + e.h / 2; }
  const dx = tx - ecx, dy = ty - ecy + Math.sin(e.t * 4) * 30, d = Math.hypot(dx, dy) || 1;
  e.vx += (dx / d * speed - e.vx) * Math.min(1, dt * 2.5);
  e.vy += (dy / d * speed - e.vy) * Math.min(1, dt * 2.5);
  const nx = e.x + e.vx * dt, ny = e.y + e.vy * dt;
  if (boxFree(nx, e.y, e.w, e.h)) e.x = nx; else e.vx *= -0.3;
  if (boxFree(e.x, ny, e.w, e.h)) e.y = ny; else e.vy *= -0.3;
  if (Math.abs(dx) > 4) e.face = Math.sign(dx);
}

// ---------- Особое поведение ----------
// Каждая функция: (e, dt, o) где o = { dist, toP, dy, pcx, pcy }
const AI = {
  // бросается вперёд, увидев Джима
  dash(e, dt, o, dur = 0.6, mult = 4) {
    if (e.state === 'dash') {
      e.st -= dt; e.vx = e.face * e.spd * mult;
      const r = gravityAI(e, dt);
      if (Math.random() < dt * 30) puff(e.x + e.w / 2 - e.face * e.w / 2, e.y + e.h - 4, 0.5);
      if (e.st <= 0 || (e.onGround && blockedAhead(e, r))) { e.state = 'idle'; e.cd = 1.4 * e.fireK; }
      return;
    }
    walkAI(e, dt, e.spd); e.cd -= dt;
    if (e.cd <= 0 && o.dist < 400 && Math.abs(o.dy) < 90 && e.face === o.toP) { e.state = 'dash'; e.st = dur; tone('sawtooth', 400, 900, 0.12, 0.04); }
  },
  slide(e, dt, o) { AI.dash(e, dt, o, 1.1, 4.5); },
  // катится к Джиму, отскакивая от стен
  roll(e, dt, o) {
    e.vx += (o.toP * e.spd - e.vx) * Math.min(1, dt * (o.dist < 600 ? 1.5 : 0.3));
    const r = gravityAI(e, dt);
    if (r.hitX) { e.vx = -e.vx * 0.6; e.vy = -300; }
    e.face = Math.sign(e.vx) || e.face;
  },
  // снежный ком растёт, пока катится
  grow(e, dt, o) {
    AI.roll(e, dt, o);
    if (o.dist < 700 && e.k < 1.7) {
      const b = e.y + e.h, cx = e.x + e.w / 2;
      e.k = Math.min(1.7, e.k + dt * 0.12);
      const nw = e.def.w * e.k, nh = e.def.h * e.k;
      if (boxFree(cx - nw / 2, b - nh, nw, nh)) { e.w = nw; e.h = nh; e.x = cx - nw / 2; e.y = b - nh; }
    }
  },
  // летит над Джимом и сбрасывает бомбы
  bomber(e, dt, o) {
    const ecx = e.x + e.w / 2;
    const tx = o.dist < 650 ? o.pcx : e.homeX;
    e.vx += (clamp(tx - ecx, -1, 1) * e.spd - e.vx) * Math.min(1, dt * 2);
    const nx = e.x + e.vx * dt;
    if (boxFree(nx, e.y, e.w, e.h)) e.x = nx;
    e.y = e.homeY + Math.sin(e.t * 3) * 12;
    e.face = Math.sign(e.vx) || e.face;
    e.cd -= dt;
    if (e.cd <= 0 && Math.abs(o.pcx - ecx) < 40 && o.pcy > e.y) {
      ebullets.push({ x: ecx, y: e.y + e.h, vx: e.vx * 0.3, vy: 60, g: 1300, life: 3, r: 10, dmg: e.dmg, color: '#3a3a3a', bomb: true, t: 0 });
      e.cd = 1.5 * e.fireK; tone('sine', 900, 300, 0.25, 0.04);
    }
  },
  sine(e, dt, o) { flyAI(e, dt, o.dist, o.pcx, o.pcy, true); },
  // останавливается и швыряет снаряды
  thrower(e, dt, o) {
    if (e.state === 'throw') { e.vx = 0; gravityAI(e, dt); e.st -= dt; if (e.st <= 0) { enemyShoot(e); e.state = 'idle'; e.cd = 2.2 * e.fireK; e.recoil = 0.3; } return; }
    walkAI(e, dt, e.spd); e.cd -= dt;
    if (e.cd <= 0 && o.dist < 620 && Math.abs(o.dy) < 300) { e.face = o.toP; e.state = 'throw'; e.st = 0.45; }
    e.recoil = Math.max(0, (e.recoil || 0) - dt);
  },
  split(e, dt, o) { if (e.type === 'j') hopAI(e, dt, o.dist, o.toP); else walkAI(e, dt, e.spd * (e.small ? 1.6 : 1)); },
  // летает и стреляет прицельно
  shootFly(e, dt, o) {
    flyAI(e, dt, o.dist, o.pcx, o.pcy);
    e.fcd = (e.fcd ?? rand(1, 2)) - dt;
    if (e.fcd <= 0 && e.state === 'idle' && o.dist < 600) { enemyShoot(e, 'aimed'); e.fcd = 2.4 * e.fireK; }
  },
  // очередь из трёх выстрелов
  burst(e, dt, o) {
    e.face = o.toP; gravityAI(e, dt);
    e.cd -= dt;
    if (e.burst > 0) { e.bt -= dt; if (e.bt <= 0) { enemyShoot(e, null, e.def.proj.kind === 'arc' ? (3 - e.burst) * 0.18 : 0); e.burst--; e.bt = 0.2; e.recoil = 0.15; } }
    else if (e.cd <= 0 && o.dist < 760 && Math.abs(o.dy) < 380) { e.burst = 3; e.bt = 0; e.cd = 2.8 * e.fireK; }
    e.recoil = Math.max(0, (e.recoil || 0) - dt);
  },
  // таран, оставляющий огненный след
  fireCharge(e, dt, o) {
    chargeAI(e, dt, o.dist, o.toP, o.dy, 3);
    if (e.state === 'charge') { e.trail = (e.trail || 0) - dt; if (e.trail <= 0) { e.trail = 0.09; ebullets.push({ x: e.x + e.w / 2 - e.face * e.w * 0.4, y: e.y + e.h - 12, vx: 0, vy: 0, life: 1.4, r: 12, dmg: Math.round(e.dmg * 0.6), color: '#ff8a1a', flame: true, t: 0 }); } }
  },
  // щит спереди: поворачивается к Джиму с задержкой — зайди со спины или бей хлыстом
  shield(e, dt, o) {
    if (e.type === 'z') { chargeAI(e, dt, o.dist, o.toP, o.dy, 2.6); return; }
    e.turnT = (e.turnT || 0) - dt;
    if (o.dist < 360 && e.turnT <= 0 && e.face !== o.toP) { e.face = o.toP; e.turnT = 1.1; }
    walkAI(e, dt, o.dist < 360 ? e.spd * 0.5 : e.spd);
  },
  chase(e, dt, o) { chaseAI(e, dt, o.pcx, o.pcy, e.spd); },
  // кольцо иголок во все стороны
  ring(e, dt, o) {
    gravityAI(e, dt); e.face = o.toP; e.cd -= dt;
    if (e.cd <= 0 && o.dist < 600) { ringShot(e, 8, e.def.proj.speed, e.def.proj.color); e.cd = 2.8 * e.fireK; e.recoil = 0.3; }
    e.recoil = Math.max(0, (e.recoil || 0) - dt);
  },
  drift(e, dt, o) { chaseAI(e, dt, o.pcx, o.pcy, 55 + Math.max(0, Math.sin(e.t * 2)) * e.spd, 500); },
  // прячется и выскакивает, когда Джим рядом
  ambush(e, dt, o) {
    if (e.hidden) {
      gravityAI(e, dt);
      if (o.dist < 170 && Math.abs(o.dy) < 160) { e.hidden = false; e.vy = -560; e.onGround = false; e.face = o.toP; SFX.whip(); puff(e.x + e.w / 2, e.y + e.h, 1.2); }
      return;
    }
    if (e.type === 'j') hopAI(e, dt, o.dist, o.toP, 1.1); else walkAI(e, dt, e.spd * 1.3);
  },
  // роет землю, подползает под Джима и выныривает
  burrow(e, dt, o) {
    e.st -= dt;
    if (e.hidden) {
      e.vx = o.toP * e.spd * 1.4; gravityAI(e, dt);
      if (Math.random() < dt * 14) puff(e.x + e.w / 2, e.y + e.h - 2, 0.55, 0, 'rgba(160,110,90,0.8)');
      if ((e.st <= 0 && o.dist < 500) || o.dist < 40) { e.hidden = false; e.st = 2.2; e.vy = -620; SFX.crumble(); shards(e.x + e.w / 2, e.y + e.h, '#a07060', 8); }
      return;
    }
    walkAI(e, dt, e.spd);
    if (e.st <= 0 && e.onGround) { e.hidden = true; e.st = 2.5; SFX.crumble(); }
  },
  // шагает, останавливается и стреляет
  shooterWalk(e, dt, o) {
    if (e.state === 'aim') { e.vx = 0; gravityAI(e, dt); e.st -= dt; if (e.st <= 0) { enemyShoot(e, 'bullet'); e.state = 'idle'; e.cd = 2 * e.fireK; e.recoil = 0.2; } return; }
    walkAI(e, dt, e.spd); e.cd -= dt;
    if (e.cd <= 0 && o.dist < 600 && Math.abs(o.dy) < 100 && e.face === o.toP) { e.state = 'aim'; e.st = 0.5; }
    e.recoil = Math.max(0, (e.recoil || 0) - dt);
  },
  // зависает над Джимом и бьёт лазером вниз
  laserFly(e, dt, o) {
    const ecx = e.x + e.w / 2;
    if (e.state === 'warn' || e.state === 'beam') {
      e.st -= dt;
      if (e.state === 'warn' && e.st <= 0) { e.state = 'beam'; e.st = 0.45; tone('sawtooth', 1600, 400, 0.4, 0.05); }
      else if (e.state === 'beam') {
        if (state === 'play' && Math.abs(o.pcx - ecx) < 22 + player.w / 2 && o.pcy > e.y) hurtPlayer(e.dmg, ecx);
        if (e.st <= 0) { e.state = 'idle'; e.cd = 2.6 * e.fireK; }
      }
      return;
    }
    const tx = o.dist < 650 ? o.pcx : e.homeX;
    e.vx += (clamp(tx - ecx, -1, 1) * e.spd - e.vx) * Math.min(1, dt * 2);
    const nx = e.x + e.vx * dt; if (boxFree(nx, e.y, e.w, e.h)) e.x = nx;
    e.y = e.homeY + Math.sin(e.t * 2.5) * 10;
    e.face = Math.sign(e.vx) || e.face;
    e.cd -= dt;
    if (e.cd <= 0 && Math.abs(o.pcx - ecx) < 60 && o.pcy > e.y) { e.state = 'warn'; e.st = 0.7; tone('square', 1200, 1200, 0.1, 0.04); }
  },
  // высокий прыжок, при приземлении — ударная волна
  stomp(e, dt, o) {
    const was = e.onGround;
    hopAI(e, dt, o.dist, o.toP, 1.3);
    if (!was && e.onGround && e.jumped) { e.jumped = false; shockwave(e.x + e.w / 2, e.y + e.h, Math.round(e.dmg * 0.8), 320, '#ffcc33'); }
  },
  // висит под потолком и падает на Джима
  dropper(e, dt, o) {
    if (e.hang !== undefined) {
      e.y = e.hang + Math.sin(e.t * 2) * 6;
      if (Math.abs(o.pcx - (e.x + e.w / 2)) < 70 && o.pcy > e.y) { e.hang = undefined; e.fly = false; e.vy = 200; tone('sawtooth', 900, 200, 0.2, 0.04); }
      return;
    }
    walkAI(e, dt, e.spd);
    e.cd -= dt;
    if (e.onGround && e.cd <= 0 && o.dist < 220) { e.vy = -600; e.vx = o.toP * e.spd * 2; e.face = o.toP; e.cd = 1.8; }
  },
  // моль исчезает и появляется рядом с Джимом
  blinkFly(e, dt, o) {
    e.bl = (e.bl ?? rand(2, 3.5)) - dt;
    if (e.bl < 0.35 && e.bl > 0) { e.fade = e.bl / 0.35; return; }
    if (e.bl <= 0 && o.dist < 700) {
      const nx = o.pcx + rand(-220, 220), ny = clamp(o.pcy - rand(120, 220), 40, H - 200);
      if (boxFree(nx - e.w / 2, ny, e.w, e.h)) { e.homeX = nx; e.homeY = ny; e.x = nx - e.w / 2; e.y = ny; e.state = 'idle'; sparks(nx, ny + e.h / 2, e.def.c2, 10); }
      e.bl = rand(2.8, 3.8) * e.fireK;
    }
    e.fade = 1;
    flyAI(e, dt, o.dist, o.pcx, o.pcy);
  },
  // веер из трёх выстрелов
  fan(e, dt, o) {
    e.face = o.toP; gravityAI(e, dt); e.cd -= dt;
    if (e.cd <= 0 && o.dist < 700) { for (const a of [-0.28, 0, 0.28]) enemyShoot(e, 'aimed', a); e.cd = 2.5 * e.fireK; e.recoil = 0.25; }
    e.recoil = Math.max(0, (e.recoil || 0) - dt);
  },
  armorHop(e, dt, o) { hopAI(e, dt, o.dist, o.toP, 1.05); },
  // выпад копьём
  lunge(e, dt, o) {
    if (e.state === 'wind') { e.vx = 0; gravityAI(e, dt); e.st -= dt; if (e.st <= 0) { e.state = 'lunge'; e.st = 0.35; SFX.whip(); } return; }
    if (e.state === 'lunge') { e.vx = e.face * 900; const r = gravityAI(e, dt); e.st -= dt; if (e.st <= 0 || r.hitX || blockedAhead(e, r)) { e.state = 'idle'; e.cd = 1.3 * e.fireK; e.vx = 0; } return; }
    walkAI(e, dt, e.spd); e.cd -= dt;
    if (e.cd <= 0 && o.dist < 280 && Math.abs(o.dy) < 110) { e.face = o.toP; e.state = 'wind'; e.st = 0.42; }
  },
  // тень плывёт к Джиму и телепортируется ему за спину
  teleport(e, dt, o) {
    e.bl = (e.bl ?? rand(3, 4.5)) - dt;
    if (e.bl < 0.4 && e.bl > 0) { e.fade = e.bl / 0.4; return; }
    if (e.bl <= 0) {
      const nx = o.pcx - player.face * 200;
      if (o.dist < 700 && boxFree(nx - e.w / 2, player.y + player.h - e.h, e.w, e.h)) { e.x = nx - e.w / 2; e.y = player.y + player.h - e.h; sparks(nx, e.y + e.h / 2, e.def.c2, 12); }
      e.bl = rand(3.5, 4.5) * e.fireK;
    }
    e.fade = Math.min(1, (e.fade || 0) + dt * 3);
    chaseAI(e, dt, o.pcx, o.pcy + 20, e.spd, 650);
  },
  // самонаводящиеся сферы
  homing(e, dt, o) {
    gravityAI(e, dt); e.face = o.toP; e.cd -= dt;
    if (e.cd <= 0 && o.dist < 700) { const b = enemyShoot(e, 'aimed'); if (b) { b.homing = true; b.life = 4.5; b.r = 10; } e.cd = 3 * e.fireK; e.recoil = 0.3; }
    e.recoil = Math.max(0, (e.recoil || 0) - dt);
  },
  // горилла бьёт себя в грудь, прыгает и сотрясает землю
  pound(e, dt, o) {
    if (e.state === 'beat') { e.vx = 0; gravityAI(e, dt); e.st -= dt; if (e.st <= 0) { e.state = 'air'; e.vy = -950; e.vx = clamp((o.pcx - e.x - e.w / 2) / 0.8, -520, 520); e.onGround = false; e.face = o.toP; } return; }
    if (e.state === 'air') { gravityAI(e, dt); if (e.onGround) { e.state = 'idle'; e.cd = 2.2 * e.fireK; shockwave(e.x + e.w / 2, e.y + e.h, e.dmg, 420, '#ff5a5a'); } return; }
    walkAI(e, dt, e.spd); e.cd -= dt;
    if (e.cd <= 0 && o.dist < 380 && Math.abs(o.dy) < 200) { e.state = 'beat'; e.st = 0.7; e.face = o.toP; SFX.boss(); }
  },
  // пёс бежит к Джиму и прыгает на него
  leap(e, dt, o) {
    if (!e.onGround && e.state === 'leap') { gravityAI(e, dt); if (e.onGround) { e.state = 'idle'; e.cd = 1.2 * e.fireK; } return; }
    const near = o.dist < 520 && Math.abs(o.dy) < 200;
    if (near) e.face = o.toP;
    walkAI(e, dt, near ? e.spd * 2.2 : e.spd);
    e.cd -= dt;
    if (near && e.onGround && e.cd <= 0 && o.dist < 230) { e.state = 'leap'; e.vy = -680; e.vx = e.face * e.spd * 3; e.onGround = false; tone('sawtooth', 300, 700, 0.15, 0.05); }
  },
  // угорь искрит: в это время неуязвим и бьёт током сильнее
  zap(e, dt, o) {
    e.zapT = Math.max(0, (e.zapT || 0) - dt);
    e.cd -= dt;
    if (e.cd <= 0 && o.dist < 500) { e.zapT = 1.2; e.cd = 3.2 * e.fireK; tone('sawtooth', 2400, 600, 0.3, 0.05); }
    if (e.zapT > 0 && state === 'play' && Math.hypot(o.pcx - e.x - e.w / 2, o.pcy - e.y - e.h / 2) < 120) hurtPlayer(e.dmg, e.x + e.w / 2);
    chaseAI(e, dt, o.pcx, o.pcy, e.zapT > 0 ? 40 : e.spd, 600);
  },
};

// Поведение по умолчанию — по букве врага в карте
function defaultAI(e, dt, o) {
  if (e.type === 'e') walkAI(e, dt, e.spd);
  else if (e.type === 'f' || (e.type === 'j' && level.underwater)) flyAI(e, dt, o.dist, o.pcx, o.pcy);
  else if (e.type === 'g') {
    e.face = o.toP; gravityAI(e, dt); e.cd -= dt;
    if (e.cd <= 0 && o.dist < 760 && Math.abs(o.dy) < 380) { enemyShoot(e); e.cd = (e.def.proj && e.def.proj.kind === 'bullet' ? 1.7 : 2.1) * e.fireK; e.recoil = 0.2; }
    e.recoil = Math.max(0, (e.recoil || 0) - dt);
  } else if (e.type === 'j') hopAI(e, dt, o.dist, o.toP);
  else if (e.type === 'z') chargeAI(e, dt, o.dist, o.toP, o.dy);
}

function updateEnemies(dt) {
  const p = player;
  const pcx = p.x + p.w / 2, pcy = p.y + p.h / 2;
  for (const e of enemies) {
    if (e.dead) continue;
    e.t += dt; e.flash -= dt;
    const ecx = e.x + e.w / 2, ecy = e.y + e.h / 2;
    const dist = Math.abs(pcx - ecx);
    if (dist > W * 1.2) continue; // далеко — спит
    if (e.frozen > 0) {
      e.frozen -= dt;
      if (!e.fly || e.inLiquid) { e.vy = Math.min(e.vy + GRAVITY * dt, 1000); const r = moveBody(e, 0, e.vy * dt); if (r.landed) e.vy = 0; }
      if (e.frozen <= 0) { shards(ecx, ecy, '#bff4ff', 8); SFX.crumble(); }
      if (e.y > H + 50) e.dead = true;
      continue;
    }
    const o = { dist, toP: Math.sign(pcx - ecx) || 1, dy: pcy - ecy, pcx, pcy };
    if (e.inLiquid) {
      // выпрыгивает из лавы/кислоты
      if (e.state === 'idle') { e.cd -= dt; e.y = e.homeY + 30; if (e.cd <= 0 && dist < 500) { e.state = 'jump'; e.vy = -1050; SFX.splash(); sparks(ecx, e.homeY, level.theme.liquid[0], 10); } }
      else { e.vy += GRAVITY * 0.9 * dt; e.y += e.vy * dt; e.face = e.vy < 0 ? o.toP : e.face; if (e.y > e.homeY + 30) { e.state = 'idle'; e.cd = rand(1.2, 2.4) * e.fireK; SFX.splash(); } }
    } else (AI[e.ai] || defaultAI)(e, dt, o);
    // касание игрока
    if (!e.hidden && state === 'play' && overlap({ x: e.x + 6, y: e.y + 6, w: e.w - 12, h: e.h - 10 }, p)) hurtPlayer(e.dmg, e.x + e.w / 2);
    if (e.y > H + 60) e.dead = true;
  }
  enemies = enemies.filter(e => !e.dead);
}
