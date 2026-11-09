// Bakt motion-capturebewegingen van de CMU Graphics Lab Motion Capture Database om naar het skelet
// van de poppetjes (src/character.js) en schrijft ze als kleine JS-module naar src/mocap-data.js.
//
// Gebruik:  node tools/bake-mocap.mjs            (haalt de clips op en schrijft src/mocap-data.js)
//           node tools/bake-mocap.mjs --info     (alleen de meetwaarden tonen, niets schrijven)
//
// Bron: de BVH-omzetting van de CMU-database door Bruce Hahne (cgspeed.com), zoals die op GitHub staat
// in una-dinosauria/cmu-mocap. De data is vrij te gebruiken (zie docs/hd/poppetjes/NOTITIES.md).
// De opgehaalde bestanden komen in node_modules/.cache/cmu-mocap/ (niet in de repository).
//
// Werkwijze per clip:
//  1. BVH inlezen en per frame met voorwaartse kinematica de wereldrotatie en -positie van elk gewricht uitrekenen.
//  2. Eén cyclus uitknippen. Lopen/rennen: van het moment dat de enkels elkaar passeren tot de volgende keer
//     (één dubbele stap). Het kleine verschil tussen begin en eind wordt over de hele cyclus uitgesmeerd,
//     zodat de lus naadloos doorloopt.
//  3. Retargeten: elk bot van het poppetje krijgt de wereldrotatie van het bijpassende mocap-segment, zo
//     omgerekend dat de richting van het botsegment klopt (rusthouding van het poppetje: armen recht omlaag;
//     nulhouding van de mocap: armen opzij, benen 20 graden gespreid). Romp, hoofd en voeten gebruiken de
//     T-houding uit frame 0 van de BVH als nulpunt. Daarna terugrekenen naar rotaties t.o.v. het ouderbot.
//  4. Heuppositie: vooruitgang eraf (die doet de game zelf), de rest (deinen, zwaaien) blijft als verplaatsing
//     van het lichaam. De hoogte wordt zo gezet dat de laagste zool precies de grond raakt.
//  5. Kwantiseren (16 bits) en wegschrijven.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as THREE from 'three';
import { parseBVH, fk, CMU_M } from './mocap-lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(HERE, '..', 'node_modules', '.cache', 'cmu-mocap');
const OUT = path.join(HERE, '..', 'src', 'mocap-data.js');
const BASE = 'https://raw.githubusercontent.com/una-dinosauria/cmu-mocap/master/data';
const INFO = process.argv.includes('--info');

// Welke clips, en wat ermee te doen.
//  type 'gang': één dubbele stap uitknippen (de cyclus die het meest in het midden van de clip ligt)
//  type 'houding': een stuk van t0 tot t1 seconden als rustige lus
const CLIPS = [
  { name: 'walk', src: '35_01', type: 'gang', fps: 30, glad: 2 },
  { name: 'jog', src: '35_17', type: 'gang', fps: 36, glad: 1 },
  { name: 'run', src: '09_01', type: 'gang', fps: 36, glad: 1 },
  { name: 'sit', src: '14_31', type: 'houding', t0: 2.9, t1: 6.7, fps: 10, glad: 6 },
];

// --- skelet van het poppetje (zelfde als in src/character.js) ---
const BONES = [
  ['hips', -1, [0, 0.97, 0]], ['spine', 0, [0, 0.13, 0]], ['chest', 1, [0, 0.2, 0]], ['neck', 2, [0, 0.22, 0]], ['head', 3, [0, 0.1, 0]],
  ['uaL', 2, [-0.2, 0.14, 0]], ['faL', 5, [0, -0.29, 0]], ['hL', 6, [0, -0.26, 0]],
  ['uaR', 2, [0.2, 0.14, 0]], ['faR', 8, [0, -0.29, 0]], ['hR', 9, [0, -0.26, 0]],
  ['thL', 0, [-0.1, -0.03, 0]], ['shL', 11, [0, -0.43, 0]], ['ftL', 12, [0, -0.43, 0]],
  ['thR', 0, [0.1, -0.03, 0]], ['shR', 14, [0, -0.43, 0]], ['ftR', 15, [0, -0.43, 0]],
];
const NB = BONES.length;
const BI = Object.fromEntries(BONES.map((b, i) => [b[0], i]));
// Het poppetje kijkt naar +Z en heeft zijn 'L'-botten aan de kant van -X. In de mocap zit links aan +X.
// We koppelen op plaats (zelfde kant van het lichaam), dus mocap-links hoort bij de 'R'-botten.
const MAP = {
  hips: 'Hips', spine: 'Spine', chest: 'Spine1', neck: 'Neck1', head: 'Head',
  uaL: 'RightArm', faL: 'RightForeArm', hL: 'RightHand', uaR: 'LeftArm', faR: 'LeftForeArm', hR: 'LeftHand',
  thL: 'RightUpLeg', shL: 'RightLeg', ftL: 'RightFoot', thR: 'LeftUpLeg', shR: 'LeftLeg', ftR: 'LeftFoot',
};
// voor ledematen: het kindgewricht dat de richting van het segment in de nulhouding bepaalt
const CHILD = {
  uaL: 'RightForeArm', faL: 'RightHand', hL: 'RightHandIndex1', uaR: 'LeftForeArm', faR: 'LeftHand', hR: 'LeftHandIndex1',
  thL: 'RightLeg', shL: 'RightFoot', thR: 'LeftLeg', shR: 'LeftFoot',
};
const HIP_Y = 0.94;       // hoogte van het heupgewricht van het poppetje in rust
const SOLE = -0.081;      // zool t.o.v. het enkelbot
const SOLE_PTS = [[0, SOLE, -0.08], [0, SOLE, 0.1], [0, SOLE, 0.17]].map((p) => new THREE.Vector3(...p)); // hiel, bal, teen

const DOWN = new THREE.Vector3(0, -1, 0);
const qI = () => new THREE.Quaternion();
// macht van een rotatie (t mag negatief zijn)
function qpow(q, t) {
  const w = Math.min(1, Math.max(-1, q.w));
  let ang = 2 * Math.acos(w);
  const s = Math.sqrt(1 - w * w);
  if (s < 1e-6) return qI();
  if (ang > Math.PI) ang -= 2 * Math.PI;
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(q.x / s, q.y / s, q.z / s), ang * t);
}

async function load(id) {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, id + '.bvh');
  if (!fs.existsSync(file)) {
    const url = `${BASE}/${id.split('_')[0].padStart(3, '0')}/${id}.bvh`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`ophalen mislukt (${r.status}): ${url}`);
    fs.writeFileSync(file, await r.text());
    console.log('opgehaald', url);
  }
  return parseBVH(fs.readFileSync(file, 'utf8'));
}

// Retarget van één bronframe: wereldrotaties van de botten van het poppetje (nog zonder koerscorrectie).
function makeRetargeter(bvh) {
  const J = bvh.byName;
  const tpose = fk(bvh, 0);
  const A = {};
  for (const [bone] of BONES) {
    if (CHILD[bone]) {
      const d = bvh.joints[J[CHILD[bone]]].offset.clone().normalize();
      A[bone] = new THREE.Quaternion().setFromUnitVectors(DOWN, d);
    } else {
      A[bone] = tpose.rot[J[MAP[bone]]].clone().invert();
    }
  }
  return (pose) => BONES.map(([bone]) => pose.rot[J[MAP[bone]]].clone().multiply(A[bone]));
}

// wereldposities van de botten van het poppetje uit lokale rotaties
function gameFK(local, rootPos) {
  const pos = [], rot = [];
  BONES.forEach(([, p, o], i) => {
    if (p < 0) { rot[i] = local[i].clone(); pos[i] = rootPos.clone(); }
    else { rot[i] = rot[p].clone().multiply(local[i]); pos[i] = new THREE.Vector3(...o).applyQuaternion(rot[p]).add(pos[p]); }
  });
  return { pos, rot };
}
function soleMin(g) {
  let m = Infinity;
  for (const k of [BI.ftL, BI.ftR]) for (const p of SOLE_PTS) m = Math.min(m, p.clone().applyQuaternion(g.rot[k]).add(g.pos[k]).y);
  return m;
}

function bake(bvh, cfg) {
  const J = bvh.byName, ft = bvh.frameTime, n = bvh.frames.length;
  const retarget = makeRetargeter(bvh);
  // alle bronframes (frame 0 is de T-houding en doet niet mee)
  const poses = [];
  for (let f = 1; f < n; f++) poses.push(fk(bvh, f));
  const hipMid = (p) => p.pos[J.LeftUpLeg].clone().add(p.pos[J.RightUpLeg]).multiplyScalar(0.5);
  // beenlengte van de bron, voor de schaal
  const legSrc = (bvh.joints[J.LeftLeg].offset.length() + bvh.joints[J.LeftFoot].offset.length()) * CMU_M;
  const ratio = 0.86 / legSrc;

  let s, e, heading, dist = 0, half = false;
  if (cfg.type === 'gang') {
    // globale looprichting
    const a = hipMid(poses[0]), b = hipMid(poses[poses.length - 1]);
    const dir = new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
    // d(f): hoe ver de enkel aan de +X-kant (mocap-links) vóór de andere zit
    const d = poses.map((p) => p.pos[J.LeftFoot].clone().sub(p.pos[J.RightFoot]).dot(dir));
    // kruisingen in beide richtingen; kies het paar (zelfde richting) dat het meest in het midden van de clip ligt
    const cross = [];
    for (let f = 1; f < d.length; f++) {
      if (d[f - 1] < 0 && d[f] >= 0) cross.push({ f: f - 1 + (0 - d[f - 1]) / (d[f] - d[f - 1]), up: true });
      if (d[f - 1] > 0 && d[f] <= 0) cross.push({ f: f - 1 + (0 - d[f - 1]) / (d[f] - d[f - 1]), up: false });
    }
    let best = null;
    for (let i = 0; i + 2 < cross.length; i++) {
      const mid = (cross[i].f + cross[i + 2].f) / 2, score = Math.abs(mid - d.length / 2);
      if (!best || score < best.score) best = { i, score };
    }
    if (!best) throw new Error(`${cfg.src}: geen hele cyclus gevonden (${cross.length} kruisingen)`);
    s = cross[best.i].f; e = cross[best.i + 2].f;
    half = !cross[best.i].up; // begint de cyclus met de andere voet, dan straks een halve cyclus opschuiven
    cfg.kruisingen = cross.map((c) => (c.up ? '+' : '-') + (c.f * ft).toFixed(3)).join(' ');
  } else {
    s = cfg.t0 / ft; e = cfg.t1 / ft;
  }
  // pose op een gebroken frame, gemiddeld over een klein venster (ruis eruit)
  const W = cfg.glad ?? 1;
  const sampleRaw = (f) => {
    const f0 = Math.max(0, Math.min(poses.length - 2, Math.floor(f))), t = Math.min(1, Math.max(0, f - f0));
    const A_ = poses[f0], B_ = poses[f0 + 1];
    const wa = retarget(A_), wb = retarget(B_);
    return { rot: wa.map((q, i) => q.slerp(wb[i], t)), hip: hipMid(A_).lerp(hipMid(B_), t) };
  };
  const sample = (f) => {
    const acc = sampleRaw(f);
    let cnt = 1;
    for (let k = -W; k <= W; k++) {
      if (!k) continue;
      const o = sampleRaw(f + k);
      cnt++;
      acc.rot.forEach((q, i) => q.slerp(o.rot[i], 1 / cnt));
      acc.hip.lerp(o.hip, 1 / cnt);
    }
    return acc;
  };
  const S = sample(s), E = sample(e);
  if (cfg.type === 'gang') {
    const dv = E.hip.clone().sub(S.hip); dv.y = 0;
    dist = dv.length() * CMU_M;
    heading = Math.atan2(dv.x, dv.z);
  } else {
    // kijkrichting van het bekken, gemiddeld
    const fw = new THREE.Vector3();
    for (let i = 0; i <= 20; i++) fw.add(new THREE.Vector3(0, 0, 1).applyQuaternion(sample(s + (e - s) * i / 20).rot[0]));
    heading = Math.atan2(fw.x, fw.z);
  }
  const Hinv = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -heading);
  const dur = (e - s) * ft;
  const N = Math.max(8, Math.round(dur * cfg.fps / 2) * 2);

  // wereldrotaties + heupmidden (in meters, in het stelsel van de looprichting) voor N+1 monsters
  const frames = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, smp = sample(s + (e - s) * u);
    const world = smp.rot.map((q) => Hinv.clone().multiply(q));
    const hip = smp.hip.clone().sub(S.hip).applyQuaternion(Hinv).multiplyScalar(CMU_M * ratio);
    hip.z -= dist * ratio * u; // vooruitgang eraf
    hip.y = smp.hip.y * CMU_M * ratio;
    frames.push({ world, hip });
  }
  // Nek en hoofd: de nulstand van de mocap zegt niet waar 'recht vooruit kijken' is (de T-houding in frame 0
  // is een schatting van de maker van de BVH-omzetting). Daarom ijken we op de beweging zelf: gemiddeld over
  // de cyclus kijkt het hoofd een paar graden omlaag en staat de nek een paar graden naar voren.
  const pitchOf = (b) => {
    const fw = new THREE.Vector3();
    for (const f of frames) fw.add(new THREE.Vector3(0, 0, 1).applyQuaternion(f.world[b]));
    return Math.atan2(-fw.y, Math.hypot(fw.x, fw.z)) * 180 / Math.PI;
  };
  const pitchVoor = ['hips', 'spine', 'chest', 'neck', 'head'].map((k) => Math.round(pitchOf(BI[k])));
  for (const [bone, want] of [['neck', cfg.nek ?? 6], ['head', cfg.hoofd ?? 4]]) {
    const c = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (want - pitchOf(BI[bone])) * Math.PI / 180);
    for (const f of frames) f.world[BI[bone]].multiply(c);
  }
  for (const f of frames) {
    f.local = f.world.map((q, b) => (BONES[b][1] < 0 ? q.clone() : f.world[BONES[b][1]].clone().invert().multiply(q)));
  }
  // lus sluiten: het verschil tussen eind en begin gelijkmatig uitsmeren
  const first = frames[0], last = frames[N];
  const dq = first.local.map((q, b) => q.clone().multiply(last.local[b].clone().invert()));
  const dp = first.hip.clone().sub(last.hip);
  const sluit = Math.max(...dq.map((q) => 2 * Math.acos(Math.min(1, Math.abs(q.w))))) * 180 / Math.PI;
  for (let i = 0; i <= N; i++) {
    const w = i / N - 0.5;
    frames[i].local = frames[i].local.map((q, b) => qpow(dq[b], w).multiply(q).normalize());
    frames[i].hip.addScaledVector(dp, w);
  }
  frames.pop();
  if (half) frames.push(...frames.splice(0, N / 2));

  // plaats van het lichaam: het heupmidden van de mocap moet op het heupmidden van het poppetje vallen
  const meanHip = frames.reduce((a, f) => a.add(f.hip), new THREE.Vector3()).multiplyScalar(1 / N);
  const root = frames.map((f) => {
    const hipBone = new THREE.Vector3(f.hip.x - meanHip.x, f.hip.y, f.hip.z - meanHip.z).sub(new THREE.Vector3(0, -0.03, 0).applyQuaternion(f.local[0]));
    return hipBone;
  });
  // Voeten op de grond. De benen van de proefpersoon zijn niet precies even lang als die van het poppetje
  // (en links en rechts verschillen in de mocap), dus zonder correctie zweeft een voet of zakt hij weg.
  // Per frame: staat er een voet (enkel van de bron laag), dan komt de laagste zool van die voet op de grond.
  // In de zweeffase van het rennen loopt de correctie vloeiend door.
  const lows = frames.map((f, i) => soleMin(gameFK(f.local, root[i])));
  let lift = root.map(() => 0);
  if (cfg.type === 'gang') {
    const corr = lows.map((l) => (l < 0.035 ? -l : null));
    const known = corr.map((c, i) => (c === null ? -1 : i)).filter((i) => i >= 0);
    if (!known.length) throw new Error(cfg.src + ': geen standfase gevonden');
    for (let i = 0; i < N; i++) {
      if (corr[i] !== null) continue;
      // dichtstbijzijnde bekende waarden ervoor en erna (de lus loopt rond)
      let a = i, b = i;
      while (corr[((a % N) + N) % N] === null) a--;
      while (corr[b % N] === null) b++;
      corr[i] = corr[((a % N) + N) % N] + (corr[b % N] - corr[((a % N) + N) % N]) * ((i - a) / (b - a));
    }
    lift = corr.map((c, i) => (corr[(i + N - 1) % N] + 2 * c + corr[(i + 1) % N]) / 4);
  } else {
    // houding: gemiddelde heuphoogte = die van het poppetje (de game bepaalt zelf de zithoogte)
    const mean = root.reduce((a, r) => a + r.y, 0) / N;
    lift = root.map(() => 0.97 - mean);
  }
  root.forEach((r, i) => { r.y += lift[i]; });
  const lows2 = frames.map((f, i) => soleMin(gameFK(f.local, root[i])));
  const off = root.map((r) => new THREE.Vector3(r.x, r.y - 0.97, r.z));

  // meetwaarden
  const knee = (b) => frames.map((f) => 2 * Math.acos(Math.min(1, Math.abs(f.local[b].w))) * 180 / Math.PI);
  const kl = knee(BI.shL), kr = knee(BI.shR);
  const info = {
    bron: cfg.src, frames: N, duur: +dur.toFixed(3), bronSnelheid: +(dist / dur).toFixed(2), beenSchaal: +ratio.toFixed(3),
    stap: +(dist * ratio).toFixed(3), snelheid: +(dist * ratio / dur).toFixed(2),
    kantelingVoorIJken: pitchVoor.join(' '), lusVerschilGraden: +sluit.toFixed(1), lusVerschilHeupCm: +(dp.length() * 100).toFixed(1),
    zoolLaagsteCm: [+(Math.min(...lows2) * 100).toFixed(1), +(Math.max(...lows2) * 100).toFixed(1)],
    lichaamY: [+Math.min(...off.map((o) => o.y)).toFixed(3), +Math.max(...off.map((o) => o.y)).toFixed(3)],
    knieGraden: { L: [Math.round(Math.min(...kl)), Math.round(Math.max(...kl))], R: [Math.round(Math.min(...kr)), Math.round(Math.max(...kr))] },
  };
  if (cfg.kruisingen) info.kruisingenSec = cfg.kruisingen;
  return { N, dur, stride: dist * ratio, frames, off, info };
}

const b64 = (i16) => Buffer.from(i16.buffer, i16.byteOffset, i16.byteLength).toString('base64');

const out = {};
for (const cfg of CLIPS) {
  const bvh = await load(cfg.src);
  const r = bake(bvh, cfg);
  console.log(cfg.name, JSON.stringify(r.info));
  const q = new Int16Array(r.N * NB * 4), p = new Int16Array(r.N * 3);
  r.frames.forEach((f, i) => {
    f.local.forEach((ql, b) => {
      const s = ql.w < 0 ? -1 : 1, o = (i * NB + b) * 4;
      q[o] = Math.round(ql.x * s * 32767); q[o + 1] = Math.round(ql.y * s * 32767); q[o + 2] = Math.round(ql.z * s * 32767); q[o + 3] = Math.round(ql.w * s * 32767);
    });
    const o = r.off[i];
    p[i * 3] = Math.round(o.x * 1e4); p[i * 3 + 1] = Math.round(o.y * 1e4); p[i * 3 + 2] = Math.round(o.z * 1e4);
  });
  out[cfg.name] = { src: cfg.src, n: r.N, dur: +r.dur.toFixed(4), stride: +r.stride.toFixed(4), q: b64(q), p: b64(p) };
}

if (!INFO) {
  const lines = Object.entries(out).map(([k, c]) => `  ${k}: { src: '${c.src}', n: ${c.n}, dur: ${c.dur}, stride: ${c.stride},\n    q: '${c.q}',\n    p: '${c.p}' },`);
  const js = `// GEGENEREERD door tools/bake-mocap.mjs: niet met de hand aanpassen.
// Motion-capturebewegingen uit de CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu), omgerekend naar
// het skelet van de poppetjes. "The data used in this project was obtained from mocap.cs.cmu.edu.
// The database was created with funding from NSF EIA-0196217."
// Per clip: src = proefpersoon_opname bij CMU, n = aantal frames in de lus, dur = duur van de lus in seconden,
// stride = afgelegde afstand per lus in meters (0 bij een houding),
// q = per frame per bot een quaternion (x, y, z, w als 16 bits gehele getallen, base64),
// p = per frame de verplaatsing van het lichaam (x, y, z in tienden van millimeters, base64).
export const MOCAP_BONES = ${JSON.stringify(BONES.map((b) => b[0]))};
export const MOCAP = {
${lines.join('\n')}
};
`;
  fs.writeFileSync(OUT, js);
  console.log('geschreven', path.relative(process.cwd(), OUT), (js.length / 1024).toFixed(1) + ' kB');
}
