// Procedurele, herhalende textures voor bestrating, asfalt, gevels en water.
// Alles wordt in de browser getekend, zodat er geen externe bestanden nodig zijn.
import * as THREE from 'three';
import { rng } from './world.js';

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

// Zet een hoogtekaart (canvas, grijswaarden) om naar een normal map.
function heightToNormal(src, strength = 2) {
  const w = src.width, h = src.height;
  const sd = src.getContext('2d').getImageData(0, 0, w, h).data;
  const [c, ctx] = canvas(w);
  const out = ctx.createImageData(w, h);
  const H = (x, y) => sd[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      out.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      out.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      out.data[i + 2] = (1 / len) * 255;
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return c;
}

function tex(c, srgb = true, aniso = 8) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function noise(ctx, size, amount, rand, alpha = 1) {
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rand() - 0.5) * amount;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
    img.data[i + 3] = 255 * alpha;
  }
  ctx.putImageData(img, 0, 0);
}

// Stenen in halfsteensverband (klinkers, tegels). Geeft {map, normalMap}.
function bricks({ size = 512, cols, rows, base, spread, joint = '#3c3a36', jointW = 3, offset = 0.5, seed = 1, rough = 18, herring = false }) {
  const rand = rng(seed);
  const [c, ctx] = canvas(size);
  const [hc, hctx] = canvas(size);
  ctx.fillStyle = joint; ctx.fillRect(0, 0, size, size);
  hctx.fillStyle = '#000'; hctx.fillRect(0, 0, size, size);
  const bw = size / cols, bh = size / rows;
  const drawStone = (x, y, w, h) => {
    const v = (rand() - 0.5) * spread;
    const col = base.map((b) => Math.max(0, Math.min(255, b + v + (rand() - 0.5) * 8)));
    ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
    const r = Math.min(w, h) * 0.12;
    roundRect(ctx, x + jointW / 2, y + jointW / 2, w - jointW, h - jointW, r);
    ctx.fill();
    const g = 150 + rand() * 80;
    hctx.fillStyle = `rgb(${g},${g},${g})`;
    roundRect(hctx, x + jointW / 2 + 1, y + jointW / 2 + 1, w - jointW - 2, h - jointW - 2, r * 1.5);
    hctx.fill();
  };
  if (herring) {
    // visgraatverband
    const u = size / cols;
    for (let y = -2; y < rows + 2; y++) {
      for (let x = -2; x < cols + 2; x++) {
        const px = x * u, py = y * u;
        if ((x + y) % 2 === 0) { drawStone(px, py, u * 2, u); }
        else { drawStone(px, py, u, u * 2); }
      }
    }
  } else {
    for (let y = 0; y < rows; y++) {
      const off = (y % 2) * offset * bw;
      for (let x = -1; x <= cols; x++) drawStone(x * bw + off, y * bh, bw, bh);
    }
  }
  noise(ctx, size, rough, rand);
  return { map: tex(c), normalMap: tex(heightToNormal(hc, 3), false) };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function asphalt({ size = 512, base = [62, 63, 66], seed = 7, cracks = true }) {
  const rand = rng(seed);
  const [c, ctx] = canvas(size);
  const [hc, hctx] = canvas(size);
  ctx.fillStyle = `rgb(${base})`; ctx.fillRect(0, 0, size, size);
  hctx.fillStyle = '#808080'; hctx.fillRect(0, 0, size, size);
  // korrels
  for (let i = 0; i < size * size * 0.18; i++) {
    const x = rand() * size, y = rand() * size;
    const v = (rand() - 0.5) * 60;
    ctx.fillStyle = `rgba(${base[0] + v},${base[1] + v},${base[2] + v},0.8)`;
    ctx.fillRect(x, y, 1.5, 1.5);
    const g = 128 + v * 1.5;
    hctx.fillStyle = `rgb(${g},${g},${g})`;
    hctx.fillRect(x, y, 1.5, 1.5);
  }
  // vlekken
  for (let i = 0; i < 18; i++) {
    const x = rand() * size, y = rand() * size, r = 20 + rand() * 80;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const d = rand() < 0.5 ? 0 : 255;
    g.addColorStop(0, `rgba(${d},${d},${d},0.06)`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  }
  if (cracks) {
    ctx.strokeStyle = 'rgba(20,20,22,0.55)';
    hctx.strokeStyle = '#303030';
    for (let i = 0; i < 4; i++) {
      let x = rand() * size, y = rand() * size;
      ctx.lineWidth = hctx.lineWidth = 1 + rand();
      ctx.beginPath(); hctx.beginPath();
      ctx.moveTo(x, y); hctx.moveTo(x, y);
      for (let k = 0; k < 12; k++) {
        x += (rand() - 0.5) * 40; y += (rand() - 0.5) * 40;
        ctx.lineTo(x, y); hctx.lineTo(x, y);
      }
      ctx.stroke(); hctx.stroke();
    }
  }
  return { map: tex(c), normalMap: tex(heightToNormal(hc, 1.5), false) };
}

function grass({ size = 512, seed = 3 }) {
  const rand = rng(seed);
  const [c, ctx] = canvas(size);
  ctx.fillStyle = 'rgb(108,140,64)'; ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < size * size * 0.5; i++) {
    const x = rand() * size, y = rand() * size;
    const g = 110 + rand() * 70;
    ctx.fillStyle = `rgba(${g * 0.62},${g},${g * 0.38},0.5)`;
    ctx.fillRect(x, y, 1, 2 + rand() * 3);
  }
  return { map: tex(c) };
}

export function makeTextures(isMobile) {
  const S = isMobile ? 256 : 512;
  return {
    asfalt: asphalt({ size: S }),
    fietspad: asphalt({ size: S, base: [150, 72, 60], seed: 11, cracks: false }),
    klinkers: bricks({ size: S, cols: 8, rows: 16, base: [112, 100, 92], spread: 30, seed: 2, herring: true }),
    tegels: bricks({ size: S, cols: 4, rows: 4, base: [178, 172, 162], spread: 12, offset: 0, seed: 5, jointW: 2, joint: '#8d877d' }),
    erf: bricks({ size: S, cols: 6, rows: 12, base: [140, 136, 128], spread: 20, seed: 9 }),
    parkeer: bricks({ size: S, cols: 8, rows: 16, base: [96, 94, 92], spread: 18, seed: 13 }),
    gras: grass({ size: S }),
    band: bricks({ size: 128, cols: 1, rows: 1, base: [150, 148, 144], spread: 10, seed: 17, jointW: 1, joint: '#777' }),
  };
}

// Tekstbord (uithangbord, gevelreclame) als texture.
export function signTexture(text, { bg = '#1b2430', fg = '#ffffff', font = '800 120px "Baloo 2", sans-serif', w = 1024, h = 256, border = null, sub = null, subFont = '600 56px Inter, sans-serif' } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
  if (border) { ctx.strokeStyle = border; ctx.lineWidth = h * 0.06; ctx.strokeRect(h * 0.05, h * 0.05, w - h * 0.1, h - h * 0.1); }
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font;
  let size = parseInt(font.match(/(\d+)px/)[1], 10);
  while (ctx.measureText(text).width > w * 0.9 && size > 20) {
    size -= 4;
    ctx.font = font.replace(/\d+px/, size + 'px');
  }
  ctx.fillText(text, w / 2, sub ? h * 0.4 : h / 2 + size * 0.05);
  if (sub) { ctx.font = subFont; ctx.fillText(sub, w / 2, h * 0.78); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
