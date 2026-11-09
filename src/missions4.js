// Missies rond de Markt: IJssalon Mezzaluna, de VVV, Rousseau Chocolade en Top1Toys.
// De winkels bestaan echt (namen op de borden); de personen en hun verhalen zijn verzonnen.
import * as THREE from 'three';
import { makeCharacter } from './character.js';
import { startIjs, startBonbons } from './skills4.js';

const G = (text, nl) => ({ text, nl });

function spotAt(g, id, out = 2.4, side = 0) {
  const f = g.facades.frames[id];
  if (!f) return null;
  return g.world.resolve(f.x + f.nx * out + f.nz * side, f.z + f.nz * out - f.nx * side, 0.5);
}

export function setupMarkt(m, g, add) {
  const ijs = spotAt(g, 'mezzaluna', 2.2, 1.2);
  if (ijs) add('ijsjuf', 'IJsverkoopster van Mezzaluna', ijs, { shirt: 0xf7c6d9, pants: 0x333333, apron: 0xffffff, hair: 0x6d4c41, hairStyle: 'long', female: true });
  const vvv = spotAt(g, 'vvv', 3);
  if (vvv) add('toerist', 'Verdwaalde toerist', vvv, { shirt: 0xff7043, pants: 0xd7ccc8, hair: 0x9e9e9e, hat: 'cap', hatColor: 0xfff176, sleeves: 'short', shoes: 0xffffff });
  const choco = spotAt(g, 'rousseau', 2.2);
  if (choco) add('chocolatier', 'De chocolatier', choco, { shirt: 0xffffff, pants: 0x3e2316, apron: 0x5d3a26, hair: 0x212121, hat: 'chef', hatColor: 0xffffff });
  const toys = spotAt(g, 'top1toys', 2.2);
  if (toys) add('kind', 'Jongetje bij Top1Toys', toys, { shirt: 0x42a5f5, pants: 0x1a237e, hair: 0xd7a85b, sleeves: 'short', shoes: 0xe53935, scale: 0.68 });
}

export function marktItems(n) {
  return [
    { id: 'ijsjes', npc: n.ijsjuf, title: 'IJsjes scheppen', place: 'IJssalon Mezzaluna, Markt', desc: 'Het is warm en de rij voor de ijssalon is lang. Schep de ijsjes precies zoals ze besteld worden.' },
    { id: 'toerist', npc: n.toerist, title: 'De verdwaalde toerist', place: 'VVV / Visit Zuid-Limburg Shop, Looierstraat', desc: 'Een toerist snapt niets van zijn wandelkaart. Breng hem langs de kerk, de brouwerij en de Gulp.' },
    { id: 'bonbons', npc: n.chocolatier, title: 'Bonbons sorteren', place: 'Rousseau Chocolade, Rijksweg', desc: 'De lopende band draait door en de hulp is er niet. Sorteer de bonbons in de goede dozen.' },
    { id: 'knuffel', npc: n.kind, title: 'Knuffel kwijt', place: 'Top1Toys, Rijksweg', desc: 'Een jongetje is zijn knuffelbeer kwijt. Vraag rond in het dorp en vind de beer.' },
  ].filter((x) => x.npc);
}

export const MARKT_MISSION_OF = { ijsjuf: 'ijsjes', toerist: 'toerist', chocolatier: 'bonbons', kind: 'knuffel' };

// ------------------------------------------------------------ hulpjes

// het dichtstbijzijnde water (de Gulp) met een begaanbare plek op de oever ernaast
export function findGulp(g, x0, z0) {
  const w = g.world;
  let best = null;
  for (let r = 10; r <= 320 && !best; r += 6) {
    for (let a = 0; a < Math.PI * 2; a += 6 / r) {
      const x = x0 + Math.sin(a) * r, z = z0 + Math.cos(a) * r;
      if (w.classAt(x, z) !== 'water') continue;
      // oever: een stap terug richting het startpunt die niet in het water of in een pand ligt
      for (let k = 2; k <= 10; k += 1) {
        const bx = x - Math.sin(a) * k, bz = z - Math.cos(a) * k;
        if (w.classAt(bx, bz) === 'water' || w.insideBuilding(bx, bz) || w.blocked(bx, bz)) continue;
        best = { water: [x, z], bank: [bx, bz] };
        break;
      }
      if (best) break;
    }
  }
  return best;
}

const COMPASS = ['het noorden', 'het noordoosten', 'het oosten', 'het zuidoosten', 'het zuiden', 'het zuidwesten', 'het westen', 'het noordwesten'];
const compass = (dx, dz) => COMPASS[Math.round(((Math.atan2(dx, -dz) / (Math.PI * 2)) * 8 + 8)) % 8]; // lokale z wijst naar het zuiden

function makeTeddy() {
  const g = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: 0x9c6b3e, roughness: 0.95 });
  const light = new THREE.MeshStandardMaterial({ color: 0xd9b48a, roughness: 0.95 });
  const black = new THREE.MeshStandardMaterial({ color: 0x111111 });
  const s = (r, m, x, y, z, sx = 1, sy = 1, sz = 1) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; g.add(o); return o; };
  s(0.16, fur, 0, 0.17, 0, 1, 1.15, 0.9); // buik
  s(0.11, light, 0, 0.17, 0.1, 0.9, 1, 0.5);
  s(0.12, fur, 0, 0.42, 0); // kop
  s(0.05, light, 0, 0.4, 0.1);
  s(0.015, black, 0, 0.42, 0.15);
  s(0.018, black, -0.045, 0.47, 0.105); s(0.018, black, 0.045, 0.47, 0.105);
  s(0.045, fur, -0.09, 0.53, 0); s(0.045, fur, 0.09, 0.53, 0); // oren
  s(0.06, fur, -0.16, 0.22, 0.03); s(0.06, fur, 0.16, 0.22, 0.03); // armen
  s(0.07, fur, -0.08, 0.04, 0.06); s(0.07, fur, 0.08, 0.04, 0.06); // pootjes
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.02, 6, 12), new THREE.MeshStandardMaterial({ color: 0xe53935 }));
  bow.position.set(0, 0.32, 0.09); g.add(bow);
  g.scale.setScalar(1.6);
  return g;
}

// Eigen minispel-lus voor missies waarin je gewoon rondloopt (zoals de kabouterjacht).
function runWalk(g, update, cleanup, debug = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (r) => { if (done) return; done = true; g.minigame = null; cleanup?.(); resolve(r); };
    // het gesprek dat de missie start zet de speler vast; hier loop je juist rond
    g.minigame = { stop: () => finish(null), update: (dt) => { g.player.lockedFor = false; update(dt, finish); }, debug: { label: null, ...debug } };
  });
}

// ------------------------------------------------------------ missies

export const marktHandlers = {
  // IJssalon Mezzaluna: ijsjes stapelen
  async ijsjuf(npc, N, ui, g) {
    const a = await ui.dialog(N, [
      G('Enne? Zie je die rij? Half Gullepe wil een ijsje en mijn collega is aangefietst naar de tandarts.', 'En? Zie je die rij? Half Gulpen wil een ijsje en mijn collega is naar de tandarts.'),
      'Kun jij scheppen? Precies zoals besteld, van onder naar boven. De schep zwiert een beetje, dus laat los als hij boven het ijsje hangt: scheef is splat.',
      'Vijf klanten blij maken. Lukt dat, dan mag jij er zelf ook een.',
    ], ['Ik schep!', 'Ik ben op dieet']);
    if (a !== 0) { await ui.dialog(N, ['Op dieet? Bij dertig graden? Dan heb je hier niks te zoeken, jong.']); return; }
    if (g.mode === 'car') g.exitCar();
    g.setMode('walk');
    this.setActive('ijsjes', 'IJsjes scheppen', 'Tik op de juiste smaak als de zwierende schep boven het ijsje hangt (de stippellijn wordt groen). Bolletjes in de volgorde van het bonnetje.', '0 / 5 klanten');
    const r = await startIjs(g, { need: 5, maxMistakes: 4, limit: 80 });
    if (!r || this.active?.id !== 'ijsjes') return;
    if (r.ok) {
      await ui.dialog(N, [
        r.mistakes === 0 ? 'Geen bolletje gemorst! Jij bent geboren achter de toonbank.' : 'Hier en daar een splat, maar iedereen heeft een ijsje. Hiel leuk gedaan!',
        'Deze is voor jou: drie bolletjes, van de zaak.',
      ]);
      this.complete('ijsjes', 'IJsmeester van de Markt!');
    } else {
      await ui.dialog(N, [r.mistakes >= 4 ? 'De toonbank ligt vol ijs en de klanten zijn weg. Dat wordt dweilen...' : 'De rij is alleen maar langer geworden! Probeer het straks nog eens.']);
      this.fail('IJsjes niet op tijd geschept.');
    }
  },

  // Rousseau Chocolade: bonbons sorteren
  async chocolatier(npc, N, ui, g) {
    const a = await ui.dialog(N, [
      'Goedendag! Mijn hulp is er vandaag niet en de lopende band stopt niet vanzelf.',
      'Puur, melk, wit en praliné, elk in de eigen doos. Praliné lijkt op melk, maar heeft een hazelnoot erop. Zie je een gebroken bonbon? Die mag je opeten. Kwaliteitscontrole noemen we dat.',
      G('Kun je me even uithelpen? Vijfentwintig bonbons in de goede doos, en de band gaat steeds sneller.', 'Kun je me even helpen? Vijfentwintig bonbons in de goede doos, en de band gaat steeds sneller.'),
    ], ['Ik help je!', 'Ik eet ze liever allemaal op']);
    if (a !== 0) { await ui.dialog(N, ['Dat zeggen ze allemaal. En dan staan ze na tien bonbons groen en geel om de hoek.']); return; }
    if (g.mode === 'car') g.exitCar();
    g.setMode('walk');
    this.setActive('bonbons', 'Bonbons sorteren', 'Stuur de voorste bonbon naar de goede doos: puur, melk, wit of praliné (met hazelnoot). Gebroken bonbons eet je op. Drie fouten en je bent af.', '0 / 25 bonbons');
    const r = await startBonbons(g, { need: 25, maxMistakes: 3, limit: 60 });
    if (!r || this.active?.id !== 'bonbons') return;
    if (r.ok) {
      await ui.dialog(N, [
        `Vijfentwintig bonbons netjes gesorteerd${r.eaten ? `, en ${r.eaten} gebroken exemplaren grondig gecontroleerd` : ''}. Een echte chocolatier!`,
        'Neem een doosje mee voor thuis. Of voor onderweg, ik zie je denken.',
      ]);
      this.complete('bonbons', 'Bonbonbaas van Gulpen!');
    } else {
      await ui.dialog(N, [r.mistakes >= 3 ? 'Witte bonbons in de doos met puur... de klanten gaan klagen. Nog een keer?' : 'De band was sneller dan jij! Probeer het nog eens.']);
      this.fail('Bonbons niet gesorteerd.');
    }
  },

  // VVV: een verdwaalde toerist rondleiden langs drie plekken
  async toerist(npc, N, ui, g) {
    const w = g.world;
    const a = await ui.dialog(N, [
      'Pardon! Ik heb hier een wandelkaart van de VVV, maar ik houd hem al een uur ondersteboven, geloof ik.',
      'Iemand zei net "Wablief?" tegen me. Is dat een plaats? Een gerecht? Ik snap er niks van.',
      'Wil jij me rondleiden? De kerk, de bierbrouwerij en het riviertje. Loop maar voor, ik loop achter je aan. Niet te snel, hè!',
    ], ['Loop maar mee!', 'Ik ben zelf ook verdwaald']);
    if (a !== 0) { await ui.dialog(N, ['Ook verdwaald? In zo\'n klein dorp? Dan zijn we met z\'n tweeën. Gezellig.']); return; }
    const pois = Object.fromEntries((w.meta.pois || []).map((p) => [p.id, p]));
    const stops = [];
    if (pois.kerk) stops.push({ name: 'de kerk', pos: w.spotNear(...pois.kerk.pos), q: 'Wat een mooie kerk! Hoe heet die?', options: ['De Sint-Petruskerk', 'De Sint-Servaasbasiliek', 'De Notre-Dame'], good: 0, line: 'Sint-Petrus! Die zet ik op mijn ansichtkaart.' });
    const br = spotAt(g, 'brouwerij', 4);
    if (br) stops.push({ name: 'de brouwerij', pos: br, q: 'Ruik je dat? Wat wordt hier gemaakt?', options: ['Bier: dit is de Gulpener Bierbrouwerij', 'Limonade', 'Zuurkool'], good: 0, line: 'Gulpener! Dan weet ik wat ik vanavond drink.' });
    const gulp = findGulp(g, npc.pos.x, npc.pos.z);
    if (gulp) stops.push({ name: 'het riviertje', pos: gulp.bank, q: 'Wat een schattig riviertje. Is dat de Maas?', options: ['Nee, dit is de Gulp', 'Ja, dit is de Maas', 'Nee, dit is de Rijn'], good: 0, line: 'De Gulp! Vandaar de naam Gulpen. Ik leer elke minuut wat bij.' });
    if (stops.length < 2) { await ui.dialog(N, ['Hm, op deze kaart staat helemaal niks. Laat maar zitten.']); return; }
    // dichtstbijzijnde eerst, dan steeds de volgende dichtstbijzijnde
    const ordered = [];
    let from = [npc.pos.x, npc.pos.z];
    while (stops.length) {
      stops.sort((p, q) => Math.hypot(p.pos[0] - from[0], p.pos[1] - from[1]) - Math.hypot(q.pos[0] - from[0], q.pos[1] - from[1]));
      const s = stops.shift(); ordered.push(s); from = s.pos;
    }
    if (g.mode === 'car') g.exitCar();
    g.setMode('walk');
    this.setActive('toerist', 'De verdwaalde toerist', `Loop voor de toerist uit naar ${ordered[0].name}. Hij loopt achter je aan, dus niet te hard rennen. Te voet!`, `0 / ${ordered.length} plekken`);
    this.active.noVehicles = true;
    // de toerist loopt mee als kopie; de echte staat zolang verstopt
    const model = makeCharacter(npc.look);
    const tour = { x: npc.pos.x, z: npc.pos.z, heading: 0, lost: false };
    model.position.set(tour.x, w.groundAt(tour.x, tour.z), tour.z);
    g.scene.add(model);
    npc.group.visible = false;
    const lostMarker = { x: tour.x, z: tour.z, color: '#ff7043', glyph: '!', done: true };
    g.tempMarkers = [lostMarker];
    let idx = 0, right = 0, t = 0, busy = false;
    const trail = []; // jouw looproute: de toerist loopt precies daarover, zo blijft hij niet achter een hoek hangen
    const limit = 75 + ordered.length * 55;
    g.setTarget({ pos: new THREE.Vector3(ordered[0].pos[0], 0, ordered[0].pos[1]) });
    const restore = () => { g.scene.remove(model); npc.group.visible = true; g.tempMarkers = []; g.setTarget(null); g.ui.timer(null); };
    this.active.cleanup = restore;
    const r = await runWalk(g, (dt, finish) => {
      t += dt;
      const p = g.player;
      if (!busy) g.ui.timer(`${Math.max(0, Math.ceil(limit - t))} s`);
      // achter de speler aan lopen
      const d = Math.hypot(p.x - tour.x, p.z - tour.z);
      let sp = 0;
      if (d > 18 && !tour.lost) { tour.lost = true; lostMarker.done = false; g.ui.toast('"Wacht even! Ik ben geen marathonloper!" Ga terug naar de toerist.', 2600); g.sfx?.play('fail'); }
      if (tour.lost && d < 7) { tour.lost = false; lostMarker.done = true; trail.length = 0; g.ui.toast('"Daar ben je! Rustig aan, hè."', 1600); }
      const last = trail[trail.length - 1];
      if (!last || Math.hypot(p.x - last[0], p.z - last[1]) > 0.6) trail.push([p.x, p.z]);
      if (!tour.lost && !busy && d > 2.4) {
        // volgende punt van het spoor (of rechtstreeks naar je toe als het spoor op is)
        while (trail.length > 1 && Math.hypot(trail[0][0] - tour.x, trail[0][1] - tour.z) < 0.5) trail.shift();
        const [gx, gz] = trail.length > 1 ? trail[0] : [p.x, p.z];
        sp = Math.min(5.2, (d - 2.2) * 2.2);
        tour.heading = Math.atan2(gx - tour.x, gz - tour.z);
        const step = Math.min(sp * dt, Math.hypot(gx - tour.x, gz - tour.z));
        [tour.x, tour.z] = w.resolve(tour.x + Math.sin(tour.heading) * step, tour.z + Math.cos(tour.heading) * step, 0.4);
      }
      if (trail.length > 400) trail.splice(0, trail.length - 400);
      lostMarker.x = tour.x; lostMarker.z = tour.z;
      model.position.set(tour.x, w.groundAt(tour.x, tour.z), tour.z);
      model.rotation.y = busy ? Math.atan2(ordered[Math.max(0, idx - 1)]?.pos[0] - tour.x || 0, ordered[Math.max(0, idx - 1)]?.pos[1] - tour.z || 1) : tour.heading;
      model.userData.animate(dt, sp, 'walk');
      if (t > limit && !busy) { finish({ ok: false, right, idx }); return; }
      // aangekomen bij de volgende plek (de toerist moet er ook zijn)
      const s = ordered[idx];
      if (!busy && s && Math.hypot(p.x - s.pos[0], p.z - s.pos[1]) < 8 && Math.hypot(tour.x - s.pos[0], tour.z - s.pos[1]) < 11) {
        busy = true;
        g.setTarget(null);
        (async () => {
          g.sfx?.play('camera');
          g.ui.toast('Klik! De toerist maakt een selfie.', 1400);
          const order = s.options.map((o, i) => i).sort(() => Math.random() - 0.5);
          const ans = order[await ui.dialog(N, [s.q], order.map((i) => s.options[i]))];
          if (!g.minigame) return;
          if (ans === s.good) { right++; await ui.dialog(N, [s.line]); }
          else await ui.dialog(N, [`Echt waar? Dat schrijf ik op... Hoewel, op het bordje staat iets anders. Nou ja.`]);
          if (!g.minigame) return;
          idx++;
          this.progress(`${idx} / ${ordered.length} plekken`);
          if (idx >= ordered.length) { finish({ ok: true, right, idx }); return; }
          const nx = ordered[idx];
          g.setTarget({ pos: new THREE.Vector3(nx.pos[0], 0, nx.pos[1]) });
          if (this.active) { this.active.desc = `Nu naar ${nx.name}. De toerist loopt achter je aan.`; this.refresh(); }
          busy = false;
        })();
      }
    }, restore, { tour, trail });
    if (!r || this.active?.id !== 'toerist') return;
    this.active.cleanup = null;
    if (r.ok) {
      await ui.dialog(N, [
        right === ordered.length ? 'Alles goed uitgelegd! Jij moet bij de VVV gaan werken.' : `${right} van de ${ordered.length} goed uitgelegd. De rest zoek ik thuis wel op.`,
        'Bedankt! Nu ga ik eerst een vlaai eten. Waar was dat ook alweer... Nee, grapje. Ik vind het zelf wel.',
      ]);
      this.complete('toerist', 'Beste gids van Gulpen!', { v: right, unit: `van de ${ordered.length} goed`, high: true });
    } else {
      await ui.dialog(N, ['Mijn bus vertrekt zo. Ik heb maar de helft gezien... Volgende keer beter!']);
      this.fail('De toerist is niet overal geweest.');
    }
  },

  // Top1Toys: knuffelbeer kwijt, vraag rond bij voorbijgangers
  async kind(npc, N, ui, g) {
    const w = g.world;
    const a = await ui.dialog(N, [
      'Ik ben Bobbie kwijt! Mijn beer! Hij heeft een rood strikje.',
      'Er liep een hond langs en toen... was Bobbie weg. Mama zegt dat ik hier moet wachten.',
      'Wil jij hem zoeken? Er staan mensen op straat die het misschien gezien hebben. Vraag het aan hen!',
    ], ['Ik vind Bobbie!', 'Koop gewoon een nieuwe, je staat voor een speelgoedwinkel']);
    if (a !== 0) { await ui.dialog(N, ['Een nieuwe?! Bobbie is UNIEK! Hij is ouder dan ik!']); return; }
    if (g.mode === 'car') g.exitCar();
    // de beer ligt ergens in het dorp, getuigen staan tussen hier en daar
    const [bx, bz] = g.randomAddress(55, 140);
    const teddy = makeTeddy();
    teddy.position.set(bx, w.groundAt(bx, bz), bz);
    teddy.rotation.set(0, Math.random() * 6.28, 0.35);
    g.scene.add(teddy);
    const dx = bx - npc.pos.x, dz = bz - npc.pos.z;
    const street = w.nearestStreet(bx, bz)?.name;
    const pois = (w.meta.pois || []).map((p) => ({ name: p.name, d: Math.hypot(p.pos[0] - bx, p.pos[1] - bz) })).filter((p) => p.d < 45).sort((p, q) => p.d - q.d);
    const hints = [
      `Ja! Een hond met iets bruins in zijn bek. Hij rende naar ${compass(dx, dz)}, gezien vanaf de speelgoedwinkel.`,
      street ? `Een beertje met een rood strikje? Volgens mij lag er zoiets aan ${/(plein|veld|hof|park)$/i.test(street) ? 'het' : 'de'} ${street}.` : 'Een beertje? Ik zag de hond de straat oversteken, die kant op.',
      pois.length ? `Ik zag die hond bij ${pois[0].name}. Daar liet hij iets vallen, geloof ik.` : `Die hond? Die liep een meter of ${Math.round(Math.hypot(dx, dz) / 10) * 10} van de speelgoedwinkel weg.`,
    ];
    const looks = [
      { shirt: 0x8e24aa, pants: 0x37474f, hair: 0xbdbdbd, hairStyle: 'long', female: true },
      { shirt: 0x2e7d32, pants: 0x5d4037, hair: 0x3e2723, hat: 'cap', hatColor: 0x2e7d32 },
      { shirt: 0xfdd835, pants: 0x263238, hair: 0x111111, sleeves: 'short' },
    ];
    const witnesses = [];
    for (let i = 0; i < 3; i++) {
      const k = (i + 1) / 4;
      let spot = null;
      for (let tries = 0; tries < 30 && !spot; tries++) {
        const jx = npc.pos.x + dx * k + (Math.random() - 0.5) * 30, jz = npc.pos.z + dz * k + (Math.random() - 0.5) * 30;
        const [rx, rz] = w.resolve(jx, jz, 0.5);
        if (!w.insideBuilding(rx, rz) && !w.blocked(rx, rz) && w.classAt(rx, rz) !== 'water') spot = [rx, rz];
      }
      if (!spot) spot = w.resolve(npc.pos.x + dx * k, npc.pos.z + dz * k, 0.5);
      const model = makeCharacter(looks[i]);
      model.position.set(spot[0], w.groundAt(spot[0], spot[1]), spot[1]);
      g.scene.add(model);
      const marker = { x: spot[0], z: spot[1], color: '#4fc3f7', glyph: '?', done: false };
      witnesses.push({ model, x: spot[0], z: spot[1], marker, asked: false });
    }
    g.tempMarkers = witnesses.map((q) => q.marker);
    this.setActive('knuffel', 'Knuffel kwijt', 'Vraag de mensen met het blauwe vraagteken op de kaart wat ze gezien hebben. Zoek dan beer Bobbie (rood strikje) en breng hem terug.', '0 / 3 mensen gesproken · beer nog zoek');
    let t = 0, asked = 0, found = false, busy = false;
    const limit = 210;
    const restore = () => { witnesses.forEach((q) => g.scene.remove(q.model)); g.scene.remove(teddy); g.tempMarkers = []; g.setTarget(null); g.ui.timer(null); g.dropProp?.(); };
    this.active.cleanup = restore;
    const status = () => this.progress(`${asked} / 3 mensen gesproken · ${found ? 'beer gevonden, terug naar het jongetje!' : 'beer nog zoek'}`);
    const r = await runWalk(g, (dt, finish) => {
      t += dt;
      const p = g.player;
      g.ui.timer(`${Math.max(0, Math.ceil(limit - t))} s`);
      if (t > limit) { finish({ ok: false, asked, found }); return; }
      for (const q of witnesses) {
        q.model.rotation.y = Math.atan2(p.x - q.x, p.z - q.z);
        q.model.userData.animate(dt, 0, !q.asked && Math.hypot(p.x - q.x, p.z - q.z) < 14 ? 'wave' : 'idle');
        if (busy || q.asked || Math.hypot(p.x - q.x, p.z - q.z) > 2.6) continue;
        q.asked = true; q.marker.done = true; busy = true;
        const hint = hints[asked];
        asked++;
        (async () => {
          await ui.dialog('Voorbijganger', [hint]);
          busy = false;
          status();
        })();
      }
      // de beer: wipt een beetje, zodat je hem van dichtbij ziet
      if (!found) {
        teddy.position.y = w.groundAt(bx, bz) + Math.abs(Math.sin(t * 3)) * 0.12;
        if (Math.hypot(p.x - bx, p.z - bz) < 2.2 && !busy) {
          found = true;
          g.scene.remove(teddy);
          g.holdProp?.(teddy);
          teddy.rotation.set(0, 0, 0);
          teddy.scale.setScalar(0.75);
          g.sfx?.play('coin');
          g.ui.toast('Bobbie gevonden! Breng hem terug naar het jongetje.', 2200);
          g.setTarget({ pos: new THREE.Vector3(npc.pos.x, 0, npc.pos.z) });
          status();
        }
      } else if (Math.hypot(p.x - npc.pos.x, p.z - npc.pos.z) < 3) finish({ ok: true, asked, found, time: t });
    }, restore, { teddy: [bx, bz] });
    if (!r || this.active?.id !== 'knuffel') return;
    this.active.cleanup = null;
    if (r.ok) {
      g.dropProp?.();
      await ui.dialog(N, [
        'BOBBIE! Je bent terug!',
        r.asked < 3 ? 'En je wist hem te vinden zonder iedereen te vragen. Ben jij een detective?' : 'Dank je wel! Mama, mag die een ijsje? Die heeft Bobbie gered!',
      ]);
      this.complete('knuffel', 'Knuffelheld van Gulpen!');
    } else {
      await ui.dialog(N, ['Bobbie is nog steeds weg... Misschien is hij op avontuur. Zoek je straks nog eens?']);
      this.fail('Bobbie niet op tijd gevonden.');
    }
  },
};

if (typeof location !== 'undefined' && location.search.includes('dev')) window.__markt = { findGulp, compass };
