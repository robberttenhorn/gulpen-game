// SixSense: drie flyers met een kortingscode liggen verspreid door het dorp (ook op de kaart).
// Heb je ze alle drie, dan komt er een zwarte bus met een grote roze 6 voorrijden. Instappen,
// de bus rijdt een hoekje om, staat vijf seconden te schommelen en te piepen, en daarna stap je
// vanzelf weer uit. Niets expliciets: je ziet alleen de bus van buiten.
import * as THREE from 'three';

const KEY = 'gulpe-sixsense';
const CODES = ['SIX-GULPE', 'SIX-VLAAI', 'SIX-ALAAF'];
const PINK = '#ff3d9a';

function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } }
function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* negeren */ } }

function sixTexture(w = 512, h = 512, big = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  if (!big) { x.fillStyle = '#111'; x.fillRect(0, 0, w, h); }
  x.font = `900 ${h * (big ? 0.9 : 0.55)}px "Baloo 2", sans-serif`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.shadowColor = PINK; x.shadowBlur = h * 0.08;
  x.fillStyle = PINK; x.fillText('6', w / 2, h * (big ? 0.56 : 0.42));
  if (!big) { x.shadowBlur = 0; x.fillStyle = '#fff'; x.font = `800 ${h * 0.13}px Inter, sans-serif`; x.fillText('SixSense', w / 2, h * 0.8); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// flyer op de grond: zwart kaartje met een roze 6, zwevend en draaiend zodat je hem ziet liggen
function makeFlyer() {
  const g = new THREE.Group();
  const card = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.6), new THREE.MeshStandardMaterial({ map: sixTexture(256, 360, false), emissive: 0xff3d9a, emissiveIntensity: 0.25, side: THREE.DoubleSide, roughness: 0.6 }));
  card.position.y = 0.55;
  g.add(card);
  const glow = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.5, 24), new THREE.MeshBasicMaterial({ color: 0xff3d9a, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.04;
  g.add(glow);
  g.userData.card = card; g.userData.glow = glow;
  return g;
}

// zwarte bus met roze 6 op beide zijkanten en een roze lichtstrip eronder
function makeSixBus() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const black = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, metalness: 0.6, roughness: 0.3 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1a1220, metalness: 0.9, roughness: 0.1 });
  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; body.add(o); return o; };
  box(2.0, 1.9, 4.8, black, 0, 1.35, 0);
  box(1.96, 0.7, 1.0, black, 0, 0.75, 2.75); // neus
  box(1.9, 0.6, 0.05, glass, 0, 1.75, 2.42); // voorruit
  for (const s of [-1, 1]) box(0.05, 0.55, 1.2, glass, s * 1.01, 1.85, 1.6);
  const six = new THREE.MeshStandardMaterial({ map: sixTexture(), transparent: true, emissive: 0xff3d9a, emissiveIntensity: 0.9, emissiveMap: sixTexture() });
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.1), six);
    p.position.set(s * 1.012, 1.3, -0.5); p.rotation.y = s * Math.PI / 2;
    body.add(p);
  }
  const back6 = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), six);
  back6.position.set(0, 1.5, -2.41); back6.rotation.y = Math.PI; body.add(back6);
  // roze lichtstrip en koplampen
  const neon = new THREE.MeshStandardMaterial({ color: 0xff3d9a, emissive: 0xff3d9a, emissiveIntensity: 2.2 });
  for (const s of [-1, 1]) box(0.04, 0.06, 4.6, neon, s * 1.0, 0.42, 0);
  for (const s of [-1, 1]) box(0.3, 0.14, 0.05, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3d6, emissiveIntensity: 1.5 }), s * 0.7, 0.85, 3.26);
  // zwaailicht in de vorm van een hartje op het dak
  const heart = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), neon);
  heart.position.set(0, 2.38, 0.8); body.add(heart);
  g.userData.heart = heart;
  // wielen (staan stil t.o.v. de bak: de bak schommelt, de wielen niet)
  const tyre = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const wheels = [];
  for (const [x, z] of [[-0.95, 1.7], [0.95, 1.7], [-0.95, -1.6], [0.95, -1.6]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.28, 18), tyre);
    w.rotation.z = Math.PI / 2; w.position.set(x, 0.38, z); w.castShadow = true;
    g.add(w); wheels.push(w);
  }
  g.userData.body = body; g.userData.wheels = wheels;
  return g;
}

export class SixSense {
  constructor(game) {
    this.g = game;
    this.state = load(); // { found: [0, 2], done: true }
    this.state.found ||= [];
    this.flyers = [];
    this.bus = null;
  }

  setup() {
    const g = this.g, w = g.world;
    const poi = (id) => w.meta.pois.find((p) => p.id === id);
    // drie plekken: bij het busstation, bij het tankstation en op de Markt
    const spots = [
      ['busstation', 'Bij het busstation'],
      ['tankstation', 'Bij het tankstation'],
      ['markt', 'Op de Markt'],
    ].map(([id, place], i) => {
      let x, z;
      if (id === 'markt') [x, z] = w.spotNear(20, 0);
      else { const p = poi(id); if (!p) return null; [x, z] = w.spotNear(...p.pos); }
      // een paar meter opzij, niet in een pand of het water
      for (const [dx, dz] of [[3, 2], [-3, 2], [2, -3], [0, 0]]) {
        if (!w.insideBuilding(x + dx, z + dz) && !w.blocked(x + dx, z + dz)) { x += dx; z += dz; break; }
      }
      return { i, x, z, place };
    }).filter(Boolean);
    this.spots = spots;
    this.spawnFlyers();
    g.updaters.add((dt) => this.update(dt));
    // alle drie al gevonden maar de bus nog niet gehad (bijv. na herladen): bus komt alsnog
    if (this.state.found.length >= 3) setTimeout(() => this.callBus(), 4000);
  }

  // flyers neerleggen die nog niet gevonden zijn
  spawnFlyers() {
    const g = this.g, w = g.world;
    for (const s of this.spots) {
      if (this.state.found.includes(s.i) || this.flyers.some((f) => f.i === s.i)) continue;
      const m = makeFlyer();
      m.position.set(s.x, w.groundAt(s.x, s.z), s.z);
      g.scene.add(m);
      // ligt hij precies waar je staat (na de bus), dan pas oppakken als je eerst even wegloopt
      this.flyers.push({ ...s, m, armed: Math.hypot(g.player.x - s.x, g.player.z - s.z) > 8 });
    }
  }

  // voor de kaart
  markers() {
    return this.flyers.map((f) => ({ key: 'flyer' + f.i, x: f.x, z: f.z, title: 'SixSense-flyer', place: `${f.place} · kortingscode ${this.state.found.length + 1}/3`, color: PINK, glyph: '6', state: 'flyer', stateLabel: 'Flyer', npc: false }));
  }

  update(dt) {
    const g = this.g, p = g.player;
    for (const f of this.flyers) {
      f.m.userData.card.rotation.y += dt * 1.6;
      f.m.userData.card.position.y = 0.55 + Math.sin(g.time * 2.5 + f.i) * 0.08;
      f.m.userData.glow.material.opacity = 0.35 + Math.sin(g.time * 4) * 0.2;
      const d = Math.hypot(p.x - f.x, p.z - f.z);
      if (!f.armed) { if (d > 8) f.armed = true; continue; }
      if (!g.ui.dialogOpen && !g.interior && d < (g.mode === 'car' ? 3.5 : 1.8)) this.pickUp(f);
    }
    this.updateBus(dt);
  }

  pickUp(f) {
    const g = this.g;
    g.scene.remove(f.m);
    this.flyers = this.flyers.filter((q) => q !== f);
    this.state.found.push(f.i);
    save(this.state);
    const n = this.state.found.length;
    g.sfx?.play('coin');
    this.showCard(CODES[f.i], n);
    g.updateMarkers();
    if (n >= 3) setTimeout(() => this.callBus(), 1200); // de bus is er binnen een paar seconden
  }

  // flyer even groot in beeld
  showCard(code, n) {
    const el = document.createElement('div');
    el.className = 'six-card';
    el.innerHTML = `<div class="six-6">6</div><div class="six-name">SixSense</div><div class="six-deal">20% korting</div><div class="six-code">${code}</div><div class="six-count">${n >= 3 ? 'Alle 3 de codes! Er komt iets aan...' : `Kortingscode ${n} van 3`}</div>`;
    document.getElementById('hud').appendChild(el);
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3200);
  }

  // ---------------------------------------------------------- de bus
  // een route over de straat waar je bent: van ~45 m terug naar vlak bij jou
  routeNear(x, z) {
    const w = this.g.world;
    const st = w.nearestStreet(x, z);
    const path = st && w.streetPath(st.name);
    if (!path || path.length < 2) return null;
    let bi = 0, bd = Infinity;
    path.forEach(([px, pz], i) => { const d = Math.hypot(px - st.x, pz - st.z); if (d < bd) { bd = d; bi = i; } });
    const walk = (from, dir, len) => {
      const pts = [path[from]];
      let acc = 0, i = from;
      while (acc < len && path[i + dir]) { acc += Math.hypot(path[i + dir][0] - path[i][0], path[i + dir][1] - path[i][1]); i += dir; pts.push(path[i]); }
      return { pts, acc };
    };
    let back = walk(bi, -1, 26);
    let dir = 1;
    if (back.acc < 14) { back = walk(bi, 1, 26); dir = -1; }
    const inPts = back.pts.slice().reverse();
    inPts.push([st.x, st.z]);
    const onward = walk(bi, dir, 14).pts;
    return { inPts, onward, bi };
  }

  callBus() {
    const g = this.g;
    if (this.bus) return;
    const r = this.routeNear(g.player.x, g.player.z);
    if (!r) return;
    const bus = makeSixBus();
    g.scene.add(bus);
    this.bus = { m: bus, route: r.inPts, s: 0, phase: 'aanrijden', t: 0, onward: r.onward, speed: 12 };
    this.placeOnRoute(this.bus, 0);
    g.ui.toast('Wat is dat? Een zwarte bus met een grote roze 6 komt eraan...', 3200);
    g.sfx?.play('honk');
  }

  placeOnRoute(b, s) {
    const w = this.g.world, pts = b.route;
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (acc + l >= s || i === pts.length - 1) {
        const f = l ? Math.min(1, (s - acc) / l) : 1;
        const x = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, z = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f;
        b.m.position.set(x, w.groundAt(x, z), z);
        if (l > 0.01) b.m.rotation.y = Math.atan2(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        return acc + l >= s;
      }
      acc += l;
    }
    return false;
  }

  routeLen(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }

  updateBus(dt) {
    const b = this.bus;
    if (!b) return;
    const g = this.g, m = b.m, ud = m.userData;
    b.t += dt;
    ud.heart.material.emissiveIntensity = 1.5 + Math.sin(g.time * 8) * 1.2;
    const roll = (v) => ud.wheels.forEach((wh) => { wh.rotation.x += v * dt / 0.38; });
    if (b.phase === 'aanrijden' || b.phase === 'hoekje' || b.phase === 'wegrijden') {
      const L = this.routeLen(b.route);
      const left = L - b.s;
      const v = Math.max(2, Math.min(b.speed, left * 1.2));
      b.s = Math.min(L, b.s + v * dt);
      this.placeOnRoute(b, b.s);
      roll(v);
      if (b.s >= L - 0.05) {
        if (b.phase === 'aanrijden') {
          b.phase = 'wachten';
          // zijdeur aan de stoepkant: uitnodiging om in te stappen
          const side = new THREE.Vector3(1.6, 0, -0.5).applyEuler(m.rotation).add(m.position);
          g.extraInteract = { x: side.x, z: side.z, r: 3, label: 'Instappen in de SixSense-bus', short: 'Instappen', action: () => this.board() };
          g.ui.toast('De deur schuift open. Instappen?', 2400);
          g.sfx?.play('door');
        } else if (b.phase === 'hoekje') {
          b.phase = 'schommelen'; b.t = 0;
        } else {
          g.scene.remove(m);
          this.bus = null;
        }
      }
    } else if (b.phase === 'schommelen') {
      // vijf seconden schommelen, piepen en kraken
      const k = Math.min(1, b.t / 0.6) * (b.t > 4.4 ? Math.max(0, (5 - b.t) / 0.6) : 1);
      ud.body.rotation.z = Math.sin(b.t * 13) * 0.07 * k;
      ud.body.rotation.x = Math.sin(b.t * 6.5) * 0.025 * k;
      ud.body.position.y = Math.abs(Math.sin(b.t * 13)) * 0.06 * k;
      b.sq = (b.sq || 0) - dt;
      if (b.sq <= 0 && b.t < 4.8) { b.sq = 0.24 + Math.random() * 0.12; g.sfx?.play(Math.random() < 0.6 ? 'squeak' : 'creak'); }
      if (b.t >= 5) this.unboard();
    }
  }

  board() {
    const g = this.g, b = this.bus;
    if (!b || b.phase !== 'wachten') return;
    if (g.minigame) { g.ui.toast('Rond eerst je missie af.', 1800); return; }
    g.extraInteract = null;
    g.setMode?.('walk'); // eerst: setMode maakt je poppetje weer zichtbaar
    g.player.lockedFor = true;
    g.player.speed = 0;
    g.player.group.visible = false;
    g.sfx?.play('door');
    // tijdens de hele scène geen knoppen: alleen kijken
    document.body.classList.add('cutscene');
    g.ui.prompt(null); g.ui.setActionLabel(null);
    this.sceneMini = { stop: () => this.unboard(), update: () => {}, actionLabel: null, debug: { label: null } };
    g.minigame = this.sceneMini;
    // meteen schommelen, de bus blijft staan
    b.phase = 'schommelen'; b.t = 0;
    g.pov = { pos: this.sceneCamera(b.m), look: b.m.position.clone().add(new THREE.Vector3(0, 1.2, 0.3)), snap: true };
  }

  // camera van buiten die de hele bus in beeld heeft, ook op een smal (staand) telefoonscherm
  sceneCamera(m) {
    const g = this.g, w = g.world;
    const vfov = THREE.MathUtils.degToRad(g.camera.fov), asp = innerWidth / innerHeight;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * asp);
    const half = 4.0; // halve breedte die in beeld moet (bus schuin van voren gezien, met wat ruimte)
    let dist = THREE.MathUtils.clamp(half / Math.tan(hfov / 2), 7, 20);
    const c = m.position;
    const trees = w.objects?.trees || [];
    // bomen tussen camera en bus tellen (een stam midden in beeld is erg storend)
    const treesInWay = (px, pz) => {
      let n = 0;
      const dx = px - c.x, dz = pz - c.z, L2 = dx * dx + dz * dz || 1;
      for (const [tx, tz] of trees) {
        if (Math.abs(tx - c.x) > dist + 3 || Math.abs(tz - c.z) > dist + 3) continue;
        const t = ((tx - c.x) * dx + (tz - c.z) * dz) / L2;
        if (t < 0.15 || t > 1.05) continue;
        if (Math.hypot(tx - (c.x + dx * t), tz - (c.z + dz * t)) < 2.2) n++;
      }
      return n;
    };
    let best = null;
    for (const side of [1, -1]) {
      for (const fwd of [0.57, 0.25, 0.85, -0.3]) {
        const dir = new THREE.Vector3(side * Math.sqrt(1 - fwd * fwd), 0, fwd).applyAxisAngle(new THREE.Vector3(0, 1, 0), m.rotation.y);
        const px = c.x + dir.x * dist, pz = c.z + dir.z * dist, py = c.y + 2.2 + dist * 0.12;
        const free = w.occlusion(c.x, c.y + 1.5, c.z, px, py, pz);
        const score = free * 2 - treesInWay(c.x + dir.x * dist * free, c.z + dir.z * dist * free) * 0.8 - Math.abs(fwd - 0.57) * 0.3;
        if (!best || score > best.score) best = { score, free, dir };
      }
    }
    if (best.free < 1) dist = Math.max(5, dist * best.free * 0.92); // niet door een gevel heen kijken
    return new THREE.Vector3(c.x + best.dir.x * dist, c.y + 2.2 + dist * 0.12, c.z + best.dir.z * dist);
  }

  unboard() {
    const g = this.g, b = this.bus;
    if (!b || b.phase === 'klaar' || b.phase === 'wegrijden') return;
    b.phase = 'klaar';
    const ud = b.m.userData;
    ud.body.rotation.set(0, 0, 0); ud.body.position.y = 0;
    // je stapt aan de stoepkant uit
    const out = new THREE.Vector3(2.4, 0, -0.5).applyEuler(b.m.rotation).add(b.m.position);
    const [x, z] = g.world.resolve(out.x, out.z, 0.5);
    g.player.x = x; g.player.z = z;
    g.player.heading = b.m.rotation.y + Math.PI / 2;
    g.player.group.visible = true;
    g.player.lockedFor = false;
    g.pov = null;
    if (g.minigame === this.sceneMini) g.minigame = null;
    document.body.classList.remove('cutscene');
    g.camYaw = g.player.heading + Math.PI;
    g.updateCamera(0, true);
    g.sfx?.play('door');
    g.ui.toast('Vijf seconden. Een persoonlijk record. Alles netjes betaald met korting.', 3600);
    this.state.done = true;
    this.state.times = (this.state.times || 0) + 1;
    // en meteen weer weg
    const r = this.routeNear(b.m.position.x, b.m.position.z);
    b.route = [[b.m.position.x, b.m.position.z], ...(r ? r.onward.slice(1).concat(this.extend(r)) : [[b.m.position.x + 40, b.m.position.z]])];
    b.s = 0; b.speed = 11; b.phase = 'wegrijden';
    g.sfx?.play('honk');
    // de flyers liggen er daarna weer: je kunt het opnieuw doen
    this.state.found = [];
    save(this.state);
    setTimeout(() => { this.spawnFlyers(); g.updateMarkers(); }, 4000);
  }

  // een stuk verder weg over dezelfde straat, zodat de bus uit beeld rijdt
  extend(r) {
    const last = r.onward.at(-1), prev = r.onward.at(-2) || [last[0] - 1, last[1]];
    const dx = last[0] - prev[0], dz = last[1] - prev[1], l = Math.hypot(dx, dz) || 1;
    return [[last[0] + (dx / l) * 50, last[1] + (dz / l) * 50]];
  }
}
