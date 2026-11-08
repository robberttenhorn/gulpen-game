// Kleine voorwerpen en effecten: bier, friet, pakketjes, confetti, spetters.
// De voorwerpen zijn iets groter dan in het echt, zodat je ze vanaf de camera goed ziet.
import * as THREE from 'three';

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });
const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };
const cyl = (rt, rb, h, m, x = 0, y = 0, z = 0, seg = 16) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); o.position.set(x, y, z); return o; };
const shadows = (g) => { g.traverse((o) => { if (o.isMesh) o.castShadow = true; }); return g; };

// Een glas pils: smal glas, goudgeel bier en een schuimkraag.
export function makeFluitje() {
  const g = new THREE.Group();
  const glass = cyl(0.045, 0.036, 0.26, new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, roughness: 0.05, depthWrite: false }), 0, 0.13, 0, 20);
  glass.renderOrder = 2;
  const beer = cyl(0.04, 0.032, 0.19, mat(0xf0a818, { emissive: 0xa05a00, emissiveIntensity: 0.55, roughness: 0.15 }), 0, 0.1, 0, 20);
  const foam = cyl(0.043, 0.04, 0.05, mat(0xfffbef, { roughness: 0.9 }), 0, 0.22, 0, 20);
  g.add(glass, beer, foam);
  g.userData.beer = beer;
  g.userData.foam = foam;
  g.scale.setScalar(1.5); // iets groter, zodat je hem goed ziet
  return shadows(g);
}

// Kartonnen bakje met frikandel speciaal: mayo, curry en uitjes.
export function makeFrikandel() {
  const g = new THREE.Group();
  g.add(box(0.3, 0.05, 0.12, mat(0xf5f1e6), 0, 0.025, 0));
  const fk = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.22, 4, 10), mat(0x7a3e1d, { roughness: 0.8 }));
  fk.rotation.z = Math.PI / 2;
  fk.position.y = 0.075;
  g.add(fk);
  g.add(box(0.2, 0.012, 0.035, mat(0xfff4cf), 0, 0.105, 0));           // mayo
  g.add(box(0.2, 0.012, 0.02, mat(0xb3261e), 0, 0.112, 0.012));        // curry
  for (let i = 0; i < 7; i++) g.add(box(0.012, 0.01, 0.012, mat(0xf2ede0), -0.09 + i * 0.03, 0.12, -0.01 + (i % 2) * 0.02)); // uitjes
  return shadows(g);
}

// Puntzak friet met een flinke klodder mayo.
export function makePuntzak() {
  const g = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.24, 16, 1, true), mat(0xffffff, { side: THREE.DoubleSide }));
  cone.rotation.x = Math.PI;
  cone.position.y = 0.12;
  g.add(cone);
  const fry = mat(0xf2c14e, { roughness: 0.7 });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2, r = 0.02 + (i % 3) * 0.018;
    const f = box(0.014, 0.12, 0.014, fry, Math.cos(a) * r, 0.26 + (i % 4) * 0.012, Math.sin(a) * r);
    f.rotation.set((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4);
    g.add(f);
  }
  const mayo = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), mat(0xfff4cf, { roughness: 0.3 }));
  mayo.position.y = 0.31;
  mayo.scale.y = 0.6;
  g.add(mayo);
  return shadows(g);
}

// Broodje Gulpen in een papiertje.
export function makeBroodje() {
  const g = new THREE.Group();
  const bun = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.16, 4, 12), mat(0xc98a4b, { roughness: 0.8 }));
  bun.rotation.z = Math.PI / 2;
  bun.position.y = 0.06;
  bun.scale.set(1, 1, 0.85);
  g.add(bun);
  g.add(box(0.2, 0.02, 0.1, mat(0x8a4b2a), 0, 0.06, 0));          // döner
  g.add(box(0.19, 0.012, 0.1, mat(0xf2c14e), 0, 0.075, 0));       // kaas
  g.add(box(0.14, 0.08, 0.13, mat(0xf3efe3), 0.06, 0.04, 0));     // papiertje
  return shadows(g);
}

// Bruin pakketje met tape.
export function makePackage() {
  const g = new THREE.Group();
  g.add(box(0.34, 0.22, 0.26, mat(0x9b6b3d, { roughness: 0.95 }), 0, 0.11, 0));
  g.add(box(0.35, 0.03, 0.06, mat(0xd8c99a, { roughness: 0.4 }), 0, 0.225, 0));
  g.add(box(0.06, 0.225, 0.265, mat(0xd8c99a, { roughness: 0.4 }), 0, 0.112, 0));
  g.userData.carrySide = true;
  return shadows(g);
}

// Schimmig pakketje: in zwart vuilniszakplastic, kriskras dichtgeplakt met zilvertape.
// Iets uitvergroot en aan de zijkant gedragen, zodat je het van achteren ziet.
export function makeShadyPackage() {
  const g = new THREE.Group();
  const plastic = mat(0x141416, { roughness: 0.35, metalness: 0.1 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.26, 3, 2, 3), plastic);
  // een beetje gekreukt
  const pos = body.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const k = 1 + Math.sin(i * 12.9898) * 0.06;
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * (1 + Math.cos(i * 4.1) * 0.05), pos.getZ(i) * k);
  }
  body.geometry.computeVertexNormals();
  body.position.y = 0.12;
  g.add(body);
  const tape = mat(0xb9bec4, { roughness: 0.3, metalness: 0.6 });
  g.add(box(0.37, 0.05, 0.285, tape, 0, 0.12, 0));
  const t1 = box(0.05, 0.27, 0.29, tape, 0.06, 0.12, 0); t1.rotation.y = 0.5; g.add(t1);
  const t2 = box(0.05, 0.27, 0.29, tape, -0.06, 0.12, 0); t2.rotation.y = -0.5; g.add(t2);
  // knoop van de zak bovenop
  const knot = cyl(0.025, 0.06, 0.08, plastic, 0, 0.27, 0, 10);
  g.add(knot);
  g.scale.setScalar(1.6);
  g.userData.carrySide = true;
  return shadows(g);
}

// Blikken doosje sjnoef (snuiftabak), uitvergroot zodat je het in de hand ziet.
export function makeSnuifdoos() {
  const g = new THREE.Group();
  const tin = mat(0x8d1c1c, { metalness: 0.6, roughness: 0.35 });
  g.add(cyl(0.09, 0.09, 0.035, tin, 0, 0.018, 0, 24));
  g.add(cyl(0.093, 0.093, 0.02, mat(0xd4af37, { metalness: 0.9, roughness: 0.25 }), 0, 0.045, 0, 24));
  g.add(cyl(0.05, 0.05, 0.005, mat(0xfff3e0), 0, 0.057, 0, 20)); // etiketje
  // een wolkje bruin poeder bovenop
  g.add(cyl(0.035, 0.05, 0.02, mat(0x6d4c41, { roughness: 1 }), 0.03, 0.068, 0.01, 12));
  g.scale.setScalar(1.8);
  return shadows(g);
}

// Limburgse kersenvlaai met roosterwerk.
export function makeVlaai() {
  const g = new THREE.Group();
  g.add(cyl(0.2, 0.19, 0.05, mat(0xd29a52, { roughness: 0.8 }), 0, 0.025, 0, 24));
  g.add(cyl(0.18, 0.18, 0.012, mat(0x7a0f1e, { roughness: 0.3 }), 0, 0.052, 0, 24));
  const crust = mat(0xe0ab62, { roughness: 0.8 });
  for (let i = -2; i <= 2; i++) {
    g.add(box(0.34 - Math.abs(i) * 0.06, 0.012, 0.022, crust, 0, 0.06, i * 0.065));
    g.add(box(0.022, 0.012, 0.34 - Math.abs(i) * 0.06, crust, i * 0.065, 0.062, 0));
  }
  return shadows(g);
}

// Rode bezorgtas voor op de rug.
export function makeDeliveryBag() {
  const g = new THREE.Group();
  g.add(box(0.42, 0.42, 0.3, mat(0xc62828, { roughness: 0.7 }), 0, 0, 0));
  g.add(box(0.43, 0.06, 0.31, mat(0xffffff), 0, 0.08, 0));
  return shadows(g);
}

// Tv-camera voor op de schouder, met rood opnamelampje.
export function makeTvCamera() {
  const g = new THREE.Group();
  g.add(box(0.18, 0.2, 0.45, mat(0x222222, { metalness: 0.4 }), 0, 0, 0));
  g.add(cyl(0.07, 0.08, 0.16, mat(0x111111, { metalness: 0.6 }), 0, 0.01, 0.3).rotateX(Math.PI / 2));
  const lens = cyl(0.06, 0.06, 0.01, new THREE.MeshPhysicalMaterial({ color: 0x223355, roughness: 0.05, metalness: 0.8 }), 0, 0.01, 0.385);
  lens.rotation.x = Math.PI / 2;
  g.add(lens);
  const tally = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 2 }));
  tally.position.set(0, 0.12, 0.18);
  g.add(tally);
  g.add(box(0.04, 0.1, 0.14, mat(0x333333), 0, 0.14, -0.05));
  g.userData.tally = tally;
  return shadows(g);
}

export function makePitchfork() {
  const g = new THREE.Group();
  g.add(cyl(0.018, 0.018, 1.5, mat(0x8d6e63), 0, 0, 0, 8));
  const steel = mat(0x9e9e9e, { metalness: 0.8, roughness: 0.3 });
  g.add(box(0.2, 0.025, 0.025, steel, 0, 0.75, 0));
  for (const x of [-0.09, 0, 0.09]) g.add(cyl(0.008, 0.004, 0.32, steel, x, 0.92, 0, 6));
  return shadows(g);
}

export function makeWrench() {
  const g = new THREE.Group();
  const steel = mat(0xb0b4b8, { metalness: 0.9, roughness: 0.25 });
  g.add(box(0.03, 0.26, 0.012, steel, 0, 0, 0));
  const head = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.012, 6, 12, Math.PI * 1.5), steel);
  head.position.y = 0.15;
  g.add(head);
  return shadows(g);
}

export function makeRod() {
  const g = new THREE.Group();
  const rod = cyl(0.008, 0.02, 2.6, mat(0x3e2723), 0, 1.3, 0, 6);
  g.add(rod);
  g.add(cyl(0.03, 0.03, 0.05, mat(0x9e9e9e, { metalness: 0.7 }), 0.03, 0.3, 0, 10).rotateZ(Math.PI / 2));
  return shadows(g);
}

export function makeLantern(lit = true) {
  const g = new THREE.Group();
  g.add(box(0.14, 0.02, 0.14, mat(0x222222), 0, 0, 0));
  g.add(box(0.14, 0.02, 0.14, mat(0x222222), 0, 0.22, 0));
  const glow = box(0.1, 0.18, 0.1, new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffa040, emissiveIntensity: lit ? 2.2 : 0 }), 0, 0.11, 0);
  g.add(glow);
  g.add(new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.008, 6, 12), mat(0x222222)).translateY(0.27));
  return shadows(g);
}

// Stempelpost voor de Nacht van Gulpen: tafeltje, lantaarn en een oranje vlag.
export function makeStampPost() {
  const g = new THREE.Group();
  g.add(box(0.9, 0.04, 0.6, mat(0x8d6e63), 0, 0.75, 0));
  for (const x of [-0.4, 0.4]) for (const z of [-0.25, 0.25]) g.add(cyl(0.02, 0.02, 0.75, mat(0x5d4037), x, 0.375, z, 6));
  const lantern = makeLantern(true);
  lantern.position.set(-0.25, 0.77, 0);
  g.add(lantern);
  g.add(box(0.12, 0.04, 0.08, mat(0x1565c0), 0.2, 0.79, 0)); // stempel
  g.add(cyl(0.02, 0.02, 2.2, mat(0xdddddd, { metalness: 0.5 }), 0.55, 1.1, 0, 6));
  const flag = box(0.5, 0.32, 0.01, mat(0xff9800, { side: THREE.DoubleSide }), 0.81, 2.0, 0);
  g.add(flag);
  return shadows(g);
}

// Finishboog over de weg, met geblokte vlag.
export function makeFinishBanner(width = 9) {
  const g = new THREE.Group();
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const ctx = c.getContext('2d');
  for (let x = 0; x < 512; x += 24) for (let y = 0; y < 96; y += 24) { ctx.fillStyle = ((x + y) / 24) % 2 ? '#111' : '#fff'; ctx.fillRect(x, y, 24, 24); }
  ctx.fillStyle = 'rgba(232,163,61,.92)';
  ctx.fillRect(130, 14, 252, 68);
  ctx.fillStyle = '#1b2430';
  ctx.font = '800 54px "Baloo 2", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('FINISH', 256, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(width, 1.2), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide }));
  banner.position.y = 4.2;
  g.add(banner);
  for (const x of [-width / 2, width / 2]) g.add(cyl(0.08, 0.1, 4.8, mat(0xe8a33d), x, 2.4, 0, 8));
  return shadows(g);
}

// ------------------------------------------------------------ effecten

// Confetti-explosie die na een paar seconden vanzelf verdwijnt.
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.bursts = [];
    this.rings = [];
    this.puffs = [];
    this.initSmoke();
    this.initFireworks();
  }

  // Rookwolkje (bijv. bij de wielen tijdens hard remmen): groeit, stijgt een beetje en vervaagt.
  // De wolkjes liggen vooraf klaar (textuur, materiaal en shader al bij het laden), zodat het beeld
  // niet even hapert op het moment dat je voor het eerst hard remt.
  initSmoke() {
    if (this.smokePool) return;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grd.addColorStop(0, 'rgba(235,235,235,0.9)'); grd.addColorStop(0.5, 'rgba(210,210,210,0.45)'); grd.addColorStop(1, 'rgba(200,200,200,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    this.smokeTex = new THREE.CanvasTexture(c);
    this.smokePool = [];
    for (let i = 0; i < 80; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTex, transparent: true, depthWrite: false, opacity: 0 }));
      s.visible = false;
      s.frustumCulled = false;
      this.scene.add(s);
      this.smokePool.push(s);
    }
    // eentje onzichtbaar (doorzichtig) laten meedraaien, zodat de shader meteen bij het laden gecompileerd wordt
    this.smokePool[0].visible = true;
    this.smokePool[0].scale.setScalar(0.001);
  }
  // Vuurwerk: een raket stijgt op en spat uiteen in een bol gekleurde vonken.
  // Eén vooraf gemaakt (doorzichtig) puntje zorgt dat de shader al bij het laden klaar is.
  initFireworks() {
    this.rockets = [];
    this.sparks = [];
    const warm = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, -50, 0], 3)),
      new THREE.PointsMaterial({ size: 0.5, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    warm.frustumCulled = false;
    this.scene.add(warm);
  }
  firework(x, y, z, color = null, onBurst = null) {
    const c = color ?? [0xff5252, 0xffd740, 0x69f0ae, 0x40c4ff, 0xe040fb, 0xffffff, 0xff9100][Math.floor(Math.random() * 7)];
    const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([x, y, z], 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.9, color: 0xfff3c4, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
    pts.frustumCulled = false;
    this.scene.add(pts);
    this.rockets.push({ pts, x, y, z, vx: (Math.random() - 0.5) * 2, vy: 24 + Math.random() * 7, vz: (Math.random() - 0.5) * 2, t: 0, fuse: 1.0 + Math.random() * 0.5, color: c, onBurst });
  }
  burstFirework(x, y, z, color) {
    const n = 110;
    const pos = new Float32Array(n * 3), vel = new Float32Array(n * 3);
    const speed = 9 + Math.random() * 5;
    for (let i = 0; i < n; i++) {
      // gelijkmatig over een bol
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u), k = speed * (0.85 + Math.random() * 0.3);
      vel[i * 3] = r * Math.cos(a) * k; vel[i * 3 + 1] = u * k; vel[i * 3 + 2] = r * Math.sin(a) * k;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    }
    const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.75, color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
    pts.frustumCulled = false;
    this.scene.add(pts);
    this.sparks.push({ pts, vel, t: 0, life: 1.9 + Math.random() * 0.5 });
  }
  updateFireworks(dt) {
    for (const r of this.rockets) {
      r.t += dt;
      r.vy -= 6 * dt;
      r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt;
      r.pts.geometry.attributes.position.setXYZ(0, r.x, r.y, r.z);
      r.pts.geometry.attributes.position.needsUpdate = true;
      if (r.t >= r.fuse) { r.done = true; this.burstFirework(r.x, r.y, r.z, r.color); r.onBurst?.(); }
    }
    this.rockets = this.rockets.filter((r) => { if (r.done) { this.scene.remove(r.pts); r.pts.geometry.dispose(); r.pts.material.dispose(); return false; } return true; });
    for (const sp of this.sparks) {
      sp.t += dt;
      const a = sp.pts.geometry.attributes.position, v = sp.vel, drag = Math.max(0, 1 - 1.6 * dt);
      for (let i = 0; i < v.length; i += 3) {
        v[i] *= drag; v[i + 1] = v[i + 1] * drag - 5 * dt; v[i + 2] *= drag;
        a.array[i] += v[i] * dt; a.array[i + 1] += v[i + 1] * dt; a.array[i + 2] += v[i + 2] * dt;
      }
      a.needsUpdate = true;
      sp.pts.material.opacity = Math.max(0, 1 - Math.pow(sp.t / sp.life, 2));
    }
    this.sparks = this.sparks.filter((sp) => { if (sp.t > sp.life) { this.scene.remove(sp.pts); sp.pts.geometry.dispose(); sp.pts.material.dispose(); return false; } return true; });
  }

  smoke(x, y, z, size = 1) {
    this.initSmoke();
    let s = this.smokePool.find((q) => !q.userData.busy);
    if (!s) { const old = this.puffs.shift(); s = old.s; }
    s.userData.busy = true;
    s.visible = true;
    s.material.opacity = 0.75;
    s.material.rotation = 0;
    s.position.set(x, y, z);
    s.scale.setScalar(0.4 * size);
    this.puffs.push({ s, t: 0, size, vx: (Math.random() - 0.5) * 0.6, vz: (Math.random() - 0.5) * 0.6, rot: (Math.random() - 0.5) * 2 });
  }

  // Confetti is er alleen bij het slotfeest op de Markt (finale.js geeft dan finale = true).
  confetti(x, y, z, n = 140, finale = false) {
    if (!finale) return;
    const geo = new THREE.PlaneGeometry(0.12, 0.07);
    const m = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true });
    const inst = new THREE.InstancedMesh(geo, m, n);
    const colors = [0xe53935, 0xfdd835, 0x43a047, 0x1e88e5, 0x8e24aa, 0xff7043, 0xffffff];
    const parts = [];
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 4;
      parts.push({ p: new THREE.Vector3(x, y, z), v: new THREE.Vector3(Math.cos(a) * s * 0.6, 4 + Math.random() * 5, Math.sin(a) * s * 0.6), r: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0), spin: (Math.random() - 0.5) * 12 });
      inst.setColorAt(i, c.set(colors[i % colors.length]));
    }
    inst.frustumCulled = false;
    this.scene.add(inst);
    this.bursts.push({ inst, parts, t: 0 });
  }

  // uitdijende kring op het water
  splash(x, y, z, size = 1) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.08, 0.12, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y + 0.02, z);
    this.scene.add(m);
    this.rings.push({ m, t: 0, size });
  }

  update(dt) {
    this.updateFireworks(dt);
    const q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), mtx = new THREE.Matrix4();
    for (const b of this.bursts) {
      b.t += dt;
      b.parts.forEach((p, i) => {
        p.v.y -= 9.8 * dt * 0.6;
        p.v.multiplyScalar(1 - dt * 0.9);
        p.p.addScaledVector(p.v, dt);
        p.r.x += p.spin * dt; p.r.y += p.spin * dt * 0.7;
        q.setFromEuler(p.r);
        mtx.compose(p.p, q, s);
        b.inst.setMatrixAt(i, mtx);
      });
      b.inst.instanceMatrix.needsUpdate = true;
      b.inst.material.opacity = Math.max(0, 1 - Math.max(0, b.t - 2.2) / 0.8);
    }
    this.bursts = this.bursts.filter((b) => { if (b.t > 3) { this.scene.remove(b.inst); return false; } return true; });
    for (const r of this.rings) {
      r.t += dt;
      const k = 1 + r.t * 6 * r.size;
      r.m.scale.set(k, k, k);
      r.m.material.opacity = Math.max(0, 0.7 - r.t * 0.8);
    }
    this.rings = this.rings.filter((r) => { if (r.t > 0.9) { this.scene.remove(r.m); return false; } return true; });
    for (const p of this.puffs) {
      p.t += dt;
      p.s.position.x += p.vx * dt; p.s.position.z += p.vz * dt; p.s.position.y += dt * 0.5;
      p.s.scale.setScalar((0.4 + p.t * 2.2) * p.size);
      p.s.material.rotation += p.rot * dt;
      p.s.material.opacity = Math.max(0, 0.75 * (1 - p.t / 1.3));
    }
    this.puffs = this.puffs.filter((p) => { if (p.t > 1.3) { p.s.visible = false; p.s.material.opacity = 0; p.s.userData.busy = false; return false; } return true; });
  }
}

// Winkelwagentje (voor de karretjes-trein bij de PLUS).
export function makeCart() {
  const g = new THREE.Group();
  const metal = mat(0xc0c4c8, { metalness: 0.8, roughness: 0.3 });
  const red = mat(0xc62828);
  // mand als open bak van dunne wanden
  const walls = [[0.6, 0.45, 0.02, 0, 0.75, 0.42], [0.6, 0.45, 0.02, 0, 0.75, -0.42], [0.02, 0.45, 0.84, 0.3, 0.75, 0], [0.02, 0.45, 0.84, -0.3, 0.75, 0], [0.6, 0.02, 0.84, 0, 0.53, 0]];
  for (const [w, h, d, x, y, z] of walls) g.add(box(w, h, d, new THREE.MeshStandardMaterial({ color: 0xc0c4c8, metalness: 0.7, roughness: 0.4, transparent: true, opacity: 0.75 }), x, y, z));
  g.add(box(0.64, 0.04, 0.04, red, 0, 1.0, -0.5)); // handvat
  g.add(box(0.5, 0.03, 0.75, metal, 0, 0.18, 0));
  for (const [x, z] of [[-0.22, 0.32], [0.22, 0.32], [-0.22, -0.32], [0.22, -0.32]]) {
    const wheel = cyl(0.05, 0.05, 0.03, mat(0x222222), x, 0.05, z, 10);
    wheel.rotation.z = Math.PI / 2;
    g.add(wheel);
  }
  return shadows(g);
}

// Stapel van drie vlaaien op bordjes. userData.layers = de vlaaien, van onder naar boven.
export function makeVlaaiStack() {
  const g = new THREE.Group();
  const tops = [0x7a0f1e, 0xf3e6c0, 0x4a1d3a]; // kersen, rijst, pruimen
  g.userData.layers = [];
  tops.forEach((top, i) => {
    const l = new THREE.Group();
    l.add(cyl(0.21, 0.21, 0.012, mat(0xffffff), 0, 0, 0, 24));
    l.add(cyl(0.19, 0.18, 0.045, mat(0xd29a52, { roughness: 0.8 }), 0, 0.03, 0, 24));
    l.add(cyl(0.17, 0.17, 0.012, mat(top, { roughness: 0.35 }), 0, 0.055, 0, 24));
    l.position.y = i * 0.075;
    g.add(l);
    g.userData.layers.push(l);
  });
  return shadows(g);
}

// Borrelplank met kaas, worst en brood.
export function makeBorrelplank() {
  const g = new THREE.Group();
  g.add(box(0.5, 0.03, 0.28, mat(0x8d6e63, { roughness: 0.9 }), 0, 0.015, 0));
  for (let i = 0; i < 5; i++) g.add(box(0.05, 0.04, 0.05, mat(0xf2c14e), -0.18 + i * 0.05, 0.05, -0.07));
  for (let i = 0; i < 6; i++) g.add(cyl(0.022, 0.022, 0.012, mat(0xa0522d), -0.18 + i * 0.06, 0.04, 0.05, 10));
  g.add(box(0.14, 0.06, 0.07, mat(0xc98a4b), 0.15, 0.06, 0.02));
  return shadows(g);
}

// Pakketje in slagerspapier.
export function makeMeatPackage() {
  const g = new THREE.Group();
  g.add(box(0.3, 0.12, 0.2, mat(0xf3efe3, { roughness: 0.95 }), 0, 0.06, 0));
  g.add(box(0.31, 0.02, 0.04, mat(0xc62828), 0, 0.12, 0));
  g.userData.carrySide = true;
  return shadows(g);
}

// Lichtsnoer met lampjes tussen twee punten (voor een terras).
export function makeStringLights(length = 8, n = 12) {
  const g = new THREE.Group();
  const bulb = new THREE.MeshStandardMaterial({ color: 0xfff1c8, emissive: 0xffc070, emissiveIntensity: 1.2 });
  const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, length, 4), mat(0x222222));
  wire.rotation.z = Math.PI / 2;
  g.add(wire);
  for (let i = 0; i < n; i++) {
    const x = -length / 2 + (i + 0.5) * (length / n);
    const sag = -0.25 * Math.sin(((i + 0.5) / n) * Math.PI);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), bulb);
    b.position.set(x, sag, 0);
    g.add(b);
  }
  g.userData.bulb = bulb;
  return g;
}

// Koffer vol reisstickers.
export function makeSuitcase() {
  const g = new THREE.Group();
  g.add(box(0.5, 0.36, 0.18, mat(0x6d2f1e, { roughness: 0.6 }), 0, 0.18, 0));
  g.add(box(0.16, 0.04, 0.04, mat(0x222222), 0, 0.39, 0));
  const cols = [0xfdd835, 0x29b6f6, 0xef5350, 0x66bb6a, 0xffffff, 0xab47bc];
  for (let i = 0; i < 7; i++) {
    const st = box(0.09 + (i % 3) * 0.02, 0.07, 0.005, mat(cols[i % cols.length]), -0.18 + (i % 4) * 0.12, 0.1 + Math.floor(i / 4) * 0.12, 0.093);
    st.rotation.z = (i % 2 ? 1 : -1) * 0.2;
    g.add(st);
  }
  return shadows(g);
}

// Envelop met een buitenlands bankafschrift.
export function makeBankStatement() {
  const g = new THREE.Group();
  g.add(box(0.32, 0.01, 0.22, mat(0xf5f0e1), 0, 0.005, 0));
  g.add(box(0.3, 0.012, 0.2, mat(0xffffff), 0.02, 0.012, -0.02));
  for (let i = 0; i < 5; i++) g.add(box(0.2, 0.002, 0.012, mat(0x37474f), 0.0, 0.02, -0.07 + i * 0.03));
  g.add(box(0.05, 0.003, 0.05, mat(0xc62828), 0.1, 0.02, 0.06));
  return shadows(g);
}

// Houten offerblok met gleuf.
export function makeOfferblok() {
  const g = new THREE.Group();
  g.add(box(0.45, 0.9, 0.35, mat(0x4e342e, { roughness: 0.6 }), 0, 0.45, 0));
  g.add(box(0.5, 0.06, 0.4, mat(0x3e2723), 0, 0.93, 0));
  g.add(box(0.2, 0.012, 0.03, mat(0x111111), 0, 0.965, 0));
  g.add(box(0.12, 0.1, 0.02, mat(0xd4af37, { metalness: 1, roughness: 0.3 }), 0, 0.7, 0.18));
  // briefje
  const note = box(0.14, 0.003, 0.1, mat(0xfffde7), 0.08, 0.97, 0.05);
  note.rotation.y = 0.4;
  g.add(note);
  return shadows(g);
}

// Kruiwagen: bak, wiel voorop, twee handvatten achter. Lokaal kijkt hij naar +z (het wiel).
// userData.soil = de berg grond in de bak (schaal y = hoe vol), userData.tray = de bak (om te kiepen).
export function makeKruiwagen() {
  const g = new THREE.Group();
  const green = mat(0x2e7d32, { metalness: 0.4, roughness: 0.45 });
  const metal = mat(0x9e9e9e, { metalness: 0.7, roughness: 0.35 });
  const tray = new THREE.Group();
  tray.position.set(0, 0.55, 0.35);
  // bak: bodem en schuine wanden
  tray.add(box(0.5, 0.03, 0.7, green, 0, 0, 0));
  const side = (w, h, d, x, y, z, rx, rz) => { const o = box(w, h, d, green, x, y, z); o.rotation.set(rx, 0, rz); tray.add(o); };
  side(0.03, 0.3, 0.8, -0.3, 0.13, 0, 0, 0.35);
  side(0.03, 0.3, 0.8, 0.3, 0.13, 0, 0, -0.35);
  side(0.64, 0.3, 0.03, 0, 0.13, 0.42, -0.45, 0);
  side(0.6, 0.28, 0.03, 0, 0.12, -0.37, 0.2, 0);
  const soil = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x4a3220, { roughness: 1 }));
  soil.scale.set(0.85, 0.001, 1.15);
  soil.position.y = 0.03;
  tray.add(soil);
  g.add(tray);
  // wiel voorop
  const wheel = cyl(0.17, 0.17, 0.08, mat(0x222222, { roughness: 0.9 }), 0, 0.17, 0.85, 18);
  wheel.rotation.z = Math.PI / 2;
  g.add(wheel);
  const hub = cyl(0.05, 0.05, 0.1, metal, 0, 0.17, 0.85, 8);
  hub.rotation.z = Math.PI / 2;
  g.add(hub);
  // frame en handvatten (naar achteren en omhoog)
  for (const x of [-0.24, 0.24]) {
    const bar = box(0.035, 0.035, 1.25, metal, x, 0.5, 0.25);
    bar.rotation.x = -0.32;
    g.add(bar);
    g.add(box(0.045, 0.045, 0.16, mat(0x222222), x, 0.72, -0.38)); // handvat
    const leg = box(0.03, 0.42, 0.03, metal, x, 0.25, 0.05);
    g.add(leg);
  }
  g.userData.soil = soil;
  g.userData.tray = tray;
  return shadows(g);
}

// Schep met houten steel.
export function makeSchep() {
  const g = new THREE.Group();
  g.add(cyl(0.018, 0.018, 1.0, mat(0x8d6e63), 0, 0, 0, 8));
  const blade = box(0.2, 0.26, 0.02, mat(0x78909c, { metalness: 0.6, roughness: 0.4 }), 0, -0.6, 0);
  g.add(blade);
  g.add(box(0.14, 0.03, 0.03, mat(0x5d4037), 0, 0.5, 0));
  return shadows(g);
}
