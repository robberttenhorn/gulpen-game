// Bouwstenen voor de automodellen: alles wordt in code opgebouwd, zonder externe modellen.
// - Buf: verzamelt driehoeken (met kleur en materiaaleigenschappen per hoekpunt) tot één geometrie.
// - Shell: een 'loft' van dwarsdoorsneden langs de lengte-as. De carrosserie en de kap met ruiten
//   zijn elk zo'n schil: een kussenvorm met ronde schouders, bolle neus en kont en echte wielkasten.
// - patch: een lapje dat precies over een schil ligt (lampen, grille, stijlen, naden, bekleding).
// - wiel, stoel, stuur en andere losse onderdelen.
// De auto staat met de neus naar +z, de wielen op y = 0, en +x is de linkerkant (waar de bestuurder zit).
import * as THREE from 'three';

export const HALF_PI = Math.PI / 2;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Vloeiende kromme door punten [x, y], zonder doorschieten (monotone kubische interpolatie).
export function curve(pts) {
  const n = pts.length, xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  if (n === 1) return () => ys[0];
  const d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return ys[i] * (2 * t3 - 3 * t2 + 1) + m[i] * h * (t3 - 2 * t2 + t) + ys[i + 1] * (-2 * t3 + 3 * t2) + m[i + 1] * h * (t3 - t2);
  };
}
// een getal of een lijst punten wordt een functie van z
export const fnOf = (v, shift = 0) => (typeof v === 'number' ? () => v : curve(v.map(([x, y]) => [x - shift, y])));

// ---------------------------------------------------------------- stijl per hoekpunt
const _c = new THREE.Color();
// kleur (sRGB-hex), ruwheid, metaal en dekking (alleen voor glas)
export const st = (hex, rough = 0.6, metal = 0, alpha = 1) => { _c.set(hex); return { c: [_c.r, _c.g, _c.b, alpha], e: [rough, metal, 0] }; };
// lamp: kleur en soort. 0 dimlicht, 1 dagrijlicht, 2 achterlicht, 3 remlicht, 4 achteruit, 5 knipperlicht, 6 kenteken, 7 dof
export const lamp = (hex, kind) => { _c.set(hex); return { c: [_c.r, _c.g, _c.b, 1], e: [0.5, 0.04, kind] }; };
const PAINT_ST = { c: [1, 1, 1, 1], e: [0.4, 0.4, 0] };
export const paintSt = () => PAINT_ST;

// ---------------------------------------------------------------- verzamelaar van driehoeken
export class Buf {
  constructor() { this.p = []; this.n = []; this.c = []; this.e = []; this.i = []; }
  get count() { return this.p.length / 3; }
  get tris() { return this.i.length / 3; }
  v(p, n, s) {
    this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]);
    this.c.push(s.c[0], s.c[1], s.c[2], s.c[3]); this.e.push(s.e[0], s.e[1], s.e[2]);
    return this.p.length / 3 - 1;
  }
  tri(a, b, c) { this.i.push(a, b, c); }
  quad(a, b, c, d) { this.i.push(a, b, c, a, c, d); }
  mark() { return [this.p.length / 3, this.i.length]; }
  // alles sinds 'mark' spiegelen naar de andere kant van de auto
  mirror([v0, i0]) {
    const v1 = this.p.length / 3, i1 = this.i.length;
    for (let k = v0; k < v1; k++) {
      this.p.push(-this.p[k * 3], this.p[k * 3 + 1], this.p[k * 3 + 2]);
      this.n.push(-this.n[k * 3], this.n[k * 3 + 1], this.n[k * 3 + 2]);
      this.c.push(this.c[k * 4], this.c[k * 4 + 1], this.c[k * 4 + 2], this.c[k * 4 + 3]);
      this.e.push(this.e[k * 3], this.e[k * 3 + 1], this.e[k * 3 + 2]);
    }
    for (let k = i0; k < i1; k += 3) this.i.push(this.i[k] - v0 + v1, this.i[k + 2] - v0 + v1, this.i[k + 1] - v0 + v1);
  }
  // plat vierkant vlak met eigen hoekpunten; 'hint' is de richting waar de voorkant heen wijst
  flat(a, b, c, d, s, hint) {
    let nx = (b[1] - a[1]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[1] - a[1]);
    let ny = (b[2] - a[2]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[2] - a[2]);
    let nz = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
    if (Math.hypot(nx, ny, nz) < 1e-12) { // a en b vallen samen: neem de andere diagonaal
      nx = (c[1] - b[1]) * (d[2] - b[2]) - (c[2] - b[2]) * (d[1] - b[1]);
      ny = (c[2] - b[2]) * (d[0] - b[0]) - (c[0] - b[0]) * (d[2] - b[2]);
      nz = (c[0] - b[0]) * (d[1] - b[1]) - (c[1] - b[1]) * (d[0] - b[0]);
    }
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const flip = hint && nx * hint[0] + ny * hint[1] + nz * hint[2] < 0;
    const n = flip ? [-nx, -ny, -nz] : [nx, ny, nz];
    const ia = this.v(a, n, s), ib = this.v(b, n, s), ic = this.v(c, n, s), id = this.v(d, n, s);
    if (flip) this.quad(ia, id, ic, ib); else this.quad(ia, ib, ic, id);
  }
  // een three-geometrie toevoegen, met een matrix en één stijl
  geo(g, s, m) {
    const pos = g.attributes.position, nor = g.attributes.normal, base = this.p.length / 3;
    const v = new THREE.Vector3(), nm = m ? new THREE.Matrix3().getNormalMatrix(m) : null;
    const mirrored = m ? m.determinant() < 0 : false;
    for (let k = 0; k < pos.count; k++) {
      v.fromBufferAttribute(pos, k); if (m) v.applyMatrix4(m);
      this.p.push(v.x, v.y, v.z);
      v.fromBufferAttribute(nor, k); if (nm) v.applyMatrix3(nm).normalize();
      this.n.push(v.x, v.y, v.z);
      this.c.push(s.c[0], s.c[1], s.c[2], s.c[3]); this.e.push(s.e[0], s.e[1], s.e[2]);
    }
    const idx = g.index;
    const cnt = idx ? idx.count : pos.count;
    for (let k = 0; k < cnt; k += 3) {
      const a = idx ? idx.getX(k) : k, b = idx ? idx.getX(k + 1) : k + 1, c = idx ? idx.getX(k + 2) : k + 2;
      if (mirrored) this.i.push(base + a, base + c, base + b); else this.i.push(base + a, base + b, base + c);
    }
    g.dispose();
  }
  // een andere verzamelaar erbij, eventueel verplaatst/gedraaid
  add(o, m) {
    const base = this.p.length / 3;
    if (!m) { for (const x of o.p) this.p.push(x); for (const x of o.n) this.n.push(x); } else {
      const v = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(m);
      for (let k = 0; k < o.p.length; k += 3) { v.set(o.p[k], o.p[k + 1], o.p[k + 2]).applyMatrix4(m); this.p.push(v.x, v.y, v.z); }
      for (let k = 0; k < o.n.length; k += 3) { v.set(o.n[k], o.n[k + 1], o.n[k + 2]).applyMatrix3(nm).normalize(); this.n.push(v.x, v.y, v.z); }
    }
    for (const x of o.c) this.c.push(x);
    for (const x of o.e) this.e.push(x);
    const mirrored = m ? m.determinant() < 0 : false;
    for (let k = 0; k < o.i.length; k += 3) {
      if (mirrored) this.i.push(base + o.i[k], base + o.i[k + 2], base + o.i[k + 1]);
      else this.i.push(base + o.i[k], base + o.i[k + 1], base + o.i[k + 2]);
    }
  }
  // soort: 'paint' (alleen vorm), 'detail' (kleur + ruwheid/metaal), 'glass' (kleur met dekking), 'lights' (kleur, uv, lampsoort)
  geometry(kind) {
    const g = new THREE.BufferGeometry();
    const n = this.p.length / 3;
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    if (kind === 'glass') g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 4));
    else if (kind !== 'paint') {
      const c3 = new Float32Array(n * 3);
      for (let k = 0; k < n; k++) { c3[k * 3] = this.c[k * 4]; c3[k * 3 + 1] = this.c[k * 4 + 1]; c3[k * 3 + 2] = this.c[k * 4 + 2]; }
      g.setAttribute('color', new THREE.BufferAttribute(c3, 3));
    }
    if (kind === 'detail') {
      const rm = new Float32Array(n * 2);
      for (let k = 0; k < n; k++) { rm[k * 2] = this.e[k * 3]; rm[k * 2 + 1] = this.e[k * 3 + 1]; }
      g.setAttribute('aRM', new THREE.BufferAttribute(rm, 2));
    }
    if (kind === 'lights') {
      const uv = new Float32Array(n * 2), kd = new Float32Array(n);
      for (let k = 0; k < n; k++) { uv[k * 2] = this.e[k * 3]; uv[k * 2 + 1] = this.e[k * 3 + 1]; kd[k] = this.e[k * 3 + 2]; }
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setAttribute('aKind', new THREE.BufferAttribute(kd, 1));
    }
    g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    if (n) { g.computeBoundingSphere(); g.computeBoundingBox(); }
    return g;
  }
}

// ---------------------------------------------------------------- schil (loft van dwarsdoorsneden)
// Een doorsnede op lengte z bestaat uit drie delen (alleen de helft x >= 0, de rest wordt gespiegeld):
//   T: de bovenkant, een kwart superellips van het midden (hoogte top) naar de schouder (hoogte top - rt)
//   S: de zijkant, van de schouder omlaag naar de dorpel, met een eigen breedteprofiel prof(v)
//   B: de onderkant, een kwart superellips van de dorpel naar het midden van de bodem (alleen als bottom = true)
// De breedte in bovenaanzicht komt uit half(z): daarmee krijgen neus en kont hun ronding.
export class Shell {
  constructor(o) {
    Object.assign(this, { bottom: true, arches: [], warp: null, pb: 3.2 }, o);
    this.cache = new Map();
  }
  sec(z) {
    z = clamp(z, this.z0, this.z1);
    let c = this.cache.get(z);
    if (c) return c;
    const top = this.top(z), bot = Math.min(this.bot(z), top - 2e-3), h = top - bot;
    const a = Math.max(2e-3, this.half(z));
    const rt = Math.min(this.rt(z), h * (this.bottom ? 0.5 : 0.96));
    const rb = this.bottom ? Math.min(this.rb(z), h * 0.45) : 0;
    c = { z, top, bot, a, rt, rb, yS: top - rt, yR: bot + rb, pt: this.pt(z) };
    c.wT = this.prof(0, c); c.wB = this.prof(1, c);
    c.aT = a * c.wT + this.fl(z, c.yS);
    c.aB = a * c.wB + this.fl(z, c.yR);
    if (this.cache.size > 60000) this.cache.clear();
    this.cache.set(z, c);
    return c;
  }
  // uitbouw rond de wielkasten: een smalle rand langs de boog en een brede bolling van het spatbord
  fl(z, y) {
    let f = 0;
    for (const ar of this.arches) {
      const d = Math.hypot(z - ar.z, y - ar.y) - ar.r;
      if (d > 0.7) continue;
      const dd = Math.max(0, d);
      f += ar.f1 * Math.exp(-(dd * dd) / 0.005) + ar.f2 * Math.exp(-(dd * dd) / 0.085);
    }
    return f;
  }
  // punt van de doorsnede: deel 0 = T, 1 = S, 2 = B; s loopt van 0 naar 1
  pt2(c, part, s) {
    if (part === 0) {
      const ph = (1 - s) * HALF_PI, e = 2 / c.pt;
      return [c.aT * Math.pow(Math.max(0, Math.cos(ph)), e), c.yS + c.rt * Math.pow(Math.sin(ph), e)];
    }
    if (part === 1) { const y = lerp(c.yS, c.yR, s); return [c.a * this.prof(s, c) + this.fl(c.z, y), y]; }
    const ph = s * HALF_PI, e = 2 / this.pb;
    return [c.aB * Math.pow(Math.max(0, Math.cos(ph)), e), c.yR - c.rb * Math.pow(Math.sin(ph), e)];
  }
  w3(x, y, z) { return this.warp ? this.warp(x, y, z) : [x, y, z]; }
  P(z, part, s) { const c = this.sec(z), q = this.pt2(c, part, s); return this.w3(q[0], q[1], c.z); }
  // normaal, uit kleine stapjes langs de lengte en langs de doorsnede
  N(z, part, s) {
    const dz = 3e-3, ds = 3e-3;
    const A = this.P(Math.max(this.z0, z - dz), part, s), B = this.P(Math.min(this.z1, z + dz), part, s);
    const C = this.P(z, part, Math.max(0, s - ds)), D = this.P(z, part, Math.min(1, s + ds));
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = D[0] - C[0], vy = D[1] - C[1], vz = D[2] - C[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-13) return part === 0 ? [0, 1, 0] : part === 1 ? [1, 0, 0] : [0, -1, 0];
    return [nx / l, ny / l, nz / l];
  }
  // halve breedte van de schil op lengte z en hoogte y
  sideX(z, y) {
    const c = this.sec(z);
    if (y >= c.top) return 0;
    if (y > c.yS) {
      const sn = Math.pow(clamp((y - c.yS) / c.rt, 0, 1), c.pt / 2);
      return c.aT * Math.pow(Math.cos(Math.asin(Math.min(1, sn))), 2 / c.pt);
    }
    if (y >= c.yR || !this.bottom) { const v = clamp((c.yS - y) / Math.max(1e-6, c.yS - c.yR), 0, 1); return c.a * this.prof(v, c) + this.fl(c.z, y); }
    if (y > c.bot) {
      const sn = Math.pow(clamp((c.yR - y) / c.rb, 0, 1), this.pb / 2);
      return c.aB * Math.pow(Math.cos(Math.asin(Math.min(1, sn))), 2 / this.pb);
    }
    return 0;
  }
  // hoogte van de bovenkant op lengte z en breedte x
  deckY(z, x) {
    const c = this.sec(z), ax = Math.abs(x);
    if (ax >= c.aT) return c.yS;
    const cs = Math.pow(ax / c.aT, c.pt / 2);
    return c.yS + c.rt * Math.pow(Math.sin(Math.acos(Math.min(1, cs))), 2 / c.pt);
  }
  // s-waarde in deel T waar de breedte een bepaalde fractie van de schouderbreedte is
  sOfX(z, xf) { const c = this.sec(z); return 1 - Math.acos(Math.pow(clamp(xf, 0, 1), c.pt / 2)) / HALF_PI; }
  // punten op de schil: zijkant (z, y), bovenkant (z, x) en rondom neus of kont (w = afstand langs de omtrek vanaf het midden)
  side(z, y) { return this.w3(this.sideX(z, y), y, clamp(z, this.z0, this.z1)); }
  deck(z, x) { return this.w3(x, this.deckY(z, x), clamp(z, this.z0, this.z1)); }
  wrap(end, w, y) {
    const tab = this.outline(end), aw = Math.abs(w), sg = w < 0 ? -1 : 1;
    const zE = end === 'f' ? this.z1 : this.z0;
    const xc = this.sideX(zE, y);
    if (aw <= xc) return this.w3(w, y, zE);
    // voorbij de vlakke kop: z opzoeken in de tabel van de omtrek
    let k = 0;
    while (k < tab.length - 2 && tab[k + 1][0] < aw) k++;
    const t = clamp((aw - tab[k][0]) / Math.max(1e-9, tab[k + 1][0] - tab[k][0]), 0, 1);
    const z = lerp(tab[k][1], tab[k + 1][1], t);
    return this.w3(sg * this.sideX(z, y), y, z);
  }
  outline(end) {
    this.tabs ??= {};
    if (this.tabs[end]) return this.tabs[end];
    const zE = end === 'f' ? this.z1 : this.z0, dir = end === 'f' ? -1 : 1;
    const cE = this.sec(zE), yRef = lerp(cE.yS, cE.yR, 0.45);
    const tab = [];
    let px = this.sideX(zE, yRef), pz = zE, acc = px;
    tab.push([acc, zE]);
    for (let k = 1; k <= 120; k++) {
      // dicht bij de kop kleine stapjes (daar draait de omtrek snel), verderop grotere
      const d = 2.2 * Math.pow(k / 120, 2.2);
      const z = zE + dir * d;
      if (z < this.z0 || z > this.z1) break;
      const c = this.sec(z), x = this.sideX(z, lerp(c.yS, c.yR, 0.45));
      acc += Math.hypot(x - px, z - pz); px = x; pz = z;
      tab.push([acc, z]);
    }
    return (this.tabs[end] = tab);
  }
  // Rooster van de schil in een verzamelaar zetten.
  //  stations: [{ z, cut }] (cut = hoogte van de wielkastrand op die plek, of null)
  //  o.nT, o.nS, o.nB: aantal vakken per deel; o.sOpen: extra ring in deel T (rand van de kuip)
  //  o.style(z, part, s): stijl per hoekpunt; o.skip(part, j, zMid): vak overslaan
  emit(buf, stations, o) {
    const { nT, nS, nB } = o, hasB = this.bottom && nB > 0;
    const sT = [];
    if (o.sOpen) {
      const k = Math.max(1, Math.round(nT * 0.6));
      for (let j = 0; j <= k; j++) sT.push((o.sOpen * j) / k);
      for (let j = 1; j <= nT - k; j++) sT.push(o.sOpen + ((1 - o.sOpen) * j) / (nT - k));
    } else for (let j = 0; j <= nT; j++) sT.push(j / nT);
    const R = sT.length + nS + (hasB ? nB : 0);
    const mk = buf.mark();
    const first = buf.count;
    const rows = [];
    for (const stn of stations) {
      const z = stn.z, c = this.sec(z), cut = stn.cut;
      const row = [];
      for (let j = 0; j < sT.length; j++) {
        const s = sT[j];
        let n = this.N(z, 0, s);
        if (j === 0) { n = [0, n[1], n[2]]; const l = Math.hypot(n[1], n[2]) || 1; n[1] /= l; n[2] /= l; }
        if (j === sT.length - 1) { const m = this.N(z, 1, 0); n = [n[0] + m[0], n[1] + m[1], n[2] + m[2]]; const l = Math.hypot(n[0], n[1], n[2]) || 1; n = [n[0] / l, n[1] / l, n[2] / l]; }
        row.push(buf.v(this.P(z, 0, s), n, o.style(z, 0, s)));
      }
      const vMax = cut != null ? clamp((c.yS - cut) / Math.max(1e-6, c.yS - c.yR), 0.02, 1) : 1;
      let last = null, lastN = null;
      for (let k = 1; k <= nS; k++) {
        const v = (k / nS) * vMax;
        last = this.P(z, 1, v); lastN = this.N(z, 1, v);
        row.push(buf.v(last, lastN, o.style(z, 1, v)));
      }
      if (hasB) for (let k = 1; k <= nB; k++) {
        if (cut != null) {
          // omgezette rand van de wielkast: een klein stukje naar binnen
          row.push(buf.v([last[0] - 0.028, last[1], last[2]], stn.lipN || [0, -1, 0], o.style(z, 2, 0)));
        } else {
          const s = k / nB;
          let n = this.N(z, 2, s);
          if (k === nB) n = [0, -1, 0];
          row.push(buf.v(this.P(z, 2, s), n, o.style(z, 2, s)));
        }
      }
      rows.push(row);
    }
    for (let i = 0; i < stations.length - 1; i++) {
      const a = stations[i], b = stations[i + 1];
      if (Math.abs(b.z - a.z) < 1e-6) continue;
      const zm = (a.z + b.z) / 2;
      for (let j = 0; j < R - 1; j++) {
        const part = j < sT.length - 1 ? 0 : j < sT.length - 1 + nS ? 1 : 2;
        if (part === 2) {
          const k = j - (sT.length - 1 + nS);
          if ((a.cut != null) !== (b.cut != null)) continue;
          if (a.cut != null && k > 0) continue;
        }
        if (o.skip && o.skip(part, j, zm, sT)) continue;
        buf.quad(rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]);
      }
    }
    buf.mirror(mk);
    return { rows, first, sT };
  }
  // vlakke kop aan een uiteinde (achter grille en kenteken), met dezelfde normalen als de rand zodat hij vloeiend aansluit
  cap(buf, stn, o, sT, front, style) {
    const { nS, nB } = o, z = stn.z;
    const pts = [], nors = [];
    const add = (part, s) => { pts.push(this.P(z, part, s)); nors.push(this.N(z, part, s)); };
    for (const s of sT) add(0, s);
    for (let k = 1; k <= nS; k++) add(1, k / nS);
    if (this.bottom) for (let k = 1; k <= nB; k++) add(2, k / nB);
    const zd = front ? 1 : -1;
    const L = [], Rr = [];
    for (let j = 0; j < pts.length; j++) {
      const p = pts[j];
      let n = [nors[j][0] * 0.5, nors[j][1] * 0.5, nors[j][2] * 0.5 + zd];
      const l = Math.hypot(n[0], n[1], n[2]); n = [n[0] / l, n[1] / l, n[2] / l];
      Rr.push(buf.v(p, n, style)); L.push(buf.v([-p[0], p[1], p[2]], [-n[0], n[1], n[2]], style));
    }
    for (let j = 0; j < pts.length - 1; j++) {
      if (front) buf.quad(L[j], L[j + 1], Rr[j + 1], Rr[j]); else buf.quad(Rr[j], Rr[j + 1], L[j + 1], L[j]);
    }
  }
}

// ---------------------------------------------------------------- lapjes over een schil
// fn(u, v) geeft een punt op het oppervlak; het lapje ligt 'off' meter naar buiten.
// o.inner: stijl voor een binnenkant (omgekeerd vlak, net binnen het oppervlak), o.innerBuf: waar die heen gaat.
export function patch(buf, fn, nu, nv, style, off = 0.005, o = {}) {
  nu = Math.max(1, Math.round(nu)); nv = Math.max(1, Math.round(nv));
  const W = nu + 1, H = nv + 1, pts = new Array(W * H), nor = new Float64Array(W * H * 3);
  let cx = 0, cy = 0, cz = 0;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const p = fn(i / nu, j / nv); pts[j * W + i] = p; cx += p[0]; cy += p[1]; cz += p[2]; }
  cx /= W * H; cy /= W * H; cz /= W * H;
  let ax = 0, ay = 0, az = 0;
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const ia = j * W + i, ib = ia + 1, ic = ib + W, id = ia + W;
    const a = pts[ia], b = pts[ib], c = pts[ic], d = pts[id];
    const ux = c[0] - a[0], uy = c[1] - a[1], uz = c[2] - a[2], vx = d[0] - b[0], vy = d[1] - b[1], vz = d[2] - b[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const q of [ia, ib, ic, id]) { nor[q * 3] += nx; nor[q * 3 + 1] += ny; nor[q * 3 + 2] += nz; }
    ax += nx; ay += ny; az += nz;
  }
  // naar buiten: weg van het midden van de auto
  let sg = ax * cx + ay * (cy - 0.5) + az * cz * 0.4 >= 0 ? 1 : -1;
  if (o.flip) sg = -sg;
  const al = Math.hypot(ax, ay, az) || 1;
  const base = buf.count;
  const N = [];
  for (let q = 0; q < W * H; q++) {
    let nx = nor[q * 3], ny = nor[q * 3 + 1], nz = nor[q * 3 + 2];
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-14) { nx = ax / al; ny = ay / al; nz = az / al; } else { nx /= l; ny /= l; nz /= l; }
    const n = [nx * sg, ny * sg, nz * sg];
    N.push(n);
    const p = pts[q];
    buf.v([p[0] + n[0] * off, p[1] + n[1] * off, p[2] + n[2] * off], n, typeof style === 'function' ? style(q % W / nu, Math.floor(q / W) / nv) : style);
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const ia = base + j * W + i, ib = ia + 1, ic = ib + W, id = ia + W;
    if (sg > 0) buf.quad(ia, ib, ic, id); else buf.quad(ia, id, ic, ib);
  }
  if (o.inner) {
    const ib2 = o.innerBuf || buf, b2 = ib2.count, io = o.innerOff ?? 0.004;
    for (let q = 0; q < W * H; q++) { const p = pts[q], n = N[q]; ib2.v([p[0] - n[0] * io, p[1] - n[1] * io, p[2] - n[2] * io], [-n[0], -n[1], -n[2]], o.inner); }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const ia = b2 + j * W + i, ib = ia + 1, ic = ib + W, id = ia + W;
      if (sg > 0) ib2.quad(ia, id, ic, ib); else ib2.quad(ia, ib, ic, id);
    }
  }
}

// smalle strook langs een lijn van 2D-punten (naden, sierlijsten); map(a, b) geeft het punt op het oppervlak
export function linePatch(buf, map, pts, width, style, off = 0.002) {
  const n = pts.length, L = [], Rr = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    L.push([pts[i][0] - ty * width / 2, pts[i][1] + tx * width / 2]);
    Rr.push([pts[i][0] + ty * width / 2, pts[i][1] - tx * width / 2]);
  }
  patch(buf, (u, v) => {
    const i = Math.round(u * (n - 1));
    return map(lerp(L[i][0], Rr[i][0], v), lerp(L[i][1], Rr[i][1], v));
  }, n - 1, 1, style, off);
}

// ---------------------------------------------------------------- eenvoudige vormen
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
export function mat4(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
}
export function box(buf, w, h, d, x, y, z, style, rx = 0, ry = 0, rz = 0) {
  buf.geo(new THREE.BoxGeometry(w, h, d), style, mat4(x, y, z, rx, ry, rz));
}
// doos met afgeschuinde randen (8 hoekpunten per kant extra): leest zachter dan een kale doos
export function softBox(buf, w, h, d, x, y, z, style, r = 0.03, rx = 0, ry = 0, rz = 0) {
  const b = new Buf();
  const hw = w / 2, hh = h / 2, hd = d / 2;
  r = Math.min(r, hw * 0.9, hh * 0.9, hd * 0.9);
  // zes vlakken, elk iets kleiner, plus schuine randen ertussen via een bol-achtige normaal
  const g = new THREE.BoxGeometry(w, h, d, 3, 3, 3);
  const pos = g.attributes.position, nor = g.attributes.normal;
  for (let k = 0; k < pos.count; k++) {
    let px = pos.getX(k), py = pos.getY(k), pz = pos.getZ(k);
    // binnenste doos + afronding: punt naar de kern trekken en dan r naar buiten
    const ix = clamp(px, -hw + r, hw - r), iy = clamp(py, -hh + r, hh - r), iz = clamp(pz, -hd + r, hd - r);
    // de tussenpunten van het 3x3-rooster naar de rand van het vlakke deel schuiven
    const tx = Math.abs(px) < hw - 1e-6 ? Math.sign(px) * (hw - r) : px, ty = Math.abs(py) < hh - 1e-6 ? Math.sign(py) * (hh - r) : py, tz = Math.abs(pz) < hd - 1e-6 ? Math.sign(pz) * (hd - r) : pz;
    const jx = clamp(tx, -hw + r, hw - r), jy = clamp(ty, -hh + r, hh - r), jz = clamp(tz, -hd + r, hd - r);
    let dx = tx - jx, dy = ty - jy, dz = tz - jz;
    const l = Math.hypot(dx, dy, dz);
    if (l > 1e-9) { dx /= l; dy /= l; dz /= l; pos.setXYZ(k, jx + dx * r, jy + dy * r, jz + dz * r); nor.setXYZ(k, dx, dy, dz); } else pos.setXYZ(k, ix, iy, iz);
  }
  b.geo(g, style);
  buf.add(b, mat4(x, y, z, rx, ry, rz));
}
export function cyl(buf, r0, r1, len, seg, x, y, z, style, rx = 0, ry = 0, rz = 0, open = false) {
  buf.geo(new THREE.CylinderGeometry(r0, r1, len, seg, 1, open), style, mat4(x, y, z, rx, ry, rz));
}
export function ball(buf, r, x, y, z, style, sx = 1, sy = 1, sz = 1, ws = 8, hs = 6) {
  buf.geo(new THREE.SphereGeometry(r, ws, hs), style, mat4(x, y, z, 0, 0, 0, sx, sy, sz));
}

// Omwentelingslichaam rond de x-as. prof: [[x, r, stijl]]; twee gelijke punten achter elkaar geven een scherpe rand.
export function lathe(buf, prof, seg, a0 = 0, a1 = Math.PI * 2) {
  const n = prof.length, segN = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = prof[i + 1][0] - prof[i][0], dr = prof[i + 1][1] - prof[i][1], l = Math.hypot(dx, dr);
    segN.push(l < 1e-9 ? null : [-dr / l, dx / l]);
  }
  const N = [];
  for (let i = 0; i < n; i++) {
    const a = i > 0 ? segN[i - 1] : null, b = i < n - 1 ? segN[i] : null;
    let nx = (a ? a[0] : 0) + (b ? b[0] : 0), nr = (a ? a[1] : 0) + (b ? b[1] : 0);
    const l = Math.hypot(nx, nr) || 1;
    N.push([nx / l, nr / l]);
  }
  const base = buf.count, full = Math.abs(a1 - a0 - Math.PI * 2) < 1e-6;
  for (let k = 0; k <= seg; k++) {
    const a = lerp(a0, a1, k / seg), cs = Math.cos(a), sn = Math.sin(a);
    for (let i = 0; i < n; i++) buf.v([prof[i][0], prof[i][1] * cs, prof[i][1] * sn], [N[i][0], N[i][1] * cs, N[i][1] * sn], prof[i][2]);
  }
  for (let k = 0; k < seg; k++) for (let i = 0; i < n - 1; i++) {
    if (!segN[i]) continue;
    const A = base + k * n + i, B = A + 1, D = base + (k + 1) * n + i, C = D + 1;
    buf.tri(A, D, C); buf.tri(A, C, B);
  }
  return full;
}

// ---------------------------------------------------------------- wielen
// Wiel in eigen assenstelsel: as langs x, buitenkant naar +x, midden in de oorsprong.
// w: { R, rimR, tw (bandbreedte), rim: { n, twin, sweep, wi, wo, dish, face, side, barrel, cap, lip } }
export function buildWheel(w, lod) {
  const b = new Buf();
  const { R, rimR, tw } = w, xo = tw / 2, xi = -tw / 2, sh = R - rimR;
  const seg = [w.seg || 26, 14, 9][lod];
  const TREAD = st(0x121212, 0.95), WALL = st(0x191919, 0.82), GROOVE = st(0x060606, 1);
  const rim = w.rim, LIP = rim.lip || st(0xc9ccd0, 0.22, 1), BARREL = rim.barrel || st(0x6f7276, 0.4, 1);
  if (lod === 2) {
    // ver weg: band als ring met een schijf als velg
    lathe(b, [[xi, rimR * 0.9, WALL], [xi, R, WALL], [xi, R, TREAD], [xo, R, TREAD], [xo, R, WALL], [xo - 0.01, rimR, WALL], [xo - 0.01, rimR, rim.far || LIP], [xo - 0.035, 0.001, rim.far || LIP]], seg);
    return b;
  }
  // band: wang, schouder en loopvlak (met groeven op de hoogste stand)
  const prof = [[xi + 0.014, rimR - 0.004, WALL], [xi + 0.002, rimR + sh * 0.3, WALL], [xi - 0.004, rimR + sh * 0.58, WALL], [xi + 0.006, R - 0.02, WALL], [xi + 0.024, R - 0.004, TREAD]];
  if (lod === 0) {
    const gw = 0.011, gd = 0.007;
    for (const gx of w.grooves || [-0.2 * tw, 0.2 * tw]) {
      prof.push([gx - gw / 2, R, TREAD], [gx - gw / 2, R, GROOVE], [gx - gw / 2 + 0.002, R - gd, GROOVE], [gx + gw / 2 - 0.002, R - gd, GROOVE], [gx + gw / 2, R, GROOVE], [gx + gw / 2, R, TREAD]);
    }
  }
  prof.push([xo - 0.024, R - 0.004, TREAD], [xo - 0.006, R - 0.02, WALL], [xo + 0.004, rimR + sh * 0.58, WALL], [xo - 0.002, rimR + sh * 0.3, WALL], [xo - 0.014, rimR - 0.004, WALL]);
  lathe(b, prof, seg);
  // velgrand en het bed van de velg (de binnenkant, naar de as gericht)
  lathe(b, [[xo - 0.016, rimR + 0.004, LIP], [xo - 0.005, rimR - 0.004, LIP], [xo - 0.014, rimR - 0.014, LIP], [xo - 0.014, rimR - 0.014, BARREL], [xo - 0.05, rimR - 0.022, BARREL], [xi + 0.03, rimR - 0.03, BARREL]], seg);
  // achterplaat, zodat je niet door het wiel heen kijkt
  lathe(b, [[xi + 0.03, rimR - 0.03, st(0x0b0b0c, 0.9)], [xi + 0.03, 0.001, st(0x0b0b0c, 0.9)]], Math.max(8, seg / 2));
  // remschijf met naaf
  const rd = Math.min(rimR - 0.04, rimR * 0.82), xd = xo - 0.085;
  const DISC = st(0x8a8d91, 0.32, 1), HAT = st(0x3a3c3f, 0.5, 0.8);
  lathe(b, [[xd, rd, DISC], [xd, rd * 0.48, DISC], [xd, rd * 0.48, HAT], [xd + 0.02, rd * 0.44, HAT], [xd + 0.02, 0.001, HAT]], Math.max(10, Math.round(seg * 0.7)));
  // spaken
  const xs = xo - 0.022, xh = xs - (rim.dish ?? 0.012), ri = 0.05, ro = rimR - 0.016;
  const FACE = rim.face || LIP, SIDE = rim.side || BARREL;
  const steps = rim.sweep ? (lod === 0 ? 3 : 2) : 1, depth = rim.depth ?? 0.03;
  const at = (r, ang, x) => [x, r * Math.cos(ang), r * Math.sin(ang)];
  const angles = [];
  for (let k = 0; k < rim.n; k++) {
    const a = (k / rim.n) * Math.PI * 2;
    if (rim.twin) angles.push(a - rim.twin, a + rim.twin); else angles.push(a);
  }
  for (const a0 of angles) {
    for (let q = 0; q < steps; q++) {
      const t0 = q / steps, t1 = (q + 1) / steps;
      const ring = (t) => {
        const r = lerp(ri, ro, t), ang = a0 + (rim.sweep || 0) * t * t, hw = lerp(rim.wi, rim.wo, t) / 2 / r, x = lerp(xh, xs, Math.pow(t, rim.curve ?? 1));
        return { L: at(r, ang - hw, x), C: at(r, ang, x + (rim.ridge ?? 0.006)), R: at(r, ang + hw, x), Lb: at(r, ang - hw, x - depth), Rb: at(r, ang + hw, x - depth), mid: at(r, ang, x - depth / 2) };
      };
      const A = ring(t0), B = ring(t1);
      b.flat(A.L, B.L, B.C, A.C, FACE, [1, 0, 0]);
      b.flat(A.C, B.C, B.R, A.R, FACE, [1, 0, 0]);
      const out = (p, m) => [0, p[1] - m[1], p[2] - m[2]];
      b.flat(A.Lb, B.Lb, B.L, A.L, SIDE, out(A.L, A.mid));
      b.flat(A.R, B.R, B.Rb, A.Rb, SIDE, out(A.R, A.mid));
    }
  }
  // naafdop
  const CAP = rim.cap || st(0x2a2c2f, 0.35, 0.8), rc = rim.capR ?? 0.058;
  lathe(b, [[xh - 0.03, rc, FACE], [xh + 0.006, rc, FACE], [xh + 0.012, rc * 0.82, CAP], [xh + 0.016, 0.001, CAP]], Math.max(8, Math.round(seg / 2)));
  if (lod === 0 && rim.bolts !== false) {
    // wielbouten
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 + 0.3; cyl(b, 0.008, 0.008, 0.012, 5, xh + 0.01, Math.cos(a) * rc * 1.45, Math.sin(a) * rc * 1.45, st(0x9a9da0, 0.3, 1), 0, 0, HALF_PI); }
  }
  return b;
}

// ---------------------------------------------------------------- interieur
// stoel: zitting, rugleuning en hoofdsteun. z = voorkant van de rugleuning, y = bovenkant zitting
export function seat(buf, x, y, z, o = {}) {
  const { w = 0.5, style = st(0x2b2d31, 0.85), style2 = style, back = 0.6, lod = 0, head = true } = o;
  const B = lod === 0 ? softBox : (b, ww, h, d, xx, yy, zz, s, r, rx) => box(b, ww, h, d, xx, yy, zz, s, rx);
  const tilt = -0.2; // rugleuning iets achterover
  B(buf, w, 0.13, 0.5, x, y - 0.065, z + 0.25, style, 0.04);
  B(buf, w * 0.96, back, 0.12, x, y + back / 2 - 0.02, z - 0.06 - back * 0.1, style2, 0.04, tilt);
  if (head) B(buf, w * 0.52, 0.19, 0.1, x, y + back + 0.1, z - 0.07 - back * 0.21, style, 0.035, tilt);
}
// stuur met kolom, links (x > 0)
export function steeringWheel(buf, x, y, z, lod) {
  const S = st(0x101112, 0.6);
  const m = mat4(x, y, z, 0.43, 0, 0);
  buf.geo(new THREE.TorusGeometry(0.18, 0.016, lod === 0 ? 6 : 4, lod === 0 ? 18 : 10), S, m);
  if (lod === 0) {
    for (const a of [0.2, Math.PI - 0.2, -HALF_PI]) {
      const g = new THREE.BoxGeometry(0.17, 0.035, 0.014); g.translate(0.09, 0, 0); g.rotateZ(a);
      buf.geo(g, S, m);
    }
    buf.geo(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 8).rotateX(HALF_PI), st(0x191a1c, 0.5), m);
  }
  box(buf, 0.05, 0.05, 0.3, x, y - 0.06, z + 0.15, S, 0.4);
}
// bestuurder: romp, armen naar het stuur en een hoofd (alleen het deel dat je door de ruiten ziet).
// k < 1 maakt hem lager, voor auto's met een laag dak.
export function driver(buf, x, y, z, o = {}) {
  const { shirt = 0x4a5560, skin = 0xe7c0a0, hair = 0x2e2118, lod = 0, k = 1 } = o;
  const SH = st(shirt, 0.9), SK = st(skin, 0.75), HA = st(hair, 0.9);
  const zb = -(1 - k) * 0.5; // lager dak: verder achterover
  softBox(buf, 0.4, 0.5 * k, 0.2, x, y + 0.3 * k, z - 0.02 + zb * 0.5, SH, 0.07, -0.18 - (1 - k));
  softBox(buf, 0.46, 0.14, 0.22, x, y + 0.5 * k, z - 0.05 + zb, SH, 0.06, -0.18); // schouders
  cyl(buf, 0.05, 0.055, 0.08, 6, x, y + 0.6 * k, z - 0.06 + zb, SK);
  ball(buf, 0.105, x, y + 0.6 * k + 0.13, z - 0.05 + zb, SK, 0.92, 1.08, 1, lod === 0 ? 10 : 7, lod === 0 ? 8 : 5);
  // haar: een kap over de bovenkant en achterkant van het hoofd
  buf.geo(new THREE.SphereGeometry(0.112, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.5), HA, mat4(x, y + 0.6 * k + 0.145, z - 0.062 + zb, -0.35, 0, 0, 0.95, 1.05, 1.05));
  for (const sx of [-1, 1]) {
    // bovenarm en onderarm naar het stuur
    softBox(buf, 0.09, 0.09, 0.3, x + sx * 0.22, y + 0.4 * k, z + 0.08 + zb * 0.6, SH, 0.035, 0.55, sx * -0.1);
    softBox(buf, 0.075, 0.075, 0.28 - zb * 0.5, x + sx * 0.17, y + 0.33 * k + 0.02, z + 0.31 + zb * 0.3, SH, 0.03, -0.1, sx * 0.25);
    ball(buf, 0.045, x + sx * 0.14, y + 0.36 * k + 0.03, z + 0.44, SK, 1, 1, 1, 6, 4);
  }
}
