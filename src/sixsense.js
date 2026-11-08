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
    for (const s of spots) {
      if (this.state.found.includes(s.i)) continue;
      const m = makeFlyer();
      m.position.set(s.x, w.groundAt(s.x, s.z), s.z);
      g.scene.add(m);
      this.flyers.push({ ...s, m });
    }
    g.updaters.add((dt) => this.update(dt));
    // alle drie al gevonden maar de bus nog niet gehad (bijv. na herladen): bus komt alsnog
    if (this.state.found.length >= 3 && !this.state.done) setTimeout(() => this.callBus(), 6000);
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
      if (!g.ui.dialogOpen && !g.interior && Math.hypot(p.x - f.x, p.z - f.z) < (g.mode === 'car' ? 3.5 : 1.8)) this.pickUp(f);
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
    if (n >= 3 && !this.state.done) setTimeout(() => this.callBus(), 3500);
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
    let back = walk(bi, -1, 45);
    let dir = 1;
    if (back.acc < 25) { back = walk(bi, 1, 45); dir = -1; }
    const inPts = back.pts.slice().reverse();
    inPts.push([st.x, st.z]);
    const onward = walk(bi, dir, 14).pts;
    return { inPts, onward, bi };
  }

  callBus() {
    const g = this.g;
    if (this.bus || this.state.done) return;
    const r = this.routeNear(g.player.x, g.player.z);
    if (!r) return;
    const bus = makeSixBus();
    g.scene.add(bus);
    this.bus = { m: bus, route: r.inPts, s: 0, phase: 'aanrijden', t: 0, onward: r.onward, speed: 9 };
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
    g.extraInteract = null;
    b.phase = 'hoekje'; b.s = 0;
    b.route = [[b.m.position.x, b.m.position.z], ...b.onward];
    b.speed = 4;
    g.setMode?.('walk'); // eerst: setMode maakt je poppetje weer zichtbaar
    g.player.lockedFor = true;
    g.player.speed = 0;
    g.player.group.visible = false;
    g.sfx?.play('door');
    // camera aan de overkant van de straat, kijkt naar de bus
    const followCam = () => {
      if (!this.bus || this.bus.phase === 'klaar') return;
      const m = this.bus.m;
      const side = new THREE.Vector3(-7, 2.6, 2.5).applyEuler(m.rotation).add(m.position);
      g.pov = { pos: side, look: m.position.clone().add(new THREE.Vector3(0, 1.3, 0)) };
      requestAnimationFrame(followCam);
    };
    followCam();
  }

  unboard() {
    const g = this.g, b = this.bus;
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
    g.camYaw = g.player.heading + Math.PI;
    g.updateCamera(0, true);
    g.sfx?.play('door');
    g.ui.toast('Vijf seconden. Een persoonlijk record. Alles netjes betaald met korting.', 3600);
    this.state.done = true;
    save(this.state);
    // en weg is de bus
    setTimeout(() => {
      if (!this.bus) return;
      const r = this.routeNear(this.bus.m.position.x, this.bus.m.position.z);
      this.bus.route = [[this.bus.m.position.x, this.bus.m.position.z], ...(r ? r.onward.slice(1).concat(this.extend(r)) : [[this.bus.m.position.x + 40, this.bus.m.position.z]])];
      this.bus.s = 0; this.bus.speed = 11; this.bus.phase = 'wegrijden';
      g.sfx?.play('honk');
    }, 1200);
  }

  // een stuk verder weg over dezelfde straat, zodat de bus uit beeld rijdt
  extend(r) {
    const last = r.onward.at(-1), prev = r.onward.at(-2) || [last[0] - 1, last[1]];
    const dx = last[0] - prev[0], dz = last[1] - prev[1], l = Math.hypot(dx, dz) || 1;
    return [[last[0] + (dx / l) * 50, last[1] + (dz / l) * 50]];
  }
}
