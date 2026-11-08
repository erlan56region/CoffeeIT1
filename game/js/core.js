/* =========================================================
   ЧЕРВЯК ДЖИМ — ядро: холст, ассеты, звук, ввод, утилиты, сохранение
   ========================================================= */
'use strict';

const W = 1280, H = 720, TS = 48, ROWS = 15;

// Полифилл roundRect для старых браузеров
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

// ---------- Физика ----------
const GRAVITY = 2300, JUMP_V = 930, RUN = 400, CRAWL = 170, GLIDE_FALL = 150;
const JIM_H = 160, STAND_H = 134, CROUCH_H = 90, PLAYER_W = 40;

// ---------- Ассеты ----------
const IMG = {};
const RIG = window.RIG || null;
const BG_NAMES = ['asteroid', 'junk', 'ice', 'lava', 'water', 'race', 'whale', 'factory', 'crystal', 'slime', 'dark'];
function assetList() {
  const list = ['jim.png', 'princess.png', 'crow.png', 'cow.png', 'bg.jpg'].map(f => [f.split('.')[0], f]);
  if (RIG) for (const n of Object.keys(RIG)) for (const p of Object.keys(RIG[n].parts)) list.push([`${n}_${p}`, `rig/${n}_${p}.png`]);
  for (const b of BG_NAMES) list.push(['bg_' + b, `bg/${b}.jpg`]);
  return list;
}
function loadAssets() {
  return Promise.all(assetList().map(([key, f]) => new Promise(res => {
    const i = new Image();
    i.onload = () => res();
    i.onerror = () => res();
    i.src = (window.__ASSETS && window.__ASSETS[f]) || ('assets/' + f);
    IMG[key] = i;
  })));
}

// ---------- Звук (синтез WebAudio) ----------
let actx = null, muted = false;
function initAudio() {
  if (actx) return;
  try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
}
function tone(type, f0, f1, dur, vol = 0.15, delay = 0) {
  if (!actx || muted) return;
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
function noise(dur, vol = 0.12, freq = 800) {
  if (!actx || muted) return;
  const len = Math.floor(actx.sampleRate * dur);
  const buf = actx.createBuffer(1, len, actx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = actx.createBufferSource(); s.buffer = buf;
  const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
  const g = actx.createGain(); g.gain.value = vol;
  s.connect(f).connect(g).connect(actx.destination);
  s.start();
}
const SFX = {
  shoot: () => tone('square', 1200, 300, 0.09, 0.06),
  spread: () => { tone('square', 900, 250, 0.12, 0.06); tone('square', 1300, 400, 0.1, 0.04); },
  laser: () => tone('sawtooth', 2200, 1400, 0.05, 0.035),
  rocket: () => { noise(0.35, 0.1, 600); tone('sawtooth', 200, 90, 0.3, 0.06); },
  boom: () => { noise(0.5, 0.22, 400); tone('sine', 120, 40, 0.4, 0.15); },
  freeze: () => { tone('triangle', 1800, 2600, 0.15, 0.06); tone('sine', 2400, 900, 0.2, 0.04, 0.05); },
  jump: () => tone('sine', 280, 640, 0.16, 0.11),
  whip: () => tone('sawtooth', 900, 120, 0.12, 0.06),
  hit: () => tone('sawtooth', 300, 60, 0.15, 0.11),
  hurt: () => tone('square', 200, 80, 0.3, 0.12),
  pickup: () => tone('triangle', 660, 1320, 0.12, 0.11),
  heart: () => { tone('triangle', 520, 1040, 0.1, 0.12); tone('triangle', 780, 1560, 0.12, 0.1, 0.08); },
  life: () => [523, 659, 784, 1046, 1318].forEach((f, i) => tone('triangle', f, f, 0.1, 0.1, i * 0.07)),
  weapon: () => { tone('square', 440, 880, 0.08, 0.06); tone('square', 660, 1320, 0.08, 0.06, 0.08); },
  switchW: () => tone('triangle', 500, 700, 0.06, 0.07),
  cow: () => { tone('sawtooth', 190, 110, 0.55, 0.12); tone('sawtooth', 140, 90, 0.5, 0.07, 0.05); },
  groovy: () => [523, 659, 784, 1046].forEach((f, i) => tone('square', f, f, 0.12, 0.07, i * 0.09)),
  boss: () => tone('sawtooth', 90, 40, 0.6, 0.15),
  win: () => [523, 659, 784, 659, 784, 1046].forEach((f, i) => tone('triangle', f, f * 1.01, 0.2, 0.12, i * 0.14)),
  die: () => [400, 300, 200, 100].forEach((f, i) => tone('square', f, f * 0.9, 0.18, 0.1, i * 0.15)),
  lever: () => { tone('square', 300, 300, 0.05, 0.08); tone('square', 600, 600, 0.06, 0.08, 0.06); },
  door: () => { noise(0.3, 0.08, 300); tone('sine', 150, 300, 0.3, 0.06); },
  key: () => [880, 1175, 1568].forEach((f, i) => tone('triangle', f, f, 0.09, 0.09, i * 0.06)),
  teleport: () => { tone('sine', 300, 1800, 0.25, 0.08); tone('sine', 1800, 300, 0.25, 0.05, 0.12); },
  spring: () => tone('sine', 200, 900, 0.22, 0.12),
  splash: () => noise(0.25, 0.08, 1500),
  bubble: () => tone('sine', 600, 1200, 0.06, 0.05),
  crumble: () => noise(0.2, 0.08, 500),
  talk: () => tone('triangle', 700 + Math.random() * 200, 600, 0.05, 0.04),
  beep: () => tone('square', 660, 660, 0.12, 0.07),
  go: () => tone('square', 1320, 1320, 0.35, 0.08),
  boost: () => { tone('sawtooth', 300, 1200, 0.4, 0.07); noise(0.4, 0.05, 2000); },
};

// ---------- Ввод ----------
const keys = {}, pressed = {};
const KEYMAP = {
  ArrowLeft: ['left'], KeyA: ['left'], ArrowRight: ['right'], KeyD: ['right'],
  ArrowUp: ['jump', 'up'], KeyW: ['jump', 'up'], Space: ['jump'],
  ArrowDown: ['down'], KeyS: ['down'],
  KeyX: ['shoot'], KeyJ: ['shoot'], KeyZ: ['whip'], KeyK: ['whip'],
  KeyQ: ['prevW'], KeyE: ['nextW'], Tab: ['nextW'],
  Digit1: ['w0'], Digit2: ['w1'], Digit3: ['w2'], Digit4: ['w3'], Digit5: ['w4'],
  Enter: ['start'], KeyP: ['pause'], Escape: ['pause', 'back'], KeyM: ['mute'], Backspace: ['back'],
};
function setKey(k, down) {
  if (down && !keys[k]) pressed[k] = true;
  keys[k] = down;
}
addEventListener('keydown', e => {
  const ks = KEYMAP[e.code];
  if (ks) { e.preventDefault(); initAudio(); ks.forEach(k => setKey(k, true)); }
});
addEventListener('keyup', e => { const ks = KEYMAP[e.code]; if (ks) ks.forEach(k => setKey(k, false)); });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

if ('ontouchstart' in window || navigator.maxTouchPoints > 0) document.body.classList.add('is-touch');
document.querySelectorAll('#touch button').forEach(b => {
  const ks = b.dataset.key.split(',');
  const down = e => { e.preventDefault(); initAudio(); ks.forEach(k => setKey(k, true)); b.classList.add('active'); };
  const up = e => { e.preventDefault(); ks.forEach(k => setKey(k, false)); b.classList.remove('active'); };
  b.addEventListener('pointerdown', down);
  b.addEventListener('pointerup', up);
  b.addEventListener('pointercancel', up);
  b.addEventListener('pointerleave', up);
});
cvs.addEventListener('pointerdown', () => { initAudio(); pressed.start = true; pressed.tap = true; });

// ---------- Утилиты ----------
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const lerpK = (dt, speed) => 1 - Math.exp(-dt * speed);
const easeOut = k => 1 - (1 - k) * (1 - k);
function seeded(seed) { let s = (seed * 2654435761) >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function shuffle(arr, r) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

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
function plainText(txt, x, y, size, fill = '#fff', align = 'center', weight = 700) {
  ctx.font = `${weight} ${size}px Rubik, Arial, sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillStyle = fill; ctx.fillText(txt, x, y);
}
function wrapText(txt, maxW, size) {
  ctx.font = `700 ${size}px Rubik, Arial, sans-serif`;
  const words = txt.split(' '), lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}
function bubble(x, y, text, opts = {}) {
  const size = opts.size || 18, maxW = opts.maxW || 300;
  const lines = wrapText(text, maxW, size);
  ctx.font = `700 ${size}px Rubik, Arial, sans-serif`;
  const tw = Math.max(...lines.map(l => ctx.measureText(l).width)) + 28;
  const th = lines.length * (size + 6) + 16;
  const bx = clamp(x - tw / 2, 8, W - tw - 8), by = y - th - 14;
  ctx.save();
  ctx.fillStyle = opts.bg || '#fff'; ctx.strokeStyle = '#111'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(bx, by, tw, th, 16); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 9, by + th - 1); ctx.lineTo(x, by + th + 14); ctx.lineTo(x + 9, by + th - 1); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - 9, by + th); ctx.lineTo(x, by + th + 14); ctx.lineTo(x + 9, by + th); ctx.stroke();
  ctx.fillStyle = opts.bg || '#fff'; ctx.fillRect(x - 8, by + th - 3, 16, 4);
  ctx.fillStyle = opts.color || '#222';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, bx + tw / 2, by + 8 + (size + 6) * i + (size + 6) / 2));
  ctx.restore();
}
// Обводка-контур для «аниме»-стиля
function inkPath(fill, lw = 3, stroke = '#141018') {
  ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.stroke();
}
function shade(hex, k) {
  // k > 0 — светлее, k < 0 — темнее
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (k > 0) { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
  else { r *= 1 + k; g *= 1 + k; b *= 1 + k; }
  return '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
}

// ---------- Сохранение прогресса ----------
const SAVE_KEY = 'jim2d-save-v2';
let SAVE = { unlocked: 0, best: {}, weapons: [true, false, false, false, false] };
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (s && typeof s.unlocked === 'number') SAVE = Object.assign(SAVE, s);
  } catch (e) { /* приватный режим и т.п. */ }
}
function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); } catch (e) { } }
loadSave();
