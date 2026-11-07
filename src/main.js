import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { World } from './world.js';
import { Input } from './input.js';
import { UI, Minimap, BigMap } from './ui.js';
import { makeCharacter, makeBike, makeSkateboard } from './character.js';
import { Missions } from './missions.js';
import { Vehicles } from './vehicles.js';
import { Facades } from './facades.js';
import { Pedestrians } from './pedestrians.js';

const isMobile = matchMedia('(pointer: coarse)').matches || innerWidth < 800;
const HIGH = !isMobile;

const SPEED = { walk: 4.0, run: 6.5, bike: 12.5, skate: 9.5, keg: 2.8 };

class Game {
  constructor() {
    this.canvas = document.getElementById('scene');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.55;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.3, 9000);
    this.clock = new THREE.Clock();

    this.input = new Input(this.canvas);
    this.ui = new UI(this.input);
    this.npcs = [];
    this.collectibles = [];
    this.vehicles = { bike: false, skate: false };
    this.mode = 'walk';
    this.timeOfDay = 11;
    this.wobble = 0;
    this.shake = 0;
    this.time = 0;

    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
      this.composer?.setSize(innerWidth, innerHeight);
      if (this.bigmap?.open) { this.bigmap.resize(); this.bigmap.draw(); }
    });
  }

  async init() {
    const bar = document.getElementById('loading-bar');
    const txt = document.getElementById('loading-text');
    this.world = new World(this.scene, (p, t) => { bar.style.width = `${Math.round(p * 90)}%`; txt.textContent = t; });
    await this.world.load(isMobile);

    txt.textContent = 'Auto\'s parkeren en gevels schilderen...';
    this.setupSky();
    this.setupPlayer();
    this.facades = new Facades(this);
    this.facades.build();
    this.cars = new Vehicles(this);
    this.farm = this.findFarm();
    this.cars.spawnParked(this.farm ? [{ type: 'tractor', x: this.farm.tx, z: this.farm.tz, heading: this.farm.heading, paint: 0xb71c1c, opts: { isTractor: true } }] : []);
    this.tractor = this.cars.cars.find((c) => c.isTractor);
    this.fishing = this.findFishingSpot();
    this.cars.spawnTraffic(isMobile ? 6 : 11);
    this.peds = new Pedestrians(this, isMobile ? 14 : 28);
    this.setupPoiLabels();
    this.minimap = new Minimap(this.world);
    this.bigmap = new BigMap(this);
    this.missions = new Missions(this);
    this.missions.setup();
    this.setupPost();

    bar.style.width = '100%';
    txt.textContent = 'Gulpen staat klaar.';
    this.updateCamera(0, true);
    this.applyTime();
    this.renderer.compile(this.scene, this.camera);
    this.render();

    const btn = document.getElementById('start-btn');
    btn.hidden = false;
    await new Promise((r) => btn.addEventListener('click', r, { once: true }));
    document.getElementById('loading').hidden = true;
    document.getElementById('hud').hidden = false;
    this.clock.getDelta();
    this.renderer.setAnimationLoop(() => this.tick());

    await this.ui.dialog('Gulpen, zaterdag', [
      'Welkom in Gulpe! Het hele dorp ligt voor je open: loop, fiets, skate of pak een auto.',
      'Overal zijn klussen te doen. Tik op de minikaart rechtsboven om ze allemaal te zien, en kies zelf waar je begint.',
    ]);
  }

  // ------------------------------------------------------------ lucht, licht en nabewerking

  setupSky() {
    const makeSky = () => {
      const sky = new Sky();
      sky.scale.setScalar(20000);
      const u = sky.material.uniforms;
      u.turbidity.value = 4; u.rayleigh.value = 1.4; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.8;
      return sky;
    };
    this.sky = makeSky();
    this.scene.add(this.sky);
    // aparte lucht voor de omgevingsreflecties (auto's, ramen, water)
    this.envSky = makeSky();
    this.envScene = new THREE.Scene();
    this.envScene.add(this.envSky);
    this.pmrem = new THREE.PMREMGenerator(this.renderer);

    this.sun = new THREE.DirectionalLight(0xfff1dc, 3.2);
    this.sun.castShadow = true;
    const s = isMobile ? 1024 : 2048;
    this.sun.shadow.mapSize.set(s, s);
    const c = this.sun.shadow.camera;
    c.left = -60; c.right = 60; c.top = 60; c.bottom = -60; c.near = 1; c.far = 600;
    this.sun.shadow.bias = -0.0012;
    this.sun.shadow.normalBias = 0.5;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x5c5a3a, 0.7);
    this.scene.add(this.hemi);
    this.scene.fog = new THREE.Fog(0xc9d8e6, 450, 4200);

    const n = 1500, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 0.95);
      pos[i * 3] = Math.sin(ph) * Math.cos(th) * 7000;
      pos[i * 3 + 1] = Math.cos(ph) * 7000;
      pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * 7000;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false }));
    this.scene.add(this.stars);
  }

  setupPost() {
    if (!HIGH) return;
    const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.25, 0.6, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  render() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  applyTime() {
    const t = this.timeOfDay;
    const dayAngle = ((t - 6) / 12) * Math.PI;
    const elev = Math.sin(dayAngle) * 52;
    const az = 100 + ((t - 6) / 12) * 160;
    const phi = THREE.MathUtils.degToRad(90 - Math.max(elev, -10));
    const theta = THREE.MathUtils.degToRad(az);
    const sunDir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
    this.sunDir = sunDir;
    this.sky.material.uniforms.sunPosition.value.copy(sunDir);
    this.envSky.material.uniforms.sunPosition.value.copy(sunDir);

    const day = THREE.MathUtils.smoothstep(elev, -6, 12);
    const night = 1 - day;
    this.night = night;
    const lightsOn = THREE.MathUtils.smoothstep(night, 0.4, 1);
    this.world.setNight(lightsOn);
    this.facades?.setNight(lightsOn);
    this.cars?.setNight(lightsOn);
    this.stars.material.opacity = THREE.MathUtils.smoothstep(night, 0.6, 1);

    const dusk = THREE.MathUtils.smoothstep(elev, -4, 6) * (1 - THREE.MathUtils.smoothstep(elev, 6, 22));
    this.sun.intensity = 3.0 * day + 0.6 * night;
    this.sun.color.setRGB(1, 0.95 - dusk * 0.3, 0.86 - dusk * 0.45);
    if (night > 0.5) this.sun.color.setRGB(0.55, 0.65, 1);
    this.hemi.intensity = 0.7 * day + 0.45 * night;
    this.hemi.color.setRGB(0.75 * day + 0.25 * night, 0.85 * day + 0.3 * night, 1 * day + 0.55 * night);
    this.renderer.toneMappingExposure = 0.55 * day + 0.9 * night;
    if (this.bloom) { this.bloom.strength = 0.18 + night * 0.55; this.bloom.threshold = 0.92 - night * 0.3; }

    const fogDay = new THREE.Color(0xc9d8e6).lerp(new THREE.Color(0xe8b98a), dusk * 0.6);
    this.scene.fog.color.copy(fogDay.lerp(new THREE.Color(0x0b1424), night));
    this.sky.visible = night < 0.97;
    this.scene.background = night >= 0.97 ? new THREE.Color(0x060b16) : null;

    // omgevingsreflecties bijwerken
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(this.envScene, 0, 1, 20000);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = 0.55 * day + 0.08 * night;
    this.missions?.refresh();
  }

  async skipTime(to) {
    await this.fade(async () => {
      this.timeOfDay = to;
      this.applyTime();
    });
  }

  async fade(mid) {
    const el = document.createElement('div');
    Object.assign(el.style, { position: 'fixed', inset: 0, background: '#000', opacity: 0, transition: 'opacity 1s', zIndex: 15, pointerEvents: 'none' });
    document.body.appendChild(el);
    await wait(30);
    el.style.opacity = 1;
    await wait(1050);
    await mid();
    await wait(300);
    el.style.opacity = 0;
    await wait(1050);
    el.remove();
  }

  // ------------------------------------------------------------ speler

  setupPlayer() {
    const model = makeCharacter({ shirt: 0xe8a33d, pants: 0x2e3f5c, hair: 0x3b2a1a });
    const start = this.world.spotNear(5, 25);
    this.player = { group: new THREE.Group(), model, x: start[0], z: start[1], y: 0, heading: Math.PI, speed: 0, boost: 0, lockedFor: false };
    this.player.group.add(model);
    this.bike = makeBike(0xff9800);
    this.board = makeSkateboard();
    this.bike.visible = false;
    this.board.visible = false;
    this.player.group.add(this.bike, this.board);
    this.scene.add(this.player.group);
    this.camYaw = 0.6;
    this.camPitch = 0.3;
    this.camDist = innerWidth < innerHeight ? 9 : 7;
    this.lastManualLook = -10;
  }

  makeBikeModel(i) {
    const cols = [0x1e88e5, 0xe53935, 0x43a047, 0x212121, 0xfdd835, 0x8e24aa, 0xeeeeee, 0x00897b];
    return makeBike(cols[i % cols.length]);
  }

  unlockVehicle(v) { this.vehicles[v] = true; this.updateVehicleButton(); }

  availableModes() {
    if (this.keg) return ['walk'];
    if (this.race) return ['skate'];
    const m = ['walk'];
    if (this.vehicles.bike) m.push('bike');
    if (this.vehicles.skate) m.push('skate');
    return m;
  }

  updateVehicleButton() {
    if (this.mode === 'car') { this.ui.setVehicleButton(null); return; }
    const options = this.availableModes();
    if (options.length <= 1) { this.ui.setVehicleButton(null); return; }
    const next = options[(options.indexOf(this.mode) + 1) % options.length];
    this.ui.setVehicleButton({ walk: 'Lopen', bike: 'Fiets', skate: 'Skate' }[next]);
  }

  setMode(mode) {
    this.mode = mode;
    this.bike.visible = mode === 'bike';
    this.board.visible = mode === 'skate';
    this.player.model.position.y = mode === 'bike' ? 0.25 : mode === 'skate' ? 0.12 : 0;
    this.player.model.position.z = mode === 'bike' ? -0.25 : 0;
    this.player.group.visible = mode !== 'car';
    document.getElementById('speedo').hidden = mode === 'walk';
    this.updateVehicleButton();
  }

  enterCar(car) {
    if (this.keg) { this.ui.toast('Met een vat in je handen? Eerst afleveren!', 2000); return; }
    this.cars.activate(car);
    this.car = car;
    car.speed = 0;
    this.setMode('car');
    this.camYaw = car.heading + Math.PI;
    if (car.isTractor) this.ui.toast('Tractor! Niet zo snel, wel overal doorheen.', 2200);
  }

  exitCar() {
    const car = this.car;
    if (!car) return;
    if (Math.abs(car.speed) > 3) { this.ui.toast('Eerst stoppen!', 1200); return; }
    const sx = Math.cos(car.heading), sz = -Math.sin(car.heading);
    for (const side of [-1, 1]) {
      const x = car.x + sx * side * 1.7, z = car.z + sz * side * 1.7;
      if (!this.world.blocked(x, z) && !this.world.insideBuilding(x, z)) {
        [this.player.x, this.player.z] = this.world.resolve(x, z, 0.4);
        break;
      }
    }
    this.player.heading = car.heading;
    this.car = null;
    this.setMode('walk');
  }

  // Een boerenerf aan de rand van het dorp: weg met aan één kant akker of weiland.
  findFarm() {
    const w = this.world;
    const cands = [];
    for (const [, ax, az, bx, bz] of w.segments) {
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      const d = Math.hypot(mx, mz);
      if (d < 380 || d > 760) continue;
      if (w.classAt(mx, mz) !== 'rijbaan') continue;
      const len = Math.hypot(bx - ax, bz - az) || 1;
      const px = -(bz - az) / len, pz = (bx - ax) / len;
      for (const side of [1, -1]) {
        const fx = mx + px * side * 12, fz = mz + pz * side * 12;
        const c = w.classAt(fx, fz);
        if ((c === 'gras' || c === 'akker') && !w.insideBuilding(fx, fz) && !w.blocked(fx, fz) && w.classAt(mx + px * side * 22, mz + pz * side * 22) === c) {
          cands.push({ d, x: mx + px * side * 6, z: mz + pz * side * 6, tx: fx, tz: fz, heading: Math.atan2(-px * side, -pz * side) });
        }
      }
    }
    cands.sort((a, b) => Math.abs(a.d - 520) - Math.abs(b.d - 520));
    return cands[0] || null;
  }

  // Plekje aan de oever van de Gulp om te vissen.
  findFishingSpot() {
    const w = this.world;
    const cls = w.ground.classes;
    const pts = [];
    for (const [c, rings] of w.ground.polys) {
      if (cls[c] !== 'water') continue;
      const r = rings[0];
      for (let i = 0; i < r.length; i += 2) {
        const d = Math.hypot(r[i], r[i + 1]);
        if (d > 70 && d < 380) pts.push([r[i], r[i + 1], d]);
      }
    }
    pts.sort((a, b) => Math.abs(a[2] - 180) - Math.abs(b[2] - 180));
    for (const [x, z] of pts) {
      for (let a = 0; a < 16; a++) {
        const dx = Math.cos((a / 16) * Math.PI * 2), dz = Math.sin((a / 16) * Math.PI * 2);
        const sx = x + dx * 2.5, sz = z + dz * 2.5, wx = x - dx * 1.8, wz = z - dz * 1.8;
        if (!w.blocked(sx, sz) && !w.insideBuilding(sx, sz) && w.blocked(wx, wz) && w.classAt(sx, sz) !== 'rijbaan') {
          return { x: sx, z: sz, wx, wz };
        }
      }
    }
    return null;
  }

  carryKeg(keg) {
    if (this.mode === 'car') this.exitCar();
    this.keg = keg;
    keg.position.set(0, 1.25, 0.42);
    keg.rotation.x = 0.2;
    this.player.group.add(keg);
    this.setMode('walk');
  }

  dropKeg() {
    if (!this.keg) return;
    this.player.group.remove(this.keg);
    this.keg = null;
    this.updateVehicleButton();
  }

  // ------------------------------------------------------------ NPC's, labels, markeringen

  addNpc(name, [x, z], model) {
    const group = new THREE.Group();
    group.add(model);
    group.position.set(x, this.world.groundAt(x, z), z);
    this.scene.add(group);
    const label = makeLabel(name, { small: true });
    label.position.set(0, 2.55, 0);
    group.add(label);
    // gele missiemarkering boven het hoofd
    const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), new THREE.MeshStandardMaterial({ color: 0xf2c14e, emissive: 0xe8a33d, emissiveIntensity: 0.9 }));
    marker.position.set(0, 3.2, 0);
    marker.scale.y = 1.5;
    group.add(marker);
    const npc = { name, group, model, marker, pos: group.position, x, z, active: false, enabled: true, heading: 0, lookAtPlayer: false };
    this.npcs.push(npc);
    return npc;
  }

  setupPoiLabels() {
    for (const p of this.world.meta.pois) {
      if (p.id === 'ringweg') continue;
      const label = makeLabel(p.name);
      const [x, z] = p.pos;
      label.position.set(x, this.world.heightAt(x, z) + (p.id === 'mariabeeld' ? 14 : 11), z);
      this.scene.add(label);
    }
  }

  // alles wat op de (grote) kaart staat
  mapItems() {
    const items = [];
    const colors = { open: '#f2c14e', klaar: '#7cc576', actief: '#ff6b5a' };
    const labels = { open: 'Open', klaar: 'Gedaan', actief: 'Bezig' };
    const night = this.night > 0.5;
    this.missions.list().forEach((m) => {
      if (m.nightOnly && !night && m.state !== 'actief') {
        items.push({ key: m.id, x: m.npc.pos.x, z: m.npc.pos.z, title: m.title, place: m.place, color: '#9aa4b0', glyph: 'z', state: '', stateLabel: 'Alleen \'s avonds' });
        return;
      }
      items.push({ key: m.id, x: m.npc.pos.x, z: m.npc.pos.z, title: m.title, place: m.place, color: colors[m.state], glyph: m.state === 'klaar' ? '✓' : '!', state: m.state, stateLabel: labels[m.state] });
    });
    if (this.tractor) items.push({ key: 'tractor', x: this.tractor.x, z: this.tractor.z, title: 'Tractor', place: 'Op het boerenland', color: '#64b5f6', glyph: 'T', state: '', stateLabel: 'Voertuig' });
    return items;
  }

  updateMarkers() {
    if (!this.minimap) return;
    this.minimap.markers = this.mapItems().filter((i) => i.state !== '' || i.key === 'tractor');
    for (const m of this.missions.list()) {
      const night = this.night > 0.5;
      m.npc.marker.visible = m.state === 'open' && (!m.nightOnly || night) && !this.missions.active;
    }
    if (this.bigmap?.open) { this.bigmap.renderList(); this.bigmap.draw(); }
  }

  makeBeam(x, z, color = 0xe8a33d) {
    const geo = new THREE.CylinderGeometry(0.9, 0.9, 140, 16, 1, true);
    geo.translate(0, 70, 0);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, this.world.heightAt(x, z), z);
    this.scene.add(m);
    return m;
  }

  setTarget(t) {
    if (this.targetBeam) { this.scene.remove(this.targetBeam); this.targetBeam = null; }
    this.target = t;
    if (t) this.targetBeam = this.makeBeam(t.pos.x, t.pos.z);
  }

  setWaypoint(it) {
    if (this.waypointBeam) this.scene.remove(this.waypointBeam);
    this.waypoint = { x: it.x, z: it.z };
    this.waypointBeam = this.makeBeam(it.x, it.z, 0x64b5f6);
    this.ui.toast(`Route naar ${it.title}`, 1600);
  }

  // willekeurig adres (deur van een huis) op afstand van de speler
  randomAddress(minD, maxD) {
    const w = this.world;
    for (let i = 0; i < 300; i++) {
      const f = w.footprints[Math.floor(Math.random() * w.footprints.length)];
      if (f.extra) continue;
      const cx = (f.minX + f.maxX) / 2, cz = (f.minZ + f.maxZ) / 2;
      const d = Math.hypot(cx - this.player.x, cz - this.player.z);
      if (d < minD || d > maxD) continue;
      const s = w.nearestStreet(cx, cz);
      if (!s || s.dist > 30) continue;
      const spot = w.spotNear(cx, cz);
      if (w.blocked(...spot)) continue;
      return spot;
    }
    return w.spotNear(100, 100);
  }

  // opts.require(): foutmelding als je nog niet mag aankomen (bijv. niet op de fiets)
  // opts.violate(): foutmelding als je de regels breekt, dan mislukt de klus meteen
  setDestination([x, z], limit, onArrive, onFail, opts = {}) {
    this.clearDestination();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.15, 8, 32), new THREE.MeshBasicMaterial({ color: 0xf2c14e }));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, this.world.groundAt(x, z) + 0.3, z);
    this.scene.add(ring);
    this.destination = { x, z, left: limit, onArrive, onFail, ring, opts };
    this.setTarget({ pos: new THREE.Vector3(x, 0, z) });
  }

  clearDestination() {
    if (!this.destination) return;
    this.scene.remove(this.destination.ring);
    this.destination = null;
    this.ui.timer(null);
    this.setTarget(null);
  }

  updateDestination(dt) {
    const d = this.destination;
    if (!d) return;
    d.left -= dt;
    this.ui.timer(Math.max(0, d.left).toFixed(0) + ' s');
    d.ring.rotation.z += dt;
    const bad = d.opts.violate?.();
    if (bad) {
      const cb = d.onFail;
      this.clearDestination();
      cb(bad);
      return;
    }
    if (Math.hypot(this.player.x - d.x, this.player.z - d.z) < 5) {
      const no = d.opts.require?.();
      if (no) { if (!d.warned) { this.ui.toast(no, 1800); d.warned = true; } return; }
      const cb = d.onArrive;
      this.clearDestination();
      cb();
    } else if (d.left <= 0) {
      const cb = d.onFail;
      this.clearDestination();
      cb();
    }
  }

  // ------------------------------------------------------------ minigames

  async startRace(path, rival, onDone) {
    if (!path || path.length < 2) return;
    if (this.mode === 'car') this.exitCar();
    const pts = [path[0]];
    let acc = 0;
    for (let i = 1; i < path.length; i++) {
      acc += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
      if (acc >= 45 || i === path.length - 1) { pts.push(path[i]); acc = 0; }
    }
    const total = path.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - path[i - 1][0], p[1] - path[i - 1][1]) : 0), 0);
    const limit = Math.max(25, Math.round(total / 7.2));
    const [sx, sz] = this.world.resolve(pts[0][0], pts[0][1], 0.5);
    this.player.x = sx; this.player.z = sz;
    this.player.heading = Math.atan2(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
    this.camYaw = this.player.heading + Math.PI;
    rival.home = rival.pos.clone();
    this.race = { pts, idx: 1, time: 0, limit, rival, path, total, rivalDist: 0, done: false, markers: [], onDone };
    this.setMode('skate');
    this.setTarget(null);
    const ringGeo = new THREE.TorusGeometry(3.2, 0.25, 8, 32);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0xe8a33d, emissive: 0xe8a33d, emissiveIntensity: 0.8 });
    this.race.markers = pts.slice(1).map(([x, z], i) => {
      const m = new THREE.Mesh(ringGeo, ringMat);
      const next = pts[Math.min(i + 2, pts.length - 1)];
      m.position.set(x, this.world.groundAt(x, z) + 3, z);
      m.rotation.y = Math.atan2(next[0] - x, next[1] - z);
      m.visible = i < 2;
      this.scene.add(m);
      return m;
    });
    this.player.lockedFor = true;
    for (const c of ['3', '2', '1']) { this.ui.toast(c, 700); await wait(800); }
    this.ui.toast('GO!', 800);
    this.player.lockedFor = false;
    this.race.started = true;
    this.missions.progress(`Checkpoint 0 / ${pts.length - 1}`);
  }

  updateRace(dt) {
    const r = this.race;
    if (!r || !r.started || r.done) return;
    r.time += dt;
    this.ui.timer((r.limit - r.time).toFixed(1));
    r.rivalDist += dt * (r.total / (r.limit * 1.04));
    const rp = pointAlong(r.path, r.rivalDist);
    if (rp) {
      r.rival.pos.set(rp.x, this.world.groundAt(rp.x, rp.z), rp.z);
      r.rival.heading = rp.heading;
      r.rival.mode = 'skate';
    }
    const [cx, cz] = r.pts[r.idx];
    if (Math.hypot(this.player.x - cx, this.player.z - cz) < 6) {
      r.markers[r.idx - 1].visible = false;
      r.idx++;
      if (r.markers[r.idx]) r.markers[r.idx].visible = true;
      this.missions.progress(`Checkpoint ${r.idx - 1} / ${r.pts.length - 1}`);
      if (r.idx >= r.pts.length) return this.endRace(true);
    }
    if (r.time >= r.limit) this.endRace(false);
  }

  endRace(won, silent = false) {
    const r = this.race;
    if (!r) return;
    r.done = true;
    r.markers.forEach((m) => this.scene.remove(m));
    r.rival.mode = null;
    if (r.rival.home) r.rival.pos.copy(r.rival.home);
    this.ui.timer(null);
    this.race = null;
    this.updateVehicleButton();
    if (!silent) r.onDone(won);
  }

  // Penalty's nemen bij FC Gulpen. Geeft het aantal goals terug.
  startPenalty() {
    return new Promise((resolve) => {
      const f = this.facades;
      if (!f.pitch) { resolve(0); return; }
      if (this.mode === 'car') this.exitCar();
      this.setMode('walk');
      const { L } = f.pitch;
      const goalZ = L / 2;
      const [spotX, spotZ] = f.pitchToWorld(0, goalZ - 11);
      const [gx, gz] = f.pitchToWorld(0, goalZ);
      const dirX = gx - spotX, dirZ = gz - spotZ;
      const heading = Math.atan2(dirX, dirZ);
      const right = [Math.cos(heading), -Math.sin(heading)];
      const toWorld = (lateral, along) => [spotX + Math.sin(heading) * along + right[0] * -lateral, spotZ + Math.cos(heading) * along + right[1] * -lateral];
      const baseY = this.world.heightAt(gx, gz);

      const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, flatShading: true }));
      ball.castShadow = true;
      this.scene.add(ball);
      const keeper = makeCharacter({ shirt: 0x43a047, pants: 0x111111, hair: 0x222222 });
      this.scene.add(keeper);
      const aim = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.26, 24), new THREE.MeshBasicMaterial({ color: 0xff5252, side: THREE.DoubleSide, depthTest: false }));
      aim.renderOrder = 20;
      this.scene.add(aim);

      let shots = 0, goals = 0, phase = 'aim', t = 0, shot = null;
      const reset = () => {
        const [bx, bz] = toWorld(0, 0);
        ball.position.set(bx, this.world.heightAt(bx, bz) + 0.11, bz);
        const [kx, kz] = toWorld(0, 10.6);
        keeper.position.set(kx, baseY, kz);
        keeper.rotation.set(0, heading + Math.PI, 0);
        const [px, pz] = toWorld(0, -1.4);
        this.player.x = px; this.player.z = pz; this.player.heading = heading;
        this.camYaw = heading + Math.PI;
        this.camPitch = 0.12;
        phase = 'aim';
        t = Math.random() * 3;
        aim.visible = true;
      };
      reset();
      this.ui.setActionLabel('Schiet');
      this.penalty = {
        stop: () => {
          this.scene.remove(ball, keeper, aim);
          this.penalty = null;
          this.player.lockedFor = false;
        },
        update: (dt) => {
          t += dt;
          this.player.lockedFor = true;
          if (phase === 'aim') {
            const ax = Math.sin(t * 1.9) * 3.5;
            const ay = 0.25 + (Math.sin(t * 2.7 + 1) * 0.5 + 0.5) * 2.05;
            const [wx, wz] = toWorld(ax, 11);
            aim.position.set(wx, baseY + ay, wz);
            aim.lookAt(this.camera.position);
            keeper.userData.animate(dt, 0, 'idle');
            if (this.input.consumeAction() || this.input.spacePressed) {
              this.input.spacePressed = false;
              const dive = [-2.6, -1.2, 0, 1.2, 2.6][Math.floor(Math.random() * 5)];
              shot = { ax, ay, dive, t: 0 };
              phase = 'fly';
              aim.visible = false;
              this.player.speed = 3;
            }
          } else if (phase === 'fly') {
            shot.t += dt / 0.6;
            const k = Math.min(1, shot.t);
            const [sx2, sz2] = toWorld(0, 0);
            const [ex, ez] = toWorld(shot.ax, 11);
            ball.position.set(sx2 + (ex - sx2) * k, this.world.heightAt(sx2, sz2) + 0.11 + (baseY + shot.ay - this.world.heightAt(sx2, sz2) - 0.11) * k + Math.sin(k * Math.PI) * 0.4, sz2 + (ez - sz2) * k);
            const kd = Math.min(1, shot.t * 1.6);
            const [kx, kz] = toWorld(shot.dive * kd, 10.6);
            keeper.position.set(kx, baseY + Math.sin(kd * Math.PI) * 0.35, kz);
            keeper.rotation.z = -Math.sign(shot.dive) * kd * 1.2;
            if (k >= 1) {
              shots++;
              const reach = Math.abs(shot.ax - shot.dive) < 1.25 && shot.ay < 2.1;
              const post = Math.abs(shot.ax) > 3.45;
              if (post) this.ui.toast('Paal!', 1200);
              else if (reach) this.ui.toast('Gestopt!', 1200);
              else { goals++; this.ui.toast('GOAL!', 1200); }
              this.missions.progress(`${goals} goals uit ${shots} van de 5`);
              phase = 'wait'; t = 0;
            }
          } else if (phase === 'wait' && t > 1.4) {
            keeper.rotation.z = 0;
            if (shots >= 5) {
              this.penalty.stop();
              resolve(goals);
            } else reset();
          }
        },
      };
    });
  }

  // Vissen in de Gulp: tik op het juiste moment als de dobber onder gaat.
  startFishing() {
    return new Promise((resolve) => {
      const f = this.fishing;
      if (!f) { resolve(0); return; }
      if (this.mode === 'car') this.exitCar();
      this.setMode('walk');
      const w = this.world;
      this.player.x = f.x; this.player.z = f.z;
      this.player.heading = Math.atan2(f.wx - f.x, f.wz - f.z);
      this.camYaw = this.player.heading + Math.PI + 0.5;
      this.camPitch = 0.3;
      const wy = w.heightAt(f.wx, f.wz) + 0.1;
      const bob = new THREE.Group();
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe53935, emissive: 0x5a0000 }));
      const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffffff }));
      bob.add(top, bottom);
      bob.position.set(f.wx, wy, f.wz);
      this.scene.add(bob);
      const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xdddddd }));
      this.scene.add(line);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.025, 2.4, 6), new THREE.MeshStandardMaterial({ color: 0x3e2723 }));
      rod.position.set(0.3, 1.5, 0.9);
      rod.rotation.x = 1.0;
      this.player.group.add(rod);
      let phase = 'wait', t = 0, wait = 1.5 + Math.random() * 3, caught = 0, tries = 0;
      const fishNames = ['Een mooie vis!', 'Wat een joekel!', 'Een kleintje, maar telt!', 'Beet!'];
      this.ui.setActionLabel('Haal op');
      const finish = () => {
        this.scene.remove(bob, line);
        this.player.group.remove(rod);
        this.minigame = null;
        this.player.lockedFor = false;
        resolve(caught);
      };
      this.minigame = {
        get phase() { return phase; },
        stop: finish,
        update: (dt) => {
          t += dt;
          this.player.lockedFor = true;
          const tip = new THREE.Vector3(0.3, 2.5, 1.9).applyMatrix4(this.player.group.matrixWorld);
          const pos = line.geometry.attributes.position;
          pos.setXYZ(0, tip.x, tip.y, tip.z);
          pos.setXYZ(1, bob.position.x, bob.position.y + 0.05, bob.position.z);
          pos.needsUpdate = true;
          const pressed = this.input.consumeAction() || this.input.spacePressed;
          this.input.spacePressed = false;
          if (phase === 'wait') {
            bob.position.y = wy + Math.sin(t * 2.2) * 0.015;
            if (pressed) { tries++; this.ui.toast('Te vroeg! De vis schrok weg.', 1400); t = 0; wait = 2 + Math.random() * 3; }
            else if (t > wait) { phase = 'bite'; t = 0; }
          } else if (phase === 'bite') {
            bob.position.y = wy - 0.13 + Math.sin(t * 30) * 0.02;
            if (pressed) {
              caught++; tries++;
              this.ui.toast(fishNames[Math.floor(Math.random() * fishNames.length)], 1500);
              this.missions.progress(`${caught} / 3 vissen`);
              phase = 'pause'; t = 0;
            } else if (t > 0.9) { tries++; this.ui.toast('Te laat, hij is weg.', 1400); phase = 'pause'; t = 0; }
          } else if (phase === 'pause' && t > 1.2) {
            if (caught >= 3 || tries >= 8) finish();
            else { phase = 'wait'; t = 0; wait = 1.5 + Math.random() * 3.5; }
          }
        },
      };
    });
  }

  // Polonaise: feestgangers verzamelen die achter je aan lopen.
  startPolonaise(n) {
    const w = this.world;
    const colors = [0xe53935, 0xfdd835, 0x43a047, 0x1e88e5, 0x8e24aa, 0xff7043, 0x00acc1];
    this.followers = [];
    this.tempMarkers = [];
    for (let i = 0; i < n; i++) {
      const [x, z] = this.randomAddress(50, 260);
      const model = makeCharacter({ shirt: colors[i % colors.length], pants: colors[(i + 3) % colors.length], hair: 0x3b2a1a, hat: i % 2 ? 'cap' : 'chef', hatColor: colors[(i + 1) % colors.length] });
      model.position.set(x, w.groundAt(x, z), z);
      this.scene.add(model);
      const m = { x, z, color: '#ff4fa3', glyph: '+', done: false };
      this.tempMarkers.push(m);
      this.followers.push({ model, x, z, heading: 0, joined: false, marker: m });
    }
  }

  followersJoined() { return (this.followers || []).filter((f) => f.joined).length; }

  stopPolonaise() {
    (this.followers || []).forEach((f) => this.scene.remove(f.model));
    this.followers = [];
    this.tempMarkers = [];
  }

  updateFollowers(dt) {
    if (!this.followers?.length) return;
    const p = this.player;
    let leader = { x: p.x, z: p.z };
    for (const f of this.followers) {
      if (!f.joined) {
        f.model.userData.animate(dt, 0, 'wave');
        if (this.mode === 'walk' && Math.hypot(p.x - f.x, p.z - f.z) < 2.6) {
          f.joined = true;
          f.marker.done = true;
          this.ui.toast(['Alaaf!', 'Ik doe mee!', 'Polonaise!', 'Hup, achter je aan!'][Math.floor(Math.random() * 4)], 1200);
          this.missions.progress(`${this.followersJoined()} / ${this.followers.length} feestgangers`);
        }
        continue;
      }
    }
    // de rij volgt de speler, elk achter de vorige
    for (const f of this.followers.filter((q) => q.joined)) {
      const dx = leader.x - f.x, dz = leader.z - f.z;
      const d = Math.hypot(dx, dz);
      let speed = 0;
      if (d > 1.3 && this.mode === 'walk') {
        const step = Math.min(d - 1.3, 7 * dt);
        f.x += (dx / d) * step; f.z += (dz / d) * step;
        speed = step / dt;
        f.heading = Math.atan2(dx, dz);
      }
      f.model.position.set(f.x, this.world.groundAt(f.x, f.z), f.z);
      f.model.rotation.y = f.heading;
      f.model.userData.animate(dt, speed, 'walk');
      // handen op de schouders van de voorganger
      f.model.userData.parts.armL.rotation.x = -1.3; f.model.userData.parts.armR.rotation.x = -1.3;
      leader = f;
    }
  }

  async drinkPils() {
    this.player.lockedFor = true;
    this.player.pose = 'drink';
    await wait(1800);
    this.player.pose = null;
    this.wobble = 25;
  }

  // ------------------------------------------------------------ hoofdlus

  tick() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.time += dt;
    this.input.update();
    if (this.bigmap.open) { this.render(); return; }
    if (this.mode === 'car') this.updateCar(dt);
    else this.updatePlayer(dt);
    this.penalty?.update(dt);
    this.minigame?.update(dt);
    this.updateFollowers(dt);
    this.updateNpcs(dt);
    this.cars.updateTraffic(dt, this.mode === 'car' ? this.car : this.player);
    this.peds.update(dt, this.player, this.mode === 'car' ? Math.abs(this.car.speed) : this.player.speed);
    this.updateRace(dt);
    this.updateDestination(dt);
    this.updateInteractions(dt);
    this.world.hardscape.update(dt);
    this.updateCamera(dt);
    this.updateHud(dt);
    this.render();
  }

  updateCar(dt) {
    const car = this.car, inp = this.input;
    const busy = this.ui.dialogOpen;
    const throttle = busy ? 0 : -inp.move.y;
    const steer = busy ? 0 : inp.move.x;
    this.cars.drive(car, dt, throttle, steer, inp.keys.has('Space'));
    const p = this.player;
    p.x = car.x; p.z = car.z; p.y = car.y; p.heading = car.heading; p.speed = Math.abs(car.speed);
    document.getElementById('speed-value').textContent = Math.round(Math.abs(car.speed) * 3.6);
  }

  updatePlayer(dt) {
    const p = this.player, inp = this.input;
    const busy = this.ui.dialogOpen || p.lockedFor;
    if (inp.consumeVehicle() && !busy) {
      const opts = this.availableModes();
      if (opts.length > 1) this.setMode(opts[(opts.indexOf(this.mode) + 1) % opts.length]);
    }
    const mx = busy ? 0 : inp.move.x, my = busy ? 0 : inp.move.y;
    const fwdX = -Math.sin(this.camYaw), fwdZ = -Math.cos(this.camYaw);
    const rightX = Math.cos(this.camYaw), rightZ = -Math.sin(this.camYaw);
    const dx = fwdX * -my + rightX * mx, dz = fwdZ * -my + rightZ * mx;
    const mag = Math.hypot(dx, dz);

    if (p.boost > 0) p.boost -= dt;
    let maxSpeed = SPEED[this.mode];
    if (this.mode === 'walk' && (inp.sprint || p.boost > 0)) maxSpeed = SPEED.run;
    if (this.keg) maxSpeed = SPEED.keg;
    // op de fiets en het skateboard gaat de joystick niet half: altijd volle snelheid
    const want = mag > 0.05 ? maxSpeed * (this.mode === 'walk' ? Math.min(1, mag * 1.2) : 1) : 0;
    const accel = this.mode === 'walk' ? 12 : this.mode === 'bike' ? 4 : 3.5;
    const decel = this.mode === 'walk' ? 14 : 3;
    p.speed += (want - p.speed) * Math.min(1, (want > p.speed ? accel : decel) * dt);
    if (mag > 0.05) {
      let diff = Math.atan2(dx, dz) - p.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      p.heading += diff * Math.min(1, (this.mode === 'walk' ? 12 : 5) * dt);
    }
    const here = this.world.heightAt(p.x, p.z);
    const ahead = this.world.heightAt(p.x + Math.sin(p.heading) * 1.5, p.z + Math.cos(p.heading) * 1.5);
    const slope = (ahead - here) / 1.5;
    const slopeFactor = THREE.MathUtils.clamp(1 - slope * (this.mode === 'walk' ? 1.2 : 2.2), 0.5, 1.35);
    const step = p.speed * slopeFactor * dt;
    let nx = p.x + Math.sin(p.heading) * step, nz = p.z + Math.cos(p.heading) * step;
    // water: niet doorheen, langs de rand glijden
    if (this.world.blocked(nx, nz)) {
      if (!this.world.blocked(nx, p.z)) nz = p.z;
      else if (!this.world.blocked(p.x, nz)) nx = p.x;
      else { nx = p.x; nz = p.z; p.speed *= 0.5; }
    }
    const [rx, rz] = this.world.resolve(nx, nz, this.mode === 'bike' ? 0.55 : 0.4);
    const wanted = Math.hypot(nx - p.x, nz - p.z), got = Math.hypot(rx - p.x, rz - p.z);
    if (wanted > 0.001 && got < wanted * 0.5 && this.mode !== 'walk') p.speed *= 0.85;
    // niet door geparkeerde auto's
    let fx = rx, fz = rz;
    for (const c of this.cars.cars) {
      const d = Math.hypot(c.x - fx, c.z - fz);
      if (d < 1.6 && d > 0.01) { fx = c.x + ((fx - c.x) / d) * 1.6; fz = c.z + ((fz - c.z) / d) * 1.6; }
    }
    p.x = fx; p.z = fz;
    p.y = this.world.groundAt(p.x, p.z);
    p.group.position.set(p.x, p.y, p.z);
    p.group.rotation.y = p.heading;
    p.model.userData.animate(dt, p.speed, p.pose || (this.mode === 'walk' ? 'walk' : this.mode));
    if (this.mode !== 'walk') document.getElementById('speed-value').textContent = Math.round(p.speed * 3.6);
  }

  updateNpcs(dt) {
    const p = this.player;
    for (const n of this.npcs) {
      if (!n.group.visible) continue;
      if (n.marker.visible) { n.marker.rotation.y += dt * 2; n.marker.position.y = 3.2 + Math.sin(this.time * 2.5) * 0.12; }
      const d = Math.hypot(p.x - n.pos.x, p.z - n.pos.z);
      if (d > 120) continue;
      if (n.mode === 'skate') {
        n.group.rotation.y = n.heading;
        n.model.userData.animate(dt, 6, 'skate');
        continue;
      }
      if (d < 9 || n.lookAtPlayer) {
        let diff = Math.atan2(p.x - n.pos.x, p.z - n.pos.z) - n.heading;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        n.heading += diff * Math.min(1, 5 * dt);
      }
      n.group.rotation.y = n.heading;
      n.model.userData.animate(dt, 0, n.marker.visible && d < 14 && d > 3 ? 'wave' : 'idle');
    }
  }

  updateInteractions(dt) {
    const p = this.player;
    for (const c of this.collectibles) {
      c.mesh.rotation.y += dt * 2.5;
      if (Math.hypot(p.x - c.pos.x, p.z - c.pos.z) < (this.mode === 'car' ? 3.5 : 2.2)) { c.onCollect(); break; }
    }
    if (this.waypoint && Math.hypot(p.x - this.waypoint.x, p.z - this.waypoint.z) < 10) {
      this.scene.remove(this.waypointBeam);
      this.waypoint = null;
      this.ui.toast('Je bent er!', 1200);
    }
    if (this.ui.dialogOpen || p.lockedFor || this.race || this.penalty || this.minigame) { if (!this.penalty && !this.minigame) this.ui.prompt(null); return; }

    if (this.mode === 'car') {
      this.ui.prompt(Math.abs(this.car.speed) < 3 ? 'Uitstappen' : null);
      this.ui.setActionLabel('Uit');
      if (this.input.consumeAction()) this.exitCar();
      return;
    }
    let near = null, nd = 4;
    for (const n of this.npcs) {
      if (!n.active || !n.enabled || !n.group.visible) continue;
      const d = Math.hypot(p.x - n.pos.x, p.z - n.pos.z);
      if (d < nd) { near = n; nd = d; }
    }
    const car = !near ? this.cars.nearestCar(p.x, p.z, 1.8) : null;
    if (near) {
      this.ui.prompt(`Praat met ${near.name.toLowerCase().startsWith('de ') ? near.name.toLowerCase() : near.name}`);
      this.ui.setActionLabel('Praat');
    } else if (car) {
      this.ui.prompt(car.isTractor ? 'Instappen in de tractor' : 'Instappen');
      this.ui.setActionLabel('Auto');
    } else {
      this.ui.prompt(null);
      this.ui.setActionLabel('...');
    }
    if (this.input.consumeAction()) {
      if (near) { p.speed = 0; this.missions.talk(near); }
      else if (car) this.enterCar(car);
    }
  }

  updateCamera(dt, instant = false) {
    const p = this.player;
    const look = this.input.consumeLook();
    if (look.x || look.y) {
      this.camYaw -= look.x * 0.006;
      this.camPitch = THREE.MathUtils.clamp(this.camPitch + look.y * 0.004, -0.1, 1.2);
      this.lastManualLook = this.time;
    }
    if (this.input.zoom) {
      this.camDist = THREE.MathUtils.clamp(this.camDist + this.input.zoom * 0.8, 3.5, 30);
      this.input.zoom = 0;
    }
    const inCar = this.mode === 'car';
    const followRate = inCar ? 3.5 : this.mode === 'walk' ? 1.2 : 2.4;
    if (!instant && p.speed > 1 && this.time - this.lastManualLook > (inCar ? 0.8 : 1.5) && !this.penalty) {
      const behind = p.heading + Math.PI;
      let diff = behind - this.camYaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.camYaw += diff * Math.min(1, dt * followRate);
    }
    const dist = inCar ? this.camDist + 3.5 + Math.min(4, p.speed * 0.12) : this.camDist + (this.mode !== 'walk' ? 1.5 : 0);
    const pitch = inCar ? Math.max(0.12, this.camPitch * 0.7) : this.camPitch;
    const cx = p.x + Math.sin(this.camYaw) * Math.cos(pitch) * dist;
    const cz = p.z + Math.cos(this.camYaw) * Math.cos(pitch) * dist;
    let cy = p.y + (inCar ? 2.2 : 1.7) + Math.sin(pitch) * dist;
    cy = Math.max(cy, this.world.groundAt(cx, cz) + 0.6);
    // camera niet achter een muur: dichterbij komen als er een gebouw tussen zit
    const hy = p.y + 1.6;
    const occ = this.world.occlusion(p.x, hy, p.z, cx, cy, cz);
    let tx = cx, ty = cy, tz = cz;
    if (occ < 1) {
      const k = Math.max(inCar ? 0.45 : 0.15, occ - 0.08);
      tx = p.x + (cx - p.x) * k; ty = hy + (cy - hy) * k; tz = p.z + (cz - p.z) * k;
      // bij weinig ruimte de camera wat optillen, zoals in een racegame
      ty += (1 - k) * (inCar ? 4 : 1.5);
    }
    const targetPos = new THREE.Vector3(tx, ty, tz);
    if (instant) this.camera.position.copy(targetPos);
    else this.camera.position.lerp(targetPos, Math.min(1, dt * (occ < 1 ? 20 : inCar ? 8 : 10)));
    // sneller rijden = breder beeld
    const fov = 60 + (inCar ? Math.min(14, p.speed * 0.45) : 0);
    if (Math.abs(this.camera.fov - fov) > 0.05) { this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 3); this.camera.updateProjectionMatrix(); }
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(p.x, p.y + (inCar ? 1.2 : 1.5), p.z);
    if (this.wobble > 0) {
      this.wobble -= dt;
      this.camera.rotateZ(Math.sin(this.time * 1.3) * Math.min(1, this.wobble / 5) * 0.06);
    }
    if (this.shake > 0) {
      this.shake -= dt;
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.6;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.6;
    }
    if (this.sunDir) {
      this.sun.position.set(p.x + this.sunDir.x * 250, p.y + Math.max(this.sunDir.y, 0.15) * 250, p.z + this.sunDir.z * 250);
      this.sun.target.position.set(p.x, p.y, p.z);
    }
    this.sky.position.copy(this.camera.position);
    this.stars.position.copy(this.camera.position);
  }

  updateHud(dt) {
    const p = this.player;
    this.hudTimer = (this.hudTimer || 0) - dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.4;
      const s = this.world.nearestStreet(p.x, p.z);
      this.ui.setStreet(s && s.dist < 40 ? s.name : '');
    }
    if (this.targetBeam) this.targetBeam.material.opacity = 0.18 + Math.sin(this.time * 3) * 0.06;
    const tgt = this.target ? { x: this.target.pos.x, z: this.target.pos.z } : this.waypoint;
    const base = this.minimap.markers;
    if (this.tempMarkers?.length) this.minimap.markers = base.concat(this.tempMarkers.filter((m) => !m.done));
    this.minimap.draw(p.x, p.z, p.heading, this.camYaw, tgt);
    this.minimap.markers = base;
  }
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

function pointAlong(path, dist) {
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1], [bx, bz] = path[i];
    const seg = Math.hypot(bx - ax, bz - az);
    if (acc + seg >= dist) {
      const t = (dist - acc) / seg;
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, heading: Math.atan2(bx - ax, bz - az) };
    }
    acc += seg;
  }
  const [x, z] = path.at(-1);
  return { x, z, heading: 0 };
}

function makeLabel(text, { small = false } = {}) {
  const c = document.createElement('canvas');
  const fs = 56;
  const ctx = c.getContext('2d');
  ctx.font = `800 ${fs}px "Baloo 2", sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + 60;
  c.width = w; c.height = fs + 40;
  ctx.font = `800 ${fs}px "Baloo 2", sans-serif`;
  ctx.fillStyle = small ? 'rgba(27,36,48,0.78)' : 'rgba(255,250,240,0.95)';
  roundRect(ctx, 4, 4, w - 8, c.height - 8, 22);
  ctx.fill();
  if (!small) { ctx.strokeStyle = '#e8a33d'; ctx.lineWidth = 6; ctx.stroke(); }
  ctx.fillStyle = small ? '#ffffff' : '#1b2430';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 30, c.height / 2 + 3);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, fog: false, transparent: true }));
  const h = small ? 0.45 : 2.6;
  s.scale.set((h * w) / c.height, h, 1);
  s.renderOrder = 10;
  return s;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const game = new Game();
document.fonts.ready.then(() => game.init()).catch((e) => {
  console.error(e);
  document.getElementById('loading-text').textContent = 'Er ging iets mis bij het laden: ' + e.message;
});
window.game = game;
