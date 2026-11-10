// Poppetjes voor de speler en de dorpsbewoners.
// Elk poppetje is één vloeiend 3D-lichaam met een echt skelet (heupen, knieën, ellebogen, nek),
// in code opgebouwd: geen losse modelbestanden nodig. Kleding, haar, hoedjes en gezicht zitten
// in hetzelfde model (één tekenopdracht per poppetje). Lopen, rennen en zitten komen van echte
// motion capture (src/mocap.js); de andere houdingen worden per frame berekend. Een wissel van
// houding vloeit zacht over.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CLIPS, addClip, gait } from './mocap.js';

// Kwaliteitsstand uit src/quality.js: op telefoons (Q.laag) een eenvoudiger model met minder vlakjes.
// Via glob, zodat dit bestand ook werkt als quality.js er niet is (losse testpagina, oudere versie).
const qualityModule = Object.values(import.meta.glob('./quality.js', { eager: true }))[0];
const LAAG = globalThis.__POPPETJES_LAAG ?? !!qualityModule?.Q?.laag;

const sharedMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0 });

// botten: index, ouder, positie t.o.v. ouder (in rusthouding hangen de armen recht naar beneden)
const B = { hips: 0, spine: 1, chest: 2, neck: 3, head: 4, uaL: 5, faL: 6, hL: 7, uaR: 8, faR: 9, hR: 10, thL: 11, shL: 12, ftL: 13, thR: 14, shR: 15, ftR: 16 };
const BONES = [
  ['hips', -1, [0, 0.97, 0]], ['spine', 0, [0, 0.13, 0]], ['chest', 1, [0, 0.2, 0]], ['neck', 2, [0, 0.22, 0]], ['head', 3, [0, 0.1, 0]],
  ['uaL', 2, [-0.2, 0.14, 0]], ['faL', 5, [0, -0.29, 0]], ['hL', 6, [0, -0.26, 0]],
  ['uaR', 2, [0.2, 0.14, 0]], ['faR', 8, [0, -0.29, 0]], ['hR', 9, [0, -0.26, 0]],
  ['thL', 0, [-0.1, -0.03, 0]], ['shL', 11, [0, -0.43, 0]], ['ftL', 12, [0, -0.43, 0]],
  ['thR', 0, [0.1, -0.03, 0]], ['shR', 14, [0, -0.43, 0]], ['ftR', 15, [0, -0.43, 0]],
];

// elke houding een nummer (voor het herkennen van een wissel)
const MODES = { walk: 0, idle: 0, wave: 1, bike: 2, skate: 3, sit: 4, camera: 5, eat: 6, drink: 7, push: 8 };

const col = (hex) => new THREE.Color(hex);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const spow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);

// Verzamelt geometrie met huidgewichten en kleuren.
class Builder {
  constructor() { this.pos = []; this.nrm = []; this.colr = []; this.si = []; this.sw = []; this.idx = []; }
  vert(x, y, z, nx, ny, nz, c, w) {
    const ws = w.slice(0, 4).sort((a, b) => b[1] - a[1]);
    const tot = ws.reduce((s, q) => s + q[1], 0) || 1;
    this.pos.push(x, y, z); this.nrm.push(nx, ny, nz); this.colr.push(c.r, c.g, c.b);
    for (let k = 0; k < 4; k++) { this.si.push(ws[k] ? ws[k][0] : 0); this.sw.push(ws[k] ? ws[k][1] / tot : 0); }
    return this.pos.length / 3 - 1;
  }
  // Een buis van ringen (romp, benen, armen, nek, hoofd, haar: in rusthouding staat alles verticaal).
  // ring: { y, x, z, rx, rz of rzf/rzb, sq, off, w, c }
  //   rx = halve breedte, rzf/rzb = diepte naar voren/achteren vanaf (x, z); sq = hoekigheid van de doorsnede
  //   (2 = ellips, hoger = meer een afgeronde rechthoek); off(s, c) = extra dikte per richting (haar, baard);
  //   w = huidgewichten [[bot, gewicht]] of (s, c) => [...]; c = kleur. Een nieuwe kleur geeft een scherpe rand.
  // o: { m: Matrix4 (de buis ergens anders neerleggen, bijv. een schoen), cap0/cap1: begin/eind dichtmaken }
  tube(rings, n = 14, o = {}) {
    const R = rings.length, down = rings[R - 1].y < rings[0].y;
    const P = [], Nm = [];
    for (let i = 0; i < R; i++) {
      const r = rings[i], row = [];
      const e = 2 / (r.sq || 2);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2, s = Math.sin(a), c = Math.cos(a);
        const off = r.off ? r.off(s, c) : 0;
        const rz = c >= 0 ? (r.rzf ?? r.rz) : (r.rzb ?? r.rz);
        row.push([(r.x || 0) + spow(s, e) * Math.max(0.0004, r.rx + off), r.y, (r.z || 0) + spow(c, e) * Math.max(0.0004, rz + off)]);
      }
      P.push(row);
    }
    // normalen uit de buren (langs de ring en langs de buis)
    for (let i = 0; i < R; i++) {
      const row = [];
      for (let k = 0; k < n; k++) {
        const a = P[i][(k + 1) % n], bb = P[i][(k + n - 1) % n];
        let iu = Math.min(R - 1, i + 1), id = Math.max(0, i - 1);
        // ringen op dezelfde plek (een zoom) overslaan
        while (iu < R - 1 && Math.abs(P[iu][k][1] - P[id][k][1]) < 1e-5 && Math.hypot(P[iu][k][0] - P[id][k][0], P[iu][k][2] - P[id][k][2]) < 1e-5) iu++;
        const u = P[iu][k], d = P[id][k];
        const tu = [a[0] - bb[0], a[1] - bb[1], a[2] - bb[2]], tv = [u[0] - d[0], u[1] - d[1], u[2] - d[2]];
        let nx = tu[1] * tv[2] - tu[2] * tv[1], ny = tu[2] * tv[0] - tu[0] * tv[2], nz = tu[0] * tv[1] - tu[1] * tv[0];
        if (down) { nx = -nx; ny = -ny; nz = -nz; }
        const l = Math.hypot(nx, ny, nz);
        if (l < 1e-10) row.push([0, (i === 0) === down ? 1 : -1, 0]); else row.push([nx / l, ny / l, nz / l]);
      }
      Nm.push(row);
    }
    const v3 = new THREE.Vector3(), nmat = o.m ? new THREE.Matrix3().getNormalMatrix(o.m) : null;
    const put = (p, nn, c, w) => {
      if (!o.m) return this.vert(p[0], p[1], p[2], nn[0], nn[1], nn[2], c, w);
      v3.set(p[0], p[1], p[2]).applyMatrix4(o.m);
      const x = v3.x, y = v3.y, z = v3.z;
      v3.set(nn[0], nn[1], nn[2]).applyMatrix3(nmat).normalize();
      return this.vert(x, y, z, v3.x, v3.y, v3.z, c, w);
    };
    // rijen uitschrijven; bij een kleurwissel de volgende ring nog een keer in de oude kleur
    const start = this.pos.length / 3, rows = [];
    const emit = (i, c, dup) => {
      const r = rings[i];
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        put(P[i][k], Nm[i][k], c, typeof r.w === 'function' ? r.w(Math.sin(a), Math.cos(a)) : r.w);
      }
      rows.push(dup);
    };
    for (let i = 0; i < R; i++) {
      emit(i, rings[i].c, false);
      if (i + 1 < R && rings[i + 1].c !== rings[i].c) emit(i + 1, rings[i].c, true);
    }
    for (let ri = 0; ri < rows.length - 1; ri++) {
      if (rows[ri]) continue; // geen vlakken tussen een kopie en de ring op dezelfde plek
      const a0 = start + ri * n, b0 = start + (ri + 1) * n;
      for (let k = 0; k < n; k++) {
        const k1 = (k + 1) % n;
        if (down) this.idx.push(a0 + k, b0 + k, a0 + k1, a0 + k1, b0 + k, b0 + k1);
        else this.idx.push(a0 + k, a0 + k1, b0 + k, a0 + k1, b0 + k1, b0 + k);
      }
    }
    const cap = (i, rowStart, top) => {
      const r = rings[i];
      let cx = 0, cz = 0;
      for (let k = 0; k < n; k++) { cx += P[i][k][0] / n; cz += P[i][k][2] / n; }
      const ci = put([cx, r.y, cz], [0, top ? 1 : -1, 0], r.c, typeof r.w === 'function' ? r.w(0, 0) : r.w);
      for (let k = 0; k < n; k++) {
        const k1 = (k + 1) % n;
        if (top) this.idx.push(ci, rowStart + k, rowStart + k1); else this.idx.push(ci, rowStart + k1, rowStart + k);
      }
    };
    if (o.cap0) cap(0, start, down);
    if (o.cap1) cap(R - 1, start + (rows.length - 1) * n, !down);
  }
  // Een dunne buis langs een lijn van punten (vingers, duim), met een dicht topje.
  // rad: per punt de straal, of [dikte, breedte] voor een platte doorsnede.
  sweep(pts, rad, n, w, c) {
    const start = this.pos.length / 3;
    const t = new THREE.Vector3(), u = new THREE.Vector3(), v = new THREE.Vector3(), p = new THREE.Vector3(), nn = new THREE.Vector3();
    const L = pts.length;
    for (let i = 0; i < L; i++) {
      t.subVectors(pts[Math.min(L - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
      u.set(1, 0, 0).addScaledVector(t, -t.x).normalize();
      v.crossVectors(t, u);
      const ru = Array.isArray(rad[i]) ? rad[i][0] : rad[i], rv = Array.isArray(rad[i]) ? rad[i][1] : rad[i];
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        p.copy(pts[i]).addScaledVector(u, ca * ru).addScaledVector(v, sa * rv);
        nn.set(0, 0, 0).addScaledVector(u, ca / ru).addScaledVector(v, sa / rv).normalize();
        this.vert(p.x, p.y, p.z, nn.x, nn.y, nn.z, c, w);
      }
    }
    for (let i = 0; i < L - 1; i++) for (let k = 0; k < n; k++) {
      const a = start + i * n + k, a1 = start + i * n + (k + 1) % n, b = a + n, b1 = a1 + n;
      this.idx.push(a, a1, b, a1, b1, b);
    }
    // topje
    const rl = Array.isArray(rad[L - 1]) ? rad[L - 1][0] : rad[L - 1];
    t.subVectors(pts[L - 1], pts[L - 2]).normalize();
    p.copy(pts[L - 1]).addScaledVector(t, rl * 0.7);
    const tip = this.vert(p.x, p.y, p.z, t.x, t.y, t.z, c, w);
    for (let k = 0; k < n; k++) this.idx.push(start + (L - 1) * n + k, start + (L - 1) * n + (k + 1) % n, tip);
  }
  // Starre vorm aan één bot (ogen, oren, hoedjes).
  rigid(geo, bone, color, w = null) {
    const p = geo.attributes.position, nm = geo.attributes.normal;
    const base = this.pos.length / 3;
    const c = color.isColor ? color : col(color);
    for (let i = 0; i < p.count; i++) this.vert(p.getX(i), p.getY(i), p.getZ(i), nm.getX(i), nm.getY(i), nm.getZ(i), c, w || [[bone, 1]]);
    if (geo.index) for (let i = 0; i < geo.index.count; i++) this.idx.push(base + geo.index.getX(i));
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colr, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.idx);
    return g;
  }
}

// kleine helpers voor starre vormen
const T = (geo, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  geo.applyMatrix4(m);
  return geo;
};
const sphere = (r, ws = 12, hs = 8, ...rest) => new THREE.SphereGeometry(r, ws, hs, ...rest);

function lerpW(a, b, t) { return t <= 0 ? [[a, 1]] : t >= 1 ? [[b, 1]] : [[a, 1 - t], [b, t]]; }

// waarde uit een tabel van rijen [y, ...getallen] (aflopend in y), lineair ertussen
function rowAt(table, y) {
  if (y >= table[0][0]) return table[0];
  for (let i = 0; i < table.length - 1; i++) {
    const a = table[i], c = table[i + 1];
    if (y <= a[0] && y >= c[0]) { const t = (a[0] - y) / ((a[0] - c[0]) || 1); return a.map((v, k) => (typeof v === 'number' ? v + (c[k] - v) * t : v)); }
  }
  return table[table.length - 1];
}

// --- maten van het lichaam (meters, rusthouding) ---
// romp: [y, halve breedte, diepte voor, diepte achter, midden z]
const TORSO = [
  [1.538, 0.058, 0.054, 0.060, -0.008],
  [1.518, 0.108, 0.066, 0.078, -0.008],
  [1.496, 0.156, 0.080, 0.094, -0.006],
  [1.470, 0.196, 0.096, 0.104, -0.004],
  [1.420, 0.188, 0.118, 0.114, -0.002],
  [1.360, 0.180, 0.126, 0.110, 0],
  [1.280, 0.166, 0.120, 0.100, 0.002],
  [1.200, 0.152, 0.110, 0.090, 0.004],
  [1.120, 0.146, 0.106, 0.088, 0.004],
  [1.050, 0.153, 0.108, 0.098, 0.002],
  [0.985, 0.166, 0.107, 0.116, 0],
  [0.925, 0.170, 0.104, 0.128, 0],
  [0.860, 0.152, 0.098, 0.122, 0],
  [0.820, 0.085, 0.080, 0.092, 0],
  [0.795, 0.025, 0.030, 0.035, 0],
];
// been: [y, halve breedte, diepte voor, diepte achter, aandeel bovenbeen, aandeel onderbeen] (rest = heup)
const LEG = [
  [1.0, 0.030, 0.035, 0.035, 0, 0],
  [0.97, 0.062, 0.080, 0.090, 0, 0],
  [0.90, 0.080, 0.092, 0.103, 0.5, 0],
  [0.82, 0.088, 0.093, 0.096, 0.88, 0],
  [0.74, 0.082, 0.088, 0.086, 1, 0],
  [0.64, 0.072, 0.080, 0.074, 1, 0],
  [0.57, 0.063, 0.071, 0.063, 0.8, 0.2],
  [0.53, 0.059, 0.067, 0.058, 0.6, 0.4],
  [0.50, 0.057, 0.065, 0.056, 0.4, 0.6],
  [0.46, 0.055, 0.057, 0.060, 0.15, 0.85],
  [0.40, 0.056, 0.051, 0.070, 0, 1],
  [0.33, 0.054, 0.048, 0.072, 0, 1],
  [0.24, 0.046, 0.044, 0.058, 0, 1],
  [0.16, 0.043, 0.043, 0.050, 0, 1],
  [0.105, 0.048, 0.052, 0.055, 0, 1],
];
// arm: [y, halve breedte, halve diepte, aandeel bovenarm, aandeel onderarm, aandeel hand] (rest = borst)
const ARM = [
  [1.474, 0.012, 0.020, 0, 0, 0],
  [1.462, 0.038, 0.050, 0, 0, 0],
  [1.440, 0.054, 0.062, 0.5, 0, 0],
  [1.400, 0.060, 0.065, 0.85, 0, 0],
  [1.330, 0.055, 0.058, 1, 0, 0],
  [1.270, 0.050, 0.054, 1, 0, 0],
  [1.210, 0.046, 0.050, 0.85, 0.15, 0],
  [1.170, 0.044, 0.047, 0.6, 0.4, 0],
  [1.140, 0.043, 0.046, 0.35, 0.65, 0],
  [1.100, 0.044, 0.048, 0.1, 0.9, 0],
  [1.040, 0.042, 0.046, 0, 1, 0],
  [0.970, 0.035, 0.040, 0, 1, 0],
  [0.915, 0.027, 0.033, 0, 0.7, 0.3],
  [0.890, 0.024, 0.031, 0, 0.3, 0.7],
];
// hoofd: [hoogte boven de kin, halve breedte, z voorkant, z achterkant]
const CHIN = 1.617, HY = 1.735, HEAD_SQ = 2.25;
const HEAD = [
  [0.236, 0.006, 0.004, -0.008],
  [0.228, 0.038, 0.038, -0.050],
  [0.212, 0.060, 0.066, -0.080],
  [0.185, 0.074, 0.087, -0.098],
  [0.150, 0.079, 0.095, -0.102],
  [0.118, 0.078, 0.095, -0.096],
  [0.085, 0.076, 0.097, -0.082],
  [0.055, 0.072, 0.098, -0.058],
  [0.030, 0.066, 0.097, -0.03],
  [0.012, 0.054, 0.094, 0.004],
  [0.000, 0.036, 0.087, 0.040],
];
// schoen: [z, halve breedte, hoogte bovenkant] (zool op y = 0, enkel op z = 0)
const SHOE = [
  [-0.088, 0.018, 0.060], [-0.074, 0.039, 0.098], [-0.035, 0.045, 0.116], [0.015, 0.046, 0.114], [0.055, 0.048, 0.088],
  [0.100, 0.052, 0.064], [0.145, 0.047, 0.052], [0.175, 0.032, 0.042], [0.187, 0.013, 0.030],
];

// Bouw van een poppetje, vast afgeleid van zijn uiterlijk: -1 (tenger) tot 1 (stevig).
function buildOf(shirt, pants, hair, skin, female) {
  const h = ((shirt >>> 3) * 31 + (pants >>> 2) * 17 + hair * 7 + (skin >>> 4) * 3 + (female ? 11 : 0)) % 101;
  const u = h / 100 * 2 - 1;
  return u * Math.abs(u) * 0.85; // de meeste mensen zitten rond het midden
}

export function makeCharacter(opts = {}) {
  const {
    shirt = 0xe8a33d, pants = 0x2e3f5c, skin = 0xf0c8a0, hair = 0x4a3020, shoes = 0x222222,
    hat = null, apron = null, chain = false, sash = null, scale = 1, coat = null,
    female = false, sleeves = 'short', beard = false, glasses = false, eyes = 0x4a3222,
    jacket = null, // kort jasje tot op de heupen
  } = opts;
  const hairStyle = opts.hairStyle || (female ? 'long' : 'short');
  const b = new Builder();
  const cShirt = col(shirt), cPants = col(pants), cSkin = col(skin), cHair = col(hair), cShoe = col(shoes), cSole = col(0x1a1512);
  const cSkinD = cSkin.clone().multiplyScalar(0.9);
  const F = female ? 1 : 0;
  // bouw: breedte van romp en ledematen, en een buikje
  const bouw = opts.build ?? buildOf(shirt, pants, hair, skin, female);
  const wide = 1 + 0.045 * bouw, limb = (1 + 0.06 * bouw) * (1 - F * 0.07), belly = Math.max(0, bouw) * 0.04;
  // aantal vlakjes rondom
  const nT = LAAG ? 14 : 20, nL = LAAG ? 8 : 12, nA = LAAG ? 7 : 10, nH = LAAG ? 14 : 20;

  const longSleeve = sleeves === 'long' || coat || jacket;
  const cSleeve = coat ? col(coat) : jacket ? col(jacket) : cShirt;

  // --- romp ---
  const gauss = (x) => Math.exp(-x * x);
  // vorm van de romp op hoogte y (zonder kleding): { rx, rzf, rzb, z }
  const torsoR = (y) => {
    const [, rx0, zf0, zb0, z] = rowAt(TORSO, y);
    let rx = rx0 * wide, rzf = zf0, rzb = zb0;
    if (F) {
      rx += 0.012 * gauss((y - 0.92) / 0.09) - 0.02 * gauss((y - 1.12) / 0.09) - 0.02 * smooth(1.3, 1.45, y) * (1 - smooth(1.5, 1.53, y));
      rzf += 0.034 * gauss((y - 1.335) / 0.05);
      rzb += 0.006 * gauss((y - 0.9) / 0.07);
    }
    const g = gauss((y - 1.1) / 0.13);
    rzf += belly * g; rx += belly * 0.45 * g;
    return { rx, rzf, rzb, z };
  };
  const torsoW = (y) => {
    if (y < 0.98) return [[B.hips, 1]];
    if (y < 1.12) return lerpW(B.hips, B.spine, (y - 0.98) / 0.14);
    if (y < 1.32) return lerpW(B.spine, B.chest, (y - 1.12) / 0.2);
    if (y < 1.52) return [[B.chest, 1]];
    return lerpW(B.chest, B.neck, (y - 1.52) / 0.03);
  };
  // het shirt valt los over de broek, met een zoom op de heup
  const HEM = jacket ? 0.955 : 0.915, LOOSE = 0.007;
  const torsoRing = (y, c, extra = 0) => { const r = torsoR(y); return { y, x: 0, z: r.z, rx: r.rx + extra, rzf: r.rzf + extra, rzb: r.rzb + extra, sq: 2.35, w: torsoW(y), c }; };
  const torsoRings = [];
  for (const [y] of TORSO) {
    if (y < HEM) break;
    torsoRings.push(torsoRing(y, (coat || jacket) && y > 1.4 ? cSleeve : cShirt, LOOSE * smooth(1.5, 1.4, y)));
  }
  // de zoom beweegt aan de zijkant een beetje met de bovenbenen mee, zodat het been er niet doorheen steekt
  const hemW = (s) => { const l = Math.max(0, -s) * 0.35, r = Math.max(0, s) * 0.35; return [[B.hips, 1 - l - r], [B.thL, l], [B.thR, r]]; };
  torsoRings.push({ ...torsoRing(HEM, cShirt, LOOSE + 0.008), w: hemW }, { ...torsoRing(HEM + 0.004, cShirt, 0), w: hemW }, torsoRing(HEM + 0.004, cPants, 0));
  for (const [y] of TORSO) if (y < HEM) torsoRings.push(torsoRing(y, cPants, 0));
  b.tube(torsoRings, nT, { cap1: true });
  // boord van het shirt
  if (!coat && !jacket) b.rigid(T(new THREE.TorusGeometry(0.064, 0.0075, 5, LAAG ? 10 : 16), 0, 1.54, -0.004, Math.PI / 2 + 0.22, 0, 0, 1, 1.06, 1), B.chest, cShirt.clone().multiplyScalar(0.9), [[B.chest, 0.7], [B.neck, 0.3]]);
  // nek
  b.tube([
    { y: 1.70, x: 0, z: 0.012, rx: 0.046, rz: 0.048, w: [[B.head, 1]], c: cSkin },
    { y: 1.64, x: 0, z: 0.006, rx: 0.054 * limb, rzf: 0.054, rzb: 0.058, w: [[B.neck, 0.45], [B.head, 0.55]], c: cSkin },
    { y: 1.59, x: 0, z: 0, rx: 0.056 * limb, rzf: 0.054, rzb: 0.06, w: [[B.neck, 1]], c: cSkin },
    { y: 1.548, x: 0, z: -0.006, rx: 0.064 * limb, rzf: 0.056, rzb: 0.066, w: [[B.chest, 0.55], [B.neck, 0.45]], c: cSkin },
    { y: 1.51, x: 0, z: -0.008, rx: 0.085, rzf: 0.06, rzb: 0.074, w: [[B.chest, 1]], c: cSkin },
  ], LAAG ? 8 : 12);

  // --- benen ---
  for (const side of [-1, 1]) {
    const th = side < 0 ? B.thL : B.thR, sh = side < 0 ? B.shL : B.shR, ft = side < 0 ? B.ftL : B.ftR;
    const xAt = (y) => side * (0.095 + (1 - y) * 0.012);
    const rings = LEG.map(([y, rx, zf, zb, wt, ws]) => {
      const k = y > 0.2 ? limb : 1;
      const w = [];
      if (1 - wt - ws > 0.001) w.push([B.hips, 1 - wt - ws]);
      if (wt > 0) w.push([th, wt]);
      if (ws > 0) w.push([sh, ws]);
      return { y, x: xAt(y), z: 0, rx: rx * k, rzf: zf * k, rzb: zb * k, sq: 2.1, w, c: cPants };
    });
    // zoom van de broekspijp: valt over de schoen
    const last = rings[rings.length - 1];
    rings.push({ ...last, y: 0.082 }, { ...last, y: 0.086, rx: 0.036, rzf: 0.04, rzb: 0.042 });
    b.tube(rings, nL);
    // enkel en sok (zichtbaar als de pijp omhoog komt)
    b.tube([
      { y: 0.2, x: xAt(0.2), z: 0, rx: 0.034, rzf: 0.036, rzb: 0.04, w: [[sh, 1]], c: cSkinD },
      { y: 0.1, x: xAt(0.1), z: 0, rx: 0.035, rzf: 0.038, rzb: 0.04, w: [[sh, 0.6], [ft, 0.4]], c: cSkinD },
      { y: 0.06, x: xAt(0.06), z: 0, rx: 0.036, rzf: 0.04, rzb: 0.04, w: [[ft, 1]], c: cSkinD },
    ], LAAG ? 6 : 8);
    // schoen: bovenkant en zool, langs de voet opgebouwd
    const fx = side * 0.105;
    const lay = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
    const shoeRings = (bot, grow, sq, c) => SHOE.map(([z, hw, top]) => {
      const t = Math.max(bot + 0.004, grow ? top : 0.017);
      return { y: -z, x: fx, z: (t + bot) / 2, rx: hw + (grow ? 0 : 0.003), rz: (t - bot) / 2, sq, w: [[ft, 1]], c };
    });
    b.tube(shoeRings(0.012, true, 2.7, cShoe), LAAG ? 8 : 12, { m: lay, cap0: true, cap1: true });
    b.tube(shoeRings(-0.001, false, 4, cSole), LAAG ? 8 : 12, { m: lay, cap0: true, cap1: true });
  }

  // --- armen en handen ---
  for (const side of [-1, 1]) {
    const ua = side < 0 ? B.uaL : B.uaR, fa = side < 0 ? B.faL : B.faR, hd = side < 0 ? B.hL : B.hR;
    const x = side * (0.192 - F * 0.01);
    const sleeveEnd = longSleeve ? 0.925 : 1.262;
    const thick = coat || jacket ? 0.009 : longSleeve ? 0.005 : 0.004;
    const armW = ([, , , wu, wf, wh]) => {
      const w = [];
      if (1 - wu - wf - wh > 0.001) w.push([B.chest, 1 - wu - wf - wh]);
      if (wu > 0) w.push([ua, wu]);
      if (wf > 0) w.push([fa, wf]);
      if (wh > 0) w.push([hd, wh]);
      return w;
    };
    const armRing = (row, c, extra) => {
      const k = row[0] > 1.43 || row[0] < 0.93 ? 1 : limb;
      return { y: row[0], x, z: 0, rx: row[1] * k * 0.94 + extra, rz: row[2] * k * 0.94 + extra, w: armW(row), c };
    };
    const rings = [];
    let inSleeve = true;
    for (const row of ARM) {
      if (inSleeve && row[0] < sleeveEnd) {
        // zoom van de mouw: iets wijder dan de arm, daaronder huid
        const hemRow = rowAt(ARM, sleeveEnd), up = rowAt(ARM, sleeveEnd + 0.005);
        rings.push(armRing(hemRow, cSleeve, thick + 0.002), armRing(up, cSleeve, 0), armRing(up, cSkin, 0));
        inSleeve = false;
      }
      rings.push(armRing(row, inSleeve ? cSleeve : cSkin, inSleeve ? thick * smooth(1.47, 1.41, row[0]) : 0));
    }
    b.tube(rings, nA);
    // hand: handpalm naar het been, duim naar voren, vingers licht gebogen
    const pz = 0.004, hw = [[hd, 1]];
    b.tube([
      { y: 0.9, x, z: 0, rx: 0.021, rz: 0.028, w: hw, c: cSkin },
      { y: 0.868, x, z: pz, rx: 0.0175, rz: 0.037, sq: 2.4, w: hw, c: cSkin },
      { y: 0.835, x, z: pz + 0.002, rx: 0.0155, rz: 0.042, sq: 2.6, w: hw, c: cSkin },
      { y: 0.806, x, z: pz + 0.002, rx: 0.0135, rz: 0.041, sq: 2.6, w: hw, c: cSkin },
    ], LAAG ? 6 : 8, { cap1: true });
    const V = (dx, y, z) => new THREE.Vector3(x - side * dx, y, z);
    if (LAAG) {
      // want: de vier vingers als één blok
      b.sweep([V(0, 0.815, pz), V(0.003, 0.78, pz), V(0.012, 0.752, pz), V(0.026, 0.735, pz)], [[0.011, 0.039], [0.0105, 0.038], [0.0095, 0.036], [0.008, 0.031]], 6, hw, cSkin);
    } else {
      const fz = [0.030, 0.0105, -0.0095, -0.0285], fl = [0.070, 0.078, 0.072, 0.056], fr = [0.0092, 0.0095, 0.009, 0.008];
      for (let i = 0; i < 4; i++) {
        const z = pz + 0.002 + fz[i], L = fl[i], r = fr[i], curl = 1 + i * 0.12;
        b.sweep([V(0, 0.818, z), V(0.002 * curl, 0.806 - L * 0.36, z), V(0.011 * curl, 0.806 - L * 0.7, z), V(0.024 * curl, 0.806 - L * 0.93, z)], [r, r * 0.96, r * 0.9, r * 0.78], 5, hw, cSkin);
      }
    }
    b.sweep([V(0.002, 0.878, pz + 0.026), V(0.008, 0.85, pz + 0.05), V(0.014, 0.824, pz + 0.058), V(0.019, 0.803, pz + 0.056)], [0.012, 0.0115, 0.01, 0.0085], LAAG ? 5 : 6, hw, cSkin);
  }

  // --- hoofd ---
  // vorm van de schedel op hoogte yr boven de kin
  const jaw = 1 - F * 0.1 + Math.max(0, bouw) * 0.05;
  const headAt = (yr) => {
    const [, a0, f0, bk] = rowAt(HEAD, Math.max(0, Math.min(0.236, yr)));
    const k = yr < 0.07 ? jaw + (1 - jaw) * (yr / 0.07) : 1;
    const f = f0 - F * 0.003 * (1 - smooth(0, 0.05, yr));
    return { y: CHIN + yr, x: 0, z: (f + bk) / 2, rx: a0 * k * 1.05, rz: (f - bk) / 2 * 1.04, sq: HEAD_SQ };
  };
  // z van het gezicht op hoogte yr en afstand x uit het midden
  const faceZ = (yr, x = 0) => { const r = headAt(yr); return r.z + r.rz * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(x) / r.rx, HEAD_SQ)), 1 / HEAD_SQ); };
  const headYs = LAAG ? [0.236, 0.222, 0.185, 0.14, 0.095, 0.055, 0.025, 0] : [0.236, 0.228, 0.212, 0.185, 0.15, 0.118, 0.085, 0.055, 0.03, 0.01, 0];
  const hw1 = [[B.head, 1]];
  b.tube(headYs.map((yr) => ({ ...headAt(yr), w: hw1, c: cSkin })), nH, { cap0: true, cap1: true });
  // oren
  const earX = headAt(0.105).rx + 0.002;
  for (const s of [-1, 1]) b.rigid(T(sphere(1, LAAG ? 6 : 8, LAAG ? 4 : 6), s * earX, CHIN + 0.107, -0.01, 0.12, s * 0.35, 0, 0.007, 0.029, 0.017), B.head, cSkinD);
  // neus
  {
    const nz = (yr) => faceZ(yr) - 0.005;
    const nr = (dy, rx, rzf) => ({ y: HY + dy, x: 0, z: nz(HY + dy - CHIN), rx, rzf: rzf + 0.005, rzb: 0.004, w: hw1, c: cSkin });
    b.tube([nr(0.012, 0.0065, 0.003), nr(-0.006, 0.008, 0.01), nr(-0.022, 0.0105, 0.018), nr(-0.033, 0.0145, 0.025), nr(-0.039, 0.0125, 0.019), nr(-0.043, 0.006, 0.008)], LAAG ? 6 : 8, { cap1: true });
  }
  // ogen: oogwit, iris, pupil en een bovenooglid
  const ex = 0.032, ez = faceZ(0.118, ex) - 0.007;
  for (const s of [-1, 1]) {
    b.rigid(T(sphere(0.0138, LAAG ? 8 : 10, LAAG ? 6 : 8), s * ex, HY, ez, 0, 0, 0, 1, 0.74, 0.5), B.head, 0xf3f0e9);
    b.rigid(T(sphere(0.0068, 8, 6), s * ex, HY - 0.0008, ez + 0.0055, 0, 0, 0, 1, 1, 0.3), B.head, eyes);
    b.rigid(T(sphere(0.0033, 6, 4), s * ex, HY - 0.0008, ez + 0.007, 0, 0, 0, 1, 1, 0.3), B.head, 0x0b0b0b);
    if (!LAAG) b.rigid(T(sphere(0.0149, 10, 4, 0, Math.PI * 2, 0, Math.PI * 0.36), s * ex, HY - 0.0005, ez, 0.25, 0, 0, 1.06, 0.78, 0.58), B.head, cSkinD);
    // wenkbrauwen
    b.rigid(T(sphere(1, 6, 4), s * 0.033, HY + 0.0245, faceZ(0.142, 0.033) + 0.001, 0, s * 0.25, -s * 0.1, 0.019, 0.0036, 0.005), B.head, cHair.clone().multiplyScalar(0.85));
  }
  // mond
  {
    const cLip = cSkin.clone().lerp(col(female ? 0xb5405a : 0x9a4a44), female ? 0.75 : 0.45), mz = faceZ(0.055) - 0.003;
    b.rigid(T(sphere(1, 8, 4), 0, CHIN + 0.0585, mz, 0, 0, 0, 0.021, 0.0042, 0.0075), B.head, cLip.clone().multiplyScalar(0.92));
    b.rigid(T(sphere(1, 8, 4), 0, CHIN + 0.051, mz - 0.0005, 0, 0, 0, 0.017, 0.005, 0.0075), B.head, cLip);
    b.rigid(T(new THREE.BoxGeometry(0.03, 0.0018, 0.004), 0, CHIN + 0.0548, mz + 0.0052), B.head, 0x5a2a28);
  }
  if (glasses) {
    const gz = ez + 0.017;
    for (const s of [-1, 1]) {
      b.rigid(T(new THREE.TorusGeometry(0.0185, 0.0026, 4, 14), s * ex, HY - 0.001, gz), B.head, 0x1b1b1b);
      b.rigid(T(new THREE.BoxGeometry(0.003, 0.003, 0.085), s * (earX - 0.004), HY + 0.004, gz - 0.045, 0, s * 0.12, 0), B.head, 0x1b1b1b);
    }
    b.rigid(T(new THREE.BoxGeometry(0.026, 0.0035, 0.0035), 0, HY + 0.004, gz), B.head, 0x1b1b1b);
  }
  // baard en haar liggen als een laagje over de schedel: waar geen haar hoort, zit het laagje binnenin
  const shell = (yrs, offOf, c, lift = () => 0, top = false) => {
    const rings = yrs.map((yr) => { const r = headAt(yr); return { ...r, y: r.y + lift(yr), off: offOf(yr), w: hw1, c }; });
    if (top) { const t = rings[0]; rings.unshift({ y: t.y + 0.006, x: 0, z: t.z, rx: 0.012, rz: 0.012, w: hw1, c }); }
    b.tube(rings, nH, { cap0: true, cap1: true });
  };
  if (beard) {
    const off = (yr) => (s, c) => {
      const as = Math.abs(s);
      let k = c > -0.25 ? smooth(-0.25, 0.05, c) : 0;
      if (yr > 0.05) k *= Math.max(smooth(0.5, 0.75, as) * (1 - smooth(0.085, 0.115, yr)), (1 - smooth(0.25, 0.4, as)) * smooth(0.058, 0.064, yr) * (1 - smooth(0.076, 0.084, yr)));
      else if (yr > 0.044 && as < 0.2) k = 0; // de mond blijft vrij
      return -0.01 + 0.019 * k;
    };
    shell([0.115, 0.095, 0.08, 0.07, 0.06, 0.05, 0.04, 0.025, 0.01, 0, -0.012], off, cHair);
  }
  // haar
  const underHat = hat ? 0 : 1;
  const hairline = (c, front, side, back) => (c > 0 ? side + (front - side) * smooth(0.05, 0.8, c) : side + (back - side) * smooth(0, 0.55, -c));
  const HAIR = {
    short: { front: 0.188, side: 0.112, back: 0.045, th: 0.011, top: 0.009 },
    long: { front: 0.186, side: 0.07, back: 0.07, th: 0.013, top: 0.009 },
    bun: { front: 0.19, side: 0.115, back: 0.05, th: 0.009, top: 0.004 },
    curly: { front: 0.178, side: 0.098, back: 0.035, th: 0.026, top: 0.012 },
    bald: { front: 9, side: 0.108, back: 0.045, th: 0.007, top: 0 },
  };
  {
    const h = HAIR[hairStyle] || HAIR.short;
    const off = (yr) => (s, c) => {
      const yb = hairline(c, h.front, h.side, h.back);
      let k = smooth(yb - 0.006, yb + 0.012, yr);
      if (hairStyle === 'bald') k *= 1 - smooth(0.15, 0.178, yr); // alleen een rand rondom
      let th = h.th * (hat ? 1 - 0.5 * smooth(0.15, 0.2, yr) : 1) + h.top * underHat * smooth(0.14, 0.23, yr);
      if (hairStyle === 'curly') th *= 1 + 0.3 * Math.sin(s * 11 + yr * 70) * Math.cos(c * 9 - yr * 40);
      return -0.012 + (th + 0.012) * k;
    };
    const lift = (yr) => (hairStyle === 'bald' ? -0.004 : (h.th + h.top) * underHat * smooth(0.13, 0.236, yr));
    const ys = LAAG ? [0.236, 0.218, 0.185, 0.15, 0.115, 0.08, 0.045, 0.02] : [0.236, 0.228, 0.212, 0.19, 0.165, 0.14, 0.115, 0.09, 0.065, 0.04, 0.02];
    shell(ys, off, cHair, lift, hairStyle !== 'bald');
  }
  if (hairStyle === 'long') {
    // lang haar: valt langs de nek op de schouders en over de rug; het onderste deel beweegt met de romp mee
    const cur = [
      [1.715, 0.088, 0.094, [[B.head, 1]]], [1.67, 0.089, 0.096, [[B.head, 1]]], [1.625, 0.09, 0.094, [[B.head, 0.6], [B.neck, 0.4]]],
      [1.575, 0.093, 0.097, [[B.neck, 0.6], [B.chest, 0.4]]], [1.525, 0.098, 0.106, [[B.chest, 1]]], [1.475, 0.1, 0.124, [[B.chest, 1]]],
      [1.43, 0.092, 0.132, [[B.chest, 1]]], [1.4, 0.07, 0.126, [[B.chest, 1]]],
    ];
    b.tube(cur.map(([y, a, bk, w]) => ({ y, x: 0, z: -0.02, rx: a, rzf: 0.028, rzb: bk - 0.02, sq: 2.3, w, c: cHair })), LAAG ? 12 : 16, { cap1: true });
  } else if (hairStyle === 'bun') {
    b.rigid(T(sphere(0.043, LAAG ? 8 : 10, LAAG ? 6 : 8), 0, HY + 0.078, -0.098), B.head, cHair);
  } else if (hairStyle === 'curly' && !LAAG) {
    // krullen: wat losse bolletjes op het volume
    for (let i = 0; i < 14; i++) {
      const th = i * 2.4, ph = 0.25 + (i / 14) * 1.15;
      const x = Math.sin(ph) * Math.cos(th) * 0.092, y = Math.cos(ph) * 0.105, z = Math.sin(ph) * Math.sin(th) * 0.1 - 0.012;
      if (z > 0.06 && y < 0.075) continue; // gezicht vrijhouden
      b.rigid(T(sphere(0.034, 6, 4), x, HY + 0.035 + y, z), B.head, cHair);
    }
  }

  // --- kleding en accessoires ---
  // onder de heup: verdelen over heup en bovenbenen, zodat jas en schort meebewegen met de benen
  const skirtW = (y) => (s) => {
    const t = Math.min(1, Math.max(0, (0.95 - y) / 0.45));
    const l = Math.max(0, -s) * t * 0.6, r = Math.max(0, s) * t * 0.6;
    return [[B.hips, 1 - l - r], [B.thL, l], [B.thR, r]];
  };
  if (coat || jacket) {
    const cc = col(coat || jacket);
    const rings = [];
    const ys = coat ? [1.5, 1.462, 1.42, 1.36, 1.28, 1.2, 1.12, 1.05, 0.985, 0.9, 0.78, 0.66, 0.56] : [1.5, 1.462, 1.42, 1.36, 1.28, 1.2, 1.12, 1.05, 0.985, 0.9];
    for (const y of ys) {
      const r = y > 0.95 || jacket ? torsoR(y) : { rx: 0.19 * wide + (0.95 - y) * 0.07, rzf: 0.125 + belly * 0.4 + (0.95 - y) * 0.06, rzb: 0.142 + (0.95 - y) * 0.05, z: 0 };
      const e = 0.016 * smooth(1.52, 1.44, y);
      rings.push({ y, x: 0, z: r.z, rx: r.rx + e, rzf: r.rzf + e, rzb: r.rzb + e, sq: 2.35, w: y > 0.95 ? torsoW(y) : skirtW(y), c: cc });
    }
    // zoom met dikte
    const last = rings[rings.length - 1];
    rings.push({ ...last, y: last.y + 0.004, rx: last.rx - 0.012, rzf: last.rzf - 0.012, rzb: last.rzb - 0.012 });
    b.tube(rings, nT);
    // kraag
    b.rigid(T(new THREE.CylinderGeometry(0.066, 0.092, 0.06, LAAG ? 10 : 14, 1, true), 0, 1.535, -0.006, 0.08, 0, 0), B.chest, cc.clone().multiplyScalar(0.88), [[B.chest, 0.7], [B.neck, 0.3]]);
  }
  if (apron) {
    const ca = col(apron);
    // schort: vlak over de voorkant, gebogen langs de romp
    const W = 0.13;
    const ys = [1.4, 1.3, 1.2, 1.1, 1.0, 0.9, 0.78, 0.66, 0.56];
    const base = b.pos.length / 3;
    ys.forEach((y) => {
      for (const u of [-1, -0.5, 0, 0.5, 1]) {
        const r = y > 0.95 ? torsoR(y) : { rx: 0.175, rzf: 0.112 + belly * 0.4 + (0.95 - y) * 0.06, z: 0 };
        const x = u * W * (y > 1.25 ? 0.75 : 1);
        const zz = r.z + Math.pow(Math.max(0, 1 - Math.pow(Math.abs(x) / (r.rx + 0.02), 2.35)), 1 / 2.35) * (r.rzf + 0.02);
        const w = y > 0.95 ? torsoW(y) : skirtW(y)(u);
        b.vert(x, y, zz, 0, 0, 1, ca, w);
      }
    });
    for (let i = 0; i < ys.length - 1; i++) for (let k = 0; k < 4; k++) {
      const a = base + i * 5 + k, c = base + (i + 1) * 5 + k;
      b.idx.push(a, c, a + 1, a + 1, c, c + 1);
    }
    // band om het middel
    const band = (y) => { const r = torsoR(y); return { y, x: 0, z: r.z, rx: r.rx + 0.012, rzf: r.rzf + 0.014, rzb: r.rzb + 0.012, sq: 2.35, w: torsoW(y), c: ca }; };
    b.tube([band(1.04), band(1.015)], nT);
  }
  if (sash) {
    const tor = new THREE.TorusGeometry(1, 0.11, 6, 28);
    const e = coat ? 0.022 : 0.006;
    b.rigid(T(tor, 0, 1.24, 0.004, Math.PI / 2, 0.62, 0, 0.185 * wide + e, 0.12 + belly * 0.5 + e, 0.185 * wide + e), B.chest, sash);
  }
  if (chain) {
    const gold = 0xf2c14e;
    b.rigid(T(new THREE.TorusGeometry(0.1, 0.012, 6, 24, Math.PI), 0, 1.47, 0.078, 0.35, 0, Math.PI), B.chest, gold);
    b.rigid(T(new THREE.CylinderGeometry(0.035, 0.035, 0.01, 16), 0, 1.36, 0.142 + (coat ? 0.016 : 0), Math.PI / 2 - 0.2, 0, 0), B.chest, gold);
  }

  // --- hoeden ---
  const top = HY + 0.125;
  if (hat === 'cap') {
    const hc = opts.hatColor ?? 0xc0392b;
    b.rigid(T(sphere(0.116, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, HY + 0.038, -0.006, -0.08, 0, 0, 0.84, 0.9, 0.96), B.head, hc);
    b.rigid(T(new THREE.CylinderGeometry(0.072, 0.072, 0.012, 16, 1, false, -Math.PI / 2, Math.PI), 0, HY + 0.045, 0.082, 0.14, 0, 0, 1, 1, 1.05), B.head, hc);
  } else if (hat === 'tophat') {
    b.rigid(T(new THREE.CylinderGeometry(0.16, 0.16, 0.012, 22), 0, top - 0.04, -0.004), B.head, 0x15151a);
    b.rigid(T(new THREE.CylinderGeometry(0.094, 0.1, 0.2, 22), 0, top + 0.065, -0.004, 0, 0, 0, 1, 1, 1.12), B.head, 0x15151a);
    b.rigid(T(new THREE.CylinderGeometry(0.102, 0.102, 0.03, 22), 0, top - 0.015, -0.004, 0, 0, 0, 1, 1, 1.12), B.head, 0x7a1f2b);
  } else if (hat === 'chef') {
    b.rigid(T(new THREE.CylinderGeometry(0.1, 0.094, 0.14, 16), 0, top + 0.015, -0.004, 0, 0, 0, 1, 1, 1.12), B.head, 0xffffff);
    b.rigid(T(sphere(0.125, 14, 10), 0, top + 0.115, -0.004, 0, 0, 0, 1, 0.7, 1.05), B.head, 0xffffff);
  } else if (hat === 'helmet') {
    b.rigid(T(sphere(0.128, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, HY + 0.03, -0.006, -0.05, 0, 0, 0.84, 1.0, 1.0), B.head, opts.hatColor ?? 0x2ecc71);
  } else if (hat === 'prins') {
    // witte hoed van Prins Carnaval met een pauwenveer
    const white = 0xf7f5ef, gold = 0xd4af37;
    b.rigid(T(new THREE.CylinderGeometry(0.168, 0.168, 0.014, 26), 0, top - 0.035, -0.004, -0.06, 0, 0), B.head, white);
    b.rigid(T(new THREE.CylinderGeometry(0.092, 0.1, 0.13, 22), 0, top + 0.03, -0.004, -0.06, 0, 0, 1, 1, 1.12), B.head, white);
    b.rigid(T(sphere(0.092, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0, top + 0.093, 0, -0.06, 0, 0, 1, 0.35, 1.12), B.head, white);
    b.rigid(T(new THREE.CylinderGeometry(0.103, 0.103, 0.028, 22), 0, top - 0.013, -0.004, -0.06, 0, 0, 1, 1, 1.12), B.head, gold);
    // veer: schacht schuin naar achteren omhoog, met het 'oog' bovenaan (voor- en achterkant)
    const fx = 0.075, fy = top + 0.015, fz = -0.03, tilt = -0.45;
    const along = (d) => [fx, fy + Math.cos(tilt) * d, fz + Math.sin(tilt) * d];
    const nY = -Math.sin(tilt), nZ = Math.cos(tilt);
    b.rigid(T(new THREE.CylinderGeometry(0.003, 0.005, 0.42, 5), ...along(0.21), tilt, 0, 0), B.head, 0xe9dfc4);
    for (let i = 0; i < 5; i++) {
      const d = 0.08 + i * 0.05;
      b.rigid(T(sphere(1, 6, 4), ...along(d), tilt, 0, 0, 0.022 + i * 0.002, 0.03, 0.004), B.head, i % 2 ? 0x2f8f5b : 0x3aa06a);
    }
    const [ex2, ey2, ez2] = along(0.39);
    const layer = (sx, sy, c, off) => {
      for (const s of [-1, 1]) b.rigid(T(sphere(1, 12, 8), ex2, ey2 + s * off * nY, ez2 + s * off * nZ, tilt, 0, 0, sx, sy, 0.004), B.head, c);
    };
    layer(0.048, 0.075, 0x1f7a4a, 0.001);
    layer(0.032, 0.046, 0xc9a227, 0.003);
    layer(0.022, 0.032, 0x1aa6b7, 0.005);
    layer(0.012, 0.018, 0x0d2a6b, 0.007);
  }

  // --- skelet en model ---
  const geo = b.geometry();
  const bones = BONES.map(([name, p, o]) => { const bn = new THREE.Bone(); bn.name = name; bn.position.set(...o); return bn; });
  BONES.forEach(([, p], i) => { if (p >= 0) bones[p].add(bones[i]); });
  const mesh = new THREE.SkinnedMesh(geo, sharedMat);
  mesh.add(bones[0]);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = true;
  // Buiten beeld niet tekenen. De omhullende bol van een bewegend skelet klopt niet vanzelf, daarom een vaste,
  // ruime bol om het hele poppetje (ook met een arm omhoog of zittend).
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.95, 0), 1.5);

  const root = new THREE.Group();
  const body = new THREE.Group();
  body.add(mesh);
  root.add(body);
  root.scale.setScalar(scale);

  const bn = (k) => bones[B[k]];
  const parts = {
    body, head: bn('head'), neck: bn('neck'), chest: bn('chest'), spine: bn('spine'), hips: bn('hips'),
    armL: bn('uaL'), armR: bn('uaR'), foreArmL: bn('faL'), foreArmR: bn('faR'), handL: bn('hL'), handR: bn('hR'),
    legL: bn('thL'), legR: bn('thR'), shinL: bn('shL'), shinR: bn('shR'), footL: bn('ftL'), footR: bn('ftR'),
    torso: mesh, mesh,
  };

  // --- animatie ---
  // Een houding is per bot een rotatie. Die komt uit drie lagen:
  //  1. eu: een houding in hoeken [x, y, z] per bot (stilstaan, zwaaien, eten, fietsen...);
  //  2. mq/mw: een motion-capturehouding per bot met een gewicht (lopen, rennen, zitten);
  //  3. ad: kleine hoeken die er bovenop komen (rondkijken, voorover leunen).
  // Bij een wissel van houding (andere mode, iets in de hand) springt het poppetje niet: het verschil
  // met de vorige houding blijft als 'rest' staan en dooft in een fractie van een seconde uit.
  const N = bones.length;
  const eu = new Float32Array(N * 3), ad = new Float32Array(N * 3), mq = new Float32Array(N * 4), mw = new Float32Array(N);
  const shown = bones.map(() => new THREE.Quaternion()), rest = bones.map(() => new THREE.Quaternion());
  // lichaam: [x, y, z, kanteling, draaiing]
  const tb = new Float32Array(5), sb = new Float32Array(5), rb = new Float32Array(5), accP = new Float32Array(3);
  let restAmt = 0, lastKey = -1, vs = -1;
  let phase = Math.random(), t = Math.random() * 100;
  const seed = Math.random() * 6.28;
  const set = (k, x = 0, y = 0, z = 0) => { const b = B[k], i = b * 3; eu[i] = x; eu[i + 1] = y; eu[i + 2] = z; mw[b] = 0; };
  const add = (k, x = 0, y = 0, z = 0) => { const i = B[k] * 3; ad[i] += x; ad[i + 1] += y; ad[i + 2] += z; };
  let first = true;

  // Fiets: waar zitten zadel, trapas en stuur, gezien vanuit het poppetje? Staat er een fiets van makeBike
  // naast het poppetje (zelfde ouder), dan komen de maten daarvan; anders een standaardfiets onder de rijder.
  const shoulderAt = (lean, by, bz) => {
    const a1 = lean * 0.3, a2 = lean * 0.75, a3 = lean;
    return [0.97 + by + 0.13 * Math.cos(a1) + 0.2 * Math.cos(a2) + 0.14 * Math.cos(a3), bz + 0.13 * Math.sin(a1) + 0.2 * Math.sin(a2) + 0.14 * Math.sin(a3)];
  };
  const bike = { parent: undefined, x: NaN, y: NaN, z: NaN, sy: 0, sz: 0, cy: 0, cz: 0, r: 0.165, gx: 0.22, gy: 0, gz: 0, lean: 0.4, crank: null };
  const bikeFrame = () => {
    const par = root.parent, pos = root.position;
    if (par === bike.parent && pos.x === bike.x && pos.y === bike.y && pos.z === bike.z) return bike;
    bike.parent = par; bike.x = pos.x; bike.y = pos.y; bike.z = pos.z;
    const b2 = par?.children.find((c) => c.userData.fiets);
    if (b2) {
      const d = b2.userData.fiets, k = 1 / root.scale.y, oy = b2.position.y - pos.y, oz = b2.position.z - pos.z;
      bike.sy = (d.seat[0] + oy) * k; bike.sz = (d.seat[1] + oz) * k;
      bike.cy = (d.crankAt[0] + oy) * k; bike.cz = (d.crankAt[1] + oz) * k; bike.r = d.r * k;
      bike.gx = d.grip[0] * k; bike.gy = (d.grip[1] + oy) * k; bike.gz = (d.grip[2] + oz) * k;
      bike.crank = d.crank;
    } else {
      bike.sy = 0.6; bike.sz = -0.08; bike.cy = 0; bike.cz = 0.17; bike.r = 0.165; bike.gx = 0.22; bike.gy = 0.68; bike.gz = 0.52; bike.crank = null;
    }
    // zo ver voorover dat de handen met licht gebogen armen bij het stuur komen
    const by = bike.sy - 0.85, bz = bike.sz + 0.03;
    const reach = (lean) => { const sh = shoulderAt(lean, by, bz); return Math.hypot(bike.gy - sh[0], bike.gz - sh[1]); };
    let lo = 0.12, hi = 1.0;
    if (reach(lo) > 0.585) for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; if (reach(m) > 0.585) lo = m; else hi = m; }
    bike.lean = lo;
    return bike;
  };

  const pose = (dt, speed, mode) => {
    eu.fill(0); ad.fill(0); mw.fill(0); tb.fill(0);
    t += dt;
    // armen iets van het lichaam af
    set('uaL', 0, 0, -0.07); set('uaR', 0, 0, 0.07);
    set('faL', -0.12); set('faR', -0.12);
    if (mode === 'bike') {
      // Fietsen: het bekken op het zadel, de voeten op de trappers (die echt rondgaan) en de handen aan het stuur.
      // Benen en armen worden per beeld uitgerekend uit die drie vaste punten.
      const f = bikeFrame();
      if (speed > 0.3) phase += dt * (1.5 + speed * 0.55) / (Math.PI * 2);
      const psi = phase * Math.PI * 2; // stand van de linker trapper: 0 = boven, daarna naar voren
      if (f.crank) f.crank.rotation.x = psi;
      const by = f.sy - 0.85, bz = f.sz + 0.03;
      tb[1] = by - 0.03; tb[2] = bz;
      const hp = f.lean * 0.3, sp = f.lean * 0.45, ch = f.lean * 0.25, sway = Math.sin(psi) * 0.02;
      set('hips', hp, 0, sway); set('spine', sp, 0, -sway * 1.4); set('chest', ch);
      set('neck', -f.lean * 0.45); set('head', -f.lean * 0.4);
      // benen
      const hy = 0.97 + by - 0.03 * Math.cos(hp), hz = bz - 0.03 * Math.sin(hp);
      for (let i = 0; i < 2; i++) {
        const a = psi + i * Math.PI;
        const foot = 0.12 + 0.2 * Math.sin(a - Math.PI / 2 - 0.3); // tenen omlaag onderin, hak omlaag bovenin
        // enkel = trapper + dikte van de trapper - plek van de bal van de voet t.o.v. de enkel
        const ay = f.cy + f.r * Math.cos(a) + 0.012 + 0.081 * Math.cos(foot) + 0.095 * Math.sin(foot);
        const az = f.cz + f.r * Math.sin(a) + 0.081 * Math.sin(foot) - 0.095 * Math.cos(foot);
        const dy = ay - hy, dz = az - hz, L = Math.min(0.855, Math.max(0.25, Math.hypot(dy, dz)));
        const dir = Math.atan2(-dz, -dy), al = Math.acos(L / 0.86);
        set(i ? 'thR' : 'thL', dir - al - hp, 0, i ? 0.04 : -0.04);
        set(i ? 'shR' : 'shL', 2 * al);
        set(i ? 'ftR' : 'ftL', foot - dir - al);
      }
      // armen: schouder -> greep, elleboog iets omlaag
      {
        const sh = shoulderAt(f.lean, by, bz);
        const dy = f.gy - sh[0], dz = f.gz - sh[1], L = Math.min(0.615, Math.hypot(dy, dz));
        const dir = Math.atan2(-dz, -dy), l1 = 0.29, l2 = 0.33;
        const be = Math.acos(Math.min(1, (l1 * l1 + L * L - l2 * l2) / (2 * l1 * L)));
        const el = Math.PI - Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + l2 * l2 - L * L) / (2 * l1 * l2))));
        const out = Math.atan2(f.gx - 0.2, 0.55);
        set('uaL', dir + be - f.lean, 0, -out - 0.06); set('uaR', dir + be - f.lean, 0, out + 0.06);
        set('faL', -el, 0, 0.1); set('faR', -el, 0, -0.1);
        set('hL', -0.25); set('hR', -0.25);
      }
    } else if (mode === 'skate') {
      phase += dt * 1.5 / (Math.PI * 2);
      const ph = phase * Math.PI * 2;
      tb[4] = -1.2;
      set('head', 0, 1.1); set('neck', 0, 0.1);
      set('thL', -0.15, 0, -0.25); set('shL', 0.35); set('ftL', -0.2);
      set('thR', -0.15, 0, 0.25); set('shR', 0.35); set('ftR', -0.2);
      set('uaL', 0, 0, -0.9 - Math.sin(ph * 0.5) * 0.08); set('uaR', 0, 0, 0.85); set('faL', -0.3); set('faR', -0.3);
      set('spine', 0.08);
      tb[1] = -0.06 + Math.sin(ph * 0.6) * 0.015;
    } else if (mode === 'sit') {
      // mocap: rustig zitten, met de kleine bewegingen van een echt mens
      const c = CLIPS.sit;
      phase += dt / c.dur;
      mq.fill(0); accP.fill(0);
      addClip(c, phase, 1, mq, accP);
      mw.fill(1);
      tb[0] = accP[0]; tb[1] = -0.52 + accP[1]; tb[2] = accP[2];
      add('head', Math.sin(t * 0.3) * 0.05, Math.sin(t * 0.2) * 0.3);
    } else if (mode === 'camera') {
      set('uaR', -1.6, 0, 0.45); set('faR', -1.7);
      set('uaL', -1.0, 0, -0.25); set('faL', -1.1);
      set('head', 0.05, -0.12); set('thL', 0, 0, -0.05); set('thR', 0, 0, 0.05);
    } else if (mode === 'eat') {
      const bite = Math.max(0, Math.sin(t * 2.4));
      set('uaR', -0.55 - bite * 0.25, 0, 0.15); set('faR', -1.5 - bite * 0.7);
      set('uaL', -0.2, 0, -0.1); set('faL', -0.9);
      set('head', 0.08 - bite * 0.12); set('spine', 0.04);
    } else if (mode === 'drink') {
      set('uaR', -0.9, 0, 0.32); set('faR', -2.1);
      set('neck', -0.25); set('head', -0.3); set('spine', -0.06);
      set('uaL', 0.05, 0, -0.1);
    } else {
      // lopen en rennen: motion capture, gemengd op snelheid (stilstaan - lopen - joggen - rennen)
      if (vs < 0) vs = speed;
      vs += (speed - vs) * (1 - Math.exp(-dt * 8)); // snelheidssprongen uitvlakken
      const g = gait(vs);
      if (speed > 0.05) phase += dt * speed / Math.max(0.2, g.stride);
      const still = 1 - g.amp;
      // stilstaan: gewicht op één been (en af en toe op het andere), ademen en een beetje rondkijken
      const w = Math.max(-1, Math.min(1, Math.sin(t * 0.11 + seed) * 2.5)) * still; // 1 = gewicht op het been aan +X
      const aw = Math.abs(w), freeL = Math.max(0, w), freeR = Math.max(0, -w), br = Math.sin(t * 1.6) * 0.02;
      tb[0] = 0.036 * w; tb[1] = -0.006 * aw;
      set('hips', 0, 0, 0.055 * w + Math.sin(t * 0.35) * 0.01);
      set('spine', 0, 0, -0.065 * w); set('chest', br, 0, -0.015 * w);
      set('thL', -0.16 * freeL, 0.1 * still, -0.097 * w - 0.02 * still); set('shL', 0.32 * freeL); set('ftL', -0.16 * freeL);
      set('thR', -0.16 * freeR, -0.1 * still, -0.097 * w + 0.02 * still); set('shR', 0.32 * freeR); set('ftR', -0.16 * freeR);
      set('neck', 0, 0, 0.015 * w);
      set('head', Math.sin(t * 0.23) * 0.05, Math.sin(t * 0.17) * 0.3 * Math.max(0, Math.sin(t * 0.09)), 0.015 * w);
      set('uaL', br, 0.12, -0.07); set('uaR', Math.sin(t * 1.6 + 1) * 0.02, -0.12, 0.07);
      set('faL', -0.16); set('faR', -0.16);
      if (g.amp > 0.001) {
        mq.fill(0); accP.fill(0);
        addClip(CLIPS.walk, phase, g.walk, mq, accP);
        addClip(CLIPS.jog, phase, g.jog, mq, accP);
        addClip(CLIPS.run, phase, g.run, mq, accP);
        mw.fill(g.amp);
        tb[0] = accP[0] * g.amp; tb[1] = accP[1] * g.amp; tb[2] = accP[2] * g.amp;
        // harder dan de opname: iets verder voorover
        const sprint = smooth(4.5, 6.5, vs);
        if (sprint > 0) add('spine', sprint * 0.1);
      }
      if (mode === 'wave') {
        set('uaR', -0.2, 0, 2.5); set('faR', 0, 0, 0.4 + Math.sin(t * 7) * 0.45);
      }
    }
    if (mode === 'push') {
      // kruiwagen duwen: beide armen schuin naar voren en omlaag, licht voorovergebogen
      set('uaL', -0.55, 0, -0.12); set('uaR', -0.55, 0, 0.12);
      set('faL', -0.25); set('faR', -0.25);
      add('spine', 0.12);
    }
    // iets vasthouden
    const prop = root.userData.handProp;
    const hold = root.userData.holdR && mode !== 'drink' && mode !== 'eat' && mode !== 'bike' && mode !== 'camera';
    if (hold) {
      if (prop?.userData.carrySide) { set('uaR', 0.05, 0, 0.16); set('faR', -0.35); }
      else { set('uaR', -0.45, 0, 0.12); set('faR', -1.05); }
    }
    return (MODES[mode] ?? 0) * 4 + (hold ? (prop?.userData.carrySide ? 2 : 1) : 0);
  };

  const qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), qAcc = new THREE.Quaternion(), eTmp = new THREE.Euler();
  const chainR = [B.hips, B.spine, B.chest, B.uaR, B.faR, B.hR];
  const apply = (dt, key) => {
    // andere houding dan net: het verschil onthouden en laten uitdoven
    const changed = key !== lastKey && !first;
    lastKey = key;
    const k = 1 - Math.exp(-dt * 11);
    if (!changed) restAmt *= 1 - k;
    for (let i = 0; i < N; i++) {
      // doelhouding van dit bot
      const j = i * 3;
      qA.setFromEuler(eTmp.set(eu[j], eu[j + 1], eu[j + 2]));
      if (mw[i] > 0) {
        const m = i * 4;
        qB.set(mq[m], mq[m + 1], mq[m + 2], mq[m + 3]).normalize();
        if (mw[i] >= 1) qA.copy(qB); else qA.slerp(qB, mw[i]);
      }
      if (ad[j] || ad[j + 1] || ad[j + 2]) qA.multiply(qB.setFromEuler(eTmp.set(ad[j], ad[j + 1], ad[j + 2])));
      if (changed) rest[i].copy(shown[i]).multiply(qB.copy(qA).invert());
      else if (restAmt > 0.002) rest[i].slerp(qB.identity(), k);
      if (restAmt > 0.002 || changed) shown[i].copy(rest[i]).multiply(qA); else shown[i].copy(qA);
      bones[i].quaternion.copy(shown[i]);
    }
    for (let i = 0; i < 5; i++) {
      if (changed) rb[i] = sb[i] - tb[i]; else rb[i] *= 1 - k;
      sb[i] = tb[i] + rb[i];
    }
    if (changed) restAmt = 1;
    first = false;
    body.position.set(sb[0], sb[1] + 0.03, sb[2]); // voeten net op de grond (niet erin)
    body.rotation.set(sb[3], sb[4], 0);
  };
  // voorwerp in de hand rechtop houden (behalve een glas tijdens het drinken)
  const uprightProp = (mode) => {
    const prop = root.userData.handProp;
    if (!prop || prop.parent !== parts.handR) return;
    qAcc.copy(body.quaternion);
    for (const i of chainR) qAcc.multiply(shown[i]);
    qAcc.invert();
    if (mode === 'drink') qAcc.premultiply(qA.setFromEuler(eTmp.set(-1.1, 0, 0)));
    prop.quaternion.copy(qAcc);
  };

  // animatie: speed in m/s, mode 'walk' | 'bike' | 'skate' | 'idle' | 'wave' | 'drink' | 'eat' | 'sit' | 'camera' | 'push'
  root.userData.animate = (dt, speed, mode = 'walk') => {
    const key = pose(dt, speed, mode);
    apply(dt, key);
    uprightProp(mode);
  };
  root.userData.parts = parts;
  root.userData.handOffset = [0, -0.07, 0.035];
  return root;
}

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...extra });

// De fiets is één model met kleuren per hoekpunt (plus de trappers die kunnen draaien): twee tekenopdrachten.
const bikeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 });
function paint(geo, color) {
  const c = col(color), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}
// staaf tussen twee punten
function rod(a, b, r, seg = 6) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), d = vb.clone().sub(va);
  const g = new THREE.CylinderGeometry(r, r, d.length(), seg, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  g.translate((va.x + vb.x) / 2, (va.y + vb.y) / 2, (va.z + vb.z) / 2);
  return g;
}

// Een gewone stadsfiets: frame, spatborden, bagagedrager, stuur met de handvatten naar achteren en trappers
// die meedraaien met de benen van wie erop zit (userData.fiets vertelt het poppetje waar alles zit).
export function makeBike(color = 0x1e88e5) {
  const g = new THREE.Group();
  const dark = 0x15151a, steel = 0xb9bec4, frameD = col(color).multiplyScalar(0.55).getHex();
  const parts = [];
  const put = (geo, c) => { parts.push(paint(geo, c)); };
  const seg = LAAG ? 5 : 7;
  const WY = 0.39, BB = [0, 0.345, -0.1];
  for (const z of [-0.55, 0.55]) {
    put(new THREE.TorusGeometry(0.335, 0.033, LAAG ? 5 : 7, LAAG ? 16 : 26).rotateY(Math.PI / 2).translate(0, WY, z), dark);
    put(new THREE.TorusGeometry(0.3, 0.011, 4, LAAG ? 14 : 22).rotateY(Math.PI / 2).translate(0, WY, z), steel);
    put(rod([-0.05, WY, z], [0.05, WY, z], 0.02, 6), steel);
    const ns = LAAG ? 3 : 5;
    for (let i = 0; i < ns; i++) { const a = (i / ns) * Math.PI; put(rod([0, WY + Math.cos(a) * 0.3, z + Math.sin(a) * 0.3], [0, WY - Math.cos(a) * 0.3, z - Math.sin(a) * 0.3], 0.004, 3), steel); }
    // spatbord
    const arc = z < 0 ? Math.PI * 1.05 : Math.PI * 0.72;
    put(new THREE.TorusGeometry(0.385, 0.016, 4, LAAG ? 8 : 12, arc).scale(1, 1, 2.2).rotateY(Math.PI / 2).rotateX(z < 0 ? -0.3 : 0.2).translate(0, WY, z), frameD);
  }
  // frame
  put(rod(BB, [0, 0.84, -0.29], 0.022, seg), color);                 // zitbuis
  put(rod([0, 0.82, -0.283], [0, 0.9, 0.315], 0.02, seg), color);    // bovenbuis
  put(rod([0, 0.76, 0.365], BB, 0.024, seg), color);                 // onderbuis
  put(rod([0, 0.95, 0.3], [0, 0.72, 0.378], 0.026, seg), color);     // balhoofd
  for (const x of [-0.045, 0.045]) {
    put(rod([x * 0.4, BB[1], BB[2]], [x, WY, -0.55], 0.012, 5), color);   // liggende achtervork
    put(rod([x * 0.4, 0.8, -0.275], [x, WY, -0.55], 0.011, 5), color);    // staande achtervork
    put(rod([x, 0.72, 0.378], [x, WY, 0.55], 0.014, 5), color);           // voorvork
    put(rod([x * 1.4, 0.8, -0.74], [x, WY, -0.55], 0.007, 4), steel);     // steun van de bagagedrager
  }
  // zadel
  put(rod([0, 0.84, -0.29], [0, 0.94, -0.33], 0.014, 5), steel);
  put(new THREE.SphereGeometry(1, LAAG ? 8 : 10, 6).scale(0.085, 0.028, 0.14).translate(0, 0.95, -0.37), dark);
  put(new THREE.SphereGeometry(1, 8, 5).scale(0.04, 0.024, 0.1).translate(0, 0.95, -0.27), dark);
  // bagagedrager en kettingkast
  put(new THREE.BoxGeometry(0.13, 0.014, 0.36).translate(0, 0.8, -0.6), steel);
  put(new THREE.BoxGeometry(0.014, 0.085, 0.5).translate(0.06, 0.375, -0.33), frameD);
  // stuurpen en stuur: handvatten naar achteren, zoals op een stadsfiets
  put(rod([0, 0.95, 0.3], [0, 1.1, 0.262], 0.014, 5), steel);
  put(rod([-0.17, 1.1, 0.262], [0.17, 1.1, 0.262], 0.012, 5), steel);
  for (const s of [-1, 1]) {
    put(rod([s * 0.17, 1.1, 0.262], [s * 0.25, 1.12, 0.11], 0.012, 5), steel);
    put(rod([s * 0.25, 1.12, 0.115], [s * 0.254, 1.12, 0.0], 0.017, 6), dark);
  }
  // koplamp en achterlicht
  put(new THREE.SphereGeometry(0.035, 8, 6).scale(1, 1, 0.8).translate(0, 0.86, 0.4), 0xf4f1e6);
  put(new THREE.BoxGeometry(0.05, 0.03, 0.015).translate(0, 0.74, -0.785), 0xc62828);
  const body = new THREE.Mesh(mergeGeometries(parts), bikeMat);
  // trapas met tandwiel, cranks en trappers: draait rond de trapas (rotation.x)
  const cp = [];
  cp.push(paint(rod([-0.1, 0, 0], [0.1, 0, 0], 0.014, 6), steel));
  cp.push(paint(new THREE.CylinderGeometry(0.085, 0.085, 0.006, LAAG ? 10 : 16).rotateZ(Math.PI / 2).translate(0.05, 0, 0), steel));
  for (const s of [-1, 1]) {
    cp.push(paint(new THREE.BoxGeometry(0.014, 0.165, 0.022).translate(-s * 0.1, s * 0.0825, 0), steel));
    cp.push(paint(rod([-s * 0.095, s * 0.165, 0], [-s * 0.185, s * 0.165, 0], 0.02, 6), dark));
  }
  const crank = new THREE.Mesh(mergeGeometries(cp), bikeMat);
  crank.position.set(...BB);
  g.add(body, crank);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  // voor het poppetje dat erop zit: bovenkant zadel [y, z], trapas [y, z], lengte van de crank, handvat [x, y, z]
  g.userData.fiets = { crank, seat: [0.975, -0.35], crankAt: [BB[1], BB[2]], r: 0.165, grip: [0.252, 1.12, 0.06] };
  return g;
}

export function makeSkateboard() {
  const g = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 0.85), std(0xe74c3c));
  deck.position.y = 0.1;
  g.add(deck);
  for (const z of [-0.3, 0.3]) for (const x of [-0.09, 0.09]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 10), std(0xf5f5f5));
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.04, z);
    g.add(w);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function makeKeg() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.55, 18), std(0xb8bec4, { metalness: 0.85, roughness: 0.3 }));
  m.position.y = 0.28;
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.225, 0.02, 6, 20), std(0x8a9096, { metalness: 0.8 }));
  ring1.rotation.x = Math.PI / 2; ring1.position.y = 0.08;
  const ring2 = ring1.clone(); ring2.position.y = 0.48;
  g.add(m, ring1, ring2);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
