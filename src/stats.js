// Eenvoudige, anonieme speltelling via GoatCounter (https://www.goatcounter.com).
// Geen cookies, geen persoonsgegevens: alleen tellers.
//
//   speler-nieuw   1x per apparaat/browser   = hoeveel verschillende mensen (ongeveer)
//   spel-gestart   elke keer op "Speel"      = hoeveel keer er gespeeld is
//   speelminuut    elke gespeelde minuut     = totale speeltijd in minuten
//   drie-missies   1x per apparaat           = hoeveel spelers er 3 missies halen
//   haperend/...   1x per sessie             = het spel liep een tijdje schokkerig (onder 40 beelden/s), per soort apparaat
//   soepel/...     1x per sessie             = na 2 minuten spelen liep het soepel (ter vergelijking)
//
//   (pagina)       elke keer dat iemand de game opent = bezoekers, ook wie niet op "Speel" drukt
//
// Dashboard: https://10horn.goatcounter.com (de code hieronder; leeg maken zet de telling uit).
import { STORE, GOATCOUNTER } from './config.js';
const GOATCOUNTER_CODE = GOATCOUNTER; // uit in de HD-proefversie, zodat de telling van de echte game schoon blijft (zie config.js)

const KEY = STORE + 'stats';
// Niet tellen: zonder code, lokaal testen, met ?dev of ?nostats, of op een apparaat waar
// localStorage 'skipgc' op 't' staat (zelfde schakelaar als GoatCounter zelf gebruikt; handig voor je eigen telefoon).
const off = () => {
  if (!GOATCOUNTER_CODE) return true;
  if (/^(localhost$|127\.|192\.168\.|10\.)/.test(location.hostname)) return true;
  if (/[?&](dev|nostats)\b/.test(location.search)) return true;
  try { if (localStorage.getItem('skipgc') === 't') return true; } catch { /* negeren */ }
  return false;
};

// Zelfde verzoek als GoatCounters eigen count.js: /count met e=true (telt als event, niet als pagina).
function send(event, isEvent = true) {
  if (off()) return;
  const q = new URLSearchParams({ p: event, t: isEvent ? event : document.title, e: String(isEvent), s: String(screen.width), r: isEvent ? '' : document.referrer, rnd: Math.random().toString(36).slice(2, 7) });
  const url = `https://${GOATCOUNTER_CODE}.goatcounter.com/count?${q}`;
  try {
    if (!navigator.sendBeacon || !navigator.sendBeacon(url)) new Image().src = url;
  } catch { /* negeren */ }
}

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function save(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* negeren */ }
}

// Aanroepen zodra de pagina opent: een gewone paginaweergave (met verwijzer, bijv. Facebook of WhatsApp).
export function statsPageview() {
  send(location.pathname || '/', false);
}

// Aanroepen zodra iemand op "Speel" drukt.
export function statsStart() {
  if (off()) return;
  const s = load();
  if (!s.seen) { s.seen = Date.now(); save(s); send('speler-nieuw'); }
  send('spel-gestart');
  // speelminuten: alleen tellen terwijl het spel echt in beeld is
  let visibleMs = 0, last = performance.now();
  setInterval(() => {
    const now = performance.now();
    if (document.visibilityState === 'visible') visibleMs += Math.min(now - last, 20000);
    last = now;
    while (visibleMs >= 60000) { visibleMs -= 60000; send('speelminuut'); }
  }, 10000);
}

// Aanroepen na elke afgeronde missie, met het totaal aantal afgeronde missies.
export function statsMissions(doneCount) {
  if (off() || doneCount < 3) return;
  const s = load();
  if (s.three) return;
  s.three = Date.now(); save(s);
  send('drie-missies');
}

// Foutmeldingen anoniem meetellen (één keer per soort per sessie), zodat we zien wat er op telefoons misgaat.
const reported = new Set();
export function statsError(kind, msg = '') {
  const key = `fout/${kind}${msg ? '/' + String(msg).replace(/\s+/g, ' ').slice(0, 80) : ''}`;
  if (reported.has(key) || reported.size > 20) return;
  reported.add(key);
  send(key);
}

// Hoe soepel loopt het spel? Eén keer per sessie: 'haperend' als het een tijdje onder 40 beelden per seconde zat,
// anders na twee minuten 'soepel'. Per soort apparaat (mobiel/computer), zodat we zien of nieuwe dingen te zwaar zijn.
let perfSent = false;
export function statsPerf(kind, device, fps) {
  if (perfSent) return;
  perfSent = true;
  send(`${kind}/${device}/${Math.round(fps / 5) * 5}fps`);
}
