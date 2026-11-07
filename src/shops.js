// Winkels en bedrijven met een eigen gevel op hun echte adres (Rijksweg en centrum),
// plus het tankstation en het busstation.
// Namen en adressen komen uit online bedrijvengidsen en kunnen verouderd zijn.
// De borden, kleuren en etalages zijn verzonnen in een passende stijl: geen echte logo's.
import * as THREE from 'three';

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });
const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m; };

// id -> bord en etalage
export const SHOPS = {
  knubben: { sign: 'IJzerwaren Knubben', sub: 'gereedschap · huishoud · tuin', bg: '#1f3b5a', fg: '#ffffff', awning: ['#1f3b5a', '#ffffff'], type: 'ijzer' },
  bierhuys: { sign: 'Gulpener Bierhuys', sub: 'bier uit Gulpen', bg: '#123a24', fg: '#f2c14e', type: 'bier' },
  apotheek: { sign: 'Apotheek', sub: 'Gulpen', bg: '#ffffff', fg: '#1b7a3a', type: 'apotheek' },
  rousseau: { sign: 'Rousseau Chocolade', sub: 'bonbons · chocolade', bg: '#3e2316', fg: '#e8c48a', awning: ['#3e2316', '#e8c48a'], type: 'choco' },
  pearle: { sign: 'Pearle Opticiens', sub: 'brillen · lenzen', bg: '#0f2b52', fg: '#ffffff', type: 'opticien' },
  ortmans: { sign: 'Bakkerij Ortmans', sub: 'brood · vlaai · banket', bg: '#f1e2c2', fg: '#6b3a16', awning: ['#6b3a16', '#f1e2c2'], type: 'bakker' },
  hema: { sign: 'HEMA', sub: '', bg: '#c8102e', fg: '#ffffff', type: 'warenhuis' },
  top1toys: { sign: 'Top1Toys', sub: 'speelgoed', bg: '#ffd400', fg: '#d6001c', type: 'speelgoed' },
  euronics: { sign: 'Euronics', sub: 'elektronica · witgoed', bg: '#0b3c8c', fg: '#ffffff', type: 'elektro' },
  da: { sign: 'DA Drogisterij & Parfumerie', sub: '', bg: '#ffffff', fg: '#c8102e', type: 'drogist' },
  voncken: { sign: 'Bakkerij Voncken', sub: 'ambachtelijk brood en vlaai', bg: '#5a2e14', fg: '#f6e7c8', awning: ['#5a2e14', '#f6e7c8'], type: 'bakker' },
  decorette: { sign: 'Decorette', sub: 'verf · behang · raamdecoratie', bg: '#ef7d00', fg: '#ffffff', type: 'wonen' },
  vvv: { sign: 'VVV · Visit Zuid-Limburg', sub: 'informatie · wandelkaarten · streekproducten', bg: '#0a5aa8', fg: '#ffffff', type: 'vvv' },
  ilgusto: { sign: 'Il Gusto', sub: 'ristorante · pizzeria', bg: '#1b4d2b', fg: '#ffffff', awning: ['#1b4d2b', '#ffffff', '#c62828', '#ffffff'], type: 'restaurant' },
  mezzaluna: { sign: 'IJssalon Mezzaluna', sub: 'ijs · koffie', bg: '#f7c6d9', fg: '#7a1f4a', awning: ['#f7c6d9', '#ffffff'], type: 'ijs' },
  bormans: { sign: 'Slagerij Bormans', sub: 'vlees · vleeswaren', bg: '#7a1f1f', fg: '#ffffff', awning: ['#7a1f1f', '#ffffff'], type: 'slager' },
};

// Bouwt alle winkels. fac = Facades-instantie (helpers voor bord, luifel, etalage, deur).
export function buildShops(fac, pois) {
  const ids = Object.keys(SHOPS).filter((id) => pois[id]);
  const frames = {};
  for (const id of ids) {
    const f = fac.frameAtAddress(...pois[id].pos);
    if (f) frames[id] = fac.frames[id] = f;
  }
  // winkels naast elkaar in één pand: bordbreedte beperken tot de ruimte tot de buren
  for (const id of Object.keys(frames)) {
    const f = frames[id];
    let room = Math.min(6, f.len - 0.4);
    for (const other of Object.keys(frames)) {
      if (other === id) continue;
      const o = frames[other];
      const d = Math.hypot(o.x - f.x, o.z - f.z);
      if (o.nx * f.nx + o.nz * f.nz > 0.8 && d < 12) room = Math.min(room, d - 0.4);
    }
    f.w = Math.max(2.2, room);
  }
  for (const id of Object.keys(frames)) shopFacade(fac, frames[id], SHOPS[id]);
  if (pois.tankstation) buildTankstation(fac, pois.tankstation.pos);
  if (pois.busstation) buildBusstation(fac, pois.busstation.pos);
}

function shopFacade(fac, f, s) {
  const g = fac.group(f);
  const w = f.w;
  const big = s.sign.length > 16;
  fac.sign(g, s.sign, {
    w, h: 0.75, y: 3.3, bg: s.bg, fg: s.fg,
    font: `800 ${big ? 84 : 110}px "Baloo 2", sans-serif`, sub: s.sub || undefined, subFont: '600 44px Inter, sans-serif',
  });
  if (s.awning) fac.awning(g, { w, colors: s.awning, stripes: 10, y: 2.65, depth: 1.2 });
  const winW = Math.max(1.0, w - 1.5);
  fac.shopWindow(g, { w: winW, x: -0.55, h: 1.7, y: 0.7, color: 0xfff0d8 });
  fac.door(g, { x: w / 2 - 0.6, color: new THREE.Color(s.bg).getHex() });
  const wx = -0.55, inWin = (x, y) => [wx + x * (winW / 2 - 0.15), 0.7 + y, 0.16];
  const add = (m) => { g.add(m); return m; };

  switch (s.type) {
    case 'bakker': {
      const bread = std(0xb9773a, { roughness: 0.85 });
      add(mesh(new THREE.BoxGeometry(winW - 0.2, 0.04, 0.3), std(0xffffff), wx, 0.95, 0.2));
      for (let i = 0; i < 6; i++) {
        const l = mesh(new THREE.CapsuleGeometry(0.07, 0.18, 4, 8), bread, ...inWin(-0.8 + i * 0.32, 0.33));
        l.rotation.z = Math.PI / 2;
        add(l);
      }
      break;
    }
    case 'apotheek': {
      // groen kruis aan een arm, haaks op de gevel
      const green = new THREE.MeshStandardMaterial({ color: 0x1b9a4a, emissive: 0x1b9a4a, emissiveIntensity: 0.6 });
      const cross = new THREE.Group();
      cross.add(mesh(new THREE.BoxGeometry(0.22, 0.62, 0.1), green), mesh(new THREE.BoxGeometry(0.62, 0.22, 0.1), green));
      cross.position.set(w / 2 - 0.6, 2.6, 0.12); // boven de deur, goed zichtbaar vanaf de straat
      add(cross);
      break;
    }
    case 'opticien': {
      // grote bril boven de etalage
      const frame = std(0x111111, { metalness: 0.5 });
      for (const sx of [-0.32, 0.32]) {
        const r = mesh(new THREE.TorusGeometry(0.24, 0.04, 8, 24), frame, wx + sx, 2.35, 0.12);
        add(r);
      }
      add(mesh(new THREE.BoxGeometry(0.2, 0.04, 0.04), frame, wx, 2.38, 0.12));
      break;
    }
    case 'speelgoed': {
      const cols = [0xe53935, 0x1e88e5, 0xfdd835, 0x43a047, 0x8e24aa];
      for (let i = 0; i < 8; i++) {
        const geo = i % 2 ? new THREE.SphereGeometry(0.11, 12, 8) : new THREE.BoxGeometry(0.18, 0.18, 0.18);
        add(mesh(geo, std(cols[i % 5]), ...inWin(-0.85 + i * 0.24, 0.12 + (i % 3) * 0.32)));
      }
      break;
    }
    case 'elektro': {
      const scr = new THREE.MeshStandardMaterial({ color: 0x0b1a2a, emissive: 0x3a7bd5, emissiveIntensity: 0.7 });
      for (let i = 0; i < 3; i++) add(mesh(new THREE.BoxGeometry(0.62, 0.38, 0.04), scr, ...inWin(-0.6 + i * 0.6, 0.85)));
      for (let i = 0; i < 2; i++) add(mesh(new THREE.BoxGeometry(0.5, 0.75, 0.5), std(0xf5f5f5, { metalness: 0.3 }), ...inWin(-0.5 + i * 1.0, 0.38)));
      break;
    }
    case 'drogist': {
      const cols = [0xf8bbd0, 0xb3e5fc, 0xffffff, 0xffe082, 0xc5e1a5];
      for (let r = 0; r < 2; r++) {
        add(mesh(new THREE.BoxGeometry(winW - 0.2, 0.03, 0.25), std(0xffffff), wx, 0.95 + r * 0.6, 0.2));
        for (let i = 0; i < 9; i++) add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.2, 10), std(cols[(i + r) % 5]), ...inWin(-0.9 + i * 0.22, 0.36 + r * 0.6)));
      }
      break;
    }
    case 'ijzer': {
      // rek met gieters en emmers voor de deur
      add(mesh(new THREE.BoxGeometry(1.2, 0.05, 0.5), std(0x6d4c41), -w / 2 + 1.0, 0.8, 0.55));
      const cols = [0x2e7d32, 0x1565c0, 0xc62828];
      for (let i = 0; i < 3; i++) add(mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.28, 12), std(cols[i], { metalness: 0.3 }), -w / 2 + 0.6 + i * 0.4, 0.97, 0.55));
      add(mesh(new THREE.BoxGeometry(0.6, 0.35, 0.4), std(0x8d8d8d, { metalness: 0.6 }), -w / 2 + 1.0, 0.18, 0.55));
      break;
    }
    case 'choco': {
      for (let i = 0; i < 5; i++) {
        add(mesh(new THREE.BoxGeometry(0.28, 0.14, 0.2), std(0x4e2c1a), ...inWin(-0.7 + i * 0.35, 0.3)));
        add(mesh(new THREE.BoxGeometry(0.29, 0.02, 0.21), std(0xd4af37, { metalness: 0.8, roughness: 0.3 }), ...inWin(-0.7 + i * 0.35, 0.38)));
      }
      break;
    }
    case 'bier': {
      // kratten en een vat bij de deur
      for (let i = 0; i < 3; i++) add(mesh(new THREE.BoxGeometry(0.42, 0.28, 0.32), std(0x1b5e20), -w / 2 + 0.8, 0.14 + i * 0.29, 0.5));
      const vat = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.7, 16), std(0x8d6e63, { roughness: 0.8 }), -w / 2 + 1.5, 0.35, 0.5);
      add(vat);
      break;
    }
    case 'wonen': {
      const cols = [0xef7d00, 0x1e88e5, 0xffffff, 0x8bc34a, 0xd32f2f];
      for (let i = 0; i < 10; i++) add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.16, 12), std(cols[i % 5]), ...inWin(-0.9 + (i % 5) * 0.42, 0.12 + Math.floor(i / 5) * 0.2)));
      break;
    }
    case 'vvv': {
      // blauw bord met een i
      const blue = new THREE.MeshStandardMaterial({ color: 0x0a5aa8, emissive: 0x0a5aa8, emissiveIntensity: 0.3 });
      const sq = new THREE.Group();
      sq.add(mesh(new THREE.BoxGeometry(0.08, 0.6, 0.6), blue));
      sq.add(mesh(new THREE.BoxGeometry(0.1, 0.3, 0.08), std(0xffffff), 0, -0.05, 0));
      sq.add(mesh(new THREE.BoxGeometry(0.1, 0.08, 0.08), std(0xffffff), 0, 0.18, 0));
      sq.position.set(-w / 2 + 0.4, 2.9, 0.6);
      add(sq);
      break;
    }
    case 'restaurant': {
      fac.terrace(f, 2);
      break;
    }
    case 'ijs': {
      // groot ijshoorntje naast de deur
      const cone = mesh(new THREE.ConeGeometry(0.22, 0.6, 16), std(0xd9a066), w / 2 + 0.3, 0.9, 0.45);
      cone.rotation.x = Math.PI;
      add(cone);
      add(mesh(new THREE.SphereGeometry(0.24, 16, 12), std(0xf7c6d9), w / 2 + 0.3, 1.3, 0.45));
      add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 8), std(0x888888), w / 2 + 0.3, 0.3, 0.45));
      break;
    }
    case 'slager': {
      const cols = [0x8b1a1a, 0xc2185b, 0xe57373, 0x6d1b1b];
      for (let i = 0; i < 4; i++) add(mesh(new THREE.BoxGeometry(0.4, 0.08, 0.25), std(cols[i]), ...inWin(-0.6 + i * 0.42, 0.35)));
      break;
    }
    default: break;
  }
}

// Tankstation: overkapping met pompen voor het pand, en een prijsbord-paal zonder merk.
function buildTankstation(fac, [x, z]) {
  const f = fac.frameAtAddress(x, z);
  if (!f) return;
  fac.frames.tankstation = f;
  const w = fac.world;
  // midden van de overkapping: een stukje voor de gevel
  let out = 7;
  for (; out > 4; out -= 0.5) if (!w.insideBuilding(f.x + f.nx * out, f.z + f.nz * out)) break;
  const g = new THREE.Group();
  const cx = f.x + f.nx * out, cz = f.z + f.nz * out;
  g.position.set(cx, w.heightAt(cx, cz), cz);
  g.rotation.y = f.yaw;
  fac.scene.add(g);
  const white = std(0xf5f5f5, { roughness: 0.5 });
  const red = new THREE.MeshStandardMaterial({ color: 0xc62828, emissive: 0xc62828, emissiveIntensity: 0.15 });
  // dak
  g.add(mesh(new THREE.BoxGeometry(10, 0.5, 6.5), white, 0, 5.0, 0));
  g.add(mesh(new THREE.BoxGeometry(10.05, 0.25, 6.55), red, 0, 4.85, 0));
  // lampen onder het dak
  const lamp = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4d6, emissiveIntensity: 0.9 });
  for (const lx of [-3, 0, 3]) for (const lz of [-1.8, 1.8]) g.add(mesh(new THREE.BoxGeometry(0.8, 0.04, 0.3), lamp, lx, 4.72, lz));
  // pilaren en pompeilanden
  for (const px of [-3.2, 3.2]) {
    g.add(mesh(new THREE.BoxGeometry(0.35, 4.8, 0.35), white, px, 2.4, 0));
    g.add(mesh(new THREE.BoxGeometry(1.0, 0.2, 3.6), std(0x9e9e9e), px, 0.1, 0));
    for (const pz of [-0.9, 0.9]) {
      const pump = new THREE.Group();
      pump.add(mesh(new THREE.BoxGeometry(0.6, 1.6, 0.45), white, 0, 0.9, 0));
      pump.add(mesh(new THREE.BoxGeometry(0.62, 0.3, 0.47), red, 0, 1.55, 0));
      pump.add(mesh(new THREE.PlaneGeometry(0.4, 0.25), new THREE.MeshStandardMaterial({ color: 0x0b1a2a, emissive: 0x4fc3f7, emissiveIntensity: 0.6 }), 0, 1.15, 0.231));
      pump.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6), std(0x111111), 0.33, 0.9, 0));
      pump.position.set(px, 0.2, pz);
      g.add(pump);
    }
    // botsvak voor het pompeiland
    const corners = [[-0.55, -1.85], [0.55, -1.85], [0.55, 1.85], [-0.55, 1.85]].map(([a, b]) => {
      const lx = px + a, lz = b;
      const c = Math.cos(f.yaw), s = Math.sin(f.yaw);
      return [cx + lx * c + lz * s, cz - lx * s + lz * c];
    });
    w.addObstacle(corners);
  }
  // prijsbord-paal aan de straatkant
  const pylon = new THREE.Group();
  pylon.add(mesh(new THREE.BoxGeometry(1.4, 4.4, 0.35), white, 0, 2.2, 0));
  pylon.add(mesh(new THREE.BoxGeometry(1.42, 0.9, 0.37), red, 0, 3.9, 0));
  const face = fac.sign(pylon, 'Tankstation', { w: 1.3, h: 0.8, y: 3.9, z: 0.14, bg: '#c62828', fg: '#ffffff', font: '800 150px "Baloo 2", sans-serif' });
  void face;
  const prices = fac.sign(pylon, 'Euro 95 · Diesel', { w: 1.2, h: 1.4, y: 2.4, z: 0.14, bg: '#111111', fg: '#ffd54f', font: '700 90px Inter, sans-serif' });
  void prices;
  pylon.position.set(5.8, 0, 3.6);
  g.add(pylon);
}

// Busstation: twee abri's langs de busbaan, een haltepaal en een geparkeerde bus.
function buildBusstation(fac, [x, z]) {
  const w = fac.world;
  // richting van de busbaan (volgens TOP10NL loopt die van zuidwest naar noordoost)
  const dir = new THREE.Vector2(46, -64).normalize();
  const yaw = Math.atan2(dir.x, dir.y);
  const perp = [dir.y, -dir.x];
  const place = (obj, along, side) => {
    const px = x + dir.x * along + perp[0] * side, pz = z + dir.y * along + perp[1] * side;
    obj.position.set(px, w.heightAt(px, pz), pz);
    obj.rotation.y = yaw;
    fac.scene.add(obj);
    return [px, pz];
  };
  // abri's: aan de kant zonder gebouw
  const side = w.insideBuilding(x + perp[0] * 4.5, z + perp[1] * 4.5) ? -4.5 : 4.5;
  const glass = new THREE.MeshStandardMaterial({ color: 0xbfd9e8, transparent: true, opacity: 0.35, roughness: 0.05, depthWrite: false });
  const metal = std(0x37474f, { metalness: 0.6, roughness: 0.4 });
  for (const along of [-6, 4]) {
    const abri = new THREE.Group();
    abri.add(mesh(new THREE.BoxGeometry(0.1, 0.06, 4), metal, 0, 2.5, 0));
    abri.add(mesh(new THREE.BoxGeometry(1.6, 0.08, 4.2), std(0xeceff1), Math.sign(side) * 0.6, 2.55, 0));
    abri.add(mesh(new THREE.BoxGeometry(0.04, 2.2, 4), glass, Math.sign(side) * 1.3, 1.25, 0));
    for (const zz of [-2, 2]) abri.add(mesh(new THREE.BoxGeometry(1.4, 2.2, 0.04), glass, Math.sign(side) * 0.6, 1.25, zz));
    abri.add(mesh(new THREE.BoxGeometry(0.4, 0.06, 2.4), std(0x6d4c41), Math.sign(side) * 1.0, 0.48, 0));
    // dienstregeling
    abri.add(mesh(new THREE.PlaneGeometry(0.6, 0.9), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.25 }), Math.sign(side) * 1.27, 1.4, 1.2));
    const [ax, az] = place(abri, along, side);
    void ax; void az;
  }
  // haltepaal met bord
  const pole = new THREE.Group();
  pole.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.8, 8), std(0x9aa0a6, { metalness: 0.7 }), 0, 1.4, 0));
  fac.sign(pole, 'Busstation Gulpen', { w: 1.6, h: 0.5, y: 2.6, z: 0.06, bg: '#ffd400', fg: '#1b1b1b', font: '800 120px "Baloo 2", sans-serif' });
  place(pole, -1, side * 0.7);
  // geparkeerde bus (zonder merk)
  const bus = new THREE.Group();
  const body = std(0xf5f5f5, { roughness: 0.4, metalness: 0.2 });
  bus.add(mesh(new THREE.BoxGeometry(2.5, 2.8, 12), body, 0, 1.75, 0));
  bus.add(mesh(new THREE.BoxGeometry(2.52, 0.4, 12.02), std(0x00838f), 0, 0.75, 0));
  const win = new THREE.MeshStandardMaterial({ color: 0x14202a, roughness: 0.1, metalness: 0.3 });
  for (const sx of [-1.26, 1.26]) bus.add(mesh(new THREE.BoxGeometry(0.02, 1.0, 10.5), win, sx, 2.25, -0.3));
  bus.add(mesh(new THREE.BoxGeometry(2.3, 1.4, 0.02), win, 0, 2.1, 6.01));
  const wheel = std(0x111111);
  for (const wz of [-4, 4]) for (const sx of [-1.2, 1.2]) {
    const wh = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 16), wheel, sx, 0.5, wz);
    wh.rotation.z = Math.PI / 2;
    bus.add(wh);
  }
  fac.sign(bus, '54  Gulpen Busstation', { w: 2.0, h: 0.32, y: 3.0, z: 6.0, bg: '#111111', fg: '#ffb300', font: '700 110px Inter, sans-serif' });
  const [bx, bz] = place(bus, -1, -side * 0.25);
  // botsvak voor de bus
  const c = Math.cos(yaw), s = Math.sin(yaw);
  w.addObstacle([[-1.3, -6], [1.3, -6], [1.3, 6], [-1.3, 6]].map(([lx, lz]) => [bx + lx * c + lz * s, bz - lx * s + lz * c]));
  fac.frames.busstation = { x: bx, z: bz, y: w.heightAt(bx, bz), nx: perp[0], nz: perp[1], ux: dir.x, uz: dir.y, len: 12, yaw };
}
