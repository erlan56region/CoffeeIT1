/* =========================================================
   ЧЕРВЯК ДЖИМ — Космическое спасение (2D платформер)
   Чистый JavaScript + Canvas, без зависимостей.
   ========================================================= */
(() => {
'use strict';

const W = 1280, H = 720;

// Полифилл roundRect для старых браузеров (Safari < 16, старые Chrome)
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    r = Math.min(typeof r === 'number' ? r : 0, w / 2, h / 2);
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
  };
}
const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d');

// ---------- Константы физики ----------
const GRAVITY = 2300, JUMP_V = 930, RUN = 400, GLIDE_FALL = 150;
const GROUND_Y = 600, WORLD_W = 9300;
const JIM_H = 160;

// ---------- Загрузка ассетов ----------
const IMG = {};
const RIG = window.RIG || null;     // данные скелетов (assets/rig/rig.js)
const assetList = ['jim.png', 'princess.png', 'crow.png', 'cow.png', 'bg.jpg']
  .concat(RIG ? Object.keys(RIG).flatMap(n => Object.keys(RIG[n].parts).map(p => `rig/${n}_${p}.png`)) : []);
function loadAssets() {
  return Promise.all(assetList.map(f => new Promise(res => {
    const i = new Image();
    i.onload = () => res();
    i.onerror = () => res();
    i.src = 'assets/' + f;
    IMG[f.split('/').pop().split('.')[0]] = i;
  })));
}

// ---------- Звук (WebAudio, синтез) ----------
let actx = null;
function initAudio() {
  if (actx) return;
  try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
}
function tone(type, f0, f1, dur, vol = 0.15, delay = 0) {
  if (!actx) return;
  const t = actx.currentTime + delay;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(actx.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
const SFX = {
  shoot: () => tone('square', 1200, 300, 0.09, 0.07),
  jump: () => tone('sine', 280, 640, 0.16, 0.12),
  whip: () => { tone('sawtooth', 900, 120, 0.12, 0.06); },
  hit: () => tone('sawtooth', 300, 60, 0.15, 0.12),
  hurt: () => { tone('square', 200, 80, 0.3, 0.12); },
  pickup: () => { tone('triangle', 660, 1320, 0.12, 0.12); },
  heart: () => { tone('triangle', 520, 1040, 0.1, 0.12); tone('triangle', 780, 1560, 0.12, 0.1, 0.08); },
  cow: () => { tone('sawtooth', 190, 110, 0.55, 0.12); tone('sawtooth', 140, 90, 0.5, 0.07, 0.05); },
  groovy: () => [523, 659, 784, 1046].forEach((f, i) => tone('square', f, f, 0.12, 0.07, i * 0.09)),
  boss: () => tone('sawtooth', 90, 40, 0.6, 0.15),
  win: () => [523, 659, 784, 659, 784, 1046].forEach((f, i) => tone('triangle', f, f * 1.01, 0.2, 0.12, i * 0.14)),
  die: () => [400, 300, 200, 100].forEach((f, i) => tone('square', f, f * 0.9, 0.18, 0.1, i * 0.15)),
};

// ---------- Ввод ----------
const keys = {}, pressed = {};
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'jump', KeyW: 'jump', Space: 'jump',
  KeyX: 'shoot', KeyJ: 'shoot', KeyZ: 'whip', KeyK: 'whip',
  Enter: 'start', KeyP: 'pause', Escape: 'pause', KeyM: 'mute',
};
function setKey(k, down) {
  if (down && !keys[k]) pressed[k] = true;
  keys[k] = down;
}
addEventListener('keydown', e => {
  const k = KEYMAP[e.code];
  if (k) { e.preventDefault(); initAudio(); setKey(k, true); }
});
addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) setKey(k, false); });

// Сенсорное управление
if ('ontouchstart' in window || navigator.maxTouchPoints > 0) document.body.classList.add('is-touch');
document.querySelectorAll('#touch button').forEach(b => {
  const k = b.dataset.key;
  const down = e => { e.preventDefault(); initAudio(); setKey(k, true); b.classList.add('active'); };
  const up = e => { e.preventDefault(); setKey(k, false); b.classList.remove('active'); };
  b.addEventListener('pointerdown', down);
  b.addEventListener('pointerup', up);
  b.addEventListener('pointercancel', up);
  b.addEventListener('pointerleave', up);
});
cvs.addEventListener('pointerdown', () => { initAudio(); pressed.start = true; });

// ---------- Утилиты ----------
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
function seeded(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function outlinedText(txt, x, y, size, fill = '#fff', align = 'center', stroke = '#111', font = 'Bangers') {
  ctx.font = `${size}px ${font}, Rubik, Impact, Arial Black, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(4, size / 7);
  ctx.strokeStyle = stroke;
  ctx.strokeText(txt, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(txt, x, y);
}

// ---------- Отрисовка камней-платформ (заранее в offscreen canvas) ----------
function makeRock(w, h, floating, seed) {
  const r = seeded(seed);
  const hang = floating ? 46 : 0;
  const c = document.createElement('canvas');
  c.width = w + 16; c.height = h + hang + 24;
  const g = c.getContext('2d');
  g.translate(8, 14);
  // Форма камня
  g.beginPath();
  g.moveTo(0, 6);
  if (floating) {
    const steps = Math.max(3, Math.floor(w / 40));
    g.lineTo(-4, h * 0.6);
    for (let i = 0; i <= steps; i++) {
      const px = w - (i / steps) * w;
      const mid = Math.sin((i / steps) * Math.PI);
      g.lineTo(px, h + mid * hang * (0.6 + r() * 0.4) + (i % 2 ? 8 : -4));
    }
    g.lineTo(-4, h * 0.6);
  } else {
    g.lineTo(-3, h * 0.3);
    g.lineTo(2, h * 0.6);
    g.lineTo(-2, h + 10);
    g.lineTo(w + 2, h + 10);
    g.lineTo(w - 2, h * 0.55);
    g.lineTo(w + 3, h * 0.25);
  }
  g.lineTo(w, 6);
  g.closePath();
  const grd = g.createLinearGradient(0, 0, 0, h + hang);
  grd.addColorStop(0, '#7a5c8f');
  grd.addColorStop(0.5, '#4b3563');
  grd.addColorStop(1, '#241638');
  g.fillStyle = grd;
  g.fill();
  g.lineWidth = 4; g.strokeStyle = '#120a1e'; g.stroke();
  // Кратеры
  g.save(); g.clip();
  const craters = Math.floor(w / 70) + (floating ? 1 : Math.floor(h / 90));
  for (let i = 0; i < craters; i++) {
    const cx = r() * w, cy = 26 + r() * (h + hang * 0.4 - 26), cr = 6 + r() * 14;
    g.beginPath(); g.ellipse(cx, cy, cr, cr * 0.7, 0, 0, Math.PI * 2);
    g.fillStyle = 'rgba(20,10,35,0.45)'; g.fill();
    g.beginPath(); g.ellipse(cx - 2, cy - 2, cr * 0.7, cr * 0.45, 0, Math.PI, Math.PI * 2);
    g.strokeStyle = 'rgba(190,160,220,0.35)'; g.lineWidth = 2; g.stroke();
  }
  // Блики
  g.fillStyle = 'rgba(255,255,255,0.08)';
  g.fillRect(0, 10, w, 10);
  g.restore();
  // Слизь / мох сверху (в духе Джима)
  g.beginPath();
  g.moveTo(-2, 14);
  g.lineTo(-2, 0);
  for (let x = 0; x <= w; x += 12) g.lineTo(x, -3 - r() * 5);
  g.lineTo(w + 2, 0);
  g.lineTo(w + 2, 12);
  for (let x = w; x >= 0; x -= 18) {
    const drip = r() < 0.25 ? 10 + r() * 16 : 4 + r() * 6;
    g.lineTo(x, 10 + drip);
    g.lineTo(x - 9, 12);
  }
  g.closePath();
  const sg = g.createLinearGradient(0, -6, 0, 26);
  sg.addColorStop(0, '#b6ff4a'); sg.addColorStop(1, '#3fae2a');
  g.fillStyle = sg; g.fill();
  g.lineWidth = 3; g.strokeStyle = '#0f2a0a'; g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.45)';
  for (let x = 10; x < w; x += 46 + r() * 30) { g.beginPath(); g.ellipse(x, 2, 8, 2.5, 0, 0, Math.PI * 2); g.fill(); }
  return c;
}

// ---------- Уровень ----------
function buildLevel() {
  const plats = [];
  let seed = 7;
  const G = (x, w) => plats.push({ x, y: GROUND_Y, w, h: H - GROUND_Y + 20, ground: true, seed: seed++ });
  const P = (x, y, w) => plats.push({ x, y, w, h: 30, seed: seed++ });
  const M = (x, y, w, range, speed = 1) => plats.push({ x, y, w, h: 30, ox: x, range, speed, phase: rand(0, 6), seed: seed++ });

  G(0, 1400); G(1620, 980); G(2860, 480); G(3560, 1240); G(5060, 540); G(5920, 1080); G(7260, 2040);

  P(480, 460, 200); P(840, 350, 180); P(1160, 450, 160); P(1440, 480, 140);
  P(1900, 440, 200); P(2250, 330, 200); M(2620, 480, 150, 50, 1.2);
  P(3000, 420, 180); P(3300, 320, 160); M(3360, 490, 140, 70, 1);
  P(3800, 450, 200); P(4150, 340, 220); P(4500, 240, 180); M(4840, 470, 150, 70, 1.1);
  P(5300, 430, 180); M(5660, 480, 160, 110, 0.9);
  P(6100, 420, 200); P(6450, 320, 200); P(6800, 420, 180); M(7040, 480, 150, 80, 1.2);
  P(7600, 440, 200); P(7950, 340, 180);
  // Арена босса
  P(8250, 440, 170); P(8800, 440, 170);

  plats.forEach(p => { p.img = makeRock(p.w, p.h, !p.ground, p.seed); p.dx = 0; });

  const crows = [
    [1000, 280], [1850, 240], [2350, 200], [3100, 250], [3950, 290], [4350, 190],
    [4700, 140], [5450, 270], [6250, 240], [6650, 190], [7050, 300], [7500, 250],
  ].map(([x, y]) => ({ x, y, bx: x, by: y, w: 90, h: 52, hp: 2, t: rand(0, 6), state: 'patrol', st: 0, vx: 0, vy: 0, flash: 0, face: -1, dead: false }));

  const items = [];
  plats.filter(p => !p.ground).forEach((p, i) => {
    items.push({ type: i % 5 === 3 ? 'heart' : 'atom', x: p.x + p.w / 2, y: p.y - 50, t: rand(0, 6) });
  });
  [300, 700, 2000, 2400, 3700, 4000, 6000, 6300, 7400, 7700].forEach(x => items.push({ type: 'atom', x, y: GROUND_Y - 50, t: rand(0, 6) }));

  const cows = [[1250, 230], [4580, 120], [6520, 190], [8000, 210]].map(([x, y]) => ({ x, y, w: 100, h: 82, t: rand(0, 6), launched: false, vy: 0, rot: 0 }));
  const signs = [2050, 4050, 6050, 7450].map(x => ({ x, active: false }));

  return { plats, crows, items, cows, signs };
}

// ---------- Состояние игры ----------
let state = 'loading';          // loading | title | play | pause | dead | gameover | win
let level, player, bullets, eggs, particles, floaters, boss, princess;
let camX = 0, lookX = 0, hitStop = 0, shake = 0, score = 0, lives = 3, checkpoint = 120, timer = 0, stateT = 0, gameTime = 0;
let muted = false;

const stars = Array.from({ length: 220 }, () => ({ x: Math.random() * 2600, y: Math.random() * H, s: Math.random() * 2 + 0.5, p: Math.random() * 6 }));
const farRocks = Array.from({ length: 26 }, (_, i) => ({ x: i * 420 + rand(0, 200), y: rand(80, 520), r: rand(10, 30), rot: rand(0, 6), vr: rand(-0.5, 0.5) }));

function newPlayer(x) {
  return { x, y: GROUND_Y - 150, w: 54, h: 140, vx: 0, vy: 0, face: 1, onGround: false, coyote: 0, jumpBuf: 0,
    inv: 0, shootCd: 0, whip: 0, whipCd: 0, whipHit: new Set(), health: 100, ammo: 120, glide: false, stand: null, anim: newJimAnim(), deathFly: false };
}

function startGame() {
  level = buildLevel();
  player = newPlayer(120);
  bullets = []; eggs = []; particles = []; floaters = [];
  boss = { x: 8700, y: 220, w: 220, h: 110, hp: 24, maxHp: 24, t: 0, eggT: 2, flash: 0, active: false, dead: false, face: -1, dive: 0 };
  princess = { x: 9080, y: GROUND_Y - 160, w: 90, h: 160, saved: false };
  score = 0; lives = 3; checkpoint = 120; camX = 0; lookX = 0; hitStop = 0; gameTime = 0;
  state = 'play';
}

function respawn() {
  const hp = player.ammo;
  player = newPlayer(checkpoint);
  player.ammo = Math.max(hp, 60);
  player.inv = 2;
  bullets = []; eggs = [];
  state = 'play';
}

// ---------- Эффекты ----------
function burst(x, y, color, n = 14, speed = 300, size = 5) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), s = rand(speed * 0.3, speed);
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.4, 0.8), max: 0.8, color, size: rand(size * 0.5, size) });
  }
}
function floatText(x, y, text, color = '#ffe14a', size = 34) { floaters.push({ x, y, text, color, size, life: 1.3 }); }

function hurtPlayer(dmg, fromX) {
  if (player.inv > 0 || state !== 'play') return;
  player.health -= dmg;
  player.inv = 1.3;
  player.vx = (player.x + player.w / 2 < fromX ? -1 : 1) * 420;
  player.vy = -480;
  shake = 12;
  SFX.hurt();
  burst(player.x + player.w / 2, player.y + 40, '#ff8fb0', 10);
  if (player.health <= 0) killPlayer();
}
function killPlayer() {
  if (state !== 'play') return;
  player.health = 0;
  if (player.y < H) { player.deathFly = true; player.vy = -850; player.vx = -player.face * 120; }
  lives--;
  SFX.die();
  shake = 18;
  state = lives > 0 ? 'dead' : 'gameover';
  stateT = 0;
}

// ---------- Обновление ----------
function update(dt) {
  gameTime += dt;
  if (pressed.mute) { muted = !muted; if (actx) muted ? actx.suspend() : actx.resume(); }

  if (state === 'title' || state === 'gameover' || state === 'win') {
    stateT += dt;
    if ((pressed.start || pressed.jump) && stateT > 0.6) { startGame(); SFX.groovy(); }
    if (state === 'gameover') updateDeadJim(dt);
    if (state !== 'title') updateWorld(dt, true);
    return;
  }
  if (state === 'pause') { if (pressed.pause || pressed.start) state = 'play'; return; }
  if (state === 'dead') updateDeadJim(dt);
  if (state === 'dead') {
    stateT += dt;
    updateWorld(dt, true);
    if (stateT > 1.6) respawn();
    return;
  }
  if (state === 'play') {
    if (pressed.pause) { state = 'pause'; return; }
    // «Хит-стоп»: короткая заморозка кадра при сильном ударе — удар ощущается весомее
    if (hitStop > 0) { hitStop -= dt; return; }
    updatePlayer(dt);
    updateWorld(dt, false);
  }
}

function updateDeadJim(dt) {
  const p = player;
  if (p.deathFly && p.y < H + 400) { p.vy += GRAVITY * 0.55 * dt; p.y += p.vy * dt; p.x += p.vx * dt; }
  updateJimAnim(p, dt, 0);
}

function updatePlatforms(dt) {
  for (const p of level.plats) {
    if (p.range) {
      const nx = p.ox + Math.sin(gameTime * p.speed + p.phase) * p.range;
      p.dx = nx - p.x;
      p.x = nx;
    }
  }
}

function updatePlayer(dt) {
  const p = player;
  const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  const accel = p.onGround ? 3200 : 1900;
  const target = dir * RUN;
  if (p.vx < target) p.vx = Math.min(target, p.vx + accel * dt);
  else if (p.vx > target) p.vx = Math.max(target, p.vx - accel * dt);
  if (dir && p.whip <= 0) p.face = dir;

  // Прыжок с "койот-таймом" и буфером
  p.jumpBuf = pressed.jump ? 0.13 : p.jumpBuf - dt;
  p.coyote = p.onGround ? 0.1 : p.coyote - dt;
  if (p.jumpBuf > 0 && p.coyote > 0) {
    p.vy = -JUMP_V; p.jumpBuf = 0; p.coyote = 0; p.onGround = false; p.stand = null;
    SFX.jump();
    p.anim.takeoffT = 0.14;
    puff(p.x + p.w / 2 - 14, p.y + p.h - 2, 0.6, -70); puff(p.x + p.w / 2 + 14, p.y + p.h - 2, 0.6, 70);
  }
  if (!keys.jump && p.vy < 0) p.vy += GRAVITY * 1.4 * dt;   // переменная высота прыжка
  p.vy += GRAVITY * dt;
  // Голова-вертолёт: держи прыжок в падении, чтобы планировать
  p.glide = keys.jump && p.vy > 0 && !p.onGround;
  if (p.glide) p.vy = Math.min(p.vy, GLIDE_FALL);
  p.vy = Math.min(p.vy, 1400);

  // Едем на движущейся платформе
  if (p.onGround && p.stand && p.stand.dx) p.x += p.stand.dx;

  p.x = clamp(p.x + p.vx * dt, 0, WORLD_W - p.w);
  if (boss.active && !boss.dead) p.x = Math.max(p.x, 7900);

  const prevBottom = p.y + p.h, fallV = p.vy;
  p.y += p.vy * dt;
  const wasGround = p.onGround;
  p.onGround = false; p.stand = null;
  if (p.vy >= 0) {
    for (const pl of level.plats) {
      if (p.x + p.w > pl.x + 8 && p.x < pl.x + pl.w - 8 && prevBottom <= pl.y + 4 && p.y + p.h >= pl.y) {
        p.y = pl.y - p.h; p.vy = 0; p.onGround = true; p.stand = pl;
        break;
      }
    }
  }
  if (p.onGround && !wasGround) {
    // Приземление: присед + пыль; сила зависит от скорости падения
    const pow = clamp(fallV / 1100, 0.3, 1);
    p.anim.landT = 0.24; p.anim.landPow = pow;
    const n = pow > 0.6 ? 3 : 2;
    for (let i = 0; i < n; i++) { puff(p.x + p.w / 2 - 10 - i * 12, p.y + p.h - 2, 0.5 + pow * 0.5, -90 - i * 40); puff(p.x + p.w / 2 + 10 + i * 12, p.y + p.h - 2, 0.5 + pow * 0.5, 90 + i * 40); }
    burst(p.x + p.w / 2, p.y + p.h, '#b6ff4a', 4, 120, 4);
    if (pow > 0.8) shake = Math.max(shake, 4);
  }

  if (p.y > H + 150) { killPlayer(); return; }

  // Выстрел плазмой
  p.shootCd -= dt;
  if ((pressed.shoot || keys.shoot) && p.shootCd <= 0) {
    if (p.ammo > 0) {
      p.ammo--;
      p.shootCd = 0.14;
      p.anim.shootT = 0.13;
      const m = jimMuzzle(p);
      bullets.push({ x: m.x, y: m.y + rand(-2, 2), vx: p.face * 1150 + p.vx * 0.3, life: 0.9 });
      SFX.shoot();
      burst(m.x, m.y, '#7ff6ff', 3, 120, 3);
    } else if (pressed.shoot) {
      floatText(p.x + p.w / 2, p.y - 10, 'НЕТ ПЛАЗМЫ!', '#ff6b6b', 26);
      p.shootCd = 0.4;
    }
  }
  // Хлыст-голова
  p.whipCd -= dt;
  if (pressed.whip && p.whipCd <= 0) {
    p.whip = 0.28; p.whipCd = 0.42; p.whipHit = new Set();
    SFX.whip();
  }
  if (p.whip > 0) {
    p.whip -= dt;
    const cx = p.x + p.w / 2;
    const box = { x: p.face > 0 ? cx : cx - 190, y: p.y - 20, w: 190, h: 90 };
    for (const c of level.crows) if (!c.dead && !c.dying && !p.whipHit.has(c) && overlap(box, hitbox(c))) { p.whipHit.add(c); damageCrow(c, 1, p.face); }
    if (boss.active && !boss.dead && !p.whipHit.has(boss) && overlap(box, bossBox())) { p.whipHit.add(boss); damageBoss(2); }
  }
  p.inv = Math.max(0, p.inv - dt);
  updateJimAnim(p, dt, dir);

  // Чекпоинты
  for (const s of level.signs) {
    if (!s.active && Math.abs(p.x + p.w / 2 - s.x) < 50) {
      s.active = true; checkpoint = s.x - 30;
      floatText(s.x, GROUND_Y - 170, 'GROOVY!', '#b6ff4a', 46);
      SFX.groovy();
      burst(s.x, GROUND_Y - 110, '#b6ff4a', 24, 260);
    }
  }
}

const hitbox = c => ({ x: c.x - c.w / 2, y: c.y - c.h / 2, w: c.w, h: c.h });
const bossBox = () => ({ x: boss.x - boss.w / 2 + 20, y: boss.y - boss.h / 2 + 10, w: boss.w - 40, h: boss.h - 20 });

function damageCrow(c, dmg, dir) {
  c.hp -= dmg; c.flash = 0.15; c.x += dir * 18;
  SFX.hit();
  hitStop = Math.max(hitStop, 0.045);
  burst(c.x, c.y, '#ffffff', 6, 200, 4);
  feathers(c.x, c.y, 3);
  if (c.hp <= 0) {
    // ворона кувыркается и падает вниз
    c.dying = true; c.dvx = dir * 220; c.dvy = -420; c.rot = 0;
    hitStop = 0.09; shake = Math.max(shake, 5);
    feathers(c.x, c.y, 9);
    score += 100;
    floatText(c.x, c.y - 30, '+100');
    burst(c.x, c.y, '#2b2b36', 22, 320, 7);
    burst(c.x, c.y, '#ffb347', 8, 220, 4);
    if (Math.random() < 0.4) level.items.push({ type: 'atom', x: c.x, y: c.y, t: 0, drop: true, vy: -200 });
  }
}
function damageBoss(dmg) {
  boss.hp -= dmg; boss.flash = 0.12; shake = 5;
  SFX.hit();
  hitStop = Math.max(hitStop, 0.03);
  feathers(boss.x, boss.y, 2);
  burst(boss.x, boss.y, '#ffffff', 8, 260, 5);
  if (boss.hp <= 0 && !boss.dead) {
    boss.dead = true;
    score += 5000;
    shake = 25;
    SFX.boss(); SFX.groovy();
    floatText(boss.x, boss.y - 60, 'БОСС ПОВЕРЖЕН! +5000', '#ffe14a', 46);
    hitStop = 0.25;
    feathers(boss.x, boss.y, 30, '#3a1d4d');
    for (let i = 0; i < 6; i++) burst(boss.x + rand(-80, 80), boss.y + rand(-40, 40), i % 2 ? '#2b2b36' : '#ff7a3a', 22, 420, 8);
  }
}

function updateWorld(dt, passive) {
  updatePlatforms(dt);
  const p = player;
  const pcx = p.x + p.w / 2, pcy = p.y + p.h / 2;

  // Пули
  for (const b of bullets) {
    b.x += b.vx * dt; b.life -= dt;
    for (const c of level.crows) if (!c.dead && !c.dying && overlap({ x: b.x - 10, y: b.y - 6, w: 20, h: 12 }, hitbox(c))) { damageCrow(c, 1, Math.sign(b.vx)); b.life = 0; break; }
    if (b.life > 0 && boss.active && !boss.dead && overlap({ x: b.x - 10, y: b.y - 6, w: 20, h: 12 }, bossBox())) { damageBoss(1); b.life = 0; }
  }
  bullets = bullets.filter(b => b.life > 0);

  // Вороны
  for (const c of level.crows) {
    if (c.dead) continue;
    c.t += dt; c.flash = Math.max(0, c.flash - dt);
    if (c.dying) {
      c.dvy += 1500 * dt; c.x += c.dvx * dt; c.y += c.dvy * dt; c.rot += dt * 9 * Math.sign(c.dvx || 1);
      if (c.y > H + 120) c.dead = true;
      continue;
    }
    const dx = pcx - c.x, dy = pcy - c.y;
    if (c.state === 'patrol') {
      const nx = c.bx + Math.sin(c.t * 0.9) * 110;
      c.face = nx > c.x ? 1 : -1;
      c.x = nx; c.y = c.by + Math.sin(c.t * 2.3) * 22;
      c.st -= dt;
      if (!passive && Math.abs(dx) < 430 && Math.abs(dy) < 400 && c.st <= 0) {
        c.state = 'swoop'; c.st = 1.4;
        const d = Math.hypot(dx, dy) || 1;
        c.vx = dx / d * 340; c.vy = dy / d * 340;
        c.face = Math.sign(dx) || -1;
      }
    } else if (c.state === 'swoop') {
      c.x += c.vx * dt; c.y += c.vy * dt; c.st -= dt;
      if (c.st <= 0 || c.y > GROUND_Y - 30) c.state = 'return';
    } else {
      const tx = c.bx + Math.sin(c.t * 0.9) * 110, ty = c.by;
      const ddx = tx - c.x, ddy = ty - c.y, d = Math.hypot(ddx, ddy);
      c.face = ddx > 0 ? 1 : -1;
      if (d < 10) { c.state = 'patrol'; c.st = 1.8; }
      else { c.x += ddx / d * 220 * dt; c.y += ddy / d * 220 * dt; }
    }
    if (!passive && overlap(hitbox(c), p)) hurtPlayer(15, c.x);
  }

  // Предметы
  for (const it of level.items) {
    if (it.taken) continue;
    it.t += dt;
    if (it.drop) { it.vy += 900 * dt; it.y += it.vy * dt; for (const pl of level.plats) if (it.x > pl.x && it.x < pl.x + pl.w && it.y + 20 >= pl.y && it.y + 20 - it.vy * dt <= pl.y + 4) { it.y = pl.y - 20; it.vy = 0; it.drop = false; } if (it.y > H + 50) it.taken = true; }
    if (!passive && Math.abs(it.x - pcx) < 46 && Math.abs(it.y - pcy) < 86) {
      it.taken = true;
      if (it.type === 'atom') { p.ammo += 25; score += 25; SFX.pickup(); floatText(it.x, it.y - 20, '+25 ⚛', '#7ff6ff', 26); burst(it.x, it.y, '#7ff6ff', 10, 200, 4); }
      else { p.health = Math.min(100, p.health + 30); score += 50; SFX.heart(); floatText(it.x, it.y - 20, '+30%', '#ff7eb6', 28); burst(it.x, it.y, '#ff7eb6', 12, 200, 5); }
    }
  }

  // Коровы
  for (const cow of level.cows) {
    cow.t += dt;
    if (cow.launched) { cow.vy -= 600 * dt; cow.y += cow.vy * dt; cow.rot += dt * 8; cow.x += 120 * dt; continue; }
    if (!passive && Math.abs(cow.x - pcx) < 80 && Math.abs(cow.y + Math.sin(cow.t * 2) * 10 - pcy) < 110) {
      cow.launched = true; cow.vy = -500;
      score += 500;
      SFX.cow();
      floatText(cow.x, cow.y - 60, 'КОРОВА ЗАПУЩЕНА! +500', '#fff', 34);
      burst(cow.x, cow.y, '#ffe14a', 20, 300, 5);
    }
  }

  // Босс
  if (!boss.active && pcx > 7950) {
    boss.active = true; SFX.boss();
    floatText(pcx, 200, 'ПСИ-ВОРОНА!', '#ff4a4a', 60);
    shake = 10;
  }
  if (boss.active && !boss.dead) {
    boss.t += dt; boss.flash = Math.max(0, boss.flash - dt);
    const rage = boss.hp < boss.maxHp / 2;
    if (boss.dive > 0) {
      boss.dive -= dt;
      boss.x += boss.dvx * dt; boss.y += boss.dvy * dt;
      if (boss.y > GROUND_Y - 70) boss.dvy = -Math.abs(boss.dvy);
    } else {
      const tx = 8640 + Math.sin(boss.t * (rage ? 1 : 0.7)) * 420;
      const ty = 300 + Math.sin(boss.t * 1.9) * 80;
      boss.x += (tx - boss.x) * Math.min(1, dt * 3);
      boss.y += (ty - boss.y) * Math.min(1, dt * 3);
      boss.face = tx > boss.x ? 1 : -1;
    }
    boss.eggT -= dt;
    if (!passive && boss.eggT <= 0) {
      boss.eggT = rage ? 0.85 : 1.4;
      eggs.push({ x: boss.x, y: boss.y + 30, vx: (pcx - boss.x) * 0.9, vy: -150, life: 4 });
      if (rage && Math.random() < 0.35 && boss.dive <= 0) {
        const d = Math.hypot(pcx - boss.x, pcy - boss.y) || 1;
        boss.dive = 1.1; boss.dvx = (pcx - boss.x) / d * 520; boss.dvy = (pcy - boss.y) / d * 520;
        boss.face = Math.sign(boss.dvx) || -1;
      }
    }
    if (!passive && overlap(bossBox(), p)) hurtPlayer(20, boss.x);
  }

  // Яйца
  for (const e of eggs) {
    e.vy += 900 * dt; e.x += e.vx * dt; e.y += e.vy * dt; e.life -= dt;
    if (e.y > GROUND_Y - 12) { e.life = 0; burst(e.x, GROUND_Y - 10, '#fff7d1', 12, 220, 5); burst(e.x, GROUND_Y - 10, '#ffcf3f', 6, 160, 4); }
    if (!passive && e.life > 0 && Math.abs(e.x - pcx) < 40 && Math.abs(e.y - pcy) < 75) { e.life = 0; hurtPlayer(15, e.x); burst(e.x, e.y, '#ffcf3f', 12, 220, 5); }
    for (const b of bullets) if (e.life > 0 && Math.abs(b.x - e.x) < 22 && Math.abs(b.y - e.y) < 22) { e.life = 0; b.life = 0; score += 10; burst(e.x, e.y, '#fff7d1', 10, 200, 4); }
  }
  eggs = eggs.filter(e => e.life > 0);

  // Принцесса
  if (!passive && boss.dead && !princess.saved && Math.abs(princess.x - pcx) < 90) {
    princess.saved = true;
    score += 2000 + lives * 1000;
    SFX.win();
    state = 'win'; stateT = 0;
  }

  // Частицы и тексты
  updateParticles(dt);
  for (const f of floaters) { f.y -= 50 * dt; f.life -= dt; }
  floaters = floaters.filter(f => f.life > 0);

  // Камера
  // камера заглядывает вперёд по ходу движения
  if (state === 'play') lookX += ((p.face * 130 + p.vx * 0.2) - lookX) * lerpK(dt, 2.2);
  const targetCam = clamp(pcx - W * 0.5 + lookX, 0, WORLD_W - W);
  camX += (targetCam - camX) * lerpK(dt, 7);
  shake = Math.max(0, shake - dt * 40);
}


// =====================================================================
//  АНИМАЦИЯ: скелетная «cut-out» анимация из нарезанных частей спрайтов
//  (части и суставы режет art/rig.py → assets/rig/*.png + rig.js)
// =====================================================================
// Аффинные матрицы [a, b, c, d, e, f] — как у canvas.transform()
const MX = {
  mul: (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]],
  t: (x, y) => [1, 0, 0, 1, x, y],
  s: (x, y) => [x, 0, 0, y, 0, 0],
  r: a => { const c = Math.cos(a), s = Math.sin(a); return [c, s, -s, c, 0, 0]; },
  apply: (m, p) => ({ x: m[0] * p[0] + m[2] * p[1] + m[4], y: m[1] * p[0] + m[3] * p[1] + m[5] }),
};
// Поворот (и масштаб) вокруг сустава p
function around(p, a, sx = 1, sy = 1) {
  let m = MX.mul(MX.t(p[0], p[1]), MX.r(a));
  if (sx !== 1 || sy !== 1) m = MX.mul(m, MX.s(sx, sy));
  return MX.mul(m, MX.t(-p[0], -p[1]));
}
function drawPart(rigName, name, m) {
  const r = RIG[rigName], img = IMG[rigName + '_' + name];
  if (!img || !img.width) return;
  const [x, y, w, h] = r.parts[name];
  ctx.save();
  ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
  ctx.drawImage(img, x, y, w, h);
  ctx.restore();
}
const easeOut = k => 1 - (1 - k) * (1 - k);
const lerpK = (dt, speed) => 1 - Math.exp(-dt * speed);

// ---------- Позы Джима ----------
// Углы в радианах, в системе исходной картинки (персонаж смотрит вправо):
// «+» = по часовой. Нога/рука вперёд = «−», колено сгибается = «+», наклон вперёд = «+».
const POSE0 = { bodyX: 0, bodyY: 0, lean: 0, sx: 1, sy: 1, head: 0, hsx: 1, hsy: 1, armB: 0, armF: 0, thL: 0, shL: 0, thR: 0, shR: 0 };
const JIM_S = () => JIM_H / RIG.jim.height;

function newJimAnim() {
  return { pose: { ...POSE0 }, phase: 0, t: 0, face: 1, shootT: 0, landT: 0, landPow: 0, stepSign: 0, takeoffT: 0, blink: 0, nextBlink: 2, spin: 0 };
}

function poseIdle(t) {
  const b = Math.sin(t * 2.6);
  return { ...POSE0, bodyY: b * 5, sy: 1 + b * 0.012, sx: 1 - b * 0.006, head: Math.sin(t * 1.3) * 0.07, hsy: 1 + Math.sin(t * 2.6 + 0.6) * 0.03,
    armB: 0.06 + Math.sin(t * 2.6 + 0.4) * 0.05, armF: Math.sin(t * 2.6 + 1) * 0.04, lean: Math.sin(t * 1.3) * 0.015, thL: -0.03, thR: 0.03 };
}
function poseRun(ph, s) {
  const sn = Math.sin(ph), cs = Math.cos(ph);
  const swing = 0.62 * s;
  return {
    ...POSE0,
    thL: -swing * sn, thR: swing * sn,
    shL: 0.1 + 1.05 * s * Math.max(0, cs), shR: 0.1 + 1.05 * s * Math.max(0, -cs),
    // корпус ниже, когда ноги расставлены; выше — когда проходят друг мимо друга
    bodyY: (Math.abs(sn) * 26 - 16) * s,
    lean: 0.14 * s + Math.sin(ph * 2) * 0.02,
    armB: 0.75 * s * sn, armF: -0.18 * s * sn + 0.04,
    head: -0.08 * s + Math.sin(ph * 2 + 0.5) * 0.05, hsy: 1 + Math.cos(ph * 2) * 0.035,
    sy: 1 + Math.cos(ph * 2) * 0.02,
  };
}
function poseJumpUp(t) {
  return { ...POSE0, thL: -1.0, shL: 1.45, thR: 0.3, shR: 0.55, armB: 2.45 + Math.sin(t * 9) * 0.1, armF: -0.4, lean: -0.04,
    head: -0.12, hsy: 1.14, sy: 1.04, sx: 0.97, bodyY: -12 };
}
function poseFall(t, vy) {
  const f = Math.sin(t * 17);
  const fast = clamp(vy / 1200, 0, 1);
  return { ...POSE0, thL: -0.4 + f * 0.12, shL: 0.6, thR: 0.25 - f * 0.12, shR: 0.35, armB: 2.2 + f * 0.35, armF: -0.75 + Math.sin(t * 17 + 1.3) * 0.25,
    lean: 0.03, head: 0.06, hsy: 1 + fast * 0.12, sy: 1 + fast * 0.03 };
}
function poseGlide(t) {
  return { ...POSE0, thL: 0.08 + Math.sin(t * 5) * 0.16, shL: 0.25, thR: -0.08 - Math.sin(t * 5) * 0.16, shR: 0.25,
    armB: 1.55 + Math.sin(t * 8) * 0.12, armF: -0.5 + Math.sin(t * 8 + 1) * 0.08, hsy: 1.18, head: 0, bodyY: Math.sin(t * 5) * 4 };
}
function poseHurt(t) {
  return { ...POSE0, lean: -0.32, head: -0.45, hsy: 0.92, armB: 2.4 + Math.sin(t * 30) * 0.2, armF: -1.3, thL: -0.6, shL: 0.9, thR: 0.35, shR: 0.4 };
}
function poseSkid() {
  return { ...POSE0, lean: -0.22, thL: -0.55, shL: 0.25, thR: 0.25, shR: 0.6, armB: 0.9, armF: -0.5, head: -0.2, bodyY: 18 };
}

function addPose(T, k, add) { for (const key in add) T[key] += add[key] * k; }

function updateJimAnim(p, dt, dir) {
  const a = p.anim;
  a.t += dt;
  a.shootT = Math.max(0, a.shootT - dt);
  a.landT = Math.max(0, a.landT - dt);
  a.takeoffT = Math.max(0, a.takeoffT - dt);
  // Плавный разворот: масштаб по X проходит через 0 («бумажный» поворот)
  a.face += (p.face - a.face) * lerpK(dt, 22);
  if (Math.abs(a.face) < 0.08) a.face = 0.08 * (p.face || 1);

  const speed = Math.abs(p.vx);
  let T, k = lerpK(dt, 16);
  const dying = state === 'dead' || state === 'gameover' || p.health <= 0;
  if (dying) { T = poseHurt(a.t); }
  else if (p.inv > 1.05) { T = poseHurt(a.t); k = lerpK(dt, 24); }
  else if (!p.onGround) {
    if (p.glide) T = poseGlide(a.t);
    else if (p.vy < -120) T = poseJumpUp(a.t);
    else T = poseFall(a.t, p.vy);
    k = lerpK(dt, 12);
  } else if (dir && speed > 160 && Math.sign(p.vx) !== dir) {
    T = poseSkid(); k = lerpK(dt, 20);
    if (Math.random() < dt * 30) puff(p.x + p.w / 2 + Math.sign(p.vx) * 24, p.y + p.h - 2, 0.7, -Math.sign(p.vx) * 60);
  } else if (speed > 30) {
    const s = clamp(speed / RUN, 0.35, 1);
    const prev = Math.sin(a.phase);
    a.phase += dt * (5 + speed * 0.024);
    T = poseRun(a.phase, s);
    k = lerpK(dt, 22);
    // Шаг: нога коснулась земли → пыль из-под ботинка
    const sn = Math.sin(a.phase);
    if (Math.sign(sn) !== Math.sign(prev) && speed > 150) {
      puff(p.x + p.w / 2 - p.face * 18, p.y + p.h - 2, 0.65, -p.face * 50);
      if (Math.random() < 0.5) puff(p.x + p.w / 2 - p.face * 30, p.y + p.h - 6, 0.45, -p.face * 90);
    }
  } else {
    a.phase = 0;
    T = poseIdle(a.t);
    k = lerpK(dt, 10);
  }
  // Добавочные слои поверх базовой позы
  if (a.landT > 0) {
    const q = Math.sin((a.landT / 0.24) * Math.PI) * a.landPow;      // присесть и распрямиться
    addPose(T, q, { bodyY: 46, thL: -0.5, shL: 0.95, thR: -0.35, shR: 0.75, lean: 0.12, armB: 0.35, armF: 0.25, sy: -0.06, sx: 0.05, hsy: -0.1 });
  }
  if (a.takeoffT > 0) {
    const q = a.takeoffT / 0.14;                                     // вытянуться при толчке
    addPose(T, q, { sy: 0.08, sx: -0.05, hsy: 0.12 });
  }
  if (a.shootT > 0) {
    const q = easeOut(a.shootT / 0.13);                              // отдача бластера
    addPose(T, q, { armF: -0.42, lean: -0.05, head: -0.06, bodyX: -10 });
  }
  if (p.whip > 0) {
    const q = Math.sin(clamp(1 - p.whip / 0.28, 0, 1) * Math.PI);
    addPose(T, q, { lean: 0.16, armB: 0.5, armF: 0.25, thL: -0.2, shL: 0.2 });
  }
  const P = a.pose;
  for (const key in T) P[key] += (T[key] - P[key]) * k;
  // Голова-вертолёт: голова крутится (сжатие по X, имитирует вращение)
  if (p.glide && !dying) { a.spin += dt * 30; P.hsx = Math.cos(a.spin); if (Math.abs(P.hsx) < 0.12) P.hsx = 0.12 * Math.sign(P.hsx || 1); }
  else { a.spin = 0; P.hsx += (1 - P.hsx) * lerpK(dt, 20); }
}

// Матрицы всех костей Джима (мировые координаты)
function jimBones(x, bottom, face, scale, P, rot = 0, whipK = 0) {
  const r = RIG.jim, J = r.pivots;
  const hc = r.height * 0.5 * scale;
  let base = MX.t(x, bottom);
  if (rot) base = MX.mul(MX.mul(MX.t(x, bottom - hc), MX.r(rot * Math.sign(face))), MX.t(0, hc));
  base = MX.mul(base, MX.s(face * scale, scale));
  base = MX.mul(base, MX.t(-r.feet[0] + P.bodyX, -r.feet[1] + P.bodyY));
  const torso = MX.mul(base, around(J.hip, P.lean, P.sx, P.sy));
  const thR = MX.mul(base, around(J.hipR, P.thR));
  const thL = MX.mul(base, around(J.hipL, P.thL));
  // Хлыст: голова вылетает вперёд на длинной шее
  const ext = whipK;
  const headOff = MX.t(ext * 860, ext * 40);
  const head = MX.mul(MX.mul(torso, headOff), around(J.neck, P.head + ext * 1.25, P.hsx, P.hsy));
  return {
    base, torso, head, ext,
    armB: MX.mul(torso, around(J.shoulderB, P.armB)),
    armF: MX.mul(torso, around(J.shoulderF, P.armF)),
    thR, shR: MX.mul(thR, around(J.kneeR, P.shR)),
    thL, shL: MX.mul(thL, around(J.kneeL, P.shL)),
  };
}

function drawNeckWhip(B) {
  // шея-хлыст от воротника до головы
  const J = RIG.jim.pivots;
  const a = MX.apply(B.torso, J.neck);
  const b = MX.apply(B.torso, [J.neck[0] + B.ext * 860, J.neck[1] + B.ext * 40]);
  const c = MX.apply(B.torso, [J.neck[0] + B.ext * 380, J.neck[1] - B.ext * 260]);
  const sc = Math.hypot(B.torso[0], B.torso[1]);
  ctx.save();
  ctx.lineCap = 'round';
  for (const [w, col] of [[98, '#1a0d12'], [80, '#f19c9f'], [30, '#f8c2c2']]) {
    ctx.strokeStyle = col; ctx.lineWidth = w * sc;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(c.x, c.y, b.x, b.y); ctx.stroke();
  }
  // кольца-морщинки на шее
  ctx.strokeStyle = 'rgba(120,40,50,0.55)'; ctx.lineWidth = 6 * sc;
  for (let i = 1; i < 6; i++) {
    const t = i / 6, mt = 1 - t;
    const px = mt * mt * a.x + 2 * mt * t * c.x + t * t * b.x, py = mt * mt * a.y + 2 * mt * t * c.y + t * t * b.y;
    ctx.beginPath(); ctx.arc(px, py, 30 * sc, 0.3, 2.6); ctx.stroke();
  }
  ctx.restore();
}

function drawJimRig(B, glide) {
  drawPart('jim', 'armB', B.armB);
  drawPart('jim', 'shinR', B.shR);
  drawPart('jim', 'thighR', B.thR);
  drawPart('jim', 'shinL', B.shL);
  drawPart('jim', 'thighL', B.thL);
  drawPart('jim', 'torso', B.torso);
  if (B.ext > 0.02) drawNeckWhip(B);
  drawPart('jim', 'head', B.head);
  drawPart('jim', 'armF', B.armF);
  if (glide) {
    // размытый «пропеллер» над головой
    const top = MX.apply(B.head, RIG.jim.headTop);
    const sc = Math.hypot(B.base[0], B.base[1]);
    ctx.save();
    ctx.translate(top.x, top.y + 4);
    ctx.strokeStyle = 'rgba(255,190,200,0.85)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    const s = gameTime * 34;
    for (let i = 0; i < 2; i++) {
      const st = (s + i * Math.PI) % (Math.PI * 2);
      ctx.beginPath(); ctx.ellipse(0, 0, 300 * sc, 50 * sc, 0, st, st + 2.0); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,220,230,0.18)';
    ctx.beginPath(); ctx.ellipse(0, 0, 300 * sc, 50 * sc, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

function playerBones(p) {
  const a = p.anim;
  const dying = state === 'dead' || state === 'gameover';
  const rot = dying && p.deathFly ? stateT * 7 : 0;
  const whipK = p.whip > 0 ? Math.sin(clamp(1 - p.whip / 0.28, 0, 1) * Math.PI) : 0;
  return jimBones(p.x + p.w / 2, p.y + p.h, a.face, JIM_S(), a.pose, rot, whipK);
}
function jimMuzzle(p) {
  const B = playerBones(p);
  return MX.apply(B.armF, RIG.jim.muzzle);
}
function jimWhipTip(p) {
  const B = playerBones(p);
  return MX.apply(B.head, [560, 160]);
}

// ---------- Ворона: машет крыльями ----------
function drawCrowRig(x, y, width, face, flap, tilt, filter) {
  const r = RIG.crow, k = width / r.width;
  ctx.save();
  ctx.translate(x, y);
  if (tilt) ctx.rotate(tilt);
  ctx.scale(-face * k, k);          // исходный спрайт смотрит влево
  ctx.translate(-r.center[0], -r.center[1] + flap * 30);
  if (filter) ctx.filter = filter;
  const fold = 1 - Math.abs(flap) * 0.18;
  drawPart('crow', 'wingR', around(r.pivots.wingR, -flap * 0.95, fold, 1));
  drawPart('crow', 'wingL', around(r.pivots.wingL, flap * 1.05, fold, 1));
  drawPart('crow', 'body', [1, 0, 0, 1, 0, 0]);
  ctx.restore();
}

// ---------- Принцесса: платье и волосы колышутся, рука машет ----------
function drawPrincessRig(x, bottom, height, t, mood, flip = 1) {
  const r = RIG.princess, k = height / r.height;
  const img = IMG.princess_body;
  if (!img || !img.width) return;
  const hop = mood === 'help' ? Math.abs(Math.sin(t * 5)) * 18 : mood === 'happy' ? Math.abs(Math.sin(t * 6)) * 40 : 0;
  ctx.save();
  ctx.translate(x, bottom);
  ctx.scale(k * flip, k * (1 - (mood === 'help' ? Math.sin(t * 10) * 0.01 : 0)));
  ctx.translate(-r.feet[0], -r.feet[1] - hop);
  const [bx, by, bw, bh] = r.parts.body, S = img.width / bw, waist = r.waistY;
  // Верх — целиком, лёгкое покачивание
  ctx.save();
  ctx.translate(r.feet[0], waist); ctx.rotate(Math.sin(t * 1.8) * 0.025); ctx.translate(-r.feet[0], -waist);
  ctx.drawImage(img, 0, 0, img.width, (waist - by) * S, bx, by, bw, waist - by + 1);
  // рука машет из плеча
  const wave = mood === 'help' ? Math.sin(t * 13) * 0.4 + 0.1 : Math.sin(t * 6) * 0.32;
  drawPart('princess', 'arm', around(r.pivots.shoulder, wave));
  ctx.restore();
  // Низ — полосами со сдвигом: юбка колышется волной
  const step = 6, bottomY = by + bh;
  const amp = mood === 'happy' ? 26 : 16;
  for (let y = waist; y < bottomY; y += step) {
    const n = (y - waist) / (bottomY - waist);
    const off = Math.sin(t * 2.6 - n * 2.4) * amp * n * n + Math.sin(t * 1.8) * 0.025 * (waist - by) * 0.4;
    const hh = Math.min(step + 1, bottomY - y);
    ctx.drawImage(img, 0, (y - by) * S, img.width, hh * S, bx + off, y, bw, hh);
  }
  ctx.restore();
}

// ---------- Пыль и перья ----------
function puff(x, y, size = 1, vx = 0) {
  particles.push({ kind: 'puff', x, y, vx: vx + rand(-20, 20), vy: rand(-40, -15), r: rand(6, 10) * size, grow: rand(26, 40) * size, life: 0.5, max: 0.5 });
}
function feathers(x, y, n = 6, color = '#1d1d26') {
  for (let i = 0; i < n; i++) particles.push({ kind: 'feather', x: x + rand(-20, 20), y: y + rand(-15, 15), vx: rand(-120, 120), vy: rand(-180, -40), rot: rand(0, 6), vr: rand(-6, 6), life: rand(1, 1.6), max: 1.6, size: rand(6, 11), color, ph: rand(0, 6) });
}
function updateParticles(dt) {
  for (const q of particles) {
    q.life -= dt;
    if (q.kind === 'puff') { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.92; q.r += q.grow * dt; }
    else if (q.kind === 'feather') { q.vy = Math.min(q.vy + 260 * dt, 70); q.vx *= 0.97; q.x += (q.vx + Math.sin(q.life * 6 + q.ph) * 60) * dt; q.y += q.vy * dt; q.rot += q.vr * dt; }
    else { q.vy += 500 * dt; q.x += q.vx * dt; q.y += q.vy * dt; }
  }
  particles = particles.filter(q => q.life > 0);
}
function drawParticles() {
  for (const q of particles) {
    const a = clamp(q.life / q.max * 1.4, 0, 1);
    const x = q.x - camX;
    if (q.kind === 'puff') {
      ctx.globalAlpha = a * 0.75;
      ctx.fillStyle = '#e6dcff';
      ctx.beginPath(); ctx.arc(x, q.y, q.r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = a * 0.5;
      ctx.strokeStyle = '#5b4a7a'; ctx.lineWidth = 2; ctx.stroke();
    } else if (q.kind === 'feather') {
      ctx.globalAlpha = a;
      ctx.save(); ctx.translate(x, q.y); ctx.rotate(q.rot);
      ctx.fillStyle = q.color; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(0, 0, q.size, q.size * 0.32, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
    } else {
      ctx.globalAlpha = a;
      ctx.fillStyle = q.color;
      ctx.fillRect(x - q.size / 2, q.y - q.size / 2, q.size, q.size);
    }
  }
  ctx.globalAlpha = 1;
}

// ---------- Отрисовка ----------
function drawBackground() {
  // Фон с параллаксом (тайлы с зеркалированием для бесшовности)
  const bg = IMG.bg;
  ctx.fillStyle = '#0a0620'; ctx.fillRect(0, 0, W, H);
  if (bg && bg.width) {
    const bw = bg.width * (H / bg.height);
    const off = -(camX * 0.15) % (bw * 2);
    for (let i = -1; i < 4; i++) {
      const x = off + i * bw;
      if (x > W || x + bw < 0) continue;
      const k = ((i % 2) + 2) % 2;
      // обрезаем по 6px с краёв исходника, чтобы стык зеркальных тайлов был незаметен
      if (k === 0) ctx.drawImage(bg, 6, 0, bg.width - 12, bg.height, x - 1, 0, bw + 2, H);
      else { ctx.save(); ctx.translate(x + bw, 0); ctx.scale(-1, 1); ctx.drawImage(bg, 6, 0, bg.width - 12, bg.height, -1, 0, bw + 2, H); ctx.restore(); }
    }
  }
  // Мерцающие звёзды (ближний слой)
  for (const s of stars) {
    const x = ((s.x - camX * 0.4) % 2600 + 2600) % 2600 - 100;
    if (x < -10 || x > W + 10) continue;
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(gameTime * 3 + s.p);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, s.y, s.s, s.s);
  }
  ctx.globalAlpha = 1;
  // Дальние астероиды
  for (const r of farRocks) {
    const x = ((r.x - camX * 0.55) % 11000 + 11000) % 11000 - 200;
    if (x < -60 || x > W + 60) continue;
    ctx.save(); ctx.translate(x, r.y); ctx.rotate(r.rot + gameTime * r.vr);
    ctx.fillStyle = '#3a2a52'; ctx.strokeStyle = '#120a1e'; ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2, rr = r.r * (0.75 + ((i * 37) % 10) / 30); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}

function drawPlatforms() {
  for (const p of level.plats) {
    if (p.x + p.w < camX - 40 || p.x > camX + W + 40) continue;
    ctx.drawImage(p.img, Math.round(p.x - camX - 8), Math.round(p.y - 14));
  }
}

function drawSign(s) {
  const x = s.x - camX, y = GROUND_Y;
  if (x < -150 || x > W + 150) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.05);
  ctx.fillStyle = '#6b4226'; ctx.strokeStyle = '#1a0f08'; ctx.lineWidth = 4;
  ctx.fillRect(-7, -110, 14, 110); ctx.strokeRect(-7, -110, 14, 110);
  ctx.beginPath(); ctx.roundRect(-75, -150, 150, 58, 8);
  ctx.fillStyle = s.active ? '#a2703f' : '#8a5a33'; ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-70, -130); ctx.lineTo(70, -132); ctx.moveTo(-70, -112); ctx.lineTo(70, -110); ctx.stroke();
  if (s.active) { ctx.shadowColor = '#b6ff4a'; ctx.shadowBlur = 20; }
  outlinedText('GROOVY', 0, -121, 36, s.active ? '#d6ff7a' : '#f3e2c0', 'center', '#2a1608');
  ctx.restore();
}

function drawAtom(x, y, t) {
  ctx.save(); ctx.translate(x, y + Math.sin(t * 3) * 5);
  ctx.shadowColor = '#5ff1ff'; ctx.shadowBlur = 16;
  ctx.strokeStyle = '#9ffaff'; ctx.lineWidth = 2.5;
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(0, 0, 20, 7, t * 1.5 + i * Math.PI / 3, 0, Math.PI * 2); ctx.stroke(); }
  ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
  ctx.restore();
}
function drawHeart(x, y, t) {
  const s = 1 + Math.sin(t * 6) * 0.08;
  ctx.save(); ctx.translate(x, y + Math.sin(t * 3) * 5); ctx.scale(s, s);
  ctx.shadowColor = '#ff6fae'; ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.moveTo(0, 14);
  ctx.bezierCurveTo(-26, -4, -14, -24, 0, -10);
  ctx.bezierCurveTo(14, -24, 26, -4, 0, 14);
  ctx.fillStyle = '#ff4f8f'; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = '#3a0a1e'; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.ellipse(-8, -6, 4, 2.5, -0.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawJimShadow() {
  const p = player;
  if (state === 'dead' && p.deathFly) return;
  const cx = p.x + p.w / 2, bottom = p.y + p.h;
  let top = null;
  for (const pl of level.plats) if (cx > pl.x && cx < pl.x + pl.w && pl.y >= bottom - 4 && (top === null || pl.y < top)) top = pl.y;
  if (top === null) return;
  const d = clamp((top - bottom) / 300, 0, 1);
  ctx.save();
  ctx.globalAlpha = 0.35 * (1 - d);
  ctx.fillStyle = '#0b0518';
  ctx.beginPath(); ctx.ellipse(cx - camX, top + 3, 42 * (1 - d * 0.5), 8 * (1 - d * 0.5), 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawJim() {
  const p = player;
  if (!RIG) return;
  if (p.inv > 0 && p.inv < 1.05 && Math.floor(p.inv * 16) % 2 === 0 && state === 'play') return;
  const B = playerBones(p);
  ctx.save();
  ctx.translate(-camX, 0);
  if (p.inv > 1.05 && state === 'play' && Math.floor(p.inv * 24) % 2 === 0) ctx.filter = 'brightness(1.5) saturate(1.4)';
  drawJimRig(B, p.glide && state === 'play');
  ctx.filter = 'none';
  // Вспышка выстрела
  if (p.anim.shootT > 0.06) {
    const m = MX.apply(B.armF, RIG.jim.muzzle);
    const k = (p.anim.shootT - 0.06) / 0.07;
    ctx.save();
    ctx.translate(m.x + p.face * 8, m.y);
    ctx.rotate(gameTime * 20);
    ctx.globalAlpha = k;
    ctx.fillStyle = '#ffffff'; ctx.shadowColor = '#3ff0ff'; ctx.shadowBlur = 20;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 6 : 18 * (0.7 + k * 0.3), a = i / 10 * Math.PI * 2; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // Хлопок хлыста на максимальном вылете
  if (p.whip > 0.1 && p.whip < 0.18) {
    const t = MX.apply(B.head, [600, 150]);
    ctx.save(); ctx.translate(t.x + p.face * 26, t.y);
    ctx.strokeStyle = '#fff6b0'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + gameTime * 10; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 8, Math.sin(a) * 8); ctx.lineTo(Math.cos(a) * 20, Math.sin(a) * 20); ctx.stroke(); }
    ctx.restore();
  }
  ctx.restore();
}

function crowFlap(t, speed = 14) {
  // взмах: быстро вниз, медленнее вверх
  const ph = (t * speed) % (Math.PI * 2);
  return ph < Math.PI * 0.8 ? Math.cos(ph / 0.8) * 0.55 : -Math.cos((ph - Math.PI * 0.8) / 1.2) * 0.55;
}

function drawCrow(c) {
  const x = c.x - camX;
  if (x < -170 || x > W + 170 || !RIG) return;
  let flap, tilt = 0;
  if (c.dying) { flap = 0.5 + Math.sin(c.t * 30) * 0.15; tilt = c.rot; }
  else if (c.state === 'swoop') {
    flap = -0.55 + Math.sin(c.t * 40) * 0.04;                    // крылья сложены назад — пикирует
    const v = Math.hypot(c.vx, c.vy) || 1;
    tilt = c.face * clamp(c.vy / v, -1, 1) * 0.55;
  } else {
    flap = crowFlap(c.t, c.state === 'return' ? 17 : 13);
    tilt = Math.sin(c.t * 2.3) * 0.06;
  }
  drawCrowRig(x, c.y, 150, c.face, flap, tilt, c.flash > 0 ? 'brightness(3)' : null);
}

function drawBoss() {
  if (!boss.active && camX + W < boss.x - 200) return;
  if (boss.dead || !RIG) return;
  const x = boss.x - camX;
  let flap, tilt = 0;
  if (boss.dive > 0) { flap = -0.6; tilt = boss.face * clamp(boss.dvy / 520, -1, 1) * 0.5; }
  else { flap = crowFlap(boss.t, boss.hp < boss.maxHp / 2 ? 13 : 10) * 1.1; tilt = Math.sin(boss.t * 1.9) * 0.08; }
  ctx.save();
  ctx.shadowColor = '#ff3a3a'; ctx.shadowBlur = 25;
  drawCrowRig(x, boss.y, 330, boss.face, flap, tilt, boss.flash > 0 ? 'brightness(3)' : 'hue-rotate(250deg) saturate(2.2)');
  ctx.restore();
}

function drawCow(cow) {
  const img = IMG.cow;
  const x = cow.x - camX;
  if (x < -200 || x > W + 200 || cow.y < -200 || !img.width) return;
  const sw = 120, sh = sw * img.height / img.width;
  ctx.save();
  ctx.translate(x, cow.y + (cow.launched ? 0 : Math.sin(cow.t * 2) * 10));
  if (cow.launched) {
    ctx.rotate(cow.rot);
    const st = 1 + Math.min(0.35, Math.abs(cow.vy) / 2000);
    ctx.scale(1 / st, st);
  } else {
    // корова «лягается» в невесомости
    const kick = Math.max(0, Math.sin(cow.t * 3.2)) ** 6;
    ctx.rotate(Math.sin(cow.t * 1.3) * 0.15 - kick * 0.25);
    ctx.scale(1 + kick * 0.12 + Math.sin(cow.t * 4) * 0.02, 1 - kick * 0.1 - Math.sin(cow.t * 4) * 0.02);
  }
  ctx.drawImage(img, -sw / 2, -sh / 2, sw, sh);
  ctx.restore();
}

function drawPrincess() {
  const x = princess.x - camX;
  if (x < -200 || x > W + 200 || !RIG) return;
  drawPrincessRig(x, GROUND_Y, 170, gameTime, boss.dead ? 'happy' : 'help');
  // Клетка, пока босс жив
  if (!boss.dead) {
    ctx.save();
    ctx.strokeStyle = '#9aa3b5'; ctx.lineWidth = 5;
    ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
    for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(x + i * 24, GROUND_Y - 190); ctx.lineTo(x + i * 24, GROUND_Y); ctx.stroke(); }
    ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(x - 82, GROUND_Y - 190); ctx.lineTo(x + 82, GROUND_Y - 190); ctx.stroke();
    ctx.restore();
  }
  // Пузырь речи
  const bob = Math.sin(gameTime * 3) * 3;
  const msg = boss.dead ? 'Мой герой! ♥' : 'Помогите, Джим!';
  ctx.font = '700 22px Rubik, sans-serif';
  const tw = ctx.measureText(msg).width + 30;
  const by = GROUND_Y - 240 + bob;
  ctx.save();
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#111'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(x - tw / 2, by - 24, tw, 44, 18); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 8, by + 19); ctx.lineTo(x + 2, by + 36); ctx.lineTo(x + 12, by + 19); ctx.fill();
  ctx.fillStyle = '#d6266c'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(msg, x, by - 1);
  ctx.restore();
}

function drawHUD() {
  const p = player;
  // Здоровье
  ctx.save();
  ctx.fillStyle = 'rgba(10,6,30,0.55)';
  ctx.beginPath(); ctx.roundRect(16, 14, 380, 88, 16); ctx.fill();
  outlinedText('ДЖИМ', 34, 40, 30, '#ffe14a', 'left');
  const hw = 220, hx = 140, hy = 28;
  ctx.fillStyle = '#2a1030'; ctx.fillRect(hx, hy, hw, 22);
  const hp = clamp(p.health, 0, 100) / 100;
  ctx.fillStyle = hp > 0.5 ? '#6bff5a' : hp > 0.25 ? '#ffd23f' : '#ff4a4a';
  ctx.fillRect(hx, hy, hw * hp, 22);
  ctx.strokeStyle = '#111'; ctx.lineWidth = 3; ctx.strokeRect(hx, hy, hw, 22);
  outlinedText(Math.max(0, Math.ceil(p.health)) + '%', hx + hw / 2, hy + 12, 22, '#fff');
  drawAtomIcon(48, 78);
  outlinedText('' + p.ammo, 72, 79, 28, '#9ffaff', 'left');
  outlinedText('ЖИЗНИ ×' + lives, 200, 79, 28, '#ff9fc6', 'left');
  ctx.restore();
  outlinedText('ОЧКИ ' + score.toString().padStart(6, '0'), W - 24, 40, 36, '#fff', 'right');
  // Прогресс
  const prog = clamp((p.x) / (princess.x - 100), 0, 1);
  ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(W - 284, 70, 260, 8);
  ctx.fillStyle = '#ff7eb6'; ctx.fillRect(W - 284, 70, 260 * prog, 8);
  ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(W - 24, 74, 8, 0, Math.PI * 2); ctx.fill();

  if (boss.active && !boss.dead) {
    const bw = 520, bx = W / 2 - bw / 2, by = H - 46;
    outlinedText('ПСИ-ВОРОНА', W / 2, by - 18, 30, '#ff6b6b');
    ctx.fillStyle = '#2a1030'; ctx.fillRect(bx, by, bw, 18);
    ctx.fillStyle = '#ff3a3a'; ctx.fillRect(bx, by, bw * boss.hp / boss.maxHp, 18);
    ctx.strokeStyle = '#111'; ctx.lineWidth = 3; ctx.strokeRect(bx, by, bw, 18);
  }
}
function drawAtomIcon(x, y) {
  ctx.save(); ctx.translate(x, y); ctx.strokeStyle = '#9ffaff'; ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(0, 0, 13, 5, i * Math.PI / 3, 0, Math.PI * 2); ctx.stroke(); }
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}

function drawWorld() {
  drawBackground();
  ctx.save();
  if (shake > 0) ctx.translate(rand(-shake, shake), rand(-shake, shake));
  drawPlatforms();
  level.signs.forEach(drawSign);
  for (const it of level.items) {
    if (it.taken) continue;
    const x = it.x - camX;
    if (x < -40 || x > W + 40) continue;
    it.type === 'atom' ? drawAtom(x, it.y, it.t) : drawHeart(x, it.y, it.t);
  }
  level.cows.forEach(drawCow);
  if (state !== 'win') drawPrincess();
  level.crows.forEach(c => !c.dead && drawCrow(c));
  if (state !== 'win') drawJimShadow();
  drawBoss();
  // Яйца
  for (const e of eggs) {
    ctx.save(); ctx.translate(e.x - camX, e.y); ctx.rotate(gameTime * 8);
    ctx.fillStyle = '#fff7d1'; ctx.strokeStyle = '#111'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, 0, 11, 14, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  if (state !== 'win') drawJim();
  // Плазма
  for (const b of bullets) {
    const x = b.x - camX;
    ctx.save();
    ctx.shadowColor = '#3ff0ff'; ctx.shadowBlur = 18;
    ctx.fillStyle = '#d9fdff';
    ctx.beginPath(); ctx.ellipse(x, b.y, 16, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(63,240,255,0.5)';
    ctx.beginPath(); ctx.ellipse(x - Math.sign(b.vx) * 14, b.y, 22, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  drawParticles();
  for (const f of floaters) {
    ctx.globalAlpha = clamp(f.life, 0, 1);
    outlinedText(f.text, f.x - camX, f.y, f.size, f.color);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawTitleLogo(y) {
  ctx.save();
  ctx.translate(W / 2, y);
  ctx.rotate(-0.03);
  outlinedText('ЧЕРВЯК', 0, -50, 84, '#f6ecd0', 'center', '#111', 'Rubik');
  ctx.font = '900 140px Rubik, Impact, sans-serif';
  const grd = ctx.createLinearGradient(0, 0, 0, 120);
  grd.addColorStop(0, '#ff4a3a'); grd.addColorStop(1, '#a5121b');
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = 16; ctx.strokeStyle = '#111'; ctx.strokeText('ДЖИМ', 0, 60);
  ctx.lineWidth = 8; ctx.strokeStyle = '#7dff3a'; ctx.strokeText('ДЖИМ', 0, 60);
  ctx.fillStyle = grd; ctx.fillText('ДЖИМ', 0, 60);
  // Капли слизи
  ctx.fillStyle = '#7dff3a'; ctx.strokeStyle = '#111'; ctx.lineWidth = 3;
  [-150, -60, 40, 130].forEach((dx, i) => {
    const len = 18 + ((i * 13) % 20) + Math.sin(gameTime * 2 + i) * 4;
    ctx.beginPath(); ctx.moveTo(dx - 7, 112); ctx.lineTo(dx - 5, 112 + len); ctx.arc(dx, 112 + len, 6, Math.PI, 0, true); ctx.lineTo(dx + 7, 112); ctx.fill(); ctx.stroke();
  });
  ctx.restore();
}

function drawTitle() {
  camX = (gameTime * 40) % 3000;
  drawBackground();
  ctx.fillStyle = 'rgba(5,0,20,0.35)'; ctx.fillRect(0, 0, W, H);
  if (RIG) {
    // Джим красуется с бластером
    const P = poseIdle(gameTime);
    P.armF = -0.35 + Math.sin(gameTime * 1.7) * 0.25;
    P.armB = 0.1 + Math.sin(gameTime * 2.6) * 0.06;
    drawJimRig(jimBones(250, 650, 1, 430 / RIG.jim.height, P), false);
    drawPrincessRig(W - 220, 650, 400, gameTime, 'idle');
  }
  if (IMG.cow.width) {
    ctx.save(); ctx.translate(W / 2 + Math.sin(gameTime * 0.7) * 380, 110 + Math.cos(gameTime * 1.3) * 20); ctx.rotate(gameTime);
    ctx.drawImage(IMG.cow, -50, -40, 100, 82); ctx.restore();
  }
  drawTitleLogo(250);
  outlinedText('КОСМИЧЕСКОЕ СПАСЕНИЕ ПРИНЦЕССЫ КАК-ЕЁ-ТАМ', W / 2, 420, 34, '#ff9fd0');
  if (Math.floor(gameTime * 2) % 2 === 0) outlinedText('НАЖМИ ENTER ИЛИ КОСНИСЬ ЭКРАНА', W / 2, 500, 40, '#ffe14a');
  ctx.fillStyle = 'rgba(5,0,20,0.7)'; ctx.beginPath(); ctx.roundRect(W / 2 - 520, 546, 1040, 74, 14); ctx.fill();
  ctx.font = '700 20px Rubik, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#e8e0ff';
  ctx.fillText('← → / A D — бег   •   ↑ / W / ПРОБЕЛ — прыжок (держи в падении — голова-вертолёт)', W / 2, 568);
  ctx.fillText('X / J — плазменный бластер   •   Z / K — удар головой-хлыстом   •   P — пауза   •   M — звук', W / 2, 598);
}

function drawOverlay(title, sub, color) {
  ctx.fillStyle = 'rgba(5,0,20,0.55)'; ctx.fillRect(0, 0, W, H);
  outlinedText(title, W / 2, H / 2 - 50, 96, color);
  if (sub) outlinedText(sub, W / 2, H / 2 + 40, 34, '#fff');
}

function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (state === 'loading') {
    ctx.fillStyle = '#07051a'; ctx.fillRect(0, 0, W, H);
    outlinedText('ЗАГРУЗКА...', W / 2, H / 2, 60, '#ffe14a');
    return;
  }
  if (state === 'title') { drawTitle(); return; }
  drawWorld();
  drawHUD();
  if (state === 'pause') drawOverlay('ПАУЗА', 'Нажми P, чтобы продолжить', '#ffe14a');
  if (state === 'dead') drawOverlay('ОЙ-ОЙ!', 'Осталось жизней: ' + lives, '#ff9fc6');
  if (state === 'gameover') {
    drawOverlay('КОНЕЦ ИГРЫ', 'Очки: ' + score + '  •  ENTER — заново', '#ff4a4a');
  }
  if (state === 'win') drawWin();
}

function drawWin() {
  ctx.fillStyle = 'rgba(5,0,20,0.6)'; ctx.fillRect(0, 0, W, H);
  if (RIG) {
    // Джим ликует: прыжки и машет рукой
    const t = gameTime, hop = Math.abs(Math.sin(t * 4));
    const P = hop > 0.25 ? poseJumpUp(t) : poseIdle(t);
    P.armB = 2.6 + Math.sin(t * 10) * 0.35;
    P.armF = -0.9 + Math.sin(t * 4) * 0.2;
    drawJimRig(jimBones(W / 2 - 110, 680 - hop * 60, 1, 360 / RIG.jim.height, P), false);
    drawPrincessRig(W / 2 + 120, 680, 330, t, 'happy');
  }
  // Сердечки
  for (let i = 0; i < 8; i++) {
    const t = (gameTime * 0.4 + i / 8) % 1;
    ctx.globalAlpha = 1 - t;
    drawHeart(W / 2 + Math.sin(i * 2.1 + gameTime) * 220, 520 - t * 420, gameTime + i);
  }
  ctx.globalAlpha = 1;
  outlinedText('GROOVY!', W / 2, 110, 120, '#b6ff4a');
  outlinedText('Принцесса Как-Её-Там спасена!', W / 2, 200, 44, '#ff9fd0');
  outlinedText('Очки: ' + score + '   •   ENTER — сыграть ещё', W / 2, 258, 32, '#fff');
}

// ---------- Главный цикл ----------
let last = performance.now();
let lastError = null;
function frame(now) {
  const dt = Math.min(1 / 30, Math.max(0, (now - last) / 1000));
  last = now;
  try {
    update(dt);
    render();
  } catch (e) {
    // Не даём игре "зависнуть" из-за одной ошибки — показываем её и продолжаем цикл
    if (!lastError) console.error(e);
    lastError = e;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, H - 40, W, 40);
    ctx.fillStyle = '#ff6b6b'; ctx.font = '16px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('Ошибка: ' + (e && e.message), 12, H - 20);
  }
  for (const k in pressed) pressed[k] = false;
  requestAnimationFrame(frame);
}


// Сразу запускаем цикл (показывает "ЗАГРУЗКА..."), затем ждём картинки и шрифты (не дольше 3 сек.)
requestAnimationFrame(frame);
const fontsReady = (document.fonts && document.fonts.load)
  ? Promise.all(['40px Bangers', '700 40px Rubik', '900 40px Rubik'].map(f => document.fonts.load(f, 'ДЖИМ GROOVY').catch(() => {})))
  : Promise.resolve();
Promise.race([Promise.all([loadAssets(), fontsReady]), new Promise(r => setTimeout(r, 3000))]).then(() => {
  state = 'title';
  stateT = 1;
});
})();
