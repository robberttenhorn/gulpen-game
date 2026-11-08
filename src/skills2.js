// Minigames voor de nieuwe missies: muizen vangen, tuutjes trekken, bommetje, gyros en stempelen.
// Elk spel geeft een Promise terug met de uitslag, of null als de missie gestopt is.
import * as THREE from 'three';
import { makeCharacter } from './character.js';

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
      ms.m.position.set(ms.x, 0, ms.z);
      ms.m.rotation.y = ms.h;
      if (d < 0.65) {
        ms.caught = true; caught++;
        g.scene.remove(ms.m);
        g.ui.toast(['Piep!', 'Hebbes!', 'Weg met dat beest!', 'Nog eentje!', 'Piiiiep!', 'Laatste!'][Math.min(5, caught - 1)], 900);
        g.sfx?.play('pop');
        g.missions.progress(`${caught} / ${n} muizen`);
      }
    }
    g.ui.timer(`${Math.max(0, Math.ceil(limit - t))} s`);
    if (caught >= n) finish({ caught, n, time: t });
    else if (t > limit) finish({ caught, n, late: true });
  }, () => { mice.forEach((ms) => g.scene.remove(ms.m)); g.ui.timer(null); }, { mice });
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
export function startTuutjes(g) {
  const ui = overlay(g, 'Tuutjes trekken', `
    <div class="tt-machine">
      <div class="tt-street"><div class="tt-looker"><span class="tt-face">👀</span><b class="tt-who"></b><small class="tt-say"></small></div></div>
      <div class="tt-box"><div class="tt-window">TUUTJES<br><small>3 stuks · extra veilig</small></div><div class="tt-knob"></div><div class="tt-slot"></div></div>
      <div class="tt-meters"><div>Draaien <div class="bar"><i class="tt-prog"></i></div></div><div>Schaamte <span class="tt-shame">😊😊😊</span></div></div>
    </div>`, g.input.isTouch ? 'Tik om aan de knop te draaien · stop als er iemand kijkt!' : 'Druk op E of spatie om te draaien · stop als er iemand kijkt!');
  let prog = 0, shame = 0, t = 0, state = 'rustig', stT = 1.5 + Math.random() * 1.5, looker = null, rot = 0, caughtThisLook = false;
  const $ = (s) => ui.ov.querySelector(s);
  const setState = (s) => {
    state = s; caughtThisLook = false;
    const el = $('.tt-looker');
    el.className = 'tt-looker ' + s;
    if (s === 'rustig') { stT = 1.4 + Math.random() * 2.2; $('.tt-who').textContent = ''; $('.tt-say').textContent = ''; }
    if (s === 'komt') { stT = 0.8; looker = LOOKERS[Math.floor(Math.random() * LOOKERS.length)]; $('.tt-who').textContent = 'Er komt iemand aan...'; $('.tt-say').textContent = ''; }
    if (s === 'kijkt') { stT = 1.3 + Math.random() * 1.2; $('.tt-who').textContent = looker[0] + ' kijkt!'; $('.tt-say').textContent = ''; }
  };
  return runMini(g, (dt, finish) => {
    t += dt; stT -= dt;
    g.player.lockedFor = true;
    if (stT <= 0) setState(state === 'rustig' ? 'komt' : state === 'komt' ? 'kijkt' : 'rustig');
    if (pressed(g)) {
      if (state === 'kijkt') {
        if (!caughtThisLook) {
          caughtThisLook = true; shame++;
          $('.tt-say').textContent = `"${looker[1]}"`;
          g.sfx?.play('fail');
        }
      } else {
        prog = Math.min(1, prog + 0.055);
        rot += 40;
        g.sfx?.play('cart');
      }
    }
    $('.tt-prog').style.width = prog * 100 + '%';
    $('.tt-knob').style.transform = `rotate(${rot}deg)`;
    $('.tt-shame').textContent = '😳'.repeat(shame) + '😊'.repeat(Math.max(0, 3 - shame));
    ui.score(`${Math.round(prog * 100)}%`);
    if (prog >= 1) { g.sfx?.play('coin'); finish({ ok: true, shame }); }
    else if (shame >= 3) finish({ ok: false, shame });
  }, () => { ui.close(); g.player.lockedFor = false; }, { state: () => state, prog: () => prog });
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
      if (pr) { phase = 'air'; t = 0; $('.tt-bar').style.display = 'none'; $('.tt-hint').textContent = 'Nu! Bommetje maken!'; }
    } else if (phase === 'air') {
      const T = 0.9 + power * 0.5, H = 1.5 + power * 2.6, D = 2.5 + power * 3;
      const k = Math.min(1, t / T);
      jumper.position.set(end.x + D * k, end.y + H * Math.sin(k * Math.PI * 0.9) - k * (end.y - 0.1) , end.z);
      // venster rond het hoogste punt
      const win = Math.abs(k - 0.45) < 0.13;
      if (pr && !tuckAt) { tuckAt = k; tuck = win ? 1 : Math.abs(k - 0.45) < 0.25 ? 0.55 : 0.2; }
      jumper.userData.animate(dt, 0, tuckAt ? 'sit' : 'wave');
      jumper.rotation.x = tuckAt ? -0.6 : 0;
      if (k >= 1) {
        phase = 'splash'; t = 0;
        const q = (0.35 + power * 0.65) * (0.3 + tuck * 0.7);
        fx = q;
        g.fx?.splash(jumper.position.x, room.water.y + 0.1, jumper.position.z, 0.6 + q * 2.6);
        g.sfx?.play('splash');
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
        if (jump >= 3) { const total = scores.reduce((a, b) => a + b, 0); finish({ total, scores }); return; }
        startJump();
      }
    }
    void fx;
  }, () => { ui.close(); g.scene.remove(jumper); g.player.group.visible = true; g.pov = null; g.player.lockedFor = false; }, { phase: () => phase, power: () => power });
}

// ------------------------------------------------------------ gyros (Athene)

// Deel 1: plakjes van de draaiende gyros snijden als het vlees goudbruin langskomt.
// Deel 2: 'Opa!': zo snel mogelijk borden kapotgooien.
export function startGyros(g, { need = 6, tries = 9 } = {}) {
  const ui = overlay(g, 'Gyros!', '<canvas class="mini-canvas"></canvas>', g.input.isTouch ? 'Tik als het goudbruine stuk bij het mes is' : 'E of spatie als het goudbruine stuk bij het mes is');
  const cv = ui.ov.querySelector('canvas');
  const ctx = cv.getContext('2d');
  const r = cv.getBoundingClientRect();
  cv.width = r.width * devicePixelRatio; cv.height = r.height * devicePixelRatio;
  let phase = 'snijden', t = 0, band = 0.1, speed = 0.55, good = 0, used = 0, flash = 0, flashGood = false, plates = 0, slices = [];
  const draw = () => {
    const W = cv.width, H = cv.height, u = H / 100;
    ctx.fillStyle = '#1e140c'; ctx.fillRect(0, 0, W, H);
    // tegeltjes
    ctx.fillStyle = '#e8f0f8';
    for (let y = 0; y < 3; y++) for (let x = 0; x * 10 * u < W; x++) ctx.fillRect(x * 10 * u, y * 10 * u, 9.4 * u, 9.4 * u);
    if (phase === 'snijden') {
      const cx = W / 2, top = 18 * u, bot = 80 * u;
      // draaiende vleeskegel met strepen
      for (let i = 0; i < 24; i++) {
        const y0 = top + (i / 24) * (bot - top), y1 = top + ((i + 1) / 24) * (bot - top);
        const wTop = 10 * u + (i / 24) * 6 * u;
        ctx.fillStyle = i % 2 ? '#8b4a22' : '#a35a2a';
        ctx.fillRect(cx - wTop, y0, wTop * 2, y1 - y0 + 1);
      }
      // goudbruine strook die rondgaat (van links naar rechts)
      const bx = cx - 16 * u + band * 32 * u;
      ctx.fillStyle = 'rgba(255, 190, 60, 0.85)';
      ctx.fillRect(bx - 3 * u, top, 6 * u, bot - top);
      // mes
      ctx.fillStyle = '#cfd8dc';
      ctx.fillRect(cx - 0.6 * u, top - 6 * u, 1.2 * u, bot - top + 12 * u);
      ctx.fillStyle = '#5d4037'; ctx.fillRect(cx - 1.5 * u, top - 12 * u, 3 * u, 7 * u);
      // pita onderaan met plakjes
      ctx.fillStyle = '#f1d9a6'; ctx.beginPath(); ctx.ellipse(cx, 92 * u, 22 * u, 5 * u, 0, 0, 7); ctx.fill();
      slices.forEach((s, i) => { ctx.fillStyle = s ? '#b5652e' : '#3a1a0a'; ctx.fillRect(cx - 18 * u + i * 4.2 * u, 88 * u, 3.4 * u, 2 * u); });
      if (flash > 0) { ctx.fillStyle = flashGood ? 'rgba(120,255,120,0.25)' : 'rgba(255,80,80,0.25)'; ctx.fillRect(0, 0, W, H); }
    } else {
      // borden die stukgaan
      ctx.fillStyle = '#fff'; ctx.font = `800 ${10 * u}px "Baloo 2", sans-serif`; ctx.textAlign = 'center';
      ctx.fillText('OPA!', W / 2, 30 * u);
      for (let i = 0; i < plates; i++) {
        const x = (0.1 + ((i * 37) % 80) / 100) * W, y = (0.45 + ((i * 53) % 40) / 100) * H;
        ctx.fillStyle = '#fafafa'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 3 * u, y - 2 * u); ctx.lineTo(x + 5 * u, y + 1 * u); ctx.fill();
        ctx.fillStyle = '#90caf9'; ctx.fillRect(x - 2 * u, y + 1 * u, 2.5 * u, 1 * u);
      }
    }
  };
  return runMini(g, (dt, finish) => {
    t += dt; flash -= dt;
    g.player.lockedFor = true;
    const pr = pressed(g);
    if (phase === 'snijden') {
      band += speed * dt;
      if (band > 1) band -= 1;
      if (pr) {
        used++;
        const ok = Math.abs(band - 0.5) < 0.07;
        if (ok) good++;
        slices.push(ok);
        flash = 0.25; flashGood = ok;
        g.sfx?.play(ok ? 'pop' : 'splat');
        g.toastSmall?.(ok ? 'Mooi plakje!' : 'Rauw!');
        speed += 0.06;
      }
      ui.score(`Plakjes: ${good} / ${need} (nog ${tries - used} pogingen)`);
      if (good >= need) { phase = 'opa'; t = 0; ui.ov.querySelector('.mini-hint').textContent = 'OPA! Tik zo snel als je kunt om borden kapot te gooien!'; }
      else if (used >= tries) finish({ ok: false, good });
    } else {
      if (pr) { plates++; g.sfx?.play('crash'); }
      ui.score(`Borden: ${plates} · nog ${Math.max(0, 5 - t).toFixed(1)} s`);
      if (t >= 5) finish({ ok: true, good, plates });
    }
    draw();
  }, () => { ui.close(); g.player.lockedFor = false; }, { band: () => band, phase: () => phase });
}

// ------------------------------------------------------------ stempelen (gemeentehuis)

// De stempel precies in het vakje zetten: tik als de stempel boven het vakje hangt.
export function startStamp(g, title = 'Stempelen') {
  const ui = overlay(g, title, `<div class="tt-task" style="bottom:auto;top:40%"><div class="tt-step">Officieel formulier</div><div class="tt-hint">Tik als de stempel in het gele vakje staat</div><div class="tt-bar"><div class="tt-zone" style="left:44%;width:14%"></div><div class="tt-perfect" style="left:48%;width:6%"></div><div class="tt-needle"></div></div></div>`, 'Eén stempel. Scheef = opnieuw aansluiten in de rij.');
  let t = 0;
  return runMini(g, (dt, finish) => {
    t += dt;
    g.player.lockedFor = true;
    const v = (Math.sin(t * 2.6 - Math.PI / 2) + 1) / 2;
    ui.ov.querySelector('.tt-needle').style.left = v * 100 + '%';
    if (pressed(g)) { g.sfx?.play('kick'); finish({ ok: v > 0.44 && v < 0.58, perfect: v > 0.48 && v < 0.54 }); }
  }, () => { ui.close(); g.player.lockedFor = false; }, { v: () => (Math.sin(t * 2.6 - Math.PI / 2) + 1) / 2 });
}
