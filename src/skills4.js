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

// ---- tekenhulpjes (alleen voor het uiterlijk)
// Vaste 'willekeur' voor texturen: elke keer hetzelfde beeld, en Math.random (van de spelregels) blijft ongemoeid.
function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// Voorgetekende laag: wordt alleen opnieuw getekend als de sleutel (de canvasmaat) verandert.
// opaque = de laag wordt helemaal volgetekend; de browser kan hem dan sneller op het beeld zetten.
function layer(store, name, key, w, h, draw, opaque = false) {
  let e = store[name];
  if (!e || e.key !== key) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    draw(c.getContext('2d', { alpha: !opaque }), c.width, c.height);
    e = store[name] = { key, c };
  }
  return e.c;
}
// Zachte ronde lichtvlek op een voorwerp (glans), afgeplat en gedraaid.
function gloss(c, x, y, rx, ry, rot, alpha) {
  c.save(); c.translate(x, y); c.rotate(rot); c.scale(1, ry / rx);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, rx); g.addColorStop(0, `rgba(255,255,255,${alpha})`); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, rx, 0, 7); c.fill(); c.restore();
}

// ------------------------------------------------------------ ijsjes stapelen

export const FLAVORS = [
  { id: 'vanille', name: 'vanille', c: '#fff3c4' },
  { id: 'aardbei', name: 'aardbei', c: '#f48fb1' },
  { id: 'chocolade', name: 'chocolade', c: '#6d4c41' },
  { id: 'pistache', name: 'pistache', c: '#aed581' },
  { id: 'citroen', name: 'citroen', c: '#fff176' },
  { id: 'stracciatella', name: 'stracciatella', c: '#fafafa', dots: true },
];

// Lagen voor de ijssalon: de zaak met vitrine, toonbank en hoorn in één voorgetekend beeld, plus een plaatje per bolletje en de schep.
function ijsArt(art, L) {
  const { W, H, u, r } = L, key = W + 'x' + H;
  if (art.all && art.all.key === key) return art.all;
  const coneX = W / 2, coneY = L.coneY, cy0 = coneY + r * 1.6;
  const vx = W * 0.03, vy = H * 0.105, vw = W * 0.94, vh = 21 * u;
  // één bolletje: bol met licht van linksboven, een geribbelde onderrand, structuur van geschept ijs en een glimlichtje
  const S = Math.ceil(r * 2.5);
  const scoops = {};
  FLAVORS.forEach((f, fi) => {
    scoops[f.id] = layer(art, 'bol-' + f.id, key, S, S, (c) => {
      const rnd = seeded(100 + fi);
      c.translate(S / 2, S / 2);
      let g = c.createLinearGradient(0, -r * 0.6, 0, r * 1.15); g.addColorStop(0, shade(f.c, -0.08)); g.addColorStop(1, shade(f.c, -0.36));
      c.fillStyle = g; c.beginPath();
      for (let k = 0; k <= 24; k++) { const a = (k / 24) * Math.PI * 2; const rad = r * (1.04 + (k % 2 ? 0.07 : 0)); const px = Math.cos(a) * rad, py = r * 0.12 + Math.sin(a) * rad * 0.92; k ? c.lineTo(px, py) : c.moveTo(px, py); }
      c.closePath(); c.fill();
      g = c.createRadialGradient(-r * 0.35, -r * 0.45, r * 0.08, 0, 0, r * 1.05);
      g.addColorStop(0, shade(f.c, 0.55)); g.addColorStop(0.45, f.c); g.addColorStop(0.82, shade(f.c, -0.2)); g.addColorStop(1, shade(f.c, -0.4));
      c.fillStyle = g; c.beginPath(); c.arc(0, -r * 0.04, r * 0.97, 0, 7); c.fill();
      c.save(); c.beginPath(); c.arc(0, -r * 0.04, r * 0.97, 0, 7); c.clip();
      // krullen en putjes van het scheppen
      c.lineCap = 'round';
      for (let k = 0; k < 15; k++) {
        const a = rnd() * 6.28, d = Math.sqrt(rnd()) * r * 0.8, x = Math.cos(a) * d, y = Math.sin(a) * d, rad = (0.1 + rnd() * 0.2) * r, a0 = rnd() * 6.28, a1 = a0 + 0.7 + rnd() * 1.1;
        c.lineWidth = Math.max(1, 0.05 * r);
        c.strokeStyle = shade(f.c, -0.3); c.globalAlpha = 0.26; c.beginPath(); c.arc(x, y, rad, a0, a1); c.stroke();
        c.strokeStyle = shade(f.c, 0.55); c.globalAlpha = 0.3; c.beginPath(); c.arc(x + 0.04 * r, y + 0.05 * r, rad, a0, a1); c.stroke();
      }
      c.globalAlpha = 1;
      // wat de smaak herkenbaar maakt
      if (f.dots) { c.fillStyle = '#3a2218'; for (let k = 0; k < 13; k++) { const a = k * 2.4, d = r * (0.18 + ((k * 37) % 10) / 10 * 0.62), w = (0.07 + rnd() * 0.09) * r; c.save(); c.translate(Math.cos(a) * d, Math.sin(a) * d * 0.9); c.rotate(rnd() * 3); c.fillRect(-w, -w * 0.4, w * 2, w * 0.8); c.restore(); } }
      else if (f.id === 'aardbei' || f.id === 'pistache') { c.fillStyle = f.id === 'aardbei' ? 'rgba(200,40,80,0.4)' : 'rgba(80,120,40,0.45)'; for (let k = 0; k < 12; k++) { const a = rnd() * 6.28, d = Math.sqrt(rnd()) * r * 0.8; c.beginPath(); c.arc(Math.cos(a) * d, Math.sin(a) * d, (0.03 + rnd() * 0.03) * r, 0, 7); c.fill(); } }
      // licht dat van onderen terugkaatst
      c.strokeStyle = 'rgba(255,255,255,0.2)'; c.lineWidth = 0.08 * r; c.beginPath(); c.arc(0, -r * 0.04, r * 0.88, Math.PI * 0.12, Math.PI * 0.42); c.stroke();
      c.restore();
      gloss(c, -r * 0.38, -r * 0.48, r * 0.36, r * 0.22, -0.6, f.id === 'chocolade' ? 0.5 : 0.75);
      c.fillStyle = 'rgba(255,255,255,0.75)'; c.beginPath(); c.ellipse(-r * 0.46, -r * 0.55, r * 0.09, r * 0.05, -0.6, 0, 7); c.fill();
    });
  });
  const bg = layer(art, 'salon', key, W, H, (c) => {
    const rnd = seeded(5);
    // achterwand met pastel strepen, verlicht vanuit het midden en donkerder naar de hoeken
    c.fillStyle = '#fcdde8'; c.fillRect(0, 0, W, H); // dekkende ondergrond: op de naden tussen de strepen schijnt anders het vorige beeld door
    for (let k = 0; k * 6 * u < W; k++) { c.fillStyle = k % 2 ? '#fde7ef' : '#fbd5e3'; c.fillRect(k * 6 * u, 0, 6 * u, H); }
    let g = c.createRadialGradient(W * 0.5, H * 0.5, 0, W * 0.5, H * 0.5, W * 0.62);
    g.addColorStop(0, 'rgba(255,252,240,0.5)'); g.addColorStop(0.5, 'rgba(255,252,240,0.12)'); g.addColorStop(1, 'rgba(150,60,105,0.34)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    g = c.createLinearGradient(0, H * 0.6, 0, H); g.addColorStop(0, 'rgba(120,40,85,0)'); g.addColorStop(1, 'rgba(120,40,85,0.22)');
    c.fillStyle = g; c.fillRect(0, H * 0.6, W, H * 0.4);
    // vitrine: schaduw op de muur, lichte binnenkant
    c.save(); c.shadowColor = 'rgba(90,25,60,0.4)'; c.shadowBlur = 3 * u; c.shadowOffsetY = 1.6 * u;
    c.fillStyle = '#e9eef1'; roundRect(c, vx, vy, vw, vh, 2 * u); c.fill(); c.restore();
    c.save(); roundRect(c, vx, vy, vw, vh, 2 * u); c.clip();
    g = c.createLinearGradient(0, vy, 0, vy + vh); g.addColorStop(0, '#dfe8ed'); g.addColorStop(0.3, '#f6f9fa'); g.addColorStop(0.75, '#e9eff2'); g.addColorStop(1, '#c6d1d8');
    c.fillStyle = g; c.fillRect(vx, vy, vw, vh);
    L.tubs.forEach((tb) => {
      const tx = tb.x - tb.w * 0.47, tw = tb.w * 0.94, ty = tb.y - tb.h * 0.25, th = tb.h * 0.85;
      const cx = tb.x - tb.w * 0.03, cy = ty + th * 0.15, lip = ty + th * 0.3;
      // schaduw onder de bak
      c.fillStyle = 'rgba(50,70,85,0.22)'; roundRect(c, tx + 0.4 * u, ty + th - 0.3 * u, tw, 1.1 * u, 0.5 * u); c.fill();
      // roestvrijstalen bak: geborsteld metaal
      let mg = c.createLinearGradient(tx, 0, tx + tw, 0);
      mg.addColorStop(0, '#7f8d96'); mg.addColorStop(0.12, '#c9d2d7'); mg.addColorStop(0.42, '#f5f7f8'); mg.addColorStop(0.75, '#a3afb6'); mg.addColorStop(1, '#6d7b84');
      c.fillStyle = mg; roundRect(c, tx, ty, tw, th, 1 * u); c.fill();
      mg = c.createLinearGradient(0, lip, 0, ty + th); mg.addColorStop(0, 'rgba(0,0,0,0)'); mg.addColorStop(1, 'rgba(20,35,45,0.3)');
      c.fillStyle = mg; roundRect(c, tx, ty, tw, th, 1 * u); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.22)'; c.lineWidth = Math.max(1, 0.1 * u); c.beginPath();
      for (let k = 1; k < 6; k++) { const yy = lip + (ty + th - lip) * (k / 6); c.moveTo(tx + 0.6 * u, yy); c.lineTo(tx + tw - 0.6 * u, yy); }
      c.stroke();
      // bergje ijs in de bak
      c.save(); c.beginPath(); c.rect(tx - 2 * u, ty - tb.h, tw + 4 * u, tb.h + th * 0.3); c.clip();
      const ig = c.createRadialGradient(cx - tw * 0.15, cy - tb.h * 0.35, tw * 0.05, cx, cy, tw * 0.58);
      ig.addColorStop(0, shade(tb.f.c, 0.5)); ig.addColorStop(0.55, tb.f.c); ig.addColorStop(1, shade(tb.f.c, -0.34));
      c.fillStyle = ig;
      c.beginPath(); c.moveTo(tx + tw * 0.04, cy + th * 0.2);
      for (let k = 0; k <= 8; k++) { const a = Math.PI + (k / 8) * Math.PI; c.lineTo(cx + Math.cos(a) * tw * 0.46, cy + Math.sin(a) * tb.h * 0.55 * (k % 2 ? 1 : 0.85)); }
      c.lineTo(tx + tw * 0.96, cy + th * 0.2); c.closePath(); c.fill();
      c.save(); c.clip();
      // geschepte ribbels
      c.lineCap = 'round'; c.lineWidth = Math.max(1, 0.28 * u);
      for (let k = 0; k < 5; k++) {
        const ax = cx + (k - 2) * tw * 0.17, ay = cy + tb.h * 0.25;
        c.strokeStyle = shade(tb.f.c, -0.3); c.globalAlpha = 0.3; c.beginPath(); c.ellipse(ax, ay, tw * 0.16, tb.h * 0.62, 0, Math.PI * 1.1, Math.PI * 1.8); c.stroke();
        c.strokeStyle = shade(tb.f.c, 0.6); c.globalAlpha = 0.45; c.beginPath(); c.ellipse(ax + 0.3 * u, ay + 0.2 * u, tw * 0.16, tb.h * 0.62, 0, Math.PI * 1.1, Math.PI * 1.8); c.stroke();
      }
      c.globalAlpha = 1;
      if (tb.f.dots) { c.fillStyle = '#3a2218'; for (let k = 0; k < 13; k++) { const w = (0.25 + rnd() * 0.3) * u; c.save(); c.translate(cx - tw * 0.34 + rnd() * tw * 0.68, cy - tb.h * 0.38 + rnd() * tb.h * 0.5); c.rotate(rnd() * 3); c.fillRect(-w, -w * 0.4, w * 2, w * 0.8); c.restore(); } }
      const sg2 = c.createLinearGradient(0, lip - 1.4 * u, 0, lip); sg2.addColorStop(0, 'rgba(0,0,0,0)'); sg2.addColorStop(1, 'rgba(30,20,20,0.28)');
      c.fillStyle = sg2; c.fillRect(tx, lip - 1.4 * u, tw, 1.4 * u); // schaduw waar het ijs in de bak zakt
      c.restore();
      gloss(c, cx - tw * 0.16, cy - tb.h * 0.3, tw * 0.2, tb.h * 0.14, -0.3, tb.f.id === 'chocolade' ? 0.45 : 0.7);
      c.restore();
      c.fillStyle = 'rgba(255,255,255,0.85)'; c.fillRect(tx + 0.3 * u, lip - 0.15 * u, tw - 0.6 * u, 0.4 * u); // glimmende rand van de bak
      // kaartje voor de naam
      const kw = Math.min(tb.w * 1.04, tw * 1.12), ky = ty + th + 0.75 * u;
      c.fillStyle = 'rgba(60,40,60,0.18)'; roundRect(c, cx - kw / 2 + 0.2 * u, ky + 0.3 * u, kw, 2.75 * u, 0.6 * u); c.fill();
      c.fillStyle = '#fffdf8'; roundRect(c, cx - kw / 2, ky, kw, 2.75 * u, 0.6 * u); c.fill();
    });
    // glas: schuine weerspiegelingen en een schaduw onder de bovenlijst
    g = c.createLinearGradient(0, vy, 0, vy + 4 * u); g.addColorStop(0, 'rgba(70,95,110,0.3)'); g.addColorStop(1, 'rgba(70,95,110,0)');
    c.fillStyle = g; c.fillRect(vx, vy, vw, 4 * u);
    for (const [a, w, al] of [[0.05, 0.07, 0.4], [0.14, 0.025, 0.3], [0.86, 0.05, 0.28], [0.93, 0.02, 0.22]]) {
      g = c.createLinearGradient(0, vy, 0, vy + vh); g.addColorStop(0, `rgba(255,255,255,${al})`); g.addColorStop(1, 'rgba(255,255,255,0.03)');
      c.fillStyle = g; c.beginPath(); c.moveTo(vx + vw * a + 5 * u, vy); c.lineTo(vx + vw * (a + w) + 5 * u, vy); c.lineTo(vx + vw * (a + w) - 5 * u, vy + vh); c.lineTo(vx + vw * a - 5 * u, vy + vh); c.closePath(); c.fill();
    }
    c.restore();
    // verchroomde lijst om de vitrine
    g = c.createLinearGradient(0, vy, 0, vy + vh); g.addColorStop(0, '#f6f8f9'); g.addColorStop(0.08, '#97a4ac'); g.addColorStop(0.5, '#dfe6ea'); g.addColorStop(0.94, '#8996a0'); g.addColorStop(1, '#5f6c75');
    c.strokeStyle = g; c.lineWidth = 0.8 * u; roundRect(c, vx, vy, vw, vh, 2 * u); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = Math.max(1, 0.14 * u); roundRect(c, vx - 0.25 * u, vy - 0.25 * u, vw + 0.5 * u, vh + 0.5 * u, 2.2 * u); c.stroke();
    // markies: stof met plooien, en de schaduw ervan op de muur
    const awning = () => { c.beginPath(); for (let k = 0; k * 8 * u < W; k++) { c.moveTo(k * 8 * u, -2); c.lineTo((k + 1) * 8 * u, -2); c.lineTo((k + 1) * 8 * u, 5 * u); c.arc((k + 0.5) * 8 * u, 5 * u, 4 * u, 0, Math.PI); c.closePath(); } };
    c.save(); c.shadowColor = 'rgba(80,20,55,0.45)'; c.shadowBlur = 2.2 * u; c.shadowOffsetY = 1.5 * u; c.fillStyle = '#7a1f4a'; awning(); c.fill(); c.restore();
    for (let k = 0; k * 8 * u < W; k++) {
      g = c.createLinearGradient(k * 8 * u, 0, (k + 1) * 8 * u, 0);
      if (k % 2) { g.addColorStop(0, '#dccfd6'); g.addColorStop(0.4, '#ffffff'); g.addColorStop(1, '#cfc0c8'); } else { g.addColorStop(0, '#5a1535'); g.addColorStop(0.4, '#8e2a5a'); g.addColorStop(1, '#4e112d'); }
      c.fillStyle = g;
      c.beginPath(); c.moveTo(k * 8 * u, 0); c.lineTo((k + 1) * 8 * u, 0); c.lineTo((k + 1) * 8 * u, 5 * u); c.arc((k + 0.5) * 8 * u, 5 * u, 4 * u, 0, Math.PI); c.closePath(); c.fill();
    }
    g = c.createLinearGradient(0, 0, 0, 9 * u); g.addColorStop(0, 'rgba(30,5,20,0.4)'); g.addColorStop(0.5, 'rgba(30,5,20,0.05)'); g.addColorStop(1, 'rgba(30,5,20,0)');
    c.save(); awning(); c.clip(); c.fillStyle = g; c.fillRect(0, 0, W, 9 * u); c.restore();
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = Math.max(1, 0.18 * u); c.beginPath();
    for (let k = 0; k * 8 * u < W; k++) { c.moveTo((k + 1) * 8 * u - 0.4 * u, 5 * u); c.arc((k + 0.5) * 8 * u, 5 * u, 3.6 * u, 0, Math.PI); }
    c.stroke();
    // toonbank: lichte stenen rand met een gelakt front eronder
    const lipH = Math.min(1.2 * u, (H - cy0) * 0.4);
    g = c.createLinearGradient(0, cy0 + lipH, 0, H); g.addColorStop(0, '#9c2a5f'); g.addColorStop(0.2, '#7a1f4a'); g.addColorStop(1, '#4f1230');
    c.fillStyle = g; c.fillRect(0, cy0, W, H - cy0);
    g = c.createLinearGradient(0, cy0 + lipH, 0, cy0 + lipH + 1.4 * u); g.addColorStop(0, 'rgba(20,0,10,0.5)'); g.addColorStop(1, 'rgba(20,0,10,0)');
    c.fillStyle = g; c.fillRect(0, cy0 + lipH, W, 1.4 * u);
    g = c.createLinearGradient(0, cy0, 0, cy0 + lipH); g.addColorStop(0, '#fffafc'); g.addColorStop(0.5, '#f1dfe7'); g.addColorStop(1, '#cdaebd');
    c.fillStyle = g; c.fillRect(0, cy0, W, lipH);
    g = c.createLinearGradient(0, 0, W, 0); g.addColorStop(0, 'rgba(60,10,35,0.35)'); g.addColorStop(0.3, 'rgba(255,255,255,0.08)'); g.addColorStop(0.55, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(60,10,35,0.4)');
    c.fillStyle = g; c.fillRect(0, cy0, W, H - cy0);
    // hoorn: wafel met ruitjes, rond door licht links en schaduw rechts
    const cone = () => { c.beginPath(); c.moveTo(coneX - r * 0.95, coneY - r * 0.4); c.lineTo(coneX + r * 0.95, coneY - r * 0.4); c.lineTo(coneX, coneY + r * 1.6); c.closePath(); };
    c.save(); c.shadowColor = 'rgba(90,30,60,0.3)'; c.shadowBlur = 1.5 * u; c.shadowOffsetX = 0.8 * u; c.shadowOffsetY = 0.6 * u; c.fillStyle = '#b8803a'; cone(); c.fill(); c.restore();
    g = c.createLinearGradient(coneX - r, 0, coneX + r, 0);
    g.addColorStop(0, '#a8702c'); g.addColorStop(0.36, '#f0c481'); g.addColorStop(0.7, '#c98d45'); g.addColorStop(1, '#885319');
    c.fillStyle = g; cone(); c.fill();
    c.save(); cone(); c.clip();
    const ruit = (dx, dy) => { c.beginPath(); for (let k = -4; k <= 4; k++) { c.moveTo(coneX + k * r * 0.4 - r + dx, coneY - r * 0.5 + dy); c.lineTo(coneX + k * r * 0.4 + r + dx, coneY + r * 1.6 + dy); c.moveTo(coneX + k * r * 0.4 + r + dx, coneY - r * 0.5 + dy); c.lineTo(coneX + k * r * 0.4 - r + dx, coneY + r * 1.6 + dy); } };
    c.strokeStyle = 'rgba(255,236,190,0.4)'; c.lineWidth = 0.3 * u; ruit(0.22 * u, 0.22 * u); c.stroke();
    c.strokeStyle = 'rgba(110,62,16,0.62)'; c.lineWidth = 0.3 * u; ruit(0, 0); c.stroke();
    g = c.createLinearGradient(0, coneY - r * 0.4, 0, coneY + r * 1.6); g.addColorStop(0, 'rgba(70,35,0,0.28)'); g.addColorStop(0.25, 'rgba(70,35,0,0)'); g.addColorStop(1, 'rgba(70,35,0,0.3)');
    c.fillStyle = g; c.fillRect(coneX - r, coneY - r * 0.5, r * 2, r * 2.2);
    c.restore();
    g = c.createLinearGradient(coneX - r, 0, coneX + r, 0); g.addColorStop(0, '#c18a45'); g.addColorStop(0.36, '#f7d59c'); g.addColorStop(1, '#a5702f');
    c.fillStyle = g; roundRect(c, coneX - r * 1.0, coneY - r * 0.55, r * 2.0, r * 0.3, r * 0.12); c.fill(); // rand van de hoorn
    c.fillStyle = 'rgba(255,255,255,0.35)'; roundRect(c, coneX - r * 0.9, coneY - r * 0.53, r * 1.2, r * 0.08, r * 0.04); c.fill();
    // verchroomd houdertje waar de punt in staat
    g = c.createLinearGradient(coneX - r * 0.6, 0, coneX + r * 0.6, 0);
    g.addColorStop(0, '#6c7982'); g.addColorStop(0.3, '#f6f8f9'); g.addColorStop(0.55, '#a9b4bb'); g.addColorStop(0.8, '#e3e8eb'); g.addColorStop(1, '#58656e');
    c.fillStyle = g; c.beginPath(); c.moveTo(coneX - r * 0.36, cy0 - r * 0.72); c.lineTo(coneX + r * 0.36, cy0 - r * 0.72); c.lineTo(coneX + r * 0.56, cy0 + 0.1 * u); c.lineTo(coneX - r * 0.56, cy0 + 0.1 * u); c.closePath(); c.fill();
    c.fillStyle = 'rgba(40,50,60,0.5)'; c.beginPath(); c.ellipse(coneX, cy0 - r * 0.72, r * 0.36, r * 0.07, 0, 0, 7); c.fill();
    // vignet
    g = c.createRadialGradient(W / 2, H / 2, H * 0.55, W / 2, H / 2, Math.hypot(W, H) * 0.58);
    g.addColorStop(0, 'rgba(60,10,40,0)'); g.addColorStop(1, 'rgba(60,10,40,0.3)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }, true);
  // de schep: verchroomde kom met een steel en een gekleurd handvat; (tx, ty) is het punt waar het bolletje valt
  const thw = Math.ceil(Math.max(r * 0.7, 3.8 * u) + 2 * u), tty = Math.ceil(10 * u);
  const tool = layer(art, 'schep', key, thw * 2, tty + r * 0.7 + 3 * u, (c) => {
    c.translate(thw, tty);
    c.lineCap = 'round';
    c.save(); c.shadowColor = 'rgba(90,30,60,0.35)'; c.shadowBlur = 1.2 * u; c.shadowOffsetX = 0.7 * u; c.shadowOffsetY = 0.8 * u;
    c.strokeStyle = '#607d8b'; c.lineWidth = 1.2 * u; c.beginPath(); c.moveTo(3 * u, -8 * u); c.lineTo(0, -1.5 * u); c.stroke();
    c.fillStyle = '#78909c'; c.beginPath(); c.arc(0, -1 * u, r * 0.7, 0, Math.PI); c.closePath(); c.fill(); c.restore();
    c.strokeStyle = '#55636b'; c.lineWidth = 1.2 * u; c.beginPath(); c.moveTo(3 * u, -8 * u); c.lineTo(0, -1.5 * u); c.stroke();
    c.strokeStyle = '#e9eef0'; c.lineWidth = 0.4 * u; c.beginPath(); c.moveTo(2.8 * u, -8 * u); c.lineTo(-0.2 * u, -1.6 * u); c.stroke();
    c.strokeStyle = '#6a1a40'; c.lineWidth = 2 * u; c.beginPath(); c.moveTo(3 * u, -8 * u); c.lineTo(1.9 * u, -5.6 * u); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = 0.45 * u; c.beginPath(); c.moveTo(2.55 * u, -8 * u); c.lineTo(1.5 * u, -5.7 * u); c.stroke();
    let g = c.createLinearGradient(-r * 0.7, 0, r * 0.7, 0);
    g.addColorStop(0, '#687780'); g.addColorStop(0.35, '#f7f9fa'); g.addColorStop(0.65, '#9eabb2'); g.addColorStop(1, '#56646c');
    c.fillStyle = g; c.beginPath(); c.arc(0, -1 * u, r * 0.7, 0, Math.PI); c.closePath(); c.fill();
    g = c.createLinearGradient(0, -1 * u, 0, -1 * u + r * 0.7); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(20,30,40,0.35)');
    c.fillStyle = g; c.beginPath(); c.arc(0, -1 * u, r * 0.7, 0, Math.PI); c.closePath(); c.fill();
    c.fillStyle = '#4b5860'; c.beginPath(); c.ellipse(0, -1 * u, r * 0.7, r * 0.1, 0, 0, 7); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = Math.max(1, 0.12 * u); c.beginPath(); c.ellipse(0, -1 * u, r * 0.7, r * 0.1, 0, Math.PI, Math.PI * 2); c.stroke();
  });
  return (art.all = { key, bg, scoops, S, tool, thw, tty });
}

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
  const art = {}; // voorgetekende lagen (alleen uiterlijk)
  ui.ov.style.background = '#3a0f26'; // rustige donkere band achter de kop en de uitleg
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

    // ---- tekenen: de ijssalon met vitrine, toonbank en hoorn staat klaar in een voorgetekende laag
    const A = ijsArt(art, L);
    ctx.drawImage(A.bg, 0, 0);
    // namen op de kaartjes (per beeld, zodat het lettertype klopt zodra het geladen is)
    L.tubs.forEach((tb, i) => {
      const tw = tb.w * 0.94, ty = tb.y - tb.h * 0.25, th = tb.h * 0.85;
      const cx = tb.x - tb.w * 0.03;
      ctx.fillStyle = '#7a1f4a'; ctx.font = `700 ${Math.min(2.3 * u, tw / 6)}px Inter, sans-serif`; ctx.textAlign = 'center';
      ctx.fillText(tb.f.name, cx, ty + th + 2.6 * u);
      if (!g.input.isTouch) { ctx.fillStyle = 'rgba(122,31,74,0.7)'; ctx.font = `800 ${2 * u}px Inter, sans-serif`; ctx.fillText(String(i + 1), cx, ty - tb.h * 0.62); }
    });
    // zwierende schep met een stippellijn naar beneden: daar valt het bolletje
    ctx.drawImage(A.tool, holdX - A.thw, L.dropY - A.tty);
    const topX = coneX + (stack.length ? stack[stack.length - 1].rel : 0);
    const lined = Math.abs(holdX - topX) < r * 0.95;
    ctx.lineCap = 'round';
    ctx.setLineDash([1 * u, 1.5 * u]); ctx.strokeStyle = lined ? 'rgba(67,160,71,0.85)' : 'rgba(122,31,74,0.3)'; ctx.lineWidth = (lined ? 0.7 : 0.4) * u;
    ctx.beginPath(); ctx.moveTo(holdX, L.dropY); ctx.lineTo(holdX, L.coneY - r); ctx.stroke(); ctx.setLineDash([]);
    // bolletjes: voorgetekend per smaak, met een schaduw op het bolletje eronder
    const drawScoop = (x, y, f, below) => {
      if (below) { ctx.fillStyle = 'rgba(40,10,25,0.24)'; ctx.beginPath(); ctx.ellipse(x, y + r * 0.85, r * 0.9, r * 0.28, 0, 0, 7); ctx.fill(); }
      ctx.drawImage(A.scoops[f.id], x - A.S / 2, y - A.S / 2);
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
      ctx.fillStyle = 'rgba(70,20,50,0.1)'; roundRect(ctx, bx + 0.3 * u, by + 0.5 * u, bw + 0.9 * u, bh + 1 * u, 1.9 * u); ctx.fill();
      ctx.fillStyle = 'rgba(70,20,50,0.2)'; roundRect(ctx, bx + 0.6 * u, by + 0.8 * u, bw, bh, 1.5 * u); ctx.fill();
      const pg = ctx.createLinearGradient(bx, by, bx + bw * 0.4, by + bh); pg.addColorStop(0, '#ffffff'); pg.addColorStop(1, '#f6ecdf');
      ctx.fillStyle = pg; roundRect(ctx, bx, by, bw, bh, 1.5 * u); ctx.fill();
      ctx.fillStyle = '#7a1f4a'; ctx.fillRect(bx + pad, by + pad + head - fs * 0.25, bw - pad * 2, 0.22 * u);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = happy > 0 ? '#2e7d32' : '#7a1f4a'; ctx.font = `800 ${fs}px Inter, sans-serif`;
      lines.forEach((l, i) => ctx.fillText(l, bx + pad, by + pad + fs * 0.9 + i * fs * 1.2));
      order.fl.forEach((f, i) => {
        const y = by + pad + head + (order.fl.length - 1 - i) * lh + lh * 0.72; // bovenste bolletje bovenaan
        const done = i < stack.length;
        const dd = A.S * (fs * 0.46 / r); // het bolletje zelf, verkleind
        ctx.drawImage(A.scoops[f.id], bx + pad + fs * 0.45 - dd / 2, y - fs * 0.33 - dd / 2, dd, dd);
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

// Lagen voor de chocolaterie: werkblad, uithangbord, lopende band en dozen in één voorgetekend beeld,
// plus een plaatje per bonbon (heel en gebroken), een kleintje voor in de doos en het ribbelpatroon van de band.
function bonArt(art, L) {
  const { W, H, u, r } = L, key = W + 'x' + H;
  if (art.all && art.all.key === key) return art.all;
  const x0 = W * 0.08, len = L.endX - x0 + r * 2, by0 = L.beltY - r * 1.2, bh = r * 2.4;
  // één bonbon: gegoten chocolade met een opstaande rand, glans en gespoten streepjes
  const bw2 = Math.ceil(r * 3.2), bh2 = Math.ceil(r * 2.9), ox = bw2 / 2, oy = r * 1.3;
  const shadow = (c, k) => {
    c.save(); c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = r * 0.3; c.shadowOffsetX = r * 0.1; c.shadowOffsetY = r * 0.22;
    c.fillStyle = shade(k.c, -0.5); roundRect(c, -r, -r * 0.8, r * 2, r * 1.6, r * 0.5); c.fill(); c.restore();
  };
  const whole = (c, k) => {
    c.fillStyle = shade(k.c, k.id === 'wit' ? -0.3 : -0.45); roundRect(c, -r, -r * 0.8, r * 2, r * 1.6, r * 0.5); c.fill(); // zijkant
    let g = c.createLinearGradient(-r, -r * 0.8, r * 0.6, r * 0.7);
    g.addColorStop(0, shade(k.c, 0.24)); g.addColorStop(0.5, k.c); g.addColorStop(1, shade(k.c, -0.2));
    c.fillStyle = g; roundRect(c, -r, -r * 0.8, r * 2, r * 1.43, r * 0.5); c.fill(); // bovenvlak
    g = c.createLinearGradient(-r, -r * 0.8, r, r * 0.6);
    g.addColorStop(0, 'rgba(255,255,255,0.4)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.3)');
    c.strokeStyle = g; c.lineWidth = r * 0.07; roundRect(c, -r * 0.88, -r * 0.68, r * 1.76, r * 1.19, r * 0.4); c.stroke(); // afgeschuinde rand
    c.lineCap = 'round';
    const lines = (dx, dy) => { c.beginPath(); for (let q = -2; q <= 2; q++) { c.moveTo(q * r * 0.35 - r * 0.15 + dx, -r * 0.4 + dy); c.lineTo(q * r * 0.35 + r * 0.15 + dx, -r * 0.1 + dy); } };
    c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = r * 0.12; lines(r * 0.03, r * 0.05); c.stroke();
    c.strokeStyle = k.top; c.lineWidth = r * 0.11; lines(0, 0); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.25)'; c.lineWidth = r * 0.035; lines(-r * 0.02, -r * 0.03); c.stroke();
    gloss(c, -r * 0.4, -r * 0.42, r * 0.62, r * 0.2, -0.2, k.id === 'wit' ? 0.7 : 0.38);
    c.fillStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.ellipse(-r * 0.66, -r * 0.52, r * 0.11, r * 0.045, -0.5, 0, 7); c.fill();
    if (k.nut) { // hazelnoot: daaraan herken je de praliné
      c.fillStyle = 'rgba(30,12,4,0.45)'; c.beginPath(); c.ellipse(r * 0.05, -r * 0.48, r * 0.38, r * 0.28, 0, 0, 7); c.fill();
      g = c.createRadialGradient(-r * 0.12, -r * 0.66, r * 0.02, 0, -r * 0.55, r * 0.38);
      g.addColorStop(0, '#f6d49a'); g.addColorStop(0.45, '#c68e4e'); g.addColorStop(1, '#7c4a1c');
      c.fillStyle = g; c.beginPath(); c.ellipse(0, -r * 0.55, r * 0.35, r * 0.28, 0, 0, 7); c.fill();
      c.strokeStyle = 'rgba(70,35,10,0.8)'; c.lineWidth = Math.max(1, r * 0.035); c.stroke();
      c.strokeStyle = '#7a4a1e'; c.lineWidth = Math.max(1, r * 0.05); c.beginPath(); c.moveTo(0, -r * 0.8); c.quadraticCurveTo(r * 0.06, -r * 0.55, 0, -r * 0.3); c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.65)'; c.beginPath(); c.ellipse(-r * 0.14, -r * 0.66, r * 0.07, r * 0.04, -0.5, 0, 7); c.fill();
    }
  };
  const zig = [[-0.2, -1.5], [-0.2, -0.8], [0.1, -0.1], [-0.15, 0.3], [0.2, 0.8], [0.2, 1.6]]; // de barst, door tot buiten het plaatje
  const bon = {}, mini = {}, ms = Math.ceil(4.6 * u);
  KINDS.forEach((k) => {
    const heel = layer(art, 'bon-' + k.id, key, bw2, bh2, (c) => { c.translate(ox, oy); shadow(c, k); whole(c, k); });
    const los = layer(art, 'los-' + k.id, key, bw2, bh2, (c) => { c.translate(ox, oy); whole(c, k); }); // zonder schaduw, om in tweeën te delen
    const stuk = layer(art, 'stuk-' + k.id, key, bw2, bh2, (c) => {
      // twee helften die een stukje uit elkaar liggen, met een donkere barst ertussen
      c.save(); c.translate(ox, oy); shadow(c, k); c.restore();
      for (const sgn of [-1, 1]) {
        c.save(); c.translate(ox + sgn * r * 0.09, oy + sgn * r * 0.03); c.rotate(sgn * 0.07);
        c.beginPath(); c.moveTo(sgn * r * 2, -r * 1.5); zig.forEach(([zx, zy]) => c.lineTo(zx * r, zy * r)); c.lineTo(sgn * r * 2, r * 1.6); c.closePath(); c.clip();
        c.drawImage(los, -ox, -oy);
        c.strokeStyle = shade(k.c, k.id === 'wit' ? -0.25 : 0.28); c.lineWidth = r * 0.1; c.lineJoin = 'round'; // breukvlak
        c.beginPath(); zig.slice(1, 5).forEach(([zx, zy], q) => (q ? c.lineTo(zx * r, zy * r) : c.moveTo(zx * r, zy * r))); c.stroke();
        c.restore();
      }
      c.translate(ox, oy);
      c.strokeStyle = '#140805'; c.lineWidth = Math.max(0.6 * u, r * 0.1); c.lineJoin = 'miter';
      c.beginPath(); zig.slice(1, 5).forEach(([zx, zy], q) => (q ? c.lineTo(zx * r, zy * r) : c.moveTo(zx * r, zy * r))); c.stroke();
      c.fillStyle = shade(k.c, -0.1); // kruimels
      for (const [qx, qy, qs] of [[-0.34, 0.5, 0.06], [0.42, -0.3, 0.05], [0.36, 0.56, 0.04], [-0.42, -0.62, 0.04]]) { c.beginPath(); c.arc(qx * r, qy * r, qs * r, 0, 7); c.fill(); }
    });
    bon[k.id] = [heel, stuk];
    // klein bonbonnetje voor in de doos
    mini[k.id] = layer(art, 'mini-' + k.id, key, ms, ms, (c) => {
      c.translate(ms / 2, ms / 2);
      c.fillStyle = 'rgba(30,12,4,0.4)'; c.beginPath(); c.arc(0.2 * u, 0.3 * u, 1.55 * u, 0, 7); c.fill();
      const g = c.createRadialGradient(-0.5 * u, -0.6 * u, 0.1 * u, 0, 0, 1.55 * u);
      g.addColorStop(0, shade(k.c, 0.35)); g.addColorStop(0.55, k.c); g.addColorStop(1, shade(k.c, -0.38));
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, 1.5 * u, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); c.ellipse(-0.6 * u, -0.7 * u, 0.4 * u, 0.2 * u, -0.6, 0, 7); c.fill();
      if (k.nut) {
        const n = c.createRadialGradient(-0.2 * u, -1 * u, 0.05 * u, 0, -0.8 * u, 0.65 * u); n.addColorStop(0, '#f6d49a'); n.addColorStop(0.5, '#c68e4e'); n.addColorStop(1, '#7c4a1c');
        c.fillStyle = n; c.beginPath(); c.arc(0, -0.8 * u, 0.6 * u, 0, 7); c.fill();
      }
    });
  });
  const bg = layer(art, 'werkplaats', key, W, H, (c) => {
    const rnd = seeded(71);
    // marmeren werkblad met warm licht van linksboven
    let g = c.createLinearGradient(0, 0, W * 0.7, H);
    g.addColorStop(0, '#f8eedd'); g.addColorStop(0.5, '#ecdcc2'); g.addColorStop(1, '#d6bf9d');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (let i = 0; i < 10; i++) { // aders
      let x = rnd() * W, y = H * 0.12 + rnd() * H * 0.9, a = 0.5 + rnd() * 0.6 + (rnd() < 0.5 ? Math.PI : 0);
      const pts = [[x, y]];
      for (let q = 0; q < 26; q++) { a += (rnd() - 0.5) * 0.55; x += Math.cos(a) * 3.2 * u; y += Math.sin(a) * 3.2 * u; pts.push([x, y]); }
      const path = () => { c.beginPath(); pts.forEach(([px, py], q) => (q ? c.lineTo(px, py) : c.moveTo(px, py))); };
      c.strokeStyle = 'rgba(160,128,94,0.07)'; c.lineWidth = (1 + rnd() * 1.6) * u; path(); c.stroke();
      c.strokeStyle = 'rgba(140,108,76,0.13)'; c.lineWidth = Math.max(1, (0.1 + rnd() * 0.14) * u); path(); c.stroke();
    }
    for (let i = 0; i < 500; i++) { c.fillStyle = i % 2 ? 'rgba(120,90,60,0.07)' : 'rgba(255,255,255,0.14)'; c.beginPath(); c.arc(rnd() * W, rnd() * H, (0.1 + rnd() * 0.22) * u, 0, 7); c.fill(); }
    // uithangbord: donker notenhout met een gouden bies
    g = c.createLinearGradient(0, 0, 0, H * 0.12); g.addColorStop(0, '#2b160c'); g.addColorStop(0.5, '#47281a'); g.addColorStop(1, '#341c10');
    c.fillStyle = g; c.fillRect(0, 0, W, H * 0.12);
    c.save(); c.beginPath(); c.rect(0, 0, W, H * 0.12); c.clip();
    for (let i = 0; i < 46; i++) {
      const yy = rnd() * H * 0.12, ph = rnd() * 6, amp = (0.2 + rnd() * 0.5) * u;
      c.strokeStyle = i % 3 ? 'rgba(0,0,0,0.2)' : 'rgba(230,180,130,0.09)'; c.lineWidth = Math.max(1, (0.1 + rnd() * 0.2) * u); c.beginPath(); c.moveTo(0, yy);
      for (let x = 0; x <= W; x += 4 * u) c.lineTo(x, yy + Math.sin(x / (22 * u) + ph) * amp);
      c.stroke();
    }
    g = c.createLinearGradient(0, 0, W, 0); g.addColorStop(0, 'rgba(255,220,170,0.1)'); g.addColorStop(0.35, 'rgba(255,220,170,0.03)'); g.addColorStop(1, 'rgba(0,0,0,0.3)');
    c.fillStyle = g; c.fillRect(0, 0, W, H * 0.12);
    c.restore();
    g = c.createLinearGradient(0, H * 0.12 - 0.55 * u, 0, H * 0.12); g.addColorStop(0, '#f6dc9c'); g.addColorStop(1, '#a8782f');
    c.fillStyle = g; c.fillRect(0, H * 0.12 - 0.55 * u, W, 0.55 * u);
    g = c.createLinearGradient(0, H * 0.12, 0, H * 0.12 + 4 * u); g.addColorStop(0, 'rgba(50,25,8,0.42)'); g.addColorStop(1, 'rgba(50,25,8,0)');
    c.fillStyle = g; c.fillRect(0, H * 0.12, W, 4 * u);
    // lopende band: stalen frame met rollen; de band zelf wordt per beeld getekend (hij beweegt)
    const fx = x0 - r - 1.6 * u, fw = len + 3.2 * u, fy = by0 - 1.1 * u, fh = bh + 2.2 * u;
    c.save(); c.shadowColor = 'rgba(50,25,8,0.5)'; c.shadowBlur = 3 * u; c.shadowOffsetX = 1 * u; c.shadowOffsetY = 1.8 * u;
    c.fillStyle = '#8d989f'; roundRect(c, fx, fy, fw, fh, 1.1 * u); c.fill(); c.restore();
    g = c.createLinearGradient(0, fy, 0, fy + fh);
    g.addColorStop(0, '#f7f9fa'); g.addColorStop(0.07, '#a7b2b9'); g.addColorStop(0.5, '#59656d'); g.addColorStop(0.93, '#c5cdd2'); g.addColorStop(1, '#69757d');
    c.fillStyle = g; roundRect(c, fx, fy, fw, fh, 1.1 * u); c.fill();
    for (const ex of [fx + 0.2 * u, fx + fw - 1.6 * u]) { // rollen aan de uiteinden
      g = c.createLinearGradient(0, by0, 0, by0 + bh); g.addColorStop(0, '#20272b'); g.addColorStop(0.35, '#98a3aa'); g.addColorStop(0.5, '#c9d1d6'); g.addColorStop(1, '#1b2125');
      c.fillStyle = g; c.fillRect(ex, by0, 1.4 * u, bh);
    }
    for (let x = fx + 3 * u; x < fx + fw - 2 * u; x += 11 * u) for (const yy of [fy + 0.55 * u, fy + fh - 0.55 * u]) { // boutjes
      c.fillStyle = 'rgba(40,50,58,0.7)'; c.beginPath(); c.arc(x, yy, 0.3 * u, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.arc(x - 0.08 * u, yy - 0.08 * u, 0.12 * u, 0, 7); c.fill();
    }
    // dozen: donker karton met een goudkleurige binnenbak, twaalf papieren vormpjes en een etiket
    for (let i = 0; i < KINDS.length; i++) {
      const b = L.box(i), k = KINDS[i], x = b.x - b.w / 2, y = b.y - b.h / 2;
      c.save(); c.shadowColor = 'rgba(50,25,8,0.55)'; c.shadowBlur = 2.6 * u; c.shadowOffsetX = 1 * u; c.shadowOffsetY = 1.6 * u;
      c.fillStyle = '#4a2c1b'; roundRect(c, x, y, b.w, b.h, 0.7 * u); c.fill(); c.restore();
      g = c.createLinearGradient(x, y, x + b.w, y + b.h); g.addColorStop(0, '#80553a'); g.addColorStop(0.4, '#5d3a26'); g.addColorStop(1, '#3a2114');
      c.fillStyle = g; roundRect(c, x, y, b.w, b.h, 0.7 * u); c.fill();
      const ix = x + 0.8 * u, iy = y + 0.8 * u, iw = b.w - 1.6 * u, ih = b.h - 1.6 * u;
      g = c.createLinearGradient(0, iy, 0, iy + ih); g.addColorStop(0, '#e2bd80'); g.addColorStop(0.5, '#e8c48a'); g.addColorStop(1, '#f0d29f');
      c.fillStyle = g; c.fillRect(ix, iy, iw, ih);
      g = c.createLinearGradient(0, iy, 0, iy + 2.2 * u); g.addColorStop(0, 'rgba(70,35,10,0.5)'); g.addColorStop(1, 'rgba(70,35,10,0)');
      c.fillStyle = g; c.fillRect(ix, iy, iw, 2.2 * u); // de wand werpt schaduw in de doos
      g = c.createLinearGradient(ix, 0, ix + 1.8 * u, 0); g.addColorStop(0, 'rgba(70,35,10,0.4)'); g.addColorStop(1, 'rgba(70,35,10,0)');
      c.fillStyle = g; c.fillRect(ix, iy, 1.8 * u, ih);
      c.fillStyle = 'rgba(255,244,214,0.6)'; c.fillRect(ix, iy + ih - 0.2 * u, iw, 0.2 * u); c.fillRect(ix + iw - 0.2 * u, iy, 0.2 * u, ih);
      c.strokeStyle = 'rgba(246,220,156,0.5)'; c.lineWidth = Math.max(1, 0.14 * u); roundRect(c, x + 0.35 * u, y + 0.35 * u, b.w - 0.7 * u, b.h - 0.7 * u, 0.5 * u); c.stroke();
      for (let j = 0; j < 12; j++) { // geplooide vormpjes
        const jx = b.x - b.w * 0.36 + (j % 6) * b.w * 0.145, jy = b.y + (Math.floor(j / 6) - 0.2) * 4 * u;
        c.fillStyle = '#f3d9a8'; c.beginPath(); // licht geplooid randje
        for (let q = 0; q <= 28; q++) { const a = (q / 28) * Math.PI * 2, rad = (q % 2 ? 1.82 : 1.62) * u; q ? c.lineTo(jx + Math.cos(a) * rad, jy + Math.sin(a) * rad) : c.moveTo(jx + Math.cos(a) * rad, jy + Math.sin(a) * rad); }
        c.closePath(); c.fill();
        // leeg vakje: een ondiep kuiltje in de kleur van de bak, zodat elke soort bonbon er duidelijk in afsteekt
        const wg = c.createRadialGradient(jx + 0.4 * u, jy + 0.5 * u, 0.2 * u, jx, jy, 1.45 * u); wg.addColorStop(0, '#d6b176'); wg.addColorStop(0.7, '#c49b5e'); wg.addColorStop(1, '#a98148');
        c.fillStyle = wg; c.beginPath(); c.arc(jx, jy, 1.4 * u, 0, 7); c.fill();
      }
      // etiket met een voorbeeld van de bonbon die erin hoort
      const lx = x + 1.5 * u, ly = b.y - 6.3 * u, lw = b.w - 3 * u, lh = 3.95 * u;
      c.fillStyle = 'rgba(50,25,8,0.35)'; roundRect(c, lx + 0.2 * u, ly + 0.3 * u, lw, lh, 0.6 * u); c.fill();
      g = c.createLinearGradient(0, ly, 0, ly + lh); g.addColorStop(0, '#fffaf0'); g.addColorStop(1, '#f1e2c4');
      c.fillStyle = g; roundRect(c, lx, ly, lw, lh, 0.6 * u); c.fill();
      c.strokeStyle = 'rgba(168,120,47,0.7)'; c.lineWidth = Math.max(1, 0.12 * u); roundRect(c, lx + 0.3 * u, ly + 0.3 * u, lw - 0.6 * u, lh - 0.6 * u, 0.4 * u); c.stroke();
      if (b.w > 21 * u) { const sc = (1.55 * u) / r; c.drawImage(bon[k.id][0], lx + 2.3 * u - ox * sc, ly + lh / 2 + 0.1 * u - oy * sc, bw2 * sc, bh2 * sc); }
    }
    // vignet
    g = c.createRadialGradient(W / 2, H / 2, H * 0.5, W / 2, H / 2, Math.hypot(W, H) * 0.58);
    g.addColorStop(0, 'rgba(40,20,5,0)'); g.addColorStop(1, 'rgba(40,20,5,0.36)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }, true);
  // rubberen band met ribbels; vier u breder dan de band, zodat hij per beeld een stukje kan opschuiven
  const strip = layer(art, 'band', key, len + 4 * u + 2, bh, (c, cw, ch) => {
    let g = c.createLinearGradient(0, 0, 0, ch);
    g.addColorStop(0, '#1d262b'); g.addColorStop(0.16, '#3d4b53'); g.addColorStop(0.5, '#4d5d66'); g.addColorStop(0.86, '#3a4850'); g.addColorStop(1, '#222b31');
    c.fillStyle = g; c.fillRect(0, 0, cw, ch);
    c.lineWidth = 0.4 * u;
    c.strokeStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); for (let x = 0; x <= cw + 4 * u; x += 4 * u) { c.moveTo(x - 0.35 * u, 0); c.lineTo(x - 0.35 * u, ch); } c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.17)'; c.beginPath(); for (let x = 0; x <= cw + 4 * u; x += 4 * u) { c.moveTo(x, 0); c.lineTo(x, ch); } c.stroke();
  }, true);
  // gouden gloed achter de voorste bonbon
  const gw = Math.ceil(r * 4), gh = Math.ceil(r * 3.6);
  const glow = layer(art, 'gloed', key, gw, gh, (c) => {
    c.translate(gw / 2, gh / 2);
    c.shadowColor = '#ffd54f'; c.shadowBlur = r * 0.55; c.fillStyle = '#ffd54f';
    roundRect(c, -r * 1.02, -r * 0.82, r * 2.04, r * 1.64, r * 0.5); c.fill(); c.fill();
  });
  return (art.all = { key, bg, strip, bon, mini, ms, glow, gw, gh, bw2, bh2, ox, oy, x0, len, by0, bh });
}

// Bonbons komen over de band. Stuur elke bonbon naar de goede doos (tik op de doos, of toets 1, 2, 3).
// Een gebroken bonbon mag je opeten: tik erop (of spatie). Geeft { ok, sorted, mistakes } terug.
export function startBonbons(g, { need = 25, maxMistakes = 3, limit = 60 } = {}) {
  const ui = overlay(g, 'Bonbons sorteren', '<canvas class="mini-canvas"></canvas>',
    g.input.isTouch ? 'Tik op de doos die past bij de voorste bonbon. Let op: praliné heeft een hazelnoot. Gebroken? Tik op de bonbon en eet hem op!' : 'Toets 1 t/m 4 (of klik op een doos) voor de voorste bonbon. Let op: praliné heeft een hazelnoot. Gebroken? Spatie (of klik erop) en eet hem op!');
  const cv = ui.ov.querySelector('canvas');
  const ctx = cv.getContext('2d');
  fitCanvas(cv);
  const parts = new Particles();
  const art = {}; // voorgetekende lagen (alleen uiterlijk)
  ui.ov.style.background = '#1f110a'; // rustige donkere band achter de kop en de uitleg
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
    const speed = 0.21 + Math.min(0.29, t * 0.0075); // band gaat steeds sneller
    if (ok === null) {
      spawn -= dt;
      if (spawn <= 0) {
        spawn = Math.max(0.4, 0.95 - t * 0.014) * (0.7 + Math.random() * 0.5);
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

    // ---- tekenen: de werkplaats van de chocolatier staat klaar in een voorgetekende laag
    const A = bonArt(art, L);
    ctx.drawImage(A.bg, 0, 0);
    ctx.font = `800 ${4 * u}px "Baloo 2", sans-serif`; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText('Rousseau Chocolade', W / 2 + 0.2 * u, H * 0.085 + 0.3 * u);
    ctx.fillStyle = '#e8c48a'; ctx.fillText('Rousseau Chocolade', W / 2, H * 0.085);
    // lopende band: de ribbels schuiven mee
    const x0 = W * 0.08;
    const off = (t * speed * (L.endX - x0)) % (4 * u);
    ctx.drawImage(A.strip, 4 * u - off, 0, A.len, A.strip.height, x0 - r, A.by0, A.len, A.bh);
    // inhoud van de dozen en de namen (per beeld, zodat het lettertype klopt zodra het geladen is)
    for (let i = 0; i < KINDS.length; i++) {
      const bx = L.box(i), k = KINDS[i];
      for (let j = 0; j < Math.min(12, boxes[i]); j++) { const jx = bx.x - bx.w * 0.36 + (j % 6) * bx.w * 0.145, jy = bx.y + (Math.floor(j / 6) - 0.2) * 4 * u; ctx.drawImage(A.mini[k.id], jx - A.ms / 2, jy - A.ms / 2); }
      ctx.fillStyle = '#3e2316'; ctx.font = `800 ${2.7 * u}px Inter, sans-serif`; ctx.textAlign = 'center';
      ctx.fillText(`${g.input.isTouch ? '' : `${i + 1}  `}${k.name}`, bx.x, bx.y - bx.h * 0.18);
    }
    const f0 = front();
    for (const b of belt) {
      let bx = x0 + b.x * (L.endX - x0), by = L.beltY, s = 1, fade = 1;
      if (b.fly) {
        const k = Math.min(1, b.fly.t);
        if (b.fly.to >= 0) { const tg = L.box(b.fly.to); bx += (tg.x - bx) * k; by += (tg.y - by) * k - Math.sin(k * Math.PI) * 12 * u; s = 1 - k * 0.4; fade = Math.min(1, (1 - k) / 0.2); }
        else if (b.fly.to === -1) { by -= k * 20 * u; s = 1 - k; }
        else { bx += k * 6 * u; by += k * k * 30 * u; }
      }
      ctx.save(); ctx.translate(bx, by); ctx.scale(s, s); ctx.globalAlpha = fade;
      if (b === f0 && ok === null) ctx.drawImage(A.glow, -A.gw / 2, -A.gh / 2); // de voorste bonbon is aan de beurt
      ctx.drawImage(A.bon[b.kind.id][b.broken ? 1 : 0], -A.ox, -A.oy);
      ctx.restore();
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
