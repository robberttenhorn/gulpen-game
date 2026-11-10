// Controleert de auto's in de echte game: geen fouten, geparkeerde auto's, instappen en rijden met de Volvo,
// verkeer en de lampen 's avonds. Maakt een paar beelden en meet driehoeken en tekenopdrachten.
// Gebruik: npx vite build && npx vite preview --port 4190 --strictPort &   en dan
//   node tools/auto-game.cjs <uitvoermap> [kwaliteit]        (URL=... voor een andere poort)
// Draait zonder videokaart (SwiftShader): klein venster, en de spellus staat stil; het script zet zelf stappen.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const URL = process.env.URL || 'http://localhost:4190/';
const out = path.resolve(process.argv[2] || 'docs/hd/autos/game');
const quality = process.argv[3] || 'hoog';
const W = +(process.env.W || 800), H = +(process.env.H || 450);
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext(quality === 'laag'
    ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true }
    : { viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(900000);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(`${URL}?kwaliteit=${quality}`);
  await page.waitForSelector('#start-btn:not([hidden])');
  await page.evaluate(() => {
    const g = window.game;
    g.renderer.setAnimationLoop = () => {};
    g.adaptQuality = () => {}; g.dawn = async () => {}; g.updateDayNight = () => {}; g.checkBlack = () => {};
  });
  await page.click('#start-btn');
  // gesprekken wegklikken (de welkomsttekst bestaat uit meerdere schermen)
  const closeDialogs = async () => {
    for (let i = 0; i < 8; i++) {
      await page.waitForTimeout(250);
      if (!(await page.evaluate(() => game.ui.dialogOpen)) && i > 1) break;
      await page.evaluate(() => { const d = document.getElementById('dialog'); d && d.click(); });
    }
    // lukt het niet met klikken (de spellus staat stil), dan het gesprek afbreken
    await page.evaluate(() => { const ui = game.ui; if (ui.dialogOpen) { ui.gen = (ui.gen || 0) + 1; ui.close(); } });
  };
  await closeDialogs();
  // hulpjes in de pagina
  await page.evaluate(() => {
    const g = window.game;
    window.A = {
      // n stappen spellogica zonder te tekenen, met een vaste tijdstap
      steps(n, dt = 1 / 30) {
        const r = g.render, gd = g.clock.getDelta;
        g.render = () => {}; g.clock.getDelta = () => dt;
        try { for (let i = 0; i < n; i++) g.tickInner(); } finally { g.render = r; g.clock.getDelta = gd; }
      },
      hour(h) { if (g.timeOfDay !== h) { g.timeOfDay = h; g.applyTime(); } },
      // speler bij een punt zetten en de camera richten
      look(x, z, yaw, pitch = 0.2, dist = null) {
        if (g.mode === 'car') { g.car.speed = 0; g.exitCar(); }
        const p = g.player;
        [p.x, p.z] = g.world.resolve(x, z, 0.5);
        p.heading = yaw + Math.PI; p.speed = 0;
        if (dist != null) { g.camDistSave ??= g.camDist; g.camDist = dist; } else if (g.camDistSave != null) { g.camDist = g.camDistSave; g.camDistSave = null; }
        g.camYaw = yaw; g.camPitch = pitch; g.lastManualLook = g.time + 1e6;
      },
      shot() {
        const gl = g.renderer.getContext(), px = new Uint8Array(4);
        g.clock.getDelta();
        const gd = g.clock.getDelta; g.clock.getDelta = () => 1 / 60;
        for (let i = 0; i < 2; i++) { g.tickInner(); g.updateCamera(0, true); }
        g.clock.getDelta = gd;
        g.cars.refreshBatches(true);
        // tellen over alle stappen van één beeld (ook schaduw en nabewerking)
        const info = g.renderer.info;
        info.autoReset = false; info.reset();
        g.render();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const res = { url: g.canvas.toDataURL('image/jpeg', 0.9), tris: info.render.triangles, calls: info.render.calls };
        info.autoReset = true;
        return res;
      },
    };
  });
  const save = async (name, res) => {
    fs.writeFileSync(path.join(out, `${name}-${quality}.jpg`), Buffer.from(res.url.split(',')[1], 'base64'));
    console.log('gemaakt', name, '| driehoeken in beeld:', res.tris, '| tekenopdrachten:', res.calls);
  };
  const report = {};

  // 1. aantallen en driehoeken per type en detailniveau (bouwt alle modellen: meet ook de bouwtijd)
  report.modellen = await page.evaluate(() => {
    const c = game.cars, res = { bouwtijdMs: 0, types: {} };
    for (const type of Object.keys(c.types)) {
      res.types[type] = {};
      for (const lod of [0, 1, 2]) {
        const had = !!c.models[type + lod], t0 = performance.now();
        const m = c.model(type, lod);
        if (!had) res.bouwtijdMs += performance.now() - t0;
        const wheels = m.wheels.reduce((n, w) => n + m.tris.wheel[w.geo], 0);
        res.types[type][lod] = { los: m.tris.paint + m.tris.detail + m.tris.glass + m.tris.lights + wheels, lak: m.tris.paint, details: m.tris.detail, glas: m.tris.glass, lampen: m.tris.lights, wielen: wheels };
      }
    }
    res.bouwtijdMs = Math.round(res.bouwtijdMs);
    res.autos = c.cars.length; res.verkeer = c.traffic.length;
    res.bundels = Object.fromEntries(Object.entries(c.batches).map(([k, b]) => [k, { autos: b.cars.length, perTrap: b.sets.map((q) => `niveau ${q.lod}${q.meshes[0].castShadow ? '' : ' zonder schaduw'}: ${q.n}`) }]));
    return res;
  });
  console.log(JSON.stringify(report.modellen));

  // 2. geparkeerde auto's: de plek met de meeste auto's dicht bij elkaar
  await page.evaluate(() => {
    const cs = game.cars.cars.filter((c) => c.parked);
    let best = cs[0], bn = -1;
    for (const c of cs) { const n = cs.filter((o) => Math.hypot(o.x - c.x, o.z - c.z) < 14).length; if (n > bn) { bn = n; best = c; } }
    window.A.spot = best;
    A.hour(15);
    A.look(best.x + Math.sin(best.heading + 0.9) * 7, best.z + Math.cos(best.heading + 0.9) * 7, best.heading + 0.9, 0.22);
  });
  await save('parkeren-dag', await page.evaluate(() => A.shot()));

  // 3. de Volvo op de oprit
  await page.evaluate(() => {
    const c = game.volvo, h = c.heading + 0.65;
    A.look(c.x + Math.sin(h) * 4.6, c.z + Math.cos(h) * 4.6, h, 0.12, 2.2);
  });
  await save('volvo-dag', await page.evaluate(() => A.shot()));

  // aandeel van de auto's in één beeld: tellen met en zonder auto's
  report.aandeel = await page.evaluate(() => {
    const g = window.game, c = g.cars, info = g.renderer.info;
    const objs = [...c.cars, ...c.traffic].map((q) => q.mesh).filter(Boolean).concat(Object.values(c.batches).flatMap((b) => b.meshes));
    const count = () => { info.autoReset = false; info.reset(); g.render(); const r = { driehoeken: info.render.triangles, tekenopdrachten: info.render.calls }; info.autoReset = true; return r; };
    const met = count();
    for (const o of objs) o.visible = false;
    const zonder = count();
    for (const o of objs) o.visible = true;
    return { met, zonder, autos: { driehoeken: met.driehoeken - zonder.driehoeken, tekenopdrachten: met.tekenopdrachten - zonder.tekenopdrachten } };
  });
  console.log('aandeel auto\'s in een beeld (bij de Volvo):', JSON.stringify(report.aandeel));

  // 4. instappen en rijden: gas en een beetje sturen
  await closeDialogs();
  report.rijden = await page.evaluate(() => {
    const g = window.game, c = g.volvo;
    A.look(c.x + 2, c.z + 2, c.heading, 0.2);
    g.enterCar(c);
    const rig = c.mesh.userData.rig, x0 = c.x, z0 = c.z;
    g.input.joy = { x: 0.35, y: -1 };
    A.steps(45);

    const res = { mode: g.mode, verplaatst: +Math.hypot(c.x - x0, c.z - z0).toFixed(2), snelheid: +c.speed.toFixed(2), wielhoek: +(rig.dist / c.t.wheelR).toFixed(2), stuurhoek: +rig.steer.toFixed(3), lampenAan: +rig.on.toFixed(2), bestuurder: rig.driver ? rig.driver.visible : null, gesprekOpen: g.ui.dialogOpen };
    g.input.joy = { x: 0.35, y: 0 };
    return res;
  });
  console.log('rijden:', JSON.stringify(report.rijden));
  await page.evaluate(() => { game.camYaw = game.car.heading + Math.PI + 0.9; game.camPitch = 0.16; game.lastManualLook = game.time + 1e6; });
  await save('rijden-dag', await page.evaluate(() => A.shot()));

  // 5. 's avonds: lampen aan, remmen
  report.nacht = await page.evaluate(() => {
    const g = window.game, c = g.car, rig = c.mesh.userData.rig;
    A.hour(22);
    g.input.joy = { x: 0, y: -1 }; A.steps(30);
    g.input.joy = { x: 0, y: 1 }; A.steps(3); // remmen
    const res = { nacht: +g.cars.night.toFixed(2), lamp: rig.lamp.toArray().map((v) => +v.toFixed(2)), bundel: rig.beam ? rig.beam.visible : null, spot: g.cars.spot ? +g.cars.spot.intensity.toFixed(1) : null };
    g.camYaw = c.heading + Math.PI; g.camPitch = 0.2;
    return res;
  });
  console.log('nacht:', JSON.stringify(report.nacht));
  await save('rijden-nacht-achter', await page.evaluate(() => A.shot()));
  await page.evaluate(() => { game.input.joy = { x: 0, y: 0 }; game.car.speed = 0; game.camYaw = game.car.heading + 0.5; game.camPitch = 0.1; });
  await save('rijden-nacht-voor', await page.evaluate(() => A.shot()));

  // 6. verkeer: bij de dichtstbijzijnde verkeersauto gaan staan
  report.verkeer = await page.evaluate(() => {
    const g = window.game;
    g.input.joy = null;
    g.car.speed = 0; g.exitCar();
    const p0 = g.cars.traffic.map((c) => [c.x, c.z]);
    A.steps(60);
    const moved = g.cars.traffic.filter((c, i) => Math.hypot(c.x - p0[i][0], c.z - p0[i][1]) > 1).length;
    const t = g.cars.traffic[0];
    A.look(t.x + Math.sin(t.heading + 0.5) * 9, t.z + Math.cos(t.heading + 0.5) * 9, t.heading + 0.5, 0.18);
    return { autos: g.cars.traffic.length, bewogen: moved, lampenAan: +t.mesh.userData.rig.on.toFixed(2), bestuurder: t.mesh.userData.rig.driver ? t.mesh.userData.rig.driver.visible : null };
  });
  console.log('verkeer:', JSON.stringify(report.verkeer));
  await save('verkeer-nacht', await page.evaluate(() => A.shot()));
  await page.evaluate(() => { A.hour(15); });
  await save('verkeer-dag', await page.evaluate(() => A.shot()));

  // 7. een geparkeerde auto activeren (uit de bundel) en weer uitstappen
  report.activeren = await page.evaluate(() => {
    const g = window.game, c = A.spot, b = g.cars.batches[c.type];
    const before = b.sets.reduce((n, q) => n + q.n, 0);
    A.look(c.x + 2.5, c.z, 0, 0.2);
    g.enterCar(c);
    A.steps(5);
    const after = b.sets.reduce((n, q) => n + q.n, 0);
    const ok = g.mode === 'car' && !!c.mesh;
    g.exitCar();
    return { ingestapt: ok, bundelVoor: before, bundelNa: after };
  });
  console.log('activeren:', JSON.stringify(report.activeren));
  report.fouten = [...new Set(errors)];
  console.log(report.fouten.length ? 'FOUTEN:\n' + report.fouten.join('\n') : 'geen fouten in de console');
  fs.writeFileSync(path.join(out, `meting-${quality}.json`), JSON.stringify(report, null, 2));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
