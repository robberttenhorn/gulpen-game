// Minigames voor de nieuwe missies: muizen vangen, tuutjes trekken, bommetje, gyros en stempelen.
// Elk spel geeft een Promise terug met de uitslag, of null als de missie gestopt is.
import * as THREE from 'three';
import { makeCharacter } from './character.js';
import { popText, flash, shake, bump, makeCombo, Particles, fitCanvas } from './minifx.js';

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });
const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m; };

function runMini(g, update, cleanup, debug = null) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (r) => { if (done) return; done = true; g.minigame = null; cleanup?.(); resolve(r); };
    g.minigame = { stop: () => finish(null), update: (dt) => update(dt, finish), debug };
  });
}

// Beeldlaag met kop, inhoud en stopknop.
function overlay(g, title, inner, hint) {
  const ov = document.createElement('div');
  ov.className = 'mini-overlay';
  ov.innerHTML = `<div class="mini-head"><b>${title}</b><span class="mini-score"></span><button class="mini-stop" type="button">Stoppen</button></div>${inner}<div class="mini-hint">${hint}</div>`;
  document.getElementById('hud').prepend(ov);
  document.body.classList.add('pov');
  ov.querySelector('.mini-stop').addEventListener('click', () => g.missions.stop());
  // tikken telt als actie
  ov.addEventListener('pointerdown', (e) => { if (!e.target.closest('.mini-stop')) g.input.actionPressed = true; });
  const close = () => { ov.remove(); document.body.classList.remove('pov'); };
  return { ov, close, score: (t) => { ov.querySelector('.mini-score').textContent = t; } };
}
const pressed = (g) => { const p = g.input.consumeAction() || g.input.spacePressed; g.input.spacePressed = false; return p; };

// ---- hulpjes voor het voortekenen van de canvas-spellen (alles procedureel, geen plaatjes).
// Wat niet beweegt wordt één keer in een los canvas getekend en daarna per beeld alleen nog gekopieerd.
const sheet = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return [c, c.getContext('2d')]; };
// vaste 'willekeur', zodat een textuur er elke keer hetzelfde uitziet (en het toeval van het spel met rust laat)
const seeded = (s) => () => (s = (s * 16807) % 2147483647) / 2147483647;
const lin = (x, x0, y0, x1, y1, stops) => { const gr = x.createLinearGradient(x0, y0, x1, y1); stops.forEach(([p, c]) => gr.addColorStop(p, c)); return gr; };
const rrect = (x, px, py, w, h, r) => { x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r); x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath(); };
const oval = (x, px, py, rx, ry) => { x.beginPath(); x.ellipse(px, py, rx, ry, 0, 0, 7); };
// zachte vlek (schaduw of gloed): kleur als 'r,g,b', loopt naar de rand uit tot niets
const blob = (x, px, py, rx, ry, rgb, a) => {
  x.save(); x.translate(px, py); x.scale(rx, ry);
  const gr = x.createRadialGradient(0, 0, 0, 0, 0, 1);
  gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(0.55, `rgba(${rgb},${a * 0.45})`); gr.addColorStop(1, `rgba(${rgb},0)`);
  x.fillStyle = gr; x.beginPath(); x.arc(0, 0, 1, 0, 7); x.fill(); x.restore();
};
// glanzende wandtegels met voegen, van boven tot yMax
const drawTiles = (x, W, yMax, s, rnd) => {
  const gap = Math.max(1, s * 0.06);
  x.fillStyle = '#6f675c'; x.fillRect(0, 0, W, yMax);
  for (let ty = 0; ty < yMax; ty += s) for (let tx = 0; tx < W; tx += s) {
    const w = s - gap;
    x.fillStyle = `hsl(${200 + rnd() * 20}, 22%, ${90 + rnd() * 5}%)`; x.fillRect(tx, ty, w, w);
    x.fillStyle = lin(x, tx, ty, tx + w, ty + w, [[0, 'rgba(255,255,255,0.55)'], [0.45, 'rgba(255,255,255,0)'], [1, 'rgba(40,50,70,0.13)']]); x.fillRect(tx, ty, w, w);
    x.fillStyle = 'rgba(255,255,255,0.7)'; x.fillRect(tx, ty, w, gap * 0.7); x.fillRect(tx, ty, gap * 0.7, w);
    x.fillStyle = 'rgba(30,30,40,0.18)'; x.fillRect(tx, ty + w - gap * 0.8, w, gap * 0.8); x.fillRect(tx + w - gap * 0.8, ty, gap * 0.8, w);
  }
};

// ---- texturen voor de DOM-spellen (baksteen, stoep, hout, papier, inkt): één keer getekend en daarna
// als CSS-achtergrond gebruikt (via --variabelen op de beeldlaag).
let domTex = null;
function domTextures() {
  if (domTex) return domTex;
  const url = (c) => `url(${c.toDataURL('image/png')})`;
  const t = {};
  { // metselwerk in halfsteens verband, elke steen een eigen tint
    const rnd = seeded(3), [c, x] = sheet(384, 208), bw = 96, bh = 26, j = 4;
    x.fillStyle = '#a39280'; x.fillRect(0, 0, 384, 208);
    for (let row = 0; row < 8; row++) {
      x.fillStyle = 'rgba(40,24,14,0.35)'; x.fillRect(0, row * bh - j / 2, 384, 1.5); // schaduw in de lintvoeg
      for (let col = 0; col < 4; col++) {
        const bx = col * bw + (row % 2 ? bw / 2 : 0), by = row * bh;
        const tint = `hsl(${9 + rnd() * 12}, ${36 + rnd() * 16}%, ${30 + rnd() * 13}%)`;
        const spots = Array.from({ length: 8 }, () => [rnd() * (bw - j - 6), rnd() * (bh - j - 4), rnd() < 0.5]);
        for (const ox of [bx, bx - 384]) {
          x.fillStyle = tint; x.fillRect(ox + j / 2, by + j / 2, bw - j, bh - j);
          for (const [sx, sy, dark] of spots) { x.fillStyle = dark ? 'rgba(40,16,10,0.25)' : 'rgba(255,214,180,0.16)'; x.fillRect(ox + j / 2 + sx, by + j / 2 + sy, 5, 3); }
          x.fillStyle = 'rgba(255,224,194,0.26)'; x.fillRect(ox + j / 2, by + j / 2, bw - j, 2); x.fillRect(ox + j / 2, by + j / 2, 2, bh - j);
          x.fillStyle = 'rgba(30,10,6,0.32)'; x.fillRect(ox + j / 2, by + bh - j / 2 - 2, bw - j, 2); x.fillRect(ox + bw - j / 2 - 2, by + j / 2, 2, bh - j);
        }
      }
    }
    t.brick = url(c);
  }
  { // stoeptegels in perspectief, met de schaduw aan de voet van de muur
    const rnd = seeded(9), W = 1040, H = 184, [c, x] = sheet(W, H);
    x.fillStyle = '#57524b'; x.fillRect(0, 0, W, H);
    const rows = [0, 30, 70, 122, 190], vpY = -330, tw = 170, cx = W / 2;
    const xAt = (k, y) => cx + k * tw * ((y - vpY) / (H - vpY));
    for (let r = 0; r < rows.length - 1; r++) for (let k = -6; k < 6; k++) {
      const y0 = rows[r], y1 = rows[r + 1], off = r % 2 ? 0.5 : 0;
      x.beginPath(); x.moveTo(xAt(k + off, y0) + 2, y0 + 2); x.lineTo(xAt(k + 1 + off, y0) - 2, y0 + 2); x.lineTo(xAt(k + 1 + off, y1) - 2, y1 - 1); x.lineTo(xAt(k + off, y1) + 2, y1 - 1); x.closePath();
      x.fillStyle = `hsl(${30 + rnd() * 10}, ${6 + rnd() * 5}%, ${60 + rnd() * 9}%)`; x.fill();
    }
    for (let i = 0; i < 1400; i++) { x.fillStyle = rnd() < 0.5 ? `rgba(0,0,0,${0.04 + rnd() * 0.1})` : `rgba(255,255,255,${0.05 + rnd() * 0.12})`; x.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 3, 1 + rnd() * 2); }
    x.fillStyle = lin(x, 0, 0, 0, 34, [[0, 'rgba(20,12,8,0.85)'], [0.35, 'rgba(20,12,8,0.4)'], [1, 'rgba(20,12,8,0)']]); x.fillRect(0, 0, W, 34);
    t.stoep = url(c);
  }
  { // bureaublad: donker eiken planken met nerf
    const rnd = seeded(17), W = 512, H = 256, [c, x] = sheet(W, H), ph = 64;
    for (let p = 0; p < 4; p++) {
      const y0 = p * ph;
      x.save(); x.beginPath(); x.rect(0, y0, W, ph); x.clip();
      x.fillStyle = `hsl(${20 + rnd() * 8}, 42%, ${23 + rnd() * 6}%)`; x.fillRect(0, y0, W, ph);
      for (let i = 0; i < 30; i++) {
        const yy = y0 + rnd() * ph, k = 1 + Math.floor(rnd() * 3), ph2 = rnd() * 6.28, amp = 1 + rnd() * 3.5;
        x.beginPath();
        for (let sx = 0; sx <= W; sx += 8) { const y = yy + Math.sin((sx / W) * 6.2832 * k + ph2) * amp; if (!sx) x.moveTo(sx, y); else x.lineTo(sx, y); }
        x.strokeStyle = rnd() < 0.6 ? `rgba(20,8,2,${0.12 + rnd() * 0.26})` : `rgba(255,200,140,${0.05 + rnd() * 0.1})`; x.lineWidth = 0.6 + rnd() * 1.4; x.stroke();
      }
      const sx0 = rnd() * W; x.fillStyle = 'rgba(12,5,2,0.6)'; x.fillRect(sx0, y0, 2, ph); // kopse naad
      x.restore();
      x.fillStyle = 'rgba(10,4,1,0.7)'; x.fillRect(0, y0, W, 2); x.fillStyle = 'rgba(255,210,160,0.12)'; x.fillRect(0, y0 + 2, W, 1);
    }
    t.hout = url(c);
  }
  { // papiervezels
    const rnd = seeded(29), [c, x] = sheet(160, 160);
    for (let i = 0; i < 520; i++) { x.fillStyle = rnd() < 0.5 ? `rgba(120,100,60,${0.03 + rnd() * 0.06})` : `rgba(255,255,255,${0.2 + rnd() * 0.3})`; x.fillRect(rnd() * 160, rnd() * 160, 1 + rnd() * 3, 1); }
    t.papier = url(c);
  }
  { // inktmasker: een stempel pakt nooit overal even goed
    const rnd = seeded(41), [c, x] = sheet(120, 60);
    x.fillStyle = '#000'; x.fillRect(0, 0, 120, 60);
    x.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 240; i++) { x.fillStyle = `rgba(0,0,0,${0.25 + rnd() * 0.55})`; x.beginPath(); x.arc(rnd() * 120, rnd() * 60, 0.4 + rnd() * 1.2, 0, 7); x.fill(); }
    t.inkt = url(c);
  }
  domTex = t;
  return t;
}

// ------------------------------------------------------------ muizen vangen (Bakkerij Pijls)

function makeMouse() {
  const g = new THREE.Group();
  const grey = std(0x8a8580, { roughness: 0.9 });
  const body = mesh(new THREE.SphereGeometry(0.1, 10, 8), grey, 0, 0.08, 0);
  body.scale.set(0.8, 0.7, 1.3);
  g.add(body);
  g.add(mesh(new THREE.SphereGeometry(0.06, 8, 6), grey, 0, 0.1, 0.13));
  for (const s of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.035, 6, 4), std(0xf0b8b8), s * 0.04, 0.16, 0.11));
  const tail = mesh(new THREE.CylinderGeometry(0.008, 0.004, 0.25, 4), std(0xf0b8b8), 0, 0.06, -0.24);
  tail.rotation.x = Math.PI / 2.2;
  g.add(tail);
  g.scale.setScalar(1.4);
  return g;
}

// Muizen in een binnenruimte vangen door er bovenop te lopen.
export function startMice(g, room, { n = 6, limit = 60 } = {}) {
  const mice = [];
  for (let i = 0; i < n; i++) {
    const m = makeMouse();
    let x = room.ox + (Math.random() - 0.5) * (room.w - 2), z = room.oz + (Math.random() - 0.5) * (room.d - 2);
    [x, z] = room.collide(x, z, 0.2);
    m.position.set(x, 0, z);
    g.scene.add(m);
    mice.push({ m, x, z, h: Math.random() * 6.28, speed: 0, turn: 0, caught: false });
  }
  let t = 0, caught = 0;
  return runMini(g, (dt, finish) => {
    t += dt;
    const p = g.player;
    for (const ms of mice) {
      if (ms.caught) continue;
      const d = Math.hypot(p.x - ms.x, p.z - ms.z);
      ms.turn -= dt;
      if (d < 3.2) {
        if (ms.turn <= 0) { ms.turn = 0.35 + Math.random() * 0.4; ms.h = Math.atan2(ms.x - p.x, ms.z - p.z) + (Math.random() - 0.5) * 2.2; }
        ms.speed += (3.4 - ms.speed) * Math.min(1, dt * 6);
      } else {
        if (ms.turn <= 0) { ms.turn = 0.8 + Math.random() * 1.5; ms.h += (Math.random() - 0.5) * 3; ms.speed = Math.random() < 0.4 ? 0 : 1.2; }
      }
      const nx = ms.x + Math.sin(ms.h) * ms.speed * dt, nz = ms.z + Math.cos(ms.h) * ms.speed * dt;
      const [rx, rz, bumped] = room.collide(nx, nz, 0.15);
      if (bumped) ms.h += Math.PI / 2 + Math.random();
      ms.x = rx; ms.z = rz;
      ms.bob = (ms.bob || 0) + dt * ms.speed * 9;
      ms.m.position.set(ms.x, Math.abs(Math.sin(ms.bob)) * 0.05 * Math.min(1, ms.speed), ms.z);
      ms.m.rotation.y = ms.h;
      if (d < 0.65) {
        ms.caught = true; caught++;
        // platgedrukt, dan weg
        const mm = ms.m;
        let k = 0;
        const squash = () => { k += 0.08; mm.scale.set(1.4 + k, Math.max(0.15, 1.4 - k * 4), 1.4 + k); if (k < 0.35) requestAnimationFrame(squash); else setTimeout(() => g.scene.remove(mm), 250); };
        squash();
        g.fx?.confetti?.(ms.x, 0.3, ms.z, 18);
        g.ui.toast(['Piep!', 'Hebbes!', 'Weg met dat beest!', 'Nog eentje!', 'Piiiiep!', 'Laatste!'][Math.min(5, caught - 1)], 900);
        g.sfx?.play('pop');
        g.missions.progress(`${caught} / ${n} muizen`);
        g.shake = 0.15;
      }
    }
    g.ui.timer(`${Math.max(0, Math.ceil(limit - t))} s`);
    if (caught >= n) finish({ caught, n, time: t });
    else if (t > limit) finish({ caught, n, late: true });
  }, () => { mice.forEach((ms) => g.scene.remove(ms.m)); g.ui.timer(null); }, { mice, label: null });
}

// ------------------------------------------------------------ tuutjes trekken

const LOOKERS = [
  ['Je tante', 'Hé! Ben jij dat? Ik zeg niks tegen je moeder... nou ja, misschien een beetje.'],
  ['De buurvrouw', 'Zo zo, druk weekend gepland?'],
  ['Prins Carnaval', 'Alaaf! Goed bezig, jongen. Veilig vrijen is ook carnaval!'],
  ['Je oude juf', 'Ik wist altijd al dat jij een doorzetter was.'],
  ['De nachtburgemeester', 'Officieel heb ik dit niet gezien.'],
  ['Je ex', 'Haha. Succes ermee. Je gaat het nodig hebben.'],
];

// Aan de knop van de automaat draaien zonder betrapt te worden.
// Een straatje met de DA-gevel en de automaat. Voorbijgangers lopen over de stoep binnen, blijven staan en staren,
// en lopen daarna weer door. Draai je terwijl iemand kijkt, dan ben je betrapt. Sta je stil, dan fluit de jongen onschuldig.
export function startTuutjes(g) {
  const ui = overlay(g, 'Tuutjes trekken', `
    <div class="tz-scene">
      <div class="tz-street">
        <div class="tz-shop"><i style="left:10%"></i><i style="left:30%;background:#b3e5fc"></i><i style="left:52%;background:#ffe082"></i><i style="left:74%;background:#c5e1a5"></i></div>
        <div class="tz-post"></div>
        <div class="tz-box"><div class="tz-window">TUUTJES<small>3 stuks · extra veilig</small></div><div class="tz-knob"><i></i></div><div class="tz-slot"></div><div class="tz-pack"></div></div>
        <div class="tz-boy"><span class="tz-face">😬</span><span class="tz-torso"></span><span class="tz-legs"></span></div>
        <div class="tz-walker"><span class="tz-eyes">👀</span><span class="tz-face">🙂</span><span class="tz-torso"></span><span class="tz-legs"></span></div>
        <div class="tz-alarm">👣 Er komt iemand aan!</div>
        <div class="tz-bubble"><b class="tz-who"></b><small class="tz-say"></small></div>
      </div>
      <div class="tz-meters"><div>Draaien <div class="bar"><i class="tz-prog"></i></div></div><div>Schaamte <span class="tz-shame">😊😊😊</span></div></div>
    </div>`, g.input.isTouch ? 'Tik snel om aan de knop te draaien · stop als er iemand kijkt!' : 'Druk snel op E of spatie om te draaien · stop als er iemand kijkt!');
  const $ = (q) => ui.ov.querySelector(q);
  const tex = domTextures(); // alleen uiterlijk: baksteen en stoeptegels
  ui.ov.style.setProperty('--tz-brick', tex.brick); ui.ov.style.setProperty('--tz-stoep', tex.stoep);
  const faces = { 'Je tante': '👵', 'De buurvrouw': '👩', 'Prins Carnaval': '🤴', 'Je oude juf': '👩‍🏫', 'De nachtburgemeester': '🕵️', 'Je ex': '😏' };
  const shirts = { 'Je tante': '#8e24aa', 'De buurvrouw': '#ef6c00', 'Prins Carnaval': '#c62828', 'Je oude juf': '#00897b', 'De nachtburgemeester': '#263238', 'Je ex': '#ad1457' };
  const walker = $('.tz-walker'), boy = $('.tz-boy'), bubble = $('.tz-bubble');
  const STARE_X = 30; // waar de voorbijganger blijft staan (procent van de breedte)
  let prog = 0, shame = 0, state = 'rustig', stT = 1.6 + Math.random() * 1.4, looker = null, rot = 0, spin = 0, caught = false, done = 0;
  let wx = -20, wFrom = -20, wTo = -20, wDur = 1, wT = 1, lastPress = -9, t = 0, noteT = 0;
  const say = (who, text, kind, tailX) => {
    bubble.className = 'tz-bubble on ' + (kind || '');
    $('.tz-who').textContent = who; $('.tz-say').textContent = text || '';
    bubble.style.setProperty('--tail', tailX + '%');
  };
  const hush = () => { bubble.className = 'tz-bubble'; };
  const walkTo = (to, dur) => { wFrom = wx; wTo = to; wDur = dur; wT = 0; };
  const setState = (st) => {
    state = st;
    $('.tz-alarm').classList.toggle('on', st === 'komt');
    walker.classList.toggle('staring', st === 'kijkt');
    if (st === 'rustig') { stT = 1.3 + Math.random() * 2.0; }
    if (st === 'komt') {
      stT = 1.0; caught = false;
      looker = LOOKERS[Math.floor(Math.random() * LOOKERS.length)];
      walker.querySelector('.tz-face').textContent = faces[looker[0]] || '🙂';
      walker.querySelector('.tz-torso').style.background = shirts[looker[0]] || '#546e7a';
      wx = -20; walkTo(STARE_X, 1.0);
      hush();
    }
    if (st === 'kijkt') { stT = 1.3 + Math.random() * 1.2; say(looker[0] + ' kijkt!', 'Niet draaien nu...', 'bad', STARE_X); }
    if (st === 'weg') {
      stT = 1.2; walkTo(125, 1.2);
      if (!caught) { say('Pfoe, niks gezien.', 'Gewoon even een kauwgompje kopen... 😇', 'ok', 88); g.sfx?.play('coin'); }
      else hush();
    }
  };
  return runMini(g, (dt, finish) => {
    t += dt; stT -= dt;
    g.player.lockedFor = true;
    // voorbijganger over de stoep laten lopen
    if (wT < 1) { wT = Math.min(1, wT + dt / wDur); const e = wT < 1 ? wT : 1; wx = wFrom + (wTo - wFrom) * e; }
    walker.style.left = wx + '%';
    walker.classList.toggle('walking', wT < 1);
    if (done) { done -= dt; if (done <= 0) finish({ ok: true, shame }); return; }
    if (stT <= 0) setState(state === 'rustig' ? 'komt' : state === 'komt' ? 'kijkt' : state === 'kijkt' ? 'weg' : 'rustig');
    if (state === 'weg' && stT < 0.5 && !caught) hush();
    if (pressed(g)) {
      lastPress = t;
      if (state === 'kijkt') {
        if (!caught) {
          caught = true; shame++;
          say(looker[0] + ': BETRAPT!', `"${looker[1]}"`, 'bad', STARE_X);
          flash(ui.ov, 'bad'); shake($('.tz-street'), true); bump($('.tz-shame'));
          g.sfx?.play('fail');
          stT = Math.max(stT, 1.6); // even laten staan, zodat je de opmerking kunt lezen
        }
      } else {
        prog = Math.min(1, prog + 0.055);
        spin += 560;
        shake($('.tz-box'));
        boy.classList.remove('crank'); void boy.offsetWidth; boy.classList.add('crank');
        if (Math.random() < 0.45) popText(ui.ov, ['krrr', 'klik', 'rrrt'][Math.floor(Math.random() * 3)], 62 + Math.random() * 10, 40 + Math.random() * 8, 'small');
        g.sfx?.play('cart');
      }
    }
    // gezicht van de jongen: zenuwachtig, druk bezig, betrapt of onschuldig fluitend
    const busy = t - lastPress < 0.35;
    const innocent = state === 'kijkt' && !caught && !busy;
    boy.querySelector('.tz-face').textContent = caught && state === 'kijkt' ? '😳' : innocent ? '😗' : busy ? '😅' : state === 'komt' ? '😟' : '😬';
    boy.classList.toggle('innocent', innocent);
    if (innocent && (noteT -= dt) <= 0) {
      noteT = 0.55;
      const n = document.createElement('div'); n.className = 'tz-note'; n.textContent = Math.random() < 0.5 ? '♪' : '♫';
      $('.tz-street').appendChild(n); setTimeout(() => n.remove(), 1200);
    }
    // knop draait door met vaart en remt af
    rot += spin * dt; spin *= Math.pow(0.04, dt);
    $('.tz-knob').style.transform = `rotate(${rot}deg)`;
    $('.tz-prog').style.width = prog * 100 + '%';
    $('.tz-prog').parentElement.classList.toggle('hot', prog > 0.8);
    $('.tz-box').classList.toggle('glow', prog > 0.8);
    $('.tz-shame').textContent = '😳'.repeat(shame) + '😊'.repeat(Math.max(0, 3 - shame));
    ui.score(`${Math.round(prog * 100)}%`);
    if (prog >= 1) {
      // pakje valt uit de automaat
      $('.tz-pack').classList.add('drop');
      boy.querySelector('.tz-face').textContent = '😁';
      say('Gelukt!', 'Snel in je zak ermee, voor iemand het ziet.', 'ok', 88);
      popText(ui.ov, 'Gelukt!', 50, 30, 'gold big');
      flash(ui.ov, 'gold');
      g.sfx?.play('coin');
      done = 1.6;
    } else if (shame >= 3) finish({ ok: false, shame });
  }, () => { ui.close(); g.player.lockedFor = false; }, { state: () => (state === 'weg' ? 'rustig' : state), prog: () => prog, label: 'Draai!' });
}

// ------------------------------------------------------------ bommetje (Mosaqua)

// Drie sprongen vanaf de springplank: kracht kiezen, dan op tijd 'bommetje' maken.
export function startBommetje(g, room) {
  const L = (x, y, z) => new THREE.Vector3(room.ox + x, y, room.oz + z);
  const jumper = makeCharacter({ shirt: 0xf0c8a0, sleeves: 'short', pants: 0x1565c0, shoes: 0xf0c8a0, hair: 0x3b2a1a });
  g.scene.add(jumper);
  g.player.group.visible = false;
  const start = L(room.board.x, 1.32, room.board.z), end = L(room.boardEnd.x, room.boardEnd.y, room.boardEnd.z);
  jumper.position.copy(start);
  jumper.rotation.y = Math.PI / 2;
  // staand scherm (telefoon): camera schuin achter het bad, langs de plank kijken, zodat de plank en het water allebei in beeld zijn
  const portrait = innerWidth < innerHeight;
  const oldFov = g.camera.fov;
  if (portrait) { g.camera.fov = 68; g.camera.updateProjectionMatrix(); }
  g.pov = portrait ? { pos: L(3.2, 4.2, 5.2), look: L(-4.2, 1.4, -1.2), snap: false } : { pos: L(-1, 3.2, 6), look: L(-1.5, 2.2, -1), snap: false };
  const ui = overlay(g, 'Bommetje!', `<div class="bm-judges"></div><div class="tt-task"><div class="tt-step"></div><div class="tt-hint"></div><div class="tt-bar"><div class="tt-zone" style="left:80%;width:20%"></div><div class="tt-perfect" style="left:92%;width:8%"></div><div class="tt-needle"></div></div></div>`,
    g.input.isTouch ? 'Tik voor de sprong, tik nog eens als je hoog in de lucht bent voor een bommetje' : 'E of spatie: springen, en nog eens in de lucht voor een bommetje');
  const $ = (s) => ui.ov.querySelector(s);
  const scores = [];
  let jump = 0, phase = 'loop', t = 0, power = 0, tuck = 0, tuckAt = 0, fx = 0;
  const startJump = () => {
    phase = 'walk'; t = 0; tuck = 0; tuckAt = 0;
    jumper.position.copy(start);
    $('.tt-step').textContent = `Sprong ${jump + 1} / 3`;
    $('.tt-hint').textContent = 'Tik als de balk bijna vol is!';
    $('.tt-bar').style.display = 'block';
  };
  startJump();
  return runMini(g, (dt, finish) => {
    t += dt;
    g.player.lockedFor = true;
    const pr = pressed(g);
    if (phase === 'walk') {
      // over de plank naar het einde lopen
      const k = Math.min(1, t / 1.0);
      jumper.position.lerpVectors(start, end, k);
      jumper.userData.animate(dt, 2.5, 'walk');
      if (k >= 1) { phase = 'power'; t = 0; }
    } else if (phase === 'power') {
      power = (Math.sin(t * 3.2 - Math.PI / 2) + 1) / 2;
      $('.tt-needle').style.left = power * 100 + '%';
      jumper.position.y = end.y + Math.max(0, Math.sin(t * 6.4)) * 0.12; // veren op de plank
      jumper.userData.animate(dt, 0, 'idle');
      $('.tt-bar').classList.toggle('hot', power > 0.8);
      if (pr) {
        phase = 'air'; t = 0; $('.tt-bar').style.display = 'none'; $('.tt-hint').textContent = 'Nu! Bommetje maken!';
        popText(ui.ov, power > 0.92 ? 'Topsprong!' : power > 0.8 ? 'Mooie sprong' : 'Slap...', 50, 40, power > 0.8 ? 'gold' : 'bad');
        g.sfx?.play('kick');
      }
    } else if (phase === 'air') {
      const T = 0.9 + power * 0.5, H = 1.5 + power * 2.6, D = 2.5 + power * 3;
      const k = Math.min(1, t / T);
      jumper.position.set(end.x + D * k, end.y + H * Math.sin(k * Math.PI * 0.9) - k * (end.y - 0.1) , end.z);
      // venster rond het hoogste punt
      const win = Math.abs(k - 0.45) < 0.13;
      if (pr && !tuckAt) {
        tuckAt = k; tuck = win ? 1 : Math.abs(k - 0.45) < 0.25 ? 0.55 : 0.2;
        popText(ui.ov, tuck === 1 ? 'BOMMETJE!' : tuck > 0.5 ? 'Bommetje' : 'Te laat...', 50, 30, tuck === 1 ? 'gold big' : tuck > 0.5 ? 'good' : 'bad');
      }
      jumper.userData.animate(dt, 0, tuckAt ? 'sit' : 'wave');
      // opgerold: salto voorover; anders zwaaiend met armen
      jumper.rotation.x = tuckAt ? -(k - tuckAt) * 9 : Math.sin(t * 10) * 0.1;
      // camera volgt de springer een beetje
      g.pov.look.set(jumper.position.x, jumper.position.y, jumper.position.z);
      if (k >= 1) {
        phase = 'splash'; t = 0;
        const q = (0.35 + power * 0.65) * (0.3 + tuck * 0.7);
        fx = q;
        g.fx?.splash(jumper.position.x, room.water.y + 0.1, jumper.position.z, 0.6 + q * 2.6);
        g.fx?.splash(jumper.position.x + 0.8, room.water.y + 0.1, jumper.position.z - 0.5, 0.4 + q * 1.6);
        g.sfx?.play('splash');
        g.pov.shake = 0.25 + q * 0.6;
        if (q > 0.5) {
          const drops = document.createElement('div');
          drops.className = 'fx-drops';
          for (let d = 0; d < Math.round(6 + q * 14); d++) { const e = document.createElement('i'); e.style.left = Math.random() * 100 + '%'; e.style.top = Math.random() * 80 + '%'; e.style.setProperty('--s', (0.6 + Math.random() * 1.4).toFixed(2)); drops.appendChild(e); }
          ui.ov.appendChild(drops);
          setTimeout(() => drops.remove(), 2000);
        }
        const judges = [0, 1, 2].map(() => Math.max(1, Math.min(10, Math.round(2 + q * 8 + (Math.random() - 0.5) * 2))));
        const avg = judges.reduce((a, b) => a + b, 0) / 3;
        scores.push(avg);
        $('.bm-judges').innerHTML = judges.map((j) => `<span>${j}</span>`).join('');
        $('.tt-hint').textContent = q > 0.75 ? 'MEGABOM! Het halve bad is leeg!' : q > 0.5 ? 'Mooie bom!' : tuckAt ? 'Een bommetje van niks...' : 'Dat was een plons, geen bom.';
        ui.score(`Totaal: ${scores.reduce((a, b) => a + b, 0).toFixed(1).replace('.', ',')}`);
      }
    } else if (phase === 'splash') {
      jumper.position.y = Math.max(-1.5, jumper.position.y - dt * 2);
      if (t > 2.2) {
        jump++;
        $('.bm-judges').innerHTML = '';
        jumper.rotation.x = 0;
        g.pov.look.copy(L(-1.5, 2.2, -1));
        if (jump >= 3) { const total = scores.reduce((a, b) => a + b, 0); finish({ total, scores }); return; }
        startJump();
      }
    }
    void fx;
  }, () => { ui.close(); g.scene.remove(jumper); g.player.group.visible = true; g.pov = null; g.player.lockedFor = false; if (portrait) { g.camera.fov = oldFov; g.camera.updateProjectionMatrix(); } }, { phase: () => phase, power: () => power, get label() { return phase === 'power' ? 'Spring!' : phase === 'air' ? 'Bom!' : null; } });
}

// ------------------------------------------------------------ gyros (Athene)

// Deel 1: plakjes van de draaiende gyros snijden als het goudbruine stuk bij het mes is.
// Het mes hakt, het plakje vliegt in de pita, het vet spettert. Deel 2: 'Opa!': borden kapotgooien.
export function startGyros(g, { need = 6, tries = 9 } = {}) {
  const ui = overlay(g, 'Gyros!', '<canvas class="mini-canvas"></canvas>', g.input.isTouch ? 'Tik als het donkere, krokante stuk bij het mes is (het mes licht op!). Het lichte vlees laat je nog grillen.' : 'E, spatie of klik als het donkere, krokante stuk bij het mes is (het mes licht op!). Het lichte vlees laat je nog grillen.');
  const cv = ui.ov.querySelector('canvas');
  const ctx = cv.getContext('2d');
  fitCanvas(cv);
  const parts = new Particles();
  const combo = makeCombo(ui.ov);
  const PLATES = 10, PLATE_TIME = 6;
  let phase = 'snijden', t = 0, band = 0.1, speed = 0.55, good = 0, used = 0, plates = 0, thrown = 0, chop = 0, spinT = 0, shakeT = 0;
  const pita = []; // plakjes in de pita
  const flying = []; // vliegende plakjes en borden
  // ---- voorgetekende lagen (één keer per canvasmaat): de zaak, het vlees, het mes, de borden
  let art = null;
  const bakeShared = (W, H) => {
    const u = H / 100, a = { W, H, cut: null, opa: null, slice: {} };
    // plakjes: krokant (goed), te licht en aangebrand
    const paint = { true: ['#a05a24', '#4e2510'], licht: ['#f6d8bc', '#d2a07e'], zwart: ['#48423e', '#0e0e0e'] };
    for (const k of Object.keys(paint)) {
      const [c, x] = sheet(4 * u, 1.8 * u);
      x.fillStyle = lin(x, 0, 0, 0, 1.8 * u, [[0, paint[k][0]], [1, paint[k][1]]]); rrect(x, 0, 0, 4 * u, 1.8 * u, 0.55 * u); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.3)'; x.fillRect(0.6 * u, 0.22 * u, 2.8 * u, 0.22 * u);
      a.slice[k] = c;
    }
    return a;
  };
  // Deel 1: betegelde wand, grill met gloeiende branders, stalen plateau, houten aanrecht en het bord met de pita
  const bakeCut = (W, H) => {
    const u = H / 100, cx = W / 2, top = 18 * u, bot = 78 * u, mid = (top + bot) / 2, rnd = seeded(7), a = {};
    const [bg, x] = sheet(W, H);
    const wallY = 76 * u;
    drawTiles(x, W, wallY, 10 * u, rnd);
    // Griekse sierrand: één rij blauwe tegels
    x.globalCompositeOperation = 'multiply'; x.fillStyle = '#5b8fd0'; x.fillRect(0, 30 * u, W, 10 * u);
    // warm licht van de grill op de wand, naar de randen toe donker
    const far = Math.max(W * 0.55, 95 * u);
    const wl = x.createRadialGradient(cx - 10 * u, 42 * u, 8 * u, cx, 46 * u, far);
    wl.addColorStop(0, '#fff6e8'); wl.addColorStop(0.35, '#dcb994'); wl.addColorStop(0.7, '#705341'); wl.addColorStop(1, '#2a1c13');
    x.fillStyle = wl; x.fillRect(0, 0, W, wallY);
    x.globalCompositeOperation = 'source-over';
    // houten aanrecht met nerf
    x.fillStyle = lin(x, 0, wallY, 0, H, [[0, '#2c1a0e'], [0.1, '#6b4326'], [0.55, '#5a361e'], [1, '#3a2213']]); x.fillRect(0, wallY, W, H - wallY);
    for (let i = 0; i < 90; i++) {
      const y = wallY + rnd() * (H - wallY), len = W * (0.15 + rnd() * 0.5);
      x.fillStyle = rnd() < 0.6 ? `rgba(28,14,5,${0.06 + rnd() * 0.14})` : `rgba(255,205,150,${0.03 + rnd() * 0.06})`;
      x.fillRect(rnd() * W - len * 0.3, y, len, u * (0.12 + rnd() * 0.3));
    }
    x.fillStyle = lin(x, 0, wallY, 0, wallY + 3 * u, [[0, 'rgba(0,0,0,0.55)'], [1, 'rgba(0,0,0,0)']]); x.fillRect(0, wallY, W, 3 * u);
    // grillkast van geborsteld staal, met de branders aan de kant van het vlees
    const hx = cx - 37 * u, hw = 14.5 * u, hy = top - 9 * u, hh = bot + 4 * u - hy;
    blob(x, hx + hw * 0.6, hy + hh + 0.5 * u, hw * 0.9, 3 * u, '0,0,0', 0.6);
    x.fillStyle = lin(x, hx, 0, hx + hw, 0, [[0, '#17181a'], [0.3, '#50555b'], [0.62, '#2e3135'], [1, '#1b1c1f']]); x.fillRect(hx, hy, hw, hh);
    for (let i = 0; i < 70; i++) { x.fillStyle = `rgba(255,255,255,${0.02 + rnd() * 0.05})`; x.fillRect(hx, hy + rnd() * hh, hw, Math.max(1, u * 0.08)); }
    x.fillStyle = lin(x, 0, hy, 0, hy + 2 * u, [[0, '#7c838a'], [1, '#3c4045']]); x.fillRect(hx - 0.6 * u, hy, hw + 1.2 * u, 2 * u);
    x.fillStyle = '#101113'; x.fillRect(hx - 0.6 * u, hy + hh - 1.6 * u, hw + 1.2 * u, 1.6 * u);
    // draaiknoppen
    for (let k = 0; k < 2; k++) {
      const kx = hx + 4 * u, kyy = hy + hh - (7 + k * 7) * u;
      oval(x, kx + 0.3 * u, kyy + 0.4 * u, 1.9 * u, 1.9 * u); x.fillStyle = 'rgba(0,0,0,0.5)'; x.fill();
      oval(x, kx, kyy, 1.8 * u, 1.8 * u); x.fillStyle = lin(x, kx - 2 * u, kyy - 2 * u, kx + 2 * u, kyy + 2 * u, [[0, '#9aa1a8'], [1, '#2a2d31']]); x.fill();
      x.fillStyle = '#e53935'; x.fillRect(kx - 0.2 * u, kyy - 1.6 * u, 0.4 * u, 1.3 * u);
    }
    const bx0 = cx - 26.2 * u, bw = 3.7 * u, by0 = top - 4 * u, bAll = bot + 1 * u - by0, bh = bAll / 4;
    x.fillStyle = '#0c0c0d'; x.fillRect(bx0 - 0.5 * u, by0 - 0.5 * u, bw + 1 * u, bAll + 1 * u);
    for (let k = 0; k < 4; k++) {
      const by = by0 + k * bh + 0.4 * u, h2 = bh - 0.8 * u;
      x.fillStyle = lin(x, 0, by, 0, by + h2, [[0, '#b83205'], [0.2, '#ff8a2a'], [0.5, '#ffb347'], [0.8, '#ff7a1c'], [1, '#a82c04']]); x.fillRect(bx0, by, bw, h2);
      x.fillStyle = 'rgba(70,14,0,0.5)';
      for (let yy = by; yy < by + h2; yy += 0.8 * u) x.fillRect(bx0, yy, bw, 0.22 * u);
      for (let xx = bx0; xx < bx0 + bw; xx += 0.8 * u) x.fillRect(xx, by, 0.22 * u, h2);
      x.fillStyle = 'rgba(255,240,190,0.35)'; x.fillRect(bx0 + bw * 0.3, by + h2 * 0.15, bw * 0.4, h2 * 0.7);
    }
    // gloed van de branders op de wand en de kast
    x.globalCompositeOperation = 'lighter';
    blob(x, cx - 22 * u, mid, 30 * u, 44 * u, '255,120,35', 0.42);
    x.globalCompositeOperation = 'source-over';
    // stalen plateau onder het vlees, met een plasje vet
    blob(x, cx + 3 * u, bot + 3.4 * u, 26 * u, 5.5 * u, '0,0,0', 0.7);
    oval(x, cx, bot + 2.3 * u, 20 * u, 3.6 * u); x.fillStyle = '#2c2f33'; x.fill();
    oval(x, cx, bot + 1.4 * u, 20 * u, 3.6 * u); x.fillStyle = lin(x, cx - 20 * u, 0, cx + 20 * u, 0, [[0, '#ff9a4a'], [0.07, '#8b8f94'], [0.3, '#eef1f3'], [0.55, '#9da4ab'], [1, '#4c5157']]); x.fill();
    oval(x, cx, bot + 1.5 * u, 17.5 * u, 2.9 * u); x.fillStyle = lin(x, 0, bot - 1.4 * u, 0, bot + 4.4 * u, [[0, '#4e5359'], [1, '#a4abb2']]); x.fill();
    oval(x, cx + 1 * u, bot + 1.9 * u, 13 * u, 1.9 * u); x.fillStyle = 'rgba(255,186,90,0.3)'; x.fill();
    // bord met de pita
    const py = 92 * u;
    blob(x, cx + 2 * u, py + 2.2 * u, 34 * u, 8 * u, '0,0,0', 0.6);
    oval(x, cx, py + 1.3 * u, 29 * u, 6.4 * u); x.fillStyle = '#9fa9b3'; x.fill();
    oval(x, cx, py + 0.6 * u, 29 * u, 6.4 * u); x.fillStyle = lin(x, cx - 29 * u, py - 6 * u, cx + 29 * u, py + 7 * u, [[0, '#ffffff'], [0.6, '#e9edf1'], [1, '#bfc8d1']]); x.fill();
    oval(x, cx, py + 0.6 * u, 27.6 * u, 5.9 * u); x.strokeStyle = '#1565c0'; x.lineWidth = 0.45 * u; x.stroke();
    oval(x, cx + 0.6 * u, py + 1.5 * u, 24.4 * u, 5.1 * u); x.fillStyle = 'rgba(40,40,60,0.28)'; x.fill();
    oval(x, cx, py + 1 * u, 24 * u, 5 * u); x.fillStyle = '#c4944e'; x.fill();
    x.save(); x.translate(cx, py); x.scale(24 * u, 5 * u);
    const pg = x.createRadialGradient(-0.25, -0.3, 0.05, 0, 0, 1);
    pg.addColorStop(0, '#fbecc6'); pg.addColorStop(0.6, '#f0d49b'); pg.addColorStop(0.92, '#e0b970'); pg.addColorStop(1, '#cf9f58');
    x.fillStyle = pg; x.beginPath(); x.arc(0, 0, 1, 0, 7); x.fill();
    // bruine bakplekjes
    for (let i = 0; i < 26; i++) {
      const an = rnd() * 6.28, rr = Math.sqrt(rnd()) * 0.86;
      x.fillStyle = `rgba(150,88,30,${0.1 + rnd() * 0.2})`;
      x.beginPath(); x.ellipse(Math.cos(an) * rr, Math.sin(an) * rr, 0.03 + rnd() * 0.07, 0.03 + rnd() * 0.07, 0, 0, 7); x.fill();
    }
    x.restore();
    // vignet over het geheel
    const vg = x.createRadialGradient(cx, 50 * u, 42 * u, cx, 50 * u, Math.max(W * 0.62, 100 * u));
    vg.addColorStop(0, 'rgba(8,4,2,0)'); vg.addColorStop(1, 'rgba(8,4,2,0.78)');
    x.fillStyle = vg; x.fillRect(0, 0, W, H);
    a.bg = bg;

    // vlees: één omwenteling als naadloze textuur (gestapelde lagen, bruine en roze plekken)
    const P = 32 * u, MH = bot - top + 2 * u, r2 = seeded(21);
    const [meat, m] = sheet(P, MH);
    m.fillStyle = lin(m, 0, 0, 0, MH, [[0, '#f3cfae'], [0.5, '#ebc09b'], [1, '#e0b089']]); m.fillRect(0, 0, P + 2, MH);
    const wrap = (px, fn) => { fn(px); fn(px - P); fn(px + P); };
    for (let i = 0; i < 10; i++) { // zachte verticale banen, zodat je het draaien ziet
      m.fillStyle = i % 2 ? 'rgba(170,90,60,0.13)' : 'rgba(255,240,224,0.16)';
      const bxx = (i / 10) * P;
      m.beginPath(); m.moveTo(bxx, 0);
      for (let yy = 0; yy <= MH; yy += 2 * u) m.lineTo(bxx + Math.sin(yy / u * 0.3 + i) * 0.5 * u, yy);
      for (let yy = MH; yy >= 0; yy -= 2 * u) m.lineTo(bxx + P / 10 + Math.sin(yy / u * 0.27 + i * 2) * 0.5 * u, yy);
      m.closePath(); m.fill();
    }
    // lappen vlees op elkaar gestapeld: golvende banden in net een andere tint, met een naad ertussen
    const waves = [];
    for (let ly = -1 * u; ly < MH + 4 * u; ly += (2.4 + r2() * 2.2) * u) waves.push({ y: ly, ph: r2() * 6.28, k: 1 + Math.floor(r2() * 3), amp: (0.3 + r2() * 0.7) * u, ph2: r2() * 6.28 });
    const wy = (w, sx) => w.y + Math.sin((sx / P) * 6.2832 * w.k + w.ph) * w.amp + Math.sin((sx / P) * 6.2832 * 5 + w.ph2) * w.amp * 0.3;
    for (let i = 0; i < waves.length - 1; i++) {
      m.beginPath();
      for (let sx = 0; sx <= P + 2; sx += P / 48) m.lineTo(sx, wy(waves[i], sx));
      for (let sx = P + 2; sx >= 0; sx -= P / 48) m.lineTo(sx, wy(waves[i + 1], sx));
      m.closePath();
      m.fillStyle = [`rgba(196,112,84,${0.1 + r2() * 0.12})`, `rgba(255,236,216,${0.1 + r2() * 0.14})`, `rgba(214,150,110,${0.08 + r2() * 0.1})`][i % 3]; m.fill();
      m.beginPath();
      for (let sx = 0; sx <= P + 2; sx += P / 48) m.lineTo(sx, wy(waves[i + 1], sx));
      m.strokeStyle = 'rgba(150,78,52,0.3)'; m.lineWidth = 0.2 * u; m.stroke();
    }
    for (let i = 0; i < 46; i++) { // rozere en bruinere plekken
      const px = r2() * P, pyy = r2() * MH, rx = (0.8 + r2() * 2.4) * u, ry = (0.4 + r2() * 0.9) * u;
      m.fillStyle = r2() < 0.5 ? `rgba(200,104,82,${0.1 + r2() * 0.16})` : `rgba(255,232,214,${0.14 + r2() * 0.2})`;
      wrap(px, (q) => { m.beginPath(); m.ellipse(q, pyy, rx, ry, 0, 0, 7); m.fill(); });
    }
    for (let i = 0; i < 60; i++) { const px = r2() * P, pyy = r2() * MH; m.fillStyle = 'rgba(255,244,226,0.45)'; m.fillRect(px, pyy, 0.35 * u, 0.2 * u); } // vetglans
    a.meat = meat; a.P = P; a.MH = MH;

    // de donkere, krokante strook
    const [band, b] = sheet(6 * u, MH);
    b.fillStyle = lin(b, 0, 0, 6 * u, 0, [[0, '#8a4a1c'], [0.16, '#5e2e12'], [0.55, '#472009'], [0.86, '#5a2b11'], [1, '#7a4018']]); b.fillRect(0, 0, 6 * u + 1, MH);
    for (let i = 0; i < 80; i++) {
      b.fillStyle = `rgba(30,12,3,${0.35 + r2() * 0.4})`;
      b.beginPath(); b.ellipse(r2() * 6 * u, r2() * MH, (0.3 + r2() * 0.8) * u, (0.3 + r2() * 0.9) * u, r2() * 3, 0, 7); b.fill();
    }
    for (let i = 0; i < 45; i++) { b.fillStyle = `rgba(255,186,110,${0.3 + r2() * 0.4})`; b.beginPath(); b.ellipse(r2() * 6 * u, r2() * MH, (0.12 + r2() * 0.2) * u, (0.1 + r2() * 0.14) * u, 0, 0, 7); b.fill(); }
    b.fillStyle = 'rgba(255,170,90,0.4)'; b.fillRect(0, 0, 0.7 * u, MH); // vetrandje
    a.band = band;

    // rondingsschaduw over de kegel: gloed van de grill links, vetglans, schaduwkant rechts
    const [ramp, rc] = sheet(256, 1);
    rc.fillStyle = lin(rc, 0, 0, 256, 0, [[0, 'rgba(40,10,0,0.5)'], [0.045, 'rgba(255,128,36,0.6)'], [0.15, 'rgba(255,150,60,0.22)'], [0.3, 'rgba(255,200,150,0)'], [0.385, 'rgba(255,244,228,0.26)'], [0.45, 'rgba(255,255,255,0)'], [0.68, 'rgba(30,10,0,0.1)'], [0.9, 'rgba(24,8,0,0.36)'], [1, 'rgba(16,5,0,0.64)']]);
    rc.fillRect(0, 0, 256, 1);
    const [shade, sx] = sheet(P, MH);
    const step = Math.max(1, Math.round(u * 0.25));
    for (let yy = 0; yy < MH; yy += step) { const hw2 = (10 + 6 * Math.min(1, yy / (bot - top))) * u; sx.drawImage(ramp, 0, 0, 256, 1, 16 * u - hw2, yy, hw2 * 2, step); }
    sx.fillStyle = lin(sx, 0, 0, 0, 5 * u, [[0, 'rgba(20,6,0,0.4)'], [1, 'rgba(20,6,0,0)']]); sx.fillRect(0, 0, P, 5 * u);
    sx.fillStyle = lin(sx, 0, MH - 8 * u, 0, MH, [[0, 'rgba(20,6,0,0)'], [1, 'rgba(20,6,0,0.5)']]); sx.fillRect(0, MH - 8 * u, P, 8 * u);
    a.shade = shade;

    // bovenkant van de kegel
    const [cap, cc] = sheet(22 * u, 4 * u);
    oval(cc, 11 * u, 2 * u, 10 * u, 1.5 * u); cc.fillStyle = lin(cc, 1 * u, 0, 21 * u, 0, [[0, '#c46a2c'], [0.25, '#b98056'], [0.6, '#a06a45'], [1, '#5c3520']]); cc.fill();
    oval(cc, 11 * u, 2 * u, 10 * u, 1.5 * u); cc.strokeStyle = 'rgba(255,214,170,0.45)'; cc.lineWidth = 0.25 * u; cc.stroke();
    a.cap = cap;

    // mes: stalen lemmet met vouw, houten heft met klinknagels. Tweede versie: oplichtend.
    const KH = bot + 6 * u - (top - 13 * u);
    const knife = (hot) => {
      const [c, k] = sheet(8 * u, KH + 1);
      const x0 = 4 * u, y0 = 7 * u;
      k.beginPath(); k.moveTo(x0 - 1.4 * u, y0); k.lineTo(x0 + 1.4 * u, y0); k.lineTo(x0 + 0.6 * u, KH); k.lineTo(x0 - 0.6 * u, KH); k.closePath();
      k.fillStyle = hot ? lin(k, x0 - 1.4 * u, 0, x0 + 1.4 * u, 0, [[0, '#ffffff'], [0.5, '#fffbd6'], [0.6, '#ffe68a'], [1, '#fff8cf']])
        : lin(k, x0 - 1.4 * u, 0, x0 + 1.4 * u, 0, [[0, '#fafcfd'], [0.42, '#cdd6db'], [0.5, '#8b979f'], [0.62, '#b9c3c9'], [1, '#eef2f4']]);
      k.fill();
      k.strokeStyle = hot ? 'rgba(255,196,60,0.9)' : 'rgba(38,50,56,0.55)'; k.lineWidth = Math.max(1, 0.16 * u); k.stroke();
      // heft
      rrect(k, x0 - 2 * u, 0, 4 * u, 7.5 * u, 1 * u);
      k.fillStyle = lin(k, x0 - 2 * u, 0, x0 + 2 * u, 0, [[0, '#2f1a0d'], [0.35, '#8a5632'], [0.6, '#6b3f22'], [1, '#2a170b']]); k.fill();
      k.fillStyle = lin(k, x0 - 2 * u, 0, x0 + 2 * u, 0, [[0, '#7b848b'], [0.4, '#f1f4f5'], [1, '#6c757c']]); k.fillRect(x0 - 2.1 * u, 6.3 * u, 4.2 * u, 1.4 * u);
      for (const ry of [2 * u, 4.4 * u]) {
        oval(k, x0, ry, 0.55 * u, 0.55 * u); k.fillStyle = '#d9b76e'; k.fill();
        oval(k, x0 - 0.15 * u, ry - 0.15 * u, 0.2 * u, 0.2 * u); k.fillStyle = 'rgba(255,255,255,0.8)'; k.fill();
      }
      return c;
    };
    a.knife = knife(false); a.knifeHot = knife(true);
    const [glow, gc] = sheet(14 * u, KH);
    gc.fillStyle = lin(gc, 0, 0, 14 * u, 0, [[0, 'rgba(255,214,90,0)'], [0.3, 'rgba(255,214,90,0.16)'], [0.42, 'rgba(255,220,110,0.5)'], [0.5, 'rgba(255,236,150,0.95)'], [0.58, 'rgba(255,220,110,0.5)'], [0.7, 'rgba(255,214,90,0.16)'], [1, 'rgba(255,214,90,0)']]); gc.fillRect(0, 0, 14 * u, KH);
    gc.globalCompositeOperation = 'destination-in';
    gc.fillStyle = lin(gc, 0, 0, 0, KH, [[0, 'rgba(0,0,0,0)'], [0.1, 'rgba(0,0,0,1)'], [0.92, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]); gc.fillRect(0, 0, 14 * u, KH);
    a.glow = glow; a.KH = KH;

    // flakkerende gloed en damp
    const [heat, hc] = sheet(60 * u, 90 * u);
    blob(hc, 30 * u, 45 * u, 30 * u, 45 * u, '255,110,30', 0.5);
    a.heat = heat;
    const [puff, pc] = sheet(16 * u, 16 * u);
    blob(pc, 8 * u, 8 * u, 8 * u, 8 * u, '255,244,230', 0.6);
    a.puff = puff;
    return a;
  };
  // Deel 2: de taverne met lichtslinger, plavuizenvloer in perspectief en het tafeltje met de stapel borden
  const bakeOpa = (W, H) => {
    const u = H / 100, cx = W / 2, rnd = seeded(11), a = {};
    const [bg, x] = sheet(W, H);
    const fy = 70 * u;
    // gestuukte muur in warm licht
    x.fillStyle = lin(x, 0, 0, 0, fy, [[0, '#2b1c12'], [0.6, '#3a2618'], [1, '#22150d']]); x.fillRect(0, 0, W, fy);
    for (let i = 0; i < 80; i++) blob(x, rnd() * W, rnd() * fy, (4 + rnd() * 12) * u, (3 + rnd() * 8) * u, rnd() < 0.5 ? '255,220,180' : '0,0,0', 0.03 + rnd() * 0.04);
    // dezelfde tegels als achter de grill, bovenaan de muur
    const [tl, tx] = sheet(W, 30 * u);
    drawTiles(tx, W, 30 * u, 10 * u, rnd);
    tx.globalCompositeOperation = 'multiply'; tx.fillStyle = '#8f7c6a'; tx.fillRect(0, 0, W, 30 * u);
    x.drawImage(tl, 0, 0);
    x.fillStyle = lin(x, 0, 30 * u, 0, 34 * u, [[0, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,0)']]); x.fillRect(0, 30 * u, W, 4 * u);
    // spot op de muur
    blob(x, cx, 34 * u, Math.min(W * 0.42, 70 * u), 34 * u, '255,196,120', 0.3);
    // lichtslinger
    const span = 46 * u, n = Math.ceil(W / span) + 1, x0 = cx - (n * span) / 2;
    for (let s = 0; s < n; s++) {
      const sx0 = x0 + s * span;
      x.beginPath(); x.moveTo(sx0, 3 * u); x.quadraticCurveTo(sx0 + span / 2, 15 * u, sx0 + span, 3 * u);
      x.strokeStyle = 'rgba(10,6,4,0.9)'; x.lineWidth = 0.3 * u; x.stroke();
      for (let k = 1; k < 6; k++) {
        const q = k / 6, lx = sx0 + span * q, ly = 3 * u + 12 * u * 2 * q * (1 - q) + 0.9 * u;
        const col = ['255,214,120', '120,190,255', '255,255,255'][(s * 5 + k) % 3];
        x.globalCompositeOperation = 'lighter'; blob(x, lx, ly, 4.5 * u, 4.5 * u, col, 0.4); x.globalCompositeOperation = 'source-over';
        oval(x, lx, ly, 0.75 * u, 0.95 * u); x.fillStyle = `rgb(${col})`; x.fill();
      }
    }
    // plavuizen in perspectief
    const vpY = fy - 34 * u, rows = [0, 0.1, 0.23, 0.4, 0.63, 1].map((q) => fy + q * (H - fy)), tw = 20 * u;
    const xAt = (c, y) => cx + c * tw * ((y - vpY) / (H - vpY));
    const cols = Math.ceil(W / tw) + 4;
    x.fillStyle = '#1a0d07'; x.fillRect(0, fy, W, H - fy);
    for (let r = 0; r < rows.length - 1; r++) for (let c = -cols; c < cols; c++) {
      const y0 = rows[r], y1 = rows[r + 1], q = r / (rows.length - 2), g1 = Math.max(1, u * (0.12 + q * 0.3));
      x.beginPath(); x.moveTo(xAt(c, y0) + g1, y0 + g1); x.lineTo(xAt(c + 1, y0) - g1, y0 + g1); x.lineTo(xAt(c + 1, y1) - g1, y1); x.lineTo(xAt(c, y1) + g1, y1); x.closePath();
      const l = 24 + q * 12 + rnd() * 7;
      x.fillStyle = `hsl(${14 + rnd() * 8}, ${48 + rnd() * 10}%, ${l}%)`; x.fill();
    }
    x.fillStyle = lin(x, 0, fy, 0, fy + 6 * u, [[0, 'rgba(0,0,0,0.65)'], [1, 'rgba(0,0,0,0)']]); x.fillRect(0, fy, W, 6 * u);
    blob(x, cx, fy + 15 * u, Math.min(W * 0.45, 80 * u), 13 * u, '255,206,150', 0.2); // glans op de vloer
    x.fillStyle = lin(x, 0, fy - 2 * u, 0, fy, [[0, '#4a2f1d'], [1, '#1c110a']]); x.fillRect(0, fy - 2 * u, W, 2 * u); // plint
    // tafeltje met de stapel
    const X = W * 0.2;
    blob(x, X + 2 * u, 98 * u, 14 * u, 3.5 * u, '0,0,0', 0.65);
    x.fillStyle = lin(x, X - 1.6 * u, 0, X + 1.6 * u, 0, [[0, '#3b2313'], [0.4, '#7a4d2c'], [1, '#2c1a0e']]); x.fillRect(X - 1.6 * u, 82 * u, 3.2 * u, 18 * u);
    oval(x, X, 97.5 * u, 6 * u, 1.6 * u); x.fillStyle = '#3a2314'; x.fill();
    x.fillStyle = lin(x, X - 8 * u, 0, X + 8 * u, 0, [[0, '#4a2c17'], [0.3, '#8d5b35'], [0.7, '#6d4326'], [1, '#3a2212']]); rrect(x, X - 8 * u, 80 * u, 16 * u, 3 * u, 0.6 * u); x.fill();
    x.fillStyle = 'rgba(255,226,180,0.35)'; x.fillRect(X - 7.6 * u, 80 * u, 15.2 * u, 0.35 * u);
    // vignet
    const vg = x.createRadialGradient(cx, 55 * u, 45 * u, cx, 55 * u, Math.max(W * 0.62, 100 * u));
    vg.addColorStop(0, 'rgba(6,3,2,0)'); vg.addColorStop(1, 'rgba(6,3,2,0.72)');
    x.fillStyle = vg; x.fillRect(0, 0, W, H);
    a.bg = bg;
    // bord: porselein met blauwe rand, van opzij gezien (stapel) en vliegend
    const plate = (rx, ry) => {
      const [c, p] = sheet(rx * 2 + 1 * u, ry * 2 + 1.6 * u);
      const px = rx + 0.5 * u, pyy = ry + 0.5 * u;
      oval(p, px, pyy + 0.55 * u, rx, ry); p.fillStyle = '#8f9aa5'; p.fill();
      oval(p, px, pyy, rx, ry); p.fillStyle = lin(p, px - rx, pyy - ry, px + rx, pyy + ry, [[0, '#ffffff'], [0.55, '#f1f4f6'], [1, '#c3ccd4']]); p.fill();
      p.strokeStyle = '#1565c0'; p.lineWidth = 0.42 * u; p.stroke();
      oval(p, px, pyy + ry * 0.08, rx * 0.62, ry * 0.58); p.fillStyle = lin(p, 0, pyy - ry * 0.6, 0, pyy + ry * 0.7, [[0, '#cfd7de'], [1, '#ffffff']]); p.fill();
      oval(p, px - rx * 0.45, pyy - ry * 0.42, rx * 0.22, ry * 0.14); p.fillStyle = 'rgba(255,255,255,0.95)'; p.fill();
      return c;
    };
    a.plate = plate(6 * u, 1.6 * u); a.fplate = plate(5 * u, 1.75 * u);
    const [sh, sc] = sheet(14 * u, 4 * u);
    blob(sc, 7 * u, 2 * u, 7 * u, 2 * u, '0,0,0', 0.7);
    a.shadow = sh;
    return a;
  };
  const draw = () => {
    fitCanvas(cv);
    const W = cv.width, H = cv.height, u = H / 100;
    if (W < 32 || H < 32) return; // nog geen echte maat (laag niet in beeld): niets voortekenen
    if (!art || art.W !== W || art.H !== H) art = bakeShared(W, H);
    ctx.save();
    if (shakeT > 0) ctx.translate((Math.random() - 0.5) * 14 * shakeT, (Math.random() - 0.5) * 14 * shakeT);
    ctx.fillStyle = '#120b07'; ctx.fillRect(-20, -20, W + 40, H + 40);
    const cx = W / 2, top = 18 * u, bot = 78 * u;
    if (phase === 'snijden') {
      const a = art.cut || (art.cut = bakeCut(W, H));
      ctx.drawImage(a.bg, 0, 0);
      // gloeiende grill achter het vlees: de gloed flakkert
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.45 + Math.sin(t * 9) * 0.14 + Math.sin(t * 23) * 0.07;
      ctx.drawImage(a.heat, cx - 52 * u, (top + bot) / 2 - 45 * u);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      // draaiende vleeskegel: de textuur schuift mee met het draaien
      ctx.save();
      ctx.beginPath(); ctx.moveTo(cx - 10 * u, top); ctx.lineTo(cx + 10 * u, top); ctx.lineTo(cx + 16 * u, bot); ctx.quadraticCurveTo(cx, bot + 3.6 * u, cx - 16 * u, bot); ctx.closePath(); ctx.clip();
      const off = (((spinT * a.P) % a.P) + a.P) % a.P;
      ctx.drawImage(a.meat, cx - 16 * u + off - a.P, top, a.P + 1, a.MH); ctx.drawImage(a.meat, cx - 16 * u + off, top, a.P + 1, a.MH);
      // donkere, krokante strook die rondgaat: die snijd je eraf
      const bx = cx - 16 * u + band * 32 * u;
      ctx.drawImage(a.band, bx - 3 * u, top, 6 * u, a.MH);
      ctx.drawImage(a.shade, cx - 16 * u, top, a.P, a.MH); // ronding, gloed en glans
      // slagschaduw van het mes op het vlees
      const ky0 = chop * 5 * u;
      ctx.fillStyle = 'rgba(36,12,0,0.3)';
      ctx.beginPath(); ctx.moveTo(cx - 0.2 * u, top - 6 * u + ky0); ctx.lineTo(cx + 2.6 * u, top - 6 * u + ky0); ctx.lineTo(cx + 1.8 * u, bot + 6 * u + ky0); ctx.lineTo(cx + 0.6 * u, bot + 6 * u + ky0); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.drawImage(a.cap, cx - 11 * u, top - 2 * u);
      // damp die van het vlees opstijgt
      for (let i = 0; i < 5; i++) {
        const k = (t * 0.2 + i * 0.2) % 1, s = (9 + k * 16) * u;
        ctx.globalAlpha = 0.8 * (1 - k) * Math.min(1, k * 6);
        ctx.drawImage(a.puff, cx + Math.sin(i * 2.4 + t * 0.7) * 6 * u - s / 2, top - 1 * u - k * 22 * u - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
      // mes: licht op als het goede moment eraan komt, hakt bij een tik
      const ready = Math.abs(band - 0.5) < 0.07;
      const ky = chop * 5 * u;
      if (ready) { ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(a.glow, cx - 7 * u, top - 13 * u + ky); ctx.globalCompositeOperation = 'source-over'; }
      ctx.drawImage(ready ? a.knifeHot : a.knife, cx - 4 * u, top - 13 * u + ky);
      // de plakjes in de pita (het bord en de pita zelf staan in de achtergrond)
      pita.forEach((ok, i) => { ctx.save(); ctx.translate(cx - 18 * u + (i % 9) * 4.4 * u, 89 * u - Math.floor(i / 9) * 1.5 * u); ctx.rotate((i % 3 - 1) * 0.3); ctx.drawImage(art.slice[ok], -1.8 * u, -0.8 * u, 3.6 * u, 1.6 * u); ctx.restore(); });
    } else {
      // OPA!
      art.cut = null;
      const a = art.opa || (art.opa = bakeOpa(W, H));
      ctx.drawImage(a.bg, 0, 0);
      const pulse = 1 + Math.sin(t * 12) * 0.08;
      ctx.save(); ctx.translate(W / 2, 30 * u); ctx.scale(pulse, pulse); ctx.rotate(Math.sin(t * 6) * 0.05);
      ctx.font = `800 ${14 * u}px "Baloo 2", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillText('OPA!', 0.6 * u, 0.9 * u);
      ctx.fillStyle = '#0d47a1';
      ctx.lineWidth = 1.2 * u; ctx.strokeStyle = '#fff'; ctx.strokeText('OPA!', 0, 0); ctx.fillText('OPA!', 0, 0);
      ctx.restore();
      ctx.font = `800 ${6 * u}px "Baloo 2", sans-serif`; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(`${plates} van de ${PLATES} borden kapot`, W / 2 + 0.3 * u, 46.4 * u);
      ctx.fillStyle = '#fff'; ctx.fillText(`${plates} van de ${PLATES} borden kapot`, W / 2, 46 * u);
      // de stapel borden die nog over is (links), wordt bij elke tik lager
      const left = PLATES - thrown;
      for (let k = 0; k < left; k++) ctx.drawImage(a.plate, W * 0.2 - 6.5 * u, 79 * u - k * 1.8 * u - 2.1 * u);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.font = `700 ${3.6 * u}px Inter, sans-serif`;
      ctx.fillText(left ? `nog ${left}` : 'op!', W * 0.2 + 0.2 * u, 88.3 * u);
      ctx.fillStyle = '#fff';
      ctx.fillText(left ? `nog ${left}` : 'op!', W * 0.2, 88 * u);
      // schaduw van de vliegende borden op de vloer
      for (const f of flying) {
        if (f.kind !== 'plate') continue;
        ctx.globalAlpha = Math.max(0.15, Math.min(0.9, 1 - (0.8 - f.y) * 1.3));
        ctx.drawImage(a.shadow, f.x * W - 7 * u, 81 * u);
      }
      ctx.globalAlpha = 1;
    }
    // vliegende plakjes en borden
    for (const f of flying) {
      ctx.save(); ctx.translate(f.x * W, f.y * H); ctx.rotate(f.r);
      if (f.kind === 'slice') ctx.drawImage(art.slice[f.ok], -2 * u, -0.9 * u, 4 * u, 1.8 * u);
      else if (art.opa) ctx.drawImage(art.opa.fplate, -5.5 * u * f.s, -2.25 * u * f.s, art.opa.fplate.width * f.s, art.opa.fplate.height * f.s);
      ctx.restore();
    }
    parts.draw(ctx);
    ctx.restore();
  };
  // klikken op het canvas telt ook als tik
  cv.addEventListener('pointerdown', () => { g.input.actionPressed = true; });
  return runMini(g, (dt, finish) => {
    t += dt; chop = Math.max(0, chop - dt * 6); shakeT = Math.max(0, shakeT - dt * 3);
    g.player.lockedFor = true;
    fitCanvas(cv);
    const W = cv.width, H = cv.height;
    const pr = pressed(g);
    if (phase === 'snijden') {
      band += speed * dt; spinT += speed * dt;
      if (band > 1) band -= 1;
      if (Math.random() < dt * 8) parts.spawn(W / 2 - 22 * H / 100, H * (0.2 + Math.random() * 0.55), 1, { color: '#ffb74d', speed: 40, up: 60, size: 2 * devicePixelRatio, life: 0.5, gravity: -100 }); // vonkjes
      if (pr) {
        used++;
        const diff = Math.abs(band - 0.5);
        const ok = diff < 0.07;
        if (ok) good++;
        chop = 1;
        const kind = ok ? true : band < 0.5 ? 'licht' : 'zwart';
        flying.push({ kind: 'slice', ok: kind, x: 0.5, y: 0.45, vx: (Math.random() - 0.5) * 0.3, vy: -0.5, r: 0, vr: 9, tx: 0.5 - 0.18 + ((pita.length % 9) * 4.4) / 100 * (H / W) });
        parts.spawn(W / 2, H * 0.45, ok ? 16 : 8, { color: ok ? '#ffcc80' : '#ef9a9a', speed: 260, up: 120, size: 4 * devicePixelRatio, shape: 'circle', life: 0.6 });
        if (ok) { const c = combo.hit(); flash(ui.ov, 'good'); popText(ui.ov, c >= 3 ? `Perfect! x${c}` : 'Perfect!', 50, 30, c >= 3 ? 'gold big' : 'good'); g.sfx?.play('pop'); }
        else { combo.miss(); flash(ui.ov, 'bad'); shakeT = 0.6; popText(ui.ov, band < 0.5 ? 'Nog te licht!' : 'Te laat, aangebrand!', 50, 30, 'bad'); g.sfx?.play('splat'); }
        speed += 0.06;
      }
      ui.score(`🥙 ${good} / ${need} goed  ·  nog ${tries - used} keer`);
      if (good >= need) {
        phase = 'opa'; t = 0; combo.miss();
        ui.ov.querySelector('.mini-hint').textContent = `OPA! Je hebt een stapel van ${PLATES} borden. Elke tik gooit er één kapot. Gooi ze allemaal binnen ${PLATE_TIME} seconden!`;
        flash(ui.ov, 'gold'); popText(ui.ov, 'Gyros klaar!', 50, 40, 'gold big');
      } else if (used >= tries) finish({ ok: false, good });
    } else {
      const left = PLATES - thrown;
      if (pr && left > 0 && t < PLATE_TIME) {
        thrown++;
        // het bovenste bord van de stapel vliegt omhoog
        flying.push({ kind: 'plate', x: 0.2, y: 0.8 - left * 0.018, vx: 0.25 + Math.random() * 0.5, vy: -1.1 - Math.random() * 0.4, r: 0, vr: (Math.random() - 0.5) * 12, s: 1 });
        g.sfx?.play('kick');
      }
      ui.score(`🍽️ ${plates} / ${PLATES} kapot  ·  nog ${Math.max(0, PLATE_TIME - t).toFixed(1).replace('.', ',')} s`);
      const over = (thrown >= PLATES || t >= PLATE_TIME) && !flying.some((f) => f.kind === 'plate');
      if (over && !phase.endsWith('klaar')) {
        phase = 'opa-klaar'; t = 0;
        popText(ui.ov, plates >= PLATES ? 'Alle borden kapot! OPA!' : `${plates} borden kapot!`, 50, 40, 'gold big');
        if (plates >= PLATES) g.sfx?.play('cheer');
      }
      if (phase === 'opa-klaar' && t > 1.2) finish({ ok: true, good, plates, all: plates >= PLATES });
    }
    // vluchten bijwerken
    for (let i = flying.length - 1; i >= 0; i--) {
      const f = flying[i];
      f.r += f.vr * dt;
      if (f.kind === 'slice') {
        f.x += (f.tx - f.x) * Math.min(1, dt * 4); f.y += f.vy * dt; f.vy += 2.2 * dt;
        if (f.y > 0.88) { pita.push(f.ok); flying.splice(i, 1); }
      } else {
        f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 2.4 * dt;
        if (f.vy > 0 && f.y > 0.78) {
          parts.spawn(f.x * W, f.y * H, 16, { color: '#fafafa', speed: 420, up: 200, size: 7 * devicePixelRatio, shape: 'shard', life: 0.9 });
          parts.spawn(f.x * W, f.y * H, 6, { color: '#1565c0', speed: 300, up: 150, size: 5 * devicePixelRatio, shape: 'shard', life: 0.9 });
          shakeT = 0.5; g.sfx?.play('crash'); plates++;
          if (Math.random() < 0.5) popText(ui.ov, ['OPA!', 'KRAK!', 'Kalimera!', 'Nog eentje!'][Math.floor(Math.random() * 4)], f.x * 100, 70, 'gold');
          flying.splice(i, 1);
        }
      }
    }
    parts.update(dt);
    draw();
  }, () => { ui.close(); g.player.lockedFor = false; }, { band: () => band, phase: () => phase, get label() { return phase === 'snijden' ? 'Snijd!' : phase === 'opa' ? 'Gooi!' : null; } });
}

// ------------------------------------------------------------ stempelen (gemeentehuis)

// De stempel precies in het vakje zetten: de stempel zweeft heen en weer boven het formulier,
// bij een tik slaat hij neer en zie je de afdruk (recht of scheef).
export function startStamp(g, title = 'Stempelen') {
  const ui = overlay(g, title, `<div class="st-desk"><div class="st-paper"><b>FORMULIER M-38b</b><small>Inschrijving matras, openbare ruimte</small><div class="st-lines"><i></i><i></i><i></i><i></i></div><div class="st-box">stempel hier</div><div class="st-mark"></div></div><div class="st-stamp"><div class="st-handle"></div><div class="st-foot"></div></div></div>`, g.input.isTouch ? 'Tik als de stempel boven het vakje hangt' : 'E, spatie of klik als de stempel boven het vakje hangt');
  const $ = (s) => ui.ov.querySelector(s);
  const tex = domTextures(); // alleen uiterlijk: houten bureaublad, papiervezels en inkt
  ui.ov.style.setProperty('--st-hout', tex.hout); ui.ov.style.setProperty('--st-papier', tex.papier); ui.ov.style.setProperty('--st-inkt', tex.inkt);
  ui.ov.querySelector('.st-desk').addEventListener('pointerdown', () => { g.input.actionPressed = true; });
  let t = 0, down = 0, result = null;
  const pos = () => (Math.sin(t * 2.6 - Math.PI / 2) + 1) / 2; // 0..1 over het papier
  return runMini(g, (dt, finish) => {
    g.player.lockedFor = true;
    if (result) {
      $('.st-stamp').classList.add('down'); // alleen uiterlijk: de zweefschaduw verdwijnt als de stempel neerkomt
      down += dt;
      const k = Math.min(1, down / 0.12);
      $('.st-stamp').style.transform = `translate(${result.v * 100}%, ${k * 110}px)`;
      if (down > 0.12 && !result.shown) {
        result.shown = true;
        const m = $('.st-mark');
        m.textContent = result.ok ? 'GOEDGEKEURD' : 'ONGELDIG';
        m.className = 'st-mark show ' + (result.ok ? 'ok' : 'bad');
        m.style.left = result.v * 100 + '%';
        m.style.transform = `translateX(-50%) rotate(${result.ok ? -6 + (Math.random() - 0.5) * 6 : (Math.random() < 0.5 ? -1 : 1) * (18 + Math.random() * 14)}deg)`;
        shake($('.st-desk'), true);
        flash(ui.ov, result.ok ? 'good' : 'bad');
        popText(ui.ov, result.perfect ? 'Kaarsrecht!' : result.ok ? 'Goedgekeurd!' : 'Scheef!', 50, 28, result.ok ? (result.perfect ? 'gold big' : 'good') : 'bad big');
        g.sfx?.play('kick');
      }
      if (down > 1.1) finish({ ok: result.ok, perfect: result.perfect });
      return;
    }
    t += dt;
    const v = pos();
    $('.st-stamp').style.transform = `translate(${v * 100}%, ${Math.sin(t * 7) * 4}px)`;
    $('.st-box').classList.toggle('hot', v > 0.44 && v < 0.58);
    const pr = pressed(g);
    if (pr && t > 0.4) result = { v, ok: v > 0.44 && v < 0.58, perfect: v > 0.48 && v < 0.54 }; // tik van het gesprek niet meetellen
  }, () => { ui.close(); g.player.lockedFor = false; }, { v: () => pos(), label: 'Stempel!' });
}

// ------------------------------------------------------------ deurtjes (Plan Keukens)

// De 'Gulperberg Deluxe' wordt gedemonstreerd, maar de deurtjes springen steeds open.
// Klap ze dicht voordat ze eraf vallen. Klik/tik op een deurtje, of gebruik de toetsen 1 tot en met 8.
export function startDoors(g, { limit = 35, maxLost = 3 } = {}) {
  const ui = overlay(g, 'Hou de deurtjes dicht!', '<canvas class="mini-canvas"></canvas>', g.input.isTouch ? 'Tik op een openspringend deurtje om het dicht te klappen' : 'Klik op een openspringend deurtje (of toets 1 t/m 8) om het dicht te klappen');
  const cv = ui.ov.querySelector('canvas');
  const ctx = cv.getContext('2d');
  fitCanvas(cv);
  const parts = new Particles();
  const combo = makeCombo(ui.ov);
  // 2 rijen van 4 kastjes
  const doors = Array.from({ length: 8 }, (_, i) => ({ i, open: 0, opening: false, t: 0, slam: 0, lost: false, fall: 0, fy: 0, fr: 0 }));
  let t = 0, next = 1.0, lost = 0, slammed = 0, shakeT = 0, endT = 0, ok = null;
  const layout = () => {
    const W = cv.width, H = cv.height, u = H / 100;
    const cw = Math.min(W * 0.18, 22 * u), ch = cw, gx = W / 2 - cw * 2, gy = 22 * u;
    return { W, H, u, cw, ch, gx, gy, rect: (d) => ({ x: gx + (d.i % 4) * cw, y: gy + Math.floor(d.i / 4) * (ch + 6 * u), w: cw, h: ch }) };
  };
  const hit = (cx, cy) => {
    const L = layout();
    for (const d of doors) { const r = L.rect(d); if (cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h) return d; }
    return null;
  };
  const slam = (d) => {
    if (!d || d.lost) return;
    if (d.open > 0.05) {
      d.opening = false; d.open = 0; d.slam = 1; slammed++;
      const L = layout(), r = L.rect(d);
      const c = combo.hit();
      parts.spawn(r.x + r.w / 2, r.y + r.h / 2, 10, { color: '#d7ccc8', speed: 200, up: 80, size: 4 * devicePixelRatio, life: 0.5 });
      popText(ui.ov, c >= 3 ? `BAM! x${c}` : ['BAM!', 'KLAP!', 'Dicht!'][slammed % 3], ((r.x + r.w / 2) / L.W) * 100, ((r.y) / L.H) * 100, c >= 3 ? 'gold' : 'good');
      g.sfx?.play('kick');
    } else { combo.miss(); popText(ui.ov, 'Die was al dicht', 50, 18, 'small'); }
  };
  cv.addEventListener('pointerdown', (e) => {
    const r = cv.getBoundingClientRect();
    slam(hit((e.clientX - r.left) * devicePixelRatio, (e.clientY - r.top) * devicePixelRatio));
  });
  const onKey = (e) => { const n = parseInt(e.key, 10); if (n >= 1 && n <= 8) slam(doors[n - 1]); };
  addEventListener('keydown', onKey);
  // ---- voorgetekend (één keer per canvasmaat): showroom, keukenblok met de kastjes van binnen, deurtje, prijskaartje
  let art = null;
  const bake = (L) => {
    const { W, H, u, cw, ch, gx, gy } = L, rnd = seeded(5), a = { W, H };
    const [bg, x] = sheet(W, H);
    const cx = W / 2, kw = cw * 4, base = gy + ch * 2 + 6 * u, fy = base + 4 * u;
    // wand van de showroom met drie spots
    x.fillStyle = lin(x, 0, 0, 0, fy, [[0, '#cfc8bd'], [0.45, '#e6e0d6'], [1, '#c9c1b5']]); x.fillRect(0, 0, W, fy);
    for (const s of [-1, 0, 1]) blob(x, cx + s * kw * 0.9, 2 * u, kw * 0.42, 52 * u, '255,246,226', 0.6);
    x.fillStyle = lin(x, 0, 0, W, 0, [[0, 'rgba(52,40,28,0.55)'], [0.28, 'rgba(52,40,28,0)'], [0.72, 'rgba(52,40,28,0)'], [1, 'rgba(52,40,28,0.55)']]); x.fillRect(0, 0, W, fy);
    // eiken vloer: planken lopen naar je toe
    const vpY = fy - 46 * u, pw = 8.5 * u, xAt = (c, y) => cx + c * pw * ((y - vpY) / (H - vpY)), cols = Math.ceil(W / pw) + 3;
    x.fillStyle = '#6e5234'; x.fillRect(0, fy, W, H - fy);
    for (let c = -cols; c < cols; c++) {
      x.beginPath(); x.moveTo(xAt(c, fy), fy); x.lineTo(xAt(c + 1, fy), fy); x.lineTo(xAt(c + 1, H), H); x.lineTo(xAt(c, H), H); x.closePath();
      x.fillStyle = `hsl(${29 + rnd() * 5}, ${30 + rnd() * 7}%, ${57 + rnd() * 8}%)`; x.fill();
      x.strokeStyle = 'rgba(60,38,18,0.5)'; x.lineWidth = Math.max(1, 0.14 * u); x.stroke();
      for (let k = 0; k < 1; k++) { // kopse naad
        const y = fy + rnd() * (H - fy);
        x.fillStyle = 'rgba(60,38,18,0.5)'; x.fillRect(xAt(c, y), y, xAt(c + 1, y) - xAt(c, y), Math.max(1, 0.14 * u));
      }
    }
    for (let i = 0; i < 120; i++) { // nerf
      const y = fy + rnd() * (H - fy), c = (rnd() - 0.5) * 2 * cols, len = (2 + rnd() * 5) * u, y2 = Math.min(H, y + len);
      x.beginPath(); x.moveTo(xAt(c, y), y); x.lineTo(xAt(c, y2), y2); x.strokeStyle = `rgba(70,44,20,${0.1 + rnd() * 0.16})`; x.lineWidth = Math.max(1, 0.1 * u); x.stroke();
    }
    x.fillStyle = lin(x, 0, fy, 0, H, [[0, 'rgba(40,26,12,0.4)'], [0.4, 'rgba(40,26,12,0)'], [1, 'rgba(40,26,12,0.25)']]); x.fillRect(0, fy, W, H - fy);
    blob(x, cx, fy + 9 * u, kw * 0.7, 10 * u, '255,248,232', 0.32); // spiegeling van het licht in de lak
    x.fillStyle = lin(x, 0, fy - 1.6 * u, 0, fy, [[0, '#f6f3ee'], [0.8, '#d8d2c8'], [1, '#8f877b']]); x.fillRect(0, fy - 1.6 * u, W, 1.6 * u); // plint langs de wand
    blob(x, cx + 1 * u, fy + 0.6 * u, kw * 0.6, 3.2 * u, '0,0,0', 0.6);
    // afzuigkap van geborsteld staal
    const hx0 = L.gx + cw * 1.3, hw = cw * 1.4;
    blob(x, cx + 2 * u, 15 * u, cw * 1.25, 8 * u, '40,30,20', 0.35);
    x.fillStyle = lin(x, hx0, 0, hx0 + hw, 0, [[0, '#737d84'], [0.26, '#f0f3f5'], [0.5, '#b2bbc1'], [0.82, '#8d979e'], [1, '#666f76']]); x.fillRect(hx0, 0, hw, 18 * u);
    for (let i = 0; i < 50; i++) { x.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '40,50,60'},${0.03 + rnd() * 0.05})`; x.fillRect(hx0 + rnd() * hw, 0, Math.max(1, 0.08 * u), 18 * u); }
    x.beginPath(); x.moveTo(L.gx + cw * 1.1, 18 * u); x.lineTo(L.gx + cw * 2.9, 18 * u); x.lineTo(L.gx + cw * 2.6, 12 * u); x.lineTo(L.gx + cw * 1.4, 12 * u); x.closePath();
    x.fillStyle = lin(x, L.gx + cw * 1.1, 0, L.gx + cw * 2.9, 0, [[0, '#7f8990'], [0.3, '#f4f6f7'], [0.55, '#bcc5ca'], [1, '#727c83']]); x.fill();
    x.fillStyle = lin(x, 0, 12 * u, 0, 18 * u, [[0, 'rgba(255,255,255,0.3)'], [1, 'rgba(30,40,50,0.28)']]); x.fill();
    x.fillStyle = '#48525a'; x.fillRect(L.gx + cw * 1.08, 17.3 * u, cw * 1.84, 1 * u);
    x.fillStyle = 'rgba(255,255,255,0.5)'; x.fillRect(L.gx + cw * 1.08, 17.3 * u, cw * 1.84, Math.max(1, 0.15 * u));
    // keukenblok: schaduw op de wand, antraciet korpus, plint
    for (let k = 0; k < 4; k++) { x.fillStyle = 'rgba(40,28,16,0.09)'; x.fillRect(L.gx - 2 * u + (0.6 + k * 0.6) * u, gy - 1.6 * u + (0.4 + k * 0.5) * u, kw + 4 * u, base - gy + 1.6 * u); }
    x.fillStyle = lin(x, L.gx - 2 * u, 0, L.gx + kw + 2 * u, 0, [[0, '#23282c'], [0.5, '#3a434a'], [1, '#1f2428']]); x.fillRect(L.gx - 2 * u, gy - 1.6 * u, kw + 4 * u, base - gy + 1.6 * u);
    x.fillStyle = 'rgba(255,255,255,0.22)'; x.fillRect(L.gx - 2 * u, gy - 1.6 * u, kw + 4 * u, Math.max(1, 0.2 * u));
    x.fillStyle = lin(x, 0, base, 0, base + 4 * u, [[0, '#0c0e10'], [1, '#1d2226']]); x.fillRect(L.gx - 1 * u, base, kw + 2 * u, 4 * u);
    // de kastjes van binnen: hout, diepte, een plank en wat servies
    const item = (kind, px, by, s, tint) => {
      // by = onderkant, s = maat (ongeveer de breedte van het kastje)
      if (kind === 0) { // stapel borden
        for (let k = 0; k < 4; k++) { oval(x, px, by - (0.02 + k * 0.035) * s, 0.17 * s, 0.035 * s); x.fillStyle = lin(x, px - 0.17 * s, 0, px + 0.17 * s, 0, [[0, '#ffffff'], [0.6, '#dfe5ea'], [1, '#9aa5ae']]); x.fill(); x.strokeStyle = 'rgba(60,80,100,0.5)'; x.lineWidth = Math.max(1, 0.006 * s); x.stroke(); }
      } else if (kind === 1) { // mok
        x.strokeStyle = tint; x.lineWidth = 0.025 * s; x.beginPath(); x.arc(px + 0.07 * s, by - 0.09 * s, 0.045 * s, -1.4, 1.4); x.stroke();
        rrect(x, px - 0.07 * s, by - 0.17 * s, 0.14 * s, 0.17 * s, 0.02 * s); x.fillStyle = tint; x.fill();
        x.fillStyle = lin(x, px - 0.07 * s, 0, px + 0.07 * s, 0, [[0, 'rgba(255,255,255,0.45)'], [0.4, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,0,0.35)']]); x.fill();
      } else if (kind === 2) { // voorraadpot
        rrect(x, px - 0.075 * s, by - 0.24 * s, 0.15 * s, 0.24 * s, 0.02 * s); x.fillStyle = 'rgba(214,232,236,0.55)'; x.fill();
        x.fillStyle = tint; x.fillRect(px - 0.065 * s, by - 0.15 * s, 0.13 * s, 0.14 * s);
        x.fillStyle = lin(x, px - 0.075 * s, 0, px + 0.075 * s, 0, [[0, 'rgba(255,255,255,0.5)'], [0.3, 'rgba(255,255,255,0.05)'], [1, 'rgba(0,0,0,0.3)']]); x.fillRect(px - 0.075 * s, by - 0.24 * s, 0.15 * s, 0.24 * s);
        x.fillStyle = '#b08d57'; x.fillRect(px - 0.085 * s, by - 0.27 * s, 0.17 * s, 0.04 * s);
      } else if (kind === 3) { // kom
        x.beginPath(); x.ellipse(px, by - 0.1 * s, 0.13 * s, 0.1 * s, 0, 0, Math.PI); x.closePath(); x.fillStyle = tint; x.fill();
        x.fillStyle = lin(x, px - 0.13 * s, 0, px + 0.13 * s, 0, [[0, 'rgba(255,255,255,0.45)'], [0.45, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,0,0.35)']]); x.fill();
        oval(x, px, by - 0.1 * s, 0.13 * s, 0.02 * s); x.fillStyle = 'rgba(255,255,255,0.55)'; x.fill();
      } else { // fles
        x.fillStyle = tint; rrect(x, px - 0.045 * s, by - 0.24 * s, 0.09 * s, 0.24 * s, 0.02 * s); x.fill(); x.fillRect(px - 0.018 * s, by - 0.33 * s, 0.036 * s, 0.1 * s);
        x.fillStyle = lin(x, px - 0.045 * s, 0, px + 0.045 * s, 0, [[0, 'rgba(255,255,255,0.5)'], [0.35, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,0,0.4)']]); x.fillRect(px - 0.045 * s, by - 0.33 * s, 0.09 * s, 0.33 * s);
      }
    };
    const tints = ['#c9573c', '#3f7fb5', '#e0b84a', '#6c9a5b', '#f3efe6', '#7a4a8a'];
    for (const d of doors) {
      const r = L.rect(d), ix = r.x + 4, iy = r.y + 4, iw = r.w - 8, ih = r.h - 8, dd = iw * 0.13, dv = dd * 0.7;
      x.fillStyle = '#0d0f11'; x.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2); // sponning rond het deurtje
      x.fillStyle = lin(x, 0, iy, 0, iy + ih, [[0, '#3b281e'], [1, '#6f4e3c']]); x.fillRect(ix, iy, iw, ih); // achterwand
      const quad = (p, col) => { x.beginPath(); x.moveTo(p[0], p[1]); x.lineTo(p[2], p[3]); x.lineTo(p[4], p[5]); x.lineTo(p[6], p[7]); x.closePath(); x.fillStyle = col; x.fill(); };
      quad([ix, iy, ix + iw, iy, ix + iw - dd, iy + dv, ix + dd, iy + dv], '#291b14'); // bovenkant
      quad([ix, iy + ih, ix + iw, iy + ih, ix + iw - dd, iy + ih - dv, ix + dd, iy + ih - dv], '#93705a'); // bodem
      quad([ix, iy, ix + dd, iy + dv, ix + dd, iy + ih - dv, ix, iy + ih], '#4b3428'); // linkerwand
      quad([ix + iw, iy, ix + iw - dd, iy + dv, ix + iw - dd, iy + ih - dv, ix + iw, iy + ih], '#7d5b47'); // rechterwand (vangt het licht)
      // plankje halverwege
      const my = r.y + r.h * 0.5, eh = Math.max(2, ih * 0.035);
      quad([ix, my, ix + iw, my, ix + iw - dd, my - dv * 0.5, ix + dd, my - dv * 0.5], '#8d6a54');
      x.fillStyle = lin(x, 0, my, 0, my + eh, [[0, '#c29a79'], [1, '#7b5843']]); x.fillRect(ix, my, iw, eh);
      x.fillStyle = lin(x, 0, my + eh, 0, my + eh + ih * 0.16, [[0, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,0)']]); x.fillRect(ix, my + eh, iw, ih * 0.16);
      // servies op de plank en op de bodem
      for (const by of [my - dv * 0.2, iy + ih - dv * 0.45]) {
        const n = 2 + Math.floor(rnd() * 2);
        for (let k = 0; k < n; k++) {
          const px = ix + iw * (0.24 + (k + rnd() * 0.5) * (0.56 / n));
          blob(x, px + 0.02 * iw, by, 0.14 * iw, 0.03 * iw, '0,0,0', 0.5);
          item(Math.floor(rnd() * 5), px, by, iw, tints[Math.floor(rnd() * tints.length)]);
        }
      }
      x.fillStyle = lin(x, 0, iy, 0, iy + ih * 0.3, [[0, 'rgba(0,0,0,0.55)'], [1, 'rgba(0,0,0,0)']]); x.fillRect(ix, iy, iw, ih * 0.3);
      x.fillStyle = lin(x, ix, 0, ix + iw * 0.3, 0, [[0, 'rgba(0,0,0,0.4)'], [1, 'rgba(0,0,0,0)']]); x.fillRect(ix, iy, iw * 0.3, ih);
    }
    // werkblad van donkere steen
    const wy = gy + ch + 1 * u;
    x.fillStyle = lin(x, 0, wy, 0, wy + 3 * u, [[0, '#7c8b94'], [0.14, '#46555e'], [1, '#1f292e']]); x.fillRect(L.gx - 2 * u, wy, kw + 4 * u, 3 * u);
    for (let i = 0; i < 160; i++) { x.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},${0.06 + rnd() * 0.14})`; x.fillRect(L.gx - 2 * u + rnd() * (kw + 4 * u), wy + 0.4 * u + rnd() * 2.5 * u, Math.max(1, 0.2 * u), Math.max(1, 0.12 * u)); }
    x.fillStyle = 'rgba(255,255,255,0.55)'; x.fillRect(L.gx - 2 * u, wy, kw + 4 * u, Math.max(1, 0.22 * u));
    x.fillStyle = lin(x, 0, wy + 3 * u, 0, wy + 5 * u, [[0, 'rgba(0,0,0,0.75)'], [1, 'rgba(0,0,0,0.15)']]); x.fillRect(L.gx - 2 * u, wy + 3 * u, kw + 4 * u, 2 * u);
    a.bg = bg;

    // deurtje: witte lak, kader met verdiept paneel, glans en een stalen greep
    const dw = Math.max(4, cw - 6), dh = Math.max(4, ch - 6);
    const [door, d] = sheet(dw, dh);
    d.fillStyle = lin(d, 0, 0, dw, dh, [[0, '#ffffff'], [0.5, '#f3f5f6'], [1, '#dfe4e7']]); d.fillRect(0, 0, dw, dh);
    const e = Math.max(1, dw * 0.012), f = dw * 0.13;
    d.fillStyle = lin(d, 0, f, 0, dh - f, [[0, '#e9edef'], [0.3, '#f7f9fa'], [1, '#e3e8eb']]); d.fillRect(f, f, dw - 2 * f, dh - 2 * f);
    d.fillStyle = 'rgba(70,84,96,0.3)'; d.fillRect(f, f, dw - 2 * f, e * 1.4); d.fillRect(f, f, e * 1.4, dh - 2 * f); // schaduw in het paneel
    d.fillStyle = 'rgba(255,255,255,0.95)'; d.fillRect(f, dh - f - e, dw - 2 * f, e); d.fillRect(dw - f - e, f, e, dh - 2 * f);
    d.save(); d.beginPath(); d.rect(0, 0, dw, dh); d.clip(); // glans: schuine lichtbaan
    d.fillStyle = lin(d, dw * 0.15, 0, dw * 0.75, dh * 0.6, [[0, 'rgba(255,255,255,0)'], [0.45, 'rgba(255,255,255,0.55)'], [0.55, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]);
    d.beginPath(); d.moveTo(dw * 0.3, 0); d.lineTo(dw * 0.62, 0); d.lineTo(dw * 0.22, dh); d.lineTo(-dw * 0.1, dh); d.closePath(); d.fill();
    d.restore();
    d.fillStyle = 'rgba(255,255,255,1)'; d.fillRect(0, 0, dw, e); d.fillRect(0, 0, e, dh);
    d.fillStyle = 'rgba(60,74,86,0.35)'; d.fillRect(0, dh - e, dw, e); d.fillRect(dw - e, 0, e, dh);
    const hx = dw * 0.865, hy0 = dh * 0.34, hh = dh * 0.32, hwd = Math.max(3, dw * 0.042);
    d.fillStyle = 'rgba(40,50,60,0.3)'; rrect(d, hx + hwd * 0.5, hy0 + hwd * 0.6, hwd, hh, hwd / 2); d.fill(); // schaduw van de greep
    d.fillStyle = lin(d, hx, 0, hx + hwd, 0, [[0, '#606b72'], [0.35, '#f4f6f7'], [0.6, '#aab3b9'], [1, '#59636a']]); rrect(d, hx, hy0, hwd, hh, hwd / 2); d.fill();
    a.door = door;
    // schaduw die een open deurtje in het kastje werpt
    const [cast, cs] = sheet(32, 4);
    cs.fillStyle = lin(cs, 0, 0, 32, 0, [[0, 'rgba(0,0,0,0.6)'], [1, 'rgba(0,0,0,0)']]); cs.fillRect(0, 0, 32, 4);
    a.cast = cast;
    const [fsh, fc] = sheet(cw * 1.3, ch * 0.4);
    blob(fc, cw * 0.65, ch * 0.2, cw * 0.65, ch * 0.2, '30,18,8', 0.65);
    a.floorShadow = fsh;
    // prijskaartje: geel karton met een stukje plakband
    const [tag, tc] = sheet(24 * u, 13 * u);
    tc.fillStyle = 'rgba(40,28,10,0.3)'; rrect(tc, 1.7 * u, 2.9 * u, 22 * u, 10 * u, 0.6 * u); tc.fill();
    tc.fillStyle = lin(tc, 1 * u, 2 * u, 23 * u, 12 * u, [[0, '#fff59d'], [0.45, '#ffeb3b'], [1, '#f9c22b']]); rrect(tc, 1 * u, 2 * u, 22 * u, 10 * u, 0.5 * u); tc.fill();
    tc.fillStyle = 'rgba(255,255,255,0.65)'; tc.fillRect(1.5 * u, 2 * u, 21 * u, Math.max(1, 0.2 * u));
    tc.fillStyle = 'rgba(255,255,255,0.5)'; tc.fillRect(9.5 * u, 0.3 * u, 5 * u, 3 * u);
    tc.fillStyle = 'rgba(120,110,90,0.25)'; tc.fillRect(9.5 * u, 0.3 * u, 5 * u, Math.max(1, 0.15 * u)); tc.fillRect(9.5 * u, 3.15 * u, 5 * u, Math.max(1, 0.15 * u));
    a.tag = tag;
    return a;
  };
  const draw = () => {
    fitCanvas(cv);
    const L = layout(), { W, H, u } = L;
    if (W < 32 || H < 32) return; // nog geen echte maat (laag niet in beeld): niets voortekenen
    if (!art || art.W !== W || art.H !== H) art = bake(L);
    ctx.save();
    if (shakeT > 0) ctx.translate((Math.random() - 0.5) * 16 * shakeT, (Math.random() - 0.5) * 16 * shakeT);
    // showroom, afzuigkap, werkblad en de kastjes van binnen (voorgetekend)
    ctx.fillStyle = '#cfc8bd'; ctx.fillRect(-20, -20, W + 40, H + 40);
    ctx.drawImage(art.bg, 0, 0);
    // prijskaartje
    ctx.save(); ctx.translate(W - 14 * u, 12 * u); ctx.rotate(0.15 + Math.sin(t * 2) * 0.05);
    ctx.drawImage(art.tag, -12 * u, -7 * u);
    ctx.fillStyle = '#c62828'; ctx.font = `800 ${3.6 * u}px "Baloo 2", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('€ 24.999,-', 0, -1 * u); ctx.font = `600 ${2 * u}px Inter, sans-serif`; ctx.fillText('excl. deurtjes', 0, 2.6 * u);
    ctx.restore();
    for (const d of doors) {
      if (d.lost) continue;
      const r = L.rect(d);
      // deurtje: zwaait open om het scharnier links, rood bij bijna vallen
      const open = d.open;
      const danger = d.opening && d.t > 0.9, blink = danger && Math.sin(t * 30) > 0;
      const dw = r.w - 6, dh = r.h - 6, w = dw * (1 - open * 0.85);
      ctx.save();
      ctx.translate(r.x + 3, r.y + 3);
      if (d.slam > 0) ctx.translate(Math.sin(d.slam * 40) * 3 * d.slam, 0);
      if (open <= 0) {
        ctx.drawImage(art.door, 0, 0, dw, dh);
      } else {
        // schaduw van het open deurtje in het kastje
        ctx.globalAlpha = Math.min(1, open * 1.6); ctx.drawImage(art.cast, w, 0, Math.min(dw - w, dw * 0.4), dh); ctx.globalAlpha = 1;
        // het deurtje in perspectief: de vrije rand komt naar je toe en is dus iets hoger
        const N = 8, grow = open * 0.08, sw = art.door.width, sh = art.door.height;
        for (let s = 0; s < N; s++) { const hs = dh * (1 + (grow * (s + 0.5)) / N); ctx.drawImage(art.door, (s / N) * sw, 0, sw / N, sh, (s / N) * w, (dh - hs) / 2, w / N + 0.75, hs); }
        const he = dh * (1 + grow), th = Math.max(2, open * dw * 0.05);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, (dh - he) / 2); ctx.lineTo(w, (dh + he) / 2); ctx.lineTo(0, dh); ctx.closePath();
        ctx.fillStyle = `rgba(30,40,52,${open * 0.2})`; ctx.fill(); // draait van het licht weg
        ctx.fillStyle = '#aeb7bd'; ctx.fillRect(w, (dh - he) / 2, th, he); // dikte van het deurtje
        ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillRect(w, (dh - he) / 2, Math.max(1, th * 0.35), he);
        if (blink) {
          ctx.fillStyle = 'rgba(255,64,64,0.55)'; ctx.fill(); ctx.fillRect(w, (dh - he) / 2, th, he);
          ctx.strokeStyle = 'rgba(255,70,70,0.85)'; ctx.lineWidth = Math.max(2, 0.5 * u); ctx.strokeRect(0, 0, dw, dh);
        }
      }
      ctx.restore();
      // nummertje
      if (!g.input.isTouch) { ctx.fillStyle = 'rgba(27,36,48,0.4)'; ctx.font = `700 ${2.6 * u}px Inter, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(String(d.i + 1), r.x + 1.6 * u, r.y + 1.4 * u); }
    }
    // losgeraakte deurtjes vallen vóór de kastjes langs en liggen plat op de vloer
    for (const d of doors) {
      if (!d.lost) continue;
      const r = L.rect(d);
      const floorY = H * 0.9, y = Math.min(floorY, r.y + r.h / 2 + d.fy), flat = Math.min(1, Math.max(0, (y - r.y) / (floorY - r.y)));
      const px = r.x + r.w / 2 + (d.i % 2 ? 1 : -1) * flat * 6 * u;
      if (flat > 0.6) { ctx.globalAlpha = (flat - 0.6) * 2.5; ctx.drawImage(art.floorShadow, px - r.w * 0.62, y - r.h * 0.1, r.w * 1.3, r.h * 0.4); ctx.globalAlpha = 1; }
      ctx.save(); ctx.translate(px, y); ctx.rotate(d.fr * (1 - flat) + (d.i % 2 ? 0.15 : -0.15) * flat);
      ctx.scale(1, 1 - flat * 0.8);
      ctx.drawImage(art.door, -r.w / 2 + 3, -r.h / 2 + 3, r.w - 6, r.h - 6);
      ctx.restore();
    }
    parts.draw(ctx);
    ctx.restore();
  };
  return runMini(g, (dt, finish) => {
    g.player.lockedFor = true;
    if (ok !== null) { endT -= dt; parts.update(dt); draw(); if (endT <= 0) finish({ ok, lost, slammed }); return; }
    t += dt; next -= dt; shakeT = Math.max(0, shakeT - dt * 3);
    // deurtjes springen open, steeds vaker
    if (next <= 0) {
      const closed = doors.filter((d) => !d.lost && !d.opening);
      if (closed.length) { const d = closed[Math.floor(Math.random() * closed.length)]; d.opening = true; d.t = 0; g.sfx?.play('open'); }
      next = Math.max(0.35, 1.2 - t * 0.03);
    }
    for (const d of doors) {
      d.slam = Math.max(0, d.slam - dt * 4);
      if (d.lost) { d.fy += d.fall * dt * 300; d.fall += dt * 3; d.fr += dt * 2 * (d.i % 2 ? 1 : -1); continue; }
      if (!d.opening) continue;
      d.t += dt;
      d.open = Math.min(1, d.t / 0.35);
      if (d.t > 1.6) {
        d.lost = true; d.opening = false; lost++;
        combo.miss();
        shakeT = 1; flash(ui.ov, 'bad');
        const L = layout(), r = L.rect(d);
        popText(ui.ov, ['Eraf!', 'Daar gaat er een!', 'Deurtje kwijt!'][lost % 3], ((r.x + r.w / 2) / L.W) * 100, ((r.y + r.h / 2) / L.H) * 100, 'bad big');
        g.sfx?.play('crash');
      }
    }
    parts.update(dt);
    ui.score(`🚪 ${slammed} dicht  ·  ${'💔'.repeat(lost)}${'🤍'.repeat(Math.max(0, maxLost - lost))}  ·  ${Math.max(0, Math.ceil(limit - t))} s`);
    draw();
    if (lost >= maxLost) { ok = false; endT = 1.2; }
    else if (t >= limit) { ok = true; endT = 1.2; flash(ui.ov, 'gold'); popText(ui.ov, 'Demo geslaagd!', 50, 40, 'gold big'); g.sfx?.play('success'); }
  }, () => { ui.close(); removeEventListener('keydown', onKey); g.player.lockedFor = false; }, { doors, label: null });
}
