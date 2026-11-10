// De automodellen zelf: per type de maten van carrosserie en kap, en alles wat erop zit
// (ruiten, stijlen, lampen, grille, naden, spiegels, interieur, wielen). Zie carmodel.js voor de bouwstenen.
// Maten in 'u' zijn gemeten vanaf de achterkant van de auto (0 = achterbumper, L = neus), hoogtes vanaf de grond.
import * as THREE from 'three';
import { Buf, Shell, patch, linePatch, st, lamp, paintSt, fnOf, clamp, lerp, sstep, HALF_PI, box, softBox, cyl, ball, lathe, buildWheel, seat, steeringWheel, driver, mat4 } from './carmodel.js';

// Detailniveaus: 0 = losse auto van dichtbij, 1 = gebundelde auto dichtbij, 2 = ver weg en telefoon.
export const LODS = [
  { nEnd: 11, dz: 0.11, nArch: 16, nT: 9, nS: 9, nB: 3, gEnd: 8, gdz: 0.14, gT: 7, gS: 5, patch: 1, glass: true, interior: 2 },
  { nEnd: 6, dz: 0.24, nArch: 8, nT: 5, nS: 5, nB: 2, gEnd: 5, gdz: 0.3, gT: 4, gS: 3, patch: 0.5, glass: true, interior: 1 },
  { nEnd: 3, dz: 0.55, nArch: 5, nT: 3, nS: 3, nB: 1, gEnd: 3, gdz: 0.7, gT: 2, gS: 2, patch: 0.25, glass: false, interior: 0 },
];

const SILVER = st(0xc9ccd0, 0.22, 1), CHROME = st(0xe2e5e8, 0.07, 1), BLACK = st(0x0b0c0d, 0.22, 0.3), PLASTIC = st(0x17181a, 0.78, 0);
const SEAM = st(0x050505, 0.9), DARK = st(0x0a0a0b, 1), INNER = st(0x2c2d30, 0.92), RUBBER = st(0x0d0d0e, 0.9);
const GLASS_FAR = st(0x0c1014, 0.08, 0.55); // ondoorzichtig glas voor de eenvoudige modellen
const WHITE = 0xf3f7ff, WARM = 0xc9c3b6, RED = 0xd01212, BRAKE = 0xff2a14, AMBER = 0xff9a14;

const RIMS = {
  // vijf brede spaken, zilver
  hatch: { n: 5, wi: 0.05, wo: 0.075, dish: 0.014, ridge: 0.008 },
  // tien dunne spaken in paren
  sedan: { n: 5, twin: 0.2, wi: 0.026, wo: 0.034, dish: 0.02, ridge: 0.005 },
  // zes stevige spaken, donker met gepolijste voorkant
  suv: { n: 6, wi: 0.055, wo: 0.085, dish: 0.006, ridge: 0.006, side: st(0x1c1d1f, 0.5, 0.7), barrel: st(0x2a2b2e, 0.5, 0.8) },
  // stalen velg met wieldop: brede korte 'spaken' en een grote dop
  van: { n: 8, wi: 0.07, wo: 0.062, dish: 0.004, ridge: 0.002, capR: 0.085, face: st(0xb4b7ba, 0.4, 0.9), side: st(0x3a3c3f, 0.6, 0.7), bolts: false },
  // dunne Y-spaken, zwart
  sport: { n: 5, twin: 0.13, wi: 0.03, wo: 0.026, dish: 0.03, ridge: 0.005, curve: 0.7, face: st(0x1b1c1e, 0.28, 0.9), side: st(0x101112, 0.4, 0.8), lip: st(0x1b1c1e, 0.28, 0.9), barrel: st(0x17181a, 0.5, 0.8) },
  // turbinevelg: vijf gezwenkte spaken, gepolijst op zwart
  xc40: { n: 5, sweep: 0.42, wi: 0.06, wo: 0.105, dish: 0.012, ridge: 0.004, face: st(0xd9dcdf, 0.16, 1), side: st(0x0e0f10, 0.45, 0.6), barrel: st(0x141516, 0.5, 0.7), cap: st(0x0e0f10, 0.3, 0.6) },
};

const SPECS = {
  hatch: {
    body: {
      top: [[0, 0.94], [0.2, 0.99], [0.8, 1.0], [2.0, 0.98], [2.85, 0.96], [3.35, 0.905], [3.8, 0.84], [4.05, 0.765]],
      bot: [[0, 0.33], [0.3, 0.27], [0.75, 0.21], [3.3, 0.2], [3.75, 0.215], [4.05, 0.26]],
      rt: [[0, 0.06], [0.5, 0.06], [2.7, 0.05], [3.2, 0.1], [3.8, 0.08], [4.05, 0.05]],
      pt: [[0, 2.6], [2.8, 2.5], [3.3, 3.0], [4.05, 2.5]],
      rb: 0.09, taper: [[0, 0.95], [0.9, 1], [3.2, 1], [4.05, 0.98]],
      ends: { bf: 0.62, nf: 3.0, br: 0.42, nr: 3.6, cap: 0.27 },
      iT: 0.045, iB: 0.05, vm: 0.42,
      lean: { f: 0.07, yf: 0.5, hf: 0.27, r: 0.03, yr: 0.6, hr: 0.35 },
      arch: { r: 0.385, f1: 0.012, f2: 0.012 },
    },
    gh: {
      top: [[0.05, 0.9], [0.22, 1.2], [0.55, 1.41], [1.5, 1.46], [2.25, 1.435], [2.62, 1.2], [2.98, 0.94]],
      tipF: 2.98, tipR: 0.05, bf: 0.32, nf: 4, br: 0.2, nr: 4.5, tumble: 0.3, rt: 0.085, pt: 2.7,
      roof: [0.55, 2.24], band: 0.065, aW: 0.085, b: [1.72], bw: 0.09, c: [0.5, 0.82], cW: 0.09, rearPanel: 0.12,
    },
    doors: { f: 2.72, r: 1.02, handles: [1.86, 1.05] },
    tire: 0.2, rimR: 0.205, seats: 4, seatY: -0.4, trim: 0x34373c,
    front: { head: [0.4, 0.84, 0.63, 0.73, 0.68, 0.79], drl: 'bottom', grille: [0.4, 0.6, 0.7], lower: [0.52, 0.28, 0.42], fog: [0.6, 0.8, 0.3, 0.41], plate: 0.5, black: 0.3 },
    rear: { tail: [0.44, 0.9, 0.72, 0.87, 0.72, 0.88], plate: 0.6, exhaust: [-0.5], bumper: 0.46, black: 0.45 },
    antenna: 'rod',
  },
  sedan: {
    body: {
      top: [[0, 0.9], [0.18, 0.98], [0.9, 1.0], [1.3, 1.0], [2.6, 0.975], [3.3, 0.955], [3.9, 0.88], [4.4, 0.785], [4.65, 0.7]],
      bot: [[0, 0.33], [0.35, 0.27], [0.9, 0.2], [3.75, 0.19], [4.3, 0.21], [4.65, 0.26]],
      rt: [[0, 0.06], [1.0, 0.07], [1.4, 0.05], [3.1, 0.05], [3.6, 0.1], [4.3, 0.08], [4.65, 0.05]],
      pt: [[0, 2.8], [3.2, 2.5], [3.7, 3.0], [4.65, 2.5]],
      rb: 0.09, taper: [[0, 0.93], [1.0, 1], [3.6, 1], [4.65, 0.97]],
      ends: { bf: 0.66, nf: 3.0, br: 0.5, nr: 3.3, cap: 0.27 },
      iT: 0.045, iB: 0.05, vm: 0.42,
      lean: { f: 0.08, yf: 0.48, hf: 0.26, r: 0.04, yr: 0.62, hr: 0.3 },
      arch: { r: 0.395, f1: 0.012, f2: 0.012 },
    },
    gh: {
      top: [[0.72, 0.92], [1.05, 1.18], [1.5, 1.39], [2.2, 1.445], [2.75, 1.425], [3.08, 1.22], [3.44, 0.93]],
      tipF: 3.44, tipR: 0.72, bf: 0.32, nf: 4, br: 0.4, nr: 3, tumble: 0.33, rt: 0.085, pt: 2.7,
      roof: [1.5, 2.72], band: 0.06, aW: 0.085, b: [2.18], bw: 0.085, c: [1.14, 1.5], cW: 0.09, chrome: true,
    },
    doors: { f: 3.16, r: 1.36, handles: [2.32, 1.42] },
    tire: 0.215, rimR: 0.215, seats: 4, seatY: -0.4, trim: 0x8a7c66,
    front: { head: [0.42, 0.88, 0.57, 0.65, 0.62, 0.71], drl: 'top', grille: [0.4, 0.47, 0.64], lower: [0.5, 0.27, 0.38], fog: [0.6, 0.82, 0.29, 0.38], plate: 0.42, chrome: true },
    rear: { tail: [0.36, 0.92, 0.7, 0.83, 0.71, 0.84], plate: 0.56, exhaust: [-0.52, 0.52], bumper: 0.44, bar: true },
    antenna: 'fin',
  },
  suv: {
    body: {
      top: [[0, 1.05], [0.15, 1.12], [0.8, 1.14], [2.3, 1.11], [3.1, 1.085], [3.65, 1.03], [4.15, 0.95], [4.43, 0.86]],
      bot: [[0, 0.41], [0.35, 0.33], [0.86, 0.27], [3.56, 0.26], [4.1, 0.28], [4.43, 0.33]],
      rt: [[0, 0.07], [0.5, 0.06], [2.9, 0.055], [3.4, 0.11], [4.1, 0.09], [4.43, 0.06]],
      pt: [[0, 2.8], [3.0, 2.6], [3.5, 3.2], [4.43, 2.6]],
      rb: 0.1, taper: [[0, 0.96], [0.9, 1], [3.5, 1], [4.43, 0.98]],
      ends: { bf: 0.58, nf: 3.2, br: 0.4, nr: 3.8, cap: 0.3 },
      iT: 0.045, iB: 0.045, vm: 0.4,
      lean: { f: 0.06, yf: 0.6, hf: 0.3, r: 0.03, yr: 0.7, hr: 0.35 },
      arch: { r: 0.445, f1: 0.014, f2: 0.016 },
    },
    gh: {
      top: [[0.08, 1.0], [0.26, 1.38], [0.55, 1.6], [1.5, 1.665], [2.5, 1.645], [2.92, 1.36], [3.26, 1.06]],
      tipF: 3.26, tipR: 0.08, bf: 0.32, nf: 4, br: 0.2, nr: 4.5, tumble: 0.24, rt: 0.09, pt: 2.8,
      roof: [0.5, 2.5], band: 0.065, aW: 0.09, b: [1.9], bw: 0.095, c: [0.62, 0.8], cW: 0.11, rearPanel: 0.26, privacy: true, rails: true,
    },
    doors: { f: 2.98, r: 1.1, handles: [2.04, 1.14] },
    tire: 0.235, rimR: 0.24, seats: 4, seatY: -0.4, trim: 0x2f3236, cladding: 0.4,
    front: { head: [0.46, 0.9, 0.7, 0.8, 0.73, 0.83], drl: 'ring', grille: [0.42, 0.56, 0.79], lower: [0.55, 0.36, 0.47], fog: [0.62, 0.84, 0.4, 0.5], plate: 0.515 },
    rear: { tail: [0.5, 0.93, 0.84, 0.97, 0.84, 0.99], plate: 0.74, exhaust: [-0.5], bumper: 0.6 },
    antenna: 'fin',
  },
  van: {
    body: {
      top: [[0, 1.1], [0.1, 1.17], [1.0, 1.19], [3.7, 1.17], [4.02, 1.15], [4.4, 1.07], [4.75, 0.97], [4.95, 0.88]],
      bot: [[0, 0.36], [0.4, 0.29], [0.92, 0.25], [4.0, 0.24], [4.6, 0.26], [4.95, 0.31]],
      rt: [[0, 0.07], [3.6, 0.05], [4.1, 0.12], [4.6, 0.1], [4.95, 0.07]],
      pt: [[0, 3.0], [3.8, 2.6], [4.95, 2.4]],
      rb: 0.09, taper: [[0, 0.985], [0.5, 1], [4.2, 1], [4.95, 0.97]],
      ends: { bf: 0.55, nf: 3.0, br: 0.2, nr: 5, cap: 0.34, capR: 0.55 },
      iT: 0.03, iB: 0.04, vm: 0.4,
      lean: { f: 0.05, yf: 0.6, hf: 0.35, r: 0.008, yr: 0.7, hr: 0.4 },
      arch: { r: 0.42, f1: 0.012, f2: 0.008 },
    },
    gh: {
      top: [[0.0, 1.1], [0.04, 1.8], [0.16, 1.93], [2.0, 1.95], [3.5, 1.93], [3.85, 1.68], [4.26, 1.12]],
      tipF: 4.26, tipR: 0.0, bf: 0.3, nf: 4, br: 0.13, nr: 6, tumble: 0.1, rt: 0.11, pt: 2.8,
      roof: [0.12, 3.5], band: 0.07, aW: 0.09, b: [], bw: 0.1, c: [3.02, 3.0], cW: 0.16, rearPanel: 0.2, openR: 2.95,
    },
    doors: { f: 3.95, r: 3.02, handles: [3.12], slide: 1.45 },
    tire: 0.215, rimR: 0.215, seats: 2, seatY: -0.36, trim: 0x3a3d41,
    front: { head: [0.5, 0.96, 0.72, 0.84, 0.76, 0.9], drl: 'bottom', grille: [0.46, 0.7, 0.81], lower: [0.62, 0.36, 0.52], fog: [0.68, 0.9, 0.38, 0.5], plate: 0.6, black: 0.56 },
    rear: { tail: [0.8, 0.97, 0.62, 1.0, 0.62, 1.0], plate: 0.78, exhaust: [], bumper: 0.5, black: 0.5 },
    antenna: 'rod',
  },
  sport: {
    body: {
      top: [[0, 0.8], [0.15, 0.89], [0.7, 0.93], [1.3, 0.93], [2.0, 0.9], [2.62, 0.875], [3.1, 0.845], [3.5, 0.815], [4.0, 0.7], [4.4, 0.57]],
      bot: [[0, 0.3], [0.3, 0.22], [0.9, 0.16], [3.5, 0.15], [4.1, 0.17], [4.4, 0.22]],
      rt: [[0, 0.06], [0.9, 0.07], [2.5, 0.05], [3.2, 0.065], [3.6, 0.065], [4.4, 0.05]],
      pt: [[0, 2.6], [4.4, 2.6]],
      rb: 0.08, taper: [[0, 0.95], [0.9, 1.0], [1.9, 0.955], [2.7, 0.95], [3.5, 0.985], [4.4, 0.95]],
      ends: { bf: 0.75, nf: 2.6, br: 0.5, nr: 3.2, cap: 0.24 },
      iT: 0.05, iB: 0.06, vm: 0.4,
      lean: { f: 0.1, yf: 0.38, hf: 0.2, r: 0.04, yr: 0.55, hr: 0.3 },
      arch: { r: 0.385, f1: 0.014, f2: 0.022, f2r: 0.036 },
    },
    gh: {
      top: [[0.42, 0.86], [0.9, 1.06], [1.5, 1.2], [1.95, 1.22], [2.35, 1.16], [2.6, 1.04], [2.98, 0.82]],
      tipF: 2.98, tipR: 0.42, bf: 0.4, nf: 3.2, br: 0.55, nr: 2.5, tumble: 0.42, rt: 0.08, pt: 2.6,
      roof: [1.45, 2.3], band: 0.045, aW: 0.06, b: [], bw: 0.08, c: [1.2, 1.55], cW: 0.08,
    },
    doors: { f: 2.72, r: 1.62, handles: [1.75] },
    tire: 0.255, rimR: 0.245, seats: 2, seatY: -0.47, seatU: 1.75, trim: 0x6e2a1c,
    front: { head: [0.5, 0.86, 0.45, 0.53, 0.55, 0.63], drl: 'top', grille: null, lower: [0.44, 0.2, 0.33], fog: [0.56, 0.84, 0.22, 0.33], plate: 0.42 },
    rear: { tail: [0.3, 0.9, 0.61, 0.71, 0.62, 0.72], plate: 0.48, exhaust: [-0.3, 0.3], bumper: 0.36, bar: true, spoiler: true, black: 0.36 },
  },
  xc40: {
    body: {
      top: [[0, 1.06], [0.12, 1.15], [0.55, 1.2], [0.95, 1.195], [1.25, 1.1], [2.3, 1.08], [3.1, 1.07], [3.6, 1.045], [4.1, 0.995], [4.34, 0.95], [4.43, 0.9]],
      bot: [[0, 0.41], [0.35, 0.33], [0.86, 0.27], [3.56, 0.26], [4.1, 0.28], [4.43, 0.33]],
      rt: [[0, 0.07], [0.5, 0.06], [2.9, 0.05], [3.4, 0.09], [4.1, 0.08], [4.43, 0.06]],
      pt: [[0, 2.8], [3.0, 2.6], [3.5, 3.4], [4.43, 2.8]],
      rb: 0.1, taper: [[0, 0.96], [0.9, 1], [3.5, 1], [4.43, 0.985]],
      ends: { bf: 0.52, nf: 3.4, br: 0.38, nr: 4.0, cap: 0.32 },
      iT: 0.045, iB: 0.045, vm: 0.4,
      lean: { f: 0.05, yf: 0.62, hf: 0.3, r: 0.025, yr: 0.7, hr: 0.4 }, scallop: 0.016,
      arch: { r: 0.445, f1: 0.012, f2: 0.016 },
    },
    gh: {
      top: [[0.1, 1.05], [0.3, 1.42], [0.52, 1.6], [1.4, 1.655], [2.5, 1.64], [2.9, 1.4], [3.3, 1.04]],
      tipF: 3.3, tipR: 0.1, bf: 0.32, nf: 4, br: 0.2, nr: 4.6, tumble: 0.24, rt: 0.085, pt: 2.8,
      roof: [0.48, 2.52], roofColor: 0x0c0d0e, band: 0.065, aW: 0.09, b: [1.92], bw: 0.095, c: [0.86, 0.66], cW: 0.12, rearPanel: 0.22, privacy: true, rails: true, spoiler: true,
    },
    doors: { f: 3.0, r: 1.12, handles: [2.06, 1.2] },
    tire: 0.235, rimR: 0.25, seats: 4, seatY: -0.4, trim: 0x3a3c40, cladding: 0.42,
    front: { plate: 0.5 },
    rear: { plate: 0.72, exhaust: [], bumper: 0.6 },
    antenna: 'fin',
  },
};

const pmark = (bufs) => bufs.map((b) => b.mark());
const pmirror = (bufs, m) => bufs.forEach((b, i) => b.mirror(m[i]));

// kentekenplaat: plat vlak met de textuur uit de atlas (welke plaat bepaalt de auto zelf)
function plateQuad(lights, detail, yc, z, front) {
  const hw = 0.26, hh = 0.055, sg = front ? 1 : -1, n = [0, 0, sg];
  const P = (x, y, u, v) => lights.v([x, y, z + sg * 0.004], n, { c: [1, 1, 1, 1], e: [u, v, 6] });
  const a = P(-hw * sg, yc - hh, 0, 0), b = P(hw * sg, yc - hh, 1, 0), c = P(hw * sg, yc + hh, 1, 1), d = P(-hw * sg, yc + hh, 0, 1);
  lights.quad(a, b, c, d);
  box(detail, 0.545, 0.125, 0.012, 0, yc, z - sg * 0.004, PLASTIC);
}

// rond of ovaal lapje binnen een rechthoekig stuk oppervlak R(u, v)
function disc(buf, R, uc, vc, ru, rv, style, off, n = 10) {
  patch(buf, (u, v) => { const a = u * Math.PI * 2; return R(uc + Math.cos(a) * ru * v, vc + Math.sin(a) * rv * v); }, n, 1, style, off);
}
const sub = (R, u0, u1, v0, v1) => (u, v) => R(lerp(u0, u1, u), lerp(v0, v1, v));

export function buildCar(key, t, lod) {
  if (key === 'tractor') return buildTractor(t, lod);
  const sp = SPECS[key], Lq = LODS[lod], { L, W, wheelR: R, wheelbase: wb } = t;
  const h = L / 2, B = sp.body, Gs = sp.gh;
  const U = (v) => fnOf(v, h);
  const N = (n) => Math.max(1, Math.round(n * Lq.patch));
  const paint = new Buf(), detail = new Buf(), glass = new Buf(), lights = new Buf();
  const ALL = [paint, detail, glass, lights];
  const sym = (fn) => { const m = pmark(ALL); fn(); pmirror(ALL, m); };

  // ================================================================ carrosserie
  const fTop = U(B.top), fBot = U(B.bot), fRt = U(B.rt), fPt = U(B.pt), fTaper = U(B.taper), fRb = U(B.rb);
  const E = B.ends, a0 = W / 2 - 0.02;
  const zf0 = h - E.bf, zr0 = -h + E.br;
  const sup = (q, n) => Math.pow(Math.max(0, 1 - Math.pow(clamp(q, 0, 1), n)), 1 / n);
  const half = (z) => a0 * fTaper(z) * (z > zf0 ? sup((z - zf0) / E.bf, E.nf) : 1) * (z < zr0 ? sup((zr0 - z) / E.br, E.nr) : 1);
  const thF = Math.acos(Math.pow(E.cap / (a0 * fTaper(h)), E.nf / 2)), thR = Math.acos(Math.pow((E.capR ?? E.cap) / (a0 * fTaper(-h)), E.nr / 2));
  const zEndF = zf0 + E.bf * Math.pow(Math.sin(thF), 2 / E.nf), zEndR = zr0 - E.br * Math.pow(Math.sin(thR), 2 / E.nr);
  const Ln = B.lean, LW = 0.55;
  // neus en kont: boven en onder de bumper wijkt het vlak iets terug (in zijaanzicht geen rechte wand)
  const warp = (x, y, z) => {
    const tf = (z - (zEndF - LW)) / LW;
    if (tf > 0) { const q = clamp((y - Ln.yf) / Ln.hf, -1.2, 1.25); z -= Ln.f * tf * tf * q * q * (q < 0 ? 0.6 : 1); }
    const tr = (zEndR + LW - z) / LW;
    if (tr > 0) { const q = clamp((y - Ln.yr) / Ln.hr, -1.2, 1.25); z += Ln.r * tr * tr * q * q * (q < 0 ? 0.6 : 1); }
    return [x, y, z];
  };
  // zijprofiel: schouder die naar de ruiten toe naar binnen loopt, een vouw eronder, een lichte holling en de dorpel
  const VC = 2 / 9, VL = 6 / 9, SC = B.scallop ?? 0.009;
  const prof = (v) => (v < VC ? 1 - B.iT * Math.pow(1 - v / VC, 1.25) : v < VL ? 1 - SC * Math.sin((Math.PI * (v - VC)) / (VL - VC)) : 1 - B.iB * ((v - VL) / (1 - VL)) ** 2);
  const arches = [
    { z: wb / 2, y: R, r: B.arch.r, f1: B.arch.f1, f2: B.arch.f2, xin: W / 2 - 0.46 },
    { z: -wb / 2, y: R, r: B.arch.r, f1: B.arch.f1, f2: B.arch.f2r ?? B.arch.f2, xin: W / 2 - 0.4 },
  ];
  const S = new Shell({ z0: zEndR, z1: zEndF, top: fTop, bot: fBot, half, rt: fRt, pt: fPt, rb: fRb, prof, arches, warp });
  for (const ar of arches) {
    for (const [k, sg] of [['dzF', 1], ['dzR', -1]]) {
      let dz = ar.r * 0.9;
      for (let i = 0; i < 8; i++) { const dy = S.sec(ar.z + sg * dz).yR - ar.y; dz = Math.sqrt(Math.max(1e-4, ar.r * ar.r - dy * dy)); }
      ar[k] = dz;
    }
  }
  // stations langs de lengte: dicht bij neus en kont en langs de wielkasten
  let zs = [];
  for (let k = 0; k <= Lq.nEnd; k++) {
    zs.push(zf0 + E.bf * Math.pow(Math.sin(thF * (k / Lq.nEnd)), 2 / E.nf));
    zs.push(zr0 - E.br * Math.pow(Math.sin(thR * (k / Lq.nEnd)), 2 / E.nr));
  }
  const nMid = Math.max(2, Math.ceil((zf0 - zr0) / Lq.dz));
  for (let k = 1; k < nMid; k++) zs.push(lerp(zr0, zf0, k / nMid));
  zs.sort((a, b) => a - b);
  zs = zs.filter((z, i) => i === 0 || z - zs[i - 1] > 1e-4);
  const stations = [];
  for (const z of zs) if (!arches.some((ar) => z > ar.z - ar.dzR - 0.03 && z < ar.z + ar.dzF + 0.03)) stations.push({ z, ord: 0, cut: null });
  for (const ar of arches) {
    ar.p0 = Math.acos(clamp(ar.dzF / ar.r, -1, 1)); ar.p1 = Math.acos(clamp(-ar.dzR / ar.r, -1, 1));
    for (let k = 0; k <= Lq.nArch; k++) {
      const ps = lerp(ar.p1, ar.p0, k / Lq.nArch), z = ar.z + ar.r * Math.cos(ps), yR = S.sec(z).yR;
      const lipN = [0, -Math.sin(ps), -Math.cos(ps)];
      if (k === 0) stations.push({ z, ord: 1, cut: null }, { z, ord: 2, cut: yR, lipN });
      else if (k === Lq.nArch) stations.push({ z, ord: 4, cut: yR, lipN }, { z, ord: 5, cut: null });
      else stations.push({ z, ord: 3, cut: Math.max(yR, ar.y + ar.r * Math.sin(ps)), lipN });
    }
  }
  stations.sort((a, b) => a.z - b.z || a.ord - b.ord);

  // ================================================================ kap met ruiten
  const zTipF = Gs.tipF - h, zTipR = Gs.tipR - h, zgf0 = zTipF - Gs.bf, zgr0 = zTipR + Gs.br;
  const gRaw = U(Gs.top);
  const gBot = (z) => fTop(z) - 0.035;
  const gTop = (z) => Math.max(gRaw(z), gBot(z) + 0.004);
  const gHalf = (z) => 0.955 * S.sec(z).aT * (z > zgf0 ? sup((z - zgf0) / Gs.bf, Gs.nf) : 1) * (z < zgr0 ? sup((zgr0 - z) / Gs.br, Gs.nr) : 1);
  const gProf = (v, c) => Math.max(0.25, 1 - ((1 - v) * (c.yS - c.bot) * Gs.tumble - 0.014 * 4 * v * (1 - v)) / c.a);
  const TH = 1.46;
  const G = new Shell({
    z0: zgr0 - Gs.br * Math.pow(Math.sin(TH), 2 / Gs.nr), z1: zgf0 + Gs.bf * Math.pow(Math.sin(TH), 2 / Gs.nf),
    top: gTop, bot: gBot, half: gHalf, rb: () => 0, prof: gProf, bottom: false, warp,
    rt: (z) => Gs.rt + ((Gs.rtW ?? 0.16) - Gs.rt) * sstep(Gs.roof[1] - h - 0.15, Gs.roof[1] - h + 0.3, z) + ((Gs.rtR ?? Gs.rt) - Gs.rt) * sstep(Gs.roof[0] - h + 0.1, Gs.roof[0] - h - 0.25, z),
    pt: (z) => Gs.pt + (2.3 - Gs.pt) * sstep(Gs.roof[1] - h - 0.15, Gs.roof[1] - h + 0.3, z),
  });
  let gz = [];
  for (let k = 0; k <= Lq.gEnd; k++) {
    gz.push(zgf0 + Gs.bf * Math.pow(Math.sin(TH * (k / Lq.gEnd)), 2 / Gs.nf));
    gz.push(zgr0 - Gs.br * Math.pow(Math.sin(TH * (k / Lq.gEnd)), 2 / Gs.nr));
  }
  const gMid = Math.max(2, Math.ceil((zgf0 - zgr0) / Lq.gdz));
  for (let k = 1; k < gMid; k++) gz.push(lerp(zgr0, zgf0, k / gMid));
  gz.push(Gs.roof[0] - h, Gs.roof[1] - h); // dakranden precies op een station
  gz.sort((a, b) => a - b);
  const gStations = gz.filter((z, i) => i === 0 || z - gz[i - 1] > 0.03 || Math.abs(z - (Gs.roof[0] - h)) < 1e-9 || Math.abs(z - (Gs.roof[1] - h)) < 1e-9).map((z) => ({ z, cut: null }));

  // opening van de kuip in het dek, binnen de omtrek van de ruiten
  const sOpen = S.sOfX(0, 0.9);
  const zOr = Gs.openR != null ? Gs.openR - h : zTipR + 0.66 * Gs.br + 0.04, zOf = zTipF - 0.62 * Gs.bf;
  const open = Lq.interior > 0;
  const info = S.emit(paint, stations, {
    nT: Lq.nT, nS: Lq.nS, nB: Lq.nB, sOpen, style: paintSt,
    skip: open ? (part, j, zm, sT) => part === 0 && zm > zOr && zm < zOf && sT[j + 1] <= sOpen + 1e-9 : null,
  });
  S.cap(paint, stations[stations.length - 1], Lq, info.sT, true, paintSt());
  S.cap(paint, stations[0], Lq, info.sT, false, paintSt());
  // werkelijke randen van de opening (op de stations)
  const openZ = [];
  for (let i = 0; i < stations.length - 1; i++) {
    const zm = (stations[i].z + stations[i + 1].z) / 2;
    if (stations[i + 1].z - stations[i].z > 1e-6 && zm > zOr && zm < zOf) { if (!openZ.length) openZ.push(stations[i].z); openZ.push(stations[i + 1].z); }
  }
  const zO0 = openZ[0], zO1 = openZ[openZ.length - 1];

  // ---- wielkasten: donkere binnenkant, binnenwand, de afgesneden einden van de dorpel en een stukje bodem
  for (const ar of arches) {
    const n = Lq.nArch, m = detail.mark(), ring = [];
    for (let k = 0; k <= n; k++) {
      const ps = lerp(ar.p1, ar.p0, k / n), z = ar.z + ar.r * Math.cos(ps);
      const y = k === 0 || k === n ? S.sec(z).yR : Math.max(S.sec(z).yR, ar.y + ar.r * Math.sin(ps));
      ring.push({ o: S.w3(S.sideX(z, y) - 0.02, y, z), i: S.w3(ar.xin, y, z), n: [0, -Math.sin(ps), -Math.cos(ps)], z });
    }
    for (let k = 0; k < n; k++) {
      const a = ring[k], b = ring[k + 1];
      const ia = detail.v(a.o, a.n, DARK), ib = detail.v(b.o, b.n, DARK), ic = detail.v(b.i, b.n, DARK), id = detail.v(a.i, a.n, DARK);
      detail.quad(ia, ib, ic, id);
    }
    const zA = ring[0].z, zB = ring[n].z, C = [ar.xin, ar.y, ar.z];
    const wall = ring.map((q) => q.i).concat([[ar.xin, fBot(zB), zB], [ar.xin, fBot(zA), zA]]);
    for (let k = 0; k < wall.length; k++) detail.flat(C, wall[k], wall[(k + 1) % wall.length], wall[(k + 1) % wall.length], DARK, [1, 0, 0]);
    for (const [zc, dir] of [[zA, 1], [zB, -1]]) {
      const c = S.sec(zc), Q = [ar.xin, c.yR, zc];
      let prev = S.P(zc, 2, 0);
      for (let k = 1; k <= 5; k++) {
        const p = S.P(zc, 2, k / 5 * 0.8);
        detail.flat(Q, prev, p, p, DARK, [0, 0, dir]);
        prev = p;
        if (p[0] < ar.xin) break;
      }
    }
    detail.mirror(m);
    detail.flat([-ar.xin, fBot(zA), zA], [ar.xin, fBot(zA), zA], [ar.xin, fBot(zB), zB], [-ar.xin, fBot(zB), zB], DARK, [0, -1, 0]);
  }

  // ---- ruiten: de hele kap is glas; dak en stijlen liggen er als lapjes overheen
  const zRr = Gs.roof[0] - h, zRf = Gs.roof[1] - h, bow = 0.07, bowR = 0.04;
  const zB0 = Gs.b.length ? Gs.b[Gs.b.length - 1] - h : (Gs.c[0] + Gs.c[1]) / 2 - h; // achter deze stijl: donkerder glas
  const aWind = 0.38, aSide = 0.5, aRear = Gs.privacy ? 0.8 : 0.52;
  const TINT = 0x16211f;
  const gStyle = (z, part, s) => {
    if (!Lq.glass) return GLASS_FAR;
    const a = part === 0 && z > zRf - 0.15 ? aWind : z > zB0 ? aSide : aRear;
    return st(TINT, 0.03, 0, a);
  };
  const OFF = 0.008;
  const roofBuf = Gs.roofColor ? detail : paint, roofSt = Gs.roofColor ? st(Gs.roofColor, 0.16, 0.25) : paintSt();
  if (Lq.glass) G.emit(glass, gStations, { nT: Lq.gT, nS: Lq.gS, nB: 0, style: gStyle });
  else {
    // eenvoudig model: het glas is ondoorzichtig en het dak (en bij de bestelbus de dichte zijwand) zit in de schil zelf,
    // zodat er op grote afstand geen twee vlakken vlak boven elkaar liggen
    const zPanel = Gs.rearPanel && Gs.rearPanel > Gs.roof[0] ? Math.min(Gs.c[0], Gs.c[1]) - h : -Infinity;
    const solid = (part, zm) => (part === 0 && zm > zRr && zm < zRf) || zm < zPanel;
    G.emit(detail, gStations, { nT: Lq.gT, nS: Lq.gS, nB: 0, style: gStyle, skip: (part, j, zm) => solid(part, zm) });
    G.emit(roofBuf, gStations, { nT: Lq.gT, nS: Lq.gS, nB: 0, style: (z) => (z < zPanel ? paintSt() : roofSt), skip: (part, j, zm) => !solid(part, zm) });
  }

  const gIn = Lq.glass ? { inner: INNER, innerBuf: detail } : {};
  const yBelt = (z) => fTop(z) - 0.012;
  const gSide = (z, f) => { const c = G.sec(z), y0 = Math.min(yBelt(z), c.yS - 1e-3); return G.side(z, lerp(y0, c.yS, f)); };
  const gH = (z) => Math.max(1e-3, G.sec(z).yS - yBelt(z));
  const fBand = (z, wdt) => clamp(1 - wdt / gH(z), 0, 1);
  const sBand = (z, wdt) => { const c = G.sec(z); return G.sOfX(z, clamp(1 - wdt / c.aT, 0, 1)); };
  const pilBuf = Gs.roofColor ? detail : paint, pilSt = roofSt; // A-stijl: zelfde kleur als het dak
  const zC = Math.max(Gs.c[0], Gs.c[1]) - h; // voor dit punt hoort de dakrand bij het dak, erachter bij de C-stijl
  // lapjes langs de lengte volgen dezelfde stations als het glas eronder (dicht bij de uiteinden, waar de vorm snel verandert)
  const zList = (z0, z1) => [z0, ...gStations.map((q) => q.z).filter((z) => z > z0 + 0.02 && z < z1 - 0.02), z1];
  const along = (buf, z0, z1, fn, nv, style, o = gIn) => { const zl = zList(z0, z1); patch(buf, (u, v) => fn(zl[Math.round(u * (zl.length - 1))], v, u), zl.length - 1, nv, style, OFF, o); };
  sym(() => {
    // dak
    if (Lq.glass) patch(roofBuf, (u, v) => G.P(lerp(zRr + bowR * v * v, zRf - bow * v * v, u), 0, v), N(12), N(7), roofSt, OFF, gIn);
    // A-stijl: rand van de voorruit plus de strook erlangs op de zijkant
    along(pilBuf, zRf - bow - 0.02, G.z1, (z, v) => G.P(z, 0, lerp(sBand(z, Gs.aW), 1, v)), N(2), pilSt);
    along(pilBuf, zC, G.z1, (z, v) => gSide(z, lerp(1, fBand(z, Gs.band), v)), 1, pilSt);
    // dakrand achter en C-stijl: altijd in de lak
    along(paint, G.z0, zC, (z, v) => gSide(z, lerp(1, fBand(z, Gs.band), v)), 1, paintSt());
    {
      const zl = zList(G.z0, Math.max(Gs.c[0], Gs.c[1]) - h), n = zl.length - 1;
      // van de punt achter tot aan de achterrand van de zijruit; die rand loopt schuin (c[0] onder, c[1] boven)
      patch(paint, (u, v) => { const ze = lerp(Gs.c[0], Gs.c[1], v) - h, z = Math.min(zl[Math.round(u * n)], ze); return gSide(z, Math.min(1, v * (fBand(z, Gs.band) + 0.03))); }, n, N(6), paintSt(), OFF, gIn);
    }
    // rand van de achterruit
    along(paint, G.z0, zRr + bowR + 0.02, (z, v) => G.P(z, 0, lerp(sBand(z, Gs.cW), 1, v)), N(2), paintSt());
    // B-stijlen (glanzend zwart)
    for (const ub of Gs.b) patch(detail, (u, v) => { const z = ub - h + (u - 0.5) * Gs.bw; return gSide(z, v * (fBand(z, Gs.band) + 0.02)); }, 1, N(4), BLACK, OFF, gIn);
    // paneel onder de achterruit (achterklep)
    if (Gs.rearPanel && (Lq.glass || Gs.rearPanel <= Gs.roof[0])) along(paint, G.z0, Gs.rearPanel - h, (z, v) => G.P(z, 0, v * sBand(z, Gs.cW)), N(5), paintSt());
    // sierlijst onder de zijruiten
    if (lod < 2) patch(detail, (u, v) => { const z = lerp(Gs.c[0] - h, zTipF - Gs.bf - 0.1, u); return gSide(z, v * 0.025 / gH(z)); }, N(14), 1, Gs.chrome ? CHROME : RUBBER, OFF + 0.002);
  });

  // ================================================================ interieur
  const yBeltIn = (z) => S.P(z, 0, sOpen)[1];
  const seatY = fTop(0) + sp.seatY, yFloor = Math.max(fBot(0) + 0.1, seatY - 0.27);
  const xw = S.P(0, 0, sOpen)[0] - 0.02;
  const TRIM = st(sp.trim, 0.85), TRIM2 = st(sp.trim, 0.7), FLOOR = st(0x141516, 1), CARD = st(0x26272a, 0.9), DASH = st(0x151617, 0.7);
  if (open) {
    // kuip: wanden langs de rand van de opening, vloer, en een schot voor en achter
    sym(() => {
      for (let i = 0; i < openZ.length - 1; i++) {
        const a = S.P(openZ[i], 0, sOpen), b = S.P(openZ[i + 1], 0, sOpen);
        detail.flat([a[0], a[1], a[2]], [b[0], b[1], b[2]], [b[0] - 0.03, yFloor, b[2]], [a[0] - 0.03, yFloor, a[2]], CARD, [-1, 0, 0]);
        detail.flat([a[0] - 0.03, yFloor, a[2]], [b[0] - 0.03, yFloor, b[2]], [0, yFloor, b[2]], [0, yFloor, a[2]], FLOOR, [0, 1, 0]);
      }
      for (const [z, dir] of [[zO0, 1], [zO1, -1]]) {
        const e = S.P(z, 0, sOpen);
        detail.flat([0, yFloor, z], [e[0], yFloor, z], [e[0], e[1], z], [0, e[1] + 0.01, z], CARD, [0, 0, dir]);
      }
    });
    // zwarte strook onder de voorruit (ruitenwisserbak) en de hoedenplank achter
    const zEdgeF = (xf) => zgf0 + Gs.bf * sup(xf / 0.955, Gs.nf) + 0.02;
    const zEdgeR = (xf) => zgr0 - Gs.br * sup(xf / 0.955, Gs.nr) - 0.03;
    sym(() => {
      patch(detail, (u, v) => { const xf = u * 0.94; const z = lerp(zO1 - 0.01, zEdgeF(xf), v); return S.P(z, 0, S.sOfX(z, xf)); }, N(8), N(3), st(0x0c0d0e, 0.85), 0.004);
      patch(detail, (u, v) => { const xf = u * 0.94; const z = lerp(zEdgeR(xf), zO0 + 0.01, v); return S.P(z, 0, S.sOfX(z, xf)); }, N(8), N(2), st(0x121314, 0.9), 0.004);
    });
    const hi = Lq.interior > 1;
    // dashboard met instrumentenkap, middenconsole
    const yD = yBeltIn(zO1);
    (hi ? softBox : box)(detail, xw * 2 - 0.02, 0.3, 0.3, 0, yD - 0.17, zO1 - 0.14, DASH, hi ? 0.06 : 0);
    if (hi) {
      softBox(detail, 0.36, 0.1, 0.2, xw * 0.5, yD - 0.02, zO1 - 0.2, DASH, 0.04);
      softBox(detail, 0.24, 0.16, 0.03, 0, yD - 0.06, zO1 - 0.3, st(0x05070a, 0.15, 0.2), 0.01, -0.25); // scherm
      box(detail, 0.2, 0.2, zO1 - 0.3 - (zO0 + 0.5), 0, seatY - 0.02, (zO1 - 0.3 + zO0 + 0.5) / 2, st(0x1b1c1e, 0.8));
      // binnenspiegel
      const zm = zRf - 0.02;
      box(detail, 0.2, 0.06, 0.02, 0, G.deckY(zm, 0) - 0.09, zm - 0.03, st(0x111213, 0.5));
    }
    steeringWheel(detail, xw * 0.5, yD - 0.1, zO1 - 0.38, hi ? 0 : 1);
    // stoelen
    const zSeat = sp.seatU != null ? sp.seatU - h : (Gs.b[0] ?? Gs.c[1]) - h + 0.13;
    const so = { style: TRIM, style2: TRIM2, lod: hi ? 0 : 1, back: sp.seatY < -0.45 ? 0.5 : 0.58 };
    seat(detail, xw * 0.5, seatY, zSeat, so);
    seat(detail, -xw * 0.5, seatY, zSeat, so);
    if (sp.seats > 2) {
      const zr = Math.max(zO0 + 0.42, zSeat - 0.86);
      seat(detail, 0, seatY + 0.02, zr, { ...so, w: xw * 2 - 0.1, head: false });
      for (const sx of [-1, 1]) (hi ? softBox : box)(detail, 0.25, 0.17, 0.1, sx * xw * 0.5, seatY + 0.7, zr - 0.19, TRIM, hi ? 0.035 : 0, -0.2);
    } else if (key === 'van') {
      // tussenschot achter de stoelen
      box(detail, xw * 2, 1.2, 0.04, 0, yFloor + 0.6, zSeat - 0.3, st(0x9a9c9e, 0.7));
    }
  }

  // ================================================================ naden, grepen, spiegels
  const D = sp.doors, zDf = D.f - h, zDr = D.r - h;
  const side = (z, y) => S.side(z, y);
  const ySill = (z) => fBot(z) + fRb(z) + 0.03;
  if (lod < 2) {
    sym(() => {
      const yb = (z) => S.sec(z).yS - 0.005;
      const seam = (pts) => linePatch(detail, side, pts, 0.007, SEAM, 0.003);
      const vline = (z, n = lod === 0 ? 12 : 6) => Array.from({ length: n + 1 }, (_, k) => [z, lerp(yb(z), ySill(z), k / n)]);
      // voorportier: voorrand, dorpel, achterrand (B-stijl)
      seam(vline(zDf));
      const zBp = Gs.b.length ? Gs.b[0] - h - 0.02 : null;
      if (zBp != null) seam(vline(zBp));
      // achterrand van het laatste portier loopt langs de wielkast naar de dorpel
      const ar = arches[1], rr = ar.r + 0.075;
      if (zDr > ar.z + 0.1 && zDr < ar.z + rr) {
        const a0 = Math.acos(clamp((zDr - ar.z) / rr, -1, 1)), pts = [[zDr, yb(zDr)]];
        for (let k = 0; k <= 6; k++) { const a = lerp(a0, 0.12, k / 6); pts.push([ar.z + rr * Math.cos(a), Math.max(ySill(zDr), ar.y + rr * Math.sin(a))]); }
        pts.push([ar.z + rr * Math.cos(0.12), ySill(zDr)]);
        seam(pts);
        seam(Array.from({ length: 9 }, (_, k) => { const z = lerp(ar.z + rr * Math.cos(0.12), zDf, k / 8); return [z, ySill(z)]; }));
      } else {
        seam(vline(zDr));
        seam(Array.from({ length: 9 }, (_, k) => { const z = lerp(zDr, zDf, k / 8); return [z, ySill(z)]; }));
      }
      if (D.slide) seam(vline(D.slide - h));
      // motorkap: naad langs de rand en over de neus
      if (lod === 0) {
        const hx = 0.84, zN = zEndF - 0.1, pts = [];
        const zH0 = zTipF - 0.32;
        for (let k = 0; k <= 8; k++) { const z = lerp(zH0, zN - 0.3, k / 8); pts.push([z, hx * S.sec(z).aT]); }
        for (let k = 1; k <= 8; k++) { const q = k / 8; const z = lerp(zN - 0.3, zN, Math.sin(q * HALF_PI)); pts.push([z, hx * S.sec(zN - 0.3).aT * Math.cos(q * HALF_PI)]); }
        linePatch(detail, (z, x) => S.deck(z, x), pts, 0.007, SEAM, 0.003);
      }
      // deurgrepen in de lak
      for (const uh of D.handles) {
        const z = uh - h, y = S.sec(z).yS - 0.1, p = side(z, y);
        softBox(paint, 0.03, 0.028, 0.15, p[0] + 0.006, y, z, paintSt(), 0.012);
      }
    });
  }
  // buitenspiegels: voet op het portier, kap in de lak (of in de dakkleur) en het glas naar achteren
  sym(() => {
    const zM = zTipF - Gs.bf - (Gs.mirror ?? 0.12), yM = fTop(zM) + 0.065, p = side(zM, fTop(zM) - 0.03);
    const capBuf = Gs.roofColor ? detail : paint, capSt = Gs.roofColor ? st(Gs.roofColor, 0.16, 0.25) : paintSt();
    if (lod === 2) { box(paint, 0.16, 0.1, 0.07, p[0] + 0.09, yM, zM, paintSt()); return; }
    box(detail, 0.1, 0.03, 0.06, p[0] + 0.02, yM - 0.03, zM + 0.005, PLASTIC, 0, 0, 0.3);
    softBox(capBuf, 0.19, 0.115, 0.08, p[0] + 0.115, yM + 0.005, zM, capSt, 0.036, 0, -0.14);
    const mx = p[0] + 0.115, c = Math.cos(-0.14), sn = Math.sin(-0.14);
    patch(detail, (u, v) => { const lx = (u - 0.5) * 0.16, lz = -0.0405; return [mx + lx * c + lz * sn, yM - 0.04 + v * 0.09, zM - lx * sn + lz * c]; }, 1, 1, st(0xcfd6dc, 0.04, 1), 0, { flip: true });
  });

  // ================================================================ onderkant in zwart kunststof (SUV), bumpers, lampen
  const wf = (w0, w1, ya0, ya1, yb0 = ya0, yb1 = ya1) => (u, v) => S.wrap('f', lerp(w0, w1, u), lerp(lerp(ya0, yb0, u), lerp(ya1, yb1, u), v));
  const wr = (w0, w1, ya0, ya1, yb0 = ya0, yb1 = ya1) => (u, v) => S.wrap('r', lerp(w0, w1, u), lerp(lerp(ya0, yb0, u), lerp(ya1, yb1, u), v));
  const yLow = (z) => fBot(z) + 0.035;
  const cladSide = (yTop) => {
    // dorpels en wielkastranden in zwart kunststof
    const aF = arches[0], aR = arches[1];
    sym(() => {
      patch(detail, (u, v) => { const z = lerp(aR.z + aR.dzF - 0.02, aF.z - aF.dzR + 0.02, u); return side(z, lerp(yLow(z), yTop, v)); }, N(10), N(2), PLASTIC, 0.005);
      for (const ar of arches) {
        patch(detail, (u, v) => {
          const ps = lerp(ar.p1 + 0.02, ar.p0 - 0.02, u), r = ar.r + v * 0.085, z = ar.z + r * Math.cos(ps);
          return side(z, Math.max(yLow(z), ar.y + r * Math.sin(ps)));
        }, N(16), N(2), PLASTIC, 0.006);
      }
    });
  };
  const F = sp.front, Rs = sp.rear;
  const wEnd = (end, z) => { const tab = S.outline(end); let k = 0; while (k < tab.length - 1 && (end === 'f' ? tab[k][1] > z : tab[k][1] < z)) k++; return tab[k][0]; };
  const wArchF = wEnd('f', arches[0].z + arches[0].dzF), wArchR = wEnd('r', arches[1].z - arches[1].dzR);
  if (sp.cladding) {
    cladSide(sp.cladding);
    // onderrand van de bumpers
    patch(detail, wf(-wArchF, wArchF, yLow(zEndF) + 0.02, F.black ?? sp.cladding + 0.06), N(26), N(2), PLASTIC, 0.005);
    patch(detail, wr(-wArchR, wArchR, yLow(zEndR) + 0.03, Rs.bumper), N(22), N(2), PLASTIC, 0.005);
  } else {
    if (F.black) patch(detail, wf(-wArchF, wArchF, yLow(zEndF) + 0.02, F.black), N(26), N(2), PLASTIC, 0.005);
    if (Rs.black) patch(detail, wr(-wArchR, wArchR, yLow(zEndR) + 0.03, Rs.black), N(22), N(2), PLASTIC, 0.005);
  }

  const lensOn = Lq.glass, LENS = st(0xe8f0f6, 0.03, 0, 0.1);
  if (key === 'xc40') xc40Extras();
  else {
    // ---- voorkant
    const [hw0, hw1, ha0, ha1, hb0, hb1] = F.head;
    const HR = wf(hw0, hw1, ha0, ha1, hb0, hb1);
    sym(() => {
      patch(detail, HR, N(7), N(3), st(0x101214, 0.18, 0.75), 0.004);
      if (lod < 2) {
        // lens met chromen ring, dagrijlicht en knipperlicht
        disc(detail, HR, 0.3, 0.52, 0.2, 0.42, CHROME, 0.006, N(12));
        disc(lights, HR, 0.3, 0.52, 0.15, 0.32, lamp(WARM, 0), 0.008, N(12));
        if (lod === 0) { disc(detail, HR, 0.68, 0.52, 0.13, 0.3, CHROME, 0.006, 10); disc(lights, HR, 0.68, 0.52, 0.09, 0.2, lamp(WARM, 0), 0.008, 10); }
        if (F.drl === 'bottom') patch(lights, sub(HR, 0.04, 0.96, 0.04, 0.16), N(6), 1, lamp(WHITE, 1), 0.008);
        else if (F.drl === 'top') patch(lights, sub(HR, 0.04, 0.96, 0.84, 0.96), N(6), 1, lamp(WHITE, 1), 0.008);
        else { patch(lights, sub(HR, 0.03, 0.97, 0.86, 0.97), N(6), 1, lamp(WHITE, 1), 0.008); patch(lights, sub(HR, 0.03, 0.97, 0.03, 0.14), N(6), 1, lamp(WHITE, 1), 0.008); }
        patch(lights, sub(HR, 0.86, 0.98, 0.25, 0.75), 1, 1, lamp(AMBER, 5), 0.008);
        if (lensOn) patch(glass, HR, N(7), N(3), LENS, 0.013);
      } else patch(lights, sub(HR, 0.1, 0.9, 0.2, 0.8), 2, 1, lamp(WARM, 0), 0.007);
      // mistlamp of luchthapper in de hoek van de bumper
      if (F.fog) {
        const FR = wf(F.fog[0], F.fog[1], F.fog[2], F.fog[3]);
        patch(detail, FR, N(4), N(2), st(0x0b0c0d, 0.6, 0.1), 0.004);
        if (lod < 2) { const ar = (F.fog[1] - F.fog[0]) / (F.fog[3] - F.fog[2]); disc(detail, FR, 0.5, 0.5, 0.36 / ar, 0.36, CHROME, 0.006, 12); disc(lights, FR, 0.5, 0.5, 0.27 / ar, 0.27, lamp(WHITE, 1), 0.008, 12); }
      }
    });
    if (F.grille) {
      const [gw, gy0, gy1] = F.grille, GR = wf(-gw, gw, gy0, gy1);
      patch(detail, GR, N(10), N(3), st(0x08090a, 0.5, 0.3), 0.004);
      if (lod < 2) {
        const nb = lod === 0 ? 4 : 2;
        for (let k = 1; k <= nb; k++) { const v = k / (nb + 1); patch(detail, sub(GR, 0.02, 0.98, v - 0.05, v + 0.05), N(10), 1, F.chrome ? CHROME : st(0x2a2c2f, 0.35, 0.6), 0.007); }
        if (F.chrome) { patch(detail, sub(GR, 0, 1, 0.93, 1.02), N(10), 1, CHROME, 0.008); patch(detail, sub(GR, 0, 1, -0.02, 0.07), N(10), 1, CHROME, 0.008); }
        disc(detail, GR, 0.5, 0.5, 0.05, 0.05 * (2 * gw) / (gy1 - gy0), CHROME, 0.011, 12); // embleem
      }
    }
    if (F.lower) {
      const [lw, ly0, ly1] = F.lower, LR = wf(-lw, lw, ly0, ly1);
      patch(detail, LR, N(10), N(2), st(0x070808, 0.7, 0.1), 0.004);
      if (lod === 0) for (const v of [0.3, 0.62]) patch(detail, sub(LR, 0.03, 0.97, v - 0.06, v + 0.06), N(10), 1, st(0x1c1d1f, 0.6, 0.2), 0.007);
    }
    // ---- achterkant
    const [tw0, tw1, ta0, ta1, tb0, tb1] = Rs.tail;
    const TR = wr(tw0, tw1, ta0, ta1, tb0, tb1);
    sym(() => {
      patch(detail, TR, N(8), N(3), st(0x3a0707, 0.12, 0.3), 0.004); // donkerrode lens
      if (lod < 2) {
        patch(lights, sub(TR, 0.04, 0.96, 0.72, 0.9), N(6), 1, lamp(RED, 2), 0.007);
        patch(lights, sub(TR, 0.04, 0.96, 0.1, 0.28), N(6), 1, lamp(RED, 2), 0.007);
        patch(lights, sub(TR, 0.44, 0.96, 0.37, 0.63), N(4), 1, lamp(BRAKE, 3), 0.007);
        patch(lights, sub(TR, 0.23, 0.41, 0.37, 0.63), 1, 1, lamp(AMBER, 5), 0.007);
        patch(lights, sub(TR, 0.04, 0.2, 0.37, 0.63), 1, 1, lamp(0xe8e8e8, 4), 0.007);
        if (lensOn) patch(glass, TR, N(8), N(3), st(0xff2a2a, 0.03, 0, 0.14), 0.012);
      } else patch(lights, sub(TR, 0.05, 0.95, 0.15, 0.85), 2, 1, lamp(RED, 3), 0.006);
      // reflector laag in de bumper
      if (lod === 0) patch(lights, wr(0.5, 0.74, Rs.bumper - 0.07, Rs.bumper - 0.035), 2, 1, lamp(0x8a0a0a, 7), 0.006);
    });
    if (Rs.bar && lod < 2) patch(lights, wr(-tw0, tw0, lerp(ta0, ta1, 0.42), lerp(ta0, ta1, 0.62)), N(8), 1, lamp(RED, 2), 0.006);
    // derde remlicht boven in de achterruit
    if (lod < 2) patch(lights, (u, v) => G.deck(zRr - 0.006 - v * 0.028, (u - 0.5) * 0.36), 4, 1, lamp(BRAKE, 3), OFF + 0.004);
    if (Rs.spoiler) {
      // spoilerrand op de achterklep
      sym(() => patch(paint, (u, v) => { const x = u * S.sec(zEndR + 0.18).aT * 0.9; const p = S.deck(zEndR + 0.2 - v * 0.16 - 0.1 * u * u, x); return [p[0], p[1] + 0.035 * Math.sin(v * Math.PI * 0.75), p[2]]; }, N(8), N(3), paintSt(), 0.004));
    }
  }
  // kentekens
  plateQuad(lights, detail, F.plate, S.wrap('f', 0, F.plate)[2] + 0.014, true);
  plateQuad(lights, detail, Rs.plate, S.wrap('r', 0, Rs.plate)[2] - 0.014, false);
  // uitlaat
  for (const x of Rs.exhaust || []) {
    const z = zEndR + 0.03, y = fBot(zEndR + 0.1) + 0.045;
    cyl(detail, 0.038, 0.038, 0.14, lod === 0 ? 10 : 6, x, y, z, CHROME, HALF_PI, 0, 0, true);
    cyl(detail, 0.032, 0.032, 0.02, 6, x, y, z + 0.03, DARK, HALF_PI);
  }
  // ruitenwissers en antenne
  if (lod === 0) {
    for (const [x0, x1] of [[0.62, 0.04], [-0.1, -0.68]]) {
      const pts = [];
      for (let k = 0; k <= 6; k++) { const xf = lerp(x0, x1, k / 6); const zb = zgf0 + Gs.bf * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(xf), Gs.nf)), 1 / Gs.nf); pts.push([zb - 0.1 - 0.03 * (k / 6), xf * G.sec(zb - 0.1).aT]); }
      linePatch(detail, (z, x) => G.deck(z, x), pts, 0.022, RUBBER, 0.014);
    }
  }
  if (sp.antenna === 'fin' && lod < 2) {
    const z = zRr + 0.22, y = G.deckY(z, 0) + OFF;
    const g = new THREE.ConeGeometry(0.035, 0.16, 6); g.rotateX(-1.25); g.scale(0.55, 1, 1);
    (Gs.roofColor ? detail : paint).geo(g, Gs.roofColor ? st(Gs.roofColor, 0.2, 0.2) : paintSt(), mat4(0, y + 0.02, z));
  } else if (sp.antenna === 'rod' && lod < 2) {
    const z = zRr + 0.18, y = G.deckY(z, 0);
    cyl(detail, 0.004, 0.006, 0.34, 4, 0, y + 0.15, z - 0.07, PLASTIC, -0.45);
    cyl(detail, 0.014, 0.018, 0.03, 6, 0, y + 0.015, z, PLASTIC);
  }
  // dakrails
  if (Gs.rails && lod < 2) {
    sym(() => {
      const zA = zRr + 0.12, zB = zRf - 0.3, n = lod === 0 ? 8 : 4, RAIL = key === 'xc40' ? st(0xbfc3c7, 0.3, 1) : st(0x1a1b1d, 0.5, 0.4);
      const at = (k) => { const z = lerp(zA, zB, k / n), p = G.P(z, 0, 0.8); const lift = 0.045 * Math.sin(Math.min(1, Math.min(k, n - k) / 1) * HALF_PI); return [p[0], p[1] + OFF + lift, p[2]]; };
      for (let k = 0; k < n; k++) {
        const a = at(k), b = at(k + 1), wv = 0.016, hv = 0.014;
        const q = (p, dx, dy) => [p[0] + dx, p[1] + dy, p[2]];
        detail.flat(q(a, -wv, hv), q(b, -wv, hv), q(b, wv, hv), q(a, wv, hv), RAIL, [0, 1, 0]);
        detail.flat(q(a, wv, hv), q(b, wv, hv), q(b, wv, -hv), q(a, wv, -hv), RAIL, [1, 0, 0]);
        detail.flat(q(a, -wv, -hv), q(b, -wv, -hv), q(b, -wv, hv), q(a, -wv, hv), RAIL, [-1, 0, 0]);
      }
    });
  }

  // ================================================================ alleen de Volvo XC40
  function xc40Extras() {
    const GLOSS = st(0x0a0b0c, 0.14, 0.4);
    // grille: zwart vlak met chromen lijst, fijne staafjes, de schuine streep en het ronde embleem
    const gw = 0.43, gy0 = 0.6, gy1 = 0.835, GR = wf(-gw, gw, gy0, gy1);
    patch(detail, GR, N(12), N(4), st(0x060707, 0.45, 0.4), 0.004);
    if (lod < 2) {
      for (const [v0, v1] of [[-0.03, 0.05], [0.95, 1.03]]) patch(detail, sub(GR, -0.01, 1.01, v0, v1), N(12), 1, CHROME, 0.008);
      for (const [u0, u1] of [[-0.012, 0.012], [0.988, 1.012]]) patch(detail, sub(GR, u0, u1, 0, 1), 1, N(3), CHROME, 0.008);
      const nb = lod === 0 ? 15 : 7;
      for (let k = 1; k <= nb; k++) { const u = k / (nb + 1); patch(detail, sub(GR, u - 0.008, u + 0.008, 0.08, 0.92), 1, 2, st(0x3a3d41, 0.3, 0.9), 0.006); }
      // schuine streep van linksonder naar rechtsboven (gezien vanaf de voorkant)
      patch(detail, (u, v) => GR(lerp(0.06, 0.94, u), lerp(0.14, 0.86, u) + (v - 0.5) * 0.11), N(10), 1, CHROME, 0.011);
      const asp = (2 * gw) / (gy1 - gy0);
      patch(detail, (u, v) => { const a = u * Math.PI * 2, r = lerp(0.062, 0.085, v); return GR(0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r * asp); }, 16, 1, CHROME, 0.014);
      disc(detail, GR, 0.5, 0.5, 0.062, 0.062 * asp, st(0x101214, 0.3, 0.5), 0.013, 12);
      patch(detail, (u, v) => GR(lerp(0.44, 0.56, u), 0.5 + (v - 0.5) * 0.16), 1, 1, CHROME, 0.0145); // naam op het embleem
      patch(detail, (u, v) => GR(lerp(0.565, 0.61, u), lerp(0.62, 0.78, u) + (v - 0.5) * 0.09), 1, 1, CHROME, 0.014); // pijl
    }
    sym(() => {
      // koplamp met 'Thor's hammer': liggende T als dagrijlicht
      const HR = wf(0.47, 0.93, 0.755, 0.86, 0.79, 0.885);
      patch(detail, HR, N(8), N(3), st(0x0d0f11, 0.16, 0.8), 0.004);
      if (lod < 2) {
        // de hamer: liggende steel met een staande kop
        patch(lights, sub(HR, 0.04, 0.66, 0.42, 0.6), N(6), 1, lamp(WHITE, 1), 0.008);
        patch(lights, sub(HR, 0.6, 0.69, 0.07, 0.95), 1, 2, lamp(WHITE, 1), 0.008);
        // lenzen boven en onder de steel en één aan de buitenkant
        for (const vc of [0.2, 0.82]) disc(lights, HR, 0.3, vc, 0.09, 0.13, lamp(WARM, 0), 0.007, 8);
        disc(lights, HR, 0.82, 0.5, 0.075, 0.26, lamp(WARM, 0), 0.007, 10);
        patch(lights, sub(HR, 0.92, 0.99, 0.2, 0.8), 1, 1, lamp(AMBER, 5), 0.008);
        if (lensOn) patch(glass, HR, N(8), N(3), LENS, 0.013);
      } else patch(lights, sub(HR, 0.1, 0.9, 0.3, 0.7), 2, 1, lamp(WHITE, 1), 0.007);
      // luchtinlaat met mistlamp in de hoek van de bumper
      const FR = wf(0.56, 0.88, 0.47, 0.57);
      patch(detail, FR, N(4), N(2), st(0x080909, 0.6, 0.2), 0.008);
      if (lod < 2) patch(lights, sub(FR, 0.25, 0.75, 0.3, 0.7), 2, 1, lamp(WHITE, 1), 0.011);
      // achterlicht: hoog en verticaal langs de achterste stijl, met een voet naar binnen op de klep
      const zT0 = G.z0 + 0.012, zT1 = zRr + bowR - 0.04;
      patch(lights, (u, v) => { const z = lerp(zT0, zT1, u); return G.P(z, 0, lerp(sBand(z, 0.1), 0.985, v)); }, N(8), N(2), lamp(0xb40e0e, 2), OFF + 0.004);
      if (lod < 2) patch(lights, (u, v) => { const z = lerp(zT0 + 0.02, zT1 - 0.02, u); return G.P(z, 0, lerp(sBand(z, 0.07), sBand(z, 0.035), v)); }, N(8), 1, lamp(BRAKE, 3), OFF + 0.006);
      const TR = wr(0.36, 0.9, 0.86, 0.985);
      patch(lights, TR, N(6), N(2), lamp(0xb40e0e, 2), 0.006);
      if (lod < 2) {
        patch(lights, sub(TR, 0.06, 0.94, 0.34, 0.68), N(4), 1, lamp(BRAKE, 3), 0.008);
        patch(lights, sub(TR, 0.78, 0.96, 0.06, 0.26), 1, 1, lamp(AMBER, 5), 0.008);
        patch(lights, wr(0.3, 0.46, 0.5, 0.535), 2, 1, lamp(0xe8e8e8, 4), 0.008);
        patch(lights, wr(0.5, 0.74, 0.5, 0.535), 2, 1, lamp(0x8a0a0a, 7), 0.008);
      }
    });
    // zilveren beschermplaat onder in de bumpers, chromen strip en de naam op de klep
    if (lod < 2) {
      patch(detail, wf(-0.5, 0.5, yLow(zEndF) + 0.025, 0.42), N(8), 1, st(0xaeb2b6, 0.4, 0.9), 0.008);
      patch(detail, wr(-0.5, 0.5, yLow(zEndR) + 0.035, 0.52), N(8), 1, st(0xaeb2b6, 0.4, 0.9), 0.008);
      patch(detail, wr(-0.34, 0.34, 0.835, 0.85), N(6), 1, CHROME, 0.008);
    }
    // dakspoiler boven de achterruit
    sym(() => patch(detail, (u, v) => { const p = G.P(zRr + bowR + 0.02 - v * 0.2, 0, u * 0.93); return [p[0], p[1] + 0.012 + 0.05 * v, p[2] - 0.02 * v]; }, N(8), N(2), GLOSS, OFF, { inner: GLOSS }));
    if (lod < 2) patch(lights, (u, v) => { const p = G.P(zRr + bowR - 0.185, 0, Math.abs(u - 0.5) * 0.5); return [(u < 0.5 ? -1 : 1) * p[0], p[1] + 0.045 + v * 0.016, p[2] - 0.035]; }, 4, 1, lamp(BRAKE, 3), 0, { flip: false });
  }

  // ================================================================ wielen
  const tw = sp.tire, xWheel = W / 2 - 0.035 - tw / 2;
  const wheelSpec = { R, rimR: sp.rimR, tw, rim: RIMS[key] };
  const wheels = [];
  for (const [z, front] of [[wb / 2, true], [-wb / 2, false]]) for (const sx of [1, -1]) wheels.push({ x: sx * xWheel, y: R, z, flip: sx < 0, steer: front, r: R, geo: 0 });
  return finish({ paint, detail, glass, lights, wheels, wheelBufs: [buildWheel(wheelSpec, lod)], lod,
    beam: { z: zEndF, y: F.head ? (F.head[2] + F.head[3]) / 2 : 0.9, x: F.head ? (F.head[0] + F.head[1]) / 2 : 0.7 },
    driver: Lq.interior > 0 ? { x: xw * 0.5, y: seatY, z: (sp.seatU != null ? sp.seatU - h : (Gs.b[0] ?? Gs.c[1]) - h + 0.13), k: Math.min(1, (gTop(0) - 0.1 - seatY) / 0.85) } : null,
    spot: [0, 0.75, zEndF - 0.2],
  });
}

// Geometrieën maken uit de verzamelaars. 'baked' = details met de vier wielen erin (voor gebundelde auto's).
function finish(o) {
  const { paint, detail, glass, lights, wheels, wheelBufs, lod } = o;
  const out = {
    lod, wheels, beam: o.beam, spot: o.spot,
    paint: paint.geometry('paint'), lights: lights.geometry('lights'),
    glass: glass.count ? glass.geometry('glass') : null,
    tris: { paint: paint.tris, detail: detail.tris, glass: glass.tris, lights: lights.tris, wheel: wheelBufs.map((b) => b.tris) },
  };
  let det = null, baked = null, wg = null, drv = null;
  Object.defineProperties(out, {
    detail: { get: () => (det ??= detail.geometry('detail')) },
    wheelGeos: { get: () => (wg ??= wheelBufs.map((b) => b.geometry('detail'))) },
    baked: {
      get: () => {
        if (baked) return baked;
        const b = new Buf();
        b.add(detail);
        for (const w of wheels) b.add(wheelBufs[w.geo], mat4(w.x, w.y, w.z, 0, w.flip ? Math.PI : 0, 0));
        return (baked = b.geometry('detail'));
      },
    },
    // bestuurder: 0 = iemand uit het dorp, 1 = de speler (geel shirt)
    driverGeos: {
      get: () => {
        if (drv || !o.driver) return drv;
        drv = [{ shirt: 0x4a5560, hair: 0x2e2118 }, { shirt: 0xe8a33d, hair: 0x3b2a1a }].map((look) => {
          const b = new Buf();
          driver(b, o.driver.x, o.driver.y, o.driver.z, { ...look, lod, k: o.driver.k ?? 1 });
          return b.geometry('detail');
        });
        return drv;
      },
    },
  });
  out.tris.baked = detail.tris + wheels.reduce((n, w) => n + wheelBufs[w.geo].tris, 0);
  return out;
}

// ================================================================ tractor
function buildTractor(t, lod) {
  const paint = new Buf(), detail = new Buf(), glass = new Buf(), lights = new Buf();
  const P = paintSt(), hi = lod === 0, mid = lod < 2;
  const SB = mid ? softBox : (b, w, h, d, x, y, z, s, r, rx, ry, rz) => box(b, w, h, d, x, y, z, s, rx, ry, rz);
  const FRAME = st(0x1d1e20, 0.6, 0.3), STEEL = st(0x2a2c2e, 0.5, 0.7), YELLOW = st(0xe0b21c, 0.5, 0.2);
  // motorkap: afgeronde bak die naar voren iets afloopt, met grille en zijroosters
  SB(paint, 0.98, 0.72, 1.95, 0, 1.3, 1.0, P, 0.12, 0.045);
  SB(paint, 1.02, 0.2, 1.2, 0, 1.0, 0.75, P, 0.06);
  box(detail, 0.8, 0.5, 0.04, 0, 1.24, 1.985, st(0x0a0a0b, 0.6, 0.3), 0.045);
  if (mid) for (let k = 0; k < 5; k++) box(detail, 0.74, 0.03, 0.02, 0, 1.06 + k * 0.09, 2.0 - k * 0.004, st(0x3a3c3f, 0.4, 0.8), 0.045);
  if (mid) for (const sx of [-1, 1]) box(detail, 0.02, 0.3, 0.9, sx * 0.495, 1.3, 1.05, st(0x0c0c0d, 0.7, 0.3));
  // onderstel: motorblok, vooras en achteras
  box(detail, 0.62, 0.5, 2.6, 0, 0.8, 0.5, FRAME);
  box(detail, 1.7, 0.14, 0.16, 0, 0.47, 1.4, FRAME);
  box(detail, 1.9, 0.3, 0.34, 0, 0.75, -0.9, FRAME);
  // spatborden boven de achterwielen: een gebogen strook
  for (const sx of [-1, 1]) {
    const n = hi ? 8 : mid ? 5 : 3, xo = sx * 1.16, xi = sx * 0.72, rr = 0.86;
    for (let k = 0; k < n; k++) {
      const a0 = lerp(0.15, 2.5, k / n), a1 = lerp(0.15, 2.5, (k + 1) / n);
      const p = (a, x, r) => [x, 0.75 + r * Math.sin(a), -0.9 + r * Math.cos(a)];
      paint.flat(p(a0, xi, rr), p(a1, xi, rr), p(a1, xo, rr), p(a0, xo, rr), P, [0, Math.sin(a0), Math.cos(a0)]);
      paint.flat(p(a0, xi, rr - 0.03), p(a1, xi, rr - 0.03), p(a1, xo, rr - 0.03), p(a0, xo, rr - 0.03), P, [0, -Math.sin(a0), -Math.cos(a0)]);
      paint.flat(p(a0, xo, rr), p(a1, xo, rr), p(a1, xo, rr - 0.12), p(a0, xo, rr - 0.12), P, [sx, 0, 0]);
    }
  }
  // cabine: vloer, vier stijlen, dak en glas rondom
  const cz = -0.62, cw = 1.42, cd = 1.36, y0 = 1.28, y1 = 2.86;
  SB(paint, cw + 0.06, 0.2, cd + 0.06, 0, y0 - 0.1, cz, P, 0.05);
  SB(detail, cw + 0.16, 0.13, cd + 0.2, 0, y1 + 0.065, cz, st(0xe9e9e6, 0.6), 0.05);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(detail, 0.07, y1 - y0, 0.07, sx * (cw / 2), (y0 + y1) / 2, cz + sz * (cd / 2), FRAME, sz > 0 ? 0.03 : 0);
  const GL = mid ? glass : detail, GS = mid ? st(0x18242a, 0.03, 0, 0.3) : st(0x0c1014, 0.08, 0.55);
  const pane = (a, b, c, d, hint) => GL.flat(a, b, c, d, GS, hint);
  const xa = cw / 2, za = cz - cd / 2, zb = cz + cd / 2;
  pane([-xa, y0, zb], [xa, y0, zb], [xa, y1, zb], [-xa, y1, zb], [0, 0, 1]);
  pane([-xa, y0, za], [xa, y0, za], [xa, y1, za], [-xa, y1, za], [0, 0, -1]);
  for (const sx of [-1, 1]) pane([sx * xa, y0, za], [sx * xa, y0, zb], [sx * xa, y1, zb], [sx * xa, y1, za], [sx, 0, 0]);
  if (mid) {
    // stoel, stuurkolom en stuur in de cabine
    seat(detail, 0, 1.75, cz - 0.3, { w: 0.5, style: st(0x26282b, 0.9), lod: hi ? 0 : 1, back: 0.5 });
    box(detail, 0.5, 0.5, 0.35, 0, 1.45, cz + 0.45, FRAME);
    detail.geo(new THREE.TorusGeometry(0.2, 0.02, hi ? 6 : 4, hi ? 16 : 8), st(0x101112, 0.6), mat4(0, 1.95, cz + 0.28, -0.9));
    cyl(detail, 0.025, 0.025, 0.35, 5, 0, 1.8, cz + 0.37, FRAME, 0.65);
  }
  // uitlaatpijp met kapje, luchtfilter
  cyl(detail, 0.045, 0.045, 1.25, hi ? 10 : 6, 0.36, 2.25, 1.35, STEEL);
  cyl(detail, 0.06, 0.045, 0.1, hi ? 10 : 6, 0.36, 2.9, 1.35, STEEL);
  if (mid) { cyl(detail, 0.07, 0.07, 0.3, 8, -0.36, 1.82, 1.5, st(0x111213, 0.6, 0.3)); box(detail, 0.1, 0.012, 0.13, 0.36, 2.96, 1.37, STEEL, 0.5); }
  // spiegels, zwaailamp, trekhaak
  if (mid) {
    for (const sx of [-1, 1]) { box(detail, 0.32, 0.02, 0.02, sx * (xa + 0.14), 2.45, zb, FRAME); box(detail, 0.03, 0.26, 0.16, sx * (xa + 0.3), 2.4, zb, FRAME); }
    cyl(lights, 0.06, 0.07, 0.1, 8, 0.45, y1 + 0.18, cz - 0.4, lamp(AMBER, 5));
    box(detail, 0.5, 0.08, 0.5, 0, 0.62, -1.75, STEEL);
  }
  // lampen: koplampen in de neus, werklampen op het dak, achterlichten op de spatborden
  for (const sx of [-1, 1]) {
    cyl(lights, 0.09, 0.09, 0.05, hi ? 12 : 8, sx * 0.3, 1.46, 1.99, lamp(WARM, 0), HALF_PI + 0.045);
    box(lights, 0.16, 0.08, 0.05, sx * 0.5, y1 + 0.04, zb + 0.09, lamp(WHITE, 1));
    box(lights, 0.1, 0.16, 0.04, sx * 0.98, 1.5, -1.72, lamp(0xb40e0e, 2));
    box(lights, 0.1, 0.07, 0.045, sx * 0.98, 1.62, -1.722, lamp(BRAKE, 3));
  }
  plateQuad(lights, detail, 1.0, -1.74, false);
  // wielen: grote achterwielen met noppen, kleinere voorwielen
  const mkWheel = (R, w, rimR) => {
    const b = new Buf(), seg = [28, 16, 10][lod];
    const TY = st(0x131313, 0.95), WALL = st(0x1a1a1a, 0.85);
    lathe(b, [[-w / 2 + 0.03, rimR, WALL], [-w / 2, rimR + (R - rimR) * 0.5, WALL], [-w / 2 + 0.04, R - 0.05, TY], [w / 2 - 0.04, R - 0.05, TY], [w / 2, rimR + (R - rimR) * 0.5, WALL], [w / 2 - 0.03, rimR, WALL]], seg);
    // noppen in visgraat
    if (mid) {
      const n = Math.round(R * 30);
      for (let k = 0; k < n; k++) for (const s of [-1, 1]) {
        const a = ((k + (s > 0 ? 0.5 : 0)) / n) * Math.PI * 2;
        const g = new THREE.BoxGeometry(w * 0.52, 0.06, R * 0.11); g.rotateY(s * 0.5); g.translate(s * w * 0.22, R - 0.03, 0); g.rotateX(a);
        b.geo(g, TY);
      }
    }
    // velg: schotel met een rand en naaf
    lathe(b, [[w / 2 - 0.03, rimR, YELLOW], [w / 2 - 0.06, rimR - 0.03, YELLOW], [w / 2 - 0.16, rimR * 0.55, YELLOW], [w / 2 - 0.12, rimR * 0.3, YELLOW], [w / 2 - 0.12, rimR * 0.3, STEEL], [w / 2 - 0.08, 0.001, STEEL]], seg);
    lathe(b, [[-w / 2 + 0.03, 0.001, DARK], [-w / 2 + 0.03, rimR, DARK]], Math.max(8, seg / 2));
    if (hi) for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; cyl(b, 0.014, 0.014, 0.02, 5, w / 2 - 0.12, Math.cos(a) * rimR * 0.42, Math.sin(a) * rimR * 0.42, STEEL, 0, 0, HALF_PI); }
    return b;
  };
  const wheelBufs = [mkWheel(0.75, 0.5, 0.42), mkWheel(0.45, 0.3, 0.24)];
  const wheels = [];
  for (const sx of [1, -1]) {
    wheels.push({ x: sx * 0.95, y: 0.75, z: -0.9, flip: sx < 0, steer: false, r: 0.75, geo: 0 });
    wheels.push({ x: sx * 0.85, y: 0.45, z: 1.4, flip: sx < 0, steer: true, r: 0.45, geo: 1 });
  }
  return finish({ paint, detail, glass, lights, wheels, wheelBufs, lod, beam: { z: 2.0, y: 1.46, x: 0.3 }, driver: mid ? { x: 0, y: 1.75, z: cz - 0.3 } : null, spot: [0, 1.46, 1.9] });
}
