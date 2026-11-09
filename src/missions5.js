// Missies over de geschiedenis en de feesten van Gulpen: de glazen piramide Primosa, de Romeinse weg,
// Restaurant Atelier, de Gulpener Bierfeesten met Feestkabinet, de korenwolf en de forellenkweker.
// De historische feiten komen van de maker van de game; de personen en grappen zijn verzonnen.
import * as THREE from 'three';
import { makeCharacter } from './character.js';
import { startOpgraving, startBord, startTappen, startWildcamera, startForellen } from './skills5.js';
import { buildBierfeest } from './feest.js';
import { streetSpot } from './missions3.js';
import { findGulp } from './missions4.js';
import { startDrone } from './drone.js';

const G = (text, nl) => ({ text, nl });

function spotAt(g, id, out = 2.4, side = 0) {
  const f = g.facades.frames[id];
  if (!f) return null;
  return g.world.resolve(f.x + f.nx * out + f.nz * side, f.z + f.nz * out - f.nx * side, 0.5);
}

// een open veld (akker of weiland) rond het dorp, met een straat in de buurt
function findField(g, from, rMin = 260, rMax = 560, kinds = ['akker']) {
  const w = g.world;
  let best = null;
  for (let r = rMin; r <= rMax && !best; r += 20) {
    for (let a = 0; a < Math.PI * 2 && !best; a += 12 / r) {
      const x = from[0] + Math.sin(a) * r, z = from[1] + Math.cos(a) * r;
      const c = w.classAt(x, z);
      if (!kinds.includes(c)) continue;
      let open = true;
      for (let k = 0; k < 10 && open; k++) { const b = (k / 10) * Math.PI * 2; const qx = x + Math.sin(b) * 22, qz = z + Math.cos(b) * 22; if (w.insideBuilding(qx, qz) || w.classAt(qx, qz) === 'water' || w.classAt(qx, qz) === 'bos') open = false; }
      if (!open) continue;
      const st = w.nearestStreet(x, z);
      if (!st || st.dist > 45) continue;
      best = { center: [x, z], street: [st.x, st.z] };
    }
  }
  // geen akker gevonden? dan een weiland
  if (!best && kinds.length === 1) return findField(g, from, rMin, rMax, ['akker', 'gras']);
  return best;
}

function makeDog() {
  const g = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3e2723 });
  const b = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  b(0.28, 0.26, 0.62, fur, 0, 0.42, 0);
  const head = b(0.24, 0.24, 0.26, fur, 0, 0.62, 0.38);
  b(0.12, 0.1, 0.14, dark, 0, 0.58, 0.55);
  b(0.06, 0.12, 0.04, dark, -0.09, 0.78, 0.34); b(0.06, 0.12, 0.04, dark, 0.09, 0.78, 0.34);
  const legs = [[-0.1, 0.2], [0.1, 0.2], [-0.1, -0.22], [0.1, -0.22]].map(([x, z]) => b(0.07, 0.3, 0.07, fur, x, 0.15, z));
  const tail = b(0.05, 0.05, 0.26, fur, 0, 0.55, -0.4);
  tail.rotation.x = -0.6;
  let t = 0;
  // de polonaise verwacht armen; een hond heeft er geen, dus losse dummies
  g.userData.parts = { armL: new THREE.Object3D(), armR: new THREE.Object3D() };
  g.userData.animate = (dt, speed = 0) => {
    t += dt;
    tail.rotation.y = Math.sin(t * 14) * 0.6;
    legs.forEach((l, i) => { l.rotation.x = speed > 0.3 ? Math.sin(t * 12 + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI : 0)) * 0.5 : 0; });
    head.rotation.x = Math.sin(t * 3) * 0.05;
  };
  return g;
}

export function setupGeschiedenis(m, g, add) {
  const w = g.world;
  const prim = g.facades.primosa;
  if (prim) add('conservator', 'Conservator van de Primosa', prim.entrance, { shirt: 0x212121, pants: 0x212121, hair: 0xbdbdbd, glasses: true, coat: 0x4a148c });
  // archeoloog aan de Oude Akerweg, de oude Romeinse weg
  const oak = streetSpot(g, 'Oude Akerweg', 0.3, 4.2);
  if (oak) add('archeoloog', 'Archeologe', oak, { shirt: 0xc8a26b, pants: 0x5d4037, hair: 0x6d4c41, hairStyle: 'long', female: true, hat: 'cap', hatColor: 0x8d6e63 });
  const at = spotAt(g, 'atelier', 2.2, -1.2);
  if (at) add('chef', 'Chef van Restaurant Atelier', at, { shirt: 0xffffff, pants: 0x212121, apron: 0x212121, hair: 0x3e2723, hat: 'chef', hatColor: 0xffffff });
  // de voorzitter van de Gulpener Bierfeesten wacht bij Café Neubourg (het podium komt pas tijdens de missie bij Mezzaluna)
  const vz = spotAt(g, 'neubourg', 3, 0) || spotAt(g, 'mezzaluna', 3.2, -4.5);
  if (vz) add('voorzitter', 'Voorzitter van de Gulpener Bierfeesten', vz, { shirt: 0xffffff, pants: 0x263238, coat: 0x123a24, hair: 0x9e9e9e, sash: 0xf2c14e });
  // bioloog aan de rand van het dorp, bij een veld
  const field = findField(g, g.startPos || [0, 0]);
  if (field) {
    m.korenField = field;
    add('bioloog', 'Bioloog met verrekijker', w.resolve(...field.street, 0.5), { shirt: 0x558b2f, pants: 0x4e342e, hair: 0xe6c770, hat: 'cap', hatColor: 0x33691e });
  }
  // dronefotograaf op het plein bij de Sint-Petruskerk, een stukje van de koster af
  const kerk = (w.meta.pois || []).find((p) => p.id === 'kerk');
  if (kerk) {
    const k = m.npcs.koster;
    let [dx, dz] = w.spotNear(...kerk.pos);
    if (k && Math.hypot(k.pos.x - dx, k.pos.z - dz) < 8) { const ax = dx - k.pos.x || 1, az = dz - k.pos.z, d = Math.hypot(ax, az) || 1; [dx, dz] = w.resolve(k.pos.x + (ax / d) * 9, k.pos.z + (az / d) * 9, 0.5); }
    add('dronepiloot', 'Dronefotograaf', [dx, dz], { shirt: 0x37474f, pants: 0x212121, hair: 0x3e2723, hat: 'cap', hatColor: 0xff7043, sleeves: 'short', shoes: 0xffffff });
  }
  // forellenkweker aan de Gulp, vlak bij de Looierstraat
  const lp = w.streetPath?.('Looierstraat');
  const from = lp?.length ? lp[Math.floor(lp.length / 2)] : [20, -40];
  const gulp = findGulp(g, from[0], from[1]);
  if (gulp) {
    m.kwekerSpot = gulp.bank;
    add('kweker', 'Forellenkweker', w.resolve(...gulp.bank, 0.5), { shirt: 0x37474f, pants: 0x263238, hair: 0x9e9e9e, coat: 0x2e7d32, shoes: 0x1b5e20 });
  }
}

export function geschiedenisItems(n) {
  return [
    { id: 'primosa', npc: n.conservator, title: 'Kunst in de piramide', place: 'Piramide Primosa, Landsraderweg 7', desc: 'De tentoonstelling in de glazen piramide opent, maar er komt geen hond op af. Haal bezoekers uit de buurt voor de Mona Liesje.' },
    { id: 'romeinen', npc: n.archeoloog, title: 'De Romeinse weg', place: 'Oude Akerweg', desc: 'De Oude Akerweg was de Romeinse weg van Maastricht naar Aken. Help de archeologe graven naar Romeinse vondsten.' },
    { id: 'atelier', npc: n.chef, title: 'Een bord is een schilderij', place: 'Restaurant Atelier, Markt 9', desc: 'Het restaurant zit vol en de souschef is ziek. Maak de borden op precies zoals de chef ze voordoet.' },
    { id: 'bierfeesten', npc: n.voorzitter, title: 'Tappen op de Bierfeesten', place: 'Markt, bij Café Neubourg (alleen \'s avonds)', desc: 'Het grootste feest van het jaar, Feestkabinet staat op het podium, maar de tappers zijn kwijt. Tap jij? Het feest begint pas als het avond is: drink eerst een pilsje bij De Zwarte Ruiter.', nightOnly: true },
    { id: 'korenwolf', npc: n.bioloog, title: 'Zit de korenwolf er nog?', place: 'Velden aan de rand van het dorp', desc: 'Hang wildcamera\'s op in het veld en kijk de nachtfoto\'s na. Zit de korenwolf er nog, of niet?' },
    { id: 'drone', npc: n.dronepiloot, title: 'Gulpen van bovenaf', place: 'Plein bij de Sint-Petruskerk', desc: 'Vlieg met een drone door de lichtringen over het dorp. Bij de gouden ringen maakt hij luchtfoto\'s voor de VVV.' },
    { id: 'forellen', npc: n.kweker, title: 'Forellen scheppen', place: 'Aan de Gulp, bij de Looierstraat', desc: 'Help de forellenkweker met een bestelling: schep alleen de grote forellen uit de kweekvijver.' },
  ].filter((x) => x.npc);
}

export const GESCHIEDENIS_MISSION_OF = { conservator: 'primosa', archeoloog: 'romeinen', chef: 'atelier', voorzitter: 'bierfeesten', bioloog: 'korenwolf', kweker: 'forellen', dronepiloot: 'drone' };

export const geschiedenisHandlers = {
  // ------------------------------------------------------------ de glazen piramide Primosa
  async conservator(npc, N, ui, g) {
    if (this.active?.id === 'primosa') {
      await ui.dialog(N, [`Nog ${g.followers.length - g.followersJoined()} bezoekers te gaan. Ze staan als paarse punten op de kaart!`]);
      return;
    }
    const a = await ui.dialog(N, [
      'Welkom in de Primosa! Een glazen piramide, net als die in Parijs. Gebouwd voor 9,5 miljoen gulden, hè.',
      'Vandaag opent onze tentoonstelling, met ons topstuk: de Mona Liesje. Bijna een echte. Kijk maar eens door het glas.',
      'Alleen... er komt geen hond op af. Kun jij vijf kunstliefhebbers uit de buurt halen? Dan kan de opening beginnen.',
    ], ['Ik haal bezoekers!', 'Kunst is niks voor mij']);
    if (a !== 0) { await ui.dialog(N, ['Dat zei de rest van Gulpen ook. Daarom staat het hier zo leeg.']); return; }
    if (g.mode === 'car') g.exitCar();
    g.setMode('walk');
    const n = 5;
    g.startPolonaise(n, {
      minD: 30, maxD: 150, color: '#b39ddb', glyph: 'K',
      factory: (i) => (i === 0 ? makeDog() : makeCharacter({ shirt: [0x6a1b9a, 0x37474f, 0xad1457, 0x00695c][i % 4], pants: 0x263238, hair: [0x9e9e9e, 0x3e2723, 0xe6c770, 0x111111][i % 4], glasses: i % 2 === 0, female: i % 2 === 1, hairStyle: i % 2 ? 'long' : undefined })),
      joinLines: ['Kunst? Gratis? Ik kom!', 'Is er ook koffie?', 'Mona wie?', 'Als het maar binnen is, het regent zo.', 'Woef!'],
    });
    this.setActive('primosa', 'Kunst in de piramide', 'Haal de kunstliefhebbers op (paarse punten op de kaart): loop naar ze toe, dan lopen ze mee. Breng ze naar de piramide. Te voet!', `0 / ${n} bezoekers`);
    this.active.followerWord = 'bezoekers';
    const entrance = g.facades.primosa.entrance;
    g.setDestination(entrance, 300, async () => {
      g.stopPolonaise();
      await ui.dialog(N, [
        'Bezoekers! Echte bezoekers! En... een hond. Er kwam geen hond op af, zeiden ze. Nou, eentje dan.',
        'Dames en heren, ik presenteer u: de Mona Liesje!',
      ]);
      await ui.dialog('De bezoekers', [
        '"Die glimlach is scheef."',
        '"Mijn neefje schildert beter, en die is zes."',
        '"Wat is hij waard? Niks? Dan hang ik hem boven de bank."',
        '"Woef."',
      ]);
      await ui.dialog(N, [
        'Niks waard... Dat zeiden ze over de hele piramide ook.',
        'Hij is gebouwd voor 9,5 miljoen gulden. Er werden kunsttentoonstellingen georganiseerd, maar er kwam geen hond op af.',
        'Later is de piramide geveild, voor 260.000 gulden. En weet je aan wie?',
        'Aan de man die eerder 250.000 gulden kreeg, omdat zijn schuur op de plek stond waar de piramide moest komen. Voor tienduizend gulden meer had hij een piramide in plaats van een schuur!',
      ]);
      const b = await ui.dialog(N, ['Enfin. Wil jij de Mona Liesje kopen? Voor een appel en een ei.'], ['Een appel', 'Een ei', 'Een appel én een ei']);
      await ui.dialog(N, [b === 0 ? 'Een appel? Verkocht! Dan houd ik het ei voor de volgende veiling.' : b === 1 ? 'Een ei? Verkocht! De appel bewaar ik voor de boer met de schuur.' : 'Allebei?! Jij bent de beste koper die we ooit hebben gehad. Verkocht!']);
      this.complete('primosa', 'Kunstkenner van de Primosa!');
    }, (msg) => { g.stopPolonaise(); this.fail(msg || 'De opening is voorbij. Weer niemand gekomen.'); }, {
      require: () => (g.followersJoined() >= n ? null : `Je hebt pas ${g.followersJoined()} van de ${n} bezoekers.`),
      violate: () => (g.mode !== 'walk' ? 'Met kunstliefhebbers ga je te voet!' : null),
    });
  },

  // ------------------------------------------------------------ de Romeinse weg (Oude Akerweg)
  async archeoloog(npc, N, ui, g) {
    const a = await ui.dialog(N, [
      'Wist je dat je hier op een Romeinse weg staat? De Oude Akerweg was de weg van Maastricht naar Aken.',
      'Bij Gulpen kruisten twee belangrijke Romeinse wegen elkaar. Toen ze tussen 1920 en 1925 de tramlijn aanlegden, vonden ze veel Romeinse voorwerpen, en zelfs de fundamenten van een Romeins gebouw.',
      'Ik denk dat hier nog meer ligt. Help je graven? Vijf vondsten met zestien scheppen. De detector piept: een getal zegt hoeveel er in de vakjes eromheen ligt. En pas op voor de waterleiding!',
    ], ['Geef mij een schep!', 'Ik heb geen zin in vieze handen']);
    if (a !== 0) { await ui.dialog(N, ['De Romeinen hadden ook geen zin, maar die bouwden wel even een weg naar Aken.']); return; }
    if (g.mode === 'car') g.exitCar();
    g.setMode('walk');
    this.setActive('romeinen', 'De Romeinse weg', 'Graaf vijf Romeinse vondsten op met zestien scheppen. Getallen tellen de vondsten in de vakjes eromheen.', '0 / 5 vondsten');
    const r = await startOpgraving(g, { digs: 16, need: 5 });
    if (!r || this.active?.id !== 'romeinen') return;
    if (r.ok) {
      await ui.dialog(N, [
        G('Doa velt mig de boks van aaf! Vijf vondsten!', 'Daar sta ik versteld van! Vijf vondsten!'),
        'Munten, scherven, een mantelspeld... Tweeduizend jaar geleden liep hier een Romein met zijn spullen van Maastricht naar Aken, en die verloor onderweg van alles.',
        'Alles gaat naar het museum, met jouw naam op het bordje. Nou ja, in kleine letters.',
      ]);
      this.complete('romeinen', 'Romeinse schatgraver!', { v: r.used, unit: 'scheppen', high: false });
    } else {
      await ui.dialog(N, ['Geen scheppen meer... De rest ligt er al tweeduizend jaar, die kan nog wel even wachten. Probeer het later nog eens!']);
      this.fail('Niet genoeg Romeinse vondsten.');
    }
  },

  // ------------------------------------------------------------ Restaurant Atelier
  async chef(npc, N, ui, g) {
    const a = await ui.dialog(N, [
      'Bonsoir! Welkom bij Restaurant Atelier. Vanavond zitten we helemaal vol.',
      'En mijn souschef? Ziek. Uitgerekend vandaag.',
      'Een bord is bij ons een schilderij. Ik maak elk bord één keer voor, jij onthoudt waar alles ligt en legt het precies zo na. Drie gangen. Lukt dat?',
    ], ['Ik sta klaar met het pincet', 'Ik eet liever friet']);
    if (a !== 0) { await ui.dialog(N, ['Friet... Bij Zheng, hè. Prima. Maar hier niet zeggen, de gasten schrikken ervan.']); return; }
    if (g.mode === 'car') g.exitCar();
    g.setMode('walk');
    this.setActive('atelier', 'Een bord is een schilderij', 'Onthoud hoe de chef het bord opmaakt en leg alles daarna op dezelfde plek. Drie gangen, gemiddeld minstens 60 procent.', 'Gang 1 / 3');
    const r = await startBord(g, { show: 4, need: 0.6 });
    if (!r || this.active?.id !== 'atelier') return;
    const pct = Math.round((r.scores.reduce((s, x) => s + x, 0) / r.scores.length) * 100);
    if (r.ok) {
      await ui.dialog(N, [
        pct >= 85 ? `${pct} procent! Formidable! Jij mag zo bij mij in de keuken beginnen.` : `${pct} procent. Niet helemaal mijn schilderij, maar de gasten zien het verschil niet. Denk ik.`,
        'Tafel zeven vroeg al wie dat prachtige dessert had gemaakt. Ik heb gezegd dat ik het was. Sorry.',
      ]);
      this.complete('atelier', 'Chef van de Markt!', { v: pct, unit: '% precies', high: true });
    } else {
      await ui.dialog(N, [`${pct} procent... Dat is geen schilderij, dat is een ongelukje. Kom nog eens terug, dan oefenen we.`]);
      this.fail('De borden gingen terug naar de keuken.');
    }
  },

  // ------------------------------------------------------------ de Gulpener Bierfeesten met Feestkabinet
  async voorzitter(npc, N, ui, g) {
    const MC = 'MC van Feestkabinet';
    // het feest is 's avonds: overdag eerst een pilsje bij De Zwarte Ruiter, dan wordt het vanzelf avond
    if (!(g.night > 0.5)) {
      await ui.dialog(N, [
        'Goeiedag! Ik ben de voorzitter van de Gulpener Bierfeesten. Vanavond is het grootste feest van het jaar, hier op de Markt.',
        'Maar overdag is er nog niks te beleven. Ga eerst maar een pilsje drinken bij De Zwarte Ruiter. Als het avond is, kom je terug, dan begint het feest!',
      ]);
      return;
    }
    const a = await ui.dialog(N, [
      'Enne? Klaar voor de Gulpener Bierfeesten? Het grootste feest van het jaar, hier op de Markt!',
      'Het podium staat bij Mezzaluna, Feestkabinet staat klaar: de DJ draait en de MC zweept iedereen op. De discolampen gaan zo aan.',
      'Maar als voorzitter heb ik een probleem: de tappers zijn kwijt, en een Bierfeest zonder bier... Ga jij achter de bar? Tien goede Gulpeners, dan laat ik de MC je naam door de boxen roepen!',
    ], ['Ik tap!', 'Ik drink liever mee']);
    if (a !== 0) { await ui.dialog(N, ['Meedrinken kan pas als iemand tapt, hè! Kom maar terug als je dorst krijgt.']); return; }
    if (g.mode === 'car') g.exitCar();
    g.setMode('walk');
    this.setActive('bierfeesten', 'Tappen op de Bierfeesten', 'Houd ingedrukt om te tappen en laat los als het bier precies bij de streep staat, met een kraag van twee vingers schuim. Let op: de tap sputtert en het schuim verschilt per glas. Tien goede biertjes!', '0 / 10 biertjes');
    let feest = null;
    const upd = (dt) => feest?.update(dt);
    const restore = () => {
      g.updaters.delete(upd);
      feest?.remove(); feest = null;
      g.pov = null;
      g.sfx?.stopMusic();
    };
    this.active.cleanup = restore;
    await g.fade(async () => {
      feest = buildBierfeest(g);
      if (!feest) return;
      g.updaters.add(upd);
      const b = feest.barSpot;
      if (b) {
        g.player.x = b.x; g.player.z = b.z; g.player.heading = b.heading;
        // camera net voor de bar, wat hoger, met zicht op het podium en het feestvolk
        const sx = feest.stage[0], sz = feest.stage[1];
        const [fx, fz] = b.front;
        const dx = sx - fx, dz = sz - fz, d = Math.hypot(dx, dz) || 1;
        const cx = fx - (dx / d) * 2, cz = fz - (dz / d) * 2;
        g.pov = { pos: new THREE.Vector3(cx, g.world.groundAt(cx, cz) + 3.6, cz), look: new THREE.Vector3(sx, feest.stageY + 2.6, sz), snap: true };
      }
      g.sfx?.startMusic();
    });
    if (this.active?.id !== 'bierfeesten' || !feest) { restore(); return; }
    const r = await startTappen(g, { need: 10, maxFails: 3, limit: 75, mcLines: ['Handjes in de lucht!', 'Gullepe, zijn jullie er klaar voor?!', 'Wie heeft er dorst?!', 'Applaus voor de tapper!', 'Feestkabinet in the house!', 'Nog één rondje!'] });
    if (!r || this.active?.id !== 'bierfeesten') return;
    if (r.ok) {
      g.sfx?.play('cheer');
      await ui.dialog(MC, [
        'GULLEPE! Een daverend applaus voor onze tapper!',
        'Tien Gulpeners, en niemand heeft droog gestaan. De DJ draait de volgende plaat speciaal voor jou!',
      ]);
      await ui.dialog(N, ['Namens het bestuur van de Gulpener Bierfeesten: bedankt! Volgend jaar sta jij op het rooster, hoor.']);
      await g.fade(async () => restore());
      this.active.cleanup = null;
      this.complete('bierfeesten', 'Held van de Bierfeesten!');
    } else {
      await ui.dialog(N, [r.fails >= 3 ? 'Ai, de halve Markt staat in het schuim. Ik haal even een dweil.' : 'De rij bij de bar staat tot aan de kerk! Volgend jaar beter.']);
      await g.fade(async () => restore());
      this.active.cleanup = null;
      this.fail('Te weinig biertjes getapt.');
    }
  },

  // ------------------------------------------------------------ de korenwolf
  async bioloog(npc, N, ui, g) {
    const w = g.world;
    const a = await ui.dialog(N, [
      'Psst! Zachtjes. Ik ben op zoek naar de korenwolf, een wilde hamster die in de velden rond Gulpen leefde.',
      'Of hij er nog zit? Dat weet eigenlijk niemand zeker. De ene zegt van wel, de andere van niet.',
      'Ik heb drie wildcamera\'s. Hang jij ze op bij de gele punten in het veld? Daarna kijken we samen de nachtfoto\'s na.',
    ], ['Ik hang ze op!', 'Een hamster? Die zit gewoon bij de dierenwinkel']);
    if (a !== 0) { await ui.dialog(N, ['Dat is een goudhamster. Een korenwolf is een stuk wilder. En groter. En hij bijt.']); return; }
    const field = this.korenField;
    // drie plekjes in het veld, een stukje uit elkaar
    const spots = [];
    for (let tries = 0; tries < 200 && spots.length < 3; tries++) {
      const x = field.center[0] + (Math.random() - 0.5) * 60, z = field.center[1] + (Math.random() - 0.5) * 60;
      const c = w.classAt(x, z);
      if ((c !== 'akker' && c !== 'gras') || w.insideBuilding(x, z) || w.blocked(x, z)) continue;
      if (spots.some((s) => Math.hypot(s[0] - x, s[1] - z) < 15)) continue;
      spots.push([x, z]);
    }
    if (spots.length < 3) spots.push(...[[field.center[0], field.center[1]], [field.center[0] + 12, field.center[1]], [field.center[0], field.center[1] + 12]].slice(0, 3 - spots.length));
    this.setActive('korenwolf', 'Zit de korenwolf er nog?', 'Loop naar de gele punten in het veld en hang daar een wildcamera op.', '0 / 3 camera\'s');
    const placed = [];
    const restore = () => { placed.forEach((o) => g.scene.remove(o)); g.collectibles.forEach((c) => c.cleanup?.()); g.collectibles = []; };
    this.active.cleanup = restore;
    let hung = 0;
    g.player.lockedFor = false; // het gesprek zette je vast; nu moet je het veld in kunnen lopen
    await new Promise((resolve) => {
      for (const [x, z] of spots) {
        const post = new THREE.Group();
        post.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.2, 6), new THREE.MeshStandardMaterial({ color: 0x6d4c41 })));
        post.children[0].position.y = 0.6;
        const cam = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.16), new THREE.MeshStandardMaterial({ color: 0x33691e }));
        cam.position.y = 1.05; post.add(cam);
        post.position.set(x, w.groundAt(x, z), z);
        const ghost = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.06, 6, 20), new THREE.MeshBasicMaterial({ color: 0xf2c14e }));
        ghost.rotation.x = Math.PI / 2; ghost.position.set(x, w.groundAt(x, z) + 0.2, z);
        g.scene.add(ghost);
        const item = {
          pos: ghost.position, mesh: ghost, color: '#f2c14e', glyph: 'C',
          cleanup: () => g.scene.remove(ghost),
          onCollect: () => {
            item.cleanup();
            g.collectibles = g.collectibles.filter((k) => k !== item);
            g.scene.add(post); placed.push(post);
            hung++;
            g.ui.toast(`Camera ${hung} hangt!`, 1200);
            this.progress(`${hung} / 3 camera's`);
            if (hung >= 3) resolve();
          },
        };
        g.collectibles.push(item);
      }
    });
    if (this.active?.id !== 'korenwolf') return;
    await g.fade(async () => { g.ui.toast('De volgende ochtend...', 2200); });
    if (this.active?.id !== 'korenwolf') return;
    await ui.dialog(N, ['(aan de telefoon) Goeiemorgen! Ik heb de foto\'s binnen. Kijk mee: tik op "Korenwolf!" als je er een ziet. Bruine rug, zwarte buik, witte vlekjes. Niet roepen bij een konijn!']);
    if (this.active?.id !== 'korenwolf') return;
    this.progress('Foto\'s nakijken');
    const r = await startWildcamera(g, { photos: 18, wolves: 2, maxFalse: 3 });
    if (!r || this.active?.id !== 'korenwolf') return;
    restore(); this.active.cleanup = null;
    if (r.ok) {
      await ui.dialog(N, [
        'Twee keer een korenwolf op de foto! Hij zit er dus nog!',
        'Al zegt de buurman dat het zijn ontsnapte cavia is. Dus... zit hij er nou wel of niet? We zullen het nooit helemaal zeker weten.',
      ]);
      this.complete('korenwolf', 'Korenwolfspeurder!');
    } else {
      await ui.dialog(N, [r.wrong >= 3 ? 'Een merel is geen korenwolf, en een konijn ook niet! Nog maar eens kijken.' : 'Niks herkend... Dus zit hij er nou wel of niet? Niemand weet het. Precies zoals altijd. Probeer het nog eens!']);
      this.fail('Geen korenwolf herkend.');
    }
  },

  // ------------------------------------------------------------ Gulpen van bovenaf (drone)
  async dronepiloot(npc, N, ui, g) {
    const a = await ui.dialog(N, [
      'Hé! Ik maak luchtbeelden voor een nieuw filmpje van de VVV: Gulpen van bovenaf.',
      'Alleen trillen mijn handen vandaag als een rietje. Kun jij de drone besturen? Ik heb een route uitgezet met lichtringen: over de Markt, laag over de Gulp, langs de brouwerij, over de glazen piramide, langs Mosaqua en de kerktoren.',
      'Bij de gouden ringen maakt de drone een foto. Pas op voor windvlagen, en vlieg niet tegen de gevels, dan is de batterij zo leeg.',
    ], ['Geef mij de afstandsbediening!', 'Ik heb hoogtevrees']);
    if (a !== 0) { await ui.dialog(N, ['Hoogtevrees? Jij blijft gewoon met je voeten op de grond staan, hoor. Alleen de drone vliegt.']); return; }
    if (g.mode === 'car') g.exitCar();
    g.setMode('walk');
    this.setActive('drone', 'Gulpen van bovenaf', 'Vlieg door alle lichtringen voordat de batterij leeg is. Draaien met links/rechts, stijgen en dalen met omhoog/omlaag. De gouden ringen maken een foto.', '0 ringen');
    const r = await startDrone(g, { limit: 160 });
    if (!r || this.active?.id !== 'drone') return;
    if (r.ok) {
      await ui.dialog(N, [
        r.photos >= 3 ? 'Wat een plaatjes! De piramide, de kerktoren en de Markt van bovenaf. Dit wordt het mooiste filmpje dat de VVV ooit heeft gehad.' : 'Alle ringen gehaald! Een paar foto\'s zijn mislukt, maar de beelden zijn prachtig.',
        'Volgende keer mag je hem ook laten landen. Op het dak van De Zwarte Ruiter, dan krijgen we vast een pilsje.',
      ]);
      this.complete('drone', 'Dronepiloot van Gulpen!');
    } else {
      await ui.dialog(N, [`Batterij leeg na ${r.rings} van de ${r.total} ringen. Hij hangt nu ergens in een boom bij de Gulp... Grapje, hij is vanzelf teruggevlogen. Nog een keer?`]);
      this.fail('De batterij van de drone was leeg.');
    }
  },

  // ------------------------------------------------------------ leerlooiers en forellen
  async kweker(npc, N, ui, g) {
    const a = await ui.dialog(N, [
      'Hoor je dat water? Al dat stromende zoete water van de Gulp: daarom zaten hier vroeger leerlooiers, bierbrouwers en forellenkwekers.',
      'De Gulpener Bierbrouwerij is in 1825 begonnen. En ik? Ik kweek nog steeds forellen.',
      'Er komt zo een bestelling van acht grote forellen. Help je scheppen? Alleen de grote, de kleintjes moeten nog groeien.',
    ], ['Geef mij het net!', 'Ik eet geen vis']);
    if (a !== 0) { await ui.dialog(N, ['Geen vis? Dan maar een frikandel bij An + Piet. Ieder zijn smaak.']); return; }
    if (g.mode === 'car') g.exitCar();
    g.setMode('walk');
    this.setActive('forellen', 'Forellen scheppen', 'Schep acht grote forellen uit de kweekvijver. Kleintjes laten zwemmen: drie keer fout en je bent af.', '0 / 8 forellen');
    const r = await startForellen(g, { need: 8, maxSmall: 3, limit: 55 });
    if (!r || this.active?.id !== 'forellen') return;
    if (r.ok) {
      await ui.dialog(N, [
        r.small === 0 ? 'Acht joekels en geen enkel kleintje! Jij hebt een kwekersoog.' : 'Acht grote forellen, de bestelling is compleet. Die paar kleintjes zet ik wel terug.',
        'Vroeger waren hier leerlooiers, nu sta jij hier met een schepnet. Zo gaat dat met de geschiedenis.',
      ]);
      this.complete('forellen', 'Forellenschepper van de Gulp!');
    } else {
      await ui.dialog(N, [r.small >= 3 ? 'Zoveel kleintjes! Die moeten eerst nog een jaartje groeien. Kom straks nog eens.' : 'De klant staat te wachten en de bak is nog half leeg. Probeer het nog eens!']);
      this.fail('Bestelling niet compleet.');
    }
  },
};

if (typeof location !== 'undefined' && location.search.includes('dev')) window.__gesch = { findField, makeDog };
