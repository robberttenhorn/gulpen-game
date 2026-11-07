// Binnenruimtes voor missies: een café, de bakkerij, de kerk en de slagerij.
// De ruimtes staan ver buiten het dorp; als je naar binnen gaat, word je erheen verplaatst.
import * as THREE from 'three';
import { makeCharacter } from './character.js';
import { makeVlaai, makeFluitje, makeOfferblok } from './props.js';
import { signTexture } from './textures.js';

const BASE_X = 9000, BASE_Z = 9000;
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...extra });

function planks(color = '#8a6142') {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) {
    const v = (Math.random() - 0.5) * 30;
    g.fillStyle = shade(color, v);
    g.fillRect(0, i * 32, 256, 32);
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.fillRect(0, i * 32, 256, 2);
    g.fillRect((i * 97) % 256, i * 32, 2, 32);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function tiles(a = '#d9d2c3', b = '#4b4038') {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? a : b; g.fillRect(x * 32, y * 32, 32, 32); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function shade(hex, v) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + v)), g = Math.max(0, Math.min(255, ((n >> 8) & 255) + v)), b = Math.max(0, Math.min(255, (n & 255) + v));
  return `rgb(${r},${g},${b})`;
}

class Room {
  constructor(scene, index, { w, d, h, floor, wall, name, warm = 0xffd9a0 }) {
    this.w = w; this.d = d; this.h = h; this.name = name;
    this.ox = BASE_X + index * 80; this.oz = BASE_Z;
    this.group = new THREE.Group();
    this.group.position.set(this.ox, 0, this.oz);
    this.group.visible = false;
    scene.add(this.group);
    this.boxes = []; // botsvakken in lokale coördinaten [x0, z0, x1, z1]
    this.triggers = [];
    this.people = [];
    this.warm = warm;
    const floorTex = floor.map;
    floorTex.repeat.set(w / 2, d / 2);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.6 }));
    fl.rotation.x = -Math.PI / 2;
    fl.position.y = 0.01;
    fl.receiveShadow = true;
    this.group.add(fl);
    const wallMat = std(wall, { side: THREE.BackSide });
    const shell = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    shell.position.y = h / 2;
    this.group.add(shell);
    // plint
    const plint = std(0x3a2a1e);
    for (const [x, z, sx, sz] of [[0, -d / 2 + 0.03, w, 0.06], [0, d / 2 - 0.03, w, 0.06], [-w / 2 + 0.03, 0, 0.06, d], [w / 2 - 0.03, 0, 0.06, d]]) {
      this.add(new THREE.BoxGeometry(sx, 0.18, sz), plint, x, 0.09, z, false);
    }
    // deur aan de voorkant (+z)
    this.door = { x: 0, z: d / 2 - 0.8 };
    this.add(new THREE.BoxGeometry(1.2, 2.3, 0.08), std(0x4a3020), 0, 1.15, d / 2 - 0.05, false);
    this.add(new THREE.BoxGeometry(0.08, 0.08, 0.08), std(0xd4af37, { metalness: 1 }), 0.45, 1.1, d / 2 - 0.11, false);
  }

  add(geo, mat, x, y, z, solid = true, ry = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = true;
    m.receiveShadow = true;
    this.group.add(m);
    if (solid) {
      geo.computeBoundingBox();
      const bb = geo.boundingBox;
      const hx = (ry ? (bb.max.z - bb.min.z) : (bb.max.x - bb.min.x)) / 2, hz = (ry ? (bb.max.x - bb.min.x) : (bb.max.z - bb.min.z)) / 2;
      this.boxes.push([x - hx, z - hz, x + hx, z + hz]);
    }
    return m;
  }

  obj(o, x, y, z, ry = 0, solid = null) {
    o.position.set(x, y, z);
    o.rotation.y = ry;
    this.group.add(o);
    if (solid) this.boxes.push([x - solid[0], z - solid[1], x + solid[0], z + solid[1]]);
    return o;
  }

  person(look, x, z, ry, pose = 'idle') {
    const m = makeCharacter(look);
    m.position.set(x, 0, z);
    m.rotation.y = ry;
    this.group.add(m);
    this.people.push({ m, pose });
    this.boxes.push([x - 0.35, z - 0.35, x + 0.35, z + 0.35]);
    return m;
  }

  lamp(x, z, y = this.h - 0.6) {
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, this.h - y, 4), std(0x111111));
    cord.position.set(x, (this.h + y) / 2, z);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.25, 16, 1, true), std(0x1b3a2a, { side: THREE.DoubleSide }));
    shade.position.set(x, y, z);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshStandardMaterial({ color: 0xfff1c8, emissive: 0xffc070, emissiveIntensity: 2.5 }));
    bulb.position.set(x, y - 0.08, z);
    this.group.add(cord, shade, bulb);
  }

  window(x, z, ry, w = 1.4, h = 1.6, color = 0xbfe0ff) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6 }));
    m.position.set(x, 1.7, z);
    m.rotation.y = ry;
    this.group.add(m);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, h + 0.12, 0.04), std(0xf5f0e6));
    frame.position.copy(m.position);
    frame.rotation.y = ry;
    frame.translateZ(-0.03);
    this.group.add(frame);
    return m;
  }

  // wereldcoördinaten
  toWorld(x, z) { return [this.ox + x, this.oz + z]; }

  // speler binnen de muren en buiten de meubels houden
  collide(x, z, r = 0.35) {
    let lx = x - this.ox, lz = z - this.oz;
    lx = Math.max(-this.w / 2 + r, Math.min(this.w / 2 - r, lx));
    lz = Math.max(-this.d / 2 + r, Math.min(this.d / 2 - r, lz));
    let bumped = false;
    for (const [x0, z0, x1, z1] of this.boxes) {
      if (lx > x0 - r && lx < x1 + r && lz > z0 - r && lz < z1 + r) {
        const dl = lx - (x0 - r), dr = (x1 + r) - lx, dt = lz - (z0 - r), db = (z1 + r) - lz;
        const m = Math.min(dl, dr, dt, db);
        if (m === dl) lx = x0 - r; else if (m === dr) lx = x1 + r; else if (m === dt) lz = z0 - r; else lz = z1 + r;
        bumped = true;
      }
    }
    return [this.ox + lx, this.oz + lz, bumped];
  }
}

export class Interiors {
  constructor(game) {
    this.g = game;
    this.scene = game.scene;
    this.rooms = {};
    this.count = 0;
    // één lamp die meeverhuist naar de ruimte waar je bent
    this.light = new THREE.PointLight(0xffd9a0, 0, 30, 1.6);
    this.scene.add(this.light);
  }

  room(id) {
    if (!this.rooms[id]) this.rooms[id] = this['build_' + id]();
    return this.rooms[id];
  }

  // ------------------------------------------------------------ café

  build_cafe() {
    const r = new Room(this.scene, this.count++, { w: 12, d: 9, h: 3.4, floor: { map: planks('#7a5236') }, wall: 0x9c6b4a, name: 'Café' });
    // bar langs de achterwand
    r.add(new THREE.BoxGeometry(6, 1.1, 0.8), std(0x4a2c1a, { roughness: 0.5 }), 0, 0.55, -3.2);
    r.add(new THREE.BoxGeometry(6.2, 0.06, 0.95), std(0x2a1a10, { roughness: 0.25 }), 0, 1.13, -3.2, false);
    for (let i = 0; i < 4; i++) {
      const tap = new THREE.Group();
      tap.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.35, 8), std(0xc0c0c0, { metalness: 0.9, roughness: 0.2 })));
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.05), std([0x0f5132, 0xc62828, 0x1565c0, 0xf9a825][i]));
      handle.position.y = 0.28;
      tap.add(handle);
      r.obj(tap, -1.2 + i * 0.8, 1.32, -3.0);
    }
    // flessen op een schap
    r.add(new THREE.BoxGeometry(5, 0.05, 0.3), std(0x3a2414), 0, 2.0, -4.3, false);
    for (let i = 0; i < 18; i++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.3, 8), std([0x1b5e20, 0x5d4037, 0xf9a825, 0xb71c1c][i % 4], { roughness: 0.2, metalness: 0.2 }));
      r.obj(b, -2.3 + i * 0.27, 2.17, -4.3);
    }
    // krukken
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Group();
      s.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 14), std(0x7a1e1e)), {}));
      s.children[0].position.y = 0.78;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.78, 6), std(0x222222, { metalness: 0.6 }));
      leg.position.y = 0.39;
      s.add(leg);
      r.obj(s, -2.2 + i * 1.1, 0, -2.3, 0, [0.22, 0.22]);
    }
    // tafeltjes met stoelen en bierviltjes
    for (const [x, z] of [[-3.8, 0.8], [0, 0.2], [3.8, 0.8]]) {
      r.add(new THREE.CylinderGeometry(0.55, 0.55, 0.05, 18), std(0x5d3a22, { roughness: 0.4 }), x, 0.76, z);
      r.add(new THREE.CylinderGeometry(0.05, 0.08, 0.74, 8), std(0x222222), x, 0.37, z, false);
      r.obj(makeFluitje(), x + 0.2, 0.79, z - 0.1);
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        const ch = new THREE.Group();
        ch.add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.42), std(0x3a2414)));
        ch.children[0].position.y = 0.46;
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.05), std(0x3a2414));
        back.position.set(0, 0.72, -0.2);
        ch.add(back);
        r.obj(ch, x + Math.sin(a) * 0.95, 0, z + Math.cos(a) * 0.95, a + Math.PI, [0.25, 0.25]);
      }
    }
    // krijtbord en lampen
    this.cafeBoard = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.1), new THREE.MeshStandardMaterial({ map: signTexture('Hubertusmarkt!', { bg: '#1e2a22', fg: '#f5f5f0', font: '700 100px "Baloo 2", sans-serif', sub: 'vandaag de 482e editie', subFont: '600 50px Inter, sans-serif', w: 512, h: 352 }) }));
    this.cafeBoard.position.set(-5.95, 1.8, -1);
    this.cafeBoard.rotation.y = Math.PI / 2;
    r.group.add(this.cafeBoard);
    r.window(5.95, -0.5, -Math.PI / 2, 1.6, 1.4, 0xffe4b0);
    r.window(5.95, 2.5, -Math.PI / 2, 1.6, 1.4, 0xffe4b0);
    for (const [x, z] of [[-3.8, 0.8], [0, 0.2], [3.8, 0.8], [-1.5, -3], [1.5, -3]]) r.lamp(x, z);
    // naambord boven de bar (per café anders)
    this.cafeSign = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.6), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    this.cafeSign.position.set(0, 2.75, -4.48);
    r.group.add(this.cafeSign);
    // barman en een stamgast
    r.person({ shirt: 0x222222, pants: 0x222222, apron: 0xf5f5f5, hair: 0x3e2723 }, 0.5, -3.9, 0);
    r.stamgast = r.person({ shirt: 0x6d4c41, pants: 0x37474f, hair: 0x9e9e9e, hat: 'cap', hatColor: 0x3e3e3e }, -1.1, -2.3, Math.PI * 0.85, 'idle');
    r.stamgastPos = { x: -1.1, z: -1.5 };
    return r;
  }

  // het café aankleden met de naam en kleur van een bepaald café
  dressCafe(name, wall, signBg, signFg) {
    const r = this.room('cafe');
    r.name = name;
    r.group.children.find((c) => c.geometry?.type === 'BoxGeometry' && c.material.side === THREE.BackSide)?.material.color.set(wall);
    const t = signTexture(name, { bg: signBg, fg: signFg, font: '700 110px "Baloo 2", serif', w: 1024, h: 170 });
    this.cafeSign.material.map = t;
    this.cafeSign.material.needsUpdate = true;
    return r;
  }

  // ------------------------------------------------------------ bakkerij

  build_bakkerij() {
    const r = new Room(this.scene, this.count++, { w: 9, d: 7, h: 3.2, floor: { map: tiles('#e8e0d0', '#b8a890') }, wall: 0xf3e6c8, name: 'Bakkerij Paulissen' });
    // toonbank met glazen vitrine
    r.add(new THREE.BoxGeometry(6, 1.0, 0.8), std(0x6d4c33), 0, 0.5, -1.6);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.5, 0.7), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, roughness: 0.05, depthWrite: false }));
    glass.position.set(0, 1.25, -1.6);
    r.group.add(glass);
    for (let i = 0; i < 6; i++) r.obj(makeVlaai(), -2.4 + i * 0.95, 1.02, -1.6);
    // broodschappen tegen de achterwand
    for (let row = 0; row < 3; row++) {
      r.add(new THREE.BoxGeometry(6, 0.05, 0.45), std(0x8d6e63), 0, 0.8 + row * 0.6, -3.25, false);
      for (let i = 0; i < 9; i++) {
        const loaf = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.22, 4, 8), std(row === 1 ? 0x8a5a2b : 0xc98a4b, { roughness: 0.85 }));
        loaf.rotation.z = Math.PI / 2;
        r.obj(loaf, -2.6 + i * 0.65, 0.92 + row * 0.6, -3.2);
      }
    }
    r.boxes.push([-3, -3.5, 3, -3.0]);
    // bord 'vlaai van de week'
    const bord = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9), new THREE.MeshStandardMaterial({ map: signTexture('Vlaai van de week', { bg: '#3e2a1e', fg: '#f3e6c8', font: '700 80px "Baloo 2", serif', sub: 'kersen · rijst · pruimen', subFont: '600 44px Inter, serif', w: 512, h: 330 }) }));
    bord.position.set(-4.45, 1.9, 0.5);
    bord.rotation.y = Math.PI / 2;
    r.group.add(bord);
    r.window(4.45, 0.5, -Math.PI / 2, 1.8, 1.5, 0xfff4d6);
    for (const x of [-2, 0, 2]) r.lamp(x, -0.5);
    r.person({ shirt: 0xffffff, pants: 0x9e9e9e, apron: 0xf3e6c8, hair: 0x8d6e63, hat: 'chef' }, 0.8, -2.5, 0);
    // de vlaaien voor de kerk staan klaar op de toonbank
    r.pickup = { x: -0.8, z: -0.9 };
    return r;
  }

  // ------------------------------------------------------------ kerk

  build_kerk() {
    const r = new Room(this.scene, this.count++, { w: 14, d: 30, h: 12, floor: { map: tiles('#cfc6b4', '#8f8574') }, wall: 0xe8e0cf, name: 'Sint-Petruskerk' });
    // rode loper door het middenpad
    const carpet = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 27), std(0x8b1a1a, { roughness: 0.95 }));
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.set(0, 0.035, 0); // duidelijk boven de vloer, anders flikkert hij
    carpet.material.polygonOffset = true; carpet.material.polygonOffsetFactor = -2; carpet.material.polygonOffsetUnits = -2;
    r.group.add(carpet);
    // kerkbanken in twee rijen
    const wood = std(0x5a3a22, { roughness: 0.55 });
    for (let i = 0; i < 9; i++) {
      for (const side of [-1, 1]) {
        const z = 9 - i * 2.1;
        const x = side * 3.6;
        const bank = new THREE.Group();
        bank.add(new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.08, 0.5), wood));
        bank.children[0].position.y = 0.45;
        const back = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.6, 0.06), wood);
        back.position.set(0, 0.8, 0.25);
        const front = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.9, 0.06), wood);
        front.position.set(0, 0.45, -0.35);
        bank.add(back, front);
        bank.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        r.obj(bank, x, 0, z, 0, [2.2, 0.42]);
      }
    }
    // zuilen
    for (let i = 0; i < 6; i++) for (const side of [-1, 1]) r.add(new THREE.CylinderGeometry(0.4, 0.45, 11, 14), std(0xd9cfbb), side * 6.2, 5.5, 11 - i * 5);
    // altaar met kaarsen
    r.add(new THREE.BoxGeometry(3.2, 1.0, 1.2), std(0xf5f0e6), 0, 0.5, -12.6);
    r.add(new THREE.BoxGeometry(5, 0.3, 3.5), std(0xcfc6b4), 0, 0.15, -12.6, false);
    const flame = new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffa040, emissiveIntensity: 3 });
    for (const x of [-1.2, -0.6, 0.6, 1.2]) {
      r.add(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8), std(0xfff8e1), x, 1.25, -12.6, false);
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), flame);
      f.position.set(x, 1.55, -12.6);
      f.scale.y = 1.8;
      r.group.add(f);
    }
    const cross = new THREE.Group();
    cross.add(new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.4, 0.1), std(0xd4af37, { metalness: 1, roughness: 0.3 })));
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.15, 0.1), std(0xd4af37, { metalness: 1, roughness: 0.3 }));
    bar.position.y = 0.5;
    cross.add(bar);
    r.obj(cross, 0, 4.5, -14.8);
    // glas-in-loodramen
    const colors = [0x1e88e5, 0xc62828, 0xf9a825, 0x43a047, 0x8e24aa];
    for (let i = 0; i < 5; i++) {
      for (const side of [-1, 1]) {
        const c = document.createElement('canvas');
        c.width = 64; c.height = 128;
        const g = c.getContext('2d');
        for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) { g.fillStyle = '#' + colors[(x + y + i) % 5].toString(16).padStart(6, '0'); g.fillRect(x * 16, y * 16, 15, 15); }
        g.fillStyle = '#111'; g.fillRect(0, 0, 64, 6);
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        const win = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 3.6), new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.9 }));
        win.position.set(side * 6.95, 6.5, 10 - i * 5);
        win.rotation.y = -side * Math.PI / 2;
        r.group.add(win);
      }
    }
    // orgel achterin, boven de deur
    for (let i = 0; i < 14; i++) r.add(new THREE.CylinderGeometry(0.1, 0.1, 1.5 + Math.sin(i / 13 * Math.PI) * 2, 10), std(0xc0c0c0, { metalness: 0.9, roughness: 0.25 }), -2.6 + i * 0.4, 8 + Math.sin(i / 13 * Math.PI), 14.6, false);
    for (let i = 0; i < 7; i++) r.lamp(0, 12 - i * 4, 7.5);
    // koffietafel bij het altaar (voor de vlaaien)
    r.add(new THREE.BoxGeometry(2.2, 0.06, 0.9), std(0xffffff), 4.2, 0.76, -10.5);
    r.add(new THREE.BoxGeometry(2.1, 0.74, 0.8), std(0x8d6e63), 4.2, 0.37, -10.5, false);
    for (const x of [3.6, 4.0]) r.add(new THREE.CylinderGeometry(0.08, 0.1, 0.3, 12), std(0x37474f, { metalness: 0.6 }), x, 0.94, -10.5, false);
    r.coffeeTable = { x: 4.2, z: -9.5, r: 2.2 };
    // offerblok bij de ingang (voor de missie over het armenfonds)
    // vooraan naast het middenpad, zodat je het meteen ziet als je binnenkomt
    r.obj(makeOfferblok(), 1.95, 0, 10.2, -Math.PI / 2, [0.2, 0.25]);
    r.offerblok = { x: 1.3, z: 10.4, r: 2 };
    // kerkgangers achter de koffietafel, zodat je er vanaf het middenpad bij kunt
    r.person({ shirt: 0x37474f, pants: 0x263238, hair: 0xbdbdbd }, 3.6, -11.5, 0);
    r.person({ shirt: 0xad1457, pants: 0x37474f, hair: 0x9e9e9e, female: true }, 4.9, -11.5, -0.3);
    return r;
  }

  // ------------------------------------------------------------ slagerij

  build_slagerij() {
    const r = new Room(this.scene, this.count++, { w: 9, d: 7, h: 3.2, floor: { map: tiles('#f0f0ee', '#c9c9c4') }, wall: 0xfafafa, name: 'De Eetwinkel van het Heuvelland' });
    // gekoelde vitrine
    r.add(new THREE.BoxGeometry(6.5, 0.9, 0.9), std(0xe0e0e0, { metalness: 0.4, roughness: 0.3 }), 0, 0.45, -1.4);
    const trays = [0x8b1a1a, 0xc2185b, 0xe57373, 0x6d1b1b, 0xf2c14e, 0xd7a86e];
    for (let i = 0; i < 6; i++) r.add(new THREE.BoxGeometry(0.9, 0.12, 0.6), std(trays[i], { roughness: 0.5 }), -2.6 + i * 1.04, 0.96, -1.4, false);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.45, 0.85), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.15, roughness: 0.05, depthWrite: false }));
    glass.position.set(0, 1.15, -1.4);
    r.group.add(glass);
    // hammen aan het plafond
    for (let i = 0; i < 6; i++) {
      const ham = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), std(0x9b4a2a, { roughness: 0.6 }));
      ham.scale.set(0.8, 1.4, 0.8);
      r.obj(ham, -2.5 + i, 2.35, -2.8);
      const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.5, 4), std(0x888888, { metalness: 1 }));
      r.obj(hook, -2.5 + i, 2.9, -2.8);
    }
    // weegschaal en prijsbord
    r.add(new THREE.BoxGeometry(0.4, 0.25, 0.3), std(0xffffff), 2.8, 1.03, -1.1, false);
    const bord = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.0), new THREE.MeshStandardMaterial({ map: signTexture('Zoervleisj', { bg: '#1e2a22', fg: '#fff3e0', font: '700 100px "Baloo 2", serif', sub: 'van de slager, met appelstroop', subFont: '600 40px Inter, serif', w: 512, h: 284 }) }));
    bord.position.set(-4.45, 1.8, 0.6);
    bord.rotation.y = Math.PI / 2;
    r.group.add(bord);
    r.window(4.45, 0.6, -Math.PI / 2, 1.8, 1.5, 0xf5fbff);
    for (const x of [-2, 0, 2]) r.lamp(x, -0.4);
    r.person({ shirt: 0xffffff, pants: 0x37474f, apron: 0xb71c1c, hair: 0x424242 }, 0.5, -2.3, 0);
    r.counter = { x: 0, z: -0.6 };
    return r;
  }

  // ------------------------------------------------------------ in en uit

  update(dt) {
    const room = this.g.interior;
    if (!room) return;
    for (const p of room.people) p.m.userData.animate(dt, 0, p.pose);
  }
}
