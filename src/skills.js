// Korte missies op snelheid, behendigheid en precisie:
// slalom op de fiets, pils vangen, een ontsnapte geit, inparkeren en vogelschieten.
// Elk spel geeft een Promise terug met de uitslag, of null als de klus gestopt is.
import * as THREE from 'three';
import { popText, flash, shake, bump, makeCombo, Particles, fitCanvas } from './minifx.js';
import { makeFinishBanner } from './props.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

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

// Een poortje: twee pionnen met elk een paaltje en een doek ertussen met het nummer.
// Het doek hangt aan een dwarsbuis en bolt iets op (geen kaarsrecht vlak), met een zoom en zeilringen.
function makeGate(num, half) {
  const g = new THREE.Group();
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ff6d00'; ctx.fillRect(0, 0, 512, 128);
  // zachte plooien in het doek en een lichtere bovenkant
  for (let i = 0; i < 9; i++) { const x0 = 20 + i * 56 + (i % 3) * 9, gr = ctx.createLinearGradient(x0, 0, x0 + 44, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, i % 2 ? 'rgba(120,40,0,0.16)' : 'rgba(255,255,255,0.13)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gr; ctx.fillRect(x0, 0, 44, 128); }
  const top = ctx.createLinearGradient(0, 0, 0, 128); top.addColorStop(0, 'rgba(255,255,255,0.16)'); top.addColorStop(0.4, 'rgba(255,255,255,0)'); top.addColorStop(1, 'rgba(90,30,0,0.2)');
  ctx.fillStyle = top; ctx.fillRect(0, 0, 512, 128);
  // omgenaaide zoom met stiksel en zeilringen
  ctx.strokeStyle = 'rgba(120,45,0,0.55)'; ctx.lineWidth = 2; ctx.setLineDash([9, 6]); ctx.strokeRect(7, 7, 498, 114); ctx.setLineDash([]);
  for (const ex of [18, 494]) for (const ey of [18, 110]) { ctx.fillStyle = '#d9dde0'; ctx.beginPath(); ctx.arc(ex, ey, 7, 0, 7); ctx.fill(); ctx.fillStyle = '#5a3a20'; ctx.beginPath(); ctx.arc(ex, ey, 3, 0, 7); ctx.fill(); }
  ctx.font = '800 88px "Baloo 2", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(110,40,0,0.45)'; ctx.fillText(`POORTJE ${num}`, 259, 71);
  ctx.fillStyle = '#fff'; ctx.fillText(`POORTJE ${num}`, 256, 68);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const geo = new THREE.PlaneGeometry(half * 2, 0.5, 14, 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) { const u = pos.getX(i) / half, v = pos.getY(i) / 0.25; pos.setZ(i, (1 - u * u) * (0.05 + (1 - v) * 0.025) + Math.sin(u * 9) * 0.012); }
  geo.computeVertexNormals();
  const banner = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, emissive: 0x000000, roughness: 0.85 }));
  banner.position.y = 2.1;
  banner.castShadow = true;
  g.add(banner);
  // paaltjes, dwarsbuis en doppen: één samengevoegd stuk aluminium
  const bits = [];
  for (const x of [-half, half]) {
    bits.push(new THREE.CylinderGeometry(0.04, 0.04, 2.35, 10).translate(x, 1.18, 0));
    bits.push(new THREE.SphereGeometry(0.055, 10, 8).translate(x, 2.37, 0));
  }
  bits.push(new THREE.CylinderGeometry(0.022, 0.022, half * 2, 8).rotateZ(Math.PI / 2).translate(0, 2.37, 0));
  g.add(mesh(mergeGeometries(bits), std(0xf2f4f5, { roughness: 0.35, metalness: 0.35 })));
  g.userData.banner = banner;
  return g;
}

// Pionnen langs de gevel f (frame van een pand). Geeft { time, penalty, total } terug.
// Je rijdt door elk poortje (tussen de twee pionnen door), zigzaggend, en dan over de finish.
export function startSlalom(g, f, { gates = 6, spacing = 7, limit = 30 } = {}) {
  const w = g.world;
  const HALF = 1.6; // halve breedte van een poortje
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
  const along = Math.atan2(f.ux, f.uz);
  const group = new THREE.Group();
  g.scene.add(group);
  const cones = [];
  const gateList = [];
  for (let i = 0; i < gates; i++) {
    const s = 6 + i * spacing, off = i % 2 ? 1.5 : -1.5;
    const gate = { s, off, passed: false, cones: [] };
    gateList.push(gate);
    for (const side of [-HALF, HALF]) {
      const c = makeCone();
      gate.cones.push(c);
      const [x, z] = P(s, off + side);
      c.position.set(x, w.groundAt(x, z), z);
      group.add(c);
      cones.push({ m: c, x, z, hit: false });
    }
    const arch = makeGate(i + 1, HALF);
    const [ax, az] = P(s, off);
    arch.position.set(ax, w.groundAt(ax, az), az);
    arch.rotation.y = along + Math.PI; // doek dwars op de baan, tekst naar de fietser
    group.add(arch);
    gate.arch = arch;
  }
  // groene pijl boven het volgende poortje
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.7, 4), new THREE.MeshBasicMaterial({ color: 0x00e676 }));
  arrow.rotation.x = Math.PI;
  group.add(arrow);
  // startlijn en finishboog
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const s of [2, len - 3]) {
    const [x, z] = P(s, 0);
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.02, 6), lineMat); // dwars op de baan
    l.rotation.y = Math.atan2(f.nx, f.nz);
    l.position.set(x, w.groundAt(x, z) + 0.05, z);
    group.add(l);
  }
  const fin = makeFinishBanner(6.4);
  { const [x, z] = P(len - 3, 0); fin.position.set(x, w.groundAt(x, z), z); fin.rotation.y = along + Math.PI; fin.scale.setScalar(0.8); group.add(fin); }
  // speler op de fiets bij de start
  if (g.mode === 'car') g.exitCar();
  g.setMode('bike');
  const [sx, sz] = P(-3, 0);
  g.player.x = sx; g.player.z = sz;
  g.player.heading = along;
  g.player.speed = 0;
  g.camYaw = g.player.heading + Math.PI;
  let t = -3, started = false, penalty = 0, good = 0;
  g.ui.toast('3...', 800);
  setTimeout(() => g.minigame && g.ui.toast('2...', 800), 1000);
  setTimeout(() => g.minigame && g.ui.toast('1...', 800), 2000);
  setTimeout(() => g.minigame && g.ui.toast('Gaan! Rij tussen de pionnen door', 1400), 3000);
  return runMini(g, (dt, finish) => {
    const p = g.player;
    p.lockedFor = false; // het gesprek zet de speler vast; tijdens de slalom moet je juist kunnen fietsen
    const dx = p.x - P(0, 0)[0], dz = p.z - P(0, 0)[1];
    const s = dx * f.ux + dz * f.uz, l = dx * f.nx + dz * f.nz;
    t += dt;
    const next = gateList.find((q) => !q.passed);
    if (next) {
      const [x, z] = P(next.s, next.off);
      arrow.visible = true;
      arrow.position.set(x, w.groundAt(x, z) + 3 + Math.sin(t * 5) * 0.2, z);
      arrow.rotation.y += dt * 3;
      next.arch.userData.banner.material.emissive.setHex(Math.sin(t * 8) > 0 ? 0x553300 : 0x000000);
    } else arrow.visible = false;
    if (t < 0) { p.speed = 0; p.x = sx; p.z = sz; g.ui.timer(`max ${limit} s`); return; } // aftellen
    if (!started && s > 2) started = true;
    const used = started ? t : 0;
    // klok telt op; strafseconden apart, zodat je ziet waar je staat
    g.ui.timer(`${(used + penalty).toFixed(1)} / ${limit} s${penalty ? ` (+${penalty})` : ''}`);
    for (const gt of gateList) {
      if (gt.passed || s < gt.s) continue;
      gt.passed = true;
      const ok = Math.abs(l - gt.off) <= HALF;
      if (ok) good++;
      gt.arch.userData.banner.material.emissive.setHex(0x000000);
      gt.arch.userData.banner.material.color.set(ok ? 0x66bb6a : 0xef5350);
      // pionnen van het poortje kleuren groen (goed) of rood (gemist) en springen even op
      for (const c of gt.cones) {
        c.traverse((o) => { if (o.isMesh && o.material.color.getHex() === 0xff6d00) { o.material = o.material.clone(); o.material.color.set(ok ? 0x43a047 : 0xe53935); o.material.emissive = new THREE.Color(ok ? 0x1b5e20 : 0x7f0000); } });
        let k = 0; const y0 = c.position.y;
        const hop = () => { k += 0.08; c.position.y = y0 + Math.sin(Math.min(1, k) * Math.PI) * 0.5; if (k < 1) requestAnimationFrame(hop); };
        hop();
      }
      if (!ok) { penalty += 3; g.ui.toast('Naast het poortje! +3 s', 1200); g.sfx?.play('fail'); }
      else { g.sfx?.play('pop'); g.ui.toast(['Mooi!', 'Strak!', 'Netjes!', 'Zo!'][good % 4], 600); }
      g.missions.progress(`Poortjes ${good} / ${gates} goed`);
    }
    for (const c of cones) {
      if (c.hit || Math.hypot(p.x - c.x, p.z - c.z) > 0.45) continue;
      c.hit = true; penalty += 1;
      c.m.rotation.z = Math.PI / 2.3; c.m.rotation.y = Math.random() * 6;
      g.ui.toast('Pion omver! +1 s', 900);
      g.sfx?.play('kick');
    }
    if (s >= len - 3 && started) finish({ time: t, penalty, total: t + penalty, good });
    else if (t + penalty > limit) finish({ time: t, penalty, total: Infinity, late: true, good });
    else if (Math.abs(l) > 14 || s < -15) finish({ time: t, penalty, total: Infinity, off: true, good });
  }, () => { g.scene.remove(group); g.ui.timer(null); }, { P, gateList, len });
}

// ------------------------------------------------------------ pils vangen

// Tekenhulpjes voor het vangspel. Alles wat niet beweegt (het café, de toog) en alles wat vaak terugkomt
// (glas, dienblad, arm) wordt één keer voorgetekend op een los canvas; per beeld is het dan alleen plakken.
const offscreen = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const seeded = (seed) => { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
const LAMPS = [0, 1, 2, 3, 4, 5].map((i) => 0.1 + i * 0.16); // plek van de hanglampen (deel van de breedte)

// Het café achter de toog: onscherp (klein getekend en uitvergroot, zoals een camera met weinig scherptediepte),
// warm verlicht door hanglampen, met de avond achter de ramen. Tekent in eenheden van u (1/100 van de hoogte).
function paintCafeRoom(Wu, Hu, mu) {
  const S = 2.5, rnd = seeded(23);
  const c = offscreen((Wu + 2 * mu) * S, (Hu + mu) * S), x = c.getContext('2d');
  x.scale(S, S); x.translate(mu, mu);
  // muur: donker bovenin, warm waar het lamplicht valt
  let g = x.createLinearGradient(0, 0, 0, Hu);
  g.addColorStop(0, '#120a06'); g.addColorStop(0.3, '#3d2514'); g.addColorStop(0.62, '#5a381f'); g.addColorStop(1, '#3a2313');
  x.fillStyle = g; x.fillRect(-mu, -mu, Wu + 2 * mu, Hu + mu);
  // ramen links en rechts: koel avondlicht tegenover het warme café
  for (const wx of [0.035, 0.845]) {
    const x0 = Wu * wx, ww = Wu * 0.12, y0 = Hu * 0.2, wh = Hu * 0.42;
    g = x.createLinearGradient(0, y0, 0, y0 + wh); g.addColorStop(0, '#20355c'); g.addColorStop(0.7, '#4a6a94'); g.addColorStop(1, '#8a7a78');
    x.fillStyle = g; x.fillRect(x0, y0, ww, wh);
    x.fillStyle = '#ffd9a0'; for (let i = 0; i < 4; i++) x.fillRect(x0 + ww * (0.15 + rnd() * 0.7), y0 + wh * (0.62 + rnd() * 0.25), 1.2, 1.6); // lichtjes aan de overkant
    x.strokeStyle = '#24140a'; x.lineWidth = 1.6; x.strokeRect(x0, y0, ww, wh);
    x.beginPath(); x.moveTo(x0 + ww / 2, y0); x.lineTo(x0 + ww / 2, y0 + wh); x.moveTo(x0, y0 + wh * 0.4); x.lineTo(x0 + ww, y0 + wh * 0.4); x.stroke();
    x.fillStyle = 'rgba(120,40,30,0.75)'; x.fillRect(x0 - 2.5, y0 - 1.5, 5, wh + 3); x.fillRect(x0 + ww - 2.5, y0 - 1.5, 5, wh + 3); // gordijnen
  }
  // lijstjes aan de muur
  for (const fx of [0.24, 0.335, 0.63, 0.74]) {
    const fw = 8 + rnd() * 7, fh = 9 + rnd() * 6, x0 = Wu * fx, y0 = Hu * (0.24 + rnd() * 0.08);
    x.fillStyle = '#1d1009'; x.fillRect(x0, y0, fw, fh);
    x.fillStyle = ['#8a7a5c', '#6f7f6a', '#9a6a48', '#77706a'][Math.floor(rnd() * 4)]; x.fillRect(x0 + 1.2, y0 + 1.2, fw - 2.4, fh - 2.4);
  }
  // plank met flessen in het midden
  const sx0 = Wu * 0.41, sw = Wu * 0.18, sy = Hu * 0.5;
  x.fillStyle = 'rgba(20,10,5,0.55)'; x.fillRect(sx0 - 1, sy - 15, sw + 2, 15);
  for (let bx = sx0 + 1; bx < sx0 + sw - 2; bx += 2.3 + rnd() * 1.1) {
    const bh = 5 + rnd() * 4.5, bw = 1.4 + rnd() * 0.6;
    x.fillStyle = ['#2a5a33', '#9a661c', '#b9b29f', '#4f2014', '#a8862f', '#33506b'][Math.floor(rnd() * 6)];
    x.fillRect(bx, sy - bh, bw, bh); x.fillRect(bx + bw * 0.3, sy - bh - 2.6, bw * 0.4, 2.8);
    x.fillStyle = 'rgba(255,240,200,0.5)'; x.fillRect(bx + bw * 0.15, sy - bh + 0.8, bw * 0.2, bh - 1.6);
  }
  x.fillStyle = '#7a4d26'; x.fillRect(sx0 - 2, sy, sw + 4, 1.6);
  // lambrisering: staande planken met een lijst erboven
  const ly = Hu * 0.66;
  for (let px = -mu - 3; px < Wu + mu; px += 7) { const k = 0.75 + rnd() * 0.5; x.fillStyle = `rgba(${Math.round(52 * k)},${Math.round(29 * k)},${Math.round(14 * k)},0.92)`; x.fillRect(px, ly, 6.6, Hu - ly); }
  x.fillStyle = '#6b4322'; x.fillRect(-mu, ly - 1.4, Wu + 2 * mu, 1.8);
  // gasten aan tafeltjes: donkere gestalten met een kaarsje op tafel
  for (const gx of [0.19, 0.29, 0.55, 0.68, 0.79]) {
    const cx = Wu * (gx + (rnd() - 0.5) * 0.03), by = Hu * (0.93 + rnd() * 0.05), sc = 0.85 + rnd() * 0.3;
    x.fillStyle = 'rgba(16,9,5,0.7)';
    x.beginPath(); x.ellipse(cx, by - 15 * sc, 3.4 * sc, 4 * sc, 0, 0, 7); x.fill();
    x.beginPath(); x.ellipse(cx, by, 8 * sc, 11 * sc, 0, Math.PI, 0); x.fill();
    x.fillStyle = 'rgba(255,196,110,0.85)'; x.beginPath(); x.arc(cx + 11 * sc, by - 4, 0.9, 0, 7); x.fill();
  }
  // hanglampen: snoer, koperen kap en het gloeiende peertje eronder
  for (const lf of LAMPS) {
    const lx = Wu * lf, ly2 = 12;
    g = x.createRadialGradient(lx, ly2 + 1, 0, lx, ly2 + 1, 20);
    g.addColorStop(0, 'rgba(255,214,150,0.6)'); g.addColorStop(0.3, 'rgba(255,170,90,0.22)'); g.addColorStop(1, 'rgba(255,150,60,0)');
    x.fillStyle = g; x.fillRect(lx - 20, ly2 - 19, 40, 40);
    x.strokeStyle = '#0c0704'; x.lineWidth = 0.5; x.beginPath(); x.moveTo(lx, -mu); x.lineTo(lx, ly2 - 5); x.stroke();
    x.fillStyle = '#7b4a22'; x.beginPath(); x.moveTo(lx - 1.6, ly2 - 5.5); x.lineTo(lx + 1.6, ly2 - 5.5); x.lineTo(lx + 5, ly2); x.lineTo(lx - 5, ly2); x.closePath(); x.fill();
    x.fillStyle = '#fff0cf'; x.beginPath(); x.ellipse(lx, ly2 + 0.6, 3.4, 1.5, 0, 0, 7); x.fill();
  }
  // losse lichtvlekjes (glazen, kaarsjes): geeft de onscherpte diepte
  for (let i = 0; i < 46; i++) {
    const r = 0.5 + rnd() * 1.6;
    x.fillStyle = `rgba(255,${170 + rnd() * 60},${90 + rnd() * 70},${0.06 + rnd() * 0.2})`;
    x.beginPath(); x.arc(rnd() * Wu, Hu * (0.22 + rnd() * 0.7), r, 0, 7); x.fill();
  }
  return c;
}

// Het hele vaste beeld: het onscherpe café, de gelakte houten toog (vanaf 79% van de hoogte) en een vignet.
// M is een rand rondom, zodat het trillen bij een gebroken glas geen kale strook laat zien.
function paintBarScene(W, H, M) {
  const u = H / 100, rnd = seeded(7), barY = H * 0.79;
  const c = offscreen(W + 2 * M, H + 2 * M), x = c.getContext('2d');
  x.translate(M, M);
  // café: klein voortekenen, verzachten en dan uitvergroten = onscherpte zoals bij weinig scherptediepte
  const room = paintCafeRoom(Math.min(W / u, 700), 80, Math.min(M / u, 12)); // begrensd, voor het geval het canvas (nog) bijna geen hoogte heeft
  let soft = offscreen(room.width / 2, room.height / 2); soft.getContext('2d').drawImage(room, 0, 0, soft.width, soft.height);
  for (const r of [0.9, 1.8]) { // twee keer een rondje verschoven kopieën middelen = egale onscherpte, ook op toestellen zonder canvasfilter
    const d = offscreen(soft.width, soft.height), dx = d.getContext('2d');
    [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r * 0.7, r * 0.7], [-r * 0.7, r * 0.7], [r * 0.7, -r * 0.7], [-r * 0.7, -r * 0.7]].forEach(([ox, oy], i) => { dx.globalAlpha = 1 / (i + 1); dx.drawImage(soft, ox, oy); });
    soft = d;
  }
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  x.drawImage(soft, -M, -M, W + 2 * M, 80 * u + M);
  // lichtkegels onder de lampen
  x.globalCompositeOperation = 'lighter';
  for (const lf of LAMPS) {
    const lx = W * lf, g = x.createRadialGradient(lx, 14 * u, 0, lx, 30 * u, 44 * u);
    g.addColorStop(0, 'rgba(255,190,110,0.16)'); g.addColorStop(1, 'rgba(255,160,70,0)');
    x.fillStyle = g; x.fillRect(lx - 46 * u, 0, 92 * u, barY);
  }
  x.globalCompositeOperation = 'source-over';
  // schaduw vlak achter de toog (de vloer zie je niet)
  let g = x.createLinearGradient(0, barY - 9 * u, 0, barY); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(8,4,2,0.62)');
  x.fillStyle = g; x.fillRect(-M, barY - 9 * u, W + 2 * M, 9 * u);
  // de toog: donker gelakt hout
  g = x.createLinearGradient(0, barY, 0, H + M);
  g.addColorStop(0, '#5a3619'); g.addColorStop(0.18, '#43260f'); g.addColorStop(0.6, '#2c170a'); g.addColorStop(1, '#190d06');
  x.fillStyle = g; x.fillRect(-M, barY, W + 2 * M, H - barY + M);
  // nerf: lange, licht golvende strepen, dichter op elkaar naar achteren (perspectief)
  const bh = H - barY + M;
  x.lineCap = 'round';
  for (let i = 0; i < 150; i++) {
    const d = Math.pow(rnd(), 1.5), y = barY + 0.4 * u + d * bh, len = (18 + rnd() * 70) * u * (0.5 + d), x0 = -M + rnd() * (W + 2 * M) - len / 2;
    x.strokeStyle = rnd() < 0.55 ? `rgba(196,128,62,${0.05 + rnd() * 0.13})` : `rgba(8,3,1,${0.08 + rnd() * 0.2})`;
    x.lineWidth = Math.max(0.6, (0.1 + rnd() * 0.3) * u * (0.45 + d));
    x.beginPath(); x.moveTo(x0, y); x.bezierCurveTo(x0 + len * 0.3, y + (rnd() - 0.5) * u * (0.3 + d), x0 + len * 0.7, y + (rnd() - 0.5) * u * (0.3 + d), x0 + len, y + (rnd() - 0.5) * 0.5 * u); x.stroke();
  }
  // naden tussen de planken
  for (const f of [0.2, 0.52]) { x.fillStyle = 'rgba(6,2,1,0.5)'; x.fillRect(-M, barY + (H - barY) * f, W + 2 * M, Math.max(1, 0.22 * u)); x.fillStyle = 'rgba(255,200,140,0.1)'; x.fillRect(-M, barY + (H - barY) * f + Math.max(1, 0.22 * u), W + 2 * M, Math.max(1, 0.16 * u)); }
  // de lampen spiegelen in de lak: langgerekte warme vegen
  x.globalCompositeOperation = 'lighter';
  for (const lf of LAMPS) {
    x.save(); x.translate(W * lf, barY + 0.6 * u); x.scale(1, 3.4);
    const rg = x.createRadialGradient(0, 0, 0, 0, 0, 5.5 * u); rg.addColorStop(0, 'rgba(255,196,120,0.34)'); rg.addColorStop(0.4, 'rgba(255,150,70,0.12)'); rg.addColorStop(1, 'rgba(255,140,60,0)');
    x.fillStyle = rg; x.fillRect(-6 * u, 0, 12 * u, 6 * u); x.restore();
  }
  x.globalCompositeOperation = 'source-over';
  // achterrand van de toog vangt licht
  g = x.createLinearGradient(0, barY - 0.2 * u, 0, barY + 1.1 * u); g.addColorStop(0, 'rgba(255,214,160,0.75)'); g.addColorStop(0.35, 'rgba(255,190,120,0.3)'); g.addColorStop(1, 'rgba(255,190,120,0)');
  x.fillStyle = g; x.fillRect(-M, barY - 0.2 * u, W + 2 * M, 1.3 * u);
  // vignet: de hoeken donkerder, zoals door een lens
  const R = Math.hypot(W, H) / 2;
  g = x.createRadialGradient(W / 2, H * 0.5, R * 0.45, W / 2, H * 0.5, R * 1.05); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.62)');
  x.fillStyle = g; x.fillRect(-M, -M, W + 2 * M, H + 2 * M);
  return c;
}

// Een glas pils: licht van linksboven, een schuimkraag, belletjes en een dik glazen voetje.
// Zelfde omtrek als altijd (boven 3,4u breed, onder 80% daarvan, 11u hoog); het ankerpunt is midden onder.
// stand: het glas staat op het dienblad (met een schaduwtje eronder).
function paintGlass(u, fill, stand = false) {
  const gw = 3.4 * u, gh = 11 * u, pad = Math.ceil(1.4 * u), rnd = seeded(5);
  const c = offscreen(gw + 2 * pad, gh + 2 * pad), x = c.getContext('2d');
  x.translate(c.width / 2, pad + gh);
  const body = () => { x.beginPath(); x.moveTo(-gw / 2, -gh); x.lineTo(gw / 2, -gh); x.lineTo(gw * 0.4, 0); x.lineTo(-gw * 0.4, 0); x.closePath(); };
  const level = -gh * 0.78 * fill, foot = -0.75 * u;
  if (stand) { const sg = x.createRadialGradient(0, 0, 0, 0, 0, gw * 0.75); sg.addColorStop(0, 'rgba(0,0,0,0.5)'); sg.addColorStop(1, 'rgba(0,0,0,0)'); x.save(); x.scale(1, 0.28); x.fillStyle = sg; x.fillRect(-gw, -gw, gw * 2, gw * 2); x.restore(); }
  x.save(); body(); x.clip();
  // het glas zelf: bijna doorzichtig, lichter langs de wanden
  let g = x.createLinearGradient(-gw / 2, 0, gw / 2, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.34)'); g.addColorStop(0.22, 'rgba(255,255,255,0.08)'); g.addColorStop(0.8, 'rgba(255,255,255,0.06)'); g.addColorStop(1, 'rgba(255,255,255,0.24)');
  x.fillStyle = g; x.fillRect(-gw, -gh, gw * 2, gh);
  // bier: goud in het midden, donkerder amber langs de randen en naar de bodem
  g = x.createLinearGradient(-gw / 2, 0, gw / 2, 0);
  g.addColorStop(0, '#a45a05'); g.addColorStop(0.2, '#f0a215'); g.addColorStop(0.42, '#ffd552'); g.addColorStop(0.68, '#f2a516'); g.addColorStop(1, '#8a4803');
  x.fillStyle = g; x.fillRect(-gw, level, gw * 2, foot - level);
  g = x.createLinearGradient(0, level, 0, foot); g.addColorStop(0, 'rgba(255,240,170,0.4)'); g.addColorStop(0.35, 'rgba(255,200,60,0)'); g.addColorStop(1, 'rgba(110,45,0,0.5)');
  x.fillStyle = g; x.fillRect(-gw, level, gw * 2, foot - level);
  x.fillStyle = 'rgba(255,248,210,0.75)';
  for (let i = 0; i < 9; i++) { x.beginPath(); x.arc((rnd() - 0.5) * gw * 0.6, level + (foot - level) * (0.15 + rnd() * 0.8), Math.max(0.5, (0.1 + rnd() * 0.12) * u), 0, 7); x.fill(); }
  // dik glazen voetje
  g = x.createLinearGradient(0, foot, 0, 0); g.addColorStop(0, 'rgba(255,255,255,0.85)'); g.addColorStop(0.3, 'rgba(200,222,232,0.6)'); g.addColorStop(1, 'rgba(110,140,158,0.8)');
  x.fillStyle = g; x.fillRect(-gw, foot, gw * 2, -foot);
  // schuimkraag: bol, licht van linksboven
  g = x.createRadialGradient(-gw * 0.2, level - 1.3 * u, 0, 0, level - 0.6 * u, gw * 0.75);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#fff4d8'); g.addColorStop(1, '#d9c08e');
  x.fillStyle = g;
  x.beginPath(); x.ellipse(0, level - 0.6 * u, gw * 0.56, 1.3 * u, 0, 0, 7); x.fill();
  for (const [bx, br] of [[-0.3, 0.55], [0, 0.7], [0.28, 0.5]]) { x.beginPath(); x.arc(bx * gw, level - 1.35 * u, br * u, 0, 7); x.fill(); }
  x.restore();
  // lichtstrepen op het glas: een brede links, een dunne rechts
  g = x.createLinearGradient(0, -gh, 0, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.12, 'rgba(255,255,255,0.7)'); g.addColorStop(0.8, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.beginPath(); x.moveTo(-gw * 0.36, -gh * 0.97); x.lineTo(-gw * 0.24, -gh * 0.97); x.lineTo(-gw * 0.2, -0.9 * u); x.lineTo(-gw * 0.29, -0.9 * u); x.closePath(); x.fill();
  x.globalAlpha = 0.5; x.beginPath(); x.moveTo(gw * 0.33, -gh * 0.95); x.lineTo(gw * 0.38, -gh * 0.95); x.lineTo(gw * 0.31, -1 * u); x.lineTo(gw * 0.27, -1 * u); x.closePath(); x.fill(); x.globalAlpha = 1;
  // omtrek van het glas en de rand bovenin
  body(); x.strokeStyle = 'rgba(255,255,255,0.8)'; x.lineWidth = Math.max(1.2, u * 0.26); x.lineJoin = 'round'; x.stroke();
  x.strokeStyle = 'rgba(255,255,255,0.95)'; x.lineWidth = Math.max(1, u * 0.2); x.beginPath(); x.ellipse(0, -gh, gw / 2, 0.3 * u, 0, 0, 7); x.stroke();
  return { c, ax: c.width / 2, ay: pad + gh };
}

// Roestvrijstalen dienblad, schuin van boven gezien: 18u breed, met opstaande rand. Ankerpunt: midden van het blad.
function paintTray(u) {
  const tw = 18 * u, ry = 1.7 * u, th = 0.9 * u, pad = Math.ceil(0.8 * u);
  const c = offscreen(tw + 2 * pad, 2 * ry + th + 2 * pad), x = c.getContext('2d');
  x.translate(c.width / 2, pad + ry);
  // zijkant (de dikte van het blad), donker met een paar lichtbanden
  let g = x.createLinearGradient(-tw / 2, 0, tw / 2, 0);
  g.addColorStop(0, '#3f464c'); g.addColorStop(0.18, '#9aa2a8'); g.addColorStop(0.36, '#555c62'); g.addColorStop(0.62, '#aab1b7'); g.addColorStop(0.85, '#5b6268'); g.addColorStop(1, '#353b40');
  x.fillStyle = g;
  x.beginPath(); x.ellipse(0, th, tw / 2, ry, 0, 0, Math.PI); x.lineTo(-tw / 2, 0); x.ellipse(0, 0, tw / 2, ry, 0, Math.PI, 0, true); x.closePath(); x.fill();
  // bovenkant: geborsteld staal met banden van licht
  g = x.createLinearGradient(-tw / 2, 0, tw / 2, 0);
  g.addColorStop(0, '#8a9197'); g.addColorStop(0.14, '#dde1e4'); g.addColorStop(0.3, '#fbfcfc'); g.addColorStop(0.46, '#b4bbc1'); g.addColorStop(0.62, '#eceff1'); g.addColorStop(0.82, '#a3aab0'); g.addColorStop(1, '#787f85');
  x.fillStyle = g; x.beginPath(); x.ellipse(0, 0, tw / 2, ry, 0, 0, 7); x.fill();
  // verdiept binnenvlak: iets donkerder, met een warme weerschijn van de lampen
  g = x.createLinearGradient(0, -ry, 0, ry); g.addColorStop(0, 'rgba(40,30,20,0.34)'); g.addColorStop(0.5, 'rgba(120,90,60,0.12)'); g.addColorStop(1, 'rgba(255,220,170,0.16)');
  x.fillStyle = g; x.beginPath(); x.ellipse(0, 0.08 * u, tw * 0.47, ry * 0.8, 0, 0, 7); x.fill();
  // opstaande rand: lichtlijn achter en voor
  x.lineWidth = Math.max(1, 0.22 * u);
  x.strokeStyle = 'rgba(255,255,255,0.95)'; x.beginPath(); x.ellipse(0, 0, tw / 2 - x.lineWidth / 2, ry - x.lineWidth / 2, 0, 0, 7); x.stroke();
  x.strokeStyle = 'rgba(30,34,38,0.45)'; x.beginPath(); x.ellipse(0, 0.08 * u, tw * 0.47, ry * 0.8, 0, Math.PI, Math.PI * 2); x.stroke();
  return { c, ax: c.width / 2, ay: pad + ry };
}

// De arm van de ober onder het blad: hand, pols en een witte mouw. Ankerpunt: midden boven (onderkant van het blad).
function paintArm(u, h) {
  const w = 13 * u, c = offscreen(w, h), x = c.getContext('2d');
  x.translate(w / 2, 0);
  // mouw
  let g = x.createLinearGradient(-3.4 * u, 0, 3.4 * u, 0); g.addColorStop(0, '#fbf6ec'); g.addColorStop(0.45, '#e4dccd'); g.addColorStop(1, '#8f8676');
  x.fillStyle = g; x.beginPath(); x.moveTo(-2.5 * u, 6.2 * u); x.lineTo(2.5 * u, 6.2 * u); x.lineTo(3.8 * u, h); x.lineTo(-3.8 * u, h); x.closePath(); x.fill();
  x.fillStyle = 'rgba(60,50,40,0.35)'; x.fillRect(-2.7 * u, 7.5 * u, 5.4 * u, Math.max(1, 0.2 * u));
  // hand: breed onder het blad, smaller naar de pols
  g = x.createLinearGradient(-4 * u, 0, 4 * u, 0); g.addColorStop(0, '#f8d6b2'); g.addColorStop(0.4, '#ecbf96'); g.addColorStop(1, '#a8754f');
  x.fillStyle = g;
  x.beginPath(); x.moveTo(-3.6 * u, 1.2 * u); x.quadraticCurveTo(-4.4 * u, 0.3 * u, -3.2 * u, 0.2 * u); x.lineTo(3.4 * u, 0.2 * u); x.quadraticCurveTo(4.2 * u, 1.6 * u, 2.6 * u, 4 * u); x.lineTo(1.9 * u, 6.6 * u); x.lineTo(-1.9 * u, 6.6 * u); x.lineTo(-2.4 * u, 4 * u); x.closePath(); x.fill();
  x.beginPath(); x.ellipse(-3.9 * u, 2 * u, 1 * u, 1.9 * u, 0.5, 0, 7); x.fill(); // duim
  x.strokeStyle = 'rgba(120,70,40,0.4)'; x.lineWidth = Math.max(1, 0.18 * u);
  for (const fx of [-1.5, 0.1, 1.7]) { x.beginPath(); x.moveTo(fx * u, 0.4 * u); x.lineTo(fx * u * 0.8, 2.6 * u); x.stroke(); } // vingers
  // schaduw van het blad over de hand
  g = x.createLinearGradient(0, 0, 0, 3.6 * u); g.addColorStop(0, 'rgba(40,18,6,0.7)'); g.addColorStop(1, 'rgba(40,18,6,0)');
  x.fillStyle = g; x.fillRect(-5.5 * u, 0, 11 * u, 3.6 * u);
  return { c, ax: w / 2, ay: 0 };
}

// Zachte ronde vlek (schaduw of lichtgloed), om uitgerekt te plakken.
function paintBlob(size, rgb) {
  const c = offscreen(size, size), x = c.getContext('2d'), r = size / 2;
  const g = x.createRadialGradient(r, r, 0, r, r, r); g.addColorStop(0, `rgba(${rgb},1)`); g.addColorStop(0.45, `rgba(${rgb},0.45)`); g.addColorStop(1, `rgba(${rgb},0)`);
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  return c;
}

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
  // voorgetekende plaatjes (achtergrond, glas, dienblad, arm); opnieuw bij een andere canvasmaat
  const MARGIN = 20;
  let art = null;
  const artFor = (W, H) => {
    if (art && art.W === W && art.H === H) return art;
    const u = H / 100;
    art = { W, H, bg: paintBarScene(W, H, MARGIN), glass: paintGlass(u, 1), small: paintGlass(u * 0.75, 0.6, true), tray: paintTray(u), arm: paintArm(u, Math.ceil(H * 0.1 + MARGIN)), shadow: paintBlob(64, '0,0,0'), glow: paintBlob(96, '255,196,120') };
    return art;
  };
  const stamp = (s, x, y, r = 0) => {
    if (!r) { ctx.drawImage(s.c, x - s.ax, y - s.ay); return; }
    ctx.save(); ctx.translate(x, y); ctx.rotate(r); ctx.drawImage(s.c, -s.ax, -s.ay); ctx.restore();
  };
  const draw = () => {
    fitCanvas(cv);
    const W = cv.width, H = cv.height, u = H / 100, A = artFor(W, H);
    ctx.save();
    if (shakeT > 0) ctx.translate((Math.random() - 0.5) * 12 * shakeT, (Math.random() - 0.5) * 12 * shakeT);
    ctx.drawImage(A.bg, -MARGIN, -MARGIN);
    // lampjes die zacht flikkeren
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) { ctx.globalAlpha = 0.2 + Math.sin(t * 2 + i) * 0.1; ctx.drawImage(A.glow, W * LAMPS[i] - 10 * u, H * 0.12 - 9 * u, 20 * u, 20 * u); }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    if (barFlash > 0) { ctx.fillStyle = `rgba(255,80,60,${barFlash * 0.35})`; ctx.fillRect(0, H * 0.79, W, H); }
    // zachte schaduwen op de toog: onder elk vallend glas (groter en donkerder naarmate het lager komt) en onder het blad
    for (const gl of glasses) {
      const k = Math.min(1, Math.max(0, gl.y)), rx = (2.4 + k * 3.8) * u, ry = 1.3 * u;
      ctx.globalAlpha = 0.3 + k * 0.5; ctx.drawImage(A.shadow, gl.x * W - rx, H * 0.95 - ry, rx * 2, ry * 2);
    }
    const tw = 18 * u, ty = H * 0.9, tilt = Math.max(-0.25, Math.min(0.25, trayV * 0.12)) + Math.sin(wobble * 30) * wobble * 0.08;
    ctx.globalAlpha = 0.6; ctx.drawImage(A.shadow, trayX * W - tw * 0.62, H * 0.968 - 2 * u, tw * 1.24, 4 * u);
    ctx.globalAlpha = 1;
    // vallende glazen pils
    for (const gl of glasses) stamp(A.glass, gl.x * W, gl.y * H, gl.r);
    // arm van de ober, dan het dienblad met kanteling en de gevangen glazen erop
    stamp(A.arm, trayX * W, ty + 0.7 * u);
    ctx.save(); ctx.translate(trayX * W, ty); ctx.rotate(tilt);
    stamp(A.tray, 0, 0);
    for (let i = 0; i < Math.min(stack, 6); i++) stamp(A.small, (i - Math.min(stack, 6) / 2 + 0.5) * 2.6 * u, -0.2 * u);
    ctx.restore();
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
export async function startParking(g, near, { need = 5, limit = 120, lot: lotId = null } = {}) {
  const w = g.world, cars = g.cars;
  // alleen vakken op de parkeerplaats van de missie (als die bekend is)
  const lot = w.parkingSpots
    .filter((s) => lotId == null || s.lot === lotId)
    .map((s) => ({ ...s, d: Math.hypot(s.x - near[0], s.z - near[1]) }))
    .filter((s) => s.d < 90)
    .sort((a, b) => a.d - b.d);
  const occupied = (x, z, r = 2.0) => cars.cars.concat(cars.traffic).some((c) => !c.mission && Math.hypot(c.x - x, c.z - z) < r);
  const lat = (s, k) => [s.x + Math.cos(s.heading) * 2.6 * k, s.z - Math.sin(s.heading) * 2.6 * k];
  const free = lot.filter((s) => !occupied(s.x, s.z));
  if (free.length < 3) return { none: true };
  // auto voor de speler aan de rand van de parkeerplaats
  // je begint op de parkeerplaats zelf: in een vrij vak vlak bij de klant (dat vak telt niet als doel)
  let cx, cz, ch;
  if (lotId != null) {
    const start = free[0];
    free.splice(0, 1);
    [cx, cz] = [start.x, start.z]; ch = start.heading;
  } else {
    const st = w.nearestStreet(free[0].x, free[0].z);
    [cx, cz] = w.resolve(st ? st.x : free[0].x + 12, st ? st.z : free[0].z + 12, 1.4);
    ch = Math.atan2(free[0].x - cx, free[0].z - cz);
  }
  const car = cars.addCar('hatch', cx, cz, ch, 0x2e7d32);
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

// Geverfd hout: bijna wit met donkere nerven en sleetse plekjes, zodat de verfkleur van het materiaal erdoorheen komt.
let woodTex = null;
function paintedWood() {
  if (woodTex) return woodTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), rnd = seeded(3);
  x.fillStyle = '#f6f2ec'; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 70; i++) { x.strokeStyle = `rgba(60,40,20,${0.05 + rnd() * 0.17})`; x.lineWidth = 0.5 + rnd() * 1.5; const y = rnd() * 128; x.beginPath(); x.moveTo(0, y); x.bezierCurveTo(40, y + (rnd() - 0.5) * 8, 90, y + (rnd() - 0.5) * 8, 128, y); x.stroke(); }
  for (let i = 0; i < 14; i++) { x.fillStyle = `rgba(120,90,60,${0.1 + rnd() * 0.15})`; x.beginPath(); x.ellipse(rnd() * 128, rnd() * 128, 2 + rnd() * 6, 1 + rnd() * 2, 0, 0, 7); x.fill(); }
  woodTex = new THREE.CanvasTexture(c); woodTex.colorSpace = THREE.SRGBColorSpace; woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping;
  return woodTex;
}
// geometrie een egale kleur geven (per hoekpunt), zodat stukken met verschillende kleuren samen één mesh kunnen zijn
function tinted(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo, col = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
// vleugel van bovenaf gezien: rechte voorrand, ronde punt en drie veerpunten aan de achterrand; blijft binnen het
// blok van 0,75 bij 0,45 dat als raakvlak dient. s = 1 (punt naar rechts) of -1 (naar links).
function wingGeometry(s) {
  const e = 0.012, a = 0.375 - e, b = 0.225 - e, sh = new THREE.Shape();
  sh.moveTo(-a * s, -b); sh.lineTo(-a * s, b); sh.lineTo((a - 0.13) * s, b);
  sh.quadraticCurveTo(a * s, b, a * s, b - 0.15);
  sh.quadraticCurveTo(a * s, -b, (a - 0.14) * s, -b);
  sh.lineTo((a - 0.25) * s, -b + 0.07); sh.quadraticCurveTo((a - 0.26) * s, -b, (a - 0.36) * s, -b);
  sh.lineTo((a - 0.5) * s, -b + 0.07); sh.quadraticCurveTo((a - 0.51) * s, -b, (a - 0.61) * s, -b);
  sh.closePath();
  return new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: e, bevelSegments: 2, curveSegments: 6 }).rotateX(Math.PI / 2).center();
}

// De houten vogel. Elk stuk (romp, kop, staart, twee vleugels) is een onzichtbaar raakvlak met precies de oude vorm
// en plek (daar rekent het schieten mee), met daaraan vast wat je ziet: afgerond, gesneden en geverfd hout.
// Wat je ziet doet niet mee bij het schieten (raycast uit) en blijft binnen het raakvlak.
function makeBird() {
  const g = new THREE.Group();
  const hit = new THREE.MeshBasicMaterial({ visible: false });
  const wood = new THREE.MeshStandardMaterial({ map: paintedWood(), vertexColors: true, roughness: 0.48 });
  const look = (geos) => { const m = new THREE.Mesh(mergeGeometries(geos), wood); m.castShadow = true; m.raycast = () => {}; return m; };
  const part = (geo, x, y, z, geos) => { const m = mesh(geo, hit, x, y, z); m.castShadow = false; m.add(look(geos)); return m; };
  const RED = 0xc62828, YEL = 0xfdd835, BLUE = 0x1565c0, GREEN = 0x2e7d32;
  const wing = (s) => [tinted(wingGeometry(s), GREEN), tinted(new RoundedBoxGeometry(0.46, 0.082, 0.1, 2, 0.03).translate(-0.1 * s, 0, 0.115), 0x7cb342)];
  const parts = {
    romp: part(new THREE.BoxGeometry(0.5, 0.5, 0.9), 0, 0, 0, [
      tinted(new RoundedBoxGeometry(0.5, 0.5, 0.9, 3, 0.1), RED),
      tinted(new RoundedBoxGeometry(0.504, 0.504, 0.07, 2, 0.1).translate(0, 0, 0.3), 0xf2b632), // gouden halsband
      tinted(new RoundedBoxGeometry(0.504, 0.504, 0.05, 2, 0.1).translate(0, 0, -0.34), 0xf5f1e6),
    ]),
    kop: part(new THREE.SphereGeometry(0.22, 12, 10), 0, 0.35, 0.55, [
      tinted(new THREE.SphereGeometry(0.22, 22, 16), YEL),
      tinted(new THREE.SphereGeometry(0.042, 10, 8).translate(0.14, 0.07, 0.15), 0x151515), // ogen
      tinted(new THREE.SphereGeometry(0.042, 10, 8).translate(-0.14, 0.07, 0.15), 0x151515),
    ]),
    staart: part(new THREE.BoxGeometry(0.4, 0.08, 0.55), 0, 0.1, -0.7, [
      tinted(new RoundedBoxGeometry(0.126, 0.08, 0.55, 2, 0.036), BLUE), // drie staartveren naast elkaar
      tinted(new RoundedBoxGeometry(0.126, 0.08, 0.5, 2, 0.036).translate(-0.137, 0, 0.025), 0x1e78d6),
      tinted(new RoundedBoxGeometry(0.126, 0.08, 0.5, 2, 0.036).translate(0.137, 0, 0.025), 0x1e78d6),
    ]),
    vleugelL: part(new THREE.BoxGeometry(0.75, 0.08, 0.45), -0.6, 0.1, 0, wing(-1)),
    vleugelR: part(new THREE.BoxGeometry(0.75, 0.08, 0.45), 0.6, 0.1, 0, wing(1)),
  };
  parts.vleugelL.rotation.z = 0.3; parts.vleugelR.rotation.z = -0.3;
  const beak = mesh(new THREE.ConeGeometry(0.07, 0.2, 8), new THREE.MeshStandardMaterial({ color: 0xff8f00, map: paintedWood(), roughness: 0.48 }), 0, 0.35, 0.82);
  beak.rotation.x = Math.PI / 2;
  parts.kop.add(beak); beak.position.set(0, 0, 0.27);
  for (const [k, m] of Object.entries(parts)) { m.userData.part = k; g.add(m); }
  g.userData.parts = parts;
  return g;
}

// De schutsboom: een verweerde houten paal met ijzeren banden, bovenop een ijzeren kom waar de vogel op staat.
function makePole() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const x = c.getContext('2d'), rnd = seeded(41);
  x.fillStyle = '#b3978a'; x.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 60; i++) { x.strokeStyle = rnd() < 0.6 ? `rgba(50,30,20,${0.08 + rnd() * 0.25})` : `rgba(255,235,210,${0.06 + rnd() * 0.14})`; x.lineWidth = 0.6 + rnd() * 1.6; const x0 = rnd() * 64; x.beginPath(); x.moveTo(x0, 0); x.bezierCurveTo(x0 + (rnd() - 0.5) * 6, 80, x0 + (rnd() - 0.5) * 6, 170, x0, 256); x.stroke(); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(2, 5);
  const pole = new THREE.Group();
  pole.add(mesh(new THREE.CylinderGeometry(0.12, 0.18, 14, 14), std(0xa58474, { map: tex, roughness: 0.85 }), 0, 7, 0));
  const iron = [new THREE.CylinderGeometry(0.21, 0.14, 0.16, 14).translate(0, 13.93, 0), new THREE.CylinderGeometry(0.26, 0.3, 0.24, 14).translate(0, 0.12, 0)];
  for (const y of [1.3, 7, 12.6]) { const r = 0.18 - 0.06 * (y / 14) + 0.012; iron.push(new THREE.CylinderGeometry(r, r, 0.14, 14).translate(0, y, 0)); }
  pole.add(mesh(mergeGeometries(iron), std(0x2e3033, { roughness: 0.5, metalness: 0.6 })));
  return pole;
}

// Met de buks op de houten vogel op de paal mikken. Geeft { hits, shots, king } terug.
export function startVogelschieten(g, pos, { shots = 14 } = {}) {
  const w = g.world;
  const [px, pz] = pos;
  const y0 = w.groundAt(px, pz);
  const pole = makePole();
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
  ov.className = 'mini-overlay aim vogel-ov';
  ov.innerHTML = `<div class="mini-head"><b>Vogelschieten</b><span class="mini-score">Schoten: ${shots}</span><button class="mini-stop" type="button">Stoppen</button></div>
    <div class="crosshair"></div>
    <div class="mini-hint">${g.input.isTouch ? 'Sleep om te richten, tik op Schiet' : 'Muis slepen of pijltjes om te richten, spatie of E om te schieten'} · schiet alle vijf stukken van de vogel eraf, de romp als laatste</div>`;
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
  let left = shots, hits = 0, t = 0, done = false;
  const shotDir = new THREE.Vector3();
  const falling = [];
  // steady: geen extra camerawiebel, zodat het vizier precies wijst waar de kogel heen gaat
  g.pov = { pos: eye.clone(), look: eye.clone(), snap: true, steady: true };
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
    const sway = 0.008 + (shots - left) * 0.001;
    const sy = yaw + Math.sin(t * 1.3) * sway + Math.sin(t * 3.1) * sway * 0.4;
    const sp = pitch + Math.sin(t * 1.7 + 1) * sway + Math.cos(t * 2.6) * sway * 0.4;
    aim.set(Math.sin(sy) * Math.cos(sp), Math.sin(sp), Math.cos(sy) * Math.cos(sp));
    g.pov.pos.copy(eye);
    g.pov.look.copy(eye).addScaledVector(aim, 10);
    for (const f of falling) { f.v -= 9.8 * dt; f.m.position.y += f.v * dt; f.m.position.x += (f.vx || 0) * dt; f.m.position.z += (f.vz || 0) * dt; f.m.rotation.x += dt * 4; f.m.rotation.z += dt * 3; }
    // wat je ziet: de camera kijkt (na de vorige frame) door het vizier
    g.camera.getWorldDirection(shotDir);
    if (!(shotDir.lengthSq() > 0.5)) shotDir.copy(aim);
    const pressed = g.input.consumeAction() || g.input.spacePressed;
    g.input.spacePressed = false;
    if (pressed && left > 0 && !done) {
      g.sfx?.play('kick');
      g.pov.shake = 0.5;
      pitch += 0.05; // terugslag
      flash(ov, 'gold');
      const ch = ov.querySelector('.crosshair'); bump(ch);
      // schiet precies door het midden van het beeld (waar het vizier staat), vóór de terugslag
      pole.updateMatrixWorld(true);
      ray.set(eye, shotDir.clone().normalize());
      const targets = Object.values(bird.userData.parts).filter((p) => p.parent === bird);
      const partOf = (o) => { while (o && !o.userData.part) o = o.parent; return o; };
      const all = ray.intersectObjects(targets, true);
      const rest = targets.filter((p) => p.userData.part !== 'romp').length;
      // zolang er nog stukken aan zitten, gaat de kogel door de romp naar het stuk erachter
      let hit = all[0];
      if (hit && rest > 0 && partOf(hit.object)?.userData.part === 'romp') hit = all.find((h) => partOf(h.object)?.userData.part !== 'romp') || hit;
      const part = partOf(hit?.object);
      // de romp valt pas als de rest eraf is; een schot op de romp kost dan geen kogel
      const early = part?.userData.part === 'romp' && rest > 0;
      if (!early) left--;
      if (hit) {
        ch.classList.remove('hit'); void ch.offsetWidth; ch.classList.add('hit');
        // houtsplinters
        for (let k = 0; k < 10; k++) {
          const sp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.2), std(0xd7b98a));
          sp.position.copy(hit.point);
          g.scene.add(sp);
          falling.push({ m: sp, v: 2 + Math.random() * 3, vx: (Math.random() - 0.5) * 4, vz: (Math.random() - 0.5) * 4 });
        }
        if (early) { popText(ov, 'Raak, maar de romp gaat pas als laatste! Dit schot telt niet.', 50, 36, 'small'); }
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
      if (hits >= 5) { done = true; setTimeout(() => finish({ hits, shots: shots - left, king: true }), 1500); }
      else if (left <= 0) { done = true; setTimeout(() => finish({ hits, shots, king: false }), 900); }
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
