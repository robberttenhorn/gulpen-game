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

// ------------------------------------------------------------ tekenhulpjes (alleen voor het uiterlijk)
// Alles hieronder verandert niets aan de spelregels: het maakt van platte vlakken materialen met licht en schaduw.
// Wat stilstaat wordt één keer op een los tekenvel gezet en daarna elk beeld als plaatje overgenomen.

// Eigen toevalsgenerator voor texturen en decoratie: zo blijft Math.random van het spel zelf onaangeroerd
// en ziet een voorgetekende achtergrond er na het draaien van de telefoon hetzelfde uit.
function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// Los tekenvel (offscreen canvas).
function sheet(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  draw(c.getContext('2d'), c.width, c.height);
  return c;
}
// Iets één keer maken en bewaren tot de sleutel (meestal de canvasmaat) verandert.
function keep(store, key, make) { if (store.key !== key) { store.key = key; store.v = make(); } return store.v; }
// Kleur lichter (f > 0) of donkerder (f < 0) maken.
function tint(hex, f) {
  let h = hex.slice(1);
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16), to = f < 0 ? 0 : 255, k = Math.abs(f);
  const m = (v) => Math.round(v + (to - v) * k);
  return `rgb(${m(n >> 16)},${m((n >> 8) & 255)},${m(n & 255)})`;
}
// Korreltegel: fijne ruis die over een vlak gaat, zodat het een materiaal wordt in plaats van één kleur.
function grainTile(size, seed, strength = 0.5) {
  return sheet(size, size, (c, w, h) => {
    const r = seeded(seed), im = c.createImageData(w, h), d = im.data;
    for (let i = 0; i < d.length; i += 4) { const v = r() < 0.5 ? 0 : 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = r() * r() * 255 * strength; }
    c.putImageData(im, 0, 0);
  });
}
function grainFill(c, tile, x, y, w, h, alpha = 1, mode = 'overlay') {
  c.save(); c.globalCompositeOperation = mode; c.globalAlpha = alpha; c.fillStyle = c.createPattern(tile, 'repeat'); c.fillRect(x, y, w, h); c.restore();
}
// Zachte vlek die naar de rand toe wegloopt (rgb als '255,240,200'): voor lichtplekken en donkere plekken.
function glow(c, x, y, rx, rgb, a, ry = rx, rot = 0) {
  c.save(); c.translate(x, y); c.rotate(rot); c.scale(1, ry / rx);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(0.5, `rgba(${rgb},${a * 0.55})`); g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, rx, 0, 7); c.fill(); c.restore();
}
// Zachte slagschaduw onder een voorwerp.
const softShadow = (c, x, y, rx, ry, a = 0.4, rot = 0) => glow(c, x, y, rx, '0,0,0', a, ry, rot);
// Verloop voor een bol of schijf met licht van linksboven.
function ballGrad(c, x, y, r, light, mid, dark) {
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r);
  g.addColorStop(0, light); g.addColorStop(0.55, mid); g.addColorStop(1, dark);
  return g;
}
// Gesloten veelhoek (punten als [x, y]).
function poly(c, pts, dx = 0, dy = 0) {
  c.beginPath();
  pts.forEach((p, i) => (i ? c.lineTo(p[0] + dx, p[1] + dy) : c.moveTo(p[0] + dx, p[1] + dy)));
  c.closePath();
}
// Gesloten vloeiende vorm door een rij punten (voor plasjes, kluiten en lichtvlekken).
function blobPath(c, pts, dx = 0, dy = 0) {
  const n = pts.length, mid = (a, b) => [(a[0] + b[0]) / 2 + dx, (a[1] + b[1]) / 2 + dy];
  const s0 = mid(pts[n - 1], pts[0]);
  c.beginPath(); c.moveTo(s0[0], s0[1]);
  for (let k = 0; k < n; k++) { const e = mid(pts[k], pts[(k + 1) % n]); c.quadraticCurveTo(pts[k][0] + dx, pts[k][1] + dy, e[0], e[1]); }
  c.closePath();
}
// Warm licht van linksboven en donkere hoeken over een heel tekenvel.
function lightAndVignette(c, W, H, warm = 0.14, dark = 0.45) {
  const l = c.createLinearGradient(0, 0, W, H);
  l.addColorStop(0, `rgba(255,232,180,${warm})`); l.addColorStop(0.5, 'rgba(255,232,180,0)'); l.addColorStop(1, `rgba(0,12,30,${warm * 1.3})`);
  c.fillStyle = l; c.fillRect(0, 0, W, H);
  const R = Math.hypot(W, H) / 2, v = c.createRadialGradient(W / 2, H / 2, R * 0.45, W / 2, H / 2, R);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(0,0,0,${dark})`);
  c.fillStyle = v; c.fillRect(0, 0, W, H);
}

// ------------------------------------------------------------ Romeinse opgraving

const FINDS = [
  { id: 'munt', name: 'Romeinse munt', c: '#c9a227' },
  { id: 'munt', name: 'nog een munt', c: '#b08d57' },
  { id: 'scherf', name: 'potscherf', c: '#b5522f' },
  { id: 'fibula', name: 'mantelspeld (fibula)', c: '#7e8c6a' },
  { id: 'dakpan', name: 'stuk dakpan', c: '#a0442a' },
  { id: 'kraal', name: 'glazen kraal', c: '#3fa7a0' },
];

// Eén vondst in een vakje van s bij s (zelfde plek en maat als de oude platte vorm), met volume, slagschaduw en wat aarde erop.
function drawFind(c, f, s, seed) {
  const x = s / 2, y = s / 2, r = seeded(40 + seed * 13);
  glow(c, x, y, s * 0.44, '226,190,140', 0.42); // schoongeveegde plek rond de vondst
  const dirt = (n, reach) => { for (let k = 0; k < n; k++) { c.fillStyle = `rgba(${90 + r() * 40},${62 + r() * 26},${36 + r() * 18},${0.35 + r() * 0.4})`; c.beginPath(); c.arc(x + (r() - 0.5) * reach * 2, y + (r() - 0.5) * reach * 1.4, s * (0.006 + r() * 0.014), 0, 7); c.fill(); } };
  if (f.id === 'munt') {
    const R = s * 0.22;
    softShadow(c, x + R * 0.25, y + R * 0.34, R * 1.3, R * 1.2, 0.6);
    c.fillStyle = tint(f.c, -0.55); c.beginPath(); c.arc(x + R * 0.05, y + R * 0.08, R, 0, 7); c.fill(); // de dikte van de munt
    c.fillStyle = ballGrad(c, x, y, R, tint(f.c, 0.65), f.c, tint(f.c, -0.42)); c.beginPath(); c.arc(x, y, R, 0, 7); c.fill();
    c.save(); c.beginPath(); c.arc(x, y, R * 0.8, 0, 7); c.clip();
    // keizerskop in reliëf: schaduwkant, lichtkant en dan de kop zelf
    const kop = (dx, dy, col) => {
      c.fillStyle = col;
      c.beginPath(); c.arc(x + dx + R * 0.04, y + dy - R * 0.16, R * 0.3, 0, 7); c.fill();
      c.beginPath(); c.moveTo(x + dx - R * 0.42, y + dy + R * 0.8); c.quadraticCurveTo(x + dx - R * 0.34, y + dy + R * 0.16, x + dx - R * 0.02, y + dy + R * 0.14); c.quadraticCurveTo(x + dx + R * 0.36, y + dy + R * 0.2, x + dx + R * 0.46, y + dy + R * 0.8); c.closePath(); c.fill();
    };
    kop(R * 0.05, R * 0.06, tint(f.c, -0.5)); kop(-R * 0.04, -R * 0.05, tint(f.c, 0.5)); kop(0, 0, tint(f.c, -0.12));
    c.restore();
    c.strokeStyle = tint(f.c, -0.4); c.lineWidth = R * 0.08; c.beginPath(); c.arc(x, y, R * 0.84, 0, 7); c.stroke(); // opstaande rand
    c.strokeStyle = tint(f.c, 0.6); c.lineWidth = R * 0.05; c.beginPath(); c.arc(x, y, R * 0.93, Math.PI * 0.95, Math.PI * 1.6); c.stroke();
    // groen uitgeslagen plekjes
    for (let k = 0; k < 7; k++) { const a = r() * 6.28, d = R * (0.3 + r() * 0.6); c.fillStyle = `rgba(96,150,120,${0.25 + r() * 0.3})`; c.beginPath(); c.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, R * (0.04 + r() * 0.07), 0, 7); c.fill(); }
    dirt(8, R);
  } else if (f.id === 'kraal') {
    const R = s * 0.15;
    glow(c, x + R * 0.55, y + R * 0.7, R * 1.5, '90,225,210', 0.4); // gekleurd licht dat door het glas op de grond valt
    softShadow(c, x + R * 0.2, y + R * 0.3, R * 1.15, R * 1.05, 0.5);
    const g = c.createRadialGradient(x + R * 0.3, y + R * 0.35, R * 0.05, x, y, R);
    g.addColorStop(0, '#b6f5ec'); g.addColorStop(0.45, f.c); g.addColorStop(1, tint(f.c, -0.6));
    c.fillStyle = g; c.beginPath(); c.arc(x, y, R, 0, 7); c.fill();
    c.fillStyle = 'rgba(8,48,50,0.85)'; c.beginPath(); c.ellipse(x, y, R * 0.2, R * 0.16, 0, 0, 7); c.fill(); // het gaatje
    c.strokeStyle = 'rgba(200,255,246,0.7)'; c.lineWidth = R * 0.07; c.beginPath(); c.arc(x, y, R * 0.28, Math.PI * 0.15, Math.PI * 0.95); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.92)'; c.beginPath(); c.ellipse(x - R * 0.42, y - R * 0.46, R * 0.22, R * 0.11, -0.75, 0, 7); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.4)'; c.beginPath(); c.arc(x + R * 0.5, y + R * 0.52, R * 0.09, 0, 7); c.fill();
    dirt(4, R);
  } else {
    c.save(); c.translate(x, y); c.rotate(0.5);
    const P = (pts) => pts.map(([px, py]) => [px * s, py * s]);
    if (f.id === 'fibula') {
      // mantelspeld: naald, gebogen beugel, veerrol links en naaldhouder rechts
      const shape = (dx, dy, col, w) => {
        c.strokeStyle = col; c.fillStyle = col; c.lineCap = 'round'; c.lineJoin = 'round';
        c.lineWidth = w * 0.55; c.beginPath(); c.moveTo(-0.27 * s + dx, 0.075 * s + dy); c.lineTo(0.3 * s + dx, 0.085 * s + dy); c.stroke(); // naald
        c.lineWidth = w; c.beginPath(); c.moveTo(-0.25 * s + dx, 0.05 * s + dy); c.bezierCurveTo(-0.24 * s + dx, -0.2 * s + dy, 0.02 * s + dx, -0.17 * s + dy, 0.25 * s + dx, 0.06 * s + dy); c.stroke(); // beugel
        c.lineWidth = w * 0.5; for (let k = 0; k < 3; k++) { c.beginPath(); c.arc((-0.27 + k * 0.022) * s + dx, 0.06 * s + dy, 0.03 * s, 0, 7); c.stroke(); } // veerrol
        poly(c, P([[0.2, 0.03], [0.29, 0.06], [0.27, 0.11], [0.21, 0.1]]), dx, dy); c.fill(); // naaldhouder
      };
      shape(0.02 * s, 0.035 * s, 'rgba(0,0,0,0.55)', 0.066 * s);
      shape(0, 0, tint(f.c, -0.6), 0.076 * s);
      shape(0, 0, tint(f.c, 0.12), 0.054 * s);
      shape(-0.007 * s, -0.01 * s, tint(f.c, 0.6), 0.016 * s);
      for (let k = 0; k < 8; k++) { const q = r(); c.fillStyle = `rgba(160,205,175,${0.4 + r() * 0.3})`; c.beginPath(); c.arc((-0.2 + q * 0.42) * s, (0.02 - Math.sin(q * 3.14) * 0.15 + (r() - 0.5) * 0.02) * s, s * (0.006 + r() * 0.008), 0, 7); c.fill(); }
    } else {
      const scherf = f.id === 'scherf';
      const pts = P(scherf ? [[-0.3, -0.02], [-0.2, -0.14], [0.02, -0.16], [0.26, -0.1], [0.3, 0.04], [0.12, 0.15], [-0.1, 0.13], [-0.24, 0.1]] : [[-0.28, -0.13], [0.2, -0.15], [0.29, -0.02], [0.22, 0.14], [-0.05, 0.15], [-0.22, 0.1], [-0.3, 0]]);
      c.fillStyle = 'rgba(0,0,0,0.5)'; poly(c, pts, 0.035 * s, 0.03 * s); c.fill();
      c.fillStyle = tint(f.c, scherf ? 0.38 : -0.35); poly(c, pts, 0.016 * s, 0.014 * s); c.fill(); // de breukrand
      const g = c.createLinearGradient(-0.2 * s, -0.2 * s, 0.2 * s, 0.2 * s);
      g.addColorStop(0, tint(f.c, 0.34)); g.addColorStop(0.5, f.c); g.addColorStop(1, tint(f.c, -0.34));
      c.fillStyle = g; poly(c, pts); c.fill();
      c.save(); poly(c, pts); c.clip();
      if (scherf) {
        // ingekraste banden van de pot
        for (const o of [-0.05, 0.03]) {
          c.strokeStyle = tint(f.c, -0.45); c.lineWidth = 0.014 * s; c.beginPath(); c.moveTo(-0.34 * s, (o + 0.05) * s); c.quadraticCurveTo(0, (o - 0.07) * s, 0.34 * s, (o + 0.03) * s); c.stroke();
          c.strokeStyle = tint(f.c, 0.4); c.lineWidth = 0.007 * s; c.beginPath(); c.moveTo(-0.34 * s, (o + 0.064) * s); c.quadraticCurveTo(0, (o - 0.056) * s, 0.34 * s, (o + 0.044) * s); c.stroke();
        }
      } else {
        // opstaande rand van de dakpan (tegula) en de veeg van de pannenbakker
        c.fillStyle = tint(f.c, 0.3); c.fillRect(-0.32 * s, -0.17 * s, 0.64 * s, 0.065 * s);
        c.fillStyle = 'rgba(0,0,0,0.38)'; c.fillRect(-0.32 * s, -0.105 * s, 0.64 * s, 0.022 * s);
        c.strokeStyle = tint(f.c, -0.3); c.lineWidth = 0.012 * s; c.beginPath(); c.arc(0.02 * s, 0.3 * s, 0.26 * s, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
        c.strokeStyle = tint(f.c, 0.25); c.lineWidth = 0.006 * s; c.beginPath(); c.arc(0.02 * s, 0.3 * s, 0.247 * s, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
      }
      for (let k = 0; k < 26; k++) { c.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,230,200,0.12)'; c.beginPath(); c.arc((r() - 0.5) * 0.6 * s, (r() - 0.5) * 0.32 * s, s * (0.004 + r() * 0.008), 0, 7); c.fill(); }
      c.restore();
    }
    c.restore();
    dirt(9, s * 0.26);
  }
}

// Alles wat bij de opgraving stilstaat, voorgetekend op de maat van het canvas: het grasveld met de oude weg,
// de kuil met onaangeroerde grond, de afgegraven laag, de schaduw van één gat en de vondsten.
function opgravingScene(L, cols, rows) {
  const { W, H, u, s, x0, y0 } = L, pw = s * cols, ph = s * rows;
  const korrel = grainTile(128, 7, 0.6);
  const stone = (c, r, x, y, w, h, a = 1) => {
    const rad = Math.min(w, h) * 0.32;
    c.fillStyle = `rgba(0,0,0,${0.38 * a})`; c.beginPath(); c.roundRect(x + 0.3 * u, y + 0.4 * u, w, h, rad); c.fill();
    const g = c.createLinearGradient(x, y, x + w, y + h), v = 122 + r() * 34;
    g.addColorStop(0, `rgba(${v + 30},${v + 24},${v + 6},${a})`); g.addColorStop(1, `rgba(${v - 30},${v - 36},${v - 50},${a})`);
    c.fillStyle = g; c.beginPath(); c.roundRect(x, y, w, h, rad); c.fill();
  };
  const bg = sheet(W, H, (c) => {
    const r = seeded(1925);
    // grasveld
    const gg = c.createLinearGradient(0, 0, W, H);
    gg.addColorStop(0, '#86a750'); gg.addColorStop(0.5, '#6c8f3e'); gg.addColorStop(1, '#4f722e');
    c.fillStyle = gg; c.fillRect(0, 0, W, H);
    for (let k = 0; k < 46; k++) glow(c, r() * W, r() * H, (6 + r() * 14) * u, r() < 0.5 ? '38,66,20' : '176,204,96', 0.16);
    grainFill(c, korrel, 0, 0, W, H, 0.7);
    const blades = (n, xa, xb, ya, yb) => {
      for (const col of ['rgba(48,80,26,0.55)', 'rgba(98,134,54,0.6)', 'rgba(152,184,86,0.5)', 'rgba(192,212,116,0.35)']) {
        c.strokeStyle = col; c.lineWidth = 0.22 * u; c.beginPath();
        for (let k = 0; k < n / 4; k++) { const bx = xa + r() * (xb - xa), by = ya + r() * (yb - ya); c.moveTo(bx, by); c.lineTo(bx + (r() - 0.5) * u, by - (0.8 + r() * 1.5) * u); }
        c.stroke();
      }
    };
    blades(Math.min(9000, (W * H) / (u * u * 2.4)), 0, W, 0, H);
    // de oude Romeinse weg: een baan versleten keien dwars door het veld (en dus door de kuil)
    const ry = y0 + ph / 2, rh = ph * 0.27;
    const band = c.createLinearGradient(0, ry - rh * 1.25, 0, ry + rh * 1.25);
    band.addColorStop(0, 'rgba(112,90,60,0)'); band.addColorStop(0.16, 'rgba(112,90,60,0.9)'); band.addColorStop(0.84, 'rgba(98,78,52,0.9)'); band.addColorStop(1, 'rgba(98,78,52,0)');
    c.fillStyle = band; c.fillRect(0, ry - rh * 1.25, W, rh * 2.5);
    const sh = 4.3 * u;
    for (let yy = ry - rh, row = 0; yy < ry + rh - sh * 0.5; yy += sh, row++) {
      const edge = Math.min(yy - (ry - rh), ry + rh - (yy + sh)) < sh * 0.6;
      for (let xx = -(row % 2) * 3 * u - r() * 2 * u; xx < W;) {
        const w = (4.6 + r() * 3.6) * u;
        if (r() > (edge ? 0.5 : 0.1)) stone(c, r, xx + 0.3 * u, yy + (r() - 0.5) * 0.5 * u, w - 0.6 * u, sh - 0.7 * u);
        xx += w;
      }
    }
    // karrensporen
    for (const o of [-0.45, 0.45]) { const g2 = c.createLinearGradient(0, ry + rh * o - 1.6 * u, 0, ry + rh * o + 1.6 * u); g2.addColorStop(0, 'rgba(40,28,14,0)'); g2.addColorStop(0.5, 'rgba(40,28,14,0.3)'); g2.addColorStop(1, 'rgba(40,28,14,0)'); c.fillStyle = g2; c.fillRect(0, ry + rh * o - 1.6 * u, W, 3.2 * u); }
    grainFill(c, korrel, 0, ry - rh * 1.2, W, rh * 2.4, 0.6);
    // mos en gras tussen de keien
    for (let k = 0; k < W / u * 0.5; k++) glow(c, r() * W, ry + (r() - 0.5) * rh * 2.3, (1.5 + r() * 4) * u, '74,104,40', 0.3);
    blades(W / u * 6, 0, W, ry - rh, ry + rh);
    blades(W / u * 5, 0, W, ry - rh * 1.2, ry - rh * 0.86); blades(W / u * 5, 0, W, ry + rh * 0.9, ry + rh * 1.24);

    // gereedschap in het gras, als er naast de kuil ruimte is
    const marge = x0 - 2.6 * u;
    if (marge > 20 * u) {
      // emmer (van boven gezien) linksboven
      const ex = x0 - 2.6 * u - marge * 0.5, ey = y0 + ph * 0.08, er = 6.2 * u;
      softShadow(c, ex + er * 0.45, ey + er * 0.55, er * 1.5, er * 1.35, 0.5);
      let g = c.createLinearGradient(ex - er, ey - er, ex + er, ey + er); g.addColorStop(0, '#e9eef0'); g.addColorStop(0.5, '#8d999f'); g.addColorStop(1, '#515b61');
      c.fillStyle = g; c.beginPath(); c.arc(ex, ey, er, 0, 7); c.fill();
      g = c.createRadialGradient(ex + er * 0.2, ey + er * 0.25, er * 0.1, ex, ey, er * 0.86); g.addColorStop(0, '#6e5236'); g.addColorStop(0.7, '#4a3521'); g.addColorStop(1, '#22170d');
      c.fillStyle = g; c.beginPath(); c.arc(ex, ey, er * 0.86, 0, 7); c.fill();
      for (let k = 0; k < 40; k++) { const a = r() * 6.28, d = er * 0.74 * Math.sqrt(r()); c.fillStyle = r() < 0.5 ? 'rgba(150,116,76,0.5)' : 'rgba(30,20,10,0.4)'; c.beginPath(); c.arc(ex + Math.cos(a) * d, ey + Math.sin(a) * d, (0.15 + r() * 0.4) * u, 0, 7); c.fill(); }
      c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 0.35 * u; c.beginPath(); c.arc(ex, ey, er * 0.94, Math.PI * 1.0, Math.PI * 1.55); c.stroke();
      c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 0.9 * u; c.beginPath(); c.moveTo(ex - er + 0.5 * u, ey + 0.6 * u); c.quadraticCurveTo(ex + 0.4 * u, ey + er * 0.75, ex + er + 0.5 * u, ey + 0.6 * u); c.stroke();
      c.strokeStyle = '#3b4347'; c.lineWidth = 0.55 * u; c.beginPath(); c.moveTo(ex - er, ey); c.quadraticCurveTo(ex, ey + er * 0.62, ex + er, ey); c.stroke(); // hengsel
      // troffel linksonder
      c.save(); c.translate(x0 - 2.6 * u - marge * 0.52, y0 + ph * 0.93); c.rotate(-0.55);
      const troffel = (dx, dy, schaduw) => {
        c.save(); c.translate(dx, dy);
        if (schaduw) c.fillStyle = 'rgba(0,0,0,0.42)';
        else { const hg = c.createLinearGradient(0, -1.3 * u, 0, 1.3 * u); hg.addColorStop(0, '#d9a465'); hg.addColorStop(0.5, '#a56a32'); hg.addColorStop(1, '#5e3814'); c.fillStyle = hg; }
        c.beginPath(); c.roundRect(-9 * u, -1.2 * u, 7.5 * u, 2.4 * u, 1.1 * u); c.fill(); // houten handvat
        if (!schaduw) { const sg = c.createLinearGradient(0, -0.5 * u, 0, 0.5 * u); sg.addColorStop(0, '#f1f4f5'); sg.addColorStop(1, '#6f7a80'); c.fillStyle = sg; }
        c.fillRect(-1.8 * u, -0.45 * u, 3 * u, 0.9 * u); // steel
        if (!schaduw) { const bg2 = c.createLinearGradient(0, -3 * u, 0, 3 * u); bg2.addColorStop(0, '#f4f7f8'); bg2.addColorStop(0.45, '#aab4b9'); bg2.addColorStop(0.55, '#8b969b'); bg2.addColorStop(1, '#59646a'); c.fillStyle = bg2; }
        poly(c, [[0.8 * u, 0], [3.4 * u, -2.9 * u], [10 * u, 0], [3.4 * u, 2.9 * u]]); c.fill(); // blad
        c.restore();
      };
      troffel(0.9 * u, 1.3 * u, true); troffel(0, 0, false);
      for (let k = 0; k < 14; k++) { c.fillStyle = `rgba(92,66,40,${0.4 + r() * 0.4})`; c.beginPath(); c.arc((5 + r() * 4.5) * u, (r() - 0.5) * 2.6 * u, (0.15 + r() * 0.35) * u, 0, 7); c.fill(); }
      c.restore();
      // hoop uitgegraven aarde rechtsboven
      const hx = x0 + pw + 2.6 * u + marge * 0.5, hy = y0 + ph * 0.06;
      softShadow(c, hx + 2 * u, hy + 2.6 * u, 13 * u, 9 * u, 0.5);
      for (let k = 0; k < 150; k++) {
        const a = r() * 6.28, d = Math.pow(r(), 0.7), px = hx + Math.cos(a) * d * 10 * u, py = hy + Math.sin(a) * d * 6.6 * u, pr = (0.6 + r() * 1.5) * u * (1.15 - d * 0.5);
        c.fillStyle = 'rgba(20,12,6,0.45)'; c.beginPath(); c.arc(px + 0.25 * u, py + 0.35 * u, pr, 0, 7); c.fill();
        c.fillStyle = ballGrad(c, px, py, pr, r() < 0.5 ? '#a8845a' : '#94714a', '#6d4c2f', '#3d2916'); c.beginPath(); c.arc(px, py, pr, 0, 7); c.fill();
      }
      // klembord met de plattegrond van de kuil rechtsonder
      c.save(); c.translate(hx - 1 * u, y0 + ph * 0.9); c.rotate(0.22);
      const bw = 12 * u, bh = 15 * u;
      c.fillStyle = 'rgba(0,0,0,0.4)'; c.beginPath(); c.roundRect(-bw / 2 + 0.8 * u, -bh / 2 + 1.1 * u, bw, bh, 0.8 * u); c.fill();
      let kg = c.createLinearGradient(-bw / 2, -bh / 2, bw / 2, bh / 2); kg.addColorStop(0, '#a7794a'); kg.addColorStop(1, '#6f4a26');
      c.fillStyle = kg; c.beginPath(); c.roundRect(-bw / 2, -bh / 2, bw, bh, 0.8 * u); c.fill();
      kg = c.createLinearGradient(-bw / 2, -bh / 2, bw / 2, bh / 2); kg.addColorStop(0, '#fffdf4'); kg.addColorStop(1, '#ded7c2');
      c.fillStyle = kg; c.fillRect(-bw / 2 + 0.9 * u, -bh / 2 + 1.6 * u, bw - 1.8 * u, bh - 2.6 * u);
      c.strokeStyle = 'rgba(40,60,110,0.55)'; c.lineWidth = 0.12 * u;
      const tw = bw - 4 * u, tc = tw / cols;
      c.beginPath();
      for (let k = 0; k <= cols; k++) { c.moveTo(-tw / 2 + k * tc, -bh / 2 + 3.6 * u); c.lineTo(-tw / 2 + k * tc, -bh / 2 + 3.6 * u + tc * rows); }
      for (let k = 0; k <= rows; k++) { c.moveTo(-tw / 2, -bh / 2 + 3.6 * u + k * tc); c.lineTo(tw / 2, -bh / 2 + 3.6 * u + k * tc); }
      c.stroke();
      c.strokeStyle = 'rgba(60,60,60,0.4)'; c.lineWidth = 0.16 * u; c.beginPath();
      for (let k = 0; k < 4; k++) { c.moveTo(-tw / 2, bh / 2 - (1.6 + k * 1.1) * u); c.lineTo(-tw / 2 + tw * (0.5 + r() * 0.5), bh / 2 - (1.6 + k * 1.1) * u); }
      c.stroke();
      kg = c.createLinearGradient(0, -bh / 2 - 0.4 * u, 0, -bh / 2 + 1.8 * u); kg.addColorStop(0, '#f2f4f5'); kg.addColorStop(1, '#737d83');
      c.fillStyle = kg; c.beginPath(); c.roundRect(-2.6 * u, -bh / 2 - 0.4 * u, 5.2 * u, 2.2 * u, 0.5 * u); c.fill();
      c.restore();
    }
    // meetlat (rood-wit, één blok per vakje) boven de kuil
    const my = y0 - 6.2 * u, mh = 1.3 * u, mn = Math.min(cols, 4);
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(x0 + 0.5 * u, my + 0.8 * u, s * mn, mh);
    for (let k = 0; k < mn; k++) {
      const g = c.createLinearGradient(0, my, 0, my + mh);
      if (k % 2) { g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#c9c9c4'); } else { g.addColorStop(0, '#ef5350'); g.addColorStop(1, '#a52222'); }
      c.fillStyle = g; c.fillRect(x0 + k * s, my, s, mh);
    }
    c.fillStyle = 'rgba(255,255,255,0.45)'; c.fillRect(x0, my + mh * 0.14, s * mn, mh * 0.16);

    // de kuil: afgestoken graszode, planken eromheen, onaangeroerde grond erin
    softShadow(c, x0 + pw / 2 + 1.5 * u, y0 + ph / 2 + 2 * u, pw * 0.62, ph * 0.66, 0.35);
    c.fillStyle = '#33230f'; c.beginPath(); c.roundRect(x0 - 2.7 * u, y0 - 2.7 * u, pw + 5.4 * u, ph + 5.4 * u, 0.9 * u); c.fill();
    const plank = (x, y, w, h, horiz, licht) => {
      const g = horiz ? c.createLinearGradient(0, y, 0, y + h) : c.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, tint('#b98f5c', licht)); g.addColorStop(0.5, tint('#a47a48', licht)); g.addColorStop(1, tint('#7d5a30', licht));
      c.fillStyle = g; c.fillRect(x, y, w, h);
      c.strokeStyle = 'rgba(60,36,12,0.28)'; c.lineWidth = 0.1 * u; c.beginPath();
      for (let k = 0; k < 5; k++) { const o = (0.15 + r() * 0.7) * (horiz ? h : w); if (horiz) { c.moveTo(x, y + o); c.lineTo(x + w, y + o + (r() - 0.5) * 0.3 * u); } else { c.moveTo(x + o, y); c.lineTo(x + o + (r() - 0.5) * 0.3 * u, y + h); } }
      c.stroke();
    };
    plank(x0 - 2 * u, y0 - 2 * u, pw + 4 * u, 2 * u, true, 0.16); plank(x0 - 2 * u, y0 + ph, pw + 4 * u, 2 * u, true, -0.06);
    plank(x0 - 2 * u, y0, 2 * u, ph, false, 0.1); plank(x0 + pw, y0, 2 * u, ph, false, -0.1);
    // grond: nog licht geblokt zoals eerst, zodat je de vakjes kunt tellen
    for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) { c.fillStyle = (cx + cy) % 2 ? '#b78b54' : '#c59a62'; c.fillRect(x0 + cx * s, y0 + cy * s, s + 1, s + 1); }
    for (let k = 0; k < cols * rows * 1.2; k++) glow(c, x0 + r() * pw, y0 + r() * ph, (2 + r() * 5) * u, r() < 0.55 ? '90,60,30' : '236,206,150', 0.13);
    c.save(); c.beginPath(); c.rect(x0, y0, pw, ph); c.clip();
    grainFill(c, korrel, x0, y0, pw, ph, 1);
    // barstjes in de droge bovenlaag
    c.strokeStyle = 'rgba(70,44,18,0.35)'; c.lineWidth = 0.14 * u; c.beginPath();
    for (let k = 0; k < cols * rows * 1.6; k++) { let px = x0 + r() * pw, py = y0 + r() * ph; c.moveTo(px, py); for (let j = 0; j < 3; j++) { px += (r() - 0.5) * 3 * u; py += (r() - 0.5) * 3 * u; c.lineTo(px, py); } }
    c.stroke();
    // steentjes en kluiten, met een lichte kant en een schaduwkant
    for (let k = 0; k < cols * rows * 7; k++) {
      const px = x0 + r() * pw, py = y0 + r() * ph, pr = (0.18 + r() * r() * 0.75) * u, kluit = r() < 0.6;
      c.fillStyle = 'rgba(50,30,10,0.4)'; c.beginPath(); c.ellipse(px + pr * 0.4, py + pr * 0.5, pr, pr * 0.8, 0, 0, 7); c.fill();
      c.fillStyle = kluit ? ballGrad(c, px, py, pr, '#e2bd86', '#b88c55', '#7c5a30') : ballGrad(c, px, py, pr, '#f3efe6', '#b5ac9c', '#6d665a');
      c.beginPath(); c.ellipse(px, py, pr, pr * 0.8, r() * 3, 0, 7); c.fill();
    }
    // de rand van de kuil werpt een schaduw naar binnen (licht komt van linksboven)
    let ig = c.createLinearGradient(0, y0, 0, y0 + 1.8 * u); ig.addColorStop(0, 'rgba(30,16,4,0.5)'); ig.addColorStop(1, 'rgba(30,16,4,0)'); c.fillStyle = ig; c.fillRect(x0, y0, pw, 1.8 * u);
    ig = c.createLinearGradient(x0, 0, x0 + 1.5 * u, 0); ig.addColorStop(0, 'rgba(30,16,4,0.4)'); ig.addColorStop(1, 'rgba(30,16,4,0)'); c.fillStyle = ig; c.fillRect(x0, y0, 1.5 * u, ph);
    c.restore();
    // piketten waar de touwtjes aan vastzitten
    const piket = (px, py) => {
      c.fillStyle = 'rgba(0,0,0,0.4)'; c.beginPath(); c.arc(px + 0.25 * u, py + 0.35 * u, 0.5 * u, 0, 7); c.fill();
      c.fillStyle = ballGrad(c, px, py, 0.48 * u, '#fff6dc', '#d9bd86', '#8a6a3a'); c.beginPath(); c.arc(px, py, 0.48 * u, 0, 7); c.fill();
    };
    for (let k = 0; k <= cols; k++) { piket(x0 + k * s, y0 - u); piket(x0 + k * s, y0 + ph + u); }
    for (let k = 0; k <= rows; k++) { piket(x0 - u, y0 + k * s); piket(x0 + pw + u, y0 + k * s); }
    lightAndVignette(c, W, H, 0.13, 0.42);
  });
  // de afgegraven laag: donkere, vochtige aarde, met in het midden de keien van de oude weg
  const diep = sheet(pw, ph, (c) => {
    const r = seeded(77);
    c.fillStyle = '#62432a'; c.fillRect(0, 0, pw, ph);
    for (let k = 0; k < cols * rows * 2; k++) glow(c, r() * pw, r() * ph, (2 + r() * 5) * u, r() < 0.6 ? '44,26,12' : '136,100,62', 0.3);
    const sh = 4.3 * u, ry = ph / 2, rh = ph * 0.27;
    for (let yy = ry - rh, row = 0; yy < ry + rh - sh * 0.5; yy += sh, row++) {
      for (let xx = -(row % 2) * 3 * u - r() * 2 * u; xx < pw;) { const w = (4.6 + r() * 3.6) * u; if (r() > 0.25) stone(c, r, xx + 0.3 * u, yy + (r() - 0.5) * 0.5 * u, w - 0.6 * u, sh - 0.7 * u, 0.3); xx += w; }
    }
    grainFill(c, korrel, 0, 0, pw, ph, 1);
    for (let k = 0; k < cols * rows * 5; k++) {
      const px = r() * pw, py = r() * ph, pr = (0.15 + r() * r() * 0.6) * u;
      c.fillStyle = 'rgba(20,10,4,0.45)'; c.beginPath(); c.arc(px + pr * 0.4, py + pr * 0.5, pr, 0, 7); c.fill();
      c.fillStyle = ballGrad(c, px, py, pr, '#a8855c', '#7a5836', '#3f2a16'); c.beginPath(); c.arc(px, py, pr, 0, 7); c.fill();
    }
    // worteltjes
    c.strokeStyle = 'rgba(214,190,150,0.3)'; c.lineWidth = 0.12 * u; c.beginPath();
    for (let k = 0; k < cols * rows; k++) { const px = r() * pw, py = r() * ph; c.moveTo(px, py); c.quadraticCurveTo(px + (r() - 0.5) * 4 * u, py + (r() - 0.5) * 4 * u, px + (r() - 0.5) * 6 * u, py + (r() - 0.5) * 6 * u); }
    c.stroke();
  });
  // één gat: de wanden boven en links liggen in de schaduw, de wanden onder en rechts vangen licht
  const gat = sheet(s, s, (c) => {
    let g = c.createLinearGradient(0, 0, 0, s * 0.34); g.addColorStop(0, 'rgba(8,4,0,0.74)'); g.addColorStop(0.35, 'rgba(8,4,0,0.4)'); g.addColorStop(1, 'rgba(8,4,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, s, s * 0.34);
    g = c.createLinearGradient(0, 0, s * 0.28, 0); g.addColorStop(0, 'rgba(8,4,0,0.62)'); g.addColorStop(0.4, 'rgba(8,4,0,0.3)'); g.addColorStop(1, 'rgba(8,4,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, s * 0.28, s);
    g = c.createLinearGradient(0, s * 0.89, 0, s); g.addColorStop(0, 'rgba(160,122,78,0)'); g.addColorStop(0.3, 'rgba(160,122,78,0.75)'); g.addColorStop(1, 'rgba(206,168,116,0.95)');
    c.fillStyle = g; poly(c, [[s * 0.1, s * 0.89], [s * 0.9, s * 0.89], [s, s], [0, s]]); c.fill();
    g = c.createLinearGradient(s * 0.9, 0, s, 0); g.addColorStop(0, 'rgba(140,104,64,0)'); g.addColorStop(0.3, 'rgba(140,104,64,0.65)'); g.addColorStop(1, 'rgba(180,142,94,0.9)');
    c.fillStyle = g; poly(c, [[s * 0.9, s * 0.1], [s, 0], [s, s], [s * 0.9, s * 0.9]]); c.fill();
    // aardlagen in de verlichte wanden
    c.strokeStyle = 'rgba(70,44,20,0.5)'; c.lineWidth = Math.max(1, s * 0.012);
    c.beginPath(); c.moveTo(s * 0.05, s * 0.945); c.lineTo(s * 0.95, s * 0.945); c.moveTo(s * 0.945, s * 0.05); c.lineTo(s * 0.945, s * 0.95); c.stroke();
  });
  const vondst = FINDS.map((f, i) => sheet(s, s, (c) => drawFind(c, f, s, i)));
  // de geraakte waterleiding: natte modder, een plas en een grijze buis met een lek
  const leiding = sheet(s, s, (c) => {
    c.fillStyle = 'rgba(16,14,12,0.35)'; c.fillRect(0, 0, s, s);
    let g = c.createRadialGradient(s * 0.5, s * 0.6, s * 0.05, s * 0.5, s * 0.6, s * 0.5);
    g.addColorStop(0, 'rgba(150,208,244,0.95)'); g.addColorStop(0.6, 'rgba(70,132,184,0.85)'); g.addColorStop(1, 'rgba(40,84,120,0)');
    c.save(); c.translate(0, s * 0.18); c.scale(1, 0.72); c.fillStyle = g; c.fillRect(0, 0, s, s * 1.1); c.restore();
    g = c.createLinearGradient(0, s * 0.58, 0, s * 0.72); g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, s * 0.58, s, s * 0.14);
    g = c.createLinearGradient(0, s * 0.42, 0, s * 0.58); g.addColorStop(0, '#4a5a63'); g.addColorStop(0.28, '#e4ebee'); g.addColorStop(0.55, '#9fb0b8'); g.addColorStop(1, '#3d4b53');
    c.fillStyle = g; c.fillRect(0, s * 0.42, s, s * 0.16);
    g = c.createLinearGradient(0, s * 0.39, 0, s * 0.61); g.addColorStop(0, '#3d4b53'); g.addColorStop(0.28, '#c3ced3'); g.addColorStop(0.55, '#84959d'); g.addColorStop(1, '#2c383f');
    c.fillStyle = g; c.beginPath(); c.roundRect(s * 0.6, s * 0.39, s * 0.16, s * 0.22, s * 0.02); c.fill(); // mof
    // de barst en het water dat eruit spuit
    c.strokeStyle = '#1c2429'; c.lineWidth = s * 0.014; c.beginPath(); c.moveTo(s * 0.24, s * 0.44); c.lineTo(s * 0.3, s * 0.49); c.lineTo(s * 0.27, s * 0.52); c.lineTo(s * 0.34, s * 0.56); c.stroke();
    c.strokeStyle = 'rgba(220,240,255,0.9)'; c.lineCap = 'round';
    for (let k = 0; k < 6; k++) { c.lineWidth = s * (0.012 + (k % 3) * 0.008); c.beginPath(); c.moveTo(s * 0.29, s * 0.47); c.quadraticCurveTo(s * (0.2 + k * 0.035), s * (0.22 + (k % 2) * 0.05), s * (0.1 + k * 0.08), s * (0.14 + ((k * 7) % 4) * 0.035)); c.stroke(); }
    c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = s * 0.012;
    c.beginPath(); c.ellipse(s * 0.34, s * 0.76, s * 0.12, s * 0.035, 0, Math.PI, Math.PI * 1.8); c.stroke();
    c.beginPath(); c.ellipse(s * 0.66, s * 0.82, s * 0.09, s * 0.028, 0, Math.PI, Math.PI * 1.8); c.stroke();
  });
  return { bg, diep, gat, vondst, leiding };
}

// Graven in vakjes. Een leeg vakje laat zien hoeveel vondsten er in de vakjes eromheen liggen
// (de metaaldetector piept). Ergens ligt de waterleiding: daar graven kost drie scheppen.
export function startOpgraving(g, { cols = 7, rows = 5, digs = 16, need = 5 } = {}) {
  const ui = overlay(g, 'Opgraving aan de Oude Akerweg', '<canvas class="mini-canvas"></canvas>',
    g.input.isTouch ? 'Tik op een vakje om te graven. Een getal zegt hoeveel vondsten er in de vakjes eromheen liggen.' : 'Klik op een vakje om te graven. Een getal zegt hoeveel vondsten er in de vakjes eromheen liggen.');
  const cv = ui.ov.querySelector('canvas');
  const ctx = cv.getContext('2d');
  fitCanvas(cv);
  const parts = new Particles();
  const look = {}; // voorgetekende beelden, opnieuw gemaakt als het canvas een andere maat krijgt
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
    // tekenen: opgravingskuil met touwtjes in het gras, de oude weg loopt erdoorheen.
    // Het veld, de kuil en het gereedschap staan voorgetekend klaar; per beeld komen alleen de gegraven vakjes erbij.
    const sc = keep(look, `${W}x${H}`, () => opgravingScene(L, cols, rows));
    ctx.drawImage(sc.bg, 0, 0);
    const kx = sc.diep.width / (s * cols), ky = sc.diep.height / (s * rows);
    for (const c of cells) {
      const x = L.x0 + c.x * s, y = L.y0 + c.y * s;
      c.anim = Math.max(0, c.anim - dt * 3);
      if (!c.dug) continue;
      // het gat: een stuk van de diepere laag, met de schaduw van de wanden eroverheen
      ctx.drawImage(sc.diep, (c.x * s + 1) * kx, (c.y * s + 1) * ky, (s - 2) * kx, (s - 2) * ky, x + 1, y + 1, s - 2, s - 2);
      if (c.pipe) {
        ctx.drawImage(sc.leiding, x + 1, y + 1, s - 2, s - 2);
        // kringen in de plas
        for (let k = 0; k < 2; k++) {
          const ph = (t * 0.9 + k * 0.5) % 1;
          ctx.strokeStyle = `rgba(235,246,255,${0.55 * (1 - ph)})`; ctx.lineWidth = 0.2 * u;
          ctx.beginPath(); ctx.ellipse(x + s * 0.3, y + s * 0.74, s * (0.04 + ph * 0.16), s * (0.015 + ph * 0.06), 0, 0, 7); ctx.stroke();
        }
      }
      ctx.drawImage(sc.gat, x + 1, y + 1, s - 2, s - 2);
      if (c.find) ctx.drawImage(sc.vondst[FINDS.indexOf(c.find)], x, y, s, s);
      else if (!c.pipe && c.n) {
        ctx.font = `800 ${s * 0.5}px Inter, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(24,12,2,0.8)'; ctx.lineWidth = s * 0.09;
        ctx.strokeText(String(c.n), x + s / 2, y + s / 2 + 1);
        ctx.fillStyle = ['#fff', '#ffe082', '#ffb74d', '#ff7043', '#e53935'][Math.min(4, c.n)];
        ctx.fillText(String(c.n), x + s / 2, y + s / 2 + 1);
      }
      // stofwolkje vlak na het graven
      if (c.anim > 0) { ctx.fillStyle = `rgba(222,190,140,${c.anim * 0.5})`; ctx.fillRect(x + 1, y + 1, s - 2, s - 2); }
    }
    // touwtjes van het raster, met hun schaduw op de grond
    const ropes = (d) => {
      ctx.beginPath();
      for (let k = 0; k <= cols; k++) { ctx.moveTo(L.x0 + k * s + d, L.y0 - u + d); ctx.lineTo(L.x0 + k * s + d, L.y0 + rows * s + u + d); }
      for (let k = 0; k <= rows; k++) { ctx.moveTo(L.x0 - u + d, L.y0 + k * s + d); ctx.lineTo(L.x0 + cols * s + u + d, L.y0 + k * s + d); }
      ctx.stroke();
    };
    ctx.strokeStyle = 'rgba(30,16,4,0.3)'; ctx.lineWidth = 0.3 * u; ropes(0.3 * u);
    ctx.strokeStyle = 'rgba(250,244,226,0.85)'; ctx.lineWidth = 0.26 * u; ropes(0);
    parts.draw(ctx);
    // bordje met de naam van de weg
    ctx.font = `700 ${3 * u}px Inter, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const cap = 'De oude Romeinse weg van Maastricht naar Aken', cw = ctx.measureText(cap).width + 5 * u, capY = L.y0 + rows * s + 6 * u;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.roundRect(W / 2 - cw / 2 + 0.4 * u, capY - 3.3 * u + 0.5 * u, cw, 4.6 * u, 0.9 * u); ctx.fill();
    ctx.fillStyle = 'rgba(247,240,220,0.94)'; ctx.beginPath(); ctx.roundRect(W / 2 - cw / 2, capY - 3.3 * u, cw, 4.6 * u, 0.9 * u); ctx.fill();
    ctx.fillStyle = '#1b2430';
    ctx.fillText(cap, W / 2, capY);
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

// Eén onderdeel van een gerecht, getekend rond (0, 0) met straal r: zelfde plek en maat als het oude gekleurde rondje,
// maar met volume, glans en een slagschaduw op het bord (licht van linksboven).
function drawFood(c, it, r) {
  const n = it.n, q = seeded(n.length * 97 + 5);
  const disc = (x, y, rad, fill) => { c.fillStyle = fill; c.beginPath(); c.arc(x, y, rad, 0, 7); c.fill(); };
  const gloss = (x, y, rx, ry, rot, a) => { c.fillStyle = `rgba(255,255,255,${a})`; c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, 7); c.fill(); };
  const shadow = (k = 1) => softShadow(c, r * 0.2, r * 0.28, r * 1.3 * k, r * 1.2 * k, 0.5);
  if (n === 'coquille') {
    shadow();
    disc(r * 0.04, r * 0.1, r, '#cdb58a'); // de zijkant
    const g = c.createRadialGradient(-r * 0.1, -r * 0.12, r * 0.1, 0, 0, r * 0.97);
    g.addColorStop(0, '#b87428'); g.addColorStop(0.45, '#d89c4c'); g.addColorStop(0.82, '#f1d9a8'); g.addColorStop(1, '#fdf1d8');
    disc(0, 0, r * 0.97, g);
    for (let k = 0; k < 9; k++) { const a = q() * 6.28, d = r * 0.6 * Math.sqrt(q()); disc(Math.cos(a) * d, Math.sin(a) * d, r * (0.1 + q() * 0.14), 'rgba(116,58,14,0.2)'); } // schroeiplekken
    c.strokeStyle = 'rgba(255,246,224,0.16)'; c.lineWidth = r * 0.03;
    for (let k = 0; k < 14; k++) { const a = k * 0.45 + q(); c.beginPath(); c.moveTo(Math.cos(a) * r * 0.15, Math.sin(a) * r * 0.15); c.lineTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9); c.stroke(); }
    gloss(-r * 0.36, -r * 0.42, r * 0.32, r * 0.12, -0.75, 0.5);
  } else if (n === 'druppel bietencrème') {
    shadow();
    disc(0, 0, r, ballGrad(c, 0, 0, r, '#f8a5c4', '#ad1457', '#560a2c'));
    c.strokeStyle = 'rgba(255,170,205,0.4)'; c.lineWidth = r * 0.09; c.beginPath(); c.arc(0, 0, r * 0.8, Math.PI * 0.12, Math.PI * 0.45); c.stroke();
    gloss(-r * 0.36, -r * 0.42, r * 0.27, r * 0.14, -0.75, 0.9);
  } else if (n === 'kruidenblaadje') {
    c.rotate(-0.25);
    const blad = (dx, dy) => { c.beginPath(); c.moveTo(-r * 1.05 + dx, dy); c.quadraticCurveTo(-r * 0.15 + dx, -r * 1.05 + dy, r * 1.05 + dx, dy); c.quadraticCurveTo(-r * 0.15 + dx, r * 1.05 + dy, -r * 1.05 + dx, dy); c.closePath(); };
    c.fillStyle = 'rgba(0,0,0,0.3)'; blad(r * 0.18, r * 0.26); c.fill();
    const g = c.createLinearGradient(0, -r * 0.55, 0, r * 0.55);
    g.addColorStop(0, '#93d67f'); g.addColorStop(0.5, it.c); g.addColorStop(1, '#255f29');
    c.fillStyle = g; blad(0, 0); c.fill();
    c.strokeStyle = '#1b5e20'; c.lineWidth = r * 0.1; c.beginPath(); c.moveTo(-r, 0); c.lineTo(r, 0); c.stroke(); // de nerf
    c.lineWidth = r * 0.05; c.beginPath();
    for (let k = -2; k <= 2; k++) { const x = k * r * 0.3; c.moveTo(x, 0); c.lineTo(x + r * 0.22, -r * 0.3); c.moveTo(x, 0); c.lineTo(x + r * 0.22, r * 0.3); }
    c.stroke();
    c.strokeStyle = 'rgba(220,255,200,0.55)'; c.lineWidth = r * 0.06; c.beginPath(); c.moveTo(-r * 0.8, -r * 0.14); c.quadraticCurveTo(-r * 0.15, -r * 0.62, r * 0.6, -r * 0.2); c.stroke();
  } else if (n === 'stukje hert') {
    const el = (x, y, k, fill) => { c.fillStyle = fill; c.beginPath(); c.ellipse(x, y, r * k, r * 0.8 * k, 0.4, 0, 7); c.fill(); };
    shadow();
    el(r * 0.05, r * 0.12, 1, '#200d07'); // de zijkant
    let g = c.createRadialGradient(-r * 0.25, -r * 0.3, r * 0.1, 0, 0, r);
    g.addColorStop(0, '#8a452c'); g.addColorStop(0.6, '#5c2817'); g.addColorStop(1, '#35140b');
    el(0, 0, 1, g); // de aangebraden korst
    g = c.createRadialGradient(0, 0, r * 0.05, 0, 0, r * 0.74);
    g.addColorStop(0, '#d06a62'); g.addColorStop(0.6, '#ab423c'); g.addColorStop(1, '#6f2a1f');
    el(0, -r * 0.02, 0.74, g); // het rosé snijvlak
    c.strokeStyle = 'rgba(100,24,24,0.22)'; c.lineWidth = r * 0.03; c.beginPath();
    for (let k = -3; k <= 3; k++) { c.moveTo(-r * 0.45, k * r * 0.13 - r * 0.18); c.lineTo(r * 0.45, k * r * 0.13 + r * 0.18); }
    c.stroke();
    gloss(-r * 0.28, -r * 0.3, r * 0.3, r * 0.09, -0.3, 0.38); gloss(r * 0.3, r * 0.18, r * 0.1, r * 0.04, -0.3, 0.25);
    for (let k = 0; k < 9; k++) disc((q() - 0.5) * r * 1.1, (q() - 0.5) * r * 0.8, r * 0.025, k % 2 ? 'rgba(20,10,5,0.7)' : 'rgba(255,255,255,0.75)'); // peper en zout
  } else if (n === 'quenelle knolselderij') {
    c.rotate(0.4);
    softShadow(c, r * 0.14, r * 0.32, r * 1.25, r * 0.8, 0.62);
    c.beginPath(); c.moveTo(-r, 0); c.bezierCurveTo(-r * 0.6, -r * 0.8, r * 0.6, -r * 0.8, r, 0); c.bezierCurveTo(r * 0.6, r * 0.8, -r * 0.6, r * 0.8, -r, 0); c.closePath();
    const g = c.createLinearGradient(0, -r * 0.6, 0, r * 0.6);
    g.addColorStop(0, '#fffef6'); g.addColorStop(0.5, it.c); g.addColorStop(1, '#b3a57f');
    c.fillStyle = g; c.fill();
    c.lineCap = 'round';
    c.strokeStyle = 'rgba(150,134,96,0.35)'; c.lineWidth = r * 0.07; c.beginPath(); c.moveTo(-r * 0.8, r * 0.02); c.quadraticCurveTo(0, -r * 0.2, r * 0.8, r * 0.02); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = r * 0.08; c.beginPath(); c.moveTo(-r * 0.7, -r * 0.14); c.quadraticCurveTo(0, -r * 0.5, r * 0.7, -r * 0.14); c.stroke(); // de ribbel van de lepel
  } else if (n === 'gepofte biet') {
    disc(r * 0.06, r * 0.1, r * 1.32, 'rgba(173,20,87,0.2)'); // sap op het bord
    shadow();
    disc(0, 0, r, ballGrad(c, 0, 0, r, '#e0559a', it.c, '#3a0420'));
    c.strokeStyle = 'rgba(255,160,205,0.28)'; c.lineWidth = r * 0.06;
    for (const k of [0.72, 0.46, 0.2]) { c.beginPath(); c.arc(r * 0.05, r * 0.05, r * k, 0, 7); c.stroke(); }
    gloss(-r * 0.36, -r * 0.42, r * 0.26, r * 0.12, -0.75, 0.65);
  } else if (n === 'jus') {
    // een glanzend plasje saus met een grillige rand
    const pts = Array.from({ length: 10 }, (_, k) => { const a = (k / 10) * 6.283, d = r * (0.82 + q() * 0.3); return [Math.cos(a) * d, Math.sin(a) * d]; });
    const blob = () => blobPath(c, pts);
    c.save(); c.translate(r * 0.05, r * 0.07); c.fillStyle = 'rgba(40,16,4,0.35)'; blob(); c.fill(); c.restore();
    const g = c.createRadialGradient(-r * 0.2, -r * 0.25, r * 0.05, 0, 0, r * 1.1);
    g.addColorStop(0, '#8a5230'); g.addColorStop(0.5, it.c); g.addColorStop(1, '#2a1309');
    c.fillStyle = g; blob(); c.fill();
    c.strokeStyle = 'rgba(150,92,50,0.55)'; c.lineWidth = r * 0.06; blob(); c.stroke();
    gloss(-r * 0.3, -r * 0.36, r * 0.34, r * 0.12, -0.6, 0.6); gloss(r * 0.34, r * 0.3, r * 0.1, r * 0.05, -0.6, 0.35);
  } else if (n === 'bolletje ijs') {
    c.fillStyle = 'rgba(255,244,214,0.8)'; c.beginPath(); c.ellipse(r * 0.1, r * 0.2, r * 1.2, r * 1.02, 0.3, 0, 7); c.fill(); // smeltplasje
    shadow(0.9);
    disc(0, 0, r, ballGrad(c, 0, 0, r, '#ffffff', '#fff2d2', '#cdb57c'));
    c.strokeStyle = 'rgba(176,146,90,0.3)'; c.lineWidth = r * 0.05; c.lineCap = 'round';
    for (let k = 0; k < 7; k++) { const a = q() * 6.28; c.beginPath(); c.arc(Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2, r * (0.35 + q() * 0.5), a, a + 0.7 + q() * 0.6); c.stroke(); } // sporen van de ijsschep
    for (let k = 0; k < 12; k++) { const a = q() * 6.28, d = r * 0.85 * Math.sqrt(q()); disc(Math.cos(a) * d, Math.sin(a) * d, r * 0.028, 'rgba(60,40,20,0.6)'); } // vanille
    gloss(-r * 0.36, -r * 0.42, r * 0.24, r * 0.12, -0.75, 0.75);
  } else if (n === 'chocoladeaarde') {
    softShadow(c, r * 0.12, r * 0.18, r * 1.3, r * 1.15, 0.45);
    const kruim = Array.from({ length: 46 }, () => { const a = q() * 6.28, d = r * 0.86 * Math.sqrt(q()); return [Math.cos(a) * d, Math.sin(a) * d, r * (0.1 + q() * 0.19)]; }).sort((a, b) => b[2] - a[2]);
    for (const [x, y, k] of kruim) {
      disc(x + k * 0.3, y + k * 0.4, k, 'rgba(10,4,2,0.5)');
      disc(x, y, k, ballGrad(c, x, y, k, '#8a6252', q() < 0.5 ? it.c : '#4e342e', '#170c09'));
    }
  } else if (n === 'framboos') {
    shadow();
    disc(0, 0, r, '#8a1414');
    for (let k = 0; k < 8; k++) {
      const a = (k / 7) * 6.283, d = k === 7 ? 0 : r * 0.6, x = Math.cos(a) * d, y = Math.sin(a) * d, b = r * 0.38;
      disc(x, y, b, ballGrad(c, x, y, b, '#ffa39a', it.c, '#7f1212'));
      gloss(x - b * 0.35, y - b * 0.4, b * 0.22, b * 0.14, -0.75, 0.8);
    }
  } else if (n === 'goudblaadje') {
    glow(c, 0, 0, r * 1.75, '255,220,120', 0.3);
    const pts = Array.from({ length: 8 }, (_, k) => { const a = (k / 8) * 6.283, d = r * (0.7 + q() * 0.45); return [Math.cos(a) * d, Math.sin(a) * d]; });
    c.fillStyle = 'rgba(60,40,0,0.35)'; poly(c, pts, r * 0.1, r * 0.14); c.fill();
    const g = c.createLinearGradient(-r, -r, r, r);
    g.addColorStop(0, '#fffad0'); g.addColorStop(0.45, it.c); g.addColorStop(1, '#a87a08');
    c.fillStyle = g; poly(c, pts); c.fill();
    c.lineWidth = r * 0.06;
    pts.forEach((p, k) => { if (k % 2) return; c.strokeStyle = k % 4 ? 'rgba(130,92,6,0.45)' : 'rgba(255,255,240,0.7)'; c.beginPath(); c.moveTo(0, 0); c.lineTo(p[0], p[1]); c.stroke(); });
    // schittering
    c.fillStyle = '#ffffff'; c.beginPath();
    for (let k = 0; k < 8; k++) { const a = (k / 8) * 6.283, d = r * (k % 2 ? 0.1 : 0.55); c.lineTo(-r * 0.25 + Math.cos(a) * d, -r * 0.3 + Math.sin(a) * d); }
    c.closePath(); c.fill();
  } else {
    shadow(); disc(0, 0, r, ballGrad(c, 0, 0, r, tint(it.c, 0.4), it.c, tint(it.c, -0.4)));
  }
}

// De gedekte tafel van Restaurant Atelier, voorgetekend: donker eikenhout in kaarslicht, bestek, een glas wijn
// en het porseleinen bord (zelfde middelpunt en maat als waar de speler op klikt).
function bordScene(L) {
  const { W, H, u, R, cx, cy } = L;
  const korrel = grainTile(128, 11, 0.5);
  return sheet(W, H, (c) => {
    const r = seeded(31);
    // tafelblad: planken met nerven
    let g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2b1f17'); g.addColorStop(1, '#241912');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    const ph = 21 * u;
    for (let y = -r() * ph; y < H; y += ph) {
      c.fillStyle = r() < 0.5 ? `rgba(255,214,160,${r() * 0.05})` : `rgba(0,0,0,${r() * 0.16})`; c.fillRect(0, y, W, ph);
      for (let k = 0; k < 16; k++) {
        const yy = y + r() * ph, wob = (r() - 0.5) * 2.4 * u;
        c.strokeStyle = r() < 0.6 ? `rgba(0,0,0,${0.1 + r() * 0.16})` : `rgba(255,206,150,${0.03 + r() * 0.05})`; c.lineWidth = (0.1 + r() * 0.28) * u;
        c.beginPath(); c.moveTo(0, yy); c.bezierCurveTo(W * 0.3, yy + wob, W * 0.6, yy - wob, W, yy + wob * 0.5); c.stroke();
      }
      if (r() < 0.7) { // een kwast in het hout
        const kx = r() * W, ky = y + ph * (0.3 + r() * 0.4);
        for (let k = 1; k <= 4; k++) { c.strokeStyle = `rgba(0,0,0,${0.22 - k * 0.04})`; c.lineWidth = 0.2 * u; c.beginPath(); c.ellipse(kx, ky, k * 1.5 * u, k * 0.6 * u, 0, 0, 7); c.stroke(); }
      }
      c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(0, y - 0.15 * u, W, 0.3 * u);
      c.fillStyle = 'rgba(255,220,180,0.06)'; c.fillRect(0, y + 0.15 * u, W, 0.2 * u);
    }
    grainFill(c, korrel, 0, 0, W, H, 0.7);
    // warm licht van de kaars linksboven, donker naar de randen
    glow(c, cx - R * 0.7, cy - R * 0.7, Math.max(W, H) * 0.7, '255,196,128', 0.2);
    const ruim = cx - R * 2.45 > 0;
    if (ruim) {
      // waxinelichtje linksboven
      const kx = cx - R * 2.2, ky = cy - R * 0.84, kr = R * 0.15;
      glow(c, kx, ky, R * 1.5, '255,170,72', 0.42);
      softShadow(c, kx + kr * 0.2, ky + kr * 0.3, kr * 1.5, kr * 1.4, 0.5);
      g = c.createLinearGradient(kx - kr, ky - kr, kx + kr, ky + kr); g.addColorStop(0, '#fbfbfb'); g.addColorStop(0.5, '#9aa2a8'); g.addColorStop(1, '#565d63');
      c.fillStyle = g; c.beginPath(); c.arc(kx, ky, kr, 0, 7); c.fill();
      c.fillStyle = ballGrad(c, kx + kr * 0.3, ky + kr * 0.3, kr * 0.84, '#fffbe6', '#f3dfa8', '#c9a45a'); c.beginPath(); c.arc(kx, ky, kr * 0.84, 0, 7); c.fill();
      glow(c, kx, ky, kr * 1.15, '255,226,130', 0.95); glow(c, kx, ky, kr * 0.5, '255,255,240', 1);
      // linnen servet met de vork erop
      const sx = cx - R * 1.62, sw = R * 0.52, shh = R * 1.7;
      c.save(); c.translate(sx, cy + R * 0.04); c.rotate(-0.03);
      c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(-sw / 2 + R * 0.03, -shh / 2 + R * 0.05, sw, shh);
      g = c.createLinearGradient(-sw / 2, -shh / 2, sw / 2, shh / 2); g.addColorStop(0, '#efe9dc'); g.addColorStop(1, '#bdb5a2');
      c.fillStyle = g; c.fillRect(-sw / 2, -shh / 2, sw, shh);
      c.strokeStyle = 'rgba(120,110,90,0.16)'; c.lineWidth = Math.max(1, 0.1 * u); c.beginPath();
      for (let x = -sw / 2; x < sw / 2; x += 0.5 * u) { c.moveTo(x, -shh / 2); c.lineTo(x, shh / 2); }
      for (let y = -shh / 2; y < shh / 2; y += 0.5 * u) { c.moveTo(-sw / 2, y); c.lineTo(sw / 2, y); }
      c.stroke();
      g = c.createLinearGradient(sw * 0.1, 0, sw * 0.24, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(0,0,0,0.14)'); g.addColorStop(0.55, 'rgba(255,255,255,0.3)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(sw * 0.1, -shh / 2, sw * 0.14, shh); // de vouw
      c.restore();
      const zilver = (x0, x1) => { const z = c.createLinearGradient(x0, 0, x1, 0); z.addColorStop(0, '#6c7479'); z.addColorStop(0.35, '#fafbfb'); z.addColorStop(0.6, '#b4bbc0'); z.addColorStop(1, '#5d656a'); return z; };
      const vork = (dx, dy, kleur) => {
        const x = sx - R * 0.04 + dx, t = cy - R * 0.72 + dy, b = cy + R * 0.76 + dy;
        c.fillStyle = kleur || zilver(x - R * 0.08, x + R * 0.08);
        for (let k = 0; k < 4; k++) { c.beginPath(); c.roundRect(x - R * 0.078 + k * R * 0.043, t, R * 0.027, R * 0.34, R * 0.013); c.fill(); } // tanden
        c.beginPath(); c.moveTo(x - R * 0.078, t + R * 0.28); c.lineTo(x + R * 0.078, t + R * 0.28); c.quadraticCurveTo(x + R * 0.078, t + R * 0.5, x + R * 0.02, t + R * 0.56); c.lineTo(x + R * 0.036, b - R * 0.03); c.quadraticCurveTo(x, b + R * 0.02, x - R * 0.036, b - R * 0.03); c.lineTo(x - R * 0.02, t + R * 0.56); c.quadraticCurveTo(x - R * 0.078, t + R * 0.5, x - R * 0.078, t + R * 0.28); c.closePath(); c.fill();
      };
      vork(R * 0.025, R * 0.035, 'rgba(0,0,0,0.4)'); vork(0, 0);
      const mes = (dx, dy, kleur) => {
        const x = cx + R * 1.56 + dx, t = cy - R * 0.76 + dy, b = cy + R * 0.76 + dy, m = cy + R * 0.1 + dy;
        c.fillStyle = kleur || zilver(x - R * 0.06, x + R * 0.09);
        c.beginPath(); c.moveTo(x - R * 0.04, m); c.lineTo(x - R * 0.04, t + R * 0.1); c.quadraticCurveTo(x - R * 0.035, t, x + R * 0.01, t); c.quadraticCurveTo(x + R * 0.1, t + R * 0.3, x + R * 0.06, m); c.closePath(); c.fill(); // lemmet
        if (!kleur) { const h = c.createLinearGradient(x - R * 0.045, 0, x + R * 0.045, 0); h.addColorStop(0, '#50575c'); h.addColorStop(0.4, '#e2e6e8'); h.addColorStop(1, '#474e53'); c.fillStyle = h; }
        c.beginPath(); c.roundRect(x - R * 0.042, m, R * 0.084, b - m, R * 0.04); c.fill(); // heft
        if (!kleur) { c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = Math.max(1, R * 0.008); c.beginPath(); c.moveTo(x - R * 0.022, m - R * 0.02); c.lineTo(x - R * 0.022, t + R * 0.12); c.stroke(); }
      };
      mes(R * 0.025, R * 0.035, 'rgba(0,0,0,0.45)'); mes(0, 0);
      // glas rode wijn (van boven gezien) rechtsboven
      const wx = cx + R * 2.02, wy = cy - R * 0.66, wr = R * 0.3;
      glow(c, wx + wr * 0.9, wy + wr * 1.0, wr * 1.5, '190,30,60', 0.38); // rood licht dat door de wijn op tafel valt
      softShadow(c, wx + wr * 0.4, wy + wr * 0.5, wr * 1.35, wr * 1.3, 0.5);
      c.fillStyle = 'rgba(255,255,255,0.07)'; c.beginPath(); c.arc(wx, wy, wr, 0, 7); c.fill();
      g = c.createRadialGradient(wx + wr * 0.2, wy + wr * 0.25, wr * 0.05, wx, wy, wr * 0.86); g.addColorStop(0, '#7d1028'); g.addColorStop(0.7, '#4a0817'); g.addColorStop(1, '#2a030c');
      c.fillStyle = g; c.beginPath(); c.arc(wx, wy, wr * 0.86, 0, 7); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = wr * 0.045; c.beginPath(); c.arc(wx, wy, wr, 0, 7); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineCap = 'round'; c.lineWidth = wr * 0.07; c.beginPath(); c.arc(wx, wy, wr, Math.PI * 1.08, Math.PI * 1.42); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = wr * 0.05; c.beginPath(); c.arc(wx, wy, wr * 0.7, Math.PI * 1.1, Math.PI * 1.35); c.stroke();
      c.beginPath(); c.arc(wx, wy, wr, Math.PI * 0.2, Math.PI * 0.34); c.stroke();
      c.lineCap = 'butt';
    }
    // donkere hoeken, en een donkere strook bovenaan waar de naam van de gang staat
    const v = c.createRadialGradient(cx, cy, R * 1.2, cx, cy, Math.hypot(W, H) / 2);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.62)');
    c.fillStyle = v; c.fillRect(0, 0, W, H);
    g = c.createLinearGradient(0, 0, 0, H * 0.15); g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H * 0.15);
    // het bord: slagschaduw, brede rand, helling naar de spiegel, glans
    softShadow(c, cx + R * 0.1, cy + R * 0.15, R * 1.42, R * 1.42, 0.85);
    g = c.createLinearGradient(cx - R, cy - R, cx + R, cy + R); g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#f2efe7'); g.addColorStop(1, '#cdc7b9');
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R * 1.12, 0, 7); c.fill();
    c.strokeStyle = 'rgba(110,100,84,0.4)'; c.lineWidth = R * 0.014; c.beginPath(); c.arc(cx, cy, R * 1.113, Math.PI * 0.02, Math.PI * 0.72); c.stroke();
    g = c.createLinearGradient(cx - R * 0.7, cy - R * 0.7, cx + R * 0.7, cy + R * 0.7); g.addColorStop(0, '#c2bbab'); g.addColorStop(0.5, '#e8e4da'); g.addColorStop(1, '#fdfcf9');
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R * 0.95, 0, 7); c.fill(); // de helling vangt licht aan de overkant
    g = c.createRadialGradient(cx + R * 0.15, cy + R * 0.2, R * 0.1, cx, cy, R * 0.88); g.addColorStop(0, '#fbfaf6'); g.addColorStop(0.75, '#f4f1ea'); g.addColorStop(1, '#e7e2d6');
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R * 0.88, 0, 7); c.fill();
    g = c.createLinearGradient(cx - R * 0.62, cy - R * 0.62, cx + R * 0.2, cy + R * 0.2); g.addColorStop(0, 'rgba(96,84,60,0.2)'); g.addColorStop(1, 'rgba(96,84,60,0)');
    c.strokeStyle = g; c.lineWidth = R * 0.07; c.beginPath(); c.arc(cx, cy, R * 0.845, 0, 7); c.stroke(); // schaduw van de rand in de spiegel
    c.lineCap = 'round';
    c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = R * 0.034; c.beginPath(); c.arc(cx, cy, R * 1.035, Math.PI * 1.13, Math.PI * 1.42); c.stroke();
    c.lineWidth = R * 0.02; c.beginPath(); c.arc(cx, cy, R * 1.035, Math.PI * 1.46, Math.PI * 1.51); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = R * 0.02; c.beginPath(); c.arc(cx, cy, R * 0.915, Math.PI * 0.2, Math.PI * 0.36); c.stroke();
    c.lineCap = 'butt';
  });
}

// De chef laat een bord zien; onthoud waar alles ligt en leg het daarna zo precies mogelijk na
// (tik op het bord waar het volgende onderdeel moet). Geeft { ok, scores } terug (0..1 per gang).
export function startBord(g, { show = 4, need = 0.6 } = {}) {
  const ui = overlay(g, 'Borden opmaken', '<canvas class="mini-canvas"></canvas>',
    g.input.isTouch ? 'Kijk goed hoe de chef het bord opmaakt. Tik daarna op het bord waar elk onderdeel hoort.' : 'Kijk goed hoe de chef het bord opmaakt. Klik daarna op het bord waar elk onderdeel hoort.');
  const cv = ui.ov.querySelector('canvas');
  const ctx = cv.getContext('2d');
  fitCanvas(cv);
  const parts = new Particles();
  const look = {}; // voorgetekende tafel en onderdelen, opnieuw gemaakt bij een andere canvasmaat
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
    // tekenen: chique tafel. De tafel en het bord staan voorgetekend klaar, de onderdelen zijn losse plaatjes.
    const sc = keep(look, `${W}x${H}`, () => ({ tafel: bordScene(L), eten: new Map() }));
    ctx.drawImage(sc.tafel, 0, 0);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.font = `italic 700 ${4 * u}px Georgia, serif`;
    const kop = `${co.name}${phase === 'show' ? ': kijk goed!' : phase === 'place' ? ': leg het na' : ''}`;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(kop, W / 2 + 0.25 * u, H * 0.09 + 0.3 * u);
    ctx.fillStyle = '#e3c88f'; ctx.fillText(kop, W / 2, H * 0.09);
    // een onderdeel als plaatje (met ruimte eromheen voor de slagschaduw), één keer getekend per soort
    const sprite = (it) => {
      let sp = sc.eten.get(it.n);
      if (!sp) { const z = it.r * R * 3.6; sp = sheet(z, z, (c, w, h) => { c.translate(w / 2, h / 2); drawFood(c, it, it.r * R); }); sc.eten.set(it.n, sp); }
      return sp;
    };
    const draw = (it, p, alpha = 1) => {
      const sp = sprite(it);
      ctx.globalAlpha = alpha;
      ctx.drawImage(sp, cx + p[0] * R - sp.width / 2, cy + p[1] * R - sp.height / 2);
      ctx.globalAlpha = 1;
    };
    if (phase === 'show') {
      co.items.forEach((it, i) => draw(it, co.pos[i]));
      // de tijd die je nog hebt om te kijken
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(cx - R, cy + R * 1.2, R * 2, 0.8 * u);
      ctx.fillStyle = 'rgba(227,200,143,0.95)'; ctx.fillRect(cx - R, cy + R * 1.2, R * 2 * Math.max(0, 1 - pt / show), 0.8 * u);
      ctx.fillStyle = 'rgba(255,244,214,0.6)'; ctx.fillRect(cx - R, cy + R * 1.2, R * 2 * Math.max(0, 1 - pt / show), 0.25 * u);
    } else {
      placed.forEach((p, i) => draw(co.items[i], p));
      if (phase === 'judge') co.items.forEach((it, i) => { ctx.strokeStyle = 'rgba(227,200,143,0.8)'; ctx.lineWidth = 0.3 * u; ctx.setLineDash([u, u]); ctx.beginPath(); ctx.arc(cx + co.pos[i][0] * R, cy + co.pos[i][1] * R, it.r * R * 1.2, 0, 7); ctx.stroke(); ctx.setLineDash([]); });
      // wat komt er nu?
      if (phase === 'place') {
        const nx = co.items[placed.length];
        if (nx) {
          ctx.font = `700 ${3.2 * u}px Inter, sans-serif`;
          ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(`Leg neer: ${nx.n}`, W / 2 + 0.2 * u, H * 0.95 + 0.25 * u);
          ctx.fillStyle = '#e3c88f'; ctx.fillText(`Leg neer: ${nx.n}`, W / 2, H * 0.95);
          // het onderdeel ligt klaar op een klein schoteltje
          const px = W / 2 - R * 0.95, py = H * 0.94, pr = nx.r * R + R * 0.035;
          ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.arc(px + pr * 0.1, py + pr * 0.14, pr, 0, 7); ctx.fill();
          ctx.fillStyle = '#f4f1ea'; ctx.beginPath(); ctx.arc(px, py, pr, 0, 7); ctx.fill();
          ctx.strokeStyle = 'rgba(150,140,120,0.5)'; ctx.lineWidth = Math.max(1, pr * 0.05); ctx.beginPath(); ctx.arc(px, py, pr * 0.84, 0, 7); ctx.stroke();
          const sp = sprite(nx);
          ctx.drawImage(sp, px - sp.width / 2, py - sp.height / 2);
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

// De bar van de Bierfeesten, voorgetekend: een waas over het feest (zoals eerst), het houten barblad, het lekrooster
// en de koperen tapzuil. Geeft ook de losse onderdelen van het glas terug (druppels, klein vol glas voor op de bar).
function tapScene(ctx, G) {
  const { W, H, u, cxT, gw, gh, gx, gy, tx, ty } = G;
  const korrel = grainTile(128, 23, 0.5);
  const by = gy + gh - 7 * u; // achterrand van het barblad
  const koper = (c, xa, xb) => {
    const g = c.createLinearGradient(xa, 0, xb, 0);
    [[0, '#452010'], [0.12, '#8a4a22'], [0.3, '#f0b584'], [0.4, '#ffe6c8'], [0.52, '#d2864e'], [0.78, '#74391a'], [0.93, '#b26a36'], [1, '#4c240e']].forEach(([p, col]) => g.addColorStop(p, col));
    return g;
  };
  const bar = sheet(W, H, (c) => {
    const r = seeded(1825);
    // de groene waas waar het feest doorheen schemert, met warm licht rond de tap
    let g = c.createLinearGradient(0, H * 0.3, 0, H);
    g.addColorStop(0, 'rgba(14,46,29,0)'); g.addColorStop(0.45, 'rgba(14,46,29,0.75)'); g.addColorStop(1, 'rgba(9,30,19,0.94)');
    c.fillStyle = g; c.fillRect(0, H * 0.3, W, H * 0.7);
    glow(c, cxT, gy + gh * 0.45, gh * 1.5, '255,190,104', 0.22);
    // feestlichtjes, onscherp in de verte
    for (let k = 0; k < 18; k++) glow(c, r() * W * 0.62, H * (0.56 + r() * 0.26), (1.6 + r() * 3) * u, ['255,196,110', '255,120,90', '150,230,150', '255,236,170'][k % 4], 0.1 + r() * 0.1);
    // barblad: donker gelakt hout met spiegeling
    g = c.createLinearGradient(0, by, 0, H); g.addColorStop(0, '#54331c'); g.addColorStop(0.5, '#6a4426'); g.addColorStop(1, '#2c190d');
    c.fillStyle = g; c.fillRect(0, by, W, H - by);
    c.strokeStyle = 'rgba(20,8,0,0.35)'; c.lineWidth = 0.14 * u; c.beginPath();
    for (let k = 0; k < 22; k++) { const yy = by + r() * (H - by), wob = (r() - 0.5) * u; c.moveTo(0, yy); c.bezierCurveTo(W * 0.3, yy + wob, W * 0.6, yy - wob, W, yy + wob); }
    c.stroke();
    grainFill(c, korrel, 0, by, W, H - by, 0.7);
    for (let k = 0; k < 9; k++) { const x = r() * W, w = (3 + r() * 9) * u; g = c.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, 'rgba(255,214,150,0)'); g.addColorStop(0.5, `rgba(255,214,150,${0.08 + r() * 0.1})`); g.addColorStop(1, 'rgba(255,214,150,0)'); c.fillStyle = g; c.fillRect(x, by, w, H - by); }
    c.fillStyle = 'rgba(255,226,180,0.4)'; c.fillRect(0, by, W, 0.22 * u); // lichte achterrand
    g = c.createLinearGradient(0, H - 1.5 * u, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.6)'); c.fillStyle = g; c.fillRect(0, H - 1.5 * u, W, 1.5 * u);
    // de zuil staat achter het glas op het blad
    softShadow(c, tx + 3 * u, by + 1.3 * u, 9 * u, 1.6 * u, 0.55);
    c.fillStyle = koper(c, tx - 5.2 * u, tx + 5.2 * u); c.beginPath(); c.ellipse(tx, by + 0.7 * u, 5.2 * u, 1.3 * u, 0, 0, 7); c.fill(); // voet
    c.fillStyle = 'rgba(40,16,4,0.45)'; c.beginPath(); c.ellipse(tx, by + 0.3 * u, 3.2 * u, 0.7 * u, 0, 0, 7); c.fill();
    c.fillStyle = koper(c, tx - 2.6 * u, tx + 2.6 * u); c.beginPath(); c.roundRect(tx - 2.6 * u, ty - 16 * u, 5.2 * u, by + 0.5 * u - (ty - 16 * u), 1.2 * u); c.fill(); // zuil
    // het feest spiegelt in het koper
    g = c.createLinearGradient(0, ty - 16 * u, 0, by); g.addColorStop(0, 'rgba(255,255,255,0.12)'); g.addColorStop(0.4, 'rgba(30,90,50,0.16)'); g.addColorStop(1, 'rgba(0,0,0,0.3)');
    c.fillStyle = g; c.beginPath(); c.roundRect(tx - 2.6 * u, ty - 16 * u, 5.2 * u, by + 0.5 * u - (ty - 16 * u), 1.2 * u); c.fill();
    // ringen om de zuil
    for (const yy of [ty - 13.2 * u, ty - 3.4 * u]) {
      c.fillStyle = koper(c, tx - 3.1 * u, tx + 3.1 * u); c.beginPath(); c.roundRect(tx - 3.1 * u, yy, 6.2 * u, 1.3 * u, 0.5 * u); c.fill();
      c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(tx - 2.6 * u, yy + 1.3 * u, 5.2 * u, 0.4 * u);
      c.fillStyle = 'rgba(255,240,220,0.35)'; c.fillRect(tx - 2.9 * u, yy + 0.2 * u, 5.8 * u, 0.22 * u);
    }
    // kraantje: verchroomd, steekt naar voren boven het glas
    g = c.createLinearGradient(tx - 1.5 * u, 0, tx + 1.5 * u, 0); g.addColorStop(0, '#59646b'); g.addColorStop(0.35, '#ffffff'); g.addColorStop(0.6, '#aeb9bf'); g.addColorStop(1, '#4c575e');
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.roundRect(tx - 1.2 * u, ty - 1.6 * u, 3.4 * u, 1.5 * u, 0.5 * u); c.fill();
    c.fillStyle = g; c.beginPath(); c.roundRect(tx - 1.6 * u, ty - 2 * u, 3.2 * u, 1.5 * u, 0.5 * u); c.fill();
    c.beginPath(); c.roundRect(tx - 1 * u, ty - 1 * u, 2 * u, 3 * u, 0.6 * u); c.fill();
    c.fillStyle = 'rgba(20,26,30,0.7)'; c.beginPath(); c.ellipse(tx, ty + 2 * u, 0.8 * u, 0.25 * u, 0, 0, 7); c.fill();
    // kop van de zuil
    g = c.createLinearGradient(0, ty - 17.5 * u, 0, ty - 15.9 * u); g.addColorStop(0, '#ffe0bd'); g.addColorStop(0.35, '#c97f48'); g.addColorStop(1, '#5a2b12');
    c.fillStyle = g; c.beginPath(); c.roundRect(tx - 5 * u, ty - 17.5 * u, 10 * u, 1.6 * u, 0.7 * u); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(tx - 4.2 * u, ty - 17.25 * u, 3.4 * u, 0.25 * u);
    // lekrooster onder het glas
    const tr = [[tx - gw * 0.95, by + 1.1 * u], [tx + gw * 0.95, by + 1.1 * u], [tx + gw * 1.12, H - 1.4 * u], [tx - gw * 1.12, H - 1.4 * u]];
    c.fillStyle = 'rgba(0,0,0,0.4)'; poly(c, tr, 0.5 * u, 0.6 * u); c.fill();
    g = c.createLinearGradient(0, by + 1.1 * u, 0, H - 1.4 * u); g.addColorStop(0, '#77838a'); g.addColorStop(0.4, '#dfe5e8'); g.addColorStop(1, '#8a959b');
    c.fillStyle = g; poly(c, tr); c.fill();
    c.strokeStyle = 'rgba(20,26,30,0.6)'; c.lineWidth = 0.3 * u; c.beginPath();
    for (let k = 1; k <= 5; k++) { const f = k / 6, yy = by + 1.1 * u + (H - 2.5 * u - by) * f, hw = gw * (0.95 + 0.17 * f) - 1.2 * u; c.moveTo(tx - hw, yy); c.lineTo(tx + hw, yy); }
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 0.18 * u; c.beginPath(); c.moveTo(tr[0][0], tr[0][1]); c.lineTo(tr[1][0], tr[1][1]); c.stroke();
  });
  // condens op het koude glas
  const dauw = sheet(gw, gh, (c, w, h) => {
    const r = seeded(9);
    for (let k = 0; k < 46; k++) {
      const x = w * (0.08 + r() * 0.84), y = h * (0.04 + r() * 0.92), d = (0.14 + r() * r() * 0.5) * u;
      c.fillStyle = 'rgba(60,30,0,0.22)'; c.beginPath(); c.ellipse(x + d * 0.2, y + d * 0.35, d, d * 1.25, 0, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,246,214,0.3)'; c.beginPath(); c.ellipse(x, y, d, d * 1.25, 0, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); c.arc(x - d * 0.3, y - d * 0.45, d * 0.32, 0, 7); c.fill();
      if (k % 9 === 0) { c.fillStyle = 'rgba(255,250,230,0.16)'; c.fillRect(x - d * 0.35, y, d * 0.7, h * (0.08 + r() * 0.1)); } // een druppel die naar beneden is gelopen
    }
  });
  // klein vol glas voor op de bar: zo zie je hoeveel er al getapt zijn
  const kw = 4.4 * u, kh = 8.2 * u;
  const klein = sheet(kw + 2 * u, kh + 3 * u, (c) => {
    const x = u, y = 1.6 * u, ins = kw * 0.08;
    softShadow(c, x + kw * 0.7, y + kh + 0.3 * u, kw * 0.9, 0.9 * u, 0.5);
    c.fillStyle = '#e9dfc2'; c.beginPath(); c.ellipse(x + kw / 2, y + kh + 0.2 * u, kw * 0.72, 0.75 * u, 0, 0, 7); c.fill(); // bierviltje
    c.strokeStyle = '#1f6b3d'; c.lineWidth = 0.2 * u; c.beginPath(); c.ellipse(x + kw / 2, y + kh + 0.2 * u, kw * 0.6, 0.6 * u, 0, 0, 7); c.stroke();
    const vorm = [[x, y], [x + kw, y], [x + kw - ins, y + kh], [x + ins, y + kh]];
    let g = c.createLinearGradient(x, 0, x + kw, 0); g.addColorStop(0, '#a85c00'); g.addColorStop(0.3, '#ffc93c'); g.addColorStop(0.7, '#f2a516'); g.addColorStop(1, '#9a5200');
    c.save(); poly(c, vorm); c.clip();
    c.fillStyle = g; c.fillRect(x, y + kh * 0.2, kw, kh);
    g = c.createLinearGradient(0, y, 0, y + kh * 0.24); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#f1e2b4');
    c.fillStyle = g; c.fillRect(x, y, kw, kh * 0.24);
    c.restore();
    c.fillStyle = '#fffdf2'; for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(x + kw * (0.14 + k * 0.24), y + 0.1 * u, kw * 0.15, 0, 7); c.fill(); }
    c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 0.22 * u; c.beginPath(); c.moveTo(x, y); c.lineTo(x + ins, y + kh); c.lineTo(x + kw - ins, y + kh); c.lineTo(x + kw, y); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.4)'; c.fillRect(x + kw * 0.16, y + kh * 0.3, kw * 0.1, kh * 0.6);
  });
  // verlopen die elk beeld terugkomen (één keer aangemaakt)
  const bier = ctx.createLinearGradient(gx, 0, gx + gw, 0);
  [[0, '#7e4200'], [0.12, '#d38309'], [0.32, '#ffd24d'], [0.5, '#f8ac1c'], [0.82, '#d27f06'], [0.94, '#b06400'], [1, '#7a3e00']].forEach(([p, col]) => bier.addColorStop(p, col));
  const diepte = ctx.createLinearGradient(0, gy, 0, gy + gh);
  diepte.addColorStop(0, 'rgba(255,236,160,0.2)'); diepte.addColorStop(1, 'rgba(110,48,0,0.38)');
  const schuim = ctx.createLinearGradient(gx, 0, gx + gw, 0);
  schuim.addColorStop(0, '#e2d4ae'); schuim.addColorStop(0.3, '#fffef6'); schuim.addColorStop(0.75, '#f6edcf'); schuim.addColorStop(1, '#d3c298');
  const glans = ctx.createLinearGradient(0, gy, 0, gy + gh);
  glans.addColorStop(0, 'rgba(255,255,255,0)'); glans.addColorStop(0.12, 'rgba(255,255,255,0.5)'); glans.addColorStop(0.7, 'rgba(255,255,255,0.22)'); glans.addColorStop(1, 'rgba(255,255,255,0)');
  const straal = ctx.createLinearGradient(tx - 0.7 * u, 0, tx + 0.7 * u, 0);
  straal.addColorStop(0, '#c77a06'); straal.addColorStop(0.4, '#ffe08a'); straal.addColorStop(1, '#d88a0a');
  return { bar, dauw, klein, kw, kh, by, bier, diepte, schuim, glans, straal };
}

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
  let foamLo = 0.08, foamHi = 0.16, seed = 0, handle = 0;
  const look = {}; // voorgetekende bar en tap, opnieuw gemaakt bij een andere canvasmaat
  let vt = 0; // klok voor de belletjes (alleen uiterlijk)
  // steeds iets sneller, en de tap sputtert een beetje (dus niet elke keer even snel)
  const flow = () => (0.5 + Math.min(0.3, served * 0.035)) * (0.7 + 0.6 * Math.abs(Math.sin(t * 6.3 + seed)));
  const newGlass = () => { beer = 0; foam = 0; target = rnd(0.66, 0.82); foamLo = rnd(0.05, 0.1); foamHi = rnd(0.13, 0.22); seed = Math.random() * 6; glassN++; };
  newGlass();
  const release = () => {
    if (!pouring) return;
    pouring = false;
    if (ok !== null || wait > 0 || beer < 0.05) return;
    const W = cv.width;
    const top = beer + foam;
    const xp = 72, yp = 40;
    const dBeer = beer - target;
    if (top > 1) { fails++; combo.miss(); flash(ui.ov, 'bad'); g.sfx?.play('splash'); popText(ui.ov, 'Over de rand! Dat plakt...', xp, yp, 'bad big'); }
    else if (dBeer < -0.045) { fails++; combo.miss(); flash(ui.ov, 'bad'); g.sfx?.play('fail'); popText(ui.ov, 'Te weinig! Boe!', xp, yp, 'bad big'); }
    else if (dBeer > 0.045) { fails++; combo.miss(); flash(ui.ov, 'bad'); g.sfx?.play('fail'); popText(ui.ov, 'Te vol, geen ruimte voor schuim!', xp, yp, 'bad big'); }
    else if (foam < 0.05) { served++; const c = combo.hit(); popText(ui.ov, c >= 3 ? `Geen schuim, maar goed... x${c}` : 'Plat bier, maar goed', xp, yp, 'good'); g.sfx?.play('clink'); }
    else {
      served++;
      const perfect = Math.abs(dBeer) < 0.015 && foam > 0.08 && foam < 0.13;
      const c = combo.hit();
      popText(ui.ov, perfect ? (c >= 3 ? `PERFECT! x${c}` : 'Perfect getapt!') : (c >= 3 ? `Proost! x${c}` : 'Proost!'), xp, yp, perfect ? 'gold big' : 'good big');
      flash(ui.ov, perfect ? 'gold' : 'good'); g.sfx?.play('clink');
      parts.spawn(W * 0.8, cv.height * 0.6, 14, { color: '#ffe082', speed: 200, up: 160, size: 5 * devicePixelRatio, life: 0.8, shape: 'circle' });
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
      // het schuim verschilt per glas: soms komt er veel, soms weinig
      beer += f * 0.86; foam += f * (beer > 0.4 ? foamHi : foamLo);
      foam = Math.min(foam, 0.24);
      if (beer + foam > 1.06) release();
    }
    // het schuim zakt een beetje in als je wacht
    if (!pouring && wait <= 0) foam = Math.max(0, foam - dt * 0.02);
    // de MC van Feestkabinet roept af en toe wat
    mcT -= dt;
    if (mcT <= 0 && mcLines.length && ok === null) { mcT = rnd(4, 7); popText(ui.ov, `MC: "${mcLines[Math.floor(Math.random() * mcLines.length)]}"`, 50, 14, 'small'); }
    parts.update(dt);
    // tekenen: tap en glas onderin het beeld (het feest blijft erboven zichtbaar).
    // tap en glas rechts in beeld, zodat het podium in het midden vrij blijft
    ctx.clearRect(0, 0, W, H);
    const cxT = W * 0.8;
    const gw = Math.min(W * 0.1, 18 * u), gh = gw * 1.9, gx = cxT - gw / 2, gy = H - gh - 5 * u;
    const tx = cxT, ty = gy - 4 * u;
    const sc = keep(look, `${W}x${H}`, () => tapScene(ctx, { W, H, u, cxT, gw, gh, gx, gy, tx, ty }));
    vt += dt;
    ctx.drawImage(sc.bar, 0, 0);
    // de glazen die al getapt zijn staan op de bar
    for (let k = 0; k < served; k++) ctx.drawImage(sc.klein, (5 + k * 6.3) * u, H - 2.9 * u - sc.kh - 1.6 * u);
    // hendel op de taptoren: kantelt naar voren als je tapt
    handle += ((pouring && wait <= 0 && ok === null ? 1 : 0) - handle) * Math.min(1, dt * 12);
    ctx.save(); ctx.translate(tx, ty - 17.5 * u); ctx.rotate(-0.15 - handle * 0.75);
    const hl = 15 * u, hw = 3.4 * u;
    const hg = ctx.createLinearGradient(-hw / 2, 0, hw / 2, 0);
    hg.addColorStop(0, '#07200f'); hg.addColorStop(0.3, '#2f8a52'); hg.addColorStop(0.55, '#1f6b3d'); hg.addColorStop(1, '#07200f');
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.moveTo(-hw * 0.35, 0); ctx.lineTo(hw * 0.35, 0); ctx.lineTo(hw / 2, -hl); ctx.lineTo(-hw / 2, -hl); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.beginPath(); ctx.moveTo(-hw * 0.2, -0.6 * u); ctx.lineTo(-hw * 0.1, -0.6 * u); ctx.lineTo(-hw * 0.2, -hl + 0.5 * u); ctx.lineTo(-hw * 0.34, -hl + 0.5 * u); ctx.closePath(); ctx.fill(); // glans op het lakwerk
    // koperen kraag onderaan de hendel
    const kg = ctx.createLinearGradient(-hw * 0.5, 0, hw * 0.5, 0);
    kg.addColorStop(0, '#5a2b12'); kg.addColorStop(0.35, '#ffd9b0'); kg.addColorStop(1, '#6e3718');
    ctx.fillStyle = kg; ctx.beginPath(); ctx.roundRect(-hw * 0.45, -1.1 * u, hw * 0.9, 1.5 * u, 0.4 * u); ctx.fill();
    // naamplaatje: tekst past altijd binnen het plaatje
    const pw = hw * 0.86, ph = 7.5 * u;
    const pg = ctx.createLinearGradient(-pw / 2, 0, pw / 2, 0);
    pg.addColorStop(0, '#c9962a'); pg.addColorStop(0.35, '#ffe08a'); pg.addColorStop(1, '#d9a63a');
    ctx.fillStyle = pg; ctx.beginPath(); ctx.roundRect(-pw / 2, -hl + 1.5 * u, pw, ph, 0.6 * u); ctx.fill();
    ctx.save(); ctx.translate(0, -hl + 1.5 * u + ph / 2); ctx.rotate(-Math.PI / 2);
    let fs = 2.4 * u; ctx.font = `900 ${fs}px Inter, sans-serif`;
    const tw = ctx.measureText('GULPENER').width;
    if (tw > ph * 0.88) { fs *= (ph * 0.88) / tw; ctx.font = `900 ${fs}px Inter, sans-serif`; }
    ctx.fillStyle = '#123a24'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('GULPENER', 0, 0);
    ctx.restore();
    ctx.fillStyle = '#0b2a18'; ctx.beginPath(); ctx.arc(0, -hl, hw * 0.55, Math.PI, 0); ctx.fill(); // knop bovenop
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.ellipse(-hw * 0.2, -hl - hw * 0.3, hw * 0.16, hw * 0.08, -0.6, 0, 7); ctx.fill();
    ctx.restore();
    // glas: loopt naar onderen iets smaller toe; de hoogte van het bier en de streep staan precies waar ze stonden
    const ins = gw * 0.07, yb = gy + gh * (1 - beer), yf = gy + gh * (1 - beer - foam);
    const binnen = () => { ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + gw, gy); ctx.lineTo(gx + gw - ins, gy + gh); ctx.lineTo(gx + ins, gy + gh); ctx.closePath(); };
    ctx.fillStyle = 'rgba(6,24,15,0.5)'; binnen(); ctx.fill(); // wat achter het glas staat wordt gedempt
    ctx.fillStyle = 'rgba(225,245,235,0.1)'; binnen(); ctx.fill();
    const stroomt = pouring && wait <= 0 && ok === null;
    if (stroomt) {
      // de straal uit de kraan, met een schuimkraag waar hij in het bier valt
      const sw = 1.2 * u * (0.86 + 0.14 * Math.sin(vt * 40));
      ctx.fillStyle = sc.straal; ctx.fillRect(tx - sw / 2, ty + 2 * u, sw, Math.max(0, yb - ty - 2 * u));
    }
    ctx.save(); binnen(); ctx.clip();
    if (beer > 0) {
      ctx.fillStyle = sc.bier; ctx.fillRect(gx, yb, gw, gy + gh - yb);
      ctx.fillStyle = sc.diepte; ctx.fillRect(gx, yb, gw, gy + gh - yb);
      // belletjes die opstijgen
      ctx.fillStyle = 'rgba(255,246,206,0.6)'; ctx.beginPath();
      for (let k = 0; k < 16; k++) {
        const f = (vt * (0.22 + (k % 5) * 0.07) + k * 0.381) % 1;
        const bx = gx + gw * (0.14 + 0.72 * ((k * 0.618) % 1)) + Math.sin(vt * 3 + k) * 0.2 * u, bby = gy + gh - f * gh * beer, br = (0.16 + (k % 3) * 0.08) * u;
        ctx.moveTo(bx + br, bby); ctx.arc(bx, bby, br, 0, 7);
      }
      ctx.fill();
      if (stroomt) { ctx.fillStyle = 'rgba(255,250,228,0.75)'; ctx.beginPath(); ctx.ellipse(tx, yb + 0.5 * u, 2.6 * u, 1.1 * u, 0, 0, 7); ctx.fill(); }
    }
    if (foam > 0.002) {
      // schuimkraag: romig, met een bobbelige bovenkant. De toppen van de bobbels staan precies op de schuimhoogte
      // en de grens met het bier blijft scherp, zodat je net zo goed kunt aflezen als eerst.
      const n = Math.max(4, Math.round(gw / (1.9 * u))), br = gw / n * 0.62, bol = Math.min(br, (yb - yf) * 0.5);
      ctx.fillStyle = sc.schuim; ctx.fillRect(gx, yf + bol * 0.5, gw, yb - yf - bol * 0.5);
      ctx.beginPath();
      for (let k = 0; k < n; k++) { const bx = gx + (k + 0.5) * gw / n; ctx.moveTo(bx + br, yf + bol); ctx.ellipse(bx, yf + bol, br, bol, 0, 0, 7); }
      ctx.fill();
      ctx.fillStyle = 'rgba(255,232,150,0.5)'; ctx.fillRect(gx, yb, gw, 0.3 * u); // lichte rand bovenaan het bier
      // belletjes in het schuim
      ctx.strokeStyle = 'rgba(190,160,100,0.4)'; ctx.lineWidth = 0.12 * u; ctx.beginPath();
      for (let k = 0; k < 12; k++) { const bx = gx + gw * (0.1 + 0.8 * ((k * 0.377 + glassN * 0.13) % 1)), bby = yf + (yb - yf) * (0.25 + 0.6 * ((k * 0.59) % 1)), q = (0.25 + (k % 3) * 0.14) * u; if (yb - yf > 2.2 * u) { ctx.moveTo(bx + q, bby); ctx.arc(bx, bby, q, 0, 7); } }
      ctx.stroke();
    }
    // condens: alleen waar het koude bier staat
    if (beer > 0.03) { const ky = sc.dauw.height / gh, yd = Math.max(gy, yb); ctx.drawImage(sc.dauw, 0, (yd - gy) * ky, sc.dauw.width, sc.dauw.height - (yd - gy) * ky, gx, yd, gw, gy + gh - yd); }
    ctx.restore();
    // glaswand, dikke bodem en spiegeling
    const bg2 = ctx.createLinearGradient(gx, 0, gx + gw, 0);
    bg2.addColorStop(0, 'rgba(255,255,255,0.75)'); bg2.addColorStop(0.3, 'rgba(210,235,225,0.35)'); bg2.addColorStop(0.75, 'rgba(160,190,180,0.3)'); bg2.addColorStop(1, 'rgba(255,255,255,0.6)');
    ctx.fillStyle = bg2; ctx.beginPath(); ctx.moveTo(gx + ins, gy + gh); ctx.lineTo(gx + gw - ins, gy + gh); ctx.lineTo(gx + gw - ins * 1.1, gy + gh + 1.3 * u); ctx.lineTo(gx + ins * 1.1, gy + gh + 1.3 * u); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 0.5 * u; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + ins, gy + gh); ctx.lineTo(gx + gw - ins, gy + gh); ctx.lineTo(gx + gw, gy); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 0.3 * u; ctx.beginPath(); ctx.ellipse(tx, gy, gw / 2, 0.5 * u, 0, 0, 7); ctx.stroke(); // de rand
    ctx.fillStyle = sc.glans;
    ctx.beginPath(); ctx.moveTo(gx + gw * 0.1, gy + gh * 0.04); ctx.lineTo(gx + gw * 0.2, gy + gh * 0.04); ctx.lineTo(gx + gw * 0.2 + ins * 0.8, gy + gh * 0.93); ctx.lineTo(gx + gw * 0.13 + ins * 0.8, gy + gh * 0.93); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(gx + gw * 0.86, gy + gh * 0.08); ctx.lineTo(gx + gw * 0.9, gy + gh * 0.08); ctx.lineTo(gx + gw * 0.9 - ins * 0.8, gy + gh * 0.8); ctx.lineTo(gx + gw * 0.87 - ins * 0.8, gy + gh * 0.8); ctx.closePath(); ctx.fill();
    // de streep
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1.1 * u;
    ctx.beginPath(); ctx.moveTo(gx - 3 * u, gy + gh * (1 - target)); ctx.lineTo(gx + gw + 3 * u, gy + gh * (1 - target)); ctx.stroke();
    ctx.strokeStyle = '#e53935'; ctx.lineWidth = 0.6 * u;
    ctx.beginPath(); ctx.moveTo(gx - 3 * u, gy + gh * (1 - target)); ctx.lineTo(gx + gw + 3 * u, gy + gh * (1 - target)); ctx.stroke();
    ctx.font = `600 ${2.4 * u}px Inter, sans-serif`; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 0.6 * u; ctx.strokeText('bier tot hier', gx - 4 * u, gy + gh * (1 - target) + u);
    ctx.fillStyle = '#fff'; ctx.fillText('bier tot hier', gx - 4 * u, gy + gh * (1 - target) + u);
    if (beer + foam > 1) {
      // over de rand: schuim op het glas en druipers langs de buitenkant
      ctx.fillStyle = '#fffde7'; ctx.beginPath(); ctx.roundRect(gx - 2 * u, gy - 1 * u, gw + 4 * u, 2 * u, u); ctx.fill();
      ctx.beginPath();
      for (let k = 0; k < 7; k++) { const bx = gx - 1.2 * u + (k / 6) * (gw + 2.4 * u); ctx.moveTo(bx + 1.5 * u, gy - 0.9 * u); ctx.arc(bx, gy - 0.9 * u, (1.2 + (k % 2) * 0.4) * u, 0, 7); }
      ctx.roundRect(gx - 1.5 * u, gy, 1.5 * u, gh * 0.3, 0.7 * u); ctx.roundRect(gx + gw - 0.2 * u, gy, 1.4 * u, gh * 0.48, 0.7 * u); ctx.roundRect(gx + gw * 0.3, gy, 1.2 * u, gh * 0.2, 0.6 * u);
      ctx.fill();
      ctx.fillStyle = 'rgba(214,190,130,0.45)'; ctx.fillRect(gx - 1.6 * u, gy + 0.6 * u, gw + 3.2 * u, 0.4 * u);
    }
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

// Eén dier rond (0, 0) met maat s. Zelfde bouw, plek en kleuren als eerst (de korenwolf blijft bruin met een zwarte buik
// en witte vlekken), maar nu met ronding, vacht, pootjes, een oog dat oplicht in de flits en een schaduw op de grond.
function drawAnimal(c, kind, s) {
  const q = seeded(kind.length * 31 + 7);
  // bolle vorm: de flits komt van voren, dus het midden is licht en de randen vallen weg
  const el = (cx, cy, rx, ry, col, rot = 0, lift = 0.3, edge = -0.5) => {
    c.save(); c.translate(cx * s, cy * s); c.rotate(rot); c.scale(rx * s, ry * s);
    const g = c.createRadialGradient(-0.15, -0.45, 0, 0, 0, 1);
    g.addColorStop(0, tint(col, lift)); g.addColorStop(0.6, col); g.addColorStop(1, tint(col, edge));
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, 1, 0, 7); c.fill(); c.restore();
  };
  const fur = (cx, cy, rx, ry, n) => {
    c.lineWidth = Math.max(1, s * 0.008); c.lineCap = 'round';
    for (const col of ['rgba(255,240,215,0.22)', 'rgba(0,0,0,0.2)']) {
      c.strokeStyle = col; c.beginPath();
      for (let k = 0; k < n; k++) { const a = q() * 6.28, d = Math.sqrt(q()) * 0.9, x = (cx + Math.cos(a) * d * rx) * s, y = (cy + Math.sin(a) * d * ry) * s; c.moveTo(x, y); c.lineTo(x - s * 0.04, y + s * (q() - 0.3) * 0.03); }
      c.stroke();
    }
  };
  const eye = (x, y, r, shine) => {
    if (shine) glow(c, x * s, y * s, r * s * 3.2, shine, 0.85);
    c.fillStyle = shine ? `rgb(${shine})` : '#000'; c.beginPath(); c.arc(x * s, y * s, r * s, 0, 7); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc((x - r * 0.3) * s, (y - r * 0.35) * s, r * s * 0.38, 0, 7); c.fill();
  };
  const line = (pts, col, w) => { c.strokeStyle = col; c.lineWidth = w * s; c.lineCap = 'round'; c.beginPath(); c.moveTo(pts[0] * s, pts[1] * s); if (pts.length > 4) c.quadraticCurveTo(pts[2] * s, pts[3] * s, pts[4] * s, pts[5] * s); else c.lineTo(pts[2] * s, pts[3] * s); c.stroke(); };
  const tri = (pts, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(pts[0] * s, pts[1] * s); c.lineTo(pts[2] * s, pts[3] * s); c.lineTo(pts[4] * s, pts[5] * s); c.closePath(); c.fill(); };
  const snor = (x, y) => { for (const d of [-0.05, 0, 0.05]) line([x, y, x + 0.1, y + d], 'rgba(255,255,255,0.45)', 0.006); };
  const WIT = '#f5f5f5';
  if (kind === 'korenwolf') {
    // bruine rug, zwarte buik, witte vlekken op wangen en flank
    softShadow(c, 0, 0.3 * s, 0.54 * s, 0.075 * s, 0.6);
    el(-0.24, 0.27, 0.085, 0.04, '#efe9dc', 0, 0.2, -0.25); el(0.2, 0.28, 0.07, 0.035, '#efe9dc', 0, 0.2, -0.25); // witte pootjes
    el(-0.43, 0.04, 0.05, 0.035, '#8d5a2b');
    el(0, 0, 0.42, 0.28, '#8d5a2b'); fur(0, -0.08, 0.38, 0.18, 44);
    el(0, 0.12, 0.34, 0.14, '#111', 0, 0.1, -0.3);
    el(0.36, -0.06, 0.18, 0.16, '#8d5a2b');
    el(0.4, 0.02, 0.08, 0.06, WIT, 0, 0.3, -0.12);
    el(-0.1, -0.02, 0.1, 0.07, WIT, 0, 0.3, -0.12);
    el(0.34, -0.2, 0.05, 0.05, '#8d5a2b'); el(0.34, -0.195, 0.027, 0.029, '#4a2c14', 0, 0.1, -0.3);
    el(0.525, -0.04, 0.018, 0.015, '#3a2018', 0, 0.3, -0.2);
    eye(0.47, -0.08, 0.02); snor(0.49, -0.01);
  } else if (kind === 'konijn' || kind === 'haas') {
    const col = kind === 'haas' ? '#9c7a4f' : '#9e9e9e', eh = kind === 'haas' ? 0.22 : 0.17;
    softShadow(c, 0, 0.27 * s, 0.48 * s, 0.07 * s, 0.6);
    el(0.3, -0.42, 0.04, eh, col, -0.2, 0.1);
    el(-0.16, 0.23, 0.14, 0.04, col); el(0.2, 0.23, 0.06, 0.04, col);
    el(0, 0, 0.36, 0.26, col); fur(0, -0.04, 0.32, 0.2, 40);
    el(-0.14, 0.06, 0.2, 0.17, col, 0, 0.36, -0.3); // dij
    el(0.32, -0.14, 0.15, 0.13, col);
    el(0.38, -0.4, 0.04, eh, col, 0.2); el(0.383, -0.39, 0.017, eh * 0.7, kind === 'haas' ? '#6e5234' : '#c4a8a0', 0.2, 0.15, -0.2);
    if (kind === 'haas') { el(0.42, -0.6, 0.03, 0.035, '#1a1a1a', 0.2, 0.15); el(0.262, -0.62, 0.03, 0.035, '#1a1a1a', -0.2, 0.15); } // zwarte oorpunten
    el(-0.36, -0.06, 0.07, 0.07, '#eeeeee', 0, 0.3, -0.15);
    el(0.462, -0.12, 0.014, 0.012, '#5a3a34'); eye(0.37, -0.17, 0.022, '235,255,225'); snor(0.43, -0.09);
  } else if (kind === 'kat') {
    const col = '#424242';
    softShadow(c, 0.02 * s, 0.31 * s, 0.5 * s, 0.07 * s, 0.6);
    el(-0.27, 0.2, 0.04, 0.11, '#353535'); el(0.21, 0.21, 0.04, 0.1, '#353535');
    line([-0.38, 0, -0.6, -0.1, -0.55, -0.4], col, 0.06); line([-0.4, -0.02, -0.59, -0.1, -0.565, -0.38], 'rgba(255,255,255,0.14)', 0.018);
    el(0, 0, 0.4, 0.2, col); fur(0, -0.03, 0.36, 0.15, 40);
    el(-0.17, 0.21, 0.04, 0.1, col); el(0.29, 0.2, 0.04, 0.11, col);
    el(0.4, -0.14, 0.14, 0.13, col);
    tri([0.32, -0.24, 0.36, -0.36, 0.42, -0.25], col); tri([0.42, -0.24, 0.48, -0.36, 0.52, -0.22], col); tri([0.44, -0.25, 0.478, -0.325, 0.5, -0.24], '#7a6a66');
    el(0.53, -0.12, 0.012, 0.01, '#8a6a66'); eye(0.44, -0.16, 0.024, '198,255,0'); snor(0.5, -0.1);
  } else if (kind === 'egel') {
    softShadow(c, 0.02 * s, 0.15 * s, 0.48 * s, 0.05 * s, 0.6);
    el(-0.2, 0.13, 0.05, 0.022, '#6d5247'); el(0.22, 0.13, 0.05, 0.022, '#6d5247');
    const g = c.createLinearGradient(0, -0.34 * s, 0, 0.05 * s); g.addColorStop(0, '#7a584a'); g.addColorStop(1, '#3e2a22');
    c.fillStyle = g;
    c.beginPath(); for (let k = 0; k <= 16; k++) { const a = Math.PI + (k / 16) * Math.PI; const r = k % 2 ? 0.3 : 0.4; c.lineTo(Math.cos(a) * r * s, Math.sin(a) * r * 0.8 * s); } c.fill();
    // stekels: lichte punten die de flits vangen
    c.lineCap = 'round'; c.lineWidth = Math.max(1, s * 0.012);
    for (const col of ['rgba(30,18,12,0.55)', 'rgba(236,218,184,0.7)']) {
      c.strokeStyle = col; c.beginPath();
      for (let k = 0; k < 60; k++) { const a = Math.PI + (0.04 + q() * 0.92) * Math.PI, r0 = 0.08 + q() * 0.22, r1 = r0 + 0.07; c.moveTo(Math.cos(a) * r0 * s, Math.sin(a) * r0 * 0.8 * s); c.lineTo(Math.cos(a - 0.12) * r1 * s, Math.sin(a - 0.12) * r1 * 0.8 * s); }
      c.stroke();
    }
    el(0, 0.02, 0.36, 0.12, '#8d6e63'); el(0.36, 0.02, 0.1, 0.07, '#bcaaa4'); el(0.3, -0.035, 0.03, 0.035, '#7a5c50');
    el(0.46, 0.02, 0.02, 0.02, '#000', 0, 0.35); eye(0.385, -0.005, 0.013);
  } else if (kind === 'veldmuis') {
    const col = '#7b6a58';
    softShadow(c, 0, 0.2 * s, 0.27 * s, 0.035 * s, 0.6);
    line([-0.17, 0.1, -0.35, 0.2, -0.4, 0.05], col, 0.02); line([-0.17, 0.095, -0.35, 0.19, -0.4, 0.045], 'rgba(255,225,205,0.3)', 0.007);
    el(-0.08, 0.185, 0.035, 0.012, '#cdb8a8'); el(0.1, 0.185, 0.035, 0.012, '#cdb8a8');
    el(0, 0.08, 0.18, 0.11, col); fur(0, 0.06, 0.15, 0.08, 16);
    el(0.16, 0.04, 0.08, 0.07, col); el(0.14, -0.04, 0.04, 0.04, col); el(0.14, -0.038, 0.022, 0.023, '#b08a7a', 0, 0.2, -0.2);
    el(0.238, 0.05, 0.01, 0.01, '#3a2a22'); eye(0.19, 0.02, 0.012);
  } else if (kind === 'vos') {
    const col = '#d35400', zw = '#1c1612';
    softShadow(c, -0.05 * s, 0.32 * s, 0.62 * s, 0.07 * s, 0.6);
    el(-0.28, 0.2, 0.035, 0.13, zw, 0, 0.2); el(0.22, 0.21, 0.035, 0.12, zw, 0, 0.2);
    el(-0.5, 0.02, 0.22, 0.08, col, -0.3); el(-0.68, 0.06, 0.06, 0.05, '#ffffff', 0, 0.2, -0.15);
    el(0, 0, 0.42, 0.18, col); fur(0, -0.03, 0.38, 0.13, 40);
    el(-0.2, 0.21, 0.035, 0.12, zw, 0, 0.25); el(0.3, 0.2, 0.035, 0.13, zw, 0, 0.25);
    el(0.3, 0.05, 0.1, 0.085, '#f1e6d8', 0, 0.2, -0.2); // witte borst
    el(0.42, -0.1, 0.16, 0.11, col);
    tri([0.38, -0.18, 0.42, -0.34, 0.48, -0.18], col); tri([0.405, -0.28, 0.42, -0.34, 0.443, -0.28], zw);
    el(0.52, -0.04, 0.06, 0.04, '#ffffff', 0, 0.2, -0.15); el(0.575, -0.045, 0.016, 0.014, '#111');
    eye(0.45, -0.13, 0.018, '235,255,225');
  } else if (kind === 'merel') {
    softShadow(c, 0, 0.25 * s, 0.27 * s, 0.035 * s, 0.6);
    for (const x of [-0.02, 0.06]) { line([x, 0.1, x + 0.01, 0.245], '#4a3410', 0.014); line([x + 0.01, 0.245, x + 0.06, 0.25], '#4a3410', 0.012); }
    el(-0.22, 0.04, 0.12, 0.04, '#111', 0.3, 0.2);
    el(0, 0, 0.2, 0.13, '#111', 0, 0.24); line([-0.14, 0.0, -0.02, 0.09, 0.1, 0.03], 'rgba(140,140,155,0.45)', 0.012); // vleugel
    el(0.18, -0.1, 0.08, 0.07, '#111', 0, 0.24);
    const g = c.createLinearGradient(0, -0.11 * s, 0, -0.07 * s); g.addColorStop(0, '#ffd04a'); g.addColorStop(1, '#d98a00');
    c.fillStyle = g; c.beginPath(); c.moveTo(0.25 * s, -0.11 * s); c.lineTo(0.34 * s, -0.09 * s); c.lineTo(0.25 * s, -0.07 * s); c.fill();
    el(0.205, -0.115, 0.021, 0.021, '#ffb300', 0, 0.3, -0.2); eye(0.205, -0.115, 0.012);
  }
}

// Het dier als los plaatje (één keer per foto getekend). Bij de wazige foto wordt het hele plaatje in één keer
// onscherp gemaakt, met dezelfde sterkte als eerst (waar de browser dat niet kan, blijft het scherp, net als eerst).
function animalSprite(kind, s, blur) {
  const w = s * 2.1, h = s * 1.6, raw = sheet(w, h, (c) => { c.translate(s * 1.05, s * 0.95); drawAnimal(c, kind, s); });
  // twee keer over elkaar: zo blijft de omtrek van het wazige dier net zo stevig als bij de oude platte vormen
  const cv = blur ? sheet(w, h, (c) => { c.filter = `blur(${Math.round(s * 0.05)}px)`; c.drawImage(raw, 0, 0); c.drawImage(raw, 0, 0); }) : raw;
  return { cv, ox: s * 1.05, oy: s * 0.95 };
}

// De plek waar een wildcamera hangt: de rand van een graanveld bij nacht, in het licht van de infraroodflits.
// Dichtbij licht, in de verte donker; de voren van de akker lopen naar één punt. Getekend op kleinere maat (k) en
// daarna opgerekt: dat scheelt geheugen en geeft de achtergrond de onscherpte van een nachtfoto.
function fotoScene(v, fw, fh, u, k) {
  const w = fw * k, h = fh * k, un = u * k, r = seeded(100 + v * 17);
  const hz = h * (0.3 + v * 0.03), vx = w * (0.5 + (v - 1) * 0.12);
  return sheet(w, h, (c) => {
    let g = c.createLinearGradient(0, 0, 0, hz); g.addColorStop(0, '#060805'); g.addColorStop(1, '#141a10');
    c.fillStyle = g; c.fillRect(0, 0, w, hz);
    g = c.createLinearGradient(0, hz, 0, h); g.addColorStop(0, '#1a2214'); g.addColorStop(0.3, '#46533a'); g.addColorStop(1, '#8a9a6e');
    c.fillStyle = g; c.fillRect(0, hz, w, h - hz);
    // bosrand in de verte
    c.fillStyle = '#0b0f09'; c.beginPath(); c.moveTo(0, hz);
    for (let x = 0; x <= w; x += w / 40) c.lineTo(x, hz - h * (0.03 + r() * 0.07 + (v === 2 ? 0.05 : 0)));
    c.lineTo(w, hz); c.closePath(); c.fill();
    // voren
    c.fillStyle = 'rgba(16,22,10,0.13)';
    for (let i = -10; i <= 10; i++) { c.beginPath(); c.moveTo(vx + i * w * 0.012, hz); c.lineTo(vx + i * w * 0.17 - w * 0.02, h); c.lineTo(vx + i * w * 0.17 + w * 0.02, h); c.closePath(); c.fill(); }
    // stoppels en gras: verder weg kleiner en donkerder
    for (let pass = 0; pass < 4; pass++) {
      const d0 = pass / 4, a = 0.14 + pass * 0.13;
      c.strokeStyle = `rgba(206,216,164,${a})`; c.lineWidth = Math.max(0.6, 0.38 * un * (0.25 + d0)); c.beginPath();
      for (let i = 0; i < 260; i++) { const d = d0 + r() * 0.25, x = r() * w, y = hz + (h - hz) * d * d * 1.02, l = (1.2 + r() * 3.4) * un * (0.2 + d); c.moveTo(x, y); c.lineTo(x + (r() - 0.5) * l * 0.7, y - l); }
      c.stroke();
    }
    // kluiten met een schaduwkant
    for (let i = 0; i < 70; i++) {
      const d = 0.15 + r() * 0.85, x = r() * w, y = hz + (h - hz) * d, pr = (0.3 + r() * 0.9) * un * d;
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(x, y + pr * 0.5, pr * 1.2, pr * 0.5, 0, 0, 7); c.fill();
      c.fillStyle = `rgba(${150 + r() * 50},${160 + r() * 50},${120 + r() * 30},${0.35 + d * 0.4})`; c.beginPath(); c.ellipse(x, y, pr, pr * 0.65, 0, 0, 7); c.fill();
    }
    // graanhalmen met aren: een rij achteraan, en hogere halmen links en rechts dichterbij
    const halm = (x, y, len, a, wd) => {
      const lean = (r() - 0.5) * len * 0.35;
      c.strokeStyle = `rgba(196,206,150,${a})`; c.lineWidth = wd; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + lean * 0.3, y - len * 0.6, x + lean, y - len); c.stroke();
      c.fillStyle = `rgba(222,228,176,${a})`; c.beginPath(); c.ellipse(x + lean * 1.05, y - len * 1.04, wd * 1.5, len * 0.1, lean / len, 0, 7); c.fill();
    };
    for (let i = 0; i < 70; i++) halm(r() * w, hz + r() * h * 0.05, h * (0.1 + r() * 0.12), 0.22 + r() * 0.2, Math.max(0.6, 0.22 * un));
    for (let i = 0; i < 26; i++) { const side = i % 2 ? r() * 0.13 : 1 - r() * 0.13, d = 0.3 + r() * 0.5; halm(side * w, hz + (h - hz) * d, h * (0.3 + r() * 0.2) * (0.5 + d * 0.6), 0.4 + d * 0.3, Math.max(0.8, 0.5 * un * d)); }
    // de lichtvlek van de flits
    glow(c, w / 2, h * 0.74, w * 0.5, '232,240,196', 0.26, h * 0.36);
  });
}

// Wat over elke foto heen ligt: onscherpe sprieten vlak voor de lens, donkere hoeken (de flits reikt niet ver),
// beeldlijnen en de groene zweem van een nachtopname.
function fotoVoor(fw, fh, u, k) {
  const w = fw * k, h = fh * k, un = u * k, r = seeded(5);
  return sheet(w, h, (c) => {
    for (let i = 0; i < 15; i++) {
      const x = r() * w, len = h * (0.06 + r() * 0.1), lean = (r() - 0.5) * len * 1.4, wd = (0.9 + r() * 1.3) * un;
      for (const [m, a] of [[2.2, 0.1], [1.4, 0.16], [0.7, 0.3]]) { c.strokeStyle = `rgba(222,232,188,${a})`; c.lineWidth = wd * m; c.lineCap = 'round'; c.beginPath(); c.moveTo(x, h + wd); c.quadraticCurveTo(x + lean * 0.2, h - len * 0.6, x + lean, h - len); c.stroke(); }
    }
    const g = c.createRadialGradient(w / 2, h * 0.64, h * 0.34, w / 2, h * 0.64, w * 0.66);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.6, 'rgba(0,0,0,0.42)'); g.addColorStop(1, 'rgba(0,0,0,0.86)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(0,0,0,0.05)'; for (let y = 0; y < h; y += Math.max(2, Math.round(0.5 * un))) c.fillRect(0, y, w, Math.max(1, Math.round(0.2 * un)));
    c.fillStyle = 'rgba(96,150,70,0.15)'; c.fillRect(0, 0, w, h);
  });
}

// De behuizing van de wildcamera rond het schermpje.
function cameraKast(W, H, u, fx, fy, fw, fh) {
  return sheet(W, H, (c) => {
    const r = seeded(63);
    let g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#20251b'); g.addColorStop(0.5, '#13160f'); g.addColorStop(1, '#080907');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 16; i++) glow(c, r() * W, r() * H, (8 + r() * 16) * u, r() < 0.5 ? '78,92,54' : '0,0,0', 0.14); // camouflage
    grainFill(c, grainTile(128, 3, 0.5), 0, 0, W, H, 0.6);
    // verzonken scherm met afgeschuinde rand
    const b = 1.5 * u;
    c.fillStyle = '#040504'; c.beginPath(); c.roundRect(fx - b, fy - b, fw + 2 * b, fh + 2 * b, 1.2 * u); c.fill();
    c.lineWidth = 0.35 * u; c.lineCap = 'round';
    c.strokeStyle = 'rgba(0,0,0,0.85)'; c.beginPath(); c.moveTo(fx - b, fy + fh + b - u); c.lineTo(fx - b, fy - b + u); c.quadraticCurveTo(fx - b, fy - b, fx - b + u, fy - b); c.lineTo(fx + fw + b - u, fy - b); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.14)'; c.beginPath(); c.moveTo(fx + fw + b, fy - b + u); c.lineTo(fx + fw + b, fy + fh + b - u); c.quadraticCurveTo(fx + fw + b, fy + fh + b, fx + fw + b - u, fy + fh + b); c.lineTo(fx - b + u, fy + fh + b); c.stroke();
    if (fx > 9 * u) {
      // schroeven en het rode opnamelampje
      for (const [x, y] of [[fx / 2, fy + 2 * u], [fx / 2, fy + fh - 2 * u], [W - fx / 2, fy + 2 * u], [W - fx / 2, fy + fh - 2 * u]]) {
        c.fillStyle = 'rgba(0,0,0,0.6)'; c.beginPath(); c.arc(x + 0.2 * u, y + 0.3 * u, 1.1 * u, 0, 7); c.fill();
        c.fillStyle = ballGrad(c, x, y, u, '#8a9280', '#3c4236', '#14170f'); c.beginPath(); c.arc(x, y, u, 0, 7); c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.7)'; c.lineWidth = 0.25 * u; c.beginPath(); c.moveTo(x - 0.55 * u, y - 0.3 * u); c.lineTo(x + 0.55 * u, y + 0.3 * u); c.stroke();
      }
      glow(c, fx / 2, fy + fh / 2, 2.6 * u, '255,50,36', 0.55);
      c.fillStyle = ballGrad(c, fx / 2, fy + fh / 2, 0.7 * u, '#ffd2c8', '#ff4a36', '#8a1208'); c.beginPath(); c.arc(fx / 2, fy + fh / 2, 0.7 * u, 0, 7); c.fill();
    }
  });
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
  const look = {}, noise = seeded(404); // voorgetekende beelden en de toevalsgenerator voor de fotokorrel (alleen uiterlijk)
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
    // tekenen: nachtfoto met flits (groenig, korrelig) en een tijdstempel.
    // De behuizing, de drie cameraplekken en het dier staan als plaatjes klaar; per beeld komt alleen de korrel erbij.
    const p = list[Math.min(i, list.length - 1)];
    const fx = W * 0.1, fy = H * 0.12, fw = W * 0.8, fh = H * 0.66;
    const sc = keep(look, `${W}x${H}`, () => {
      const k = fw > 1100 ? 0.5 : 1, ruis = sheet(256, 256, (c) => { c.imageSmoothingEnabled = false; c.drawImage(grainTile(128, 99, 0.15), 0, 0, 256, 256); });
      return { kast: cameraKast(W, H, u, fx, fy, fw, fh), plek: [0, 1, 2].map((v) => fotoScene(v, fw, fh, u, k)), voor: fotoVoor(fw, fh, u, k), ruis: ctx.createPattern(ruis, 'repeat'), dier: {} };
    });
    ctx.drawImage(sc.kast, 0, 0);
    ctx.drawImage(sc.plek[Math.min(i, list.length - 1) % 3], fx, fy, fw, fh); // elke camera hangt op een andere plek
    if (p.kind !== 'leeg') {
      const sp = keep(sc.dier, list.indexOf(p), () => animalSprite(p.kind, fh * 0.32 * p.s, p.blur));
      ctx.save();
      if (p.flip) { ctx.translate(W, 0); ctx.scale(-1, 1); }
      ctx.drawImage(sp.cv, fx + p.x * fw - sp.ox, fy + p.y * fh - sp.oy);
      ctx.restore();
    }
    ctx.drawImage(sc.voor, fx, fy, fw, fh);
    // korrel: dezelfde ruistegel, elk beeld op een andere plek
    const ox = Math.floor(noise() * 256), oy = Math.floor(noise() * 256);
    ctx.translate(fx - ox, fy - oy); ctx.fillStyle = sc.ruis; ctx.fillRect(ox, oy, fw, fh); ctx.setTransform(1, 0, 0, 1, 0, 0);
    // gegevensbalk onderin de foto, zoals bij een echte wildcamera
    ctx.fillStyle = 'rgba(0,0,0,0.62)'; ctx.fillRect(fx, fy + fh - 4.4 * u, fw, 4.4 * u);
    ctx.fillStyle = '#e0e0e0'; ctx.font = `600 ${2.6 * u}px monospace`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(`CAM ${1 + (i % 3)}   03:${String(10 + i * 3).padStart(2, '0')}   foto ${i + 1}/${list.length}`, fx + u, fy + fh - 1.5 * u);
    // maantje en batterij rechts in de balk
    const ix = fx + fw - 3 * u, iy = fy + fh - 2.2 * u;
    ctx.strokeStyle = '#e0e0e0'; ctx.lineWidth = 0.3 * u; ctx.strokeRect(ix - 3.4 * u, iy - 0.9 * u, 3.4 * u, 1.8 * u);
    ctx.fillStyle = '#e0e0e0'; ctx.fillRect(ix, iy - 0.4 * u, 0.4 * u, 0.8 * u); ctx.fillRect(ix - 3 * u, iy - 0.5 * u, 1.9 * u, 1 * u);
    ctx.beginPath(); ctx.arc(ix - 6.4 * u, iy, 1 * u, 0.6, Math.PI * 2 - 0.6); ctx.arc(ix - 5.9 * u, iy, 0.75 * u, Math.PI * 2 - 0.85, 0.85, true); ctx.fill();
    // hoe lang deze foto nog blijft staan
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(fx, fy + fh + u, fw, 0.6 * u);
    ctx.fillStyle = 'rgba(214,228,170,0.6)'; ctx.fillRect(fx, fy + fh + u, fw * Math.min(1, pt / dur()), 0.6 * u);
    ui.score(`🐹 ${caught} / ${wolves}  ·  fout: ${'✗'.repeat(wrong)}${'·'.repeat(Math.max(0, maxFalse - wrong))}`);
  }, () => { ui.close(); removeEventListener('keydown', kd); g.player.lockedFor = false; }, {
    label: null, call, get kind() { return list[i]?.kind; }, get index() { return i; },
  });
}

// ------------------------------------------------------------ forellen scheppen

// De kweekvijver, voorgetekend: de bodem met grind die door het water schemert, donkere diepe plekken, de houten
// steiger bovenaan met zijn schaduw op het water, een tegel met lichtvlekken (caustics) en de forellen als plaatjes.
function vijverScene(ctx, W, H, u) {
  const korrel = grainTile(128, 41, 0.5);
  const bodem = sheet(W, H, (c) => {
    const r = seeded(58);
    let g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#3d858c'); g.addColorStop(0.5, '#2e6b7a'); g.addColorStop(1, '#215566');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // grind op de bodem, vaag door het water
    const n = Math.min(3200, (W * H) / (u * u * 7));
    for (let k = 0; k < n; k++) {
      const x = r() * W, y = H * 0.1 + r() * H * 0.9, rx = (0.6 + r() * 1.5) * u, ry = rx * (0.55 + r() * 0.4), rot = r() * 3;
      c.fillStyle = `rgba(8,34,44,${0.1 + r() * 0.1})`; c.beginPath(); c.ellipse(x + rx * 0.25, y + ry * 0.4, rx, ry, rot, 0, 7); c.fill();
      c.fillStyle = [`rgba(176,198,180,`, `rgba(98,132,134,`, `rgba(214,222,190,`, `rgba(140,150,120,`][k % 4] + (0.1 + r() * 0.14) + ')';
      c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, 7); c.fill();
    }
    // diepe plekken en ondiepe, lichtere plekken
    for (let k = 0; k < 12; k++) glow(c, r() * W, H * (0.2 + r() * 0.8), (12 + r() * 22) * u, k % 3 ? '8,40,52' : '120,190,180', k % 3 ? 0.3 : 0.14, (8 + r() * 10) * u);
    // waterplanten langs de randen
    c.lineCap = 'round';
    for (let k = 0; k < 9; k++) {
      const x = k % 2 ? r() * W * 0.12 : W - r() * W * 0.12, y = H * (0.3 + r() * 0.65);
      for (let j = 0; j < 9; j++) { const a = r() * 6.28, l = (3 + r() * 5) * u; c.strokeStyle = `rgba(${20 + r() * 30},${70 + r() * 40},${50 + r() * 20},0.4)`; c.lineWidth = (0.5 + r() * 0.6) * u; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (r() - 0.5) * 3 * u, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke(); }
    }
    grainFill(c, korrel, 0, 0, W, H, 0.45);
    // donkerder naar de randen: daar is het dieper en valt minder licht
    const v = c.createRadialGradient(W / 2, H * 0.55, H * 0.3, W / 2, H * 0.55, Math.hypot(W, H) * 0.56);
    v.addColorStop(0, 'rgba(4,24,34,0)'); v.addColorStop(1, 'rgba(4,24,34,0.5)');
    c.fillStyle = v; c.fillRect(0, 0, W, H);
    // schaduw van de steiger op het water
    g = c.createLinearGradient(0, H * 0.12, 0, H * 0.2); g.addColorStop(0, 'rgba(2,18,24,0.62)'); g.addColorStop(1, 'rgba(2,18,24,0)');
    c.fillStyle = g; c.fillRect(0, H * 0.12, W, H * 0.08);
    // de steiger: planken met naden, nerven en spijkers
    g = c.createLinearGradient(0, 0, 0, H * 0.12); g.addColorStop(0, '#5b4732'); g.addColorStop(1, '#6b543a');
    c.fillStyle = g; c.fillRect(0, 0, W, H * 0.12);
    const pw = 11 * u;
    for (let x = -r() * pw; x < W; x += pw) {
      c.fillStyle = r() < 0.5 ? `rgba(255,220,170,${r() * 0.08})` : `rgba(0,0,0,${r() * 0.16})`; c.fillRect(x, 0, pw, H * 0.105);
      c.strokeStyle = 'rgba(30,18,6,0.28)'; c.lineWidth = 0.12 * u; c.beginPath();
      for (let j = 0; j < 6; j++) { const xx = x + r() * pw; c.moveTo(xx, 0); c.bezierCurveTo(xx + (r() - 0.5) * u, H * 0.04, xx + (r() - 0.5) * u, H * 0.07, xx + (r() - 0.5) * u, H * 0.105); }
      c.stroke();
      c.fillStyle = 'rgba(16,10,4,0.75)'; c.fillRect(x - 0.15 * u, 0, 0.3 * u, H * 0.105);
      c.fillStyle = 'rgba(255,226,184,0.1)'; c.fillRect(x + 0.15 * u, 0, 0.18 * u, H * 0.105);
      for (const yy of [0.012, 0.09]) { c.fillStyle = 'rgba(0,0,0,0.5)'; c.beginPath(); c.arc(x + 1.3 * u, H * yy + 0.1 * u, 0.3 * u, 0, 7); c.fill(); c.fillStyle = '#b9c0c4'; c.beginPath(); c.arc(x + 1.25 * u, H * yy, 0.22 * u, 0, 7); c.fill(); }
    }
    grainFill(c, korrel, 0, 0, W, H * 0.12, 0.6);
    // voorbalk van de steiger: lichte bovenkant, donkere onderkant
    g = c.createLinearGradient(0, H * 0.1, 0, H * 0.122); g.addColorStop(0, '#8a6c48'); g.addColorStop(0.35, '#5a442c'); g.addColorStop(1, '#261a0e');
    c.fillStyle = g; c.fillRect(0, H * 0.1, W, H * 0.022);
    g = c.createLinearGradient(0, 0, 0, H * 0.05); g.addColorStop(0, 'rgba(0,0,0,0.4)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H * 0.05);
  });
  // lichtvlekken (caustics): een netwerk van heldere lijntjes langs de randen van cellen, dat naadloos herhaalt.
  // Per beeldpunt: hoe dicht ligt het bij de grens tussen de twee dichtstbijzijnde punten? Eén keer berekend op een kleine tegel.
  const S = Math.max(96, Math.round(44 * u)), T = 96, N = 4;
  const klein = sheet(T, T, (c) => {
    const r = seeded(12), pts = [];
    for (let gy = 0; gy < N; gy++) for (let gx = 0; gx < N; gx++) pts.push([(gx + 0.15 + r() * 0.7) * T / N, (gy + 0.15 + r() * 0.7) * T / N]);
    const im = c.createImageData(T, T), d = im.data;
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const wx = x + 5 * Math.sin((y / T) * 6.283 * 2 + 1), wy = y + 5 * Math.sin((x / T) * 6.283 * 2 + 2);
      let d1 = 1e9, d2 = 1e9;
      for (const [px, py] of pts) {
        let dx = Math.abs(wx - px) % T, dy = Math.abs(wy - py) % T;
        if (dx > T / 2) dx = T - dx; if (dy > T / 2) dy = T - dy;
        const q = Math.hypot(dx, dy);
        if (q < d1) { d2 = d1; d1 = q; } else if (q < d2) d2 = q;
      }
      const v = Math.max(0, 1 - (d2 - d1) / 6), i = (y * T + x) * 4;
      d[i] = 215; d[i + 1] = 250; d[i + 2] = 245; d[i + 3] = 255 * (v * v * 0.85 + Math.max(0, 1 - (d2 - d1) / 14) * 0.15);
    }
    c.putImageData(im, 0, 0);
  });
  const caus = sheet(S, S, (c) => { c.imageSmoothingQuality = 'high'; c.drawImage(klein, 0, 0, S, S); });
  // forel van boven: nek naar rechts, lengte Lr. Lijf en staart apart, zodat de staart kan slaan.
  const Lr = 0.125 * H;
  const lijf = (col) => sheet(Lr * 1.1, Lr * 0.64, (c, w, h) => {
    const L = Lr, r = seeded(col.length + 21);
    c.translate(w / 2, h / 2);
    const fin = (pts) => { c.fillStyle = tint(col, 0.22).replace('rgb', 'rgba').replace(')', ',0.72)'); poly(c, pts.map(([x, y]) => [x * L, y * L])); c.fill(); c.strokeStyle = 'rgba(40,50,30,0.35)'; c.lineWidth = L * 0.006; c.stroke(); };
    for (const m of [-1, 1]) { fin([[0.27, 0.12 * m], [0.07, 0.28 * m], [0.13, 0.14 * m]]); fin([[-0.06, 0.125 * m], [-0.2, 0.21 * m], [-0.15, 0.1 * m]]); } // borst- en buikvinnen
    const vorm = () => { c.beginPath(); c.moveTo(0.5 * L, 0); c.bezierCurveTo(0.44 * L, -0.12 * L, 0.24 * L, -0.165 * L, 0.05 * L, -0.16 * L); c.bezierCurveTo(-0.2 * L, -0.15 * L, -0.38 * L, -0.07 * L, -0.5 * L, -0.035 * L); c.lineTo(-0.5 * L, 0.035 * L); c.bezierCurveTo(-0.38 * L, 0.07 * L, -0.2 * L, 0.15 * L, 0.05 * L, 0.16 * L); c.bezierCurveTo(0.24 * L, 0.165 * L, 0.44 * L, 0.12 * L, 0.5 * L, 0); c.closePath(); };
    const g = c.createLinearGradient(0, -0.16 * L, 0, 0.16 * L);
    g.addColorStop(0, tint(col, 0.16)); g.addColorStop(0.2, col); g.addColorStop(0.5, tint(col, -0.36)); g.addColorStop(0.8, col); g.addColorStop(1, tint(col, 0.16));
    c.fillStyle = g; vorm(); c.fill();
    c.save(); vorm(); c.clip();
    // de roze streep van de regenboogforel, op beide flanken
    c.strokeStyle = 'rgba(233,120,140,0.5)'; c.lineWidth = L * 0.03; c.lineCap = 'round';
    for (const m of [-1, 1]) { c.beginPath(); c.moveTo(0.34 * L, 0.085 * L * m); c.quadraticCurveTo(-0.05 * L, 0.125 * L * m, -0.48 * L, 0.03 * L * m); c.stroke(); }
    // stippen op de rug
    c.fillStyle = 'rgba(22,28,18,0.75)';
    for (let k = 0; k < 34; k++) { const x = -0.44 + r() * 0.74, wd = 0.11 * (1 - Math.abs(x + 0.02) * 1.3); c.beginPath(); c.arc(x * L, (r() - 0.5) * 2 * Math.max(0.02, wd) * L, L * (0.007 + r() * 0.008), 0, 7); c.fill(); }
    // kop: iets donkerder, met kieuwdeksels
    const hg = c.createLinearGradient(0.26 * L, 0, 0.5 * L, 0); hg.addColorStop(0, 'rgba(20,30,16,0)'); hg.addColorStop(1, 'rgba(20,30,16,0.38)');
    c.fillStyle = hg; c.fillRect(0.26 * L, -0.2 * L, 0.24 * L, 0.4 * L);
    c.strokeStyle = 'rgba(16,22,12,0.4)'; c.lineWidth = L * 0.01;
    for (const m of [-1, 1]) { c.beginPath(); c.arc(0.2 * L, 0.02 * L * m, 0.15 * L, m > 0 ? 0.15 : -1.05, m > 0 ? 1.05 : -0.15); c.stroke(); }
    c.restore();
    c.fillStyle = tint(col, -0.55); c.beginPath(); c.ellipse(0.02 * L, 0, 0.1 * L, 0.014 * L, 0, 0, 7); c.fill(); // rugvin
    c.beginPath(); c.ellipse(-0.3 * L, 0, 0.03 * L, 0.008 * L, 0, 0, 7); c.fill(); // vetvin
    for (const m of [-1, 1]) { c.fillStyle = '#0c0f0a'; c.beginPath(); c.arc(0.4 * L, 0.066 * L * m, 0.017 * L, 0, 7); c.fill(); c.fillStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.arc(0.405 * L, 0.062 * L * m, 0.006 * L, 0, 7); c.fill(); } // ogen
    c.strokeStyle = 'rgba(240,250,230,0.3)'; c.lineWidth = L * 0.012; c.beginPath(); c.moveTo(0.36 * L, -0.02 * L); c.quadraticCurveTo(0, -0.05 * L, -0.4 * L, -0.012 * L); c.stroke(); // natte glans op de rug
  });
  const staart = (col) => sheet(Lr * 0.3, Lr * 0.36, (c, w, h) => {
    const L = Lr;
    c.translate(w - L * 0.04, h / 2);
    const g = c.createLinearGradient(0, 0, -0.24 * L, 0); g.addColorStop(0, tint(col, -0.3)); g.addColorStop(1, tint(col, 0.12));
    c.fillStyle = g; c.beginPath(); c.moveTo(L * 0.03, -0.036 * L); c.quadraticCurveTo(-0.1 * L, -0.07 * L, -0.22 * L, -0.15 * L); c.quadraticCurveTo(-0.13 * L, 0, -0.22 * L, 0.15 * L); c.quadraticCurveTo(-0.1 * L, 0.07 * L, L * 0.03, 0.036 * L); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(30,40,24,0.3)'; c.lineWidth = L * 0.006; c.beginPath();
    for (let k = -3; k <= 3; k++) { c.moveTo(0, k * 0.008 * L); c.lineTo(-0.19 * L, k * 0.04 * L); }
    c.stroke();
  });
  const schaduw = sheet(Lr * 1.4, Lr * 0.6, (c, w, h) => { glow(c, w / 2, h / 2, w / 2, '2,20,28', 0.6, h / 2); });
  return { bodem, caus: ctx.createPattern(caus, 'repeat'), S, Lr, groot: { lijf: lijf('#8d9a7a'), staart: staart('#8d9a7a') }, klein: { lijf: lijf('#a7b39a'), staart: staart('#a7b39a') }, schaduw };
}

// Forellen zwemmen in de kweekvijver. Tik ergens: het schepnet duikt daar het water in en pakt de vissen eronder.
// Alleen de grote forellen (met een groen randje als je goed kijkt: lang genoeg) mogen mee; kleintjes terug = fout.
export function startForellen(g, { need = 10, maxSmall = 2, limit = 50 } = {}) {
  const ui = overlay(g, 'Forellen scheppen', '<canvas class="mini-canvas"></canvas>',
    g.input.isTouch ? 'Tik op een grote forel om hem te scheppen. Kleintjes laten zwemmen!' : 'Klik op een grote forel om hem te scheppen. Kleintjes laten zwemmen!');
  const cv = ui.ov.querySelector('canvas');
  const ctx = cv.getContext('2d');
  fitCanvas(cv);
  const parts = new Particles();
  const combo = makeCombo(ui.ov);
  const fish = [];
  // grote en kleine forellen lijken meer op elkaar, en ze zwemmen sneller dan eerst
  const spawnFish = (big) => fish.push({ x: Math.random(), y: rnd(0.2, 0.9), a: Math.random() * 6.28, v: rnd(0.12, 0.22), big, len: big ? rnd(0.098, 0.125) : rnd(0.066, 0.088), turn: 0, gone: 0, flee: 0 });
  for (let k = 0; k < 6; k++) spawnFish(true);
  for (let k = 0; k < 11; k++) spawnFish(false);
  let t = 0, caught = 0, small = 0, end = 0, ok = null, net = null;
  const look = {}; // voorgetekende vijver en forellen, opnieuw gemaakt bij een andere canvasmaat
  let vt = 0; // klok voor de staartslag en de lichtvlekken (alleen uiterlijk)
  const respawn = [];
  const scoop = (rx, ry) => {
    if (ok !== null || net) return;
    net = { x: rx, y: ry, t: 0 };
    g.sfx?.play('splash');
    const W = cv.width, H = cv.height, R = 0.055;
    const hit = fish.filter((f) => !f.gone && Math.hypot((f.x - rx) * W / H, f.y - ry) < R + f.len * 0.35);
    // vissen in de buurt schrikken van de plons en schieten weg
    for (const f of fish) { if (f.gone) continue; const d = Math.hypot((f.x - rx) * W / H, f.y - ry); if (d < 0.3) { f.a = Math.atan2(f.y - ry, (f.x - rx) * W / H); f.flee = 0.9; } }
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
      const boost = f.flee > 0 ? 3 : 1; f.flee = Math.max(0, f.flee - dt);
      f.x += Math.cos(f.a) * f.v * boost * dt * (H / W); f.y += Math.sin(f.a) * f.v * boost * dt;
      if (f.x < 0.05 || f.x > 0.95) { f.a = Math.PI - f.a; f.x = Math.max(0.05, Math.min(0.95, f.x)); }
      if (f.y < 0.18 || f.y > 0.95) { f.a = -f.a; f.y = Math.max(0.18, Math.min(0.95, f.y)); }
    }
    for (let k = fish.length - 1; k >= 0; k--) if (fish[k].gone === 0 && fish[k].wasGone) fish.splice(k, 1); else if (fish[k].gone) fish[k].wasGone = true;
    if (net) { net.t += dt; if (net.t > 0.4) net = null; }
    parts.update(dt);
    // tekenen: stromend water van de vijver. De bodem en de steiger staan voorgetekend klaar, de forellen zijn plaatjes.
    const sc = keep(look, `${W}x${H}`, () => vijverScene(ctx, W, H, u));
    vt += dt;
    ctx.drawImage(sc.bodem, 0, 0);
    // lichtvlekken van de zon die over de bodem schuiven (twee lagen die langs elkaar bewegen), onder de vissen door
    // (bewust zwak gehouden: een druk lichtpatroon maakt het lastig om grote en kleine forellen te onderscheiden)
    ctx.globalCompositeOperation = 'lighter';
    for (const [dx, dy, a] of [[vt * 1.6 * u, vt * 2.6 * u, 0.12], [sc.S * 0.5 - vt * 1.1 * u, sc.S * 0.3 + vt * 1.7 * u, 0.08]]) {
      const ox = ((dx % sc.S) + sc.S) % sc.S, oy = ((dy % sc.S) + sc.S) % sc.S;
      ctx.globalAlpha = a; ctx.translate(ox, oy); ctx.fillStyle = sc.caus; ctx.fillRect(-ox, H * 0.122 - oy, W, H * 0.878); ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    // eerst de schaduwen op de bodem (geeft diepte), dan de vissen zelf
    for (const f of fish) {
      if (f.gone && !f.wasGone) continue;
      const k = (f.len * H) / sc.Lr, co = Math.cos(f.a) * k, si = Math.sin(f.a) * k;
      ctx.globalAlpha = (f.gone ? f.gone : 1) * 0.8; // stevige schaduw: zo komt de vis los van de bodem
      ctx.setTransform(co, si, -si, co, f.x * W + 1.3 * u, f.y * H + 2.4 * u);
      ctx.drawImage(sc.schaduw, -sc.schaduw.width / 2, -sc.schaduw.height / 2);
    }
    for (const f of fish) {
      if (f.gone && !f.wasGone) continue;
      const sp = f.big ? sc.groot : sc.klein, k = (f.len * H) / sc.Lr, co = Math.cos(f.a) * k, si = Math.sin(f.a) * k;
      ctx.globalAlpha = f.gone ? f.gone : 1;
      ctx.setTransform(co, si, -si, co, f.x * W, f.y * H);
      // de staart slaat heen en weer (sneller als de vis schrikt); het lijf ligt op dezelfde plek en maat als eerst
      ctx.translate(-0.5 * sc.Lr, 0); ctx.rotate(Math.sin(vt * (f.flee > 0 ? 22 : 9) + f.len * 900) * 0.38);
      ctx.drawImage(sp.staart, -sp.staart.width + sc.Lr * 0.04, -sp.staart.height / 2);
      ctx.setTransform(co, si, -si, co, f.x * W, f.y * H);
      ctx.drawImage(sp.lijf, -sp.lijf.width / 2, -sp.lijf.height / 2);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
    // rimpels van de stroming op het oppervlak
    ctx.lineWidth = 0.4 * u; ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.beginPath();
    for (let k = 0; k < 14; k++) { const y = ((k * 7.3 + t * 6) % 100) * u; if (y < H * 0.13) continue; ctx.moveTo(0, y); ctx.bezierCurveTo(W * 0.3, y - 2 * u, W * 0.6, y + 2 * u, W, y); }
    ctx.stroke();
    if (net) {
      // het schepnet: een plons, de beugel met gaas en de steel
      const nx = net.x * W, ny = net.y * H, nr = 0.055 * H * (1 + net.t), fade = 1 - net.t / 0.4;
      ctx.strokeStyle = `rgba(255,255,255,${0.5 * fade})`; ctx.lineWidth = 0.5 * u; ctx.beginPath(); ctx.arc(nx, ny, nr * (1.25 + net.t * 2), 0, 7); ctx.stroke();
      ctx.save(); ctx.beginPath(); ctx.arc(nx, ny, nr, 0, 7); ctx.clip();
      ctx.fillStyle = 'rgba(220,240,245,0.12)'; ctx.fillRect(nx - nr, ny - nr, nr * 2, nr * 2);
      ctx.strokeStyle = 'rgba(240,248,250,0.4)'; ctx.lineWidth = 0.14 * u; ctx.beginPath();
      for (let d = -nr * 2; d <= nr * 2; d += 1.3 * u) { ctx.moveTo(nx + d - nr, ny - nr); ctx.lineTo(nx + d + nr, ny + nr); ctx.moveTo(nx + d + nr, ny - nr); ctx.lineTo(nx + d - nr, ny + nr); }
      ctx.stroke(); ctx.restore();
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(0,20,28,0.35)'; ctx.lineWidth = 1.5 * u; ctx.beginPath(); ctx.moveTo(nx + nr * 0.72 + 0.5 * u, ny + nr * 0.72 + 0.8 * u); ctx.lineTo(nx + nr * 0.72 + 26 * u, ny + nr * 0.72 + 27 * u); ctx.stroke();
      ctx.strokeStyle = '#8a6a44'; ctx.lineWidth = 1.3 * u; ctx.beginPath(); ctx.moveTo(nx + nr * 0.72, ny + nr * 0.72); ctx.lineTo(nx + nr * 0.72 + 26 * u, ny + nr * 0.72 + 26 * u); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,236,200,0.5)'; ctx.lineWidth = 0.3 * u; ctx.beginPath(); ctx.moveTo(nx + nr * 0.72 - 0.3 * u, ny + nr * 0.72 + 0.3 * u); ctx.lineTo(nx + nr * 0.72 + 25.7 * u, ny + nr * 0.72 + 26.3 * u); ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.strokeStyle = 'rgba(0,20,28,0.4)'; ctx.lineWidth = 0.9 * u; ctx.beginPath(); ctx.arc(nx + 0.3 * u, ny + 0.5 * u, nr, 0, 7); ctx.stroke();
      ctx.strokeStyle = '#eceff1'; ctx.lineWidth = 0.7 * u; ctx.beginPath(); ctx.arc(nx, ny, nr, 0, 7); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.22 * u; ctx.beginPath(); ctx.arc(nx, ny, nr, Math.PI * 1.05, Math.PI * 1.6); ctx.stroke();
    }
    parts.draw(ctx);
    ctx.font = `700 ${3 * u}px Inter, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(20,12,4,0.7)'; ctx.lineWidth = 0.8 * u;
    ctx.strokeText('Kweekvijver aan de Gulp: alleen de grote forellen!', W / 2, H * 0.08);
    ctx.fillStyle = '#fff';
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
