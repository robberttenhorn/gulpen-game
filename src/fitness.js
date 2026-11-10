// Anytime Fitness aan de Nieuwstraat: een grote glazen pui met sporters erachter, een sportzaal binnen
// en de missie "Biceps pompen" (klaar voor een dagje Mosaqua). Bord en kleuren zijn een passende stijl,
// geen echt logo. De personal trainer en de sporters zijn verzonnen.
import * as THREE from 'three';
import { makeCharacter } from './character.js';
import { Interiors, Room, std, tiles } from './interiors.js';
import { signTexture } from './textures.js';
import { popText, flash, bump, Particles, fitCanvas } from './minifx.js';

const PURPLE = 0x5b2a86;
const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; };

// ------------------------------------------------------------ gevel: glazen uitbouw met sporters

function treadmill(parent, x, z) {
  const g = new THREE.Group();
  const dark = std(0x222428, { roughness: 0.6 }), alu = std(0xb0b6bc, { metalness: 0.7, roughness: 0.35 });
  g.add(mesh(new THREE.BoxGeometry(0.75, 0.16, 1.7), dark, 0, 0.08, 0));
  const belt = mesh(new THREE.BoxGeometry(0.55, 0.02, 1.5), std(0x111111, { roughness: 0.9 }), 0, 0.17, 0);
  g.add(belt);
  for (const sx of [-0.33, 0.33]) { const p = mesh(new THREE.BoxGeometry(0.05, 1.1, 0.05), alu, sx, 0.65, 0.72); p.rotation.x = -0.15; g.add(p); }
  const consoleM = mesh(new THREE.BoxGeometry(0.7, 0.3, 0.1), dark, 0, 1.22, 0.82);
  consoleM.rotation.x = -0.5;
  g.add(consoleM);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.18), new THREE.MeshStandardMaterial({ color: 0x0a1a2a, emissive: 0x2ea8ff, emissiveIntensity: 1.1 }));
  scr.position.set(0, 1.235, 0.765); scr.rotation.x = -0.5 + Math.PI; scr.rotation.y = Math.PI;
  g.add(scr);
  g.position.set(x, 0, z);
  parent.add(g);
  return g;
}

function spinBike(parent, x, z) {
  const g = new THREE.Group();
  const frame = std(0x2b2b2f, { metalness: 0.5, roughness: 0.4 });
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.06, 1.0), frame, 0, 0.03, 0));
  const post = mesh(new THREE.BoxGeometry(0.07, 0.9, 0.07), frame, 0, 0.5, -0.15); post.rotation.x = 0.25; g.add(post);
  g.add(mesh(new THREE.BoxGeometry(0.22, 0.06, 0.28), std(0x111111), 0, 0.92, -0.25)); // zadel
  const fw = mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.06, 20), std(0x9aa0a6, { metalness: 0.8, roughness: 0.25 }), 0, 0.32, 0.33); fw.rotation.z = Math.PI / 2; g.add(fw);
  const bar = mesh(new THREE.BoxGeometry(0.07, 0.75, 0.07), frame, 0, 0.6, 0.35); bar.rotation.x = -0.2; g.add(bar);
  g.add(mesh(new THREE.BoxGeometry(0.45, 0.05, 0.08), frame, 0, 1.0, 0.45));
  g.position.set(x, 0, z);
  parent.add(g);
  return { g, fw };
}

function dumbbell(len = 0.3, r = 0.06, color = 0x222222) {
  const g = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, len, 8), std(0xc0c4c8, { metalness: 0.8, roughness: 0.3 }));
  bar.rotation.z = Math.PI / 2;
  g.add(bar);
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.06, 12), std(color, { roughness: 0.5 }));
    p.rotation.z = Math.PI / 2; p.position.x = s * (len / 2 - 0.04);
    g.add(p);
  }
  return g;
}

// Gevelframe aan de Looierstraat-kant van het pand, vlak bij de hoek met de Nieuwstraat.
// Zoekt het pand op het adres, de hoek die het dichtst bij de kruising ligt, en de gevel langs de Looierstraat.
export function frameLooierCorner(fac, [ax, az]) {
  const w = fac.world;
  const pts = (name) => { const out = []; for (const [n, l] of w.roads) if (n === name) for (let i = 0; i < l.length; i += 2) out.push([l[i], l[i + 1]]); return out; };
  const looier = pts('Looierstraat'), nieuw = pts('Nieuwstraat');
  if (!looier.length || !nieuw.length) return null;
  // kruising: het punt van de Looierstraat dat het dichtst bij de Nieuwstraat ligt
  let J = null, jd = Infinity;
  for (const p of looier) for (const q of nieuw) { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < jd) { jd = d; J = p; } }
  let fp = null;
  for (const i of w.nearbyFootprints(ax, az)) { const f = w.footprints[i]; if (!f.extra && pointIn(ax, az, f.ring)) fp = f; }
  if (!fp) return null;
  const r = fp.ring, n = r.length;
  let ci = 0, cd = Infinity;
  r.forEach(([x, z], i) => { const d = Math.hypot(x - J[0], z - J[1]); if (d < cd) { cd = d; ci = i; } });
  const nearL = (x, z) => { let b = Infinity; for (const p of looier) b = Math.min(b, Math.hypot(p[0] - x, p[1] - z)); return b; };
  // langs de ring lopen vanaf de hoek, de kant op die het dichtst bij de Looierstraat blijft
  let bestSide = null;
  for (const dir of [1, -1]) {
    let len = 0, i = ci, sumD = 0, k = 0;
    while (len < 12 && k < n) { const j = (i + dir + n) % n; len += Math.hypot(r[j][0] - r[i][0], r[j][1] - r[i][1]); sumD += nearL(r[j][0], r[j][1]); i = j; k++; }
    const score = sumD / Math.max(1, k);
    if (!bestSide || score < bestSide.score) bestSide = { end: i, score };
  }
  const [bx, bz] = r[ci], [ex, ez] = r[bestSide.end];
  const L = Math.hypot(ex - bx, ez - bz) || 1;
  let ux = (ex - bx) / L, uz = (ez - bz) / L;
  let nx = uz, nz = -ux;
  const mx = (bx + ex) / 2, mz = (bz + ez) / 2;
  if (pointIn(mx + nx * 0.8, mz + nz * 0.8, r)) { nx = -nx; nz = -nz; }
  // midden van de pui een paar meter van de hoek af
  const t = Math.min(L / 2, 4.6);
  const cx = bx + ux * t, cz = bz + uz * t;
  const fux = -nz, fuz = nx;
  return { x: cx, z: cz, y: w.heightAt(cx + nx * 1.5, cz + nz * 1.5), ux: fux, uz: fuz, nx, nz, len: Math.min(9, 2 * t + 0.6), yaw: Math.atan2(nx, nz) };
}
function pointIn(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// Bouwt de pui op het gevelframe f. Geeft een object met tick(dt, game) terug.
export function buildFitnessFront(fac, f) {
  const w = fac.world;
  const W = Math.max(5, Math.min(f.len - 0.6, 9)), D = 2.6, H = 3.1;
  // de gevel verspringt soms: zet de pui (met bord) vóór het verst uitstekende stuk, anders valt er iets achter de muur
  let out = 0.02;
  for (let k = 0; k <= 12; k++) {
    const along = -W / 2 - 0.3 + (k / 12) * (W + 0.6);
    for (let d = 0; d <= 1.6; d += 0.05) {
      const x = f.x + f.nx * d - f.ux * along, z = f.z + f.nz * d - f.uz * along;
      const x2 = f.x + f.nx * d + f.ux * along, z2 = f.z + f.nz * d + f.uz * along;
      if (w.insideBuilding(x, z) || w.insideBuilding(x2, z2)) out = Math.max(out, d + 0.08);
    }
  }
  const g = fac.group(f, out);
  // bord boven de pui
  fac.sign(g, 'Anytime Fitness', { w: Math.min(W, 6.5), h: 0.8, y: H + 0.75, z: 0.06, bg: '#5b2a86', fg: '#ffffff', font: '800 104px "Baloo 2", sans-serif', sub: '24/7 open', subFont: '600 44px Inter, sans-serif' });
  // dak, vloer en achterwand
  const roof = mesh(new THREE.BoxGeometry(W + 0.3, 0.28, D + 0.25), std(0x30333a, { roughness: 0.6 }), 0, H + 0.14, D / 2);
  g.add(roof);
  const floor = mesh(new THREE.BoxGeometry(W, 0.06, D), std(0x2a2c30, { roughness: 0.95 }), 0, 0.03, D / 2);
  g.add(floor);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), std(0xf3f1ee, { roughness: 0.8 }));
  back.position.set(0, H / 2, 0.04);
  g.add(back);
  // paarse accentwand met spiegel en een lichtlijn
  const accent = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.35, H - 0.4), std(PURPLE, { roughness: 0.7 }));
  accent.position.set(-W * 0.3, H / 2, 0.05);
  g.add(accent);
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.5, 1.8), new THREE.MeshStandardMaterial({ color: 0xcfd8dc, metalness: 1, roughness: 0.08 }));
  mirror.position.set(W * 0.2, 1.4, 0.05);
  g.add(mirror);
  const ledMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf3e9ff, emissiveIntensity: 1.6 });
  for (const z of [0.6, 1.4, 2.2]) g.add(mesh(new THREE.BoxGeometry(W - 0.6, 0.03, 0.08), ledMat, 0, H - 0.04, z));
  g.add(mesh(new THREE.BoxGeometry(W * 0.35, 0.03, 0.03), new THREE.MeshStandardMaterial({ color: 0xd8b4fe, emissive: 0xb06cff, emissiveIntensity: 2 }), -W * 0.3, H - 0.25, 0.07));
  // apparaten en sporters
  const look = (shirt, pants, hair, extra = {}) => makeCharacter({ shirt, pants, hair, shoes: 0xf5f5f5, sleeves: 'short', ...extra });
  const people = [];
  const tm1 = treadmill(g, -W / 2 + 1.0, 1.25), tm2 = treadmill(g, -W / 2 + 2.1, 1.25);
  for (const [tm, l] of [[tm1, look(0xff4081, 0x212121, 0x3e2723, { female: true, hairStyle: 'bun' })], [tm2, look(0x00b8d4, 0x37474f, 0xd7b56d)]]) {
    l.position.set(tm.position.x, 0.18, tm.position.z - 0.15);
    g.add(l);
    people.push({ m: l, mode: 'run', ph: Math.random() * 6 });
  }
  const bike = spinBike(g, W / 2 - 1.1, 1.1);
  const cyc = look(0xffd600, 0x111111, 0x111111);
  cyc.position.set(bike.g.position.x, 0.38, bike.g.position.z - 0.2);
  g.add(cyc);
  people.push({ m: cyc, mode: 'bike', fw: bike.fw });
  // iemand die bicepscurls doet voor de spiegel (draait zich om als je te lang kijkt)
  const curler = look(0x212121, 0x424242, 0x5d4037, { beard: true });
  curler.position.set(W * 0.08, 0.06, 1.15);
  curler.rotation.y = Math.PI; // kijkt in de spiegel
  g.add(curler);
  const dbL = dumbbell(), dbR = dumbbell();
  curler.userData.parts.handL.add(dbL); curler.userData.parts.handR.add(dbR);
  dbL.position.y = -0.06; dbR.position.y = -0.06;
  people.push({ m: curler, mode: 'curl', ph: 0 });
  // dumbbellrek tegen de achterwand
  const rack = mesh(new THREE.BoxGeometry(1.6, 0.08, 0.4), std(0x1c1c1c), W / 2 - 1.1, 0.75, 0.3);
  g.add(rack);
  for (let i = 0; i < 6; i++) { const d = dumbbell(0.3, 0.05 + i * 0.006, [0x8e24aa, 0x222222][i % 2]); d.position.set(W / 2 - 1.75 + i * 0.26, 0.84, 0.3); d.rotation.y = Math.PI / 2; g.add(d); }
  // glas met kozijnen
  const glass = new THREE.MeshStandardMaterial({ color: 0xcfe8ff, metalness: 0.9, roughness: 0.04, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
  const alu = std(0x3a3d44, { metalness: 0.6, roughness: 0.35 });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(W, H), glass);
  front.position.set(0, H / 2, D);
  front.renderOrder = 2;
  g.add(front);
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(D, H), glass);
    side.rotation.y = Math.PI / 2; side.position.set(sx * W / 2, H / 2, D / 2); side.renderOrder = 2;
    g.add(side);
    g.add(mesh(new THREE.BoxGeometry(0.08, H, 0.08), alu, sx * W / 2, H / 2, D));
  }
  const n = Math.max(2, Math.round(W / 1.6));
  for (let i = 1; i < n; i++) g.add(mesh(new THREE.BoxGeometry(0.05, H, 0.06), alu, -W / 2 + (i * W) / n, H / 2, D));
  g.add(mesh(new THREE.BoxGeometry(W, 0.08, 0.08), alu, 0, 0.04, D));
  g.add(mesh(new THREE.BoxGeometry(W, 0.06, 0.06), alu, 0, 2.3, D));
  // schuifdeur (rechts) met een handgreep en een sticker
  g.add(mesh(new THREE.BoxGeometry(0.04, 1.0, 0.05), std(0xd0d4d8, { metalness: 0.8 }), W / 2 - 0.7, 1.1, D + 0.04));
  const sticker = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.3), new THREE.MeshBasicMaterial({ map: signTexture('24/7 · Train wanneer jij wilt', { bg: '#5b2a86', fg: '#ffffff', font: '700 64px Inter, sans-serif', w: 1024, h: 256 }), transparent: true }));
  sticker.position.set(-W / 4, 1.6, D + 0.01);
  g.add(sticker);
  // botsen: je kunt niet door de pui lopen
  g.updateMatrixWorld(true);
  const corner = (x, z) => { const v = new THREE.Vector3(x, 0, z).applyMatrix4(g.matrixWorld); return [v.x, v.z]; };
  w.addObstacle([corner(-W / 2, 0), corner(W / 2, 0), corner(W / 2, D), corner(-W / 2, D)]);
  const frontCenter = corner(0, D + 0.5);
  const entrance = corner(W / 2 - 0.7, D + 1.6);

  let t = 0, shoutArmed = true, turnT = 0;
  return {
    frontCenter, entrance, frame: f,
    tick(dt, game) {
      const p = game.player;
      const d = Math.hypot(p.x - frontCenter[0], p.z - frontCenter[1]);
      if (d > 70) return;
      t += dt;
      for (const q of people) {
        const a = q.m.userData.animate;
        if (q.mode === 'run') a(dt, 3.4, 'walk');
        else if (q.mode === 'bike') { a(dt, 7, 'bike'); q.fw.rotation.x += dt * 9; }
        else if (q.mode === 'curl') {
          a(dt, 0, turnT > 0 ? 'wave' : 'idle');
          if (turnT <= 0) {
            // langzame curls met twee armen om de beurt
            const k = (Math.sin(t * 2.2) + 1) / 2, k2 = (Math.sin(t * 2.2 + Math.PI) + 1) / 2;
            q.m.userData.parts.foreArmL.rotation.x = -0.2 - k * 2.0;
            q.m.userData.parts.foreArmR.rotation.x = -0.2 - k2 * 2.0;
          }
        }
      }
      // de curler draait zich om naar de straat als er iemand roept
      if (turnT > 0) {
        turnT -= dt;
        curler.rotation.y += (0 - curler.rotation.y) * Math.min(1, dt * 6);
      } else curler.rotation.y += (Math.PI - curler.rotation.y) * Math.min(1, dt * 3);
      // dichtbij komen: er wordt naar je geroepen (niet tijdens een missie of een gesprek)
      if (shoutArmed && d < 7 && !game.missions?.active && !game.ui.dialogOpen && !game.interior) {
        shoutArmed = false;
        turnT = 2.6;
        game.ui.toastDialect('Geen kontjes kieke doe vieze!', 'Niet naar billen kijken, viezerik!', 2600);
        game.sfx?.play('whistle');
      } else if (!shoutArmed && d > 18) shoutArmed = true;
    },
  };
}

// ------------------------------------------------------------ sportzaal binnen

Interiors.prototype.build_fitness = function () {
  const r = new Room(this.scene, this.count++, { w: 14, d: 10, h: 3.6, floor: { map: tiles('#2c2e33', '#24262a') }, wall: 0xf1eff2, name: 'Anytime Fitness', warm: 0xf3ecff });
  // paarse wand en een lange spiegel
  const accent = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.6), std(PURPLE, { roughness: 0.7 }));
  accent.position.set(0, 1.8, -4.98);
  r.group.add(accent);
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.1), new THREE.MeshStandardMaterial({ color: 0xd5dde3, metalness: 1, roughness: 0.06 }));
  mirror.position.set(1, 1.45, -4.96);
  r.group.add(mirror);
  const poster = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.8), new THREE.MeshBasicMaterial({ map: signTexture('Geen excuses', { bg: '#5b2a86', fg: '#ffffff', font: '800 120px "Baloo 2", sans-serif', sub: 'alleen resultaten', subFont: '600 52px Inter, sans-serif', w: 1024, h: 384 }) }));
  poster.position.set(-5.2, 2.5, -4.95);
  r.group.add(poster);
  // lichtbanen aan het plafond
  const led = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf5efff, emissiveIntensity: 1.8 });
  for (const z of [-3, -0.5, 2]) r.add(new THREE.BoxGeometry(11, 0.04, 0.12), led, 0, 3.55, z, false);
  // loopbanden met sporters langs de linkerwand
  for (const [i, lk] of [[0, { shirt: 0xff4081, pants: 0x212121, hair: 0x3e2723, female: true, hairStyle: 'bun' }], [1, { shirt: 0x00b8d4, pants: 0x37474f, hair: 0xd7b56d }], [2, { shirt: 0x76ff03, pants: 0x263238, hair: 0x111111 }]]) {
    const tm = new THREE.Group();
    treadmill(tm, 0, 0);
    r.obj(tm, -6.2, 0, -2.5 + i * 1.5, Math.PI / 2, [0.9, 0.45]);
    const m = makeCharacter({ ...lk, shoes: 0xf5f5f5, sleeves: 'short' });
    m.position.set(-6.35, 0.18, -2.5 + i * 1.5);
    m.rotation.y = Math.PI / 2;
    r.group.add(m);
    r.people.push({ m, pose: 'walk', speed: 3.2 });
  }
  // dumbbellrekken voor de spiegel
  for (const x of [-1.5, 3.5]) {
    r.add(new THREE.BoxGeometry(2.4, 0.08, 0.5), std(0x1c1c1c), x, 0.7, -4.4);
    for (let i = 0; i < 8; i++) { const d = dumbbell(0.32, 0.05 + i * 0.006, [0x8e24aa, 0x222222][i % 2]); d.position.set(x - 1.05 + i * 0.3, 0.8, -4.4); d.rotation.y = Math.PI / 2; r.group.add(d); }
  }
  // squatrek en bank
  const rackMat = std(0x30333a, { metalness: 0.5, roughness: 0.4 });
  for (const [x, z] of [[4.6, 1.2], [5.8, 1.2], [4.6, 2.4], [5.8, 2.4]]) r.add(new THREE.BoxGeometry(0.08, 2.4, 0.08), rackMat, x, 1.2, z, false);
  r.boxes.push([4.5, 1.1, 5.9, 2.5]);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.0, 8), std(0xc0c4c8, { metalness: 0.9, roughness: 0.25 }));
  bar.rotation.z = Math.PI / 2; bar.position.set(5.2, 1.5, 1.8); r.group.add(bar);
  for (const s of [-1, 1]) { const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 20), std(0x111111)); pl.rotation.z = Math.PI / 2; pl.position.set(5.2 + s * 0.85, 1.5, 1.8); r.group.add(pl); }
  r.add(new THREE.BoxGeometry(0.4, 0.45, 1.3), std(0x1b1b1b), 1.5, 0.22, 2.2);
  // kettlebells
  for (let i = 0; i < 5; i++) { const k = new THREE.Mesh(new THREE.SphereGeometry(0.13 + i * 0.015, 14, 10), std(0x5b2a86, { roughness: 0.5 })); k.position.set(-3.5 + i * 0.4, 0.15, 3.8); r.group.add(k); }
  // de personal trainer bij de spiegel en de plek waar de dumbbells voor jou klaarliggen
  r.person({ shirt: PURPLE, pants: 0x111111, hair: 0x2b1d14, sleeves: 'short', shoes: 0xffffff }, -0.2, -3.2, 0, 'idle');
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9), std(0x5b2a86, { roughness: 0.9 }));
  mat.rotation.x = -Math.PI / 2; mat.position.set(1.2, 0.02, -3.0); r.group.add(mat);
  const mine = dumbbell(0.34, 0.075, 0xffc400); mine.position.set(1.2, 0.08, -3.0); r.group.add(mine);
  r.curlSpot = { x: 1.2, z: -2.6 };
  r.start = { x: 0, z: 3.4, r: 2 };
  return r;
};

// ------------------------------------------------------------ minigame: biceps pompen

// Tekenhulpjes voor het curlspel. Alles wat niet beweegt (de zaal, de spiegel met wat erin te zien is, het lijf)
// en alles wat vaak terugkomt (arm, vuist, halterschijf, meters) wordt één keer voorgetekend op een los canvas
// (opnieuw bij een andere canvasmaat); per beeld is het dan alleen plakken. Het licht komt van boven en van voren.
const offscreen = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const seeded = (seed) => { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
// kleur lichter (f > 1, richting wit) of donkerder (f < 1)
const tone = (hex, f) => { const c = new THREE.Color(hex); if (f > 1) c.lerp(new THREE.Color(0xffffff), f - 1); else c.multiplyScalar(f); return '#' + c.getHexString(); };

// Het lijf van opzij (kijkt naar rechts), zonder de voorste arm en zonder ogen en mond: shirt, korte broek,
// bovenbenen, nek, hoofd en haar. cx = midden van de romp, sh = schouderhoogte, u = eenheid, bottom = tot waar de benen lopen.
function drawGymBody(x, cx, sh, u, shirt, skin, bottom) {
  // bovenbenen onder de korte broek (lopen het beeld uit)
  let g = x.createLinearGradient(cx - 6.5 * u, 0, cx + 6.5 * u, 0);
  g.addColorStop(0, tone(skin, 0.5)); g.addColorStop(0.5, tone(skin, 0.9)); g.addColorStop(0.82, tone(skin, 1.08)); g.addColorStop(1, tone(skin, 0.78));
  x.fillStyle = g; x.beginPath(); x.moveTo(cx - 6.6 * u, sh + 52 * u); x.lineTo(cx + 6.4 * u, sh + 52 * u); x.lineTo(cx + 5.6 * u, bottom); x.lineTo(cx - 5.4 * u, bottom); x.closePath(); x.fill();
  // korte broek
  g = x.createLinearGradient(cx - 8.2 * u, 0, cx + 8.2 * u, 0);
  g.addColorStop(0, '#101217'); g.addColorStop(0.5, '#2a2e38'); g.addColorStop(0.82, '#414757'); g.addColorStop(1, '#20232b');
  x.fillStyle = g; x.beginPath(); x.roundRect(cx - 8.2 * u, sh + 36 * u, 16.4 * u, 22 * u, [0, 0, 1.6 * u, 1.6 * u]); x.fill();
  x.fillStyle = 'rgba(255,255,255,0.16)'; x.fillRect(cx - 8.2 * u, sh + 56.6 * u, 16.4 * u, 0.5 * u);
  // shirt: rond als een cilinder (donker aan de rugkant, licht aan de voorkant), schouders in het licht
  g = x.createLinearGradient(cx - 8 * u, 0, cx + 8 * u, 0);
  g.addColorStop(0, tone(shirt, 0.5)); g.addColorStop(0.42, tone(shirt, 0.9)); g.addColorStop(0.78, tone(shirt, 1.14)); g.addColorStop(1, tone(shirt, 0.8));
  x.fillStyle = g; x.beginPath(); x.roundRect(cx - 8 * u, sh - 2 * u, 16 * u, 42 * u, [6 * u, 6 * u, 1.2 * u, 1.2 * u]); x.fill();
  x.save(); x.clip();
  g = x.createLinearGradient(0, sh - 2 * u, 0, sh + 40 * u); g.addColorStop(0, 'rgba(255,255,255,0.3)'); g.addColorStop(0.25, 'rgba(255,255,255,0)'); g.addColorStop(0.7, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.28)');
  x.fillStyle = g; x.fillRect(cx - 8 * u, sh - 2 * u, 16 * u, 42 * u);
  // plooien in de stof en de zoom onderaan
  x.strokeStyle = 'rgba(0,0,0,0.14)'; x.lineWidth = 0.7 * u; x.lineCap = 'round';
  for (const [x0, y0, x1, y1] of [[-5, 24, 4, 29], [-6, 30, 2, 34], [-2, 14, 5, 17]]) { x.beginPath(); x.moveTo(cx + x0 * u, sh + y0 * u); x.quadraticCurveTo(cx + (x0 + x1) / 2 * u, sh + (y0 + y1) / 2 * u + 1.4 * u, cx + x1 * u, sh + y1 * u); x.stroke(); }
  x.fillStyle = 'rgba(0,0,0,0.2)'; x.fillRect(cx - 8 * u, sh + 38 * u, 16 * u, 2 * u);
  x.restore();
  // nek, met de schaduw van de kin
  g = x.createLinearGradient(cx - 1.5 * u, 0, cx + 2.5 * u, 0); g.addColorStop(0, tone(skin, 0.62)); g.addColorStop(1, tone(skin, 0.92));
  x.fillStyle = g; x.fillRect(cx - 1.5 * u, sh - 6 * u, 4 * u, 5 * u);
  g = x.createLinearGradient(0, sh - 6 * u, 0, sh - 2 * u); g.addColorStop(0, 'rgba(60,25,10,0.5)'); g.addColorStop(1, 'rgba(60,25,10,0)');
  x.fillStyle = g; x.fillRect(cx - 1.5 * u, sh - 6 * u, 4 * u, 4 * u);
  // hoofd: bol, licht op voorhoofd en wang
  g = x.createRadialGradient(cx + 4 * u, sh - 13.5 * u, 0, cx + 1.5 * u, sh - 11 * u, 8.5 * u);
  g.addColorStop(0, tone(skin, 1.16)); g.addColorStop(0.5, tone(skin, 1)); g.addColorStop(1, tone(skin, 0.66));
  x.fillStyle = g;
  x.beginPath(); x.ellipse(cx + 1.5 * u, sh - 11 * u, 6 * u, 6.8 * u, 0, 0, 7); x.fill();
  x.fillStyle = tone(skin, 1.04); x.beginPath(); x.ellipse(cx + 7.2 * u, sh - 10.5 * u, 1.3 * u, 1.8 * u, 0, 0, 7); x.fill(); // neus
  x.fillStyle = 'rgba(90,40,20,0.3)'; x.beginPath(); x.ellipse(cx + 6.9 * u, sh - 9 * u, 0.9 * u, 0.45 * u, 0, 0, 7); x.fill();
  x.fillStyle = tone(skin, 0.84); x.beginPath(); x.ellipse(cx - 0.8 * u, sh - 10.4 * u, 1.3 * u, 1.9 * u, 0, 0, 7); x.fill(); // oor
  x.strokeStyle = 'rgba(90,40,20,0.45)'; x.lineWidth = 0.35 * u; x.beginPath(); x.arc(cx - 0.6 * u, sh - 10.4 * u, 0.9 * u, 1.9, 4.6); x.stroke();
  // haar met een glans
  g = x.createLinearGradient(0, sh - 19 * u, 0, sh - 11 * u); g.addColorStop(0, '#6a4638'); g.addColorStop(0.6, '#3e2723'); g.addColorStop(1, '#231411');
  x.fillStyle = g; x.beginPath(); x.ellipse(cx, sh - 14.5 * u, 6.4 * u, 4.2 * u, -0.25, Math.PI * 0.95, Math.PI * 2.05); x.fill();
  x.strokeStyle = 'rgba(255,214,170,0.28)'; x.lineWidth = 0.7 * u; x.beginPath(); x.ellipse(cx + 0.6 * u, sh - 14.6 * u, 4.6 * u, 3 * u, -0.25, Math.PI * 1.25, Math.PI * 1.8); x.stroke();
}

// Wat je in de spiegel ziet (onscherp, want ver weg): de zaal met ramen, ledlijnen, het dumbbellrek en jezelf van de andere kant.
// Tekent in eenheden van u; mwu bij mhu is de maat van het spiegelglas, figX de plek van het spiegelbeeld.
function paintGymReflection(mwu, mhu, shirt, skin, figX) {
  const S = 2.5, c = offscreen(mwu * S, mhu * S), x = c.getContext('2d');
  x.scale(S, S);
  let g = x.createLinearGradient(0, 0, 0, mhu); g.addColorStop(0, '#93899f'); g.addColorStop(0.55, '#756a86'); g.addColorStop(1, '#4d4560');
  x.fillStyle = g; x.fillRect(0, 0, mwu, mhu);
  // paarse wandbaan rechts
  x.fillStyle = 'rgba(91,42,134,0.6)'; x.fillRect(mwu * 0.6, 9, mwu * 0.4, mhu * 0.62);
  // ramen links met daglicht
  for (let i = 0; i < 2; i++) {
    const wx = mwu * (0.04 + i * 0.17), ww = mwu * 0.14;
    g = x.createLinearGradient(0, 15, 0, 46); g.addColorStop(0, '#eef6fb'); g.addColorStop(1, '#a9c8e0');
    x.fillStyle = g; x.fillRect(wx, 15, ww, 31);
    x.fillStyle = '#3a3448'; x.fillRect(wx + ww / 2 - 0.4, 15, 0.8, 31); x.fillRect(wx, 29, ww, 0.8);
  }
  g = x.createRadialGradient(mwu * 0.2, 30, 0, mwu * 0.2, 30, mwu * 0.4); g.addColorStop(0, 'rgba(235,245,255,0.3)'); g.addColorStop(1, 'rgba(235,245,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, mwu, mhu);
  // plafond met ledlijnen
  x.fillStyle = '#2c2640'; x.fillRect(0, 0, mwu, 8.5);
  x.fillStyle = '#ffffff'; x.fillRect(0, 1.9, mwu, 1); x.fillRect(mwu * 0.12, 5.6, mwu * 0.76, 0.7);
  g = x.createLinearGradient(0, 8.5, 0, 20); g.addColorStop(0, 'rgba(255,255,255,0.28)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 8.5, mwu, 11.5);
  // vloer: donker rubber met de weerschijn van de ramen
  const fy = mhu * 0.76;
  g = x.createLinearGradient(0, fy, 0, mhu); g.addColorStop(0, '#34313d'); g.addColorStop(1, '#17151c');
  x.fillStyle = g; x.fillRect(0, fy, mwu, mhu - fy);
  x.fillStyle = 'rgba(200,220,240,0.14)'; x.beginPath(); x.moveTo(mwu * 0.04, fy); x.lineTo(mwu * 0.35, fy); x.lineTo(mwu * 0.5, mhu); x.lineTo(mwu * 0.1, mhu); x.closePath(); x.fill();
  // rek met dumbbells (twee planken, de schijven als rondjes)
  x.fillStyle = '#1d1c22';
  for (const lx of [0.04, 0.5, 0.94]) x.fillRect(mwu * lx, mhu * 0.55, 1.2, fy - mhu * 0.55 + 1);
  for (const [sy, n] of [[0.62, 9], [0.71, 8]]) {
    x.fillStyle = '#26252c'; x.fillRect(mwu * 0.03, mhu * sy, mwu * 0.94, 1.6);
    for (let i = 0; i < n; i++) {
      const dx = mwu * (0.09 + i * (0.84 / (n - 1))), r = 1.5 + (i % 3) * 0.25, dy = mhu * sy - r;
      x.fillStyle = '#8b9198'; x.fillRect(dx - 2.2, dy - 0.35, 4.4, 0.7);
      x.fillStyle = i % 2 ? '#6a2f9c' : '#1b1b20';
      x.beginPath(); x.arc(dx - 2.2, dy, r, 0, 7); x.fill(); x.beginPath(); x.arc(dx + 2.2, dy, r, 0, 7); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.3)'; x.beginPath(); x.arc(dx - 2.6, dy - 0.5, r * 0.4, 0, 7); x.fill(); x.beginPath(); x.arc(dx + 1.8, dy - 0.5, r * 0.4, 0, 7); x.fill();
    }
  }
  // jezelf in de spiegel: verder weg, dus kleiner en wat fletser
  x.save(); x.translate(figX, 11); x.scale(0.8, 0.8); x.globalAlpha = 0.82;
  drawGymBody(x, -1.5, 11, 1, shirt, skin, 120);
  x.restore();
  return c;
}

// Het vaste beeld: paarse wand met strijklicht, de spiegel in een aluminium lijst (met de onscherpe zaal erin),
// het gele briefje en een vignet. M is een rand rondom voor het trillen.
function paintGymScene(W, H, M, shirt, skin) {
  const u = H / 100, rnd = seeded(17);
  const c = offscreen(W + 2 * M, H + 2 * M), x = c.getContext('2d');
  x.translate(M, M);
  let g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#472466'); g.addColorStop(0.55, '#2c1741'); g.addColorStop(1, '#170d22');
  x.fillStyle = g; x.fillRect(-M, -M, W + 2 * M, H + 2 * M);
  // wandpanelen met naden, en het licht van de ledlijn langs het plafond
  for (let px = -M; px < W + M; px += 22 * u) { x.fillStyle = 'rgba(0,0,0,0.22)'; x.fillRect(px, -M, Math.max(1, 0.25 * u), H + 2 * M); x.fillStyle = 'rgba(255,255,255,0.05)'; x.fillRect(px + Math.max(1, 0.25 * u), -M, Math.max(1, 0.2 * u), H + 2 * M); }
  for (let i = 0; i < 260; i++) { x.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.05)'; x.fillRect(rnd() * (W + 2 * M) - M, rnd() * (H + 2 * M) - M, (2 + rnd() * 10) * u, Math.max(1, 0.18 * u)); }
  g = x.createLinearGradient(0, 0, 0, 16 * u); g.addColorStop(0, 'rgba(214,170,255,0.38)'); g.addColorStop(1, 'rgba(214,170,255,0)');
  x.fillStyle = g; x.fillRect(-M, -M, W + 2 * M, 16 * u + M);
  x.fillStyle = 'rgba(245,230,255,0.9)'; x.fillRect(-M, 0.6 * u, W + 2 * M, 0.5 * u);
  // spiegel: schaduw op de wand, aluminium lijst, glas
  const mx = W * 0.2, my = 8 * u, mw = W * 0.6, mh = 74 * u, fr = 1.2 * u;
  x.save(); x.shadowColor = 'rgba(0,0,0,0.6)'; x.shadowBlur = 3 * u; x.shadowOffsetY = 1.2 * u;
  x.fillStyle = '#8f979e'; x.fillRect(mx - fr, my - fr, mw + 2 * fr, mh + 2 * fr); x.restore();
  g = x.createLinearGradient(mx - fr, my - fr, mx + mw + fr, my + mh + fr); g.addColorStop(0, '#eef1f3'); g.addColorStop(0.3, '#a3abb2'); g.addColorStop(0.6, '#d5dade'); g.addColorStop(1, '#6f777e');
  x.fillStyle = g; x.fillRect(mx - fr, my - fr, mw + 2 * fr, mh + 2 * fr);
  x.strokeStyle = 'rgba(255,255,255,0.7)'; x.lineWidth = Math.max(1, 0.2 * u); x.strokeRect(mx - fr + x.lineWidth / 2, my - fr + x.lineWidth / 2, mw + 2 * fr - x.lineWidth, mh + 2 * fr - x.lineWidth);
  // de zaal in de spiegel: voortekenen, twee keer halveren en in twee stappen uitvergroten = zachte onscherpte
  const mwu = Math.min(mw / u, 420); // begrensd, voor het geval het canvas (nog) bijna geen hoogte heeft
  const room = paintGymReflection(mwu, 74, shirt, skin, mwu / 2 - 3 + 11);
  const half = offscreen(room.width / 2, room.height / 2); half.getContext('2d').drawImage(room, 0, 0, half.width, half.height);
  const soft = offscreen(half.width * 2, half.height * 2), sx = soft.getContext('2d'); sx.imageSmoothingEnabled = true; sx.imageSmoothingQuality = 'high'; sx.drawImage(half, 0, 0, soft.width, soft.height);
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  x.drawImage(soft, mx, my, mw, mh);
  x.save(); x.beginPath(); x.rect(mx, my, mw, mh); x.clip();
  // glas: koele zweem, schuine lichtbanen en een donker randje langs de lijst
  x.fillStyle = 'rgba(190,215,235,0.1)'; x.fillRect(mx, my, mw, mh);
  for (const [f0, wid, al] of [[0.06, 0.14, 0.2], [0.24, 0.035, 0.12], [0.7, 0.2, 0.08]]) {
    g = x.createLinearGradient(mx + mw * f0, 0, mx + mw * (f0 + wid), 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, `rgba(255,255,255,${al})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.beginPath(); x.moveTo(mx + mw * f0, my); x.lineTo(mx + mw * (f0 + wid), my); x.lineTo(mx + mw * (f0 + wid - 0.2), my + mh); x.lineTo(mx + mw * (f0 - 0.2), my + mh); x.closePath(); x.fill();
  }
  x.strokeStyle = 'rgba(20,16,30,0.55)'; x.lineWidth = Math.max(2, 0.5 * u); x.strokeRect(mx, my, mw, mh);
  x.restore();
  // briefje op de spiegel (de tekst komt er elk beeld op)
  x.save(); x.translate(mx + mw - 9 * u, my + 9 * u); x.rotate(0.08);
  x.shadowColor = 'rgba(0,0,0,0.4)'; x.shadowBlur = 1.2 * u; x.shadowOffsetX = 0.3 * u; x.shadowOffsetY = 0.6 * u;
  g = x.createLinearGradient(0, -5 * u, 0, 5 * u); g.addColorStop(0, '#fff8ae'); g.addColorStop(1, '#f0de6e');
  x.fillStyle = g; x.fillRect(-7 * u, -5 * u, 14 * u, 10 * u);
  x.shadowColor = 'transparent'; x.fillStyle = 'rgba(160,140,40,0.3)'; x.fillRect(-7 * u, -5 * u, 14 * u, 1.6 * u); // plakrand
  x.restore();
  // vignet
  const R = Math.hypot(W, H) / 2;
  g = x.createRadialGradient(W / 2, H * 0.45, R * 0.55, W / 2, H * 0.45, R * 1.1); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.6)');
  x.fillStyle = g; x.fillRect(-M, -M, W + 2 * M, H + 2 * M);
  return c;
}

// Losse lichaamsdelen en de halter als plaatjes; elk met een ankerpunt (ax, ay).
function paintGymParts(u, shirt, skin) {
  const P = {};
  const make = (w, h, ax, ay, fn) => { const c = offscreen(w, h), x = c.getContext('2d'); x.translate(ax, ay); fn(x); return { c, ax, ay }; };
  // bovenarm: van de schouder (0, 0) naar de elleboog (1u, 17u)
  P.upper = make(9 * u, 24 * u, 4 * u, 3.5 * u, (x) => {
    const g = x.createLinearGradient(-2.5 * u, 0, 3.5 * u, 0); g.addColorStop(0, tone(skin, 0.62)); g.addColorStop(0.5, tone(skin, 0.98)); g.addColorStop(0.8, tone(skin, 1.08)); g.addColorStop(1, tone(skin, 0.86));
    x.strokeStyle = g; x.lineWidth = 5 * u; x.lineCap = 'round'; x.beginPath(); x.moveTo(0, 0); x.lineTo(1 * u, 17 * u); x.stroke();
  });
  // biceps: een bolling die in de breedte wordt uitgerekt naarmate je sterker wordt
  P.biceps = make(6 * u, 12 * u, 3 * u, 6 * u, (x) => {
    const g = x.createRadialGradient(0.9 * u, -1.8 * u, 0, 0, 0, 5.4 * u); g.addColorStop(0, tone(skin, 1.2)); g.addColorStop(0.45, tone(skin, 1.04)); g.addColorStop(1, tone(skin, 0.84));
    x.fillStyle = g; x.beginPath(); x.ellipse(0, 0, 2.4 * u, 5.2 * u, 0.08, 0, 7); x.fill();
  });
  // mouwtje
  P.sleeve = make(10 * u, 10 * u, 5 * u, 5 * u, (x) => {
    const g = x.createRadialGradient(1.6 * u, -1.8 * u, 0, 0, 0, 4.6 * u); g.addColorStop(0, tone(shirt, 1.22)); g.addColorStop(0.55, tone(shirt, 1)); g.addColorStop(1, tone(shirt, 0.72));
    x.fillStyle = g; x.beginPath(); x.ellipse(0, 0, 4.2 * u, 4 * u, 0, 0, 7); x.fill();
    x.strokeStyle = tone(shirt, 0.55); x.lineWidth = 0.5 * u; x.beginPath(); x.ellipse(0, 0, 4.2 * u - 0.25 * u, 4 * u - 0.25 * u, 0, 0.25, Math.PI - 0.25); x.stroke();
  });
  // onderarm: van de elleboog (0, 0) recht omlaag naar de pols (0, 14u), iets taps
  P.fore = make(7 * u, 19 * u, 3.5 * u, 3 * u, (x) => {
    const g = x.createLinearGradient(-2.4 * u, 0, 2.4 * u, 0); g.addColorStop(0, tone(skin, 0.66)); g.addColorStop(0.5, tone(skin, 0.98)); g.addColorStop(0.82, tone(skin, 1.1)); g.addColorStop(1, tone(skin, 0.88));
    x.fillStyle = g;
    x.beginPath(); x.arc(0, 0, 2.3 * u, Math.PI, 0); x.lineTo(1.8 * u, 14 * u); x.arc(0, 14 * u, 1.8 * u, 0, Math.PI); x.closePath(); x.fill();
  });
  // vuist
  P.fist = make(5 * u, 5 * u, 2.5 * u, 2.5 * u, (x) => {
    const g = x.createRadialGradient(0.5 * u, -0.7 * u, 0, 0, 0, 2 * u); g.addColorStop(0, tone(skin, 1.16)); g.addColorStop(0.6, tone(skin, 0.98)); g.addColorStop(1, tone(skin, 0.74));
    x.fillStyle = g; x.beginPath(); x.arc(0, 0, 1.9 * u, 0, 7); x.fill();
    x.strokeStyle = 'rgba(110,60,35,0.4)'; x.lineWidth = Math.max(1, 0.22 * u);
    for (const k of [-0.7, 0, 0.7]) { x.beginPath(); x.moveTo(0.5 * u, k * u); x.lineTo(1.6 * u, k * u * 1.1); x.stroke(); }
  });
  // halterschijven (je kijkt er recht tegenaan): gietijzer, paars of goud, met een verchroomde naaf
  P.plate = {};
  for (const [kg, hi, mid, lo] of [[5, '#71828c', '#37474f', '#151d21'], [8, '#cf7be3', '#8e24aa', '#430d55'], [12, '#fff0a0', '#ffc400', '#9a6f00']]) {
    const pr = (2.6 + kg * 0.22) * u, sz = Math.ceil(pr + u) * 2;
    P.plate[kg] = make(sz, sz, sz / 2, sz / 2, (x) => {
      let g = x.createRadialGradient(-pr * 0.35, -pr * 0.45, 0, 0, 0, pr); g.addColorStop(0, hi); g.addColorStop(0.55, mid); g.addColorStop(1, lo);
      x.shadowColor = 'rgba(0,0,0,0.45)'; x.shadowBlur = 0.8 * u; x.shadowOffsetY = 0.4 * u;
      x.fillStyle = g; x.beginPath(); x.arc(0, 0, pr, 0, 7); x.fill();
      x.shadowColor = 'transparent';
      x.strokeStyle = lo; x.lineWidth = pr * 0.1; x.beginPath(); x.arc(0, 0, pr * 0.95, 0, 7); x.stroke();
      x.strokeStyle = 'rgba(255,255,255,0.6)'; x.lineWidth = pr * 0.07; x.beginPath(); x.arc(0, 0, pr * 0.93, Math.PI * 1.05, Math.PI * 1.6); x.stroke();
      x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = pr * 0.07; x.beginPath(); x.arc(0, 0, pr * 0.7, 0, 7); x.stroke();
      x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = pr * 0.05; x.beginPath(); x.arc(0, 0, pr * 0.66, 0, 7); x.stroke();
      g = x.createLinearGradient(0, -pr * 0.28, 0, pr * 0.28); g.addColorStop(0, '#fafbfc'); g.addColorStop(0.5, '#aab2b8'); g.addColorStop(1, '#5d656b');
      x.fillStyle = g; x.beginPath(); x.arc(0, 0, pr * 0.28, 0, 7); x.fill();
      x.fillStyle = 'rgba(30,34,38,0.7)'; x.beginPath(); x.arc(0, 0, pr * 0.09, 0, 7); x.fill();
    });
    P.plate[kg].pr = pr;
  }
  // meter: glazen buis (de bak erachter en de glans erover)
  P.tube = (w, h) => ({
    back: make(w + 2 * u, h + 2 * u, u, u, (x) => {
      x.fillStyle = 'rgba(8,4,16,0.66)'; x.beginPath(); x.roundRect(0, 0, w, h, w / 2); x.fill();
      x.strokeStyle = 'rgba(255,255,255,0.3)'; x.lineWidth = Math.max(1, 0.2 * u); x.stroke();
    }),
    gloss: make(w + 2 * u, h + 2 * u, u, u, (x) => {
      const g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, 'rgba(255,255,255,0.05)'); g.addColorStop(0.28, 'rgba(255,255,255,0.42)'); g.addColorStop(0.5, 'rgba(255,255,255,0.04)'); g.addColorStop(1, 'rgba(0,0,0,0.3)');
      x.fillStyle = g; x.beginPath(); x.roundRect(0, 0, w, h, w / 2); x.fill();
    }),
  });
  return P;
}

// Ingedrukt houden = curlen, bovenin aanspannen tot de ring vol is, dan loslaten.
// Te vroeg loslaten of te lang blijven hangen kost punten en kracht. Doel: pomp op 100% binnen de tijd.
export function startCurls(g, { limit = 50, shirt = 0xe8a33d, skin = 0xf0c8a0 } = {}) {
  const ov = document.createElement('div');
  ov.className = 'mini-overlay';
  ov.innerHTML = `<div class="mini-head"><b>Biceps pompen</b><span class="mini-score"></span><button class="mini-stop" type="button">Stoppen</button></div><canvas class="mini-canvas"></canvas><div class="mini-hint">${g.input.isTouch ? 'Hou je vinger op het scherm om te curlen. Bovenin vasthouden tot de ring vol is, dan loslaten.' : 'Hou spatie of E (of de muis) ingedrukt om te curlen. Bovenin vasthouden tot de ring vol is, dan loslaten.'}</div>`;
  document.getElementById('hud').prepend(ov);
  document.body.classList.add('pov');
  ov.querySelector('.mini-stop').addEventListener('click', () => g.missions.stop());
  const cv = ov.querySelector('canvas'), ctx = cv.getContext('2d');
  fitCanvas(cv);
  const parts = new Particles();
  let held = false;
  const down = (e) => { if (e.target.closest?.('.mini-stop')) return; held = true; };
  const up = () => { held = false; };
  cv.addEventListener('pointerdown', down);
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);
  const kd = (e) => { if (e.code === 'Space' || e.code === 'KeyE') { held = true; e.preventDefault(); } };
  const ku = (e) => { if (e.code === 'Space' || e.code === 'KeyE') held = false; };
  addEventListener('keydown', kd); addEventListener('keyup', ku);

  const WEIGHTS = [{ kg: 5, at: 0, speed: 1.6, cost: 0.13 }, { kg: 8, at: 0.4, speed: 1.3, cost: 0.17 }, { kg: 12, at: 0.75, speed: 1.05, cost: 0.21 }];
  const SQUEEZE = 0.55; // seconden aanspannen bovenin
  let t = 0, a = 0, stamina = 1, pump = 0, reps = 0, perfect = 0, combo = 0, topT = 0, phase = 'down', burnT = 0, flexT = 0, ended = null, endT = 0, shakeT = 0, wIdx = 0, bannerT = 0, banner = '';
  const shout = (txt, x = 78, y = 28, cls = 'good') => popText(ov, txt, x, y, cls);
  const tiers = [[0, 'Spaghetti-armpjes'], [0.35, 'Gemiddelde Gulpenaar'], [0.7, 'Bijna strand-klaar'], [1, 'Mosaqua-klaar!']];
  const tierOf = (v) => tiers.filter(([at]) => v >= at).at(-1)[1];
  const coach = ['Nog eentje!', 'Kom op, Mosaqua wacht!', 'Voel die pomp!', 'Licht gewicht, baby!', 'Niet opgeven!'];
  let coachT = 3;
  // voorgetekende plaatjes; opnieuw bij een andere canvasmaat
  const MARGIN = 20;
  let art = null;
  const artFor = (W, H) => {
    if (art && art.W === W && art.H === H) return art;
    const u = H / 100, parts2 = paintGymParts(u, shirt, skin);
    // het lijf: van 20u boven de schouder tot onder de beeldrand
    const bodyH = H - 10 * u + MARGIN, body = offscreen(22 * u, bodyH), bx2 = body.getContext('2d');
    drawGymBody(bx2, 11 * u, 20 * u, u, shirt, skin, bodyH);
    art = { W, H, bg: paintGymScene(W, H, MARGIN, shirt, skin), body: { c: body, ax: 11 * u, ay: 20 * u }, parts: parts2, tubeL: parts2.tube(3.5 * u, 56 * u), tubeR: parts2.tube(4.5 * u, 56 * u) };
    return art;
  };

  return new Promise((resolve) => {
    let done = false;
    const finish = (r) => {
      if (done) return; done = true; g.minigame = null;
      ov.remove(); document.body.classList.remove('pov');
      removeEventListener('pointerup', up); removeEventListener('pointercancel', up); removeEventListener('keydown', kd); removeEventListener('keyup', ku);
      g.player.lockedFor = false;
      resolve(r);
    };
    g.minigame = {
      stop: () => finish(null),
      debug: { label: null, setHeld: (v) => { held = v; }, get a() { return a; }, get phase() { return phase; }, get topT() { return topT; }, get pump() { return pump; }, get stamina() { return stamina; } },
      update: (dt) => {
        g.player.lockedFor = true;
        fitCanvas(cv);
        const W = cv.width, H = cv.height, u = H / 100;
        const wt = WEIGHTS[wIdx];
        shakeT = Math.max(0, shakeT - dt * 2.5);
        bannerT = Math.max(0, bannerT - dt);
        if (ended) {
          endT += dt; flexT += dt;
          if (endT > 2.2) finish({ ok: ended === 'ok', pump, reps, perfect, time: t });
        } else {
          t += dt;
          // armbeweging
          const tired = stamina < 0.05 || burnT > 0;
          if (burnT > 0) burnT -= dt;
          if (held && !tired) {
            a = Math.min(1, a + wt.speed * dt * (0.6 + stamina * 0.5));
            stamina = Math.max(0, stamina - wt.cost * dt * (a >= 1 ? 1.6 : 1));
          } else {
            a = Math.max(0, a - 2.6 * dt);
            stamina = Math.min(1, stamina + (a <= 0.02 ? 0.32 : 0.12) * dt);
          }
          if (stamina <= 0.02 && burnT <= 0 && held) { burnT = 1.6; combo = 0; shout('Verzuurd! Even rusten...', 50, 40, 'bad big'); flash(ov, 'bad'); g.sfx?.play('fail'); shakeT = 1; }
          // herhalingen
          if (phase === 'down' && a > 0.08 && held) phase = 'up';
          if (phase === 'up') {
            if (a >= 1) { topT += dt; if (topT > SQUEEZE + 0.9 && Math.random() < dt * 3) shakeT = Math.max(shakeT, 0.4); }
            if (!held || tired) {
              // losgelaten: beoordelen
              let gain = 0, txt, cls;
              if (a < 0.95 && topT === 0) { txt = 'Helemaal omhoog!'; cls = 'bad'; combo = 0; }
              else if (topT < SQUEEZE * 0.8) { txt = 'Te kort aangespannen'; cls = 'bad'; gain = 0.02; combo = 0; }
              else if (topT <= SQUEEZE + 0.35) { gain = 0.07; combo++; perfect++; txt = combo >= 3 ? `Strak! x${combo}` : 'Strak!'; cls = combo >= 3 ? 'gold big' : 'gold'; flash(ov, 'gold'); g.sfx?.play('pop'); }
              else if (topT <= SQUEEZE + 0.9) { gain = 0.045; combo++; txt = 'Goed!'; cls = 'good'; g.sfx?.play('pop'); }
              else { gain = 0.025; combo = 0; txt = 'Te lang gehangen'; cls = 'bad'; }
              if (txt) {
                gain *= (1 + wIdx * 0.35) * (1 + Math.min(combo, 5) * 0.08);
                pump = Math.min(1, pump + gain);
                if (gain > 0.03) reps++;
                shout(txt, 70 + Math.random() * 10, 30 + Math.random() * 8, cls);
                if (gain > 0.03) {
                  const ex = W * 0.52, ey = H * 0.42;
                  parts.spawn(ex, ey, 10, { color: '#ffe082', speed: 220, up: 120, size: 4 * devicePixelRatio, life: 0.6, shape: 'circle' });
                  bump(ov.querySelector('.mini-score'));
                }
              }
              phase = 'down'; topT = 0;
            }
          }
          // zwaardere dumbbells bij meer pomp
          const nextW = WEIGHTS.findLastIndex((x) => pump >= x.at);
          if (nextW > wIdx) { wIdx = nextW; banner = `Zwaardere dumbbells: ${WEIGHTS[wIdx].kg} kg!`; bannerT = 1.8; g.sfx?.play('clink'); }
          // de trainer roept af en toe iets
          coachT -= dt;
          if (coachT <= 0) { coachT = 3.5 + Math.random() * 3; popText(ov, coach[Math.floor(Math.random() * coach.length)], 16, 22, 'good'); }
          // zweetdruppels als je moe wordt
          if (stamina < 0.4 && Math.random() < dt * 6) parts.spawn(W * 0.43 + Math.random() * W * 0.08, H * 0.25, 1, { color: '#bfe7ff', speed: 40, up: 20, size: 4 * devicePixelRatio, life: 0.9, shape: 'circle' });
          if (pump >= 1) { ended = 'ok'; endT = 0; flexT = 0; shout('MOSAQUA-KLAAR!', 50, 30, 'gold big'); flash(ov, 'gold'); g.sfx?.play('success'); g.sfx?.play('cheer'); parts.spawn(W / 2, H * 0.4, 60, { color: '#ffd54f', speed: 520, up: 260, size: 6 * devicePixelRatio, life: 1.2 }); }
          else if (t >= limit) { ended = 'te laat'; endT = 0; }
        }
        parts.update(dt);

        // ---------- tekenen: spiegel in de sportschool
        const A = artFor(W, H);
        ctx.save();
        if (shakeT > 0) ctx.translate((Math.random() - 0.5) * 10 * shakeT, (Math.random() - 0.5) * 6 * shakeT);
        ctx.drawImage(A.bg, -MARGIN, -MARGIN);
        // briefje op de spiegel
        const mx = W * 0.2, my = 8 * u, mw = W * 0.6;
        ctx.save(); ctx.translate(mx + mw - 9 * u, my + 9 * u); ctx.rotate(0.08);
        ctx.fillStyle = '#5d4037'; ctx.font = `700 ${2.2 * u}px Inter, sans-serif`; ctx.textAlign = 'center';
        ctx.fillText('Zaterdag', 0, -1.2 * u); ctx.fillText('MOSAQUA!', 0, 2 * u); ctx.restore();
        // jij, van opzij voor de spiegel (dan zie je de curl het best)
        const cx = W / 2 - 3 * u, sh = 30 * u; // schouder
        ctx.drawImage(A.body.c, cx - A.body.ax, sh - A.body.ay);
        // gezicht: wenkbrauw, oog en mond (verbeten als je aanspant)
        const strain = a > 0.85 || burnT > 0;
        ctx.strokeStyle = '#3e2723'; ctx.lineWidth = 0.55 * u; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(cx + 2.6 * u, sh - 14.1 * u); ctx.lineTo(cx + 5.3 * u, sh - (strain ? 13.3 : 14) * u); ctx.stroke();
        ctx.fillStyle = '#222';
        if (strain) ctx.fillRect(cx + 3 * u, sh - 12.6 * u, 2.2 * u, 0.6 * u); else { ctx.beginPath(); ctx.arc(cx + 4 * u, sh - 12.2 * u, 0.75 * u, 0, 7); ctx.fill(); }
        ctx.strokeStyle = '#7a3b2e'; ctx.lineWidth = 0.6 * u; ctx.beginPath();
        if (strain) { ctx.moveTo(cx + 3.2 * u, sh - 7.6 * u); ctx.lineTo(cx + 6 * u, sh - 7.8 * u); } else ctx.arc(cx + 4.6 * u, sh - 8.8 * u, 1.4 * u, 0.3, Math.PI - 0.6);
        ctx.stroke();
        if (burnT > 0 || stamina < 0.25) { ctx.fillStyle = 'rgba(255,80,80,0.35)'; ctx.beginPath(); ctx.ellipse(cx + 3.5 * u, sh - 9.5 * u, 1.7 * u, 1.1 * u, 0, 0, 7); ctx.fill(); }
        // voorste arm: bovenarm recht omlaag, onderarm draait om de elleboog omhoog
        const shx = cx + 1.5 * u, shy = sh + 2 * u, elx = cx + 2.5 * u, ely = sh + 19 * u;
        const bulge = 1 + pump * 0.7 + Math.max(0, a - 0.5) * (0.7 + pump * 0.6); // biceps zwelt op als je aanspant
        ctx.drawImage(A.parts.upper.c, shx - A.parts.upper.ax, shy - A.parts.upper.ay);
        { const bw2 = A.parts.biceps.c.width * bulge; ctx.drawImage(A.parts.biceps.c, elx + 1.6 * u * bulge - bw2 / 2, sh + 11 * u - A.parts.biceps.ay, bw2, A.parts.biceps.c.height); }
        if (pump > 0.5 && a > 0.6) { ctx.strokeStyle = 'rgba(120,60,140,0.55)'; ctx.lineWidth = 0.45 * u; ctx.beginPath(); ctx.moveTo(elx + 1.5 * u * bulge, sh + 7.5 * u); ctx.quadraticCurveTo(elx + 3 * u * bulge, sh + 11 * u, elx + 1.8 * u * bulge, sh + 14.5 * u); ctx.stroke(); }
        // mouwtje
        ctx.drawImage(A.parts.sleeve.c, shx + 0.5 * u - A.parts.sleeve.ax, shy + 2 * u - A.parts.sleeve.ay);
        // onderarm
        const th = a * 2.55, L = 14 * u;
        const hx = elx + Math.sin(th) * L, hy = ely + Math.cos(th) * L;
        ctx.save(); ctx.translate(elx, ely); ctx.rotate(-th); ctx.drawImage(A.parts.fore.c, -A.parts.fore.ax, -A.parts.fore.ay); ctx.restore();
        // dumbbell van opzij: de schijven zie je als rondjes
        const kg = WEIGHTS[wIdx].kg, plate = A.parts.plate[kg], pr = plate.pr;
        ctx.drawImage(plate.c, hx - plate.ax, hy - plate.ay);
        ctx.fillStyle = '#fff'; ctx.font = `800 ${1.8 * u}px Inter, sans-serif`; ctx.textAlign = 'center'; ctx.fillText(`${kg}`, hx, hy + pr + 2.6 * u);
        ctx.drawImage(A.parts.fist.c, hx - 0.6 * u - A.parts.fist.ax, hy - A.parts.fist.ay); // vuist
        // aanspanring bovenin
        if (phase === 'up' && a >= 1) {
          const k = Math.min(1, topT / SQUEEZE), over = topT > SQUEEZE + 0.9;
          ctx.lineWidth = 1.2 * u;
          ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(hx, hy, 6 * u, 0, 7); ctx.stroke();
          ctx.strokeStyle = over ? '#ff5252' : k >= 1 ? '#ffd54f' : '#ffffff';
          ctx.beginPath(); ctx.arc(hx, hy, 6 * u, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.stroke();
          if (k >= 1 && !over) { ctx.fillStyle = '#ffd54f'; ctx.font = `800 ${3 * u}px "Baloo 2", sans-serif`; ctx.textAlign = 'center'; ctx.fillText('LOS!', hx, hy - 8 * u); }
        }
        parts.draw(ctx);
        ctx.restore();
        // ---------- meters
        // kracht (links): glazen buis die van onder af gevuld is
        const bx = W * 0.06, bw = 3.5 * u, by = 20 * u, bh = 56 * u;
        const tube = (T, x0, w, level, fill) => {
          ctx.drawImage(T.back.c, x0 - T.back.ax, by - T.back.ay);
          ctx.save(); ctx.beginPath(); ctx.roundRect(x0, by, w, bh, w / 2); ctx.clip();
          ctx.fillStyle = fill; ctx.fillRect(x0, by + bh * (1 - level), w, bh * level);
          ctx.restore();
          ctx.drawImage(T.gloss.c, x0 - T.gloss.ax, by - T.gloss.ay);
        };
        tube(A.tubeL, bx, bw, stamina, stamina > 0.5 ? '#69f0ae' : stamina > 0.25 ? '#ffd740' : '#ff5252');
        ctx.fillStyle = '#fff'; ctx.font = `700 ${2.4 * u}px Inter, sans-serif`; ctx.textAlign = 'center'; ctx.fillText('kracht', bx + bw / 2, by + bh + 3.5 * u);
        // pomp (rechts) met niveaus
        const px = W * 0.9, pw = 4.5 * u;
        const pg = ctx.createLinearGradient(0, by + bh, 0, by); pg.addColorStop(0, '#b06cff'); pg.addColorStop(1, '#ffd54f');
        tube(A.tubeR, px, pw, pump, pg);
        ctx.textAlign = 'right'; ctx.font = `700 ${2.1 * u}px Inter, sans-serif`;
        for (const [at, name] of tiers) { const y = by + bh * (1 - at); ctx.fillStyle = pump >= at ? '#ffd54f' : 'rgba(255,255,255,0.6)'; ctx.fillRect(px - 1 * u, y - 0.2 * u, pw + 2 * u, 0.4 * u); ctx.fillText(name, px - 1.8 * u, y + 0.8 * u); }
        ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = `700 ${2.4 * u}px Inter, sans-serif`; ctx.fillText('pomp', px + pw / 2, by + bh + 3.5 * u);
        // melding zwaarder gewicht
        if (bannerT > 0) { ctx.globalAlpha = Math.min(1, bannerT * 2); const bg2 = ctx.createLinearGradient(0, 86 * u, 0, 93 * u); bg2.addColorStop(0, '#7a3fb0'); bg2.addColorStop(1, '#45206a'); ctx.fillStyle = bg2; ctx.beginPath(); ctx.roundRect(W * 0.25, 86 * u, W * 0.5, 7 * u, 1.6 * u); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(W * 0.25 + 1.6 * u, 86 * u, W * 0.5 - 3.2 * u, Math.max(1, 0.25 * u)); ctx.fillStyle = '#fff'; ctx.font = `800 ${3.6 * u}px "Baloo 2", sans-serif`; ctx.fillText(banner, W / 2, 91 * u); ctx.globalAlpha = 1; }
        // eindbeeld: flexen
        if (ended === 'ok') { ctx.fillStyle = `rgba(255,213,79,${Math.max(0, 0.25 - flexT * 0.1)})`; ctx.fillRect(0, 0, W, H); }
        ov.querySelector('.mini-score').textContent = `💪 ${Math.round(pump * 100)}% · ${tierOf(pump)} · ${WEIGHTS[wIdx].kg} kg · ${Math.max(0, Math.ceil(limit - t))} s`;
      },
    };
  });
}
