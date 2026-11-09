// Missie "Ploegen op de Gulperberg": met de tractor en een ploeg een akker in zo recht mogelijke banen omploegen.
// De akkerbouwer is verzonnen. De akker is een open stuk land (akker of gras) op de flank van de Gulperberg.
import * as THREE from 'three';

const LANES = 6, LANE_W = 3.6, FIELD_L = 46;

// open stuk land zoeken op de Gulperberg, bereikbaar vanaf een weg
export function findField(g) {
  const w = g.world;
  const mb = w.meta.pois.find((p) => p.id === 'mariabeeld');
  if (!mb) return null;
  const [mx, mz] = mb.pos;
  const W = LANES * LANE_W, L = FIELD_L;
  const okClass = new Set(['akker', 'gras', 'onverhard']);
  let best = null;
  for (let gx = -260; gx <= 260; gx += 16) {
    for (let gz = -260; gz <= 260; gz += 16) {
      const cx = mx + gx, cz = mz + gz;
      if (Math.hypot(gx, gz) < 25) continue;
      const st = w.nearestStreet(cx, cz);
      if (!st || st.dist > 55) continue;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI;
        const ux = Math.sin(a), uz = Math.cos(a), vx = uz, vz = -ux;
        let ok = true, hmin = Infinity, hmax = -Infinity;
        for (let u = -L / 2 - 4; u <= L / 2 + 4 && ok; u += 4) {
          for (let v = -W / 2 - 2; v <= W / 2 + 2; v += 3) {
            const x = cx + ux * u + vx * v, z = cz + uz * u + vz * v;
            if (!okClass.has(w.classAt(x, z)) || w.insideBuilding(x, z) || w.blocked(x, z)) { ok = false; break; }
            const h = w.heightAt(x, z); hmin = Math.min(hmin, h); hmax = Math.max(hmax, h);
          }
        }
        if (!ok) continue;
        const score = (hmax - hmin) + st.dist * 0.08 + Math.hypot(gx, gz) * 0.01;
        if (hmax - hmin < 9 && (!best || score < best.score)) best = { cx, cz, ux, uz, vx, vz, score, st };
      }
    }
  }
  return best;
}

function makePlough() {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x9e9e9e, metalness: 0.7, roughness: 0.35 });
  const red = new THREE.MeshStandardMaterial({ color: 0xc62828, roughness: 0.5 });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.14, 0.18), red);
  frame.position.set(0, 0.55, 0);
  g.add(frame);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 1.6), red);
  arm.position.set(0, 0.6, 0.8);
  g.add(arm);
  for (const x of [-0.9, 0, 0.9]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), steel); leg.position.set(x, 0.3, 0); g.add(leg);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.08), steel); blade.position.set(x + 0.15, 0.08, -0.05); blade.rotation.y = 0.5; g.add(blade);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function setupPloegen(m, g, add) {
  const f = findField(g);
  if (!f) return;
  m.field = f;
  const W = LANES * LANE_W;
  // de akkerbouwer staat bij de hoek van de akker die het dichtst bij de weg ligt
  const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([su, sv]) => [f.cx + f.ux * su * (FIELD_L / 2 + 3) + f.vx * sv * (W / 2 + 2), f.cz + f.uz * su * (FIELD_L / 2 + 3) + f.vz * sv * (W / 2 + 2), su, sv]);
  corners.sort((a, b) => Math.hypot(a[0] - f.st.x, a[1] - f.st.z) - Math.hypot(b[0] - f.st.x, b[1] - f.st.z));
  const [nx, nz, su, sv] = corners[0];
  f.startU = su; f.startV = sv; // ploegen begint bij deze hoek
  add('akkerbouwer', 'Akkerbouwer', g.world.resolve(nx, nz, 0.5), { shirt: 0x2e7d32, pants: 0x3e2723, hair: 0x9e9e9e, hat: 'cap', hatColor: 0x1b5e20, coat: 0x33691e, beard: true });
  // paaltjes op de hoeken van de akker
  const stakeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  const tipMat = new THREE.MeshStandardMaterial({ color: 0xff6f00, roughness: 0.6 });
  for (const [cu, cv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = f.cx + f.ux * cu * FIELD_L / 2 + f.vx * cv * W / 2, z = f.cz + f.uz * cu * FIELD_L / 2 + f.vz * cv * W / 2;
    const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6), stakeMat);
    stake.position.set(x, g.world.groundAt(x, z) + 0.55, z);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.18, 6), tipMat);
    tip.position.set(x, g.world.groundAt(x, z) + 1.05, z);
    g.scene.add(stake, tip);
  }
}

// De missie zelf: tractor met ploeg, zes banen. Geeft { ok, straight, lanes, time } terug.
export function startPloegen(g, f, { limit = 170 } = {}) {
  const w = g.world, cars = g.cars, W = LANES * LANE_W;
  // u loopt langs de banen, v dwars erop; baan 0 ligt aan de kant van de akkerbouwer
  const toXZ = (u, v) => [f.cx + f.ux * u + f.vx * v, f.cz + f.uz * u + f.vz * v];
  const toUV = (x, z) => { const dx = x - f.cx, dz = z - f.cz; return [dx * f.ux + dz * f.uz, dx * f.vx + dz * f.vz]; };
  const laneV = (i) => f.startV * (W / 2 - LANE_W / 2 - i * LANE_W);
  const laneDir = (i) => (i % 2 === 0 ? -f.startU : f.startU); // richting langs u: eerst van de hoek af
  // tractor aan het begin van baan 0, op de kopakker
  const [tx, tz] = toXZ(f.startU * (FIELD_L / 2 + 5), laneV(0));
  const head = Math.atan2(f.ux * laneDir(0), f.uz * laneDir(0));
  const car = cars.addCar('tractor', tx, tz, head, 0xb71c1c, { isTractor: true });
  car.mission = true;
  car.x = tx; car.z = tz; car.heading = head; cars.placeCar(car);
  const plough = makePlough();
  g.scene.add(plough);
  if (g.mode === 'car') g.exitCar();
  g.enterCar(car);
  // stoppelveld over de akker en een hulplijn voor de huidige baan
  // stoppelveld dat de helling volgt
  const sg = new THREE.PlaneGeometry(W, FIELD_L, 12, 24);
  const sp = sg.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const v = sp.getX(i), u = sp.getY(i);
    const [x, z] = toXZ(u, v);
    sp.setXYZ(i, x, w.groundAt(x, z) + 0.06, z);
  }
  sg.computeVertexNormals();
  const stubbleG = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: 0xc9b56a, roughness: 1, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
  stubbleG.receiveShadow = true;
  g.scene.add(stubbleG);
  const guideMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false });
  const guide = new THREE.Group();
  for (let k = 0; k < 24; k++) { const d = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 1.1), guideMat); d.rotation.x = -Math.PI / 2; guide.add(d); }
  g.scene.add(guide);
  const placeGuide = (i) => {
    guide.children.forEach((d, k) => {
      const u = -FIELD_L / 2 + 1 + (k / 23) * (FIELD_L - 2);
      const [x, z] = toXZ(u, laneV(i));
      d.position.set(x, w.groundAt(x, z) + 0.14, z);
      d.rotation.z = -Math.atan2(f.ux, f.uz);
    });
  };
  placeGuide(0);
  // voren: donkere stroken grond achter de ploeg
  const MAXF = 900;
  const furrowGeo = new THREE.PlaneGeometry(2.4, 0.72); // iets langer dan de stap, zodat de voor doorloopt
  furrowGeo.rotateX(-Math.PI / 2); // plat op de grond (stond eerst rechtop door een fout)
  const furrows = new THREE.InstancedMesh(furrowGeo, new THREE.MeshStandardMaterial({ color: 0x4e342e, roughness: 1 }), MAXF);
  furrows.count = 0; furrows.frustumCulled = false; furrows.receiveShadow = true;
  g.scene.add(furrows);
  const mtx = new THREE.Matrix4(), qq = new THREE.Quaternion(), pp = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  let lane = 0, t = 0, lastF = null, devSum = 0, devN = 0, warnT = 0, laneMin = Infinity, laneMax = -Infinity;
  const endBeam = () => { const [x, z] = toXZ(laneDir(lane) * (FIELD_L / 2 + 2), laneV(lane)); g.setTarget({ pos: new THREE.Vector3(x, 0, z) }); };
  endBeam();
  const status = () => {
    const pct = devN ? Math.max(0, Math.round(100 - (devSum / devN) * 70)) : 100;
    g.missions.progress(`Baan ${Math.min(lane + 1, LANES)} / ${LANES}  ·  recht: ${pct}%`);
    return pct;
  };
  status();
  return new Promise((resolve) => {
    let done = false;
    const finish = (r) => {
      if (done) return; done = true; g.minigame = null;
      g.scene.remove(plough, stubbleG, guide); g.setTarget(null); g.ui.timer(null);
      setTimeout(() => g.scene.remove(furrows), 20000); // de geploegde akker blijft nog even zichtbaar
      if (g.car === car) g.exitCar();
      if (car.mesh) g.scene.remove(car.mesh);
      cars.cars = cars.cars.filter((c) => c !== car);
      resolve(r);
    };
    g.minigame = {
      stop: () => finish(null),
      actionLabel: undefined, // de knop 'Uit' van de auto mag blijven, maar uitstappen stopt de missie
      debug: { label: undefined, get lane() { return lane; }, toXZ, laneV, laneDir, car },
      update: (dt) => {
        t += dt; warnT -= dt;
        g.ui.timer(`${Math.max(0, Math.ceil(limit - t))} s`);
        // ploeg achter de tractor
        const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
        const px = car.x - fx * 3.0, pz = car.z - fz * 3.0;
        plough.position.set(px, w.groundAt(px, pz), pz);
        plough.rotation.y = car.heading;
        if (g.car !== car) { finish({ ok: false, left: true, lanes: lane, straight: status() }); return; }
        const [u, v] = toUV(px, pz);
        const inField = Math.abs(u) < FIELD_L / 2 && Math.abs(v) < W / 2 + 0.5;
        if (inField && Math.abs(car.speed) > 0.5) {
          // voor tekenen, elke halve meter
          if (!lastF || Math.hypot(px - lastF[0], pz - lastF[1]) > 0.5) {
            lastF = [px, pz];
            if (furrows.count < MAXF) {
              pp.set(px, w.groundAt(px, pz) + 0.1, pz); qq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), car.heading);
              mtx.compose(pp, qq, one); furrows.setMatrixAt(furrows.count, mtx); furrows.count++; furrows.instanceMatrix.needsUpdate = true;
            }
            const dev = Math.abs(v - laneV(lane));
            devSum += Math.min(dev, 2.5); devN++;
            laneMin = Math.min(laneMin, u); laneMax = Math.max(laneMax, u);
            if (dev > 1.1 && warnT <= 0) { warnT = 2; g.ui.toast('Scheef! Terug naar de witte lijn', 1100); g.sfx?.play('splat'); }
            status();
          }
        }
        // baan klaar: bijna de hele lengte geploegd en de ploeg is de akker uit aan de overkant
        const passed = laneMax - laneMin > FIELD_L * 0.85 && Math.sign(u) === laneDir(lane) && Math.abs(u) > FIELD_L / 2;
        if (passed) {
          lane++;
          laneMin = Infinity; laneMax = -Infinity;
          if (lane >= LANES) { const pct = status(); finish({ ok: pct >= 60, straight: pct, lanes: lane, time: t }); return; }
          g.sfx?.play('tally');
          g.ui.toast(`Baan ${lane + 1} van ${LANES}: keren en terug langs de lijn`, 1600);
          placeGuide(lane); endBeam(); status();
        }
        if (t > limit) finish({ ok: false, late: true, lanes: lane, straight: status() });
      },
    };
  });
}
