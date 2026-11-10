// Controleert de poppetjes in de echte game: de speler loopt, rent, fietst en skatet, een dorpsbewoner zwaait,
// iemand zit op een bankje, er lopen voetgangers en er rijdt een fietser. Maakt van elk een beeld en meldt
// fouten uit de console.
// Gebruik: npx vite build && npx vite preview --port 4181 --strictPort &   en dan
//          node tools/poppetje-spel.cjs <uitvoermap> [breedte hoogte]
// Chromium zonder videokaart is traag, dus de spellus staat stil: het script laat de spellogica zonder
// weergave lopen en tekent alleen het beeld dat bewaard wordt.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const URL = process.env.URL || 'http://localhost:4181/';
const out = path.resolve(process.argv[2] || 'docs/hd/poppetjes');
const W = +(process.argv[3] || 800), H = +(process.argv[4] || 450);
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(900000);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(URL + (process.env.QUERY || ''));
  await page.waitForSelector('#start-btn:not([hidden])');
  await page.evaluate(() => {
    const g = window.game;
    g.renderer.setAnimationLoop = () => {};
    g.adaptQuality = () => {}; g.dawn = async () => {}; g.updateDayNight = () => {}; g.checkBlack = () => {};
  });
  await page.click('#start-btn');
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(300);
    if (!(await page.evaluate(() => game.ui.dialogOpen)) && i > 1) break;
    await page.evaluate(() => { const d = document.getElementById('dialog'); d && d.click(); });
  }
  await page.evaluate(() => {
    const g = window.game;
    // het welkomstgesprek wacht op de spellus (die stilstaat): afbreken, anders blijft de speler vastgezet
    g.ui.gen = (g.ui.gen || 0) + 1; g.ui.close(); g.player.lockedFor = false;
    g.timeOfDay = 14; g.applyTime?.();
    g.clock.getDelta = () => 1 / 30;
    const realRender = g.render.bind(g);
    // spellogica zonder weergave laten lopen
    window.sim = (seconds, keys = []) => {
      g.input.keys.clear(); for (const k of keys) g.input.keys.add(k);
      g.render = () => {};
      for (let i = 0; i < Math.round(seconds * 30); i++) g.tickInner();
      g.render = realRender;
      g.input.keys.clear();
    };
    // één beeld tekenen: camera op afstand dist, draaiing yaw t.o.v. de huidige kijkrichting
    window.shot = (dist = 3.2, dyaw = 0, pitch = 0.12) => {
      const save = [g.camYaw, g.camPitch, g.camDist];
      g.camYaw += dyaw; g.camPitch = pitch; g.camDist = dist; g.lastManualLook = g.time + 1e6;
      g.updateCamera(0, true); g.updateCamera(0, true);
      realRender();
      const gl = g.renderer.getContext(), px = new Uint8Array(4);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const url = g.canvas.toDataURL('image/jpeg', 0.9);
      [g.camYaw, g.camPitch, g.camDist] = save;
      return url;
    };
    // één beeld met een losse camera: kijkt naar (x, z) op 1 m hoogte, vanaf richting yaw op afstand dist
    window.shotFree = (x, z, yaw, dist = 3.2, height = 1.3) => {
      const y = g.world.groundAt(x, z);
      g.camera.position.set(x + Math.sin(yaw) * dist, y + height, z + Math.cos(yaw) * dist);
      g.camera.lookAt(x, y + 1.0, z);
      g.camera.updateMatrixWorld(true);
      realRender();
      const gl = g.renderer.getContext(), px = new Uint8Array(4);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return g.canvas.toDataURL('image/jpeg', 0.9);
    };
    const pshot = (dyaw = Math.PI / 2, dist = 3.4) => shotFree(g.player.x, g.player.z, g.player.heading + dyaw, dist);
    window.pshot = pshot;
    // een vrije richting zoeken en daarheen bewegen (anders loopt de speler zo tegen een gevel)
    window.move = (seconds, keys, joy = null) => {
      const p = g.player;
      for (let i = 0; i < 12; i++) {
        const x = p.x, z = p.z;
        g.camYaw = i * Math.PI / 6; g.lastManualLook = g.time + 1e6;
        g.input.joy = joy; sim(seconds, keys); g.input.joy = null;
        if (Math.hypot(p.x - x, p.z - z) > seconds * 0.6 && p.speed > 0.5) return true;
      }
      return false;
    };
    // speler naar een plek zetten, op afstand d vóór een doel (x, z met kijkrichting heading), en ernaar kijken
    window.goNear = (x, z, heading, d) => {
      const p = g.player;
      if (g.mode !== 'walk') g.setMode('walk');
      p.x = x + Math.sin(heading) * d; p.z = z + Math.cos(heading) * d; p.speed = 0;
      p.heading = Math.atan2(x - p.x, z - p.z);
      g.camYaw = Math.atan2(-(x - p.x), -(z - p.z)); g.lastManualLook = g.time + 1e6;
    };
  });
  const save = async (name, url) => { fs.writeFileSync(path.join(out, name + '.jpg'), Buffer.from(url.split(',')[1], 'base64')); console.log('gemaakt', name); };
  const step = async (name, fn, arg) => { const t0 = Date.now(); await save(name, await page.evaluate(fn, arg)); console.log('  ', Date.now() - t0, 'ms'); };

  await step('spel-stilstaan', () => { sim(1); return pshot(0.6, 2.8); });
  await step('spel-lopen', () => { move(2.5, [], { x: 0, y: -0.4 }); game.input.joy = { x: 0, y: -0.4 }; sim(0.5); game.input.joy = null; return pshot(); });
  await step('spel-joggen', () => { move(2.5, ['KeyW']); sim(0.5, ['KeyW']); return pshot(); });
  await step('spel-rennen', () => { move(2.5, ['KeyW', 'ShiftLeft']); sim(0.4, ['KeyW', 'ShiftLeft']); return pshot(); });
  await step('spel-fietsen', () => { sim(0.5); game.setMode('bike'); move(2.5, ['KeyW']); sim(0.5, ['KeyW']); return pshot(Math.PI / 2 - 0.4, 3.6); });
  await step('spel-skaten', () => { sim(0.5); game.vehicles.skate = true; game.setMode('skate'); move(2.5, ['KeyW']); sim(0.5, ['KeyW']); const u = pshot(Math.PI / 2 - 0.4, 3.6); game.setMode('walk'); return u; });
  await step('spel-zwaaien', () => {
    const g = game, n = g.npcs.find((q) => q.group.visible && q.marker.visible && !q.pose && q.mode !== 'skate');
    if (!n) return shot();
    goNear(n.pos.x, n.pos.z, n.heading, 6); sim(1.5);
    return shotFree(n.pos.x, n.pos.z, n.heading + 0.5, 3.2);
  });
  await step('spel-bankje', () => {
    const g = game, s = g.peds.sitters[0];
    if (!s) return shot();
    goNear(s.x, s.z, s.model.rotation.y, 5); sim(1);
    return shotFree(s.x, s.z, s.model.rotation.y + 0.6, 3);
  });
  await step('spel-voetganger', () => {
    const g = game, p = g.player;
    // dichtstbijzijnde voetganger
    const q = [...g.peds.list].sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    goNear(q.x, q.z, q.heading, 8); sim(0.5);
    return shotFree(q.x, q.z, q.heading + 1.1, 3.2);
  });
  await step('spel-fietser', () => {
    const g = game, c = g.peds.cyclists[0];
    if (!c) return shot();
    goNear(c.x, c.z, c.heading + 1.2, 8); sim(0.3);
    return shotFree(c.x, c.z, c.heading + 1.1, 3.6);
  });
  const info = await page.evaluate(() => {
    return { snelheidSpeler: +game.player.speed.toFixed(2), voetgangers: game.peds.list.length, zitters: game.peds.sitters.length, fietsers: game.peds.cyclists.length, npcs: game.npcs.length };
  });
  console.log(JSON.stringify(info));
  console.log(errors.length ? 'FOUTEN IN DE CONSOLE:\n' + errors.join('\n') : 'geen fouten in de console');
  await browser.close();
})();
