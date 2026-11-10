// Blad voor hagen, struiken en de bolle kruinen in de tuin: een bladtextuur die in code wordt gemaakt.
import * as THREE from 'three';

// Bladtextuur voor de schillen van hagen en struiken: losse blaadjes op een doorzichtige achtergrond.
// De dekking loopt per blad van het midden (vol) naar de rand (dun): een hogere drempel geeft dus kleinere blaadjes.
let leafTex = null;
export function leafTexture(size = 256, n = 230, seed = 5) {
  if (leafTex) return leafTex;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  let sd = seed * 7919;
  const rand = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
  for (let i = 0; i < n; i++) {
    const x = rand() * size, y = rand() * size, r = 7 + rand() * 9, a = rand() * Math.PI, hue = 80 + rand() * 45, li = 38 + rand() * 30;
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
      if (x + ox < -r * 2 || x + ox > size + r * 2 || y + oy < -r * 2 || y + oy > size + r * 2) continue;
      g.save();
      g.translate(x + ox, y + oy); g.rotate(a); g.scale(1, 0.48);
      const grd = g.createRadialGradient(0, 0, 0, 0, 0, r);
      grd.addColorStop(0, `hsla(${hue},45%,${li}%,1)`);
      grd.addColorStop(0.55, `hsla(${hue},45%,${li - 6}%,0.8)`);
      grd.addColorStop(1, `hsla(${hue},45%,${li - 12}%,0.25)`);
      g.fillStyle = grd;
      g.beginPath(); g.moveTo(-r, 0); g.quadraticCurveTo(0, -r * 1.25, r, 0); g.quadraticCurveTo(0, r * 1.25, -r, 0); g.fill();
      g.restore();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  leafTex = t;
  return t;
}

// Materiaal voor bladerbollen en haagkernen: de bladtextuur wordt van drie kanten op het oppervlak gelegd
// (in wereldmaten, dus nergens uitgerekt). Tussen de blaadjes is het donker: dat leest als diepte.
export function leafyMaterial({ vertexColors = false, scale = 1.6 } = {}) {
  const tex = leafTexture();
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, vertexColors });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uLeaf = { value: tex };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLeafP; varying vec3 vLeafN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vLeafP = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
          vLeafN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        #else
          vLeafP = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vLeafN = normalize(mat3(modelMatrix) * normal);
        #endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uLeaf; varying vec3 vLeafP; varying vec3 vLeafN;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 w3 = pow(abs(normalize(vLeafN)), vec3(4.0)); w3 /= (w3.x + w3.y + w3.z);
          vec3 q3 = vLeafP * ${scale.toFixed(2)};
          vec4 lf = texture2D(uLeaf, q3.zy) * w3.x + texture2D(uLeaf, q3.xz) * w3.y + texture2D(uLeaf, q3.xy) * w3.z;
          // grove vlekken (bladgroepen in licht en schaduw), zodat een kruin ook van verder af geen gladde bol is
          vec3 q4 = vLeafP * ${(scale * 0.21).toFixed(3)};
          float clump = (texture2D(uLeaf, q4.zy) * w3.x + texture2D(uLeaf, q4.xz) * w3.y + texture2D(uLeaf, q4.xy) * w3.z).a;
          diffuseColor.rgb *= mix(vec3(0.42), lf.rgb * 2.6, smoothstep(0.15, 0.6, lf.a)) * (0.55 + 0.75 * clump);
        }`);
  };
  return mat;
}
