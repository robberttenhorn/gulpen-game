// Dieren die op meerdere plekken voorkomen (bezoekers van de piramide, honden die uitgelaten worden).
import * as THREE from 'three';

export function makeDog() {
  const g = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3e2723 });
  const b = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  b(0.28, 0.26, 0.62, fur, 0, 0.42, 0);
  const head = b(0.24, 0.24, 0.26, fur, 0, 0.62, 0.38);
  b(0.12, 0.1, 0.14, dark, 0, 0.58, 0.55);
  b(0.06, 0.12, 0.04, dark, -0.09, 0.78, 0.34); b(0.06, 0.12, 0.04, dark, 0.09, 0.78, 0.34);
  const legs = [[-0.1, 0.2], [0.1, 0.2], [-0.1, -0.22], [0.1, -0.22]].map(([x, z]) => b(0.07, 0.3, 0.07, fur, x, 0.15, z));
  const tail = b(0.05, 0.05, 0.26, fur, 0, 0.55, -0.4);
  tail.rotation.x = -0.6;
  let t = 0;
  // de polonaise verwacht armen; een hond heeft er geen, dus losse dummies
  g.userData.parts = { armL: new THREE.Object3D(), armR: new THREE.Object3D() };
  g.userData.animate = (dt, speed = 0) => {
    t += dt;
    tail.rotation.y = Math.sin(t * 14) * 0.6;
    legs.forEach((l, i) => { l.rotation.x = speed > 0.3 ? Math.sin(t * 12 + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI : 0)) * 0.5 : 0; });
    head.rotation.x = Math.sin(t * 3) * 0.05;
  };
  return g;
}
