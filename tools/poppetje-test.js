// Testpagina voor de poppetjes: alleen een grondvlak, licht en een paar poppetjes.
// - window.sheet(cfg): contactvel (n fasen naast elkaar, boven van opzij, onder van voren), geeft een data-URL terug
// - window.lineup(cfg): een rij verschillende poppetjes (kleding, hoeden, bouw) van voren, schuin of van achteren
// - window.slip(cfg): meet hoeveel de standvoet over de grond schuift (in meters per cyclus)
// - zonder aanroep: één poppetje dat live beweegt (?mode=walk&speed=1.3)
import * as THREE from 'three';
import { makeCharacter, makeBike } from '../src/character.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb9c4cf);
scene.add(new THREE.HemisphereLight(0xffffff, 0x777066, 1.5));
const sun = new THREE.DirectionalLight(0xfff2e0, 2.2);
sun.position.set(-3, 6, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 0.5, far: 30 });
scene.add(sun, sun.target);
const stage = new THREE.Group();
scene.add(stage);

const slabMat = new THREE.MeshStandardMaterial({ color: 0x6f7780, roughness: 0.9 });
function slab(x0, x1, y, z = 0, depth = 3) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.04, depth), slabMat);
  m.position.set((x0 + x1) / 2, y - 0.02, z);
  m.receiveShadow = true;
  stage.add(m);
}
function clearStage() {
  for (const c of [...stage.children]) {
    stage.remove(c);
    c.traverse?.((o) => { if (o.geometry && o.geometry !== slabGeoKeep) o.geometry.dispose?.(); });
  }
}
const slabGeoKeep = null;

function ortho(w, h, ppm, cx, cy, dir = [0, 0, 1]) {
  renderer.setSize(w, h, false);
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  const cam = new THREE.OrthographicCamera(-w / ppm / 2, w / ppm / 2, h / ppm / 2, -h / ppm / 2, 0.1, 60);
  cam.position.set(cx + dir[0] * 20, cy + dir[1] * 20, dir[2] * 20);
  cam.lookAt(cx, cy, 0);
  return cam;
}

// vaste 'willekeur' zodat elke opname hetzelfde begint
function fixedRandom(fn) {
  const r = Math.random; let s = 0.1234;
  Math.random = () => { s = (s * 9301 + 0.49297) % 1; return 0; };
  try { return fn(); } finally { Math.random = r; }
}

function advance(m, seconds, speed, mode, after) {
  const dt = 1 / 60;
  const n = Math.max(1, Math.round(seconds / dt));
  for (let i = 0; i < n; i++) { m.userData.animate(dt, speed, mode); after?.(m); }
}

window.sheet = (cfg = {}) => {
  const { mode = 'walk', speed = 1.3, n = 8, dtPhase = 0.14, warm = 2, opts = {}, ppm = 150, cell = 1.25, bike = false, hold = false, after = null, yaw = 0 } = cfg;
  clearStage();
  const rowH = 2.2;
  const w = Math.round(n * cell * ppm), h = Math.round(rowH * 2 * ppm);
  for (let row = 0; row < 2; row++) {
    const y0 = row === 0 ? rowH : 0; // boven: van opzij; onder: van voren
    slab(-n * cell / 2, n * cell / 2, y0 - (bike ? 0 : 0), -0.5, 2.5);
    for (let i = 0; i < n; i++) {
      const m = fixedRandom(() => makeCharacter(opts));
      const g = new THREE.Group();
      g.position.set((i - (n - 1) / 2) * cell, y0, 0);
      g.rotation.y = (row === 0 ? Math.PI / 2 : 0) + yaw;
      if (bike) { g.add(makeBike()); m.position.set(0, 0.25, -0.25); }
      if (hold) {
        const prop = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.25, 8), new THREE.MeshStandardMaterial({ color: 0xcc3333 }));
        const [hx, hy, hz] = m.userData.handOffset;
        prop.position.set(hx, hy, hz);
        m.userData.parts.handR.add(prop); m.userData.handProp = prop; m.userData.holdR = true;
      }
      g.add(m);
      stage.add(g);
      const fn = after ? new Function('m', after) : null;
      advance(m, warm + i * dtPhase, speed, mode, fn);
    }
  }
  const cam = ortho(w, h, ppm, 0, rowH - 0.05);
  renderer.render(scene, cam);
  return canvas.toDataURL('image/jpeg', 0.9);
};

window.lineup = (cfg = {}) => {
  const { list = [{}], ppm = 260, cell = 0.95, yaw = 0, mode = 'idle', speed = 0, warm = 0.5, zoom = null } = cfg;
  clearStage();
  const n = list.length;
  slab(-n * cell / 2 - 0.3, n * cell / 2 + 0.3, 0, 0, 3);
  list.forEach((o, i) => {
    const m = fixedRandom(() => makeCharacter(o));
    m.position.set((i - (n - 1) / 2) * cell, 0, 0);
    m.rotation.y = yaw;
    stage.add(m);
    advance(m, warm, o.speed ?? speed, o.mode ?? mode);
  });
  let cam;
  if (zoom) cam = ortho(Math.round(n * cell * ppm), Math.round(zoom.h * ppm), ppm, 0, zoom.y);
  else cam = ortho(Math.round((n * cell + 0.3) * ppm), Math.round(2.25 * ppm), ppm, 0, 1.02);
  renderer.render(scene, cam);
  return canvas.toDataURL('image/jpeg', 0.92);
};

// Schuiven van de standvoet: het poppetje beweegt met 'speed' vooruit; een voet die laag bij de grond is
// hoort stil te staan. Geeft per voet de gemiddelde horizontale snelheid tijdens het standmoment.
window.slip = (cfg = {}) => {
  const { mode = 'walk', speed = 1.3, seconds = 6, opts = {} } = cfg;
  clearStage();
  const m = fixedRandom(() => makeCharacter(opts));
  stage.add(m);
  advance(m, 2, speed, mode);
  const dt = 1 / 60, v = new THREE.Vector3();
  const feet = ['footL', 'footR'].map((k) => ({ b: m.userData.parts[k], y: [], z: [] }));
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    m.position.z += speed * dt;
    m.userData.animate(dt, speed, mode);
    m.updateMatrixWorld(true);
    for (const f of feet) { f.b.getWorldPosition(v); f.y.push(v.y); f.z.push(v.z); }
  }
  // stand = enkel binnen 8 mm van zijn laagste punt (ruimer telt ook het lage eind van de zwaai mee)
  return {
    speed, mode, voeten: feet.map((f) => {
      const minY = Math.min(...f.y), maxY = Math.max(...f.y);
      let slip = 0, t = 0;
      for (let i = 1; i < steps; i++) if (f.y[i] < minY + 0.008 && f.y[i - 1] < minY + 0.008) { slip += Math.abs(f.z[i] - f.z[i - 1]); t += dt; }
      return { standDeel: +(t / seconds).toFixed(2), schuifSnelheid: +(slip / Math.max(t, 1e-6)).toFixed(3), minEnkelY: +minY.toFixed(3), maxEnkelY: +maxY.toFixed(3) };
    }),
  };
};

// live meekijken
const q = new URLSearchParams(location.search);
if (q.has('mode')) {
  const m = makeCharacter({});
  slab(-3, 3, 0, 0, 6);
  stage.add(m);
  const cam = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 50);
  cam.position.set(2.6, 1.5, 3.2); cam.lookAt(0, 0.95, 0);
  renderer.setSize(innerWidth, innerHeight, false);
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    m.userData.animate(Math.min(0.05, clock.getDelta()), +(q.get('speed') || 1.3), q.get('mode'));
    renderer.render(scene, cam);
  });
}
window.__klaar = true;
