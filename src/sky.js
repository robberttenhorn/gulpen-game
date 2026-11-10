// De lucht: echte, gefotografeerde hemels (HDRI's van Poly Haven, CC0) op een koepel rond de camera.
// - overdag een half bewolkte lucht met de zon op 38 graden, 's nachts een sterrenhemel met de Melkweg;
// - de koepel draait mee zodat de zon op de foto precies staat waar de zon in het spel staat;
// - dezelfde koepel levert de omgevingsreflecties (autolak, ramen, water, natte straten) en het hemellicht.
// De foto's zijn opgeslagen met een groot helderheidsbereik in een gewone JPG (zie tools/fetch-hdri.py):
// v = t / (1 - t) rekent de echte helderheid terug.
import * as THREE from 'three';

const DATA = import.meta.env.BASE_URL + 'data/sky/';
const V = typeof __BUILD__ !== 'undefined' ? `?v=${__BUILD__}` : '';

const loadTex = (file) => new Promise((res) => new THREE.TextureLoader().load(DATA + file + V, (t) => {
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  // geen mipmaps: bij de naad van de koepel maakt de afgeleide een sprong, dat geeft anders een streep
  t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
  res(t);
}, undefined, () => res(null)));

const VERT = `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;
const FRAG = `
  uniform sampler2D tDay, tNight;
  uniform float uNight, uRotDay, uRotNight, uKeep, uExpDay, uExpNight, uGainDay, uGainNight, uTime, uEnv;
  uniform vec3 uGround, uSun, uTint;
  uniform vec2 uWarp; // (zonhoogte in het spel, zonhoogte op de foto), in radialen
  varying vec3 vDir;
  vec3 sky(sampler2D tex, vec3 d, float rot, float expo, vec2 warp){
    float az = atan(d.z, d.x) - rot;
    float el = asin(clamp(d.y, -1.0, 1.0));
    // de foto in de hoogte iets oprekken, zodat de zon op de foto even hoog staat als de zon in het spel
    el = el < warp.x ? el * warp.y / warp.x : warp.y + (el - warp.x) * (1.5707963 - warp.y) / (1.5707963 - warp.x);
    float y = (0.5 - el / 3.14159265) / uKeep; // 0 = zenit, 1 = onderrand van de foto (net onder de horizon)
    vec3 t = texture2D(tex, vec2(az / 6.2831853, 1.0 - min(y, 0.995))).rgb;
    return t / max(1.0 - t, vec3(0.004)) / expo;
  }
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main(){
    vec3 d = normalize(vDir);
    vec3 day = sky(tDay, d, uRotDay, uExpDay, uWarp) * uGainDay * uTint;
    // nacht: de foto is met een lange sluitertijd gemaakt, dus flink donkerder en met meer contrast
    vec3 nt = sky(tNight, d, uRotNight, uExpNight, vec2(0.6, 0.6));
    float nl = dot(nt, vec3(0.3, 0.55, 0.15));
    vec3 night = nt * nt * uGainNight * vec3(0.55, 0.7, 1.0);
    // fonkelende sterren (alleen in het echte beeld, niet in de reflecties)
    if (uEnv < 0.5 && uNight > 0.3 && d.y > 0.02) {
      vec2 g = vec2(atan(d.z, d.x), asin(d.y)) * 220.0;
      vec2 id = floor(g), f = fract(g) - 0.5;
      float h = hash(id);
      float star = step(0.985, h) * smoothstep(0.12, 0.0, length(f + (vec2(hash(id + 3.1), hash(id + 7.7)) - 0.5) * 0.6));
      night += vec3(1.0, 0.95, 0.9) * star * (0.6 + 0.4 * sin(uTime * (2.0 + h * 5.0) + h * 90.0)) * smoothstep(0.02, 0.25, d.y) * 0.9;
    }
    vec3 c = mix(day, night, uNight);
    // onder de horizon: de kleur van de verte (de mistkleur), zodat het landschap naadloos in de lucht overloopt
    c = mix(c, uGround, smoothstep(0.0, -0.06, d.y));
    gl_FragColor = vec4(c, 1.0);
  }`;

export class SkyDome {
  constructor() {
    const dummy = new THREE.DataTexture(new Uint8Array([70, 110, 170, 255]), 1, 1);
    dummy.colorSpace = THREE.SRGBColorSpace; dummy.needsUpdate = true;
    this.uniforms = {
      tDay: { value: dummy }, tNight: { value: dummy }, uNight: { value: 0 },
      uRotDay: { value: 0 }, uRotNight: { value: 0 }, uKeep: { value: 0.53 },
      uExpDay: { value: 0.5 }, uExpNight: { value: 0.5 }, uGainDay: { value: 1 }, uGainNight: { value: 0.05 },
      uTime: { value: 0 }, uEnv: { value: 0 },
      uGround: { value: new THREE.Color(0.4, 0.45, 0.5) }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uTint: { value: new THREE.Color(1, 1, 1) }, uWarp: { value: new THREE.Vector2(0.6, 0.6) },
    };
    const mk = (env) => {
      const mat = new THREE.ShaderMaterial({
        uniforms: { ...this.uniforms, uEnv: { value: env } }, vertexShader: VERT, fragmentShader: FRAG,
        side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false, toneMapped: false,
      });
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
      m.frustumCulled = false;
      m.renderOrder = -10;
      return m;
    };
    this.mesh = mk(0);
    // aparte, kleine scène met dezelfde koepel voor de omgevingsreflecties
    this.envScene = new THREE.Scene();
    this.envMesh = mk(1);
    this.envMesh.scale.setScalar(100);
    this.envScene.add(this.envMesh);
    this.meta = null;
    this.ready = false;
  }

  // Eerst de lichte versie, daarna (alleen op de computer) de fijne versie op de achtergrond.
  async load(fine, onUpdate) {
    const meta = await fetch(DATA + 'sky.json' + V).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!meta) return false;
    this.meta = meta;
    const [d, n] = await Promise.all([loadTex('dag_2k.jpg'), loadTex('nacht_2k.jpg')]);
    if (!d || !n) return false;
    const u = this.uniforms;
    u.tDay.value = d; u.tNight.value = n;
    u.uKeep.value = meta.dag.deel; u.uExpDay.value = meta.dag.belichting; u.uExpNight.value = meta.nacht.belichting;
    this.ready = true;
    if (fine) {
      Promise.all([loadTex('dag_4k.jpg'), loadTex('nacht_4k.jpg')]).then(([d4, n4]) => {
        if (d4) { u.tDay.value = d4; d.dispose(); }
        if (n4) { u.tNight.value = n4; n.dispose(); }
        onUpdate?.();
      });
    }
    return true;
  }

  // zonrichting in de wereld -> draai de koepel zo dat de zon op de foto daar staat
  setSun(dir, night) {
    const u = this.uniforms, m = this.meta;
    u.uSun.value.copy(dir);
    u.uNight.value = night;
    if (!m) return;
    const az = Math.atan2(dir.z, dir.x);
    u.uRotDay.value = az - m.dag.zonU * Math.PI * 2;
    const el = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
    if (el > 0.15) u.uWarp.value.set(el, THREE.MathUtils.degToRad(m.dag.zonHoogte));
    // 's nachts staat de lichte gloed aan de horizon (maan, verre stad) in de richting van het maanlicht
    u.uRotNight.value = az - m.nacht.zonU * Math.PI * 2;
  }

  update(camera, time) {
    this.mesh.position.copy(camera.position);
    this.mesh.scale.setScalar(camera.far * 0.9);
    this.uniforms.uTime.value = time;
  }
}
