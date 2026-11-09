// "Gulpen van bovenaf": met een drone door lichtringen over het dorp vliegen. De camera hangt achter de drone.
// Joystick of WASD/pijltjes: links/rechts = draaien, vooruit/achteruit = stijgen/dalen; de drone vliegt zelf vooruit.
// Bij gouden ringen maakt de drone een foto van een bezienswaardigheid. Geeft { ok, rings, total, photos, time } terug.
import * as THREE from 'three';
import { findGulp } from './missions4.js';

const RING_R = 4.2;

function inRing(x, z, r) {
  let inside = false;
  for (let a = 0, b = r.length - 1; a < r.length; b = a++) {
    if ((r[a][1] > z) !== (r[b][1] > z) && x < ((r[b][0] - r[a][0]) * (z - r[a][1])) / (r[b][1] - r[a][1]) + r[a][0]) inside = !inside;
  }
  return inside;
}
// zit (x, y, z) in een gebouw? (lager dan het dak volgens de gebouwendata)
function hitsBuilding(w, x, y, z) {
  for (const k of w.nearbyFootprints(x, z)) {
    const f = w.footprints[k];
    if (f.extra || !(y < (f.top ?? w.groundAt(x, z) + 9))) continue;
    if (x >= f.minX && x <= f.maxX && z >= f.minZ && z <= f.maxZ && inRing(x, z, f.ring)) return true;
  }
  return false;
}

function makeDrone() {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x263238, roughness: 0.5, metalness: 0.4 });
  const white = new THREE.MeshStandardMaterial({ color: 0xeceff1, roughness: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.7), white);
  g.add(body);
  const cam = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), dark);
  cam.position.set(0, -0.1, 0.32); g.add(cam);
  const props = [];
  for (const [x, z] of [[-0.42, 0.42], [0.42, 0.42], [-0.42, -0.42], [0.42, -0.42]]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.62), dark);
    arm.position.set(x / 2, 0, z / 2); arm.rotation.y = Math.atan2(x, z); g.add(arm);
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 8), dark);
    motor.position.set(x, 0.04, z); g.add(motor);
    const prop = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.012, 0.05), new THREE.MeshStandardMaterial({ color: 0x90a4ae, transparent: true, opacity: 0.7 }));
    prop.position.set(x, 0.1, z); g.add(prop); props.push(prop);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), new THREE.MeshBasicMaterial({ color: z > 0 ? 0x00e676 : 0xff1744 }));
    led.position.set(x, -0.03, z); g.add(led);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData.props = props;
  return g;
}

function makeRing(photo) {
  const mat = new THREE.MeshBasicMaterial({ color: photo ? 0xffd54f : 0x40c4ff, transparent: true, opacity: 0.35, toneMapped: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(RING_R, 0.22, 10, 40), mat);
  return ring;
}

export function startDrone(g, { limit = 160 } = {}) {
  const w = g.world;
  const pois = Object.fromEntries((w.meta.pois || []).map((p) => [p.id, p]));
  const gy = (x, z) => w.groundAt(x, z);
  // ---- de route: langs bekende plekken, met tussenringen waar het ver is
  const stops = [];
  const markt = w.spotNear(20, 0);
  stops.push({ x: markt[0], z: markt[1], h: 18 });
  const gulp = findGulp(g, markt[0], markt[1]);
  if (gulp) stops.push({ x: gulp.water[0], z: gulp.water[1], h: 5 });
  if (pois.brouwerij) { const f = g.facades.frames.brouwerij; stops.push({ x: f ? f.x + f.nx * 10 : pois.brouwerij.pos[0], z: f ? f.z + f.nz * 10 : pois.brouwerij.pos[1], h: 14 }); }
  const prim = g.facades.primosa;
  if (prim) stops.push({ x: prim.center[0], z: prim.center[1], h: (prim.height || 10) + 7, photo: 'Piramide Primosa', look: [prim.center[0], gy(...prim.center) + 4, prim.center[1]], from: [0, 14, 22] });
  if (pois.mosaqua) stops.push({ x: pois.mosaqua.pos[0] + 12, z: pois.mosaqua.pos[1] + 12, h: 16 });
  if (pois.kerk) {
    // de kerktoren (plek volgens TOP10NL, zoals in facades.js); de foto van een eindje afstand, zodat de hele toren erop staat
    const [kx, kz] = [-177.0, 53.2];
    let topY = gy(kx, kz) + 40;
    for (const i of w.nearbyFootprints(kx, kz)) { const f = w.footprints[i]; if (kx >= f.minX && kx <= f.maxX && kz >= f.minZ && kz <= f.maxZ && f.top) topY = f.top; }
    const dx = markt[0] - kx, dz = markt[1] - kz, d = Math.hypot(dx, dz) || 1;
    stops.push({ x: kx + (dx / d) * 26, z: kz + (dz / d) * 26, h: 30, photo: 'Sint-Petruskerk', look: [kx, gy(kx, kz) + (topY - gy(kx, kz)) * 0.55, kz], from: [0, 6, 55] });
  }
  stops.push({ x: markt[0], z: markt[1], h: 13, photo: 'De Markt', look: [markt[0], gy(...markt) + 1, markt[1]], from: [0, 22, 26] });
  const pts = [];
  // de drone stijgt eerst op boven het plein, zodat je niet meteen tegen een gevel vliegt
  const sx0 = g.player.x, sz0 = g.player.z, sy0 = gy(sx0, sz0) + 14;
  stops.forEach((s, i) => {
    const prev = pts[pts.length - 1] || { x: sx0, z: sz0, y: sy0 };
    if (prev) {
      const d = Math.hypot(s.x - prev.x, s.z - prev.z);
      const n = Math.floor(d / 105);
      for (let k = 1; k <= n; k++) {
        const t = k / (n + 1), x = prev.x + (s.x - prev.x) * t, z = prev.z + (s.z - prev.z) * t;
        pts.push({ x, z, y: Math.max(gy(x, z) + 20, prev.y + (gy(s.x, s.z) + s.h - prev.y) * t) });
      }
    }
    pts.push({ x: s.x, z: s.z, y: gy(s.x, s.z) + s.h, photo: s.photo, look: s.look, from: s.from });
    void i;
  });
  // ---- ringen in de lucht, gericht langs de vliegroute
  const root = new THREE.Group();
  g.scene.add(root);
  const rings = pts.map((p, i) => {
    const r = makeRing(!!p.photo);
    const a = pts[i - 1] || { x: g.player.x, z: g.player.z }, b = pts[i + 1] || p;
    const dx = (b.x - a.x) || 1e-3, dz = (b.z - a.z) || 1e-3;
    r.position.set(p.x, p.y, p.z);
    r.rotation.y = Math.atan2(dx, dz);
    root.add(r);
    return r;
  });
  // ---- de drone
  const drone = makeDrone();
  let x = sx0, z = sz0, y = sy0, heading = Math.atan2(pts[0].x - x, pts[0].z - z), vy = 0, roll = 0, pitch = 0;
  root.add(drone);
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  const fwd = () => [Math.sin(heading), Math.cos(heading)];
  g.pov = { pos: new THREE.Vector3(x - Math.sin(heading) * 7, y + 3, z - Math.cos(heading) * 7), look: new THREE.Vector3(x, y, z), snap: true };
  const photoCam = new THREE.PerspectiveCamera(55, 1, 0.5, 3000);
  // ---- beeldlaag
  const hud = document.createElement('div');
  hud.className = 'drone-hud';
  hud.innerHTML = `<div class="dr-top"><b>Gulpen van bovenaf</b><span class="dr-rings"></span><button class="mini-stop" type="button">Stoppen</button></div>
    <div class="dr-batt"><i></i><span></span></div>
    <div class="dr-arrow">▲</div><div class="dr-alt"></div>
    <div class="dr-hint">${g.input.isTouch ? 'Joystick: links/rechts draaien, omhoog/omlaag stijgen en dalen' : 'A/D of ←/→ draaien, W/S of ↑/↓ stijgen en dalen'} · vlieg door de ringen, de gouden maken een foto</div>`;
  document.getElementById('hud').prepend(hud);
  document.body.classList.add('drone-on');
  hud.querySelector('.mini-stop').addEventListener('click', () => g.missions.stop());
  const arrow = hud.querySelector('.dr-arrow');
  const photos = [];
  let next = 0, t = 0, crashT = 0, gust = null, gustT = 6 + Math.random() * 5, end = 0, ok = null, safe = 3, last = { x, z, y, heading };
  const pop = (text, cls = '') => { const el = document.createElement('div'); el.className = 'dr-pop ' + cls; el.textContent = text; hud.appendChild(el); setTimeout(() => el.remove(), 1500); };
  const flashEl = () => { const el = document.createElement('div'); el.className = 'dr-flash'; hud.appendChild(el); setTimeout(() => el.remove(), 450); };
  const snap = (p) => {
    // foto vanaf de drone, gericht op de bezienswaardigheid
    const cv = g.renderer.domElement;
    photoCam.aspect = cv.width / cv.height; photoCam.updateProjectionMatrix();
    if (p.from) {
      // iets verder weg en hoger, zodat het hele gebouw erop staat
      const [lx, , lz] = p.look, dx = x - lx, dz = z - lz, d = Math.hypot(dx, dz) || 1;
      photoCam.position.set(lx + (dx / d) * p.from[2], p.look[1] + p.from[1], lz + (dz / d) * p.from[2]);
    } else photoCam.position.set(x, y, z);
    photoCam.lookAt(p.look[0], p.look[1], p.look[2]);
    drone.visible = false; root.visible = false;
    g.renderer.render(g.scene, photoCam);
    let url = null;
    try { url = cv.toDataURL('image/jpeg', 0.72); } catch { /* geen foto, jammer */ }
    drone.visible = true; root.visible = true;
    if (url) photos.push({ url, name: p.photo });
    flashEl(); g.sfx?.play('camera');
    pop(`Klik! ${p.photo}`, 'gold');
  };
  const cleanup = () => {
    g.scene.remove(root); hud.remove(); document.body.classList.remove('drone-on');
    g.pov = null; g.player.lockedFor = false; g.ui.setActionLabel(null);
  };
  return new Promise((resolve) => {
    let done = false;
    const finish = (r) => { if (done) return; done = true; g.minigame = null; cleanup(); resolve(r); };
    const showPhotos = () => {
      const strip = document.createElement('div');
      strip.className = 'dr-photos';
      strip.innerHTML = photos.map((p, i) => `<figure style="--r:${(i - (photos.length - 1) / 2) * 5}deg"><img src="${p.url}" alt=""><figcaption>${p.name}</figcaption></figure>`).join('');
      hud.appendChild(strip);
    };
    g.minigame = {
      stop: () => finish(null),
      debug: { label: null, get next() { return next; }, get total() { return pts.length; }, ring: (i) => pts[i], warp: (i) => { const p = pts[i]; x = p.x - Math.sin(heading) * 6; z = p.z - Math.cos(heading) * 6; y = p.y; heading = Math.atan2(p.x - x, p.z - z); }, setPos: (a, b, c, h) => { x = a; y = b; z = c; if (h !== undefined) heading = h; }, get pos() { return [x, y, z, heading]; } },
      update: (dt) => {
        g.player.lockedFor = true;
        if (ok !== null) { end -= dt; if (end <= 0) finish({ ok, rings: next, total: pts.length, photos: photos.length, time: t }); return; }
        t += dt; safe = Math.max(0, safe - dt);
        const inp = g.input.move;
        // besturing: draaien en stijgen; de drone vliegt zelf vooruit
        const turn = Math.max(-1, Math.min(1, inp.x || 0)), climb = Math.max(-1, Math.min(1, -(inp.y || 0)));
        heading -= turn * 1.5 * dt; // rechts = rechtsaf (de wereld heeft z naar het zuiden, dus het teken is omgekeerd)
        vy += (climb * 7 - vy) * Math.min(1, dt * 3);
        const speed = crashT > 0 ? 0 : 13 + Math.max(0, -vy) * 0.4; // duiken gaat iets sneller
        const [fx, fz] = fwd();
        // windvlagen
        gustT -= dt;
        if (!gust && gustT <= 0) { gust = { t: 2.6, a: Math.random() * Math.PI * 2, s: 3 + Math.random() * 3 }; pop('Windvlaag!', 'bad'); }
        let wx = 0, wz = 0;
        if (gust) { gust.t -= dt; const k = Math.sin(Math.min(1, gust.t / 2.6) * Math.PI); wx = Math.sin(gust.a) * gust.s * k; wz = Math.cos(gust.a) * gust.s * k; if (gust.t <= 0) { gust = null; gustT = 7 + Math.random() * 7; } }
        if (crashT > 0) {
          crashT -= dt;
          if (crashT <= 0) { x = last.x; z = last.z; y = last.y; heading = last.heading; vy = 0; safe = 2; }
        } else {
          x += (fx * speed + wx) * dt; z += (fz * speed + wz) * dt; y += vy * dt;
          y = Math.min(y, gy(x, z) + 70); // niet te hoog: dan zie je niks meer
        }
        // botsen met de grond of een pand
        const ground = gy(x, z);
        if (crashT <= 0 && safe <= 0 && (y < ground + 0.6 || hitsBuilding(w, x, y, z))) {
          crashT = 1.2;
          t += 8; // batterij
          g.sfx?.play('crash'); pop('Boem! −8 s batterij', 'bad');
          const f = document.createElement('div'); f.className = 'dr-flash bad'; hud.appendChild(f); setTimeout(() => f.remove(), 450);
        }
        // door de volgende ring?
        const p = pts[next];
        if (p && crashT <= 0 && Math.hypot(x - p.x, y - p.y, z - p.z) < RING_R) {
          rings[next].material.color.set(0x69f0ae); rings[next].material.opacity = 0.15;
          g.sfx?.play('coin');
          if (p.photo) snap(p); else pop(['Mooi!', 'Strak!', 'Hup!', 'Netjes!'][next % 4], 'good');
          last = { x: p.x, z: p.z, y: p.y, heading };
          next++;
          if (next >= pts.length) {
            ok = true; end = 5; showPhotos(); g.sfx?.play('success'); pop('Alle ringen! Prachtige beelden!', 'gold');
          }
        }
        // ringen: de volgende licht op en pulseert
        rings.forEach((r, i) => {
          if (i < next) return;
          const on = i === next;
          r.material.opacity = on ? 0.75 + Math.sin(t * 6) * 0.2 : i === next + 1 ? 0.35 : 0.18;
          r.scale.setScalar(on ? 1 + Math.sin(t * 4) * 0.04 : 1);
        });
        // drone tekenen: kantelt mee met draaien en stijgen
        roll += (turn * 0.45 - roll) * Math.min(1, dt * 5); // overhellen in de bocht
        pitch += (climb * -0.18 + 0.12 - pitch) * Math.min(1, dt * 5);
        drone.position.set(x, y, z);
        drone.rotation.set(pitch, heading, roll, 'YXZ');
        if (crashT > 0) drone.rotation.z += t * 14;
        drone.userData.props.forEach((pr, i) => { pr.rotation.y += dt * (40 + i); });
        // camera achter en iets boven de drone
        camPos.set(x - fx * 7.5, y + 2.6, z - fz * 7.5);
        if (camPos.y < gy(camPos.x, camPos.z) + 1) camPos.y = gy(camPos.x, camPos.z) + 1;
        camLook.set(x + fx * 5, y + 0.2, z + fz * 5);
        g.pov.pos.copy(camPos); g.pov.look.copy(camLook); g.pov.snap = false;
        // beeldlaag: batterij, pijl naar de volgende ring, hoogte
        const batt = Math.max(0, 1 - t / limit);
        hud.querySelector('.dr-batt i').style.width = batt * 100 + '%';
        hud.querySelector('.dr-batt i').style.background = batt > 0.4 ? '#69f0ae' : batt > 0.2 ? '#ffd54f' : '#ff5252';
        hud.querySelector('.dr-batt span').textContent = `🔋 ${Math.ceil(limit - t)} s`;
        hud.querySelector('.dr-rings').textContent = `Ringen ${next} / ${pts.length}  ·  📷 ${photos.length}`;
        hud.querySelector('.dr-alt').textContent = `${Math.round(y - ground)} m hoog`;
        if (p) {
          let rel = Math.atan2(p.x - x, p.z - z) - heading;
          rel = Math.atan2(Math.sin(rel), Math.cos(rel));
          const up = p.y - y;
          arrow.style.transform = `translateX(-50%) rotate(${-rel}rad)`; // positief rel = links van je
          arrow.textContent = Math.abs(up) > 3 && Math.abs(rel) < 0.5 ? (up > 0 ? '⬆' : '⬇') : '▲';
          arrow.classList.toggle('gold', !!p.photo);
        }
        g.missions.progress(`${next} / ${pts.length} ringen`);
        if (t >= limit) { ok = false; end = 1.5; pop('Batterij leeg!', 'bad'); if (photos.length) showPhotos(); }
      },
    };
  });
}
