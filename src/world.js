// Bouwt de 3D-wereld van Gulpen op uit de open data in public/data/.
import * as THREE from 'three';

const DATA = import.meta.env.BASE_URL + 'data/';

async function fetchJson(name) {
  const r = await fetch(DATA + name);
  if (!r.ok) throw new Error(`Kan ${name} niet laden`);
  return r.json();
}
async function fetchBin(name) {
  const r = await fetch(DATA + name).catch(() => null);
  if (r && r.ok) return r.arrayBuffer();
  // sommige hostings serveren geen .bin; dan staat er een base64-versie naast
  const t = await fetch(DATA + name + '.b64.txt');
  if (!t.ok) throw new Error(`Kan ${name} niet laden`);
  const bin = atob((await t.text()).trim());
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

// Deterministische random, zodat Gulpen er bij iedereen hetzelfde uitziet.
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class World {
  constructor(scene, onProgress) {
    this.scene = scene;
    this.onProgress = onProgress || (() => {});
    this.nightUniform = { value: 0 };
  }

  async load(isMobile) {
    this.isMobile = isMobile;
    const step = (p, t) => this.onProgress(p, t);
    step(0.02, 'Kaartgegevens laden...');
    this.meta = await fetchJson('meta.json');
    const [coreBuf, wideBuf] = await Promise.all([fetchBin('terrain-core.bin'), fetchBin('terrain-wide.bin')]);
    this.coreRaw = new Float32Array(coreBuf);
    this.wideRaw = new Float32Array(wideBuf);
    this.setupTerrainGrids();

    step(0.12, 'Wegen, water en groen tekenen...');
    this.ground = await fetchJson('ground.json');
    this.buildGroundTexture();

    step(0.3, 'Het Heuvelland vormen...');
    this.buildTerrainMeshes();

    step(0.45, '1.872 huizen neerzetten...');
    const [bBuf, footprints] = await Promise.all([fetchBin('buildings.bin'), fetchJson('footprints.json')]);
    this.buildBuildings(bBuf);
    this.setupCollision(footprints);

    step(0.7, 'Bomen planten...');
    this.objects = await fetchJson('objects.json');
    this.roads = await fetchJson('roads.json');
    this.buildTrees();
    this.buildProps();

    step(0.9, 'Bijna klaar...');
    this.buildStreetIndex();
  }

  // ------------------------------------------------------------ terrein

  setupTerrainGrids() {
    const { core, wide, origin } = this.meta;
    // lokale coördinaten: x = oost - origin.x, z = origin.y - noord
    this.coreBox = {
      x0: core.minX - origin.x, x1: core.maxX - origin.x,
      z0: origin.y - core.maxY, z1: origin.y - core.minY,
    };
    this.wideBox = {
      x0: wide.minX - origin.x, x1: wide.maxX - origin.x,
      z0: origin.y - wide.maxY, z1: origin.y - wide.minY,
    };

    // Speelbare hoogtekaart op 4 m (gemiddelde van 2x2 cellen van 2 m), past precies bij het mesh.
    const f = 2;
    this.gridRes = core.res * f;
    this.gw = Math.floor(core.w / f);
    this.gh = Math.floor(core.h / f);
    this.grid = new Float32Array(this.gw * this.gh);
    for (let r = 0; r < this.gh; r++) {
      for (let c = 0; c < this.gw; c++) {
        let s = 0;
        for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) s += this.coreRaw[(r * f + dy) * core.w + c * f + dx];
        this.grid[r * this.gw + c] = s / (f * f);
      }
    }
    this.baseHeight = this.grid[Math.floor(this.gh / 2) * this.gw + Math.floor(this.gw / 2)];
  }

  // hoogte in wereldcoördinaten (y) op lokale x,z
  heightAt(x, z) {
    const b = this.coreBox;
    if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) {
      const gx = (x - b.x0) / this.gridRes - 0.5;
      const gz = (z - b.z0) / this.gridRes - 0.5;
      return this.bilinear(this.grid, this.gw, this.gh, gx, gz) - this.baseHeight;
    }
    const w = this.wideBox;
    const res = this.meta.wide.res;
    const gx = (x - w.x0) / res - 0.5;
    const gz = (z - w.z0) / res - 0.5;
    return this.bilinear(this.wideRaw, this.meta.wide.w, this.meta.wide.h, gx, gz) - this.baseHeight;
  }

  bilinear(a, w, h, gx, gz) {
    gx = Math.max(0, Math.min(w - 1.001, gx));
    gz = Math.max(0, Math.min(h - 1.001, gz));
    const x0 = Math.floor(gx), z0 = Math.floor(gz);
    const fx = gx - x0, fz = gz - z0;
    const i = z0 * w + x0;
    const a00 = a[i], a10 = a[i + 1], a01 = a[i + w], a11 = a[i + w + 1];
    return (a00 * (1 - fx) + a10 * fx) * (1 - fz) + (a01 * (1 - fx) + a11 * fx) * fz;
  }

  buildGroundTexture() {
    const b = this.coreBox;
    const W = b.x1 - b.x0, H = b.z1 - b.z0;
    const maxTex = this.isMobile ? 3072 : 4096;
    const cw = maxTex;
    const ch = Math.round((maxTex * H) / W);
    const scale = cw / W;
    const canvas = document.createElement('canvas');
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext('2d');

    const colors = {
      gras: '#7c9d4c', akker: '#b5a46a', bos: '#4c7536', struiken: '#66853f', erf: '#a49d8e',
      verhard_open: '#a19a8f', verhard_gesloten: '#8c8b88', onverhard: '#a99470', berm: '#83a253',
      oever: '#6f9450', water: '#4d7d96', voetpad: '#bdb2a1', fietspad: '#a35a4c', parkeer: '#8d8984',
      rijbaan: '#56585c', klinkers: '#8e8178', brug: '#918d88', spoor_zand: '#c2b08a', fruit: '#86a24c',
    };
    ctx.fillStyle = colors.gras;
    ctx.fillRect(0, 0, cw, ch);
    const classes = this.ground.classes;
    // klassen-kaart voor later (bomen in bos, water, enz.)
    this.classCanvas = document.createElement('canvas');
    const cs = 1; // 1 px per meter
    this.classCanvas.width = Math.round(W * cs);
    this.classCanvas.height = Math.round(H * cs);
    const cctx = this.classCanvas.getContext('2d');
    cctx.fillStyle = 'rgb(0,0,0)';
    cctx.fillRect(0, 0, this.classCanvas.width, this.classCanvas.height);

    for (const [cls, rings] of this.ground.polys) {
      const name = classes[cls];
      ctx.fillStyle = colors[name] || colors.gras;
      ctx.beginPath();
      cctx.fillStyle = `rgb(${cls + 1},0,0)`;
      cctx.beginPath();
      for (const ring of rings) {
        for (let i = 0; i < ring.length; i += 2) {
          const px = (ring[i] - b.x0) * scale, py = (ring[i + 1] - b.z0) * scale;
          const qx = (ring[i] - b.x0) * cs, qy = (ring[i + 1] - b.z0) * cs;
          if (i === 0) { ctx.moveTo(px, py); cctx.moveTo(qx, qy); } else { ctx.lineTo(px, py); cctx.lineTo(qx, qy); }
        }
        ctx.closePath(); cctx.closePath();
      }
      ctx.fill('evenodd');
      cctx.fill('evenodd');
      // subtiele randjes langs stoepen en wegen
      if (name === 'voetpad' || name === 'rijbaan' || name === 'fietspad') {
        ctx.strokeStyle = 'rgba(40,40,40,0.25)';
        ctx.lineWidth = Math.max(1, scale * 0.15);
        ctx.stroke();
      }
    }
    this.classData = cctx.getImageData(0, 0, this.classCanvas.width, this.classCanvas.height).data;
    this.classScale = cs;

    // korrelige ruis voor detail
    const img = ctx.getImageData(0, 0, cw, ch);
    const d = img.data;
    const rand = rng(1825);
    for (let i = 0; i < d.length; i += 4) {
      const n = (rand() - 0.5) * 18;
      d[i] = Math.max(0, Math.min(255, d[i] + n));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
    }
    ctx.putImageData(img, 0, 0);

    this.groundCanvas = canvas;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false;
    tex.anisotropy = 8;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.groundTexture = tex;
  }

  classAt(x, z) {
    const b = this.coreBox;
    const px = Math.floor((x - b.x0) * this.classScale);
    const py = Math.floor((z - b.z0) * this.classScale);
    if (px < 0 || py < 0 || px >= this.classCanvas.width || py >= this.classCanvas.height) return null;
    const v = this.classData[(py * this.classCanvas.width + px) * 4];
    return v === 0 ? 'gras' : this.ground.classes[v - 1];
  }

  buildTerrainMeshes() {
    const b = this.coreBox;
    const gw = this.gw, gh = this.gh, res = this.gridRes;
    const pos = new Float32Array(gw * gh * 3);
    const uv = new Float32Array(gw * gh * 2);
    for (let r = 0; r < gh; r++) {
      for (let c = 0; c < gw; c++) {
        const i = r * gw + c;
        const x = b.x0 + (c + 0.5) * res, z = b.z0 + (r + 0.5) * res;
        pos[i * 3] = x;
        pos[i * 3 + 1] = this.grid[i] - this.baseHeight;
        pos[i * 3 + 2] = z;
        uv[i * 2] = (x - b.x0) / (b.x1 - b.x0);
        uv[i * 2 + 1] = (z - b.z0) / (b.z1 - b.z0);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(gridIndex(gw, gh));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ map: this.groundTexture, roughness: 0.95, metalness: 0 });
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vWorld;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorld = position.xz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec2 vWorld;
          float gh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float vnoise(vec2 p){
            vec2 i = floor(p), f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(gh(i), gh(i + vec2(1, 0)), f.x), mix(gh(i + vec2(0, 1)), gh(i + vec2(1, 1)), f.x), f.y);
          }`)
        .replace('#include <map_fragment>', `#include <map_fragment>
          {
            vec3 c = diffuseColor.rgb;
            float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
            float sat = (mx - mn) / (mx + 1e-4);
            float paved = 1.0 - smoothstep(0.12, 0.3, sat);
            float green = smoothstep(0.0, 0.05, c.g - c.r) * (1.0 - paved);
            // klinkers / tegels
            vec2 q = vWorld / vec2(0.22, 0.11);
            q.x += step(1.0, mod(floor(q.y), 2.0)) * 0.5;
            vec2 fq = fract(q);
            vec2 w = fwidth(q);
            float fadeP = 1.0 - smoothstep(0.25, 0.6, max(w.x, w.y));
            float joint = smoothstep(0.0, 0.08 + w.x, fq.x) * smoothstep(0.0, 0.12 + w.y, fq.y);
            float stone = 0.9 + gh(floor(q)) * 0.2;
            float asphalt = step(mx, 0.12);
            float pave = mix(1.0, mix(0.82, 1.0, joint) * stone, fadeP * paved * (1.0 - asphalt));
            // asfaltkorrel
            float grit = mix(1.0, 0.9 + gh(floor(vWorld * 12.0)) * 0.2, asphalt * paved * fadeP);
            // grasvlekken
            float gn = vnoise(vWorld * 0.35) * 0.6 + vnoise(vWorld * 1.7) * 0.4;
            float grass = mix(1.0, 0.8 + gn * 0.4, green);
            float blade = mix(1.0, 0.88 + gh(floor(vWorld * 9.0)) * 0.24, green * (1.0 - smoothstep(0.2, 0.5, fwidth(vWorld.x * 9.0))));
            diffuseColor.rgb *= pave * grit * grass * blade;
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.05, 1.08, 0.9), green * (gn - 0.5));
          }`);
    };
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.coreMesh = mesh;

    // Groot terrein rondom: het Heuvelland met akkers en bosranden.
    const { w, h, res: wres } = this.meta.wide;
    const wb = this.wideBox;
    const wpos = new Float32Array(w * h * 3);
    const wcol = new Float32Array(w * h * 3);
    const rand = rng(1999);
    const fieldColors = [
      [0.42, 0.56, 0.25], [0.5, 0.6, 0.28], [0.64, 0.6, 0.36], [0.36, 0.5, 0.22], [0.55, 0.62, 0.3], [0.7, 0.64, 0.4],
    ].map((c) => c.map((v) => Math.pow(v, 2.2)));
    const fieldHash = (x, z) => {
      const fx = Math.floor((x + 13) / 140), fz = Math.floor((z + 7) / 90);
      const hsh = Math.abs(Math.sin(fx * 127.1 + fz * 311.7) * 43758.5453) % 1;
      return fieldColors[Math.floor(hsh * fieldColors.length)];
    };
    const shrink = 30;
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const i = r * w + c;
        const x = wb.x0 + (c + 0.5) * wres, z = wb.z0 + (r + 0.5) * wres;
        let y = this.wideRaw[i] - this.baseHeight;
        const inside = x > b.x0 + shrink && x < b.x1 - shrink && z > b.z0 + shrink && z < b.z1 - shrink;
        if (inside) y -= 4;
        wpos[i * 3] = x; wpos[i * 3 + 1] = y; wpos[i * 3 + 2] = z;
        // helling bepalen
        const hl = this.wideRaw[r * w + Math.max(0, c - 1)], hr = this.wideRaw[r * w + Math.min(w - 1, c + 1)];
        const hu = this.wideRaw[Math.max(0, r - 1) * w + c], hd = this.wideRaw[Math.min(h - 1, r + 1) * w + c];
        const slope = Math.hypot(hr - hl, hd - hu) / (2 * wres);
        let col = fieldHash(x, z);
        if (slope > 0.12) col = [0.07, 0.15, 0.05];
        else if (slope > 0.08) col = [0.12, 0.22, 0.07];
        const n = 0.9 + rand() * 0.2;
        wcol[i * 3] = col[0] * n; wcol[i * 3 + 1] = col[1] * n; wcol[i * 3 + 2] = col[2] * n;
      }
    }
    const wgeo = new THREE.BufferGeometry();
    wgeo.setAttribute('position', new THREE.BufferAttribute(wpos, 3));
    wgeo.setAttribute('color', new THREE.BufferAttribute(wcol, 3));
    wgeo.setIndex(gridIndex(w, h));
    wgeo.computeVertexNormals();
    const wmesh = new THREE.Mesh(wgeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    wmesh.receiveShadow = false;
    this.scene.add(wmesh);

    this.buildHillForest();
  }

  // Bomen op de steile hellingen buiten het dorp, zodat de horizon echt Heuvelland is.
  buildHillForest() {
    const { w, h, res } = this.meta.wide;
    const wb = this.wideBox, b = this.coreBox;
    const pts = [];
    const rand = rng(156);
    for (let r = 1; r < h - 1; r++) {
      for (let c = 1; c < w - 1; c++) {
        const x = wb.x0 + (c + 0.5) * res, z = wb.z0 + (r + 0.5) * res;
        if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) continue;
        const hl = this.wideRaw[r * w + c - 1], hr = this.wideRaw[r * w + c + 1];
        const hu = this.wideRaw[(r - 1) * w + c], hd = this.wideRaw[(r + 1) * w + c];
        const slope = Math.hypot(hr - hl, hd - hu) / (2 * res);
        if (slope > 0.08 && rand() < (this.isMobile ? 0.5 : 0.9)) {
          pts.push([x + (rand() - 0.5) * res, z + (rand() - 0.5) * res, 0.8 + rand() * 0.8]);
        }
      }
    }
    const geo = new THREE.ConeGeometry(4.5, 14, 6, 1);
    geo.translate(0, 6, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x2f4a22, roughness: 1, flatShading: true });
    const inst = new THREE.InstancedMesh(geo, mat, pts.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const col = new THREE.Color();
    pts.forEach(([x, z, sc], i) => {
      p.set(x, this.heightAt(x, z) - 4 * 0, z);
      // wide terrein ligt rond de kern lager; gebruik de ruwe brede hoogte
      p.y = this.bilinear(this.wideRaw, w, h, (x - wb.x0) / res - 0.5, (z - wb.z0) / res - 0.5) - this.baseHeight - 1;
      s.set(sc * 1.4, sc, sc * 1.4);
      m.compose(p, q, s);
      inst.setMatrixAt(i, m);
      col.setHSL(0.27 + rand() * 0.06, 0.4, 0.17 + rand() * 0.08);
      inst.setColorAt(i, col);
    });
    this.scene.add(inst);
  }

  // ------------------------------------------------------------ gebouwen

  buildBuildings(buf) {
    const stride = 28;
    const n = buf.byteLength / stride;
    const f32 = new Float32Array(buf);
    const i8 = new Int8Array(buf);
    const u8 = new Uint8Array(buf);
    const fb = new THREE.InterleavedBuffer(f32, 7);
    const ib = new THREE.InterleavedBuffer(i8, stride);
    const ub = new THREE.InterleavedBuffer(u8, stride);
    // hoogtes relatief maken
    for (let i = 0; i < n; i++) f32[i * 7 + 1] -= this.baseHeight;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.InterleavedBufferAttribute(fb, 3, 0));
    geo.setAttribute('uv', new THREE.InterleavedBufferAttribute(fb, 2, 3));
    geo.setAttribute('normal', new THREE.InterleavedBufferAttribute(ib, 3, 20, true));
    geo.setAttribute('btype', new THREE.InterleavedBufferAttribute(ib, 1, 23, false));
    geo.setAttribute('battr', new THREE.InterleavedBufferAttribute(ub, 4, 24, false));
    geo.computeBoundingSphere();

    const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
    const night = this.nightUniform;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uNight = night;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          attribute float btype;
          attribute vec4 battr;
          varying vec2 vB;
          varying float vType;
          varying vec3 vBase;
          varying float vSeed;
          varying vec3 vWN;
          vec3 srgb(vec3 c){ return pow(c, vec3(2.2)); }
          vec3 pick3(float h, vec3 a, vec3 b, vec3 c){ return h < 0.34 ? a : (h < 0.67 ? b : c); }
          vec3 pick4(float h, vec3 a, vec3 b, vec3 c, vec3 d){ return h < 0.25 ? a : (h < 0.5 ? b : (h < 0.75 ? c : d)); }`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vB = uv;
          vType = btype;
          vSeed = battr.x / 255.0;
          vWN = normal;
          float h = fract(vSeed * 7.13);
          vec3 mergel = srgb(vec3(0.82, 0.74, 0.57));
          vec3 wit = srgb(vec3(0.9, 0.88, 0.82));
          vec3 rood = srgb(vec3(0.58, 0.3, 0.21));
          vec3 bruin = srgb(vec3(0.46, 0.29, 0.21));
          vec3 geel = srgb(vec3(0.77, 0.64, 0.45));
          vec3 grijs = srgb(vec3(0.7, 0.68, 0.63));
          if (btype < 0.5) {
            if (battr.y < 0.5) vBase = pick4(h, wit, mergel, wit, mergel);
            else if (battr.y < 1.5) vBase = pick4(h, wit, rood, mergel, bruin);
            else vBase = pick4(h, bruin, geel, wit, grijs);
          } else {
            vec3 lei = srgb(vec3(0.31, 0.32, 0.36));
            vec3 pan = srgb(vec3(0.52, 0.24, 0.17));
            vec3 antraciet = srgb(vec3(0.24, 0.24, 0.25));
            vBase = pick3(fract(vSeed * 3.71), lei, pan, antraciet);
            if (normal.y > 0.97) vBase = srgb(vec3(0.36, 0.36, 0.35));
          }`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform float uNight;
          varying vec2 vB;
          varying float vType;
          varying vec3 vBase;
          varying float vSeed;
          varying vec3 vWN;
          float hash2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float boxMask(vec2 f, vec2 lo, vec2 hi, vec2 aa){
            vec2 a = smoothstep(lo - aa, lo + aa, f) * (1.0 - smoothstep(hi - aa, hi + aa, f));
            return a.x * a.y;
          }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec3 base = vBase;
          float glass = 0.0;
          float lit = 0.0;
          if (vType < 0.5) {
            float hgt = vB.y;
            vec2 cell = vec2(vB.x / 2.8, hgt / 2.9);
            vec2 id = floor(cell);
            vec2 f = fract(cell);
            vec2 aa = fwidth(cell) * 1.2;
            float r = hash2(id + vSeed * 91.0);
            float win = boxMask(f, vec2(0.33, 0.36), vec2(0.67, 0.82), aa);
            float frame = boxMask(f, vec2(0.31, 0.34), vec2(0.69, 0.84), aa) - win;
            float sill = boxMask(f, vec2(0.3, 0.31), vec2(0.7, 0.345), aa);
            float allowed = step(0.12, r) * step(0.5, hgt);
            glass = win * allowed;
            base = mix(base, vec3(0.85, 0.83, 0.78), frame * allowed * 0.9);
            base = mix(base, vec3(0.62, 0.6, 0.56), sill * allowed);
            float sky = smoothstep(0.36, 0.82, f.y);
            base = mix(base, mix(vec3(0.05, 0.065, 0.08), vec3(0.16, 0.2, 0.26), sky), glass);
            lit = glass * step(r, 0.62) * uNight;
            // donkere plint en wat vuil onderaan
            base *= mix(0.55, 1.0, smoothstep(0.0, 0.9, hgt));
          } else {
            vec2 dir = normalize(vWN.xz + 1e-4);
            float s = dot(vB, vec2(dir.x, -dir.y)) / 0.33;
            float ln = smoothstep(0.0, 0.18 + fwidth(s), fract(s));
            if (vWN.y < 0.97) base *= mix(0.72, 1.0, ln);
          }
          float grain = hash2(floor(vB * 6.0) + vSeed) * 0.08;
          diffuseColor.rgb = base * (0.96 + grain);`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.12, glass);`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += vec3(1.0, 0.6, 0.26) * lit * (0.55 + 0.35 * fract(vSeed * 13.7));`);
    };
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.buildingMesh = mesh;
  }

  // ------------------------------------------------------------ botsingen

  setupCollision(footprints) {
    this.footprints = footprints.map((f) => {
      const ring = f.ring;
      let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
      for (const [x, z] of ring) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
      }
      return { ring, minX, minZ, maxX, maxZ };
    });
    this.cell = 16;
    this.cells = new Map();
    this.footprints.forEach((f, idx) => {
      for (let cx = Math.floor(f.minX / this.cell); cx <= Math.floor(f.maxX / this.cell); cx++) {
        for (let cz = Math.floor(f.minZ / this.cell); cz <= Math.floor(f.maxZ / this.cell); cz++) {
          const k = cx + ',' + cz;
          if (!this.cells.has(k)) this.cells.set(k, []);
          this.cells.get(k).push(idx);
        }
      }
    });
  }

  nearbyFootprints(x, z) {
    const out = new Set();
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const list = this.cells.get(cx + dx + ',' + (cz + dz));
      if (list) list.forEach((i) => out.add(i));
    }
    return out;
  }

  insideBuilding(x, z) {
    for (const i of this.nearbyFootprints(x, z)) if (pointInRing(x, z, this.footprints[i].ring)) return true;
    return false;
  }

  // duwt een cirkel (x,z,r) uit gebouwen; geeft gecorrigeerde positie terug
  resolve(x, z, r) {
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const i of this.nearbyFootprints(x, z)) {
        const f = this.footprints[i];
        if (x < f.minX - r || x > f.maxX + r || z < f.minZ - r || z > f.maxZ + r) continue;
        const inside = pointInRing(x, z, f.ring);
        let best = Infinity, bx = 0, bz = 0;
        const ring = f.ring;
        for (let k = 0; k < ring.length; k++) {
          const [ax, az] = ring[k], [qx, qz] = ring[(k + 1) % ring.length];
          const ex = qx - ax, ez = qz - az;
          const len2 = ex * ex + ez * ez || 1;
          let t = ((x - ax) * ex + (z - az) * ez) / len2;
          t = Math.max(0, Math.min(1, t));
          const px = ax + ex * t, pz = az + ez * t;
          const d = Math.hypot(x - px, z - pz);
          if (d < best) { best = d; bx = px; bz = pz; }
        }
        if (inside) {
          const dx = bx - x, dz = bz - z;
          const d = Math.hypot(dx, dz) || 1;
          x = bx + (dx / d) * r; z = bz + (dz / d) * r;
          moved = true;
        } else if (best < r) {
          const dx = x - bx, dz = z - bz;
          const d = best || 1;
          x = bx + (dx / d) * r; z = bz + (dz / d) * r;
          moved = true;
        }
      }
      if (!moved) break;
    }
    const b = this.coreBox, m = 15;
    x = Math.max(b.x0 + m, Math.min(b.x1 - m, x));
    z = Math.max(b.z0 + m, Math.min(b.z1 - m, z));
    return [x, z];
  }

  // ------------------------------------------------------------ bomen en straatmeubilair

  buildTrees() {
    const rand = rng(2072);
    const pts = this.objects.trees.map(([x, z]) => [x, z, 0.75 + rand() * 0.6, 0]);
    // extra bomen in bospercelen binnen het dorp
    const b = this.coreBox;
    const extra = this.isMobile ? 2500 : 5000;
    let tries = 0, added = 0;
    while (added < extra && tries < extra * 30) {
      tries++;
      const x = b.x0 + rand() * (b.x1 - b.x0), z = b.z0 + rand() * (b.z1 - b.z0);
      const cls = this.classAt(x, z);
      if (cls === 'bos' || (cls === 'struiken' && rand() < 0.3)) {
        pts.push([x, z, 0.8 + rand() * 0.7, 1]);
        added++;
      }
    }
    this.treePoints = pts;

    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 3.2, 5);
    trunkGeo.translate(0, 1.6, 0);
    const canopyGeo = mergeBlobs(rand);
    const trunk = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 1 }), pts.length);
    const canopy = new THREE.InstancedMesh(
      canopyGeo,
      new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }),
      pts.length,
    );
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    pts.forEach(([x, z, sc, kind], i) => {
      p.set(x, this.heightAt(x, z) - 0.1, z);
      q.setFromAxisAngle(up, rand() * Math.PI * 2);
      s.set(sc, sc * (0.9 + rand() * 0.3), sc);
      m.compose(p, q, s);
      trunk.setMatrixAt(i, m);
      canopy.setMatrixAt(i, m);
      if (kind === 1) col.setHSL(0.26 + rand() * 0.05, 0.45, 0.2 + rand() * 0.07);
      else col.setHSL(0.22 + rand() * 0.08, 0.45 + rand() * 0.15, 0.26 + rand() * 0.1);
      canopy.setColorAt(i, col);
    });
    trunk.castShadow = true;
    canopy.castShadow = true;
    canopy.receiveShadow = true;
    this.scene.add(trunk, canopy);
  }

  buildProps() {
    // bankjes
    const benches = this.objects.furniture.filter((f) => f[0] === 'bank' || f[0] === 'picknicktafel');
    const benchGeo = new THREE.BoxGeometry(1.8, 0.45, 0.6);
    benchGeo.translate(0, 0.45, 0);
    const bench = new THREE.InstancedMesh(benchGeo, new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.8 }), benches.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const rand = rng(42);
    benches.forEach(([, x, z], i) => {
      p.set(x, this.heightAt(x, z), z);
      q.setFromAxisAngle(up, rand() * Math.PI);
      m.compose(p, q, s);
      bench.setMatrixAt(i, m);
    });
    bench.castShadow = true;
    this.scene.add(bench);

    // lantaarnpalen, die 's avonds gaan branden
    const lights = this.objects.lights;
    const poleGeo = new THREE.CylinderGeometry(0.07, 0.1, 5, 6);
    poleGeo.translate(0, 2.5, 0);
    const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.6, metalness: 0.4 }), lights.length);
    const lampGeo = new THREE.SphereGeometry(0.28, 10, 8);
    lampGeo.translate(0, 5.05, 0);
    this.lampMaterial = new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: 0xffc070, emissiveIntensity: 0 });
    const lamps = new THREE.InstancedMesh(lampGeo, this.lampMaterial, lights.length);
    lights.forEach(([x, z], i) => {
      p.set(x, this.heightAt(x, z), z);
      m.compose(p, new THREE.Quaternion(), s);
      poles.setMatrixAt(i, m);
      lamps.setMatrixAt(i, m);
    });
    poles.castShadow = true;
    this.scene.add(poles, lamps);

    // lichtvlekken op de grond (goedkoop alternatief voor echte lampen)
    const glowTex = radialTexture();
    this.glowMaterial = new THREE.MeshBasicMaterial({
      map: glowTex, color: 0xffb760, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const glowGeo = new THREE.PlaneGeometry(14, 14);
    glowGeo.rotateX(-Math.PI / 2);
    const glows = new THREE.InstancedMesh(glowGeo, this.glowMaterial, lights.length);
    lights.forEach(([x, z], i) => {
      p.set(x, this.heightAt(x, z) + 0.08, z);
      m.compose(p, new THREE.Quaternion(), s);
      glows.setMatrixAt(i, m);
    });
    this.scene.add(glows);
  }

  setNight(t) {
    this.nightUniform.value = t;
    if (this.lampMaterial) this.lampMaterial.emissiveIntensity = t * 3;
    if (this.glowMaterial) this.glowMaterial.opacity = t * 0.55;
  }

  // ------------------------------------------------------------ straatnamen

  buildStreetIndex() {
    this.segments = [];
    for (const [name, line] of this.roads) {
      if (!name) continue;
      for (let i = 0; i < line.length - 2; i += 2) {
        this.segments.push([name, line[i], line[i + 1], line[i + 2], line[i + 3]]);
      }
    }
  }

  // dichtstbijzijnde straat; geeft {name, x, z, dist}
  nearestStreet(x, z, filter) {
    let best = null;
    for (const [name, ax, az, bx, bz] of this.segments) {
      if (filter && name !== filter) continue;
      const ex = bx - ax, ez = bz - az;
      const len2 = ex * ex + ez * ez || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / len2));
      const px = ax + ex * t, pz = az + ez * t;
      const d = Math.hypot(x - px, z - pz);
      if (!best || d < best.dist) best = { name, x: px, z: pz, dist: d };
    }
    return best;
  }

  // alle lijnstukken van één straat als aaneengesloten route
  streetPath(name) {
    const pieces = this.roads.filter(([n]) => n === name).map(([, l]) => {
      const pts = [];
      for (let i = 0; i < l.length; i += 2) pts.push([l[i], l[i + 1]]);
      return pts;
    });
    if (!pieces.length) return [];
    const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1.5;
    let chains = pieces.map((p) => p.slice());
    let merged = true;
    while (merged) {
      merged = false;
      outer: for (let i = 0; i < chains.length; i++) {
        for (let j = 0; j < chains.length; j++) {
          if (i === j) continue;
          const a = chains[i], b = chains[j];
          let joined = null;
          if (near(a[a.length - 1], b[0])) joined = a.concat(b.slice(1));
          else if (near(a[a.length - 1], b[b.length - 1])) joined = a.concat(b.slice(0, -1).reverse());
          else if (near(a[0], b[b.length - 1])) joined = b.concat(a.slice(1));
          else if (near(a[0], b[0])) joined = b.slice().reverse().concat(a.slice(1));
          if (joined) {
            chains = chains.filter((_, k) => k !== i && k !== j);
            chains.push(joined);
            merged = true;
            break outer;
          }
        }
      }
    }
    const length = (c) => c.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - c[i - 1][0], p[1] - c[i - 1][1]) : 0), 0);
    chains.sort((a, b) => length(b) - length(a));
    return chains[0];
  }

  // vrij plekje op straat bij een adres, voor NPC's
  spotNear(x, z) {
    const s = this.nearestStreet(x, z);
    if (!s) return [x, z];
    // vanaf de weg een stukje richting het adres, maar niet in een gebouw
    const dx = x - s.x, dz = z - s.z;
    const d = Math.hypot(dx, dz) || 1;
    let best = [s.x, s.z];
    for (let t = 0; t < Math.min(d, 12); t += 0.5) {
      const px = s.x + (dx / d) * t, pz = s.z + (dz / d) * t;
      if (this.insideBuilding(px, pz)) break;
      best = [px, pz];
    }
    const back = Math.max(0, Math.hypot(best[0] - s.x, best[1] - s.z) - 1.2);
    return this.resolve(s.x + (dx / d) * back, s.z + (dz / d) * back, 0.6);
  }
}

// ------------------------------------------------------------ hulpfuncties

function gridIndex(w, h) {
  const idx = new Uint32Array((w - 1) * (h - 1) * 6);
  let k = 0;
  for (let r = 0; r < h - 1; r++) {
    for (let c = 0; c < w - 1; c++) {
      const a = r * w + c, b = a + 1, d = a + w, e = d + 1;
      idx[k++] = a; idx[k++] = d; idx[k++] = b;
      idx[k++] = b; idx[k++] = d; idx[k++] = e;
    }
  }
  return new THREE.BufferAttribute(idx, 1);
}

export function pointInRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function mergeBlobs(rand) {
  const parts = [
    [0, 4.6, 0, 2.4], [0.9, 4.1, 0.6, 1.8], [-0.8, 4.3, -0.5, 1.9], [0.1, 5.7, -0.1, 1.6],
  ];
  const positions = [];
  for (const [x, y, z, r] of parts) {
    const g = new THREE.IcosahedronGeometry(r, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const j = 1 + (Math.sin(p.getX(i) * 3.1 + p.getY(i) * 2.3) * 0.08);
      positions.push(p.getX(i) * j + x, p.getY(i) * j + y, p.getZ(i) * j + z);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

function radialTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
