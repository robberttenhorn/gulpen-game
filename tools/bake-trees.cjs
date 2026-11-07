// Maakt de boomsoorten vooraf met ez-tree en schrijft ze naar public/data/trees/.
// Gebruik: npm run build && npx vite preview --port 4173 & node tools/bake-trees.cjs
// (Playwright met Chromium moet beschikbaar zijn.)
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const out = path.join(__dirname, '..', 'public', 'data', 'trees');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  await page.goto(process.env.URL || 'http://localhost:4173/');
  await page.waitForFunction(() => window.game && window.game.world && window.game.world.treeTiles, null, { timeout: 300000 });
  const data = await page.evaluate(() => game.world.exportTrees());
  for (const t of data.textures) {
    const m = /^data:image\/(\w+);base64,(.*)$/.exec(t.src);
    t.file = `${t.id}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
    fs.writeFileSync(path.join(out, t.file), Buffer.from(m[2], 'base64'));
    delete t.src;
  }
  fs.writeFileSync(path.join(out, 'trees.json'), JSON.stringify(data));
  console.log('Klaar:', data.variants.map((v) => v.name).join(', '), '| texturen:', data.textures.map((t) => t.file).join(', '));
  await browser.close();
})();
