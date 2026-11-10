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

// ------------------------------------------------------------ tekenhulpjes (alleen voor het uiterlijk)

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
// Ronde zachte vlek (voor gloed, rook en schaduw), stops = [[plek, kleur], ...].
function softDot(size, stops) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'), g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) g.addColorStop(o, col);
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  return c;
}
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
// Veel blaadjes in één pad (één keer vullen per kleur is veel goedkoper dan elk blad apart).
function leafPath(c, leaves, T, dx = 0, dy = 0) {
  c.beginPath();
  for (const l of leaves) {
    for (const ox of (l.x < l.a ? [0, T] : l.x > T - l.a ? [0, -T] : [0])) for (const oy of (l.y < l.a ? [0, T] : l.y > T - l.a ? [0, -T] : [0])) {
      const x = l.x + ox + dx, y = l.y + oy + dy;
      c.moveTo(x + Math.cos(l.rot) * l.a, y + Math.sin(l.rot) * l.a);
      c.ellipse(x, y, l.a, l.a * 0.46, l.rot, 0, Math.PI * 2);
    }
  }
}

// Lagen voor de heg: een naadloze bladtegel die meeschuift, het licht over de heg met de tuin eromheen, en de heggenschaar.
function hedgeArt(art, ctx, W, H) {
  const u = H / 100, key = W + 'x' + H, T = Math.max(8, Math.round(100 * u));
  if (art.all && art.all.key === key) return art.all;
  const hx = W * 0.04, hw = W * 0.92, hy = 6 * u;
  const greens = [['#143317', '#193e19', '#1e4a1b'], ['#27601f', '#2f7024', '#387d28'], ['#448a2c', '#529b33', '#62a93b']];
  const tile = layer(art, 'blad', key, T, T, (c) => {
    const rnd = seeded(7);
    c.fillStyle = '#0f2412'; c.fillRect(0, 0, T, T);
    const mk = (n, lo, hi) => Array.from({ length: n }, () => ({ x: rnd() * T, y: rnd() * T, a: (lo + rnd() * (hi - lo)) * u, rot: rnd() * Math.PI }));
    // drie lagen blad: diep en donker, daaroverheen het middengroen, bovenop het blad dat licht vangt
    [[2400, 0.9, 1.5], [2100, 0.85, 1.4]].forEach(([n, lo, hi], li) => {
      const per = Math.round(n / 3);
      for (const col of greens[li]) { c.fillStyle = col; leafPath(c, mk(per, lo, hi), T); c.fill(); }
    });
    for (const col of greens[2]) {
      const lit = mk(430, 0.8, 1.3);
      c.fillStyle = 'rgba(0,0,0,0.3)'; leafPath(c, lit, T, 0.28 * u, 0.4 * u); c.fill(); // schaduwtje onder het blad
      c.fillStyle = col; leafPath(c, lit, T); c.fill();
      // nerf met een glimp licht
      c.strokeStyle = 'rgba(215,240,160,0.4)'; c.lineWidth = Math.max(1, 0.14 * u); c.beginPath();
      for (const l of lit) { c.moveTo(l.x - Math.cos(l.rot) * l.a * 0.75, l.y - Math.sin(l.rot) * l.a * 0.75); c.lineTo(l.x + Math.cos(l.rot) * l.a * 0.75, l.y + Math.sin(l.rot) * l.a * 0.75); }
      c.stroke();
    }
    // grote zachte vlekken: de heg golft, met diepere stukken en plukken die meer licht vangen
    for (let i = 0; i < 34; i++) {
      const x = rnd() * T, y = rnd() * T, rad = (7 + rnd() * 9) * u, dark = i % 3 !== 0;
      for (const ox of [-T, 0, T]) for (const oy of [-T, 0, T]) {
        if (x + ox < -rad || x + ox > T + rad || y + oy < -rad || y + oy > T + rad) continue;
        const g = c.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
        g.addColorStop(0, dark ? 'rgba(4,22,8,0.34)' : 'rgba(225,245,150,0.12)'); g.addColorStop(1, dark ? 'rgba(4,22,8,0)' : 'rgba(225,245,150,0)');
        c.fillStyle = g; c.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
      }
    }
  }, true);
  // het strak geknipte vlak: kleiner, lichter blad met hier en daar een afgeknipt steeltje
  const T2 = Math.max(8, Math.round(50 * u));
  const trim = layer(art, 'geknipt', key, T2, T2, (c) => {
    const rnd = seeded(31);
    c.fillStyle = '#66a343'; c.fillRect(0, 0, T2, T2);
    const mk = (n) => Array.from({ length: n }, () => ({ x: rnd() * T2, y: rnd() * T2, a: (0.45 + rnd() * 0.4) * u, rot: rnd() * Math.PI }));
    for (const col of ['#5a983b', '#72ae4a', '#86c059', '#9bcf6a', '#aedb7b']) { c.fillStyle = col; leafPath(c, mk(900), T2); c.fill(); }
    c.fillStyle = 'rgba(70,45,20,0.5)'; c.beginPath();
    for (let i = 0; i < 170; i++) { const x = rnd() * T2, y = rnd() * T2; c.moveTo(x + 0.16 * u, y); c.arc(x, y, 0.16 * u, 0, 7); }
    c.fill();
  }, true);
  // ernaast geknipt: een kale plek met takken
  const bare = layer(art, 'kaal', key, T2, T2, (c) => {
    const rnd = seeded(41);
    c.fillStyle = '#3a2413'; c.fillRect(0, 0, T2, T2);
    c.lineCap = 'round';
    for (const [col, n, w] of [['#24150a', 150, 0.5], ['#6e4a2c', 190, 0.36], ['#95704a', 150, 0.24], ['#b8946a', 70, 0.16]]) {
      c.strokeStyle = col; c.lineWidth = Math.max(1, w * u); c.beginPath();
      for (let i = 0; i < n; i++) {
        const x = rnd() * T2, y = rnd() * T2, a = rnd() * Math.PI, l = (1.2 + rnd() * 2.6) * u;
        for (const ox of [-T2, 0, T2]) for (const oy of [-T2, 0, T2]) { c.moveTo(x + ox - Math.cos(a) * l, y + oy - Math.sin(a) * l); c.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l); }
      }
      c.stroke();
    }
    c.fillStyle = '#4c6b2c'; leafPath(c, Array.from({ length: 60 }, () => ({ x: rnd() * T2, y: rnd() * T2, a: (0.5 + rnd() * 0.4) * u, rot: rnd() * Math.PI })), T2); c.fill();
  }, true);
  const light = layer(art, 'licht', key, W, H, (c) => {
    const rnd = seeded(11);
    // de tuin achter de heg: lucht, bomen in de verte en gras
    let g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#7fb1e0'); g.addColorStop(0.42, '#c3dcef'); g.addColorStop(0.5, '#dfeaf0');
    g.addColorStop(0.52, '#6f9460'); g.addColorStop(0.8, '#5f8f43'); g.addColorStop(1, '#3c6a2b');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 26; i++) { // wazige boomkruinen links en rechts
      const x = (i % 2 ? W - rnd() * hx * 1.2 : rnd() * hx * 1.2), y = (30 + rnd() * 26) * u, rad = (4 + rnd() * 5) * u;
      g = c.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, 'rgba(52,96,48,0.75)'); g.addColorStop(1, 'rgba(52,96,48,0)');
      c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    for (let i = 0; i < 7; i++) { // een paar wolkjes boven de heg
      const x = rnd() * W, y = (0.5 + rnd() * 3) * u, rad = (5 + rnd() * 8) * u;
      g = c.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.save(); c.translate(0, y); c.scale(1, 0.35); c.translate(0, -y); c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2); c.restore();
    }
    // de heg zelf uitsparen, met een rand die niet kaarsrecht is
    const edge = new Path2D();
    edge.moveTo(hx, H + 4 * u);
    for (let y = H; y > hy + 2 * u; y -= 1.6 * u) edge.quadraticCurveTo(hx - (0.2 + rnd() * 0.9) * u, y - 0.8 * u, hx + (rnd() - 0.5) * 0.5 * u, y - 1.6 * u);
    for (let x = hx; x < hx + hw - 1.5 * u; x += 1.7 * u) edge.quadraticCurveTo(x + 0.85 * u, hy - (0.3 + rnd() * 1.0) * u, x + 1.7 * u, hy + (rnd() - 0.5) * 0.5 * u);
    for (let y = hy; y < H + 2 * u; y += 1.6 * u) edge.quadraticCurveTo(hx + hw + (0.2 + rnd() * 0.9) * u, y + 0.8 * u, hx + hw + (rnd() - 0.5) * 0.5 * u, y + 1.6 * u);
    edge.lineTo(hx + hw, H + 4 * u); edge.closePath();
    c.globalCompositeOperation = 'destination-out'; c.fillStyle = '#000'; c.fill(edge); c.globalCompositeOperation = 'source-over';
    c.save(); c.clip(edge);
    // zon van linksboven: lichte bovenrand, donkerder naar onderen en naar de schaduwkant
    g = c.createLinearGradient(0, hy, 0, hy + 18 * u);
    g.addColorStop(0, 'rgba(255,246,190,0.34)'); g.addColorStop(0.4, 'rgba(255,246,190,0.08)'); g.addColorStop(1, 'rgba(255,246,190,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, hy + 18 * u);
    g = c.createLinearGradient(0, hy, 0, H);
    g.addColorStop(0, 'rgba(0,14,0,0)'); g.addColorStop(0.5, 'rgba(0,14,0,0.1)'); g.addColorStop(1, 'rgba(0,14,0,0.46)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    g = c.createLinearGradient(hx + hw - 12 * u, 0, hx + hw + u, 0);
    g.addColorStop(0, 'rgba(0,10,0,0)'); g.addColorStop(1, 'rgba(0,10,0,0.55)');
    c.fillStyle = g; c.fillRect(hx + hw - 12 * u, 0, 14 * u, H);
    g = c.createLinearGradient(hx - u, 0, hx + 5 * u, 0);
    g.addColorStop(0, 'rgba(255,244,180,0.2)'); g.addColorStop(1, 'rgba(255,244,180,0)');
    c.fillStyle = g; c.fillRect(0, 0, hx + 5 * u, H);
    g = c.createRadialGradient(hx + hw * 0.22, hy, 0, hx + hw * 0.22, hy, hw * 0.6);
    g.addColorStop(0, 'rgba(255,236,160,0.16)'); g.addColorStop(1, 'rgba(255,236,160,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 16; i++) { // zonnevlekjes
      const x = hx + rnd() * hw, y = hy + rnd() * (H - hy) * 0.8, rad = (4 + rnd() * 7) * u;
      g = c.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, 'rgba(255,240,170,0.1)'); g.addColorStop(1, 'rgba(255,240,170,0)');
      c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    c.restore();
    // losse blaadjes die over de bovenrand steken
    const rim = [];
    for (let x = hx; x < hx + hw; x += 0.8 * u) rim.push({ x: x + rnd() * u, y: hy + (rnd() - 0.4) * 1.5 * u, a: (0.8 + rnd() * 0.6) * u, rot: -Math.PI / 2 + (rnd() - 0.5) * 2.2 });
    c.fillStyle = 'rgba(0,0,0,0.25)'; leafPath(c, rim, 1e9, 0.25 * u, 0.35 * u); c.fill();
    [['#5fa83a', 0], ['#7dc04a', 1], ['#96d05c', 2]].forEach(([col, m]) => { c.fillStyle = col; leafPath(c, rim.filter((_, i) => i % 3 === m), 1e9); c.fill(); });
    // vignet
    g = c.createRadialGradient(W / 2, H * 0.5, H * 0.45, W / 2, H * 0.5, Math.hypot(W, H) * 0.56);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.38)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  });
  // elektrische heggenschaar; de oorsprong (sx, sy) is het punt dat de speler stuurt
  const sx = Math.ceil(5.5 * u), sy = Math.ceil(9 * u);
  const shears = layer(art, 'schaar', key, sx * 2, sy + 12 * u, (c) => {
    c.translate(sx, sy);
    // slagschaduw op de heg
    c.save(); c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 1.4 * u; c.shadowOffsetX = 0.7 * u; c.shadowOffsetY = 1.1 * u;
    c.fillStyle = '#1d2326'; rr(c, -1.6 * u, -7.4 * u, 3.2 * u, 10 * u, 0.9 * u); c.fill(); rr(c, -3 * u, 2 * u, 6 * u, 7 * u, 1.3 * u); c.fill();
    c.restore();
    // tanden aan weerszijden van het mes
    for (let k = -6; k < 2; k += 1.5) for (const s of [-1, 1]) {
      const g = c.createLinearGradient(0, k * u - 0.3 * u, 0, k * u + 0.9 * u); g.addColorStop(0, '#eef2f4'); g.addColorStop(1, '#6f7b83');
      c.fillStyle = g; c.beginPath(); c.moveTo(s * 0.8 * u, k * u - 0.35 * u); c.lineTo(s * 2.3 * u, k * u + 0.05 * u); c.lineTo(s * 2.3 * u, k * u + 0.5 * u); c.lineTo(s * 0.8 * u, k * u + 0.85 * u); c.closePath(); c.fill();
    }
    // het mes: geborsteld staal
    let g = c.createLinearGradient(-1 * u, 0, 1 * u, 0);
    g.addColorStop(0, '#75828b'); g.addColorStop(0.35, '#f4f7f9'); g.addColorStop(0.7, '#a9b4bb'); g.addColorStop(1, '#5d6971');
    c.fillStyle = g; rr(c, -1 * u, -7.4 * u, 2 * u, 9.8 * u, 0.9 * u); c.fill();
    c.strokeStyle = 'rgba(40,50,58,0.45)'; c.lineWidth = Math.max(1, 0.18 * u); c.beginPath(); c.moveTo(0.25 * u, -6.6 * u); c.lineTo(0.25 * u, 1.8 * u); c.stroke();
    // behuizing in oranje kunststof
    g = c.createLinearGradient(-3 * u, 2 * u, 3 * u, 9 * u);
    g.addColorStop(0, '#ffc45a'); g.addColorStop(0.45, '#ff8f00'); g.addColorStop(1, '#b85400');
    c.fillStyle = g; rr(c, -3 * u, 2 * u, 6 * u, 7 * u, 1.3 * u); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.3)'; rr(c, -2.5 * u, 2.9 * u, 0.9 * u, 5.2 * u, 0.45 * u); c.fill();
    c.fillStyle = 'rgba(90,35,0,0.55)'; for (let k = 0; k < 3; k++) { rr(c, 1.5 * u, (3.6 + k * 0.9) * u, 1 * u, 0.35 * u, 0.15 * u); c.fill(); }
    // beschermkap en handgreep
    g = c.createLinearGradient(0, 1.5 * u, 0, 2.9 * u); g.addColorStop(0, '#4a5257'); g.addColorStop(1, '#1b1f22');
    c.fillStyle = g; rr(c, -3.4 * u, 1.5 * u, 6.8 * u, 1.4 * u, 0.5 * u); c.fill();
    g = c.createLinearGradient(-1.3 * u, 0, 1.3 * u, 0); g.addColorStop(0, '#3a4146'); g.addColorStop(0.4, '#23282c'); g.addColorStop(1, '#111416');
    c.fillStyle = g; rr(c, -1.3 * u, 4.5 * u, 2.6 * u, 3.8 * u, 1 * u); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.16)'; c.lineWidth = Math.max(1, 0.16 * u); c.beginPath();
    for (let k = 0; k < 4; k++) { c.moveTo(-0.8 * u, (5.3 + k * 0.7) * u); c.lineTo(0.8 * u, (5.3 + k * 0.7) * u); }
    c.stroke();
  });
  // de geknipte strook wordt met deze patronen getrokken, zodat hij structuur heeft en met de heg meeschuift
  const pOk = ctx.createPattern(trim, 'repeat'), pBad = ctx.createPattern(bare, 'repeat');
  return (art.all = { key, tile, light, shears, sx, sy, T, pOk, pBad });
}

// Lagen voor de barbecue: de tuin met de ketel, de kolen en het rooster in één voorgetekend beeld, en losse plaatjes voor burger, gloed en rook.
function bbqArt(art, L) {
  const { W, H, u, r } = L, key = W + 'x' + H;
  if (art.all && art.all.key === key) return art.all;
  const cx = W / 2, cy = H * 0.5, RX = r * 5.2, RY = r * 3.6, IX = RX * 0.93, IY = RY * 0.92; // ketel en binnenkant
  const plateX = W * 0.12, plateY = H * 0.86;
  const blob = (c, x, y, rad, rnd, n = 7) => { // onregelmatig brok
    c.beginPath();
    const a0 = rnd() * 6.28;
    for (let k = 0; k < n; k++) { const a = a0 + (k / n) * Math.PI * 2, d = rad * (0.68 + rnd() * 0.4); k ? c.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.9) : c.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.9); }
    c.closePath();
  };
  const bg = layer(art, 'tuin', key, W, H, (c) => {
    const rnd = seeded(21);
    // gazon in de middagzon (licht van linksboven)
    let g = c.createLinearGradient(0, 0, W * 0.8, H);
    g.addColorStop(0, '#86ad56'); g.addColorStop(0.45, '#5b8a3c'); g.addColorStop(1, '#2f5524');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(255,255,210,0.05)'; // maaibanen
    for (let i = -6; i * 13 * u < W + 40 * u; i += 2) { c.beginPath(); c.moveTo(i * 13 * u, 0); c.lineTo((i + 1) * 13 * u, 0); c.lineTo((i + 1) * 13 * u + 30 * u, H); c.lineTo(i * 13 * u + 30 * u, H); c.closePath(); c.fill(); }
    const blades = Math.round((W / u) * 34);
    c.lineCap = 'round';
    for (const col of ['rgba(24,60,22,0.55)', 'rgba(52,100,36,0.55)', 'rgba(150,195,95,0.5)', 'rgba(205,225,130,0.32)']) {
      c.strokeStyle = col; c.lineWidth = Math.max(1, 0.2 * u); c.beginPath();
      for (let i = 0; i < blades / 4; i++) { const x = rnd() * W, y = rnd() * H, l = (0.7 + rnd() * 1.3) * u, a = -Math.PI / 2 + (rnd() - 0.5) * 1.2; c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); }
      c.stroke();
    }
    for (let i = 0; i < 22; i++) { // madeliefjes
      const x = rnd() * W, y = rnd() * H, d = (0.32 + rnd() * 0.2) * u;
      c.fillStyle = 'rgba(255,255,255,0.9)'; c.beginPath(); c.arc(x, y, d, 0, 7); c.fill();
      c.fillStyle = '#f2c230'; c.beginPath(); c.arc(x, y, d * 0.42, 0, 7); c.fill();
    }
    for (let i = 0; i < 9; i++) { // schaduw van een boom rechtsboven
      const x = W * (0.78 + rnd() * 0.3), y = H * (rnd() * 0.3 - 0.05), rad = (9 + rnd() * 10) * u;
      g = c.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, 'rgba(10,30,12,0.3)'); g.addColorStop(1, 'rgba(10,30,12,0)');
      c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // houten bijzettafel met het bord
    const tx0 = -2 * u, tx1 = plateX + r * 1.95, ty0 = plateY - Math.max(r * 1.5, 16.5 * u), ty1 = H + 3 * u;
    c.save(); c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 3 * u; c.shadowOffsetX = 1.4 * u; c.shadowOffsetY = 1.4 * u;
    c.fillStyle = '#7a5532'; rr(c, tx0, ty0, tx1 - tx0, ty1 - ty0, 1.4 * u); c.fill(); c.restore();
    c.save(); rr(c, tx0, ty0, tx1 - tx0, ty1 - ty0, 1.4 * u); c.clip();
    const ph = 4.4 * u;
    for (let y = ty0, k = 0; y < ty1; y += ph, k++) {
      g = c.createLinearGradient(0, y, 0, y + ph);
      const base = ['#b98a58', '#a97a4b', '#c09362', '#b08152'][k % 4];
      g.addColorStop(0, base); g.addColorStop(0.85, base); g.addColorStop(1, '#5f4025');
      c.fillStyle = g; c.fillRect(tx0, y, tx1 - tx0, ph);
      c.strokeStyle = 'rgba(80,48,22,0.28)'; c.lineWidth = Math.max(1, 0.14 * u); c.beginPath(); // nerf
      for (let j = 0; j < 5; j++) { const yy = y + (0.5 + j * 0.75 + rnd() * 0.3) * u, ph0 = rnd() * 6; c.moveTo(tx0, yy); for (let x = tx0; x <= tx1; x += 3 * u) c.lineTo(x, yy + Math.sin(x / (9 * u) + ph0) * 0.28 * u); }
      c.stroke();
      c.fillStyle = 'rgba(255,240,210,0.16)'; c.fillRect(tx0, y, tx1 - tx0, 0.3 * u);
    }
    g = c.createLinearGradient(tx0, 0, tx1, 0); g.addColorStop(0, 'rgba(255,236,190,0.12)'); g.addColorStop(1, 'rgba(40,20,5,0.22)');
    c.fillStyle = g; c.fillRect(tx0, ty0, tx1 - tx0, ty1 - ty0);
    c.restore();
    // bord van wit aardewerk
    const py = plateY + r * 0.14;
    c.save(); c.shadowColor = 'rgba(40,20,5,0.55)'; c.shadowBlur = 1.8 * u; c.shadowOffsetX = 0.6 * u; c.shadowOffsetY = 0.9 * u;
    c.fillStyle = '#e4e8ea'; c.beginPath(); c.ellipse(plateX, py, r * 1.28, r * 0.52, 0, 0, 7); c.fill(); c.restore();
    g = c.createLinearGradient(plateX - r, py - r * 0.5, plateX + r, py + r * 0.5); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#c9d0d5');
    c.fillStyle = g; c.beginPath(); c.ellipse(plateX, py, r * 1.28, r * 0.52, 0, 0, 7); c.fill();
    g = c.createLinearGradient(plateX - r, py - r * 0.4, plateX + r, py + r * 0.4); g.addColorStop(0, '#cdd4d8'); g.addColorStop(0.6, '#f4f6f7'); g.addColorStop(1, '#ffffff');
    c.fillStyle = g; c.beginPath(); c.ellipse(plateX, py + r * 0.02, r * 0.92, r * 0.35, 0, 0, 7); c.fill();
    // slagschaduw van de barbecue op het gras
    c.save(); c.translate(cx + r * 0.55, cy + r * 0.7); c.scale(1, RY / RX);
    g = c.createRadialGradient(0, 0, RX * 0.75, 0, 0, RX * 1.2); g.addColorStop(0, 'rgba(0,0,0,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, RX * 1.22, 0, 7); c.fill(); c.restore();
    // houten handvatten links en rechts
    for (const sgn of [-1, 1]) {
      g = c.createLinearGradient(0, cy - r * 0.9, 0, cy + r * 0.9); g.addColorStop(0, '#c89a62'); g.addColorStop(1, '#6e4a26');
      c.fillStyle = g; rr(c, cx + sgn * (RX + r * 0.12) - r * 0.42, cy - r * 0.85, r * 0.84, r * 1.7, r * 0.28); c.fill();
    }
    // de ketel: zwart email met een glimmende rand
    g = c.createLinearGradient(cx - RX, cy - RY, cx + RX * 0.6, cy + RY);
    g.addColorStop(0, '#59626a'); g.addColorStop(0.3, '#262b2f'); g.addColorStop(1, '#0b0d0e');
    c.fillStyle = g; c.beginPath(); c.ellipse(cx, cy, RX, RY, 0, 0, 7); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = 0.45 * u; c.beginPath(); c.ellipse(cx, cy, Math.max(0.1, RX - 0.7 * u), Math.max(0.1, RY - 0.7 * u), 0, Math.PI * 1.02, Math.PI * 1.55); c.stroke();
    c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 0.5 * u; c.beginPath(); c.ellipse(cx, cy, Math.max(0.1, RX - 0.3 * u), Math.max(0.1, RY - 0.3 * u), 0, 0, Math.PI * 0.6); c.stroke();
    // binnenin: gloeiende bodem met kolen erop
    c.save(); c.beginPath(); c.ellipse(cx, cy, IX, IY, 0, 0, 7); c.clip();
    c.save(); c.translate(cx, cy + IY * 0.25); c.scale(1, IY / IX);
    g = c.createRadialGradient(0, 0, 0, 0, 0, IX * 1.1); g.addColorStop(0, '#c2410a'); g.addColorStop(0.55, '#74200a'); g.addColorStop(1, '#1c0a06');
    c.fillStyle = g; c.fillRect(-IX * 1.2, -IX * 1.6, IX * 2.4, IX * 3.2); c.restore();
    for (let i = 0; i < 230; i++) {
      const a = rnd() * 6.28, d = Math.sqrt(rnd()), x = cx + Math.cos(a) * d * IX * 0.98, y = cy + Math.sin(a) * d * IY * 0.98, sz = (0.26 + rnd() * 0.26) * r;
      const hot = rnd() < 0.1 + 0.16 * Math.max(0, (y - cy) / IY + 0.4);
      if (hot) { g = c.createRadialGradient(x, y, 0, x, y, sz); g.addColorStop(0, '#ffb25a'); g.addColorStop(0.45, '#e2520f'); g.addColorStop(1, '#4a1206'); }
      else { g = c.createLinearGradient(x - sz, y - sz, x + sz, y + sz); g.addColorStop(0, '#5b5651'); g.addColorStop(0.35, '#2b2826'); g.addColorStop(1, '#0d0c0b'); }
      c.fillStyle = g; blob(c, x, y, sz, rnd); c.fill();
      if (!hot) { c.strokeStyle = 'rgba(214,208,198,0.2)'; c.lineWidth = Math.max(1, 0.16 * u); c.beginPath(); c.arc(x, y, sz * 0.6, Math.PI * 1.05, Math.PI * 1.6); c.stroke(); } // randje as
    }
    c.save(); c.translate(cx, cy); c.scale(1, IY / IX); // wand van de ketel werpt schaduw naar binnen
    g = c.createRadialGradient(0, 0, IX * 0.72, 0, 0, IX); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.7)');
    c.fillStyle = g; c.fillRect(-IX, -IX, IX * 2, IX * 2); c.restore();
    c.restore();
    // gietijzeren rooster
    const bars = (dx) => { c.beginPath(); for (let k = -6; k <= 6; k++) { c.moveTo(cx + k * r * 0.75 + dx, cy - IY); c.lineTo(cx + k * r * 0.75 + dx, cy + IY); } };
    c.save(); c.beginPath(); c.ellipse(cx, cy, IX, IY, 0, 0, 7); c.clip();
    c.lineCap = 'butt';
    c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 0.9 * u; bars(0.55 * u); c.stroke(); // schaduw op de kolen
    c.strokeStyle = '#22272a'; c.lineWidth = 1.1 * u; c.beginPath(); c.moveTo(cx - IX, cy + r * 0.57); c.lineTo(cx + IX, cy + r * 0.57); c.stroke(); // dwarsdrager
    c.strokeStyle = '#1f2326'; c.lineWidth = 0.95 * u; bars(0); c.stroke();
    c.strokeStyle = '#737f87'; c.lineWidth = 0.42 * u; bars(-0.14 * u); c.stroke();
    c.strokeStyle = 'rgba(236,242,246,0.6)'; c.lineWidth = Math.max(1, 0.13 * u); bars(-0.26 * u); c.stroke();
    c.restore();
    c.strokeStyle = '#1b1f22'; c.lineWidth = 1.1 * u; c.beginPath(); c.ellipse(cx, cy, IX, IY, 0, 0, 7); c.stroke();
    c.strokeStyle = 'rgba(210,220,226,0.45)'; c.lineWidth = Math.max(1, 0.2 * u); c.beginPath(); c.ellipse(cx, cy, IX + 0.25 * u, IY + 0.25 * u, 0, Math.PI * 1.0, Math.PI * 1.6); c.stroke();
    // vignet
    g = c.createRadialGradient(W / 2, H / 2, H * 0.5, W / 2, H / 2, Math.hypot(W, H) * 0.58);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.42)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }, true);
  // licht, schaduw en structuur van een burger; de kleur (hoe gaar) komt er per beeld onder
  const pw = Math.ceil(r * 2.3), phh = Math.ceil(r * 2);
  const shade = layer(art, 'burger', key, pw, phh, (c) => {
    const rnd = seeded(51);
    c.translate(pw / 2, phh / 2);
    c.save(); c.beginPath(); c.ellipse(0, 0, r, r * 0.8, 0, 0, 7); c.clip();
    for (let i = 0; i < 320; i++) { // korrel van het gehakt, met hier en daar een spikkeltje vet
      const x = (rnd() - 0.5) * 2 * r, y = (rnd() - 0.5) * 1.6 * r, d = (0.02 + rnd() * 0.045) * r, k = rnd();
      c.fillStyle = k < 0.62 ? 'rgba(30,8,4,0.16)' : k < 0.93 ? 'rgba(255,225,205,0.1)' : 'rgba(255,245,235,0.2)';
      c.beginPath(); c.arc(x, y, d, 0, 7); c.fill();
    }
    c.save(); c.scale(1, 0.8);
    let g = c.createRadialGradient(-r * 0.35, -r * 0.45, r * 0.05, 0, 0, r * 1.02);
    g.addColorStop(0, 'rgba(255,255,255,0.26)'); g.addColorStop(0.45, 'rgba(255,255,255,0.03)'); g.addColorStop(0.8, 'rgba(0,0,0,0.14)'); g.addColorStop(1, 'rgba(0,0,0,0.48)');
    c.fillStyle = g; c.fillRect(-r, -r, r * 2, r * 2); c.restore();
    c.fillStyle = 'rgba(255,255,255,0.3)'; // glimmend vet
    for (const [x, y, a, b] of [[-0.42, -0.36, 0.2, 0.07], [-0.1, -0.5, 0.1, 0.04], [0.3, -0.3, 0.07, 0.03]]) { c.beginPath(); c.ellipse(x * r, y * r, a * r, b * r, -0.4, 0, 7); c.fill(); }
    c.restore();
    c.strokeStyle = 'rgba(255,230,205,0.3)'; c.lineWidth = Math.max(1, 0.05 * r); c.beginPath(); c.ellipse(0, 0, r * 0.96, r * 0.76, 0, Math.PI * 1.0, Math.PI * 1.6); c.stroke();
  });
  // één laag van de stapel op het bord: broodje met een burger erop, en het kapje voor bovenop
  const sw = Math.ceil(r * 1.8), sh = Math.ceil(r * 0.75 + 2 * u);
  const slice = layer(art, 'laag', key, sw, sh, (c) => {
    c.translate(sw / 2, r * 0.36);
    const disc = (y, rx, ry, th, top, side) => { c.fillStyle = side; c.beginPath(); c.ellipse(0, y + th, rx, ry, 0, 0, Math.PI); c.lineTo(-rx, y); c.lineTo(rx, y); c.closePath(); c.fill(); c.fillStyle = top; c.beginPath(); c.ellipse(0, y, rx, ry, 0, 0, 7); c.fill(); };
    let g = c.createLinearGradient(-r, 0, r, 0); g.addColorStop(0, '#f6e2b4'); g.addColorStop(1, '#d9b877');
    disc(0.3 * u, r * 0.8, r * 0.3, 0.7 * u, g, '#b98a4a');
    g = c.createLinearGradient(-r, 0, r, 0); g.addColorStop(0, '#8a4c27'); g.addColorStop(1, '#522a13');
    disc(-0.45 * u, r * 0.78, r * 0.3, 0.65 * u, g, '#472410');
  });
  const cap = layer(art, 'kapje', key, sw, Math.ceil(r * 1.1), (c) => {
    const rnd = seeded(61);
    c.translate(sw / 2, r * 0.75);
    const g = c.createRadialGradient(-r * 0.25, -r * 0.4, r * 0.05, 0, -r * 0.1, r * 0.95);
    g.addColorStop(0, '#f6cf8a'); g.addColorStop(0.5, '#d99a45'); g.addColorStop(1, '#9a5f1f');
    c.fillStyle = g; c.beginPath(); c.ellipse(0, 0, r * 0.8, r * 0.3, 0, 0, Math.PI); c.bezierCurveTo(-r * 0.82, -r * 0.75, r * 0.82, -r * 0.75, r * 0.8, 0); c.closePath(); c.fill();
    c.fillStyle = '#fff3d0'; for (let i = 0; i < 14; i++) { const a = rnd() * 6.28, d = rnd() * 0.5; c.beginPath(); c.ellipse(Math.cos(a) * d * r, -r * 0.3 + Math.sin(a) * d * r * 0.4, r * 0.05, r * 0.025, a, 0, 7); c.fill(); }
  });
  // vlam: druppel van geel naar rood
  const flame = layer(art, 'vlam', key, 48, 96, (c) => {
    const g = c.createLinearGradient(0, 96, 0, 0); g.addColorStop(0, 'rgba(255,244,190,0.95)'); g.addColorStop(0.35, 'rgba(255,170,50,0.8)'); g.addColorStop(1, 'rgba(255,70,10,0)');
    c.fillStyle = g; c.beginPath(); c.moveTo(24, 0); c.bezierCurveTo(30, 40, 48, 60, 40, 84); c.bezierCurveTo(34, 98, 14, 98, 8, 84); c.bezierCurveTo(0, 60, 18, 40, 24, 0); c.fill();
  });
  return (art.all = {
    key, bg, shade, pw, phh, slice, cap, sw, flame, cx, cy, IX, IY, plateX, plateY,
    ember: softDot(128, [[0, 'rgba(255,190,90,0.95)'], [0.35, 'rgba(255,110,25,0.5)'], [1, 'rgba(255,70,0,0)']]),
    halo: softDot(128, [[0, 'rgba(255,224,130,0)'], [0.52, 'rgba(255,224,130,0)'], [0.62, 'rgba(255,228,140,0.95)'], [1, 'rgba(255,224,130,0)']]),
    // deeltjes van minifx krijgen een zacht plaatje op kleur: rook, zwarte walm en vonkjes
    soft: {
      'rgba(220,220,220,0.6)': { c: softDot(64, [[0, 'rgba(240,240,236,0.7)'], [0.5, 'rgba(228,228,224,0.3)'], [1, 'rgba(220,220,220,0)']]), grow: 2.6, a: 0.9 },
      '#333': { c: softDot(64, [[0, 'rgba(30,28,26,0.75)'], [0.5, 'rgba(40,38,36,0.38)'], [1, 'rgba(45,45,45,0)']]), grow: 2.2, a: 0.95 },
      '#ffcc80': { c: softDot(32, [[0, 'rgba(255,250,220,1)'], [0.3, 'rgba(255,204,128,0.9)'], [1, 'rgba(255,140,40,0)']]), grow: 0.4, a: 1 },
    },
  });
}

// ------------------------------------------------------------ heg knippen

// Een lijn schuift over de heg naar beneden; hou de heggenschaar erop (vinger slepen, muis of pijltjes).
export function startHedge(g, { time = 24, need = 0.7 } = {}) {
  const ui = overlay(g, 'Heg knippen', '<canvas class="mini-canvas"></canvas>', g.input.isTouch ? 'Sleep je vinger naar links en rechts: hou de schaar op de witte lijn' : 'Muis of pijltjes: hou de schaar op de witte lijn');
  const cv = ui.ov.querySelector('canvas');
  const ctx = cv.getContext('2d');
  fitCanvas(cv);
  const parts = new Particles();
  const art = {}; // voorgetekende lagen (alleen uiterlijk)
  ui.ov.style.background = '#14241a'; // rustige donkere band achter de kop en de uitleg
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
    const A = hedgeArt(art, ctx, W, H);
    ctx.fillStyle = '#9cc3e4'; ctx.fillRect(0, 0, W, H); // alleen aan de rand te zien terwijl het beeld schudt
    ctx.save();
    if (shakeT > 0) ctx.translate((Math.random() - 0.5) * 10 * shakeT, 0);
    // bladerdek dat meeschuift, even snel als de geknipte strook
    const oy = Math.round((scroll * 0.22 * H) % A.T) - A.T;
    for (let ty = oy; ty < H; ty += A.T) for (let tx = 0; tx < W; tx += A.T) ctx.drawImage(A.tile, tx, ty);
    // al geknipte strook achter de schaar
    // (het geknipte stuk schuift onder de schaar door naar beneden)
    const okPath = new Path2D(), badPath = new Path2D();
    for (let i = 1; i < cuts.length; i++) { // elk stuk met dezelfde uitkomst is één doorlopende lijn (veel goedkoper dan losse stukjes)
      const a = cuts[i - 1], c = cuts[i], pth = c.ok ? okPath : badPath;
      if (i === 1 || c.ok !== a.ok) pth.moveTo(a.x * W, (cy + (scroll - a.s) * 0.22) * H);
      pth.lineTo(c.x * W, (cy + (scroll - c.s) * 0.22) * H);
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'bevel';
    // de structuur van de strook schuift mee met de heg
    if (A.pOk.setTransform && typeof DOMMatrix !== 'undefined') { const m = new DOMMatrix().translateSelf(0, oy); A.pOk.setTransform(m); A.pBad.setTransform(m); }
    // netjes geknipt: strak lichtgroen vlak met een donkere rand eromheen (de strook ligt iets verdiept)
    ctx.strokeStyle = 'rgba(6,26,8,0.55)'; ctx.lineWidth = 6.2 * u; ctx.stroke(okPath);
    ctx.strokeStyle = A.pOk; ctx.lineWidth = 5 * u; ctx.stroke(okPath);
    // ernaast geknipt: kale bruine plek met takken
    ctx.strokeStyle = 'rgba(24,10,4,0.65)'; ctx.lineWidth = 6.2 * u; ctx.stroke(badPath);
    ctx.strokeStyle = A.pBad; ctx.lineWidth = 5 * u; ctx.stroke(badPath);
    while (cuts.length && (cy + (scroll - cuts[0].s) * 0.22) > 1.05) cuts.shift();
    // licht en schaduw over de heg, met de tuin eromheen
    ctx.drawImage(A.light, 0, 0);
    // de lijn die nog komt (met een schaduwlijntje eronder, zodat hij op elk blad leesbaar blijft)
    const guide = new Path2D();
    for (let k = 0; k <= 60; k++) { const s = scroll + k * 0.08; const y = (cy - k * 0.08 * 0.22) * H; const lx = lineX(s) * W; if (k === 0) guide.moveTo(lx, y); else guide.lineTo(lx, y); }
    ctx.lineWidth = 0.9 * u; ctx.setLineDash([2 * u, 1.6 * u]);
    ctx.save(); ctx.translate(0.3 * u, 0.4 * u); ctx.strokeStyle = 'rgba(0,20,0,0.45)'; ctx.stroke(guide); ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.97)'; ctx.stroke(guide); ctx.setLineDash([]);
    // heggenschaar
    ctx.save(); ctx.translate(x * W, cy * H); ctx.rotate(Math.sin(t * 40) * 0.05);
    ctx.drawImage(A.shears, -A.sx, -A.sy);
    ctx.restore();
    // snippers: blaadjes in plaats van vierkantjes
    parts.update(dt);
    for (const p of parts.list) { ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.color; ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size * 0.8, p.size * 0.38, p.rot, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
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
  hud.innerHTML = '<div class="gm-label">Lauw</div><div class="gm-bar"><i></i></div><div class="gm-count"></div>';
  document.getElementById('hud').appendChild(hud);
  // De meter begint in het midden (lauw) en wordt warmer als je dichterbij komt en kouder als je ervandaan loopt.
  // Het midden is de afstand tot de dichtstbijzijnde kabouter bij de start, en opnieuw na elke gevonden kabouter.
  let t = 0, found = 0, lastWord = '', ref = null, shown = 0.5;
  return runMini(g, (dt, finish) => {
    t += dt;
    g.player.lockedFor = false; // je loopt gewoon rond
    const p = g.player;
    const left = gnomes.filter((k) => !k.found);
    let d = Infinity;
    for (const k of left) d = Math.min(d, Math.hypot(k.x - p.x, k.z - p.z));
    if (ref == null) ref = Math.max(25, d);
    // d = ref: 0,5 · d = 0: 1 (heet) · d = 2x ref: 0 (ijskoud); dichtbij altijd heet
    let heat = Math.max(0, Math.min(1, 0.5 + (ref - d) / (2 * ref)));
    if (d < 6) heat = Math.max(heat, 0.95);
    shown += (heat - shown) * Math.min(1, dt * 4);
    const word = shown > 0.9 ? 'HEET!' : shown > 0.72 ? 'Warm' : shown > 0.58 ? 'Warmer' : shown >= 0.42 ? 'Lauw' : shown >= 0.28 ? 'Kouder' : shown >= 0.12 ? 'Koud' : 'IJskoud';
    if (word !== lastWord) { lastWord = word; bump(hud); if (word === 'HEET!') g.sfx?.play('tally'); }
    hud.querySelector('.gm-label').textContent = word;
    hud.querySelector('.gm-bar i').style.width = shown * 100 + '%';
    hud.style.setProperty('--heat', shown.toFixed(2));
    hud.querySelector('.gm-count').textContent = `${found} / ${gnomes.length} kabouters · ${Math.max(0, Math.ceil(limit - t))} s`;
    for (const k of left) {
      k.m.rotation.y += dt * (Math.hypot(k.x - p.x, k.z - p.z) < 10 ? 3 : 0.3); // dichtbij: hij draait zich om
      if (Math.hypot(k.x - p.x, k.z - p.z) < 2.2) {
        k.found = true; found++;
        ref = null; shown = 0.5; // voor de volgende kabouter begint de meter weer in het midden
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
  const art = {}; // voorgetekende lagen (alleen uiterlijk)
  ui.ov.style.background = '#16210f'; // rustige donkere band achter de kop en de uitleg
  const combo = makeCombo(ui.ov);
  const fresh = (i) => ({ i, side: 0, cook: [0, 0], rate: 0.16 + Math.random() * 0.12, flip: 0, burnt: false, gone: 0, delay: Math.random() * 1.2 });
  const patties = Array.from({ length: 6 }, (_, i) => fresh(i));
  let t = 0, served = 0, burnt = 0, end = 0, ok = null, plate = 0;
  const layout = () => { const W = cv.width, H = cv.height, u = H / 100; const r = Math.min(W * 0.075, 11 * u); return { W, H, u, r, pos: (i) => [W / 2 + ((i % 3) - 1) * r * 2.8, H * 0.42 + Math.floor(i / 3) * r * 2.6] }; };
  const rgbOf = (c) => (c < 0.5 ? [190 - c * 60, 110 - c * 50, 110 - c * 60] : c < 1 ? [160 - (c - 0.5) * 80, 85 - (c - 0.5) * 70, 50 - (c - 0.5) * 40] : [120 - Math.min(1, c - 1) * 100, 50 - Math.min(1, c - 1) * 40, 30 - Math.min(1, c - 1) * 25]); // zelfde kleuren als colorOf, als getallen
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
    // tekenen: de tuin met de ketel staat klaar in een voorgetekende laag
    const A = bbqArt(art, L);
    ctx.drawImage(A.bg, 0, 0);
    // flakkerende gloed en vlammetjes tussen de kolen (naar de rand toe kleiner, zodat het binnen de ketel blijft)
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 9; k++) {
      const dx = (k - 4) * r * 1.1, fx = W / 2 + dx, f = Math.sqrt(Math.max(0.05, 1 - (dx / A.IX) ** 2)), fy = A.cy + A.IY * 0.74 * f;
      const fh = (3 + Math.sin(t * 9 + k * 1.7) * 1.4) * u * (0.5 + 0.5 * f);
      if (k % 2 === 0) { const sz = r * (2.3 + Math.sin(t * 9 + k * 1.7) * 0.5) * (0.4 + 0.6 * f); ctx.globalAlpha = 0.45 + Math.sin(t * 7 + k) * 0.18; ctx.drawImage(A.ember, fx - sz / 2, fy - sz / 2, sz, sz); }
      ctx.globalAlpha = 0.6; ctx.drawImage(A.flame, fx - r * 0.3, fy + r * 0.25 - fh * 1.7, r * 0.6, fh * 1.7);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    for (const pt of patties) {
      if (pt.delay > 0) continue;
      const [px, py] = L.pos(pt.i);
      const vis = pt.gone > 0 ? Math.max(0, pt.gone / 0.6) : 1;
      const c = pt.cook[pt.side], ready = c >= 0.7 && c <= 0.95;
      const shown = pt.cook[1 - pt.side] * (pt.flip > 0.5 ? 1 : 0) + c * (pt.flip > 0.5 ? 0 : 1); // de kant die je ziet
      ctx.save(); ctx.translate(px, py - (1 - vis) * 20 * u); ctx.scale(vis, vis * (1 - pt.flip * 1.6 * (1 - pt.flip)));
      ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.beginPath(); ctx.ellipse(r * 0.1, r * 0.26, r * 1.04, r * 0.82, 0, 0, 7); ctx.fill(); // schaduw op het rooster
      if (ready && !pt.gone) ctx.drawImage(A.halo, -r * 1.75, -r * 1.48, r * 3.5, r * 2.96); // gouden rand: nu omdraaien of opdienen
      const [cr, cg, cb] = rgbOf(shown);
      ctx.fillStyle = `rgb(${cr * 0.55},${cg * 0.5},${cb * 0.5})`; ctx.beginPath(); ctx.ellipse(0, r * 0.12, r, r * 0.8, 0, 0, 7); ctx.fill(); // zijkant
      ctx.fillStyle = colorOf(shown);
      ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.8, 0, 0, 7); ctx.fill();
      // schroeistrepen van het rooster: worden donkerder naarmate de burger gaarder is
      ctx.strokeStyle = `rgba(28,10,4,${0.2 + 0.42 * Math.min(1, shown)})`; ctx.lineWidth = 0.09 * r; ctx.lineCap = 'round';
      for (const gy of [-0.3, 0.05, 0.4]) { ctx.beginPath(); ctx.moveTo(-r * 0.7, gy * r); ctx.lineTo(r * 0.7, gy * r); ctx.stroke(); }
      ctx.drawImage(A.shade, -A.pw / 2, -A.phh / 2);
      if (shown > 1) { ctx.fillStyle = `rgba(18,8,4,${Math.min(0.5, (shown - 1) * 1.4)})`; ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.8, 0, 0, 7); ctx.fill(); } // te lang: de glans verdwijnt, hij wordt zwart
      ctx.restore();
      // gaarheid-meter onder de burger
      if (!pt.gone) {
        ctx.fillStyle = 'rgba(0,0,0,0.62)'; ctx.fillRect(px - r - 1, py + r * 0.95 - 1, r * 2 + 2, 1.2 * u + 2);
        ctx.fillStyle = 'rgba(120,255,140,0.8)'; ctx.fillRect(px - r + r * 2 * (0.7 / 1.35), py + r * 0.95, r * 2 * (0.25 / 1.35), 1.2 * u);
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(px - r + r * 2 * Math.min(1, c / 1.35) - 3, py + r * 0.85 - 1, 6, 2.2 * u + 2);
        ctx.fillStyle = c > 1 ? '#ff5252' : '#fff'; ctx.fillRect(px - r + r * 2 * Math.min(1, c / 1.35) - 2, py + r * 0.85, 4, 2.2 * u);
        if (!g.input.isTouch) {
          ctx.font = `700 ${2.4 * u}px Inter, sans-serif`; ctx.textAlign = 'center';
          ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText(String(pt.i + 1), px + 0.15 * u, py - r * 0.95 + 0.2 * u);
          ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillText(String(pt.i + 1), px, py - r * 0.95);
        }
      }
    }
    // rook, walm en vonken: zelfde deeltjes als altijd, getekend als zachte wolkjes
    for (const p of parts.list) {
      const k = Math.max(0, p.life / p.max), sp = A.soft[p.color];
      if (sp) { const d = p.size * (2.4 + (1 - k) * sp.grow * 2); ctx.globalAlpha = k * sp.a; ctx.drawImage(sp.c, p.x - d / 2, p.y - d / 2, d, d); }
      else { ctx.globalAlpha = k; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 7); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    // bord met opgediende burgers
    const stackN = Math.min(plate, 10);
    for (let k = 0; k < stackN; k++) ctx.drawImage(A.slice, A.plateX - A.sw / 2, A.plateY - k * 1.4 * u - r * 0.36);
    if (stackN > 0) ctx.drawImage(A.cap, A.plateX - A.sw / 2, A.plateY - (stackN - 1) * 1.4 * u - 0.6 * u - r * 0.75);
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
    // het gesprek zet de speler vast; zolang je niet schept of kiept moet je gewoon kunnen lopen
    p.lockedFor = false;
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
