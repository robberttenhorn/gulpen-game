// Extra binnenruimtes: Bakkerij Pijls (muizen vangen), het zwembad van Mosaqua (bommetje)
// en het gemeentehuis (het matras van Gulpen).
import * as THREE from 'three';
import { Interiors, Room, std, tiles } from './interiors.js';
import { signTexture } from './textures.js';

const P = Interiors.prototype;

// ------------------------------------------------------------ Bakkerij Pijls
P.build_pijls = function () {
  const r = new Room(this.scene, this.count++, { w: 11, d: 9, h: 3.2, floor: { map: tiles('#e8e0d0', '#c9bda6') }, wall: 0xf6ead0, name: 'Bakkerij Pijls' });
  // toonbank en ovens
  r.add(new THREE.BoxGeometry(5, 1.0, 0.8), std(0x6d4c33), -1.5, 0.5, -2.6);
  for (const x of [2.2, 3.6]) {
    r.add(new THREE.BoxGeometry(1.2, 1.8, 0.9), std(0x9e9e9e, { metalness: 0.6, roughness: 0.4 }), x, 0.9, -3.9);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), new THREE.MeshStandardMaterial({ color: 0x331100, emissive: 0xff7a1a, emissiveIntensity: 1.2 }));
    glow.position.set(x, 1.0, -3.44);
    r.group.add(glow);
  }
  // meelzakken en kratten (obstakels om omheen te rennen)
  const sack = std(0xf2eadb, { roughness: 0.95 });
  for (const [x, z] of [[-4, 1], [-3.4, 1.4], [2.5, 1.5], [0.5, -0.4], [-1.5, 2.6], [4.2, -1]]) {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.4, 4, 10), sack);
    m.scale.set(1, 0.8, 0.8);
    r.obj(m, x, 0.42, z, Math.random() * 3, [0.35, 0.3]);
  }
  for (const [x, z] of [[3.5, 2.6], [-4.5, -2]]) r.add(new THREE.BoxGeometry(0.8, 0.5, 0.6), std(0x8d6e63), x, 0.25, z);
  const bord = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), new THREE.MeshStandardMaterial({ map: signTexture('Keuring vandaag!', { bg: '#7a1f1f', fg: '#fff3e0', font: '800 90px "Baloo 2", serif', sub: 'geen muizen in de bakkerij', subFont: '600 44px Inter, serif', w: 512, h: 288 }) }));
  bord.position.set(-5.45, 1.8, 0);
  bord.rotation.y = Math.PI / 2;
  r.group.add(bord);
  for (const x of [-3, 0, 3]) r.lamp(x, 0);
  r.person({ shirt: 0xffffff, pants: 0x9e9e9e, apron: 0xf3e6c8, hair: 0x5d4037, hat: 'chef' }, -1.5, -3.3, 0);
  r.start = { x: 0, z: 1.2, r: 2 };
  return r;
};

// ------------------------------------------------------------ zwembad Mosaqua
P.build_zwembad = function () {
  const r = new Room(this.scene, this.count++, { w: 22, d: 16, h: 7, floor: { map: tiles('#e3f2fd', '#90caf9') }, wall: 0xe0f7fa, name: 'Mosaqua' });
  // bad (water iets onder de vloer, met een rand)
  const water = new THREE.Mesh(new THREE.PlaneGeometry(14, 9), new THREE.MeshStandardMaterial({ color: 0x29b6f6, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.85 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(1, 0.03, -1);
  r.group.add(water);
  r.boxes.push([-6, -5.5, 8, 3.5]); // niet het water in lopen
  const edge = std(0xffffff, { roughness: 0.4 });
  for (const [w, d, x, z] of [[14.4, 0.3, 1, -5.6], [14.4, 0.3, 1, 3.6], [0.3, 9.4, -6.1, -1], [0.3, 9.4, 8.1, -1]]) r.add(new THREE.BoxGeometry(w, 0.1, d), edge, x, 0.06, z, false);
  // springplank aan de korte kant
  r.add(new THREE.BoxGeometry(0.6, 1.2, 0.6), std(0x90a4ae), -7.2, 0.6, -1, false);
  const board = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, 0.6), std(0x1e88e5, { roughness: 0.5 }));
  board.position.set(-5.4, 1.25, -1);
  r.group.add(board);
  // glijbaan in de hoek
  const tube = std(0xffb300, { roughness: 0.4 });
  for (let i = 0; i < 10; i++) {
    const a = i * 0.6;
    const seg = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.25, 8, 12, 0.7), tube);
    seg.position.set(9 + Math.cos(a) * 1.4, 5.2 - i * 0.5, -5 + Math.sin(a) * 1.4);
    seg.rotation.set(Math.PI / 2, 0, a);
    r.group.add(seg);
  }
  // juryleden aan de rand
  for (let i = 0; i < 3; i++) r.person({ shirt: [0xd32f2f, 0xffffff, 0x1565c0][i], pants: 0x263238, hair: [0x9e9e9e, 0x3e2723, 0xd7b56d][i] }, 1 + i * 1.6, 5.2, Math.PI, 'sit');
  for (let i = 0; i < 4; i++) r.lamp(-5 + i * 4, -1, 6.2);
  r.board = { x: -6.8, z: -1 };
  r.boardEnd = { x: -3.9, y: 1.32, z: -1 };
  r.water = { x: 1, z: -1, y: 0.03 };
  r.start = { x: -7.2, z: 1.8, r: 2 };
  return r;
};

// ------------------------------------------------------------ gemeentehuis
P.build_gemeentehuis = function () {
  const r = new Room(this.scene, this.count++, { w: 16, d: 12, h: 3.6, floor: { map: tiles('#d7d2c8', '#a39e93') }, wall: 0xf1ede4, name: 'Gemeentehuis Gulpen-Wittem' });
  // loketten langs de achterwand en de zijwanden
  const names = ['Afval', 'Wegen', 'Openbare Orde', 'Cultuur', 'Burgerzaken'];
  const spots = [[-5.5, -4.6, 0], [-1.8, -4.6, 0], [1.8, -4.6, 0], [5.5, -4.6, 0], [-7.2, 0.5, Math.PI / 2]];
  r.loketten = {};
  names.forEach((n, i) => {
    const [x, z, ry] = spots[i];
    const desk = new THREE.Group();
    desk.add(new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.1, 0.7), std(0x8d6e63)));
    desk.children[0].position.y = 0.55;
    const glass = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.8, 0.04), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false }));
    glass.position.set(0, 1.5, 0.3);
    desk.add(glass);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.45), new THREE.MeshStandardMaterial({ map: signTexture(`Loket ${n}`, { bg: '#1b4f72', fg: '#ffffff', font: '700 90px Inter, sans-serif', w: 1024, h: 210 }) }));
    sign.position.set(0, 2.35, 0.36);
    desk.add(sign);
    r.obj(desk, x, 0, z, ry, ry ? [0.35, 1.3] : [1.3, 0.35]);
    r.person({ shirt: [0x546e7a, 0x8d6e63, 0x37474f, 0xad1457, 0x455a64][i], pants: 0x263238, hair: [0x9e9e9e, 0x3e2723, 0x111111, 0xd7b56d, 0x5d4037][i], glasses: i % 2 === 0, female: i % 2 === 1 }, x - (ry ? 0.8 : 0), z - (ry ? 0 : 0.8), ry || 0);
    const front = ry ? [x + 1.4, z] : [x, z + 1.4];
    r.loketten[n] = { x: front[0], z: front[1] };
  });
  // wachtrij-automaat en stoelen
  r.add(new THREE.BoxGeometry(0.5, 1.4, 0.4), std(0xd32f2f), 6.8, 0.7, 2.5);
  for (let i = 0; i < 5; i++) r.add(new THREE.BoxGeometry(0.5, 0.45, 0.5), std(0x37474f), -2 + i * 0.7, 0.23, 3.4);
  for (let i = 0; i < 4; i++) r.lamp(-6 + i * 4, -1);
  r.start = { x: 0, z: 2.5 };
  return r;
};
