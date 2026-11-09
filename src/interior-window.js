// Etalageruit waar je echt naar binnen kijkt, zonder uitbouw: "interior mapping".
// Het glas is een plat vlak op de gevel; de shader rekent per pixel uit welke muur, vloer of welk plafond
// van een denkbeeldige kamer erachter je door het glas ziet. Daarvoor staat een laag met toonbank en mensen.
// Als je langsloopt verschuift alles mee, alsof je echt naar binnen kijkt.
import * as THREE from 'three';

const W = 512, H = 256;
const cache = new Map();
const rnd = (seed) => { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

// ---- tekenhulpjes
function person(c, x, y, s, { shirt = '#1e88e5', skin = '#e8b48a', hair = '#3b2a1a', apron = null, hat = null, arm = 0 } = {}) {
  // y = voeten; s = lengte in pixels
  c.save(); c.translate(x, y);
  c.fillStyle = '#2b2b2b'; c.fillRect(-s * 0.09, -s * 0.42, s * 0.08, s * 0.42); c.fillRect(s * 0.01, -s * 0.42, s * 0.08, s * 0.42); // benen
  c.fillStyle = shirt; c.beginPath(); c.roundRect(-s * 0.15, -s * 0.8, s * 0.3, s * 0.42, s * 0.06); c.fill(); // romp
  if (apron) { c.fillStyle = apron; c.fillRect(-s * 0.12, -s * 0.66, s * 0.24, s * 0.4); }
  c.fillStyle = shirt; c.save(); c.translate(s * 0.14, -s * 0.76); c.rotate(-arm); c.fillRect(0, 0, s * 0.07, s * 0.32); c.restore(); // arm
  c.fillStyle = skin; c.beginPath(); c.arc(0, -s * 0.89, s * 0.1, 0, 7); c.fill(); // hoofd
  c.fillStyle = hair; c.beginPath(); c.arc(0, -s * 0.92, s * 0.1, Math.PI, 0); c.fill();
  if (hat === 'chef') { c.fillStyle = '#fff'; c.fillRect(-s * 0.08, -s * 1.08, s * 0.16, s * 0.12); c.beginPath(); c.arc(0, -s * 1.08, s * 0.1, Math.PI, 0); c.fill(); }
  if (hat === 'cap') { c.fillStyle = shirt; c.fillRect(-s * 0.1, -s * 1.0, s * 0.2, s * 0.05); }
  c.restore();
}
function shelves(c, x, y, w, h, rows, item) {
  c.fillStyle = '#6d5a48'; c.fillRect(x, y, w, h);
  c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x + 4, y + 4, w - 8, h - 8);
  for (let r = 0; r < rows; r++) {
    const sy = y + ((r + 1) * h) / rows;
    c.fillStyle = '#8d7a66'; c.fillRect(x, sy - 4, w, 4);
    item(x + 6, sy - 4, w - 12, h / rows - 8, r);
  }
}
function boxes(colors, rand) {
  return (x, y, w, h) => { let cx = x; while (cx < x + w - 8) { const bw = 8 + rand() * 12, bh = h * (0.5 + rand() * 0.45); c2.fillStyle = colors[Math.floor(rand() * colors.length)]; c2.fillRect(cx, y - bh, bw, bh); cx += bw + 2; } };
}
let c2 = null; // huidige context voor de kleine helpers

function counter(c, x, y, w, h, color = '#7a5236', top = '#d7ccc8') {
  c.fillStyle = color; c.fillRect(x, y, w, h);
  c.fillStyle = top; c.fillRect(x - 4, y - 6, w + 8, 8);
  c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(x + 6, y + 8, w - 12, 3);
}
function lamp(c, x, y) { c.fillStyle = '#fff8e1'; c.beginPath(); c.ellipse(x, y, 16, 5, 0, 0, 7); c.fill(); }

// ---- per soort zaak: achterwand (back) en de laag ervoor (mid: toonbank, mensen)
const SHIRTS = ['#1e88e5', '#e53935', '#43a047', '#fdd835', '#8e24aa', '#ff7043', '#00acc1', '#5d4037', '#90a4ae'];
function drawRoom(type, seed) {
  const back = document.createElement('canvas'); back.width = W; back.height = H;
  const mid = document.createElement('canvas'); mid.width = W; mid.height = H;
  const b = back.getContext('2d'), m = mid.getContext('2d');
  const rand = rnd(seed);
  const shirt = () => SHIRTS[Math.floor(rand() * SHIRTS.length)];
  c2 = b;
  const wall = { cafe: '#6b4a32', friture: '#f3e5ab', grill: '#5d4037', bakker: '#f1e2c2', slager: '#eeeeee', ijs: '#fde4ee', choco: '#4e342e', apotheek: '#f5f5f5', drogist: '#fafafa', opticien: '#eceff1', warenhuis: '#fafafa', speelgoed: '#fff8e1', elektro: '#eceff1', ijzer: '#cfd8dc', bier: '#2e4a32', grieks: '#e3f2fd', restaurant: '#3e2f25', pannenkoek: '#f6e7c8', keukens: '#efebe9', vvv: '#e3f2fd', gemeente: '#f5f1e6', wonen: '#fff3e0', zwembad: '#b3e5fc', supermarkt: '#f5f5f5', fietsen: '#eceff1', brouwerij: '#5d4037', deli: '#f1e2c2' }[type] || '#ece5d8';
  b.fillStyle = wall; b.fillRect(0, 0, W, H);
  b.fillStyle = 'rgba(0,0,0,0.08)'; b.fillRect(0, H * 0.75, W, H * 0.25); // plint
  for (const lx of [W * 0.25, W * 0.5, W * 0.75]) lamp(b, lx, 14);
  const pal = {
    apotheek: ['#e3f2fd', '#c8e6c9', '#fff9c4', '#ffccbc', '#ffffff', '#b3e5fc'],
    drogist: ['#f8bbd0', '#e1bee7', '#ffffff', '#b2ebf2', '#ffe0b2'],
    warenhuis: ['#c8102e', '#ffffff', '#ffcdd2', '#90caf9', '#fff59d', '#a5d6a7'],
    speelgoed: ['#e53935', '#fdd835', '#1e88e5', '#43a047', '#ff7043', '#8e24aa'],
    ijzer: ['#78909c', '#ffb300', '#d32f2f', '#455a64', '#8d6e63'],
    supermarkt: ['#e53935', '#fdd835', '#43a047', '#1e88e5', '#ff9800', '#ffffff', '#8d6e63'],
    wonen: ['#ef9a9a', '#90caf9', '#a5d6a7', '#fff59d', '#ce93d8', '#ffcc80', '#80cbc4'],
    vvv: ['#0a5aa8', '#ffffff', '#43a047', '#fdd835', '#e3f2fd'],
    deli: ['#8d6e63', '#a1887f', '#c62828', '#fdd835', '#558b2f'],
    choco: ['#3e2316', '#8d5a3b', '#e8c48a', '#c62828', '#d4af37'],
  };
  const tall = (x, w, rows, colors) => shelves(b, x, H * 0.18, w, H * 0.6, rows, boxes(colors, rand));
  let staff = { shirt: shirt() }, customers = 1 + Math.floor(rand() * 2), counterColor = '#7a5236', counterTop = '#d7ccc8';
  switch (type) {
    case 'cafe': case 'bier': case 'brouwerij': {
      // achterbar met flessen en tap, spiegel
      b.fillStyle = '#3e2a1e'; b.fillRect(W * 0.1, H * 0.2, W * 0.8, H * 0.5);
      b.fillStyle = 'rgba(255,255,255,0.12)'; b.fillRect(W * 0.14, H * 0.22, W * 0.72, H * 0.2);
      for (let i = 0; i < 26; i++) { b.fillStyle = ['#2e7d32', '#795548', '#f9a825', '#c62828', '#e0e0e0'][i % 5]; b.fillRect(W * 0.12 + i * W * 0.029, H * 0.47 - (i % 3) * 3, 7, 22 + (i % 3) * 3); }
      if (type === 'brouwerij') { for (let i = 0; i < 3; i++) { b.fillStyle = '#b0bec5'; b.beginPath(); b.ellipse(W * (0.25 + i * 0.25), H * 0.5, 34, 60, 0, 0, 7); b.fill(); } }
      staff = { shirt: '#111', apron: '#f5f5f5' }; counterColor = '#4e342e'; counterTop = '#8d6e63'; customers = 2 + Math.floor(rand() * 2);
      break;
    }
    case 'friture': case 'grill': {
      b.fillStyle = '#b0bec5'; b.fillRect(W * 0.15, H * 0.42, W * 0.7, H * 0.3); // frituur/grill
      b.fillStyle = '#ffb300'; for (let i = 0; i < 4; i++) b.fillRect(W * (0.2 + i * 0.16), H * 0.45, W * 0.1, H * 0.06);
      b.fillStyle = '#263238'; b.fillRect(W * 0.2, H * 0.1, W * 0.6, H * 0.16); // menubord
      b.fillStyle = '#fff'; for (let i = 0; i < 4; i++) b.fillRect(W * 0.24, H * (0.13 + i * 0.03), W * (0.2 + (i % 2) * 0.15), 3);
      staff = { shirt: '#fff', apron: type === 'grill' ? '#2e7d32' : '#d32f2f', hat: 'cap' }; counterTop = '#eceff1';
      break;
    }
    case 'bakker': case 'deli': {
      shelves(b, W * 0.08, H * 0.18, W * 0.84, H * 0.5, 3, (x, y, w, h) => { for (let cx = x; cx < x + w - 20; cx += 28) { b.fillStyle = type === 'deli' ? pal.deli[Math.floor(rand() * 5)] : '#b9773a'; b.beginPath(); b.ellipse(cx + 12, y - h * 0.35, 12, h * 0.32, 0, 0, 7); b.fill(); } });
      staff = { shirt: '#fff', apron: '#f1e2c2', hat: 'chef' }; counterColor = '#efebe9'; counterTop = '#bcaaa4';
      break;
    }
    case 'slager': {
      b.fillStyle = '#c62828'; for (let i = 0; i < 9; i++) { b.fillRect(W * (0.12 + i * 0.085), H * 0.18, 6, 34); b.beginPath(); b.ellipse(W * (0.12 + i * 0.085) + 3, H * 0.18 + 40, 9, 14, 0, 0, 7); b.fill(); }
      staff = { shirt: '#fff', apron: '#7a1f1f' }; counterColor = '#eceff1'; counterTop = '#e57373';
      break;
    }
    case 'ijs': {
      b.fillStyle = '#7a1f4a'; b.fillRect(W * 0.2, H * 0.12, W * 0.6, H * 0.14);
      staff = { shirt: '#f7c6d9', apron: '#fff' }; counterColor = '#f8bbd0'; counterTop = '#fce4ec';
      break;
    }
    case 'choco': tall(W * 0.06, W * 0.88, 3, pal.choco); staff = { shirt: '#fff', apron: '#3e2316' }; counterColor = '#5d4037'; counterTop = '#e8c48a'; break;
    case 'apotheek': case 'drogist': tall(W * 0.05, W * 0.9, 4, pal[type]); staff = { shirt: '#fff' }; counterColor = '#eceff1'; counterTop = type === 'apotheek' ? '#1b7a3a' : '#c8102e'; break;
    case 'opticien': {
      b.fillStyle = '#cfd8dc'; b.fillRect(W * 0.06, H * 0.16, W * 0.88, H * 0.56);
      b.strokeStyle = '#263238'; b.lineWidth = 2;
      for (let r = 0; r < 5; r++) for (let i = 0; i < 12; i++) { const x = W * 0.1 + i * W * 0.068, y = H * 0.24 + r * H * 0.1; b.beginPath(); b.arc(x, y, 6, 0, 7); b.arc(x + 15, y, 6, 0, 7); b.stroke(); }
      staff = { shirt: '#0f2b52' }; counterColor = '#fafafa'; counterTop = '#0f2b52';
      break;
    }
    case 'warenhuis': case 'speelgoed': case 'ijzer': case 'supermarkt': case 'wonen': case 'vvv':
      tall(W * 0.04, W * 0.44, 4, pal[type]); tall(W * 0.52, W * 0.44, 4, pal[type]);
      if (type === 'vvv') { b.fillStyle = '#a5d6a7'; b.fillRect(W * 0.3, H * 0.05, W * 0.4, H * 0.1); }
      staff = { shirt: { warenhuis: '#c8102e', speelgoed: '#ffd400', ijzer: '#1f3b5a', supermarkt: '#e53935', wonen: '#ef7d00', vvv: '#0a5aa8' }[type] };
      customers = 2;
      break;
    case 'elektro': {
      for (let i = 0; i < 5; i++) { b.fillStyle = '#111'; b.fillRect(W * (0.07 + i * 0.18), H * 0.18, W * 0.15, H * 0.2); b.fillStyle = ['#1e88e5', '#43a047', '#ff7043', '#8e24aa', '#fdd835'][i]; b.fillRect(W * (0.075 + i * 0.18), H * 0.19, W * 0.14, H * 0.18); }
      for (let i = 0; i < 4; i++) { b.fillStyle = '#fafafa'; b.fillRect(W * (0.12 + i * 0.2), H * 0.5, W * 0.13, H * 0.25); b.fillStyle = '#90a4ae'; b.beginPath(); b.arc(W * (0.185 + i * 0.2), H * 0.63, 14, 0, 7); b.fill(); }
      staff = { shirt: '#0b3c8c' };
      break;
    }
    case 'keukens': {
      b.fillStyle = '#eceff1'; b.fillRect(W * 0.05, H * 0.45, W * 0.9, H * 0.3); b.fillStyle = '#263238'; b.fillRect(W * 0.05, H * 0.43, W * 0.9, 6);
      b.fillStyle = '#cfd8dc'; for (let i = 0; i < 6; i++) b.fillRect(W * (0.07 + i * 0.15), H * 0.15, W * 0.13, H * 0.2);
      staff = { shirt: '#263238' }; counterColor = '#fafafa'; counterTop = '#263238';
      break;
    }
    case 'gemeente': {
      for (let i = 0; i < 3; i++) { b.fillStyle = '#90a4ae'; b.fillRect(W * (0.1 + i * 0.3), H * 0.4, W * 0.22, H * 0.35); b.fillStyle = '#1b2430'; b.fillRect(W * (0.12 + i * 0.3), H * 0.25, W * 0.18, H * 0.08); b.fillStyle = '#fff'; b.font = '700 16px sans-serif'; b.fillText(`Loket ${i + 1}`, W * (0.13 + i * 0.3), H * 0.31); }
      staff = { shirt: '#546e7a' }; customers = 3;
      break;
    }
    case 'zwembad': { b.fillStyle = '#0288d1'; b.fillRect(0, H * 0.55, W, H * 0.45); b.fillStyle = 'rgba(255,255,255,0.3)'; for (let i = 0; i < 8; i++) b.fillRect(i * 64, H * 0.6 + (i % 2) * 6, 40, 3); staff = { shirt: '#0288d1' }; break; }
    case 'fietsen': {
      b.strokeStyle = '#263238'; b.lineWidth = 3;
      for (let i = 0; i < 5; i++) { const x = W * (0.12 + i * 0.18), y = H * 0.62; b.beginPath(); b.arc(x, y, 16, 0, 7); b.arc(x + 40, y, 16, 0, 7); b.moveTo(x, y); b.lineTo(x + 18, y - 22); b.lineTo(x + 40, y); b.stroke(); }
      staff = { shirt: '#2b2b2b', apron: '#5a3b22' };
      break;
    }
    case 'restaurant': case 'grieks': case 'pannenkoek': {
      // tafeltjes met gasten
      b.fillStyle = type === 'grieks' ? '#0d47a1' : '#5d4037'; b.fillRect(0, H * 0.7, W, 6);
      for (let i = 0; i < 3; i++) { const x = W * (0.2 + i * 0.3); b.fillStyle = '#fff'; b.fillRect(x - 34, H * 0.6, 68, 6); b.fillStyle = '#8d6e63'; b.fillRect(x - 3, H * 0.6, 6, 40); person(b, x - 30, H * 0.78, 70, { shirt: shirt() }); person(b, x + 30, H * 0.78, 66, { shirt: shirt() }); }
      staff = { shirt: '#111', apron: '#fff' }; customers = 0;
      break;
    }
    default: tall(W * 0.05, W * 0.9, 4, ['#90a4ae', '#ffcc80', '#a5d6a7', '#ef9a9a', '#fff59d']);
  }
  // ---- laag ervoor: toonbank, personeel erachter, klanten ervoor
  const cy = H * 0.66;
  person(m, W * (0.35 + rand() * 0.3), cy + 8, 120, { ...staff, arm: rand() * 0.6 });
  counter(m, W * 0.18, cy, W * 0.64, H - cy, counterColor, counterTop);
  if (type === 'ijs') { const fl = ['#fff3c4', '#f48fb1', '#6d4c41', '#aed581', '#fff176']; for (let i = 0; i < 8; i++) { m.fillStyle = fl[i % 5]; m.fillRect(W * 0.21 + i * W * 0.072, cy - 10, W * 0.06, 12); } }
  if (type === 'slager' || type === 'bakker' || type === 'deli' || type === 'choco') { m.fillStyle = 'rgba(255,255,255,0.25)'; m.fillRect(W * 0.19, cy - 26, W * 0.62, 24); }
  for (let i = 0; i < customers; i++) person(m, W * (0.12 + i * 0.3 + rand() * 0.1), H * 0.99, 150 + rand() * 25, { shirt: shirt(), hair: ['#3b2a1a', '#e6c770', '#111', '#9e9e9e'][Math.floor(rand() * 4)], arm: rand() * 0.8 });
  const tb = new THREE.CanvasTexture(back); tb.colorSpace = THREE.SRGBColorSpace;
  const tm = new THREE.CanvasTexture(mid); tm.colorSpace = THREE.SRGBColorSpace;
  return { back: tb, mid: tm, wall: new THREE.Color(wall) };
}

const vert = `
  varying vec3 vPos; varying vec3 vCam;
  void main() {
    vPos = position;
    vCam = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const frag = `
  uniform sampler2D tBack; uniform sampler2D tMid; uniform vec3 uWall; uniform vec2 uSize; uniform float uDepth; uniform float uNight;
  varying vec3 vPos; varying vec3 vCam;
  void main() {
    vec2 uv = vPos.xy / uSize + 0.5;
    vec3 d = normalize(vPos - vCam);
    d = vec3(d.x / uSize.x, d.y / uSize.y, d.z / uDepth); // naar een kamer van 1 x 1 x 1
    if (d.z > -1e-4) d.z = -1e-4;
    float tx = d.x > 0.0 ? (1.0 - uv.x) / d.x : -uv.x / min(d.x, -1e-5);
    float ty = d.y > 0.0 ? (1.0 - uv.y) / d.y : -uv.y / min(d.y, -1e-5);
    float tz = 1.0 / -d.z;
    float t = min(tx, min(ty, tz));
    vec3 hit = vec3(uv, 0.0) + d * t;
    vec3 col;
    float shade = 1.0;
    if (t == tz) col = texture2D(tBack, hit.xy).rgb;
    else if (t == ty && d.y < 0.0) { col = mix(vec3(0.42, 0.36, 0.3), vec3(0.55, 0.5, 0.44), step(0.5, fract(hit.x * 6.0 + floor(-hit.z * 4.0) * 0.5))); shade = 0.9; } // vloer met tegels
    else if (t == ty) { col = vec3(0.92, 0.9, 0.86); shade = 0.8; } // plafond
    else { col = uWall; shade = 0.75 + 0.25 * (1.0 + hit.z); } // zijmuren
    col *= shade * mix(0.85, 1.0, 1.0 + hit.z * 0.3);
    // laag met toonbank en mensen op een derde van de diepte
    float tm = 0.38 / -d.z;
    if (tm < t) {
      vec3 hm = vec3(uv, 0.0) + d * tm;
      if (hm.x > 0.0 && hm.x < 1.0 && hm.y > 0.0 && hm.y < 1.0) {
        vec4 m = texture2D(tMid, hm.xy);
        col = mix(col, m.rgb, m.a);
      }
    }
    // binnen brandt licht: overdag iets donkerder dan buiten, 's avonds warm en helder
    col *= mix(0.78, 1.25, uNight) * mix(vec3(1.0), vec3(1.08, 0.98, 0.85), uNight);
    // spiegeling van de lucht in het glas (sterker als je schuin kijkt)
    float fres = pow(1.0 - abs(normalize(vCam - vPos).z), 3.0);
    col = mix(col, vec3(0.75, 0.82, 0.9), 0.12 + fres * 0.45 * (1.0 - uNight * 0.7));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;

// Etalageruit met een kijkje naar binnen. type = soort zaak (zie drawRoom), seed varieert de inrichting.
export function makeInteriorWindow(w, h, type = 'winkel', seed = 1) {
  const key = type + ':' + (seed % 3);
  if (!cache.has(key)) cache.set(key, drawRoom(type, seed));
  const room = cache.get(key);
  const mat = new THREE.ShaderMaterial({
    uniforms: { tBack: { value: room.back }, tMid: { value: room.mid }, uWall: { value: room.wall }, uSize: { value: new THREE.Vector2(w, h) }, uDepth: { value: 3.2 }, uNight: { value: 0 } },
    vertexShader: vert, fragmentShader: frag,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.userData.setNight = (t) => { mat.uniforms.uNight.value = t; };
  return mesh;
}
