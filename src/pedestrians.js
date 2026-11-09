// Dorpsbewoners die over de stoepen wandelen.
import * as THREE from 'three';
import { makeCharacter, makeBike } from './character.js';
import { rng } from './world.js';
import { makeDog } from './animals.js';

// verder dan dit niet tekenen; wie nog verder weg is, verhuist (buiten beeld) naar jouw buurt
const FAR = 170;

const SHIRTS = [0x37474f, 0x8d6e63, 0x1565c0, 0xc62828, 0x2e7d32, 0xf9a825, 0x6a1b9a, 0xeeeeee, 0x212121, 0xad1457, 0x00838f];
const PANTS = [0x263238, 0x1a237e, 0x3e2723, 0x424242, 0x5d4037, 0x1b1b1b];
const HAIR = [0x2a1a10, 0x4a3020, 0x111111, 0x9e9e9e, 0xd7b56d, 0x7a3b1f, 0xdddddd];
const COATS = [0x3b3f45, 0x5a4632, 0x1f2d3d, 0x6b2e2e, 0x4b5d3a];
const EYES = [0x4a3222, 0x2f5d8a, 0x3f6b3a, 0x2a1a10];
const SKIN = [0xf0c8a0, 0xe0ac80, 0xc68642, 0x8d5524, 0xf5d6b4];
// Gulpense kreten (uit de woordenlijst Gulpens van mijnwoordenboek.nl) met vertaling
const SHOUTS = [['Toepes!', 'zot'], ['Onnut!', 'viezerik'], ['Behijdskriemer!', 'opschepper'], ['Pliesie!', 'politie']];
const GREETS = [['Adieje!', 'vaarwel'], ['Joa, joa.', 'ja, ja'], ['Schmiezele, hè?', 'motregen, hè?'], ['Alaaf!', null]];

export class Pedestrians {
  constructor(game, n) {
    this.g = game;
    this.world = game.world;
    this.list = [];
    const rand = rng(31);
    const roads = this.world.roads.filter(([, l]) => l.length >= 4);
    for (let i = 0; i < n && roads.length; i++) {
      const female = rand() < 0.5;
      const old = rand() < 0.25;
      const hair = old ? (rand() < 0.5 ? 0x9e9e9e : 0xdddddd) : HAIR[Math.floor(rand() * 5)];
      const model = makeCharacter({
        female,
        shirt: SHIRTS[Math.floor(rand() * SHIRTS.length)], pants: PANTS[Math.floor(rand() * PANTS.length)],
        hair, skin: SKIN[Math.floor(rand() * SKIN.length)],
        hairStyle: female ? (rand() < 0.3 ? 'bun' : 'long') : (old && rand() < 0.5 ? 'bald' : 'short'),
        sleeves: rand() < 0.55 ? 'long' : 'short', beard: !female && rand() < 0.18, glasses: rand() < (old ? 0.5 : 0.12),
        coat: rand() < 0.18 ? COATS[Math.floor(rand() * COATS.length)] : null,
        eyes: EYES[Math.floor(rand() * EYES.length)],
        hat: rand() < 0.12 ? 'cap' : null, hatColor: SHIRTS[Math.floor(rand() * SHIRTS.length)],
        scale: (female ? 0.93 : 0.98) + rand() * 0.08,
      });
      model.traverse((o) => { if (o.isMesh) o.castShadow = !this.world.isMobile; });
      this.g.scene.add(model);
      const p = { model, speed: 1.1 + rand() * 0.5, side: rand() < 0.5 ? 1 : -1, x: 0, z: 0, heading: 0, bubble: 0 };
      // wat ze bij zich hebben: een hond aan de lijn, boodschappentas of een kind aan de hand
      const roll = rand();
      if (roll < 0.2) {
        p.dog = makeDog(); p.dog.scale.setScalar(0.8 + rand() * 0.5); this.g.scene.add(p.dog);
        p.leash = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0x5d1a1a }));
        p.leash.frustumCulled = false; this.g.scene.add(p.leash);
        p.speed = 0.9 + rand() * 0.3;
      } else if (roll < 0.45) {
        const bag = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.32, 0.12), new THREE.MeshStandardMaterial({ color: [0xe53935, 0xfdd835, 0x1565c0, 0xffffff, 0x43a047][Math.floor(rand() * 5)], roughness: 0.8 }));
        this.g.attachToHand?.(model, bag, { offset: [0, -0.9, 0.05] });
      } else if (roll < 0.55) {
        p.child = makeCharacter({ shirt: SHIRTS[Math.floor(rand() * SHIRTS.length)], pants: PANTS[Math.floor(rand() * PANTS.length)], hair: HAIR[Math.floor(rand() * 5)], skin: SKIN[Math.floor(rand() * SKIN.length)], scale: 0.58 + rand() * 0.08, sleeves: 'short' });
        this.g.scene.add(p.child);
        p.speed = 0.9 + rand() * 0.25;
      }
      this.pickRoute(p, rand, roads);
      p.dist = rand() * p.len;
      this.list.push(p);
    }
    this.roads = roads;
    this.rand = rand;
    // fietsers op de rijbaan (rechts van de wegas)
    this.cyclists = [];
    const nc = this.world.isMobile ? 3 : 6;
    for (let i = 0; i < nc && roads.length; i++) {
      const rider = makeCharacter({ shirt: SHIRTS[Math.floor(rand() * SHIRTS.length)], pants: PANTS[Math.floor(rand() * PANTS.length)], hair: HAIR[Math.floor(rand() * 5)], skin: SKIN[Math.floor(rand() * SKIN.length)], hat: rand() < 0.3 ? 'cap' : null, hatColor: SHIRTS[Math.floor(rand() * SHIRTS.length)] });
      const bike = makeBike(SHIRTS[Math.floor(rand() * SHIRTS.length)]);
      const g = new THREE.Group();
      rider.position.set(0, 0.25, -0.25); g.add(bike, rider);
      this.g.scene.add(g);
      const c = { model: g, rider, speed: 4 + rand() * 2, side: 1, x: 0, z: 0, heading: 0 };
      this.pickRoute(c, rand, roads);
      c.dist = rand() * c.len;
      this.cyclists.push(c);
    }
    // mensen op een bankje in het dorp (ze zitten stil, dus ze kosten bijna niets)
    this.sitters = [];
    const start = this.g.startPos || [0, 0];
    const benches = (this.world.benchSpots || []).filter((b) => Math.hypot(b.x - start[0], b.z - start[1]) < 320).sort(() => rand() - 0.5).slice(0, this.world.isMobile ? 5 : 10);
    for (const b of benches) {
      const m = makeCharacter({ shirt: SHIRTS[Math.floor(rand() * SHIRTS.length)], pants: PANTS[Math.floor(rand() * PANTS.length)], hair: rand() < 0.5 ? 0x9e9e9e : HAIR[Math.floor(rand() * 5)], skin: SKIN[Math.floor(rand() * SKIN.length)], female: rand() < 0.5, hairStyle: rand() < 0.4 ? 'long' : 'short', glasses: rand() < 0.4 });
      const off = (rand() - 0.5) * 0.9;
      const x = b.x + Math.cos(b.yaw) * off + Math.sin(b.yaw) * 0.05, z = b.z - Math.sin(b.yaw) * off + Math.cos(b.yaw) * 0.05;
      m.position.set(x, this.world.groundAt(x, z) + 0.19, z); // op de zitting (die zit op 0,48 m)
      m.rotation.y = b.yaw;
      this.g.scene.add(m);
      this.sitters.push({ model: m, x, z });
    }
  }

  // ver weg? Dan verhuist iemand naar een straat in de buurt van de speler, zo blijft het rond jou levendig
  relocate(p, player) {
    for (let k = 0; k < 24; k++) {
      const [, line] = this.roads[Math.floor(this.rand() * this.roads.length)];
      const n = line.length / 2;
      const i = Math.floor(this.rand() * n);
      const x = line[i * 2], z = line[i * 2 + 1];
      const d = Math.hypot(x - player.x, z - player.z);
      if (d < 45 || d > 150 || this.inView(x, z)) continue;
      const pts = [];
      for (let j = 0; j < line.length; j += 2) pts.push([line[j], line[j + 1]]);
      if (this.rand() < 0.5) pts.reverse();
      p.pts = pts;
      p.len = pts.reduce((s, q, j) => (j ? s + Math.hypot(q[0] - pts[j - 1][0], q[1] - pts[j - 1][1]) : 0), 0);
      // afstand tot het gekozen punt langs de lijn
      let acc = 0;
      const ii = pts.findIndex((q) => q[0] === x && q[1] === z);
      for (let j = 1; j <= ii; j++) acc += Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]);
      p.dist = acc;
      p.line = line;
      p.x = x; p.z = z; p.snap = true;
      return true;
    }
    return false;
  }

  pickRoute(p, rand, roads) {
    const [, line] = roads[Math.floor(rand() * roads.length)];
    const pts = [];
    for (let i = 0; i < line.length; i += 2) pts.push([line[i], line[i + 1]]);
    if (rand() < 0.5) pts.reverse();
    p.pts = pts;
    p.line = line;
    p.len = pts.reduce((s, q, i) => (i ? s + Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) : 0), 0);
    p.dist = 0;
    p.snap = true;
  }

  // aan het eind van een straat: verder over een straat die daar begint, of omdraaien.
  // (vroeger was dat een willekeurige straat ergens anders, en dan gleed iemand er dwars door alles heen)
  nextRoute(p) {
    const [ex, ez] = p.pts[p.pts.length - 1];
    const opts = [];
    for (const [, l] of this.roads) {
      if (l === p.line) continue;
      const n = l.length;
      if (Math.hypot(l[0] - ex, l[1] - ez) < 2.5) opts.push([l, false]);
      else if (Math.hypot(l[n - 2] - ex, l[n - 1] - ez) < 2.5) opts.push([l, true]);
    }
    if (!opts.length || this.rand() < 0.25) { p.pts.reverse(); p.dist = 0; return; }
    const [l, rev] = opts[Math.floor(this.rand() * opts.length)];
    const pts = [];
    for (let i = 0; i < l.length; i += 2) pts.push([l[i], l[i + 1]]);
    if (rev) pts.reverse();
    p.pts = pts;
    p.line = l;
    p.len = pts.reduce((s, q, i) => (i ? s + Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) : 0), 0);
    p.dist = 0;
  }

  // staat een punt in beeld? (binnen de kijkhoek van de camera, of heel dichtbij)
  inView(x, z) {
    const v = this.view;
    if (!v) return true;
    const dx = x - v.x, dz = z - v.z, d = Math.hypot(dx, dz);
    if (d < 12) return true;
    return (dx * v.fx + dz * v.fz) / d > v.cos;
  }

  updateView() {
    const cam = this.g.camera;
    if (!cam) { this.view = null; return; }
    if (!this._dir) this._dir = new THREE.Vector3();
    cam.getWorldDirection(this._dir);
    const l = Math.hypot(this._dir.x, this._dir.z) || 1;
    const half = Math.atan(Math.tan(((cam.fov || 60) * Math.PI) / 360) * (cam.aspect || 1.6));
    this.view = { x: cam.position.x, z: cam.position.z, fx: this._dir.x / l, fz: this._dir.z / l, cos: Math.cos(Math.min(Math.PI * 0.95, half + 0.35)) };
  }

  // rustig naar het doelpunt bewegen, nooit sneller dan een flinke pas; alleen ver weg of buiten beeld meteen neerzetten
  stepTo(p, tx, tz, maxSpeed, dt, far) {
    const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
    if (p.snap || (d > 15 && (far || !this.inView(p.x, p.z)))) { p.x = tx; p.z = tz; p.snap = false; return; }
    const step = maxSpeed * dt;
    if (d <= step) { p.x = tx; p.z = tz; } else { p.x += (dx / d) * step; p.z += (dz / d) * step; }
  }

  update(dt, player, playerSpeed) {
    const w = this.world;
    let moved = false; // hoogstens één verhuizing per beeld
    this.updateView();
    this.updateCyclists(dt, player);
    for (const s of this.sitters || []) { const d = Math.hypot(s.x - player.x, s.z - player.z); s.model.visible = d < 160; if (d < 60) s.model.userData.animate(dt, 0, 'sit'); }
    for (const p of this.list) {
      let dToPlayer = Math.hypot(p.x - player.x, p.z - player.z);
      // al onzichtbaar ver weg? Dan verhuist iemand naar een straat in de buurt, buiten beeld
      if (dToPlayer > FAR + 10 && !moved && this.relocate(p, player)) { moved = true; dToPlayer = Math.hypot(p.x - player.x, p.z - player.z); }
      // ver weg: niet tekenen en langzaam bijwerken
      const far = dToPlayer > FAR;
      p.model.visible = !far;
      if (p.dog) { p.dog.visible = !far; p.leash.visible = !far; }
      if (p.child) p.child.visible = !far;
      // opzij stappen: snel bij een rennende speler of een voertuig, anders een klein stapje als je tegen iemand aan loopt.
      // Dat gaat met een snelheid die uitdooft, zodat niemand meer verspringt.
      const ddx = p.x - player.x, ddz = p.z - player.z, dd = dToPlayer || 1;
      if (dToPlayer < 0.9 && !p.dodging) {
        // zacht wegduwen, hoogstens een rustige stap (2 m/s)
        p.dvx = (p.dvx || 0) + (ddx / dd) * 20 * dt; p.dvz = (p.dvz || 0) + (ddz / dd) * 20 * dt;
        const v = Math.hypot(p.dvx, p.dvz); if (v > 2) { p.dvx *= 2 / v; p.dvz *= 2 / v; }
      }
      if (dToPlayer < 2.2 && playerSpeed > 4.2) {
        if (!p.dodging) { const sp = playerSpeed > 8 ? 7 : 4.5; p.dvx = (ddx / dd) * sp; p.dvz = (ddz / dd) * sp; p.dodging = true; setTimeout(() => (p.dodging = false), 700); }
        p.bubble = 2;
        if (!p.said) {
          const [word, nl] = SHOUTS[Math.floor(Math.random() * SHOUTS.length)];
          this.g.ui.toastDialect(word, nl, 1400);
          p.said = true; setTimeout(() => (p.said = false), 4000);
        }
      } else if (dToPlayer < 2.5 && playerSpeed < 3 && !p.greeted && Math.random() < 0.5) {
        // groeten als je rustig langsloopt
        const [word, nl] = GREETS[Math.floor(Math.random() * GREETS.length)];
        this.g.ui.toastDialect(word, nl, 1400);
        p.greeted = true; setTimeout(() => (p.greeted = false), 45000);
      } else if (dToPlayer < 2.5 && !p.greeted) {
        p.greeted = true; setTimeout(() => (p.greeted = false), 45000);
      }
      // even stilstaan na een duw, en niet verder lopen terwijl je opzij stapt
      const pushing = Math.hypot(p.dvx || 0, p.dvz || 0) > 0.3;
      if (!pushing) p.dist += p.speed * dt;
      if (p.dist >= p.len) this.nextRoute(p);
      const q = along(p.pts, p.dist);
      // op de stoep: een stukje naast de wegas; past dat niet, dan wat dichter bij de as
      const off = 3.4 * p.side;
      let tx = q.x, tz = q.z;
      for (const k of [1, 0.7, 0.4]) {
        const ax = q.x - Math.cos(q.heading) * off * k, az = q.z + Math.sin(q.heading) * off * k;
        if (!w.blocked(ax, az) && !w.insideBuilding(ax, az)) { tx = ax; tz = az; break; }
      }
      if (!far) [tx, tz] = w.resolve(tx, tz, 0.35);
      if (pushing) {
        // opzij stappen, langs gevels en niet het water in
        const nx = p.x + p.dvx * dt, nz = p.z + p.dvz * dt;
        const [rx, rz] = w.resolve(nx, nz, 0.35);
        if (!w.blocked(rx, rz)) { p.x = rx; p.z = rz; }
      } else this.stepTo(p, tx, tz, p.speed * 1.6 + 0.4, dt, far);
      const decay = Math.exp(-dt * 5);
      p.dvx = (p.dvx || 0) * decay; p.dvz = (p.dvz || 0) * decay;
      let dh = q.heading - p.heading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      p.heading += dh * Math.min(1, dt * 5);
      if (far) continue;
      p.model.position.set(p.x, w.groundAt(p.x, p.z), p.z);
      p.model.rotation.y = p.heading;
      // verder weg minder vaak animeren
      p.animDt = (p.animDt || 0) + dt;
      const every = dToPlayer > 70 ? 2 : 1;
      p.animTick = ((p.animTick || 0) + 1) % every;
      if (p.animTick === 0) { p.model.userData.animate(p.animDt, p.speed, 'walk'); p.animDt = 0; }
      // hond loopt schuin voor of naast het baasje, aan de lijn
      const fx = Math.sin(p.heading), fz = Math.cos(p.heading), rx = -Math.cos(p.heading), rz = Math.sin(p.heading);
      if (p.dog) {
        const dx = p.x + fx * 1.3 + rx * 0.5, dz = p.z + fz * 1.3 + rz * 0.5;
        p.dog.position.set(dx, w.groundAt(dx, dz), dz);
        p.dog.rotation.y = p.heading;
        p.dog.userData.animate(dt, p.speed);
        const a = p.leash.geometry.attributes.position;
        a.setXYZ(0, p.x + rx * 0.25 + fx * 0.2, p.model.position.y + 0.85, p.z + rz * 0.25 + fz * 0.2);
        a.setXYZ(1, dx, p.dog.position.y + 0.5, dz);
        a.needsUpdate = true;
      }
      // kind loopt naast de ouder
      if (p.child) {
        const cx = p.x + rx * 0.7, cz = p.z + rz * 0.7;
        p.child.position.set(cx, w.groundAt(cx, cz), cz);
        p.child.rotation.y = p.heading;
        if (p.animTick === 0) p.child.userData.animate(dt * (every || 1), p.speed * 1.3, 'walk');
      }
    }
  }

  updateCyclists(dt, player) {
    const w = this.world;
    for (const c of this.cyclists || []) {
      let d = Math.hypot(c.x - player.x, c.z - player.z);
      if (d > FAR + 10 && this.relocate(c, player)) d = Math.hypot(c.x - player.x, c.z - player.z);
      c.dist += c.speed * dt;
      if (c.dist >= c.len) this.nextRoute(c);
      const q = along(c.pts, c.dist);
      // rechts van de wegas fietsen
      const tx = q.x + Math.cos(q.heading) * -1.6, tz = q.z + Math.sin(q.heading) * 1.6;
      this.stepTo(c, tx, tz, c.speed * 1.4 + 1, dt, d > FAR);
      let dh = q.heading - c.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); c.heading += dh * Math.min(1, dt * 4);
      c.model.visible = d < FAR;
      if (d > FAR) continue;
      c.model.position.set(c.x, w.groundAt(c.x, c.z), c.z);
      c.model.rotation.y = c.heading;
      if (d < 90) c.rider.userData.animate(dt, c.speed, 'bike');
    }
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
