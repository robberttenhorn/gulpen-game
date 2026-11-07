// Haalt open data van Gulpen op en zet die om naar compacte bestanden in public/data/.
//
// Bronnen (allemaal gratis en open):
//   - 3D BAG (api.3dbag.nl): alle gebouwen in 3D (LoD 2.2), CC BY 4.0
//   - AHN via PDOK WCS: hoogtekaart van het maaiveld (DTM 0,5 m), CC0
//   - BGT via PDOK OGC API: wegen, water, groen, bomen, bankjes, straatnamen, CC0
//   - NWB via PDOK OGC API: wegennet met straatnamen, CC0
//
// Gebruik: npm run data

import fs from 'node:fs/promises';
import path from 'node:path';
import { fromArrayBuffer } from 'geotiff';
import { Earcut } from 'three/src/extras/Earcut.js';

const OUT = path.resolve('public/data');

// Oorsprong van de spelwereld: de Markt (bij de Zwarte Ruiter), in RD-coördinaten (EPSG:28992).
const ORIGIN = { x: 190531, y: 314058 };

// Speelgebied (het dorp) en een groter gebied voor de heuvels aan de horizon.
const CORE = { minX: 189900, minY: 313300, maxX: 191600, maxY: 314700, res: 2 };
const WIDE = { minX: 186500, minY: 309800, maxX: 195000, maxY: 318300, res: 20 };

const POIS = [
  { id: 'zwarteruiter', name: 'Herberg De Zwarte Ruiter', address: 'Markt 4', x: 190531, y: 314058 },
  { id: 'anpiet', name: 'Friture An + Piet', address: 'Rijksweg 60B', x: 190755, y: 314093 },
  { id: 'jefabels', name: 'Jef Abels Bikes', address: 'Rijksweg 113', x: 190972, y: 314255 },
  { id: 'brouwerij', name: 'Gulpener Bierbrouwerij', address: 'Rijksweg 16', x: 190488, y: 313954 },
  { id: 'sophianum', name: 'Sophianum', address: 'Landsraderweg 7', x: 190417, y: 313580 },
  { id: 'ringweg', name: 'Ringweg', address: 'Ringweg', x: 191104, y: 314313 },
  { id: 'fcgulpen', name: 'FC Gulpen', address: 'Ringweg 14', x: 191263, y: 314332 },
  { id: 'zheng', name: 'Cafetaria Zheng', address: 'Looierstraat 103', x: 190585, y: 314084 },
  { id: 'salma', name: 'Grillroom Pizzeria Salma', address: 'Rijksweg 60A', x: 190748.5, y: 314091.5 },
  { id: 'mariabeeld', name: 'Mariabeeld', address: 'Top van de Gulperberg', x: 191111.4, y: 313932.2 },
  // cafés voor de kroegentocht tijdens de Hubertusmarkt
  { id: 'kroon', name: 'Brasserie De Kroon', address: 'Markt 1', x: 190581, y: 314070, cafe: true },
  { id: 'neubourg', name: 'Grand Café Neubourg', address: 'Marktstraat 1', x: 190590, y: 314056, cafe: true },
  { id: 'poort', name: 'Gasterij De Poort', address: 'Rosstraat 23', x: 190486.236, y: 314062.656, cafe: true },
  // grijze Volvo XC40 op de oprit (staat niet op de kaart)
  { id: 'volvo', name: 'Ringweg 38', address: 'Ringweg 38', x: 190985.6, y: 314375.8 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, type = 'json', tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} voor ${url}`);
      return type === 'json' ? await res.json() : await res.arrayBuffer();
    } catch (err) {
      if (i === tries - 1) throw err;
      await sleep(1000 * 2 ** i);
    }
  }
}

const local = (x, y) => [x - ORIGIN.x, -(y - ORIGIN.y)];
const r1 = (v) => Math.round(v * 10) / 10;

// ---------------------------------------------------------------- terrein (AHN)

async function fetchDtm(area) {
  const w = Math.round((area.maxX - area.minX) / area.res);
  const h = Math.round((area.maxY - area.minY) / area.res);
  const url =
    'https://service.pdok.nl/rws/ahn/wcs/v1_0?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage' +
    `&COVERAGEID=dtm_05m&FORMAT=image/tiff&SUBSET=x(${area.minX},${area.maxX})` +
    `&SUBSET=y(${area.minY},${area.maxY})&SCALESIZE=x(${w}),y(${h})`;
  const buf = await get(url, 'buffer');
  const tiff = await fromArrayBuffer(buf);
  const img = await tiff.getImage();
  const [data] = await img.readRasters();
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) {
    const v = data[i];
    out[i] = Number.isFinite(v) && v > -100 && v < 1000 ? v : NaN;
  }
  fillHoles(out, w, h);
  return { w, h, heights: out };
}

// De DTM heeft gaten onder gebouwen en water. Vul die met het gemiddelde van de buren.
function fillHoles(a, w, h) {
  let missing = a.reduce((n, v) => n + (Number.isNaN(v) ? 1 : 0), 0);
  let pass = 0;
  while (missing > 0 && pass < 2000) {
    const next = a.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!Number.isNaN(a[i])) continue;
        let s = 0, n = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const v = a[yy * w + xx];
          if (!Number.isNaN(v)) { s += v; n++; }
        }
        if (n > 0) { next[i] = s / n; missing--; }
      }
    }
    a.set(next);
    pass++;
  }
  for (let i = 0; i < a.length; i++) if (Number.isNaN(a[i])) a[i] = 90;
}

// ---------------------------------------------------------------- gebouwen (3D BAG)

async function fetchBuildings() {
  const tris = { pos: [], uv: [], nrm: [], attr: [] };
  const footprints = [];
  // Let op: de "next"-links van de 3D BAG API slaan soms een gebouw over, dus we pagineren zelf.
  const base = `https://api.3dbag.nl/collections/pand/items?bbox=${CORE.minX},${CORE.minY},${CORE.maxX},${CORE.maxY}`;
  const seen = new Set();
  let count = 0;
  for (let offset = 0; ; offset += 50) {
    const page = await get(offset ? `${base}&limit=50&offset=${offset}` : `${base}&limit=50`);
    const tf = page.metadata.transform;
    for (const feat of page.features) {
      if (seen.has(feat.id)) continue;
      seen.add(feat.id);
      addBuilding(feat, tf, tris, footprints);
      count++;
    }
    process.stdout.write(`\r  gebouwen: ${count}/${page.numberMatched}`);
    if (!page.features.length || offset + 50 >= page.numberMatched) break;
  }
  process.stdout.write('\n');
  return { tris, footprints, count };
}

function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

function addBuilding(feat, tf, out, footprints) {
  const verts = feat.vertices.map(([x, y, z]) => [
    x * tf.scale[0] + tf.translate[0],
    y * tf.scale[1] + tf.translate[1],
    z * tf.scale[2] + tf.translate[2],
  ]);
  const parentId = feat.id;
  const parent = feat.CityObjects[parentId];
  if (!parent) return;
  const attrs = parent.attributes || {};
  const ground = attrs.b3_h_maaiveld ?? 90;
  const year = attrs.oorspronkelijkbouwjaar ?? 1970;
  const seed = hash32(parentId) & 255;
  // leeftijdsklasse: 0 = voor 1900, 1 = 1900-1960, 2 = na 1960
  const age = year < 1900 ? 0 : year < 1960 ? 1 : 2;

  // footprint (LoD0) voor botsingen
  const lod0 = parent.geometry?.find((g) => g.lod === '0');
  if (lod0) {
    const ring = lod0.boundaries[0][0].map((i) => local(verts[i][0], verts[i][1]).map(r1));
    footprints.push({ ring, h: r1((attrs.b3_h_nok ?? ground + 6) - ground), g: r1(ground) });
  }

  for (const childId of parent.children || []) {
    const child = feat.CityObjects[childId];
    const geom = child?.geometry?.find((g) => g.lod === '2.2');
    if (!geom || geom.type !== 'Solid') continue;
    const sem = geom.semantics;
    geom.boundaries[0].forEach((surface, si) => {
      const sIdx = sem?.values?.[0]?.[si];
      const type = sIdx != null ? sem.surfaces[sIdx].type : 'WallSurface';
      if (type === 'GroundSurface') return;
      const isRoof = type === 'RoofSurface';
      addSurface(surface.map((ring) => ring.map((i) => verts[i])), isRoof, ground, seed, age, out);
    });
  }
}

function addSurface(rings, isRoof, ground, seed, age, out) {
  // Newell-normaal
  const outer = rings[0];
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < outer.length; i++) {
    const a = outer[i], b = outer[(i + 1) % outer.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-9) return;
  nx /= len; ny /= len; nz /= len;

  // projecteer naar 2D op het vlak met de grootste normaalcomponent
  const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
  const drop = az >= ax && az >= ay ? 2 : ax >= ay ? 0 : 1;
  const flat = [], holes = [], all = [];
  for (const ring of rings) {
    if (all.length) holes.push(all.length);
    for (const p of ring) {
      all.push(p);
      if (drop === 2) flat.push(p[0], p[1]);
      else if (drop === 0) flat.push(p[1], p[2]);
      else flat.push(p[0], p[2]);
    }
  }
  const idx = Earcut.triangulate(flat, holes, 2);
  if (!idx.length) return;

  // muur-tangent voor UV's (horizontaal langs de gevel)
  let tx = -ny, ty = nx;
  const tl = Math.hypot(tx, ty) || 1;
  tx /= tl; ty /= tl;

  // spelcoördinaten: x = oost, y = omhoog, z = zuid; normaal idem
  const gn = [nx, nz, -ny];
  const type = isRoof ? 1 : 0;

  // zorg dat de driehoeken naar buiten wijzen (CCW gezien vanaf de normaal)
  for (let t = 0; t < idx.length; t += 3) {
    let tri = [all[idx[t]], all[idx[t + 1]], all[idx[t + 2]]];
    const e1 = [tri[1][0] - tri[0][0], tri[1][1] - tri[0][1], tri[1][2] - tri[0][2]];
    const e2 = [tri[2][0] - tri[0][0], tri[2][1] - tri[0][1], tri[2][2] - tri[0][2]];
    const cx = e1[1] * e2[2] - e1[2] * e2[1];
    const cy = e1[2] * e2[0] - e1[0] * e2[2];
    const cz = e1[0] * e2[1] - e1[1] * e2[0];
    if (cx * nx + cy * ny + cz * nz < 0) tri = [tri[0], tri[2], tri[1]];
    for (const p of tri) {
      const [lx, lz] = local(p[0], p[1]);
      out.pos.push(lx, p[2], lz);
      if (isRoof) out.uv.push(p[0] - ORIGIN.x, p[1] - ORIGIN.y);
      else out.uv.push(p[0] * tx + p[1] * ty, p[2] - ground);
      out.nrm.push(Math.round(gn[0] * 127), Math.round(gn[1] * 127), Math.round(gn[2] * 127), type);
      out.attr.push(seed, age, 0, 0);
    }
  }
}

// ---------------------------------------------------------------- BGT

const BGT = 'https://api.pdok.nl/lv/bgt/ogc/v1/collections';
const CRS = 'http://www.opengis.net/def/crs/EPSG/0/28992';

async function fetchBgt(collection) {
  let url =
    `${BGT}/${collection}/items?bbox=${CORE.minX},${CORE.minY},${CORE.maxX},${CORE.maxY}` +
    `&bbox-crs=${CRS}&crs=${CRS}&limit=1000&f=json`;
  const feats = [];
  while (url) {
    const page = await get(url);
    for (const f of page.features) {
      const p = f.properties;
      if (p.eind_registratie) continue; // historische versies overslaan
      if (p.status && p.status !== 'bestaand') continue;
      if ((p.relatieve_hoogteligging ?? 0) < 0) continue; // tunnels e.d.
      feats.push(f);
    }
    const next = page.links.find((l) => l.rel === 'next');
    url = next ? next.href : null;
  }
  process.stdout.write(`  BGT ${collection}: ${feats.length}\n`);
  return feats;
}

// Grondklassen; de client tekent ze in deze volgorde op een textuur.
const CLASSES = [
  'gras', 'akker', 'bos', 'struiken', 'erf', 'verhard_open', 'verhard_gesloten', 'onverhard',
  'berm', 'oever', 'water', 'voetpad', 'fietspad', 'parkeer', 'rijbaan', 'klinkers', 'brug', 'spoor_zand', 'fruit',
];
const C = Object.fromEntries(CLASSES.map((c, i) => [c, i]));

function classify(collection, p) {
  const fv = p.fysiek_voorkomen || '';
  const fn = p.functie || '';
  switch (collection) {
    case 'waterdeel': return C.water;
    case 'ondersteunendwaterdeel': return C.oever;
    case 'overbruggingsdeel': return C.brug;
    case 'ondersteunendwegdeel': return fv.includes('verhard') && !fv.includes('onverhard') ? C.verhard_open : C.berm;
    case 'begroeidterreindeel':
      if (fv.includes('bos') || fv === 'houtwal') return C.bos;
      if (fv.includes('struik') || fv === 'heide') return C.struiken;
      if (fv.includes('akker') || fv.includes('bouwland')) return C.akker;
      if (fv.includes('fruit') || fv.includes('boomteelt')) return C.fruit;
      return C.gras;
    case 'onbegroeidterreindeel':
      if (fv.includes('gesloten')) return C.verhard_gesloten;
      if (fv.includes('open verharding')) return C.verhard_open;
      if (fv === 'erf') return C.erf;
      return C.onverhard;
    case 'wegdeel':
      if (fn.includes('voetpad') || fn.includes('voetgangers') || fn === 'trottoir') return C.voetpad;
      if (fn.includes('fietspad')) return C.fietspad;
      if (fn.includes('parkeer')) return C.parkeer;
      if (fv.includes('open verharding')) return C.klinkers;
      if (fv.includes('onverhard') || fv.includes('half verhard')) return C.onverhard;
      return C.rijbaan;
  }
  return C.gras;
}

function polysOf(geom) {
  if (!geom) return [];
  if (geom.type === 'Polygon') return [geom.coordinates];
  if (geom.type === 'MultiPolygon') return geom.coordinates;
  return [];
}

const SPORT = [];

async function fetchGround() {
  const cols = [
    'begroeidterreindeel', 'onbegroeidterreindeel', 'ondersteunendwegdeel',
    'ondersteunendwaterdeel', 'waterdeel', 'wegdeel', 'overbruggingsdeel',
  ];
  const polys = [];
  for (const col of cols) {
    for (const f of await fetchBgt(col)) {
      const cls = classify(col, f.properties);
      if (col === 'begroeidterreindeel' && f.properties.plus_fysiek_voorkomen === 'gras- en kruidachtigen') {
        for (const poly of polysOf(f.geometry)) SPORT.push(poly[0].flatMap(([x, y]) => local(x, y).map(r1)));
      }
      for (const poly of polysOf(f.geometry)) {
        polys.push([cls, poly.map((ring) => ring.flatMap(([x, y]) => local(x, y).map(r1)))]);
      }
    }
  }
  // tekenvolgorde: laagste klasse-prioriteit eerst
  const order = [C.akker, C.fruit, C.gras, C.bos, C.struiken, C.erf, C.onverhard, C.verhard_open, C.verhard_gesloten,
    C.berm, C.oever, C.water, C.parkeer, C.klinkers, C.voetpad, C.fietspad, C.rijbaan, C.brug];
  polys.sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  return polys;
}

// ---------------------------------------------------------------- wegennet (NWB)

async function fetchRoads() {
  let url =
    'https://api.pdok.nl/rws/nationaal-wegenbestand-wegen/ogc/v1/collections/wegvakken/items' +
    `?bbox=${CORE.minX},${CORE.minY},${CORE.maxX},${CORE.maxY}&bbox-crs=${CRS}&crs=${CRS}&limit=1000&f=json`;
  const roads = [];
  while (url) {
    const page = await get(url);
    for (const f of page.features) {
      const name = f.properties.stt_naam;
      const lines = f.geometry?.type === 'LineString' ? [f.geometry.coordinates]
        : f.geometry?.type === 'MultiLineString' ? f.geometry.coordinates : [];
      for (const line of lines) roads.push([name || '', line.flatMap(([x, y]) => local(x, y).map(r1))]);
    }
    const next = page.links.find((l) => l.rel === 'next');
    url = next ? next.href : null;
  }
  process.stdout.write(`  NWB wegvakken: ${roads.length}\n`);
  return roads;
}

// ---------------------------------------------------------------- main

async function main() {
  await fs.mkdir(OUT, { recursive: true });

  console.log('Terrein (AHN) ophalen...');
  const core = await fetchDtm(CORE);
  const wide = await fetchDtm(WIDE);
  await fs.writeFile(path.join(OUT, 'terrain-core.bin'), Buffer.from(core.heights.buffer));
  await fs.writeFile(path.join(OUT, 'terrain-wide.bin'), Buffer.from(wide.heights.buffer));

  console.log('Gebouwen (3D BAG) ophalen...');
  const b = await fetchBuildings();
  const n = b.tris.pos.length / 3;
  const buf = Buffer.alloc(n * (12 + 8 + 4 + 4));
  let o = 0;
  for (let i = 0; i < n; i++) {
    buf.writeFloatLE(b.tris.pos[i * 3], o); buf.writeFloatLE(b.tris.pos[i * 3 + 1], o + 4); buf.writeFloatLE(b.tris.pos[i * 3 + 2], o + 8);
    buf.writeFloatLE(b.tris.uv[i * 2], o + 12); buf.writeFloatLE(b.tris.uv[i * 2 + 1], o + 16);
    for (let k = 0; k < 4; k++) buf.writeInt8(Math.max(-127, Math.min(127, b.tris.nrm[i * 4 + k])), o + 20 + k);
    for (let k = 0; k < 4; k++) buf.writeUInt8(b.tris.attr[i * 4 + k], o + 24 + k);
    o += 28;
  }
  await fs.writeFile(path.join(OUT, 'buildings.bin'), buf);
  await fs.writeFile(path.join(OUT, 'footprints.json'), JSON.stringify(b.footprints));
  console.log(`  ${b.count} gebouwen, ${n / 3} driehoeken`);

  console.log('Ondergrond, bomen en straatnamen (BGT) ophalen...');
  const ground = await fetchGround();
  await fs.writeFile(path.join(OUT, 'ground.json'), JSON.stringify({ classes: CLASSES, polys: ground, grassFields: SPORT }));

  const trees = (await fetchBgt('vegetatieobject_punt'))
    .filter((f) => f.geometry?.type === 'Point')
    .map((f) => local(...f.geometry.coordinates).map(r1));
  const furniture = (await fetchBgt('straatmeubilair'))
    .filter((f) => f.geometry?.type === 'Point')
    .map((f) => [f.properties.plus_type, ...local(...f.geometry.coordinates).map(r1)]);
  const labels = (await fetchBgt('openbareruimtelabel'))
    .filter((f) => f.geometry?.type === 'Point' && f.properties.openbareruimtenaam)
    .map((f) => [f.properties.openbareruimtenaam, ...local(...f.geometry.coordinates).map(r1)]);
  const palen = (await fetchBgt('paal')).filter((f) => f.geometry?.type === 'Point');
  const lights = palen
    .filter((f) => f.properties.plus_type === 'lichtmast')
    .map((f) => local(...f.geometry.coordinates).map(r1));
  const poles = palen
    .filter((f) => f.properties.plus_type !== 'lichtmast')
    .map((f) => [f.properties.plus_type, ...local(...f.geometry.coordinates).map(r1)]);
  await fs.writeFile(path.join(OUT, 'objects.json'), JSON.stringify({ trees, furniture, labels, lights, poles }));

  console.log('Wegennet met straatnamen (NWB) ophalen...');
  await fs.writeFile(path.join(OUT, 'roads.json'), JSON.stringify(await fetchRoads()));

  const meta = {
    origin: ORIGIN,
    core: { ...CORE, w: core.w, h: core.h },
    wide: { ...WIDE, w: wide.w, h: wide.h },
    pois: POIS.map((p) => ({ ...p, pos: local(p.x, p.y) })),
    generated: new Date().toISOString(),
    attribution: '3D BAG (TU Delft / 3DGI, CC BY 4.0), AHN (Rijkswaterstaat, CC0), BGT en NWB (PDOK, CC0)',
  };
  await fs.writeFile(path.join(OUT, 'meta.json'), JSON.stringify(meta, null, 2));
  console.log('Klaar.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
