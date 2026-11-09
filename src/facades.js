// Gedetailleerde gevels en aankleding voor de plekken met missies en interacties.
import * as THREE from 'three';
import { buildPrimosa } from './primosa.js';
import { makeInteriorWindow } from './interior-window.js';
import { signTexture } from './textures.js';
import { makeCart, makeStringLights, makeVlaai } from './props.js';
import { pointInRing } from './world.js';
import { buildShops } from './shops.js';

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });
const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };

export class Facades {
  constructor(game) {
    this.g = game;
    this.world = game.world;
    this.scene = game.scene;
    this.signMats = [];
    this.frames = {};
  }

  // Zoekt de gevel van het gebouw op het adres die naar de straat kijkt.
  frameFor(x, z) {
    const w = this.world;
    let fp = null;
    for (const i of w.nearbyFootprints(x, z)) if (pointInRing(x, z, w.footprints[i].ring)) fp = w.footprints[i];
    if (!fp) {
      let bd = 25;
      for (const i of w.nearbyFootprints(x, z)) {
        const f = w.footprints[i];
        const cx = (f.minX + f.maxX) / 2, cz = (f.minZ + f.maxZ) / 2;
        const d = Math.hypot(cx - x, cz - z);
        if (d < bd) { bd = d; fp = f; }
      }
    }
    const street = w.nearestStreet(x, z);
    if (!fp || !street) return null;
    const r = fp.ring;
    let best = null, bd = Infinity;
    for (let i = 0; i < r.length; i++) {
      const [ax, az] = r[i], [bx, bz] = r[(i + 1) % r.length];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 3) continue;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      // hoe open is het aan de buitenkant van deze gevel (straat of plein, geen ander pand)?
      let nx0 = (bz - az) / len, nz0 = -(bx - ax) / len;
      if (pointInRing(mx + nx0 * 0.5, mz + nz0 * 0.5, r)) { nx0 = -nx0; nz0 = -nz0; }
      let open = 0;
      for (const t of [0.2, 0.5, 0.8]) for (const o of [3, 6, 9]) {
        const px = ax + (bx - ax) * t + nx0 * o, pz = az + (bz - az) * t + nz0 * o;
        if (!w.insideBuilding(px, pz) && !w.blocked(px, pz)) open++;
      }
      const d = Math.hypot(mx - street.x, mz - street.z) * 0.15 - open * 2 - Math.min(len, 12) * 0.2;
      if (d < bd) { bd = d; best = { ax, az, bx, bz, len, mx, mz }; }
    }
    if (!best) return null;
    let ux = (best.bx - best.ax) / best.len, uz = (best.bz - best.az) / best.len;
    let nx = uz, nz = -ux;
    // normaal moet van het gebouw af wijzen
    if (pointInRing(best.mx + nx * 0.5, best.mz + nz * 0.5, r)) { nx = -nx; nz = -nz; }
    // lokale x-as zo kiezen dat x = rechts gezien vanaf de straat
    ux = -nz; uz = nx;
    const y = w.heightAt(best.mx + nx * 1.5, best.mz + nz * 1.5);
    return { x: best.mx, z: best.mz, y, ux, uz, nx, nz, len: best.len, yaw: Math.atan2(nx, nz) };
  }

  // Gevelplek voor één adres: de gevel van het pand die bij het adrespunt en de straat hoort,
  // met het midden op de plek van het adres (handig als meerdere winkels in één pand zitten).
  frameAtAddress(x, z, streetName = null) {
    const w = this.world;
    let fp = null;
    for (const i of w.nearbyFootprints(x, z)) if (pointInRing(x, z, w.footprints[i].ring)) fp = w.footprints[i];
    if (!fp) {
      let bd = 15;
      for (const i of w.nearbyFootprints(x, z)) {
        const f = w.footprints[i];
        if (f.extra) continue;
        const cx = (f.minX + f.maxX) / 2, cz = (f.minZ + f.maxZ) / 2;
        const d = Math.hypot(cx - x, cz - z);
        if (d < bd) { bd = d; fp = f; }
      }
    }
    const street = w.nearestStreet(x, z, streetName || undefined) || w.nearestStreet(x, z);
    if (!fp || !street) return null;
    const r = fp.ring;
    let best = null, bs = Infinity;
    for (let i = 0; i < r.length; i++) {
      const [ax, az] = r[i], [bx, bz] = r[(i + 1) % r.length];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 2.5) continue;
      let nx0 = (bz - az) / len, nz0 = -(bx - ax) / len;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      if (pointInRing(mx + nx0 * 0.5, mz + nz0 * 0.5, r)) { nx0 = -nx0; nz0 = -nz0; }
      let open = 0;
      for (const t of [0.2, 0.5, 0.8]) for (const o of [3, 6]) {
        if (!w.insideBuilding(ax + (bx - ax) * t + nx0 * o, az + (bz - az) * t + nz0 * o)) open++;
      }
      if (open < 3) continue; // gevel tegen een ander pand
      const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / (len * len)));
      const px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
      const dAddr = Math.hypot(px - x, pz - z);
      const dStreet = Math.hypot(px - street.x, pz - street.z);
      const score = dAddr + dStreet * 0.25 - open * 0.8;
      if (score < bs) { bs = score; best = { ax, az, bx, bz, len, t, nx0, nz0 }; }
    }
    if (!best) return this.frameFor(x, z);
    const { ax, az, bx, bz, len } = best;
    // midden op het adres, maar niet over de hoek van het pand heen
    const margin = Math.min(2.6, len / 2);
    const t = Math.max(margin / len, Math.min(1 - margin / len, best.t));
    const cx = ax + (bx - ax) * t, cz = az + (bz - az) * t;
    const nx = best.nx0, nz = best.nz0;
    const ux = -nz, uz = nx;
    const avail = 2 * Math.min(t * len, (1 - t) * len);
    const y = w.heightAt(cx + nx * 1.5, cz + nz * 1.5);
    return { x: cx, z: cz, y, ux, uz, nx, nz, len: Math.max(2.6, avail), yaw: Math.atan2(nx, nz) };
  }

  group(frame, out = 0.06) {
    const g = new THREE.Group();
    g.position.set(frame.x + frame.nx * out, frame.y, frame.z + frame.nz * out);
    g.rotation.y = frame.yaw;
    this.scene.add(g);
    return g;
  }

  sign(parent, text, { w = 4, h = 0.8, y = 3.4, z = 0.05, bg, fg, font, sub, border, glow = true } = {}) {
    const tex = signTexture(text, { bg, fg, font, sub, border, w: 1024, h: Math.round((1024 * h) / w) });
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: glow ? 0xffffff : 0x000000, emissiveIntensity: 0, roughness: 0.5 });
    if (glow) this.signMats.push(mat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, h + 0.1, 0.08), std(0x1b1b1b));
    back.position.set(0, y, z);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    face.position.set(0, y, z + 0.045);
    back.castShadow = true;
    parent.add(back, face);
    return face;
  }

  awning(parent, { w = 4, depth = 1.4, y = 2.7, colors = ['#c62828', '#ffffff'], stripes = 10 } = {}) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 64;
    const ctx = c.getContext('2d');
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect((i * 512) / stripes, 0, 512 / stripes + 1, 64);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.9 });
    const geo = new THREE.PlaneGeometry(w, depth, 1, 1);
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2 + 0.38;
    m.position.set(0, y, depth * 0.46);
    m.castShadow = true;
    // valletje aan de voorkant
    const val = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.25), mat);
    val.position.set(0, y - Math.sin(0.38) * depth * 0.5 - 0.17, depth * 0.92);
    parent.add(m, val);
  }

  // Etalageruit met een kijkje naar binnen (zie interior-window.js): type bepaalt de inrichting.
  shopWindow(parent, { w = 2.6, h = 1.8, x = 0, y = 0.6, type = 'winkel', seed = 1 } = {}) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.16, h + 0.16, 0.06), std(0x222222));
    frame.position.set(x, y + h / 2, 0.02);
    const glass = makeInteriorWindow(w, h, type, seed);
    glass.position.set(x, y + h / 2, 0.06);
    this.signMats.push({ interior: glass });
    parent.add(frame, glass);
  }

  door(parent, { x = 0, color = 0x3b2a1e } = {}) {
    const d = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.2, 0.06), std(color, { roughness: 0.5 }));
    d.position.set(x, 1.1, 0.03);
    const handle = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), std(0xd4af37, { metalness: 1, roughness: 0.3 }));
    handle.position.set(x + 0.38, 1.05, 0.08);
    parent.add(d, handle);
  }

  // ------------------------------------------------------------ alle plekken

  build() {
    const pois = Object.fromEntries(this.world.meta.pois.map((p) => [p.id, p]));
    const F = (id) => {
      const f = this.frameFor(...pois[id].pos);
      this.frames[id] = f;
      return f;
    };

    // Herberg De Zwarte Ruiter: zwart bord met gouden letters, uithangbord en terras op de Markt
    let f = F('zwarteruiter');
    if (f) {
      const g = this.group(f);
      this.sign(g, 'Herberg De Zwarte Ruiter', { w: Math.min(6, f.len - 0.5), h: 0.75, y: 3.3, bg: '#151515', fg: '#d9b25a', font: '700 110px "Baloo 2", serif' });
      this.door(g, { x: 0, color: 0x1c1c1c });
      this.shopWindow(g, { x: -1.9, w: 1.8, type: 'cafe', seed: 1 });
      this.shopWindow(g, { x: 1.9, w: 1.8, type: 'cafe', seed: 2 });
      // uithangbord aan een smeedijzeren arm
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1.1), std(0x111111, { metalness: 0.6 }));
      arm.position.set(f.len / 2 - 0.6, 3.9, 0.55);
      g.add(arm);
      const hang = signTexture('Zwarte Ruiter', { bg: '#151515', fg: '#d9b25a', w: 512, h: 512, font: '800 96px "Baloo 2", serif', border: '#d9b25a' });
      const hm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.8, 0.8), [std(0x151515), std(0x151515), std(0x151515), std(0x151515), new THREE.MeshStandardMaterial({ map: hang }), new THREE.MeshStandardMaterial({ map: hang })]);
      hm.rotation.y = Math.PI / 2;
      hm.position.set(f.len / 2 - 0.6, 3.4, 0.9);
      g.add(hm);
      this.terrace(f, 5);
    }

    // Friture An + Piet: rood-witte luifel, bord en "alleen contant"
    f = F('anpiet');
    if (f) {
      const g = this.group(f);
      const w = Math.min(5, f.len - 0.4);
      this.sign(g, 'Friture An + Piet', { w, h: 0.8, y: 3.5, bg: '#c62828', fg: '#ffe082', font: '800 120px "Baloo 2", sans-serif' });
      this.awning(g, { w, colors: ['#c62828', '#fff4e0'] });
      this.shopWindow(g, { type: 'friture', w: w - 1.4, x: -0.6, h: 1.6, y: 0.8 });
      this.door(g, { x: w / 2 - 0.55, color: 0xb71c1c });
      const cash = this.sign(g, 'ALLEEN CONTANT', { w: 1.2, h: 0.35, y: 1.25, z: 0.1, bg: '#ffeb3b', fg: '#b71c1c', font: '800 150px Inter, sans-serif', glow: false });
      cash.position.x = w / 2 - 0.55; cash.parent.children.at(-2).position.x = w / 2 - 0.55;
      this.busStop(f);
    }

    // Grillroom Pizzeria Salma
    f = F('salma');
    if (f) {
      const g = this.group(f);
      const w = Math.min(5, f.len - 0.4);
      this.sign(g, 'Grillroom Pizzeria Salma', { w, h: 0.8, y: 3.5, bg: '#1b5e20', fg: '#ffffff', font: '800 110px "Baloo 2", sans-serif', sub: 'Shoarma · Pizza · Broodje Gulpen', subFont: '600 54px Inter, sans-serif' });
      this.awning(g, { w, colors: ['#2e7d32', '#ffffff', '#c62828', '#ffffff'], stripes: 12 });
      this.shopWindow(g, { type: 'grill', w: w - 1.4, x: 0.6, h: 1.6, y: 0.8 });
      this.door(g, { x: -w / 2 + 0.55, color: 0x1b5e20 });
    }

    // Cafetaria Zheng
    f = F('zheng');
    if (f) {
      const g = this.group(f);
      const w = Math.min(5, f.len - 0.4);
      this.sign(g, 'Cafetaria Zheng', { w, h: 0.8, y: 3.4, bg: '#b71c1c', fg: '#ffd54f', font: '800 120px "Baloo 2", sans-serif' });
      this.awning(g, { w, colors: ['#ffd54f', '#b71c1c'], stripes: 8 });
      this.shopWindow(g, { type: 'friture', w: w - 1.4, x: -0.6, h: 1.6, y: 0.8 });
      this.door(g, { x: w / 2 - 0.55, color: 0x6d1010 });
    }

    // Jef Abels Bikes: bord, etalage en fietsen voor de deur
    f = F('jefabels');
    if (f) {
      const g = this.group(f);
      const w = Math.min(7, f.len - 0.4);
      this.sign(g, 'Jef Abels Bikes', { w, h: 0.9, y: 3.6, bg: '#202428', fg: '#ff9800', font: '800 130px "Baloo 2", sans-serif', sub: 'Verkoop · Verhuur · Reparatie', subFont: '600 50px Inter, sans-serif' });
      this.shopWindow(g, { type: 'fietsen', w: w - 1.6, x: -0.7, h: 2.0, y: 0.4 });
      this.door(g, { x: w / 2 - 0.6, color: 0x202428 });
      for (let i = 0; i < 6; i++) {
        const b = this.g.makeBikeModel(i);
        b.position.set(-w / 2 + 0.8 + i * 0.85, 0, 1.6);
        b.rotation.y = Math.PI / 2 + 0.15;
        g.add(b);
      }
    }

    // Gulpener Bierbrouwerij: grote letters, brouwketels en kratten
    f = F('brouwerij');
    if (f) {
      const g = this.group(f);
      const w = Math.min(10, f.len - 0.4);
      this.sign(g, 'Gulpener Bierbrouwerij', { w, h: 1.1, y: 4.6, bg: '#0d3b24', fg: '#e8d9a8', font: '800 120px "Baloo 2", serif', sub: 'sinds 1825', subFont: 'italic 600 60px Inter, serif' });
      this.door(g, { x: 0, color: 0x0d3b24 });
      this.shopWindow(g, { x: -2.4, w: 2, type: 'brouwerij', seed: 1 });
      this.shopWindow(g, { x: 2.4, w: 2, type: 'brouwerij', seed: 2 });
      // brouwketels naast het gebouw
      const copper = new THREE.MeshStandardMaterial({ color: 0xb87333, metalness: 1, roughness: 0.28 });
      for (let i = 0; i < 2; i++) {
        const k = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 2.4, 24), copper);
        body.position.y = 1.6;
        const dome = new THREE.Mesh(new THREE.SphereGeometry(1.1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), copper);
        dome.position.y = 2.8;
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.4, 10), copper);
        pipe.position.set(0, 4.2, 0);
        const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.4, 8), std(0x333333, { metalness: 0.6 }));
        legs.position.y = 0.2;
        k.add(body, dome, pipe, legs);
        k.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        k.position.set(w / 2 + 1.8 + i * 2.6, 0, 2.2);
        g.add(k);
      }
      // stapel vaten en kratten
      const keg = new THREE.MeshStandardMaterial({ color: 0xb8bec4, metalness: 0.9, roughness: 0.3 });
      for (let i = 0; i < 6; i++) {
        const v = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.55, 14), keg);
        v.position.set(-w / 2 + 0.4 + (i % 3) * 0.5, 0.28 + Math.floor(i / 3) * 0.56, 1.2);
        v.castShadow = true;
        g.add(v);
      }
      const crate = std(0x0f5132);
      for (let i = 0; i < 8; i++) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.3), crate);
        c.position.set(-w / 2 + 2.2 + (i % 2) * 0.42, 0.15 + Math.floor(i / 2) * 0.31, 1.0);
        c.castShadow = true;
        g.add(c);
      }
    }

    // Sophianum: schoolbord, vlaggen en fietsenstalling
    f = F('sophianum');
    if (f) {
      const g = this.group(f);
      const w = Math.min(8, f.len - 0.4);
      this.sign(g, 'Sophianum', { w, h: 1.0, y: 4.2, bg: '#ffffff', fg: '#0d47a1', font: '800 150px "Baloo 2", sans-serif', sub: 'Technasium · havo · vwo', subFont: '600 50px Inter, sans-serif' });
      for (let i = 0; i < 3; i++) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 7, 8), std(0xeeeeee, { metalness: 0.6 }));
        pole.position.set(-w / 2 - 1.5 - i * 1.2, 3.5, 3);
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), std(i === 1 ? 0x0d47a1 : 0xffffff, { side: THREE.DoubleSide }));
        flag.position.set(-w / 2 - 1.5 - i * 1.2 + 0.62, 6.5, 3);
        g.add(pole, flag);
      }
      const shed = new THREE.Mesh(new THREE.BoxGeometry(6, 0.08, 2.2), std(0x90a4ae, { metalness: 0.5 }));
      shed.position.set(w / 2 + 3.5, 2.3, 3);
      g.add(shed);
      for (const sx of [-2.9, 2.9]) for (const sz of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.3, 6), std(0x607d8b, { metalness: 0.6 }));
        post.position.set(w / 2 + 3.5 + sx, 1.15, 3 + sz);
        g.add(post);
      }
      for (let i = 0; i < 7; i++) {
        const b = this.g.makeBikeModel(i + 3);
        b.position.set(w / 2 + 1 + i * 0.8, 0, 3);
        b.rotation.y = Math.PI / 2;
        g.add(b);
      }
    }

    // cafés rond de Markt (voor de kroegentocht)
    const cafes = [
      ['kroon', 'Brasserie De Kroon', '#3e2a1e', '#e8c77a'],
      ['neubourg', 'Grand Café Neubourg', '#1f3b2c', '#f1e6c8'],
      ['poort', 'Gasterij De Poort', '#5a1f1f', '#f5e3c0'],
    ];
    for (const [id, name, bg, fg] of cafes) {
      if (!pois[id]) continue;
      const fr = F(id);
      if (!fr) continue;
      const g = this.group(fr);
      const w = Math.min(5.5, fr.len - 0.6);
      this.sign(g, name, { w, h: 0.7, y: 3.3, bg, fg, font: '700 110px "Baloo 2", serif' });
      this.door(g, { x: w / 2 - 0.6, color: 0x2a1c12 });
      this.shopWindow(g, { type: 'cafe', seed: id.length, w: Math.max(1.2, w - 1.6), x: -0.5, h: 1.6, y: 0.8 });
    }

    // Donny's Gezellerie: warm bord, lichtsnoeren en een terrasje
    f = pois.donnys && F('donnys');
    if (f) {
      const g = this.group(f);
      const w = Math.min(6, f.len - 0.4);
      this.sign(g, "Donny's Gezellerie", { w, h: 0.8, y: 3.4, bg: '#2f3a2b', fg: '#f3d9a4', font: 'italic 800 120px "Baloo 2", serif', sub: 'eten · drinken · gezelligheid', subFont: 'italic 600 50px Inter, serif' });
      this.door(g, { x: w / 2 - 0.6, color: 0x2f3a2b });
      this.shopWindow(g, { type: 'cafe', w: Math.max(1.4, w - 1.6), x: -0.6, h: 1.8, y: 0.6 });
      for (const zOff of [2.2, 4.4]) {
        const l = makeStringLights(Math.min(8, f.len + 2), 14);
        l.position.set(0, 3.0, zOff);
        g.add(l);
        this.signMats.push({ isWindow: true, mat: l.userData.bulb });
      }
      this.terrace(f, 3);
    }

    // PLUS supermarkt: groot bord, etalage en een karretjeshok
    f = pois.plus && F('plus');
    if (f) {
      const g = this.group(f);
      const w = Math.min(9, f.len - 0.4);
      this.sign(g, 'PLUS supermarkt', { w, h: 1.0, y: 4.2, bg: '#1b6e3a', fg: '#ffffff', font: '800 140px "Baloo 2", sans-serif' });
      this.shopWindow(g, { type: 'supermarkt', w: w - 1.0, x: 0, h: 2.4, y: 0.3 });
      // karretjeshok met een rij wagentjes
      const shed = new THREE.Group();
      shed.position.set(-w / 2 - 3.5, 0, 3);
      shed.add(at(new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.08, 1.6), std(0x1b6e3a)), 0, 2.2, 0));
      for (const sx of [-2, 2]) for (const sz of [-0.7, 0.7]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6), std(0x9e9e9e, { metalness: 0.6 }));
        post.position.set(sx, 1.1, sz);
        shed.add(post);
      }
      for (let i = 0; i < 5; i++) {
        const c = makeCart();
        c.position.set(-1.5 + i * 0.32, 0, 0);
        c.rotation.y = Math.PI / 2;
        shed.add(c);
      }
      g.add(shed);
      this.cartShed = { x: f.x + f.ux * (-w / 2 - 3.5) + f.nx * 3, z: f.z + f.uz * (-w / 2 - 3.5) + f.nz * 3 };
    }

    // Bakkerij Paulissen: crèmekleurig bord en vlaaien in de etalage
    f = pois.paulissen && F('paulissen');
    if (f) {
      const g = this.group(f);
      const w = Math.min(6, f.len - 0.4);
      this.sign(g, 'Bakkerij Paulissen', { w, h: 0.8, y: 3.4, bg: '#f3e6c8', fg: '#5a3a1e', font: '800 120px "Baloo 2", serif', sub: 'brood · vlaai · banket', subFont: '600 50px Inter, serif' });
      this.awning(g, { w, colors: ['#5a3a1e', '#f3e6c8'], stripes: 10 });
      this.shopWindow(g, { type: 'bakker', w: Math.max(1.4, w - 1.6), x: -0.6, h: 1.6, y: 0.8 });
      this.door(g, { x: w / 2 - 0.6, color: 0x5a3a1e });
      // vlaaien op een schap in de etalage
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(Math.max(1.2, w - 1.8), 0.04, 0.3), std(0xffffff));
      shelf.position.set(-0.6, 1.1, 0.25);
      g.add(shelf);
      for (let i = 0; i < 4; i++) {
        const v = makeVlaai();
        v.scale.setScalar(0.9);
        v.position.set(-0.6 - (w - 2.4) / 2 + i * ((w - 2.4) / 3 || 0.4), 1.12, 0.25);
        g.add(v);
      }
    }

    // De Eetwinkel van het Heuvelland (Meertens): slagerij met groente, fruit en kaas
    f = pois.meertens && F('meertens');
    if (f) {
      const g = this.group(f);
      const w = Math.min(7, f.len - 0.4);
      this.sign(g, 'De Eetwinkel van het Heuvelland', { w, h: 0.9, y: 3.5, bg: '#7a1f1f', fg: '#fff3e0', font: '800 100px "Baloo 2", serif', sub: 'Meertens · slagerij · groente · kaas', subFont: '600 46px Inter, sans-serif' });
      this.awning(g, { w, colors: ['#7a1f1f', '#ffffff'], stripes: 12 });
      this.shopWindow(g, { type: 'deli', w: Math.max(1.4, w - 1.6), x: 0.6, h: 1.6, y: 0.8 });
      this.door(g, { x: -w / 2 + 0.6, color: 0x7a1f1f });
      // kistjes met groente en fruit voor de deur
      const veg = [0xd32f2f, 0x7cb342, 0xff9800, 0x6d4c41, 0xfdd835];
      for (let i = 0; i < 5; i++) {
        const crate = new THREE.Group();
        crate.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.35), std(0xa1887f)));
        const fill = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.31), std(veg[i]));
        fill.position.y = 0.12;
        crate.add(fill);
        crate.position.set(-w / 2 + 1.6 + i * 0.6, 0.11 + (i % 2) * 0.3, 0.45);
        crate.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        g.add(crate);
      }
    }

    if (pois.kerk) F('kerk');
    // winkels en bedrijven op hun eigen adres, tankstation en busstation
    buildShops(this, pois);
    // glazen piramide Primosa (Landsraderweg 7)
    if (pois.primosa) this.primosa = buildPrimosa(this, pois.primosa.pos);
    this.buildChurch();
    this.buildPitch(pois.fcgulpen.pos);
    this.buildMaria(pois.mariabeeld.pos);
  }

  terrace(f, n) {
    const w = this.world;
    const parasolMat = new THREE.MeshStandardMaterial({ color: 0xf3ead7, roughness: 0.9, side: THREE.DoubleSide });
    const chairMat = std(0x2b2b2b, { metalness: 0.4 });
    const tableMat = std(0x6d4c33);
    // nooit op de rijbaan, het fietspad of een parkeervak: alleen op stoep of plein
    const bad = new Set(['rijbaan', 'fietspad', 'parkeer']);
    const free = (x, z) => !w.insideBuilding(x, z) && !w.blocked(x, z) && !bad.has(w.classAt(x, z));
    for (let i = 0; i < n; i++) {
      const along = (i - (n - 1) / 2) * 2.6;
      let x = 0, z = 0, ok = false;
      for (let out = 1.7 + (i % 2) * 2.2; out >= 1.5 && !ok; out -= 0.3) {
        x = f.x + f.ux * along + f.nx * out; z = f.z + f.uz * along + f.nz * out;
        ok = free(x, z) && free(x + f.nx * 1.15, z + f.nz * 1.15) && free(x + f.ux * 1.1, z + f.uz * 1.1) && free(x - f.ux * 1.1, z - f.uz * 1.1);
      }
      if (!ok) continue;
      const g = new THREE.Group();
      g.position.set(x, w.groundAt(x, z), z);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 16), tableMat);
      top.position.y = 0.74;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.74, 6), chairMat);
      leg.position.y = 0.37;
      g.add(top, leg);
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + 0.4;
        const ch = new THREE.Group();
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.42), chairMat);
        seat.position.y = 0.45;
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.45, 0.04), chairMat);
        back.position.set(0, 0.68, -0.2);
        ch.add(seat, back);
        ch.position.set(Math.sin(a) * 0.75, 0, Math.cos(a) * 0.75);
        ch.rotation.y = a + Math.PI;
        g.add(ch);
      }
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.5, 6), std(0xdddddd));
      pole.position.y = 1.25;
      const umb = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.5, 8, 1, true), parasolMat);
      umb.position.y = 2.45;
      g.add(pole, umb);
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.scene.add(g);
    }
  }

  busStop(f) {
    const w = this.world;
    const s = w.nearestStreet(f.x + f.nx * 4, f.z + f.nz * 4);
    if (!s) return;
    const x = f.x + f.ux * 6 + f.nx * 3, z = f.z + f.uz * 6 + f.nz * 3;
    if (w.insideBuilding(x, z)) return;
    const g = new THREE.Group();
    g.position.set(x, w.groundAt(x, z), z);
    g.rotation.y = f.yaw;
    const glass = new THREE.MeshStandardMaterial({ color: 0x9fb8c8, transparent: true, opacity: 0.35, roughness: 0.05 });
    const back = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.2, 0.03), glass);
    back.position.set(0, 1.2, -0.7);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.08, 1.6), std(0x37474f, { metalness: 0.5 }));
    roof.position.y = 2.35;
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.05, 0.4), std(0x607d8b));
    bench.position.set(0, 0.48, -0.45);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.8, 8), std(0xaaaaaa, { metalness: 0.7 }));
    pole.position.set(2.2, 1.4, 0.4);
    const bord = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.03), new THREE.MeshStandardMaterial({ map: signTexture('H', { w: 128, h: 128, bg: '#1565c0', fg: '#fff', font: '800 100px Inter, sans-serif' }) }));
    bord.position.set(2.2, 2.6, 0.42);
    g.add(back, roof, bench, pole, bord);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.scene.add(g);
  }

  // Voetbalveld van FC Gulpen op het grasveld van het sportpark.
  buildPitch([px, pz]) {
    const w = this.world;
    const fields = (w.ground.grassFields || []).map((ring) => {
      const pts = [];
      for (let i = 0; i < ring.length; i += 2) pts.push([ring[i], ring[i + 1]]);
      let a = 0, cx = 0, cz = 0;
      for (let i = 0; i < pts.length - 1; i++) a += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
      pts.forEach(([x, z]) => { cx += x; cz += z; });
      return { pts, area: Math.abs(a) / 2, cx: cx / pts.length, cz: cz / pts.length };
    }).filter((f) => f.area > 5500 && f.area < 10000 && Math.hypot(f.cx - px, f.cz - pz) < 260)
      .sort((a, b) => Math.hypot(a.cx - px, a.cz - pz) - Math.hypot(b.cx - px, b.cz - pz));
    const field = fields[0];
    let cx, cz, ang, L = 100, W = 64;
    if (field) {
      // oriëntatie: langste zijde van het veld
      let best = 0;
      for (let i = 0; i < field.pts.length - 1; i++) {
        const [ax, az] = field.pts[i], [bx, bz] = field.pts[i + 1];
        const l = Math.hypot(bx - ax, bz - az);
        if (l > best) { best = l; ang = Math.atan2(bx - ax, bz - az); }
      }
      // afmetingen binnen het veld
      const ux = Math.sin(ang), uz = Math.cos(ang);
      let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
      for (const [x, z] of field.pts) {
        const a = (x - field.cx) * ux + (z - field.cz) * uz, b = -(x - field.cx) * uz + (z - field.cz) * ux;
        minA = Math.min(minA, a); maxA = Math.max(maxA, a); minB = Math.min(minB, b); maxB = Math.max(maxB, b);
      }
      L = Math.min(100, maxA - minA - 8); W = Math.min(64, maxB - minB - 8);
      const ca = (minA + maxA) / 2, cb = (minB + maxB) / 2;
      cx = field.cx + ux * ca - uz * cb; cz = field.cz + uz * ca + ux * cb;
    } else {
      cx = px + 40; cz = pz; ang = 0;
    }
    this.pitch = { cx, cz, ang, L, W };
    const g = new THREE.Group();
    g.position.set(cx, w.heightAt(cx, cz), cz);
    g.rotation.y = ang;
    this.scene.add(g);

    // gras met maaibanen
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 660;
    const ctx = c.getContext('2d');
    for (let i = 0; i < 12; i++) { ctx.fillStyle = i % 2 ? '#4f8a35' : '#5a9a3c'; ctx.fillRect(0, (i * 660) / 12, 1024, 660 / 12 + 1); }
    ctx.strokeStyle = '#f4f4f0'; ctx.lineWidth = 4;
    const sx = 1024 / W, sz = 660 / L; // let op: canvas x = breedte, y = lengte
    ctx.strokeRect(4, 4, 1016, 652);
    ctx.beginPath(); ctx.moveTo(0, 330); ctx.lineTo(1024, 330); ctx.stroke();
    ctx.beginPath(); ctx.arc(512, 330, 9.15 * sx, 0, Math.PI * 2); ctx.stroke();
    for (const end of [0, 1]) {
      const y0 = end ? 660 - 16.5 * sz : 0, y1 = end ? 660 - 5.5 * sz : 0;
      ctx.strokeRect(512 - 20.15 * sx, y0, 40.3 * sx, 16.5 * sz);
      ctx.strokeRect(512 - 9.16 * sx, end ? 660 - 5.5 * sz : 0, 18.32 * sx, 5.5 * sz);
      ctx.beginPath(); ctx.arc(512, end ? 660 - 11 * sz : 11 * sz, 3, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
      void y1;
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const turf = new THREE.Mesh(new THREE.PlaneGeometry(W, L, 24, 32), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }));
    turf.rotation.x = -Math.PI / 2;
    // het veld volgt het terrein
    const pos = turf.geometry.attributes.position;
    const base = w.heightAt(cx, cz);
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i), lz = -pos.getY(i);
      const wx = cx + Math.cos(ang) * lx + Math.sin(ang) * lz;
      const wz = cz - Math.sin(ang) * lx + Math.cos(ang) * lz;
      pos.setZ(i, w.heightAt(wx, wz) - base + 0.06);
    }
    turf.geometry.computeVertexNormals();
    turf.receiveShadow = true;
    g.add(turf);

    // doelen
    const white = std(0xffffff, { roughness: 0.4 });
    const netMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, side: THREE.DoubleSide, wireframe: false });
    this.goals = [];
    for (const end of [-1, 1]) {
      const goal = new THREE.Group();
      const gz = end * (L / 2 - 0.1);
      const postGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.44, 8);
      for (const gx of [-3.66, 3.66]) {
        const p = new THREE.Mesh(postGeo, white);
        p.position.set(gx, 1.22, 0);
        goal.add(p);
      }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 7.32, 8), white);
      bar.rotation.z = Math.PI / 2; bar.position.y = 2.44;
      const net = new THREE.Mesh(new THREE.BoxGeometry(7.32, 2.44, 1.6), netMat);
      net.position.set(0, 1.22, end * 0.8);
      goal.add(bar, net);
      goal.position.set(0, w.heightAt(cx, cz + gz) - base, gz);
      goal.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      g.add(goal);
      this.goals.push(goal);
    }
    // lichtmasten
    for (const [lx, lz] of [[-W / 2 - 3, -L / 4], [-W / 2 - 3, L / 4], [W / 2 + 3, -L / 4], [W / 2 + 3, L / 4]]) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 16, 8), std(0x9e9e9e, { metalness: 0.6 }));
      mast.position.set(lx, 8, lz);
      const head = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 0.3), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0 }));
      head.position.set(lx, 16, lz);
      this.signMats.push(head.material);
      mast.castShadow = true;
      g.add(mast, head);
    }
    // clubbord
    const bord = new THREE.Group();
    bord.position.set(-W / 2 - 4, 0, 0);
    bord.rotation.y = Math.PI / 2;
    this.sign(bord, 'FC Gulpen', { w: 6, h: 1.2, y: 2.6, bg: '#ffffff', fg: '#1a237e', font: '800 170px "Baloo 2", sans-serif', border: '#c62828' });
    for (const sxp of [-2.8, 2.8]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), std(0x777777));
      p.position.set(sxp, 1.3, 0);
      bord.add(p);
    }
    g.add(bord);
  }

  pitchToWorld(lx, lz) {
    const p = this.pitch;
    return [p.cx + Math.cos(p.ang) * lx + Math.sin(p.ang) * lz, p.cz - Math.sin(p.ang) * lx + Math.cos(p.ang) * lz];
  }

  // Sint-Petruskerk: een kruis op de toren (de toren zelf komt uit de 3D BAG).
  // (De wijzerplaten zijn weg: de toren werd niet altijd goed herkend en dan staken ze half door het dak.)
  buildChurch() {
    const w = this.world;
    // torenlocatie volgens TOP10NL (Kadaster), in lokale coördinaten
    const tx = -177.0, tz = 53.2;
    let tower = null;
    for (const i of w.nearbyFootprints(tx, tz)) if (pointInRing(tx, tz, w.footprints[i].ring)) tower = w.footprints[i];
    if (!tower) return;
    const cx = (tower.minX + tower.maxX) / 2, cz = (tower.minZ + tower.maxZ) / 2;
    const hw = (tower.maxX - tower.minX) / 2, hd = (tower.maxZ - tower.minZ) / 2;
    const top = tower.top;
    // kruis met haan bovenop
    const gold = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 1, roughness: 0.3 });
    const cross = new THREE.Group();
    cross.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 8), gold), 0, 1.5, 0));
    cross.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 0.1), gold), 0, 2.2, 0));
    const haan = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.5, 4), gold);
    haan.rotation.z = Math.PI / 2;
    haan.position.set(0, 3.1, 0);
    cross.add(haan);
    cross.position.set(cx, top, cz);
    this.scene.add(cross);
    this.church = { x: cx, z: cz, top };
  }

  // Het Mariamonument op de top van de Gulperberg (ruim tien meter, beton).
  buildMaria([x, z]) {
    const w = this.world;
    const g = new THREE.Group();
    g.position.set(x, w.heightAt(x, z), z);
    const concrete = new THREE.MeshStandardMaterial({ color: 0xc9c4b8, roughness: 0.92 });
    const steps = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 0.6, 8), concrete);
    steps.position.y = 0.3;
    const ped = new THREE.Mesh(new THREE.BoxGeometry(2.2, 4, 2.2), concrete);
    ped.position.y = 2.6;
    const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.15, 4.6, 16), concrete);
    robe.position.y = 6.9;
    const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), concrete);
    shoulders.position.y = 9.2;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), concrete);
    head.position.y = 9.85;
    const veil = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.2, 16, 1, true), concrete);
    veil.position.y = 9.75;
    const hands = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 0.25), concrete);
    hands.position.set(0, 8.4, 0.85);
    const crown = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.04, 6, 24), new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 1, roughness: 0.3, emissive: 0x4a3600, emissiveIntensity: 0.4 }));
    crown.rotation.x = Math.PI / 2;
    crown.position.y = 10.45;
    g.add(steps, ped, robe, shoulders, head, veil, hands, crown);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    // het beeld kijkt uit over het dorp (richting de Markt)
    g.rotation.y = Math.atan2(-x, -z);
    this.scene.add(g);
    // botsing: het monument is een obstakel
    const ring = [];
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; ring.push([x + Math.cos(a) * 3.4, z + Math.sin(a) * 3.4]); }
    w.addObstacle(ring);
  }

  // Marktkramen van de Hubertusmarkt rond de Markt. Geeft een functie terug om ze weer op te ruimen.
  marketStalls(n = 18) {
    const w = this.world;
    const ok = ['klinkers', 'voetpad', 'erf', 'verhard_open', 'parkeer'];
    const placed = [];
    const group = new THREE.Group();
    const cols = [['#c62828', '#ffffff'], ['#1565c0', '#ffffff'], ['#2e7d32', '#f1e6c8'], ['#f9a825', '#ffffff'], ['#6d4c41', '#efe3c8']];
    for (let i = 0; i < 600 && placed.length < n; i++) {
      const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 55;
      const x = Math.cos(a) * r + 15, z = Math.sin(a) * r;
      if (!ok.includes(w.classAt(x, z)) || w.insideBuilding(x, z) || w.blocked(x, z)) continue;
      if (placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 5)) continue;
      const st = w.nearestStreet(x, z);
      const yaw = st ? Math.atan2(st.x - x, st.z - z) : 0;
      const stall = new THREE.Group();
      const c = cols[placed.length % cols.length];
      const table = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 1.1), std(0x8d6e63));
      table.position.y = 0.85;
      const cloth = new THREE.Mesh(new THREE.BoxGeometry(2.62, 0.5, 1.12), std(new THREE.Color(c[0]).getHex()));
      cloth.position.y = 0.58;
      const goods = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.18, 0.8), std([0xd9a441, 0x8bc34a, 0xbf360c, 0x795548][placed.length % 4]));
      goods.position.y = 0.98;
      stall.add(table, cloth, goods);
      for (const sx of [-1.25, 1.25]) for (const sz of [-0.5, 0.5]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.3, 6), std(0xbdbdbd, { metalness: 0.6 }));
        pole.position.set(sx, 1.15, sz);
        stall.add(pole);
      }
      const roofG = new THREE.Group();
      roofG.position.set(0, 2.3, 0);
      this.awning(roofG, { w: 2.8, depth: 1.4, y: 0, colors: c, stripes: 8 });
      roofG.children.forEach((m) => { m.position.z -= 0.65; });
      stall.add(roofG);
      stall.position.set(x, w.groundAt(x, z), z);
      stall.rotation.y = yaw;
      stall.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      group.add(stall);
      placed.push([x, z]);
    }
    this.scene.add(group);
    return () => this.scene.remove(group);
  }

  setNight(t) {
    for (const m of this.signMats) {
      if (m.interior) m.interior.userData.setNight(t);
      else if (m.isWindow) m.mat.emissiveIntensity = 0.05 + t * 1.2;
      else m.emissiveIntensity = t * 0.9;
    }
  }
}
