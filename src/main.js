import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { World } from './world.js';
import { Input } from './input.js';
import { UI, Minimap } from './ui.js';
import { makeCharacter, makeBike, makeSkateboard } from './character.js';
import { Quests } from './quests.js';

const isMobile = matchMedia('(pointer: coarse)').matches || innerWidth < 800;

class Game {
  constructor() {
    this.canvas = document.getElementById('scene');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: !isMobile, powerPreference: 'high-performance' });
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
    this.timeOfDay = 10.5;
    this.wobble = 0;

    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
  }

  async init() {
    const bar = document.getElementById('loading-bar');
    const txt = document.getElementById('loading-text');
    this.world = new World(this.scene, (p, t) => { bar.style.width = `${Math.round(p * 100)}%`; txt.textContent = t; });
    await this.world.load(isMobile);

    this.setupSky();
    this.setupPlayer();
    this.setupPoiLabels();
    this.minimap = new Minimap(this.world);
    this.quests = new Quests(this);
    this.quests.setup();
    this.minimap.markers = this.world.meta.pois.map((p) => ({ x: p.pos[0], z: p.pos[1], color: '#ffffff' }));

    bar.style.width = '100%';
    txt.textContent = 'Gulpen staat klaar.';
    // eerste frame alvast renderen zodat shaders gecompileerd zijn
    this.updateCamera(0, true);
    this.applyTime();
    this.renderer.compile(this.scene, this.camera);
    this.renderer.render(this.scene, this.camera);

    const btn = document.getElementById('start-btn');
    btn.hidden = false;
    await new Promise((r) => btn.addEventListener('click', r, { once: true }));
    document.getElementById('loading').hidden = true;
    document.getElementById('hud').hidden = false;
    this.clock.getDelta();
    this.renderer.setAnimationLoop(() => this.tick());

    await this.ui.dialog('Gulpen, zaterdagochtend', [
      'Welkom in Gulpe! De zon schijnt, de terrassen op de Markt lopen vol en de Gulperberg ligt er prachtig bij.',
      'Alleen jammer van je fiets... die heeft een lekke band. Tijd om eens langs Jef Abels te gaan.',
    ]);
  }

  // ------------------------------------------------------------ lucht en licht

  setupSky() {
    this.sky = new Sky();
    this.sky.scale.setScalar(20000);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 4;
    u.rayleigh.value = 1.4;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.8;
    this.scene.add(this.sky);

    this.sun = new THREE.DirectionalLight(0xfff1dc, 3.2);
    this.sun.castShadow = true;
    const s = isMobile ? 1024 : 2048;
    this.sun.shadow.mapSize.set(s, s);
    const c = this.sun.shadow.camera;
    c.left = -70; c.right = 70; c.top = 70; c.bottom = -70; c.near = 1; c.far = 600;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    this.scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x5c5a3a, 1.1);
    this.scene.add(this.hemi);

    this.scene.fog = new THREE.Fog(0xc9d8e6, 400, 4200);

    // sterren voor de nacht
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

  applyTime() {
    const t = this.timeOfDay;
    const dayAngle = ((t - 6) / 12) * Math.PI; // 0 bij 6u, pi bij 18u
    const elev = Math.sin(dayAngle) * 52; // graden
    const az = 100 + ((t - 6) / 12) * 160; // oost -> zuid -> west
    const phi = THREE.MathUtils.degToRad(90 - Math.max(elev, -10));
    const theta = THREE.MathUtils.degToRad(az);
    const sunDir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
    this.sunDir = sunDir;
    this.sky.material.uniforms.sunPosition.value.copy(sunDir);

    const day = THREE.MathUtils.smoothstep(elev, -6, 12);
    const night = 1 - day;
    this.night = night;
    this.world.setNight(THREE.MathUtils.smoothstep(night, 0.4, 1));
    this.stars.material.opacity = THREE.MathUtils.smoothstep(night, 0.6, 1);

    const dusk = THREE.MathUtils.smoothstep(elev, -4, 6) * (1 - THREE.MathUtils.smoothstep(elev, 6, 22));
    this.sun.intensity = 3.2 * day + 0.6 * night;
    this.sun.color.setRGB(1, 0.95 - dusk * 0.3, 0.86 - dusk * 0.45);
    if (night > 0.5) this.sun.color.setRGB(0.55, 0.65, 1); // maanlicht
    this.hemi.intensity = 1.1 * day + 0.55 * night;
    this.hemi.color.setRGB(0.75 * day + 0.25 * night, 0.85 * day + 0.3 * night, 1 * day + 0.55 * night);
    this.renderer.toneMappingExposure = 0.55 * day + 0.9 * night;

    const fogDay = new THREE.Color(0xc9d8e6).lerp(new THREE.Color(0xe8b98a), dusk * 0.6);
    this.scene.fog.color.copy(fogDay.lerp(new THREE.Color(0x0b1424), night));
    this.sky.visible = night < 0.97;
    this.scene.background = night >= 0.97 ? new THREE.Color(0x060b16) : null;
  }

  // ------------------------------------------------------------ speler

  setupPlayer() {
    const model = makeCharacter({ shirt: 0xe8a33d, pants: 0x2e3f5c, hair: 0x3b2a1a });
    const start = this.world.spotNear(5, 25);
    this.player = {
      group: new THREE.Group(),
      model,
      x: start[0], z: start[1], y: 0,
      heading: Math.PI, speed: 0, vx: 0, vz: 0,
      boost: 0, lockedFor: false,
    };
    this.player.group.add(model);
    this.bike = makeBike();
    this.board = makeSkateboard();
    this.bike.visible = false;
    this.board.visible = false;
    this.player.group.add(this.bike, this.board);
    this.scene.add(this.player.group);
    this.camYaw = 0.6;
    this.camPitch = 0.32;
    this.camDist = innerWidth < innerHeight ? 10 : 7;
    this.lastManualLook = -10;
  }

  unlockVehicle(v) {
    this.vehicles[v] = true;
    this.updateVehicleButton();
  }

  updateVehicleButton() {
    const options = this.availableModes();
    if (options.length <= 1) { this.ui.setVehicleButton(null); return; }
    const next = options[(options.indexOf(this.mode) + 1) % options.length];
    this.ui.setVehicleButton({ walk: 'Lopen', bike: 'Fiets', skate: 'Skate' }[next]);
  }

  availableModes() {
    if (this.keg) return ['walk'];
    if (this.race) return ['skate'];
    const m = ['walk'];
    if (this.vehicles.bike) m.push('bike');
    if (this.vehicles.skate) m.push('skate');
    return m;
  }

  setMode(mode) {
    this.mode = mode;
    this.bike.visible = mode === 'bike';
    this.board.visible = mode === 'skate';
    this.player.model.position.y = mode === 'bike' ? 0.25 : mode === 'skate' ? 0.12 : 0;
    this.player.model.position.z = mode === 'bike' ? -0.25 : 0;
    this.updateVehicleButton();
  }

  carryKeg(keg) {
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

  // ------------------------------------------------------------ NPC's, labels en bakens

  addNpc(name, [x, z], model) {
    const group = new THREE.Group();
    group.add(model);
    group.position.set(x, this.world.heightAt(x, z), z);
    this.scene.add(group);
    const label = makeLabel(name, { small: true });
    label.position.set(0, 2.6, 0);
    group.add(label);
    const npc = { name, group, model, pos: group.position, active: false, enabled: true, heading: 0, lookAtPlayer: false };
    this.npcs.push(npc);
    return npc;
  }

  setupPoiLabels() {
    for (const p of this.world.meta.pois) {
      const label = makeLabel(p.name);
      const [x, z] = p.pos;
      label.position.set(x, this.world.heightAt(x, z) + 11, z);
      this.scene.add(label);
    }
  }

  makeBeam(x, z, color = 0xe8a33d) {
    const geo = new THREE.CylinderGeometry(0.9, 0.9, 140, 16, 1, true);
    geo.translate(0, 70, 0);
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    });
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

  // ------------------------------------------------------------ minigames en effecten

  async startRace(path, rival) {
    if (!path || path.length < 2) return;
    // checkpoints elke ~45 m langs de Ringweg
    const pts = [];
    let acc = 0;
    pts.push(path[0]);
    for (let i = 1; i < path.length; i++) {
      const seg = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
      acc += seg;
      if (acc >= 45 || i === path.length - 1) { pts.push(path[i]); acc = 0; }
    }
    const total = path.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - path[i - 1][0], p[1] - path[i - 1][1]) : 0), 0);
    const limit = Math.max(25, Math.round(total / 6.2));

    // speler naar de start
    const [sx, sz] = this.world.resolve(pts[0][0], pts[0][1], 0.5);
    this.player.x = sx; this.player.z = sz;
    this.player.heading = Math.atan2(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
    this.camYaw = this.player.heading + Math.PI;
    this.race = { pts, idx: 1, time: 0, limit, rival, path, total, rivalDist: 0, done: false, markers: [] };
    this.setMode('skate');
    this.setTarget(null);

    const ringGeo = new THREE.TorusGeometry(3.2, 0.25, 8, 32);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0xe8a33d, emissive: 0xe8a33d, emissiveIntensity: 0.6 });
    this.race.markers = pts.slice(1).map(([x, z], i) => {
      const m = new THREE.Mesh(ringGeo, ringMat);
      const next = pts[Math.min(i + 2, pts.length - 1)];
      m.position.set(x, this.world.heightAt(x, z) + 3, z);
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
    this.ui.setQuest('Ringweg Race', `Haal alle checkpoints binnen ${limit} seconden en wees sneller dan de skater.`, `Checkpoint 0 / ${pts.length - 1}`);
  }

  updateRace(dt) {
    const r = this.race;
    if (!r || !r.started || r.done) return;
    r.time += dt;
    const left = r.limit - r.time;
    this.ui.timer(left.toFixed(1));
    // rivaal volgt de route
    r.rivalDist += dt * (r.total / (r.limit * 1.04));
    const rp = pointAlong(r.path, r.rivalDist);
    if (rp) {
      r.rival.pos.set(rp.x, this.world.heightAt(rp.x, rp.z), rp.z);
      r.rival.heading = rp.heading;
      r.rival.mode = 'skate';
    }
    const [cx, cz] = r.pts[r.idx];
    if (Math.hypot(this.player.x - cx, this.player.z - cz) < 6) {
      r.markers[r.idx - 1].visible = false;
      r.idx++;
      if (r.markers[r.idx]) r.markers[r.idx].visible = true;
      this.ui.setProgress(`Checkpoint ${r.idx - 1} / ${r.pts.length - 1}`);
      if (r.idx >= r.pts.length) return this.endRace(true);
    }
    if (left <= 0) this.endRace(false);
  }

  endRace(won) {
    const r = this.race;
    r.done = true;
    r.markers.forEach((m) => this.scene.remove(m));
    r.rival.mode = null;
    this.ui.timer(null);
    this.race = null;
    this.updateVehicleButton();
    this.quests.raceFinished(won);
  }

  async drinkPils() {
    this.player.lockedFor = true;
    this.player.pose = 'drink';
    await wait(1800);
    this.player.pose = null;
    this.wobble = 25;
  }

  async transitionToNight() {
    const fade = document.createElement('div');
    Object.assign(fade.style, { position: 'fixed', inset: 0, background: '#000', opacity: 0, transition: 'opacity 1.2s', zIndex: 15, pointerEvents: 'none' });
    document.body.appendChild(fade);
    await wait(50);
    fade.style.opacity = 1;
    await wait(1300);
    this.timeOfDay = 22.5;
    this.applyTime();
    await wait(400);
    fade.style.opacity = 0;
    await wait(1300);
    fade.remove();
  }

  // ------------------------------------------------------------ hoofdlus

  tick() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.input.update();
    this.updatePlayer(dt);
    this.updateNpcs(dt);
    this.updateRace(dt);
    this.updateInteractions(dt);
    this.updateCamera(dt);
    this.updateHud(dt);
    this.renderer.render(this.scene, this.camera);
  }

  updatePlayer(dt) {
    const p = this.player, inp = this.input;
    const busy = this.ui.dialogOpen || p.lockedFor;

    if (inp.consumeVehicle() && !busy) {
      const opts = this.availableModes();
      if (opts.length > 1) this.setMode(opts[(opts.indexOf(this.mode) + 1) % opts.length]);
    }

    let mx = busy ? 0 : inp.move.x, my = busy ? 0 : inp.move.y;
    const fwdX = -Math.sin(this.camYaw), fwdZ = -Math.cos(this.camYaw);
    const rightX = Math.cos(this.camYaw), rightZ = -Math.sin(this.camYaw);
    let dx = fwdX * -my + rightX * mx, dz = fwdZ * -my + rightZ * mx;
    const mag = Math.hypot(dx, dz);

    if (p.boost > 0) p.boost -= dt;
    let maxSpeed = { walk: 4.2, bike: 10, skate: 8.5 }[this.mode];
    if (this.mode === 'walk' && (inp.sprint || p.boost > 0)) maxSpeed = 7.2;
    if (this.keg) maxSpeed = 2.8;

    const accel = this.mode === 'walk' ? 14 : 5;
    const target = mag > 0.05 ? maxSpeed * Math.min(1, mag) : 0;
    p.speed += (target - p.speed) * Math.min(1, accel * dt);
    if (mag > 0.05) {
      const want = Math.atan2(dx, dz);
      let diff = want - p.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      const turn = this.mode === 'walk' ? 12 : 4.5;
      p.heading += diff * Math.min(1, turn * dt);
    }
    // hellingen: bergop langzamer
    const ahead = this.world.heightAt(p.x + Math.sin(p.heading) * 1.5, p.z + Math.cos(p.heading) * 1.5);
    const here = this.world.heightAt(p.x, p.z);
    const slope = (ahead - here) / 1.5;
    const slopeFactor = THREE.MathUtils.clamp(1 - slope * (this.mode === 'walk' ? 1.2 : 2.5), 0.45, 1.35);

    const nx = p.x + Math.sin(p.heading) * p.speed * slopeFactor * dt;
    const nz = p.z + Math.cos(p.heading) * p.speed * slopeFactor * dt;
    const [rx, rz] = this.world.resolve(nx, nz, this.mode === 'bike' ? 0.55 : 0.4);
    // bij een botsing snelheid verminderen
    const wanted = Math.hypot(nx - p.x, nz - p.z), got = Math.hypot(rx - p.x, rz - p.z);
    if (wanted > 0.001 && got < wanted * 0.5 && this.mode !== 'walk') p.speed *= 0.85;
    p.x = rx; p.z = rz;
    p.y = this.world.heightAt(p.x, p.z);

    p.group.position.set(p.x, p.y, p.z);
    p.group.rotation.y = p.heading;
    // kantelen op het skateboard / de fiets in bochten
    p.model.userData.animate(dt, p.speed, p.pose || (this.mode === 'walk' ? 'walk' : this.mode));
  }

  updateNpcs(dt) {
    const p = this.player;
    for (const n of this.npcs) {
      if (!n.group.visible) continue;
      const d = Math.hypot(p.x - n.pos.x, p.z - n.pos.z);
      if (n.mode === 'skate') {
        n.group.rotation.y = n.heading;
        n.model.userData.animate(dt, 6, 'skate');
        continue;
      }
      if (d < 9 || n.lookAtPlayer) {
        const want = Math.atan2(p.x - n.pos.x, p.z - n.pos.z);
        let diff = want - n.heading;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        n.heading += diff * Math.min(1, 5 * dt);
      }
      n.group.rotation.y = n.heading;
      n.model.userData.animate(dt, 0, n.active && d < 14 && d > 3 ? 'wave' : 'idle');
    }
  }

  updateInteractions(dt) {
    const p = this.player;
    this.time = (this.time || 0) + dt;

    // verzamelobjecten
    for (const c of this.collectibles) {
      c.mesh.rotation.y += dt * 2.5;
      c.mesh.position.y += Math.sin(this.time * 3) * 0.003;
      if (Math.hypot(p.x - c.pos.x, p.z - c.pos.z) < 2.2) { c.onCollect(); break; }
    }

    if (this.ui.dialogOpen || p.lockedFor || this.race) { this.ui.prompt(null); return; }

    let near = null, nd = 4;
    for (const n of this.npcs) {
      if (!n.active || !n.enabled) continue;
      const d = Math.hypot(p.x - n.pos.x, p.z - n.pos.z);
      if (d < nd) { near = n; nd = d; }
    }
    this.ui.prompt(near ? `Praat met ${near.name.toLowerCase().startsWith('de ') ? near.name.toLowerCase() : near.name}` : null);
    this.ui.setActionLabel(near ? 'Praat' : '...');
    if (this.input.consumeAction() && near) {
      p.speed = 0;
      this.quests.talk(near);
    }
  }

  updateCamera(dt, instant = false) {
    const p = this.player;
    const look = this.input.consumeLook();
    if (look.x || look.y) {
      this.camYaw -= look.x * 0.006;
      this.camPitch = THREE.MathUtils.clamp(this.camPitch + look.y * 0.004, -0.1, 1.2);
      this.lastManualLook = this.time || 0;
    }
    if (this.input.zoom) {
      this.camDist = THREE.MathUtils.clamp(this.camDist + this.input.zoom * 0.8, 3.5, 30);
      this.input.zoom = 0;
    }
    // camera draait vanzelf achter de speler aan als die beweegt
    if (!instant && p.speed > 1 && (this.time || 0) - this.lastManualLook > 1.5) {
      const behind = p.heading + Math.PI;
      let diff = behind - this.camYaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.camYaw += diff * Math.min(1, dt * (this.mode === 'walk' ? 1.2 : 2.2));
    }
    const dist = this.camDist + (this.mode !== 'walk' ? 1.5 : 0);
    const cx = p.x + Math.sin(this.camYaw) * Math.cos(this.camPitch) * dist;
    const cz = p.z + Math.cos(this.camYaw) * Math.cos(this.camPitch) * dist;
    let cy = p.y + 1.7 + Math.sin(this.camPitch) * dist;
    cy = Math.max(cy, this.world.heightAt(cx, cz) + 0.6);
    const targetPos = new THREE.Vector3(cx, cy, cz);
    if (instant) this.camera.position.copy(targetPos);
    else this.camera.position.lerp(targetPos, Math.min(1, dt * 10));
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(p.x, p.y + 1.5, p.z);
    if (this.wobble > 0) {
      this.wobble -= dt;
      const a = Math.min(1, this.wobble / 5) * 0.06;
      this.camera.rotateZ(Math.sin((this.time || 0) * 1.3) * a);
    }

    // schaduwcamera volgt de speler
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
    if (this.targetBeam) this.targetBeam.material.opacity = 0.18 + Math.sin((this.time || 0) * 3) * 0.06;
    const t = this.target ? { x: this.target.pos.x, z: this.target.pos.z } : null;
    this.minimap.draw(p.x, p.z, p.heading, this.camYaw, t);
  }
}

// ------------------------------------------------------------ hulpjes

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
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: !small ? true : true, fog: false, transparent: true });
  const s = new THREE.Sprite(mat);
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
