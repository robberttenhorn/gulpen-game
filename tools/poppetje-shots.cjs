// Maakt contactvellen van de poppetjes via de losse testpagina (tools/poppetje-test.html).
// Gebruik: npx vite --port 4182 --strictPort &   en dan   node tools/poppetje-shots.cjs <uitvoermap> <voorvoegsel> [filter]
// Draait in Chromium zonder videokaart (SwiftShader); de testpagina is klein, dus dat gaat snel genoeg.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const URL = process.env.URL || 'http://localhost:4182/tools/poppetje-test.html';
const out = path.resolve(process.argv[2] || 'docs/hd/poppetjes');
const prefix = process.argv[3] || 'na';
const filter = process.argv[4] || '';
fs.mkdirSync(out, { recursive: true });

const LOOKS = [
  {},
  { female: true, shirt: 0xc2185b, pants: 0x37474f, hair: 0x6b4423 },
  { shirt: 0x1565c0, pants: 0x4e342e, coat: 0x3e4a57, hair: 0x9e9e9e, glasses: true, beard: true },
  { shirt: 0xffffff, pants: 0x9e9e9e, apron: 0xf3e6c8, hat: 'chef', hair: 0x8d6e63 },
  { shirt: 0x2e7d32, pants: 0x263238, jacket: 0x5d4037, hat: 'cap', hatColor: 0x1b5e20, sleeves: 'long' },
  { female: true, shirt: 0xf9a825, pants: 0x1a237e, hairStyle: 'bun', skin: 0x8d5524, hair: 0x1b1b1b },
  { shirt: 0x6a1b9a, pants: 0x212121, hairStyle: 'curly', skin: 0xc68642, hair: 0x2b1b10, scale: 0.92 },
  { shirt: 0xd32f2f, pants: 0x1b1b1b, hat: 'prins', sash: 0xf2c14e, chain: true, hairStyle: 'bald', hair: 0x777777 },
  { shirt: 0x455a64, pants: 0x3e2723, hat: 'tophat', coat: 0x15151a, scale: 1.05 },
  { shirt: 0xff7043, pants: 0x33691e, hat: 'helmet', scale: 0.62 },
];

// naam -> [functie op de testpagina, instellingen]
const SHEETS = {
  lopen: ['sheet', { mode: 'walk', speed: 1.3, dtPhase: 0.14 }],
  'lopen-langzaam': ['sheet', { mode: 'walk', speed: 0.9, dtPhase: 0.18 }],
  speler: ['sheet', { mode: 'walk', speed: 4.0, dtPhase: 0.085 }],
  rennen: ['sheet', { mode: 'walk', speed: 6.5, dtPhase: 0.065 }],
  stilstaan: ['sheet', { mode: 'idle', speed: 0, dtPhase: 0.6 }],
  zitten: ['sheet', { mode: 'sit', speed: 0, dtPhase: 0.6 }],
  fietsen: ['sheet', { mode: 'bike', speed: 5, dtPhase: 0.18, bike: true, cell: 1.9, ppm: 110 }],
  skaten: ['sheet', { mode: 'skate', speed: 6, dtPhase: 0.4 }],
  zwaaien: ['sheet', { mode: 'wave', speed: 0, dtPhase: 0.11 }],
  drinken: ['sheet', { mode: 'drink', speed: 0, dtPhase: 0.3, hold: true, n: 4 }],
  eten: ['sheet', { mode: 'eat', speed: 0, dtPhase: 0.33, hold: true, n: 4 }],
  camera: ['sheet', { mode: 'camera', speed: 0, dtPhase: 0.3, n: 4 }],
  duwen: ['sheet', { mode: 'push', speed: 1.2, dtPhase: 0.15 }],
  vasthouden: ['sheet', { mode: 'walk', speed: 1.3, dtPhase: 0.14, hold: true }],
  polonaise: ['sheet', { mode: 'walk', speed: 1.4, dtPhase: 0.14, after: 'm.userData.parts.armL.rotation.x = -1.3; m.userData.parts.armR.rotation.x = -1.3;' }],
  'rij-voor': ['lineup', { list: LOOKS }],
  'rij-schuin': ['lineup', { list: LOOKS, yaw: 0.75 }],
  'rij-achter': ['lineup', { list: LOOKS, yaw: Math.PI }],
  'rij-zij': ['lineup', { list: LOOKS, yaw: Math.PI / 2 }],
  hoofden: ['lineup', { list: LOOKS.slice(0, 8), yaw: 0.45, ppm: 620, cell: 0.5, zoom: { y: 1.66, h: 0.62 } }],
  handen: ['lineup', { list: [{}, { female: true }, { coat: 0x3e4a57 }], yaw: 0.5, ppm: 1000, cell: 0.75, zoom: { y: 0.9, h: 0.45 } }],
};

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.setDefaultTimeout(180000);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(URL);
  await page.waitForFunction(() => window.__klaar);
  for (const [name, [fn, cfg]] of Object.entries(SHEETS)) {
    if (filter && !filter.split(',').some((f) => name.includes(f))) continue;
    const t0 = Date.now();
    const url = await page.evaluate(([fn, cfg]) => window[fn](cfg), [fn, cfg]);
    fs.writeFileSync(path.join(out, `${prefix}-${name}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
    console.log('gemaakt', `${prefix}-${name}.jpg`, Date.now() - t0, 'ms');
  }
  if (!filter || filter.includes('schuif')) {
    for (const [mode, speed] of [['walk', 0.9], ['walk', 1.3], ['walk', 1.6], ['walk', 2.5], ['walk', 4.0], ['walk', 6.5]]) {
      console.log('schuiven', JSON.stringify(await page.evaluate((c) => window.slip(c), { mode, speed })));
    }
  }
  if (errors.length) console.log('FOUTEN:\n' + errors.join('\n'));
  await browser.close();
})();
