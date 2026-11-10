// Maakt van elke missie één schermafbeelding op het moment dat er iets te zien is (minispel, binnenruimte,
// race, bezorging): naar de persoon toe, het gesprek door (eerste keuze), wachten tot er iets begint, één beeld.
// Bedoeld om het uiterlijk van de missies vóór en na een wijziging te vergelijken; de spelregels raakt het niet.
// Gebruik: npm run build && npx vite preview --port 4173 &   en dan   node tools/hd-missiebeelden.cjs <uitvoermap> [filter]
//   filter: delen van missienamen, gescheiden door komma's (bijv. "gyros,heg").
//   WACHT=ms: zo lang na de start van het minispel wachten voor de opname (standaard 1500).
//   GEEN3D=1: de 3D-wereld erachter niet tekenen (scheelt tijd bij minispellen die het hele beeld vullen).
//   REEKS=n: n opnamen achter elkaar (naam-1.jpg, naam-2.jpg, ...), met telkens TUSSEN ms ertussen (standaard 1200).
//   TOETSEN="Space,KeyE": tussen de opnamen van een reeks deze toetsen kort indrukken (om het spel te laten bewegen).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const URL = process.env.URL || 'http://localhost:4173/';
const out = path.resolve(process.argv[2] || 'docs/hd/missies');
const filter = process.argv[3] || '';
const WACHT = +(process.env.WACHT || 1500);
const GEEN3D = !!process.env.GEEN3D, REEKS = +(process.env.REEKS || 1), TUSSEN = +(process.env.TUSSEN || 1200);
const TOETSEN = (process.env.TOETSEN || '').split(',').filter(Boolean);
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.setDefaultTimeout(900000);
  const errors = [];
  let current = 'laden';
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${current}] ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => errors.push(`[${current}] pageerror: ${e.message}`));
  await page.goto(URL + (process.env.QUERY || '?kwaliteit=hoog'));
  await page.waitForSelector('#start-btn:not([hidden])');
  await page.evaluate(() => {
    const g = window.game;
    g._render = g.render.bind(g);
    g.render = () => {};
    g.adaptQuality = () => {}; g.checkBlack = () => {};
  });
  await page.click('#start-btn');
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(150);
    const open = await page.evaluate(() => { if (game.ui.dialogOpen) { game.input.actionPressed = true; return true; } return false; });
    if (!open && i > 3) break;
  }
  const ids = await page.evaluate(() => game.missions.list().map((m) => ({ id: m.id, title: m.title, night: !!m.nightOnly })));
  for (const m of ids) {
    if (filter && !filter.split(',').some((f) => m.id.includes(f))) continue;
    current = m.id;
    const r = await page.evaluate(async ({ m, WACHT, GEEN3D }) => {
      const g = window.game, wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const mis = g.missions.list().find((q) => q.id === m.id);
      const wantNight = m.night || m.id === 'bierfeesten';
      if ((g.night > 0.5) !== wantNight) { g.timeOfDay = wantNight ? 22.5 : 15; g.applyTime(); }
      g.updateDayNight = () => {};
      if (g.mode === 'car') { g.car.speed = 0; g.exitCar(); }
      if (g.mode !== 'walk') g.setMode('walk');
      const p = g.player;
      [p.x, p.z] = g.world.resolve(mis.npc.pos.x + 1.6, mis.npc.pos.z + 1.6, 0.5);
      p.speed = 0; p.lockedFor = false;
      g.talkCooldownUntil = 0; g.ui.closedAt = 0; g.unlockUntil = 0; g.ui.cancelUntil = 0;
      g.missions.talk(mis.npc);
      const t0 = performance.now();
      const started = () => g.minigame || g.race || g.penalty || g.interior || g.destination || g.missions.active || g.pov;
      let quiet = 0;
      while (performance.now() - t0 < 45000) {
        await wait(120);
        if (g.ui.dialogOpen) { quiet = 0; const btn = document.querySelector('#dialog-choices button'); if (btn) btn.click(); else g.input.actionPressed = true; }
        else if (started() && !g.fading) { if (++quiet > 12) break; }
        else if (!g.missions.talking && !g.fading) { if (++quiet > 12) break; }
      }
      await wait(WACHT);
      const reached = g.minigame ? 'minispel' : g.race ? 'race' : g.penalty ? 'penalty' : g.interior ? 'binnen' : g.destination ? 'bestemming' : g.missions.active ? 'missie actief' : 'gesprek klaar';
      const vol = !!document.querySelector('.mini-overlay:not(.slim)'), laag = !!document.querySelector('.mini-overlay');
      if (GEEN3D) return { reached, vol, laag, binnen: !!g.interior, pov: !!g.pov };
      try { g.clock.getDelta(); g.updateCamera(0, true); g._render(0.016); const gl = g.renderer.getContext(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); } catch (e) { return { reached, fout: String(e) }; }
      return { reached, vol, laag, binnen: !!g.interior, pov: !!g.pov };
    }, { m, WACHT, GEEN3D });
    for (let k = 1; k <= REEKS; k++) {
      await page.screenshot({ path: path.join(out, REEKS > 1 ? `${m.id}-${k}.jpg` : `${m.id}.jpg`), type: 'jpeg', quality: 85 });
      if (k === REEKS) break;
      for (const code of TOETSEN) { await page.keyboard.down(code); await page.waitForTimeout(90); await page.keyboard.up(code); }
      await page.waitForTimeout(TUSSEN);
    }
    console.log(`${m.id.padEnd(16)} ${String(r.reached).padEnd(14)} ${r.vol ? 'beeldvullende laag' : r.laag ? 'smalle laag' : ''}${r.binnen ? ' binnen' : ''}${r.pov ? ' vaste camera' : ''}${r.fout ? ' FOUT ' + r.fout : ''}`);
    await page.evaluate(async () => {
      const g = window.game, wait = (ms) => new Promise((res) => setTimeout(res, ms));
      if (g.missions.busy()) g.missions.stop();
      const t1 = performance.now();
      while (performance.now() - t1 < 8000 && (g.fading || g.interior)) await wait(150);
      await wait(1700);
      if (g.missions.busy() || g.player.lockedFor || g.minigame || g.interior) { try { g.goHome(); } catch (e) { /* negeren */ } await wait(500); }
    });
  }
  console.log(`klaar, ${errors.length} fouten in de console`);
  for (const e of errors.slice(0, 20)) console.log(e);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
