// Materialen en texturen van de auto's: lak met heldere laklaag en metaalschilfers, details met ruwheid
// en metaal per hoekpunt, doorzichtig getint glas, lampen die zelf licht geven, en de kentekenplaten.
import * as THREE from 'three';

// De lucht spiegelt in de game maar zwak (scene.environmentIntensity is laag gehouden voor de rest van het dorp).
// Lak en glas leven juist van die spiegeling, dus die krijgen hier een eigen versterking.
const SPIEGEL_LAK = 1.9, SPIEGEL_GLAS = 2.4;

// De omgevingskaart bevat alleen lucht. In het echt spiegelt een auto opzij en omlaag de straat, gevels en groen,
// en die zijn donkerder: daarom wordt de spiegeling zwakker naarmate de gespiegelde richting lager ligt.
// Dat geeft de bekende lichte bovenkant en donkere flank met een 'horizon' over de zijkant.
const HORIZON = 'mix( 0.3, 1.0, smoothstep( -0.12, 0.38, inverseTransformDirection( reflect( -geometryViewDir, geometryNormal ), viewMatrix ).y ) )';

const PLATE_COLS = 2, PLATE_ROWS = 8; // 14 platen in 7 rijen; de onderste rij blijft wit (voor de lampen)
export const PLATE_COUNT = PLATE_COLS * (PLATE_ROWS - 1);

// Verzonnen Nederlandse kentekens (gele plaat, zwarte letters, blauwe band met NL).
export function makePlateAtlas(seed = 38) {
  let s = seed;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const LET = 'BDFGHJKLNPRSTVXZ', pick = (n) => Array.from({ length: n }, () => LET[Math.floor(rnd() * LET.length)]).join('');
  const num = (n) => Array.from({ length: n }, () => Math.floor(rnd() * 10)).join('');
  const texts = ['R-038-GP']; // de Volvo van Ringweg 38
  while (texts.length < PLATE_COUNT) {
    const f = Math.floor(rnd() * 4);
    texts.push(f === 0 ? `${pick(2)}-${num(3)}-${pick(1)}` : f === 1 ? `${pick(1)}-${num(3)}-${pick(2)}` : f === 2 ? `${num(1)}-${pick(3)}-${num(2)}` : `${pick(3)}-${num(2)}-${pick(1)}`);
  }
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, 512, 512);
  const cw = 512 / PLATE_COLS, ch = 512 / PLATE_ROWS;
  texts.forEach((t, i) => {
    const px = (i % PLATE_COLS) * cw, py = Math.floor(i / PLATE_COLS) * ch;
    x.fillStyle = '#f6c400'; x.fillRect(px, py, cw, ch);
    x.strokeStyle = '#111'; x.lineWidth = 3; x.strokeRect(px + 2.5, py + 2.5, cw - 5, ch - 5);
    x.fillStyle = '#1c3f94'; x.fillRect(px + 4, py + 4, 24, ch - 8);
    x.fillStyle = '#f6c400'; x.font = 'bold 13px Arial, Helvetica, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('NL', px + 16, py + ch - 15);
    x.fillStyle = '#111'; x.font = 'bold 43px Arial, Helvetica, sans-serif';
    x.fillText(t, px + 28 + (cw - 30) / 2, py + ch / 2 + 2, cw - 40);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Lichtvlek van twee koplampen op de weg (voor een plat vlak voor de auto, opgeteld bij het beeld).
export function makeBeamTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, 128, 256);
  x.globalCompositeOperation = 'lighter';
  // onderkant van de textuur = bij de auto, bovenkant = ver weg
  for (const cx of [44, 84]) {
    const g = x.createRadialGradient(cx, 215, 4, cx, 150, 150);
    g.addColorStop(0, 'rgba(255,246,225,0.85)');
    g.addColorStop(0.25, 'rgba(255,244,220,0.42)');
    g.addColorStop(0.6, 'rgba(255,240,215,0.12)');
    g.addColorStop(1, 'rgba(255,240,215,0)');
    x.save(); x.translate(cx, 215); x.scale(0.42, 1); x.translate(-cx, -215);
    x.fillStyle = g; x.fillRect(-200, 0, 600, 256);
    x.restore();
  }
  // zachte randen, zodat het vlak nergens hard ophoudt
  x.globalCompositeOperation = 'destination-in';
  const m = x.createLinearGradient(0, 0, 0, 256);
  m.addColorStop(0, 'rgba(0,0,0,0)'); m.addColorStop(0.2, 'rgba(0,0,0,1)'); m.addColorStop(0.9, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = m; x.fillRect(0, 0, 128, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---- lak: heldere laklaag over een basislaag met fijne metaalschilfers (alleen van dichtbij te zien)
function patchPaint(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vLakPos;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLakPos = position;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
varying vec3 vLakPos;
vec3 lakHash( vec3 p ) {
  p = fract( p * vec3( 0.1031, 0.1030, 0.0973 ) );
  p += dot( p, p.yxz + 33.33 );
  return fract( ( p.xxy + p.yxx ) * p.zyx );
}`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  {
    // schilfers: de basislaag krijgt per korrel een iets andere richting; de laklaag erboven blijft glad
    vec3 fp = vLakPos * 900.0;
    float px = length( fwidth( fp ) );
    float lakFade = clamp( 1.6 / max( px, 1e-4 ), 0.0, 1.0 ) * ( 1.0 - smoothstep( 5.0, 16.0, length( vViewPosition ) ) );
    vec3 hsh = lakHash( floor( fp ) ) - 0.5;
    normal = normalize( normal + hsh * 0.2 * lakFade );
  }`)
    .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  {
    float lakK = ${SPIEGEL_LAK.toFixed(2)} * ${HORIZON};
    reflectedLight.indirectSpecular *= lakK;
    #ifdef USE_CLEARCOAT
    clearcoatSpecularIndirect *= lakK;
    #endif
  }`);
}

// ---- details: ruwheid en metaal per hoekpunt (band, kunststof, chroom, bekleding in één materiaal)
function patchDetail(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec2 aRM;\nvarying vec2 vRM;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRM = aRM;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec2 vRM;')
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vRM.x;')
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vRM.y;')
    .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  reflectedLight.indirectSpecular *= 1.3 * ${HORIZON};`);
}

// ---- glas: recht van voren kijk je erdoorheen (getint), schuin gezien spiegelt het de lucht
function patchGlass(shader) {
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  reflectedLight.indirectSpecular *= ${SPIEGEL_GLAS.toFixed(2)} * ${HORIZON};`)
    .replace('#include <opaque_fragment>', `
  {
    float glasFres = pow( 1.0 - saturate( dot( normalize( normal ), normalize( vViewPosition ) ) ), 4.0 );
    float glasA = mix( diffuseColor.a, 1.0, glasFres * 0.8 );
    // al voorvermenigvuldigd: de spiegeling telt volledig mee, de tint dekt de achtergrond af
    gl_FragColor = vec4( reflectedLight.indirectDiffuse * glasA + totalSpecular, glasA );
  }`)
    .replace('#include <premultiplied_alpha_fragment>', '');
}

// ---- lampen: elk hoekpunt heeft een soort; hoe fel het brandt hangt af van nacht, rijden, remmen en achteruit
function patchLights(shader, uniforms) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>
attribute float aKind;
uniform float uNacht;
uniform vec4 uLamp; // x: lampen aan (rijdt), y: rem, z: achteruit, w: knipperlicht
uniform float uPlaat;
#ifdef USE_INSTANCING
attribute float aPlaat;
#endif
varying float vGloed;`)
    .replace('#include <uv_vertex>', `#include <uv_vertex>
  {
    float aan = uLamp.x, k = aKind;
    float g = 0.0;
    if ( k < 0.5 ) g = 0.05 + aan * ( 0.3 + uNacht * 5.5 );           // dimlicht
    else if ( k < 1.5 ) g = 0.06 + aan * ( 2.4 + uNacht * 0.4 );       // dagrijlicht
    else if ( k < 2.5 ) g = 0.1 + aan * ( 0.25 + uNacht * 1.7 );       // achterlicht
    else if ( k < 3.5 ) g = 0.1 + aan * ( 0.2 + uNacht * 1.2 ) + uLamp.y * 5.0; // remlicht
    else if ( k < 4.5 ) g = 0.04 + uLamp.z * 6.0;                      // achteruitrijlicht
    else if ( k < 5.5 ) g = 0.08 + max( 0.0, uLamp.w * sign( position.x ) ) * 6.0; // knipperlicht (w > 0: links)
    else if ( k < 6.5 ) g = aan * uNacht * 0.4;                        // verlichte kentekenplaat
    vGloed = g;
    #ifdef USE_MAP
    if ( k > 5.5 && k < 6.5 ) {
      #ifdef USE_INSTANCING
      float pl = aPlaat;
      #else
      float pl = uPlaat;
      #endif
      float col = mod( pl, ${PLATE_COLS}.0 ), row = floor( pl / ${PLATE_COLS}.0 );
      vMapUv = vec2( ( col + uv.x ) / ${PLATE_COLS}.0, 1.0 - ( row + 1.0 - uv.y ) / ${PLATE_ROWS}.0 );
    }
    #endif
  }`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vGloed;')
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance = diffuseColor.rgb * vGloed;');
}

export class CarMaterials {
  constructor() {
    this.plates = makePlateAtlas();
    this.nacht = { value: 0 }; // gedeeld door alle lampmaterialen
    this.detail = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 });
    this.detail.onBeforeCompile = patchDetail;
    this.glass = new THREE.MeshStandardMaterial({
      vertexColors: true, transparent: true, depthWrite: false, premultipliedAlpha: true,
      roughness: 0.02, metalness: 0, polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: 3,
    });
    this.glass.onBeforeCompile = patchGlass;
    this.paintBase = this.paint(0xffffff);
    this.lightBase = this.lights(0); // voor de gebundelde (geparkeerde) auto's: lampen uit
    this.beamTex = makeBeamTexture();
    this.beam = new THREE.MeshBasicMaterial({ map: this.beamTex, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 });
  }
  // lak in een kleur; elke losse auto en elke bundel krijgt een eigen exemplaar
  paint(color) {
    const m = new THREE.MeshPhysicalMaterial({
      color, roughness: 0.45, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.045,
      // lapjes (lampen, naden) liggen een paar millimeter voor de lak; op afstand houdt deze vaste verschuiving ze ervoor.
      // Bewust geen verschuiving naar helling (factor 0): die duwt de lak bij schuin kijken centimeters weg.
      polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: 3,
    });
    m.onBeforeCompile = patchPaint;
    return m;
  }
  // lampmateriaal met eigen stand (aan, rem, achteruit) en eigen kenteken
  lights(plate) {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: this.plates, roughness: 0.22, metalness: 0.15, emissive: 0xffffff });
    const u = { uNacht: this.nacht, uLamp: { value: new THREE.Vector4(0, 0, 0, 0) }, uPlaat: { value: plate } };
    m.userData.u = u;
    m.onBeforeCompile = (shader) => patchLights(shader, u);
    m.customProgramCacheKey = () => 'autolampen';
    return m;
  }
}
