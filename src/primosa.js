// De glazen piramide Primosa aan de Landsraderweg 7. In de gebouwendata (3D BAG) staat hij als een
// dichte piramidevorm; die vervangen we door een glazen piramide met een ruitjespatroon, zoals die van het Louvre.
// Binnen hangt het 'topstuk' van de tentoonstelling: de Mona Liesje.
import * as THREE from 'three';

function pointInRing(x, z, r) {
  let inside = false;
  for (let a = 0, b = r.length - 1; a < r.length; b = a++) {
    if ((r[a][1] > z) !== (r[b][1] > z) && x < ((r[b][0] - r[a][0]) * (z - r[a][1])) / (r[b][1] - r[a][1]) + r[a][0]) inside = !inside;
  }
  return inside;
}

// Mona Liesje: een verbasterde kopie van een beroemd schilderij (zelf getekend)
function paintingTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 360;
  const x = c.getContext('2d');
  const sky = x.createLinearGradient(0, 0, 0, 360);
  sky.addColorStop(0, '#6f7f5a'); sky.addColorStop(0.5, '#8a7a4a'); sky.addColorStop(1, '#3d3220');
  x.fillStyle = sky; x.fillRect(0, 0, 256, 360);
  // landschap met een kronkelweggetje (de Gulp?)
  x.strokeStyle = '#a8a070'; x.lineWidth = 6; x.beginPath(); x.moveTo(20, 150); x.bezierCurveTo(60, 120, 30, 100, 70, 80); x.stroke();
  // haar en gezicht
  x.fillStyle = '#2a1c10'; x.beginPath(); x.ellipse(128, 130, 62, 78, 0, 0, 7); x.fill();
  x.fillStyle = '#d9b07a'; x.beginPath(); x.ellipse(128, 128, 40, 52, 0, 0, 7); x.fill();
  // ogen die je overal volgen
  x.fillStyle = '#2a1c10'; x.beginPath(); x.ellipse(113, 120, 5, 3, 0, 0, 7); x.ellipse(143, 120, 5, 3, 0, 0, 7); x.fill();
  // dé glimlach (een beetje scheef)
  x.strokeStyle = '#7a3a2a'; x.lineWidth = 3; x.beginPath(); x.moveTo(114, 152); x.quadraticCurveTo(130, 160, 146, 148); x.stroke();
  // lijf en handen
  x.fillStyle = '#1e2a1e'; x.beginPath(); x.moveTo(60, 360); x.lineTo(80, 200); x.quadraticCurveTo(128, 175, 176, 200); x.lineTo(196, 360); x.fill();
  x.fillStyle = '#d9b07a'; x.beginPath(); x.ellipse(118, 300, 30, 14, -0.2, 0, 7); x.ellipse(146, 306, 30, 14, 0.2, 0, 7); x.fill();
  // craquelé
  x.strokeStyle = 'rgba(0,0,0,0.12)'; x.lineWidth = 1;
  for (let i = 0; i < 60; i++) { const a = Math.random() * 256, b = Math.random() * 360; x.beginPath(); x.moveTo(a, b); x.lineTo(a + (Math.random() - 0.5) * 30, b + (Math.random() - 0.5) * 30); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function plateTexture(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = '#f5efe0'; x.fillRect(0, 0, 512, 96);
  x.fillStyle = '#222'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = 'italic 700 38px Georgia, serif'; x.fillText(text, 256, 36);
  x.font = '24px Georgia, serif'; x.fillText('olieverf op doek, waarde onbekend', 256, 74);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildPrimosa(fac, pos) {
  const w = fac.world;
  const scene = fac.scene || w.scene;
  // het pand op het adres
  let fp = null;
  for (const i of w.nearbyFootprints(...pos)) if (pointInRing(pos[0], pos[1], w.footprints[i].ring)) fp = w.footprints[i];
  if (!fp) {
    let bd = 25;
    for (const i of w.nearbyFootprints(...pos)) {
      const f = w.footprints[i];
      const d = Math.hypot((f.minX + f.maxX) / 2 - pos[0], (f.minZ + f.maxZ) / 2 - pos[1]);
      if (d < bd) { bd = d; fp = f; }
    }
  }
  if (!fp || !w.bld) return null;
  const ring = fp.ring;
  // top van de piramide: het hoogste punt van het gebouw in de data
  const { f32, n } = w.bld;
  let apex = null;
  for (let i = 0; i < n; i++) {
    const x = f32[i * 7], y = f32[i * 7 + 1], z = f32[i * 7 + 2];
    if (x < fp.minX || x > fp.maxX || z < fp.minZ || z > fp.maxZ || !pointInRing(x, z, ring)) continue;
    if (!apex || y > apex[1]) apex = [x, y, z];
  }
  if (!apex) return null;
  // oriëntatie: de langste gevel
  let best = 0, ux = 1, uz = 0;
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length];
    const l = Math.hypot(bx - ax, bz - az);
    if (l > best) { best = l; ux = (bx - ax) / l; uz = (bz - az) / l; }
  }
  const vx = -uz, vz = ux;
  // halve breedte: hoe ver de gevels vanaf de top liggen (langs beide assen), afgerond naar binnen
  const ext = (dx, dz) => ring.map(([x, z]) => Math.abs((x - apex[0]) * dx + (z - apex[2]) * dz));
  const eu = ext(ux, uz).sort((a, b) => b - a), ev = ext(vx, vz).sort((a, b) => b - a);
  const half = Math.max(8, Math.min(eu[1], ev[1], 20));
  const y0 = w.groundAt(apex[0], apex[2]);
  const height = Math.max(8, apex[1] - y0);

  // de dichte piramide uit de data weghalen (driehoeken in dit pand platdrukken)
  for (let i = 0; i + 2 < n; i += 3) {
    const cx = (f32[i * 7] + f32[(i + 1) * 7] + f32[(i + 2) * 7]) / 3;
    const cz = (f32[i * 7 + 2] + f32[(i + 1) * 7 + 2] + f32[(i + 2) * 7 + 2]) / 3;
    if (cx < fp.minX || cx > fp.maxX || cz < fp.minZ || cz > fp.maxZ || !pointInRing(cx, cz, ring)) continue;
    for (let k = 0; k < 3; k++) { f32[(i + k) * 7] = cx; f32[(i + k) * 7 + 1] = -500; f32[(i + k) * 7 + 2] = cz; }
  }
  const geo = w.buildingMesh?.geometry;
  if (geo) { geo.attributes.position.data.needsUpdate = true; geo.computeBoundingSphere(); }

  const root = new THREE.Group();
  root.position.set(apex[0], y0, apex[2]);
  root.rotation.y = Math.atan2(ux, uz) - Math.PI / 2; // lokale x langs de gevel
  const corners = [[-half, -half], [half, -half], [half, half], [-half, half]].map(([a, b]) => new THREE.Vector3(a, 0, b));
  const top = new THREE.Vector3(0, height, 0);
  // glas
  const glassGeo = new THREE.BufferGeometry();
  const pts = [];
  for (let i = 0; i < 4; i++) { const a = corners[i], b = corners[(i + 1) % 4]; pts.push(a.x, a.y, a.z, b.x, b.y, b.z, top.x, top.y, top.z); }
  glassGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  glassGeo.computeVertexNormals();
  const glass = new THREE.Mesh(glassGeo, new THREE.MeshStandardMaterial({ color: 0xbfd9e6, metalness: 0.65, roughness: 0.06, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }));
  glass.renderOrder = 2;
  root.add(glass);
  // ruitjespatroon: lijnen evenwijdig aan de schuine ribben, plus de ribben zelf
  const lp = [];
  const N = Math.round(half / 1.6);
  for (let i = 0; i < 4; i++) {
    const A = corners[i], B = corners[(i + 1) % 4];
    lp.push(A.x, A.y, A.z, top.x, top.y, top.z, A.x, A.y, A.z, B.x, B.y, B.z);
    for (let k = 1; k < N; k++) {
      const t = k / N;
      const P = A.clone().lerp(B, t);
      const Q1 = P.clone().add(top.clone().sub(A).multiplyScalar(1 - t)); // evenwijdig aan AC, tot aan BC
      const Q2 = P.clone().add(top.clone().sub(B).multiplyScalar(t)); // evenwijdig aan BC, tot aan AC
      lp.push(P.x, P.y, P.z, Q1.x, Q1.y, Q1.z, P.x, P.y, P.z, Q2.x, Q2.y, Q2.z);
    }
  }
  const lines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(lp, 3)), new THREE.LineBasicMaterial({ color: 0x5f6b72 }));
  root.add(lines);
  // vloer en het topstuk op een ezel in het midden
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(half * 2 - 0.2, half * 2 - 0.2), new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.4 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.04; floor.receiveShadow = true;
  root.add(floor);
  const art = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.8, roughness: 0.3 });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.0, 0.08), frameMat);
  frame.position.y = 2.2;
  const canvas = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.8), new THREE.MeshStandardMaterial({ map: paintingTexture(), roughness: 0.8 }));
  canvas.position.set(0, 2.2, 0.045);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.2), new THREE.MeshStandardMaterial({ map: plateTexture('Mona Liesje') }));
  plate.position.set(0, 1.0, 0.1);
  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, 0.12), new THREE.MeshStandardMaterial({ color: 0x3e2723 }));
  stand.position.set(0, 1.1, -0.15);
  // rood koord eromheen (alsof hij miljoenen waard is)
  const cord = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.03, 6, 40), new THREE.MeshStandardMaterial({ color: 0xb71c1c }));
  cord.rotation.x = Math.PI / 2; cord.position.set(0, 0.85, 1.0);
  art.add(frame, canvas, plate, stand, cord);
  for (let k = 0; k < 6; k++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.9, 8), frameMat); const a = (k / 6) * Math.PI * 2; p.position.set(Math.sin(a) * 1.6, 0.45, 1.0 + Math.cos(a) * 1.6); art.add(p); }
  // het schilderij kijkt naar de ingang (de kant van de straat)
  const street = w.nearestStreet(apex[0], apex[2]);
  const toStreet = street ? Math.atan2(street.x - apex[0], street.z - apex[2]) : 0;
  art.rotation.y = toStreet - root.rotation.y;
  root.add(art);
  root.traverse((o) => { if (o.isMesh && o !== glass) o.castShadow = true; });
  scene.add(root);
  // ingang: de kant van de piramide richting de straat, net buiten het glas
  const ex = apex[0] + Math.sin(toStreet) * (half + 2.5), ez = apex[2] + Math.cos(toStreet) * (half + 2.5);
  return { center: [apex[0], apex[2]], half, height, entrance: w.resolve(ex, ez, 0.6), group: root };
}
