// Poppetjes voor de speler en de dorpsbewoners.
// Elk poppetje is één vloeiend 3D-lichaam met een echt skelet (heupen, knieën, ellebogen, nek),
// in code opgebouwd: geen losse modelbestanden nodig. Kleding, haar, hoedjes en gezicht zitten
// in hetzelfde model (één tekenopdracht per poppetje). De animaties worden per frame berekend
// en zacht in elkaar overgevoegd.
import * as THREE from 'three';

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
// wereldpositie van elk bot in rusthouding
const BIND = [];
BONES.forEach(([, p, o], i) => { BIND[i] = p < 0 ? o.slice() : [BIND[p][0] + o[0], BIND[p][1] + o[1], BIND[p][2] + o[2]]; });

const col = (hex) => new THREE.Color(hex);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

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
  // Een buis van horizontale ringen (romp, benen, armen, nek: in rusthouding staat alles verticaal).
  // ring: { y, x, z, rx, rzf, rzb, w: [[bot, gewicht]] of (hoek) => [...], c: kleur }
  tube(rings, n = 14) {
    const out = [];
    // harde kleurovergangen: ring verdubbelen
    for (let i = 0; i < rings.length; i++) {
      out.push(rings[i]);
      if (i + 1 < rings.length && rings[i + 1].c !== rings[i].c && rings[i + 1].seam !== false) out.push({ ...rings[i + 1], c: rings[i].c, dup: true });
    }
    const start = this.pos.length / 3;
    out.forEach((r, ri) => {
      const prev = out[Math.max(0, ri - 1)], next = out[Math.min(out.length - 1, ri + 1)];
      const dy = (next.y - prev.y) || 1;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2, s = Math.sin(a), c = Math.cos(a);
        const rz = c >= 0 ? (r.rzf ?? r.rz) : (r.rzb ?? r.rz);
        const x = r.x + s * r.rx, z = (r.z || 0) + c * rz;
        // helling van de buis voor de normaal
        const rNext = Math.hypot(s * next.rx, c * (c >= 0 ? (next.rzf ?? next.rz) : (next.rzb ?? next.rz)));
        const rPrev = Math.hypot(s * prev.rx, c * (c >= 0 ? (prev.rzf ?? prev.rz) : (prev.rzb ?? prev.rz)));
        const slope = -(rNext - rPrev) / dy;
        let nx = s / r.rx, nz = c / rz;
        const l = Math.hypot(nx, nz); nx /= l; nz /= l;
        const ny = slope;
        const nl = Math.hypot(nx, ny, nz);
        const w = typeof r.w === 'function' ? r.w(s, c) : r.w;
        this.vert(x, r.y, z, nx / nl, ny / nl, nz / nl, r.c, w);
      }
    });
    for (let ri = 0; ri < out.length - 1; ri++) {
      if (out[ri].dup) continue; // geen vlakken tussen een kopie en de ring op dezelfde plek
      const a0 = start + ri * n, b0 = start + (ri + 1) * n;
      for (let k = 0; k < n; k++) {
        const k1 = (k + 1) % n;
        // ringen lopen van boven naar beneden of andersom: winding aanpassen
        if (out[ri + 1].y < out[ri].y) this.idx.push(a0 + k, b0 + k, a0 + k1, a0 + k1, b0 + k, b0 + k1);
        else this.idx.push(a0 + k, a0 + k1, b0 + k, a0 + k1, b0 + k1, b0 + k);
      }
    }
  }
  // Starre vorm aan één bot (hoofd, handen, schoenen, hoedjes).
  rigid(geo, bone, color, w = null) {
    const g = geo.index ? geo : geo;
    const p = g.attributes.position, nm = g.attributes.normal;
    const base = this.pos.length / 3;
    const c = col(color);
    for (let i = 0; i < p.count; i++) this.vert(p.getX(i), p.getY(i), p.getZ(i), nm.getX(i), nm.getY(i), nm.getZ(i), c, w || [[bone, 1]]);
    if (g.index) for (let i = 0; i < g.index.count; i++) this.idx.push(base + g.index.getX(i));
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

export function makeCharacter(opts = {}) {
  const {
    shirt = 0xe8a33d, pants = 0x2e3f5c, skin = 0xf0c8a0, hair = 0x4a3020, shoes = 0x222222,
    hat = null, apron = null, chain = false, sash = null, scale = 1, coat = null,
    female = false, sleeves = 'short', beard = false, glasses = false, eyes = 0x4a3222,
  } = opts;
  const hairStyle = opts.hairStyle || (female ? 'long' : 'short');
  const b = new Builder();
  const cShirt = col(shirt), cPants = col(pants), cSkin = col(skin), cBelt = col(0x2a211a);

  // --- romp ---
  const F = female ? 1 : 0;
  const torso = [
    { y: 0.775, rx: 0.02, rz: 0.02 },
    { y: 0.80, rx: 0.10, rz: 0.08 },
    { y: 0.86, rx: 0.15 + F * 0.02, rzf: 0.1, rzb: 0.12 + F * 0.01 },
    { y: 0.94, rx: 0.165 + F * 0.02, rzf: 0.11, rzb: 0.125 + F * 0.01 },
    { y: 0.985, rx: 0.16 + F * 0.01, rz: 0.112, belt: true },
    { y: 1.0, rx: 0.158 + F * 0.005, rz: 0.11 },
    { y: 1.1, rx: 0.148 - F * 0.02, rzf: 0.108, rzb: 0.1 },
    { y: 1.2, rx: 0.155 - F * 0.015, rzf: 0.112 + F * 0.012, rzb: 0.1 },
    { y: 1.3, rx: 0.168 - F * 0.012, rzf: 0.12 + F * 0.03, rzb: 0.105 },
    { y: 1.38, rx: 0.178 - F * 0.015, rzf: 0.118 + F * 0.012, rzb: 0.108 },
    { y: 1.45, rx: 0.215 - F * 0.02, rz: 0.1 },
    { y: 1.485, rx: 0.17 - F * 0.015, rz: 0.088 },
    { y: 1.52, rx: 0.1, rz: 0.075 },
    { y: 1.54, rx: 0.062, rz: 0.06 },
    { y: 1.56, rx: 0.03, rz: 0.03 },
  ];
  const torsoW = (y) => {
    if (y < 0.98) return [[B.hips, 1]];
    if (y < 1.12) return lerpW(B.hips, B.spine, (y - 0.98) / 0.14);
    if (y < 1.32) return lerpW(B.spine, B.chest, (y - 1.12) / 0.2);
    if (y < 1.52) return [[B.chest, 1]];
    return lerpW(B.chest, B.neck, (y - 1.52) / 0.03);
  };
  const torsoRings = torso.map((r) => ({ ...r, x: 0, w: torsoW(r.y), c: r.y < 0.97 ? cPants : r.belt ? cBelt : cShirt }));
  b.tube(torsoRings, 18);
  // nek
  b.tube([
    { y: 1.53, x: 0, z: 0, rx: 0.056, rz: 0.054, w: [[B.chest, 0.5], [B.neck, 0.5]], c: cSkin },
    { y: 1.6, x: 0, z: 0.005, rx: 0.05, rz: 0.05, w: [[B.neck, 1]], c: cSkin },
    { y: 1.66, x: 0, z: 0.01, rx: 0.05, rz: 0.05, w: [[B.neck, 0.4], [B.head, 0.6]], c: cSkin },
  ], 10);

  // --- benen ---
  for (const side of [-1, 1]) {
    const th = side < 0 ? B.thL : B.thR, sh = side < 0 ? B.shL : B.shR, ft = side < 0 ? B.ftL : B.ftR;
    const x = side * 0.095;
    const leg = [
      [1.03, 0.03, [[B.hips, 1]]], [1.0, 0.085, [[B.hips, 1]]], [0.9, 0.09, [[B.hips, 0.45], [th, 0.55]]], [0.8, 0.086, [[th, 1]]], [0.66, 0.074, [[th, 1]]],
      [0.56, 0.062, [[th, 0.75], [sh, 0.25]]], [0.51, 0.06, [[th, 0.5], [sh, 0.5]]], [0.46, 0.058, [[th, 0.2], [sh, 0.8]]],
      [0.36, 0.062, [[sh, 1]]], [0.22, 0.045, [[sh, 1]]], [0.1, 0.04, [[sh, 0.6], [ft, 0.4]]], [0.05, 0.036, [[ft, 1]]],
    ];
    b.tube(leg.map(([y, r, w]) => ({ y, x: x + (1 - y) * side * 0.012, z: 0, rx: r * 0.95, rz: r, w, c: cPants })), 12);
    // schoen
    const shoe = new THREE.BoxGeometry(0.095, 0.075, 0.25, 2, 1, 3);
    const p = shoe.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const zz = p.getZ(i), yy = p.getY(i);
      // ronde neus en hiel
      const k = 1 - Math.pow(Math.abs(zz) / 0.125, 4) * 0.35;
      p.setX(i, p.getX(i) * k);
      if (yy > 0 && zz > 0.02) p.setY(i, yy - (zz - 0.02) * 0.25);
    }
    shoe.computeVertexNormals();
    b.rigid(T(shoe, x + side * 0.01, 0.04, 0.045), ft, shoes);
    b.rigid(T(new THREE.BoxGeometry(0.1, 0.018, 0.255), x + side * 0.01, 0.008, 0.045), ft, 0x1a1512);
  }

  // --- armen ---
  const longSleeve = sleeves === 'long' || coat;
  for (const side of [-1, 1]) {
    const ua = side < 0 ? B.uaL : B.uaR, fa = side < 0 ? B.faL : B.faR, hd = side < 0 ? B.hL : B.hR;
    const x = side * 0.2;
    const sleeveEnd = longSleeve ? 0.93 : 1.27;
    const arm = [
      [1.475, 0.02, [[B.chest, 1]]], [1.465, 0.048, [[B.chest, 1]]], [1.44, 0.06, [[B.chest, 0.45], [ua, 0.55]]], [1.37, 0.057, [[ua, 1]]], [1.27, 0.05, [[ua, 1]]],
      [1.2, 0.045, [[ua, 0.8], [fa, 0.2]]], [1.15, 0.042, [[ua, 0.5], [fa, 0.5]]], [1.1, 0.042, [[ua, 0.15], [fa, 0.85]]],
      [1.0, 0.038, [[fa, 1]]], [0.93, 0.031, [[fa, 0.7], [hd, 0.3]]], [0.885, 0.029, [[fa, 0.3], [hd, 0.7]]], [0.86, 0.026, [[hd, 1]]],
    ];
    const cSleeve = coat ? col(coat) : cShirt;
    b.tube(arm.map(([y, r, w]) => ({ y, x, z: 0, rx: r * (y > 1.43 ? 1.05 : 0.92), rz: r, w, c: y >= sleeveEnd - 0.001 ? cSleeve : cSkin })), 10);
    // hand: handpalm naar het been
    const hand = new THREE.BoxGeometry(0.032, 0.085, 0.07, 1, 2, 1);
    const hp = hand.attributes.position;
    for (let i = 0; i < hp.count; i++) { const yy = hp.getY(i); if (yy < 0) { hp.setZ(i, hp.getZ(i) * 0.8); hp.setX(i, hp.getX(i) * 0.8); } }
    hand.computeVertexNormals();
    b.rigid(T(hand, x, 0.835, 0.008), hd, skin);
    b.rigid(T(new THREE.CapsuleGeometry(0.013, 0.03, 2, 6), x - side * 0.004, 0.85, 0.045, 0.5, 0, 0), hd, skin);
  }

  // --- hoofd ---
  const HY = 1.735;
  b.rigid(T(sphere(0.105, 18, 14), 0, HY, 0.008, 0, 0, 0, 0.9, 1.12, 1.0), B.head, skin);
  // kaak en kin
  b.rigid(T(sphere(0.07, 12, 8), 0, HY - 0.062, 0.035, 0, 0, 0, 1.05, 0.75, 1.0), B.head, skin);
  // oren
  for (const s of [-1, 1]) b.rigid(T(sphere(0.022, 8, 6), s * 0.093, HY - 0.005, 0, 0, 0, 0, 0.45, 1, 0.75), B.head, skin);
  // neus
  b.rigid(T(new THREE.ConeGeometry(0.014, 0.04, 8), 0, HY - 0.012, 0.108, 1.85, 0, 0), B.head, skin);
  b.rigid(T(sphere(0.012, 8, 6), 0, HY - 0.028, 0.112), B.head, skin);
  // ogen
  for (const s of [-1, 1]) {
    b.rigid(T(sphere(0.016, 10, 8), s * 0.036, HY + 0.012, 0.1, 0, 0, 0, 1, 0.8, 0.55), B.head, 0xf6f2ea);
    b.rigid(T(sphere(0.0085, 8, 6), s * 0.036, HY + 0.012, 0.1075, 0, 0, 0, 1, 1, 0.4), B.head, eyes);
    b.rigid(T(sphere(0.0042, 6, 4), s * 0.036, HY + 0.012, 0.1095, 0, 0, 0, 1, 1, 0.4), B.head, 0x0b0b0b);
    // wenkbrauwen
    b.rigid(T(new THREE.BoxGeometry(0.034, 0.007, 0.01), s * 0.037, HY + 0.037, 0.101, 0, 0, -s * 0.12), B.head, hair);
  }
  // mond
  b.rigid(T(new THREE.BoxGeometry(0.034, 0.006, 0.008), 0, HY - 0.052, 0.104), B.head, female ? 0xb5495b : 0x9a5a50);
  if (glasses) {
    for (const s of [-1, 1]) b.rigid(T(new THREE.TorusGeometry(0.019, 0.003, 4, 14), s * 0.036, HY + 0.01, 0.108), B.head, 0x1b1b1b);
    b.rigid(T(new THREE.BoxGeometry(0.03, 0.004, 0.004), 0, HY + 0.014, 0.11), B.head, 0x1b1b1b);
  }
  if (beard) {
    b.rigid(T(sphere(0.078, 14, 10, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55), 0, HY - 0.025, 0.03, 0, 0, 0, 1.08, 1.0, 1.04), B.head, hair);
  }
  // haar
  if (hairStyle !== 'bald') {
    b.rigid(T(sphere(0.111, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), 0, HY + 0.012, -0.004, -0.42, 0, 0, 0.93, 1.1, 1.04), B.head, hair);
  } else {
    // rand haar rondom
    b.rigid(T(sphere(0.108, 16, 6, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.16), 0, HY + 0.01, -0.008, -0.35, 0, 0, 0.94, 1.1, 1.03), B.head, hair);
  }
  if (hairStyle === 'long') {
    // lang haar over de rug, aan het hoofd en de nek
    const back = new THREE.CylinderGeometry(0.1, 0.12, 0.3, 14, 3, true, Math.PI * 0.55, Math.PI * 0.9);
    b.rigid(T(back, 0, HY - 0.12, -0.022, 0.08, 0, 0, 1, 1, 0.75), B.head, hair);
    b.rigid(T(sphere(0.112, 14, 8, 0, Math.PI * 2, Math.PI * 0.4, Math.PI * 0.25), 0, HY - 0.005, -0.012, 0, 0, 0, 0.98, 1, 1.0), B.head, hair);
  } else if (hairStyle === 'bun') {
    b.rigid(T(sphere(0.05, 10, 8), 0, HY + 0.07, -0.085), B.head, hair);
  }

  // --- kleding en accessoires ---
  const torsoR = (y) => {
    for (let i = 0; i < torso.length - 1; i++) {
      const a = torso[i], c = torso[i + 1];
      if (y >= a.y && y <= c.y) {
        const t = (y - a.y) / (c.y - a.y);
        return { rx: a.rx + (c.rx - a.rx) * t, rzf: (a.rzf ?? a.rz) + ((c.rzf ?? c.rz) - (a.rzf ?? a.rz)) * t, rzb: (a.rzb ?? a.rz) + ((c.rzb ?? c.rz) - (a.rzb ?? a.rz)) * t };
      }
    }
    return { rx: 0.16, rzf: 0.11, rzb: 0.11 };
  };
  // onder de heup: verdelen over heup en bovenbenen, zodat jas en schort meebewegen met de benen
  const skirtW = (y) => (s) => {
    const t = Math.min(1, Math.max(0, (0.95 - y) / 0.45));
    const l = Math.max(0, -s) * t * 0.6, r = Math.max(0, s) * t * 0.6;
    return [[B.hips, 1 - l - r], [B.thL, l], [B.thR, r]];
  };
  if (coat) {
    const cc = col(coat);
    const rings = [];
    for (const y of [1.5, 1.45, 1.38, 1.3, 1.2, 1.1, 1.0, 0.9, 0.78, 0.66, 0.56]) {
      const r = y > 0.95 ? torsoR(y) : { rx: 0.185 + (0.95 - y) * 0.08, rzf: 0.13 + (0.95 - y) * 0.06, rzb: 0.14 + (0.95 - y) * 0.06 };
      rings.push({ y, x: 0, z: 0, rx: r.rx + 0.014, rzf: r.rzf + 0.014, rzb: r.rzb + 0.014, w: y > 0.95 ? torsoW(y) : skirtW(y), c: cc });
    }
    b.tube(rings, 18);
    b.rigid(T(new THREE.CylinderGeometry(0.075, 0.1, 0.06, 14, 1, true), 0, 1.53, 0, 0, 0, 0), B.chest, coat);
  }
  if (apron) {
    const ca = col(apron);
    // schort: vlak over de voorkant, gebogen langs de romp
    const W = 0.13;
    const ys = [1.4, 1.3, 1.2, 1.1, 1.0, 0.9, 0.78, 0.66, 0.56];
    const base = b.pos.length / 3;
    ys.forEach((y) => {
      for (const u of [-1, -0.5, 0, 0.5, 1]) {
        const r = y > 0.95 ? torsoR(y) : { rx: 0.17, rzf: 0.11 + (0.95 - y) * 0.06 };
        const x = u * W * (y > 1.25 ? 0.75 : 1);
        const zz = Math.sqrt(Math.max(0, 1 - Math.pow(x / (r.rx + 0.02), 2))) * (r.rzf + 0.016);
        const w = y > 0.95 ? torsoW(y) : skirtW(y)(u);
        b.vert(x, y, zz, 0, 0, 1, ca, w);
      }
    });
    for (let i = 0; i < ys.length - 1; i++) for (let k = 0; k < 4; k++) {
      const a = base + i * 5 + k, c = base + (i + 1) * 5 + k;
      b.idx.push(a, c, a + 1, a + 1, c, c + 1);
    }
    b.tube([{ y: 1.035, x: 0, rx: torsoR(1.035).rx + 0.008, rz: 0.12, w: torsoW(1.03), c: ca }, { y: 1.015, x: 0, rx: torsoR(1.015).rx + 0.008, rz: 0.12, w: torsoW(1.01), c: ca }], 16);
  }
  if (sash) {
    const tor = new THREE.TorusGeometry(1, 0.11, 6, 28);
    const e = coat ? 0.022 : 0;
    b.rigid(T(tor, 0, 1.24, 0, Math.PI / 2, 0.62, 0, 0.19 + e, 0.135 + e, 0.19 + e), B.chest, sash);
  }
  if (chain) {
    const gold = 0xf2c14e;
    b.rigid(T(new THREE.TorusGeometry(0.1, 0.012, 6, 24, Math.PI), 0, 1.47, 0.07, 0.35, 0, Math.PI), B.chest, gold);
    b.rigid(T(new THREE.CylinderGeometry(0.035, 0.035, 0.01, 16), 0, 1.36, 0.135, Math.PI / 2 - 0.25, 0, 0), B.chest, gold);
  }

  // --- hoeden ---
  const top = HY + 0.125;
  if (hat === 'cap') {
    const hc = opts.hatColor ?? 0xc0392b;
    b.rigid(T(sphere(0.116, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, HY + 0.035, -0.004, -0.08, 0, 0, 0.95, 0.92, 1.04), B.head, hc);
    b.rigid(T(new THREE.CylinderGeometry(0.075, 0.075, 0.012, 16, 1, false, -Math.PI / 2, Math.PI), 0, HY + 0.04, 0.09, 0.12, 0, 0, 1, 1, 1.05), B.head, hc);
  } else if (hat === 'tophat') {
    b.rigid(T(new THREE.CylinderGeometry(0.17, 0.17, 0.012, 22), 0, top - 0.035, 0), B.head, 0x15151a);
    b.rigid(T(new THREE.CylinderGeometry(0.1, 0.106, 0.2, 22), 0, top + 0.07, 0), B.head, 0x15151a);
    b.rigid(T(new THREE.CylinderGeometry(0.108, 0.108, 0.03, 22), 0, top - 0.01, 0), B.head, 0x7a1f2b);
  } else if (hat === 'chef') {
    b.rigid(T(new THREE.CylinderGeometry(0.11, 0.1, 0.14, 16), 0, top + 0.02, 0), B.head, 0xffffff);
    b.rigid(T(sphere(0.13, 14, 10), 0, top + 0.12, 0, 0, 0, 0, 1, 0.7, 1), B.head, 0xffffff);
  } else if (hat === 'helmet') {
    b.rigid(T(sphere(0.128, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, HY + 0.025, -0.005, 0, 0, 0, 1, 1.05, 1.1), B.head, opts.hatColor ?? 0x2ecc71);
  } else if (hat === 'prins') {
    // witte hoed van Prins Carnaval met een pauwenveer
    const white = 0xf7f5ef, gold = 0xd4af37;
    b.rigid(T(new THREE.CylinderGeometry(0.175, 0.175, 0.014, 26), 0, top - 0.03, 0, -0.06, 0, 0), B.head, white);
    b.rigid(T(new THREE.CylinderGeometry(0.098, 0.108, 0.13, 22), 0, top + 0.035, 0, -0.06, 0, 0), B.head, white);
    b.rigid(T(sphere(0.098, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0, top + 0.098, 0.004, -0.06, 0, 0, 1, 0.35, 1), B.head, white);
    b.rigid(T(new THREE.CylinderGeometry(0.11, 0.11, 0.028, 22), 0, top - 0.008, 0, -0.06, 0, 0), B.head, gold);
    // veer: schacht schuin naar achteren omhoog, met het 'oog' bovenaan (voor- en achterkant)
    const fx = 0.08, fy = top + 0.02, fz = -0.03, tilt = -0.45;
    const along = (d) => [fx, fy + Math.cos(tilt) * d, fz + Math.sin(tilt) * d];
    const nY = -Math.sin(tilt), nZ = Math.cos(tilt);
    b.rigid(T(new THREE.CylinderGeometry(0.003, 0.005, 0.42, 5), ...along(0.21), tilt, 0, 0), B.head, 0xe9dfc4);
    for (let i = 0; i < 5; i++) {
      const d = 0.08 + i * 0.05;
      b.rigid(T(sphere(1, 6, 4), ...along(d), tilt, 0, 0, 0.022 + i * 0.002, 0.03, 0.004), B.head, i % 2 ? 0x2f8f5b : 0x3aa06a);
    }
    const [ex, ey, ez] = along(0.39);
    const layer = (sx, sy, c, off) => {
      for (const s of [-1, 1]) b.rigid(T(sphere(1, 12, 8), ex, ey + s * off * nY, ez + s * off * nZ, tilt, 0, 0, sx, sy, 0.004), B.head, c);
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
  mesh.frustumCulled = false; // de omhullende bol van een bewegend skelet klopt niet altijd

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
  // houding = per bot een rotatie [x, y, z], plus lichaamshoogte en -kanteling
  const N = bones.length;
  const cur = new Float32Array(N * 3), tgt = new Float32Array(N * 3);
  let curY = 0, curPitch = 0, curYaw = 0, tgtY = 0, tgtPitch = 0, tgtYaw = 0;
  let phase = Math.random() * 10, t = Math.random() * 100;
  const set = (k, x = 0, y = 0, z = 0) => { const i = B[k] * 3; tgt[i] = x; tgt[i + 1] = y; tgt[i + 2] = z; };
  const add = (k, x = 0, y = 0, z = 0) => { const i = B[k] * 3; tgt[i] += x; tgt[i + 1] += y; tgt[i + 2] += z; };
  let first = true;

  const pose = (dt, speed, mode) => {
    tgt.fill(0); tgtY = 0; tgtPitch = 0; tgtYaw = 0;
    t += dt;
    // armen iets van het lichaam af
    set('uaL', 0, 0, -0.07); set('uaR', 0, 0, 0.07);
    set('faL', -0.12); set('faR', -0.12);
    if (mode === 'bike') {
      phase += dt * (1.5 + speed * 0.55);
      const p = phase;
      tgtPitch = 0.0;
      set('spine', 0.3); set('chest', 0.12); set('neck', -0.25); set('head', -0.12);
      set('uaL', -0.95, 0, -0.12); set('uaR', -0.95, 0, 0.12);
      set('faL', -0.35); set('faR', -0.35);
      set('thL', -1.05 + Math.sin(p) * 0.42); set('shL', 1.15 - Math.sin(p) * 0.25 + Math.cos(p) * 0.3); set('ftL', -0.15 + Math.cos(p) * 0.15);
      set('thR', -1.05 - Math.sin(p) * 0.42); set('shR', 1.15 + Math.sin(p) * 0.25 - Math.cos(p) * 0.3); set('ftR', -0.15 - Math.cos(p) * 0.15);
      tgtY = -0.03;
    } else if (mode === 'skate') {
      phase += dt * 1.5;
      tgtYaw = -1.2;
      set('head', 0, 1.1); set('neck', 0, 0.1);
      set('thL', -0.15, 0, -0.25); set('shL', 0.35); set('ftL', -0.2);
      set('thR', -0.15, 0, 0.25); set('shR', 0.35); set('ftR', -0.2);
      set('uaL', 0, 0, -0.9 - Math.sin(phase * 0.5) * 0.08); set('uaR', 0, 0, 0.85); set('faL', -0.3); set('faR', -0.3);
      set('spine', 0.08);
      tgtY = -0.06 + Math.sin(phase * 0.6) * 0.015;
    } else if (mode === 'sit') {
      tgtY = -0.52;
      set('thL', -1.5, 0, -0.06); set('thR', -1.5, 0, 0.06);
      set('shL', 1.45); set('shR', 1.45); set('ftL', 0.05); set('ftR', 0.05);
      set('uaL', -0.35, 0, -0.1); set('uaR', -0.35, 0, 0.1); set('faL', -0.9); set('faR', -0.9);
      set('spine', -0.04 + Math.sin(t * 1.3) * 0.015);
      set('head', Math.sin(t * 0.3) * 0.06, Math.sin(t * 0.2) * 0.35);
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
      // lopen en rennen
      const run = smooth(3.6, 5.6, speed);
      const sw = Math.min(1, speed / 1.6);
      const cycle = 1.35 + speed * 0.26;
      phase += dt * (speed > 0.05 ? (speed / cycle) * Math.PI * 2 : 0);
      const p = phase, s = Math.sin(p), c = Math.cos(p);
      const ampT = (0.42 + run * 0.28) * sw;
      set('thL', -s * ampT - run * 0.15 * sw); set('thR', s * ampT - run * 0.15 * sw);
      const kneeL = Math.pow(Math.max(0, Math.cos(p - 0.35)), 1.4), kneeR = Math.pow(Math.max(0, Math.cos(p + Math.PI - 0.35)), 1.4);
      set('shL', (0.08 + kneeL * (0.85 + run * 0.75)) * sw); set('shR', (0.08 + kneeR * (0.85 + run * 0.75)) * sw);
      set('ftL', (-0.12 * kneeL + s * 0.18) * sw); set('ftR', (-0.12 * kneeR - s * 0.18) * sw);
      tgtY = (Math.abs(c) * 0.035 - 0.02 - run * 0.04) * sw;
      set('hips', 0, s * 0.1 * sw, 0);
      set('spine', (0.03 + run * 0.12) * sw, -s * 0.12 * sw);
      set('chest', 0, -s * 0.06 * sw);
      set('neck', -(run * 0.08) * sw);
      const ampA = (0.38 + run * 0.35) * sw;
      set('uaL', s * ampA, 0, -0.08 - run * 0.08); set('uaR', -s * ampA, 0, 0.08 + run * 0.08);
      set('faL', -0.18 - (0.25 + run * 1.0) * sw * (0.6 + Math.max(0, -s) * 0.6)); set('faR', -0.18 - (0.25 + run * 1.0) * sw * (0.6 + Math.max(0, s) * 0.6));
      if (speed < 0.1) {
        // stilstaan: ademen en een beetje rondkijken
        add('chest', Math.sin(t * 1.6) * 0.02);
        add('hips', 0, 0, Math.sin(t * 0.35) * 0.025);
        add('thL', 0, 0, -0.03); add('thR', 0, 0, 0.03);
        add('head', Math.sin(t * 0.23) * 0.05, Math.sin(t * 0.17) * 0.3 * Math.max(0, Math.sin(t * 0.09)));
        add('uaL', Math.sin(t * 1.6) * 0.02); add('uaR', Math.sin(t * 1.6 + 1) * 0.02);
      }
      if (mode === 'wave') {
        set('uaR', -0.2, 0, 2.5); set('faR', 0, 0, 0.4 + Math.sin(t * 7) * 0.45);
      }
    }
    // iets vasthouden
    const prop = root.userData.handProp;
    if (root.userData.holdR && mode !== 'drink' && mode !== 'eat' && mode !== 'bike' && mode !== 'camera') {
      if (prop?.userData.carrySide) { set('uaR', 0.05, 0, 0.16); set('faR', -0.35); }
      else { set('uaR', -0.45, 0, 0.12); set('faR', -1.05); }
    }
  };

  const qTmp = new THREE.Quaternion(), qAcc = new THREE.Quaternion(), eTmp = new THREE.Euler();
  const chainR = [B.hips, B.spine, B.chest, B.uaR, B.faR, B.hR];
  const apply = (dt) => {
    const k = first ? 1 : 1 - Math.exp(-dt * 14);
    first = false;
    for (let i = 0; i < N * 3; i++) cur[i] += (tgt[i] - cur[i]) * k;
    curY += (tgtY - curY) * k; curPitch += (tgtPitch - curPitch) * k; curYaw += (tgtYaw - curYaw) * k;
    for (let i = 0; i < N; i++) bones[i].rotation.set(cur[i * 3], cur[i * 3 + 1], cur[i * 3 + 2]);
    body.position.y = curY;
    body.rotation.set(curPitch, curYaw, 0);
  };
  // voorwerp in de hand rechtop houden (behalve een glas tijdens het drinken)
  const uprightProp = (mode) => {
    const prop = root.userData.handProp;
    if (!prop || prop.parent !== parts.handR) return;
    qAcc.setFromEuler(body.rotation);
    for (const i of chainR) qAcc.multiply(qTmp.setFromEuler(bones[i].rotation));
    qAcc.invert();
    if (mode === 'drink') qAcc.premultiply(qTmp.setFromEuler(eTmp.set(-1.1, 0, 0)));
    prop.quaternion.copy(qAcc);
  };

  // animatie: speed in m/s, mode 'walk' | 'bike' | 'skate' | 'idle' | 'wave' | 'drink' | 'eat' | 'sit' | 'camera'
  root.userData.animate = (dt, speed, mode = 'walk') => {
    pose(dt, speed, mode);
    apply(dt);
    uprightProp(mode);
  };
  root.userData.parts = parts;
  root.userData.handOffset = [0, -0.07, 0.035];
  return root;
}

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...extra });

export function makeBike(color = 0x1e88e5) {
  const g = new THREE.Group();
  const frame = std(color, { metalness: 0.4, roughness: 0.4 });
  const dark = std(0x111111);
  const wheelGeo = new THREE.TorusGeometry(0.33, 0.04, 8, 24);
  for (const z of [-0.55, 0.55]) {
    const w = new THREE.Mesh(wheelGeo, dark);
    w.rotation.y = Math.PI / 2;
    w.position.set(0, 0.36, z);
    g.add(w);
  }
  const bar = (len, x, y, z, rx) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, len, 6), frame);
    m.position.set(x, y, z); m.rotation.x = rx; g.add(m);
  };
  bar(1.0, 0, 0.62, 0, Math.PI / 2);
  bar(0.6, 0, 0.6, -0.25, 0.5);
  bar(0.6, 0, 0.62, 0.42, -0.35);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.26), dark);
  seat.position.set(0, 0.92, -0.35); g.add(seat);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.55, 6), dark);
  handle.rotation.z = Math.PI / 2; handle.position.set(0, 1.0, 0.5); g.add(handle);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
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
