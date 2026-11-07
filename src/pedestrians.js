// Dorpsbewoners die over de stoepen wandelen.
import { makeCharacter } from './character.js';
import { rng } from './world.js';

const SHIRTS = [0x37474f, 0x8d6e63, 0x1565c0, 0xc62828, 0x2e7d32, 0xf9a825, 0x6a1b9a, 0xeeeeee, 0x212121, 0xad1457, 0x00838f];
const PANTS = [0x263238, 0x1a237e, 0x3e2723, 0x424242, 0x5d4037, 0x1b1b1b];
const HAIR = [0x2a1a10, 0x4a3020, 0x111111, 0x9e9e9e, 0xd7b56d, 0x7a3b1f, 0xdddddd];
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
      const model = makeCharacter({
        shirt: SHIRTS[Math.floor(rand() * SHIRTS.length)], pants: PANTS[Math.floor(rand() * PANTS.length)],
        hair: HAIR[Math.floor(rand() * HAIR.length)], skin: SKIN[Math.floor(rand() * SKIN.length)],
        hat: rand() < 0.15 ? 'cap' : null, hatColor: SHIRTS[Math.floor(rand() * SHIRTS.length)], scale: 0.92 + rand() * 0.14,
      });
      model.traverse((o) => { if (o.isMesh) o.castShadow = !this.world.isMobile; });
      this.g.scene.add(model);
      const p = { model, speed: 1.1 + rand() * 0.5, side: rand() < 0.5 ? 1 : -1, x: 0, z: 0, heading: 0, bubble: 0 };
      this.pickRoute(p, rand, roads);
      p.dist = rand() * p.len;
      this.list.push(p);
    }
    this.roads = roads;
    this.rand = rand;
  }

  pickRoute(p, rand, roads) {
    const [, line] = roads[Math.floor(rand() * roads.length)];
    const pts = [];
    for (let i = 0; i < line.length; i += 2) pts.push([line[i], line[i + 1]]);
    if (rand() < 0.5) pts.reverse();
    p.pts = pts;
    p.len = pts.reduce((s, q, i) => (i ? s + Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) : 0), 0);
    p.dist = 0;
  }

  update(dt, player, playerSpeed) {
    const w = this.world;
    for (const p of this.list) {
      const dToPlayer = Math.hypot(p.x - player.x, p.z - player.z);
      // ver weg: niet tekenen en langzaam bijwerken
      const far = dToPlayer > 220;
      p.model.visible = !far;
      // aan de kant springen voor een snel voertuig
      if (dToPlayer < 2.2 && playerSpeed > 4) {
        const dx = p.x - player.x, dz = p.z - player.z, d = dToPlayer || 1;
        const [rx, rz] = w.resolve(p.x + (dx / d) * 2.5, p.z + (dz / d) * 2.5, 0.35);
        if (!w.blocked(rx, rz)) { p.x = rx; p.z = rz; }
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
      p.dist += p.speed * dt;
      if (p.dist >= p.len) {
        // aan het eind: omdraaien of een nieuwe straat kiezen
        if (this.rand() < 0.5) { p.pts.reverse(); p.dist = 0; } else this.pickRoute(p, this.rand, this.roads);
      }
      const q = along(p.pts, p.dist);
      // op de stoep: een stukje naast de wegas
      const off = 3.4 * p.side;
      let tx = q.x + Math.cos(q.heading) * -off, tz = q.z + Math.sin(q.heading) * off;
      if (w.blocked(tx, tz) || w.insideBuilding(tx, tz)) { tx = q.x; tz = q.z; }
      if (!far) [tx, tz] = w.resolve(tx, tz, 0.35);
      p.x += (tx - p.x) * Math.min(1, dt * 4);
      p.z += (tz - p.z) * Math.min(1, dt * 4);
      let dh = q.heading - p.heading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      p.heading += dh * Math.min(1, dt * 5);
      if (far) continue;
      p.model.position.set(p.x, w.groundAt(p.x, p.z), p.z);
      p.model.rotation.y = p.heading;
      p.model.userData.animate(dt, p.speed, 'walk');
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
