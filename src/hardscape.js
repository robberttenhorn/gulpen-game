// Strakke bestrating: wegen, stoepen met echte stoepranden, fietspaden, parkeervakken,
// wegmarkering en water. Gebouwd als losse meshes die het terrein volgen.
import * as THREE from 'three';
import { Earcut } from 'three/src/extras/Earcut.js';
import { makeTextures } from './textures.js';

// klasse -> [texture, wereldmaat van één herhaling in meters, hoogte boven terrein, polygonOffset]
const LAYERS = {
  erf: ['erf', 1.26, 0.03, -1],
  verhard_open: ['erf', 1.26, 0.03, -1],
  verhard_gesloten: ['asfalt', 4, 0.03, -1],
  parkeer: ['parkeer', 1.68, 0.035, -2],
  klinkers: ['klinkers', 0.84, 0.04, -2],
  rijbaan: ['asfalt', 4, 0.04, -3],
  fietspad: ['fietspad', 4, 0.05, -4],
  voetpad: ['tegels', 1.2, 0.14, -5],
  brug: ['klinkers', 0.84, 0.12, -6],
};
const CURB_H = 0.14;

export function buildHardscape(world, scene) {
  const tx = makeTextures(world.isMobile);
  const classes = world.ground.classes;
  const buckets = {};
  const curbs = [];
  const water = [];
  const maxEdge = world.isMobile ? 3.5 : 2.5;

  for (const [cls, rings] of world.ground.polys) {
    const name = classes[cls];
    if (name === 'water') { water.push(rings); continue; }
    const layer = LAYERS[name];
    if (!layer) continue;
    (buckets[name] ||= []).push(rings);
    if (name === 'voetpad') curbs.push(rings);
  }

  const meshes = [];
  for (const [name, polys] of Object.entries(buckets)) {
    const [texName, size, lift, offset] = LAYERS[name];
    const geo = drapePolys(world, polys, lift, size, maxEdge);
    if (!geo) continue;
    const t = tx[texName];
    const mat = new THREE.MeshStandardMaterial({
      map: t.map, normalMap: t.normalMap || null, roughness: name === 'rijbaan' ? 0.88 : 0.82, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: offset, polygonOffsetUnits: offset * 2,
    });
    if (t.normalMap) mat.normalScale.set(0.8, 0.8);
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    scene.add(m);
    meshes.push(m);
  }

  // stoepranden: verticale randjes langs de stoepen
  const curbGeo = buildCurbs(world, curbs);
  if (curbGeo) {
    const m = new THREE.Mesh(curbGeo, new THREE.MeshStandardMaterial({ map: tx.band.map, color: 0xd8d4cc, roughness: 0.7 }));
    m.receiveShadow = true;
    m.castShadow = false;
    scene.add(m);
  }

  // water
  const wgeo = drapePolys(world, water, 0.05, 6, maxEdge);
  let waterMat = null;
  if (wgeo) {
    const wn = waterNormals();
    waterMat = new THREE.MeshStandardMaterial({
      color: 0x24414c, roughness: 0.06, metalness: 0.1, normalMap: wn, envMapIntensity: 1.2,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    });
    waterMat.normalScale.set(0.35, 0.35);
    const m = new THREE.Mesh(wgeo, waterMat);
    m.receiveShadow = true;
    scene.add(m);
  }

  // wegmarkering
  const marks = buildMarkings(world);
  if (marks) {
    const m = new THREE.Mesh(marks, new THREE.MeshStandardMaterial({
      color: 0xf2f0e8, roughness: 0.6, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -12,
    }));
    m.receiveShadow = true;
    scene.add(m);
  }

  return {
    update(dt) {
      if (waterMat) {
        waterMat.normalMap.offset.x += dt * 0.02;
        waterMat.normalMap.offset.y += dt * 0.035;
      }
    },
  };
}

// ------------------------------------------------------------ geometrie

function drapePolys(world, polys, lift, uvSize, maxEdge) {
  const pos = [], nrm = [], uv = [];
  const n = new THREE.Vector3();
  const pushV = (x, z) => {
    const y = world.heightAt(x, z) + lift;
    pos.push(x, y, z);
    // normaal uit de hellingsgraad van het terrein
    const e = 1.5;
    const hx = world.heightAt(x + e, z) - world.heightAt(x - e, z);
    const hz = world.heightAt(x, z + e) - world.heightAt(x, z - e);
    n.set(-hx / (2 * e), 1, -hz / (2 * e)).normalize();
    nrm.push(n.x, n.y, n.z);
    uv.push(x / uvSize, z / uvSize);
  };
  // adaptief verfijnen: alleen opdelen waar het terrein krom is of de driehoek erg groot
  const max2 = (maxEdge * 4) ** 2, min2 = maxEdge * maxEdge;
  const bends = (ax, az, bx, bz) => {
    const mid = world.heightAt((ax + bx) / 2, (az + bz) / 2);
    return Math.abs(mid - (world.heightAt(ax, az) + world.heightAt(bx, bz)) / 2) > 0.025;
  };
  const tri = (ax, az, bx, bz, cx, cz, depth) => {
    const ab = (ax - bx) ** 2 + (az - bz) ** 2;
    const bc = (bx - cx) ** 2 + (bz - cz) ** 2;
    const ca = (cx - ax) ** 2 + (cz - az) ** 2;
    const m = Math.max(ab, bc, ca);
    let split = m > max2;
    if (!split && m > min2) {
      split = m === ab ? bends(ax, az, bx, bz) : m === bc ? bends(bx, bz, cx, cz) : bends(cx, cz, ax, az);
      if (!split) {
        const gx = (ax + bx + cx) / 3, gz = (az + bz + cz) / 3;
        split = Math.abs(world.heightAt(gx, gz) - (world.heightAt(ax, az) + world.heightAt(bx, bz) + world.heightAt(cx, cz)) / 3) > 0.025;
      }
    }
    if (split && depth < 14) {
      if (m === ab) {
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        tri(ax, az, mx, mz, cx, cz, depth + 1); tri(mx, mz, bx, bz, cx, cz, depth + 1);
      } else if (m === bc) {
        const mx = (bx + cx) / 2, mz = (bz + cz) / 2;
        tri(ax, az, bx, bz, mx, mz, depth + 1); tri(ax, az, mx, mz, cx, cz, depth + 1);
      } else {
        const mx = (cx + ax) / 2, mz = (cz + az) / 2;
        tri(ax, az, bx, bz, mx, mz, depth + 1); tri(mx, mz, bx, bz, cx, cz, depth + 1);
      }
      return;
    }
    // driehoek met de klok mee gezien van boven (y omhoog, z naar het zuiden) => normaal omhoog
    const cross = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
    if (cross > 0) { pushV(ax, az); pushV(cx, cz); pushV(bx, bz); }
    else { pushV(ax, az); pushV(bx, bz); pushV(cx, cz); }
  };
  for (const rings of polys) {
    const flat = [], holes = [];
    for (const ring of rings) {
      if (flat.length) holes.push(flat.length / 2);
      // laatste punt is gelijk aan het eerste; overslaan
      const len = ring.length >= 4 && ring[0] === ring[ring.length - 2] && ring[1] === ring[ring.length - 1] ? ring.length - 2 : ring.length;
      for (let i = 0; i < len; i++) flat.push(ring[i]);
    }
    const idx = Earcut.triangulate(flat, holes, 2);
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i] * 2, b = idx[i + 1] * 2, c = idx[i + 2] * 2;
      tri(flat[a], flat[a + 1], flat[b], flat[b + 1], flat[c], flat[c + 1], 0);
    }
  }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeBoundingSphere();
  return geo;
}

function buildCurbs(world, polys) {
  const pos = [], uv = [], nrm = [];
  const step = 3;
  for (const rings of polys) {
    for (const ring of rings) {
      for (let i = 0; i < ring.length - 2; i += 2) {
        const ax = ring[i], az = ring[i + 1], bx = ring[i + 2], bz = ring[i + 3];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 0.05) continue;
        const nx = (bz - az) / len, nz = -(bx - ax) / len;
        const parts = Math.max(1, Math.ceil(len / step));
        for (let k = 0; k < parts; k++) {
          const t0 = k / parts, t1 = (k + 1) / parts;
          const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0;
          const x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
          const g0 = world.heightAt(x0, z0), g1 = world.heightAt(x1, z1);
          const v = [
            [x0, g0 - 0.05, z0], [x1, g1 - 0.05, z1], [x1, g1 + CURB_H, z1],
            [x0, g0 - 0.05, z0], [x1, g1 + CURB_H, z1], [x0, g0 + CURB_H, z0],
          ];
          // beide kanten zichtbaar maken door dubbel te tekenen (ringen kunnen beide kanten op lopen)
          for (const flip of [false, true]) {
            const order = flip ? [0, 2, 1, 3, 5, 4] : [0, 1, 2, 3, 4, 5];
            for (const o of order) {
              pos.push(...v[o]);
              const s = flip ? -1 : 1;
              nrm.push(nx * s, 0, nz * s);
              uv.push((o === 1 || o === 2 || o === 4 ? len / parts : 0) * 2, v[o][1] - g0);
            }
          }
        }
      }
    }
  }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geo;
}

// Witte middenstreep op wegen die breed genoeg zijn.
function buildMarkings(world) {
  const pos = [];
  const dash = 3, gap = 9, w = 0.12;
  for (const [name, ax, az, bx, bz] of world.segments) {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 4) continue;
    const dx = (bx - ax) / len, dz = (bz - az) / len;
    const px = -dz, pz = dx;
    for (let s = 1; s + dash < len; s += dash + gap) {
      const cx = ax + dx * (s + dash / 2), cz = az + dz * (s + dash / 2);
      if (world.classAt(cx, cz) !== 'rijbaan') continue;
      if (world.classAt(cx + px * 2.8, cz + pz * 2.8) !== 'rijbaan' || world.classAt(cx - px * 2.8, cz - pz * 2.8) !== 'rijbaan') continue;
      const x0 = ax + dx * s, z0 = az + dz * s, x1 = ax + dx * (s + dash), z1 = az + dz * (s + dash);
      const h0 = world.heightAt(x0, z0) + 0.06, h1 = world.heightAt(x1, z1) + 0.06;
      const q = [
        [x0 + px * w, h0, z0 + pz * w], [x0 - px * w, h0, z0 - pz * w], [x1 - px * w, h1, z1 - pz * w],
        [x0 + px * w, h0, z0 + pz * w], [x1 - px * w, h1, z1 - pz * w], [x1 + px * w, h1, z1 + pz * w],
      ];
      for (const v of q) pos.push(...v);
    }
  }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const nn = new Float32Array(pos.length);
  for (let i = 1; i < nn.length; i += 3) nn[i] = 1;
  geo.setAttribute('normal', new THREE.BufferAttribute(nn, 3));
  return geo;
}

function waterNormals() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2, v = (y / size) * Math.PI * 2;
      const dx = Math.cos(u * 3 + Math.sin(v * 2)) * 0.5 + Math.cos(u * 7 + v * 3) * 0.25;
      const dy = Math.sin(v * 4 + Math.cos(u * 2)) * 0.5 + Math.sin(v * 9 - u * 2) * 0.2;
      const i = (y * size + x) * 4;
      img.data[i] = (dx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (dy * 0.5 + 0.5) * 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 1);
  return t;
}

// Hoogte van het loopoppervlak (stoepen liggen iets hoger dan de weg).
export function surfaceLift(world, x, z) {
  const c = world.classAt(x, z);
  if (c === 'voetpad') return CURB_H;
  if (c === 'brug') return 0.12;
  return 0;
}
