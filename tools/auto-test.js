// Losse testpagina voor de auto's: alleen een grondvlak, een lucht en één auto (of een rijtje).
// Starten: npx vite --port 4182 --strictPort  en dan  http://localhost:4182/tools/auto-test.html
// Wordt aangestuurd door tools/auto-shots.cjs (via window.T), maar is ook met de hand te bekijken:
//   ?type=xc40&kleur=8e9296&nacht=0&beeld=voor34&kwaliteit=hoog&loop=1
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { installLighting } from '../src/lighting.js';
import { Vehicles, VOLVO_GREY } from '../src/vehicles.js';

installLighting();
const q = new URLSearchParams(location.search);
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xc9d8e6, 140, 4200);
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 9000);

// lucht en omgevingsreflecties zoals in de game
const makeSky = () => {
  const sky = new Sky();
  sky.scale.setScalar(20000);
  const u = sky.material.uniforms;
  u.turbidity.value = 4; u.rayleigh.value = 1.4; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.8;
  return sky;
};
const sky = makeSky(); scene.add(sky);
const envSky = makeSky(); const envScene = new THREE.Scene(); envScene.add(envSky);
const pmrem = new THREE.PMREMGenerator(renderer);
const sun = new THREE.DirectionalLight(0xfff1dc, 3.5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 80 });
sun.shadow.camera.updateProjectionMatrix();
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x5c5a3a, 0.95);
scene.add(hemi);

// grond: asfalt met een fijne korrel en een witte streep, zodat schaduw en lichtbundels te zien zijn
function groundTex() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#6c6c6a'; x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) {
    const v = 90 + Math.random() * 50;
    x.fillStyle = `rgb(${v},${v},${v - 4})`;
    x.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  x.fillStyle = '#d9d9d2'; x.fillRect(250, 0, 10, 512);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(30, 30); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshStandardMaterial({ map: groundTex(), roughness: 0.92 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
scene.add(ground);

// een nagemaakte wereld: vlak, geen gebouwen
const world = {
  isMobile: false, parkingSpots: [], footprints: [{ extra: true }], roadNodes: [],
  groundAt: () => 0, resolve: (x, z) => [x, z], classAt: () => 'rijbaan', blocked: () => false, insideBuilding: () => false,
  nearestStreet: () => null, spotNear: (x, z) => [x, z],
};
const game = { world, scene, camera, renderer, fx: null, sfx: null, time: 0 };
const cars = new Vehicles(game);
game.cars = cars;

let composer = null, bloom = null;
function setupPost() {
  const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.25, 0.6, 0.92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
}
if (q.get('bloom') !== '0') setupPost();

let envRT = null;
// dag (0) of nacht (1), met dezelfde formules als applyTime in main.js
function setNight(t) {
  const day = 1 - t;
  const elev = t > 0.5 ? -10 : 42;
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elev), THREE.MathUtils.degToRad(35));
  sky.material.uniforms.sunPosition.value.copy(sunDir);
  envSky.material.uniforms.sunPosition.value.copy(sunDir);
  const lightDir = t > 0.5 ? new THREE.Vector3(0.4, 0.8, 0.45).normalize() : sunDir;
  sun.position.copy(lightDir).multiplyScalar(40);
  sun.intensity = 3.5 * day + 0.95 * t;
  sun.color.setRGB(1, 0.93, 0.83);
  if (t > 0.5) sun.color.setRGB(0.55, 0.65, 1);
  hemi.intensity = 0.95 * day + 0.68 * t;
  hemi.color.setRGB(0.5 * day + 0.25 * t, 0.66 * day + 0.3 * t, 1 * day + 0.55 * t);
  hemi.groundColor.setRGB(0.3, 0.28, 0.22);
  renderer.toneMappingExposure = 0.62 * day + 1.02 * t;
  if (bloom) { bloom.strength = 0.24 + t * 0.5; bloom.threshold = 0.88 - t * 0.26; bloom.radius = 0.7; }
  scene.fog.color.set(0xbfd2e6).lerp(new THREE.Color(0x0b1424), t);
  sky.visible = t < 0.97;
  scene.background = t >= 0.97 ? new THREE.Color(0x060b16) : null;
  if (envRT) { envRT.dispose(); envRT = null; }
  if (t < 0.5) {
    envRT = pmrem.fromScene(envScene, 0, 1, 20000);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.38 * day + 0.08 * t;
  } else scene.environment = null;
  cars.setNight(t);
}

// standpunten: [camerapositie, kijkpunt, beeldhoek]
const VIEWS = {
  voor34: [[3.5, 1.55, 5.4], [0, 0.62, 0.2], 35],
  zij: [[8.2, 1.15, 0], [0, 0.72, 0], 30],
  achter34: [[-3.6, 1.75, -5.3], [0, 0.62, -0.2], 35],
  achter34b: [[3.6, 1.6, -5.3], [0, 0.62, -0.2], 35],
  boven: [[0.01, 9.5, 0], [0, 0, 0], 35],
  voor: [[0, 1.0, 7.5], [0, 0.7, 0], 30],
  achter: [[0, 1.0, -7.5], [0, 0.7, 0], 30],
  laag: [[2.2, 0.45, 4.6], [0, 0.6, 0.6], 40],
  wiel: [[2.3, 0.55, 2.6], [0.9, 0.36, 1.3], 30],
  binnen: [[2.6, 1.75, 0.9], [0, 0.95, 0.1], 32],
  koplamp: [[1.5, 0.95, 3.6], [0.55, 0.72, 2.1], 28],
  achterlicht: [[-1.6, 1.25, -3.7], [-0.6, 0.95, -2.1], 28],
  ver: [[9, 3.2, 13], [0, 0.6, 0], 35],
  rij: [[5, 3.2, 12], [0, 0.6, 0], 50],
  rijachter: [[-5, 3.4, -12], [0, 0.6, 0], 50],
  rijmidden: [[12, 6, 26], [0, 0.6, 0], 22],
  rijver: [[34, 15, 75], [0, 0.6, 0], 9],
  nachtweg: [[2.2, 2.3, -7.5], [0, 0.6, 4], 50],
};
function setView(name, scale = 1) {
  const v = VIEWS[name] || VIEWS.voor34;
  camera.position.set(v[0][0] * scale, v[0][1] * (name === 'boven' ? scale : 1), v[0][2] * scale);
  camera.fov = v[2];
  camera.updateProjectionMatrix();
  camera.lookAt(v[1][0], v[1][1], v[1][2]);
}

let current = [];
function clearCars() {
  for (const c of cars.cars.concat(cars.traffic, current)) if (c.mesh) scene.remove(c.mesh);
  if (cars.batches) for (const b of Object.values(cars.batches)) for (const m of b.meshes) scene.remove(m);
  cars.batches = null;
  cars.cars = []; cars.traffic = [];
  current = [];
}
// één losse auto in het midden
function setCar(type, paint, opts = {}) {
  clearCars();
  const car = cars.addCar(type, 0, 0, 0, paint, opts);
  current = [car];
  return car;
}
// een rijtje geparkeerde (gebundelde) auto's
function setRow(types, paints, dz = 0) {
  clearCars();
  const extra = types.map((type, i) => ({ type, x: (i - (types.length - 1) / 2) * 2.7, z: dz, heading: 0, paint: paints[i % paints.length], opts: {} }));
  cars.spawnParked(extra);
  current = cars.cars.slice();
}

function render() {
  if (composer) composer.render(); else renderer.render(scene, camera);
}
function shot(quality = 0.92) {
  render();
  return canvas.toDataURL('image/jpeg', quality);
}
// aantal driehoeken van één object (alle meshes eronder)
function tris(obj) {
  let n = 0;
  obj.traverse((o) => {
    if (!o.isMesh || !o.geometry || !o.visible) return;
    const g = o.geometry;
    const k = (g.index ? g.index.count : g.attributes.position.count) / 3;
    n += k * (o.isInstancedMesh ? o.count : 1);
  });
  return Math.round(n);
}

setNight(+(q.get('nacht') || 0));
setView(q.get('beeld') || 'voor34');
if (q.get('type')) setCar(q.get('type'), parseInt(q.get('kleur') || '8e9296', 16));
window.T = { THREE, scene, camera, renderer, cars, game, world, sun, setCar, setRow, setView, setNight, render, shot, tris, clearCars, VOLVO_GREY, VIEWS, get current() { return current; } };
if (q.get('loop')) renderer.setAnimationLoop(render); else render();
