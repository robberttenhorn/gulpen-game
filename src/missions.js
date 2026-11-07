// Missies en interacties. Alles staat tegelijk open: kies zelf wat je wanneer doet.
//
// Echte personen laten we weg: in de zaken staan verzonnen rollen ("de monteur", "de kok").
// De Nachtburgemeester en de man bij het Mariabeeld zijn verzonnen figuren.

import * as THREE from 'three';
import { makeCharacter, makeKeg } from './character.js';

const SAVE_KEY = 'gulpe-missies-v2';

// Gulpense zin met Nederlandse vertaling. De Gulpense woorden komen uit de woordenlijst Gulpens
// van mijnwoordenboek.nl (door bezoekers samengesteld). Laat ze nakijken door een Gulpenaar.
const G = (text, nl) => ({ text, nl });

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

    // wielrenner onderaan de Gulperberg
    const climb = g.world.streetPath('Gulperbergweg');
    if (climb.length > 1) {
      const h0 = g.world.heightAt(...climb[0]), h1 = g.world.heightAt(...climb.at(-1));
      const foot = h0 < h1 ? climb[0] : climb.at(-1);
      add('wielrenner', 'Wielrenner', g.world.resolve(foot[0] + 3, foot[1] + 2, 0.5),
        { shirt: 0xfdd835, pants: 0x111111, hair: 0x5d4037, hat: 'helmet', hatColor: 0xe53935 });
    }
    // boer bij de tractor
    if (g.farm) add('boer', 'De boer', g.world.resolve(g.farm.x, g.farm.z, 0.5), { shirt: 0x2e5d8a, pants: 0x2b3a4a, hair: 0x8d6e63, hat: 'cap', hatColor: 0x2e7d32, shoes: 0x3e2723 });
    // visser aan de Gulp
    if (g.fishing) add('visser', 'Visser', g.world.resolve(g.fishing.x + 1.4, g.fishing.z + 1.4, 0.4), { shirt: 0x556b2f, pants: 0x3e3e30, hair: 0xbdbdbd, hat: 'cap', hatColor: 0x556b2f });
    // carnavalsvierder op de Markt
    add('carnaval', 'Carnavalsvierder', g.world.spotNear(28, -6), { shirt: 0xe53935, pants: 0xfdd835, hair: 0x1e88e5, hat: 'tophat', sash: 0x43a047 });
    // organisator van de Nacht van Gulpen (alleen 's avonds)
    add('organisator', 'Organisator Nacht van Gulpen', g.world.spotNear(-14, 34), { shirt: 0xff9800, pants: 0x263238, hair: 0x4e342e, coat: 0xff9800 });

    // opa op een bankje bij de Markt
    const benches = (g.world.objects.furniture || []).filter((f) => f[0] === 'bank')
      .map(([, x, z]) => [x, z, Math.hypot(x, z)]).filter((b) => b[2] < 160).sort((a, b) => a[2] - b[2]);
    const bench = benches[0] || [10, 10];
    add('opa', 'Opa op het benkske', g.world.resolve(bench[0] + 1.2, bench[1] + 0.6, 0.4), { shirt: 0x6d5c4b, pants: 0x4a4a4a, hair: 0xe0e0e0, hat: 'cap', hatColor: 0x3e3e3e });

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
      { id: 'plat', npc: n.opa, title: 'Plat kalle', place: 'Benkske bij de Markt', desc: 'Opa overhoort je in het Gulpens. Weet jij wat de woorden betekenen?' },
      { id: 'gulperberg', npc: n.wielrenner, title: 'Gulperberg op!', place: 'Voet van de Gulperberg', desc: 'Fiets zo snel mogelijk naar het Mariabeeld op de top.' },
      { id: 'gerst', npc: n.boer, title: 'Gerst voor de brouwerij', place: 'Boerenland aan de rand van het dorp', desc: 'Rij met de tractor een lading gerst naar de Gulpener brouwerij.' },
      { id: 'vissen', npc: n.visser, title: 'Vissen in de Gulp', place: 'Oever van de Gulp', desc: 'Vang drie vissen. Tik pas als de dobber onder gaat.' },
      { id: 'polonaise', npc: n.carnaval, title: 'Polonaise door Gulpe', place: 'Markt', desc: 'Verzamel feestgangers voor de Vastelaovesfinale op de Markt.' },
      { id: 'nachtvangulpen', npc: n.organisator, title: 'Nacht van Gulpen', place: 'Bij de Markt (alleen \'s avonds)', desc: 'Een proefrondje wandelen langs de stempelposten.', nightOnly: true },
    ].filter((m) => m.npc);
    for (const m of items) m.state = this.active?.id === m.id ? 'actief' : this.done.has(m.id) && !m.repeat ? 'klaar' : 'open';
    void g;
    return items;
  }

  refresh() {
    const g = this.g;
    const night = g.night > 0.5;
    for (const k of ['nacht', 'organisator']) {
      this.npcs[k].group.visible = night;
      this.npcs[k].enabled = night;
    }
    if (this.active) {
      g.ui.setQuest(this.active.title, this.active.desc, this.active.progress || '');
    } else {
      const open = this.list().filter((m) => m.state === 'open' && (!m.nightOnly || night)).length;
      g.ui.setQuest('Vrij rondlopen', `Er staan ${open} klussen open. Tik op de kaart om ze te zien, of loop naar een gele markering.`, `${this.done.size} ${this.done.size === 1 ? 'klus' : 'klussen'} gedaan`);
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
      const missionOf = { monteur: 'fiets', frituur: 'frikandel', salma: 'salma', zheng: 'zheng', concierge: 'skateboard', skater: 'race', brouwer: 'vat', waard: 'pils', trainer: 'penalty', jas: 'deal', nacht: 'nacht', wielrenner: 'gulperberg', boer: 'gerst', visser: 'vissen', carnaval: 'polonaise', organisator: 'nachtvangulpen', opa: 'plat' };
      const key = Object.keys(n).find((k) => n[k] === npc);
      const mid = missionOf[key];
      const deliverKeg = key === 'waard' && this.active?.id === 'vat';
      const ownActive = this.active?.id === mid;
      if (this.active && !ownActive && !deliverKeg) {
        const a = await ui.dialog(N, [`Je bent nog bezig met "${this.active.title}". Wil je daarmee stoppen?`], ['Nee, ik ga verder', 'Ja, stoppen']);
        if (a !== 1) return;
        this.abort();
      }
      await (this.handlers[key] || this.extra[key])?.call(this, npc, N, ui, g);
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
    if (g.minigame) g.minigame.stop();
    g.stopPolonaise();
    if (this.grain) { this.grain.parent?.remove(this.grain); this.grain = null; }
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
        G('Joa? Ee blutsj in de fiets?', 'Ja? Een deuk in de fiets?'),
        'Laat eens kijken... Nee, geen deuk. Wel een flinke lekke band.',
        'Die Gulperberg op en af met zachte banden, dat houdt geen band lang vol.',
        'Momentje... plakken, oppompen...',
        G('Veâdig! Hea is aaf.', 'Klaar! Hij is klaar.'),
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
        G('Welkom in de frieteboet!', 'Welkom in de friture!'),
        'Wat mag het zijn?',
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
      const a = await ui.dialog(N, [G('Joa? Welkom in de frieteboet!', 'Ja? Welkom in de friture!'), 'Wat mag het zijn?'], ['Patat met mayo', 'Patatje oorlog', 'Patat speciaal', 'Gewoon zonder']);
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
        G('Neet skate bie de sjoel!', 'Niet skaten bij school!'),
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
        G('Beer? Ummer!', 'Bier? Altijd!'),
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
        await ui.dialog(N, ['Daar is ie! Precies op tijd, de tap was bijna droog.', G('Ee glaas beer va de zaak!', 'Een glas bier van de zaak!')]);
        g.dropKeg();
        await g.drinkPils();
        this.complete('vat', 'Vat bezorgd!');
        return;
      }
      const night = g.night > 0.5;
      const a = await ui.dialog(N, [night ? G('Nog ee glaas beer, braggelear?', 'Nog een glas bier, nachtbraker?') : G('Ee glaas beer op de maat?', 'Een glas bier op de markt?')],
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
        G('Psst. Hot de moel.', 'Psst. Zwijg.'),
        'Niet zo opvallend kijken. En let op de pliesie.',
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
        G('Ah, nog ee braggelear!', 'Ah, nog een nachtbraker!'),
        'Ik ben de Nachtburgemeester van Gulpen. Als de echte burgemeester slaapt, waak ik over het dorp.',
        'Maar ik ben mijn ambtsketen kwijt! Zonder keten neemt niemand me serieus.',
        'Ik had hem nog bij een bruggetje over de Gulp. Wil je helpen zoeken?',
      ]);
      this.setActive('nacht', 'De ambtsketen', 'Zoek de ambtsketen bij een bruggetje over de Gulp.');
      this.spawnChain();
    },
  };

  // ------------------------------------------------------------ nieuwe Gulpen-klussen

  extra = {
    async opa(npc, N, ui) {
      // woorden en betekenissen uit de woordenlijst Gulpens (mijnwoordenboek.nl)
      const pool = [
        ['kuusj', 'varken'], ['braggelear', 'nachtbraker'], ['frieteboet', 'friture'], ['sjtroat', 'straat'],
        ['pliesie', 'politie'], ['elbur', 'aardbei'], ['maat', 'markt'], ['knien', 'konijn'], ['sjoel', 'school'],
        ['péat', 'paard'], ['sjoepkar', 'kruiwagen'], ['pieëpul', 'vlinder'], ['huuve', 'knikkers'],
        ['moelejan', 'roddelaar'], ['behijdskriemer', 'opschepper'], ['schmiezele', 'motregenen'],
        ['kanjel', 'dakgoot'], ['toepes', 'zot'], ['trèkkar', 'bolderwagen'], ['bölke', 'snoepje'],
      ];
      const a = await ui.dialog(N, [
        'Hé jong, kom eens bij me zitten op het benkske.',
        'Spreek jij nog plat? Of is het allewiel alleen nog Hollands?',
      ], ['Natuurlijk spreek ik plat!', 'Een beetje...', 'Nee, opa']);
      void a;
      await ui.dialog(N, ['Eens kijken. Ik noem een woord, jij zegt wat het betekent. Drie van de vier goed, dan ben je een echte Gulpenaar.']);
      const qs = pool.slice().sort(() => Math.random() - 0.5).slice(0, 4);
      let good = 0;
      for (const [word, meaning] of qs) {
        const wrong = pool.filter((p) => p[1] !== meaning).sort(() => Math.random() - 0.5).slice(0, 2).map((p) => p[1]);
        const opts = [meaning, ...wrong].sort(() => Math.random() - 0.5);
        const pick = await ui.dialog(N, [`Wat is "${word}"?`], opts);
        if (opts[pick] === meaning) { good++; await ui.dialog(N, ['Joa! Goed zo.']); }
        else await ui.dialog(N, [`Nee nee. "${word}" is ${meaning}.`]);
      }
      if (good >= 3) {
        await ui.dialog(N, [`${good} van de 4! Jij bent een echte Gulpenaar.`, G('Opgedrage an alle lu i Gullepe, die hun plat nog kalle!', 'Opgedragen aan alle mensen in Gulpen die hun dialect nog spreken!')]);
        this.complete('plat', 'Plat kalle: geslaagd!');
      } else {
        await ui.dialog(N, [`${good} van de 4... Kom morgen maar weer op het benkske zitten, dan oefenen we nog wat.`]);
        this.refresh();
      }
    },

    async wielrenner(npc, N, ui, g) {
      if (!g.vehicles.bike) {
        await ui.dialog(N, ['Te voet de Gulperberg op? Dat gaat je niet lukken binnen de tijd. Laat eerst je fiets maken bij Jef Abels.']);
        return;
      }
      const a = await ui.dialog(N, [
        'Hé! De Gulperberg, dat is hier dé klim. Met steile stukken, en bovenaan een prachtig uitzicht over het Heuvelland.',
        'Mijn record naar het Mariabeeld op de top staat al jaren. Durf jij het aan, op de fiets?',
      ], ['Kom maar op!', 'Mijn benen zijn nog moe']);
      if (a !== 0) return;
      await ui.dialog(N, [G('Bis bôäve!', 'Tot boven!')]);
      if (g.mode === 'car') g.exitCar();
      g.setMode('bike');
      const p = g.world.meta.pois.find((q) => q.id === 'mariabeeld').pos;
      const dest = g.world.resolve(p[0] + 7, p[1] + 3, 0.5);
      const dist = Math.hypot(dest[0] - g.player.x, dest[1] - g.player.z);
      const limit = Math.round(dist * 1.5 / 8 + 20);
      this.setActive('gulperberg', 'Gulperberg op!', `Fiets naar het Mariabeeld op de top binnen ${limit} seconden. Alleen op de fiets!`);
      g.setDestination(dest, limit, async () => {
        await ui.dialog('Bovenop de Gulperberg', ['Wat een uitzicht! Daar ligt het hele dorp. En het record is gebroken!']);
        this.complete('gulperberg', 'Koning van de Gulperberg!');
      }, (msg) => this.fail(msg || 'Te langzaam. De wielrenner wacht beneden op een herkansing.'), {
        violate: () => (g.mode !== 'bike' ? 'Valsspelen! Dit is een fietsrit.' : null),
      });
    },

    async boer(npc, N, ui, g) {
      if (!g.tractor) return;
      const a = await ui.dialog(N, [
        'Goeiedag! De gerst is binnen. Die gaat naar de Gulpener brouwerij, daar brouwen ze er bier van.',
        'Alleen heb ik vandaag geen tijd. Wil jij de lading met de tractor naar de brouwerij brengen?',
      ], ['Ik rij wel even', 'Nee, dank je']);
      if (a !== 0) return;
      // lading gerst op de tractor
      g.cars.activate(g.tractor);
      const grain = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, 1.6), new THREE.MeshStandardMaterial({ color: 0xd9b44a, roughness: 1 }));
      grain.position.set(0, 2.25, -1.8);
      const bin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 1.8), new THREE.MeshStandardMaterial({ color: 0x8d2a1a, roughness: 0.6 }));
      bin.position.set(0, 1.85, -1.8);
      const load = new THREE.Group();
      load.add(bin, grain);
      g.tractor.mesh.add(load);
      this.grain = load;
      const f = g.facades.frames.brouwerij;
      const dest = f ? g.world.resolve(f.x + f.nx * 6, f.z + f.nz * 6, 1.2) : g.world.spotNear(...g.world.meta.pois.find((q) => q.id === 'brouwerij').pos);
      const dist = Math.hypot(dest[0] - g.tractor.x, dest[1] - g.tractor.z);
      this.setActive('gerst', 'Gerst voor de brouwerij', 'Stap in de tractor en breng de gerst naar de Gulpener brouwerij aan de Rijksweg.');
      await ui.dialog(N, [G('Neet mit de trèkkar, mit de tractor!', 'Niet met de bolderwagen, met de tractor!'), 'Hij staat hier op het land. Rustig aan door het dorp, hij gaat niet harder dan 40!']);
      g.setDestination(dest, Math.round(dist / 6 + 90), async () => {
        if (this.grain) { this.grain.parent?.remove(this.grain); this.grain = null; }
        await ui.dialog('De brouwer', ['Mooie gerst! Daar brouwen we weer een paar flinke vaten van. Dank je wel!']);
        this.complete('gerst', 'Gerst afgeleverd!');
      }, (msg) => {
        if (this.grain) { this.grain.parent?.remove(this.grain); this.grain = null; }
        this.fail(msg || 'Te laat. De brouwer is al naar huis.');
      }, { require: () => (g.mode === 'car' && g.car === g.tractor ? null : 'Kom met de tractor, de gerst zit erop!') });
    },

    async visser(npc, N, ui, g) {
      const a = await ui.dialog(N, [
        G('Ssst. Hot de moel!', 'Ssst. Zwijg!'),
        'Je jaagt de visch weg.',
        'Wil je het ook eens proberen? Wacht tot de dobber onder gaat, en dan pas ophalen.',
      ], ['Geef die hengel maar', 'Ik kijk wel even']);
      if (a !== 0) return;
      this.setActive('vissen', 'Vissen in de Gulp', g.input.isTouch ? 'Tik op "Haal op" als de dobber onder gaat.' : 'Druk op E als de dobber onder gaat.', '0 / 3 vissen');
      const caught = await g.startFishing();
      if (caught >= 3) {
        await ui.dialog(N, ['Drie stuks! Jij hebt dit vaker gedaan. Ik zet ze wel weer terug, hoor.']);
        this.complete('vissen', 'Visser van de Gulp!');
      } else {
        await ui.dialog(N, [`${caught} gevangen. Geduld is het halve werk. Probeer het straks nog eens.`]);
        this.fail('Niet genoeg vissen gevangen.');
      }
    },

    async carnaval(npc, N, ui, g) {
      if (this.active?.id === 'polonaise') {
        await ui.dialog(N, [`Nog ${g.followers.length - g.followersJoined()} feestgangers te gaan. Schiet op, de finale begint zo!`]);
        return;
      }
      const a = await ui.dialog(N, [
        G('Alaaf! Ee cramignon door Gullepe!', 'Alaaf! Achter elkaar springen op muziek door Gulpen!'),
        'De Vastelaovesfinale op de Markt begint zo, maar de helft van het gezelschap is zoek!',
        'Ze lopen verspreid door het dorp. Haal ze op en kom met een polonaise terug naar de Markt. Te voet natuurlijk!',
      ], ['Alaaf, ik ga!', 'Ik ben geen feestbeest']);
      if (a !== 0) return;
      if (g.mode === 'car') g.exitCar();
      g.setMode('walk');
      const n = g.world.isMobile ? 5 : 6;
      g.startPolonaise(n);
      this.setActive('polonaise', 'Polonaise door Gulpe', 'Loop naar de roze markeringen op de kaart. De feestgangers lopen dan achter je aan. Breng ze naar de Markt.', `0 / ${n} feestgangers`);
      const markt = g.world.spotNear(20, 0);
      g.setDestination(markt, 300, async () => {
        g.stopPolonaise();
        await ui.dialog(N, ['Daar zijn ze allemaal! Dat wordt een fantastische finale. Alaaf!']);
        this.complete('polonaise', 'Polonaise-koning van Gulpe!');
      }, (msg) => { g.stopPolonaise(); this.fail(msg || 'De finale is al begonnen zonder jullie.'); }, {
        require: () => (g.followersJoined() >= n ? null : `Je hebt pas ${g.followersJoined()} van de ${n} feestgangers.`),
        violate: () => (g.mode !== 'walk' ? 'Een polonaise doe je te voet!' : null),
      });
    },

    async organisator(npc, N, ui, g) {
      const a = await ui.dialog(N, [
        'Goedenavond! Elk jaar in juni lopen er hier honderden mensen de Nacht van Gulpen: een lange wandeltocht door de nacht.',
        'Ik test vanavond een proefrondje door het dorp. Loop jij langs de vijf stempelposten? Te voet, uiteraard.',
      ], ['Ik loop mee', 'Een andere keer']);
      if (a !== 0) return;
      await ui.dialog(N, [G('Lope, lope, lope!', 'Lopen, lopen, lopen!')]);
      if (g.mode === 'car') g.exitCar();
      g.setMode('walk');
      this.setActive('nachtvangulpen', 'Nacht van Gulpen', 'Loop naar de stempelpost. Alleen te voet!', 'Stempel 0 / 5');
      let i = 0;
      const next = () => {
        if (this.active?.id !== 'nachtvangulpen') return;
        if (i >= 5) {
          ui.dialog(N, ['Vijf stempels! Volgend jaar loop je de hele tocht mee.']).then(() => this.complete('nachtvangulpen', 'Nacht van Gulpen uitgelopen!'));
          return;
        }
        const dest = g.randomAddress(110, 260);
        const dist = Math.hypot(dest[0] - g.player.x, dest[1] - g.player.z);
        g.setDestination(dest, Math.round(dist / 4.5 + 25), () => { i++; this.progress(`Stempel ${i} / 5`); g.ui.toast('Stempel!', 1200); next(); },
          (msg) => this.fail(msg || 'Te laat bij de stempelpost.'),
          { violate: () => (g.mode !== 'walk' ? 'Dit is een wandeltocht. Lopen dus!' : null) });
      };
      next();
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
