// Voor- en achtertuin van Ringweg 38, nagebouwd naar de luchtfoto (PDOK, 8 cm per pixel), het kadaster (perceel Gulpen A 4328,
// 586 m²) en de BGT (haag langs de oostkant, muur langs de wei). Maten in meters binnen de kavel:
//   u = langs de straat (0 = westgrens, 14,3 = oostgrens), v = van de straat naar achteren (0 = stoep, 39,8 = achtergrens).
// Wat precies welke plant of welk meubel is, is een interpretatie van de luchtfoto.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const A = [456.2, -304.88]; // westelijke hoek aan de straat (lokale x, z)
const U = [0.93659, -0.35043]; // langs de straat, naar het oosten
const V = [-0.35043, -0.93659]; // van de straat af, naar achteren
const YAW = Math.atan2(0.35043, 0.93659); // lokale x-as van een object langs U, lokale z-as naar de straat
export const P = (u, v) => [A[0] + U[0] * u + V[0] * v, A[1] + U[1] * u + V[1] * v];
const toUV = (x, z) => { const dx = x - A[0], dz = z - A[1]; return [dx * U[0] + dz * U[1], dx * V[0] + dz * V[1]]; };

// ligt een punt op de kavel? (dan geen willekeurige struiken of hagen van de algemene begroeiing)
export function inTuin38(x, z) {
  const [u, v] = toUV(x, z);
  return u > -0.6 && u < 14.8 && v > -0.2 && v < 40.2;
}

// plek voor de Volvo: op de oprit, met de neus naar de straat
export function volvoSpot38() {
  const [x, z] = P(7.2, 4.3);
  return { x, z, heading: Math.atan2(-V[0], -V[1]) };
}

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function canvasTex(px, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  draw(c.getContext('2d'), px);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function textures() {
  const r = rng(38);
  const vary = (base, amt) => { const [h, s, l] = base; return `hsl(${h + (r() - 0.5) * amt * 10},${s}%,${l + (r() - 0.5) * amt * 8}%)`; };
  return {
    // rode klinkers in blokverband, 1 tegel = 0,8 m
    klinker: canvasTex(256, (g, n) => {
      g.fillStyle = '#6d5146'; g.fillRect(0, 0, n, n);
      const q = n / 4, b = q / 2, j = 2;
      for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) {
        const hor = (i + k) % 2 === 0;
        for (let e = 0; e < 2; e++) {
          g.fillStyle = vary([12, 42, 36], 1);
          if (hor) g.fillRect(i * q + j / 2, k * q + e * b + j / 2, q - j, b - j);
          else g.fillRect(i * q + e * b + j / 2, k * q + j / 2, b - j, q - j);
        }
      }
    }),
    // lichtgrijze betontegels van 60 x 60, 1 tegel = 1,2 m (2 x 2)
    tegel: canvasTex(256, (g, n) => {
      g.fillStyle = '#8f8c86'; g.fillRect(0, 0, n, n);
      for (let i = 0; i < 2; i++) for (let k = 0; k < 2; k++) {
        g.fillStyle = vary([40, 6, 60], 0.6); g.fillRect(i * n / 2 + 2, k * n / 2 + 2, n / 2 - 4, n / 2 - 4);
        for (let d = 0; d < 200; d++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},0.05)`; g.fillRect(i * n / 2 + r() * n / 2, k * n / 2 + r() * n / 2, 2, 2); }
      }
    }),
    // gazon met lichte maaibanen, 1 tegel = 2 m
    gras: canvasTex(256, (g, n) => {
      for (let y = 0; y < n; y++) { g.fillStyle = y % 128 < 64 ? '#466c2d' : '#4c7331'; g.fillRect(0, y, n, 1); }
      for (let d = 0; d < 5000; d++) { g.fillStyle = `hsla(${85 + r() * 25},${40 + r() * 20}%,${22 + r() * 22}%,0.7)`; g.fillRect(r() * n, r() * n, 1, 2 + r() * 3); }
    }),
    // houtsnippers en aarde in een border, 1 tegel = 1,5 m
    aarde: canvasTex(256, (g, n) => {
      g.fillStyle = '#3d2c22'; g.fillRect(0, 0, n, n);
      for (let d = 0; d < 3000; d++) { g.fillStyle = `hsl(${20 + r() * 15},${30 + r() * 20}%,${12 + r() * 16}%)`; g.fillRect(r() * n, r() * n, 2 + r() * 4, 1 + r() * 2); }
    }),
    // roodbruine baksteen (waalformaat in halfsteensverband), 1 tegel = 1,1 x 1,0 m
    muur: canvasTex(256, (g, n) => {
      g.fillStyle = '#b7aa98'; g.fillRect(0, 0, n, n);
      const rows = 16, cols = 5, h = n / rows, w = n / cols;
      for (let y = 0; y < rows; y++) for (let x = -1; x < cols; x++) {
        g.fillStyle = vary([10, 45, 33], 1.2);
        g.fillRect(x * w + (y % 2 ? w / 2 : 0) + 1.5, y * h + 1.5, w - 3, h - 3);
      }
    }),
    // bladeren van een haag, 1 tegel = 1 m
    haag: canvasTex(256, (g, n) => {
      g.fillStyle = '#20381c'; g.fillRect(0, 0, n, n);
      for (let d = 0; d < 2600; d++) { g.fillStyle = `hsl(${95 + r() * 30},${35 + r() * 25}%,${12 + r() * 20}%)`; g.beginPath(); g.ellipse(r() * n, r() * n, 2 + r() * 3, 1 + r() * 2, r() * 3, 0, 7); g.fill(); }
    }),
    // houten planken (moestuinbakken), 1 tegel = 1 m
    hout: canvasTex(128, (g, n) => {
      for (let y = 0; y < 4; y++) { g.fillStyle = vary([28, 35, 32], 1); g.fillRect(0, y * n / 4 + 1, n, n / 4 - 2); }
      for (let d = 0; d < 300; d++) { g.fillStyle = 'rgba(40,25,15,0.25)'; g.fillRect(r() * n, r() * n, 6 + r() * 20, 1); }
    }),
  };
}

// UV's van een box schalen naar meters, zodat een textuur op elke maat even groot blijft
function boxGeo(w, h, d, tile = 1, segs = 1) {
  const geo = new THREE.BoxGeometry(w, h, d, Math.max(1, Math.round(w * segs)), Math.max(1, Math.round(h * segs)), Math.max(1, Math.round(d * segs)));
  const uv = geo.attributes.uv, groups = geo.groups;
  const sizes = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  groups.forEach((gr, fi) => {
    const idx = geo.index.array;
    const seen = new Set();
    for (let i = gr.start; i < gr.start + gr.count; i++) {
      const vi = idx[i];
      if (seen.has(vi)) continue;
      seen.add(vi);
      uv.setXY(vi, (uv.getX(vi) * sizes[fi][0]) / tile, (uv.getY(vi) * sizes[fi][1]) / tile);
    }
  });
  return geo;
}

export function buildTuin38(g) {
  const w = g.world;
  const T = textures();
  const rand = rng(4328);
  const mats = {
    klinker: new THREE.MeshStandardMaterial({ map: T.klinker, roughness: 0.9 }),
    tegel: new THREE.MeshStandardMaterial({ map: T.tegel, roughness: 0.85 }),
    gras: new THREE.MeshStandardMaterial({ map: T.gras, roughness: 1 }),
    aarde: new THREE.MeshStandardMaterial({ map: T.aarde, roughness: 1 }),
    muur: new THREE.MeshStandardMaterial({ map: T.muur, roughness: 0.9 }),
    haag: new THREE.MeshStandardMaterial({ map: T.haag, roughness: 0.95 }),
    hout: new THREE.MeshStandardMaterial({ map: T.hout, roughness: 0.85 }),
    steen: new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.7 }),
    beton: new THREE.MeshStandardMaterial({ color: 0xa9a59c, roughness: 0.85 }),
    dak: new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.8 }),
    deur: new THREE.MeshStandardMaterial({ color: 0x3f2e22, roughness: 0.7 }),
    water: new THREE.MeshStandardMaterial({ color: 0x1b3640, roughness: 0.08, metalness: 0.2 }),
    blad: new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true, vertexColors: true }),
    stam: new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 1 }),
    metaal: new THREE.MeshStandardMaterial({ color: 0x3b3b3b, metalness: 0.6, roughness: 0.4 }),
    wit: new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.6 }),
    doek: new THREE.MeshStandardMaterial({ color: 0xe6dcc6, roughness: 0.9, side: THREE.DoubleSide }),
  };
  const batches = new Map(); // per materiaal één samengevoegd model: weinig tekenopdrachten
  const add = (geo, mat, matrix) => {
    if (matrix) geo.applyMatrix4(matrix);
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    if (!geo.attributes.color) { const c = new Float32Array(geo.attributes.position.count * 3).fill(1); geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const key = mat.uuid;
    if (!batches.has(key)) batches.set(key, { mat, geos: [] });
    batches.get(key).geos.push(geo.index ? geo.toNonIndexed() : geo);
  };
  // staaf tussen twee punten (u, v, hoogte)
  const seg = (a, b, r, mat) => {
    const [ax, az] = P(a[0], a[1]), [bx, bz] = P(b[0], b[1]);
    const A3 = new THREE.Vector3(ax, w.groundAt(ax, az) + a[2], az), B3 = new THREE.Vector3(bx, w.groundAt(bx, bz) + b[2], bz);
    const d = B3.clone().sub(A3), L = d.length();
    const geo = new THREE.CylinderGeometry(r, r, L, 6);
    const qq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    add(geo, mat, new THREE.Matrix4().compose(A3.add(B3).multiplyScalar(0.5), qq, new THREE.Vector3(1, 1, 1)));
  };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  const place = (u, v, y, yaw = 0, scale = one) => { const [x, z] = P(u, v); q.setFromAxisAngle(up, YAW + yaw); return m4.clone().compose(new THREE.Vector3(x, w.groundAt(x, z) + y, z), q, scale); };

  // vlak dat het maaiveld volgt (per meter een hoekpunt), met de textuur in meters
  const patch = (u0, u1, v0, v1, mat, lift, tile) => {
    const nu = Math.max(1, Math.ceil(u1 - u0)), nv = Math.max(1, Math.ceil(v1 - v0));
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const u = u0 + ((u1 - u0) * i) / nu, v = v0 + ((v1 - v0) * j) / nv;
      const [x, z] = P(u, v);
      pos.push(x, w.groundAt(x, z) + lift, z);
      uv.push(u / tile, v / tile);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    if (geo.attributes.normal.getY(0) < 0) { // met de voorkant naar boven
      for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
      geo.setIndex(idx);
      geo.computeVertexNormals();
    }
    add(geo, mat);
  };
  // blok in het kavelassenstelsel
  const block = (u0, u1, v0, v1, h, mat, { y = 0, tile = 1, segs = 1, jitter = 0 } = {}) => {
    const geo = boxGeo(u1 - u0, h, v1 - v0, tile, segs);
    if (jitter) { // hagen niet als strakke doos: hoekpunten een beetje verschuiven (zelfde plek = zelfde verschuiving)
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), yy = p.getY(i), z = p.getZ(i); const n = Math.sin(x * 12.9 + yy * 7.3 + z * 5.1) * 43758.5; const f = (n - Math.floor(n) - 0.5) * jitter; p.setXYZ(i, x * (1 + f * 0.15), yy + (yy > 0 ? f * 0.5 : 0), z * (1 + f * 0.15)); }
      geo.computeVertexNormals();
    }
    add(geo, mat, place((u0 + u1) / 2, (v0 + v1) / 2, y + h / 2));
  };
  const obstacles = [];
  const solid = (u0, u1, v0, v1) => obstacles.push([P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)]);
  // struik of kruin: een paar bollen met een kleur per bol
  const blob = (u, v, y, r, color, n = 4) => {
    for (let k = 0; k < n; k++) {
      const geo = new THREE.IcosahedronGeometry(r * (0.55 + rand() * 0.35), 1);
      const c = new THREE.Color(color).offsetHSL((rand() - 0.5) * 0.04, (rand() - 0.5) * 0.1, (rand() - 0.5) * 0.08);
      const col = new Float32Array(geo.attributes.position.count * 3);
      for (let i = 0; i < col.length; i += 3) { col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b; }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const a = rand() * Math.PI * 2, d = k ? r * 0.45 : 0;
      add(geo, mats.blad, place(u + Math.cos(a) * d, v + Math.sin(a) * d, y + (k ? (rand() - 0.3) * r * 0.5 : 0), 0, new THREE.Vector3(1, 0.8 + rand() * 0.3, 1)));
    }
  };

  // ---------------- VOORTUIN (v 0 - 8) ----------------
  patch(3.9, 10.1, 0.15, 9.9, mats.klinker, 0.08, 0.8); // oprit van rode klinkers tot aan de gevel en de berging
  patch(10.1, 14.0, 0.8, 8.0, mats.aarde, 0.11, 1.5); // border onder de boom
  patch(0.3, 3.9, 0.4, 7.6, mats.aarde, 0.11, 1.5); // plantvak links
  // plantvak links met een laag buxushaagje eromheen
  const box = { tile: 1, jitter: 0.6, segs: 3 };
  block(0.3, 3.9, 0.4, 0.75, 0.38, mats.haag, box);
  block(0.3, 3.9, 7.25, 7.6, 0.38, mats.haag, box);
  block(0.3, 0.65, 0.75, 7.25, 0.38, mats.haag, box);
  block(3.55, 3.9, 0.75, 7.25, 0.38, mats.haag, box);
  solid(0.3, 3.9, 0.4, 7.6);
  for (let k = 0; k < 7; k++) blob(1 + rand() * 2.2, 1.4 + k * 0.85, 0.25, 0.45 + rand() * 0.3, [0x3f6b34, 0x5d7f3a, 0x7a4a6a, 0x4a6e3f][k % 4], 3);
  // grote boom met roodbruin blad (op de luchtfoto een brede roodpaarse kruin van zo'n 6 m)
  add(new THREE.CylinderGeometry(0.14, 0.22, 2.4, 7).translate(0, 1.2, 0), mats.stam, place(12.2, 6.3, 0));
  for (let k = 0; k < 22; k++) { // brede, wat platte kruin van roodpaars blad
    const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * 2.4;
    blob(12.2 + Math.cos(a) * d, 6.3 + Math.sin(a) * d * 0.9, 2.6 + rand() * 1.6 - d * 0.25, 0.75 + rand() * 0.4, rand() < 0.3 ? 0x7a3040 : 0x5a2230, 1);
  }
  solid(12.0, 12.4, 6.1, 6.5);
  for (let k = 0; k < 5; k++) blob(10.6 + rand() * 2.8, 1.4 + rand() * 2.5, 0.3, 0.4 + rand() * 0.25, 0x46703a, 2);
  // haag langs de stoep rechts van de oprit en langs de oostgrens (BGT: haag)
  block(10.3, 13.7, 0.2, 0.8, 0.85, mats.haag, box); solid(10.3, 13.7, 0.2, 0.8);
  block(13.6, 14.35, 0.2, 10.0, 1.35, mats.haag, box); solid(13.6, 14.35, 0.2, 10.0);
  // lage betonnen zitrand (lichtgrijs op de luchtfoto)
  block(10.3, 12.9, 1.0, 1.45, 0.45, mats.beton); solid(10.3, 12.9, 1.0, 1.45);

  // ---------------- ZIJKANT (u 9 - 14, v 8 - 21) ----------------
  patch(9.0, 12.2, 9.9, 15.6, mats.tegel, 0.09, 1.2);
  patch(11.0, 12.2, 15.6, 21.0, mats.tegel, 0.09, 1.2);
  patch(12.2, 14.0, 12.8, 21.0, mats.aarde, 0.11, 1.5);
  for (let k = 0; k < 6; k++) blob(12.6 + rand() * 1.1, 13.4 + k * 1.2, 0.4, 0.55 + rand() * 0.3, [0x4c6a3a, 0x6a5a3a, 0x3d5e33][k % 3], 3);
  // berging van baksteen met plat dak, deur aan de kant van het pad
  block(11.3, 13.9, 10.0, 12.6, 2.4, mats.muur, { tile: 1.05 });
  block(11.2, 14.0, 9.9, 12.7, 0.12, mats.dak, { y: 2.4 });
  block(11.26, 11.3, 10.6, 11.5, 2.0, mats.deur);
  solid(11.3, 13.9, 10.0, 12.6);

  // ---------------- ACHTERTUIN (v 21 - 39,8) ----------------
  patch(0.2, 14.0, 20.0, 39.5, mats.gras, 0.07, 2); // gazon als ondergrond
  patch(0.6, 6.2, 22.6, 29.2, mats.tegel, 0.1, 1.2); // terras bij het huis
  patch(8.6, 13.9, 27.5, 30.6, mats.klinker, 0.1, 0.8); // strook klinkers
  patch(8.6, 13.9, 30.6, 36.8, mats.tegel, 0.1, 1.2); // terras achterin (met zweefparasol)
  patch(13.0, 14.0, 20.5, 27.5, mats.aarde, 0.11, 1.5); // border langs de muur
  patch(0.9, 2.4, 29.2, 39.3, mats.aarde, 0.11, 1.5); // border voor de haag
  // vijver: rand van lichte natuursteen rond het water uit de kaart
  let pu0 = 99, pu1 = -99, pv0 = 99, pv1 = -99;
  for (let u = 4; u <= 11; u += 0.25) for (let v = 21; v <= 30; v += 0.25) { const [x, z] = P(u, v); if (w.classAt(x, z) === 'water') { pu0 = Math.min(pu0, u); pu1 = Math.max(pu1, u); pv0 = Math.min(pv0, v); pv1 = Math.max(pv1, v); } }
  if (pu1 < pu0) { pu0 = 6.4; pu1 = 8.6; pv0 = 22.8; pv1 = 27.4; } // geen water gevonden: plek van de luchtfoto
  pu0 -= 0.2; pu1 += 0.2; pv0 -= 0.2; pv1 += 0.2;
  patch(pu0, pu1, pv0, pv1, mats.water, 0.09, 1);
  const rim = 0.35;
  block(pu0 - rim, pu1 + rim, pv0 - rim, pv0, 0.14, mats.steen);
  block(pu0 - rim, pu1 + rim, pv1, pv1 + rim, 0.14, mats.steen);
  block(pu0 - rim, pu0, pv0, pv1, 0.14, mats.steen);
  block(pu1, pu1 + rim, pv0, pv1, 0.14, mats.steen);
  solid(pu0 - rim, pu1 + rim, pv0 - rim, pv1 + rim);
  for (let k = 0; k < 4; k++) { const geo = new THREE.CircleGeometry(0.22 + rand() * 0.1, 10).rotateX(-Math.PI / 2); add(geo, mats.haag, place(pu0 + 0.4 + rand() * (pu1 - pu0 - 0.8), pv0 + 0.4 + rand() * (pv1 - pv0 - 0.8), 0.06)); }
  // ronde tafel met vier stoelen op het terras bij het huis
  const table = (u, v) => {
    add(new THREE.CylinderGeometry(0.55, 0.55, 0.04, 20).translate(0, 0.74, 0), mats.wit, place(u, v, 0.05));
    add(new THREE.CylinderGeometry(0.04, 0.05, 0.72, 8).translate(0, 0.37, 0), mats.metaal, place(u, v, 0.05));
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4, cu = u + Math.cos(a) * 0.85, cv = v + Math.sin(a) * 0.85;
      add(boxGeo(0.45, 0.05, 0.45).translate(0, 0.45, 0), mats.metaal, place(cu, cv, 0.05, -a));
      add(boxGeo(0.45, 0.45, 0.05).translate(0, 0.7, 0.22), mats.metaal, place(cu, cv, 0.05, -a + Math.PI / 2));
    }
    solid(u - 0.6, u + 0.6, v - 0.6, v + 0.6);
  };
  table(3.9, 26.8);
  // witte ligstoel naast de vijver
  add(boxGeo(0.7, 0.3, 1.9).translate(0, 0.25, 0), mats.wit, place(12.4, 24.6, 0.02));
  add(boxGeo(0.7, 0.06, 0.7).translate(0, 0.62, 0).rotateX(-0.9), mats.wit, place(12.4, 25.6, 0.02));
  // zweefparasol met loungebankje op het terras achterin
  add(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 8).translate(0, 1.3, 0), mats.metaal, place(13.1, 35.9, 0.05));
  add(boxGeo(0.5, 0.15, 0.5).translate(0, 0.08, 0), mats.beton, place(13.1, 35.9, 0.05));
  seg([13.1, 35.9, 2.6], [11.0, 33.6, 2.72], 0.03, mats.metaal); // arm van de zweefparasol
  add(new THREE.ConeGeometry(1.9, 0.5, 4, 1, true).rotateY(Math.PI / 4).translate(0, 2.45, 0), mats.doek, place(11.0, 33.6, 0.05));
  add(boxGeo(1.8, 0.4, 0.75).translate(0, 0.2, 0), mats.wit, place(10.6, 34.6, 0.05));
  add(boxGeo(1.8, 0.45, 0.15).translate(0, 0.5, -0.32), mats.wit, place(10.6, 34.6, 0.05));
  add(boxGeo(0.7, 0.35, 0.7).translate(0, 0.18, 0), mats.hout, place(10.6, 33.2, 0.05));
  solid(9.7, 11.5, 34.2, 35.0); solid(13.0, 13.2, 35.8, 36.0);
  // moestuinbakken tegen de achtermuur
  for (const [u0, u1] of [[9.0, 11.3], [11.6, 13.9]]) {
    block(u0, u1, 37.2, 39.3, 0.4, mats.hout, { tile: 0.8 });
    patch(u0 + 0.06, u1 - 0.06, 37.26, 39.24, mats.aarde, 0.41, 1.5);
    for (let a = u0 + 0.35; a < u1 - 0.2; a += 0.45) for (let b = 37.6; b < 39.1; b += 0.5) blob(a, b, 0.48, 0.16 + rand() * 0.06, rand() < 0.5 ? 0x6fa04a : 0x4f8a3a, 1);
    solid(u0, u1, 37.2, 39.3);
  }
  // borders: struiken langs de oostmuur en voor de westhaag, met een paar bloeiers
  for (let k = 0; k < 6; k++) blob(13.5, 21.2 + k * 1.1, 0.45, 0.5 + rand() * 0.25, [0x4a6e3a, 0x9b6b8a, 0x56783e][k % 3], 3);
  for (let k = 0; k < 8; k++) blob(1.6 + (rand() - 0.5) * 0.6, 29.8 + k * 1.2, 0.55, 0.6 + rand() * 0.3, [0x2f4a2a, 0x3a5a30, 0x2c4426][k % 3], 3);
  for (let k = 0; k < 10; k++) { const geo = new THREE.IcosahedronGeometry(0.07, 0); add(geo, mats.wit, place(13.3 + rand() * 0.6, 21 + rand() * 6, 0.7 + rand() * 0.3)); }
  // bakstenen muur langs de wei (oostkant) en de achtergrens, met een rollaag erop (BGT: muur, en de schaduw op de luchtfoto)
  block(14.0, 14.3, 10.0, 39.8, 1.9, mats.muur, { tile: 1.05 });
  block(13.95, 14.35, 10.0, 39.8, 0.08, mats.beton, { y: 1.9 });
  block(-0.4, 14.3, 39.5, 39.8, 1.9, mats.muur, { tile: 1.05 });
  block(-0.4, 14.35, 39.45, 39.85, 0.08, mats.beton, { y: 1.9 });
  solid(14.0, 14.3, 10.0, 39.8); solid(-0.4, 14.3, 39.5, 39.8);
  // donkere haag langs de westgrens van de achtertuin
  block(0.1, 0.9, 22.6, 39.5, 1.9, mats.haag, { tile: 1, jitter: 0.8, segs: 2 });
  solid(0.1, 0.9, 22.6, 39.5);

  // alles samenvoegen: per materiaal één model
  const group = new THREE.Group();
  for (const { mat, geos } of batches.values()) {
    const merged = mergeGeometries(geos);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = mat !== mats.gras && mat !== mats.tegel && mat !== mats.klinker && mat !== mats.aarde && mat !== mats.water;
    mesh.receiveShadow = true;
    if ([mats.gras, mats.tegel, mats.klinker, mats.aarde, mats.water].includes(mat)) { mat.polygonOffset = true; mat.polygonOffsetFactor = -1; mat.polygonOffsetUnits = -2; }
    group.add(mesh);
  }
  g.scene.add(group);
  for (const ring of obstacles) w.addObstacle(ring);
  return group;
}
