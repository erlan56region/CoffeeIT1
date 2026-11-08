/* =========================================================
   ЧЕРВЯК ДЖИМ — скелетная (cut-out) анимация персонажей
   Части спрайтов режет art/rig.py → assets/rig/*.png + rig.js
   ========================================================= */
'use strict';

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
// Перекрашенные копии спрайтов: фильтр применяется ОДИН раз, а не в каждом кадре
const tintCache = new Map();
function tinted(img, filter) {
  if (!filter) return img;
  let m = tintCache.get(img);
  if (!m) tintCache.set(img, m = {});
  if (!m[filter]) {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.filter = filter; g.drawImage(img, 0, 0);
    m[filter] = c;
  }
  return m[filter];
}
function drawPart(rigName, name, m, filter) {
  const r = RIG[rigName], img = IMG[rigName + '_' + name];
  if (!img || !img.width) return;
  const [x, y, w, h] = r.parts[name];
  ctx.save();
  ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
  ctx.drawImage(tinted(img, filter), x, y, w, h);
  ctx.restore();
}

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
// Полёт на джетпаке: корпус чуть вперёд, ноги вместе и назад, руки прижаты
function poseJet(t) {
  const f = Math.sin(t * 22);
  return { ...POSE0, lean: 0.14, bodyY: f * 2, thL: 0.3 + f * 0.04, shL: 0.5, thR: 0.12 - f * 0.04, shR: 0.6,
    armB: 0.5 + Math.sin(t * 9) * 0.1, armF: -0.55, head: -0.1, hsy: 1.02 };
}
function poseHurt(t) {
  return { ...POSE0, lean: -0.32, head: -0.45, hsy: 0.92, armB: 2.4 + Math.sin(t * 30) * 0.2, armF: -1.3, thL: -0.6, shL: 0.9, thR: 0.35, shR: 0.4 };
}
function poseSkid() {
  return { ...POSE0, lean: -0.22, thL: -0.55, shL: 0.25, thR: 0.25, shR: 0.6, armB: 0.9, armF: -0.5, head: -0.2, bodyY: 18 };
}

// Присед: Джим опускается на колено (переднее бедро горизонтально, заднее колено у земли),
// корпус наклонён и чуть сжат — так он помещается в туннель высотой 2 клетки
function poseCrouch(t, ph, moving) {
  const w = moving ? Math.sin(ph) : 0, aw = moving ? Math.abs(Math.cos(ph)) : 0;
  return { ...POSE0, bodyY: 140 + aw * 12, lean: 0.8 + Math.sin(t * 2.4) * 0.02 + w * 0.03, sy: 0.8, sx: 1.04,
    head: -0.7 + Math.sin(t * 1.6) * 0.05, hsy: 0.8 + Math.sin(t * 2.4 + 0.5) * 0.02,
    thR: -1.55 + w * 0.18, shR: 1.6 - w * 0.12, thL: 0.5 - w * 0.18, shL: 1.2 + w * 0.12,
    armB: 0.5 + w * 0.35, armF: -0.8 };
}
// Плавание: корпус горизонтально, ноги «лягушкой», руки гребут
function poseSwim(t, stroke) {
  const k = Math.sin(t * 6);
  return { ...POSE0, lean: 1.05, bodyY: -40, head: -0.85, hsy: 1.05,
    thL: 0.35 + k * 0.35, shL: 0.6 - k * 0.4, thR: 0.2 - k * 0.35, shR: 0.5 + k * 0.4,
    armB: -1.6 + Math.sin(t * 6 + 1) * 0.8 - stroke * 1.2, armF: -1.05 };
}
// Сидит на скутере: бёдра горизонтально, руки на руле
function poseSit(t, lean = 0) {
  return { ...POSE0, bodyY: 140, lean: -0.08 + lean, thL: -1.45, shL: 1.4, thR: -1.32, shR: 1.3,
    armB: -1.15 + Math.sin(t * 3) * 0.05, armF: -0.95, head: -0.05 + Math.sin(t * 2.2) * 0.05, hsy: 1 + Math.sin(t * 4) * 0.02 };
}

function addPose(T, k, add) { for (const key in add) T[key] += add[key] * k; }

function updateJimAnim(p, dt, dir) {
  const a = p.anim;
  a.t += dt;
  a.shootT = Math.max(0, a.shootT - dt);
  a.landT = Math.max(0, a.landT - dt);
  a.takeoffT = Math.max(0, a.takeoffT - dt);
  a.aimT = Math.max(0, (a.aimT || 0) - dt);
  a.stroke = Math.max(0, (a.stroke || 0) - dt * 3);
  // Плавный разворот: масштаб по X проходит через 0 («бумажный» поворот)
  a.face += (p.face - a.face) * lerpK(dt, 22);
  if (Math.abs(a.face) < 0.08) a.face = 0.08 * (p.face || 1);

  const speed = Math.abs(p.vx);
  let T, k = lerpK(dt, 16);
  const dying = state === 'dead' || state === 'gameover' || p.health <= 0;
  if (dying) { T = poseHurt(a.t); }
  else if (p.inv > 1.05) { T = poseHurt(a.t); k = lerpK(dt, 24); }
  else if (p.inWater && !p.onGround) { T = poseSwim(a.t, a.stroke); k = lerpK(dt, 8); }
  else if (p.crouch) {
    const moving = speed > 20;
    if (moving) a.phase += dt * (4 + speed * 0.03);
    T = poseCrouch(a.t, a.phase, moving); k = lerpK(dt, 20);
  }
  else if (!p.onGround) {
    if (p.jet) T = poseJet(a.t);
    else if (p.glide) T = poseGlide(a.t);
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
  // Прицел: пока Джим стреляет, рука с пистолетом держится горизонтально —
  // выстрел всегда вылетает из ствола (поворот руки компенсирует наклон корпуса)
  if (a.aimT > 0 && !dying) {
    T.armF = -T.lean;
    if (!p.inWater) T.armB = Math.min(T.armB, 0.5);
  }
  if (a.shootT > 0) {
    const q = easeOut(a.shootT / 0.13);                              // отдача бластера
    addPose(T, q, { armF: -0.22, lean: -0.04, head: -0.05, bodyX: -14 });
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

// Джетпак за спиной (координаты — в пространстве спрайта торса)
function drawJetpack(B, jet) {
  ctx.save();
  ctx.transform(...B.torso);
  ctx.lineWidth = 12; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
  if (jet.on) {
    // пламя из сопла
    const fl = 220 + Math.sin(gameTime * 60) * 50 + Math.random() * 50;
    ctx.fillStyle = '#ff7a1a';
    ctx.beginPath(); ctx.moveTo(110, 700); ctx.quadraticCurveTo(150, 700 + fl, 160, 720 + fl * 1.15); ctx.quadraticCurveTo(170, 700 + fl, 210, 700); ctx.fill();
    ctx.fillStyle = '#ffe95a';
    ctx.beginPath(); ctx.moveTo(132, 700); ctx.quadraticCurveTo(155, 700 + fl * 0.6, 160, 710 + fl * 0.7); ctx.quadraticCurveTo(165, 700 + fl * 0.6, 188, 700); ctx.fill();
  }
  // ремень, бак, полоса, сопло
  ctx.fillStyle = '#5a5f6e'; ctx.fillRect(215, 470, 60, 40);
  ctx.beginPath(); ctx.roundRect(90, 380, 140, 300, 60); ctx.fillStyle = '#c9ced8'; ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#e8343a'; ctx.fillRect(96, 470, 128, 46);
  ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(118, 410, 22, 200);
  ctx.beginPath(); ctx.moveTo(115, 670); ctx.lineTo(205, 670); ctx.lineTo(220, 715); ctx.lineTo(100, 715); ctx.closePath();
  ctx.fillStyle = '#3a3f4a'; ctx.fill(); ctx.stroke();
  // индикатор топлива на баке
  ctx.fillStyle = INK; ctx.fillRect(140, 540, 40, 110);
  ctx.fillStyle = jet.fuel > 0.3 ? '#7dff3a' : '#ff4a3a'; ctx.fillRect(148, 642 - 94 * jet.fuel, 24, 94 * jet.fuel);
  ctx.restore();
}

function drawJimRig(B, glide, jet) {
  if (jet) drawJetpack(B, jet);
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
// Мгновенно навести пистолет: разворот без «бумажного» поворота и рука горизонтально
function aimPlayer(p) {
  const a = p.anim;
  a.face = p.face;
  a.aimT = 0.45;
  a.pose.armF = -a.pose.lean;
}

// ---------- Ворона: машет крыльями ----------
function drawCrowRig(x, y, width, face, flap, tilt, filter) {
  const r = RIG.crow, k = width / r.width;
  ctx.save();
  ctx.translate(x, y);
  if (tilt) ctx.rotate(tilt);
  ctx.scale(-face * k, k);          // исходный спрайт смотрит влево
  ctx.translate(-r.center[0], -r.center[1] + flap * 30);
  const fold = 1 - Math.abs(flap) * 0.18;
  drawPart('crow', 'wingR', around(r.pivots.wingR, -flap * 0.95, fold, 1), filter);
  drawPart('crow', 'wingL', around(r.pivots.wingL, flap * 1.05, fold, 1), filter);
  drawPart('crow', 'body', [1, 0, 0, 1, 0, 0], filter);
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

function crowFlap(t, speed = 14) {
  // взмах: быстро вниз, медленнее вверх
  const ph = (t * speed) % (Math.PI * 2);
  return ph < Math.PI * 0.8 ? Math.cos(ph / 0.8) * 0.55 : -Math.cos((ph - Math.PI * 0.8) / 1.2) * 0.55;
}
