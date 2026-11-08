// Auto's: modellen, geparkeerde auto's om in te stappen, rijgedrag en verkeer.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng } from './world.js';

// Zijaanzicht per type: punten [lengte-as, hoogte] vanaf de achterkant, plus de raamlijn.
const TYPES = {
  hatch: {
    L: 4.05, W: 1.76, wheelR: 0.31, wheelbase: 2.55, belt: 1.04, pillars: [1.55],
    body: [[0, 0.32], [0.05, 0.95], [0.25, 1.05], [0.45, 1.46], [2.5, 1.5], [3.25, 1.02], [4.0, 0.9], [4.05, 0.32]],
  },
  sedan: {
    L: 4.65, W: 1.82, wheelR: 0.32, wheelbase: 2.8, belt: 1.02, pillars: [2.25],
    body: [[0, 0.34], [0.05, 0.95], [0.85, 1.02], [1.35, 1.42], [3.0, 1.45], [3.75, 1.0], [4.6, 0.9], [4.65, 0.34]],
  },
  suv: {
    L: 4.43, W: 1.86, wheelR: 0.36, wheelbase: 2.7, belt: 1.18, pillars: [0.75, 1.75],
    body: [[0, 0.4], [0.03, 1.1], [0.22, 1.2], [0.42, 1.62], [2.75, 1.66], [3.45, 1.15], [4.38, 1.02], [4.43, 0.4]],
  },
  van: {
    L: 4.95, W: 1.95, wheelR: 0.34, wheelbase: 3.1, belt: 1.16, pillars: [3.55],
    body: [[0, 0.36], [0.02, 1.9], [3.7, 1.95], [4.4, 1.15], [4.92, 1.0], [4.95, 0.36]],
  },
  sport: {
    L: 4.4, W: 1.88, wheelR: 0.33, wheelbase: 2.6, belt: 0.92, pillars: [], vmax: 36,
    body: [[0, 0.3], [0.04, 0.88], [0.6, 0.98], [1.4, 1.2], [2.55, 1.22], [3.3, 0.86], [4.35, 0.68], [4.4, 0.3]],
  },
  tractor: { L: 4.0, W: 2.2, wheelR: 0.75, wheelbase: 2.3, vmax: 11, custom: 'tractor' },
};

const PAINTS = [0x2b2d30, 0xd8d9db, 0x8d9196, 0x1e2a44, 0x7a1e1e, 0xeeeeee, 0x3b4a3a, 0x6b6e72, 0x101012, 0x9c9fa3, 0x2f4f7a];

// snijdt een polygoon af tussen twee hoogtes (Sutherland-Hodgman)
function clipBand(pts, y0, y1) {
  const clip = (poly, keep, inter) => {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const ka = keep(a), kb = keep(b);
      if (ka) out.push(a);
      if (ka !== kb) out.push(inter(a, b));
    }
    return out;
  };
  const at = (y) => (a, b) => [a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]), y];
  let p = clip(pts, (q) => q[1] >= y0, at(y0));
  p = clip(p, (q) => q[1] <= y1, at(y1));
  return p;
}

function shapeOf(pts) {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
}

function colorize(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  // uv's weg zodat alles samen te voegen is
  geo.deleteAttribute('uv');
  return geo;
}

// Tractor: motorkap, cabine, grote achterwielen.
function buildTractor(t) {
  const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g.toNonIndexed(); };
  const paint = mergeGeometries([
    box(1.0, 0.9, 2.0, 0, 1.25, 0.9),   // motorkap
    box(1.5, 0.12, 1.5, 0, 2.95, -0.6), // dak
    box(1.6, 0.25, 1.4, 0, 1.25, -0.6), // bodem cabine
    box(2.3, 0.08, 0.9, 0, 1.85, -1.0), // spatbord
  ]);
  paint.computeVertexNormals();
  const parts = [];
  const glass = box(1.4, 1.5, 1.4, 0, 2.15, -0.6);
  parts.push(colorize(glass, 0x15202a));
  for (const sx of [-1, 1]) {
    for (const [r, w, z] of [[0.75, 0.5, -0.9], [0.45, 0.3, 1.4]]) {
      const tire = new THREE.CylinderGeometry(r, r, w, 20); tire.rotateZ(Math.PI / 2); tire.translate(sx * (0.85 + w / 2), r, z);
      parts.push(colorize(tire.toNonIndexed(), 0x161616));
      const rim = new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.02, 12); rim.rotateZ(Math.PI / 2); rim.translate(sx * (0.85 + w / 2), r, z);
      parts.push(colorize(rim.toNonIndexed(), 0xd8c23a));
    }
  }
  const exhaust = new THREE.CylinderGeometry(0.06, 0.06, 1.2, 8); exhaust.translate(0.35, 2.2, 1.5);
  parts.push(colorize(exhaust.toNonIndexed(), 0x222222));
  const grille = box(0.9, 0.6, 0.05, 0, 1.2, 1.92);
  parts.push(colorize(grille, 0x222222));
  const detail = mergeGeometries(parts);
  const lights = mergeGeometries([colorize(box(0.2, 0.12, 0.05, -0.35, 1.5, 1.93), 0xfff6e0), colorize(box(0.2, 0.12, 0.05, 0.35, 1.5, 1.93), 0xfff6e0),
    colorize(box(0.12, 0.12, 0.05, -0.9, 1.75, -1.46), 0xd01818), colorize(box(0.12, 0.12, 0.05, 0.9, 1.75, -1.46), 0xd01818)]);
  return { paint, detail, lights, ...t };
}

// Bouwt de geometrie van één autotype: {paint, detail, lights}
function buildType(t) {
  if (t.custom === 'tractor') return buildTractor(t);
  const { L, W, wheelR, wheelbase } = t;
  const bevel = { depth: W - 0.16, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 3, curveSegments: 4 };
  const paint = new THREE.ExtrudeGeometry(shapeOf(t.body), bevel);
  paint.translate(-L / 2, 0, -(W - 0.16) / 2);
  paint.rotateY(-Math.PI / 2); // lengte langs z, voorkant naar +z
  paint.computeVertexNormals();

  const parts = [];
  // ramen: de band van de carrosserie tussen gordellijn en dak, iets groter zodat het glas net naar buiten steekt
  const roofY = Math.max(...t.body.map((q) => q[1]));
  const band = clipBand(t.body, t.belt, roofY - 0.1);
  const glass = new THREE.ExtrudeGeometry(shapeOf(band), { depth: W - 0.16, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.085, bevelSegments: 1 });
  glass.translate(-L / 2, 0, -(W - 0.16) / 2);
  glass.rotateY(-Math.PI / 2);
  parts.push(colorize(glass, 0x0b0e12));
  // stijlen tussen de ramen (in een donkere kleur, zoals bij moderne auto's)
  for (const fx of t.pillars) {
    const pil = new THREE.BoxGeometry(W + 0.03, roofY - t.belt - 0.05, 0.09);
    pil.translate(0, (t.belt + roofY) / 2, -L / 2 + fx);
    parts.push(colorize(pil.toNonIndexed(), 0x15171a));
  }

  // bumpers en dorpels in zwart kunststof
  const bumperF = new THREE.BoxGeometry(W + 0.02, 0.22, 0.18); bumperF.translate(0, 0.42, L / 2 - 0.02);
  const bumperR = new THREE.BoxGeometry(W + 0.02, 0.22, 0.18); bumperR.translate(0, 0.42, -L / 2 + 0.02);
  const sill = new THREE.BoxGeometry(W + 0.04, 0.12, L * 0.62); sill.translate(0, 0.36, 0);
  for (const g of [bumperF, bumperR, sill]) parts.push(colorize(g.toNonIndexed(), 0x1a1b1d));
  // spiegels
  for (const sx of [-1, 1]) {
    const m = new THREE.BoxGeometry(0.18, 0.12, 0.1);
    m.translate(sx * (W / 2 + 0.08), t.belt + 0.05, L * 0.18);
    parts.push(colorize(m.toNonIndexed(), 0x1a1b1d));
  }
  // wielen: band + velg
  const zF = wheelbase / 2, zR = -wheelbase / 2;
  for (const z of [zF, zR]) {
    for (const sx of [-1, 1]) {
      const tire = new THREE.CylinderGeometry(wheelR, wheelR, 0.24, 18);
      tire.rotateZ(Math.PI / 2);
      tire.translate(sx * (W / 2 - 0.1), wheelR, z);
      parts.push(colorize(tire.toNonIndexed(), 0x141414));
      const rim = new THREE.CylinderGeometry(wheelR * 0.62, wheelR * 0.62, 0.26, 12);
      rim.rotateZ(Math.PI / 2);
      rim.translate(sx * (W / 2 - 0.1), wheelR, z);
      parts.push(colorize(rim.toNonIndexed(), 0xb8bcc2));
    }
  }
  // kenteken voor en achter (geel, Nederlands)
  for (const z of [L / 2 + 0.075, -L / 2 - 0.075]) {
    const plate = new THREE.BoxGeometry(0.52, 0.11, 0.02);
    plate.translate(0, 0.48, z);
    parts.push(colorize(plate.toNonIndexed(), 0xf2c200));
  }
  const detail = mergeGeometries(parts);

  // koplampen en achterlichten
  const fl = [], rl = [];
  const frontY = t.body.at(-2)[1] - 0.12;
  const rearY = t.body[1][1] - 0.12;
  for (const sx of [-1, 1]) {
    const h = new THREE.BoxGeometry(0.34, 0.1, 0.06); h.translate(sx * (W / 2 - 0.25), frontY, L / 2 + 0.01);
    fl.push(colorize(h.toNonIndexed(), 0xfff6e0));
    const r = new THREE.BoxGeometry(0.3, 0.1, 0.06); r.translate(sx * (W / 2 - 0.22), rearY, -L / 2 - 0.01);
    rl.push(colorize(r.toNonIndexed(), 0xd01818));
  }
  const lights = mergeGeometries([...fl, ...rl]);
  return { paint, detail, lights, ...t };
}

export class Vehicles {
  constructor(game) {
    this.g = game;
    this.world = game.world;
    this.scene = game.scene;
    this.types = Object.fromEntries(Object.entries(TYPES).map(([k, t]) => [k, buildType(t)]));
    this.paintMat = new THREE.MeshPhysicalMaterial({ roughness: 0.38, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 0.7 });
    this.detailMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.3 });
    this.lightMat = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0xffffff, emissiveIntensity: 0.15, roughness: 0.2 });
    this.cars = []; // alle auto's waar je in kunt stappen (dynamisch)
    this.traffic = [];
  }

  // los, bestuurbaar automodel
  makeCarMesh(type, paint) {
    const t = this.types[type];
    const g = new THREE.Group();
    const mat = this.paintMat.clone();
    mat.color.set(paint);
    const body = new THREE.Mesh(t.paint, mat);
    const det = new THREE.Mesh(t.detail, this.detailMat);
    const lig = new THREE.Mesh(t.lights, this.lightMat);
    body.castShadow = det.castShadow = true;
    body.receiveShadow = true;
    g.add(body, det, lig);
    return g;
  }

  addCar(type, x, z, heading, paint, opts = {}) {
    const mesh = opts.parked ? null : this.makeCarMesh(type, paint);
    if (mesh) this.scene.add(mesh);
    const car = { type, mesh, x, z, heading, speed: 0, steer: 0, paint, t: this.types[type], ...opts };
    this.unstick(car);
    if (mesh) this.placeCar(car);
    this.cars.push(car);
    return car;
  }

  // Een geparkeerde (gebundelde) auto omzetten naar een losse auto om in te rijden.
  activate(car) {
    if (car.mesh) return;
    car.mesh = this.makeCarMesh(car.type, car.paint);
    this.scene.add(car.mesh);
    const b = this.batches[car.type];
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const inst of b.meshes) { inst.setMatrixAt(car.slot, zero); inst.instanceMatrix.needsUpdate = true; }
    car.parked = false;
    this.placeCar(car);
  }

  // Geparkeerde auto's verspreid over parkeervakken.
  spawnParked(extra = []) {
    // elke keer dat je speelt staan de auto's op andere plekken
    const rand = Math.random;
    const mobile = this.world.isMobile;
    const spots = this.world.parkingSpots.filter(() => rand() < (mobile ? 0.4 : 0.6));
    const max = mobile ? 55 : 120;
    const typeKeys = ['hatch', 'hatch', 'sedan', 'sedan', 'suv', 'suv', 'van', 'sport'];
    const list = [];
    const pick = () => typeKeys[Math.floor(rand() * typeKeys.length)];
    const paint = () => PAINTS[Math.floor(rand() * PAINTS.length)];
    for (const s of spots.slice(0, max)) list.push(this.addCar(pick(), s.x, s.z, s.heading, paint(), { parked: true }));
    // auto's op opritten en erven door het hele dorp
    for (const d of this.drivewaySpots(mobile ? 40 : 90)) list.push(this.addCar(pick(), d.x, d.z, d.heading, paint(), { parked: true }));
    for (const e of extra) list.push(this.addCar(e.type, e.x, e.z, e.heading, e.paint, { parked: true, ...e.opts }));
    // per type één set gebundelde meshes
    this.batches = {};
    const tmp = new THREE.Object3D();
    const col = new THREE.Color();
    for (const type of Object.keys(TYPES)) {
      const cars = list.filter((c) => c.type === type);
      if (!cars.length) continue;
      const t = this.types[type];
      const paintMat = this.paintMat.clone();
      const meshes = [
        new THREE.InstancedMesh(t.paint, paintMat, cars.length),
        new THREE.InstancedMesh(t.detail, this.detailMat, cars.length),
        new THREE.InstancedMesh(t.lights, this.lightMat, cars.length),
      ];
      cars.forEach((c, i) => {
        c.slot = i;
        this.pose(c, tmp);
        for (const m of meshes) m.setMatrixAt(i, tmp.matrix);
        meshes[0].setColorAt(i, col.set(c.paint));
      });
      for (const m of meshes) { m.computeBoundingSphere(); m.castShadow = true; m.receiveShadow = true; this.scene.add(m); }
      this.batches[type] = { meshes };
    }
  }

  // Willekeurige opritten: tussen een huis en de straat, op verharding.
  drivewaySpots(n) {
    const w = this.world;
    const out = [];
    const ok = ['erf', 'verhard_open', 'klinkers', 'parkeer', 'verhard_gesloten'];
    for (let tries = 0; tries < n * 40 && out.length < n; tries++) {
      const f = w.footprints[Math.floor(Math.random() * w.footprints.length)];
      if (f.extra) continue;
      const area = (f.maxX - f.minX) * (f.maxZ - f.minZ);
      if (area < 60 || area > 900) continue; // gewone woonhuizen
      const cx = (f.minX + f.maxX) / 2, cz = (f.minZ + f.maxZ) / 2;
      const st = w.nearestStreet(cx, cz);
      if (!st || st.dist > 35) continue;
      const [x, z] = w.spotNear(cx, cz);
      if (!ok.includes(w.classAt(x, z))) continue;
      const heading = Math.atan2(st.x - x, st.z - z);
      // genoeg ruimte voor een auto, en niet te dicht bij een andere
      const fx = Math.sin(heading), fz = Math.cos(heading);
      if (w.insideBuilding(x + fx * 2.3, z + fz * 2.3) || w.insideBuilding(x - fx * 2.3, z - fz * 2.3)) continue;
      if (w.classAt(x + fx * 2.3, z + fz * 2.3) === 'rijbaan') continue; // niet op de weg
      if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 8) || this.cars.some((c) => Math.hypot(c.x - x, c.z - z) < 6)) continue;
      out.push({ x, z, heading: heading + (Math.random() < 0.3 ? Math.PI : 0) });
    }
    return out;
  }

  // stand van een auto op het terrein berekenen
  pose(car, obj) {
    const { x, z, heading } = car;
    const L = car.t.L * 0.4, W = car.t.W * 0.45;
    const sx = Math.sin(heading), cz = Math.cos(heading);
    const px = cz, pz = -sx;
    const hF = this.world.groundAt(x + sx * L, z + cz * L);
    const hB = this.world.groundAt(x - sx * L, z - cz * L);
    const hL = this.world.groundAt(x + px * W, z + pz * W);
    const hR = this.world.groundAt(x - px * W, z - pz * W);
    const y = (hF + hB + hL + hR) / 4;
    obj.position.set(x, y, z);
    obj.rotation.order = 'YXZ';
    obj.rotation.set(-Math.atan2(hF - hB, L * 2), heading, Math.atan2(hL - hR, W * 2));
    obj.updateMatrix();
    car.y = y;
  }

  placeCar(car) {
    if (!car.mesh) {
      // geparkeerde auto die opzij geduwd wordt: in de bundel bijwerken
      if (car.slot == null || !this.batches) return;
      const tmp = new THREE.Object3D();
      this.pose(car, tmp);
      for (const m of this.batches[car.type].meshes) { m.setMatrixAt(car.slot, tmp.matrix); m.instanceMatrix.needsUpdate = true; }
      return;
    }
    this.pose(car, car.mesh);
  }

  // auto uit gebouwen duwen (bij het neerzetten)
  unstick(car) {
    for (let it = 0; it < 6; it++) {
      let moved = false;
      for (const off of [car.t.L * 0.33, 0, -car.t.L * 0.33]) {
        const cx = car.x + Math.sin(car.heading) * off, cz = car.z + Math.cos(car.heading) * off;
        const [rx, rz] = this.world.resolve(cx, cz, car.t.W * 0.5);
        if (Math.abs(rx - cx) > 1e-3 || Math.abs(rz - cz) > 1e-3) { car.x += rx - cx; car.z += rz - cz; moved = true; }
      }
      if (!moved) break;
    }
  }

  nearestCar(x, z, maxD = 3.5) {
    let best = null, bd = maxD;
    for (const c of this.cars) {
      const d = Math.hypot(c.x - x, c.z - z) - c.t.W * 0.5;
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  // ------------------------------------------------------------ rijden

  drive(car, dt, throttle, steerIn, handbrake) {
    const w = this.world;
    const surface = w.classAt(car.x, car.z);
    const onRoad = ['rijbaan', 'klinkers', 'parkeer', 'erf', 'verhard_open', 'verhard_gesloten', 'brug', 'fietspad', 'voetpad', 'berm', 'oever', 'onverhard'].includes(surface);
    const top = car.t.vmax ?? 27; // ongeveer 100 km/u: genoeg voor een dorp
    // naast de weg (gras, akker) iets langzamer, maar nooit ineens: geleidelijk afremmen
    const vmax = onRoad || car.type === 'tractor' ? top : Math.min(top, 20);
    // optrekken wordt rustiger naarmate je harder gaat
    const accel = throttle > 0 ? (car.speed < 0 ? 16 : 6.5 * (1 - 0.55 * Math.min(1, car.speed / top))) : throttle < 0 ? (car.speed > 0 ? 14 : 4.5) : 0;
    car.speed += throttle * accel * dt;
    if (!throttle) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), (onRoad ? 2.2 : 6) * dt);
    if (handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 10 * dt);
    car.speed -= car.speed * Math.abs(car.speed) * 0.0009 * dt * 60 * (onRoad ? 1 : 2.5) * 0.02;
    if (car.speed > vmax) car.speed -= (car.speed - vmax) * Math.min(1, dt * 1.2);
    car.speed = THREE.MathUtils.clamp(car.speed, -8, top);

    // minder stuuruitslag op snelheid, en het stuur draait geleidelijk (geen schokken)
    const maxSteer = THREE.MathUtils.lerp(0.58, 0.075, Math.min(1, Math.abs(car.speed) / 26));
    car.steer += (steerIn * maxSteer - car.steer) * Math.min(1, dt * (steerIn ? 3.2 : 5));
    const yawRate = (car.speed * Math.tan(car.steer)) / car.t.wheelbase;
    car.heading -= yawRate * dt * (handbrake ? 1.6 : 1);

    const nx = car.x + Math.sin(car.heading) * car.speed * dt;
    const nz = car.z + Math.cos(car.heading) * car.speed * dt;
    const front = car.t.L * 0.38 * Math.sign(car.speed || 1);
    // water blokkeert
    if (w.blocked(nx + Math.sin(car.heading) * front, nz + Math.cos(car.heading) * front)) {
      car.speed = 0; // stoppen voor het water, niet terugstuiteren
      return;
    }
    // botsingen met gebouwen: drie cirkels langs de auto
    let x = nx, z = nz, hit = false;
    for (const off of [car.t.L * 0.33, 0, -car.t.L * 0.33]) {
      const cx = x + Math.sin(car.heading) * off, cz = z + Math.cos(car.heading) * off;
      const [rx, rz] = w.resolve(cx, cz, car.t.W * 0.5);
      if (Math.abs(rx - cx) > 1e-4 || Math.abs(rz - cz) > 1e-4) { x += rx - cx; z += rz - cz; hit = true; }
    }
    // botsingen met andere auto's
    // elke auto als drie cirkels langs de lengteas: zo kun je netjes naast een andere auto parkeren
    const circles = (c, cx, cz) => [-0.33, 0, 0.33].map((k) => [cx + Math.sin(c.heading) * c.t.L * k, cz + Math.cos(c.heading) * c.t.L * k]);
    car.lastBump = null;
    for (const o of this.cars.concat(this.traffic)) {
      if (o === car) continue;
      if (Math.hypot(o.x - x, o.z - z) > car.t.L + o.t.L) continue;
      const rr = (o.t.W + car.t.W) * 0.5 + 0.05;
      for (const [ax, az] of circles(car, x, z)) for (const [bx, bz] of circles(o, o.x, o.z)) {
        const d = Math.hypot(ax - bx, az - bz);
        if (d >= rr || d < 0.001) continue;
        const push = (rr - d) / d;
        x += (ax - bx) * push * 0.6; z += (az - bz) * push * 0.6;
        if (!o.ai && !o.locked) { o.x -= (ax - bx) * push * 0.4; o.z -= (az - bz) * push * 0.4; this.placeCar(o); }
        hit = true;
        car.lastBump = o;
      }
    }
    car.bumpSpeed = hit ? Math.abs(car.speed) : 0;
    if (hit && Math.abs(car.speed) > 2) {
      car.speed *= 0.55;
      if (Math.abs(car.speed) > 8) { this.g.shake = 0.4; this.g.sfx?.play('crash'); }
    }
    car.x = x; car.z = z;
    this.placeCar(car);
  }

  // ------------------------------------------------------------ verkeer

  spawnTraffic(n, rnd = null) {
    const nodes = this.world.roadNodes;
    if (!nodes?.length) return;
    const rand = rnd || rng(99);
    const withEdges = nodes.map((nd, i) => i).filter((i) => nodes[i].edges.length);
    const typeKeys = ['hatch', 'sedan', 'suv', 'hatch', 'van'];
    for (let k = 0; k < n && withEdges.length; k++) {
      const from = withEdges[Math.floor(rand() * withEdges.length)];
      const edge = nodes[from].edges[Math.floor(rand() * nodes[from].edges.length)];
      const type = typeKeys[k % typeKeys.length];
      const mesh = this.makeCarMesh(type, PAINTS[Math.floor(rand() * PAINTS.length)]);
      this.scene.add(mesh);
      const car = {
        ai: true, type, mesh, t: this.types[type], edge, dist: rand() * edge.len, x: 0, z: 0, heading: 0,
        speed: 0, cruise: 8 + rand() * 4, from,
      };
      this.traffic.push(car);
    }
  }

  updateTraffic(dt, player) {
    const nodes = this.world.roadNodes;
    for (const c of this.traffic) {
      // vertragen bij obstakels voor de auto
      let target = c.cruise;
      const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
      const check = (o) => {
        if (o === c) return;
        const dx = o.x - c.x, dz = o.z - c.z;
        if (dx * dx + dz * dz > 225) return;
        const ahead = dx * fx + dz * fz;
        const side = Math.abs(-dx * fz + dz * fx);
        if (ahead > 0 && ahead < 14 && side < 2.2) target = Math.min(target, Math.max(0, (ahead - 5) * 1.2));
      };
      check(player);
      // vlak naast of voor de auto staan: hij wacht (en dan kun je de chauffeur eruit trekken)
      const pd = Math.hypot(player.x - c.x, player.z - c.z);
      if (pd < 3.6) target = 0;
      if (pd < 7 && target === 0 && c.speed < 0.5) {
        c.blockT = (c.blockT || 0) + dt;
        if (c.blockT > 2.2) { c.blockT = -2.5; this.g.sfx?.play('honk'); }
      } else c.blockT = 0;
      for (let i = 0; i < this.cars.length; i++) check(this.cars[i]);
      for (let i = 0; i < this.traffic.length; i++) check(this.traffic[i]);
      // bochten langzamer
      c.speed += (target - c.speed) * Math.min(1, dt * (target < c.speed ? 4 : 1.2));
      c.dist += c.speed * dt;
      while (c.dist > c.edge.len) {
        c.dist -= c.edge.len;
        const node = nodes[c.edge.to];
        const options = node.edges.filter((e) => e.to !== c.from);
        const pick = options.length ? options[Math.floor(Math.random() * options.length)] : node.edges[0];
        c.from = c.edge.to;
        c.edge = pick;
      }
      const p = along(c.edge.pts, c.dist);
      // rechts houden
      const ox = Math.cos(p.heading) * -1.7, oz = -Math.sin(p.heading) * -1.7;
      const tx = p.x + ox, tz = p.z + oz;
      c.x += (tx - c.x) * Math.min(1, dt * 8);
      c.z += (tz - c.z) * Math.min(1, dt * 8);
      let dh = p.heading - c.heading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      c.heading += dh * Math.min(1, dt * 6);
      this.placeCar(c);
    }
  }

  // Een auto uit het verkeer halen (kapen): wordt een gewone auto om zelf in te rijden.
  hijack(c) {
    this.traffic = this.traffic.filter((x) => x !== c);
    c.ai = false; c.parked = false; c.speed = 0; c.steer = 0; c.hijacked = true;
    this.cars.push(c);
    // het verkeer weer aanvullen, ergens anders in het dorp
    this.spawnTraffic(1, Math.random);
    return c;
  }

  // Waar zit de chauffeur? (links voorin, in wereldcoördinaten)
  driverDoor(c) {
    const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
    const lx = Math.cos(c.heading), lz = -Math.sin(c.heading);
    return [c.x + fx * 0.3 + lx * (c.t.W * 0.5 + 0.5), c.z + fz * 0.3 + lz * (c.t.W * 0.5 + 0.5)];
  }

  // stilstaand verkeer vlak bij de speler
  nearestTraffic(x, z, maxD = 3.4) {
    let best = null, bd = maxD;
    for (const c of this.traffic) {
      if (c.speed > 1.5) continue;
      const d = Math.hypot(c.x - x, c.z - z) - c.t.W * 0.5;
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  setNight(t) {
    this.lightMat.emissiveIntensity = 0.15 + t * 2.2;
  }
}

function along(pts, dist) {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const seg = Math.hypot(bx - ax, bz - az);
    if (acc + seg >= dist || i === pts.length - 1) {
      const t = seg ? Math.min(1, (dist - acc) / seg) : 0;
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, heading: Math.atan2(bx - ax, bz - az) };
    }
    acc += seg;
  }
  return { x: pts[0][0], z: pts[0][1], heading: 0 };
}

export const VOLVO_GREY = 0x7b7f84;
