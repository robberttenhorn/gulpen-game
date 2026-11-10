// Hulpfuncties voor de mocap-bakker: BVH inlezen en voorwaartse kinematica.
// Wordt alleen door tools/bake-mocap.mjs gebruikt (niet door de game zelf).
import * as THREE from 'three';

// CMU-eenheden naar meters: de ASF-bestanden van CMU rekenen in inches gedeeld door 0,45.
export const CMU_M = (1 / 0.45) * 0.0254;

// Leest een BVH-bestand. Geeft { joints, frames, frameTime }.
// joints: [{ name, parent, offset: Vector3, channels: [...], chOffset }], frames: Float32Array per frame.
export function parseBVH(text) {
  const tok = text.split(/\s+/).filter(Boolean);
  let i = 0;
  const joints = [];
  let nCh = 0;
  const stack = [];
  const next = () => tok[i++];
  if (next() !== 'HIERARCHY') throw new Error('geen BVH');
  while (i < tok.length) {
    const t = next();
    if (t === 'ROOT' || t === 'JOINT') {
      const j = { name: next(), parent: stack.length ? stack[stack.length - 1] : -1, offset: null, channels: [], chOffset: 0, end: null };
      joints.push(j);
      stack.push(joints.length - 1);
      next(); // {
    } else if (t === 'OFFSET') {
      const v = new THREE.Vector3(+next(), +next(), +next());
      const cur = joints[stack[stack.length - 1]];
      if (cur.inEnd) cur.end = v; else cur.offset = v;
    } else if (t === 'CHANNELS') {
      const n = +next();
      const cur = joints[stack[stack.length - 1]];
      cur.chOffset = nCh;
      for (let k = 0; k < n; k++) cur.channels.push(next());
      nCh += n;
    } else if (t === 'End') {
      next(); next(); // Site {
      joints[stack[stack.length - 1]].inEnd = true;
    } else if (t === '}') {
      const cur = joints[stack[stack.length - 1]];
      if (cur.inEnd) cur.inEnd = false; else stack.pop();
    } else if (t === 'MOTION') break;
  }
  if (next() !== 'Frames:') throw new Error('Frames: verwacht');
  const nFrames = +next();
  next(); next(); // Frame Time:
  const frameTime = +next();
  const frames = [];
  for (let f = 0; f < nFrames; f++) {
    const a = new Float32Array(nCh);
    for (let k = 0; k < nCh; k++) a[k] = +tok[i++];
    frames.push(a);
  }
  const byName = {};
  joints.forEach((j, k) => { byName[j.name] = k; });
  return { joints, frames, frameTime, byName };
}

const AX = { X: new THREE.Vector3(1, 0, 0), Y: new THREE.Vector3(0, 1, 0), Z: new THREE.Vector3(0, 0, 1) };
const D2R = Math.PI / 180;

// Voorwaartse kinematica voor één frame: wereldpositie (in CMU-eenheden) en wereldrotatie per gewricht.
export function fk(bvh, f) {
  const fr = bvh.frames[f];
  const pos = [], rot = [];
  const q = new THREE.Quaternion();
  bvh.joints.forEach((j, k) => {
    const local = new THREE.Quaternion();
    const p = j.offset.clone();
    j.channels.forEach((c, ci) => {
      const v = fr[j.chOffset + ci];
      if (c === 'Xposition') p.x = v; else if (c === 'Yposition') p.y = v; else if (c === 'Zposition') p.z = v;
      else local.multiply(q.setFromAxisAngle(AX[c[0]], v * D2R));
    });
    if (j.parent < 0) { pos[k] = p; rot[k] = local; }
    else {
      pos[k] = p.applyQuaternion(rot[j.parent]).add(pos[j.parent]);
      rot[k] = rot[j.parent].clone().multiply(local);
    }
  });
  return { pos, rot };
}

// positie van het eindpunt (End Site) van een gewricht
export function endPos(bvh, pose, name) {
  const k = bvh.byName[name];
  return bvh.joints[k].end.clone().applyQuaternion(pose.rot[k]).add(pose.pos[k]);
}
