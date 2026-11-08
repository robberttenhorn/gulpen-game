// Korte missies op snelheid, behendigheid en precisie:
// slalom op de fiets, pils vangen, een ontsnapte geit, inparkeren en vogelschieten.
// Elk spel geeft een Promise terug met de uitslag, of null als de klus gestopt is.
import * as THREE from 'three';
import { popText, flash, shake, bump, makeCombo, Particles, fitCanvas } from './minifx.js';

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });
const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m; };

// Minispel registreren: update per frame, stop bij 'Stoppen'.
// debug: gegevens voor automatische tests (bijv. waar de poortjes staan)
function runMini(g, update, cleanup, debug = null) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (r) => { if (done) return; done = true; g.minigame = null; cleanup?.(); resolve(r); };
    g.minigame = { stop: () => finish(null), update: (dt) => update(dt, finish), debug };
  });
}

function makeCone() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.ConeGeometry(0.22, 0.6, 14), std(0xff6d00), 0, 0.3, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.115, 0.15, 0.1, 14), std(0xffffff), 0, 0.33, 0));
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.04, 0.5), std(0xff6d00), 0, 0.02, 0));
  g.scale.setScalar(1.6); // goed zichtbaar vanaf de fiets
  return g;
}

// ------------------------------------------------------------ slalom op de fiets

// Pionnen langs de gevel f (frame van een pand). Geeft { time, penalty, total } terug.
export function startSlalom(g, f, { gates = 6, spacing = 7, limit = 30 } = {}) {
  const w = g.world;
  // een strook voor de gevel zoeken die vrij is
  let base = 5.5;
  const len = 6 + gates * spacing + 6;
  for (const b of [5.5, 7, 8.5, 10, 4.5]) {
    let ok = true;
    for (let s = -4; s <= len; s += 3) for (const l of [-2, 0, 2]) {
      const x = f.x + f.nx * (b + l) + f.ux * (s - len / 2), z = f.z + f.nz * (b + l) + f.uz * (s - len / 2);
      if (w.insideBuilding(x, z) || w.blocked(x, z)) ok = false;
    }
    if (ok) { base = b; break; }
  }
  const P = (s, l) => [f.x + f.nx * (base + l) + f.ux * (s - len / 2), f.z + f.nz * (base + l) + f.uz * (s - len / 2)];
  const group = new THREE.Group();
  g.scene.add(group);
  const cones = [];
  const gateList = [];
  for (let i = 0; i < gates; i++) {
    const s = 6 + i * spacing, off = i % 2 ? 1.5 : -1.5;
    const gate = { s, off, passed: false, cones: [] };
    gateList.push(gate);
    for (const side of [-1.1, 1.1]) {
      const c = makeCone();
      gate.cones.push(c);
      const [x, z] = P(s, off + side);
      c.position.set(x, w.groundAt(x, z), z);
      group.add(c);
      cones.push({ m: c, x, z, hit: false });
    }
  }
  // start- en finishlijn
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const s of [2, len - 3]) {
    const [x, z] = P(s, 0);
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.02, 6), lineMat); // dwars op de baan
    l.rotation.y = Math.atan2(f.nx, f.nz);
    l.position.set(x, w.groundAt(x, z) + 0.05, z);
    group.add(l);
  }
  // speler op de fiets bij de start
  if (g.mode === 'car') g.exitCar();
  g.setMode('bike');
  const [sx, sz] = P(-3, 0);
  g.player.x = sx; g.player.z = sz;
  g.player.heading = Math.atan2(f.ux, f.uz);
  g.player.speed = 0;
  g.camYaw = g.player.heading + Math.PI;
  let t = -3, started = false, penalty = 0;
  g.ui.toast('3...', 800);
  setTimeout(() => g.minigame && g.ui.toast('2...', 800), 1000);
  setTimeout(() => g.minigame && g.ui.toast('1...', 800), 2000);
  setTimeout(() => g.minigame && g.ui.toast('Gaan!', 800), 3000);
  return runMini(g, (dt, finish) => {
    const p = g.player;
    p.lockedFor = false; // het gesprek zet de speler vast; tijdens de slalom moet je juist kunnen fietsen
    const dx = p.x - P(0, 0)[0], dz = p.z - P(0, 0)[1];
    const s = dx * f.ux + dz * f.uz, l = dx * f.nx + dz * f.nz;
    t += dt;
    if (t < 0) { p.speed = 0; p.x = sx; p.z = sz; g.ui.timer(`${limit} s`); return; } // aftellen
    if (!started && s > 2) started = true;
    const used = started ? t : 0;
    g.ui.timer((limit - used - penalty).toFixed(1));
    for (const gt of gateList) {
      if (gt.passed || s < gt.s) continue;
      gt.passed = true;
      const good = Math.abs(l - gt.off) <= 1.15;
      // pionnen van het poortje kleuren groen (goed) of rood (gemist) en springen even op
      for (const c of gt.cones) {
        c.traverse((o) => { if (o.isMesh && o.material.color.getHex() === 0xff6d00) { o.material = o.material.clone(); o.material.color.set(good ? 0x43a047 : 0xe53935); o.material.emissive = new THREE.Color(good ? 0x1b5e20 : 0x7f0000); } });
        let k = 0; const y0 = c.position.y;
        const hop = () => { k += 0.08; c.position.y = y0 + Math.sin(Math.min(1, k) * Math.PI) * 0.5; if (k < 1) requestAnimationFrame(hop); };
        hop();
      }
      if (!good) { penalty += 3; g.ui.toast('Poortje gemist! +3 s', 1000); g.sfx?.play('fail'); }
      else { g.sfx?.play('pop'); g.ui.toast(['Mooi!', 'Strak!', 'Netjes!', 'Zo!'][gateList.filter((q) => q.passed).length % 4], 600); }
    }
    for (const c of cones) {
      if (c.hit || Math.hypot(p.x - c.x, p.z - c.z) > 0.6) continue;
      c.hit = true; penalty += 1;
      c.m.rotation.z = Math.PI / 2.3; c.m.rotation.y = Math.random() * 6;
      g.ui.toast('Pion geraakt! +1 s', 900);
      g.sfx?.play('kick');
    }
    if (s >= len - 3 && started) finish({ time: t, penalty, total: t + penalty });
    else if (t + penalty > limit) finish({ time: t, penalty, total: Infinity, late: true });
    else if (Math.abs(l) > 14 || s < -15) finish({ time: t, penalty, total: Infinity, off: true });
  }, () => { g.scene.remove(group); g.ui.timer(null); }, { P, gateList, len });
}

// ------------------------------------------------------------ pils vangen

// Vallende glazen pils opvangen met een dienblad. Geeft { caught, total } terug.
// Het blad kantelt mee, gevangen glazen blijven erop staan, gemiste spatten kapot met scherven en bier.
export function startCatch(g, { total = 16, need = 11 } = {}) {
  const ov = document.createElement('div');
  ov.className = 'mini-overlay';
  ov.innerHTML = `<div class="mini-head"><b>Pils vangen</b><span class="mini-score"></span><button class="mini-stop" type="button">Stoppen</button></div>
    <canvas class="mini-canvas"></canvas>
    <div class="mini-hint">${g.input.isTouch ? 'Sleep je vinger naar links en rechts' : 'Muis, pijltjes of A/D om het dienblad te bewegen'} · vang er minstens ${need}</div>`;
  document.getElementById('hud').prepend(ov);
  document.body.classList.add('pov');
  ov.querySelector('.mini-stop').addEventListener('click', () => g.missions.stop());
  const cv = ov.querySelector('canvas');
  const ctx = cv.getContext('2d');
  fitCanvas(cv);
  const combo = makeCombo(ov);
  const parts = new Particles();
  let trayX = 0.5, trayV = 0, target = null, dragging = false;
  const rel = (e) => (e.clientX - cv.getBoundingClientRect().left) / cv.getBoundingClientRect().width;
  cv.addEventListener('pointerdown', (e) => { dragging = true; target = rel(e); });
  addEventListener('pointerup', () => { dragging = false; });
  cv.addEventListener('pointermove', (e) => { if (dragging || e.pointerType === 'mouse') target = rel(e); });
  const glasses = [];
  let spawned = 0, caught = 0, missed = 0, next = 0.8, t = 0, stack = 0, wobble = 0, shakeT = 0, barFlash = 0;
  const glassPath = (gw, gh) => { ctx.beginPath(); ctx.moveTo(-gw / 2, -gh); ctx.lineTo(gw / 2, -gh); ctx.lineTo(gw * 0.4, 0); ctx.lineTo(-gw * 0.4, 0); ctx.closePath(); };
  const drawGlass = (x, y, r, u, fill = 1) => {
    const gw = 3.4 * u, gh = 11 * u;
    ctx.save(); ctx.translate(x, y); ctx.rotate(r);
    ctx.save(); glassPath(gw, gh); ctx.clip();
    ctx.fillStyle = '#f0a818'; ctx.fillRect(-gw, -gh * 0.78 * fill, gw * 2, gh);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-gw * 0.3, -gh, gw * 0.15, gh); // glans
    ctx.restore();
    ctx.fillStyle = '#fffbef'; ctx.beginPath(); ctx.ellipse(0, -gh * 0.78 * fill - 0.6 * u, gw * 0.55, 1.3 * u, 0, 0, 7); ctx.fill(); // schuim
    glassPath(gw, gh); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = Math.max(1.5, u * 0.35); ctx.stroke();
    ctx.restore();
  };
  const draw = () => {
    fitCanvas(cv);
    const W = cv.width, H = cv.height, u = H / 100;
    ctx.save();
    if (shakeT > 0) ctx.translate((Math.random() - 0.5) * 12 * shakeT, (Math.random() - 0.5) * 12 * shakeT);
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#3a2516'); grad.addColorStop(0.78, '#5a3a22'); grad.addColorStop(0.79, '#2a1a10'); grad.addColorStop(1, '#1b110a');
    ctx.fillStyle = grad; ctx.fillRect(-20, -20, W + 40, H + 40);
    // lampjes die zacht flikkeren
    for (let i = 0; i < 6; i++) { ctx.fillStyle = `rgba(255,200,120,${0.07 + Math.sin(t * 2 + i) * 0.03})`; ctx.beginPath(); ctx.arc(W * (0.1 + i * 0.16), H * 0.12, 6 * u, 0, 7); ctx.fill(); }
    if (barFlash > 0) { ctx.fillStyle = `rgba(255,80,60,${barFlash * 0.35})`; ctx.fillRect(0, H * 0.79, W, H); }
    // vallende glazen pils met schaduw op de toonbank
    for (const gl of glasses) {
      const sx = gl.x * W, sy = H * 0.95, k = Math.min(1, gl.y);
      ctx.fillStyle = `rgba(0,0,0,${0.15 + k * 0.25})`; ctx.beginPath(); ctx.ellipse(sx, sy, (1.5 + k * 2.5) * u, 0.8 * u, 0, 0, 7); ctx.fill();
      drawGlass(gl.x * W, gl.y * H, gl.r, u);
    }
    // dienblad met kanteling en de gevangen glazen erop
    const tw = 18 * u, ty = H * 0.9, tilt = Math.max(-0.25, Math.min(0.25, trayV * 0.12)) + Math.sin(wobble * 30) * wobble * 0.08;
    ctx.save(); ctx.translate(trayX * W, ty); ctx.rotate(tilt);
    for (let i = 0; i < Math.min(stack, 6); i++) drawGlass((i - Math.min(stack, 6) / 2 + 0.5) * 2.6 * u, -1.2 * u, 0, u * 0.75, 0.6);
    ctx.fillStyle = '#d6dadd'; ctx.beginPath(); ctx.ellipse(0, 0, tw / 2, 1.7 * u, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#8a8f94'; ctx.fillRect(-tw / 2, 0, tw, 1.2 * u);
    ctx.restore();
    // hand onder het blad
    ctx.fillStyle = '#f0c8a0'; ctx.beginPath(); ctx.ellipse(trayX * W, ty + 4 * u, 3 * u, 2.2 * u, 0, 0, 7); ctx.fill();
    parts.draw(ctx);
    ctx.restore();
  };
  return runMini(g, (dt, finish) => {
    t += dt; wobble = Math.max(0, wobble - dt * 2); shakeT = Math.max(0, shakeT - dt * 3); barFlash = Math.max(0, barFlash - dt * 2);
    g.player.lockedFor = true;
    // besturing: vinger/muis volgen, of pijltjes
    const mx = g.input.move.x;
    if (Math.abs(mx) > 0.1) target = Math.max(0.08, Math.min(0.92, (target ?? trayX) + mx * dt * 1.5));
    const prev = trayX;
    if (target != null) trayX += (target - trayX) * Math.min(1, dt * 14);
    trayX = Math.max(0.08, Math.min(0.92, trayX));
    trayV = (trayX - prev) / Math.max(dt, 0.001);
    next -= dt;
    if (spawned < total && next <= 0) {
      spawned++;
      glasses.push({ x: 0.1 + Math.random() * 0.8, y: -0.05, v: 0.28 + spawned * 0.022, r: (Math.random() - 0.5) * 0.4, vr: (Math.random() - 0.5) * 3 });
      next = Math.max(0.45, 1.1 - spawned * 0.045);
    }
    fitCanvas(cv);
    const W = cv.width, H = cv.height, u = H / 100;
    const half = (9.5 * u) / W;
    for (let i = glasses.length - 1; i >= 0; i--) {
      const gl = glasses[i];
      gl.y += gl.v * dt; gl.r += gl.vr * dt;
      if (gl.y >= 0.88 && gl.y < 0.94 && Math.abs(gl.x - trayX) < half) {
        glasses.splice(i, 1); caught++; stack++; wobble = 0.6;
        const c = combo.hit();
        g.sfx?.play('clink');
        parts.spawn(gl.x * W, H * 0.88, 14, { color: '#fffbef', speed: 160, up: 120, size: 5 * devicePixelRatio, shape: 'circle', life: 0.6 });
        popText(ov, c >= 3 ? `+1  x${c}` : '+1', gl.x * 100, 72, c >= 3 ? 'gold' : 'good');
      } else if (gl.y > 1.0) {
        glasses.splice(i, 1); missed++; combo.miss();
        g.sfx?.play('crash');
        shakeT = 1; barFlash = 1;
        parts.spawn(gl.x * W, H * 0.97, 18, { color: '#dfeaf5', speed: 380, up: 260, size: 6 * devicePixelRatio, shape: 'shard', life: 0.9 });
        parts.spawn(gl.x * W, H * 0.97, 14, { color: '#f0a818', speed: 220, up: 160, size: 5 * devicePixelRatio, shape: 'circle', life: 0.7 });
        popText(ov, ['Kapot!', 'Scherven!', 'Oei!', 'Zonde van het bier!'][missed % 4], gl.x * 100, 80, 'bad');
      }
    }
    parts.update(dt);
    ov.querySelector('.mini-score').textContent = `🍺 ${caught}  ·  💥 ${missed}  ·  nog ${total - spawned + glasses.length}`;
    draw();
    if (spawned >= total && glasses.length === 0) finish({ caught, total, need });
    else if (missed > total - need) finish({ caught, total, need });
  }, () => { ov.remove(); document.body.classList.remove('pov'); g.player.lockedFor = false; }, { glasses, setTray: (x) => { trayX = x; target = x; }, label: null });
}

// ------------------------------------------------------------ de ontsnapte geit

function makeGoat() {
  const g = new THREE.Group();
  const white = std(0xf2efe6, { roughness: 0.9 });
  const body = mesh(new THREE.CapsuleGeometry(0.28, 0.6, 4, 10), white, 0, 0.75, 0);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const head = new THREE.Group();
  head.add(mesh(new THREE.BoxGeometry(0.22, 0.24, 0.36), white, 0, 0, 0.1));
  for (const s of [-1, 1]) {
    const horn = mesh(new THREE.ConeGeometry(0.035, 0.22, 6), std(0x8d7b68), s * 0.07, 0.17, -0.02);
    horn.rotation.x = -0.6;
    head.add(horn);
    const ear = mesh(new THREE.BoxGeometry(0.14, 0.04, 0.07), white, s * 0.15, 0.06, -0.02);
    head.add(ear);
  }
  head.add(mesh(new THREE.ConeGeometry(0.04, 0.12, 6), std(0xd9d3c4), 0, -0.16, 0.22)); // sikje
  head.position.set(0, 1.05, 0.5);
  g.add(head);
  const legs = [];
  for (const [x, z] of [[-0.15, 0.32], [0.15, 0.32], [-0.15, -0.32], [0.15, -0.32]]) {
    const leg = new THREE.Group();
    leg.add(mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.55, 6), white, 0, -0.27, 0));
    leg.add(mesh(new THREE.BoxGeometry(0.08, 0.06, 0.1), std(0x3e3e3e), 0, -0.55, 0.01));
    leg.position.set(x, 0.58, z);
    g.add(leg);
    legs.push(leg);
  }
  const tail = mesh(new THREE.ConeGeometry(0.05, 0.16, 6), white, 0, 0.95, -0.5);
  tail.rotation.x = -0.8;
  g.add(tail);
  g.userData = { legs, head, tail };
  return g;
}

// Geit drie keer aantikken binnen de tijd. Geeft true/false terug.
export function startGoat(g, center, { radius = 45, tags = 3, limit = 75 } = {}) {
  const w = g.world;
  const goat = makeGoat();
  let [gx, gz] = w.spotNear(center[0] + 8, center[1] + 8);
  let heading = Math.random() * 6.28, speed = 0, burst = 0, hits = 0, t = 0, turnT = 0, phase = 0, hop = 0, cooldown = 0;
  goat.position.set(gx, w.groundAt(gx, gz), gz);
  g.scene.add(goat);
  const marker = { x: gx, z: gz, color: '#ffffff', glyph: 'G', done: false };
  g.tempMarkers = [marker];
  return runMini(g, (dt, finish) => {
    t += dt; cooldown -= dt;
    g.player.lockedFor = false; // het gesprek zet de speler vast; je moet de geit achterna kunnen rennen
    if (g.mode !== 'walk') { if (g.mode === 'car') g.exitCar(); g.setMode('walk'); g.ui.toast('Een geit vang je te voet!', 1500); }
    const p = g.player;
    const d = Math.hypot(p.x - gx, p.z - gz);
    // gedrag: vluchten als je dichtbij komt, anders grazen
    let target = 0.9;
    if (d < 12) {
      const away = Math.atan2(gx - p.x, gz - p.z);
      turnT -= dt;
      if (turnT <= 0) { turnT = 0.7 + Math.random() * 0.8; heading = away + (Math.random() - 0.5) * 1.8; } // zigzaggen
      target = 3.7 + hits * 0.25;
    } else if (Math.random() < dt * 0.5) heading += (Math.random() - 0.5) * 2;
    // terug naar het weiland als hij te ver weg dreigt te gaan
    const dc = Math.hypot(gx - center[0], gz - center[1]);
    if (dc > radius) heading = Math.atan2(center[0] - gx, center[1] - gz) + (Math.random() - 0.5) * 0.6;
    if (burst > 0) { burst -= dt; target = 7; }
    speed += (target - speed) * Math.min(1, dt * 4);
    const nx = gx + Math.sin(heading) * speed * dt, nz = gz + Math.cos(heading) * speed * dt;
    const [rx, rz] = w.resolve(nx, nz, 0.45);
    if (w.blocked(rx, rz) || Math.hypot(rx - nx, rz - nz) > 0.05) heading += Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1);
    else { gx = rx; gz = rz; }
    phase += dt * speed * 3;
    hop = Math.max(0, hop - dt * 3);
    goat.position.set(gx, w.groundAt(gx, gz) + Math.sin(Math.min(1, hop) * Math.PI) * 0.8, gz);
    goat.rotation.y = heading;
    goat.userData.legs.forEach((l, i) => { l.rotation.x = Math.sin(phase + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.6 * Math.min(1, speed / 2); });
    goat.userData.head.rotation.x = speed < 1.2 ? 0.6 + Math.sin(t * 2) * 0.1 : -0.1; // grazen
    goat.userData.tail.rotation.z = Math.sin(t * 12) * 0.4;
    marker.x = gx; marker.z = gz;
    g.ui.timer(`${Math.max(0, Math.ceil(limit - t))} s`);
    // aantikken
    if (d < 1.5 && cooldown <= 0) {
      hits++; cooldown = 1.2; burst = 1.4; hop = 1; heading = Math.atan2(gx - p.x, gz - p.z);
      g.ui.toast(hits >= tags ? 'Hebbes!' : ['Mèèèh!', 'Bijna!', 'Nog één keer!'][Math.min(2, hits - 1)], 1200);
      g.sfx?.play('pop');
      g.missions.progress(`${hits} / ${tags} keer getikt`);
      if (hits >= tags) finish(true);
    }
    if (t > limit) finish(false);
  }, () => { g.scene.remove(goat); g.tempMarkers = []; g.ui.timer(null); }, { goat: () => [gx, gz] });
}

// ------------------------------------------------------------ inparkeren

// Zo veel mogelijk keer inparkeren op de parkeerplaats bij de PLUS, binnen de tijd.
// Steeds een nieuw geel vak, soms met auto's ernaast. Een krasje telt alleen bij een echte botsing
// (met vaart), en kost dan tijd in plaats van dat de missie meteen mislukt.
// Geeft { parked, need, bumps } terug.
export async function startParking(g, near, { need = 5, limit = 120 } = {}) {
  const w = g.world, cars = g.cars;
  const lot = w.parkingSpots
    .map((s) => ({ ...s, d: Math.hypot(s.x - near[0], s.z - near[1]) }))
    .filter((s) => s.d < 90)
    .sort((a, b) => a.d - b.d);
  const occupied = (x, z, r = 2.0) => cars.cars.concat(cars.traffic).some((c) => !c.mission && Math.hypot(c.x - x, c.z - z) < r);
  const lat = (s, k) => [s.x + Math.cos(s.heading) * 2.6 * k, s.z - Math.sin(s.heading) * 2.6 * k];
  const free = lot.filter((s) => !occupied(s.x, s.z));
  if (free.length < 3) return { none: true };
  // auto voor de speler aan de rand van de parkeerplaats
  const st = w.nearestStreet(free[0].x, free[0].z);
  const [cx, cz] = w.resolve(st ? st.x : free[0].x + 12, st ? st.z : free[0].z + 12, 1.4);
  const car = cars.addCar('hatch', cx, cz, Math.atan2(free[0].x - cx, free[0].z - cz), 0x2e7d32);
  car.mission = true;
  if (g.mode === 'car') g.exitCar();
  g.enterCar(car);
  let parked = 0, bumps = 0, t = 0, used = [], spot = null, neigh = [], box = null, beam = null, hold = 0, bumpCd = 0, penalty = 0;
  const yel = new THREE.MeshBasicMaterial({ color: 0xffd400 });
  const clearSpot = () => {
    if (box) g.scene.remove(box);
    if (beam) g.scene.remove(beam);
    for (const c of neigh) removeCar(g, c);
    neigh = []; box = null; beam = null;
  };
  const nextSpot = () => {
    clearSpot();
    // een vrij vak, niet te dicht bij de auto en niet hetzelfde als net
    const opts = free.filter((s) => !used.some((u) => Math.hypot(u.x - s.x, u.z - s.z) < 3) && Math.hypot(s.x - car.x, s.z - car.z) > 6 && !occupied(s.x, s.z));
    spot = opts[Math.floor(Math.random() * Math.min(opts.length, 8))] || free.find((s) => !occupied(s.x, s.z));
    if (!spot) return false;
    used.push(spot);
    // vanaf het tweede vak soms buren links en/of rechts (geparkeerd, op slot)
    if (parked > 0) for (const k of [-1, 1]) {
      if (Math.random() < 0.35 + parked * 0.1) {
        const [x, z] = lat(spot, k);
        if (occupied(x, z, 1.6) || !lot.some((q) => Math.hypot(q.x - x, q.z - z) < 0.8)) continue;
        const c = cars.addCar(['sedan', 'suv', 'hatch'][Math.floor(Math.random() * 3)], x, z, spot.heading + (Math.random() < 0.5 ? Math.PI : 0), [0x9e9e9e, 0x1b1b1b, 0x8d1c1c, 0x1e88e5][Math.floor(Math.random() * 4)]);
        c.x = x; c.z = z; cars.placeCar(c); // niet laten 'ontwijken'
        c.locked = true;
        neigh.push(c);
      }
    }
    box = new THREE.Group();
    for (const [bw, bd, ox, oz] of [[2.4, 0.12, 0, 2.55], [2.4, 0.12, 0, -2.55], [0.12, 5.2, 1.2, 0], [0.12, 5.2, -1.2, 0]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(bw, bd), yel);
      m.rotation.x = -Math.PI / 2;
      m.position.set(ox, 0.06, oz);
      box.add(m);
    }
    box.position.set(spot.x, w.groundAt(spot.x, spot.z), spot.z);
    box.rotation.y = spot.heading;
    g.scene.add(box);
    beam = g.makeBeam(spot.x, spot.z, 0xffd400);
    hold = 0;
    return true;
  };
  nextSpot();
  g.ui.toast('Parkeer in het gele vak!', 1600);
  return new Promise((resolve) => {
    const end = (r) => { g.minigame = null; clearSpot(); g.ui.timer(null); resolve(r); };
    g.minigame = {
      debug: { get spot() { return spot; }, car, get parked() { return parked; } },
      stop: () => end(null),
      update: (dt) => {
        t += dt; bumpCd -= dt;
        const left = limit - t - penalty;
        g.ui.timer(`${Math.max(0, Math.ceil(left))} s`);
        if (g.car !== car) g.ui.prompt('Stap weer in de groene auto');
        // in het vak? (vooruit of achteruit inparkeren mag allebei)
        const dx = car.x - spot.x, dz = car.z - spot.z;
        const fx = Math.sin(spot.heading), fz = Math.cos(spot.heading);
        const along = dx * fx + dz * fz, side = dx * fz - dz * fx;
        let ang = Math.abs(((car.heading - spot.heading) % Math.PI + Math.PI) % Math.PI);
        ang = Math.min(ang, Math.PI - ang);
        const inside = Math.abs(along) < 1.0 && Math.abs(side) < 0.6 && ang < 0.26;
        if (inside && Math.abs(car.speed) < 0.5) hold += dt; else hold = 0;
        // krasje alleen bij een echte botsing met een andere auto, met vaart
        if (car.lastBump && car.bumpSpeed > 2.2 && bumpCd <= 0) {
          bumps++; bumpCd = 1.5; penalty += 5;
          g.ui.toast('Boem! Krasje: 5 seconden eraf', 1300);
        }
        if (hold > 0.6) {
          parked++;
          g.sfx?.play('success');
          g.missions.progress(`Ingeparkeerd: ${parked} / ${need}`);
          g.ui.toast(parked >= need ? 'Perfect!' : ['Netjes!', 'Kaarsrecht!', 'Die kan zo in de folder!', 'Nog eentje!'][Math.min(3, parked - 1)], 1200);
          if (parked >= need) { end({ ok: true, parked, need, bumps }); return; }
          if (!nextSpot()) { end({ ok: parked >= need, parked, need, bumps }); return; }
        }
        if (left <= 0) end({ ok: false, late: true, parked, need, bumps });
      },
    };
  });
}

function removeCar(g, c) {
  if (g.car === c) g.exitCar();
  if (c.mesh) g.scene.remove(c.mesh);
  g.cars.cars = g.cars.cars.filter((x) => x !== c);
}

// ------------------------------------------------------------ vogelschieten

function makeBird() {
  const g = new THREE.Group();
  const wood = (c) => std(c, { roughness: 0.6 });
  const parts = {
    romp: mesh(new THREE.BoxGeometry(0.5, 0.5, 0.9), wood(0xc62828)),
    kop: mesh(new THREE.SphereGeometry(0.22, 12, 10), wood(0xfdd835), 0, 0.35, 0.55),
    staart: mesh(new THREE.BoxGeometry(0.4, 0.08, 0.55), wood(0x1565c0), 0, 0.1, -0.7),
    vleugelL: mesh(new THREE.BoxGeometry(0.75, 0.08, 0.45), wood(0x2e7d32), -0.6, 0.1, 0),
    vleugelR: mesh(new THREE.BoxGeometry(0.75, 0.08, 0.45), wood(0x2e7d32), 0.6, 0.1, 0),
  };
  parts.vleugelL.rotation.z = 0.3; parts.vleugelR.rotation.z = -0.3;
  const beak = mesh(new THREE.ConeGeometry(0.07, 0.2, 8), wood(0xff8f00), 0, 0.35, 0.82);
  beak.rotation.x = Math.PI / 2;
  parts.kop.add(beak); beak.position.set(0, 0, 0.27);
  for (const [k, m] of Object.entries(parts)) { m.userData.part = k; g.add(m); }
  g.userData.parts = parts;
  return g;
}

// Met de buks op de houten vogel op de paal mikken. Geeft { hits, shots, king } terug.
export function startVogelschieten(g, pos, { shots = 12 } = {}) {
  const w = g.world;
  const [px, pz] = pos;
  const y0 = w.groundAt(px, pz);
  const pole = new THREE.Group();
  pole.add(mesh(new THREE.CylinderGeometry(0.12, 0.18, 14, 10), std(0x8d6e63), 0, 7, 0));
  const bird = makeBird();
  bird.scale.setScalar(1.6);
  bird.position.y = 14.4;
  pole.add(bird);
  pole.position.set(px, y0, pz);
  g.scene.add(pole);
  // schutter staat 16 m van de paal
  const ang = Math.random() * 6.28;
  let sx = px + Math.sin(ang) * 16, sz = pz + Math.cos(ang) * 16;
  [sx, sz] = w.resolve(sx, sz, 0.5);
  const eye = new THREE.Vector3(sx, w.groundAt(sx, sz) + 1.6, sz);
  let yaw = Math.atan2(px - sx, pz - sz), pitch = Math.atan2(14.4 + y0 - eye.y, Math.hypot(px - sx, pz - sz));
  const aim = new THREE.Vector3();
  g.player.group.visible = false;
  const ov = document.createElement('div');
  ov.className = 'mini-overlay aim';
  ov.innerHTML = `<div class="mini-head"><b>Vogelschieten</b><span class="mini-score">Schoten: ${shots}</span><button class="mini-stop" type="button">Stoppen</button></div>
    <div class="crosshair"></div>
    <div class="mini-hint">${g.input.isTouch ? 'Sleep om te richten, tik op Schiet' : 'Muis slepen of pijltjes om te richten, spatie of E om te schieten'} · schiet alle vijf stukken van de vogel eraf</div>`;
  document.getElementById('hud').prepend(ov);
  document.body.classList.add('pov');
  ov.querySelector('.mini-stop').addEventListener('click', () => g.missions.stop());
  let drag = null;
  ov.addEventListener('pointerdown', (e) => { if (!e.target.closest('.mini-stop')) drag = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 }; });
  ov.addEventListener('pointermove', (e) => {
    if (!drag) return;
    yaw -= (e.clientX - drag.x) * 0.003; pitch -= (e.clientY - drag.y) * 0.003;
    drag.moved += Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y);
    drag.x = e.clientX; drag.y = e.clientY;
  });
  ov.addEventListener('pointerup', () => { if (drag && drag.moved < 8 && performance.now() - drag.t < 300 && !g.input.isTouch) g.input.actionPressed = true; drag = null; });
  g.ui.setActionLabel('Schiet');
  const ray = new THREE.Raycaster();
  let left = shots, hits = 0, t = 0;
  const falling = [];
  g.pov = { pos: eye.clone(), look: eye.clone(), snap: true };
  // door het vizier: ingezoomd
  const fov0 = g.camera.fov;
  g.camera.fov = 26; g.camera.updateProjectionMatrix();
  return runMini(g, (dt, finish) => {
    t += dt;
    g.player.lockedFor = true;
    const m = g.input.move;
    yaw -= m.x * dt * 0.8; pitch -= m.y * dt * 0.8;
    pitch = Math.max(0.2, Math.min(1.35, pitch));
    // trillende handen: langzaam slingeren, steeds iets meer
    const sway = 0.012 + (shots - left) * 0.0015;
    const sy = yaw + Math.sin(t * 1.3) * sway + Math.sin(t * 3.1) * sway * 0.4;
    const sp = pitch + Math.sin(t * 1.7 + 1) * sway + Math.cos(t * 2.6) * sway * 0.4;
    aim.set(Math.sin(sy) * Math.cos(sp), Math.sin(sp), Math.cos(sy) * Math.cos(sp));
    g.pov.pos.copy(eye);
    g.pov.look.copy(eye).addScaledVector(aim, 10);
    for (const f of falling) { f.v -= 9.8 * dt; f.m.position.y += f.v * dt; f.m.position.x += (f.vx || 0) * dt; f.m.position.z += (f.vz || 0) * dt; f.m.rotation.x += dt * 4; f.m.rotation.z += dt * 3; }
    const pressed = g.input.consumeAction() || g.input.spacePressed;
    g.input.spacePressed = false;
    if (pressed && left > 0) {
      left--;
      g.sfx?.play('kick');
      g.pov.shake = 0.5;
      pitch += 0.05; // terugslag
      flash(ov, 'gold');
      const ch = ov.querySelector('.crosshair'); bump(ch);
      ray.set(eye, aim.clone().normalize());
      const targets = Object.values(bird.userData.parts).filter((p) => p.parent === bird);
      const hit = ray.intersectObjects(targets, true)[0];
      if (hit) {
        let part = hit.object;
        while (part && !part.userData.part) part = part.parent;
        // de romp valt pas als de rest eraf is
        const rest = targets.filter((p) => p.userData.part !== 'romp').length;
        ch.classList.remove('hit'); void ch.offsetWidth; ch.classList.add('hit');
        // houtsplinters
        for (let k = 0; k < 10; k++) {
          const sp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.2), std(0xd7b98a));
          sp.position.copy(hit.point);
          g.scene.add(sp);
          falling.push({ m: sp, v: 2 + Math.random() * 3, vx: (Math.random() - 0.5) * 4, vz: (Math.random() - 0.5) * 4 });
        }
        if (part.userData.part === 'romp' && rest > 0) { popText(ov, 'Raak, maar de romp zit nog vast!', 50, 36, 'small'); }
        else {
          hits++;
          const wp = new THREE.Vector3(); part.getWorldPosition(wp);
          bird.remove(part);
          part.position.copy(wp); g.scene.add(part);
          falling.push({ m: part, v: 2 });
          popText(ov, part.userData.part === 'romp' ? 'SCHUTTERSKONING!' : `Raak! ${part.userData.part.replace('vleugelL', 'linkervleugel').replace('vleugelR', 'rechtervleugel')} eraf!`, 50, 34, part.userData.part === 'romp' ? 'gold big' : 'good');
          g.sfx?.play('pop');
        }
      } else popText(ov, 'Mis!', 50 + (Math.random() - 0.5) * 10, 44, 'bad');
      ov.querySelector('.mini-score').textContent = `Schoten: ${left} · Raak: ${hits} / 5`;
      g.missions.progress(`${hits} / 5 stukken`);
      if (hits >= 5) setTimeout(() => finish({ hits, shots: shots - left, king: true }), 1500);
      else if (left <= 0) setTimeout(() => finish({ hits, shots, king: false }), 900);
    }
  }, () => {
    ov.remove(); document.body.classList.remove('pov');
    g.pov = null; g.player.group.visible = true; g.player.lockedFor = false; g.ui.setActionLabel(null);
    g.camera.fov = fov0; g.camera.updateProjectionMatrix();
    setTimeout(() => { g.scene.remove(pole); falling.forEach((f) => g.scene.remove(f.m)); }, 400);
  }, {
    label: 'Schiet',
    parts: () => Object.values(bird.userData.parts).filter((p) => p.parent === bird).map((p) => p.userData.part),
    aimAt: (name) => {
      const p = bird.userData.parts[name]; const v = new THREE.Vector3(); p.getWorldPosition(v); v.sub(eye);
      yaw = Math.atan2(v.x, v.z); pitch = Math.atan2(v.y, Math.hypot(v.x, v.z));
    },
  });
}
