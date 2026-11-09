// Motion capture voor de poppetjes: pakt de gebakken clips uit (src/mocap-data.js, gemaakt door
// tools/bake-mocap.mjs) en mengt ze tot één houding. Alleen src/character.js gebruikt dit.
// De bewegingen komen uit de CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu).
import { MOCAP, MOCAP_BONES } from './mocap-data.js';

export const NB = MOCAP_BONES.length;

function unpack(b64) {
  const bin = atob(b64), n = bin.length >> 1, out = new Int16Array(n);
  for (let i = 0; i < n; i++) { const v = bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8); out[i] = v > 32767 ? v - 65536 : v; }
  return out;
}

function decode(c) {
  const qi = unpack(c.q), pi = unpack(c.p);
  const q = new Float32Array(qi.length), p = new Float32Array(pi.length);
  for (let i = 0; i < qi.length; i++) q[i] = qi[i] / 32767;
  for (let i = 0; i < pi.length; i++) p[i] = pi[i] / 1e4;
  return { n: c.n, dur: c.dur, stride: c.stride, speed: c.stride / c.dur, q, p };
}

export const CLIPS = {};
for (const k in MOCAP) CLIPS[k] = decode(MOCAP[k]);

// Telt een clip op fase u (0..1, loopt rond) met gewicht w bij de verzamelhouding op:
// accQ = per bot een (nog niet genormaliseerd) quaternion, accP = verplaatsing van het lichaam.
export function addClip(clip, u, w, accQ, accP) {
  if (w <= 0) return;
  const f = (u - Math.floor(u)) * clip.n;
  const i0 = Math.floor(f) % clip.n, i1 = (i0 + 1) % clip.n, t = f - Math.floor(f);
  const q = clip.q, a = i0 * NB * 4, b = i1 * NB * 4;
  for (let k = 0; k < NB * 4; k += 4) {
    // tussen twee frames mengen (kortste weg)
    let s = q[a + k] * q[b + k] + q[a + k + 1] * q[b + k + 1] + q[a + k + 2] * q[b + k + 2] + q[a + k + 3] * q[b + k + 3] < 0 ? -t : t;
    const x = q[a + k] * (1 - t) + q[b + k] * s, y = q[a + k + 1] * (1 - t) + q[b + k + 1] * s;
    const z = q[a + k + 2] * (1 - t) + q[b + k + 2] * s, ww = q[a + k + 3] * (1 - t) + q[b + k + 3] * s;
    // en bij de rest optellen (zelfde halfrond)
    s = accQ[k] * x + accQ[k + 1] * y + accQ[k + 2] * z + accQ[k + 3] * ww < 0 ? -w : w;
    accQ[k] += x * s; accQ[k + 1] += y * s; accQ[k + 2] += z * s; accQ[k + 3] += ww * s;
  }
  const p = clip.p;
  for (let k = 0; k < 3; k++) accP[k] += (p[i0 * 3 + k] * (1 - t) + p[i1 * 3 + k] * t) * w;
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Welke gang hoort bij welke snelheid (m/s)?
// Geeft de gewichten van lopen, joggen en rennen, hoe sterk de gang meetelt t.o.v. stilstaan (amp),
// en de afstand per dubbele stap. De fase van de cyclus loopt met afstand / stap, zodat de voeten
// niet over de grond schuiven. Sneller dan de opname: deels grotere passen, deels een hoger tempo.
const G = { walk: 0, jog: 0, run: 0, amp: 0, stride: 1 };
export function gait(v) {
  const W = CLIPS.walk, J = CLIPS.jog, R = CLIPS.run;
  const sj = smooth(2.0, 3.0, v), sr = smooth(4.6, 5.8, v);
  G.walk = 1 - sj; G.jog = sj * (1 - sr); G.run = sj * sr;
  // langzamer dan een rustige wandelpas: kleinere passen (minder uitslag), niet alleen trager
  const amp = Math.min(1, Math.pow(Math.max(0, v) / 0.75, 0.7));
  G.amp = amp;
  const vw = Math.max(v, 0.75);
  G.stride = amp * (G.walk * W.stride * Math.pow(vw / W.speed, 0.35) + G.jog * J.stride * Math.pow(vw / J.speed, 0.35) + G.run * R.stride * Math.pow(vw / R.speed, 0.5));
  return G;
}
