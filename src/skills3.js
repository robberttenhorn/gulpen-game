// Minigames voor buurtmissies: heg knippen, kabouterjacht, de burendag-BBQ en grond sjouwen met de kruiwagen.
import * as THREE from 'three';
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
function overlay(g, title, inner, hint, full = true) {
  const ov = document.createElement('div');
  ov.className = 'mini-overlay' + (full ? '' : ' slim');
  ov.innerHTML = `<div class="mini-head"><b>${title}</b><span class="mini-score"></span><button class="mini-stop" type="button">Stoppen</button></div>${inner}<div class="mini-hint">${hint}</div>`;
  document.getElementById('hud').prepend(ov);
  if (full) document.body.classList.add('pov');
  ov.querySelector('.mini-stop').addEventListener('click', () => g.missions.stop());
  return { ov, close: () => { ov.remove(); document.body.classList.remove('pov'); }, score: (t) => { ov.querySelector('.mini-score').textContent = t; } };
}

// ------------------------------------------------------------ heg knippen

// Een lijn schuift over de heg naar beneden; hou de heggenschaar erop (vinger slepen, muis of pijltjes).
export function startHedge(g, { time = 24, need = 0.7 } = {}) {
  const ui = overlay(g, 'Heg knippen', '<canvas class="mini-canvas"></canvas>', g.input.isTouch ? 'Sleep je vinger naar links en rechts: hou de schaar op de witte lijn' : 'Muis of pijltjes: hou de schaar op de witte lijn');
  const cv = ui.ov.querySelector('canvas');
  const ctx = cv.getContext('2d');
  fitCanvas(cv);
  const parts = new Particles();
  let x = 0.5, target = null, drag = false, t = 0, on = 0, total = 0, scroll = 0, offT = 0, shakeT = 0;
  const rel = (e) => (e.clientX - cv.getBoundingClientRect().left) / cv.getBoundingClientRect().width;
  cv.addEventListener('pointerdown', (e) => { drag = true; target = rel(e); });
  const onUp = () => { drag = false; };
  addEventListener('pointerup', onUp);
  cv.addEventListener('pointermove', (e) => { if (drag || e.pointerType === 'mouse') target = rel(e); });
  // de lijn: rustige golf die steeds bochtiger wordt
  const lineX = (s) => 0.5 + Math.sin(s * 1.3) * 0.18 * Math.min(1, 0.4 + s * 0.05) + Math.sin(s * 3.1 + 1) * 0.07 * Math.min(1, s * 0.06);
  const cuts = []; // geknipte stukjes (blijven zichtbaar als strakke strook)
  return runMini(g, (dt, finish) => {
    t += dt; shakeT = Math.max(0, shakeT - dt * 3);
    g.player.lockedFor = true;
    fitCanvas(cv);
    const W = cv.width, H = cv.height, u = H / 100;
    if (Math.abs(g.input.move.x) > 0.1) target = Math.max(0.05, Math.min(0.95, (target ?? x) + g.input.move.x * dt * 0.9));
    if (target != null) x += (target - x) * Math.min(1, dt * 12);
    const speed = 0.9 + t * 0.03;
    scroll += speed * dt;
    const cy = 0.66; // schaar iets onder het midden: boven zie je wat komt, onder wat je al knipte
    const want = lineX(scroll);
    const d = Math.abs(x - want);
    total += dt;
    const good = d < 0.045;
    if (good) { on += dt; cuts.push({ s: scroll, x, ok: true }); if (Math.random() < dt * 30) parts.spawn(x * W, cy * H, 2, { color: Math.random() < 0.5 ? '#558b2f' : '#7cb342', speed: 220, up: 200, size: 5 * devicePixelRatio, life: 0.7 }); }
    else { offT += dt; cuts.push({ s: scroll, x, ok: false }); if (offT > 0.5) { offT = 0; shakeT = 0.6; flash(ui.ov, 'bad'); popText(ui.ov, ['Au, de rozen!', 'Scheef!', 'Kaal plekje!', 'Buurman kijkt...'][Math.floor(Math.random() * 4)], x * 100, 60, 'bad'); g.sfx?.play('splat'); } }
    if (good) offT = Math.max(0, offT - dt);
    // tekenen
    ctx.save();
    if (shakeT > 0) ctx.translate((Math.random() - 0.5) * 10 * shakeT, 0);
    ctx.fillStyle = '#87b6e0'; ctx.fillRect(-20, -20, W + 40, H + 40); // lucht
    ctx.fillStyle = '#2e5d1e'; ctx.fillRect(W * 0.04, 6 * u, W * 0.92, H); // heg
    // bladstructuur die meeschuift
    for (let i = 0; i < 160; i++) {
      const lx = ((i * 97.13) % 1) * W * 0.92 + W * 0.04, ly = ((((i * 57.7) % 1) * H + scroll * 220 * u / 10) % (H - 6 * u)) + 6 * u;
      ctx.fillStyle = i % 3 ? '#3b7a26' : '#24501a'; ctx.beginPath(); ctx.arc(lx, ly, 2.2 * u, 0, 7); ctx.fill();
    }
    // al geknipte strook achter de schaar
    // (het geknipte stuk schuift onder de schaar door naar beneden)
    ctx.lineWidth = 5 * u; ctx.lineCap = 'round';
    for (let i = 1; i < cuts.length; i++) {
      const a = cuts[i - 1], c = cuts[i];
      ctx.strokeStyle = c.ok ? 'rgba(170,220,120,0.8)' : 'rgba(120,70,40,0.85)';
      ctx.beginPath(); ctx.moveTo(a.x * W, (cy + (scroll - a.s) * 0.22) * H); ctx.lineTo(c.x * W, (cy + (scroll - c.s) * 0.22) * H); ctx.stroke();
    }
    while (cuts.length && (cy + (scroll - cuts[0].s) * 0.22) > 1.05) cuts.shift();
    // de lijn die nog komt
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 0.9 * u; ctx.setLineDash([2 * u, 1.6 * u]);
    ctx.beginPath();
    for (let k = 0; k <= 60; k++) { const s = scroll + k * 0.08; const y = (cy - k * 0.08 * 0.22) * H; const lx = lineX(s) * W; if (k === 0) ctx.moveTo(lx, y); else ctx.lineTo(lx, y); }
    ctx.stroke(); ctx.setLineDash([]);
    // heggenschaar
    ctx.save(); ctx.translate(x * W, cy * H); ctx.rotate(Math.sin(t * 40) * 0.05);
    ctx.fillStyle = '#ff8f00'; ctx.fillRect(-3 * u, 2 * u, 6 * u, 7 * u);
    ctx.fillStyle = '#b0bec5'; ctx.fillRect(-1 * u, -7 * u, 2 * u, 9 * u);
    for (let k = -6; k < 2; k += 1.5) { ctx.fillRect(-2.2 * u, k * u, 4.4 * u, 0.5 * u); }
    ctx.restore();
    parts.update(dt); parts.draw(ctx);
    ctx.restore();
    const pct = total > 0 ? on / total : 1;
    ui.score(`✂️ ${Math.round(pct * 100)}% netjes  ·  ${Math.max(0, Math.ceil(time - t))} s`);
    if (t >= time) finish({ ok: pct >= need, pct });
  }, () => { ui.close(); removeEventListener('pointerup', onUp); g.player.lockedFor = false; }, { lineX: () => lineX(scroll), setX: (v) => { x = v; target = v; }, label: null });
}

// ------------------------------------------------------------ kabouterjacht

function makeGnome() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.11, 0.15, 0.3, 12), std(0x1565c0), 0, 0.15, 0));
  g.add(mesh(new THREE.SphereGeometry(0.09, 12, 10), std(0xf0c8a0), 0, 0.37, 0));
  g.add(mesh(new THREE.ConeGeometry(0.1, 0.18, 12), std(0xffffff), 0, 0.3, 0.05)); // baard
  g.add(mesh(new THREE.ConeGeometry(0.1, 0.25, 12), std(0xd32f2f), 0, 0.55, 0)); // muts
  g.scale.setScalar(1.3);
  return g;
}

// Kabouters zoeken zonder kaartmarkeringen: een meter laat zien hoe warm je bent.
export function startGnomes(g, spots, { limit = 180 } = {}) {
  const gnomes = spots.map(([x, z]) => {
    const m = makeGnome();
    m.position.set(x, g.world.groundAt(x, z), z);
    m.rotation.y = Math.random() * 6.28;
    g.scene.add(m);
    return { m, x, z, found: false };
  });
  const hud = document.createElement('div');
  hud.className = 'gnome-meter';
  hud.innerHTML = '<div class="gm-label">Koud</div><div class="gm-bar"><i></i></div><div class="gm-count"></div>';
  document.getElementById('hud').appendChild(hud);
  let t = 0, found = 0, lastWord = '';
  return runMini(g, (dt, finish) => {
    t += dt;
    g.player.lockedFor = false; // je loopt gewoon rond
    const p = g.player;
    const left = gnomes.filter((k) => !k.found);
    let d = Infinity;
    for (const k of left) d = Math.min(d, Math.hypot(k.x - p.x, k.z - p.z));
    const heat = Math.max(0, Math.min(1, 1 - d / 70));
    const word = d < 6 ? 'HEET!' : d < 14 ? 'Warm' : d < 28 ? 'Lauw' : d < 50 ? 'Koud' : 'IJskoud';
    if (word !== lastWord) { lastWord = word; bump(hud); if (word === 'HEET!') g.sfx?.play('tally'); }
    hud.querySelector('.gm-label').textContent = word;
    hud.querySelector('.gm-bar i').style.width = heat * 100 + '%';
    hud.style.setProperty('--heat', heat.toFixed(2));
    hud.querySelector('.gm-count').textContent = `${found} / ${gnomes.length} kabouters · ${Math.max(0, Math.ceil(limit - t))} s`;
    for (const k of left) {
      k.m.rotation.y += dt * (Math.hypot(k.x - p.x, k.z - p.z) < 10 ? 3 : 0.3); // dichtbij: hij draait zich om
      if (Math.hypot(k.x - p.x, k.z - p.z) < 2.2) {
        k.found = true; found++;
        g.fx?.confetti(k.x, k.m.position.y + 1, k.z, 50);
        g.sfx?.play('pop');
        g.ui.toast(['Hebbes!', 'Daar zit er een!', 'Gevonden!', 'De laatste!'][Math.min(3, found - 1)], 1100);
        g.missions.progress(`${found} / ${gnomes.length} kabouters`);
        const m = k.m; let s = 0; const hop = () => { s += 0.06; m.position.y += Math.sin(s * Math.PI) * 0.08; m.scale.setScalar(1.3 * (1 - s)); if (s < 1) requestAnimationFrame(hop); else g.scene.remove(m); }; hop();
      }
    }
    if (found >= gnomes.length) finish({ ok: true, found, time: t });
    else if (t > limit) finish({ ok: false, found });
  }, () => { hud.remove(); gnomes.forEach((k) => g.scene.remove(k.m)); }, { gnomes, label: null });
}

// ------------------------------------------------------------ burendag-BBQ

// Zes burgers op de grill. Tik op een burger om hem om te draaien als de onderkant goudbruin is,
// en nog eens om hem op te dienen als de andere kant klaar is. Te lang = verbrand.
export function startBBQ(g, { need = 8, maxBurnt = 3, limit = 60 } = {}) {
  const ui = overlay(g, 'Burendag-BBQ', '<canvas class="mini-canvas"></canvas>', g.input.isTouch ? 'Tik op een burger: omdraaien als hij goudbruin is, nog een keer om op te dienen' : 'Klik op een burger (of toets 1 t/m 6): omdraaien als hij goudbruin is, nog een keer om op te dienen');
  const cv = ui.ov.querySelector('canvas');
  const ctx = cv.getContext('2d');
  fitCanvas(cv);
  const parts = new Particles();
  const combo = makeCombo(ui.ov);
  const fresh = (i) => ({ i, side: 0, cook: [0, 0], rate: 0.16 + Math.random() * 0.12, flip: 0, burnt: false, gone: 0, delay: Math.random() * 1.2 });
  const patties = Array.from({ length: 6 }, (_, i) => fresh(i));
  let t = 0, served = 0, burnt = 0, end = 0, ok = null, plate = 0;
  const layout = () => { const W = cv.width, H = cv.height, u = H / 100; const r = Math.min(W * 0.075, 11 * u); return { W, H, u, r, pos: (i) => [W / 2 + ((i % 3) - 1) * r * 2.8, H * 0.42 + Math.floor(i / 3) * r * 2.6] }; };
  const colorOf = (c) => (c < 0.5 ? `rgb(${190 - c * 60},${110 - c * 50},${110 - c * 60})` : c < 1 ? `rgb(${160 - (c - 0.5) * 80},${85 - (c - 0.5) * 70},${50 - (c - 0.5) * 40})` : `rgb(${120 - Math.min(1, c - 1) * 100},${50 - Math.min(1, c - 1) * 40},${30 - Math.min(1, c - 1) * 25})`);
  const act = (pt) => {
    if (!pt || pt.gone > 0 || pt.delay > 0 || ok !== null) return;
    const c = pt.cook[pt.side];
    const L = layout(), [px, py] = L.pos(pt.i);
    const xp = (px / L.W) * 100, yp = (py / L.H) * 100;
    if (c < 0.55) { popText(ui.ov, 'Nog rauw!', xp, yp - 8, 'bad'); combo.miss(); g.sfx?.play('splat'); return; }
    const perfect = c >= 0.7 && c <= 0.95;
    if (pt.side === 0) { pt.side = 1; pt.flip = 1; popText(ui.ov, perfect ? 'Perfect!' : 'Gedraaid', xp, yp - 8, perfect ? 'gold' : 'good'); g.sfx?.play('kick'); parts.spawn(px, py, 10, { color: '#ffcc80', speed: 160, up: 120, size: 4 * devicePixelRatio, life: 0.5, shape: 'circle' }); }
    else { served++; plate++; pt.gone = 0.6; const cc = combo.hit(); popText(ui.ov, cc >= 3 ? `Smakelijk! x${cc}` : 'Smakelijk!', xp, yp - 8, cc >= 3 ? 'gold' : 'good'); flash(ui.ov, 'good'); g.sfx?.play('pop'); }
  };
  cv.addEventListener('pointerdown', (e) => {
    const r = cv.getBoundingClientRect(), mx = (e.clientX - r.left) * devicePixelRatio, my = (e.clientY - r.top) * devicePixelRatio;
    const L = layout();
    let best = null, bd = L.r * 1.3;
    for (const pt of patties) { const [px, py] = L.pos(pt.i); const d = Math.hypot(px - mx, py - my); if (d < bd) { bd = d; best = pt; } }
    act(best);
  });
  const onKey = (e) => { const n = parseInt(e.key, 10); if (n >= 1 && n <= 6) act(patties[n - 1]); };
  addEventListener('keydown', onKey);
  return runMini(g, (dt, finish) => {
    g.player.lockedFor = true;
    fitCanvas(cv);
    const L = layout(), { W, H, u, r } = L;
    if (ok !== null) { end -= dt; if (end <= 0) { finish({ ok, served, burnt }); return; } }
    else t += dt;
    for (const pt of patties) {
      pt.flip = Math.max(0, pt.flip - dt * 4);
      if (pt.gone > 0) { pt.gone -= dt; if (pt.gone <= 0) Object.assign(pt, fresh(pt.i), { delay: 0.6 + Math.random() * 0.8 }); continue; }
      if (pt.delay > 0) { pt.delay -= dt; continue; }
      if (ok !== null) continue;
      pt.cook[pt.side] += pt.rate * dt * (1 + t * 0.012);
      const [px, py] = L.pos(pt.i);
      if (Math.random() < dt * 6) parts.spawn(px + (Math.random() - 0.5) * r, py, 1, { color: 'rgba(220,220,220,0.6)', speed: 20, up: 40, size: 8 * devicePixelRatio, life: 1.1, gravity: -60, shape: 'circle' }); // rook
      if (pt.cook[pt.side] > 1.35 && !pt.burnt) {
        pt.burnt = true; burnt++; pt.gone = 0.9; combo.miss();
        parts.spawn(px, py, 18, { color: '#333', speed: 120, up: 160, size: 9 * devicePixelRatio, life: 1.2, gravity: -80, shape: 'circle' });
        popText(ui.ov, 'Verbrand!', (px / W) * 100, (py / H) * 100 - 8, 'bad big'); flash(ui.ov, 'bad'); g.sfx?.play('crash');
      }
    }
    parts.update(dt);
    // tekenen: grill met vlammen
    ctx.fillStyle = '#4e6e3a'; ctx.fillRect(0, 0, W, H); // gras in de achtertuin
    ctx.fillStyle = '#263238'; ctx.beginPath(); ctx.ellipse(W / 2, H * 0.5, r * 5.2, r * 3.6, 0, 0, 7); ctx.fill();
    for (let k = 0; k < 9; k++) { const fx = W / 2 + (k - 4) * r * 1.1, fh = (3 + Math.sin(t * 9 + k * 1.7) * 1.4) * u; ctx.fillStyle = `rgba(255,${120 + Math.sin(t * 7 + k) * 50},30,0.55)`; ctx.beginPath(); ctx.ellipse(fx, H * 0.72, r * 0.45, fh, 0, 0, 7); ctx.fill(); }
    ctx.strokeStyle = '#90a4ae'; ctx.lineWidth = 0.6 * u;
    for (let k = -6; k <= 6; k++) { ctx.beginPath(); ctx.moveTo(W / 2 + k * r * 0.75, H * 0.5 - r * 3); ctx.lineTo(W / 2 + k * r * 0.75, H * 0.5 + r * 3); ctx.stroke(); }
    for (const pt of patties) {
      if (pt.delay > 0) continue;
      const [px, py] = L.pos(pt.i);
      const vis = pt.gone > 0 ? Math.max(0, pt.gone / 0.6) : 1;
      const c = pt.cook[pt.side], ready = c >= 0.7 && c <= 0.95;
      ctx.save(); ctx.translate(px, py - (1 - vis) * 20 * u); ctx.scale(vis, vis * (1 - pt.flip * 1.6 * (1 - pt.flip)));
      if (ready && !pt.gone) { ctx.shadowColor = '#ffe082'; ctx.shadowBlur = 24; }
      ctx.fillStyle = colorOf(pt.cook[1 - pt.side] * (pt.flip > 0.5 ? 1 : 0) + c * (pt.flip > 0.5 ? 0 : 1));
      ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.8, 0, 0, 7); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.5 * u;
      for (const gy of [-0.3, 0.05, 0.4]) { ctx.beginPath(); ctx.moveTo(-r * 0.7, gy * r); ctx.lineTo(r * 0.7, gy * r); ctx.stroke(); }
      ctx.restore();
      // gaarheid-meter onder de burger
      if (!pt.gone) {
        ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(px - r, py + r * 0.95, r * 2, 1.2 * u);
        ctx.fillStyle = 'rgba(120,255,140,0.6)'; ctx.fillRect(px - r + r * 2 * (0.7 / 1.35), py + r * 0.95, r * 2 * (0.25 / 1.35), 1.2 * u);
        ctx.fillStyle = c > 1 ? '#ff5252' : '#fff'; ctx.fillRect(px - r + r * 2 * Math.min(1, c / 1.35) - 2, py + r * 0.85, 4, 2.2 * u);
        if (!g.input.isTouch) { ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = `700 ${2.4 * u}px Inter, sans-serif`; ctx.textAlign = 'center'; ctx.fillText(String(pt.i + 1), px, py - r * 0.95); }
      }
    }
    parts.draw(ctx);
    // bord met opgediende burgers
    for (let k = 0; k < Math.min(plate, 10); k++) { ctx.fillStyle = '#f1d9a6'; ctx.beginPath(); ctx.ellipse(W * 0.12, H * 0.86 - k * 1.4 * u, r * 0.8, r * 0.3, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#6d3b1e'; ctx.fillRect(W * 0.12 - r * 0.7, H * 0.86 - k * 1.4 * u - 0.5 * u, r * 1.4, 0.8 * u); }
    ui.score(`🍔 ${served} / ${need}  ·  ${'🔥'.repeat(burnt)}${'·'.repeat(Math.max(0, maxBurnt - burnt))}  ·  ${Math.max(0, Math.ceil(limit - t))} s`);
    if (ok === null) {
      if (served >= need) { ok = true; end = 1.2; popText(ui.ov, 'De buurt is verzadigd!', 50, 30, 'gold big'); g.sfx?.play('success'); }
      else if (burnt >= maxBurnt || t >= limit) { ok = false; end = 1.2; }
    }
  }, () => { ui.close(); removeEventListener('keydown', onKey); g.player.lockedFor = false; }, { patties, act, label: null });
}

// ------------------------------------------------------------ grond sjouwen met de kruiwagen

// Rij de kruiwagen heen en weer tussen de berg grond en de tuin. Rennen of scherpe bochten = grond morsen.
// Geeft { ok, delivered, trips } terug (delivered in volle kruiwagens).
export function startBarrow(g, { heap, drop, trips = 3, need = 2.1, limit = 110, makeBarrow, onDeliver } = {}) {
  const p = g.player;
  const barrow = makeBarrow();
  barrow.position.set(0, 0, 0.55);
  p.group.add(barrow);
  const { soil, tray } = barrow.userData;
  p.pose = 'push';
  const clumps = [];
  const clumpGeo = new THREE.DodecahedronGeometry(0.07, 0);
  const clumpMat = std(0x4a3220, { roughness: 1 });
  // ring bij de plek waar je moet zijn
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.1, 8, 28), new THREE.MeshBasicMaterial({ color: 0xf2c14e }));
  ring.rotation.x = Math.PI / 2;
  g.scene.add(ring);
  let load = 0, delivered = 0, trip = 0, t = 0, state = 'naarBerg', busyT = 0, lastHeading = p.heading, warnT = 0, spillAcc = 0;
  const goTo = ([x, z]) => {
    ring.position.set(x, g.world.groundAt(x, z) + 0.15, z);
    g.setTarget({ pos: new THREE.Vector3(x, 0, z) });
  };
  goTo(heap);
  const status = () => {
    const pct = Math.round(load * 100);
    g.missions.progress(`Rit ${Math.min(trip + 1, trips)} / ${trips}  ·  kruiwagen ${pct}% vol  ·  in de tuin: ${Math.round(delivered * 100)}%`);
  };
  status();
  return runMini(g, (dt, finish) => {
    t += dt; warnT -= dt;
    g.ui.timer(`${Math.max(0, Math.ceil(limit - t))} s`);
    if (g.mode !== 'walk') g.setMode('walk');
    // morsen: rennen en scherpe bochten
    let dh = p.heading - lastHeading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    lastHeading = p.heading;
    const turn = Math.abs(dh) / Math.max(dt, 1e-3);
    if (load > 0 && state === 'naarTuin') {
      const spill = (Math.max(0, p.speed - 4.3) * 0.11 + (p.speed > 0.6 ? Math.max(0, turn - 3) * 0.035 : 0)) * dt;
      if (spill > 0) {
        load = Math.max(0, load - spill);
        spillAcc += spill;
        // kluitjes vallen uit de bak op straat
        while (spillAcc > 0.012 && clumps.length < 90) {
          spillAcc -= 0.012;
          const c = new THREE.Mesh(clumpGeo, clumpMat);
          const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
          const x = p.x + fx * 1.0 + (Math.random() - 0.5) * 0.5, z = p.z + fz * 1.0 + (Math.random() - 0.5) * 0.5;
          c.position.set(x, g.world.groundAt(x, z) + 0.04, z);
          c.rotation.set(Math.random() * 3, Math.random() * 3, 0);
          c.scale.setScalar(0.7 + Math.random() * 0.8);
          g.scene.add(c); clumps.push(c);
        }
        if (warnT <= 0) { warnT = 2.2; g.ui.toast(p.speed > 4.3 ? 'Niet rennen, je morst!' : 'Rustig in de bocht!', 1100); g.sfx?.play('splat'); }
        status();
      }
    }
    soil.scale.y = Math.max(0.001, load * 1.1);
    // bak wiebelt mee bij lopen
    tray.rotation.z = Math.sin(t * 9) * 0.03 * Math.min(1, p.speed / 4);
    if (busyT > 0) {
      busyT -= dt;
      p.lockedFor = true;
      if (state === 'scheppen') {
        load = Math.min(1, load + dt / 1.1);
        if (Math.random() < dt * 4) g.sfx?.play('step');
        if (busyT <= 0) { load = 1; state = 'naarTuin'; goTo(drop); g.ui.toast('Vol! Naar de tuin, rustig aan.', 1300); }
      } else if (state === 'kiepen') {
        tray.rotation.x = Math.sin(Math.max(0, 1 - busyT / 0.9) * Math.PI) * 0.9; // bak naar voren kiepen en terug
        if (busyT <= 0) {
          tray.rotation.x = 0;
          delivered += load; onDeliver?.(delivered, load); load = 0; trip++;
          g.sfx?.play('pop');
          if (trip >= trips) { status(); finish({ ok: delivered >= need, delivered, trips: trip }); return; }
          state = 'naarBerg'; goTo(heap);
          g.ui.toast(`Rit ${trip} klaar. Nog ${trips - trip}!`, 1200);
        }
      }
      if (busyT <= 0) p.lockedFor = false;
      status();
      return;
    }
    const near = (pt, r) => Math.hypot(p.x - pt[0], p.z - pt[1]) < r;
    if (state === 'naarBerg' && near(heap, 2.6)) { state = 'scheppen'; busyT = 1.1; p.speed = 0; g.ui.toast('Scheppen...', 900); }
    else if (state === 'naarTuin' && near(drop, 2.4)) { state = 'kiepen'; busyT = 0.9; p.speed = 0; g.sfx?.play('splat'); }
    if (t > limit) finish({ ok: false, delivered, trips: trip, late: true });
  }, () => {
    p.group.remove(barrow);
    p.pose = null;
    p.lockedFor = false;
    g.scene.remove(ring);
    g.setTarget(null);
    g.ui.timer(null);
    clumps.forEach((c) => g.scene.remove(c));
  }, { get state() { return state; }, get load() { return load; }, heap, drop, label: null });
}
