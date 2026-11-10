// Onderdelen voor gevels met echte diepte: markiezen, borden met lampjes, etalages met kozijn en vensterbank,
// paneeldeuren met een stoepje, terrasmeubels en parasols. Elk onderdeel bestaat uit veel kleine stukjes;
// die worden per soort materiaal samengevoegd tot één mesh, zodat het de videokaart weinig extra werk kost.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const cache = {};
// Gedeelde materialen: de kleur zit per stukje in de geometrie (vertexkleur), dus alles van één soort is één mesh.
export function trimMat(kind) {
  if (!cache[kind]) {
    cache[kind] = kind === 'metaal' ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.36, metalness: 0.8 })
      : kind === 'stof' ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide })
      : kind === 'glas' ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.06, metalness: 0.1 })
      : kind === 'steen' ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })
      : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62 });
  }
  return cache[kind];
}

const _m = new THREE.Matrix4(), _e = new THREE.Euler(), _c = new THREE.Color();

// Verzamelt stukjes geometrie (elk met een eigen kleur en soort materiaal) en bouwt er aan het eind één mesh per soort van.
export class Parts {
  constructor() { this.lists = {}; }
  add(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, kind = 'mat') {
    const g = geo.index ? geo.toNonIndexed() : geo;
    _m.makeRotationFromEuler(_e.set(rx, ry, rz)); _m.setPosition(x, y, z);
    g.applyMatrix4(_m);
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    _c.set(color);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    (this.lists[kind] ||= []).push(g);
    return this;
  }
  box(w, h, d, color, x, y, z, kind = 'mat', rx = 0, ry = 0, rz = 0) { return this.add(new THREE.BoxGeometry(w, h, d), color, x, y, z, rx, ry, rz, kind); }
  cyl(r1, r2, h, seg, color, x, y, z, kind = 'mat', rx = 0, ry = 0, rz = 0) { return this.add(new THREE.CylinderGeometry(r1, r2, h, seg), color, x, y, z, rx, ry, rz, kind); }
  // balk tussen twee punten (voor armen, baleinen en beugels)
  beam(t, color, ax, ay, az, bx, by, bz, kind = 'metaal') {
    const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz);
    const g = new THREE.BoxGeometry(t, t, len);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(dx / len, dy / len, dz / len));
    g.applyQuaternion(q);
    return this.add(g, color, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, 0, 0, 0, kind);
  }
  // één mesh per soort materiaal; geeft de gemaakte meshes terug
  build(parent, { shadow = true } = {}) {
    const out = [];
    for (const [kind, list] of Object.entries(this.lists)) {
      const m = new THREE.Mesh(mergeGeometries(list), trimMat(kind));
      m.castShadow = shadow; m.receiveShadow = true;
      parent.add(m);
      out.push(m);
    }
    this.lists = {};
    return out;
  }
}

// ------------------------------------------------------------ markies

const stripeTex = {};
// Gestreept doek: banen in de kleuren van de zaak, met een naad tussen de banen en een fijn weefpatroon.
function stripeTexture(colors, stripes) {
  const key = colors.join() + stripes;
  if (stripeTex[key]) return stripeTex[key];
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const ctx = c.getContext('2d');
  const sw = 512 / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(i * sw, 0, sw + 1, 128);
    // elke baan is in het midden iets lichter (het doek bolt een beetje) en heeft een donkere naad
    const g = ctx.createLinearGradient(i * sw, 0, (i + 1) * sw, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.16)'); g.addColorStop(0.18, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.07)');
    g.addColorStop(0.82, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.16)');
    ctx.fillStyle = g; ctx.fillRect(i * sw, 0, sw + 1, 128);
  }
  // weefsel: fijne lijntjes in twee richtingen
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = '#000';
  for (let y = 0; y < 128; y += 2) ctx.fillRect(0, y, 512, 1);
  for (let x = 0; x < 512; x += 3) ctx.fillRect(x, 0, 1, 128);
  ctx.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return (stripeTex[key] = t);
}

// Rooster van punten (nu punten breed, nv punten diep) als geometrie met gedeelde hoekpunten, zodat het licht vloeiend valt.
function gridGeo(nu, nv, fn) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const u = i / nu, v = j / nv, p = fn(u, v);
    pos.push(p[0], p[1], p[2]); uv.push(p[3] ?? u, p[4] ?? v);
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Uitvalscherm boven een winkelpui: doek dat licht doorhangt, een volant met schulprand die een beetje golft,
// een cassette tegen de muur, een voorlijst en twee knikarmen. stall = dak van een marktkraam (alleen doek en volant).
export function buildAwning(parent, { w = 4, depth = 1.4, y = 2.7, colors = ['#c62828', '#ffffff'], stripes = 10, stall = false } = {}) {
  const slope = 0.38;
  const zBack = depth * 0.46 - Math.cos(slope) * depth * 0.5, yBack = y + Math.sin(slope) * depth * 0.5;
  const zFront = depth * 0.46 + Math.cos(slope) * depth * 0.5, yFront = y - Math.sin(slope) * depth * 0.5;
  const mat = new THREE.MeshStandardMaterial({ map: stripeTexture(colors, stripes), side: THREE.DoubleSide, roughness: 0.93 });
  const doek = gridGeo(stripes * 2, 8, (u, v) => {
    const sag = Math.sin(Math.PI * v) * 0.04 * depth; // het doek hangt in het midden iets door
    const bol = Math.sin(Math.PI * v) * 0.012 * Math.cos(u * stripes * Math.PI * 2); // en trekt per baan een beetje
    return [(u - 0.5) * w, yBack + (yFront - yBack) * v - sag + bol, zBack + (zFront - zBack) * v];
  });
  const volant = gridGeo(stripes * 8, 3, (u, v) => {
    const lob = 0.15 + 0.085 * Math.sin(Math.PI * ((u * stripes) % 1)); // schulprand: één boogje per baan
    const golf = Math.sin(u * stripes * Math.PI * 0.9 + 1.3) * 0.022 * v; // de onderrand golft een beetje naar voren en achteren
    return [(u - 0.5) * w, yFront - 0.012 - lob * v, zFront + 0.006 + golf, u, 0.15 + v * 0.7];
  });
  const m = new THREE.Mesh(mergeGeometries([doek, volant]), mat);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  if (stall) return [m];
  const p = new Parts(), alu = 0xd6d6d2, grijs = 0x8f9499;
  p.box(w + 0.08, 0.13, 0.15, alu, 0, yBack + 0.035, zBack + 0.05, 'metaal'); // cassette tegen de muur
  p.box(0.03, 0.15, 0.17, grijs, -w / 2 - 0.05, yBack + 0.035, zBack + 0.05, 'metaal').box(0.03, 0.15, 0.17, grijs, w / 2 + 0.05, yBack + 0.035, zBack + 0.05, 'metaal');
  p.box(w + 0.03, 0.06, 0.05, alu, 0, yFront - 0.01, zFront, 'metaal'); // voorlijst
  for (const s of [-1, 1]) {
    // knikarm: van de muur schuin naar binnen tot de elleboog, en dan naar de voorlijst
    const x0 = s * (w / 2 - 0.12), x1 = s * (w / 2 - 0.12 - Math.min(0.5, w * 0.16));
    const ey = (yBack + yFront) / 2 - 0.11, ez = (zBack + zFront) / 2 + 0.03;
    p.beam(0.04, grijs, x0, yBack - 0.07, zBack + 0.08, x1, ey, ez);
    p.beam(0.04, grijs, x1, ey, ez, x0, yFront - 0.035, zFront - 0.02);
    p.box(0.07, 0.07, 0.07, grijs, x0, yBack - 0.07, zBack + 0.06, 'metaal');
  }
  return [m, ...p.build(parent)];
}

// ------------------------------------------------------------ bord, etalage, deur

// Lijst en achterplaat van een gevelbord, met zwanenhalslampjes erboven. Geeft de plekken van de lampjes terug.
export function signFrame(p, { w, h, x = 0, y, z, lamps = true }) {
  const donker = 0x18191b, lijst = 0x2a2c30;
  p.box(w + 0.12, h + 0.12, 0.09, donker, x, y, z);
  const t = 0.05, zf = z + 0.05;
  p.box(w + 0.16, t, 0.07, lijst, x, y + h / 2 + 0.04, zf).box(w + 0.16, t, 0.07, lijst, x, y - h / 2 - 0.04, zf);
  p.box(t, h + 0.08, 0.07, lijst, x - w / 2 - 0.055, y, zf).box(t, h + 0.08, 0.07, lijst, x + w / 2 + 0.055, y, zf);
  const spots = [];
  if (lamps && w >= 2.4 && h >= 0.55) {
    const n = Math.max(2, Math.round(w / 1.9));
    for (let i = 0; i < n; i++) {
      const lx = x + (i + 0.5 - n / 2) * (w / n), ly = y + h / 2 + 0.3;
      p.box(0.07, 0.07, 0.03, 0x111214, lx, ly, z + 0.05, 'metaal'); // muurplaatje
      p.beam(0.022, 0x111214, lx, ly, z + 0.05, lx, ly + 0.03, z + 0.36);
      p.beam(0.022, 0x111214, lx, ly + 0.03, z + 0.36, lx, ly - 0.1, z + 0.4);
      p.add(new THREE.ConeGeometry(0.085, 0.11, 10, 1, true), 0x1a1b1d, lx, ly - 0.14, z + 0.4, 0.5, 0, 0, 'metaal');
      spots.push([lx, ly - 0.185, z + 0.385]);
    }
  }
  return spots;
}

// Kozijn rond een etalageruit: omlijsting met diepte, roeden, een natuurstenen vensterbank en een plint eronder.
export function windowFrame(p, { w, h, x = 0, y }) {
  const kozijn = 0x25272a, steen = 0xb7b0a2, plint = 0x45433f;
  p.box(w + 0.16, h + 0.16, 0.06, 0x1c1d1f, x, y + h / 2, 0.02);
  p.box(w + 0.24, 0.1, 0.15, kozijn, x, y + h + 0.05, 0.075).box(w + 0.24, 0.08, 0.15, kozijn, x, y - 0.04, 0.075);
  p.box(0.1, h + 0.02, 0.15, kozijn, x - w / 2 - 0.07, y + h / 2, 0.075).box(0.1, h + 0.02, 0.15, kozijn, x + w / 2 + 0.07, y + h / 2, 0.075);
  const n = Math.floor(w / 1.5);
  for (let i = 1; i <= n; i++) p.box(0.045, h, 0.05, kozijn, x - w / 2 + (i * w) / (n + 1), y + h / 2, 0.09);
  if (h >= 1.5) p.box(w, 0.045, 0.05, kozijn, x, y + h * 0.8, 0.09); // bovenlicht
  p.box(w + 0.36, 0.06, 0.24, steen, x, y - 0.11, 0.12, 'steen'); // vensterbank
  if (y >= 0.4) p.box(w + 0.24, y - 0.14, 0.08, plint, x, (y - 0.14) / 2, 0.04, 'steen');
}

// Paneeldeur in een kozijn, met een ruit, een schopplaat, een klink en een hardstenen stoepje.
export function doorParts(p, { x = 0, color = 0x3b2a1e }) {
  const c = new THREE.Color(color), lum = c.r * 0.3 + c.g * 0.55 + c.b * 0.15;
  const kozijn = lum < 0.25 ? 0xe4dfd2 : 0x2a2b2d;
  const licht = c.clone().lerp(new THREE.Color(0xffffff), 0.14), donker = c.clone().multiplyScalar(0.72);
  p.box(1.0, 2.2, 0.05, c, x, 1.1, 0.03);
  p.box(0.1, 2.3, 0.16, kozijn, x - 0.55, 1.15, 0.08).box(0.1, 2.3, 0.16, kozijn, x + 0.55, 1.15, 0.08).box(1.2, 0.1, 0.16, kozijn, x, 2.25, 0.08);
  // onderpaneel: een verdiept vlak met een opgelegde lijst
  p.box(0.76, 0.66, 0.012, donker, x, 0.56, 0.058).box(0.64, 0.54, 0.014, licht, x, 0.56, 0.066);
  // ruit met een lijst eromheen
  p.box(0.76, 1.0, 0.014, donker, x, 1.56, 0.058);
  p.box(0.66, 0.9, 0.012, 0x1b232b, x, 1.56, 0.066, 'glas');
  p.box(0.02, 0.9, 0.016, licht, x, 1.56, 0.072);
  p.box(0.9, 0.13, 0.01, 0xb9a16a, x, 0.1, 0.06, 'metaal'); // schopplaat
  p.box(0.05, 0.17, 0.016, 0xc9a646, x + 0.4, 1.05, 0.062, 'metaal').box(0.13, 0.024, 0.024, 0xc9a646, x + 0.35, 1.07, 0.09, 'metaal'); // klink
  p.box(1.36, 0.07, 0.36, 0x8d887e, x, 0.035, 0.18, 'steen'); // stoepje
}

// ------------------------------------------------------------ terras

// Parasol: doek in banen dat tussen de baleinen iets doorhangt, een volant, een ventilatiekapje, baleinen en een stok.
// De top zit op hoogte `top`, de rand op `top - drop`.
export function parasolParts(p, { r = 1.5, top = 2.7, drop = 0.5, color = 0xf3ead7, pole = 0xb08a5a, n = 8, base = false, x = 0, z = 0 } = {}) {
  const c = new THREE.Color(color), c2 = c.clone().multiplyScalar(0.9);
  const prof = (t) => top - drop * Math.pow(t, 1.2); // hoogte op afstand t (0 = top, 1 = rand)
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
    const pt = (s, t, extra = 0) => {
      const a = a0 + (a1 - a0) * s, hang = Math.sin(Math.PI * s);
      // tussen twee baleinen ligt de rand op een rechte lijn (achthoek) en hangt het doek iets door
      const rr = r * t * (Math.cos((a1 - a0) / 2) / Math.cos((a1 - a0) * (s - 0.5))) ;
      return [x + Math.sin(a) * rr, prof(t) - hang * 0.05 * t - extra, z + Math.cos(a) * rr];
    };
    p.add(gridGeo(4, 5, (s, t) => pt(s, 0.04 + t * 0.96)), k % 2 ? c2 : c, 0, 0, 0, 0, 0, 0, 'stof');
    p.add(gridGeo(4, 1, (s, t) => { const q = pt(s, 1 + t * 0.012, t * 0.15); return q; }), k % 2 ? c : c2, 0, 0, 0, 0, 0, 0, 'stof'); // volant
    // balein onder het doek
    p.beam(0.018, 0x6b6156, x + Math.sin(a0) * 0.07, top - 0.07, z + Math.cos(a0) * 0.07, x + Math.sin(a0) * r, prof(1) - 0.012, z + Math.cos(a0) * r);
    // schoor van de schuif naar halverwege de balein
    p.beam(0.014, 0x6b6156, x + Math.sin(a0) * 0.05, top - drop - 0.28, z + Math.cos(a0) * 0.05, x + Math.sin(a0) * r * 0.52, prof(0.52) - 0.015, z + Math.cos(a0) * r * 0.52);
  }
  // ventilatiekapje bovenop en een knop
  p.add(new THREE.ConeGeometry(r * 0.2, drop * 0.22, n, 1, true), c, x, top + drop * 0.11 - 0.005, z, 0, Math.PI / n, 0, 'stof');
  p.add(new THREE.SphereGeometry(0.035, 8, 6), pole, x, top + drop * 0.22 + 0.02, z);
  p.cyl(0.024, 0.027, top + 0.02, 8, pole, x, (top + 0.02) / 2, z); // stok
  p.cyl(0.045, 0.045, 0.07, 8, 0x6b6156, x, top - drop - 0.28, z, 'metaal'); // schuif
  if (base) p.cyl(0.26, 0.3, 0.09, 12, 0x55524d, x, 0.045, z, 'steen').cyl(0.04, 0.04, 0.3, 8, 0x3a3a3a, x, 0.2, z, 'metaal');
}

// Terrastafel met vier bistrostoelen en twee glazen bier.
export function terraceSetParts(p, { wood = 0x6d4c33, metal = 0x2a2b2d } = {}) {
  p.cyl(0.4, 0.4, 0.035, 20, wood, 0, 0.745, 0).cyl(0.412, 0.412, 0.018, 20, metal, 0, 0.728, 0, 'metaal'); // blad met een metalen rand
  p.cyl(0.035, 0.045, 0.7, 8, metal, 0, 0.365, 0, 'metaal').cyl(0.24, 0.27, 0.03, 14, metal, 0, 0.015, 0, 'metaal'); // poot en voet
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4, cx = Math.sin(a) * 0.75, cz = Math.cos(a) * 0.75, ry = a + Math.PI;
    const cs = Math.cos(ry), sn = Math.sin(ry);
    const at = (lx, lz) => [cx + lx * cs + lz * sn, cz - lx * sn + lz * cs]; // stoelcoördinaten naar de tafel
    const part = (w, h, d, col, lx, ly, lz, kind = 'metaal') => { const [wx, wz] = at(lx, lz); p.box(w, h, d, col, wx, ly, wz, kind, 0, ry, 0); };
    part(0.42, 0.03, 0.42, wood, 0, 0.455, 0, 'mat'); // zitting
    for (const [lx, lz] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) part(0.026, lz < 0 ? 0.92 : 0.45, 0.026, metal, lx, lz < 0 ? 0.46 : 0.225, lz);
    for (const ly of [0.62, 0.75, 0.88]) part(0.38, 0.05, 0.016, wood, 0, ly, -0.19, 'mat'); // latten van de rugleuning
    part(0.36, 0.02, 0.02, metal, 0, 0.2, 0.19); part(0.36, 0.02, 0.02, metal, 0, 0.2, -0.19); // dwarsstangen
  }
  for (const [gx, gz] of [[0.14, 0.1], [-0.12, -0.13]]) {
    p.cyl(0.032, 0.026, 0.11, 10, 0xd99a2b, gx, 0.818, gz, 'glas').cyl(0.033, 0.033, 0.022, 10, 0xfff8e6, gx, 0.884, gz);
  }
}

// Vlag die een beetje wappert (in plaats van een strak plat vlak).
export function flagGeometry(w, h) {
  return gridGeo(10, 4, (u, v) => [u * w - w / 2, (v - 0.5) * h - u * u * 0.06, Math.sin(u * 7.5 + v * 0.8) * 0.07 * u]);
}
