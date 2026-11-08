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
const JIM_H = 160, JIM_SCALE = JIM_H / 300;

// ---------- Загрузка ассетов ----------
const IMG = {};
const assetList = ['jim.png', 'jim-body.png', 'jim-arm.png', 'princess.png', 'crow.png', 'cow.png', 'bg.jpg'];
function loadAssets() {
  return Promise.all(assetList.map(f => new Promise(res => {
    const i = new Image();
    i.onload = () => res();
    i.onerror = () => res();
    i.src = 'assets/' + f;
    IMG[f.split('.')[0]] = i;
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
  ArrowUp: 'jump', KeyW: 'jump', Space: 'jump', ArrowDown: 'down', KeyS: 'down',
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
// Мышь: свободное прицеливание на 360° и стрельба левой кнопкой.
const mouseAim = { x: W * 0.7, y: H * 0.5, active: false };
let mouseShooting = false;
function setMouseAim(e) {
  const r = cvs.getBoundingClientRect();
  mouseAim.x = (e.clientX - r.left) * W / r.width;
  mouseAim.y = (e.clientY - r.top) * H / r.height;
  mouseAim.active = true;
}
cvs.addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse' || e.pointerType === 'pen' || (e.pointerType === 'touch' && mouseShooting)) setMouseAim(e);
});
cvs.addEventListener('pointerdown', e => {
  initAudio(); pressed.start = true;
  setMouseAim(e);
  // На сенсорном экране можно также удерживать палец на игровом поле и вести прицел.
  if (state === 'play' && (e.button === 0 || e.pointerType === 'touch')) { mouseShooting = true; pressed.shoot = true; }
});
addEventListener('pointerup', () => { mouseShooting = false; });
cvs.addEventListener('pointercancel', () => { mouseShooting = false; });
cvs.addEventListener('pointerleave', () => { mouseShooting = false; });
cvs.addEventListener('contextmenu', e => e.preventDefault());

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
let camX = 0, shake = 0, score = 0, lives = 3, checkpoint = 120, timer = 0, stateT = 0, gameTime = 0;
let muted = false;

const stars = Array.from({ length: 220 }, () => ({ x: Math.random() * 2600, y: Math.random() * H, s: Math.random() * 2 + 0.5, p: Math.random() * 6 }));
const farRocks = Array.from({ length: 26 }, (_, i) => ({ x: i * 420 + rand(0, 200), y: rand(80, 520), r: rand(10, 30), rot: rand(0, 6), vr: rand(-0.5, 0.5) }));

function newPlayer(x) {
  return { x, y: GROUND_Y - 150, w: 54, h: 140, vx: 0, vy: 0, face: 1, onGround: false, coyote: 0, jumpBuf: 0,
    inv: 0, shootCd: 0, shootAnim: 0, muzzleFlash: 0, recoil: 0, aimAngle: 0, whip: 0, whipCd: 0, whipHit: new Set(),
    health: 100, ammo: 120, squash: 0, walkT: 0, stepT: 0, deathT: 0, glide: false, stand: null };
}

function startGame() {
  level = buildLevel();
  player = newPlayer(120);
  bullets = []; eggs = []; particles = []; floaters = [];
  boss = { x: 8700, y: 220, w: 220, h: 110, hp: 24, maxHp: 24, t: 0, eggT: 2, flash: 0, active: false, dead: false, face: -1, dive: 0 };
  princess = { x: 9080, y: GROUND_Y - 160, w: 90, h: 160, saved: false };
  score = 0; lives = 3; checkpoint = 120; camX = 0; gameTime = 0;
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
  player.deathT = 0;
  player.vy = -650;
  player.vx = -player.face * 260;
  player.glide = false;
  player.shootAnim = 0;
  lives--;
  SFX.die();
  burst(player.x + player.w / 2, player.y + 55, '#ff9fc6', 24, 380, 7);
  shake = 18;
  state = lives > 0 ? 'dead' : 'gameover';
  stateT = 0;
}

// ---------- Обновление ----------
function update(dt) {
  gameTime += dt;
  if (pressed.mute) { muted = !muted; if (actx) muted ? actx.suspend() : actx.resume(); }

  if (state === 'title' || state === 'win') {
    stateT += dt;
    if ((pressed.start || pressed.jump) && stateT > 0.6) { startGame(); SFX.groovy(); }
    if (state !== 'title') updateWorld(dt, true);
    return;
  }
  if (state === 'gameover') {
    stateT += dt;
    if ((pressed.start || pressed.jump) && stateT > 0.6) { startGame(); SFX.groovy(); return; }
    updateDeath(dt); updateWorld(dt, true);
    return;
  }
  if (state === 'pause') { if (pressed.pause || pressed.start) state = 'play'; return; }
  if (state === 'dead') {
    stateT += dt;
    updateDeath(dt);
    updateWorld(dt, true);
    if (stateT > 1.6) respawn();
    return;
  }
  if (state === 'play') {
    if (pressed.pause) { state = 'pause'; return; }
    updatePlayer(dt);
    updateWorld(dt, false);
  }
}

function updateDeath(dt) {
  const p = player;
  p.deathT += dt;
  p.vy += 1000 * dt;
  p.x = clamp(p.x + p.vx * dt, 0, WORLD_W - p.w);
  p.y += p.vy * dt;
  p.vx *= Math.pow(0.25, dt);
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
    burst(p.x + p.w / 2, p.y + p.h, '#d8c9ff', 6, 140, 4);
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

  const prevBottom = p.y + p.h;
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
  if (p.onGround && !wasGround) { p.squash = 1; burst(p.x + p.w / 2, p.y + p.h, '#b6ff4a', 5, 120, 4); }
  p.squash = Math.max(0, p.squash - dt * 5);
  const running = p.onGround && Math.abs(p.vx) > 30;
  if (running) {
    p.walkT += dt * Math.abs(p.vx) / 40;
    p.stepT -= dt;
    if (p.stepT <= 0) {
      p.stepT = 0.13;
      burst(p.x + p.w / 2 - p.face * 18, p.y + p.h - 3, '#b7a5d5', 3, 85, 4);
    }
  } else { p.walkT = 0; p.stepT = 0; }

  if (p.y > H + 150) { killPlayer(); return; }

  // Выстрел плазмой: мышь — любой угол, клавиши — 8 направлений.
  p.shootCd -= dt;
  p.shootAnim = Math.max(0, p.shootAnim - dt);
  p.muzzleFlash = Math.max(0, p.muzzleFlash - dt);
  p.recoil = Math.max(0, p.recoil - dt * 8);
  if ((keys.shoot || mouseShooting) && p.ammo > 0) {
    p.aimAngle = getAimAngle(p);
    if (Math.abs(Math.cos(p.aimAngle)) > 0.12) p.face = Math.cos(p.aimAngle) >= 0 ? 1 : -1;
  }
  if ((pressed.shoot || keys.shoot || mouseShooting) && p.shootCd <= 0) {
    if (p.ammo > 0) {
      p.ammo--;
      p.shootCd = 0.14;
      p.aimAngle = getAimAngle(p);
      if (Math.abs(Math.cos(p.aimAngle)) > 0.12) p.face = Math.cos(p.aimAngle) >= 0 ? 1 : -1;
      p.shootAnim = 0.25; p.muzzleFlash = 0.09; p.recoil = 1;
      const m = muzzle(p.aimAngle), cs = Math.cos(p.aimAngle), sn = Math.sin(p.aimAngle);
      bullets.push({ x: m.x, y: m.y, vx: cs * 1150 + p.vx * 0.2, vy: sn * 1150 + p.vy * 0.08,
        angle: p.aimAngle, life: 0.9 });
      SFX.shoot();
      burst(m.x, m.y, '#7ff6ff', 5, 170, 4);
      for (let i = 0; i < 3; i++) particles.push({ x: m.x, y: m.y,
        vx: cs * rand(180, 360) + rand(-50, 50), vy: sn * rand(180, 360) + rand(-50, 50),
        life: 0.18, max: 0.18, color: '#d9fdff', size: rand(2, 5) });
    } else if (pressed.shoot || (mouseShooting && p.shootCd <= -0.25)) {
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
    for (const c of level.crows) if (!c.dead && !p.whipHit.has(c) && overlap(box, hitbox(c))) { p.whipHit.add(c); damageCrow(c, 1, p.face); }
    if (boss.active && !boss.dead && !p.whipHit.has(boss) && overlap(box, bossBox())) { p.whipHit.add(boss); damageBoss(2); }
  }
  p.inv = Math.max(0, p.inv - dt);

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

function getAimAngle(p) {
  // При выстреле мышью направление к курсору всегда важнее клавиш бега.
  if (mouseAim.active && (mouseShooting || !(keys.left || keys.right || keys.jump || keys.down))) {
    return Math.atan2(mouseAim.y - (p.y + 57), mouseAim.x - (p.x + p.w / 2 - camX));
  }
  const ax = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  const ay = (keys.jump ? -1 : 0) + (keys.down ? 1 : 0);
  if (ax || ay) return Math.atan2(ay, ax);
  if (mouseAim.active) return Math.atan2(mouseAim.y - (p.y + 57), mouseAim.x - (p.x + p.w / 2 - camX));
  return p.face > 0 ? 0 : Math.PI;
}
function muzzle(angle) {
  const p = player, cx = p.x + p.w / 2;
  const sx = cx + p.face * 26, sy = p.y + 57;
  return { x: sx + Math.cos(angle) * 46, y: sy + Math.sin(angle) * 46 };
}
const hitbox = c => ({ x: c.x - c.w / 2, y: c.y - c.h / 2, w: c.w, h: c.h });
const bossBox = () => ({ x: boss.x - boss.w / 2 + 20, y: boss.y - boss.h / 2 + 10, w: boss.w - 40, h: boss.h - 20 });

function damageCrow(c, dmg, dir) {
  c.hp -= dmg; c.flash = 0.15; c.x += dir * 18;
  SFX.hit();
  burst(c.x, c.y, '#ffffff', 6, 200, 4);
  if (c.hp <= 0) {
    c.dead = true;
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
  burst(boss.x, boss.y, '#ffffff', 8, 260, 5);
  if (boss.hp <= 0 && !boss.dead) {
    boss.dead = true;
    score += 5000;
    shake = 25;
    SFX.boss(); SFX.groovy();
    floatText(boss.x, boss.y - 60, 'БОСС ПОВЕРЖЕН! +5000', '#ffe14a', 46);
    for (let i = 0; i < 6; i++) burst(boss.x + rand(-80, 80), boss.y + rand(-40, 40), i % 2 ? '#2b2b36' : '#ff7a3a', 22, 420, 8);
  }
}

function updateWorld(dt, passive) {
  updatePlatforms(dt);
  const p = player;
  const pcx = p.x + p.w / 2, pcy = p.y + p.h / 2;

  // Пули
  for (const b of bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    for (const c of level.crows) if (!c.dead && overlap({ x: b.x - 10, y: b.y - 10, w: 20, h: 20 }, hitbox(c))) { damageCrow(c, 1, Math.sign(b.vx) || p.face); b.life = 0; break; }
    if (b.life > 0 && boss.active && !boss.dead && overlap({ x: b.x - 10, y: b.y - 6, w: 20, h: 12 }, bossBox())) { damageBoss(1); b.life = 0; }
  }
  bullets = bullets.filter(b => b.life > 0);

  // Вороны
  for (const c of level.crows) {
    if (c.dead) continue;
    c.t += dt; c.flash = Math.max(0, c.flash - dt);
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
  for (const q of particles) { q.vy += 500 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt; }
  particles = particles.filter(q => q.life > 0);
  for (const f of floaters) { f.y -= 50 * dt; f.life -= dt; }
  floaters = floaters.filter(f => f.life > 0);

  // Камера
  const targetCam = clamp(pcx - W * 0.4, 0, WORLD_W - W);
  camX += (targetCam - camX) * Math.min(1, dt * 6);
  shake = Math.max(0, shake - dt * 40);
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

function drawJim() {
  const p = player, img = IMG.jim;
  const bodyImg = IMG['jim-body'] && IMG['jim-body'].width ? IMG['jim-body'] : img;
  const armImg = IMG['jim-arm'];
  if (!img || !img.width) return;
  if (p.inv > 0 && Math.floor(p.inv * 14) % 2 === 0 && state === 'play') return;
  const cx = p.x + p.w / 2 - camX, bottom = p.y + p.h;
  const sw = img.width * JIM_SCALE, sh = JIM_H;
  const running = state === 'play' && p.onGround && Math.abs(p.vx) > 30;
  const phase = p.walkT * 1.45;
  let sx = 1, sy = 1, rot = 0, bob = 0;

  // Бег: пружинящий шаг, наклон вперёд и пыль из-под ног.
  if (running) {
    bob = Math.abs(Math.sin(phase)) * 8;
    rot = Math.sin(phase) * 0.045 + clamp(p.vx / RUN, -1, 1) * 0.055;
    sy = 1 + Math.sin(phase * 2) * 0.025;
    sx = 1 - Math.sin(phase * 2) * 0.018;
  }
  if (p.squash > 0) { sx = 1 + p.squash * 0.18; sy = 1 - p.squash * 0.15; }
  // Прыжок: растяжение на взлёте и наклон при падении.
  if (!p.onGround && state === 'play') {
    if (p.vy < 0) { sy *= 1.1; sx *= 0.94; rot = clamp(p.vx / 3000, -0.12, 0.12) - 0.045; }
    else { sy *= 0.98; sx *= 1.025; rot = clamp(p.vx / 2800, -0.14, 0.14) + 0.04; }
  }
  if (p.shootAnim > 0) rot -= p.recoil * 0.045;
  if (state === 'dead' || state === 'gameover') { rot = p.deathT * 8; bob = 0; sx = 1; sy = 1; }

  // Мягкая тень и штрихи скорости делают движение заметным даже на статичном спрайте.
  if (p.onGround && state === 'play') {
    ctx.save(); ctx.globalAlpha = 0.25; ctx.fillStyle = '#03010b';
    ctx.beginPath(); ctx.ellipse(cx, bottom + 5, running ? 43 : 34, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  if (running) {
    ctx.save(); ctx.strokeStyle = 'rgba(216,201,255,0.65)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const lx = cx - p.face * (42 + i * 13), ly = bottom - 10 - i * 12;
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx - p.face * (18 + i * 6), ly); ctx.stroke();
    }
    ctx.restore();
  } else if (!p.onGround && state === 'play') {
    ctx.save(); ctx.strokeStyle = 'rgba(127,246,255,0.45)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    const dir = p.vy < 0 ? 1 : -1;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.moveTo(cx + i * 27, bottom + dir * (6 + Math.abs(i) * 7));
      ctx.lineTo(cx + i * 30, bottom + dir * (22 + Math.abs(i) * 8)); ctx.stroke();
    }
    ctx.restore();
  }

  ctx.save();
  ctx.translate(cx, bottom - bob);
  ctx.rotate(rot * p.face);
  ctx.scale(sx * p.face, sy);
  ctx.drawImage(bodyImg, -sw * 0.45, -sh, sw, sh);

  // Рука и бластер вращаются отдельно от тела и следуют за прицелом.
  if (armImg && armImg.width) {
    const px = -sw * 0.45 + 153 / 232 * sw;
    const py = -sh + 145 / 300 * sh;
    const aiming = p.shootAnim > 0 || keys.shoot || mouseShooting;
    // Исходный ствол наклонён на 0.22 радиана — компенсируем это при точном прицеле.
    const localAim = aiming ? (p.face > 0 ? p.aimAngle : Math.PI - p.aimAngle) + 0.22 : 0;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(localAim - p.recoil * 0.12);
    ctx.translate(-Math.cos(localAim) * p.recoil * 6, -Math.sin(localAim) * p.recoil * 6);
    ctx.drawImage(armImg, -sw * 0.45 - px, -sh - py, sw, sh);
    ctx.restore();
  }
  ctx.restore();

  // Яркая вспышка, кольцо и отдача видны при каждом выстреле.
  if (p.muzzleFlash > 0 && state === 'play') {
    const m = muzzle(p.aimAngle), mx = m.x - camX, my = m.y;
    const power = p.muzzleFlash / 0.09, size = 18 + power * 18;
    ctx.save(); ctx.translate(mx, my); ctx.rotate(p.aimAngle);
    ctx.shadowColor = '#65f5ff'; ctx.shadowBlur = 26;
    ctx.fillStyle = 'rgba(86,239,255,0.35)'; ctx.beginPath(); ctx.arc(0, 0, size * 1.25, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#dfffff';
    ctx.beginPath(); ctx.moveTo(size * 1.7, 0); ctx.lineTo(3, -size * 0.45); ctx.lineTo(-4, -size * 0.2);
    ctx.lineTo(-size * 0.65, 0); ctx.lineTo(-4, size * 0.2); ctx.lineTo(3, size * 0.45); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#8ff8ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, size * (1.4 - power * 0.4), 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // Звёзды и вращение во время смерти.
  if (state === 'dead' || state === 'gameover') {
    for (let i = 0; i < 4; i++) {
      const a = p.deathT * 6 + i * Math.PI / 2;
      const x = cx + Math.cos(a) * 55, y = p.y + 15 + Math.sin(a) * 20;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = i % 2 ? '#ffe14a' : '#ff9fc6';
      ctx.beginPath();
      for (let j = 0; j < 10; j++) { const r = j % 2 ? 4 : 10, an = j * Math.PI / 5; ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r); }
      ctx.closePath(); ctx.fill(); ctx.restore();
    }
  }

  // Голова-вертолёт при планировании
  if (p.glide) {
    const hx = cx + p.face * sw * 0.15, hy = p.y + p.h - sh * 0.98;
    ctx.save(); ctx.translate(hx, hy);
    ctx.strokeStyle = 'rgba(255,170,190,0.8)'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    const a = gameTime * 30;
    ctx.beginPath(); ctx.ellipse(0, 0, 46, 8, 0, a % (Math.PI * 2), a % (Math.PI * 2) + 2.2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 0, 46, 8, 0, (a + Math.PI) % (Math.PI * 2), (a + Math.PI) % (Math.PI * 2) + 2.2); ctx.stroke();
    ctx.restore();
  }
  // Хлыст-голова
  if (p.whip > 0) {
    const k = 1 - p.whip / 0.28;
    const len = 190 * Math.sin(Math.min(1, k * 1.4) * Math.PI);
    const hx = cx + p.face * sw * 0.18, hy = p.y + p.h - sh * 0.86;
    ctx.save();
    ctx.lineCap = 'round';
    for (const [w, c] of [[16, '#1a0d12'], [10, '#f2a0a8']]) {
      ctx.strokeStyle = c; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(hx, hy);
      ctx.quadraticCurveTo(hx + p.face * len * 0.5, hy - 40 + k * 60, hx + p.face * len, hy + 10);
      ctx.stroke();
    }
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
    const ex = hx + p.face * len, ey = hy + 6;
    ctx.beginPath(); ctx.arc(ex, ey, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}

function drawCrow(c) {
  const img = IMG.crow;
  const x = c.x - camX;
  if (x < -150 || x > W + 150 || !img.width) return;
  const sw = 150, sh = sw * img.height / img.width;
  const flap = 1 + Math.sin(c.t * 16) * 0.16;
  ctx.save();
  ctx.translate(x, c.y);
  ctx.scale(-c.face, flap);   // спрайт смотрит влево
  if (c.flash > 0) ctx.filter = 'brightness(3)';
  ctx.drawImage(img, -sw / 2, -sh / 2, sw, sh);
  ctx.restore();
}

function drawBoss() {
  if (!boss.active && camX + W < boss.x - 200) return;
  const img = IMG.crow;
  if (!img.width) return;
  const x = boss.x - camX;
  if (boss.dead) return;
  const sw = 330, sh = sw * img.height / img.width;
  const flap = 1 + Math.sin(boss.t * 12) * 0.14;
  ctx.save();
  ctx.translate(x, boss.y);
  ctx.scale(-boss.face, flap);
  ctx.filter = boss.flash > 0 ? 'brightness(3)' : 'hue-rotate(250deg) saturate(2.2)';
  ctx.shadowColor = '#ff3a3a'; ctx.shadowBlur = 25;
  ctx.drawImage(img, -sw / 2, -sh / 2, sw, sh);
  ctx.restore();
}

function drawCow(cow) {
  const img = IMG.cow;
  const x = cow.x - camX;
  if (x < -200 || x > W + 200 || cow.y < -200 || !img.width) return;
  const sw = 120, sh = sw * img.height / img.width;
  ctx.save();
  ctx.translate(x, cow.y + (cow.launched ? 0 : Math.sin(cow.t * 2) * 10));
  ctx.rotate(cow.launched ? cow.rot : Math.sin(cow.t * 1.3) * 0.15);
  ctx.drawImage(img, -sw / 2, -sh / 2, sw, sh);
  ctx.restore();
}

function drawPrincess() {
  const img = IMG.princess;
  const x = princess.x - camX;
  if (x < -200 || x > W + 200 || !img.width) return;
  const sh = 170, sw = sh * img.width / img.height;
  const bob = Math.sin(gameTime * 3) * 3;
  ctx.save();
  ctx.translate(x, GROUND_Y + bob * 0.2);
  ctx.drawImage(img, -sw / 2, -sh, sw, sh);
  ctx.restore();
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
  const msg = boss.dead ? 'Мой герой! ♥' : 'Помогите, Джим!';
  ctx.font = '22px Rubik, sans-serif';
  const tw = ctx.measureText(msg).width + 30;
  const by = GROUND_Y - 240 + bob;
  ctx.save();
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#111'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(x - tw / 2, by - 24, tw, 44, 18); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 8, by + 19); ctx.lineTo(x + 2, by + 36); ctx.lineTo(x + 12, by + 19); ctx.fill();
  ctx.fillStyle = '#d6266c'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '700 22px Rubik, sans-serif';
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
  drawBoss();
  // Яйца
  for (const e of eggs) {
    ctx.save(); ctx.translate(e.x - camX, e.y); ctx.rotate(gameTime * 8);
    ctx.fillStyle = '#fff7d1'; ctx.strokeStyle = '#111'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, 0, 11, 14, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  if (state !== 'win') drawJim();
  // Плазма летит и отрисовывается по фактическому углу выстрела.
  for (const b of bullets) {
    const x = b.x - camX;
    ctx.save(); ctx.translate(x, b.y); ctx.rotate(b.angle || 0);
    ctx.shadowColor = '#3ff0ff'; ctx.shadowBlur = 18;
    const trail = ctx.createLinearGradient(-42, 0, 16, 0);
    trail.addColorStop(0, 'rgba(63,240,255,0)'); trail.addColorStop(1, 'rgba(63,240,255,0.75)');
    ctx.fillStyle = trail; ctx.beginPath(); ctx.ellipse(-15, 0, 32, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#67f3ff'; ctx.beginPath(); ctx.ellipse(0, 0, 18, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e7ffff'; ctx.beginPath(); ctx.ellipse(4, 0, 12, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  for (const q of particles) {
    ctx.globalAlpha = clamp(q.life / q.max * 1.4, 0, 1);
    ctx.fillStyle = q.color;
    ctx.fillRect(q.x - camX - q.size / 2, q.y - q.size / 2, q.size, q.size);
  }
  ctx.globalAlpha = 1;
  for (const f of floaters) {
    ctx.globalAlpha = clamp(f.life, 0, 1);
    outlinedText(f.text, f.x - camX, f.y, f.size, f.color);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  if (mouseAim.active && state === 'play') drawCrosshair();
}

function drawCrosshair() {
  const x = mouseAim.x, y = mouseAim.y, pulse = 1 + Math.sin(gameTime * 6) * 0.08;
  ctx.save(); ctx.translate(x, y); ctx.scale(pulse, pulse);
  ctx.strokeStyle = 'rgba(216,255,62,0.9)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * 18, Math.sin(a) * 18);
    ctx.lineTo(Math.cos(a) * 25, Math.sin(a) * 25); ctx.stroke();
  }
  ctx.fillStyle = '#d8ff3e'; ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI * 2); ctx.fill();
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
  const jim = IMG.jim, pr = IMG.princess;
  if (jim.width) {
    ctx.save(); ctx.translate(230, 640 + Math.sin(gameTime * 2) * 8);
    const h = 430, w = h * jim.width / jim.height;
    ctx.drawImage(jim, -w / 2, -h, w, h);
    ctx.restore();
  }
  if (pr.width) {
    const h = 400, w = h * pr.width / pr.height;
    ctx.save(); ctx.translate(W - 220, 640 + Math.sin(gameTime * 2 + 1) * 8);
    ctx.drawImage(pr, -w / 2, -h, w, h); ctx.restore();
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
  ctx.fillText('ЛКМ / X / J — огонь   •   МЫШЬ — прицел 360°   •   S / ↓ — вниз   •   Z / K — хлыст   •   P — пауза', W / 2, 598);
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
  const jim = IMG.jim, pr = IMG.princess;
  const bob = Math.sin(gameTime * 3) * 6;
  if (jim.width) { const h = 360, w = h * jim.width / jim.height; ctx.drawImage(jim, W / 2 - w + 20, 680 - h + bob, w, h); }
  if (pr.width) {
    const h = 330, w = h * pr.width / pr.height;
    ctx.drawImage(pr, W / 2 + 10, 680 - h - bob, w, h);
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
