// Gras dat je echt ziet staan: duizenden sprieten rond de speler, volledig door de videokaart geplaatst.
// - Twee ringen: dichtbij fijne sprieten (elke 22 cm een polletje), verderop grovere pollen tot zo'n 30 meter.
// - De plek van elk polletje volgt uit een vast raster in de wereld (niet uit de camera), dus het gras staat stil
//   als je loopt; alleen de rand van het veld schuift mee.
// - Hoogte van het terrein, de vraag "is hier gras?" en de kleur komen uit kaarten: de hoogtekaart, een graskaart
//   (BGT-vlakken gras, berm en oever, zonder gebouwen) en de luchtfoto. Daardoor heeft elke spriet precies de
//   kleur van de grond eronder en loopt het veld naadloos over in de luchtfoto verderop.
// - Het gras gebruikt het gewone licht van de game: zon, schaduw, lantaarns en mist werken vanzelf.
import * as THREE from 'three';
import { keepNormals } from './lighting.js';
import { inTuin38 } from './tuin38.js';

// één polletje: een paar sprieten, elk een taps strookje van twee stukken
function tuftGeometry(blades, width, seed) {
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const pos = [], uv = [], idx = [];
  for (let b = 0; b < blades; b++) {
    const a = rnd() * Math.PI * 2, r = rnd() * 0.62, ox = Math.cos(a) * r, oz = Math.sin(a) * r;
    const dir = rnd() * Math.PI, dx = Math.cos(dir) * width, dz = Math.sin(dir) * width;
    const h = 0.7 + rnd() * 0.5, lean = (rnd() - 0.5) * 0.5;
    const base = pos.length / 3;
    // onder, midden, top; uv.x = buiging van deze spriet, uv.y = hoogte op de spriet (0..1)
    pos.push(ox - dx, 0, oz - dz, ox + dx, 0, oz + dz, ox - dx * 0.7, h * 0.5, oz - dz * 0.7, ox + dx * 0.7, h * 0.5, oz + dz * 0.7, ox, h, oz);
    for (const t of [0, 0, 0.5, 0.5, 1]) uv.push(lean, t);
    idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// kaart: waar staat gras? (1 px per meter, zachte randen door de filtering)
function grassMask(world) {
  const W = world.classCanvas.width, H = world.classCanvas.height, b = world.coreBox;
  const grassy = new Set(['gras', 'berm', 'oever', 'fruit']);
  const ok = world.ground.classes.map((n) => grassy.has(n));
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, H), d = img.data, cg = world.classGrid;
  for (let i = 0; i < W * H; i++) {
    const v = cg[i];
    const on = v === 0 ? true : ok[v - 1];
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = on ? 255 : 0; d[i * 4 + 3] = 255;
  }
  // de nagebouwde tuin van Ringweg 38 heeft zijn eigen gazon
  const vp = world.meta.pois.find((q) => q.id === 'volvo');
  if (vp) {
    const [vx, vz] = vp.pos;
    for (let z = Math.floor(vz - 70); z < vz + 70; z++) for (let x = Math.floor(vx - 70); x < vx + 70; x++) {
      const px = Math.floor(x - b.x0), py = Math.floor(z - b.z0);
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      if (inTuin38(x + 0.5, z + 0.5)) { const i = (py * W + px) * 4; d[i] = d[i + 1] = d[i + 2] = 0; }
    }
  }
  ctx.putImageData(img, 0, 0);
  // gebouwen en een randje eromheen: geen gras
  ctx.fillStyle = '#000'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.2;
  for (const f of world.footprints) {
    ctx.beginPath();
    f.ring.forEach(([x, z], i) => { const px = x - b.x0, py = z - b.z0; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.flipY = false; t.generateMipmaps = false; t.minFilter = t.magFilter = THREE.LinearFilter;
  return t;
}

export function buildGrass(world, scene, q) {
  if (!q.gras) return null;
  const b = world.coreBox;
  const hTex = new THREE.DataTexture(world.grid, world.gw, world.gh, THREE.RedFormat, THREE.FloatType);
  hTex.minFilter = hTex.magFilter = THREE.NearestFilter; hTex.needsUpdate = true;
  const shared = {
    uHeight: { value: hTex }, uGrid: { value: new THREE.Vector4(b.x0, b.z0, world.gridRes, world.baseHeight) },
    uMask: { value: grassMask(world) }, uBox: { value: new THREE.Vector4(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0) },
    uOrtho: world.ortho.uOrtho, uOrthoBox: world.ortho.uOrthoBox,
    uCenter: { value: new THREE.Vector2() }, uTime: { value: 0 },
  };
  const rings = [];
  // [vakmaat in meters, vakken per zijde, sprieten per pol, halve breedte van een spriet, hoogte, begin en eind van de ring]
  const defs = [[0.17, 128, 5, 0.014, 0.2, 0, 10.2]];
  if (q.gras >= 1) defs.push([0.42, 148, 5, 0.04, 0.27, 8.2, 30]);
  for (const [cell, N, blades, width, height, r0, r1] of defs) {
    const geo = new THREE.InstancedBufferGeometry().copy(tuftGeometry(blades, width / cell, 12345 + N));
    const cells = new Float32Array(N * N * 2);
    for (let i = 0; i < N * N; i++) { cells[i * 2] = (i % N) - N / 2; cells[i * 2 + 1] = Math.floor(i / N) - N / 2; }
    geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 2));
    geo.instanceCount = N * N;
    // zelfde soort materiaal als het terrein, zodat het gras precies hetzelfde licht krijgt (ook het hemellicht)
    const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.95, metalness: 0 });
    const u = { ...shared, uCell: { value: new THREE.Vector4(cell, height, r0, r1) } };
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec2 aCell;
          uniform highp sampler2D uHeight; uniform sampler2D uMask, uOrtho;
          uniform vec4 uGrid, uBox, uOrthoBox, uCell;
          uniform vec2 uCenter; uniform float uTime;
          varying vec3 vGrass;
          float gh1(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float gnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(gh1(i), gh1(i + vec2(1, 0)), f.x), mix(gh1(i + vec2(0, 1)), gh1(i + vec2(1, 1)), f.x), f.y); }
          // hoogte van het terrein, precies zoals de driehoeken van het terrein lopen
          float terrainY(vec2 p){
            vec2 g = (p - uGrid.xy) / uGrid.z - 0.5;
            ivec2 i = ivec2(floor(g)); vec2 f = fract(g);
            float a = texelFetch(uHeight, i, 0).r, bb = texelFetch(uHeight, i + ivec2(1, 0), 0).r;
            float d = texelFetch(uHeight, i + ivec2(0, 1), 0).r, e = texelFetch(uHeight, i + ivec2(1, 1), 0).r;
            float h = f.x + f.y <= 1.0 ? a + (bb - a) * f.x + (d - a) * f.y : e + (d - e) * (1.0 - f.x) + (bb - e) * (1.0 - f.y);
            return h - uGrid.w;
          }`)
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
        .replace('#include <begin_vertex>', `
          vec2 cell = floor(uCenter / uCell.x) + aCell;
          float h1 = gh1(cell), h2 = gh1(cell + 17.3), h3 = gh1(cell * 1.31 + 5.7);
          vec2 root = (cell + vec2(h1, h2)) * uCell.x;
          float ca = cos(h3 * 6.2832), sa = sin(h3 * 6.2832);
          vec2 lxz = vec2(position.x * ca - position.z * sa, position.x * sa + position.z * ca) * uCell.x;
          vec2 muv = (root - uBox.xy) / uBox.zw;
          float mask = smoothstep(0.45, 0.8, texture2D(uMask, muv).r) * step(0.002, muv.x) * step(muv.x, 0.998) * step(0.002, muv.y) * step(muv.y, 0.998);
          float dist = distance(root, uCenter);
          float fade = smoothstep(uCell.z - 1.5, uCell.z + 0.5, dist) * (1.0 - smoothstep(uCell.w - 2.5, uCell.w, dist));
          if (uCell.z < 0.5) fade = 1.0 - smoothstep(uCell.w - 2.5, uCell.w, dist);
          // lange en korte plekken, zoals in een echt veld
          float veld = gnoise(root * 0.11) * 0.7 + gnoise(root * 0.9) * 0.3;
          float hgt = uCell.y * (0.55 + veld * 0.9) * (0.75 + h3 * 0.5) * mask * fade;
          float t = uv.y;
          // buiging van de spriet plus wind die in golven over het veld trekt
          float wind = sin(uTime * 1.6 + root.x * 0.35 + root.y * 0.27) * 0.5 + sin(uTime * 2.9 + root.x * 1.3) * 0.25;
          vec2 bend = vec2(ca, sa) * (uv.x + 0.25) * 0.6 + vec2(0.8, 0.5) * wind * 0.35;
          vec3 transformed = vec3(root.x + lxz.x + bend.x * t * t * hgt, terrainY(root) + position.y * hgt - 0.01, root.y + lxz.y + bend.y * t * t * hgt);
          vec3 oc = texture2D(uOrtho, (root - uOrthoBox.xy) / uOrthoBox.zw).rgb;
          oc = mix(vec3(dot(oc, vec3(0.3, 0.55, 0.15))), oc, 1.12) * 1.12;
          // onderin donker (schaduw tussen de sprieten), bovenin licht en iets geler
          vGrass = oc * mix(0.74, 1.28, t) * (0.9 + h2 * 0.2) * mix(vec3(1.0), vec3(1.08, 1.06, 0.82), t * 0.6);
        `);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGrass;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vGrass;');
    };
    keepNormals(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    scene.add(mesh);
    rings.push(mesh);
  }
  return {
    rings,
    // het veld ligt rond een punt een eind vóór de camera, zodat het meeste gras in beeld valt
    update(camera, time) {
      const d = camera.getWorldDirection(new THREE.Vector3());
      const l = Math.hypot(d.x, d.z) || 1;
      shared.uCenter.value.set(camera.position.x + (d.x / l) * 7, camera.position.z + (d.z / l) * 7);
      shared.uTime.value = time;
    },
    setVisible(v) { for (const r of rings) r.visible = v; },
  };
}
