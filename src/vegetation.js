// Lage en middelhoge begroeiing: struiken, hagen langs voortuinen, graspollen en bloemen in bermen en plantsoenen,
// en bloembakken op de Markt. Alles als "instancing": per soort één tekenopdracht, hoeveel het er ook zijn.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng } from './world.js';
import { inTuin38 } from './tuin38.js';
import { Q } from './quality.js';

export function buildVegetation(w) {
  const rand = rng(777);
  const box = w.coreBox || { x0: -600, x1: 600, z0: -600, z1: 600 };
  const step = 1.6;
  const caps = w.isMobile ? { bush: 4500, hedge: 3500, tuft: 7000, flower: 2500 } : { bush: 10000, hedge: 8000, tuft: 18000, flower: 6000 };
  const cls = (x, z) => w.classAt(x, z);
  const hard = new Set(['voetpad', 'klinkers', 'rijbaan', 'fietspad', 'parkeer', 'verhard_gesloten', 'verhard_open']);
  // eerst tellen hoeveel plekken er zijn, zodat de verdeling over het hele dorp eerlijk is (niet alles aan één kant)
  const count = { struiken: 0, erf: 0, groen: 0 };
  for (let x = box.x0; x <= box.x1; x += step * 2) for (let z = box.z0; z <= box.z1; z += step * 2) {
    const c = cls(x, z);
    if (c === 'struiken') count.struiken += 4; else if (c === 'erf') count.erf += 4; else if (c === 'berm' || c === 'gras') count.groen += 4;
  }
  const pB = Math.min(1, caps.bush / Math.max(1, count.struiken * 0.55 + count.erf * 0.08 + count.groen * 0.06));
  const pH = Math.min(1, caps.hedge / Math.max(1, count.erf * 0.12));
  const pT = Math.min(1, caps.tuft / Math.max(1, count.groen * 0.35));
  const pF = Math.min(1, caps.flower / Math.max(1, count.groen * 0.08));
  const bushes = [], hedges = [], tufts = [], flowers = [];
  for (let gx = box.x0; gx <= box.x1; gx += step) {
    for (let gz = box.z0; gz <= box.z1; gz += step) {
      const x = gx + (rand() - 0.5) * step, z = gz + (rand() - 0.5) * step;
      if (inTuin38(x, z)) continue; // die tuin is apart nagebouwd (tuin38.js)
      const c = cls(x, z);
      if (c === 'struiken') { if (rand() < 0.55 * pB && !w.insideBuilding(x, z)) bushes.push([x, z, 0.7 + rand() * 0.9]); continue; }
      if (c === 'erf') {
        // voortuin: haag langs de stoep, af en toe een struik bij de gevel
        if (rand() < pH) {
          const nearHard = hard.has(cls(x + 1.2, z)) || hard.has(cls(x - 1.2, z)) || hard.has(cls(x, z + 1.2)) || hard.has(cls(x, z - 1.2));
          if (nearHard && !w.insideBuilding(x, z)) {
            // de haag loopt evenwijdig aan de stoep: kijk aan welke kant het verharde stuk ligt
            const ex = hard.has(cls(x + 1.2, z)) || hard.has(cls(x - 1.2, z));
            hedges.push([x, z, ex ? Math.PI / 2 : 0]); // stoep oost of west: haag loopt noord-zuid
            continue;
          }
        }
        if (rand() < 0.08 * pB) { const wall = w.nearestWall(x, z, 3.5); if (wall && !wall.inside && wall.d > 0.6) bushes.push([x, z, 0.5 + rand() * 0.6]); }
        continue;
      }
      if (c === 'berm' || c === 'gras') {
        if (rand() < 0.12 * pB) {
          const edge = cls(x + 1.5, z) !== c || cls(x - 1.5, z) !== c || cls(x, z + 1.5) !== c || cls(x, z - 1.5) !== c;
          if (edge) bushes.push([x, z, 0.5 + rand() * 0.7]);
        }
        if (rand() < (c === 'berm' ? 0.55 : 0.28) * pT) tufts.push([x, z, 0.6 + rand() * 0.8]);
        if (rand() < (c === 'berm' ? 0.14 : 0.05) * pF) flowers.push([x, z]);
      }
    }
  }
  const T = 150;
  const tiles = new Map();
  const tileOf = (x, z) => { const k = Math.floor(x / T) + ',' + Math.floor(z / T); if (!tiles.has(k)) { const g = new THREE.Group(); g.userData.c = [(Math.floor(x / T) + 0.5) * T, (Math.floor(z / T) + 0.5) * T]; tiles.set(k, g); } return tiles.get(k); };
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  const make = (geo, mat, list, fn, shadow = false) => {
    if (!list.length) return;
    const byTile = new Map();
    for (const it of list) { const g = tileOf(it[0], it[1]); if (!byTile.has(g)) byTile.set(g, []); byTile.get(g).push(it); }
    for (const [g, items] of byTile) {
      const im = new THREE.InstancedMesh(geo, mat, items.length);
      items.forEach((it, i) => fn(im, it, i));
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.castShadow = shadow && !w.isMobile; im.receiveShadow = true;
      im.computeBoundingSphere();
      g.add(im);
    }
  };
  // Blad: een kern met daaromheen een paar dunne schillen met losse blaadjes (uitgeknipt met een bladtextuur).
  // Zo krijgen hagen en struiken een rafelige, bladerige rand in plaats van een strak blok. Op de telefoon alleen de kern.
  const leafTex = Q.laag ? null : leafTexture();
  const shellMat = (cut) => { const mt = new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: cut, roughness: 0.9, side: THREE.DoubleSide }); if (Q.msaa) mt.alphaToCoverage = true; return mt; };
  const coreMat = new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: Q.laag });
  // struiken: platgedrukte, ruwe bollen
  const bushShape = (r, detail, uvScale) => {
    const g = new THREE.IcosahedronGeometry(r, detail);
    g.translate(0, 0.45, 0);
    const pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const k = 0.85 + Math.sin(x * 7.3 + z * 5.1) * Math.cos(y * 6.7) * 0.15;
      pos.setXYZ(i, x * k, y * k * 0.85, z * k);
      uv.setXY(i, uv.getX(i) * uvScale * 2, uv.getY(i) * uvScale);
    }
    g.computeVertexNormals();
    return g;
  };
  const bushRand = bushes.map(() => [rand() * 6.28, 0.9 + rand() * 0.3, 0.8 + rand() * 0.5, 0.9 + rand() * 0.3, 0.24 + rand() * 0.07, 0.38 + rand() * 0.12, 0.09 + rand() * 0.05]);
  const bushIdx = new Map(bushes.map((b, i) => [b, i]));
  const putBush = (light) => (im, it, i) => {
    const [x, z, sc] = it, r = bushRand[bushIdx.get(it)];
    p.set(x, w.groundAt(x, z) - 0.05, z); q.setFromAxisAngle(up, r[0]); s.set(sc * r[1], sc * r[2], sc * r[3]);
    im.setMatrixAt(i, m.compose(p, q, s)); im.setColorAt(i, col.setHSL(r[4], r[5], (r[6] + (light ? 0.1 : 0)) * (light ? 2.2 : 1)));
  };
  make(bushShape(Q.laag ? 0.7 : 0.62, Q.laag ? 1 : 0, 1), coreMat, bushes, putBush(false), true);
  if (!Q.laag) {
    make(bushShape(0.7, 1, 3), shellMat(0.35), bushes, putBush(true), true);
    make(bushShape(0.78, 1, 2.3), shellMat(0.6), bushes, putBush(true));
  }
  // hagen: groene blokken langs de stoep (met een beetje variatie in hoogte)
  const hedgeShape = (e, uvScale, seg) => {
    const g = new THREE.BoxGeometry(1.75 + e * 2, 1 + e, 0.6 + e * 2, seg ? 7 : 1, seg ? 4 : 1, seg ? 3 : 1);
    const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      // bladtextuur in meters over elk vlak (niet uitgerekt over de lange zijde)
      const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i));
      uv.setXY(i, (nx > 0.5 ? z : x) * uvScale + e * 3, (ny > 0.5 ? z : y) * uvScale + e * 5);
      if (seg) {
        const n = Math.sin(x * 9.1 + y * 5.3) * Math.cos(z * 7.7 + x * 3.1) * 0.06 + Math.sin(i * 12.9898) * 0.03;
        const round = y > 0.45 ? (Math.abs(z) / 0.3) * 0.08 : 0;
        pos.setXYZ(i, x + n * 0.5, y + n - round, z * (1 + n * 1.5));
      }
    }
    g.translate(0, 0.5 + e / 2, 0);
    if (seg) g.computeVertexNormals();
    return g;
  };
  const hedgeRand = hedges.map(() => [0.8 + rand() * 0.5, 0.26 + rand() * 0.05, 0.08 + rand() * 0.04]);
  const hedgeIdx = new Map(hedges.map((h, i) => [h, i]));
  const putHedge = (light) => (im, it, i) => {
    const [x, z, yaw] = it, r = hedgeRand[hedgeIdx.get(it)];
    p.set(x, w.groundAt(x, z) - 0.05, z); q.setFromAxisAngle(up, yaw); s.set(1, r[0], 1);
    im.setMatrixAt(i, m.compose(p, q, s)); im.setColorAt(i, col.setHSL(r[1], 0.4, light ? (r[2] + 0.1) * 2.2 : r[2]));
  };
  make(hedgeShape(Q.laag ? 0 : -0.04, 1, Q.laag), coreMat, hedges, putHedge(false), true);
  if (!Q.laag) {
    make(hedgeShape(0.0, 1.5, false), shellMat(0.3), hedges, putHedge(true), true);
    make(hedgeShape(0.035, 1.9, false), shellMat(0.5), hedges, putHedge(true));
    make(hedgeShape(0.07, 1.3, false), shellMat(0.68), hedges, putHedge(true));
  }
  // graspollen: drie smalle sprieten
  const blade = (a, h, lean) => { const g = new THREE.ConeGeometry(0.018, h, 3, 1, true); g.translate(0, h / 2, 0); g.rotateZ(lean); g.rotateY(a); return g; };
  const tuftGeo = mergeGeometries([blade(0, 0.32, 0.2), blade(1.3, 0.26, 0.35), blade(2.5, 0.36, 0.15), blade(3.8, 0.28, 0.3), blade(5.0, 0.3, 0.25)]);
  make(tuftGeo, new THREE.MeshStandardMaterial({ roughness: 1, side: THREE.DoubleSide }), tufts, (im, [x, z, sc], i) => {
    p.set(x, w.groundAt(x, z) - 0.02, z); q.setFromAxisAngle(up, rand() * 6.28); s.set(sc, sc * (0.8 + rand() * 0.6), sc);
    im.setMatrixAt(i, m.compose(p, q, s)); im.setColorAt(i, col.setHSL(0.2 + rand() * 0.07, 0.4, 0.14 + rand() * 0.08));
  });
  // bloemen: steeltje met een gekleurd kopje (paardenbloem, klaproos, margriet, korenbloem)
  const flowerGeo = mergeGeometries([(() => { const g = new THREE.CylinderGeometry(0.01, 0.01, 0.35, 3); g.translate(0, 0.17, 0); return g; })(), (() => { const g = new THREE.SphereGeometry(0.05, 6, 4); g.scale(1, 0.5, 1); g.translate(0, 0.36, 0); return g; })()]);
  const fc = [0xfdd835, 0xe53935, 0xffffff, 0x5c6bc0, 0xf48fb1];
  make(flowerGeo, new THREE.MeshStandardMaterial({ roughness: 0.8 }), flowers, (im, [x, z], i) => {
    p.set(x, w.groundAt(x, z) - 0.02, z); q.setFromAxisAngle(up, rand() * 6.28); s.setScalar(0.8 + rand() * 0.6);
    im.setMatrixAt(i, m.compose(p, q, s)); im.setColorAt(i, col.set(fc[Math.floor(rand() * fc.length)]));
  });
  w.vegTiles = [...tiles.values()];
  w.vegTiles.forEach((g) => w.scene.add(g));
  return { bushes: bushes.length, hedges: hedges.length, tufts: tufts.length, flowers: flowers.length, tiles: w.vegTiles.length };
}

// Bloembakken op de Markt: op de klinkers, niet op de rijbaan en niet tegen de gevels.
export function buildPlanters(w, markt) {
  const rand = rng(99);
  const spots = [];
  for (let tries = 0; tries < 400 && spots.length < 9; tries++) {
    const a = rand() * Math.PI * 2, r = 6 + rand() * 22;
    const x = markt[0] + Math.sin(a) * r, z = markt[1] + Math.cos(a) * r;
    const c = w.classAt(x, z);
    if (c === 'rijbaan' || c === 'water' || w.insideBuilding(x, z)) continue;
    const wall = w.nearestWall(x, z, 3);
    if (wall) continue;
    if (spots.some((o) => Math.hypot(o[0] - x, o[1] - z) < 6)) continue;
    spots.push([x, z]);
  }
  w.planterSpots = spots;
  if (!spots.length) return 0;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  const tub = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 0.55, 1.2).translate(0, 0.275, 0), new THREE.MeshStandardMaterial({ color: 0x6d4c33, roughness: 0.8 }), spots.length);
  const soil = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.55, 1).scale(1, 0.55, 1).translate(0, 0.72, 0), new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), spots.length);
  const bloom = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.12, 0).translate(0, 0.95, 0), new THREE.MeshStandardMaterial({ roughness: 0.7 }), spots.length * 8);
  const fc = [0xe53935, 0xfdd835, 0xffffff, 0xf48fb1, 0x8e24aa, 0xff7043];
  let k = 0;
  spots.forEach(([x, z], i) => {
    const y = w.groundAt(x, z);
    p.set(x, y, z); q.setFromAxisAngle(up, rand() * 0.5); m.compose(p, q, one);
    tub.setMatrixAt(i, m); soil.setMatrixAt(i, m); soil.setColorAt(i, col.setHSL(0.28, 0.5, 0.22));
    for (let j = 0; j < 8; j++) {
      p.set(x + (rand() - 0.5) * 0.8, y + rand() * 0.12, z + (rand() - 0.5) * 0.8); m.compose(p, q, one);
      bloom.setMatrixAt(k, m); bloom.setColorAt(k, col.set(fc[Math.floor(rand() * fc.length)])); k++;
    }
  });
  for (const im of [tub, soil, bloom]) { im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); w.scene.add(im); }
  return spots.length;
}

// Bladtextuur voor de schillen van hagen en struiken: losse blaadjes op een doorzichtige achtergrond.
// De dekking loopt per blad van het midden (vol) naar de rand (dun): een hogere drempel geeft dus kleinere blaadjes.
export function leafTexture(size = 256, n = 230, seed = 5) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const rand = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = rand() * size, y = rand() * size, r = 7 + rand() * 9, a = rand() * Math.PI, hue = 80 + rand() * 45, li = 38 + rand() * 30;
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
      if (x + ox < -r * 2 || x + ox > size + r * 2 || y + oy < -r * 2 || y + oy > size + r * 2) continue;
      g.save();
      g.translate(x + ox, y + oy); g.rotate(a); g.scale(1, 0.48);
      const grd = g.createRadialGradient(0, 0, 0, 0, 0, r);
      grd.addColorStop(0, `hsla(${hue},45%,${li}%,1)`);
      grd.addColorStop(0.55, `hsla(${hue},45%,${li - 6}%,0.8)`);
      grd.addColorStop(1, `hsla(${hue},45%,${li - 12}%,0.25)`);
      g.fillStyle = grd;
      g.beginPath(); g.moveTo(-r, 0); g.quadraticCurveTo(0, -r * 1.25, r, 0); g.quadraticCurveTo(0, r * 1.25, -r, 0); g.fill();
      g.restore();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
