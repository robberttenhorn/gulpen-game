// Kwaliteitsstanden van de HD-versie.
// - 'hoog'   : computer. Alles aan: grote schaduwkaart, ambient occlusion, zonnestralen, scherptediepte,
//              dicht gras, fijne texturen (laden op de achtergrond bij).
// - 'midden' : zwakkere computer of tablet. Zelfde beeld, maar zonder de zwaarste nabewerking en met minder gras.
// - 'laag'   : telefoon. Eenvoudig en soepel: kleine texturen, geen nabewerking behalve kleurcorrectie.
// De stand volgt uit het apparaat, of uit ?kwaliteit=hoog|midden|laag in de adresbalk (dat wordt onthouden).
// De automatische regeling in main.js (adaptQuality) zakt tijdens het spelen verder af als het hapert.
const KEY = 'gulpehd-kwaliteit';

export const isMobile = matchMedia('(pointer: coarse)').matches || innerWidth < 800;

function pick() {
  let want = null;
  try {
    const q = new URLSearchParams(location.search).get('kwaliteit');
    if (q && ['hoog', 'midden', 'laag'].includes(q)) { want = q; localStorage.setItem(KEY, q); }
    else if (q === 'auto') localStorage.removeItem(KEY);
    else want = localStorage.getItem(KEY);
  } catch { /* geen opslag: dan automatisch */ }
  if (!['hoog', 'midden', 'laag'].includes(want)) want = isMobile ? 'laag' : 'hoog';
  return want;
}

const LEVELS = {
  hoog: {
    schaduw: 4096, schaduwBereik: 85, msaa: 4, maxPixels: 2.6e6, maxRatio: 2,
    ao: true, zonnestralen: true, scherptediepte: true, bloom: true, korrel: true,
    texFijn: true, gras: 1, boomBereik: 220, begroeiingBereik: 300, natteWeg: true, aniso: 16,
  },
  midden: {
    schaduw: 2048, schaduwBereik: 70, msaa: 2, maxPixels: 2.0e6, maxRatio: 1.5,
    ao: true, zonnestralen: false, scherptediepte: false, bloom: true, korrel: true,
    texFijn: false, gras: 0.5, boomBereik: 170, begroeiingBereik: 240, natteWeg: true, aniso: 8,
  },
  laag: {
    schaduw: 1024, schaduwBereik: 60, msaa: 0, maxPixels: 2.2e6, maxRatio: 1.5,
    ao: false, zonnestralen: false, scherptediepte: false, bloom: false, korrel: false,
    texFijn: false, gras: 0, boomBereik: 120, begroeiingBereik: 200, natteWeg: false, aniso: 4,
  },
};

const name = pick();
// Q.name is de gekozen stand; Q.hoog / Q.laag zijn handig voor snelle keuzes in de code.
export const Q = { name, hoog: name === 'hoog', laag: name === 'laag', ...LEVELS[name] };

export function setQuality(n) {
  try { if (n) localStorage.setItem(KEY, n); else localStorage.removeItem(KEY); } catch { /* negeren */ }
  location.reload();
}
