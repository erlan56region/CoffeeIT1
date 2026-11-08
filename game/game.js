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
const GROUND_Y = 600;
let WORLD_W = 9300;
const JIM_H = 160, JIM_SCALE = JIM_H / 300;

// ---------- Загрузка ассетов ----------
const IMG = {};
const assetList = [
  'jim.png', 'jim-body.png', 'jim-arm.png', 'jim-face.png', 'princess.png', 'crow.png', 'cow.png', 'bg.jpg',
  ...Array.from({ length: 4 }, (_, i) => `idle-${i}.png`),
  ...Array.from({ length: 17 }, (_, i) => `run-${i}.png`),
  'jump-rise.png', 'jump-top.png', 'jump-fall.png', 'land.png',
  ...Array.from({ length: 4 }, (_, i) => `shoot-${i}.png`),
  ...Array.from({ length: 4 }, (_, i) => `death-${i}.png`)
];
function loadAssets() {
  return Promise.all(assetList.map(f => new Promise(res => {
    const i = new Image();
    i.onload = () => res();
    i.onerror = () => res();
    i.external = /^(idle|run|jump|land|shoot|death)-/.test(f);
    i.externalKind = f.split('-')[0];
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
  KeyQ: 'weaponPrev', KeyE: 'weaponNext', Digit1: 'weapon1', Digit2: 'weapon2', Digit3: 'weapon3',
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
  if (state === 'title') {
    const chosen = titleStageAt(mouseAim.x, mouseAim.y);
    if (chosen >= 0) { selectedStage = chosen; startGame(chosen); SFX.groovy(); }
  }
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
  const generated = Campaign.build(stageIndex);
  WORLD_W = generated.cfg.worldW;
  generated.plats.forEach(p => { p.img = makeRock(p.w, p.h, !p.ground, p.seed); p.dx = 0; });
  return generated;
}

function buildLegacyLevel() {
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
let level, player, bullets, eggs, particles, floaters, boss, princess, race;
let camX = 0, shake = 0, score = 0, lives = 3, checkpoint = 120, timer = 0, stateT = 0, gameTime = 0;
let stageIndex = 0, selectedStage = 0, muted = false;
let unlockedWeapons = [true, false, false];

const stars = Array.from({ length: 220 }, () => ({ x: Math.random() * 2600, y: Math.random() * H, s: Math.random() * 2 + 0.5, p: Math.random() * 6 }));
const farRocks = Array.from({ length: 26 }, (_, i) => ({ x: i * 420 + rand(0, 200), y: rand(80, 520), r: rand(10, 30), rot: rand(0, 6), vr: rand(-0.5, 0.5) }));

function newPlayer(x) {
  return { x, y: GROUND_Y - 150, w: 54, h: 140, vx: 0, vy: 0, face: 1, onGround: false, coyote: 0, jumpBuf: 0,
    inv: 0, shootCd: 0, shootAnim: 0, muzzleFlash: 0, recoil: 0, aimAngle: 0, weapon: 0, crouch: false,
    whip: 0, whipCd: 0, whipHit: new Set(), health: 100, ammo: 120, squash: 0, walkT: 0, stepT: 0,
    deathT: 0, glide: false, stand: null };
}

function startGame(index = selectedStage) {
  score = 0; lives = 3; gameTime = 0; unlockedWeapons = [true, false, false];
  loadStage(index);
}

function loadStage(index) {
  stageIndex = index;
  level = buildLevel();
  player = newPlayer(120);
  bullets = []; eggs = []; particles = []; floaters = [];
  boss = { x: 8700, y: 220, w: 220, h: 110, hp: 36, maxHp: 36, t: 0, eggT: 2, flash: 0, active: false, dead: false, face: -1, dive: 0 };
  princess = { x: WORLD_W - 150, y: GROUND_Y - 160, w: 90, h: 160, saved: false };
  checkpoint = 120; camX = 0; stateT = 0;
  race = level.cfg.race ? createRace() : null;
  state = 'play';
  floatText(400, 180, `${index + 1}/${Campaign.STAGES.length} · ${level.cfg.short}`, level.cfg.color, 42);
}

function respawn() {
  const ammo = player.ammo, weapon = player.weapon;
  player = newPlayer(checkpoint);
  player.ammo = Math.max(ammo, 60); player.weapon = weapon;
  player.inv = 2;
  bullets = []; eggs = [];
  if (race) race = createRace();
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
  player.recoil = 0;
  player.muzzleFlash = 0;
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
    if (state === 'title' && pressed.left) selectedStage = (selectedStage + Campaign.STAGES.length - 1) % Campaign.STAGES.length;
    if (state === 'title' && pressed.right) selectedStage = (selectedStage + 1) % Campaign.STAGES.length;
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
  if (state === 'stageclear') {
    stateT += dt;
    if ((pressed.start || pressed.jump || stateT > 4) && stateT > 0.6) {
      loadStage(Math.min(Campaign.STAGES.length - 1, stageIndex + 1)); SFX.groovy();
    }
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
    if (race) updateRace(dt);
    else { updatePlayer(dt); updateWorld(dt, false); }
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
  const wantsCrouch = p.onGround && keys.down;
  if (wantsCrouch !== p.crouch) {
    const bottom = p.y + p.h;
    p.crouch = wantsCrouch; p.h = wantsCrouch ? 86 : 140; p.y = bottom - p.h;
  }
  let dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  const mechanic=level.cfg.mechanic;
  if(mechanic==='mirror'&&p.x>2800&&p.x<6100)dir*=-1;
  if(level.crows.some(c=>c.grabMode))dir*=.25;
  const accel = mechanic==='ice'&&p.onGround ? 430 : p.onGround ? 3200 : 1900;
  const target = dir * RUN * (p.crouch ? 0.3 : 1);
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
  const gravityScale=mechanic==='moon'?.52:1;
  if (!keys.jump && p.vy < 0) p.vy += GRAVITY * 1.4 * gravityScale * dt;
  p.vy += GRAVITY * gravityScale * dt;
  // Голова-вертолёт: держи прыжок в падении, чтобы планировать
  p.glide = keys.jump && p.vy > 0 && !p.onGround;
  if (p.glide) p.vy = Math.min(p.vy, GLIDE_FALL);
  p.vy = Math.min(p.vy, 1400);

  // Едем на движущейся платформе
  if (p.onGround && p.stand && p.stand.dx) p.x += p.stand.dx;
  if(mechanic==='belts'&&p.onGround)p.x+=(Math.floor(p.x/950)%2?1:-1)*85*dt;
  if(mechanic==='wind')p.vx+=Math.sin(gameTime*.9)*420*dt;

  p.x = clamp(p.x + p.vx * dt, 0, WORLD_W - p.w);
  if (boss.active && !boss.dead) p.x = Math.max(p.x, 7900);
  if (!puzzleSolved()) {
    for (const d of level.doors) {
      if (p.x + p.w > d.x && p.x < d.x + d.w && p.y + p.h > d.y) {
        p.x = p.vx >= 0 ? d.x - p.w : d.x + d.w; p.vx = 0;
        if (pressed.right || pressed.left) floatText(d.x, d.y - 25, 'ШЛЮЗ ЗАБЛОКИРОВАН', '#ff6b6b', 24);
      }
    }
  }

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
  if(mechanic==='springs'&&p.onGround&&p.stand&&!p.stand.ground){p.vy=-1120;p.onGround=false;SFX.jump();burst(p.x+p.w/2,p.y+p.h,'#b6ff4a',10,220,5);}
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

  updateShooting(p, dt);
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
    for (const s of level.switches) if (Math.abs(s.x-(box.x+box.w/2))<box.w/2+35 && Math.abs(s.y-(box.y+45))<80) activateSwitch(s);
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

function updateShooting(p, dt) {
  let requested = -1;
  if (pressed.weapon1) requested = 0;
  if (pressed.weapon2) requested = 1;
  if (pressed.weapon3) requested = 2;
  if (pressed.weaponNext || pressed.weaponPrev) {
    const step = pressed.weaponNext ? 1 : -1;
    for (let i = 1; i <= 3; i++) {
      const candidate = (p.weapon + step * i + 6) % 3;
      if (unlockedWeapons[candidate]) { requested = candidate; break; }
    }
  }
  if (requested >= 0) {
    if (unlockedWeapons[requested]) { p.weapon = requested; SFX.pickup(); }
    else floatText(p.x + p.w / 2, p.y - 15, 'ОРУЖИЕ ЕЩЁ НЕ НАЙДЕНО', '#ff9fc6', 22);
  }
  const weapon = Campaign.WEAPONS[p.weapon];
  p.shootCd -= dt;
  p.shootAnim = Math.max(0, p.shootAnim - dt);
  p.muzzleFlash = Math.max(0, p.muzzleFlash - dt);
  p.recoil = Math.max(0, p.recoil - dt * 6);
  if ((keys.shoot || mouseShooting) && p.ammo >= weapon.cost) {
    p.aimAngle = getAimAngle(p);
    if (Math.abs(Math.cos(p.aimAngle)) > 0.12) p.face = Math.cos(p.aimAngle) >= 0 ? 1 : -1;
  }
  if ((pressed.shoot || keys.shoot || mouseShooting) && p.shootCd <= 0) {
    if (p.ammo >= weapon.cost) {
      p.ammo -= weapon.cost; p.shootCd = weapon.cooldown;
      p.aimAngle = getAimAngle(p);
      if (Math.abs(Math.cos(p.aimAngle)) > 0.12) p.face = Math.cos(p.aimAngle) >= 0 ? 1 : -1;
      p.shootAnim = 0.32; p.muzzleFlash = 0.12; p.recoil = 1;
      const m = muzzle(p.aimAngle);
      for (let i = 0; i < weapon.count; i++) {
        const angle = p.aimAngle + (i - (weapon.count - 1) / 2) * weapon.spread;
        bullets.push({x:m.x,y:m.y,vx:Math.cos(angle)*weapon.speed+p.vx*.15,vy:Math.sin(angle)*weapon.speed+p.vy*.05,
          angle,damage:weapon.damage,pierce:weapon.pierce,color:weapon.color,hit:new Set(),life:1.05});
      }
      SFX.shoot(); burst(m.x, m.y, weapon.color, weapon.pierce ? 12 : 5, 190, 4);
    } else if (pressed.shoot || p.shootCd <= -0.25) {
      floatText(p.x + p.w / 2, p.y - 10, 'НУЖНА ПЛАЗМА!', '#ff6b6b', 26); p.shootCd = 0.4;
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
const GUN_TIPS = [[.9,.43],[.88,.45],[.9,.35],[.9,.4]];
function muzzle(angle) {
  const p = player, cx = p.x + p.w / 2;
  const firing = state === 'play' && (p.shootAnim > 0 || keys.shoot || mouseShooting);
  const frame = Math.floor(gameTime * 12) % 4, img = IMG[`shoot-${frame}`];
  if (firing && img && img.width) {
    // The point is taken from the visible gun tip and transformed with the sprite.
    const scale = 3.2, fw = img.width * scale, fh = img.height * scale;
    const tip = GUN_TIPS[frame], gx = (tip[0] - .5) * fw, gy = -(1 - tip[1]) * fh;
    const localAim = p.face > 0 ? angle : Math.PI - angle;
    const rot = (localAim * .35 - p.recoil * .12) * p.face;
    const lx = gx * p.face, cs = Math.cos(rot), sn = Math.sin(rot);
    return {x:cx - p.face*p.recoil*8 + lx*cs - gy*sn, y:p.y+p.h + lx*sn + gy*cs};
  }
  const sx = cx + p.face * 26, sy = p.y + 57;
  return { x: sx + Math.cos(angle) * 46, y: sy + Math.sin(angle) * 46 };
}
const hitbox = c => ({ x: c.x - c.w / 2, y: c.y - c.h / 2, w: c.w, h: c.h });
const bossBox = () => ({ x: boss.x - boss.w / 2 + 20, y: boss.y - boss.h / 2 + 10, w: boss.w - 40, h: boss.h - 20 });

function damageCrow(c, dmg, dir) {
  const enemyType=Campaign.ENEMIES[c.typeId];
  if(enemyType&&enemyType.behavior==='shield')dmg=Math.max(.5,dmg*.5);
  if(c.grabMode){c.grabMode=null;c.grabCooldown=2;}
  c.hp -= dmg; c.flash = 0.15; c.x += dir * 18;
  SFX.hit();
  burst(c.x, c.y, '#ffffff', 6, 200, 4);
  if (c.hp <= 0) {
    c.dead = true;
    score += 100;
    floatText(c.x, c.y - 30, '+100');
    burst(c.x, c.y, '#2b2b36', 22, 320, 7);
    burst(c.x, c.y, '#ffb347', 8, 220, 4);
    if(enemyType&&enemyType.behavior==='splitter'&&!c.split){
      for(const side of [-1,1]){const type=Campaign.ENEMIES[2];level.crows.push({x:c.x+side*35,y:c.y,bx:c.x+side*90,by:c.y,w:48,h:32,hp:1,maxHp:1,t:0,state:'patrol',st:.3,vx:0,vy:0,flash:0,face:side,dead:false,typeId:2,attackT:2,grabMode:null,grabT:0,grabCooldown:0,grabSide:0,split:true});}
      floatText(c.x,c.y-45,'РАЗДЕЛИЛСЯ!','#a8eaff',23);
    }
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

function enemyShoot(c, tx, ty, speed) {
  const d=Math.hypot(tx-c.x,ty-c.y)||1;
  eggs.push({x:c.x,y:c.y,vx:(tx-c.x)/d*speed,vy:(ty-c.y)/d*speed,life:4,enemyLaser:true});
}

function puzzleSolved() {
  if (!level || level.cfg.puzzle === 'boss' || level.cfg.race) return true;
  const keysReady = level.keysFound >= level.keyCount;
  const switchesReady = level.switches.every(s => s.active);
  return keysReady && switchesReady;
}
function activateSwitch(s) {
  if (s.active) return;
  if (level.cfg.puzzle === 'sequence') {
    const expected = level.sequenceOrder[level.sequencePos];
    if (s.order !== expected) {
      level.switches.forEach(sw => sw.active = false); level.sequencePos = 0;
      floatText(s.x,s.y-65,`НЕВЕРНО! НУЖЕН ${level.sequenceOrder[0]}`,'#ff6b6b',25); SFX.hurt(); return;
    }
    level.sequencePos++;
  }
  s.active = true; score += 250; SFX.groovy(); burst(s.x,s.y,'#b6ff4a',18,230,5);
  floatText(s.x,s.y-65,`ТЕРМИНАЛ ${s.order} · OK`,'#b6ff4a',25);
}
function completeStage() {
  if (state !== 'play') return;
  score += 1500 + Math.max(0, Math.floor(player.health)) * 10;
  state = 'stageclear'; stateT = 0; SFX.win();
}
function updateMechanics(dt) {
  const p=player,pcx=p.x+p.w/2;
  level.portalCooldown=Math.max(0,(level.portalCooldown||0)-dt);
  for(const m of level.mechanics||[]){
    const cycle=(gameTime+m.phase)%3.6;
    if(m.kind==='laser'&&cycle<1.35&&Math.abs(pcx-m.x)<18&&p.y+p.h>80)hurtPlayer(14,m.x);
    if((m.kind==='vents'||m.kind==='lava')&&cycle<1.15&&Math.abs(pcx-m.x)<48&&p.y+p.h>GROUND_Y-220){
      hurtPlayer(m.kind==='lava'?24:13,m.x);if(m.kind==='lava')p.vy=-650;
    }
    if(m.kind==='crusher'){
      const my=70+(Math.sin(gameTime*1.7+m.phase)+1)*145;
      if(overlap(p,{x:m.x-48,y:my,w:96,h:180}))hurtPlayer(22,m.x);
    }
    if(m.kind==='poison'&&pcx>m.x&&pcx<m.x+m.w&&p.y+p.h>GROUND_Y-30)hurtPlayer(10,m.x+m.w/2);
    if(m.kind==='portal'&&level.portalCooldown<=0&&Math.abs(pcx-m.x)<48&&p.onGround){
      const other=level.mechanics[m.pair];p.x=other.x+90;p.y=GROUND_Y-p.h-10;p.vx=300;level.portalCooldown=2;
      SFX.groovy();burst(other.x,GROUND_Y-100,'#df70ff',28,350,7);
    }
  }
}
function updateFriendsAndPuzzles(dt) {
  const pcx=player.x+player.w/2;
  for (const s of level.switches) {
    s.lockedFlash=Math.max(0,s.lockedFlash-dt);
    if (level.cfg.puzzle !== 'sequence' && Math.abs(pcx-s.x)<55 && Math.abs(player.y+player.h/2-s.y)<100) activateSwitch(s);
  }
  for (const f of level.friends) {
    f.t+=dt;
    if (!f.met && Math.abs(pcx-f.x)<85) {
      f.met=true; const friend=Campaign.FRIENDS[f.id];
      if (friend.bonus==='ammo')player.ammo+=75;
      if (friend.bonus==='heal')player.health=Math.min(100,player.health+50);
      if (friend.bonus==='score')score+=1000;
      if (friend.bonus==='life')lives++;
      if (friend.bonus==='spread'){unlockedWeapons[1]=true;player.weapon=1;}
      if (friend.bonus==='rail'){unlockedWeapons[2]=true;player.weapon=2;}
      if (friend.bonus==='checkpoint')checkpoint=f.x;
      SFX.heart(); floatText(f.x,f.y-70,friend.message,friend.color,24);
    }
  }
  if (!level.cfg.boss && pcx>level.exitX) {
    if (puzzleSolved()) completeStage();
    else if (!level.lockMsgT || level.lockMsgT<=0) {
      floatText(level.exitX,GROUND_Y-210,'ШЛЮЗ ЗАКРЫТ · РЕШИ ГОЛОВОЛОМКУ','#ff9fc6',25); level.lockMsgT=2;
    }
  }
  level.lockMsgT=Math.max(0,(level.lockMsgT||0)-dt);
}

function updateWorld(dt, passive) {
  updatePlatforms(dt);
  const p = player;
  const pcx = p.x + p.w / 2, pcy = p.y + p.h / 2;

  // Пули
  for (const b of bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    for (const c of level.crows) {
      if (!c.dead && (!b.hit || !b.hit.has(c)) && overlap({x:b.x-12,y:b.y-12,w:24,h:24},hitbox(c))) {
        if (b.hit) b.hit.add(c); damageCrow(c,b.damage||1,Math.sign(b.vx)||p.face);
        if (!b.pierce) { b.life=0; break; }
      }
    }
    if (b.life > 0 && boss.active && !boss.dead && (!b.hit || !b.hit.has(boss)) && overlap({x:b.x-12,y:b.y-12,w:24,h:24},bossBox())) {
      if (b.hit) b.hit.add(boss); damageBoss(b.damage||1); if (!b.pierce) b.life=0;
    }
  }
  bullets = bullets.filter(b => b.life > 0);

  // Вороны
  for (const c of level.crows) {
    if (c.dead) continue;
    c.t += dt; c.flash = Math.max(0, c.flash - dt);
    const dx = pcx - c.x, dy = pcy - c.y;
    const type = Campaign.ENEMIES[c.typeId] || Campaign.ENEMIES[0];
    c.attackT -= dt; c.grabCooldown=Math.max(0,(c.grabCooldown||0)-dt);
    if(c.grabMode){
      c.grabT-=dt;
      const head=c.grabMode==='head',tx=pcx+(head?0:-p.face*42),ty=p.y+(head?12:p.h-25);
      c.x+=(tx-c.x)*Math.min(1,dt*12);c.y+=(ty-c.y)*Math.min(1,dt*12);
      p.x=clamp(p.x+(head?p.face:-p.face)*55*dt,0,WORLD_W-p.w);p.y=Math.max(30,p.y-42*dt);p.vx*=.9;
      if(c.grabT<=0){c.grabMode=null;c.grabCooldown=1.4;c.state='return';c.y-=55;p.vy=90;floatText(pcx,p.y-25,'ОТПУСТИЛ!','#ffe14a',24);}
      continue;
    }
    if (type.behavior === 'grabber') {
      const d=Math.hypot(dx,dy)||1;
      if(!passive&&c.grabCooldown<=0&&d<650){c.x+=dx/d*type.speed*dt;c.y+=dy/d*type.speed*dt;c.face=Math.sign(dx)||-1;}
      else{c.x+=(c.bx-c.x)*dt;c.y+=(c.by-c.y)*dt;}
    } else if (type.behavior === 'healer') {
      c.x=c.bx+Math.sin(c.t)*90;c.y=c.by+Math.cos(c.t*2)*35;
      if(c.attackT<=0){const ally=level.crows.find(a=>!a.dead&&a!==c&&a.hp<a.maxHp&&Math.abs(a.x-c.x)<500);if(ally){ally.hp=Math.min(ally.maxHp,ally.hp+2);burst(ally.x,ally.y,'#6bff5a',8,120,4);}c.attackT=2.5;}
    } else if (type.behavior === 'leaper') {
      c.x+=clamp(dx,-1,1)*type.speed*.55*dt;c.y=c.by-Math.abs(Math.sin(c.t*2.4))*180;c.face=Math.sign(dx)||-1;
    } else if (type.behavior === 'orbit') {
      c.x=c.bx+Math.cos(c.t*1.5)*135; c.y=c.by+Math.sin(c.t*2.1)*95; c.face=Math.sign(dx)||-1;
    } else if (type.behavior === 'turret') {
      c.y=c.by+Math.sin(c.t*2)*8; c.face=Math.sign(dx)||-1;
      if (!passive && c.attackT<=0 && Math.abs(dx)<750) { enemyShoot(c,pcx,pcy,430); c.attackT=1.7; }
    } else if (type.behavior === 'hunter' || type.behavior === 'charger') {
      const d=Math.hypot(dx,dy)||1, chase=!passive&&d<(type.behavior==='hunter'?650:430);
      const tx=chase?dx/d*type.speed:Math.cos(c.t)*110, ty=chase?dy/d*type.speed:Math.sin(c.t*2)*25;
      c.x+=tx*dt; c.y+=ty*dt; c.face=Math.sign(tx)||-1;
    } else {
      if (c.state === 'patrol') {
        const nx = c.bx + Math.sin(c.t * 0.9) * 110;
        c.face = nx > c.x ? 1 : -1;
        c.x = nx; c.y = c.by + Math.sin(c.t * 2.3) * 22;
        c.st -= dt;
        if (!passive && Math.abs(dx) < 430 && Math.abs(dy) < 400 && c.st <= 0) {
          c.state = 'swoop'; c.st = 1.4;
          const d = Math.hypot(dx, dy) || 1;
          c.vx = dx / d * type.speed; c.vy = dy / d * type.speed;
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
      if (type.behavior==='bomber'&&!passive&&c.attackT<=0&&Math.abs(dx)<600) { enemyShoot(c,pcx,pcy,250); c.attackT=2.2; }
    }
    if (!passive && overlap(hitbox(c), p)) {
      if(type.behavior==='grabber'&&c.grabCooldown<=0){
        c.grabMode=c.grabSide?'head':'butt';c.grabSide=1-c.grabSide;c.grabT=3;
        hurtPlayer(6,c.x);floatText(pcx,p.y-30,c.grabMode==='head'?'ВОРОН ТЯНЕТ ЗА ГОЛОВУ!':'ВОРОН КУСАЕТ ЗА ЗАДНИЦУ!','#ff9fc6',25);
      }else if(type.behavior==='thief'){
        const stolen=Math.min(15,p.ammo);p.ammo-=stolen;c.x-=Math.sign(dx)*100;c.attackT=1.5;
        if(stolen)floatText(pcx,p.y-20,`КРЫСА УКРАЛА ${stolen} ⚛`,'#ff9b52',23);hurtPlayer(5,c.x);
      }else if(type.behavior!=='grabber')hurtPlayer(15,c.x);
    }
  }

  // Предметы
  for (const it of level.items) {
    if (it.taken) continue;
    it.t += dt;
    if (it.drop) { it.vy += 900 * dt; it.y += it.vy * dt; for (const pl of level.plats) if (it.x > pl.x && it.x < pl.x + pl.w && it.y + 20 >= pl.y && it.y + 20 - it.vy * dt <= pl.y + 4) { it.y = pl.y - 20; it.vy = 0; it.drop = false; } if (it.y > H + 50) it.taken = true; }
    if (!passive && Math.abs(it.x - pcx) < 46 && Math.abs(it.y - pcy) < 86) {
      it.taken = true;
      if (it.type === 'atom') { p.ammo += 25; score += 25; SFX.pickup(); floatText(it.x, it.y - 20, '+25 ⚛', '#7ff6ff', 26); burst(it.x, it.y, '#7ff6ff', 10, 200, 4); }
      else if (it.type === 'key') { level.keysFound++; score += 300; SFX.groovy(); floatText(it.x,it.y-25,`КЛЮЧ ${level.keysFound}/${level.keyCount}`,'#ffe14a',28); burst(it.x,it.y,'#ffe14a',18,240,5); }
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
  if (level.cfg.boss && !boss.active && pcx > 7950) {
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
    e.vy += (e.enemyLaser ? 0 : 900) * dt; e.x += e.vx * dt; e.y += e.vy * dt; e.life -= dt;
    if (!e.enemyLaser && e.y > GROUND_Y - 12) { e.life = 0; burst(e.x, GROUND_Y - 10, '#fff7d1', 12, 220, 5); burst(e.x, GROUND_Y - 10, '#ffcf3f', 6, 160, 4); }
    if (!passive && e.life > 0 && Math.abs(e.x - pcx) < 40 && Math.abs(e.y - pcy) < 75) { e.life = 0; hurtPlayer(15, e.x); burst(e.x, e.y, '#ffcf3f', 12, 220, 5); }
    for (const b of bullets) if (e.life > 0 && Math.abs(b.x - e.x) < 22 && Math.abs(b.y - e.y) < 22) { e.life = 0; b.life = 0; score += 10; burst(e.x, e.y, '#fff7d1', 10, 200, 4); }
  }
  eggs = eggs.filter(e => e.life > 0);

  if (!passive) { updateMechanics(dt); updateFriendsAndPuzzles(dt); }

  // Принцесса
  if (level.cfg.boss && !passive && boss.dead && !princess.saved && Math.abs(princess.x - pcx) < 90) {
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


// ---------- Космическая гонка на скутере ----------
function createRace() {
  player.x=280; player.y=300; player.w=64; player.h=140; player.vx=0; player.vy=0; player.onGround=false;
  return {distance:0,finish:10000,speed:400,time:0,spawnT:.5,obstacles:[],seed:77};
}
function updateRace(dt) {
  const p=player,r=race; r.time+=dt; camX=0;
  const targetSpeed=keys.right?680:keys.left?250:430;
  r.speed+=(targetSpeed-r.speed)*Math.min(1,dt*2.5);
  r.distance+=r.speed*dt;
  const dx=(keys.right?1:0)-(keys.left?1:0),dy=(keys.jump?-1:0)+(keys.down?1:0);
  p.x=clamp(p.x+dx*310*dt,120,790); p.y=clamp(p.y+dy*360*dt,85,535);
  p.vx=dx*200; p.vy=dy*200; p.inv=Math.max(0,p.inv-dt);
  updateShooting(p,dt);
  r.spawnT-=dt;
  if(r.spawnT<=0){
    r.spawnT=Math.max(.28,1.05-r.time*.006);
    const roll=Math.random(),type=roll<.16?'fuel':roll<.42?'crow':'asteroid';
    r.obstacles.push({x:W+100,y:rand(95,625),r:type==='asteroid'?rand(22,48):30,type,rot:rand(0,6),dead:false,hp:type==='asteroid'?2:1});
  }
  for(const o of r.obstacles){
    o.x-=r.speed*dt; o.rot+=dt*2;
    if(o.dead)continue;
    const d=Math.hypot(o.x-(p.x+p.w/2),o.y-(p.y+p.h/2));
    if(d<o.r+32){
      if(o.type==='fuel'){o.dead=true;p.ammo+=20;score+=150;SFX.pickup();floatText(o.x,o.y-35,'+ТОПЛИВО','#7ff6ff',24);}
      else {o.dead=true;hurtPlayer(18,o.x);r.speed*=.65;}
    }
  }
  for(const b of bullets){
    b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;
    for(const o of r.obstacles){
      if(!o.dead&&o.type!=='fuel'&&Math.hypot(b.x-o.x,b.y-o.y)<o.r+12){
        o.hp-=(b.damage||1);if(!b.pierce)b.life=0;
        if(o.hp<=0){o.dead=true;score+=200;burst(o.x,o.y,'#ff9b52',18,280,6);}break;
      }
    }
  }
  bullets=bullets.filter(b=>b.life>0&&b.x<W+100&&b.y>-100&&b.y<H+100);
  r.obstacles=r.obstacles.filter(o=>o.x>-120&&!o.dead);
  for(const q of particles){q.x+=q.vx*dt-r.speed*dt*.2;q.y+=q.vy*dt;q.life-=dt;}
  particles=particles.filter(q=>q.life>0);
  for(const f of floaters){f.y-=40*dt;f.life-=dt;}floaters=floaters.filter(f=>f.life>0);
  shake=Math.max(0,shake-dt*40);
  if(r.distance>=r.finish)completeStage();
}
function drawRace() {
  const r=race,g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#080824');g.addColorStop(1,'#331257');
  ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  for(const s of stars){
    const x=((s.x-r.time*r.speed*.7+s.p*300)%1500+1500)%1500-100;
    ctx.strokeStyle=`rgba(255,255,255,${.25+s.s*.18})`;ctx.lineWidth=s.s;
    ctx.beginPath();ctx.moveTo(x,s.y);ctx.lineTo(x+25+r.speed*.05,s.y);ctx.stroke();
  }
  // Ringed planet and race gates emphasize forward speed.
  ctx.save();ctx.translate(1020,180);ctx.fillStyle='#d49562';ctx.beginPath();ctx.arc(0,0,95,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#ffe0a0';ctx.lineWidth=16;ctx.beginPath();ctx.ellipse(0,0,160,35,-.25,0,Math.PI*2);ctx.stroke();ctx.restore();
  for(const o of r.obstacles){
    ctx.save();ctx.translate(o.x,o.y);ctx.rotate(o.rot);
    if(o.type==='fuel'){
      ctx.strokeStyle='#7ff6ff';ctx.lineWidth=7;ctx.shadowColor='#7ff6ff';ctx.shadowBlur=18;
      ctx.beginPath();ctx.arc(0,0,24,0,Math.PI*2);ctx.stroke();outlinedText('⚛',0,0,25,'#fff');
    }else if(o.type==='crow'){
      ctx.rotate(-o.rot);if(IMG.crow.width)ctx.drawImage(IMG.crow,-45,-25,90,50);
    }else{
      ctx.fillStyle='#6c547d';ctx.strokeStyle='#21152f';ctx.lineWidth=5;ctx.beginPath();
      for(let i=0;i<8;i++){const a=i*Math.PI/4,rr=o.r*(i%2?.75:1);ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);}ctx.closePath();ctx.fill();ctx.stroke();
      ctx.fillStyle='#392a49';ctx.beginPath();ctx.arc(-o.r*.2,-o.r*.15,o.r*.22,0,Math.PI*2);ctx.fill();
    }ctx.restore();
  }
  for(const b of bullets){ctx.save();ctx.translate(b.x,b.y);ctx.rotate(b.angle);ctx.fillStyle=b.color||'#67f3ff';ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=15;ctx.fillRect(-25,-4,42,8);ctx.restore();}
  if(state!=='win'){drawScooter();drawJim();}
  for(const q of particles){ctx.globalAlpha=clamp(q.life/q.max,0,1);ctx.fillStyle=q.color;ctx.fillRect(q.x,q.y,q.size,q.size);}ctx.globalAlpha=1;
  for(const f of floaters){ctx.globalAlpha=clamp(f.life,0,1);outlinedText(f.text,f.x,f.y,f.size,f.color);}ctx.globalAlpha=1;
  if(mouseAim.active&&state==='play')drawCrosshair();
}
function drawScooter() {
  const p=player,x=p.x+p.w/2,y=p.y+p.h-5;
  ctx.save();ctx.translate(x,y);
  ctx.fillStyle='#d8ff3e';ctx.strokeStyle='#111';ctx.lineWidth=4;
  ctx.beginPath();ctx.moveTo(-60,-15);ctx.lineTo(45,-15);ctx.lineTo(70,0);ctx.lineTo(35,14);ctx.lineTo(-50,12);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.fillStyle='#ff655f';ctx.fillRect(-25,-25,45,12);ctx.strokeRect(-25,-25,45,12);
  // Airplane propeller on the cosmic scooter.
  ctx.strokeStyle='#c8d4df';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(-45,-15);ctx.lineTo(-45,-62);ctx.stroke();
  ctx.save();ctx.translate(-45,-62);ctx.rotate(gameTime*25);ctx.fillStyle='#e8f4ff';
  for(let i=0;i<3;i++){ctx.rotate(Math.PI*2/3);ctx.beginPath();ctx.ellipse(0,-28,8,29,.25,0,Math.PI*2);ctx.fill();ctx.stroke();}ctx.restore();
  ctx.fillStyle='#7ff6ff';ctx.beginPath();ctx.moveTo(-60,-5);ctx.lineTo(-95-rand(0,25),5);ctx.lineTo(-60,10);ctx.fill();ctx.restore();
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
  if (level && level.cfg) drawThemeScenery(level.cfg.theme);
}

function drawThemeScenery(theme) {
  const cfg=level.cfg;
  ctx.save();ctx.globalAlpha=.16;ctx.fillStyle=cfg.color;ctx.fillRect(0,0,W,H);ctx.globalAlpha=1;
  ctx.fillStyle='rgba(5,5,18,.55)';ctx.strokeStyle=cfg.color;ctx.lineWidth=3;
  const shift=-(camX*.25)%420;
  if(theme==='city'||theme==='citadel'){
    for(let i=-1;i<5;i++){const x=shift+i*420,h=100+(i%3+3)%3*70;ctx.fillRect(x,H-160-h,240,h+160);ctx.strokeRect(x,H-160-h,240,h+160);
      for(let wy=H-140-h;wy<H-180;wy+=35)for(let wx=x+20;wx<x+220;wx+=42){ctx.fillStyle=cfg.color;ctx.globalAlpha=.25;ctx.fillRect(wx,wy,13,18);}ctx.globalAlpha=1;ctx.fillStyle='rgba(5,5,18,.55)';}
  }else if(theme==='lab'||theme==='maze'){
    ctx.globalAlpha=.18;for(let x=shift%100;x<W;x+=100){ctx.beginPath();ctx.moveTo(x,100);ctx.lineTo(x,H-100);ctx.stroke();}
    for(let y=120;y<H-100;y+=90){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}ctx.globalAlpha=1;
  }else if(theme==='cave'||theme==='ice'){
    for(let i=-1;i<12;i++){const x=shift*1.5+i*170,h=60+(i%4)*35;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+65,h);ctx.lineTo(x+120,0);ctx.fill();ctx.stroke();
      if(theme==='ice'){ctx.beginPath();ctx.moveTo(x+40,H-100);ctx.lineTo(x+75,H-100-h);ctx.lineTo(x+105,H-100);ctx.fill();ctx.stroke();}}
  }else if(theme==='garden'){
    for(let i=-1;i<10;i++){const x=shift*1.4+i*210;ctx.beginPath();ctx.moveTo(x,H-90);ctx.quadraticCurveTo(x+30,H-250,x+60,H-130);ctx.stroke();ctx.fillStyle=cfg.color;ctx.globalAlpha=.2;ctx.beginPath();ctx.arc(x+60,H-160,35,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
  }else if(theme==='sewer'){
    ctx.lineWidth=20;for(let i=-1;i<7;i++){const x=shift+i*300;ctx.beginPath();ctx.moveTo(x,80);ctx.lineTo(x,330);ctx.quadraticCurveTo(x,390,x+70,390);ctx.lineTo(x+180,390);ctx.stroke();ctx.fillStyle='rgba(110,255,40,.18)';ctx.beginPath();ctx.arc(x+90,H-110,35+(i%3)*15,0,Math.PI*2);ctx.fill();}ctx.lineWidth=3;
  }else if(theme==='volcano'){
    for(let i=-1;i<10;i++){const x=shift*1.3+i*210,h=120+(i%4)*55;ctx.beginPath();ctx.moveTo(x,H-90);ctx.lineTo(x+75,H-90-h);ctx.lineTo(x+150,H-90);ctx.fill();ctx.stroke();ctx.fillStyle='#ff5a28';ctx.globalAlpha=.25;ctx.beginPath();ctx.arc(x+75,H-95-h,18,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;ctx.fillStyle='rgba(5,5,18,.55)';}
  }else if(theme==='clockwork'){
    for(let i=-1;i<8;i++){const x=shift+i*250,y=180+(i%3)*120,r=55+(i%2)*20;ctx.beginPath();for(let k=0;k<16;k++){const a=k*Math.PI/8,rr=k%2?r:r+15;ctx.lineTo(x+Math.cos(a)*rr,y+Math.sin(a)*rr);}ctx.closePath();ctx.fill();ctx.stroke();ctx.beginPath();ctx.arc(x,y,r*.35,0,Math.PI*2);ctx.stroke();}
  }else if(theme==='graveyard'){
    for(let i=-1;i<12;i++){const x=shift*1.5+i*160,y=H-110;ctx.beginPath();ctx.roundRect(x,y-90-(i%3)*20,65,100+(i%3)*20,20);ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(x+32,y-75);ctx.lineTo(x+32,y-35);ctx.moveTo(x+15,y-58);ctx.lineTo(x+50,y-58);ctx.stroke();}
  }else if(theme==='void'){
    for(let i=-1;i<7;i++){const x=shift+i*310,y=160+(i%3)*130;ctx.strokeStyle=i%2?cfg.color:'#7ff6ff';ctx.lineWidth=9;ctx.beginPath();ctx.ellipse(x,y,55,90,gameTime*.1,0,Math.PI*2);ctx.stroke();ctx.lineWidth=3;}
  }else if(theme==='factory'){
    for(let i=-1;i<6;i++){const x=shift+i*330;ctx.lineWidth=18;ctx.beginPath();ctx.moveTo(x,H-100);ctx.lineTo(x,H-260);ctx.lineTo(x+170,H-260);ctx.lineTo(x+170,H-180);ctx.stroke();ctx.lineWidth=3;}
  }else if(theme==='armada'){
    for(let i=-1;i<5;i++){const x=shift+i*420,y=160+(i%3)*100;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+180,y-35);ctx.lineTo(x+280,y);ctx.lineTo(x+180,y+35);ctx.closePath();ctx.fill();ctx.stroke();}
  }
  ctx.restore();
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
  const baseBody = IMG['jim-body'] && IMG['jim-body'].width ? IMG['jim-body'] : img;
  let bodyImg = IMG[`idle-${Math.floor(gameTime * 3) % 4}`] || baseBody;
  const armImg = IMG['jim-arm'];
  if (!img || !img.width) return;
  if (p.inv > 0 && Math.floor(p.inv * 14) % 2 === 0 && state === 'play') return;
  const cx = p.x + p.w / 2 - camX, bottom = p.y + p.h;
  const sw = img.width * JIM_SCALE, sh = JIM_H;
  const running = state === 'play' && p.onGround && Math.abs(p.vx) > 30;
  const phase = p.walkT * 1.45;
  const firing = state === 'play' && (p.shootAnim > 0 || keys.shoot || mouseShooting);

  // Настоящая покадровая анимация: меняются позы ног и корпуса, а не только положение спрайта.
  if (state === 'dead' || state === 'gameover') {
    bodyImg = IMG[`death-${Math.floor(p.deathT * 10) % 4}`] || baseBody;
  } else if (running) {
    bodyImg = IMG[`run-${Math.floor(p.walkT * 1.65) % 17}`] || baseBody;
  } else if (!p.onGround && state === 'play' && !race) {
    const jumpFrame = p.vy < -220 ? 'jump-rise' : p.vy < 170 ? 'jump-top' : 'jump-fall';
    bodyImg = IMG[jumpFrame] || baseBody;
  } else if (p.squash > 0.2) {
    bodyImg = IMG.land || baseBody;
  } else if (firing) {
    bodyImg = IMG[`shoot-${Math.floor(gameTime * 12) % 4}`] || baseBody;
  }
  if (p.crouch && state === 'play') bodyImg = IMG['run-0'] || bodyImg;
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
  if (!p.onGround && state === 'play' && !race) {
    if (p.vy < 0) { sy *= 1.1; sx *= 0.94; rot = clamp(p.vx / 3000, -0.12, 0.12) - 0.045; }
    else { sy *= 0.98; sx *= 1.025; rot = clamp(p.vx / 2800, -0.14, 0.14) + 0.04; }
  }
  if (p.shootAnim > 0) rot -= p.recoil * 0.12;
  if (firing && bodyImg.external) {
    const localAim = p.face > 0 ? p.aimAngle : Math.PI - p.aimAngle;
    rot += localAim * 0.35;
  }
  if (state === 'dead' || state === 'gameover') {
    rot = bodyImg.external ? Math.sin(p.deathT * 24) * 0.05 : p.deathT * 8;
    bob = 0; sx = 1; sy = 1;
  }

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
  } else if (!p.onGround && state === 'play' && !race) {
    ctx.save(); ctx.strokeStyle = 'rgba(127,246,255,0.45)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    const dir = p.vy < 0 ? 1 : -1;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.moveTo(cx + i * 27, bottom + dir * (6 + Math.abs(i) * 7));
      ctx.lineTo(cx + i * 30, bottom + dir * (22 + Math.abs(i) * 8)); ctx.stroke();
    }
    ctx.restore();
  }

  ctx.save();
  ctx.translate(cx - p.face * p.recoil * 8, bottom - bob);
  ctx.rotate(rot * p.face);
  ctx.scale(sx * p.face, sy);
  if (bodyImg.external) {
    const externalScale = bodyImg.externalKind === 'shoot' || bodyImg.externalKind === 'idle' ? 3.2 : 2.5;
    const fw = bodyImg.width * externalScale, fh = bodyImg.height * externalScale;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bodyImg, -fw / 2, -fh, fw, fh);
    ctx.imageSmoothingEnabled = true;
  } else {
    const frameX = bodyImg.width === 300 ? -sw * 0.45 - 34 * JIM_SCALE : -sw * 0.45;
    ctx.drawImage(bodyImg, frameX, -sh, bodyImg.width * JIM_SCALE, bodyImg.height * JIM_SCALE);
  }

  // Рука исходного HD-спрайта нужна только в режиме ожидания; внешние кадры уже содержат руку.
  if (!bodyImg.external && armImg && armImg.width && state === 'play') {
    const px = -sw * 0.45 + 153 / 232 * sw;
    const py = -sh + 145 / 300 * sh;
    const aiming = p.shootAnim > 0 || keys.shoot || mouseShooting;
    // Исходный ствол наклонён на 0.22 радиана — компенсируем это при точном прицеле.
    const localAim = aiming ? (p.face > 0 ? p.aimAngle : Math.PI - p.aimAngle) + 0.22 : 0;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(localAim - p.recoil * 0.2);
    ctx.translate(-Math.cos(localAim) * p.recoil * 10, -Math.sin(localAim) * p.recoil * 10);
    ctx.drawImage(armImg, -sw * 0.45 - px, -sh - py, sw, sh);
    ctx.restore();
  }
  ctx.restore();

  // Яркая вспышка, кольцо и отдача видны при каждом выстреле.
  if (p.muzzleFlash > 0 && state === 'play') {
    const m = muzzle(p.aimAngle), mx = m.x - camX, my = m.y;
    const power = p.muzzleFlash / 0.12, size = 24 + power * 24;
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
  const type=Campaign.ENEMIES[c.typeId]||Campaign.ENEMIES[0];
  const sw = 150*(type.scale||1), sh = sw * img.height / img.width;
  const flap = 1 + Math.sin(c.t * 16) * 0.16;
  ctx.save();
  ctx.translate(x, c.y);
  ctx.scale(-c.face, flap);   // спрайт смотрит влево
  ctx.filter=c.flash>0?'brightness(3)':`hue-rotate(${type.hue}deg) saturate(1.5)`;
  if(type.behavior==='shield'){ctx.strokeStyle='#ffe14a';ctx.lineWidth=7;ctx.beginPath();ctx.arc(0,0,sw*.55,0,Math.PI*2);ctx.stroke();}
  ctx.drawImage(img, -sw / 2, -sh / 2, sw, sh);
  ctx.restore();
  if(type.behavior==='healer')outlinedText('+',x,c.y-sh*.6,30,'#6bff5a');
  if(c.grabMode)outlinedText(`${c.grabT.toFixed(1)} c`,x,c.y-sh*.65,25,'#ff9fc6');
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
  const p=player;
  if(race){drawRaceHUD();return;}
  ctx.save();ctx.fillStyle='rgba(10,6,30,.68)';ctx.beginPath();ctx.roundRect(16,14,430,94,16);ctx.fill();
  outlinedText('ДЖИМ',30,39,27,'#ffe14a','left');
  const hw=190,hx=130,hy=27,hp=clamp(p.health,0,100)/100;
  ctx.fillStyle='#2a1030';ctx.fillRect(hx,hy,hw,21);ctx.fillStyle=hp>.5?'#6bff5a':hp>.25?'#ffd23f':'#ff4a4a';ctx.fillRect(hx,hy,hw*hp,21);
  ctx.strokeStyle='#111';ctx.lineWidth=3;ctx.strokeRect(hx,hy,hw,21);outlinedText(Math.ceil(p.health)+'%',hx+hw/2,hy+11,20,'#fff');
  drawAtomIcon(39,79);outlinedText(String(p.ammo),61,79,25,'#9ffaff','left');
  const weapon=Campaign.WEAPONS[p.weapon];outlinedText(weapon.name,132,79,20,weapon.color,'left');
  for(let i=0;i<lives;i++){
    const x=326+i*34;ctx.fillStyle='#ff9fc6';ctx.beginPath();ctx.arc(x,74,16,0,Math.PI*2);ctx.fill();
    if(IMG['jim-face']&&IMG['jim-face'].width)ctx.drawImage(IMG['jim-face'],x-15,61,30,26);
  }
  ctx.restore();
  outlinedText(`ЭТАП ${stageIndex+1}/${Campaign.STAGES.length} · ${level.cfg.short}`,W/2,29,25,level.cfg.color);
  outlinedText('ОЧКИ '+score.toString().padStart(6,'0'),W-24,35,31,'#fff','right');
  const prog=clamp(p.x/level.exitX,0,1);ctx.fillStyle='rgba(255,255,255,.2)';ctx.fillRect(W-284,68,260,8);ctx.fillStyle=level.cfg.color;ctx.fillRect(W-284,68,260*prog,8);
  ctx.fillStyle='rgba(5,5,20,.72)';ctx.beginPath();ctx.roundRect(16,H-56,780,40,8);ctx.fill();
  ctx.font='700 16px Rubik';ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillStyle='#fff';ctx.fillText(level.cfg.objective,30,H-36);
  outlinedText(`КЛЮЧИ ${level.keysFound}/${level.keyCount} · ТЕРМИНАЛЫ ${level.switches.filter(s=>s.active).length}/${level.switches.length}`,W-24,H-35,19,puzzleSolved()?'#b6ff4a':'#ff9fc6','right');
  if(boss.active&&!boss.dead){
    const bw=520,bx=W/2-bw/2,by=H-92;outlinedText('ПСИ-ВОРОНА',W/2,by-18,30,'#ff6b6b');ctx.fillStyle='#2a1030';ctx.fillRect(bx,by,bw,18);ctx.fillStyle='#ff3a3a';ctx.fillRect(bx,by,bw*boss.hp/boss.maxHp,18);ctx.strokeStyle='#111';ctx.lineWidth=3;ctx.strokeRect(bx,by,bw,18);
  }
}
function drawRaceHUD(){
  const p=player,r=race;ctx.fillStyle='rgba(10,6,30,.7)';ctx.beginPath();ctx.roundRect(16,14,420,92,15);ctx.fill();
  outlinedText('ЗДОРОВЬЕ',30,39,22,'#ff9fc6','left');ctx.fillStyle='#2a1030';ctx.fillRect(165,27,230,21);ctx.fillStyle=p.health>30?'#6bff5a':'#ff4a4a';ctx.fillRect(165,27,230*clamp(p.health,0,100)/100,21);
  drawAtomIcon(39,77);outlinedText(String(p.ammo),62,78,24,'#9ffaff','left');outlinedText(Campaign.WEAPONS[p.weapon].name,130,78,20,Campaign.WEAPONS[p.weapon].color,'left');
  for(let i=0;i<lives;i++)if(IMG['jim-face'].width)ctx.drawImage(IMG['jim-face'],330+i*32,61,30,26);
  outlinedText(`${(r.distance/1000).toFixed(1)} / 10 КМ`,W-30,42,40,'#ffe14a','right');
  ctx.fillStyle='rgba(255,255,255,.2)';ctx.fillRect(W-354,72,320,10);ctx.fillStyle='#d8ff3e';ctx.fillRect(W-354,72,320*clamp(r.distance/r.finish,0,1),10);
  outlinedText(`${Math.round(r.speed)} КМ/Ч`,W-30,110,24,'#7ff6ff','right');
  ctx.font='700 17px Rubik';ctx.textAlign='center';ctx.fillStyle='#fff';ctx.fillText('↑ ↓ — манёвр   ·   → — ускорение   ·   ЛКМ / X — огонь',W/2,H-32);
}
function drawAtomIcon(x, y) {
  ctx.save(); ctx.translate(x, y); ctx.strokeStyle = '#9ffaff'; ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(0, 0, 13, 5, i * Math.PI / 3, 0, Math.PI * 2); ctx.stroke(); }
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}

function drawMechanics() {
  for(const m of level.mechanics||[]){
    const x=m.x-camX,cycle=(gameTime+m.phase)%3.6;if(x<-250||x>W+250)continue;
    ctx.save();
    if(m.kind==='laser'){
      ctx.strokeStyle=cycle<1.35?'#ff355e':'rgba(255,53,94,.18)';ctx.lineWidth=cycle<1.35?9:3;ctx.shadowColor='#ff355e';ctx.shadowBlur=cycle<1.35?25:0;
      ctx.beginPath();ctx.moveTo(x,70);ctx.lineTo(x,GROUND_Y);ctx.stroke();
    }else if(m.kind==='vents'||m.kind==='lava'){
      ctx.fillStyle=m.kind==='lava'?'#ff5a28':'#a8eaff';ctx.globalAlpha=cycle<1.15?.8:.18;
      ctx.beginPath();ctx.moveTo(x-45,GROUND_Y);ctx.quadraticCurveTo(x-70,GROUND_Y-120,x,GROUND_Y-230);ctx.quadraticCurveTo(x+70,GROUND_Y-120,x+45,GROUND_Y);ctx.fill();
    }else if(m.kind==='poison'){
      ctx.fillStyle='rgba(120,255,35,.65)';ctx.fillRect(x,GROUND_Y-18,m.w,35);for(let i=0;i<4;i++){ctx.beginPath();ctx.arc(x+20+i*35,GROUND_Y-20-Math.sin(gameTime*3+i)*10,7,0,Math.PI*2);ctx.fill();}
    }else if(m.kind==='crusher'){
      const y=70+(Math.sin(gameTime*1.7+m.phase)+1)*145;ctx.fillStyle='#6c5b55';ctx.strokeStyle='#ffd27a';ctx.lineWidth=5;ctx.fillRect(x-48,y,96,180);ctx.strokeRect(x-48,y,96,180);
    }else if(m.kind==='portal'){
      ctx.strokeStyle='#df70ff';ctx.lineWidth=9;ctx.shadowColor='#df70ff';ctx.shadowBlur=25;ctx.beginPath();ctx.ellipse(x,GROUND_Y-90,45,85,0,0,Math.PI*2);ctx.stroke();
    }ctx.restore();
  }
  if(level.cfg.mechanic==='belts')for(let x=100;x<W;x+=170){outlinedText(Math.floor((x+camX)/950)%2?'→':'←',x,GROUND_Y+25,30,'#ffe14a');}
  if(level.cfg.mechanic==='mirror'&&player.x>2800&&player.x<6100)outlinedText('ЗЕРКАЛЬНАЯ ЗОНА: УПРАВЛЕНИЕ НАОБОРОТ',W/2,105,25,'#df70ff');
  if(level.cfg.mechanic==='darkness'){
    const px=player.x-camX+player.w/2,py=player.y+60,g=ctx.createRadialGradient(px,py,70,px,py,270);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,10,.88)');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  }
}
function drawPuzzleObjects() {
  for(const s of level.switches){
    const x=s.x-camX;if(x<-80||x>W+80)continue;
    ctx.save();ctx.translate(x,s.y);ctx.fillStyle=s.active?'#b6ff4a':'#27243d';ctx.strokeStyle=s.active?'#fff':'#8b83b5';ctx.lineWidth=4;
    ctx.beginPath();ctx.roundRect(-32,-40,64,78,8);ctx.fill();ctx.stroke();
    outlinedText(String(s.order),0,-4,34,s.active?'#111':'#fff');ctx.restore();
  }
  for(const d of level.doors){
    const x=d.x-camX;if(x<-100||x>W+100)continue;
    ctx.save();ctx.translate(x,d.y);ctx.fillStyle=puzzleSolved()?'rgba(182,255,74,.12)':'#342a49';ctx.strokeStyle=puzzleSolved()?'#b6ff4a':'#ff655f';ctx.lineWidth=6;
    ctx.fillRect(0,0,d.w,d.h);ctx.strokeRect(0,0,d.w,d.h);
    if(!puzzleSolved()){for(let y=15;y<d.h;y+=35){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(d.w,y+20);ctx.stroke();}outlinedText('ЗАМОК',d.w/2,100,18,'#ff9fc6');}
    ctx.restore();
  }
  for(const f of level.friends){
    const x=f.x-camX;if(x<-130||x>W+130)continue;const data=Campaign.FRIENDS[f.id],bob=Math.sin(f.t*3)*7;
    ctx.save();ctx.translate(x,f.y+bob);ctx.shadowColor=data.color;ctx.shadowBlur=f.met?5:20;
    if(f.id===2&&IMG.cow.width)ctx.drawImage(IMG.cow,-45,-45,90,75);
    else if(f.id===7&&IMG.princess.width)ctx.drawImage(IMG.princess,-35,-75,70,120);
    else{
      ctx.fillStyle=data.color;ctx.strokeStyle='#171322';ctx.lineWidth=4;ctx.beginPath();ctx.roundRect(-30,-42,60,70,18);ctx.fill();ctx.stroke();
      ctx.fillStyle='#171322';ctx.beginPath();ctx.arc(-11,-18,5,0,Math.PI*2);ctx.arc(11,-18,5,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle=data.color;ctx.beginPath();ctx.moveTo(0,-42);ctx.lineTo(0,-62);ctx.stroke();ctx.beginPath();ctx.arc(0,-65,5,0,Math.PI*2);ctx.fill();
    }ctx.restore();
    if(Math.abs(player.x-f.x)<400)outlinedText(data.name,x,f.y-115+bob,18,data.color);
  }
  if(!level.cfg.boss){
    const x=level.exitX-camX;ctx.save();ctx.translate(x,GROUND_Y-120);ctx.strokeStyle=puzzleSolved()?'#b6ff4a':'#ff655f';ctx.lineWidth=7;ctx.shadowColor=ctx.strokeStyle;ctx.shadowBlur=20;
    ctx.beginPath();ctx.arc(0,0,52+Math.sin(gameTime*4)*5,0,Math.PI*2);ctx.stroke();outlinedText(puzzleSolved()?'ВЫХОД':'ЗАКРЫТО',0,-85,22,ctx.strokeStyle);ctx.restore();
  }
}

function drawWorld() {
  if (race) { drawRace(); return; }
  drawBackground();
  ctx.save();
  if (shake > 0) ctx.translate(rand(-shake, shake), rand(-shake, shake));
  drawPlatforms();
  level.signs.forEach(drawSign);
  drawPuzzleObjects();
  for (const it of level.items) {
    if (it.taken) continue;
    const x = it.x - camX;
    if (x < -40 || x > W + 40) continue;
    if(it.type==='atom')drawAtom(x,it.y,it.t);
    else if(it.type==='key'){
      ctx.save();ctx.translate(x,it.y+Math.sin(it.t*3)*8);ctx.rotate(it.t);ctx.fillStyle='#ffe14a';ctx.strokeStyle='#5b3a00';ctx.lineWidth=3;
      ctx.beginPath();ctx.moveTo(0,-22);ctx.lineTo(18,0);ctx.lineTo(0,22);ctx.lineTo(-18,0);ctx.closePath();ctx.fill();ctx.stroke();outlinedText('K',0,0,22,'#5b3a00');ctx.restore();
    }else drawHeart(x,it.y,it.t);
  }
  level.cows.forEach(drawCow);
  if (level.cfg.boss && state !== 'win') drawPrincess();
  level.crows.forEach(c => !c.dead && drawCrow(c));
  drawBoss();
  // Яйца
  for (const e of eggs) {
    ctx.save(); ctx.translate(e.x - camX, e.y); ctx.rotate(gameTime * 8);
    ctx.fillStyle = e.enemyLaser ? '#ff655f' : '#fff7d1'; ctx.strokeStyle = '#111'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, 0, 11, 14, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  drawMechanics();
  if (state !== 'win') drawJim();
  // Плазма летит и отрисовывается по фактическому углу выстрела.
  for (const b of bullets) {
    const x = b.x - camX;
    ctx.save(); ctx.translate(x, b.y); ctx.rotate(b.angle || 0);
    ctx.shadowColor = b.color || '#3ff0ff'; ctx.shadowBlur = 18;
    const trail = ctx.createLinearGradient(-42, 0, 16, 0);
    trail.addColorStop(0, 'rgba(63,240,255,0)'); trail.addColorStop(1, 'rgba(63,240,255,0.75)');
    ctx.fillStyle = trail; ctx.beginPath(); ctx.ellipse(-15, 0, 32, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = b.color || '#67f3ff'; ctx.beginPath(); ctx.ellipse(0, 0, b.pierce?32:18, b.pierce?4:7, 0, 0, Math.PI * 2); ctx.fill();
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

function titleStageAt(x,y) {
  const startX=95,startY=438,cw=210,ch=30,gapX=10,gapY=38;
  for(let i=0;i<Campaign.STAGES.length;i++){
    const col=i%5,row=Math.floor(i/5),rx=startX+col*(cw+gapX),ry=startY+row*gapY;
    if(x>=rx&&x<=rx+cw&&y>=ry&&y<=ry+ch)return i;
  }
  return -1;
}

function drawTitle() {
  camX = (gameTime * 40) % 3000;
  drawBackground();
  ctx.fillStyle = 'rgba(5,0,20,0.35)'; ctx.fillRect(0, 0, W, H);
  const jim = IMG['idle-0'] || IMG.jim, pr = IMG.princess;
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
  outlinedText('15 ЛОКАЦИЙ · 48 ГЕРОЕВ И ВРАГОВ · КОСМИЧЕСКАЯ ГОНКА', W / 2, 412, 28, '#ff9fd0');
  ctx.fillStyle='rgba(5,0,20,.76)';ctx.beginPath();ctx.roundRect(82,430,1116,122,14);ctx.fill();
  Campaign.STAGES.forEach((stage,i)=>{
    const col=i%5,row=Math.floor(i/5),x=95+col*220,y=438+row*38,selected=i===selectedStage;
    ctx.fillStyle=selected?stage.color:'rgba(55,42,85,.92)';ctx.strokeStyle=selected?'#fff':'#766799';ctx.lineWidth=2;
    ctx.beginPath();ctx.roundRect(x,y,210,30,6);ctx.fill();ctx.stroke();
    ctx.font='700 13px Rubik';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=selected?'#111':'#fff';
    ctx.fillText(`${i+1}. ${stage.short}`,x+105,y+15,194);
  });
  outlinedText('← → — ВЫБОР УРОВНЯ · ENTER — ИГРАТЬ · МОЖНО НАЖАТЬ НА КАРТОЧКУ',W/2,566,24,'#ffe14a');
  ctx.fillStyle = 'rgba(5,0,20,0.75)'; ctx.beginPath(); ctx.roundRect(W / 2 - 570, 590, 1140, 78, 14); ctx.fill();
  ctx.font = '700 18px Rubik, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#e8e0ff';
  ctx.fillText('← → / A D — бег   •   ↑ / W / ПРОБЕЛ — прыжок и голова-вертолёт   •   S / ↓ — присесть', W / 2, 614);
  ctx.fillText('ЛКМ / X / J — огонь   •   Q / E / 1–3 — оружие   •   Z / K — хлыст   •   P — пауза', W / 2, 645);
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
  if (state === 'stageclear') drawOverlay('ЭТАП ПРОЙДЕН!', `Далее: ${Campaign.STAGES[Math.min(Campaign.STAGES.length-1,stageIndex+1)].short} · ENTER`, '#b6ff4a');
  // Сначала показываем саму анимацию смерти, затем затемняем сцену.
  if (state === 'dead' && stateT > 0.55) drawOverlay('ОЙ-ОЙ!', 'Осталось жизней: ' + lives, '#ff9fc6');
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
