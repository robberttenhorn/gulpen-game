// Minispellen rond de Markt: ijsjes stapelen bij IJssalon Mezzaluna en bonbons sorteren bij Rousseau Chocolade.
// Elk spel geeft een Promise terug met de uitslag, of null als de klus gestopt is.
import { popText, flash, shake, bump, makeCombo, Particles, fitCanvas } from './minifx.js';

function runMini(g, update, cleanup, debug = null) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (r) => { if (done) return; done = true; g.minigame = null; cleanup?.(); resolve(r); };
    g.minigame = { stop: () => finish(null), update: (dt) => update(dt, finish), debug };
  });
}
function overlay(g, title, inner, hint) {
  const ov = document.createElement('div');
  ov.className = 'mini-overlay';
  ov.innerHTML = `<div class="mini-head"><b>${title}</b><span class="mini-score"></span><button class="mini-stop" type="button">Stoppen</button></div>${inner}<div class="mini-hint">${hint}</div>`;
  document.getElementById('hud').prepend(ov);
  document.body.classList.add('pov');
  ov.querySelector('.mini-stop').addEventListener('click', () => g.missions.stop());
  return { ov, close: () => { ov.remove(); document.body.classList.remove('pov'); }, score: (t) => { ov.querySelector('.mini-score').textContent = t; } };
}
const canvasPos = (cv, e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * devicePixelRatio, (e.clientY - r.top) * devicePixelRatio]; };

// ------------------------------------------------------------ ijsjes stapelen

export const FLAVORS = [
  { id: 'vanille', name: 'vanille', c: '#fff3c4' },
  { id: 'aardbei', name: 'aardbei', c: '#f48fb1' },
  { id: 'chocolade', name: 'chocolade', c: '#6d4c41' },
  { id: 'pistache', name: 'pistache', c: '#aed581' },
  { id: 'citroen', name: 'citroen', c: '#fff176' },
  { id: 'stracciatella', name: 'stracciatella', c: '#fafafa', dots: true },
];

// De hoorn schuift heen en weer onder de schep. Tik op een bak: die smaak valt naar beneden.
// Bolletjes moeten in de volgorde van de bestelling, en recht op elkaar, anders valt het bolletje eraf.
// Geeft { ok, served, mistakes } terug.
export function startIjs(g, { need = 5, maxMistakes = 4, limit = 80 } = {}) {
  const ui = overlay(g, 'IJsjes scheppen', '<canvas class="mini-canvas"></canvas>',
    g.input.isTouch ? 'Tik op een bak: dat bolletje valt op de hoorn. Volg de bestelling en stapel recht!' : 'Klik op een bak of toets 1 t/m 6: dat bolletje valt op de hoorn. Volg de bestelling en stapel recht!');
  const cv = ui.ov.querySelector('canvas');
  const ctx = cv.getContext('2d');
  fitCanvas(cv);
  const parts = new Particles();
  const combo = makeCombo(ui.ov);
  const names = ['Mevrouw met hondje', 'Fietser in lycra', 'Opa met pet', 'Meisje met vlechten', 'Toerist met zonnehoed', 'Jongen van de voetbal', 'Moeder met kinderwagen'];
  let t = 0, served = 0, mistakes = 0, end = 0, ok = null;
  let order = null, stack = [], falling = null, coneX = 0, phase = Math.random() * 6, happy = 0;
  const newOrder = () => {
    const n = Math.min(4, 2 + Math.floor(served / 2)); // eerst 2 bolletjes, later tot 4
    const fl = [];
    for (let i = 0; i < n; i++) fl.push(FLAVORS[Math.floor(Math.random() * FLAVORS.length)]);
    order = { who: names[Math.floor(Math.random() * names.length)], fl };
    stack = [];
  };
  newOrder();
  const layout = () => {
    const W = cv.width, H = cv.height, u = H / 100;
    const r = Math.min(W * 0.05, 6.5 * u); // straal bolletje
    const tubW = Math.min(W / 7.2, 15 * u);
    const tubs = FLAVORS.map((f, i) => ({ f, x: W / 2 + (i - 2.5) * tubW * 1.08, y: H * 0.2, w: tubW, h: 9 * u }));
    return { W, H, u, r, tubs, coneY: H * 0.86, dropY: H * 0.3 };
  };
  const mistake = (txt, x, y) => {
    mistakes++; combo.miss(); flash(ui.ov, 'bad'); shake(cv); g.sfx?.play('splat');
    popText(ui.ov, txt, x, y, 'bad big');
  };
  const pick = (i) => {
    if (ok !== null || falling || !order) return;
    const L = layout();
    falling = { f: FLAVORS[i], x: L.W / 2, y: L.dropY, v: 0 };
    g.sfx?.play('pop');
    bump(cv);
  };
  cv.addEventListener('pointerdown', (e) => {
    const [mx, my] = canvasPos(cv, e);
    const L = layout();
    L.tubs.forEach((tb, i) => { if (Math.abs(mx - tb.x) < tb.w / 2 && Math.abs(my - tb.y) < tb.h) pick(i); });
  });
  const onKey = (e) => { const n = parseInt(e.key, 10); if (n >= 1 && n <= 6) pick(n - 1); };
  addEventListener('keydown', onKey);

  return runMini(g, (dt, finish) => {
    g.player.lockedFor = true;
    fitCanvas(cv);
    const L = layout(), { W, H, u, r } = L;
    if (ok !== null) { end -= dt; if (end <= 0) { finish({ ok, served, mistakes }); return; } }
    else t += dt;
    // de hoorn schuift heen en weer, sneller bij een hogere toren en latere klanten
    const sp = 1.1 + served * 0.12 + stack.length * 0.18;
    phase += dt * sp;
    coneX = W / 2 + Math.sin(phase) * W * 0.24;
    happy = Math.max(0, happy - dt);
    // vallend bolletje
    if (falling && ok === null) {
      falling.v += 1400 * u / 100 * dt * 9;
      falling.y += falling.v * dt;
      const topY = L.coneY - r * 0.6 - stack.length * r * 1.45;
      if (falling.y >= topY) {
        const rel = falling.x - coneX;
        const prev = stack.length ? stack[stack.length - 1].rel : 0;
        const want = order.fl[stack.length];
        const xp = (falling.x / W) * 100, yp = (topY / H) * 100;
        if (Math.abs(rel - prev) > r * 0.95) {
          parts.spawn(falling.x, L.coneY + r, 16, { color: falling.f.c, speed: 160, up: 80, size: 6 * devicePixelRatio, life: 0.8, shape: 'circle' });
          mistake('Splat! Ernaast.', xp, yp);
        } else if (want.id !== falling.f.id) {
          parts.spawn(falling.x, topY, 12, { color: falling.f.c, speed: 140, up: 120, size: 5 * devicePixelRatio, life: 0.7, shape: 'circle' });
          mistake(`Dat is geen ${want.name}!`, xp, yp);
        } else {
          stack.push({ f: falling.f, rel });
          const perfect = Math.abs(rel - prev) < r * 0.3;
          popText(ui.ov, perfect ? 'Precies!' : 'Hup!', xp, yp - 6, perfect ? 'gold' : 'good');
          g.sfx?.play('kick');
          if (stack.length === order.fl.length) {
            served++; happy = 1.2;
            const c = combo.hit();
            popText(ui.ov, c >= 3 ? `Hiel lekker! x${c}` : ['Hiel lekker!', 'Dank je wel!', 'Perfect ijsje!'][served % 3], 50, 44, c >= 3 ? 'gold big' : 'good big');
            flash(ui.ov, 'good'); g.sfx?.play('coin');
            parts.spawn(coneX, L.coneY - r * 3, 20, { color: '#ffd54f', speed: 220, up: 220, size: 5 * devicePixelRatio, life: 0.9, shape: 'circle' });
            if (served < need) setTimeout(() => { if (ok === null) newOrder(); }, 700);
          }
        }
        falling = null;
      }
    }
    parts.update(dt);

    // ---- tekenen: toonbank van de ijssalon
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#fde4ee'); grd.addColorStop(1, '#f7c6d9');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
    // vitrine met de bakken
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(0, H * 0.1, W, 20 * u);
    L.tubs.forEach((tb, i) => {
      ctx.fillStyle = '#cfd8dc'; ctx.fillRect(tb.x - tb.w / 2, tb.y - tb.h / 2, tb.w * 0.94, tb.h * 1.1);
      ctx.fillStyle = tb.f.c; ctx.beginPath(); ctx.ellipse(tb.x - tb.w * 0.03, tb.y - tb.h * 0.05, tb.w * 0.42, tb.h * 0.5, 0, 0, 7); ctx.fill();
      if (tb.f.dots) { ctx.fillStyle = '#3e2723'; for (let k = 0; k < 9; k++) ctx.fillRect(tb.x - tb.w * 0.3 + (k * 37 % 10) / 10 * tb.w * 0.55, tb.y - tb.h * 0.3 + (k * 53 % 10) / 10 * tb.h * 0.55, 2 * devicePixelRatio, 2 * devicePixelRatio); }
      ctx.fillStyle = '#7a1f4a'; ctx.font = `700 ${2.3 * u}px Inter, sans-serif`; ctx.textAlign = 'center';
      ctx.fillText(tb.f.name, tb.x - tb.w * 0.03, tb.y + tb.h * 0.95);
      if (!g.input.isTouch) { ctx.fillStyle = 'rgba(122,31,74,0.6)'; ctx.fillText(String(i + 1), tb.x - tb.w * 0.03, tb.y - tb.h * 0.7); }
    });
    // schep boven de hoorn
    ctx.strokeStyle = '#90a4ae'; ctx.lineWidth = 1.2 * u;
    ctx.beginPath(); ctx.moveTo(W / 2, L.dropY - 6 * u); ctx.lineTo(W / 2, L.dropY - 2 * u); ctx.stroke();
    ctx.setLineDash([1 * u, 1.5 * u]); ctx.strokeStyle = 'rgba(122,31,74,0.25)'; ctx.lineWidth = 0.4 * u;
    ctx.beginPath(); ctx.moveTo(W / 2, L.dropY); ctx.lineTo(W / 2, L.coneY); ctx.stroke(); ctx.setLineDash([]);
    // toonbank
    ctx.fillStyle = '#7a1f4a'; ctx.fillRect(0, L.coneY + r * 1.6, W, H);
    // hoorn met toren
    const drawScoop = (x, y, f) => {
      ctx.fillStyle = f.c; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 0.3 * u; ctx.stroke();
      if (f.dots) { ctx.fillStyle = '#3e2723'; for (let k = 0; k < 7; k++) ctx.fillRect(x - r * 0.6 + (k * 37 % 10) / 10 * r * 1.2, y - r * 0.6 + (k * 53 % 10) / 10 * r * 1.2, 2 * devicePixelRatio, 2 * devicePixelRatio); }
    };
    ctx.fillStyle = '#d7a35b';
    ctx.beginPath(); ctx.moveTo(coneX - r * 0.95, L.coneY - r * 0.4); ctx.lineTo(coneX + r * 0.95, L.coneY - r * 0.4); ctx.lineTo(coneX, L.coneY + r * 1.6); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#a8742e'; ctx.lineWidth = 0.3 * u;
    for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(coneX + k * r * 0.35, L.coneY - r * 0.4); ctx.lineTo(coneX + k * r * 0.12, L.coneY + r * 1.2); ctx.stroke(); }
    stack.forEach((s, i) => drawScoop(coneX + s.rel, L.coneY - r * 0.6 - i * r * 1.45, s.f));
    if (falling) drawScoop(falling.x, falling.y, falling.f);
    parts.draw(ctx);
    // bestelbonnetje
    if (order) {
      const bx = W * 0.04, by = H * 0.34, bw = Math.min(W * 0.3, 34 * u);
      ctx.fillStyle = '#fff'; ctx.fillRect(bx, by, bw, (8 + order.fl.length * 5) * u);
      ctx.fillStyle = '#7a1f4a'; ctx.textAlign = 'left'; ctx.font = `800 ${2.8 * u}px Inter, sans-serif`;
      ctx.fillText(happy > 0 ? 'Hiel lekker!' : order.who, bx + 1.5 * u, by + 4 * u);
      order.fl.forEach((f, i) => {
        const y = by + (8.5 + (order.fl.length - 1 - i) * 5) * u; // bovenste bolletje bovenaan
        const done = i < stack.length;
        ctx.fillStyle = f.c; ctx.beginPath(); ctx.arc(bx + 3.5 * u, y - 1 * u, 1.8 * u, 0, 7); ctx.fill();
        ctx.fillStyle = done ? '#43a047' : i === stack.length ? '#7a1f4a' : '#9e9e9e';
        ctx.font = `${i === stack.length ? 800 : 600} ${2.6 * u}px Inter, sans-serif`;
        ctx.fillText(`${done ? '✓ ' : i === stack.length ? '▶ ' : ''}${f.name}`, bx + 6.5 * u, y);
      });
    }
    ui.score(`🍦 ${served} / ${need}  ·  ${'✗'.repeat(mistakes)}${'·'.repeat(Math.max(0, maxMistakes - mistakes))}  ·  ${Math.max(0, Math.ceil(limit - t))} s`);
    if (ok === null) {
      if (served >= need) { ok = true; end = 1.4; popText(ui.ov, 'Iedereen een ijsje!', 50, 30, 'gold big'); g.sfx?.play('success'); }
      else if (mistakes >= maxMistakes || t >= limit) { ok = false; end = 1.2; popText(ui.ov, mistakes >= maxMistakes ? 'Te veel geknoeid!' : 'De rij is te lang geworden!', 50, 30, 'bad big'); }
    }
  }, () => { ui.close(); removeEventListener('keydown', onKey); g.player.lockedFor = false; }, {
    label: null, pick, get order() { return order?.fl.map((f) => f.id); }, get stack() { return stack.length; },
    // voor tests: kies de smaak die nu nodig is, op een moment dat de hoorn onder de schep staat
    aligned: () => !falling && Math.abs(coneX - cv.width / 2) < layout().r * 0.5, need: () => FLAVORS.findIndex((f) => f.id === order?.fl[stack.length]?.id),
  });
}

// ------------------------------------------------------------ bonbons sorteren

const KINDS = [
  { id: 'puur', name: 'Puur', c: '#3e2316', top: '#5d3a26' },
  { id: 'melk', name: 'Melk', c: '#8d5a3b', top: '#a9714c' },
  { id: 'wit', name: 'Wit', c: '#f3e5c8', top: '#fff6e0' },
];

// Bonbons komen over de band. Stuur elke bonbon naar de goede doos (tik op de doos, of toets 1, 2, 3).
// Een gebroken bonbon mag je opeten: tik erop (of spatie). Geeft { ok, sorted, mistakes } terug.
export function startBonbons(g, { need = 20, maxMistakes = 4, limit = 70 } = {}) {
  const ui = overlay(g, 'Bonbons sorteren', '<canvas class="mini-canvas"></canvas>',
    g.input.isTouch ? 'Tik op de doos die past bij de voorste bonbon. Gebroken? Tik op de bonbon en eet hem op!' : 'Toets 1, 2, 3 (of klik op een doos) voor de voorste bonbon. Gebroken? Spatie (of klik erop) en eet hem op!');
  const cv = ui.ov.querySelector('canvas');
  const ctx = cv.getContext('2d');
  fitCanvas(cv);
  const parts = new Particles();
  const combo = makeCombo(ui.ov);
  let t = 0, sorted = 0, eaten = 0, mistakes = 0, end = 0, ok = null, spawn = 0.4;
  const belt = []; // { kind, broken, x (0..1), fly }
  const boxes = [0, 0, 0];
  const layout = () => {
    const W = cv.width, H = cv.height, u = H / 100;
    const r = Math.min(W * 0.045, 6 * u);
    const bw = Math.min(W * 0.26, 30 * u);
    return { W, H, u, r, beltY: H * 0.36, zoneX: W * 0.62, endX: W * 0.92, box: (i) => ({ x: W / 2 + (i - 1) * bw * 1.12, y: H * 0.72, w: bw, h: 17 * u }) };
  };
  const front = () => belt.filter((b) => !b.fly).sort((a, b) => b.x - a.x)[0];
  const send = (i) => {
    if (ok !== null) return;
    const b = front();
    if (!b) return;
    const L = layout();
    const bx = L.W * 0.08 + b.x * (L.endX - L.W * 0.08);
    const xp = (bx / L.W) * 100, yp = (L.beltY / L.H) * 100;
    if (b.broken) { b.fly = { to: i, t: 0, bad: true }; mistakes++; combo.miss(); flash(ui.ov, 'bad'); g.sfx?.play('fail'); popText(ui.ov, 'Gebroken! Die had je moeten opeten.', xp, yp - 8, 'bad'); return; }
    if (KINDS[i].id !== b.kind.id) { b.fly = { to: i, t: 0, bad: true }; mistakes++; combo.miss(); flash(ui.ov, 'bad'); shake(cv); g.sfx?.play('splat'); popText(ui.ov, `Dat is geen ${KINDS[i].name.toLowerCase()}!`, xp, yp - 8, 'bad big'); return; }
    b.fly = { to: i, t: 0 }; sorted++;
    const c = combo.hit();
    popText(ui.ov, c >= 4 ? `x${c}!` : ['Netjes', 'Hup', 'Goed zo'][sorted % 3], xp, yp - 8, c >= 4 ? 'gold' : 'good');
    g.sfx?.play('pop');
  };
  const eat = () => {
    if (ok !== null) return;
    const b = front();
    if (!b) return;
    const L = layout();
    const bx = L.W * 0.08 + b.x * (L.endX - L.W * 0.08);
    const xp = (bx / L.W) * 100, yp = (L.beltY / L.H) * 100;
    if (!b.broken) { b.fly = { to: -1, t: 0 }; mistakes++; combo.miss(); flash(ui.ov, 'bad'); g.sfx?.play('gulp'); popText(ui.ov, 'Die was nog heel! Niet snoepen!', xp, yp - 8, 'bad big'); return; }
    b.fly = { to: -1, t: 0 }; eaten++;
    popText(ui.ov, ['Mmm, proeven mag!', 'Lekker!', 'Kwaliteitscontrole!'][eaten % 3], xp, yp - 8, 'gold');
    g.sfx?.play('gulp');
    parts.spawn(bx, L.beltY, 10, { color: b.kind.c, speed: 120, up: 90, size: 4 * devicePixelRatio, life: 0.6, shape: 'circle' });
  };
  cv.addEventListener('pointerdown', (e) => {
    const [mx, my] = canvasPos(cv, e);
    const L = layout();
    for (let i = 0; i < 3; i++) { const bx = L.box(i); if (Math.abs(mx - bx.x) < bx.w / 2 && Math.abs(my - bx.y) < bx.h) { send(i); return; } }
    if (Math.abs(my - L.beltY) < L.r * 2.5) eat(); // tik op de band: de voorste bonbon proeven
  });
  const onKey = (e) => {
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 3) send(n - 1);
    else if (e.key === 'ArrowLeft') send(0); else if (e.key === 'ArrowDown') send(1); else if (e.key === 'ArrowRight') send(2);
    else if (e.code === 'Space' || e.key === 'e' || e.key === 'E') { e.preventDefault(); eat(); }
  };
  addEventListener('keydown', onKey);

  return runMini(g, (dt, finish) => {
    g.player.lockedFor = true;
    g.input.spacePressed = false; g.input.actionPressed = false; // spatie is hier 'opeten', niet de actieknop
    fitCanvas(cv);
    const L = layout(), { W, H, u, r } = L;
    if (ok !== null) { end -= dt; if (end <= 0) { finish({ ok, sorted, mistakes, eaten }); return; } }
    else t += dt;
    const speed = 0.13 + Math.min(0.17, t * 0.0035); // band gaat steeds iets sneller
    if (ok === null) {
      spawn -= dt;
      if (spawn <= 0) {
        spawn = Math.max(0.75, 1.5 - t * 0.012) * (0.8 + Math.random() * 0.4);
        belt.push({ kind: KINDS[Math.floor(Math.random() * 3)], broken: Math.random() < 0.13, x: 0 });
      }
    }
    for (const b of belt) {
      if (b.fly) { b.fly.t += dt * 3.2; continue; }
      if (ok === null) b.x += speed * dt;
      if (b.x >= 1) {
        b.fly = { to: -2, t: 0 };
        if (!b.broken) { mistakes++; combo.miss(); flash(ui.ov, 'bad'); g.sfx?.play('fail'); popText(ui.ov, 'Van de band gevallen!', 88, 40, 'bad'); }
      }
    }
    for (let i = belt.length - 1; i >= 0; i--) if (belt[i].fly && belt[i].fly.t >= 1) { if (belt[i].fly.to >= 0 && !belt[i].fly.bad) boxes[belt[i].fly.to]++; belt.splice(i, 1); }
    parts.update(dt);

    // ---- tekenen: werkplaats van de chocolatier
    ctx.fillStyle = '#efe0c9'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#3e2316'; ctx.fillRect(0, 0, W, H * 0.12);
    ctx.fillStyle = '#e8c48a'; ctx.font = `800 ${4 * u}px "Baloo 2", sans-serif`; ctx.textAlign = 'center';
    ctx.fillText('Rousseau Chocolade', W / 2, H * 0.085);
    // lopende band
    const x0 = W * 0.08;
    ctx.fillStyle = '#455a64'; ctx.fillRect(x0 - r, L.beltY - r * 1.2, L.endX - x0 + r * 2, r * 2.4);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 0.4 * u;
    const off = (t * speed * (L.endX - x0)) % (4 * u);
    for (let x = x0 - r + off; x < L.endX + r; x += 4 * u) { ctx.beginPath(); ctx.moveTo(x, L.beltY - r * 1.2); ctx.lineTo(x, L.beltY + r * 1.2); ctx.stroke(); }
    const f0 = front();
    for (const b of belt) {
      let bx = x0 + b.x * (L.endX - x0), by = L.beltY, s = 1;
      if (b.fly) {
        const k = Math.min(1, b.fly.t);
        if (b.fly.to >= 0) { const tg = L.box(b.fly.to); bx += (tg.x - bx) * k; by += (tg.y - by) * k - Math.sin(k * Math.PI) * 12 * u; s = 1 - k * 0.4; }
        else if (b.fly.to === -1) { by -= k * 20 * u; s = 1 - k; }
        else { bx += k * 6 * u; by += k * k * 30 * u; }
      }
      ctx.save(); ctx.translate(bx, by); ctx.scale(s, s);
      if (b === f0 && ok === null) { ctx.shadowColor = '#ffd54f'; ctx.shadowBlur = 18; }
      ctx.fillStyle = b.kind.c; ctx.beginPath(); ctx.roundRect(-r, -r * 0.8, r * 2, r * 1.6, r * 0.5); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = b.kind.top; ctx.lineWidth = 0.5 * u;
      ctx.beginPath(); for (let k = -2; k <= 2; k++) { ctx.moveTo(k * r * 0.35 - r * 0.15, -r * 0.4); ctx.lineTo(k * r * 0.35 + r * 0.15, -r * 0.1); } ctx.stroke();
      if (b.broken) { ctx.strokeStyle = '#111'; ctx.lineWidth = 0.6 * u; ctx.beginPath(); ctx.moveTo(-r * 0.2, -r * 0.8); ctx.lineTo(r * 0.1, -r * 0.1); ctx.lineTo(-r * 0.15, r * 0.3); ctx.lineTo(r * 0.2, r * 0.8); ctx.stroke(); }
      ctx.restore();
    }
    // dozen
    for (let i = 0; i < 3; i++) {
      const bx = L.box(i), k = KINDS[i];
      ctx.fillStyle = '#5d3a26'; ctx.fillRect(bx.x - bx.w / 2, bx.y - bx.h / 2, bx.w, bx.h);
      ctx.fillStyle = '#e8c48a'; ctx.fillRect(bx.x - bx.w / 2 + 0.8 * u, bx.y - bx.h / 2 + 0.8 * u, bx.w - 1.6 * u, bx.h - 1.6 * u);
      // gevulde vakjes
      for (let j = 0; j < Math.min(12, boxes[i]); j++) { ctx.fillStyle = k.c; ctx.beginPath(); ctx.arc(bx.x - bx.w * 0.36 + (j % 6) * bx.w * 0.145, bx.y + (Math.floor(j / 6) - 0.2) * 4 * u, 1.6 * u, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#3e2316'; ctx.font = `800 ${3 * u}px Inter, sans-serif`; ctx.textAlign = 'center';
      ctx.fillText(`${g.input.isTouch ? '' : `${i + 1}  `}${k.name}`, bx.x, bx.y - bx.h * 0.18);
    }
    parts.draw(ctx);
    ui.score(`🍫 ${sorted} / ${need}  ·  ${'✗'.repeat(mistakes)}${'·'.repeat(Math.max(0, maxMistakes - mistakes))}  ·  ${Math.max(0, Math.ceil(limit - t))} s`);
    if (ok === null) {
      if (sorted >= need) { ok = true; end = 1.4; popText(ui.ov, 'Alle dozen vol!', 50, 30, 'gold big'); g.sfx?.play('success'); }
      else if (mistakes >= maxMistakes || t >= limit) { ok = false; end = 1.2; popText(ui.ov, mistakes >= maxMistakes ? 'Te veel fouten!' : 'De tijd is op!', 50, 30, 'bad big'); }
    }
  }, () => { ui.close(); removeEventListener('keydown', onKey); g.player.lockedFor = false; }, {
    label: null, send, eat, front: () => { const b = front(); return b ? { kind: KINDS.indexOf(b.kind), broken: b.broken } : null; },
  });
}
