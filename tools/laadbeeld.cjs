// Maakt de achtergrond van het laadscherm: een schoon beeld van het uitzicht vanaf de Gulperberg (1920 x 1080,
// zonder knoppen en teksten), opgeslagen als public/laadbeeld.jpg en een kleine versie public/laadbeeld-klein.jpg.
// Gebruik: npm run build && npx vite preview --port 4173 &   en dan   node tools/laadbeeld.cjs
// Heeft Python met Pillow nodig om het beeld als JPEG in twee maten op te slaan.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(1800000);
  page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text().slice(0, 200)); });
  await page.goto((process.env.URL || 'http://localhost:4173/') + '?kwaliteit=hoog');
  await page.waitForSelector('#start-btn:not([hidden])');
  await page.evaluate(() => { const g = window.game; g.renderer.setAnimationLoop = () => {}; g.adaptQuality = () => {}; g.dawn = async () => {}; g.updateDayNight = () => {}; g.checkBlack = () => {}; });
  await page.click('#start-btn');
  for (let i = 0; i < 8; i++) { await page.waitForTimeout(300); if (!(await page.evaluate(() => game.ui.dialogOpen)) && i > 1) break; await page.evaluate(() => document.getElementById('dialog').click()); }
  const url = await page.evaluate(() => {
    const g = window.game, p = g.player;
    [p.x, p.z] = g.world.resolve(560, 120, 0.5); p.heading = 1.9 + Math.PI; p.speed = 0;
    g.camYaw = 1.9; g.camPitch = 0.2; g.lastManualLook = g.time + 1e6;
    if (g.timeOfDay !== 15) { g.timeOfDay = 15; g.applyTime(); }
    g.clock.getDelta();
    for (let i = 0; i < 3; i++) { g.tickInner(); g.updateCamera(0, true); }
    g.render();
    return { url: g.canvas.toDataURL('image/png'), w: g.canvas.width, h: g.canvas.height };
  });
  const png = path.join(root, 'laadbeeld-tmp.png');
  fs.writeFileSync(png, Buffer.from(url.url.split(',')[1], 'base64'));
  // als JPEG opslaan, groot en klein
  execFileSync('python3', ['-c', `from PIL import Image
im = Image.open(r'${png}').convert('RGB')
im.save(r'${path.join(root, 'public/laadbeeld.jpg')}', quality=80, optimize=True, progressive=True)
im.resize((960, 540), Image.LANCZOS).save(r'${path.join(root, 'public/laadbeeld-klein.jpg')}', quality=78, optimize=True, progressive=True)`]);
  fs.unlinkSync(png);
  console.log('gemaakt', url.w, url.h);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
