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
// De knop draait door met vaart, de automaat schudt, en iemand komt van de zijkant aanlopen en blijft staren.
export function startTuutjes(g) {
  const ui = overlay(g, 'Tuutjes trekken', `
    <div class="tt-machine">
      <div class="tt-street"><div class="tt-looker"><div class="tt-person"><span class="tt-head">🙂</span><span class="tt-body"></span></div><div class="tt-bubble"><b class="tt-who"></b><small class="tt-say"></small></div></div><div class="tt-warn">!</div></div>
      <div class="tt-box"><div class="tt-window">TUUTJES<br><small>3 stuks · extra veilig</small></div><div class="tt-knob"><i></i></div><div class="tt-slot"></div><div class="tt-pack">🎁</div></div>
      <div class="tt-meters"><div>Draaien <div class="bar"><i class="tt-prog"></i></div></div><div>Schaamte <span class="tt-shame">😊😊😊</span></div></div>
    </div>`, g.input.isTouch ? 'Tik snel om aan de knop te draaien · STOP als er iemand kijkt!' : 'Druk snel op E of spatie om te draaien · STOP als er iemand kijkt!');
  let prog = 0, shame = 0, t = 0, state = 'rustig', stT = 1.5 + Math.random() * 1.5, looker = null, rot = 0, spin = 0, caughtThisLook = false, done = 0;
  const $ = (s) => ui.ov.querySelector(s);
  const faces = { 'Je tante': '👵', 'De buurvrouw': '👩', 'Prins Carnaval': '🤴', 'Je oude juf': '👩‍🏫', 'De nachtburgemeester': '🕵️', 'Je ex': '😏' };
  const setState = (st) => {
    state = st; caughtThisLook = false;
    $('.tt-looker').className = 'tt-looker ' + st;
    $('.tt-warn').classList.toggle('on', st === 'komt');
    if (st === 'rustig') { stT = 1.4 + Math.random() * 2.2; $('.tt-who').textContent = ''; $('.tt-say').textContent = ''; }
    if (st === 'komt') { stT = 0.9; looker = LOOKERS[Math.floor(Math.random() * LOOKERS.length)]; $('.tt-head').textContent = faces[looker[0]] || '🙂'; $('.tt-who').textContent = 'Er komt iemand aan!'; $('.tt-say').textContent = ''; }
    if (st === 'kijkt') { stT = 1.3 + Math.random() * 1.2; $('.tt-who').textContent = looker[0] + ' kijkt!'; $('.tt-say').textContent = ''; }
  };
  return runMini(g, (dt, finish) => {
    t += dt; stT -= dt;
    g.player.lockedFor = true;
    if (done) { done -= dt; if (done <= 0) finish({ ok: true, shame }); return; }
    if (stT <= 0) setState(state === 'rustig' ? 'komt' : state === 'komt' ? 'kijkt' : 'rustig');
    if (pressed(g)) {
      if (state === 'kijkt') {
        if (!caughtThisLook) {
          caughtThisLook = true; shame++;
          $('.tt-say').textContent = `"${looker[1]}"`;
          flash(ui.ov, 'bad'); shake($('.tt-box'), true); bump($('.tt-shame'));
          popText(ui.ov, 'BETRAPT!', 50, 38, 'bad big');
          g.sfx?.play('fail');
        }
      } else {
        prog = Math.min(1, prog + 0.055);
        spin += 520;
        shake($('.tt-box'));
        bump($('.tt-prog').parentElement);
        if (Math.random() < 0.5) popText(ui.ov, ['krrr', 'klik', 'rrrt', '+5%'][Math.floor(Math.random() * 4)], 46 + Math.random() * 8, 58, 'small');
        g.sfx?.play('cart');
      }
    }
    // knop draait door met vaart en remt af
    rot += spin * dt; spin *= Math.pow(0.04, dt);
    $('.tt-prog').style.width = prog * 100 + '%';
    $('.tt-knob').style.transform = `rotate(${rot}deg)`;
    $('.tt-shame').textContent = '😳'.repeat(shame) + '😊'.repeat(Math.max(0, 3 - shame));
    ui.score(`${Math.round(prog * 100)}%`);
    if (prog >= 1) {
      // pakje valt uit de automaat
      $('.tt-pack').classList.add('drop');
      popText(ui.ov, 'Gelukt!', 50, 40, 'gold big');
      flash(ui.ov, 'gold');
      g.sfx?.play('coin');
      done = 1.3;
    } else if (shame >= 3) finish({ ok: false, shame });
  }, () => { ui.close(); g.player.lockedFor = false; }, { state: () => state, prog: () => prog, label: 'Draai!' });
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
  g.pov = { pos: L(-1, 3.2, 6), look: L(-1.5, 2.2, -1), snap: false };
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
  }, () => { ui.close(); g.scene.remove(jumper); g.player.group.visible = true; g.pov = null; g.player.lockedFor = false; }, { phase: () => phase, power: () => power, get label() { return phase === 'power' ? 'Spring!' : phase === 'air' ? 'Bom!' : null; } });
}

// ------------------------------------------------------------ gyros (Athene)

// Deel 1: plakjes van de draaiende gyros snijden als het goudbruine stuk bij het mes is.
// Het mes hakt, het plakje vliegt in de pita, het vet spettert. Deel 2: 'Opa!': borden kapotgooien.
export function startGyros(g, { need = 6, tries = 9 } = {}) {
  const ui = overlay(g, 'Gyros!', '<canvas class="mini-canvas"></canvas>', g.input.isTouch ? 'Tik als het goudbruine stuk bij het mes is (het mes licht op!)' : 'E, spatie of klik als het goudbruine stuk bij het mes is (het mes licht op!)');
  const cv = ui.ov.querySelector('canvas');
  const ctx = cv.getContext('2d');
  fitCanvas(cv);
  const parts = new Particles();
  const combo = makeCombo(ui.ov);
  let phase = 'snijden', t = 0, band = 0.1, speed = 0.55, good = 0, used = 0, plates = 0, chop = 0, spinT = 0, shakeT = 0;
  const pita = []; // plakjes in de pita
  const flying = []; // vliegende plakjes en borden
  const draw = () => {
    fitCanvas(cv);
    const W = cv.width, H = cv.height, u = H / 100;
    ctx.save();
    if (shakeT > 0) ctx.translate((Math.random() - 0.5) * 14 * shakeT, (Math.random() - 0.5) * 14 * shakeT);
    ctx.fillStyle = '#1e140c'; ctx.fillRect(-20, -20, W + 40, H + 40);
    ctx.fillStyle = '#e8f0f8';
    for (let y = 0; y < 3; y++) for (let x = 0; x * 10 * u < W; x++) ctx.fillRect(x * 10 * u, y * 10 * u, 9.4 * u, 9.4 * u);
    const cx = W / 2, top = 18 * u, bot = 78 * u;
    if (phase === 'snijden') {
      // gloeiende grill achter het vlees
      const glow = ctx.createRadialGradient(cx - 22 * u, (top + bot) / 2, 2 * u, cx - 22 * u, (top + bot) / 2, 30 * u);
      glow.addColorStop(0, 'rgba(255,120,30,0.55)'); glow.addColorStop(1, 'rgba(255,120,30,0)');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#3a3a3a'; ctx.fillRect(cx - 24 * u, top - 4 * u, 2.5 * u, bot - top + 8 * u);
      // draaiende vleeskegel: strepen schuiven mee met het draaien
      ctx.save();
      ctx.beginPath(); ctx.moveTo(cx - 10 * u, top); ctx.lineTo(cx + 10 * u, top); ctx.lineTo(cx + 16 * u, bot); ctx.lineTo(cx - 16 * u, bot); ctx.closePath(); ctx.clip();
      for (let i = -2; i < 14; i++) {
        const x = cx - 18 * u + ((i * 3 * u + spinT * 30 * u) % (36 * u + 3 * u));
        ctx.fillStyle = i % 2 ? '#8b4a22' : '#a35a2a';
        ctx.fillRect(x, top, 3 * u, bot - top);
      }
      // goudbruine strook die rondgaat
      const bx = cx - 16 * u + band * 32 * u;
      ctx.fillStyle = 'rgba(255, 190, 60, 0.9)';
      ctx.fillRect(bx - 3 * u, top, 6 * u, bot - top);
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(cx - 4 * u, top, 2 * u, bot - top); // glans
      ctx.restore();
      // mes: licht op als het goede moment eraan komt, hakt bij een tik
      const ready = Math.abs(band - 0.5) < 0.07;
      const ky = chop * 5 * u;
      ctx.save(); ctx.translate(cx, 0);
      if (ready) { ctx.shadowColor = '#ffe082'; ctx.shadowBlur = 30; }
      ctx.fillStyle = ready ? '#fffde7' : '#cfd8dc';
      ctx.beginPath(); ctx.moveTo(-1.4 * u, top - 6 * u + ky); ctx.lineTo(1.4 * u, top - 6 * u + ky); ctx.lineTo(0.6 * u, bot + 6 * u + ky); ctx.lineTo(-0.6 * u, bot + 6 * u + ky); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#5d4037'; ctx.fillRect(-2 * u, top - 13 * u + ky, 4 * u, 7.5 * u);
      ctx.restore();
      // pita met de plakjes
      ctx.fillStyle = '#f1d9a6'; ctx.beginPath(); ctx.ellipse(cx, 92 * u, 24 * u, 5 * u, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#e3c27f'; ctx.beginPath(); ctx.ellipse(cx, 93 * u, 24 * u, 3 * u, 0, 0, Math.PI); ctx.fill();
      pita.forEach((ok, i) => { ctx.fillStyle = ok ? '#b5652e' : '#ffd8d8'; ctx.save(); ctx.translate(cx - 18 * u + (i % 9) * 4.4 * u, 89 * u - Math.floor(i / 9) * 1.5 * u); ctx.rotate((i % 3 - 1) * 0.3); ctx.fillRect(-1.8 * u, -0.8 * u, 3.6 * u, 1.6 * u); ctx.restore(); });
    } else {
      // OPA!
      const pulse = 1 + Math.sin(t * 12) * 0.08;
      ctx.save(); ctx.translate(W / 2, 30 * u); ctx.scale(pulse, pulse); ctx.rotate(Math.sin(t * 6) * 0.05);
      ctx.fillStyle = '#0d47a1'; ctx.font = `800 ${14 * u}px "Baloo 2", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 1.2 * u; ctx.strokeStyle = '#fff'; ctx.strokeText('OPA!', 0, 0); ctx.fillText('OPA!', 0, 0);
      ctx.restore();
      ctx.fillStyle = '#fff'; ctx.font = `800 ${6 * u}px "Baloo 2", sans-serif`; ctx.textAlign = 'center';
      ctx.fillText(`${plates} borden kapot`, W / 2, 46 * u);
      // vloer met scherven
      ctx.fillStyle = '#3e2a1c'; ctx.fillRect(0, 70 * u, W, 30 * u);
    }
    // vliegende plakjes en borden
    for (const f of flying) {
      ctx.save(); ctx.translate(f.x * W, f.y * H); ctx.rotate(f.r);
      if (f.kind === 'slice') { ctx.fillStyle = f.ok ? '#b5652e' : '#ffd8d8'; ctx.fillRect(-2 * u, -0.9 * u, 4 * u, 1.8 * u); }
      else { ctx.fillStyle = '#fafafa'; ctx.beginPath(); ctx.ellipse(0, 0, 5 * u * f.s, 5 * u * f.s * 0.35, 0, 0, 7); ctx.fill(); ctx.strokeStyle = '#1565c0'; ctx.lineWidth = 0.5 * u; ctx.stroke(); }
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
        flying.push({ kind: 'slice', ok, x: 0.5, y: 0.45, vx: (Math.random() - 0.5) * 0.3, vy: -0.5, r: 0, vr: 9, tx: 0.5 - 0.18 + ((pita.length % 9) * 4.4) / 100 * (H / W) });
        parts.spawn(W / 2, H * 0.45, ok ? 16 : 8, { color: ok ? '#ffcc80' : '#ef9a9a', speed: 260, up: 120, size: 4 * devicePixelRatio, shape: 'circle', life: 0.6 });
        if (ok) { const c = combo.hit(); flash(ui.ov, 'good'); popText(ui.ov, c >= 3 ? `Perfect! x${c}` : 'Perfect!', 50, 30, c >= 3 ? 'gold big' : 'good'); g.sfx?.play('pop'); }
        else { combo.miss(); flash(ui.ov, 'bad'); shakeT = 0.6; popText(ui.ov, band < 0.5 ? 'Rauw!' : 'Te laat!', 50, 30, 'bad'); g.sfx?.play('splat'); }
        speed += 0.06;
      }
      ui.score(`🥙 ${good} / ${need} goed  ·  nog ${tries - used} keer`);
      if (good >= need) {
        phase = 'opa'; t = 0;
        ui.ov.querySelector('.mini-hint').textContent = 'OPA! Tik zo snel als je kunt om borden kapot te gooien!';
        flash(ui.ov, 'gold'); popText(ui.ov, 'Gyros klaar!', 50, 40, 'gold big');
      } else if (used >= tries) finish({ ok: false, good });
    } else {
      if (pr) {
        plates++;
        flying.push({ kind: 'plate', x: 0.5 + (Math.random() - 0.5) * 0.1, y: 0.95, vx: (Math.random() - 0.5) * 0.9, vy: -1.1 - Math.random() * 0.4, r: 0, vr: (Math.random() - 0.5) * 12, s: 1 });
        g.sfx?.play('kick');
      }
      ui.score(`🍽️ ${plates} borden  ·  nog ${Math.max(0, 5 - t).toFixed(1).replace('.', ',')} s`);
      if (t >= 5 && !flying.some((f) => f.kind === 'plate')) finish({ ok: true, good, plates });
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
          shakeT = 0.5; g.sfx?.play('crash');
          if (Math.random() < 0.5) popText(ui.ov, ['OPA!', 'KRAK!', 'Kalimera!', 'Nog eentje!'][Math.floor(Math.random() * 4)], f.x * 100, 70, 'gold');
          flying.splice(i, 1);
        }
      }
    }
    parts.update(dt);
    draw();
  }, () => { ui.close(); g.player.lockedFor = false; }, { band: () => band, phase: () => phase, get label() { return phase === 'snijden' ? 'Snijd!' : 'Opa!'; } });
}

// ------------------------------------------------------------ stempelen (gemeentehuis)

// De stempel precies in het vakje zetten: de stempel zweeft heen en weer boven het formulier,
// bij een tik slaat hij neer en zie je de afdruk (recht of scheef).
export function startStamp(g, title = 'Stempelen') {
  const ui = overlay(g, title, `<div class="st-desk"><div class="st-paper"><b>FORMULIER M-38b</b><small>Inschrijving matras, openbare ruimte</small><div class="st-lines"><i></i><i></i><i></i><i></i></div><div class="st-box">stempel hier</div><div class="st-mark"></div></div><div class="st-stamp"><div class="st-handle"></div><div class="st-foot"></div></div></div>`, g.input.isTouch ? 'Tik als de stempel boven het vakje hangt' : 'E, spatie of klik als de stempel boven het vakje hangt');
  const $ = (s) => ui.ov.querySelector(s);
  ui.ov.querySelector('.st-desk').addEventListener('pointerdown', () => { g.input.actionPressed = true; });
  let t = 0, down = 0, result = null;
  const pos = () => (Math.sin(t * 2.6 - Math.PI / 2) + 1) / 2; // 0..1 over het papier
  return runMini(g, (dt, finish) => {
    g.player.lockedFor = true;
    if (result) {
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
  const draw = () => {
    fitCanvas(cv);
    const L = layout(), { W, H, u, cw, ch } = L;
    ctx.save();
    if (shakeT > 0) ctx.translate((Math.random() - 0.5) * 16 * shakeT, (Math.random() - 0.5) * 16 * shakeT);
    // showroom
    ctx.fillStyle = '#eceff1'; ctx.fillRect(-20, -20, W + 40, H + 40);
    ctx.fillStyle = '#cfd8dc'; ctx.fillRect(0, H * 0.84, W, H);
    // werkblad, spatwand en afzuigkap
    ctx.fillStyle = '#37474f'; ctx.fillRect(L.gx - 2 * u, L.gy + ch + 1 * u, cw * 4 + 4 * u, 3 * u);
    ctx.fillStyle = '#90a4ae'; ctx.fillRect(L.gx + cw * 1.3, 4 * u, cw * 1.4, 14 * u);
    ctx.fillStyle = '#b0bec5'; ctx.beginPath(); ctx.moveTo(L.gx + cw * 1.1, 18 * u); ctx.lineTo(L.gx + cw * 2.9, 18 * u); ctx.lineTo(L.gx + cw * 2.6, 12 * u); ctx.lineTo(L.gx + cw * 1.4, 12 * u); ctx.closePath(); ctx.fill();
    // prijskaartje
    ctx.save(); ctx.translate(W - 14 * u, 12 * u); ctx.rotate(0.15 + Math.sin(t * 2) * 0.05);
    ctx.fillStyle = '#ffeb3b'; ctx.fillRect(-11 * u, -5 * u, 22 * u, 10 * u);
    ctx.fillStyle = '#c62828'; ctx.font = `800 ${3.6 * u}px "Baloo 2", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('€ 24.999,-', 0, -1 * u); ctx.font = `600 ${2 * u}px Inter, sans-serif`; ctx.fillText('excl. deurtjes', 0, 2.6 * u);
    ctx.restore();
    for (const d of doors) {
      const r = L.rect(d);
      // kast binnenkant
      ctx.fillStyle = '#5d4037'; ctx.fillRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
      ctx.fillStyle = '#795548'; ctx.fillRect(r.x + 4, r.y + r.h * 0.5, r.w - 8, 3); // plankje
      if (d.lost) {
        // deurtje ligt op de grond
        // deurtje valt naar beneden en ligt plat op de vloer, onder de kastjes
        const floorY = H * 0.9, y = Math.min(floorY, r.y + r.h / 2 + d.fy), flat = Math.min(1, Math.max(0, (y - r.y) / (floorY - r.y)));
        ctx.save(); ctx.translate(r.x + r.w / 2 + (d.i % 2 ? 1 : -1) * flat * 6 * u, y); ctx.rotate(d.fr * (1 - flat) + (d.i % 2 ? 0.15 : -0.15) * flat);
        ctx.scale(1, 1 - flat * 0.8);
        ctx.fillStyle = '#fafafa'; ctx.fillRect(-r.w / 2 + 3, -r.h / 2 + 3, r.w - 6, r.h - 6);
        ctx.strokeStyle = '#b0bec5'; ctx.strokeRect(-r.w / 2 + 3, -r.h / 2 + 3, r.w - 6, r.h - 6);
        ctx.restore();
        continue;
      }
      // deurtje: schaal in de breedte = openzwaaien, rood bij bijna vallen
      const open = d.open;
      const danger = d.opening && d.t > 0.9;
      const w = (r.w - 6) * (1 - open * 0.85);
      ctx.save();
      ctx.translate(r.x + 3, r.y + 3);
      if (d.slam > 0) ctx.translate(Math.sin(d.slam * 40) * 3 * d.slam, 0);
      ctx.fillStyle = danger ? (Math.sin(t * 30) > 0 ? '#ffcdd2' : '#fafafa') : '#fafafa';
      ctx.fillRect(0, 0, w, r.h - 6);
      ctx.strokeStyle = '#b0bec5'; ctx.lineWidth = 2; ctx.strokeRect(0, 0, w, r.h - 6);
      ctx.fillStyle = '#90a4ae'; ctx.fillRect(w - 10 * (1 - open * 0.8), r.h * 0.42, 4, r.h * 0.16); // greepje
      ctx.restore();
      // nummertje
      if (!g.input.isTouch) { ctx.fillStyle = 'rgba(27,36,48,0.4)'; ctx.font = `700 ${2.6 * u}px Inter, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(String(d.i + 1), r.x + 1.6 * u, r.y + 1.4 * u); }
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
