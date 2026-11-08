/* =========================================================
   ЧЕРВЯК ДЖИМ — космические гонки на космоскутере
   с самолётным пропеллером. Обгони трёх соперников!
   ========================================================= */
'use strict';

let race = null;
const RACES = [
  { len: 26000, rivals: 0.92, mines: 0, gates: 0, rings: 1 },
  { len: 32000, rivals: 0.96, mines: 1, gates: 0, rings: 1 },
  { len: 38000, rivals: 1.0, mines: 1, gates: 1, rings: 1 },
];
const RIVAL_DEFS = [
  { name: 'Пси-Ворона', color: '#b04aff', draw: 'crow', skill: 1.0 },
  { name: 'Злой Кот', color: '#ff5a3a', draw: 'cat', skill: 0.97 },
  { name: 'Боб-рыбка', color: '#ffb020', draw: 'fish', skill: 0.94 },
];
const SC_MAX = 820, SC_BOOST = 1350, SC_MIN = 260;

function startRace(idx) {
  const def = RACES[idx];
  const r = seeded(idx * 977 + 13);
  const obs = [];
  for (let x = 1400; x < def.len - 600; x += 300 + r() * 380) {
    const kind = r();
    if (def.mines && kind < 0.18) obs.push({ kind: 'mine', x, y: 120 + r() * (H - 240), r: 24, t: r() * 6 });
    else obs.push({ kind: 'rock', x, y: 90 + r() * (H - 180), r: 26 + r() * 34, rot: r() * 6, vr: (r() - 0.5) * 2, hp: 3 });
    if (r() < 0.35) obs.push({ kind: 'rock', x: x + 60 + r() * 100, y: 90 + r() * (H - 180), r: 22 + r() * 22, rot: r() * 6, vr: (r() - 0.5) * 2, hp: 2 });
  }
  const rings = [];
  for (let x = 1800; x < def.len - 800; x += 1100 + r() * 900) rings.push({ x, y: 140 + r() * (H - 280), taken: {} });
  const gates = [];
  if (def.gates) for (let x = 5000; x < def.len - 1500; x += 3600 + r() * 1600) gates.push({ x, gap: 170 + r() * (H - 520), h: 210, t: r() * 6 });
  // убираем камни внутри колец и ворот
  const clearObs = obs.filter(o => !rings.some(g => Math.abs(g.x - o.x) < 140 && Math.abs(g.y - o.y) < 140) && !gates.some(g => Math.abs(g.x - o.x) < 160));
  race = {
    idx, def, len: def.len, t: 0, countdown: 3.6, obs: clearObs, rings, gates,
    me: { x: 200, y: H / 2, vx: 0, vy: 0, boost: 0, spin: 0, inv: 0, shootCd: 0, finished: false, place: 0, anim: newJimAnim() },
    rivals: RIVAL_DEFS.map((d, i) => ({ ...d, x: 200 - 0, y: H / 2 + (i - 1) * 150 + (i >= 1 ? 60 : -60), vx: 0, vy: 0, boost: 0, spin: 0, finished: false, ft: 0, t: i * 2, laneT: i * 3.1 })),
    shots: [], finishOrder: [], cam: 0, stars: [], resultT: 0,
  };
  // звёзды для эффекта скорости
  for (let i = 0; i < 120; i++) race.stars.push({ x: Math.random() * W, y: Math.random() * H, z: rand(0.2, 1) });
  particles = []; floaters = [];
  setState('race');
}

function updateRace(dt) {
  const R = race, me = R.me;
  R.t += dt;
  updateParticles(dt);
  if (R.countdown > 0) {
    const prev = Math.ceil(R.countdown - 0.6);
    R.countdown -= dt;
    const now = Math.ceil(R.countdown - 0.6);
    if (now !== prev && now >= 1) SFX.beep();
    if (prev >= 1 && now < 1) SFX.go();
    me.anim.t += dt;
    return;
  }
  // ---- игрок ----
  const up = keys.up || keys.jump, down = keys.down;
  if (!me.finished) {
    const target = keys.left ? SC_MIN : keys.right ? SC_MAX * 1.08 : SC_MAX * 0.9;
    const cap = me.boost > 0 ? SC_BOOST : target;
    me.vx += ((me.boost > 0 ? SC_BOOST : target) - me.vx) * lerpK(dt, me.boost > 0 ? 3 : 1.2);
    me.vx = Math.min(me.vx, cap + 50);
    me.vy += ((up ? -1 : 0) + (down ? 1 : 0)) * 2600 * dt;
    me.vy *= Math.pow(0.02, dt);
    me.vy = clamp(me.vy, -520, 520);
  } else { me.vx *= Math.pow(0.4, dt); me.vy *= 0.9; }
  if (me.spin > 0) { me.spin -= dt; me.vx = Math.min(me.vx, 380); }
  me.boost -= dt; me.inv -= dt; me.shootCd -= dt;
  me.x += me.vx * dt; me.y = clamp(me.y + me.vy * dt, 70, H - 50);
  if (me.y <= 70 || me.y >= H - 50) me.vy *= -0.3;
  if ((pressed.shoot || keys.shoot) && me.shootCd <= 0 && !me.finished) {
    me.shootCd = 0.22;
    R.shots.push({ x: me.x + 90, y: me.y - 6, vx: me.vx + 1300, life: 0.8 });
    SFX.shoot();
  }
  me.anim.t += dt;
  // ---- соперники ----
  const leadX = Math.max(me.x, ...R.rivals.map(r => r.x));
  for (const rv of R.rivals) {
    rv.t += dt;
    if (rv.finished) { rv.vx *= Math.pow(0.4, dt); rv.x += rv.vx * dt; continue; }
    // «резинка»: отстающие догоняют, лидеры чуть сбавляют
    const gap = me.x - rv.x;
    const band = clamp(gap / 1600, -0.3, 0.2);
    let target = SC_MAX * 0.9 * R.def.rivals * rv.skill * (1 + band);
    if (rv.boost > 0) target = SC_BOOST * 0.95;
    if (rv.spin > 0) { rv.spin -= dt; target = 360; }
    rv.boost -= dt;
    rv.vx += (target - rv.vx) * lerpK(dt, 1.4);
    // дорожка + уклонение от препятствий
    rv.laneT += dt * 0.5;
    let ty = H / 2 + Math.sin(rv.laneT + rv.t * 0.13) * (H * 0.3);
    const ring = R.rings.find(g => g.x > rv.x && g.x - rv.x < 700 && !g.taken[rv.name]);
    if (ring) ty = ring.y;
    for (const o of R.obs) {
      if (o.dead || o.x < rv.x || o.x - rv.x > 420) continue;
      if (Math.abs(o.y - rv.y) < o.r + 50) ty = o.y + (rv.y < o.y ? -1 : 1) * (o.r + 90);
    }
    for (const g of R.gates) if (g.x > rv.x && g.x - rv.x < 600) ty = g.gap + g.h / 2;
    rv.vy += (clamp(ty, 80, H - 60) - rv.y) * 5 * dt;
    rv.vy *= Math.pow(0.05, dt);
    rv.x += rv.vx * dt; rv.y = clamp(rv.y + rv.vy * dt, 70, H - 50);
  }
  // ---- столкновения ----
  const racers = [me, ...R.rivals];
  for (const o of R.obs) {
    if (o.dead) continue;
    if (o.kind === 'rock') o.rot += o.vr * dt;
    o.t = (o.t || 0) + dt;
    for (const rc of racers) {
      if (rc.finished) continue;
      const dx = (rc.x + 30) - o.x, dy = rc.y - o.y;
      if (Math.abs(dx) < o.r + 60 && Math.abs(dy) < o.r + 26) {
        if (rc === me && me.inv > 0) continue;
        o.dead = true;
        if (o.kind === 'mine') { rc.spin = 1.4; rc.vx *= 0.3; rc.vy = (dy > 0 ? 1 : -1) * 500; ringFx(o.x, o.y, '#ff5a3a', 110); if (rc === me) { SFX.boom(); shake = 0.6; me.inv = 1.6; } }
        else { rc.spin = 0.7; rc.vx *= 0.55; rc.vy = (dy > 0 ? 1 : -1) * 320; shards(o.x, o.y, '#8a7a6a', 10); if (rc === me) { SFX.hurt(); shake = 0.35; me.inv = 1.0; } }
      }
    }
  }
  for (const g of R.gates) {
    g.t += dt;
    for (const rc of racers) {
      if (rc.finished) continue;
      if (Math.abs(rc.x + 30 - g.x) < 30 && (rc.y - 24 < g.gap || rc.y + 24 > g.gap + g.h)) {
        if (rc === me && me.inv > 0) continue;
        rc.spin = 1.1; rc.vx *= 0.35; rc.x -= 20;
        if (rc === me) { SFX.hurt(); shake = 0.4; me.inv = 1.4; sparks(g.x, me.y, '#ff3a5a', 16); }
      }
    }
  }
  for (const g of R.rings) {
    for (const rc of racers) {
      const key = rc === me ? 'me' : rc.name;
      if (g.taken[key]) continue;
      if (Math.abs(rc.x + 30 - g.x) < 40 && Math.abs(rc.y - g.y) < 70) {
        g.taken[key] = true; rc.boost = 1.6;
        if (rc === me) { SFX.boost(); ringFx(g.x, g.y, '#7dff3a', 90); floatText(me.x + 60, me.y - 60, 'УСКОРЕНИЕ!', '#7dff3a'); }
      }
    }
  }
  for (const s of R.shots) {
    s.life -= dt; s.x += s.vx * dt;
    for (const o of R.obs) if (!o.dead && Math.abs(s.x - o.x) < o.r + 10 && Math.abs(s.y - o.y) < o.r + 10) {
      s.life = 0;
      if (o.kind === 'mine') { o.dead = true; ringFx(o.x, o.y, '#ff5a3a', 110); SFX.boom(); score += 100; }
      else { o.hp--; sparks(s.x, s.y, '#ffe9a0', 6); if (o.hp <= 0) { o.dead = true; shards(o.x, o.y, '#8a7a6a', 10); SFX.crumble(); score += 50; } }
      break;
    }
    for (const rv of R.rivals) if (s.life > 0 && Math.abs(s.x - rv.x - 30) < 60 && Math.abs(s.y - rv.y) < 40) { s.life = 0; rv.spin = Math.max(rv.spin, 0.35); sparks(s.x, s.y, rv.color, 8); SFX.hit(); }
  }
  R.shots = R.shots.filter(s => s.life > 0);
  // ---- финиш ----
  for (const rc of racers) {
    if (!rc.finished && rc.x >= R.len) {
      rc.finished = true; R.finishOrder.push(rc === me ? 'me' : rc.name);
      if (rc === me) {
        me.place = R.finishOrder.length;
        if (me.place === 1) { SFX.win(); floatText(me.x, me.y - 80, '1 МЕСТО!', '#ffe14a'); }
        else SFX.die();
      }
    }
  }
  if (me.finished) {
    R.resultT += dt;
    if (R.resultT > 2.4) {
      if (me.place === 1) {
        score += 3000;
        if (SAVE.unlocked < curLevel + 1) SAVE.unlocked = Math.min(LEVELS.length - 1, curLevel + 1);
        writeSave();
        setState('complete');
      } else setState('raceLost');
    }
  }
  // пропеллер/выхлоп
  if (Math.random() < dt * 40) particles.push({ kind: 'puff', x: me.x - 70, y: me.y + 8, vx: -200, vy: rand(-20, 20), life: 0.4, max: 0.4, size: me.boost > 0 ? 12 : 7, color: me.boost > 0 ? 'rgba(125,255,58,0.8)' : 'rgba(255,190,90,0.7)' });
  R.cam += ((me.x - 320) - R.cam) * lerpK(dt, 6);
  shake = Math.max(0, shake - dt);
}
function ringFx(x, y, color, r) { ring(x, y, color, r); sparks(x, y, color, 16, 380); }

function racePlace() {
  const R = race, me = R.me;
  if (me.finished) return me.place;
  return 1 + R.finishOrder.length + R.rivals.filter(r => !r.finished && r.x > me.x).length;
}

// ---------- Отрисовка ----------
function drawScooter(x, y, t, color = '#e8343a', boost = 0, jim = true, tilt = 0, anim = null) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  // пламя
  const fl = 18 + Math.sin(t * 50) * 6 + boost * 30;
  ctx.fillStyle = boost ? '#7dff3a' : '#ffb42a';
  ctx.beginPath(); ctx.moveTo(-70, 0); ctx.lineTo(-70 - fl, 8); ctx.lineTo(-70, 16); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-70, 4); ctx.lineTo(-70 - fl * 0.5, 8); ctx.lineTo(-70, 12); ctx.fill();
  // корпус-капля в стиле мотороллера
  ctx.beginPath();
  ctx.moveTo(-74, -4); ctx.quadraticCurveTo(-70, -26, -30, -24); ctx.lineTo(30, -20); ctx.quadraticCurveTo(70, -18, 74, 6);
  ctx.quadraticCurveTo(70, 26, 20, 24); ctx.lineTo(-50, 22); ctx.quadraticCurveTo(-78, 18, -74, -4); ctx.closePath();
  inkPath(color, 3.5);
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(-10, -12, 40, 6, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#f6ecd0'; ctx.beginPath(); ctx.roundRect(-40, 4, 70, 8, 4); ctx.fill();
  // сиденье
  ctx.beginPath(); ctx.roundRect(-44, -32, 50, 12, 6); inkPath('#3a2a3a', 3);
  // стойка руля
  ctx.strokeStyle = INK; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(40, -18); ctx.lineTo(28, -62); ctx.stroke();
  ctx.strokeStyle = '#c8c8d8'; ctx.lineWidth = 4; ctx.stroke();
  ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(18, -64); ctx.lineTo(38, -60); ctx.stroke();
  // фара
  ctx.fillStyle = '#ffe9a0'; ctx.shadowColor = '#ffe14a'; ctx.shadowBlur = 16; ctx.beginPath(); ctx.arc(66, -6, 7, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
  // нос с самолётным пропеллером
  ctx.beginPath(); ctx.moveTo(72, -10); ctx.quadraticCurveTo(96, -4, 96, 4); ctx.quadraticCurveTo(96, 12, 72, 16); ctx.closePath(); inkPath('#c8c8d8', 3);
  ctx.save(); ctx.translate(98, 3);
  const pa = t * 45;
  ctx.fillStyle = 'rgba(220,220,230,0.35)'; ctx.beginPath(); ctx.ellipse(0, 0, 8, 46, 0, 0, 7); ctx.fill();
  for (let i = 0; i < 2; i++) { const k = Math.cos(pa + i * Math.PI); ctx.fillStyle = '#5a4a3a'; ctx.beginPath(); ctx.ellipse(0, k * 22, 5, 22 * Math.abs(k) + 2, 0, 0, 7); ctx.fill(); }
  ctx.beginPath(); ctx.arc(0, 0, 6, 0, 7); inkPath('#e8343a', 2);
  ctx.restore();
  // хвостовое крылышко
  ctx.beginPath(); ctx.moveTo(-60, -18); ctx.lineTo(-78, -46); ctx.lineTo(-56, -44); ctx.lineTo(-40, -22); ctx.closePath(); inkPath(shade(color, -0.2), 3);
  ctx.restore();
  // Джим сидит
  if (jim && RIG) {
    const P = poseSit(t, tilt * 0.5);
    if (anim) Object.assign(anim.pose, P);
    const B = jimBones(x - 18 + Math.cos(tilt) * 0, y - 26 + Math.sin(tilt) * -18, 1, 0.78 * JIM_S(), P, tilt);
    drawJimRig(B, false);
  }
}
function drawRivalRacer(rv, x, y, t) {
  const tilt = clamp(rv.vy / 900, -0.3, 0.3) + (rv.spin > 0 ? Math.sin(t * 30) * 0.4 : 0);
  if (rv.draw === 'crow') {
    // ворона верхом на ракете
    ctx.save(); ctx.translate(x, y); ctx.rotate(tilt);
    ctx.fillStyle = '#ffb42a'; ctx.beginPath(); ctx.moveTo(-60, -6); ctx.lineTo(-90 - Math.random() * 20, 0); ctx.lineTo(-60, 6); ctx.fill();
    ctx.beginPath(); ctx.roundRect(-60, -12, 110, 24, 12); inkPath('#d8d8e8', 3);
    ctx.beginPath(); ctx.moveTo(50, -12); ctx.quadraticCurveTo(80, 0, 50, 12); inkPath('#ff3a3a', 3);
    ctx.beginPath(); ctx.moveTo(-50, -12); ctx.lineTo(-66, -34); ctx.lineTo(-36, -12); inkPath('#ff3a3a', 3);
    ctx.restore();
    drawCrowRig(x - 4, y - 36, 120, 1, crowFlap(t, 12) * 0.5, tilt, 'hue-rotate(250deg) saturate(2)');
  } else if (rv.draw === 'cat') {
    ctx.save(); ctx.translate(x, y); ctx.rotate(tilt);
    ctx.beginPath(); ctx.ellipse(0, 0, 70, 18, 0, 0, 7); inkPath('#5a5a6a', 3);
    ctx.fillStyle = '#ff3a3a'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(-48 + i * 24, 4, 4, 0, 7); ctx.fill(); }
    ctx.fillStyle = 'rgba(190,240,255,0.35)'; ctx.beginPath(); ctx.ellipse(0, -16, 38, 30, 0, Math.PI, 0); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -22, 18, 0, 7); inkPath('#ff5a3a', 3);
    ctx.beginPath(); ctx.moveTo(-14, -34); ctx.lineTo(-12, -50); ctx.lineTo(-2, -38); ctx.moveTo(14, -34); ctx.lineTo(12, -50); ctx.lineTo(2, -38); inkPath('#ff5a3a', 2.5);
    ctx.fillStyle = '#ffe14a'; ctx.beginPath(); ctx.ellipse(-6, -24, 4, 5, 0, 0, 7); ctx.ellipse(8, -24, 4, 5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = INK; ctx.fillRect(-7, -28, 2, 8); ctx.fillRect(7, -28, 2, 8);
    ctx.restore();
  } else {
    ctx.save(); ctx.translate(x, y); ctx.rotate(tilt);
    ctx.fillStyle = '#7dff3a'; ctx.beginPath(); ctx.moveTo(-50, -4); ctx.lineTo(-74 - Math.random() * 14, 2); ctx.lineTo(-50, 8); ctx.fill();
    ctx.beginPath(); ctx.roundRect(-52, 6, 104, 18, 8); inkPath('#5a6070', 3);
    ctx.fillStyle = 'rgba(150,220,255,0.45)'; ctx.beginPath(); ctx.arc(0, -16, 34, 0, 7); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
    ctx.save(); ctx.translate(0, -16); ctx.scale(0.55, 0.55); ctx.translate(0, 60); FRIEND_DRAW.fishFriend(t); ctx.restore();
    ctx.restore();
  }
  outlinedText(rv.name, x, y - 72, 15, rv.color);
}

function drawRace() {
  const R = race, me = R.me;
  const sx = shake > 0 ? rand(-1, 1) * shake * 16 : 0, sy = shake > 0 ? rand(-1, 1) * shake * 10 : 0;
  ctx.save(); ctx.translate(sx, sy);
  drawBackground('race', R.cam, 0.15);
  // звёзды-скорость
  const sp = me.vx / SC_MAX;
  for (const s of R.stars) {
    const x = ((s.x - R.cam * s.z * 0.8) % W + W) % W;
    ctx.fillStyle = `rgba(255,255,255,${0.3 + s.z * 0.5})`;
    ctx.fillRect(x, s.y, 2 + sp * 30 * s.z, 2);
  }
  const cam = R.cam;
  // старт/финиш
  for (const fx of [200, R.len]) {
    const x = fx - cam + 30;
    if (x < -60 || x > W + 60) continue;
    for (let i = 0; i < 18; i++) for (let j = 0; j < 2; j++) { ctx.fillStyle = (i + j) % 2 ? '#fff' : '#141018'; ctx.fillRect(x + j * 20, i * 40, 20, 40); }
    outlinedText(fx === 200 ? 'СТАРТ' : 'ФИНИШ', x + 20, 40, 34, '#ffe14a');
  }
  for (const g of R.rings) {
    const x = g.x - cam; if (x < -80 || x > W + 80) continue;
    ctx.save(); ctx.translate(x, g.y);
    const took = g.taken.me;
    ctx.strokeStyle = INK; ctx.lineWidth = 14; ctx.beginPath(); ctx.ellipse(0, 0, 26, 70, 0, 0, 7); ctx.stroke();
    ctx.strokeStyle = took ? 'rgba(125,255,58,0.35)' : '#7dff3a'; ctx.lineWidth = 8; ctx.shadowColor = '#7dff3a'; ctx.shadowBlur = took ? 0 : 20; ctx.stroke();
    ctx.restore();
  }
  for (const g of R.gates) {
    const x = g.x - cam; if (x < -80 || x > W + 80) continue;
    ctx.fillStyle = '#3a3f4a'; ctx.fillRect(x - 16, 0, 32, g.gap); ctx.fillRect(x - 16, g.gap + g.h, 32, H);
    const fl = 0.7 + Math.sin(gameTime * 40) * 0.3;
    ctx.fillStyle = `rgba(255,40,60,${0.5 * fl})`; ctx.fillRect(x - 10, 0, 20, g.gap - 6); ctx.fillRect(x - 10, g.gap + g.h + 6, 20, H);
    ctx.fillStyle = '#fff'; ctx.fillRect(x - 2, 0, 4, g.gap - 6); ctx.fillRect(x - 2, g.gap + g.h + 6, 4, H);
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(x - 20, g.gap - 10, 40, 10); ctx.fillRect(x - 20, g.gap + g.h, 40, 10);
  }
  for (const o of R.obs) {
    if (o.dead) continue;
    const x = o.x - cam; if (x < -100 || x > W + 100) continue;
    ctx.save(); ctx.translate(x, o.y);
    if (o.kind === 'rock') {
      ctx.rotate(o.rot);
      ctx.beginPath(); for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2, rr = o.r * (0.8 + hash2(i, Math.floor(o.x)) * 0.35); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath();
      inkPath('#7a6a7a', 3);
      ctx.fillStyle = '#5a4a5a'; ctx.beginPath(); ctx.arc(o.r * 0.25, -o.r * 0.2, o.r * 0.22, 0, 7); ctx.arc(-o.r * 0.3, o.r * 0.25, o.r * 0.15, 0, 7); ctx.fill();
    } else {
      ctx.rotate(o.t * 2);
      ctx.strokeStyle = INK; ctx.lineWidth = 4; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 16, Math.sin(a) * 16); ctx.lineTo(Math.cos(a) * 30, Math.sin(a) * 30); ctx.stroke(); }
      ctx.beginPath(); ctx.arc(0, 0, 20, 0, 7); inkPath('#3a3a44', 3);
      ctx.fillStyle = Math.sin(o.t * 10) > 0 ? '#ff2a2a' : '#5a1a1a'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, 7); ctx.fill();
    }
    ctx.restore();
  }
  for (const s of R.shots) { const x = s.x - cam; ctx.fillStyle = '#7ff6ff'; ctx.shadowColor = '#7ff6ff'; ctx.shadowBlur = 14; ctx.beginPath(); ctx.ellipse(x, s.y, 16, 5, 0, 0, 7); ctx.fill(); ctx.shadowBlur = 0; }
  // соперники и игрок
  const all = [...R.rivals.map(r => ({ r, x: r.x })), { r: me, x: me.x }].sort((a, b) => a.r.y - b.r.y);
  for (const { r } of all) {
    const x = r.x - cam + 30;
    if (x < -200 || x > W + 200) continue;
    if (r === me) {
      if (me.inv > 0 && Math.floor(me.inv * 14) % 2) continue;
      const tilt = clamp(me.vy / 1100, -0.28, 0.28) + (me.spin > 0 ? Math.sin(R.t * 30) * 0.5 : 0);
      drawScooter(x, me.y, R.t, '#e8343a', me.boost > 0 ? 1 : 0, true, tilt);
    } else drawRivalRacer(r, x, r.y, R.t);
  }
  // частицы в координатах трассы
  const savedCam = camX; camX = cam; drawParticles(); camX = savedCam;
  ctx.restore();

  // HUD гонки
  ctx.fillStyle = 'rgba(8,4,24,0.6)'; ctx.beginPath(); ctx.roundRect(W / 2 - 400, 12, 800, 48, 14); ctx.fill();
  const px = W / 2 - 380, pw = 760;
  ctx.fillStyle = '#2a2238'; ctx.fillRect(px, 33, pw, 6);
  for (const rv of R.rivals) { const k = clamp(rv.x / R.len, 0, 1); ctx.fillStyle = rv.color; ctx.beginPath(); ctx.arc(px + pw * k, 36, 8, 0, 7); ctx.fill(); }
  drawJimFace(px + pw * clamp(me.x / R.len, 0, 1), 36, 36, gameTime);
  ctx.fillStyle = '#fff'; ctx.fillRect(px + pw - 2, 22, 4, 28);
  const place = racePlace();
  outlinedText(place + ' / 4', 90, 50, 56, place === 1 ? '#ffe14a' : '#ff9f9f');
  outlinedText('МЕСТО', 90, 92, 20, '#fff');
  outlinedText(Math.round(me.vx / 3) + ' км/с', W - 90, 50, 30, me.boost > 0 ? '#7dff3a' : '#fff');
  plainText('↑↓ — рулить  •  → газ  ← тормоз  •  X — стрелять', W / 2, H - 22, 16, 'rgba(255,255,255,0.7)');
  if (R.countdown > 0) {
    const n = Math.ceil(R.countdown - 0.6);
    const txt = n >= 1 ? String(n) : 'ВПЕРЁД!';
    const k = (R.countdown - 0.6) % 1;
    outlinedText(txt, W / 2, H / 2 - 40, n >= 1 ? 160 + k * 40 : 120, n >= 1 ? '#ffe14a' : '#7dff3a');
    if (R.countdown > 2.6) outlinedText(LEVELS[curLevel].name, W / 2, H / 2 + 90, 40, '#ff9fd0');
  }
  if (me.finished) outlinedText(me.place === 1 ? 'ПОБЕДА! 1 МЕСТО!' : `${me.place} МЕСТО… Нужно первое!`, W / 2, H / 2 - 60, 64, me.place === 1 ? '#ffe14a' : '#ff9f9f');
}
