// Gulpener Bierfeesten op de Markt: het plein en de weg tussen De Zwarte Ruiter en Café Neubourg.
// Een groot podium met discolampen ter hoogte van IJssalon Mezzaluna, met Feestkabinet (een DJ en een MC),
// barretjes, eetkraampjes en veel feestvolk. Wordt alleen opgebouwd tijdens de missie.
import * as THREE from 'three';
import { makeCharacter } from './character.js';
import { signTexture } from './textures.js';
import { buildPartyLights } from './finale.js';

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });
const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; return m; };
const signMesh = (text, w, h, opts) => { const t = signTexture(text, opts); return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide, toneMapped: false })); };
const COLORS = [0xff1744, 0xffea00, 0x00e676, 0x2979ff, 0xd500f9, 0x00e5ff];

export function buildBierfeest(g) {
  const w = g.world, f = g.facades.frames;
  const pois = Object.fromEntries((w.meta.pois || []).map((p) => [p.id, p]));
  const A = f.zwarteruiter ? [f.zwarteruiter.x, f.zwarteruiter.z] : pois.zwarteruiter.pos;
  const B = f.neubourg ? [f.neubourg.x, f.neubourg.z] : pois.neubourg.pos;
  const mz = f.mezzaluna;
  if (!mz) return null;
  const root = new THREE.Group();
  g.scene.add(root);
  const updaters = [];

  // ---- podium voor Mezzaluna, met de voorkant van de gevel af (naar de kant van de Dorpsstraat)
  let sx = mz.x + mz.nx * 5, sz = mz.z + mz.nz * 5;
  [sx, sz] = w.resolve(sx, sz, 3);
  const sy = w.groundAt(sx, sz);
  const stage = new THREE.Group();
  stage.position.set(sx, sy, sz);
  stage.rotation.y = Math.atan2(mz.nx, mz.nz);
  root.add(stage);
  const dark = std(0x1c1c1c), metal = std(0x9e9e9e, { metalness: 0.7, roughness: 0.35 });
  stage.add(box(9, 1.2, 5, dark, 0, 0.6, 0));
  stage.add(box(9, 0.06, 5, std(0x2b2b2b), 0, 1.23, 0));
  // truss met lampen
  for (const [x, z] of [[-4.4, -2.4], [4.4, -2.4], [-4.4, 2.4], [4.4, 2.4]]) stage.add(box(0.25, 5.2, 0.25, metal, x, 3.8, z));
  stage.add(box(9.1, 0.3, 0.3, metal, 0, 6.3, 2.4), box(9.1, 0.3, 0.3, metal, 0, 6.3, -2.4), box(0.3, 0.3, 5, metal, -4.4, 6.3, 0), box(0.3, 0.3, 5, metal, 4.4, 6.3, 0));
  // achterdoek en spandoeken
  const back = signMesh('FEESTKABINET', 8.6, 3.2, { bg: '#120a2e', fg: '#ff4fd8', font: '900 200px "Baloo 2", sans-serif', w: 1024, h: 384, sub: 'DJ + MC', subFont: '700 70px Inter, sans-serif' });
  back.position.set(0, 3.4, -2.35); stage.add(back);
  const top = signMesh('GULPENER BIERFEESTEN', 8.8, 0.9, { bg: '#123a24', fg: '#f2c14e', font: '900 110px "Baloo 2", sans-serif', w: 1024, h: 112 });
  top.position.set(0, 6.9, 2.45); stage.add(top);
  // speakers en DJ-tafel
  for (const x of [-3.8, 3.8]) { stage.add(box(1, 2.2, 0.9, dark, x, 2.3, 1.8)); stage.add(box(0.9, 1.4, 0.8, dark, x, 4.1, 1.8)); }
  stage.add(box(2.2, 1, 0.8, std(0x111111), 0, 1.7, -0.6));
  const glow = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.8), new THREE.MeshBasicMaterial({ color: 0x00e5ff, toneMapped: false }));
  glow.position.set(0, 2.24, -0.6); stage.add(glow);
  // Feestkabinet: de DJ achter de tafel, de MC vooraan met microfoon
  const dj = makeCharacter({ shirt: 0x111111, pants: 0x222222, hair: 0x2b1d14, hat: 'cap', hatColor: 0x111111, sleeves: 'short' });
  dj.position.set(0, 1.26, -1.3); stage.add(dj);
  const mc = makeCharacter({ shirt: 0xff4fd8, pants: 0x111111, hair: 0x3e2723, sleeves: 'short' });
  mc.position.set(1.4, 1.26, 1.1); stage.add(mc);
  // bewegende discolampen: gekleurde lichtbundels vanaf de truss
  const beams = [];
  for (let k = 0; k < 6; k++) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.2, 9, 16, 1, true), new THREE.MeshBasicMaterial({ color: COLORS[k], transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    cone.geometry.translate(0, -4.5, 0); // punt bovenaan
    const pivot = new THREE.Group();
    pivot.position.set(-3.75 + k * 1.5, 6.1, 2.4);
    pivot.add(cone);
    stage.add(pivot);
    beams.push(pivot);
  }
  updaters.push((t) => {
    beams.forEach((b, k) => { b.rotation.x = 0.7 + Math.sin(t * 1.3 + k) * 0.45; b.rotation.z = Math.sin(t * 0.9 + k * 1.7) * 0.6; b.children[0].material.color.setHex(COLORS[(k + Math.floor(t * 2)) % COLORS.length]); });
    glow.material.color.setHex(COLORS[Math.floor(t * 4) % COLORS.length]);
    dj.userData.animate(1 / 60, 0, 'wave');
    mc.userData.animate(1 / 60, 0, 'wave');
    mc.position.y = 1.26 + Math.abs(Math.sin(t * 4.2)) * 0.25;
  });

  // ---- slingers met lampjes boven het plein (zelfde als bij het slotfeest)
  const mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
  const lights = buildPartyLights(g, ...w.resolve(mid[0], mid[1], 0.5));
  updaters.push((t, dt) => lights.update(dt));

  // ---- barretjes en eetkraampjes langs het plein
  const dx = B[0] - A[0], dz = B[1] - A[1], L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L, px = -uz, pz = ux;
  const stalls = [
    { t: 0.12, side: 1, text: 'GULPENER', sub: 'bar', bg: '#123a24', fg: '#f2c14e', bar: true },
    { t: 0.3, side: -1, text: 'FRIETEN', sub: 'met mayo', bg: '#fdd835', fg: '#b71c1c' },
    { t: 0.55, side: 1, text: 'GULPENER', sub: 'bar', bg: '#123a24', fg: '#f2c14e', bar: true },
    { t: 0.72, side: -1, text: 'BRAADWORST', sub: 'van de grill', bg: '#5d4037', fg: '#fff3e0' },
    { t: 0.9, side: 1, text: 'GULPENER', sub: 'bar', bg: '#123a24', fg: '#f2c14e', bar: true },
  ];
  let barSpot = null;
  for (const s of stalls) {
    let x = A[0] + dx * s.t + px * 7 * s.side, z = A[1] + dz * s.t + pz * 7 * s.side;
    if (Math.hypot(x - sx, z - sz) < 9) continue;
    [x, z] = w.resolve(x, z, 1.8);
    if (w.insideBuilding(x, z)) continue;
    const st = new THREE.Group();
    st.position.set(x, w.groundAt(x, z), z);
    st.rotation.y = Math.atan2(mid[0] - x, mid[1] - z); // naar het plein toe
    const wood = std(s.bar ? 0x2e4a32 : 0x8d6e63);
    st.add(box(3, 1.1, 0.8, wood, 0, 0.55, 0.6));
    st.add(box(3, 0.08, 1, std(0xd7ccc8), 0, 1.14, 0.6));
    for (const xx of [-1.45, 1.45]) st.add(box(0.1, 2.6, 0.1, wood, xx, 1.3, 1.0), box(0.1, 2.6, 0.1, wood, xx, 1.3, -0.4));
    st.add(box(3.4, 0.12, 1.8, std(s.bar ? 0xf2c14e : 0xffffff), 0, 2.65, 0.3));
    const sign = signMesh(s.text, 2.8, 0.55, { bg: s.bg, fg: s.fg, font: '900 120px "Baloo 2", sans-serif', w: 1024, h: 200, sub: s.sub, subFont: '700 50px Inter, sans-serif' });
    sign.position.set(0, 2.2, 1.06); st.add(sign);
    if (s.bar) for (let k = 0; k < 3; k++) { const tap = box(0.08, 0.35, 0.08, metal, -0.6 + k * 0.6, 1.35, 0.4); st.add(tap); }
    root.add(st);
    if (s.bar && !barSpot) {
      // achter de bar staan: daar tap jij
      const bx = x - Math.sin(st.rotation.y) * 0.4, bz = z - Math.cos(st.rotation.y) * 0.4;
      barSpot = { x: bx, z: bz, heading: st.rotation.y, front: [x + Math.sin(st.rotation.y) * 2.5, z + Math.cos(st.rotation.y) * 2.5] };
    }
  }

  // ---- feestvolk voor het podium: springen, zwaaien, biertje in de hand
  const crowd = [];
  const N = w.isMobile ? 16 : 28;
  const shirts = [0xe53935, 0xfdd835, 0x43a047, 0x1e88e5, 0x8e24aa, 0xff7043, 0x00acc1, 0xffffff, 0x123a24];
  for (let i = 0; i < N; i++) {
    let x = sx + mz.nx * (6 + Math.random() * 11) + mz.nz * (Math.random() - 0.5) * 14;
    let z = sz + mz.nz * (6 + Math.random() * 11) - mz.nx * (Math.random() - 0.5) * 14;
    [x, z] = w.resolve(x, z, 0.4);
    if (w.insideBuilding(x, z)) continue;
    const m = makeCharacter({ shirt: shirts[i % shirts.length], pants: [0x263238, 0x3e2723, 0x1a237e][i % 3], hair: [0x3b2a1a, 0xe6c770, 0x111111, 0x9e9e9e][i % 4], female: i % 3 === 0, hairStyle: i % 3 === 0 ? 'long' : undefined, sleeves: 'short' });
    const gy = w.groundAt(x, z);
    m.position.set(x, gy, z);
    m.rotation.y = Math.atan2(sx - x, sz - z);
    root.add(m);
    crowd.push({ m, gy, ph: Math.random() * 6, jump: Math.random() < 0.5 });
  }
  updaters.push((t) => {
    for (const c of crowd) {
      c.m.userData.animate(1 / 60, 0, 'wave');
      if (c.jump) c.m.position.y = c.gy + Math.max(0, Math.sin(t * 4.2 + c.ph)) * 0.35; // springen op de maat
    }
  });

  // bomen die het zicht op het podium wegnemen even weghalen: rond het podium, boven het feestvolk
  // en op de lijn van de bar naar het podium (waar de camera staat)
  const view = barSpot ? barSpot.front : [sx + mz.nx * 18, sz + mz.nz * 18];
  const segDist = (x, z, ax, az, bx, bz) => { const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez || 1; const k = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2)); return Math.hypot(x - ax - ex * k, z - az - ez * k); };
  const showTrees = w.hideTrees((x, z) => Math.hypot(x - sx, z - sz) < 11 || segDist(x, z, view[0], view[1], sx, sz) < 7 || Math.hypot(x - (sx + mz.nx * 11), z - (sz + mz.nz * 11)) < 10, [sx, sz], 60);

  let t = 0;
  return {
    stage: [sx, sz], stageY: sy, barSpot, crowd, mc,
    update(dt) { t += dt; for (const u of updaters) u(t, dt); },
    remove() { lights.remove(); g.scene.remove(root); showTrees(); },
  };
}
