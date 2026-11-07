// Gestileerde poppetjes voor de speler en de dorpsbewoners.
import * as THREE from 'three';

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...extra });

export function makeCharacter(opts = {}) {
  const {
    shirt = 0xe8a33d, pants = 0x2e3f5c, skin = 0xf0c8a0, hair = 0x4a3020, shoes = 0x222222,
    hat = null, apron = null, chain = false, sash = null, scale = 1,
  } = opts;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.45, 4, 10), std(shirt));
  torso.position.y = 1.2;
  torso.scale.set(1, 1, 0.75);
  body.add(torso);

  if (apron) {
    const ap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.7, 0.05), std(apron));
    ap.position.set(0, 1.05, 0.21);
    body.add(ap);
  }
  if (sash) {
    const s = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 6, 20), std(sash));
    s.position.set(0, 1.25, 0);
    s.rotation.set(Math.PI / 2, 0.6, 0);
    s.scale.set(1, 0.75, 1);
    body.add(s);
  }
  if (chain) {
    const c = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 6, 24, Math.PI), std(0xf2c14e, { metalness: 0.9, roughness: 0.25 }));
    c.position.set(0, 1.45, 0.17);
    c.rotation.set(0.2, 0, Math.PI);
    body.add(c);
    const medal = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 16), c.material);
    medal.rotation.x = Math.PI / 2;
    medal.position.set(0, 1.24, 0.24);
    body.add(medal);
  }

  const head = new THREE.Group();
  head.position.y = 1.78;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.21, 16, 12), std(skin));
  head.add(skull);
  const hairMesh = new THREE.Mesh(new THREE.SphereGeometry(0.225, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), std(hair));
  hairMesh.rotation.x = -0.25;
  head.add(hairMesh);
  for (const sx of [-0.075, 0.075]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), std(0x111111));
    eye.position.set(sx, 0.02, 0.19);
    head.add(eye);
  }
  if (hat === 'cap') {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.23, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(opts.hatColor ?? 0xc0392b));
    cap.position.y = 0.04;
    head.add(cap);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.03, 0.18), cap.material);
    brim.position.set(0, 0.05, 0.22);
    head.add(brim);
  } else if (hat === 'tophat') {
    const mat = std(0x15151a);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.03, 20), mat);
    brim.position.y = 0.15;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.21, 0.38, 20), mat);
    top.position.y = 0.35;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.212, 0.212, 0.06, 20), std(0x7a1f2b));
    band.position.y = 0.2;
    head.add(brim, top, band);
  } else if (hat === 'chef') {
    const mat = std(0xffffff);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.28, 16), mat);
    c.position.y = 0.26;
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8), mat);
    puff.position.y = 0.42;
    head.add(c, puff);
  } else if (hat === 'helmet') {
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(opts.hatColor ?? 0x2ecc71));
    h.position.y = 0.03;
    head.add(h);
  }
  body.add(head);

  const limb = (len, r, mat) => {
    const g = new THREE.CapsuleGeometry(r, len, 3, 8);
    g.translate(0, -len / 2 - r, 0);
    return new THREE.Mesh(g, mat);
  };
  const armMat = std(shirt), skinMat = std(skin), legMat = std(pants), shoeMat = std(shoes);
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(-0.36, 1.5, 0); armR.position.set(0.36, 1.5, 0);
  armL.add(limb(0.42, 0.085, armMat)); armR.add(limb(0.42, 0.085, armMat));
  for (const a of [armL, armR]) {
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), skinMat);
    hand.position.y = -0.62;
    a.add(hand);
  }
  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(-0.13, 0.82, 0); legR.position.set(0.13, 0.82, 0);
  legL.add(limb(0.55, 0.1, legMat)); legR.add(limb(0.55, 0.1, legMat));
  for (const l of [legL, legR]) {
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.1, 0.3), shoeMat);
    shoe.position.set(0, -0.78, 0.05);
    l.add(shoe);
  }
  body.add(armL, armR, legL, legR);

  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  root.scale.setScalar(scale);

  const parts = { body, head, armL, armR, legL, legR, torso };
  let phase = Math.random() * 10;

  // animatie: speed in m/s, mode 'walk' | 'bike' | 'skate' | 'idle' | 'wave' | 'drink'
  root.userData.animate = (dt, speed, mode = 'walk') => {
    phase += dt * (2 + speed * 1.6);
    const sw = Math.min(1, speed / 4);
    parts.armL.rotation.set(0, 0, 0.08); parts.armR.rotation.set(0, 0, -0.08);
    parts.legL.rotation.set(0, 0, 0); parts.legR.rotation.set(0, 0, 0);
    parts.body.position.y = 0;
    parts.body.rotation.set(0, 0, 0);
    if (mode === 'bike') {
      const p = phase * 1.1;
      parts.legL.rotation.x = -1.1 + Math.sin(p) * 0.5;
      parts.legR.rotation.x = -1.1 - Math.sin(p) * 0.5;
      parts.armL.rotation.x = -1.0; parts.armR.rotation.x = -1.0;
      parts.body.rotation.x = 0.25;
    } else if (mode === 'skate') {
      parts.body.rotation.y = -1.2;
      parts.head.rotation.y = 1.1;
      parts.legL.rotation.z = 0.25; parts.legR.rotation.z = -0.25;
      parts.armL.rotation.z = 0.9 + Math.sin(phase * 0.5) * 0.1; parts.armR.rotation.z = -0.9;
      parts.body.position.y = -0.08 + Math.sin(phase * 0.6) * 0.02;
      return;
    } else if (mode === 'wave') {
      parts.armR.rotation.z = -2.6 + Math.sin(phase * 3) * 0.3;
    } else if (mode === 'drink') {
      parts.armR.rotation.x = -2.2;
      parts.head.rotation.x = -0.4;
      return;
    } else {
      const s = Math.sin(phase) * 0.7 * sw;
      parts.legL.rotation.x = s; parts.legR.rotation.x = -s;
      parts.armL.rotation.x = -s * 0.8; parts.armR.rotation.x = s * 0.8;
      parts.body.position.y = Math.abs(Math.cos(phase)) * 0.05 * sw;
      if (speed < 0.1) {
        parts.body.position.y = Math.sin(phase * 0.5) * 0.01;
        parts.torso.scale.y = 1 + Math.sin(phase * 0.5) * 0.01;
      }
    }
    parts.head.rotation.set(0, 0, 0);
  };
  root.userData.parts = parts;
  return root;
}

export function makeBike() {
  const g = new THREE.Group();
  const frame = std(0x1e88e5, { metalness: 0.4, roughness: 0.4 });
  const dark = std(0x111111);
  const wheelGeo = new THREE.TorusGeometry(0.33, 0.04, 8, 24);
  for (const z of [-0.55, 0.55]) {
    const w = new THREE.Mesh(wheelGeo, dark);
    w.rotation.y = Math.PI / 2;
    w.position.set(0, 0.36, z);
    g.add(w);
  }
  const bar = (len, x, y, z, rx) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, len, 6), frame);
    m.position.set(x, y, z); m.rotation.x = rx; g.add(m);
  };
  bar(1.0, 0, 0.62, 0, Math.PI / 2);
  bar(0.6, 0, 0.6, -0.25, 0.5);
  bar(0.6, 0, 0.62, 0.42, -0.35);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.26), dark);
  seat.position.set(0, 0.92, -0.35); g.add(seat);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.55, 6), dark);
  handle.rotation.z = Math.PI / 2; handle.position.set(0, 1.0, 0.5); g.add(handle);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function makeSkateboard() {
  const g = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 0.85), std(0xe74c3c));
  deck.position.y = 0.1;
  g.add(deck);
  for (const z of [-0.3, 0.3]) for (const x of [-0.09, 0.09]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 10), std(0xf5f5f5));
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.04, z);
    g.add(w);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function makeKeg() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.55, 18), std(0xb8bec4, { metalness: 0.85, roughness: 0.3 }));
  m.position.y = 0.28;
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.225, 0.02, 6, 20), std(0x8a9096, { metalness: 0.8 }));
  ring1.rotation.x = Math.PI / 2; ring1.position.y = 0.08;
  const ring2 = ring1.clone(); ring2.position.y = 0.48;
  g.add(m, ring1, ring2);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
