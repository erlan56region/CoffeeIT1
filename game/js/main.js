/* =========================================================
   ЧЕРВЯК ДЖИМ — состояния игры: титул → карта → уровень/гонка →
   пауза / пройдено / конец игры / финал. Главный цикл.
   ========================================================= */
'use strict';

let mapSel = 0;
function setState(s) { state = s; stateT = 0; }

function playLevel(idx) {
  curLevel = idx;
  const def = LEVELS[idx];
  if (def.race !== undefined) { startRace(def.race); return; }
  loadLevel(idx);
  setState('play');
  banner = { text: def.name.toUpperCase(), sub: `${LOCATIONS[def.loc].name} • уровень ${def.n + 1}`, t: 0, color: '#ffe14a' };
}
function resetRun() {
  lives = 5;
  for (let i = 1; i < WEAPONS.length; i++) ammo[i] = SAVE.weapons[i] ? WEAPONS[i].start : 0;
}

// ---------- Карта мира ----------
const MAP_NODES = (() => {
  const pts = [];
  for (let i = 0; i < LOCATIONS.length; i++) {
    const row = Math.floor(i / 4), col = i % 4;
    const x = row % 2 === 0 ? 210 + col * 290 : 1080 - col * 290;
    pts.push({ x, y: 200 + row * 190 });
  }
  return pts;
})();
function levelPos(i) {
  const def = LEVELS[i], n = MAP_NODES[def.loc];
  return { x: n.x + (def.n - 1) * 46, y: n.y + 46 };
}
function updateMap() {
  const max = SAVE.unlocked;
  if (pressed.right || pressed.nextW) mapSel = Math.min(max, mapSel + 1), SFX.switchW();
  if (pressed.left || pressed.prevW) mapSel = Math.max(0, mapSel - 1), SFX.switchW();
  if (pressed.down) { const L = LEVELS[mapSel].loc; const nx = LEVELS.findIndex(l => l.loc === L + 1); if (nx >= 0 && nx <= max) { mapSel = nx; SFX.switchW(); } }
  if (pressed.up) { const L = LEVELS[mapSel].loc; const pv = LEVELS.findIndex(l => l.loc === Math.max(0, L - 1)); if (pv >= 0) { mapSel = pv; SFX.switchW(); } }
  if (pressed.tap && mapTap) {
    // касание узла на карте
    for (let i = 0; i <= max; i++) { const p = levelPos(i); if (Math.hypot(mapTap.x - p.x, mapTap.y - p.y) < 26) { if (mapSel === i) { pressed.start = true; } mapSel = i; } }
  }
  if (pressed.start || pressed.jump) { initAudio(); SFX.groovy(); playLevel(mapSel); }
  if (pressed.back) setState('title');
}
let mapTap = null;
cvs.addEventListener('pointerdown', e => {
  const r = cvs.getBoundingClientRect();
  mapTap = { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
});
function drawMap() {
  const def = LEVELS[mapSel], loc = LOCATIONS[def.loc];
  drawBackground(loc.bg, gameTime * 30, 1);
  ctx.fillStyle = 'rgba(5,0,20,0.55)'; ctx.fillRect(0, 0, W, H);
  outlinedText('КАРТА ГАЛАКТИКИ', W / 2, 56, 56, '#ffe14a');
  // дорога
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 10; ctx.setLineDash([2, 18]); ctx.lineCap = 'round';
  ctx.beginPath(); MAP_NODES.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
  ctx.restore();
  LOCATIONS.forEach((L, i) => {
    const p = MAP_NODES[i];
    const first = LEVELS.findIndex(l => l.loc === i);
    const open = first <= SAVE.unlocked;
    const img = IMG['bg_' + L.bg];
    ctx.save();
    ctx.beginPath(); ctx.arc(p.x, p.y, 44, 0, 7); ctx.closePath();
    ctx.fillStyle = INK; ctx.fill();
    ctx.save(); ctx.clip();
    if (img && img.width) ctx.drawImage(img, p.x - 70, p.y - 44, 140, 88 * img.height / img.height);
    if (!open) { ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(p.x - 50, p.y - 50, 100, 100); }
    ctx.restore();
    ctx.lineWidth = 5; ctx.strokeStyle = def.loc === i ? '#ffe14a' : open ? '#fff' : '#555'; ctx.beginPath(); ctx.arc(p.x, p.y, 44, 0, 7); ctx.stroke();
    if (L.race) outlinedText('🏁', p.x, p.y, 30, '#fff');
    if (!open) outlinedText('?', p.x, p.y, 40, '#888');
    plainText(L.name, p.x, p.y - 58, 15, open ? '#fff' : '#888');
    ctx.restore();
  });
  for (let i = 0; i < LEVELS.length; i++) {
    const p = levelPos(i), open = i <= SAVE.unlocked, done = i < SAVE.unlocked;
    ctx.beginPath(); ctx.arc(p.x, p.y, 13, 0, 7);
    inkPath(done ? '#7dff3a' : open ? '#ffe14a' : '#444', 3);
    if (LEVELS[i].boss) { ctx.fillStyle = INK; ctx.font = '900 13px Rubik'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('Б', p.x, p.y + 1); }
  }
  const sp = levelPos(mapSel);
  drawJimFace(sp.x, sp.y - 34 + Math.sin(gameTime * 5) * 5, 40, gameTime);
  // описание
  ctx.fillStyle = 'rgba(8,4,24,0.8)'; ctx.beginPath(); ctx.roundRect(W / 2 - 360, H - 96, 720, 80, 16); ctx.fill();
  outlinedText(`${loc.name} — ${def.n + 1}. ${def.name}`, W / 2, H - 70, 28, '#ff9fd0');
  const extra = def.race !== undefined ? 'Гонка на космоскутере — финишируй первым!' : def.boss ? `Босс: ${loc.boss.name}` : `Друг: ${loc.friend.name}`;
  plainText(extra + '   •   ← → выбор, ENTER — играть, ESC — меню', W / 2, H - 36, 16, '#e8e0ff');
  outlinedText('ЖИЗНИ', 70, 40, 20, '#fff');
  for (let i = 0; i < Math.min(lives, 6); i++) drawJimFace(40 + i * 38, 76, 36, gameTime + i);
}

// ---------- Титульный экран ----------
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
  ctx.fillStyle = '#7dff3a'; ctx.strokeStyle = '#111'; ctx.lineWidth = 3;
  [-150, -60, 40, 130].forEach((dx, i) => {
    const len = 18 + ((i * 13) % 20) + Math.sin(gameTime * 2 + i) * 4;
    ctx.beginPath(); ctx.moveTo(dx - 7, 112); ctx.lineTo(dx - 5, 112 + len); ctx.arc(dx, 112 + len, 6, Math.PI, 0, true); ctx.lineTo(dx + 7, 112); ctx.fill(); ctx.stroke();
  });
  ctx.restore();
}
const titleAnim = (typeof newJimAnim === 'function') ? newJimAnim() : null;
function drawTitle() {
  drawBackground('asteroid', gameTime * 40, 1);
  ctx.fillStyle = 'rgba(5,0,20,0.35)'; ctx.fillRect(0, 0, W, H);
  if (RIG) {
    // тот же «скин», что и в игре: живая idle-поза из скелетной анимации
    const P = poseIdle(gameTime);
    P.armF = -0.25 + Math.sin(gameTime * 1.7) * 0.2;
    drawJimRig(jimBones(165, 660, 1, 370 / RIG.jim.height, P), false);
    drawPrincessRig(W - 150, 660, 350, gameTime, 'idle');
  }
  if (IMG.cow && IMG.cow.width) {
    ctx.save(); ctx.translate(W / 2 + Math.sin(gameTime * 0.7) * 380, 110 + Math.cos(gameTime * 1.3) * 20); ctx.rotate(gameTime);
    ctx.drawImage(IMG.cow, -50, -40, 100, 82); ctx.restore();
  }
  drawTitleLogo(200);
  ctx.fillStyle = 'rgba(5,0,20,0.6)'; ctx.beginPath(); ctx.roundRect(W / 2 - 330, 388, 660, 40, 20); ctx.fill();
  outlinedText('11 ЛОКАЦИЙ • 33 УРОВНЯ • 10 БОССОВ • ГОНКИ', W / 2, 408, 26, '#ff9fd0');
  if (Math.floor(gameTime * 2) % 2 === 0) outlinedText('НАЖМИ ENTER ИЛИ КОСНИСЬ ЭКРАНА', W / 2, 466, 38, '#ffe14a');
  ctx.fillStyle = 'rgba(5,0,20,0.75)'; ctx.beginPath(); ctx.roundRect(W / 2 - 560, 510, 1120, 132, 14); ctx.fill();
  const lines = [
    '← → / A D — бег   •   ↑ / W / ПРОБЕЛ — прыжок (держи в падении — голова-вертолёт)   •   ↓ / S — присесть',
    'X / J — стрелять   •   Z / K — удар головой-хлыстом   •   Q / E / Tab или 1–5 — сменить оружие',
    '↓ + прыжок — спрыгнуть с платформы   •   P / Esc — пауза   •   M — звук',
    'Головоломки: ключи и замки, рычаги, кнопки и ящики, телепорты, мигающие блоки, тайные стены',
  ];
  lines.forEach((l, i) => plainText(l, W / 2, 534 + i * 28, 17, i === 3 ? '#b6ff4a' : '#e8e0ff'));
  if (SAVE.unlocked > 0) plainText(`Сохранение: открыто уровней ${SAVE.unlocked + 1} из ${LEVELS.length}`, W / 2, 668, 16, '#7dff3a');
}

function drawOverlay(title, sub, color) {
  ctx.fillStyle = 'rgba(5,0,20,0.6)'; ctx.fillRect(0, 0, W, H);
  outlinedText(title, W / 2, H / 2 - 50, 96, color);
  if (sub) outlinedText(sub, W / 2, H / 2 + 40, 32, '#fff');
}

function drawEnding() {
  drawBackground('dark', gameTime * 20, 1);
  ctx.fillStyle = 'rgba(5,0,20,0.5)'; ctx.fillRect(0, 0, W, H);
  if (RIG) {
    const t = gameTime, hop = Math.abs(Math.sin(t * 4));
    const P = hop > 0.25 ? poseJumpUp(t) : poseIdle(t);
    P.armB = 2.6 + Math.sin(t * 10) * 0.35;
    P.armF = -0.9 + Math.sin(t * 4) * 0.2;
    drawJimRig(jimBones(W / 2 - 110, 680 - hop * 60, 1, 360 / RIG.jim.height, P), false);
    drawPrincessRig(W / 2 + 120, 680, 330, t, 'happy');
  }
  for (let i = 0; i < 8; i++) {
    const t = (gameTime * 0.4 + i / 8) % 1;
    ctx.globalAlpha = 1 - t;
    drawHeart(W / 2 + Math.sin(i * 2.1 + gameTime) * 260, 520 - t * 420, gameTime + i);
  }
  ctx.globalAlpha = 1;
  outlinedText('GROOVY!', W / 2, 100, 120, '#b6ff4a');
  outlinedText('Профессор Мозгокрут повержен! Галактика спасена!', W / 2, 190, 38, '#ff9fd0');
  outlinedText('Очки: ' + score + '   •   ENTER — на карту', W / 2, 244, 30, '#fff');
}

function drawComplete() {
  ctx.fillStyle = 'rgba(5,0,20,0.6)'; ctx.fillRect(0, 0, W, H);
  outlinedText('УРОВЕНЬ ПРОЙДЕН!', W / 2, H / 2 - 90, 86, '#b6ff4a');
  outlinedText('Очки: ' + score, W / 2, H / 2, 40, '#ffe14a');
  const next = LEVELS[curLevel + 1];
  if (next) outlinedText('Дальше: ' + LOCATIONS[next.loc].name + ' — ' + next.name, W / 2, H / 2 + 60, 30, '#fff');
  if (stateT > 0.6) outlinedText('ENTER — дальше   •   ESC — карта', W / 2, H / 2 + 130, 28, '#ff9fd0');
}

// ---------- Обновление ----------
function updateDead(dt) {
  const p = player;
  if (p.deathFly) { p.vy += GRAVITY * 0.6 * dt; p.y += p.vy * dt; p.x += p.vx * dt; }
  updateJimAnim(p, dt, 0);
  updateParticles(dt);
  updateEnemies(dt);
  updateBullets(dt);
  if (stateT > 2.2) {
    if (lives > 0) respawnPlayer();
    else { setState('gameover'); SFX.die(); }
  }
}

function update(dt) {
  stateT += dt;
  gameTime += dt;
  if (pressed.mute) { muted = !muted; }
  switch (state) {
    case 'title':
      if (pressed.start || pressed.jump) { initAudio(); SFX.groovy(); resetRun(); mapSel = Math.min(SAVE.unlocked, LEVELS.length - 1); setState('map'); }
      break;
    case 'map': updateMap(); break;
    case 'play':
      if (pressed.pause) { setState('pause'); break; }
      updateWorld(dt);
      updateParticles(dt);
      break;
    case 'pause':
      if (pressed.back && !pressed.pause) { setState('map'); break; }
      if (keys.back && pressed.pause && stateT > 0.05) { setState('map'); break; }
      if (pressed.start || pressed.tap || pressed.pause) setState('play');
      break;
    case 'dead': updateDead(dt); break;
    case 'gameover':
      updateParticles(dt);
      if (stateT > 1 && (pressed.start || pressed.jump)) { resetRun(); score = 0; setState('map'); }
      break;
    case 'complete':
      updateParticles(dt);
      if (stateT > 0.6 && (pressed.start || pressed.jump)) { mapSel = Math.min(SAVE.unlocked, curLevel + 1); playLevel(mapSel); }
      else if (stateT > 0.6 && pressed.back) { mapSel = Math.min(SAVE.unlocked, curLevel + 1); setState('map'); }
      break;
    case 'race':
      if (pressed.pause) { setState('racePause'); break; }
      updateRace(dt);
      break;
    case 'racePause':
      if (pressed.back && stateT > 0.05 && !pressed.pause) { setState('map'); break; }
      if (pressed.start || pressed.tap || pressed.pause) setState('race');
      break;
    case 'raceLost':
      if (stateT > 0.6 && (pressed.start || pressed.jump)) startRace(LEVELS[curLevel].race);
      else if (stateT > 0.6 && pressed.back) setState('map');
      break;
    case 'ending':
      updateParticles(dt);
      if (stateT > 1.5 && pressed.start) { mapSel = SAVE.unlocked; setState('map'); }
      break;
  }
}

function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = 'none'; ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  if (state === 'loading') {
    ctx.fillStyle = '#07051a'; ctx.fillRect(0, 0, W, H);
    outlinedText('ЗАГРУЗКА...', W / 2, H / 2, 60, '#ffe14a');
    return;
  }
  if (state === 'title') { drawTitle(); return; }
  if (state === 'map') { drawMap(); return; }
  if (state === 'ending') { drawEnding(); return; }
  if (state === 'race' || state === 'racePause' || state === 'raceLost') {
    drawRace();
    if (state === 'racePause') drawOverlay('ПАУЗА', 'ENTER — продолжить • ESC — на карту', '#ffe14a');
    if (state === 'raceLost') drawOverlay('НЕ ПЕРВОЕ МЕСТО', 'ENTER — ещё раз • ESC — карта (жизни не тратятся)', '#ff9f9f');
    if (state === 'complete') drawComplete();
    return;
  }
  if (!level) { drawMap(); return; }
  if (state === 'complete' && LEVELS[curLevel].race !== undefined) { drawRace(); drawComplete(); return; }
  drawWorld();
  drawHUD();
  if (state === 'pause') drawOverlay('ПАУЗА', 'ENTER — продолжить • ESC — на карту', '#ffe14a');
  if (state === 'dead' && stateT > 0.6) drawOverlay('ОЙ-ОЙ!', lives > 0 ? 'Осталось жизней: ' + lives : '', '#ff9fc6');
  if (state === 'gameover') drawOverlay('КОНЕЦ ИГРЫ', 'ENTER — на карту (прогресс сохранён)', '#ff4a4a');
  if (state === 'complete') drawComplete();
}

// ---------- Главный цикл ----------
let last = performance.now();
let lastError = null;
function frame(now) {
  const dt = Math.min(1 / 30, (now - last) / 1000);
  last = now;
  try {
    update(dt);
    render();
  } catch (err) {
    if (!lastError) console.error(err);
    lastError = err;
  }
  for (const k in pressed) pressed[k] = false;
  requestAnimationFrame(frame);
}

const fontsReady = (document.fonts && document.fonts.load)
  ? Promise.all([document.fonts.load('400 40px Bangers'), document.fonts.load('900 40px Rubik', 'ДЖИМ'), document.fonts.load('700 20px Rubik', 'Джим')]).catch(() => { })
  : Promise.resolve();
Promise.all([loadAssets(), Promise.race([fontsReady, new Promise(r => setTimeout(r, 2500))])]).then(() => { setState('title'); });
requestAnimationFrame(frame);
