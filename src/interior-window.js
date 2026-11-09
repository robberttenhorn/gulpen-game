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


// ---- kamers in een woonhuis (achterkant van Ringweg 38): geen toonbank, geen personeel
const HOME = {
  // eetkamer: houten tafel met zes stoelen, hanglamp, dressoir en schilderijen
  eetkamer(b, m, rand) {
    b.fillStyle = 'rgba(0,0,0,0.06)'; b.fillRect(0, H * 0.78, W, H * 0.22);
    // dressoir met spullen erop
    b.fillStyle = '#6d4c33'; b.fillRect(W * 0.1, H * 0.5, W * 0.34, H * 0.28);
    b.fillStyle = '#5a3d28'; for (let i = 0; i < 3; i++) b.fillRect(W * (0.115 + i * 0.11), H * 0.54, W * 0.1, H * 0.2);
    b.fillStyle = '#e0e0e0'; b.fillRect(W * 0.16, H * 0.42, 14, 26); b.fillStyle = '#2e7d32'; b.beginPath(); b.arc(W * 0.38, H * 0.42, 16, 0, 7); b.fill(); b.fillStyle = '#8d6e63'; b.fillRect(W * 0.37, H * 0.44, 10, 18);
    // schilderijen
    b.fillStyle = '#3e2723'; b.fillRect(W * 0.55, H * 0.14, W * 0.2, H * 0.3); b.fillStyle = '#90caf9'; b.fillRect(W * 0.56, H * 0.16, W * 0.18, H * 0.13); b.fillStyle = '#9ccc65'; b.fillRect(W * 0.56, H * 0.29, W * 0.18, H * 0.13);
    b.fillStyle = '#3e2723'; b.fillRect(W * 0.8, H * 0.2, W * 0.1, H * 0.2); b.fillStyle = '#ffcc80'; b.fillRect(W * 0.81, H * 0.22, W * 0.08, H * 0.16);
    // hanglamp boven de tafel
    m.strokeStyle = '#333'; m.lineWidth = 2; m.beginPath(); m.moveTo(W * 0.5, 0); m.lineTo(W * 0.5, H * 0.3); m.stroke();
    m.fillStyle = '#263238'; m.beginPath(); m.moveTo(W * 0.43, H * 0.38); m.lineTo(W * 0.57, H * 0.38); m.lineTo(W * 0.53, H * 0.3); m.lineTo(W * 0.47, H * 0.3); m.closePath(); m.fill();
    m.fillStyle = 'rgba(255,240,200,0.9)'; m.beginPath(); m.ellipse(W * 0.5, H * 0.385, W * 0.06, 4, 0, 0, 7); m.fill();
    // stoelen achter de tafel (ruggen boven het blad uit) en aan de koppen
    const chairBack = (x, y, w, h) => { m.fillStyle = '#7a5434'; m.fillRect(x - w / 2, y - h, w, h); m.fillStyle = '#8f6440'; for (let k = 0; k < 3; k++) m.fillRect(x - w / 2 + 3, y - h + 4 + k * (h / 3), w - 6, h / 6); };
    for (const x of [0.38, 0.62]) chairBack(W * x, H * 0.66, 34, 46);
    for (const x of [0.2, 0.8]) chairBack(W * x, H * 0.74, 30, 56);
    // tafelblad en poten
    m.fillStyle = '#9a7048'; m.fillRect(W * 0.25, H * 0.64, W * 0.5, 10); m.fillStyle = '#7a5434'; m.fillRect(W * 0.25, H * 0.68, W * 0.5, 4);
    m.fillStyle = '#7a5434'; for (const x of [0.27, 0.72]) m.fillRect(W * x, H * 0.68, 8, H * 0.24);
    // fruitschaal en twee glazen op tafel
    m.fillStyle = '#eceff1'; m.beginPath(); m.ellipse(W * 0.5, H * 0.635, 26, 6, 0, 0, 7); m.fill();
    for (const [dx, c] of [[-10, '#e53935'], [4, '#fdd835'], [14, '#7cb342']]) { m.fillStyle = c; m.beginPath(); m.arc(W * 0.5 + dx, H * 0.6, 7, 0, 7); m.fill(); }
    m.fillStyle = 'rgba(200,230,255,0.7)'; m.fillRect(W * 0.34, H * 0.585, 6, 14); m.fillRect(W * 0.64, H * 0.585, 6, 14);
    // twee stoelen aan de voorkant (ruggen naar je toe), onder de rand
    for (const x of [0.38, 0.62]) { m.fillStyle = '#6a472b'; m.fillRect(W * x - 22, H * 0.74, 44, H * 0.26); m.fillStyle = '#7f5836'; for (let k = 0; k < 3; k++) m.fillRect(W * x - 18, H * 0.76 + k * 16, 36, 8); }
  },
  // serre: twee comfortabele oranje stoelen, een schildersezel met een schilderij, planten en glas met de tuin erachter
  serre(b, m, rand) {
    // achterwand van glas met de tuin erachter
    b.fillStyle = '#b9d7a8'; b.fillRect(0, 0, W, H * 0.8);
    b.fillStyle = '#7fae69'; for (let i = 0; i < 9; i++) { b.beginPath(); b.arc(rand() * W, H * (0.5 + rand() * 0.25), 30 + rand() * 30, 0, 7); b.fill(); }
    b.fillStyle = '#cfe3f2'; b.fillRect(0, 0, W, H * 0.35);
    b.fillStyle = '#eceff1'; for (let i = 0; i <= 5; i++) b.fillRect(i * W / 5 - 4, 0, 8, H * 0.8); b.fillRect(0, H * 0.33, W, 6); b.fillRect(0, H * 0.78, W, 10);
    // planten in potten
    for (const x of [0.06, 0.94]) { b.fillStyle = '#b5653b'; b.fillRect(W * x - 18, H * 0.66, 36, 26); b.fillStyle = '#3f7a34'; for (let k = 0; k < 6; k++) { b.beginPath(); b.ellipse(W * x + (rand() - 0.5) * 30, H * (0.45 + rand() * 0.2), 10, 22, (rand() - 0.5) * 1.2, 0, 7); b.fill(); } }
    // schildersezel met een schilderij (een zonnig landschap met de Gulperberg)
    const ex = W * 0.72;
    m.strokeStyle = '#8d6e4a'; m.lineWidth = 6; m.lineCap = 'round';
    m.beginPath(); m.moveTo(ex - 34, H * 0.98); m.lineTo(ex, H * 0.2); m.lineTo(ex + 34, H * 0.98); m.moveTo(ex, H * 0.2); m.lineTo(ex + 6, H * 0.95); m.stroke();
    m.fillStyle = '#8d6e4a'; m.fillRect(ex - 44, H * 0.66, 88, 6);
    m.fillStyle = '#f5f0e6'; m.fillRect(ex - 46, H * 0.3, 92, 70);
    m.fillStyle = '#7ec8f0'; m.fillRect(ex - 42, H * 0.32, 84, 28);
    m.fillStyle = '#6aa84f'; m.beginPath(); m.moveTo(ex - 42, H * 0.62); m.quadraticCurveTo(ex - 10, H * 0.38, ex + 42, H * 0.5); m.lineTo(ex + 42, H * 0.57); m.lineTo(ex - 42, H * 0.57); m.fill();
    m.fillStyle = '#ffd54f'; m.beginPath(); m.arc(ex + 26, H * 0.38, 7, 0, 7); m.fill();
    m.fillStyle = '#e57373'; m.fillRect(ex - 20, H * 0.5, 10, 8); m.fillStyle = '#5d4037'; m.fillRect(ex - 22, H * 0.47, 14, 4);
    // twee comfortabele oranje fauteuils, een beetje naar elkaar toe
    const armchair = (x, flip) => {
      m.save(); m.translate(x, H * 0.97); m.scale(flip ? -1 : 1, 1);
      m.fillStyle = '#c75b1f'; m.beginPath(); m.roundRect(-46, -112, 92, 70, 22); m.fill(); // rugleuning
      m.fillStyle = '#e8792f'; m.beginPath(); m.roundRect(-52, -60, 104, 40, 14); m.fill(); // zitting
      m.fillStyle = '#d96a26'; m.beginPath(); m.roundRect(-60, -78, 22, 58, 10); m.fill(); m.beginPath(); m.roundRect(38, -78, 22, 58, 10); m.fill(); // armleuningen
      m.fillStyle = '#f39a5a'; m.beginPath(); m.roundRect(-34, -104, 68, 10, 5); m.fill(); // licht op de bovenrand
      m.fillStyle = '#4e342e'; m.fillRect(-48, -20, 8, 20); m.fillRect(40, -20, 8, 20);
      m.restore();
    };
    armchair(W * 0.2, false);
    armchair(W * 0.44, true);
    // bijzettafeltje met een kop thee
    m.fillStyle = '#5d4037'; m.fillRect(W * 0.315, H * 0.76, 26, 6); m.fillRect(W * 0.315 + 11, H * 0.78, 4, H * 0.19);
    m.fillStyle = '#fafafa'; m.fillRect(W * 0.315 + 8, H * 0.73, 10, 8);
  },
};

// ---- per soort zaak: achterwand (back) en de laag ervoor (mid: toonbank, mensen)
const SHIRTS = ['#1e88e5', '#e53935', '#43a047', '#fdd835', '#8e24aa', '#ff7043', '#00acc1', '#5d4037', '#90a4ae'];
function drawRoom(type, seed) {
  const back = document.createElement('canvas'); back.width = W; back.height = H;
  const mid = document.createElement('canvas'); mid.width = W; mid.height = H;
  const b = back.getContext('2d'), m = mid.getContext('2d');
  const rand = rnd(seed);
  const shirt = () => SHIRTS[Math.floor(rand() * SHIRTS.length)];
  c2 = b;
  const wall = { cafe: '#6b4a32', friture: '#f3e5ab', grill: '#5d4037', bakker: '#f1e2c2', slager: '#eeeeee', ijs: '#fde4ee', choco: '#4e342e', apotheek: '#f5f5f5', drogist: '#fafafa', opticien: '#eceff1', warenhuis: '#fafafa', speelgoed: '#fff8e1', elektro: '#eceff1', ijzer: '#cfd8dc', bier: '#2e4a32', grieks: '#e3f2fd', restaurant: '#3e2f25', pannenkoek: '#f6e7c8', keukens: '#efebe9', vvv: '#e3f2fd', gemeente: '#f5f1e6', wonen: '#fff3e0', zwembad: '#b3e5fc', supermarkt: '#f5f5f5', fietsen: '#eceff1', brouwerij: '#5d4037', deli: '#f1e2c2', kleding: '#f5f5f5', damesmode: '#f8eef0', ballonnen: '#fff3fa', kapper: '#2b2b2b', kantoor: '#ece9e2', tijdschriften: '#f3eefb', lunchroom: '#efe3cf', eetkamer: '#efe4d2', serre: '#eef2ea' }[type] || '#ece5d8';
  b.fillStyle = wall; b.fillRect(0, 0, W, H);
  if (HOME[type]) {
    HOME[type](b, m, rand);
    const hb = new THREE.CanvasTexture(back); hb.colorSpace = THREE.SRGBColorSpace;
    const hm = new THREE.CanvasTexture(mid); hm.colorSpace = THREE.SRGBColorSpace;
    return { back: hb, mid: hm, wall: new THREE.Color(wall) };
  }
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
    case 'kleding': {
      // kledingrekken met hangers en een paspop
      for (let r = 0; r < 2; r++) { const y = H * (0.28 + r * 0.24); b.fillStyle = '#9e9e9e'; b.fillRect(W * 0.06, y, W * 0.88, 3); for (let i = 0; i < 26; i++) { b.fillStyle = ['#1565c0', '#e53935', '#fdd835', '#43a047', '#212121', '#ffffff', '#8e24aa', '#ff7043'][Math.floor(rand() * 8)]; b.fillRect(W * 0.07 + i * W * 0.033, y + 3, W * 0.026, H * 0.17); } }
      staff = { shirt: '#0060a8' }; customers = 2;
      break;
    }
    case 'damesmode': {
      // jurken en blouses aan rekken, een paspop en een passpiegel
      for (let r = 0; r < 2; r++) { const y = H * (0.24 + r * 0.26); b.fillStyle = '#c9a227'; b.fillRect(W * 0.05, y, W * 0.6, 3); for (let i = 0; i < 16; i++) { b.fillStyle = ['#f48fb1', '#ce93d8', '#fff59d', '#80cbc4', '#ffffff', '#5a2236', '#ffab91'][Math.floor(rand() * 7)]; b.beginPath(); b.moveTo(W * 0.06 + i * W * 0.037, y + 3); b.lineTo(W * 0.06 + i * W * 0.037 + W * 0.03, y + 3); b.lineTo(W * 0.06 + i * W * 0.037 + W * 0.036, y + H * 0.2); b.lineTo(W * 0.06 + i * W * 0.037 - W * 0.006, y + H * 0.2); b.fill(); } }
      b.fillStyle = '#d7ccc8'; b.fillRect(W * 0.72, H * 0.15, W * 0.12, H * 0.6); b.fillStyle = 'rgba(255,255,255,0.4)'; b.fillRect(W * 0.735, H * 0.17, W * 0.04, H * 0.56); // passpiegel
      b.fillStyle = '#5a2236'; b.beginPath(); b.ellipse(W * 0.9, H * 0.4, 18, 34, 0, 0, 7); b.fill(); b.fillRect(W * 0.9 - 2, H * 0.48, 4, H * 0.25); // paspop
      staff = { shirt: '#5a2236' }; customers = 2;
      break;
    }
    case 'ballonnen': {
      // overal ballonnen, cijferballonnen en slingers
      for (let i = 0; i < 40; i++) { const x = rand() * W, y = H * (0.05 + rand() * 0.5); b.strokeStyle = 'rgba(0,0,0,0.25)'; b.beginPath(); b.moveTo(x, y + 14); b.lineTo(x + (rand() - 0.5) * 10, y + 60); b.stroke(); b.fillStyle = ['#ff4fa3', '#ffd54f', '#4fc3f7', '#69f0ae', '#e040fb', '#ff7043', '#ffffff', '#c0c0c0'][Math.floor(rand() * 8)]; b.beginPath(); b.ellipse(x, y, 12, 15, 0, 0, 7); b.fill(); b.fillStyle = 'rgba(255,255,255,0.5)'; b.beginPath(); b.arc(x - 4, y - 5, 3, 0, 7); b.fill(); }
      b.fillStyle = '#d4af37'; b.font = '900 70px sans-serif'; b.fillText('50', W * 0.65, H * 0.62);
      b.strokeStyle = '#ff4fa3'; b.lineWidth = 3; b.beginPath(); for (let x = 0; x <= W; x += 20) b.lineTo(x, H * 0.08 + Math.sin(x * 0.05) * 6); b.stroke();
      staff = { shirt: '#ff4fa3' }; customers = 1;
      break;
    }
    case 'kapper': {
      // spiegels met lampjes en kappersstoelen
      for (let i = 0; i < 3; i++) { const x = W * (0.12 + i * 0.29); b.fillStyle = '#cfd8dc'; b.fillRect(x, H * 0.18, W * 0.2, H * 0.32); b.fillStyle = 'rgba(255,255,255,0.35)'; b.fillRect(x + 6, H * 0.2, W * 0.06, H * 0.28); b.fillStyle = '#fff8e1'; for (let k = 0; k < 5; k++) { b.beginPath(); b.arc(x + k * W * 0.05, H * 0.17, 4, 0, 7); b.fill(); } b.fillStyle = '#111'; b.fillRect(x + W * 0.06, H * 0.55, W * 0.08, H * 0.16); }
      staff = { shirt: '#111' }; customers = 1; counterColor = '#111'; counterTop = '#555';
      break;
    }
    case 'kantoor': {
      // bureaus met beeldschermen, archiefkasten en een plant
      b.fillStyle = '#b0bec5'; for (let i = 0; i < 4; i++) b.fillRect(W * (0.06 + i * 0.07), H * 0.3, W * 0.06, H * 0.45);
      for (let i = 0; i < 2; i++) { const x = W * (0.45 + i * 0.25); b.fillStyle = '#263238'; b.fillRect(x, H * 0.4, W * 0.12, H * 0.12); b.fillStyle = '#90caf9'; b.fillRect(x + 4, H * 0.41, W * 0.12 - 8, H * 0.1); }
      b.fillStyle = '#2e7d32'; b.beginPath(); b.arc(W * 0.92, H * 0.55, 22, 0, 7); b.fill();
      staff = { shirt: '#37474f' }; customers = 1; counterColor = '#8d6e63'; counterTop = '#efebe9';
      break;
    }
    case 'tijdschriften': {
      // rekken met tijdschriften, sigaretten achter de toonbank, loterijbord
      shelves(b, W * 0.05, H * 0.2, W * 0.5, H * 0.55, 4, (x, y, w, h) => { for (let cx = x; cx < x + w - 14; cx += 18) { b.fillStyle = ['#e53935', '#1e88e5', '#fdd835', '#43a047', '#8e24aa', '#ff7043', '#fafafa'][Math.floor(rand() * 7)]; b.fillRect(cx, y - h * 0.9, 15, h * 0.9); } });
      b.fillStyle = '#4a2c7a'; b.fillRect(W * 0.6, H * 0.15, W * 0.34, H * 0.12); b.fillStyle = '#fff'; b.font = '700 18px sans-serif'; b.fillText('LOTERIJ', W * 0.66, H * 0.24);
      tall(W * 0.6, W * 0.34, 3, ['#fafafa', '#c62828', '#212121', '#ffd54f']);
      staff = { shirt: '#4a2c7a' }; customers = 2;
      break;
    }
    case 'lunchroom': {
      b.fillStyle = '#5d4037'; b.fillRect(0, H * 0.7, W, 6);
      for (let i = 0; i < 3; i++) { const x = W * (0.2 + i * 0.3); b.fillStyle = '#fff'; b.fillRect(x - 30, H * 0.6, 60, 6); b.fillStyle = '#8d6e63'; b.fillRect(x - 3, H * 0.6, 6, 40); person(b, x - 26, H * 0.78, 66, { shirt: shirt() }); if (rand() < 0.6) person(b, x + 26, H * 0.78, 62, { shirt: shirt() }); b.fillStyle = '#fff'; b.beginPath(); b.arc(x - 8, H * 0.59, 6, 0, 7); b.fill(); }
      b.fillStyle = '#263238'; b.fillRect(W * 0.35, H * 0.08, W * 0.3, H * 0.14); b.fillStyle = '#fff'; for (let i = 0; i < 3; i++) b.fillRect(W * 0.38, H * (0.11 + i * 0.035), W * 0.2, 3);
      staff = { shirt: '#3e3a2e', apron: '#f3e2b8' }; customers = 0;
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
