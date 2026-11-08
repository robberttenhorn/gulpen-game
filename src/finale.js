// Finale na het afronden van alle missies: uitnodiging naar de Markt, iedereen uit de missies
// verzamelt zich, de waard houdt een toespraak, en dan vuurwerk, muziek en een polonaise.
import * as THREE from 'three';
import { makeCharacter } from './character.js';

const COLORS = [0xff1744, 0xffea00, 0x00e676, 0x2979ff, 0xd500f9, 0xff9100];

// Feestverlichting: een mast midden op de Markt met slingers gekleurde lampjes naar palen eromheen,
// plus een paar gekleurde lampen die de Markt in wisselende kleuren zetten.
function buildPartyLights(g, cx, cz) {
  const w = g.world;
  const root = new THREE.Group();
  const pole = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.7 });
  const top = 7.5;
  const y0 = w.groundAt(cx, cz);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, top, 8), pole);
  mast.position.set(cx, y0 + top / 2, cz);
  root.add(mast);
  const bulbs = [];
  const N = 10;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    // paal zo ver mogelijk naar buiten (max 15 m), maar niet in een gebouw
    let ex = null, ez = null;
    for (let r = 15; r >= 7; r -= 1) {
      const x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r;
      let free = !w.insideBuilding(x, z);
      for (let k = 0.2; free && k < 1; k += 0.1) free = !w.insideBuilding(cx + (x - cx) * k, cz + (z - cz) * k);
      if (free) { ex = x; ez = z; break; }
    }
    if (ex == null) continue;
    const ey = w.groundAt(ex, ez);
    const ph = 4.2;
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, ph, 6), pole);
    p.position.set(ex, ey + ph / 2, ez);
    root.add(p);
    // slinger met doorhang
    const n = 16;
    for (let j = 1; j < n; j++) {
      const t = j / n;
      const x = cx + (ex - cx) * t, z = cz + (ez - cz) * t;
      const y = (y0 + top) * (1 - t) + (ey + ph) * t - Math.sin(t * Math.PI) * 1.1;
      bulbs.push([x, y, z]);
    }
  }
  const geo = new THREE.SphereGeometry(0.11, 8, 6);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const inst = new THREE.InstancedMesh(geo, mat, Math.max(1, bulbs.length));
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  bulbs.forEach(([x, y, z], i) => { m4.makeTranslation(x, y, z); inst.setMatrixAt(i, m4); inst.setColorAt(i, col.set(COLORS[i % COLORS.length])); });
  inst.count = bulbs.length;
  inst.frustumCulled = false;
  root.add(inst);
  // gekleurde spotjes die over de Markt zwieren (geen echte lampen: dat zou alle shaders opnieuw laten bouwen)
  const spotGeo = new THREE.CircleGeometry(2.3, 28);
  const lamps = [];
  for (let i = 0; i < 5; i++) {
    const sm = new THREE.MeshBasicMaterial({ color: COLORS[i], transparent: true, opacity: 0.24, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    const spot = new THREE.Mesh(spotGeo, sm);
    spot.rotation.x = -Math.PI / 2;
    spot.renderOrder = 5;
    root.add(spot);
    lamps.push(spot);
  }
  g.scene.add(root);
  let t = 0;
  return {
    update(dt) {
      t += dt;
      // looplicht: de kleuren schuiven door, en af en toe knippert alles tegelijk
      const shift = Math.floor(t * 4);
      const blink = Math.sin(t * 9) > 0.2 || Math.floor(t / 4) % 3 !== 2;
      for (let i = 0; i < inst.count; i++) {
        col.set(COLORS[(i + shift) % COLORS.length]);
        if (!blink && i % 2) col.multiplyScalar(0.15);
        inst.setColorAt(i, col);
      }
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      lamps.forEach((l, i) => {
        const a = t * (0.5 + i * 0.13) + i * 1.3, r = 4 + Math.sin(t * 0.7 + i) * 4;
        const x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r;
        l.position.set(x, w.groundAt(x, z) + 0.06, z);
        l.material.color.set(COLORS[(i + Math.floor(t * 1.5)) % COLORS.length]);
      });
    },
    remove() { g.scene.remove(root); geo.dispose(); mat.dispose(); spotGeo.dispose(); lamps.forEach((l) => l.material.dispose()); },
  };
}

// Uitnodiging: lichtbundel naar de Markt; de finale begint als je daar bent.
export function inviteFinale(m, g) {
  const markt = g.world.spotNear(20, 0);
  m.setActive('finale', 'Feest op de Markt!', 'Je hebt alle missies gedaan! De waard van De Zwarte Ruiter geeft een feest voor je op de Markt. Volg de lichtbundel.', '');
  g.ui.toast('Alle missies gedaan! Er is feest voor je op de Markt.', 3500);
  g.setDestination(markt, 1e9, () => startFinale(m, g, markt), () => {}, { noTimer: true });
}

async function startFinale(m, g, markt) {
  if (m.active?.id !== 'finale') return;
  const ui = g.ui;
  if (g.mode === 'car') g.exitCar();
  g.setMode('walk');
  g.player.lockedFor = true;
  // het wordt avond: vuurwerk zie je beter in het donker
  if (g.night < 0.5) await g.skipTime(21.5);
  if (m.active?.id !== 'finale') return;
  const [cx, cz] = markt;
  const w = g.world;
  // iedereen uit de missies komt naar de Markt (kopieën; de echte personen staan zolang verstopt)
  const hidden = [];
  const people = Object.entries(m.npcs).filter(([k, n]) => k !== 'waard' && n.look && n.group.visible).slice(0, 26);
  const clones = people.map(([, n], i) => {
    hidden.push(n.group);
    n.group.visible = false;
    const a = (i / people.length) * Math.PI * 2;
    const r = 7.5 + (i % 2) * 2;
    const [x, z] = w.resolve(cx + Math.sin(a) * r, cz + Math.cos(a) * r, 0.5);
    const model = makeCharacter(n.look);
    model.position.set(x, w.groundAt(x, z), z);
    model.rotation.y = Math.atan2(cx - x, cz - z);
    g.scene.add(model);
    return { model, x, z, heading: model.rotation.y, joined: false, marker: { done: true } };
  });
  g.followers = clones; // zwaaien tot de polonaise begint
  g.tempMarkers = [];
  g.joinLines = ['Alaaf!', 'Proost!', 'Op de ereburger!', 'Hup, achter je aan!'];
  // de waard komt voor je staan
  const waard = m.npcs.waard;
  const wOld = { x: waard.group.position.x, z: waard.group.position.z, heading: waard.heading };
  const [wx, wz] = w.resolve(g.player.x + Math.sin(g.player.heading) * 2.2, g.player.z + Math.cos(g.player.heading) * 2.2, 0.5);
  waard.group.position.set(wx, w.groundAt(wx, wz), wz);
  waard.lookAtPlayer = true;
  let lights = null, bar = null;
  const restore = () => {
    hidden.forEach((h) => { h.visible = true; });
    waard.group.position.set(wOld.x, w.groundAt(wOld.x, wOld.z), wOld.z);
    waard.heading = wOld.heading;
    waard.lookAtPlayer = false;
    g.sfx?.stopMusic();
    g.stopPolonaise();
    g.joinLines = null;
    g.ui.timer(null);
    lights?.remove(); lights = null;
    bar?.remove(); bar = null;
  };
  m.active.cleanup = restore;
  g.sfx?.play('cheer');
  await ui.dialog(waard.name, [
    'Daar is ie! Iedereen, even stil! Dit is degene die heel Gullepe heeft geholpen.',
    'Muizen gevangen bij Pijls, de geit teruggebracht, het matras officieel gemaakt, kabouters gered, de tuin aan de Groeneweg opgehoogd... en ga zo maar door.',
    'Daarom ben jij vanaf vandaag Ereburger van Gullepe!',
    'Muziek! Vuurwerk! En een rondje pils van de zaak! Iedereen achter de ereburger aan: polonaise!',
  ]);
  if (m.active?.id !== 'finale') return;
  // feest: muziek, vuurwerk en iedereen in de polonaise
  g.player.lockedFor = false;
  g.sfx?.startMusic();
  clones.forEach((c) => { c.joined = true; });
  g.fx.confetti(g.player.x, w.groundAt(g.player.x, g.player.z) + 3, g.player.z, 220, true);
  m.progress('Loop met de polonaise over de Markt en kijk naar het vuurwerk');
  lights = buildPartyLights(g, cx, cz);
  // geen aftelklok: je stopt het feest zelf als je er genoeg van hebt
  bar = document.createElement('div');
  bar.className = 'finale-bar';
  bar.innerHTML = '<button type="button">Feest afsluiten</button>';
  document.getElementById('hud').appendChild(bar);
  await new Promise((resolve) => {
    let t = 0, next = 0.2, grand = 12;
    const rocket = () => {
      const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 16;
      const x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r;
      g.fx.firework(x, w.groundAt(x, z) + 1, z, null, () => g.sfx?.play('boom'));
    };
    const end = () => { g.minigame = null; resolve(true); };
    bar.querySelector('button').addEventListener('click', end);
    g.minigame = {
      stop: () => { g.minigame = null; resolve(false); },
      update: (dt) => {
        t += dt; next -= dt; grand -= dt;
        g.player.lockedFor = false;
        if (g.mode !== 'walk') g.setMode('walk');
        lights?.update(dt);
        if (next <= 0) {
          next = 0.3 + Math.random() * 0.6;
          const n = Math.random() < 0.35 ? 3 + Math.floor(Math.random() * 3) : 1; // vaak een salvo
          for (let i = 0; i < n; i++) setTimeout(rocket, i * 120);
          g.sfx?.play('launch');
        }
        if (grand <= 0) {
          // elke 12 seconden een grote finale-salvo
          grand = 12;
          for (let i = 0; i < 10; i++) setTimeout(rocket, i * 90);
          g.sfx?.play('cheer');
        }
      },
      debug: { label: null, get t() { return t; }, end },
    };
  });
  if (m.active?.id !== 'finale') return;
  restore();
  m.active.cleanup = null;
  await ui.dialog(waard.name, [
    'Wat een feest! Heel Gullepe praat er nog jaren over.',
    'Je kunt alle missies opnieuw spelen. Op de kaart zie je je beste tijd of score. Kijk of je die nog kunt verbeteren!',
  ]);
  m.complete('finale', 'Ereburger van Gullepe!');
}
if (typeof location !== 'undefined' && location.search.includes('dev')) window.__finale = inviteFinale;
