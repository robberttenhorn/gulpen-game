// Nieuwe missies: muizen bij Bakkerij Pijls, tuutjes trekken bij de DA, bommetje in Mosaqua,
// gyros bij Athene, onderhandelen bij Plan Keukens en het (verzonnen) matras van Gulpen.
// Hier mag de humor wat grover. Alle personen zijn verzonnen rollen.
import * as THREE from 'three';
import { makeCharacter } from './character.js';
import { makePuntzak } from './props.js';
import { startMice, startTuutjes, startBommetje, startGyros, startStamp, startDoors } from './skills2.js';
import './interiors2.js';

const G = (text, nl) => ({ text, nl });

// NPC's neerzetten (aangeroepen vanuit Missions.setup)
export function setupMore(m, g, add) {
  const fr = g.facades.frames;
  const spot = (id, out = 2.6, side = 0) => {
    const f = fr[id];
    if (!f) return null;
    return g.world.resolve(f.x + f.nx * out + f.ux * side, f.z + f.nz * out + f.uz * side, 0.5);
  };
  const s = (id, ...a) => spot(id, ...a);
  if (s('pijls')) add('pijls', 'Bakkersgezel van Pijls', s('pijls', 2.6, 1.5), { shirt: 0xffffff, pants: 0x9e9e9e, apron: 0xf3e6c8, hair: 0x6d4c41, hat: 'chef' });
  if (s('automaat')) add('tuutjes', 'Zenuwachtige jongen', s('automaat', 2.4, -1.2), { shirt: 0x7cb342, pants: 0x283593, hair: 0xd7b56d, hat: 'cap', hatColor: 0x212121 });
  if (s('mosaqua')) add('badmeester', 'De badmeester', s('mosaqua', 3), { shirt: 0xd32f2f, pants: 0xfafafa, hair: 0x5d4037, sleeves: 'short' });
  if (s('athene')) add('athene', 'De kok van Athene', s('athene', 2.4, -1), { shirt: 0xffffff, pants: 0x0d47a1, apron: 0xffffff, hair: 0x111111, beard: true });
  if (s('plankeukens')) add('verkoper', 'Keukenverkoper', s('plankeukens', 2.6), { shirt: 0xeceff1, pants: 0x263238, hair: 0x3e2723, coat: 0x37474f, glasses: true });
  if (s('gemeentehuis')) {
    add('portier', 'Portier van het gemeentehuis', s('gemeentehuis', 3, -2), { shirt: 0x37474f, pants: 0x263238, hair: 0x9e9e9e, coat: 0x1b2430 });
    // het matras ligt al weken voor de deur
    const f = fr.gemeentehuis;
    const [mx, mz] = g.world.resolve(f.x + f.nx * 4 + f.ux * 2.5, f.z + f.nz * 4 + f.uz * 2.5, 1.2);
    const mat = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.22, 2.0, 4, 1, 4), new THREE.MeshStandardMaterial({ color: 0xece4d4, roughness: 0.95 }));
    body.position.y = 0.11;
    mat.add(body);
    // vlekken (beter niet vragen)
    for (const [x, z, sc] of [[0.3, 0.2, 0.35], [-0.4, -0.5, 0.22], [0.1, -0.7, 0.15]]) {
      const v = new THREE.Mesh(new THREE.CircleGeometry(sc, 14), new THREE.MeshStandardMaterial({ color: 0xc8b48a, roughness: 1 }));
      v.rotation.x = -Math.PI / 2;
      v.position.set(x, 0.225, z);
      mat.add(v);
    }
    mat.position.set(mx, g.world.groundAt(mx, mz), mz);
    mat.rotation.y = Math.random() * 6.28;
    mat.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.scene.add(mat);
    m.matras = mat;
  }
}

// Lijst voor de grote kaart
export function moreItems(n) {
  return [
    { id: 'muizen', npc: n.pijls, title: 'Muizen in de bakkerij', place: 'Bakkerij Pijls, Rijksweg 57', desc: 'Vang alle muizen in de bakkerij voordat de keuring komt.' },
    { id: 'tuutjes', npc: n.tuutjes, title: 'Tuutjes trekken', place: 'Condoomautomaat naast de DA', desc: 'Haal een pakje uit de automaat zonder dat het halve dorp het ziet.' },
    { id: 'bommetje', npc: n.badmeester, title: 'Het grootste bommetje', place: 'Mosaqua, Landsraderweg 11', desc: 'Drie sprongen vanaf de plank. Maak de grootste bom en laat de jury juichen.' },
    { id: 'gyros', npc: n.athene, title: 'Gyros en Opa!', place: 'Grieks Restaurant Athene, Rijksweg 31', desc: 'Snijd de gyros op het juiste moment en gooi daarna borden kapot.' },
    { id: 'keuken', npc: n.verkoper, title: 'De deurtjes van de Gulperberg Deluxe', place: 'Plan Keukens, Rijksweg 21', desc: 'Tijdens een demo springen de keukendeurtjes steeds open. Klap ze dicht voordat ze eraf vallen.' },
    { id: 'matras', npc: n.portier, title: 'Het matras van Gulpen', place: 'Gemeentehuis, Willem Vliegenstraat 12', desc: 'Al weken ligt er een matras voor het gemeentehuis. Vind het loket dat erover gaat.' },
  ].filter((x) => x.npc);
}

export const MORE_MISSION_OF = { pijls: 'muizen', tuutjes: 'tuutjes', badmeester: 'bommetje', athene: 'gyros', verkoper: 'keuken', portier: 'matras' };

// Gesprekken en verloop
export const moreHandlers = {
  // ------------------------------------------------------------ Bakkerij Pijls: muizen
  async pijls(npc, N, ui, g) {
    const a = await ui.dialog(N, [
      'Help! Over een kwartier komt de keuring en er rennen muizen door de bakkerij!',
      'Als ze een muizenkeutel in het krentenbrood vinden, noemen we het voortaan maar "krentenbrood met extra krenten".',
      'Vang ze allemaal. Gewoon er bovenop springen, ze zijn sneller dan je denkt. Doe je mee?',
    ], ['Ik ben de muizenmepper', 'Ik ben bang voor muizen']);
    if (a !== 0) { await ui.dialog(N, ['Bang voor muizen? Jij bent een grotere bangerik dan een vlaai zonder bodem.']); return; }
    this.setActive('muizen', 'Muizen in de bakkerij', 'Ren de muizen achterna en spring erbovenop. Binnen 60 seconden!', '0 / 6 muizen');
    const room = g.interiors.room('pijls');
    await g.enterInterior(room);
    if (this.active?.id !== 'muizen') return;
    const r = await startMice(g, room);
    if (!r || this.active?.id !== 'muizen') return;
    if (r.caught >= r.n) {
      await ui.dialog(N, [`Allemaal! In ${Math.round(r.time)} seconden. Jij bent beter dan elke kat in Gulpen.`, 'De keuring kan komen. Hier, een stuk vlaai. Zonder extra krenten, beloofd.']);
      if (g.interior) await g.exitInterior();
      this.complete('muizen', 'Muizenvanger van Pijls!');
    } else {
      await ui.dialog(N, [`${r.caught} van de ${r.n}... De rest zit nu waarschijnlijk in de rijstevlaai. Probeer het nog eens!`]);
      this.fail('Nog muizen in de bakkerij.');
    }
  },

  // ------------------------------------------------------------ DA: tuutjes trekken
  async tuutjes(npc, N, ui, g) {
    const a = await ui.dialog(N, [
      'Psst... Hé. Kun jij iets voor me doen? Vanavond komt mijn vriendin langs en ik eh... heb niks in huis.',
      'Die automaat daar. Maar het hele dorp loopt hier langs! Mijn tante, de buurvrouw, de juf van vroeger...',
      G('Tuutjes trekke, joa. Doe jij het?', 'Condooms halen, ja. Doe jij het?'),
    ], ['Geef dat muntje maar', 'Regel het zelf maar, held']);
    if (a !== 0) { await ui.dialog(N, ['Dan wordt het vanavond Monopoly. Weer.']); return; }
    this.setActive('tuutjes', 'Tuutjes trekken', 'Draai aan de knop van de automaat, maar stop als er iemand kijkt!', 'Schaamte: 0 / 3');
    const f = g.facades.frames.automaat;
    if (f) { g.player.x = f.x + f.nx * 0.9; g.player.z = f.z + f.nz * 0.9; g.player.heading = Math.atan2(-f.nx, -f.nz); }
    const r = await startTuutjes(g);
    if (!r || this.active?.id !== 'tuutjes') return;
    if (r.ok) {
      await ui.dialog(N, [
        r.shame ? `Gelukt! Al heeft ${r.shame === 1 ? 'iemand' : 'het halve dorp'} je gezien. Morgen weet heel Gulpen het. Bedankt, hè.` : 'Gelukt, en niemand heeft iets gezien! Jij bent een ninja.',
        '...Extra groot? Je bent wel een optimist, zeg. Nou ja. Dank je!',
      ]);
      this.complete('tuutjes', 'Tuutjes getrokken!');
    } else {
      await ui.dialog(N, ['Iedereen heeft je gezien. Jij staat morgen in de Gulp en Geul. Laat maar, ik ga wel naar Maastricht.']);
      this.fail('Te vaak betrapt.');
    }
  },

  // ------------------------------------------------------------ Mosaqua: bommetje
  async badmeester(npc, N, ui, g) {
    const a = await ui.dialog(N, [
      'Welkom in Mosaqua! Volgens het nieuws gaat het bad na 32 jaar dicht, dus dit is je kans voor een legendarische bom.',
      'Drie sprongen. Tik voor de sprong als de balk vol is, en maak in de lucht een bommetje. De jury geeft punten.',
      'En niet in het water plassen. Ik zie alles. Nou ja, bijna alles.',
    ], ['Zwembroek aan, ik ga!', 'Ik ben net gegeten']);
    if (a !== 0) { await ui.dialog(N, ['Net gegeten? Die regel van een half uur is een fabeltje. Maar goed, jij je zin.']); return; }
    this.setActive('bommetje', 'Het grootste bommetje', 'Drie sprongen. Kracht kiezen, dan in de lucht op tijd tikken voor een bommetje. Haal samen 21 punten.', 'Sprong 1 / 3');
    const room = g.interiors.room('zwembad');
    await g.enterInterior(room);
    if (this.active?.id !== 'bommetje') return;
    const r = await startBommetje(g, room);
    if (!r || this.active?.id !== 'bommetje') return;
    const tot = r.total.toFixed(1).replace('.', ',');
    if (r.total >= 21) {
      await ui.dialog(N, [`${tot} punten! De jury is doorweekt, de badmeester is doorweekt, en er zit minder water in het bad dan in de kantine.`, 'Die bom hoort in het Mosaqua-museum. Als dat er ooit komt.']);
      if (g.interior) await g.exitInterior();
      this.complete('bommetje', 'Bommenkoning van Mosaqua!');
    } else {
      await ui.dialog(N, [`${tot} punten. Dat was meer een theezakje dan een bom. Nog een keer?`]);
      this.fail('Te kleine bommetjes.');
    }
  },

  // ------------------------------------------------------------ Athene: gyros
  async athene(npc, N, ui, g) {
    const a = await ui.dialog(N, [
      'Kalimera! Mijn hulpkok is ziek. Te veel ouzo, zegt hij. Te veel ouzo bestaat niet, zeg ik.',
      'Jij snijdt de gyros. Alleen als het vlees goudbruin bij het mes is, anders krijgen de gasten rauwe lappen.',
      'En als het lukt, gooien we borden kapot. Opa! Dat is hier gewoon traditie, de afwasmachine is toch stuk.',
    ], ['Opa! Geef dat mes', 'Ik ben vegetariër']);
    if (a !== 0) { await ui.dialog(N, ['Vegetariër? Dan krijg jij een bord met tzatziki. Met extra knoflook. Je vriendin slaapt vannacht toch op de bank.']); return; }
    this.setActive('gyros', 'Gyros en Opa!', 'Snijd zes goede plakjes gyros en gooi daarna zo veel mogelijk borden kapot.', '');
    const r = await startGyros(g);
    if (!r || this.active?.id !== 'gyros') return;
    if (r.ok) {
      await ui.dialog(N, [`${r.good} perfecte plakjes en ${r.plates} kapotte borden! Opa!`, 'Hier, een gyrosschotel van het huis. Met zoveel knoflook dat de vampiers van Valkenburg tot Vaals uit je buurt blijven.']);
      await g.eat(makePuntzak(), 3);
      this.complete('gyros', 'Gyrosmeester van Athene!');
    } else {
      await ui.dialog(N, ['Rauw, aangebrand, rauw... De gasten bestellen nu een pizza. Bij de concurrent. Probeer het nog eens.']);
      this.fail('Te weinig goede plakjes.');
    }
  },

  // ------------------------------------------------------------ Plan Keukens: de deurtjes van de Gulperberg Deluxe
  async verkoper(npc, N, ui, g) {
    const a = await ui.dialog(N, [
      'Goedemiddag! Help! Over een minuut komt er een klant voor een demo van onze topper: de Gulperberg Deluxe. 24.999 euro.',
      'Klein probleempje: de deurtjes. Die springen open zodra iemand kijkt. En als ze te lang openstaan, vallen ze eraf.',
      'Jij staat erbij en klapt ze dicht. BAM. Niemand merkt iets. Lukt het, dan krijg jij er ook eentje met korting. Mét deurtjes.',
    ], ['Ik hou ze dicht!', 'Ik koop wel een magnetron']);
    if (a !== 0) { await ui.dialog(N, ['Een magnetron. Natuurlijk. En dan klagen dat je frikandellen slap zijn.']); return; }
    this.setActive('keuken', 'De deurtjes van de Gulperberg Deluxe', 'Klap openspringende deurtjes dicht voordat ze eraf vallen. Hou het 35 seconden vol, je mag er maximaal 2 verliezen.', '');
    const r = await startDoors(g);
    if (!r || this.active?.id !== 'keuken') return;
    if (r.ok) {
      await ui.dialog(N, [
        `${r.slammed} keer dichtgeklapt en de klant heeft niks gemerkt! Ze vond het "lekker stevig sluiten". Verkocht!`,
        r.lost ? `Dat ene deurtje dat eraf viel? Dat noemen we vanaf nu "open design". Kost 400 euro extra.` : 'Zonder één deurtje te verliezen. Jij mag hier zo beginnen.',
        'Jouw korting: 60 procent. Montage duurt maar zes tot veertien weken. Of zestien.',
      ]);
      this.complete('keuken', 'Keuken met korting (en deurtjes)!');
    } else {
      await ui.dialog(N, ['Drie deurtjes op de grond, en de klant is gillend weggerend. Ze koopt nu een keuken in Maastricht. Zonder deurtjes, uit wraak.']);
      this.fail('Te veel deurtjes eraf.');
    }
  },

  // ------------------------------------------------------------ gemeentehuis: het matras van Gulpen (verzonnen)
  async portier(npc, N, ui, g) {
    const a = await ui.dialog(N, [
      'Ziet u dat matras? Dat ligt hier al drie weken. Niemand weet wie het is, niemand weet van wie het is.',
      'De gemeenteraad heeft er al twee vergaderingen over gehad. Uitkomst: een werkgroep. De werkgroep vergadert volgend jaar.',
      'Wilt u binnen even uitzoeken welk loket erover gaat? Ze sturen u wel van het kastje naar de muur. Binnen twee minuten, voor de lunchpauze.',
    ], ['Ik regel het', 'Ik heb ook een leven']);
    if (a !== 0) { await ui.dialog(N, ['Een leven? Bij de gemeente? Dat is ook een loket, maar daar zit nooit iemand.']); return; }
    this.setActive('matras', 'Het matras van Gulpen', 'Ga binnen langs de loketten. Elk loket stuurt je door. Vind wie erover gaat, binnen twee minuten.', 'Loket: ?');
    const room = g.interiors.room('gemeentehuis');
    const chain = [
      ['Afval', 'Een matras? Dat is grofvuil, maar het ligt op de stoep. Stoep is Wegen. Volgende!'],
      ['Wegen', 'Ligt het óp de stoep of ernaast? Ernaast? Dan is het Openbare Orde. Daar, met die snor.'],
      ['Openbare Orde', 'Heeft iemand erop geslapen? Dan is het geen afval maar een woning. Dat is Cultuur. Hè, nee, dat is... ach, ga maar naar Cultuur.'],
      ['Cultuur', 'Hm. Het heeft wel iets. Kunst, zou ik zeggen. Maar kunst moet ingeschreven worden. Burgerzaken!'],
      ['Burgerzaken', null],
    ];
    let step = 0;
    const wrongLines = ['Daar gaan wij niet over. Neem een nummertje.', 'Matrassen? Hier? Nee. Wij doen alleen hondenbelasting en ruzies over heggen.', 'Momentje... koffiepauze. Nee, ik weet het niet. Probeer een ander loket.'];
    let resolveRun;
    const done = new Promise((r) => { resolveRun = r; });
    const t0 = performance.now();
    const timer = setInterval(() => {
      if (this.active?.id !== 'matras') { clearInterval(timer); resolveRun(null); return; }
      const left = 120 - (performance.now() - t0) / 1000;
      g.ui.timer(`${Math.max(0, Math.ceil(left))} s`);
      if (left <= 0) { clearInterval(timer); resolveRun({ ok: false, late: true }); }
    }, 250);
    this.active.cleanup = () => { clearInterval(timer); g.ui.timer(null); };
    const triggers = Object.entries(room.loketten).map(([name, p]) => ({
      x: p.x, z: p.z, r: 1.4, label: `Loket ${name}`,
      action: async () => {
        if (this.active?.id !== 'matras') return;
        g.player.lockedFor = true;
        const [want, line] = chain[step];
        if (name !== want) {
          await ui.dialog(`Loket ${name}`, [wrongLines[Math.floor(Math.random() * wrongLines.length)]]);
        } else if (line) {
          await ui.dialog(`Loket ${name}`, [line]);
          step++;
          this.progress(`Loket: ${chain[step][0]}?`);
        } else {
          // laatste loket: officieel stempelen
          await ui.dialog('Loket Burgerzaken', ['Een matras inschrijven? Natuurlijk. Formulier M-38b. Stempel erop, dan is het officieel.']);
          const st = await startStamp(g, 'Formulier M-38b');
          if (!st) { resolveRun(null); return; }
          if (!st.ok) { await ui.dialog('Loket Burgerzaken', ['Scheef gestempeld. Ongeldig. Nog een keer. En niet voordringen.']); g.player.lockedFor = false; return; }
          clearInterval(timer);
          resolveRun({ ok: true });
        }
        g.player.lockedFor = false;
      },
    }));
    await g.enterInterior(room, { triggers });
    const r = await done;
    if (!r || this.active?.id !== 'matras') return;
    room.activeTriggers = [];
    if (r.ok) {
      if (g.interior) await g.exitInterior();
      await ui.dialog(N, [
        'Ingeschreven! Het matras is nu officieel gemeentelijk eigendom. Met een eigen BSN.',
        'Dus nu mag het blijven liggen. Het is vanaf vandaag het eerste openbare springkussen van Gulpen-Wittem!',
        'Wat? Nee, ik ga er niet op springen. Ik weet wat er op die vlekken zit.',
      ]);
      if (this.matras) g.fx?.confetti(this.matras.position.x, this.matras.position.y + 1.5, this.matras.position.z, 160);
      this.complete('matras', 'Het matras van Gulpen is officieel!');
    } else {
      await ui.dialog(N, ['Lunchpauze. Het loket is dicht tot morgen. Of overmorgen. Het matras ligt er dan nog wel, hoor.']);
      this.fail('Te laat: lunchpauze.');
    }
  },
};
void makeCharacter;
