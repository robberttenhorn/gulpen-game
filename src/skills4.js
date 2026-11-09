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


// kleur lichter (amt > 0) of donkerder (amt < 0) maken
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
  const t = amt > 0 ? 255 : 0, k = Math.abs(amt);
  r = Math.round(r + (t - r) * k); gg = Math.round(gg + (t - gg) * k); b = Math.round(b + (t - b) * k);
  return `rgb(${r},${gg},${b})`;
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

// ------------------------------------------------------------ ijsjes stapelen

export const FLAVORS = [
  { id: 'vanille', name: 'vanille', c: '#fff3c4' },
  { id: 'aardbei', name: 'aardbei', c: '#f48fb1' },
  { id: 'chocolade', name: 'chocolade', c: '#6d4c41' },
  { id: 'pistache', name: 'pistache', c: '#aed581' },
  { id: 'citroen', name: 'citroen', c: '#fff176' },
  { id: 'stracciatella', name: 'stracciatella', c: '#fafafa', dots: true },
];

// De schep zwiert heen en weer boven de hoorn. Tik op een bak: die smaak valt recht naar beneden.
// Bolletjes moeten in de volgorde van de bestelling, en recht op elkaar, anders valt het bolletje eraf.
// Geeft { ok, served, mistakes } terug.
export function startIjs(g, { need = 5, maxMistakes = 4, limit = 80 } = {}) {
  const ui = overlay(g, 'IJsjes scheppen', '<canvas class="mini-canvas"></canvas>',
    g.input.isTouch ? 'De schep zwiert heen en weer. Tik op de goede smaak als hij boven het ijsje hangt!' : 'De schep zwiert heen en weer. Klik op de goede smaak (of toets 1 t/m 6) als hij boven het ijsje hangt!');
  const cv = ui.ov.querySelector('canvas');
  const ctx = cv.getContext('2d');
  fitCanvas(cv);
  const parts = new Particles();
  const combo = makeCombo(ui.ov);
  const names = ['Mevrouw met hondje', 'Fietser in lycra', 'Opa met pet', 'Meisje met vlechten', 'Toerist met zonnehoed', 'Jongen van de voetbal', 'Moeder met kinderwagen'];
  let t = 0, served = 0, mistakes = 0, end = 0, ok = null;
  let order = null, stack = [], falling = null, coneX = 0, holdX = 0, phase = Math.random() * 6, happy = 0, nextIn = 0;
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
    if (ok !== null || falling || !order || !FLAVORS[i] || stack.length >= order.fl.length) return; // tussen twee klanten: even wachten
    const L = layout();
    // het bolletje valt recht naar beneden vanaf waar de schep nu hangt
    falling = { f: FLAVORS[i], x: holdX, y: L.dropY, v: (L.coneY - L.dropY) / 0.3 };
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
    // de schep zwiert heen en weer, sneller bij een hogere toren en latere klanten; de hoorn staat stil
    const sp = 1.7 + served * 0.15 + stack.length * 0.2;
    phase += dt * sp;
    coneX = W / 2;
    holdX = W / 2 + Math.sin(phase) * W * 0.2;
    happy = Math.max(0, happy - dt);
    if (nextIn > 0) { nextIn -= dt; if (nextIn <= 0 && ok === null) newOrder(); }
    // vallend bolletje
    if (falling && ok === null) {
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
            if (served < need) nextIn = 0.7; // even later de volgende klant
          }
        }
        falling = null;
      }
    }
    parts.update(dt);

    // ---- tekenen: ijssalon met vitrine, toonbank en hoorn
    // achterwand met pastel strepen
    for (let k = 0; k * 6 * u < W; k++) { ctx.fillStyle = k % 2 ? '#fde7ef' : '#fbd5e3'; ctx.fillRect(k * 6 * u, 0, 6 * u, H); }
    // markiesje bovenaan
    for (let k = 0; k * 8 * u < W; k++) {
      ctx.fillStyle = k % 2 ? '#ffffff' : '#7a1f4a';
      ctx.beginPath(); ctx.moveTo(k * 8 * u, 0); ctx.lineTo((k + 1) * 8 * u, 0); ctx.lineTo((k + 1) * 8 * u, 5 * u); ctx.arc((k + 0.5) * 8 * u, 5 * u, 4 * u, 0, Math.PI); ctx.closePath(); ctx.fill();
    }
    // vitrine met de bakken (glas met lijst)
    const vy = H * 0.105, vh = 21 * u;
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; roundRect(ctx, W * 0.03, vy + 1 * u, W * 0.94, vh, 2 * u); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; roundRect(ctx, W * 0.03, vy, W * 0.94, vh, 2 * u); ctx.fill();
    ctx.strokeStyle = '#b0bec5'; ctx.lineWidth = 0.5 * u; ctx.stroke();
    L.tubs.forEach((tb, i) => {
      const tx = tb.x - tb.w * 0.47, tw = tb.w * 0.94, ty = tb.y - tb.h * 0.25, th = tb.h * 0.85;
      // metalen bak
      const mg = ctx.createLinearGradient(tx, 0, tx + tw, 0);
      mg.addColorStop(0, '#90a4ae'); mg.addColorStop(0.5, '#eceff1'); mg.addColorStop(1, '#90a4ae');
      ctx.fillStyle = mg; roundRect(ctx, tx, ty, tw, th, 1 * u); ctx.fill();
      // bergje ijs in de bak, met licht en schaduw
      const cx = tb.x - tb.w * 0.03, cy = ty + th * 0.15;
      ctx.save(); ctx.beginPath(); ctx.rect(tx - 2 * u, ty - tb.h, tw + 4 * u, tb.h + th * 0.3); ctx.clip();
      const ig = ctx.createRadialGradient(cx - tw * 0.15, cy - tb.h * 0.35, tw * 0.05, cx, cy, tw * 0.55);
      ig.addColorStop(0, shade(tb.f.c, 0.45)); ig.addColorStop(0.6, tb.f.c); ig.addColorStop(1, shade(tb.f.c, -0.3));
      ctx.fillStyle = ig;
      ctx.beginPath(); ctx.moveTo(tx + tw * 0.04, cy + th * 0.2);
      for (let k = 0; k <= 8; k++) { const a = Math.PI + (k / 8) * Math.PI; ctx.lineTo(cx + Math.cos(a) * tw * 0.46, cy + Math.sin(a) * tb.h * 0.55 * (k % 2 ? 1 : 0.85)); }
      ctx.lineTo(tx + tw * 0.96, cy + th * 0.2); ctx.closePath(); ctx.fill();
      ctx.restore();
      if (tb.f.dots) { ctx.fillStyle = '#3e2723'; for (let k = 0; k < 9; k++) ctx.fillRect(cx - tw * 0.3 + (k * 37 % 10) / 10 * tw * 0.6, cy - tb.h * 0.35 + (k * 53 % 10) / 10 * tb.h * 0.4, 1.6 * devicePixelRatio, 1.6 * devicePixelRatio); }
      ctx.fillStyle = '#7a1f4a'; ctx.font = `700 ${Math.min(2.3 * u, tw / 6)}px Inter, sans-serif`; ctx.textAlign = 'center';
      ctx.fillText(tb.f.name, cx, ty + th + 2.6 * u);
      if (!g.input.isTouch) { ctx.fillStyle = 'rgba(122,31,74,0.55)'; ctx.font = `800 ${2 * u}px Inter, sans-serif`; ctx.fillText(String(i + 1), cx, ty - tb.h * 0.62); }
    });
    // zwierende schep met een stippellijn naar beneden: daar valt het bolletje
    const sg = ctx.createLinearGradient(holdX - r, 0, holdX + r, 0);
    sg.addColorStop(0, '#78909c'); sg.addColorStop(0.5, '#eceff1'); sg.addColorStop(1, '#78909c');
    ctx.strokeStyle = '#607d8b'; ctx.lineWidth = 1.2 * u; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(holdX + 3 * u, L.dropY - 8 * u); ctx.lineTo(holdX, L.dropY - 1.5 * u); ctx.stroke();
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(holdX, L.dropY - 1 * u, r * 0.7, 0, Math.PI); ctx.closePath(); ctx.fill();
    const topX = coneX + (stack.length ? stack[stack.length - 1].rel : 0);
    const lined = Math.abs(holdX - topX) < r * 0.95;
    ctx.setLineDash([1 * u, 1.5 * u]); ctx.strokeStyle = lined ? 'rgba(67,160,71,0.85)' : 'rgba(122,31,74,0.3)'; ctx.lineWidth = (lined ? 0.7 : 0.4) * u;
    ctx.beginPath(); ctx.moveTo(holdX, L.dropY); ctx.lineTo(holdX, L.coneY - r); ctx.stroke(); ctx.setLineDash([]);
    // toonbank met een glimrand
    const cy0 = L.coneY + r * 1.6;
    const tg = ctx.createLinearGradient(0, cy0, 0, H);
    tg.addColorStop(0, '#9c2a5f'); tg.addColorStop(0.15, '#7a1f4a'); tg.addColorStop(1, '#5a1636');
    ctx.fillStyle = tg; ctx.fillRect(0, cy0, W, H - cy0);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(0, cy0, W, 0.5 * u);
    // hoorn: wafel met ruitjes en schaduw
    const cg = ctx.createLinearGradient(coneX - r, 0, coneX + r, 0);
    cg.addColorStop(0, '#b8803a'); cg.addColorStop(0.45, '#e9b871'); cg.addColorStop(1, '#a8702c');
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.moveTo(coneX - r * 0.95, L.coneY - r * 0.4); ctx.lineTo(coneX + r * 0.95, L.coneY - r * 0.4); ctx.lineTo(coneX, L.coneY + r * 1.6); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = 'rgba(120,70,20,0.55)'; ctx.lineWidth = 0.3 * u;
    for (let k = -4; k <= 4; k++) {
      ctx.beginPath(); ctx.moveTo(coneX + k * r * 0.4 - r, L.coneY - r * 0.5); ctx.lineTo(coneX + k * r * 0.4 + r, L.coneY + r * 1.6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(coneX + k * r * 0.4 + r, L.coneY - r * 0.5); ctx.lineTo(coneX + k * r * 0.4 - r, L.coneY + r * 1.6); ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = shade('#d7a35b', 0.2); roundRect(ctx, coneX - r * 1.0, L.coneY - r * 0.55, r * 2.0, r * 0.3, r * 0.12); ctx.fill(); // rand van de hoorn
    // bolletjes: bol met licht van linksboven, een geribbelde onderrand en een schaduw op het bolletje eronder
    const drawScoop = (x, y, f, below) => {
      if (below) { ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(x, y + r * 0.85, r * 0.9, r * 0.28, 0, 0, 7); ctx.fill(); }
      // geribbelde rand onderaan (zoals een geschept bolletje)
      ctx.fillStyle = shade(f.c, -0.18);
      ctx.beginPath();
      for (let k = 0; k <= 24; k++) { const a = (k / 24) * Math.PI * 2; const rr = r * (1.04 + (k % 2 ? 0.07 : 0)); const px = x + Math.cos(a) * rr, py = y + r * 0.12 + Math.sin(a) * rr * 0.92; k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.closePath(); ctx.fill();
      // de bol zelf
      const bg = ctx.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.08, x, y, r * 1.05);
      bg.addColorStop(0, shade(f.c, 0.5)); bg.addColorStop(0.5, f.c); bg.addColorStop(1, shade(f.c, -0.32));
      ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(x, y - r * 0.04, r * 0.97, 0, 7); ctx.fill();
      // glimlichtje
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.ellipse(x - r * 0.38, y - r * 0.48, r * 0.22, r * 0.13, -0.6, 0, 7); ctx.fill();
      if (f.dots) { ctx.fillStyle = '#3e2723'; for (let k = 0; k < 9; k++) { const a = k * 2.4, d = r * 0.25 + (k * 37 % 10) / 10 * r * 0.55; ctx.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.9, 1.8 * devicePixelRatio, 1.4 * devicePixelRatio); } }
    };
    stack.forEach((s2, i) => drawScoop(coneX + s2.rel, L.coneY - r * 0.6 - i * r * 1.45, s2.f, i > 0));
    if (falling) drawScoop(falling.x, falling.y, falling.f, false);
    parts.draw(ctx);
    // bestelbonnetje: blijft links van de baan van de schep; een lange naam loopt over twee regels,
    // en de letters worden pas kleiner als het dan nog niet past
    if (order) {
      const title = happy > 0 ? 'Hiel lekker!' : order.who;
      const bx = W * 0.03, by = H * 0.35, pad = 1.8 * u, maxW = W * 0.27 - bx;
      const split = (txt) => { const w = txt.split(' '); if (w.length < 2) return [txt]; let best = [txt], bestD = 1e9; for (let k = 1; k < w.length; k++) { const a1 = w.slice(0, k).join(' '), a2 = w.slice(k).join(' '); const d = Math.abs(a1.length - a2.length); if (d < bestD) { bestD = d; best = [a1, a2]; } } return best; };
      const measure = (size, lines) => {
        ctx.font = `800 ${size}px Inter, sans-serif`; let m = Math.max(...lines.map((l) => ctx.measureText(l).width));
        ctx.font = `700 ${size * 0.92}px Inter, sans-serif`;
        for (const f of order.fl) m = Math.max(m, ctx.measureText('▶ ' + f.name).width + size * 1.4);
        return m;
      };
      let fs = 2.8 * u, lines = [title];
      if (measure(fs, lines) + pad * 2 > maxW) lines = split(title);
      while (fs > 1.5 * u && measure(fs, lines) + pad * 2 > maxW) fs -= 0.1 * u;
      const bw = Math.min(maxW, measure(fs, lines) + pad * 2), lh = fs * 1.7, head = lines.length * fs * 1.2 + fs * 0.5;
      const bh = pad * 2 + head + order.fl.length * lh;
      ctx.fillStyle = 'rgba(0,0,0,0.15)'; roundRect(ctx, bx + 0.6 * u, by + 0.8 * u, bw, bh, 1.5 * u); ctx.fill();
      ctx.fillStyle = '#fffdf8'; roundRect(ctx, bx, by, bw, bh, 1.5 * u); ctx.fill();
      ctx.fillStyle = '#7a1f4a'; ctx.fillRect(bx + pad, by + pad + head - fs * 0.25, bw - pad * 2, 0.22 * u);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = happy > 0 ? '#2e7d32' : '#7a1f4a'; ctx.font = `800 ${fs}px Inter, sans-serif`;
      lines.forEach((l, i) => ctx.fillText(l, bx + pad, by + pad + fs * 0.9 + i * fs * 1.2));
      order.fl.forEach((f, i) => {
        const y = by + pad + head + (order.fl.length - 1 - i) * lh + lh * 0.72; // bovenste bolletje bovenaan
        const done = i < stack.length;
        const dg = ctx.createRadialGradient(bx + pad + fs * 0.35, y - fs * 0.5, 1, bx + pad + fs * 0.5, y - fs * 0.35, fs * 0.55);
        dg.addColorStop(0, shade(f.c, 0.4)); dg.addColorStop(1, shade(f.c, -0.25));
        ctx.fillStyle = dg; ctx.beginPath(); ctx.arc(bx + pad + fs * 0.45, y - fs * 0.33, fs * 0.45, 0, 7); ctx.fill();
        ctx.fillStyle = done ? '#43a047' : i === stack.length ? '#7a1f4a' : '#9e9e9e';
        ctx.font = `${i === stack.length ? 800 : 700} ${fs * 0.92}px Inter, sans-serif`;
        ctx.fillText(`${done ? '✓ ' : i === stack.length ? '▶ ' : ''}${f.name}`, bx + pad + fs * 1.2, y);
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
    aligned: () => !falling && Math.abs(holdX - (coneX + (stack.length ? stack[stack.length - 1].rel : 0))) < layout().r * 0.4, need: () => FLAVORS.findIndex((f) => f.id === order?.fl[stack.length]?.id),
  });
}

// ------------------------------------------------------------ bonbons sorteren

const KINDS = [
  { id: 'puur', name: 'Puur', c: '#3e2316', top: '#5d3a26' },
  { id: 'melk', name: 'Melk', c: '#8d5a3b', top: '#a9714c' },
  { id: 'wit', name: 'Wit', c: '#f3e5c8', top: '#fff6e0' },
  { id: 'praline', name: 'Praliné', c: '#8d5a3b', top: '#a9714c', nut: true }, // lijkt op melk, maar met een hazelnoot erop
];

// Bonbons komen over de band. Stuur elke bonbon naar de goede doos (tik op de doos, of toets 1, 2, 3).
// Een gebroken bonbon mag je opeten: tik erop (of spatie). Geeft { ok, sorted, mistakes } terug.
export function startBonbons(g, { need = 25, maxMistakes = 3, limit = 60 } = {}) {
  const ui = overlay(g, 'Bonbons sorteren', '<canvas class="mini-canvas"></canvas>',
    g.input.isTouch ? 'Tik op de doos die past bij de voorste bonbon. Let op: praliné heeft een hazelnoot. Gebroken? Tik op de bonbon en eet hem op!' : 'Toets 1 t/m 4 (of klik op een doos) voor de voorste bonbon. Let op: praliné heeft een hazelnoot. Gebroken? Spatie (of klik erop) en eet hem op!');
  const cv = ui.ov.querySelector('canvas');
  const ctx = cv.getContext('2d');
  fitCanvas(cv);
  const parts = new Particles();
  const combo = makeCombo(ui.ov);
  let t = 0, sorted = 0, eaten = 0, mistakes = 0, end = 0, ok = null, spawn = 0.4;
  const belt = []; // { kind, broken, x (0..1), fly }
  const boxes = [0, 0, 0, 0];
  const layout = () => {
    const W = cv.width, H = cv.height, u = H / 100;
    const r = Math.min(W * 0.045, 6 * u);
    const bw = Math.min(W * 0.21, 26 * u);
    return { W, H, u, r, beltY: H * 0.36, zoneX: W * 0.62, endX: W * 0.92, box: (i) => ({ x: W / 2 + (i - 1.5) * bw * 1.1, y: H * 0.72, w: bw, h: 17 * u }) };
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
    for (let i = 0; i < KINDS.length; i++) { const bx = L.box(i); if (Math.abs(mx - bx.x) < bx.w / 2 && Math.abs(my - bx.y) < bx.h) { send(i); return; } }
    if (Math.abs(my - L.beltY) < L.r * 2.5) eat(); // tik op de band: de voorste bonbon proeven
  });
  const onKey = (e) => {
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= KINDS.length) send(n - 1);
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
    const speed = 0.17 + Math.min(0.25, t * 0.006); // band gaat steeds sneller
    if (ok === null) {
      spawn -= dt;
      if (spawn <= 0) {
        spawn = Math.max(0.5, 1.15 - t * 0.014) * (0.7 + Math.random() * 0.5);
        belt.push({ kind: KINDS[Math.floor(Math.random() * KINDS.length)], broken: Math.random() < 0.18, x: 0 });
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
      if (b.kind.nut) { ctx.fillStyle = '#c68e4e'; ctx.beginPath(); ctx.ellipse(0, -r * 0.55, r * 0.35, r * 0.28, 0, 0, 7); ctx.fill(); ctx.strokeStyle = '#7a4a1e'; ctx.lineWidth = 0.3 * u; ctx.beginPath(); ctx.moveTo(0, -r * 0.8); ctx.lineTo(0, -r * 0.3); ctx.stroke(); }
      if (b.broken) { ctx.strokeStyle = '#111'; ctx.lineWidth = 0.6 * u; ctx.beginPath(); ctx.moveTo(-r * 0.2, -r * 0.8); ctx.lineTo(r * 0.1, -r * 0.1); ctx.lineTo(-r * 0.15, r * 0.3); ctx.lineTo(r * 0.2, r * 0.8); ctx.stroke(); }
      ctx.restore();
    }
    // dozen
    for (let i = 0; i < KINDS.length; i++) {
      const bx = L.box(i), k = KINDS[i];
      ctx.fillStyle = '#5d3a26'; ctx.fillRect(bx.x - bx.w / 2, bx.y - bx.h / 2, bx.w, bx.h);
      ctx.fillStyle = '#e8c48a'; ctx.fillRect(bx.x - bx.w / 2 + 0.8 * u, bx.y - bx.h / 2 + 0.8 * u, bx.w - 1.6 * u, bx.h - 1.6 * u);
      // gevulde vakjes
      for (let j = 0; j < Math.min(12, boxes[i]); j++) { const jx = bx.x - bx.w * 0.36 + (j % 6) * bx.w * 0.145, jy = bx.y + (Math.floor(j / 6) - 0.2) * 4 * u; ctx.fillStyle = k.c; ctx.beginPath(); ctx.arc(jx, jy, 1.5 * u, 0, 7); ctx.fill(); if (k.nut) { ctx.fillStyle = '#c68e4e'; ctx.beginPath(); ctx.arc(jx, jy - 0.8 * u, 0.6 * u, 0, 7); ctx.fill(); } }
      ctx.fillStyle = '#3e2316'; ctx.font = `800 ${2.7 * u}px Inter, sans-serif`; ctx.textAlign = 'center';
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
