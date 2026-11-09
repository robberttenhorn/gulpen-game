// Strakke bestrating: wegen, stoepen met echte stoepranden, fietspaden, parkeervakken,
// wegmarkering en water. Gebouwd als losse meshes die het terrein volgen.
import * as THREE from 'three';
import { Earcut } from 'three/src/extras/Earcut.js';
import { makeTextures } from './textures.js';

// klasse -> [texture, wereldmaat van één herhaling in meters, hoogte boven terrein, polygonOffset]
const LAYERS = {
  erf: ['erf', 1.26, 0.03, -1],
  verhard_open: ['erf', 1.26, 0.03, -1],
  verhard_gesloten: ['asfalt', 4, 0.03, -1],
  parkeer: ['parkeer', 1.68, 0.035, -2],
  klinkers: ['klinkers', 0.84, 0.04, -2],
  rijbaan: ['asfalt', 4, 0.04, -3],
  fietspad: ['fietspad', 4, 0.05, -4],
  voetpad: ['tegels', 1.2, 0.14, -5],
  brug: ['klinkers', 0.84, 0.12, -6],
};
const CURB_H = 0.14;

export function buildHardscape(world, scene) {
  const tx = makeTextures(world.isMobile);
  // fototexturen (Poly Haven) als die geladen zijn; de maat volgt de echte afmeting van de foto
  const layers = { ...LAYERS };
  const ph = world.photo?.ground;
  if (ph) {
    for (const k of ['asfalt', 'klinkers', 'tegels', 'parkeer']) tx[k] = { ...ph[k] };
    tx.erf = { ...ph.parkeer };
    // fietspad: rood asfalt
    tx.fietspad = { ...ph.asfalt, color: new THREE.Color(1.55, 0.62, 0.5) };
    for (const [cls, l] of Object.entries(layers)) layers[cls] = [l[0], ph[l[0]]?.size ?? (l[0] === 'erf' ? ph.parkeer.size : l[0] === 'fietspad' ? ph.asfalt.size : l[1]), l[2], l[3]];
  }
  const classes = world.ground.classes;
  const buckets = {};
  const curbs = [];
  const water = [];
  const maxEdge = world.isMobile ? 3.5 : 2.5;

  for (const [cls, rings] of world.ground.polys) {
    const name = classes[cls];
    if (name === 'water') { water.push(rings); continue; }
    const layer = LAYERS[name];
    if (!layer) continue;
    if (name === 'voetpad') { const sm = rings.map(smoothRing); (buckets[name] ||= []).push(sm); curbs.push(sm); continue; }
    (buckets[name] ||= []).push(rings);
  }

  const meshes = [];
  for (const [name, polys] of Object.entries(buckets)) {
    const [texName, size, lift, offset] = layers[name];
    const geo = drapePolys(world, polys, lift, size, maxEdge);
    if (!geo) continue;
    const t = tx[texName];
    const mat = new THREE.MeshStandardMaterial({
      map: t.map, normalMap: t.normalMap || null, roughness: name === 'rijbaan' ? 0.88 : 0.82, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: offset, polygonOffsetUnits: offset * 2,
    });
    if (t.normalMap) mat.normalScale.set(0.8, 0.8);
    if (t.color) mat.color.copy(t.color);
    world.applyAO?.(mat);
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    scene.add(m);
    meshes.push(m);
  }

  // stoepranden: verticale randjes langs de stoepen
  const curbGeo = buildCurbs(world, curbs);
  if (curbGeo) {
    const m = new THREE.Mesh(curbGeo, new THREE.MeshStandardMaterial({ map: tx.band.map, color: 0xd8d4cc, roughness: 0.7, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -12 }));
    m.receiveShadow = true;
    m.castShadow = false;
    scene.add(m);
  }

  // water
  const wgeo = drapePolys(world, water, 0.05, 6, maxEdge);
  let waterMat = null;
  if (wgeo) {
    const wn = waterNormals();
    waterMat = new THREE.MeshStandardMaterial({
      color: 0x24414c, roughness: 0.06, metalness: 0.1, normalMap: wn, envMapIntensity: 1.2,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    });
    waterMat.normalScale.set(0.35, 0.35);
    const m = new THREE.Mesh(wgeo, waterMat);
    m.receiveShadow = true;
    scene.add(m);
  }

  // wegmarkering
  const marks = buildMarkings(world);
  if (marks) {
    const m = new THREE.Mesh(marks, new THREE.MeshStandardMaterial({
      color: 0xf2f0e8, roughness: 0.6, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -12,
    }));
    m.receiveShadow = true;
    scene.add(m);
  }

  return {
    update(dt) {
      if (waterMat) {
        waterMat.normalMap.offset.x += dt * 0.02;
        waterMat.normalMap.offset.y += dt * 0.035;
      }
    },
  };
}

// ------------------------------------------------------------ geometrie

function drapePolys(world, polys, lift, uvSize, maxEdge) {
  const pos = [], nrm = [], uv = [];
  const n = new THREE.Vector3();
  const pushV = (x, z) => {
    const y = world.heightAt(x, z) + lift;
    pos.push(x, y, z);
    // normaal uit de hellingsgraad van het terrein
    const e = 1.5;
    const hx = world.heightAt(x + e, z) - world.heightAt(x - e, z);
    const hz = world.heightAt(x, z + e) - world.heightAt(x, z - e);
    n.set(-hx / (2 * e), 1, -hz / (2 * e)).normalize();
    nrm.push(n.x, n.y, n.z);
    uv.push(x / uvSize, z / uvSize);
  };
  // adaptief verfijnen: alleen opdelen waar het terrein krom is of de driehoek erg groot
  const max2 = (maxEdge * 4) ** 2, min2 = maxEdge * maxEdge;
  const bends = (ax, az, bx, bz) => {
    const mid = world.heightAt((ax + bx) / 2, (az + bz) / 2);
    return Math.abs(mid - (world.heightAt(ax, az) + world.heightAt(bx, bz)) / 2) > 0.025;
  };
  const tri = (ax, az, bx, bz, cx, cz, depth) => {
    const ab = (ax - bx) ** 2 + (az - bz) ** 2;
    const bc = (bx - cx) ** 2 + (bz - cz) ** 2;
    const ca = (cx - ax) ** 2 + (cz - az) ** 2;
    const m = Math.max(ab, bc, ca);
    let split = m > max2;
    if (!split && m > min2) {
      split = m === ab ? bends(ax, az, bx, bz) : m === bc ? bends(bx, bz, cx, cz) : bends(cx, cz, ax, az);
      if (!split) {
        const gx = (ax + bx + cx) / 3, gz = (az + bz + cz) / 3;
        split = Math.abs(world.heightAt(gx, gz) - (world.heightAt(ax, az) + world.heightAt(bx, bz) + world.heightAt(cx, cz)) / 3) > 0.025;
      }
    }
    if (split && depth < 14) {
      if (m === ab) {
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        tri(ax, az, mx, mz, cx, cz, depth + 1); tri(mx, mz, bx, bz, cx, cz, depth + 1);
      } else if (m === bc) {
        const mx = (bx + cx) / 2, mz = (bz + cz) / 2;
        tri(ax, az, bx, bz, mx, mz, depth + 1); tri(ax, az, mx, mz, cx, cz, depth + 1);
      } else {
        const mx = (cx + ax) / 2, mz = (cz + az) / 2;
        tri(ax, az, bx, bz, mx, mz, depth + 1); tri(mx, mz, bx, bz, cx, cz, depth + 1);
      }
      return;
    }
    // driehoek met de klok mee gezien van boven (y omhoog, z naar het zuiden) => normaal omhoog
    const cross = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
    if (cross > 0) { pushV(ax, az); pushV(cx, cz); pushV(bx, bz); }
    else { pushV(ax, az); pushV(bx, bz); pushV(cx, cz); }
  };
  for (const rings of polys) {
    const flat = [], holes = [];
    for (const ring of rings) {
      if (flat.length) holes.push(flat.length / 2);
      // laatste punt is gelijk aan het eerste; overslaan
      const len = ring.length >= 4 && ring[0] === ring[ring.length - 2] && ring[1] === ring[ring.length - 1] ? ring.length - 2 : ring.length;
      for (let i = 0; i < len; i++) flat.push(ring[i]);
    }
    const idx = Earcut.triangulate(flat, holes, 2);
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i] * 2, b = idx[i + 1] * 2, c = idx[i + 2] * 2;
      tri(flat[a], flat[a + 1], flat[b], flat[b + 1], flat[c], flat[c + 1], 0);
    }
  }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeBoundingSphere();
  return geo;
}

// gladstrijken: eerst piepkleine uitstulpingen weg (Douglas-Peucker), dan hoeken afronden (Chaikin)
const simplify = (p, tol) => {
  if (p.length < 3) return p;
  const keep = new Array(p.length).fill(false); keep[0] = keep[p.length - 1] = true;
  const st = [[0, p.length - 1]];
  while (st.length) {
    const [i0, i1] = st.pop();
    const [ax, az] = p[i0], [bx, bz] = p[i1], L = Math.hypot(bx - ax, bz - az) || 1e-6;
    let best = -1, bd = 0;
    for (let i = i0 + 1; i < i1; i++) { const d = Math.abs((bx - ax) * (az - p[i][1]) - (ax - p[i][0]) * (bz - az)) / L; if (d > bd) { bd = d; best = i; } }
    if (bd > tol) { keep[best] = true; st.push([i0, best], [best, i1]); }
  }
  return p.filter((_, i) => keep[i]);
};
const chaikin = (p, closed) => {
  if (p.length < 3) return p;
  const out = closed ? [] : [p[0]];
  const m = closed ? p.length : p.length - 1;
  for (let i = 0; i < m; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const f = Math.min(0.25, 0.6 / Math.max(L, 0.01)); // lange rechte stukken blijven recht, alleen de hoek wordt rond
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], [a[0] + (b[0] - a[0]) * (1 - f), a[1] + (b[1] - a[1]) * (1 - f)]);
  }
  if (!closed) out.push(p.at(-1));
  return out;
};

// Een stoepvlak gladstrijken: de kaart heeft punten op 10 cm afgerond, waardoor randen trapjes kregen.
// Dubbele punten weg, kleine trapjes eruit, en de hoeken licht afgerond. Gebruikt voor het vlak én de stoeprand.
function smoothRing(ring) {
  const pts = [];
  for (let i = 0; i < ring.length; i += 2) {
    const p = [ring[i], ring[i + 1]];
    if (!pts.length || Math.hypot(p[0] - pts.at(-1)[0], p[1] - pts.at(-1)[1]) > 0.01) pts.push(p);
  }
  if (pts.length > 1 && Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]) < 0.01) pts.pop();
  if (pts.length < 4) return ring;
  // Douglas-Peucker werkt op een open lijn: knip de ring bij het verste punt van het begin
  let far = 0, fd = 0;
  pts.forEach((p, i) => { const d = Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]); if (d > fd) { fd = d; far = i; } });
  const A = simplify(pts.slice(0, far + 1), 0.13), B = simplify(pts.slice(far).concat([pts[0]]), 0.13);
  let q = A.concat(B.slice(1, -1));
  if (q.length < 3) return ring;
  q = chaikin(chaikin(q, true), true);
  const out = [];
  for (const p of q) out.push(p[0], p[1]);
  out.push(q[0][0], q[0][1]);
  return out;
}

// Stoepranden: alleen waar de stoep aan een lager vlak grenst (weg, parkeervak, fietspad, gras, erf).
// Geen randjes tussen twee stukken stoep of tegen een gevel. De rand volgt een gladgestreken lijn
// (kleine hoekjes uit de kaart eruit, hoeken afgerond) en heeft een echt profiel: voorkant, afgeronde
// bovenrand en een smal bovenvlak dat net over de stoep valt.
function buildCurbs(world, polys) {
  const chains = [];
  const side = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.05) return 0;
    const nx = (bz - az) / len, nz = -(bx - ax) / len, mx = (ax + bx) / 2, mz = (az + bz) / 2;
    for (const d of [0.6, 0.9]) {
      const ca = world.classAt(mx + nx * d, mz + nz * d), cb = world.classAt(mx - nx * d, mz - nz * d);
      const low = (c) => c && c !== 'voetpad' && c !== 'brug' && !world.insideBuilding(mx - nx * d * Math.sign(c === cb ? 1 : -1), mz - nz * d * Math.sign(c === cb ? 1 : -1));
      if (ca === 'voetpad' && low(cb)) return 1; // stoep aan de kant van +n, ernaast iets lagers (weg, gras, erf)
      if (cb === 'voetpad' && low(ca)) return -1;
    }
    return 0;
  };
  for (const rings of polys) {
    for (const ring of rings) {
      const pts = [];
      for (let i = 0; i < ring.length; i += 2) pts.push([ring[i], ring[i + 1]]);
      if (pts.length > 1 && Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]) < 0.01) pts.pop();
      const n = pts.length;
      if (n < 2) continue;
      const sides = pts.map((p, i) => side(p[0], p[1], pts[(i + 1) % n][0], pts[(i + 1) % n][1]));
      // ketens van opeenvolgende randen met dezelfde stoepkant
      let start = sides.findIndex((v, i) => v !== sides[(i - 1 + n) % n]);
      if (start < 0) { if (sides[0]) chains.push({ pts: pts.slice(), closed: true, s: sides[0] }); continue; }
      let cur = null;
      for (let k = 0; k < n; k++) {
        const i = (start + k) % n;
        if (sides[i] && (!cur || cur.s !== sides[i])) { cur = { pts: [pts[i]], closed: false, s: sides[i] }; chains.push(cur); }
        if (!sides[i]) { cur = null; continue; }
        cur.pts.push(pts[(i + 1) % n]);
      }
    }
  }
  // profiel (dwars op de rand): [afstand naar de stoep toe, hoogte boven het maaiveld]
  const PROF = [[0, -0.06], [0, CURB_H - 0.035], [0.012, CURB_H - 0.012], [0.035, CURB_H + 0.004], [0.16, CURB_H + 0.006]];
  const pos = [], nrm = [], uv = [], idx = [];
  const maxSeg = 1.5;
  for (const c of chains) {
    let p = simplify(c.pts, 0.03);
    if (p.length < 2) continue;
    // lange stukken opdelen zodat de rand het terrein volgt
    const q = [];
    const m = c.closed ? p.length : p.length - 1;
    for (let i = 0; i < m; i++) {
      const a = p[i], b = p[(i + 1) % p.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const k = Math.max(1, Math.ceil(L / maxSeg));
      for (let j = 0; j < k; j++) q.push([a[0] + (b[0] - a[0]) * (j / k), a[1] + (b[1] - a[1]) * (j / k)]);
    }
    if (!c.closed) q.push(p.at(-1)); else q.push(q[0]);
    if (q.length < 2) continue;
    // per punt een gemiddelde richting, zodat de rand vloeiend doorloopt (geen knikken in het licht)
    const N = q.length, base = pos.length / 3;
    let along = 0;
    for (let i = 0; i < N; i++) {
      const pa = q[Math.max(0, i - 1)], pb = q[Math.min(N - 1, i + 1)];
      let tx = pb[0] - pa[0], tz = pb[1] - pa[1];
      if (c.closed && (i === 0 || i === N - 1)) { tx = q[1][0] - q[N - 2][0]; tz = q[1][1] - q[N - 2][1]; }
      const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      // naar de stoep toe: de stoepkant van de oorspronkelijke ring
      const ix = tz * c.s, iz = -tx * c.s;
      if (i) along += Math.hypot(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]);
      const g = world.heightAt(q[i][0], q[i][1]);
      for (let k = 0; k < PROF.length; k++) {
        const [o, h] = PROF[k];
        pos.push(q[i][0] + ix * o, g + h, q[i][1] + iz * o);
        // normaal: voorkant naar de weg, bovenvlak omhoog, de afronding ertussenin
        const up = k <= 1 ? 0 : k === 2 ? 0.55 : k === 3 ? 0.9 : 1;
        const out = Math.sqrt(1 - up * up);
        nrm.push(-ix * out, up, -iz * out);
        uv.push(along / 1.0, k / (PROF.length - 1));
      }
    }
    for (let i = 0; i < N - 1; i++) for (let k = 0; k < PROF.length - 1; k++) {
      const a = base + i * PROF.length + k, b = a + PROF.length;
      if (c.s > 0) idx.push(a, a + 1, b, b, a + 1, b + 1); else idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

// Witte middenstreep op wegen die breed genoeg zijn.
function buildMarkings(world) {
  const pos = [];
  const dash = 3, gap = 9, w = 0.12;
  for (const [name, ax, az, bx, bz] of world.segments) {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 4) continue;
    const dx = (bx - ax) / len, dz = (bz - az) / len;
    const px = -dz, pz = dx;
    for (let s = 1; s + dash < len; s += dash + gap) {
      const cx = ax + dx * (s + dash / 2), cz = az + dz * (s + dash / 2);
      if (world.classAt(cx, cz) !== 'rijbaan') continue;
      if (world.classAt(cx + px * 2.8, cz + pz * 2.8) !== 'rijbaan' || world.classAt(cx - px * 2.8, cz - pz * 2.8) !== 'rijbaan') continue;
      const x0 = ax + dx * s, z0 = az + dz * s, x1 = ax + dx * (s + dash), z1 = az + dz * (s + dash);
      const h0 = world.heightAt(x0, z0) + 0.06, h1 = world.heightAt(x1, z1) + 0.06;
      const q = [
        [x0 + px * w, h0, z0 + pz * w], [x0 - px * w, h0, z0 - pz * w], [x1 - px * w, h1, z1 - pz * w],
        [x0 + px * w, h0, z0 + pz * w], [x1 - px * w, h1, z1 - pz * w], [x1 + px * w, h1, z1 + pz * w],
      ];
      for (const v of q) pos.push(...v);
    }
  }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const nn = new Float32Array(pos.length);
  for (let i = 1; i < nn.length; i += 3) nn[i] = 1;
  geo.setAttribute('normal', new THREE.BufferAttribute(nn, 3));
  return geo;
}

function waterNormals() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2, v = (y / size) * Math.PI * 2;
      const dx = Math.cos(u * 3 + Math.sin(v * 2)) * 0.5 + Math.cos(u * 7 + v * 3) * 0.25;
      const dy = Math.sin(v * 4 + Math.cos(u * 2)) * 0.5 + Math.sin(v * 9 - u * 2) * 0.2;
      const i = (y * size + x) * 4;
      img.data[i] = (dx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (dy * 0.5 + 0.5) * 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 1);
  return t;
}

// Hoogte van het loopoppervlak (stoepen liggen iets hoger dan de weg).
export function surfaceLift(world, x, z) {
  const c = world.classAt(x, z);
  if (c === 'voetpad') return CURB_H;
  if (c === 'brug') return 0.12;
  return 0;
}
