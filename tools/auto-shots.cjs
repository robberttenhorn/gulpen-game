// Maakt beelden van de auto's op de losse testpagina (tools/auto-test.html).
// Gebruik: npx vite --port 4182 --strictPort &   en dan
//   node tools/auto-shots.cjs <uitvoermap> [types] [beelden] [dag|nacht|beide] [kwaliteit]
//   types en beelden: lijst met komma's, of 'alle'.
//   Voorbeeld: node tools/auto-shots.cjs docs/hd/autos/na xc40,hatch voor34,zij beide hoog
// Draait in Chromium zonder videokaart (SwiftShader); daarom een klein venster.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = process.env.URL || 'http://localhost:4182/tools/auto-test.html';
const out = path.resolve(process.argv[2] || 'docs/hd/autos/na');
const arg = (i, d) => (process.argv[i] && process.argv[i] !== 'alle' ? process.argv[i].split(',') : d);
const PAINT = { xc40: 0x8e9296, hatch: 0x7a1e1e, sedan: 0x1e2a44, suv: 0xd8d9db, van: 0xeeeeee, sport: 0xd4af37, tractor: 0xb71c1c };
const types = arg(3, Object.keys(PAINT));
const views = arg(4, ['voor34', 'zij', 'achter34', 'boven']);
const when = process.argv[5] || 'dag';
const quality = process.argv[6] || 'hoog';
const W = +(process.env.W || 960), H = +(process.env.H || 540);
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(300000);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(`${BASE}?kwaliteit=${quality}${process.env.QUERY || ''}`);
  await page.waitForFunction(() => window.T, null, { timeout: 120000 });
  const report = {};
  // RIJ=1: een rij geparkeerde (gebundelde) auto's, van dichtbij (fijn model) en van ver (eenvoudig model, ingezoomd)
  if (process.env.RIJ) {
    for (const [tname, night] of [['dag', 0], ['nacht', 1]]) {
      if (when !== 'beide' && when !== tname) continue;
      for (const v of ['rij', 'rijachter', 'rijmidden', 'rijver']) {
        const res = await page.evaluate(({ types, paints, night, v }) => {
          const T = window.T;
          T.setNight(night);
          T.setView(v);
          T.setRow(types, paints);
          T.cars.updateTraffic(0.016, { x: 999, z: 999 });
          const tris = {};
          for (const [k, b] of Object.entries(T.cars.batches)) tris[k] = Object.fromEntries(b.sets.filter((q) => q.n).map((q, i) => ['niveau' + q.lod + (q.meshes[0].castShadow ? '' : ' zonder schaduw'), q.meshes.reduce((n, m) => n + m.geometry.index.count / 3, 0)]));
          return { url: T.shot(), tris, calls: T.renderer.info.render.calls };
        }, { types, paints: types.map((t) => PAINT[t]), night, v });
        fs.writeFileSync(path.join(out, `rij-${tname}-${v}-${quality}.jpg`), Buffer.from(res.url.split(',')[1], 'base64'));
        console.log('gemaakt', `rij-${tname}-${v}-${quality}.jpg`, JSON.stringify(res.tris));
      }
    }
    if (errors.length) console.log('MELDINGEN:\n' + [...new Set(errors)].slice(0, 30).join('\n'));
    await browser.close();
    return;
  }
  for (const type of types) {
    for (const [tname, night] of [['dag', 0], ['nacht', 1]]) {
      if (when !== 'beide' && when !== tname) continue;
      const info = await page.evaluate(({ type, paint, night, opts, steer }) => {
        const T = window.T;
        T.setNight(night);
        const car = T.setCar(type, paint, opts);
        // een auto waarin gereden wordt: lampen aan en wielen in de gevraagde stand (als de code dat ondersteunt)
        if (night || steer) {
          for (let i = 0; i < 40; i++) { T.cars.drive(car, 0.016, 0, steer, false); T.cars.updateTraffic(0.016, { x: 999, z: 999 }); }
        } else T.cars.updateTraffic(0.016, { x: 999, z: 999 });
        return { tris: car.mesh ? T.tris(car.mesh) : 0 };
      }, { type, paint: process.env.KLEUR ? parseInt(process.env.KLEUR, 16) : (PAINT[type] ?? 0x8e9296), night, opts: type === 'xc40' ? { isVolvo: true } : {}, steer: +(process.env.STUUR || 0) });
      report[type] = info.tris;
      for (const v of views) {
        const url = await page.evaluate(({ v, type }) => {
          const T = window.T;
          T.setView(v, type === 'tractor' && !['wiel', 'koplamp', 'achterlicht', 'binnen'].includes(v) ? 1.25 : 1);
          return T.shot();
        }, { v, type });
        const file = path.join(out, `${type}-${tname}-${v}.jpg`);
        fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
        console.log('gemaakt', path.relative(process.cwd(), file));
      }
    }
  }
  console.log('driehoeken (losse auto):', JSON.stringify(report));
  if (errors.length) console.log('MELDINGEN:\n' + [...new Set(errors)].slice(0, 30).join('\n'));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
