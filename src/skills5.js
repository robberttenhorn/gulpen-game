// Minispellen bij de geschiedenis- en dorpsmissies: Romeinse opgraving, borden opmaken bij Restaurant Atelier,
// bier tappen op de Gulpener Bierfeesten, wildcamerafoto's van de korenwolf nakijken en forellen scheppen.
// Elk spel geeft een Promise terug met de uitslag, of null als de klus gestopt is.
import { popText, flash, shake, bump, makeCombo, Particles, fitCanvas } from './minifx.js';

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
const canvasPos = (cv, e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * devicePixelRatio, (e.clientY - r.top) * devicePixelRatio]; };
const rnd = (a, b) => a + Math.random() * (b - a);

// ------------------------------------------------------------ Romeinse opgraving

const FINDS = [
  { id: 'munt', name: 'Romeinse munt', c: '#c9a227' },
  { id: 'munt', name: 'nog een munt', c: '#b08d57' },
  { id: 'scherf', name: 'potscherf', c: '#b5522f' },
  { id: 'fibula', name: 'mantelspeld (fibula)', c: '#7e8c6a' },
  { id: 'dakpan', name: 'stuk dakpan', c: '#a0442a' },
  { id: 'kraal', name: 'glazen kraal', c: '#3fa7a0' },
];

// Graven in vakjes. Een leeg vakje laat zien hoeveel vondsten er in de vakjes eromheen liggen
// (de metaaldetector piept). Ergens ligt de waterleiding: daar graven kost drie scheppen.
export function startOpgraving(g, { cols = 7, rows = 5, digs = 16, need = 5 } = {}) {
  const ui = overlay(g, 'Opgraving aan de Oude Akerweg', '<canvas class="mini-canvas"></canvas>',
    g.input.isTouch ? 'Tik op een vakje om te graven. Een getal zegt hoeveel vondsten er in de vakjes eromheen liggen.' : 'Klik op een vakje om te graven. Een getal zegt hoeveel vondsten er in de vakjes eromheen liggen.');
  const cv = ui.ov.querySelector('canvas');
  const ctx = cv.getContext('2d');
  fitCanvas(cv);
  const parts = new Particles();
  const cells = Array.from({ length: cols * rows }, (_, i) => ({ i, x: i % cols, y: Math.floor(i / cols), dug: false, find: null, pipe: false, n: 0, anim: 0 }));
  const pick = () => cells.filter((c) => !c.find && !c.pipe)[Math.floor(Math.random() * cells.filter((c) => !c.find && !c.pipe).length)];
  FINDS.forEach((f) => { pick().find = f; });
  pick().pipe = true;
  for (const c of cells) c.n = cells.filter((o) => o.find && Math.abs(o.x - c.x) <= 1 && Math.abs(o.y - c.y) <= 1 && o !== c).length;
  let left = digs, found = 0, end = 0, ok = null, t = 0;
  const layout = () => {
    const W = cv.width, H = cv.height, u = H / 100;
    const s = Math.min((W * 0.9) / cols, (H * 0.68) / rows);
    return { W, H, u, s, x0: (W - s * cols) / 2, y0: H * 0.2 };
  };
  const dig = (c) => {
    if (!c || c.dug || ok !== null) return;
    c.dug = true; c.anim = 1;
    const L = layout();
    const cx = L.x0 + (c.x + 0.5) * L.s, cy = L.y0 + (c.y + 0.5) * L.s;
    const xp = (cx / L.W) * 100, yp = (cy / L.H) * 100;
    parts.spawn(cx, cy, 14, { color: '#7a5a3a', speed: 160, up: 140, size: 5 * devicePixelRatio, life: 0.7 });
    left--;
    if (c.pipe) {
      left = Math.max(0, left - 2);
      flash(ui.ov, 'bad'); shake(cv, true); g.sfx?.play('splash');
      popText(ui.ov, 'Oeps! De waterleiding! −3 scheppen', xp, yp - 6, 'bad big');
      parts.spawn(cx, cy, 30, { color: '#64b5f6', speed: 220, up: 320, size: 5 * devicePixelRatio, life: 1.1, shape: 'circle' });
    } else if (c.find) {
      found++;
      flash(ui.ov, 'gold'); g.sfx?.play('coin');
      popText(ui.ov, `Gevonden: ${c.find.name}!`, xp, yp - 6, 'gold');
    } else {
      g.sfx?.play(c.n ? 'tally' : 'kick');
      popText(ui.ov, c.n ? `Piep${c.n > 1 ? ' piep' : ''}!` : 'Niks...', xp, yp - 6, c.n ? 'good' : 'small');
    }
  };
  cv.addEventListener('pointerdown', (e) => {
    const [mx, my] = canvasPos(cv, e);
    const L = layout();
    const x = Math.floor((mx - L.x0) / L.s), y = Math.floor((my - L.y0) / L.s);
    if (x >= 0 && x < cols && y >= 0 && y < rows) dig(cells[y * cols + x]);
  });
  return runMini(g, (dt, finish) => {
    g.player.lockedFor = true;
    fitCanvas(cv);
    t += dt;
    const L = layout(), { W, H, u, s } = L;
    if (ok !== null) { end -= dt; if (end <= 0) { finish({ ok, found, used: digs - left }); return; } }
    parts.update(dt);
    // tekenen: zandbak met touwtjes, de oude weg loopt erdoorheen
    ctx.fillStyle = '#9ccc65'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#c8a26b'; ctx.fillRect(L.x0 - 2 * u, L.y0 - 2 * u, s * cols + 4 * u, s * rows + 4 * u);
    for (const c of cells) {
      const x = L.x0 + c.x * s, y = L.y0 + c.y * s;
      c.anim = Math.max(0, c.anim - dt * 3);
      ctx.fillStyle = c.dug ? (c.pipe ? '#5d8fb8' : '#6d4c2f') : ((c.x + c.y) % 2 ? '#b88c55' : '#c39860');
      ctx.fillRect(x + 1, y + 1 + c.anim * 4, s - 2, s - 2);
      if (c.dug && c.find) {
        ctx.fillStyle = c.find.c;
        ctx.beginPath();
        if (c.find.id === 'munt') ctx.arc(x + s / 2, y + s / 2, s * 0.22, 0, 7);
        else if (c.find.id === 'kraal') ctx.arc(x + s / 2, y + s / 2, s * 0.15, 0, 7);
        else ctx.ellipse(x + s / 2, y + s / 2, s * 0.3, s * 0.16, 0.5, 0, 7);
        ctx.fill();
      } else if (c.dug && c.pipe) {
        ctx.fillStyle = '#90a4ae'; ctx.fillRect(x, y + s * 0.42, s, s * 0.16);
      } else if (c.dug && c.n) {
        ctx.fillStyle = ['#fff', '#ffe082', '#ffb74d', '#ff7043', '#e53935'][Math.min(4, c.n)];
        ctx.font = `800 ${s * 0.5}px Inter, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(c.n), x + s / 2, y + s / 2 + 1);
      }
    }
    // touwtjes van het raster
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 0.25 * u;
    for (let k = 0; k <= cols; k++) { ctx.beginPath(); ctx.moveTo(L.x0 + k * s, L.y0); ctx.lineTo(L.x0 + k * s, L.y0 + rows * s); ctx.stroke(); }
    for (let k = 0; k <= rows; k++) { ctx.beginPath(); ctx.moveTo(L.x0, L.y0 + k * s); ctx.lineTo(L.x0 + cols * s, L.y0 + k * s); ctx.stroke(); }
    parts.draw(ctx);
    ctx.fillStyle = '#1b2430'; ctx.font = `700 ${3 * u}px Inter, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('De oude Romeinse weg van Maastricht naar Aken', W / 2, L.y0 + rows * s + 6 * u);
    ui.score(`🏺 ${found} / ${need}  ·  ⛏ ${left} scheppen`);
    if (ok === null) {
      if (found >= need) { ok = true; end = 1.6; popText(ui.ov, 'Wat een vondsten!', 50, 30, 'gold big'); g.sfx?.play('success'); }
      else if (left <= 0) {
        ok = false; end = 2.2;
        // laat zien waar de rest lag
        cells.forEach((c) => { if (c.find) c.dug = true; });
        popText(ui.ov, 'Geen scheppen meer!', 50, 30, 'bad big');
      }
    }
  }, () => { ui.close(); g.player.lockedFor = false; }, {
    label: null, dig: (i) => dig(cells[i]),
    // voor tests: de vakjes met een vondst
    finds: () => cells.filter((c) => c.find && !c.dug).map((c) => c.i),
  });
}

// ------------------------------------------------------------ borden opmaken bij Restaurant Atelier

const COURSES = [
  { name: 'Amuse', items: [{ n: 'coquille', c: '#fff3e0', r: 0.13 }, { n: 'druppel bietencrème', c: '#ad1457', r: 0.06 }, { n: 'druppel bietencrème', c: '#ad1457', r: 0.06 }, { n: 'kruidenblaadje', c: '#43a047', r: 0.05 }] },
  { name: 'Hoofdgerecht', items: [{ n: 'stukje hert', c: '#6d2f1f', r: 0.15 }, { n: 'quenelle knolselderij', c: '#efe6cf', r: 0.1 }, { n: 'gepofte biet', c: '#880e4f', r: 0.08 }, { n: 'jus', c: '#4e2a1a', r: 0.07 }, { n: 'kruidenblaadje', c: '#43a047', r: 0.05 }] },
  { name: 'Dessert', items: [{ n: 'bolletje ijs', c: '#fff8e1', r: 0.1 }, { n: 'chocoladeaarde', c: '#3e2723', r: 0.09 }, { n: 'framboos', c: '#e53935', r: 0.05 }, { n: 'framboos', c: '#e53935', r: 0.05 }, { n: 'goudblaadje', c: '#ffd54f', r: 0.04 }] },
];

// De chef laat een bord zien; onthoud waar alles ligt en leg het daarna zo precies mogelijk na
// (tik op het bord waar het volgende onderdeel moet). Geeft { ok, scores } terug (0..1 per gang).
export function startBord(g, { show = 4, need = 0.6 } = {}) {
  const ui = overlay(g, 'Borden opmaken', '<canvas class="mini-canvas"></canvas>',
    g.input.isTouch ? 'Kijk goed hoe de chef het bord opmaakt. Tik daarna op het bord waar elk onderdeel hoort.' : 'Kijk goed hoe de chef het bord opmaakt. Klik daarna op het bord waar elk onderdeel hoort.');
  const cv = ui.ov.querySelector('canvas');
  const ctx = cv.getContext('2d');
  fitCanvas(cv);
  const parts = new Particles();
  // per gang willekeurige posities binnen het bord (relatief: -1..1), niet te dicht op elkaar
  const plan = COURSES.map((co) => {
    const pos = [];
    for (const it of co.items) {
      let p = null;
      for (let k = 0; k < 60 && !p; k++) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 0.62;
        const q = [Math.cos(a) * r, Math.sin(a) * r];
        if (pos.every((o) => Math.hypot(o[0] - q[0], o[1] - q[1]) > 0.28)) p = q;
      }
      pos.push(p || [rnd(-0.5, 0.5), rnd(-0.5, 0.5)]);
    }
    return { ...co, pos };
  });
  let course = 0, phase = 'show', pt = 0, placed = [], end = 0, ok = null;
  const scores = [];
  const layout = () => { const W = cv.width, H = cv.height, u = H / 100; const R = Math.min(W * 0.3, H * 0.34); return { W, H, u, R, cx: W / 2, cy: H * 0.5 }; };
  const place = (rx, ry) => {
    if (phase !== 'place' || ok !== null) return;
    const co = plan[course];
    const k = placed.length;
    placed.push([rx, ry]);
    const d = Math.hypot(rx - co.pos[k][0], ry - co.pos[k][1]);
    const L = layout();
    const xp = ((L.cx + rx * L.R) / L.W) * 100, yp = ((L.cy + ry * L.R) / L.H) * 100;
    popText(ui.ov, d < 0.12 ? 'Precies!' : d < 0.28 ? 'Mooi' : 'Hmm...', xp, yp - 6, d < 0.12 ? 'gold' : d < 0.28 ? 'good' : 'small');
    g.sfx?.play(d < 0.28 ? 'pop' : 'splat');
    if (placed.length >= co.items.length) {
      const sc = co.items.reduce((s, it, i) => s + Math.max(0, 1 - Math.hypot(placed[i][0] - co.pos[i][0], placed[i][1] - co.pos[i][1]) / 0.55), 0) / co.items.length;
      scores.push(sc);
      phase = 'judge'; pt = 0;
      const pct = Math.round(sc * 100);
      popText(ui.ov, pct >= 85 ? `${pct}%: een schilderij!` : pct >= 60 ? `${pct}%: dat kan de zaal in` : `${pct}%: dat stuurt de chef terug`, 50, 26, pct >= 60 ? 'gold big' : 'bad big');
      if (pct >= 60) { flash(ui.ov, 'good'); g.sfx?.play('success'); } else { flash(ui.ov, 'bad'); g.sfx?.play('fail'); }
    }
  };
  cv.addEventListener('pointerdown', (e) => {
    const [mx, my] = canvasPos(cv, e);
    const L = layout();
    const rx = (mx - L.cx) / L.R, ry = (my - L.cy) / L.R;
    if (Math.hypot(rx, ry) <= 1.05) place(rx, ry);
  });
  return runMini(g, (dt, finish) => {
    g.player.lockedFor = true;
    fitCanvas(cv);
    const L = layout(), { W, H, u, R, cx, cy } = L;
    pt += dt;
    if (ok !== null) { end -= dt; if (end <= 0) { finish({ ok, scores }); return; } }
    else if (phase === 'show' && pt > show) { phase = 'place'; pt = 0; placed = []; }
    else if (phase === 'judge' && pt > 1.8) {
      course++;
      if (course >= plan.length) {
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        ok = avg >= need; end = 0.4;
      } else { phase = 'show'; pt = 0; placed = []; }
    }
    parts.update(dt);
    const co = plan[Math.min(course, plan.length - 1)];
    // tekenen: chique tafel
    ctx.fillStyle = '#1d1d1b'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#2a2a27'; ctx.fillRect(0, H * 0.12, W, H * 0.88);
    ctx.fillStyle = '#e3c88f'; ctx.font = `italic 700 ${4 * u}px Georgia, serif`; ctx.textAlign = 'center';
    ctx.fillText(`${co.name}${phase === 'show' ? ': kijk goed!' : phase === 'place' ? ': leg het na' : ''}`, W / 2, H * 0.09);
    // bord
    ctx.fillStyle = '#f7f5f0'; ctx.beginPath(); ctx.arc(cx, cy, R * 1.12, 0, 7); ctx.fill();
    ctx.strokeStyle = '#d9d4c7'; ctx.lineWidth = 0.5 * u; ctx.beginPath(); ctx.arc(cx, cy, R * 0.95, 0, 7); ctx.stroke();
    const draw = (it, p, alpha = 1) => {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = it.c;
      ctx.beginPath(); ctx.ellipse(cx + p[0] * R, cy + p[1] * R, it.r * R, it.r * R * (it.n.includes('quenelle') ? 0.6 : 1), 0.4, 0, 7); ctx.fill();
      if (it.n === 'kruidenblaadje') { ctx.strokeStyle = '#1b5e20'; ctx.lineWidth = 0.3 * u; ctx.beginPath(); ctx.moveTo(cx + p[0] * R - it.r * R, cy + p[1] * R); ctx.lineTo(cx + p[0] * R + it.r * R, cy + p[1] * R); ctx.stroke(); }
      ctx.globalAlpha = 1;
    };
    if (phase === 'show') {
      co.items.forEach((it, i) => draw(it, co.pos[i]));
      ctx.fillStyle = 'rgba(227,200,143,0.9)'; ctx.fillRect(cx - R, cy + R * 1.2, R * 2 * Math.max(0, 1 - pt / show), 0.8 * u);
    } else {
      placed.forEach((p, i) => draw(co.items[i], p));
      if (phase === 'judge') co.items.forEach((it, i) => { ctx.strokeStyle = 'rgba(227,200,143,0.8)'; ctx.lineWidth = 0.3 * u; ctx.setLineDash([u, u]); ctx.beginPath(); ctx.arc(cx + co.pos[i][0] * R, cy + co.pos[i][1] * R, it.r * R * 1.2, 0, 7); ctx.stroke(); ctx.setLineDash([]); });
      // wat komt er nu?
      if (phase === 'place') {
        const nx = co.items[placed.length];
        if (nx) {
          ctx.fillStyle = '#e3c88f'; ctx.font = `700 ${3.2 * u}px Inter, sans-serif`;
          ctx.fillText(`Leg neer: ${nx.n}`, W / 2, H * 0.95);
          ctx.fillStyle = nx.c; ctx.beginPath(); ctx.arc(W / 2 - R * 0.95, H * 0.94, nx.r * R, 0, 7); ctx.fill();
        }
      }
    }
    parts.draw(ctx);
    ui.score(`Gang ${Math.min(course + 1, plan.length)} / ${plan.length}${scores.length ? '  ·  ' + scores.map((s) => Math.round(s * 100) + '%').join(' · ') : ''}`);
  }, () => { ui.close(); g.player.lockedFor = false; }, {
    label: null,
    // voor tests: alles precies op de goede plek leggen
    get phase() { return phase; }, auto: () => { const co = plan[course]; if (phase === 'place' && co) place(...co.pos[placed.length]); },
  });
}

// ------------------------------------------------------------ bier tappen op de Bierfeesten

// Houd ingedrukt om te tappen (spatie, of je vinger op het glas). Laat los als het bier tot de streep staat
// met een kraag van twee vingers schuim. Te vol = over de rand, te weinig = een half glas.
export function startTappen(g, { need = 10, maxFails = 3, limit = 75, mcLines = [] } = {}) {
  const ui = overlay(g, 'Tappen op de Bierfeesten', '<canvas class="mini-canvas tap-canvas"></canvas>',
    g.input.isTouch ? 'Hou je vinger op het glas om te tappen. Laat los als het bier bij de streep is (met twee vingers schuim).' : 'Hou spatie (of de muis) ingedrukt om te tappen. Laat los als het bier bij de streep is (met twee vingers schuim).');
  const cv = ui.ov.querySelector('canvas');
  const ctx = cv.getContext('2d');
  fitCanvas(cv);
  const parts = new Particles();
  const combo = makeCombo(ui.ov);
  let t = 0, served = 0, fails = 0, end = 0, ok = null, pouring = false, beer = 0, foam = 0, wait = 0, mcT = 3, glassN = 0;
  let target = 0.78; // waar de streep zit (bier), schuim komt erbovenop
  const flow = () => 0.42 + Math.min(0.25, served * 0.025); // steeds iets sneller (de dorst wordt groter)
  const newGlass = () => { beer = 0; foam = 0; target = rnd(0.72, 0.8); glassN++; };
  newGlass();
  const release = () => {
    if (!pouring) return;
    pouring = false;
    if (ok !== null || wait > 0 || beer < 0.05) return;
    const W = cv.width;
    const top = beer + foam;
    const xp = 50, yp = 30;
    const dBeer = beer - target;
    if (top > 1) { fails++; combo.miss(); flash(ui.ov, 'bad'); g.sfx?.play('splash'); popText(ui.ov, 'Over de rand! Dat plakt...', xp, yp, 'bad big'); }
    else if (dBeer < -0.08) { fails++; combo.miss(); flash(ui.ov, 'bad'); g.sfx?.play('fail'); popText(ui.ov, 'Een half glas? Boe!', xp, yp, 'bad big'); }
    else if (foam < 0.06) { served++; const c = combo.hit(); popText(ui.ov, c >= 3 ? `Geen schuim, maar goed... x${c}` : 'Plat bier, maar goed', xp, yp, 'good'); g.sfx?.play('clink'); }
    else {
      served++;
      const perfect = Math.abs(dBeer) < 0.03 && foam > 0.08 && foam < 0.14;
      const c = combo.hit();
      popText(ui.ov, perfect ? (c >= 3 ? `PERFECT! x${c}` : 'Perfect getapt!') : (c >= 3 ? `Proost! x${c}` : 'Proost!'), xp, yp, perfect ? 'gold big' : 'good big');
      flash(ui.ov, perfect ? 'gold' : 'good'); g.sfx?.play('clink');
      parts.spawn(W / 2, cv.height * 0.3, 14, { color: '#ffe082', speed: 200, up: 160, size: 5 * devicePixelRatio, life: 0.8, shape: 'circle' });
    }
    wait = 0.6;
  };
  const down = (e) => { if (e.target.closest?.('.mini-stop')) return; pouring = true; };
  ui.ov.addEventListener('pointerdown', down);
  addEventListener('pointerup', release);
  addEventListener('pointercancel', release);
  const kd = (e) => { if (e.code === 'Space' || e.key === 'e' || e.key === 'E') { e.preventDefault(); if (!e.repeat) pouring = true; } };
  const ku = (e) => { if (e.code === 'Space' || e.key === 'e' || e.key === 'E') release(); };
  addEventListener('keydown', kd);
  addEventListener('keyup', ku);
  return runMini(g, (dt, finish) => {
    g.player.lockedFor = true;
    g.input.spacePressed = false; g.input.actionPressed = false;
    fitCanvas(cv);
    const W = cv.width, H = cv.height, u = H / 100;
    if (ok !== null) { end -= dt; if (end <= 0) { finish({ ok, served, fails }); return; } }
    else t += dt;
    if (wait > 0) { wait -= dt; if (wait <= 0 && ok === null) newGlass(); }
    else if (pouring && ok === null) {
      // eerst vooral bier, vlak voor het eind komt het schuim
      const f = flow() * dt;
      // bij de streep zit er dan ongeveer twee vingers schuim op (ca. 0,11)
      beer += f * 0.86; foam += f * (beer > 0.4 ? 0.16 : 0.08);
      foam = Math.min(foam, 0.2);
      if (beer + foam > 1.06) release();
    }
    // het schuim zakt een beetje in als je wacht
    if (!pouring && wait <= 0) foam = Math.max(0, foam - dt * 0.02);
    // de MC van Feestkabinet roept af en toe wat
    mcT -= dt;
    if (mcT <= 0 && mcLines.length && ok === null) { mcT = rnd(4, 7); popText(ui.ov, `MC: "${mcLines[Math.floor(Math.random() * mcLines.length)]}"`, 50, 14, 'small'); }
    parts.update(dt);
    // tekenen: tap en glas onderin het beeld (het feest blijft erboven zichtbaar)
    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createLinearGradient(0, H * 0.3, 0, H);
    bg.addColorStop(0, 'rgba(18,58,36,0)'); bg.addColorStop(0.45, 'rgba(18,58,36,0.75)'); bg.addColorStop(1, 'rgba(18,58,36,0.92)');
    ctx.fillStyle = bg; ctx.fillRect(0, H * 0.3, W, H * 0.7);
    const gw = Math.min(W * 0.1, 18 * u), gh = gw * 1.9, gx = W / 2 - gw / 2, gy = H - gh - 5 * u;
    // tapkraan
    ctx.fillStyle = '#b0bec5'; ctx.fillRect(W / 2 - 2 * u, gy - 14 * u, 4 * u, 10 * u);
    ctx.fillStyle = '#f2c14e'; ctx.fillRect(W / 2 - 6 * u, gy - 22 * u, 12 * u, 9 * u);
    ctx.fillStyle = '#123a24'; ctx.font = `800 ${3 * u}px Inter, sans-serif`; ctx.textAlign = 'center'; ctx.fillText('GULPENER', W / 2, gy - 16 * u);
    if (pouring && wait <= 0 && ok === null) { ctx.fillStyle = '#f9a825'; ctx.fillRect(W / 2 - 0.8 * u, gy - 4 * u, 1.6 * u, gh - beer * gh + 4 * u); }
    // glas
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(gx, gy, gw, gh);
    ctx.fillStyle = '#f9a825'; ctx.fillRect(gx + 2, gy + gh * (1 - beer), gw - 4, gh * beer);
    ctx.fillStyle = '#fffde7'; ctx.fillRect(gx + 2, gy + gh * (1 - beer - foam), gw - 4, gh * foam);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 0.5 * u; ctx.strokeRect(gx, gy, gw, gh);
    // de streep
    ctx.strokeStyle = '#e53935'; ctx.lineWidth = 0.6 * u;
    ctx.beginPath(); ctx.moveTo(gx - 3 * u, gy + gh * (1 - target)); ctx.lineTo(gx + gw + 3 * u, gy + gh * (1 - target)); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = `600 ${2.4 * u}px Inter, sans-serif`; ctx.textAlign = 'left';
    ctx.fillText('bier tot hier', gx + gw + 4 * u, gy + gh * (1 - target) + u);
    if (beer + foam > 1) { ctx.fillStyle = '#fffde7'; ctx.fillRect(gx - 2 * u, gy - 1 * u, gw + 4 * u, 2 * u); }
    parts.draw(ctx);
    ui.score(`🍺 ${served} / ${need}  ·  ${'✗'.repeat(fails)}${'·'.repeat(Math.max(0, maxFails - fails))}  ·  ${Math.max(0, Math.ceil(limit - t))} s`);
    if (ok === null) {
      if (served >= need) { ok = true; end = 1.4; popText(ui.ov, 'Iedereen een biertje!', 50, 22, 'gold big'); g.sfx?.play('cheer'); }
      else if (fails >= maxFails || t >= limit) { ok = false; end = 1.2; popText(ui.ov, fails >= maxFails ? 'De baas pakt de tap af!' : 'De rij is te lang!', 50, 22, 'bad big'); }
    }
  }, () => {
    ui.close(); g.player.lockedFor = false;
    removeEventListener('pointerup', release); removeEventListener('pointercancel', release);
    removeEventListener('keydown', kd); removeEventListener('keyup', ku);
  }, {
    label: null,
    // voor tests: tappen en op het juiste moment loslaten
    hold: () => { pouring = true; }, release, get beer() { return beer; }, get target() { return target; }, get busy() { return wait > 0; },
  });
}

// ------------------------------------------------------------ wildcamera: is het een korenwolf?

const ANIMALS = ['konijn', 'kat', 'egel', 'veldmuis', 'vos', 'haas', 'merel'];

function drawAnimal(ctx, kind, x, y, s, blur) {
  ctx.save(); ctx.translate(x, y);
  if (blur) ctx.filter = `blur(${Math.round(s * 0.05)}px)`;
  const el = (cx, cy, rx, ry, c, rot = 0) => { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(cx * s, cy * s, rx * s, ry * s, rot, 0, 7); ctx.fill(); };
  if (kind === 'korenwolf') {
    // bruine rug, zwarte buik, witte vlekken op wangen en flank
    el(0, 0, 0.42, 0.28, '#8d5a2b');
    el(0, 0.12, 0.34, 0.14, '#111');
    el(0.36, -0.06, 0.18, 0.16, '#8d5a2b');
    el(0.4, 0.02, 0.08, 0.06, '#f5f5f5');
    el(-0.1, -0.02, 0.1, 0.07, '#f5f5f5');
    el(0.34, -0.2, 0.05, 0.05, '#8d5a2b');
    el(0.47, -0.08, 0.02, 0.02, '#000');
  } else if (kind === 'konijn' || kind === 'haas') {
    const c = kind === 'haas' ? '#9c7a4f' : '#9e9e9e';
    el(0, 0, 0.36, 0.26, c); el(0.32, -0.14, 0.15, 0.13, c);
    el(0.3, -0.42, 0.04, kind === 'haas' ? 0.22 : 0.17, c, -0.2); el(0.38, -0.4, 0.04, kind === 'haas' ? 0.22 : 0.17, c, 0.2);
    el(-0.36, -0.06, 0.07, 0.07, '#eee');
  } else if (kind === 'kat') {
    el(0, 0, 0.4, 0.2, '#424242'); el(0.4, -0.14, 0.14, 0.13, '#424242');
    ctx.fillStyle = '#424242'; ctx.beginPath(); ctx.moveTo(0.32 * s, -0.24 * s); ctx.lineTo(0.36 * s, -0.36 * s); ctx.lineTo(0.42 * s, -0.25 * s); ctx.moveTo(0.42 * s, -0.24 * s); ctx.lineTo(0.48 * s, -0.36 * s); ctx.lineTo(0.52 * s, -0.22 * s); ctx.fill();
    ctx.strokeStyle = '#424242'; ctx.lineWidth = 0.06 * s; ctx.beginPath(); ctx.moveTo(-0.38 * s, 0); ctx.quadraticCurveTo(-0.6 * s, -0.1 * s, -0.55 * s, -0.4 * s); ctx.stroke();
    el(0.44, -0.16, 0.025, 0.02, '#c6ff00');
  } else if (kind === 'egel') {
    ctx.fillStyle = '#5d4037';
    ctx.beginPath(); for (let k = 0; k <= 16; k++) { const a = Math.PI + (k / 16) * Math.PI; const r = k % 2 ? 0.3 : 0.4; ctx.lineTo(Math.cos(a) * r * s, Math.sin(a) * r * 0.8 * s); } ctx.fill();
    el(0, 0.02, 0.36, 0.12, '#8d6e63'); el(0.36, 0.02, 0.1, 0.07, '#bcaaa4'); el(0.46, 0.02, 0.02, 0.02, '#000');
  } else if (kind === 'veldmuis') {
    el(0, 0.08, 0.18, 0.11, '#7b6a58'); el(0.16, 0.04, 0.08, 0.07, '#7b6a58'); el(0.14, -0.04, 0.04, 0.04, '#7b6a58');
    ctx.strokeStyle = '#7b6a58'; ctx.lineWidth = 0.02 * s; ctx.beginPath(); ctx.moveTo(-0.17 * s, 0.1 * s); ctx.quadraticCurveTo(-0.35 * s, 0.2 * s, -0.4 * s, 0.05 * s); ctx.stroke();
  } else if (kind === 'vos') {
    el(0, 0, 0.42, 0.18, '#d35400'); el(0.42, -0.1, 0.16, 0.11, '#d35400');
    ctx.fillStyle = '#d35400'; ctx.beginPath(); ctx.moveTo(0.38 * s, -0.18 * s); ctx.lineTo(0.42 * s, -0.34 * s); ctx.lineTo(0.48 * s, -0.18 * s); ctx.fill();
    el(-0.5, 0.02, 0.22, 0.08, '#d35400', -0.3); el(-0.68, 0.06, 0.06, 0.05, '#fff');
    el(0.52, -0.04, 0.06, 0.04, '#fff');
  } else if (kind === 'merel') {
    el(0, 0, 0.2, 0.13, '#111'); el(0.18, -0.1, 0.08, 0.07, '#111');
    ctx.fillStyle = '#ffb300'; ctx.beginPath(); ctx.moveTo(0.25 * s, -0.11 * s); ctx.lineTo(0.34 * s, -0.09 * s); ctx.lineTo(0.25 * s, -0.07 * s); ctx.fill();
    el(-0.22, 0.04, 0.12, 0.04, '#111', 0.3);
  }
  ctx.restore();
}

// Foto's van de wildcamera komen voorbij. Tik op "Korenwolf!" als je er een ziet
// (bruine rug, zwarte buik, witte vlekjes). Ten onrechte roepen telt als fout.
export function startWildcamera(g, { photos = 18, wolves = 2, maxFalse = 3 } = {}) {
  const ui = overlay(g, 'Wildcamera nakijken', '<canvas class="mini-canvas"></canvas><button class="wc-btn" type="button">Korenwolf!</button>',
    g.input.isTouch ? 'Tik op "Korenwolf!" als er een korenwolf op de foto staat: bruine rug, zwarte buik, witte vlekjes.' : 'Druk op spatie of "Korenwolf!" als er een korenwolf op de foto staat: bruine rug, zwarte buik, witte vlekjes.');
  const cv = ui.ov.querySelector('canvas');
  const ctx = cv.getContext('2d');
  fitCanvas(cv);
  // de reeks: dieren, met de korenwolven ergens in de tweede helft (de laatste is wazig)
  const list = Array.from({ length: photos }, () => ({ kind: Math.random() < 0.18 ? 'leeg' : ANIMALS[Math.floor(Math.random() * ANIMALS.length)] }));
  const slots = [];
  while (slots.length < wolves) { const k = 4 + Math.floor(Math.random() * (photos - 5)); if (!slots.some((q) => Math.abs(q - k) < 2)) slots.push(k); }
  slots.sort((a, b) => a - b).forEach((k, i) => { list[k] = { kind: 'korenwolf', blur: i === slots.length - 1 }; });
  list.forEach((p) => { p.x = rnd(0.3, 0.7); p.y = rnd(0.55, 0.72); p.s = rnd(0.7, 1.05); p.flip = Math.random() < 0.5; p.seen = false; p.called = false; });
  let i = 0, pt = 0, caught = 0, wrong = 0, missed = 0, end = 0, ok = null;
  const dur = () => Math.max(1.0, 1.9 - i * 0.05);
  const call = () => {
    if (ok !== null) return;
    const p = list[i];
    if (!p || p.called) return;
    p.called = true;
    if (p.kind === 'korenwolf') { caught++; flash(ui.ov, 'gold'); g.sfx?.play('success'); popText(ui.ov, 'KORENWOLF! Hij zit er nog!', 50, 30, 'gold big'); }
    else { wrong++; flash(ui.ov, 'bad'); shake(cv); g.sfx?.play('fail'); popText(ui.ov, p.kind === 'leeg' ? 'Er staat niks op! Alleen gras.' : `Dat is een ${p.kind}!`, 50, 30, 'bad big'); }
  };
  ui.ov.querySelector('.wc-btn').addEventListener('click', call);
  const kd = (e) => { if (e.code === 'Space' || e.key === 'e' || e.key === 'E') { e.preventDefault(); call(); } };
  addEventListener('keydown', kd);
  return runMini(g, (dt, finish) => {
    g.player.lockedFor = true;
    g.input.spacePressed = false; g.input.actionPressed = false;
    fitCanvas(cv);
    const W = cv.width, H = cv.height, u = H / 100;
    if (ok !== null) { end -= dt; if (end <= 0) { finish({ ok, caught, wrong, missed, wolves }); return; } }
    else {
      pt += dt;
      if (pt > dur()) {
        if (list[i].kind === 'korenwolf' && !list[i].called) { missed++; popText(ui.ov, 'Gemist! Dat was er een!', 50, 30, 'bad big'); g.sfx?.play('fail'); }
        i++; pt = 0;
        if (i >= list.length) { ok = caught >= wolves && wrong < maxFalse; end = 1.6; i = list.length - 1; }
      }
      if (wrong >= maxFalse && ok === null) { ok = false; end = 1.4; }
    }
    // tekenen: nachtfoto met flits (groenig, korrelig) en een tijdstempel
    const p = list[Math.min(i, list.length - 1)];
    const fx = W * 0.1, fy = H * 0.12, fw = W * 0.8, fh = H * 0.66;
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H);
    const grd = ctx.createRadialGradient(W / 2, fy + fh * 0.6, fh * 0.1, W / 2, fy + fh * 0.6, fw * 0.6);
    grd.addColorStop(0, '#7f8f64'); grd.addColorStop(1, '#1e2418');
    ctx.fillStyle = grd; ctx.fillRect(fx, fy, fw, fh);
    // gras en graan
    ctx.strokeStyle = 'rgba(190,200,140,0.45)'; ctx.lineWidth = 0.4 * u;
    for (let k = 0; k < 70; k++) { const gx = fx + ((k * 97) % 100) / 100 * fw, gy = fy + fh; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + ((k * 13) % 7 - 3) * u, gy - (8 + (k * 31) % 18) * u); ctx.stroke(); }
    if (p.kind !== 'leeg') {
      ctx.save();
      if (p.flip) { ctx.translate(W, 0); ctx.scale(-1, 1); }
      drawAnimal(ctx, p.kind, fx + p.x * fw, fy + p.y * fh, fh * 0.32 * p.s, p.blur);
      ctx.restore();
    }
    // korrel
    for (let k = 0; k < 120; k++) { ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.08})`; ctx.fillRect(fx + Math.random() * fw, fy + Math.random() * fh, 2, 2); }
    ctx.fillStyle = '#e0e0e0'; ctx.font = `600 ${2.6 * u}px monospace`; ctx.textAlign = 'left';
    ctx.fillText(`CAM ${1 + (i % 3)}   03:${String(10 + i * 3).padStart(2, '0')}   foto ${i + 1}/${list.length}`, fx + u, fy + fh - 1.5 * u);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(fx, fy + fh + u, fw * Math.min(1, pt / dur()), 0.6 * u);
    ui.score(`🐹 ${caught} / ${wolves}  ·  fout: ${'✗'.repeat(wrong)}${'·'.repeat(Math.max(0, maxFalse - wrong))}`);
  }, () => { ui.close(); removeEventListener('keydown', kd); g.player.lockedFor = false; }, {
    label: null, call, get kind() { return list[i]?.kind; }, get index() { return i; },
  });
}

// ------------------------------------------------------------ forellen scheppen

// Forellen zwemmen in de kweekvijver. Tik ergens: het schepnet duikt daar het water in en pakt de vissen eronder.
// Alleen de grote forellen (met een groen randje als je goed kijkt: lang genoeg) mogen mee; kleintjes terug = fout.
export function startForellen(g, { need = 8, maxSmall = 3, limit = 55 } = {}) {
  const ui = overlay(g, 'Forellen scheppen', '<canvas class="mini-canvas"></canvas>',
    g.input.isTouch ? 'Tik op een grote forel om hem te scheppen. Kleintjes laten zwemmen!' : 'Klik op een grote forel om hem te scheppen. Kleintjes laten zwemmen!');
  const cv = ui.ov.querySelector('canvas');
  const ctx = cv.getContext('2d');
  fitCanvas(cv);
  const parts = new Particles();
  const combo = makeCombo(ui.ov);
  const fish = [];
  const spawnFish = (big) => fish.push({ x: Math.random(), y: rnd(0.2, 0.9), a: Math.random() * 6.28, v: rnd(0.08, 0.16), big, len: big ? rnd(0.11, 0.14) : rnd(0.05, 0.075), turn: 0, gone: 0 });
  for (let k = 0; k < 7; k++) spawnFish(true);
  for (let k = 0; k < 8; k++) spawnFish(false);
  let t = 0, caught = 0, small = 0, end = 0, ok = null, net = null;
  const respawn = [];
  const scoop = (rx, ry) => {
    if (ok !== null || net) return;
    net = { x: rx, y: ry, t: 0 };
    g.sfx?.play('splash');
    const W = cv.width, H = cv.height, R = 0.07;
    const hit = fish.filter((f) => !f.gone && Math.hypot((f.x - rx) * W / H, f.y - ry) < R + f.len * 0.4);
    if (!hit.length) { popText(ui.ov, 'Mis! Alleen water.', rx * 100, ry * 100 - 6, 'small'); combo.miss(); return; }
    for (const f of hit) {
      f.gone = 1;
      parts.spawn(f.x * W, f.y * H, 12, { color: '#b3e5fc', speed: 160, up: 160, size: 4 * devicePixelRatio, life: 0.6, shape: 'circle' });
      if (f.big) { caught++; const c = combo.hit(); popText(ui.ov, c >= 3 ? `Joekel! x${c}` : ['Joekel!', 'Mooie forel!', 'Die is groot genoeg!'][caught % 3], f.x * 100, f.y * 100 - 6, c >= 3 ? 'gold' : 'good'); g.sfx?.play('coin'); }
      else { small++; combo.miss(); flash(ui.ov, 'bad'); popText(ui.ov, 'Te klein! Die moet nog groeien.', f.x * 100, f.y * 100 - 6, 'bad'); g.sfx?.play('fail'); }
      respawn.push({ big: f.big, t: 0.9 }); // er zwemmen er genoeg rond
    }
  };
  cv.addEventListener('pointerdown', (e) => { const [mx, my] = canvasPos(cv, e); scoop(mx / cv.width, my / cv.height); });
  return runMini(g, (dt, finish) => {
    g.player.lockedFor = true;
    fitCanvas(cv);
    const W = cv.width, H = cv.height, u = H / 100;
    if (ok !== null) { end -= dt; if (end <= 0) { finish({ ok, caught, small }); return; } }
    else t += dt;
    for (let k = respawn.length - 1; k >= 0; k--) { respawn[k].t -= dt; if (respawn[k].t <= 0) { spawnFish(respawn[k].big); respawn.splice(k, 1); } }
    for (const f of fish) {
      if (f.gone) { f.gone = Math.max(0, f.gone - dt * 2); continue; }
      f.turn -= dt;
      if (f.turn <= 0) { f.turn = rnd(0.6, 2); f.da = rnd(-1.6, 1.6); }
      f.a += (f.da || 0) * dt;
      f.x += Math.cos(f.a) * f.v * dt * (H / W); f.y += Math.sin(f.a) * f.v * dt;
      if (f.x < 0.05 || f.x > 0.95) { f.a = Math.PI - f.a; f.x = Math.max(0.05, Math.min(0.95, f.x)); }
      if (f.y < 0.18 || f.y > 0.95) { f.a = -f.a; f.y = Math.max(0.18, Math.min(0.95, f.y)); }
    }
    for (let k = fish.length - 1; k >= 0; k--) if (fish[k].gone === 0 && fish[k].wasGone) fish.splice(k, 1); else if (fish[k].gone) fish[k].wasGone = true;
    if (net) { net.t += dt; if (net.t > 0.4) net = null; }
    parts.update(dt);
    // tekenen: stromend water van de vijver
    ctx.fillStyle = '#2e6b7a'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 0.4 * u;
    for (let k = 0; k < 14; k++) { const y = ((k * 7.3 + t * 6) % 100) * u; ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(W * 0.3, y - 2 * u, W * 0.6, y + 2 * u, W, y); ctx.stroke(); }
    ctx.fillStyle = '#5d4b37'; ctx.fillRect(0, 0, W, H * 0.12);
    for (const f of fish) {
      if (f.gone && !f.wasGone) continue;
      const L = f.len * H;
      ctx.save(); ctx.translate(f.x * W, f.y * H); ctx.rotate(f.a);
      ctx.globalAlpha = f.gone ? f.gone : 1;
      ctx.fillStyle = f.big ? '#8d9a7a' : '#a7b39a';
      ctx.beginPath(); ctx.ellipse(0, 0, L / 2, L * 0.16, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-L / 2, 0); ctx.lineTo(-L * 0.72, -L * 0.14); ctx.lineTo(-L * 0.72, L * 0.14); ctx.fill();
      ctx.fillStyle = 'rgba(233,120,140,0.6)'; ctx.fillRect(-L * 0.35, -L * 0.03, L * 0.7, L * 0.06); // de roze streep van de regenboogforel
      ctx.fillStyle = '#222'; for (let k = 0; k < 6; k++) ctx.fillRect(-L * 0.3 + k * L * 0.1, -L * 0.1 + (k % 2) * L * 0.12, 2, 2);
      ctx.restore();
    }
    if (net) { ctx.strokeStyle = '#eceff1'; ctx.lineWidth = 0.6 * u; ctx.beginPath(); ctx.arc(net.x * W, net.y * H, 0.07 * H * (1 + net.t), 0, 7); ctx.stroke(); }
    parts.draw(ctx);
    ctx.fillStyle = '#fff'; ctx.font = `700 ${3 * u}px Inter, sans-serif`; ctx.textAlign = 'center';
    ctx.fillText('Kweekvijver aan de Gulp: alleen de grote forellen!', W / 2, H * 0.08);
    ui.score(`🐟 ${caught} / ${need}  ·  te klein: ${'✗'.repeat(small)}${'·'.repeat(Math.max(0, maxSmall - small))}  ·  ${Math.max(0, Math.ceil(limit - t))} s`);
    if (ok === null) {
      if (caught >= need) { ok = true; end = 1.4; popText(ui.ov, 'De bak zit vol!', 50, 30, 'gold big'); g.sfx?.play('success'); }
      else if (small >= maxSmall || t >= limit) { ok = false; end = 1.2; popText(ui.ov, small >= maxSmall ? 'Te veel kleintjes geschept!' : 'De tijd is op!', 50, 30, 'bad big'); }
    }
  }, () => { ui.close(); g.player.lockedFor = false; }, {
    label: null, scoop,
    // voor tests: waar zwemt nu een grote forel (ver genoeg van kleintjes)?
    bigSpot: () => { const W = cv.width, H = cv.height; const b = fish.find((f) => f.big && !f.gone && fish.every((o) => o.big || o.gone || Math.hypot((o.x - f.x) * W / H, o.y - f.y) > 0.15)); return b ? [b.x, b.y] : null; },
  });
}
