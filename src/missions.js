// Missies en interacties. Alles staat tegelijk open: kies zelf wat je wanneer doet.
//
// Echte personen laten we weg: in de zaken staan verzonnen rollen ("de monteur", "de kok").
// De Nachtburgemeester en de man bij het Mariabeeld zijn verzonnen figuren.

import * as THREE from 'three';
import { makeCharacter, makeKeg } from './character.js';

const SAVE_KEY = 'gulpe-missies-v2';

export class Missions {
  constructor(game) {
    this.g = game;
    this.npcs = {};
    this.active = null;
    this.done = new Set();
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) JSON.parse(raw).forEach((id) => this.done.add(id));
    } catch { /* geen opslag beschikbaar */ }
  }

  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify([...this.done])); } catch { /* negeren */ }
  }

  // ------------------------------------------------------------ opzet

  setup() {
    const g = this.g;
    const poi = (id) => g.world.meta.pois.find((p) => p.id === id);
    const spotFor = (id, out = 2.4) => {
      const f = g.facades.frames[id];
      if (f) {
        const x = f.x + f.nx * out, z = f.z + f.nz * out;
        return g.world.resolve(x, z, 0.5);
      }
      return g.world.spotNear(...poi(id).pos);
    };

    const add = (key, name, spot, look) => (this.npcs[key] = g.addNpc(name, spot, makeCharacter(look)));
    add('monteur', 'De monteur', spotFor('jefabels'), { shirt: 0x2b2b2b, pants: 0x2b3a4a, apron: 0x5a3b22, hair: 0x2a2a2a, hat: 'cap', hatColor: 0xff9800 });
    add('frituur', 'Achter de toonbank', spotFor('anpiet'), { shirt: 0xffffff, pants: 0x333333, apron: 0xd32f2f, hair: 0x7a5230, hat: 'chef' });
    add('salma', 'De kok van Salma', spotFor('salma'), { shirt: 0xffffff, pants: 0x222222, apron: 0x2e7d32, hair: 0x1a1a1a });
    add('zheng', 'Achter de toonbank', spotFor('zheng'), { shirt: 0xffffff, pants: 0x222222, apron: 0xb71c1c, hair: 0x111111 });
    add('concierge', 'De conciërge', spotFor('sophianum'), { shirt: 0x546e7a, pants: 0x37474f, hair: 0x9e9e9e });
    add('brouwer', 'De brouwer', spotFor('brouwerij'), { shirt: 0x0f5132, pants: 0x2e2e2e, apron: 0x8d6e63, hair: 0x5d4037 });
    add('waard', 'De waard', spotFor('zwarteruiter'), { shirt: 0x111111, pants: 0x222222, apron: 0xf5f5f5, hair: 0x3e2723 });

    // trainer bij het voetbalveld
    const pitch = g.facades.pitch;
    const [tx, tz] = pitch ? g.facades.pitchToWorld(pitch.W / 2 + 2, pitch.L / 2 - 18) : poi('fcgulpen').pos;
    add('trainer', 'De trainer van FC Gulpen', g.world.resolve(tx, tz, 0.5), { shirt: 0x1a237e, pants: 0x1a237e, hair: 0x6d4c41, hat: 'cap', hatColor: 0xc62828 });

    // man in lange jas bij het Mariabeeld
    const [mx, mz] = poi('mariabeeld').pos;
    add('jas', 'Man in lange jas', g.world.resolve(mx + 5, mz + 4, 0.5), { shirt: 0x2a2a2a, pants: 0x1a1a1a, hair: 0x111111, hat: 'cap', hatColor: 0x111111, coat: 0x3a3226 });

    // skater bij de Ringweg
    this.racePath = g.world.streetPath('Ringweg');
    if (this.racePath.length) {
      const r = poi('ringweg').pos;
      const d0 = Math.hypot(this.racePath[0][0] - r[0], this.racePath[0][1] - r[1]);
      const d1 = Math.hypot(this.racePath.at(-1)[0] - r[0], this.racePath.at(-1)[1] - r[1]);
      if (d1 < d0) this.racePath.reverse();
      add('skater', 'Skater', g.world.resolve(this.racePath[0][0] + 3, this.racePath[0][1] + 3, 0.5),
        { shirt: 0x8e24aa, pants: 0x1a1a1a, hair: 0xffca28, hat: 'cap', hatColor: 0x111111 });
    }

    // Nachtburgemeester: alleen 's avonds bij de Markt
    add('nacht', 'De Nachtburgemeester', g.world.spotNear(14, 18),
      { shirt: 0x1a1a40, pants: 0x101020, hair: 0xdddddd, hat: 'tophat', chain: true, sash: 0xc62828 });

    Object.values(this.npcs).forEach((n) => { n.active = true; });
    this.refresh();
  }

  // Lijst voor de grote kaart en de markeringen.
  list() {
    const g = this.g;
    const n = this.npcs;
    const items = [
      { id: 'fiets', npc: n.monteur, title: 'Lekke band', place: 'Jef Abels Bikes', desc: 'Laat je fiets maken. Daarna kun je overal fietsen.' },
      { id: 'frikandel', npc: n.frituur, title: 'Frikandel speciaal', place: 'Friture An + Piet', desc: 'Alleen contant! Zoek eerst wat muntgeld bij elkaar.' },
      { id: 'salma', npc: n.salma, title: 'Bezorgen voor Salma', place: 'Grillroom Pizzeria Salma', desc: 'Bezorg drie bestellingen op tijd. Beloning: een Broodje Gulpen.' },
      { id: 'zheng', npc: n.zheng, title: 'Friet bij Zheng', place: 'Cafetaria Zheng', desc: 'Een patatje halen. Maar met welke saus?' },
      { id: 'skateboard', npc: n.concierge, title: 'In beslag genomen', place: 'Sophianum', desc: 'Haal je skateboard op bij de conciërge. Eerst een overhoring.' },
      { id: 'race', npc: n.skater, title: 'Ringweg Race', place: 'Ringweg', desc: 'Skatewedstrijd over de Ringweg. Je hebt je skateboard nodig.' },
      { id: 'vat', npc: n.brouwer, title: 'Vers van \'t vat', place: 'Gulpener Bierbrouwerij', desc: 'Breng een vat naar Herberg De Zwarte Ruiter.' },
      { id: 'pils', npc: n.waard, title: 'Pilsje', place: 'Herberg De Zwarte Ruiter', desc: 'Een pilsje op het terras. Daarna wordt het avond (of weer ochtend).', repeat: true },
      { id: 'penalty', npc: n.trainer, title: 'Penalty\'s bij FC Gulpen', place: 'Sportpark FC Gulpen', desc: 'Scoor er minstens 3 van de 5.' },
      { id: 'deal', npc: n.jas, title: 'Een schimmig zaakje', place: 'Mariabeeld, Gulperberg', desc: 'Iemand op de Gulperberg heeft een pakketje. Niet te veel vragen stellen.' },
      { id: 'nacht', npc: n.nacht, title: 'De Nachtburgemeester', place: 'Markt (alleen \'s avonds)', desc: 'De Nachtburgemeester is iets kwijt.', nightOnly: true },
    ].filter((m) => m.npc);
    for (const m of items) m.state = this.active?.id === m.id ? 'actief' : this.done.has(m.id) && !m.repeat ? 'klaar' : 'open';
    void g;
    return items;
  }

  refresh() {
    const g = this.g;
    const night = g.night > 0.5;
    this.npcs.nacht.group.visible = night;
    this.npcs.nacht.enabled = night;
    if (this.active) {
      g.ui.setQuest(this.active.title, this.active.desc, this.active.progress || '');
    } else {
      const open = this.list().filter((m) => m.state === 'open' && (!m.nightOnly || night)).length;
      g.ui.setQuest('Vrij rondlopen', `Er staan ${open} klussen open. Tik op de kaart om ze te zien, of loop naar een gele markering.`, `${this.done.size} klussen gedaan`);
    }
    g.updateMarkers();
  }

  setActive(id, title, desc, progress = '') {
    this.active = { id, title, desc, progress };
    this.refresh();
  }

  progress(text) {
    if (this.active) this.active.progress = text;
    this.g.ui.setProgress(text);
  }

  complete(id, toast) {
    this.done.add(id);
    this.save();
    this.active = null;
    this.g.setTarget(null);
    this.g.ui.toast(toast || 'Klus geklaard!', 3000);
    this.refresh();
  }

  fail(text) {
    this.active = null;
    this.g.setTarget(null);
    this.g.collectibles = [];
    this.g.clearDestination();
    this.g.ui.toast(text, 3200);
    this.refresh();
  }

  // ------------------------------------------------------------ praten

  async talk(npc) {
    const g = this.g, ui = g.ui, N = npc.name, n = this.npcs;
    g.player.lockedFor = true;
    npc.lookAtPlayer = true;
    try {
      // bezig met een andere klus?
      const missionOf = { monteur: 'fiets', frituur: 'frikandel', salma: 'salma', zheng: 'zheng', concierge: 'skateboard', skater: 'race', brouwer: 'vat', waard: 'pils', trainer: 'penalty', jas: 'deal', nacht: 'nacht' };
      const key = Object.keys(n).find((k) => n[k] === npc);
      const mid = missionOf[key];
      const deliverKeg = key === 'waard' && this.active?.id === 'vat';
      const ownActive = this.active?.id === mid;
      if (this.active && !ownActive && !deliverKeg) {
        const a = await ui.dialog(N, [`Je bent nog bezig met "${this.active.title}". Wil je daarmee stoppen?`], ['Nee, ik ga verder', 'Ja, stoppen']);
        if (a !== 1) return;
        this.abort();
      }
      await this.handlers[key]?.call(this, npc, N, ui, g);
    } finally {
      g.player.lockedFor = false;
      npc.lookAtPlayer = false;
    }
  }

  abort() {
    const g = this.g;
    if (this.active?.id === 'vat') g.dropKeg();
    if (g.race) g.endRace(false, true);
    if (g.penalty) g.penalty.stop();
    g.collectibles.forEach((c) => c.cleanup?.());
    g.collectibles = [];
    g.clearDestination();
    g.setTarget(null);
    this.active = null;
    this.refresh();
  }

  handlers = {
    async monteur(npc, N, ui, g) {
      if (g.vehicles.bike) {
        await ui.dialog(N, ['Rijdt hij lekker? Kom gerust terug als er iets is. Die Gulperberg vraagt wat van je banden!']);
        return;
      }
      await ui.dialog(N, [
        'Hoi! Laat eens kijken... Ja hoor, dat is een flinke lekke band.',
        'Die Gulperberg op en af met zachte banden, dat houdt geen band lang vol.',
        'Momentje... plakken, oppompen... klaar! Hij rijdt weer als een zonnetje.',
      ]);
      g.unlockVehicle('bike');
      await ui.dialog('Tip', [g.input.isTouch ? 'Tik op de knop "Fiets" om op te stappen.' : 'Druk op F om op je fiets te stappen.']);
      this.complete('fiets', 'Fiets gerepareerd!');
    },

    async frituur(npc, N, ui, g) {
      if (this.active?.id === 'frikandel' && this.active.coinsDone) {
        await ui.dialog(N, ['Ah, met gepast geld zelfs. Mooi zo!', 'Eén frikandel speciaal: curry, mayo en uitjes. Smakelijk!']);
        g.player.boost = 60;
        this.complete('frikandel', 'Frikandel speciaal! Je kunt een minuut lang sprinten.');
        return;
      }
      if (this.active?.id === 'frikandel') {
        await ui.dialog(N, ['Nog geen muntgeld gevonden? Kijk eens rond in de buurt.']);
        return;
      }
      await ui.dialog(N, [
        'Goeiendag! Wat mag het zijn?',
        { name: 'Jij', text: 'Een frikandel speciaal graag. Kan ik pinnen?' },
        'Pinnen? Nee hoor, hier is het alleen contant. Al sinds jaar en dag!',
      ]);
      this.setActive('frikandel', 'Alleen contant', 'Zoek losse munten in de buurt. Volg de gele lichtbundels.', '0 / 4 munten');
      this.spawnCoins();
    },

    async salma(npc, N, ui, g) {
      if (this.active?.id === 'salma') {
        await ui.dialog(N, ['Schiet op, de bestelling wordt koud!']);
        return;
      }
      const a = await ui.dialog(N, [
        'Hé, kun jij me helpen? Mijn bezorger is ziek en de bestellingen stapelen zich op.',
        'Drie adressen, elk binnen de tijd. Pak gerust een auto of je fiets. Doe je mee?',
      ], ['Ik ga ervoor', 'Nu even niet']);
      if (a !== 0) return;
      this.setActive('salma', 'Bezorgen voor Salma', 'Breng de bestelling naar het adres. Volg de lichtbundel.', 'Bestelling 1 / 3');
      this.deliveries('salma', 3, async () => {
        await ui.dialog(N, ['Top gedaan! Hier, een Broodje Gulpen van het huis: döner, kaas en pittige saus.']);
        this.complete('salma', 'Broodje Gulpen verdiend!');
      });
    },

    async zheng(npc, N, ui, g) {
      const a = await ui.dialog(N, ['Hallo! Wat mag het zijn?'], ['Patat met mayo', 'Patatje oorlog', 'Patat speciaal', 'Gewoon zonder']);
      const reply = [
        'Patat met mayo, de klassieker. Komt eraan!',
        'Patatje oorlog: mayo, pindasaus en uitjes. Jij durft!',
        'Speciaal: mayo, curry en uitjes. Goede keuze.',
        'Zonder saus? Echt? Nou, jij je zin.',
      ][a];
      await ui.dialog(N, [reply, 'Alsjeblieft, vers uit het vet. Smakelijk eten!']);
      g.player.boost = 30;
      this.complete('zheng', 'Friet bij Zheng!');
    },

    async concierge(npc, N, ui, g) {
      if (g.vehicles.skate) {
        await ui.dialog(N, ['Je hebt je skateboard toch al? Niet op het schoolplein hè!']);
        return;
      }
      await ui.dialog(N, [
        'Zo, kom je je skateboard ophalen? Op het schoolplein wordt niet geskatet, dat weet je.',
        'Goed, je krijgt hem terug. Maar eerst een overhoring. Je zit tenslotte op het Sophianum!',
      ]);
      const qs = [
        ['Hoe hoog is de top van de Gulperberg ongeveer?', ['157 meter', '322 meter', '96 meter'], 0],
        ['In welke rivier stroomt de Gulp uit, net ten noorden van het dorp?', ['De Maas', 'De Geul', 'De Worm'], 1],
        ['Sinds wanneer wordt er bier gebrouwen door de Gulpener brouwerij?', ['1925', '1875', '1825'], 2],
      ];
      for (const [q, opts, good] of qs) {
        let ok = false;
        while (!ok) {
          ok = (await ui.dialog(N, [q], opts)) === good;
          if (!ok) await ui.dialog(N, ['Fout! Denk nog maar eens goed na.']);
        }
        await ui.dialog(N, ['Goed zo.']);
      }
      await ui.dialog(N, ['Netjes, alles goed. Hier is je skateboard. En niet op het schoolplein!']);
      g.unlockVehicle('skate');
      this.complete('skateboard', 'Skateboard terug!');
    },

    async skater(npc, N, ui, g) {
      if (!g.vehicles.skate) {
        await ui.dialog(N, ['Zonder skateboard ga je het niet redden, maat. Volgens mij ligt die van jou nog bij de conciërge van het Sophianum.']);
        return;
      }
      const a = await ui.dialog(N, [
        'Hé, nieuw gezicht op de Ringweg! Wij skaten hier elke zaterdag.',
        'Eén keer de hele Ringweg over, langs alle checkpoints. Durf je?',
      ], ['Kom maar op!', 'Straks misschien']);
      if (a !== 0) return;
      this.setActive('race', 'Ringweg Race', 'Haal alle checkpoints en wees sneller dan de skater.');
      await g.startRace(this.racePath, npc, (won) => {
        if (won) this.complete('race', 'Gewonnen! Koning van de Ringweg!');
        else this.fail('Net te langzaam. Praat met de skater voor een revanche.');
      });
    },

    async brouwer(npc, N, ui, g) {
      if (this.active?.id === 'vat') {
        await ui.dialog(N, ['Dat vat moet naar de Zwarte Ruiter op de Markt. Lopen hè, niet fietsen!']);
        return;
      }
      await ui.dialog(N, [
        'Een vat voor de Zwarte Ruiter? Komt goed.',
        'Hier wordt al sinds 1825 gebrouwen. Deze zomer is de brouwerij helemaal overgenomen door Grolsch, zeggen ze.',
        'Maar wat er in dit vat zit, wordt nog steeds gewoon hier in Gulpen gebrouwen.',
        'Pas op, hij is zwaar. Fietsen, skaten of rijden gaat niet met zo\'n vat. Lopen dus!',
      ]);
      g.carryKeg(makeKeg());
      this.setActive('vat', 'Vers van \'t vat', 'Breng het vat naar Herberg De Zwarte Ruiter op de Markt.');
      g.setTarget(this.npcs.waard);
    },

    async waard(npc, N, ui, g) {
      if (this.active?.id === 'vat' && g.keg) {
        await ui.dialog(N, ['Daar is ie! Precies op tijd, de tap was bijna droog.', 'Dat verdient een pilsje van de zaak. Proost!']);
        g.dropKeg();
        await g.drinkPils();
        this.complete('vat', 'Vat bezorgd!');
        return;
      }
      const night = g.night > 0.5;
      const a = await ui.dialog(N, [night ? 'Nog eentje dan? Daarna gaan we sluiten hoor.' : 'Goeiemiddag! Zin in een pilsje op het terras?'],
        [night ? 'Nog eentje (tot morgenochtend)' : 'Graag, een pilsje!', 'Nee, dank je']);
      if (a !== 0) return;
      await g.drinkPils();
      await ui.dialog(N, ['Proost! Op Gulpen!']);
      await g.skipTime(night ? 9.5 : 22.5);
      this.done.add('pils');
      this.save();
      this.refresh();
    },

    async trainer(npc, N, ui, g) {
      const a = await ui.dialog(N, [
        'Hé! Wij zoeken nog een penaltyspecialist voor het eerste elftal.',
        'Vijf penalty\'s. Scoor er minstens drie en je mag zaterdag meedoen. Klaar?',
      ], ['Ik ben er klaar voor', 'Een andere keer']);
      if (a !== 0) return;
      this.setActive('penalty', 'Penalty\'s bij FC Gulpen', g.input.isTouch ? 'Tik op "Schiet" als het mikpunt goed staat.' : 'Druk op E of spatie als het mikpunt goed staat.', '0 / 5');
      const goals = await g.startPenalty();
      if (goals >= 3) {
        await ui.dialog(N, [`${goals} van de 5! Jij staat zaterdag in de basis.`]);
        this.complete('penalty', 'Penaltyspecialist van FC Gulpen!');
      } else {
        await ui.dialog(N, [`${goals} van de 5... Dat moet beter. Kom maar terug als je getraind hebt.`]);
        this.fail('Niet genoeg gescoord.');
      }
    },

    async jas(npc, N, ui, g) {
      if (this.active?.id === 'deal') {
        await ui.dialog(N, ['Wat sta je hier nog? Wegwezen met dat pakketje!']);
        return;
      }
      const a = await ui.dialog(N, [
        'Psst. Jij daar. Niet zo opvallend kijken.',
        'Ik heb hier een pakketje dat zo snel mogelijk naar een adres in het dorp moet. Geen vragen.',
        'Je hebt niet veel tijd. Doe je het?',
      ], ['Oké, geef maar', 'Nee, dat zit me niet lekker']);
      if (a !== 0) { await ui.dialog(N, ['Dan heb je mij nooit gezien.']); return; }
      this.setActive('deal', 'Een schimmig zaakje', 'Breng het pakketje snel naar het adres. Niet treuzelen!', 'Pakketje 1 / 1');
      this.deliveries('deal', 1, async () => {
        await ui.dialog('Bij de deur', [
          'Ah, eindelijk! Laat eens kijken...',
          'Perfect. Een verse kersenvlaai, precies op tijd voor de verjaardag van oma. Bedankt!',
        ]);
        this.complete('deal', 'Het was... vlaai.');
      }, 0.85);
    },

    async nacht(npc, N, ui, g) {
      if (this.active?.id === 'nacht' && this.active.found) {
        await ui.dialog(N, ['Mijn keten! Je bent een held.', 'Hierbij benoem ik jou tot Ere-Nachtburgemeester van Gulpen!']);
        this.complete('nacht', 'Ere-Nachtburgemeester van Gulpen!');
        return;
      }
      if (this.active?.id === 'nacht') {
        await ui.dialog(N, ['Al iets gevonden? Hij moet ergens bij een bruggetje over de Gulp liggen.']);
        return;
      }
      await ui.dialog(N, [
        'Goedenavond! Ik ben de Nachtburgemeester van Gulpen. Als de echte burgemeester slaapt, waak ik over het dorp.',
        'Maar ik ben mijn ambtsketen kwijt! Zonder keten neemt niemand me serieus.',
        'Ik had hem nog bij een bruggetje over de Gulp. Wil je helpen zoeken?',
      ]);
      this.setActive('nacht', 'De ambtsketen', 'Zoek de ambtsketen bij een bruggetje over de Gulp.');
      this.spawnChain();
    },
  };

  // ------------------------------------------------------------ onderdelen

  spawnCoins() {
    const g = this.g;
    const center = g.world.meta.pois.find((p) => p.id === 'anpiet').pos;
    const cands = g.world.segments.filter(([, ax, az]) => {
      const d = Math.hypot(ax - center[0], az - center[1]);
      return d > 50 && d < 260;
    });
    const picked = [];
    for (let i = 0; picked.length < 4 && i < 400; i++) {
      const s = cands[(i * 37 + Math.floor(Math.random() * 50)) % cands.length];
      if (!s) break;
      const x = (s[1] + s[3]) / 2, z = (s[2] + s[4]) / 2;
      if (picked.some(([px, pz]) => Math.hypot(px - x, pz - z) < 60)) continue;
      if (g.world.insideBuilding(x, z) || g.world.blocked(x, z)) continue;
      picked.push([x, z]);
    }
    const geo = new THREE.CylinderGeometry(0.35, 0.35, 0.08, 24);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0xf2c14e, metalness: 0.9, roughness: 0.25, emissive: 0x6b4d00, emissiveIntensity: 0.5 });
    let count = 0;
    g.collectibles = picked.map(([x, z]) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, g.world.groundAt(x, z) + 1, z);
      g.scene.add(m);
      const beam = g.makeBeam(x, z, 0xf2c14e);
      const c = {
        pos: m.position, mesh: m,
        cleanup: () => g.scene.remove(m, beam),
        onCollect: () => {
          c.cleanup();
          g.collectibles = g.collectibles.filter((k) => k !== c);
          count++;
          this.progress(`${count} / 4 munten`);
          g.ui.toast(['Een euro!', 'Nog een euro!', '50 cent... telt ook!', 'Genoeg!'][count - 1], 1500);
          if (count >= 4) {
            this.active.coinsDone = true;
            this.active.desc = 'Genoeg muntgeld. Terug naar Friture An + Piet!';
            this.refresh();
            g.setTarget(this.npcs.frituur);
          }
        },
      };
      return c;
    });
  }

  spawnChain() {
    const g = this.g;
    const bridges = g.world.ground.polys
      .filter(([cls]) => g.world.ground.classes[cls] === 'brug')
      .map(([, rings]) => {
        const r = rings[0];
        let sx = 0, sz = 0;
        for (let i = 0; i < r.length; i += 2) { sx += r[i]; sz += r[i + 1]; }
        return [sx / (r.length / 2), sz / (r.length / 2)];
      })
      .filter(([x, z]) => Math.hypot(x, z) > 80 && Math.hypot(x, z) < 450);
    const [x, z] = bridges[Math.floor(Math.random() * bridges.length)] || [120, -60];
    const chain = new THREE.Mesh(
      new THREE.TorusGeometry(0.35, 0.06, 8, 28),
      new THREE.MeshStandardMaterial({ color: 0xf2c14e, metalness: 1, roughness: 0.2, emissive: 0x7a5a00, emissiveIntensity: 0.8 }),
    );
    chain.position.set(x, g.world.groundAt(x, z) + 1, z);
    g.scene.add(chain);
    const beam = g.makeBeam(x, z, 0xf2c14e);
    g.collectibles = [{
      pos: chain.position, mesh: chain, cleanup: () => g.scene.remove(chain, beam),
      onCollect: () => {
        g.scene.remove(chain, beam);
        g.collectibles = [];
        this.active.found = true;
        this.active.desc = 'Gevonden! Breng de keten terug naar de Nachtburgemeester.';
        this.refresh();
        g.ui.toast('De ambtsketen!');
        g.setTarget(this.npcs.nacht);
      },
    }];
  }

  // Een reeks bezorgingen naar willekeurige huizen, elk met een tijdslimiet.
  deliveries(id, count, onDone, timeFactor = 1) {
    const g = this.g;
    let i = 0;
    const next = () => {
      if (this.active?.id !== id) return;
      if (i >= count) { onDone(); return; }
      const dest = g.randomAddress(220, 650);
      const dist = Math.hypot(dest[0] - g.player.x, dest[1] - g.player.z);
      const limit = Math.round((dist / 6 + 25) * timeFactor);
      if (count > 1) this.progress(`Bestelling ${i + 1} / ${count}`);
      g.setDestination(dest, limit, () => { i++; g.ui.toast(i < count ? 'Bezorgd! Op naar de volgende.' : 'Bezorgd!', 1800); next(); },
        () => this.fail('Te laat! De klant heeft afgezegd.'));
    };
    next();
  }
}
