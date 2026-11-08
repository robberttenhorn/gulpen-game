// Verbouwing aan de Oude Akerweg 43: het halve huis ligt open (een opengewerkte kamer, steigers,
// een container en een betonmolen), en de missie "Badkamer betegelen". Personen en verhaal zijn verzonnen.
import * as THREE from 'three';
import { popText, flash, bump, Particles, fitCanvas } from './minifx.js';

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; };

// kale muur met vlekken en losse stukken pleister
function plasterTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#c9c3b8'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 60; i++) { x.fillStyle = `rgba(${120 + Math.random() * 60},${110 + Math.random() * 50},${95 + Math.random() * 40},${0.15 + Math.random() * 0.25})`; x.beginPath(); x.arc(Math.random() * 256, Math.random() * 256, 4 + Math.random() * 26, 0, 7); x.fill(); }
  // stukjes baksteen waar de pleister eraf is
  for (let i = 0; i < 5; i++) {
    const bx = Math.random() * 200, by = Math.random() * 200;
    for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) { x.fillStyle = ['#9c4f35', '#8a4430', '#a85a3c'][(r + k) % 3]; x.fillRect(bx + k * 18 + (r % 2) * 9, by + r * 9, 16, 7); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

export function buildRenovation(g, [ax, az]) {
  const fac = g.facades, w = g.world;
  const f = fac.frameAtAddress(ax, az);
  if (!f) return null;
  const grp = fac.group(f, 0.02);
  const W = Math.max(3.6, Math.min(f.len - 0.8, 4.8)), D = 2.4, H = 2.8;
  // ---- opengewerkte kamer: geen voorgevel meer, je kijkt zo naar binnen
  const plaster = std(0xffffff, { map: plasterTexture() });
  grp.add(mesh(new THREE.BoxGeometry(W, 0.12, D), std(0x8f8a82, { roughness: 0.95 }), 0, 0.06, D / 2)); // betonvloer
  const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), plaster); back.position.set(0, H / 2, 0.04); grp.add(back);
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(D, H), plaster);
    side.position.set(s * W / 2, H / 2, D / 2); side.rotation.y = -s * Math.PI / 2; side.material.side = THREE.DoubleSide;
    grp.add(side);
    // afgebroken muurrand van baksteen
    grp.add(mesh(new THREE.BoxGeometry(0.22, H, 0.22), std(0x9c4f35), s * W / 2, H / 2, D));
  }
  // plafond met kale balken
  grp.add(mesh(new THREE.BoxGeometry(W + 0.2, 0.08, D + 0.1), std(0x8d7b68), 0, H + 0.04, D / 2));
  for (let i = 0; i < 6; i++) grp.add(mesh(new THREE.BoxGeometry(0.12, 0.22, D), std(0xb08a5a), -W / 2 + 0.35 + i * (W - 0.7) / 5, H - 0.12, D / 2));
  // kale lamp aan een snoer en losse draden
  const bulb = mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshStandardMaterial({ color: 0xfff1c8, emissive: 0xffc070, emissiveIntensity: 2.5 }), 0.3, H - 0.6, 1.2);
  grp.add(bulb, mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.5, 4), std(0x111111), 0.3, H - 0.3, 1.2));
  for (const [x, c] of [[-1, 0xe53935], [-0.85, 0x1e88e5], [-0.7, 0xfdd835]]) { const wire = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.9, 4), std(c), x, H - 0.5, 0.12); wire.rotation.z = 0.2; grp.add(wire); }
  // trap, emmer en dozen tegels
  const ladder = new THREE.Group();
  for (const s of [-0.22, 0.22]) ladder.add(mesh(new THREE.BoxGeometry(0.05, 2.3, 0.05), std(0xb0bec5, { metalness: 0.6 }), s, 1.15, 0));
  for (let i = 0; i < 7; i++) ladder.add(mesh(new THREE.BoxGeometry(0.44, 0.04, 0.05), std(0xb0bec5, { metalness: 0.6 }), 0, 0.25 + i * 0.3, 0));
  ladder.position.set(W / 2 - 0.7, 0, 0.5); ladder.rotation.x = -0.25; grp.add(ladder);
  grp.add(mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.32, 14), std(0xf5f5f5), -W / 2 + 0.6, 0.28, 1.6));
  for (let i = 0; i < 4; i++) grp.add(mesh(new THREE.BoxGeometry(0.42, 0.14, 0.32), std(0x90a4ae), -0.6 + (i % 2) * 0.05, 0.19 + i * 0.14, 0.6));
  // ---- bovenverdieping in plastic, dat wappert in de wind
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.6, 2.6, 8, 4), new THREE.MeshStandardMaterial({ color: 0xe8f0f2, transparent: true, opacity: 0.75, side: THREE.DoubleSide, roughness: 0.4 }));
  sheet.position.set(0, H + 1.5, 0.35);
  grp.add(sheet);
  const sheetBase = sheet.geometry.attributes.position.array.slice();
  // ---- steiger naast de kamer
  const tube = std(0x9e9e9e, { metalness: 0.7, roughness: 0.4 }), plank = std(0xc8a165);
  const sx0 = W / 2 + 0.4;
  for (const dx of [0, 1.8]) for (const dz of [0.3, 1.3]) grp.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 6, 6), tube, sx0 + dx, 3, dz));
  for (const y of [2, 4]) { grp.add(mesh(new THREE.BoxGeometry(2.0, 0.05, 1.2), plank, sx0 + 0.9, y, 0.8)); grp.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.8, 6), tube, sx0 + 0.9, y + 0.9, 1.3)).rotation.z = Math.PI / 2; }
  // ---- container met puin en een betonmolen op straat
  const cont = new THREE.Group();
  const orange = std(0xf57c00, { roughness: 0.6 });
  cont.add(mesh(new THREE.BoxGeometry(2.0, 0.1, 3.6), orange, 0, 0.1, 0));
  for (const [cw, cd, cx, cz] of [[2.0, 0.1, 0, 1.8], [2.0, 0.1, 0, -1.8], [0.1, 3.6, 1, 0], [0.1, 3.6, -1, 0]]) cont.add(mesh(new THREE.BoxGeometry(cw, 1.1, cd), orange, cx, 0.6, cz));
  const rubble = [0x8d8d8d, 0x795548, 0x9c4f35, 0xbdbdbd, 0x5d4037];
  for (let i = 0; i < 26; i++) { const b = mesh(new THREE.BoxGeometry(0.2 + Math.random() * 0.4, 0.15 + Math.random() * 0.25, 0.2 + Math.random() * 0.4), std(rubble[i % 5]), (Math.random() - 0.5) * 1.6, 0.4 + Math.random() * 0.6, (Math.random() - 0.5) * 3.2); b.rotation.set(Math.random(), Math.random(), Math.random()); cont.add(b); }
  const oldToilet = mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.4, 12), std(0xffffff, { roughness: 0.3 }), 0.3, 1.1, -0.8); cont.add(oldToilet);
  cont.position.set(-W / 2 - 1.9, 0, 3.0);
  grp.add(cont);
  const mixer = new THREE.Group();
  mixer.add(mesh(new THREE.BoxGeometry(0.7, 0.08, 1.0), std(0x37474f), 0, 0.35, 0));
  const drum = mesh(new THREE.CylinderGeometry(0.35, 0.22, 0.75, 14), std(0xff6f00, { roughness: 0.5 }), 0, 0.85, 0);
  drum.rotation.x = 0.9;
  mixer.add(drum);
  for (const s of [-1, 1]) mixer.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.06, 12), std(0x111111), s * 0.38, 0.15, 0.3)).rotation.z = Math.PI / 2;
  mixer.position.set(W / 2 + 1.0, 0, 2.6);
  grp.add(mixer);
  // pallet met nieuwe tegels voor de badkamer
  grp.add(mesh(new THREE.BoxGeometry(1.0, 0.12, 0.8), std(0xc8a165), W / 2 - 0.2, 0.06, 3.4));
  for (let i = 0; i < 5; i++) grp.add(mesh(new THREE.BoxGeometry(0.9, 0.1, 0.7), std(i % 2 ? 0x4fc3f7 : 0xf5f5f5, { roughness: 0.3 }), W / 2 - 0.2, 0.17 + i * 0.1, 3.4));
  // botsen
  grp.updateMatrixWorld(true);
  const toW = (x, z) => { const v = new THREE.Vector3(x, 0, z).applyMatrix4(grp.matrixWorld); return [v.x, v.z]; };
  w.addObstacle([toW(-W / 2 - 0.1, 0), toW(W / 2 + 0.1, 0), toW(W / 2 + 0.1, 0.3), toW(-W / 2 - 0.1, 0.3)]); // achterwand
  w.addObstacle([toW(-W / 2 - 2.9, 1.2), toW(-W / 2 - 0.9, 1.2), toW(-W / 2 - 0.9, 4.8), toW(-W / 2 - 2.9, 4.8)]); // container
  const npcSpot = toW(0.6, D + 1.4);
  let t = 0;
  g.updaters.add((dt) => {
    const p = g.player;
    if (Math.hypot(p.x - npcSpot[0], p.z - npcSpot[1]) > 80) return;
    t += dt;
    drum.rotation.y += dt * 2.2;
    bulb.position.x = 0.3 + Math.sin(t * 1.3) * 0.04;
    const a = sheet.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) {
      const bx = sheetBase[i * 3], by = sheetBase[i * 3 + 1];
      a.array[i * 3 + 2] = Math.sin(t * 2.4 + bx * 1.3 + by * 0.8) * 0.12 * (1.3 - by / 2.6);
    }
    a.needsUpdate = true;
  });
  return { npcSpot, frame: f };
}

// ------------------------------------------------------------ minigame: badkamer betegelen

// Leg de tegels volgens het voorbeeld. Bovenaan de stapel ligt steeds één tegel; tik op een vak waar
// die tegel volgens het voorbeeld hoort. Fout = de tegel breekt (en kost tijd). Daarna voegen en klaar.
const PATTERN = [
  'wwwwww',
  'wbwwbw',
  'wwggww',
  'wbwwbw',
  'bbbbbb',
];
const COLORS = { w: ['#f7f7f2', '#dcdcd4'], b: ['#2f8fd8', '#1d6aa8'], g: ['#e9b949', '#b98a22'] };
const NAMES = { w: 'wit', b: 'blauw', g: 'goud' };

export function startTiles(g, { limit = 75 } = {}) {
  const ov = document.createElement('div');
  ov.className = 'mini-overlay';
  ov.innerHTML = `<div class="mini-head"><b>Badkamer betegelen</b><span class="mini-score"></span><button class="mini-stop" type="button">Stoppen</button></div><canvas class="mini-canvas"></canvas><div class="mini-hint">${g.input.isTouch ? 'Tik op een vak waar de bovenste tegel van de stapel hoort. Kijk naar het voorbeeld!' : 'Klik op een vak waar de bovenste tegel van de stapel hoort. Kijk naar het voorbeeld!'}</div>`;
  document.getElementById('hud').prepend(ov);
  document.body.classList.add('pov');
  ov.querySelector('.mini-stop').addEventListener('click', () => g.missions.stop());
  const cv = ov.querySelector('canvas'), ctx = cv.getContext('2d');
  fitCanvas(cv);
  const parts = new Particles();
  const rows = PATTERN.length, cols = PATTERN[0].length;
  const placed = PATTERN.map((r) => [...r].map(() => null)); // { type, t (animatie) }
  // stapel: alle tegels die nodig zijn, gehusseld
  const stack = [];
  for (const r of PATTERN) for (const ch of r) stack.push(ch);
  for (let i = stack.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [stack[i], stack[j]] = [stack[j], stack[i]]; }
  let t = 0, errors = 0, combo = 0, ended = null, endT = 0, grout = 0, shakeT = 0, penalty = 0, hover = null;
  const flying = []; // tegel die van de stapel naar het vak vliegt
  const broken = []; // brekende tegels
  const layout = () => {
    const W = cv.width, H = cv.height, u = H / 100;
    const cell = Math.min((W * 0.56) / cols, (H * 0.74) / rows);
    const gx = W * 0.08 + (W * 0.56 - cell * cols) / 2, gy = H * 0.12;
    return { W, H, u, cell, gx, gy };
  };
  const cellAt = (mx, my) => {
    const { cell, gx, gy } = layout();
    const c = Math.floor((mx - gx) / cell), r = Math.floor((my - gy) / cell);
    return r >= 0 && r < rows && c >= 0 && c < cols ? [r, c] : null;
  };
  const place = (r, c) => {
    if (ended || !stack.length || placed[r][c]) return;
    const type = stack[stack.length - 1];
    const L = layout();
    const x = L.gx + (c + 0.5) * L.cell, y = L.gy + (r + 0.5) * L.cell;
    if (PATTERN[r][c] === type) {
      stack.pop();
      placed[r][c] = { type, t: 0 };
      flying.push({ type, r, c, k: 0 });
      combo++;
      g.sfx?.play('kick');
      if (combo % 5 === 0) { popText(ov, `Strak! x${combo}`, (x / L.W) * 100, (y / L.H) * 100 - 6, 'gold'); flash(ov, 'gold'); }
      setTimeout(() => parts.spawn(x, y, 10, { color: '#bdb8ad', speed: 160, up: 80, size: 4 * devicePixelRatio, life: 0.5, shape: 'circle' }), 120); // specie spat
      bump(ov.querySelector('.mini-score'));
    } else {
      // verkeerde plek: de tegel breekt
      stack.pop();
      stack.unshift(type); // je pakt een nieuwe uit de doos (komt later weer)
      errors++; combo = 0; penalty += 3; shakeT = 0.6;
      broken.push({ type, x, y, k: 0 });
      parts.spawn(x, y, 14, { color: COLORS[type][0], speed: 380, up: 200, size: 9 * devicePixelRatio, shape: 'shard', life: 0.9 });
      popText(ov, ['Krak!', 'Verkeerd vak!', 'Kijk naar het voorbeeld!', '-3 s'][Math.floor(Math.random() * 4)], (x / L.W) * 100, (y / L.H) * 100 - 6, 'bad');
      flash(ov, 'bad');
      g.sfx?.play('crash');
    }
  };
  cv.addEventListener('pointerdown', (e) => {
    const r = cv.getBoundingClientRect();
    const hit = cellAt((e.clientX - r.left) * devicePixelRatio, (e.clientY - r.top) * devicePixelRatio);
    if (hit) place(...hit);
  });
  cv.addEventListener('pointermove', (e) => {
    const r = cv.getBoundingClientRect();
    hover = cellAt((e.clientX - r.left) * devicePixelRatio, (e.clientY - r.top) * devicePixelRatio);
  });

  const drawTile = (x, y, s, type, alpha = 1) => {
    const [c1, c2] = COLORS[type];
    ctx.globalAlpha = alpha;
    const gr = ctx.createLinearGradient(x, y, x + s, y + s);
    gr.addColorStop(0, c1); gr.addColorStop(1, c2);
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.roundRect(x, y, s, s, s * 0.06); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.moveTo(x + s * 0.08, y + s * 0.08); ctx.lineTo(x + s * 0.5, y + s * 0.08); ctx.lineTo(x + s * 0.08, y + s * 0.5); ctx.closePath(); ctx.fill(); // glans
    if (type === 'g') { ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = s * 0.05; ctx.strokeRect(x + s * 0.25, y + s * 0.25, s * 0.5, s * 0.5); }
    ctx.globalAlpha = 1;
  };

  return new Promise((resolve) => {
    let done = false;
    const finish = (res) => {
      if (done) return; done = true; g.minigame = null;
      ov.remove(); document.body.classList.remove('pov'); g.player.lockedFor = false;
      resolve(res);
    };
    g.minigame = {
      stop: () => finish(null),
      debug: { label: null, place, get top() { return stack[stack.length - 1]; }, pattern: PATTERN, placed, get errors() { return errors; } },
      update: (dt) => {
        g.player.lockedFor = true;
        fitCanvas(cv);
        const L = layout(), { W, H, u, cell, gx, gy } = L;
        shakeT = Math.max(0, shakeT - dt * 2.5);
        const left = limit - t - penalty;
        if (!ended) {
          t += dt;
          if (!stack.length && !flying.length) { ended = 'voegen'; endT = 0; g.sfx?.play('success'); popText(ov, 'Alle tegels liggen! Nu voegen...', 50, 40, 'gold big'); }
          else if (left <= 0) { ended = 'te laat'; endT = 0; g.sfx?.play('fail'); }
        } else {
          endT += dt;
          if (ended === 'voegen') grout = Math.min(1, endT / 1.2);
          if (endT > 2.4) finish({ ok: ended === 'voegen', errors, time: t + penalty, left: Math.max(0, left) });
        }
        for (const f of flying) f.k += dt * 6;
        for (let i = flying.length - 1; i >= 0; i--) if (flying[i].k >= 1) flying.splice(i, 1);
        for (const b of broken) b.k += dt * 2;
        for (let i = broken.length - 1; i >= 0; i--) if (broken[i].k >= 1) broken.splice(i, 1);
        for (const row of placed) for (const p of row) if (p) p.t = Math.min(1, p.t + dt * 4);
        parts.update(dt);

        // ---- tekenen: badkamermuur
        ctx.save();
        if (shakeT > 0) ctx.translate((Math.random() - 0.5) * 10 * shakeT, (Math.random() - 0.5) * 6 * shakeT);
        const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#d7d0c4'); bg.addColorStop(1, '#bfb6a7');
        ctx.fillStyle = bg; ctx.fillRect(-20, -20, W + 40, H + 40);
        // kale muur met specie waar nog geen tegel ligt
        ctx.fillStyle = '#a69d8e'; ctx.fillRect(gx - 1.2 * u, gy - 1.2 * u, cell * cols + 2.4 * u, cell * rows + 2.4 * u);
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          const x = gx + c * cell, y = gy + r * cell;
          ctx.fillStyle = (r + c) % 2 ? '#9b927f' : '#a2998a';
          ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
          // kamstreepjes in de lijm
          ctx.strokeStyle = 'rgba(80,70,60,0.25)'; ctx.lineWidth = 1;
          for (let k = 1; k < 5; k++) { ctx.beginPath(); ctx.moveTo(x + 4, y + (k * cell) / 5); ctx.lineTo(x + cell - 4, y + (k * cell) / 5 + 2); ctx.stroke(); }
          if (hover && hover[0] === r && hover[1] === c && !placed[r][c]) { ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x, y, cell, cell); }
        }
        // gelegde tegels (met een klein 'plop'-effect)
        const gap = Math.max(2, cell * 0.05) * (1 - grout * 0.6);
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          const p = placed[r][c];
          if (!p || flying.some((f) => f.r === r && f.c === c)) continue;
          const sc = 1 + Math.sin(p.t * Math.PI) * 0.08;
          const s = (cell - gap) * sc, x = gx + c * cell + (cell - s) / 2, y = gy + r * cell + (cell - s) / 2;
          drawTile(x, y, s, p.type);
        }
        // voegen: wit voegsel loopt van onder naar boven in, en daarna een glans
        if (grout > 0) {
          ctx.fillStyle = 'rgba(245,245,240,0.9)';
          const gy2 = gy + cell * rows * (1 - grout);
          for (let r = 0; r <= rows; r++) { const y = gy + r * cell; if (y >= gy2) ctx.fillRect(gx, y - gap / 2, cell * cols, gap); }
          for (let c = 0; c <= cols; c++) ctx.fillRect(gx + c * cell - gap / 2, gy2, gap, gy + cell * rows - gy2);
          if (grout >= 1) { const sx = gx + ((endT - 1.2) / 0.8) * cell * cols * 1.4 - cell; ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.moveTo(sx, gy); ctx.lineTo(sx + cell * 0.6, gy); ctx.lineTo(sx - cell, gy + cell * rows); ctx.lineTo(sx - cell * 1.6, gy + cell * rows); ctx.closePath(); ctx.fill(); }
        }
        // vliegende tegel van de stapel naar het vak
        const sx = W * 0.79, sy = H * 0.66;
        for (const f of flying) {
          const tx = gx + f.c * cell, ty = gy + f.r * cell;
          const k = 1 - Math.pow(1 - f.k, 3);
          const x = sx + (tx - sx) * k, y = sy + (ty - sy) * k - Math.sin(k * Math.PI) * 8 * u;
          drawTile(x, y, cell - gap, f.type);
        }
        // brekende tegel
        for (const b of broken) drawTile(b.x - cell / 2, b.y - cell / 2 + b.k * 12 * u, cell * (1 - b.k * 0.3), b.type, 1 - b.k);
        parts.draw(ctx);
        ctx.restore();
        // ---- voorbeeld (rechtsboven)
        const pc = Math.min(W * 0.03, 5 * u), px = W * 0.72, py = H * 0.12;
        ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.beginPath(); ctx.roundRect(px - 1.5 * u, py - 5 * u, pc * cols + 3 * u, pc * rows + 6.5 * u, 1.5 * u); ctx.fill();
        ctx.fillStyle = '#5d4037'; ctx.font = `800 ${2.6 * u}px "Baloo 2", sans-serif`; ctx.textAlign = 'left'; ctx.fillText('Voorbeeld', px, py - 1.4 * u);
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { ctx.fillStyle = COLORS[PATTERN[r][c]][0]; ctx.fillRect(px + c * pc, py + r * pc, pc - 1, pc - 1); if (placed[r][c]) { ctx.fillStyle = 'rgba(30,30,30,0.45)'; ctx.fillRect(px + c * pc, py + r * pc, pc - 1, pc - 1); } } // gelegd: donkerder
        // ---- stapel tegels op de kar (rechtsonder): de bovenste is aan de beurt
        ctx.fillStyle = '#6d4c41'; ctx.fillRect(sx - 7 * u, sy + cell * 0.55, 14 * u + cell * 0.2, 1.6 * u);
        const show = stack.slice(-6);
        show.forEach((type, i) => { const top = i === show.length - 1; const yy = sy - i * 1.4 * u; drawTile(sx - cell * 0.1 + (top ? 0 : 0.6 * u), yy, cell * 0.85, type, top ? 1 : 0.85); });
        if (stack.length) {
          const top = stack[stack.length - 1];
          ctx.fillStyle = '#fff'; ctx.font = `800 ${3.2 * u}px "Baloo 2", sans-serif`; ctx.textAlign = 'center';
          ctx.fillText(`Nu: ${NAMES[top]}`, sx + cell * 0.32, sy + cell * 0.55 + 6 * u);
          ctx.font = `600 ${2.3 * u}px Inter, sans-serif`; ctx.fillText(`nog ${stack.length} tegels`, sx + cell * 0.32, sy + cell * 0.55 + 9.5 * u);
        }
        ov.querySelector('.mini-score').textContent = `🧱 ${rows * cols - stack.length} / ${rows * cols} · ${errors} gebroken · ${Math.max(0, Math.ceil(left))} s`;
      },
    };
  });
}
